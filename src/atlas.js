// Junta todos os sprites em poucas texturas grandes (atlas), o que deixa o
// WebGL desenhar milhares de tiles em poucas chamadas.
import { Texture, CanvasSource, Rectangle } from '../lib/pixi.min.mjs';
import { allSprites } from './art.js';

const PAGE = 2048, PAD = 4;

export function buildAtlas() {
  const sprites = Object.entries(allSprites()).map(([key, fn]) => ({ key, ...fn() }));
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
