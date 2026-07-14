// Shared settlement storage & logistics (brief §5).
// Three separate inventories: player inventory, per-NPC carried inventory,
// and settlement storage (the sum of all Storage Chest contents).
// Resources never "magically exist everywhere": crafting/building draws from
// player + settlement chests; farmers physically carry crops to a chest.
import { G, dist2d } from './state.js';

export const RESOURCES = ['wood', 'stone', 'meat', 'corn', 'cabbage', 'hide',
  'herbs', 'bones', 'monsterpart', 'incense'];
export const FOOD_TYPES = ['corn', 'cabbage', 'meat']; // eaten cheapest-first
export const ITEMS = ['sword', 'bow'];                 // crafted equipment
export const RES_ICONS = {
  wood: '🪵', stone: '🪨', meat: '🍖', corn: '🌽', cabbage: '🥬',
  hide: '🟫', herbs: '🌿', bones: '🦴', monsterpart: '🧿', incense: '🕯',
  sword: '🗡', bow: '🏹',
};

export const PLAYER_CARRY_CAP = 80;   // total resource units the player can haul
export const CHEST_CAP = 120;         // per storage chest

export function emptyInv() {
  const inv = {};
  for (const r of [...RESOURCES, ...ITEMS]) inv[r] = 0;
  return inv;
}

export function invTotal(inv) {
  let t = 0;
  for (const r of RESOURCES) t += inv[r] || 0; // equipment doesn't weigh against caps
  return t;
}

// ---------- player inventory ----------
export function playerAdd(res, n) {
  const room = ITEMS.includes(res) ? n : Math.max(0, PLAYER_CARRY_CAP - invTotal(G.playerInv));
  const put = Math.min(n, room);
  G.playerInv[res] = (G.playerInv[res] || 0) + put;
  if (put < n) G.ui.log('You cannot carry more — deposit at a Storage Chest.');
  return put;
}

// ---------- settlement chests ----------
export function chests() {
  return G.buildings.filter(b => b.type === 'chest' && b.built >= 1 && !b.destroyed);
}

export function chestSpace(chest) {
  return CHEST_CAP - invTotal(chest.store);
}

export function nearestChestWithSpace(x, z, need = 1) {
  let best = null, bd = Infinity;
  for (const c of chests()) {
    if (chestSpace(c) < need) continue;
    const d = dist2d(x, z, c.x, c.z);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}

export function nearestChestWithStock(x, z, res) {
  let best = null, bd = Infinity;
  for (const c of chests()) {
    if ((c.store[res] || 0) <= 0) continue;
    const d = dist2d(x, z, c.x, c.z);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}

export function settlementCount(res) {
  return chests().reduce((t, c) => t + (c.store[res] || 0), 0);
}

export function settlementFood() {
  return FOOD_TYPES.reduce((t, r) => t + settlementCount(r), 0);
}

// deposit into chests (nearest-first when a position is given); returns amount stored
export function settlementDeposit(res, n, x = 0, z = 0) {
  let left = n;
  const list = chests().sort((a, b) => dist2d(x, z, a.x, a.z) - dist2d(x, z, b.x, b.z));
  for (const c of list) {
    if (left <= 0) break;
    const put = ITEMS.includes(res) ? left : Math.min(left, chestSpace(c));
    c.store[res] = (c.store[res] || 0) + put;
    left -= put;
  }
  return n - left;
}

export function settlementWithdraw(res, n) {
  let left = n;
  for (const c of chests()) {
    if (left <= 0) break;
    const take = Math.min(left, c.store[res] || 0);
    c.store[res] -= take;
    left -= take;
  }
  return n - left;
}

// consume mixed food units from settlement storage; returns units actually consumed
export function settlementEatFood(n) {
  let left = n;
  for (const r of FOOD_TYPES) {
    if (left <= 0) break;
    left -= settlementWithdraw(r, left);
  }
  return n - left;
}

// ---------- combined (player + settlement) accounting for building/crafting ----------
export function combinedCount(res) {
  return (G.playerInv[res] || 0) + settlementCount(res);
}

export function canAffordCombined(cost) {
  return Object.entries(cost).every(([r, n]) => combinedCount(r) >= n);
}

// pays from player inventory first, then settlement storage
export function payCombined(cost) {
  for (const [r, n] of Object.entries(cost)) {
    const fromPlayer = Math.min(n, G.playerInv[r] || 0);
    G.playerInv[r] -= fromPlayer;
    const remain = n - fromPlayer;
    if (remain > 0) settlementWithdraw(r, remain);
  }
}

export function costLabel(cost) {
  return Object.entries(cost).map(([r, n]) => `${n} ${r}`).join(', ');
}

// ---------- data-driven workbench recipes (brief §3) ----------
export const RECIPES = [
  { id: 'sword', name: 'Iron Sword', cost: { wood: 3, stone: 4, hide: 1 },
    desc: 'Arms one guard' },
  { id: 'bow', name: 'Hunting Bow', cost: { wood: 5, hide: 2 },
    desc: 'Ranged weapon for watch positions' },
  { id: 'incense', name: 'Incense', cost: { herbs: 2 },
    desc: 'Burned at dusk to ward ghosts; needed for binding rituals' },
];
