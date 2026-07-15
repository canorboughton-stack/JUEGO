// World: handcrafted map, biomes, terrain, vegetation, lakes, mountains, ruins,
// lighting, sun/moon/stars, day/night. The map should feel lived-in: every few
// minutes of walking, something meaningful (bible: world design).
import * as THREE from '../lib/three.module.js';
import { G, clamp, dist2d, isNight } from './state.js';
import { playerAdd } from './storage.js';

const MAP = 400; // world is MAP x MAP centered at origin

// ---- Map layout (z negative = north) ----
// Village clearing  : (0, 0)
// King's Road       : east-west band at z = 40
// Dark Forest       : east   (x 40..190, z -90..25)
// Southwood pines   : south  (z 60..170)
// Rocky Hills       : west   (x -190..-40, z -70..35)
// Grey Peaks        : mountain ring at the map's edge
// Lakes             : Mirror Lake (60,95), Blackwater (120,-35), Reedmere (-70,110)
// Cursed Ruins      : (110, -120) r 34 — now a monster den with a reliquary
// Bandit Camp       : (-110, -115) r 26
// Hunting Grounds   : far north strip z < -150 (the White Werewolf)
export const POI = {
  village: { x: 0, z: 0, r: 40 },
  ruins: { x: 110, z: -120, r: 34 },
  banditCamp: { x: -110, z: -115, r: 26 },
  werewolfDen: { x: 0, z: -175, r: 45 },
  roadZ: 40,
};

export const LAKES = [
  { x: 60, z: 95, r: 18, name: 'Mirror Lake' },
  { x: 120, z: -35, r: 13, name: 'Blackwater' },
  { x: -70, z: 110, r: 15, name: 'Reedmere' },
];

function smooth(a, b, v) { return clamp((v - a) / (b - a), 0, 1); }

export function terrainHeight(x, z) {
  let h = 2.4 * Math.sin(x * 0.018) * Math.cos(z * 0.021)
        + 1.5 * Math.sin(x * 0.052 + 2.3) * Math.cos(z * 0.047 + 1.1)
        + 0.6 * Math.sin(x * 0.11 + 0.5) * Math.sin(z * 0.13 + 2.0);
  h += Math.max(0, (-z - 120) * 0.035);           // rise toward the cursed north
  // the Grey Peaks: a mountain ring walls the world in
  const edge = Math.max(Math.abs(x), Math.abs(z));
  h += Math.pow(smooth(160, 196, edge), 2) * 24 * (0.75 + 0.25 * Math.sin(x * 0.07 + z * 0.06));
  // western highlands shoulder the hills
  h += Math.pow(smooth(-135, -185, x), 2) * 10 * (0.6 + 0.4 * Math.sin(z * 0.045));
  const dv = Math.hypot(x, z);
  h *= 0.08 + 0.92 * smooth(16, 52, dv);          // flatten village clearing
  h *= 0.15 + 0.85 * smooth(2.5, 9, Math.abs(z - POI.roadZ)); // flatten the road
  h *= 0.2 + 0.8 * smooth(6, 20, dist2d(x, z, POI.ruins.x, POI.ruins.z) - 14);
  h *= 0.2 + 0.8 * smooth(4, 14, dist2d(x, z, POI.banditCamp.x, POI.banditCamp.z) - 10);
  // lake basins sink below the waterline
  for (const L of LAKES) {
    const t = smooth(L.r, L.r * 0.3, dist2d(x, z, L.x, L.z));
    h = h * (1 - t) + (-2.6) * t;
  }
  return h;
}

export function inLake(x, z) {
  return LAKES.some(L => dist2d(x, z, L.x, L.z) < L.r);
}

export function zoneAt(x, z) {
  if (dist2d(x, z, POI.werewolfDen.x, POI.werewolfDen.z) < POI.werewolfDen.r || z < -160)
    return { name: 'THE HUNTING GROUNDS', sub: 'Something ancient rules here. Turn back.' };
  if (dist2d(x, z, POI.ruins.x, POI.ruins.z) < POI.ruins.r)
    return { name: 'THE CURSED RUINS', sub: 'The dead do not rest in these stones.' };
  if (dist2d(x, z, POI.banditCamp.x, POI.banditCamp.z) < POI.banditCamp.r)
    return { name: 'BANDIT CAMP', sub: 'Outlaws watch from the tents.' };
  for (const L of LAKES)
    if (dist2d(x, z, L.x, L.z) < L.r + 6)
      return { name: L.name.toUpperCase(), sub: 'Still water. Keep your reflection to yourself.' };
  if (Math.max(Math.abs(x), Math.abs(z)) > 162)
    return { name: 'THE GREY PEAKS', sub: 'The mountains wall the world in.' };
  if (Math.hypot(x, z) < POI.village.r)
    return { name: 'THE SETTLEMENT', sub: 'Home. Keep it standing.' };
  if (Math.abs(z - POI.roadZ) < 8)
    return { name: "THE KING'S ROAD", sub: 'Merchants and wanderers pass through.' };
  if (x > 40 && z > -95 && z < 28)
    return { name: 'THE DARK FOREST', sub: 'Timber is plentiful. So are the wolves.' };
  if (z > 60 && Math.abs(x) < 160)
    return { name: 'THE SOUTHWOOD', sub: 'Endless pines. Easy to lose the road.' };
  if (x < -40 && z > -75 && z < 38)
    return { name: 'THE ROCKY HILLS', sub: 'Stone for walls. Boars in the brush.' };
  if (z < -90)
    return { name: 'THE NORTHERN MARCHES', sub: 'The air grows cold and wrong.' };
  return { name: 'THE FRONTIER', sub: 'Untamed wilderness.' };
}

// spots trees/rocks/props must avoid
function badSpot(x, z, extra = 0) {
  if (Math.hypot(x, z) < 34 + extra) return true;
  if (Math.abs(z - POI.roadZ) < 9) return true;
  if (dist2d(x, z, POI.ruins.x, POI.ruins.z) < POI.ruins.r) return true;
  if (dist2d(x, z, POI.banditCamp.x, POI.banditCamp.z) < POI.banditCamp.r) return true;
  if (LAKES.some(L => dist2d(x, z, L.x, L.z) < L.r + 3)) return true;
  if (terrainHeight(x, z) > 11) return true; // no trees on bare peaks
  return false;
}

export class World {
  constructor() {
    this.h = terrainHeight;
    this.trees = [];  // {x,z,alive,respawn,s,kind,idx}
    this.rocks = [];
    this.bushes = [];
    this.herbs = [];
    this._buildTerrain();
    this._buildLakes();
    this._buildVegetation();
    this._buildRuins();
    this._buildBanditCamp();
    this._buildDen();
    this._buildRoadProps();
    this._buildLights();
    this._buildSky();
  }

  // ---------- terrain ----------
  _buildTerrain() {
    const seg = 150;
    const geo = new THREE.PlaneGeometry(MAP, MAP, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const cGrass = new THREE.Color(0x3d5a2a), cDry = new THREE.Color(0x5a5f38),
          cRoad = new THREE.Color(0x6e5b41), cRuin = new THREE.Color(0x565661),
          cSnow = new THREE.Color(0x9aa3ad), cVill = new THREE.Color(0x4a6b33),
          cForest = new THREE.Color(0x2e4a22), cRock = new THREE.Color(0x6e6f76),
          cPeakSnow = new THREE.Color(0xdfe6ec), cSand = new THREE.Color(0x8a7f5e),
          cLakebed = new THREE.Color(0x3a4a42);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h = terrainHeight(x, z);
      pos.setY(i, h);
      c.copy(cGrass);
      const n = Math.sin(x * 0.31 + z * 0.17) * Math.sin(x * 0.05 - z * 0.11);
      c.lerp(cDry, 0.25 + n * 0.25);
      // forest floors are darker, needled
      if (x > 40 && z > -95 && z < 28) c.lerp(cForest, 0.55);
      if (z > 60 && Math.abs(x) < 160) c.lerp(cForest, 0.45);
      if (Math.hypot(x, z) < POI.village.r) c.lerp(cVill, 0.5);
      if (dist2d(x, z, POI.ruins.x, POI.ruins.z) < POI.ruins.r) c.lerp(cRuin, 0.75);
      if (dist2d(x, z, POI.banditCamp.x, POI.banditCamp.z) < POI.banditCamp.r) c.lerp(cDry, 0.6);
      c.lerp(cSnow, smooth(-130, -175, z));                 // pale cursed north
      // mountain rock and snowcaps by altitude
      c.lerp(cRock, smooth(9, 15, h));
      c.lerp(cPeakSnow, smooth(17, 23, h));
      // lake shores and beds
      for (const L of LAKES) {
        const d = dist2d(x, z, L.x, L.z);
        if (d < L.r + 4) {
          c.lerp(cSand, smooth(L.r + 4, L.r - 1, d) * 0.8);
          c.lerp(cLakebed, smooth(L.r - 2, L.r * 0.4, d));
        }
      }
      c.lerp(cRoad, 1 - smooth(2.5, 5.5, Math.abs(z - POI.roadZ))); // road strip
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
    mesh.receiveShadow = true;
    G.scene.add(mesh);
  }

  // ---------- lakes: still water, reeds on the banks ----------
  _buildLakes() {
    this.waters = [];
    const reedMat = new THREE.MeshLambertMaterial({ color: 0x4a6a3a });
    for (const L of LAKES) {
      const water = new THREE.Mesh(
        new THREE.CircleGeometry(L.r, 26),
        new THREE.MeshLambertMaterial({ color: 0x2e5a6e, transparent: true, opacity: 0.78 }));
      water.rotation.x = -Math.PI / 2;
      water.position.set(L.x, -0.55, L.z);
      G.scene.add(water);
      this.waters.push(water);
      // reeds ring the shore
      for (let i = 0; i < 22; i++) {
        const a = (i / 22) * Math.PI * 2 + Math.random() * 0.2;
        const d = L.r + 0.5 + Math.random() * 2;
        const rx = L.x + Math.cos(a) * d, rz = L.z + Math.sin(a) * d;
        const reed = new THREE.Mesh(new THREE.ConeGeometry(0.08, 1.4 + Math.random() * 0.8, 4), reedMat);
        reed.position.set(rx, terrainHeight(rx, rz) + 0.6, rz);
        reed.rotation.z = (Math.random() - 0.5) * 0.2;
        G.scene.add(reed);
      }
    }
  }

  // ---------- vegetation: three tree species, all timber ----------
  _buildVegetation() {
    const dummy = new THREE.Object3D();

    // gather spots per species. The world reads forest-first.
    const pines = [], oaks = [], birches = [];
    const scatter = (n, gen, arr) => {
      for (let i = 0; i < n; i++) {
        const [x, z] = gen();
        if (x === null || badSpot(x, z)) continue;
        arr.push({ x, z });
      }
    };
    // dark forest east: dense pine + oak mix
    scatter(190, () => [42 + Math.random() * 145, -92 + Math.random() * 115], pines);
    scatter(55, () => [45 + Math.random() * 130, -85 + Math.random() * 105], oaks);
    // the Southwood: a true pine belt south of the road
    scatter(150, () => [-160 + Math.random() * 320, 62 + Math.random() * 105], pines);
    scatter(35, () => [-150 + Math.random() * 300, 65 + Math.random() * 95], birches);
    // meadow and hill scatter
    scatter(45, () => [-195 + Math.random() * 390, -195 + Math.random() * 390], oaks);
    scatter(40, () => [-195 + Math.random() * 390, -195 + Math.random() * 390], birches);
    // dead pines in the cursed north
    const deadPines = [];
    scatter(30, () => [-150 + Math.random() * 300, -190 + Math.random() * 45], deadPines);

    // --- pines (cone canopy) ---
    const pineTrunkGeo = new THREE.CylinderGeometry(0.28, 0.42, 3.2, 6);
    const pineTrunkMat = new THREE.MeshLambertMaterial({ color: 0x4a3421 });
    const pineLeafGeo = new THREE.ConeGeometry(1.9, 4.6, 7);
    const pineLeafMat = new THREE.MeshLambertMaterial({ color: 0x2a4520 });
    const allPines = [...pines.map(p => ({ ...p, dead: false })),
                      ...deadPines.map(p => ({ ...p, dead: true }))];
    this.pineTrunkIM = new THREE.InstancedMesh(pineTrunkGeo, pineTrunkMat, allPines.length);
    this.pineLeafIM = new THREE.InstancedMesh(pineLeafGeo, pineLeafMat, allPines.length);
    this.pineTrunkIM.castShadow = this.pineLeafIM.castShadow = true;
    allPines.forEach((t, i) => {
      const y = terrainHeight(t.x, t.z);
      const s = 0.8 + Math.random() * 0.7;
      dummy.position.set(t.x, y + 1.6 * s, t.z);
      dummy.scale.setScalar(s); dummy.rotation.y = Math.random() * 6.28;
      dummy.updateMatrix();
      this.pineTrunkIM.setMatrixAt(i, dummy.matrix);
      if (t.dead) dummy.scale.setScalar(0.001);
      else dummy.position.y = y + 4.8 * s;
      dummy.updateMatrix();
      this.pineLeafIM.setMatrixAt(i, dummy.matrix);
      this.trees.push({ x: t.x, z: t.z, alive: true, respawn: 0, s, kind: 'pine', idx: i, dead: t.dead });
      G.colliders.push({ x: t.x, z: t.z, r: 0.55, owner: null });
    });
    G.scene.add(this.pineTrunkIM, this.pineLeafIM);

    // --- oaks (round canopy) ---
    const oakTrunkGeo = new THREE.CylinderGeometry(0.34, 0.5, 2.6, 6);
    const oakTrunkMat = new THREE.MeshLambertMaterial({ color: 0x54402a });
    const oakLeafGeo = new THREE.SphereGeometry(2.1, 7, 6);
    const oakLeafMat = new THREE.MeshLambertMaterial({ color: 0x3e5c26 });
    this.oakTrunkIM = new THREE.InstancedMesh(oakTrunkGeo, oakTrunkMat, oaks.length);
    this.oakLeafIM = new THREE.InstancedMesh(oakLeafGeo, oakLeafMat, oaks.length);
    this.oakTrunkIM.castShadow = this.oakLeafIM.castShadow = true;
    oaks.forEach((t, i) => {
      const y = terrainHeight(t.x, t.z);
      const s = 0.9 + Math.random() * 0.6;
      dummy.position.set(t.x, y + 1.3 * s, t.z);
      dummy.scale.setScalar(s); dummy.rotation.y = Math.random() * 6.28;
      dummy.updateMatrix();
      this.oakTrunkIM.setMatrixAt(i, dummy.matrix);
      dummy.position.y = y + 3.4 * s;
      dummy.scale.set(s, s * 0.8, s);
      dummy.updateMatrix();
      this.oakLeafIM.setMatrixAt(i, dummy.matrix);
      this.trees.push({ x: t.x, z: t.z, alive: true, respawn: 0, s, kind: 'oak', idx: i });
      G.colliders.push({ x: t.x, z: t.z, r: 0.6, owner: null });
    });
    G.scene.add(this.oakTrunkIM, this.oakLeafIM);

    // --- birches (pale slender trunks) ---
    const birchTrunkGeo = new THREE.CylinderGeometry(0.14, 0.2, 4.2, 6);
    const birchTrunkMat = new THREE.MeshLambertMaterial({ color: 0xd8d4c4 });
    const birchLeafGeo = new THREE.SphereGeometry(1.3, 6, 5);
    const birchLeafMat = new THREE.MeshLambertMaterial({ color: 0x6a8a38 });
    this.birchTrunkIM = new THREE.InstancedMesh(birchTrunkGeo, birchTrunkMat, birches.length);
    this.birchLeafIM = new THREE.InstancedMesh(birchLeafGeo, birchLeafMat, birches.length);
    this.birchTrunkIM.castShadow = this.birchLeafIM.castShadow = true;
    birches.forEach((t, i) => {
      const y = terrainHeight(t.x, t.z);
      const s = 0.85 + Math.random() * 0.5;
      dummy.position.set(t.x, y + 2.1 * s, t.z);
      dummy.scale.setScalar(s); dummy.rotation.y = Math.random() * 6.28;
      dummy.updateMatrix();
      this.birchTrunkIM.setMatrixAt(i, dummy.matrix);
      dummy.position.y = y + 4.4 * s;
      dummy.scale.set(s, s * 1.25, s);
      dummy.updateMatrix();
      this.birchLeafIM.setMatrixAt(i, dummy.matrix);
      this.trees.push({ x: t.x, z: t.z, alive: true, respawn: 0, s, kind: 'birch', idx: i });
      G.colliders.push({ x: t.x, z: t.z, r: 0.4, owner: null });
    });
    G.scene.add(this.birchTrunkIM, this.birchLeafIM);

    // --- rocks: hills + scattered ---
    const rockGeo = new THREE.DodecahedronGeometry(1.15, 0);
    const rockMat = new THREE.MeshLambertMaterial({ color: 0x77787f, flatShading: true });
    const rockSpots = [];
    for (let i = 0; i < 95; i++) {
      let x, z;
      if (i < 60) { x = -185 + Math.random() * 140; z = -70 + Math.random() * 100; }
      else { x = -195 + Math.random() * 390; z = -195 + Math.random() * 390; }
      if (Math.hypot(x, z) < 30 || Math.abs(z - POI.roadZ) < 7) continue;
      if (LAKES.some(L => dist2d(x, z, L.x, L.z) < L.r + 2)) continue;
      rockSpots.push({ x, z });
    }
    this.rockIM = new THREE.InstancedMesh(rockGeo, rockMat, rockSpots.length);
    this.rockIM.castShadow = true;
    rockSpots.forEach((r, i) => {
      const s = 0.7 + Math.random() * 0.9;
      dummy.position.set(r.x, terrainHeight(r.x, r.z) + 0.35 * s, r.z);
      dummy.scale.set(s, s * (0.6 + Math.random() * 0.5), s);
      dummy.rotation.set(Math.random(), Math.random() * 6, Math.random());
      dummy.updateMatrix();
      this.rockIM.setMatrixAt(i, dummy.matrix);
      this.rocks.push({ x: r.x, z: r.z, alive: true, respawn: 0, s });
      G.colliders.push({ x: r.x, z: r.z, r: s * 0.9, owner: null });
    });
    G.scene.add(this.rockIM);

    // --- berry bushes ---
    const bushGeo = new THREE.SphereGeometry(0.75, 7, 5);
    const bushMat = new THREE.MeshLambertMaterial({ color: 0x35682d });
    const bushSpots = [];
    for (let i = 0; i < 50; i++) {
      const a = Math.random() * 6.28, d = 30 + Math.random() * 55;
      const x = Math.cos(a) * d, z = Math.sin(a) * d * 0.8 + 10;
      if (Math.abs(z - POI.roadZ) < 6 || inLake(x, z)) continue;
      bushSpots.push({ x, z });
    }
    this.bushIM = new THREE.InstancedMesh(bushGeo, bushMat, bushSpots.length);
    bushSpots.forEach((b, i) => {
      dummy.position.set(b.x, terrainHeight(b.x, b.z) + 0.5, b.z);
      dummy.scale.set(1, 0.8, 1); dummy.rotation.set(0, Math.random() * 6, 0);
      dummy.updateMatrix();
      this.bushIM.setMatrixAt(i, dummy.matrix);
      this.bushes.push({ x: b.x, z: b.z, alive: true, respawn: 0 });
    });
    G.scene.add(this.bushIM);

    // --- herb patches ---
    const herbGeo = new THREE.ConeGeometry(0.35, 0.75, 5);
    const herbMat = new THREE.MeshLambertMaterial({ color: 0x7fa86a });
    const herbSpots = [];
    for (let i = 0; i < 46; i++) {
      const a = Math.random() * 6.28, d = 35 + Math.random() * 90;
      const x = Math.cos(a) * d, z = Math.sin(a) * d * 0.9 + 5;
      if (badSpot(x, z)) continue;
      herbSpots.push({ x, z });
    }
    this.herbIM = new THREE.InstancedMesh(herbGeo, herbMat, herbSpots.length);
    herbSpots.forEach((h, i) => {
      dummy.position.set(h.x, terrainHeight(h.x, h.z) + 0.35, h.z);
      dummy.scale.set(1, 1, 1); dummy.rotation.set(0, Math.random() * 6, 0);
      dummy.updateMatrix();
      this.herbIM.setMatrixAt(i, dummy.matrix);
      this.herbs.push({ x: h.x, z: h.z, alive: true, respawn: 0 });
    });
    G.scene.add(this.herbIM);

    // --- ferns & undergrowth: pure ground cover, the forest floor lives ---
    const fernGeo = new THREE.ConeGeometry(0.5, 0.55, 5);
    const fernMat = new THREE.MeshLambertMaterial({ color: 0x38542c });
    const fernSpots = [];
    for (let i = 0; i < 340; i++) {
      let x, z;
      if (i < 160) { x = 42 + Math.random() * 145; z = -92 + Math.random() * 115; }
      else if (i < 280) { x = -160 + Math.random() * 320; z = 62 + Math.random() * 105; }
      else { x = -195 + Math.random() * 390; z = -195 + Math.random() * 390; }
      if (badSpot(x, z)) continue;
      fernSpots.push({ x, z });
    }
    const fernIM = new THREE.InstancedMesh(fernGeo, fernMat, fernSpots.length);
    fernSpots.forEach((f, i) => {
      dummy.position.set(f.x, terrainHeight(f.x, f.z) + 0.22, f.z);
      const s = 0.6 + Math.random() * 0.9;
      dummy.scale.set(s * 1.4, s * 0.6, s * 1.4);
      dummy.rotation.set(0, Math.random() * 6, 0);
      dummy.updateMatrix();
      fernIM.setMatrixAt(i, dummy.matrix);
    });
    G.scene.add(fernIM);

    // fallen logs in the deep woods — old timber, older stories
    const logMat = new THREE.MeshLambertMaterial({ color: 0x4e3a26 });
    for (let i = 0; i < 14; i++) {
      const x = 50 + Math.random() * 130, z = -85 + Math.random() * 100 * (i % 2 ? 1 : -0.3);
      if (badSpot(x, z)) continue;
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 2.6 + Math.random() * 1.6, 6), logMat);
      log.position.set(x, terrainHeight(x, z) + 0.3, z);
      log.rotation.set(0, Math.random() * 3, Math.PI / 2 + (Math.random() - 0.5) * 0.2);
      log.castShadow = true;
      G.scene.add(log);
    }
  }

  _hideInstance(im, i) {
    const m = new THREE.Matrix4().makeScale(0.001, 0.001, 0.001);
    im.setMatrixAt(i, m);
    im.instanceMatrix.needsUpdate = true;
  }

  _treeIMs(kind) {
    return kind === 'pine' ? [this.pineTrunkIM, this.pineLeafIM]
      : kind === 'oak' ? [this.oakTrunkIM, this.oakLeafIM]
      : [this.birchTrunkIM, this.birchLeafIM];
  }

  _restoreTree(ti) {
    const t = this.trees[ti], dummy = new THREE.Object3D();
    const [trunkIM, leafIM] = this._treeIMs(t.kind);
    const y = terrainHeight(t.x, t.z);
    const trunkY = t.kind === 'pine' ? 1.6 : t.kind === 'oak' ? 1.3 : 2.1;
    const leafY = t.kind === 'pine' ? 4.8 : t.kind === 'oak' ? 3.4 : 4.4;
    dummy.position.set(t.x, y + trunkY * t.s, t.z);
    dummy.scale.setScalar(t.s);
    dummy.updateMatrix();
    trunkIM.setMatrixAt(t.idx, dummy.matrix);
    if (!t.dead) {
      dummy.position.y = y + leafY * t.s;
      if (t.kind === 'oak') dummy.scale.set(t.s, t.s * 0.8, t.s);
      if (t.kind === 'birch') dummy.scale.set(t.s, t.s * 1.25, t.s);
      dummy.updateMatrix();
      leafIM.setMatrixAt(t.idx, dummy.matrix);
    }
    trunkIM.instanceMatrix.needsUpdate = leafIM.instanceMatrix.needsUpdate = true;
  }
  _restoreRock(i) {
    const r = this.rocks[i], dummy = new THREE.Object3D();
    dummy.position.set(r.x, terrainHeight(r.x, r.z) + 0.35 * r.s, r.z);
    dummy.scale.set(r.s, r.s * 0.8, r.s); dummy.updateMatrix();
    this.rockIM.setMatrixAt(i, dummy.matrix);
    this.rockIM.instanceMatrix.needsUpdate = true;
  }
  _restoreBush(i) {
    const b = this.bushes[i], dummy = new THREE.Object3D();
    dummy.position.set(b.x, terrainHeight(b.x, b.z) + 0.5, b.z);
    dummy.scale.set(1, 0.8, 1); dummy.updateMatrix();
    this.bushIM.setMatrixAt(i, dummy.matrix);
    this.bushIM.instanceMatrix.needsUpdate = true;
  }
  _restoreHerb(i) {
    const h = this.herbs[i], dummy = new THREE.Object3D();
    dummy.position.set(h.x, terrainHeight(h.x, h.z) + 0.35, h.z);
    dummy.updateMatrix();
    this.herbIM.setMatrixAt(i, dummy.matrix);
    this.herbIM.instanceMatrix.needsUpdate = true;
  }

  // Harvest APIs used by the player
  nearestResource(x, z, maxD = 3.2) {
    let best = null;
    const consider = (arr, kind, label) => {
      arr.forEach((r, i) => {
        if (!r.alive) return;
        const d = dist2d(x, z, r.x, r.z);
        if (d < maxD + (kind === 'tree' ? 0.6 : 0) && (!best || d < best.d))
          best = { kind, i, d, label };
      });
    };
    const axe = (G.playerInv.axe || 0) > 0, pick = (G.playerInv.pickaxe || 0) > 0;
    consider(this.trees, 'tree', axe ? 'chop tree (+6 wood)' : 'break branches (+3 wood — slow without an axe)');
    consider(this.rocks, 'rock', pick ? 'mine rock (+6 stone)' : 'pry loose stone (+2 — slow without a pickaxe)');
    consider(this.bushes, 'bush', 'gather wild cabbage (+2)');
    consider(this.herbs, 'herb', 'pick herbs (+2)');
    return best;
  }

  harvest(kind, i) {
    const give = (res, n) => playerAdd(res, n);
    if (kind === 'tree') {
      const t = this.trees[i]; t.alive = false; t.respawn = 100;
      const [trunkIM, leafIM] = this._treeIMs(t.kind);
      this._hideInstance(trunkIM, t.idx); this._hideInstance(leafIM, t.idx);
      const ci = G.colliders.findIndex(c => c.x === t.x && c.z === t.z && !c.owner);
      if (ci >= 0) G.colliders.splice(ci, 1);
      give('wood', (G.playerInv.axe || 0) > 0 ? 6 : 3);
    } else if (kind === 'rock') {
      const r = this.rocks[i]; r.alive = false; r.respawn = 140;
      this._hideInstance(this.rockIM, i);
      const ci = G.colliders.findIndex(c => c.x === r.x && c.z === r.z && !c.owner);
      if (ci >= 0) G.colliders.splice(ci, 1);
      give('stone', (G.playerInv.pickaxe || 0) > 0 ? 6 : 2);
    } else if (kind === 'bush') {
      const b = this.bushes[i]; b.alive = false; b.respawn = 70;
      this._hideInstance(this.bushIM, i);
      give('cabbage', 2);
    } else if (kind === 'herb') {
      const h = this.herbs[i]; h.alive = false; h.respawn = 90;
      this._hideInstance(this.herbIM, i);
      give('herbs', 2);
    }
  }

  // ---------- the Cursed Ruins: a fallen keep crawling with the dead ----------
  _buildRuins() {
    const mat = new THREE.MeshLambertMaterial({ color: 0x5c5c68 });
    const dark = new THREE.MeshLambertMaterial({ color: 0x44444e });
    const g = new THREE.Group();
    const { x: cx, z: cz } = POI.ruins;
    // outer broken curtain wall
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      if (i % 5 === 0) continue; // collapsed gaps to slip through
      const d = 24 + Math.random() * 4;
      const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      const w = 4 + Math.random() * 3, h = 2 + Math.random() * 3.5;
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 1.2), mat);
      m.position.set(x, terrainHeight(x, z) + h / 2 - 0.3, z);
      m.rotation.y = a + Math.PI / 2;
      m.rotation.z = (Math.random() - 0.5) * 0.12;
      m.castShadow = true;
      g.add(m);
      G.colliders.push({ x, z, r: Math.max(w, 1.2) * 0.42, owner: null });
    }
    // inner pillars and toppled arches
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + 0.4;
      const d = 9 + Math.random() * 8;
      const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      const h = 2.5 + Math.random() * 3.5;
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, h, 7), mat);
      p.position.set(x, terrainHeight(x, z) + h / 2 - 0.2, z);
      p.rotation.z = (Math.random() - 0.5) * (i % 3 === 0 ? 0.9 : 0.1); // some toppled
      p.castShadow = true;
      g.add(p);
      G.colliders.push({ x, z, r: 0.8, owner: null });
    }
    // one standing archway
    const archX = cx - 12, archZ = cz + 8;
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(1.1, 5, 1.1), mat);
      p.position.set(archX + s * 2, terrainHeight(archX, archZ) + 2.5, archZ);
      p.castShadow = true; g.add(p);
      G.colliders.push({ x: archX + s * 2, z: archZ, r: 0.8, owner: null });
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(5.4, 1, 1.2), mat);
    lintel.position.set(archX, terrainHeight(archX, archZ) + 5.2, archZ);
    g.add(lintel);
    // the broken tower: a stump of stacked rings
    const tx = cx + 10, tz = cz - 10;
    for (let lvl = 0; lvl < 4; lvl++) {
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(3.2 - lvl * 0.2, 3.4 - lvl * 0.2, 1.6, 9), lvl % 2 ? dark : mat);
      ring.position.set(tx, terrainHeight(tx, tz) + 0.8 + lvl * 1.6, tz);
      ring.rotation.y = lvl * 0.2;
      ring.castShadow = true;
      g.add(ring);
    }
    G.colliders.push({ x: tx, z: tz, r: 3.5, owner: null });
    // central shattered altar — and the reliquary the dead still guard
    const alt = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.2, 1.4, 8), mat);
    alt.position.set(cx, terrainHeight(cx, cz) + 0.7, cz);
    g.add(alt);
    G.colliders.push({ x: cx, z: cz, r: 2.1, owner: null });
    const rel = new THREE.Group();
    const relBox = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.7, 0.8), dark);
    relBox.position.y = 0.35; relBox.castShadow = true; rel.add(relBox);
    const relLid = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.25, 0.9), mat);
    relLid.position.y = 0.8; rel.add(relLid);
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.18),
      new THREE.MeshBasicMaterial({ color: 0x7fb8d8 }));
    gem.position.y = 1.05; rel.add(gem);
    const relLight = new THREE.PointLight(0x6fa8c8, 3, 8);
    relLight.position.y = 1.2; rel.add(relLight);
    const rx = cx + 2.8, rz = cz + 1;
    rel.position.set(rx, terrainHeight(rx, rz), rz);
    g.add(rel);
    POI.ruins.reliquary = { x: rx, z: rz };
    // bone piles: the dead have been busy
    const boneMat = new THREE.MeshLambertMaterial({ color: 0xcfc6b0 });
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * 6.28, d = 4 + Math.random() * 16;
      const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      for (let j = 0; j < 3; j++) {
        const bone = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.5 + Math.random() * 0.3, 4), boneMat);
        bone.position.set(x + (Math.random() - 0.5) * 0.8, terrainHeight(x, z) + 0.08, z + (Math.random() - 0.5) * 0.8);
        bone.rotation.set(Math.PI / 2, Math.random() * 3, 0);
        g.add(bone);
      }
    }
    G.scene.add(g);
  }

  _buildBanditCamp() {
    const g = new THREE.Group();
    const { x: cx, z: cz } = POI.banditCamp;
    const tentMat = new THREE.MeshLambertMaterial({ color: 0x6e4a2c });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.6;
      const x = cx + Math.cos(a) * 9, z = cz + Math.sin(a) * 9;
      const tent = new THREE.Mesh(new THREE.ConeGeometry(2.6, 3.2, 5), tentMat);
      tent.position.set(x, terrainHeight(x, z) + 1.5, z);
      tent.castShadow = true;
      g.add(tent);
      G.colliders.push({ x, z, r: 2.2, owner: null });
    }
    const fire = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.9, 6),
      new THREE.MeshBasicMaterial({ color: 0xff7722 }));
    fire.position.set(cx, terrainHeight(cx, cz) + 0.5, cz);
    g.add(fire);
    this.banditFire = new THREE.PointLight(0xff8833, 8, 20);
    this.banditFire.position.copy(fire.position).add(new THREE.Vector3(0, 1, 0));
    g.add(this.banditFire);
    // crude spike barricades
    const spikeMat = new THREE.MeshLambertMaterial({ color: 0x4e3a24 });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      const x = cx + Math.cos(a) * 14, z = cz + Math.sin(a) * 14;
      for (let j = -1; j <= 1; j++) {
        const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.09, 1.6, 5), spikeMat);
        sp.position.set(x + Math.cos(a + 1.57) * j * 0.7,
          terrainHeight(x, z) + 0.6, z + Math.sin(a + 1.57) * j * 0.7);
        sp.rotation.z = (j - 0.5) * 0.5; sp.rotation.x = 0.4;
        g.add(sp);
      }
    }
    // the loot stash under a tarp
    const stash = new THREE.Group();
    const stashMat = new THREE.MeshLambertMaterial({ color: 0x6b4e2e });
    const mkBox = (w, h, d, x, y, z, ry) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), stashMat);
      m.position.set(x, y, z); m.rotation.y = ry || 0; m.castShadow = true;
      stash.add(m);
    };
    mkBox(1.0, 0.7, 0.8, 0, 0.35, 0, 0.2);
    mkBox(0.8, 0.6, 0.7, 0.9, 0.3, 0.4, -0.4);
    mkBox(0.7, 0.5, 0.6, -0.3, 0.95, 0.1, 0.5);
    const tarp = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.08, 1.6),
      new THREE.MeshLambertMaterial({ color: 0x55503e }));
    tarp.position.set(0.2, 1.35, 0.2); tarp.rotation.z = 0.12;
    stash.add(tarp);
    const sx = cx + 3, sz = cz - 3;
    stash.position.set(sx, terrainHeight(sx, sz), sz);
    g.add(stash);
    POI.banditCamp.stash = { x: sx, z: sz };
    G.scene.add(g);
  }

  _buildDen() {
    const mat = new THREE.MeshLambertMaterial({ color: 0x3a3f4a });
    const { x: cx, z: cz, r } = POI.werewolfDen;
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const x = cx + Math.cos(a) * r * 0.85, z = cz + Math.sin(a) * r * 0.85;
      const h = 4 + Math.random() * 3;
      const m = new THREE.Mesh(new THREE.BoxGeometry(1.6, h, 1.1), mat);
      m.position.set(x, terrainHeight(x, z) + h / 2 - 0.4, z);
      m.rotation.y = a; m.rotation.z = (Math.random() - 0.5) * 0.2;
      m.castShadow = true;
      G.scene.add(m);
      G.colliders.push({ x, z, r: 1.1, owner: null });
    }
  }

  _buildRoadProps() {
    const mat = new THREE.MeshLambertMaterial({ color: 0x5a4228 });
    for (const x of [-60, 0, 60]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.25, 2.4, 0.25), mat);
      const z = POI.roadZ + 5;
      post.position.set(x, terrainHeight(x, z) + 1.2, z);
      G.scene.add(post);
      const sign = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.5, 0.1), mat);
      sign.position.set(x, terrainHeight(x, z) + 2.1, z);
      sign.rotation.y = 0.2;
      G.scene.add(sign);
    }
  }

  // ---------- lighting, sun & moon discs, stars ----------
  _buildLights() {
    G.hemi = new THREE.HemisphereLight(0xbfd4e8, 0x3a3325, 0.9);
    G.scene.add(G.hemi);
    G.sun = new THREE.DirectionalLight(0xffe8c0, 2.2);
    G.sun.castShadow = true;
    G.sun.shadow.mapSize.set(2048, 2048);
    const sc = G.sun.shadow.camera;
    sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70;
    sc.near = 10; sc.far = 260;
    G.scene.add(G.sun, G.sun.target);
    G.scene.fog = new THREE.Fog(0x8fa3b8, 60, 320);
    G.scene.background = new THREE.Color(0x8fa3b8);
    this.moon = new THREE.DirectionalLight(0x8899cc, 0.0);
    G.scene.add(this.moon, this.moon.target);
  }

  _buildSky() {
    // the sun and the moon are BODIES in the sky, not just light values
    this.sunDisc = new THREE.Mesh(new THREE.SphereGeometry(9, 12, 10),
      new THREE.MeshBasicMaterial({ color: 0xffd9a0, fog: false }));
    G.scene.add(this.sunDisc);
    this.moonDisc = new THREE.Mesh(new THREE.SphereGeometry(6.5, 12, 10),
      new THREE.MeshBasicMaterial({ color: 0xdfe6f0, fog: false }));
    G.scene.add(this.moonDisc);
    // stars: a dome of points that only the night reveals
    const starPos = new Float32Array(700 * 3);
    for (let i = 0; i < 700; i++) {
      const a = Math.random() * Math.PI * 2;
      const el = Math.random() * Math.PI * 0.48 + 0.05;
      const r = 430;
      starPos[i * 3] = Math.cos(a) * Math.cos(el) * r;
      starPos[i * 3 + 1] = Math.sin(el) * r;
      starPos[i * 3 + 2] = Math.sin(a) * Math.cos(el) * r;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    this.stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
      color: 0xcdd8e8, size: 1.6, transparent: true, opacity: 0, fog: false,
      sizeAttenuation: false }));
    G.scene.add(this.stars);
  }

  // color keys for the day cycle
  static SKY = [
    { t: 0.00, sky: 0x0a0d1c, fog: 0x0a0d1c, sun: 0.0, hemi: 0.12 },
    { t: 0.22, sky: 0x1c1830, fog: 0x1c1830, sun: 0.0, hemi: 0.2 },
    { t: 0.27, sky: 0xc98e5a, fog: 0xb8916e, sun: 1.0, hemi: 0.55 },
    { t: 0.40, sky: 0x8fb6d8, fog: 0x9db4c8, sun: 2.2, hemi: 0.95 },
    { t: 0.60, sky: 0x8fb6d8, fog: 0x9db4c8, sun: 2.2, hemi: 0.95 },
    { t: 0.73, sky: 0xc9744a, fog: 0xa8766e, sun: 1.0, hemi: 0.5 },
    { t: 0.79, sky: 0x1c1830, fog: 0x1c1830, sun: 0.0, hemi: 0.2 },
    { t: 1.00, sky: 0x0a0d1c, fog: 0x0a0d1c, sun: 0.0, hemi: 0.12 },
  ];

  update(dt) {
    // advance clock
    G.time += dt / G.DAY_LENGTH;
    if (G.time >= 1) { G.time -= 1; G.day++; }

    // resource respawns
    const tick = (arr, restore) => arr.forEach((r, i) => {
      if (!r.alive) {
        r.respawn -= dt;
        if (r.respawn <= 0) {
          r.alive = true;
          restore(i);
          if (arr === this.trees)
            G.colliders.push({ x: r.x, z: r.z, r: r.kind === 'birch' ? 0.4 : 0.55, owner: null });
          else if (arr === this.rocks)
            G.colliders.push({ x: r.x, z: r.z, r: (r.s || 1) * 0.9, owner: null });
        }
      }
    });
    tick(this.trees, i => this._restoreTree(i));
    tick(this.rocks, i => this._restoreRock(i));
    tick(this.bushes, i => this._restoreBush(i));
    tick(this.herbs, i => this._restoreHerb(i));

    // sun position orbits the player so shadows stay crisp
    const t = G.time;
    const sunA = (t - 0.25) * Math.PI * 2; // 0 at dawn
    const px = G.player ? G.player.pos.x : 0, pz = G.player ? G.player.pos.z : 0;
    const se = Math.sin((t - 0.25) / 0.5 * Math.PI); // day elevation curve
    G.sun.position.set(px + Math.cos(sunA) * 120, Math.max(8, se * 140), pz + 40);
    G.sun.target.position.set(px, 0, pz);
    this.moon.position.set(px - 60, 100, pz - 40);
    this.moon.target.position.set(px, 0, pz);
    this.moon.intensity = isNight() ? 0.35 : 0;

    // the celestial bodies ride their arcs
    const sunDir = new THREE.Vector3(Math.cos(sunA) * 120, Math.max(2, se * 140), 40).normalize();
    this.sunDisc.position.set(px + sunDir.x * 400, sunDir.y * 400, pz + sunDir.z * 400);
    this.sunDisc.visible = se > -0.15;
    // the moon rises opposite the sun
    const moonEl = Math.max(0.12, -se * 0.9 + 0.15);
    this.moonDisc.position.set(px - Math.cos(sunA) * 320, moonEl * 340, pz - 60);
    this.moonDisc.visible = isNight() || se < 0.25;
    const redMoon = G.redMoon && G.redMoon.active && isNight();
    this.moonDisc.material.color.setHex(redMoon ? 0xc03030 : 0xdfe6f0);
    this.moonDisc.scale.setScalar(redMoon ? 1.45 : 1);
    // stars fade in with deep night
    const nightDepth = t < 0.22 ? 1 - t / 0.22 * 0.4 : t > 0.8 ? (t - 0.8) / 0.2 : 0;
    this.stars.material.opacity = Math.min(0.9, nightDepth) * (redMoon ? 0.5 : 1);
    this.stars.position.set(px, 0, pz);
    if (redMoon) this.stars.material.color.setHex(0xd8b8b8);
    else this.stars.material.color.setHex(0xcdd8e8);

    // gentle water shimmer
    if (this.waters) {
      const w = Math.sin(performance.now() * 0.0008) * 0.05;
      for (const water of this.waters) water.position.y = -0.55 + w;
    }

    // interpolate sky/fog colors
    const keys = World.SKY;
    let a = keys[0], b = keys[keys.length - 1];
    for (let i = 0; i < keys.length - 1; i++)
      if (t >= keys[i].t && t <= keys[i + 1].t) { a = keys[i]; b = keys[i + 1]; break; }
    const f = (t - a.t) / Math.max(0.0001, b.t - a.t);
    const cs = new THREE.Color(a.sky).lerp(new THREE.Color(b.sky), f);
    const cf = new THREE.Color(a.fog).lerp(new THREE.Color(b.fog), f);
    // the Red Moon stains the night crimson
    if (redMoon) {
      cs.lerp(new THREE.Color(0x2e070c), 0.85);
      cf.lerp(new THREE.Color(0x30090d), 0.85);
      this.moon.color.setHex(0xc03030);
    } else {
      this.moon.color.setHex(0x8899cc);
    }
    G.scene.background.copy(cs);
    G.scene.fog.color.copy(cf);
    G.scene.fog.near = isNight() ? 28 : 60;
    G.scene.fog.far = isNight() ? 150 : 320;
    G.sun.intensity = a.sun + (b.sun - a.sun) * f;
    G.hemi.intensity = a.hemi + (b.hemi - a.hemi) * f;
    this.banditFire.intensity = isNight() ? 9 : 2;
  }
}
