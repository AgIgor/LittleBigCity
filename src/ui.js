// Interface em HTML por cima do mapa: barra superior, ferramentas, painéis.
import { TOOLS, fmt, lockedBy } from './actions.js';
import {
  N, MONTHS, DAYS_PER_MONTH, TERRAIN_NAME, OBJ_NAME, ZONE_NAME, RESIDENTS, JOBS_C, JOBS_I, ZR, ZC, ROAD_REACH, COST,
  SVC_NAME, SVC_RADIUS, SVC_UPKEEP, SVC_PARK, WATER, MAP_SIZES, MILESTONES, WEATHER_NAME, JAM, LANDMARKS,
} from './config.js';
import { upgradeBlock, monthlyBudget } from './sim.js';

const ICONS = {
  inspect: '<circle cx="10" cy="10" r="6"/><path d="M14.5 14.5 20 20"/>',
  clear: '<path d="M5 20 15 6"/><path d="M13 4c3 0 6 2 6 5l-4 1-3-3z" fill="currentColor"/>',
  road: '<path d="M7 21 10 3M17 21 14 3"/><path d="M12 6v2M12 11v2M12 16v2" stroke-width="1.6"/>',
  avenue: '<path d="M3 21 7 3M21 21 17 3"/><path d="M12 4v16" stroke-width="2.6" stroke="#5f9a3e"/><path d="M8.5 8v2M8 14v2M15.5 8v2M16 14v2" stroke-width="1.4"/>',
  zoneR: '<path d="M4 11 12 4l8 7"/><path d="M6 10v10h12V10"/><path d="M10 20v-5h4v5"/>',
  zoneC: '<path d="M4 9h16l-1-4H5z"/><path d="M5 9v11h14V9"/><path d="M9 20v-6h6v6"/>',
  zoneI: '<path d="M3 20V10l5 3V10l5 3V5h3v15z"/><path d="M3 20h18"/>',
  demolish: '<path d="M4 20h16"/><path d="M6 20V9h8v11"/><path d="m15 4 5 5M20 4l-5 5"/>',
  power: '<path d="M13 3 6 13h5l-1 8 7-11h-5z"/>',
  water: '<path d="M12 3c3 4.5 6 7.6 6 11a6 6 0 0 1-12 0c0-3.4 3-6.5 6-11z"/>',
  garbage: '<path d="M5 7h14M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/><path d="M10 11v6M14 11v6"/>',
  recycle: '<path d="M7 10 4 15l3 5h5"/><path d="M12 4l3 5M9 4h6l3 5-2 3"/><path d="M17 20h-2l-3-5"/><path d="m14 17 3 3-3 3" transform="translate(0 -3)"/>',
  school: '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c3 2 9 2 12 0v-5"/><path d="M21 9v6"/>',
  health: '<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/>',
  police: '<path d="M12 3l8 3c0 7-3 12-8 15-5-3-8-8-8-15z"/><path d="M12 8l1.2 2.6 2.8.3-2.1 1.9.6 2.8-2.5-1.5-2.5 1.5.6-2.8-2.1-1.9 2.8-.3z"/>',
  fire: '<path d="M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z"/>',
  bus: '<rect x="5" y="3" width="14" height="15" rx="2"/><path d="M5 11h14M8 18v3M16 18v3"/><circle cx="8.5" cy="14.5" r="1"/><circle cx="15.5" cy="14.5" r="1"/>',
  hall: '<path d="M3 9l9-5 9 5z"/><path d="M5 9v9M9.5 9v9M14.5 9v9M19 9v9"/><path d="M3 20h18"/>',
  stadium: '<ellipse cx="12" cy="12" rx="9" ry="6"/><ellipse cx="12" cy="12" rx="5" ry="3"/><path d="M4 5v4M20 5v4"/>',
  tower: '<path d="M12 2v4"/><path d="M8 6h8v4H8z"/><path d="M10 10l-2 11h8l-2-11"/>',
  park: '<circle cx="12" cy="9" r="5"/><path d="M12 14v7M8 21h8"/>',
  services: '<path d="M4 20h16"/><path d="M5 20V10l7-5 7 5v10"/><path d="M10 20v-5h4v5"/>',
};
const SERVICE_GROUPS = [
  ['Infraestrutura', ['power', 'water', 'garbage', 'recycle']],
  ['Serviços públicos', ['school', 'health', 'police', 'fire', 'bus']],
  ['Marcos da cidade', ['hall', 'stadium', 'tower']],
];
const SERVICES = SERVICE_GROUPS.flatMap(g => g[1]);
const TOOL_ORDER = ['inspect', 'clear', 'road', 'avenue', 'zoneR', 'zoneC', 'zoneI', 'services', 'park', 'demolish'];
const keyOf = id => String((TOOL_ORDER.indexOf(id) + 1) % 10);
const svcIdx = id => TOOLS[id].svc;
const TOOL_HINT = {
  inspect: 'Clique num tile para ver detalhes. Arraste para mover o mapa.',
  clear: `Remove mata e pedras. Árvore R$ ${COST.clear[1]}, pedra R$ ${COST.clear[3]}.`,
  road: `R$ ${COST.road} por tile. Sobre a água vira ponte (R$ ${COST.bridge}).`,
  avenue: `Leva o dobro de carros que a rua. R$ ${COST.avenue}/tile, ou R$ ${COST.avenueUp} para alargar uma rua.`,
  zoneR: `Casas aparecem sozinhas perto de ruas. R$ ${COST.zone}/tile.`,
  zoneC: `Comércio precisa de moradores por perto. R$ ${COST.zone}/tile.`,
  zoneI: `Indústria gera empregos, mas polui o ar em volta. R$ ${COST.zone}/tile.`,
  power: 'Prédios precisam de energia para passar do nível 1. A usina polui.',
  water: 'Prédios precisam de água para chegar ao nível 3.',
  garbage: 'Todo prédio precisa de coleta de lixo para chegar ao nível 3.',
  recycle: 'Corta a poluição na área e vende recicláveis (receita por morador atendido).',
  school: 'Residências precisam de escola para chegar ao nível 3. Também valoriza o terreno.',
  health: 'Residências precisam de posto de saúde para chegar ao nível 3. Também valoriza o terreno.',
  police: 'Comércio e indústria precisam de delegacia para chegar ao nível 3. Também valoriza o terreno.',
  fire: 'Previne incêndios e apaga o fogo em poucos dias.',
  bus: 'Tira 40% dos carros das ruas em volta. Precisa ficar ao lado de uma rua.',
  hall: 'Marco da cidade: valoriza uma área grande e anima toda a demanda.',
  stadium: 'Marco da cidade: valoriza a região e anima o comércio.',
  tower: 'Marco da cidade: valoriza muito a região e atrai moradores.',
  park: `Praças valorizam o terreno, limpam o ar e recebem festas. R$ ${COST.park}/tile + R$ ${SVC_UPKEEP[SVC_PARK]}/mês por tile.`,
  demolish: 'Remove ruas, prédios e serviços. Num lote vazio, tira a zona.',
};
for (const k of SERVICES) {
  const i = svcIdx(k);
  TOOL_HINT[k] += `${SVC_RADIUS[i] ? ` Alcance ${SVC_RADIUS[i]} tiles.` : ''} R$ ${fmt(COST[k])} + R$ ${SVC_UPKEEP[i]}/mês.`;
}
const LACK = {
  power: { cls: 'pw', icon: '⚡', what: 'sem energia' },
  water: { cls: 'wt', icon: '💧', what: 'sem água' },
  garbage: { cls: 'gb', icon: '🗑', what: 'sem coleta de lixo' },
  school: { cls: 'sc', icon: '🎓', what: 'sem escola' },
  health: { cls: 'hl', icon: '✚', what: 'sem posto de saúde' },
  police: { cls: 'pl', icon: '🛡', what: 'sem delegacia' },
};
const WEATHER_ICON = ['', '⛅', '🌧', '⛈'];
const OVERLAY_NAME = { value: 'Valor', pollution: 'Poluição', traffic: 'Trânsito' };

const $ = s => document.querySelector(s);
const svg = id => `<svg viewBox="0 0 24 24">${ICONS[id]}</svg>`;

export class UI {
  constructor(game) {
    this.game = game;
    this.lastService = 'power';
    this.statsTab = 'charts';
    const bar = $('#tools');
    for (const id of TOOL_ORDER) {
      const b = document.createElement('button');
      b.className = 'tool';
      b.dataset.tool = id;
      const name = id === 'services' ? 'Serviços' : TOOLS[id].name, k = keyOf(id);
      b.title = `${name} (${k})\n${id === 'services' ? 'Energia, água, lixo, escola, saúde, polícia, bombeiros, ônibus e marcos' : TOOL_HINT[id]}`;
      b.innerHTML = `${svg(id)}<span>${name}</span><kbd>${k}</kbd>`;
      b.onclick = () => (id === 'services' ? this.toggleServices() : game.setTool(id));
      bar.appendChild(b);
    }
    this.renderServices();
    $('#svcMenu').addEventListener('click', e => {
      const b = e.target.closest('[data-svc]');
      if (!b) return;
      if (b.classList.contains('locked')) { this.toast(b.title, true); return; }
      game.setTool(b.dataset.svc);
      $('#svcMenu').classList.remove('open');
    });

    document.querySelectorAll('[data-speed]').forEach(b => { b.onclick = () => game.setSpeed(+b.dataset.speed); });
    const closePops = except => document.querySelectorAll('.pop').forEach(p => { if (p !== except) p.classList.remove('open'); });
    $('#menuBtn').onclick = () => { closePops($('#menu')); $('#menu').classList.toggle('open'); this.renderSeed(); };
    $('#mapBtn').onclick = () => { closePops($('#mapMenu')); $('#mapMenu').classList.toggle('open'); };
    $('#mapMenu').addEventListener('click', e => {
      const b = e.target.closest('[data-overlay]');
      if (!b) return;
      game.toggleOverlay(b.dataset.overlay);
      $('#mapMenu').classList.remove('open');
    });
    this.setupMultiplayer(closePops);
    this.setupBudget();
    this.setupNewMap();
    this.setupStats();
    $('#alerts').addEventListener('click', e => {
      const b = e.target.closest('[data-kind]');
      if (b) game.focusProblem(b.dataset.kind);
    });
    $('#saveBtn').onclick = () => { game.save(); this.toast('Jogo salvo'); $('#menu').classList.remove('open'); };
    const dn = $('#dayNightChk');
    dn.checked = game.dayNight;
    dn.onchange = () => game.setDayNight(dn.checked);
    $('#disastersChk').onchange = e => game.act({ tool: 'setting', key: 'disasters', value: e.target.checked });
    $('#infoClose').onclick = () => this.hideInfo();
  }

  // ---------- serviços ----------
  renderServices() {
    const w = this.game.world;
    $('#svcMenu').innerHTML = SERVICE_GROUPS.map(([title, ids]) => `<h4>${title}</h4>` + ids.map(id => {
      const i = svcIdx(id), lock = w && lockedBy(w, i), built = w && LANDMARKS[i] && w.stats.services[i];
      const info = lock ? `🔒 libera com ${fmt(lock.pop)} habitantes`
        : built ? 'já construído'
          : `R$ ${fmt(COST[id])} · R$ ${SVC_UPKEEP[i]}/mês${SVC_RADIUS[i] ? ` · raio ${SVC_RADIUS[i]}` : ''}`;
      return `<button data-svc="${id}" class="svc-${id}${lock ? ' locked' : ''}${id === this.game.tool ? ' on' : ''}" title="${lock ? `${TOOLS[id].name}: libera com ${fmt(lock.pop)} habitantes` : TOOL_HINT[id]}">${svg(id)}<span><b>${TOOLS[id].name}</b><small>${info}</small></span></button>`;
    }).join('')).join('');
  }

  toggleServices(forceOpen) {
    const m = $('#svcMenu');
    const open = forceOpen ?? !m.classList.contains('open');
    if (open) this.renderServices();
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
    const net = b.income - b.cost, c = b.costs;
    $('#budgetTable').innerHTML =
      `<tr class="head"><td colspan="2">Previsão para o próximo mês</td></tr>` +
      row('Imposto residencial', b.taxR) + row('Imposto comercial', b.taxC) + row('Imposto industrial', b.taxI) +
      (b.recycle ? row('Venda de recicláveis', b.recycle) : '') +
      row('Ruas e avenidas', -c.roads) + (c.bridges ? row('Pontes', -c.bridges) : '') +
      row('Energia, água e lixo', -c.utilities) + row('Escolas, saúde, polícia, bombeiros e ônibus', -c.public) +
      (c.landmarks ? row('Marcos da cidade', -c.landmarks) : '') +
      (c.parks ? row('Praças', -c.parks) : '') +
      row('Saldo', net, net >= 0 ? 'total good' : 'total bad') +
      (last ? `<tr class="last"><td>Último mês fechado</td><td>${last.income - last.cost >= 0 ? '+' : '−'}R$ ${fmt(Math.abs(last.income - last.cost))}</td></tr>` : '');
  }

  // ---------- estatísticas, gráficos e metas ----------
  setupStats() {
    $('#statsBtn').onclick = () => { $('#statsPanel').classList.toggle('open'); this.renderStats(true); };
    $('#statsClose').onclick = () => $('#statsPanel').classList.remove('open');
    $('#statsTabs').addEventListener('click', e => {
      const b = e.target.closest('[data-tab]');
      if (!b) return;
      this.statsTab = b.dataset.tab;
      this.renderStats(true);
    });
  }

  renderStats(force) {
    if (!$('#statsPanel').classList.contains('open')) return;
    const w = this.game.world, sig = `${this.statsTab}:${w.history.length}:${w.goals}:${w.stats.pop}:${w.counters.fires}`;
    if (!force && sig === this.statsSig) return;
    this.statsSig = sig;
    document.querySelectorAll('#statsTabs [data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === this.statsTab));
    const body = $('#statsBody');
    if (this.statsTab === 'goals') body.innerHTML = this.goalsHtml(w);
    else if (this.statsTab === 'city') body.innerHTML = this.cityHtml(w);
    else this.drawCharts(body, w);
  }

  goalsHtml(w) {
    const pop = w.stats.pop;
    return '<ul class="goals">' + MILESTONES.map((m, k) => {
      const done = k < w.goals, next = k === w.goals;
      const pct = done ? 100 : Math.min(100, (pop / m.pop) * 100);
      return `<li class="${done ? 'done' : next ? 'next' : ''}">
        <b>${done ? '🏆' : next ? '🎯' : '🔒'} ${m.name}</b><small>${fmt(m.pop)} habitantes · prêmio R$ ${fmt(m.reward)}${m.unlock ? ` · libera ${SVC_NAME[m.unlock]}` : ''}</small>
        ${done ? '' : `<i><em style="width:${pct.toFixed(1)}%"></em></i>`}</li>`;
    }).join('') + '</ul>';
  }

  cityHtml(w) {
    const s = w.stats, lv = [0, 0, 0, 0];
    let polSum = 0, polN = 0;
    for (let i = 0; i < N * N; i++) {
      if (w.bld[i]) lv[w.bld[i]]++;
      if (w.zone[i] === ZR && w.bld[i]) { polSum += w.pollution[i]; polN++; }
    }
    const pol = polN ? polSum / polN : 0;
    const rows = [
      ['População', fmt(s.pop)], ['Empregos', fmt(s.jobsC + s.jobsI)],
      ['Prédios (nível 1 / 2 / 3)', `${lv[1]} / ${lv[2]} / ${lv[3]}`],
      ['Ruas / avenidas', `${s.roads + s.bridges - s.avenues} / ${s.avenues}`],
      ['Trechos congestionados', w.jamCount ? `<em class="no">${w.jamCount}</em>` : '0'],
      ['Poluição nas residências', pol > 60 ? `<em class="no">Alta (${pol.toFixed(0)})</em>` : pol > 25 ? `Média (${pol.toFixed(0)})` : `Baixa (${pol.toFixed(0)})`],
      ['Clima', WEATHER_NAME[w.weather.kind]],
      ['Incêndios / prédios perdidos', `${w.counters.fires} / ${w.counters.burned}`],
      ['Enchentes', w.counters.floods], ['Festas', w.counters.festas],
      ['Desastres', w.disasters ? 'Ligados' : 'Desligados'],
    ];
    return `<div class="kv">${rows.map(([a, b]) => `<div><span>${a}</span><b>${b}</b></div>`).join('')}</div>`;
  }

  drawCharts(body, w) {
    const h = w.history;
    if (h.length < 2) { body.innerHTML = '<p class="note">Os gráficos aparecem depois de dois meses de jogo.</p>'; return; }
    const charts = [
      ['População e empregos', [['pop', '#5fd06a', 'População'], ['jobs', '#4fa3e8', 'Empregos']]],
      ['Caixa', [['money', '#f2c94c', 'Caixa']], true],
      ['Receita e despesa por mês', [['inc', '#5fd06a', 'Receita'], ['cost', '#eb5757', 'Despesa']], true],
      ['Demanda', [['r', '#5fd06a', 'R'], ['c', '#4fa3e8', 'C'], ['i', '#f0c040', 'I']], false, [-1, 1]],
    ];
    body.innerHTML = charts.map(([title, series], k) =>
      `<div class="chart"><h4>${title}<span>${series.map(([, col, name]) => `<i style="background:${col}"></i>${name}`).join(' ')}</span></h4><canvas data-chart="${k}"></canvas></div>`).join('');
    charts.forEach(([, series, money, range], k) => {
      const cv = body.querySelector(`[data-chart="${k}"]`);
      const dpr = Math.min(2, window.devicePixelRatio || 1), W = cv.clientWidth || 300, H = 96;
      cv.width = W * dpr; cv.height = H * dpr; cv.style.height = H + 'px';
      const x = cv.getContext('2d');
      x.scale(dpr, dpr);
      let lo = range ? range[0] : Infinity, hi = range ? range[1] : -Infinity;
      if (!range) for (const [key] of series) for (const e of h) { lo = Math.min(lo, e[key] ?? 0); hi = Math.max(hi, e[key] ?? 0); }
      if (!range) { lo = Math.min(0, lo); if (hi === lo) hi = lo + 1; }
      const L = 44, R = 6, T = 6, B = 16;
      const px = n => L + (n / (h.length - 1)) * (W - L - R), py = v => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
      x.font = '10px system-ui, sans-serif'; x.fillStyle = 'rgba(230,225,210,.6)'; x.strokeStyle = 'rgba(255,255,255,.08)';
      for (const v of [lo, (lo + hi) / 2, hi]) {
        x.beginPath(); x.moveTo(L, py(v)); x.lineTo(W - R, py(v)); x.stroke();
        const t = range ? v.toFixed(1) : Math.abs(v) >= 10000 ? (v / 1000).toFixed(0) + 'k' : Math.round(v).toString();
        x.fillText((money && !range ? 'R$' : '') + t, 2, py(v) + 3);
      }
      if (lo < 0 && hi > 0) { x.strokeStyle = 'rgba(255,255,255,.25)'; x.beginPath(); x.moveTo(L, py(0)); x.lineTo(W - R, py(0)); x.stroke(); }
      const first = h[0].d, last = h[h.length - 1].d;
      const year = d => `Ano ${Math.floor(d / DAYS_PER_MONTH / 12) + 1}`;
      x.fillText(year(first), L, H - 3);
      x.textAlign = 'right'; x.fillText(year(last), W - R, H - 3); x.textAlign = 'left';
      for (const [key, col] of series) {
        x.strokeStyle = col; x.lineWidth = 1.8; x.beginPath();
        h.forEach((e, n) => (n ? x.lineTo(px(n), py(e[key] ?? 0)) : x.moveTo(px(n), py(e[key] ?? 0))));
        x.stroke();
      }
    });
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
    $('#disastersChk').checked = w.disasters;
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
      b.innerHTML = `${svg(id)}<span>${TOOLS[id].name}</span><kbd>${keyOf('services')}</kbd>`;
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

  setOverlay(kind) {
    $('#mapBtn').classList.toggle('on', !!kind);
    $('#mapLabel').textContent = kind ? OVERLAY_NAME[kind] : 'Mapas';
    document.querySelectorAll('#mapMenu [data-overlay]').forEach(b => b.classList.toggle('on', b.dataset.overlay === kind));
  }

  update() {
    const w = this.game.world, s = w.stats;
    const month = Math.floor(w.day / DAYS_PER_MONTH);
    $('#money').textContent = 'R$ ' + fmt(w.money);
    $('#money').classList.toggle('neg', w.money < 0);
    $('#pop').textContent = fmt(s.pop);
    $('#jobs').textContent = fmt(s.jobsC + s.jobsI);
    $('#date').textContent = `${(w.day % DAYS_PER_MONTH) + 1} ${MONTHS[month % 12]} · Ano ${Math.floor(month / 12) + 1}`;
    const mins = Math.floor(w.clock * 24 * 60), hh = Math.floor(mins / 60), mm = Math.floor(mins % 60 / 10) * 10;
    const icon = WEATHER_ICON[w.weather.kind] || (hh >= 6 && hh < 18 ? '☀' : '☾');
    $('#clock').textContent = `${icon} ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    $('#clockStat').title = `Hora do dia · ${WEATHER_NAME[w.weather.kind]}`;
    for (const k of ['r', 'c', 'i']) {
      const v = w.demand[k], el = $('#dem-' + k);
      el.style.height = Math.abs(v) * 50 + '%';
      el.style.bottom = v >= 0 ? '50%' : 50 - Math.abs(v) * 50 + '%';
      el.classList.toggle('neg', v < 0);
    }
    if (this.infoTile != null) this.renderInfo();
    const alerts = [];
    if (s.burning) alerts.push(`<button class="fr" data-kind="burning" title="${s.burning} prédio${s.burning > 1 ? 's' : ''} pegando fogo. Clique para ir até lá">🔥 ${s.burning}</button>`);
    if (w.festa) alerts.push(`<button class="fs" data-kind="festa" title="Festa na praça! Clique para ver">🎉</button>`);
    for (const k in LACK) {
      const n = s.lack[k];
      if (!n || (k === 'power' && s.buildings < 6)) continue;
      const L = LACK[k];
      alerts.push(`<button class="${L.cls}" data-kind="${k}" title="${n} prédio${n > 1 ? 's' : ''} ${L.what}. Clique para ir até lá">${L.icon} ${n}</button>`);
    }
    if (w.jamCount) alerts.push(`<button class="jm" data-kind="jam" title="${w.jamCount} trecho${w.jamCount > 1 ? 's' : ''} de rua congestionado${w.jamCount > 1 ? 's' : ''}. Clique para ver">🚗 ${w.jamCount}</button>`);
    const html = alerts.join('');
    if (html !== this.alertHtml) { this.alertHtml = html; $('#alerts').innerHTML = html; }
    $('#budget').textContent = s.lastIncome || s.lastCost ? `${s.lastIncome - s.lastCost >= 0 ? '+' : '−'} R$ ${fmt(Math.abs(s.lastIncome - s.lastCost))}` : '—';
    this.renderBudget();
    this.renderStats();
  }

  toast(msg, bad, ms = 2600) {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'show' + (bad ? ' bad' : '');
    clearTimeout(this.toastT);
    this.toastT = setTimeout(() => { t.className = ''; }, ms);
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
    else if (w.road[i]) title = w.terrain[i] === WATER ? 'Ponte' : w.road[i] === 2 ? 'Avenida' : 'Rua';
    else if (w.cons[i]) title = 'Obra';
    else if (w.bld[i]) title = ['', ['', 'Casa', 'Sobrado', 'Prédio residencial'], ['', 'Venda', 'Loja', 'Escritórios'], ['', 'Galpão', 'Fábrica', 'Indústria']][w.zone[i]][w.bld[i]];
    else if (w.obj[i]) title = OBJ_NAME[w.obj[i]];
    if (w.fire[i]) rows.push(['Situação', `<em class="no">🔥 Em chamas há ${w.fire[i]} dia${w.fire[i] > 1 ? 's' : ''}${w.cover.fire[i] ? ' (bombeiros a caminho)' : ''}</em>`]);
    const z = w.zone[i];
    if (z) rows.push(['Zona', ZONE_NAME[z]]);
    if (w.bld[i]) {
      const lv = w.bld[i];
      rows.push(['Nível', lv]);
      rows.push(z === ZR ? ['Moradores', RESIDENTS[lv]] : ['Empregos', (z === ZC ? JOBS_C : JOBS_I)[lv]]);
    }
    if (w.cons[i]) rows.push(['Fica pronta em', w.cons[i] + ' dias']);
    const sv = w.svc[i];
    if (sv && SVC_RADIUS[sv]) rows.push(['Alcance', SVC_RADIUS[sv] + ' tiles']);
    if (sv) rows.push(['Manutenção', `R$ ${SVC_UPKEEP[sv]}/mês`]);
    if (w.road[i]) {
      const j = w.jam[i];
      rows.push(['Movimento', j > JAM ? `<em class="no">Congestionada (${j}%)</em>` : `${j}% da capacidade`]);
      if (w.cover.bus[i]) rows.push(['Ônibus', 'Sim']);
    }
    if (z) {
      rows.push(['Energia', yes(w.power[i])], ['Água', yes(w.water[i])], ['Coleta de lixo', yes(w.cover.garbage[i])]);
      if (z === ZR) rows.push(['Escola', yes(w.cover.school[i])], ['Saúde', yes(w.cover.health[i])]);
      else rows.push(['Polícia', yes(w.cover.police[i])]);
      rows.push(['Bombeiros', w.cover.fire[i] ? 'Sim' : 'Não']);
      if (w.jam[i] > JAM) rows.push(['Trânsito', `<em class="no">Rua congestionada (${w.jam[i]}%)</em>`]);
      const lv = w.bld[i];
      if (lv && lv < 3) {
        const why = upgradeBlock(w, i, lv + 1);
        rows.push(['Próximo nível', why ? `<em class="no">Precisa de ${why}</em>` : 'Pode crescer']);
      }
    }
    if (w.terrain[i] !== WATER && !w.road[i]) {
      const v = w.value[i], label = v >= 140 ? 'Alto' : v >= 105 ? 'Médio' : 'Baixo';
      rows.push(['Valor do terreno', `${label} (${v})`]);
      const p = w.pollution[i];
      rows.push(['Poluição', p > 70 ? `<em class="no">Alta (${p})</em>` : p > 25 ? `Média (${p})` : `Baixa (${p})`]);
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
