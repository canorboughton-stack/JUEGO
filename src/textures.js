// Procedural material textures — the fidelity pass. Everything is drawn onto
// canvases at boot: wood grain, bark, thatch, stone, cloth weave, faces.
// Surface textures are painted in NEUTRAL GREYS (value only) so THREE keeps
// multiplying them by material.color and per-instance colors — the entire
// existing palette and variation system stays intact, but surfaces gain grain.
import * as THREE from '../lib/three.module.js';

const cache = new Map();

function makeTex(key, size, draw, repeat = 1) {
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  draw(ctx, size);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, tex);
  return tex;
}

const rnd = (seed => () => (seed = (seed * 16807) % 2147483647) / 2147483647)(1234567);
const grey = v => `rgb(${v},${v},${v})`;

// value-noise fill: the base coat every material starts from
function noiseFill(ctx, s, base, spread, cells = 26) {
  ctx.fillStyle = grey(base);
  ctx.fillRect(0, 0, s, s);
  const cs = s / cells;
  for (let y = 0; y < cells; y++)
    for (let x = 0; x < cells; x++) {
      ctx.fillStyle = grey(Math.round(base + (rnd() - 0.5) * spread));
      ctx.globalAlpha = 0.55;
      ctx.fillRect(x * cs, y * cs, cs + 1, cs + 1);
    }
  ctx.globalAlpha = 1;
}

// ---------- surface textures (grayscale, tinted by material.color) ----------
export const woodTex = () => makeTex('wood', 128, (ctx, s) => {
  noiseFill(ctx, s, 205, 26, 16);
  // planks: vertical boards with seams and long grain streaks
  const planks = 4, pw = s / planks;
  for (let p = 0; p < planks; p++) {
    ctx.fillStyle = grey(150 + Math.round(rnd() * 20));
    ctx.fillRect(p * pw, 0, 2, s); // seam
    for (let i = 0; i < 12; i++) {
      ctx.strokeStyle = grey(178 + Math.round(rnd() * 40));
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 1 + rnd();
      const x = p * pw + 3 + rnd() * (pw - 6);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.bezierCurveTo(x + (rnd() - 0.5) * 6, s * 0.33, x + (rnd() - 0.5) * 6, s * 0.66, x, s);
      ctx.stroke();
    }
    // a knot or two
    if (rnd() < 0.7) {
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = grey(140);
      const kx = p * pw + pw * (0.3 + rnd() * 0.4), ky = rnd() * s;
      ctx.beginPath(); ctx.ellipse(kx, ky, 3.5, 5, 0, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
});

export const barkTex = () => makeTex('bark', 128, (ctx, s) => {
  noiseFill(ctx, s, 190, 34, 20);
  // rough vertical striations, broken and offset
  for (let i = 0; i < 42; i++) {
    ctx.strokeStyle = grey(120 + Math.round(rnd() * 55));
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1.5 + rnd() * 2.5;
    const x = rnd() * s, y0 = rnd() * s * 0.5, len = s * (0.3 + rnd() * 0.6);
    ctx.beginPath();
    ctx.moveTo(x, y0);
    ctx.lineTo(x + (rnd() - 0.5) * 10, y0 + len);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
});

export const thatchTex = () => makeTex('thatch', 128, (ctx, s) => {
  noiseFill(ctx, s, 200, 30, 22);
  // straw: dense downward strokes in loose bundles
  for (let i = 0; i < 240; i++) {
    ctx.strokeStyle = grey(150 + Math.round(rnd() * 75));
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 1;
    const x = rnd() * s, y = rnd() * s, len = 7 + rnd() * 12;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rnd() - 0.5) * 3, y + len);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}, 2);

export const stoneTex = () => makeTex('stone', 128, (ctx, s) => {
  noiseFill(ctx, s, 195, 26, 18);
  // cobbles: rounded blobs with dark mortar between
  const rows = 4;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < 4; c++) {
      const w = s / 4, h = s / rows;
      const x = c * w + (r % 2) * w * 0.5, y = r * h;
      ctx.fillStyle = grey(185 + Math.round(rnd() * 45));
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.ellipse((x + w / 2) % s, y + h / 2, w * 0.42, h * 0.38, (rnd() - 0.5) * 0.4, 0, 7);
      ctx.fill();
    }
  ctx.globalAlpha = 0.9;
  ctx.strokeStyle = grey(130);
  ctx.lineWidth = 2;
  for (let r = 0; r <= rows; r++) { ctx.beginPath(); ctx.moveTo(0, r * s / rows); ctx.lineTo(s, r * s / rows); ctx.stroke(); }
  ctx.globalAlpha = 1;
});

export const plasterTex = () => makeTex('plaster', 128, (ctx, s) => {
  noiseFill(ctx, s, 215, 18, 30);
  // hairline cracks and water stains
  for (let i = 0; i < 5; i++) {
    ctx.strokeStyle = grey(165);
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 1;
    let x = rnd() * s, y = 0;
    ctx.beginPath(); ctx.moveTo(x, y);
    while (y < s) { x += (rnd() - 0.5) * 14; y += 8 + rnd() * 14; ctx.lineTo(x, y); }
    ctx.stroke();
  }
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = grey(190);
    ctx.globalAlpha = 0.25;
    ctx.beginPath(); ctx.ellipse(rnd() * s, s - rnd() * s * 0.3, 12 + rnd() * 18, 8 + rnd() * 10, 0, 0, 7);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
});

export const clothTex = () => makeTex('cloth', 64, (ctx, s) => {
  noiseFill(ctx, s, 210, 16, 16);
  // coarse weave: alternating warp/weft shading
  for (let y = 0; y < s; y += 3) {
    ctx.fillStyle = grey(y % 6 ? 200 : 218);
    ctx.globalAlpha = 0.35;
    ctx.fillRect(0, y, s, 1.5);
  }
  for (let x = 0; x < s; x += 3) {
    ctx.fillStyle = grey(x % 6 ? 198 : 216);
    ctx.globalAlpha = 0.25;
    ctx.fillRect(x, 0, 1.5, s);
  }
  // patches: this is frontier cloth, mended more than once
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = grey(185);
  ctx.fillRect(rnd() * s * 0.6, rnd() * s * 0.6, 12, 10);
  ctx.globalAlpha = 1;
}, 2);

export const leatherTex = () => makeTex('leather', 64, (ctx, s) => {
  noiseFill(ctx, s, 200, 30, 12);
  for (let i = 0; i < 26; i++) { // creases
    ctx.strokeStyle = grey(160 + Math.round(rnd() * 30));
    ctx.globalAlpha = 0.4;
    ctx.lineWidth = 1;
    const x = rnd() * s, y = rnd() * s;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (rnd() - 0.5) * 20, y + (rnd() - 0.5) * 20); ctx.stroke();
  }
  ctx.globalAlpha = 1;
});

export const leafTex = () => makeTex('leaf', 64, (ctx, s) => {
  noiseFill(ctx, s, 205, 44, 10);
  // clumped darker pockets: canopy depth
  for (let i = 0; i < 12; i++) {
    ctx.fillStyle = grey(150 + Math.round(rnd() * 30));
    ctx.globalAlpha = 0.5;
    ctx.beginPath(); ctx.ellipse(rnd() * s, rnd() * s, 5 + rnd() * 9, 4 + rnd() * 7, 0, 0, 7);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}, 2);

export const groundTex = () => makeTex('ground', 128, (ctx, s) => {
  noiseFill(ctx, s, 218, 22, 34);
  // speckle: pebbles, soil flecks, worn spots
  for (let i = 0; i < 160; i++) {
    ctx.fillStyle = grey(175 + Math.round(rnd() * 60));
    ctx.globalAlpha = 0.35;
    const r = 0.8 + rnd() * 2.2;
    ctx.beginPath(); ctx.arc(rnd() * s, rnd() * s, r, 0, 7); ctx.fill();
  }
  ctx.globalAlpha = 1;
});

// ---------- faces (full color; head front) ----------
// A face is identity (art brief §14): eyes, brows, a weathered mouth, and for
// some, a beard. Three variants per skin tone, cached.
export function faceTex(skin, variant = 0, beard = null) {
  const key = `face_${skin}_${variant}_${beard}`;
  return makeTex(key, 64, (ctx, s) => {
    const col = new THREE.Color(skin);
    ctx.fillStyle = `rgb(${col.r * 255 | 0},${col.g * 255 | 0},${col.b * 255 | 0})`;
    ctx.fillRect(0, 0, s, s);
    // subtle cheek shading + weathering
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = '#00000';
    ctx.fillStyle = 'rgb(90,60,45)';
    ctx.beginPath(); ctx.ellipse(s * 0.28, s * 0.62, 7, 5, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(s * 0.72, s * 0.62, 7, 5, 0, 0, 7); ctx.fill();
    ctx.globalAlpha = 1;
    const dark = 'rgb(28,22,18)';
    // eyes (variant shifts spacing/height a touch)
    const ey = s * (0.40 + variant * 0.02), ex = s * (0.20 - variant * 0.01);
    ctx.fillStyle = 'rgb(232,228,218)';
    ctx.fillRect(s * 0.5 - ex - 5, ey, 10, 5);
    ctx.fillRect(s * 0.5 + ex - 5, ey, 10, 5);
    ctx.fillStyle = dark;
    ctx.fillRect(s * 0.5 - ex - 2, ey, 4, 5);
    ctx.fillRect(s * 0.5 + ex - 2, ey, 4, 5);
    // brows: heavier for variant 2 — these are tired, watchful people
    ctx.fillRect(s * 0.5 - ex - 6, ey - 5 - variant, 12, 2.5 + variant * 0.7);
    ctx.fillRect(s * 0.5 + ex - 6, ey - 5 - variant, 12, 2.5 + variant * 0.7);
    // nose shadow
    ctx.globalAlpha = 0.35;
    ctx.fillRect(s * 0.5 - 1.5, ey + 6, 3, 8);
    ctx.globalAlpha = 1;
    // mouth: a flat, unimpressed line
    ctx.fillStyle = 'rgb(88,52,44)';
    ctx.fillRect(s * 0.5 - 6, s * 0.72, 12, 2.5);
    if (beard !== null) {
      const bc = new THREE.Color(beard);
      ctx.fillStyle = `rgb(${bc.r * 255 | 0},${bc.g * 255 | 0},${bc.b * 255 | 0})`;
      ctx.globalAlpha = 0.9;
      ctx.fillRect(s * 0.5 - 13, s * 0.68, 26, s * 0.32); // full beard block
      ctx.clearRect(s * 0.5 - 6, s * 0.71, 12, 4);        // mouth stays visible
      ctx.globalAlpha = 1;
    }
  });
}
