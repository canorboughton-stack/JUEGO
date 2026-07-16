# Kingdoms of the Cursed — Art Production Bible

Production decisions, not inspiration. Each family below carries: visual target,
gameplay purpose, technical budget, prototype implementation (what the Three.js
build already does — **[LIVE]** = shipped in `src/`), UE5 path, and definition of
done. Style law: **grounded stylized medieval realism in a cursed frontier** —
readable silhouettes first, atmosphere doing half the work, warmth reserved for fire.

The one-line test for every asset: *does it make the refuge feel more fragile,
more human, or more worth defending?* If not, cut it.

---

## 0. Global budgets & rules

| Domain | Prototype (Three.js) | UE5 target |
|---|---|---|
| Visible trees | 1–2k via `InstancedMesh` (2 draws/species) | HISM + impostor LOD3 |
| Ground clutter | ~2.5k instances, zero colliders | HISM, density masks |
| Character tris | box-rig (≤500) | 8–15k, 3 LODs |
| Creature tris | box-rig (≤600) | 10–20k boss 30k, 3 LODs |
| Buildings | ≤80 boxes/cyls each | 5–20k, trim sheets, 3 LODs |
| Dynamic lights | sun + moon + ≤10 points | Lumen + budgeted points |
| Texture budget | vertex/instance color only | 1–2k tilables + trim sheets |

Acceptance gates (art brief §22): readable at 30m; collision ≤ visual footprint;
never traps AI (verified by the group-navigation test suite); silhouette survives
night lighting; interaction point discoverable without UI.

---

## 1. Lighting (family: DONE to prototype standard) **[LIVE]**

**Target:** light is scarce, earned, meaningful. Cool desaturated world;
warm = fire = safety. Data table `World.SKY` (`src/world.js`) is the single
source of truth — port it to a UE5 curve asset 1:1.

| Key | Values in build | Reads as |
|---|---|---|
| Dawn 0.25–0.30 | cool pale sky, warm-tinted sun 0.7→1.4, fog opens | calm but uncertain |
| Day 0.42–0.58 | neutral-cool sun 2.2 `#f2efe6`, fog 65/340 | harsh, not warm |
| Dusk 0.70–0.81 | warm horizon `#a8683e` vs cool fog `#6d6272` | go home |
| Night | sky `#060911`, hemi 0.075–0.09, fog 16/112–122 | fire-only safety; silhouettes preserved, never crushed |
| Red Moon | 85% crimson lerp, moon ×1.45, ash motes, fires ×1.35 | the deal |

Per-source flicker: torch gutter 1.0, campfire 0.55, lanterns 0.4, each phased by
building id. Red-moon **buildup**: warned-day daylight pales (−18% sun, hazier
fog), torches light early from dusk 0.68, ash falls all night (240 pts, never
screen-filling). Ghost light: cold `#6f8cb8`, intensity tied to manifestation.
**UE5:** directional + skylight driven by the same curves; Niagara ash; post
blend ≤0.3 saturation shift on red moon. **DoD:** a blind screenshot at any
clock time is identifiable to ±0.05 time-of-day; night village shot shows ≥3
distinct light pools; red moon readable but never flat red. ✅ verified by
`art-shots.mjs`.

## 2. Ground & terrain (family: DONE to prototype standard) **[LIVE]**

**Target:** the ground is never one flat green. Zone-tinted terrain (meadow /
forest floor / hills / peaks-rock-snow / road / lakebed) + wear layer that
records life: worn footpath village→road, wheel ruts + gravel on the King's
Road, trampled rings under every building, scorch under fires, dark soil in
farm plots. Clutter: clumped grass patches (5 biome palettes), ferns, saplings,
mushrooms near dead wood, leaf-litter logs. All instanced, all non-colliding.
**UE5:** landscape layers + RVT blend, decal ruts, HISM clutter with density
masks that zero out on roads/nav-corridors/foundations. **DoD:** standing
anywhere, ≥3 ground tones in frame; footpaths visibly connect fire→road;
clutter never blocks a doorway (nav-tested). ✅

## 3. Tree kit (family: DONE to prototype standard) **[LIVE]**

Species: pine (+dark tall deep-forest spruce population), oak, birch
(lake-shore biased), young saplings, dead pines (north), fallen logs, stumps.
**Cursed trees** ring the ruins/werewolf ground: crooked stacked-segment trunks,
near-black bark, pale sick growths, no glow. **Landmark trees:** THE ELDER OAK
(east meadow, 8m canopy), THE SPLIT PINE (Southwood mouth, lightning-charred
fork), THE HANGING TREE (bandit road, empty iron cage) — unique silhouettes,
navigation anchors.

Gameplay contract per harvestable tree (`world.trees[i]`): position, species,
alive, respawn timer, per-instance color, collider, **stump persistence** while
felled, **regrowth animation** (sapling scales to full over ~5s), axe-gated
yield, NPC-harvest variant. Save/load: registry indexes are deterministic.
**UE5:** per-species SM with 3 silhouette + 2 trunk variants, wind (strong
pine / medium oak / subtle dead), cut→stump actor swap. **DoD:** chop any tree →
stump remains; return later → visible regrowth; each species identifiable at
40m; landmarks visible ≥80m. ✅ (variants/wind = UE5 phase)

## 4. Roads (family: DONE to prototype standard) **[LIVE]**

King's Road: 8m corridor, build-forbidden buffer, wheel ruts (terrain-following
segments), gravel patches, leaning mile markers, signposts, lantern posts at the
settlement turn-off (lit at dark), one broken cart (ambush storytelling).
Secondary = worn footpath standard (village path). Forest paths = UE5 phase
with spline decals. **DoD:** at night, the road home is findable by lantern +
compass ⌂ alone. ✅

## 5. Settlement buildings (family: prototype standard, dressing ongoing)

Standard per building (all **[LIVE]** unless noted): footprint + collider,
staged construction (frame → hammer), fire response + extinguish, repair,
**damage states** — missing dark boards <60% hp, drifting smoke <30%, never
just darkening — trampled ground ring, save id, UI slot. Dressed so far: farm
(fence, furrows, scarecrow, barrel, leaning hoe), pen (trough, lean-to), gate +
watchtower (ragged kingdom banners), watchtower platform (arrow crate, bucket,
stool, torch bracket = visible gameplay sockets). Palisade: sharpened logs.
**Next dressing pass:** firewood stack, chopping block, drying herbs, warning
bell, grain sacks at chest, claw marks on walls after raids.
**DoD per building:** recognizable at 40m; damage % readable at a glance;
construction stage readable; props never in the door line.

## 6. Characters (family: prototype standard) **[LIVE]**

Shared box-rig (`makeCharacter`) with modular options = the UE5 modular kit
contract: silhouette scale (height/build), tunic/pants/boots colors, hair/hat
(straw/hood/helm), apron, reinforcement, pouch, kingdom patch. **Tools always
visible:** woodcutter axe, stonecutter pick, guard sword + round back shield,
bows on archers. Faction language: villagers = muted earth; guards = grey-blue
+ leather + helm; **Kingdom = crimson/steel uniform (bailiffs)**; bandits =
mismatched scavenge + broken heraldry; ghouls = grave-green flesh, hunched.
**UE5:** one body, modular part sockets (head/hair/torso×2/legs/boots/belt/
pouch/accessory), 3 face variants/gender minimum, dirt masks. **DoD:**
profession identifiable from silhouette alone at 25m in dusk light. ✅

## 7. Creatures (family: prototype standard) **[LIVE]**

Direction locks (brief §17): wolf lean/natural, pack-readable. **Black Dog =
corrupted feral dog** — heavy chest, dropped ears, heavy muzzle, scarred face,
dim red eyes only (no demon ribs, no fire). Boar heavy, bristle ridge, charge
silhouette. Ghoul = former human, wrong posture (hunched rig, clothing
remnants). Rot ghoul = mass, not gore. **Ghost = fragmented shape** — 0.22
opacity drifting, **gathers to 0.62 when it hunts**, cold light swells with it;
burned by torchlight, warded by incense. Werewolf: lean, long-limbed, pale,
boss bar, territorial. **DoD:** each creature identifiable as threat-type in
<1s at night; weakened/tameable state visibly cowering; ghost invisible-ish
until it matters. ✅

## 8. Red Moon event arc **[LIVE]**

Warning dawn (banner + barks + stockpile pressure) → pale hazy warned day →
torches lit early at eve → crimson night: swollen moon, red-stained fog, ash
motes, fires burn brighter, spawns ×(1.6+0.4·count), ghosts shrug torchlight,
werewolf leash off → survivor dawn (banner, next one worse). **DoD:** player
can state "red moon is tomorrow/tonight" from visuals alone, no UI. ✅

---

## 9. Build order & next slices

Done: Phase A (ground/trees/roads/fog/lighting) · Phase B core dressing ·
Phase C readability pass · Phase D direction locks · Phase E red-moon arc.

Next, in order — one family to standard before the next:
1. **Settlement clutter sockets** (firewood, bell, herb lines, claw marks post-raid).
2. **Weather states** (overcast day variant, rain pass: darker albedo, puddle discs, muffled audio).
3. **Guard tiers** (visual gear steps tied to settlement stage — brief §Guards).
4. **Hunter/Herbalist/Blacksmith villager sets** (need their gameplay loops first — art follows systems, never leads them).
5. **Marsh biome** for Reedmere (reeds exist; add mist layer + swamp grass palette).
