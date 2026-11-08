// Todas as mudanças feitas pelo jogador passam por aqui como "ações" simples
// ({tool, a, b, item}). Assim, no multiplayer, basta enviar a ação para o anfitrião.
import { N, WATER, GRASS, DIRT, NONE, TREE, COST, ROAD_REACH } from './config.js';
import { ITEMS, BY_KEY } from './catalog.js';
import { gainXp } from './sim.js';

export const TOOLS = {
  inspect: { name: 'Mão', shape: 'point' },
  build: { name: 'Construir' },
  demolish: { name: 'Demolir', shape: 'rect' },
};

// Formato da ferramenta: ruas em linha, decorações de área em retângulo, o resto um tile
export function shapeOf(tool, itemKey) {
  if (tool !== 'build') return TOOLS[tool]?.shape || 'point';
  const it = BY_KEY[itemKey];
  return it?.road ? 'line' : it?.area ? 'rect' : 'point';
}

function tilesInShape(shape, a, b) {
  const out = [];
  if (shape === 'point') { out.push([a.x, a.y]); return out; }
  if (shape === 'rect') {
    const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push([x, y]);
    return out;
  }
  // linha em L: anda primeiro no eixo mais longo, depois no outro
  const dx = b.x - a.x, dy = b.y - a.y, sx = Math.sign(dx), sy = Math.sign(dy);
  let x = a.x, y = a.y;
  out.push([x, y]);
  if (Math.abs(dx) >= Math.abs(dy)) {
    while (x !== b.x) { x += sx; out.push([x, y]); }
    while (y !== b.y) { y += sy; out.push([x, y]); }
  } else {
    while (y !== b.y) { y += sy; out.push([x, y]); }
    while (x !== b.x) { x += sx; out.push([x, y]); }
  }
  return out;
}

// Para cada tile: state 'ok' (será alterado), 'skip' (nada a fazer) ou 'bad' (proibido)
function judge(w, tool, it, i, workersLeft) {
  const t = w.terrain[i], o = w.obj[i], x = i % N, y = (i / N) | 0;
  const clearCost = o ? COST.clear[o] : 0;
  if (tool === 'demolish') {
    if (w.item[i]) {
      const cur = ITEMS[w.item[i]];
      if (cur.pop && !w.cons[i] && w.freeWorkers < cur.pop) return ['bad', 0, 'Os moradores dessa casa trabalham na cidade. Demola um comércio ou indústria antes'];
      return ['ok', COST.demolish];
    }
    if (w.road[i]) return ['ok', COST.demolish];
    if (o) return ['ok', clearCost];
    return ['skip', 0];
  }
  if (!it) return ['skip', 0];
  if (!w.inArea(x, y)) return ['bad', 0, 'Fora da área da cidade (ela cresce a cada nível)'];
  if (it.level > w.level) return ['bad', 0, `Libera no nível ${it.level}`];
  if (it.road) {
    if (w.road[i] === it.road || (w.road[i] && it.road === 1)) return ['skip', 0];
    if (w.item[i]) return ['bad', 0, 'Há uma construção no caminho'];
    if (w.road[i]) return ['ok', it.cost];                          // alargar rua
    if (t === WATER) return ['ok', COST.bridge * it.road];            // vira ponte
    return ['ok', it.cost + clearCost];
  }
  if (t === WATER) return ['bad', 0, 'Não dá para construir na água'];
  if (w.road[i]) return ['bad', 0, 'Não dá para construir na rua'];
  if (it.tree) return o || w.item[i] ? ['skip', 0] : ['ok', it.cost];
  if (w.item[i]) return it.area ? ['skip', 0] : ['bad', 0, 'Já há uma construção aqui'];
  if (it.cat !== 'deco' && w.roadDist[i] > ROAD_REACH) return ['bad', 0, 'Precisa de uma rua a até 2 tiles'];
  if (it.workers && workersLeft < it.workers) return ['bad', 0, `Faltam ${it.workers - Math.max(0, workersLeft)} trabalhadores: construa mais casas`];
  return ['ok', it.cost + clearCost];
}

export function plan(w, tool, a, b, itemKey) {
  const it = tool === 'build' ? BY_KEY[itemKey] : null;
  const tiles = [];
  let cost = 0, bad = 0, reason = '', workersLeft = w.freeWorkers;
  for (const [x, y] of tilesInShape(shapeOf(tool, itemKey), a, b)) {
    if (x < 0 || y < 0 || x >= N || y >= N) continue;
    const i = y * N + x;
    const [state, c, why] = judge(w, tool, it, i, workersLeft);
    tiles.push({ i, state });
    if (state === 'ok') { cost += c; if (it?.workers) workersLeft -= it.workers; }
    if (state === 'bad') { bad++; reason ||= why; }
  }
  return { tiles, cost, bad, reason, item: it };
}

// Coleta as moedas de um tile; devolve o valor (0 se não havia moeda)
function collectAt(w, i, events) {
  if (!w.coin[i] || w.cons[i]) return 0;
  const it = ITEMS[w.item[i]], amount = w.payout(i);
  w.coin[i] = 0;
  w.timer[i] = it.period;
  w.money += amount;
  w.changed.add(i);
  events.push({ type: 'coin', i, amount });
  return amount;
}

export function apply(w, action) {
  const { tool, a, b } = action;
  const events = [];
  if (tool === 'inspect') return { ok: true, events };
  if (tool === 'collect' || tool === 'collectAll') {
    const list = tool === 'collect' ? [action.i | 0] : [];
    if (tool === 'collectAll') for (let i = 0; i < N * N; i++) if (w.coin[i]) list.push(i);
    let total = 0, n = 0;
    for (const i of list) if (i >= 0 && i < N * N) { const v = collectAt(w, i, events); if (v) { total += v; n++; } }
    if (!n) return { ok: false, msg: 'Nada para coletar', events };
    gainXp(w, n, events);
    w.recomputeStats();
    return { ok: true, total, events };
  }
  if (!TOOLS[tool]) return { ok: false, msg: 'Ferramenta inválida', events };
  const p = plan(w, tool, a, b, action.item);
  const todo = p.tiles.filter(t => t.state === 'ok');
  if (!todo.length) return { ok: false, msg: p.reason || 'Nada para fazer aqui', events };
  if (p.cost > w.money) return { ok: false, msg: `Faltam R$ ${fmt(p.cost - w.money)}`, events };

  const it = p.item;
  let roadsChanged = false, boostChanged = false, xp = 0;
  for (const { i } of todo) {
    const clearHere = () => {
      if (w.obj[i]) { if (w.obj[i] === TREE) boostChanged = true; w.obj[i] = NONE; if (w.terrain[i] === GRASS) w.terrain[i] = DIRT; }
    };
    if (tool === 'demolish') {
      if (w.item[i]) {
        if (ITEMS[w.item[i]].boost) boostChanged = true;
        w.item[i] = 0; w.cons[i] = 0; w.coin[i] = 0; w.timer[i] = 0;
        if (w.terrain[i] === GRASS) w.terrain[i] = DIRT;
      } else if (w.road[i]) { w.road[i] = 0; roadsChanged = true; }
      else clearHere();
    } else if (it.road) {
      clearHere(); w.road[i] = it.road; roadsChanged = true;
    } else if (it.tree) {
      w.obj[i] = TREE; boostChanged = true; xp += it.xp;
      if (w.terrain[i] === DIRT) w.terrain[i] = GRASS;
    } else {
      clearHere();
      w.item[i] = it.id;
      w.bvar[i] = (Math.random() * 256) | 0;
      w.cons[i] = it.build || 1;
      w.coin[i] = 0; w.timer[i] = 0;
      if (w.terrain[i] === GRASS && it.cat !== 'deco') w.terrain[i] = DIRT;
    }
    w.markDirty(i);
  }
  w.money -= p.cost;
  if (roadsChanged) w.recomputeRoadDist();
  if (boostChanged) w.recomputeBoost();
  if (xp) gainXp(w, xp, events);
  w.recomputeStats();
  return { ok: true, cost: p.cost, count: todo.length, events };
}

export function fmt(n) {
  return Math.round(n).toLocaleString('pt-BR');
}
