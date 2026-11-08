// Catálogo de tudo que o jogador pode construir.
// sprite: grupo de desenho ('b11' tem variantes b11_0, b11_1...; 'svc3' é único).
// pop: moradores; workers: trabalhadores que ocupa; income: moedas por coleta;
// period: dias entre uma coleta e outra; build: dias de obra; xp: ao ficar pronto;
// boost: { r, pct } aumenta o rendimento dos prédios a até r tiles.
export const CATS = [
  { id: 'road', name: 'Ruas' },
  { id: 'home', name: 'Casas' },
  { id: 'shop', name: 'Comércio' },
  { id: 'work', name: 'Indústria' },
  { id: 'deco', name: 'Decoração' },
  { id: 'special', name: 'Especiais' },
];

const list = [
  // ruas (não ocupam a camada de itens: viram rua)
  { key: 'road', cat: 'road', name: 'Rua', cost: 10, level: 1, road: 1, info: 'Prédios precisam de rua a até 2 tiles' },
  { key: 'avenue', cat: 'road', name: 'Avenida', cost: 25, level: 6, road: 2, info: 'Rua larga com canteiro' },
  // casas
  { key: 'house', cat: 'home', name: 'Casa', sprite: 'b11', cost: 150, level: 1, pop: 6, income: 8, period: 20, build: 4, xp: 4 },
  { key: 'sobrado', cat: 'home', name: 'Sobrado', sprite: 'b12', cost: 700, level: 3, pop: 18, income: 22, period: 24, build: 8, xp: 12 },
  { key: 'apart', cat: 'home', name: 'Prédio residencial', sprite: 'b13', cost: 2800, level: 7, pop: 60, income: 70, period: 30, build: 14, xp: 35 },
  // comércio
  { key: 'venda', cat: 'shop', name: 'Venda', sprite: 'b21', cost: 300, level: 1, workers: 4, income: 25, period: 24, build: 5, xp: 6 },
  { key: 'loja', cat: 'shop', name: 'Loja', sprite: 'b22', cost: 1200, level: 4, workers: 10, income: 75, period: 28, build: 9, xp: 15 },
  { key: 'office', cat: 'shop', name: 'Escritórios', sprite: 'b23', cost: 5000, level: 9, workers: 30, income: 260, period: 34, build: 16, xp: 45 },
  // indústria
  { key: 'galpao', cat: 'work', name: 'Galpão', sprite: 'b31', cost: 600, level: 2, workers: 8, income: 55, period: 36, build: 6, xp: 10 },
  { key: 'fabrica', cat: 'work', name: 'Fábrica', sprite: 'b32', cost: 2200, level: 5, workers: 20, income: 170, period: 40, build: 12, xp: 25 },
  { key: 'industria', cat: 'work', name: 'Indústria', sprite: 'b33', cost: 7000, level: 10, workers: 45, income: 480, period: 46, build: 18, xp: 60 },
  // decoração (pode pintar uma área arrastando)
  { key: 'tree', cat: 'deco', name: 'Árvore', cost: 15, level: 1, xp: 1, area: true, tree: true, boost: { r: 2, pct: 4 } },
  { key: 'flowers', cat: 'deco', name: 'Canteiros', sprite: 'svc6_2', cost: 120, level: 1, xp: 3, area: true, boost: { r: 2, pct: 8 } },
  { key: 'playground', cat: 'deco', name: 'Parquinho', sprite: 'svc6_1', cost: 250, level: 2, xp: 5, boost: { r: 3, pct: 10 } },
  { key: 'fountain', cat: 'deco', name: 'Chafariz', sprite: 'svc6_0', cost: 400, level: 3, xp: 8, boost: { r: 3, pct: 14 } },
  { key: 'busstop', cat: 'deco', name: 'Ponto de ônibus', sprite: 'svc10', cost: 200, level: 2, xp: 4, boost: { r: 3, pct: 6 } },
  // especiais
  { key: 'watertower', cat: 'special', name: "Caixa d'água", sprite: 'svc2', cost: 900, level: 3, xp: 20, build: 6, boost: { r: 5, pct: 10 } },
  { key: 'school', cat: 'special', name: 'Escola', sprite: 'svc3', cost: 2000, level: 4, xp: 40, build: 10, boost: { r: 6, pct: 15 } },
  { key: 'health', cat: 'special', name: 'Posto de saúde', sprite: 'svc4', cost: 2500, level: 5, xp: 45, build: 10, boost: { r: 6, pct: 15 } },
  { key: 'police', cat: 'special', name: 'Delegacia', sprite: 'svc5', cost: 2500, level: 6, xp: 45, build: 10, boost: { r: 6, pct: 15 } },
  { key: 'garbage', cat: 'special', name: 'Coleta de lixo', sprite: 'svc7', cost: 2200, level: 6, xp: 40, build: 10, boost: { r: 6, pct: 12 } },
  { key: 'fire', cat: 'special', name: 'Bombeiros', sprite: 'svc9', cost: 3000, level: 7, xp: 50, build: 12, boost: { r: 6, pct: 15 } },
  { key: 'power', cat: 'special', name: 'Usina elétrica', sprite: 'svc1', cost: 6000, level: 8, xp: 80, build: 16, boost: { r: 8, pct: 15 } },
  { key: 'recycle', cat: 'special', name: 'Reciclagem', sprite: 'svc8', cost: 4000, level: 9, xp: 60, build: 12, boost: { r: 7, pct: 15 } },
  { key: 'hall', cat: 'special', name: 'Prefeitura', sprite: 'svc11', cost: 9000, level: 11, xp: 150, build: 20, boost: { r: 10, pct: 25 } },
  { key: 'stadium', cat: 'special', name: 'Estádio', sprite: 'svc12', cost: 15000, level: 13, xp: 220, build: 24, boost: { r: 9, pct: 25 } },
  { key: 'tower', cat: 'special', name: 'Torre panorâmica', sprite: 'svc13', cost: 22000, level: 15, xp: 300, build: 28, boost: { r: 12, pct: 30 } },
];

// ITEMS[id] (id começa em 1; é o valor guardado na camada 'item' do mundo)
export const ITEMS = [null];
export const BY_KEY = {};
for (const it of list) {
  if (it.road || it.tree) { BY_KEY[it.key] = it; continue; }     // não ocupam a camada de itens
  it.id = ITEMS.length;
  ITEMS.push(it);
  BY_KEY[it.key] = it;
}
export const CATALOG = list;

// Experiência para sair do nível L para o L + 1
export const xpForLevel = L => Math.round(40 * L ** 1.5);
export const MAX_LEVEL = 30;
// Metade do lado da área construível em volta do centro da cidade
export const areaHalf = (level, n) => Math.min(Math.ceil(n / 2), 9 + level * 3);
// Prêmio em moedas ao subir de nível
export const levelReward = L => 100 * L;
// Teto do bônus somado de decoração e especiais
export const MAX_BOOST = 100;
