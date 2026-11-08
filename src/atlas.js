// Junta todos os sprites em poucas texturas grandes (atlas), o que deixa o
// WebGL desenhar milhares de tiles em poucas chamadas.
import { Texture, CanvasSource, Rectangle } from '../lib/pixi.min.mjs';
import { allSprites, drawLit } from './art.js';

const PAGE = 2048, PAD = 4;

// Janelas acesas à noite: o prédio é desenhado de novo com parte das janelas
// acesas (drawLit) e a textura "lit_" guarda só os pixels que mudaram.
const LIT_KEYS = /^(b\d|svc(1|3|4|5|7|8|9|11|12|13)$)/;
function litVersion(s, fn) {
  let seed = 0;
  for (const ch of s.key) seed = (seed * 31 + ch.charCodeAt(0)) | 0;
  const l = drawLit(fn, seed);
  const a = s.c.getContext('2d').getImageData(0, 0, s.w, s.h).data;
  const lit = l.c.getContext('2d').getImageData(0, 0, s.w, s.h);
  const b = lit.data;
  let any = false;
  for (let k = 0; k < a.length; k += 4) {
    const d = Math.abs(a[k] - b[k]) + Math.abs(a[k + 1] - b[k + 1]) + Math.abs(a[k + 2] - b[k + 2]);
    if (d < 40) { b[k + 3] = 0; continue; }
    b[k + 3] = Math.min(255, d * 1.5) * (b[k + 3] / 255);
    any = true;
  }
  if (!any) return null;
  l.c.getContext('2d').putImageData(lit, 0, 0);
  return { key: 'lit_' + s.key, c: l.c, w: s.w, h: s.h, ax: s.ax, ay: s.ay };
}

export function buildAtlas() {
  const fns = allSprites();
  const sprites = Object.entries(fns).map(([key, fn]) => ({ key, ...fn() }));
  for (const s of sprites.slice()) {
    if (!LIT_KEYS.test(s.key)) continue;
    const lit = litVersion(s, fns[s.key]);
    if (lit) sprites.push(lit);
  }
  sprites.sort((a, b) => b.h - a.h);

  const pages = [];
  let page = null, cx = 0, cy = 0, rowH = 0;
  const newPage = () => {
    const c = document.createElement('canvas');
    c.width = c.height = PAGE;
    page = { c, x: c.getContext('2d') };
    pages.push(page);
    cx = PAD; cy = PAD; rowH = 0;
  };
  newPage();
  for (const s of sprites) {
    if (cx + s.w + PAD > PAGE) { cx = PAD; cy += rowH + PAD; rowH = 0; }
    if (cy + s.h + PAD > PAGE) newPage();
    page.x.drawImage(s.c, cx, cy);
    s.page = page; s.px = cx; s.py = cy;
    cx += s.w + PAD;
    rowH = Math.max(rowH, s.h);
  }

  const sources = new Map(pages.map(p => [p, new CanvasSource({
    resource: p.c, autoGenerateMipmaps: true, scaleMode: 'linear', mipmapFilter: 'linear',
  })]));

  const tex = {};
  for (const s of sprites) {
    tex[s.key] = {
      texture: new Texture({ source: sources.get(s.page), frame: new Rectangle(s.px, s.py, s.w, s.h) }),
      ax: s.ax / s.w,
      ay: s.ay / s.h,
    };
  }
  return { tex, pages: pages.map(p => p.c) };
}
