// Interface em HTML por cima do mapa: barra superior, ferramentas, painel de informação.
import { TOOLS, fmt } from './actions.js';
import {
  N, MONTHS, DAYS_PER_MONTH, TERRAIN_NAME, OBJ_NAME, ZONE_NAME, RESIDENTS, JOBS_C, JOBS_I, ZR, ZC, ROAD_REACH, COST,
} from './config.js';

const ICONS = {
  inspect: '<circle cx="10" cy="10" r="6"/><path d="M14.5 14.5 20 20"/>',
  clear: '<path d="M5 20 15 6"/><path d="M13 4c3 0 6 2 6 5l-4 1-3-3z" fill="currentColor"/>',
  road: '<path d="M7 21 10 3M17 21 14 3"/><path d="M12 6v2M12 11v2M12 16v2" stroke-width="1.6"/>',
  zoneR: '<path d="M4 11 12 4l8 7"/><path d="M6 10v10h12V10"/><path d="M10 20v-5h4v5"/>',
  zoneC: '<path d="M4 9h16l-1-4H5z"/><path d="M5 9v11h14V9"/><path d="M9 20v-6h6v6"/>',
  zoneI: '<path d="M3 20V10l5 3V10l5 3V5h3v15z"/><path d="M3 20h18"/>',
  demolish: '<path d="M4 20h16"/><path d="M6 20V9h8v11"/><path d="m15 4 5 5M20 4l-5 5"/>',
};
const TOOL_ORDER = ['inspect', 'clear', 'road', 'zoneR', 'zoneC', 'zoneI', 'demolish'];
const TOOL_COST = {
  inspect: 'Clique num tile para ver detalhes. Arraste para mover o mapa.',
  clear: `Remove mata e pedras. Árvore R$ ${COST.clear[1]}, pedra R$ ${COST.clear[3]}.`,
  road: `R$ ${COST.road} por tile. Arraste para traçar.`,
  zoneR: `Casas aparecem sozinhas perto de ruas. R$ ${COST.zone}/tile.`,
  zoneC: `Comércio precisa de moradores por perto. R$ ${COST.zone}/tile.`,
  zoneI: `Indústria gera empregos. R$ ${COST.zone}/tile.`,
  demolish: 'Remove ruas e prédios. Num lote vazio, tira a zona.',
};

const $ = s => document.querySelector(s);

export class UI {
  constructor(game) {
    this.game = game;
    const bar = $('#tools');
    for (const [k, id] of TOOL_ORDER.entries()) {
      const b = document.createElement('button');
      b.className = 'tool';
      b.dataset.tool = id;
      b.title = `${TOOLS[id].name} (${k + 1})\n${TOOL_COST[id]}`;
      b.innerHTML = `<svg viewBox="0 0 24 24">${ICONS[id]}</svg><span>${TOOLS[id].name}</span><kbd>${k + 1}</kbd>`;
      b.onclick = () => game.setTool(id);
      bar.appendChild(b);
    }
    document.querySelectorAll('[data-speed]').forEach(b => { b.onclick = () => game.setSpeed(+b.dataset.speed); });
    $('#menuBtn').onclick = () => { $('#mp').classList.remove('open'); $('#menu').classList.toggle('open'); };
    this.setupMultiplayer();
    $('#saveBtn').onclick = () => { game.save(); this.toast('Jogo salvo'); $('#menu').classList.remove('open'); };
    const nb = $('#newBtn');
    nb.onclick = () => {
      if (game.net.active) { this.toast('Saia da sala antes de gerar outro mapa', true); return; }
      if (nb.dataset.confirm) { game.newMap(); delete nb.dataset.confirm; nb.textContent = 'Novo mapa'; $('#menu').classList.remove('open'); }
      else { nb.dataset.confirm = 1; nb.textContent = 'Confirmar? A cidade atual será perdida'; }
    };
    $('#menu').addEventListener('mouseleave', () => { delete nb.dataset.confirm; nb.textContent = 'Novo mapa'; });
    $('#infoClose').onclick = () => this.hideInfo();
  }

  setupMultiplayer() {
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
    $('#mpBtn').onclick = () => { $('#menu').classList.remove('open'); $('#mp').classList.toggle('open'); };
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

  setTool(id) {
    document.querySelectorAll('.tool').forEach(b => b.classList.toggle('on', b.dataset.tool === id));
    $('#hint').textContent = TOOL_COST[id];
  }

  setSpeed(s) {
    document.querySelectorAll('[data-speed]').forEach(b => b.classList.toggle('on', +b.dataset.speed === s));
  }

  update() {
    const w = this.game.world, s = w.stats;
    const month = Math.floor(w.day / DAYS_PER_MONTH);
    $('#money').textContent = 'R$ ' + fmt(w.money);
    $('#money').classList.toggle('neg', w.money < 0);
    $('#pop').textContent = fmt(s.pop);
    $('#jobs').textContent = fmt(s.jobsC + s.jobsI);
    $('#date').textContent = `${(w.day % DAYS_PER_MONTH) + 1} ${MONTHS[month % 12]} · Ano ${Math.floor(month / 12) + 1}`;
    for (const k of ['r', 'c', 'i']) {
      const v = w.demand[k], el = $('#dem-' + k);
      el.style.height = Math.abs(v) * 50 + '%';
      el.style.bottom = v >= 0 ? '50%' : 50 - Math.abs(v) * 50 + '%';
      el.classList.toggle('neg', v < 0);
    }
    if (this.infoTile != null) this.renderInfo();
  }

  toast(msg, bad) {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'show' + (bad ? ' bad' : '');
    clearTimeout(this.toastT);
    this.toastT = setTimeout(() => { t.className = ''; }, 2200);
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
    let title = TERRAIN_NAME[w.terrain[i]];
    if (w.road[i]) title = 'Rua';
    else if (w.cons[i]) title = 'Obra';
    else if (w.bld[i]) title = ['', ['', 'Casa', 'Sobrado', 'Prédio residencial'], ['', 'Venda', 'Loja', 'Escritórios'], ['', 'Galpão', 'Fábrica', 'Indústria']][w.zone[i]][w.bld[i]];
    else if (w.obj[i]) title = OBJ_NAME[w.obj[i]];
    if (w.zone[i]) rows.push(['Zona', ZONE_NAME[w.zone[i]]]);
    if (w.bld[i]) {
      const lv = w.bld[i], z = w.zone[i];
      rows.push(['Nível', lv]);
      rows.push(z === ZR ? ['Moradores', RESIDENTS[lv]] : ['Empregos', (z === ZC ? JOBS_C : JOBS_I)[lv]]);
    }
    if (w.cons[i]) rows.push(['Fica pronta em', w.cons[i] + ' dias']);
    if (w.zone[i] && !w.road[i]) rows.push(['Acesso à rua', w.roadDist[i] <= ROAD_REACH ? 'Sim' : 'Não, precisa de rua a até 2 tiles']);
    rows.push(['Posição', `${x}, ${y}`]);
    $('#infoTitle').textContent = title;
    $('#infoBody').innerHTML = rows.map(([a, b]) => `<div><span>${a}</span><b>${b}</b></div>`).join('');
  }
}

function escapeHtml(t) {
  return String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
