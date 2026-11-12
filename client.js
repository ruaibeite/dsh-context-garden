/**
 * @ruaibeite/dsh-context-garden — browser half.
 *
 * A zen garden lives under the composer and in a right-sidebar tab. Every
 * message or tool result the session stores plants one plant in the field:
 *
 *   code        → cactus  (仙人掌)
 *   image       → flower  (花)
 *   error       → weed    (杂草)
 *   answer/text → bamboo  (竹)
 *   read/search → grass   (草)
 *   user speech → sprout  (幼苗)
 *
 * A context compaction is the harvest: the plants of the finished context are
 * carried into the seed store, priced into seed currency, and the field is
 * cleared to be replanted. The season around the field follows the context
 * pressure (spring under 38%, summer to 62%, autumn above, winter right after
 * a harvest), so context management reads as the turning of four seasons.
 *
 * Everything shown is derived from the host-side `garden` session projection
 * plus the shipped `contextPressure` projection. No prompt, no tool, no model
 * call and no session write is added by this plugin, and the widget never
 * renders chrome outside its own two surfaces.
 */
window.__ModuleLoader__.load({
  id: '@ruaibeite/dsh-context-garden',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const NS = '@ruaibeite/dsh-context-garden'

    // ---- identity & tuning ---------------------------------------------
    const TAB_ID = NS + '/garden'
    const TAB_KIND = 'context-garden'
    /** Kinds, in field-guide order. */
    const KINDS = ['cactus', 'flower', 'weed', 'bamboo', 'grass', 'sprout']
    /** Mirrors the host cap so a malformed payload cannot bloat the field. */
    const FIELD_CAP = 240
    const HARVEST_CAP = 24
    /** How long the harvest animation keeps the previous field on screen. */
    const HARVEST_MS = 2600
    /** Plants drawn in the composer-dock strip. */
    const DOCK_PLANTS = 14
    /** Plants drawn in the sidebar scene. */
    const PANEL_PLANTS = 30
    const SEASONS = ['spring', 'summer', 'autumn', 'winter']
    const SEASON_GLYPH = { spring: '春', summer: '夏', autumn: '秋', winter: '冬' }
    /** Lifetime-seed milestones that grow the courtyard. */
    const UNLOCKS = [
      { key: 'stone', at: 1 },
      { key: 'lantern', at: 40 },
      { key: 'pond', at: 120 },
      { key: 'rake', at: 300 },
      { key: 'gate', at: 800 },
    ]

    // ---- copy (bundled fallback; the locale service supplies the real one) --
    const TEXT = {
      zh: {
        'meta.title': '上下文花园',
        'meta.description': '把上下文窗口种成一座会轮回的禅意花园。',
        'a11y.openGarden': '打开上下文花园',
        'season.spring': '春',
        'season.summer': '夏',
        'season.autumn': '秋',
        'season.winter': '冬',
        'season.springLine': '新芽初生',
        'season.summerLine': '枝叶渐茂',
        'season.autumnLine': '秋意渐浓，穗实低垂',
        'season.winterLine': '雪下藏春',
        'season.springNote': '田土尚松，静待新芽。',
        'season.summerNote': '枝叶渐茂，正当生长。',
        'season.autumnNote': '穗实低垂，待一次收割。',
        'season.winterNote': '收割之后，雪下已有新种。',
        'season.near': '收割将至',
        'dock.empty': '待播种',
        'dock.seeds': '种子',
        'dock.harvests': '收割',
        'dock.hint': '点击打开花园',
        'panel.title': '上下文花园',
        'panel.subtitle': '一段上下文，一座庭院。',
        'panel.seasonCycle': '四季',
        'panel.fieldUsed': '田土',
        'panel.fieldUnknown': '—',
        'panel.plantsNow': '田间',
        'panel.plantedTotal': '累计种植',
        'panel.harvestTotal': '累计收割',
        'panel.seedBalance': '种子余额',
        'panel.seedsUnit': '枚',
        'panel.warehouse': '种子仓',
        'panel.cols': '收割 · 种子',
        'panel.harvestLog': '收割记录',
        'panel.noHarvest': '尚未收割。上下文压缩时，田里的植物会收进这里。',
        'panel.harvestEntry': '第 {n} 次 · {plants} 株 · +{seeds} 种子',
        'panel.legend': '图鉴',
        'panel.unlock': '庭院',
        'panel.unlockNext': '再收 {n} 枚种子，{name}',
        'panel.unlockedAll': '庭院已满，静待四季。',
        'panel.note': '花园完全由会话日志推导：不新增提示词，不调用模型，不写入会话。',
        'panel.empty': '田间还没有植物。说一句话，或让工具跑一次，花就会自己长出来。',
        'harvest.flash': '收割',
        'harvest.gained': '+{n} 种子',
        'harvest.plants': '{n} 株',
        'kind.cactus': '仙人掌',
        'kind.flower': '花',
        'kind.weed': '杂草',
        'kind.bamboo': '竹',
        'kind.grass': '草',
        'kind.sprout': '幼苗',
        'kind.cactusMean': '代码与执行',
        'kind.flowerMean': '图片',
        'kind.weedMean': '报错',
        'kind.bambooMean': '回答与长文',
        'kind.grassMean': '阅读与检索',
        'kind.sproutMean': '你说的每一句',
        'unlock.stone': '苔石',
        'unlock.lantern': '石灯笼',
        'unlock.pond': '小池',
        'unlock.rake': '枯山水',
        'unlock.gate': '月洞门',
      },
      en: {
        'meta.title': 'Context Garden',
        'meta.description': 'A zen garden for the context window that turns through four seasons.',
        'a11y.openGarden': 'Open the context garden',
        'season.spring': 'Spring',
        'season.summer': 'Summer',
        'season.autumn': 'Autumn',
        'season.winter': 'Winter',
        'season.springLine': 'New sprouts',
        'season.summerLine': 'Leaves deepening',
        'season.autumnLine': 'Ears bend low, harvest near',
        'season.winterLine': 'Spring beneath the snow',
        'season.springNote': 'The soil is loose; wait for the first sprout.',
        'season.summerNote': 'Leaves deepen; the field is in full growth.',
        'season.autumnNote': 'The ears bend low; a harvest is near.',
        'season.winterNote': 'After the harvest, new seed sleeps under the snow.',
        'season.near': 'Harvest near',
        'dock.empty': 'Awaiting seed',
        'dock.seeds': 'Seeds',
        'dock.harvests': 'Harvests',
        'dock.hint': 'Open the garden',
        'panel.title': 'Context Garden',
        'panel.subtitle': 'One context window, one courtyard.',
        'panel.seasonCycle': 'Four seasons',
        'panel.fieldUsed': 'Field',
        'panel.fieldUnknown': '—',
        'panel.plantsNow': 'In field',
        'panel.plantedTotal': 'Planted',
        'panel.harvestTotal': 'Harvested',
        'panel.seedBalance': 'Seed balance',
        'panel.seedsUnit': 'seeds',
        'panel.warehouse': 'Seed store',
        'panel.cols': 'harvested · seeds',
        'panel.harvestLog': 'Harvests',
        'panel.noHarvest': 'No harvest yet. When the context compacts, the field is carried in here.',
        'panel.harvestEntry': 'No. {n} · {plants} plants · +{seeds} seeds',
        'panel.legend': 'Field guide',
        'panel.unlock': 'Courtyard',
        'panel.unlockNext': 'Harvest {n} more seeds: {name}',
        'panel.unlockedAll': 'The courtyard is complete; let the seasons turn.',
        'panel.note': 'Everything here is derived from the session log: no prompt, no model call, no session write.',
        'panel.empty': 'No plants yet. Say something or run a tool; the field will seed itself.',
        'harvest.flash': 'Harvest',
        'harvest.gained': '+{n} seeds',
        'harvest.plants': '{n} plants',
        'kind.cactus': 'Cactus',
        'kind.flower': 'Flower',
        'kind.weed': 'Weed',
        'kind.bamboo': 'Bamboo',
        'kind.grass': 'Grass',
        'kind.sprout': 'Sprout',
        'kind.cactusMean': 'Code and execution',
        'kind.flowerMean': 'Images',
        'kind.weedMean': 'Errors',
        'kind.bambooMean': 'Answers and long text',
        'kind.grassMean': 'Reading and search',
        'kind.sproutMean': 'Your words',
        'unlock.stone': 'moss stone',
        'unlock.lantern': 'stone lantern',
        'unlock.pond': 'koi pond',
        'unlock.rake': 'raked sand',
        'unlock.gate': 'moon gate',
      },
    }

    // ---- helpers -------------------------------------------------------
    const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value))
    const num = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : 0)
    const unwrap = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {})

    /** Whether the surrounding page is running in Chinese. */
    function isChinese() {
      try {
        const lang = (document.documentElement && document.documentElement.lang) || ''
        const nav = typeof navigator === 'object' && navigator !== null ? navigator.language || '' : ''
        return /^zh/i.test(lang) || /^zh/i.test(nav)
      } catch {
        return false
      }
    }

    /** Locale lookup with a bundled fallback table. */
    function textOf(t, zh) {
      const table = zh ? TEXT.zh : TEXT.en
      return (key) => {
        if (typeof t === 'function') {
          try {
            const value = t(key)
            if (typeof value === 'string' && value !== '' && value !== key) return value
          } catch {
            /* locale service unavailable: use the bundled copy */
          }
        }
        const value = table[key]
        if (typeof value === 'string') return value
        const fallback = TEXT.en[key]
        return typeof fallback === 'string' ? fallback : key
      }
    }

    const trOf = (props) => textOf(props.t, isChinese())

    /** Stable small hash, used for deterministic plant placement. */
    function hashNum(n) {
      let x = (Math.floor(num(n)) || 0) >>> 0
      x = Math.imul(x ^ (x >>> 16), 0x45d9f3b)
      x = Math.imul(x ^ (x >>> 16), 0x45d9f3b)
      x ^= x >>> 16
      return x >>> 0
    }

    const kindOf = (value) => (KINDS.includes(value) ? value : 'grass')

    function zeroKinds() {
      const out = {}
      for (const kind of KINDS) out[kind] = 0
      return out
    }

    function kindsOf(value) {
      const raw = unwrap(value)
      const out = zeroKinds()
      for (const kind of KINDS) out[kind] = Math.max(0, Math.floor(num(raw[kind])))
      return out
    }

    function sumKinds(map) {
      let total = 0
      for (const kind of KINDS) total += num(map[kind])
      return total
    }

    /** Local HH:MM for a harvest timestamp. */
    function fmtClock(ms) {
      const t = num(ms)
      if (t <= 0) return ''
      const d = new Date(t)
      const pad = (n) => String(n).padStart(2, '0')
      return pad(d.getHours()) + ':' + pad(d.getMinutes())
    }

    /** Repair the projection view into a safe shape for rendering. */
    function normalizeGarden(raw) {
      const view = unwrap(raw)
      const plants = Array.isArray(view.plants)
        ? view.plants
            .filter((plant) => plant && typeof plant === 'object')
            .slice(-FIELD_CAP)
            .map((plant) => ({
              seq: Math.max(0, Math.floor(num(plant.seq))),
              t: Math.max(0, num(plant.t)),
              kind: kindOf(plant.kind),
              w: clamp(num(plant.w) || 1, 1, 4000),
            }))
        : []
      const counts = kindsOf(view.counts)
      const harvestedByKind = kindsOf(view.harvestedByKind)
      const seedsByKind = kindsOf(view.seedsByKind)
      const harvests = Array.isArray(view.harvests)
        ? view.harvests
            .filter((entry) => entry && typeof entry === 'object')
            .slice(-HARVEST_CAP)
            .map((entry) => ({
              at: Math.max(0, num(entry.at)),
              n: Math.max(0, Math.floor(num(entry.n))),
              seeds: Math.max(0, Math.floor(num(entry.seeds))),
              counts: kindsOf(entry.counts),
            }))
        : []
      const seeds = Math.max(0, Math.floor(num(view.seeds)), sumKinds(seedsByKind))
      return {
        plants,
        counts,
        harvestedByKind,
        seedsByKind,
        harvests,
        harvestCount: Math.max(0, Math.floor(num(view.harvestCount))),
        harvested: Math.max(0, Math.floor(num(view.harvested))),
        planted: Math.max(plants.length, Math.floor(num(view.planted))),
        seeds,
        lastHarvestAt: Math.max(0, num(view.lastHarvestAt)),
        errors: Math.max(0, Math.floor(num(view.errors))),
      }
    }

    /** Context occupancy from the shipped `contextPressure` projection. */
    function pressureRatioOf(pressure) {
      const p = unwrap(pressure)
      const window = num(p.contextWindow)
      const used = num(p.pressureTokens)
      if (window <= 0 || used <= 0) return null
      return clamp(used / window, 0, 1)
    }

    /** Resolve the season from the field and the context pressure. */
    function seasonOf(garden, pressure) {
      const p = pressureRatioOf(pressure)
      const since = garden.plants.length
      let key
      if (garden.harvestCount > 0 && since < 2) key = 'winter'
      else if (p !== null) key = p < 0.38 ? 'spring' : p < 0.62 ? 'summer' : 'autumn'
      else key = since <= 8 ? 'spring' : since <= 18 ? 'summer' : 'autumn'
      return {
        key,
        index: SEASONS.indexOf(key),
        pressure: p,
        nearHarvest: key !== 'winter' && p !== null && p >= 0.78,
      }
    }

    /** Milestones already earned by the lifetime seed total. */
    function unlockedOf(seeds) {
      const out = {}
      for (const unlock of UNLOCKS) out[unlock.key] = seeds >= unlock.at
      return out
    }

    function nextUnlockOf(seeds) {
      for (const unlock of UNLOCKS) if (seeds < unlock.at) return unlock
      return null
    }

    /** Smoothly walk a counter toward a new target. */
    function useCountUp(target) {
      const [shown, setShown] = React.useState(target)
      const fromRef = React.useRef(target)
      React.useEffect(() => {
        const from = fromRef.current
        if (from === target) return undefined
        const start = typeof performance === 'object' && performance ? performance.now() : Date.now()
        const duration = 900
        let raf = 0
        const frame = (now) => {
          const progress = clamp((now - start) / duration, 0, 1)
          const eased = 1 - Math.pow(1 - progress, 3)
          setShown(Math.round(from + (target - from) * eased))
          if (progress < 1) {
            raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame(frame) : 0
            if (raf === 0) setShown(target)
          } else {
            fromRef.current = target
          }
        }
        raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame(frame) : 0
        if (raf === 0) setShown(target)
        return () => {
          if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf)
        }
      }, [target])
      return shown
    }

    /**
     * Detect a harvest between renders and keep the just-harvested field around
     * long enough to animate it away. Reopening a session does not replay it.
     */
    function useHarvestFlash(garden) {
      const [flash, setFlash] = React.useState(null)
      const currentRef = React.useRef(garden)
      currentRef.current = garden
      const previousRef = React.useRef(null)
      const count = garden.harvestCount
      React.useEffect(() => {
        const current = currentRef.current
        if (previousRef.current === null) {
          previousRef.current = { count, plants: current.plants, seeds: current.seeds }
          return undefined
        }
        if (count > previousRef.current.count) {
          const latest = current.harvests.length > 0 ? current.harvests[current.harvests.length - 1] : null
          setFlash({
            key: count,
            plants: previousRef.current.plants,
            n: latest === null ? previousRef.current.plants.length : latest.n,
            seeds: latest === null ? 0 : latest.seeds,
          })
          previousRef.current = { count, plants: current.plants, seeds: current.seeds }
          const timer = setTimeout(() => setFlash(null), HARVEST_MS)
          return () => clearTimeout(timer)
        }
        previousRef.current = { count, plants: current.plants, seeds: current.seeds }
        return undefined
      }, [count])
      return flash
    }

    // ---- plant glyphs --------------------------------------------------
    /**
     * One plant, drawn in local coordinates with its root at (0, 0).
     * The caller positions and scales the wrapping group.
     */
    function PlantGlyph(props) {
      const kind = kindOf(props.kind)
      if (kind === 'cactus') {
        return h(
          React.Fragment,
          null,
          h('path', {
            d: 'M-2.8 0 L-2.8 -10.6 Q-2.8 -14.2 0 -14.2 Q2.8 -14.2 2.8 -10.6 L2.8 0 Z',
            fill: 'var(--cg-leaf-deep)',
          }),
          h('path', {
            d: 'M-1 -12.6 V-2 M1 -12.6 V-2',
            stroke: 'var(--cg-leaf)',
            strokeWidth: 0.5,
            strokeLinecap: 'round',
            opacity: 0.55,
          }),
          h('path', {
            d: 'M-2.8 -6.8 H-6.2 Q-8.6 -6.8 -8.6 -4.4 V-1.8',
            fill: 'none',
            stroke: 'var(--cg-leaf-deep)',
            strokeWidth: 2.9,
            strokeLinecap: 'round',
          }),
          h('path', {
            d: 'M2.8 -9.2 H5.8 Q8 -9.2 8 -7 V-4.2',
            fill: 'none',
            stroke: 'var(--cg-leaf-deep)',
            strokeWidth: 2.6,
            strokeLinecap: 'round',
          }),
          h('path', {
            d: 'M-1.8 -3.6 v0.9 M1.6 -5.6 v0.9 M-1.6 -8.6 v0.9 M1 -10.8 v0.8',
            stroke: 'var(--cg-leaf)',
            strokeWidth: 0.65,
            strokeLinecap: 'round',
            opacity: 0.7,
          }),
          h('ellipse', { cx: 0, cy: -14.4, rx: 1.5, ry: 0.8, fill: 'var(--cg-sprout)', opacity: 0.9 }),
        )
      }
      if (kind === 'flower') {
        return h(
          React.Fragment,
          null,
          h('path', { d: 'M0 0 V-13.2', stroke: 'var(--cg-leaf)', strokeWidth: 1.15, strokeLinecap: 'round' }),
          h('ellipse', {
            cx: -3.4,
            cy: -7.6,
            rx: 3,
            ry: 1.25,
            transform: 'rotate(-34 -3.4 -7.6)',
            fill: 'var(--cg-leaf)',
          }),
          h('ellipse', {
            cx: 3.2,
            cy: -9.4,
            rx: 2.7,
            ry: 1.15,
            transform: 'rotate(28 3.2 -9.4)',
            fill: 'var(--cg-leaf)',
            opacity: 0.9,
          }),
          h(
            'g',
            null,
            [0, 60, 120, 180, 240, 300].map((angle, i) =>
              h('ellipse', {
                key: i,
                cx: 0,
                cy: -17.4,
                rx: 2.9,
                ry: 1.7,
                transform: 'rotate(' + angle + ' 0 -17.4)',
                fill: 'var(--cg-blossom)',
              }),
            ),
          ),
          h('circle', { cx: 0, cy: -17.4, r: 2, fill: 'var(--cg-blossom)', opacity: 0.95 }),
          h('circle', { cx: 0, cy: -17.4, r: 1.2, fill: 'var(--cg-amber)' }),
        )
      }
      if (kind === 'weed') {
        return h(
          React.Fragment,
          null,
          h('path', {
            d: 'M0 0 Q-4.2 -5.6 -6.4 -11.4 M0 0 Q-0.6 -7.2 0.8 -12.8 M0 0 Q4 -5 6.2 -9.6 M0 0 Q2.6 -4.4 3.4 -8.4',
            fill: 'none',
            stroke: 'var(--cg-weed)',
            strokeWidth: 1.25,
            strokeLinecap: 'round',
          }),
          h('ellipse', {
            cx: 0.9,
            cy: -13.4,
            rx: 1.5,
            ry: 2.1,
            transform: 'rotate(16 0.9 -13.4)',
            fill: 'var(--cg-weed)',
            opacity: 0.9,
          }),
        )
      }
      if (kind === 'bamboo') {
        return h(
          React.Fragment,
          null,
          h('path', { d: 'M0 0 V-20.4', stroke: 'var(--cg-bamboo)', strokeWidth: 2, strokeLinecap: 'round' }),
          h('path', {
            d: 'M-2 -5.6 H2 M-2 -10.6 H2 M-1.9 -15.6 H1.9',
            stroke: 'var(--cg-leaf)',
            strokeWidth: 0.7,
            opacity: 0.8,
          }),
          h('ellipse', {
            cx: -4.6,
            cy: -16.6,
            rx: 3.4,
            ry: 1.1,
            transform: 'rotate(-26 -4.6 -16.6)',
            fill: 'var(--cg-leaf)',
          }),
          h('ellipse', {
            cx: 4.2,
            cy: -13.6,
            rx: 3,
            ry: 1,
            transform: 'rotate(22 4.2 -13.6)',
            fill: 'var(--cg-leaf)',
            opacity: 0.9,
          }),
          h('ellipse', {
            cx: -3.4,
            cy: -9.2,
            rx: 2.2,
            ry: 0.8,
            transform: 'rotate(-18 -3.4 -9.2)',
            fill: 'var(--cg-grass)',
            opacity: 0.8,
          }),
        )
      }
      if (kind === 'grass') {
        return h(
          React.Fragment,
          null,
          h('path', {
            d: 'M0 0 Q-5 -4.6 -6.8 -9.2 M0 0 Q-1.2 -6.4 -0.2 -10.8 M0 0 Q4.6 -5.2 6.8 -8.4 M0 0 Q1.8 -4.2 2.6 -6.6',
            fill: 'none',
            stroke: 'var(--cg-grass)',
            strokeWidth: 1.05,
            strokeLinecap: 'round',
          }),
        )
      }
      // sprout
      return h(
        React.Fragment,
        null,
        h('path', { d: 'M0 0 V-6.4', stroke: 'var(--cg-leaf)', strokeWidth: 0.95, strokeLinecap: 'round' }),
        h('ellipse', {
          cx: -2.2,
          cy: -6.8,
          rx: 2.5,
          ry: 1.35,
          transform: 'rotate(-32 -2.2 -6.8)',
          fill: 'var(--cg-sprout)',
        }),
        h('ellipse', {
          cx: 2.2,
          cy: -7.4,
          rx: 2.3,
          ry: 1.25,
          transform: 'rotate(30 2.2 -7.4)',
          fill: 'var(--cg-leaf)',
        }),
      )
    }

    /** A plant at a field position, with deterministic sway. */
    function Plant(props) {
      const plant = props.plant
      const seed = hashNum(plant.seq * 31 + 7)
      const scale = num(props.scale) || 1
      const swayDuration = 5.2 + (seed % 280) / 100
      const swayDelay = -((seed % 500) / 100)
      const flyDelay = clamp(num(props.flyDelay), 0, 2000)
      const flying = props.flying === true
      return h(
        'g',
        {
          transform: 'translate(' + props.x.toFixed(2) + ' ' + props.y.toFixed(2) + ') scale(' + scale.toFixed(3) + ')',
          opacity: typeof props.opacity === 'number' ? props.opacity : 1,
        },
        h(
          'g',
          {
            className: flying ? 'cg-plant cg-fly' : 'cg-plant cg-sway',
            'data-kind': plant.kind,
            style: flying
              ? { animationDelay: flyDelay + 'ms' }
              : { '--cg-sway-dur': swayDuration.toFixed(2) + 's', '--cg-sway-delay': swayDelay.toFixed(2) + 's' },
          },
          h(
            'g',
            { className: 'cg-grow', style: { animationDelay: ((seed % 9) * 45) + 'ms' } },
            h(PlantGlyph, { kind: plant.kind }),
          ),
        ),
      )
    }

    /** One season's particle weather (petals, pollen, leaves or snow). */
    function Weather(props) {
      const season = props.season
      const count = Math.max(0, Math.floor(num(props.count)))
      const width = num(props.width) || 260
      const height = num(props.height) || 52
      const color =
        season === 'spring'
          ? 'var(--cg-blossom)'
          : season === 'autumn'
            ? 'var(--cg-amber)'
            : season === 'winter'
              ? 'var(--cg-snow)'
              : 'var(--cg-leaf)'
      const out = []
      for (let i = 0; i < count; i += 1) {
        const seed = hashNum(i * 17 + 5)
        const x = 12 + ((seed % 1000) / 1000) * (width - 24)
        const y = 8 + ((hashNum(seed) % 1000) / 1000) * (height * 0.45)
        const r = season === 'winter' ? 0.8 + ((seed >> 3) % 3) * 0.35 : 0.9 + ((seed >> 4) % 2) * 0.4
        out.push(
          h('circle', {
            key: i,
            className: 'cg-particle',
            cx: x.toFixed(1),
            cy: y.toFixed(1),
            r: r.toFixed(2),
            fill: color,
            'aria-hidden': true,
            style: {
              '--cg-dur': (7 + (seed % 50) / 10).toFixed(1) + 's',
              '--cg-delay': '-'.concat(((seed % 90) / 10).toFixed(1), 's'),
              '--cg-po': season === 'winter' ? 0.85 : 0.65,
            },
          }),
        )
      }
      return h('g', { className: 'cg-weather', 'aria-hidden': true }, out)
    }

    /** The stone/pond/gate decorations a seed balance has unlocked. */
    function Decorations(props) {
      const unlocked = unwrap(props.unlocked)
      const layer = props.layer === 'front' ? 'front' : 'back'
      const width = num(props.width) || 360
      const height = num(props.height) || 240
      const soilY = num(props.soilY) || 174
      const out = []
      if (layer === 'back') {
        if (unlocked.gate) {
          out.push(
            h(
              'g',
              { key: 'gate', className: 'cg-decor-gate', opacity: 0.5 },
              h('circle', {
                cx: width * 0.5,
                cy: soilY - 34,
                r: 33,
                fill: 'none',
                stroke: 'var(--cg-stone)',
                strokeWidth: 3.6,
              }),
              h('circle', {
                cx: width * 0.5,
                cy: soilY - 34,
                r: 33,
                fill: 'var(--cg-moon)',
                opacity: 0.1,
              }),
              h('circle', {
                cx: width * 0.5,
                cy: soilY - 34,
                r: 28,
                fill: 'none',
                stroke: 'var(--cg-paper)',
                strokeWidth: 0.7,
                opacity: 0.35,
              }),
            ),
          )
        }
        if (unlocked.rake) {
          const arcs = []
          for (let i = 0; i < 4; i += 1) {
            arcs.push(
              h('ellipse', {
                key: 'r' + i,
                cx: width * 0.5,
                cy: soilY + 34,
                rx: width * 0.3 - i * 13,
                ry: 9 + i * 1.6,
                fill: 'none',
                stroke: 'var(--cg-soil-line)',
                strokeWidth: 0.8,
                opacity: 0.34,
              }),
            )
          }
          out.push(h('g', { key: 'rake', className: 'cg-decor-rake' }, arcs))
        }
      } else {
        if (unlocked.pond) {
          out.push(
            h(
              'g',
              { key: 'pond', className: 'cg-decor-pond' },
              h('ellipse', { cx: width * 0.16, cy: height - 13, rx: 30, ry: 8.4, fill: 'var(--cg-water)', opacity: 0.78 }),
              h('ellipse', {
                cx: width * 0.16,
                cy: height - 14,
                rx: 23,
                ry: 5.2,
                fill: 'none',
                stroke: 'var(--cg-paper)',
                strokeWidth: 0.8,
                opacity: 0.4,
              }),
              h('ellipse', { cx: width * 0.16 + 10, cy: height - 15.4, rx: 2.6, ry: 1.2, fill: 'var(--cg-amber)', opacity: 0.9 }),
              h('ellipse', { cx: width * 0.16 - 12, cy: height - 12.4, rx: 2.2, ry: 1, fill: 'var(--cg-amber)', opacity: 0.65 }),
            ),
          )
        }
        if (unlocked.stone) {
          out.push(
            h(
              'g',
              { key: 'stone', className: 'cg-decor-stone' },
              h('ellipse', { cx: width * 0.72, cy: height - 16, rx: 14, ry: 4, fill: 'var(--cg-soil-2)', opacity: 0.45 }),
              h('path', {
                d: 'M' + (width * 0.72 - 10) + ' ' + (height - 16) + ' q-1 -7.5 5 -8.6 q5.4 -1 6.2 3.2 q3 1 2 5.4 z',
                fill: 'var(--cg-stone)',
              }),
              h('path', {
                d: 'M' + (width * 0.72 - 5) + ' ' + (height - 21) + ' q3.2 -2.2 5.4 0 q2 1 1 3.2',
                fill: 'none',
                stroke: 'var(--cg-moss)',
                strokeWidth: 1.5,
                strokeLinecap: 'round',
                opacity: 0.85,
              }),
            ),
          )
        }
        if (unlocked.lantern) {
          const x = width * 0.88
          const y = soilY + 8
          out.push(
            h(
              'g',
              { key: 'lantern', className: 'cg-decor-lantern' },
              h('ellipse', { cx: x, cy: y + 13, rx: 12, ry: 3.4, fill: 'var(--cg-soil-2)', opacity: 0.5 }),
              h('path', { d: 'M' + (x - 5) + ' ' + (y + 12.5) + ' v-9 h10 v9 z', fill: 'var(--cg-stone)' }),
              h('rect', { x: x - 2.8, y: y - 8, width: 5.6, height: 9, fill: 'var(--cg-stone)' }),
              h('rect', { x: x - 5.8, y: y - 2.8, width: 11.6, height: 4.4, fill: 'var(--cg-moon)', opacity: 0.7 }),
              h('path', { d: 'M' + (x - 7.6) + ' ' + (y - 8) + ' q7.6 -5.6 15.2 0 z', fill: 'var(--cg-stone)' }),
              h('circle', { cx: x, cy: y - 6, r: 1.6, fill: 'var(--cg-amber)', opacity: 0.95 }),
            ),
          )
        }
      }
      return h('g', { className: 'cg-decor cg-decor-' + layer }, out)
    }

    /** The seed mound left behind by a harvest. */
    function SeedMound(props) {
      const x = num(props.x) || 180
      const y = num(props.y) || 196
      return h(
        'g',
        { className: 'cg-seed-mound', opacity: 0.9 },
        h('ellipse', { cx: x, cy: y, rx: 15, ry: 4.4, fill: 'var(--cg-soil-2)', opacity: 0.65 }),
        h('path', { d: 'M' + (x - 12) + ' ' + y + ' q12 -8 24 0 z', fill: 'var(--cg-soil-2)' }),
        h('circle', { cx: x - 3, cy: y - 4.4, r: 0.9, fill: 'var(--cg-amber)' }),
        h('circle', { cx: x + 2.5, cy: y - 3.6, r: 0.8, fill: 'var(--cg-amber)' }),
        h('circle', { cx: x + 6.5, cy: y - 1.6, r: 0.7, fill: 'var(--cg-amber)' }),
      )
    }

    // ---- the field scene ----------------------------------------------
    /** The full field scene, shared by the dock strip and the sidebar tab. */
    function GardenField(props) {
      const dock = props.variant === 'dock'
      const garden = props.garden
      const season = props.season
      const flash = props.flash
      const tr = trOf(props)
      const width = dock ? 260 : 360
      const height = dock ? 52 : 240
      const soilY = dock ? 38 : 172
      const unlocked = unlockedOf(garden.seeds)
      const flashPlants = flash !== null && Array.isArray(flash.plants) && flash.plants.length > 0 ? flash.plants : null
      const plants = flashPlants !== null ? flashPlants : garden.plants
      const maxPlants = dock ? DOCK_PLANTS : PANEL_PLANTS
      const visible = plants.slice(-maxPlants)
      const rowCount = dock ? 2 : 3
      const columns = Math.max(1, Math.ceil(visible.length / rowCount))
      const rowBases = dock ? [48.5, 44] : [200, 220, 237]
      const rowScales = dock ? [0.62, 0.74] : [1.55, 1.85, 2.15]
      const rowOpacity = dock ? [0.9, 1] : [0.72, 0.86, 1]
      const placed = visible.map((plant, index) => {
        const row = index % rowCount
        const slot = Math.floor(index / rowCount)
        const seed = hashNum(plant.seq * 13 + 3)
        const jitter = (seed % 1000) / 1000 - 0.5
        const spread = dock ? 6 : 15
        const stagger = dock ? 0 : row === 1 ? -7 : row === 2 ? 6 : 0
        const x = 18 + (width - 36) * ((slot + 0.5) / columns) + jitter * spread + stagger
        const scale = rowScales[row] * (0.88 + ((hashNum(seed) % 100) / 100) * 0.22)
        return {
          plant,
          index,
          row,
          x: clamp(x, 12, width - 12),
          y:
            rowBases[row] +
            (dock ? (jitter > 0.2 ? 1 : -0.4) : ((hashNum(seed >> 3) % 100) / 100) * 6 - 3) +
            (row === 2 ? 0.6 : 0),
          scale,
          opacity: rowOpacity[row],
        }
      })
      placed.sort((a, b) => a.row - b.row || a.plant.seq - b.plant.seq)

      const ground = []
      ground.push(
        h('path', {
          key: 'soil',
          d:
            'M0 ' + soilY +
            ' Q' + width * 0.22 + ' ' + (soilY - 5) +
            ' ' + width * 0.48 + ' ' + soilY +
            ' T' + width + ' ' + soilY +
            ' L' + width + ' ' + height + ' L0 ' + height + ' Z',
          fill: 'var(--cg-soil)',
          opacity: 0.92,
        }),
      )
      ground.push(
        h('path', {
          key: 'soil-shade',
          d:
            'M0 ' + (soilY + 9) +
            ' Q' + width * 0.3 + ' ' + (soilY + 4) +
            ' ' + width * 0.62 + ' ' + (soilY + 9) +
            ' T' + width + ' ' + (soilY + 7) +
            ' L' + width + ' ' + height + ' L0 ' + height + ' Z',
          fill: 'var(--cg-soil-2)',
          opacity: 0.28,
        }),
      )
      for (let i = 0; i < (dock ? 3 : 5); i += 1) {
        ground.push(
          h('path', {
            key: 'rake' + i,
            d:
              'M' + (width * 0.08 + i * 6) + ' ' + (soilY + 14 + i * (dock ? 4 : 9)) +
              ' Q' + width * 0.5 + ' ' + (soilY + 10 + i * (dock ? 4 : 9)) +
              ' ' + (width * 0.92 - i * 4) + ' ' + (soilY + 15 + i * (dock ? 4 : 9)),
            fill: 'none',
            stroke: 'var(--cg-soil-line)',
            strokeWidth: dock ? 0.6 : 0.8,
            opacity: 0.35,
          }),
        )
      }
      if (!dock) {
        for (let i = 0; i < 8; i += 1) {
          const seed = hashNum(i * 97 + 11)
          ground.push(
            h('ellipse', {
              key: 'pebble' + i,
              cx: 20 + ((seed % 1000) / 1000) * (width - 40),
              cy: soilY + 12 + ((hashNum(seed) % 1000) / 1000) * (height - soilY - 18),
              rx: 1.4 + ((seed >> 4) % 3) * 0.7,
              ry: 0.9 + ((seed >> 6) % 2) * 0.4,
              fill: 'var(--cg-soil-2)',
              opacity: 0.45,
            }),
          )
        }
      }
      if (season.key === 'winter') {
        ground.push(
          h('path', {
            key: 'snow',
            d:
              'M0 ' + soilY +
              ' Q' + width * 0.22 + ' ' + (soilY - 6) +
              ' ' + width * 0.48 + ' ' + soilY +
              ' T' + width + ' ' + soilY +
              ' L' + width + ' ' + (soilY + 9) +
              ' Q' + width * 0.5 + ' ' + (soilY + 15) +
              ' 0 ' + (soilY + 7) + ' Z',
            fill: 'var(--cg-snow)',
            opacity: 0.72,
          }),
        )
      }
      if (visible.length === 0 && flashPlants === null) {
        ground.push(h(SeedMound, { key: 'mound', x: width * 0.5, y: soilY + 12 }))
      }
      if (!dock) ground.push(h(Decorations, { key: 'decor-back', layer: 'back', unlocked, width, height, soilY }))

      const sky = []
      if (!dock) {
        sky.push(
          h('circle', {
            key: 'sun',
            cx: width - 52,
            cy: 38,
            r: 15,
            fill: season.key === 'winter' ? 'var(--cg-moon)' : 'var(--cg-sun)',
            opacity: 0.85,
          }),
          h('circle', {
            key: 'halo',
            cx: width - 52,
            cy: 38,
            r: 25,
            fill: season.key === 'winter' ? 'var(--cg-moon)' : 'var(--cg-sun)',
            opacity: 0.16,
          }),
          h('ellipse', {
            key: 'cloud-a',
            cx: width * 0.2,
            cy: 44,
            rx: 46,
            ry: 7,
            fill: 'var(--cg-sun)',
            opacity: 0.14,
          }),
          h('ellipse', {
            key: 'cloud-b',
            cx: width * 0.34,
            cy: 58,
            rx: 30,
            ry: 4.5,
            fill: 'var(--cg-snow)',
            opacity: 0.18,
          }),
          season.key === 'winter'
            ? null
            : h('path', {
                key: 'birds',
                d:
                  'M' + width * 0.52 + ' ' + (soilY - 96) +
                  ' q3 -3 6 0 q3 -3 6 0 M' + (width * 0.62) + ' ' + (soilY - 108) +
                  ' q2.4 -2.4 4.8 0 q2.4 -2.4 4.8 0',
                fill: 'none',
                stroke: 'var(--cg-ink-3)',
                strokeWidth: 0.9,
                strokeLinecap: 'round',
                opacity: 0.35,
              }),
          h('path', {
            key: 'hill-back',
            d:
              'M0 ' + (soilY - 8) +
              ' Q' + width * 0.18 + ' ' + (soilY - 52) +
              ' ' + width * 0.38 + ' ' + (soilY - 10) +
              ' T' + width * 0.72 + ' ' + (soilY - 9) +
              ' T' + width + ' ' + (soilY - 6) +
              ' L' + width + ' ' + soilY + ' L0 ' + soilY + ' Z',
            fill: 'var(--cg-hill)',
            opacity: 0.42,
          }),
          h('path', {
            key: 'hill-front',
            d:
              'M0 ' + (soilY - 2) +
              ' Q' + width * 0.24 + ' ' + (soilY - 32) +
              ' ' + width * 0.52 + ' ' + (soilY - 3) +
              ' T' + width + ' ' + (soilY - 2) +
              ' L' + width + ' ' + soilY + ' L0 ' + soilY + ' Z',
            fill: 'var(--cg-hill-2)',
            opacity: 0.4,
          }),
          h('ellipse', {
            key: 'mist-a',
            cx: width * 0.3,
            cy: soilY - 26,
            rx: width * 0.34,
            ry: 10,
            fill: 'var(--cg-snow)',
            opacity: 0.12,
          }),
          h('ellipse', {
            key: 'mist-b',
            cx: width * 0.72,
            cy: soilY - 20,
            rx: width * 0.3,
            ry: 7,
            fill: 'var(--cg-snow)',
            opacity: 0.09,
          }),
        )
      }
      sky.push(h(Weather, { key: 'weather', season: season.key, count: dock ? 3 : 7, width, height: soilY }))

      return h(
        'div',
        {
          className: 'cg-scene cg-scene-' + props.variant,
          'data-season': season.key,
          'data-plants': String(visible.length),
        },
        h(
          'svg',
          {
            className: 'cg-field',
            viewBox: '0 0 ' + width + ' ' + height,
            preserveAspectRatio: 'xMidYMax meet',
            'aria-hidden': true,
          },
          h('g', { className: 'cg-sky' }, sky),
          h('g', { className: 'cg-ground' }, ground),
          h(
            'g',
            { className: 'cg-plants' },
            placed.map((entry) =>
              h(Plant, {
                key: 'p' + entry.plant.seq + '-' + entry.index,
                plant: entry.plant,
                x: entry.x,
                y: entry.y,
                scale: entry.scale,
                opacity: entry.opacity,
                flying: flashPlants !== null,
                flyDelay: (entry.index % 7) * 55,
              }),
            ),
          ),
          !dock ? h(Decorations, { key: 'decor-front', layer: 'front', unlocked, width, height, soilY }) : null,
          visible.length === 0 && flashPlants === null
            ? h(
                'text',
                {
                  x: width * 0.5,
                  y: dock ? 20 : soilY - 44,
                  textAnchor: 'middle',
                  fontSize: dock ? 7.5 : 11,
                  fill: 'var(--cg-ink-3)',
                  fontFamily: 'var(--cg-serif)',
                  letterSpacing: '0.18em',
                },
                tr('dock.empty'),
              )
            : null,
          flashPlants !== null ? h(Weather, { key: 'burst', season: 'winter', count: 8, width, height: soilY }) : null,
        ),
        !dock && garden.plants.length === 0
          ? h('span', { className: 'cg-scene-caption' }, tr('panel.empty'))
          : null,
        !dock && flash !== null
          ? h(
              'span',
              { className: 'cg-scene-banner', key: 'banner' + flash.key },
              tr('harvest.flash') +
                ' · ' +
                tr('harvest.plants').replace('{n}', String(flash.n)) +
                ' · ' +
                tr('harvest.gained').replace('{n}', String(flash.seeds)),
            )
          : null,
      )
    }

    // ---- the season ring ----------------------------------------------
    function polar(cx, cy, radius, degrees) {
      const angle = ((degrees - 90) * Math.PI) / 180
      return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)]
    }

    function arcPath(cx, cy, radius, from, to) {
      const [x0, y0] = polar(cx, cy, radius, from)
      const [x1, y1] = polar(cx, cy, radius, to)
      const large = Math.abs(to - from) > 180 ? 1 : 0
      return (
        'M' + x0.toFixed(2) + ' ' + y0.toFixed(2) +
        ' A' + radius + ' ' + radius + ' 0 ' + large + ' 1 ' +
        x1.toFixed(2) + ' ' + y1.toFixed(2)
      )
    }

    /** Four-season dial with the live context occupancy at its heart. */
    function SeasonRing(props) {
      const season = props.season
      const pressure = season.pressure
      const tr = props.tr
      const size = num(props.size) || 96
      const center = size / 2
      const radius = center - 9
      const segments = []
      for (let i = 0; i < 4; i += 1) {
        const from = -136 + i * 90
        const to = from + 62
        const active = i === season.index
        segments.push(
          h('path', {
            key: SEASONS[i],
            d: arcPath(center, center, radius, from, to),
            fill: 'none',
            stroke: active ? 'var(--cg-ink)' : 'var(--cg-ink-3)',
            strokeWidth: active ? 2.6 : 1.2,
            opacity: active ? 0.9 : 0.32,
            strokeLinecap: 'round',
          }),
        )
      }
      return h(
        'div',
        { className: 'cg-ring', 'data-season': season.key },
        h(
          'svg',
          { viewBox: '0 0 ' + size + ' ' + size, className: 'cg-ring-svg', 'aria-hidden': true },
          segments,
          h(
            'text',
            {
              x: center,
              y: center + 1,
              textAnchor: 'middle',
              fontSize: 23,
              fill: 'var(--cg-ink)',
              fontFamily: 'var(--cg-serif)',
            },
            SEASON_GLYPH[season.key],
          ),

        ),
      )
    }

    /** A tiny garden bed seen through the composer-dock window. */
    function DockField(props) {
      const garden = props.garden
      const season = props.season
      const flash = props.flash
      const tr = props.tr
      const width = 150
      const height = 30
      const soilY = 22.5
      const visible = garden.plants.slice(-10)
      const count = Math.max(1, visible.length)
      const placed = visible.map((plant, index) => {
        const seed = hashNum(plant.seq * 29 + 5)
        const jitter = (seed % 1000) / 1000 - 0.5
        const row = index % 2
        const x = clamp(12 + (width - 24) * ((index + 0.5) / count) + jitter * 4.5, 8, width - 8)
        const scale = (row === 0 ? 0.66 : 0.78) * (0.9 + ((hashNum(seed) % 100) / 100) * 0.2)
        return { plant, index, row, x, y: row === 0 ? soilY + 5.4 : soilY + 3.4, scale }
      })
      placed.sort((a, b) => a.row - b.row || a.plant.seq - b.plant.seq)
      return h(
        'div',
        {
          className: 'cg-dock-field' + (flash === null ? '' : ' cg-harvesting'),
          'data-season': season.key,
        },
        h(
          'svg',
          {
            className: 'cg-field',
            viewBox: '0 0 ' + width + ' ' + height,
            preserveAspectRatio: 'xMidYMax meet',
            'aria-hidden': true,
          },
          h('path', {
            d:
              'M0 ' + soilY +
              ' Q' + width * 0.28 + ' ' + (soilY - 1.6) +
              ' ' + width * 0.55 + ' ' + soilY +
              ' T' + width + ' ' + (soilY - 0.6) +
              ' L' + width + ' ' + height + ' L0 ' + height + ' Z',
            fill: 'var(--cg-soil)',
            opacity: 0.94,
          }),
          h('path', {
            d:
              'M0 ' + (soilY + 3) +
              ' Q' + width * 0.5 + ' ' + (soilY + 1.8) +
              ' ' + width + ' ' + (soilY + 3.2) +
              ' L' + width + ' ' + height + ' L0 ' + height + ' Z',
            fill: 'var(--cg-soil-2)',
            opacity: 0.3,
          }),
          h('path', {
            d: 'M8 ' + (soilY + 4.6) + ' Q' + width * 0.5 + ' ' + (soilY + 3.4) + ' ' + (width - 8) + ' ' + (soilY + 4.6),
            fill: 'none',
            stroke: 'var(--cg-soil-line)',
            strokeWidth: 0.5,
            opacity: 0.3,
          }),
          season.key === 'winter'
            ? h('path', {
                key: 'dock-snow',
                d:
                  'M0 ' + (soilY + 0.4) +
                  ' Q' + width * 0.3 + ' ' + (soilY - 1.6) +
                  ' ' + width * 0.58 + ' ' + (soilY + 0.2) +
                  ' T' + width + ' ' + (soilY - 0.2) +
                  ' L' + width + ' ' + (soilY + 3.4) +
                  ' Q' + width * 0.5 + ' ' + (soilY + 5.2) +
                  ' 0 ' + (soilY + 3.2) + ' Z',
                fill: 'var(--cg-snow)',
                opacity: 0.8,
              })
            : null,
          h(Weather, { season: season.key, count: 3, width, height: soilY }),
          visible.length === 0 && flash === null
            ? h(
                'g',
                { key: 'dock-mound', className: 'cg-seed-mound', opacity: 0.85 },
                h('ellipse', { cx: width * 0.5, cy: soilY + 5.2, rx: 9, ry: 2.6, fill: 'var(--cg-soil-2)', opacity: 0.6 }),
                h('path', { d: 'M' + (width * 0.5 - 7) + ' ' + (soilY + 5.2) + ' q7 -4.6 14 0 z', fill: 'var(--cg-soil-2)' }),
                h('circle', { cx: width * 0.5 - 2, cy: soilY + 2.6, r: 0.6, fill: 'var(--cg-amber)' }),
                h('circle', { cx: width * 0.5 + 2, cy: soilY + 2.9, r: 0.5, fill: 'var(--cg-amber)' }),
              )
            : null,
          placed.map((entry) =>
            h(Plant, {
              key: 'd' + entry.plant.seq + '-' + entry.index,
              plant: entry.plant,
              x: entry.x,
              y: entry.y,
              scale: entry.scale,
              flying: flash !== null,
              flyDelay: (entry.index % 5) * 45,
            }),
          ),

        ),
      )
    }

    /** Enso season mark used by the composer strip and the panel header. */
    function SeasonMark(props) {
      const season = props.season
      const tr = props.tr
      return h(
        'span',
        {
          className: 'cg-season-mark',
          'data-season': season.key,
          title: tr('season.' + season.key) + ' · ' + tr('season.' + season.key + 'Line'),
        },
        h('span', { className: 'cg-enso', 'aria-hidden': true }, SEASON_GLYPH[season.key]),
      )
    }

    // ---- dock widget ---------------------------------------------------
    /** Small garden living in the composer dock. */
    function GardenDock(props) {
      const useProjection = typeof props.useProjection === 'function' ? props.useProjection : () => undefined
      const garden = normalizeGarden(useProjection('garden'))
      const pressure = useProjection('contextPressure')
      const tr = trOf(props)
      const season = seasonOf(garden, pressure)
      const flash = useHarvestFlash(garden)
      const shownSeeds = useCountUp(garden.seeds)
      const openGarden = typeof props.openGardenTab === 'function' ? props.openGardenTab : null
      const hint = tr('season.' + season.key + 'Line')
      const label = tr('a11y.openGarden') + ' · ' + tr('season.' + season.key) + ' · ' + hint

      const onKeyDown = (event) => {
        if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
          event.preventDefault()
          if (openGarden !== null) openGarden()
        }
      }

      return h(
        'div',
        {
          className: 'cg-root cg-dock',
          'data-season': season.key,
          role: 'button',
          tabIndex: 0,
          title: label,
          'aria-label': label,
          onClick: () => {
            if (openGarden !== null) openGarden()
          },
          onKeyDown,
        },
        h('style', null, CSS),
        h(SeasonMark, { season, tr }),
        h(DockField, { garden, season, flash, tr }),
        h(
          'span',
          { className: 'cg-dock-stats' },
          h(
            'span',
            { className: 'cg-stat', key: 'seeds' },
            h('b', null, String(shownSeeds)),
            h('span', null, tr('dock.seeds')),
          ),
          h(
            'span',
            { className: 'cg-stat', key: 'harvests' },
            h('b', null, String(garden.harvestCount)),
            h('span', null, tr('dock.harvests')),
          ),
        ),
        flash !== null
          ? h(
              'span',
              { className: 'cg-gain', key: 'gain' + flash.key },
              tr('harvest.gained').replace('{n}', String(flash.seeds)),
            )
          : null,
      )
    }

    // ---- sidebar tab ---------------------------------------------------
    /** One seed-store row for a kind. */
    function KindRow(props) {
      const kind = props.kind
      const tr = props.tr
      return h(
        'div',
        { className: 'cg-kind-row', 'data-kind': kind },
        h(
          'span',
          { className: 'cg-kind-icon', 'aria-hidden': true },
          h(
            'svg',
            { viewBox: '-10 -22 20 24', width: 20, height: 24 },
            h(PlantGlyph, { kind }),
          ),
        ),
        h(
          'span',
          { className: 'cg-kind-text' },
          h('b', null, tr('kind.' + kind)),
          h('i', null, tr('kind.' + kind + 'Mean')),
        ),
        h(
          'span',
          { className: 'cg-kind-nums' },
          h('span', { title: tr('panel.harvestTotal') }, String(props.harvested)),
          h('em', null, '·'),
          h('span', { title: tr('panel.seedBalance') }, String(props.seeds)),
        ),
      )
    }

    /** A small vermilion seal — the garden's signature, not information. */
    function Seal(props) {
      return h(
        'span',
        { className: 'cg-seal', 'aria-hidden': true, title: props.title || '' },
        h(
          'svg',
          { viewBox: '0 0 24 24', width: 21, height: 21 },
          h('rect', { x: 1.2, y: 1.2, width: 21.6, height: 21.6, rx: 4.2, fill: 'var(--cg-seal)', opacity: 0.9 }),
          h('rect', {
            x: 3.4,
            y: 3.4,
            width: 17.2,
            height: 17.2,
            rx: 2.4,
            fill: 'none',
            stroke: 'var(--cg-paper)',
            strokeWidth: 0.7,
            opacity: 0.55,
          }),
          h(
            'text',
            {
              x: 12,
              y: 16.4,
              textAnchor: 'middle',
              fontSize: 10.5,
              fill: 'var(--cg-paper)',
              fontFamily: 'var(--cg-serif)',
            },
            props.glyph || '园',
          ),
        ),
      )
    }

    /** Full garden panel shown in the right sidebar. */
    function GardenPanel(props) {
      const useProjection = typeof props.useProjection === 'function' ? props.useProjection : () => undefined
      const garden = normalizeGarden(useProjection('garden'))
      const pressure = useProjection('contextPressure')
      const tr = trOf(props)
      const season = seasonOf(garden, pressure)
      const flash = useHarvestFlash(garden)
      const shownSeeds = useCountUp(garden.seeds)
      const unlocked = unlockedOf(garden.seeds)
      const next = nextUnlockOf(garden.seeds)
      const pressurePct = season.pressure === null ? null : Math.round(season.pressure * 100)
      const logRows = garden.harvests.slice(-5).reverse()

      const unlockLine =
        next === null
          ? tr('panel.unlockedAll')
          : tr('panel.unlockNext')
              .replace('{n}', String(next.at - garden.seeds))
              .replace('{name}', tr('unlock.' + next.key))
      const unlockProgress =
        next === null
          ? 1
          : clamp(garden.seeds / Math.max(1, next.at), 0, 1)

      return h(
        'div',
        { className: 'cg-root cg-panel', 'data-season': season.key },
        h('style', null, CSS),
        h(
          'header',
          { className: 'cg-panel-head' },
          h(
            'div',
            { className: 'cg-panel-heading' },
            h('h2', { className: 'cg-panel-title' }, tr('panel.title')),
            h('p', { className: 'cg-panel-sub' }, tr('season.' + season.key) + ' · ' + tr('season.' + season.key + 'Line')),
          ),
          h(
            'span',
            { className: 'cg-panel-head-right' },
            h(Seal, { title: tr('meta.title') }),
            h(SeasonMark, { season, tr }),
          ),
        ),
        h(
          'section',
          { className: 'cg-panel-scene' },
          h(GardenField, { variant: 'panel', garden, season, flash, t: props.t }),
        ),
        h(
          'section',
          { className: 'cg-panel-cycle' },
          h(SeasonRing, { season, tr, size: 96 }),
          h(
            'div',
            { className: 'cg-cycle-copy' },
            h('p', { className: 'cg-cycle-line' }, tr('season.' + season.key + 'Note')),
            h(
              'p',
              { className: 'cg-cycle-stat' },
              tr('panel.fieldUsed') +
                ' ' +
                (pressurePct === null ? tr('panel.fieldUnknown') : pressurePct + '%') +
                ' · ' +
                tr('panel.plantsNow') +
                ' ' +
                garden.plants.length +
                ' · ' +
                tr('panel.plantedTotal') +
                ' ' +
                garden.planted,
            ),
            h(
              'div',
              { className: 'cg-bar', 'aria-hidden': true },
              h('span', {
                className: 'cg-bar-fill',
                style: { width: (pressurePct === null ? 0 : pressurePct) + '%' },
              }),
            ),
            season.nearHarvest ? h('p', { className: 'cg-cycle-near' }, tr('season.near')) : null,
          ),
        ),
        h(
          'section',
          { className: 'cg-panel-warehouse' },
          h(
            'div',
            { className: 'cg-section-head' },
            h('h3', null, tr('panel.warehouse')),
            h('span', { className: 'cg-col-head' }, tr('panel.cols')),
          ),
          h(
            'div',
            { className: 'cg-balance-row' },
            h('b', null, String(shownSeeds)),
            h('i', null, tr('panel.seedsUnit')),
            h('span', { className: 'cg-balance-label' }, tr('panel.seedBalance')),
            flash !== null
              ? h('em', { key: 'gain' + flash.key, className: 'cg-gain' }, tr('harvest.gained').replace('{n}', String(flash.seeds)))
              : null,
          ),
          h(
            'div',
            { className: 'cg-kinds' },
            KINDS.map((kind) =>
              h(KindRow, {
                key: kind,
                kind,
                tr,
                harvested: garden.harvestedByKind[kind],
                seeds: garden.seedsByKind[kind],
              }),
            ),
          ),
        ),
        h(
          'section',
          { className: 'cg-panel-log' },
          h('div', { className: 'cg-section-head' }, h('h3', null, tr('panel.harvestLog'))),
          logRows.length === 0
            ? h('p', { className: 'cg-muted' }, tr('panel.noHarvest'))
            : h(
                'ul',
                { className: 'cg-log-list' },
                logRows.map((entry, index) =>
                  h(
                    'li',
                    { key: 'h' + index + '-' + entry.at },
                    h(
                      'span',
                      { className: 'cg-log-text' },
                      tr('panel.harvestEntry')
                        .replace('{n}', String(Math.max(1, garden.harvestCount - index)))
                        .replace('{plants}', String(entry.n))
                        .replace('{seeds}', String(entry.seeds)),
                    ),
                    h('span', { className: 'cg-log-time' }, fmtClock(entry.at)),
                  ),
                ),
              ),
        ),
        h(
          'section',
          { className: 'cg-panel-unlock' },
          h(
            'div',
            { className: 'cg-section-head' },
            h('h3', null, tr('panel.unlock')),
          ),
          h('p', { className: 'cg-muted' }, unlockLine),
          h(
            'div',
            { className: 'cg-bar cg-bar-unlock', 'aria-hidden': true },
            h('span', { className: 'cg-bar-fill', style: { width: Math.round(unlockProgress * 100) + '%' } }),
          ),
        ),
        h(
          'section',
          { className: 'cg-panel-legend' },
          h('div', { className: 'cg-section-head' }, h('h3', null, tr('panel.legend'))),
          h(
            'ul',
            { className: 'cg-legend-list' },
            KINDS.map((kind) =>
              h(
                'li',
                { key: kind, 'data-kind': kind },
                h(
                  'span',
                  { className: 'cg-legend-art', 'aria-hidden': true },
                  h(
                    'svg',
                    { viewBox: '-10 -22 20 24', width: 18, height: 22 },
                    h(PlantGlyph, { kind }),
                  ),
                ),
                h('b', null, tr('kind.' + kind)),
                h('span', null, tr('kind.' + kind + 'Mean')),
              ),
            ),
          ),
        ),
        h('p', { className: 'cg-note' }, tr('panel.note')),
      )
    }

    /** The right-sidebar tab label. */
    function GardenTitle(props) {
      const zh = isChinese()
      const badge = zh ? '花园' : 'Garden'
      return h('span', { className: 'cg-tab-title' }, h('span', { className: 'cg-tab-dot', 'aria-hidden': true }), badge)
    }

    // ---- styles --------------------------------------------------------
    const CSS = [
      // palette + root
      '.cg-root{--cg-serif:"Iowan Old Style","Palatino Linotype","Songti SC","Noto Serif SC","Source Han Serif SC",Georgia,serif;--cg-paper:#f7f2e7;--cg-paper-2:#efe7d7;--cg-ink:#3b3a34;--cg-ink-2:#6d685b;--cg-ink-3:#9a9383;--cg-line:rgba(59,58,52,.13);--cg-line-2:rgba(59,58,52,.08);--cg-band:#f3ecdd;',
      '--cg-moss:#84977a;--cg-leaf:#7d9a74;--cg-leaf-deep:#5c7a5b;--cg-sprout:#a4bd7f;--cg-grass:#7fa08a;--cg-bamboo:#6f9377;--cg-amber:#c1965c;--cg-weed:#a98a5f;--cg-blossom:#e2bcba;--cg-water:#9db9c1;--cg-snow:#e6edee;--cg-moon:#e8e3d2;--cg-sun:#e6cfa4;--cg-stone:#a8a496;--cg-soil:#8b7b5f;--cg-soil-2:#6f6249;--cg-soil-line:#4f4534;',
      '--cg-sky-1:#f2ead8;--cg-sky-2:#e8ddc6;--cg-hill:#c8c2a8;--cg-hill-2:#b7b39a;--cg-seal:#b0554a}',
      'body[data-ds-dark-theme] .cg-root{--cg-paper:#191d1b;--cg-paper-2:#202623;--cg-ink:#d9d5c9;--cg-ink-2:#a8a397;--cg-ink-3:#77746a;--cg-line:rgba(217,213,201,.16);--cg-line-2:rgba(217,213,201,.08);--cg-band:#1d2320;',
      '--cg-moss:#7c8f72;--cg-leaf:#7f9878;--cg-leaf-deep:#5f7c60;--cg-sprout:#9cb578;--cg-grass:#7a9a85;--cg-bamboo:#77957b;--cg-amber:#c09a60;--cg-weed:#a58c63;--cg-blossom:#b9948f;--cg-water:#7f9fa8;--cg-snow:#cfd9dc;--cg-moon:#d8d5c8;--cg-sun:#d9c49f;--cg-stone:#8f8c80;--cg-soil:#5d5442;--cg-soil-2:#463f30;--cg-soil-line:#2c271d;',
      '--cg-sky-1:#1c2320;--cg-sky-2:#232b27;--cg-hill:#3a463d;--cg-hill-2:#333d36;--cg-seal:#a8564c}',
      // scene seasonal palettes
      '.cg-scene{--cg-sky-1:#f2ead8;--cg-sky-2:#e8ddc6;--cg-hill:#c8c2a8;--cg-hill-2:#b7b39a;--cg-soil:#8b7b5f;--cg-soil-2:#6f6249;--cg-soil-line:#4f4534}',
      '.cg-scene[data-season="spring"]{--cg-sky-1:#f3eddb;--cg-sky-2:#e9e0c9;--cg-hill:#c6c8ae;--cg-hill-2:#b3b89c;--cg-soil:#877a60;--cg-soil-2:#6c6048;--cg-soil-line:#4c4232;--cg-sun:#e6cfa4}',
      '.cg-scene[data-season="summer"]{--cg-sky-1:#e9ecd6;--cg-sky-2:#dbe3c6;--cg-hill:#adb99a;--cg-hill-2:#9cab88;--cg-soil:#7d7358;--cg-soil-2:#645c45;--cg-soil-line:#463f2f;--cg-sun:#e3c98f}',
      '.cg-scene[data-season="autumn"]{--cg-sky-1:#f1e3ca;--cg-sky-2:#e8d2b0;--cg-hill:#c9b28d;--cg-hill-2:#b79d77;--cg-soil:#85704f;--cg-soil-2:#6a593d;--cg-soil-line:#4b3f2b;--cg-sun:#dda95f}',
      '.cg-scene[data-season="winter"]{--cg-sky-1:#e9edeb;--cg-sky-2:#d7dfdc;--cg-hill:#b9c3be;--cg-hill-2:#a9b4ae;--cg-soil:#7c7566;--cg-soil-2:#655f52;--cg-soil-line:#4a463d;--cg-sun:#e8e3d2}',
      'body[data-ds-dark-theme] .cg-scene{--cg-sky-1:#1c2320;--cg-sky-2:#232b27;--cg-hill:#3a463d;--cg-hill-2:#333d36;--cg-soil:#5d5442;--cg-soil-2:#463f30;--cg-soil-line:#2c271d}',
      'body[data-ds-dark-theme] .cg-scene[data-season="spring"]{--cg-sky-1:#1e2520;--cg-sky-2:#242d26;--cg-hill:#3d4a3e;--cg-hill-2:#364137;--cg-soil:#5a5140;--cg-soil-2:#443c2e;--cg-soil-line:#2a251b}',
      'body[data-ds-dark-theme] .cg-scene[data-season="summer"]{--cg-sky-1:#1d2620;--cg-sky-2:#223028;--cg-hill:#3a4a3b;--cg-hill-2:#324133;--cg-soil:#584f3b;--cg-soil-2:#423b2b;--cg-soil-line:#282316}',
      'body[data-ds-dark-theme] .cg-scene[data-season="autumn"]{--cg-sky-1:#26221b;--cg-sky-2:#2f291f;--cg-hill:#4a3f2f;--cg-hill-2:#40372a;--cg-soil:#584a35;--cg-soil-2:#423829;--cg-soil-line:#282117}',
      'body[data-ds-dark-theme] .cg-scene[data-season="winter"]{--cg-sky-1:#1b2022;--cg-sky-2:#222a2c;--cg-hill:#3a4446;--cg-hill-2:#333c3e;--cg-soil:#565348;--cg-soil-2:#413f36;--cg-soil-line:#272621}',
      // scene chrome
      '.cg-scene{position:relative;border-radius:14px;overflow:hidden;border:1px solid var(--cg-line-2);background:linear-gradient(180deg,var(--cg-sky-1),var(--cg-sky-2));isolation:isolate}',
      '.cg-scene svg.cg-field{display:block;width:100%;height:100%}',
      '.cg-scene-dock{height:100%;border:0;border-radius:9px;background:linear-gradient(180deg,var(--cg-sky-1),var(--cg-sky-2))}',
      '.cg-scene-panel{aspect-ratio:16/9;min-height:168px;box-shadow:inset 0 0 24px rgba(59,58,52,.06),inset 0 0 90px rgba(59,58,52,.04);background-image:radial-gradient(rgba(59,58,52,.028) 0.6px,transparent 0.6px),linear-gradient(180deg,var(--cg-sky-1),var(--cg-sky-2));background-size:3px 3px,auto}',
      '.cg-scene-caption{position:absolute;left:10px;right:10px;bottom:8px;padding:5px 9px;border-radius:8px;background:color-mix(in srgb,var(--cg-paper) 82%,transparent);border:1px solid var(--cg-line-2);backdrop-filter:blur(4px);font-size:10px;line-height:1.5;color:var(--cg-ink-2);font-family:var(--cg-serif);letter-spacing:.02em;pointer-events:none}',
      '.cg-scene-banner{position:absolute;top:10px;left:12px;padding:3px 9px;border-radius:999px;background:color-mix(in srgb,var(--cg-paper) 70%,transparent);border:1px solid var(--cg-line-2);font-size:10px;letter-spacing:.06em;color:var(--cg-ink);animation:cg-banner 2.5s ease forwards;backdrop-filter:blur(3px)}',
      // plant animation
      '.cg-plant .cg-sway{animation:cg-sway var(--cg-sway-dur,6s) ease-in-out infinite;animation-delay:var(--cg-sway-delay,0s);transform-box:fill-box;transform-origin:50% 100%}',
      '.cg-plant .cg-grow{animation:cg-grow .65s cubic-bezier(.2,.7,.3,1) both;transform-box:fill-box;transform-origin:50% 100%}',
      '.cg-plant.cg-sway{animation:cg-sway var(--cg-sway-dur,6s) ease-in-out infinite;animation-delay:var(--cg-sway-delay,0s);transform-box:fill-box;transform-origin:50% 100%}',
      '.cg-plant.cg-fly{animation:cg-fly 1s cubic-bezier(.45,0,.3,1) forwards;transform-box:fill-box;transform-origin:50% 100%}',
      '.cg-particle{animation:cg-drift var(--cg-dur,8s) linear infinite;animation-delay:var(--cg-delay,0s);opacity:0}',
      '@keyframes cg-sway{0%,100%{transform:rotate(-1.7deg)}50%{transform:rotate(1.7deg)}}',
      '@keyframes cg-grow{from{transform:scale(.18);opacity:0}to{transform:scale(1);opacity:1}}',
      '@keyframes cg-fly{0%{opacity:1}60%{opacity:.9}100%{transform:translate(90px,-52px) scale(.32) rotate(8deg);opacity:0}}',
      '@keyframes cg-drift{0%{transform:translate(0,-6px);opacity:0}12%{opacity:var(--cg-po,.6)}82%{opacity:var(--cg-po,.6)}100%{transform:translate(12px,40px);opacity:0}}',
      '@keyframes cg-banner{0%{opacity:0;transform:translateY(-3px)}12%{opacity:1;transform:none}78%{opacity:1}100%{opacity:0;transform:translateY(-2px)}}',
      '@keyframes cg-gain{0%{opacity:0;transform:translateY(5px)}16%{opacity:1;transform:none}70%{opacity:1}100%{opacity:0;transform:translateY(-9px)}}',
      // dock
      '.cg-dock{display:inline-flex;align-items:center;gap:6px;height:27px;box-sizing:border-box;padding:0 9px 0 2px;margin:0;border:0;border-radius:999px;background:transparent;color:var(--dsw-alias-label-secondary,#6b6b6b);font:inherit;text-align:left;cursor:pointer;transition:background .18s ease}',
      '.cg-dock:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.06))}',
      '.cg-dock:focus-visible{outline:1.5px solid var(--dsw-alias-brand-primary,#4c6ef5);outline-offset:2px}',
      '.cg-season-mark{display:inline-flex;align-items:center;flex:none}',
      '.cg-enso{width:22px;height:22px;border-radius:50%;border:1.4px solid var(--cg-ink-3);border-right-color:transparent;display:grid;place-items:center;font-family:var(--cg-serif);font-size:10.5px;line-height:1;color:var(--cg-ink-2);transform:rotate(-14deg);flex:none}',
      '.cg-season-mark-label{font-size:9.5px;letter-spacing:.14em;color:var(--cg-ink-3);font-family:var(--cg-serif)}',
      '.cg-dock-field{position:relative;width:136px;height:29px;flex:none;border-radius:8px;overflow:hidden;border:1px solid var(--cg-line-2);box-shadow:inset 0 1px 0 rgba(255,255,255,.14)}',
      '.cg-dock-field .cg-field{display:block;width:100%;height:100%}',
      '.cg-dock-stats{display:inline-flex;align-items:baseline;gap:8px;flex:none;font-variant-numeric:tabular-nums;white-space:nowrap}',
      '.cg-stat{display:inline-flex;align-items:baseline;gap:3px}',
      '.cg-stat b{font-size:11px;font-weight:600;color:var(--cg-ink)}',
      '.cg-stat span{font-size:7.5px;letter-spacing:.1em;color:var(--cg-ink-3)}',
      '.cg-gain{font-size:9.5px;color:var(--cg-amber);font-variant-numeric:tabular-nums;animation:cg-gain 2.3s ease forwards;white-space:nowrap}',
      '.cg-dock-caption{display:none}',
      // panel
      '.cg-panel{display:flex;flex-direction:column;gap:15px;width:100%;box-sizing:border-box;padding:16px 15px 26px;color:var(--dsw-alias-label-primary,#1a1a1a);font-size:12px;line-height:1.55;background:linear-gradient(180deg,color-mix(in srgb,var(--cg-paper-2) 55%,transparent),transparent 260px)}',
      '.cg-panel-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}',
      '.cg-panel-head-right{display:inline-flex;align-items:center;gap:8px;flex:none;padding-top:2px}',
      '.cg-seal{display:inline-flex;filter:drop-shadow(0 1px 1px rgba(0,0,0,.08))}',
      '.cg-panel-heading{min-width:0}',
      '.cg-panel-title{margin:0;font-family:var(--cg-serif);font-size:19px;line-height:1.2;font-weight:600;letter-spacing:.02em;color:var(--cg-ink)}',
      '.cg-panel-sub{margin:4px 0 0;font-size:10.5px;letter-spacing:.04em;color:var(--cg-ink-2);font-family:var(--cg-serif)}',
      '.cg-panel-cycle{display:flex;align-items:center;gap:14px}',
      '.cg-ring{flex:none;position:relative;display:flex;align-items:center;justify-content:center}',
      '.cg-ring-svg{display:block;width:96px;height:96px}',
      '.cg-cycle-copy{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:6px}',
      '.cg-cycle-line{margin:0;font-family:var(--cg-serif);font-size:12.5px;color:var(--cg-ink)}',
      '.cg-cycle-stat{margin:0;font-size:10px;color:var(--cg-ink-3);font-variant-numeric:tabular-nums}',
      '.cg-cycle-near{margin:0;font-size:10px;letter-spacing:.08em;color:var(--cg-amber)}',
      '.cg-bar{position:relative;height:3px;border-radius:999px;overflow:hidden;background:var(--cg-line-2)}',
      '.cg-bar-fill{display:block;height:100%;border-radius:999px;background:var(--cg-moss);transition:width .6s ease}',
      '.cg-section-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin:0 0 8px}',
      '.cg-section-head h3{margin:0;font-size:10px;font-weight:500;letter-spacing:.16em;color:var(--cg-ink-3)}',
      '.cg-col-head{font-size:8.5px;letter-spacing:.08em;color:var(--cg-ink-3)}',
      '.cg-balance-row{display:flex;align-items:baseline;gap:4px;margin:0 0 8px;font-variant-numeric:tabular-nums}',
      '.cg-balance-row b{font-family:var(--cg-serif);font-size:21px;font-weight:600;color:var(--cg-ink);line-height:1}',
      '.cg-balance-row i{font-style:normal;font-size:9px;color:var(--cg-ink-3)}',
      '.cg-balance-label{margin-left:2px;font-size:9px;color:var(--cg-ink-3);letter-spacing:.06em}',
      '.cg-balance-row .cg-gain{margin-left:6px}',
      '.cg-panel-warehouse,.cg-panel-log,.cg-panel-unlock,.cg-panel-legend{padding-top:2px}',
      '.cg-kinds{display:flex;flex-direction:column;gap:5px}',
      '.cg-kind-row{display:flex;align-items:center;gap:9px;padding:4px 7px;border-radius:9px;background:color-mix(in srgb,var(--cg-band) 55%,transparent)}',
      '.cg-kind-icon{flex:none;width:22px;display:flex;justify-content:center}',
      '.cg-kind-text{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:1px}',
      '.cg-kind-text b{font-size:11px;font-weight:500;color:var(--cg-ink);line-height:1.2}',
      '.cg-kind-text i{font-style:normal;font-size:9px;color:var(--cg-ink-3);line-height:1.2}',
      '.cg-kind-nums{flex:none;font-size:10px;color:var(--cg-ink-2);font-variant-numeric:tabular-nums;letter-spacing:.02em}',
      '.cg-kind-nums em{margin:0 3px;font-style:normal;color:var(--cg-ink-3)}',
      '.cg-log-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:5px}',
      '.cg-log-list li{display:flex;align-items:baseline;justify-content:space-between;gap:8px;font-size:10.5px;color:var(--cg-ink-2)}',
      '.cg-log-time{flex:none;font-size:9.5px;color:var(--cg-ink-3);font-variant-numeric:tabular-nums}',
      '.cg-muted{margin:0;font-size:10.5px;line-height:1.6;color:var(--cg-ink-3)}',
      '.cg-bar-unlock{margin-top:8px}',
      '.cg-legend-list{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:1fr 1fr;gap:5px 10px}',
      '.cg-legend-list li{display:flex;align-items:center;gap:6px;min-width:0}',
      '.cg-legend-art{flex:none;display:flex;width:18px;justify-content:center;opacity:.9}',
      '.cg-legend-list b{font-size:10.5px;font-weight:500;color:var(--cg-ink-2);white-space:nowrap}',
      '.cg-legend-list span:last-child{font-size:9px;color:var(--cg-ink-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.cg-note{margin:2px 0 0;font-size:9.5px;line-height:1.6;color:var(--cg-ink-3)}',
      '.cg-tab-title{display:inline-flex;align-items:center;gap:5px;font-size:11.5px}',
      '.cg-tab-dot{width:6px;height:6px;border-radius:50%;background:var(--cg-moss, #84977a);box-shadow:0 0 0 2.5px color-mix(in srgb,currentColor 12%,transparent)}',
      // small screens and reduced motion
      '@media (prefers-reduced-motion: reduce){.cg-sway,.cg-plant.cg-sway,.cg-plant.cg-fly,.cg-plant .cg-grow,.cg-particle,.cg-gain,.cg-scene-banner,.cg-balance .cg-gain{animation:none !important}.cg-plant.cg-fly{opacity:0}}',
    ].join('')

    // ---- plugin --------------------------------------------------------
    return {
      inject: ['slots', 'sidebarRight', 'sidebarRightTabs', 'locale'],
      apply(ctx) {
        // Dictionaries: the built-in tables double as the registration payload,
        // so the widget reads the active locale instead of re-detecting it.
        ctx.effect(
          () => ctx.locale.register(NS, { zh: TEXT.zh, en: TEXT.en }),
          'context-garden: dictionaries',
        )

        /** Open (or focus) the garden tab in the right sidebar. */
        const openGardenTab = () => {
          try {
            const right = ctx.sidebarRight
            if (right !== undefined && typeof right.openTab === 'function') right.openTab(TAB_KIND)
          } catch {
            /* the sidebar may be unavailable in this profile */
          }
        }

        ctx.slots.inject('conversation.composer.dock', () =>
          ctx.slots.register(
            {
              name: 'conversation.composer.dock',
              id: 'context-garden',
              order: 2,
              locale: NS,
              inject: () => ({ openGardenTab }),
            },
            GardenDock,
          ),
        )

        const tabs = ctx.sidebarRightTabs
        ctx.effect(
          () =>
            tabs.register({
              id: TAB_ID,
              kind: TAB_KIND,
              priority: 'builtin',
              title: () => (isChinese() ? '花园' : 'Garden'),
            }),
          'context-garden: sidebar tab type',
        )
        ctx.slots.inject('sidebar.right.pane.tab', () =>
          ctx.slots.register({ name: 'sidebar.right.pane.tab', key: TAB_ID, locale: NS }, GardenPanel),
        )
        ctx.slots.inject('sidebar.right.pane.tab.title', () =>
          ctx.slots.register({ name: 'sidebar.right.pane.tab.title', key: TAB_ID }, GardenTitle),
        )
      },
      // Pure model surface for the render tests; the module loader only reads
      // `inject` and `apply`, so this is inert at runtime.
      __model: {
        TAB_ID,
        TAB_KIND,
        KINDS,
        FIELD_CAP,
        HARVEST_CAP,
        SEASONS,
        SEASON_GLYPH,
        UNLOCKS,
        TEXT,
        normalizeGarden,
        pressureRatioOf,
        seasonOf,
        unlockedOf,
        nextUnlockOf,
        hashNum,
        kindOf,
        sumKinds,
        fmtClock,
        GardenDock,
        GardenPanel,
        GardenField,
        PlantGlyph,
        SeasonRing,
        GardenTitle,
      },
    }
  },
})