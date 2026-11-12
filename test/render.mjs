#!/usr/bin/env node
/**
 * Browser-half tests without a browser.
 *
 * A tiny React stand-in runs the real dock and sidebar components: hooks keep
 * state across passes, effects actually run, and a prop sequence lets a test
 * simulate a projection change such as a fresh compaction. The client bundle
 * is loaded in a sandbox exactly the way the DSH module loader runs it, so the
 * registration surface (`inject`, `apply`, slots, tab type, dictionaries) is
 * exercised for real.
 *
 * Run with: node test/render.mjs
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import * as host from '../index.js'

const source = fs.readFileSync(new URL('../client.js', import.meta.url), 'utf8')
const LOCALE_DIR = new URL('../locale/', import.meta.url)

let passed = 0
async function test(name, fn) {
  await fn()
  passed += 1
  console.log('ok -', name)
}

// ---------------------------------------------------------------- harness
function createRuntime() {
  const hooks = []
  const runtime = { cursor: 0, effects: [], dirty: false }
  const React = {
    createElement(type, props, ...children) {
      return {
        type,
        props: props || {},
        children: children.flat(Infinity).filter((child) => child !== null && child !== undefined && child !== false && child !== true),
      }
    },
    useState(initial) {
      const index = runtime.cursor
      runtime.cursor += 1
      if (!(index in hooks)) hooks[index] = typeof initial === 'function' ? initial() : initial
      const setter = (next) => {
        const value = typeof next === 'function' ? next(hooks[index]) : next
        if (value !== hooks[index]) {
          hooks[index] = value
          runtime.dirty = true
        }
      }
      return [hooks[index], setter]
    },
    useEffect(fn) {
      runtime.effects.push(fn)
    },
    useRef(value) {
      const index = runtime.cursor
      runtime.cursor += 1
      if (!(index in hooks)) hooks[index] = { current: value }
      return hooks[index]
    },
    useMemo(fn) {
      return fn()
    },
    useCallback(fn) {
      return fn
    },
    memo: (component) => component,
    Fragment: 'fragment',
  }
  runtime.React = React
  return runtime
}

function expand(node, React, depth = 0) {
  if (node === null || node === undefined || node === false || node === true) return []
  if (typeof node === 'string' || typeof node === 'number') return [String(node)]
  if (Array.isArray(node)) return node.flatMap((child) => expand(child, React, depth))
  if (depth > 80) throw new Error('render tree too deep')
  const { type, props, children } = node
  if (typeof type === 'function') {
    const merged = { ...props }
    if (children.length === 1) merged.children = children[0]
    else if (children.length > 1) merged.children = children
    return expand(type(merged), React, depth + 1)
  }
  return [{ tag: type, props, children: children.flatMap((child) => expand(child, React, depth + 1)) }]
}

function newOut() {
  return {
    text: [],
    tags: [],
    classes: [],
    labels: [],
    seasons: [],
    kinds: [],
    styleText: [],
    handlers: [],
  }
}

function walk(nodes, out) {
  for (const node of nodes) {
    if (typeof node === 'string') {
      out.text.push(node)
      continue
    }
    out.tags.push(node.tag)
    if (typeof node.props.className === 'string') out.classes.push(node.props.className)
    if (node.props['aria-label']) out.labels.push(String(node.props['aria-label']))
    if (node.props.title) out.labels.push(String(node.props.title))
    if (node.props['data-season'] !== undefined) out.seasons.push(String(node.props['data-season']))
    if (node.props['data-kind'] !== undefined) out.kinds.push(String(node.props['data-kind']))
    if (node.props.onClick || node.props.onKeyDown) out.handlers.push(node.props)
    walk(node.children, out)
  }
}

/** Count class tokens exactly (className may carry several). */
function classCount(out, token) {
  let count = 0
  for (const value of out.classes) {
    if (value.split(/\s+/).includes(token)) count += 1
  }
  return count
}

const unrefTimer = (fn) => (...args) => {
  const timer = fn(...args)
  if (timer && typeof timer.unref === 'function') timer.unref()
  return timer
}

function loadClient(options = {}) {
  let factory = null
  const sandbox = {
    window: {
      __ModuleLoader__: {
        load(spec) {
          factory = spec.factory
        },
      },
    },
    document: {
      documentElement: { lang: options.lang || 'zh-CN' },
      baseURI: 'http://127.0.0.1:56705/',
      addEventListener() {},
      removeEventListener() {},
    },
    navigator: { language: options.lang || 'zh-CN' },
    URL,
    setTimeout: unrefTimer(setTimeout),
    clearTimeout,
    setInterval: unrefTimer(setInterval),
    clearInterval,
    console,
  }
  sandbox.globalThis = sandbox
  vm.createContext(sandbox)
  vm.runInContext(source, sandbox, { filename: 'client.js' })
  if (factory === null) throw new Error('client did not register a factory')
  const runtime = createRuntime()
  const moduleExports = factory((request) => {
    if (request === 'react') return runtime.React
    throw new Error('unexpected require: ' + request)
  })
  return { moduleExports, runtime }
}

/** Fake client plugin context: slots, dictionaries, tab registry, sidebar. */
function fakeClientContext() {
  const slotRegistrations = []
  const tabTypes = []
  const opened = []
  const dictionaries = []
  const ctx = {
    slots: {
      inject(name, callback) {
        return callback()
      },
      register(options, component) {
        const entry = { options, component }
        slotRegistrations.push(entry)
        return entry
      },
    },
    effect(fn) {
      return fn()
    },
    locale: {
      register(namespace, dictionary) {
        dictionaries.push({ namespace, dictionary })
        return () => {}
      },
    },
    sidebarRightTabs: {
      register(definition) {
        tabTypes.push(definition)
        return () => {}
      },
    },
    sidebarRight: {
      openTab(kind) {
        opened.push(kind)
      },
    },
  }
  return { ctx, slotRegistrations, tabTypes, opened, dictionaries }
}

async function mount(runtime, component, propsSteps, options = {}) {
  const React = runtime.React
  const maxPasses = options.maxPasses ?? 12
  let tree = null
  let lastCleanups = []
  for (let pass = 0; pass < maxPasses; pass += 1) {
    runtime.cursor = 0
    runtime.effects = []
    runtime.dirty = false
    const props = propsSteps[Math.min(pass, propsSteps.length - 1)]
    tree = expand(React.createElement(component, props), React, 0)
    const cleanups = []
    for (const effect of runtime.effects) {
      const cleanup = await effect()
      if (typeof cleanup === 'function') cleanups.push(cleanup)
    }
    await new Promise((resolve) => setTimeout(resolve, 0))
    for (const cleanup of cleanups) cleanup()
    lastCleanups = cleanups
    const moreSteps = pass + 1 < propsSteps.length
    if (!runtime.dirty && !moreSteps) break
  }
  const out = newOut()
  walk(tree, out)
  out.joined = out.text.join(' ')
  out.cleanup = () => {
    for (const cleanup of lastCleanups) cleanup()
  }
  return out
}

// ---------------------------------------------------------------- fixtures
function kindCounts(values = {}) {
  const out = {}
  for (const kind of host.KINDS) out[kind] = values[kind] ?? 0
  return out
}

function plant(seq, kind, w = 40) {
  return { seq, t: 1760000000000 + seq * 1000, kind, w }
}

function garden(overrides = {}) {
  return {
    plants: [],
    counts: kindCounts(),
    harvestedByKind: kindCounts(),
    seedsByKind: kindCounts(),
    harvests: [],
    harvestCount: 0,
    harvested: 0,
    planted: 0,
    seeds: 0,
    lastHarvestAt: 0,
    errors: 0,
    ...overrides,
  }
}

function projections(gardenValue, pressureValue) {
  return { garden: gardenValue, contextPressure: pressureValue }
}

function dockProps(projectionMap, extra = {}) {
  return {
    useProjection: (key) => projectionMap[key],
    t: undefined,
    openGardenTab: () => {},
    ...extra,
  }
}

function panelProps(projectionMap, extra = {}) {
  return {
    useProjection: (key) => projectionMap[key],
    t: undefined,
    ...extra,
  }
}

const PRESSURE_LOW = { pressureTokens: 12000, contextWindow: 128000 }
const PRESSURE_MID = { pressureTokens: 64000, contextWindow: 128000 }
const PRESSURE_HIGH = { pressureTokens: 106000, contextWindow: 128000 }

// ------------------------------------------------- mirrored model checks
await test('client constants mirror the host model', () => {
  const { moduleExports } = loadClient()
  const model = moduleExports.__model
  assert.deepEqual([...model.KINDS], [...host.KINDS])
  assert.equal(model.FIELD_CAP, host.FIELD_CAP)
  assert.equal(model.HARVEST_CAP, host.HARVEST_CAP)
  assert.deepEqual([...model.SEASONS], ['spring', 'summer', 'autumn', 'winter'])
  assert.equal(model.TAB_KIND, 'context-garden')
  assert.equal(model.TAB_ID, '@ruaibeite/dsh-context-garden/garden')
})

await test('normalizeGarden repairs a malformed projection', () => {
  const { moduleExports } = loadClient()
  const normalize = moduleExports.__model.normalizeGarden
  const broken = normalize({
    plants: [
      { seq: 3, kind: 'cactus', w: 40 },
      { seq: 4, kind: 'unknown-kind', w: -10 },
      { seq: 5, kind: 'flower', w: 99999 },
      'junk',
      null,
    ],
    counts: { cactus: -2, flower: 3 },
    seeds: -5,
    seedsByKind: { flower: 7 },
    harvests: [{ at: 100, n: 2, seeds: 3, counts: { flower: 2 } }, 'bad'],
    harvestCount: -1,
    planted: -9,
    harvestedByKind: null,
  })
  assert.equal(broken.plants.length, 3)
  assert.equal(broken.plants[1].kind, 'grass')
  assert.equal(broken.plants[1].w, 1)
  assert.equal(broken.plants[2].w, 4000)
  assert.equal(broken.counts.cactus, 0)
  assert.equal(broken.counts.flower, 3)
  assert.equal(broken.seeds, 7)
  assert.equal(broken.harvestCount, 0)
  assert.equal(broken.planted, 3)
  assert.equal(broken.harvests.length, 1)
  assert.equal(broken.seedsByKind.flower, 7)
  assert.equal(broken.harvestedByKind.cactus, 0)
  assert.equal(normalize(undefined).plants.length, 0)
  assert.equal(normalize(null).seeds, 0)
})

await test('seasons follow context pressure, harvests put the field to winter', () => {
  const { moduleExports } = loadClient()
  const seasonOf = moduleExports.__model.seasonOf
  const field = plant(1, 'cactus')
  assert.equal(seasonOf(garden({ plants: [field] }), PRESSURE_LOW).key, 'spring')
  assert.equal(seasonOf(garden({ plants: [field] }), PRESSURE_MID).key, 'summer')
  assert.equal(seasonOf(garden({ plants: [field] }), PRESSURE_HIGH).key, 'autumn')
  assert.equal(seasonOf(garden({ plants: [field] }), PRESSURE_HIGH).nearHarvest, true)
  assert.equal(seasonOf(garden({ plants: [field] }), PRESSURE_MID).nearHarvest, false)
  assert.equal(seasonOf(garden({ plants: [field], harvestCount: 2 }), PRESSURE_LOW).key, 'winter')
  assert.equal(seasonOf(garden({ plants: [field, plant(2, 'grass')], harvestCount: 2 }), PRESSURE_LOW).key, 'spring')
  // No contextPressure at all: fall back to how much is on the field.
  assert.equal(seasonOf(garden({ plants: [field] }), undefined).key, 'spring')
  assert.equal(seasonOf(garden({ plants: Array.from({ length: 12 }, (_, i) => plant(i, 'grass')) }), undefined).key, 'summer')
  assert.equal(seasonOf(garden({ plants: Array.from({ length: 20 }, (_, i) => plant(i, 'grass')) }), undefined).key, 'autumn')
})

await test('seed milestones unlock the courtyard in order', () => {
  const { moduleExports } = loadClient()
  const { unlockedOf, nextUnlockOf } = moduleExports.__model
  assert.equal(nextUnlockOf(0).key, 'stone')
  assert.equal(unlockedOf(0).stone, false)
  assert.equal(unlockedOf(1).stone, true)
  assert.equal(unlockedOf(39).lantern, false)
  assert.equal(unlockedOf(40).lantern, true)
  assert.equal(unlockedOf(843).gate, true)
  assert.equal(nextUnlockOf(843), null)
  assert.equal(nextUnlockOf(120).key, 'rake')
})

await test('every plant kind has sprite metadata and bilingual copy', () => {
  const { moduleExports } = loadClient()
  const model = moduleExports.__model
  assert.equal(model.KINDS.length, 11)
  for (const kind of host.KINDS) {
    for (const locale of ['zh', 'en']) {
      assert.equal(typeof model.TEXT[locale]['kind.' + kind], 'string', 'missing kind.' + kind + ' in ' + locale)
      assert.equal(typeof model.TEXT[locale]['kind.' + kind + 'Mean'], 'string', 'missing mean for ' + kind + ' in ' + locale)
      assert.ok(model.TEXT[locale]['kind.' + kind].length > 0)
      assert.ok(model.TEXT[locale]['kind.' + kind + 'Mean'].length > 0)
    }
    assert.equal(typeof host.KINDS.indexOf(kind), 'number')
  }
  // species introduced in v0.2.0
  for (const kind of ['rice', 'ivy', 'dandelion', 'mushroom', 'lotus']) {
    assert.ok(model.TEXT.zh['kind.' + kind], 'new kind missing zh copy: ' + kind)
    assert.ok(model.TEXT.en['kind.' + kind], 'new kind missing en copy: ' + kind)
  }
})

// --------------------------------------------------- dictionaries & i18n
await test('locale dictionaries are complete and bilingual', () => {
  const { moduleExports } = loadClient()
  const text = moduleExports.__model.TEXT
  const zhKeys = Object.keys(text.zh).sort()
  const enKeys = Object.keys(text.en).sort()
  assert.deepEqual(zhKeys, enKeys, 'zh/en key sets differ')
  for (const value of Object.values(text.zh)) assert.ok(value.length > 0)
  for (const value of Object.values(text.en)) assert.ok(value.length > 0)
  for (const raw of Object.values(text)) {
    for (const value of Object.values(raw)) {
      assert.ok(!value.includes('\u200b'), 'zero width space found')
      assert.ok(!value.includes('\ufeff'), 'byte order mark found')
    }
  }
  const metaKeys = ['panel.title', 'panel.warehouse', 'panel.legend', 'panel.note', 'season.spring', 'season.winter', 'kind.cactus', 'unlock.gate', 'harvest.gained']
  for (const key of metaKeys) {
    assert.ok(text.zh[key], 'missing zh key ' + key)
    assert.ok(text.en[key], 'missing en key ' + key)
  }
  for (const lang of ['zh', 'en']) {
    const json = JSON.parse(fs.readFileSync(new URL(lang + '.json', LOCALE_DIR), 'utf8'))
    assert.equal(typeof json.meta.title, 'string')
    assert.equal(typeof json.meta.description, 'string')
    assert.ok(json.meta.title.length > 0)
    assert.ok(json.meta.description.length > 0)
  }
})

// -------------------------------------------------------- plugin wiring
await test('apply registers the composer-top dock, dictionaries, tab type and tab body', () => {
  const { moduleExports } = loadClient()
  const { ctx, slotRegistrations, tabTypes, dictionaries } = fakeClientContext()
  moduleExports.apply(ctx)
  const dock = slotRegistrations.find((entry) => entry.options.name === 'conversation.input.dock')
  assert.ok(dock, 'composer-top dock slot not registered')
  assert.equal(dock.options.id, 'context-garden')
  assert.equal(dock.options.order, 4)
  assert.equal(dock.options.locale, '@ruaibeite/dsh-context-garden')
  assert.equal(typeof dock.component, 'function')
  const body = slotRegistrations.find((entry) => entry.options.name === 'sidebar.right.pane.tab')
  assert.ok(body, 'sidebar tab body not registered')
  assert.equal(body.options.key, '@ruaibeite/dsh-context-garden/garden')
  const title = slotRegistrations.find((entry) => entry.options.name === 'sidebar.right.pane.tab.title')
  assert.ok(title, 'sidebar tab title not registered')
  assert.equal(tabTypes.length, 1)
  assert.equal(tabTypes[0].kind, 'context-garden')
  assert.equal(tabTypes[0].id, '@ruaibeite/dsh-context-garden/garden')
  assert.equal(tabTypes[0].priority, 'builtin')
  assert.equal(typeof tabTypes[0].title, 'function')
  assert.equal(dictionaries.length, 1)
  assert.equal(dictionaries[0].namespace, '@ruaibeite/dsh-context-garden')
  assert.equal(typeof dictionaries[0].dictionary.zh, 'object')
  assert.equal(typeof dictionaries[0].dictionary.en, 'object')
})

await test('dock click and keyboard open the sidebar tab', async () => {
  const { moduleExports } = loadClient()
  const { ctx, slotRegistrations, opened } = fakeClientContext()
  moduleExports.apply(ctx)
  const dock = slotRegistrations.find((entry) => entry.options.name === 'conversation.input.dock')
  const props = dock.options.inject()
  assert.equal(typeof props.openGardenTab, 'function')
  props.openGardenTab()
  assert.deepEqual(opened, ['context-garden'])
})

// ------------------------------------------------------------- the dock
await test('dock renders the season, the mini field and the seed balance', async () => {
  const { moduleExports, runtime } = loadClient()
  const model = moduleExports.__model
  const gardenValue = garden({
    plants: [plant(1, 'cactus'), plant(2, 'flower'), plant(3, 'grass')],
    planted: 3,
    seeds: 128,
    harvested: 41,
    harvestCount: 7,
    seedsByKind: kindCounts({ cactus: 80, flower: 48 }),
    harvestedByKind: kindCounts({ cactus: 20, flower: 21 }),
  })
  const out = await mount(runtime, model.GardenDock, [dockProps(projections(gardenValue, PRESSURE_MID))])
  assert.ok(out.classes.some((name) => name.includes('cg-dock')), 'dock root missing')
  assert.ok(out.seasons.includes('summer'), 'dock should be in summer: ' + out.seasons.join(','))
  assert.ok(out.joined.includes('128'), 'seed balance missing')
  assert.ok(out.joined.includes('7'), 'harvest count missing')
  assert.ok(out.joined.includes('种子'), 'seed label missing')
  assert.ok(out.labels.some((label) => label.includes('打开上下文花园')), 'aria label missing')
  assert.equal(classCount(out, 'cg-plant'), 3, 'expected three plants drawn')
  assert.deepEqual([...new Set(out.kinds)].sort(), ['cactus', 'flower', 'grass'])
})

await test('dock degrades to an empty garden when the projection is missing', async () => {
  const { moduleExports, runtime } = loadClient()
  const model = moduleExports.__model
  const out = await mount(runtime, model.GardenDock, [dockProps({})])
  assert.ok(out.classes.some((name) => name.includes('cg-dock')))
  assert.equal(classCount(out, 'cg-plant'), 0)
  assert.ok(out.seasons.includes('spring'))
})

// ------------------------------------------------------------ the panel
await test('panel renders field, ring, seed store, harvest log and legend', async () => {
  const { moduleExports, runtime } = loadClient()
  const model = moduleExports.__model
  const gardenValue = garden({
    plants: [plant(1, 'cactus', 300), plant(2, 'flower', 800), plant(3, 'weed', 120), plant(4, 'bamboo', 500), plant(5, 'grass', 90), plant(6, 'sprout', 60)],
    planted: 1231,
    seeds: 843,
    harvested: 437,
    harvestCount: 44,
    harvestedByKind: kindCounts({ cactus: 306, flower: 84, weed: 2, bamboo: 55, grass: 0, sprout: 0 }),
    seedsByKind: kindCounts({ cactus: 645, flower: 120, weed: 2, bamboo: 55, grass: 21, sprout: 0 }),
    harvests: [
      { at: 1793952652000, n: 12, seeds: 19, counts: kindCounts({ cactus: 7, flower: 2, bamboo: 3 }) },
      { at: 1793952650000, n: 4, seeds: 6, counts: kindCounts({ cactus: 3, sprout: 1 }) },
    ],
    lastHarvestAt: 1793952652000,
  })
  const out = await mount(runtime, model.GardenPanel, [panelProps(projections(gardenValue, PRESSURE_MID))])
  assert.ok(out.joined.includes('上下文花园'), 'panel title missing')
  assert.ok(out.joined.includes('枝叶渐茂'), 'summer copy missing')
  assert.ok(out.joined.includes('843'), 'seed balance missing')
  assert.ok(out.joined.includes('44'), 'harvest count missing')
  assert.ok(out.joined.includes('1231'), 'planted total missing')
  assert.ok(out.joined.includes('种子仓'), 'warehouse heading missing')
  assert.ok(out.joined.includes('收割记录'), 'harvest log heading missing')
  assert.ok(out.joined.includes('第 44 次'), 'latest harvest ordinal missing')
  assert.ok(out.joined.includes('第 43 次'), 'previous harvest ordinal missing')
  assert.ok(out.joined.includes('图鉴'), 'legend heading missing')
  for (const kind of host.KINDS) assert.ok(out.kinds.includes(kind), 'legend/plant kind missing: ' + kind)
  assert.ok(out.classes.some((name) => name.includes('cg-ring')), 'season ring missing')
  assert.ok(out.seasons.includes('summer'))
  // All five courtyard tiers are unlocked at 843 lifetime seeds.
  for (const name of ['cg-decor-gate', 'cg-decor-rake', 'cg-decor-pond', 'cg-decor-lantern', 'cg-decor-stone']) {
    assert.ok(out.classes.some((value) => value.includes(name)), 'missing unlocked decoration: ' + name)
  }
  assert.ok(out.joined.includes('庭院已满'), 'all-unlocked copy missing')
})

await test('panel hides courtyard decorations before they are earned', async () => {
  const { moduleExports, runtime } = loadClient()
  const model = moduleExports.__model
  const out = await mount(runtime, model.GardenPanel, [panelProps(projections(garden({ plants: [plant(1, 'sprout')] }), PRESSURE_LOW))])
  for (const name of ['cg-decor-gate', 'cg-decor-rake', 'cg-decor-pond', 'cg-decor-lantern']) {
    assert.ok(!out.classes.some((value) => value.includes(name)), 'unexpected unlocked decoration: ' + name)
  }
  assert.ok(out.classes.some((value) => value.includes('cg-decor-stone')) === false)
  assert.ok(out.joined.includes('再收'), 'next-unlock hint missing')
  assert.ok(out.joined.includes('苔石'), 'next unlock name missing')
})

await test('panel shows the empty field copy and a winter field after a harvest', async () => {
  const { moduleExports, runtime } = loadClient()
  const model = moduleExports.__model
  const empty = await mount(runtime, model.GardenPanel, [panelProps(projections(garden({ seedCount: 0 }), PRESSURE_LOW))])
  assert.ok(empty.joined.includes('田间还没有植物'), 'empty-field copy missing')
  const winter = await mount(
    runtime,
    model.GardenPanel,
    [panelProps(projections(garden({ plants: [], harvestCount: 3, seeds: 40 }), PRESSURE_LOW))],
  )
  assert.ok(winter.seasons.includes('winter'), 'winter season missing: ' + winter.seasons.join(','))
  assert.ok(winter.joined.includes('雪下藏春'), 'winter copy missing')
  assert.ok(winter.joined.includes('待播种') || winter.classes.some((name) => name.includes('cg-scene')), 'winter field missing')
})

// ------------------------------------------------- ambient overlay & bed
await test('composition sampling keeps every present species in the bed', () => {
  const { moduleExports } = loadClient()
  const sample = moduleExports.__model.sampleField
  const field = []
  for (let i = 0; i < 120; i += 1) field.push(plant(i + 1, i % 3 === 0 ? 'ivy' : 'cactus', 60))
  for (let i = 0; i < 4; i += 1) field.push(plant(200 + i, 'flower', 90))
  for (let i = 0; i < 2; i += 1) field.push(plant(300 + i, 'rice', 120))
  const picked = sample(field, 26)
  assert.equal(picked.length, 26)
  const kinds = new Set(picked.map((value) => value.kind))
  for (const kind of ['ivy', 'cactus', 'flower', 'rice']) assert.ok(kinds.has(kind), 'species dropped: ' + kind)
  assert.ok(!kinds.has('lotus'), 'absent species must not appear')
  // deterministic and in log order
  const again = sample(field, 26)
  assert.deepEqual(again.map((value) => value.seq), picked.map((value) => value.seq))
  for (let i = 1; i < picked.length; i += 1) assert.ok(picked[i - 1].seq <= picked[i].seq, 'not in log order')
  // capacity smaller than the species count: still newest-first, no crash
  const tiny = sample(field, 2)
  assert.equal(tiny.length, 2)
  assert.equal(sample([], 10).length, 0)
  assert.equal(sample(field, 0).length, 0)
})

await test('ambient plan stays within budget and follows the season', () => {
  const { moduleExports } = loadClient()
  const planOf = moduleExports.__model.ambientPlan
  const rich = garden({
    counts: kindCounts({ ivy: 180, grass: 40, sprout: 20, mushroom: 12, weed: 3, dandelion: 3, flower: 4 }),
    harvestCount: 2,
  })
  const summer = { key: 'summer', index: 1, pressure: 0.5, nearHarvest: false }
  const plan = planOf(rich, summer, {})
  assert.ok(plan.vines > 0 && plan.vines <= 16, 'vine budget broken: ' + plan.vines)
  assert.ok(plan.edge.length >= 1 && plan.edge.length <= 3, 'edge budget broken')
  assert.equal(plan.particles, 'seeds', 'dandelions should claim the particle slot')
  assert.ok(plan.particlesCount > 0 && plan.particlesCount <= 40)
  // winter never shows seeds, and rare flora sizes the edge band
  const winter = planOf(rich, { key: 'winter', index: 3, pressure: 0.9, nearHarvest: false }, {})
  assert.equal(winter.particles, 'snow')
  assert.ok(winter.edge.includes('tuple') === false)
  // reduced motion: no particles, fewer vines
  const reduced = planOf(rich, summer, { reduced: true })
  assert.equal(reduced.particles, null)
  assert.equal(reduced.particlesCount, 0)
  assert.ok(reduced.vines <= 6)
  // empty garden: nothing at all
  const empty = planOf(garden({}), summer, {})
  assert.equal(empty.vines, 0)
  assert.equal(empty.particles, null)
  assert.equal(empty.edge.length, 0)
})

await test('overlay markup draws two vine strips and one particle family', () => {
  const { moduleExports } = loadClient()
  const build = moduleExports.__model.buildOverlayMarkup
  const base = { vines: 8, edge: ['tufts', 'sprouts', 'mushrooms'], particles: 'seeds', particlesCount: 10, reduced: false }
  const html = build({ width: 900, height: 700 }, base)
  assert.ok(html.includes('cg-ambient-vine-layer'), 'vine layer missing')
  assert.equal((html.match(/<svg class="cg-ambient-vines/g) || []).length, 2, 'expected two side strips')
  assert.ok(html.includes('preserveAspectRatio="xMidYMid slice"'), 'vines must keep their aspect')
  assert.ok(html.includes('cg-vine') && html.includes('cg-vine-leaf'), 'vine strokes or leaves missing')
  // the brim flora lives in the bed now, not in the overlay
  assert.ok(!html.includes('cg-ambient-edge'), 'edge band should no longer be part of the overlay')
  const particles = (html.match(/cg-particle /g) || []).length
  assert.equal(particles, 10)
  assert.ok(html.includes('cg-particle-seeds'), 'seed particle class missing')
  // reduced motion keeps the static vines and drops the particles
  const reduced = build({ width: 900, height: 700 }, { ...base, particlesCount: 0 })
  assert.ok(!reduced.includes('cg-particle '), 'no particles under reduced motion')
  assert.ok(reduced.includes('cg-vine'), 'static vines should remain')
  // nothing at all
  assert.equal(build({ width: 900, height: 700 }, {}), '')
  assert.equal(build({ width: 900, height: 700 }, { vines: 0, edge: [], particles: null, particlesCount: 0 }), '')
})

await test('the bed draws every species at a legible intrinsic size', async () => {
  const { moduleExports, runtime } = loadClient()
  const model = moduleExports.__model
  const plants = host.KINDS.map((kind, index) => plant(index + 1, kind, 120))
  const gardenValue = garden({ plants, planted: plants.length })
  const season = model.seasonOf(gardenValue, PRESSURE_MID)
  const out = await mount(runtime, model.GardenBed, [{ garden: gardenValue, season, flash: null, tr: (key) => key, width: 900 }])
  assert.equal(classCount(out, 'cg-plant'), host.KINDS.length, 'every kind should be drawn')
  const kinds = [...new Set(out.kinds)]
  for (const kind of host.KINDS) assert.ok(kinds.includes(kind), 'missing bed plant ' + kind)
  for (const kind of host.KINDS) {
    const art = model.SPECIES_ART[kind]
    assert.ok(art && art.read >= 15 && art.read <= 23, 'species read size out of range: ' + kind)
  }
  assert.ok(classCount(out, 'cg-bed-brim') > 0, 'brim flora missing')
})

await test('the bed capacity follows the measured width', async () => {
  const plants = Array.from({ length: 80 }, (_, i) => plant(i + 1, i % 2 ? 'grass' : 'cactus', 60))
  const gardenValue = garden({ plants, planted: plants.length })
  // Fresh runtimes: the mini harness keeps hook state per load, which is what a
  // remount looks like, so each width gets its own instance.
  const wideClient = loadClient()
  const wideSeason = wideClient.moduleExports.__model.seasonOf(gardenValue, PRESSURE_MID)
  const wide = await mount(wideClient.runtime, wideClient.moduleExports.__model.GardenBed, [
    { garden: gardenValue, season: wideSeason, flash: null, tr: (key) => key, width: 960 },
  ])
  const narrowClient = loadClient()
  const narrowSeason = narrowClient.moduleExports.__model.seasonOf(gardenValue, PRESSURE_MID)
  const narrow = await mount(narrowClient.runtime, narrowClient.moduleExports.__model.GardenBed, [
    { garden: gardenValue, season: narrowSeason, flash: null, tr: (key) => key, width: 300 },
  ])
  assert.equal(classCount(wide, 'cg-plant'), 30, 'wide bed should seat 30 plants')
  assert.equal(classCount(narrow, 'cg-plant'), 10, 'narrow bed should seat 10 plants')
})

await test('a harvested bed in winter shows the lotus alone', async () => {
  const { moduleExports, runtime } = loadClient()
  const model = moduleExports.__model
  const gardenValue = garden({ plants: [plant(9, 'lotus', 400)], planted: 10, harvestCount: 3, seeds: 40 })
  const season = model.seasonOf(gardenValue, PRESSURE_MID)
  assert.equal(season.key, 'winter')
  const out = await mount(runtime, model.GardenBed, [{ garden: gardenValue, season, flash: null, tr: (key) => key, width: 900 }])
  assert.ok(out.seasons.includes('winter'))
  assert.deepEqual([...new Set(out.kinds)], ['lotus'])
  assert.equal(classCount(out, 'cg-plant'), 1)
})

// --------------------------------------------------------- harvest flash
await test('a fresh compaction plays the harvest flash once', async () => {
  const { moduleExports, runtime } = loadClient()
  const model = moduleExports.__model
  const before = garden({
    plants: [plant(1, 'cactus'), plant(2, 'flower'), plant(3, 'grass')],
    planted: 3,
    seeds: 4,
    harvestCount: 1,
    harvests: [{ at: 1, n: 3, seeds: 4, counts: kindCounts({ cactus: 1, flower: 1, grass: 1 }) }],
    harvestedByKind: kindCounts({ cactus: 1, flower: 1, grass: 1 }),
    seedsByKind: kindCounts({ cactus: 1, flower: 2, grass: 1 }),
  })
  const after = garden({
    plants: [],
    planted: 3,
    seeds: 11,
    harvestCount: 2,
    harvests: [
      { at: 1, n: 3, seeds: 4, counts: kindCounts({ cactus: 1, flower: 1, grass: 1 }) },
      { at: 2, n: 9, seeds: 7, counts: kindCounts({ cactus: 6, bamboo: 3 }) },
    ],
    harvestedByKind: kindCounts({ cactus: 7, flower: 1, bamboo: 3, grass: 1 }),
    seedsByKind: kindCounts({ cactus: 7, flower: 2, bamboo: 3, grass: 1 }),
  })
  const out = await mount(runtime, model.GardenDock, [
    dockProps(projections(before, PRESSURE_MID)),
    dockProps(projections(after, PRESSURE_MID)),
  ])
  assert.ok(out.classes.some((name) => name.includes('cg-gain')), 'dock harvest gain badge missing')
  assert.ok(out.joined.includes('+7'), 'gained seed count missing')

  const panel = await mount(runtime, model.GardenPanel, [
    panelProps(projections(before, PRESSURE_LOW)),
    panelProps(projections(after, PRESSURE_LOW)),
  ])
  assert.ok(panel.classes.some((name) => name.includes('cg-scene-banner')), 'panel harvest banner missing')
  assert.ok(panel.joined.includes('收割'), 'harvest banner text missing')
  assert.ok(panel.joined.includes('9'), 'harvested plant count missing')
})

await test('reopening a harvested session does not replay the flash', async () => {
  const { moduleExports, runtime } = loadClient()
  const model = moduleExports.__model
  const reopened = garden({
    plants: [],
    seeds: 843,
    harvestCount: 44,
    harvests: [{ at: 2, n: 9, seeds: 7, counts: kindCounts({ cactus: 9 }) }],
    harvestedByKind: kindCounts({ cactus: 437 }),
    seedsByKind: kindCounts({ cactus: 843 }),
  })
  const out = await mount(runtime, model.GardenPanel, [panelProps(projections(reopened, PRESSURE_LOW))])
  assert.ok(!out.classes.some((name) => name.includes('cg-scene-banner')), 'flash replayed on reopen')
  assert.ok(!out.classes.some((name) => name.includes('cg-gain')), 'gain badge replayed on reopen')
})

await test('panel handles a missing projection without throwing', async () => {
  const { moduleExports, runtime } = loadClient()
  const model = moduleExports.__model
  const out = await mount(runtime, model.GardenPanel, [panelProps({})])
  assert.ok(out.joined.includes('上下文花园'))
  assert.ok(out.classes.some((name) => name.includes('cg-field')))
  assert.equal(classCount(out, 'cg-plant'), 0)
})

await test('english locale renders english copy', async () => {
  const { moduleExports, runtime } = loadClient({ lang: 'en-US' })
  const model = moduleExports.__model
  const out = await mount(runtime, model.GardenPanel, [panelProps(projections(garden({ plants: [plant(1, 'cactus')] }), PRESSURE_MID))])
  assert.ok(out.joined.includes('Context Garden'), 'english title missing')
  assert.ok(out.joined.includes('Seed store'), 'english warehouse missing')
  assert.ok(out.joined.includes('Field guide'), 'english legend missing')
})

await test('reduced motion media query is present in the stylesheet', () => {
  const { moduleExports } = loadClient()
  const text = moduleExports.__model
  assert.ok(text.TEXT.zh['panel.note'].includes('不新增提示词'))
  const css = fs.readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  assert.ok(css.includes('prefers-reduced-motion'), 'reduced-motion media query missing')
  assert.ok(css.includes('--cg-'), 'garden palette variables missing')
})

console.log('\n' + passed + ' render tests passed')