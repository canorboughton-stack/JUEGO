// Tamed creatures (loop bible): living companions, not equipment.
// The taming loop: hunt → weaken (below 25% hp) → Binding Ritual (hold E with
// 1 incense + 2 meat, uninterrupted) → escort home → feed daily → earn trust →
// assign a role. Neglect drops trust; a betrayed beast walks back into the wild.
// AI architecture mirrors the Guard loop with beast movement, per the brief.
import * as THREE from '../lib/three.module.js';
import { G, clamp, dist2d, resolveCollisions } from './state.js';
import { CREATURE_DEFS } from './entities.js';

const WILD_NAMES = ['Fang', 'Ash', 'Bristle', 'Shade', 'Rook', 'Ember', 'Grit', 'Moss'];
let nameIdx = 0;
let nextTid = 1;

export const TAME_STATS = {
  wolf: { hp: 70, dmg: 14, speed: 8, cd: 1.0, role: 'companion',
          blurb: 'a hunter at your side' },
  boar: { hp: 100, dmg: 18, speed: 6, cd: 1.4, role: 'defender',
          blurb: 'a living rampart for the village' },
};

export class Tamed {
  constructor(type, x, z) {
    this.isTamed = true;
    this.id = nextTid++;
    this.type = type;
    const s = this.def = TAME_STATS[type];
    this.name = WILD_NAMES[nameIdx++ % WILD_NAMES.length];
    this.hp = s.hp; this.maxHp = s.hp;
    this.trust = 35;               // earned over days of care
    this.fedToday = true;          // bound with meat in its belly
    this.role = 'companion';       // 'companion' | 'defender' | 'rest'
    this.dead = false;
    this.pos = new THREE.Vector3(x, 0, z);
    this.fig = CREATURE_DEFS[type].make();
    this.mesh = this.fig.group;
    G.scene.add(this.mesh);
    this.atkTimer = 0; this.walkPhase = Math.random() * 6;
    this.wanderTo = null; this.wanderTimer = 0;
  }

  get sullen() { return this.trust < 30; } // low trust: refuses commands

  takeDamage(n, from) {
    if (this.dead) return;
    this.hp -= n;
    if (this.hp <= 0) {
      this.dead = true;
      G.scene.remove(this.mesh);
      G.ui.log(`✝ ${this.name} the ${this.type} died defending you.`);
      const i = G.tamed.indexOf(this);
      if (i >= 0) G.tamed.splice(i, 1);
    }
  }

  // one ration of meat per day from settlement storage (creature care loop)
  dailyCare() {
    // tamed beasts eat meat specifically
    const meat = G.buildings.filter(b => b.type === 'chest' && !b.destroyed)
      .reduce((t, c) => t + (c.store.meat || 0), 0);
    if (meat > 0) {
      for (const c of G.buildings) {
        if (c.type === 'chest' && !c.destroyed && (c.store.meat || 0) > 0) { c.store.meat--; break; }
      }
      this.fedToday = true;
      this.trust = clamp(this.trust + 8, 0, 100);
    } else {
      this.fedToday = false;
      this.trust = clamp(this.trust - 14, 0, 100);
      G.ui.log(`⚠ ${this.name} found no meat in storage. Its trust wanes (${Math.round(this.trust)}).`);
    }
    if (this.trust <= 0) {
      G.ui.log(`${this.name} has had enough of hunger and orders. It walks back into the wild.`);
      this.dead = true;
      G.scene.remove(this.mesh);
      const i = G.tamed.indexOf(this);
      if (i >= 0) G.tamed.splice(i, 1);
    }
  }

  _moveToward(x, z, dt, speed) {
    const dx = x - this.pos.x, dz = z - this.pos.z;
    const dd = Math.hypot(dx, dz);
    if (dd < 0.15) return true;
    const nx = this.pos.x + (dx / dd) * speed * dt;
    const nz = this.pos.z + (dz / dd) * speed * dt;
    const solved = resolveCollisions(nx, nz, 0.5, null, true); // tamed pass gates
    this.pos.x = solved.x; this.pos.z = solved.z;
    this.mesh.rotation.y = Math.atan2(dx, dz) + Math.PI; // beasts face -z forward
    this.walkPhase += dt * speed * 1.5;
    return dd < 0.8;
  }

  _nearestHostile(cx, cz, r) {
    let best = null, bd = r;
    for (const c of G.creatures) {
      if (c.dead || c.weakened) continue;
      if (c.type === 'boar' && !c.target) continue;
      const d = dist2d(cx, cz, c.pos.x, c.pos.z);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  _fight(enemy, dt) {
    const d = dist2d(this.pos.x, this.pos.z, enemy.pos.x, enemy.pos.z);
    if (d > 2.2) this._moveToward(enemy.pos.x, enemy.pos.z, dt, this.def.speed);
    else {
      this.mesh.rotation.y = Math.atan2(enemy.pos.x - this.pos.x, enemy.pos.z - this.pos.z) + Math.PI;
      if (this.atkTimer <= 0) {
        this.atkTimer = this.def.cd;
        enemy.takeDamage(this.def.dmg, this);
        this.mesh.scale.setScalar(1.1);
        setTimeout(() => { if (!this.dead) this.mesh.scale.setScalar(1); }, 120);
      }
    }
  }

  update(dt) {
    if (this.dead) return;
    this.atkTimer -= dt;
    this.hp = Math.min(this.maxHp, this.hp + dt * (this.fedToday ? 0.8 : 0.1));

    const anchor = this.role === 'companion' && !this.sullen && G.player && !G.player.dead
      ? { x: G.player.pos.x, z: G.player.pos.z, r: 25 }
      : (() => {
          const fire = G.buildings.find(b => b.type === 'campfire');
          return { x: fire ? fire.x : 0, z: fire ? fire.z : 0, r: 18 };
        })();

    // sullen beasts mope near the fire and ignore everything
    if (this.sullen) {
      this.state = 'Sullen';
      this._wander(anchor.x, anchor.z, 5, dt, this.def.speed * 0.2);
      this._settle(dt);
      return;
    }

    // fight anything hostile near the anchor (companion: near you; defender: near home)
    const enemy = this._nearestHostile(anchor.x, anchor.z, this.role === 'defender' ? 18 : 13);
    if (enemy && dist2d(enemy.pos.x, enemy.pos.z, anchor.x, anchor.z) < anchor.r + 8) {
      this.state = 'Fighting';
      this._fight(enemy, dt);
      this._settle(dt);
      return;
    }

    if (this.role === 'companion') {
      const d = dist2d(this.pos.x, this.pos.z, G.player.pos.x, G.player.pos.z);
      this.state = 'Following';
      if (d > 2.6) this._moveToward(G.player.pos.x, G.player.pos.z, dt,
        d > 20 ? this.def.speed * 1.6 : this.def.speed * 0.85);
    } else {
      // defender / rest: patrol or doze around the settlement heart
      this.state = this.role === 'defender' ? 'Guarding' : 'Resting';
      this._wander(anchor.x, anchor.z, this.role === 'defender' ? 12 : 4, dt,
        this.def.speed * (this.role === 'defender' ? 0.35 : 0.15));
    }
    this._settle(dt);
  }

  _wander(cx, cz, r, dt, speed) {
    this.wanderTimer -= dt;
    if (!this.wanderTo || this.wanderTimer <= 0) {
      const a = Math.random() * 6.28, d = Math.random() * r;
      this.wanderTo = { x: cx + Math.cos(a) * d, z: cz + Math.sin(a) * d };
      this.wanderTimer = 3 + Math.random() * 5;
    }
    if (dist2d(this.pos.x, this.pos.z, this.wanderTo.x, this.wanderTo.z) > 1)
      this._moveToward(this.wanderTo.x, this.wanderTo.z, dt, speed);
  }

  _settle(dt) {
    this.pos.y = G.world.h(this.pos.x, this.pos.z);
    this.mesh.position.copy(this.pos);
    const sw = Math.sin(this.walkPhase) * 0.5;
    this.fig.legs.forEach((l, i) => { l.rotation.x = sw * (i % 2 ? 1 : -1); });
  }
}

// Binding Ritual completion: the broken beast joins you.
export function bindCreature(creature) {
  const t = new Tamed(creature.type, creature.pos.x, creature.pos.z);
  G.tamed.push(t);
  creature.dead = true;
  G.scene.remove(creature.mesh);
  G.ui.log(`★ The binding holds. ${t.name} the ${t.type} is yours — feed it meat, earn its trust.`);
  return t;
}

export function dailyTamedCare() {
  for (const t of [...G.tamed]) t.dailyCare();
}

export function updateTamed(dt) {
  for (const t of [...G.tamed]) t.update(dt);
}
