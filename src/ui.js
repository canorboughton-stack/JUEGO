// HUD & panels (brief §16): vitals, inventories, clock, alert level, build menu,
// settlement management panel, storage transfer, workbench crafting, animal pen,
// recruitment menu, zone banners, message log.
import { G, isNight, dist2d } from './state.js';
import { BUILDING_DEFS, BUILD_ORDER, buildState, selectSlot, CROPS } from './buildings.js';
import { RESOURCES, ITEMS, RES_ICONS, RECIPES, invTotal, PLAYER_CARRY_CAP, CHEST_CAP,
         chestSpace, settlementFood, settlementCount, canAffordCombined, payCombined,
         playerAdd, costLabel } from './storage.js';
import { freeBeds, recruitWanderer } from './villagers.js';
import { ANIMAL_DEFS, addAnimal, penAnimals } from './livestock.js';
import { alertState } from './alerts.js';
import { stageName } from './progression.js';

const $ = id => document.getElementById(id);

const ALERT_STYLE = {
  normal: ['CALM', '#3e9948'],
  suspicious: ['SUSPICIOUS', '#c9a23c'],
  attack: ['UNDER ATTACK', '#c0392b'],
  recovery: ['RECOVERING', '#3c7ec9'],
};

export class UI {
  constructor() {
    this.els = {
      hp: $('hpFill'), st: $('stFill'), hu: $('huFill'),
      resources: $('resources'), dayline: $('dayline'), settlement: $('settlement'),
      alert: $('alertChip'),
      zone: $('zoneBanner'), zoneSub: $('zoneSub'),
      prompt: $('prompt'), gatherBar: $('gatherBar'), gatherFill: $('gatherFill'),
      log: $('log'), buildMenu: $('buildMenu'), helpFull: $('helpFull'),
      dmg: $('dmgVignette'), death: $('deathScreen'),
      bossBar: $('bossBar'), bossFill: $('bossFill'), bossName: $('bossName'),
      panel: $('panel'),
    };
    this.lastZone = '';
    this.zoneTimer = 0;
    this.panelMode = null;   // 'storage' | 'craft' | 'pen' | 'recruit' | 'settlement'
    this.panelObj = null;
    this.panelRefresh = 0;
    this._buildMenuDom();
    this.els.panel.addEventListener('click', e => this._onPanelClick(e));
  }

  // ---------- build menu ----------
  _buildMenuDom() {
    const m = this.els.buildMenu;
    m.innerHTML = '';
    BUILD_ORDER.forEach((type, i) => {
      const d = BUILDING_DEFS[type];
      const el = document.createElement('div');
      el.className = 'bslot';
      el.id = `bslot${i}`;
      el.innerHTML = `<div class="bkey">${d.key ? `[${d.key}]` : '&nbsp;'}</div><div class="bname">${d.name}</div>` +
        `<div class="bcost">${costLabel(d.cost)}</div><div class="bdesc">${d.desc}</div>`;
      el.addEventListener('click', () => selectSlot(i));
      m.appendChild(el);
    });
  }

  updateBuildMenu() {
    BUILD_ORDER.forEach((t, i) => {
      const el = $(`bslot${i}`);
      if (el) el.classList.toggle('sel', i === buildState.sel);
    });
  }

  showBuildMenu(on) {
    this.els.buildMenu.style.display = on ? 'block' : 'none';
    if (on) this.updateBuildMenu();
  }

  toggleHelp() {
    const h = this.els.helpFull;
    h.style.display = h.style.display === 'block' ? 'none' : 'block';
  }

  // ---------- messages / banners / prompts ----------
  log(text) {
    const d = document.createElement('div');
    d.textContent = text;
    this.els.log.appendChild(d);
    while (this.els.log.children.length > 6) this.els.log.removeChild(this.els.log.firstChild);
    setTimeout(() => { d.style.opacity = '0'; }, 7000);
    setTimeout(() => { if (d.parentNode) d.parentNode.removeChild(d); }, 8200);
  }

  banner(name, sub) {
    this.els.zone.textContent = name;
    this.els.zoneSub.textContent = sub || '';
    this.els.zone.style.opacity = '1';
    this.els.zoneSub.style.opacity = '1';
    this.zoneTimer = 3.5;
  }

  prompt(text) { this.els.prompt.textContent = text; }

  gatherProgress(f) {
    this.els.gatherBar.style.display = f > 0 ? 'block' : 'none';
    this.els.gatherFill.style.width = `${Math.min(100, f * 100)}%`;
  }

  damageFlash() {
    this.els.dmg.style.boxShadow = 'inset 0 0 140px #a01010cc';
    clearTimeout(this._dmgT);
    this._dmgT = setTimeout(() => { this.els.dmg.style.boxShadow = 'inset 0 0 140px #a0101000'; }, 260);
  }

  showDeath(on) { this.els.death.style.display = on ? 'flex' : 'none'; }

  bossBar(boss) {
    if (!boss) { this.els.bossBar.style.display = 'none'; return; }
    this.els.bossBar.style.display = 'block';
    this.els.bossName.textContent = boss.def.name.toUpperCase();
    this.els.bossFill.style.width = `${(boss.hp / boss.maxHp) * 100}%`;
  }

  // ---------- interactive panels ----------
  _openPanel(mode, obj) {
    this.panelMode = mode;
    this.panelObj = obj;
    G.uiOpen = true;
    document.exitPointerLock();
    this.els.panel.style.display = 'block';
    this._renderPanel();
  }

  closePanel() {
    if (!this.panelMode) return;
    this.panelMode = null; this.panelObj = null;
    G.uiOpen = false;
    this.els.panel.style.display = 'none';
    if (!G.paused) G.renderer.domElement.requestPointerLock();
  }

  openStoragePanel(chest) { this._openPanel('storage', chest); }
  openCraftPanel(bench) { this._openPanel('craft', bench); }
  openPenPanel(pen) { this._openPanel('pen', pen); }
  openRecruitMenu(wanderer) { this._openPanel('recruit', wanderer); }
  toggleSettlementPanel() {
    if (this.panelMode === 'settlement') this.closePanel();
    else this._openPanel('settlement', null);
  }

  _renderPanel() {
    const p = this.els.panel;
    if (this.panelMode === 'storage') p.innerHTML = this._storageHtml();
    else if (this.panelMode === 'craft') p.innerHTML = this._craftHtml();
    else if (this.panelMode === 'pen') p.innerHTML = this._penHtml();
    else if (this.panelMode === 'recruit') p.innerHTML = this._recruitHtml();
    else if (this.panelMode === 'settlement') p.innerHTML = this._settlementHtml();
  }

  _storageHtml() {
    const c = this.panelObj;
    if (!c || c.destroyed) { this.closePanel(); return ''; }
    let rows = '';
    for (const r of [...RESOURCES, ...ITEMS]) {
      const inChest = c.store[r] || 0, onYou = G.playerInv[r] || 0;
      if (inChest === 0 && onYou === 0) continue;
      rows += `<tr><td>${RES_ICONS[r]} ${r}</td>
        <td class="num">${inChest}</td>
        <td><button data-act="wd" data-res="${r}" data-n="1">‹1</button>
            <button data-act="wd" data-res="${r}" data-n="5">‹5</button>
            <button data-act="dp" data-res="${r}" data-n="1">1›</button>
            <button data-act="dp" data-res="${r}" data-n="5">5›</button></td>
        <td class="num">${onYou}</td></tr>`;
    }
    return `<h3>STORAGE CHEST</h3>
      <div class="psub">Chest ${invTotal(c.store)}/${CHEST_CAP} &nbsp;·&nbsp; Pack ${invTotal(G.playerInv)}/${PLAYER_CARRY_CAP}</div>
      <table><tr><th></th><th>chest</th><th>‹ take &nbsp; store ›</th><th>pack</th></tr>${rows || '<tr><td colspan=4>Nothing stored or carried.</td></tr>'}</table>
      <div class="pbtns"><button data-act="dpall">Deposit all resources</button>
      <button data-act="close">Close [E]</button></div>`;
  }

  _craftHtml() {
    let rows = '';
    for (const rc of RECIPES) {
      const ok = canAffordCombined(rc.cost);
      rows += `<div class="recipe ${ok ? '' : 'off'}">
        <b>${RES_ICONS[rc.id] || ''} ${rc.name}</b> <span class="pdim">(${costLabel(rc.cost)})</span>
        <div class="pdim">${rc.desc} · you have ${G.playerInv[rc.id] || 0}</div>
        <button data-act="craft" data-id="${rc.id}" ${ok ? '' : 'disabled'}>Craft</button></div>`;
    }
    return `<h3>WORKBENCH</h3>
      <div class="psub">Materials come from your pack and nearby settlement storage.</div>
      ${rows}<div class="pbtns"><button data-act="close">Close [E]</button></div>`;
  }

  _penHtml() {
    const pen = this.panelObj;
    if (!pen || pen.destroyed) { this.closePanel(); return ''; }
    const animals = penAnimals(pen);
    const counts = {};
    for (const a of animals) counts[a.type] = (counts[a.type] || 0) + 1;
    let buy = '';
    for (const [t, d] of Object.entries(ANIMAL_DEFS)) {
      const ok = canAffordCombined(d.cost) && animals.length < pen.def.animalCap;
      buy += `<div class="recipe ${ok ? '' : 'off'}">
        <b>${d.name}</b> <span class="pdim">(${costLabel(d.cost)})</span>
        <div class="pdim">${d.produce ? `+${d.produce} food/day` : 'meat animal'} · in pen: ${counts[t] || 0}</div>
        <button data-act="buy" data-id="${t}" ${ok ? '' : 'disabled'}>Buy from drover</button></div>`;
    }
    return `<h3>ANIMAL PEN</h3>
      <div class="psub">${animals.length}/${pen.def.animalCap} animals · ${pen.penFood || 0} food waiting</div>
      ${pen.penFood ? '<div class="pbtns"><button data-act="collect">Collect produce</button></div>' : ''}
      ${buy}<div class="pbtns"><button data-act="close">Close [E]</button></div>`;
  }

  _recruitHtml() {
    const w = this.panelObj;
    if (!w || w.gone) { this.closePanel(); return ''; }
    const beds = freeBeds();
    const food = settlementFood();
    const pop = G.villagers.filter(v => !v.dead).length;
    const hasWeapon = (G.playerInv.sword || 0) + settlementCount('sword') +
                      (G.playerInv.bow || 0) + settlementCount('bow') > 0;
    return `<h3>${w.name.toUpperCase()}, TRAVELER</h3>
      <div class="psub">"The road is long. Have you a bed and honest work?"</div>
      <div class="pdim">Beds free: <b>${beds}</b> · Villagers: ${pop} · Food in storage: ${food}
        (each villager eats 1/day)</div>
      <div class="pbtns">
        <button data-act="hire" data-id="farmer" ${beds > 0 ? '' : 'disabled'}>Recruit as FARMER</button>
        <button data-act="hire" data-id="guard" ${beds > 0 && hasWeapon ? '' : 'disabled'}>Recruit as GUARD</button>
        <button data-act="close">Not now [E]</button></div>
      ${beds <= 0 ? '<div class="pwarn">No free bed — build a Shack.</div>' : ''}
      ${!hasWeapon ? '<div class="pwarn">Guards need a Sword or Bow (craft at Workbench).</div>' : ''}`;
  }

  _settlementHtml() {
    const alive = G.villagers.filter(v => !v.dead);
    const farmers = alive.filter(v => v.role === 'farmer').length;
    const guards = alive.filter(v => v.role === 'guard').length;
    const homeless = alive.filter(v => !v.home).length;
    const jobless = alive.filter(v => !v.job).length;
    const damaged = G.buildings.filter(b => b.hp < b.maxHp - 1).length;
    const burning = G.buildings.filter(b => b.fire > 0).length;
    const sites = G.buildings.filter(b => b.built < 1).length;
    const food = settlementFood();
    const [aTxt, aCol] = ALERT_STYLE[alertState.level];

    let vrows = '';
    for (const v of alive) {
      vrows += `<tr><td>${v.name}</td><td>${v.role || 'idle'}</td>
        <td class="num">${Math.round(v.hp)}</td>
        <td>${v.home ? 'housed' : '<span class="pwarn">homeless</span>'}</td>
        <td>${v.state}${v.problem ? ` — <span class="pwarn">${v.problem}</span>` : ''}</td></tr>`;
    }
    let frows = '';
    for (const b of G.buildings) {
      if (b.type !== 'farm') continue;
      frows += `<tr><td>Farm (${CROPS[b.crop].name})</td>
        <td>${b.cropState} ${b.cropState === 'growing' || b.cropState === 'planted' ? `${Math.round(b.growth * 100)}%` : ''}</td>
        <td>${b.worker ? b.worker.name : '<span class="pwarn">no farmer</span>'}</td></tr>`;
    }
    const warns = [];
    if (food < alive.length * 2 && alive.length) warns.push(`Low food: ${food} in storage, ${alive.length} mouths/day.`);
    if (homeless) warns.push(`${homeless} villager(s) homeless — rebuild housing.`);
    if (jobless) warns.push(`${jobless} villager(s) without a workplace.`);
    if (damaged) warns.push(`${damaged} structure(s) damaged — repair with E.`);
    if (burning) warns.push(`${burning} structure(s) ON FIRE!`);
    if (sites) warns.push(`${sites} construction site(s) await your hammer.`);
    if (!G.taxes.paid) warns.push(`Kingdom levy unpaid (${G.taxes.owed} food owed).`);

    return `<h3>SETTLEMENT — ${stageName().toUpperCase()}</h3>
      <div class="psub">Alert: <b style="color:${aCol}">${aTxt}</b>
        · Population ${alive.length}/${G.popCap} (beds free: ${freeBeds()})
        · Food ${food} (−${alive.length}/day)
        · Farmers ${farmers} · Guards ${guards}
        ${G.stage >= 2 ? `· Taxes: ${G.taxes.paid ? `next day ${G.taxes.nextDay}` : `<span class="pwarn">OWED ${G.taxes.owed}</span>`}` : ''}</div>
      ${warns.length ? `<div class="pwarn">⚠ ${warns.join('<br>⚠ ')}</div>` : '<div class="pdim">All is well on the frontier.</div>'}
      <table><tr><th>Villager</th><th>Role</th><th>HP</th><th>Home</th><th>State</th></tr>
        ${vrows || '<tr><td colspan=5>No villagers yet — recruit travelers on the King\'s Road.</td></tr>'}</table>
      ${frows ? `<table><tr><th>Farm</th><th>Crop state</th><th>Worker</th></tr>${frows}</table>` : ''}
      <div class="pbtns"><button data-act="close">Close [Tab]</button></div>`;
  }

  _onPanelClick(e) {
    const btn = e.target.closest('button');
    if (!btn || btn.disabled) return;
    const act = btn.dataset.act, res = btn.dataset.res, id = btn.dataset.id;
    const n = parseInt(btn.dataset.n || '0', 10);
    const c = this.panelObj;
    if (act === 'close') { this.closePanel(); return; }
    if (act === 'dp' && c) {
      const put = Math.min(n, G.playerInv[res] || 0, ITEMS.includes(res) ? 99 : chestSpace(c));
      G.playerInv[res] -= put; c.store[res] = (c.store[res] || 0) + put;
    } else if (act === 'wd' && c) {
      const take = Math.min(n, c.store[res] || 0);
      c.store[res] -= take;
      const got = playerAdd(res, take);
      c.store[res] += take - got; // return what didn't fit
    } else if (act === 'dpall' && c) {
      for (const r of RESOURCES) {
        const put = Math.min(G.playerInv[r] || 0, chestSpace(c));
        G.playerInv[r] -= put; c.store[r] = (c.store[r] || 0) + put;
      }
    } else if (act === 'craft') {
      const rc = RECIPES.find(r => r.id === id);
      if (rc && canAffordCombined(rc.cost)) {
        payCombined(rc.cost);
        playerAdd(rc.id, 1);
        this.log(`Crafted: ${rc.name}.`);
      }
    } else if (act === 'buy') {
      const d = ANIMAL_DEFS[id];
      if (d && canAffordCombined(d.cost) && penAnimals(c).length < c.def.animalCap) {
        payCombined(d.cost);
        addAnimal(id, c);
        this.log(`A ${d.name.toLowerCase()} was delivered to your pen.`);
      }
    } else if (act === 'collect') {
      const got = playerAdd('meat', c.penFood || 0);
      c.penFood -= got;
      this.log(`Collected ${got} food from the pen.`);
    } else if (act === 'hire') {
      const err = recruitWanderer(c, id);
      if (err) { this.log(err); this._renderPanel(); return; }
      this.closePanel();
      return;
    }
    this._renderPanel();
  }

  // ---------- per-frame HUD ----------
  _timeLabel() {
    const t = G.time;
    if (t < 0.22) return 'Deep Night';
    if (t < 0.27) return 'Dawn';
    if (t < 0.45) return 'Morning';
    if (t < 0.58) return 'Midday';
    if (t < 0.72) return 'Afternoon';
    if (t < 0.79) return 'Dusk';
    return 'Night';
  }

  update(dt, zone) {
    const p = G.player;
    this.els.hp.style.width = `${Math.max(0, p.hp / p.maxHp * 100)}%`;
    this.els.st.style.width = `${Math.max(0, p.st / p.maxSt * 100)}%`;
    this.els.hu.style.width = `${Math.max(0, p.hunger / p.maxHu * 100)}%`;

    const pop = G.villagers.filter(v => !v.dead).length;
    let inv = '';
    for (const r of [...RESOURCES, ...ITEMS]) {
      if ((G.playerInv[r] || 0) > 0 || r === 'wood' || r === 'stone')
        inv += `<span class="res">${RES_ICONS[r]} ${G.playerInv[r] || 0}</span> `;
    }
    this.els.resources.innerHTML =
      `${inv}<span class="res" style="font-size:12px">${invTotal(G.playerInv)}/${PLAYER_CARRY_CAP}</span><br>` +
      `<span class="res">🏘 ${settlementFood()} food</span> ` +
      `<span class="res">👥 ${pop}/${G.popCap}</span>`;

    const nightWarn = isNight() ? ' 🌙' : ' ☀';
    this.els.dayline.innerHTML = `Day ${G.day} &mdash; ${this._timeLabel()}${nightWarn}`;
    this.els.settlement.textContent = stageName();

    const [aTxt, aCol] = ALERT_STYLE[alertState.level];
    this.els.alert.textContent = aTxt;
    this.els.alert.style.color = aCol;
    this.els.alert.style.borderColor = aCol;

    // zone banner on region change
    if (zone && zone.name !== this.lastZone) {
      this.lastZone = zone.name;
      this.banner(zone.name, zone.sub);
    }
    if (this.zoneTimer > 0) {
      this.zoneTimer -= dt;
      if (this.zoneTimer <= 0) {
        this.els.zone.style.opacity = '0';
        this.els.zoneSub.style.opacity = '0';
      }
    }

    // live-refresh open panels (settlement stats change under you)
    if (this.panelMode) {
      this.panelRefresh -= dt;
      if (this.panelRefresh <= 0) {
        this.panelRefresh = this.panelMode === 'settlement' ? 0.5 : 1.0;
        // don't re-render while hovering a button mid-click
        if (!this.els.panel.matches(':active')) this._renderPanel();
      }
    }
  }
}
