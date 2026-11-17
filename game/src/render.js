// LAST WORD — rendering. Everything on the canvas: the dark arena and its
// grid, the shrinking zone, flood water, every hazard with its own look,
// players with name tags and HP bars, particles, floating damage text, and
// the night / rain / wind / ice overlays. The HUD chrome is DOM (ui.js).

import { PLAYER_RADIUS } from './players.js';

function circle(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
}

function poly(ctx, points) {
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
  ctx.closePath();
}

export function drawGame(ctx, game) {
  const W = game.canvasW;
  const H = game.canvasH;
  const a = game.arena;
  ctx.save();
  if (game.shakeMag > 0.2) {
    ctx.translate((Math.random() - 0.5) * game.shakeMag, (Math.random() - 0.5) * game.shakeMag);
  }

  // Arena floor: dark slate with a subtle grid.
  ctx.fillStyle = '#0d1117';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#121826';
  ctx.fillRect(a.x, a.y, a.w, a.h);
  ctx.strokeStyle = 'rgba(120, 150, 255, 0.07)';
  ctx.lineWidth = 1;
  for (let x = a.x; x <= a.x + a.w; x += 48) {
    ctx.beginPath(); ctx.moveTo(x, a.y); ctx.lineTo(x, a.y + a.h); ctx.stroke();
  }
  for (let y = a.y; y <= a.y + a.h; y += 48) {
    ctx.beginPath(); ctx.moveTo(a.x, y); ctx.lineTo(a.x + a.w, y); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(140, 170, 255, 0.35)';
  ctx.lineWidth = 2;
  ctx.strokeRect(a.x, a.y, a.w, a.h);

  // Zone: everything outside the circle burns.
  ctx.save();
  ctx.beginPath();
  ctx.rect(a.x, a.y, a.w, a.h);
  ctx.arc(game.zone.cx, game.zone.cy, game.zone.r, 0, Math.PI * 2, true);
  ctx.fillStyle = 'rgba(255, 60, 60, 0.13)';
  ctx.fill('evenodd');
  ctx.restore();
  ctx.strokeStyle = 'rgba(255, 90, 90, 0.9)';
  ctx.lineWidth = 3;
  circle(ctx, game.zone.cx, game.zone.cy, game.zone.r);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255, 90, 90, 0.25)';
  ctx.lineWidth = 8;
  circle(ctx, game.zone.cx, game.zone.cy, game.zone.r);
  ctx.stroke();

  // Flood water: a blue ring closing in from the edges.
  if (game.effects.flood) {
    const f = game.effects.flood;
    const progress = 1 - f.t / f.max;
    const waterR = game.zone.r + 260 * (1 - progress);
    ctx.save();
    ctx.beginPath();
    ctx.rect(a.x, a.y, a.w, a.h);
    ctx.arc(game.zone.cx, game.zone.cy, waterR, 0, Math.PI * 2, true);
    ctx.fillStyle = 'rgba(47, 127, 208, 0.5)';
    ctx.fill('evenodd');
    ctx.restore();
    ctx.strokeStyle = 'rgba(150, 210, 255, 0.8)';
    ctx.lineWidth = 2;
    circle(ctx, game.zone.cx, game.zone.cy, waterR);
    ctx.stroke();
  }

  // Ice sheen.
  if (game.effects.ice > 0) {
    ctx.fillStyle = 'rgba(174, 233, 255, 0.10)';
    ctx.fillRect(a.x, a.y, a.w, a.h);
  }

  for (const s of game.scrolls) drawScroll(ctx, s, game.time);
  for (const h of game.hazards) drawHazard(ctx, h, game);
  for (const p of game.players) if (p.alive) drawPlayer(ctx, p, game);

  // Particles.
  for (const pt of game.particles) {
    ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
    ctx.fillStyle = pt.color;
    circle(ctx, pt.x, pt.y, pt.size);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Floating text (damage numbers, ROOTED!, +40).
  ctx.textAlign = 'center';
  for (const f of game.floaters) {
    ctx.globalAlpha = Math.min(1, f.life * 2);
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;

  // Rain streaks / wind lines.
  if (game.effects.rain > 0) {
    ctx.strokeStyle = 'rgba(140, 190, 255, 0.35)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 40; i++) {
      const x = a.x + ((i * 173 + game.time * 500) % a.w);
      const y = a.y + ((i * 97 + game.time * 900) % a.h);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 6, y + 14); ctx.stroke();
    }
  }
  if (game.effects.wind.t > 0) {
    ctx.strokeStyle = 'rgba(168, 230, 161, 0.4)';
    ctx.lineWidth = 2;
    const w = game.effects.wind;
    for (let i = 0; i < 18; i++) {
      const x = a.x + ((i * 211 + game.time * 700) % a.w);
      const y = a.y + ((i * 131) % a.h);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w.dx * 34, y + w.dy * 34); ctx.stroke();
    }
  }

  // Night: darkness with a lit circle around the human.
  if (game.effects.night > 0 && game.human && game.human.alive) {
    const g = ctx.createRadialGradient(game.human.x, game.human.y, 60, game.human.x, game.human.y, 280);
    g.addColorStop(0, 'rgba(4, 4, 12, 0)');
    g.addColorStop(1, 'rgba(4, 4, 12, 0.86)');
    ctx.fillStyle = g;
    ctx.fillRect(a.x, a.y, a.w, a.h);
  }

  ctx.restore();
}

function drawScroll(ctx, s, time) {
  const bob = Math.sin(time * 3 + s.x) * 4;
  const y = s.y + bob;
  ctx.save();
  ctx.shadowColor = '#ffd94d';
  ctx.shadowBlur = 14;
  ctx.fillStyle = '#fff3c4';
  ctx.fillRect(s.x - 9, y - 12, 18, 24);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#8a6d1a';
  ctx.fillRect(s.x - 9, y - 12, 18, 4);
  ctx.fillRect(s.x - 9, y + 8, 18, 4);
  ctx.strokeStyle = '#8a6d1a';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(s.x - 5, y - 3); ctx.lineTo(s.x + 5, y - 3);
  ctx.moveTo(s.x - 5, y + 2); ctx.lineTo(s.x + 5, y + 2);
  ctx.stroke();
  ctx.restore();
  ctx.font = 'bold 10px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd94d';
  ctx.fillText('WORD', s.x, y + 26);
}

function drawHazard(ctx, h, game) {
  switch (h.kind) {
    case 'meteorTarget': {
      if (h.t < 0) break;
      const k = Math.min(1, h.t / h.dur);
      ctx.strokeStyle = `rgba(255, 120, 40, ${0.5 + k * 0.5})`;
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 6]);
      circle(ctx, h.x, h.y, h.r);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = `rgba(255, 120, 40, ${0.10 + k * 0.22})`;
      circle(ctx, h.x, h.y, h.r);
      ctx.fill();
      // The rock, falling in from above.
      const ry = h.y - 120 + k * 110;
      ctx.fillStyle = '#8a5a3a';
      circle(ctx, h.x, ry, 12);
      ctx.fill();
      ctx.fillStyle = '#ff9a3d';
      circle(ctx, h.x, ry, 6);
      ctx.fill();
      break;
    }
    case 'bolt': {
      if (h.t < 0) break;
      const flicker = Math.sin(h.t * 60) > 0 ? 1 : 0.35;
      ctx.strokeStyle = `rgba(255, 225, 77, ${flicker})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      let x = h.x;
      let y = h.y - 130;
      ctx.moveTo(x, y);
      for (let i = 0; i < 4; i++) {
        x += (Math.random() - 0.5) * 26;
        y += 34;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(h.x, h.y);
      ctx.stroke();
      ctx.fillStyle = `rgba(255, 225, 77, ${0.25 * flicker})`;
      circle(ctx, h.x, h.y, h.r);
      ctx.fill();
      break;
    }
    case 'firePatch': {
      const f = 0.8 + Math.sin(game.time * 9 + h.x) * 0.2;
      ctx.fillStyle = `rgba(255, 122, 26, ${0.5 * f})`;
      circle(ctx, h.x, h.y, h.r);
      ctx.fill();
      ctx.fillStyle = `rgba(255, 200, 60, ${0.55 * f})`;
      circle(ctx, h.x, h.y, h.r * 0.55);
      ctx.fill();
      break;
    }
    case 'lavaWarn': {
      const k = 0.5 + Math.sin(h.t * 20) * 0.5;
      ctx.strokeStyle = `rgba(255, 87, 34, ${0.5 + k * 0.5})`;
      ctx.lineWidth = 3;
      circle(ctx, h.x, h.y, h.r);
      ctx.stroke();
      ctx.fillStyle = `rgba(255, 87, 34, ${0.12 + k * 0.15})`;
      circle(ctx, h.x, h.y, h.r);
      ctx.fill();
      break;
    }
    case 'lavaPool': {
      ctx.fillStyle = 'rgba(160, 30, 10, 0.85)';
      circle(ctx, h.x, h.y, h.r);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 110, 30, 0.8)';
      circle(ctx, h.x - h.r * 0.3, h.y - h.r * 0.2, h.r * 0.3);
      ctx.fill();
      circle(ctx, h.x + h.r * 0.3, h.y + h.r * 0.25, h.r * 0.22);
      ctx.fill();
      break;
    }
    case 'poisonCloud': {
      ctx.fillStyle = 'rgba(125, 219, 58, 0.28)';
      circle(ctx, h.x, h.y, h.r);
      ctx.fill();
      ctx.fillStyle = 'rgba(125, 219, 58, 0.35)';
      circle(ctx, h.x - 14, h.y - 8, h.r * 0.5);
      ctx.fill();
      circle(ctx, h.x + 16, h.y + 10, h.r * 0.45);
      ctx.fill();
      break;
    }
    case 'vinePatch': {
      ctx.fillStyle = 'rgba(63, 174, 90, 0.25)';
      circle(ctx, h.x, h.y, h.r);
      ctx.fill();
      ctx.strokeStyle = 'rgba(63, 174, 90, 0.9)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + h.x;
        ctx.beginPath();
        ctx.moveTo(h.x, h.y);
        ctx.quadraticCurveTo(h.x + Math.cos(a) * h.r * 0.5, h.y + Math.sin(a) * h.r * 0.5 + 8, h.x + Math.cos(a) * h.r, h.y + Math.sin(a) * h.r);
        ctx.stroke();
      }
      break;
    }
    case 'tornado': {
      const spin = game.time * 9;
      for (let i = 0; i < 3; i++) {
        ctx.strokeStyle = `rgba(207, 216, 220, ${0.85 - i * 0.22})`;
        ctx.lineWidth = 5 - i;
        ctx.beginPath();
        ctx.arc(h.x, h.y, h.r - i * 11, spin + i, spin + i + Math.PI * 1.4);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(120, 130, 140, 0.5)';
      circle(ctx, h.x, h.y, 12);
      ctx.fill();
      break;
    }
    case 'zombie': {
      const wob = Math.sin(h.wob) * 3;
      ctx.fillStyle = '#6a9e4f';
      circle(ctx, h.x + wob, h.y, 15);
      ctx.fill();
      ctx.strokeStyle = '#3d5c2e';
      ctx.lineWidth = 2;
      circle(ctx, h.x + wob, h.y, 15);
      ctx.stroke();
      ctx.fillStyle = '#ff4444';
      circle(ctx, h.x + wob - 5, h.y - 3, 2.5);
      ctx.fill();
      circle(ctx, h.x + wob + 5, h.y - 3, 2.5);
      ctx.fill();
      break;
    }
    case 'bees': {
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2 + game.time * 6;
        const bx = h.x + Math.cos(a) * 16;
        const by = h.y + Math.sin(a) * 12;
        ctx.fillStyle = i % 2 ? '#1a1a1a' : '#ffcf3f';
        circle(ctx, bx, by, 3.4);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(255, 207, 63, 0.18)';
      circle(ctx, h.x, h.y, 26);
      ctx.fill();
      break;
    }
    case 'bomb': {
      const k = h.t / h.dur;
      const pulse = 1 + Math.sin(h.t * (6 + k * 18)) * 0.12;
      ctx.fillStyle = 'rgba(255, 68, 68, 0.10)';
      circle(ctx, h.x, h.y, 112);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 68, 68, 0.5)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 6]);
      circle(ctx, h.x, h.y, 112);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#1a1a1a';
      circle(ctx, h.x, h.y, 15 * pulse);
      ctx.fill();
      ctx.strokeStyle = '#888';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(h.x, h.y - 14); ctx.lineTo(h.x + 6, h.y - 22); ctx.stroke();
      ctx.fillStyle = '#ffd94d';
      circle(ctx, h.x + 6, h.y - 22, 3 + Math.sin(h.t * 30) * 1.5);
      ctx.fill();
      break;
    }
    case 'crack': {
      ctx.strokeStyle = 'rgba(60, 40, 25, 0.8)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      let x = h.x - h.r;
      let y = h.y;
      ctx.moveTo(x, y);
      for (let i = 1; i <= 5; i++) {
        x = h.x - h.r + (i / 5) * h.r * 2;
        y = h.y + Math.sin(h.seed + i * 2.1) * 12;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
      break;
    }
    default:
      break;
  }
}

function drawPlayer(ctx, p, game) {
  const floaty = game.effects.gravity > 0;
  const bob = floaty ? Math.sin(game.time * 6 + p.id * 1.7) * 4 : 0;
  const y = p.y + bob;
  // Soft shadow.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.beginPath();
  ctx.ellipse(p.x, p.y + PLAYER_RADIUS - 2, PLAYER_RADIUS * 0.9, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  // Dash streak.
  if (p.dashT > 0) {
    ctx.strokeStyle = p.color;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(p.x - p.dashDx * 26, y - p.dashDy * 26);
    ctx.lineTo(p.x, y);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // Body.
  ctx.fillStyle = p.color;
  circle(ctx, p.x, y, PLAYER_RADIUS);
  ctx.fill();
  ctx.strokeStyle = p.isHuman ? '#ffffff' : 'rgba(0, 0, 0, 0.55)';
  ctx.lineWidth = p.isHuman ? 2.5 : 2;
  circle(ctx, p.x, y, PLAYER_RADIUS);
  ctx.stroke();
  // Facing dot.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  circle(ctx, p.x + p.faceX * 6, y + p.faceY * 6, 3.5);
  ctx.fill();
  // Hit flash.
  if (p.flashT > 0) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    circle(ctx, p.x, y, PLAYER_RADIUS);
    ctx.fill();
  }
  // Shield bubble.
  if (p.shielded) {
    ctx.strokeStyle = 'rgba(255, 217, 77, 0.9)';
    ctx.lineWidth = 2;
    circle(ctx, p.x, y, PLAYER_RADIUS + 7);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255, 217, 77, 0.12)';
    circle(ctx, p.x, y, PLAYER_RADIUS + 7);
    ctx.fill();
  }
  // Roots.
  if (p.rooted) {
    ctx.strokeStyle = '#3fae5a';
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      ctx.beginPath();
      ctx.moveTo(p.x + Math.cos(a) * 16, p.y + Math.sin(a) * 16);
      ctx.lineTo(p.x + Math.cos(a) * 8, p.y + Math.sin(a) * 8);
      ctx.stroke();
    }
  }
  // Name tag + HP bar.
  ctx.textAlign = 'center';
  ctx.font = `bold ${p.isHuman ? 12 : 11}px system-ui, sans-serif`;
  ctx.fillStyle = p.isHuman ? '#7df3ff' : 'rgba(255, 255, 255, 0.85)';
  ctx.fillText(p.name, p.x, y - PLAYER_RADIUS - 12);
  const bw = 30;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.fillRect(p.x - bw / 2, y - PLAYER_RADIUS - 9, bw, 4);
  ctx.fillStyle = p.hp > 50 ? '#4ade80' : p.hp > 25 ? '#facc15' : '#f87171';
  ctx.fillRect(p.x - bw / 2, y - PLAYER_RADIUS - 9, bw * Math.max(0, p.hp / 100), 4);
}
