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
    // silhouette variation so villagers are recognizable at a distance
    heightScale = 1, buildScale = 1,
    // profession-readable details (art bible §3, §5)
    apron = false,            // farmers: work apron
    pouch = false,            // belt pouch / utility tool
    reinforced = false,       // guards: leather chest straps + shoulder plates
    kingdomPatch = false,     // bandits: stolen heraldry, faded
    stance = null,            // 'hunched' for ghouls: wrong posture, dangling arms
  } = opt;
  const g = new THREE.Group();
  const mTunic = L(tunic), mSkin = L(skin), mPants = L(pants), mBoots = L(boots);

  // torso: chest, flared tunic skirt, belt + buckle
  const chest = bx(g, 0.6, 0.56, 0.34, mTunic, 0, 1.3, 0);
  bx(g, 0.68, 0.34, 0.4, mTunic, 0, 0.94, 0);
  bx(g, 0.63, 0.11, 0.37, MAT.dark, 0, 1.06, 0);
  bx(g, 0.1, 0.09, 0.03, MAT.iron, 0, 1.06, 0.19);
  // shoulder pads
  bx(g, 0.16, 0.14, 0.3, mTunic, -0.37, 1.5, 0);
  bx(g, 0.16, 0.14, 0.3, mTunic, 0.37, 1.5, 0);
  // profession dressing: worn, practical, repaired — never parade gear
  if (apron) {
    bx(g, 0.5, 0.72, 0.05, L(0xb8a684), 0, 1.02, 0.21);
    bx(g, 0.08, 0.5, 0.04, L(0xb8a684), 0, 1.45, 0.19);
  }
  if (pouch) bx(g, 0.17, 0.2, 0.12, L(0x5a4630), 0.27, 0.95, 0.17);
  if (reinforced) {
    bx(g, 0.1, 0.62, 0.36, L(0x3a2e20), -0.15, 1.32, 0.01, 0, 0.5);  // cross straps
    bx(g, 0.1, 0.62, 0.36, L(0x3a2e20), 0.15, 1.32, 0.01, 0, -0.5);
    bx(g, 0.2, 0.08, 0.32, MAT.iron, -0.37, 1.56, 0);               // shoulder plates
    bx(g, 0.2, 0.08, 0.32, MAT.iron, 0.37, 1.56, 0);
  }
  if (kingdomPatch) bx(g, 0.24, 0.2, 0.02, L(0x2e4a6e), -0.14, 1.34, 0.18); // faded stolen heraldry

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
  // wrong posture for the risen dead: stooped chest, sunken head, dangling arms
  if (stance === 'hunched') {
    chest.rotation.x = 0.35; chest.position.z += 0.1;
    head.position.z += 0.22; head.position.y -= 0.14;
    head.rotation.x = 0.25;
    armL.rotation.x = -0.55;
    armPivot.rotation.x = -0.55;
  }
  g.scale.set(scale * buildScale, scale * heightScale, scale * buildScale);
  return { group: g, legs, armPivot, armL, head };
}

// ---------- the White Werewolf (art bible §9): lean, pale, long-limbed, scarred ----------
// An animal that has survived countless hunts — no armor, no jewelry, no glow.
export function makeWerewolf() {
  const g = new THREE.Group();
  const fur = L(0xd4d9e0), pale = L(0xc2c8d2), darkFur = L(0x9aa2ae);
  // hunched torso pitched forward — silhouette readable at a distance
  const torso = bx(g, 0.95, 1.6, 0.75, fur, 0, 1.75, 0.1);
  torso.rotation.x = 0.55;
  bx(g, 0.85, 0.75, 0.65, pale, 0, 1.05, -0.4);              // haunches
  // old scars: dark seams across the hide
  bx(g, 0.06, 0.7, 0.77, darkFur, 0.3, 1.8, 0.11, 0, 0.3);
  bx(g, 0.06, 0.5, 0.77, darkFur, -0.25, 1.6, 0.11, 0, -0.4);
  // digitigrade legs
  const legs = [];
  for (const sx of [-1, 1]) {
    const piv = new THREE.Group();
    piv.position.set(sx * 0.32, 1.05, -0.4);
    bx(piv, 0.3, 0.7, 0.4, fur, 0, -0.3, 0.08, 0, 0, 0.35);   // thigh
    bx(piv, 0.2, 0.65, 0.24, pale, 0, -0.75, -0.12, 0, 0, -0.5); // shin, angled back
    bx(piv, 0.22, 0.14, 0.42, darkFur, 0, -1.02, 0.06);       // long foot
    g.add(piv);
    legs.push(piv);
  }
  // long arms ending in claws
  const mkArm = sx => {
    const piv = new THREE.Group();
    piv.position.set(sx * 0.58, 2.15, 0.32);
    bx(piv, 0.24, 1.15, 0.26, fur, 0, -0.5, 0);
    bx(piv, 0.2, 0.22, 0.22, pale, 0, -1.12, 0.02);
    for (let i = 0; i < 3; i++)
      cyl(piv, 0.008, 0.035, 0.24, 4, darkFur, (i - 1) * 0.07, -1.3, 0.05, 0.3);
    g.add(piv);
    return piv;
  };
  const armL = mkArm(-1);
  const armPivot = mkArm(1);
  // lupine head thrust forward on the neck: intelligent eyes, torn ear
  const head = new THREE.Group();
  head.position.set(0, 2.5, 0.55);
  bx(head, 0.42, 0.4, 0.42, fur, 0, 0, 0);
  bx(head, 0.24, 0.22, 0.4, pale, 0, -0.06, 0.36);            // long muzzle
  bx(head, 0.26, 0.06, 0.1, darkFur, 0, 0.02, 0.56);          // nose
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xc9b47a }); // knowing amber, not demon red
  bx(head, 0.07, 0.05, 0.02, eyeMat, -0.12, 0.1, 0.22).material = eyeMat;
  bx(head, 0.07, 0.05, 0.02, eyeMat, 0.12, 0.1, 0.22).material = eyeMat;
  const earL = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.3, 4), fur);
  earL.position.set(-0.15, 0.3, -0.05); head.add(earL);
  const earR = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.18, 4), darkFur); // torn ear
  earR.position.set(0.16, 0.24, -0.05); earR.rotation.z = -0.4; head.add(earR);
  g.add(head);
  // ragged tail
  bx(g, 0.14, 0.14, 0.8, darkFur, 0, 1.15, -0.95, 0, 0, 0).rotation.x = -0.5;
  g.scale.setScalar(1.55);
  return { group: g, legs, armPivot, armL, head };
}
