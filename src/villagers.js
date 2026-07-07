// Villagers & wanderers. Wanderers travel the King's Road at dawn; recruit them (E)
// if you have beds. Villagers take jobs: farmer (works farms) or guard (defends).
import * as THREE from '../lib/three.module.js';
import { G, clamp, dist2d, resolveCollisions } from './state.js';
import { makeHumanoid, addSword } from './entities.js';
import { POI } from './world.js';

const NAMES = ['Aldric', 'Berta', 'Cedric', 'Duna', 'Edda', 'Falk', 'Greta', 'Hamon',
  'Isolde', 'Jorun', 'Kessa', 'Lothar', 'Mira', 'Nolan', 'Ottila', 'Piers'];
let nameIdx = 0;

// ---------- wanderers (recruitable) ----------
export class Wanderer {
  constructor(fromWest) {
    this.name = NAMES[nameIdx++ % NAMES.length];
    this.pos = new THREE.Vector3(fromWest ? -192 : 192, 0, POI.roadZ);
    this.dir = fromWest ? 1 : -1;
    this.fig = makeHumanoid(0x7a7060, 0xc9a07a);
    this.mesh = this.fig.group;
    G.scene.add(this.mesh);
    this.walkPhase = 0;
    this.gone = false;
  }
  update(dt) {
    this.pos.x += this.dir * 2.6 * dt;
    // drift toward the road line
    this.pos.z += (POI.roadZ - this.pos.z) * dt * 0.5;
    if (Math.abs(this.pos.x) > 194) { this.remove(); return; }
    this.pos.y = G.world.h(this.pos.x, this.pos.z);
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    this.walkPhase += dt * 5;
    const sw = Math.sin(this.walkPhase) * 0.5;
    this.fig.legs.forEach((l, i) => { l.rotation.x = sw * (i % 2 ? 1 : -1); });
  }
  remove() {
    this.gone = true;
    G.scene.remove(this.mesh);
    const i = G.wanderers.indexOf(this);
    if (i >= 0) G.wanderers.splice(i, 1);
  }
}

export function spawnWanderer() {
  G.wanderers.push(new Wanderer(Math.random() < 0.5));
}

export function updateWanderers(dt) {
  for (let i = G.wanderers.length - 1; i >= 0; i--) G.wanderers[i].update(dt);
}

// ---------- villagers ----------
export class Villager {
  constructor(name, x, z, role = null) {
    this.name = name || NAMES[nameIdx++ % NAMES.length];
    this.pos = new THREE.Vector3(x, 0, z);
    this.hp = 90; this.maxHp = 90;
    this.dead = false;
    this.role = null;       // 'farmer' | 'guard' | null (idler)
    this.job = null;        // assigned building
    this.atkTimer = 0;
    this.walkPhase = 0;
    this.wanderTo = null; this.wanderTimer = 0;
    this._build(role);
  }

  _build(role) {
    if (this.mesh) G.scene.remove(this.mesh);
    this.role = role;
    if (role === 'guard') {
      this.fig = makeHumanoid(0x4a5568, 0xc9a07a);
      addSword(this.fig.armPivot, 0x8a909c, 0.7);
    } else if (role === 'farmer') {
      this.fig = makeHumanoid(0x7a6a3a, 0xc9a07a);
    } else {
      this.fig = makeHumanoid(0x8a8070, 0xc9a07a);
    }
    this.mesh = this.fig.group;
    this.mesh.position.copy(this.pos);
    G.scene.add(this.mesh);
  }

  takeDamage(n, from) {
    if (this.dead) return;
    this.hp -= n;
    if (this.hp <= 0) {
      this.dead = true;
      G.scene.remove(this.mesh);
      if (this.job) { this.job.worker = null; this.job = null; }
      G.ui.log(`✝ ${this.name} the ${this.role || 'villager'} has been slain.`);
    }
  }

  update(dt) {
    if (this.dead) return;
    this.atkTimer -= dt;
    // slow regen at home during peace
    this.hp = Math.min(this.maxHp, this.hp + dt * 0.5);

    if (this.role === 'guard') this._updateGuard(dt);
    else if (this.role === 'farmer') this._updateFarmer(dt);
    else this._updateIdler(dt);

    this.pos.y = G.world.h(this.pos.x, this.pos.z);
    this.mesh.position.copy(this.pos);
    const sw = Math.sin(this.walkPhase) * 0.5;
    this.fig.legs.forEach((l, i) => { l.rotation.x = sw * (i % 2 ? 1 : -1); });
  }

  _moveToward(x, z, dt, speed) {
    const dx = x - this.pos.x, dz = z - this.pos.z;
    const dd = Math.hypot(dx, dz);
    if (dd < 0.1) return;
    let nx = this.pos.x + (dx / dd) * speed * dt;
    let nz = this.pos.z + (dz / dd) * speed * dt;
    const solved = resolveCollisions(nx, nz, 0.4);
    this.pos.x = solved.x; this.pos.z = solved.z;
    this.mesh.rotation.y = Math.atan2(dx, dz);
    this.walkPhase += dt * speed * 1.7;
  }

  _updateGuard(dt) {
    const post = this.job;
    const px = post ? post.x : 0, pz = post ? post.z : 0;
    // find nearest enemy near the settlement
    let enemy = null, bd = 22;
    for (const c of G.creatures) {
      if (c.dead) continue;
      const d = dist2d(this.pos.x, this.pos.z, c.pos.x, c.pos.z);
      if (d < bd) { bd = d; enemy = c; }
    }
    if (enemy) {
      const d = dist2d(this.pos.x, this.pos.z, enemy.pos.x, enemy.pos.z);
      // don't chase too far from post
      if (dist2d(this.pos.x, this.pos.z, px, pz) > 30 && d > 2.4) {
        this._moveToward(px, pz, dt, 5.5);
        return;
      }
      if (d > 2.2) this._moveToward(enemy.pos.x, enemy.pos.z, dt, 6);
      else {
        this.mesh.rotation.y = Math.atan2(enemy.pos.x - this.pos.x, enemy.pos.z - this.pos.z);
        if (this.atkTimer <= 0) {
          this.atkTimer = 1.0;
          enemy.takeDamage(14, this);
          this.fig.armPivot.rotation.x = -2.0;
          setTimeout(() => { if (!this.dead) this.fig.armPivot.rotation.x = 0; }, 180);
        }
      }
      return;
    }
    // patrol around post
    this.wanderTimer -= dt;
    if (!this.wanderTo || this.wanderTimer <= 0) {
      const a = Math.random() * 6.28, r = 3 + Math.random() * 7;
      this.wanderTo = { x: px + Math.cos(a) * r, z: pz + Math.sin(a) * r };
      this.wanderTimer = 4 + Math.random() * 4;
    }
    if (dist2d(this.pos.x, this.pos.z, this.wanderTo.x, this.wanderTo.z) > 1)
      this._moveToward(this.wanderTo.x, this.wanderTo.z, dt, 2.2);
  }

  _updateFarmer(dt) {
    const farm = this.job;
    if (!farm) { this._updateIdler(dt); return; }
    const d = dist2d(this.pos.x, this.pos.z, farm.x, farm.z);
    if (d > 2.6) this._moveToward(farm.x, farm.z, dt, 3.2);
    else {
      // tend the crops: shuffle around the plot
      this.wanderTimer -= dt;
      if (!this.wanderTo || this.wanderTimer <= 0) {
        this.wanderTo = { x: farm.x + (Math.random() - 0.5) * 3, z: farm.z + (Math.random() - 0.5) * 3 };
        this.wanderTimer = 3 + Math.random() * 3;
      }
      if (dist2d(this.pos.x, this.pos.z, this.wanderTo.x, this.wanderTo.z) > 0.5)
        this._moveToward(this.wanderTo.x, this.wanderTo.z, dt, 1.4);
    }
  }

  _updateIdler(dt) {
    // hang around the campfire / village center
    const home = G.buildings.find(b => b.type === 'campfire') || { x: 0, z: 0 };
    this.wanderTimer -= dt;
    if (!this.wanderTo || this.wanderTimer <= 0) {
      const a = Math.random() * 6.28, r = 2 + Math.random() * 8;
      this.wanderTo = { x: home.x + Math.cos(a) * r, z: home.z + Math.sin(a) * r };
      this.wanderTimer = 4 + Math.random() * 5;
    }
    if (dist2d(this.pos.x, this.pos.z, this.wanderTo.x, this.wanderTo.z) > 1)
      this._moveToward(this.wanderTo.x, this.wanderTo.z, dt, 1.8);
  }
}

// Recruit a wanderer into the settlement (E near them).
export function recruit(w) {
  const pop = G.villagers.filter(v => !v.dead).length;
  if (pop >= G.popCap) {
    G.ui.log(`${w.name} needs a bed — build a house first (${pop}/${G.popCap} beds).`);
    return false;
  }
  const v = new Villager(w.name, w.pos.x, w.pos.z);
  G.villagers.push(v);
  w.remove();
  G.ui.log(`${v.name} joins your settlement! (${pop + 1}/${G.popCap})`);
  assignJobs();
  return true;
}

// Match idle villagers to unstaffed farms/guard posts. Called on recruit & build.
export function assignJobs() {
  const idle = () => G.villagers.find(v => !v.dead && !v.job);
  for (const b of G.buildings) {
    if (b.destroyed || b.worker && !b.worker.dead) continue;
    if (b.type !== 'farm' && b.type !== 'guardpost') continue;
    const v = idle();
    if (!v) break;
    v.job = b; b.worker = v;
    const role = b.type === 'farm' ? 'farmer' : 'guard';
    v._build(role);
    G.ui.log(`${v.name} takes up work as a ${role}.`);
  }
}

export function updateVillagers(dt) {
  for (const v of G.villagers) v.update(dt);
}
