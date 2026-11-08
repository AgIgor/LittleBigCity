// Simulação diária da cidade: demanda, crescimento dos prédios e orçamento.
// Determinística (usa o Rng salvo no mundo) para o anfitrião do multiplayer.
import { N, GRASS, DIRT, ZR, ZC, ROAD_REACH, DAYS_PER_MONTH } from './config.js';
import { Rng } from './rng.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const LEVEL_POP = [0, 0, 120, 600];    // população mínima da cidade para chegar a cada nível

function targetDemand(s) {
  const jobs = s.jobsC + s.jobsI;
  const wantPop = jobs * 1.5 + 60;                 // as primeiras famílias chegam sem emprego
  const wantC = s.pop * 0.22;
  const wantI = s.pop * 0.34 + 14;
  return {
    r: clamp((wantPop - s.pop) / (wantPop * 0.35 + 10), -1, 1),
    c: s.pop < 25 ? -0.2 : clamp((wantC - s.jobsC) / (wantC * 0.35 + 6), -1, 1),
    i: clamp((wantI - s.jobsI) / (wantI * 0.35 + 8), -1, 1),
  };
}

export function tickDay(w) {
  const rng = new Rng(w.rngState);
  const events = [];
  const d = w.demand, t = targetDemand(w.stats);
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
    const dem = demandOf(z), lv = w.bld[i];
    if (lv === 0) {
      if (dem > 0 && rng.next() < 0.25 + dem * 0.6) {
        w.cons[i] = 5 + rng.int(8);
        w.bvar[i] = rng.int(256);
        w.markDirty(i);
      }
    } else if (lv < 3 && dem > 0.2 && w.stats.pop >= LEVEL_POP[lv + 1] && rng.next() < 0.06 * dem) {
      w.cons[i] = 10 + rng.int(12);
      w.markDirty(i);
    }
  }

  // A terra desmatada volta a ser campo com o tempo
  for (let k = 0; k < 40; k++) {
    const i = rng.int(N * N);
    if (w.terrain[i] === DIRT && !w.bld[i] && !w.cons[i] && !w.road[i] && rng.next() < 0.08) {
      w.terrain[i] = GRASS;
      w.markDirty(i);
    }
  }

  if (statsChanged) w.recomputeStats();

  w.day++;
  if (w.day % DAYS_PER_MONTH === 0) {
    const s = w.stats;
    const income = Math.round(s.pop * 2 + s.jobsC * 3 + s.jobsI * 2.5);
    const cost = Math.round(s.roads * 1.5);
    w.money += income - cost;
    s.lastIncome = income; s.lastCost = cost;
    events.push({ type: 'month', income, cost });
  }

  w.rngState = rng.s;
  return events;
}

export function demandTargets(w) { return targetDemand(w.stats); }
