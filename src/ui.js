// Interface em HTML por cima do mapa: barra superior, catálogo, painéis.
import { fmt } from './actions.js';
import { N, MONTHS, DAYS_PER_MONTH, TERRAIN_NAME, OBJ_NAME, WATER, MAP_SIZES, WEATHER_NAME, SPEEDS, COST } from './config.js';
import { CATS, CATALOG, ITEMS, BY_KEY, xpForLevel, UPGRADES } from './catalog.js';
import { activeMissions, missionProgress } from './missions.js';

const ICONS = {
  move: '<path d="M12 3v18M3 12h18"/><path d="m9 6 3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/>',
  inspect: '<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12M11 11.5v-2a1.5 1.5 0 0 1 3 0V12M14 10.5a1.5 1.5 0 0 1 3 0V12M17 11.5a1.5 1.5 0 0 1 3 0V16a5 5 0 0 1-5 5h-2a5 5 0 0 1-4-2l-3.5-4.5a1.5 1.5 0 0 1 2.3-1.9L8 14"/>',
  road: '<path d="M7 21 10 3M17 21 14 3"/><path d="M12 6v2M12 11v2M12 16v2" stroke-width="1.6"/>',
  home: '<path d="M4 11 12 4l8 7"/><path d="M6 10v10h12V10"/><path d="M10 20v-5h4v5"/>',
  shop: '<path d="M4 9h16l-1-4H5z"/><path d="M5 9v11h14V9"/><path d="M9 20v-6h6v6"/>',
  work: '<path d="M3 20V10l5 3V10l5 3V5h3v15z"/><path d="M3 20h18"/>',
  deco: '<circle cx="12" cy="9" r="5"/><path d="M12 14v7M8 21h8"/>',
  special: '<path d="M3 9l9-5 9 5z"/><path d="M5 9v9M9.5 9v9M14.5 9v9M19 9v9"/><path d="M3 20h18"/>',
  demolish: '<path d="M4 20h16"/><path d="M6 20V9h8v11"/><path d="m15 4 5 5M20 4l-5 5"/>',
};
const TOOLBAR = [['inspect', 'Mão'], ['move', 'Mover'], ...CATS.map(c => [c.id, c.name]), ['demolish', 'Demolir']];
const HINT = {
  inspect: 'Toque nas moedas para coletar. Clique num prédio para ver detalhes. Arraste para mover o mapa.',
  move: 'Clique numa construção e depois no lugar novo. Mover é grátis (só paga para tirar mato).',
  demolish: `Remove prédios, ruas e árvores. R$ ${COST.demolish} por tile.`,
};
// Miniatura de cada item: sprite do próprio item (variante 0)
const THUMB_KEY = it => it.tree ? 'tree3' : it.road === 1 ? 'road5' : it.road === 2 ? 'ave5' : (/^b\d\d$/.test(it.sprite) ? it.sprite + '_0' : it.sprite);
const secs = days => Math.round(days * SPEEDS[1]);

const $ = s => document.querySelector(s);
const svg = id => `<svg viewBox="0 0 24 24">${ICONS[id]}</svg>`;

// O que o item faz, em poucas palavras
function itemInfo(it) {
  if (it.info) return it.info;
  const out = [];
  if (it.pop) out.push(`+${it.pop} moradores`);
  if (it.workers) out.push(`${it.workers} trabalhadores`);
  if (it.income) out.push(`R$ ${it.income} a cada ${secs(it.period)} s`);
  if (it.boost) out.push(`+${it.boost.pct}% de renda em volta`);
  return out.join(' · ');
}

export class UI {
  constructor(game) {
    this.game = game;
    this.cat = null;
    this.thumbs = {};
    const bar = $('#tools');
    TOOLBAR.forEach(([id, name], k) => {
      const b = document.createElement('button');
      b.className = 'tool';
      b.dataset.tool = id;
      b.title = `${name} (${k + 1})`;
      b.innerHTML = `${svg(id)}<span>${name}</span><kbd>${k + 1}</kbd>`;
      b.onclick = () => {
        if (id === 'inspect' || id === 'demolish' || id === 'move') { this.closeCat(); game.setTool(id); }
        else this.openCat(id, true);
      };
      bar.appendChild(b);
    });
    $('#catMenu').addEventListener('click', e => {
      const b = e.target.closest('[data-item]');
      if (!b) return;
      if (b.classList.contains('locked')) { this.toast(b.dataset.lock, true); return; }
      game.setTool('build', b.dataset.item);
      this.closeCat();
    });

    document.querySelectorAll('[data-speed]').forEach(b => { b.onclick = () => game.setSpeed(+b.dataset.speed); });
    const closePops = except => document.querySelectorAll('.pop').forEach(p => { if (p !== except) p.classList.remove('open'); });
    $('#menuBtn').onclick = () => { closePops($('#menu')); $('#menu').classList.toggle('open'); this.renderSeed(); };
    this.setupMultiplayer(closePops);
    this.setupNewMap();
    $('#collectBtn').onclick = () => game.collectAll();
    $('#saveBtn').onclick = () => { game.save(); this.toast('Jogo salvo'); $('#menu').classList.remove('open'); };
    const dn = $('#dayNightChk');
    dn.checked = game.dayNight;
    dn.onchange = () => game.setDayNight(dn.checked);
    $('#infoClose').onclick = () => this.hideInfo();
    this.setupMissions();
    $('#upBtn').onclick = () => {
      const open = !$('#upPanel').classList.contains('open');
      this.hideInfo();
      $('#upPanel').classList.toggle('open', open);
      this.upSig = '';
      this.renderUpgrades();
    };
    $('#upClose').onclick = () => $('#upPanel').classList.remove('open');
    $('#upList').addEventListener('click', e => {
      const b = e.target.closest('[data-up]');
      if (b && !b.disabled) game.act({ tool: 'upgrade', key: b.dataset.up });
    });
  }

  // ---------- missões (opcionais) ----------
  setupMissions() {
    let closed = false;
    try { closed = localStorage.getItem('littlebigcity-missions') === 'closed'; } catch { /* sem armazenamento */ }
    $('#missions').classList.toggle('closed', closed);
    $('#missionsHead').onclick = () => {
      const c = $('#missions').classList.toggle('closed');
      try { localStorage.setItem('littlebigcity-missions', c ? 'closed' : 'open'); } catch { /* sem armazenamento */ }
    };
    $('#missionList').addEventListener('click', e => {
      const b = e.target.closest('[data-claim]');
      if (b) this.game.act({ tool: 'claim', id: +b.dataset.claim });
    });
  }

  renderMissions() {
    const w = this.game.world, list = activeMissions(w);
    const rows = list.map(ms => {
      const p = Math.min(ms.n, missionProgress(w, ms)), done = p >= ms.n;
      return { ms, p, done };
    });
    const ready = rows.filter(r => r.done).length;
    const sig = rows.map(r => `${r.ms.id}:${r.p}`).join(',');
    $('#missionsBadge').textContent = ready || '';
    if (sig === this.missionSig) return;
    this.missionSig = sig;
    $('#missions').style.display = list.length ? '' : 'none';
    $('#missionList').innerHTML = rows.map(({ ms, p, done }) => `<li class="${done ? 'done' : ''}">
      <span>${ms.text}</span>
      ${done ? `<button data-claim="${ms.id}">Receber R$ ${fmt(ms.money)}</button>`
        : `<i><em style="width:${(p / ms.n * 100).toFixed(0)}%"></em></i><small>${fmt(p)} / ${fmt(ms.n)} · prêmio R$ ${fmt(ms.money)}</small>`}
    </li>`).join('');
  }

  // ---------- melhorias ----------
  renderUpgrades() {
    if (!$('#upPanel').classList.contains('open')) return;
    const w = this.game.world;
    const sig = `${w.level}:${w.money}:${JSON.stringify(w.upgrades)}`;
    if (sig === this.upSig) return;
    this.upSig = sig;
    $('#upList').innerHTML = UPGRADES.map(up => {
      const n = w.upgrades[up.key], max = n >= up.cost.length;
      const pips = up.cost.map((_, k) => `<i class="${k < n ? 'on' : ''}"></i>`).join('');
      let btn;
      if (max) btn = '<button disabled>No máximo</button>';
      else if (w.level < up.level[n]) btn = `<button disabled>🔒 Nível ${up.level[n]}</button>`;
      else btn = `<button data-up="${up.key}" ${w.money < up.cost[n] ? 'disabled' : ''}>Comprar · R$ ${fmt(up.cost[n])}</button>`;
      return `<li>
        <div class="uphead"><b>${up.icon} ${up.name}</b><span class="pips">${pips}</span></div>
        <small>${n ? `Agora: ${up.info(n)}.` : 'Ainda não comprada.'}${max ? '' : ` Próximo: ${up.info(n + 1)}.`}</small>
        ${btn}
      </li>`;
    }).join('');
  }

  moveHint(name) { $('#hint').textContent = `Movendo: ${name}. Clique no lugar novo (Esc solta).`; }

  // ---------- catálogo ----------
  openCat(cat, toggle) {
    const m = $('#catMenu');
    if (toggle && this.cat === cat && m.classList.contains('open')) { this.closeCat(); return; }
    this.cat = cat;
    this.renderCatalog();
    m.classList.add('open');
    document.querySelectorAll('.tool').forEach(b => b.classList.toggle('open', b.dataset.tool === cat));
  }
  closeCat() {
    $('#catMenu').classList.remove('open');
    document.querySelectorAll('.tool').forEach(b => b.classList.remove('open'));
  }

  renderCatalog() {
    if (!this.cat) return;
    const w = this.game.world, scene = this.game.scene;
    const items = CATALOG.filter(it => it.cat === this.cat);
    const title = CATS.find(c => c.id === this.cat).name;
    $('#catMenu').innerHTML = `<h4>${title}</h4><div class="items">` + items.map(it => {
      const key = THUMB_KEY(it);
      this.thumbs[key] ??= scene.thumb(key);
      const locked = it.level > w.level, poor = !locked && it.cost > w.money;
      const lock = `Libera no nível ${it.level}`;
      return `<button data-item="${it.key}" data-lock="${lock}" class="${locked ? 'locked' : ''}${poor ? ' poor' : ''}${this.game.item === it.key ? ' on' : ''}" title="${it.name}: ${itemInfo(it)}">
        <img src="${this.thumbs[key]}" alt="">
        <b>${it.name}</b>
        <small>${locked ? `🔒 nível ${it.level}` : `R$ ${fmt(it.cost)}`}</small>
        <em>${itemInfo(it)}</em>
      </button>`;
    }).join('') + '</div>';
  }

  // Ao subir de nível: o catálogo aberto mostra os itens liberados
  levelUp() { this.renderCatalog(); }

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
  setTool(id, itemKey) {
    const it = BY_KEY[itemKey];
    const active = id === 'build' ? it?.cat : id;
    document.querySelectorAll('.tool').forEach(b => b.classList.toggle('on', b.dataset.tool === active));
    $('#hint').textContent = id === 'build' && it
      ? `${it.name}: R$ ${fmt(it.cost)}${it.area || it.road ? ' por tile (arraste)' : ''}. ${itemInfo(it)}. Esc volta para a mão.`
      : HINT[id];
    this.renderCatalog();
  }

  setSpeed(s) {
    document.querySelectorAll('[data-speed]').forEach(b => b.classList.toggle('on', +b.dataset.speed === s));
  }

  update() {
    const w = this.game.world, s = w.stats;
    const month = Math.floor(w.day / DAYS_PER_MONTH);
    $('#money').textContent = 'R$ ' + fmt(w.money);
    $('#pop').textContent = fmt(s.pop);
    const free = w.freeWorkers;
    $('#workers').textContent = fmt(Math.max(0, free));
    $('#workers').classList.toggle('low', free < 4);
    $('#levelNum').textContent = w.level;
    $('#xpBar').style.width = Math.min(100, (w.xp / xpForLevel(w.level)) * 100) + '%';
    $('.level').title = `Nível ${w.level}: ${fmt(w.xp)} de ${fmt(xpForLevel(w.level))} de experiência. Construir e coletar dá experiência`;
    $('#date').textContent = `${(w.day % DAYS_PER_MONTH) + 1} ${MONTHS[month % 12]} · Ano ${Math.floor(month / 12) + 1}`;
    const mins = Math.floor(w.clock * 24 * 60), hh = Math.floor(mins / 60), mm = Math.floor(mins % 60 / 10) * 10;
    const icon = ['', '⛅', '🌧', '⛈'][w.weather.kind] || (hh >= 6 && hh < 18 ? '☀' : '☾');
    $('#clock').textContent = `${icon} ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    $('#clockStat').title = `Hora do dia · ${WEATHER_NAME[w.weather.kind]}`;
    $('#collectN').textContent = s.coins;
    this.renderMissions();
    this.renderUpgrades();
    $('#collectBtn').classList.toggle('ready', s.coins > 0);
    $('#collectBtn').classList.toggle('auto', w.upgrades.auto > 0);
    $('#collectBtn').title = w.upgrades.auto ? 'Coletar todas as moedas agora (C). O coletor automático também recolhe sozinho' : 'Coletar todas as moedas (C)';
    if (this.infoTile != null) this.renderInfo();
    // dinheiro mudou: atualiza o "pode comprar" do catálogo aberto
    if ($('#catMenu').classList.contains('open') && (w.money !== this.lastMoney || w.level !== this.lastLevel)) {
      this.lastMoney = w.money; this.lastLevel = w.level;
      this.renderCatalog();
    }
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
    el.innerHTML = n ? `<b>R$ ${fmt(p.cost)}</b>${n > 1 ? ` · ${n} tiles` : ''}${short ? '<br>moedas insuficientes' : ''}` : (p.reason || 'nada a fazer');
  }

  showInfo(i) { this.infoTile = i; this.renderInfo(); $('#upPanel').classList.remove('open'); $('#info').classList.add('open'); }
  hideInfo() { this.infoTile = null; $('#info').classList.remove('open'); }

  renderInfo() {
    const w = this.game.world, i = this.infoTile;
    const rows = [];
    const it = ITEMS[w.item[i]];
    let title = TERRAIN_NAME[w.terrain[i]];
    if (it) {
      title = it.name;
      if (w.cons[i]) rows.push(['Obra', `fica pronta em ${secs(w.cons[i])} s`]);
      if (it.pop) rows.push(['Moradores', it.pop]);
      if (it.workers) rows.push(['Trabalhadores', it.workers]);
      if (it.income) {
        rows.push(['Rende', `R$ ${fmt(w.payout(i))} a cada ${secs(it.period)} s`]);
        if (!w.cons[i]) rows.push(['Próxima moeda', w.coin[i] ? '<em class="yes">pronta! toque para coletar</em>' : `em ${secs(w.timer[i])} s`]);
      }
      if (it.boost) rows.push(['Bônus em volta', `+${it.boost.pct}% até ${it.boost.r} tiles`]);
    } else if (w.road[i]) title = w.terrain[i] === WATER ? 'Ponte' : w.road[i] === 2 ? 'Avenida' : 'Rua';
    else if (w.obj[i]) title = OBJ_NAME[w.obj[i]];
    if (w.terrain[i] !== WATER && !w.road[i]) rows.push(['Bônus de renda aqui', `+${w.boost[i]}%`]);
    if (!w.inArea(i % N, (i / N) | 0)) rows.push(['Área', 'fora da cidade (cresce com o nível)']);
    $('#infoTitle').textContent = title;
    $('#infoBody').innerHTML = rows.map(([a, b]) => `<div><span>${a}</span><b>${b}</b></div>`).join('');
  }
}

function escapeHtml(t) {
  return String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
