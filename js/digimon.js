/* ====================================================================
   digimon.js — species data + the care-based digivolution tree.

   Each species lists its evolution branches as DATA: an ordered array of
   { to, text, cond }. cond(metrics, state) is evaluated top-to-bottom and
   the first match wins; `text` is the human-readable rule shown in the
   in-game Field Guide (wiki.js). The game and the wiki therefore share a
   single source of truth, so the guide can never drift from the logic.

   Like a real Digivice, which form you get depends on how you raised your
   partner: care mistakes, training, weight and battle record all steer the
   branch. Good care -> heroes; neglect/overtraining -> the classic "wrong"
   digivolutions (Numemon, SkullGreymon).
   ==================================================================== */
window.DV = window.DV || {};
(function (DV) {
  "use strict";

  var STAGES = ["egg", "baby", "intraining", "rookie", "champion", "ultimate", "mega"];

  // Derived care metrics read off a save state.
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

  // condition helpers (kept identical to the original branching logic)
  function greymonGood(m) { return m.cm <= 8 && m.train >= 8 && m.wr >= 0.4; }
  function greymonOvertrained(m) { return m.train >= 18 && m.cm >= 5; }

  var SPECIES = {
    egg: {
      id: "egg", name: "DIGI EGG", stage: "egg", sprite: "egg",
      power: 0, evolveAfter: 25,
      evolutions: [{ to: "botamon", text: "Hatches on its own" }],
    },
    botamon: {
      id: "botamon", name: "BOTAMON", stage: "baby", sprite: "botamon",
      power: 1, evolveAfter: 70,
      evolutions: [{ to: "koromon", text: "Always" }],
    },
    koromon: {
      id: "koromon", name: "KOROMON", stage: "intraining", sprite: "koromon",
      power: 2, evolveAfter: 150,
      evolutions: [
        { to: "patamon", text: "INT is its highest stat & Care Mistakes ≤ 5",
          cond: function (m, s) { return m.cm <= 5 && s.int > s.str && s.int > s.agi; } },
        { to: "veemon", text: "AGI is its highest stat & Care Mistakes ≤ 5",
          cond: function (m, s) { return m.cm <= 5 && s.agi > s.str && s.agi > s.int; } },
        { to: "agumon", text: "Care Mistakes ≤ 4", cond: function (m) { return m.cm <= 4; } },
        { to: "gabumon", text: "5+ Care Mistakes (softer upbringing)" },
      ],
    },
    agumon: {
      id: "agumon", name: "AGUMON", stage: "rookie", sprite: "agumon",
      power: 5, evolveAfter: 260,
      evolutions: [
        { to: "greymon", text: "Care Mistakes ≤ 6, Train ≥ 3, and not underweight",
          cond: function (m) { return m.cm <= 6 && m.train >= 3 && !m.underweight; } },
        { to: "numemon", text: "Otherwise (poor care, undertrained, or underweight)" },
      ],
    },
    gabumon: {
      id: "gabumon", name: "GABUMON", stage: "rookie", sprite: "gabumon",
      power: 5, evolveAfter: 260,
      evolutions: [
        { to: "garurumon", text: "Care Mistakes ≤ 6, Train ≥ 3, and not underweight",
          cond: function (m) { return m.cm <= 6 && m.train >= 3 && !m.underweight; } },
        { to: "numemon", text: "Otherwise (poor care, undertrained, or underweight)" },
      ],
    },
    greymon: {
      id: "greymon", name: "GREYMON", stage: "champion", sprite: "greymon",
      power: 12, evolveAfter: 360,
      evolutions: [
        { to: "metalgreymon", text: "Care Mistakes ≤ 8, Train ≥ 8, Win rate ≥ 40%, not over-trained",
          cond: function (m) { return greymonGood(m) && !greymonOvertrained(m); } },
        { to: "skullgreymon", text: "Over-trained (Train ≥ 18 with 5+ mistakes) or a weak record" },
      ],
    },
    garurumon: {
      id: "garurumon", name: "GARURUMON", stage: "champion", sprite: "garurumon",
      power: 12, evolveAfter: 360,
      evolutions: [
        { to: "metalgreymon", text: "Care Mistakes ≤ 8, Train ≥ 8, Win rate ≥ 40%, not over-trained",
          cond: function (m) { return greymonGood(m) && !greymonOvertrained(m); } },
        { to: "skullgreymon", text: "Over-trained (Train ≥ 18 with 5+ mistakes) or a weak record" },
      ],
    },
    numemon: {
      id: "numemon", name: "NUMEMON", stage: "champion", sprite: "numemon",
      power: 6, evolveAfter: 360,
      evolutions: [
        { to: "metalgreymon", text: "Redemption: Care Mistakes ≤ 10 and Train ≥ 10",
          cond: function (m) { return m.cm <= 10 && m.train >= 10; } },
        { to: "skullgreymon", text: "Otherwise" },
      ],
    },
    metalgreymon: {
      id: "metalgreymon", name: "METALGREYMON", stage: "ultimate", sprite: "metalgreymon",
      power: 22, evolveAfter: 480,
      evolutions: [{ to: "wargreymon", text: "Survive as an Ultimate" }],
    },
    skullgreymon: {
      id: "skullgreymon", name: "SKULLGREYMON", stage: "ultimate", sprite: "skullgreymon",
      power: 26, evolveAfter: 480,
      evolutions: [
        { to: "wargreymon", text: "Tame it: Care Mistakes ≤ 6 and Win rate ≥ 60%",
          cond: function (m) { return m.cm <= 6 && m.wr >= 0.6; } },
      ],
      stayText: "Otherwise it stays a berserk SkullGreymon and eventually dies of old age",
    },
    wargreymon: {
      id: "wargreymon", name: "WARGREYMON", stage: "mega", sprite: "wargreymon",
      power: 40, evolveAfter: null,
      lifespan: 1500,
      evolutions: [],
    },

    // ---- Veemon line (02 / D-3), branched from Koromon via AGI ----
    veemon: {
      id: "veemon", name: "VEEMON", stage: "rookie", sprite: "veemon",
      power: 5, evolveAfter: 260,
      evolutions: [
        { to: "exveemon", text: "Care Mistakes ≤ 6, Train ≥ 3, not underweight",
          cond: function (m) { return m.cm <= 6 && m.train >= 3 && !m.underweight; } },
        { to: "numemon", text: "Otherwise (poor care)" },
      ],
    },
    exveemon: {
      id: "exveemon", name: "EXVEEMON", stage: "champion", sprite: "exveemon",
      power: 13, evolveAfter: 360,
      evolutions: [
        { to: "aerovdramon", text: "Care Mistakes ≤ 8, Train ≥ 8, Win rate ≥ 40%",
          cond: function (m) { return m.cm <= 8 && m.train >= 8 && m.wr >= 0.4; } },
        { to: "skullgreymon", text: "Poor care or a weak record" },
      ],
    },
    aerovdramon: {
      id: "aerovdramon", name: "AEROVDRAMON", stage: "ultimate", sprite: "aerovdramon",
      power: 24, evolveAfter: 480,
      evolutions: [{ to: "ulforce", text: "Survive as an Ultimate" }],
    },
    ulforce: {
      id: "ulforce", name: "ULFORCEVMON", stage: "mega", sprite: "ulforce",
      power: 40, evolveAfter: null, lifespan: 1500,
      evolutions: [],
    },

    // ---- Patamon holy line (INT-gated), branched from Koromon via INT ----
    patamon: {
      id: "patamon", name: "PATAMON", stage: "rookie", sprite: "patamon",
      power: 5, evolveAfter: 260,
      evolutions: [
        { to: "angemon", text: "INT ≥ 5 & Care Mistakes ≤ 6",
          cond: function (m, s) { return m.cm <= 6 && s.int >= 5; } },
        { to: "numemon", text: "Otherwise (low INT or poor care)" },
      ],
    },
    angemon: {
      id: "angemon", name: "ANGEMON", stage: "champion", sprite: "angemon",
      power: 13, evolveAfter: 360,
      evolutions: [
        { to: "magnaangemon", text: "INT ≥ 10, Care Mistakes ≤ 8, Win rate ≥ 40%",
          cond: function (m, s) { return m.cm <= 8 && s.int >= 10 && m.wr >= 0.4; } },
        { to: "skullgreymon", text: "Faith falters (low INT or weak record)" },
      ],
    },
    magnaangemon: {
      id: "magnaangemon", name: "MAGNAANGEMON", stage: "ultimate", sprite: "magnaangemon",
      power: 24, evolveAfter: 480,
      evolutions: [{ to: "seraphimon", text: "Survive as an Ultimate" }],
    },
    seraphimon: {
      id: "seraphimon", name: "SERAPHIMON", stage: "mega", sprite: "seraphimon",
      power: 40, evolveAfter: null, lifespan: 1500,
      evolutions: [],
    },
  };

  // Attach a generic next() driven by the evolutions data.
  Object.keys(SPECIES).forEach(function (id) {
    var sp = SPECIES[id];
    sp.next = function (s) {
      var m = metrics(s);
      for (var i = 0; i < sp.evolutions.length; i++) {
        var e = sp.evolutions[i];
        if (!e.cond || e.cond(m, s)) return e.to;
      }
      return null; // eligible but no branch qualifies (e.g. wild SkullGreymon)
    };
  });

  // Battle skills per species (ids into DV.skills.POOL).
  var SKILLS_BY_SPECIES = {
    egg: [],
    botamon: ["bubble"],
    koromon: ["bubble", "tackle"],
    agumon: ["scratch", "pepper"],
    gabumon: ["tackle", "bluefire"],
    greymon: ["bite", "novablst", "guard"],
    garurumon: ["bite", "howling", "guard"],
    numemon: ["slime", "tackle", "refresh"],
    metalgreymon: ["novablst", "gigablst", "guard"],
    skullgreymon: ["darkshot", "bite"],
    wargreymon: ["novablst", "terra", "guard"],
    veemon: ["vheadbt", "scratch"],
    exveemon: ["bite", "veelaser", "guard"],
    aerovdramon: ["wingcut", "vnova", "guard"],
    ulforce: ["ulray", "wingcut", "guard"],
    patamon: ["boombub", "tackle"],
    angemon: ["handfate", "healaura", "guard"],
    magnaangemon: ["gatedest", "healaura", "guard"],
    seraphimon: ["sevenhv", "healaura", "guard"],
  };
  Object.keys(SKILLS_BY_SPECIES).forEach(function (id) {
    if (SPECIES[id]) SPECIES[id].skills = SKILLS_BY_SPECIES[id];
  });

  var OPPONENTS = [
    { id: "agumon", name: "AGUMON", sprite: "agumon", power: 5 },
    { id: "gabumon", name: "GABUMON", sprite: "gabumon", power: 6 },
    { id: "numemon", name: "NUMEMON", sprite: "numemon", power: 8 },
    { id: "greymon", name: "GREYMON", sprite: "greymon", power: 14 },
    { id: "garurumon", name: "GARURUMON", sprite: "garurumon", power: 15 },
    { id: "skullgreymon", name: "SKULLGREYMON", sprite: "skullgreymon", power: 28 },
    { id: "metalgreymon", name: "METALGREYMON", sprite: "metalgreymon", power: 24 },
    { id: "wargreymon", name: "WARGREYMON", sprite: "wargreymon", power: 42 },
    { id: "veemon", name: "VEEMON", sprite: "veemon", power: 5 },
    { id: "exveemon", name: "EXVEEMON", sprite: "exveemon", power: 13 },
    { id: "aerovdramon", name: "AEROVDRAMON", sprite: "aerovdramon", power: 24 },
    { id: "ulforce", name: "ULFORCEVMON", sprite: "ulforce", power: 40 },
    { id: "patamon", name: "PATAMON", sprite: "patamon", power: 5 },
    { id: "angemon", name: "ANGEMON", sprite: "angemon", power: 13 },
    { id: "magnaangemon", name: "MAGNAANGEMON", sprite: "magnaangemon", power: 24 },
    { id: "seraphimon", name: "SERAPHIMON", sprite: "seraphimon", power: 40 },
  ];

  // Display order for the Field Guide (stage order, branches grouped).
  var GUIDE_ORDER = [
    "egg", "botamon", "koromon",
    "agumon", "gabumon", "veemon", "patamon",
    "greymon", "garurumon", "exveemon", "angemon", "numemon",
    "metalgreymon", "aerovdramon", "magnaangemon", "skullgreymon",
    "wargreymon", "ulforce", "seraphimon",
  ];

  DV.digimon = {
    STAGES: STAGES,
    SPECIES: SPECIES,
    OPPONENTS: OPPONENTS,
    GUIDE_ORDER: GUIDE_ORDER,
    FIRST: "egg",
    metrics: metrics,
    get: function (id) { return SPECIES[id] || null; },
    stageIndex: function (id) {
      var sp = SPECIES[id];
      return sp ? STAGES.indexOf(sp.stage) : -1;
    },
  };
})(window.DV);
