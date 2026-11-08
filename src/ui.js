// Interface em HTML por cima do mapa: barra superior, ferramentas, painéis.
import { TOOLS, fmt } from './actions.js';
import {
  N, MONTHS, DAYS_PER_MONTH, TERRAIN_NAME, OBJ_NAME, ZONE_NAME, RESIDENTS, JOBS_C, JOBS_I, ZR, ZC, ROAD_REACH, COST,
  SVC_NAME, SVC_RADIUS, SVC_UPKEEP, SVC_PARK, WATER, MAP_SIZES,
} from './config.js';
import { upgradeBlock, monthlyBudget } from './sim.js';

const ICONS = {
  inspect: '<circle cx="10" cy="10" r="6"/><path d="M14.5 14.5 20 20"/>',
  clear: '<path d="M5 20 15 6"/><path d="M13 4c3 0 6 2 6 5l-4 1-3-3z" fill="currentColor"/>',
  road: '<path d="M7 21 10 3M17 21 14 3"/><path d="M12 6v2M12 11v2M12 16v2" stroke-width="1.6"/>',
  zoneR: '<path d="M4 11 12 4l8 7"/><path d="M6 10v10h12V10"/><path d="M10 20v-5h4v5"/>',
  zoneC: '<path d="M4 9h16l-1-4H5z"/><path d="M5 9v11h14V9"/><path d="M9 20v-6h6v6"/>',
  zoneI: '<path d="M3 20V10l5 3V10l5 3V5h3v15z"/><path d="M3 20h18"/>',
  demolish: '<path d="M4 20h16"/><path d="M6 20V9h8v11"/><path d="m15 4 5 5M20 4l-5 5"/>',
  power: '<path d="M13 3 6 13h5l-1 8 7-11h-5z"/>',
  water: '<path d="M12 3c3 4.5 6 7.6 6 11a6 6 0 0 1-12 0c0-3.4 3-6.5 6-11z"/>',
  school: '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c3 2 9 2 12 0v-5"/><path d="M21 9v6"/>',
  health: '<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/>',
  police: '<path d="M12 3l8 3c0 7-3 12-8 15-5-3-8-8-8-15z"/><path d="M12 8l1.2 2.6 2.8.3-2.1 1.9.6 2.8-2.5-1.5-2.5 1.5.6-2.8-2.1-1.9 2.8-.3z"/>',
  park: '<circle cx="12" cy="9" r="5"/><path d="M12 14v7M8 21h8"/>',
  services: '<path d="M4 20h16"/><path d="M5 20V10l7-5 7 5v10"/><path d="M10 20v-5h4v5"/>',
};
const SERVICES = ['power', 'water', 'school', 'health', 'police'];
const TOOL_ORDER = ['inspect', 'clear', 'road', 'zoneR', 'zoneC', 'zoneI', 'services', 'park', 'demolish'];
const svcIdx = id => TOOLS[id].svc;
const TOOL_HINT = {
  inspect: 'Clique num tile para ver detalhes. Arraste para mover o mapa.',
  clear: `Remove mata e pedras. Árvore R$ ${COST.clear[1]}, pedra R$ ${COST.clear[3]}.`,
  road: `R$ ${COST.road} por tile. Sobre a água vira ponte (R$ ${COST.bridge}).`,
  zoneR: `Casas aparecem sozinhas perto de ruas. R$ ${COST.zone}/tile.`,
  zoneC: `Comércio precisa de moradores por perto. R$ ${COST.zone}/tile.`,
  zoneI: `Indústria gera empregos, mas desvaloriza o terreno ao redor. R$ ${COST.zone}/tile.`,
  power: 'Prédios precisam de energia para passar do nível 1.',
  water: 'Prédios precisam de água para chegar ao nível 3.',
  school: 'Residências precisam de escola para chegar ao nível 3. Também valoriza o terreno.',
  health: 'Residências precisam de posto de saúde para chegar ao nível 3. Também valoriza o terreno.',
  police: 'Comércio e indústria precisam de delegacia para chegar ao nível 3. Também valoriza o terreno.',
  park: `Praças valorizam o terreno ao redor. R$ ${COST.park}/tile + R$ ${SVC_UPKEEP[SVC_PARK]}/mês por tile.`,
  demolish: 'Remove ruas, prédios e serviços. Num lote vazio, tira a zona.',
};
for (const k of SERVICES) {
  const i = svcIdx(k);
  TOOL_HINT[k] += ` Alcance ${SVC_RADIUS[i]} tiles. R$ ${fmt(COST[k])} + R$ ${SVC_UPKEEP[i]}/mês.`;
}
const LACK = {
  power: { cls: 'pw', icon: '⚡', what: 'sem energia' },
  water: { cls: 'wt', icon: '💧', what: 'sem água' },
  school: { cls: 'sc', icon: '🎓', what: 'sem escola' },
  health: { cls: 'hl', icon: '✚', what: 'sem posto de saúde' },
  police: { cls: 'pl', icon: '🛡', what: 'sem delegacia' },
};

const $ = s => document.querySelector(s);
const svg = id => `<svg viewBox="0 0 24 24">${ICONS[id]}</svg>`;

export class UI {
  constructor(game) {
    this.game = game;
    this.lastService = 'power';
    const bar = $('#tools');
    for (const [k, id] of TOOL_ORDER.entries()) {
      const b = document.createElement('button');
      b.className = 'tool';
      b.dataset.tool = id;
      const name = id === 'services' ? 'Serviços' : TOOLS[id].name;
      b.title = `${name} (${k + 1})\n${id === 'services' ? 'Usina, água, escola, saúde e polícia' : TOOL_HINT[id]}`;
      b.innerHTML = `${svg(id)}<span>${name}</span><kbd>${k + 1}</kbd>`;
      b.onclick = () => (id === 'services' ? this.toggleServices() : game.setTool(id));
      bar.appendChild(b);
    }
    $('#svcMenu').innerHTML = SERVICES.map(id => {
      const i = svcIdx(id);
      return `<button data-svc="${id}" class="svc-${id}">${svg(id)}<span><b>${TOOLS[id].name}</b><small>R$ ${fmt(COST[id])} · R$ ${SVC_UPKEEP[i]}/mês · raio ${SVC_RADIUS[i]}</small></span></button>`;
    }).join('');
    $('#svcMenu').addEventListener('click', e => {
      const b = e.target.closest('[data-svc]');
      if (b) { game.setTool(b.dataset.svc); $('#svcMenu').classList.remove('open'); }
    });

    document.querySelectorAll('[data-speed]').forEach(b => { b.onclick = () => game.setSpeed(+b.dataset.speed); });
    const closePops = except => document.querySelectorAll('.pop').forEach(p => { if (p !== except) p.classList.remove('open'); });
    $('#menuBtn').onclick = () => { closePops($('#menu')); $('#menu').classList.toggle('open'); this.renderSeed(); };
    this.setupMultiplayer(closePops);
    this.setupBudget();
    this.setupNewMap();
    $('#alerts').addEventListener('click', e => {
      const b = e.target.closest('[data-kind]');
      if (b) game.focusProblem(b.dataset.kind);
    });
    $('#saveBtn').onclick = () => { game.save(); this.toast('Jogo salvo'); $('#menu').classList.remove('open'); };
    $('#valueBtn').onclick = () => game.toggleValueMap();
    const dn = $('#dayNightChk');
    dn.checked = game.dayNight;
    dn.onchange = () => game.setDayNight(dn.checked);
    $('#infoClose').onclick = () => this.hideInfo();
  }

  // ---------- serviços ----------
  toggleServices(forceOpen) {
    const m = $('#svcMenu');
    const open = forceOpen ?? !m.classList.contains('open');
    m.classList.toggle('open', open);
    if (open && !SERVICES.includes(this.game.tool)) this.game.setTool(this.lastService);
  }

  // ---------- orçamento ----------
  setupBudget() {
    const open = () => { $('#budgetPanel').classList.toggle('open'); this.renderBudget(); };
    $('#moneyBtn').onclick = open;
    $('#budgetBtn').onclick = open;
    $('#budgetClose').onclick = () => $('#budgetPanel').classList.remove('open');
    document.querySelectorAll('[data-tax]').forEach(inp => {
      inp.oninput = () => { document.querySelector(`[data-taxv="${inp.dataset.tax}"]`).textContent = inp.value + '%'; };
      inp.onchange = () => this.game.act({ tool: 'tax', zone: inp.dataset.tax, value: +inp.value });
    });
  }

  renderBudget() {
    if (!$('#budgetPanel').classList.contains('open')) return;
    const w = this.game.world;
    document.querySelectorAll('[data-tax]').forEach(inp => {
      const z = inp.dataset.tax;
      if (document.activeElement !== inp) inp.value = w.tax[z];
      document.querySelector(`[data-taxv="${z}"]`).textContent = inp.value + '%';
    });
    const b = monthlyBudget(w), last = w.stats.budget;
    const row = (label, v, cls = '') => `<tr class="${cls}"><td>${label}</td><td>${v >= 0 ? '' : '−'}R$ ${fmt(Math.abs(v))}</td></tr>`;
    const net = b.income - b.cost;
    $('#budgetTable').innerHTML =
      `<tr class="head"><td colspan="2">Previsão para o próximo mês</td></tr>` +
      row('Imposto residencial', b.taxR) + row('Imposto comercial', b.taxC) + row('Imposto industrial', b.taxI) +
      row('Ruas', -b.costs.roads) + (b.costs.bridges ? row('Pontes', -b.costs.bridges) : '') +
      row('Energia e água', -b.costs.utilities) + row('Escolas, saúde e polícia', -b.costs.public) +
      (b.costs.parks ? row('Praças', -b.costs.parks) : '') +
      row('Saldo', net, net >= 0 ? 'total good' : 'total bad') +
      (last ? `<tr class="last"><td>Último mês fechado</td><td>${last.income - last.cost >= 0 ? '+' : '−'}R$ ${fmt(Math.abs(last.income - last.cost))}</td></tr>` : '');
  }

  // ---------- novo mapa ----------
  setupNewMap() {
    const g = this.game, dlg = $('#newMapDlg');
    $('#nmSize').innerHTML = MAP_SIZES.map(([n, name]) => `<option value="${n}">${name} (${n} × ${n})</option>`).join('');
    const randomSeed = () => { $('#nmSeed').value = (Math.random() * 1e9) | 0; };
    $('#newBtn').onclick = () => {
      if (g.net.active) { this.toast('Saia da sala antes de gerar outro mapa', true); return; }
      $('#menu').classList.remove('open');
      $('#nmSize').value = String(g.world.N);
      randomSeed();
      dlg.classList.add('open');
    };
    $('#nmRandom').onclick = randomSeed;
    $('#nmCancel').onclick = () => dlg.classList.remove('open');
    $('#nmGo').onclick = () => {
      const seed = parseInt($('#nmSeed').value.replace(/\D/g, ''), 10);
      dlg.classList.remove('open');
      g.newMap(Number.isFinite(seed) ? seed : undefined, +$('#nmSize').value);
    };
  }

  renderSeed() {
    const w = this.game.world;
    const size = MAP_SIZES.find(([n]) => n === w.N)?.[1] || w.N;
    $('#seedInfo').textContent = `Mapa ${size} (${w.N} × ${w.N}) · semente ${w.seed}`;
  }

  // ---------- multiplayer ----------
  setupMultiplayer(closePops) {
    const g = this.game, name = $('#mpName'), code = $('#mpCode'), msg = $('#mpMsg');
    let saved = '';
    try { saved = localStorage.getItem('littlebigcity-name') || ''; } catch { /* sem armazenamento */ }
    name.value = saved || 'Prefeito ' + (100 + ((Math.random() * 900) | 0));
    const myName = () => {
      const n = name.value.trim().slice(0, 20) || 'Prefeito';
      try { localStorage.setItem('littlebigcity-name', n); } catch { /* sem armazenamento */ }
      return n;
    };
    const busy = (text, bad) => { msg.textContent = text; msg.className = bad ? 'bad' : ''; };
    const run = async (label, fn) => {
      busy(label);
      $('#mpHost').disabled = $('#mpJoin').disabled = true;
      try { await fn(); busy(''); }
      catch (e) { busy(e.message || String(e), true); g.net.leave(true); }
      finally { $('#mpHost').disabled = $('#mpJoin').disabled = false; }
    };
    $('#mpBtn').onclick = () => { closePops($('#mp')); $('#mp').classList.toggle('open'); };
    $('#mpHost').onclick = () => run('Criando sala…', async () => {
      const c = await g.net.host(myName());
      this.toast(`Sala ${c} criada. Passe o código para os amigos.`);
    });
    const join = () => {
      if (code.value.trim().length !== 5) { busy('O código tem 5 letras', true); return; }
      run('Conectando…', () => g.net.join(code.value, myName()));
    };
    $('#mpJoin').onclick = join;
    code.addEventListener('keydown', e => { if (e.key === 'Enter') join(); });
    $('#mpLeave').onclick = () => { g.net.leave(); $('#mp').classList.remove('open'); this.toast('Você saiu da sala'); };
    $('#mpCopy').onclick = () => {
      navigator.clipboard?.writeText(g.net.code).then(() => this.toast('Código copiado'), () => {});
    };
  }

  renderMultiplayer() {
    const net = this.game.net;
    $('#mp').classList.toggle('live', net.active);
    $('#mpBtn').classList.toggle('live', net.active);
    $('#mpStatus').textContent = net.active ? `${net.code} · ${net.players.size || 1}` : 'Jogar junto';
    if (!net.active) return;
    $('#mpRole').textContent = net.role === 'host' ? 'Você é o anfitrião. Código da sala:' : 'Você está na sala:';
    $('#mpCodeShow').textContent = net.code;
    const hex = c => '#' + c.toString(16).padStart(6, '0');
    $('#mpPlayers').innerHTML = [...net.players.values()].map(p =>
      `<li><i style="background:${hex(p.color)}"></i>${escapeHtml(p.name)}<small>${p.id === 'host' ? 'anfitrião' : ''}${p.id === net.myId ? ' (você)' : ''}</small></li>`).join('');
  }

  // ---------- ferramentas ----------
  setTool(id) {
    const isSvc = SERVICES.includes(id);
    if (isSvc) {
      this.lastService = id;
      const b = document.querySelector('.tool[data-tool="services"]');
      b.innerHTML = `${svg(id)}<span>${TOOLS[id].name}</span><kbd>7</kbd>`;
      b.dataset.svc = id;
    }
    document.querySelectorAll('.tool').forEach(b => b.classList.toggle('on', b.dataset.tool === id || (isSvc && b.dataset.tool === 'services')));
    document.querySelectorAll('#svcMenu [data-svc]').forEach(b => b.classList.toggle('on', b.dataset.svc === id));
    if (!isSvc) $('#svcMenu').classList.remove('open');
    $('#hint').textContent = TOOL_HINT[id];
  }

  setSpeed(s) {
    document.querySelectorAll('[data-speed]').forEach(b => b.classList.toggle('on', +b.dataset.speed === s));
  }

  setValueMap(on) { $('#valueBtn').classList.toggle('on', on); }

  update() {
    const w = this.game.world, s = w.stats;
    const month = Math.floor(w.day / DAYS_PER_MONTH);
    $('#money').textContent = 'R$ ' + fmt(w.money);
    $('#money').classList.toggle('neg', w.money < 0);
    $('#pop').textContent = fmt(s.pop);
    $('#jobs').textContent = fmt(s.jobsC + s.jobsI);
    $('#date').textContent = `${(w.day % DAYS_PER_MONTH) + 1} ${MONTHS[month % 12]} · Ano ${Math.floor(month / 12) + 1}`;
    const mins = Math.floor(w.clock * 24 * 60), hh = Math.floor(mins / 60), mm = Math.floor(mins % 60 / 10) * 10;
    $('#clock').textContent = `${hh >= 6 && hh < 18 ? '☀' : '☾'} ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    for (const k of ['r', 'c', 'i']) {
      const v = w.demand[k], el = $('#dem-' + k);
      el.style.height = Math.abs(v) * 50 + '%';
      el.style.bottom = v >= 0 ? '50%' : 50 - Math.abs(v) * 50 + '%';
      el.classList.toggle('neg', v < 0);
    }
    if (this.infoTile != null) this.renderInfo();
    const alerts = [];
    for (const k in LACK) {
      const n = s.lack[k];
      if (!n || (k === 'power' && s.buildings < 6)) continue;
      const L = LACK[k];
      alerts.push(`<button class="${L.cls}" data-kind="${k}" title="${n} prédio${n > 1 ? 's' : ''} ${L.what}. Clique para ir até lá">${L.icon} ${n}</button>`);
    }
    const html = alerts.join('');
    if (html !== this.alertHtml) { this.alertHtml = html; $('#alerts').innerHTML = html; }
    $('#budget').textContent = s.lastIncome || s.lastCost ? `${s.lastIncome - s.lastCost >= 0 ? '+' : '−'} R$ ${fmt(Math.abs(s.lastIncome - s.lastCost))}` : '—';
    this.renderBudget();
  }

  toast(msg, bad) {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'show' + (bad ? ' bad' : '');
    clearTimeout(this.toastT);
    this.toastT = setTimeout(() => { t.className = ''; }, 2600);
  }

  costTip(x, y, p) {
    const el = $('#costTip');
    if (!p || x == null) { el.style.display = 'none'; return; }
    const n = p.tiles.filter(t => t.state === 'ok').length;
    el.style.display = 'block';
    el.style.left = x + 16 + 'px';
    el.style.top = y + 16 + 'px';
    const short = p.cost > this.game.world.money;
    el.className = short || (p.bad && !n) ? 'bad' : '';
    el.innerHTML = n ? `<b>R$ ${fmt(p.cost)}</b> · ${n} tile${n > 1 ? 's' : ''}${short ? '<br>sem dinheiro' : ''}` : (p.reason || 'nada a fazer');
  }

  showInfo(i) { this.infoTile = i; this.renderInfo(); $('#info').classList.add('open'); }
  hideInfo() { this.infoTile = null; $('#info').classList.remove('open'); }

  renderInfo() {
    const w = this.game.world, i = this.infoTile, x = i % N, y = (i / N) | 0;
    const rows = [];
    const yes = v => (v ? 'Sim' : '<em class="no">Não</em>');
    let title = TERRAIN_NAME[w.terrain[i]];
    if (w.svc[i]) title = SVC_NAME[w.svc[i]];
    else if (w.road[i]) title = w.terrain[i] === WATER ? 'Ponte' : 'Rua';
    else if (w.cons[i]) title = 'Obra';
    else if (w.bld[i]) title = ['', ['', 'Casa', 'Sobrado', 'Prédio residencial'], ['', 'Venda', 'Loja', 'Escritórios'], ['', 'Galpão', 'Fábrica', 'Indústria']][w.zone[i]][w.bld[i]];
    else if (w.obj[i]) title = OBJ_NAME[w.obj[i]];
    const z = w.zone[i];
    if (z) rows.push(['Zona', ZONE_NAME[z]]);
    if (w.bld[i]) {
      const lv = w.bld[i];
      rows.push(['Nível', lv]);
      rows.push(z === ZR ? ['Moradores', RESIDENTS[lv]] : ['Empregos', (z === ZC ? JOBS_C : JOBS_I)[lv]]);
    }
    if (w.cons[i]) rows.push(['Fica pronta em', w.cons[i] + ' dias']);
    const sv = w.svc[i];
    if (sv && sv !== SVC_PARK) rows.push(['Alcance', SVC_RADIUS[sv] + ' tiles']);
    if (sv) rows.push(['Manutenção', `R$ ${SVC_UPKEEP[sv]}/mês`]);
    if (z) {
      rows.push(['Energia', yes(w.power[i])], ['Água', yes(w.water[i])]);
      if (z === ZR) rows.push(['Escola', yes(w.cover.school[i])], ['Saúde', yes(w.cover.health[i])]);
      else rows.push(['Polícia', yes(w.cover.police[i])]);
      const lv = w.bld[i];
      if (lv && lv < 3) {
        const why = upgradeBlock(w, i, lv + 1);
        rows.push(['Próximo nível', why ? `<em class="no">Precisa de ${why}</em>` : 'Pode crescer']);
      }
    }
    if (w.terrain[i] !== WATER && !w.road[i]) {
      const v = w.value[i], label = v >= 140 ? 'Alto' : v >= 105 ? 'Médio' : 'Baixo';
      rows.push(['Valor do terreno', `${label} (${v})`]);
    }
    if (z && !w.road[i]) rows.push(['Acesso à rua', w.roadDist[i] <= ROAD_REACH ? 'Sim' : '<em class="no">Não, precisa de rua a até 2 tiles</em>']);
    rows.push(['Posição', `${x}, ${y}`]);
    $('#infoTitle').textContent = title;
    $('#infoBody').innerHTML = rows.map(([a, b]) => `<div><span>${a}</span><b>${b}</b></div>`).join('');
  }
}

function escapeHtml(t) {
  return String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

