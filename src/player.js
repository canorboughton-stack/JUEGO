// Player: third-person controller, orbit camera, melee combat, block, dodge, gather.
import * as THREE from '../lib/three.module.js';
import { G, clamp, dist2d, resolveCollisions, isNight } from './state.js';
import { makeCharacter, addSword, pickupLoot } from './entities.js';
import { buildState, tryPlace } from './buildings.js';
import { FOOD_TYPES } from './storage.js';

export class Player {
  constructor() {
    this.pos = new THREE.Vector3(0, 0, 6);
    this.maxHp = 100; this.hp = 100;
    this.maxSt = 100; this.st = 100;
    this.maxHu = 100; this.hunger = 100;
    this.dead = false;

    // camera orbit
    this.theta = Math.PI;      // yaw around player
    this.phi = 0.42;           // elevation
    this.camDist = 7;
    this.viewDir = new THREE.Vector3(0, 0, -1); // horizontal camera forward

    // combat
    this.atkTimer = 0; this.atkAnim = 0;
    this.blocking = false;
    this.rollTimer = 0; this.rollDir = new THREE.Vector3();
    this.hungerTick = 0;
    this.facing = 0;

    // gathering
    this.gatherHold = 0;
    this.interact = null;

    // a capable but ordinary person carrying real equipment (art bible §12)
    this.fig = makeCharacter({ tunic: 0x46586e, skin: 0xd8ae84, hair: 0x3a2a18,
      pants: 0x4a3c2c, pouch: true, reinforced: true });
    addSword(this.fig.armPivot, 0xb8bec9, 0.95);
    this.mesh = this.fig.group;
    G.scene.add(this.mesh);

    this._bindInput();
  }

  _bindInput() {
    const canvas = G.renderer.domElement;
    canvas.addEventListener('click', () => {
      if (!G.paused && document.pointerLockElement !== canvas) canvas.requestPointerLock();
    });
    document.addEventListener('mousemove', e => {
      if (document.pointerLockElement !== canvas) return;
      this.theta -= e.movementX * 0.0026;
      this.phi = clamp(this.phi + e.movementY * 0.0022, -0.12, 1.25);
    });
    document.addEventListener('mousedown', e => {
      if (G.paused || document.pointerLockElement !== canvas) return;
      if (e.button === 0) {
        if (buildState.active) tryPlace();
        else this.attack();
      } else if (e.button === 2) this.blocking = true;
    });
    document.addEventListener('mouseup', e => {
      if (e.button === 2) this.blocking = false;
    });
    document.addEventListener('contextmenu', e => e.preventDefault());
  }

  attack() {
    // responsiveness (animation bible §17): one queued attack is allowed
    if (this.atkTimer > 0) {
      if (this.atkTimer < 0.3) this.queuedAttack = true;
      return;
    }
    if (this.st < 12 || this.rollTimer > 0) return;
    this.atkTimer = 0.55;
    this.atkAnim = 0.35;
    this.st -= 12;
    // face camera direction when striking
    this.facing = Math.atan2(this.viewDir.x, this.viewDir.z);
    // delayed hit check (windup)
    setTimeout(() => {
      if (this.dead) return;
      const fx = Math.sin(this.facing), fz = Math.cos(this.facing);
      for (const c of G.creatures) {
        if (c.dead) continue;
        const dx = c.pos.x - this.pos.x, dz = c.pos.z - this.pos.z;
        const d = Math.hypot(dx, dz);
        if (d < 2.9 + c.def.r) {
          const dot = (dx * fx + dz * fz) / Math.max(0.001, d);
          if (dot > 0.35) {
            c.takeDamage(26, this);
            // knockback
            c.pos.x += (dx / d) * 0.7; c.pos.z += (dz / d) * 0.7;
          }
        }
      }
    }, 140);
  }

  // dodge (animation bible §13): a short directional sidestep with i-frames —
  // feet stay grounded, made for repositioning. NOT a long souls roll.
  roll() {
    if (this.rollTimer > 0 || this.st < 15) return;
    this.st -= 15;
    this.rollTimer = 0.28;
    const mv = this._moveInput();
    if (mv.lengthSq() > 0.01) this.rollDir.copy(mv).normalize();
    else this.rollDir.copy(this.viewDir).negate(); // neutral dodge = step back
  }

  takeDamage(n, from) {
    if (this.dead || this.rollTimer > 0) return; // i-frames while rolling
    if (this.blocking && this.st > 6) {
      n *= 0.28;
      this.st = Math.max(0, this.st - 9);
    }
    this.hp -= n;
    G.ui.damageFlash();
    if (this.hp <= 0) this._die();
  }

  _die() {
    this.dead = true;
    this.hp = 0;
    G.ui.showDeath(true);
    document.exitPointerLock();
  }

  respawn() {
    const fire = G.buildings.find(b => b.type === 'campfire');
    const rx = fire ? fire.x + 2 : 0, rz = fire ? fire.z + 2 : 6;
    this.pos.set(rx, 0, rz);
    this.hp = this.maxHp * 0.6;
    this.st = this.maxSt;
    this.hunger = Math.max(30, this.hunger);
    // the frontier taxes failure: lose a fifth of carried RESOURCES —
    // your sword stays on your belt (equipment is never lost)
    for (const k of FOOD_TYPES.concat(['wood', 'stone', 'hide', 'incense']))
      G.playerInv[k] = Math.floor(G.playerInv[k] * 0.8);
    this.dead = false;
    G.ui.showDeath(false);
    G.ui.log('You wake by the campfire, lighter of pocket and heavier of heart.');
  }

  eat() {
    const food = FOOD_TYPES.find(r => G.playerInv[r] > 0);
    if (!food) { G.ui.log('No food in your pack — carry meat, corn or cabbage.'); return; }
    if (this.hunger > 92) { G.ui.log('You are not hungry.'); return; }
    G.playerInv[food]--;
    this.hunger = Math.min(this.maxHu, this.hunger + 30);
    this.hp = Math.min(this.maxHp, this.hp + 8);
    G.ui.log(`You eat ${food}. (+30 hunger, +8 health)`);
  }

  _moveInput() {
    const k = G.keys;
    const f = (k['KeyW'] ? 1 : 0) - (k['KeyS'] ? 1 : 0);
    const r = (k['KeyD'] ? 1 : 0) - (k['KeyA'] ? 1 : 0);
    // camera-relative movement
    const fwd = this.viewDir;
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    return new THREE.Vector3()
      .addScaledVector(fwd, f)
      .addScaledVector(right, r);
  }

  update(dt) {
    if (this.dead) return;
    const k = G.keys;

    // --- camera orbit vectors ---
    this.viewDir.set(-Math.sin(this.theta), 0, -Math.cos(this.theta)).normalize();

    // --- movement ---
    let speed = 5.6;
    const mv = this._moveInput();
    const sprinting = k['ShiftLeft'] && this.st > 1 && mv.lengthSq() > 0;
    if (sprinting) { speed *= 1.75; this.st = Math.max(0, this.st - dt * 11); }

    if (this.rollTimer > 0) {
      this.rollTimer -= dt;
      const stepSpeed = 11.5;
      let nx = this.pos.x + this.rollDir.x * stepSpeed * dt;
      let nz = this.pos.z + this.rollDir.z * stepSpeed * dt;
      const s = resolveCollisions(nx, nz, 0.45, null, true);
      this.pos.x = s.x; this.pos.z = s.z;
      // grounded evasive step: a quick body lean, not a somersault
      this.mesh.rotation.x = -Math.sin((0.28 - this.rollTimer) / 0.28 * Math.PI) * 0.35;
    } else {
      this.mesh.rotation.x = 0;
      if (this.queuedAttack && this.atkTimer <= 0) { this.queuedAttack = false; this.attack(); }
      if (mv.lengthSq() > 0.01) {
        mv.normalize();
        let nx = this.pos.x + mv.x * speed * dt;
        let nz = this.pos.z + mv.z * speed * dt;
        const s = resolveCollisions(nx, nz, 0.45, null, true);
        this.pos.x = s.x; this.pos.z = s.z;
        // face movement direction (or camera dir when blocking/attacking)
        const want = Math.atan2(mv.x, mv.z);
        let diff = want - this.facing;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        this.facing += diff * Math.min(1, dt * 12);
        this.walkPhase = (this.walkPhase || 0) + dt * speed * 1.6;
      }
    }
    if (this.blocking || this.atkAnim > 0 || buildState.active)
      this.facing = Math.atan2(this.viewDir.x, this.viewDir.z);

    this.pos.y = G.world.h(this.pos.x, this.pos.z);
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.facing;

    // --- animation ---
    const sw = mv.lengthSq() > 0.01 && this.rollTimer <= 0 ? Math.sin(this.walkPhase || 0) * 0.55 : 0;
    this.fig.legs.forEach((l, i) => { l.rotation.x = sw * (i % 2 ? 1 : -1); });
    if (this.atkAnim > 0) {
      this.atkAnim -= dt;
      const t = 1 - this.atkAnim / 0.35;
      this.fig.armPivot.rotation.x = t < 0.4 ? -t / 0.4 * 2.4 : -2.4 + (t - 0.4) / 0.6 * 2.4;
    } else if (this.blocking) {
      this.fig.armPivot.rotation.x = -1.2;
      this.fig.armPivot.rotation.z = -0.7;
    } else {
      this.fig.armPivot.rotation.x = sw * 0.6;
      this.fig.armPivot.rotation.z = 0;
    }
    this.fig.armL.rotation.x = -sw * 0.6;

    // --- timers & vitals ---
    this.atkTimer -= dt;
    if (!sprinting && this.rollTimer <= 0)
      this.st = Math.min(this.maxSt, this.st + dt * (this.blocking ? 4 : 14));
    this.hungerTick += dt;
    if (this.hungerTick > 7) {
      this.hungerTick = 0;
      this.hunger = Math.max(0, this.hunger - 1);
      if (this.hunger <= 0) { this.hp -= 3; G.ui.damageFlash(); if (this.hp <= 0) this._die(); }
    }
    // gentle regen when well-fed
    if (this.hunger > 75) this.hp = Math.min(this.maxHp, this.hp + dt * 0.5);

    // --- interaction scan (E) ---
    this._scanInteract(dt);

    // --- camera ---
    this._updateCamera();
  }

  _scanInteract(dt) {
    this.interact = null;
    if (G.uiOpen) { G.ui.prompt(''); G.ui.gatherProgress(0); return; }
    const near = (x, z, r) => dist2d(this.pos.x, this.pos.z, x, z) < r;
    let best = null;

    const buildingsByDist = G.buildings
      .map(b => ({ b, d: dist2d(this.pos.x, this.pos.z, b.x, b.z) }))
      .sort((a, c) => a.d - c.d);

    for (const { b, d } of buildingsByDist) {
      const reach = Math.max(b.def.r, 1.6) + 2.2;
      if (d > reach) continue;
      // priority within a building: fire > unfinished > damaged > function
      if (b.fire > 0) { best = { kind: 'extinguish', obj: b, label: `beat out the fire on the ${b.def.name}`, hold: true }; break; }
      if (b.built < 1) { best = { kind: 'construct', obj: b, label: `construct ${b.def.name} (${Math.round(b.built * 100)}%)`, hold: true }; break; }
      if (b.hp < b.maxHp - 1) { best = { kind: 'repair', obj: b, label: `repair ${b.def.name} (${Math.round(b.hp / b.maxHp * 100)}%)`, hold: true }; break; }
      if (b.type === 'chest') { best = { kind: 'chest', obj: b, label: 'open Storage Chest' }; break; }
      if (b.type === 'workbench') { best = { kind: 'craft', obj: b, label: 'use Workbench' }; break; }
      if (b.type === 'animalpen') { best = { kind: 'pen', obj: b, label: `tend Animal Pen${b.penFood ? ` (collect ${b.penFood} food)` : ''}` }; break; }
      if (b.type === 'gate') { best = { kind: 'gate', obj: b, label: b.open ? 'close gate' : 'open gate' }; break; }
      if (b.type === 'farm' && b.cropState === 'empty') { best = { kind: 'crop', obj: b, label: `switch crop (now: ${b.crop})` }; break; }
    }
    // loot bags outrank building menus when standing on them
    for (const l of G.loots) {
      if (near(l.x, l.z, 3.0)) { best = { kind: 'loot', obj: l, label: 'pick up loot' }; break; }
    }
    // wanderers on the road → recruitment menu (brief §7)
    for (const w of G.wanderers) {
      if (near(w.pos.x, w.pos.z, 3.4)) { best = { kind: 'recruit', obj: w, label: `speak with ${w.name}` }; break; }
    }
    // villagers → conversation panel (companionship, leader commands)
    for (const v of G.villagers) {
      if (v.dead || v.inside) continue;
      if (near(v.pos.x, v.pos.z, 2.8)) {
        best = { kind: 'talk', obj: v, label: `talk to ${v.name}${v.isLeader ? ' ★' : ''}` };
        break;
      }
    }
    // the merchant carriage, halted on the road
    if (G.merchant && !G.merchant.gone && G.merchant.state === 'trading' &&
        near(G.merchant.pos.x, G.merchant.pos.z, 4.5))
      best = { kind: 'trade', obj: G.merchant, label: 'trade with the merchant' };
    // natural resources
    if (!best) {
      const r = G.world.nearestResource(this.pos.x, this.pos.z);
      if (r) best = { kind: 'resource', obj: r, label: r.label, hold: true };
    }
    this.interact = best;

    let holdProgress = 0;
    if (best && G.keys['KeyE']) {
      if (best.kind === 'construct') {
        best.obj.construct(dt);
        holdProgress = best.obj.built;
        this._hammer(dt);
      } else if (best.kind === 'repair') {
        const problem = best.obj.repairTick(dt);
        if (problem && problem !== 'undamaged') { G.ui.prompt(`✗ ${problem}`); G.ui.gatherProgress(0); return; }
        holdProgress = best.obj.hp / best.obj.maxHp;
        this._hammer(dt);
      } else if (best.kind === 'extinguish') {
        best.obj.extinguishTick(dt);
        holdProgress = 1 - best.obj.fire;
      } else if (best.hold) {
        this.gatherHold += dt;
        holdProgress = this.gatherHold / 1.4;
        if (this.gatherHold >= 1.4) {
          this.gatherHold = 0;
          G.world.harvest(best.obj.kind, best.obj.i);
          const gains = { tree: '+5 wood', rock: '+4 stone', bush: '+2 cabbage' };
          G.ui.log(`Gathered ${gains[best.obj.kind]}.`);
        }
      } else if (!this._ePressed) {
        this._ePressed = true;
        if (best.kind === 'loot') pickupLoot(best.obj);
        else if (best.kind === 'recruit') G.ui.openRecruitMenu(best.obj);
        else if (best.kind === 'talk') G.ui.openVillagerPanel(best.obj);
        else if (best.kind === 'trade') G.ui.openTradePanel();
        else if (best.kind === 'chest') G.ui.openStoragePanel(best.obj);
        else if (best.kind === 'craft') G.ui.openCraftPanel(best.obj);
        else if (best.kind === 'pen') G.ui.openPenPanel(best.obj);
        else if (best.kind === 'gate') {
          best.obj.open = !best.obj.open;
          G.ui.log(best.obj.open ? 'Gate opened — anything can pass.' : 'Gate closed — enemies must break it.');
        } else if (best.kind === 'crop') {
          best.obj.crop = best.obj.crop === 'corn' ? 'cabbage' : 'corn';
          G.ui.log(`Farm plot set to ${best.obj.crop}.`);
        }
      }
    } else {
      this.gatherHold = 0;
    }
    if (!G.keys['KeyE']) this._ePressed = false;

    G.ui.prompt(best ? `[E] ${best.label}` : '');
    G.ui.gatherProgress(best && best.hold !== undefined && best.hold && G.keys['KeyE'] ? holdProgress : 0);
  }

  // rhythmic arm swing while building at a construction site
  _hammer(dt) {
    this._hammerT = (this._hammerT || 0) - dt;
    if (this._hammerT <= 0) {
      this._hammerT = 0.7;
      this.atkAnim = 0.35;
    }
  }

  _updateCamera() {
    const head = new THREE.Vector3(this.pos.x, this.pos.y + 1.7, this.pos.z);
    const off = new THREE.Vector3(
      Math.sin(this.theta) * Math.cos(this.phi),
      Math.sin(this.phi),
      Math.cos(this.theta) * Math.cos(this.phi),
    ).multiplyScalar(this.camDist);
    const camPos = head.clone().add(off);
    // keep camera above terrain
    const gy = G.world.h(camPos.x, camPos.z);
    if (camPos.y < gy + 0.6) camPos.y = gy + 0.6;
    G.camera.position.lerp(camPos, 0.5);
    G.camera.lookAt(head);
  }
}
