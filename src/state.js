// Shared mutable game state — single source of truth for all systems.
export const G = {
  // three.js core
  scene: null, camera: null, renderer: null, sun: null, hemi: null,

  // systems (assigned in main.js)
  world: null, player: null, ui: null,

  // clock & calendar. time in [0,1): 0.25 dawn, 0.5 noon, 0.75 dusk
  day: 1,
  time: 0.3,
  DAY_LENGTH: 300, // seconds of real time per full day

  // inventories (brief §5): player carries; settlement stock lives in chests
  playerInv: null,   // initialized in main.js from storage.emptyInv()

  // world population
  buildings: [],   // Building instances
  creatures: [],   // Creature instances
  villagers: [],   // Villager instances
  wanderers: [],   // recruitable NPCs on the road
  animals: [],     // livestock
  loots: [],       // dropped loot bags {mesh,x,z,items}
  colliders: [],   // {x, z, r, owner, gate?} circles blocking movement

  popCap: 0,       // villager capacity from houses (beds)
  stage: -1,       // settlement progression stage (-1 wilderness, 0..3 per brief §15)
  taxes: { nextDay: 0, owed: 0, paid: true },
  uiOpen: false,   // a DOM panel (storage/craft/recruit/settlement) is open
  werewolfSlain: false,
  raidActive: false,

  paused: true,
  keys: {},
};

export function isNight() {
  return G.time < 0.22 || G.time > 0.78;
}

export function isDusk() {
  return (G.time > 0.72 && G.time <= 0.78) || (G.time >= 0.18 && G.time < 0.25);
}

// clamp helper used all over
export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

export function dist2d(ax, az, bx, bz) { return Math.hypot(ax - bx, az - bz); }

// Push a circle position out of all colliders. Returns corrected {x,z}.
// Gates/pens/doors carry `gate: true`: friendlies pass through (auto-open),
// hostiles are blocked unless the structure was left open.
export function resolveCollisions(x, z, r, ignoreOwner, isFriendly = false) {
  for (const c of G.colliders) {
    if (ignoreOwner && c.owner === ignoreOwner) continue;
    if (c.gate && (isFriendly || (c.owner && c.owner.open))) continue;
    const dx = x - c.x, dz = z - c.z;
    const d = Math.hypot(dx, dz);
    const min = r + c.r;
    if (d < min && d > 0.0001) {
      const push = (min - d) / d;
      x += dx * push;
      z += dz * push;
    } else if (d <= 0.0001) {
      x += min;
    }
  }
  // hard map bounds
  x = clamp(x, -195, 195);
  z = clamp(z, -195, 195);
  return { x, z };
}

// Find the collider (building) blocking a mover, if any — used by enemies to attack walls.
export function blockingBuilding(x, z, r) {
  for (const c of G.colliders) {
    if (!c.owner || !c.owner.isBuilding) continue;
    if (dist2d(x, z, c.x, c.z) < r + c.r + 0.35) return c.owner;
  }
  return null;
}
