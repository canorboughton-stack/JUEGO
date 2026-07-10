// Procedural models in a Medieval-Dynasty-inspired style:
// timber framing, wattle & daub plaster, thatched gable roofs, log construction —
// plus the character rig (tunic/belt/boots, hoods, straw hats, helmets).
import * as THREE from '../lib/three.module.js';

// ---------- shared material palette ----------
const L = c => new THREE.MeshLambertMaterial({ color: c });
export const MAT = {
  beam: L(0x4a3423),        // dark oak timber framing
  beamLight: L(0x6b4e2e),   // lighter structural logs
  log: L(0x7a5a38),         // debarked pine logs
  plaster: L(0xd6c3a1),     // wattle & daub infill
  plasterDS: new THREE.MeshLambertMaterial({ color: 0xd6c3a1, side: THREE.DoubleSide }),
  thatch: L(0x8a6f42),      // straw thatch
  thatchDark: L(0x6e5731),  // weathered ridge thatch
  stone: L(0x8b8b90),       // fieldstone foundation
  door: L(0x3c2c1a),
  soil: L(0x4a3626),
  soilDark: L(0x3a2a1c),
  crop: L(0x7a9a3a),
  straw: L(0xc2a45c),
  iron: L(0x8a909c),
  dark: L(0x2e2419),
};

// ---------- small helpers ----------
export function bx(g, w, h, d, mat, x, y, z, ry = 0, rz = 0, rx = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.castShadow = true;
  g.add(m);
  return m;
}

export function cyl(g, r1, r2, h, seg, mat, x, y, z, rx = 0, rz = 0) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, 0, rz);
  m.castShadow = true;
  g.add(m);
  return m;
}

// ---------- architecture ----------
// Thatched gable roof: ridge runs along z. Base of roof sits at group y=0.
export function gableRoof(w, d, h, mat = MAT.thatch) {
  const g = new THREE.Group();
  const over = 0.4;
  const slopeLen = Math.hypot(w / 2, h) + over;
  const ang = Math.atan2(h, w / 2);
  for (const s of [-1, 1]) {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(slopeLen, 0.18, d + over * 2), mat);
    slab.rotation.z = s * ang;
    slab.position.set(-s * w / 4 - s * (over / 2) * Math.cos(ang), h / 2 - (over / 2) * Math.sin(ang), 0);
    slab.castShadow = true;
    g.add(slab);
  }
  const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.18, d + over * 2), MAT.thatchDark);
  ridge.position.set(0, h + 0.04, 0);
  ridge.castShadow = true;
  g.add(ridge);
  // plaster gable-end triangles
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, 0); shape.lineTo(w / 2, 0); shape.lineTo(0, h); shape.closePath();
  const triGeo = new THREE.ShapeGeometry(shape);
  for (const s of [-1, 1]) {
    const tri = new THREE.Mesh(triGeo, MAT.plasterDS);
    tri.position.set(0, 0, s * (d / 2 - 0.02));
    g.add(tri);
  }
  return g;
}

// Post-and-rail fence segment along local x, centered.
export function fence(len) {
  const g = new THREE.Group();
  const n = Math.max(2, Math.ceil(len / 1.3) + 1);
  for (let i = 0; i < n; i++) {
    const x = -len / 2 + (len / (n - 1)) * i;
    bx(g, 0.1, 0.85, 0.1, MAT.beamLight, x, 0.42, 0);
  }
  bx(g, len, 0.07, 0.05, MAT.beamLight, 0, 0.36, 0);
  bx(g, len, 0.07, 0.05, MAT.beamLight, 0, 0.66, 0);
  return g;
}

// Construction-site timber frame for staged building (Medieval-Dynasty style):
// corner posts, sills, top rails, diagonal braces — what you see before hammering.
export function makeFrame(w, h, d) {
  const g = new THREE.Group();
  const hw = w / 2 - 0.1, hd = d / 2 - 0.1;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]])
    bx(g, 0.18, h, 0.18, MAT.beam, sx * hw, h / 2, sz * hd);
  // sills & top rails
  for (const y of [0.12, h - 0.09]) {
    bx(g, w, 0.16, 0.16, MAT.beam, 0, y, -hd);
    bx(g, w, 0.16, 0.16, MAT.beam, 0, y, hd);
    bx(g, 0.16, 0.16, d, MAT.beam, -hw, y, 0);
    bx(g, 0.16, 0.16, d, MAT.beam, hw, y, 0);
  }
  // diagonal braces on front/back
  const diagLen = Math.hypot(w * 0.5, h * 0.6);
  for (const sz of [-1, 1]) {
    bx(g, 0.12, diagLen, 0.12, MAT.beamLight, -w / 4, h * 0.4, sz * hd, 0, 0.65);
    bx(g, 0.12, diagLen, 0.12, MAT.beamLight, w / 4, h * 0.4, sz * hd, 0, -0.65);
  }
  return g;
}

// ---------- the character rig ----------
// Returns { group, legs[2 hip pivots], armPivot (right/weapon), armL, head }.
// Same interface the old blocky rig exposed, so all animation code keeps working.
export function makeCharacter(opt = {}) {
  const {
    tunic = 0x5a6a7c, skin = 0xd8ae84, pants = 0x4a3c2c, boots = 0x3a2e20,
    hat = null,               // 'hood' | 'straw' | 'helm' | null (hair)
    hatColor = 0x3a3f4a, hair = 0x4a3320, scale = 1,
  } = opt;
  const g = new THREE.Group();
  const mTunic = L(tunic), mSkin = L(skin), mPants = L(pants), mBoots = L(boots);

  // torso: chest, flared tunic skirt, belt + buckle
  bx(g, 0.6, 0.56, 0.34, mTunic, 0, 1.3, 0);
  bx(g, 0.68, 0.34, 0.4, mTunic, 0, 0.94, 0);
  bx(g, 0.63, 0.11, 0.37, MAT.dark, 0, 1.06, 0);
  bx(g, 0.1, 0.09, 0.03, MAT.iron, 0, 1.06, 0.19);
  // shoulder pads
  bx(g, 0.16, 0.14, 0.3, mTunic, -0.37, 1.5, 0);
  bx(g, 0.16, 0.14, 0.3, mTunic, 0.37, 1.5, 0);

  // legs: pivot groups at the hip so the walk cycle swings naturally
  const legs = [];
  for (const sx of [-1, 1]) {
    const piv = new THREE.Group();
    piv.position.set(sx * 0.17, 0.86, 0);
    bx(piv, 0.22, 0.52, 0.25, mPants, 0, -0.26, 0);
    bx(piv, 0.24, 0.36, 0.3, mBoots, 0, -0.68, 0.03);
    g.add(piv);
    legs.push(piv);
  }

  // arms: pivot at the shoulder; right arm carries weapons
  const makeArm = sx => {
    const piv = new THREE.Group();
    piv.position.set(sx * 0.42, 1.46, 0);
    bx(piv, 0.18, 0.5, 0.2, mTunic, 0, -0.22, 0);
    bx(piv, 0.14, 0.17, 0.16, mSkin, 0, -0.55, 0);
    g.add(piv);
    return piv;
  };
  const armL = makeArm(-1);
  const armPivot = makeArm(1);

  // head group so hats/ears can attach
  const head = new THREE.Group();
  head.position.set(0, 1.6, 0);
  bx(head, 0.32, 0.34, 0.3, mSkin, 0, 0.18, 0);
  bx(head, 0.06, 0.05, 0.02, MAT.dark, -0.08, 0.22, 0.155); // eyes
  bx(head, 0.06, 0.05, 0.02, MAT.dark, 0.08, 0.22, 0.155);
  if (hat === 'hood') {
    const hMat = L(hatColor);
    cyl(head, 0.05, 0.28, 0.4, 6, hMat, 0, 0.42, -0.02);
    bx(head, 0.36, 0.2, 0.1, hMat, 0, 0.22, -0.17); // cape back
    bx(head, 0.38, 0.4, 0.34, hMat, 0, 0.2, -0.03).scale.set(1, 1, 0.95); // cowl
    bx(head, 0.3, 0.3, 0.26, mSkin, 0, 0.17, 0.05); // face inside cowl
  } else if (hat === 'straw') {
    cyl(head, 0.44, 0.44, 0.06, 8, MAT.straw, 0, 0.38, 0);
    cyl(head, 0.16, 0.22, 0.16, 8, MAT.straw, 0, 0.47, 0);
  } else if (hat === 'helm') {
    cyl(head, 0.2, 0.22, 0.2, 8, MAT.iron, 0, 0.4, 0);
    bx(head, 0.05, 0.2, 0.03, MAT.iron, 0, 0.24, 0.16); // nasal guard
  } else {
    bx(head, 0.35, 0.13, 0.33, L(hair), 0, 0.4, -0.01);
  }
  g.add(head);
  g.scale.setScalar(scale);
  return { group: g, legs, armPivot, armL, head };
}
