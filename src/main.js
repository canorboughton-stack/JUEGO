// Kingdoms of the Cursed — bootstrap & main loop.
// Core loop (bible): Explore → Survive → Build → Defend.
// Settlement foundation per the programming brief: territory, shared storage,
// villager professions, alerts, livestock, stages, taxes, full save/load.
import * as THREE from '../lib/three.module.js';
import { G, isNight } from './state.js';
import { World, zoneAt, POI } from './world.js';
import { Player } from './player.js';
import { spawnInitialCreatures, updateCreatures, updateLoots, nightSpawns, banditRaid,
         dawnRespawns, kingdomBailiffs, spawn } from './entities.js';
import { placeBuilding, updateBuildings, buildState, enterBuildMode, exitBuildMode,
         selectSlot, cycleSlot, demolishNearest, rotateGhost, BUILD_ORDER, BUILDING_DEFS,
         applyBuildingEffects, updateBuildMode } from './buildings.js';
import { initAudio, sfx, setRedMoonDrone, toggleMute } from './audio.js';
import { spawnWanderer, updateWanderers, updateVillagers, assignJobs, Villager,
         consumeDailyFood, addGrave } from './villagers.js';
import { UI } from './ui.js';
import { emptyInv } from './storage.js';
import { updateAlerts, alertState } from './alerts.js';
import { updateAnimals, dailyAnimalProduce, Animal, ANIMAL_DEFS } from './livestock.js';
import { evaluateStage, collectTaxes } from './progression.js';
import { Group, updateGroups } from './groups.js';
import { maybeSpawnMerchant, updateMerchant } from './merchant.js';
import { settlementWithdraw, settlementFood, settlementCount } from './storage.js';
import { redMoonDawn, redMoonDusk, redMoonDawnAfter, redMoonMult } from './progression.js';
import { Tamed, updateTamed, dailyTamedCare } from './taming.js';

const SAVE_KEY = 'kotc-save-v3';

// ---------- renderer / scene ----------
const canvas = document.getElementById('game');
G.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
G.renderer.setSize(window.innerWidth, window.innerHeight);
G.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
G.renderer.shadowMap.enabled = true;
G.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

G.scene = new THREE.Scene();
G.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 600);
G.camera.position.set(0, 8, 16);

window.addEventListener('resize', () => {
  G.camera.aspect = window.innerWidth / window.innerHeight;
  G.camera.updateProjectionMatrix();
  G.renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- systems ----------
G.playerInv = emptyInv();
G.ui = new UI();
G.world = new World();
G.player = new Player();

// ---------- input ----------
document.addEventListener('keydown', e => {
  G.keys[e.code] = true;
  initAudio(); // browsers unlock sound on the first real key
  if (G.paused) return;
  if (e.code === 'Tab') { e.preventDefault(); G.ui.toggleSettlementPanel(); return; }
  if (G.uiOpen) {
    if (e.code === 'Escape' || e.code === 'KeyE') { e.preventDefault(); G.ui.closePanel(); }
    return; // panels swallow gameplay keys
  }
  switch (e.code) {
    case 'KeyB': buildState.active ? exitBuildMode() : enterBuildMode(); break;
    case 'KeyQ': G.player.cycleWeapon(); break;
    case 'KeyF': G.player.eat(); break;
    case 'KeyH': G.ui.toggleHelp(); break;
    case 'KeyK': saveGame(); break;
    case 'KeyX': demolishNearest(); break;
    case 'KeyR': if (buildState.active) rotateGhost(); break;
    case 'KeyM': G.ui.log(toggleMute() ? 'Sound muted.' : 'Sound on.'); break;
    case 'Space': e.preventDefault(); if (!buildState.active) G.player.roll(); break;
    case 'Escape': if (buildState.active) exitBuildMode(); break;
    // every building is reachable without the mouse: arrows/brackets browse the catalog
    case 'ArrowLeft': case 'BracketLeft':
      if (buildState.active) { e.preventDefault(); cycleSlot(-1); } break;
    case 'ArrowRight': case 'BracketRight':
      if (buildState.active) { e.preventDefault(); cycleSlot(1); } break;
    default: {
      // number keys jump straight to their slot
      if (buildState.active) {
        const i = BUILD_ORDER.findIndex(t => BUILDING_DEFS[t].key === e.key);
        if (i >= 0) selectSlot(i);
      }
    }
  }
});
// the scroll wheel browses the build catalog too
window.addEventListener('wheel', e => {
  if (!G.paused && buildState.active) cycleSlot(e.deltaY > 0 ? 1 : -1);
}, { passive: true });
document.addEventListener('mousedown', initAudio);
document.addEventListener('keyup', e => { G.keys[e.code] = false; });

// ---------- new game / save / load ----------
function newGame() {
  // you start with a club and calluses — everything better is earned
  Object.assign(G.playerInv, { wood: 30, stone: 12, cabbage: 6, club: 1 });
  // the founding campfire — claims the first 60m of territory
  placeBuilding('campfire', 0, 0, 0);
  spawnInitialCreatures();
  spawnWanderer();
  G.ui.log('Your campfire claims this ground. Territory: 60m around the flame.');
  G.ui.log('Build a Storage Chest and Workbench (B). Wood is east, stone is west.');
  G.ui.banner('THE SETTLEMENT', 'Day 1. Build before nightfall.');
}

function saveGame() {
  try {
    const bIdx = b => G.buildings.indexOf(b);
    const data = {
      day: G.day, time: G.time, stage: G.stage, taxes: G.taxes,
      redMoon: G.redMoon,
      banditCamp: G.banditCamp,
      ruinsRelic: G.ruinsRelic,
      weapon: G.player.weapon,
      tamed: G.tamed.filter(t => !t.dead).map(t => ({
        type: t.type, name: t.name, hp: t.hp, trust: t.trust, role: t.role,
        x: t.pos.x, z: t.pos.z,
      })),
      playerInv: G.playerInv,
      werewolfSlain: G.werewolfSlain,
      alertAttack: alertState.level === 'attack',
      player: { x: G.player.pos.x, z: G.player.pos.z, hp: G.player.hp, hunger: G.player.hunger },
      buildings: G.buildings.map(b => ({
        type: b.type, x: b.x, z: b.z, rot: b.rotY, hp: b.hp, built: b.built,
        fire: b.fire, open: b.open,
        crop: b.crop, cropState: b.cropState, growth: b.growth,
        penFood: b.penFood, store: b.store || null,
      })),
      villagers: G.villagers.filter(v => !v.dead).map(v => ({
        name: v.name, role: v.role, weapon: v.weapon, hp: v.hp, hungerDays: v.hungerDays,
        x: v.pos.x, z: v.pos.z,
        trait: v.trait, bravery: v.bravery,
        heightScale: v.heightScale, buildScale: v.buildScale,
        home: v.home ? bIdx(v.home) : -1,
        job: v.job ? bIdx(v.job) : -1,
      })),
      animals: G.animals.filter(a => !a.dead).map(a => ({
        type: a.type, hp: a.hp, pen: a.pen ? bIdx(a.pen) : -1,
      })),
      graves: G.graves.map(gr => ({ name: gr.name })),
      groups: G.groups.map(g => {
        const alive = G.villagers.filter(v => !v.dead);
        return {
          name: g.name, purpose: g.purpose,
          leader: alive.indexOf(g.leader),
          members: g.members.filter(m => !m.dead).map(m => alive.indexOf(m)),
          rally: g.rally,
          command: g.command ? { type: g.command.type, x: g.command.x, z: g.command.z,
            points: g.command.points, pointIdx: g.command.pointIdx } : null,
        };
      }),
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    G.ui.log('Game saved.');
  } catch (err) {
    G.ui.log('Save failed: ' + err.message);
  }
}

function loadGame() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) { newGame(); return; }
  try {
    const d = JSON.parse(raw);
    G.day = d.day; G.time = d.time; G.stage = d.stage ?? -1;
    Object.assign(G.taxes, d.taxes || {});
    if (d.redMoon) Object.assign(G.redMoon, d.redMoon);
    if (d.banditCamp) Object.assign(G.banditCamp, d.banditCamp);
    if (d.ruinsRelic) Object.assign(G.ruinsRelic, d.ruinsRelic);
    if (d.weapon) { G.player.weapon = d.weapon; }
    Object.assign(G.playerInv, d.playerInv || {});
    G.werewolfSlain = !!d.werewolfSlain;
    for (const b of d.buildings) {
      const nb = placeBuilding(b.type, b.x, b.z, b.rot, b.built ?? 1);
      nb.hp = b.hp;
      nb.fire = b.fire || 0;
      nb.open = !!b.open;
      if (b.crop) { nb.crop = b.crop; nb.cropState = b.cropState; nb.growth = b.growth || 0; }
      if (b.penFood) nb.penFood = b.penFood;
      if (b.store) Object.assign(nb.store, b.store);
    }
    for (const v of d.villagers) {
      const nv = new Villager(v.name, v.x, v.z, v.role);
      nv.weapon = v.weapon || null;
      nv.hp = v.hp; nv.hungerDays = v.hungerDays || 0;
      if (v.trait) { nv.trait = v.trait; nv.bravery = v.bravery; }
      if (v.heightScale) { nv.heightScale = v.heightScale; nv.buildScale = v.buildScale; }
      nv._buildFig();
      const home = G.buildings[v.home];
      if (home) { nv.home = home; home.residents.push(nv); }
      const job = G.buildings[v.job];
      if (job) { nv.job = job; job.worker = nv; }
      G.villagers.push(nv);
    }
    for (const gr of d.graves || []) addGrave(gr.name, false);
    for (const td of d.tamed || []) {
      const nt = new Tamed(td.type, td.x, td.z);
      nt.name = td.name; nt.hp = td.hp; nt.trust = td.trust; nt.role = td.role;
      G.tamed.push(nt);
    }
    for (const gd of d.groups || []) {
      const leader = G.villagers[gd.leader];
      if (!leader) continue;
      const members = (gd.members || []).map(i => G.villagers[i]).filter(Boolean);
      const ng = new Group(gd.name, gd.purpose, leader, members);
      ng.rally = gd.rally || ng.rally;
      if (gd.command) ng.command = gd.command;
      G.groups.push(ng);
    }
    for (const a of d.animals || []) {
      const pen = G.buildings[a.pen];
      if (!pen) continue;
      const na = new Animal(a.type, pen);
      na.hp = a.hp;
      G.animals.push(na);
    }
    applyBuildingEffects();
    assignJobs();
    G.player.pos.set(d.player.x, 0, d.player.z);
    G.player.hp = d.player.hp; G.player.hunger = d.player.hunger;
    spawnInitialCreatures();
    G.ui.log(`Welcome back. Day ${G.day} on the frontier.`);
    if (d.alertAttack) G.ui.log('You saved mid-attack — stay sharp.');
  } catch (err) {
    console.error(err);
    newGame();
  }
}

// ---------- world event scheduling ----------
let lastNight = isNight();
let wandererTimer = 20;
let stageTimer = 0;
let duskWarned = false;

// assemble the dawn assessment: every question the loop bible says the UI must answer
function morningReport() {
  const pop = G.villagers.filter(v => !v.dead).length;
  const food = settlementFood();
  const rep = {
    day: G.day, pop, food,
    foodDays: pop ? Math.floor(food / pop) : '∞',
    deaths: [...G.overnight.deaths],
    livestockLost: G.overnight.livestockLost,
    buildingsLost: G.overnight.buildingsLost,
    damaged: G.buildings.filter(b => b.hp < b.maxHp - 1).length,
    injured: G.villagers.filter(v => !v.dead && v.hp < 60).length,
    guardsAway: G.villagers.filter(v => !v.dead && v.role === 'guard' &&
      v.group && v.group.command).length,
    cropsReady: G.buildings.filter(b => b.type === 'farm' && b.cropState === 'ready').length,
    lowWood: settlementCount('wood') + G.playerInv.wood < 10,
    merchant: !!(G.merchant && !G.merchant.gone),
    taxesIn: G.stage >= 2 ? Math.max(0, G.taxes.nextDay - G.day) : -1,
    incense: settlementCount('incense') + (G.playerInv.incense || 0),
    redMoonTonight: G.day === G.redMoon.nextDay,
    redMoonTomorrow: G.day === G.redMoon.nextDay - 1,
  };
  if (G.day > 1) G.ui.openMorningReport(rep);
}

function worldEvents(dt) {
  const night = isNight();
  if (night && !lastNight) {
    const redTonight = redMoonDusk();      // the Red Moon rises on its appointed night
    setRedMoonDrone(redTonight);
    if (redTonight) sfx('sting');
    nightSpawns(redMoonMult());
    if (!redTonight) G.ui.log('Night falls. The cursed things stir...');
    sfx('howl'); // something answers the dark, every night
    // burn incense from storage: the smoke keeps ghosts off the settlement
    G.incenseWard = settlementWithdraw('incense', 1) === 1;
    if (G.incenseWard) G.ui.log('🕯 Incense smoke drifts over the village — the dead will keep their distance tonight.');
    // the first night teaches the rules safely: one shape probes the light and flinches
    if (G.day === 1) {
      const a = Math.random() * 6.28;
      spawn('blackdog', Math.cos(a) * 34, Math.sin(a) * 34, { timid: true });
      G.ui.log('Eyes glint beyond the torchlight... something is testing your fire.');
    }
    if (G.taxes.bailiffsDue) kingdomBailiffs();
    else if ((G.day >= 2 && G.day % 3 === 0) || (redTonight && Math.random() < 0.5)) banditRaid();
  } else if (!night && lastNight) {
    setRedMoonDrone(false);
    redMoonDawnAfter();       // the red sky pales; the world takes stock
    dawnRespawns();
    G.incenseWard = false;
    consumeDailyFood();       // brief §13: one ration per villager per day
    dailyAnimalProduce();     // brief §14: eggs & milk gather at the pen
    dailyTamedCare();         // creature care loop: feed the bound beasts
    collectTaxes();           // brief §15: the Kingdom takes its due
    redMoonDawn();            // one-full-day warning before the next Red Moon
    if (Math.random() < 0.9) spawnWanderer();
    // the morning assessment (loop bible): what state is the refuge in?
    morningReport();
    G.overnight = { deaths: [], livestockLost: 0, buildingsLost: 0 };
  }
  lastNight = night;

  // returning before dark is part of the game: warn the strayed
  if (!duskWarned && G.time > 0.72 && G.time < 0.79) {
    duskWarned = true;
    const fire = G.buildings.find(b => b.type === 'campfire');
    if (fire && Math.hypot(G.player.pos.x - fire.x, G.player.pos.z - fire.z) > 85) {
      G.ui.banner('NIGHT APPROACHES', 'You are far from the village lights.');
      G.ui.log('🌙 Dusk. The dark hunts far from home — run for the walls.');
    }
  }
  if (G.time < 0.7) duskWarned = false;

  // the merchant carriage arrives around midday from Village stage on
  if (!night && G.time > 0.45 && G.time < 0.55) maybeSpawnMerchant();

  wandererTimer -= dt;
  if (wandererTimer <= 0) {
    wandererTimer = 60 + Math.random() * 60;
    if (!night && G.wanderers.length < 2) spawnWanderer();
  }

  stageTimer -= dt;
  if (stageTimer <= 0) { stageTimer = 1.5; evaluateStage(); }
}

// ---------- title screen ----------
const title = document.getElementById('titleScreen');
const btnLoad = document.getElementById('btnLoad');
if (localStorage.getItem(SAVE_KEY)) btnLoad.style.display = 'inline-block';

document.getElementById('btnNew').addEventListener('click', () => {
  localStorage.removeItem(SAVE_KEY);
  start(false);
});
btnLoad.addEventListener('click', () => start(true));
document.getElementById('btnRespawn').addEventListener('click', () => G.player.respawn());

function start(load) {
  title.style.display = 'none';
  G.paused = false;
  if (load) loadGame(); else newGame();
  canvas.requestPointerLock();
}

// ---------- main loop ----------
const clock = new THREE.Clock();

function tick() {
  requestAnimationFrame(tick);
  let dt = Math.min(0.05, clock.getDelta());
  // hit-stop: a heartbeat of frozen time when a strike lands (combat feel)
  if (G.hitstop > 0) {
    G.hitstop -= dt;
    dt = 0;
  }
  if (!G.paused && dt > 0) {
    G.world.update(dt);
    G.player.update(dt);
    updateCreatures(dt);
    updateVillagers(dt);
    updateWanderers(dt);
    updateAnimals(dt);
    updateBuildings(dt);
    updateLoots(dt);
    updateBuildMode();
    updateAlerts(dt);
    updateGroups(dt);
    updateMerchant(dt);
    updateTamed(dt);
    worldEvents(dt);
    G.ui.update(dt, zoneAt(G.player.pos.x, G.player.pos.z));
  }
  G.renderer.render(G.scene, G.camera);
}
tick();

// expose for debugging
window.__G = G;
