import { Application } from '../lib/pixi.min.mjs';
import { N, SPEEDS } from './config.js';
import { World } from './world.js';
import { apply, fmt, TOOLS } from './actions.js';
import { tickDay } from './sim.js';
import { buildAtlas } from './atlas.js';
import { Scene } from './render.js';
import { Input } from './input.js';
import { UI } from './ui.js';
import { Net } from './net.js';
import { Traffic } from './traffic.js';

const SAVE_KEY = 'littlebigcity-save-v1';

function loadSave() {
  try { return World.deserialize(JSON.parse(localStorage.getItem(SAVE_KEY))); } catch { return null; }
}

const game = {
  tool: 'inspect',
  speed: 1,
  lastSpeed: 1,
  acc: 0,

  setTool(id) {
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
  // Círculos de alcance: aparecem com a ferramenta do serviço escolhida ou
  // por alguns segundos depois de clicar num alerta
  updateCoverage() {
    const kind = this.tool === 'power' ? 1 : this.tool === 'water' ? 2 : this.coverageUntil > performance.now() ? this.coverageFlash : 0;
    const sig = kind + ':' + this.world.stats.services.join(',');
    if (sig !== this.coverageSig) { this.coverageSig = sig; this.scene.showCoverage(kind); }
  },

  // Leva a câmera até a região com mais prédios sem o serviço; cliques
  // seguidos passam para a próxima região
  focusProblem(kind) {
    const w = this.world, C = 10, cells = new Map();
    for (let i = 0; i < N * N; i++) {
      if (!w.lacks(i, kind)) continue;
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
    this.coverageFlash = kind === 'power' ? 1 : 2;
    this.coverageUntil = performance.now() + 6000;
    this.updateCoverage();
    const what = kind === 'power' ? 'sem energia' : 'sem água';
    const fix = kind === 'power' ? 'uma usina (tecla 7)' : "uma caixa d'água (tecla 8)";
    this.ui.toast(`Região ${k + 1} de ${list.length}: ${c.n} prédio${c.n > 1 ? 's' : ''} ${what}. Coloque ${fix} por perto.`);
  },

  inspect({ x, y }) {
    if (!this.world.inside(x, y)) { this.ui.hideInfo(); return; }
    this.ui.showInfo(y * N + x);
  },

  save() {
    if (this.net?.isClient) return;   // a cidade é do anfitrião
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.world.serialize())); } catch { /* armazenamento indisponível */ }
  },
  newMap(seed = (Math.random() * 2 ** 31) | 0) {
    const w = new World(seed);
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
      game.acc += dt;
      const per = SPEEDS[game.speed];
      let steps = 0;
      while (game.acc >= per && steps < 8) {
        game.acc -= per; steps++;
        for (const ev of tickDay(game.world)) {
          if (ev.type === 'month') {
            const net = ev.income - ev.cost;
            game.ui.toast(`Mês fechado: ${net >= 0 ? '+' : '−'} R$ ${fmt(Math.abs(net))}`, net < 0);
            game.save();
          }
        }
      }
      if (steps && game.world.dirty.size) game.input.refresh();
    }

    game.net.update(dt);
    game.scene.sync();
    game.traffic.update(dt);
    game.scene.updateSmoke(dt, game.speed > 0);
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
