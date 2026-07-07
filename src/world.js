// World: handcrafted map layout, terrain, vegetation, ruins, lighting, day/night.
import * as THREE from '../lib/three.module.js';
import { G, clamp, dist2d, isNight } from './state.js';

const MAP = 400; // world is MAP x MAP centered at origin

// ---- Map layout (z negative = north) ----
// Village clearing  : (0, 0)
// King's Road       : east-west band at z = 40
// Dark Forest       : east   (x 40..190, z -90..25)
// Rocky Hills       : west   (x -190..-40, z -70..35)
// Cursed Ruins      : (110, -120) r 34
// Bandit Camp       : (-110, -115) r 26
// Hunting Grounds   : far north strip z < -150 (the White Werewolf)
export const POI = {
  village: { x: 0, z: 0, r: 40 },
  ruins: { x: 110, z: -120, r: 34 },
  banditCamp: { x: -110, z: -115, r: 26 },
  werewolfDen: { x: 0, z: -175, r: 45 },
  roadZ: 40,
};

function smooth(a, b, v) { return clamp((v - a) / (b - a), 0, 1); }

export function terrainHeight(x, z) {
  let h = 2.4 * Math.sin(x * 0.018) * Math.cos(z * 0.021)
        + 1.5 * Math.sin(x * 0.052 + 2.3) * Math.cos(z * 0.047 + 1.1)
        + 0.6 * Math.sin(x * 0.11 + 0.5) * Math.sin(z * 0.13 + 2.0);
  h += Math.max(0, (-z - 120) * 0.035);           // rise toward the cursed north
  const dv = Math.hypot(x, z);
  h *= 0.08 + 0.92 * smooth(16, 52, dv);          // flatten village clearing
  h *= 0.15 + 0.85 * smooth(2.5, 9, Math.abs(z - POI.roadZ)); // flatten the road
  h *= 0.2 + 0.8 * smooth(6, 20, dist2d(x, z, POI.ruins.x, POI.ruins.z) - 14);
  h *= 0.2 + 0.8 * smooth(4, 14, dist2d(x, z, POI.banditCamp.x, POI.banditCamp.z) - 10);
  return h;
}

export function zoneAt(x, z) {
  if (dist2d(x, z, POI.werewolfDen.x, POI.werewolfDen.z) < POI.werewolfDen.r || z < -160)
    return { name: 'THE HUNTING GROUNDS', sub: 'Something ancient rules here. Turn back.' };
  if (dist2d(x, z, POI.ruins.x, POI.ruins.z) < POI.ruins.r)
    return { name: 'THE CURSED RUINS', sub: 'The dead do not rest in these stones.' };
  if (dist2d(x, z, POI.banditCamp.x, POI.banditCamp.z) < POI.banditCamp.r)
    return { name: 'BANDIT CAMP', sub: 'Outlaws watch from the tents.' };
  if (Math.hypot(x, z) < POI.village.r)
    return { name: 'THE SETTLEMENT', sub: 'Home. Keep it standing.' };
  if (Math.abs(z - POI.roadZ) < 8)
    return { name: "THE KING'S ROAD", sub: 'Merchants and wanderers pass through.' };
  if (x > 40 && z > -95 && z < 28)
    return { name: 'THE DARK FOREST', sub: 'Timber is plentiful. So are the wolves.' };
  if (x < -40 && z > -75 && z < 38)
    return { name: 'THE ROCKY HILLS', sub: 'Stone for walls. Boars in the brush.' };
  if (z < -90)
    return { name: 'THE NORTHERN MARCHES', sub: 'The air grows cold and wrong.' };
  return { name: 'THE FRONTIER', sub: 'Untamed wilderness.' };
}

export class World {
  constructor() {
    this.h = terrainHeight;
    this.trees = [];  // {x,z,alive,respawn}
    this.rocks = [];
    this.bushes = [];
    this._buildTerrain();
    this._buildVegetation();
    this._buildRuins();
    this._buildBanditCamp();
    this._buildDen();
    this._buildRoadProps();
    this._buildLights();
    this._skyTop = new THREE.Color();
  }

  // ---------- terrain ----------
  _buildTerrain() {
    const seg = 140;
    const geo = new THREE.PlaneGeometry(MAP, MAP, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const cGrass = new THREE.Color(0x3d5a2a), cDry = new THREE.Color(0x5a5f38),
          cRoad = new THREE.Color(0x6e5b41), cRuin = new THREE.Color(0x565661),
          cSnow = new THREE.Color(0x9aa3ad), cVill = new THREE.Color(0x4a6b33);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      pos.setY(i, terrainHeight(x, z));
      c.copy(cGrass);
      const n = Math.sin(x * 0.31 + z * 0.17) * Math.sin(x * 0.05 - z * 0.11);
      c.lerp(cDry, 0.25 + n * 0.25);
      if (Math.hypot(x, z) < POI.village.r) c.lerp(cVill, 0.5);
      if (dist2d(x, z, POI.ruins.x, POI.ruins.z) < POI.ruins.r) c.lerp(cRuin, 0.75);
      if (dist2d(x, z, POI.banditCamp.x, POI.banditCamp.z) < POI.banditCamp.r) c.lerp(cDry, 0.6);
      c.lerp(cSnow, smooth(-130, -175, z));                 // pale cursed north
      c.lerp(cRoad, 1 - smooth(2.5, 5.5, Math.abs(z - POI.roadZ))); // road strip
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    G.scene.add(mesh);
  }

  // ---------- vegetation (instanced) ----------
  _buildVegetation() {
    const dummy = new THREE.Object3D();
    // Trees: dense in forest, sparse elsewhere, dead in the north
    const treeSpots = [];
    for (let i = 0; i < 220; i++) {
      const inForest = i < 150;
      let x, z, tries = 0;
      do {
        if (inForest) { x = 42 + Math.random() * 145; z = -92 + Math.random() * 115; }
        else { x = -195 + Math.random() * 390; z = -195 + Math.random() * 390; }
        tries++;
      } while (tries < 12 && (Math.hypot(x, z) < 34 || Math.abs(z - POI.roadZ) < 9
               || dist2d(x, z, POI.ruins.x, POI.ruins.z) < POI.ruins.r
               || dist2d(x, z, POI.banditCamp.x, POI.banditCamp.z) < POI.banditCamp.r));
      if (tries >= 12) continue;
      treeSpots.push({ x, z, dead: z < -145 });
    }
    const trunkGeo = new THREE.CylinderGeometry(0.28, 0.42, 3.2, 6);
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x4a3421 });
    const leafGeo = new THREE.ConeGeometry(1.9, 4.4, 7);
    const leafMat = new THREE.MeshLambertMaterial({ color: 0x2a4520 });
    this.trunkIM = new THREE.InstancedMesh(trunkGeo, trunkMat, treeSpots.length);
    this.leafIM = new THREE.InstancedMesh(leafGeo, leafMat, treeSpots.length);
    this.trunkIM.castShadow = this.leafIM.castShadow = true;
    treeSpots.forEach((t, i) => {
      const y = terrainHeight(t.x, t.z);
      const s = 0.8 + Math.random() * 0.6;
      dummy.position.set(t.x, y + 1.6 * s, t.z);
      dummy.scale.setScalar(s); dummy.rotation.y = Math.random() * 6.28;
      dummy.updateMatrix();
      this.trunkIM.setMatrixAt(i, dummy.matrix);
      if (t.dead) dummy.scale.setScalar(0.001); // dead trees: trunk only
      else { dummy.position.y = y + 4.6 * s; }
      dummy.updateMatrix();
      this.leafIM.setMatrixAt(i, dummy.matrix);
      this.trees.push({ x: t.x, z: t.z, alive: true, respawn: 0, s, dead: t.dead });
      G.colliders.push({ x: t.x, z: t.z, r: 0.55, owner: null });
    });
    G.scene.add(this.trunkIM, this.leafIM);

    // Rocks: hills + scattered
    const rockGeo = new THREE.DodecahedronGeometry(1.15, 0);
    const rockMat = new THREE.MeshLambertMaterial({ color: 0x77787f, flatShading: true });
    const rockSpots = [];
    for (let i = 0; i < 90; i++) {
      let x, z;
      if (i < 60) { x = -185 + Math.random() * 140; z = -70 + Math.random() * 100; }
      else { x = -195 + Math.random() * 390; z = -195 + Math.random() * 390; }
      if (Math.hypot(x, z) < 30 || Math.abs(z - POI.roadZ) < 7) continue;
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

    // Berry bushes: meadows near the village & forest edge
    const bushGeo = new THREE.SphereGeometry(0.75, 7, 5);
    const bushMat = new THREE.MeshLambertMaterial({ color: 0x35682d });
    const bushSpots = [];
    for (let i = 0; i < 46; i++) {
      const a = Math.random() * 6.28, d = 30 + Math.random() * 55;
      const x = Math.cos(a) * d, z = Math.sin(a) * d * 0.8 + 10;
      if (Math.abs(z - POI.roadZ) < 6) continue;
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
  }

  _hideInstance(im, i) {
    const m = new THREE.Matrix4().makeScale(0.001, 0.001, 0.001);
    im.setMatrixAt(i, m);
    im.instanceMatrix.needsUpdate = true;
  }
  _restoreTree(i) {
    const t = this.trees[i], dummy = new THREE.Object3D();
    const y = terrainHeight(t.x, t.z);
    dummy.position.set(t.x, y + 1.6 * t.s, t.z); dummy.scale.setScalar(t.s);
    dummy.updateMatrix(); this.trunkIM.setMatrixAt(i, dummy.matrix);
    if (!t.dead) { dummy.position.y = y + 4.6 * t.s; dummy.updateMatrix(); this.leafIM.setMatrixAt(i, dummy.matrix); }
    this.trunkIM.instanceMatrix.needsUpdate = this.leafIM.instanceMatrix.needsUpdate = true;
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
    consider(this.trees, 'tree', 'chop tree (+5 wood)');
    consider(this.rocks, 'rock', 'mine rock (+4 stone)');
    consider(this.bushes, 'bush', 'pick berries (+2 food)');
    return best;
  }

  harvest(kind, i) {
    const give = (res, n) => {
      const total = G.resources.wood + G.resources.stone + G.resources.food;
      const room = Math.max(0, G.resourceCap - total);
      G.resources[res] += Math.min(n, room);
      if (room < n) G.ui.log('Storage is full! Build a storage shed.');
    };
    if (kind === 'tree') {
      const t = this.trees[i]; t.alive = false; t.respawn = 100;
      this._hideInstance(this.trunkIM, i); this._hideInstance(this.leafIM, i);
      const ci = G.colliders.findIndex(c => c.x === t.x && c.z === t.z && !c.owner);
      if (ci >= 0) G.colliders.splice(ci, 1);
      give('wood', 5);
    } else if (kind === 'rock') {
      const r = this.rocks[i]; r.alive = false; r.respawn = 140;
      this._hideInstance(this.rockIM, i);
      const ci = G.colliders.findIndex(c => c.x === r.x && c.z === r.z && !c.owner);
      if (ci >= 0) G.colliders.splice(ci, 1);
      give('stone', 4);
    } else if (kind === 'bush') {
      const b = this.bushes[i]; b.alive = false; b.respawn = 70;
      this._hideInstance(this.bushIM, i);
      give('food', 2);
    }
  }

  // ---------- static POIs ----------
  _buildRuins() {
    const mat = new THREE.MeshLambertMaterial({ color: 0x5c5c68 });
    const g = new THREE.Group();
    const { x: cx, z: cz } = POI.ruins;
    // broken walls & pillars in a loose ring
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const d = 12 + Math.random() * 16;
      const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      const w = 2 + Math.random() * 5, h = 1.5 + Math.random() * 4;
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 1.1), mat);
      m.position.set(x, terrainHeight(x, z) + h / 2 - 0.3, z);
      m.rotation.y = a + Math.random();
      m.rotation.z = (Math.random() - 0.5) * 0.15;
      m.castShadow = true;
      g.add(m);
      G.colliders.push({ x, z, r: Math.max(w, 1.1) * 0.45, owner: null });
    }
    // central shattered altar
    const alt = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.2, 1.4, 8), mat);
    alt.position.set(cx, terrainHeight(cx, cz) + 0.7, cz);
    g.add(alt);
    G.colliders.push({ x: cx, z: cz, r: 2.1, owner: null });
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
    // camp fire (visual)
    const fire = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.9, 6),
      new THREE.MeshBasicMaterial({ color: 0xff7722 }));
    fire.position.set(cx, terrainHeight(cx, cz) + 0.5, cz);
    g.add(fire);
    this.banditFire = new THREE.PointLight(0xff8833, 8, 20);
    this.banditFire.position.copy(fire.position).add(new THREE.Vector3(0, 1, 0));
    g.add(this.banditFire);
    G.scene.add(g);
  }

  _buildDen() {
    // monolith ring marking the werewolf's territory
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
    // signposts along the King's Road
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

  // ---------- lighting & sky ----------
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
          if (arr === this.trees || arr === this.rocks)
            G.colliders.push({ x: r.x, z: r.z, r: arr === this.trees ? 0.55 : (r.s || 1) * 0.9, owner: null });
        }
      }
    });
    tick(this.trees, i => this._restoreTree(i));
    tick(this.rocks, i => this._restoreRock(i));
    tick(this.bushes, i => this._restoreBush(i));

    // sun position orbits the player so shadows stay crisp
    const t = G.time;
    const sunA = (t - 0.25) * Math.PI * 2; // 0 at dawn
    const elev = Math.sin(sunA * 0.5 * 2) * 0; // unused
    const px = G.player ? G.player.pos.x : 0, pz = G.player ? G.player.pos.z : 0;
    const se = Math.sin((t - 0.25) / 0.5 * Math.PI); // day elevation curve
    G.sun.position.set(px + Math.cos(sunA) * 120, Math.max(8, se * 140), pz + 40);
    G.sun.target.position.set(px, 0, pz);
    this.moon.position.set(px - 60, 100, pz - 40);
    this.moon.target.position.set(px, 0, pz);
    this.moon.intensity = isNight() ? 0.35 : 0;

    // interpolate sky/fog colors
    const keys = World.SKY;
    let a = keys[0], b = keys[keys.length - 1];
    for (let i = 0; i < keys.length - 1; i++)
      if (t >= keys[i].t && t <= keys[i + 1].t) { a = keys[i]; b = keys[i + 1]; break; }
    const f = (t - a.t) / Math.max(0.0001, b.t - a.t);
    const cs = new THREE.Color(a.sky).lerp(new THREE.Color(b.sky), f);
    const cf = new THREE.Color(a.fog).lerp(new THREE.Color(b.fog), f);
    G.scene.background.copy(cs);
    G.scene.fog.color.copy(cf);
    G.scene.fog.near = isNight() ? 28 : 60;
    G.scene.fog.far = isNight() ? 150 : 320;
    G.sun.intensity = a.sun + (b.sun - a.sun) * f;
    G.hemi.intensity = a.hemi + (b.hemi - a.hemi) * f;
    this.banditFire.intensity = isNight() ? 9 : 2;
  }
}
