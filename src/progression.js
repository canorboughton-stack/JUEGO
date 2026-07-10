// Settlement progression stages (brief §15) — data-driven, evaluated from live
// settlement conditions rather than scripted quests. Plus the first tax hook.
import { G } from './state.js';
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
  if (paid >= due) {
    G.taxes.paid = true; G.taxes.owed = 0;
    G.ui.log(`The Kingdom's tax collector took ${due} food. The ledger is settled.`);
  } else {
    G.taxes.paid = false; G.taxes.owed = due - paid;
    G.ui.log(`⚠ You could not pay the Kingdom's levy (${G.taxes.owed} food short). They will remember.`);
  }
}
