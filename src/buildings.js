// Building framework (brief §3, §4, §12).
// One parent Building class; data-driven defs with costs, health, fire, job slots,
// storage slots, resident capacity, territory contribution, placement rules.
// Staged construction: pay materials → timber frame → hammer up (hold E).
// Repair scales with missing health (~half build cost from near-destroyed).
// Wooden structures catch fire, fire spreads, player extinguishes by hand.
import * as THREE from '../lib/three.module.js';
import { G, clamp, dist2d, isNight } from './state.js';
import { MAT, bx, cyl, gableRoof, fence, makeFrame } from './models.js';
import { assignJobs } from './villagers.js';
import { emptyInv, canAffordCombined, payCombined, costLabel } from './storage.js';
import { inTerritory, onRoadBuffer, refreshTerritory, showTerritory } from './territory.js';
import { noteBuildingDamage } from './alerts.js';

const MODULAR = ['foundation', 'wallpiece', 'windowwall', 'doorpiece'];
const SUPPORTS = ['foundation', 'wallpiece', 'windowwall', 'doorpiece', 'gate'];

export const CROPS = {
  corn:    { name: 'Corn',    color: 0xc8b93a, tall: 1.0, yield: 4, growTime: 100 },
  cabbage: { name: 'Cabbage', color: 0x5a8a3a, tall: 0.45, yield: 4, growTime: 80 },
};

export const BUILDING_DEFS = {
  // ---------- core ----------
  campfire: {
    name: 'Campfire', key: '1', cost: { wood: 4, stone: 2 }, hp: 60, r: 0.6,
    desc: 'Founds settlement; light, cooking, respawn', territoryRadius: 60, establishes: true,
    make() {
      const g = new THREE.Group();
      for (let i = 0; i < 7; i++) {
        const a = i / 7 * Math.PI * 2;
        const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.2, 0), MAT.stone);
        s.position.set(Math.cos(a) * 0.72, 0.12, Math.sin(a) * 0.72);
        g.add(s);
      }
      for (let i = 0; i < 4; i++) {
        const a = i / 4 * Math.PI * 2 + 0.4;
        cyl(g, 0.07, 0.07, 0.9, 5, MAT.beam, Math.cos(a) * 0.25, 0.35, Math.sin(a) * 0.25, 0.5, Math.cos(a) * 0.6);
      }
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
  chest: {
    name: 'Storage Chest', key: '2', cost: { wood: 8 }, hp: 90, r: 0.7,
    desc: 'Shared storage (120)', storage: true,
    make() {
      const g = new THREE.Group();
      bx(g, 1.15, 0.55, 0.75, MAT.beamLight, 0, 0.28, 0);
      bx(g, 1.2, 0.28, 0.8, MAT.beam, 0, 0.68, 0);          // lid
      bx(g, 0.08, 0.75, 0.82, MAT.iron, -0.4, 0.4, 0);      // iron bands
      bx(g, 0.08, 0.75, 0.82, MAT.iron, 0.4, 0.4, 0);
      bx(g, 0.12, 0.14, 0.05, MAT.iron, 0, 0.5, 0.4);       // clasp
      return g;
    },
  },
  workbench: {
    name: 'Workbench', key: '3', cost: { wood: 10, stone: 2 }, hp: 120, r: 0.9,
    desc: 'Craft tools & weapons', crafting: true,
    make() {
      const g = new THREE.Group();
      bx(g, 1.9, 0.14, 1.0, MAT.beamLight, 0, 0.85, 0);
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]])
        bx(g, 0.13, 0.85, 0.13, MAT.beam, sx * 0.82, 0.43, sz * 0.38);
      bx(g, 0.5, 0.1, 0.3, MAT.iron, -0.5, 0.97, 0.1, 0.3);  // anvil-ish block
      bx(g, 0.4, 0.06, 0.2, MAT.stone, 0.45, 0.95, -0.15, -0.2); // whetstone
      cyl(g, 0.16, 0.2, 0.5, 6, MAT.log, 0.75, 0.25, 0.55);  // chopping stump
      return g;
    },
  },
  // ---------- defense ----------
  wall: {
    name: 'Palisade Wall', key: '4', cost: { wood: 5 }, hp: 220, r: 1.9,
    desc: 'Delays enemies',
    make() {
      const g = new THREE.Group();
      for (let i = -2; i <= 2; i++) {
        const h = 2.5 + (i % 2 ? 0.3 : 0);
        cyl(g, 0.17, 0.2, h, 6, MAT.beamLight, i * 0.74, h / 2, 0);
        cyl(g, 0.01, 0.17, 0.38, 6, MAT.beamLight, i * 0.74, h + 0.18, 0);
      }
      bx(g, 3.9, 0.16, 0.12, MAT.beam, 0, 1.7, 0.22);
      bx(g, 3.9, 0.16, 0.12, MAT.beam, 0, 0.6, 0.22);
      return g;
    },
  },
  gate: {
    name: 'Gate', key: '5', cost: { wood: 12 }, hp: 320, r: 2.0, gate: true,
    desc: 'Opens for friends; enemies must break it',
    make() {
      const g = new THREE.Group();
      cyl(g, 0.24, 0.28, 3.4, 6, MAT.beamLight, -1.9, 1.7, 0);
      cyl(g, 0.24, 0.28, 3.4, 6, MAT.beamLight, 1.9, 1.7, 0);
      bx(g, 4.3, 0.28, 0.28, MAT.beam, 0, 3.35, 0);          // lintel
      // door leaves pivot at the posts
      const mkLeaf = sx => {
        const piv = new THREE.Group();
        piv.position.set(sx * 1.75, 0, 0);
        for (let i = 0; i < 4; i++)
          bx(piv, 0.32, 2.6, 0.14, MAT.beam, -sx * (0.2 + i * 0.36), 1.4, 0);
        bx(piv, 1.5, 0.14, 0.16, MAT.beamLight, -sx * 0.75, 2.2, 0.05);
        bx(piv, 1.5, 0.14, 0.16, MAT.beamLight, -sx * 0.75, 0.7, 0.05);
        g.add(piv);
        return piv;
      };
      g.userData.doorL = mkLeaf(-1);
      g.userData.doorR = mkLeaf(1);
      return g;
    },
  },
  watchpos: {
    name: 'Watch Position', key: '6', cost: { wood: 18, stone: 4 }, hp: 280, r: 1.2,
    desc: 'Elevated guard; bow range; expands territory', buildTime: 8,
    size: { w: 2.2, h: 4.4, d: 2.2 }, jobType: 'guard', standY: 4.5, ranged: true,
    territoryRadius: 30,
    make() {
      const g = new THREE.Group();
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]])
        cyl(g, 0.12, 0.16, 4.4, 6, MAT.beamLight, sx * 0.85, 2.2, sz * 0.85, 0, sx * -0.06);
      for (const sz of [-1, 1]) {
        bx(g, 0.09, 3.0, 0.09, MAT.beam, 0, 2.0, sz * 0.88, 0, 0.55);
        bx(g, 0.09, 3.0, 0.09, MAT.beam, 0, 2.0, sz * 0.88, 0, -0.55);
      }
      bx(g, 2.3, 0.2, 2.3, MAT.beamLight, 0, 4.4, 0);        // platform
      for (const s of [-1, 1]) {
        bx(g, 2.3, 0.08, 0.08, MAT.beam, 0, 5.15, s * 1.1);
        bx(g, 0.08, 0.08, 2.3, MAT.beam, s * 1.1, 5.15, 0);
        bx(g, 0.08, 0.7, 0.08, MAT.beam, s * 1.1, 4.8, s * 1.1);
        bx(g, 0.08, 0.7, 0.08, MAT.beam, -s * 1.1, 4.8, s * 1.1);
      }
      bx(g, 0.08, 4.4, 0.08, MAT.beamLight, -0.25, 2.2, 0.95, 0, 0, 0.1);   // ladder
      bx(g, 0.08, 4.4, 0.08, MAT.beamLight, 0.25, 2.2, 0.95, 0, 0, 0.1);
      for (let i = 0; i < 7; i++)
        bx(g, 0.58, 0.06, 0.06, MAT.beamLight, 0, 0.5 + i * 0.6, 0.95 + (0.5 + i * 0.6) * -0.1 + 0.22);
      return g;
    },
  },
  // ---------- modular construction pieces (grid-snapped) ----------
  foundation: {
    name: 'Foundation', key: '7', cost: { wood: 6, stone: 2 }, hp: 200, r: 0,
    desc: 'Base for walls & doors', modular: true,
    make() {
      const g = new THREE.Group();
      bx(g, 4, 0.35, 4, MAT.beamLight, 0, 0.35, 0);
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]])
        bx(g, 0.5, 0.4, 0.5, MAT.stone, sx * 1.6, 0.12, sz * 1.6);
      for (let i = 0; i < 5; i++)
        bx(g, 3.96, 0.06, 0.7, MAT.log, 0, 0.55, -1.6 + i * 0.8); // plank lines
      return g;
    },
  },
  wallpiece: {
    name: 'Wall', key: '8', cost: { wood: 4 }, hp: 180, r: 1.9,
    desc: 'Modular wall section', modular: true, needsSupport: true,
    make() {
      const g = new THREE.Group();
      bx(g, 3.9, 2.9, 0.22, MAT.plaster, 0, 1.95, 0);
      bx(g, 0.2, 3.1, 0.26, MAT.beam, -1.9, 1.95, 0);
      bx(g, 0.2, 3.1, 0.26, MAT.beam, 1.9, 1.95, 0);
      bx(g, 4.0, 0.18, 0.26, MAT.beam, 0, 0.55, 0);
      bx(g, 4.0, 0.18, 0.26, MAT.beam, 0, 3.4, 0);
      bx(g, 0.13, 2.2, 0.24, MAT.beam, 0, 1.95, 0, 0, 0.6);   // brace
      return g;
    },
  },
  windowwall: {
    name: 'Window Wall', key: '9', cost: { wood: 5 }, hp: 160, r: 1.9,
    desc: 'Wall with shuttered window', modular: true, needsSupport: true,
    make() {
      const g = BUILDING_DEFS.wallpiece.make();
      bx(g, 1.0, 1.0, 0.3, MAT.beam, 0, 2.1, 0);
      bx(g, 0.78, 0.78, 0.32, MAT.dark, 0, 2.1, 0);
      bx(g, 0.1, 0.78, 0.36, MAT.beam, 0, 2.1, 0);
      bx(g, 0.78, 0.1, 0.36, MAT.beam, 0, 2.1, 0);
      return g;
    },
  },
  doorpiece: {
    name: 'Door', key: '0', cost: { wood: 5 }, hp: 150, r: 1.9, gate: true,
    desc: 'Doorway; friends pass, enemies break', modular: true, needsSupport: true,
    make() {
      const g = new THREE.Group();
      // wall sides
      bx(g, 1.3, 2.9, 0.22, MAT.plaster, -1.3, 1.95, 0);
      bx(g, 1.3, 2.9, 0.22, MAT.plaster, 1.3, 1.95, 0);
      bx(g, 0.2, 3.1, 0.26, MAT.beam, -1.9, 1.95, 0);
      bx(g, 0.2, 3.1, 0.26, MAT.beam, 1.9, 1.95, 0);
      bx(g, 4.0, 0.18, 0.26, MAT.beam, 0, 3.4, 0);
      // door frame + leaf
      bx(g, 0.16, 2.4, 0.3, MAT.beam, -0.68, 1.55, 0);
      bx(g, 0.16, 2.4, 0.3, MAT.beam, 0.68, 1.55, 0);
      bx(g, 1.5, 0.16, 0.3, MAT.beam, 0, 2.8, 0);
      const leaf = new THREE.Group();
      leaf.position.set(-0.6, 0, 0);
      bx(leaf, 1.15, 2.3, 0.1, MAT.door, 0.58, 1.5, 0);
      g.add(leaf);
      g.userData.doorL = leaf;
      return g;
    },
  },
  // ---------- production & NPC support ----------
  farm: {
    name: 'Farm Plot', key: null, cost: { wood: 10 }, hp: 80, r: 0, flat: true,
    desc: 'One farmer, one crop', jobType: 'farmer',
    make() {
      const g = new THREE.Group();
      bx(g, 4.4, 0.22, 4.4, MAT.soil, 0, 0.11, 0);
      const crops = [];
      for (let i = 0; i < 4; i++) {
        const x = -1.5 + i * 1.0;
        bx(g, 0.55, 0.16, 3.8, MAT.soilDark, x, 0.24, 0);
        for (let j = 0; j < 5; j++) {
          const c = new THREE.Mesh(new THREE.ConeGeometry(0.16, 1, 5),
            new THREE.MeshLambertMaterial({ color: 0x7a9a3a }));
          c.position.set(x, 0.3, -1.5 + j * 0.75);
          c.scale.setScalar(0.001);
          g.add(c); crops.push(c);
        }
      }
      for (const [rot, x, z] of [[0, 0, 2.35], [0, 0, -2.35], [Math.PI / 2, 2.35, 0], [Math.PI / 2, -2.35, 0]]) {
        const f = fence(4.7);
        f.rotation.y = rot; f.position.set(x, 0, z);
        g.add(f);
      }
      g.userData.crops = crops;
      return g;
    },
  },
  animalpen: {
    name: 'Animal Pen', key: null, cost: { wood: 14 }, hp: 180, r: 3.8, gate: true,
    desc: 'Holds livestock (4)', penRadius: 3.0, animalCap: 4,
    make() {
      const g = new THREE.Group();
      for (const [rot, x, z] of [[0, 0, 3.7], [0, 0, -3.7], [Math.PI / 2, 3.7, 0], [Math.PI / 2, -3.7, 0]]) {
        const f = fence(7.4);
        f.rotation.y = rot; f.position.set(x, 0, z);
        g.add(f);
      }
      bx(g, 1.4, 0.3, 0.5, MAT.beamLight, 1.5, 0.3, 1.8);   // trough
      // lean-to shelter in a corner
      bx(g, 0.14, 1.4, 0.14, MAT.beam, -2.8, 0.7, -2.8);
      bx(g, 0.14, 1.0, 0.14, MAT.beam, -1.2, 0.5, -2.8);
      bx(g, 0.14, 1.4, 0.14, MAT.beam, -2.8, 0.7, -1.2);
      bx(g, 0.14, 1.0, 0.14, MAT.beam, -1.2, 0.5, -1.2);
      bx(g, 2.0, 0.1, 2.0, MAT.thatch, -2.0, 1.35, -2.0, 0, 0.22);
      return g;
    },
  },
  house: {
    name: 'Shack', key: null, cost: { wood: 20, stone: 5 }, hp: 300, r: 2.6,
    desc: '2 beds for villagers', buildTime: 10, size: { w: 4.5, h: 2.8, d: 4.2 }, beds: 2,
    make() {
      const g = new THREE.Group();
      bx(g, 4.6, 0.4, 4.3, MAT.stone, 0, 0.2, 0);
      bx(g, 4.0, 2.3, 3.7, MAT.plaster, 0, 1.55, 0);
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]])
        bx(g, 0.24, 2.4, 0.24, MAT.beam, sx * 1.95, 1.6, sz * 1.8);
      for (const sz of [-1, 1]) {
        bx(g, 4.1, 0.17, 0.1, MAT.beam, 0, 0.55, sz * 1.88);
        bx(g, 4.1, 0.17, 0.1, MAT.beam, 0, 2.65, sz * 1.88);
      }
      for (const sx of [-1, 1]) {
        bx(g, 0.1, 0.17, 3.8, MAT.beam, sx * 2.03, 0.55, 0);
        bx(g, 0.1, 0.17, 3.8, MAT.beam, sx * 2.03, 2.65, 0);
      }
      bx(g, 0.13, 1.7, 0.08, MAT.beam, -1.45, 1.6, 1.89, 0, 0.55);
      bx(g, 0.13, 1.7, 0.08, MAT.beam, 1.45, 1.6, 1.89, 0, -0.55);
      bx(g, 0.95, 1.65, 0.1, MAT.door, 0, 1.22, 1.9);
      bx(g, 0.12, 1.75, 0.12, MAT.beam, -0.58, 1.27, 1.9);
      bx(g, 0.12, 1.75, 0.12, MAT.beam, 0.58, 1.27, 1.9);
      bx(g, 1.28, 0.14, 0.12, MAT.beam, 0, 2.2, 1.9);
      cyl(g, 0.04, 0.04, 0.12, 5, MAT.iron, 0.32, 1.2, 1.96, Math.PI / 2);
      const win = (x, z, ry) => {
        const w = new THREE.Group();
        bx(w, 0.7, 0.7, 0.08, MAT.beam, 0, 0, 0);
        bx(w, 0.54, 0.54, 0.1, MAT.dark, 0, 0, 0.01);
        bx(w, 0.08, 0.54, 0.12, MAT.beam, 0, 0, 0.02);
        bx(w, 0.54, 0.08, 0.12, MAT.beam, 0, 0, 0.02);
        w.position.set(x, 1.8, z); w.rotation.y = ry;
        g.add(w);
      };
      win(-1.25, 1.86, 0); win(2.0, 0, Math.PI / 2); win(-2.0, 0, -Math.PI / 2);
      const roof = gableRoof(5.0, 4.6, 1.7);
      roof.position.y = 2.75;
      g.add(roof);
      bx(g, 0.55, 1.6, 0.55, MAT.stone, 1.3, 3.5, -1.0);
      return g;
    },
  },
  guardpost: {
    name: 'Guard Post', key: null, cost: { wood: 15, stone: 5 }, hp: 260, r: 1.3,
    desc: 'Guard patrols 25m around it', buildTime: 8, size: { w: 2.6, h: 3.6, d: 2.6 },
    jobType: 'guard', patrolRadius: 25, pursuitRadius: 45,
    make() {
      const g = new THREE.Group();
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]])
        cyl(g, 0.13, 0.17, 3.7, 6, MAT.beamLight, sx * 1.0, 1.85, sz * 1.0, 0, sx * -0.08);
      for (const sz of [-1, 1]) {
        bx(g, 0.1, 2.6, 0.1, MAT.beam, 0, 1.6, sz * 1.02, 0, 0.68);
        bx(g, 0.1, 2.6, 0.1, MAT.beam, 0, 1.6, sz * 1.02, 0, -0.68);
      }
      bx(g, 2.7, 0.22, 2.7, MAT.beamLight, 0, 3.7, 0);
      for (const s of [-1, 1]) {
        bx(g, 2.7, 0.09, 0.09, MAT.beam, 0, 4.5, s * 1.3);
        bx(g, 0.09, 0.09, 2.7, MAT.beam, s * 1.3, 4.5, 0);
        for (const t of [-1, 1]) bx(g, 0.09, 0.75, 0.09, MAT.beam, t * 1.3, 4.15, s * 1.3);
      }
      const cap = new THREE.Mesh(new THREE.ConeGeometry(2.2, 1.3, 4), MAT.thatch);
      cap.position.y = 5.6; cap.rotation.y = Math.PI / 4; cap.castShadow = true;
      g.add(cap);
      for (const [sx] of [[-1], [1]])
        cyl(g, 0.08, 0.08, 2.2, 5, MAT.beam, sx * 1.15, 5.0, 1.15, 0, sx * 0.35);
      bx(g, 0.08, 3.6, 0.08, MAT.beamLight, -0.3, 1.8, 1.15, 0, 0, 0.12);
      bx(g, 0.08, 3.6, 0.08, MAT.beamLight, 0.3, 1.8, 1.15, 0, 0, 0.12);
      for (let i = 0; i < 6; i++)
        bx(g, 0.68, 0.07, 0.07, MAT.beamLight, 0, 0.5 + i * 0.58, 1.15 + (0.5 + i * 0.58) * -0.12 + 0.2);
      return g;
    },
  },
  torch: {
    name: 'Torch Post', key: null, cost: { wood: 2 }, hp: 40, r: 0.25,
    desc: 'Light; wards ghosts', fireproof: true,
    make() {
      const g = new THREE.Group();
      cyl(g, 0.09, 0.12, 2.3, 6, MAT.beam, 0, 1.15, 0);
      bx(g, 0.3, 0.08, 0.08, MAT.iron, 0, 2.2, 0);
      cyl(g, 0.12, 0.09, 0.28, 6, MAT.iron, 0, 2.34, 0);
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.48, 6),
        new THREE.MeshBasicMaterial({ color: 0xffaa33 }));
      flame.position.y = 2.6; g.add(flame);
      const light = new THREE.PointLight(0xff9944, 0, 16);
      light.position.y = 2.6; g.add(light);
      g.userData.light = light; g.userData.flame = flame;
      return g;
    },
  },
};
BUILDING_DEFS.campfire.fireproof = true;

export const BUILD_ORDER = ['campfire', 'chest', 'workbench', 'wall', 'gate', 'watchpos',
  'foundation', 'wallpiece', 'windowwall', 'doorpiece', 'farm', 'animalpen', 'house',
  'guardpost', 'torch'];

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
    this.fire = 0;                      // fire intensity 0..1
    this.worker = null;                 // farm/guardpost/watchpos assignment
    this.residents = [];                // house: villagers with beds here
    this.open = false;                  // gates: player-toggled open
    this._fireTick = 0; this._repairDebt = {};
    if (d.storage) this.store = emptyInv();
    if (type === 'farm') { this.crop = 'corn'; this.cropState = 'empty'; this.growth = 0; }
    if (type === 'animalpen') this.penFood = 0; // eggs/milk waiting for pickup
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
    if (d.r > 0) G.colliders.push({ x, z, r: d.r, owner: this, gate: !!d.gate });
    applyBuildingEffects();
  }

  get isSite() { return this.built < 1; }

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
    refreshTerritory();
    assignJobs();
  }

  // ---------- damage / fire / repair ----------
  takeDamage(n, silent = false) {
    if (this.destroyed) return;
    this.hp -= n;
    if (!silent) noteBuildingDamage();
    if (this.hp <= 0) this.demolish(true);
  }

  ignite(chance = 1) {
    if (this.def.fireproof || this.destroyed || Math.random() > chance) return;
    if (this.fire <= 0) {
      this.fire = 0.15;
      G.ui.log(`🔥 Your ${this.def.name} is on fire!`);
      noteBuildingDamage();
    }
  }

  extinguishTick(dt) {
    this.fire = Math.max(0, this.fire - dt * 0.4);
    if (this.fire === 0 && this._fireFX) { this.mesh.remove(this._fireFX); this._fireFX = null; }
  }

  // returns '' on progress or a blocked reason string
  repairTick(dt) {
    if (this.fire > 0) return 'extinguish the fire first';
    if (this.hp >= this.maxHp) return 'undamaged';
    if (!inTerritory(this.x, this.z)) return 'outside settlement territory';
    const heal = Math.min(this.maxHp * 0.18 * dt, this.maxHp - this.hp);
    // full repair from near-zero costs ~half the build cost, scaled by healed fraction
    for (const [res, n] of Object.entries(this.def.cost)) {
      this._repairDebt[res] = (this._repairDebt[res] || 0) + n * 0.5 * (heal / this.maxHp);
      if (this._repairDebt[res] >= 1) {
        const whole = Math.floor(this._repairDebt[res]);
        if (!canAffordCombined({ [res]: whole })) return `need ${res} to repair`;
        payCombined({ [res]: whole });
        this._repairDebt[res] -= whole;
      }
    }
    this.hp += heal;
    return '';
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
    for (const v of this.residents) v.makeHomeless();
    this.residents = [];
    if (byEnemy) G.ui.log(`Your ${this.def.name} was destroyed!`);
    applyBuildingEffects();
    refreshTerritory();
  }

  update(dt) {
    if (this.built < 1) return;
    // fire behavior: grows, damages, spreads to nearby wooden structures
    if (this.fire > 0) {
      this.fire = Math.min(1, this.fire + dt * 0.015);
      this.hp -= this.fire * 8 * dt;
      if (this.hp <= 0) { this.demolish(true); return; }
      this._fireTick -= dt;
      if (this._fireTick <= 0) {
        this._fireTick = 2.5;
        for (const b of G.buildings) {
          if (b !== this && !b.def.fireproof && b.fire <= 0 &&
              dist2d(this.x, this.z, b.x, b.z) < 6 && Math.random() < this.fire * 0.25)
            b.ignite();
        }
      }
      if (!this._fireFX) {
        this._fireFX = new THREE.Group();
        for (let i = 0; i < 3; i++) {
          const f = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.2, 6),
            new THREE.MeshBasicMaterial({ color: 0xff6611 }));
          f.position.set((i - 1) * 0.9, 1 + i * 0.4, (i % 2) * 0.7);
          this._fireFX.add(f);
        }
        const fl = new THREE.PointLight(0xff6611, 10, 12);
        fl.position.y = 2; this._fireFX.add(fl);
        this.mesh.add(this._fireFX);
      }
      this._fireFX.scale.setScalar(0.4 + this.fire);
    }
    // torch / campfire light
    const light = this.mesh.userData.light;
    if (light) {
      light.intensity = isNight() ? (this.type === 'torch' ? 10 : 12) : 1.5;
      const f = this.mesh.userData.flame;
      if (f) f.scale.setScalar(0.9 + Math.sin(performance.now() * 0.01 + this.id) * 0.15);
    }
    // farm crop growth & visuals
    if (this.type === 'farm') {
      const cd = CROPS[this.crop];
      if (this.cropState === 'planted' || this.cropState === 'growing') {
        this.growth = Math.min(1, this.growth + dt / cd.growTime);
        if (this.growth > 0.15 && this.cropState === 'planted') this.cropState = 'growing';
        if (this.growth >= 1) this.cropState = 'ready';
      }
      const crops = this.mesh.userData.crops;
      if (crops) {
        const s = this.cropState === 'empty' ? 0.001 : Math.max(0.1, this.growth);
        for (const c of crops) {
          c.scale.set(s * (this.crop === 'cabbage' ? 1.6 : 0.9), s * cd.tall, s * (this.crop === 'cabbage' ? 1.6 : 0.9));
          c.material.color.setHex(this.cropState === 'ready' ? cd.color : 0x6a8a3a);
        }
      }
    }
    // gate leaves swing for approaching friendlies (or when left open)
    if (this.mesh.userData.doorL) {
      let wantOpen = this.open;
      if (!wantOpen) {
        if (G.player && !G.player.dead && dist2d(this.x, this.z, G.player.pos.x, G.player.pos.z) < 3.4) wantOpen = true;
        else for (const v of G.villagers) {
          if (!v.dead && dist2d(this.x, this.z, v.pos.x, v.pos.z) < 3.2) { wantOpen = true; break; }
        }
      }
      const target = wantOpen ? 1.35 : 0;
      const dL = this.mesh.userData.doorL, dR = this.mesh.userData.doorR;
      dL.rotation.y += (target - dL.rotation.y) * Math.min(1, dt * 5);
      if (dR) dR.rotation.y += (-target - dR.rotation.y) * Math.min(1, dt * 5);
    }
    // campfire heals whoever rests nearby
    if (this.type === 'campfire' && G.player && !G.player.dead) {
      if (dist2d(this.x, this.z, G.player.pos.x, G.player.pos.z) < 6 && G.player.hunger > 20)
        G.player.hp = Math.min(G.player.maxHp, G.player.hp + dt * 1.6);
    }
  }
}

// derived stats: beds from finished shacks
export function applyBuildingEffects() {
  G.popCap = G.buildings.filter(b => b.type === 'house' && b.built >= 1)
    .reduce((t, b) => t + (b.def.beds || 0), 0);
}

export function placeBuilding(type, x, z, rotY, built = 1) {
  const b = new Building(type, x, z, rotY, built);
  G.buildings.push(b);
  applyBuildingEffects();
  refreshTerritory();
  return b;
}

// ---------- placement rules (brief §4) ----------
function slopeOK(x, z) {
  const h = G.world.h;
  const s = [h(x, z), h(x + 2, z), h(x - 2, z), h(x, z + 2), h(x, z - 2)];
  return Math.max(...s) - Math.min(...s) < 1.1;
}

function hasSupport(type, x, z) {
  if (!BUILDING_DEFS[type].needsSupport) return true;
  return G.buildings.some(b => SUPPORTS.includes(b.type) && !b.destroyed &&
    dist2d(x, z, b.x, b.z) < 3.4);
}

// returns '' if valid, else the reason
export function placementProblem(type, x, z) {
  const d = BUILDING_DEFS[type];
  if (Math.abs(x) > 190 || Math.abs(z) > 190) return 'beyond the map edge';
  if (onRoadBuffer(x, z)) return "too close to the King's Road";
  if (!d.establishes && !inTerritory(x, z)) return 'outside settlement territory';
  if (!slopeOK(x, z)) return 'ground too steep';
  if (!hasSupport(type, x, z)) return 'needs a foundation or wall to attach to';
  const need = Math.max(d.r, 1.6);
  for (const c of G.colliders) {
    if (dist2d(x, z, c.x, c.z) < need + c.r) return 'blocked by an obstacle';
  }
  if (G.player && dist2d(x, z, G.player.pos.x, G.player.pos.z) < 1.2) return 'you are standing there';
  if (!canAffordCombined(d.cost)) return `needs ${costLabel(d.cost)}`;
  return '';
}

// ---------- build mode (ghost preview + snapping) ----------
export const buildState = { active: false, sel: 0, rot: 0, ghost: null, valid: false,
  gx: 0, gz: 0, problem: '' };

export function enterBuildMode() {
  buildState.active = true;
  setGhost(BUILD_ORDER[buildState.sel]);
  G.ui.showBuildMenu(true);
  showTerritory(true); // green boundary rings while building
}

export function exitBuildMode() {
  buildState.active = false;
  if (buildState.ghost) { G.scene.remove(buildState.ghost); buildState.ghost = null; }
  G.ui.showBuildMenu(false);
  showTerritory(false);
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

export function rotateGhost() {
  const modular = MODULAR.includes(BUILD_ORDER[buildState.sel]);
  buildState.rot += modular ? Math.PI / 2 : Math.PI / 4;
}

export function updateBuildMode() {
  if (!buildState.active || !buildState.ghost) return;
  const p = G.player;
  let fx = p.pos.x + p.viewDir.x * 5.5;
  let fz = p.pos.z + p.viewDir.z * 5.5;
  const type = BUILD_ORDER[buildState.sel];
  // modular pieces snap to a 2m grid and 90° rotations
  if (MODULAR.includes(type)) {
    fx = Math.round(fx / 2) * 2;
    fz = Math.round(fz / 2) * 2;
    buildState.rot = Math.round(buildState.rot / (Math.PI / 2)) * (Math.PI / 2);
  }
  buildState.gx = fx; buildState.gz = fz;
  buildState.problem = placementProblem(type, fx, fz);
  buildState.valid = !buildState.problem;
  buildState.ghost.position.set(fx, G.world.h(fx, fz), fz);
  buildState.ghost.rotation.y = buildState.rot;
  const tint = new THREE.Color(0xff3333);
  const ok = new THREE.Color(0x44ff66);
  buildState.ghost.traverse(o => {
    if (o.isMesh && o.userData.baseColor) {
      o.material.color.copy(o.userData.baseColor);
      o.material.color.lerp(buildState.valid ? ok : tint, buildState.valid ? 0.25 : 0.55);
    }
  });
  G.ui.prompt(buildState.valid ? '' : `✗ ${buildState.problem}`);
}

export function tryPlace() {
  const type = BUILD_ORDER[buildState.sel];
  if (!buildState.valid) {
    G.ui.log(`Cannot build: ${buildState.problem}.`);
    return;
  }
  payCombined(BUILDING_DEFS[type].cost);
  const staged = !!BUILDING_DEFS[type].buildTime;
  placeBuilding(type, buildState.gx, buildState.gz, buildState.rot, staged ? 0 : 1);
  G.ui.log(staged
    ? `${BUILDING_DEFS[type].name} frame raised — hold E at the site to build it.`
    : `Built: ${BUILDING_DEFS[type].name}`);
  G.ui.updateBuildMenu();
}

export function demolishNearest() {
  let best = null, bd = 6;
  for (const b of G.buildings) {
    const d = dist2d(G.player.pos.x, G.player.pos.z, b.x, b.z);
    if (d < bd) { bd = d; best = b; }
  }
  if (best) {
    const refund = Math.floor((best.def.cost.wood || 0) / 2);
    if (refund) G.playerInv.wood += refund;
    G.ui.log(`Demolished ${best.def.name}${refund ? ` (+${refund} wood back)` : ''}.`);
    best.demolish(false);
  }
}

export function updateBuildings(dt) {
  for (const b of [...G.buildings]) b.update(dt);
}
