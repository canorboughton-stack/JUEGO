// Settlement building: placement, costs, structure behavior.
// Bible rule: every building exists to solve a gameplay problem. No decoration.
import * as THREE from '../lib/three.module.js';
import { G, clamp, dist2d, isNight } from './state.js';

export const BUILDING_DEFS = {
  wall: {
    name: 'Palisade Wall', key: '1', cost: { wood: 5 }, hp: 220, r: 1.9,
    desc: 'Delays enemies',
    make() {
      const g = new THREE.Group();
      const mat = new THREE.MeshLambertMaterial({ color: 0x6b4e2e });
      for (let i = -2; i <= 2; i++) {
        const h = 2.5 + (i % 2 ? 0.25 : 0);
        const p = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, h, 5), mat);
        p.position.set(i * 0.75, h / 2, 0); p.castShadow = true; g.add(p);
      }
      return g;
    },
  },
  torch: {
    name: 'Torch Post', key: '2', cost: { wood: 2 }, hp: 40, r: 0.25,
    desc: 'Light; wards ghosts',
    make() {
      const g = new THREE.Group();
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 2.2, 5),
        new THREE.MeshLambertMaterial({ color: 0x4a3421 }));
      post.position.y = 1.1; g.add(post);
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.5, 6),
        new THREE.MeshBasicMaterial({ color: 0xffaa33 }));
      flame.position.y = 2.35; g.add(flame);
      const light = new THREE.PointLight(0xff9944, 0, 16);
      light.position.y = 2.4; g.add(light);
      g.userData.light = light; g.userData.flame = flame;
      return g;
    },
  },
  farm: {
    name: 'Farm Plot', key: '3', cost: { wood: 10 }, hp: 80, r: 0, flat: true,
    desc: 'Farmer grows food',
    make() {
      const g = new THREE.Group();
      const soil = new THREE.Mesh(new THREE.BoxGeometry(4, 0.3, 4),
        new THREE.MeshLambertMaterial({ color: 0x4a3626 }));
      soil.position.y = 0.15; g.add(soil);
      const cropMat = new THREE.MeshLambertMaterial({ color: 0x7a9a3a });
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
        const c = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.7, 5), cropMat);
        c.position.set(-1.2 + i * 1.2, 0.6, -1.2 + j * 1.2);
        g.add(c);
      }
      return g;
    },
  },
  house: {
    name: 'House', key: '4', cost: { wood: 20, stone: 5 }, hp: 300, r: 2.6,
    desc: '+2 villager beds',
    make() {
      const g = new THREE.Group();
      const walls = new THREE.Mesh(new THREE.BoxGeometry(4, 2.4, 4),
        new THREE.MeshLambertMaterial({ color: 0x8a7250 }));
      walls.position.y = 1.2; walls.castShadow = true; g.add(walls);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(3.4, 1.8, 4),
        new THREE.MeshLambertMaterial({ color: 0x5c3a26 }));
      roof.position.y = 3.3; roof.rotation.y = Math.PI / 4; roof.castShadow = true; g.add(roof);
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.5, 0.12),
        new THREE.MeshLambertMaterial({ color: 0x3a2a18 }));
      door.position.set(0, 0.75, 2.01); g.add(door);
      return g;
    },
  },
  guardpost: {
    name: 'Guard Post', key: '5', cost: { wood: 15, stone: 5 }, hp: 260, r: 1.3,
    desc: 'Station for 1 guard',
    make() {
      const g = new THREE.Group();
      const mat = new THREE.MeshLambertMaterial({ color: 0x6b5138 });
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 3.4, 5), mat);
        leg.position.set(sx * 0.9, 1.7, sz * 0.9); g.add(leg);
      }
      const deck = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.25, 2.4), mat);
      deck.position.y = 3.4; deck.castShadow = true; g.add(deck);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.7, 2.4),
        new THREE.MeshLambertMaterial({ color: 0x6b5138, transparent: true, opacity: 0.85 }));
      rail.position.y = 3.85; g.add(rail);
      return g;
    },
  },
  storage: {
    name: 'Storage Shed', key: '6', cost: { wood: 15 }, hp: 200, r: 1.8,
    desc: '+150 resource cap',
    make() {
      const g = new THREE.Group();
      const box = new THREE.Mesh(new THREE.BoxGeometry(3, 1.8, 2.4),
        new THREE.MeshLambertMaterial({ color: 0x7a6244 }));
      box.position.y = 0.9; box.castShadow = true; g.add(box);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.25, 2.8),
        new THREE.MeshLambertMaterial({ color: 0x4a3a26 }));
      roof.position.y = 1.95; g.add(roof);
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.8, 8),
        new THREE.MeshLambertMaterial({ color: 0x5c4a30 }));
      barrel.position.set(1.9, 0.4, 0.5); g.add(barrel);
      return g;
    },
  },
  campfire: {
    name: 'Campfire', key: '7', cost: { wood: 4, stone: 2 }, hp: 60, r: 0.6,
    desc: 'Respawn; slow healing',
    make() {
      const g = new THREE.Group();
      const stoneMat = new THREE.MeshLambertMaterial({ color: 0x6e6e74 });
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * Math.PI * 2;
        const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22, 0), stoneMat);
        s.position.set(Math.cos(a) * 0.7, 0.12, Math.sin(a) * 0.7); g.add(s);
      }
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.9, 6),
        new THREE.MeshBasicMaterial({ color: 0xff7722 }));
      flame.position.y = 0.5; g.add(flame);
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
  constructor(type, x, z, rotY = 0) {
    this.isBuilding = true;
    this.id = nextBid++;
    this.type = type;
    const d = this.def = BUILDING_DEFS[type];
    this.x = x; this.z = z; this.rotY = rotY;
    this.hp = d.hp; this.maxHp = d.hp;
    this.destroyed = false;
    this.worker = null;       // farm: assigned farmer; guardpost: assigned guard
    this.produceTimer = 15;
    this.mesh = d.make();
    this.mesh.position.set(x, G.world.h(x, z), z);
    this.mesh.rotation.y = rotY;
    G.scene.add(this.mesh);
    if (d.r > 0) G.colliders.push({ x, z, r: d.r, owner: this });
    applyBuildingEffects();
  }

  takeDamage(n) {
    if (this.destroyed) return;
    this.hp -= n;
    if (this.hp <= 0) this.demolish(true);
  }

  demolish(byEnemy = false) {
    this.destroyed = true;
    G.scene.remove(this.mesh);
    const ci = G.colliders.findIndex(c => c.owner === this);
    if (ci >= 0) G.colliders.splice(ci, 1);
    const bi = G.buildings.indexOf(this);
    if (bi >= 0) G.buildings.splice(bi, 1);
    if (this.worker) this.worker.job = null;
    if (byEnemy) G.ui.log(`Your ${this.def.name} was destroyed!`);
    applyBuildingEffects();
  }

  update(dt) {
    const d = this.def;
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

// recompute derived stats (pop cap, storage cap)
export function applyBuildingEffects() {
  G.popCap = G.buildings.filter(b => b.type === 'house').length * 2;
  G.resourceCap = 200 + G.buildings.filter(b => b.type === 'storage').length * 150;
}

export function canAfford(type) {
  const c = BUILDING_DEFS[type].cost;
  return Object.entries(c).every(([k, v]) => G.resources[k] >= v);
}

export function payCost(type) {
  for (const [k, v] of Object.entries(BUILDING_DEFS[type].cost)) G.resources[k] -= v;
}

export function placeBuilding(type, x, z, rotY) {
  const b = new Building(type, x, z, rotY);
  G.buildings.push(b);
  applyBuildingEffects();
  return b;
}

// placement validity: inside map, not on colliders, near-ish the settlement heartland
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
  // place point: 5m in front of the camera's horizontal view
  const fx = p.pos.x + p.viewDir.x * 5.5;
  const fz = p.pos.z + p.viewDir.z * 5.5;
  buildState.gx = fx; buildState.gz = fz;
  const type = BUILD_ORDER[buildState.sel];
  buildState.valid = placementValid(type, fx, fz) && canAfford(type);
  buildState.ghost.position.set(fx, G.world.h(fx, fz), fz);
  buildState.ghost.rotation.y = buildState.rot;
  const tint = buildState.valid ? null : new THREE.Color(0xff3333);
  buildState.ghost.traverse(o => {
    if (o.isMesh) {
      if (tint) o.material.color.lerp(tint, 0.12);
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
  placeBuilding(type, buildState.gx, buildState.gz, buildState.rot);
  G.ui.log(`Built: ${BUILDING_DEFS[type].name}`);
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
  const n = G.buildings.length;
  const walls = G.buildings.filter(b => b.type === 'wall').length;
  const pop = G.villagers.filter(v => !v.dead).length;
  if (n >= 10 && pop >= 4 && walls >= 8) return 'Fortified Frontier Settlement';
  if (n >= 6 && pop >= 2) return 'Village';
  if (n >= 3) return 'Outpost';
  return 'Lone Campfire';
}
