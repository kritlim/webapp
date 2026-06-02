/* ====================================================================
   skills.js — battle skills. Each skill resolves in the auto-battle:
     kind: "phys" scales with attacker patk (STR), mitigated by full DEF
           "mag"  scales with attacker matk (INT), mitigated by half DEF
           "heal" restores the user's HP (scales with INT)
           "buff" raises the user's DEF for the rest of the fight
   `power` is the skill's base; `acc` is its base hit chance (%).
   Names are kept short to fit the 64px LCD.
   ==================================================================== */
window.DV = window.DV || {};
(function (DV) {
  "use strict";

  var POOL = {
    bubble:   { name: "BUBBLE",   kind: "mag",  power: 3,  acc: 95 },
    tackle:   { name: "TACKLE",   kind: "phys", power: 4,  acc: 95 },
    scratch:  { name: "SCRATCH",  kind: "phys", power: 5,  acc: 95 },
    bite:     { name: "BITE",     kind: "phys", power: 6,  acc: 90 },
    slime:    { name: "SLIME",    kind: "phys", power: 5,  acc: 90, effect: "agidown" },
    pepper:   { name: "PEPPER",   kind: "phys", power: 8,  acc: 90 },   // Agumon: Pepper Breath
    bluefire: { name: "BLUEFIRE", kind: "mag",  power: 8,  acc: 90 },   // Gabumon: Blue Blaster
    refresh:  { name: "REFRESH",  kind: "heal", power: 10, acc: 100 },
    guard:    { name: "GUARD",    kind: "buff", power: 0,  acc: 100, effect: "defup" },
    novablst: { name: "NOVABLST", kind: "phys", power: 14, acc: 88 },   // Greymon: Nova Blast
    howling:  { name: "HOWLING",  kind: "mag",  power: 13, acc: 88 },   // Garurumon: Howling Blaster
    gigablst: { name: "GIGABLST", kind: "phys", power: 22, acc: 85 },   // MetalGreymon: Giga Blaster
    darkshot: { name: "DARKSHOT", kind: "mag",  power: 20, acc: 82 },   // SkullGreymon: Dark Shot
    terra:    { name: "TERRAFRC", kind: "phys", power: 30, acc: 85 },   // WarGreymon: Terra Force
    // Veemon line
    vheadbt:  { name: "VHEADBT",  kind: "phys", power: 6,  acc: 92 },   // Veemon: Vee Headbutt
    veelaser: { name: "VEELASER", kind: "mag",  power: 13, acc: 88 },   // ExVeemon: Vee-Laser
    wingcut:  { name: "WINGCUT",  kind: "phys", power: 11, acc: 92 },
    vnova:    { name: "VNOVA",    kind: "phys", power: 22, acc: 86 },    // AeroVeedramon: V-Wing Blade
    ulray:    { name: "ULFORCE",  kind: "phys", power: 32, acc: 90 },    // UlforceVeedramon: Ray of Victory
  };

  // attach id onto each entry for convenience
  Object.keys(POOL).forEach(function (id) { POOL[id].id = id; });

  DV.skills = {
    POOL: POOL,
    get: function (id) { return POOL[id] || null; },
    list: function (ids) {
      return (ids || []).map(function (id) { return POOL[id]; }).filter(Boolean);
    },
  };
})(window.DV);
