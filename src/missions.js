// Missões opcionais: objetivos curtos com prêmio. Ficam visíveis três por vez,
// na ordem da lista, e só aparecem quando o que pedem já está liberado.
import { BY_KEY } from './catalog.js';

// metric: 'count:<item>' (prédios prontos), 'pop', 'level', 'collected' (moedas
// coletadas no total), 'planted' (árvores plantadas), 'roads', 'avenues', 'moved'
const m = (text, metric, n, money, xp = Math.round(money / 20)) => ({ text, metric, n, money, xp });
const LIST = [
  m('Construa 3 casas', 'count:house', 3, 150),
  m('Faça 10 tiles de rua', 'roads', 10, 100),
  m('Abra uma venda', 'count:venda', 1, 150),
  m('Plante 5 árvores', 'planted', 5, 120),
  m('Chegue a 30 moradores', 'pop', 30, 200),
  m('Colete R$ 500', 'collected', 500, 200),
  m('Mude uma construção de lugar', 'moved', 1, 100),
  m('Construa um galpão', 'count:galpao', 1, 300),
  m('Construa um parquinho', 'count:playground', 1, 250),
  m('Tenha 10 casas', 'count:house', 10, 400),
  m('Construa um sobrado', 'count:sobrado', 1, 400),
  m('Construa um chafariz', 'count:fountain', 1, 400),
  m('Chegue ao nível 4', 'level', 4, 600),
  m('Chegue a 100 moradores', 'pop', 100, 700),
  m('Colete R$ 5.000', 'collected', 5000, 800),
  m('Abra uma loja', 'count:loja', 1, 800),
  m('Construa uma escola', 'count:school', 1, 1000),
  m('Plante 25 árvores', 'planted', 25, 600),
  m('Tenha 5 sobrados', 'count:sobrado', 5, 1200),
  m('Construa uma fábrica', 'count:fabrica', 1, 1500),
  m('Chegue a 300 moradores', 'pop', 300, 2000),
  m('Faça 5 tiles de avenida', 'avenues', 5, 1500),
  m('Construa um prédio residencial', 'count:apart', 1, 3000),
  m('Colete R$ 50.000', 'collected', 50000, 5000),
  m('Construa os escritórios', 'count:office', 1, 5000),
  m('Chegue a 1.000 moradores', 'pop', 1000, 8000),
  m('Construa a prefeitura', 'count:hall', 1, 10000),
  m('Construa o estádio', 'count:stadium', 1, 15000),
  m('Chegue a 3.000 moradores', 'pop', 3000, 20000),
  m('Construa a torre panorâmica', 'count:tower', 1, 25000),
];
export const MISSIONS = LIST.map((x, id) => {
  const key = x.metric.startsWith('count:') ? x.metric.slice(6) : null;
  const minLevel = key ? BY_KEY[key].level : x.metric === 'avenues' ? BY_KEY.avenue.level : x.metric === 'level' ? x.n - 2 : 1;
  return { ...x, id, minLevel };
});
export const ACTIVE_MISSIONS = 3;

export function missionProgress(w, ms) {
  const [kind, key] = ms.metric.split(':');
  const s = w.stats;
  switch (kind) {
    case 'count': return s.done[BY_KEY[key].id] || 0;
    case 'pop': return s.pop;
    case 'level': return w.level;
    case 'roads': return s.roads;
    case 'avenues': return s.avenues;
    default: return w.counters[kind] || 0;     // collected, planted, moved
  }
}

// As missões em andamento (até três), na ordem da lista
export function activeMissions(w) {
  const out = [];
  for (const ms of MISSIONS) {
    if (w.claimed.includes(ms.id) || ms.minLevel > w.level) continue;
    out.push(ms);
    if (out.length >= ACTIVE_MISSIONS) break;
  }
  return out;
}
