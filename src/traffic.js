// Carros, ônibus e pedestres andando pelas ruas. É só visual: cada jogador
// gera o próprio trânsito a partir da cidade, nada disso vai pela rede.
import { Sprite } from '../lib/pixi.min.mjs';
import { TW, TH, N, ZR } from './config.js';
import { CAR_COLORS, PED_VARIANTS } from './art.js';

const HW = TW / 2, HH = TH / 2;
const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];          // 0 = +x, 1 = +y, 2 = -x, 3 = -y
const SPEED_MUL = [0, 1, 1.5, 2.2];
const LANE = 0.15, SIDEWALK = 0.37;

const dirOf = (dx, dy) => (dx > 0 ? 0 : dy > 0 ? 1 : dx < 0 ? 2 : 3);

export class Traffic {
  constructor(game) {
    this.game = game;
    this.agents = [];
    this.roads = [];
    this.scanT = 99;
  }

  get world() { return this.game.world; }
  get scene() { return this.game.scene; }

  // Depois de trocar de mundo, os sprites antigos já foram destruídos com a cena
  reset() {
    this.agents = [];
    this.scanT = 99;
  }

  scanRoads() {
    const w = this.world, out = [];
    for (let i = 0; i < N * N; i++) if (w.road[i]) out.push(i);
    this.roads = out;
  }

  isRoad(x, y) { return x >= 0 && y >= 0 && x < N && y < N && this.world.road[y * N + x] > 0; }

  // Rua com prédio por perto: é de onde o movimento sai
  nearBuildings(i) {
    const w = this.world, x = i % N, y = (i / N) | 0;
    let homes = 0, any = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
      const j = ny * N + nx;
      if (w.bld[j]) { any++; if (w.zone[j] === ZR) homes++; }
    }
    return { any, homes };
  }

  pickSpawn() {
    const roads = this.roads;
    for (let k = 0; k < 8; k++) {
      const i = roads[(Math.random() * roads.length) | 0];
      if (this.nearBuildings(i).any || k === 7) return i;
    }
    return roads[0];
  }

  targets() {
    const w = this.world, s = w.stats, r = this.roads.length;
    const people = s.pop + s.jobsC + s.jobsI;
    // com chuva quase ninguém anda a pé; em festa a rua enche
    const wet = w.weather.kind >= 2, party = w.festa ? 1.4 : 1;
    return {
      car: Math.min(r * 0.45, people / 14 + r * 0.04, 350) | 0,
      bus: Math.min(6 + s.services[10] * 2, (s.pop / 350) + s.services[10] | 0, (r / 20) | 0),
      ped: Math.min(r * 0.6, s.pop / 7 * party, 300) * (wet ? 0.25 : 1) | 0,
    };
  }

  spawn(kind) {
    if (!this.roads.length) return;
    const i = this.pickSpawn(), x = i % N, y = (i / N) | 0;
    const exits = DIRS.map((d, k) => k).filter(k => this.isRoad(x + DIRS[k][0], y + DIRS[k][1]));
    const dir = exits.length ? exits[(Math.random() * exits.length) | 0] : (Math.random() * 4) | 0;
    let base, speed;
    if (kind === 'car') { base = `car${(Math.random() * CAR_COLORS.length) | 0}_`; speed = 1.3 + Math.random() * 0.5; }
    else if (kind === 'bus') { base = 'bus_'; speed = 0.95; }
    else { base = `ped${(Math.random() * PED_VARIANTS) | 0}_`; speed = 0.28 + Math.random() * 0.12; }

    const s = new Sprite(this.scene.tex[base + (kind === 'ped' ? 0 : dir)].texture);
    const t = this.scene.tex[base + (kind === 'ped' ? 0 : dir)];
    s.anchor.set(t.ax, t.ay);
    s.alpha = 0;
    s.tint = this.scene.objTint;
    this.scene.objects.addChild(s);
    const a = {
      kind, base, s, x, y, dir, inDir: dir, t: 0.5 + Math.random() * 0.4, speed,
      side: kind === 'ped' ? (Math.random() < 0.5 ? 1 : -1) : 1,
      ox: 0, oy: 0, life: 25 + Math.random() * 45, fade: 0, anim: 0, frame: 0, dying: false,
    };
    this.laneTarget(a);
    a.ox = a.tox; a.oy = a.toy;
    if (kind !== 'ped') {
      // luz do farol no chão, à frente do veículo (aparece à noite)
      a.glow = this.scene.sprite('headGlow');
      a.glow.isHeadlight = true;
      this.scene.lightsLayer.addChild(a.glow);
    }
    this.agents.push(a);
  }

  laneTarget(a) {
    const [dx, dy] = DIRS[a.dir], off = a.kind === 'ped' ? SIDEWALK * a.side : LANE;
    a.tox = -dy * off; a.toy = dx * off;   // lado direito de quem anda
  }

  // Chegou ao centro de um tile: escolhe para onde seguir
  turn(a) {
    const back = (a.inDir + 2) % 4;
    const opts = [];
    for (let k = 0; k < 4; k++) {
      if (k === back) continue;
      if (this.isRoad(a.x + DIRS[k][0], a.y + DIRS[k][1])) opts.push(k);
    }
    if (!opts.length) {
      if (this.isRoad(a.x + DIRS[back][0], a.y + DIRS[back][1])) opts.push(back);
      else { a.stuck = true; return; }
    }
    // prefere seguir reto
    a.dir = opts.includes(a.inDir) && Math.random() < 0.6 ? a.inDir : opts[(Math.random() * opts.length) | 0];
    if (a.kind !== 'ped') {
      const t = this.scene.tex[a.base + a.dir];
      a.s.texture = t.texture;
      a.s.anchor.set(t.ax, t.ay);
    }
    this.laneTarget(a);
  }

  // Há outro veículo logo à frente na mesma faixa?
  blocked(a, lanes) {
    const gap = a.kind === 'bus' ? 0.62 : 0.42;
    const md = a.t < 0.5 ? a.inDir : a.dir;
    for (const b of lanes.get((a.y * N + a.x) * 4 + md) || []) {
      if (b !== a && !b.dying && b.t > a.t && b.t - a.t < gap) return true;
    }
    const [dx, dy] = DIRS[md];
    const nx = a.x + dx, ny = a.y + dy;
    if (nx < 0 || ny < 0 || nx >= N || ny >= N) return false;
    for (const b of lanes.get((ny * N + nx) * 4 + md) || []) {
      if (!b.dying && 1 - a.t + b.t < gap) return true;
    }
    return false;
  }

  kill(a) {
    a.s.destroy();
    a.glow?.destroy();
    a.dead = true;
  }

  update(dt) {
    if (!this.world || !this.scene.objects) return;
    const mul = SPEED_MUL[this.game.speed] ?? 1;

    if ((this.scanT += dt) > 1) {
      this.scanT = 0;
      this.scanRoads();
      this.want = this.targets();
    }
    const want = this.want || { car: 0, bus: 0, ped: 0 };
    const count = { car: 0, bus: 0, ped: 0 };
    for (const a of this.agents) if (!a.dying) count[a.kind]++;
    if (mul > 0) {
      for (const kind of ['car', 'bus', 'ped']) {
        for (let n = 0; n < 3 && count[kind] < want[kind]; n++) { this.spawn(kind); count[kind]++; }
        // excesso (ruas demolidas, cidade encolheu): alguns vão embora
        let extra = count[kind] - want[kind];
        for (const a of this.agents) {
          if (extra <= 0) break;
          if (a.kind === kind && !a.dying) { a.dying = true; extra--; }
        }
      }
    }

    // Mapa de quem está em cada faixa: (tile, direção do movimento) -> veículos
    const lanes = new Map();
    for (const a of this.agents) {
      if (a.kind === 'ped') continue;
      const key = (a.y * N + a.x) * 4 + (a.t < 0.5 ? a.inDir : a.dir);
      (lanes.get(key) || lanes.set(key, []).get(key)).push(a);
    }

    const w = this.world;
    for (const a of this.agents) {
      if (!w.road[a.y * N + a.x]) { this.kill(a); continue; }
      const step = dt * mul;
      if (step > 0) {
        a.life -= step;
        if (a.life <= 0) a.dying = true;
        // t vai de 0 a 1 dentro do tile: na primeira metade anda em inDir até o
        // centro, ali decide a saída (dir) e segue até a borda.
        if (!a.stuck && !(a.kind !== 'ped' && this.blocked(a, lanes))) {
          const t0 = a.t;
          // rua congestionada: o trânsito anda devagar
          const jam = a.kind === 'ped' ? 0 : w.jam[a.y * N + a.x];
          a.t += a.speed * step * (jam > 70 ? 70 / jam : 1);
          if (t0 < 0.5 && a.t >= 0.5) this.turn(a);
          if (a.stuck) a.t = 0.5;
          else if (a.t >= 1) {
            const [dx, dy] = DIRS[a.dir];
            if (this.isRoad(a.x + dx, a.y + dy)) {
              a.x += dx; a.y += dy; a.t -= 1; a.inDir = a.dir;
            } else { a.t = 0.5; this.turn(a); }   // a rua acabou de ser demolida à frente
          }
        }
        const k = Math.min(1, step * 6);
        a.ox += (a.tox - a.ox) * k; a.oy += (a.toy - a.oy) * k;
        if (a.kind === 'ped' && (a.anim += step) > 0.2) {
          a.anim = 0; a.frame ^= 1;
          a.s.texture = this.scene.tex[a.base + a.frame].texture;
        }
      }
      a.fade = a.dying ? a.fade - dt * 2 : Math.min(1, a.fade + dt * 2);
      if (a.dying && a.fade <= 0) { this.kill(a); continue; }

      // posição em tiles (contínua) -> mundo
      const [dx, dy] = DIRS[a.t < 0.5 ? a.inDir : a.dir];
      const tt = a.t - 0.5;   // t = 0.5 é o centro do tile atual
      const fx = a.x + 0.5 + dx * tt + a.ox, fy = a.y + 0.5 + dy * tt + a.oy;
      const px = (fx - fy) * HW, py = (fx + fy) * HH;
      if (a.kind === 'ped') a.s.position.set(px, py);
      else a.s.position.set(px, py - HH);
      a.s.zIndex = (fx + fy) * 2;
      a.s.alpha = a.fade;
      a.s.visible = this.scene.inView(px, py);
      if (a.glow) {
        const reach = a.kind === 'bus' ? 0.55 : 0.42;
        const gx = fx + dx * reach, gy = fy + dy * reach;
        a.glow.position.set((gx - gy) * HW, (gx + gy) * HH);
        a.glow.alpha = a.fade;
        a.glow.visible = a.s.visible;
      }
    }
    if (this.agents.some(a => a.dead)) this.agents = this.agents.filter(a => !a.dead);
  }
}
