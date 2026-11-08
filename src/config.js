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
export const OBJ_NAME = ['', 'Árvore', 'Arbustos', 'Pedras'];

// Clima (só visual)
export const SUN = 0, CLOUDY = 1, RAIN = 2, STORM = 3;
export const WEATHER_NAME = ['Ensolarado', 'Nublado', 'Chuva', 'Tempestade'];

// Custos em R$ das ferramentas que não são prédios do catálogo
export const COST = {
  road: 10,
  avenue: 25,
  bridge: 60,
  clear: [0, 5, 2, 10],      // tirar árvore, arbusto, pedra
  demolish: 5,
};

export const START_MONEY = 2500;
export const DAYS_PER_MONTH = 30;
export const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

// Distância máxima (em tiles) de um prédio até a rua
export const ROAD_REACH = 2;

// Duração de um ciclo de dia e noite, em segundos reais na velocidade normal
export const DAY_CYCLE_SECONDS = 240;

// Segundos reais por dia de jogo em cada velocidade
export const SPEEDS = [0, 0.5, 0.22, 0.08];
