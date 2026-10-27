/**
 * Fast ASCII mosaic wordmark (GitHub Pages–friendly).
 *
 * Visual: spaced word mask, sparse faint crumbs, idle shimmer, circular hover push.
 * Perf: glyph atlas + drawImage (no per-frame fillText), RAF only on hover/morph,
 * idle flicker patches a few cells instead of full clears.
 */
(function () {
  "use strict";

  var mount = document.getElementById("ascii-mosaic");
  if (!mount) return;

  var TEXT = mount.getAttribute("data-text") || "VINC1AM";
  var CHARS = mount.getAttribute("data-chars") || "#*%=+FR3T.";
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var CELL_W = 9;
  var CELL_H = 13;
  var NOISE_RATE = 0.022;
  var ALPHA_CUT = 40;
  var RADIUS = 42;
  var PUSH = 14;
  var IDLE_MS = 240;
  var IDLE_TOUCHES = 8;
  /* Fixed render size (old desktop density); CSS scales on resize — no rebuild */
  var FIXED_FONT = 320;

  var mask = document.createElement("canvas");
  var mctx = mask.getContext("2d", { willReadFrequently: true });

  var view = document.createElement("canvas");
  view.className = "ascii-mosaic__canvas";
  view.setAttribute("aria-hidden", "true");
  mount.appendChild(view);
  var vctx = view.getContext("2d", { alpha: true });

  // Atlas: row0 = ink glyphs, row1 = faint glyphs
  var atlas = document.createElement("canvas");
  var actx = atlas.getContext("2d");
  var atlasReady = false;

  var cols = 0;
  var rows = 0;
  var count = 0;
  var homeX = null;
  var homeY = null;
  var drawX = null;
  var drawY = null;
  var glyphId = null; // index into CHARS
  var isLetter = null;

  var mx = -9999;
  var my = -9999;
  var lx = -9999;
  var ly = -9999;
  var scaleX = 1;
  var scaleY = 1;
  var hasPointer = false;
  var pointerForce = true;
  var rafId = 0;
  var idleId = 0;
  var ink = "#222220";
  var faint = "#8a8a82";
  var flash = "#6aafd4";
  var mode = "word";
  var morphing = false;
  var morphT = 0;
  var morphFromX = null;
  var morphFromY = null;
  var letterAlpha = 0.92;
  var noiseAlpha = 0.22;
  var flashAlpha = 0.95;
  var JUMP_EPS2 = 0.25; /* px² — displaced glyphs use accent color */

  /* Glyph dissolve: characters reduce to none / rebuild (no layout slide) */
  var glyphAlive = null;
  var dissolving = false;
  var dissolveDir = 0; /* -1 out, +1 in */
  var dissolveQueue = null;
  var dissolveIdx = 0;
  var dissolvePerFrame = 12;
  var dissolveDone = null;

  function randGlyphId() {
    return (Math.random() * CHARS.length) | 0;
  }

  function refreshColors() {
    var styles = getComputedStyle(document.documentElement);
    ink = styles.getPropertyValue("--ascii").trim() || "#222220";
    faint = styles.getPropertyValue("--ink-faint").trim() || "#8a8a82";
    flash = styles.getPropertyValue("--accent").trim() || "#6aafd4";
    buildAtlas();
  }

  function buildAtlas() {
    /* row0 ink · row1 crumbs · row2 flash accent */
    atlas.width = CHARS.length * CELL_W;
    atlas.height = CELL_H * 3;
    actx.clearRect(0, 0, atlas.width, atlas.height);
    actx.font = "700 " + CELL_H + "px JetBrains Mono, ui-monospace, Menlo, monospace";
    actx.textBaseline = "top";
    actx.textAlign = "left";

    var i;
    actx.fillStyle = ink;
    actx.globalAlpha = letterAlpha;
    for (i = 0; i < CHARS.length; i++) {
      actx.fillText(CHARS.charAt(i), i * CELL_W, 0);
    }

    actx.fillStyle = faint;
    actx.globalAlpha = mode === "table" ? 0.4 : noiseAlpha;
    for (i = 0; i < CHARS.length; i++) {
      actx.fillText(CHARS.charAt(i), i * CELL_W, CELL_H);
    }

    actx.fillStyle = flash;
    actx.globalAlpha = flashAlpha;
    for (i = 0; i < CHARS.length; i++) {
      actx.fillText(CHARS.charAt(i), i * CELL_W, CELL_H * 2);
    }
    actx.globalAlpha = 1;
    atlasReady = true;
  }

  function sizeCanvas(pixelW, pixelH) {
    cols = Math.max(8, (pixelW / CELL_W) | 0);
    rows = Math.max(6, (pixelH / CELL_H) | 0);
    mask.width = cols * CELL_W;
    mask.height = rows * CELL_H;
    view.width = mask.width;
    view.height = mask.height;
    /* Let CSS scale display size (max-width) — don’t lock px height or shrink looks laggy */
    view.style.width = "";
    view.style.height = "";
    vctx.setTransform(1, 0, 0, 1, 0, 0);
    buildAtlas();
  }

  function measureSpacedText(fontSize, tracking) {
    mctx.font = "700 " + fontSize + "px Space Grotesk, system-ui, sans-serif";
    var width = 0;
    for (var i = 0; i < TEXT.length; i++) {
      width += mctx.measureText(TEXT.charAt(i)).width;
      if (i < TEXT.length - 1) width += tracking;
    }
    return width;
  }

  function drawWordMask() {
    var fontSize = FIXED_FONT;
    var tracking = fontSize * 0.1;
    var textW = measureSpacedText(fontSize, tracking);
    var padY = CELL_H * 6;
    sizeCanvas((textW + CELL_W * 6) | 0, (fontSize * 1.15 + padY * 2) | 0);

    mctx.clearRect(0, 0, mask.width, mask.height);
    mctx.fillStyle = "#fff";
    mctx.font = "700 " + fontSize + "px Space Grotesk, system-ui, sans-serif";
    mctx.textAlign = "left";
    mctx.textBaseline = "middle";
    var x = (mask.width - textW) / 2;
    var y = padY + fontSize * 0.48;
    for (var i = 0; i < TEXT.length; i++) {
      var ch = TEXT.charAt(i);
      mctx.fillText(ch, x, y);
      x += mctx.measureText(ch).width + tracking;
    }
  }

  function drawTableMask(targetW, targetH) {
    var w = Math.max(280, targetW || 640);
    var h = Math.max(180, targetH || 320);
    sizeCanvas(w, h);

    var pad = Math.max(10, (Math.min(mask.width, mask.height) * 0.04) | 0);
    var titleH = Math.max(22, (mask.height * 0.12) | 0);
    var bodyTop = pad + titleH;
    var innerW = mask.width - pad * 2;
    var innerH = mask.height - pad * 2 - titleH;
    var rowCount = 6;
    var rowH = innerH / rowCount;

    mctx.clearRect(0, 0, mask.width, mask.height);
    mctx.fillStyle = "#fff";
    mctx.fillRect(pad, pad, innerW, 3);
    mctx.fillRect(pad, mask.height - pad - 3, innerW, 3);
    mctx.fillRect(pad, pad, 3, mask.height - pad * 2);
    mctx.fillRect(mask.width - pad - 3, pad, 3, mask.height - pad * 2);

    mctx.globalAlpha = 0.85;
    mctx.fillRect(pad, pad, innerW, titleH);
    mctx.globalAlpha = 1;

    for (var i = 0; i < rowCount; i++) {
      var y = bodyTop + i * rowH;
      mctx.globalAlpha = 0.55;
      mctx.fillRect(pad + 8, y + rowH - 2, innerW - 16, 2);
      mctx.globalAlpha = 0.35;
      mctx.fillRect(pad + 10, y + 6, Math.min(48, innerW * 0.12), Math.max(4, rowH * 0.35));
      mctx.globalAlpha = 0.28;
      mctx.fillRect(pad + 70, y + 6, Math.min(innerW * 0.42, 220), Math.max(4, rowH * 0.28));
    }
    mctx.globalAlpha = 1;
  }

  function sampleMask() {
    var data = mctx.getImageData(0, 0, mask.width, mask.height).data;
    var letterGrid = new Uint8Array(rows * cols);
    var r;
    var c;
    var px;
    var py;
    var a;

    for (r = 0; r < rows; r++) {
      for (c = 0; c < cols; c++) {
        px = c * CELL_W + ((CELL_W / 2) | 0);
        py = r * CELL_H + ((CELL_H / 2) | 0);
        a = data[(py * mask.width + px) * 4 + 3];
        if (a < ALPHA_CUT) continue;
        letterGrid[r * cols + c] = 1;
      }
    }

    var xs = [];
    var ys = [];
    var letters = [];
    var ids = [];

    for (r = 0; r < rows; r++) {
      for (c = 0; c < cols; c++) {
        var inside = letterGrid[r * cols + c] === 1;
        if (!inside) {
          if (mode !== "word" || Math.random() >= NOISE_RATE) continue;
          /* 1-cell gap above letter tops — crumbs elsewhere (incl. above) are fine */
          if (r + 1 < rows && letterGrid[(r + 1) * cols + c]) continue;
        }
        xs.push(c * CELL_W);
        ys.push(r * CELL_H);
        letters.push(inside ? 1 : 0);
        ids.push(randGlyphId());
      }
    }

    count = xs.length;
    homeX = new Float32Array(xs);
    homeY = new Float32Array(ys);
    drawX = new Float32Array(xs);
    drawY = new Float32Array(ys);
    isLetter = new Uint8Array(letters);
    glyphId = new Uint8Array(ids);
    glyphAlive = new Uint8Array(count);
    for (var ai = 0; ai < count; ai++) glyphAlive[ai] = 1;
  }

  function rebuildWord() {
    mode = "word";
    noiseAlpha = 0.22;
    drawWordMask();
    sampleMask();
  }

  function rebuildTable(targetW, targetH) {
    mode = "table";
    noiseAlpha = 0.4;
    drawTableMask(targetW, targetH);
    sampleMask();
  }

  function syncPointerScale() {
    var rect = view.getBoundingClientRect();
    scaleX = rect.width ? mask.width / rect.width : 1;
    scaleY = rect.height ? mask.height / rect.height : 1;
    lx = (mx - rect.left) * scaleX;
    ly = (my - rect.top) * scaleY;
  }

  function blitGlyph(i, x, y) {
    var id = glyphId[i];
    var row;
    if (!isLetter[i]) {
      row = CELL_H;
    } else {
      /* Accent only while a letter is jumping away from home (hover push) */
      var dx = drawX[i] - homeX[i];
      var dy = drawY[i] - homeY[i];
      row = dx * dx + dy * dy > JUMP_EPS2 ? CELL_H * 2 : 0;
    }
    vctx.drawImage(atlas, id * CELL_W, row, CELL_W, CELL_H, x | 0, y | 0, CELL_W, CELL_H);
  }

  function paintFull() {
    if (!atlasReady) buildAtlas();
    vctx.clearRect(0, 0, mask.width, mask.height);
    for (var i = 0; i < count; i++) {
      if (glyphAlive && !glyphAlive[i]) continue;
      blitGlyph(i, drawX[i], drawY[i]);
    }
  }

  function patchIdleFlicker() {
    if (!count || !atlasReady || dissolving) return;
    var touches = IDLE_TOUCHES;
    if (touches > count) touches = count;
    for (var t = 0; t < touches; t++) {
      var i = (Math.random() * count) | 0;
      if (glyphAlive && !glyphAlive[i]) continue;
      var x = homeX[i] | 0;
      var y = homeY[i] | 0;
      vctx.clearRect(x, y, CELL_W, CELL_H);
      glyphId[i] = randGlyphId();
      blitGlyph(i, x, y);
    }
  }

  function shuffleIndices(n) {
    var order = new Array(n);
    var i;
    for (i = 0; i < n; i++) order[i] = i;
    for (i = n - 1; i > 0; i--) {
      var j = (Math.random() * (i + 1)) | 0;
      var tmp = order[i];
      order[i] = order[j];
      order[j] = tmp;
    }
    return order;
  }

  function stopDissolve() {
    dissolving = false;
    dissolveDone = null;
    dissolveQueue = null;
  }

  function beginDissolve(dir, opts) {
    opts = opts || {};
    var onDone = opts.onDone || null;
    var duration = opts.duration || 240;

    if (!count) {
      if (onDone) onDone();
      return;
    }

    stopIdleFlicker();
    morphing = false;
    morphFromX = null;
    morphFromY = null;
    mount.classList.remove("is-spent");

    if (reduceMotion) {
      var i;
      if (!glyphAlive || glyphAlive.length !== count) {
        glyphAlive = new Uint8Array(count);
      }
      for (i = 0; i < count; i++) glyphAlive[i] = dir > 0 ? 1 : 0;
      paintFull();
      if (dir < 0) mount.classList.add("is-spent");
      if (onDone) onDone();
      if (dir > 0) startIdleFlicker();
      return;
    }

    if (!glyphAlive || glyphAlive.length !== count) {
      glyphAlive = new Uint8Array(count);
    }
    for (var a = 0; a < count; a++) {
      glyphAlive[a] = dir > 0 ? 0 : 1;
    }
    dissolveQueue = shuffleIndices(count);
    dissolveIdx = 0;
    dissolveDir = dir;
    dissolving = true;
    dissolveDone = onDone;
    dissolvePerFrame = Math.max(
      10,
      Math.ceil((count * 1.5) / Math.max(1, duration / 16.7))
    );
    paintFull();
    kick();
  }

  function dissolveOut(opts) {
    beginDissolve(-1, opts);
  }

  function assembleIn(opts) {
    beginDissolve(1, opts);
  }

  function displace() {
    var i;
    if (morphing && morphFromX) {
      var t = morphT;
      var u = 1 - t;
      for (i = 0; i < count; i++) {
        drawX[i] = morphFromX[i] * u + homeX[i] * t;
        drawY[i] = morphFromY[i] * u + homeY[i] * t;
      }
      return true;
    }

    if (reduceMotion || !hasPointer || !pointerForce) {
      var moved = false;
      for (i = 0; i < count; i++) {
        if (drawX[i] !== homeX[i] || drawY[i] !== homeY[i]) {
          drawX[i] = homeX[i];
          drawY[i] = homeY[i];
          moved = true;
        }
      }
      return moved;
    }

    // Screen-space circle brush (not ellipse)
    var r2 = RADIUS * RADIUS;
    var invSX = scaleX ? 1 / scaleX : 1;
    var invSY = scaleY ? 1 / scaleY : 1;

    for (i = 0; i < count; i++) {
      var hx = homeX[i];
      var hy = homeY[i];
      var dxC = hx - lx;
      var dyC = hy - ly;
      var dx = dxC * invSX;
      var dy = dyC * invSY;
      var d2 = dx * dx + dy * dy;
      if (d2 < r2 && d2 > 0.0001) {
        var inv = 1 / Math.sqrt(d2);
        var fall = 1 - d2 / r2;
        fall *= fall;
        var f = fall * PUSH;
        drawX[i] = hx + dx * inv * f * scaleX;
        drawY[i] = hy + dy * inv * f * scaleY;
      } else {
        drawX[i] = hx;
        drawY[i] = hy;
      }
    }
    return true;
  }

  function frame() {
    rafId = 0;

    if (dissolving && dissolveQueue) {
      var steps = dissolvePerFrame;
      var show = dissolveDir > 0 ? 1 : 0;
      while (steps-- > 0 && dissolveIdx < dissolveQueue.length) {
        glyphAlive[dissolveQueue[dissolveIdx++]] = show;
      }
      paintFull();
      if (dissolveIdx >= dissolveQueue.length) {
        dissolving = false;
        var cb = dissolveDone;
        dissolveDone = null;
        dissolveQueue = null;
        if (dissolveDir < 0) mount.classList.add("is-spent");
        else {
          mount.classList.remove("is-spent");
          if (!hasPointer) startIdleFlicker();
        }
        if (cb) cb();
      } else {
        kick();
      }
      return;
    }

    var active = displace();
    if (active) paintFull();

    if (morphing) {
      morphT += 0.08;
      if (morphT >= 1) {
        morphT = 1;
        morphing = false;
        mount.classList.remove("is-morphing");
        morphFromX = null;
        morphFromY = null;
        pointerForce = true;
        for (var i = 0; i < count; i++) {
          drawX[i] = homeX[i];
          drawY[i] = homeY[i];
        }
        paintFull();
        if (!hasPointer) startIdleFlicker();
      } else {
        kick();
      }
      return;
    }

    if (hasPointer && pointerForce && !reduceMotion) kick();
  }

  function kick() {
    if (rafId || reduceMotion) return;
    rafId = window.requestAnimationFrame(frame);
  }

  function startIdleFlicker() {
    if (reduceMotion || idleId) return;
    idleId = window.setInterval(function () {
      if (hasPointer || morphing || dissolving || document.hidden) return;
      // Only patch a few cells — cheapest shimmer that still “jumps”
      patchIdleFlicker();
    }, IDLE_MS);
  }

  function stopIdleFlicker() {
    if (!idleId) return;
    window.clearInterval(idleId);
    idleId = 0;
  }

  function burst() {
    if (!count) return;
    morphFromX = new Float32Array(count);
    morphFromY = new Float32Array(count);
    for (var i = 0; i < count; i++) {
      morphFromX[i] = homeX[i] + (Math.random() - 0.5) * 48;
      morphFromY[i] = homeY[i] + (Math.random() - 0.5) * 36;
    }
  }

  function rebuild() {
    refreshColors();
    if (mode === "table") {
      var mid = document.getElementById("slide-wrap");
      rebuildTable(mid ? mid.clientWidth : 640, mid ? Math.max(220, mid.clientHeight) : 320);
    } else {
      rebuildWord();
    }
    paintFull();
  }

  function finishMorph() {
    morphing = false;
    morphT = 1;
    mount.classList.remove("is-morphing");
    morphFromX = null;
    morphFromY = null;
  }

  function morphToTable(opts) {
    opts = opts || {};
    var width = Math.max(320, opts.width || 640);
    var height = Math.max(220, opts.height || 300);
    pointerForce = false;
    stopIdleFlicker();
    mount.classList.add("is-morphing");

    if (reduceMotion) {
      try {
        rebuildTable(width, height);
        paintFull();
      } catch (err) {
        console.error("AsciiMosaic.morphToTable", err);
      }
      finishMorph();
      return Promise.resolve();
    }

    burst();
    return new Promise(function (resolve) {
      window.setTimeout(function () {
        try {
          var fromX = morphFromX;
          var fromY = morphFromY;
          rebuildTable(width, height);
          morphFromX = new Float32Array(count);
          morphFromY = new Float32Array(count);
          for (var i = 0; i < count; i++) {
            if (fromX && fromX.length) {
              var s = i % fromX.length;
              morphFromX[i] = fromX[s];
              morphFromY[i] = fromY[s];
            } else {
              morphFromX[i] = homeX[i];
              morphFromY[i] = homeY[i];
            }
            drawX[i] = morphFromX[i];
            drawY[i] = morphFromY[i];
          }
          morphing = true;
          morphT = 0;
          kick();
        } catch (err) {
          console.error("AsciiMosaic.morphToTable", err);
          finishMorph();
        }
        window.setTimeout(resolve, opts.duration || 500);
      }, 120);
    });
  }

  function morphToWord() {
    pointerForce = false;
    stopIdleFlicker();
    mount.classList.add("is-morphing");

    if (reduceMotion) {
      try {
        rebuildWord();
        paintFull();
      } catch (err) {
        console.error("AsciiMosaic.morphToWord", err);
      }
      pointerForce = true;
      finishMorph();
      return Promise.resolve();
    }

    burst();
    return new Promise(function (resolve) {
      window.setTimeout(function () {
        try {
          var fromX = morphFromX;
          var fromY = morphFromY;
          rebuildWord();
          morphFromX = new Float32Array(count);
          morphFromY = new Float32Array(count);
          for (var i = 0; i < count; i++) {
            if (fromX && fromX.length) {
              var s = i % fromX.length;
              morphFromX[i] = fromX[s];
              morphFromY[i] = fromY[s];
            } else {
              morphFromX[i] = homeX[i];
              morphFromY[i] = homeY[i];
            }
            drawX[i] = morphFromX[i];
            drawY[i] = morphFromY[i];
          }
          morphing = true;
          morphT = 0;
          kick();
        } catch (err) {
          console.error("AsciiMosaic.morphToWord", err);
          finishMorph();
        }
        window.setTimeout(function () {
          pointerForce = true;
          resolve();
        }, 700);
      }, 100);
    });
  }

  view.addEventListener(
    "pointermove",
    function (e) {
      mx = e.clientX;
      my = e.clientY;
      hasPointer = true;
      stopIdleFlicker();
      syncPointerScale();
      kick();
    },
    { passive: true }
  );

  view.addEventListener(
    "pointerleave",
    function () {
      hasPointer = false;
      kick();
      startIdleFlicker();
    },
    { passive: true }
  );

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
        rafId = 0;
      }
      stopIdleFlicker();
    } else if (!hasPointer && !morphing) {
      startIdleFlicker();
    }
  });

  /* No resize rebuild — paint once at boot; CSS max-width scales the canvas.
   * Pause idle shimmer while the window is being resized to avoid jank. */
  var resizePauseTimer = 0;
  window.addEventListener(
    "resize",
    function () {
      stopIdleFlicker();
      window.clearTimeout(resizePauseTimer);
      resizePauseTimer = window.setTimeout(function () {
        if (!hasPointer && !morphing && !dissolving) startIdleFlicker();
      }, 200);
    },
    { passive: true }
  );

  function boot() {
    refreshColors();
    rebuildWord();
    paintFull();
    startIdleFlicker();
  }

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(boot).catch(boot);
  } else {
    boot();
  }

  /**
   * Exact viewport positions of VINC1AM letter glyphs (home, not hover-displaced).
   * Call while still on /aboutme — before layout switches to morphing/content.
   */
  function snapshotLetters() {
    if (!count || !homeX) return [];
    /* Snap back to home so start points match the resting wordmark */
    var i;
    for (i = 0; i < count; i++) {
      drawX[i] = homeX[i];
      drawY[i] = homeY[i];
    }
    paintFull();

    var viewRect = view.getBoundingClientRect();
    var sx = view.width ? viewRect.width / view.width : 1;
    var sy = view.height ? viewRect.height / view.height : 1;
    var out = [];
    for (i = 0; i < count; i++) {
      if (!isLetter[i]) continue;
      out.push({
        x: viewRect.left + homeX[i] * sx,
        y: viewRect.top + homeY[i] * sy,
        id: glyphId[i],
      });
    }
    return out;
  }

  /**
   * Fly VINC1AM glyphs into the cat silhouette, then resolve.
   * Prefer opts.from = snapshotLetters() taken on aboutme (exact starts).
   */
  function morphToCat(opts) {
    opts = opts || {};
    var target = opts.target || document.getElementById("look-cat");
    var silhouette =
      opts.silhouette || "assets/cat/play/1/frame_044.webp";
    var duration = opts.duration || 1100;

    pointerForce = false;
    stopIdleFlicker();
    mount.classList.add("is-morphing");

    if (reduceMotion || !count || !target) {
      mount.classList.add("is-spent");
      finishMorph();
      return Promise.resolve();
    }

    return new Promise(function (resolve) {
      var img = new Image();
      img.decoding = "async";
      var started = false;
      function start() {
        if (started) return;
        started = true;
        try {
          runCatMorph(img, target, duration, opts, resolve);
        } catch (err) {
          console.error("AsciiMosaic.morphToCat", err);
          mount.classList.add("is-spent");
          finishMorph();
          resolve();
        }
      }
      img.onload = start;
      img.onerror = function () {
        mount.classList.add("is-spent");
        finishMorph();
        resolve();
      };
      img.src = silhouette;
      if (img.complete) start();
    });
  }

  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function runCatMorph(silImg, target, duration, opts, resolve) {
    opts = opts || {};
    var viewRect = view.getBoundingClientRect();
    var sx = view.width ? viewRect.width / view.width : 1;
    var sy = view.height ? viewRect.height / view.height : 1;
    var catRect = target.getBoundingClientRect();

    /* Keep morph light: same VINC1AM glyphs, but only a subset flies */
    var MAX_FLY = 72;

    /* Sparse silhouette targets (cat outline hint, not every pixel) */
    var tw = 72;
    var th = Math.max(28, ((tw * silImg.height) / silImg.width) | 0);
    var tmp = document.createElement("canvas");
    tmp.width = tw;
    tmp.height = th;
    var tctx = tmp.getContext("2d", { willReadFrequently: true });
    tctx.drawImage(silImg, 0, 0, tw, th);
    var data = tctx.getImageData(0, 0, tw, th).data;
    var candidates = [];
    var y;
    var x;
    for (y = 0; y < th; y += 2) {
      for (x = 0; x < tw; x += 2) {
        if (data[(y * tw + x) * 4 + 3] < ALPHA_CUT) continue;
        candidates.push({
          x: catRect.left + ((x + 0.5) / tw) * catRect.width,
          y: catRect.top + ((y + 0.5) / th) * catRect.height,
        });
      }
    }
    if (!candidates.length) {
      mount.classList.add("is-spent");
      finishMorph();
      resolve();
      return;
    }

    /* Start from exact aboutme snapshot when provided; else home positions now */
    var from = opts.from && opts.from.length ? opts.from : null;
    var particles = [];
    var i;
    if (from) {
      var flyN = Math.min(MAX_FLY, from.length, candidates.length);
      var step = from.length / flyN;
      for (i = 0; i < flyN; i++) {
        var src = from[Math.min(from.length - 1, (i * step) | 0)];
        particles.push({
          x0: src.x,
          y0: src.y,
          id: src.id,
          letter: 1,
        });
      }
    } else {
      var letterIdx = [];
      for (i = 0; i < count; i++) {
        if (isLetter[i]) letterIdx.push(i);
      }
      if (!letterIdx.length) {
        mount.classList.add("is-spent");
        finishMorph();
        resolve();
        return;
      }
      var flyN2 = Math.min(MAX_FLY, letterIdx.length, candidates.length);
      var step2 = letterIdx.length / flyN2;
      for (i = 0; i < flyN2; i++) {
        var srcI = letterIdx[Math.min(letterIdx.length - 1, (i * step2) | 0)];
        particles.push({
          x0: viewRect.left + homeX[srcI] * sx,
          y0: viewRect.top + homeY[srcI] * sy,
          id: glyphId[srcI],
          letter: 1,
        });
      }
    }

    /* Evenly pick silhouette targets */
    var tStep = candidates.length / particles.length;
    for (i = particles.length - 1; i > 0; i--) {
      var j = (Math.random() * (i + 1)) | 0;
      var swap = particles[i];
      particles[i] = particles[j];
      particles[j] = swap;
    }
    for (i = 0; i < particles.length; i++) {
      var dest = candidates[Math.min(candidates.length - 1, (i * tStep) | 0)];
      particles[i].x1 = dest.x;
      particles[i].y1 = dest.y;
    }

    var overlay = document.createElement("canvas");
    overlay.className = "ascii-cat-morph";
    overlay.setAttribute("aria-hidden", "true");
    document.body.appendChild(overlay);
    var octx = overlay.getContext("2d");
    var dpr = window.devicePixelRatio || 1;

    function sizeOverlay() {
      var w = window.innerWidth;
      var h = window.innerHeight;
      overlay.width = Math.floor(w * dpr);
      overlay.height = Math.floor(h * dpr);
      overlay.style.width = w + "px";
      overlay.style.height = h + "px";
      octx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    sizeOverlay();

    /* Hide source wordmark once overlay is painting */
    mount.classList.add("is-spent");
    if (!atlasReady) buildAtlas();

    var t0 = performance.now();
    var raf = 0;
    var done = false;

    function paintOverlay(p) {
      var w = window.innerWidth;
      var h = window.innerHeight;
      octx.clearRect(0, 0, w, h);
      var k;
      for (k = 0; k < particles.length; k++) {
        var pt = particles[k];
        var e = easeInOutCubic(p);
        var x = pt.x0 + (pt.x1 - pt.x0) * e;
        var y = pt.y0 + (pt.y1 - pt.y0) * e;
        y -= Math.sin(e * Math.PI) * 28;
        octx.globalAlpha = 0.92;
        octx.drawImage(
          atlas,
          pt.id * CELL_W,
          0,
          CELL_W,
          CELL_H,
          x | 0,
          y | 0,
          CELL_W,
          CELL_H
        );
      }
      octx.globalAlpha = 1;
    }

    function finish() {
      if (done) return;
      done = true;
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      finishMorph();
      resolve();
    }

    function tick(now) {
      var p = (now - t0) / duration;
      if (p >= 1) p = 1;
      paintOverlay(p);
      if (p < 1) {
        raf = window.requestAnimationFrame(tick);
        return;
      }
      /* Same frame: drop overlay, then caller shows live cat */
      finish();
    }

    raf = window.requestAnimationFrame(tick);
  }

  window.AsciiMosaic = {
    morphToTable: morphToTable,
    morphToWord: morphToWord,
    morphToCat: morphToCat,
    dissolveOut: dissolveOut,
    assembleIn: assembleIn,
    snapshotLetters: snapshotLetters,
    burst: function () {
      burst();
      kick();
    },
    getMode: function () {
      return mode;
    }
  };
})();
