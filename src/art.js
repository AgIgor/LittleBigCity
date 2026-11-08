// Sprites desenhados por código, no mesmo espírito do Mata Viva.
// Cada sprite é desenhado uma vez num canvas e depois vai para o atlas.
// A âncora (ax, ay) é o vértice de cima do losango do tile.
import { TW, TH } from './config.js';
import { mulberry32 } from './rng.js';

const HW = TW / 2, HH = TH / 2;
const P = (u, v, z = 0) => [(u - v) * HW, (u + v) * HH - z];

function mk(w, h, ax, ay, fn) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.translate(ax, ay);
  x.lineJoin = 'round'; x.lineCap = 'round';
  fn(x);
  return { c, w, h, ax, ay };
}

// ---------- cores ----------
function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function shade(hex, f) {
  const [r, g, b] = rgb(hex);
  const k = v => Math.max(0, Math.min(255, Math.round(f >= 1 ? v + (255 - v) * (f - 1) : v * f)));
  return `rgb(${k(r)},${k(g)},${k(b)})`;
}
function mix(a, b, t) {
  const A = rgb(a), B = rgb(b);
  return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`;
}
const pick = (r, arr) => arr[(r() * arr.length) | 0];

// ---------- primitivas ----------
function poly(x, pts, fill, stroke, lw = 1) {
  x.beginPath();
  x.moveTo(pts[0][0], pts[0][1]);
  for (let k = 1; k < pts.length; k++) x.lineTo(pts[k][0], pts[k][1]);
  x.closePath();
  if (fill) { x.fillStyle = fill; x.fill(); }
  if (stroke) { x.strokeStyle = stroke; x.lineWidth = lw; x.stroke(); }
}
function circle(x, cx, cy, r, fill) { x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fillStyle = fill; x.fill(); }
function ellipse(x, cx, cy, rx, ry, fill) { x.beginPath(); x.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); x.fillStyle = fill; x.fill(); }
const quad = (u0, v0, u1, v1, z = 0) => [P(u0, v0, z), P(u1, v0, z), P(u1, v1, z), P(u0, v1, z)];

// Desenha no plano do chão usando coordenadas (u, v) de 0 a 1
function onGround(x, fn) {
  x.save();
  x.transform(HW, HH, -HW, HH, 0, 0);
  fn(x);
  x.restore();
}
function clipDiamond(x, e = 0) {
  x.beginPath();
  const pts = [P(-e, -e), P(1 + e, -e), P(1 + e, 1 + e), P(-e, 1 + e)];
  x.moveTo(...pts[0]); for (const p of pts.slice(1)) x.lineTo(...p);
  x.closePath();
  x.clip();
}

const EDGE = 'rgba(28,24,20,.55)';

// Caixa: desenha só as faces visíveis (direita u=u1, esquerda v=v1, topo)
function box(x, u0, v0, u1, v1, z0, z1, col, opt = {}) {
  poly(x, [P(u1, v0, z0), P(u1, v1, z0), P(u1, v1, z1), P(u1, v0, z1)], shade(col, opt.right ?? 0.86), EDGE);
  poly(x, [P(u0, v1, z0), P(u1, v1, z0), P(u1, v1, z1), P(u0, v1, z1)], shade(col, opt.left ?? 0.68), EDGE);
  if (opt.top !== false) poly(x, quad(u0, v0, u1, v1, z1), opt.topCol || shade(col, 1.04), EDGE);
}

// Retângulo pintado numa face: face 'R' (u = c) ou 'L' (v = c); a = posição ao longo da face
function faceRect(x, face, c, a0, a1, z0, z1, fill, stroke) {
  const pts = face === 'R'
    ? [P(c, a0, z0), P(c, a1, z0), P(c, a1, z1), P(c, a0, z1)]
    : [P(a0, c, z0), P(a1, c, z0), P(a1, c, z1), P(a0, c, z1)];
  poly(x, pts, fill, stroke, 0.8);
}

function windows(x, face, c, a0, a1, z0, floors, floorH, per, col, glint) {
  const span = (a1 - a0) / per;
  for (let f = 0; f < floors; f++) for (let k = 0; k < per; k++) {
    const wa = a0 + span * k + span * 0.22, wb = a0 + span * (k + 1) - span * 0.22;
    const za = z0 + f * floorH + floorH * 0.32, zb = z0 + f * floorH + floorH * 0.78;
    faceRect(x, face, c, wa, wb, za, zb, col, 'rgba(240,235,220,.55)');
    if (glint) faceRect(x, face, c, wa, wa + (wb - wa) * 0.35, za + (zb - za) * 0.5, zb, glint);
  }
}

// Telhado de duas águas com cumeeira ao longo de u ('u') ou de v ('v')
function gable(x, u0, v0, u1, v1, z, rh, axis, roof, wall, e = 0.05) {
  const dark = shade(roof, 0.72), lite = shade(roof, 1.0);
  if (axis === 'u') {
    const vm = (v0 + v1) / 2;
    poly(x, [P(u0 - e, v0 - e, z), P(u1 + e, v0 - e, z), P(u1 + e, vm, z + rh), P(u0 - e, vm, z + rh)], lite, EDGE);
    poly(x, [P(u1, v0, z), P(u1, v1, z), P(u1, vm, z + rh)], shade(wall, 0.92), EDGE);
    poly(x, [P(u0 - e, vm, z + rh), P(u1 + e, vm, z + rh), P(u1 + e, v1 + e, z), P(u0 - e, v1 + e, z)], dark, EDGE);
    stripes(x, 'u', u0 - e, u1 + e, vm, v1 + e, z, rh);
  } else {
    const um = (u0 + u1) / 2;
    poly(x, [P(u0 - e, v0 - e, z), P(um, v0 - e, z + rh), P(um, v1 + e, z + rh), P(u0 - e, v1 + e, z)], lite, EDGE);
    poly(x, [P(u0, v1, z), P(u1, v1, z), P(um, v1, z + rh)], shade(wall, 0.72), EDGE);
    poly(x, [P(um, v0 - e, z + rh), P(u1 + e, v0 - e, z), P(u1 + e, v1 + e, z), P(um, v1 + e, z + rh)], shade(roof, 0.86), EDGE);
  }
}
// Linhas de telha na água da frente
function stripes(x, axis, u0, u1, vm, v1, z, rh) {
  x.strokeStyle = 'rgba(0,0,0,.16)'; x.lineWidth = 1;
  for (let t = 0.25; t < 1; t += 0.25) {
    const v = vm + (v1 - vm) * t, zz = z + rh * (1 - t);
    x.beginPath(); x.moveTo(...P(u0, v, zz)); x.lineTo(...P(u1, v, zz)); x.stroke();
  }
}

// Telhado de quatro águas
function hip(x, u0, v0, u1, v1, z, rh, roof, e = 0.05) {
  u0 -= e; v0 -= e; u1 += e; v1 += e;
  const um = (u0 + u1) / 2, vm = (v0 + v1) / 2, inset = Math.min(u1 - u0, v1 - v0) * 0.5;
  const ra = [um - Math.max(0, (u1 - u0) / 2 - inset), vm - Math.max(0, (v1 - v0) / 2 - inset)];
  const rb = [um + Math.max(0, (u1 - u0) / 2 - inset), vm + Math.max(0, (v1 - v0) / 2 - inset)];
  const A = P(ra[0], ra[1], z + rh), B = P(rb[0], ra[1], z + rh), C = P(rb[0], rb[1], z + rh), D = P(ra[0], rb[1], z + rh);
  poly(x, [P(u0, v0, z), P(u1, v0, z), B, A], shade(roof, 1.08), EDGE);       // fundo (-v)
  poly(x, [P(u0, v0, z), A, D, P(u0, v1, z)], shade(roof, 1.0), EDGE);        // fundo (-u)
  poly(x, [P(u1, v0, z), P(u1, v1, z), C, B], shade(roof, 0.88), EDGE);       // frente (+u)
  poly(x, [P(u0, v1, z), D, C, P(u1, v1, z)], shade(roof, 0.7), EDGE);        // frente (+v)
}

// Laje com mureta
function flatRoof(x, u0, v0, u1, v1, z, col, par = 5) {
  poly(x, quad(u0, v0, u1, v1, z), shade(col, 0.8), EDGE);
  const t = 0.035;
  box(x, u0, v0, u1, v0 + t, z, z + par, col, { left: 0.9 });
  box(x, u0, v0, u0 + t, v1, z, z + par, col);
  box(x, u1 - t, v0, u1, v1, z, z + par, col);
  box(x, u0, v1 - t, u1, v1, z, z + par, col);
}

function groundShadow(x, u0, v0, u1, v1, h) {
  const s = Math.min(0.5, h / 160);
  poly(x, [P(u0, v1), P(u1, v1), P(u1 - s * 0.3, v1 + s), P(u0 - s * 0.3, v1 + s)], 'rgba(20,30,10,.22)');
  poly(x, [P(u0, v0), P(u0, v1), P(u0 - s * 0.3, v1 + s), P(u0 - s * 0.3, v0 + s)], 'rgba(20,30,10,.22)');
}

function lot(x, fill, inset = 0.04, edge) {
  poly(x, quad(inset, inset, 1 - inset, 1 - inset), fill, edge || 'rgba(0,0,0,.18)');
}

// ======================================================================
// Terreno
// ======================================================================
const GROUND_W = TW + 4, GROUND_H = TH + 4;
function groundTile(base, specks, seed, extra) {
  return mk(GROUND_W, GROUND_H, HW + 2, 2, x => {
    const r = mulberry32(seed);
    x.save();
    clipDiamond(x, 0.018);
    x.fillStyle = base; x.fillRect(-HW - 2, -2, TW + 4, TH + 4);
    for (let k = 0; k < 160; k++) {
      const u = r(), v = r(), [px, py] = P(u, v);
      x.fillStyle = pick(r, specks);
      x.fillRect(px, py, 1 + r() * 2.2, 1 + r() * 1.2);
    }
    if (extra) extra(x, r);
    x.restore();
  });
}

function grassTile(seed) {
  return groundTile('#7d9a4c', ['#6f8c41', '#89a656', '#93ad5c', '#6a8640', '#7f9a47', '#a3b866'], seed, (x, r) => {
    x.strokeStyle = 'rgba(60,85,30,.55)'; x.lineWidth = 1;
    for (let k = 0; k < 26; k++) {
      const [px, py] = P(r(), r());
      x.beginPath(); x.moveTo(px, py); x.lineTo(px + (r() - 0.5) * 3, py - 3 - r() * 3); x.stroke();
    }
    if (r() < 0.5) for (let k = 0; k < 4; k++) {
      const [px, py] = P(0.15 + r() * 0.7, 0.15 + r() * 0.7);
      circle(x, px, py, 1.4, pick(r, ['#e8e2a0', '#f2f0e8', '#d9b04a']));
    }
  });
}
function sandTile(seed) {
  return groundTile('#cdbd8a', ['#c2b07c', '#d8ca98', '#bca873', '#e0d4a6'], seed);
}
function dirtTile(seed) {
  return groundTile('#8f7553', ['#7f6648', '#9d8461', '#866c4c', '#a58d6a', '#6f5940'], seed, (x, r) => {
    for (let k = 0; k < 3; k++) {
      const [px, py] = P(0.2 + r() * 0.6, 0.2 + r() * 0.6);
      ellipse(x, px, py, 3 + r() * 2, 1.6, 'rgba(70,52,34,.5)');
    }
    // tocos que sobram do desmatamento
    if (r() < 0.6) {
      const [px, py] = P(0.3 + r() * 0.4, 0.3 + r() * 0.4);
      ellipse(x, px, py + 1, 4.5, 2.2, 'rgba(0,0,0,.25)');
      x.fillStyle = '#6b4a2e'; x.fillRect(px - 3, py - 4, 6, 4);
      ellipse(x, px, py - 4, 3, 1.4, '#b08a5a');
    }
  });
}

// Água com margens: bits 1 = terra em y-1, 2 = x+1, 4 = y+1, 8 = x-1
function waterTile(mask) {
  return mk(GROUND_W, GROUND_H, HW + 2, 2, x => {
    const r = mulberry32(900 + mask);
    x.save();
    clipDiamond(x, 0.018);
    x.fillStyle = '#3f6e84'; x.fillRect(-HW - 2, -2, TW + 4, TH + 4);
    onGround(x, g => {
      const bank = (x0, y0, x1, y1, gx0, gy0, gx1, gy1) => {
        const gr = g.createLinearGradient(gx0, gy0, gx1, gy1);
        gr.addColorStop(0, 'rgba(196,182,128,.95)');
        gr.addColorStop(0.35, 'rgba(110,150,140,.7)');
        gr.addColorStop(1, 'rgba(63,110,132,0)');
        g.fillStyle = gr; g.fillRect(x0, y0, x1 - x0, y1 - y0);
      };
      const d = 0.32;
      if (mask & 1) bank(-0.1, -0.1, 1.1, d, 0, 0, 0, d);
      if (mask & 2) bank(1 - d, -0.1, 1.1, 1.1, 1, 0, 1 - d, 0);
      if (mask & 4) bank(-0.1, 1 - d, 1.1, 1.1, 0, 1, 0, 1 - d);
      if (mask & 8) bank(-0.1, -0.1, d, 1.1, 0, 0, d, 0);
      g.strokeStyle = 'rgba(235,245,240,.55)'; g.lineWidth = 0.025;
      const foam = (ax, ay, bx, by) => { g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke(); };
      if (mask & 1) foam(0, 0.07, 1, 0.07);
      if (mask & 2) foam(0.93, 0, 0.93, 1);
      if (mask & 4) foam(0, 0.93, 1, 0.93);
      if (mask & 8) foam(0.07, 0, 0.07, 1);
    });
    x.strokeStyle = 'rgba(190,220,230,.35)'; x.lineWidth = 1.2;
    for (let k = 0; k < 6; k++) {
      const [px, py] = P(0.2 + r() * 0.6, 0.2 + r() * 0.6);
      x.beginPath(); x.moveTo(px - 6, py); x.quadraticCurveTo(px, py - 2, px + 6, py); x.stroke();
    }
    x.restore();
  });
}

// ======================================================================
// Ruas: bits 1 = rua em y-1, 2 = x+1, 4 = y+1, 8 = x-1
// ======================================================================
function paintRoad(x, mask) {
  onGround(x, g => {
    const e = 0.03;
    const arms = (a, b, col) => {
      g.fillStyle = col;
      g.fillRect(a, a, b - a, b - a);
      if (mask & 1) g.fillRect(a, -e, b - a, 0.5 + e);
      if (mask & 2) g.fillRect(0.5, a, 0.5 + e, b - a);
      if (mask & 4) g.fillRect(a, 0.5, b - a, 0.5 + e);
      if (mask & 8) g.fillRect(-e, a, 0.5 + e, b - a);
    };
    arms(0.1, 0.9, '#a39d91');           // calçada
    arms(0.13, 0.87, '#8a857a');         // meio-fio
    arms(0.17, 0.83, '#57554f');         // asfalto
    // textura do asfalto
    const r = mulberry32(40 + mask);
    for (let k = 0; k < 90; k++) {
      g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.08)';
      g.fillRect(0.17 + r() * 0.66, 0.17 + r() * 0.66, 0.015, 0.015);
    }
    // faixa central
    const n = [1, 2, 4, 8].filter(b => mask & b).length;
    if (n && n <= 2) {
      g.fillStyle = '#d8b84a';
      const dash = (ax, ay, bx, by) => {
        for (let st = 0; st < 3; st++) {
          const t0 = st / 3 + 0.04, t1 = t0 + 0.16;
          const x0 = ax + (bx - ax) * t0, y0 = ay + (by - ay) * t0, x1 = ax + (bx - ax) * t1, y1 = ay + (by - ay) * t1;
          g.fillRect(Math.min(x0, x1) - 0.012, Math.min(y0, y1) - 0.012, Math.abs(x1 - x0) + 0.024, Math.abs(y1 - y0) + 0.024);
        }
      };
      if (mask & 1) dash(0.5, 0.5, 0.5, 0);
      if (mask & 2) dash(0.5, 0.5, 1, 0.5);
      if (mask & 4) dash(0.5, 0.5, 0.5, 1);
      if (mask & 8) dash(0.5, 0.5, 0, 0.5);
    }
  });
}

function roadTile(mask) {
  return mk(GROUND_W, GROUND_H, HW + 2, 2, x => {
    x.save();
    clipDiamond(x, 0.018);
    paintRoad(x, mask);
    x.restore();
  });
}

// Ponte: tabuleiro de concreto um pouco acima da água, com guarda-corpo nos
// lados que não continuam e pilar no meio
function bridgeTile(mask) {
  return mk(GROUND_W, GROUND_H + 22, HW + 2, 2, x => {
    const D = 8, conc = '#9a958a';
    const u0 = mask & 8 ? 0 : 0.06, u1 = mask & 2 ? 1 : 0.94, v0 = mask & 1 ? 0 : 0.06, v1 = mask & 4 ? 1 : 0.94;
    poly(x, quad(u0 + 0.06, v0 + 0.12, u1 + 0.06, v1 + 0.12), 'rgba(10,30,40,.35)');
    box(x, 0.4, 0.4, 0.6, 0.6, -20, -D, '#8a857c', { top: false });
    if (!(mask & 2)) poly(x, [P(u1, v0, 0), P(u1, v1, 0), P(u1, v1, -D), P(u1, v0, -D)], shade(conc, 0.82), EDGE);
    if (!(mask & 4)) poly(x, [P(u0, v1, 0), P(u1, v1, 0), P(u1, v1, -D), P(u0, v1, -D)], shade(conc, 0.66), EDGE);
    poly(x, quad(u0, v0, u1, v1), conc);
    x.save();
    x.beginPath();
    const d = quad(u0, v0, u1, v1);
    x.moveTo(...d[0]); for (const q of d.slice(1)) x.lineTo(...q);
    x.closePath(); x.clip();
    paintRoad(x, mask);
    x.restore();
    // guarda-corpo
    const rail = (a, b) => {
      x.strokeStyle = '#d8d4cc'; x.lineWidth = 1.6;
      x.beginPath(); x.moveTo(...P(a[0], a[1], 6)); x.lineTo(...P(b[0], b[1], 6)); x.stroke();
      x.strokeStyle = 'rgba(60,55,50,.8)'; x.lineWidth = 1;
      for (let t = 0; t <= 1.001; t += 0.2) {
        const pu = a[0] + (b[0] - a[0]) * t, pv = a[1] + (b[1] - a[1]) * t;
        x.beginPath(); x.moveTo(...P(pu, pv, 0)); x.lineTo(...P(pu, pv, 6)); x.stroke();
      }
    };
    const k = 0.04;
    if (!(mask & 1)) rail([u0, v0 + k], [u1, v0 + k]);
    if (!(mask & 8)) rail([u0 + k, v0], [u0 + k, v1]);
    if (!(mask & 2)) rail([u1 - k, v0], [u1 - k, v1]);
    if (!(mask & 4)) rail([u0, v1 - k], [u1, v1 - k]);
  });
}

function overlayTile(kind) {
  return mk(GROUND_W, GROUND_H, HW + 2, 2, x => {
    if (kind === 'zone') {
      poly(x, quad(0.07, 0.07, 0.93, 0.93), 'rgba(255,255,255,.28)', 'rgba(255,255,255,.95)', 2);
      x.setLineDash([5, 4]);
      poly(x, quad(0.2, 0.2, 0.8, 0.8), null, 'rgba(255,255,255,.55)', 1.2);
    } else {
      poly(x, quad(0.02, 0.02, 0.98, 0.98), 'rgba(255,255,255,.3)', '#ffffff', 2.5);
    }
  });
}

// ======================================================================
// Vegetação (desenhada em tela, com base no centro do tile)
// ======================================================================
const OBJ_W = TW + 72, OBJ_H = 290, OBJ_AX = OBJ_W / 2, OBJ_AY = OBJ_H - TH - 14;

function trunk(x, bx, by, h, w, col) {
  poly(x, [[bx - w, by], [bx + w, by], [bx + w * 0.45, by - h], [bx - w * 0.45, by - h]], col, 'rgba(30,20,10,.5)');
  x.fillStyle = 'rgba(255,230,190,.15)'; x.fillRect(bx + w * 0.1, by - h, w * 0.4, h);
}

function canopy(x, r, cx, cy, cr, pal) {
  const blobs = [];
  for (let k = 0; k < 10; k++) {
    const a = r() * Math.PI * 2, d = r() * cr * 0.55;
    blobs.push([cx + Math.cos(a) * d * 1.15, cy + Math.sin(a) * d * 0.75, cr * (0.42 + r() * 0.28)]);
  }
  for (const [bx, by, br] of blobs) circle(x, bx, by + 4, br, pal[0]);
  for (const [bx, by, br] of blobs) circle(x, bx - 1, by, br * 0.9, pal[1]);
  for (const [bx, by, br] of blobs) circle(x, bx + br * 0.25, by - br * 0.3, br * 0.55, pal[2]);
  for (let k = 0; k < 14; k++) {
    const a = r() * Math.PI * 2, d = r() * cr * 0.8;
    circle(x, cx + Math.cos(a) * d + 3, cy + Math.sin(a) * d * 0.7 - 5, 1.5 + r() * 2, pal[3]);
  }
}

const PAL_GREEN = [
  ['#2c4423', '#41622d', '#5e8238', '#86a650'],
  ['#2f4826', '#4a6b2f', '#678c3b', '#8fb058'],
  ['#334a22', '#506a28', '#728a34', '#9aae52'],
];
const PAL_IPE_AM = ['#8f6d14', '#c49a1e', '#e6c235', '#f6e27a'];
const PAL_IPE_RX = ['#6b2f5c', '#9a4a86', '#c473ad', '#e6a7d2'];

function roundTree(x, r, bx, by, pal, scale = 1) {
  const h = (30 + r() * 22) * scale, cr = (21 + r() * 9) * scale;
  trunk(x, bx, by, h + cr * 0.3, 3.5 * scale + r() * 1.5, '#5a3e29');
  x.strokeStyle = '#5a3e29'; x.lineWidth = 2;
  for (let k = 0; k < 2; k++) {
    const s = k ? 1 : -1;
    x.beginPath(); x.moveTo(bx, by - h * 0.7); x.lineTo(bx + s * cr * 0.5, by - h - cr * 0.1); x.stroke();
  }
  canopy(x, r, bx, by - h - cr * 0.4, cr, pal);
}

function araucaria(x, r, bx, by) {
  const h = 86 + r() * 26;
  trunk(x, bx, by, h, 3.2, '#5d4232');
  const top = by - h;
  for (let k = 0; k < 4; k++) {
    const y = top + k * 10, w = 40 - k * 8 + r() * 6;
    x.strokeStyle = '#4a3527'; x.lineWidth = 1.6;
    x.beginPath(); x.moveTo(bx, y + 14); x.quadraticCurveTo(bx - w * 0.6, y + 4, bx - w, y + 2); x.stroke();
    x.beginPath(); x.moveTo(bx, y + 14); x.quadraticCurveTo(bx + w * 0.6, y + 4, bx + w, y + 2); x.stroke();
    ellipse(x, bx - w * 0.85, y + 1, 9, 4.5, '#24391d');
    ellipse(x, bx + w * 0.85, y + 1, 9, 4.5, '#2b4422');
    ellipse(x, bx - w * 0.85, y - 1, 6, 2.5, '#3f5f2c');
    ellipse(x, bx + w * 0.85, y - 1, 6, 2.5, '#4a6c32');
  }
  ellipse(x, bx, top - 2, 16, 6, '#2b4422');
  ellipse(x, bx + 2, top - 4, 10, 3, '#4f7234');
}

function palm(x, r, bx, by) {
  const h = 62 + r() * 20, lean = (r() - 0.5) * 22;
  const tx = bx + lean, ty = by - h;
  x.strokeStyle = '#6f5a43'; x.lineWidth = 5;
  x.beginPath(); x.moveTo(bx, by); x.quadraticCurveTo(bx + lean * 0.2, by - h * 0.5, tx, ty); x.stroke();
  x.strokeStyle = 'rgba(40,30,20,.45)'; x.lineWidth = 1;
  for (let t = 0.1; t < 1; t += 0.1) {
    const px = bx + (tx - bx) * t * t, py = by - h * t;
    x.beginPath(); x.moveTo(px - 2.5, py); x.lineTo(px + 2.5, py); x.stroke();
  }
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + r() * 0.3, len = 26 + r() * 10;
    const ex = tx + Math.cos(a) * len, ey = ty + Math.sin(a) * len * 0.45 + 12;
    const mx = tx + Math.cos(a) * len * 0.5, my = ty + Math.sin(a) * len * 0.25 - 8;
    x.strokeStyle = k % 2 ? '#4c7531' : '#6a943e'; x.lineWidth = 4;
    x.beginPath(); x.moveTo(tx, ty); x.quadraticCurveTo(mx, my, ex, ey); x.stroke();
  }
  circle(x, tx, ty, 4, '#5a4a2a');
}

function bushAt(x, r, bx, by, flowers) {
  ellipse(x, bx + 4, by + 1, 14, 5, 'rgba(20,30,10,.25)');
  const pal = pick(r, PAL_GREEN);
  for (let k = 0; k < 5; k++) circle(x, bx + (r() - 0.5) * 16, by - 5 - r() * 6, 6 + r() * 4, pal[1]);
  for (let k = 0; k < 4; k++) circle(x, bx + (r() - 0.5) * 12 + 2, by - 8 - r() * 6, 3 + r() * 3, pal[2]);
  if (flowers) for (let k = 0; k < 6; k++) circle(x, bx + (r() - 0.5) * 18, by - 4 - r() * 12, 1.6, flowers);
}

function rockAt(x, r, bx, by, s) {
  ellipse(x, bx + 4, by + 2, 13 * s, 5 * s, 'rgba(20,20,10,.28)');
  const pts = [];
  const n = 7;
  for (let k = 0; k < n; k++) {
    const a = Math.PI + (k / (n - 1)) * Math.PI, rr = (11 + r() * 5) * s;
    pts.push([bx + Math.cos(a) * rr, by + Math.sin(a) * rr * 0.85]);
  }
  poly(x, pts, '#8b877d', 'rgba(30,30,25,.6)');
  poly(x, [pts[2], pts[3], pts[4], [bx + 2, by - 4 * s]], '#a8a49a');
  poly(x, [pts[4], pts[5], pts[6], [bx + 2, by - 2]], '#6e6a62');
}

function sortedSpots(r, n) {
  const spots = [];
  for (let k = 0; k < n; k++) {
    const u = 0.22 + r() * 0.56, v = 0.22 + r() * 0.56;
    spots.push(P(u, v));
  }
  return spots.sort((a, b) => a[1] - b[1]);
}

function treeTile(variant) {
  return mk(OBJ_W, OBJ_H, OBJ_AX, OBJ_AY, x => {
    const r = mulberry32(5000 + variant * 31);
    const kind = variant < 24 ? 'round' : variant < 28 ? 'arauc' : variant < 30 ? 'palm' : variant < 31 ? 'ipeAm' : 'ipeRx';
    const n = kind === 'arauc' || kind === 'palm' ? 1 + (r() < 0.5) : 2 + (r() < 0.55);
    const spots = sortedSpots(r, n);
    for (const [bx, by] of spots) ellipse(x, bx + 8, by + 2, 24, 10, 'rgba(20,32,10,.26)');
    if (kind === 'ipeAm' || kind === 'ipeRx') {
      const fc = kind === 'ipeAm' ? '#e6c235' : '#c473ad';
      for (let k = 0; k < 18; k++) { const [px, py] = P(0.15 + r() * 0.7, 0.15 + r() * 0.7); circle(x, px, py, 1.3, fc); }
    }
    spots.forEach(([bx, by], k) => {
      if (kind === 'arauc') araucaria(x, r, bx, by);
      else if (kind === 'palm') palm(x, r, bx, by);
      else if (kind === 'round' || k > 0) roundTree(x, r, bx, by, pick(r, PAL_GREEN), k ? 0.85 : 1);
      else roundTree(x, r, bx, by, kind === 'ipeAm' ? PAL_IPE_AM : PAL_IPE_RX, 1.05);
    });
  });
}
export const TREE_VARIANTS = 32;

function bushTile(variant) {
  return mk(OBJ_W, OBJ_H, OBJ_AX, OBJ_AY, x => {
    const r = mulberry32(7000 + variant * 17);
    const flowers = variant % 3 === 0 ? pick(r, ['#e8d84a', '#e07aa8', '#f2f0ea']) : null;
    for (const [bx, by] of sortedSpots(r, 2 + (r() < 0.5))) bushAt(x, r, bx, by, flowers);
  });
}
export const BUSH_VARIANTS = 6;

function rockTile(variant) {
  return mk(OBJ_W, OBJ_H, OBJ_AX, OBJ_AY, x => {
    const r = mulberry32(8000 + variant * 13);
    for (const [bx, by] of sortedSpots(r, 1 + (r() < 0.6))) rockAt(x, r, bx, by, 0.8 + r() * 0.5);
  });
}
export const ROCK_VARIANTS = 4;

// ======================================================================
// Prédios
// ======================================================================
const BLD_H = 360, BLD_AY = BLD_H - TH - 14;
const WALLS = ['#e8dcc0', '#d9c39b', '#c8d4c0', '#e2c4a8', '#d4cce0', '#efe6d0', '#c9b8a0', '#b8c8d0'];
const ROOFS = ['#a5503a', '#8c4636', '#6d6964', '#b0653e', '#7a5a48'];
const GLASS = '#3b4b58', GLINT = 'rgba(170,200,220,.55)';

function building(seed, fn) {
  return mk(OBJ_W, BLD_H, OBJ_AX, BLD_AY, x => fn(x, mulberry32(seed)));
}

function smallTree(x, r, u, v) {
  const [bx, by] = P(u, v);
  ellipse(x, bx + 4, by + 1, 10, 4, 'rgba(20,32,10,.25)');
  roundTree(x, r, bx, by, pick(r, PAL_GREEN), 0.55);
}

function door(x, face, c, a, z = 0, h = 18, col = '#5a3c26') {
  faceRect(x, face, c, a, a + 0.12, z, z + h, col, 'rgba(0,0,0,.4)');
}

// --- Residencial ---
function house(variant) {
  return building(100 + variant, (x, r) => {
    lot(x, '#86a052');
    poly(x, quad(0.55, 0.78, 0.68, 0.98), '#b8ab90');             // caminho
    const wall = pick(r, WALLS), roof = pick(r, ROOFS);
    const u0 = 0.24, v0 = 0.2, u1 = 0.8, v1 = 0.74, h = 30;
    groundShadow(x, u0, v0, u1, v1, h + 20);
    box(x, u0, v0, u1, v1, 0, h, wall, { top: false });
    windows(x, 'R', u1, v0, v1, 0, 1, h, 2, GLASS, GLINT);
    windows(x, 'L', v1, u0, u0 + 0.28, 0, 1, h, 1, GLASS, GLINT);
    door(x, 'L', v1, 0.56, 0, 20);
    gable(x, u0, v0, u1, v1, h, 20 + r() * 6, r() < 0.5 ? 'u' : 'v', roof, wall);
    // cerca baixa
    x.strokeStyle = '#efe8d8'; x.lineWidth = 1.5;
    x.beginPath(); x.moveTo(...P(0.06, 0.94, 6)); x.lineTo(...P(0.5, 0.94, 6)); x.moveTo(...P(0.74, 0.94, 6)); x.lineTo(...P(0.94, 0.94, 6)); x.lineTo(...P(0.94, 0.06, 6)); x.stroke();
    if (r() < 0.7) smallTree(x, r, 0.88, 0.2);
  });
}

function sobrado(variant) {
  return building(200 + variant, (x, r) => {
    lot(x, '#8aa456');
    const wall = pick(r, WALLS), roof = pick(r, ROOFS);
    const u0 = 0.18, v0 = 0.16, u1 = 0.84, v1 = 0.8, fh = 28;
    groundShadow(x, u0, v0, u1, v1, 2 * fh + 26);
    box(x, u0, v0, u1, v1, 0, 2 * fh, wall, { top: false });
    x.strokeStyle = 'rgba(0,0,0,.25)'; x.lineWidth = 1;
    x.beginPath(); x.moveTo(...P(u1, v0, fh)); x.lineTo(...P(u1, v1, fh)); x.lineTo(...P(u0, v1, fh)); x.stroke();
    windows(x, 'R', u1, v0, v1, 0, 2, fh, 3, GLASS, GLINT);
    windows(x, 'L', v1, u0, u1, fh, 1, fh, 3, GLASS, GLINT);
    windows(x, 'L', v1, u0, u0 + 0.3, 0, 1, fh, 1, GLASS, GLINT);
    door(x, 'L', v1, 0.55, 0, 20);
    // sacada
    box(x, 0.3, v1, 0.62, v1 + 0.08, fh - 2, fh + 1, '#d8d2c4');
    x.strokeStyle = '#4a4440'; x.lineWidth = 1;
    for (let a = 0.32; a < 0.62; a += 0.05) { x.beginPath(); x.moveTo(...P(a, v1 + 0.08, fh + 1)); x.lineTo(...P(a, v1 + 0.08, fh + 10)); x.stroke(); }
    x.beginPath(); x.moveTo(...P(0.3, v1 + 0.08, fh + 10)); x.lineTo(...P(0.62, v1 + 0.08, fh + 10)); x.stroke();
    hip(x, u0, v0, u1, v1, 2 * fh, 22, roof);
  });
}

function caixaDagua(x, u, v, z) {
  box(x, u - 0.07, v - 0.07, u + 0.07, v + 0.07, z, z + 6, '#8a8680');
  const [cx, cy] = P(u, v, z + 6);
  x.fillStyle = '#3d6fa8';
  x.fillRect(cx - 9, cy - 12, 18, 12);
  ellipse(x, cx, cy, 9, 4.5, '#2f5a8a');
  ellipse(x, cx, cy - 12, 9, 4.5, '#5a8ac4');
}

function predioRes(variant) {
  return building(300 + variant, (x, r) => {
    lot(x, '#a7a296');
    poly(x, quad(0.06, 0.06, 0.94, 0.3), '#86a052');
    const wall = pick(r, ['#e0d4bc', '#cfd6dc', '#e6c8b2', '#d8d0c0', '#c4b4a4']);
    const floors = 5 + (r() < 0.4), fh = 26;
    const u0 = 0.14, v0 = 0.14, u1 = 0.86, v1 = 0.86, h = floors * fh;
    groundShadow(x, u0, v0, u1, v1, h);
    box(x, u0, v0, u1, v1, 0, h, wall, { top: false });
    // faixas entre andares
    x.strokeStyle = 'rgba(0,0,0,.18)'; x.lineWidth = 1;
    for (let f = 1; f < floors; f++) { x.beginPath(); x.moveTo(...P(u1, v0, f * fh)); x.lineTo(...P(u1, v1, f * fh)); x.lineTo(...P(u0, v1, f * fh)); x.stroke(); }
    windows(x, 'R', u1, v0, v1, 0, floors, fh, 4, GLASS, GLINT);
    windows(x, 'L', v1, u0, u1, fh, floors - 1, fh, 4, GLASS, GLINT);
    faceRect(x, 'L', v1, 0.4, 0.6, 0, 22, '#4a5a64', 'rgba(0,0,0,.4)');    // portaria
    box(x, 0.36, v1, 0.64, v1 + 0.08, 22, 25, '#8a8680');                 // marquise
    flatRoof(x, u0, v0, u1, v1, h, wall);
    caixaDagua(x, 0.36, 0.36, h);
  });
}

// --- Comercial ---
function awning(x, a0, a1, v, z, cols) {
  const n = 6, d = 0.1;
  for (let k = 0; k < n; k++) {
    const s0 = a0 + (a1 - a0) * k / n, s1 = a0 + (a1 - a0) * (k + 1) / n;
    poly(x, [P(s0, v, z), P(s1, v, z), P(s1, v + d, z - 8), P(s0, v + d, z - 8)], cols[k % 2], 'rgba(0,0,0,.3)', 0.6);
  }
}

function sign(x, face, c, a0, a1, z, col) {
  faceRect(x, face, c, a0, a1, z, z + 9, col, 'rgba(0,0,0,.45)');
  x.strokeStyle = 'rgba(255,255,255,.8)'; x.lineWidth = 1.2;
  const [sx, sy] = face === 'L' ? P(a0 + (a1 - a0) * 0.2, c, z + 4.5) : P(c, a0 + (a1 - a0) * 0.2, z + 4.5);
  const [ex, ey] = face === 'L' ? P(a1 - (a1 - a0) * 0.2, c, z + 4.5) : P(c, a1 - (a1 - a0) * 0.2, z + 4.5);
  x.beginPath(); x.moveTo(sx, sy); x.lineTo(ex, ey); x.stroke();
}

const AWN = [['#c8423a', '#efe6d6'], ['#2f7a4a', '#efe6d6'], ['#2e5f9a', '#f0e8d0'], ['#d89a2a', '#4a3a2a']];

function venda(variant) {
  return building(400 + variant, (x, r) => {
    lot(x, '#b0aa9c');
    const wall = pick(r, WALLS), aw = pick(r, AWN);
    const u0 = 0.2, v0 = 0.18, u1 = 0.82, v1 = 0.78, h = 34;
    groundShadow(x, u0, v0, u1, v1, h);
    box(x, u0, v0, u1, v1, 0, h, wall, { top: false });
    faceRect(x, 'L', v1, u0 + 0.06, u1 - 0.06, 2, 22, GLASS, 'rgba(0,0,0,.4)');
    faceRect(x, 'L', v1, u0 + 0.08, u0 + 0.2, 4, 20, GLINT);
    windows(x, 'R', u1, v0, v1, 0, 1, h, 2, GLASS, GLINT);
    awning(x, u0 + 0.02, u1 - 0.02, v1, 26, aw);
    flatRoof(x, u0, v0, u1, v1, h, wall, 7);
    sign(x, 'L', v1, u0 + 0.1, u1 - 0.1, h + 1, aw[0]);
    // caixotes na calçada
    box(x, 0.84, 0.82, 0.92, 0.9, 0, 6, '#b07a42');
  });
}

function loja(variant) {
  return building(500 + variant, (x, r) => {
    lot(x, '#b0aa9c');
    const wall = pick(r, WALLS), aw = pick(r, AWN), fh = 30;
    const u0 = 0.16, v0 = 0.14, u1 = 0.86, v1 = 0.82;
    groundShadow(x, u0, v0, u1, v1, 2 * fh);
    box(x, u0, v0, u1, v1, 0, 2 * fh, wall, { top: false });
    faceRect(x, 'L', v1, u0 + 0.04, u1 - 0.04, 2, 22, GLASS, 'rgba(0,0,0,.4)');
    faceRect(x, 'R', u1, v0 + 0.04, v1 - 0.04, 2, 22, GLASS, 'rgba(0,0,0,.4)');
    windows(x, 'L', v1, u0, u1, fh, 1, fh, 3, GLASS, GLINT);
    windows(x, 'R', u1, v0, v1, fh, 1, fh, 3, GLASS, GLINT);
    awning(x, u0 + 0.02, u1 - 0.02, v1, 27, aw);
    flatRoof(x, u0, v0, u1, v1, 2 * fh, wall, 6);
    sign(x, 'R', u1, v0 + 0.1, v1 - 0.1, 2 * fh - 12, aw[0]);
    box(x, 0.6, 0.3, 0.74, 0.44, 2 * fh, 2 * fh + 10, '#a8a8a4');      // ar-condicionado
  });
}

function escritorio(variant) {
  return building(600 + variant, (x, r) => {
    lot(x, '#b8b4aa');
    poly(x, quad(0.06, 0.06, 0.3, 0.94), '#86a052');
    const glass = pick(r, ['#41627a', '#3a5a6a', '#4a5e74']), floors = 7 + (r() * 2 | 0), fh = 24;
    const u0 = 0.18, v0 = 0.18, u1 = 0.84, v1 = 0.84, h = floors * fh;
    groundShadow(x, u0, v0, u1, v1, h);
    box(x, u0, v0, u1, v1, 0, h, glass, { top: false, right: 1.05, left: 0.78 });
    x.strokeStyle = 'rgba(220,235,245,.35)'; x.lineWidth = 1;
    for (let f = 1; f < floors; f++) { x.beginPath(); x.moveTo(...P(u1, v0, f * fh)); x.lineTo(...P(u1, v1, f * fh)); x.lineTo(...P(u0, v1, f * fh)); x.stroke(); }
    for (let a = 0.2; a < 1; a += 0.2) {
      x.beginPath(); x.moveTo(...P(u1, v0 + (v1 - v0) * a, 0)); x.lineTo(...P(u1, v0 + (v1 - v0) * a, h));
      x.moveTo(...P(u0 + (u1 - u0) * a, v1, 0)); x.lineTo(...P(u0 + (u1 - u0) * a, v1, h)); x.stroke();
    }
    // reflexo diagonal
    poly(x, [P(u1, v0 + 0.1, h * 0.55), P(u1, v0 + 0.3, h * 0.75), P(u1, v0 + 0.3, h * 0.9), P(u1, v0 + 0.1, h * 0.7)], 'rgba(220,240,255,.18)');
    faceRect(x, 'L', v1, 0.42, 0.62, 0, 20, '#2a3640', 'rgba(0,0,0,.5)');
    flatRoof(x, u0, v0, u1, v1, h, '#8f949a', 5);
    box(x, 0.4, 0.4, 0.6, 0.6, h, h + 14, '#9a9ea2');
    x.strokeStyle = '#555'; x.lineWidth = 1.5;
    x.beginPath(); x.moveTo(...P(0.3, 0.3, h)); x.lineTo(...P(0.3, 0.3, h + 30)); x.stroke();
  });
}

// --- Industrial ---
function chimney(x, u, v, z, h, col = '#8a5a46') {
  box(x, u - 0.05, v - 0.05, u + 0.05, v + 0.05, z, z + h, col);
  box(x, u - 0.06, v - 0.06, u + 0.06, v + 0.06, z + h - 4, z + h, '#5a4a40');
}

function galpao(variant) {
  return building(700 + variant, (x, r) => {
    lot(x, '#9c978a');
    const wall = pick(r, ['#b8b2a4', '#a8a092', '#c2b49a']), roof = pick(r, ['#8e959a', '#7d8488', '#9a8a70']);
    const u0 = 0.12, v0 = 0.2, u1 = 0.88, v1 = 0.8, h = 30;
    groundShadow(x, u0, v0, u1, v1, h + 18);
    box(x, u0, v0, u1, v1, 0, h, wall, { top: false });
    faceRect(x, 'L', v1, 0.38, 0.66, 0, 24, '#6a6458', 'rgba(0,0,0,.45)');
    x.strokeStyle = 'rgba(0,0,0,.2)'; x.lineWidth = 1;
    for (let z = 4; z < 24; z += 4) { x.beginPath(); x.moveTo(...P(0.38, v1, z)); x.lineTo(...P(0.66, v1, z)); x.stroke(); }
    windows(x, 'R', u1, v0, v1, h * 0.45, 1, h * 0.55, 3, GLASS);
    gable(x, u0, v0, u1, v1, h, 16, 'u', roof, wall, 0.03);
    // pallets e tambores
    box(x, 0.06, 0.84, 0.2, 0.94, 0, 5, '#a0784a');
    const [bx, by] = P(0.86, 0.9);
    x.fillStyle = '#3a6a8a'; x.fillRect(bx - 4, by - 10, 8, 10); ellipse(x, bx, by - 10, 4, 2, '#5a8aaa');
  });
}

function fabrica(variant) {
  return building(800 + variant, (x, r) => {
    lot(x, '#96918a');
    const wall = pick(r, ['#a8664e', '#b0705a', '#9a5e48']);
    const u0 = 0.14, v0 = 0.16, u1 = 0.86, v1 = 0.84, h = 40;
    groundShadow(x, u0, v0, u1, v1, h + 40);
    box(x, u0, v0, u1, v1, 0, h, wall, { top: false });
    windows(x, 'R', u1, v0, v1, 6, 1, h - 6, 4, GLASS);
    windows(x, 'L', v1, u0, u0 + 0.36, 6, 1, h - 6, 2, GLASS);
    faceRect(x, 'L', v1, 0.56, 0.78, 0, 26, '#5e5a52', 'rgba(0,0,0,.45)');
    // telhado em dente de serra
    poly(x, quad(u0, v0, u1, v1, h), shade('#8a8f92', 0.8), EDGE);
    const teeth = 3, span = (v1 - v0) / teeth;
    for (let k = 0; k < teeth; k++) {
      const a = v0 + span * k, b = a + span;
      poly(x, [P(u0, a, h), P(u1, a, h), P(u1, b, h + 14), P(u0, b, h + 14)], '#9aa0a4', EDGE);
      poly(x, [P(u0, b, h), P(u1, b, h), P(u1, b, h + 14), P(u0, b, h + 14)], '#4a5a66', EDGE);
      poly(x, [P(u1, a, h), P(u1, b, h), P(u1, b, h + 14)], shade(wall, 0.9), EDGE);
    }
    chimney(x, 0.24, 0.26, h, 64);
  });
}

function industria(variant) {
  return building(900 + variant, (x, r) => {
    lot(x, '#8e8a84');
    const u0 = 0.4, v0 = 0.1, u1 = 0.9, v1 = 0.9, h = 56;
    groundShadow(x, 0.08, 0.1, u1, v1, h + 50);
    // silos
    for (const [u, v] of [[0.2, 0.28], [0.2, 0.62]]) {
      const [cx, cy] = P(u, v), sh = 70;
      x.fillStyle = '#c4c2bc'; x.fillRect(cx - 14, cy - sh, 28, sh);
      x.fillStyle = 'rgba(0,0,0,.18)'; x.fillRect(cx - 14, cy - sh, 9, sh);
      x.fillStyle = 'rgba(255,255,255,.2)'; x.fillRect(cx + 5, cy - sh, 4, sh);
      ellipse(x, cx, cy, 14, 7, '#a8a6a0');
      ellipse(x, cx, cy - sh, 14, 7, '#d8d6d0');
      x.strokeStyle = 'rgba(0,0,0,.35)'; x.lineWidth = 0.8;
      x.beginPath(); x.ellipse(cx, cy - sh, 14, 7, 0, 0, Math.PI * 2); x.stroke();
    }
    box(x, u0, v0, u1, v1, 0, h, '#7a8288', { top: false });
    windows(x, 'R', u1, v0, v1, h * 0.5, 1, h * 0.5, 5, '#2f3a44');
    windows(x, 'L', v1, u0, u1, h * 0.5, 1, h * 0.5, 2, '#2f3a44');
    flatRoof(x, u0, v0, u1, v1, h, '#7a8288', 4);
    // tubulação
    box(x, 0.2, 0.44, u0, 0.48, 40, 44, '#b0864a');
    chimney(x, 0.55, 0.3, h, 70, '#9a9a96');
    chimney(x, 0.75, 0.3, h, 56, '#9a9a96');
    x.fillStyle = '#c8423a';
    for (const [u, hh] of [[0.55, 70], [0.75, 56]]) {
      const [cx, cy] = P(u, 0.3, h + hh - 14); x.fillRect(cx - 5, cy, 10, 3);
    }
  });
}

function obra(variant) {
  return building(1000 + variant, (x, r) => {
    lot(x, '#8f7553', 0.04);
    const u0 = 0.22, v0 = 0.2, u1 = 0.8, v1 = 0.78;
    box(x, u0, v0, u1, v1, 0, 4, '#9a968e');
    const h = 26 + variant * 14;
    x.strokeStyle = '#c99a58'; x.lineWidth = 2;
    const posts = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
    for (const [u, v] of posts) { x.beginPath(); x.moveTo(...P(u, v, 4)); x.lineTo(...P(u, v, h)); x.stroke(); }
    for (const z of [h * 0.5, h]) {
      x.beginPath(); x.moveTo(...P(u0, v1, z)); x.lineTo(...P(u1, v1, z)); x.lineTo(...P(u1, v0, z)); x.stroke();
    }
    x.strokeStyle = 'rgba(201,154,88,.7)'; x.lineWidth = 1;
    x.beginPath(); x.moveTo(...P(u0, v1, 4)); x.lineTo(...P(u1, v1, h * 0.5)); x.moveTo(...P(u1, v1, 4)); x.lineTo(...P(u1, v0, h * 0.5)); x.stroke();
    // tijolos e areia
    box(x, 0.08, 0.82, 0.22, 0.94, 0, 7, '#b4583c');
    const [sx, sy] = P(0.86, 0.86);
    poly(x, [[sx - 12, sy + 2], [sx + 12, sy + 2], [sx, sy - 10]], '#c9b07a', 'rgba(0,0,0,.3)');
    // placa amarela
    const [px, py] = P(0.92, 0.5, 0);
    x.fillStyle = '#4a3a2a'; x.fillRect(px - 1, py - 18, 2, 18);
    poly(x, [[px - 7, py - 24], [px + 7, py - 24], [px + 7, py - 15], [px - 7, py - 15]], '#e8c030', 'rgba(0,0,0,.5)');
  });
}

// --- Serviços ---
function chimneyStriped(x, u, v, z, h) {
  const bands = 6;
  for (let k = 0; k < bands; k++) {
    const z0 = z + (h * k) / bands, z1 = z + (h * (k + 1)) / bands;
    box(x, u - 0.045, v - 0.045, u + 0.045, v + 0.045, z0, z1, k % 2 ? '#e8e2d6' : '#c0392b', { top: k === bands - 1 });
  }
}

function usina() {
  return building(1100, x => {
    lot(x, '#9a968c');
    const u0 = 0.08, v0 = 0.14, u1 = 0.56, v1 = 0.86, h = 38;
    groundShadow(x, u0, v0, u1, v1, h + 60);
    box(x, u0, v0, u1, v1, 0, h, '#8d8a84', { top: false });
    windows(x, 'L', v1, u0, u1, h * 0.45, 1, h * 0.5, 3, '#2f3a44');
    windows(x, 'R', u1, v0, v1, h * 0.45, 1, h * 0.5, 4, '#2f3a44');
    faceRect(x, 'L', v1, 0.2, 0.36, 0, 24, '#5a564e', 'rgba(0,0,0,.45)');
    flatRoof(x, u0, v0, u1, v1, h, '#8d8a84', 4);
    // transformadores e postes no pátio
    for (const v of [0.24, 0.5, 0.76]) {
      box(x, 0.68, v - 0.07, 0.8, v + 0.07, 0, 14, '#7a8288');
      box(x, 0.7, v - 0.05, 0.78, v + 0.05, 14, 18, '#5a6268');
    }
    x.strokeStyle = '#4a4440'; x.lineWidth = 1.6;
    for (const v of [0.18, 0.82]) { x.beginPath(); x.moveTo(...P(0.9, v, 0)); x.lineTo(...P(0.9, v, 46)); x.stroke(); }
    x.lineWidth = 1;
    x.beginPath(); x.moveTo(...P(0.9, 0.12, 44)); x.lineTo(...P(0.9, 0.88, 44)); x.stroke();
    x.strokeStyle = 'rgba(40,40,40,.6)';
    for (const v of [0.24, 0.5, 0.76]) { x.beginPath(); x.moveTo(...P(0.74, v, 18)); x.quadraticCurveTo(...P(0.84, v, 26), ...P(0.9, v, 44)); x.stroke(); }
    // cerca
    x.strokeStyle = 'rgba(200,200,190,.8)';
    x.beginPath(); x.moveTo(...P(0.62, 0.96, 0)); x.lineTo(...P(0.96, 0.96, 0)); x.lineTo(...P(0.96, 0.04, 0)); x.stroke();
    chimneyStriped(x, 0.26, 0.3, h, 84);
    // raio no letreiro
    const [cx, cy] = P(0.32, v1, 30);
    poly(x, [[cx + 2, cy - 7], [cx - 3, cy + 1], [cx, cy + 1], [cx - 2, cy + 7], [cx + 4, cy - 1], [cx + 1, cy - 1]], '#f2c94c', 'rgba(0,0,0,.5)', 0.8);
  });
}

function caixaDaguaServico() {
  return building(1200, x => {
    lot(x, '#86a052');
    poly(x, quad(0.25, 0.25, 0.75, 0.75), '#b0aa9c');
    box(x, 0.66, 0.66, 0.9, 0.9, 0, 14, '#d8d0c0');       // casa de bombas
    gable(x, 0.66, 0.66, 0.9, 0.9, 14, 7, 'u', '#8c4636', '#d8d0c0', 0.02);
    const legs = [[0.32, 0.32], [0.68, 0.32], [0.68, 0.68], [0.32, 0.68]], top = 74;
    const [sx, sy] = P(0.5, 0.5);
    ellipse(x, sx + 10, sy + 6, 30, 12, 'rgba(20,32,10,.25)');
    x.strokeStyle = '#6a6660'; x.lineWidth = 3;
    for (const [u, v] of legs) { x.beginPath(); x.moveTo(...P(u, v, 0)); x.lineTo(...P(0.5 + (u - 0.5) * 0.6, 0.5 + (v - 0.5) * 0.6, top)); x.stroke(); }
    x.lineWidth = 1.2; x.strokeStyle = 'rgba(90,86,80,.9)';
    for (const z of [22, 46]) {
      const f = 1 - (z / top) * 0.4;
      const pts = legs.map(([u, v]) => P(0.5 + (u - 0.5) * f, 0.5 + (v - 0.5) * f, z));
      x.beginPath(); x.moveTo(...pts[0]); for (const q of pts.slice(1)) x.lineTo(...q); x.closePath(); x.stroke();
    }
    const [cx, cy] = P(0.5, 0.5, top), th = 30, rw = 22;
    x.fillStyle = '#3d74b0'; x.fillRect(cx - rw, cy - th, rw * 2, th);
    x.fillStyle = 'rgba(0,0,0,.2)'; x.fillRect(cx - rw, cy - th, rw * 0.6, th);
    x.fillStyle = 'rgba(255,255,255,.18)'; x.fillRect(cx + rw * 0.35, cy - th, 5, th);
    ellipse(x, cx, cy, rw, rw * 0.5, '#2f5a8a');
    x.fillStyle = '#e8e4da'; x.fillRect(cx - rw, cy - th * 0.62, rw * 2, 5);
    poly(x, [[cx - rw, cy - th], [cx, cy - th - 14], [cx + rw, cy - th]], '#5a8ac4', 'rgba(0,0,0,.3)');
    ellipse(x, cx, cy - th, rw, rw * 0.5, '#6a9ad0');
    poly(x, [[cx - rw, cy - th], [cx, cy - th - 14], [cx + rw, cy - th], [cx, cy - th + rw * 0.5]], '#5a8ac4', 'rgba(0,0,0,.3)');
  });
}

// Ícone flutuante de serviço faltando (âncora na ponta de baixo)
function badge(kind) {
  return mk(40, 48, 20, 46, x => {
    const col = kind === 'power' ? '#f2c230' : '#3d9be0';
    ellipse(x, 0, -1, 7, 2.5, 'rgba(0,0,0,.3)');
    x.beginPath();
    x.moveTo(0, -4); x.lineTo(-6, -14); x.lineTo(6, -14); x.closePath();
    x.fillStyle = '#fff'; x.fill();
    circle(x, 0, -27, 15, '#fff');
    circle(x, 0, -27, 12.5, col);
    x.fillStyle = '#fff';
    if (kind === 'power') {
      poly(x, [[2, -37], [-6, -25], [-1, -25], [-3, -16], [6, -29], [1, -29]], '#fff');
    } else {
      x.beginPath();
      x.moveTo(0, -38); x.bezierCurveTo(4, -32, 7, -28, 7, -24); x.arc(0, -24, 7, 0, Math.PI); x.bezierCurveTo(-7, -28, -4, -32, 0, -38);
      x.fill();
    }
    x.strokeStyle = 'rgba(0,0,0,.35)'; x.lineWidth = 1;
    x.beginPath(); x.arc(0, -27, 15, 0, Math.PI * 2); x.stroke();
  });
}

function smokePuff() {
  return mk(48, 48, 24, 24, x => {
    const g = x.createRadialGradient(0, 0, 2, 0, 0, 22);
    g.addColorStop(0, 'rgba(255,255,255,.9)');
    g.addColorStop(0.55, 'rgba(255,255,255,.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.beginPath(); x.arc(0, 0, 22, 0, Math.PI * 2); x.fill();
  });
}

// Topo das chaminés, relativo à âncora do sprite (vértice de cima do tile)
export const CHIMNEYS = {
  b32: [P(0.24, 0.26, 104)],
  b33: [P(0.55, 0.3, 126), P(0.75, 0.3, 112)],
  svc1: [P(0.26, 0.3, 122)],
};

// Catálogo de prédios por zona e nível: zona -> nível -> [funções]
export const BUILDINGS = {
  1: { 1: [0, 1, 2, 3].map(v => () => house(v)), 2: [0, 1, 2].map(v => () => sobrado(v)), 3: [0, 1, 2].map(v => () => predioRes(v)) },
  2: { 1: [0, 1, 2].map(v => () => venda(v)), 2: [0, 1].map(v => () => loja(v)), 3: [0, 1].map(v => () => escritorio(v)) },
  3: { 1: [0, 1].map(v => () => galpao(v)), 2: [0, 1].map(v => () => fabrica(v)), 3: [0].map(v => () => industria(v)) },
};

// ======================================================================
// Veículos e pedestres (âncora no vértice de cima do tile; o centro do
// veículo fica no centro do tile). Direção: 0 = +x, 1 = +y, 2 = -x, 3 = -y
// ======================================================================
const VEH_W = 84, VEH_H = 64, VEH_AY = 8;
export const CAR_COLORS = ['#b8423a', '#2e5f9a', '#e6e2d8', '#3a3a3c', '#d8b84a', '#4a7a4a', '#8a8f96', '#7a3a6a'];

function vehicle(col, d, bus) {
  return mk(VEH_W, VEH_H, VEH_W / 2, VEH_AY, x => {
    const alongU = d % 2 === 0, fwd = d < 2 ? 1 : -1;
    const L = bus ? 0.34 : 0.19, W = bus ? 0.105 : 0.085, c = 0.5;
    // retângulo em coordenadas (ao longo, de lado) -> (u0, v0, u1, v1)
    const rect = (a0, a1, b0, b1) => alongU ? [c + a0, c + b0, c + a1, c + b1] : [c + b0, c + a0, c + b1, c + a1];
    const [u0, v0, u1, v1] = rect(-L, L, -W, W);
    poly(x, quad(u0 + 0.02, v0 + 0.04, u1 + 0.03, v1 + 0.04), 'rgba(10,10,5,.3)');
    box(x, u0 + 0.015, v0 + 0.015, u1 - 0.015, v1 - 0.015, 0, 3, '#1e1e1e');
    const top = bus ? 18 : 7.5;
    box(x, u0, v0, u1, v1, 2.5, top, col);
    // lado visível: com o carro ao longo de u o lado é a face L, ao longo de v é a face R
    const side = alongU ? ['L', v1, u0, u1] : ['R', u1, v0, v1];
    if (bus) {
      faceRect(x, side[0], side[1], side[2] + 0.03, side[3] - 0.03, 9, 14.5, '#2c3a46', 'rgba(255,255,255,.25)');
      faceRect(x, side[0], side[1], side[2] + 0.03, side[3] - 0.03, 5, 6.5, '#2e5f9a');
    } else {
      const [a0, a1] = fwd > 0 ? [-0.62 * L, 0.28 * L] : [-0.28 * L, 0.62 * L];
      const [cu0, cv0, cu1, cv1] = rect(a0, a1, -W + 0.015, W - 0.015);
      box(x, cu0, cv0, cu1, cv1, top, top + 5.5, '#2c3640', { topCol: shade(col, 1.08) });
    }
    // faróis (frente) ou lanternas (trás) na ponta que aparece
    const frontVisible = fwd > 0;
    const light = frontVisible ? '#fff6c8' : '#e03a2a';
    const endFace = alongU ? ['R', u1, v0, v1] : ['L', v1, u0, u1];
    faceRect(x, endFace[0], endFace[1], endFace[2] + 0.012, endFace[2] + 0.04, 4, 6.5, light);
    faceRect(x, endFace[0], endFace[1], endFace[3] - 0.04, endFace[3] - 0.012, 4, 6.5, light);
  });
}

const SKIN = ['#f0c8a0', '#d8a878', '#b07a50', '#8a5a38', '#5e3c26'];
const SHIRTS = ['#c8423a', '#2e6fb0', '#e8e2d0', '#3a7a4a', '#d8a02a', '#7a4a9a', '#3a3a3c', '#e07aa0'];

function person(k, frame) {
  return mk(18, 34, 9, 30, x => {
    const r = mulberry32(3000 + k);
    ellipse(x, 1.5, 0.5, 4.5, 1.8, 'rgba(0,0,0,.3)');
    const s = frame ? 2.2 : -2.2;
    x.strokeStyle = pick(r, ['#2e2a28', '#3a4a6a', '#5a4a3a']); x.lineWidth = 2.2;
    x.beginPath(); x.moveTo(-1, -8); x.lineTo(-1 + s, 0); x.moveTo(1, -8); x.lineTo(1 - s, 0); x.stroke();
    x.fillStyle = SHIRTS[k % SHIRTS.length];
    x.beginPath(); x.roundRect(-3.2, -16, 6.4, 9, 2); x.fill();
    x.strokeStyle = 'rgba(0,0,0,.35)'; x.lineWidth = 0.8; x.stroke();
    circle(x, 0, -19, 2.8, pick(r, SKIN));
    if (r() < 0.5) { x.fillStyle = pick(r, ['#2a1e14', '#5a3a1e', '#c8a060', '#1a1a1a']); x.beginPath(); x.arc(0, -19.6, 2.9, Math.PI, 0); x.fill(); }
  });
}
export const PED_VARIANTS = 8;

// Lista completa de sprites a gerar: chave -> função
export function allSprites() {
  const list = {};
  for (let v = 0; v < 4; v++) list['grass' + v] = () => grassTile(10 + v);
  for (let v = 0; v < 2; v++) list['sand' + v] = () => sandTile(20 + v);
  for (let v = 0; v < 3; v++) list['dirt' + v] = () => dirtTile(30 + v);
  for (let m = 0; m < 16; m++) list['water' + m] = () => waterTile(m);
  for (let m = 0; m < 16; m++) list['road' + m] = () => roadTile(m);
  for (let m = 0; m < 16; m++) list['bridge' + m] = () => bridgeTile(m);
  list.zone = () => overlayTile('zone');
  list.cursor = () => overlayTile('cursor');
  for (let v = 0; v < TREE_VARIANTS; v++) list['tree' + v] = () => treeTile(v);
  for (let v = 0; v < BUSH_VARIANTS; v++) list['bush' + v] = () => bushTile(v);
  for (let v = 0; v < ROCK_VARIANTS; v++) list['rock' + v] = () => rockTile(v);
  for (const z in BUILDINGS) for (const lv in BUILDINGS[z]) BUILDINGS[z][lv].forEach((fn, k) => { list[`b${z}${lv}_${k}`] = fn; });
  list.obra0 = () => obra(0);
  list.obra1 = () => obra(1);
  list.svc1 = usina;
  list.svc2 = caixaDaguaServico;
  list.smoke = smokePuff;
  list.badgePower = () => badge('power');
  list.badgeWater = () => badge('water');
  CAR_COLORS.forEach((col, k) => { for (let d = 0; d < 4; d++) list[`car${k}_${d}`] = () => vehicle(col, d); });
  for (let d = 0; d < 4; d++) list['bus_' + d] = () => vehicle('#d9a92a', d, true);
  for (let k = 0; k < PED_VARIANTS; k++) for (let f = 0; f < 2; f++) list[`ped${k}_${f}`] = () => person(k, f);
  return list;
}
