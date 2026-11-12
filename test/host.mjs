/**
 * Host-half tests for @ruaibeite/dsh-context-garden.
 *
 * Plain Node (`node test/host.mjs`), no dependencies, no Harness process and no
 * browser: the `garden` projection is folded over fake session events shaped
 * exactly like the real v4 session log (`session.v4.jsonl.zstd`):
 *
 *   user/message      { type, seq, time, data: { content: blocks, source } }
 *   assistant/message { type, seq, time, data: { turn, step, message: { content: blocks } } }
 *   tool/call         { type, seq, time, data: { turn, step, callId, name, arguments } }
 *   tool/result       { type, seq, time, data: { turn, step, message: { content, isError, toolCallId } } }
 *   compaction/start  { type, seq, time, data: { compactionId, turn } }
 *
 * Image blocks are real-shaped too: `{ type: 'image', attachment: {...} }`.
 */
import assert from 'node:assert/strict'
import {
  FIELD_CAP,
  GARDEN_PROJECTION,
  HARVEST_CAP,
  KINDS,
  MAX_CALLS,
  apply,
  categoryOfTool,
  foldGarden,
  initGardenState,
  parseGardenState,
  parseGardenView,
  seedValue,
  viewGardenState,
} from '../index.js'

let passed = 0
function test(name, fn) {
  fn()
  passed += 1
  console.log('ok -', name)
}

async function testAsync(name, fn) {
  await fn()
  passed += 1
  console.log('ok -', name)
}

// ------------------------------------------------------------ fake v4 events
const TURN = 1

function userEvent(options = {}) {
  const content = []
  if (options.text !== undefined) content.push({ type: 'text', text: options.text })
  if (options.image === true) content.push({ type: 'image', attachment: { attachmentId: 'sha256:abc', mediaType: 'image/png', bytes: 10, width: 4, height: 4, name: 'shot.png' } })
  if (Array.isArray(options.blocks)) content.push(...options.blocks)
  return {
    type: 'user/message',
    seq: options.seq ?? 1,
    time: options.time ?? 1000,
    data: {
      content,
      source: options.source ?? { kind: 'user' },
      role: 'user',
      id: 'user-msg-id',
    },
  }
}

function assistantEvent(options = {}) {
  const content = []
  if (options.reasoning !== undefined) content.push({ type: 'reasoning', text: options.reasoning })
  if (options.text !== undefined) content.push({ type: 'text', text: options.text })
  if (Array.isArray(options.blocks)) content.push(...options.blocks)
  return {
    type: 'assistant/message',
    seq: options.seq ?? 2,
    time: options.time ?? 1001,
    data: {
      turn: options.turn ?? TURN,
      step: options.step ?? 1,
      message: { role: 'assistant', content, id: 'assistant-msg-id' },
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      source: { kind: 'model', provider: 'p', model: 'm' },
    },
  }
}

function toolCallEvent(options = {}) {
  return {
    type: 'tool/call',
    seq: options.seq ?? 3,
    time: options.time ?? 1002,
    data: {
      turn: options.turn ?? TURN,
      step: options.step ?? 1,
      callId: options.callId ?? 'call_1',
      name: options.name ?? 'bash',
      arguments: '{}',
    },
  }
}

function toolResultEvent(options = {}) {
  const content = []
  if (options.text !== undefined) content.push({ type: 'text', text: options.text })
  if (options.image === true) content.push({ type: 'image', attachment: { attachmentId: 'sha256:def', mediaType: 'image/jpeg', bytes: 20, width: 8, height: 8, name: 'crop.png' } })
  if (Array.isArray(options.blocks)) content.push(...options.blocks)
  const message = {
    role: 'tool',
    source: { kind: 'tool', callId: options.toolCallId ?? 'call_1' },
    toolCallId: options.toolCallId ?? 'call_1',
    content,
    id: 'tool-msg-id',
  }
  if (options.isError === true) message.isError = true
  const event = {
    type: 'tool/result',
    seq: options.seq ?? 4,
    time: options.time ?? 1003,
    data: { turn: options.turn ?? TURN, step: options.step ?? 1, message },
  }
  if (options.error !== undefined) event.data.error = options.error
  return event
}

function compactionEvent(options = {}) {
  return {
    type: 'compaction/start',
    seq: options.seq ?? 5,
    time: options.time ?? 1004,
    data: { compactionId: 'd1b5f3c8-9a2d-4b0f-9a7d-68da03890086', turn: options.turn ?? TURN },
  }
}

/** Fold a list of events through the projection's fold. */
function foldAll(events, state = initGardenState()) {
  let next = state
  for (const event of events) next = foldGarden(next, event)
  return next
}

/** Wait for promise continuations (registration handles resolve in microtasks). */
async function flush() {
  for (let i = 0; i < 5; i += 1) await Promise.resolve()
}

const plant = (state) => (state.plants.length > 0 ? state.plants[state.plants.length - 1] : null)

// ------------------------------------------------------------ export contract
test('the module exports the SPEC §4.4 contract', () => {
  assert.deepEqual(KINDS, ['cactus', 'flower', 'weed', 'bamboo', 'grass', 'sprout'])
  assert.equal(FIELD_CAP, 240)
  assert.equal(HARVEST_CAP, 24)
  assert.equal(MAX_CALLS, 80)
  assert.equal(GARDEN_PROJECTION.key, 'garden')
  assert.equal(GARDEN_PROJECTION.stateVersion, 1)
  assert.equal(GARDEN_PROJECTION.init, initGardenState)
  assert.equal(GARDEN_PROJECTION.apply, foldGarden)
  assert.equal(GARDEN_PROJECTION.stateSchema.parse, parseGardenState)
  assert.equal(GARDEN_PROJECTION.wire.summary, false, 'the garden stays out of session-list rows')
  assert.equal(GARDEN_PROJECTION.wire.view, viewGardenState)
  assert.equal(GARDEN_PROJECTION.wire.viewSchema.parse, parseGardenView)
  assert.deepEqual(typeof apply, 'function')
})

test('initGardenState starts with a full, zeroed v1 state', () => {
  const emptyCounts = { cactus: 0, flower: 0, weed: 0, bamboo: 0, grass: 0, sprout: 0 }
  assert.deepEqual(initGardenState(), {
    planted: 0,
    counts: emptyCounts,
    plants: [],
    harvests: [],
    harvestCount: 0,
    harvested: 0,
    seeds: 0,
    seedsByKind: emptyCounts,
    harvestedByKind: emptyCounts,
    lastHarvestAt: 0,
    lastPlantAt: 0,
    firstPlantAt: 0,
    errors: 0,
    callNames: {},
  })
})

// ------------------------------------------------------------ categoryOfTool
test('tool names map to the expected kind (code / read / documents / fallback)', () => {
  const cases = [
    // code -> cactus
    ['bash', 'cactus'],
    ['pwsh', 'cactus'],
    ['run_code', 'cactus'],
    ['terminal', 'cactus'],
    ['shell', 'cactus'],
    ['exec', 'cactus'],
    ['write', 'cactus'],
    ['edit', 'cactus'],
    ['apply_patch', 'cactus'],
    ['str_replace_editor', 'cactus'],
    ['str_replace', 'cactus'],
    ['fs_write', 'cactus'],
    ['fs_edit', 'cactus'],
    ['notebook_edit', 'cactus'],
    ['jobs', 'cactus'],
    ['job_kill', 'cactus'],
    ['workflow', 'cactus'],
    ['ralph', 'cactus'],
    ['plugin_manager', 'cactus'],
    ['worktree', 'cactus'],
    // read / search -> grass
    ['read', 'grass'],
    ['read_image', 'grass'],
    ['glob', 'grass'],
    ['grep', 'grass'],
    ['ls', 'grass'],
    ['find', 'grass'],
    ['skill', 'grass'],
    ['session_search', 'grass'],
    ['session_query', 'grass'],
    ['session_event_read', 'grass'],
    ['workspace_info', 'grass'],
    ['todo_read', 'grass'],
    ['ask_user_question', 'grass'],
    ['web_search', 'grass'],
    ['web_fetch', 'grass'],
    ['fetch', 'grass'],
    ['browse', 'grass'],
    // documents / presentation -> bamboo (present is NOT code)
    ['docx', 'bamboo'],
    ['pptx', 'bamboo'],
    ['xlsx', 'bamboo'],
    ['pdf', 'bamboo'],
    ['office', 'bamboo'],
    ['document', 'bamboo'],
    ['present', 'bamboo'],
    // unknown -> grass fallback
    ['send_message', 'grass'],
    ['team_task_list', 'grass'],
    ['spawn_teammate', 'grass'],
    ['compress', 'grass'],
    ['', 'grass'],
    [undefined, 'grass'],
    [null, 'grass'],
    [42, 'grass'],
  ]
  for (const [tool, expected] of cases) {
    assert.equal(categoryOfTool(tool), expected, `tool ${String(tool)} should plant a ${expected}`)
  }
})

test('categoryOfTool is case-insensitive and trims whitespace', () => {
  assert.equal(categoryOfTool(' BASH '), 'cactus')
  assert.equal(categoryOfTool('Present'), 'bamboo')
  assert.equal(categoryOfTool('WEB_SEARCH'), 'grass')
})

// ------------------------------------------------------------------ seedValue
test('seedValue clamps the weight term to 1..5 and adds the species bonus', () => {
  const at = (kind, w) => seedValue({ kind, w })
  // base = clamp(1 + floor(w / 800), 1, 5)
  assert.equal(at('grass', 0), 1)
  assert.equal(at('grass', 799), 1)
  assert.equal(at('grass', 800), 2)
  assert.equal(at('grass', 1599), 2)
  assert.equal(at('grass', 1600), 3)
  assert.equal(at('grass', 2400), 4)
  assert.equal(at('grass', 3200), 5)
  assert.equal(at('grass', 3600), 5, 'the weight term stops at 5')
  assert.equal(at('grass', 4000), 5)
  assert.equal(at('grass', 40000), 5, 'a corrupted huge weight still caps')
  assert.equal(at('grass', -5), 1, 'negative weights clamp to the floor')
  // species bonuses: flower +2, cactus +1, bamboo +1, others +0
  assert.equal(at('flower', 0), 3)
  assert.equal(at('flower', 4000), 7)
  assert.equal(at('cactus', 800), 3)
  assert.equal(at('bamboo', 0), 2)
  assert.equal(at('bamboo', 4000), 6)
  assert.equal(at('weed', 4000), 5)
  assert.equal(at('sprout', 0), 1)
  // malformed plants still yield a sane floor
  assert.equal(seedValue(null), 1)
  assert.equal(seedValue(undefined), 1)
  assert.equal(seedValue({}), 1)
  assert.equal(seedValue({ kind: 'flower' }), 3)
})

// --------------------------------------------------------------- fold: user
test('user/message plants a sprout with weight = ceil(chars / 4)', () => {
  const state = foldGarden(initGardenState(), userEvent({ seq: 7, time: 1234, text: 'hello' }))
  assert.equal(state.plants.length, 1)
  assert.deepEqual(plant(state), { seq: 7, t: 1234, kind: 'sprout', w: 2 }, '5 chars -> ceil(5/4) = 2')
  assert.equal(state.planted, 1)
  assert.equal(state.counts.sprout, 1)
  assert.equal(state.lastPlantAt, 1234)
  assert.equal(state.firstPlantAt, 1234)
  assert.equal(state.errors, 0)
})

test('user/message with a code fence plants a cactus', () => {
  const state = foldGarden(initGardenState(), userEvent({ text: '看这段：\n```js\nconst x = 1\n```' }))
  assert.equal(plant(state).kind, 'cactus')
  assert.equal(state.counts.cactus, 1)
})

test('user/message with an image plants a flower (image wins over code text)', () => {
  const state = foldGarden(initGardenState(), userEvent({ text: '```also code```', image: true }))
  assert.equal(plant(state).kind, 'flower')
})

test('runtime-context and team user messages plant like any other user message', () => {
  let state = foldGarden(initGardenState(), userEvent({ text: 'runtime context block', source: { kind: 'runtime' } }))
  state = foldGarden(state, userEvent({ text: 'team task message', source: { kind: 'team' }, seq: 2, time: 2 }))
  assert.equal(state.planted, 2)
  assert.deepEqual(state.counts.sprout, 2)
})

test('user weight clamps to 1 for tiny content and 4000 for huge content', () => {
  const tiny = foldGarden(initGardenState(), userEvent({ text: 'a' }))
  assert.equal(plant(tiny).w, 1)
  const empty = foldGarden(initGardenState(), userEvent({}))
  assert.equal(plant(empty).w, 1, 'empty content still plants a 1-weight sprout')
  const huge = foldGarden(initGardenState(), userEvent({ text: 'x'.repeat(20000) }))
  assert.equal(plant(huge).w, 4000, 'ceil(20000/4) = 5000 -> clamped to 4000')
})

// ---------------------------------------------------------- fold: assistant
test('assistant/message with real text plants bamboo', () => {
  const state = foldGarden(initGardenState(), assistantEvent({ seq: 9, time: 4321, text: 'Done, done, and done.' }))
  assert.equal(plant(state).kind, 'bamboo')
  assert.equal(plant(state).seq, 9)
  assert.equal(plant(state).t, 4321)
  assert.equal(state.counts.bamboo, 1)
})

test('assistant/message with a code fence plants a cactus', () => {
  const state = foldGarden(initGardenState(), assistantEvent({ text: '```js\nconsole.log(1)\n```' }))
  assert.equal(plant(state).kind, 'cactus')
})

test('assistant reasoning-only and tool-call-only steps plant nothing', () => {
  let state = initGardenState()
  const reasoningOnly = assistantEvent({ reasoning: 'let me think about this for a while' })
  assert.equal(foldGarden(state, reasoningOnly), state, 'reasoning-only must return the same state reference')
  const toolCallOnly = assistantEvent({ blocks: [{ type: 'tool-call', id: 'call_1', name: 'read', arguments: '{}' }] })
  assert.equal(foldGarden(state, toolCallOnly), state)
  state = foldGarden(state, assistantEvent({ text: '   \n\t ' }))
  assert.equal(state.plants.length, 0, 'whitespace-only text plants nothing')
})

test('assistant weight counts text only, never reasoning', () => {
  const state = foldGarden(initGardenState(), assistantEvent({
    reasoning: 'r'.repeat(20000),
    text: 'abcd',
  }))
  assert.equal(plant(state).w, 1, 'only "abcd" counts: ceil(4/4) = 1')
})

// ----------------------------------------------------- fold: tool classification
test('tool/call records callId -> name without planting', () => {
  const state = foldGarden(initGardenState(), toolCallEvent({ callId: 'call_1', name: 'bash' }))
  assert.deepEqual(state.callNames, { call_1: 'bash' })
  assert.equal(state.plants.length, 0)
  assert.equal(state.planted, 0)
})

test('tool/result inherits the kind from the originating tool/call name', () => {
  const cases = [
    ['bash', 'cactus'],
    ['write', 'cactus'],
    ['read', 'grass'],
    ['grep', 'grass'],
    ['web_search', 'grass'],
    ['docx', 'bamboo'],
    ['pptx', 'bamboo'],
    ['present', 'bamboo'],
    ['unknown_tool_name', 'grass'],
  ]
  for (const [name, kind] of cases) {
    let state = initGardenState()
    state = foldGarden(state, toolCallEvent({ callId: 'call_9', name }))
    state = foldGarden(state, toolResultEvent({ toolCallId: 'call_9', text: 'output' }))
    assert.equal(plant(state).kind, kind, `tool ${name} should plant ${kind}`)
  }
})

test('tool/result without a recorded tool/call falls back to grass', () => {
  const state = foldGarden(initGardenState(), toolResultEvent({ toolCallId: 'call_never_seen', text: 'data' }))
  assert.equal(plant(state).kind, 'grass')
})

test('tool/result with isError plants a weed and counts the error', () => {
  let state = foldGarden(initGardenState(), toolCallEvent({ callId: 'call_1', name: 'bash' }))
  state = foldGarden(state, toolResultEvent({
    toolCallId: 'call_1',
    isError: true,
    text: 'Error: cannot edit "x": file changed since it was read',
    error: { name: 'FsError', code: 'FS_STALE_VERSION' },
  }))
  assert.equal(plant(state).kind, 'weed', 'an error result is a weed even when the tool is a code tool')
  assert.equal(state.errors, 1)
  state = foldGarden(state, toolResultEvent({ toolCallId: 'call_1', text: 'ok' }))
  assert.equal(state.errors, 1, 'successful results do not add errors')
  assert.deepEqual(state.counts, { cactus: 1, flower: 0, weed: 1, bamboo: 0, grass: 0, sprout: 0 })
})

test('tool/result with an image plants a flower; isError still wins', () => {
  let state = foldGarden(initGardenState(), toolCallEvent({ callId: 'call_1', name: 'read_image' }))
  state = foldGarden(state, toolResultEvent({ toolCallId: 'call_1', text: 'image loaded', image: true }))
  assert.equal(plant(state).kind, 'flower')
  state = foldGarden(state, toolResultEvent({ toolCallId: 'call_1', image: true, isError: true, seq: 5 }))
  assert.equal(plant(state).kind, 'weed', 'isError has priority over image')
})

test('tool/result weight comes from the text blocks of the tool message', () => {
  const state = foldGarden(initGardenState(), toolResultEvent({ text: '12345678' }))
  assert.equal(plant(state).w, 2, '8 chars -> ceil(8/4) = 2')
})

test('callNames keeps at most MAX_CALLS entries, newest last (FIFO)', () => {
  let state = initGardenState()
  for (let i = 0; i < MAX_CALLS + 5; i += 1) {
    state = foldGarden(state, toolCallEvent({ callId: `c${i}`, name: 'bash' }))
  }
  const keys = Object.keys(state.callNames)
  assert.equal(keys.length, MAX_CALLS)
  assert.equal(keys[0], 'c5', 'the five oldest calls were evicted')
  assert.equal(keys[keys.length - 1], 'c84')
  assert.equal('c0' in state.callNames, false)
  // Re-remembering a known call does not grow the map.
  state = foldGarden(state, toolCallEvent({ callId: 'c84', name: 'read' }))
  assert.equal(Object.keys(state.callNames).length, MAX_CALLS)
  assert.equal(state.callNames.c84, 'read')
})

// ------------------------------------------------------------ fold: harvest
test('compaction/start harvests plants into seeds, seedsByKind and harvestedByKind', () => {
  let state = initGardenState()
  // Six plants, one per kind, all weight 1 (text <= 4 chars).
  state = foldGarden(state, userEvent({ text: '````', seq: 1, time: 10 })) // cactus (code fence)
  state = foldGarden(state, userEvent({ image: true, seq: 2, time: 11 })) // flower
  state = foldGarden(state, toolResultEvent({ isError: true, text: 'e', seq: 3, time: 12, toolCallId: 'x' })) // weed
  state = foldGarden(state, assistantEvent({ text: 'abcd', seq: 4, time: 13 })) // bamboo
  state = foldGarden(state, toolCallEvent({ callId: 'r1', name: 'read', seq: 5 }))
  state = foldGarden(state, toolResultEvent({ toolCallId: 'r1', text: 'ok', seq: 6, time: 14 })) // grass
  state = foldGarden(state, userEvent({ text: 'hi', seq: 7, time: 15 })) // sprout
  assert.equal(state.plants.length, 6)

  state = foldGarden(state, compactionEvent({ seq: 8, time: 1000 }))
  // seed values at w=1: cactus 2, flower 3, weed 1, bamboo 2, grass 1, sprout 1
  assert.equal(state.seeds, 10)
  assert.equal(state.harvested, 6)
  assert.equal(state.harvestCount, 1)
  assert.equal(state.lastHarvestAt, 1000)
  assert.deepEqual(state.plants, [])
  assert.deepEqual(state.seedsByKind, { cactus: 2, flower: 3, weed: 1, bamboo: 2, grass: 1, sprout: 1 })
  assert.deepEqual(state.harvestedByKind, { cactus: 1, flower: 1, weed: 1, bamboo: 1, grass: 1, sprout: 1 })
  assert.equal(state.harvests.length, 1)
  assert.deepEqual(state.harvests[0], {
    at: 1000,
    seq: 8,
    n: 6,
    seeds: 10,
    counts: { cactus: 1, flower: 1, weed: 1, bamboo: 1, grass: 1, sprout: 1 },
  })
  // The harvest diary and the per-kind harvest counter always agree.
  assert.deepEqual(state.harvestedByKind, state.harvests[state.harvests.length - 1].counts)
  // Cumulative history survives the harvest.
  assert.equal(state.planted, 6)
  assert.deepEqual(state.counts, { cactus: 1, flower: 1, weed: 1, bamboo: 1, grass: 1, sprout: 1 })
  assert.equal(state.errors, 1)
})

test('harvesting an empty field still records a harvest (n = 0, seeds = 0)', () => {
  const state = foldGarden(initGardenState(), compactionEvent({ seq: 3, time: 77 }))
  assert.equal(state.harvestCount, 1)
  assert.equal(state.harvested, 0)
  assert.equal(state.seeds, 0)
  assert.equal(state.lastHarvestAt, 77)
  assert.deepEqual(state.plants, [])
  assert.deepEqual(state.seedsByKind, { cactus: 0, flower: 0, weed: 0, bamboo: 0, grass: 0, sprout: 0 })
  assert.deepEqual(state.harvestedByKind, { cactus: 0, flower: 0, weed: 0, bamboo: 0, grass: 0, sprout: 0 })
  assert.equal(state.harvests.length, 1)
  assert.deepEqual(state.harvests[0], {
    at: 77,
    seq: 3,
    n: 0,
    seeds: 0,
    counts: { cactus: 0, flower: 0, weed: 0, bamboo: 0, grass: 0, sprout: 0 },
  })
})

test('multiple harvests accumulate and replanting works after each one', () => {
  let state = initGardenState()
  // First season: one sprout.
  state = foldGarden(state, userEvent({ text: 'hi', seq: 1, time: 100 }))
  state = foldGarden(state, compactionEvent({ seq: 2, time: 200 }))
  assert.equal(state.seeds, 1)
  assert.equal(state.plants.length, 0)
  // Replant: one bamboo at weight 800 (base 2 + bamboo 1 = 3).
  state = foldGarden(state, assistantEvent({ text: 'x'.repeat(3200), seq: 3, time: 300 }))
  assert.equal(plant(state).kind, 'bamboo')
  assert.equal(plant(state).w, 800)
  assert.equal(state.plants.length, 1)
  state = foldGarden(state, compactionEvent({ seq: 4, time: 400 }))
  assert.equal(state.harvestCount, 2)
  assert.equal(state.harvested, 2)
  assert.equal(state.seeds, 4, '1 sprout seed + 3 bamboo seeds')
  assert.deepEqual(state.seedsByKind, { cactus: 0, flower: 0, weed: 0, bamboo: 3, grass: 0, sprout: 1 })
  assert.deepEqual(state.harvestedByKind, { cactus: 0, flower: 0, weed: 0, bamboo: 1, grass: 0, sprout: 1 })
  assert.deepEqual(state.harvests.map((row) => [row.at, row.n, row.seeds]), [[200, 1, 1], [400, 1, 3]])
})

test('harvests are capped to HARVEST_CAP rows, newest last', () => {
  let state = initGardenState()
  for (let i = 0; i < HARVEST_CAP + 6; i += 1) {
    state = foldGarden(state, compactionEvent({ seq: i, time: i * 10 }))
  }
  assert.equal(state.harvestCount, HARVEST_CAP + 6, 'the lifetime counter is not capped')
  assert.equal(state.harvests.length, HARVEST_CAP)
  assert.equal(state.harvests[0].at, 6 * 10)
  assert.equal(state.harvests[state.harvests.length - 1].at, (HARVEST_CAP + 5) * 10)
})

test('plants beyond FIELD_CAP fall off the bed but stay in the lifetime counters', () => {
  let state = initGardenState()
  for (let i = 0; i < FIELD_CAP + 10; i += 1) {
    state = foldGarden(state, userEvent({ text: 'hi', seq: i, time: i + 1 }))
  }
  assert.equal(state.plants.length, FIELD_CAP)
  assert.equal(state.plants[0].seq, 10, 'the ten oldest plants fell off the bed')
  assert.equal(state.plants[state.plants.length - 1].seq, FIELD_CAP + 9)
  assert.equal(state.planted, FIELD_CAP + 10)
  assert.equal(state.counts.sprout, FIELD_CAP + 10)
  assert.equal(state.firstPlantAt, 1)
  assert.equal(state.lastPlantAt, FIELD_CAP + 10)
  // Only the 240 plants still in the field are harvestable.
  state = foldGarden(state, compactionEvent({ time: 9999 }))
  assert.equal(state.harvested, FIELD_CAP)
  assert.equal(state.harvestCount, 1)
})

// ------------------------------------------------- fold: safety / references
test('fold ignores unknown events and returns the same state reference', () => {
  const state = initGardenState()
  assert.equal(foldGarden(state, null), state)
  assert.equal(foldGarden(state, undefined), state)
  assert.equal(foldGarden(state, 'turn/start'), state)
  assert.equal(foldGarden(state, 42), state)
  assert.equal(foldGarden(state, []), state)
  assert.equal(foldGarden(state, { type: 'turn/start', data: {} }), state)
  assert.equal(foldGarden(state, { type: 'step/end', data: {} }), state)
  assert.equal(foldGarden(state, { type: 'session/title', data: { title: 'x' } }), state)
  assert.equal(foldGarden(state, { type: 'tool/call', data: null }), state, 'a call without callId is ignored')
})

test('fold tolerates malformed matched events without throwing', () => {
  // user/message with no data still plants a minimal sprout.
  let state = foldGarden(initGardenState(), { type: 'user/message', seq: 1, time: 5 })
  assert.deepEqual(plant(state), { seq: 1, t: 5, kind: 'sprout', w: 1 })
  // tool/call without fields is ignored, tool/result without a message is a grass plant.
  state = foldGarden(state, { type: 'tool/call', data: null })
  assert.equal(state.planted, 1)
  state = foldGarden(state, { type: 'tool/result', data: null, seq: 2 })
  assert.equal(state.plants.length, 2)
  assert.equal(plant(state).kind, 'grass')
  // assistant/message with no content plants nothing.
  const before = state
  assert.equal(foldGarden(before, { type: 'assistant/message', data: { message: null } }), before)
  // compaction/start with no data still harvests.
  state = foldGarden(state, { type: 'compaction/start' })
  assert.equal(state.harvestCount, 1)
  assert.deepEqual(state.plants, [])
})

test('fold never mutates the previous state object', () => {
  const state = initGardenState()
  const snapshot = JSON.parse(JSON.stringify(state))
  foldGarden(state, userEvent({ text: 'plant' }))
  foldGarden(state, toolCallEvent({ callId: 'c1', name: 'bash' }))
  foldGarden(state, compactionEvent())
  assert.deepEqual(state, snapshot)
})

// ------------------------------------------------------ realistic v4 sequence
test('a realistic v4 event stream folds end to end', () => {
  const events = [
    { type: 'session', version: 4, id: 's1', createdAt: 1, cwd: '/work', isSeeded: false },
    { type: 'turn/start', seq: 0, time: 99, data: { turn: 1 } },
    userEvent({ seq: 1, time: 100, text: '请帮我改一下代码' }), // sprout, 8 chars -> w 2
    assistantEvent({ seq: 2, time: 101, reasoning: 'thinking...', blocks: [{ type: 'tool-call', id: 'call_A', name: 'bash', arguments: '{}' }] }),
    toolCallEvent({ seq: 3, time: 102, callId: 'call_A', name: 'bash' }),
    toolResultEvent({ seq: 4, time: 103, toolCallId: 'call_A', text: 'ok' }),
    assistantEvent({ seq: 5, time: 104, text: 'Done! 修好了。' }), // bamboo, 10 chars -> w 3
    compactionEvent({ seq: 6, time: 105 }),
    userEvent({ seq: 7, time: 106, text: '继续' }), // replant: sprout, 2 chars -> w 1
  ]
  const state = foldAll(events)
  assert.equal(state.planted, 4, '3 plants before the harvest + 1 replanted')
  assert.deepEqual(state.counts, { cactus: 1, flower: 0, weed: 0, bamboo: 1, grass: 0, sprout: 2 })
  assert.equal(state.plants.length, 1)
  assert.deepEqual(state.plants[0], { seq: 7, t: 106, kind: 'sprout', w: 1 })
  assert.equal(state.harvestCount, 1)
  assert.equal(state.harvested, 3)
  assert.equal(state.seeds, 5, 'sprout 1 + cactus 2 + bamboo 2')
  assert.deepEqual(state.seedsByKind, { cactus: 2, flower: 0, weed: 0, bamboo: 2, grass: 0, sprout: 1 })
  assert.deepEqual(state.harvestedByKind, { cactus: 1, flower: 0, weed: 0, bamboo: 1, grass: 0, sprout: 1 })
  assert.equal(state.firstPlantAt, 100)
  assert.equal(state.lastPlantAt, 106)
  // Round-trips through JSON exactly like a stored checkpoint.
  assert.deepEqual(parseGardenState(JSON.parse(JSON.stringify(state))), state)
})

// ------------------------------------------------------- parseGardenState
test('parseGardenState swallows undefined, null, arrays and scalars', () => {
  const empty = initGardenState()
  for (const bad of [undefined, null, [], 'corrupt', 42, true]) {
    assert.deepEqual(parseGardenState(bad), empty, `parse(${String(bad)}) must reset to defaults`)
  }
  assert.deepEqual(parseGardenState({}), empty, 'an old/empty version fills defaults')
})

test('parseGardenState clamps numbers, filters bad plants and repairs counter objects', () => {
  const repaired = parseGardenState({
    planted: -5,
    counts: { cactus: 2, flower: 1.9, weed: 'x', bogus: 9 },
    plants: [
      { seq: 1, t: 2, kind: 'cactus', w: 37 },
      { seq: 'x', t: -1, kind: 'bamboo', w: -4 },
      { seq: 3, t: 3, kind: 'bogus', w: 10 },
      { kind: 'flower', w: 1e9 },
      null,
      'not a plant',
    ],
    harvests: [
      { at: 10, seq: 4, n: 2, seeds: 3, counts: { cactus: 1, flower: 1, bogus: 5 } },
      null,
      'bad row',
    ],
    harvestCount: -1,
    harvested: -2,
    seeds: 'nan',
    seedsByKind: { cactus: -1, flower: 3.7, bogus: 2 },
    lastHarvestAt: -9,
    lastPlantAt: 1e9,
    firstPlantAt: -3,
    errors: -7,
    callNames: { a: 'bash', b: 42, c: null },
  })
  assert.equal(repaired.planted, 0)
  assert.deepEqual(repaired.counts, { cactus: 2, flower: 1, weed: 0, bamboo: 0, grass: 0, sprout: 0 })
  assert.deepEqual(repaired.plants, [
    { seq: 1, t: 2, kind: 'cactus', w: 37 },
    { seq: 0, t: 0, kind: 'bamboo', w: 0 },
    { seq: 0, t: 0, kind: 'flower', w: 4000 },
  ])
  assert.equal(repaired.harvests.length, 1)
  assert.deepEqual(repaired.harvests[0].counts, { cactus: 1, flower: 1, weed: 0, bamboo: 0, grass: 0, sprout: 0 })
  assert.equal(repaired.harvestCount, 0)
  assert.equal(repaired.harvested, 0)
  assert.equal(repaired.seeds, 0)
  assert.deepEqual(repaired.seedsByKind, { cactus: 0, flower: 3, weed: 0, bamboo: 0, grass: 0, sprout: 0 })
  assert.equal(repaired.lastHarvestAt, 0)
  assert.equal(repaired.lastPlantAt, 1e9)
  assert.equal(repaired.firstPlantAt, 0)
  assert.equal(repaired.errors, 0)
  assert.deepEqual(repaired.callNames, { a: 'bash' })
})

test('parseGardenState repairs a missing or corrupt harvestedByKind to six zeros', () => {
  const missing = parseGardenState({ planted: 3 })
  assert.deepEqual(missing.harvestedByKind, { cactus: 0, flower: 0, weed: 0, bamboo: 0, grass: 0, sprout: 0 })
  const corrupt = parseGardenState({ harvestedByKind: { cactus: -2, flower: 'x', weed: 1.9, bogus: 7 } })
  assert.deepEqual(corrupt.harvestedByKind, { cactus: 0, flower: 0, weed: 1, bamboo: 0, grass: 0, sprout: 0 })
  const notAnObject = parseGardenState({ harvestedByKind: 'oops' })
  assert.deepEqual(notAnObject.harvestedByKind, { cactus: 0, flower: 0, weed: 0, bamboo: 0, grass: 0, sprout: 0 })
})

test('parseGardenState truncates long plants, harvests and callNames arrays', () => {
  const plants = []
  for (let i = 0; i < FIELD_CAP + 60; i += 1) plants.push({ seq: i, t: i, kind: KINDS[i % KINDS.length], w: 800 })
  const harvests = []
  for (let i = 0; i < HARVEST_CAP + 10; i += 1) harvests.push({ at: i, seq: i, n: 1, seeds: 2, counts: { cactus: 1 } })
  const callNames = {}
  for (let i = 0; i < MAX_CALLS + 20; i += 1) callNames[`c${i}`] = 'bash'

  const parsed = parseGardenState({ plants, harvests, callNames })
  assert.equal(parsed.plants.length, FIELD_CAP)
  assert.equal(parsed.plants[0].seq, 60, 'keeps the newest plants')
  assert.equal(parsed.plants[parsed.plants.length - 1].seq, FIELD_CAP + 59)
  assert.equal(parsed.harvests.length, HARVEST_CAP)
  assert.equal(parsed.harvests[0].at, 10)
  assert.equal(Object.keys(parsed.callNames).length, MAX_CALLS)
  assert.equal('c0' in parsed.callNames, false)
  assert.equal(parsed.callNames[`c${MAX_CALLS + 19}`], 'bash')
})

test('state JSON round-trips survive parse unchanged', () => {
  let state = initGardenState()
  state = foldGarden(state, userEvent({ text: 'hello world', seq: 1, time: 100 }))
  state = foldGarden(state, toolCallEvent({ callId: 'c1', name: 'bash', seq: 2 }))
  state = foldGarden(state, toolResultEvent({ toolCallId: 'c1', text: 'ok', seq: 3 }))
  state = foldGarden(state, compactionEvent({ seq: 4, time: 200 }))
  state = foldGarden(state, assistantEvent({ text: '```code```', seq: 5 }))
  assert.deepEqual(parseGardenState(JSON.parse(JSON.stringify(state))), state)
})

// -------------------------------------------------------- view / view parse
test('viewGardenState drops callNames and keeps the rest of the state', () => {
  let state = initGardenState()
  state = foldGarden(state, toolCallEvent({ callId: 'c1', name: 'bash' }))
  state = foldGarden(state, toolResultEvent({ toolCallId: 'c1', text: 'ok' }))
  state = foldGarden(state, compactionEvent({ time: 55 }))
  state = foldGarden(state, userEvent({ text: 'continue', time: 56 }))
  const view = viewGardenState(state)
  assert.equal('callNames' in view, false, 'callId bookkeeping never reaches the browser')
  assert.equal(view.planted, state.planted)
  assert.deepEqual(view.counts, state.counts)
  assert.deepEqual(view.plants, state.plants)
  assert.deepEqual(view.harvests, state.harvests)
  assert.deepEqual(view.seedsByKind, state.seedsByKind)
  assert.deepEqual(view.harvestedByKind, state.harvestedByKind)
  assert.equal(view.seeds, state.seeds)
  assert.equal(view.harvestCount, state.harvestCount)
})

test('viewGardenState truncates an oversized field and survives a corrupt state', () => {
  const plants = []
  for (let i = 0; i < FIELD_CAP + 70; i += 1) plants.push({ seq: i, t: i, kind: 'sprout', w: 1 })
  const view = viewGardenState({ ...initGardenState(), plants })
  assert.equal(view.plants.length, FIELD_CAP)
  assert.equal(view.plants[0].seq, 70)
  const fallback = viewGardenState(null)
  assert.deepEqual(fallback, viewGardenState(initGardenState()))
  assert.equal('callNames' in fallback, false)
})

test('parseGardenView repairs bad input and never throws', () => {
  const emptyView = viewGardenState(initGardenState())
  for (const bad of [undefined, null, [], 'nope', 7]) {
    assert.deepEqual(parseGardenView(bad), emptyView)
  }
  const parsed = parseGardenView({
    planted: -1,
    plants: [{ seq: 1, t: 2, kind: 'cactus', w: 37 }, { kind: 'bogus' }],
    harvestedByKind: { cactus: -1, flower: 2.5 },
    callNames: { leak: 'bash' },
    extra: 'ignored',
  })
  assert.equal(parsed.planted, 0)
  assert.deepEqual(parsed.plants, [{ seq: 1, t: 2, kind: 'cactus', w: 37 }])
  assert.deepEqual(parsed.harvestedByKind, { cactus: 0, flower: 2, weed: 0, bamboo: 0, grass: 0, sprout: 0 })
  assert.equal('callNames' in parsed, false, 'a leaked callNames view field is dropped')
  assert.equal('extra' in parsed, false)
  // A parsed view round-trips unchanged through the view parser.
  assert.deepEqual(parseGardenView(parsed), parsed)
})

// ------------------------------------------------------------- fake ctx/apply
function fakeContext(options = {}) {
  const effects = []
  const registrations = []
  const warnings = []
  const handles = []
  const ctx = {
    logger: {
      warn(message) { warnings.push(String(message)) },
      error() {},
    },
    effect(fn, label) {
      const dispose = fn()
      effects.push({ dispose, label })
      return dispose
    },
    sessionProjections: {
      register(definition) {
        registrations.push(definition)
        if (options.throwOnRegister !== undefined) throw options.throwOnRegister
        const handle = {
          disposed: 0,
          dispose() { this.disposed += 1 },
        }
        handles.push(handle)
        return options.thenable === true ? options.thenableFor(handle) : handle
      },
    },
    __effects: effects,
    __registrations: registrations,
    __warnings: warnings,
    __handles: handles,
  }
  if (options.services === false) delete ctx.sessionProjections
  if (options.effect === false) delete ctx.effect
  return ctx
}

await testAsync('apply() registers the garden projection inside one owned effect', async () => {
  const ctx = fakeContext()
  const disposer = apply(ctx)
  assert.equal(ctx.__registrations.length, 1)
  assert.equal(ctx.__registrations[0], GARDEN_PROJECTION)
  assert.equal(ctx.__registrations[0].key, 'garden')
  assert.equal(ctx.__effects.length, 1)
  assert.equal(ctx.__effects[0].label, 'context-garden: garden projection')
  assert.equal(typeof disposer, 'function')
  await flush()
  // Registration resolved to a retained handle; teardown disposes it.
  assert.equal(ctx.__handles.length, 1)
  ctx.__effects[0].dispose()
  assert.equal(ctx.__handles[0].disposed, 1)
})

await testAsync('apply() disposes a handle that resolves after teardown', async () => {
  let resolveRegister = null
  const ctx = fakeContext({
    thenable: true,
    thenableFor(handle) {
      return {
        then(onFulfilled) { resolveRegister = () => onFulfilled(handle) },
      }
    },
  })
  apply(ctx)
  await flush()
  assert.equal(typeof resolveRegister, 'function', 'the registration thenable was consumed')
  // Teardown happens before the handle resolves.
  ctx.__effects[0].dispose()
  assert.equal(ctx.__handles[0].disposed, 0)
  resolveRegister()
  await flush()
  assert.equal(ctx.__handles[0].disposed, 1, 'the late handle is disposed after teardown')
})

await testAsync('a synchronously throwing register() only warns and does not throw', async () => {
  const ctx = fakeContext({ throwOnRegister: new Error('key already taken') })
  let disposer
  assert.doesNotThrow(() => { disposer = apply(ctx) })
  assert.equal(typeof disposer, 'function')
  await flush()
  assert.equal(ctx.__warnings.length, 1)
  assert.match(ctx.__warnings[0], /registration failed: Error: key already taken/)
  assert.equal(typeof ctx.__effects[0].dispose, 'function', 'the effect still owns a cleanup')
})

await testAsync('a registration rejection only warns and does not throw', async () => {
  const ctx = fakeContext()
  ctx.sessionProjections.register = () => Promise.reject(new Error('backend down'))
  apply(ctx)
  await flush()
  assert.equal(ctx.__warnings.length, 1)
  assert.match(ctx.__warnings[0], /registration failed: Error: backend down/)
})

await testAsync('apply() survives a context without the projection service', async () => {
  const ctx = fakeContext({ services: false })
  assert.doesNotThrow(() => apply(ctx))
  await flush()
  assert.equal(ctx.__warnings.length, 1)
  assert.match(ctx.__warnings[0], /registration failed/)
})

await testAsync('apply() survives a context with no effect service', async () => {
  const ctx = fakeContext({ effect: false })
  assert.doesNotThrow(() => apply(ctx))
  assert.equal(ctx.__warnings.length, 1)
  assert.equal(ctx.__registrations.length, 0)
})

console.log(`\n${passed} host tests passed`)