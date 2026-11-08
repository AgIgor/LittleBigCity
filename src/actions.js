// Todas as mudanças feitas pelo jogador passam por aqui como "ações" simples
// ({tool, a, b}). Assim, no multiplayer, basta enviar a ação para os outros.
import {
  N, WATER, GRASS, DIRT, NONE, COST, ZR, ZC, ZI, TAX_MAX,
  SVC_POWER, SVC_WATER, SVC_SCHOOL, SVC_HEALTH, SVC_POLICE, SVC_PARK,
} from './config.js';

export const TOOLS = {
  inspect: { name: 'Inspecionar', shape: 'point' },
  clear: { name: 'Desmatar', shape: 'rect' },
  road: { name: 'Rua', shape: 'line' },
  zoneR: { name: 'Residencial', shape: 'rect', zone: ZR },
  zoneC: { name: 'Comercial', shape: 'rect', zone: ZC },
  zoneI: { name: 'Industrial', shape: 'rect', zone: ZI },
  power: { name: 'Usina', shape: 'point', svc: SVC_POWER },
  water: { name: "Caixa d'água", shape: 'point', svc: SVC_WATER },
  school: { name: 'Escola', shape: 'point', svc: SVC_SCHOOL },
  health: { name: 'Posto de saúde', shape: 'point', svc: SVC_HEALTH },
  police: { name: 'Delegacia', shape: 'point', svc: SVC_POLICE },
  park: { name: 'Praça', shape: 'rect', svc: SVC_PARK },
  demolish: { name: 'Demolir', shape: 'rect' },
};

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
function judge(w, tool, i) {
  const t = w.terrain[i], o = w.obj[i], built = w.bld[i] || w.cons[i] || w.svc[i];
  const clearCost = o ? COST.clear[o] : 0;
  switch (tool) {
    case 'clear':
      if (!o) return ['skip', 0];
      return ['ok', clearCost];
    case 'road':
      if (w.road[i]) return ['skip', 0];
      if (built) return ['bad', 0, 'Há um prédio no caminho'];
      if (t === WATER) return ['ok', COST.bridge];       // vira ponte
      return ['ok', COST.road + clearCost];
    case 'zoneR': case 'zoneC': case 'zoneI': {
      const z = TOOLS[tool].zone;
      if (w.zone[i] === z) return ['skip', 0];
      if (t === WATER || w.road[i]) return ['bad', 0, 'Zonas só em terra firme fora da rua'];
      if (built) return ['bad', 0, 'Demolir o prédio antes de mudar a zona'];
      return ['ok', COST.zone + clearCost];
    }
    case 'power': case 'water': case 'school': case 'health': case 'police': case 'park':
      if (tool === 'park' && w.svc[i] === SVC_PARK) return ['skip', 0];
      if (t === WATER || w.road[i]) return ['bad', 0, 'Precisa de terra firme fora da rua'];
      if (built) return ['bad', 0, 'Já há uma construção aqui'];
      return ['ok', COST[tool] + clearCost];
    case 'demolish':
      if (w.svc[i]) return ['ok', COST.demolishSvc];
      if (w.road[i]) return ['ok', COST.demolishRoad];
      if (built) return ['ok', COST.demolishBld * Math.max(1, w.bld[i])];
      if (w.zone[i]) return ['ok', 0];
      return ['skip', 0];
  }
  return ['skip', 0];
}

export function plan(w, tool, a, b) {
  const def = TOOLS[tool];
  const tiles = [];
  let cost = 0, bad = 0, reason = '';
  for (const [x, y] of tilesInShape(def.shape, a, b)) {
    if (x < 0 || y < 0 || x >= N || y >= N) continue;
    const i = y * N + x;
    const [state, c, why] = judge(w, tool, i);
    tiles.push({ i, state });
    if (state === 'ok') cost += c;
    if (state === 'bad') { bad++; reason ||= why; }
  }
  return { tiles, cost, bad, reason };
}

export function apply(w, action) {
  const { tool, a, b } = action;
  if (tool === 'inspect') return { ok: true };
  if (tool === 'tax') {
    if (!['r', 'c', 'i'].includes(action.zone)) return { ok: false, msg: 'Zona inválida' };
    w.tax[action.zone] = Math.max(0, Math.min(TAX_MAX, Math.round(+action.value || 0)));
    return { ok: true, cost: 0 };
  }
  const p = plan(w, tool, a, b);
  const todo = p.tiles.filter(t => t.state === 'ok');
  if (!todo.length) return { ok: false, msg: p.reason || 'Nada para fazer aqui' };
  if (p.cost > w.money) return { ok: false, msg: `Faltam R$ ${fmt(p.cost - w.money)}` };

  let roadsChanged = false, svcChanged = false;
  for (const { i } of todo) {
    const clearHere = () => {
      if (w.obj[i]) { w.obj[i] = NONE; if (w.terrain[i] === GRASS) w.terrain[i] = DIRT; }
    };
    switch (tool) {
      case 'clear': clearHere(); break;
      case 'road': clearHere(); w.road[i] = 1; roadsChanged = true; break;
      case 'zoneR': case 'zoneC': case 'zoneI': clearHere(); w.zone[i] = TOOLS[tool].zone; break;
      case 'power': case 'water': case 'school': case 'health': case 'police': case 'park':
        clearHere(); w.zone[i] = 0; w.svc[i] = TOOLS[tool].svc; svcChanged = true;
        if (w.terrain[i] === GRASS && tool !== 'park') w.terrain[i] = DIRT;
        break;
      case 'demolish':
        if (w.svc[i]) { w.svc[i] = 0; svcChanged = true; }
        else if (w.road[i]) { w.road[i] = 0; roadsChanged = true; }
        else if (w.bld[i] || w.cons[i]) { w.bld[i] = 0; w.cons[i] = 0; if (w.terrain[i] === GRASS) w.terrain[i] = DIRT; }
        else w.zone[i] = 0;
        break;
    }
    w.markDirty(i);
  }
  w.money -= p.cost;
  if (roadsChanged) w.roadsChangedAt(todo.map(t => t.i));
  if (svcChanged) w.recomputeServices();
  if (svcChanged || tool === 'demolish' || tool === 'clear') w.recomputeValue();
  w.recomputeStats();
  return { ok: true, cost: p.cost, count: todo.length };
}

export function fmt(n) {
  return Math.round(n).toLocaleString('pt-BR');
}
