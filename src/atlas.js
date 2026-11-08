// Junta todos os sprites em poucas texturas grandes (atlas), o que deixa o
// WebGL desenhar milhares de tiles em poucas chamadas.
import { Texture, CanvasSource, Rectangle } from '../lib/pixi.min.mjs';
import { allSprites } from './art.js';

const PAGE = 2048, PAD = 4;

// Janelas acesas à noite: pega os pixels com cor de vidro (azul-acinzentado
// escuro) e acende só parte deles, sorteando por "célula" de janela.
const LIT_KEYS = /^(b\d|svc[1345]$)/;
function litVersion(s) {
  const src = s.c.getContext('2d').getImageData(0, 0, s.w, s.h);
  const out = new ImageData(s.w, s.h), a = src.data, o = out.data;
  let seed = 0;
  for (const ch of s.key) seed = (seed * 31 + ch.charCodeAt(0)) | 0;
  let any = false;
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
    const k = (y * s.w + x) * 4, r = a[k], g = a[k + 1], b = a[k + 2];
    if (a[k + 3] < 200) continue;
    const glass = b - r > 12 && b - r < 62 && g >= r - 4 && g <= b + 6 && r + g + b < 480;
    if (!glass) continue;
    let h = Math.imul(((x / 7) | 0) * 73856093 ^ ((y / 9) | 0) * 19349663 ^ seed, 2654435761) >>> 0;
    if ((h & 1023) / 1023 > 0.55) continue;
    const warm = (h >> 10) & 1;
    o[k] = 255; o[k + 1] = warm ? 214 : 236; o[k + 2] = warm ? 130 : 190; o[k + 3] = 235;
    any = true;
  }
  if (!any) return null;
  const c = document.createElement('canvas');
  c.width = s.w; c.height = s.h;
  c.getContext('2d').putImageData(out, 0, 0);
  return { key: 'lit_' + s.key, c, w: s.w, h: s.h, ax: s.ax, ay: s.ay };
}

export function buildAtlas() {
  const sprites = Object.entries(allSprites()).map(([key, fn]) => ({ key, ...fn() }));
  for (const s of sprites.slice()) {
    if (!LIT_KEYS.test(s.key)) continue;
    const lit = litVersion(s);
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
