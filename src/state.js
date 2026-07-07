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

  // settlement economy
  resources: { wood: 30, stone: 10, food: 6 },
  resourceCap: 200,

  // world population
  buildings: [],   // Building instances
  creatures: [],   // Creature instances
  villagers: [],   // Villager instances
  wanderers: [],   // recruitable NPCs on the road
  loots: [],       // dropped loot bags {mesh,x,z,items}
  colliders: [],   // {x, z, r, owner} circles blocking movement

  popCap: 0,       // villager capacity from houses
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
export function resolveCollisions(x, z, r, ignoreOwner) {
  for (const c of G.colliders) {
    if (ignoreOwner && c.owner === ignoreOwner) continue;
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
