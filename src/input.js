// Mouse, toque e teclado.
// Mouse: botão esquerdo usa a ferramenta, direito/meio arrasta o mapa, roda dá zoom.
// Toque: um dedo usa a ferramenta (ou arrasta, no modo Inspecionar), dois dedos movem e dão zoom.
import { plan, judgeMove } from './actions.js';
import { BY_KEY } from './catalog.js';

// 1 mão, 2 mover, 3 a 8 abrem as categorias do catálogo, 9 demolir
const TOOL_KEYS = { 1: 'inspect', 2: 'move', 3: 'cat:road', 4: 'cat:home', 5: 'cat:shop', 6: 'cat:work', 7: 'cat:deco', 8: 'cat:special', 9: 'demolish' };

export class Input {
  constructor(canvas, game) {
    this.game = game;
    this.scene = game.scene;
    this.pointers = new Map();
    this.mode = null;          // 'tool' | 'pan' | 'pinch'
    this.keys = new Set();
    this.hover = null;

    canvas.addEventListener('pointerdown', e => this.down(e));
    canvas.addEventListener('pointermove', e => this.move(e));
    canvas.addEventListener('pointerup', e => this.up(e));
    canvas.addEventListener('pointercancel', e => this.up(e, true));
    canvas.addEventListener('pointerleave', () => { if (!this.mode) this.clearHover(); });
    canvas.addEventListener('wheel', e => this.wheel(e), { passive: false });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('keydown', e => this.key(e, true));
    window.addEventListener('keyup', e => this.key(e, false));
  }

  tileAt(e) {
    const [x, y] = this.scene.screenToTile(e.offsetX, e.offsetY);
    return { x, y };
  }

  down(e) {
    e.target.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY, sx: e.offsetX, sy: e.offsetY });

    if (this.pointers.size === 2) {           // segundo dedo: cancela a ferramenta e começa o pinça
      this.cancelTool();
      this.mode = 'pinch';
      this.pinch = this.pinchState();
      return;
    }
    if (this.pointers.size > 2) return;

    const panButton = e.pointerType === 'mouse' && (e.button === 1 || e.button === 2);
    // tocar numa moeda coleta, com qualquer ferramenta
    if (!panButton) {
      const coin = this.scene.coinAt(e.offsetX, e.offsetY);
      if (coin >= 0) { this.game.collect(coin); this.mode = 'coin'; return; }
    }
    if (panButton || this.game.tool === 'inspect') {
      this.mode = 'pan';
      this.panMoved = false;
      this.panTool = !panButton;
      return;
    }
    if (e.button !== 0) return;
    this.mode = 'tool';
    this.a = this.b = this.tileAt(e);
    this.updatePreview();
  }

  move(e) {
    const p = this.pointers.get(e.pointerId);
    if (p) { p.px = p.x; p.py = p.y; p.x = e.offsetX; p.y = e.offsetY; }

    if (this.mode === 'pinch' && this.pointers.size >= 2) {
      const s = this.pinchState(), c = this.scene.cam, o = this.pinch;
      const zoom = c.zoom * (s.d / o.d);
      const [wx, wy] = this.scene.screenToWorld(o.cx, o.cy);
      this.scene.setCamera(undefined, undefined, zoom);
      const [nx, ny] = this.scene.screenToWorld(s.cx, s.cy);
      this.scene.setCamera(c.x + wx - nx, c.y + wy - ny);
      this.pinch = s;
      return;
    }
    if (this.mode === 'pan' && p) {
      if (Math.hypot(p.x - p.sx, p.y - p.sy) > 6) this.panMoved = true;
      const c = this.scene.cam;
      this.scene.setCamera(c.x - (p.x - p.px) / c.zoom, c.y - (p.y - p.py) / c.zoom);
      return;
    }
    const t = this.tileAt(e);
    if (this.mode === 'tool') {
      if (t.x !== this.b.x || t.y !== this.b.y) { this.b = t; this.updatePreview(); }
      this.game.ui.costTip(e.clientX, e.clientY, this.lastPlan);
      return;
    }
    if (e.pointerType === 'mouse') {
      if (!this.hover || t.x !== this.hover.x || t.y !== this.hover.y) {
        this.hover = t;
        this.a = this.b = t;
        this.updatePreview();
      }
    }
  }

  up(e, cancelled) {
    const p = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    if (this.mode === 'pinch') {
      if (this.pointers.size === 0) this.mode = null;
      return;
    }
    if (this.mode === 'coin') { this.mode = null; return; }
    if (this.mode === 'pan') {
      if (!cancelled && this.panTool && !this.panMoved && p) this.game.inspect(this.tileAt(e));
      this.mode = null;
      return;
    }
    if (this.mode === 'tool') {
      this.mode = null;
      if (!cancelled && this.game.tool === 'move') this.game.moveClick(this.a);
      else if (!cancelled) this.game.act({ tool: this.game.tool, item: this.game.item, a: this.a, b: this.b });
      this.game.ui.costTip();
      if (e.pointerType === 'mouse') { this.a = this.b = this.tileAt(e); this.updatePreview(); }
      else this.clearHover();
    }
  }

  cancelTool() {
    if (this.mode === 'tool') this.mode = null;
    this.game.ui.costTip();
    this.clearHover();
  }

  clearHover() {
    this.hover = null;
    this.a = this.b = null;
    this.lastPlan = null;
    this.scene.setPreview(null);
    this.game.net.cursor(null);
  }

  updatePreview() {
    const tool = this.game.tool;
    if (!this.a) return;
    this.game.net.cursor(this.b || this.a);
    if (tool === 'inspect') {
      this.lastPlan = null;
      this.scene.setPreview([{ i: this.a.y * this.game.world.N + this.a.x, state: 'skip' }].filter(() => this.game.world.inside(this.a.x, this.a.y)));
      return;
    }
    if (tool === 'move') {
      // sem nada escolhido: realça o que dá para pegar; com algo escolhido: mostra o destino
      const w = this.game.world, i = this.a.y * w.N + this.a.x, from = this.game.moveFrom;
      this.lastPlan = null;
      if (!w.inside(this.a.x, this.a.y)) { this.scene.setPreview(from != null ? [{ i: from, state: 'area' }] : []); return; }
      if (from == null) { this.scene.setPreview([{ i, state: w.item[i] ? 'ok' : 'skip' }]); return; }
      const [state, cost, reason] = judgeMove(w, from, i);
      this.lastPlan = { tiles: [{ i, state }], cost, bad: state === 'bad' ? 1 : 0, reason };
      this.scene.setPreview([{ i: from, state: 'area' }, { i, state }]);
      return;
    }
    this.lastPlan = plan(this.game.world, tool, this.a, this.b, this.game.item);
    const it = BY_KEY[this.game.item];
    if (tool === 'build' && it?.boost && !it.area) {
      // mostra até onde vai o bônus de rendimento
      const w = this.game.world, r = it.boost.r, { x: x0, y: y0 } = this.a, area = [];
      for (let y = y0 - r; y <= y0 + r; y++) for (let x = x0 - r; x <= x0 + r; x++) {
        if ((x !== x0 || y !== y0) && w.inside(x, y) && Math.abs(x - x0) + Math.abs(y - y0) <= r) area.push({ i: y * w.N + x, state: 'area' });
      }
      this.scene.setPreview(this.lastPlan.tiles.concat(area));
    } else this.scene.setPreview(this.lastPlan.tiles);
  }

  pinchState() {
    const [a, b] = [...this.pointers.values()];
    return { d: Math.max(10, Math.hypot(a.x - b.x, a.y - b.y)), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
  }

  wheel(e) {
    e.preventDefault();
    const c = this.scene.cam;
    const [wx, wy] = this.scene.screenToWorld(e.offsetX, e.offsetY);
    this.scene.setCamera(undefined, undefined, c.zoom * Math.exp(-e.deltaY * 0.0015));
    const [nx, ny] = this.scene.screenToWorld(e.offsetX, e.offsetY);
    this.scene.setCamera(c.x + wx - nx, c.y + wy - ny);
  }

  key(e, down) {
    if (e.target.tagName === 'INPUT') return;
    const k = e.key.toLowerCase();
    if (down) {
      const t = TOOL_KEYS[k];
      if (t?.startsWith('cat:')) this.game.ui.openCat(t.slice(4));
      else if (t) this.game.setTool(t);
      else if (k === ' ') { e.preventDefault(); this.game.togglePause(); }
      else if (k === 'escape') {
        // no Mover, Esc primeiro solta a construção escolhida
        if (this.game.tool === 'move' && this.game.moveFrom != null) { this.game.moveFrom = null; this.game.ui.setTool('move'); this.refresh(); }
        else { this.cancelTool(); this.game.setTool('inspect'); this.game.ui.closeCat(); }
      }
      else if (k === 'c') this.game.collectAll();
      else if (k === '+' || k === '=') this.scene.setCamera(undefined, undefined, this.scene.cam.zoom * 1.2);
      else if (k === '-') this.scene.setCamera(undefined, undefined, this.scene.cam.zoom / 1.2);
      this.keys.add(k);
    } else this.keys.delete(k);
  }

  // Movimento contínuo pelo teclado (chamado a cada quadro)
  update(dt) {
    let dx = 0, dy = 0;
    const k = this.keys;
    if (k.has('a') || k.has('arrowleft')) dx--;
    if (k.has('d') || k.has('arrowright')) dx++;
    if (k.has('w') || k.has('arrowup')) dy--;
    if (k.has('s') || k.has('arrowdown')) dy++;
    if (dx || dy) {
      const c = this.scene.cam, sp = 900 * dt / c.zoom;
      this.scene.setCamera(c.x + dx * sp, c.y + dy * sp);
    }
  }

  // Chamado quando o mundo muda (a pré-visualização pode ter ficado velha)
  refresh() { if (this.a) this.updatePreview(); }
}

