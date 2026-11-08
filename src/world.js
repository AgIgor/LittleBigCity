import {
  N, setMapSize, WATER, SAND, GRASS, DIRT, NONE, TREE, BUSH, ROCK,
  START_MONEY, ROAD_REACH, RESIDENTS, JOBS_C, JOBS_I, ZR, ZC, ZI, SVC_RADIUS, SVC_KEY, SVC_PARK,
  COVER_KINDS, TAX_DEFAULT,
} from './config.js';
import { makeNoise, hash2, mulberry32 } from './rng.js';

const LAYERS = ['terrain', 'obj', 'ov', 'road', 'zone', 'bld', 'bvar', 'cons', 'shade', 'svc'];

// Valor do terreno: mínimo para um prédio residencial ou comercial chegar ao nível 3
export const VALUE_FOR_L3 = 115;

export class World {
  constructor(seed, size = 128) {
    setMapSize(size);
    this.N = N;
    this.seed = seed >>> 0;
    for (const k of LAYERS) this[k] = new Uint8Array(N * N);
    this.roadDist = new Uint8Array(N * N);
    // Coberturas (derivadas da camada svc): power, water, school, health, police
    this.cover = {};
    for (const k of COVER_KINDS) this.cover[k] = new Uint8Array(N * N);
    this.power = this.cover.power;
    this.water = this.cover.water;
    this.value = new Uint8Array(N * N);     // valor do terreno (derivado)
    this.valueVersion = 0;
    this.money = START_MONEY;
    this.day = 0;
    this.clock = 0.33;                       // hora do dia: 0 = meia-noite, 0.5 = meio-dia
    this.tax = { r: TAX_DEFAULT, c: TAX_DEFAULT, i: TAX_DEFAULT };
    this.demand = { r: 1, c: 0, i: 0.3 };
    this.rngState = (this.seed ^ 0x9e3779b9) >>> 0;
    this.stats = {
      pop: 0, jobsC: 0, jobsI: 0, roads: 0, bridges: 0, buildings: 0,
      lack: { power: 0, water: 0, school: 0, health: 0, police: 0 },
      services: [0, 0, 0, 0, 0, 0, 0], lastIncome: 0, lastCost: 0, budget: null,
    };
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
    this.recomputeAll();
  }

  recomputeAll() {
    this.recomputeRoadDist();
    this.recomputeServices();
    this.recomputeValue();
    this.recomputeStats();
  }

  // Marca os tiles dentro do raio de cada serviço
  recomputeServices() {
    for (const k of COVER_KINDS) this.cover[k].fill(0);
    for (let i = 0; i < N * N; i++) {
      const sv = this.svc[i];
      const out = this.cover[SVC_KEY[sv]];
      if (!out) continue;
      const r = SVC_RADIUS[sv], x0 = i % N, y0 = (i / N) | 0;
      for (let y = Math.max(0, y0 - r); y <= Math.min(N - 1, y0 + r); y++) {
        for (let x = Math.max(0, x0 - r); x <= Math.min(N - 1, x0 + r); x++) {
          if ((x - x0) ** 2 + (y - y0) ** 2 <= r * r) out[y * N + x] = 1;
        }
      }
    }
  }

  // Distância até a água, calculada uma vez (o terreno não muda)
  waterDistance() {
    if (this._waterDist) return this._waterDist;
    const d = new Uint8Array(N * N).fill(255);
    let frontier = [];
    for (let i = 0; i < N * N; i++) if (this.terrain[i] === WATER) { d[i] = 0; frontier.push(i); }
    for (let step = 1; step <= 6 && frontier.length; step++) {
      const next = [];
      for (const i of frontier) for (const j of this.neighbors4(i)) if (d[j] === 255) { d[j] = step; next.push(j); }
      frontier = next;
    }
    return (this._waterDist = d);
  }

  // Valor do terreno (0 a 255, base 100): praças, água, mata e serviços
  // valorizam; indústria por perto desvaloriza.
  recomputeValue() {
    const v = new Float32Array(N * N).fill(100);
    const wd = this.waterDistance();
    const add = (i, r, amount) => {
      const x0 = i % N, y0 = (i / N) | 0;
      for (let y = Math.max(0, y0 - r); y <= Math.min(N - 1, y0 + r); y++) {
        for (let x = Math.max(0, x0 - r); x <= Math.min(N - 1, x0 + r); x++) {
          const d = Math.abs(x - x0) + Math.abs(y - y0);
          if (d <= r) v[y * N + x] += amount * (1 - d / (r + 1));
        }
      }
    };
    for (let i = 0; i < N * N; i++) {
      if (this.svc[i] === SVC_PARK) add(i, 6, 16);
      else if (this.bld[i] && this.zone[i] === ZI) add(i, 5, -9 * this.bld[i]);
      else if (this.bld[i] && this.zone[i] === ZC) add(i, 3, 3);
      else if (this.obj[i] === TREE) add(i, 2, 2.5);
    }
    for (let i = 0; i < N * N; i++) {
      if (wd[i] > 0 && wd[i] <= 4) v[i] += (5 - wd[i]) * 7;
      const c = this.cover;
      v[i] += (c.school[i] + c.health[i] + c.police[i]) * 8;
      this.value[i] = Math.max(0, Math.min(255, v[i]));
    }
    this.valueVersion++;
  }

  // Prédios que não conseguem crescer por falta de um serviço:
  // power: qualquer prédio; water: nível 2+; school/health: residencial 2+;
  // police: comércio e indústria 2+
  lacks(i, kind) {
    const lv = this.bld[i];
    if (!lv) return false;
    const z = this.zone[i];
    switch (kind) {
      case 'power': return !this.power[i];
      case 'water': return lv >= 2 && !this.water[i];
      case 'school': case 'health': return z === ZR && lv >= 2 && !this.cover[kind][i];
      case 'police': return (z === ZC || z === ZI) && lv >= 2 && !this.cover.police[i];
    }
    return false;
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
    let pop = 0, jc = 0, ji = 0, roads = 0, bridges = 0, b = 0;
    const services = [0, 0, 0, 0, 0, 0, 0];
    const lack = { power: 0, water: 0, school: 0, health: 0, police: 0 };
    for (let i = 0; i < N * N; i++) {
      if (this.road[i]) { if (this.terrain[i] === WATER) bridges++; else roads++; }
      if (this.svc[i]) services[this.svc[i]]++;
      const lv = this.bld[i];
      if (!lv) continue;
      b++;
      for (const k in lack) if (this.lacks(i, k)) lack[k]++;
      const z = this.zone[i];
      if (z === ZR) pop += RESIDENTS[lv];
      else if (z === ZC) jc += JOBS_C[lv];
      else if (z === ZI) ji += JOBS_I[lv];
    }
    Object.assign(this.stats, { pop, jobsC: jc, jobsI: ji, roads, bridges, buildings: b, lack, services });
  }

  // ---- salvar / carregar ----
  serialize() {
    const data = {
      v: 1, n: N, seed: this.seed, money: this.money, day: this.day, clock: this.clock, tax: this.tax,
      demand: this.demand, rng: this.rngState, stats: this.stats,
    };
    for (const k of LAYERS) data[k] = toB64(this[k]);
    return data;
  }

  static deserialize(data) {
    if (!data || data.v !== 1) return null;
    const w = new World(data.seed, data.n || 128);
    for (const k of LAYERS) if (data[k]) w[k].set(fromB64(data[k]));   // saves antigos não têm 'svc'
    Object.assign(w, { money: data.money, day: data.day, demand: data.demand, rngState: data.rng });
    if (data.clock != null) w.clock = data.clock;
    if (data.tax) Object.assign(w.tax, data.tax);
    for (const k of ['lastIncome', 'lastCost', 'budget']) if (data.stats?.[k] != null) w.stats[k] = data.stats[k];
    w.recomputeAll();
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
