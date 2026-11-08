// Cena Pixi: camadas de chão, ruas, zonas, objetos (ordenados por profundidade),
// luzes da noite, fumaça, avisos e a pré-visualização da ferramenta.
import { Container, Sprite, Text, Graphics } from '../lib/pixi.min.mjs';
import {
  TW, TH, N, CHUNK, WATER, SAND, DIRT, TREE, BUSH, ROCK, ZONE_COLOR, ROAD_REACH,
  SVC_RADIUS, SVC_COLOR, SVC_KEY, SVC_PARK, COVER_KINDS, JAM, RAIN, STORM, CLOUDY,
} from './config.js';
import { TREE_VARIANTS, BUSH_VARIANTS, ROCK_VARIANTS, BUILDINGS, CHIMNEYS, PARK_VARIANTS } from './art.js';
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

// Valor do terreno -> cor do mapa de calor (vermelho baixo, amarelo médio, verde alto)
function valueColor(v) {
  const t = Math.max(0, Math.min(1, (v - 50) / 120));
  return t < 0.5 ? mixColor(0xd8483a, 0xf2d24a, t * 2) : mixColor(0xf2d24a, 0x4ac85a, (t - 0.5) * 2);
}
// Poluição -> verde limpo, marrom, roxo muito poluído
function pollutionColor(p) {
  const t = Math.max(0, Math.min(1, p / 140));
  return t < 0.5 ? mixColor(0x6ac86a, 0xb8964a, t * 2) : mixColor(0xb8964a, 0x8a3a8a, (t - 0.5) * 2);
}
// Congestionamento (%) -> verde, amarelo, vermelho
function jamColor(j) {
  const t = Math.max(0, Math.min(1, j / JAM));
  return t < 0.6 ? mixColor(0x4ad85a, 0xf2d24a, t / 0.6) : mixColor(0xf2d24a, 0xe8382c, (t - 0.6) / 0.4);
}
// Clima: quanto a luz fica cinza e quantos pingos caem
const WEATHER_GRAY = [0, 0.18, 0.38, 0.55];
const RAIN_DROPS = [0, 0, 260, 520];

export class Scene {
  constructor(app, atlas) {
    this.app = app;
    this.tex = atlas.tex;
    this.root = new Container();
    app.stage.addChild(this.root);
    this.cam = { x: 0, y: N * HH, zoom: 0.55 };
    this.camDirty = true;
    this.overlay = null;
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
  }

  // Mistura a luz do dia/noite com o cinza do tempo fechado
  weatherAmbient(amb, kind) {
    const k = WEATHER_GRAY[kind] || 0;
    if (!k) return amb;
    return { tint: mixColor(amb.tint, 0x7a8088, k), lights: Math.max(amb.lights, kind >= RAIN ? 0.35 : 0.15) };
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
      this.flashA = 0.55;
    }
    if (this.flashA > 0 || this.flash.visible) {
      this.flashA = Math.max(0, this.flashA - dt * 2.2);
      this.flash.clear().rect(0, 0, s.width, s.height).fill({ color: 0xe8f0ff, alpha: this.flashA * (Math.random() < 0.2 ? 0.5 : 1) });
      this.flash.visible = this.flashA > 0;
    }
  }

  // Água subindo na área da enchente; some aos poucos
  showFlood(tiles) {
    for (const i of tiles) {
      const s = this.sprite('water0');
      const [px, py] = tileToWorld(i % N, (i / N) | 0);
      s.position.set(px, py);
      s.alpha = 0;
      s.life = 0;
      this.floodLayer.addChild(s);
    }
  }
  updateFlood(dt) {
    for (const s of [...this.floodLayer.children]) {
      s.life += dt;
      s.alpha = Math.min(0.8, s.life * 1.5) * Math.min(1, Math.max(0, (14 - s.life) / 5));
      if (s.life > 14) s.destroy();
    }
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
    [this.zoneLayer, this.zoneChunks] = chunked();
    this.floodLayer = layer();
    this.coverage = new Graphics();
    this.root.addChild(this.coverage);
    this.coverageKind = 0;
    this.objects = layer();
    this.objects.sortableChildren = true;
    this.lightsLayer = layer('add');          // janelas acesas e faróis
    this.preview = layer();
    this.previewPool = [];
    this.smokeLayer = layer();
    this.puffs = [];
    this.chimneys = new Map();     // tile -> posições (mundo) do topo das chaminés
    this.badgeLayer = layer();
    this.badges = new Map();       // chave 'tile:tipo' -> sprite
    this.cursorLayer = layer();
    this.cursorMap = new Map();

    const NN = N * N;
    this.groundS = new Array(NN);
    this.roadS = new Array(NN).fill(null);
    this.lampS = new Array(NN).fill(null);
    this.zoneS = new Array(NN).fill(null);
    this.objS = new Array(NN).fill(null);
    this.litS = new Array(NN).fill(null);
    this.objKey = new Array(NN).fill('');
    this.fireS = new Map();        // tile -> sprite das chamas
    this.festaS = null;
    this.festaKey = '';

    for (let i = 0; i < NN; i++) {
      const x = i % N, y = (i / N) | 0, [px, py] = tileToWorld(x, y);
      const s = this.sprite('grass0');
      s.position.set(px, py);
      this.groundChunks[this.chunkOf(x, y)].addChild(s);
      this.groundS[i] = s;
      this.refreshTile(i);
    }
    world.dirty.clear();
    this.valueVersion = world.valueVersion;
    this.applyAmbient(this.ambient, true);
    this.camDirty = true;
  }

  chunkOf(x, y) { return ((y / CHUNK) | 0) * this.CN + ((x / CHUNK) | 0); }

  groundTint(i) {
    const w = this.world, o = this.overlay;
    if (o && w.terrain[i] !== WATER) {
      if (o === 'value') return valueColor(w.value[i]);
      if (o === 'pollution') return pollutionColor(w.pollution[i]);
      if (o === 'traffic') return 0x707070;
    }
    return w.terrain[i] === 2 ? grassTint(w.shade[i]) : 0xffffff;
  }
  roadTint(i) {
    return this.overlay === 'traffic' ? jamColor(this.world.jam[i]) : this.overlay ? 0xb0b0b0 : 0xffffff;
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
      this.roadS[i].tint = this.roadTint(i);
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

    // marcação de zona (só em lote vazio)
    const showZone = w.zone[i] && !w.bld[i] && !w.cons[i];
    if (showZone) {
      if (!this.zoneS[i]) {
        const s = this.zoneS[i] = this.sprite('zone');
        s.position.set(px, py);
        this.zoneChunks[this.chunkOf(x, y)].addChild(s);
      }
      const s = this.zoneS[i];
      s.tint = ZONE_COLOR[w.zone[i]];
      s.alpha = w.roadDist[i] <= ROAD_REACH ? 0.85 : 0.35;
    } else if (this.zoneS[i]) { this.zoneS[i].destroy(); this.zoneS[i] = null; }

    // objeto: serviço, obra, prédio ou vegetação
    let key = '';
    if (w.svc[i] === SVC_PARK) key = 'svc6_' + (ov % PARK_VARIANTS);
    else if (w.svc[i]) key = 'svc' + w.svc[i];
    else if (w.cons[i]) key = 'obra' + (w.bld[i] ? 1 : 0);
    else if (w.bld[i] && w.zone[i]) {
      const list = BUILDINGS[w.zone[i]][w.bld[i]];
      key = `b${w.zone[i]}${w.bld[i]}_${w.bvar[i] % list.length}`;
    } else if (w.obj[i] === TREE) key = 'tree' + (ov % TREE_VARIANTS);
    else if (w.obj[i] === BUSH) key = 'bush' + (ov % BUSH_VARIANTS);
    else if (w.obj[i] === ROCK) key = 'rock' + (ov % ROCK_VARIANTS);

    if (key !== this.objKey[i]) {
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

    // chamas
    const fireKey = w.fire[i] && w.bld[i] ? `fire${w.bld[i]}_0` : '';
    let f = this.fireS.get(i);
    if (fireKey && !f) {
      f = this.sprite(fireKey);
      f.position.set(px, py);
      f.zIndex = (x + y) * 2 + 1.02;
      f.noTint = true;
      f.level = w.bld[i];
      f.visible = this.inView(px, py);
      this.objects.addChild(f);
      this.fireS.set(i, f);
    } else if (!fireKey && f) { f.destroy(); this.fireS.delete(i); }
    else if (f) f.level = w.bld[i];
  }

  // Festa: bandeirinhas na praça (e lâmpadas acesas à noite)
  syncFesta() {
    const fe = this.world.festa, key = fe ? `${fe.i}:${fe.kind || 0}` : '';
    if (key === this.festaKey) return;
    this.festaKey = key;
    if (this.festaS) { for (const s of this.festaS) s.destroy(); this.festaS = null; }
    if (!fe) return;
    const x = fe.i % N, y = (fe.i / N) | 0, [px, py] = tileToWorld(x, y), k = fe.kind || 0;
    const a = this.sprite('festa' + k), b = this.sprite('lit_festa' + k);
    a.position.set(px, py); b.position.set(px, py);
    a.zIndex = (x + y) * 2 + 1.03; b.zIndex = (x + y) * 2 + 1.04;
    a.tint = this.objTint;
    b.isLit = true; b.alpha = this.litAlpha; b.visible = this.litAlpha > 0.02;
    this.objects.addChild(a, b);
    this.festaS = [a, b];
  }

  // Chamas trocam de quadro e soltam fumaça escura
  animateFire(time, dt, running) {
    if (!this.fireS.size) return;
    const fr = ((time * 8) | 0) % 3;
    for (const [i, s] of this.fireS) {
      const key = `fire${s.level}_${(fr + i) % 3}`;
      if (this.tex[key]) this.setTex(s, key);
      if (!running || !s.visible || Math.random() > dt * 6 || this.puffs.length > 600) continue;
      const p = new Sprite(this.tex.smoke.texture);
      p.anchor.set(0.5);
      p.position.set(s.x + (Math.random() - 0.5) * 30, s.y - [0, 40, 75, 160][s.level] - 10);
      p.tint = 0x2a2624;
      this.smokeLayer.addChild(p);
      this.puffs.push({ s: p, age: 0, life: 3 + Math.random(), vx: 10 + Math.random() * 10, vy: -26 - Math.random() * 10 });
    }
  }

  // Atualiza o que mudou no mundo desde o último quadro
  sync() {
    const w = this.world;
    if (w.dirty.size) {
      for (const i of w.dirty) this.refreshTile(i);
      w.dirty.clear();
    }
    if (this.overlay && w.valueVersion !== this.valueVersion) this.retintGround();
    this.valueVersion = w.valueVersion;
    this.syncFesta();
  }

  retintGround() {
    for (let i = 0; i < N * N; i++) {
      this.groundS[i].tint = this.groundTint(i);
      if (this.roadS[i]) this.roadS[i].tint = this.roadTint(i);
    }
  }

  // Mapa de calor: 'value', 'pollution' ou 'traffic' (null desliga)
  setOverlay(kind) {
    this.overlay = kind;
    this.retintGround();
    this.objects.alpha = kind ? 0.45 : 1;
    this.applyAmbient(this.ambient, true);
  }

  // ---------- dia e noite ----------
  // Recolorir as camadas obriga o Pixi a atualizar a cor de todos os sprites
  // (alguns ms no mapa grande), então só aplica quando a mudança é perceptível.
  applyAmbient(amb, force) {
    const prev = this.ambient;
    const chan = (a, b, sh) => Math.abs(((a >> sh) & 255) - ((b >> sh) & 255));
    const tintMoved = Math.max(chan(prev.tint, amb.tint, 16), chan(prev.tint, amb.tint, 8), chan(prev.tint, amb.tint, 0)) >= 4;
    const lightMoved = Math.abs(prev.lights - amb.lights) >= 0.03 || (amb.lights === 0) !== (prev.lights === 0);
    if (!this.groundLayer || (!force && !tintMoved && !lightMoved)) return;
    this.ambient = amb;
    // com o mapa de valor ligado, mostra tudo claro para dar para ler as cores
    const tint = this.overlay ? 0xffffff : amb.tint;
    for (const l of [this.groundLayer, this.roadLayer, this.zoneLayer, this.smokeLayer]) l.tint = tint;
    const lights = this.overlay ? 0 : amb.lights;
    // os objetos são escurecidos um a um, porque as janelas acesas ficam no
    // meio deles (ordenadas por profundidade) e não podem pegar a cor da noite
    const tintChanged = tint !== this.objTint;
    this.objTint = tint;
    this.litAlpha = lights;
    for (const o of this.objects.children) {
      if (o.isLit) { o.alpha = lights; o.visible = lights > 0.02 && this.inView(o.x, o.y); }
      else if (tintChanged && !o.noTint) o.tint = tint;
    }
    this.glowLayer.alpha = lights * 0.9;
    this.lightsLayer.alpha = lights;
    this.glowLayer.visible = this.lightsLayer.visible = lights > 0.02;
  }

  // Fumaça: cada chaminé visível solta baforadas que sobem, crescem e somem
  updateSmoke(dt, running) {
    const tex = this.tex.smoke;
    if (running) {
      for (const [i, list] of this.chimneys) {
        for (let k = 0; k < list.length; k++) {
          const [cx, cy] = list[k];
          if (!this.inView(cx, cy + 100)) continue;
          if (Math.random() > dt * 2.6) continue;
          if (this.puffs.length > 500) break;
          const s = new Sprite(tex.texture);
          s.anchor.set(0.5);
          s.position.set(cx + (Math.random() - 0.5) * 3, cy);
          s.tint = this.world.svc[i] ? 0xa8a49c : 0xcfcbc2;
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

  // ---------- avisos de serviço ----------
  // Recria a lista de ícones; chamado de tempos em tempos (é barato)
  refreshBadges() {
    const w = this.world, seen = new Set();
    for (let i = 0; i < N * N; i++) {
      if (!w.bld[i] || w.cons[i]) continue;
      const kinds = COVER_KINDS.filter(k => w.lacks(i, k));
      kinds.forEach((k, n) => {
        const key = i + ':' + k;
        seen.add(key);
        if (this.badges.has(key)) return;
        const s = this.sprite('badge_' + k);
        const x = i % N, y = (i / N) | 0, [px, py] = tileToWorld(x, y);
        const lift = [0, 58, 96, 196][w.bld[i]];
        s.baseX = px + (n - (kinds.length - 1) / 2) * 30;
        s.baseY = py + HH - lift;
        s.phase = (x * 7 + y * 13) % 10;
        s.position.set(s.baseX, s.baseY);
        this.badgeLayer.addChild(s);
        this.badges.set(key, s);
      });
    }
    for (const [key, s] of this.badges) if (!seen.has(key)) { s.destroy(); this.badges.delete(key); }
  }

  animateBadges(time) {
    // tamanho constante na tela até certo ponto, para dar para ver de longe
    const sc = Math.min(2.6, Math.max(1, 0.75 / this.cam.zoom));
    for (const s of this.badges.values()) {
      s.visible = this.inView(s.baseX, s.baseY);
      if (!s.visible) continue;
      s.y = s.baseY - Math.abs(Math.sin(time * 3 + s.phase)) * 6 * sc;
      s.scale.set(sc);
    }
  }

  // Círculos com o alcance de um tipo de serviço (1 a 5); 0 esconde
  showCoverage(kind) {
    this.coverageKind = kind;
    const g = this.coverage;
    g.clear();
    if (!kind) return;
    const w = this.world, col = SVC_COLOR[kind], r = SVC_RADIUS[kind];
    for (let i = 0; i < N * N; i++) {
      if (w.svc[i] !== kind) continue;
      const [px, py] = tileToWorld(i % N + 0.5, ((i / N) | 0) + 0.5);
      g.ellipse(px, py, r * HW * Math.SQRT2, r * HH * Math.SQRT2)
        .fill({ color: col, alpha: 0.13 })
        .stroke({ color: col, width: 5, alpha: 0.85 });
    }
  }

  refreshAll() { for (let i = 0; i < N * N; i++) this.refreshTile(i); }

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
      this.groundChunks[k].visible = this.roadChunks[k].visible = this.zoneChunks[k].visible = vis;
    }
    const litOn = this.litAlpha > 0.02;
    for (const o of this.objects.children) o.visible = (!o.isLit || litOn) && this.inView(o.x, o.y);
    for (const o of this.glowLayer.children) o.visible = this.inView(o.x, o.y);
    for (const o of this.lightsLayer.children) if (!o.isHeadlight) o.visible = this.inView(o.x, o.y);
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
      const area = SVC_KEY.indexOf(state);
      s.visible = true;
      s.position.set(px, py);
      s.tint = area > 0 ? SVC_COLOR[area] : { ok: 0x8cff96, bad: 0xff5a4a }[state] ?? 0xffffff;
      s.alpha = state === 'skip' ? 0.3 : area > 0 ? 0.38 : 0.8;
    }
  }
}
