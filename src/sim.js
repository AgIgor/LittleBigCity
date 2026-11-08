// Simulação diária: obras, moedas dos prédios e clima.
// Determinística (usa o Rng salvo no mundo) para o anfitrião do multiplayer.
import { N, GRASS, DIRT, STORM } from './config.js';
import { ITEMS, levelReward, AUTO_PERIOD } from './catalog.js';
import { Rng } from './rng.js';

// Próximo clima: tende a continuar parecido; tempestade sempre passa
const WEATHER_NEXT = [
  [0.6, 0.28, 0.1, 0.02],    // depois de sol
  [0.4, 0.3, 0.24, 0.06],    // nublado
  [0.3, 0.35, 0.28, 0.07],   // chuva
  [0.25, 0.4, 0.35, 0],      // tempestade
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

// Sobe de nível: prêmio em moedas e aviso
export function gainXp(w, n, events) {
  for (const level of w.addXp(n)) {
    w.money += levelReward(level);
    events.push({ type: 'level', level });
  }
}

export function tickDay(w) {
  const rng = new Rng(w.rngState);
  const events = [];
  let statsChanged = false, boostChanged = false;

  for (let i = 0; i < N * N; i++) {
    const id = w.item[i];
    if (!id) continue;
    const it = ITEMS[id];
    if (w.cons[i]) {
      if (--w.cons[i] === 0) {
        w.timer[i] = it.period || 0;
        gainXp(w, it.xp || 0, events);
        events.push({ type: 'built', i });
        w.markDirty(i);
        statsChanged = true;
        if (it.boost) boostChanged = true;
      }
      continue;
    }
    // moeda pronta fica esperando o jogador coletar
    if (it.income && !w.coin[i] && --w.timer[i] <= 0) {
      w.coin[i] = 1;
      w.changed.add(i);
      statsChanged = true;
    }
  }

  // A terra desmatada volta a ser campo com o tempo
  for (let k = 0; k < 40; k++) {
    const i = rng.int(N * N);
    if (w.terrain[i] === DIRT && !w.item[i] && !w.road[i] && rng.next() < 0.08) {
      w.terrain[i] = GRASS;
      w.markDirty(i);
    }
  }

  // Coletor automático: de tempos em tempos recolhe todas as moedas prontas
  const period = AUTO_PERIOD[w.upgrades.auto];
  if (period && w.day % period === 0) {
    let total = 0, n = 0;
    const sample = [];
    for (let i = 0; i < N * N; i++) {
      const v = w.collectTile(i);
      if (!v) continue;
      total += v; n++;
      if (sample.length < 12) sample.push([i, v]);
    }
    if (n) {
      events.push({ type: 'auto', total, n, sample });
      gainXp(w, n, events);
      statsChanged = true;
    }
  }

  nextWeather(w, rng, events);
  if (boostChanged) w.recomputeBoost();
  if (statsChanged) w.recomputeStats();
  w.day++;
  w.rngState = rng.s;
  return events;
}
