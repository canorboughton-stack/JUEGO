// The merchant carriage. Stage 2 promised "merchant visits" and the King's Road
// buffer exists so the carriage can never be walled in — this delivers both.
// A hooded trader with a mule cart travels the road at midday, halts near the
// settlement for a while, barters (no coin economy yet — goods for goods),
// then rolls on. Trades come from and go to the PLAYER's pack: you carry your
// goods to the road like everyone else on the frontier.
import * as THREE from '../lib/three.module.js';
import { G, dist2d } from './state.js';
import { makeCharacter, makeBeast } from './entities.js';
import { bx, cyl, MAT } from './models.js';
import { POI } from './world.js';
import { playerAdd } from './storage.js';

// barter table: give → get (hide and incense are the frontier's currency)
export const TRADES = [
  { give: { hide: 1 },    get: { corn: 2 },  note: 'seed corn for the fields' },
  { give: { hide: 1 },    get: { wood: 3 },  note: 'milled timber' },
  { give: { incense: 1 }, get: { corn: 5 },  note: 'the temples pay well for incense' },
  { give: { corn: 4 },    get: { stone: 3 }, note: 'quarry stone' },
  { give: { hide: 4 },    get: { sword: 1 }, note: 'a soldier\'s blade, second-hand' },
  { give: { hide: 3 },    get: { bow: 1 },   note: 'a hunter\'s bow' },
  { give: { bones: 3 },   get: { corn: 3 },  note: 'the bone-carvers pay steady coin' },
  { give: { monsterpart: 1 }, get: { corn: 5, stone: 2 }, note: 'scholars pay dearly for cursed flesh' },
];

export class Merchant {
  constructor() {
    this.pos = new THREE.Vector3(-192, 0, POI.roadZ);
    this.state = 'travel';       // travel → trading (halt near the village) → travel → gone
    this.haltTimer = 70;
    this.gone = false;

    const g = new THREE.Group();
    // the mule
    this.mule = makeBeast(1.3, 1.0, 0.5, 0x6e5f4d, 0x5a4d3e);
    this.mule.group.position.set(0, 0, 1.6);
    g.add(this.mule.group);
    // the cart: bed, rails, two wheels, yoke pole, cargo under canvas
    const cart = new THREE.Group();
    bx(cart, 1.3, 0.12, 2.0, MAT.beamLight, 0, 0.75, 0);
    bx(cart, 0.1, 0.35, 2.0, MAT.beam, -0.62, 0.98, 0);
    bx(cart, 0.1, 0.35, 2.0, MAT.beam, 0.62, 0.98, 0);
    for (const sx of [-1, 1]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.1, 10), MAT.beam);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(sx * 0.75, 0.55, 0);
      cart.add(wheel);
    }
    bx(cart, 0.08, 0.08, 1.6, MAT.beam, 0.25, 0.8, 1.6);   // yoke pole to the mule
    bx(cart, 1.1, 0.5, 1.5, new THREE.MeshLambertMaterial({ color: 0x9a8a6a }), 0, 1.15, -0.1); // canvas load
    cyl(cart, 0.28, 0.32, 0.5, 8, MAT.beamLight, 0.35, 1.5, 0.5);  // barrel on top
    cart.position.set(0, 0, -0.6);
    g.add(cart);
    // the trader walks beside the cart
    this.fig = makeCharacter({ tunic: 0x5a4a5e, skin: 0xc9a07a, hat: 'hood',
      hatColor: 0x3e3444, pouch: true });
    this.fig.group.position.set(1.1, 0, 0.6);
    g.add(this.fig.group);
    this.mesh = g;
    G.scene.add(g);
  }

  update(dt) {
    if (this.gone) return;
    if (this.state === 'travel') {
      this.pos.x += 2.4 * dt;
      this.pos.z += (POI.roadZ - this.pos.z) * dt * 0.5;
      this.walkPhase = (this.walkPhase || 0) + dt * 5;
      const sw = Math.sin(this.walkPhase) * 0.45;
      this.mule.legs.forEach((l, i) => { l.rotation.x = sw * (i % 2 ? 1 : -1); });
      this.fig.legs.forEach((l, i) => { l.rotation.x = sw * (i % 2 ? 1 : -1); });
      // halt at the stretch of road nearest the settlement
      if (!this.halted && Math.abs(this.pos.x) < 2) {
        this.state = 'trading';
        this.halted = true;
        G.ui.log('A merchant carriage has halted on the King\'s Road. (E to trade)');
      }
      if (this.pos.x > 190) this.remove();
    } else if (this.state === 'trading') {
      this.haltTimer -= dt;
      if (this.haltTimer <= 0) {
        this.state = 'travel';
        G.ui.log('The merchant flicks the reins and moves on east.');
      }
    }
    this.pos.y = G.world.h(this.pos.x, this.pos.z);
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = Math.PI / 2; // heading east
  }

  remove() {
    this.gone = true;
    G.scene.remove(this.mesh);
    if (G.merchant === this) G.merchant = null;
  }
}

// spawn at midday from Village stage onward
export function maybeSpawnMerchant() {
  if (G.stage < 2 || G.merchant) return;
  G.merchant = new Merchant();
  G.ui.log('Dust on the western road — a merchant carriage approaches.');
}

export function updateMerchant(dt) {
  if (G.merchant) G.merchant.update(dt);
}

// returns '' on success or a reason
export function doTrade(idx) {
  const t = TRADES[idx];
  if (!t) return 'No such offer.';
  for (const [res, n] of Object.entries(t.give))
    if ((G.playerInv[res] || 0) < n) return `You need ${n} ${res} in your pack.`;
  for (const [res, n] of Object.entries(t.give)) G.playerInv[res] -= n;
  for (const [res, n] of Object.entries(t.get)) playerAdd(res, n);
  return '';
}
