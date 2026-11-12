/**
 * @ruaibeite/dsh-context-garden — host half.
 *
 * One job: register the `garden` session projection. Every committed session
 * event is folded into a zen garden that the browser half reads with
 * `useProjection("garden")`:
 *
 * - `tool/call` remembers callId -> name (so a later result can be classified),
 * - `tool/result` / `assistant/message` / `user/message` plant a plant
 *   (code = cactus, image = flower, error = weed, answer = bamboo,
 *   read/search = grass, user speech = sprout),
 * - `compaction/start` is the harvest: the field empties, the plants become
 *   seed currency grouped by kind, and the next messages replant the field.
 *
 * Everything is derived from the session log: no prompt, no tool, no model
 * call, no session write, no HTTP route. The same log always folds into the
 * same garden (replay-stable).
 */

/** The six plant kinds, in the stable order the UI renders them. */
export const KINDS = ['cactus', 'flower', 'weed', 'bamboo', 'grass', 'sprout']

/** Plants kept in the current field; older ones fall off the bed (still counted). */
export const FIELD_CAP = 240

/** Harvest diary rows kept on the wire. */
export const HARVEST_CAP = 24

/** tool/call callId -> name entries remembered for result classification. */
export const MAX_CALLS = 80

/** Longest plant weight: 4000 characters of context per plant at most. */
const MAX_WEIGHT = 4000

const num = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : 0)

const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value))

/** Tolerant non-negative integer for stored state. */
const toCount = (value) => {
  const n = num(value)
  return n >= 0 ? Math.floor(n) : 0
}

/** A zeroed counter object for the six kinds. */
function emptyKindCounts() {
  const counts = {}
  for (const kind of KINDS) counts[kind] = 0
  return counts
}

/** Rebuild a six-kind counter object from a stored/corrupted value. */
function parseKindCounts(value) {
  const source = value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const counts = {}
  for (const kind of KINDS) counts[kind] = toCount(source[kind])
  return counts
}

/** The `data` payload of a session event, or an empty object. */
function dataOf(event) {
  return event.data !== null && typeof event.data === 'object' && !Array.isArray(event.data) ? event.data : {}
}

/** The `message` payload of a tool/result or assistant/message event. */
function messageOf(data) {
  return data.message !== null && typeof data.message === 'object' && !Array.isArray(data.message) ? data.message : {}
}

/** Text blocks of a message content array (or a legacy string content). */
function textBlocksOf(content) {
  if (typeof content === 'string') return [content]
  if (!Array.isArray(content)) return []
  const texts = []
  for (const block of content) {
    if (block !== null && typeof block === 'object' && block.type === 'text' && typeof block.text === 'string') {
      texts.push(block.text)
    }
  }
  return texts
}

/** Total characters of text blocks; reasoning blocks do not count. */
function textLengthOf(content) {
  let total = 0
  for (const text of textBlocksOf(content)) total += text.length
  return total
}

/** Whether any block in the content is an image attachment. */
function hasImage(content) {
  if (!Array.isArray(content)) return false
  return content.some((block) => block !== null && typeof block === 'object' && block.type === 'image')
}

/** Whether the text contains a Markdown code fence (``` ), i.e. is code-heavy. */
function hasCodeFence(content) {
  return textBlocksOf(content).some((text) => text.includes('```'))
}

/**
 * Weight of a planted message: one plant per ~4 characters, clamped to 1..4000
 * so a tiny tool result still plants something and a huge paste cannot grow an
 * unbounded specimen.
 */
function weightOf(content) {
  return clamp(Math.ceil(textLengthOf(content) / 4), 1, MAX_WEIGHT)
}

/**
 * Fold one tool name into the kind of plant its result grows.
 *
 * Mapping (SPEC §4.2): code -> cactus, documents/presentation -> bamboo,
 * read/search -> grass, anything unknown -> grass. `present` is a document
 * tool, not a code tool.
 *
 * @param name - the `tool/call` name.
 * @returns one of {@link KINDS}.
 */
export function categoryOfTool(name) {
  const tool = typeof name === 'string' ? name.trim() : ''
  if (tool === '') return 'grass'
  if (/^(run_code|bash|pwsh|terminal|shell|exec|write|edit|apply_patch|str_replace|fs_write|fs_edit|notebook|jobs|job_|workflow|ralph|plugin_manager|worktree)/i.test(tool)) {
    return 'cactus'
  }
  if (/(docx|pptx|xlsx|pdf|office|document|present)/i.test(tool)) return 'bamboo'
  if (/^(read|glob|grep|ls\b|find\b|skill|session_search|session_query|session_event|workspace|todo_read|ask_user|web_search|web_fetch|fetch|browse)/i.test(tool)) {
    return 'grass'
  }
  return 'grass'
}

/**
 * Seed value of one harvested plant.
 *
 * `clamp(1 + floor(w / 800), 1, 5)` plus a species bonus: flower +2,
 * cactus +1, bamboo +1. Range 1..7. Tolerant of a malformed plant so a
 * corrupted row can never seed the economy with nonsense.
 *
 * @param plant - `{ kind, w }` (extra fields ignored).
 * @returns seed value.
 */
export function seedValue(plant) {
  const source = plant !== null && typeof plant === 'object' && !Array.isArray(plant) ? plant : {}
  const base = clamp(1 + Math.floor(num(source.w) / 800), 1, 5)
  const bonus = source.kind === 'flower' ? 2 : source.kind === 'cactus' || source.kind === 'bamboo' ? 1 : 0
  return base + bonus
}

/** Initial projection state. */
export function initGardenState() {
  return {
    planted: 0,
    counts: emptyKindCounts(),
    plants: [],
    harvests: [],
    harvestCount: 0,
    harvested: 0,
    seeds: 0,
    seedsByKind: emptyKindCounts(),
    harvestedByKind: emptyKindCounts(),
    lastHarvestAt: 0,
    lastPlantAt: 0,
    firstPlantAt: 0,
    errors: 0,
    callNames: {},
  }
}

/**
 * Plant one specimen into the field.
 *
 * @param state - current state.
 * @param kind - plant kind from {@link KINDS}.
 * @param content - message/tool-result content used for the weight.
 * @param event - the session event (for `seq`/`time`).
 * @param isError - whether this is an error tool result (feeds `errors`).
 */
function plantInto(state, kind, content, event, isError) {
  const time = num(event.time)
  const plant = { seq: toCount(event.seq), t: time, kind, w: weightOf(content) }
  const plants = [...(Array.isArray(state.plants) ? state.plants : []), plant]
  if (plants.length > FIELD_CAP) plants.splice(0, plants.length - FIELD_CAP)
  const counts = parseKindCounts(state.counts)
  counts[kind] = toCount(counts[kind]) + 1
  const firstPlantAt = toCount(state.firstPlantAt)
  return {
    ...state,
    planted: toCount(state.planted) + 1,
    counts,
    plants,
    errors: toCount(state.errors) + (isError ? 1 : 0),
    lastPlantAt: time,
    firstPlantAt: firstPlantAt === 0 ? time : firstPlantAt,
  }
}

/**
 * Harvest the current field into seed currency and the season diary.
 * An empty field still records the harvest (n = 0, seeds = 0).
 */
function harvestAt(state, event) {
  const plants = Array.isArray(state.plants) ? state.plants : []
  const counts = emptyKindCounts()
  const seedsByKind = parseKindCounts(state.seedsByKind)
  const harvestedByKind = parseKindCounts(state.harvestedByKind)
  let seeds = 0
  for (const plant of plants) {
    const kind = KINDS.includes(plant.kind) ? plant.kind : 'grass'
    const value = seedValue(plant)
    seeds += value
    counts[kind] += 1
    harvestedByKind[kind] += 1
    seedsByKind[kind] += value
  }
  const harvests = [...(Array.isArray(state.harvests) ? state.harvests : []), {
    at: num(event.time),
    seq: toCount(event.seq),
    n: plants.length,
    seeds,
    counts,
  }]
  if (harvests.length > HARVEST_CAP) harvests.splice(0, harvests.length - HARVEST_CAP)
  return {
    ...state,
    plants: [],
    harvests,
    harvestCount: toCount(state.harvestCount) + 1,
    harvested: toCount(state.harvested) + plants.length,
    seeds: toCount(state.seeds) + seeds,
    seedsByKind,
    harvestedByKind,
    lastHarvestAt: num(event.time),
  }
}

/** `tool/call`: remember callId -> name (bounded FIFO). Never plants. */
function foldToolCall(state, data) {
  const callId = typeof data.callId === 'string' ? data.callId : ''
  if (callId === '') return state
  const callNames = {}
  const previous = state.callNames !== null && typeof state.callNames === 'object' && !Array.isArray(state.callNames)
    ? state.callNames
    : {}
  for (const [key, name] of Object.entries(previous)) {
    if (key === callId || typeof name !== 'string') continue
    callNames[key] = name
  }
  callNames[callId] = typeof data.name === 'string' ? data.name : ''
  const keys = Object.keys(callNames)
  if (keys.length > MAX_CALLS) {
    for (const key of keys.slice(0, keys.length - MAX_CALLS)) delete callNames[key]
  }
  return { ...state, callNames }
}

/** `tool/result`: plant according to error / image / originating tool name. */
function foldToolResult(state, event, data) {
  const message = messageOf(data)
  const content = Array.isArray(message.content) ? message.content : []
  const callId = typeof message.toolCallId === 'string'
    ? message.toolCallId
    : typeof data.toolCallId === 'string' ? data.toolCallId : ''
  const callNames = state.callNames !== null && typeof state.callNames === 'object' ? state.callNames : {}
  const name = typeof callNames[callId] === 'string' ? callNames[callId] : ''
  const isError = message.isError === true
  const kind = isError ? 'weed' : hasImage(content) ? 'flower' : categoryOfTool(name)
  return plantInto(state, kind, content, event, isError)
}

/** `assistant/message`: only steps with real assistant text plant (not reasoning). */
function foldAssistant(state, event, data) {
  const message = messageOf(data)
  const content = Array.isArray(message.content) || typeof message.content === 'string' ? message.content : []
  const text = textBlocksOf(content).join('\n')
  if (text.trim() === '') return state
  const kind = text.includes('```') ? 'cactus' : 'bamboo'
  return plantInto(state, kind, content, event, false)
}

/** `user/message`: image -> flower, code -> cactus, otherwise a sprout. */
function foldUser(state, event, data) {
  const content = Array.isArray(data.content) || typeof data.content === 'string' ? data.content : []
  const kind = hasImage(content) ? 'flower' : hasCodeFence(content) ? 'cactus' : 'sprout'
  return plantInto(state, kind, content, event, false)
}

/**
 * Pure fold of one committed session event into the garden state.
 *
 * Returns the same reference for events it ignores (unknown types and null /
 * non-object events), which is the registry's zero-work gate. Folded events
 * rebuild the touched sub-structures, never mutate `state`.
 *
 * @param state - current projection state.
 * @param event - one committed session event.
 * @returns the next state, or `state` unchanged.
 */
export function foldGarden(state, event) {
  if (state === null || typeof state !== 'object' || Array.isArray(state)) return state
  if (event === null || typeof event !== 'object' || Array.isArray(event)) return state
  const data = dataOf(event)
  if (event.type === 'tool/call') return foldToolCall(state, data)
  if (event.type === 'tool/result') return foldToolResult(state, event, data)
  if (event.type === 'assistant/message') return foldAssistant(state, event, data)
  if (event.type === 'user/message') return foldUser(state, event, data)
  if (event.type === 'compaction/start') return harvestAt(state, event)
  return state
}

/** Rebuild a valid, capped plant list from stored/corrupted data. */
function parsePlants(value) {
  if (!Array.isArray(value)) return []
  const plants = []
  for (const item of value) {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) continue
    if (!KINDS.includes(item.kind)) continue
    plants.push({
      seq: toCount(item.seq),
      t: toCount(item.t),
      kind: item.kind,
      w: clamp(toCount(item.w), 0, MAX_WEIGHT),
    })
  }
  return plants.length > FIELD_CAP ? plants.slice(-FIELD_CAP) : plants
}

/** Rebuild a valid, capped harvest diary from stored/corrupted data. */
function parseHarvests(value) {
  if (!Array.isArray(value)) return []
  const harvests = []
  for (const item of value) {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) continue
    harvests.push({
      at: toCount(item.at),
      seq: toCount(item.seq),
      n: toCount(item.n),
      seeds: toCount(item.seeds),
      counts: parseKindCounts(item.counts),
    })
  }
  return harvests.length > HARVEST_CAP ? harvests.slice(-HARVEST_CAP) : harvests
}

/** Rebuild the callId -> name map, keeping only strings and the newest entries. */
function parseCallNames(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return {}
  const callNames = {}
  for (const [key, name] of Object.entries(value)) {
    if (key === '' || typeof name !== 'string') continue
    callNames[key] = name
  }
  const keys = Object.keys(callNames)
  if (keys.length > MAX_CALLS) {
    for (const key of keys.slice(0, keys.length - MAX_CALLS)) delete callNames[key]
  }
  return callNames
}

/**
 * Rebuild a validated state object from a stored/corrupted value.
 *
 * Must swallow `undefined`, older versions, and arbitrary garbage: numbers are
 * clamped to non-negative integers, arrays are filtered and truncated, the six
 * kind counters are filled from defaults, and missing fields get defaults.
 * Never throws.
 *
 * @param value - anything previously stored for the `garden` projection.
 * @returns a fresh, valid state object.
 */
export function parseGardenState(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return initGardenState()
  return {
    planted: toCount(value.planted),
    counts: parseKindCounts(value.counts),
    plants: parsePlants(value.plants),
    harvests: parseHarvests(value.harvests),
    harvestCount: toCount(value.harvestCount),
    harvested: toCount(value.harvested),
    seeds: toCount(value.seeds),
    seedsByKind: parseKindCounts(value.seedsByKind),
    harvestedByKind: parseKindCounts(value.harvestedByKind),
    lastHarvestAt: toCount(value.lastHarvestAt),
    lastPlantAt: toCount(value.lastPlantAt),
    firstPlantAt: toCount(value.firstPlantAt),
    errors: toCount(value.errors),
    callNames: parseCallNames(value.callNames),
  }
}

/**
 * Client-visible shape: everything except the callId bookkeeping (the browser
 * never classifies results), with the field capped at {@link FIELD_CAP}.
 * Tolerant of a corrupted state so a bad checkpoint can never blank the UI.
 *
 * @param state - projection state.
 * @returns the wire view.
 */
export function viewGardenState(state) {
  const safe = state !== null && typeof state === 'object' && !Array.isArray(state) ? state : initGardenState()
  return {
    planted: toCount(safe.planted),
    counts: parseKindCounts(safe.counts),
    plants: parsePlants(safe.plants),
    harvests: parseHarvests(safe.harvests),
    harvestCount: toCount(safe.harvestCount),
    harvested: toCount(safe.harvested),
    seeds: toCount(safe.seeds),
    seedsByKind: parseKindCounts(safe.seedsByKind),
    harvestedByKind: parseKindCounts(safe.harvestedByKind),
    lastHarvestAt: toCount(safe.lastHarvestAt),
    lastPlantAt: toCount(safe.lastPlantAt),
    firstPlantAt: toCount(safe.firstPlantAt),
    errors: toCount(safe.errors),
  }
}

/**
 * Parse a wire view, keeping only known fields (never `callNames`) and repairing
 * bad values. Never throws.
 *
 * @param value - anything received as a `garden` view.
 * @returns a fresh, valid view.
 */
export function parseGardenView(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return viewGardenState(initGardenState())
  return viewGardenState(value)
}

/** The `garden` projection registered with the host. */
export const GARDEN_PROJECTION = {
  key: 'garden',
  stateVersion: 1,
  stateSchema: { parse: parseGardenState },
  init: initGardenState,
  apply: foldGarden,
  wire: {
    summary: false,
    viewSchema: { parse: parseGardenView },
    view: viewGardenState,
  },
}

/** Services this plugin needs; without them it stays inactive. */
export const inject = ['sessionProjections']

/** Log through the host logger without ever letting logging break activation. */
function warn(ctx, message) {
  try {
    ctx?.logger?.warn?.(message)
  } catch {
    /* logging must never break activation */
  }
}

/**
 * Register the `garden` projection, owning it in one effect so a profile
 * reload disposes the registration. A failed registration only warns: the
 * rest of the host must not crash because a projection key was taken.
 *
 * @param ctx - host plugin context.
 * @returns the effect disposer (or `undefined` when the context cannot own effects).
 */
export function apply(ctx) {
  const retention = { handle: null, disposed: false }
  try {
    return ctx.effect(() => {
      let registration
      try {
        registration = ctx.sessionProjections.register(GARDEN_PROJECTION)
      } catch (error) {
        warn(ctx, `context-garden: projection registration failed: ${String(error)}`)
        return () => {}
      }
      // The registration value is a callable thenable: awaiting it yields the
      // retained handle (registration itself belongs to this effect).
      Promise.resolve(registration).then(
        (handle) => {
          retention.handle = handle
          if (retention.disposed) {
            try {
              if (handle !== null && typeof handle.dispose === 'function') handle.dispose()
            } catch {
              /* a late dispose must not crash the host */
            }
          }
        },
        (error) => {
          warn(ctx, `context-garden: projection registration failed: ${String(error)}`)
        },
      )
      return () => {
        retention.disposed = true
        try {
          if (retention.handle !== null && typeof retention.handle.dispose === 'function') retention.handle.dispose()
        } catch {
          /* disposal must never break plugin teardown */
        }
      }
    }, 'context-garden: garden projection')
  } catch (error) {
    // No effect service (or a broken context): warn, never throw during activation.
    warn(ctx, `context-garden: projection registration failed: ${String(error)}`)
    return undefined
  }
}