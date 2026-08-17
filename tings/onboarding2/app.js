/* Tings tour — a guided coach that overlays the live app.
 *
 * Design (reliability first):
 *  - The app is the real, live app in an <iframe>. We never touch its DOM
 *    (cross-origin), so the overlay cannot break it and it never drifts.
 *  - The coach points at *stable regions* of the screen (top bar, bottom nav,
 *    center) rather than reading the app's DOM, so it keeps working even if the
 *    app's internals change.
 *  - Self-paced: the user drives with next/back. No auto-detection to fail on.
 */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };

  var stage = $("stage");
  var frame = $("app-frame");
  var status = $("frame-status");
  var statusText = $("frame-status-text");
  var statusLink = $("frame-open");

  var spotlight = $("spotlight");
  var spotTop = $("spot-top");
  var spotBottom = $("spot-bottom");
  var spotLeft = $("spot-left");
  var spotRight = $("spot-right");
  var spotRing = $("spot-ring");
  var arrow = $("coach-arrow");

  var coach = $("coach");
  var stepNum = $("step-num");
  var stepTotal = $("step-total");
  var coachTitle = $("coach-title");
  var coachBody = $("coach-body");
  var progressBar = $("coach-progress-bar");
  var prevBtn = $("coach-prev");
  var nextBtn = $("coach-next");
  var restartBtn = $("coach-restart");
  var skipBtn = $("coach-skip");
  var tourRestart = $("tour-restart");

  /* ---- steps -------------------------------------------------------------
   * target: region of the screen to spotlight.
   *   'none'        -> no spotlight (welcome / finish)
   *   'center'      -> the home feed / cards
   *   'bottom-center'-> the + (add) button
   *   'bottom-left'  -> the calendar button
   *   'bottom-right' -> the search button
   *   'top-left'     -> the Tings wordmark (help + settings)
   * card is derived: bottom targets lift the card to the top so it never
   * covers the bottom nav it is pointing at.
   */
  var STEPS = [
    {
      target: "none",
      title: "Welcome to Tings",
      body: "This is the real app, live — your habits and day planner. I'll point you to the important parts. Tap <b>next</b> to begin."
    },
    {
      target: "center",
      title: "Home is today's plan",
      body: "This is <b>home</b>: today's slice of your week plan. Each card is something on your agenda — when you're on it, it shows up here."
    },
    {
      target: "center",
      title: "Try some samples",
      body: "Empty for now? Tap the message in the middle to load <b>sample habits</b> and see Tings in action. Keep what you like, remove the rest."
    },
    {
      target: "bottom-center",
      title: "Add with +",
      body: "Tap <b>+</b> (bottom center) to add a <b>habit, task, limit, or stop</b>. Name it, set how often, and Tings plans it for you."
    },
    {
      target: "bottom-left",
      title: "See the week",
      body: "Tap the <b>calendar</b> to see the whole week: open hours, lightest days, and where things are tight."
    },
    {
      target: "bottom-right",
      title: "Find anything",
      body: "Tap <b>search</b> to find any habit fast, or narrow the list by topic and place."
    },
    {
      target: "center",
      title: "Log a habit",
      body: "To log a habit, tap its <b>icon</b> (or double-tap the card). Toasts offer quick next steps without another screen."
    },
    {
      target: "center",
      title: "Swipe to act",
      body: "<b>Swipe</b> a card: one way to pin, keep, or start a timer; the other way to snooze or remove it."
    },
    {
      target: "top-left",
      title: "Help & settings",
      body: "Tap the <b>Tings logo</b> (top-left) for help, samples, and <b>settings</b> — busy times, open hours, and places that shape your plan."
    },
    {
      target: "none",
      title: "You're ready",
      body: "That's the tour. Tap <b>+</b> to add your first habit, or tap <b>samples</b> to explore. Enjoy Tings."
    }
  ];

  var idx = 0;
  var finished = false;

  /* ---- target geometry ---------------------------------------------------
   * Each region is a rect as a fraction of the stage. The bottom band matches
   * the app's bottom nav so the +/calendar/search land on the real buttons.
   */
  function targetRect(region, W, H) {
    var navH = 84; // bottom nav band (px), generous so the ring sits on the buttons
    switch (region) {
      case "center":
        return { x: W * 0.16, y: H * 0.34, w: W * 0.68, h: H * 0.30 };
      case "bottom-center":
        return { x: W * 0.34, y: H - navH, w: W * 0.32, h: navH - 10 };
      case "bottom-left":
        return { x: W * 0.03, y: H - navH, w: W * 0.30, h: navH - 10 };
      case "bottom-right":
        return { x: W * 0.67, y: H - navH, w: W * 0.30, h: navH - 10 };
      case "top-left":
        return { x: 10, y: 10, w: Math.min(W * 0.46, 220), h: 52 };
      default:
        return null;
    }
  }

  function setStrip(el, left, top, width, height) {
    el.style.left = left + "px";
    el.style.top = top + "px";
    el.style.width = width + "px";
    el.style.height = height + "px";
  }

  function positionSpotlight(region) {
    var W = stage.clientWidth;
    var H = stage.clientHeight;
    var r = targetRect(region, W, H);

    if (!r) {
      spotlight.classList.add("off");
      arrow.classList.add("hidden");
      return;
    }
    spotlight.classList.remove("off");

    // 4 dim strips leave a hole around the target.
    setStrip(spotTop, 0, 0, W, r.y);
    setStrip(spotBottom, 0, r.y + r.h, W, Math.max(0, H - (r.y + r.h)));
    setStrip(spotLeft, 0, r.y, r.x, r.h);
    setStrip(spotRight, r.x + r.w, r.y, Math.max(0, W - (r.x + r.w)), r.h);

    // glowing ring on the target
    setStrip(spotRing, r.x, r.y, r.w, r.h);
  }

  function positionArrow(region, cardAtTop) {
    var W = stage.clientWidth;
    var H = stage.clientHeight;
    var r = targetRect(region, W, H);
    if (!r) { arrow.classList.add("hidden"); return; }
    arrow.classList.remove("hidden");

    var cx = r.x + r.w / 2;
    if (cardAtTop) {
      // card is at the top, target below it: arrow points down, just above the ring
      arrow.className = "coach-arrow down";
      arrow.style.left = (cx - 11) + "px";
      arrow.style.top = (r.y - 15) + "px";
    } else {
      // card is at the bottom, target above it: arrow points up, just below the ring
      arrow.className = "coach-arrow up";
      arrow.style.left = (cx - 11) + "px";
      arrow.style.top = (r.y + r.h + 2) + "px";
    }
  }

  /* ---- render a step ----------------------------------------------------- */
  function render() {
    var step = STEPS[idx];
    var isLast = idx === STEPS.length - 1;
    var cardAtTop = step.target === "bottom-center" ||
                    step.target === "bottom-left" ||
                    step.target === "bottom-right";

    stepNum.textContent = String(idx + 1);
    stepTotal.textContent = String(STEPS.length);
    coachTitle.textContent = step.title;
    coachBody.innerHTML = step.body;
    progressBar.style.width = ((idx + 1) / STEPS.length * 100) + "%";

    prevBtn.disabled = idx === 0;
    nextBtn.innerHTML = isLast
      ? '<i class="ti ti-check" aria-hidden="true"></i> finish'
      : 'next <i class="ti ti-chevron-right" aria-hidden="true"></i>';

    // card position
    coach.classList.toggle("at-top", cardAtTop);
    coach.classList.toggle("at-bottom", !cardAtTop);

    positionSpotlight(step.target);
    positionArrow(step.target, cardAtTop);
  }

  function go(n) {
    idx = Math.max(0, Math.min(STEPS.length - 1, n));
    render();
  }

  function next() {
    if (idx === STEPS.length - 1) { finish(); return; }
    go(idx + 1);
  }
  function prev() { if (idx > 0) go(idx - 1); }

  function finish() {
    finished = true;
    coach.style.opacity = "0";
    coach.style.pointerEvents = "none";
    coach.style.transform = "translateY(12px)";
    spotlight.classList.add("off");
    arrow.classList.add("hidden");
    tourRestart.hidden = false;
  }

  function restart() {
    finished = false;
    coach.style.opacity = "";
    coach.style.pointerEvents = "";
    coach.style.transform = "";
    tourRestart.hidden = true;
    idx = 0;
    render();
  }

  /* ---- wiring ------------------------------------------------------------ */
  nextBtn.addEventListener("click", next);
  prevBtn.addEventListener("click", prev);
  restartBtn.addEventListener("click", restart);
  tourRestart.addEventListener("click", restart);
  skipBtn.addEventListener("click", finish);

  document.addEventListener("keydown", function (e) {
    if (finished) return;
    if (e.key === "ArrowRight" || e.key === "Enter") { e.preventDefault(); next(); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); prev(); }
    else if (e.key === "Escape") { finish(); }
  });

  // Keep the spotlight aligned with the stage on resize / orientation change.
  var resizeTimer = null;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      if (finished) return;
      var step = STEPS[idx];
      var cardAtTop = step.target === "bottom-center" ||
                      step.target === "bottom-left" ||
                      step.target === "bottom-right";
      positionSpotlight(step.target);
      positionArrow(step.target, cardAtTop);
    }, 120);
  });

  /* ---- iframe load / fallback ------------------------------------------- */
  var loaded = false;
  function hideStatus() {
    if (loaded) return;
    loaded = true;
    status.classList.add("hidden");
  }
  frame.addEventListener("load", function () {
    // give the heavy app a beat to paint, then reveal it
    setTimeout(hideStatus, 400);
  });
  frame.addEventListener("error", showFallback);
  // If the app is slow or blocked, offer a manual link but keep trying.
  setTimeout(function () {
    if (!loaded) {
      statusText.textContent = "still loading Tings…";
      statusLink.hidden = false;
    }
  }, 12000);

  function showFallback() {
    statusText.textContent = "Couldn't load the live app. Open it in a new tab to continue the tour.";
    statusLink.hidden = false;
  }

  /* ---- start ------------------------------------------------------------- */
  render();
})();
