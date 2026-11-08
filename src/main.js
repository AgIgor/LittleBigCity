import { Application } from '../lib/pixi.min.mjs';
import { N, SPEEDS, DAY_CYCLE_SECONDS, SVC_KEY, SVC_NAME, SVC_RADIUS, MILESTONES, JAM } from './config.js';
import { World } from './world.js';
import { apply, fmt, TOOLS } from './actions.js';
import { tickDay, floodTiles } from './sim.js';
import { buildAtlas } from './atlas.js';
import { Scene, ambientAt } from './render.js';
import { Input } from './input.js';
import { UI } from './ui.js';
import { Net } from './net.js';
import { Traffic } from './traffic.js';

const SAVE_KEY = 'littlebigcity-save-v1';
const PREFS_KEY = 'littlebigcity-prefs';
const SPEED_MUL = [0, 1, 1.5, 2.2];

function loadPrefs() {
  try { return JSON.parse(localStorage.getItem(PREFS_KEY)) || {}; } catch { return {}; }
}
function savePrefs(p) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch { /* sem armazenamento */ }
}

function loadSave() {
  try { return World.deserialize(JSON.parse(localStorage.getItem(SAVE_KEY))); } catch { return null; }
}

const game = {
  tool: 'inspect',
  speed: 1,
  lastSpeed: 1,
  acc: 0,

  prefs: loadPrefs(),
  get dayNight() { return this.prefs.dayNight !== false; },

  setTool(id) {
    if (id === 'services') { this.ui.toggleServices(true); return; }
    if (!TOOLS[id]) return;
    this.tool = id;
    this.ui.setTool(id);
    this.updateCoverage();
    this.input?.refresh();
  },
  // fromNet: a mudança veio do anfitrião. Um convidado só pede, quem decide é o anfitrião.
  setSpeed(s, fromNet) {
    if (this.net?.isClient && !fromNet) { this.net.sendSpeed(s); return; }
    this.speed = s;
    if (s) this.lastSpeed = s;
    this.ui.setSpeed(s);
  },
  togglePause() { this.setSpeed(this.speed ? 0 : this.lastSpeed); },

  act(action) {
    if (this.net.isClient) { this.net.sendAction(action); return; }
    const r = apply(this.world, action);
    if (!r.ok) { this.ui.toast(r.msg, true); return; }
    if (r.cost) this.ui.toast(`− R$ ${fmt(r.cost)}`);
    this.ui.update();
  },
  setDayNight(on) {
    this.prefs.dayNight = on;
    savePrefs(this.prefs);
  },
  // Mapas de calor: 'value', 'pollution', 'traffic'; o mesmo de novo desliga
  toggleOverlay(kind, force) {
    const on = force ?? this.scene.overlay !== kind;
    this.scene.setOverlay(on ? kind : null);
    this.ui.setOverlay(on ? kind : null);
    if (!on) return;
    this.ui.toast({
      value: 'Valor do terreno: verde valorizado, vermelho desvalorizado. Praças, água, serviços e marcos valorizam; poluição desvaloriza.',
      pollution: 'Poluição: verde é ar limpo, roxo muito poluído. Indústria, usina e ruas paradas poluem; mata, praças e reciclagem limpam.',
      traffic: 'Trânsito: ruas em vermelho estão congestionadas. Use avenidas ou pontos de ônibus.',
    }[kind], false, 5000);
  },

  // Acontecimentos da simulação (no anfitrião vêm do tickDay; nos convidados, pela rede)
  onEvent(ev) {
    const w = this.world, ui = this.ui, now = performance.now();
    const once = (key, ms) => { this.evT = this.evT || {}; if (now - (this.evT[key] || 0) < ms) return false; this.evT[key] = now; return true; };
    switch (ev.type) {
      case 'month': {
        const net = ev.income - ev.cost;
        ui.toast(`Mês fechado: ${net >= 0 ? '+' : '−'} R$ ${fmt(Math.abs(net))}`, net < 0);
        if (!this.net.isClient) this.save();
        ui.renderStats();
        break;
      }
      case 'goal': {
        const m = MILESTONES[ev.n];
        ui.toast(`🏆 Meta alcançada: ${m.name} (${fmt(m.pop)} habitantes). Prêmio de R$ ${fmt(m.reward)}${m.unlock ? `. Liberou: ${SVC_NAME[m.unlock]} (em Serviços)` : ''}!`, false, 7000);
        ui.renderStats();
        break;
      }
      case 'fire':
        if (once('fire', 8000)) ui.toast(w.cover.fire[ev.i] ? '🔥 Incêndio! Os bombeiros estão a caminho.' : '🔥 Incêndio! Sem bombeiros por perto o fogo pode se espalhar. Clique no alerta 🔥 para ver.', true, 5000);
        break;
      case 'burned':
        if (once('burned', 8000)) ui.toast('Um prédio foi destruído pelo fogo.', true);
        break;
      case 'flood':
        this.scene.showFlood(floodTiles(w, ev.x, ev.y));
        ui.toast(`🌊 Enchente perto do rio! ${ev.hit} prédio${ev.hit === 1 ? '' : 's'} atingido${ev.hit === 1 ? '' : 's'}.`, true, 6000);
        break;
      case 'festa':
        ui.toast(`🎉 ${['Festa junina', 'Show na praça', 'Feira de artesanato'][ev.kind || 0]}! Moradores e comércio animados por alguns dias.`, false, 5000);
        break;
      case 'weather':
        if (ev.kind === 3) ui.toast('⛈ Tempestade chegando: risco de enchente perto do rio.', true, 4500);
        else if (ev.kind === 2 && once('rain', 60000)) ui.toast('🌧 Começou a chover.');
        break;
    }
  },

  // Círculos de alcance: aparecem com a ferramenta do serviço escolhida ou
  // por alguns segundos depois de clicar num alerta
  updateCoverage() {
    const toolSvc = TOOLS[this.tool]?.svc;
    const kind = toolSvc && SVC_RADIUS[toolSvc] ? toolSvc : this.coverageUntil > performance.now() ? this.coverageFlash : 0;
    const sig = kind + ':' + this.world.stats.services.join(',');
    if (sig !== this.coverageSig) { this.coverageSig = sig; this.scene.showCoverage(kind); }
  },

  // Leva a câmera até a região com mais prédios sem o serviço; cliques
  // seguidos passam para a próxima região
  focusProblem(kind) {
    const w = this.world, C = 10, cells = new Map();
    if (kind === 'festa') {
      if (!w.festa) return;
      const x = w.festa.i % N, y = (w.festa.i / N) | 0;
      this.scene.setCamera((x - y) * 64, (x + y + 1) * 32, Math.max(this.scene.cam.zoom, 0.8));
      return;
    }
    const test = kind === 'burning' ? i => w.fire[i] > 0
      : kind === 'jam' ? i => w.road[i] && w.jam[i] > JAM
        : i => w.lacks(i, kind);
    for (let i = 0; i < N * N; i++) {
      if (!test(i)) continue;
      const x = i % N, y = (i / N) | 0, key = ((y / C) | 0) * 100 + ((x / C) | 0);
      const c = cells.get(key) || { n: 0, sx: 0, sy: 0 };
      c.n++; c.sx += x; c.sy += y;
      cells.set(key, c);
    }
    const list = [...cells.values()].sort((a, b) => b.n - a.n);
    if (!list.length) return;
    this.problemIdx = this.problemIdx || {};
    const k = (this.problemIdx[kind] ?? -1) + 1 < list.length ? (this.problemIdx[kind] ?? -1) + 1 : 0;
    this.problemIdx[kind] = k;
    const c = list[k], x = c.sx / c.n, y = c.sy / c.n;
    this.scene.setCamera((x - y) * 64, (x + y + 1) * 32, Math.max(this.scene.cam.zoom, 0.6));
    if (kind === 'burning') {
      this.ui.toast(`Incêndio ${k + 1} de ${list.length}. Bombeiros por perto apagam o fogo; demolir os vizinhos impede que ele se espalhe.`, true);
      return;
    }
    if (kind === 'jam') {
      this.toggleOverlay('traffic', true);
      this.ui.toast(`Congestionamento ${k + 1} de ${list.length}: ${c.n} trecho${c.n > 1 ? 's' : ''} de rua parado${c.n > 1 ? 's' : ''}. Troque por avenida (tecla 4) ou ponha pontos de ônibus.`);
      return;
    }
    const svc = SVC_KEY.indexOf(kind);
    this.coverageFlash = svc;
    this.coverageUntil = performance.now() + 6000;
    this.updateCoverage();
    const name = SVC_NAME[svc];
    this.ui.toast(`Região ${k + 1} de ${list.length}: ${c.n} prédio${c.n > 1 ? 's' : ''} sem ${name.toLowerCase()} por perto. Escolha em Serviços (tecla 8).`);
  },

  inspect({ x, y }) {
    if (!this.world.inside(x, y)) { this.ui.hideInfo(); return; }
    this.ui.showInfo(y * N + x);
  },

  save() {
    if (this.net?.isClient) return;   // a cidade é do anfitrião
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.world.serialize())); } catch { /* armazenamento indisponível */ }
  },
  newMap(seed = (Math.random() * 1e9) | 0, size = this.world?.N || 128) {
    const w = new World(seed, size);
    w.generate();
    this.useWorld(w);
    this.save();
    this.ui.toast('Novo mapa gerado');
  },
  loadOwnCity() {
    const w = loadSave();
    if (w) this.useWorld(w);
    else this.newMap();
  },
  useWorld(w) {
    this.world = w;
    this.scene.build(w);
    this.traffic?.reset();
    this.coverageSig = null;
    this.scene.refreshBadges();
    this.focusStart();
    this.ui.hideInfo();
    this.ui.update();
  },
  // Começa olhando para um ponto de terra firme perto do centro
  focusStart() {
    const w = this.world;
    let best = null, bd = Infinity;
    for (let i = 0; i < N * N; i++) {
      if (w.terrain[i] === 0) continue;
      const x = i % N, y = (i / N) | 0, d = (x - N / 2) ** 2 + (y - N / 2) ** 2;
      if (d < bd) { bd = d; best = [x, y]; }
    }
    const [x, y] = best || [N / 2, N / 2];
    this.scene.setCamera((x - y) * 64, (x + y) * 32, 0.55);
  },
};

async function start() {
  const app = new Application();
  await app.init({
    resizeTo: window,
    background: '#16200f',
    antialias: false,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
  });
  document.getElementById('game').appendChild(app.canvas);

  const atlas = buildAtlas();
  game.scene = new Scene(app, atlas);
  game.ui = new UI(game);
  game.net = new Net(game);
  game.traffic = new Traffic(game);

  const saved = loadSave();
  if (saved) game.useWorld(saved);
  else game.newMap();

  game.input = new Input(app.canvas, game);
  game.setTool('inspect');
  game.setSpeed(1);

  app.renderer.on('resize', () => { game.scene.camDirty = true; });
  window.addEventListener('visibilitychange', () => { if (document.hidden) game.save(); });

  let hudT = 0, badgeT = 0;
  app.ticker.add(t => {
    const dt = Math.min(0.1, t.deltaMS / 1000);
    game.input.update(dt);

    if (game.speed && !game.net.isClient) {
      const w = game.world;
      w.clock = (w.clock + dt * SPEED_MUL[game.speed] / DAY_CYCLE_SECONDS) % 1;
      game.acc += dt;
      const per = SPEEDS[game.speed];
      let steps = 0;
      while (game.acc >= per && steps < 8) {
        game.acc -= per; steps++;
        for (const ev of tickDay(game.world)) {
          game.onEvent(ev);
          game.net.queueEvent(ev);
        }
      }
      if (steps && game.world.dirty.size) game.input.refresh();
    }

    game.net.update(dt);
    game.scene.sync();
    const amb = game.dayNight ? ambientAt(game.world.clock) : { tint: 0xffffff, lights: 0 };
    game.scene.applyAmbient(game.scene.weatherAmbient(amb, game.world.weather.kind));
    game.traffic.update(dt);
    game.scene.updateSmoke(dt, game.speed > 0);
    game.scene.animateFire(t.lastTime / 1000, dt, game.speed > 0);
    game.scene.updateWeather(dt, game.world.weather.kind, game.speed > 0);
    game.scene.updateFlood(dt);
    if ((badgeT += dt) > 0.5) { badgeT = 0; game.scene.refreshBadges(); game.updateCoverage(); }
    game.scene.animateBadges(t.lastTime / 1000);
    game.scene.updateCamera();
    if ((hudT += dt) > 0.15) { hudT = 0; game.ui.update(); }
  });

  document.getElementById('loading').remove();
  window.game = game;   // facilita testar pelo console
}

start().catch(err => {
  console.error(err);
  document.getElementById('loading').textContent = 'Erro ao iniciar: ' + err.message;
});
