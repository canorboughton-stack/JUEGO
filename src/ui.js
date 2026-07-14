// HUD & panels (brief §16): vitals, inventories, clock, alert level, build menu,
// settlement management panel, storage transfer, workbench crafting, animal pen,
// recruitment menu, zone banners, message log.
import { G, isNight, dist2d } from './state.js';
import { BUILDING_DEFS, BUILD_ORDER, buildState, selectSlot, CROPS } from './buildings.js';
import { RESOURCES, ITEMS, RES_ICONS, RECIPES, invTotal, PLAYER_CARRY_CAP, CHEST_CAP,
         chestSpace, settlementFood, settlementCount, canAffordCombined, payCombined,
         playerAdd, costLabel } from './storage.js';
import { freeBeds, recruitWanderer, TRAITS } from './villagers.js';
import { ANIMAL_DEFS, addAnimal, penAnimals } from './livestock.js';
import { alertState } from './alerts.js';
import { stageName } from './progression.js';
import { createGroup, disbandGroup, issueCommand, makeCompanion, canLead, canJoin,
         defenseInfo, GROUP_PURPOSES, MAX_MEMBERS } from './groups.js';
import { TRADES, doTrade } from './merchant.js';

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
    // closing with E must not instantly re-trigger a nearby interactable
    if (G.player) G.player._ePressed = true;
    if (!G.paused) G.renderer.domElement.requestPointerLock();
  }

  openStoragePanel(chest) { this._openPanel('storage', chest); }
  openCraftPanel(bench) { this._openPanel('craft', bench); }
  openPenPanel(pen) { this._openPanel('pen', pen); }
  openRecruitMenu(wanderer) { this._openPanel('recruit', wanderer); }
  openVillagerPanel(v) { this._openPanel('villager', v); }
  openTradePanel() { this._openPanel('trade', G.merchant); }
  openTamedPanel(t) { this._openPanel('tamed', t); }
  openMorningReport(rep) { this._openPanel('report', rep); }
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
    else if (this.panelMode === 'villager') p.innerHTML = this._villagerHtml();
    else if (this.panelMode === 'trade') p.innerHTML = this._tradeHtml();
    else if (this.panelMode === 'tamed') p.innerHTML = this._tamedHtml();
    else if (this.panelMode === 'report') p.innerHTML = this._reportHtml();
    else if (this.panelMode === 'settlement') p.innerHTML = this._settlementHtml();
  }

  // the morning assessment (loop bible): plan the day before leaving the gate
  _reportHtml() {
    const r = this.panelObj;
    if (!r) { this.closePanel(); return ''; }
    const li = [];
    li.push(`Food in storage: <b>${r.food}</b> — about <b>${r.foodDays}</b> day(s) for ${r.pop} villager(s)`);
    if (r.deaths.length) li.push(`<span class="pwarn">Lost in the night: ${r.deaths.join(', ')}</span>`);
    if (r.livestockLost) li.push(`<span class="pwarn">${r.livestockLost} livestock killed</span>`);
    if (r.buildingsLost) li.push(`<span class="pwarn">${r.buildingsLost} structure(s) destroyed</span>`);
    if (r.damaged) li.push(`<span class="pwarn">${r.damaged} structure(s) damaged — hammer them (E)</span>`);
    if (r.injured) li.push(`${r.injured} villager(s) injured and recovering`);
    if (r.guardsAway) li.push(`${r.guardsAway} guard(s) away with groups`);
    if (r.cropsReady) li.push(`${r.cropsReady} farm(s) ready to harvest`);
    if (r.lowWood) li.push('<span class="pwarn">Wood is running low</span>');
    if (r.merchant) li.push('The merchant is on the road today');
    if (r.taxesIn >= 0) li.push(`The Kingdom's levy comes in ${r.taxesIn} day(s)`);
    if (r.incense === 0) li.push('<span class="pwarn">No incense in storage — the ghosts will come unhindered</span>');
    if (r.redMoonTonight) li.push('<b style="color:#c0392b">🔴 THE RED MOON RISES TONIGHT. Do not be away from the walls.</b>');
    else if (r.redMoonTomorrow) li.push('<b style="color:#c9a23c">🌑 The moon is turning — the Red Moon rises TOMORROW night.</b>');
    return `<h3>DAWN — DAY ${r.day}</h3>
      <div class="psub">"Can I safely leave the village today?"</div>
      ${li.map(x => `<div style="margin:3px 0">· ${x}</div>`).join('')}
      <div class="pbtns"><button data-act="close">Make today's plan [E]</button></div>`;
  }

  _tamedHtml() {
    const t = this.panelObj;
    if (!t || t.dead) { this.closePanel(); return ''; }
    const trustTxt = t.trust >= 70 ? 'devoted' : t.trust >= 30 ? 'wary but willing' : 'sullen — it refuses commands';
    return `<h3>${t.name.toUpperCase()} THE ${t.type.toUpperCase()}</h3>
      <div class="psub">${t.def.blurb}</div>
      <div class="pdim">Health ${Math.round(t.hp)}/${t.maxHp} · Trust ${Math.round(t.trust)}/100 (${trustTxt})
        · ${t.fedToday ? 'fed' : '<span class="pwarn">hungry</span>'} · doing: ${t.state || 'resting'}</div>
      <div class="pdim">It eats 1 meat from storage each dawn. Neglect it and it will leave.</div>
      <div class="pbtns">
        <button data-act="trole" data-id="companion" ${t.role === 'companion' ? 'disabled' : ''}>Follow me (Companion)</button>
        <button data-act="trole" data-id="defender" ${t.role === 'defender' ? 'disabled' : ''}>Guard the village (Defender)</button>
        <button data-act="trole" data-id="rest" ${t.role === 'rest' ? 'disabled' : ''}>Rest</button>
        <button data-act="tfeed" ${(G.playerInv.meat || 0) > 0 ? '' : 'disabled'}>Feed from pack (1 meat)</button>
      </div>
      <div class="pbtns"><button data-act="close">Leave it be [E]</button></div>`;
  }

  _tradeHtml() {
    const m = this.panelObj;
    if (!m || m.gone || m.state !== 'trading') { this.closePanel(); return ''; }
    const fmt = o => Object.entries(o).map(([r, n]) => `${n} ${RES_ICONS[r]} ${r}`).join(' + ');
    let rows = '';
    TRADES.forEach((t, i) => {
      const ok = Object.entries(t.give).every(([r, n]) => (G.playerInv[r] || 0) >= n);
      rows += `<div class="recipe ${ok ? '' : 'off'}">
        <b>${fmt(t.give)} → ${fmt(t.get)}</b>
        <div class="pdim">"${t.note}"</div>
        <button data-act="trade" data-id="${i}" ${ok ? '' : 'disabled'}>Trade</button></div>`;
    });
    return `<h3>THE MERCHANT</h3>
      <div class="psub">"Goods for goods, friend. Coin means little this far out."</div>
      <div class="pdim">Trades come from your pack — hides and incense are worth the most.</div>
      ${rows}<div class="pbtns"><button data-act="close">Done trading [E]</button></div>`;
  }

  // talking to a villager: identity, then companionship or leader commands (brief §11, §16)
  _villagerHtml() {
    const v = this.panelObj;
    if (!v || v.dead) { this.closePanel(); return ''; }
    const t = TRAITS[v.trait] || {};
    const id = `<h3>${v.name.toUpperCase()}</h3>
      <div class="psub">${v.role || 'villager'} · ${v.trait} (${t.blurb || ''}) ·
        ${Math.round(v.hp)}/${v.maxHp} hp</div>
      <div class="pdim">Home: ${v.home ? 'housed' : 'homeless'} ·
        Work: ${v.job ? v.job.def.name : 'none'} · Doing: ${v.state}
        ${v.problem ? ` — <span class="pwarn">${v.problem}</span>` : ''}
        ${v.weapon ? ` · armed with ${v.weapon}` : ''}</div>`;
    let body = '';
    if (v.group && v.isLeader) {
      const g = v.group;
      body = `<div class="psub">Leads <b>${g.name}</b> (${g.everyone().length} strong)
          — orders: ${g.command ? g.command.type : 'none'}</div>
        <div class="pbtns">
        <button data-act="cmd" data-id="follow">Follow Me</button>
        <button data-act="cmd" data-id="wait">Wait Here</button>
        <button data-act="cmd" data-id="defend">Defend This Area</button>
        <button data-act="cmd" data-id="patrol">Patrol Here↔There</button>
        <button data-act="cmd" data-id="attack">Attack My Target</button>
        <button data-act="cmd" data-id="retreat">Retreat!</button>
        <button data-act="cmd" data-id="home">Return Home</button>
        <button data-act="disband">Disband Group</button></div>`;
    } else if (v.group) {
      body = `<div class="psub">Answers to ${v.group.leader.name} (${v.group.name}).</div>
        <div class="pbtns"><button data-act="ungroup">Release from group</button></div>`;
    } else {
      body = `<div class="pbtns">
        <button data-act="companion">Follow me (companion)</button></div>
        <div class="pdim">Groups are formed from the Settlement panel [Tab].</div>`;
    }
    return `${id}${body}<div class="pbtns"><button data-act="close">Farewell [E]</button></div>`;
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
      vrows += `<tr><td>${v.name}${v.isLeader ? ' ★' : ''}</td>
        <td>${v.role || 'idle'} · ${v.trait}</td>
        <td class="num">${Math.round(v.hp)}</td>
        <td>${v.home ? 'housed' : '<span class="pwarn">homeless</span>'}</td>
        <td>${v.state}${v.group ? ` (${v.group.name})` : ''}${v.problem ? ` — <span class="pwarn">${v.problem}</span>` : ''}</td></tr>`;
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

    // groups & defense (brief §8, §17)
    const def = defenseInfo();
    let grows = '';
    for (const g of G.groups) {
      grows += `<tr><td>${g.name}</td><td>${g.purpose}</td>
        <td>${g.leader.name}</td><td class="num">${g.everyone().length}</td>
        <td>${g.command ? g.command.type : 'at rest'}</td>
        <td><button data-act="gdisband" data-id="${g.id}">Disband</button></td></tr>`;
    }
    const leaders = alive.filter(v => canLead(v));
    const joinable = alive.filter(v => canJoin(v));
    const createForm = leaders.length ? `
      <div class="recipe"><b>Create Group</b>
        <div style="margin:4px 0">Purpose:
          <select id="gpPurpose">${GROUP_PURPOSES.map(p => `<option>${p}</option>`).join('')}</select>
          Leader: <select id="gpLeader">${leaders.map(v =>
            `<option value="${v.id}">${v.name} (${v.role || v.trait})</option>`).join('')}</select></div>
        <div class="pdim">Members (up to ${MAX_MEMBERS}):
          ${joinable.map(v => `<label style="margin-right:8px"><input type="checkbox"
            name="gpMember" value="${v.id}"> ${v.name}</label>`).join('') || 'nobody free'}</div>
        <button data-act="gcreate">Form the group</button></div>`
      : '<div class="pdim">No eligible leaders — groups need a Guard or a brave villager.</div>';

    return `<h3>SETTLEMENT — ${stageName().toUpperCase()}</h3>
      <div class="psub">Alert: <b style="color:${aCol}">${aTxt}</b>
        · Population ${alive.length}/${G.popCap} (beds free: ${freeBeds()})
        · Food ${food} (−${alive.length}/day)
        · Farmers ${farmers} · Guards ${guards}
        ${G.stage >= 2 ? `· Taxes: ${G.taxes.paid ? `next day ${G.taxes.nextDay}` : `<span class="pwarn">OWED ${G.taxes.owed}</span>`}` : ''}</div>
      <div class="pdim">Defense: ${def.onDuty}/${def.guards} guards on duty
        ${def.away ? ` (<span class="pwarn">${def.away} away with groups</span>)` : ''}
        ${def.unmanned ? ` · <span class="pwarn">${def.unmanned} post(s) unmanned</span>` : ''}
        ${G.tamed.length ? ` · Bound beasts: ${G.tamed.map(t => `${t.name} (${t.role})`).join(', ')}` : ''}
        ${G.redMoon.active ? ' · <b style="color:#c0392b">RED MOON</b>'
          : G.day >= G.redMoon.nextDay - 1 ? ` · <span class="pwarn">Red Moon: ${G.day === G.redMoon.nextDay ? 'TONIGHT' : 'tomorrow night'}</span>`
          : ` · Red Moon in ${G.redMoon.nextDay - G.day} day(s)`}</div>
      ${warns.length ? `<div class="pwarn">⚠ ${warns.join('<br>⚠ ')}</div>` : '<div class="pdim">All is well on the frontier.</div>'}
      <table><tr><th>Villager</th><th>Role</th><th>HP</th><th>Home</th><th>State</th></tr>
        ${vrows || '<tr><td colspan=5>No villagers yet — recruit travelers on the King\'s Road.</td></tr>'}</table>
      ${frows ? `<table><tr><th>Farm</th><th>Crop state</th><th>Worker</th></tr>${frows}</table>` : ''}
      ${grows ? `<table><tr><th>Group</th><th>Purpose</th><th>Leader</th><th>Size</th><th>Orders</th><th></th></tr>${grows}</table>` : ''}
      ${createForm}
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
        playerAdd(rc.id, rc.yield || 1);
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
    } else if (act === 'cmd') {
      // orders go to the Leader only (brief §11)
      const v = this.panelObj, g = v.group, P = G.player.pos;
      if (id === 'follow') issueCommand(g, 'follow');
      else if (id === 'wait') issueCommand(g, 'wait', { x: v.pos.x, z: v.pos.z });
      else if (id === 'defend') issueCommand(g, 'defend', { x: P.x, z: P.z });
      else if (id === 'patrol') issueCommand(g, 'patrol',
        { points: [{ x: v.pos.x, z: v.pos.z }, { x: P.x, z: P.z }], pointIdx: 0 });
      else if (id === 'attack') {
        let best = null, bd = 30;
        for (const cr of G.creatures) {
          if (cr.dead) continue;
          const d = dist2d(P.x, P.z, cr.pos.x, cr.pos.z);
          if (d < bd) { bd = d; best = cr; }
        }
        if (best) issueCommand(g, 'attack', { target: best });
        else this.log('No target in sight.');
      } else if (id === 'retreat') issueCommand(g, 'retreat');
      else if (id === 'home') issueCommand(g, 'home');
      this.closePanel();
      return;
    } else if (act === 'disband') {
      disbandGroup(this.panelObj.group);
      this.closePanel();
      return;
    } else if (act === 'ungroup') {
      const v = this.panelObj, g = v.group;
      const i = g.members.indexOf(v);
      if (i >= 0) { g.members.splice(i, 1); v.group = null; }
      this._renderPanel();
      return;
    } else if (act === 'companion') {
      const err = makeCompanion(this.panelObj);
      if (err) this.log(err);
      this.closePanel();
      return;
    } else if (act === 'gdisband') {
      const g = G.groups.find(x => x.id === +id);
      if (g) disbandGroup(g);
      this._renderPanel();
      return;
    } else if (act === 'trade') {
      const err = doTrade(+id);
      if (err) this.log(err);
      this._renderPanel();
      return;
    } else if (act === 'trole') {
      c.role = id;
      this.log(id === 'companion' ? `${c.name} falls in at your heel.`
        : id === 'defender' ? `${c.name} will watch over the village.`
        : `${c.name} curls up near the fire.`);
      this._renderPanel();
      return;
    } else if (act === 'tfeed') {
      if ((G.playerInv.meat || 0) > 0) {
        G.playerInv.meat--;
        c.fedToday = true;
        c.trust = Math.min(100, c.trust + 4);
        c.hp = Math.min(c.maxHp, c.hp + 10);
        this.log(`${c.name} takes the meat from your hand. (+trust)`);
      }
      this._renderPanel();
      return;
    } else if (act === 'gcreate') {
      const purpose = document.getElementById('gpPurpose').value;
      const leader = G.villagers.find(v => v.id === +document.getElementById('gpLeader').value);
      const members = [...document.querySelectorAll('input[name=gpMember]:checked')]
        .map(cb => G.villagers.find(v => v.id === +cb.value))
        .filter(v => v && v !== leader)
        .slice(0, MAX_MEMBERS);
      const name = `${purpose} Group ${G.groups.length + 1}`;
      const err = createGroup(name, purpose, leader, members);
      if (err) this.log(err);
      this._renderPanel();
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
    const wpn = G.player.weapon;
    this.els.resources.innerHTML =
      `${inv}<span class="res" style="font-size:12px">${invTotal(G.playerInv)}/${PLAYER_CARRY_CAP}</span><br>` +
      `<span class="res">${RES_ICONS[wpn] || ''} ${wpn}${wpn === 'bow' ? ` ➶${G.playerInv.arrows || 0}` : ''}</span> ` +
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
        this.panelRefresh = this.panelMode === 'settlement' ? 0.8 : 1.0;
        // don't re-render while the mouse is over the panel (forms hold state)
        if (!this.els.panel.matches(':active') && !this.els.panel.matches(':hover'))
          this._renderPanel();
      }
    }
  }
}
