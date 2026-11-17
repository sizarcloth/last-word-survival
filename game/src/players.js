// LAST WORD — players: the human, nineteen bots, dashing and bot brains.
// Bots wander, flee telegraphed hazards, chase nearby word scrolls, keep
// inside the shrinking zone, and sometimes dash out of danger.

import { BASIC_WORD_IDS } from './words.js';

export const BOT_NAMES = [
  'INK', 'RUNE', 'HEX', 'FABLE', 'MYTH', 'OMEN', 'ECHO', 'GLYPH', 'SABLE',
  'WISP', 'BRAM', 'CODA', 'DUSK', 'EMBER', 'FROST', 'GALE', 'HAZE', 'IRIS', 'JINX',
];

const BOT_COLORS = [
  '#f87171', '#fb923c', '#facc15', '#a3e635', '#4ade80', '#2dd4bf', '#38bdf8',
  '#818cf8', '#c084fc', '#f472b6', '#fb7185', '#fda4af', '#fdba74', '#fde68a',
  '#bef264', '#86efac', '#67e8f9', '#a5b4fc', '#e879f9',
];

export const PLAYER_RADIUS = 13;
export const DASH_TIME = 0.18;
export const DASH_COOLDOWN = 2.0;
export const DASH_SPEED = 540;

export class Player {
  constructor(id, name, isHuman, color, x, y, speed) {
    this.id = id;
    this.name = name;
    this.isHuman = isHuman;
    this.color = color;
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.hp = 100;
    this.alive = true;
    this.known = new Set(BASIC_WORD_IDS);
    this.kills = 0;
    this.wordsCast = 0;
    this.roundsSurvived = 0;
    this.speed = speed;
    this.dashCd = 0;
    this.dashT = 0;
    this.dashDx = 1;
    this.dashDy = 0;
    this.rootedUntil = 0;
    this.shieldUntil = 0;
    this.flashT = 0;
    this.deadT = 0;
    this.faceX = 1;
    this.faceY = 0;
    // Bot brain state.
    this.thinkT = 0;
    this.wanderX = x;
    this.wanderY = y;
    this.wantX = 0;
    this.wantY = 0;
  }

  get shielded() {
    return this.shieldUntil > 0;
  }
  get rooted() {
    return this.rootedUntil > 0;
  }

  learn(wordId) {
    if (!this.known.has(wordId)) {
      this.known.add(wordId);
      return true;
    }
    return false;
  }

  tryDash() {
    if (this.dashCd > 0 || this.dashT > 0 || !this.alive || this.rooted) return false;
    this.dashT = DASH_TIME;
    this.dashCd = DASH_COOLDOWN;
    const len = Math.hypot(this.faceX, this.faceY) || 1;
    this.dashDx = this.faceX / len;
    this.dashDy = this.faceY / len;
    return true;
  }
}

export function makePlayers(arena, rng) {
  const players = [];
  const spots = [];
  // Scatter start spots on a jittered grid so nobody spawns stacked.
  for (let gy = 0; gy < 5; gy++) {
    for (let gx = 0; gx < 4; gx++) {
      spots.push({
        x: arena.x + ((gx + 0.5) / 4) * arena.w + (rng() - 0.5) * 90,
        y: arena.y + ((gy + 0.5) / 5) * arena.h + (rng() - 0.5) * 70,
      });
    }
  }
  for (let i = spots.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [spots[i], spots[j]] = [spots[j], spots[i]];
  }
  players.push(new Player(0, 'YOU', true, '#22d3ee', spots[0].x, spots[0].y, 158));
  for (let i = 0; i < 19; i++) {
    const s = spots[i + 1];
    players.push(new Player(i + 1, BOT_NAMES[i], false, BOT_COLORS[i], s.x, s.y, 138 + rng() * 28));
  }
  return players;
}

// --- Bot brain -------------------------------------------------------------

function dangerFrom(p, game) {
  // Returns a repulsion vector: away from every nearby threat, weighted.
  let dx = 0;
  let dy = 0;
  const push = (x, y, radius, weight) => {
    const ddx = p.x - x;
    const ddy = p.y - y;
    const d = Math.hypot(ddx, ddy);
    if (d < 1 || d > radius) return;
    const f = weight * (1 - d / radius);
    dx += (ddx / d) * f;
    dy += (ddy / d) * f;
  };
  for (const h of game.hazards) {
    if (h.kind === 'meteorTarget') push(h.x, h.y, 130, 3.2);
    else if (h.kind === 'bomb') push(h.x, h.y, 190, 3.0);
    else if (h.kind === 'tornado') push(h.x, h.y, 220, 2.6);
    else if (h.kind === 'zombie') push(h.x, h.y, 110, 2.2);
    else if (h.kind === 'bees') push(h.x, h.y, 150, 2.4);
    else if (h.kind === 'firePatch' || h.kind === 'lavaPool') push(h.x, h.y, h.r + 55, 2.0);
    else if (h.kind === 'poisonCloud') push(h.x, h.y, h.r + 45, 1.6);
    else if (h.kind === 'vinePatch') push(h.x, h.y, h.r + 40, 1.4);
  }
  // The zone edge is a threat too: run inward when outside or near it.
  const zx = p.x - game.zone.cx;
  const zy = p.y - game.zone.cy;
  const zd = Math.hypot(zx, zy);
  if (zd > game.zone.r - 40) {
    const f = zd > game.zone.r ? 4 : 1.6;
    dx += (-zx / (zd || 1)) * f;
    dy += (-zy / (zd || 1)) * f;
  }
  return { dx, dy, danger: Math.hypot(dx, dy) };
}

export function updateBot(p, game, dt) {
  if (!p.alive) return;
  p.thinkT -= dt;
  if (p.thinkT <= 0) {
    p.thinkT = 0.25 + game.rng() * 0.2;
    const rep = dangerFrom(p, game);
    let mx = rep.dx;
    let my = rep.dy;
    // Chase a close scroll when nothing is trying to kill us.
    let best = null;
    let bestD = 190;
    for (const s of game.scrolls) {
      const d = Math.hypot(s.x - p.x, s.y - p.y);
      if (d < bestD) { bestD = d; best = s; }
    }
    if (best && rep.danger < 1.2) {
      mx += (best.x - p.x) / (bestD || 1) * 1.6;
      my += (best.y - p.y) / (bestD || 1) * 1.6;
    } else if (rep.danger < 0.6) {
      // Wander: pick a fresh target now and then, biased to the zone.
      if (Math.hypot(p.wanderX - p.x, p.wanderY - p.y) < 30 || game.rng() < 0.25) {
        const a = game.rng() * Math.PI * 2;
        const r = game.rng() * Math.max(40, game.zone.r * 0.7);
        p.wanderX = game.zone.cx + Math.cos(a) * r;
        p.wanderY = game.zone.cy + Math.sin(a) * r;
      }
      const wd = Math.hypot(p.wanderX - p.x, p.wanderY - p.y) || 1;
      mx += ((p.wanderX - p.x) / wd) * 0.9;
      my += ((p.wanderY - p.y) / wd) * 0.9;
    }
    const len = Math.hypot(mx, my);
    if (len > 0.01) {
      p.wantX = mx / len;
      p.wantY = my / len;
    } else {
      p.wantX = 0;
      p.wantY = 0;
    }
    // Dash away from a close, deadly telegraph.
    if (rep.danger > 2.4 && p.dashCd <= 0 && game.rng() < 0.6) {
      p.faceX = p.wantX;
      p.faceY = p.wantY;
      p.tryDash();
    }
  }
}

// --- Shared movement -------------------------------------------------------

export function movePlayer(p, game, dt, dirX, dirY) {
  if (!p.alive) return;
  p.dashCd = Math.max(0, p.dashCd - dt);
  p.flashT = Math.max(0, p.flashT - dt);
  p.rootedUntil = Math.max(0, p.rootedUntil - dt);
  p.shieldUntil = Math.max(0, p.shieldUntil - dt);
  const slippery = game.effects.ice > 0;
  const speedMul = (game.effects.rain > 0 ? 0.62 : 1) * (game.effects.gravity > 0 ? 1.3 : 1);
  const top = p.speed * speedMul;
  if (p.dashT > 0) {
    p.dashT -= dt;
    p.vx = p.dashDx * DASH_SPEED;
    p.vy = p.dashDy * DASH_SPEED;
    game.spawnParticle(p.x, p.y, -p.dashDx * 40, -p.dashDy * 40, 0.25, p.color, 4);
  } else if (p.rooted) {
    p.vx *= 0.8;
    p.vy *= 0.8;
  } else {
    const tx = dirX * top;
    const ty = dirY * top;
    const grip = slippery ? 2.2 : 10;
    p.vx += (tx - p.vx) * Math.min(1, grip * dt);
    p.vy += (ty - p.vy) * Math.min(1, grip * dt);
  }
  // Wind shoves everyone.
  if (game.effects.wind.t > 0) {
    p.vx += game.effects.wind.dx * 260 * dt;
    p.vy += game.effects.wind.dy * 260 * dt;
  }
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  const a = game.arena;
  p.x = Math.max(a.x + PLAYER_RADIUS, Math.min(a.x + a.w - PLAYER_RADIUS, p.x));
  p.y = Math.max(a.y + PLAYER_RADIUS, Math.min(a.y + a.h - PLAYER_RADIUS, p.y));
  if (dirX !== 0 || dirY !== 0) {
    const l = Math.hypot(dirX, dirY) || 1;
    p.faceX = dirX / l;
    p.faceY = dirY / l;
  }
}
