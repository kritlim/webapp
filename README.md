# Digivice D-3 — Web Virtual Pet 🥚🦖

A browser remake of the classic **Digimon Digivice D-3** virtual pet, built to
match the original *playing system* and *dot-matrix LCD art style*. Hatch a
Digi-Egg, raise it through six evolution stages, train and battle it — and how
you care for it decides what it becomes.

No backend, no build step. Pure HTML/CSS/JS rendered on an HTML5 canvas, with
saves in `localStorage` (your Digimon keeps ageing even while the tab is
closed). Ready to deploy to **Vercel** as a static site.

![preview](tools/preview.png)

## Play

Open `index.html`, or run a local server:

```bash
npm run dev        # serves on http://localhost:3000
# or:  npx serve .
```

### Controls

| Button | Keyboard | Action |
| ------ | -------- | ------ |
| **A** | `←` / `A` | Move the icon cursor / change page |
| **B** | `Enter` / `Space` / `B` | Select / confirm |
| **C** | `Esc` / `C` | Back (**hold ≈1s for Settings**) |

The eight on-screen icons are the classic Digivice menu:
**Feed · Train · Battle · Status · Clean · Light · Heal · Settings.**

Tap **📖 Field Guide** (bottom-right) any time to open the in-page wiki — the
full evolution chart with the exact conditions for every branch. It's generated
from the same data the game uses, so it can never go out of sync. The game keeps
running behind it.

## The playing system

Just like the real device, this is a real-time care sim:

- **Care meters** — *Hunger* and *Strength* hearts drain over time. Feed
  **Meat** (hunger) and **Vitamins** (strength). Over-feeding adds weight and
  can upset its stomach.
- **Poop & hygiene** — it poops; leave the mess and you rack up *care mistakes*
  (and risk sickness).
- **Day / night** — at night it wants to sleep. Turn the **Light** off so it can
  rest; leaving the light on is a care mistake.
- **Sickness & injury** — filth, starvation or lost battles can make it ill.
  Use **Heal** (medicine) to cure it. Untreated illness can be fatal.
- **RPG stats** — **STR / AGI / INT / VIT** (plus derived HP & defense), shown
  on the Status screen. **Train** lets you pick a stat to raise; stats also grow
  slowly on their own and from winning fights (**EXP → levels**).
- **Training** — the **Train** timing minigame raises the chosen stat but burns
  weight. Over-training while underfed warps its evolution.
- **Auto-battle** — open **Battle** and the fight resolves itself turn-by-turn
  (HP bars, skills, damage numbers); just watch. **B** changes speed, **C**
  skips. Each species has its own **skills** (Pepper Breath, Nova Blast, Terra
  Force…) scaling off STR/INT, with AGI driving turn order, dodges and crits.

### Care-based digivolution

Which form you get branches on care mistakes, training, weight and win record —
faithful to how Digivices reward good (or punish bad) raising:

```
Digi-Egg → Botamon → Koromon ─┬─ Agumon ──┬─ Greymon ───┬─ MetalGreymon ─→ WarGreymon
                              └─ Gabumon ─┤             └─ SkullGreymon  (over-trained / neglected)
                                          └─ Numemon  (poor care)  ─→ … (redemption possible)
```

Neglect it badly enough and it can **die** (neglect, illness or old age) — then
you hatch a fresh egg.

## Deploy to Vercel

This is a static site, so deployment is a one-click import:

1. Push this repo to GitHub (already done if you're reading this on a branch).
2. Go to **vercel.com → Add New → Project** and import the repository.
3. Framework preset: **Other**. Leave Build Command empty and Output Directory
   as the repo root. Click **Deploy**.

…or from the CLI:

```bash
npm i -g vercel
vercel          # preview deploy
vercel --prod   # production
```

`vercel.json` is already included with sensible static-site headers.

## Project layout

```
index.html         # device shell (CSS) + the LCD <canvas>
css/style.css      # D-3 body, buttons, screen styling
js/sprites.js      # monochrome 16x16 creature & 8x8 icon pixel art + 3x5 font
js/audio.js        # WebAudio "blip" sound engine
js/digimon.js      # species data + the care-based evolution tree
js/game.js         # the simulation (care, day/night, sickness, ageing, death)
js/battle.js       # battle resolution
js/render.js       # low-level dot-matrix LCD drawing
js/main.js         # input, menu UI, scenes & game loop
tools/preview.js   # dev-only: renders a PNG preview of the LCD (no browser needed)
```

> Fan project for fun & learning. *Digimon* and *Digivice* are trademarks of
> their respective owners; this is not affiliated with or endorsed by them.
