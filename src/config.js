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
export const SVC_POWER = 1, SVC_WATER = 2, SVC_SCHOOL = 3, SVC_HEALTH = 4, SVC_POLICE = 5, SVC_PARK = 6;
export const SVC_KEY = ['', 'power', 'water', 'school', 'health', 'police', 'park'];
export const SVC_NAME = ['', 'Usina elétrica', "Caixa d'água", 'Escola', 'Posto de saúde', 'Delegacia', 'Praça'];
export const SVC_RADIUS = [0, 16, 12, 12, 14, 12, 0];
export const SVC_UPKEEP = [0, 150, 70, 120, 150, 110, 3];   // por mês (praça: por tile)
export const SVC_COLOR = [0, 0xffd84a, 0x5ab8ff, 0x5fd06a, 0xff6a6a, 0x7a9cff, 0x8fd06a];
// Serviços com área de cobertura (os que viram camadas de cobertura no mundo)
export const COVER_KINDS = ['power', 'water', 'school', 'health', 'police'];

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
