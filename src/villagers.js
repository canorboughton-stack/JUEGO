// Villager framework (brief §6–§9, §13).
// One reusable Villager base; Farmer and Guard are profession behaviors on top.
// Villagers never teleport: every transition is walked. Homes are real beds in
// real shacks; production physically moves crops to Storage Chests.
import * as THREE from '../lib/three.module.js';
import { G, clamp, dist2d, resolveCollisions, isNight } from './state.js';
import { makeCharacter, addSword } from './entities.js';
import { POI } from './world.js';
import { emptyInv, invTotal, nearestChestWithSpace, chestSpace, settlementEatFood,
         combinedCount, payCombined, CHEST_CAP } from './storage.js';
import { alertState, raiseAlert } from './alerts.js';
import { CROPS } from './buildings.js';

const NAMES = ['Aldric', 'Berta', 'Cedric', 'Duna', 'Edda', 'Falk', 'Greta', 'Hamon',
  'Isolde', 'Jorun', 'Kessa', 'Lothar', 'Mira', 'Nolan', 'Ottila', 'Piers'];
let nameIdx = 0;
let nextVid = 1;

const TUNICS = [0x8a8070, 0x7a6a52, 0x6e7a5a, 0x8a6a5a, 0x6a6a7a, 0x9a8a6a];
const HAIRS = [0x4a3320, 0x2e2318, 0x6e5a3a, 0x8a7a5a, 0x3a3a3a];
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

const WORK_START = 0.27, WORK_END = 0.72; // daylight working hours
const CARRY_CAP = 8;

// guard arrows (watch position ranged attacks)
const arrows = [];
function fireArrow(from, to) {
  const geo = new THREE.BufferGeometry().setFromPoints([from.clone(), to.clone()]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xd8c9a0 }));
  G.scene.add(line);
  arrows.push({ line, ttl: 0.25 });
}
export function updateArrows(dt) {
  for (let i = arrows.length - 1; i >= 0; i--) {
    arrows[i].ttl -= dt;
    if (arrows[i].ttl <= 0) { G.scene.remove(arrows[i].line); arrows.splice(i, 1); }
  }
}

// ---------- wanderers (recruitable travelers on the King's Road) ----------
export class Wanderer {
  constructor(fromWest) {
    this.name = NAMES[nameIdx++ % NAMES.length];
    this.pos = new THREE.Vector3(fromWest ? -192 : 192, 0, POI.roadZ);
    this.dir = fromWest ? 1 : -1;
    this.fig = makeCharacter({ tunic: pick(TUNICS), skin: 0xc9a07a, hat: 'hood', hatColor: 0x5a5346 });
    this.mesh = this.fig.group;
    G.scene.add(this.mesh);
    this.walkPhase = 0;
    this.gone = false;
  }
  update(dt) {
    this.pos.x += this.dir * 2.6 * dt;
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
    this.id = nextVid++;
    this.name = name || NAMES[nameIdx++ % NAMES.length];
    this.pos = new THREE.Vector3(x, 0, z);
    this.hp = 90; this.maxHp = 90;
    this.dead = false;
    this.role = role;          // 'farmer' | 'guard'
    this.job = null;           // workplace building
    this.home = null;          // shack with this villager's bed
    this.weapon = null;        // 'sword' | 'bow' (guards)
    this.carry = emptyInv();   // small task inventory
    this.state = 'Idle';       // high-level state shown in UI
    this.problem = '';         // why work is blocked (UI explanation, brief §8)
    this.hungerDays = 0;
    this.inside = false;       // sheltering / sleeping indoors (mesh hidden)
    this.atkTimer = 0; this.taskTimer = 0; this.fleeCooldown = 0; this.pursuitCooldown = 0;
    this.walkPhase = 0;
    this.wanderTo = null; this.wanderTimer = 0;
    this._buildFig();
  }

  _buildFig() {
    if (this.mesh) G.scene.remove(this.mesh);
    if (!this.hair) this.hair = pick(HAIRS);
    if (!this.tunic) this.tunic = pick(TUNICS);
    if (this.role === 'guard') {
      this.fig = makeCharacter({ tunic: 0x4a5568, skin: 0xc9a07a, hat: 'helm', pants: 0x3a3f4a });
      if (this.weapon !== 'bow') addSword(this.fig.armPivot, 0x8a909c, 0.7);
    } else if (this.role === 'farmer') {
      this.fig = makeCharacter({ tunic: 0x7a6a3a, skin: 0xc9a07a, hat: 'straw', hair: this.hair });
    } else {
      this.fig = makeCharacter({ tunic: this.tunic, skin: 0xc9a07a, hair: this.hair });
    }
    this.mesh = this.fig.group;
    this.mesh.position.copy(this.pos);
    G.scene.add(this.mesh);
  }

  // work-speed multiplier: homelessness and hunger reduce usefulness (brief §7, §13)
  eff() {
    let e = 1;
    if (!this.home) e *= 0.6;
    if (this.hungerDays >= 1) e *= 0.6;
    return e;
  }

  makeHomeless() {
    this.home = null;
    G.ui.log(`${this.name} is homeless — their shack was destroyed.`);
  }

  takeDamage(n, from) {
    if (this.dead) return;
    this.hp -= n;
    this.inside = false;
    raiseAlert('attack', `${this.name} is being attacked`);
    if (this.hp <= 0) {
      this.dead = true;
      this.state = 'Dead';
      G.scene.remove(this.mesh);
      if (this.job) { this.job.worker = null; this.job = null; }
      if (this.home) {
        const i = this.home.residents.indexOf(this);
        if (i >= 0) this.home.residents.splice(i, 1);
      }
      G.ui.log(`✝ ${this.name} the ${this.role || 'villager'} has been slain.`);
    }
  }

  _moveToward(x, z, dt, speed) {
    const dx = x - this.pos.x, dz = z - this.pos.z;
    const dd = Math.hypot(dx, dz);
    if (dd < 0.1) return true;
    const nx = this.pos.x + (dx / dd) * speed * dt;
    const nz = this.pos.z + (dz / dd) * speed * dt;
    // friendlies pass gates; workers ignore their own workplace's collider
    const solved = resolveCollisions(nx, nz, 0.4, this.job, true);
    this.pos.x = solved.x; this.pos.z = solved.z;
    this.mesh.rotation.y = Math.atan2(dx, dz);
    this.walkPhase += dt * speed * 1.7;
    return dd < 0.6;
  }

  _wanderNear(cx, cz, r, dt, speed) {
    this.wanderTimer -= dt;
    if (!this.wanderTo || this.wanderTimer <= 0) {
      const a = Math.random() * 6.28, d = Math.random() * r;
      this.wanderTo = { x: cx + Math.cos(a) * d, z: cz + Math.sin(a) * d };
      this.wanderTimer = 3 + Math.random() * 4;
    }
    if (dist2d(this.pos.x, this.pos.z, this.wanderTo.x, this.wanderTo.z) > 1)
      this._moveToward(this.wanderTo.x, this.wanderTo.z, dt, speed);
  }

  _homePos() {
    if (this.home) return { x: this.home.x, z: this.home.z + 2.4 };
    const fire = G.buildings.find(b => b.type === 'campfire');
    return fire ? { x: fire.x + 1.5, z: fire.z + 1.5 } : { x: 0, z: 0 };
  }

  _nearestThreat(radius) {
    let best = null, bd = radius;
    for (const c of G.creatures) {
      if (c.dead) continue;
      if (c.type === 'boar' && !c.target) continue;
      const d = dist2d(this.pos.x, this.pos.z, c.pos.x, c.pos.z);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  update(dt) {
    if (this.dead) return;
    this.atkTimer -= dt; this.fleeCooldown -= dt; this.pursuitCooldown -= dt;
    this.hp = Math.min(this.maxHp, this.hp + dt * 0.5);

    if (this.role === 'guard') this._updateGuard(dt);
    else this._updateCivilian(dt);

    this.mesh.visible = !this.inside;
    // watch-position guards stand on the platform
    const standY = (this.role === 'guard' && this.job && this.job.def.standY &&
      dist2d(this.pos.x, this.pos.z, this.job.x, this.job.z) < 1.5) ? this.job.def.standY : 0;
    this.pos.y = G.world.h(this.pos.x, this.pos.z) + standY;
    this.mesh.position.copy(this.pos);
    const sw = Math.sin(this.walkPhase) * 0.5;
    this.fig.legs.forEach((l, i) => { l.rotation.x = sw * (i % 2 ? 1 : -1); });
  }

  // ---------- civilian (farmer/idler) daily loop (brief §8) ----------
  _updateCivilian(dt) {
    this.problem = '';
    const t = G.time;

    // threat response (brief §8): stop working, run to the shack, wait out the alert
    const threat = this._nearestThreat(13);
    if (threat || alertState.level === 'attack') {
      this.fleeCooldown = 6; // resume work this long after the danger passes
      if (this.inside) { this.state = 'Sheltering'; return; }
      this.state = 'Fleeing';
      const hp = this._homePos();
      const arrived = this._moveToward(hp.x, hp.z, dt, 6.5);
      if (arrived && this.home) { this.inside = true; this.state = 'Sheltering'; }
      return;
    }
    if (this.fleeCooldown > 0) { this.state = 'Sheltering'; return; }
    if (this.inside && t > WORK_START && t < WORK_END) this.inside = false;

    // night: go home and stay inside
    if (t < WORK_START || t > WORK_END) {
      const hp = this._homePos();
      if (!this.inside) {
        this.state = 'ReturningHome';
        // deliver carried goods before bed
        if (invTotal(this.carry) > 0 && this._deliver(dt)) return;
        const arrived = this._moveToward(hp.x, hp.z, dt, 3.4);
        if (arrived) { if (this.home) this.inside = true; this.state = this.home ? 'Inside' : 'Idle'; }
      } else this.state = 'Inside';
      return;
    }

    // working hours
    if (this.role === 'farmer') this._updateFarmer(dt);
    else {
      this.state = 'Idle';
      const hp = this._homePos();
      this._wanderNear(hp.x, hp.z, 8, dt, 1.8 * this.eff());
    }
  }

  _deliver(dt) {
    // physically carry goods to the nearest chest with space
    const chest = nearestChestWithSpace(this.pos.x, this.pos.z);
    if (!chest) { this.problem = 'no storage space'; this.state = 'Idle'; return false; }
    this.state = 'Carrying';
    const arrived = this._moveToward(chest.x, chest.z, dt, 3.6 * this.eff());
    if (arrived || dist2d(this.pos.x, this.pos.z, chest.x, chest.z) < 1.6) {
      for (const [res, n] of Object.entries(this.carry)) {
        if (n <= 0) continue;
        const put = Math.min(n, chestSpace(chest));
        chest.store[res] = (chest.store[res] || 0) + put;
        this.carry[res] -= put;
        if (put > 0) G.ui.log(`${this.name} stored ${put} ${res}.`);
      }
    }
    return invTotal(this.carry) > 0; // still busy if not everything fit
  }

  _updateFarmer(dt) {
    const farm = this.job;
    if (!farm || farm.destroyed) {
      this.problem = 'no farm plot assigned';
      this.state = 'Idle';
      const hp = this._homePos();
      this._wanderNear(hp.x, hp.z, 6, dt, 1.6);
      return;
    }
    // carrying harvested crops → deliver first
    if (invTotal(this.carry) > 0) { if (this._deliver(dt)) return; }

    const nearFarm = dist2d(this.pos.x, this.pos.z, farm.x, farm.z) < 2.4;
    if (!nearFarm) {
      this.state = 'Walking';
      this._moveToward(farm.x, farm.z, dt, 3.4 * this.eff());
      return;
    }
    // hunger day 2+: work stops periodically (brief §13)
    if (this.hungerDays >= 2 && Math.sin(performance.now() * 0.001) > 0) {
      this.state = 'Idle'; this.problem = 'too hungry to work steadily';
      return;
    }
    const cd = CROPS[farm.crop];
    if (farm.cropState === 'empty') {
      this.state = 'Working';
      this.taskTimer += dt * this.eff();
      if (this.taskTimer > 2.5) {
        this.taskTimer = 0;
        farm.cropState = 'planted'; farm.growth = 0;
        G.ui.log(`${this.name} planted ${cd.name.toLowerCase()}.`);
      }
    } else if (farm.cropState === 'ready') {
      this.state = 'Working';
      this.taskTimer += dt * this.eff();
      if (this.taskTimer > 2.5) {
        this.taskTimer = 0;
        this.carry[farm.crop] = (this.carry[farm.crop] || 0) + cd.yield;
        farm.cropState = 'empty'; farm.growth = 0;
        G.ui.log(`${this.name} harvested ${cd.yield} ${farm.crop}.`);
      }
    } else {
      // planted / growing: tend the plot
      this.state = 'Working';
      this._wanderNear(farm.x, farm.z, 1.8, dt, 1.2);
    }
  }

  // ---------- guard loop (brief §9) ----------
  _guardTarget(post) {
    // priority: self-attacker > villager > livestock > gate > building > player-in-territory > nearest
    const responseR = (post ? post.def.patrolRadius || 25 : 25) + 8;
    const px = post ? post.x : this.pos.x, pz = post ? post.z : this.pos.z;
    let best = null, bestScore = 99, bestDist = Infinity;
    for (const c of G.creatures) {
      if (c.dead) continue;
      if (c.type === 'boar' && !c.target) continue;
      const dPost = dist2d(c.pos.x, c.pos.z, px, pz);
      const dSelf = dist2d(c.pos.x, c.pos.z, this.pos.x, this.pos.z);
      if (dPost > responseR && dSelf > 14) continue;
      let score = 6;
      if (c.target === this) score = 0;
      else if (c.target && c.target.isVillager) score = 1;
      else if (c.target && c.target.isAnimal) score = 2;
      else if (c.blockedTime > 1 && c.lastBlockedGate) score = 3;
      else if (c.blockedTime > 1) score = 4;
      else if (c.target === G.player) score = 5;
      if (score < bestScore || (score === bestScore && dSelf < bestDist)) {
        bestScore = score; bestDist = dSelf; best = c;
      }
    }
    return best;
  }

  _updateGuard(dt) {
    this.problem = '';
    const post = this.job && !this.job.destroyed ? this.job : null;
    if (!post) this.problem = 'no guard post assigned';
    const px = post ? post.x : this._homePos().x;
    const pz = post ? post.z : this._homePos().z;
    const patrolR = post ? (post.def.patrolRadius || 6) : 10;
    const pursuitR = post ? (post.def.pursuitRadius || 45) : 45;
    const ranged = post && post.def.ranged && this.weapon === 'bow';

    // low health: retreat toward another guard or home rather than fight alone
    if (this.hp < this.maxHp * 0.25) {
      this.state = 'Retreat';
      let refuge = this._homePos();
      for (const v of G.villagers)
        if (v !== this && !v.dead && v.role === 'guard') { refuge = { x: v.pos.x, z: v.pos.z }; break; }
      this._moveToward(refuge.x, refuge.z, dt, 6);
      this.hp = Math.min(this.maxHp, this.hp + dt * 2);
      return;
    }

    const enemy = this.pursuitCooldown <= 0 ? this._guardTarget(post) : null;

    if (enemy) {
      const dPost = dist2d(enemy.pos.x, enemy.pos.z, px, pz);
      // hard pursuit limit: never chase past ~45m from the post (brief §9)
      if (dPost > pursuitR) {
        this.state = 'ReturnToPost';
        this.pursuitCooldown = 3;
        this._moveToward(px, pz, dt, 5.5);
        return;
      }
      const d = dist2d(this.pos.x, this.pos.z, enemy.pos.x, enemy.pos.z);
      if (ranged && dist2d(this.pos.x, this.pos.z, px, pz) < 2) {
        // watch position: hold the platform, shoot
        this.state = 'Attack';
        this.mesh.rotation.y = Math.atan2(enemy.pos.x - this.pos.x, enemy.pos.z - this.pos.z);
        if (d < 20 && this.atkTimer <= 0) {
          this.atkTimer = 1.5;
          enemy.takeDamage(10, this);
          fireArrow(this.pos.clone().add(new THREE.Vector3(0, 1.4, 0)),
            enemy.pos.clone().add(new THREE.Vector3(0, 0.8, 0)));
        }
        return;
      }
      if (d > 2.2) {
        this.state = 'Move to Threat';
        this._moveToward(enemy.pos.x, enemy.pos.z, dt, 6);
      } else {
        this.state = 'Attack';
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

    // no enemy: return to post area, then patrol
    const dPost = dist2d(this.pos.x, this.pos.z, px, pz);
    if (ranged || (post && post.def.standY)) {
      // watch guards stand on the platform
      this.state = dPost < 1.5 ? 'At Post' : 'Return to Post';
      if (dPost >= 1.2) this._moveToward(px, pz, dt, 4.5);
      return;
    }
    if (dPost > patrolR + 4) {
      this.state = 'Return to Post';
      this._moveToward(px, pz, dt, 5);
    } else {
      this.state = 'Patrol';
      this._wanderNear(px, pz, Math.min(patrolR, 12), dt, 2.2);
    }
  }
}
Villager.prototype.isVillager = true;

// ---------- housing & recruitment (brief §7) ----------
export function freeBeds() {
  let beds = 0;
  for (const b of G.buildings)
    if (b.type === 'house' && b.built >= 1 && !b.destroyed)
      beds += (b.def.beds || 0) - b.residents.length;
  return beds;
}

function assignBed(v) {
  for (const b of G.buildings) {
    if (b.type === 'house' && b.built >= 1 && !b.destroyed &&
        b.residents.length < (b.def.beds || 0)) {
      b.residents.push(v);
      v.home = b;
      return true;
    }
  }
  return false;
}

// role: 'farmer' | 'guard'. Returns '' on success or a failure reason.
export function recruitWanderer(w, role) {
  if (freeBeds() <= 0) return 'No free bed — build a Shack first.';
  if (role === 'guard') {
    const weapon = combinedCount('sword') > 0 ? 'sword' : combinedCount('bow') > 0 ? 'bow' : null;
    if (!weapon) return 'A guard needs a weapon — craft a Sword or Bow at the Workbench.';
    payCombined({ [weapon]: 1 });
    const v = new Villager(w.name, w.pos.x, w.pos.z, role);
    v.weapon = weapon;
    v._buildFig();
    assignBed(v);
    G.villagers.push(v);
    w.remove();
    assignJobs();
    G.ui.log(`${v.name} joins as a guard (armed with a ${weapon}).`);
    return '';
  }
  const v = new Villager(w.name, w.pos.x, w.pos.z, role);
  assignBed(v);
  G.villagers.push(v);
  w.remove();
  assignJobs();
  G.ui.log(`${v.name} joins as a ${role}.`);
  return '';
}

// match unemployed villagers to unstaffed finished workplaces; find beds for the homeless
export function assignJobs() {
  for (const b of G.buildings) {
    if (b.destroyed || b.built < 1 || !b.def.jobType) continue;
    if (b.worker && !b.worker.dead) continue;
    const v = G.villagers.find(v => !v.dead && v.role === b.def.jobType && !v.job);
    if (!v) continue;
    v.job = b; b.worker = v;
    G.ui.log(`${v.name} is now working the ${b.def.name}.`);
  }
  for (const v of G.villagers)
    if (!v.dead && !v.home && assignBed(v)) G.ui.log(`${v.name} has a bed again.`);
}

// ---------- daily food consumption (brief §13) ----------
export function consumeDailyFood() {
  let hungry = 0;
  for (const v of G.villagers) {
    if (v.dead) continue;
    const ate = settlementEatFood(1);
    if (ate >= 1) { v.hungerDays = 0; continue; }
    v.hungerDays++;
    hungry++;
    if (v.hungerDays >= 3) {
      v.hp -= 20;
      if (v.hp <= 0) { v.takeDamage(1, null); G.ui.log(`✝ ${v.name} starved to death.`); }
    }
  }
  if (hungry > 0) {
    G.ui.log(`⚠ ${hungry} villager(s) found no food in storage! Work suffers; starvation follows.`);
  }
}

export function updateVillagers(dt) {
  for (const v of G.villagers) v.update(dt);
  updateArrows(dt);
}
