// Villagers are individuals (follower brief §1–§6): persistent identity, one
// primary personality trait, a readable data-driven daily schedule, lightweight
// social life with context barks, and role-appropriate danger behavior.
// Group/follower behavior (brief §7–§15) plugs in through this.group.
import * as THREE from '../lib/three.module.js';
import { G, clamp, dist2d, resolveCollisions, isNight, recordMemory, recentMemories } from './state.js';
import { makeCharacter, addSword } from './entities.js';
import { POI } from './world.js';
import { emptyInv, invTotal, nearestChestWithSpace, nearestChestWithStock, chestSpace,
         settlementEatFood, combinedCount, payCombined } from './storage.js';
import { alertState, raiseAlert } from './alerts.js';
import { CROPS } from './buildings.js';
import { onVillagerDeath } from './groups.js';

const NAMES = ['Aldric', 'Berta', 'Cedric', 'Duna', 'Edda', 'Falk', 'Greta', 'Hamon',
  'Isolde', 'Jorun', 'Kessa', 'Lothar', 'Mira', 'Nolan', 'Ottila', 'Piers'];
let nameIdx = 0;
let nextVid = 1;

const TUNICS = [0x8a8070, 0x7a6a52, 0x6e7a5a, 0x8a6a5a, 0x6a6a7a, 0x9a8a6a];
const HAIRS = [0x4a3320, 0x2e2318, 0x6e5a3a, 0x8a7a5a, 0x3a3a3a];
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

// ---------- personality traits (brief §2): one primary trait per villager ----------
export const TRAITS = {
  brave:       { bravery: 0.88, fleeR: 8,  social: 1.0, eff: 1.0,
                 blurb: 'stands their ground' },
  cautious:    { bravery: 0.28, fleeR: 18, social: 1.0, eff: 1.0,
                 blurb: 'notices trouble early' },
  hardworking: { bravery: 0.5,  fleeR: 13, social: 0.6, eff: 1.15,
                 blurb: 'rarely idle' },
  sociable:    { bravery: 0.45, fleeR: 13, social: 2.2, eff: 1.0,
                 blurb: 'gathers people' },
  grim:        { bravery: 0.68, fleeR: 12, social: 0.8, eff: 1.0,
                 blurb: 'unmoved by the dark' },
};

// ---------- daily schedule (brief §3) — data, not hardcoded branching ----------
export const SCHEDULE = [
  { from: 0.25, to: 0.29, act: 'work' },    // wake, eat, walk to work
  { from: 0.29, to: 0.47, act: 'work' },    // work period one
  { from: 0.47, to: 0.53, act: 'break' },   // midday meal & talk
  { from: 0.53, to: 0.70, act: 'work' },    // work period two
  { from: 0.70, to: 0.79, act: 'social' },  // evening at the campfire
];
export function scheduleAt(t) {
  for (const s of SCHEDULE) if (t >= s.from && t < s.to) return s.act;
  return 'sleep';
}

// ---------- context barks (brief §5): short lines tied to village memory ----------
const BARKS = {
  attack: ['They came closer than before.', 'Check the walls twice tonight.',
           'I heard it breathing past the fence.'],
  raid:   ['Bandits know our stores now.', 'Bar the doors after dusk.',
           'They will be back for the rest.'],
  death:  ['That bed will be empty tonight.', 'We dig too many graves.',
           'Say their name at the fire tonight.'],
  taxes:  ['The King takes his share, whether winter comes or not.',
           'Taxes paid. Bellies lighter.'],
  ghost:  ['Keep the incense burning.', 'The fog was breathing last night.',
           'Do not answer if the mist calls your name.'],
  quiet:  ['Good soil this year, if the boars allow it.', 'The fence held through the night.',
           'May it stay this quiet.', 'My hands ache, but we eat.'],
  grim:   ['The land remembers its dead.', 'We bury more than we plant.',
           'Warmth is borrowed here.'],
  travel: ['Stay close. The trees listen.', 'We should not linger out here.',
           'Eyes open. This is their ground.'],
  redmoon: ['The moon is turning...', 'Bar every door tomorrow night.',
            'My grandmother said the red sky drinks courage.', 'Sharpen everything. Tonight we do not sleep.'],
};

export function pickBark(v, context = null) {
  if (context && BARKS[context]) return pick(BARKS[context]);
  if (v.trait === 'grim' && Math.random() < 0.35) return pick(BARKS.grim);
  const rec = recentMemories();
  if (rec.length && Math.random() < 0.7) {
    const set = BARKS[pick(rec).kind];
    if (set) return pick(set);
  }
  return pick(BARKS.quiet);
}

// floating speech sprite above a villager's head
export function bark(v, text) {
  if (v.dead || !v.mesh) return;
  if (v._barkSprite) v.mesh.remove(v._barkSprite);
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 96;
  const ctx = cv.getContext('2d');
  ctx.font = '30px Georgia';
  ctx.textAlign = 'center';
  const w = Math.min(500, ctx.measureText(text).width + 36);
  ctx.fillStyle = 'rgba(10,8,14,0.78)';
  ctx.fillRect((512 - w) / 2, 20, w, 54);
  ctx.fillStyle = '#e8dcb8';
  ctx.fillText(text, 256, 56);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(cv), transparent: true, depthTest: false }));
  sp.scale.set(5.2, 0.98, 1);
  sp.position.set(0, 2.6, 0);
  v.mesh.add(sp);
  v._barkSprite = sp;
  setTimeout(() => { if (v._barkSprite === sp) { v.mesh.remove(sp); v._barkSprite = null; } }, 4500);
}

// ---------- graves (brief §18: death leaves an empty bed and a grave) ----------
export function addGrave(name, save = true) {
  const fire = G.buildings.find(b => b.type === 'campfire');
  const i = G.graves.length;
  const x = (fire ? fire.x : 0) - 9 - (i % 4) * 1.6;
  const z = (fire ? fire.z : 0) - 9 - Math.floor(i / 4) * 2.2;
  const g = new THREE.Group();
  const mound = new THREE.Mesh(new THREE.SphereGeometry(0.55, 7, 5),
    new THREE.MeshLambertMaterial({ color: 0x4a3a2a }));
  mound.scale.set(1, 0.35, 1.6);
  mound.position.y = 0.1;
  g.add(mound);
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.9, 0.1),
    new THREE.MeshLambertMaterial({ color: 0x5a4a34 }));
  post.position.set(0, 0.45, -0.7);
  g.add(post);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.1),
    new THREE.MeshLambertMaterial({ color: 0x5a4a34 }));
  arm.position.set(0, 0.62, -0.7);
  g.add(arm);
  g.position.set(x, G.world.h(x, z), z);
  G.scene.add(g);
  G.graves.push({ x, z, name, mesh: g });
  if (save) G.ui.log(`A grave was dug for ${name}.`);
}

// guard arrows (watch position ranged attacks)
const arrows = [];
export function fireArrow(from, to) {
  const geo = new THREE.BufferGeometry().setFromPoints([from.clone(), to.clone()]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xd8c9a0 }));
  G.scene.add(line);
  arrows.push({ line, ttl: 0.25 });
}
export function updateArrows(dt) {
  for (let i = arrows.length - 1; i >= 0; i--) {
    arrows[i].ttl -= dt;
    if (arrows[i].ttl <= 0) { G.scene.remove(arrows[i].line); arrows.splice(i, 1); }
  }
}

const WORK_START = 0.25, WORK_END = 0.79; // outermost daylight bounds

// ---------- wanderers (recruitable travelers on the King's Road) ----------
export class Wanderer {
  constructor(fromWest) {
    this.name = NAMES[nameIdx++ % NAMES.length];
    this.pos = new THREE.Vector3(fromWest ? -192 : 192, 0, POI.roadZ);
    this.dir = fromWest ? 1 : -1;
    this.fig = makeCharacter({ tunic: pick(TUNICS), skin: 0xc9a07a, hat: 'hood', hatColor: 0x5a5346 });
    this.mesh = this.fig.group;
    G.scene.add(this.mesh);
    this.walkPhase = 0;
    this.gone = false;
  }
  update(dt) {
    this.pos.x += this.dir * 2.6 * dt;
    this.pos.z += (POI.roadZ - this.pos.z) * dt * 0.5;
    if (Math.abs(this.pos.x) > 194) { this.remove(); return; }
    this.pos.y = G.world.h(this.pos.x, this.pos.z);
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    this.walkPhase += dt * 5;
    const sw = Math.sin(this.walkPhase) * 0.5;
    this.fig.legs.forEach((l, i) => { l.rotation.x = sw * (i % 2 ? 1 : -1); });
  }
  remove() {
    this.gone = true;
    G.scene.remove(this.mesh);
    const i = G.wanderers.indexOf(this);
    if (i >= 0) G.wanderers.splice(i, 1);
  }
}

export function spawnWanderer() {
  G.wanderers.push(new Wanderer(Math.random() < 0.5));
}

export function updateWanderers(dt) {
  for (let i = G.wanderers.length - 1; i >= 0; i--) G.wanderers[i].update(dt);
}

// ---------- villagers ----------
export class Villager {
  constructor(name, x, z, role = null) {
    this.id = nextVid++;
    this.name = name || NAMES[nameIdx++ % NAMES.length];
    this.pos = new THREE.Vector3(x, 0, z);
    this.hp = 90; this.maxHp = 90;
    this.dead = false;
    this.role = role;          // 'farmer' | 'guard'
    this.job = null;           // workplace building
    this.home = null;          // shack with this villager's bed
    this.weapon = null;        // 'sword' | 'bow' (guards)
    this.carry = emptyInv();
    this.state = 'Idle';
    this.problem = '';
    this.hungerDays = 0;
    this.inside = false;

    // identity (brief §2)
    this.trait = pick(Object.keys(TRAITS));
    this.bravery = clamp(TRAITS[this.trait].bravery + (Math.random() - 0.3) * 0.12, 0.1, 1);
    this.heightScale = 0.93 + Math.random() * 0.15;
    this.buildScale = 0.9 + Math.random() * 0.2;

    // groups (brief §8)
    this.group = null; this.isLeader = false;

    // social state
    this.socialSpot = null; this.socialTimer = 0;
    this.talking = 0; this.talkPartner = null;
    this.talkCd = Math.random() * 12;
    this.mourning = false;
    this.lookPause = 0; this._lastAlert = 'normal';
    this._travelBarkCd = 20;

    this.atkTimer = 0; this.taskTimer = 0; this.fleeCooldown = 0; this.pursuitCooldown = 0;
    this.walkPhase = 0;
    this.wanderTo = null; this.wanderTimer = 0;
    this._buildFig();
  }

  _buildFig() {
    if (this.mesh) G.scene.remove(this.mesh);
    if (!this.hair) this.hair = pick(HAIRS);
    if (!this.tunic) this.tunic = pick(TUNICS);
    const sil = { heightScale: this.heightScale, buildScale: this.buildScale };
    if (this.role === 'guard') {
      // padded jacket, leather reinforcement, practical helmet — no parade armor
      this.fig = makeCharacter({ tunic: 0x4a5568, skin: 0xc9a07a, hat: 'helm',
        pants: 0x3a3f4a, reinforced: true, pouch: true, ...sil });
      if (this.weapon !== 'bow') addSword(this.fig.armPivot, 0x8a909c, 0.7);
    } else if (this.role === 'farmer') {
      // work apron, rolled-sleeve look, straw hat, utility pouch
      this.fig = makeCharacter({ tunic: 0x7a6a3a, skin: 0xc9a07a, hat: 'straw',
        hair: this.hair, apron: true, pouch: true, ...sil });
    } else if (this.role === 'woodcutter') {
      // heavy forest browns, hood down the trail, big carry pouch
      this.fig = makeCharacter({ tunic: 0x6a4a2e, skin: 0xc9a07a, hat: 'hood',
        hatColor: 0x4a3a26, pants: 0x453424, pouch: true, reinforced: true, ...sil });
    } else if (this.role === 'stonecutter') {
      // dusted greys, tied-back hair, work pouch
      this.fig = makeCharacter({ tunic: 0x5c6068, skin: 0xc9a07a,
        hair: this.hair, pants: 0x45484e, apron: true, pouch: true, ...sil });
    } else {
      this.fig = makeCharacter({ tunic: this.tunic, skin: 0xc9a07a, hair: this.hair,
        pouch: Math.random() < 0.5, ...sil });
    }
    this.mesh = this.fig.group;
    this.mesh.position.copy(this.pos);
    G.scene.add(this.mesh);
  }

  eff() {
    let e = TRAITS[this.trait].eff;
    if (!this.home) e *= 0.6;
    if (this.hungerDays >= 1) e *= 0.6;
    return e;
  }

  makeHomeless() {
    this.home = null;
    G.ui.log(`${this.name} is homeless — their shack was destroyed.`);
  }

  takeDamage(n, from) {
    if (this.dead) return;
    this.hp -= n;
    this.inside = false;
    raiseAlert('attack', `${this.name} is being attacked`);
    if (this.hp <= 0) {
      this.dead = true;
      this.state = 'Dead';
      G.scene.remove(this.mesh);
      if (this.job) { this.job.worker = null; this.job = null; }
      if (this.home) {
        const i = this.home.residents.indexOf(this);
        if (i >= 0) this.home.residents.splice(i, 1);
      }
      G.ui.log(`✝ ${this.name} the ${this.role || 'villager'} has been slain.`);
      G.overnight.deaths.push(this.name);
      recordMemory('death');
      addGrave(this.name);
      onVillagerDeath(this);
    }
  }

  _moveToward(x, z, dt, speed) {
    const dx = x - this.pos.x, dz = z - this.pos.z;
    const dd = Math.hypot(dx, dz);
    if (dd < 0.1) return true;
    // gate routing: friendly NPCs use gates for navigation (brief §3 Gate).
    // While a via-point is active, head there instead of the real target.
    let tx = x, tz = z;
    if (this._via) {
      this._via.ttl -= dt;
      if (this._via.ttl <= 0 || dist2d(this.pos.x, this.pos.z, this._via.x, this._via.z) < 1.6)
        this._via = null;
      else { tx = this._via.x; tz = this._via.z; }
    }
    // steering: when blocked by walls/rocks, veer off-angle until clear
    this._avoidT = (this._avoidT || 0) - dt;
    let ang = Math.atan2(tx - this.pos.x, tz - this.pos.z);
    if (this._avoidT > 0) ang += this._avoidA;
    const before = { x: this.pos.x, z: this.pos.z };
    const nx = this.pos.x + Math.sin(ang) * speed * dt;
    const nz = this.pos.z + Math.cos(ang) * speed * dt;
    // friendlies pass gates; workers ignore their own workplace's collider
    const solved = resolveCollisions(nx, nz, 0.4, this.job, true);
    this.pos.x = solved.x; this.pos.z = solved.z;
    const moved = dist2d(before.x, before.z, this.pos.x, this.pos.z);
    if (moved < speed * dt * 0.3) {
      this._blockT = (this._blockT || 0) + dt;
      if (this._blockT > 0.35) {
        this._blockT = 0;
        // stuck on a wall: route through the nearest gate if one is close
        let gate = null, gd = 16;
        for (const b of G.buildings) {
          if (!b.def.gate || b.destroyed || b.type === 'animalpen') continue;
          const d = dist2d(this.pos.x, this.pos.z, b.x, b.z);
          if (d < gd) { gd = d; gate = b; }
        }
        if (gate && !this._via) {
          this._via = { x: gate.x, z: gate.z, ttl: 4 };
        } else {
          // no gate nearby: veer, alternating direction each retry
          this._avoidDir = -(this._avoidDir || (Math.random() < 0.5 ? 1 : -1));
          this._avoidA = this._avoidDir * (0.9 + Math.random() * 0.9);
          this._avoidT = 0.9;
        }
      }
    } else if (this._avoidT <= 0) {
      this._blockT = 0;
    }
    this.mesh.rotation.y = Math.atan2(tx - this.pos.x, tz - this.pos.z);
    this.walkPhase += dt * speed * 1.7;
    return dd < 0.6;
  }

  _wanderNear(cx, cz, r, dt, speed) {
    this.wanderTimer -= dt;
    if (!this.wanderTo || this.wanderTimer <= 0) {
      const a = Math.random() * 6.28, d = Math.random() * r;
      this.wanderTo = { x: cx + Math.cos(a) * d, z: cz + Math.sin(a) * d };
      this.wanderTimer = 3 + Math.random() * 4;
    }
    if (dist2d(this.pos.x, this.pos.z, this.wanderTo.x, this.wanderTo.z) > 1)
      this._moveToward(this.wanderTo.x, this.wanderTo.z, dt, speed);
  }

  _homePos() {
    if (this.home) return { x: this.home.x, z: this.home.z + 2.4 };
    const fire = G.buildings.find(b => b.type === 'campfire');
    return fire ? { x: fire.x + 1.5, z: fire.z + 1.5 } : { x: 0, z: 0 };
  }

  _firePos() {
    const fire = G.buildings.find(b => b.type === 'campfire');
    return fire ? { x: fire.x, z: fire.z } : { x: 0, z: 0 };
  }

  _nearestThreat(radius) {
    let best = null, bd = radius;
    for (const c of G.creatures) {
      if (c.dead) continue;
      if (c.type === 'boar' && !c.target) continue;
      if (c.weakened) continue; // broken beasts are prey for the ritual, not threats
      const d = dist2d(this.pos.x, this.pos.z, c.pos.x, c.pos.z);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  update(dt) {
    if (this.dead) return;
    this.atkTimer -= dt; this.fleeCooldown -= dt; this.pursuitCooldown -= dt;
    this.hp = Math.min(this.maxHp, this.hp + dt * 0.5);

    // active group command overrides ordinary life (brief §7-§12)
    if (this.group && this.group.command) this._updateGrouped(dt);
    else if (this.role === 'guard') this._updateGuard(dt);
    else this._updateCivilian(dt);

    this.mesh.visible = !this.inside;
    const standY = (this.role === 'guard' && this.job && this.job.def.standY &&
      (!this.group || !this.group.command) &&
      dist2d(this.pos.x, this.pos.z, this.job.x, this.job.z) < 1.5) ? this.job.def.standY : 0;
    this.pos.y = G.world.h(this.pos.x, this.pos.z) + standY;
    this.mesh.position.copy(this.pos);
    const sw = Math.sin(this.walkPhase) * 0.5;
    this.fig.legs.forEach((l, i) => { l.rotation.x = sw * (i % 2 ? 1 : -1); });
    // idle breathing: villagers appear to live rather than freeze between loops
    if (this._baseScaleY === undefined) this._baseScaleY = this.mesh.scale.y;
    this.mesh.scale.y = this._baseScaleY *
      (1 + Math.sin(performance.now() * 0.0016 + this.id * 2.1) * 0.008);
  }

  // ---------- group/follower behavior (brief §11-§14) ----------
  _meleeOrShoot(enemy, dt) {
    const d = dist2d(this.pos.x, this.pos.z, enemy.pos.x, enemy.pos.z);
    const ranged = this.weapon === 'bow';
    if (ranged && d < 20 && d > 4) {
      this.state = 'Fighting';
      this.mesh.rotation.y = Math.atan2(enemy.pos.x - this.pos.x, enemy.pos.z - this.pos.z);
      if (this.atkTimer <= 0) {
        this.atkTimer = 1.5;
        enemy.takeDamage(10, this);
        fireArrow(this.pos.clone().add(new THREE.Vector3(0, 1.4, 0)),
          enemy.pos.clone().add(new THREE.Vector3(0, 0.8, 0)));
      }
      return;
    }
    if (d > 2.2) {
      this.state = 'Fighting';
      this._moveToward(enemy.pos.x, enemy.pos.z, dt, 6);
    } else {
      this.state = 'Fighting';
      this.mesh.rotation.y = Math.atan2(enemy.pos.x - this.pos.x, enemy.pos.z - this.pos.z);
      if (this.atkTimer <= 0) {
        this.atkTimer = 1.0;
        enemy.takeDamage(this.role === 'guard' ? 14 : 8, this);
        this.fig.armPivot.rotation.x = -2.0;
        setTimeout(() => { if (!this.dead) this.fig.armPivot.rotation.x = 0; }, 180);
      }
    }
  }

  _updateGrouped(dt) {
    const g = this.group, cmd = g.command, leader = g.leader;
    this.problem = '';
    this.inside = false;

    // autonomous combat — but retreat/home means disengage (brief §11, §14)
    if (cmd.type !== 'retreat' && cmd.type !== 'home') {
      let enemy = (cmd.type === 'attack' && cmd.target && !cmd.target.dead) ? cmd.target : null;
      if (!enemy) enemy = this._nearestThreat(14);
      // members also answer threats pressing the leader or the player
      if (!enemy && !this.isLeader) {
        for (const c of G.creatures) {
          if (c.dead || (c.type === 'boar' && !c.target)) continue;
          if (dist2d(c.pos.x, c.pos.z, leader.pos.x, leader.pos.z) < 14 ||
              (G.player && dist2d(c.pos.x, c.pos.z, G.player.pos.x, G.player.pos.z) < 12)) {
            enemy = c; break;
          }
        }
      }
      if (enemy) {
        // group pursuit limit: never drift far from the leader's fight
        const anchor = this.isLeader ? this.pos : leader.pos;
        if (this.isLeader ||
            dist2d(enemy.pos.x, enemy.pos.z, anchor.x, anchor.z) < 30) {
          this._meleeOrShoot(enemy, dt);
          return;
        }
      }
      if (cmd.type === 'attack' && (!cmd.target || cmd.target.dead))
        g.command = { type: 'follow' }; // target down — fall in behind the player
    }

    if (this.isLeader) {
      // occasional traveling bark: companions comment on the road (brief §7)
      if (cmd.type === 'follow') {
        this._travelBarkCd -= dt;
        if (this._travelBarkCd <= 0) {
          this._travelBarkCd = 30 + Math.random() * 40;
          if (Math.random() < 0.6) bark(this, pickBark(this, 'travel'));
        }
      }
      switch (cmd.type) {
        case 'follow': {
          const d = dist2d(this.pos.x, this.pos.z, G.player.pos.x, G.player.pos.z);
          this.state = 'Following';
          // far-behind leaders use simplified fast travel to regroup (brief §13)
          if (d > 3.2) this._moveToward(G.player.pos.x, G.player.pos.z, dt,
            d > 30 ? 12 : d > 12 ? 8.5 : 5.4);
          break;
        }
        case 'wait':
          this.state = 'Holding';
          if (dist2d(this.pos.x, this.pos.z, cmd.x, cmd.z) > 1.5)
            this._moveToward(cmd.x, cmd.z, dt, 5);
          break;
        case 'defend':
          this.state = 'Defending';
          this._wanderNear(cmd.x, cmd.z, 6, dt, 2.4);
          break;
        case 'patrol': {
          this.state = 'Patrolling';
          const p = cmd.points[cmd.pointIdx || 0];
          if (this._moveToward(p.x, p.z, dt, 3.6) ||
              dist2d(this.pos.x, this.pos.z, p.x, p.z) < 2)
            cmd.pointIdx = ((cmd.pointIdx || 0) + 1) % cmd.points.length;
          break;
        }
        case 'retreat': {
          this.state = 'Retreating';
          const d = dist2d(this.pos.x, this.pos.z, G.player.pos.x, G.player.pos.z);
          if (d > 5) this._moveToward(G.player.pos.x, G.player.pos.z, dt, 6.8);
          else g.command = { type: 'follow' };
          break;
        }
        case 'home': {
          this.state = 'Traveling Home';
          const d = dist2d(this.pos.x, this.pos.z, g.rally.x, g.rally.z);
          if (d > 3) this._moveToward(g.rally.x, g.rally.z, dt, 5);
          else {
            g.command = null;
            G.ui.log(`${g.name} is home — everyone returns to their duties.`);
          }
          break;
        }
      }
      return;
    }

    // members: loose slots around the leader, updated on timers not per-frame (brief §12-§13)
    this._slotTimer = (this._slotTimer ?? 0) - dt;
    if (!this._slot || this._slotTimer <= 0) {
      this._slotTimer = 0.6;
      const idx = Math.max(0, g.members.indexOf(this));
      const n = Math.max(1, g.members.length);
      const behind = leader.mesh.rotation.y + Math.PI;
      const a = behind + (idx - (n - 1) / 2) * 0.85 + (Math.random() - 0.5) * 0.5;
      const r = 2.2 + (idx % 3) * 1.2 + Math.random() * 0.6;
      this._slot = { x: leader.pos.x + Math.sin(a) * r, z: leader.pos.z + Math.cos(a) * r };
    }
    const d = dist2d(this.pos.x, this.pos.z, this._slot.x, this._slot.z);
    // injured members lag behind without breaking the group (brief §20 step 14)
    const injured = this.hp < this.maxHp * 0.4;
    const speed = d > 25 ? (injured ? 6 : 12)
      : d > 14 ? (injured ? 4.5 : 8.5) : (injured ? 3.0 : 5.4);
    this.state = cmd.type === 'retreat' ? 'Retreating'
      : cmd.type === 'home' ? 'Traveling Home' : 'Following';
    if (d > 1.2) this._moveToward(this._slot.x, this._slot.z, dt, speed);
  }

  // ---------- civilian daily life (brief §3, §5, §6) ----------
  _updateCivilian(dt) {
    this.problem = '';
    const t = G.time;

    // threat response, tuned by trait (cautious flees early, brave late)
    const fleeR = TRAITS[this.trait].fleeR;
    const threat = this._nearestThreat(fleeR);
    if (threat || alertState.level === 'attack') {
      this.fleeCooldown = 6;
      this.talking = 0;
      if (this.inside) { this.state = 'Sheltering'; return; }
      this.state = 'Fleeing';
      const hp = this._homePos();
      const arrived = this._moveToward(hp.x, hp.z, dt, 6.5);
      if (arrived && this.home) { this.inside = true; this.state = 'Sheltering'; }
      return;
    }
    if (this.fleeCooldown > 0) { this.state = 'Sheltering'; return; }

    // suspicious: stop briefly, look toward the trouble, then carry on (brief §6)
    if (alertState.level !== this._lastAlert) {
      if (alertState.level === 'suspicious')
        this.lookPause = this.trait === 'cautious' ? 3.5 : 2;
      this._lastAlert = alertState.level;
    }
    if (this.lookPause > 0 && alertState.level === 'suspicious') {
      this.lookPause -= dt;
      this.state = 'Watching';
      if (alertState.suspicionPos)
        this.mesh.rotation.y = Math.atan2(alertState.suspicionPos.x - this.pos.x,
          alertState.suspicionPos.z - this.pos.z);
      return;
    }

    // the daily schedule (hardworking villagers cut their break short)
    let act = scheduleAt(t);
    if (act === 'break' && this.trait === 'hardworking' && t > 0.5) act = 'work';

    if (act === 'sleep') {
      const hp = this._homePos();
      if (!this.inside) {
        this.state = 'ReturningHome';
        if (invTotal(this.carry) > 0 && this._deliver(dt)) return;
        const arrived = this._moveToward(hp.x, hp.z, dt, 3.4);
        if (arrived) { if (this.home) this.inside = true; this.state = this.home ? 'Inside' : 'Idle'; }
      } else this.state = 'Inside';
      return;
    }
    if (this.inside) this.inside = false;

    if (act === 'break' || act === 'social') {
      // deliver what you carry before you rest
      if (invTotal(this.carry) > 0 && this._deliver(dt)) return;
      this._updateSocial(dt);
      return;
    }

    // work
    if (this.role === 'farmer') this._updateFarmer(dt);
    else if (this.role === 'woodcutter') this._updateGatherer(dt, 'tree');
    else if (this.role === 'stonecutter') this._updateGatherer(dt, 'rock');
    else {
      this.state = 'Idle';
      const hp = this._homePos();
      this._wanderNear(hp.x, hp.z, 8, dt, 1.8 * this.eff());
    }
  }

  // ---------- gatherer loop (woodcutter/stonecutter): the settlement finally
  // feeds its own material economy — find, fell, haul to a chest, repeat ----------
  _updateGatherer(dt, kind) {
    const res = kind === 'tree' ? 'wood' : 'stone';
    // haul home once the sling is full (two fells per trip — visible round trips)
    if (invTotal(this.carry) >= 8) {
      if (this._deliver(dt)) return;
      this._gt = null;
      return;
    }
    // find (or re-validate) a target within working range of the village heart
    const fire = this._firePos();
    const arr = kind === 'tree' ? G.world.trees : G.world.rocks;
    if (!this._gt || !arr[this._gt.i] || !arr[this._gt.i].alive) {
      this._gt = G.world.nearestAlive(kind, fire.x, fire.z, 75);
      this.taskTimer = 0;
      if (!this._gt) {
        this.problem = kind === 'tree' ? 'no timber in reach' : 'no stone in reach';
        this.state = 'Idle';
        this._wanderNear(fire.x, fire.z, 8, dt, 1.6);
        return;
      }
    }
    const t = this._gt;
    if (dist2d(this.pos.x, this.pos.z, t.x, t.z) > 1.8) {
      this.state = 'Walking';
      // gatherers know their trails: a brisker pace than a stroll to the fields
      this._moveToward(t.x, t.z, dt, 4.4 * this.eff());
      return;
    }
    // work the tree/rock: visible, timed labor like the farmer's
    this.state = 'Working';
    this.mesh.rotation.y = Math.atan2(t.x - this.pos.x, t.z - this.pos.z);
    this.taskTimer += dt * this.eff();
    this._swingT = (this._swingT || 0) - dt;
    if (this._swingT <= 0) {
      this._swingT = 0.8;
      this.fig.armPivot.rotation.x = -2.0;
      setTimeout(() => { if (!this.dead) this.fig.armPivot.rotation.x = 0; }, 200);
    }
    if (this.taskTimer >= 3.2) {
      this.taskTimer = 0;
      const got = G.world.npcHarvest(kind, t.i);
      this._gt = null;
      if (got) {
        this.carry[got.res] = (this.carry[got.res] || 0) + got.n;
        G.ui.log(`${this.name} ${kind === 'tree' ? 'felled a tree' : 'broke stone'} (+${got.n} ${got.res}).`);
      }
    }
  }

  // downtime: campfire circles, brief conversations, mourning (brief §5)
  _updateSocial(dt) {
    this.socialTimer -= dt;
    if (!this.socialSpot || this.socialTimer <= 0) {
      this.socialTimer = 10 + Math.random() * 16;
      this.mourning = false;
      if (G.graves.length && Math.random() < (this.trait === 'grim' ? 0.3 : 0.1)) {
        const gr = pick(G.graves);
        this.socialSpot = { x: gr.x + 1, z: gr.z + 1 };
        this.mourning = true;
      } else {
        const f = this._firePos();
        const a = Math.random() * 6.28, r = 1.8 + Math.random() * 2.8;
        this.socialSpot = { x: f.x + Math.cos(a) * r, z: f.z + Math.sin(a) * r };
      }
    }
    const d = dist2d(this.pos.x, this.pos.z, this.socialSpot.x, this.socialSpot.z);
    if (d > 1) {
      this.state = 'Walking';
      this._moveToward(this.socialSpot.x, this.socialSpot.z, dt, 2.2);
      return;
    }
    // at the spot
    if (this.mourning) {
      this.state = 'Mourning';
      if (Math.random() < dt * 0.05) bark(this, pickBark(this, 'death'));
      return;
    }
    this.state = 'Resting';
    const f = this._firePos();
    this.mesh.rotation.y = Math.atan2(f.x - this.pos.x, f.z - this.pos.z);

    // brief conversations: pair up, face each other, one speaks (10-30s)
    if (this.talking > 0) {
      this.talking -= dt;
      this.state = 'Talking';
      if (this.talkPartner && !this.talkPartner.dead)
        this.mesh.rotation.y = Math.atan2(this.talkPartner.pos.x - this.pos.x,
          this.talkPartner.pos.z - this.pos.z);
      return;
    }
    this.talkCd -= dt * TRAITS[this.trait].social;
    if (this.talkCd <= 0) {
      this.talkCd = 18 + Math.random() * 20;
      for (const v of G.villagers) {
        if (v === this || v.dead || v.inside || v.talking > 0) continue;
        if (v.state !== 'Resting') continue;
        if (dist2d(this.pos.x, this.pos.z, v.pos.x, v.pos.z) > 6) continue;
        const len = 10 + Math.random() * 20;
        this.talking = len; v.talking = len;
        this.talkPartner = v; v.talkPartner = this;
        bark(this, pickBark(this));
        setTimeout(() => { if (!v.dead && v.talking > 2) bark(v, pickBark(v)); }, 4000);
        break;
      }
    }
  }

  _deliver(dt) {
    const chest = nearestChestWithSpace(this.pos.x, this.pos.z);
    if (!chest) { this.problem = 'no storage space'; this.state = 'Idle'; return false; }
    this.state = 'Carrying';
    const arrived = this._moveToward(chest.x, chest.z, dt, 3.6 * this.eff());
    if (arrived || dist2d(this.pos.x, this.pos.z, chest.x, chest.z) < 1.6) {
      for (const [res, n] of Object.entries(this.carry)) {
        if (n <= 0) continue;
        const put = Math.min(n, chestSpace(chest));
        chest.store[res] = (chest.store[res] || 0) + put;
        this.carry[res] -= put;
        if (put > 0) G.ui.log(`${this.name} stored ${put} ${res}.`);
      }
    }
    return invTotal(this.carry) > 0;
  }

  _updateFarmer(dt) {
    const farm = this.job;
    if (!farm || farm.destroyed) {
      this.problem = 'no farm plot assigned';
      this.state = 'Idle';
      const hp = this._homePos();
      this._wanderNear(hp.x, hp.z, 6, dt, 1.6);
      return;
    }
    if (invTotal(this.carry) > 0) { if (this._deliver(dt)) return; }

    // visible task chain (brief §4): before planting, fetch a seed unit from
    // storage when the settlement has stock — otherwise forage wild seed
    if (farm.cropState === 'empty' && !this.hasSeed) {
      const seedChest = nearestChestWithStock(this.pos.x, this.pos.z, farm.crop);
      if (seedChest) {
        this.state = 'Carrying';
        const there = this._moveToward(seedChest.x, seedChest.z, dt, 3.4 * this.eff()) ||
          dist2d(this.pos.x, this.pos.z, seedChest.x, seedChest.z) < 1.6;
        if (there && seedChest.store[farm.crop] > 0) {
          seedChest.store[farm.crop]--;
          this.hasSeed = true;
        }
        return;
      }
      this.hasSeed = true;
    }

    const nearFarm = dist2d(this.pos.x, this.pos.z, farm.x, farm.z) < 2.4;
    if (!nearFarm) {
      this.state = 'Walking';
      this._moveToward(farm.x, farm.z, dt, 3.4 * this.eff());
      return;
    }
    if (this.hungerDays >= 2 && Math.sin(performance.now() * 0.001) > 0) {
      this.state = 'Idle'; this.problem = 'too hungry to work steadily';
      return;
    }
    const cd = CROPS[farm.crop];
    if (farm.cropState === 'empty') {
      this.state = 'Working';
      this.taskTimer += dt * this.eff();
      if (this.taskTimer > 2.5) {
        this.taskTimer = 0;
        this.hasSeed = false;
        farm.cropState = 'planted'; farm.growth = 0;
        G.ui.log(`${this.name} planted ${cd.name.toLowerCase()}.`);
      }
    } else if (farm.cropState === 'ready') {
      this.state = 'Working';
      this.taskTimer += dt * this.eff();
      if (this.taskTimer > 2.5) {
        this.taskTimer = 0;
        this.carry[farm.crop] = (this.carry[farm.crop] || 0) + cd.yield;
        farm.cropState = 'empty'; farm.growth = 0;
        G.ui.log(`${this.name} harvested ${cd.yield} ${farm.crop}.`);
      }
    } else {
      this.state = 'Working';
      this._wanderNear(farm.x, farm.z, 1.8, dt, 1.2);
    }
  }

  // ---------- guard loop (brief §9 + suspicious investigation §6) ----------
  _guardTarget(post) {
    const responseR = (post ? post.def.patrolRadius || 25 : 25) + 8;
    const px = post ? post.x : this.pos.x, pz = post ? post.z : this.pos.z;
    let best = null, bestScore = 99, bestDist = Infinity;
    for (const c of G.creatures) {
      if (c.dead) continue;
      if (c.type === 'boar' && !c.target) continue;
      if (c.weakened) continue; // broken beasts are prey for the ritual, not threats
      const dPost = dist2d(c.pos.x, c.pos.z, px, pz);
      const dSelf = dist2d(c.pos.x, c.pos.z, this.pos.x, this.pos.z);
      if (dPost > responseR && dSelf > 14) continue;
      let score = 6;
      if (c.target === this) score = 0;
      else if (c.target && c.target.isVillager) score = 1;
      else if (c.target && c.target.isAnimal) score = 2;
      else if (c.blockedTime > 1 && c.lastBlockedGate) score = 3;
      else if (c.blockedTime > 1) score = 4;
      else if (c.target === G.player) score = 5;
      if (score < bestScore || (score === bestScore && dSelf < bestDist)) {
        bestScore = score; bestDist = dSelf; best = c;
      }
    }
    return best;
  }

  _updateGuard(dt) {
    this.problem = '';
    const post = this.job && !this.job.destroyed ? this.job : null;
    if (!post) this.problem = 'no guard post assigned';
    const px = post ? post.x : this._homePos().x;
    const pz = post ? post.z : this._homePos().z;
    const patrolR = post ? (post.def.patrolRadius || 6) : 10;
    const pursuitR = post ? (post.def.pursuitRadius || 45) : 45;
    const ranged = post && post.def.ranged && this.weapon === 'bow';

    if (this.hp < this.maxHp * 0.25) {
      this.state = 'Retreat';
      let refuge = this._homePos();
      for (const v of G.villagers)
        if (v !== this && !v.dead && v.role === 'guard') { refuge = { x: v.pos.x, z: v.pos.z }; break; }
      this._moveToward(refuge.x, refuge.z, dt, 6);
      this.hp = Math.min(this.maxHp, this.hp + dt * 2);
      return;
    }

    const enemy = this.pursuitCooldown <= 0 ? this._guardTarget(post) : null;

    if (enemy) {
      const dPost = dist2d(enemy.pos.x, enemy.pos.z, px, pz);
      if (dPost > pursuitR) {
        this.state = 'ReturnToPost';
        this.pursuitCooldown = 3;
        this._moveToward(px, pz, dt, 5.5);
        return;
      }
      const d = dist2d(this.pos.x, this.pos.z, enemy.pos.x, enemy.pos.z);
      if (ranged && dist2d(this.pos.x, this.pos.z, px, pz) < 2) {
        this.state = 'Attack';
        this.mesh.rotation.y = Math.atan2(enemy.pos.x - this.pos.x, enemy.pos.z - this.pos.z);
        if (d < 20 && this.atkTimer <= 0) {
          this.atkTimer = 1.5;
          enemy.takeDamage(10, this);
          fireArrow(this.pos.clone().add(new THREE.Vector3(0, 1.4, 0)),
            enemy.pos.clone().add(new THREE.Vector3(0, 0.8, 0)));
        }
        return;
      }
      if (d > 2.2) {
        this.state = 'Move to Threat';
        this._moveToward(enemy.pos.x, enemy.pos.z, dt, 6);
      } else {
        this.state = 'Attack';
        this.mesh.rotation.y = Math.atan2(enemy.pos.x - this.pos.x, enemy.pos.z - this.pos.z);
        if (this.atkTimer <= 0) {
          this.atkTimer = 1.0;
          enemy.takeDamage(14, this);
          this.fig.armPivot.rotation.x = -2.0;
          setTimeout(() => { if (!this.dead) this.fig.armPivot.rotation.x = 0; }, 180);
        }
      }
      return;
    }

    // suspicious: ONE guard investigates while the rest hold coverage (brief §6)
    if (alertState.level === 'suspicious' && alertState.suspicionPos &&
        alertState.investigatorId === this.id) {
      const sp = alertState.suspicionPos;
      const dPostSp = dist2d(sp.x, sp.z, px, pz);
      if (dPostSp < pursuitR) {
        this.state = 'Investigating';
        const there = dist2d(this.pos.x, this.pos.z, sp.x, sp.z) < 3;
        if (!there) this._moveToward(sp.x, sp.z, dt, 4.5);
        else this._wanderNear(sp.x, sp.z, 3, dt, 1.6);
        return;
      }
    }

    const dPost = dist2d(this.pos.x, this.pos.z, px, pz);
    if (ranged || (post && post.def.standY)) {
      this.state = dPost < 1.5 ? 'At Post' : 'Return to Post';
      if (dPost >= 1.2) this._moveToward(px, pz, dt, 4.5);
      return;
    }
    if (dPost > patrolR + 4) {
      this.state = 'Return to Post';
      this._moveToward(px, pz, dt, 5);
      return;
    }
    // guards never become idle decorations (loop bible): between patrol legs
    // they inspect walls and gates or sharpen their weapons
    if (this._act) {
      this._act.t -= dt;
      if (this._act.t <= 0) { this._act = null; this.fig.armPivot.rotation.x = 0; }
      else if (this._act.kind === 'inspect') {
        this.state = 'Inspecting defenses';
        const b = this._act.b;
        if (b.destroyed) { this._act = null; return; }
        if (dist2d(this.pos.x, this.pos.z, b.x, b.z) > Math.max(b.def.r, 1) + 1.8)
          this._moveToward(b.x, b.z, dt, 2.4);
        else this.mesh.rotation.y = Math.atan2(b.x - this.pos.x, b.z - this.pos.z);
        return;
      } else {
        this.state = 'Sharpening weapon';
        this.fig.armPivot.rotation.x = -0.8 + Math.sin(performance.now() * 0.02) * 0.3;
        return;
      }
    }
    this._actT = (this._actT ?? Math.random() * 20) - dt;
    if (this._actT <= 0) {
      this._actT = 14 + Math.random() * 18;
      const r = Math.random();
      if (r < 0.45) {
        const defenses = G.buildings.filter(b =>
          (b.type === 'wall' || b.type === 'gate' || b.type === 'wallpiece') &&
          !b.destroyed && dist2d(this.pos.x, this.pos.z, b.x, b.z) < 26);
        if (defenses.length)
          this._act = { kind: 'inspect', b: defenses[Math.floor(Math.random() * defenses.length)], t: 6 };
      } else if (r < 0.75) this._act = { kind: 'sharpen', t: 3.5 };
    }
    this.state = 'Patrol';
    this._wanderNear(px, pz, Math.min(patrolR, 12), dt, 2.2);
  }
}
Villager.prototype.isVillager = true;

// ---------- housing & recruitment (brief §7) ----------
export function freeBeds() {
  let beds = 0;
  for (const b of G.buildings)
    if (b.type === 'house' && b.built >= 1 && !b.destroyed)
      beds += (b.def.beds || 0) - b.residents.length;
  return beds;
}

function assignBed(v) {
  for (const b of G.buildings) {
    if (b.type === 'house' && b.built >= 1 && !b.destroyed &&
        b.residents.length < (b.def.beds || 0)) {
      b.residents.push(v);
      v.home = b;
      return true;
    }
  }
  return false;
}

export function recruitWanderer(w, role) {
  if (freeBeds() <= 0) return 'No free bed — build a Shack first.';
  if (role === 'guard') {
    const weapon = combinedCount('sword') > 0 ? 'sword' : combinedCount('bow') > 0 ? 'bow' : null;
    if (!weapon) return 'A guard needs a weapon — craft a Sword or Bow at the Workbench.';
    payCombined({ [weapon]: 1 });
    const v = new Villager(w.name, w.pos.x, w.pos.z, role);
    v.weapon = weapon;
    v._buildFig();
    assignBed(v);
    G.villagers.push(v);
    w.remove();
    assignJobs();
    G.ui.log(`${v.name} joins as a guard (armed with a ${weapon}) — ${v.trait}, ${TRAITS[v.trait].blurb}.`);
    return '';
  }
  const v = new Villager(w.name, w.pos.x, w.pos.z, role);
  assignBed(v);
  G.villagers.push(v);
  w.remove();
  assignJobs();
  G.ui.log(`${v.name} joins as a ${role} — ${v.trait}, ${TRAITS[v.trait].blurb}.`);
  return '';
}

export function assignJobs() {
  for (const b of G.buildings) {
    if (b.destroyed || b.built < 1 || !b.def.jobType) continue;
    if (b.worker && !b.worker.dead) continue;
    const v = G.villagers.find(v => !v.dead && v.role === b.def.jobType && !v.job);
    if (!v) continue;
    v.job = b; b.worker = v;
    G.ui.log(`${v.name} is now working the ${b.def.name}.`);
  }
  for (const v of G.villagers)
    if (!v.dead && !v.home && assignBed(v)) G.ui.log(`${v.name} has a bed again.`);
}

// ---------- daily food consumption (brief §13) ----------
export function consumeDailyFood() {
  let hungry = 0;
  for (const v of G.villagers) {
    if (v.dead) continue;
    const ate = settlementEatFood(1);
    if (ate >= 1) { v.hungerDays = 0; continue; }
    v.hungerDays++;
    hungry++;
    if (v.hungerDays >= 3) {
      v.hp -= 20;
      if (v.hp <= 0) { v.takeDamage(1, null); G.ui.log(`✝ ${v.name} starved to death.`); }
    }
  }
  if (hungry > 0) {
    G.ui.log(`⚠ ${hungry} villager(s) found no food in storage! Work suffers; starvation follows.`);
  }
}

export function updateVillagers(dt) {
  for (const v of G.villagers) v.update(dt);
  updateArrows(dt);
}
