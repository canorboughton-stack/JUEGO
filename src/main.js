// Kingdoms of the Cursed — bootstrap & main loop.
// Core loop (bible): Explore → Survive → Build → Defend.
import * as THREE from '../lib/three.module.js';
import { G, isNight } from './state.js';
import { World, zoneAt, POI } from './world.js';
import { Player } from './player.js';
import { spawnInitialCreatures, updateCreatures, updateLoots, nightSpawns, banditRaid, dawnRespawns, spawn } from './entities.js';
import { placeBuilding, updateBuildings, buildState, enterBuildMode, exitBuildMode,
         selectSlot, demolishNearest, BUILD_ORDER, applyBuildingEffects } from './buildings.js';
import { spawnWanderer, updateWanderers, updateVillagers, assignJobs, Villager } from './villagers.js';
import { UI } from './ui.js';

const SAVE_KEY = 'kotc-save-v1';

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
G.ui = new UI();
G.world = new World();
G.player = new Player();

// ---------- input ----------
document.addEventListener('keydown', e => {
  G.keys[e.code] = true;
  if (G.paused) return;
  switch (e.code) {
    case 'KeyB': buildState.active ? exitBuildMode() : enterBuildMode(); break;
    case 'KeyF': G.player.eat(); break;
    case 'KeyH': G.ui.toggleHelp(); break;
    case 'KeyK': saveGame(); break;
    case 'KeyX': demolishNearest(); break;
    case 'KeyR': if (buildState.active) buildState.rot += Math.PI / 4; break;
    case 'Space': e.preventDefault(); if (!buildState.active) G.player.roll(); break;
    case 'Escape': if (buildState.active) exitBuildMode(); break;
    default: {
      // number keys select build slots
      const n = parseInt(e.key, 10);
      if (buildState.active && n >= 1 && n <= BUILD_ORDER.length) selectSlot(n - 1);
    }
  }
});
document.addEventListener('keyup', e => { G.keys[e.code] = false; });

// ---------- new game / load ----------
function newGame() {
  // the starting campfire — heart of the future settlement
  placeBuilding('campfire', 0, 0, 0);
  spawnInitialCreatures();
  spawnWanderer();
  G.ui.log('You strike a fire in the wilderness. This will be home — if you can hold it.');
  G.ui.log('Gather wood from the Dark Forest (east). Stone waits in the hills (west).');
  G.ui.banner('THE SETTLEMENT', 'Day 1. Build before nightfall.');
}

function saveGame() {
  try {
    const data = {
      day: G.day, time: G.time,
      resources: G.resources,
      werewolfSlain: G.werewolfSlain,
      player: { x: G.player.pos.x, z: G.player.pos.z, hp: G.player.hp, hunger: G.player.hunger },
      buildings: G.buildings.map(b => ({ type: b.type, x: b.x, z: b.z, rot: b.rotY, hp: b.hp })),
      villagers: G.villagers.filter(v => !v.dead).map(v => ({ name: v.name, role: v.role, x: v.pos.x, z: v.pos.z })),
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
    G.day = d.day; G.time = d.time;
    Object.assign(G.resources, d.resources);
    G.werewolfSlain = !!d.werewolfSlain;
    for (const b of d.buildings) {
      const nb = placeBuilding(b.type, b.x, b.z, b.rot);
      nb.hp = b.hp;
    }
    for (const v of d.villagers) {
      const nv = new Villager(v.name, v.x, v.z);
      G.villagers.push(nv);
    }
    applyBuildingEffects();
    assignJobs();
    G.player.pos.set(d.player.x, 0, d.player.z);
    G.player.hp = d.player.hp; G.player.hunger = d.player.hunger;
    spawnInitialCreatures();
    G.ui.log(`Welcome back. Day ${G.day} on the frontier.`);
  } catch (err) {
    console.error(err);
    newGame();
  }
}

// ---------- world event scheduling ----------
let lastNight = isNight();
let wandererTimer = 20;

function worldEvents(dt) {
  const night = isNight();
  if (night && !lastNight) {
    // dusk fell
    nightSpawns();
    G.ui.log('Night falls. The cursed things stir...');
    if (G.day >= 2 && G.day % 3 === 0) banditRaid();
  } else if (!night && lastNight) {
    // dawn broke
    dawnRespawns();
    G.ui.log(`Dawn of day ${G.day}.`);
    if (Math.random() < 0.9) spawnWanderer();
  }
  lastNight = night;

  // occasional daytime wanderer on the road
  wandererTimer -= dt;
  if (wandererTimer <= 0) {
    wandererTimer = 60 + Math.random() * 60;
    if (!night && G.wanderers.length < 2) spawnWanderer();
  }
}

// ---------- build mode ghost placement ----------
import { updateBuildMode } from './buildings.js';

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
    updateBuildings(dt);
    updateLoots(dt);
    updateBuildMode();
    worldEvents(dt);
    G.ui.update(dt, zoneAt(G.player.pos.x, G.player.pos.z));
  }
  G.renderer.render(G.scene, G.camera);
}
tick();

// expose for debugging
window.__G = G;
