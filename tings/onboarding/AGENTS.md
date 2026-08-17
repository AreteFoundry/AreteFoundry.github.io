# AGENTS — Tings Interactive Onboarding

A self-contained, vanilla HTML/CSS/JS "phone frame" that onboards a new user to
Tings by **doing** the core loop. It lives at `tings/onboarding/` inside the
AreteFoundry docs repo and is linked from `tings/index.html`.

## Constraints (non-negotiable)
- **No framework, no build step.** Plain HTML/CSS/JS. `app.js` is loaded with a
  plain `<script>` (no module, no imports). Globals are fine.
- **Visual parity, no cross-origin iframe.** The live `lanbeee.github.io/habits`
  app is a different origin, so it can't be framed for coach highlighting.
  Instead we **vendor a frozen copy** of its stylesheet as `styles-tings.css`
  (byte-for-byte copy of `habits/styles.css`) and write real mobile markup so
  the home surface looks identical to Tings. `style.css` then adds only the
  phone-frame + sim overrides on top.
- **Do not touch the real app.** The onboarding is docs-side only: no `sw.js`
  cache bump, no edit to `lanbeee.github.io/habits`.
- **Mobile first.** The demo is a 390×844 phone (320×680 below 1180px). Touch
  targets ≥38px. `env(safe-area-inset-*)` is respected via the vendored CSS.

## Files
| File | Purpose |
|------|---------|
| `styles-tings.css` | **Vendored exact copy** of `../habits/styles.css` (do not hand-edit; regenerate by copying). Loaded first. |
| `style.css` | Overrides only: page layout, `.coach-layout`/`.phone-frame`, containment for the phone (`position:absolute` sheets/nav inside `#phone-screen`), sim-pane rules (`#agenda`/`#overview-pane`/`#detail-pane` + `.show`), add-sheet fields, coach + spotlight + `#toast`. |
| `index.html` | Real mobile DOM shell, linked above (see markup map below). |
| `app.js` | Simulator + guided coach. Single `state`; `render()` is the only paint path. |
| `AGENTS.md` | This file. |

## Markup map (must match `habits/` conventions)
```
<body data-pane-count="1" class="compact-mode minimal-mode" data-theme="light">
  <div class="coach-layout">
    <div class="phone-frame"><div class="phone-notch"></div>
      <div class="phone-screen" id="phone-screen">
        <div class="app">
          <div class="pane-list">
            <div class="topbar">…wordmark (#open-about) · #home-date · #home-tag-filter…</div>
            <div id="quota-bar">…</div>
            <div id="list">…tings…</div>
            <div id="empty">…empty state…</div>
          </div>
          <div id="agenda">…</div>
          <div id="overview-pane">…</div>
          <div id="detail-pane">…</div>
          <div class="bottom-nav">…#open-add / .nav-add / #open-overview / #open-search…</div>
          <div class="sheet-wrap" id="add-sheet">…<div class="sheet add-sheet">…</div></div>
          <div class="sheet-wrap" id="settings-sheet">…<div class="sheet settings-sheet">…</div></div>
          <div class="sheet-wrap" id="about-sheet">…</div>
          <div class="sheet-wrap" id="samples-sheet">…</div>
        </div>
        <div class="spotlight" id="spotlight"></div>
        <div id="toast"></div>
      </div>
    </div>
    <aside class="coach">…coach-head / progress / card…</aside>
  </div>
</body>
```
Real class names are used exactly: `wordmark`, `ting-card`, `minimal-card`,
`pulse-btn`, `emoji-mark`, `ting-info`, `ting-cue`, `ting-meta`,
`context-pill schedule`, `section-header`, `sheet-wrap`/`sheet`, `bottom-nav`,
`topbar`, `pane-list`. Body class toggles mirror `habits/js/settings.js`:
`body.minimal-mode`, `body.compact-mode`, `<html data-theme=…>`.

## The model & render pipeline
- `state` is the single source of truth: `mode`, `screen`, `settings{}`,
  `habits[]`, `busy[]`, `places[]`, `sheets{}`, `addType`, `detailIdx`, `toast`.
- `render()` reads `state` and paints `#list`, `#agenda`/`#overview-pane`/
  `#detail-pane`, the topbar date/tag, sheets, empty state, body classes, theme,
  and the spotlight. It must **not** destroy live form inputs, so:
  - The **add sheet** skeleton is static in HTML; only `#task-due-row` is toggled
    and `#type-seg`'s active segment is synced each render.
  - The **settings** stack is built once (guarded by `sheetsBuilt.settings`);
    only `#busy-list`/`#locations-list` content is refreshed.
  - The **samples** list is refreshed only while the sheet is shown.
- After any mutation that changes placement, call `recomputeAgenda()` then `render()`.
- Sheets use `.sheet-wrap.open` (NOT `.show`) — `syncSheets()` toggles `.open`.
- `recomputeAgenda()` is a small self-contained slotter (`freeSegments` /
  `openMinutes`); it is **not** the real GLPK/ILP planner.

## The coach contract (the heart of the demo)
- `coach.steps` lives in `defineSteps()`. Each step: `expect` (a reason the app
  must emit to auto-advance; `'none'` = watch-only; `'open-app'` = final,
  opens the real app), `target.sel` (CSS selector inside `#phone-screen`),
  `setup(state)` (idempotent scene-setter), and `body` (coach copy).
- `coach.bump(reason)` advances only when `reason === coach.expect`. Handlers emit
  the reason **after** mutating state + rendering — steps advance on real actions,
  not on Next-taps.
- `positionHighlight(target)` builds the 4-strip `#spotlight` hole around the
  target; `#phone-screen` gets `.show-spotlight`.
- Add a step: append to `defineSteps()`, seed the scene with `seedMinimal`/
  `seedRegular`/`ensureTing`, and make the matching action emit the `expect`.

## Seeders
- `seedMinimal()` — new-user default: minimal mode, no habits/busy/places. **Entry point.**
- `seedRegular()` — regular mode, `weekByDay`, realistic sample set
  (Morning walk, Gym, Write report, Read) + demo busy + places.
- `ensureTing(obj)` — upsert by name (idempotent re-runs).

## Interaction handlers (reason-gated)
- `openAdd()` → `'add-open'`; `tryAdd()` → `'ting-added'`. `tryAdd()` guards
  `dueDate` (null when no date, never `new Date('T12:00:00')`).
- `logTing(id)` → `'logged'`; `openDetail(id)` → `'detail-open'`.
- `switchScreen(to)` → `'screen-' + to`.
- `toggleSetting(key)` → `'toggle-' + key` (e.g. `'toggle-minimalMode'`,
  `'toggle-weekByDay'`).
- Taps on the logo (`.wordmark` / `#open-about`) → `openSheet('about')` +
  `'about-open'`.
- `useDemoBusy()` → `'busy-set'`; `addPlace(name)` → `'place-added'`.
- The `#app` delegated click handler matches by selector so rebuilt content
  (shelves, sample items, places, settings rows) still works.

## Verification (no browser available here)
```
python3 -m http.server 8080   # from repo root, open /tings/onboarding/
```
Node + a hand-rolled DOM stub (`/tmp/stub.js`, `/tmp/run_tests.js`) exercises logic
(layout/positioning/spotlight are **not** exercised because the stub does not
parse rendered `innerHTML` into a live tree):
- `node --check app.js` — syntax OK.
- 23-step walk: every `setup()` + reason bump runs with **0 errors**, ends in
  regular mode with 4 habits / 4 busy / 2 places, final `expect='open-app'`.
- End-to-end: logo → About → `+` → Save produces a "Read" habit and advances the
  coach to step 5 (`ting-added`).
- `wire()` bindings: every named button (`open-about`, `open-add`, `do-save`,
  `coach-next`, `coach-prev`, `theme-toggle`, `settings-close`, `samples-close`,
  `about-close`, `restart-tour`) is bound.

## Style rules
- Use the vendored token variables, not hardcoded colors.
- `#phone-screen .sheet-wrap{position:absolute;inset:0}`,
  `.sheet{max-width:100%}`, `.bottom-nav{position:absolute;bottom:0}` — these
  override the real full-viewport `position:fixed` rules so sheets/nav stay
  inside the phone frame.
- Sim panes are hidden via `#agenda:not(.show){display:none}` etc.
