/* ====================================================================
   audio.js — tiny WebAudio "blip" engine for that LCD-toy feel.
   ==================================================================== */
window.DV = window.DV || {};
(function (DV) {
  "use strict";

  var ctx = null;
  var enabled = true;

  function ensure() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (AC) ctx = new AC();
    }
    if (ctx && ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  // Play a single square-wave beep.
  function beep(freq, dur, when, vol, type) {
    if (!enabled) return;
    var ac = ensure();
    if (!ac) return;
    var t0 = ac.currentTime + (when || 0);
    var osc = ac.createOscillator();
    var gain = ac.createGain();
    osc.type = type || "square";
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol || 0.18, t0 + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  // Play a sequence of [freq, durationSeconds] steps back-to-back.
  function seq(notes, gap, vol, type) {
    var t = 0;
    gap = gap || 0;
    for (var i = 0; i < notes.length; i++) {
      beep(notes[i][0], notes[i][1], t, vol, type);
      t += notes[i][1] + gap;
    }
  }

  DV.audio = {
    unlock: function () { ensure(); },
    setEnabled: function (v) { enabled = !!v; },
    isEnabled: function () { return enabled; },

    // UI / gameplay cues -------------------------------------------------
    move: function () { beep(660, 0.04, 0, 0.12); },
    select: function () { seq([[523, 0.05], [784, 0.07]], 0, 0.14); },
    back: function () { seq([[523, 0.05], [330, 0.06]], 0, 0.12); },
    eat: function () { seq([[440, 0.05], [550, 0.05], [660, 0.06]], 0.01, 0.13); },
    refuse: function () { seq([[300, 0.08], [200, 0.12]], 0.02, 0.13); },
    clean: function () { beep(900, 0.05, 0, 0.1); beep(700, 0.05, 0.06, 0.1); beep(500, 0.06, 0.12, 0.1); },
    happy: function () { seq([[523, 0.07], [659, 0.07], [784, 0.07], [1047, 0.12]], 0.005, 0.15); },
    hit: function () { beep(180, 0.08, 0, 0.18, "sawtooth"); },
    attack: function () { beep(880, 0.05, 0, 0.14); beep(1175, 0.05, 0.05, 0.14); },
    hatch: function () { seq([[392, 0.08], [523, 0.08], [659, 0.12], [784, 0.18]], 0.01, 0.16); },
    evolve: function () {
      seq([[523, 0.09], [659, 0.09], [784, 0.09], [1047, 0.09], [1319, 0.18]], 0.01, 0.16);
    },
    win: function () { seq([[784, 0.1], [988, 0.1], [1319, 0.22]], 0.01, 0.16); },
    lose: function () { seq([[392, 0.12], [330, 0.12], [262, 0.25]], 0.02, 0.15, "triangle"); },
    death: function () { seq([[392, 0.2], [311, 0.2], [262, 0.2], [196, 0.45]], 0.03, 0.14, "triangle"); },
    alert: function () { beep(1047, 0.07, 0, 0.16); beep(1047, 0.07, 0.12, 0.16); },
    sick: function () { seq([[330, 0.12], [294, 0.16]], 0.02, 0.12, "triangle"); },
  };
})(window.DV);
