/* ====================================================================
   main.js — input, the icon menu, scene composition and the game loop.
   Three buttons:  A = move cursor / page,  B = select / confirm,
                   C = back  (hold C ≈ 1s for Settings).
   ==================================================================== */
(function (DV) {
  "use strict";

  var R = DV.render, G = DV.game, A = DV.audio, S = DV.sprites;
  var canvas = document.getElementById("lcd");
  R.init(canvas);

  var MENU = [
    { key: "feed", icon: S.icons.feed, label: "FEED" },
    { key: "train", icon: S.icons.train, label: "TRAIN" },
    { key: "battle", icon: S.icons.battle, label: "BATTLE" },
    { key: "status", icon: S.icons.status, label: "STATUS" },
    { key: "clean", icon: S.icons.clean, label: "CLEAN" },
    { key: "lights", icon: S.icons.lights, label: "LIGHT" },
    { key: "heal", icon: S.icons.heal, label: "HEAL" },
    { key: "settings", icon: S.icons.settings, label: "SET" },
  ];

  var ui = {
    mode: "idle",
    cursor: 0,
    overlay: null,          // {type, t, data}
    message: null, messageT: 0,
    pet: { x: 24, dir: 1 },
    feed: { sel: 0, eatT: 0, eating: false },
    train: { phase: "aim", marker: 0, dir: 1, result: null, resultT: 0 },
    battle: null,
    status: { page: 0 },
    settings: { sel: 0, confirm: false },
  };

  var now = 0, alertT = 0, booted = false, floaters = [];

  /* -------------------- boot -------------------- */
  if (!G.load()) G.start();
  registerGameEvents();
  booted = true;
  if (G.getState().dead) openOverlay("death", { reason: G.getState().deathReason });

  function registerGameEvents() {
    G.on("hatch", function () { if (booted) { A.hatch(); openOverlay("hatch"); } });
    G.on("evolve", function (from, to) { if (booted) { A.evolve(); openOverlay("evolve", { to: to }); } });
    G.on("death", function (r) { if (booted) { A.death(); openOverlay("death", { reason: r }); } });
    G.on("sick", function () { if (booted) A.sick(); });
  }

  function openOverlay(type, data) { if (floaters) floaters.length = 0; ui.overlay = { type: type, t: 0, data: data || {} }; }
  function flash(msg) { ui.message = msg; ui.messageT = 1.3; A.move(); }

  /* -------- floating stat popups (e.g. "STR +1", "WT -2") -------- */
  function spawnFloats(changes, x, y) {
    if (!changes) return;
    for (var i = 0; i < changes.length; i++) {
      var d = changes[i][1];
      var txt = changes[i][0] + " " + (d > 0 ? "+" : "") + d;
      var fx = Math.max(0, Math.min(x, R.W - R.textWidth(txt)));
      floaters.push({ text: txt, x: fx, y: y - i * 7, t: 0, life: 1.2 });
    }
  }
  function updateFloaters(dt) {
    for (var i = floaters.length - 1; i >= 0; i--) {
      var f = floaters[i];
      f.t += dt; f.y -= 12 * dt;            // drift upward
      if (f.t >= f.life) floaters.splice(i, 1);
    }
  }
  function drawFloaters() {
    for (var i = 0; i < floaters.length; i++) {
      var f = floaters[i];
      // blink out over the last third of its life
      if (f.t > f.life * 0.66 && Math.floor(f.t * 12) % 2 === 0) continue;
      R.text(f.text, Math.round(f.x), Math.round(f.y));
    }
  }

  /* ==================================================================
     INPUT
     ================================================================== */
  function press(btn) {
    A.unlock();
    if (ui.overlay) return overlayInput(btn);
    switch (ui.mode) {
      case "idle": return idleInput(btn);
      case "feed": return feedInput(btn);
      case "train": return trainInput(btn);
      case "battle": return battleInput(btn);
      case "status": return statusInput(btn);
      case "settings": return settingsInput(btn);
    }
  }

  function idleInput(btn) {
    if (btn === "A") { ui.cursor = (ui.cursor + 1) % MENU.length; A.move(); }
    else if (btn === "B") { activate(MENU[ui.cursor].key); }
    else if (btn === "C") { ui.message = null; A.back(); }
  }

  function activate(key) {
    var st = G.getState();
    A.select();
    switch (key) {
      case "feed": ui.mode = "feed"; ui.feed = { sel: 0, eatT: 0, eating: false }; break;
      case "train":
        if (st.speciesId === "egg") return flash("NOT YET");
        ui.mode = "train"; ui.train = { phase: "aim", marker: 0, dir: 1, result: null, resultT: 0 };
        break;
      case "battle":
        if (st.speciesId === "egg") return flash("NOT YET");
        startBattle();
        break;
      case "status": ui.mode = "status"; ui.status = { page: 0 }; break;
      case "clean":
        var c = G.clean();
        if (c.cleaned) { A.clean(); flash("CLEAN!"); } else flash("ALL CLEAN");
        break;
      case "lights":
        var on = G.toggleLights();
        flash(on ? "LIGHT ON" : "LIGHT OFF");
        break;
      case "heal":
        var h = G.heal();
        if (h.cured) { A.happy(); flash("CURED!"); } else flash("FINE");
        break;
      case "settings":
        openSettings();
        break;
    }
  }

  function openSettings() {
    ui.mode = "settings";
    ui.settings = { sel: 0, confirm: false };
    A.select();
  }

  function feedInput(btn) {
    if (ui.feed.eating) return;
    if (btn === "A") { ui.feed.sel ^= 1; A.move(); }
    else if (btn === "B") {
      var res = ui.feed.sel === 0 ? G.feedFood() : G.feedProtein();
      if (!res.ok) { A.refuse(); flash(res.reason === "asleep" ? "ZZZ..." : "NO"); return; }
      if (res.full) { A.refuse(); flash("FULL!"); spawnFloats(res.changes, 8, 13); }
      else { A.eat(); ui.feed.eating = true; ui.feed.eatT = 0; spawnFloats(res.changes, 8, 13); }
    } else if (btn === "C") { ui.mode = "idle"; A.back(); }
  }

  function trainInput(btn) {
    var t = ui.train;
    if (btn === "C") { ui.mode = "idle"; A.back(); return; }
    if (btn === "B" && t.phase === "aim") {
      // success when the marker is near the centre of the bar
      var center = 0.5, dist = Math.abs(t.marker - center);
      var success = dist < 0.13;
      var res = G.train(success);
      spawnFloats(res.changes, 10, 12);
      t.result = success; t.phase = "result"; t.resultT = 0;
      if (success) A.happy(); else A.refuse();
    }
  }

  function statusInput(btn) {
    if (btn === "A") { ui.status.page = (ui.status.page + 1) % 3; A.move(); }
    else if (btn === "C" || btn === "B") { ui.mode = "idle"; A.back(); }
  }

  function settingsInput(btn) {
    var s = ui.settings;
    if (btn === "C") { ui.mode = "idle"; A.back(); return; }
    if (btn === "A") { s.sel ^= 1; s.confirm = false; A.move(); return; }
    if (btn === "B") {
      if (s.sel === 0) {
        var st = G.getState();
        G.setSound(!st.soundOn);
        A.select();
      } else {
        if (!s.confirm) { s.confirm = true; A.move(); }
        else { G.start(); ui.mode = "idle"; ui.cursor = 0; s.confirm = false; A.hatch(); }
      }
    }
  }

  function startBattle() {
    var stats = G.battleStats();
    var opp = DV.battle.pickOpponent(stats.power);
    ui.mode = "battle";
    ui.battle = {
      phase: "intro", t: 0, stats: stats, opp: opp,
      charge: 0, marker: 0, dir: 1,
      result: null, fightT: 0, ballX: 0,
    };
  }

  function battleInput(btn) {
    var b = ui.battle;
    if (btn === "C" && (b.phase === "intro" || b.phase === "result")) { ui.mode = "idle"; A.back(); return; }
    if (b.phase === "intro" && btn === "B") { b.phase = "charge"; A.select(); return; }
    if (b.phase === "charge" && btn === "B") {
      b.charge = b.marker;                 // lock current power
      b.result = DV.battle.simulate(b.stats, b.opp, b.charge);
      b.phase = "fight"; b.fightT = 0;
      A.attack();
      return;
    }
    if (b.phase === "result" && btn === "B") { ui.mode = "idle"; A.back(); }
  }

  function overlayInput(btn) {
    var o = ui.overlay;
    if (o.type === "death" && btn === "B") {
      G.start(); ui.overlay = null; ui.mode = "idle"; ui.cursor = 0; A.hatch();
    }
    // hatch / evolve overlays play out on their own
  }

  /* ==================================================================
     UPDATE
     ================================================================== */
  function update(dt) {
    G.advance(dt);
    if (ui.messageT > 0) ui.messageT -= dt;

    if (ui.overlay) { updateOverlay(dt); return; }
    updateFloaters(dt);

    var st = G.getState();
    // roaming pet
    if (!st.dead && !st.sleeping && st.speciesId !== "egg" && ui.mode === "idle") {
      ui.pet.x += ui.pet.dir * 10 * dt;
      if (ui.pet.x < 6) { ui.pet.x = 6; ui.pet.dir = 1; }
      if (ui.pet.x > R.W - 22) { ui.pet.x = R.W - 22; ui.pet.dir = -1; }
    }

    // attention alert beep (throttled)
    alertT -= dt;
    if (!st.dead && G.needsAttention() && st.speciesId !== "egg" && alertT <= 0) {
      A.alert(); alertT = 4;
    }

    if (ui.mode === "feed" && ui.feed.eating) {
      ui.feed.eatT += dt;
      if (ui.feed.eatT > 0.8) ui.feed.eating = false;
    }
    if (ui.mode === "train") updateTrain(dt);
    if (ui.mode === "battle") updateBattle(dt);
  }

  function updateTrain(dt) {
    var t = ui.train;
    if (t.phase === "aim") {
      t.marker += t.dir * 1.4 * dt;
      if (t.marker > 1) { t.marker = 1; t.dir = -1; }
      if (t.marker < 0) { t.marker = 0; t.dir = 1; }
    } else if (t.phase === "result") {
      t.resultT += dt;
      if (t.resultT > 0.9) { t.phase = "aim"; t.marker = 0; t.dir = 1; }
    }
  }

  function updateBattle(dt) {
    var b = ui.battle;
    if (b.phase === "intro") { b.t += dt; if (b.t > 1.6) b.phase = "charge"; }
    else if (b.phase === "charge") {
      b.marker += b.dir * 1.3 * dt;
      if (b.marker > 1) { b.marker = 1; b.dir = -1; }
      if (b.marker < 0) { b.marker = 0; b.dir = 1; }
    } else if (b.phase === "fight") {
      var prev = b.fightT;
      b.fightT += dt;
      var roundDur = 0.8, total = b.result.rounds.length * roundDur;
      // play a hit sound as each projectile lands
      var ri = Math.floor(b.fightT / roundDur);
      var pri = Math.floor(prev / roundDur);
      if (ri !== pri && b.result.rounds[pri]) {
        if (b.result.rounds[pri].playerHit || b.result.rounds[pri].oppHit) A.hit();
      }
      if (b.fightT >= total) {
        b.phase = "result";
        var rb = G.recordBattle(b.result.win);
        spawnFloats(rb.changes, 8, 13);
        if (b.result.win) A.win(); else A.lose();
      }
    }
  }

  function updateOverlay(dt) {
    var o = ui.overlay;
    o.t += dt;
    if (o.type === "hatch" && o.t > 2.4) ui.overlay = null;
    if (o.type === "evolve" && o.t > 2.8) ui.overlay = null;
    // death overlay persists until the player starts again
  }

  /* ==================================================================
     DRAW
     ================================================================== */
  function draw() {
    R.begin();
    if (ui.overlay) return drawOverlay();
    switch (ui.mode) {
      case "idle": drawIdle(); break;
      case "feed": drawFeed(); break;
      case "train": drawTrain(); break;
      case "battle": drawBattle(); break;
      case "status": drawStatus(); break;
      case "settings": drawSettings(); break;
    }
    drawFloaters();
    drawMessage();
  }

  function drawMenu() {
    for (var i = 0; i < MENU.length; i++) {
      var x = i * 8;
      if (i === ui.cursor) {
        R.rect(x, 0, 8, 8, true);          // highlighted cell
        R.sprite(MENU[i].icon, x, 0, { invert: true });
      } else {
        R.sprite(MENU[i].icon, x, 0);
      }
    }
  }

  function petSprite() { return S.creatures[G.species().sprite]; }

  function drawPet(x, y, flip) {
    var st = G.getState();
    var bob = st.sleeping ? 0 : Math.round(Math.sin(now / 200)) ;
    R.sprite(petSprite(), x, y + bob, { flip: flip });
  }

  function drawIdle() {
    var st = G.getState();
    drawMenu();

    var night = G.isNight();
    var baseY = 20;

    if (st.speciesId === "egg") {
      var wob = Math.round(Math.sin(now / 150)) ;
      R.sprite(S.creatures.egg, 24 + wob, baseY);
      R.textCenter("EGG", 40);
    } else {
      drawPet(Math.round(ui.pet.x), baseY, ui.pet.dir < 0);

      // poop piles
      for (var p = 0; p < st.poop; p++) {
        R.sprite(S.items.poop, 2 + p * 9, 39);
      }
      // sleeping Zzz
      if (st.sleeping) R.sprite(S.items.zzz, Math.round(ui.pet.x) + 14, baseY - 4);
      // sick mark
      if (st.sick) R.sprite(S.items.skull, Math.round(ui.pet.x) + 14, baseY - 2);
      // needs-attention "!" blink
      if (!st.sick && !st.sleeping && G.needsAttention() && Math.floor(now / 350) % 2 === 0) {
        R.text("!", Math.round(ui.pet.x) + 16, baseY - 2);
      }
      // selected action label
      R.textCenter(MENU[ui.cursor].label, 42);
    }

    if (night && !st.lightsOn) R.dim(0.5);
  }

  function drawFeed() {
    var st = G.getState();
    R.textCenter("FEED", 1);
    // pet on left facing right
    drawPet(6, 18, false);
    // the two choices
    var foodItem = ui.feed.sel === 0 ? S.items.meat : S.items.pill;
    var fx = ui.feed.eating ? Math.round(30 + 12 * (1 - ui.feed.eatT / 0.8)) : 40;
    if (!(ui.feed.eating && ui.feed.eatT > 0.55)) R.sprite(foodItem, fx, 20);

    R.text(ui.feed.sel === 0 ? "MEAT" : "VITAMIN", 8, 40);
    // quick meters
    R.hearts(2, 9, st.hunger, 4);
    if (Math.floor(now / 400) % 2 === 0) R.text(">", 0, 24); // hint cursor
  }

  function drawTrain() {
    var t = ui.train;
    R.textCenter("TRAIN", 1);
    drawPet(8, 16, false);
    // dumbbell prop
    R.sprite(S.icons.train, 30, 22);

    // timing bar
    var bx = 6, by = 40, bw = 52;
    R.rect(bx, by, bw, 6);
    // centre target zone
    var zoneW = Math.round(bw * 0.26), zx = bx + Math.round((bw - zoneW) / 2);
    R.rect(zx, by + 1, zoneW, 4, true);
    // moving marker
    var mx = bx + 1 + Math.round((bw - 3) * t.marker);
    R.rect(mx, by - 1, 2, 8, true);

    if (t.phase === "result") {
      R.textCenter(t.result ? "GREAT!" : "MISS", 30);
    }
  }

  function drawBattle() {
    var b = ui.battle;
    if (b.phase === "intro") {
      R.textCenter("BATTLE!", 12);
      R.text(b.stats.name, 2, 24);
      R.textCenter("VS", 32);
      R.text(b.opp.name, R.W - R.textWidth(b.opp.name) - 2, 40);
      return;
    }
    if (b.phase === "charge") {
      R.textCenter("CHARGE!", 2);
      drawPet(8, 16, false);
      R.sprite(S.creatures[b.opp.sprite], R.W - 24, 16, { flip: true });
      var bx = 6, by = 40, bw = 52;
      R.rect(bx, by, bw, 6);
      var fillW = Math.round((bw - 2) * b.marker);
      R.rect(bx + 1, by + 1, Math.max(0, fillW), 4, true);
      return;
    }
    // fight / result
    var px = 8, ox = R.W - 24, y = 18;
    var roundDur = 0.8;
    var r = Math.min(b.result.rounds.length - 1, Math.floor(b.fightT / roundDur));
    var local = (b.fightT - r * roundDur) / roundDur;
    var round = b.result.rounds[r] || {};

    var flashOpp = false, flashPlayer = false;
    if (b.phase === "fight") {
      if (local < 0.5) {
        var t1 = local / 0.5;
        R.sprite(S.items.ball, Math.round(px + 12 + (ox - px - 12) * t1), y + 6);
        if (t1 > 0.85 && round.playerHit) flashOpp = true;
      } else {
        var t2 = (local - 0.5) / 0.5;
        R.sprite(S.items.ball, Math.round(ox - (ox - px - 12) * t2), y + 6);
        if (t2 > 0.85 && round.oppHit) flashPlayer = true;
      }
    }

    R.sprite(petSprite(), px, y, { flip: false, invert: flashPlayer });
    R.sprite(S.creatures[b.opp.sprite], ox, y, { flip: true, invert: flashOpp });

    if (b.phase === "result") {
      R.textCenter(b.result.win ? "YOU WIN!" : "YOU LOSE", 2);
      R.textCenter(b.result.win ? ":)" : ":(", 40);
    } else {
      R.textCenter("FIGHT", 1);
    }
  }

  function drawStatus() {
    var st = G.getState();
    var sp = G.species();
    if (ui.status.page === 0) {
      R.text(sp.name, 2, 3);
      R.text(stageLabel(sp.stage), 2, 12);
      R.text("AGE:" + fmtAge(st.ageSec), 2, 26);
      R.text("WT:" + Math.round(st.weight), 2, 35);
    } else if (ui.status.page === 1) {
      R.text("HUNGER", 2, 3);
      R.hearts(2, 11, st.hunger, 4);
      R.text("STRENGTH", 2, 24);
      R.hearts(2, 32, st.strength, 4);
    } else {
      R.text("TRAIN:" + st.trainingCount, 2, 3);
      R.text("WIN:" + st.wins + "/" + st.battles, 2, 13);
      R.text("CARE X:" + st.careMistakes, 2, 23);
      R.text(st.sick ? "SICK!" : "HEALTHY", 2, 33);
    }
    R.text("A:NEXT", 2, 43);
  }

  function drawSettings() {
    var st = G.getState();
    R.textCenter("SETTINGS", 2);
    var rows = [
      "SOUND:" + (st.soundOn ? "ON" : "OFF"),
      ui.settings.confirm ? "RESET? B=YES" : "NEW GAME",
    ];
    for (var i = 0; i < rows.length; i++) {
      var y = 16 + i * 12;
      if (i === ui.settings.sel) R.text(">", 2, y);
      R.text(rows[i], 8, y);
    }
    R.text("C:BACK", 2, 42);
  }

  function drawMessage() {
    if (ui.messageT <= 0 || !ui.message) return;
    var w = R.textWidth(ui.message) + 4;
    var x = Math.round((R.W - w) / 2), y = 30;
    R.rect(x, y - 1, w, 8, true);
    // draw text as holes punched out of the filled banner
    drawInvertedText(ui.message, x + 2, y);
  }

  function drawInvertedText(str, x, y) {
    // text rendered as "empty" pixels punched out of a filled banner
    var font = S.font, cx = x;
    str = String(str).toUpperCase();
    for (var k = 0; k < str.length; k++) {
      var g = font[str[k]] || font[" "];
      for (var j = 0; j < 5; j++)
        for (var i = 0; i < 3; i++)
          if (g[j][i] === "#") R.pixel(cx + i, y + j, false);
      cx += 4;
    }
  }

  function drawOverlay() {
    var o = ui.overlay;
    if (o.type === "hatch") {
      // egg shakes, cracks with a flash, baby pops out
      if (o.t < 1.4) {
        var sh = Math.round(Math.sin(o.t * 30)) ;
        R.sprite(S.creatures.egg, 24 + sh, 16);
        R.textCenter("...", 38);
      } else if (o.t < 1.7) {
        R.flashInvert();
      } else {
        R.sprite(S.creatures.botamon, 24, 16);
        if (Math.floor(o.t * 4) % 2 === 0) R.sprite(S.items.star, 14, 12);
        R.sprite(S.items.star, 42, 14);
        R.textCenter("HATCHED!", 40);
      }
      return;
    }
    if (o.type === "evolve") {
      R.textCenter("DIGIVOLVE!", 2);
      var sp = DV.digimon.get(o.data.to);
      if (o.t < 1.9) {
        // strobing silhouette
        if (Math.floor(o.t * 10) % 2 === 0) R.flashInvert();
        else R.sprite(S.creatures[sp.sprite], 24, 16, { invert: false });
      } else {
        R.sprite(S.creatures[sp.sprite], 24, 16);
        R.sprite(S.items.star, 12, 14);
        R.sprite(S.items.star, 44, 16);
        R.textCenter(sp.name, 40);
      }
      return;
    }
    if (o.type === "death") {
      R.sprite(S.items.skull, 28, 14);
      R.textCenter("GAME OVER", 26);
      R.textCenter(deathLabel(o.data.reason), 34);
      if (Math.floor(now / 500) % 2 === 0) R.textCenter("B:NEW EGG", 43);
      return;
    }
  }

  /* -------------------- helpers -------------------- */
  function stageLabel(stage) {
    return ({
      egg: "EGG", baby: "BABY", intraining: "IN-TRAIN",
      rookie: "ROOKIE", champion: "CHAMPION", ultimate: "ULTIMATE", mega: "MEGA",
    })[stage] || stage.toUpperCase();
  }
  function deathLabel(r) {
    return ({ neglect: "NEGLECTED", illness: "GOT SICK", oldage: "OLD AGE" })[r] || "THE END";
  }
  function fmtAge(sec) {
    var m = Math.floor(sec / 60);
    if (m < 60) return m + "M";
    return Math.floor(m / 60) + "H" + (m % 60) + "M";
  }

  /* ==================================================================
     LOOP + WIRING
     ================================================================== */
  function frame(ts) {
    if (!now) now = ts;
    var dt = Math.min((ts - now) / 1000, 0.1); // clamp big gaps (tab throttle)
    now = ts;                                  // `now` (ms) doubles as the animation clock
    // A thrown error must never brick the whole game loop / freeze input.
    try { update(dt); draw(); }
    catch (err) { if (window.console) console.error("Digivice frame error:", err); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // ---- buttons (pointer) : A/B fire on press, C supports hold ----
  function bindBtn(id, btn) {
    var el = document.getElementById(id);
    var downAt = 0, longTimer = null;
    el.addEventListener("pointerdown", function (e) {
      e.preventDefault(); el.classList.add("pressed"); A.unlock();
      if (btn === "C") {
        downAt = performance.now();
        longTimer = setTimeout(function () { openSettings(); longTimer = "done"; }, 850);
      } else press(btn);
    });
    function end() {
      el.classList.remove("pressed");
      if (btn === "C") {
        if (longTimer && longTimer !== "done") { clearTimeout(longTimer); press("C"); }
        longTimer = null;
      }
    }
    el.addEventListener("pointerup", end);
    el.addEventListener("pointerleave", end);
    el.addEventListener("pointercancel", end);
  }
  bindBtn("btn-a", "A"); bindBtn("btn-b", "B"); bindBtn("btn-c", "C");

  // ---- keyboard ----
  var cKeyDown = 0;
  function wikiOpen() { return DV.wiki && DV.wiki.isOpen(); }
  window.addEventListener("keydown", function (e) {
    if (e.repeat || wikiOpen()) return;   // let the Field Guide handle keys while open
    var k = e.key.toLowerCase();
    if (k === "arrowleft" || k === "a") { e.preventDefault(); press("A"); }
    else if (k === "enter" || k === " " || k === "b" || k === "arrowup") { e.preventDefault(); press("B"); }
    else if (k === "escape" || k === "c") { cKeyDown = performance.now(); }
  });
  window.addEventListener("keyup", function (e) {
    if (wikiOpen()) return;
    var k = e.key.toLowerCase();
    if (k === "escape" || k === "c") {
      var held = performance.now() - cKeyDown;
      if (held >= 850) openSettings(); else press("C");
    }
  });

  // ---- persistence ----
  setInterval(G.save, 5000);
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) G.save();
    else if (G.sync) { G.sync(); }
  });
  window.addEventListener("pagehide", G.save);
  window.addEventListener("beforeunload", G.save);
})(window.DV);
