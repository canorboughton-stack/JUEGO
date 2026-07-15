// Settlement progression stages (brief §15) — data-driven, evaluated from live
// settlement conditions rather than scripted quests. Plus the first tax hook.
import { G, recordMemory } from './state.js';
import { settlementFood, settlementWithdraw, FOOD_TYPES } from './storage.js';

const has = (type, n = 1) =>
  G.buildings.filter(b => b.type === type && b.built >= 1 && !b.destroyed).length >= n;
const role = (r, n = 1) => G.villagers.filter(v => !v.dead && v.role === r).length >= n;

export const STAGES = [
  {
    id: 0, name: 'Camp',
    check: () => has('campfire') && has('workbench') && has('chest'),
    blurb: 'Basic crafting. Player-only survival.',
  },
  {
    id: 1, name: 'Homestead',
    check: () => has('house') && has('farm') && role('farmer'),
    blurb: 'Food production begins.',
  },
  {
    id: 2, name: 'Village',
    check: () => has('house', 2) && has('guardpost') && role('guard') && has('farm'),
    blurb: 'Guards and livestock. The Kingdom begins collecting taxes.',
  },
  {
    id: 3, name: 'Fortified Settlement',
    check: () => has('gate') && has('wall', 8) && role('guard', 2) && has('watchpos')
      && settlementFood() >= 20,
    blurb: 'Larger raids, higher taxes, stronger Kingdom attention.',
  },
];

export function evaluateStage() {
  let s = -1; // -1 until the basic camp exists
  for (const st of STAGES) {
    if (st.check()) s = st.id; else break;
  }
  if (s > G.stage) { // stages don't regress in v1
    G.stage = s;
    const st = STAGES[s];
    G.ui.banner(`SETTLEMENT STAGE: ${st.name.toUpperCase()}`, st.blurb);
    G.ui.log(`★ The settlement is now a ${st.name}. ${st.blurb}`);
    if (s >= 2 && !G.taxes.nextDay) G.taxes.nextDay = G.day + 3;
  }
}

export function stageName() {
  return G.stage >= 0 ? STAGES[G.stage].name : 'Wilderness Camp';
}

// ---------- THE RED MOON (loop bible) ----------
// Not another event: the world telling the player "tonight you survive — or you
// lose what you've built." Announced one full day ahead. Escalates each time.
export function redMoonDawn() {
  const rm = G.redMoon;
  // warning day: one full day of preparation
  if (!rm.warned && G.day === rm.nextDay - 1) {
    rm.warned = true;
    recordMemory('redmoon');
    G.ui.banner('THE MOON IS TURNING', 'Tomorrow night it rises red. Prepare.');
    G.ui.log('🌑 The moon is turning. Repair the walls, stock food, craft incense, recall your people.');
  }
}

export function redMoonDusk() {
  const rm = G.redMoon;
  if (G.day !== rm.nextDay) return false;
  rm.active = true;
  rm.count++;
  rm.warned = false;
  G.ui.banner('THE RED MOON RISES', 'Survive until dawn.');
  G.ui.log('🔴 The Red Moon rises. The dead ignore the torchlight. The beast in the north is loose.');
  // merchants flee the roads
  if (G.merchant && !G.merchant.gone) {
    G.merchant.remove();
    G.ui.log('The merchant whips the mule east — no trade under a red sky.');
  }
  return true;
}

export function redMoonDawnAfter() {
  const rm = G.redMoon;
  if (!rm.active) return;
  rm.active = false;
  rm.nextDay = G.day + 4 + Math.floor(Math.random() * 3); // and it will come again, harder
  recordMemory('redmoon');
  G.ui.banner('THE RED MOON SETS', 'You survived. Rebuild.');
  G.ui.log(`☀ The Red Moon sets. The next will be worse. (survived: ${rm.count})`);
}

// spawn multiplier for red moon nights — escalation with each occurrence
export function redMoonMult() {
  return G.redMoon.active ? 1.6 + G.redMoon.count * 0.4 : 1;
}

// Kingdom taxes (stage 2+): every 3 days a food levy is drawn from storage.
export function collectTaxes() {
  if (G.stage < 2 || G.day < G.taxes.nextDay) return;
  G.taxes.nextDay = G.day + 3;
  const due = 3 + G.stage * 2;
  let paid = 0;
  for (const r of FOOD_TYPES) {
    if (paid >= due) break;
    paid += settlementWithdraw(r, due - paid);
  }
  recordMemory('taxes');
  if (paid >= due) {
    G.taxes.paid = true; G.taxes.owed = 0; G.taxes.missed = 0;
    G.ui.log(`The Kingdom's tax collector took ${due} food. The ledger is settled.`);
  } else {
    G.taxes.paid = false; G.taxes.owed = due - paid;
    G.taxes.missed = (G.taxes.missed || 0) + 1;
    // the Kingdom's memory is real: two missed levies and the bailiffs march
    if (G.taxes.missed >= 2) {
      G.taxes.bailiffsDue = true;
      G.ui.log(`⚠ Second levy missed. The Kingdom's patience is spent — bailiffs will come at dusk.`);
      G.ui.banner('THE CROWN\'S PATIENCE ENDS', 'Bailiffs march at dusk. Pay in food — or in blood.');
    } else {
      G.ui.log(`⚠ You could not pay the Kingdom's levy (${G.taxes.owed} food short). They will remember.`);
    }
  }
}
