/**
 * Corner ASCII cat — ping-pong with a random cat swap at the match frame.
 * Hover: VINC1AM-style flush — cells push from the cursor (no accent flash).
 * Always: sparse standalone grey crumbs around the silhouette (same vibe as VINC1AM).
 */
(function () {
  "use strict";

  /* Fold toggle is independent of canvas boot — bind first */
  var stage = document.getElementById("corner-cat-stage");
  var fold = document.getElementById("cat-fold");
  var catHidden = false;
  var pauseCat = null; /* set after player boots */
  var resumeCat = null;

  function setCatHidden(hidden) {
    catHidden = !!hidden;
    if (stage) {
      stage.classList.toggle("is-hidden", catHidden);
      if (catHidden) stage.setAttribute("hidden", "");
      else stage.removeAttribute("hidden");
    }
    if (fold) {
      fold.classList.toggle("is-open", catHidden);
      fold.setAttribute("aria-pressed", catHidden ? "true" : "false");
      fold.setAttribute("aria-label", catHidden ? "Show cat" : "Hide cat");
      fold.title = catHidden ? "Show cat" : "Hide cat";
    }
    if (catHidden && typeof pauseCat === "function") pauseCat();
    if (!catHidden && typeof resumeCat === "function") resumeCat();
  }

  if (fold) {
    fold.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      setCatHidden(!catHidden);
    });
  }

  var root = document.querySelector(".corner-cat");
  if (!root) return;

  var FPS = 10;
  /* Best match after flipping cat2: ~4.3s (src frame 104 @24fps → play frame 43) */
  var SWITCH_SEC = 4.3;
  var SWITCH_FRAME = Math.round(SWITCH_SEC * FPS); /* 43 → frame_044.webp */
  var FRAME_COUNT = 200;
  var BASES = [
    "assets/cat/play/1/frame_",
    "assets/cat/play/2/frame_"
  ];

  /* Match VINC1AM mosaic cell */
  var CELL_W = 9;
  var CELL_H = 13;
  var ALPHA_CUT = 28;
  var RADIUS = 34;
  var PUSH = 12;
  var CHARS = "#*%=+FR3T.";
  var FAINT = "#8a8a82";
  var FAINT_ALPHA = 0.22;
  var CRUMB_RATE = 0.018;
  var CRUMB_IDLE_MS = 240;
  var CRUMB_TOUCHES = 8;

  var canvas = document.createElement("canvas");
  canvas.className = "corner-cat__media";
  /* Native play size: 96 cols × ~9px (VINC1AM cell) */
  canvas.width = 864;
  canvas.height = 486;
  canvas.setAttribute("aria-hidden", "true");
  root.innerHTML = "";
  root.appendChild(canvas);
  var ctx = canvas.getContext("2d", { alpha: true });

  var off = document.createElement("canvas");
  off.width = canvas.width;
  off.height = canvas.height;
  var offCtx = off.getContext("2d", { willReadFrequently: true, alpha: true });

  var cats = [[], []];
  var ready = [false, false];
  var frame = 0;
  var dir = 1;
  var cat = Math.random() < 0.5 ? 0 : 1;
  var raf = 0;
  var lastTs = 0;
  var acc = 0;
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var hovering = false;
  var lx = -9999;
  var ly = -9999;
  var scaleX = 1;
  var scaleY = 1;
  var cellCols = 0;
  var cellRows = 0;
  var cellOn = null; /* Uint8Array */
  var sampleKey = "";

  var crumbX = null;
  var crumbY = null;
  var crumbGlyph = null;
  var crumbCount = 0;
  var crumbsBuilt = false;
  var crumbIdleId = 0;

  function frameUrl(catIdx, i) {
    var n = String(i + 1).padStart(3, "0");
    return BASES[catIdx] + n + ".webp";
  }

  function randGlyph() {
    return (Math.random() * CHARS.length) | 0;
  }

  function loadCat(catIdx) {
    return new Promise(function (resolve) {
      var loaded = 0;
      var list = new Array(FRAME_COUNT);
      var done = false;

      function finish() {
        if (done) return;
        done = true;
        cats[catIdx] = list;
        ready[catIdx] = list.filter(Boolean).length > FRAME_COUNT * 0.9;
        resolve(ready[catIdx]);
      }

      for (var i = 0; i < FRAME_COUNT; i++) {
        (function (idx) {
          var img = new Image();
          img.decoding = "async";
          img.onload = function () {
            list[idx] = img;
            loaded++;
            if (loaded >= FRAME_COUNT) finish();
          };
          img.onerror = function () {
            loaded++;
            if (loaded >= FRAME_COUNT) finish();
          };
          img.src = frameUrl(catIdx, idx);
        })(i);
      }
      setTimeout(finish, 20000);
    });
  }

  function syncPointerScale() {
    var rect = canvas.getBoundingClientRect();
    scaleX = rect.width ? canvas.width / rect.width : 1;
    scaleY = rect.height ? canvas.height / rect.height : 1;
  }

  function sampleCells(img) {
    var key = cat + ":" + frame;
    if (key === sampleKey && cellOn) return;
    sampleKey = key;

    offCtx.clearRect(0, 0, off.width, off.height);
    offCtx.drawImage(img, 0, 0, off.width, off.height);
    var data = offCtx.getImageData(0, 0, off.width, off.height).data;

    cellCols = Math.ceil(canvas.width / CELL_W);
    cellRows = Math.ceil(canvas.height / CELL_H);
    cellOn = new Uint8Array(cellCols * cellRows);

    var r;
    var c;
    for (r = 0; r < cellRows; r++) {
      for (c = 0; c < cellCols; c++) {
        var px = Math.min(canvas.width - 1, c * CELL_W + (CELL_W >> 1));
        var py = Math.min(canvas.height - 1, r * CELL_H + (CELL_H >> 1));
        var a = data[(py * canvas.width + px) * 4 + 3];
        cellOn[r * cellCols + c] = a >= ALPHA_CUT ? 1 : 0;
      }
    }
  }

  /** Near-cat empty cells only — same sparse crumbs as the wordmark. */
  function nearCat(r, c) {
    var rr;
    var cc;
    for (rr = r - 2; rr <= r + 2; rr++) {
      for (cc = c - 2; cc <= c + 2; cc++) {
        if (rr < 0 || cc < 0 || rr >= cellRows || cc >= cellCols) continue;
        if (rr === r && cc === c) continue;
        if (cellOn[rr * cellCols + cc]) return true;
      }
    }
    return false;
  }

  function buildCrumbs(img) {
    sampleCells(img);
    var xs = [];
    var ys = [];
    var ids = [];
    var r;
    var c;
    for (r = 0; r < cellRows; r++) {
      for (c = 0; c < cellCols; c++) {
        if (cellOn[r * cellCols + c]) continue;
        if (!nearCat(r, c)) continue;
        if (Math.random() >= CRUMB_RATE) continue;
        xs.push(c * CELL_W);
        ys.push(r * CELL_H);
        ids.push(randGlyph());
      }
    }
    crumbCount = xs.length;
    crumbX = new Float32Array(xs);
    crumbY = new Float32Array(ys);
    crumbGlyph = new Uint8Array(ids);
    crumbsBuilt = true;
  }

  function paintCrumbs(push) {
    if (!crumbCount) return;
    ctx.font =
      "700 " + CELL_H + "px JetBrains Mono, ui-monospace, Menlo, monospace";
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.fillStyle = FAINT;
    ctx.globalAlpha = FAINT_ALPHA;

    var r2 = RADIUS * RADIUS;
    var i;
    for (i = 0; i < crumbCount; i++) {
      var hx = crumbX[i];
      var hy = crumbY[i];

      /* skip if this crumb cell is currently covered by the cat */
      var cc = (hx / CELL_W) | 0;
      var rr = (hy / CELL_H) | 0;
      if (cellOn && cellOn[rr * cellCols + cc]) continue;

      var dxDraw = hx;
      var dyDraw = hy;

      if (push && hovering && !reduceMotion) {
        var dxC = hx + CELL_W * 0.5 - lx;
        var dyC = hy + CELL_H * 0.5 - ly;
        var dx = dxC / scaleX;
        var dy = dyC / scaleY;
        var d2 = dx * dx + dy * dy;
        if (d2 < r2 && d2 > 0.0001) {
          var inv = 1 / Math.sqrt(d2);
          var fall = 1 - d2 / r2;
          fall *= fall;
          var f = fall * PUSH;
          dxDraw = hx + dx * inv * f * scaleX;
          dyDraw = hy + dy * inv * f * scaleY;
        }
      }

      ctx.fillText(CHARS.charAt(crumbGlyph[i]), dxDraw, dyDraw);
    }
    ctx.globalAlpha = 1;
  }

  function tickCrumbsIdle() {
    crumbIdleId = 0;
    if (reduceMotion || !crumbCount || hovering || document.hidden) {
      crumbIdleId = window.setTimeout(tickCrumbsIdle, CRUMB_IDLE_MS);
      return;
    }
    var touches = CRUMB_TOUCHES;
    if (touches > crumbCount) touches = crumbCount;
    var t;
    for (t = 0; t < touches; t++) {
      var i = (Math.random() * crumbCount) | 0;
      crumbGlyph[i] = randGlyph();
    }
    draw();
    crumbIdleId = window.setTimeout(tickCrumbsIdle, CRUMB_IDLE_MS);
  }

  function drawPlain(img) {
    sampleCells(img);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    paintCrumbs(false);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  }

  function drawFlush(img) {
    sampleCells(img);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    paintCrumbs(true);

    var r2 = RADIUS * RADIUS;
    var i;
    var r;
    var c;

    ctx.font =
      "700 " + CELL_H + "px JetBrains Mono, ui-monospace, Menlo, monospace";
    ctx.textBaseline = "top";
    ctx.textAlign = "left";

    for (r = 0; r < cellRows; r++) {
      for (c = 0; c < cellCols; c++) {
        i = r * cellCols + c;
        if (!cellOn[i]) continue;

        var hx = c * CELL_W;
        var hy = r * CELL_H;
        var dxC = hx + CELL_W * 0.5 - lx;
        var dyC = hy + CELL_H * 0.5 - ly;
        var dx = dxC / scaleX;
        var dy = dyC / scaleY;
        var d2 = dx * dx + dy * dy;

        var dxDraw = hx;
        var dyDraw = hy;

        if (d2 < r2 && d2 > 0.0001) {
          var inv = 1 / Math.sqrt(d2);
          var fall = 1 - d2 / r2;
          fall *= fall;
          var f = fall * PUSH;
          dxDraw = hx + dx * inv * f * scaleX;
          dyDraw = hy + dy * inv * f * scaleY;
        }

        var sw = Math.min(CELL_W, canvas.width - hx);
        var sh = Math.min(CELL_H, canvas.height - hy);
        if (sw <= 0 || sh <= 0) continue;

        /* Push tiles only — no accent/blue flash on glyphs */
        ctx.drawImage(img, hx, hy, sw, sh, dxDraw, dyDraw, sw, sh);
      }
    }
  }

  function draw() {
    var img = cats[cat] && cats[cat][frame];
    if (!img) return;
    if (!crumbsBuilt) buildCrumbs(img);
    if (hovering && !reduceMotion) drawFlush(img);
    else drawPlain(img);
  }

  /* Swap only when the other cat is ready — never blank mid-load. */
  function pickCat() {
    var a = ready[0] && cats[0][frame];
    var b = ready[1] && cats[1][frame];
    if (a && b) cat = Math.random() < 0.5 ? 0 : 1;
    else if (a) cat = 0;
    else if (b) cat = 1;
    /* else keep current cat */
  }

  function step() {
    var next = frame + dir;

    if (next > FRAME_COUNT - 1) {
      dir = -1;
      next = FRAME_COUNT - 2;
    } else if (next < 0) {
      dir = 1;
      next = 1;
    }

    frame = next;

    if (frame === SWITCH_FRAME) {
      pickCat();
    }

    draw();
  }

  function loop(ts) {
    raf = requestAnimationFrame(loop);
    if (!lastTs) lastTs = ts;
    acc += ts - lastTs;
    lastTs = ts;
    var interval = 1000 / FPS;
    var advanced = false;
    while (acc >= interval) {
      acc -= interval;
      step();
      advanced = true;
    }
    if (hovering && !advanced && !reduceMotion) draw();
  }

  function onPointerMove(e) {
    syncPointerScale();
    var rect = canvas.getBoundingClientRect();
    lx = (e.clientX - rect.left) * scaleX;
    ly = (e.clientY - rect.top) * scaleY;
    hovering = true;
    root.classList.add("is-flushing");
  }

  function onPointerLeave() {
    hovering = false;
    lx = -9999;
    ly = -9999;
    root.classList.remove("is-flushing");
    draw();
  }

  function start() {
    syncPointerScale();
    draw();
    if (!reduceMotion) {
      canvas.addEventListener("pointermove", onPointerMove, { passive: true });
      canvas.addEventListener("pointerenter", onPointerMove, { passive: true });
      canvas.addEventListener("pointerleave", onPointerLeave, { passive: true });
      window.addEventListener(
        "resize",
        function () {
          syncPointerScale();
        },
        { passive: true }
      );
      if (!crumbIdleId) {
        crumbIdleId = window.setTimeout(tickCrumbsIdle, CRUMB_IDLE_MS);
      }
      lastTs = 0;
      acc = 0;
      raf = requestAnimationFrame(loop);
    }
  }

  pauseCat = function () {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  };

  resumeCat = function () {
    if (reduceMotion || catHidden) return;
    if (!ready[0] && !ready[1]) return;
    lastTs = 0;
    acc = 0;
    if (!raf) raf = requestAnimationFrame(loop);
  };

  /*
   * Staged load: start the randomly chosen cat ASAP, then preload the
   * other in the background. Switch (~4.3s) only uses a cat that's ready.
   */
  (function boot() {
    var primary = cat;
    var secondary = cat ^ 1;

    loadCat(primary).then(function (ok) {
      if (!ok) {
        return loadCat(secondary).then(function (ok2) {
          if (!ok2) return;
          cat = secondary;
          if (!catHidden) start();
        });
      }
      if (!catHidden) start();
      loadCat(secondary);
    });
  })();
})();
