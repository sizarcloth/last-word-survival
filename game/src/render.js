// LAST WORD — rendering. Everything on the canvas: the dressed arena
// (pre-rendered ground with tiles, props and a stone wall), the shrinking
// zone, flood water, every hazard with its own look, players drawn as
// little top-down characters with robes, hair, eyes and accessories,
// impact decals, particles, floating damage text, and the night / rain /
// wind / ice overlays. The HUD chrome is DOM (ui.js).

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

// --- Small helpers ---------------------------------------------------------

function shade(hex, f) {
  // Darken (f < 1) or lighten (f > 1) a #rrggbb colour.
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.max(0, Math.round(((n >> 16) & 255) * f)));
  const g = Math.min(255, Math.max(0, Math.round(((n >> 8) & 255) * f)));
  const b = Math.min(255, Math.max(0, Math.round((n & 255) * f)));
  return `rgb(${r},${g},${b})`;
}

function rng01(seed) {
  // Tiny deterministic generator for the arena dressing: the same arena
  // in every match, so screenshots stay comparable.
  let s = (seed >>> 0) || 1;
  return function () {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// --- Character identity ----------------------------------------------------
// Every player gets a stable look from their id: skin, hair, hairstyle,
// accessory and accent colour. Colour + accessory + hair makes all twenty
// distinct at a glance.

const SKIN_TONES = ['#f2c89b', '#e8b07e', '#c98d5e', '#8d5a3b', '#f7d7b0', '#a06a42'];
const HAIR_COLORS = ['#2b2118', '#5b3a1a', '#8a5a2b', '#b5533c', '#d9d9d9', '#3a3a4d', '#1f6f4a', '#6d2d7a'];
const HAIR_STYLES = ['mop', 'hood', 'spiky', 'mop', 'bald', 'hood', 'spiky', 'mop'];
const ACCESSORIES = ['hat', 'band', 'scarf', 'glasses', 'pack', 'staff', 'crown', 'flower'];
const ACCENT_COLORS = ['#ffd94d', '#ff6b6b', '#7df3ff', '#c084fc', '#4ade80', '#fb923c', '#f472b6', '#a3e635'];

function lookFor(p) {
  const id = p.id;
  return {
    robe: p.color,
    skin: SKIN_TONES[id % SKIN_TONES.length],
    hair: HAIR_COLORS[(id * 3 + 1) % HAIR_COLORS.length],
    style: HAIR_STYLES[(id * 5) % HAIR_STYLES.length],
    acc: ACCESSORIES[(id * 3 + 5) % ACCESSORIES.length],
    accent: ACCENT_COLORS[(id * 7 + 3) % ACCENT_COLORS.length],
  };
}

export function drawGame(ctx, game) {
  const W = game.canvasW;
  const H = game.canvasH;
  const a = game.arena;
  ctx.save();
  if (game.shakeMag > 0.2) {
    ctx.translate((Math.random() - 0.5) * game.shakeMag, (Math.random() - 0.5) * game.shakeMag);
  }

  // Arena floor: pre-rendered ground (tiles, speckle, props, stone wall).
  ctx.drawImage(groundFor(game), 0, 0);
  // Impact decals (craters, scorch marks) fade on the ground.
  drawDecals(ctx, game);

  // Zone: everything outside the circle burns.
  ctx.save();
  ctx.beginPath();
  ctx.rect(a.x, a.y, a.w, a.h);
  ctx.arc(game.zone.cx, game.zone.cy, game.zone.r, 0, Math.PI * 2, true);
  ctx.fillStyle = 'rgba(255, 60, 60, 0.13)';
  ctx.fill('evenodd');
  ctx.restore();
  // Zone edge: a pulsing glow plus a rotating dashed ring inside it.
  const pulse = 0.75 + Math.sin(game.time * 3) * 0.25;
  ctx.strokeStyle = `rgba(255, 90, 90, ${0.14 * pulse})`;
  ctx.lineWidth = 14;
  circle(ctx, game.zone.cx, game.zone.cy, game.zone.r);
  ctx.stroke();
  ctx.strokeStyle = `rgba(255, 90, 90, ${0.35 * pulse})`;
  ctx.lineWidth = 6;
  circle(ctx, game.zone.cx, game.zone.cy, game.zone.r);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255, 120, 120, 0.95)';
  ctx.lineWidth = 2.5;
  circle(ctx, game.zone.cx, game.zone.cy, game.zone.r);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255, 150, 150, 0.5)';
  ctx.lineWidth = 2;
  ctx.setLineDash([16, 24]);
  ctx.lineDashOffset = -game.time * 34;
  circle(ctx, game.zone.cx, game.zone.cy, game.zone.r - 2);
  ctx.stroke();
  ctx.setLineDash([]);

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
    // Shimmer: bright arcs drifting along the waterline.
    ctx.strokeStyle = 'rgba(185, 226, 255, 0.75)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 10; i++) {
      const a0 = (i / 10) * Math.PI * 2 + game.time * 0.22;
      ctx.beginPath();
      ctx.arc(game.zone.cx, game.zone.cy, waterR, a0, a0 + 0.28);
      ctx.stroke();
    }
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

  // Lightning flash: a brief white wash while a bolt is live.
  let flash = 0;
  for (const h of game.hazards) {
    if (h.kind === 'bolt' && h.t >= 0) flash = Math.max(flash, (1 - h.t / h.dur) * 0.14);
  }
  if (flash > 0.005) {
    ctx.fillStyle = `rgba(255, 244, 190, ${flash})`;
    ctx.fillRect(a.x, a.y, a.w, a.h);
  }

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
      // The rock, falling in from above, with a fiery trail.
      const ry = h.y - 120 + k * 110;
      for (let i = 1; i <= 3; i++) {
        ctx.fillStyle = `rgba(255, ${150 - i * 28}, 40, ${0.5 - i * 0.12})`;
        circle(ctx, h.x, ry - i * 15, 9 - i * 2);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(255, 140, 40, 0.25)';
      circle(ctx, h.x, ry, 18);
      ctx.fill();
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
      // Flickering flame tongues.
      for (let i = 0; i < 3; i++) {
        const fx = h.x + Math.sin(h.x * 3.1 + i * 2.4) * h.r * 0.45;
        const fh = Math.max(3, (5 + Math.sin(game.time * 13 + i * 2.1 + h.y) * 2.5) * f);
        ctx.fillStyle = `rgba(255, 205, 60, ${0.75 * f})`;
        ctx.beginPath();
        ctx.ellipse(fx, h.y - h.r * 0.15, 4.5, fh, 0, 0, Math.PI * 2);
        ctx.fill();
      }
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
      // Dust ring at the base.
      ctx.fillStyle = 'rgba(150, 150, 150, 0.25)';
      ctx.beginPath();
      ctx.ellipse(h.x, h.y + 6, h.r, h.r * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
      // Funnel: stacked arcs narrowing upward, spinning.
      for (let i = 0; i < 5; i++) {
        const fy = h.y - i * 11;
        const fr = Math.max(4, h.r - i * 7);
        ctx.strokeStyle = `rgba(215, 224, 230, ${0.9 - i * 0.15})`;
        ctx.lineWidth = 6 - i * 0.8;
        ctx.beginPath();
        ctx.arc(h.x, fy, fr, spin + i * 1.3, spin + i * 1.3 + Math.PI * 1.3);
        ctx.stroke();
      }
      // Debris bits orbiting the column.
      for (let i = 0; i < 5; i++) {
        const ang = game.time * (3 + i * 0.7) + i * 1.9;
        const dr = 16 + i * 7;
        const dx = h.x + Math.cos(ang) * dr;
        const dy = h.y - 8 - i * 7 + Math.sin(ang) * 5;
        ctx.fillStyle = i % 2 ? '#8a7a5a' : '#5a5a5a';
        circle(ctx, dx, dy, 2.5 + (i % 2));
        ctx.fill();
      }
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

// --- Arena ground (pre-rendered once) --------------------------------------
// Tiles, speckle, decorative props and the stone wall are drawn a single
// time to an offscreen canvas; each frame just blits it. Props never block
// movement — they are paint on the floor.

let groundCache = null;

function buildGround(game) {
  const cv = document.createElement('canvas');
  cv.width = game.canvasW;
  cv.height = game.canvasH;
  const g = cv.getContext('2d');
  const a = game.arena;
  const rnd = rng01(20261117);
  const spot = (margin) => ({
    x: a.x + margin + rnd() * (a.w - margin * 2),
    y: a.y + margin + rnd() * (a.h - margin * 2),
  });

  g.fillStyle = '#0d1117';
  g.fillRect(0, 0, game.canvasW, game.canvasH);
  g.fillStyle = '#121826';
  g.fillRect(a.x, a.y, a.w, a.h);

  // Two-tone tiles.
  g.fillStyle = '#141b2c';
  for (let ty = 0; ty * 48 < a.h; ty++) {
    for (let tx = 0; tx * 48 < a.w; tx++) {
      if ((tx + ty) % 2 === 0) g.fillRect(a.x + tx * 48, a.y + ty * 48, 48, 48);
    }
  }
  // Speckle.
  for (let i = 0; i < 900; i++) {
    g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.18)';
    circle(g, a.x + rnd() * a.w, a.y + rnd() * a.h, 1 + rnd() * 1.4);
    g.fill();
  }
  // Subtle grid.
  g.strokeStyle = 'rgba(120, 150, 255, 0.06)';
  g.lineWidth = 1;
  for (let x = a.x; x <= a.x + a.w; x += 48) {
    g.beginPath(); g.moveTo(x, a.y); g.lineTo(x, a.y + a.h); g.stroke();
  }
  for (let y = a.y; y <= a.y + a.h; y += 48) {
    g.beginPath(); g.moveTo(a.x, y); g.lineTo(a.x + a.w, y); g.stroke();
  }

  // Rocks.
  for (let i = 0; i < 14; i++) {
    const s = spot(30);
    const rx = 8 + rnd() * 8;
    const ry = 5 + rnd() * 5;
    g.fillStyle = '#39415a';
    g.beginPath(); g.ellipse(s.x, s.y, rx, ry, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#4a5578';
    g.beginPath(); g.ellipse(s.x - rx * 0.25, s.y - ry * 0.3, rx * 0.5, ry * 0.45, 0, 0, Math.PI * 2); g.fill();
  }
  // Bushes.
  for (let i = 0; i < 12; i++) {
    const s = spot(30);
    for (let j = 0; j < 3; j++) {
      g.fillStyle = j === 1 ? '#2b6b3f' : '#1f4d2e';
      circle(g, s.x + (rnd() - 0.5) * 14, s.y + (rnd() - 0.5) * 8, 6 + rnd() * 5);
      g.fill();
    }
    g.fillStyle = '#3d8a52';
    circle(g, s.x - 3, s.y - 3, 2.5);
    g.fill();
  }
  // Mushrooms.
  for (let i = 0; i < 8; i++) {
    const s = spot(30);
    g.fillStyle = '#e8ddc8';
    g.fillRect(s.x - 2, s.y, 4, 6);
    g.fillStyle = '#c0392b';
    g.beginPath(); g.arc(s.x, s.y + 1, 6 + rnd() * 3, Math.PI, Math.PI * 2); g.closePath(); g.fill();
    g.fillStyle = '#f5f0e1';
    circle(g, s.x - 2.5, s.y - 3, 1.2); g.fill();
    circle(g, s.x + 2.5, s.y - 4, 1); g.fill();
  }
  // Flowers.
  const petals = ['#f472b6', '#facc15', '#f8fafc', '#c084fc'];
  for (let i = 0; i < 10; i++) {
    const s = spot(30);
    g.strokeStyle = '#2b6b3f';
    g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(s.x, s.y + 5); g.lineTo(s.x, s.y - 2); g.stroke();
    g.fillStyle = petals[i % petals.length];
    for (let j = 0; j < 5; j++) {
      const ang = (j / 5) * Math.PI * 2;
      circle(g, s.x + Math.cos(ang) * 3, s.y - 3 + Math.sin(ang) * 3, 2);
      g.fill();
    }
    g.fillStyle = '#ffd94d';
    circle(g, s.x, s.y - 3, 1.6);
    g.fill();
  }
  // Puddles.
  for (let i = 0; i < 6; i++) {
    const s = spot(40);
    g.fillStyle = 'rgba(56, 120, 180, 0.30)';
    g.beginPath(); g.ellipse(s.x, s.y, 14 + rnd() * 10, 6 + rnd() * 4, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(190, 225, 255, 0.35)';
    g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(s.x - 8, s.y - 1); g.lineTo(s.x + 2, s.y - 1); g.stroke();
  }
  // Cracked stones.
  for (let i = 0; i < 10; i++) {
    const s = spot(30);
    g.fillStyle = '#2c3448';
    g.beginPath(); g.ellipse(s.x, s.y, 10 + rnd() * 8, 7 + rnd() * 4, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(0, 0, 0, 0.5)';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(s.x - 8, s.y - 2);
    g.lineTo(s.x - 2, s.y + 1);
    g.lineTo(s.x + 4, s.y - 2);
    g.lineTo(s.x + 9, s.y + 1);
    g.stroke();
  }
  // Ruined pillars near the four corners.
  const pillarSpots = [
    [a.x + 44, a.y + 44], [a.x + a.w - 44, a.y + 44],
    [a.x + 44, a.y + a.h - 44], [a.x + a.w - 44, a.y + a.h - 44],
  ];
  for (const [px, py] of pillarSpots) {
    g.fillStyle = 'rgba(0, 0, 0, 0.3)';
    g.beginPath(); g.ellipse(px + 3, py + 14, 14, 5, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#4a5568';
    g.fillRect(px - 9, py - 14, 18, 28);
    g.fillStyle = '#5b6a86';
    g.fillRect(px - 11, py - 18, 22, 6);
    g.fillStyle = '#39415a';
    g.fillRect(px - 11, py + 10, 22, 4);
    g.strokeStyle = 'rgba(0, 0, 0, 0.4)';
    g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(px - 4, py - 10); g.lineTo(px + 1, py - 2); g.lineTo(px - 3, py + 6); g.stroke();
  }

  // Vignette: darker toward the edges.
  const vg = g.createRadialGradient(
    a.x + a.w / 2, a.y + a.h / 2, Math.min(a.w, a.h) * 0.35,
    a.x + a.w / 2, a.y + a.h / 2, Math.max(a.w, a.h) * 0.72,
  );
  vg.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vg.addColorStop(1, 'rgba(0, 0, 0, 0.28)');
  g.fillStyle = vg;
  g.fillRect(a.x, a.y, a.w, a.h);

  // Stone wall around the arena.
  g.strokeStyle = '#232b40';
  g.lineWidth = 12;
  g.strokeRect(a.x - 2, a.y - 2, a.w + 4, a.h + 4);
  g.strokeStyle = '#4a5878';
  g.lineWidth = 5;
  g.strokeRect(a.x - 2, a.y - 2, a.w + 4, a.h + 4);
  g.fillStyle = '#5d6d94';
  for (let x = a.x + 14; x < a.x + a.w - 8; x += 34) {
    g.fillRect(x, a.y - 7, 16, 4);
    g.fillRect(x, a.y + a.h + 3, 16, 4);
  }
  for (let y = a.y + 14; y < a.y + a.h - 8; y += 34) {
    g.fillRect(a.x - 7, y, 4, 16);
    g.fillRect(a.x + a.w + 3, y, 4, 16);
  }
  return cv;
}

function groundFor(game) {
  if (!groundCache) groundCache = buildGround(game);
  return groundCache;
}

// --- Impact decals ---------------------------------------------------------
// Craters and scorch marks left on the ground by meteors and lightning.
// Purely visual: hazards.js pushes them, updateHazards prunes them.

function drawDecals(ctx, game) {
  if (!game.decals) return;
  for (const d of game.decals) {
    const age = (game.time - d.born) / d.dur;
    if (age >= 1) continue;
    const alpha = 1 - age;
    if (d.kind === 'crater') {
      ctx.fillStyle = `rgba(38, 24, 16, ${0.6 * alpha})`;
      ctx.beginPath();
      ctx.ellipse(d.x, d.y, d.r * 0.9, d.r * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(20, 12, 8, ${0.55 * alpha})`;
      ctx.beginPath();
      ctx.ellipse(d.x, d.y, d.r * 0.5, d.r * 0.38, 0, 0, Math.PI * 2);
      ctx.fill();
      // Still-hot embers right after the impact.
      ctx.fillStyle = `rgba(255, 122, 26, ${0.35 * Math.max(0, 1 - age * 3)})`;
      ctx.beginPath();
      ctx.ellipse(d.x, d.y, d.r * 0.3, d.r * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Scorch: a dark starburst where lightning struck.
      ctx.fillStyle = `rgba(10, 10, 12, ${0.65 * alpha})`;
      circle(ctx, d.x, d.y, d.r * 0.55);
      ctx.fill();
      ctx.strokeStyle = `rgba(10, 10, 12, ${0.5 * alpha})`;
      ctx.lineWidth = 2.5;
      for (let i = 0; i < 6; i++) {
        const ang = (i / 6) * Math.PI * 2 + d.x;
        ctx.beginPath();
        ctx.moveTo(d.x + Math.cos(ang) * d.r * 0.3, d.y + Math.sin(ang) * d.r * 0.3);
        ctx.lineTo(d.x + Math.cos(ang) * d.r, d.y + Math.sin(ang) * d.r);
        ctx.stroke();
      }
    }
  }
}

// --- Character drawing -----------------------------------------------------
// A top-down little mage: robe with belt and buckle, a skin-tone head
// leaning toward the facing direction, hair or hood, eyes that look where
// the player faces, and one accessory per player.

function drawBody(ctx, look, x, y, R, fx, fy) {
  // Backpack rides behind the body.
  if (look.acc === 'pack') {
    const bx = x - fx * (R + 2);
    const by = y - fy * (R + 2);
    ctx.fillStyle = '#8a6d3b';
    ctx.fillRect(bx - 5, by - 6, 10, 12);
    ctx.fillStyle = '#6d5326';
    ctx.fillRect(bx - 5, by - 1, 10, 3);
  }
  // Robe.
  ctx.fillStyle = look.robe;
  circle(ctx, x, y, R);
  ctx.fill();
  // Shading on the lower half.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
  ctx.beginPath();
  ctx.arc(x, y, R, 0, Math.PI);
  ctx.closePath();
  ctx.fill();
  // Belt with a gold buckle.
  ctx.fillStyle = shade(look.robe, 0.55);
  ctx.beginPath();
  ctx.ellipse(x, y + 3, R * 0.92, 3.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffd94d';
  ctx.fillRect(x - 2, y + 1.4, 4, 3.2);
  // Chest highlight.
  ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
  ctx.beginPath();
  ctx.ellipse(x - R * 0.3, y - R * 0.42, R * 0.42, R * 0.26, -0.5, 0, Math.PI * 2);
  ctx.fill();
  // Staff points where the player faces, with a glowing tip.
  if (look.acc === 'staff') {
    const sx = x + fx * (R - 2);
    const sy = y + fy * (R - 2);
    const tx = x + fx * (R + 10);
    const ty = y + fy * (R + 10);
    ctx.strokeStyle = '#8a6d3b';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(tx, ty);
    ctx.stroke();
    ctx.fillStyle = look.accent;
    ctx.globalAlpha = 0.35;
    circle(ctx, tx, ty, 5);
    ctx.fill();
    ctx.globalAlpha = 1;
    circle(ctx, tx, ty, 2.6);
    ctx.fill();
  }
}

function drawHead(ctx, look, hx, hy, hr, fx, fy) {
  // Hair or hood behind the face.
  if (look.style === 'hood') {
    ctx.fillStyle = shade(look.robe, 0.45);
    circle(ctx, hx, hy - 1, hr + 3.5);
    ctx.fill();
  } else if (look.style === 'spiky') {
    ctx.fillStyle = look.hair;
    for (let i = -1; i <= 1; i++) {
      poly(ctx, [
        [hx + i * 5 - 2.5, hy - hr + 3],
        [hx + i * 5 + 2.5, hy - hr + 3],
        [hx + i * 5 + fx * 2, hy - hr - 5],
      ]);
      ctx.fill();
    }
  }
  // Face.
  ctx.fillStyle = look.skin;
  circle(ctx, hx, hy, hr);
  ctx.fill();
  if (look.style === 'mop') {
    // Hair cap over the top of the head, with fringe tufts.
    ctx.fillStyle = look.hair;
    ctx.beginPath();
    ctx.arc(hx, hy, hr, Math.PI, Math.PI * 2);
    ctx.closePath();
    ctx.fill();
    circle(ctx, hx - hr * 0.45, hy - hr * 0.55, 2.2);
    ctx.fill();
    circle(ctx, hx + hr * 0.3, hy - hr * 0.7, 2);
    ctx.fill();
  }
  // Eyes look toward the facing direction.
  const px = -fy;
  const py = fx;
  ctx.fillStyle = '#191919';
  circle(ctx, hx + fx * 2.6 + px * 3.1, hy + fy * 2.6 + py * 3.1, 1.7);
  ctx.fill();
  circle(ctx, hx + fx * 2.6 - px * 3.1, hy + fy * 2.6 - py * 3.1, 1.7);
  ctx.fill();
  // Head-worn accessories (a hood hides hats, bands, crowns and flowers).
  const hooded = look.style === 'hood';
  if (look.acc === 'hat' && !hooded) {
    ctx.fillStyle = look.accent;
    poly(ctx, [
      [hx - 7.5, hy - hr + 2],
      [hx + 7.5, hy - hr + 2],
      [hx + 2 + fx * 3, hy - hr - 12],
    ]);
    ctx.fill();
    ctx.fillStyle = shade(look.accent, 0.8);
    ctx.beginPath();
    ctx.ellipse(hx, hy - hr + 2, 8.5, 3, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (look.acc === 'band' && !hooded) {
    ctx.strokeStyle = look.accent;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(hx, hy, hr - 0.5, Math.PI * 1.12, Math.PI * 1.88);
    ctx.stroke();
  } else if (look.acc === 'crown' && !hooded) {
    ctx.fillStyle = '#ffd94d';
    for (let i = -1; i <= 1; i++) {
      poly(ctx, [
        [hx + i * 4.5 - 2, hy - hr + 1],
        [hx + i * 4.5 + 2, hy - hr + 1],
        [hx + i * 4.5, hy - hr - 4.5],
      ]);
      ctx.fill();
    }
  } else if (look.acc === 'flower' && !hooded) {
    const fx0 = hx + hr * 0.62;
    const fy0 = hy - hr * 0.5;
    ctx.fillStyle = look.accent;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      circle(ctx, fx0 + Math.cos(a) * 2.4, fy0 + Math.sin(a) * 2.4, 1.8);
      ctx.fill();
    }
    ctx.fillStyle = '#fff7cc';
    circle(ctx, fx0, fy0, 1.6);
    ctx.fill();
  } else if (look.acc === 'glasses') {
    ctx.strokeStyle = '#1d1d1d';
    ctx.lineWidth = 1.3;
    circle(ctx, hx + fx * 2.6 + px * 3.1, hy + fy * 2.6 + py * 3.1, 2.8);
    ctx.stroke();
    circle(ctx, hx + fx * 2.6 - px * 3.1, hy + fy * 2.6 - py * 3.1, 2.8);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(hx + fx * 2.6 - px * 0.4, hy + fy * 2.6 - py * 0.4);
    ctx.lineTo(hx + fx * 2.6 + px * 0.4, hy + fy * 2.6 + py * 0.4);
    ctx.stroke();
  }
  if (look.acc === 'scarf') {
    // A wrapped scarf under the chin, tail fluttering behind.
    ctx.fillStyle = look.accent;
    ctx.beginPath();
    ctx.ellipse(hx, hy + hr - 1, hr * 0.95, 3.6, 0, 0, Math.PI * 2);
    ctx.fill();
    poly(ctx, [
      [hx - fx * 4, hy + hr + 1],
      [hx - fx * 9 - py * 3, hy + hr + 6],
      [hx - fx * 9 + py * 3, hy + hr + 6],
    ]);
    ctx.fill();
  }
}

// Start-screen cast row: head-and-shoulders portraits of the first ten
// players, each in its own chip with the name underneath.
export function drawCastRow(canvas, players) {
  const ctx = canvas.getContext('2d');
  const shown = players.slice(0, 10);
  const cell = canvas.width / 10;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  shown.forEach((p, i) => {
    const cx = cell * i + cell / 2;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.fillRect(cell * i + 3, 2, cell - 6, canvas.height - 4);
    ctx.strokeStyle = p.isHuman ? 'rgba(255, 217, 77, 0.6)' : 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1;
    ctx.strokeRect(cell * i + 3.5, 2.5, cell - 7, canvas.height - 5);
    const look = lookFor(p);
    drawBody(ctx, look, cx, 30, 12, 0, 1);
    drawHead(ctx, look, cx, 27, 7, 0, 1);
    ctx.textAlign = 'center';
    ctx.font = 'bold 9px system-ui, sans-serif';
    ctx.fillStyle = p.isHuman ? '#7df3ff' : 'rgba(255, 255, 255, 0.8)';
    ctx.fillText(p.name, cx, canvas.height - 5);
  });
}

function drawPlayer(ctx, p, game) {
  const R = PLAYER_RADIUS + 1;
  const speed = Math.hypot(p.vx, p.vy);
  const floaty = game.effects.gravity > 0;
  const floatBob = floaty ? Math.sin(game.time * 6 + p.id * 1.7) * 4 : 0;
  const walkBob = speed > 25 ? Math.sin(game.time * 13 + p.id * 1.9) * Math.min(1.6, speed / 110) : 0;
  const y = p.y + floatBob + walkBob;
  const look = lookFor(p);
  // Soft shadow (stays on the ground, does not bob).
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.beginPath();
  ctx.ellipse(p.x, p.y + PLAYER_RADIUS - 2, R * 0.95, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  // Gold ring marks the human.
  if (p.isHuman) {
    ctx.strokeStyle = 'rgba(255, 217, 77, 0.85)';
    ctx.lineWidth = 2;
    circle(ctx, p.x, p.y, R + 4.5);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255, 217, 77, 0.07)';
    circle(ctx, p.x, p.y, R + 4.5);
    ctx.fill();
  }
  // Dash ghosts: fading afterimages along the dash.
  if (p.dashT > 0) {
    for (let i = 1; i <= 2; i++) {
      ctx.globalAlpha = 0.22 / i;
      ctx.fillStyle = p.color;
      circle(ctx, p.x - p.dashDx * i * 15, y - p.dashDy * i * 15, R * 0.85);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  drawBody(ctx, look, p.x, y, R, p.faceX, p.faceY);
  // Outline: white for the human, dark for bots.
  ctx.strokeStyle = p.isHuman ? '#ffffff' : 'rgba(0, 0, 0, 0.55)';
  ctx.lineWidth = p.isHuman ? 2.5 : 2;
  circle(ctx, p.x, y, R);
  ctx.stroke();
  // Head leans toward the facing direction.
  const hx = p.x + p.faceX * 3;
  const hy = y - 3 + p.faceY * 3;
  drawHead(ctx, look, hx, hy, 7.5, p.faceX, p.faceY);
  // Hit flash.
  if (p.flashT > 0) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    circle(ctx, p.x, y, R);
    ctx.fill();
  }
  // Shield bubble.
  if (p.shielded) {
    ctx.strokeStyle = 'rgba(255, 217, 77, 0.9)';
    ctx.lineWidth = 2;
    circle(ctx, p.x, y, R + 7);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255, 217, 77, 0.12)';
    circle(ctx, p.x, y, R + 7);
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
  // Name tag + HP bar (raised: hats and staffs stick up).
  ctx.textAlign = 'center';
  ctx.font = `bold ${p.isHuman ? 12 : 11}px system-ui, sans-serif`;
  ctx.fillStyle = p.isHuman ? '#7df3ff' : 'rgba(255, 255, 255, 0.85)';
  ctx.fillText(p.name, p.x, y - R - 18);
  const bw = 30;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.fillRect(p.x - bw / 2, y - R - 15, bw, 4);
  ctx.fillStyle = p.hp > 50 ? '#4ade80' : p.hp > 25 ? '#facc15' : '#f87171';
  ctx.fillRect(p.x - bw / 2, y - R - 15, bw * Math.max(0, p.hp / 100), 4);
}
