// Aleatório com semente e ruído. Tudo determinístico para que dois jogadores
// com a mesma semente gerem o mesmo mapa (base para o multiplayer).

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Gerador cujo estado pode ser salvo (usado pela simulação)
export class Rng {
  constructor(state) { this.s = state >>> 0; }
  next() {
    let a = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(n) { return (this.next() * n) | 0; }
}

export function hash2(x, y, seed = 0) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Ruído de valor 2D suavizado
export function makeNoise(seed) {
  const smooth = t => t * t * (3 - 2 * t);
  const lerp = (a, b, t) => a + (b - a) * t;
  function value(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = smooth(x - xi), yf = smooth(y - yi);
    const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed);
    const c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
    return lerp(lerp(a, b, xf), lerp(c, d, xf), yf);
  }
  return function fbm(x, y, oct = 4) {
    let s = 0, amp = 1, norm = 0, f = 1;
    for (let o = 0; o < oct; o++) {
      s += value(x * f + o * 17.3, y * f - o * 9.1) * amp;
      norm += amp; amp *= 0.5; f *= 2;
    }
    return s / norm;
  };
}
