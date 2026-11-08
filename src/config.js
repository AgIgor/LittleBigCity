// Geometria isométrica 2:1. As coordenadas do mundo ficam em "pixels de arte":
// o tile ocupa TW x TH e os sprites são desenhados nesse tamanho.
export const TW = 128;
export const TH = 64;
// Lado do mapa em tiles. Muda com o tamanho escolhido; os módulos leem N na
// hora do uso (ligação viva do import), então basta chamar setMapSize antes
// de criar o mundo.
export let N = 128;
export function setMapSize(n) { N = n; }
export const MAP_SIZES = [[96, 'Pequeno'], [128, 'Médio'], [192, 'Grande']];
export const CHUNK = 16;       // lado do bloco usado no recorte de tela

// Terreno
export const WATER = 0, SAND = 1, GRASS = 2, DIRT = 3;
export const TERRAIN_NAME = ['Água', 'Areia', 'Campo', 'Terra'];

// Objetos naturais
export const NONE = 0, TREE = 1, BUSH = 2, ROCK = 3;
export const OBJ_NAME = ['', 'Mata', 'Arbustos', 'Pedras'];

// Zonas
export const ZR = 1, ZC = 2, ZI = 3;
export const ZONE_NAME = ['', 'Residencial', 'Comercial', 'Industrial'];
export const ZONE_COLOR = [0, 0x5fd06a, 0x4fa3e8, 0xf0c040];

// Lotação por nível de prédio (índice = nível)
export const RESIDENTS = [0, 8, 24, 80];
export const JOBS_C = [0, 6, 18, 50];
export const JOBS_I = [0, 10, 28, 70];

// Serviços (valor guardado na camada svc de cada tile)
export const SVC_POWER = 1, SVC_WATER = 2, SVC_SCHOOL = 3, SVC_HEALTH = 4, SVC_POLICE = 5, SVC_PARK = 6,
  SVC_GARBAGE = 7, SVC_RECYCLE = 8, SVC_FIRE = 9, SVC_BUS = 10, SVC_HALL = 11, SVC_STADIUM = 12, SVC_TOWER = 13;
export const SVC_KEY = ['', 'power', 'water', 'school', 'health', 'police', 'park',
  'garbage', 'recycle', 'fire', 'bus', 'hall', 'stadium', 'tower'];
export const SVC_NAME = ['', 'Usina elétrica', "Caixa d'água", 'Escola', 'Posto de saúde', 'Delegacia', 'Praça',
  'Coleta de lixo', 'Reciclagem', 'Bombeiros', 'Ponto de ônibus', 'Prefeitura', 'Estádio', 'Torre panorâmica'];
export const SVC_RADIUS = [0, 16, 12, 12, 14, 12, 0, 14, 12, 13, 5, 0, 0, 0];
export const SVC_UPKEEP = [0, 150, 70, 120, 150, 110, 3, 90, 120, 130, 12, 200, 350, 250];   // por mês (praça: por tile)
export const SVC_COLOR = [0, 0xffd84a, 0x5ab8ff, 0x5fd06a, 0xff6a6a, 0x7a9cff, 0x8fd06a,
  0xc89a5a, 0x4ac8a0, 0xff8a3a, 0xe8d050, 0xd8c8ff, 0xffffff, 0xffb0e0];
export const SVC_COUNT = SVC_KEY.length;
// Serviços exigidos pelos prédios (viram alertas e ícones quando faltam)
export const COVER_KINDS = ['power', 'water', 'school', 'health', 'police', 'garbage'];
// Todos os serviços com área de alcance
export const RANGE_KINDS = [...COVER_KINDS, 'recycle', 'fire', 'bus'];
// Marcos da cidade: valorizam uma área grande e animam a demanda
export const LANDMARKS = {
  [SVC_HALL]: { value: 22, r: 10, dem: { r: 0.05, c: 0.05, i: 0.05 } },
  [SVC_STADIUM]: { value: 18, r: 9, dem: { c: 0.15 } },
  [SVC_TOWER]: { value: 30, r: 12, dem: { r: 0.15 } },
};

// Metas de população: dão um prêmio e liberam os marcos
export const MILESTONES = [
  { pop: 50, name: 'Vilarejo', reward: 1000 },
  { pop: 250, name: 'Vila', reward: 2500 },
  { pop: 600, name: 'Povoado', reward: 4000, unlock: SVC_HALL },
  { pop: 1200, name: 'Cidade pequena', reward: 6000 },
  { pop: 2500, name: 'Cidade', reward: 10000, unlock: SVC_STADIUM },
  { pop: 5000, name: 'Cidade grande', reward: 15000, unlock: SVC_TOWER },
  { pop: 10000, name: 'Metrópole', reward: 30000 },
];

// Trânsito: capacidade de cada tipo de rua (1 = rua, 2 = avenida) e o
// congestionamento (%) a partir do qual os prédios em volta sofrem
export const ROAD_CAP = [0, 90, 240];
export const JAM = 120;
// Poluição a partir da qual residências não sobem para o nível 3
export const POLLUTION_L3 = 70;

// Clima
export const SUN = 0, CLOUDY = 1, RAIN = 2, STORM = 3;
export const WEATHER_NAME = ['Ensolarado', 'Nublado', 'Chuva', 'Tempestade'];

// Custos em R$
export const COST = {
  road: 12,
  bridge: 70,
  power: 3000,
  water: 1200,
  school: 2500,
  health: 3000,
  police: 2000,
  park: 60,
  garbage: 1800,
  recycle: 3500,
  fire: 2500,
  bus: 150,
  hall: 8000,
  stadium: 15000,
  tower: 20000,
  avenue: 30,
  avenueUp: 20,              // transformar rua em avenida
  demolishSvc: 100,
  zone: 3,
  clear: [0, 6, 2, 15],      // por tipo de objeto
  demolishRoad: 3,
  demolishBld: 20,           // por nível
};

export const START_MONEY = 20000;

// Arrecadação mensal por morador / emprego com a alíquota padrão (TAX_DEFAULT %).
// A alíquota de cada zona vai de 0 a TAX_MAX e multiplica esses valores.
export const TAX = { resident: 1.1, jobC: 1.3, jobI: 1.0 };
export const TAX_DEFAULT = 9, TAX_MAX = 20;
export const ROAD_UPKEEP = 2;
export const BRIDGE_UPKEEP = 6;
export const DAYS_PER_MONTH = 30;
export const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

// Distância máxima (em tiles) de uma zona até a rua para poder crescer
export const ROAD_REACH = 2;

// Duração de um ciclo de dia e noite, em segundos reais na velocidade normal
export const DAY_CYCLE_SECONDS = 240;

// Segundos reais por dia de jogo em cada velocidade
export const SPEEDS = [0, 0.5, 0.22, 0.08];
