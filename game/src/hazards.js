// LAST WORD — hazards. A cast word becomes real here: telegraphed meteors,
// tracking lightning, spreading fire, wandering tornadoes, zombies, bees,
// lava, floods and more. Every hazard hurts everyone alike — the caster is
// not spared. Drawing lives in render.js; this file owns behaviour.

function randSpot(game, margin = 40) {
  const a = game.arena;
  return {
    x: a.x + margin + game.rng() * (a.w - margin * 2),
    y: a.y + margin + game.rng() * (a.h - margin * 2),
  };
}

function alivePlayers(game) {
  return game.players.filter((p) => p.alive);
}

function pickRandom(game, list) {
  return list[Math.floor(game.rng() * list.length)];
}

export function spawnWordHazard(game, word, caster) {
  const rng = game.rng;
  const round = game.round;
  switch (word.id) {
    case 'meteor': {
      const n = Math.min(9, 5 + Math.floor(round / 2));
      for (let i = 0; i < n; i++) {
        const s = randSpot(game, 60);
        game.hazards.push({ kind: 'meteorTarget', x: s.x, y: s.y, r: 52, t: -i * 0.35, dur: 0.9, caster, word });
      }
      break;
    }
    case 'lightning': {
      const targets = [...alivePlayers(game)];
      const n = Math.min(targets.length, 3 + Math.floor(round / 3));
      for (let i = 0; i < n; i++) {
        const p = targets.splice(Math.floor(rng() * targets.length), 1)[0];
        game.hazards.push({ kind: 'bolt', target: p, x: p.x, y: p.y, r: 30, t: -i * 0.25, dur: 0.55, caster, word });
      }
      break;
    }
    case 'fire': {
      for (let i = 0; i < 4; i++) {
        const s = randSpot(game);
        game.hazards.push({ kind: 'firePatch', x: s.x, y: s.y, r: 26, t: 0, dur: word.duration, caster, word, tickT: 0 });
      }
      break;
    }
    case 'volcano': {
      for (let i = 0; i < 3; i++) {
        const s = randSpot(game, 70);
        game.hazards.push({ kind: 'lavaWarn', x: s.x, y: s.y, r: 54, t: 0, dur: 0.8, caster, word });
      }
      break;
    }
    case 'flood':
      game.effects.flood = { t: word.duration, max: word.duration };
      break;
    case 'poison': {
      for (let i = 0; i < 3; i++) {
        const s = randSpot(game);
        game.hazards.push({ kind: 'poisonCloud', x: s.x, y: s.y, r: 46, t: 0, dur: word.duration, caster, word, tickT: 0, vx: (rng() - 0.5) * 14, vy: (rng() - 0.5) * 14 });
      }
      break;
    }
    case 'vines': {
      for (let i = 0; i < 4; i++) {
        const s = randSpot(game);
        game.hazards.push({ kind: 'vinePatch', x: s.x, y: s.y, r: 42, t: 0, dur: word.duration, caster, word });
      }
      break;
    }
    case 'tornado': {
      const s = randSpot(game, 90);
      const a = rng() * Math.PI * 2;
      game.hazards.push({ kind: 'tornado', x: s.x, y: s.y, r: 46, t: 0, dur: word.duration, caster, word, vx: Math.cos(a) * 95, vy: Math.sin(a) * 95, tickT: 0 });
      break;
    }
    case 'zombies': {
      for (let i = 0; i < 3; i++) {
        const edge = Math.floor(rng() * 4);
        const a = game.arena;
        const x = edge === 0 ? a.x + 30 : edge === 1 ? a.x + a.w - 30 : a.x + rng() * a.w;
        const y = edge === 2 ? a.y + 30 : edge === 3 ? a.y + a.h - 30 : a.y + rng() * a.h;
        game.hazards.push({ kind: 'zombie', x, y, r: 15, t: 0, dur: word.duration, caster, word, hitT: 0, wob: rng() * 6 });
      }
      break;
    }
    case 'bees': {
      const s = randSpot(game, 90);
      game.hazards.push({ kind: 'bees', x: s.x, y: s.y, r: 20, t: 0, dur: word.duration, caster, word, tickT: 0 });
      break;
    }
    case 'bomb': {
      const s = randSpot(game, 80);
      game.hazards.push({ kind: 'bomb', x: s.x, y: s.y, r: 16, t: 0, dur: word.duration, caster, word });
      break;
    }
    case 'earthquake': {
      game.shake(14);
      for (const p of alivePlayers(game)) {
        const a = rng() * Math.PI * 2;
        p.vx += Math.cos(a) * 320;
        p.vy += Math.sin(a) * 320;
        game.damagePlayer(p, word.damage, word, caster);
      }
      for (let i = 0; i < 6; i++) {
        const s = randSpot(game);
        game.hazards.push({ kind: 'crack', x: s.x, y: s.y, r: 30 + rng() * 50, t: 0, dur: 3, caster, word, seed: rng() * 100 });
      }
      break;
    }
    case 'teleport': {
      for (const p of alivePlayers(game)) {
        game.burst(p.x, p.y, '#c77dff', 10);
        const s = randSpot(game, 30);
        p.x = s.x;
        p.y = s.y;
        p.vx = 0;
        p.vy = 0;
        game.burst(p.x, p.y, '#c77dff', 10);
      }
      break;
    }
    case 'heal': {
      caster.hp = Math.min(100, caster.hp + 40);
      game.floatText(caster.x, caster.y - 24, '+40', '#ff6fa5');
      game.burst(caster.x, caster.y, '#ff6fa5', 14);
      break;
    }
    case 'shield':
      caster.shieldUntil = word.duration;
      game.burst(caster.x, caster.y, '#ffd94d', 12);
      break;
    case 'rain':
      game.effects.rain = word.duration;
      break;
    case 'wind': {
      const a = rng() * Math.PI * 2;
      game.effects.wind = { t: word.duration, dx: Math.cos(a), dy: Math.sin(a) };
      break;
    }
    case 'ice':
      game.effects.ice = word.duration;
      break;
    case 'night':
      game.effects.night = word.duration;
      break;
    case 'gravity':
      game.effects.gravity = word.duration;
      break;
    default:
      break;
  }
}

function damageInside(game, h, radius, amount, perSecond) {
  for (const p of alivePlayers(game)) {
    if (Math.hypot(p.x - h.x, p.y - h.y) < radius) {
      game.damagePlayer(p, perSecond ? amount : amount, h.word, h.caster);
    }
  }
}

export function updateHazards(game, dt) {
  for (const h of game.hazards) {
    if (h.t < 0) { h.t += dt; continue; }
    h.t += dt;
    switch (h.kind) {
      case 'meteorTarget': {
        if (h.t >= h.dur) {
          h.dead = true;
          game.shake(7);
          game.burst(h.x, h.y, '#ff9a3d', 26);
          game.burst(h.x, h.y, '#5a4a3a', 14);
          damageInside(game, h, h.r, h.word.damage, false);
        }
        break;
      }
      case 'bolt': {
        if (h.target && h.target.alive) { h.x = h.target.x; h.y = h.target.y; }
        if (h.t >= h.dur) {
          h.dead = true;
          game.burst(h.x, h.y, '#ffe14d', 18);
          damageInside(game, h, h.r, h.word.damage, false);
        }
        break;
      }
      case 'firePatch': {
        h.r = Math.min(48, 26 + h.t * 4);
        h.tickT += dt;
        if (h.tickT >= 0.5) {
          h.tickT = 0;
          damageInside(game, h, h.r, h.word.damage * 0.5, false);
        }
        if (game.rng() < 0.3) game.spawnParticle(h.x + (game.rng() - 0.5) * h.r, h.y + (game.rng() - 0.5) * h.r, 0, -30, 0.5, '#ff7a1a', 3);
        if (h.t >= h.dur) h.dead = true;
        break;
      }
      case 'lavaWarn': {
        if (h.t >= h.dur) {
          game.hazards.push({ kind: 'lavaPool', x: h.x, y: h.y, r: h.r, t: 0, dur: 9, caster: h.caster, word: h.word, tickT: 0 });
          game.shake(4);
          game.burst(h.x, h.y, '#ff5722', 20);
          h.dead = true;
        }
        break;
      }
      case 'lavaPool': {
        h.tickT += dt;
        if (h.tickT >= 0.5) {
          h.tickT = 0;
          damageInside(game, h, h.r, h.word.damage * 0.5, false);
        }
        if (h.t >= h.dur) h.dead = true;
        break;
      }
      case 'poisonCloud': {
        h.x += h.vx * dt;
        h.y += h.vy * dt;
        h.tickT += dt;
        if (h.tickT >= 0.5) {
          h.tickT = 0;
          damageInside(game, h, h.r, h.word.damage * 0.5, false);
        }
        if (h.t >= h.dur) h.dead = true;
        break;
      }
      case 'vinePatch': {
        for (const p of alivePlayers(game)) {
          if (Math.hypot(p.x - h.x, p.y - h.y) < h.r && p.rootedUntil <= 0) {
            p.rootedUntil = 2.5;
            game.damagePlayer(p, h.word.damage, h.word, h.caster);
            game.floatText(p.x, p.y - 22, 'ROOTED!', '#3fae5a');
          }
        }
        if (h.t >= h.dur) h.dead = true;
        break;
      }
      case 'tornado': {
        // Wander: steer gently, bounce off arena walls.
        h.vx += (game.rng() - 0.5) * 220 * dt;
        h.vy += (game.rng() - 0.5) * 220 * dt;
        const sp = Math.hypot(h.vx, h.vy) || 1;
        const cap = 120;
        h.vx = (h.vx / sp) * Math.min(sp, cap);
        h.vy = (h.vy / sp) * Math.min(sp, cap);
        h.x += h.vx * dt;
        h.y += h.vy * dt;
        const a = game.arena;
        if (h.x < a.x + 40 || h.x > a.x + a.w - 40) h.vx *= -1;
        if (h.y < a.y + 40 || h.y > a.y + a.h - 40) h.vy *= -1;
        h.tickT += dt;
        for (const p of alivePlayers(game)) {
          const d = Math.hypot(p.x - h.x, p.y - h.y);
          if (d < 110) {
            // Suck inward, then throw.
            p.vx += ((h.x - p.x) / (d || 1)) * 300 * dt;
            p.vy += ((h.y - p.y) / (d || 1)) * 300 * dt;
            if (d < 42 && h.tickT > 0.8) {
              h.tickT = 0;
              const ang = Math.atan2(p.y - h.y, p.x - h.x) + 1.2;
              p.vx = Math.cos(ang) * 520;
              p.vy = Math.sin(ang) * 520;
              game.damagePlayer(p, h.word.damage, h.word, h.caster);
            }
          }
        }
        if (h.t >= h.dur) h.dead = true;
        break;
      }
      case 'zombie': {
        h.wob += dt * 6;
        let target = null;
        let best = Infinity;
        for (const p of alivePlayers(game)) {
          const d = Math.hypot(p.x - h.x, p.y - h.y);
          if (d < best) { best = d; target = p; }
        }
        if (target) {
          const d = best || 1;
          h.x += ((target.x - h.x) / d) * 74 * dt;
          h.y += ((target.y - h.y) / d) * 74 * dt;
          h.hitT -= dt;
          if (d < 30 && h.hitT <= 0) {
            h.hitT = 1.0;
            game.damagePlayer(target, h.word.damage, h.word, h.caster);
          }
        }
        if (h.t >= h.dur) h.dead = true;
        break;
      }
      case 'bees': {
        let target = null;
        let best = Infinity;
        for (const p of alivePlayers(game)) {
          const d = Math.hypot(p.x - h.x, p.y - h.y);
          if (d < best) { best = d; target = p; }
        }
        if (target) {
          const d = best || 1;
          h.x += ((target.x - h.x) / d) * 168 * dt;
          h.y += ((target.y - h.y) / d) * 168 * dt;
          h.tickT += dt;
          if (d < 34 && h.tickT >= 0.5) {
            h.tickT = 0;
            game.damagePlayer(target, h.word.damage, h.word, h.caster);
          }
        }
        if (h.t >= h.dur) h.dead = true;
        break;
      }
      case 'bomb': {
        if (h.t >= h.dur) {
          h.dead = true;
          game.shake(10);
          game.burst(h.x, h.y, '#ff4444', 30);
          game.burst(h.x, h.y, '#ffd94d', 20);
          damageInside(game, h, 112, h.word.damage, false);
        }
        break;
      }
      case 'crack':
        if (h.t >= h.dur) h.dead = true;
        break;
      default:
        break;
    }
  }
  game.hazards = game.hazards.filter((h) => !h.dead);
}
