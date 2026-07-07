# Kingdoms of the Cursed

A third-person survival settlement game set in a dark medieval frontier. Build, protect,
and expand a village while surviving intelligent creatures, bandit raids, restless ghosts,
and the White Werewolf that rules the north.

> *The player is not the chosen one. Respect must be earned. Nothing is given. Everything is built.*

Built with vanilla JavaScript + [Three.js](https://threejs.org) (vendored in `lib/`).
No build step, no external network required.

## Run it

Any static file server works:

```bash
# from the repo root
python3 -m http.server 8080
# or
npx serve .
```

Then open http://localhost:8080 in a browser. Click **NEW SETTLEMENT**, then click the
screen to lock the mouse.

## Controls

| Input | Action |
|---|---|
| `W A S D` | Move (camera-relative) |
| Mouse | Camera |
| `Shift` | Sprint (drains stamina) |
| `Space` | Dodge roll (i-frames) |
| Left mouse | Attack / place building |
| Right mouse (hold) | Block |
| `E` (hold) | Gather / recruit / loot |
| `F` | Eat food |
| `B` | Toggle build menu (`1–7` select, `R` rotate) |
| `X` | Demolish nearest building |
| `H` | Help panel |
| `K` | Save game (localStorage) |

## The core loop

**Explore → Survive → Build → Defend**

1. Leave the village. Chop trees in the **Dark Forest** (east), mine stone in the
   **Rocky Hills** (west), pick berries in the meadows.
2. Return home. Build walls, torches, farms, houses, guard posts, storage.
3. Recruit **wanderers** traveling the King's Road (you need house beds). They become
   farmers (grow food) or guards (defend the settlement).
4. Survive the night. Ghouls wake in the **Cursed Ruins**, ghosts drift out (torchlight
   burns them), black dogs prowl — and every third night, **bandits raid** from the west.
5. Grow: *Lone Campfire → Outpost → Village → Fortified Frontier Settlement*.

The far north belongs to the **White Werewolf**. Enter the monolith ring at your peril.

## The map

```
        THE HUNTING GROUNDS (White Werewolf)
   BANDIT CAMP              CURSED RUINS
        THE NORTHERN MARCHES
ROCKY HILLS    THE SETTLEMENT    DARK FOREST
  (stone)        (you, here)       (wood)
———————————— THE KING'S ROAD ————————————
              (wanderers, merchants)
```

## Creature design (each teaches a lesson)

| Creature | Lesson |
|---|---|
| Boar | Spacing — it charges |
| Wolf | Positioning — packs flank |
| Black Dog | Aggression — night hunter, fast and frail |
| Ghoul | Patience — slow, tanky, dormant by day |
| Rot Ghoul | Resource management — a wall of rot |
| Bandit | Human tactics — armed, raids in numbers |
| Ghost | Preparation — build torches or suffer |
| White Werewolf | Respect — territorial apex. Bring everything. |

## Project layout

```
index.html        shell + HUD markup/styles
lib/three.module.js  vendored Three.js (r160)
src/state.js      shared game state, collision helpers
src/world.js      terrain, map zones, vegetation, POIs, day/night
src/entities.js   creature figures, AI, spawning, loot
src/buildings.js  building defs, placement, settlement tiers
src/villagers.js  wanderers, recruitment, farmer/guard jobs
src/player.js     third-person controller, camera, combat
src/ui.js         HUD updates
src/main.js       bootstrap, main loop, events, save/load
```

*Design bible: "Kingdoms of the Cursed — Game Design Bible, Vol. I" by Alejandro Ruiz.*
