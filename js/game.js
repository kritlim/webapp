/* ====================================================================
   game.js — the simulation: care meters, day/night, sickness, ageing,
   digivolution and death. Runs in real time and also "catches up" the
   pet's life while the tab was closed (saved in localStorage).
   ==================================================================== */
window.DV = window.DV || {};
(function (DV) {
  "use strict";

  var SAVE_KEY = "digivice-d3-save-v1";

  // All durations are in seconds. Tuned so a full life to Mega takes a
  // bit under half an hour of attentive play, but neglect bites quickly.
  var CONFIG = {
    MAX_HEARTS: 4,
    MAX_POOP: 4,
    HUNGER_DECAY: 50,
    STRENGTH_DECAY: 65,
    POOP_MIN: 35,
    POOP_MAX: 80,
    CARE_GRACE: 30,
    POOP_GRACE: 45,
    SICK_FROM_POOP: 3,
    SICK_DECAY_MULT: 1.8,
    DAY_LENGTH: 300,
    NIGHT_START: 0.78,
    NEGLECT_DEATH: 240,
    SICK_DEATH: 320,
    WEIGHT_MIN: 5,
    WEIGHT_START: 10,
    WEIGHT_FOOD: 2,
    WEIGHT_PROTEIN: 1,
    WEIGHT_TRAIN: -2,
    OVERFEED_SICK_CHANCE: 0.15,
    TERMINAL_LIFESPAN: 1200,
    OFFLINE_CAP: 8 * 3600, // never simulate more than 8h of absence
    STAT_MAX: 99,
    STAT_GROW_INTERVAL: 150, // passive idle stat trickle (if well kept)
  };

  var listeners = {};
  function on(evt, cb) { (listeners[evt] = listeners[evt] || []).push(cb); }
  function emit(evt, a, b) {
    (listeners[evt] || []).forEach(function (cb) { cb(a, b); });
  }

  var state = null;

  function rand(min, max) { return min + Math.random() * (max - min); }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function newState() {
    var now = Date.now();
    return {
      version: 1,
      speciesId: DV.digimon.FIRST,
      bornAt: now,
      ageSec: 0,
      stageSec: 0,
      hunger: CONFIG.MAX_HEARTS,
      strength: CONFIG.MAX_HEARTS,
      weight: CONFIG.WEIGHT_START,
      poop: 0,
      sick: false,
      injured: false,
      sleeping: false,
      lightsOn: true,
      careMistakes: 0,
      trainingCount: 0,
      wins: 0,
      battles: 0,
      soundOn: true,
      // RPG stats
      str: 2, agi: 2, int: 2, vit: 2,
      level: 1, exp: 0,
      // internal accumulators
      tHunger: 0, tStrength: 0, tPoop: 0, nextPoop: rand(CONFIG.POOP_MIN, CONFIG.POOP_MAX),
      tHungryEmpty: 0, tStrengthEmpty: 0, tPoopWait: 0, tNightLit: 0,
      tNeglect: 0, tSick: 0, tStatGrow: 0,
      dead: false, deathReason: null,
      lastUpdate: now,
    };
  }

  // Back-fill RPG fields onto an older save that predates them.
  function ensureStats(s) {
    if (s.str == null) { s.str = 2; s.agi = 2; s.int = 2; s.vit = 2; }
    if (s.level == null) { s.level = 1; s.exp = 0; }
    if (s.tStatGrow == null) s.tStatGrow = 0;
    return s;
  }

  function species() { return DV.digimon.get(state.speciesId); }

  function isNight() {
    var phase = (state.ageSec % CONFIG.DAY_LENGTH) / CONFIG.DAY_LENGTH;
    return phase >= CONFIG.NIGHT_START;
  }

  function needsAttention() {
    if (!state || state.dead) return false;
    if (state.speciesId === "egg") return state.stageSec >= species().evolveAfter;
    return (
      state.hunger === 0 ||
      state.strength === 0 ||
      state.poop > 0 ||
      state.sick ||
      state.injured ||
      (isNight() && state.lightsOn)
    );
  }

  // ---- the per-tick simulation (dt seconds, small steps) -------------
  function step(dt) {
    if (state.dead) return;
    state.ageSec += dt;
    state.stageSec += dt;

    var sp = species();
    var night = isNight();

    // EGG: nothing decays; it just waits to hatch.
    if (state.speciesId === "egg") {
      maybeEvolve(sp);
      return;
    }

    var asleep = night && !state.lightsOn;
    state.sleeping = asleep;

    var decayMult = state.sick ? CONFIG.SICK_DECAY_MULT : 1;

    if (asleep) {
      // Resting: slowly recover strength, hunger barely moves.
      state.tStrength -= dt * 0.5;
      if (state.tStrength < -CONFIG.STRENGTH_DECAY) {
        state.strength = clamp(state.strength + 1, 0, CONFIG.MAX_HEARTS);
        state.tStrength = 0;
      }
      state.tHunger += dt * 0.3;
    } else {
      state.tHunger += dt * decayMult;
      state.tStrength += dt * decayMult;
    }

    while (state.tHunger >= CONFIG.HUNGER_DECAY && state.hunger > 0) {
      state.hunger--; state.tHunger -= CONFIG.HUNGER_DECAY;
    }
    while (state.tStrength >= CONFIG.STRENGTH_DECAY && state.strength > 0) {
      state.strength--; state.tStrength -= CONFIG.STRENGTH_DECAY;
    }

    // Pooping (not while asleep).
    if (!asleep) {
      state.tPoop += dt;
      if (state.tPoop >= state.nextPoop && state.poop < CONFIG.MAX_POOP) {
        state.poop++;
        state.tPoop = 0;
        state.nextPoop = rand(CONFIG.POOP_MIN, CONFIG.POOP_MAX);
        emit("poop");
      }
    }

    accrueCareMistakes(dt, night);
    rollSickness(dt);
    passiveGrowth(dt);
    checkDeath(dt);
    maybeEvolve(sp);
  }

  var STAT_KEYS = ["str", "agi", "int", "vit"];

  // "Both" growth: a slow passive trickle while the pet is well kept.
  function passiveGrowth(dt) {
    if (state.sick || state.hunger === 0) { return; } // unhealthy: no gains
    state.tStatGrow += dt;
    if (state.tStatGrow >= CONFIG.STAT_GROW_INTERVAL) {
      state.tStatGrow -= CONFIG.STAT_GROW_INTERVAL;
      var k = STAT_KEYS[Math.floor(Math.random() * STAT_KEYS.length)];
      state[k] = Math.min(CONFIG.STAT_MAX, state[k] + 1);
    }
  }

  function bumpMistake() {
    state.careMistakes++;
    emit("alert");
  }

  function accrueCareMistakes(dt, night) {
    // Hunger left empty.
    if (state.hunger === 0) {
      state.tHungryEmpty += dt;
      if (state.tHungryEmpty >= CONFIG.CARE_GRACE) { bumpMistake(); state.tHungryEmpty -= CONFIG.CARE_GRACE; }
    } else state.tHungryEmpty = 0;

    // Strength left empty.
    if (state.strength === 0) {
      state.tStrengthEmpty += dt;
      if (state.tStrengthEmpty >= CONFIG.CARE_GRACE) { bumpMistake(); state.tStrengthEmpty -= CONFIG.CARE_GRACE; }
    } else state.tStrengthEmpty = 0;

    // Poop left uncleaned.
    if (state.poop > 0) {
      state.tPoopWait += dt;
      if (state.tPoopWait >= CONFIG.POOP_GRACE) { bumpMistake(); state.tPoopWait -= CONFIG.POOP_GRACE; }
    } else state.tPoopWait = 0;

    // Lights on while it wants to sleep.
    if (night && state.lightsOn) {
      state.tNightLit += dt;
      if (state.tNightLit >= CONFIG.CARE_GRACE) { bumpMistake(); state.tNightLit -= CONFIG.CARE_GRACE; }
    } else state.tNightLit = 0;
  }

  function rollSickness(dt) {
    if (state.sick) { state.tSick += dt; return; }
    // Filth or starvation can make it ill.
    var risk = 0;
    if (state.poop >= CONFIG.SICK_FROM_POOP) risk += 0.02 * dt;
    if (state.hunger === 0 && state.strength === 0) risk += 0.03 * dt;
    if (risk > 0 && Math.random() < risk) {
      state.sick = true;
      state.tSick = 0;
      emit("sick");
    }
  }

  function checkDeath(dt) {
    // Total neglect: both meters bottomed out for too long.
    if (state.hunger === 0 && state.strength === 0) {
      state.tNeglect += dt;
      if (state.tNeglect >= CONFIG.NEGLECT_DEATH) return die("neglect");
    } else state.tNeglect = 0;

    // Illness left untreated.
    if (state.sick && state.tSick >= CONFIG.SICK_DEATH) return die("illness");

    // Old age (terminal forms / stuck SkullGreymon).
    var sp = species();
    var stuck = sp.next(state) === null && sp.evolveAfter !== null
      ? state.stageSec >= (sp.lifespan || CONFIG.TERMINAL_LIFESPAN)
      : false;
    var aged = sp.evolveAfter === null && state.stageSec >= (sp.lifespan || CONFIG.TERMINAL_LIFESPAN);
    if (stuck || aged) return die("oldage");
  }

  function die(reason) {
    state.dead = true;
    state.deathReason = reason;
    state.sleeping = false;
    emit("death", reason);
  }

  function maybeEvolve(sp) {
    if (sp.evolveAfter === null) return;
    if (state.stageSec < sp.evolveAfter) return;
    var nextId = sp.next(state);
    if (!nextId) return; // eligible but branch says "stay" (e.g. wild SkullGreymon)
    var from = state.speciesId;
    state.speciesId = nextId;
    state.stageSec = 0;
    // Celebrate: top up, cure, settle weight toward a healthy baseline.
    state.hunger = CONFIG.MAX_HEARTS;
    state.strength = CONFIG.MAX_HEARTS;
    state.sick = false;
    state.injured = false;
    state.tSick = 0;
    state.poop = 0;
    state.weight = clamp(state.weight, CONFIG.WEIGHT_MIN, 35);
    emit(from === "egg" ? "hatch" : "evolve", from, nextId);
  }

  // ---- public actions ------------------------------------------------
  function requireAlive() { return state && !state.dead && state.speciesId !== "egg"; }

  function feedFood() {
    if (!requireAlive()) return { ok: false };
    if (state.sleeping) return { ok: false, reason: "asleep" };
    if (state.hunger >= CONFIG.MAX_HEARTS) {
      // Overfeeding: piles on weight, may upset its stomach.
      state.weight += CONFIG.WEIGHT_FOOD;
      if (Math.random() < CONFIG.OVERFEED_SICK_CHANCE) { state.sick = true; state.tSick = 0; emit("sick"); }
      return { ok: true, full: true, changes: [["WT", CONFIG.WEIGHT_FOOD]] };
    }
    state.hunger = clamp(state.hunger + 1, 0, CONFIG.MAX_HEARTS);
    state.weight += CONFIG.WEIGHT_FOOD;
    return { ok: true, changes: [["HUNGER", 1], ["WT", CONFIG.WEIGHT_FOOD]] };
  }

  function feedProtein() {
    if (!requireAlive()) return { ok: false };
    if (state.sleeping) return { ok: false, reason: "asleep" };
    if (state.strength >= CONFIG.MAX_HEARTS) {
      state.weight += CONFIG.WEIGHT_PROTEIN;
      if (Math.random() < CONFIG.OVERFEED_SICK_CHANCE) { state.sick = true; state.tSick = 0; emit("sick"); }
      return { ok: true, full: true, changes: [["WT", CONFIG.WEIGHT_PROTEIN]] };
    }
    state.strength = clamp(state.strength + 1, 0, CONFIG.MAX_HEARTS);
    state.weight += CONFIG.WEIGHT_PROTEIN;
    return { ok: true, changes: [["STA", 1], ["WT", CONFIG.WEIGHT_PROTEIN]] };
  }

  function train(success, stat) {
    if (!requireAlive()) return { ok: false };
    if (state.sleeping) return { ok: false, reason: "asleep" };
    if (STAT_KEYS.indexOf(stat) < 0) stat = "str";
    var changes = [], w0 = state.weight;
    if (success) {
      state.trainingCount++;
      state[stat] = Math.min(CONFIG.STAT_MAX, state[stat] + 1);
      state.weight = clamp(state.weight + CONFIG.WEIGHT_TRAIN, CONFIG.WEIGHT_MIN, 99);
      changes.push([stat.toUpperCase(), 1]);
    } else {
      // even a failed rep burns a little energy
      state.weight = clamp(state.weight - 1, CONFIG.WEIGHT_MIN, 99);
    }
    if (state.weight - w0 !== 0) changes.push(["WT", state.weight - w0]);
    return { ok: true, changes: changes };
  }

  function clean() {
    if (!state || state.dead) return { ok: false };
    var had = state.poop;
    state.poop = 0;
    state.tPoopWait = 0;
    return { ok: true, cleaned: had };
  }

  function heal() {
    if (!state || state.dead) return { ok: false };
    if (state.sick || state.injured) {
      state.sick = false;
      state.injured = false;
      state.tSick = 0;
      emit("cured");
      return { ok: true, cured: true };
    }
    return { ok: true, cured: false };
  }

  function toggleLights() {
    if (!state || state.dead) return state ? state.lightsOn : false;
    state.lightsOn = !state.lightsOn;
    return state.lightsOn;
  }

  function recordBattle(won) {
    state.battles++;
    var s0 = state.strength, w0 = state.weight, injured = false;
    if (won) {
      state.wins++;
    } else {
      // a loss drains stamina and may leave a scratch
      state.strength = clamp(state.strength - 1, 0, CONFIG.MAX_HEARTS);
      if (Math.random() < 0.25) { state.injured = true; injured = true; }
    }
    // battling always costs a little stamina & weight
    state.strength = clamp(state.strength - 1, 0, CONFIG.MAX_HEARTS);
    state.weight = clamp(state.weight - 1, CONFIG.WEIGHT_MIN, 99);

    // EXP & levels (idle growth from fighting)
    var idx = DV.digimon.stageIndex(state.speciesId);
    var gain = won ? 12 + idx * 5 : 4;
    state.exp += gain;
    var leveled = 0;
    var need = function () { return 20 + (state.level - 1) * 15; };
    while (state.exp >= need()) {
      state.exp -= need();
      state.level++;
      leveled++;
      // raise the two lowest stats to keep builds rounded
      var order = STAT_KEYS.slice().sort(function (a, b) { return state[a] - state[b]; });
      state[order[0]] = Math.min(CONFIG.STAT_MAX, state[order[0]] + 1);
      state[order[1]] = Math.min(CONFIG.STAT_MAX, state[order[1]] + 1);
    }

    var changes = [];
    if (state.strength - s0 !== 0) changes.push(["STA", state.strength - s0]);
    if (state.weight - w0 !== 0) changes.push(["WT", state.weight - w0]);
    changes.push(["EXP", gain]);
    return { won: won, changes: changes, injured: injured, leveled: leveled, level: state.level };
  }

  // ---- combatant builders for the auto-battle ----
  function derive(str, agi, int, vit, speciesPower, stageIdx) {
    return {
      maxHP: 20 + vit * 4 + stageIdx * 10,
      patk: str + Math.round(speciesPower * 0.5),
      matk: int + Math.round(speciesPower * 0.35),
      def: Math.floor(vit / 2) + Math.floor(stageIdx / 2),
      agi: agi,
    };
  }
  function combatant(id, str, agi, int, vit, opts) {
    var sp = DV.digimon.get(id);
    var idx = DV.digimon.stageIndex(id);
    var d = derive(str, agi, int, vit, sp.power, idx);
    var penalty = ((opts && opts.sick) ? 0.8 : 1) * ((opts && opts.hungry) ? 0.85 : 1);
    var ids = sp.skills && sp.skills.length ? sp.skills : ["tackle"];
    return {
      id: id, name: sp.name, sprite: sp.sprite,
      maxHP: d.maxHP, hp: d.maxHP,
      patk: Math.max(1, Math.round(d.patk * penalty)),
      matk: Math.max(1, Math.round(d.matk * penalty)),
      def: d.def, agi: d.agi, int: int,
      skills: DV.skills.list(ids),
    };
  }
  function playerCombatant() {
    return combatant(state.speciesId, state.str, state.agi, state.int, state.vit,
      { sick: state.sick, hungry: state.hunger === 0 });
  }
  function makeOpponent() {
    var idx = DV.digimon.stageIndex(state.speciesId);
    // same-stage wilds, plus the player's own species as a guaranteed fair mirror
    var pool = DV.digimon.OPPONENTS.filter(function (o) { return DV.digimon.stageIndex(o.id) === idx; });
    pool = pool.concat([{ id: state.speciesId }]);
    var pick = pool[Math.floor(Math.random() * pool.length)];
    var avg = (state.str + state.agi + state.int + state.vit) / 4;
    // wild stats scale around the player's average (0.85x .. 1.10x)
    var s = function () { return Math.max(1, Math.round(avg * (0.85 + Math.random() * 0.25))); };
    return combatant(pick.id, s(), s(), s(), s(), {});
  }
  function statBlock() {
    return { str: state.str, agi: state.agi, int: state.int, vit: state.vit, level: state.level, exp: state.exp };
  }

  // ---- persistence + main loop driver --------------------------------
  function save() {
    if (!state) return;
    state.lastUpdate = Date.now();
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (e) {}
  }

  function load() {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      var s = JSON.parse(raw);
      if (!s || !s.speciesId || !DV.digimon.get(s.speciesId)) return false;
      state = ensureStats(s);
      DV.audio.setEnabled(state.soundOn !== false);
      catchUp();
      return true;
    } catch (e) { return false; }
  }

  function start() {
    state = newState();
    save();
  }

  // Simulate the elapsed real-world time since the last save in 5s chunks.
  function catchUp() {
    var now = Date.now();
    var elapsed = Math.min((now - (state.lastUpdate || now)) / 1000, CONFIG.OFFLINE_CAP);
    var stepSize = 5;
    while (elapsed > 0 && !state.dead) {
      step(Math.min(stepSize, elapsed));
      elapsed -= stepSize;
    }
    state.lastUpdate = now;
  }

  // advance(dtSeconds): called by the render loop with real frame deltas.
  function advance(dt) {
    if (!state) return;
    // guard against huge deltas (tab throttling) by sub-stepping
    var remaining = Math.min(dt, 30);
    while (remaining > 0) {
      step(Math.min(1, remaining));
      remaining -= 1;
    }
  }

  DV.game = {
    CONFIG: CONFIG,
    on: on,
    start: start,
    load: load,
    save: save,
    advance: advance,
    sync: catchUp,
    getState: function () { return state; },
    species: species,
    isNight: isNight,
    needsAttention: needsAttention,
    // actions
    feedFood: feedFood,
    feedProtein: feedProtein,
    train: train,
    clean: clean,
    heal: heal,
    toggleLights: toggleLights,
    recordBattle: recordBattle,
    playerCombatant: playerCombatant,
    makeOpponent: makeOpponent,
    statBlock: statBlock,
    setSound: function (v) { if (state) state.soundOn = v; DV.audio.setEnabled(v); },
  };
})(window.DV);
