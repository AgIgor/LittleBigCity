import { Application } from '../lib/pixi.min.mjs';
import { N, SPEEDS, DAY_CYCLE_SECONDS, DAYS_PER_MONTH } from './config.js';
import { CATALOG, levelReward } from './catalog.js';
import { World } from './world.js';
import { apply, fmt } from './actions.js';
import { tickDay } from './sim.js';
import { buildAtlas } from './atlas.js';
import { Scene, ambientAt } from './render.js';
import { Input } from './input.js';
import { UI } from './ui.js';
import { Net } from './net.js';
import { Traffic } from './traffic.js';

const SAVE_KEY = 'littlebigcity-save-v2';
const OLD_SAVE_KEY = 'littlebigcity-save-v1';     // cidade da versão com zonas: é convertida
const PREFS_KEY = 'littlebigcity-prefs';
const SPEED_MUL = [0, 1, 1.5, 2.2];

function loadPrefs() {
  try { return JSON.parse(localStorage.getItem(PREFS_KEY)) || {}; } catch { return {}; }
}
function savePrefs(p) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch { /* sem armazenamento */ }
}

function loadSave() {
  try {
    const cur = localStorage.getItem(SAVE_KEY);
    if (cur) return World.deserialize(JSON.parse(cur));
    const old = localStorage.getItem(OLD_SAVE_KEY);
    if (old) {
      const w = World.deserialize(JSON.parse(old));
      if (w) w.migrated = true;
      return w;
    }
  } catch { /* save corrompido: começa outro */ }
  return null;
}

const game = {
  tool: 'inspect',
  item: null,          // chave do item do catálogo quando tool = 'build'
  speed: 1,
  lastSpeed: 1,
  acc: 0,

  prefs: loadPrefs(),
  get dayNight() { return this.prefs.dayNight !== false; },

  setTool(id, item = null) {
    this.tool = id;
    this.item = id === 'build' ? item : null;
    this.ui.setTool(id, this.item);
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
    for (const ev of r.events) { this.onEvent(ev); this.net.queueEvent(ev); }
    if (!r.ok) { if (action.tool !== 'collect') this.ui.toast(r.msg, true); return; }
    if (r.cost) this.ui.toast(`− R$ ${fmt(r.cost)}`);
    this.ui.update();
  },
  collect(i) { this.act({ tool: 'collect', i }); },
  collectAll() { this.act({ tool: 'collectAll' }); },
  setDayNight(on) {
    this.prefs.dayNight = on;
    savePrefs(this.prefs);
  },

  // Acontecimentos (no anfitrião vêm da simulação e das ações; nos convidados, pela rede)
  onEvent(ev) {
    const sc = this.scene;
    switch (ev.type) {
      case 'coin':
        sc.floatText(ev.i, `+R$ ${fmt(ev.amount)}`);
        break;
      case 'built':
        sc.floatText(ev.i, 'Pronto!', 0x8cff96);
        break;
      case 'level': {
        const news = CATALOG.filter(it => it.level === ev.level).map(it => it.name);
        this.ui.toast(`⭐ Nível ${ev.level}! Ganhou R$ ${fmt(levelReward(ev.level))} e a cidade cresceu.${news.length ? ` Novo: ${news.join(', ')}.` : ''}`, false, 6000);
        this.ui.levelUp(ev.level);
        break;
      }
      case 'weather':
        if (ev.kind === 3) this.ui.toast('⛈ Tempestade chegando.');
        break;
    }
  },

  inspect({ x, y }) {
    if (!this.world.inside(x, y)) { this.ui.hideInfo(); return; }
    const i = y * N + x;
    if (this.world.coin[i] && !this.world.cons[i]) { this.collect(i); return; }
    this.ui.showInfo(i);
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
    this.ui.toast('Novo mapa! Comece com uma rua e algumas casas.', false, 4000);
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
    this.scene.refreshCoins();
    this.focusStart();
    this.ui.hideInfo();
    this.ui.renderCatalog();
    this.ui.update();
  },
  // Começa olhando para o meio do que já foi construído (ou o centro da área)
  focusStart() {
    const w = this.world;
    let sx = 0, sy = 0, n = 0;
    for (let i = 0; i < N * N; i++) if (w.item[i]) { sx += i % N; sy += (i / N) | 0; n++; }
    const x = n ? sx / n : w.center.x, y = n ? sy / n : w.center.y;
    this.scene.setCamera((x - y) * 64, (x + y) * 32, 0.6);
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
  if (saved) {
    game.useWorld(saved);
    if (saved.migrated) {
      game.save();
      game.ui.toast(`Sua cidade foi trazida para o novo jogo, no nível ${saved.level}. Toque nas moedas para coletar!`, false, 7000);
    }
  } else game.newMap();

  game.input = new Input(app.canvas, game);
  game.setTool('inspect');
  game.setSpeed(1);

  app.renderer.on('resize', () => { game.scene.camDirty = true; });
  window.addEventListener('visibilitychange', () => { if (document.hidden) game.save(); });

  let hudT = 0, coinT = 0;
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
        for (const ev of tickDay(w)) { game.onEvent(ev); game.net.queueEvent(ev); }
        if (w.day % DAYS_PER_MONTH === 0) game.save();
      }
      if (steps && w.dirty.size) game.input.refresh();
    }

    game.net.update(dt);
    game.scene.sync();
    const amb = game.dayNight ? ambientAt(game.world.clock) : { tint: 0xffffff, lights: 0 };
    game.scene.applyAmbient(game.scene.weatherAmbient(amb, game.world.weather.kind));
    game.traffic.update(dt);
    game.scene.updateSmoke(dt, game.speed > 0);
    game.scene.updateWeather(dt, game.world.weather.kind, game.speed > 0);
    if ((coinT += dt) > 0.25) { coinT = 0; game.scene.refreshCoins(); }
    game.scene.animate(t.lastTime / 1000, dt);
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
