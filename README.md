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
| `Space` | Dodge step (short sidestep, i-frames) |
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

1. Leave the village. Fell **pine, oak, and birch** in the Dark Forest and the
   Southwood, mine stone in the **Rocky Hills** (west), gather wild cabbage and herbs
   in the meadows, hunt for meat and hide — then **cook the meat over your campfire**
   (hold `E`): a hot meal restores far more than raw rations.
2. Return home. Your campfire claims **60m of territory** — you can only build inside
   it (never on the King's Road). Watch Positions expand territory. Large buildings use
   **staged construction**: pay materials, a timber frame rises, hold `E` to hammer it up.
3. Deposit resources in **Storage Chests** — the settlement's shared stock. Villagers
   eat 1 food/day from it; crafting and repairs draw from it.
4. Recruit **wanderers** on the King's Road (needs a free bed; guards need a crafted
   weapon). Farmers plant corn/cabbage, harvest, and physically carry crops to storage.
   Guards patrol 25m around their post and never chase past 45m.
5. Survive the night. Ghouls wake in the **Cursed Ruins**, ghosts drift through walls
   (torchlight burns them — and if your storage holds **incense**, one stick burns at
   dusk and wards the whole settlement), wolves hunt your livestock — and every third
   night, **bandits raid** to loot your chests and torch your buildings.
6. React: the **village alert** escalates Calm → Suspicious → Under Attack → Recovery.
   Farmers flee to their shacks; guards respond by priority (villagers > livestock >
   gate > walls). Repair damage with the hammer; beat out fires before they spread.
7. Grow through data-driven stages: *Camp → Homestead → Village → Fortified
   Settlement* — from Village on, the Kingdom collects its food levy every 3 days and
   a **merchant carriage** halts on the King's Road at midday: barter hides and
   incense for seed corn, timber, stone, or second-hand weapons (`E` at the cart).

Press **Tab** for the settlement management panel: population, beds, food, alert level,
villager states and problems, farm states, warnings, taxes, defense, **groups**,
bound beasts, and the Red Moon countdown.

## The daily loop (the engine that keeps you playing)

Every dawn opens the **morning report** — food days remaining, who died in the
night, what burned, which farms are ready, when the taxes come, whether the moon
is turning. You make today's plan before you leave the gate, and the question is
always the same: *"Can I safely leave my village today?"*

- **Herbs** grow wild; the workbench turns 2 herbs into 1 **incense** — burned at
  dusk to ward the settlement, spent in binding rituals, precious in trade.
- **Bones** from your kills raise **Bone Totems** (fireless ghost wards); **monster
  parts** fetch a scholar's price at the cart.
- Guards between patrol legs inspect the walls and sharpen their blades. Stray too
  far at dusk and the game will tell you what you already feel: run for the lights.

**Taming — living companions, not equipment.** Beat a wolf or boar below a quarter
health and it breaks; hold `E` with 1 incense + 2 meat for the six-second **Binding
Ritual** (take a hit and it shatters). The bound beast has a name, eats a meat
ration from storage each dawn, and earns or loses **trust**: neglect makes it
sullen, then gone. Assign it as **Companion** (hunts at your heel) or **Defender**
(patrols the village).

**Everything is earned (weapons & tools).** You start with a wooden club and
calluses. The workbench turns your gathering into capability: an **axe** (chop
fast, +6 wood instead of a slow +3), a **pickaxe** (proper stone), a **skinning
knife** (+1 meat/+1 hide on every beast kill), the **iron sword** (nearly double
the club's bite), a **bow with crafted arrows** as real ammunition (`Q` switches
weapons; misses waste arrows), and **hide armor** you can see on your back
(-28% damage). Tools change the numbers; the numbers change your day.

**The Bandit Camp is an objective, not scenery.** Sword-bandits hold the tents
and **archers** hold the perimeter behind crude spike barricades — the outlaws'
own twisted mirror of your guard posts. Fight through them and **plunder the
stash** (bring an empty pack). A cleared camp cannot launch raids until the
outlaws regroup days later — clear it before a Red Moon and sleep easier.

**The Red Moon.** Announced one full day ahead — villagers mutter, you stockpile,
repair, craft incense, recall your groups. Then the sky turns crimson: merchants
flee, spawns multiply, ghosts shrug off torchlight (only incense holds), and the
White Werewolf ignores its territory and hunts wherever it pleases. Survive to
dawn and the next one, days later, will be worse. That is the deal.

## Living villagers & followers

Villagers are individuals, not units. Each has a name, a varied silhouette, and one
primary **trait** — *brave, cautious, hardworking, sociable, or grim* — that changes
when they flee, how they work, and what they say. They follow a readable **daily
schedule**: wake, work, a midday break, more work, an evening gathering at the
campfire, then home to bed. During downtime they pair up for short conversations and
**bark about recent events** — an attack, a death, the tax collector, ghosts in the
fog. Deaths leave an empty bed and a **grave** by the village, and some will stand
there mourning. When something suspicious stirs, civilians pause and look toward it
while **one guard investigates** and the rest hold coverage.

**Followers, not an army** (press `E` to talk to any villager):
- Make one villager your **companion** — they follow you, fight beside you, comment
  on the road, and go back to their job when dismissed.
- Form **groups** (Tab → Create Group): one Leader (a guard or a brave villager) and
  up to five members. You command only the Leader — *Follow Me, Wait Here, Defend This
  Area, Patrol, Attack My Target, Retreat, Return Home, Disband* — and members follow
  in loose, organic spacing (no marching formations). They navigate through gates,
  fight autonomously with pursuit limits, lag behind when wounded without breaking
  the group, and resume their posts when they get home.
- If a Leader falls, the bravest survivor takes command; if none can, the group
  scatters for home. Groups break and run from massed casualties or the terror of
  the White Werewolf.
- Taking guards away **matters**: the UI warns which posts go unmanned, and the
  settlement panel tracks guards on duty vs. away.

The far north belongs to the **White Werewolf**. It hunts the weak, feeds, and
withdraws — enter the monolith ring at your peril.

## The world

The valley is walled in by the **Grey Peaks** — a mountain ring that climbs to bare
rock and snow at the map's edge, with highlands rising behind the Rocky Hills. Three
lakes sink into their own basins, ringed with reeds: **Mirror Lake**, **Blackwater**,
and **Reedmere**. The forest is dense and mixed — dark pines crowd the north and the
endless **Southwood**, broadleaf oaks fill the Dark Forest, white-barked birches
scatter the meadows — and every one of them is timber (an axe fells 6 wood; bare
hands strip 3). Ferns, fallen logs, and dead trees fill the understory.

The sky is real: a **sun disc** rides the day arc, a **moon** climbs the night, and
seven hundred **stars** fade in with deep darkness. On a Red Moon the moon swells
crimson, the sky bleeds, and the stars dim behind the haze.

The **Cursed Ruins** are now a fallen keep — broken curtain wall, toppled pillars, a
shattered tower — and it *swarms* with the dead: ghouls and rot ghouls guard a
**reliquary** at its heart. Cut them all down and pry it open for incense, monster
parts, and bones; the dead gather again within days, and the ruins never stay safe.

## The map

```
        THE HUNTING GROUNDS (White Werewolf)
   BANDIT CAMP              CURSED RUINS
        THE NORTHERN MARCHES         (reliquary)
ROCKY HILLS    THE SETTLEMENT    DARK FOREST
  (stone)        (you, here)     (wood, wolves)
———————————— THE KING'S ROAD ————————————
   (wanderers, merchants)      ~ Blackwater ~
  ~ Reedmere ~   THE SOUTHWOOD   ~ Mirror Lake ~
        THE GREY PEAKS wall the world in
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
src/world.js      terrain (peaks/lakes), biomes & three timbers, ruins, sun/moon/stars
src/territory.js  settlement control radius, road buffer, boundary rings
src/storage.js    player/NPC/settlement inventories, chests, recipes
src/alerts.js     central village alert system (calm/suspicious/attack/recovery)
src/groups.js     group leader system: groups, commands, morale, succession, defense
src/entities.js   creature AI, faction structure priorities, raids, loot
src/buildings.js  parent building framework: placement, snapping, fire, repair
src/villagers.js  villager framework, farmer & guard loops, housing, food
src/livestock.js  animal pens, chickens/pigs/cows, production
src/progression.js data-driven settlement stages + Kingdom taxes
src/merchant.js   the merchant carriage: road travel, halt, barter trades
src/taming.js     binding ritual, tamed creatures, trust, companion/defender AI
src/player.js     third-person controller, camera, combat, interactions
src/ui.js         HUD, settlement panel, storage/craft/pen/recruit menus
src/main.js       bootstrap, main loop, daily events, save/load (v3)
```

*Design bible: "Kingdoms of the Cursed — Game Design Bible, Vol. I" by Alejandro Ruiz.*
