import {
  N, WATER, SAND, GRASS, DIRT, NONE, TREE, BUSH, ROCK,
  START_MONEY, ROAD_REACH, RESIDENTS, JOBS_C, JOBS_I, ZR, ZC, ZI, SVC_RADIUS,
} from './config.js';
import { makeNoise, hash2, mulberry32 } from './rng.js';

const LAYERS = ['terrain', 'obj', 'ov', 'road', 'zone', 'bld', 'bvar', 'cons', 'shade', 'svc'];

export class World {
  constructor(seed) {
    this.N = N;
    this.seed = seed >>> 0;
    for (const k of LAYERS) this[k] = new Uint8Array(N * N);
    this.roadDist = new Uint8Array(N * N);
    this.power = new Uint8Array(N * N);   // cobertura de energia (derivada de svc)
    this.water = new Uint8Array(N * N);   // cobertura de água
    this.money = START_MONEY;
    this.day = 0;
    this.demand = { r: 1, c: 0, i: 0.3 };
    this.rngState = (this.seed ^ 0x9e3779b9) >>> 0;
    this.stats = { pop: 0, jobsC: 0, jobsI: 0, roads: 0, bridges: 0, buildings: 0, noPower: 0, noWater: 0, services: [0, 0, 0], lastIncome: 0, lastCost: 0 };
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

    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = this.idx(x, y);
      const a = riverAlongY ? y : x, b = riverAlongY ? x : y;
      const center = N * (riverBase + 0.35 * (riv(a / 70, 0.5, 3) - 0.5));
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
    this.recomputeRoadDist();
    this.recomputeServices();
    this.recomputeStats();
  }

  // Marca os tiles dentro do raio de cada usina / caixa d'água
  recomputeServices() {
    this.power.fill(0); this.water.fill(0);
    for (let i = 0; i < N * N; i++) {
      const k = this.svc[i];
      if (!k) continue;
      const out = k === 1 ? this.power : this.water, r = SVC_RADIUS[k], x0 = i % N, y0 = (i / N) | 0;
      for (let y = Math.max(0, y0 - r); y <= Math.min(N - 1, y0 + r); y++) {
        for (let x = Math.max(0, x0 - r); x <= Math.min(N - 1, x0 + r); x++) {
          if ((x - x0) ** 2 + (y - y0) ** 2 <= r * r) out[y * N + x] = 1;
        }
      }
    }
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

  // Depois de mexer em ruas: o alcance muda até ROAD_REACH tiles ao redor,
  // então as marcações de zona dessa área precisam ser redesenhadas.
  roadsChangedAt(tiles) {
    this.recomputeRoadDist();
    for (const i of tiles) {
      const x = i % N, y = (i / N) | 0;
      for (let dy = -ROAD_REACH; dy <= ROAD_REACH; dy++) for (let dx = -ROAD_REACH; dx <= ROAD_REACH; dx++) {
        if (this.inside(x + dx, y + dy)) this.dirty.add(this.idx(x + dx, y + dy));
      }
    }
  }

  // Estado de um tile para enviar pela rede
  tileState(i) {
    return [i, this.terrain[i], this.obj[i], this.road[i], this.zone[i], this.bld[i], this.bvar[i], this.cons[i], this.svc[i]];
  }
  // Devolve o que mudou de estrutural (ruas, serviços) para o chamador recalcular
  setTileState([i, t, o, r, z, b, bv, c, sv = 0]) {
    const changed = { road: this.road[i] !== r, svc: this.svc[i] !== sv };
    this.terrain[i] = t; this.obj[i] = o; this.road[i] = r; this.zone[i] = z;
    this.bld[i] = b; this.bvar[i] = bv; this.cons[i] = c; this.svc[i] = sv;
    this.markDirty(i);
    return changed;
  }

  recomputeStats() {
    let pop = 0, jc = 0, ji = 0, roads = 0, bridges = 0, b = 0, noPower = 0, noWater = 0;
    const services = [0, 0, 0];
    for (let i = 0; i < N * N; i++) {
      if (this.road[i]) { if (this.terrain[i] === WATER) bridges++; else roads++; }
      if (this.svc[i]) services[this.svc[i]]++;
      const lv = this.bld[i];
      if (!lv) continue;
      b++;
      if (!this.power[i]) noPower++;
      if (lv >= 2 && !this.water[i]) noWater++;
      const z = this.zone[i];
      if (z === ZR) pop += RESIDENTS[lv];
      else if (z === ZC) jc += JOBS_C[lv];
      else if (z === ZI) ji += JOBS_I[lv];
    }
    Object.assign(this.stats, { pop, jobsC: jc, jobsI: ji, roads, bridges, buildings: b, noPower, noWater, services });
  }

  // ---- salvar / carregar ----
  serialize() {
    const data = { v: 1, seed: this.seed, money: this.money, day: this.day, demand: this.demand, rng: this.rngState, stats: this.stats };
    for (const k of LAYERS) data[k] = toB64(this[k]);
    return data;
  }

  static deserialize(data) {
    if (!data || data.v !== 1) return null;
    const w = new World(data.seed);
    for (const k of LAYERS) if (data[k]) w[k].set(fromB64(data[k]));   // saves antigos não têm 'svc'
    Object.assign(w, { money: data.money, day: data.day, demand: data.demand, rngState: data.rng });
    Object.assign(w.stats, data.stats);
    w.recomputeRoadDist();
    w.recomputeServices();
    w.recomputeStats();
    return w;
  }
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
