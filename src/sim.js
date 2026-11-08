// Simulação diária da cidade: demanda, crescimento dos prédios, clima,
// incêndios, enchentes, festas, metas e orçamento.
// Determinística (usa o Rng salvo no mundo) para o anfitrião do multiplayer.
import {
  N, GRASS, DIRT, ZR, ZC, ZI, ROAD_REACH, DAYS_PER_MONTH, TAX, TAX_DEFAULT, ROAD_UPKEEP, BRIDGE_UPKEEP, SVC_UPKEEP,
  SVC_PARK, LANDMARKS, MILESTONES, JAM, POLLUTION_L3, SUN, CLOUDY, RAIN, STORM, WATER,
} from './config.js';
import { Rng } from './rng.js';
import { VALUE_FOR_L3 } from './world.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const LEVEL_POP = [0, 0, 120, 600];    // população mínima da cidade para chegar a cada nível
const AVENUE_UPKEEP = 4;               // a mais por tile de avenida
const RECYCLE_INCOME = 0.25;           // por morador atendido pela reciclagem

function targetDemand(w) {
  const s = w.stats, tax = w.tax;
  const jobs = s.jobsC + s.jobsI;
  const wantPop = jobs * 1.5 + 60;                 // as primeiras famílias chegam sem emprego
  const wantC = s.pop * 0.22;
  const wantI = s.pop * 0.34 + 14;
  // cada ponto de imposto acima do padrão espanta um pouco; abaixo, atrai
  const t = z => (tax[z] - TAX_DEFAULT) * 0.06;
  // marcos e festas animam a cidade
  const bonus = { r: 0, c: 0, i: 0 };
  for (const sv in LANDMARKS) if (s.services[sv]) for (const z in LANDMARKS[sv].dem) bonus[z] += LANDMARKS[sv].dem[z];
  if (w.festa) { bonus.r += 0.12; bonus.c += 0.08; }
  return {
    r: clamp((wantPop - s.pop) / (wantPop * 0.35 + 10) - t('r') + bonus.r, -1, 1),
    c: s.pop < 25 ? -0.2 : clamp((wantC - s.jobsC) / (wantC * 0.35 + 6) - t('c') + bonus.c, -1, 1),
    i: clamp((wantI - s.jobsI) / (wantI * 0.35 + 8) - t('i') + bonus.i, -1, 1),
  };
}

// Por que um prédio não pode subir para o nível `level`? '' se pode.
export function upgradeBlock(w, i, level) {
  if (w.fire[i]) return 'apagar o incêndio';
  if (level >= 2 && !w.power[i]) return 'energia';
  if (level >= 3) {
    if (!w.water[i]) return 'água';
    const z = w.zone[i];
    if (z === ZR && !w.cover.school[i]) return 'escola';
    if (z === ZR && !w.cover.health[i]) return 'posto de saúde';
    if ((z === ZC || z === ZI) && !w.cover.police[i]) return 'delegacia';
    if (!w.cover.garbage[i]) return 'coleta de lixo';
    if (w.jam[i] > JAM) return 'ruas menos congestionadas (avenida ou ponto de ônibus)';
    if (z === ZR && w.pollution[i] > POLLUTION_L3) return 'ar mais limpo (longe da indústria, ou reciclagem)';
    if (z !== ZI && w.value[i] < VALUE_FOR_L3) return 'terreno mais valorizado (praças, água, serviços)';
  }
  return '';
}
export function hasServices(w, i, level) { return !upgradeBlock(w, i, level); }

// Residências e comércio crescem mais rápido em terreno valorizado
function valueFactor(w, i) {
  return w.zone[i] === ZI ? 1 : clamp(w.value[i] / 110, 0.35, 1.7);
}

export function monthlyBudget(w) {
  const s = w.stats, t = w.tax;
  const r = s.pop * TAX.resident * t.r / TAX_DEFAULT;
  const c = s.jobsC * TAX.jobC * t.c / TAX_DEFAULT;
  const ind = s.jobsI * TAX.jobI * t.i / TAX_DEFAULT;
  const recycle = s.recyclePop * RECYCLE_INCOME;
  const sv = s.services, up = k => sv[k] * SVC_UPKEEP[k];
  const costs = {
    roads: s.roads * ROAD_UPKEEP + s.avenues * AVENUE_UPKEEP,
    bridges: s.bridges * BRIDGE_UPKEEP,
    utilities: up(1) + up(2) + up(7) + up(8),
    public: up(3) + up(4) + up(5) + up(9) + up(10),
    landmarks: up(11) + up(12) + up(13),
    parks: up(6),
  };
  const income = Math.round(r + c + ind + recycle);
  const cost = Math.round(Object.values(costs).reduce((a, b) => a + b, 0));
  return { income, cost, taxR: Math.round(r), taxC: Math.round(c), taxI: Math.round(ind), recycle: Math.round(recycle), costs };
}

// Próximo clima: tende a continuar parecido; tempestade sempre passa
const WEATHER_NEXT = [
  [0.55, 0.3, 0.12, 0.03],   // depois de sol
  [0.35, 0.3, 0.27, 0.08],   // nublado
  [0.25, 0.35, 0.3, 0.1],    // chuva
  [0.2, 0.4, 0.4, 0],        // tempestade
];
function nextWeather(w, rng, events) {
  if (w.day < w.weather.until) return;
  const row = WEATHER_NEXT[w.weather.kind];
  let r = rng.next(), kind = 0;
  while (kind < 3 && r >= row[kind]) { r -= row[kind]; kind++; }
  const len = kind === STORM ? 1 + rng.int(2) : 2 + rng.int(5);
  if (kind !== w.weather.kind) events.push({ type: 'weather', kind });
  w.weather = { kind, until: w.day + len };
}

// Incêndios: o tempo seco ajuda o fogo a começar, a chuva atrapalha.
// Com bombeiros por perto o fogo é apagado em poucos dias; sem eles, o
// prédio queima até o fim e o fogo pode pular para os vizinhos.
const FIRE_CHANCE = [1.4, 1, 0.3, 0.6];
function fires(w, rng, events, burning) {
  const wk = w.weather.kind, wet = wk >= RAIN;
  for (const i of burning) {
    const covered = w.cover.fire[i];
    w.fire[i]++;
    if ((covered && w.fire[i] >= 3) || (wet && rng.next() < 0.15)) {
      w.fire[i] = 0;
      w.markDirty(i);
      events.push({ type: 'fireOut', i });
      continue;
    }
    if (w.fire[i] >= 6) {
      w.fire[i] = 0; w.bld[i] = 0; w.cons[i] = 0;
      if (w.terrain[i] === GRASS) w.terrain[i] = DIRT;
      w.counters.burned++;
      w.markDirty(i);
      events.push({ type: 'burned', i });
      continue;
    }
    w.markDirty(i);
    for (const j of w.neighbors4(i)) {
      if (!w.bld[j] || w.fire[j] || w.svc[j]) continue;
      const p = (covered ? 0.04 : 0.15) * (wet ? 0.4 : 1);
      if (rng.next() < p) { w.fire[j] = 1; w.markDirty(j); }
    }
  }
  // fogo novo
  const b = w.stats.buildings;
  if (!b || rng.next() > b * 0.00005 * FIRE_CHANCE[wk]) return;
  for (let k = 0; k < 20; k++) {
    const i = rng.int(N * N);
    if (!w.bld[i] || w.cons[i] || w.fire[i] || w.svc[i]) continue;
    if (w.cover.fire[i] && rng.next() > 0.3) return;      // bombeiros previnem
    w.fire[i] = 1;
    w.counters.fires++;
    w.markDirty(i);
    events.push({ type: 'fire', i });
    return;
  }
}

// Enchente: só com chuva forte. A água sobe perto do rio e derruba um
// nível dos prédios atingidos (casas pequenas são levadas).
export const FLOOD_R = 5;
export function floodTiles(w, cx, cy) {
  const wd = w.waterDistance(), out = [];
  for (let y = cy - FLOOD_R; y <= cy + FLOOD_R; y++) for (let x = cx - FLOOD_R; x <= cx + FLOOD_R; x++) {
    if (!w.inside(x, y) || (x - cx) ** 2 + (y - cy) ** 2 > FLOOD_R * FLOOD_R) continue;
    const i = y * N + x;
    if (w.terrain[i] !== WATER && wd[i] <= 2) out.push(i);
  }
  return out;
}
function flood(w, rng, events) {
  const wk = w.weather.kind;
  if (wk < RAIN || rng.next() > (wk === STORM ? 0.04 : 0.008)) return;
  const wd = w.waterDistance(), near = [];
  for (let i = 0; i < N * N; i++) if (w.bld[i] && wd[i] <= 2) near.push(i);
  if (near.length) {
    const i = near[rng.int(near.length)];
    const cx = i % N, cy = (i / N) | 0;
    let hit = 0;
    for (const j of floodTiles(w, cx, cy)) {
      if (w.svc[j] || w.road[j]) continue;
      if (w.bld[j]) {
        w.bld[j]--; w.cons[j] = 0; w.fire[j] = 0; hit++;
        if (!w.bld[j] && w.terrain[j] === GRASS) w.terrain[j] = DIRT;
        w.markDirty(j);
      }
    }
    w.counters.floods++;
    events.push({ type: 'flood', x: cx, y: cy, hit });
    return;
  }
}

// Festa numa praça: dura alguns dias e anima moradores e comércio
function festa(w, rng, events) {
  if (w.festa && (w.day >= w.festa.until || w.svc[w.festa.i] !== SVC_PARK)) { w.festa = null; events.push({ type: 'festaEnd' }); }
  if (w.festa || w.weather.kind >= RAIN || !w.stats.services[SVC_PARK] || w.stats.pop < 80) return;
  if (rng.next() > 0.03) return;
  for (let k = 0; k < 400; k++) {
    const i = rng.int(N * N);
    if (w.svc[i] !== SVC_PARK) continue;
    w.festa = { i, until: w.day + 5 + rng.int(4), kind: rng.int(3) };
    w.counters.festas++;
    events.push({ type: 'festa', i, kind: w.festa.kind });
    return;
  }
}

function goals(w, events) {
  while (w.goals < MILESTONES.length && w.stats.pop >= MILESTONES[w.goals].pop) {
    const m = MILESTONES[w.goals];
    w.money += m.reward;
    w.goals++;
    events.push({ type: 'goal', n: w.goals - 1 });
  }
}

export function tickDay(w) {
  const rng = new Rng(w.rngState);
  const events = [];
  const d = w.demand, t = targetDemand(w);
  d.r += (t.r - d.r) * 0.15; d.c += (t.c - d.c) * 0.15; d.i += (t.i - d.i) * 0.15;
  const demandOf = z => (z === ZR ? d.r : z === ZC ? d.c : d.i);

  let statsChanged = false;

  // Obras em andamento, prédios em chamas e lista dos lotes que podem crescer
  const lots = [], burning = [];
  for (let i = 0; i < N * N; i++) {
    if (w.fire[i]) { if (w.bld[i]) burning.push(i); else w.fire[i] = 0; continue; }
    if (w.cons[i]) {
      if (--w.cons[i] === 0) {
        w.bld[i] = Math.min(3, w.bld[i] + 1);
        w.markDirty(i);
        statsChanged = true;
      }
    } else if (w.zone[i] && w.bld[i] < 3 && w.roadDist[i] <= ROAD_REACH && !w.obj[i]) lots.push(i);
  }

  // Sorteia alguns lotes para tentar crescer
  const tries = Math.min(lots.length, 4 + Math.ceil(lots.length * 0.06));
  for (let k = 0; k < tries; k++) {
    const i = lots[rng.int(lots.length)];
    const z = w.zone[i];
    if (w.cons[i]) continue;
    const dem = demandOf(z), lv = w.bld[i], vf = valueFactor(w, i);
    if (lv === 0) {
      if (dem > 0 && rng.next() < (0.25 + dem * 0.6) * Math.min(1, vf)) {
        w.cons[i] = 5 + rng.int(8);
        w.bvar[i] = rng.int(256);
        w.markDirty(i);
      }
    } else if (lv < 3 && dem > -0.1 && w.stats.pop >= LEVEL_POP[lv + 1] && hasServices(w, i, lv + 1) && rng.next() < 0.05 * (dem + 0.3) * vf) {
      // com os lotes cheios, a cidade cresce para cima: basta a demanda não estar negativa
      w.cons[i] = 10 + rng.int(12);
      w.markDirty(i);
    }
  }

  // A terra desmatada volta a ser campo com o tempo
  for (let k = 0; k < 40; k++) {
    const i = rng.int(N * N);
    if (w.terrain[i] === DIRT && !w.bld[i] && !w.cons[i] && !w.road[i] && !w.svc[i] && rng.next() < 0.08) {
      w.terrain[i] = GRASS;
      w.markDirty(i);
    }
  }

  nextWeather(w, rng, events);
  if (w.disasters) {
    fires(w, rng, events, burning);
    flood(w, rng, events);
  } else for (const i of burning) { w.fire[i] = 0; w.markDirty(i); }
  festa(w, rng, events);
  if (burning.length || events.some(e => e.type === 'flood' || e.type === 'fire')) statsChanged = true;

  if (statsChanged) w.recomputeStats();
  goals(w, events);
  w.day++;
  if (w.day % 5 === 0) w.recomputeDerived();

  if (w.day % DAYS_PER_MONTH === 0) {
    const b = monthlyBudget(w);
    w.money += b.income - b.cost;
    Object.assign(w.stats, { lastIncome: b.income, lastCost: b.cost, budget: b });
    const s = w.stats;
    w.history.push({
      d: w.day, pop: s.pop, jobs: s.jobsC + s.jobsI, money: Math.round(w.money), inc: b.income, cost: b.cost,
      r: +d.r.toFixed(2), c: +d.c.toFixed(2), i: +d.i.toFixed(2), jam: w.jamCount,
    });
    if (w.history.length > 360) w.history.shift();
    events.push({ type: 'month', income: b.income, cost: b.cost });
  }

  w.rngState = rng.s;
  return events;
}

export function demandTargets(w) { return targetDemand(w); }
