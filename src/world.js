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
    // birches love the water: white bark rings every lake shore (trees bible)
    for (const L of LAKES)
      scatter(11, () => {
        const a = Math.random() * 6.28, d = L.r + 4 + Math.random() * 6;
        return [L.x + Math.cos(a) * d, L.z + Math.sin(a) * d];
      }, birches);
    // dead pines in the cursed north
    const deadPines = [];
    scatter(30, () => [-150 + Math.random() * 300, -190 + Math.random() * 45], deadPines);

    // Art bible "detail & variation": no two trees the same color. InstancedMesh
    // per-instance colors carry bark and foliage variation; deep-forest pines run
    // darker (the spruce read), meadow trees lighter. Materials go white so the
    // instance color IS the color.
    const vary = (im, i, base, dh, dl) => {
      _tint.setHex(base);
      _tint.offsetHSL((Math.random() - 0.5) * dh, (Math.random() - 0.5) * 0.06,
        (Math.random() - 0.5) * dl);
      im.setColorAt(i, _tint);
    };
    const _tint = new THREE.Color();

    // --- pines (cone canopy) ---
    const pineTrunkGeo = new THREE.CylinderGeometry(0.28, 0.42, 3.2, 6);
    const pineTrunkMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const pineLeafGeo = new THREE.ConeGeometry(1.9, 4.6, 7);
    const pineLeafMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const allPines = [...pines.map(p => ({ ...p, dead: false })),
                      ...deadPines.map(p => ({ ...p, dead: true }))];
    this.pineTrunkIM = new THREE.InstancedMesh(pineTrunkGeo, pineTrunkMat, allPines.length);
    this.pineLeafIM = new THREE.InstancedMesh(pineLeafGeo, pineLeafMat, allPines.length);
    this.pineTrunkIM.castShadow = this.pineLeafIM.castShadow = true;
    allPines.forEach((t, i) => {
      const y = terrainHeight(t.x, t.z);
      // deep forest & north = the spruce read: taller, darker, denser
      const deep = t.z < -30 || (t.z > 62 && Math.abs(t.x) < 100);
      const s = (0.8 + Math.random() * 0.7) * (deep ? 1.15 : 1);
      dummy.position.set(t.x, y + 1.6 * s, t.z);
      dummy.scale.setScalar(s); dummy.rotation.y = Math.random() * 6.28;
      dummy.updateMatrix();
      this.pineTrunkIM.setMatrixAt(i, dummy.matrix);
      vary(this.pineTrunkIM, i, t.dead ? 0x6a5f52 : 0x4a3421, 0.02, 0.05);
      if (t.dead) dummy.scale.setScalar(0.001);
      else dummy.position.y = y + 4.8 * s;
      dummy.updateMatrix();
      this.pineLeafIM.setMatrixAt(i, dummy.matrix);
      vary(this.pineLeafIM, i, deep ? 0x203a1a : 0x2a4520, 0.03, 0.05);
      this.trees.push({ x: t.x, z: t.z, alive: true, respawn: 0, s, kind: 'pine', idx: i, dead: t.dead });
      G.colliders.push({ x: t.x, z: t.z, r: 0.55, owner: null });
    });
    G.scene.add(this.pineTrunkIM, this.pineLeafIM);

    // --- oaks (round canopy) ---
    const oakTrunkGeo = new THREE.CylinderGeometry(0.34, 0.5, 2.6, 6);
    const oakTrunkMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const oakLeafGeo = new THREE.SphereGeometry(2.1, 7, 6);
    const oakLeafMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
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
      vary(this.oakTrunkIM, i, 0x54402a, 0.02, 0.06);
      dummy.position.y = y + 3.4 * s;
      dummy.scale.set(s, s * 0.8, s);
      dummy.updateMatrix();
      this.oakLeafIM.setMatrixAt(i, dummy.matrix);
      vary(this.oakLeafIM, i, 0x3e5c26, 0.04, 0.07);
      this.trees.push({ x: t.x, z: t.z, alive: true, respawn: 0, s, kind: 'oak', idx: i });
      G.colliders.push({ x: t.x, z: t.z, r: 0.6, owner: null });
    });
    G.scene.add(this.oakTrunkIM, this.oakLeafIM);

    // --- birches (pale slender trunks) ---
    const birchTrunkGeo = new THREE.CylinderGeometry(0.14, 0.2, 4.2, 6);
    const birchTrunkMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const birchLeafGeo = new THREE.SphereGeometry(1.3, 6, 5);
    const birchLeafMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
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
      vary(this.birchTrunkIM, i, 0xd8d4c4, 0.01, 0.04);
      dummy.position.y = y + 4.4 * s;
      dummy.scale.set(s, s * 1.25, s);
      dummy.updateMatrix();
      this.birchLeafIM.setMatrixAt(i, dummy.matrix);
      vary(this.birchLeafIM, i, 0x6a8a38, 0.045, 0.07);
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

    // --- grass tufts: the ground layer (vegetation guide) ---
    // Grass grows in PATCHES, not confetti — clustered clumps read as ground
    // cover at a distance. It may grow inside the settlement (unlike trees);
    // only roads, water, POIs, and bare rock refuse it.
    const badGround = (x, z) =>
      Math.abs(z - POI.roadZ) < 9 ||
      LAKES.some(L => dist2d(x, z, L.x, L.z) < L.r + 2) ||
      dist2d(x, z, POI.ruins.x, POI.ruins.z) < POI.ruins.r ||
      dist2d(x, z, POI.banditCamp.x, POI.banditCamp.z) < POI.banditCamp.r ||
      terrainHeight(x, z) > 11 || Math.abs(x) > 190 || Math.abs(z) > 190;
    const grassGeo = new THREE.ConeGeometry(0.15, 0.55, 4);
    const grassMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const grassSpots = [];
    const grassPatch = (cx, cz, base, sMin, sMax, tufts) => {
      for (let i = 0; i < tufts; i++) {
        const a = Math.random() * 6.28, d = Math.random() * 4.2;
        const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
        if (badGround(x, z)) continue;
        grassSpots.push({ x, z, base, s: sMin + Math.random() * (sMax - sMin) });
      }
    };
    // short field grass through and around the settlement
    for (let p = 0; p < 26; p++) {
      const a = Math.random() * 6.28, d = Math.random() * 34;
      grassPatch(Math.cos(a) * d, Math.sin(a) * d, 0x5a6438, 0.5, 0.9, 12);
    }
    // tall wild meadow grass across the open map
    for (let p = 0; p < 60; p++)
      grassPatch(-190 + Math.random() * 380, -190 + Math.random() * 380, 0x596236, 1.0, 1.7, 13);
    // dark forest-floor grass under both canopies
    for (let p = 0; p < 26; p++)
      grassPatch(42 + Math.random() * 145, -92 + Math.random() * 115, 0x3c4a2a, 0.6, 1.0, 11);
    for (let p = 0; p < 20; p++)
      grassPatch(-160 + Math.random() * 320, 62 + Math.random() * 105, 0x3c4a2a, 0.6, 1.0, 11);
    // dry thin grass on the rocky west hills
    for (let p = 0; p < 24; p++)
      grassPatch(-185 + Math.random() * 130, -70 + Math.random() * 100, 0x83764a, 0.6, 1.2, 11);
    const grassIM = new THREE.InstancedMesh(grassGeo, grassMat, grassSpots.length);
    grassSpots.forEach((gr, i) => {
      dummy.position.set(gr.x, terrainHeight(gr.x, gr.z) + 0.24 * gr.s, gr.z);
      dummy.scale.set(gr.s * (0.8 + Math.random() * 0.6), gr.s, gr.s * (0.8 + Math.random() * 0.6));
      dummy.rotation.set((Math.random() - 0.5) * 0.16, Math.random() * 6, (Math.random() - 0.5) * 0.16);
      dummy.updateMatrix();
      grassIM.setMatrixAt(i, dummy.matrix);
      vary(grassIM, i, gr.base, 0.03, 0.08);
    });
    G.scene.add(grassIM);

    // --- young saplings: small filler that makes the forest read layered ---
    const sapGeo = new THREE.ConeGeometry(0.55, 1.5, 5);
    const sapMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const sapSpots = [];
    for (let i = 0; i < 120; i++) {
      let x, z;
      if (i < 55) { x = 42 + Math.random() * 145; z = -92 + Math.random() * 115; }
      else if (i < 95) { x = -160 + Math.random() * 320; z = 62 + Math.random() * 105; }
      else { x = -195 + Math.random() * 390; z = -195 + Math.random() * 390; }
      if (badSpot(x, z)) continue;
      sapSpots.push({ x, z });
    }
    const sapIM = new THREE.InstancedMesh(sapGeo, sapMat, sapSpots.length);
    sapIM.castShadow = true;
    sapSpots.forEach((sp, i) => {
      const s = 0.5 + Math.random() * 0.7;
      dummy.position.set(sp.x, terrainHeight(sp.x, sp.z) + 0.75 * s, sp.z);
      dummy.scale.setScalar(s);
      dummy.rotation.set(0, Math.random() * 6, (Math.random() - 0.5) * 0.1);
      dummy.updateMatrix();
      sapIM.setMatrixAt(i, dummy.matrix);
      vary(sapIM, i, 0x3e5a2c, 0.04, 0.08);
    });
    G.scene.add(sapIM);

    // --- mushrooms: where the dead wood is (detail & variation board) ---
    const shroomStemGeo = new THREE.CylinderGeometry(0.05, 0.07, 0.2, 5);
    const shroomCapGeo = new THREE.ConeGeometry(0.16, 0.14, 6);
    const shroomStemMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const shroomCapMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const shroomSpots = [];
    const addShrooms = (cx, cz, r, n) => {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * 6.28, d = Math.random() * r;
        const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
        if (inLake(x, z) || Math.abs(z - POI.roadZ) < 8) continue;
        shroomSpots.push({ x, z });
      }
    };
    addShrooms(POI.ruins.x, POI.ruins.z, 34, 40);        // the cursed ground fruits
    addShrooms(0, -165, 90, 30);                          // the dead north
    addShrooms(110, -40, 60, 34);                         // deep forest floor
    const stemIM = new THREE.InstancedMesh(shroomStemGeo, shroomStemMat, shroomSpots.length);
    const capIM = new THREE.InstancedMesh(shroomCapGeo, shroomCapMat, shroomSpots.length);
    shroomSpots.forEach((m, i) => {
      const y = terrainHeight(m.x, m.z), s = 0.7 + Math.random() * 0.9;
      dummy.position.set(m.x, y + 0.1 * s, m.z);
      dummy.scale.setScalar(s); dummy.rotation.set(0, Math.random() * 6, 0);
      dummy.updateMatrix();
      stemIM.setMatrixAt(i, dummy.matrix);
      vary(stemIM, i, 0xb8ac96, 0.01, 0.06);
      dummy.position.y = y + 0.24 * s;
      dummy.updateMatrix();
      capIM.setMatrixAt(i, dummy.matrix);
      vary(capIM, i, Math.random() < 0.4 ? 0x8a5a3a : 0x9a8f78, 0.02, 0.08);
    });
    G.scene.add(stemIM, capIM);

    // --- stumps: a felled tree leaves proof (tree bible: stump persistence).
    // One instanced stump per harvestable tree; shown while the tree is down.
    const stumpGeo = new THREE.CylinderGeometry(0.2, 0.3, 0.45, 6);
    const stumpMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    this.stumpIM = new THREE.InstancedMesh(stumpGeo, stumpMat, this.trees.length);
    this.trees.forEach((t, i) => {
      t.stumpIdx = i;
      dummy.position.set(t.x, terrainHeight(t.x, t.z) + 0.2, t.z);
      dummy.rotation.set(0, Math.random() * 6, 0);
      dummy.scale.setScalar(0.001); // hidden until the tree falls
      dummy.updateMatrix();
      this.stumpIM.setMatrixAt(i, dummy.matrix);
      vary(this.stumpIM, i, t.kind === 'birch' ? 0xcac4b2 : 0x6a5238, 0.02, 0.05);
    });
    G.scene.add(this.stumpIM);
    this._growing = []; // trees regrowing after respawn (scale-up animation)

    // --- landmark trees (tree bible): unique shapes that anchor navigation ---
    // THE ELDER OAK — a huge lone oak on the east meadow rise
    {
      const x = 55, z = 28;
      const t = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.4, 5.2, 8),
        new THREE.MeshLambertMaterial({ color: 0x4a3a28 }));
      trunk.position.y = 2.6; trunk.castShadow = true; t.add(trunk);
      for (const [dx, dy, dz, r] of [[0, 6.4, 0, 3.4], [2.2, 5.4, 1, 2.2], [-2.4, 5.6, -0.8, 2.4], [0.5, 5.0, -2.2, 1.9]]) {
        const c = new THREE.Mesh(new THREE.SphereGeometry(r, 7, 6),
          new THREE.MeshLambertMaterial({ color: 0x445e2c }));
        c.position.set(dx, dy, dz); c.castShadow = true; t.add(c);
      }
      t.position.set(x, terrainHeight(x, z), z);
      G.scene.add(t);
      G.colliders.push({ x, z, r: 1.5, owner: null });
    }
    // THE SPLIT PINE — a lightning-struck giant marking the Southwood mouth
    {
      const x = -30, z = 70;
      const t = new THREE.Group();
      const barkMat = new THREE.MeshLambertMaterial({ color: 0x3e3226 });
      const half1 = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.5, 7.5, 6), barkMat);
      half1.position.set(0.35, 3.6, 0); half1.rotation.z = -0.16; half1.castShadow = true; t.add(half1);
      const half2 = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.45, 5.4, 6), barkMat);
      half2.position.set(-0.5, 2.6, 0); half2.rotation.z = 0.34; half2.castShadow = true; t.add(half2);
      const charred = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.62, 1.4, 6),
        new THREE.MeshLambertMaterial({ color: 0x1c1814 }));
      charred.position.y = 0.7; t.add(charred);
      const tuft = new THREE.Mesh(new THREE.ConeGeometry(1.3, 2.6, 6),
        new THREE.MeshLambertMaterial({ color: 0x2a4520 }));
      tuft.position.set(0.7, 7.6, 0); tuft.castShadow = true; t.add(tuft);
      t.position.set(x, terrainHeight(x, z), z);
      G.scene.add(t);
      G.colliders.push({ x, z, r: 0.8, owner: null });
    }
    // THE HANGING TREE — a leafless oak by the bandit road; a warning, or a boast
    {
      const x = POI.banditCamp.x + 22, z = POI.banditCamp.z + 18;
      const t = new THREE.Group();
      const bark = new THREE.MeshLambertMaterial({ color: 0x453a2c });
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.6, 4.6, 6), bark);
      trunk.position.y = 2.3; trunk.castShadow = true; t.add(trunk);
      const bough = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 3.4, 5), bark);
      bough.position.set(1.4, 4.3, 0); bough.rotation.z = Math.PI / 2.25; bough.castShadow = true; t.add(bough);
      for (const [a, l] of [[0.5, 1.8], [-0.7, 1.4], [2.6, 1.5]]) {
        const br = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.13, l, 5), bark);
        br.position.set(Math.cos(a) * 0.7, 4.4 + Math.sin(a) * 0.5, Math.sin(a) * 0.7);
        br.rotation.set(Math.cos(a) * 0.9, 0, 0.8 + a * 0.3); t.add(br);
      }
      const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.3, 4),
        new THREE.MeshLambertMaterial({ color: 0x8a7a5a }));
      rope.position.set(2.4, 3.5, 0); t.add(rope);
      // an empty iron cage swings where the rope ends — the bandits' warning
      const cage = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.8, 0.55),
        new THREE.MeshLambertMaterial({ color: 0x3c4046, wireframe: true }));
      cage.position.set(2.4, 2.5, 0); t.add(cage);
      t.position.set(x, terrainHeight(x, z), z);
      t.rotation.y = 0.4;
      G.scene.add(t);
      G.colliders.push({ x, z, r: 0.7, owner: null });
    }

    // --- cursed trees: twisted landmarks near the ghost ground (tree bible:
    // "twisted or corrupted by the land, often near ghost zones") ---
    const curseBark = new THREE.MeshLambertMaterial({ color: 0x2c2622 });
    const cursePale = new THREE.MeshLambertMaterial({ color: 0x8a8f7a });
    const curseSpot = [];
    for (let i = 0; i < 7; i++) {
      const a = i * 0.9 + 0.5, d = 30 + (i % 3) * 5;
      curseSpot.push([POI.ruins.x + Math.cos(a) * d, POI.ruins.z + Math.sin(a) * d]);
    }
    curseSpot.push([POI.werewolfDen.x + 14, POI.werewolfDen.z + 10]);
    curseSpot.push([POI.werewolfDen.x - 12, POI.werewolfDen.z + 16]);
    for (const [cx, cz] of curseSpot) {
      if (inLake(cx, cz)) continue;
      const t = new THREE.Group();
      let y = 0, ang = (Math.random() - 0.5) * 0.5;
      let node = t;
      // trunk grown wrong: stacked crooked segments, each bending further
      for (let sgm = 0; sgm < 4; sgm++) {
        const h = 1.5 - sgm * 0.22;
        const seg = new THREE.Mesh(
          new THREE.CylinderGeometry(0.16 + (3 - sgm) * 0.07, 0.22 + (3 - sgm) * 0.07, h, 5), curseBark);
        seg.position.y = y + h / 2;
        seg.rotation.z = ang;
        seg.castShadow = true;
        node.add(seg);
        node = seg;
        y = h / 2;
        ang = (Math.random() - 0.5) * 0.9;
      }
      // pale sick growths where leaves should be
      for (let b = 0; b < 3; b++) {
        const blob = new THREE.Mesh(new THREE.SphereGeometry(0.22 + Math.random() * 0.18, 5, 4), cursePale);
        blob.position.set((Math.random() - 0.5) * 1.4, 2.6 + Math.random() * 1.4, (Math.random() - 0.5) * 1.4);
        t.add(blob);
      }
      t.position.set(cx, terrainHeight(cx, cz), cz);
      t.rotation.y = Math.random() * 6.28;
      G.scene.add(t);
      G.colliders.push({ x: cx, z: cz, r: 0.5, owner: null });
    }
  }

  _hideInstance(im, i) {
    const m = new THREE.Matrix4().makeScale(0.001, 0.001, 0.001);
    im.setMatrixAt(i, m);
    im.instanceMatrix.needsUpdate = true;
  }

  // show or hide the persistent stump left by a felled tree
  _stumpVis(t, on) {
    if (t.stumpIdx === undefined) return;
    const d = new THREE.Object3D();
    d.position.set(t.x, terrainHeight(t.x, t.z) + 0.2, t.z);
    d.rotation.y = (t.stumpIdx * 2.39) % 6.28;
    d.scale.setScalar(on ? t.s * 0.9 : 0.001);
    d.updateMatrix();
    this.stumpIM.setMatrixAt(t.stumpIdx, d.matrix);
    this.stumpIM.instanceMatrix.needsUpdate = true;
  }

  _treeIMs(kind) {
    return kind === 'pine' ? [this.pineTrunkIM, this.pineLeafIM]
      : kind === 'oak' ? [this.oakTrunkIM, this.oakLeafIM]
      : [this.birchTrunkIM, this.birchLeafIM];
  }

  _restoreTree(ti) {
    // regrowth, not teleportation: the stump gives way to a sapling that
    // scales up to full height over a few seconds (tree bible: regrowth rules)
    const t = this.trees[ti];
    this._stumpVis(t, false);
    this._growing.push({ ti, p: 0.12 });
    this._growTree(t, 0.12);
    return;
  }

  // place a tree's instances at a fraction of full grown size
  _growTree(t, p) {
    const dummy = new THREE.Object3D();
    const [trunkIM, leafIM] = this._treeIMs(t.kind);
    const y = terrainHeight(t.x, t.z);
    const trunkY = t.kind === 'pine' ? 1.6 : t.kind === 'oak' ? 1.3 : 2.1;
    const leafY = t.kind === 'pine' ? 4.8 : t.kind === 'oak' ? 3.4 : 4.4;
    const s = t.s * p;
    dummy.position.set(t.x, y + trunkY * s, t.z);
    dummy.scale.setScalar(s);
    dummy.updateMatrix();
    trunkIM.setMatrixAt(t.idx, dummy.matrix);
    trunkIM.instanceMatrix.needsUpdate = true;
    if (!t.dead) {
      dummy.position.y = y + leafY * s;
      if (t.kind === 'oak') dummy.scale.set(s, s * 0.8, s);
      else if (t.kind === 'birch') dummy.scale.set(s, s * 1.25, s);
      dummy.updateMatrix();
      leafIM.setMatrixAt(t.idx, dummy.matrix);
      leafIM.instanceMatrix.needsUpdate = true;
    }
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
      this._stumpVis(t, true); // the stump stays: proof of work done here
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

  // NPC harvesting (woodcutters/stonecutters): same fell/mine as the player's,
  // but the yield goes to the worker's hands, not the player's pack.
  npcHarvest(kind, i) {
    if (kind === 'tree') {
      const t = this.trees[i];
      if (!t || !t.alive) return null;
      t.alive = false; t.respawn = 100;
      const [trunkIM, leafIM] = this._treeIMs(t.kind);
      this._hideInstance(trunkIM, t.idx); this._hideInstance(leafIM, t.idx);
      this._stumpVis(t, true);
      const ci = G.colliders.findIndex(c => c.x === t.x && c.z === t.z && !c.owner);
      if (ci >= 0) G.colliders.splice(ci, 1);
      return { res: 'wood', n: 4 };
    }
    if (kind === 'rock') {
      const r = this.rocks[i];
      if (!r || !r.alive) return null;
      r.alive = false; r.respawn = 140;
      this._hideInstance(this.rockIM, i);
      const ci = G.colliders.findIndex(c => c.x === r.x && c.z === r.z && !c.owner);
      if (ci >= 0) G.colliders.splice(ci, 1);
      return { res: 'stone', n: 3 };
    }
    return null;
  }

  // nearest living tree/rock to a point, within maxD — for gatherer villagers
  nearestAlive(kind, x, z, maxD = 65) {
    const arr = kind === 'tree' ? this.trees : this.rocks;
    let best = -1, bd = maxD;
    for (let i = 0; i < arr.length; i++) {
      if (!arr[i].alive) continue;
      const d = dist2d(x, z, arr[i].x, arr[i].z);
      if (d < bd) { bd = d; best = i; }
    }
    return best >= 0 ? { i: best, x: arr[best].x, z: arr[best].z } : null;
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
    // Roads bible: "rarely perfect — weather, time, and little maintenance
    // leave their mark." Ruts, gravel, markers, and one broken promise of a cart.
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
    // wheel ruts: two worn dark lines the carts have ground into the dirt
    // (short segments so they follow the road's rise and fall)
    const rutMat = new THREE.MeshLambertMaterial({ color: 0x4a3d2c });
    const rutGeo = new THREE.BoxGeometry(24, 0.05, 0.5);
    const rutIM = new THREE.InstancedMesh(rutGeo, rutMat, 30);
    const rd = new THREE.Object3D();
    let ri = 0;
    for (let x = -168; x <= 168 && ri < 30; x += 24) {
      for (const off of [-0.9, 0.9]) {
        rd.position.set(x, terrainHeight(x, POI.roadZ + off) + 0.045, POI.roadZ + off);
        rd.rotation.set(0, 0, 0);
        rd.updateMatrix();
        rutIM.setMatrixAt(ri++, rd.matrix);
      }
    }
    rutIM.count = ri;
    G.scene.add(rutIM);
    // gravel patches where the mud got too deep one winter
    const gravelGeo = new THREE.DodecahedronGeometry(0.5, 0);
    const gravelMat = new THREE.MeshLambertMaterial({ color: 0x6e6a62, flatShading: true });
    const gravelIM = new THREE.InstancedMesh(gravelGeo, gravelMat, 60);
    const gd = new THREE.Object3D();
    for (let i = 0; i < 60; i++) {
      const x = -170 + Math.random() * 340, z = POI.roadZ + (Math.random() - 0.5) * 4.5;
      gd.position.set(x, terrainHeight(x, z) + 0.02, z);
      gd.scale.set(0.5 + Math.random() * 0.7, 0.08, 0.4 + Math.random() * 0.6);
      gd.rotation.y = Math.random() * 6;
      gd.updateMatrix();
      gravelIM.setMatrixAt(i, gd.matrix);
    }
    G.scene.add(gravelIM);
    // mile markers: squat stones pacing the King's Road
    const mileMat = new THREE.MeshLambertMaterial({ color: 0x74757c });
    for (const x of [-150, -100, -30, 30, 100, 150]) {
      const z = POI.roadZ - 5;
      const stone = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.1, 0.4), mileMat);
      stone.position.set(x, terrainHeight(x, z) + 0.5, z);
      stone.rotation.z = (Math.random() - 0.5) * 0.12; // none of them stand true anymore
      stone.castShadow = true;
      G.scene.add(stone);
    }
    // lantern posts flank the settlement turn-off — the promise of safety
    this.lanternLights = [];
    for (const x of [-5, 5]) {
      const z = POI.roadZ - 7;
      const g = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.BoxGeometry(0.18, 3.0, 0.18), mat);
      pole.position.y = 1.5; pole.castShadow = true; g.add(pole);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.12, 0.12), mat);
      arm.position.set(0.3, 2.9, 0); g.add(arm);
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.4, 0.3),
        new THREE.MeshBasicMaterial({ color: 0xffb655 }));
      box.position.set(0.6, 2.65, 0); g.add(box);
      const light = new THREE.PointLight(0xff9944, 0, 13);
      light.position.copy(box.position); g.add(light);
      g.position.set(x, terrainHeight(x, z), z);
      G.scene.add(g);
      this.lanternLights.push({ light, box, phase: x });
    }
    // the worn footpath: bare earth from the founding fire to the King's Road —
    // NPC feet made this line, and the eye follows it home (ground bible)
    const pathMat = new THREE.MeshLambertMaterial({ color: 0x6a5b41 });
    for (let z = 4; z < POI.roadZ - 3; z += 4) {
      const seg = new THREE.Mesh(new THREE.BoxGeometry(1.5 + Math.random() * 0.5, 0.05, 4.4), pathMat);
      const wob = Math.sin(z * 0.5) * 0.5;
      seg.position.set(wob, terrainHeight(wob, z + 2) + 0.03, z + 2);
      G.scene.add(seg);
    }

    // a broken cart on the west road: one wheel gone, cargo long since taken
    const cart = new THREE.Group();
    const cartWood = new THREE.MeshLambertMaterial({ color: 0x4e4030 });
    const bed = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.18, 1.2), cartWood);
    bed.position.y = 0.55; bed.rotation.z = 0.28; cart.add(bed);
    const side = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.4, 0.1), cartWood);
    side.position.set(0, 0.8, 0.6); side.rotation.z = 0.28; cart.add(side);
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.12, 9), cartWood);
    wheel.rotation.x = Math.PI / 2; wheel.position.set(-0.8, 0.55, -0.65); cart.add(wheel);
    const wheelOff = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.12, 9), cartWood);
    wheelOff.rotation.set(Math.PI / 2 + 1.2, 0, 0.4); wheelOff.position.set(1.6, 0.12, 1.1);
    cart.add(wheelOff);
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 0.12), cartWood);
    shaft.position.set(-1.8, 0.35, 0); shaft.rotation.z = -0.3; cart.add(shaft);
    cart.position.set(-95, terrainHeight(-95, POI.roadZ + 2.6), POI.roadZ + 2.6);
    cart.rotation.y = 0.5;
    cart.traverse(o => { o.castShadow = true; });
    G.scene.add(cart);
    G.colliders.push({ x: -95, z: POI.roadZ + 2.6, r: 1.1, owner: null });
  }

  // ---------- lighting, sun & moon discs, stars ----------
  _buildLights() {
    // lighting bible: cool desaturated world; warmth belongs to fire alone
    G.hemi = new THREE.HemisphereLight(0xaebccc, 0x2e2b26, 0.9);
    G.scene.add(G.hemi);
    G.sun = new THREE.DirectionalLight(0xf2efe6, 2.2);
    G.sun.castShadow = true;
    G.sun.shadow.mapSize.set(2048, 2048);
    const sc = G.sun.shadow.camera;
    sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70;
    sc.near = 10; sc.far = 260;
    G.scene.add(G.sun, G.sun.target);
    G.scene.fog = new THREE.Fog(0x8a9aab, 60, 320);
    G.scene.background = new THREE.Color(0x8a9aab);
    // moonlight: cool, faint ambient — enough for silhouettes, never for safety
    this.moon = new THREE.DirectionalLight(0x7488b8, 0.0);
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

    // ash motes for Red Moon nights: slow-falling dark-red dust around the player
    const ashN = 240;
    this._ashPos = new Float32Array(ashN * 3);
    for (let i = 0; i < ashN; i++) {
      this._ashPos[i * 3] = (Math.random() - 0.5) * 60;
      this._ashPos[i * 3 + 1] = Math.random() * 22;
      this._ashPos[i * 3 + 2] = (Math.random() - 0.5) * 60;
    }
    const ashGeo = new THREE.BufferGeometry();
    ashGeo.setAttribute('position', new THREE.BufferAttribute(this._ashPos, 3));
    this.ash = new THREE.Points(ashGeo, new THREE.PointsMaterial({
      color: 0x9a5348, size: 0.14, transparent: true, opacity: 0 }));
    G.scene.add(this.ash);
  }

  // Color keys for the day cycle — the lighting bible made data:
  //   dawn  = soft cool ambient, long shadows, only a slight warm rim
  //   day   = neutral, slightly cool; the world feels harsh, not warm
  //   dusk  = warm horizon against cool shadows; contrast and tension rise
  //   night = deep blue ambient, very low visibility; fire is the only warmth
  // fogN/fogF drive how far you can see; sunC tints the key light.
  static SKY = [
    { t: 0.00, sky: 0x060911, fog: 0x070a14, sun: 0.0, sunC: 0xf2efe6, hemi: 0.075, fogN: 16, fogF: 112 },
    { t: 0.20, sky: 0x0a0e1e, fog: 0x0b1020, sun: 0.0, sunC: 0xf2efe6, hemi: 0.085, fogN: 18, fogF: 120 },
    { t: 0.25, sky: 0x6b7890, fog: 0x8a8a90, sun: 0.7, sunC: 0xe8d8be, hemi: 0.42, fogN: 40, fogF: 230 },
    { t: 0.30, sky: 0x8ba0b5, fog: 0x97a3ab, sun: 1.4, sunC: 0xeee9da, hemi: 0.62, fogN: 55, fogF: 300 },
    { t: 0.42, sky: 0x87a4bf, fog: 0x99a8b4, sun: 2.2, sunC: 0xf2efe6, hemi: 0.9, fogN: 65, fogF: 340 },
    { t: 0.58, sky: 0x87a4bf, fog: 0x99a8b4, sun: 2.2, sunC: 0xf2efe6, hemi: 0.9, fogN: 65, fogF: 340 },
    { t: 0.70, sky: 0x9d8f93, fog: 0x8d8390, sun: 1.5, sunC: 0xf0d7ae, hemi: 0.62, fogN: 52, fogF: 290 },
    { t: 0.76, sky: 0xa8683e, fog: 0x6d6272, sun: 0.9, sunC: 0xffb070, hemi: 0.38, fogN: 38, fogF: 210 },
    { t: 0.81, sky: 0x0d1122, fog: 0x0d1224, sun: 0.0, sunC: 0xf2efe6, hemi: 0.09, fogN: 18, fogF: 122 },
    { t: 1.00, sky: 0x060911, fog: 0x070a14, sun: 0.0, sunC: 0xf2efe6, hemi: 0.075, fogN: 16, fogF: 112 },
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

    // regrowing trees scale up from saplings over a few seconds
    for (let i = this._growing.length - 1; i >= 0; i--) {
      const gr = this._growing[i];
      gr.p = Math.min(1, gr.p + dt * 0.22);
      this._growTree(this.trees[gr.ti], gr.p);
      if (gr.p >= 1) this._growing.splice(i, 1);
    }

    // sun position orbits the player so shadows stay crisp
    const t = G.time;
    const sunA = (t - 0.25) * Math.PI * 2; // 0 at dawn
    const px = G.player ? G.player.pos.x : 0, pz = G.player ? G.player.pos.z : 0;
    const se = Math.sin((t - 0.25) / 0.5 * Math.PI); // day elevation curve
    G.sun.position.set(px + Math.cos(sunA) * 120, Math.max(8, se * 140), pz + 40);
    G.sun.target.position.set(px, 0, pz);
    this.moon.position.set(px - 60, 100, pz - 40);
    this.moon.target.position.set(px, 0, pz);
    // faint: you read shapes by moonlight, you do not work by it
    this.moon.intensity = isNight() ? (G.redMoon && G.redMoon.active ? 0.22 : 0.15) : 0;

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
      this.moon.color.setHex(0x7488b8);
    }
    let sunI = a.sun + (b.sun - a.sun) * f;
    let fogFar = a.fogF + (b.fogF - a.fogF) * f;
    // the Red Moon buildup (lighting bible §19): the day BEFORE, daylight runs
    // pale and hazy — the world holds its breath before the sky turns
    if (G.redMoon.warned && !redMoon && sunI > 0.3) {
      cs.lerp(new THREE.Color(0xb8b4ae), 0.22);
      cf.lerp(new THREE.Color(0xa8a09a), 0.25);
      sunI *= 0.82;
      fogFar *= 0.82;
    }
    G.scene.background.copy(cs);
    G.scene.fog.color.copy(cf);
    // visibility itself follows the clock: night closes in around you
    G.scene.fog.near = a.fogN + (b.fogN - a.fogN) * f;
    G.scene.fog.far = fogFar;
    G.sun.intensity = sunI;
    G.sun.color.copy(new THREE.Color(a.sunC).lerp(new THREE.Color(b.sunC), f));
    G.hemi.intensity = a.hemi + (b.hemi - a.hemi) * f;
    // ash drifts down under a red sky — never enough to blind, only to unsettle
    if (this.ash) {
      this.ash.material.opacity += ((redMoon ? 0.55 : 0) - this.ash.material.opacity) * Math.min(1, dt);
      if (this.ash.material.opacity > 0.02) {
        this.ash.position.set(px, 0, pz);
        for (let i = 0; i < this._ashPos.length; i += 3) {
          this._ashPos[i + 1] -= dt * (1.1 + (i % 7) * 0.12);
          if (this._ashPos[i + 1] < 0) this._ashPos[i + 1] = 20 + Math.random() * 3;
        }
        this.ash.geometry.attributes.position.needsUpdate = true;
      }
    }
    // fires flicker — every flame has its own nervous rhythm
    const fnow = performance.now() * 0.001;
    this.banditFire.intensity = (isNight() ? 9 : 2) *
      (0.88 + 0.09 * Math.sin(fnow * 11.3) + 0.05 * Math.sin(fnow * 27.1));
    // the road lanterns are lit at dark: two small promises of home
    if (this.lanternLights) {
      const on = isNight() || t < 0.24 || t > 0.74;
      for (const L of this.lanternLights) {
        L.light.intensity = on ? 6 * (0.9 + 0.08 * Math.sin(fnow * 9.7 + L.phase)) : 0;
        L.box.material.color.setHex(on ? 0xffb655 : 0x6a5a44);
      }
    }
  }
}
