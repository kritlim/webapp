/* ====================================================================
   battle.js — Digivice-style face-off. Two Digimon line up and fire
   attacks across the screen over a few rounds. Your "charge" (a timing
   minigame in main.js) boosts your power; the rest is power vs power.
   ==================================================================== */
window.DV = window.DV || {};
(function (DV) {
  "use strict";

  var ROUNDS = 3;

  // playerStats: { power, sprite, name }
  // opponent:    { power, sprite, name }
  // charge:      0..1 from the timing bar (adds up to +60% power)
  function simulate(playerStats, opponent, charge) {
    var pPow = playerStats.power * (1 + 0.6 * charge);
    var oPow = opponent.power;
    var total = pPow + oPow;

    var rounds = [];
    var pHits = 0, oHits = 0;
    for (var i = 0; i < ROUNDS; i++) {
      var pChance = total > 0 ? pPow / total : 0.5;
      var playerHit = Math.random() < pChance + 0.1;     // slight player favour for fun
      var oppHit = Math.random() < (1 - pChance) + 0.05;
      if (playerHit) pHits++;
      if (oppHit) oHits++;
      rounds.push({ playerHit: playerHit, oppHit: oppHit });
    }

    var win;
    if (pHits !== oHits) win = pHits > oHits;
    else win = pPow >= oPow; // tie-break on raw power, edge to player

    return {
      opponent: opponent,
      player: playerStats,
      playerPower: Math.round(pPow),
      oppPower: Math.round(oPow),
      rounds: rounds,
      playerHits: pHits,
      oppHits: oHits,
      win: win,
    };
  }

  // Pick a wild opponent close to the player's power for a fair fight.
  function pickOpponent(playerPower) {
    var list = DV.digimon.OPPONENTS;
    var best = list[0], bestDiff = Infinity;
    for (var i = 0; i < list.length; i++) {
      var d = Math.abs(list[i].power - playerPower);
      // add a little randomness so it isn't always the exact same foe
      d += Math.random() * 6;
      if (d < bestDiff) { bestDiff = d; best = list[i]; }
    }
    return best;
  }

  DV.battle = { simulate: simulate, pickOpponent: pickOpponent, ROUNDS: ROUNDS };
})(window.DV);
