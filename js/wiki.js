/* ====================================================================
   wiki.js — the in-page Field Guide. Built entirely from DV.digimon so
   the evolution paths & conditions always match the live game logic.
   Sprite thumbnails are drawn straight from DV.sprites onto tiny canvases.
   ==================================================================== */
(function (DV) {
  "use strict";

  var D = DV.digimon, S = DV.sprites;
  var drawer = document.getElementById("wiki");
  var body = document.getElementById("wiki-body");
  var toggleBtn = document.getElementById("wiki-toggle");
  var closeBtn = document.getElementById("wiki-close");
  if (!drawer || !body) return;

  var STAGE_LABEL = {
    egg: "Egg", baby: "Baby", intraining: "In-Training",
    rookie: "Rookie", champion: "Champion", ultimate: "Ultimate", mega: "Mega",
  };
  var BAD = { numemon: 1, skullgreymon: 1 };

  function fmtTime(sec) {
    if (sec == null) return null;
    if (sec < 90) return sec + "s";
    return "~" + (Math.round((sec / 60) * 10) / 10) + " min";
  }

  // tiny LCD-style sprite thumbnail
  function thumb(spriteKey) {
    var spr = S.creatures[spriteKey];
    var c = document.createElement("canvas");
    c.width = spr.w; c.height = spr.h;
    var g = c.getContext("2d");
    g.fillStyle = "#aeba8c"; g.fillRect(0, 0, spr.w, spr.h);
    g.fillStyle = "#20300f";
    for (var j = 0; j < spr.h; j++)
      for (var i = 0; i < spr.w; i++)
        if (spr.px[j][i]) g.fillRect(i, j, 1, 1);
    return c;
  }

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  function badgeClass(sp) {
    if (sp.stage === "mega") return "stage-badge mega";
    if (BAD[sp.id]) return "stage-badge bad";
    return "stage-badge";
  }

  function dexCard(sp) {
    var card = el("div", "dex");
    card.appendChild(thumb(sp.sprite));

    var main = el("div", "dex-main");
    main.appendChild(el("span", "dex-name", sp.name +
      '<span class="' + badgeClass(sp) + '">' + STAGE_LABEL[sp.stage] + "</span>"));

    var t = fmtTime(sp.evolveAfter);
    if (sp.evolveAfter == null) {
      main.appendChild(el("div", "timer terminal", "★ Final form" +
        (sp.lifespan ? " — lives ~" + fmtTime(sp.lifespan) + " then passes of old age" : "")));
    } else {
      main.appendChild(el("div", "timer", "Digivolves after " + t + " in this stage:"));
    }

    sp.evolutions.forEach(function (e) {
      var target = D.get(e.to);
      var b = el("div", "branch",
        '<span class="arrow">→</span> <span class="target">' + (target ? target.name : e.to) +
        '</span> <span class="cond">— ' + e.text + "</span>");
      main.appendChild(b);
    });
    if (sp.stayText) main.appendChild(el("div", "stay", "✖ " + sp.stayText));

    card.appendChild(main);
    return card;
  }

  function build() {
    body.innerHTML = "";

    body.appendChild(el("h3", null, "How digivolution works"));
    body.appendChild(el("p", "lead",
      "Each form digivolves once it has spent long enough in its stage. <b>Which</b> form it " +
      "becomes branches on how you raised it — care mistakes, training, weight and battle record. " +
      "Conditions are checked in order; the first one that matches wins."));

    body.appendChild(el("h3", null, "What counts as a care mistake?"));
    var ul = el("ul");
    [
      "Leaving <b>Hunger</b> empty (no hearts) too long",
      "Leaving <b>Strength</b> empty too long",
      "Not cleaning up <b>poop</b>",
      "Leaving the <b>light on</b> at night when it wants to sleep",
    ].forEach(function (x) { ul.appendChild(el("li", null, x)); });
    body.appendChild(ul);
    body.appendChild(el("p", "lead",
      "<b>Train</b> from the menu to raise battle power, but training burns weight — " +
      "over-training while underfed leads to the “wrong” digivolutions."));

    body.appendChild(el("h3", null, "Stats & battle"));
    var su = el("ul");
    [
      "<b>STR</b> — physical attack power (Tackle, Pepper Breath…)",
      "<b>INT</b> — magic attack and healing skills",
      "<b>AGI</b> — turn order, dodging and critical hits",
      "<b>VIT</b> — max HP and defense",
    ].forEach(function (x) { su.appendChild(el("li", null, x)); });
    body.appendChild(su);
    body.appendChild(el("p", "lead",
      "Use <b>Train</b> and pick a stat to raise it. Stats also tick up slowly on their own " +
      "and from winning fights (EXP → levels). <b>Battles are auto-resolved</b> — open Battle and " +
      "watch your Digimon fight; <b>B</b> changes speed, <b>C</b> skips to the result."));

    body.appendChild(el("h3", null, "Evolution chart"));
    D.GUIDE_ORDER.forEach(function (id) {
      var sp = D.get(id);
      if (sp) body.appendChild(dexCard(sp));
    });

    body.appendChild(el("h3", null, "Quick paths"));
    var paths = el("ul");
    [
      "<b>Hero line:</b> Egg → Botamon → Koromon → Agumon → Greymon → MetalGreymon → WarGreymon",
      "<b>Neglect line:</b> … → Numemon → SkullGreymon (→ death, unless you turn it around)",
      "<b>Redemption:</b> Numemon can still reach MetalGreymon, and SkullGreymon can be tamed into WarGreymon",
    ].forEach(function (x) { paths.appendChild(el("li", null, x)); });
    body.appendChild(paths);

    body.appendChild(el("p", "wiki-note",
      "Tip: open this guide any time while playing — the game keeps running behind it."));
  }

  /* ---- open / close ---- */
  var open = false;
  function setOpen(v) {
    open = v;
    drawer.classList.toggle("open", v);
    drawer.setAttribute("aria-hidden", v ? "false" : "true");
    toggleBtn.style.display = v ? "none" : "";
  }
  toggleBtn.addEventListener("click", function () { setOpen(true); });
  closeBtn.addEventListener("click", function () { setOpen(false); });
  window.addEventListener("keydown", function (e) {
    if (open && e.key === "Escape") { e.preventDefault(); setOpen(false); }
  });

  build();
  DV.wiki = { isOpen: function () { return open; }, open: function () { setOpen(true); }, close: function () { setOpen(false); } };
})(window.DV);
