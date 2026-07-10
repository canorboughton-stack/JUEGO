// Settlement territory (brief §2). Reusable expansion: any building def with a
// territoryRadius contributes a control circle while it stands and is fully built.
// Buildings can only be placed inside controlled territory, never on the King's Road
// buffer. Losing a source doesn't delete buildings — they just can't be repaired
// (i.e. become inactive for upgrades) until territory is restored.
import * as THREE from '../lib/three.module.js';
import { G, dist2d } from './state.js';
import { POI } from './world.js';

export const ROAD_BUFFER = 9; // meters either side of the King's Road centerline

export function territorySources() {
  const out = [];
  for (const b of G.buildings) {
    if (b.destroyed || b.built < 1) continue;
    const r = b.def.territoryRadius;
    if (r) out.push({ x: b.x, z: b.z, r, building: b });
  }
  return out;
}

export function inTerritory(x, z) {
  return territorySources().some(s => dist2d(x, z, s.x, s.z) < s.r);
}

export function onRoadBuffer(x, z) {
  return Math.abs(z - POI.roadZ) < ROAD_BUFFER;
}

// ---------- visualization: glowing boundary rings shown in build mode ----------
let ringGroup = null;

export function showTerritory(on) {
  if (ringGroup) { G.scene.remove(ringGroup); ringGroup = null; }
  if (!on) return;
  ringGroup = new THREE.Group();
  const mat = new THREE.LineBasicMaterial({ color: 0x86c06a, transparent: true, opacity: 0.8 });
  for (const s of territorySources()) {
    const pts = [];
    for (let i = 0; i <= 72; i++) {
      const a = (i / 72) * Math.PI * 2;
      const x = s.x + Math.cos(a) * s.r, z = s.z + Math.sin(a) * s.r;
      pts.push(new THREE.Vector3(x, G.world.h(x, z) + 0.35, z));
    }
    ringGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat));
  }
  G.scene.add(ringGroup);
}

// call when buildings change while the overlay is visible
export function refreshTerritory() {
  if (ringGroup) showTerritory(true);
}
