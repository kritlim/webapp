/* ====================================================================
   digimon.js — species data + the care-based digivolution tree.

   Like a real Digivice, which form you get depends on how you raised
   your partner: care mistakes, training, weight and battle record all
   steer the branch. Good care -> heroes; neglect/overtraining -> the
   classic "wrong" digivolutions (Numemon, SkullGreymon).
   ==================================================================== */
window.DV = window.DV || {};
(function (DV) {
  "use strict";

  var STAGES = ["egg", "baby", "intraining", "rookie", "champion", "ultimate", "mega"];

  // Convenience: read derived care metrics off a save state.
  function metrics(s) {
    return {
      cm: s.careMistakes,
      train: s.trainingCount,
      wins: s.wins,
      battles: s.battles,
      wr: s.battles > 0 ? s.wins / s.battles : 0,
      overweight: s.weight >= 30,
      underweight: s.weight <= 5,
    };
  }

  // species table. evolveAfter = seconds spent in this form before it
  // becomes eligible to digivolve. next(state) -> id of the next form.
  var SPECIES = {
    egg: {
      id: "egg", name: "DIGI EGG", stage: "egg", sprite: "egg",
      power: 0, evolveAfter: 25,
      next: function () { return "botamon"; },
    },
    botamon: {
      id: "botamon", name: "BOTAMON", stage: "baby", sprite: "botamon",
      power: 1, evolveAfter: 70,
      next: function () { return "koromon"; },
    },
    koromon: {
      id: "koromon", name: "KOROMON", stage: "intraining", sprite: "koromon",
      power: 2, evolveAfter: 150,
      next: function (s) {
        var m = metrics(s);
        // Lots of attention & training leans toward the bold Agumon line;
        // a more neglected, softer upbringing leans Gabumon.
        return m.cm <= 4 ? "agumon" : "gabumon";
      },
    },
    agumon: {
      id: "agumon", name: "AGUMON", stage: "rookie", sprite: "agumon",
      power: 5, evolveAfter: 260,
      next: function (s) {
        var m = metrics(s);
        var good = m.cm <= 6 && m.train >= 3 && !m.underweight;
        return good ? "greymon" : "numemon";
      },
    },
    gabumon: {
      id: "gabumon", name: "GABUMON", stage: "rookie", sprite: "gabumon",
      power: 5, evolveAfter: 260,
      next: function (s) {
        var m = metrics(s);
        var good = m.cm <= 6 && m.train >= 3 && !m.underweight;
        return good ? "garurumon" : "numemon";
      },
    },
    greymon: {
      id: "greymon", name: "GREYMON", stage: "champion", sprite: "greymon",
      power: 12, evolveAfter: 360,
      next: function (s) {
        var m = metrics(s);
        // Over-training or a sloppy win record warps it into SkullGreymon.
        var overtrained = m.train >= 18 && m.cm >= 5;
        var good = m.cm <= 8 && m.train >= 8 && m.wr >= 0.4;
        return good && !overtrained ? "metalgreymon" : "skullgreymon";
      },
    },
    garurumon: {
      id: "garurumon", name: "GARURUMON", stage: "champion", sprite: "garurumon",
      power: 12, evolveAfter: 360,
      next: function (s) {
        var m = metrics(s);
        var overtrained = m.train >= 18 && m.cm >= 5;
        var good = m.cm <= 8 && m.train >= 8 && m.wr >= 0.4;
        return good && !overtrained ? "metalgreymon" : "skullgreymon";
      },
    },
    numemon: {
      id: "numemon", name: "NUMEMON", stage: "champion", sprite: "numemon",
      power: 6, evolveAfter: 360,
      next: function (s) {
        var m = metrics(s);
        // Redemption arc: turn things around and Numemon can still rise.
        var redeemed = m.cm <= 10 && m.train >= 10;
        return redeemed ? "metalgreymon" : "skullgreymon";
      },
    },
    metalgreymon: {
      id: "metalgreymon", name: "METALGREYMON", stage: "ultimate", sprite: "metalgreymon",
      power: 22, evolveAfter: 480,
      next: function () { return "wargreymon"; },
    },
    skullgreymon: {
      id: "skullgreymon", name: "SKULLGREYMON", stage: "ultimate", sprite: "skullgreymon",
      power: 26, evolveAfter: 480,
      next: function (s) {
        var m = metrics(s);
        // A berserk form — only careful, winning play tames it into a Mega.
        var tamed = m.cm <= 6 && m.wr >= 0.6;
        return tamed ? "wargreymon" : null; // null = stays put (no Mega)
      },
    },
    wargreymon: {
      id: "wargreymon", name: "WARGREYMON", stage: "mega", sprite: "wargreymon",
      power: 40, evolveAfter: null, // terminal form
      lifespan: 1500, // seconds as a Mega before old age
      next: function () { return null; },
    },
  };

  // Wild opponents available in the Battle menu, grouped loosely by power
  // so you can pick a fair-ish fight.
  var OPPONENTS = [
    { id: "agumon", name: "AGUMON", sprite: "agumon", power: 5 },
    { id: "gabumon", name: "GABUMON", sprite: "gabumon", power: 6 },
    { id: "numemon", name: "NUMEMON", sprite: "numemon", power: 8 },
    { id: "greymon", name: "GREYMON", sprite: "greymon", power: 14 },
    { id: "garurumon", name: "GARURUMON", sprite: "garurumon", power: 15 },
    { id: "skullgreymon", name: "SKULLGREYMON", sprite: "skullgreymon", power: 28 },
    { id: "metalgreymon", name: "METALGREYMON", sprite: "metalgreymon", power: 24 },
    { id: "wargreymon", name: "WARGREYMON", sprite: "wargreymon", power: 42 },
  ];

  DV.digimon = {
    STAGES: STAGES,
    SPECIES: SPECIES,
    OPPONENTS: OPPONENTS,
    FIRST: "egg",
    get: function (id) { return SPECIES[id] || null; },
    stageIndex: function (id) {
      var sp = SPECIES[id];
      return sp ? STAGES.indexOf(sp.stage) : -1;
    },
  };
})(window.DV);
