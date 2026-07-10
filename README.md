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
   **Rocky Hills** (west), gather wild cabbage in the meadows, hunt for meat and hide.
2. Return home. Your campfire claims **60m of territory** — you can only build inside
   it (never on the King's Road). Watch Positions expand territory. Large buildings use
   **staged construction**: pay materials, a timber frame rises, hold `E` to hammer it up.
3. Deposit resources in **Storage Chests** — the settlement's shared stock. Villagers
   eat 1 food/day from it; crafting and repairs draw from it.
4. Recruit **wanderers** on the King's Road (needs a free bed; guards need a crafted
   weapon). Farmers plant corn/cabbage, harvest, and physically carry crops to storage.
   Guards patrol 25m around their post and never chase past 45m.
5. Survive the night. Ghouls wake in the **Cursed Ruins**, ghosts drift through walls
   (torchlight burns them), wolves hunt your livestock — and every third night,
   **bandits raid** to loot your chests and torch your buildings.
6. React: the **village alert** escalates Calm → Suspicious → Under Attack → Recovery.
   Farmers flee to their shacks; guards respond by priority (villagers > livestock >
   gate > walls). Repair damage with the hammer; beat out fires before they spread.
7. Grow through data-driven stages: *Camp → Homestead → Village → Fortified
   Settlement* — and from Village on, the Kingdom collects its food levy every 3 days.

Press **Tab** for the settlement management panel: population, beds, food, alert level,
villager states and problems, farm states, warnings, taxes.

The far north belongs to the **White Werewolf**. It hunts the weak, feeds, and
withdraws — enter the monolith ring at your peril.

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
src/models.js     character rig + medieval architecture helpers (timber, thatch, logs)
src/state.js      shared game state, collision helpers (gates pass friendlies)
src/world.js      terrain, map zones, vegetation, POIs, day/night
src/territory.js  settlement control radius, road buffer, boundary rings
src/storage.js    player/NPC/settlement inventories, chests, recipes
src/alerts.js     central village alert system (calm/suspicious/attack/recovery)
src/entities.js   creature AI, faction structure priorities, raids, loot
src/buildings.js  parent building framework: placement, snapping, fire, repair
src/villagers.js  villager framework, farmer & guard loops, housing, food
src/livestock.js  animal pens, chickens/pigs/cows, production
src/progression.js data-driven settlement stages + Kingdom taxes
src/player.js     third-person controller, camera, combat, interactions
src/ui.js         HUD, settlement panel, storage/craft/pen/recruit menus
src/main.js       bootstrap, main loop, daily events, save/load (v2)
```

*Design bible: "Kingdoms of the Cursed — Game Design Bible, Vol. I" by Alejandro Ruiz.*
