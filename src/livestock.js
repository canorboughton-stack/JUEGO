// Livestock (brief §14): chickens, pigs, cows. They live inside Animal Pens,
// wander, flee predators, die permanently, produce food, and persist in saves.
// Predators are blocked by the pen fence (gate collider) and chew through it
// to reach the animals — exactly the "reach the pen" rule.
import * as THREE from '../lib/three.module.js';
import { G, clamp, dist2d } from './state.js';
import { makeBeast } from './entities.js';

export const ANIMAL_DEFS = {
  chicken: { name: 'Chicken', hp: 15, speed: 3.5, cost: { corn: 3 }, produce: 1, produceEvery: 1, // food/day
             meat: 1, hide: 0, scale: 0.35, body: 0xd8d4c8, head: 0xc44a3a },
  pig:     { name: 'Pig', hp: 40, speed: 3, cost: { corn: 5 }, produce: 0, produceEvery: 0,
             meat: 5, hide: 1, scale: 0.7, body: 0xd8a8a0, head: 0xc99890 },
  cow:     { name: 'Cow', hp: 60, speed: 2.5, cost: { corn: 8 }, produce: 2, produceEvery: 1,
             meat: 8, hide: 3, scale: 1.15, body: 0x6e5a48, head: 0x5a483a },
};

let nextAid = 1;

export class Animal {
  constructor(type, pen) {
    this.isAnimal = true;
    this.id = nextAid++;
    this.type = type;
    const d = this.def = ANIMAL_DEFS[type];
    this.pen = pen;                       // animalpen Building
    this.hp = d.hp; this.maxHp = d.hp;
    this.dead = false;
    this.pos = new THREE.Vector3(pen.x + (Math.random() - 0.5) * 3, 0, pen.z + (Math.random() - 0.5) * 3);
    this.fig = makeBeast(1.2, 0.85, 0.55, d.body, d.head);
    this.fig.group.scale.setScalar(d.scale);
    this.mesh = this.fig.group;
    G.scene.add(this.mesh);
    this.wanderTo = null; this.wanderTimer = 0; this.walkPhase = Math.random() * 6;
  }

  takeDamage(n, from) {
    if (this.dead) return;
    this.hp -= n;
    if (this.hp <= 0) {
      this.dead = true;
      G.scene.remove(this.mesh);
      G.ui.log(`A ${this.def.name.toLowerCase()} was killed!`);
      G.overnight.livestockLost++;
      const i = G.animals.indexOf(this);
      if (i >= 0) G.animals.splice(i, 1);
    }
  }

  update(dt) {
    if (this.dead) return;
    const d = this.def;
    if (this.pen.destroyed) this.pen = null;

    // flee from nearby predators (within the pen if it still stands)
    let predator = null, pd = 10;
    for (const c of G.creatures) {
      if (c.dead) continue;
      const dd = dist2d(this.pos.x, this.pos.z, c.pos.x, c.pos.z);
      if (dd < pd) { pd = dd; predator = c; }
    }
    if (predator) {
      const away = Math.atan2(this.pos.x - predator.pos.x, this.pos.z - predator.pos.z);
      this.pos.x += Math.sin(away) * d.speed * 1.6 * dt;
      this.pos.z += Math.cos(away) * d.speed * 1.6 * dt;
      this.mesh.rotation.y = away + Math.PI;
      this.walkPhase += dt * 9;
    } else {
      // wander
      this.wanderTimer -= dt;
      const cx = this.pen ? this.pen.x : this.pos.x, cz = this.pen ? this.pen.z : this.pos.z;
      if (!this.wanderTo || this.wanderTimer <= 0) {
        const a = Math.random() * 6.28, r = Math.random() * 2.5;
        this.wanderTo = { x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r };
        this.wanderTimer = 2 + Math.random() * 5;
      }
      const dx = this.wanderTo.x - this.pos.x, dz = this.wanderTo.z - this.pos.z;
      const dd = Math.hypot(dx, dz);
      if (dd > 0.3) {
        this.pos.x += (dx / dd) * d.speed * 0.4 * dt;
        this.pos.z += (dz / dd) * d.speed * 0.4 * dt;
        this.mesh.rotation.y = Math.atan2(dx, dz) + Math.PI;
        this.walkPhase += dt * 3;
      }
    }
    // stay inside the pen while it stands
    if (this.pen) {
      const pr = this.pen.def.penRadius;
      const dd = dist2d(this.pos.x, this.pos.z, this.pen.x, this.pen.z);
      if (dd > pr) {
        this.pos.x = this.pen.x + (this.pos.x - this.pen.x) / dd * pr;
        this.pos.z = this.pen.z + (this.pos.z - this.pen.z) / dd * pr;
      }
    }
    this.pos.y = G.world.h(this.pos.x, this.pos.z);
    this.mesh.position.copy(this.pos);
    const sw = Math.sin(this.walkPhase) * 0.5;
    this.fig.legs.forEach((l, i) => { l.rotation.x = sw * (i % 2 ? 1 : -1); });
  }
}

export function penAnimals(pen) {
  return G.animals.filter(a => a.pen === pen && !a.dead);
}

export function addAnimal(type, pen) {
  const a = new Animal(type, pen);
  G.animals.push(a);
  return a;
}

// daily production: eggs/milk accumulate at the pen for the player to collect
export function dailyAnimalProduce() {
  for (const b of G.buildings) {
    if (b.type !== 'animalpen' || b.destroyed) continue;
    let out = 0;
    for (const a of penAnimals(b)) out += a.def.produce;
    if (out > 0) {
      b.penFood = (b.penFood || 0) + out;
      G.ui.log(`Your livestock produced ${out} food — collect it at the pen.`);
    }
  }
}

export function updateAnimals(dt) {
  for (const a of [...G.animals]) a.update(dt);
}
