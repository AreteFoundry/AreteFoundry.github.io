# AGENTS — Tings Interactive Onboarding

A self-contained, vanilla HTML/CSS/JS "phone frame" that onboards a new user to
Tings by **doing** the core loop, not watching screenshots. It lives at
`tings/onboarding/` inside the AreteFoundry docs repo and is linked from
`tings/index.html`.

## Constraints (non-negotiable)
- **No framework, no build step.** Pure HTML/CSS/JS. `app.js` is loaded with a
  plain `<script>` (no `type="module"`, no imports). Globals are fine.
- **Static-only & same-origin.** Do **not** iframe the live `lanbeee.github.io`
  app — it's a different origin and cross-origin blocks coach highlighting. The
  phone frame is a faithful *simulation* of Tings' surfaces.
- **Tokens first.** Reuse the docs palette (`--teal/--amber/--red/--purple/--blue`,
  `--bg/--bg2/--text/--border`, `--radius`, `--shadow`) and real class names
  (`ting-card`, `pulse-btn`, `ting-info`, `ting-cue`, `ting-meta`, `agenda-pill`,
  `card-actions`, `sheet-wrap`, `app-bar`, `bottom-nav`).

## Files
| File | Purpose |
|------|---------|
| `index.html` | Phone-frame shell: app-bar, main panes (`#list`/`#agenda`/`#overview-pane`/`#detail-pane`), bottom-nav, sheets (add/settings/about/samples), spotlight, coach. Static skeletons only; content is rendered by JS. |
| `style.css` | Tokens + phone frame + app shell + cards + swipe shelves + agenda + overview + detail pager + sheets + spotlight + coach + toast. |
| `app.js` | The simulator + guided coach. Single `state` object; `render()` is the only paint path. |
| `AGENTS.md` | This file. |

## The model & render pipeline
- `state` is the single source of truth: `mode`, `screen`, `settings{}`,
  `habits[]`, `busy[]`, `places[]`, `sheets{}`, `addType`, `detailIdx`.
- `render()` reads `state` and paints `#list`, `#agenda`, `#overview-pane`,
  `#detail-pane`, the app-bar, sheets, empty state, mode banner, theme, and the
  spotlight. It must **not** destroy live form inputs, so:
  - The **add sheet** skeleton is static in HTML (only `#task-due-row` is toggled
    and the type-segment `aria-pressed` is synced each render).
  - The **settings** stack is built once (guarded by `sheetsBuilt.settings`) and
    only its content containers (`#busy-list`, `#locations-list`) are refreshed.
  - The **samples** list is refreshed only while the sheet is shown.
- After every state mutation, call `recomputeAgenda()` (if placement changes) then
  `render()`.

## The coach contract (the heart of the demo)
- `coach.steps` is defined in `defineSteps()`. Each step:
  - `expect`: a reason string the app must emit to auto-advance (`'none'` = watch
    only; `'open-app'` = final step opens the real app).
  - `target.sel`: a CSS selector inside `#phone-screen` to spotlight.
  - `setup(state)`: **idempotent**, puts the app into the scene for the step.
  - `body`: coach HTML.
- `coach.bump(reason)` advances only if `reason === coach.expect`. App handlers
  call it **after** mutating state + rendering. This is why steps advance on real
  actions, not on Next-taps.
- `positionHighlight(target)` builds the 4-strip spotlight hole around the target.
- To add a step: append to `defineSteps()`, give it a `setup` that sets the scene
  via the seeders (`seedMinimal`/`seedRegular`/`ensureTing`), and make sure the
  user's action emits the matching `expect` reason.

## Seeders
- `seedMinimal()`: resets to the new-user default — minimal mode, no habits, no
  busy/places. **This is the entry point.**
- `seedRegular()`: regular mode, `weekByDay`, and a realistic sample set
  (Morning walk, Gym, Write report, Read) + demo busy times + places.
- `ensureTing(obj)`: upserts by name (so re-running a setup is idempotent).

## Interaction handlers (all reason-gated)
- `openAdd()` → emits `'add-open'`; `tryAdd()` → emits `'ting-added'`.
- `logTing(id)` → `'logged'`; `openDetail(idx)` → `'detail-open'`.
- `switchScreen(to)` → `'screen-' + to` (e.g. `'screen-agenda'`, `'screen-overview'`).
- `toggleSetting(key)` → `'toggle-' + key` (e.g. `'toggle-minimal'`, `'toggle-weekByDay'`).
- `openSheet('about')` is the Tings logo tap → emits `'about-open'`.
- `useDemoBusy()` → `'busy-set'`; `addPlace(name)` → `'place-added'`.
- Card body tap (regular) → `toggleSwipe()` → `'swipe-revealed'`; drag handle →
  "Do this now" confirm → `'drag-top'`.
- The delegated click handler lives on `#app` and matches by selector so rebuilt
  content (shelves, sample items, places) still works.

## Verification (no browser available here)
Run the smoke/test harness locally:
```
python3 -m http.server 8080   # from repo root, open /tings/onboarding/
```
Programmatic checks performed with a DOM-stub in node:
- `node --check app.js` — syntax OK.
- 23-step walk: every `setup()` + reason bump runs with **0 errors**, ends in
  regular mode with 4 habits / 4 busy / 2 places, final `expect='open-app'`.
- End-to-end UI chain via real click listeners: logo → About → `+` → Save
  produces a "Read" habit and advances the coach.

## Style rules
- Use the token variables, not hardcoded colors.
- Phone is 390×844 (320×680 on ≤1180px). Keep touch targets ≥38px.
- `.sheet-wrap` sheets slide up from the bottom; only one should be `show` at a
  time. Close on backdrop click if you add one.
- Coach aside is `position:sticky; top:65px` so it stays readable while the
  phone scrolls.

## Adding content
- New Ting samples → extend the `defs` map in `addSample()`.
- New coach step → `defineSteps()`; ensure `setup()` is idempotent and the
  completion reason is emitted by the corresponding handler.
- Theme: `app.js` `initTheme()`/`toggleTheme()` mirror the docs site
  (`data-theme` on `<html>`, `localStorage`).
