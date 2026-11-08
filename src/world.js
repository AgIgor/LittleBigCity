import {
  N, setMapSize, WATER, SAND, GRASS, DIRT, NONE, TREE, BUSH, ROCK, START_MONEY, ROAD_REACH, SUN,
} from './config.js';
import { ITEMS, BY_KEY, xpForLevel, areaHalf, MAX_BOOST } from './catalog.js';
import { makeNoise, hash2, mulberry32 } from './rng.js';

// road: 0 nada, 1 rua, 2 avenida. item: id do catálogo (0 = nada).
// cons: dias de obra que faltam. timer: dias até a próxima moeda. coin: 1 = moeda esperando coleta.
const LAYERS = ['terrain', 'obj', 'ov', 'road', 'item', 'bvar', 'cons', 'shade', 'timer', 'coin'];
const TREE_BOOST = BY_KEY.tree.boost;

export class World {
  constructor(seed, size = 128) {
    setMapSize(size);
    this.N = N;
    this.seed = seed >>> 0;
    for (const k of LAYERS) this[k] = new Uint8Array(N * N);
    this.roadDist = new Uint8Array(N * N);
    this.boost = new Uint8Array(N * N);      // bônus de rendimento em % (derivado)
    this.money = START_MONEY;
    this.xp = 0;
    this.level = 1;
    this.day = 0;
    this.clock = 0.33;                        // hora do dia: 0 = meia-noite, 0.5 = meio-dia
    this.weather = { kind: SUN, until: 4 };
    this.center = { x: N >> 1, y: N >> 1 };   // centro da área construível
    this.rngState = (this.seed ^ 0x9e3779b9) >>> 0;
    this.stats = { pop: 0, jobs: 0, buildings: 0, coins: 0, count: new Array(ITEMS.length).fill(0) };
    this.dirty = new Set();     // tiles que o desenho precisa atualizar
    this.changed = new Set();   // tiles que o anfitrião precisa enviar aos outros jogadores
  }

  idx(x, y) { return y * N + x; }
  inside(x, y) { return x >= 0 && y >= 0 && x < N && y < N; }

  generate() {
    const s = this.seed;
    const elev = makeNoise(s), forest = makeNoise(s + 101), stone = makeNoise(s + 202), riv = makeNoise(s + 303);
    const rand = mulberry32(s + 7);
    const riverAlongY = rand() < 0.5;
    const riverBase = 0.2 + rand() * 0.25;      // rio fora do centro, sobra espaço para a cidade
    const k = 128 / N;                           // mantém o tamanho das manchas em mapas maiores/menores

    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = this.idx(x, y);
      const a = riverAlongY ? y : x, b = riverAlongY ? x : y;
      const center = N * (riverBase + 0.35 * (riv(a * k / 70, 0.5, 3) - 0.5));
      const width = 1.1 + 1.6 * riv(a / 18, 4.7, 2);
      const dRiver = Math.abs(b - center);
      const e = elev(x / 34, y / 34, 5);

      let t = GRASS;
      if (e < 0.3 || dRiver < width) t = WATER;
      else if (e < 0.335 || dRiver < width + 0.9) t = SAND;
      this.terrain[i] = t;

      const f = forest(x / 20, y / 20, 4);
      const h = hash2(x, y, s);
      this.shade[i] = Math.max(0, Math.min(255, 128 + (f - 0.5) * 300 + (h - 0.5) * 30));
      this.ov[i] = (hash2(y, x, s + 1) * 256) | 0;

      if (t === GRASS) {
        if (f > 0.47 && h < (f - 0.42) * 2.6) this.obj[i] = TREE;
        else if (f > 0.38 && h < 0.22) this.obj[i] = BUSH;
        else if (stone(x / 9, y / 9, 2) > 0.7 && h < 0.35) this.obj[i] = ROCK;
      } else if (t === SAND && h < 0.06) this.obj[i] = BUSH;
    }
    this.pickCenter();
    this.recomputeAll();
  }

  // Centro da cidade: o ponto com mais campo aberto em volta, perto do meio do mapa
  pickCenter() {
    let best = -1, bx = N >> 1, by = N >> 1;
    const R = 8;
    for (let y = R; y < N - R; y += 2) for (let x = R; x < N - R; x += 2) {
      let land = 0;
      for (let dy = -R; dy <= R; dy += 2) for (let dx = -R; dx <= R; dx += 2) {
        const j = (y + dy) * N + x + dx;
        if (this.terrain[j] !== WATER) land += this.obj[j] === TREE ? 0.5 : 1;   // campo aberto é melhor para começar
      }
      const score = land * 10 - Math.hypot(x - N / 2, y - N / 2);
      if (score > best) { best = score; bx = x; by = y; }
    }
    this.center = { x: bx, y: by };
  }

  // A área construível cresce com o nível
  get half() { return areaHalf(this.level, N); }
  inArea(x, y) {
    const h = this.half;
    return Math.abs(x - this.center.x) <= h && Math.abs(y - this.center.y) <= h;
  }

  recomputeAll() {
    this.recomputeRoadDist();
    this.recomputeBoost();
    this.recomputeStats();
  }

  // Bônus de rendimento: decoração, especiais e árvores somam em volta
  recomputeBoost() {
    const b = new Float32Array(N * N);
    const add = (i, r, pct) => {
      const x0 = i % N, y0 = (i / N) | 0;
      for (let y = Math.max(0, y0 - r); y <= Math.min(N - 1, y0 + r); y++) {
        for (let x = Math.max(0, x0 - r); x <= Math.min(N - 1, x0 + r); x++) {
          if (Math.abs(x - x0) + Math.abs(y - y0) <= r) b[y * N + x] += pct;
        }
      }
    };
    for (let i = 0; i < N * N; i++) {
      const it = ITEMS[this.item[i]];
      if (it?.boost && !this.cons[i]) add(i, it.boost.r, it.boost.pct);
      else if (this.obj[i] === TREE) add(i, TREE_BOOST.r, TREE_BOOST.pct * 0.5);   // mata nativa vale metade
    }
    for (let i = 0; i < N * N; i++) this.boost[i] = Math.min(MAX_BOOST, Math.round(b[i]));
  }

  // Quanto rende uma coleta neste tile
  payout(i) {
    const it = ITEMS[this.item[i]];
    return it?.income ? Math.round(it.income * (1 + this.boost[i] / 100)) : 0;
  }

  neighbors4(i) {
    const x = i % N, y = (i / N) | 0, out = [];
    if (x > 0) out.push(i - 1);
    if (x < N - 1) out.push(i + 1);
    if (y > 0) out.push(i - N);
    if (y < N - 1) out.push(i + N);
    return out;
  }

  // Bits: 1 = vizinho em y-1, 2 = x+1, 4 = y+1, 8 = x-1
  maskOf(i, test) {
    const x = i % N, y = (i / N) | 0;
    let m = 0;
    if (y > 0 && test(i - N)) m |= 1;
    if (x < N - 1 && test(i + 1)) m |= 2;
    if (y < N - 1 && test(i + N)) m |= 4;
    if (x > 0 && test(i - 1)) m |= 8;
    return m;
  }

  markDirty(i) {
    this.changed.add(i);
    this.dirty.add(i);
    for (const j of this.neighbors4(i)) this.dirty.add(j);
  }

  recomputeRoadDist() {
    const d = this.roadDist;
    d.fill(255);
    let frontier = [];
    for (let i = 0; i < d.length; i++) if (this.road[i]) { d[i] = 0; frontier.push(i); }
    for (let step = 1; step <= ROAD_REACH && frontier.length; step++) {
      const next = [];
      for (const i of frontier) for (const j of this.neighbors4(i)) {
        if (d[j] === 255) { d[j] = step; next.push(j); }
      }
      frontier = next;
    }
  }

  // Experiência: devolve os níveis alcançados (para avisar e premiar)
  addXp(n) {
    this.xp += n;
    const ups = [];
    while (this.xp >= xpForLevel(this.level)) {
      this.xp -= xpForLevel(this.level);
      this.level++;
      ups.push(this.level);
    }
    return ups;
  }

  // Estado de um tile para enviar pela rede
  tileState(i) {
    return [i, this.terrain[i], this.obj[i], this.road[i], this.item[i], this.bvar[i], this.cons[i], this.timer[i], this.coin[i]];
  }
  // Devolve o que mudou de estrutural (ruas, itens) para o chamador recalcular
  setTileState([i, t, o, r, it, bv, c, tm, cn]) {
    const changed = { road: this.road[i] !== r, item: this.item[i] !== it || this.obj[i] !== o || (!!this.cons[i]) !== (!!c) };
    this.terrain[i] = t; this.obj[i] = o; this.road[i] = r; this.item[i] = it;
    this.bvar[i] = bv; this.cons[i] = c; this.timer[i] = tm; this.coin[i] = cn;
    this.markDirty(i);
    return changed;
  }

  recomputeStats() {
    let pop = 0, jobs = 0, b = 0, coins = 0;
    const count = new Array(ITEMS.length).fill(0);
    for (let i = 0; i < N * N; i++) {
      const id = this.item[i];
      if (!id) continue;
      const it = ITEMS[id];
      count[id]++;
      jobs += it.workers || 0;               // vaga ocupada desde a obra
      if (this.cons[i]) continue;
      b++;
      pop += it.pop || 0;
      if (this.coin[i]) coins++;
    }
    Object.assign(this.stats, { pop, jobs, buildings: b, coins, count });
  }
  get freeWorkers() { return this.stats.pop - this.stats.jobs; }

  // ---- salvar / carregar ----
  serialize() {
    const data = {
      v: 2, n: N, seed: this.seed, money: this.money, xp: this.xp, level: this.level, day: this.day,
      clock: this.clock, weather: this.weather, center: this.center, rng: this.rngState,
    };
    for (const k of LAYERS) data[k] = toB64(this[k]);
    return data;
  }

  static deserialize(data) {
    if (data?.v === 1) return migrateV1(data);
    if (!data || data.v !== 2) return null;
    const w = new World(data.seed, data.n || 128);
    for (const k of LAYERS) if (data[k]) w[k].set(fromB64(data[k]));
    Object.assign(w, { money: data.money, xp: data.xp, level: data.level, day: data.day, rngState: data.rng });
    if (data.clock != null) w.clock = data.clock;
    if (data.weather) w.weather = data.weather;
    if (data.center) w.center = data.center;
    w.recomputeAll();
    return w;
  }
}

// Cidade da versão com zonas: cada prédio vira o item equivalente do catálogo
const ZONE_ITEM = { 1: ['house', 'sobrado', 'apart'], 2: ['venda', 'loja', 'office'], 3: ['galpao', 'fabrica', 'industria'] };
const SVC_ITEM = [null, 'power', 'watertower', 'school', 'health', 'police', null, 'garbage', 'recycle', 'fire', 'busstop', 'hall', 'stadium', 'tower'];
const PARK_ITEM = ['fountain', 'playground', 'flowers'];
function migrateV1(data) {
  const w = new World(data.seed, data.n || 128);
  for (const k of ['terrain', 'obj', 'ov', 'road', 'bvar', 'shade']) if (data[k]) w[k].set(fromB64(data[k]));
  const zone = fromB64(data.zone), bld = fromB64(data.bld), cons = fromB64(data.cons);
  const svc = data.svc ? fromB64(data.svc) : new Uint8Array(N * N);
  let x0 = N, y0 = N, x1 = -1, y1 = -1;
  for (let i = 0; i < N * N; i++) {
    let key = null;
    if (svc[i] === 6) key = PARK_ITEM[w.ov[i] % 3];
    else if (svc[i]) key = SVC_ITEM[svc[i]];
    else if (zone[i] && (bld[i] || cons[i])) key = ZONE_ITEM[zone[i]][Math.min(3, Math.max(1, bld[i] + (cons[i] ? 1 : 0))) - 1];
    if (!key) continue;
    const it = BY_KEY[key];
    w.item[i] = it.id;
    w.timer[i] = 1 + (i % (it.period || 1));
    const x = i % N, y = (i / N) | 0;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  for (let i = 0; i < N * N; i++) if (w.road[i]) {
    const x = i % N, y = (i / N) | 0;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  if (x1 < 0) w.pickCenter();
  else {
    // nível que cobre tudo o que já foi construído
    w.center = { x: (x0 + x1) >> 1, y: (y0 + y1) >> 1 };
    const need = Math.max(x1 - x0, y1 - y0) / 2 + 2;
    while (w.level < 30 && w.half < need) w.level++;
    w.money = Math.max(START_MONEY, Math.round(data.money / 10));
  }
  w.day = data.day || 0;
  if (data.clock != null) w.clock = data.clock;
  w.rngState = data.rng >>> 0;
  w.recomputeAll();
  return w;
}

function toB64(arr) {
  let s = '';
  for (let i = 0; i < arr.length; i += 0x8000) s += String.fromCharCode.apply(null, arr.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromB64(str) {
  const s = atob(str), out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export { WATER, SAND, GRASS, DIRT, NONE, TREE, BUSH, ROCK };
