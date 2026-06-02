/* ====================================================================
   render.js — low-level dot-matrix LCD drawing on a 64x48 canvas.
   Everything is drawn in logical pixels; CSS upscales it crisply.
   main.js composes scenes from these primitives.
   ==================================================================== */
window.DV = window.DV || {};
(function (DV) {
  "use strict";

  var W = 64, H = 48;
  var ctx = null;
  var ON = "#20300f";
  var BG = "#aeba8c";
  var GRID = "rgba(32,48,15,0.05)";

  function init(canvas) {
    canvas.width = W;
    canvas.height = H;
    ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
  }

  function begin() {
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, W, H);
    // faint dot-matrix grid for that LCD texture
    ctx.fillStyle = GRID;
    for (var y = 0; y < H; y += 2) ctx.fillRect(0, y, W, 1);
  }

  function pixel(x, y, on) {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    ctx.fillStyle = on === false ? BG : ON;
    ctx.fillRect(x | 0, y | 0, 1, 1);
  }

  // Draw a sprite {w,h,px}. opts: {flip, invert, clip:{x,y,w,h}}
  function sprite(spr, x, y, opts) {
    opts = opts || {};
    var flip = opts.flip, invert = opts.invert;
    for (var j = 0; j < spr.h; j++) {
      for (var i = 0; i < spr.w; i++) {
        var on = spr.px[j][flip ? spr.w - 1 - i : i] === 1;
        if (invert) on = !on;
        if (on) pixel(x + i, y + j, true);
      }
    }
  }

  function textWidth(str) { return str.length * 4 - 1; }

  function text(str, x, y, opts) {
    opts = opts || {};
    var font = DV.sprites.font;
    var cx = x;
    str = String(str).toUpperCase();
    for (var k = 0; k < str.length; k++) {
      var g = font[str[k]] || font[" "];
      for (var j = 0; j < 5; j++) {
        var row = g[j];
        for (var i = 0; i < 3; i++) {
          if (row[i] === "#") pixel(cx + i, y + j, true);
        }
      }
      cx += 4;
    }
    return cx - x;
  }

  function textCenter(str, y) { text(str, Math.round((W - textWidth(str)) / 2), y); }

  function rect(x, y, w, h, fill) {
    if (fill) {
      ctx.fillStyle = ON;
      ctx.fillRect(x, y, w, h);
    } else {
      for (var i = 0; i < w; i++) { pixel(x + i, y, true); pixel(x + i, y + h - 1, true); }
      for (var j = 0; j < h; j++) { pixel(x, y + j, true); pixel(x + w - 1, y + j, true); }
    }
  }

  // A row of small filled/empty hearts (used in status & quick view).
  function hearts(x, y, count, max) {
    var full = DV.sprites.items.heart;
    var empty = DV.sprites.items.heartEmpty;
    for (var i = 0; i < max; i++) {
      sprite(i < count ? full : empty, x + i * 9, y);
    }
  }

  // A compact 2px-tall meter bar.
  function bar(x, y, w, value, max) {
    rect(x, y, w, 5);
    var inner = Math.round(((w - 2) * value) / max);
    ctx.fillStyle = ON;
    ctx.fillRect(x + 1, y + 1, Math.max(0, inner), 3);
  }

  function dim(alpha) {
    ctx.fillStyle = "rgba(10,16,4," + (alpha || 0.45) + ")";
    ctx.fillRect(0, 0, W, H);
  }

  function flashInvert() {
    ctx.fillStyle = ON;
    ctx.fillRect(0, 0, W, H);
  }

  DV.render = {
    W: W, H: H,
    init: init,
    begin: begin,
    pixel: pixel,
    sprite: sprite,
    text: text,
    textCenter: textCenter,
    textWidth: textWidth,
    rect: rect,
    hearts: hearts,
    bar: bar,
    dim: dim,
    flashInvert: flashInvert,
  };
})(window.DV);
