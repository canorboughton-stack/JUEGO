// Central Village Alert System (brief §10).
// Levels: normal → suspicious → attack → recovery → normal.
// One system owns the level; villagers/guards/UI read it, events raise it.
import { G, dist2d } from './state.js';
import { inTerritory, territorySources } from './territory.js';

export const alertState = {
  level: 'normal',
  quietTimer: 0,      // seconds with no hostile activity
  recoveryTimer: 0,
  damageCount: 0,     // buildings damaged during the current attack
  lastReason: '',
};

const ATTACK_COOLDOWN = 15; // quiet seconds before recovery begins
const RECOVERY_TIME = 8;

export function raiseAlert(level, reason = '') {
  const order = { normal: 0, recovery: 1, suspicious: 2, attack: 3 };
  if (order[level] <= order[alertState.level]) { alertState.quietTimer = 0; return; }
  alertState.level = level;
  alertState.lastReason = reason;
  alertState.quietTimer = 0;
  if (level === 'attack') {
    alertState.damageCount = 0;
    G.ui.log(`⚠ THE VILLAGE IS UNDER ATTACK${reason ? ` — ${reason}` : ''}!`);
    G.ui.banner('UNDER ATTACK', reason || 'Defend the settlement!');
  } else if (level === 'suspicious') {
    G.ui.log(`Something stirs near the settlement${reason ? ` — ${reason}` : ''}...`);
  }
}

export function noteBuildingDamage() {
  alertState.damageCount++;
  raiseAlert('attack', 'a building is being destroyed');
}

export function updateAlerts(dt) {
  // scan for hostiles relative to territory
  let hostileInside = false, hostileNear = false, nearWhat = '';
  for (const c of G.creatures) {
    if (c.dead) continue;
    if (c.type === 'boar' && !c.target) continue; // grazing boars aren't a threat
    if (inTerritory(c.pos.x, c.pos.z)) { hostileInside = true; nearWhat = c.def.name; break; }
    for (const s of territorySources()) {
      if (dist2d(c.pos.x, c.pos.z, s.x, s.z) < s.r + 25) { hostileNear = true; nearWhat = c.def.name; }
    }
  }

  if (hostileInside) raiseAlert('attack', `${nearWhat} inside the settlement`);
  else if (hostileNear && alertState.level === 'normal') raiseAlert('suspicious', `${nearWhat} sighted`);

  if (alertState.level === 'attack') {
    if (!hostileInside && !hostileNear) {
      alertState.quietTimer += dt;
      if (alertState.quietTimer > ATTACK_COOLDOWN) {
        alertState.level = 'recovery';
        alertState.recoveryTimer = RECOVERY_TIME;
        G.ui.log(`The attack is over. ${alertState.damageCount
          ? `${alertState.damageCount} structure(s) took damage — repairs needed.` : 'No structures were damaged.'}`);
      }
    } else alertState.quietTimer = 0;
  } else if (alertState.level === 'suspicious') {
    if (!hostileNear && !hostileInside) {
      alertState.quietTimer += dt;
      if (alertState.quietTimer > 8) { alertState.level = 'normal'; alertState.quietTimer = 0; }
    } else alertState.quietTimer = 0;
  } else if (alertState.level === 'recovery') {
    alertState.recoveryTimer -= dt;
    if (alertState.recoveryTimer <= 0) { alertState.level = 'normal'; G.ui.log('The village returns to work.'); }
  }
}
