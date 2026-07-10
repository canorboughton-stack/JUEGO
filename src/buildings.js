// Settlement building: Medieval-Dynasty-inspired architecture & staged construction.
// Bible rule: every building exists to solve a gameplay problem. No decoration.
//
// Construction flow (MD-style): pay the materials, a timber frame appears on the site,
// then hammer it (hold E) until the finished building rises. Small builds are instant.
import * as THREE from '../lib/three.module.js';
import { G, clamp, dist2d, isNight } from './state.js';
import { MAT, bx, cyl, gableRoof, fence, makeFrame } from './models.js';
import { assignJobs } from './villagers.js';

export const BUILDING_DEFS = {
  wall: {
    name: 'Palisade Wall', key: '1', cost: { wood: 5 }, hp: 220, r: 1.9,
    desc: 'Delays enemies',
    make() {
      const g = new THREE.Group();
      for (let i = -2; i <= 2; i++) {
        const h = 2.5 + (i % 2 ? 0.3 : 0);
        cyl(g, 0.17, 0.2, h, 6, MAT.beamLight, i * 0.74, h / 2, 0);
        cyl(g, 0.01, 0.17, 0.38, 6, MAT.beamLight, i * 0.74, h + 0.18, 0); // sharpened tip
      }
      bx(g, 3.9, 0.16, 0.12, MAT.beam, 0, 1.7, 0.22);  // horizontal brace
      bx(g, 3.9, 0.16, 0.12, MAT.beam, 0, 0.6, 0.22);
      return g;
    },
  },
  torch: {
    name: 'Torch Post', key: '2', cost: { wood: 2 }, hp: 40, r: 0.25,
    desc: 'Light; wards ghosts',
    make() {
      const g = new THREE.Group();
      cyl(g, 0.09, 0.12, 2.3, 6, MAT.beam, 0, 1.15, 0);
      bx(g, 0.3, 0.08, 0.08, MAT.iron, 0, 2.2, 0);        // iron bracket
      cyl(g, 0.12, 0.09, 0.28, 6, MAT.iron, 0, 2.34, 0);  // sconce cup
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.48, 6),
        new THREE.MeshBasicMaterial({ color: 0xffaa33 }));
      flame.position.y = 2.6; g.add(flame);
      const light = new THREE.PointLight(0xff9944, 0, 16);
      light.position.y = 2.6; g.add(light);
      g.userData.light = light; g.userData.flame = flame;
      return g;
    },
  },
  farm: {
    name: 'Farm Plot', key: '3', cost: { wood: 10 }, hp: 80, r: 0, flat: true,
    desc: 'Farmer grows food',
    make() {
      const g = new THREE.Group();
      bx(g, 4.4, 0.22, 4.4, MAT.soil, 0, 0.11, 0);
      // tilled ridges with crop rows
      for (let i = 0; i < 4; i++) {
        const x = -1.5 + i * 1.0;
        bx(g, 0.55, 0.16, 3.8, MAT.soilDark, x, 0.24, 0);
        for (let j = 0; j < 5; j++) {
          const c = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.55, 5), MAT.crop);
          c.position.set(x, 0.55, -1.5 + j * 0.75);
          g.add(c);
        }
      }
      // post-and-rail fence around the plot
      for (const [rot, x, z] of [[0, 0, 2.35], [0, 0, -2.35], [Math.PI / 2, 2.35, 0], [Math.PI / 2, -2.35, 0]]) {
        const f = fence(4.7);
        f.rotation.y = rot; f.position.set(x, 0, z);
        g.add(f);
      }
      return g;
    },
  },
  house: {
    name: 'House', key: '4', cost: { wood: 20, stone: 5 }, hp: 300, r: 2.6,
    desc: '+2 villager beds', buildTime: 10, size: { w: 4.5, h: 2.8, d: 4.2 },
    make() {
      const g = new THREE.Group();
      bx(g, 4.6, 0.4, 4.3, MAT.stone, 0, 0.2, 0);                 // fieldstone foundation
      bx(g, 4.0, 2.3, 3.7, MAT.plaster, 0, 1.55, 0);              // wattle & daub core
      // corner timbers
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]])
        bx(g, 0.24, 2.4, 0.24, MAT.beam, sx * 1.95, 1.6, sz * 1.8);
      // horizontal rails, front & back
      for (const sz of [-1, 1]) {
        bx(g, 4.1, 0.17, 0.1, MAT.beam, 0, 0.55, sz * 1.88);
        bx(g, 4.1, 0.17, 0.1, MAT.beam, 0, 2.65, sz * 1.88);
      }
      // side rails
      for (const sx of [-1, 1]) {
        bx(g, 0.1, 0.17, 3.8, MAT.beam, sx * 2.03, 0.55, 0);
        bx(g, 0.1, 0.17, 3.8, MAT.beam, sx * 2.03, 2.65, 0);
      }
      // diagonal braces on the front face
      bx(g, 0.13, 1.7, 0.08, MAT.beam, -1.45, 1.6, 1.89, 0, 0.55);
      bx(g, 0.13, 1.7, 0.08, MAT.beam, 1.45, 1.6, 1.89, 0, -0.55);
      // door with timber frame
      bx(g, 0.95, 1.65, 0.1, MAT.door, 0, 1.22, 1.9);
      bx(g, 0.12, 1.75, 0.12, MAT.beam, -0.58, 1.27, 1.9);
      bx(g, 0.12, 1.75, 0.12, MAT.beam, 0.58, 1.27, 1.9);
      bx(g, 1.28, 0.14, 0.12, MAT.beam, 0, 2.2, 1.9);
      cyl(g, 0.04, 0.04, 0.12, 5, MAT.iron, 0.32, 1.2, 1.96, Math.PI / 2); // handle
      // shuttered windows: front + sides
      const win = (x, z, ry) => {
        const w = new THREE.Group();
        bx(w, 0.7, 0.7, 0.08, MAT.beam, 0, 0, 0);
        bx(w, 0.54, 0.54, 0.1, MAT.dark, 0, 0, 0.01);
        bx(w, 0.08, 0.54, 0.12, MAT.beam, 0, 0, 0.02);
        bx(w, 0.54, 0.08, 0.12, MAT.beam, 0, 0, 0.02);
        w.position.set(x, 1.8, z); w.rotation.y = ry;
        g.add(w);
      };
      win(-1.25, 1.86, 0);
      win(2.0, 0, Math.PI / 2);
      win(-2.0, 0, -Math.PI / 2);
      // thatched gable roof, ridge along z
      const roof = gableRoof(5.0, 4.6, 1.7);
      roof.position.y = 2.75;
      g.add(roof);
      // stone chimney
      bx(g, 0.55, 1.6, 0.55, MAT.stone, 1.3, 3.5, -1.0);
      return g;
    },
  },
  guardpost: {
    name: 'Guard Post', key: '5', cost: { wood: 15, stone: 5 }, hp: 260, r: 1.3,
    desc: 'Station for 1 guard', buildTime: 8, size: { w: 2.6, h: 3.6, d: 2.6 },
    make() {
      const g = new THREE.Group();
      // splayed watchtower legs with X-bracing
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]])
        cyl(g, 0.13, 0.17, 3.7, 6, MAT.beamLight, sx * 1.0, 1.85, sz * 1.0, 0, sx * -0.08);
      for (const sz of [-1, 1]) {
        bx(g, 0.1, 2.6, 0.1, MAT.beam, 0, 1.6, sz * 1.02, 0, 0.68);
        bx(g, 0.1, 2.6, 0.1, MAT.beam, 0, 1.6, sz * 1.02, 0, -0.68);
      }
      bx(g, 2.7, 0.22, 2.7, MAT.beamLight, 0, 3.7, 0); // platform
      // railing
      for (const s of [-1, 1]) {
        bx(g, 2.7, 0.09, 0.09, MAT.beam, 0, 4.5, s * 1.3);
        bx(g, 0.09, 0.09, 2.7, MAT.beam, s * 1.3, 4.5, 0);
        for (const t of [-1, 1]) {
          bx(g, 0.09, 0.75, 0.09, MAT.beam, t * 1.3, 4.15, s * 1.3);
        }
      }
      // thatched cap
      const cap = new THREE.Mesh(new THREE.ConeGeometry(2.2, 1.3, 4), MAT.thatch);
      cap.position.y = 5.6; cap.rotation.y = Math.PI / 4; cap.castShadow = true;
      g.add(cap);
      for (const [sx] of [[-1], [1]])
        cyl(g, 0.08, 0.08, 2.2, 5, MAT.beam, sx * 1.15, 5.0, 1.15, 0, sx * 0.35); // roof posts
      // ladder
      bx(g, 0.08, 3.6, 0.08, MAT.beamLight, -0.3, 1.8, 1.15, 0, 0, 0.12);
      bx(g, 0.08, 3.6, 0.08, MAT.beamLight, 0.3, 1.8, 1.15, 0, 0, 0.12);
      for (let i = 0; i < 6; i++)
        bx(g, 0.68, 0.07, 0.07, MAT.beamLight, 0, 0.5 + i * 0.58, 1.15 + (0.5 + i * 0.58) * -0.12 + 0.2);
      return g;
    },
  },
  storage: {
    name: 'Storage Shed', key: '6', cost: { wood: 15 }, hp: 200, r: 1.8,
    desc: '+150 resource cap', buildTime: 7, size: { w: 3.6, h: 2.2, d: 3.0 },
    make() {
      const g = new THREE.Group();
      bx(g, 3.7, 0.3, 3.1, MAT.stone, 0, 0.15, 0);
      // stacked-log cabin walls
      for (let lvl = 0; lvl < 6; lvl++) {
        const y = 0.48 + lvl * 0.31;
        cyl(g, 0.16, 0.16, 3.6, 6, MAT.log, 0, y, -1.35, 0, Math.PI / 2);
        cyl(g, 0.16, 0.16, 3.6, 6, MAT.log, 0, y, 1.35, 0, Math.PI / 2);
        cyl(g, 0.16, 0.16, 3.0, 6, MAT.log, -1.65, y + 0.15, 0, Math.PI / 2);
        cyl(g, 0.16, 0.16, 3.0, 6, MAT.log, 1.65, y + 0.15, 0, Math.PI / 2);
      }
      // door gap cover
      bx(g, 0.85, 1.4, 0.1, MAT.door, 0, 1.05, 1.42);
      const roof = gableRoof(4.0, 3.5, 1.2);
      roof.position.y = 2.35;
      g.add(roof);
      // goods stacked outside
      cyl(g, 0.34, 0.38, 0.8, 8, MAT.beamLight, 2.15, 0.4, 0.7);
      bx(g, 0.6, 0.6, 0.6, MAT.beamLight, 2.2, 0.3, -0.5, 0.4);
      bx(g, 0.5, 0.5, 0.5, MAT.beamLight, 2.1, 0.85, -0.45, 0.15);
      return g;
    },
  },
  campfire: {
    name: 'Campfire', key: '7', cost: { wood: 4, stone: 2 }, hp: 60, r: 0.6,
    desc: 'Respawn; slow healing',
    make() {
      const g = new THREE.Group();
      for (let i = 0; i < 7; i++) {
        const a = i / 7 * Math.PI * 2;
        const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.2, 0), MAT.stone);
        s.position.set(Math.cos(a) * 0.72, 0.12, Math.sin(a) * 0.72);
        g.add(s);
      }
      // leaning firewood
      for (let i = 0; i < 4; i++) {
        const a = i / 4 * Math.PI * 2 + 0.4;
        cyl(g, 0.07, 0.07, 0.9, 5, MAT.beam, Math.cos(a) * 0.25, 0.35, Math.sin(a) * 0.25, 0.5, Math.cos(a) * 0.6);
      }
      // cooking spit
      cyl(g, 0.05, 0.06, 1.15, 5, MAT.beam, -0.85, 0.57, 0);
      cyl(g, 0.05, 0.06, 1.15, 5, MAT.beam, 0.85, 0.57, 0);
      cyl(g, 0.04, 0.04, 2.0, 5, MAT.beam, 0, 1.1, 0, 0, Math.PI / 2);
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.85, 6),
        new THREE.MeshBasicMaterial({ color: 0xff7722 }));
      flame.position.y = 0.55; g.add(flame);
      const light = new THREE.PointLight(0xff8833, 0, 18);
      light.position.y = 1.2; g.add(light);
      g.userData.light = light; g.userData.flame = flame;
      return g;
    },
  },
};

export const BUILD_ORDER = ['wall', 'torch', 'farm', 'house', 'guardpost', 'storage', 'campfire'];

let nextBid = 1;

export class Building {
  constructor(type, x, z, rotY = 0, built = 1) {
    this.isBuilding = true;
    this.id = nextBid++;
    this.type = type;
    const d = this.def = BUILDING_DEFS[type];
    this.x = x; this.z = z; this.rotY = rotY;
    this.hp = d.hp; this.maxHp = d.hp;
    this.destroyed = false;
    this.worker = null;       // farm: assigned farmer; guardpost: assigned guard
    this.produceTimer = 15;
    // staged construction: big builds start as a timber frame and must be hammered up
    this.built = d.buildTime ? clamp(built, 0, 1) : 1;
    this.mesh = d.make();
    this.mesh.position.set(x, G.world.h(x, z), z);
    this.mesh.rotation.y = rotY;
    G.scene.add(this.mesh);
    if (this.built < 1) {
      this.mesh.visible = false;
      this.frame = makeFrame(d.size.w, d.size.h, d.size.d);
      this.frame.position.copy(this.mesh.position);
      this.frame.rotation.y = rotY;
      G.scene.add(this.frame);
    }
    if (d.r > 0) G.colliders.push({ x, z, r: d.r, owner: this });
    applyBuildingEffects();
  }

  get isSite() { return this.built < 1; }

  // hold-E hammering on the construction site
  construct(dt) {
    if (this.built >= 1) return;
    this.built = Math.min(1, this.built + dt / this.def.buildTime);
    if (this.built >= 1) this._complete();
  }

  _complete() {
    if (this.frame) { G.scene.remove(this.frame); this.frame = null; }
    this.mesh.visible = true;
    G.ui.log(`${this.def.name} raised! The settlement grows.`);
    applyBuildingEffects();
    assignJobs();
  }

  takeDamage(n) {
    if (this.destroyed) return;
    this.hp -= n;
    if (this.hp <= 0) this.demolish(true);
  }

  demolish(byEnemy = false) {
    this.destroyed = true;
    G.scene.remove(this.mesh);
    if (this.frame) { G.scene.remove(this.frame); this.frame = null; }
    const ci = G.colliders.findIndex(c => c.owner === this);
    if (ci >= 0) G.colliders.splice(ci, 1);
    const bi = G.buildings.indexOf(this);
    if (bi >= 0) G.buildings.splice(bi, 1);
    if (this.worker) this.worker.job = null;
    if (byEnemy) G.ui.log(`Your ${this.def.name} was destroyed!`);
    applyBuildingEffects();
  }

  update(dt) {
    if (this.built < 1) return; // sites do nothing until raised
    // torches & campfires burn at night
    const light = this.mesh.userData.light;
    if (light) {
      light.intensity = isNight() ? (this.type === 'torch' ? 10 : 12) : 1.5;
      const f = this.mesh.userData.flame;
      if (f) f.scale.setScalar(0.9 + Math.sin(performance.now() * 0.01 + this.id) * 0.15);
    }
    // farms produce with a farmer working them
    if (this.type === 'farm' && this.worker && !this.worker.dead) {
      this.produceTimer -= dt;
      if (this.produceTimer <= 0) {
        this.produceTimer = 16;
        const total = G.resources.wood + G.resources.stone + G.resources.food;
        if (total < G.resourceCap) {
          G.resources.food += 1;
          G.ui.log('The farm yields +1 food.');
        }
      }
    }
    // campfire heals whoever rests nearby
    if (this.type === 'campfire' && G.player && !G.player.dead) {
      if (dist2d(this.x, this.z, G.player.pos.x, G.player.pos.z) < 6 && G.player.hunger > 20)
        G.player.hp = Math.min(G.player.maxHp, G.player.hp + dt * 1.6);
    }
  }
}

// recompute derived stats (pop cap, storage cap) — only finished buildings count
export function applyBuildingEffects() {
  G.popCap = G.buildings.filter(b => b.type === 'house' && b.built >= 1).length * 2;
  G.resourceCap = 200 + G.buildings.filter(b => b.type === 'storage' && b.built >= 1).length * 150;
}

export function canAfford(type) {
  const c = BUILDING_DEFS[type].cost;
  return Object.entries(c).every(([k, v]) => G.resources[k] >= v);
}

export function payCost(type) {
  for (const [k, v] of Object.entries(BUILDING_DEFS[type].cost)) G.resources[k] -= v;
}

export function placeBuilding(type, x, z, rotY, built = 1) {
  const b = new Building(type, x, z, rotY, built);
  G.buildings.push(b);
  applyBuildingEffects();
  return b;
}

// placement validity: inside map, not on colliders
export function placementValid(type, x, z) {
  const d = BUILDING_DEFS[type];
  if (Math.abs(x) > 190 || Math.abs(z) > 190) return false;
  const need = Math.max(d.r, 1.6);
  for (const c of G.colliders) {
    if (dist2d(x, z, c.x, c.z) < need + c.r) return false;
  }
  if (G.player && dist2d(x, z, G.player.pos.x, G.player.pos.z) < 1.2) return false;
  return true;
}

// ---------- build mode (ghost preview) ----------
export const buildState = { active: false, sel: 0, rot: 0, ghost: null, valid: false, gx: 0, gz: 0 };

export function enterBuildMode() {
  buildState.active = true;
  setGhost(BUILD_ORDER[buildState.sel]);
  G.ui.showBuildMenu(true);
}

export function exitBuildMode() {
  buildState.active = false;
  if (buildState.ghost) { G.scene.remove(buildState.ghost); buildState.ghost = null; }
  G.ui.showBuildMenu(false);
}

export function setGhost(type) {
  if (buildState.ghost) G.scene.remove(buildState.ghost);
  const mesh = BUILDING_DEFS[type].make();
  mesh.traverse(o => {
    if (o.isMesh) {
      o.material = o.material.clone();
      o.material.transparent = true; o.material.opacity = 0.55;
      o.userData.baseColor = o.material.color.clone();
      o.castShadow = false;
    }
    if (o.isLight) o.intensity = 0;
  });
  buildState.ghost = mesh;
  G.scene.add(mesh);
}

export function selectSlot(i) {
  if (i < 0 || i >= BUILD_ORDER.length) return;
  buildState.sel = i;
  setGhost(BUILD_ORDER[i]);
  G.ui.updateBuildMenu();
}

export function updateBuildMode() {
  if (!buildState.active || !buildState.ghost) return;
  const p = G.player;
  // place point: in front of the camera's horizontal view
  const fx = p.pos.x + p.viewDir.x * 5.5;
  const fz = p.pos.z + p.viewDir.z * 5.5;
  buildState.gx = fx; buildState.gz = fz;
  const type = BUILD_ORDER[buildState.sel];
  buildState.valid = placementValid(type, fx, fz) && canAfford(type);
  buildState.ghost.position.set(fx, G.world.h(fx, fz), fz);
  buildState.ghost.rotation.y = buildState.rot;
  const tint = new THREE.Color(0xff3333);
  buildState.ghost.traverse(o => {
    if (o.isMesh && o.userData.baseColor) {
      o.material.color.copy(o.userData.baseColor);
      if (!buildState.valid) o.material.color.lerp(tint, 0.55);
    }
  });
}

export function tryPlace() {
  const type = BUILD_ORDER[buildState.sel];
  if (!buildState.valid) {
    G.ui.log(canAfford(type) ? 'Cannot build there.' : 'Not enough resources.');
    return;
  }
  payCost(type);
  const staged = !!BUILDING_DEFS[type].buildTime;
  placeBuilding(type, buildState.gx, buildState.gz, buildState.rot, staged ? 0 : 1);
  G.ui.log(staged
    ? `${BUILDING_DEFS[type].name} frame raised — hold E at the site to build it.`
    : `Built: ${BUILDING_DEFS[type].name}`);
  G.ui.updateBuildMenu();
}

// demolish nearest owned building (X key) — refunds half the wood
export function demolishNearest() {
  let best = null, bd = 6;
  for (const b of G.buildings) {
    const d = dist2d(G.player.pos.x, G.player.pos.z, b.x, b.z);
    if (d < bd) { bd = d; best = b; }
  }
  if (best) {
    const refund = Math.floor((best.def.cost.wood || 0) / 2);
    G.resources.wood += refund;
    G.ui.log(`Demolished ${best.def.name}${refund ? ` (+${refund} wood back)` : ''}.`);
    best.demolish(false);
  }
}

export function updateBuildings(dt) {
  for (const b of G.buildings) b.update(dt);
}

// settlement tier per the bible: campfire → outpost → village → fortified frontier settlement
export function settlementTier() {
  const done = G.buildings.filter(b => b.built >= 1);
  const n = done.length;
  const walls = done.filter(b => b.type === 'wall').length;
  const pop = G.villagers.filter(v => !v.dead).length;
  if (n >= 10 && pop >= 4 && walls >= 8) return 'Fortified Frontier Settlement';
  if (n >= 6 && pop >= 2) return 'Village';
  if (n >= 3) return 'Outpost';
  return 'Lone Campfire';
}
