// HUD: vitals, resources, clock, build menu, zone banners, message log.
import { G, isNight } from './state.js';
import { BUILDING_DEFS, BUILD_ORDER, buildState, selectSlot, settlementTier } from './buildings.js';

const $ = id => document.getElementById(id);

export class UI {
  constructor() {
    this.els = {
      hp: $('hpFill'), st: $('stFill'), hu: $('huFill'),
      resources: $('resources'), dayline: $('dayline'), settlement: $('settlement'),
      zone: $('zoneBanner'), zoneSub: $('zoneSub'),
      prompt: $('prompt'), gatherBar: $('gatherBar'), gatherFill: $('gatherFill'),
      log: $('log'), buildMenu: $('buildMenu'), helpFull: $('helpFull'),
      dmg: $('dmgVignette'), death: $('deathScreen'),
      bossBar: $('bossBar'), bossFill: $('bossFill'), bossName: $('bossName'),
    };
    this.lastZone = '';
    this.zoneTimer = 0;
    this._buildMenuDom();
  }

  _buildMenuDom() {
    const m = this.els.buildMenu;
    m.innerHTML = '';
    BUILD_ORDER.forEach((type, i) => {
      const d = BUILDING_DEFS[type];
      const cost = Object.entries(d.cost).map(([k, v]) => `${v} ${k}`).join(', ');
      const el = document.createElement('div');
      el.className = 'bslot';
      el.id = `bslot${i}`;
      el.innerHTML = `<div class="bkey">[${d.key}]</div><div class="bname">${d.name}</div>` +
        `<div class="bcost">${cost}</div><div class="bdesc">${d.desc}</div>`;
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
    const total = G.resources.wood + G.resources.stone + G.resources.food;
    this.els.resources.innerHTML =
      `<span class="res">🪵 ${G.resources.wood}</span> ` +
      `<span class="res">🪨 ${G.resources.stone}</span> ` +
      `<span class="res">🍖 ${G.resources.food}</span><br>` +
      `<span class="res">👥 ${pop}/${G.popCap}</span> ` +
      `<span class="res" style="font-size:12px">${total}/${G.resourceCap}</span>`;

    const nightWarn = isNight() ? ' 🌙' : ' ☀';
    this.els.dayline.innerHTML = `Day ${G.day} &mdash; ${this._timeLabel()}${nightWarn}`;
    this.els.settlement.textContent = settlementTier();

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
  }
}
