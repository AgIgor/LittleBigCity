// Cena Pixi: camadas de chão, ruas, zonas, objetos (ordenados por profundidade)
// e a pré-visualização da ferramenta.
import { Container, Sprite, Text } from '../lib/pixi.min.mjs';
import { TW, TH, N, CHUNK, WATER, SAND, GRASS, DIRT, TREE, BUSH, ROCK, ZONE_COLOR, ROAD_REACH } from './config.js';
import { TREE_VARIANTS, BUSH_VARIANTS, ROCK_VARIANTS, BUILDINGS } from './art.js';

const HW = TW / 2, HH = TH / 2;
const CN = Math.ceil(N / CHUNK);

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

export class Scene {
  constructor(app, atlas) {
    this.app = app;
    this.tex = atlas.tex;
    this.root = new Container();
    app.stage.addChild(this.root);
    this.cam = { x: 0, y: N * HH, zoom: 0.55 };
    this.camDirty = true;
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
    this.root.removeChildren().forEach(c => c.destroy({ children: true }));
    this.cursorMap = new Map();
    const mkChunks = () => {
      const layer = new Container(), chunks = [];
      for (let k = 0; k < CN * CN; k++) { const c = new Container(); chunks.push(c); layer.addChild(c); }
      this.root.addChild(layer);
      return chunks;
    };
    this.groundChunks = mkChunks();
    this.roadChunks = mkChunks();
    this.zoneChunks = mkChunks();
    this.objects = new Container();
    this.objects.sortableChildren = true;
    this.root.addChild(this.objects);
    this.preview = new Container();
    this.root.addChild(this.preview);
    this.previewPool = [];
    this.cursorLayer = new Container();
    this.root.addChild(this.cursorLayer);
    this.cursorMap = new Map();

    this.groundS = new Array(N * N);
    this.roadS = new Array(N * N).fill(null);
    this.zoneS = new Array(N * N).fill(null);
    this.objS = new Array(N * N).fill(null);
    this.objKey = new Array(N * N).fill('');

    for (let i = 0; i < N * N; i++) {
      const x = i % N, y = (i / N) | 0, [px, py] = tileToWorld(x, y);
      const s = this.sprite('grass0');
      s.position.set(px, py);
      this.groundChunks[this.chunkOf(x, y)].addChild(s);
      this.groundS[i] = s;
      this.refreshTile(i);
    }
    world.dirty.clear();
    this.camDirty = true;
  }

  chunkOf(x, y) { return ((y / CHUNK) | 0) * CN + ((x / CHUNK) | 0); }

  refreshTile(i) {
    const w = this.world, x = i % N, y = (i / N) | 0, [px, py] = tileToWorld(x, y);
    const t = w.terrain[i], ov = w.ov[i];

    // chão
    const g = this.groundS[i];
    if (t === WATER) { this.setTex(g, 'water' + w.maskOf(i, j => w.terrain[j] !== WATER)); g.tint = 0xffffff; }
    else if (t === SAND) { this.setTex(g, 'sand' + (ov % 2)); g.tint = 0xffffff; }
    else if (t === DIRT) { this.setTex(g, 'dirt' + (ov % 3)); g.tint = 0xffffff; }
    else { this.setTex(g, 'grass' + (ov % 4)); g.tint = grassTint(w.shade[i]); }

    // rua
    if (w.road[i]) {
      if (!this.roadS[i]) {
        const s = this.roadS[i] = this.sprite('road0');
        s.position.set(px, py);
        this.roadChunks[this.chunkOf(x, y)].addChild(s);
      }
      this.setTex(this.roadS[i], 'road' + w.maskOf(i, j => w.road[j]));
    } else if (this.roadS[i]) { this.roadS[i].destroy(); this.roadS[i] = null; }

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

    // objeto: obra, prédio ou vegetação
    let key = '';
    if (w.cons[i]) key = 'obra' + (w.bld[i] ? 1 : 0);
    else if (w.bld[i] && w.zone[i]) {
      const list = BUILDINGS[w.zone[i]][w.bld[i]];
      key = `b${w.zone[i]}${w.bld[i]}_${w.bvar[i] % list.length}`;
    } else if (w.obj[i] === TREE) key = 'tree' + (ov % TREE_VARIANTS);
    else if (w.obj[i] === BUSH) key = 'bush' + (ov % BUSH_VARIANTS);
    else if (w.obj[i] === ROCK) key = 'rock' + (ov % ROCK_VARIANTS);

    if (key !== this.objKey[i]) {
      this.objKey[i] = key;
      if (!key) { this.objS[i]?.destroy(); this.objS[i] = null; }
      else {
        if (!this.objS[i]) {
          const s = this.objS[i] = this.sprite(key);
          s.position.set(px, py);
          s.zIndex = (x + y) * 2 + 1;
          s.visible = this.inView(px, py);
          this.objects.addChild(s);
        } else this.setTex(this.objS[i], key);
      }
    }
  }

  // Atualiza o que mudou no mundo desde o último quadro
  sync() {
    const w = this.world;
    if (w.dirty.size) {
      for (const i of w.dirty) this.refreshTile(i);
      w.dirty.clear();
    }
  }

  refreshAll() { for (let i = 0; i < N * N; i++) this.refreshTile(i); }

  // ---------- câmera ----------
  setCamera(x, y, zoom) {
    const c = this.cam;
    c.zoom = Math.max(0.12, Math.min(2.2, zoom ?? c.zoom));
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
    const c = this.cam, s = this.app.screen;
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
    for (const o of this.objects.children) o.visible = this.inView(o.x, o.y);
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
      s.visible = true;
      s.position.set(px, py);
      s.tint = state === 'ok' ? 0x8cff96 : state === 'bad' ? 0xff5a4a : 0xffffff;
      s.alpha = state === 'skip' ? 0.3 : 0.8;
    }
  }
}
