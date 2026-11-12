# dsh-context-garden · 上下文花园 🌱

> A zen garden for the context window. A DeepSeek Harness plugin.

**English:** Turn the context window into a zen garden: every message or tool result plants a plant (code = cactus, image = flower, error = weed), and each context compaction harvests the field into seed currency before it is replanted through four seasons.

**中文：** 把上下文窗口种成一座禅意花园：每条消息或工具结果种下一株植物（代码=仙人掌、图片=花、报错=杂草），每次上下文压缩就是收割季，植物化为种子货币，田地清空后随四季重新播种。

The garden is folded out of the session log the Harness already records. It adds no prompt, no tool, no model call and no session write; in v0.1.0 it opens no HTTP route either. Reopen the session, replay the log, or open it on another machine — the same garden grows back.

[中文说明 →](README.zh.md)

## At a glance

```
  session log events ──plant──▶  the field  ──harvest──▶  seed warehouse
                                 ≤ 240 plants              by species
                                                              │
                                                         seeds accumulate
                                                              ▼
                                        lifetime 1 / 40 / 120 / 300 / 800
                                                → garden unlocks
```

Every user message, assistant reply with text, and tool result plants something. A context compaction is the harvest: the standing plants are turned into seeds and the field is cleared. The next messages plant into the empty field, and the four seasons read how full it is.

## Species

| Plant | Fits | Planted when |
| --- | --- | --- |
| Cactus · 仙人掌 | code | an assistant reply or user message containing a code fence; a code-writing tool result (shell, editor, patch, workflow…) |
| Flower · 花 | image | any message or tool result that carries an image |
| Weed · 杂草 | errors | a tool result marked `isError` |
| Bamboo · 竹 | answers | an assistant reply with text — a step with only reasoning and tool calls plants nothing |
| Grass · 草 | reading & search | read / search / list-style tool results; unknown tools fall back here |
| Sprout · 幼苗 | your words | a user message without an image or code |

Tool results are classified by tool name. The host half resolves the name from the session's own `tool/call` events and keeps that map on the host side only; the full mapping is `categoryOfTool` in `index.js`.

## Harvest and the four seasons

A context compaction (`compaction/start`) is the harvest. The plants standing in the field are weighed, converted to seeds, and recorded; the field goes back to bare soil. The session itself is untouched — only the garden's field state resets. The last 24 harvests are kept in the projection; the panel shows the most recent five.

Seasons are read from how full the field is, so the garden ages with the conversation:

| Season | When | What it looks like |
| --- | --- | --- |
| Spring · 春 | field occupancy `p < 0.38` | new shoots, pale sky |
| Summer · 夏 | `0.38 ≤ p < 0.62` | leaves thickening, a fuller field |
| Autumn · 秋 | `p ≥ 0.62` | heavy ears, warm light — close to the harvest line |
| Winter · 冬 | a harvest has happened and fewer than two plants have been replanted | snow, bare soil, a seed mound |

One line accompanies each season — 新芽初生 (New sprouts) · 枝叶渐茂 (Leaves deepening) · 秋意渐浓，穗实低垂 (Ears bend low, harvest near) · 雪下藏春 (Spring beneath the snow).

Field occupancy comes from the Harness's `contextPressure` (context used / context window). When the window size is not available, the season falls back to counting this round's plants: 0–8 spring, 9–18 summer, more autumn — an estimate, not a measurement.

## Two surfaces

### The garden strip under the composer

A compact 27 px pill below the input box (`conversation.composer.dock`, order 2, id `context-garden`). On the left, a small enso holding the season character. In the middle, a 136 px mini bed with up to 10 swaying SVG plants. On the right, the seed balance and the harvest count; during a harvest the gain rises beside them. The whole pill is a single button: click it (or press Enter) to open the full garden. An empty bed shows bare soil and a small seed mound; the full panel shows the 待播种 line. When a harvest fires in the dock, the plants fly up and the seed number rolls, with the gain rising beside them; the full panel scene also drifts snow dust — for at most 2.6 s.

### The Garden tab in the right sidebar

A right-sidebar tab (id `@ruaibeite/dsh-context-garden/garden`, kind `context-garden`: registered with `sidebarRightTabs.register`, opened with `sidebarRight.openTab('context-garden')`). Its tab label reads 花园 / Garden. From top to bottom:

- the title and the current season with its one-line note; a vermilion seal carved 园 and a small enso sit in the corner;
- a large field scene (16:9, at least 168 px tall): sky, far hills, a sun disc, raked sand, and up to 30 plants placed by a stable hash; an empty field shows a quiet caption chip inside the scene;
- a 96 px four-season ring whose four arcs mark the seasons and whose center carries only the season character; beside it the season note, the field occupancy, the field and planting counts, a fill bar, and a 「收割将至」 hint once occupancy reaches 78%;
- the seed store: the balance and one row per species with its harvested and seed counts, headed 收割 · 种子;
- the harvest log: the most recent five harvests;
- the courtyard: the next unlock and a progress bar toward it;
- the field guide: one row per species with its name and meaning;
- a footer note stating plainly how the garden is derived.

Both surfaces follow the Harness theme (`body[data-ds-dark-theme]`) and its `--dsw-alias-*` variables; their ambient animations are disabled under `prefers-reduced-motion: reduce`.

## Screenshots

The garden strip under the composer — the season mark, the mini bed, the seed balance and the harvest count:

![The garden strip under the composer](assets/screenshot-1.png)

The Garden tab in summer, light theme:

![The Garden tab in summer, light theme](assets/screenshot-2.png)

The same tab in dark theme:

![The Garden tab in dark theme](assets/screenshot-3.png)

After a harvest: winter, an empty bed under snow, and the 待播种 line in the scene:

![Winter after a harvest: an empty bed under snow](assets/screenshot-4.png)

## Seeds and the garden

Each plant carries a weight estimated from the text it grew out of: `ceil(characters / 4)`, clamped to 1–4000. Reasoning text is not counted; a tool result weighs its text blocks.

```
seedValue = clamp(1 + floor(weight / 800), 1, 5) + bonus
bonus: flower +2 · cactus +1 · bamboo +1 · others 0     → a plant is worth 1–7 seeds
```

A small message is worth one seed; a heavy tool result is worth more. Flowers carry the largest bonus.

Lifetime seeds are a reading of the garden, not a currency to spend. They only accumulate, and each threshold reveals a small scene in the garden:

| Lifetime seeds | Unlocks |
| --- | --- |
| ≥ 1 | moss stone |
| ≥ 40 | stone lantern |
| ≥ 120 | koi pond |
| ≥ 300 | raked sand |
| ≥ 800 | moon gate |

## How it works

The host half (`index.js`) registers a session projection called `garden` (stateVersion 1) through `sessionProjections.register`, inside a `ctx.effect` that disposes cleanly. Its `apply` folds a handful of session-log events:

| Event | What it does |
| --- | --- |
| `tool/call` | remembers `callId → tool name` (bounded, host-only) |
| `tool/result` | plants one: error → weed, image → flower, otherwise by tool category |
| `assistant/message` | plants bamboo, or cactus when the text contains a code fence; reasoning-only steps plant nothing |
| `user/message` | plants a sprout, a flower, or a cactus |
| `compaction/start` | harvests the field into seeds |

`wire.view` strips the host-only call map before the state reaches the browser; the client reads it with `useProjection('garden')`, reads the Harness's `contextPressure` projection for the seasons, registers its own dictionaries with the locale service, and renders the two surfaces. Projection caps: 240 plants in the field, 24 harvest records, 80 cached call names (host side). Damaged or missing state is repaired while parsing — the UI degrades quietly instead of failing.

Because every field is derived rather than stored, replaying a session log produces the same garden.

## Install

Three ways:

- **Market** — search for `dsh-context-garden` (or 上下文花园) in the storefront and install.
- **From GitHub** — `dsh plugin --profile <profile> add github:ruaibeite/dsh-context-garden`
- **From a local checkout** — `plugin_manager: install_bundle target=/path/to/dsh-context-garden`

The plugin row is injected by the package's own `cordis.patch.yml`; no manual patch edits are needed. Uninstall with `plugin_manager: remove_bundle` (or from the market), then restart the desktop app so the host half unloads.

## Verify

```sh
cd dsh-context-garden
npm test
```

No dependencies — 61 checks run on plain Node: 44 host tests and 17 render tests. `test/host.mjs` covers the projection (tool classification, every fold rule, seed math and harvests, damaged-state repair, `apply()` with a fake context). `test/render.mjs` runs the client components in a small in-repo harness: dock and panel rendering, seasons, milestones, harvest-flash triggering, the missing-projection fallback, and the bilingual copy.

## Why it costs nothing

- **No model calls.** It adds no prompt, no model tool and no request.
- **No session writes.** The projection only reads the session log.
- **No network.** v0.1.0 registers no HTTP route and contacts no external service.
- **Replay-stable.** The same session log always folds into the same garden — reopen, replay, or open on another device.
- **Visual only.** No tools of its own and no settings surface; one session, one garden.

## Known limits (v0.1.0)

- A season's field keeps at most **240 plants**; older plants fall off the bed. The panel draws the 30 most recent of them and the dock the 10 most recent. Planting totals still count every event, but a harvest converts only the plants still standing — plants that fell off do not become seeds.
- The season prefers `contextPressure`; without a context window size it falls back to counting this round's plants (0–8 spring, 9–18 summer, more autumn), so the season is an estimate.
- If the locale bundle is missing or fails to load, the surfaces fall back to built-in copy instead of failing to render.
- The strip lives in an opened session's composer; the welcome page shown before any session exists has no composer dock, so the garden first appears once a session is open.
- One session, one garden: v0.1.0 has no cross-session overview, no settings page, and registers no tools.

## License

MIT — see [LICENSE](LICENSE).