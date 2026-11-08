// Cena Pixi: camadas de chão, ruas, objetos (ordenados por profundidade),
// luzes da noite, fumaça, moedas, chuva e a pré-visualização da ferramenta.
import { Container, Sprite, Text, Graphics } from '../lib/pixi.min.mjs';
import { TW, TH, N, CHUNK, WATER, SAND, DIRT, TREE, BUSH, ROCK, RAIN, STORM } from './config.js';
import { ITEMS } from './catalog.js';
import { TREE_VARIANTS, BUSH_VARIANTS, ROCK_VARIANTS, BUILDINGS, CHIMNEYS } from './art.js';
import { hash2 } from './rng.js';

const HW = TW / 2, HH = TH / 2;

export const tileToWorld = (x, y) => [(x - y) * HW, (x + y) * HH];
export function worldToTile(wx, wy) {
  const a = wx / HW, b = wy / HH;
  return [Math.floor((a + b) / 2), Math.floor((b - a) / 2)];
}

function grassTint(shade) {
  const g = shade / 255;
  const r = 1 - 0.3 * g, gg = 1 - 0.17 * g, b = 0.92 - 0.2 * g;
  return (Math.round(r * 255) << 16) | (Math.round(gg * 255) << 8) | Math.round(b * 255);
}

const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function mixColor(c1, c2, t) {
  const r = lerp((c1 >> 16) & 255, (c2 >> 16) & 255, t), g = lerp((c1 >> 8) & 255, (c2 >> 8) & 255, t), b = lerp(c1 & 255, c2 & 255, t);
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
}

// Cor da luz ambiente e intensidade das luzes artificiais para a hora do dia
// (clock: 0 = meia-noite, 0.5 = meio-dia)
export function ambientAt(clock) {
  const sun = -Math.cos(clock * Math.PI * 2);             // -1 meia-noite .. 1 meio-dia
  const day = smooth(-0.3, 0.35, sun);
  let tint = mixColor(0x46557f, 0xffffff, day);
  const dusk = Math.exp(-(((sun - 0.02) / 0.2) ** 2));     // nascer e pôr do sol
  tint = mixColor(tint, 0xffa878, dusk * 0.45);
  return { tint, lights: smooth(0.25, 0.75, 1 - day) };
}

// Clima: quanto a luz fica cinza e quantos pingos caem
const WEATHER_GRAY = [0, 0.18, 0.38, 0.55];
const RAIN_DROPS = [0, 0, 260, 520];
// Altura da moeda acima do chão, conforme o tamanho do prédio
const COIN_LIFT = { b11: 70, b12: 100, b13: 210, b21: 70, b22: 100, b23: 230, b31: 80, b32: 110, b33: 150 };

// Chave do sprite de um item: grupos com variantes (b11_0, b11_1...) ou únicos (svc3)
function itemKey(it, bvar) {
  const m = /^b(\d)(\d)$/.exec(it.sprite);
  if (!m) return it.sprite;
  const list = BUILDINGS[m[1]][m[2]];
  return `${it.sprite}_${bvar % list.length}`;
}

export class Scene {
  constructor(app, atlas) {
    this.app = app;
    this.tex = atlas.tex;
    this.root = new Container();
    app.stage.addChild(this.root);
    this.cam = { x: 0, y: N * HH, zoom: 0.55 };
    this.camDirty = true;
    this.ambient = { tint: 0xffffff, lights: 0 };
    this.objTint = 0xffffff;    // cor de cada objeto (as janelas acesas não escurecem)
    this.litAlpha = 0;
    // chuva e relâmpago ficam por cima de tudo, em coordenadas de tela
    this.weatherLayer = new Container();
    app.stage.addChild(this.weatherLayer);
    this.drops = [];
    this.flash = new Graphics();
    app.stage.addChild(this.flash);
    this.flashA = 0;
    this.boltT = 3;
    this.bounces = new Set();
  }

  sprite(key) {
    const t = this.tex[key];
    const s = new Sprite(t.texture);
    s.anchor.set(t.ax, t.ay);
    return s;
  }
  setTex(s, key) {
    const t = this.tex[key];
    if (s.texture !== t.texture) { s.texture = t.texture; s.anchor.set(t.ax, t.ay); }
  }

  build(world) {
    this.world = world;
    this.CN = Math.ceil(N / CHUNK);
    this.root.removeChildren().forEach(c => c.destroy({ children: true }));
    const layer = (blend) => {
      const c = new Container();
      if (blend) c.blendMode = blend;
      this.root.addChild(c);
      return c;
    };
    const chunked = () => {
      const l = layer(), chunks = [];
      for (let k = 0; k < this.CN * this.CN; k++) { const c = new Container(); chunks.push(c); l.addChild(c); }
      return [l, chunks];
    };
    [this.groundLayer, this.groundChunks] = chunked();
    [this.roadLayer, this.roadChunks] = chunked();
    this.glowLayer = layer('add');            // postes acesos (abaixo dos prédios)
    this.border = new Graphics();             // contorno da área da cidade
    this.root.addChild(this.border);
    this.objects = layer();
    this.objects.sortableChildren = true;
    this.lightsLayer = layer('add');          // faróis
    this.preview = layer();
    this.previewPool = [];
    this.smokeLayer = layer();
    this.puffs = [];
    this.chimneys = new Map();     // tile -> posições (mundo) do topo das chaminés
    this.coinLayer = layer();
    this.coins = new Map();        // tile -> sprite da moeda
    this.fxLayer = layer();
    this.fx = [];
    this.cursorLayer = layer();
    this.cursorMap = new Map();

    const NN = N * N;
    this.groundS = new Array(NN);
    this.roadS = new Array(NN).fill(null);
    this.lampS = new Array(NN).fill(null);
    this.objS = new Array(NN).fill(null);
    this.litS = new Array(NN).fill(null);
    this.objKey = new Array(NN).fill('');

    for (let i = 0; i < NN; i++) {
      const x = i % N, y = (i / N) | 0, [px, py] = tileToWorld(x, y);
      const s = this.sprite('grass0');
      s.position.set(px, py);
      this.groundChunks[this.chunkOf(x, y)].addChild(s);
      this.groundS[i] = s;
      this.refreshTile(i);
    }
    world.dirty.clear();
    this.areaSig = '';
    this.syncArea();
    this.applyAmbient(this.ambient, true);
    this.camDirty = true;
  }

  chunkOf(x, y) { return ((y / CHUNK) | 0) * this.CN + ((x / CHUNK) | 0); }

  // Fora da área da cidade o chão fica mais escuro
  groundTint(i) {
    const w = this.world, x = i % N, y = (i / N) | 0;
    const base = w.terrain[i] === 2 ? grassTint(w.shade[i]) : 0xffffff;
    return w.inArea(x, y) ? base : mixColor(base, 0x1e2a18, 0.45);
  }

  refreshTile(i) {
    const w = this.world, x = i % N, y = (i / N) | 0, [px, py] = tileToWorld(x, y);
    const t = w.terrain[i], ov = w.ov[i];

    // chão
    const g = this.groundS[i];
    if (t === WATER) this.setTex(g, 'water' + w.maskOf(i, j => w.terrain[j] !== WATER));
    else if (t === SAND) this.setTex(g, 'sand' + (ov % 2));
    else if (t === DIRT) this.setTex(g, 'dirt' + (ov % 3));
    else this.setTex(g, 'grass' + (ov % 4));
    g.tint = this.groundTint(i);

    // rua e poste
    if (w.road[i]) {
      if (!this.roadS[i]) {
        const s = this.roadS[i] = this.sprite('road0');
        s.position.set(px, py);
        this.roadChunks[this.chunkOf(x, y)].addChild(s);
      }
      this.setTex(this.roadS[i], (t === WATER ? 'bridge' : w.road[i] === 2 ? 'ave' : 'road') + w.maskOf(i, j => w.road[j]));
      if (!this.lampS[i] && hash2(x, y, 99) < 0.45) {
        const s = this.lampS[i] = this.sprite('lampGlow');
        const side = hash2(y, x, 7) < 0.5 ? 1 : -1;
        s.position.set(px + side * 18, py + HH + 4);
        s.visible = this.inView(px, py);
        this.glowLayer.addChild(s);
      }
    } else {
      if (this.roadS[i]) { this.roadS[i].destroy(); this.roadS[i] = null; }
      if (this.lampS[i]) { this.lampS[i].destroy(); this.lampS[i] = null; }
    }

    // objeto: prédio, obra ou vegetação
    let key = '';
    const it = ITEMS[w.item[i]];
    if (it && w.cons[i] && it.cat !== 'deco') key = 'obra' + (it.cost > 1500 ? 1 : 0);
    else if (it) key = itemKey(it, w.bvar[i]);
    else if (w.obj[i] === TREE) key = 'tree' + (ov % TREE_VARIANTS);
    else if (w.obj[i] === BUSH) key = 'bush' + (ov % BUSH_VARIANTS);
    else if (w.obj[i] === ROCK) key = 'rock' + (ov % ROCK_VARIANTS);

    if (key !== this.objKey[i]) {
      const wasBuilding = this.objKey[i].startsWith('obra');
      this.objKey[i] = key;
      const ch = CHIMNEYS[key.split('_')[0]];
      if (ch) this.chimneys.set(i, ch.map(([cx, cy]) => [px + cx, py + cy]));
      else this.chimneys.delete(i);
      if (!key) { this.objS[i]?.destroy(); this.objS[i] = null; }
      else {
        if (!this.objS[i]) {
          const s = this.objS[i] = this.sprite(key);
          s.position.set(px, py);
          s.zIndex = (x + y) * 2 + 1;
          s.tint = this.objTint;
          s.visible = this.inView(px, py);
          this.objects.addChild(s);
        } else this.setTex(this.objS[i], key);
        // obra terminada ou decoração nova: um pulinho
        if (it && !w.cons[i] && (wasBuilding || it.cat === 'deco')) this.objS[i].pop = 0;
      }
      // janelas acesas à noite: logo acima do próprio prédio, para que os
      // prédios da frente tapem a luz das janelas de trás
      const litKey = 'lit_' + key;
      if (this.tex[litKey]) {
        if (!this.litS[i]) {
          const s = this.litS[i] = this.sprite(litKey);
          s.position.set(px, py);
          s.zIndex = (x + y) * 2 + 1.01;
          s.isLit = true;
          s.alpha = this.litAlpha;
          s.visible = this.litAlpha > 0.02 && this.inView(px, py);
          this.objects.addChild(s);
        } else this.setTex(this.litS[i], litKey);
      } else if (this.litS[i]) { this.litS[i].destroy(); this.litS[i] = null; }
    }
  }

  // Atualiza o que mudou no mundo desde o último quadro
  sync() {
    const w = this.world;
    if (w.dirty.size) {
      for (const i of w.dirty) this.refreshTile(i);
      w.dirty.clear();
    }
    for (const i of this.bounces) if (this.objS[i]) this.objS[i].pop = 0;
    this.bounces.clear();
    this.syncArea();
  }

  // A área construível muda ao subir de nível
  syncArea() {
    const w = this.world, h = w.half, sig = `${w.center.x},${w.center.y},${h}`;
    if (sig === this.areaSig) return;
    this.areaSig = sig;
    for (let i = 0; i < N * N; i++) this.groundS[i].tint = this.groundTint(i);
    const x0 = Math.max(0, w.center.x - h), y0 = Math.max(0, w.center.y - h);
    const x1 = Math.min(N, w.center.x + h + 1), y1 = Math.min(N, w.center.y + h + 1);
    const pts = [tileToWorld(x0, y0), tileToWorld(x1, y0), tileToWorld(x1, y1), tileToWorld(x0, y1)];
    this.border.clear().poly(pts.flat(), true).stroke({ color: 0xf2d24a, width: 3, alpha: 0.5 });
  }

  // ---------- dia, noite e clima ----------
  weatherAmbient(amb, kind) {
    const k = WEATHER_GRAY[kind] || 0;
    if (!k) return amb;
    return { tint: mixColor(amb.tint, 0x7a8088, k), lights: Math.max(amb.lights, kind >= RAIN ? 0.35 : 0.15) };
  }

  // Recolorir obriga o Pixi a atualizar a cor de muitos sprites, então só
  // aplica quando a mudança é perceptível.
  applyAmbient(amb, force) {
    const prev = this.ambient;
    const chan = (a, b, sh) => Math.abs(((a >> sh) & 255) - ((b >> sh) & 255));
    const tintMoved = Math.max(chan(prev.tint, amb.tint, 16), chan(prev.tint, amb.tint, 8), chan(prev.tint, amb.tint, 0)) >= 4;
    const lightMoved = Math.abs(prev.lights - amb.lights) >= 0.03 || (amb.lights === 0) !== (prev.lights === 0);
    if (!this.groundLayer || (!force && !tintMoved && !lightMoved)) return;
    this.ambient = amb;
    const tint = amb.tint, lights = amb.lights;
    for (const l of [this.groundLayer, this.roadLayer, this.smokeLayer]) l.tint = tint;
    // os objetos são escurecidos um a um, porque as janelas acesas ficam no
    // meio deles (ordenadas por profundidade) e não podem pegar a cor da noite
    const tintChanged = tint !== this.objTint;
    this.objTint = tint;
    this.litAlpha = lights;
    for (const o of this.objects.children) {
      if (o.isLit) { o.alpha = lights; o.visible = lights > 0.02 && this.inView(o.x, o.y); }
      else if (tintChanged) o.tint = tint;
    }
    this.glowLayer.alpha = lights * 0.9;
    this.lightsLayer.alpha = lights;
    this.glowLayer.visible = this.lightsLayer.visible = lights > 0.02;
  }

  updateWeather(dt, kind, running) {
    const s = this.app.screen, want = RAIN_DROPS[kind] || 0;
    while (this.drops.length < want) {
      const d = this.sprite('rain');
      d.position.set(Math.random() * s.width, Math.random() * s.height);
      d.vy = 900 + Math.random() * 300;
      d.alpha = 0.35 + Math.random() * 0.4;
      this.weatherLayer.addChild(d);
      this.drops.push(d);
    }
    while (this.drops.length > want) this.drops.pop().destroy();
    const sp = running ? 1 : 0.15;
    for (const d of this.drops) {
      d.y += d.vy * dt * sp; d.x -= d.vy * 0.18 * dt * sp;
      if (d.y > s.height) { d.y -= s.height + 30; d.x = Math.random() * (s.width + 200); }
      if (d.x < -10) d.x += s.width + 20;
    }
    // relâmpagos na tempestade
    if (kind === STORM && running && (this.boltT -= dt) < 0) {
      this.boltT = 2 + Math.random() * 6;
      this.flashA = 0.5;
    }
    if (this.flashA > 0 || this.flash.visible) {
      this.flashA = Math.max(0, this.flashA - dt * 2.2);
      this.flash.clear().rect(0, 0, s.width, s.height).fill({ color: 0xe8f0ff, alpha: this.flashA * (Math.random() < 0.2 ? 0.5 : 1) });
      this.flash.visible = this.flashA > 0;
    }
  }

  // Fumaça: cada chaminé visível solta baforadas que sobem, crescem e somem
  updateSmoke(dt, running) {
    const tex = this.tex.smoke;
    if (running) {
      for (const [, list] of this.chimneys) {
        for (let k = 0; k < list.length; k++) {
          const [cx, cy] = list[k];
          if (!this.inView(cx, cy + 100)) continue;
          if (Math.random() > dt * 2.6) continue;
          if (this.puffs.length > 500) break;
          const s = new Sprite(tex.texture);
          s.anchor.set(0.5);
          s.position.set(cx + (Math.random() - 0.5) * 3, cy);
          s.tint = 0xcfcbc2;
          this.smokeLayer.addChild(s);
          this.puffs.push({ s, age: 0, life: 3 + Math.random() * 1.5, vx: 9 + Math.random() * 8, vy: -20 - Math.random() * 8 });
        }
      }
    }
    for (const p of this.puffs) {
      p.age += dt;
      const t = p.age / p.life;
      p.s.x += p.vx * dt; p.s.y += p.vy * dt;
      p.vy *= 1 - dt * 0.35;
      p.s.scale.set(0.4 + t * 1.5);
      p.s.alpha = Math.min(1, p.age * 3) * (1 - t) * 0.8;
      if (t >= 1) { p.s.destroy(); p.dead = true; }
    }
    if (this.puffs.some(p => p.dead)) this.puffs = this.puffs.filter(p => !p.dead);
  }

  // ---------- moedas ----------
  coinLift(i) {
    const k = this.objKey[i].split('_')[0];
    return COIN_LIFT[k] ?? 110;
  }
  refreshCoins() {
    const w = this.world;
    for (let i = 0; i < N * N; i++) {
      const has = w.coin[i] && !w.cons[i];
      const s = this.coins.get(i);
      if (has && !s) {
        const c = this.sprite('coin');
        const [px, py] = tileToWorld(i % N, (i / N) | 0);
        c.baseX = px; c.baseY = py + HH - this.coinLift(i);
        c.phase = (i * 7) % 10;
        c.position.set(c.baseX, c.baseY);
        c.scale.set(0);
        c.grow = 0;
        this.coinLayer.addChild(c);
        this.coins.set(i, c);
      } else if (!has && s) { s.destroy(); this.coins.delete(i); }
    }
  }

  // Moeda sob o ponteiro (tela -> mundo), para coletar clicando no ícone
  coinAt(sx, sy) {
    const [wx, wy] = this.screenToWorld(sx, sy);
    const sc = this.coinScale(), r = 26 * sc;
    let best = -1, bd = Infinity;
    for (const [i, s] of this.coins) {
      const d = Math.hypot(wx - s.x, wy - (s.y - 26 * sc));
      if (d < r && d < bd) { bd = d; best = i; }
    }
    return best;
  }
  coinScale() { return Math.min(2.6, Math.max(1, 0.75 / this.cam.zoom)); }

  // Anima moedas, pulinho de prédios novos e textos flutuantes
  animate(time, dt) {
    const sc = this.coinScale();
    for (const s of this.coins.values()) {
      s.visible = this.inView(s.baseX, s.baseY);
      if (!s.visible) continue;
      s.grow = Math.min(1, s.grow + dt * 4);
      s.y = s.baseY - Math.abs(Math.sin(time * 3 + s.phase)) * 7 * sc;
      s.scale.set(sc * (s.grow < 1 ? 1 + Math.sin(s.grow * Math.PI) * 0.4 : 1) * s.grow);
    }
    for (const o of this.objects.children) {
      if (o.pop == null) continue;
      o.pop += dt * 3;
      const k = o.pop >= 1 ? 1 : 1 + Math.sin(o.pop * Math.PI) * 0.12;
      o.scale.set(1 / k, k);
      if (o.pop >= 1) { o.scale.set(1); o.pop = null; }
    }
    for (const f of this.fx) {
      f.age += dt;
      f.t.y -= 50 * dt;
      f.t.alpha = Math.min(1, (1.4 - f.age) * 2);
      if (f.age > 1.4) { f.t.destroy(); f.dead = true; }
    }
    if (this.fx.some(f => f.dead)) this.fx = this.fx.filter(f => !f.dead);
  }

  // Pulinho num objeto (construção que acabou de mudar de lugar)
  // (o sprite no lugar novo só nasce no próximo sync, então fica anotado)
  bounce(i) { this.bounces.add(i); }

  // Texto subindo sobre um tile ("+R$ 25", "+5 XP")
  floatText(i, text, color = 0xffe066) {
    if (this.fx.length > 80) return;
    const [px, py] = tileToWorld(i % N, (i / N) | 0);
    const t = new Text({
      text,
      style: { fontFamily: 'system-ui, sans-serif', fontSize: 22, fontWeight: '800', fill: color, stroke: { color: 0x1a1a14, width: 5 } },
    });
    t.anchor.set(0.5, 1);
    t.resolution = 2;
    t.scale.set(this.coinScale());
    t.position.set(px, py + HH - this.coinLift(i) - 10);
    this.fxLayer.addChild(t);
    this.fx.push({ t, age: 0 });
  }

  // ---------- câmera ----------
  setCamera(x, y, zoom) {
    const c = this.cam;
    c.zoom = Math.max(0.1, Math.min(2.2, zoom ?? c.zoom));
    const maxX = N * HW, maxY = N * TH;
    c.x = Math.max(-maxX, Math.min(maxX, x ?? c.x));
    c.y = Math.max(0, Math.min(maxY, y ?? c.y));
    this.camDirty = true;
  }

  screenToWorld(sx, sy) {
    const c = this.cam, s = this.app.screen;
    return [(sx - s.width / 2) / c.zoom + c.x, (sy - s.height / 2) / c.zoom + c.y];
  }
  screenToTile(sx, sy) {
    const [wx, wy] = this.screenToWorld(sx, sy);
    return worldToTile(wx, wy);
  }

  inView(px, py) {
    const v = this.view;
    if (!v) return true;
    return px > v.l - TW && px < v.r + TW && py > v.t - TH * 2 && py < v.b + 320;
  }

  updateCamera() {
    if (!this.camDirty) return;
    this.camDirty = false;
    const c = this.cam, s = this.app.screen, CN = this.CN;
    this.root.scale.set(c.zoom);
    this.root.position.set(s.width / 2 - c.x * c.zoom, s.height / 2 - c.y * c.zoom);
    const hw = s.width / 2 / c.zoom, hh = s.height / 2 / c.zoom;
    this.view = { l: c.x - hw, r: c.x + hw, t: c.y - hh, b: c.y + hh };
    const v = this.view;
    for (let cy = 0; cy < CN; cy++) for (let cx = 0; cx < CN; cx++) {
      const x0 = cx * CHUNK, y0 = cy * CHUNK;
      const minX = (x0 - y0 - CHUNK) * HW, maxX = (x0 + CHUNK - y0) * HW;
      const minY = (x0 + y0) * HH, maxY = (x0 + y0 + 2 * CHUNK) * HH;
      const vis = maxX > v.l && minX < v.r && maxY > v.t && minY < v.b;
      const k = cy * CN + cx;
      this.groundChunks[k].visible = this.roadChunks[k].visible = vis;
    }
    const litOn = this.litAlpha > 0.02;
    for (const o of this.objects.children) o.visible = (!o.isLit || litOn) && this.inView(o.x, o.y);
    for (const o of this.glowLayer.children) o.visible = this.inView(o.x, o.y);
    for (const c of this.cursorMap.values()) c.label.scale.set(1 / this.cam.zoom);
  }

  // ---------- cursores dos outros jogadores ----------
  setCursors(players) {
    if (!this.cursorLayer) return;
    const seen = new Set();
    for (const p of players) {
      seen.add(p.id);
      let c = this.cursorMap.get(p.id);
      if (!c) {
        const box = new Container();
        const tile = this.sprite('cursor');
        const label = new Text({
          text: p.name,
          style: { fontFamily: 'system-ui, sans-serif', fontSize: 15, fontWeight: '700', fill: 0xffffff, stroke: { color: 0x1a1a14, width: 4 } },
        });
        label.anchor.set(0.5, 1);
        label.position.set(0, -6);
        box.addChild(tile, label);
        this.cursorLayer.addChild(box);
        label.resolution = 3;
        c = { box, tile, label };
        this.cursorMap.set(p.id, c);
      }
      const [px, py] = tileToWorld(p.cur[0], p.cur[1]);
      c.box.position.set(px, py);
      c.tile.tint = p.color;
      c.tile.alpha = 0.9;
      c.label.text = p.name;
      c.label.style.fill = p.color;
      c.label.scale.set(1 / this.cam.zoom);
    }
    for (const [id, c] of this.cursorMap) {
      if (!seen.has(id)) { c.box.destroy({ children: true }); this.cursorMap.delete(id); }
    }
  }

  // ---------- pré-visualização da ferramenta ----------
  // state: 'ok', 'bad', 'skip' ou 'area' (alcance do bônus)
  setPreview(tiles) {
    const pool = this.previewPool;
    tiles = tiles || [];
    while (pool.length < tiles.length) {
      const s = this.sprite('cursor');
      this.preview.addChild(s);
      pool.push(s);
    }
    for (let k = 0; k < pool.length; k++) {
      const s = pool[k];
      if (k >= tiles.length) { s.visible = false; continue; }
      const { i, state } = tiles[k], [px, py] = tileToWorld(i % N, (i / N) | 0);
      s.visible = true;
      s.position.set(px, py);
      s.tint = { ok: 0x8cff96, bad: 0xff5a4a, area: 0xffe066 }[state] ?? 0xffffff;
      s.alpha = state === 'skip' ? 0.3 : state === 'area' ? 0.22 : 0.8;
    }
  }

  // Miniatura de um sprite do atlas (para o catálogo), recortada no desenho
  thumb(key, size = 64) {
    const t = this.tex[key];
    if (!t) return '';
    const f = t.texture.frame, src = t.texture.source.resource;
    const tmp = document.createElement('canvas');
    tmp.width = f.width; tmp.height = f.height;
    const tx = tmp.getContext('2d', { willReadFrequently: true });
    tx.drawImage(src, f.x, f.y, f.width, f.height, 0, 0, f.width, f.height);
    const d = tx.getImageData(0, 0, f.width, f.height).data;
    let x0 = f.width, y0 = f.height, x1 = 0, y1 = 0;
    for (let y = 0; y < f.height; y++) for (let x = 0; x < f.width; x++) {
      if (d[(y * f.width + x) * 4 + 3] < 20) continue;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    if (x1 < x0) return '';
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1, k = Math.min(size / bw, size / bh);
    const c = document.createElement('canvas');
    c.width = c.height = size;
    c.getContext('2d').drawImage(tmp, x0, y0, bw, bh, (size - bw * k) / 2, size - bh * k, bw * k, bh * k);
    return c.toDataURL();
  }
}
