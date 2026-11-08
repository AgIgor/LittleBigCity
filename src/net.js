// Multiplayer cooperativo via PeerJS (WebRTC, sem servidor próprio).
// O anfitrião roda a simulação e é a única fonte da verdade. Os convidados
// mandam ações, e o anfitrião devolve só os tiles que mudaram.
import { World } from './world.js';
import { apply, fmt } from './actions.js';

const PREFIX = 'littlebigcity-v1-';
const COLORS = [0xf2c94c, 0x56ccf2, 0xeb5757, 0xbb6bd9, 0x6fcf97, 0xf2994a, 0xffffff, 0x2d9cdb];
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const randomCode = () => Array.from({ length: 5 }, () => CODE_CHARS[(Math.random() * CODE_CHARS.length) | 0]).join('');

export class Net {
  constructor(game) {
    this.game = game;
    this.role = null;          // null | 'host' | 'client'
    this.peer = null;
    this.conns = new Map();    // anfitrião: id do peer -> conexão
    this.hostConn = null;      // convidado: conexão com o anfitrião
    this.players = new Map();  // id -> {id, name, color, cur}
    this.myId = 'host';
    this.code = '';
    this.sendT = 0;
    this.stateT = 0;
    this.lastCur = null;
  }

  get active() { return !!this.role; }
  get isClient() { return this.role === 'client'; }

  // ---------- anfitrião ----------
  async host(name) {
    this.leave(true);
    for (let tries = 0; tries < 4; tries++) {
      const code = randomCode();
      try {
        await this.open(PREFIX + code);
        this.role = 'host';
        this.code = code;
        this.myId = 'host';
        this.players.clear();
        this.players.set('host', { id: 'host', name, color: COLORS[0], cur: null });
        this.peer.on('connection', conn => this.onGuest(conn));
        this.game.world.changed.clear();
        this.changed();
        return code;
      } catch (err) {
        if (err.type !== 'unavailable-id') throw err;
      }
    }
    throw new Error('Não consegui criar a sala');
  }

  onGuest(conn) {
    conn.on('open', () => {
      this.conns.set(conn.peer, conn);
      const used = new Set([...this.players.values()].map(p => p.color));
      const color = COLORS.find(c => !used.has(c)) ?? COLORS[this.players.size % COLORS.length];
      const name = String(conn.metadata?.name || 'Convidado').slice(0, 20);
      this.players.set(conn.peer, { id: conn.peer, name, color, cur: null });
      conn.send({ t: 'welcome', you: conn.peer, world: this.game.world.serialize(), speed: this.game.speed });
      this.broadcastPlayers();
      this.game.ui.toast(`${name} entrou na cidade`);
    });
    conn.on('data', msg => this.fromGuest(conn, msg));
    const gone = () => {
      if (!this.conns.has(conn.peer)) return;
      this.conns.delete(conn.peer);
      const p = this.players.get(conn.peer);
      this.players.delete(conn.peer);
      this.broadcastPlayers();
      if (p) this.game.ui.toast(`${p.name} saiu`);
    };
    conn.on('close', gone);
    conn.on('error', gone);
  }

  fromGuest(conn, msg) {
    const p = this.players.get(conn.peer);
    if (!p || !msg) return;
    switch (msg.t) {
      case 'act': {
        const r = apply(this.game.world, msg.action);
        conn.send({ t: 'actResult', ok: r.ok, msg: r.msg, cost: r.cost });
        break;
      }
      case 'cur':
        p.cur = msg.cur;
        this.broadcast({ t: 'cur', id: p.id, cur: msg.cur }, conn.peer);
        this.changed();
        break;
      case 'speed':
        this.game.setSpeed(msg.speed | 0);
        break;
    }
  }

  broadcast(msg, except) {
    for (const [id, c] of this.conns) if (id !== except && c.open) c.send(msg);
  }
  broadcastPlayers() {
    this.broadcast({ t: 'players', list: [...this.players.values()] });
    this.changed();
  }

  // Chamado a cada quadro pelo anfitrião: envia o que mudou
  update(dt) {
    if (this.role !== 'host' || !this.conns.size) { this.game.world.changed.clear(); return; }
    const w = this.game.world;
    this.sendT += dt; this.stateT += dt;
    if (this.sendT < 0.1) return;
    this.sendT = 0;
    const tiles = w.changed.size ? [...w.changed].map(i => w.tileState(i)) : null;
    w.changed.clear();
    if (tiles || this.stateT > 0.5) {
      this.stateT = 0;
      this.broadcast({ t: 'delta', tiles, money: w.money, day: w.day, demand: w.demand, speed: this.game.speed });
    }
  }

  // ---------- convidado ----------
  async join(code, name) {
    this.leave(true);
    code = code.trim().toUpperCase();
    await this.open();
    const conn = this.peer.connect(PREFIX + code, { reliable: true, metadata: { name } });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Sala não encontrada')), 12000);
      conn.on('open', () => { clearTimeout(timer); resolve(); });
      conn.on('error', e => { clearTimeout(timer); reject(e); });
      this.peer.on('error', e => { clearTimeout(timer); reject(e.type === 'peer-unavailable' ? new Error('Sala não encontrada') : e); });
    });
    this.role = 'client';
    this.code = code;
    this.hostConn = conn;
    conn.on('data', msg => this.fromHost(msg));
    conn.on('close', () => this.hostLost());
    conn.on('error', () => this.hostLost());
    this.changed();
  }

  fromHost(msg) {
    const g = this.game;
    switch (msg.t) {
      case 'welcome': {
        this.myId = msg.you;
        const w = World.deserialize(msg.world);
        if (w) g.useWorld(w);
        g.setSpeed(msg.speed, true);
        g.ui.toast(`Você entrou na sala ${this.code}`);
        break;
      }
      case 'players':
        this.players = new Map(msg.list.map(p => [p.id, p]));
        this.changed();
        break;
      case 'cur': {
        const p = this.players.get(msg.id);
        if (p) { p.cur = msg.cur; this.changed(); }
        break;
      }
      case 'delta': {
        const w = g.world;
        if (msg.tiles) {
          const roads = [];
          for (const s of msg.tiles) if (w.setTileState(s)) roads.push(s[0]);
          if (roads.length) w.roadsChangedAt(roads);
          w.recomputeStats();
          g.input?.refresh();
        }
        w.money = msg.money; w.day = msg.day; w.demand = msg.demand;
        w.changed.clear();
        if (msg.speed !== g.speed) g.setSpeed(msg.speed, true);
        break;
      }
      case 'actResult':
        if (!msg.ok) g.ui.toast(msg.msg, true);
        else if (msg.cost) g.ui.toast(`− R$ ${fmt(msg.cost)}`);
        break;
    }
  }

  hostLost() {
    if (this.role !== 'client') return;
    this.leave(true);
    this.game.ui.toast('A conexão com o anfitrião caiu. Voltando para a sua cidade.', true);
    this.game.loadOwnCity();
  }

  // ---------- comum ----------
  open(id) {
    return new Promise((resolve, reject) => {
      if (!window.Peer) { reject(new Error('PeerJS não carregou')); return; }
      const peer = new window.Peer(id, { debug: 1 });
      const fail = e => { peer.destroy(); reject(e); };
      peer.once('open', () => { peer.off('error', fail); this.peer = peer; resolve(); });
      peer.once('error', fail);
    });
  }

  sendAction(action) { this.hostConn?.send({ t: 'act', action }); }
  sendSpeed(speed) { this.hostConn?.send({ t: 'speed', speed }); }

  cursor(tile) {
    if (!this.active) return;
    const cur = tile ? [tile.x, tile.y] : null;
    if (String(cur) === String(this.lastCur)) return;
    this.lastCur = cur;
    if (this.role === 'client') this.hostConn?.send({ t: 'cur', cur });
    else {
      const me = this.players.get('host');
      if (me) me.cur = cur;
      this.broadcast({ t: 'cur', id: 'host', cur });
    }
  }

  leave(silent) {
    if (this.peer) { try { this.peer.destroy(); } catch { /* já fechado */ } }
    this.peer = null; this.hostConn = null; this.conns.clear(); this.players.clear();
    const wasClient = this.role === 'client';
    this.role = null; this.code = ''; this.lastCur = null;
    this.changed();
    if (!silent && wasClient) this.game.loadOwnCity();
  }

  // Avisa a interface e a cena que a lista de jogadores ou cursores mudou
  changed() {
    this.game.ui?.renderMultiplayer();
    this.game.scene?.setCursors([...this.players.values()].filter(p => p.id !== this.myId && p.cur));
  }
}
