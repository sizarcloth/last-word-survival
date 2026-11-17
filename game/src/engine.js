// LAST WORD — engine. The Game class owns the match: rounds, the random
// Wordsmith pick, casting, the shrinking zone, word scrolls, damage and
// deaths, particles, and the win/lose end. Rendering lives in render.js,
// the DOM HUD in ui.js; this file calls back into both through hooks.

import { makePlayers, movePlayer, updateBot, PLAYER_RADIUS } from './players.js';
import { matchWord, randomUnknownWord, wordById } from './words.js';
import { spawnWordHazard, updateHazards } from './hazards.js';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ZONE_START_R = 740;
const ZONE_MIN_R = 95;
const ZONE_SHRINK_RATE = 9;

export class Game {
  constructor(hooks, opts = {}) {
    this.hooks = hooks;
    this.fast = !!opts.fast;
    this.canvasW = 1280;
    this.canvasH = 720;
    this.arena = { x: 16, y: 80, w: 1248, h: 624 };
    this.reset(1);
  }

  reset(seed) {
    this.rng = mulberry32(seed);
    this.state = 'menu';
    this.time = 0;
    this.players = [];
    this.hazards = [];
    this.particles = [];
    this.floaters = [];
    this.scrolls = [];
    this.zone = { cx: this.arena.x + this.arena.w / 2, cy: this.arena.y + this.arena.h / 2, r: ZONE_START_R, targetR: ZONE_START_R };
    this.round = 0;
    this.roundLen = this.fast ? 6 : 20;
    this.castWindow = this.fast ? 3 : 10;
    this.roundT = 0;
    this.wordsmith = null;
    this.castPhase = null; // { timeLeft, cast, botDelay }
    this.lastCast = null;
    this.effects = { rain: 0, ice: 0, night: 0, gravity: 0, flood: null, wind: { t: 0, dx: 1, dy: 0 } };
    this.scrollT = 5;
    this.shakeMag = 0;
    this.human = null;
    this.winner = null;
    this.humanPlace = null;
    this.spectating = false;
    this.humanInput = { x: 0, y: 0 };
    this.zoneTick = 0;
    this.floodTick = 0;
  }

  aliveCount() {
    return this.players.reduce((n, p) => n + (p.alive ? 1 : 0), 0);
  }

  alivePlayers() {
    return this.players.filter((p) => p.alive);
  }

  start(seed) {
    this.reset(seed);
    this.players = makePlayers(this.arena, this.rng);
    this.human = this.players[0];
    this.state = 'playing';
    this.beginRound();
  }

  beginRound() {
    this.round += 1;
    this.roundT = this.roundLen;
    // Survivors grow: one new word every two rounds survived.
    for (const p of this.alivePlayers()) {
      if (this.round > 1) {
        p.roundsSurvived += 1;
        if (p.roundsSurvived % 2 === 0) this.grantWord(p, 'survived');
      }
    }
    // The zone tightens every round.
    this.zone.targetR = Math.max(ZONE_MIN_R, this.zone.r * 0.8);
    // Pick the Wordsmith at random from the living.
    const alive = this.alivePlayers();
    this.wordsmith = alive[Math.floor(this.rng() * alive.length)];
    this.castPhase = { timeLeft: this.castWindow, cast: false, botDelay: this.fast ? 0.6 : 1.4 };
    this.hooks.onBanner(`ROUND ${this.round}`, `Wordsmith: ${this.wordsmith.name}`);
    this.hooks.onFeed(`ROUND ${this.round} — Wordsmith: ${this.wordsmith.name}`, 'round');
    if (this.wordsmith.isHuman) this.hooks.onCastPrompt(true, this.castWindow);
  }

  grantWord(p, why) {
    const w = randomUnknownWord(p.known, this.round, this.rng);
    if (!w) return null;
    p.learn(w.id);
    if (p.isHuman) {
      this.hooks.onFeed(`YOU learned ${w.name}${why === 'scroll' ? ' from a scroll' : ' by surviving'}`, 'learn');
      this.hooks.onGrimoire();
    }
    return w;
  }

  // The Wordsmith casts a word. Returns the word def, or null if refused.
  cast(text, caster) {
    if (this.state !== 'playing' || !this.castPhase || this.castPhase.cast) return null;
    if (caster !== this.wordsmith) return null;
    const word = typeof text === 'string' ? matchWord(text) : wordById(text);
    if (!word || !caster.known.has(word.id)) return null;
    this.castPhase.cast = true;
    caster.wordsCast += 1;
    this.lastCast = { word, caster, at: this.time };
    spawnWordHazard(this, word, caster);
    this.hooks.onBanner(word.name, `cast by ${caster.name}`);
    this.hooks.onFeed(`${caster.name} cast ${word.name}`, 'cast');
    if (caster.isHuman) this.hooks.onCastPrompt(false, 0);
    return word;
  }

  autoCastBot() {
    const known = [...this.wordsmith.known];
    const id = known[Math.floor(this.rng() * known.length)];
    this.cast(id, this.wordsmith);
  }

  autoCastHumanTimeout() {
    const known = [...this.human.known];
    const id = known[Math.floor(this.rng() * known.length)];
    this.hooks.onFeed('Out of time — a random word was cast for YOU', 'warn');
    this.cast(id, this.human);
  }

  setHumanInput(x, y) {
    this.humanInput.x = x;
    this.humanInput.y = y;
  }

  humanDash() {
    if (this.state === 'playing' && this.human && this.human.alive) this.human.tryDash();
  }

  shake(mag) {
    this.shakeMag = Math.min(18, Math.max(this.shakeMag, mag));
  }

  spawnParticle(x, y, vx, vy, life, color, size) {
    if (this.particles.length > 420) return;
    this.particles.push({ x, y, vx, vy, life, maxLife: life, color, size });
  }

  burst(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = this.rng() * Math.PI * 2;
      const sp = 40 + this.rng() * 160;
      this.spawnParticle(x, y, Math.cos(a) * sp, Math.sin(a) * sp, 0.4 + this.rng() * 0.5, color, 2 + this.rng() * 4);
    }
  }

  floatText(x, y, text, color) {
    if (this.floaters.length > 40) this.floaters.shift();
    this.floaters.push({ x, y, text, color, life: 0.9 });
  }

  damagePlayer(p, amount, word, caster, quiet = false) {
    if (!p.alive || this.state !== 'playing') return;
    if (p.shielded) {
      if (!quiet) this.floatText(p.x, p.y - 24, 'BLOCKED', '#ffd94d');
      return;
    }
    p.hp -= amount;
    p.flashT = 0.18;
    if (!quiet) this.floatText(p.x, p.y - 24, `-${Math.round(amount)}`, '#ff6b6b');
    if (p.hp <= 0) this.killPlayer(p, word, caster);
  }

  killPlayer(p, word, caster) {
    p.hp = 0;
    p.alive = false;
    p.deadT = this.time;
    this.burst(p.x, p.y, p.color, 22);
    this.burst(p.x, p.y, '#ffffff', 8);
    if (caster && caster !== p && caster.alive) caster.kills += 1;
    const verb = word && word.killVerb ? word.killVerb : 'fell outside the zone';
    this.hooks.onFeed(`${p.name} ${verb}`, 'death');
    if (p.isHuman) {
      this.humanPlace = this.aliveCount() + 1;
      this.spectating = true;
      this.hooks.onSpectate(this.humanPlace);
    }
    if (this.aliveCount() <= 1) this.endGame();
  }

  endGame() {
    const survivors = this.alivePlayers();
    this.winner = survivors[0] || null;
    this.state = 'ended';
    this.hooks.onCastPrompt(false, 0);
    this.hooks.onEnd(this.winner, {
      rounds: this.round,
      humanPlace: this.humanPlace,
      humanKills: this.human ? this.human.kills : 0,
      humanWords: this.human ? this.human.wordsCast : 0,
    });
  }

  spawnScroll() {
    if (this.scrolls.length >= 3) return;
    const a = this.arena;
    this.scrolls.push({
      x: a.x + 40 + this.rng() * (a.w - 80),
      y: a.y + 40 + this.rng() * (a.h - 80),
      t: 0,
    });
  }

  update(dt) {
    if (this.state !== 'playing') return;
    this.time += dt;
    this.roundT -= dt;
    this.shakeMag = Math.max(0, this.shakeMag - dt * 26);

    // Casting phase: bot casts after a beat; human times out.
    if (this.castPhase && !this.castPhase.cast) {
      if (this.wordsmith.isHuman) {
        this.castPhase.timeLeft -= dt;
        this.hooks.onCastTick(Math.max(0, this.castPhase.timeLeft));
        if (this.castPhase.timeLeft <= 0) this.autoCastHumanTimeout();
      } else {
        this.castPhase.botDelay -= dt;
        if (this.castPhase.botDelay <= 0 && this.wordsmith.alive) this.autoCastBot();
        else if (!this.wordsmith.alive) this.castPhase.cast = true;
      }
    }

    // Effect timers.
    this.effects.rain = Math.max(0, this.effects.rain - dt);
    this.effects.ice = Math.max(0, this.effects.ice - dt);
    this.effects.night = Math.max(0, this.effects.night - dt);
    this.effects.gravity = Math.max(0, this.effects.gravity - dt);
    this.effects.wind.t = Math.max(0, this.effects.wind.t - dt);
    if (this.effects.flood) {
      this.effects.flood.t -= dt;
      if (this.effects.flood.t <= 0) this.effects.flood = null;
    }

    // Zone shrinks toward its target.
    if (this.zone.r > this.zone.targetR) {
      this.zone.r = Math.max(this.zone.targetR, this.zone.r - ZONE_SHRINK_RATE * dt);
    }

    // Move everyone.
    for (const p of this.players) {
      if (!p.alive) continue;
      if (p.isHuman) {
        movePlayer(p, this, dt, this.humanInput.x, this.humanInput.y);
      } else {
        updateBot(p, this, dt);
        movePlayer(p, this, dt, p.wantX, p.wantY);
      }
    }

    updateHazards(this, dt);

    // Zone damage + flood damage, in quiet half-second ticks.
    this.zoneTick += dt;
    if (this.zoneTick >= 0.5) {
      this.zoneTick = 0;
      const zoneDps = 8 + this.round * 2;
      for (const p of this.alivePlayers()) {
        const d = Math.hypot(p.x - this.zone.cx, p.y - this.zone.cy);
        if (d > this.zone.r) this.damagePlayer(p, zoneDps * 0.5, null, null, true);
      }
      if (this.effects.flood) {
        const f = this.effects.flood;
        const progress = 1 - f.t / f.max;
        const waterR = this.zone.r + 260 * (1 - progress);
        for (const p of this.alivePlayers()) {
          const d = Math.hypot(p.x - this.zone.cx, p.y - this.zone.cy);
          if (d > waterR) this.damagePlayer(p, 9 * 0.5, wordById('flood'), this.lastCast ? this.lastCast.caster : null, true);
        }
      }
    }

    // Scrolls spawn and get picked up.
    this.scrollT -= dt;
    if (this.scrollT <= 0) {
      this.scrollT = this.fast ? 3.5 : 7;
      this.spawnScroll();
    }
    for (const s of this.scrolls) {
      s.t += dt;
      for (const p of this.alivePlayers()) {
        if (Math.hypot(p.x - s.x, p.y - s.y) < 30) {
          s.taken = true;
          const learned = this.grantWord(p, 'scroll');
          if (!learned && p.hp < 100) {
            p.hp = Math.min(100, p.hp + 15);
            if (p.isHuman) this.hooks.onFeed('YOU already know every word: +15 HP', 'learn');
          }
          this.burst(s.x, s.y, '#ffd94d', 10);
          break;
        }
      }
    }
    this.scrolls = this.scrolls.filter((s) => !s.taken);

    // Particles and floating text.
    for (const pt of this.particles) {
      pt.life -= dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vx *= 0.96;
      pt.vy *= 0.96;
    }
    this.particles = this.particles.filter((pt) => pt.life > 0);
    for (const f of this.floaters) {
      f.life -= dt;
      f.y -= 26 * dt;
    }
    this.floaters = this.floaters.filter((f) => f.life > 0);

    if (this.roundT <= 0 && this.state === 'playing') this.beginRound();
  }
}
