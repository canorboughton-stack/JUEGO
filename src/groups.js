// Group Leader System (villager/follower brief §7–§15).
// NOT an army: a Skyrim-style companion system scaled through leaders.
// Player → Group Leader → Members (two command levels, never more).
// The player commands only the Leader; members follow the Leader's high-level
// order with loose, organic spacing. Dismissed groups melt back into village life.
import { G, dist2d } from './state.js';

export const GROUP_PURPOSES = ['Patrol', 'Hunting', 'Expedition', 'Village Defense'];
export const MAX_MEMBERS = 5; // besides the leader, during Early Access

let nextGid = 1;

export class Group {
  constructor(name, purpose, leader, members = []) {
    this.id = nextGid++;
    this.name = name;
    this.purpose = purpose;
    this.leader = leader;
    this.members = members;        // villagers, excluding the leader
    this.rally = { x: leader.job ? leader.job.x : 0, z: leader.job ? leader.job.z : 0 };
    this.command = null;           // {type, x, z, points, pointIdx, target}
    this.moraleCooldown = 0;
    leader.group = this; leader.isLeader = true;
    for (const m of members) { m.group = this; m.isLeader = false; }
  }

  everyone() { return [this.leader, ...this.members].filter(v => v && !v.dead); }
}

// eligibility per brief §10: guards, or notably brave villagers
export function canLead(v) {
  return !v.dead && !v.group && (v.role === 'guard' || v.bravery >= 0.75);
}
export function canJoin(v) {
  return !v.dead && !v.group;
}

// returns '' on success or a reason string
export function createGroup(name, purpose, leader, members) {
  if (!leader) return 'Every group needs a Leader.';
  if (leader.group) return `${leader.name} already belongs to a group.`;
  if (!(leader.role === 'guard' || leader.bravery >= 0.75))
    return `${leader.name} is not fit to lead (needs a Guard or a brave villager).`;
  if (members.length > MAX_MEMBERS) return `No more than ${MAX_MEMBERS} members.`;
  for (const m of members) {
    if (m.group) return `${m.name} already belongs to a group.`;
  }
  const g = new Group(name, purpose, leader, members);
  G.groups.push(g);
  G.ui.log(`${name} formed — ${leader.name} leads ${members.length} member(s).`);
  return '';
}

// Primary Companion (brief §16): one villager follows the player directly — the
// most Skyrim-like relationship. Implemented as a solo group they "lead" under
// the player's direct supervision, so all commands and save/load work unchanged.
export function makeCompanion(v) {
  if (v.group) return `${v.name} already belongs to a group.`;
  if (G.groups.some(g => g.purpose === 'Companion'))
    return 'You already travel with a companion — dismiss them first.';
  const g = new Group(`${v.name}'s Company`, 'Companion', v, []);
  G.groups.push(g);
  issueCommand(g, 'follow');
  G.ui.log(`${v.name}: "Lead on. I'll watch your back."`);
  return '';
}

export function disbandGroup(g, quiet = false) {
  for (const v of g.everyone()) { v.group = null; v.isLeader = false; }
  const i = G.groups.indexOf(g);
  if (i >= 0) G.groups.splice(i, 1);
  if (!quiet) G.ui.log(`${g.name} disbanded — everyone returns to their duties.`);
}

// leader death: highest-bravery survivor takes command, else the group dissolves
export function onVillagerDeath(v) {
  const g = v.group;
  if (!g) return;
  if (v === g.leader) {
    const heirs = g.members.filter(m => !m.dead)
      .sort((a, b) => b.bravery - a.bravery);
    const heir = heirs.find(m => m.role === 'guard' || m.bravery >= 0.6);
    if (heir) {
      g.members.splice(g.members.indexOf(heir), 1);
      g.leader = heir; heir.isLeader = true;
      G.ui.log(`${v.name} has fallen — ${heir.name} takes command of ${g.name}.`);
    } else {
      G.ui.log(`${v.name} has fallen and no one can lead. ${g.name} scatters for home.`);
      // survivors flee home before the group dissolves
      for (const m of g.members) if (!m.dead) m.fleeCooldown = 4;
      disbandGroup(g, true);
      return;
    }
  } else {
    const i = g.members.indexOf(v);
    if (i >= 0) g.members.splice(i, 1);
  }
  if (g.everyone().length === 0) disbandGroup(g, true);
}

// player gives orders to the LEADER only (brief §11)
export function issueCommand(g, type, opts = {}) {
  g.command = Object.assign({ type }, opts);
  const labels = {
    follow: `${g.leader.name}: "We're with you."`,
    wait: `${g.leader.name}: "We hold here."`,
    defend: `${g.leader.name}: "Nothing gets past us."`,
    patrol: `${g.leader.name}: "We'll walk the line."`,
    attack: `${g.leader.name}: "Take it down!"`,
    retreat: `${g.leader.name}: "Fall back! Fall back!"`,
    home: `${g.leader.name}: "Back to the village."`,
  };
  if (labels[type]) G.ui.log(labels[type]);
  // taking guards away must matter (brief §17): warn about uncovered posts
  if (type === 'follow' || type === 'attack' || type === 'patrol') {
    const posts = g.everyone().filter(v => v.job &&
      (v.job.type === 'guardpost' || v.job.type === 'watchpos')).length;
    if (posts > 0)
      G.ui.log(`⚠ Leaving with ${g.name} leaves ${posts} guard post(s) unmanned.`);
  }
}

// morale & retreat rules (brief §15)
export function updateGroups(dt) {
  for (const g of [...G.groups]) {
    g.moraleCooldown -= dt;
    const alive = g.everyone();
    if (alive.length === 0) { disbandGroup(g, true); continue; }
    if (!g.command || g.moraleCooldown > 0) continue;
    const total = 1 + g.members.length; // intended strength
    const casualties = total - alive.length;
    const avgHp = alive.reduce((t, v) => t + v.hp / v.maxHp, 0) / alive.length;
    const allWeak = alive.every(v => v.hp < v.maxHp * 0.25);
    let breakReason = '';
    if (casualties > total / 2) breakReason = 'too many have fallen';
    else if (allWeak) breakReason = 'everyone is badly wounded';
    else {
      // supernatural fear: the White Werewolf breaks weak-hearted groups
      for (const c of G.creatures) {
        if (!c.dead && c.def.boss && g.leader.bravery < 0.7 &&
            dist2d(c.pos.x, c.pos.z, g.leader.pos.x, g.leader.pos.z) < 30) {
          breakReason = 'terror of the white beast';
          break;
        }
      }
    }
    if (breakReason && g.command.type !== 'home' && g.command.type !== 'retreat') {
      g.moraleCooldown = 20;
      G.ui.log(`${g.name} breaks — ${breakReason}! They run for the village.`);
      issueCommand(g, 'home');
    }
  }
}

// defense accounting for the settlement UI (brief §17)
export function defenseInfo() {
  const guards = G.villagers.filter(v => !v.dead && v.role === 'guard');
  const away = guards.filter(v => v.group && v.group.command &&
    v.group.command.type !== 'home').length;
  const unmanned = G.buildings.filter(b =>
    (b.type === 'guardpost' || b.type === 'watchpos') && b.built >= 1 && !b.destroyed &&
    (!b.worker || b.worker.dead ||
     (b.worker.group && b.worker.group.command && b.worker.group.command.type !== 'home'))).length;
  return { guards: guards.length, onDuty: guards.length - away, away, unmanned };
}
