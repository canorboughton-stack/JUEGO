// Creatures: figures, AI state machines, faction behavior.
// Each creature teaches a lesson (bible): boar=spacing, wolf=positioning, black dog=aggression,
// ghoul=patience, bandit=human tactics, ghost=preparation, white werewolf=respect.
import * as THREE from '../lib/three.module.js';
import { G, clamp, dist2d, isNight, resolveCollisions, blockingBuilding, recordMemory } from './state.js';
import { POI } from './world.js';
import { makeCharacter, makeWerewolf, bx, cyl } from './models.js';
import { playerAdd } from './storage.js';
import { inTerritory } from './territory.js';

// ---------- low-poly figure builders ----------
export function makeBeast(len, hgt, wid, bodyC, headC) {
  const g = new THREE.Group();
  const bmat = new THREE.MeshLambertMaterial({ color: bodyC });
  const hmat = new THREE.MeshLambertMaterial({ color: headC });
  const body = new THREE.Mesh(new THREE.BoxGeometry(wid, hgt * 0.55, len), bmat);
  body.position.y = hgt * 0.72; body.castShadow = true; g.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(wid * 0.7, hgt * 0.42, len * 0.32), hmat);
  head.position.set(0, hgt * 0.92, -len * 0.58); head.castShadow = true; g.add(head);
  const lgeo = new THREE.BoxGeometry(wid * 0.22, hgt * 0.5, wid * 0.22);
  const legs = [];
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const l = new THREE.Mesh(lgeo, bmat);
    l.position.set(sx * wid * 0.32, hgt * 0.25, sz * len * 0.34);
    g.add(l); legs.push(l);
  }
  return { group: g, legs, head };
}

// Back-compat wrapper: the detailed rig from models.js with simple color mapping.
export function makeHumanoid(bodyC, headC, scale = 1) {
  return makeCharacter({ tunic: bodyC, skin: headC, scale });
}
export { makeCharacter };

export function addSword(armPivot, color = 0x9aa0ad, len = 0.9) {
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.07, len, 0.16),
    new THREE.MeshLambertMaterial({ color }));
  blade.position.set(0, -0.62 - len / 2 + 0.2, 0.12);
  armPivot.add(blade);
  return blade;
}

// Ghost (art bible §9): a FRAGMENTED human shape — incomplete face, cloth moving
// without wind, no legs, one drifting limb fragment. Not a floating bedsheet.
function makeGhost() {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0xc4d6e8, transparent: true,
    opacity: 0.42, emissive: 0x1a2436 });
  const dim = new THREE.MeshLambertMaterial({ color: 0x8fa2b8, transparent: true,
    opacity: 0.3, emissive: 0x101822 });
  // partial torso and one shoulder — the other side simply isn't there
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.3), mat);
  torso.position.set(0.06, 1.5, 0); torso.rotation.z = 0.12; g.add(torso);
  const shoulder = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.2, 0.28), mat);
  shoulder.position.set(-0.3, 1.78, 0); g.add(shoulder);
  // hanging grave-cloth strips of uneven length, moving without wind
  for (let i = 0; i < 5; i++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.5 + (i % 3) * 0.3, 0.06), dim);
    s.position.set(-0.22 + i * 0.12, 0.85 - (i % 3) * 0.12, (i % 2) * 0.08 - 0.04);
    s.rotation.z = (i - 2) * 0.12;
    g.add(s);
  }
  // a single detached forearm drifting apart from the body
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.42, 0.14), dim);
  arm.position.set(0.52, 1.25, 0.12); arm.rotation.z = -0.5; g.add(arm);
  // cowled head with an incomplete face: half is pale mask, half is void
  const head = new THREE.Group();
  head.position.set(0, 2.0, 0.02);
  const cowl = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.42, 0.36), mat);
  head.add(cowl);
  const mask = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.3, 0.04),
    new THREE.MeshLambertMaterial({ color: 0xe8eef6, transparent: true, opacity: 0.6 }));
  mask.position.set(-0.09, -0.02, 0.18); head.add(mask);
  const voidHalf = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.3, 0.04),
    new THREE.MeshBasicMaterial({ color: 0x05060a }));
  voidHalf.position.set(0.09, -0.02, 0.18); head.add(voidHalf);
  g.add(head);
  const light = new THREE.PointLight(0x6f8cb8, 2.5, 8);
  light.position.y = 1.6; g.add(light);
  return { group: g, legs: [], head };
}

// ---------- creature definitions ----------
export const CREATURE_DEFS = {
  boar:     { hp: 60,  dmg: 16, speed: 6.5, aggro: 11, atkR: 1.8, cd: 1.5, r: 0.7,
              loot: { meat: 3, hide: 1, bones: 1 }, tameable: true,
              make: () => {
                const b = makeBeast(1.5, 1.0, 0.8, 0x5c4028, 0x4a3220);
                const bone = new THREE.MeshLambertMaterial({ color: 0xd8cfb8 });
                for (const sx of [-1, 1]) {  // tusks
                  const t = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.24, 4), bone);
                  t.position.set(sx * 0.16, -0.1, 0.14); t.rotation.x = -0.7;
                  b.head.add(t);
                }
                bx(b.group, 0.14, 0.14, 1.2, new THREE.MeshLambertMaterial({ color: 0x3a2a18 }),
                  0, 1.02, 0);   // bristle ridge along the spine
                bx(b.group, 0.05, 0.3, 0.5, new THREE.MeshLambertMaterial({ color: 0x44301c }),
                  0.41, 0.7, 0.2); // old torn-hide scar on the flank
                return b;
              }, name: 'Boar' },
  wolf:     { hp: 45,  dmg: 12, speed: 8,   aggro: 26, atkR: 1.9, cd: 1.1, r: 0.55,
              loot: { meat: 1, hide: 1, bones: 1 }, prefs: ['livestock', 'villager', 'player'], tameable: true,
              make: () => {
                const b = makeBeast(1.5, 0.9, 0.45, 0x6e6e78, 0x5a5a63); // lean, hungry
                const fur = new THREE.MeshLambertMaterial({ color: 0x5a5a63 });
                for (const sx of [-1, 1]) {  // ears
                  const e = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.2, 4), fur);
                  e.position.set(sx * 0.12, 0.24, -0.05); b.head.add(e);
                }
                bx(b.group, 0.1, 0.1, 0.6, fur, 0, 0.75, 0.85).rotation.x = 0.5; // tail
                return b;
              }, name: 'Wolf' },
  blackdog: { hp: 35,  dmg: 15, speed: 9.5, aggro: 32, atkR: 1.9, cd: 0.9, r: 0.5, nocturnal: 'vanish',
              loot: { hide: 1, bones: 1, monsterpart: 1 }, prefs: ['livestock', 'villager', 'player'],
              make: () => {
                const b = makeBeast(1.3, 0.95, 0.55, 0x14141a, 0x0c0c10); // broader chest
                bx(b.group, 0.62, 0.45, 0.45, new THREE.MeshLambertMaterial({ color: 0x14141a }),
                  0, 0.72, -0.45);  // heavy chest mass
                const eye = new THREE.MeshBasicMaterial({ color: 0x8a2222 }); // slightly unnatural
                for (const sx of [-1, 1]) {
                  const e = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, 0.02), eye);
                  e.position.set(sx * 0.1, 0.06, -0.22); b.head.add(e);
                }
                bx(b.head, 0.04, 0.02, 0.16, new THREE.MeshLambertMaterial({ color: 0x3a3a42 }),
                  0.06, -0.08, -0.1); // scarred muzzle
                return b;
              }, name: 'Black Dog' },
  // ghouls are dead people changed by the land — clothing remnants, wrong posture
  ghoul:    { hp: 95,  dmg: 18, speed: 3.4, aggro: 20, atkR: 2.0, cd: 1.6, r: 0.6, nocturnal: 'dormant',
              loot: { incense: 1, bones: 2 },
              make: () => makeCharacter({ tunic: 0x4a5240, skin: 0x76866a, pants: 0x3e4636,
                boots: 0x76866a, stance: 'hunched', buildScale: 0.92 }),
              name: 'Ghoul' },
  rotghoul: { hp: 180, dmg: 26, speed: 2.6, aggro: 18, atkR: 2.2, cd: 2.0, r: 0.75, nocturnal: 'dormant',
              loot: { incense: 2, bones: 3, monsterpart: 1 },
              make: () => makeCharacter({ tunic: 0x42502e, skin: 0x5c6a44, pants: 0x36422a,
                boots: 0x5c6a44, scale: 1.35, stance: 'hunched', buildScale: 1.15 }),
              name: 'Rot Ghoul' },
  // bandits look assembled from stolen and scavenged gear — no two alike
  bandit:   { hp: 70,  dmg: 14, speed: 6.2, aggro: 19, atkR: 2.1, cd: 1.2, r: 0.55, loot: { wood: 3, stone: 2 },
              make: () => {
                const tunics = [0x6b3a2a, 0x4a3f36, 0x54452e, 0x3f4a52];
                const hats = ['hood', 'hood', 'helm', null]; // sometimes a stolen Kingdom helm
                const h = makeCharacter({
                  tunic: tunics[Math.floor(Math.random() * tunics.length)],
                  skin: 0xc9a07a,
                  hat: hats[Math.floor(Math.random() * hats.length)],
                  hatColor: 0x2e2a26,
                  kingdomPatch: Math.random() < 0.4,  // broken heraldry
                  pouch: true,
                  heightScale: 0.95 + Math.random() * 0.1,
                });
                addSword(h.armPivot, 0x777d88, 0.7); return h;
              }, name: 'Bandit' },
  // camp sentries with bows — the bandits' answer to your watch positions
  banditarcher: { hp: 50, dmg: 12, speed: 5.5, aggro: 24, atkR: 16, cd: 1.8, r: 0.5,
              ranged: true, keepDist: 9, loot: { wood: 2, hide: 1 },
              make: () => {
                const h = makeCharacter({ tunic: 0x4a4436, skin: 0xc9a07a, hat: 'hood',
                  hatColor: 0x33302a, pouch: true, kingdomPatch: Math.random() < 0.3 });
                const wood = new THREE.MeshLambertMaterial({ color: 0x5a4228 });
                bx(h.armL, 0.05, 0.5, 0.07, wood, 0, -0.35, 0.2, 0, 0, 0.35);
                bx(h.armL, 0.05, 0.5, 0.07, wood, 0, -0.72, 0.2, 0, 0, -0.35);
                return h;
              }, name: 'Bandit Archer' },
  ghost:    { hp: 50,  dmg: 11, speed: 4.8, aggro: 30, atkR: 2.2, cd: 1.4, r: 0.5, floats: true,
              loot: { incense: 2 }, nocturnal: 'vanish', noCollide: true, make: makeGhost, name: 'Ghost' },
  werewolf: { hp: 650, dmg: 38, speed: 8.5, aggro: 42, atkR: 2.9, cd: 1.5, r: 1.1, boss: true,
              loot: { meat: 10, hide: 5, bones: 5, monsterpart: 3 }, prefs: ['livestock', 'villager', 'player'],
              make: makeWerewolf, name: 'The White Werewolf' },
};

let nextId = 1;

export class Creature {
  constructor(type, x, z, opts = {}) {
    this.id = nextId++;
    this.type = type;
    const d = this.def = CREATURE_DEFS[type];
    this.hp = d.hp; this.maxHp = d.hp;
    this.home = { x, z };
    this.pos = new THREE.Vector3(x, 0, z);
    this.state = 'wander';
    this.target = null;         // player | villager
    this.wanderTo = null;
    this.atkTimer = 0; this.wanderTimer = 0; this.blockedTime = 0;
    this.raider = !!opts.raider; // raiders march on the village
    this.packId = opts.packId || 0;
    this.fig = d.make();
    this.mesh = this.fig.group;
    this.mesh.position.copy(this.pos);
    G.scene.add(this.mesh);
    this.walkPhase = Math.random() * 6;
    this.dead = false;
  }

  takeDamage(amount, from) {
    if (this.dead) return;
    this.hp -= amount;
    this.hitT = 0.18; // directional flinch (animation bible §13: readable hit reactions)
    this.hitDir = from && from.pos ? Math.sign((from.pos.x - this.pos.x) || 1) : 1;
    // taming loop: hurt a wild beast below a quarter health and it breaks —
    // it stops fighting and can be bound (hold E with 1 incense + 2 meat)
    if (this.def.tameable && !this.weakened && this.hp > 0 && this.hp <= this.maxHp * 0.25) {
      this.weakened = true;
      this.target = null;
      G.ui.log(`The ${this.def.name.toLowerCase()} is weakened — it can be bound! (E: ritual, needs 1 incense + 2 meat)`);
    }
    // getting hit always draws aggro
    if (!this.weakened && from) { this.target = from; this.state = 'chase'; }
    // pack tactics: hurting one wolf angers its pack
    if (this.packId) {
      for (const c of G.creatures)
        if (c.packId === this.packId && !c.dead) { c.target = from; c.state = 'chase'; }
    }
    if (this.hp <= 0) this.die(from);
  }

  die() {
    this.dead = true;
    G.scene.remove(this.mesh);
    const d = this.def;
    if (d.loot) {
      const items = Object.assign({}, d.loot);
      // a skinning knife makes every beast kill worth more (earned efficiency)
      if (items.meat && (G.playerInv.knife || 0) > 0) {
        items.meat += 1;
        items.hide = (items.hide || 0) + 1;
      }
      dropLoot(this.pos.x, this.pos.z, items);
    }
    if (d.boss) {
      G.werewolfSlain = true;
      G.ui.log('★ THE WHITE WEREWOLF HAS FALLEN. The wilderness bows to no beast tonight. ★');
      G.ui.banner('LEGEND OF THE FRONTIER', 'You have slain the terror of the north.');
    }
  }

  // choose a target respecting the creature's preferences (brief §11):
  // wolves/black dogs/werewolf prefer livestock; everything falls back to the living.
  _acquireTarget() {
    const d = this.def;
    const prefs = d.prefs || ['living'];
    for (const group of prefs) {
      let best = null, bd = d.aggro;
      const consider = (t, x, z) => {
        const dd = dist2d(this.pos.x, this.pos.z, x, z);
        if (dd < bd) { bd = dd; best = t; }
      };
      if (group === 'player' || group === 'living') {
        if (G.player && !G.player.dead) consider(G.player, G.player.pos.x, G.player.pos.z);
      }
      if (group === 'villager' || group === 'living') {
        for (const v of G.villagers) if (!v.dead && !v.inside) consider(v, v.pos.x, v.pos.z);
      }
      if (group === 'livestock') {
        for (const a of G.animals) if (!a.dead) consider(a, a.pos.x, a.pos.z);
      }
      if (best) return best;
    }
    // players count even for livestock-hunters when very close
    if (G.player && !G.player.dead &&
        dist2d(this.pos.x, this.pos.z, G.player.pos.x, G.player.pos.z) < d.aggro * 0.5)
      return G.player;
    return null;
  }

  _targetPos(t) {
    if (t.village) return { x: 0, z: 0 };
    return { x: t.pos.x, z: t.pos.z };
  }

  update(dt) {
    if (this.dead) return;
    const d = this.def;
    const night = isNight();

    // --- nocturnal handling ---
    if (!night) {
      if (d.nocturnal === 'vanish') {
        // ghosts & black dogs dissolve at dawn
        this.mesh.traverse(o => { if (o.material && o.material.opacity !== undefined) o.material.opacity = Math.max(0, (o.material.opacity || 1) - dt * 0.4); });
        this.hp -= dt * 30;
        if (this.hp <= 0) { this.dead = true; G.scene.remove(this.mesh); }
        return;
      }
      if (d.nocturnal === 'dormant' && !this.target) {
        // ghouls slump near their haunt during the day
        this.state = 'wander';
        this._moveToward(this.home.x, this.home.z, dt, d.speed * 0.4);
        this._settle(dt);
        return;
      }
    }

    // --- werewolf territory rules: it guards the north, doesn't chase to your door ---
    if (d.boss) {
      const dh = dist2d(this.pos.x, this.pos.z, this.home.x, this.home.z);
      // under the Red Moon the beast hunts wherever it pleases
      if (dh > POI.werewolfDen.r + 26 && !(G.redMoon && G.redMoon.active)) {
        this.target = null; this.state = 'return';
      }
      if (this.state === 'return') {
        this._moveToward(this.home.x, this.home.z, dt, d.speed);
        this.hp = Math.min(this.maxHp, this.hp + dt * 12);
        if (dh < 6) this.state = 'wander';
        this._settle(dt); this._updateBossBar(); return;
      }
    }

    // --- ghosts fear the light: torches & campfires burn them ---
    if (this.type === 'ghost') {
      for (const b of G.buildings) {
        if ((b.type === 'torch' || b.type === 'campfire' || b.type === 'totem') && !b.destroyed &&
            dist2d(this.pos.x, this.pos.z, b.x, b.z) < 8) {
          this.hp -= dt * (G.redMoon && G.redMoon.active ? 5 : 14);
          if (this.hp <= 0) { this.die(); return; }
        }
      }
      // burned incense wards the whole settlement: the dead keep their distance
      if (G.incenseWard && inTerritory(this.pos.x, this.pos.z)) {
        this.hp -= dt * 6;
        if (this.hp <= 0) { this.die(); return; }
        this.target = null;
        const away = Math.atan2(this.pos.x, this.pos.z); // outward from the village heart
        this._moveToward(this.pos.x + Math.sin(away) * 10, this.pos.z + Math.cos(away) * 10, dt, d.speed);
        this._settle(dt);
        return;
      }
    }

    // --- weakened beasts cower and limp away; they no longer fight ---
    if (this.weakened) {
      this.target = null;
      if (G.player && !G.player.dead) {
        const dp = dist2d(this.pos.x, this.pos.z, G.player.pos.x, G.player.pos.z);
        if (dp < 9 && dp > 3.2) {
          const away = Math.atan2(this.pos.x - G.player.pos.x, this.pos.z - G.player.pos.z);
          this._moveToward(this.pos.x + Math.sin(away) * 6, this.pos.z + Math.cos(away) * 6,
            dt, d.speed * 0.3);
        }
      }
      this._settle(dt);
      return;
    }

    // --- werewolf feeds and leaves (brief §11): hunt, kill, retreat ---
    if (d.boss && this.satiateTimer > 0) {
      this.satiateTimer -= dt;
      this.target = null;
      this._moveToward(this.home.x, this.home.z, dt, d.speed * 0.8);
      this.hp = Math.min(this.maxHp, this.hp + dt * 10);
      this._settle(dt); this._updateBossBar();
      return;
    }

    // --- bandit raiders steal from Storage Chests and retreat (brief §11) ---
    if (this.raider && !this.target && !this.dead) {
      if (this.stole) {
        // escape west along the road with the loot
        this._moveToward(-190, 40, dt, d.speed);
        if (this.pos.x < -185) { this.dead = true; G.scene.remove(this.mesh); }
        this._settle(dt);
        this.atkTimer -= dt;
        this.target = this._acquireTarget(); // fight back if intercepted
        return;
      }
      const chests = G.buildings.filter(b => b.type === 'chest' && !b.destroyed && b.built >= 1);
      let chest = null, cd2 = Infinity;
      for (const c of chests) {
        const dd = dist2d(this.pos.x, this.pos.z, c.x, c.z);
        if (dd < cd2) { cd2 = dd; chest = c; }
      }
      if (chest) {
        if (cd2 > 2.2) this._moveToward(chest.x, chest.z, dt, d.speed);
        else {
          // grab whatever is inside
          this.stealTick = (this.stealTick || 0) + dt;
          if (this.stealTick > 0.5) {
            this.stealTick = 0;
            let taken = 0;
            for (const res of Object.keys(chest.store)) {
              while (chest.store[res] > 0 && taken < 2) { chest.store[res]--; taken++; }
            }
            this.stolenLoad = (this.stolenLoad || 0) + taken;
            if (taken === 0 || this.stolenLoad >= 8) {
              this.stole = true;
              if (this.stolenLoad > 0) G.ui.log(`A bandit made off with ${this.stolenLoad} goods from your storage!`);
            }
          }
        }
      }
      // still react to defenders while heading for the chest
      this.atkTimer -= dt;
      this.target = this._acquireTarget();
      if (!chest && !this.target) {
        // no storage to rob: sweep toward the settlement heart, then withdraw
        const fire = G.buildings.find(b => b.type === 'campfire' && !b.destroyed);
        const cx = fire ? fire.x : 0, cz = fire ? fire.z : 0;
        if (dist2d(this.pos.x, this.pos.z, cx, cz) > 12) this._moveToward(cx, cz, dt, d.speed);
        else this.stole = true; // nothing worth taking
      }
      if (!this.target) {
        // blocked on the way in? smash through (walls delay, gates preferred below)
        this._smashIfBlocked(dt);
        this._settle(dt);
        return;
      }
    }

    // --- target acquisition ---
    this.atkTimer -= dt;
    if (!this.target || this.target.dead) {
      this.target = this._acquireTarget();
      this.state = this.target ? 'chase' : 'wander';
    } else {
      // lose interest when target flees far (except raiders/boss in territory)
      const tp = this._targetPos(this.target);
      const dd = dist2d(this.pos.x, this.pos.z, tp.x, tp.z);
      const leash = this.raider ? 999 : d.aggro * 1.8;
      if (dd > leash) { this.target = null; this.state = 'wander'; }
    }

    if (this.target) {
      const tp = this._targetPos(this.target);
      const dd = dist2d(this.pos.x, this.pos.z, tp.x, tp.z);
      // wolves try to flank: offset approach angle by pack index
      let gx = tp.x, gz = tp.z;
      if (this.packId && dd > 4) {
        const a = Math.atan2(this.pos.z - tp.z, this.pos.x - tp.x) + (this.id % 3 - 1) * 0.7;
        gx = tp.x + Math.cos(a) * 2.5; gz = tp.z + Math.sin(a) * 2.5;
      }
      if (d.ranged && !this.target.village && dd < d.atkR && dd > 2) {
        // archers hold distance and loose arrows
        if (dd < (d.keepDist || 8) - 2) {
          const away = Math.atan2(this.pos.x - tp.x, this.pos.z - tp.z);
          this._moveToward(this.pos.x + Math.sin(away) * 4, this.pos.z + Math.cos(away) * 4, dt, d.speed);
        }
        this._face(tp.x, tp.z);
        if (this.atkTimer <= 0) {
          this.atkTimer = d.cd;
          this.target.takeDamage(d.dmg, this);
          fireArrowFX(this.pos.clone().add(new THREE.Vector3(0, 1.4, 0)),
            new THREE.Vector3(tp.x, this.pos.y + 0.9, tp.z));
        }
      } else if (dd > d.atkR) {
        this._moveToward(gx, gz, dt, d.speed * (this.type === 'boar' ? 1.25 : 1)); // boars charge
      } else if (!this.target.village) {
        // in range: attack
        this._face(tp.x, tp.z);
        if (this.atkTimer <= 0) {
          this.atkTimer = d.cd;
          this.target.takeDamage(d.dmg, this);
          this._lunge();
          // the werewolf hunts, kills, feeds, and withdraws — no siege
          if (d.boss && (this.target.dead || this.target.hp <= 0)) {
            this.satiateTimer = 100;
            G.ui.log('The White Werewolf has fed... it melts back into the north.');
          }
        }
      } else {
        this.target = null; // reached empty village center
      }
    } else {
      // wander near home
      this.wanderTimer -= dt;
      if (!this.wanderTo || this.wanderTimer <= 0) {
        const a = Math.random() * Math.PI * 2, r = 4 + Math.random() * 12;
        this.wanderTo = { x: this.home.x + Math.cos(a) * r, z: this.home.z + Math.sin(a) * r };
        this.wanderTimer = 3 + Math.random() * 5;
      }
      if (dist2d(this.pos.x, this.pos.z, this.wanderTo.x, this.wanderTo.z) > 1.2)
        this._moveToward(this.wanderTo.x, this.wanderTo.z, dt, d.speed * 0.35);
    }

    // walls delay enemies — if stuck against a building while pursuing, smash it.
    // Creatures never siege idle structures (brief §11): only when they want through.
    if (this.target || this.raider) this._smashIfBlocked(dt);
    else this.lastBlockedGate = false;

    this._settle(dt);
    if (d.boss) this._updateBossBar();
  }

  _smashIfBlocked(dt) {
    const d = this.def;
    if (this.blockedTime <= 1.6 || d.noCollide) return;
    let b = blockingBuilding(this.pos.x, this.pos.z, d.r);
    if (!b) return;
    // prefer the gate over adjacent walls — it's the logical entry point
    if (!b.def.gate) {
      for (const g2 of G.buildings) {
        if (g2.def.gate && !g2.destroyed && dist2d(this.pos.x, this.pos.z, g2.x, g2.z) < 7) { b = g2; break; }
      }
    }
    this.lastBlockedGate = !!b.def.gate;
    if (this.atkTimer <= 0) {
      this.atkTimer = d.cd;
      b.takeDamage(d.dmg * 0.8);
      this._lunge();
      // bandits sometimes put buildings to the torch during raids
      if (this.type === 'bandit' && this.raider) b.ignite(0.1);
    }
  }

  _moveToward(x, z, dt, speed) {
    const dx = x - this.pos.x, dz = z - this.pos.z;
    const dd = Math.hypot(dx, dz);
    if (dd < 0.05) return;
    let nx = this.pos.x + (dx / dd) * speed * dt;
    let nz = this.pos.z + (dz / dd) * speed * dt;
    if (!this.def.noCollide) {
      const before = { x: nx, z: nz };
      const solved = resolveCollisions(nx, nz, this.def.r);
      nx = solved.x; nz = solved.z;
      const moved = dist2d(this.pos.x, this.pos.z, nx, nz);
      if (moved < speed * dt * 0.35) this.blockedTime += dt; else this.blockedTime = 0;
    }
    // creatures gently avoid stacking on each other
    for (const c of G.creatures) {
      if (c === this || c.dead) continue;
      const sx = nx - c.pos.x, sz = nz - c.pos.z;
      const sd = Math.hypot(sx, sz), min = this.def.r + c.def.r;
      if (sd < min && sd > 0.001) { nx += (sx / sd) * (min - sd) * 0.5; nz += (sz / sd) * (min - sd) * 0.5; }
    }
    this.pos.x = nx; this.pos.z = nz;
    this._face(x, z);
    this.walkPhase += dt * speed * 1.6;
  }

  _face(x, z) {
    this.mesh.rotation.y = Math.atan2(x - this.pos.x, z - this.pos.z) + (this.def.floats ? 0 : Math.PI);
    if (this.def.floats || this.fig.armPivot) this.mesh.rotation.y -= Math.PI; // humanoids/ghosts face forward
  }

  _lunge() {
    // brief visual pop on attack
    this.mesh.scale.setScalar((this.def.boss ? 1 : 1) * 1.12);
    setTimeout(() => { if (!this.dead) this.mesh.scale.setScalar(1); }, 130);
    if (this.fig.armPivot) {
      this.fig.armPivot.rotation.x = -2.1;
      setTimeout(() => { if (!this.dead) this.fig.armPivot.rotation.x = 0; }, 200);
    }
  }

  _settle(dt) {
    const y = G.world.h(this.pos.x, this.pos.z);
    this.pos.y = y + (this.def.floats ? 1.1 + Math.sin(performance.now() * 0.002 + this.id) * 0.3 : 0);
    this.mesh.position.copy(this.pos);
    // hit flinch: brief lean away from the blow
    if (this.hitT > 0) {
      this.hitT -= dt;
      this.mesh.rotation.z = Math.sin(Math.max(0, this.hitT) / 0.18 * Math.PI) * 0.16 * this.hitDir;
    } else this.mesh.rotation.z = 0;
    // leg animation
    const sw = Math.sin(this.walkPhase) * 0.5;
    this.fig.legs.forEach((l, i) => { l.rotation.x = sw * (i % 2 ? 1 : -1); });
  }

  _updateBossBar() {
    const near = G.player && dist2d(this.pos.x, this.pos.z, G.player.pos.x, G.player.pos.z) < 55;
    G.ui.bossBar(near && !this.dead ? this : null);
  }
}

// hostile arrow visuals (entities can't import villagers' FX — module cycle)
const hostileArrows = [];
function fireArrowFX(from, to) {
  const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xa89678 }));
  G.scene.add(line);
  hostileArrows.push({ line, ttl: 0.25 });
}

// ---------- loot ----------
const lootGeo = new THREE.BoxGeometry(0.55, 0.4, 0.45);
const lootMat = new THREE.MeshLambertMaterial({ color: 0x8a6a3a });

export function dropLoot(x, z, items) {
  const mesh = new THREE.Mesh(lootGeo, lootMat);
  mesh.position.set(x, G.world.h(x, z) + 0.2, z);
  mesh.rotation.y = Math.random() * 3;
  mesh.castShadow = true;
  G.scene.add(mesh);
  G.loots.push({ mesh, x, z, items, ttl: 120 });
}

export function updateLoots(dt) {
  for (let i = G.loots.length - 1; i >= 0; i--) {
    const l = G.loots[i];
    l.ttl -= dt;
    l.mesh.rotation.y += dt * 0.8;
    if (l.ttl <= 0) { G.scene.remove(l.mesh); G.loots.splice(i, 1); }
  }
}

export function pickupLoot(l) {
  const parts = [];
  for (const [k, v] of Object.entries(l.items)) {
    const got = playerAdd(k, v);
    if (got > 0) parts.push(`+${got} ${k}`);
  }
  if (parts.length) G.ui.log(`Looted: ${parts.join(', ')}`);
  G.scene.remove(l.mesh);
  G.loots.splice(G.loots.indexOf(l), 1);
}

// ---------- spawning ----------
export function spawn(type, x, z, opts) {
  const c = new Creature(type, x, z, opts);
  G.creatures.push(c);
  return c;
}

export function spawnInitialCreatures() {
  // wolf packs in the dark forest
  for (let p = 0; p < 2; p++) {
    const cx = 80 + p * 55, cz = -40 - p * 25, packId = p + 1;
    for (let i = 0; i < 3; i++) spawn('wolf', cx + i * 3 - 3, cz + (i % 2) * 3, { packId });
  }
  // boars: forest edge + hills
  const boarSpots = [[55, 5], [120, -10], [-70, 0], [-120, -20], [-90, 25], [150, -60]];
  for (const [x, z] of boarSpots) spawn('boar', x, z);
  // ghouls swarm the ruins (dormant by day) — the dead guard their reliquary
  for (let i = 0; i < 7; i++) {
    const a = i * 0.9, r = 6 + (i % 4) * 4;
    spawn('ghoul', POI.ruins.x + Math.cos(a) * r, POI.ruins.z + Math.sin(a) * r);
  }
  spawn('rotghoul', POI.ruins.x, POI.ruins.z + 6);
  spawn('rotghoul', POI.ruins.x - 5, POI.ruins.z - 4);
  // bandits at their camp: blades in the tents, archers on the edge
  if (G.day >= (G.banditCamp.clearedUntil || 0)) {
    for (let i = 0; i < 4; i++) {
      const a = i * 1.7;
      spawn('bandit', POI.banditCamp.x + Math.cos(a) * 6, POI.banditCamp.z + Math.sin(a) * 6);
    }
    spawn('banditarcher', POI.banditCamp.x + 10, POI.banditCamp.z + 4);
    spawn('banditarcher', POI.banditCamp.x - 9, POI.banditCamp.z - 6);
  }
  // the White Werewolf
  spawn('werewolf', POI.werewolfDen.x, POI.werewolfDen.z);
}

// called at dusk each night; mult > 1 on Red Moon nights (escalates each time)
export function nightSpawns(mult = 1) {
  // roaming ghouls near the ruins drift outward
  for (let i = 0; i < Math.round(2 * mult); i++) {
    const a = Math.random() * 6.28;
    spawn('ghoul', POI.ruins.x + Math.cos(a) * 40, POI.ruins.z + Math.sin(a) * 40);
  }
  // black dogs prowl the frontier
  for (let i = 0; i < Math.max(1, Math.round(mult)); i++) {
    if (Math.random() < 0.7 * mult) {
      const a = Math.random() * 6.28;
      spawn('blackdog', Math.cos(a) * 90, 10 + Math.sin(a) * 70);
    }
  }
  // ghosts drift from the ruins — more as days pass
  const nGhost = Math.min(3 + Math.round(mult), Math.round((1 + Math.floor(G.day / 4)) * mult));
  let ghostsRose = false;
  for (let i = 0; i < nGhost; i++) {
    if (Math.random() < 0.6) {
      const a = Math.random() * 6.28;
      spawn('ghost', POI.ruins.x + Math.cos(a) * 25, POI.ruins.z + Math.sin(a) * 25);
      ghostsRose = true;
    }
  }
  if (ghostsRose) recordMemory('ghost');
}

// how many bandits still hold the camp?
export function campBanditsAlive() {
  return G.creatures.filter(c => !c.dead && !c.raider &&
    (c.type === 'bandit' || c.type === 'banditarcher') &&
    dist2d(c.home.x, c.home.z, POI.banditCamp.x, POI.banditCamp.z) < 30).length;
}

// plunder the stash once the camp is cleared: loot + NO RAIDS until it repopulates
export function plunderBanditStash() {
  const haul = { wood: 12, stone: 8, hide: 4, corn: 6 };
  const parts = [];
  for (const [k, v] of Object.entries(haul)) {
    const got = playerAdd(k, v);
    if (got) parts.push(`+${got} ${k}`);
  }
  G.banditCamp.clearedUntil = G.day + 4;
  G.ui.log(`You plunder the bandit stash: ${parts.join(', ')}.`);
  G.ui.banner('CAMP CLEARED', 'No raids until the outlaws regroup.');
  recordMemory('raid');
}

// how many of the dead still guard the reliquary?
export function ruinsGhoulsAlive() {
  return G.creatures.filter(c => !c.dead &&
    (c.type === 'ghoul' || c.type === 'rotghoul') &&
    dist2d(c.pos.x, c.pos.z, POI.ruins.x, POI.ruins.z) < 45).length;
}

// pry open the reliquary once the dead are down: rare loot, and the horde returns
export function plunderReliquary() {
  const haul = { incense: 4, monsterpart: 2, bones: 6, stone: 5 };
  const parts = [];
  for (const [k, v] of Object.entries(haul)) {
    const got = playerAdd(k, v);
    if (got) parts.push(`+${got} ${k}`);
  }
  G.ruinsRelic.lootedUntil = G.day + 5;
  G.ui.log(`You pry open the reliquary: ${parts.join(', ')}.`);
  G.ui.banner('RELIQUARY PLUNDERED', 'The dead will gather again.');
  recordMemory('ghost');
}

// bandit raid: every 3rd night they march on the settlement —
// unless their camp lies cleared and empty
export function banditRaid() {
  if (G.day < (G.banditCamp.clearedUntil || 0)) {
    G.ui.log('The bandit camp lies empty — no raid comes tonight.');
    return;
  }
  const n = Math.min(6, 2 + Math.floor(G.day / 3));
  for (let i = 0; i < n; i++) {
    const x = -170 + i * 4, z = POI.roadZ + 6;
    const b = spawn('bandit', x, z, { raider: true });
    b.state = 'chase';
  }
  G.raidActive = true;
  recordMemory('raid');
  G.ui.log('⚔ BANDIT RAID! Torchlight approaches from the west road!');
  G.ui.banner('RAID', 'Bandits march on your settlement!');
}

// wildlife replenishes at dawn so the map never empties
export function dawnRespawns() {
  const count = t => G.creatures.filter(c => !c.dead && c.type === t).length;
  if (count('wolf') < 4) {
    const packId = 10 + G.day;
    for (let i = 0; i < 3; i++) spawn('wolf', 100 + i * 3, -55, { packId });
  }
  if (count('boar') < 4) {
    spawn('boar', -100 + Math.random() * 40, -10 + Math.random() * 30);
    spawn('boar', 70 + Math.random() * 60, -20 + Math.random() * 30);
  }
  if (G.day >= (G.banditCamp.clearedUntil || 0) && !G.raidActive) {
    if (count('bandit') < 3) spawn('bandit', POI.banditCamp.x + 5, POI.banditCamp.z);
    if (count('banditarcher') < 2) spawn('banditarcher', POI.banditCamp.x - 8, POI.banditCamp.z + 7);
  }
  // the ruins never stay safe — the dead always gather again
  while (count('ghoul') < 5) {
    const a = Math.random() * 6.28;
    spawn('ghoul', POI.ruins.x + Math.cos(a) * 12, POI.ruins.z + Math.sin(a) * 12);
  }
  if (count('rotghoul') < 1) spawn('rotghoul', POI.ruins.x, POI.ruins.z + 5);
  if (!G.werewolfSlain && count('werewolf') < 1)
    spawn('werewolf', POI.werewolfDen.x, POI.werewolfDen.z);
  G.raidActive = false;
}

export function updateCreatures(dt) {
  for (let i = hostileArrows.length - 1; i >= 0; i--) {
    hostileArrows[i].ttl -= dt;
    if (hostileArrows[i].ttl <= 0) { G.scene.remove(hostileArrows[i].line); hostileArrows.splice(i, 1); }
  }
  for (let i = G.creatures.length - 1; i >= 0; i--) {
    const c = G.creatures[i];
    if (c.dead) { G.creatures.splice(i, 1); continue; }
    c.update(dt);
  }
}
