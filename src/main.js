// Kingdoms of the Cursed — bootstrap & main loop.
// Core loop (bible): Explore → Survive → Build → Defend.
// Settlement foundation per the programming brief: territory, shared storage,
// villager professions, alerts, livestock, stages, taxes, full save/load.
import * as THREE from '../lib/three.module.js';
import { G, isNight } from './state.js';
import { World, zoneAt, POI } from './world.js';
import { Player } from './player.js';
import { spawnInitialCreatures, updateCreatures, updateLoots, nightSpawns, banditRaid,
         dawnRespawns } from './entities.js';
import { placeBuilding, updateBuildings, buildState, enterBuildMode, exitBuildMode,
         selectSlot, demolishNearest, rotateGhost, BUILD_ORDER, BUILDING_DEFS,
         applyBuildingEffects, updateBuildMode } from './buildings.js';
import { spawnWanderer, updateWanderers, updateVillagers, assignJobs, Villager,
         consumeDailyFood } from './villagers.js';
import { UI } from './ui.js';
import { emptyInv } from './storage.js';
import { updateAlerts, alertState } from './alerts.js';
import { updateAnimals, dailyAnimalProduce, Animal, ANIMAL_DEFS } from './livestock.js';
import { evaluateStage, collectTaxes } from './progression.js';

const SAVE_KEY = 'kotc-save-v2';

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
  if (G.paused) return;
  if (e.code === 'Tab') { e.preventDefault(); G.ui.toggleSettlementPanel(); return; }
  if (G.uiOpen) {
    if (e.code === 'Escape' || e.code === 'KeyE') { e.preventDefault(); G.ui.closePanel(); }
    return; // panels swallow gameplay keys
  }
  switch (e.code) {
    case 'KeyB': buildState.active ? exitBuildMode() : enterBuildMode(); break;
    case 'KeyF': G.player.eat(); break;
    case 'KeyH': G.ui.toggleHelp(); break;
    case 'KeyK': saveGame(); break;
    case 'KeyX': demolishNearest(); break;
    case 'KeyR': if (buildState.active) rotateGhost(); break;
    case 'Space': e.preventDefault(); if (!buildState.active) G.player.roll(); break;
    case 'Escape': if (buildState.active) exitBuildMode(); break;
    default: {
      // number keys select build slots
      if (buildState.active) {
        const i = BUILD_ORDER.findIndex(t => BUILDING_DEFS[t].key === e.key);
        if (i >= 0) selectSlot(i);
      }
    }
  }
});
document.addEventListener('keyup', e => { G.keys[e.code] = false; });

// ---------- new game / save / load ----------
function newGame() {
  Object.assign(G.playerInv, { wood: 30, stone: 12, cabbage: 6 });
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
        home: v.home ? bIdx(v.home) : -1,
        job: v.job ? bIdx(v.job) : -1,
      })),
      animals: G.animals.filter(a => !a.dead).map(a => ({
        type: a.type, hp: a.hp, pen: a.pen ? bIdx(a.pen) : -1,
      })),
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
      if (v.role === 'guard') nv._buildFig();
      const home = G.buildings[v.home];
      if (home) { nv.home = home; home.residents.push(nv); }
      const job = G.buildings[v.job];
      if (job) { nv.job = job; job.worker = nv; }
      G.villagers.push(nv);
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

function worldEvents(dt) {
  const night = isNight();
  if (night && !lastNight) {
    nightSpawns();
    G.ui.log('Night falls. The cursed things stir...');
    if (G.day >= 2 && G.day % 3 === 0) banditRaid();
  } else if (!night && lastNight) {
    dawnRespawns();
    G.ui.log(`Dawn of day ${G.day}.`);
    consumeDailyFood();       // brief §13: one ration per villager per day
    dailyAnimalProduce();     // brief §14: eggs & milk gather at the pen
    collectTaxes();           // brief §15: the Kingdom takes its due
    if (Math.random() < 0.9) spawnWanderer();
  }
  lastNight = night;

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
  const dt = Math.min(0.05, clock.getDelta());
  if (!G.paused) {
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
    worldEvents(dt);
    G.ui.update(dt, zoneAt(G.player.pos.x, G.player.pos.z));
  }
  G.renderer.render(G.scene, G.camera);
}
tick();

// expose for debugging
window.__G = G;
