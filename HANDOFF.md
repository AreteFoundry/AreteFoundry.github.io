# HANDOFF — Tings Interactive Onboarding

> Status: **working head.** `node --check app.js` passes; the 23-step coach walk,
> the logo→About→+→Save→Read core loop, and all button bindings pass in the
> node DOM-stub harness. The home surface now uses the **real** `habits/styles.css`
> (vendored) + real mobile markup (no more "simplified palette" mismatch).
>
> ⚠️ A **real browser** pass is the one gate that could not be run here
> (no chromium/playwright/jsdom in this environment — see *Verification limits*).
> The next agent should open it on desktop **and** a phone and confirm visual parity
> + touch flow.

## 1. Goal & scope

Build an interactive, phone-shaped **onboarding demo** for the Tings app that walks
a new user through the core loop by **doing** it (not watching screenshots):

1. New-user entry point must be **minimal mode** (minimal mode is on by default).
2. After the toggle step, switch to **regular mode** so the rest of the steps use
   the regular, non-minimal surfaces.
3. One page, both modes, toggled via the in-settings `minimal-mode` control.
4. Demo must **work on a phone** (responsive, real safe-area insets, real 1-pane
   layout, touch targets ≥38px).
5. Live **only** in the AreteFoundry docs repo (`tings/onboarding/`). **Do not
   modify** the real app at `lanbeee.github.io/habits/`.

Repo roots:
- Real app (read-only reference): `/Users/nabeelkhan/Downloads/repo/lanbeee.github.io/habits`
- Docs / demo: `/Users/nabeelkhan/Downloads/repo/AreteFoundry.github.io` (demo at `tings/onboarding/`)

## 2. File inventory (current, on disk)

```
tings/onboarding/
  index.html        # Real mobile shell (vendored CSS + overrides)
  styles-tings.css  # EXACT vendored copy of ../../habits/styles.css (4420 lines)
  style.css         # Overrides only: phone frame, containment, sim panes
  app.js            # Simulator + 23-step guided coach (57 KB)
  AGENTS.md         # Maintenance guide (keep in sync)
  /../favicon.svg   # Tings icon (referenced by the wordmark as ../favicon.svg)
```
Docs entry points (already wired):
- `tings/index.html` line 248 (sidebar TOC → "Interactive onboarding tour")
- `tings/index.html` line 321 (hero CTA → "Take the 3-minute interactive tour", `href="onboarding/index.html"`)
- Link to the real app: `tings/index.html` already points the "App" URL to
  `https://lanbeee.github.io/habits/`.

`index.html` body (the contract — match this class/attribute set):
```html
<body data-pane-count="1" class="compact-mode minimal-mode" data-theme="light">
```
- `compact-mode` is always present (real CSS gates compact paddings/pills on `body.compact-mode`).
- `minimal-mode` is toggled by `render()` based on `state.settings.minimalMode`
  (the previous `minimal-body`/`body.minimal-body` bug is gone — real CSS needs
  `body.minimal-mode`).
- `data-theme="light"` is set on `<html>` by `applyTheme()` (mirrors
  `habits/js/settings.js`'s `document.documentElement.dataset.theme = mode`).

## 3. Architecture

### 3.1 "Simulation, not iframe"
Cross-origin blocks coach highlighting/click-through, so the phone is a **faithful
simulation** of Tings' surfaces rendered from a single `state` object. `render()` is
the only paint path. The agenda uses the sim's own `recomputeAgenda()`
(`freeSegments`/`openMinutes`); the real GLPK/ILP planner is **not** ported.

### 3.2 "Look exactly like Tings"
- `styles-tings.css` is a **byte-for-byte copy** of `habits/styles.css` (no `@import`).
  If the real app's styles drift, regenerate with:
  `cp ../../habits/styles.css tings/onboarding/styles-tings.css`.
- `style.css` (loaded **after**) is overrides-only: phone-frame, containment
  (forces real full-viewport `position:fixed` sheets + nav to be `position:absolute`
  inside `#phone-screen`), sim-pane `.show` toggles, add-sheet fields, coach,
  spotlight, `#toast`. **Tokens only** — no hardcoded palette.
- Markup mirrors `habits/js/list-view.js` real card markup:
  `.swipe-row > [.swipe-actions-left, .ting-card, .swipe-actions-right]`,
  `cardTone` ∈ `hit/warn/miss/plan`, `minimal-card` when in minimal, `--card-accent`
  + `--card-priority` + `--emoji-bg` set inline, `.context-pill schedule` for placed
  time, `.no-trail` when not placed.

### 3.3 Coach engine (23 steps)
- `coach.steps` in `defineSteps()`. Each step: `expect` (reason to auto-advance;
  `'none'` = watch-only; `'open-app'` = terminal), `target.sel` (CSS selector to
  spotlight), `setup(state)` (idempotent), `body` (coach copy).
- `coach.bump(reason)` advances **only if** `reason === coach.expect`. Handlers
  emit the reason **after** mutating + rendering — so advancement is on real actions.
- `positionHighlight(target)` = 4 `.spotlight-strip` children in `#spotlight`
  (the old `#spotlight-cutout` model is gone). `#phone-screen` gets `.show-spotlight`.

### 3.4 Minimal → regular
- `seedMinimal()` = new-user default (minimal mode, empty). **Entry point** (m1).
- `seedRegular()` = regular mode, `weekByDay`, 4 sample habits + demo busy + places.
- m14 action: `toggleSetting('minimalMode')` → emits `'toggle-minimalMode'`
  (was the buggy `'toggle-minimal'`). r1 setup: `seedRegular()`. After r1 the coach
  is in **regular** mode for the rest of the walk.

### 3.5 Body-class toggles (the bugs that were fixed)
| Was (bug) | Now (real) | Why |
|---|---|---|
| `minimal-body` / `body.minimal-body` | `body.minimal-mode` | real CSS rules key off `body.minimal-mode` |
| `.sheet-wrap.show` / `.show` sheets | `.sheet-wrap.open` | real CSS is `.sheet-wrap.open{opacity:1}` |
| `switchScreen('settings')` for m13 | `openSheet('settings')` | settings is a sheet, not a screen |
| `home-section-header` targets | `section-header` | real class is `.section-header` |
| `app-bar-logo` (m2) | `wordmark` | real mobile top bar is `.topbar .wordmark` |
| `home-section-header[data-daybase="0"]` | `section-header[data-daybase="0"]` | Today sticky header |
| `expect:'toggle-minimal'` | `expect:'toggle-minimalMode'` | reason matches handler |
| `agenda-pill` (invented) | `context-pill schedule` | real CSS class for placed-time pill |

## 4. What's verified green (node DOM stub)

Reproduce from repo root:

```bash
cd /Users/nabeelkhan/Downloads/repo/AreteFoundry.github.io/tings/onboarding
# 1) syntax
node --check app.js            # PASS
# 2) logic + coach walk + bindings (stub at /tmp/stub.js, suite at /tmp/run_tests.js)
node /tmp/run_tests.js
```

The stub (`/tmp/stub.js`) creates a registry element for any `#id` query; compound
/`.class`/`[attr]` queries return stand-ins or `[]`, so **layout, spotlight geometry,
and rendered-`innerHTML` queries are not exercised** (this is a known limitation,
not a regression). It only validates: coach flow, state, reason-gated advances,
handler wiring, and that `render()`/`update()` don't throw.

Latest run (`/tmp/run_tests.js`):
```
SMOKE  final step idx: 22 / 23
SMOKE  final mode: regular minimal:false habits:4 busy:4 places:2
SMOKE  coach-next: open the app
SMOKE  errors: []
INTEG  coach.step: 5 (expect 5), Read added: true minimal:true
INTEG  errors: []
BINDINGS: open-about:bound | open-add:bound | do-save:bound | coach-next:bound |
          coach-prev:bound | theme-toggle:bound | restart-tour:bound |
          settings-close:bound | samples-close:bound | about-close:bound |
          about-close2:bound | do-cancel:bound
BINDINGS errors: []
```

Asset serving from repo root (`python3 -m http.server 8301`):
```
200  tings/onboarding/
200  tings/onboarding/index.html
200  tings/onboarding/app.js
200  tings/onboarding/style.css
200  tings/onboarding/styles-tings.css
200  tings/onboarding/../favicon.svg   (=> tings/favicon.svg)
```

## 5. Verification limits (the gap)

- **No headless browser** in this env: `npx --no-install playwright` → "missing
  packages … no YES option"; no `chromium`/`google-chrome`/`jsdom`. So I could **not**
  confirm: phone-frame containment vs the real 480px grid, safe-area insets on a
  real device, sheet slide-up animation, bottom-nav overlap with `#list` padding,
  or that `querySelector('.class')` against rendered cards finds the right nodes.
- **Mobile safe-area**: vendored CSS uses `env(safe-area-inset-*)` in the `.sheet`
  padding and `100dvh`. Should be fine on iOS, but untested on device.

## 6. Open items / next steps (for the next agent)

Priority order — do the **browser** ones first, since the node harness can't see them.

1. **Browser visual parity (desk + phone).** Open `tings/onboarding/` on desktop and
   on a phone. Verify the home surface matches `lanbeee.github.io/habits/` pixel-for-
   pixel: teal header band, wordmark, bottom-nav, `ting-card`/pulse/emoji-mark,
   empty state, section-headers. Fix in `style.css` only (never edit the vendored
   `styles-tings.css`).
2. **Phone-frame containment tuning.** If the real `position:fixed` sheets/nav
   escape the 390×844 frame, strengthen the `#phone-screen .sheet-wrap / .sheet /
   .bottom-nav / .app` containment overrides in `style.css`.
3. **Click-through / spotlight visual check.** The coach highlight must land on the
   exact element for every step (m2 `.wordmark`, m3 `.sheet-eyebrow`, m6 `#empty
   .empty-msg`, m9 `.section-header[data-daybase="0"]`, m12 `.context-pill.schedule`,
   m13 `[data-setting="minimalMode"]`, m14 `.switch-ui`, etc.). Step targets live in
   `defineSteps()`; selectors must match the real markup one-for-one.
4. **Minimal→regular hands-free.** Confirm the m14 toggle really flips `body` to
   `regular` (drop `minimal-mode`, keep `compact-mode`) and that r1's `seedRegular()`
   re-renders the regular surfaces.
5. **Sim-only cleanup.** A few classes/IDs are sim-specific (e.g. `.sim-header`,
   `.agenda-row`, `#quota-bar` if present). They are intentional (no real-CSS home
   for them) but audit so none leak into the coach's real-target selectors.
6. **Theme toggle in the coach.** `theme-toggle`/`restart-tour` are bound; verify the
   light/dark toggle writes `data-theme` on `<html>` and persists to `localStorage`.
7. **Real browser automated pass (recommended).** Install Playwright in a follow-up
   (`npm i -D playwright` then a click-scripted walk) to lock the 23-step chain +
   target positions. Not required for this handoff.
8. **Commit.** Stage `tings/onboarding/` (code + vendored CSS + AGENTS + this
   HANDOFF) together. Do NOT touch `lanbeee.github.io/habits` or bump any `sw.js`/`CACHE`.

## 7. Decision log (why things are the way they are)

- **Vendored `styles-tings.css` instead of a cross-origin `<link>`.** A `<link>` to
  the raw GitHub CSS *would* load (CSS cross-origin), but it can drift and the
  real app's cache/versioning makes it fragile. Vendoring a frozen copy guarantees
  parity and survives upstream changes. Regenerate by `cp`.
- **No iframe of the live app.** Cross-origin → coach can't highlight/click-through.
  Rejection documented; simulation it is.
- **No GLPK/ILP port.** `recomputeAgenda()` is a deterministic slotter using
  `freeSegments()` (which correctly splits overnight wrap-around busy blocks, e.g.
  Sunday sleep 1380→300 ⇒ 8h open / 4h stretch) + `openMinutes()`. Enough for the
  demo; the real planner is out of scope.
- **4-strip spotlight (no cutout mask).** `positionHighlight()` builds 4
  `.spotlight-strip` divs around the target rect; the previous `#spotlight-cutout`
  approach was replaced because it couldn't be verified without a DOM.
- **Single coach page, two modes.** Minimal is the default route (matches "new user
  has minimal mode on by default"). Regular is revealed after the toggle step so
  the same flow teaches both surfaces.

## 8. How to iterate (quick loop)

```bash
cd /Users/nabeelkhan/Downloads/repo/AreteFoundry.github.io
python3 -m http.server 8080     # serve docs root
# open http://127.0.0.1:8080/tings/onboarding/
# edits: app.js (logic), style.css (sim/override), index.html (markup),
#        styles-tings.css (only via cp from habits/)
node --check tings/onboarding/app.js
node /tmp/run_tests.js          # smoke + integ + bindings
```

## 9. Git / commit state (as of handoff)

- Last commit on `main`: `2c18147 Add AGENTS.md for the interactive onboarding demo`.
- Since then **uncommitted** changes:
  `M tings/onboarding/app.js`, `M tings/onboarding/index.html`,
  `M tings/onboarding/style.css`, `M tings/onboarding/AGENTS.md`,
  `?? tings/onboarding/styles-tings.css`.
- Remote: `origin https://github.com/AreteFoundry/AreteFoundry.github.io.git`.
- Recommended: `git add tings/onboarding/ && git commit -m "Ship Tings onboarding demo: real CSS + mobile markup + 23-step coach"` then push. **Do not** include the untracked `.DS_Store` files.
