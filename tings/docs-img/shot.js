/**
 * docs-img generator for the Tings help & docs site.
 * Drives the live app with Playwright, seeds realistic sample data,
 * and captures the 9 screenshots the doc placeholders expect.
 *
 *   cd ../../lanbeee.github.io/tings && npx serve -l 4181 -s .
 *   NODE_PATH=../../lanbeee.github.io/node_modules node shot.js
 *
 * Kept in sync with the current app (five-page detail, trimmed samples,
 * first-run coach, weather chips).
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = process.env.HABITS_URL || 'http://127.0.0.1:4181/';
const OUT = process.env.OUT || __dirname;   // this script lives inside docs-img/
const TMP = path.resolve(__dirname, '.tmp');
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(TMP, { recursive: true });

const PHONE = { width: 390, height: 844 };

// A one-off task, same shape the app normalises (see tests/ helpers).
function task(name, dueDate, priority = 1, durationMinutes = 60, eventTime = null, opts = {}) {
  return {
    hid: 'seed-' + name.toLowerCase().replace(/[^a-z]+/g, '-'),
    name, type: 'task', target: null, flexibilityDays: 0, durationMinutes,
    breakable: false, minChunkMinutes: 30, allowedTimeStart: null, allowedTimeEnd: null,
    preferredTimeStart: null, preferredTimeEnd: null, lastLog: null, logs: [], emoji: '',
    pinned: !!opts.pinned, sample: false, snoozedUntil: null, topics: opts.topics || [],
    allowedWeekdays: [], allowedMonthDays: [], preferredWeekdays: [], preferredMonthDays: [],
    dueDate, eventTime, hardDue: !!opts.hardDue,
    markDone: eventTime != null ? false : true, createdAt: dueDate - 86400000,
    locationIds: opts.locationIds || [], priority
  };
}

function extraTasks() {
  const base = new Date(); base.setHours(0, 0, 0, 0);
  const day = ms => base.getTime() + ms * 86400000;
  return [
    task('File quarterly report', day(2), 0, 120),
    task('Physio appointment', day(1), 1, 45, 840),          // tomorrow 2:00pm, fixed event
    task('Call mom', day(0), 2, 30),
    task('Buy groceries', day(3), 3, 45),
    task('Renew passport', day(6), 5, 60),
  ];
}

// Stable page bootstrap: no service worker, and the first-run coach stays
// quiet (install/guided tours would otherwise cover the UI 900ms after paint).
const PAGE_BOOT = () => {
  if (navigator.serviceWorker) {
    navigator.serviceWorker.register = () => Promise.resolve({ update: () => Promise.resolve() });
  }
  try {
    localStorage.setItem('tings_coach_essentials_v2', '1');
    localStorage.setItem('tings_coach_install_v2', '1');
    localStorage.setItem('tings_coach_advanced_v3', '1');
  } catch (e) {}
};

// Seed one page with a realistic, populated planner. Returns once the week is rendered.
async function seed(page, { withTasks = true } = {}) {
  await page.addInitScript(PAGE_BOOT);
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    updateSortSetting({
      minimalMode: false,   // doc screenshots show regular mode (week sections, agenda pills)
      homeCityName: 'New York', homeCityLat: 40.7128, homeCityLng: -74.006,
      blockedTimes: [
        { label: 'sleep', days: [0, 1, 2, 3, 4, 5, 6], start: 1380, end: 300 },
        { label: 'work', days: [1, 2, 3, 4, 5], start: 540, end: 1020 },
        { label: 'commute', days: [1, 2, 3, 4, 5], start: 510, end: 540 },
        { label: 'dinner', days: [0, 1, 2, 3, 4, 5, 6], start: 1080, end: 1140 }
      ],
      // Weather profile for the docs: "Outdoor" steers the timed run demo.
      weatherProfiles: [{
        id: 'weather-outdoor', name: 'Outdoor', rules: [
          { metric: 'precipitation_probability', min: null, max: 60, relative: 'low', hard: false },
          { metric: 'wind_speed_10m', min: null, max: 35, relative: 'none', hard: false }
        ]
      }]
    }, { renderNow: false, sync: false });
    addSortSamples({ closeSheets: true });
  });
  if (withTasks) {
    await page.evaluate(tasks => { const d = load(); d.push(...tasks); save(d); }, extraTasks());
  }
  await page.evaluate(() => {
    // Attach the Outdoor profile to the timed run, then store a plausible
    // forecast so the weather chip renders without hitting the network.
    const d = load();
    const i = d.findIndex(h => h.hid === 'sample-feature-timed-run');
    if (i >= 0) d[i].weatherProfileId = 'weather-outdoor';
    save(d);
    const now = Date.now(), hour = 3600000;
    const start = Math.floor((now - 12 * hour) / hour) * hour;
    const samples = [];
    for (let k = 0; k < 24 * 8; k++) {
      const ts = start + k * hour;
      const h = new Date(ts).getHours();
      const daylight = (h >= 6 && h < 20) ? Math.sin(Math.PI * (h - 6) / 14) : 0;
      const tomorrow = new Date(ts).getDate() !== new Date(now).getDate();
      const wet = tomorrow && h >= 17 && h <= 22;   // a rainy patch tomorrow evening
      samples.push({
        ts,
        temperature_2m: +(18 + 7 * daylight - (wet ? 3 : 0)).toFixed(1),
        apparent_temperature: +(17 + 7 * daylight - (wet ? 4 : 0)).toFixed(1),
        precipitation_probability: wet ? 75 : 8 + Math.round(6 * Math.abs(Math.sin(k / 5))),
        precipitation: wet ? 1.8 : 0,
        snowfall: 0,
        wind_speed_10m: +(10 + 5 * Math.abs(Math.sin(k / 7))).toFixed(1),
        wind_gusts_10m: +(16 + 6 * Math.abs(Math.sin(k / 7))).toFixed(1),
        uv_index: +(6 * daylight).toFixed(1)
      });
    }
    const air = {
      lat: 40.7128, lng: -74.006, fetchedAt: now - 3600000,
      samples: samples.slice(12, 60).map(s => ({ ts: s.ts, us_aqi: 32, european_aqi: 21 }))
    };
    Storage.write('tings_weather_cache_v1', {
      weekly: { lat: 40.7128, lng: -74.006, fetchedAt: now - 3600000, samples },
      air, places: {}
    });
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  // Function predicates (not strings): the app's CSP forbids eval, which
  // string-based waitForFunction would use.
  await page.waitForFunction(() => typeof _homeRenderedWeek !== 'undefined' && _homeRenderedWeek && Array.isArray(_homeRenderedWeek.days), null, { timeout: 25000 });
  await page.waitForFunction(() => { const el = document.querySelector('#list'); return el && !el.classList.contains('is-progressive'); }, null, { timeout: 25000 });
  await page.waitForTimeout(700);   // icons / fonts settle
}

const results = [];
function log(ok, name, extra = '') { results.push({ ok, name, extra }); console.log(`${ok ? 'OK' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); }

(async () => {
  const browser = await chromium.launch({ headless: true });

  // 1 ── home-list.png (top of the list — pinned + today) ───────────────────
  try {
    const page = await browser.newPage({ viewport: PHONE, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
    await seed(page);
    await page.evaluate(() => { document.getElementById('list').scrollTop = 0; window.scrollTo(0, 0); });
    const list = page.locator('#list');
    const box = await list.boundingBox();
    // Short top crop (page coordinates — element screenshots ignore clip)
    await page.screenshot({ path: path.join(OUT, 'home-list.png'), clip: { x: box.x, y: box.y, width: box.width, height: Math.min(500, box.height) } });
    await page.close();
    log(true, 'home-list.png');
  } catch (e) { log(false, 'home-list.png', e.message); }

  // 2 ── sample-habits.png (fresh install → samples sheet) ──────────────────
  try {
    const page = await browser.newPage({ viewport: PHONE, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
    await page.addInitScript(PAGE_BOOT);
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => openSampleHabitsSheet());
    await page.waitForSelector('#sample-habits-sheet.open', { timeout: 8000 });
    await page.waitForTimeout(500);
    const sheet = page.locator('#sample-habits-sheet .sample-habits-sheet');
    const h = await sheet.evaluate(el => el.scrollHeight);
    await sheet.screenshot({ path: path.join(OUT, 'sample-habits.png'), clip: { x: 0, y: 0, width: PHONE.width, height: Math.min(h, 880) } });
    await page.close();
    log(true, 'sample-habits.png');
  } catch (e) { log(false, 'sample-habits.png', e.message); }

  // 3 ── planner-week.png (today | days ahead, side by side) ────────────────
  try {
    const page = await browser.newPage({ viewport: PHONE, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await seed(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
    let box = await page.locator('#list').boundingBox();
    const shots = [];
    // pane A: top of the list (pinned + today)
    await page.screenshot({ path: path.join(TMP, 'week-a.png'), clip: { x: box.x, y: box.y, width: box.width, height: Math.min(950, box.height) } });
    // pane B: scroll the window so the third day section is at the top
    await page.evaluate(() => {
      const headers = [...document.querySelectorAll('#list .section-header')];
      const target = headers[2] || headers[headers.length - 1];
      if (target) window.scrollTo(0, target.getBoundingClientRect().top + window.scrollY - 8);
    });
    await page.waitForTimeout(400);
    box = await page.locator('#list').boundingBox();
    await page.screenshot({ path: path.join(TMP, 'week-b.png'), clip: { x: box.x, y: Math.max(box.y, 0), width: box.width, height: Math.min(950, box.height) } });
    for (const [label, f] of [['today', 'week-a.png'], ['the days ahead', 'week-b.png']]) {
      shots.push({ label, data: fs.readFileSync(path.join(TMP, f)).toString('base64') });
    }
    await page.close();
    const compose = renderTwoPane(shots);
    const cpage = await browser.newPage({ viewport: { width: 900, height: 1060 }, deviceScaleFactor: 2 });
    await cpage.setContent(compose, { waitUntil: 'load' });
    await cpage.waitForTimeout(150);
    await cpage.locator('#stage').screenshot({ path: path.join(OUT, 'planner-week.png') });
    await cpage.close();
    log(true, 'planner-week.png');
  } catch (e) { log(false, 'planner-week.png', e.message); }

  // 4 ── add-sheet.png ──────────────────────────────────────────────────────
  try {
    const page = await browser.newPage({ viewport: PHONE, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
    await seed(page);
    await page.locator('#open-add').click();
    await page.waitForSelector('#add-sheet.open', { timeout: 8000 });
    await page.waitForTimeout(500);
    const sheet = page.locator('#add-sheet .add-sheet');
    const h = await sheet.evaluate(el => el.scrollHeight);
    await sheet.screenshot({ path: path.join(OUT, 'add-sheet.png'), clip: { x: 0, y: 0, width: PHONE.width, height: Math.min(h, 760) } });
    await page.close();
    log(true, 'add-sheet.png');
  } catch (e) { log(false, 'add-sheet.png', e.message); }

  // 5 ── home-full.png (top bar + list + bottom nav) ────────────────────────
  try {
    const page = await browser.newPage({ viewport: PHONE, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
    await seed(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT, 'home-full.png') });
    await page.close();
    log(true, 'home-full.png');
  } catch (e) { log(false, 'home-full.png', e.message); }

  // 6 ── card-anatomy.png (one card, annotated) ─────────────────────────────
  try {
    const page = await browser.newPage({ viewport: PHONE, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
    await seed(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    const card = page.locator('.ting-card', { hasText: 'timed run' }).first();
    await card.waitFor({ timeout: 8000 });
    // scroll it fully into view
    await card.evaluate(el => el.scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(250);
    const raw = path.join(TMP, 'card-raw.png');
    await card.screenshot({ path: raw });
    const box = await card.evaluate(el => {
      const r = el.getBoundingClientRect();
      const rel = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.left - r.left, y: b.top - r.top, w: b.width, h: b.height, cx: b.left - r.left + b.width / 2, cy: b.top - r.top + b.height / 2 }; };
      return {
        w: r.width, h: r.height,
        pts: {
          pulse: rel(el.querySelector('.pulse-btn')),
          name: rel(el.querySelector('.ting-name')),
          pill: rel(el.querySelector('.ting-main [class*=pill],.ting-main .time-pill,.agenda-pill')),
          cue: rel(el.querySelector('.ting-cue')),
          marks: rel(el.querySelector('.ting-meta')),
          weather: rel(el.querySelector('.weather-pill')),
          trail: rel(el.querySelector('.ting-visual')),
        }
      };
    });
    const png = fs.readFileSync(raw).toString('base64');
    // Quick actions are display:none in the current app (swipe-only), so no
    // annotation item for them; guard anyway against zero-size elements.
    box.pts = Object.fromEntries(Object.entries(box.pts).filter(([, p]) => p && p.w > 1));
    const annotated = renderAnnotation(png, box);
    const cpage = await browser.newPage({ viewport: { width: 760, height: 900 }, deviceScaleFactor: 2 });
    await cpage.setContent(annotated, { waitUntil: 'load' });
    await cpage.waitForTimeout(150);
    await cpage.locator('#stage').screenshot({ path: path.join(OUT, 'card-anatomy.png') });
    await cpage.close(); await page.close();
    log(true, 'card-anatomy.png');
  } catch (e) { log(false, 'card-anatomy.png', e.message); }

  // 7 ── detail-view.png (five page dots) ───────────────────────────────────
  try {
    const page = await browser.newPage({ viewport: PHONE, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
    await seed(page);
    const idx = await page.evaluate(() => {
      const d = load();
      const i = d.findIndex(h => /gym session/i.test(h.name));
      return i >= 0 ? i : d.findIndex(h => h.type !== 'task');
    });
    await page.evaluate(i => openDetail(i), idx);
    await page.waitForSelector('#detail-sheet.open', { timeout: 8000 });
    await page.waitForSelector('#detail-sheet .detail-dots button', { timeout: 8000 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(OUT, 'detail-view.png') });
    await page.close();
    log(true, 'detail-view.png');
  } catch (e) { log(false, 'detail-view.png', e.message); }

  // 8 ── map-picker.png (adding a "Gym" place) ──────────────────────────────
  try {
    const page = await browser.newPage({ viewport: PHONE, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
    await seed(page);
    await page.evaluate(() => openLocationPicker({ name: 'Gym', lat: 40.7465, lng: -73.9972, address: 'Chelsea, NYC' }));
    await page.waitForSelector('#location-picker-sheet.open', { timeout: 8000 });
    // wait for map tiles, fall back gracefully if offline
    await page.waitForFunction(() => document.querySelectorAll('.leaflet-tile-loaded').length >= 4, null, { timeout: 6000 }).catch(() => {});
    await page.waitForTimeout(1800);
    await page.screenshot({ path: path.join(OUT, 'map-picker.png') });
    await page.close();
    log(true, 'map-picker.png');
  } catch (e) { log(false, 'map-picker.png', e.message); }

  // 9 ── appearance.png (light/dark × compact/minimal/full) ─────────────────
  try {
    const variants = [
      { label: 'light · full', patch: { themeMode: 'light', compactMode: false, minimalMode: false } },
      { label: 'dark · full', patch: { themeMode: 'dark', compactMode: false, minimalMode: false } },
      { label: 'light · compact', patch: { themeMode: 'light', compactMode: true, minimalMode: false } },
      { label: 'light · minimal', patch: { themeMode: 'light', compactMode: false, minimalMode: true } },
    ];
    const shots = [];
    const page = await browser.newPage({ viewport: PHONE, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await seed(page);
    for (const v of variants) {
      await page.evaluate(patch => { updateSortSetting(patch, { renderNow: false, sync: false }); if (typeof applyAppearanceSettings === 'function') applyAppearanceSettings(); render(); }, v.patch);
      await page.waitForTimeout(900);
      await page.evaluate(() => window.scrollTo(0, 0));
      const file = path.join(TMP, `app-${v.label.replace(/[^a-z]/gi, '')}.png`);
      await page.screenshot({ path: file, clip: { x: 0, y: 0, width: PHONE.width, height: 760 } });
      shots.push({ label: v.label, data: fs.readFileSync(file).toString('base64') });
    }
    await page.close();
    const compose = renderAppearanceStrip(shots);
    const cpage = await browser.newPage({ viewport: { width: 1180, height: 700 }, deviceScaleFactor: 2 });
    await cpage.setContent(compose, { waitUntil: 'load' });
    await cpage.waitForTimeout(150);
    await cpage.locator('#stage').screenshot({ path: path.join(OUT, 'appearance.png') });
    await cpage.close();
    log(true, 'appearance.png');
  } catch (e) { log(false, 'appearance.png', e.message); }

  // Helper: open a collapsible settings section and screenshot just that block.
  async function settingsSectionShot(browser, headId, file) {
    const page = await browser.newPage({ viewport: PHONE, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
    await seed(page);
    await page.evaluate(() => { openSheet('settings-sheet'); if (typeof syncSettingsControls === 'function') syncSettingsControls(); });
    await page.waitForSelector('#settings-sheet.open', { timeout: 8000 });
    await page.evaluate(id => document.getElementById(id).click(), headId);
    await page.waitForTimeout(450);
    const section = page.locator('section.settings-block', { has: page.locator(`#${headId}`) });
    await section.evaluate(el => el.scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(250);
    // Clip to the section ∩ visible sheet area so the footer and the home
    // screen behind the sheet don't bleed into the capture.
    const sec = await section.boundingBox();
    const footer = await page.locator('#settings-sheet .btn-row').first().boundingBox().catch(() => null);
    const top = Math.max(sec.y, 0);
    const bottom = Math.min(sec.y + sec.height, footer ? footer.y : sec.y + sec.height);
    await page.screenshot({ path: path.join(OUT, file), clip: { x: sec.x, y: top, width: sec.width, height: Math.max(240, bottom - top) } });
    await page.close();
    log(true, file);
  }

  // 10 ── about.png (the Tings-logo menu) ───────────────────────────────────
  try {
    const page = await browser.newPage({ viewport: PHONE, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
    await seed(page);
    await page.evaluate(() => openSheet('about-sheet'));
    await page.waitForSelector('#about-sheet.open', { timeout: 8000 });
    await page.waitForTimeout(400);
    const sheet = page.locator('#about-sheet .about-sheet');
    const h = await sheet.evaluate(el => el.scrollHeight);
    await sheet.screenshot({ path: path.join(OUT, 'about.png'), clip: { x: 0, y: 0, width: PHONE.width, height: Math.min(h, 880) } });
    await page.close();
    log(true, 'about.png');
  } catch (e) { log(false, 'about.png', e.message); }

  // 11 ── coach-advanced.png (advanced coach chapter menu) ──────────────────
  try {
    const page = await browser.newPage({ viewport: PHONE, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await seed(page);
    await page.evaluate(() => startTingsCoach('advanced'));
    await page.waitForSelector('.tings-coach-root', { timeout: 12000 });
    await page.waitForTimeout(2000);   // demo list mount + menu render
    await page.screenshot({ path: path.join(OUT, 'coach-advanced.png') });
    await page.close();
    log(true, 'coach-advanced.png');
  } catch (e) { log(false, 'coach-advanced.png', e.message); }

  // 12 ── settings.png (the settings sheet) ─────────────────────────────────
  try {
    const page = await browser.newPage({ viewport: PHONE, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
    await seed(page);
    await page.evaluate(() => openSheet('settings-sheet'));
    await page.waitForSelector('#settings-sheet.open', { timeout: 8000 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, 'settings.png') });
    await page.close();
    log(true, 'settings.png');
  } catch (e) { log(false, 'settings.png', e.message); }

  // 13-15 ── weather / reminders / shared display settings sections ─────────
  try { await settingsSectionShot(browser, 'settings-weather-head', 'weather.png'); }
  catch (e) { log(false, 'weather.png', e.message); }
  try { await settingsSectionShot(browser, 'settings-reminders-head', 'reminders.png'); }
  catch (e) { log(false, 'reminders.png', e.message); }
  try { await settingsSectionShot(browser, 'settings-agenda-head', 'shared-display.png'); }
  catch (e) { log(false, 'shared-display.png', e.message); }

  // 16 ── overview.png (calendar overview) ──────────────────────────────────
  try {
    const page = await browser.newPage({ viewport: PHONE, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await seed(page);
    await page.locator('#open-overview').click();
    await page.waitForSelector('#overview-sheet.open', { timeout: 8000 });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(OUT, 'overview.png') });
    await page.close();
    log(true, 'overview.png');
  } catch (e) { log(false, 'overview.png', e.message); }

  // 17 ── search.png (search open with ranked results) ──────────────────────
  try {
    const page = await browser.newPage({ viewport: PHONE, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
    await seed(page);
    await page.evaluate(() => setSearchOpen(true));
    await page.fill('#habit-search', 'sample');
    await page.waitForTimeout(700);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(OUT, 'search.png'), clip: { x: 0, y: 0, width: PHONE.width, height: 820 } });
    await page.close();
    log(true, 'search.png');
  } catch (e) { log(false, 'search.png', e.message); }

  // 18-19 ── detail schedule + actions pages ────────────────────────────────
  async function detailPageShot(nav, file) {
    const page = await browser.newPage({ viewport: PHONE, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
    await seed(page);
    const idx = await page.evaluate(() => {
      const d = load();
      const i = d.findIndex(h => /timed run/i.test(h.name));
      return i >= 0 ? i : 0;
    });
    await page.evaluate(i => openDetail(i), idx);
    await page.waitForSelector('#detail-sheet.open', { timeout: 8000 });
    await page.evaluate(nav => scrollDetailToNav(nav, 'auto'), nav);
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(OUT, file) });
    await page.close();
    log(true, file);
  }
  try { await detailPageShot('schedule', 'detail-schedule.png'); }
  catch (e) { log(false, 'detail-schedule.png', e.message); }
  try { await detailPageShot('actions', 'detail-actions.png'); }
  catch (e) { log(false, 'detail-actions.png', e.message); }

  await browser.close();
  console.log('\n──── summary ────');
  const failed = results.filter(r => !r.ok);
  for (const r of results) console.log(`${r.ok ? 'OK' : 'FAIL'}  ${r.name}${r.extra ? '  ' + r.extra : ''}`);
  console.log(failed.length ? `${failed.length} failed` : `all ${results.length} captured`);
  process.exit(failed.length ? 1 : 0);
})();

// ── annotation overlay for a single card ──────────────────────────────────
function renderAnnotation(png, box) {
  const W = 560, scale = W / box.w, H = Math.round(box.h * scale);
  const items = [
    ['1', 'Pulse icon', 'tap to log', box.pts.pulse],
    ['2', 'Name + agenda pill', 'title + planned time', box.pts.pill || box.pts.name],
    ['3', 'Status line', '"due today" cue', box.pts.cue],
    ['4', 'Context marks', 'progress, place, rhythm…', box.pts.marks],
  ];
  if (box.pts.weather) items.push(['5', 'Weather chip', 'forecast for this slot', box.pts.weather]);
  items.push([String(items.length + 1), 'Two-week trail', 'dots for this week + last', box.pts.trail]);
  const dots = items.map(([n, , , p]) => {
    if (!p) return '';
    // Anchor at the target's top-right corner so the marker labels the
    // element without covering it.
    const x = Math.min(W - 14, Math.max(14, Math.round((p.x + p.w) * scale)));
    const y = Math.min(H - 14, Math.max(14, Math.round(p.y * scale)));
    return `<span class="dot" style="left:${x}px;top:${y}px">${n}</span>`;
  }).join('');
  const legend = items.map(([n, t, d]) => `<div class="li"><span class="num">${n}</span><div><div class="t">${t}</div><div class="s">${d}</div></div></div>`).join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#f5f4f0;color:#1a1a1a}
    #stage{width:760px;padding:28px;background:#ffffff;border-radius:18px}
    .card-wrap{position:relative;width:${W}px;height:${H}px;margin:0 auto}
    .card-wrap img{width:${W}px;height:${H}px;display:block;border-radius:14px;border:1px solid rgba(0,0,0,.1)}
    .dot{position:absolute;transform:translate(-50%,-50%);width:24px;height:24px;border-radius:50%;background:#0F6E56;color:#fff;font-weight:700;font-size:13px;display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 3px rgba(255,255,255,.92),0 2px 6px rgba(0,0,0,.28)}
    .legend{display:grid;grid-template-columns:1fr 1fr;gap:10px 28px;margin-top:24px;padding:0 24px}
    .li{display:flex;gap:12px;align-items:flex-start}
    .num{flex-shrink:0;width:26px;height:26px;border-radius:50%;background:#0F6E56;color:#fff;font-weight:700;font-size:13px;display:flex;align-items:center;justify-content:center;margin-top:1px}
    .t{font-weight:600;font-size:14px}.s{font-size:12px;color:#6b6a65}
    .cap{font-size:12px;color:#9e9d98;text-align:center;margin-top:14px}
  </style></head><body><div id="stage">
    <div class="card-wrap"><img src="data:image/png;base64,${png}">${dots}</div>
    <div class="legend">${legend}</div>
    <div class="cap">a single habit card, annotated</div>
  </div></body></html>`;
}

// ── two-pane strip (used by planner-week) ──────────────────────────────────
function renderTwoPane(shots) {
  const figs = shots.map(s => `<figure><img src="data:image/png;base64,${s.data}"><figcaption>${s.label}</figcaption></figure>`).join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#1c1c1e}
    #stage{padding:24px 22px}
    .row{display:flex;gap:20px;justify-content:center;align-items:flex-start}
    figure{margin:0;display:flex;flex-direction:column;align-items:center;gap:10px}
    figure img{height:880px;display:block;border-radius:22px;border:1px solid rgba(255,255,255,.12);box-shadow:0 10px 30px rgba(0,0,0,.45)}
    figcaption{color:#aeaeb2;font-size:13px;font-weight:600;letter-spacing:.02em}
  </style></head><body><div id="stage"><div class="row">${figs}</div></div></body></html>`;
}

// ── appearance strip ───────────────────────────────────────────────────────
function renderAppearanceStrip(shots) {
  const figs = shots.map(s => `<figure><img src="data:image/png;base64,${s.data}"><figcaption>${s.label}</figcaption></figure>`).join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#1c1c1e}
    #stage{padding:26px 24px}
    .row{display:flex;gap:18px;justify-content:center;align-items:flex-start}
    figure{margin:0;display:flex;flex-direction:column;align-items:center;gap:10px}
    figure img{width:248px;display:block;border-radius:20px;border:1px solid rgba(255,255,255,.12);box-shadow:0 10px 30px rgba(0,0,0,.45)}
    figcaption{color:#aeaeb2;font-size:12.5px;font-weight:600;letter-spacing:.01em}
  </style></head><body><div id="stage"><div class="row">${figs}</div></div></body></html>`;
}
