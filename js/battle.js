/* ====================================================================
   battle.js — system-controlled (idle) auto-battle.

   simulate(player, opponent) runs the whole fight up front and returns a
   log of events; main.js then plays that log back with animation so the
   player just watches. Combatants come from DV.game (playerCombatant /
   makeOpponent) and carry: hp, maxHP, patk, matk, def, agi, skills[].
   ==================================================================== */
window.DV = window.DV || {};
(function (DV) {
  "use strict";

  var MAX_ROUNDS = 24;

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function chooseSkill(actor) {
    var s = actor.skills || [];
    // heal when hurt, if able
    if (actor.hp < actor.maxHP * 0.3) {
      for (var i = 0; i < s.length; i++) if (s[i].kind === "heal") return s[i];
    }
    var dmg = s.filter(function (k) { return k.kind === "phys" || k.kind === "mag"; });
    if (!dmg.length) {
      // only buffs/heals available — use a buff occasionally, else first skill
      return s[Math.floor(Math.random() * s.length)] || { name: "STRUGGLE", kind: "phys", power: 2, acc: 90 };
    }
    // occasionally throw in a buff for flavour
    var buff = s.filter(function (k) { return k.kind === "buff"; });
    if (buff.length && Math.random() < 0.18 && actor._buffs !== 2) return buff[0];
    dmg.sort(function (a, b) { return b.power - a.power; });
    return Math.random() < 0.7 ? dmg[0] : dmg[Math.floor(Math.random() * dmg.length)];
  }

  function resolve(actor, target) {
    var sk = chooseSkill(actor);

    if (sk.kind === "heal") {
      var amt = sk.power + Math.floor(actor.matk / 2);
      actor.hp = Math.min(actor.maxHP, actor.hp + amt);
      return { skill: sk.name, type: "heal", amount: amt };
    }
    if (sk.kind === "buff") {
      actor.def += 2;
      actor._buffs = (actor._buffs || 0) + 1;
      return { skill: sk.name, type: "buff", amount: 0 };
    }

    var atk = sk.kind === "mag" ? actor.matk : actor.patk;
    var defv = sk.kind === "mag" ? Math.floor(target.def / 2) : target.def;

    // accuracy & evasion (AGI difference helps the faster fighter)
    var hitChance = clamp(sk.acc + (actor.agi - target.agi) * 2, 45, 99);
    if (Math.random() * 100 > hitChance) return { skill: sk.name, type: "miss", amount: 0 };

    var base = Math.max(1, sk.power + atk - defv);
    var variance = 0.85 + Math.random() * 0.3;
    var critChance = clamp(actor.agi * 1.4, 5, 28);
    var crit = Math.random() * 100 < critChance;
    var dmg = Math.max(1, Math.round(base * variance * (crit ? 1.6 : 1)));
    // cap a single blow so fights are watchable (no one-shots)
    dmg = Math.min(dmg, Math.max(1, Math.round(target.maxHP * 0.4)));
    target.hp = Math.max(0, target.hp - dmg);

    var ev = { skill: sk.name, type: crit ? "crit" : "hit", amount: dmg };
    if (sk.effect === "agidown") { target.agi = Math.max(1, target.agi - 1); ev.effect = "agidown"; }
    return ev;
  }

  function simulate(player, opponent) {
    var p = player, o = opponent, log = [], round = 0;

    while (p.hp > 0 && o.hp > 0 && round < MAX_ROUNDS) {
      round++;
      var first = p.agi > o.agi ? p : o.agi > p.agi ? o : (Math.random() < 0.5 ? p : o);
      var order = first === p ? [p, o] : [o, p];
      for (var k = 0; k < 2; k++) {
        var actor = order[k], target = actor === p ? o : p;
        if (actor.hp <= 0 || target.hp <= 0) continue;
        var ev = resolve(actor, target);
        ev.actor = actor === p ? "p" : "o";
        ev.pHP = p.hp; ev.oHP = o.hp;
        log.push(ev);
        if (target.hp <= 0) break;
      }
    }

    var win;
    if (o.hp <= 0 && p.hp > 0) win = true;
    else if (p.hp <= 0) win = false;
    else win = (p.hp / p.maxHP) >= (o.hp / o.maxHP); // timeout: higher HP% wins

    return { log: log, win: win, player: p, opponent: o, rounds: round };
  }

  DV.battle = { simulate: simulate, MAX_ROUNDS: MAX_ROUNDS };
})(window.DV);
