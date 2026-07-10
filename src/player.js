// Player: third-person controller, orbit camera, melee combat, block, dodge, gather.
import * as THREE from '../lib/three.module.js';
import { G, clamp, dist2d, resolveCollisions, isNight } from './state.js';
import { makeCharacter, addSword, pickupLoot } from './entities.js';
import { buildState, tryPlace } from './buildings.js';
import { recruit } from './villagers.js';

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

    this.fig = makeCharacter({ tunic: 0x46586e, skin: 0xd8ae84, hair: 0x3a2a18, pants: 0x4a3c2c });
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
    if (this.atkTimer > 0 || this.st < 12 || this.rollTimer > 0) return;
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

  roll() {
    if (this.rollTimer > 0 || this.st < 20) return;
    this.st -= 20;
    this.rollTimer = 0.42;
    // roll in movement direction, else camera forward
    const mv = this._moveInput();
    if (mv.lengthSq() > 0.01) this.rollDir.copy(mv).normalize();
    else this.rollDir.copy(this.viewDir);
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
    // the frontier taxes failure: lose a fifth of carried resources
    for (const k of ['wood', 'stone', 'food'])
      G.resources[k] = Math.floor(G.resources[k] * 0.8);
    this.dead = false;
    G.ui.showDeath(false);
    G.ui.log('You wake by the campfire, lighter of pocket and heavier of heart.');
  }

  eat() {
    if (G.resources.food <= 0) { G.ui.log('No food to eat.'); return; }
    if (this.hunger > 92) { G.ui.log('You are not hungry.'); return; }
    G.resources.food--;
    this.hunger = Math.min(this.maxHu, this.hunger + 30);
    this.hp = Math.min(this.maxHp, this.hp + 8);
    G.ui.log('You eat. (+30 hunger, +8 health)');
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
      const rollSpeed = 13;
      let nx = this.pos.x + this.rollDir.x * rollSpeed * dt;
      let nz = this.pos.z + this.rollDir.z * rollSpeed * dt;
      const s = resolveCollisions(nx, nz, 0.45);
      this.pos.x = s.x; this.pos.z = s.z;
      this.mesh.rotation.x = -(0.42 - this.rollTimer) / 0.42 * Math.PI * 2;
    } else {
      this.mesh.rotation.x = 0;
      if (mv.lengthSq() > 0.01) {
        mv.normalize();
        let nx = this.pos.x + mv.x * speed * dt;
        let nz = this.pos.z + mv.z * speed * dt;
        const s = resolveCollisions(nx, nz, 0.45);
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
    // loot bags first
    let best = null, bd = 3.0;
    for (const l of G.loots) {
      const d = dist2d(this.pos.x, this.pos.z, l.x, l.z);
      if (d < bd) { bd = d; best = { kind: 'loot', obj: l, label: 'pick up loot' }; }
    }
    // wanderers
    for (const w of G.wanderers) {
      const d = dist2d(this.pos.x, this.pos.z, w.pos.x, w.pos.z);
      if (d < 3.4 && (!best || d < bd)) { bd = d; best = { kind: 'recruit', obj: w, label: `recruit ${w.name}` }; }
    }
    // construction sites: hold E to hammer the frame into a finished building
    for (const b of G.buildings) {
      if (b.built >= 1) continue;
      const d = dist2d(this.pos.x, this.pos.z, b.x, b.z);
      const reach = Math.max(b.def.r, 2) + 2.4;
      if (d < reach && (!best || d < bd)) {
        bd = d;
        best = { kind: 'construct', obj: b, label: `construct ${b.def.name} (${Math.round(b.built * 100)}%)`, hold: true };
      }
    }
    // resources
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
      } else if (best.hold) {
        this.gatherHold += dt;
        holdProgress = this.gatherHold / 1.4;
        if (this.gatherHold >= 1.4) {
          this.gatherHold = 0;
          G.world.harvest(best.obj.kind, best.obj.i);
          const gains = { tree: '+5 wood', rock: '+4 stone', bush: '+2 food' };
          G.ui.log(`Gathered ${gains[best.obj.kind]}.`);
        }
      } else if (!this._ePressed) {
        this._ePressed = true;
        if (best.kind === 'loot') pickupLoot(best.obj);
        else if (best.kind === 'recruit') recruit(best.obj);
      }
    } else {
      this.gatherHold = 0;
    }
    if (!G.keys['KeyE']) this._ePressed = false;

    G.ui.prompt(best ? `[E] ${best.label}` : '');
    G.ui.gatherProgress(best && best.hold && G.keys['KeyE'] ? holdProgress : 0);
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
