// Mouse, toque e teclado.
// Mouse: botão esquerdo usa a ferramenta, direito/meio arrasta o mapa, roda dá zoom.
// Toque: um dedo usa a ferramenta (ou arrasta, no modo Inspecionar), dois dedos movem e dão zoom.
import { TOOLS, plan } from './actions.js';
import { SVC_RADIUS } from './config.js';

const TOOL_KEYS = { 1: 'inspect', 2: 'clear', 3: 'road', 4: 'zoneR', 5: 'zoneC', 6: 'zoneI', 7: 'power', 8: 'water', 9: 'demolish' };

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
    if (this.mode === 'pan') {
      if (!cancelled && this.panTool && !this.panMoved && p) this.game.inspect(this.tileAt(e));
      this.mode = null;
      return;
    }
    if (this.mode === 'tool') {
      this.mode = null;
      if (!cancelled) this.game.act({ tool: this.game.tool, a: this.a, b: this.b });
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
    this.lastPlan = plan(this.game.world, tool, this.a, this.b);
    const svc = TOOLS[tool].svc;
    if (svc) {
      // mostra a área que a usina / caixa d'água vai atender
      const w = this.game.world, r = SVC_RADIUS[svc], { x: x0, y: y0 } = this.a, area = [];
      for (let y = y0 - r; y <= y0 + r; y++) for (let x = x0 - r; x <= x0 + r; x++) {
        if ((x !== x0 || y !== y0) && w.inside(x, y) && (x - x0) ** 2 + (y - y0) ** 2 <= r * r) area.push({ i: y * w.N + x, state: svc === 1 ? 'power' : 'water' });
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
      if (TOOL_KEYS[k]) this.game.setTool(TOOL_KEYS[k]);
      else if (k === ' ') { e.preventDefault(); this.game.togglePause(); }
      else if (k === 'escape') this.cancelTool();
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

export { TOOLS };
