// Creatures: figures, AI state machines, faction behavior.
// Each creature teaches a lesson (bible): boar=spacing, wolf=positioning, black dog=aggression,
// ghoul=patience, bandit=human tactics, ghost=preparation, white werewolf=respect.
import * as THREE from '../lib/three.module.js';
import { G, clamp, dist2d, isNight, resolveCollisions, blockingBuilding } from './state.js';
import { POI } from './world.js';
import { makeCharacter, bx, cyl } from './models.js';

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

function makeGhost() {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0xcfe4ff, transparent: true, opacity: 0.55, emissive: 0x223355 });
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.8, 7), mat);
  body.position.y = 0.9; body.rotation.x = Math.PI; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 6), mat);
  head.position.y = 1.85; g.add(head);
  const light = new THREE.PointLight(0x88aaff, 3, 9);
  light.position.y = 1.6; g.add(light);
  return { group: g, legs: [], head };
}

// ---------- creature definitions ----------
export const CREATURE_DEFS = {
  boar:     { hp: 60,  dmg: 16, speed: 6.5, aggro: 11, atkR: 1.8, cd: 1.5, r: 0.7, food: 3,
              make: () => makeBeast(1.5, 1.0, 0.8, 0x5c4028, 0x4a3220), name: 'Boar' },
  wolf:     { hp: 45,  dmg: 12, speed: 8,   aggro: 26, atkR: 1.9, cd: 1.1, r: 0.55, food: 2,
              make: () => makeBeast(1.4, 0.95, 0.55, 0x6e6e78, 0x5a5a63), name: 'Wolf' },
  blackdog: { hp: 35,  dmg: 15, speed: 9.5, aggro: 32, atkR: 1.9, cd: 0.9, r: 0.5, food: 1, nocturnal: 'vanish',
              make: () => makeBeast(1.3, 0.9, 0.5, 0x14141a, 0x0c0c10), name: 'Black Dog' },
  ghoul:    { hp: 95,  dmg: 18, speed: 3.4, aggro: 20, atkR: 2.0, cd: 1.6, r: 0.6, food: 0, nocturnal: 'dormant',
              make: () => makeCharacter({ tunic: 0x4a5240, skin: 0x76866a, pants: 0x3e4636, boots: 0x76866a }),
              name: 'Ghoul' },
  rotghoul: { hp: 180, dmg: 26, speed: 2.6, aggro: 18, atkR: 2.2, cd: 2.0, r: 0.75, food: 0, nocturnal: 'dormant',
              make: () => makeCharacter({ tunic: 0x42502e, skin: 0x5c6a44, pants: 0x36422a, boots: 0x5c6a44, scale: 1.35 }),
              name: 'Rot Ghoul' },
  bandit:   { hp: 70,  dmg: 14, speed: 6.2, aggro: 19, atkR: 2.1, cd: 1.2, r: 0.55, food: 1, loot: { wood: 3, stone: 2 },
              make: () => {
                const h = makeCharacter({ tunic: 0x6b3a2a, skin: 0xc9a07a, hat: 'hood', hatColor: 0x2e2a26 });
                addSword(h.armPivot, 0x777d88, 0.7); return h;
              }, name: 'Bandit' },
  ghost:    { hp: 50,  dmg: 11, speed: 4.8, aggro: 30, atkR: 2.2, cd: 1.4, r: 0.5, food: 0, floats: true,
              nocturnal: 'vanish', noCollide: true, make: makeGhost, name: 'Ghost' },
  werewolf: { hp: 650, dmg: 38, speed: 8.5, aggro: 42, atkR: 2.9, cd: 1.5, r: 1.1, food: 20, boss: true,
              make: () => {
                const b = makeCharacter({ tunic: 0xdfe3ea, skin: 0xc9ced8, pants: 0xcfd4dc, boots: 0xb8bec9, scale: 2.1 });
                const fur = new THREE.MeshLambertMaterial({ color: 0xc9ced8 });
                for (const sx of [-1, 1]) {  // ears
                  const ear = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.28, 4), fur);
                  ear.position.set(sx * 0.12, 0.52, -0.02); b.head.add(ear);
                }
                bx(b.head, 0.16, 0.13, 0.2, fur, 0, 0.13, 0.22);   // snout
                bx(b.head, 0.05, 0.05, 0.02, new THREE.MeshBasicMaterial({ color: 0xcc2222 }), -0.08, 0.24, 0.16);
                bx(b.head, 0.05, 0.05, 0.02, new THREE.MeshBasicMaterial({ color: 0xcc2222 }), 0.08, 0.24, 0.16);
                return b;
              }, name: 'The White Werewolf' },
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
    // getting hit always draws aggro
    if (from) { this.target = from; this.state = 'chase'; }
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
    if (d.food || d.loot) {
      const items = Object.assign({}, d.loot || {});
      if (d.food) items.food = (items.food || 0) + d.food;
      dropLoot(this.pos.x, this.pos.z, items);
    }
    if (d.boss) {
      G.werewolfSlain = true;
      G.ui.log('★ THE WHITE WEREWOLF HAS FALLEN. The wilderness bows to no beast tonight. ★');
      G.ui.banner('LEGEND OF THE FRONTIER', 'You have slain the terror of the north.');
    }
  }

  // choose nearest living target among player + villagers (and guards)
  _acquireTarget() {
    const d = this.def;
    let best = null, bd = d.aggro;
    const consider = (t, x, z) => {
      const dd = dist2d(this.pos.x, this.pos.z, x, z);
      if (dd < bd) { bd = dd; best = t; }
    };
    if (G.player && !G.player.dead) consider(G.player, G.player.pos.x, G.player.pos.z);
    for (const v of G.villagers) if (!v.dead) consider(v, v.pos.x, v.pos.z);
    // raiders always know where the village is
    if (!best && this.raider) return { village: true };
    return best;
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
      if (dh > POI.werewolfDen.r + 26) {
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
        if ((b.type === 'torch' || b.type === 'campfire') && !b.destroyed &&
            dist2d(this.pos.x, this.pos.z, b.x, b.z) < 8) {
          this.hp -= dt * 14;
          if (this.hp <= 0) { this.die(); return; }
        }
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
      if (dd > d.atkR) {
        this._moveToward(gx, gz, dt, d.speed * (this.type === 'boar' ? 1.25 : 1)); // boars charge
      } else if (!this.target.village) {
        // in range: attack
        this._face(tp.x, tp.z);
        if (this.atkTimer <= 0) {
          this.atkTimer = d.cd;
          this.target.takeDamage(d.dmg, this);
          this._lunge();
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

    // walls delay enemies — if stuck against a building, smash it
    if (this.blockedTime > 1.6 && !d.noCollide) {
      const b = blockingBuilding(this.pos.x, this.pos.z, d.r);
      if (b && this.atkTimer <= 0) {
        this.atkTimer = d.cd;
        b.takeDamage(d.dmg * 0.8);
        this._lunge();
      }
    }

    this._settle(dt);
    if (d.boss) this._updateBossBar();
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
    // leg animation
    const sw = Math.sin(this.walkPhase) * 0.5;
    this.fig.legs.forEach((l, i) => { l.rotation.x = sw * (i % 2 ? 1 : -1); });
  }

  _updateBossBar() {
    const near = G.player && dist2d(this.pos.x, this.pos.z, G.player.pos.x, G.player.pos.z) < 55;
    G.ui.bossBar(near && !this.dead ? this : null);
  }
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
    G.resources[k] = (G.resources[k] || 0) + v;
    parts.push(`+${v} ${k}`);
  }
  G.ui.log(`Looted: ${parts.join(', ')}`);
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
  // ghouls haunt the ruins (dormant by day)
  for (let i = 0; i < 4; i++) {
    const a = i * 1.6, r = 10 + i * 4;
    spawn('ghoul', POI.ruins.x + Math.cos(a) * r, POI.ruins.z + Math.sin(a) * r);
  }
  spawn('rotghoul', POI.ruins.x, POI.ruins.z + 6);
  // bandits at their camp
  for (let i = 0; i < 4; i++) {
    const a = i * 1.7;
    spawn('bandit', POI.banditCamp.x + Math.cos(a) * 6, POI.banditCamp.z + Math.sin(a) * 6);
  }
  // the White Werewolf
  spawn('werewolf', POI.werewolfDen.x, POI.werewolfDen.z);
}

// called at dusk each night
export function nightSpawns() {
  // roaming ghouls near the ruins drift outward
  for (let i = 0; i < 2; i++) {
    const a = Math.random() * 6.28;
    spawn('ghoul', POI.ruins.x + Math.cos(a) * 40, POI.ruins.z + Math.sin(a) * 40);
  }
  // black dogs prowl the frontier
  if (Math.random() < 0.7) {
    const a = Math.random() * 6.28;
    spawn('blackdog', Math.cos(a) * 90, 10 + Math.sin(a) * 70);
  }
  // ghosts drift from the ruins — more as days pass
  const nGhost = Math.min(3, 1 + Math.floor(G.day / 4));
  for (let i = 0; i < nGhost; i++) {
    if (Math.random() < 0.6) {
      const a = Math.random() * 6.28;
      spawn('ghost', POI.ruins.x + Math.cos(a) * 25, POI.ruins.z + Math.sin(a) * 25);
    }
  }
}

// bandit raid: every 3rd night they march on the settlement
export function banditRaid() {
  const n = Math.min(6, 2 + Math.floor(G.day / 3));
  for (let i = 0; i < n; i++) {
    const x = -170 + i * 4, z = POI.roadZ + 6;
    const b = spawn('bandit', x, z, { raider: true });
    b.state = 'chase';
  }
  G.raidActive = true;
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
  if (count('bandit') < 3 && !G.raidActive) {
    spawn('bandit', POI.banditCamp.x + 5, POI.banditCamp.z);
  }
  if (count('ghoul') < 3) {
    const a = Math.random() * 6.28;
    spawn('ghoul', POI.ruins.x + Math.cos(a) * 12, POI.ruins.z + Math.sin(a) * 12);
  }
  if (!G.werewolfSlain && count('werewolf') < 1)
    spawn('werewolf', POI.werewolfDen.x, POI.werewolfDen.z);
  G.raidActive = false;
}

export function updateCreatures(dt) {
  for (let i = G.creatures.length - 1; i >= 0; i--) {
    const c = G.creatures[i];
    if (c.dead) { G.creatures.splice(i, 1); continue; }
    c.update(dt);
  }
}
