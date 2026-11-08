// Simulação diária da cidade: demanda, crescimento dos prédios e orçamento.
// Determinística (usa o Rng salvo no mundo) para o anfitrião do multiplayer.
import {
  N, GRASS, DIRT, ZR, ZC, ZI, ROAD_REACH, DAYS_PER_MONTH, TAX, TAX_DEFAULT, ROAD_UPKEEP, BRIDGE_UPKEEP, SVC_UPKEEP,
} from './config.js';
import { Rng } from './rng.js';
import { VALUE_FOR_L3 } from './world.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const LEVEL_POP = [0, 0, 120, 600];    // população mínima da cidade para chegar a cada nível

function targetDemand(s, tax) {
  const jobs = s.jobsC + s.jobsI;
  const wantPop = jobs * 1.5 + 60;                 // as primeiras famílias chegam sem emprego
  const wantC = s.pop * 0.22;
  const wantI = s.pop * 0.34 + 14;
  // cada ponto de imposto acima do padrão espanta um pouco; abaixo, atrai
  const t = z => (tax[z] - TAX_DEFAULT) * 0.06;
  return {
    r: clamp((wantPop - s.pop) / (wantPop * 0.35 + 10) - t('r'), -1, 1),
    c: s.pop < 25 ? -0.2 : clamp((wantC - s.jobsC) / (wantC * 0.35 + 6) - t('c'), -1, 1),
    i: clamp((wantI - s.jobsI) / (wantI * 0.35 + 8) - t('i'), -1, 1),
  };
}

// Por que um prédio não pode subir para o nível `level`? '' se pode.
export function upgradeBlock(w, i, level) {
  if (level >= 2 && !w.power[i]) return 'energia';
  if (level >= 3) {
    if (!w.water[i]) return 'água';
    const z = w.zone[i];
    if (z === ZR && !w.cover.school[i]) return 'escola';
    if (z === ZR && !w.cover.health[i]) return 'posto de saúde';
    if ((z === ZC || z === ZI) && !w.cover.police[i]) return 'delegacia';
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
  const sv = s.services;
  const costs = {
    roads: s.roads * ROAD_UPKEEP,
    bridges: s.bridges * BRIDGE_UPKEEP,
    utilities: sv[1] * SVC_UPKEEP[1] + sv[2] * SVC_UPKEEP[2],
    public: sv[3] * SVC_UPKEEP[3] + sv[4] * SVC_UPKEEP[4] + sv[5] * SVC_UPKEEP[5],
    parks: sv[6] * SVC_UPKEEP[6],
  };
  const income = Math.round(r + c + ind);
  const cost = Math.round(Object.values(costs).reduce((a, b) => a + b, 0));
  return { income, cost, taxR: Math.round(r), taxC: Math.round(c), taxI: Math.round(ind), costs };
}

export function tickDay(w) {
  const rng = new Rng(w.rngState);
  const events = [];
  const d = w.demand, t = targetDemand(w.stats, w.tax);
  d.r += (t.r - d.r) * 0.15; d.c += (t.c - d.c) * 0.15; d.i += (t.i - d.i) * 0.15;
  const demandOf = z => (z === ZR ? d.r : z === ZC ? d.c : d.i);

  let statsChanged = false;

  // Obras em andamento, e lista dos lotes que podem crescer
  const lots = [];
  for (let i = 0; i < N * N; i++) {
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

  if (statsChanged) w.recomputeStats();
  w.day++;
  if (w.day % 5 === 0) w.recomputeValue();

  if (w.day % DAYS_PER_MONTH === 0) {
    const b = monthlyBudget(w);
    w.money += b.income - b.cost;
    Object.assign(w.stats, { lastIncome: b.income, lastCost: b.cost, budget: b });
    events.push({ type: 'month', income: b.income, cost: b.cost });
  }

  w.rngState = rng.s;
  return events;
}

export function demandTargets(w) { return targetDemand(w.stats, w.tax); }
