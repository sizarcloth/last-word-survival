// LAST WORD — 3D rendering (three.js). A Roblox-style blocky world: box
// characters with faces and accessories, a follow camera, a minimap, and
// every hazard rebuilt in 3D. The engine stays 2D — arena (x, y) maps to
// world (x, 0, y) at scale S. The HUD chrome is DOM (ui.js); name tags,
// damage floaters and the minimap are DOM/2D overlays on top of WebGL.
//
// Juice (from Roblox research: Type or Die, Super Bomb Survival, the
// game-feel cheatsheet): eliminations burst the loser into flying blocks
// with an announcement toast; big hazards shake the camera; dashes leave
// ghost afterimages; casts pop the caster and flash the word in the sky;
// the Wordsmith gets a golden spotlight beam; the winner celebrates with
// a spin emote and confetti while the camera orbits them.

import * as THREE from 'three';
import { PLAYER_RADIUS } from './players.js';

// The 2D arena is 1248 x 624 units centred on (640, 392). At scale S the
// world is 62.4 x 31.2 units and a player is ~2.8 units tall.
const S = 0.05;
const CX = 640;
const CY = 392;
const wx = (x) => (x - CX) * S;
const wz = (y) => (y - CY) * S;

function rng01(seed) {
  let s = (seed >>> 0) || 1;
  return function () {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function lerpAngle(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

// --- Character identity ----------------------------------------------------
// Same stable look per player id as the 2D version: skin, hair, hairstyle,
// accessory and accent colour. Colour + accessory + hair keeps all twenty
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

// --- Canvas textures -------------------------------------------------------

let faceTexture = null;
function getFaceTexture() {
  // One shared face: two eyes and a smile on a transparent tile, pasted
  // on a plane in front of every head.
  if (faceTexture) return faceTexture;
  const cv = document.createElement('canvas');
  cv.width = 64;
  cv.height = 56;
  const g = cv.getContext('2d');
  g.clearRect(0, 0, 64, 56);
  g.fillStyle = '#1a1a1a';
  g.beginPath(); g.arc(20, 22, 5.5, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(44, 22, 5.5, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#ffffff';
  g.beginPath(); g.arc(22, 20, 1.8, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(46, 20, 1.8, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#1a1a1a';
  g.lineWidth = 4;
  g.lineCap = 'round';
  g.beginPath(); g.arc(32, 32, 13, Math.PI * 0.15, Math.PI * 0.85); g.stroke();
  faceTexture = new THREE.CanvasTexture(cv);
  faceTexture.colorSpace = THREE.SRGBColorSpace;
  return faceTexture;
}

function makeGroundTexture() {
  // Checker grass with speckle and a faint grid, tiled over the arena.
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 256;
  const g = cv.getContext('2d');
  const rnd = rng01(4242);
  g.fillStyle = '#3e7a38';
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#387031';
  for (let ty = 0; ty < 4; ty++) {
    for (let tx = 0; tx < 4; tx++) {
      if ((tx + ty) % 2 === 0) g.fillRect(tx * 64, ty * 64, 64, 64);
    }
  }
  for (let i = 0; i < 500; i++) {
    g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.10)';
    g.fillRect(rnd() * 256, rnd() * 256, 2 + rnd() * 2, 2 + rnd() * 2);
  }
  g.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  g.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, 256); g.stroke();
    g.beginPath(); g.moveTo(0, i * 64); g.lineTo(256, i * 64); g.stroke();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(8, 4);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// --- Start-screen cast row -------------------------------------------------
// Blocky head-and-shoulders portraits of the first ten players, painted
// in 2D on the start screen's canvas. Matches the 3D look: a box head
// with a face, a torso in the player's colour, and their accessory.

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
    // Torso.
    ctx.fillStyle = look.robe;
    ctx.fillRect(cx - 11, 32, 22, 15);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(cx - 11, 43, 22, 4);
    // Head.
    ctx.fillStyle = look.skin;
    ctx.fillRect(cx - 9, 12, 18, 17);
    // Hair cap / hood.
    if (look.style === 'hood') {
      ctx.fillStyle = look.robe;
      ctx.fillRect(cx - 10, 9, 20, 6);
      ctx.fillRect(cx - 10, 9, 3, 20);
      ctx.fillRect(cx + 7, 9, 3, 20);
    } else if (look.style !== 'bald') {
      ctx.fillStyle = look.hair;
      ctx.fillRect(cx - 9, 10, 18, 6);
      if (look.style === 'spiky') {
        ctx.fillRect(cx - 6, 5, 4, 6);
        ctx.fillRect(cx + 1, 4, 4, 7);
      }
    }
    // Face.
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(cx - 5.5, 19, 3, 4);
    ctx.fillRect(cx + 2.5, 19, 3, 4);
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(cx, 24, 4.5, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();
    // Accessory hint.
    if (look.acc === 'hat') {
      ctx.fillStyle = look.accent;
      ctx.beginPath();
      ctx.moveTo(cx - 9, 12); ctx.lineTo(cx + 9, 12); ctx.lineTo(cx + 2, -2);
      ctx.closePath(); ctx.fill();
    } else if (look.acc === 'crown') {
      ctx.fillStyle = '#ffd94d';
      ctx.fillRect(cx - 6, 6, 3, 6);
      ctx.fillRect(cx - 1.5, 4, 3, 8);
      ctx.fillRect(cx + 3, 6, 3, 6);
    } else if (look.acc === 'glasses') {
      ctx.strokeStyle = '#1a1a1a';
      ctx.lineWidth = 1.4;
      ctx.strokeRect(cx - 7, 18, 6, 6);
      ctx.strokeRect(cx + 1, 18, 6, 6);
    } else if (look.acc === 'flower') {
      ctx.fillStyle = look.accent;
      ctx.beginPath(); ctx.arc(cx + 8, 13, 3, 0, Math.PI * 2); ctx.fill();
    } else if (look.acc === 'band') {
      ctx.fillStyle = look.accent;
      ctx.fillRect(cx - 9, 15, 18, 3);
    }
    ctx.textAlign = 'center';
    ctx.font = 'bold 9px system-ui, sans-serif';
    ctx.fillStyle = p.isHuman ? '#7df3ff' : 'rgba(255, 255, 255, 0.8)';
    ctx.fillText(p.name, cx, canvas.height - 5);
  });
}

// --- The 3D renderer -------------------------------------------------------

export function createRenderer(canvas, callbacks = {}) {
  const NO_GL = !!callbacks.noGL;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(1280, 720, false);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0d1420);
  scene.fog = new THREE.Fog(0x0d1420, 70, 150);

  const camera = new THREE.PerspectiveCamera(55, 1280 / 720, 0.1, 400);
  camera.position.set(0, 30, 24); // high overview until the menu orbit / follow takes over

  const hemi = new THREE.HemisphereLight(0xcfe4ff, 0x3a2f26, 1.05);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(30, 55, 25);
  scene.add(sun);
  const nightLight = new THREE.PointLight(0xffe9a8, 80, 34, 2);
  nightLight.visible = false;
  scene.add(nightLight);

  // Shared geometries and materials (one instance per shape/colour).
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const sphereGeo = new THREE.SphereGeometry(1, 14, 10);
  const coneGeo = new THREE.ConeGeometry(1, 1, 10);
  const circleGeo = new THREE.CircleGeometry(1, 32);
  const ringGeo = new THREE.RingGeometry(0.9, 1, 48);
  const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 48, 1, true);
  const matCache = new Map();
  function mat(color, opts = {}) {
    const key = `${color}|${opts.emissive || ''}|${opts.opacity ?? 1}|${opts.transparent ? 't' : ''}`;
    if (!matCache.has(key)) {
      const m = new THREE.MeshLambertMaterial({ color });
      if (opts.emissive) { m.emissive = new THREE.Color(opts.emissive); m.emissiveIntensity = opts.ei ?? 0.8; }
      if (opts.transparent) { m.transparent = true; m.opacity = opts.opacity ?? 1; m.depthWrite = opts.depthWrite ?? false; }
      matCache.set(key, m);
    }
    return matCache.get(key);
  }
  function basic(color, opacity = 1) {
    const key = `b|${color}|${opacity}`;
    if (!matCache.has(key)) {
      matCache.set(key, new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: false, side: THREE.DoubleSide }));
    }
    return matCache.get(key);
  }
  function box(w, h, d, material, x = 0, y = 0, z = 0) {
    const m = new THREE.Mesh(boxGeo, material);
    m.scale.set(w, h, d);
    m.position.set(x, y, z);
    return m;
  }

  // --- Static world: ground, outer void, wall, props -----------------------
  const ARENA_W = 1248 * S; // 62.4
  const ARENA_H = 624 * S; // 31.2
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(ARENA_W, ARENA_H),
    new THREE.MeshLambertMaterial({ map: makeGroundTexture() }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  const voidPlane = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), basic(0x0a0e18, 1));
  voidPlane.rotation.x = -Math.PI / 2;
  voidPlane.position.y = -0.1;
  scene.add(voidPlane);

  // Blocky stone wall around the arena, with a darker cap row.
  const wallMat = mat(0x7a8494);
  const capMat = mat(0x5b6577);
  const wallGroup = new THREE.Group();
  {
    const rnd = rng01(99);
    const per = 2.3;
    const mkWall = (x0, z0, x1, z1) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const n = Math.floor(len / per);
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const h = 2.0 + rnd() * 0.7;
        const b = box(2.1, h, 1.6, wallMat, x0 + (x1 - x0) * t, h / 2, z0 + (z1 - z0) * t);
        wallGroup.add(b);
        wallGroup.add(box(2.3, 0.3, 1.8, capMat, b.position.x, h + 0.15, b.position.z));
      }
    };
    const hw = ARENA_W / 2 + 1;
    const hh = ARENA_H / 2 + 1;
    mkWall(-hw, -hh, hw, -hh);
    mkWall(-hw, hh, hw, hh);
    mkWall(-hw, -hh, -hw, hh);
    mkWall(hw, -hh, hw, hh);
  }
  scene.add(wallGroup);

  // Decorative props (never block movement): rocks, bushes, mushrooms,
  // flowers, puddles, and a ruined pillar at each corner.
  const propsGroup = new THREE.Group();
  {
    const rnd = rng01(20261117);
    const spot = (margin) => ({
      x: -ARENA_W / 2 + margin + rnd() * (ARENA_W - margin * 2),
      z: -ARENA_H / 2 + margin + rnd() * (ARENA_H - margin * 2),
    });
    for (let i = 0; i < 12; i++) {
      const s = spot(2.5);
      const r = box(0.9 + rnd() * 0.9, 0.6 + rnd() * 0.6, 0.8 + rnd() * 0.7, mat(0x5d6b82), s.x, 0.3, s.z);
      r.rotation.y = rnd() * Math.PI;
      propsGroup.add(r);
    }
    for (let i = 0; i < 10; i++) {
      const s = spot(2.5);
      const b = box(1.1 + rnd() * 0.7, 0.9, 1.0 + rnd() * 0.6, mat(0x2b6b3f), s.x, 0.45, s.z);
      b.rotation.y = rnd() * Math.PI;
      propsGroup.add(b);
      propsGroup.add(box(0.6, 0.5, 0.6, mat(0x3d8a52), s.x + 0.4, 0.85, s.z + 0.2));
    }
    for (let i = 0; i < 7; i++) {
      const s = spot(2.5);
      propsGroup.add(box(0.22, 0.5, 0.22, mat(0xe8ddc8), s.x, 0.25, s.z));
      propsGroup.add(box(0.7, 0.3, 0.7, mat(0xc0392b), s.x, 0.6, s.z));
    }
    const petalCols = [0xf472b6, 0xfacc15, 0xf8fafc, 0xc084fc];
    for (let i = 0; i < 9; i++) {
      const s = spot(2.5);
      propsGroup.add(box(0.08, 0.5, 0.08, mat(0x2b6b3f), s.x, 0.25, s.z));
      propsGroup.add(box(0.3, 0.22, 0.3, mat(petalCols[i % petalCols.length]), s.x, 0.55, s.z));
    }
    for (let i = 0; i < 5; i++) {
      const s = spot(3);
      const p = new THREE.Mesh(circleGeo, basic(0x3878b4, 0.55));
      p.rotation.x = -Math.PI / 2;
      p.position.set(s.x, 0.02, s.z);
      p.scale.set(1.4 + rnd(), 1 + rnd() * 0.5, 1);
      propsGroup.add(p);
    }
    for (const [px, pz] of [[-ARENA_W / 2 + 3, -ARENA_H / 2 + 3], [ARENA_W / 2 - 3, -ARENA_H / 2 + 3], [-ARENA_W / 2 + 3, ARENA_H / 2 - 3], [ARENA_W / 2 - 3, ARENA_H / 2 - 3]]) {
      propsGroup.add(box(1.6, 0.5, 1.6, mat(0x39415a), px, 0.25, pz));
      propsGroup.add(box(1.2, 3.4, 1.2, mat(0x4a5568), px, 2.2, pz));
      propsGroup.add(box(1.6, 0.4, 1.6, mat(0x5b6a86), px, 4.1, pz));
    }
  }
  scene.add(propsGroup);

  // --- Zone: glowing cylinder wall + ground ring + outside tint ------------
  const zoneWall = new THREE.Mesh(cylGeo, basic(0xff3c3c, 0.14));
  zoneWall.position.y = 3.5;
  scene.add(zoneWall);
  const zoneRing = new THREE.Mesh(ringGeo, basic(0xff5a5a, 0.6));
  zoneRing.rotation.x = -Math.PI / 2;
  zoneRing.position.y = 0.05;
  scene.add(zoneRing);
  let zoneTint = null;
  let zoneTintR = -1;
  function rebuildZoneTint(rWorld, cxWorld, czWorld) {
    if (zoneTint) { scene.remove(zoneTint); zoneTint.geometry.dispose(); }
    const shape = new THREE.Shape();
    shape.moveTo(-100, -100); shape.lineTo(100, -100); shape.lineTo(100, 100); shape.lineTo(-100, 100); shape.closePath();
    const hole = new THREE.Path();
    hole.absarc(0, 0, rWorld, 0, Math.PI * 2, true);
    shape.holes.push(hole);
    zoneTint = new THREE.Mesh(new THREE.ShapeGeometry(shape, 48), basic(0xff3c3c, 0.10));
    zoneTint.rotation.x = -Math.PI / 2;
    zoneTint.position.set(cxWorld, 0.04, czWorld);
    scene.add(zoneTint);
    zoneTintR = rWorld;
  }

  // --- Flood water: a ring that closes in (shape with a hole) -------------
  let floodMesh = null;
  let floodR = -1;
  function rebuildFlood(waterRWorld, cxWorld, czWorld) {
    if (floodMesh) { scene.remove(floodMesh); floodMesh.geometry.dispose(); }
    const shape = new THREE.Shape();
    shape.absarc(0, 0, 70, 0, Math.PI * 2, false);
    const hole = new THREE.Path();
    hole.absarc(0, 0, Math.max(0.5, waterRWorld), 0, Math.PI * 2, true);
    shape.holes.push(hole);
    floodMesh = new THREE.Mesh(new THREE.ShapeGeometry(shape, 48), basic(0x2f7fd0, 0.5));
    floodMesh.rotation.x = -Math.PI / 2;
    floodMesh.position.set(cxWorld, 0.07, czWorld);
    scene.add(floodMesh);
    floodR = waterRWorld;
  }
  const floodRing = new THREE.Mesh(ringGeo, basic(0x96d2ff, 0.8));
  floodRing.rotation.x = -Math.PI / 2;
  floodRing.position.y = 0.08;
  floodRing.visible = false;
  scene.add(floodRing);

  // --- Ice sheen overlay ----------------------------------------------------
  const icePlane = new THREE.Mesh(new THREE.PlaneGeometry(ARENA_W, ARENA_H), basic(0xaee9ff, 0.16));
  icePlane.rotation.x = -Math.PI / 2;
  icePlane.position.y = 0.03;
  icePlane.visible = false;
  scene.add(icePlane);

  // --- Rain / wind streaks (line segments, wrapped in the arena) -----------
  function makeStreaks(count, color, opacity) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 6);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat2 = new THREE.LineBasicMaterial({ color, transparent: true, opacity });
    const lines = new THREE.LineSegments(geo, mat2);
    lines.visible = false;
    lines.frustumCulled = false;
    scene.add(lines);
    return { lines, pos, count };
  }
  const rain = makeStreaks(220, 0x8cbeff, 0.4);
  const wind = makeStreaks(60, 0xa8e6a1, 0.55);
  const rainSeeds = [];
  for (let i = 0; i < rain.count; i++) rainSeeds.push({ x: (Math.random() - 0.5) * ARENA_W, z: (Math.random() - 0.5) * ARENA_H, y: Math.random() * 32 });
  const windSeeds = [];
  for (let i = 0; i < wind.count; i++) windSeeds.push({ x: (Math.random() - 0.5) * ARENA_W, z: (Math.random() - 0.5) * ARENA_H, y: 0.5 + Math.random() * 6 });

  // --- Engine particles as a 3D point cloud ---------------------------------
  const MAX_PARTICLES = 420;
  const pGeo = new THREE.BufferGeometry();
  const pPos = new Float32Array(MAX_PARTICLES * 3);
  const pCol = new Float32Array(MAX_PARTICLES * 3);
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  const points = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 0.55, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false }));
  points.frustumCulled = false;
  scene.add(points);
  const tmpColor = new THREE.Color();

  // --- DOM overlays ----------------------------------------------------------
  const nametagLayer = document.getElementById('nametags');
  const floaterLayer = document.getElementById('floaters');
  const flashEl = document.getElementById('flash');
  const vignetteEl = document.getElementById('zoneVignette');
  const minimap = document.getElementById('minimap');
  const miniCtx = minimap ? minimap.getContext('2d') : null;

  const tagById = new Map();
  function tagFor(p) {
    if (tagById.has(p.id)) return tagById.get(p.id);
    const el = document.createElement('div');
    el.className = 'tag';
    el.innerHTML = `<span class="tag-name">${p.name}</span><div class="tag-hp"><div class="tag-hp-fill"></div></div>`;
    if (p.isHuman) el.classList.add('tag-human');
    nametagLayer.appendChild(el);
    const rec = { el, fill: el.querySelector('.tag-hp-fill') };
    tagById.set(p.id, rec);
    return rec;
  }
  const floaterEls = new Map();

  const projV = new THREE.Vector3();
  function toScreen(worldX, worldY, worldZ) {
    projV.set(worldX, worldY, worldZ).project(camera);
    if (projV.z > 1) return null;
    return {
      x: (projV.x * 0.5 + 0.5) * 1280,
      y: (-projV.y * 0.5 + 0.5) * 720,
    };
  }

  // --- Blocky characters -----------------------------------------------------
  // Roblox-style: box head with a face, box torso, box arms and legs on
  // pivots, a per-player accessory. Geometries are shared; materials are
  // cached per colour; each character owns only its meshes.

  const faceMat = new THREE.MeshBasicMaterial({ map: getFaceTexture(), transparent: true, depthWrite: false });
  const shadowMat = basic(0x000000, 0.32);
  const goldMat = mat(0xffd94d, { emissive: 0xffd94d, ei: 0.5 });

  function buildCharacter(p) {
    const look = lookFor(p);
    const g = new THREE.Group();
    const skinM = mat(look.skin);
    const robeM = mat(look.robe);
    const hairM = mat(look.hair);
    const accentM = mat(look.accent, { emissive: look.accent, ei: 0.35 });

    // Blob shadow (stays on the ground).
    const shadow = new THREE.Mesh(circleGeo, shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;
    shadow.scale.set(1.05, 1.05, 1);
    g.add(shadow);

    // Legs on hip pivots.
    const legGeo = new THREE.BoxGeometry(0.5, 0.9, 0.55);
    const legL = new THREE.Group();
    legL.position.set(-0.32, 0.9, 0);
    const legLMesh = new THREE.Mesh(legGeo, robeM);
    legLMesh.position.y = -0.45;
    legL.add(legLMesh);
    const legR = new THREE.Group();
    legR.position.set(0.32, 0.9, 0);
    const legRMesh = new THREE.Mesh(legGeo, robeM);
    legRMesh.position.y = -0.45;
    legR.add(legRMesh);
    g.add(legL, legR);

    // Torso.
    const torso = new THREE.Mesh(new THREE.BoxGeometry(1.25, 1.1, 0.65), robeM);
    torso.position.y = 1.45;
    g.add(torso);
    // Belt.
    const belt = box(1.27, 0.16, 0.67, mat(0x222222), 0, 1.08, 0);
    g.add(belt);
    const buckle = box(0.22, 0.14, 0.05, goldMat, 0, 1.08, 0.34);
    g.add(buckle);

    // Arms on shoulder pivots.
    const armGeo = new THREE.BoxGeometry(0.38, 1.0, 0.5);
    const armL = new THREE.Group();
    armL.position.set(-0.82, 1.92, 0);
    const armLMesh = new THREE.Mesh(armGeo, skinM);
    armLMesh.position.y = -0.5;
    armL.add(armLMesh);
    const armR = new THREE.Group();
    armR.position.set(0.82, 1.92, 0);
    const armRMesh = new THREE.Mesh(armGeo, skinM);
    armRMesh.position.y = -0.5;
    armR.add(armRMesh);
    g.add(armL, armR);

    // Head + face.
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.8, 0.8), skinM);
    head.position.y = 2.42;
    g.add(head);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.62), faceMat);
    face.position.set(0, 2.42, 0.41);
    g.add(face);

    // Hair / hood.
    if (look.style === 'mop') {
      g.add(box(0.9, 0.24, 0.85, hairM, 0, 2.88, 0));
      g.add(box(0.9, 0.3, 0.18, hairM, 0, 2.7, -0.36));
    } else if (look.style === 'hood') {
      const hoodM = mat(look.robe);
      g.add(box(0.95, 0.3, 0.9, hoodM, 0, 2.88, -0.02));
      g.add(box(0.95, 0.85, 0.16, hoodM, 0, 2.42, -0.42));
      g.add(box(0.16, 0.85, 0.9, hoodM, -0.44, 2.42, -0.02));
      g.add(box(0.16, 0.85, 0.9, hoodM, 0.44, 2.42, -0.02));
    } else if (look.style === 'spiky') {
      g.add(box(0.2, 0.35, 0.2, hairM, -0.25, 2.95, 0));
      g.add(box(0.2, 0.45, 0.2, hairM, 0.05, 3.0, 0.05));
      g.add(box(0.2, 0.3, 0.2, hairM, 0.3, 2.92, -0.05));
    }

    // Accessory.
    if (look.acc === 'hat') {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.85, 10), accentM);
      cone.position.set(0.05, 3.3, 0);
      cone.rotation.z = -0.12;
      g.add(cone);
      g.add(box(1.05, 0.09, 1.05, accentM, 0, 2.92, 0));
    } else if (look.acc === 'band') {
      g.add(box(0.9, 0.2, 0.86, accentM, 0, 2.62, 0));
    } else if (look.acc === 'scarf') {
      g.add(box(1.0, 0.28, 0.78, accentM, 0, 1.98, 0));
      g.add(box(0.3, 0.7, 0.14, accentM, -0.3, 1.6, -0.42));
    } else if (look.acc === 'glasses') {
      g.add(box(0.26, 0.2, 0.06, mat(0x1d1d1d), -0.2, 2.5, 0.42));
      g.add(box(0.26, 0.2, 0.06, mat(0x1d1d1d), 0.2, 2.5, 0.42));
      g.add(box(0.16, 0.05, 0.05, mat(0x1d1d1d), 0, 2.5, 0.42));
    } else if (look.acc === 'pack') {
      g.add(box(0.85, 0.95, 0.42, mat(0x8a6d3b), 0, 1.45, -0.52));
      g.add(box(0.85, 0.18, 0.44, mat(0x6d5326), 0, 1.45, -0.52));
    } else if (look.acc === 'staff') {
      const rod = box(0.12, 2.0, 0.12, mat(0x8a6d3b), 1.12, 1.35, 0.25);
      rod.rotation.z = 0.12;
      g.add(rod);
      const tip = box(0.28, 0.28, 0.28, accentM, 1.0, 2.42, 0.25);
      g.add(tip);
    } else if (look.acc === 'crown') {
      g.add(box(0.7, 0.16, 0.7, goldMat, 0, 2.9, 0));
      g.add(box(0.14, 0.28, 0.14, goldMat, -0.24, 3.08, 0));
      g.add(box(0.14, 0.34, 0.14, goldMat, 0, 3.12, 0));
      g.add(box(0.14, 0.28, 0.14, goldMat, 0.24, 3.08, 0));
    } else if (look.acc === 'flower') {
      g.add(box(0.3, 0.26, 0.12, accentM, 0.42, 2.72, 0.3));
      g.add(box(0.14, 0.14, 0.14, mat(0xfff7cc), 0.42, 2.72, 0.38));
    }

    // Gold ring under the human.
    let ring = null;
    if (p.isHuman) {
      ring = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.22, 32), basic(0xffd94d, 0.9));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.03;
      g.add(ring);
    }

    // Hit-flash shell (white box around the body, opacity animated).
    const flashShell = new THREE.Mesh(boxGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
    flashShell.scale.set(1.5, 3.0, 1.05);
    flashShell.position.y = 1.45;
    g.add(flashShell);

    // Shield bubble.
    const shield = new THREE.Mesh(sphereGeo, basic(0xffd94d, 0.2));
    shield.scale.set(2.0, 2.0, 2.0);
    shield.position.y = 1.5;
    shield.visible = false;
    g.add(shield);

    // Roots (vines): four tilted green stakes at the feet.
    const roots = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      const stake = box(0.12, 1.1, 0.12, mat(0x3fae5a), Math.cos(a) * 0.8, 0.4, Math.sin(a) * 0.8);
      stake.rotation.z = Math.cos(a) * 0.5;
      stake.rotation.x = -Math.sin(a) * 0.5;
      roots.add(stake);
    }
    roots.visible = false;
    g.add(roots);

    scene.add(g);
    return {
      group: g, armL, armR, legL, legR, head, torso, ring, flashShell, shield, roots,
      phase: Math.random() * 6, popT: 0, prevAlive: true, rotY: 0,
    };
  }

  const chars = new Map();
  function charFor(p) {
    if (!chars.has(p.id)) chars.set(p.id, buildCharacter(p));
    return chars.get(p.id);
  }

  // --- Death bursts: the loser explodes into their blocks -------------------
  const bursts = [];
  function spawnDeathBurst(p, look) {
    const parts = [
      { w: 0.85, h: 0.8, d: 0.8, c: look.skin, y: 2.42 },
      { w: 1.25, h: 1.1, d: 0.65, c: look.robe, y: 1.45 },
      { w: 0.38, h: 1.0, d: 0.5, c: look.skin, y: 1.5 },
      { w: 0.38, h: 1.0, d: 0.5, c: look.skin, y: 1.5 },
      { w: 0.5, h: 0.9, d: 0.55, c: look.robe, y: 0.45 },
      { w: 0.5, h: 0.9, d: 0.55, c: look.robe, y: 0.45 },
    ];
    const px = wx(p.x);
    const pz = wz(p.y);
    for (const part of parts) {
      const m = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: part.c, transparent: true }));
      m.scale.set(part.w, part.h, part.d);
      m.position.set(px, part.y, pz);
      scene.add(m);
      const a = Math.random() * Math.PI * 2;
      const sp = 3 + Math.random() * 5;
      bursts.push({
        mesh: m, life: 1.1, vx: Math.cos(a) * sp, vy: 6 + Math.random() * 5, vz: Math.sin(a) * sp,
        rx: (Math.random() - 0.5) * 9, rz: (Math.random() - 0.5) * 9,
      });
    }
  }

  // --- Dash ghosts -----------------------------------------------------------
  const ghosts = [];
  let ghostTimer = 0;
  function spawnGhost(p) {
    const look = lookFor(p);
    const g = new THREE.Group();
    const torsoM = new THREE.MeshLambertMaterial({ color: look.robe, transparent: true, opacity: 0.35 });
    const headM = new THREE.MeshLambertMaterial({ color: look.skin, transparent: true, opacity: 0.35 });
    const t = new THREE.Mesh(boxGeo, torsoM);
    t.scale.set(1.25, 1.1, 0.65);
    t.position.y = 1.45;
    const h = new THREE.Mesh(boxGeo, headM);
    h.scale.set(0.85, 0.8, 0.8);
    h.position.y = 2.42;
    g.add(t, h);
    g.position.set(wx(p.x), 0, wz(p.y));
    g.rotation.y = Math.atan2(p.faceX, p.faceY);
    scene.add(g);
    ghosts.push({ group: g, life: 0.32, mats: [torsoM, headM] });
  }

  // --- Expanding ring pulses (cast, scroll pickup) ---------------------------
  const pulses = [];
  function spawnPulse(worldX, worldZ, color) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(worldX, 0.06, worldZ);
    scene.add(m);
    pulses.push({ mesh: m, life: 0.5 });
  }

  // --- Cast word sprite (the typed word flashes in the sky) ------------------
  let wordSprite = null;
  let wordSpriteLife = 0;
  function spawnWordSprite(word, caster) {
    if (wordSprite) { scene.remove(wordSprite); wordSprite.material.map.dispose(); wordSprite.material.dispose(); }
    const cv = document.createElement('canvas');
    cv.width = 512;
    cv.height = 128;
    const g = cv.getContext('2d');
    g.font = '900 84px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 14;
    g.strokeStyle = 'rgba(0,0,0,0.85)';
    g.strokeText(word.name, 256, 64);
    g.fillStyle = word.color;
    g.fillText(word.name, 256, 64);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const smat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
    wordSprite = new THREE.Sprite(smat);
    wordSprite.scale.set(11, 2.75, 1);
    wordSprite.position.set(wx(caster.x), 6.5, wz(caster.y));
    scene.add(wordSprite);
    wordSpriteLife = 1.3;
  }

  // --- Wordsmith spotlight ---------------------------------------------------
  const beam = new THREE.Mesh(cylGeo, basic(0xffd94d, 0.16));
  beam.scale.set(1.6, 30, 1.6);
  beam.position.y = 15;
  beam.visible = false;
  scene.add(beam);
  const beamRing = new THREE.Mesh(ringGeo, basic(0xffd94d, 0.85));
  beamRing.rotation.x = -Math.PI / 2;
  beamRing.position.y = 0.06;
  beamRing.scale.set(2.0, 2.0, 1);
  beamRing.visible = false;
  scene.add(beamRing);
  const beamStar = new THREE.Mesh(new THREE.OctahedronGeometry(0.55), mat(0xffd94d, { emissive: 0xffd94d, ei: 1 }));
  beamStar.visible = false;
  scene.add(beamStar);

  // --- Win celebration confetti ----------------------------------------------
  const CONFETTI_N = 220;
  const confGeo = new THREE.BufferGeometry();
  const confPos = new Float32Array(CONFETTI_N * 3);
  const confCol = new Float32Array(CONFETTI_N * 3);
  const confetti = new THREE.Points(confGeo, new THREE.PointsMaterial({ size: 0.5, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false }));
  confetti.visible = false;
  confetti.frustumCulled = false;
  confGeo.setAttribute('position', new THREE.BufferAttribute(confPos, 3));
  confGeo.setAttribute('color', new THREE.BufferAttribute(confCol, 3));
  scene.add(confetti);
  const confettiCols = [0xffd94d, 0xff6b6b, 0x7df3ff, 0xc084fc, 0x4ade80, 0xfb923c];
  const confettiSeeds = [];
  for (let i = 0; i < CONFETTI_N; i++) {
    confettiSeeds.push({ a: Math.random() * Math.PI * 2, r: 2 + Math.random() * 10, y: Math.random() * 16, sp: 2 + Math.random() * 3 });
    tmpColor.setHex(confettiCols[i % confettiCols.length]);
    confCol[i * 3] = tmpColor.r; confCol[i * 3 + 1] = tmpColor.g; confCol[i * 3 + 2] = tmpColor.b;
  }

  // --- Hazards (one group per hazard object, synced each frame) --------------
  const hazardMeshes = new Map();

  function makeHazardMesh(h) {
    const g = new THREE.Group();
    const rec = { group: g, kind: h.kind };
    switch (h.kind) {
      case 'meteorTarget': {
        const ring = new THREE.Mesh(ringGeo, basic(0xff7828, 0.7));
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.05;
        const disc = new THREE.Mesh(circleGeo, basic(0xff7828, 0.22));
        disc.rotation.x = -Math.PI / 2;
        disc.position.y = 0.04;
        const rock = new THREE.Mesh(sphereGeo, mat(0x8a5a3a, { emissive: 0xff6a00, ei: 0.9 }));
        rock.scale.set(0.85, 0.85, 0.85);
        const glow = new THREE.Mesh(sphereGeo, basic(0xff9a3d, 0.3));
        glow.scale.set(1.6, 1.6, 1.6);
        const trail = [];
        for (let i = 0; i < 3; i++) {
          const t = new THREE.Mesh(sphereGeo, basic(0xff9a3d, 0.4 - i * 0.1));
          t.scale.set(0.55 - i * 0.12, 0.55 - i * 0.12, 0.55 - i * 0.12);
          trail.push(t);
          g.add(t);
        }
        g.add(ring, disc, rock, glow);
        Object.assign(rec, { ring, disc, rock, glow, trail });
        break;
      }
      case 'bolt': {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6 * 3), 3));
        const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe14d, transparent: true, opacity: 0.95 }));
        line.frustumCulled = false;
        const disc = new THREE.Mesh(circleGeo, basic(0xffe14d, 0.3));
        disc.rotation.x = -Math.PI / 2;
        disc.position.y = 0.05;
        g.add(line, disc);
        Object.assign(rec, { line, disc });
        break;
      }
      case 'firePatch': {
        const disc = new THREE.Mesh(circleGeo, basic(0xff7a1a, 0.5));
        disc.rotation.x = -Math.PI / 2;
        disc.position.y = 0.05;
        const inner = new THREE.Mesh(circleGeo, basic(0xffc83c, 0.55));
        inner.rotation.x = -Math.PI / 2;
        inner.position.y = 0.06;
        const flames = [];
        for (let i = 0; i < 3; i++) {
          const f = new THREE.Mesh(coneGeo, mat(0xffcd3c, { emissive: 0xff7a1a, ei: 1 }));
          f.position.set(Math.sin(h.x * 3.1 + i * 2.4) * 0.5, 0.6, Math.cos(h.y * 2.7 + i * 2.1) * 0.5);
          flames.push(f);
          g.add(f);
        }
        g.add(disc, inner);
        Object.assign(rec, { disc, inner, flames });
        break;
      }
      case 'lavaWarn': {
        const ring = new THREE.Mesh(ringGeo, basic(0xff5722, 0.8));
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.05;
        const disc = new THREE.Mesh(circleGeo, basic(0xff5722, 0.2));
        disc.rotation.x = -Math.PI / 2;
        disc.position.y = 0.04;
        g.add(ring, disc);
        Object.assign(rec, { ring, disc });
        break;
      }
      case 'lavaPool': {
        const disc = new THREE.Mesh(circleGeo, mat(0xa01e0a, { emissive: 0xff3300, ei: 0.4 }));
        disc.rotation.x = -Math.PI / 2;
        disc.position.y = 0.05;
        const blob1 = new THREE.Mesh(circleGeo, basic(0xff6e1e, 0.85));
        blob1.rotation.x = -Math.PI / 2;
        blob1.position.set(-0.5, 0.06, -0.4);
        const blob2 = new THREE.Mesh(circleGeo, basic(0xff6e1e, 0.85));
        blob2.rotation.x = -Math.PI / 2;
        blob2.position.set(0.55, 0.06, 0.45);
        g.add(disc, blob1, blob2);
        Object.assign(rec, { disc, blob1, blob2 });
        break;
      }
      case 'poisonCloud': {
        const puffs = [];
        for (let i = 0; i < 3; i++) {
          const s = new THREE.Mesh(sphereGeo, basic(0x7ddb3a, 0.32));
          s.position.set((i - 1) * 0.7, 0.9 + (i % 2) * 0.4, (i % 2 ? -0.5 : 0.5));
          puffs.push(s);
          g.add(s);
        }
        Object.assign(rec, { puffs });
        break;
      }
      case 'vinePatch': {
        const disc = new THREE.Mesh(circleGeo, basic(0x3fae5a, 0.25));
        disc.rotation.x = -Math.PI / 2;
        disc.position.y = 0.05;
        const vines = [];
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2 + h.x;
          const v = box(0.16, 1.4, 0.16, mat(0x3fae5a), Math.cos(a) * 0.9, 0.6, Math.sin(a) * 0.9);
          v.rotation.z = Math.cos(a) * 0.5;
          v.rotation.x = -Math.sin(a) * 0.5;
          vines.push(v);
          g.add(v);
        }
        g.add(disc);
        Object.assign(rec, { disc, vines });
        break;
      }
      case 'tornado': {
        const funnel = new THREE.Group();
        const tiers = [];
        for (let i = 0; i < 5; i++) {
          const c = new THREE.Mesh(coneGeo, mat(0xd7e0e6));
          c.scale.set(2.4 - i * 0.4, 1.4, 2.4 - i * 0.4);
          c.position.y = 0.8 + i * 1.15;
          c.rotation.x = Math.PI;
          funnel.add(c);
          tiers.push(c);
        }
        const dust = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.35, 8, 24), basic(0x969696, 0.35));
        dust.rotation.x = Math.PI / 2;
        dust.position.y = 0.3;
        const debris = [];
        for (let i = 0; i < 5; i++) {
          const d = box(0.4, 0.4, 0.4, mat(i % 2 ? 0x8a7a5a : 0x5a5a5a));
          debris.push(d);
          g.add(d);
        }
        g.add(funnel, dust);
        Object.assign(rec, { funnel, tiers, dust, debris });
        break;
      }
      case 'zombie': {
        // A shambling green blocky figure, arms stretched forward.
        const greenM = mat(0x6a9e4f);
        const darkM = mat(0x3d5c2e);
        const zHead = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.75, 0.75), greenM);
        zHead.position.y = 2.3;
        const zTorso = new THREE.Mesh(new THREE.BoxGeometry(1.15, 1.05, 0.6), darkM);
        zTorso.position.y = 1.35;
        const zLegL = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.85, 0.5), darkM);
        zLegL.position.set(-0.3, 0.42, 0);
        const zLegR = zLegL.clone();
        zLegR.position.x = 0.3;
        const zArmL = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.95, 0.45), greenM);
        zArmL.position.set(-0.75, 1.5, 0.45);
        zArmL.rotation.x = -1.25;
        const zArmR = zArmL.clone();
        zArmR.position.x = 0.75;
        const eyeL = box(0.14, 0.14, 0.06, mat(0xff4444, { emissive: 0xff0000, ei: 1 }), -0.18, 2.38, 0.4);
        const eyeR = box(0.14, 0.14, 0.06, mat(0xff4444, { emissive: 0xff0000, ei: 1 }), 0.18, 2.38, 0.4);
        g.add(zHead, zTorso, zLegL, zLegR, zArmL, zArmR, eyeL, eyeR);
        Object.assign(rec, { prevX: h.x, prevY: h.y });
        break;
      }
      case 'bees': {
        const bees = [];
        for (let i = 0; i < 9; i++) {
          const b = new THREE.Mesh(sphereGeo, mat(i % 2 ? 0x1a1a1a : 0xffcf3f));
          b.scale.set(0.22, 0.22, 0.22);
          bees.push(b);
          g.add(b);
        }
        const shell = new THREE.Mesh(sphereGeo, basic(0xffcf3f, 0.14));
        shell.scale.set(1.5, 1.1, 1.5);
        shell.position.y = 1.4;
        g.add(shell);
        Object.assign(rec, { bees, shell });
        break;
      }
      case 'bomb': {
        const ring = new THREE.Mesh(ringGeo, basic(0xff4444, 0.5));
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.05;
        ring.scale.set(5.6, 5.6, 1);
        const disc = new THREE.Mesh(circleGeo, basic(0xff4444, 0.08));
        disc.rotation.x = -Math.PI / 2;
        disc.position.y = 0.04;
        disc.scale.set(5.6, 5.6, 1);
        const body = new THREE.Mesh(sphereGeo, mat(0x1a1a1a));
        body.scale.set(0.85, 0.85, 0.85);
        body.position.y = 0.85;
        const fuse = box(0.08, 0.5, 0.08, mat(0x888888), 0.3, 1.75, 0);
        fuse.rotation.z = -0.4;
        const spark = new THREE.Mesh(sphereGeo, mat(0xffd94d, { emissive: 0xffd94d, ei: 1.4 }));
        spark.scale.set(0.22, 0.22, 0.22);
        spark.position.set(0.42, 2.0, 0);
        g.add(ring, disc, body, fuse, spark);
        Object.assign(rec, { ring, body, spark });
        break;
      }
      case 'crack': {
        const segs = [];
        for (let i = 0; i < 3; i++) {
          const seg = box(1.6, 0.06, 0.28, mat(0x3c2819), -1.4 + i * 1.4, 0.04, Math.sin(h.seed + i * 2.1) * 0.5);
          seg.rotation.y = (i - 1) * 0.35;
          segs.push(seg);
          g.add(seg);
        }
        Object.assign(rec, { segs });
        break;
      }
      default:
        break;
    }
    g.position.set(wx(h.x), 0, wz(h.y));
    scene.add(g);
    return rec;
  }

  function updateHazardMesh(rec, h, game, time) {
    const r = (h.r || 30) * S;
    switch (rec.kind) {
      case 'meteorTarget': {
        if (h.t < 0) { rec.group.visible = false; break; }
        rec.group.visible = true;
        const k = clamp(h.t / h.dur, 0, 1);
        rec.ring.scale.set(r, r, 1);
        rec.ring.material.opacity = 0.4 + k * 0.5;
        rec.disc.scale.set(r, r, 1);
        const ry = 42 - k * 41;
        rec.rock.position.y = ry;
        rec.glow.position.y = ry;
        rec.trail.forEach((t, i) => { t.position.y = ry + 2 + i * 1.6; });
        break;
      }
      case 'bolt': {
        const pos = rec.line.geometry.attributes.position;
        let px = 0;
        let py = 30;
        for (let i = 0; i < 6; i++) {
          pos.setXYZ(i, px, py, (Math.random() - 0.5) * 1.2);
          px += (Math.random() - 0.5) * 1.6;
          py -= 6;
        }
        pos.needsUpdate = true;
        const flicker = Math.sin(h.t * 60) > 0 ? 1 : 0.35;
        rec.line.material.opacity = flicker;
        rec.disc.scale.set(r, r, 1);
        rec.disc.material.opacity = 0.3 * flicker;
        break;
      }
      case 'firePatch': {
        const f = 0.8 + Math.sin(time * 9 + h.x) * 0.2;
        rec.disc.scale.set(r, r, 1);
        rec.inner.scale.set(r * 0.55, r * 0.55, 1);
        rec.flames.forEach((fl, i) => {
          const fh = Math.max(0.4, (0.9 + Math.sin(time * 13 + i * 2.1 + h.y) * 0.35) * f);
          fl.scale.set(0.55, fh, 0.55);
          fl.position.y = fh / 2 + 0.1;
        });
        break;
      }
      case 'lavaWarn': {
        const k = 0.5 + Math.sin(h.t * 20) * 0.5;
        rec.ring.scale.set(r, r, 1);
        rec.ring.material.opacity = 0.4 + k * 0.5;
        rec.disc.scale.set(r, r, 1);
        break;
      }
      case 'lavaPool': {
        rec.disc.scale.set(r, r, 1);
        rec.blob1.scale.set(r * 0.3, r * 0.3, 1);
        rec.blob2.scale.set(r * 0.22, r * 0.22, 1);
        break;
      }
      case 'poisonCloud': {
        rec.puffs.forEach((p, i) => {
          const s = r * (i === 0 ? 1 : 0.55);
          p.scale.set(s, s * 0.8, s);
        });
        break;
      }
      case 'vinePatch': {
        rec.disc.scale.set(r, r, 1);
        rec.vines.forEach((v, i) => {
          const a = (i / 5) * Math.PI * 2 + h.x;
          v.position.set(Math.cos(a) * r * 0.55, 0.6, Math.sin(a) * r * 0.55);
        });
        break;
      }
      case 'tornado': {
        rec.funnel.rotation.y = time * 9;
        rec.debris.forEach((d, i) => {
          const ang = time * (3 + i * 0.7) + i * 1.9;
          const dr = (16 + i * 7) * S;
          d.position.set(Math.cos(ang) * dr, 0.8 + i * 0.9, Math.sin(ang) * dr);
          d.rotation.y = ang;
        });
        break;
      }
      case 'zombie': {
        const dx = h.x - rec.prevX;
        const dy = h.y - rec.prevY;
        if (Math.hypot(dx, dy) > 0.01) rec.group.rotation.y = Math.atan2(dx, dy);
        rec.prevX = h.x;
        rec.prevY = h.y;
        rec.group.rotation.z = Math.sin(h.wob) * 0.07;
        break;
      }
      case 'bees': {
        rec.bees.forEach((b, i) => {
          const a = (i / 9) * Math.PI * 2 + time * 6;
          b.position.set(Math.cos(a) * 0.9, 1.4 + Math.sin(a * 2) * 0.4, Math.sin(a) * 0.7);
        });
        break;
      }
      case 'bomb': {
        const k = h.t / h.dur;
        const pulse = 1 + Math.sin(h.t * (6 + k * 18)) * 0.1;
        rec.body.scale.set(0.85 * pulse, 0.85 * pulse, 0.85 * pulse);
        const sp = 0.18 + Math.sin(h.t * 30) * 0.08;
        rec.spark.scale.set(sp, sp, sp);
        break;
      }
      default:
        break;
    }
  }

  // --- Decals (craters, scorch marks) ----------------------------------------
  const decalMeshes = new Map();
  function makeDecalMesh(d) {
    const g = new THREE.Group();
    const r = d.r * S;
    if (d.kind === 'crater') {
      const outer = new THREE.Mesh(circleGeo, basic(0x261810, 0.6));
      outer.rotation.x = -Math.PI / 2;
      outer.scale.set(r * 0.9, r * 0.7, 1);
      outer.position.y = 0.045;
      const inner = new THREE.Mesh(circleGeo, basic(0x140c08, 0.55));
      inner.rotation.x = -Math.PI / 2;
      inner.scale.set(r * 0.5, r * 0.38, 1);
      inner.position.y = 0.05;
      const ember = new THREE.Mesh(circleGeo, basic(0xff7a1a, 0.35));
      ember.rotation.x = -Math.PI / 2;
      ember.scale.set(r * 0.3, r * 0.22, 1);
      ember.position.y = 0.055;
      g.add(outer, inner, ember);
      g.userData = { kind: 'crater', ember };
    } else {
      const disc = new THREE.Mesh(circleGeo, basic(0x0a0a0c, 0.65));
      disc.rotation.x = -Math.PI / 2;
      disc.scale.set(r * 0.55, r * 0.55, 1);
      disc.position.y = 0.045;
      g.add(disc);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + d.x;
        const spoke = box(r * 0.7, 0.04, 0.12, mat(0x0a0a0c), Math.cos(a) * r * 0.6, 0.045, Math.sin(a) * r * 0.6);
        spoke.rotation.y = -a;
        g.add(spoke);
      }
      g.userData = { kind: 'scorch' };
    }
    g.position.set(wx(d.x), 0, wz(d.y));
    scene.add(g);
    return g;
  }

  // --- Scrolls (floating glowing books) ---------------------------------------
  const scrollMeshes = new Map();
  function makeScrollMesh(s) {
    const g = new THREE.Group();
    const book = box(0.9, 0.22, 1.2, mat(0xfff3c4), 0, 0, 0);
    const band1 = box(0.94, 0.08, 0.3, mat(0x8a6d1a), 0, 0.1, -0.4);
    const band2 = box(0.94, 0.08, 0.3, mat(0x8a6d1a), 0, 0.1, 0.4);
    const glowShell = new THREE.Mesh(sphereGeo, basic(0xffd94d, 0.18));
    glowShell.scale.set(1.1, 0.8, 1.1);
    const ring = new THREE.Mesh(ringGeo, basic(0xffd94d, 0.7));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -1.0;
    g.add(book, band1, band2, glowShell, ring);
    g.position.set(wx(s.x), 1.4, wz(s.y));
    scene.add(g);
    return g;
  }

  // --- Camera ------------------------------------------------------------------
  const camTarget = new THREE.Vector3(0, 0, 0);
  const camLook = new THREE.Vector3(0, 0, 0);
  const CAM_OFF = new THREE.Vector3(0, 24, 17);
  let menuAngle = 0.6;
  let endAngle = 0;
  let introT = -1;
  let introFrom = new THREE.Vector3();
  let lastWall = performance.now();
  let prevState = 'menu';
  let spectateId = null;

  function focusPlayer(game) {
    if (game.state === 'ended' && game.winner) return game.winner;
    if (game.human && game.human.alive) return game.human;
    const alive = game.alivePlayers();
    if (!alive.length) return game.human;
    if (spectateId === null || !alive.find((p) => p.id === spectateId)) {
      spectateId = alive[0].id;
    }
    return alive.find((p) => p.id === spectateId) || alive[0];
  }

  // --- Minimap -------------------------------------------------------------------
  function drawMinimap(game) {
    if (!miniCtx) return;
    const W = minimap.width;
    const H = minimap.height;
    const a = game.arena;
    miniCtx.clearRect(0, 0, W, H);
    miniCtx.fillStyle = 'rgba(7, 10, 18, 0.78)';
    miniCtx.fillRect(0, 0, W, H);
    const mx = (x) => 6 + ((x - a.x) / a.w) * (W - 12);
    const my = (y) => 6 + ((y - a.y) / a.h) * (H - 12);
    // Zone circle.
    miniCtx.strokeStyle = 'rgba(255, 90, 90, 0.9)';
    miniCtx.lineWidth = 1.5;
    miniCtx.beginPath();
    miniCtx.arc(mx(game.zone.cx), my(game.zone.cy), (game.zone.r / a.w) * (W - 12), 0, Math.PI * 2);
    miniCtx.stroke();
    // Scrolls.
    miniCtx.fillStyle = '#ffd94d';
    for (const s of game.scrolls) miniCtx.fillRect(mx(s.x) - 2, my(s.y) - 2, 4, 4);
    // Hazard markers.
    for (const h of game.hazards) {
      if (h.kind === 'meteorTarget' || h.kind === 'bomb' || h.kind === 'tornado') {
        miniCtx.fillStyle = '#ff4444';
        miniCtx.beginPath(); miniCtx.arc(mx(h.x), my(h.y), 3.5, 0, Math.PI * 2); miniCtx.fill();
      } else if (h.kind === 'firePatch' || h.kind === 'lavaPool' || h.kind === 'lavaWarn') {
        miniCtx.fillStyle = '#ff7a1a';
        miniCtx.beginPath(); miniCtx.arc(mx(h.x), my(h.y), 2.5, 0, Math.PI * 2); miniCtx.fill();
      } else if (h.kind === 'zombie' || h.kind === 'poisonCloud') {
        miniCtx.fillStyle = '#7ddb3a';
        miniCtx.beginPath(); miniCtx.arc(mx(h.x), my(h.y), 2.5, 0, Math.PI * 2); miniCtx.fill();
      }
    }
    // Players.
    for (const p of game.players) {
      if (!p.alive) continue;
      miniCtx.fillStyle = p.isHuman ? '#ffd94d' : '#e8ecf4';
      miniCtx.beginPath(); miniCtx.arc(mx(p.x), my(p.y), p.isHuman ? 3.5 : 2.5, 0, Math.PI * 2); miniCtx.fill();
      if (game.wordsmith === p && game.castPhase && !game.castPhase.cast) {
        miniCtx.strokeStyle = '#c084fc';
        miniCtx.lineWidth = 1.5;
        miniCtx.beginPath(); miniCtx.arc(mx(p.x), my(p.y), 5.5, 0, Math.PI * 2); miniCtx.stroke();
      }
    }
  }

  // --- Frame state ---------------------------------------------------------------
  let flashLevel = 0;
  let lastCastAt = -1;
  let prevHazardSet = new Set();
  const prevAlive = new Map();
  let prevScrollCount = 0;

  function disposeGroup(g) {
    g.traverse((o) => {
      if (o.isMesh && o.material && o.material.dispose && o.material.transparent && o.geometry === boxGeo) {
        // Only dispose one-off transparent materials (bursts/pulses own theirs).
      }
    });
    scene.remove(g);
  }

  function render(game, dt) {
    const time = game.time;
    const state = game.state;
    // Wall-clock delta (capped): the intro sweep runs on wall time so it
    // completes in ~1.4 real seconds even when the frame rate is very low
    // (SwiftShader) or the sim is stepped manually by the playtest.
    const nowWall = performance.now();
    const wallDt = Math.min(0.25, Math.max(0, (nowWall - lastWall) / 1000));
    lastWall = nowWall;

    // Match-start intro sweep: camera dives in from high above.
    if (state === 'playing' && prevState !== 'playing') {
      introT = 0;
      // Snap the follow targets to the focus player so the first frame is
      // already framed on them, and start the dive from high above them
      // (never from the raw camera position, which may be the origin).
      const f0 = focusPlayer(game);
      const fx0 = f0 ? wx(f0.x) : 0;
      const fz0 = f0 ? wz(f0.y) : 0;
      camTarget.set(fx0, 0, fz0);
      camLook.set(fx0, 1, fz0 - 1.5);
      introFrom.set(fx0, 42, fz0 + 30);
      spectateId = null;
    }
    prevState = state;

    // --- Characters --------------------------------------------------------------
    for (const p of game.players) {
      const c = charFor(p);
      // Death: burst into blocks + announcement (once per death).
      if (prevAlive.get(p.id) === true && !p.alive) {
        spawnDeathBurst(p, lookFor(p));
        if (callbacks.onEliminate) callbacks.onEliminate(p);
        flashLevel = Math.max(flashLevel, 0.12);
      }
      prevAlive.set(p.id, p.alive);
      if (!p.alive) {
        c.group.visible = false;
        continue;
      }
      c.group.visible = true;
      const gx = wx(p.x);
      const gz = wz(p.y);
      c.group.position.set(gx, 0, gz);
      // Facing (smoothed).
      const targetRot = Math.atan2(p.faceX, p.faceY);
      c.rotY = lerpAngle(c.rotY, targetRot, Math.min(1, dt * 12));
      c.group.rotation.y = c.rotY;
      // Walk cycle + bob.
      const speed = Math.hypot(p.vx, p.vy);
      const floaty = game.effects.gravity > 0;
      const floatBob = floaty ? Math.sin(time * 6 + p.id * 1.7) * 0.35 : 0;
      if (speed > 25) {
        c.phase += dt * speed * 0.055;
        const swing = Math.sin(c.phase) * Math.min(0.85, speed / 170);
        c.armL.rotation.x = swing;
        c.armR.rotation.x = -swing;
        c.legL.rotation.x = -swing;
        c.legR.rotation.x = swing;
        c.group.position.y = floatBob + Math.abs(Math.sin(c.phase)) * 0.12;
      } else {
        c.armL.rotation.x *= 0.85;
        c.armR.rotation.x *= 0.85;
        c.legL.rotation.x *= 0.85;
        c.legR.rotation.x *= 0.85;
        c.group.position.y = floatBob + Math.sin(time * 2 + p.id) * 0.03;
      }
      // Cast scale-pop.
      if (c.popT > 0) {
        c.popT -= dt;
        const s = 1 + 0.18 * Math.sin((c.popT / 0.3) * Math.PI);
        c.group.scale.set(s, s, s);
      } else {
        c.group.scale.set(1, 1, 1);
      }
      // Hit flash / shield / roots.
      c.flashShell.material.opacity = p.flashT > 0 ? (p.flashT / 0.18) * 0.55 : 0;
      c.shield.visible = p.shielded;
      c.roots.visible = p.rooted;
      if (c.ring) {
        const pulse = 1 + Math.sin(time * 3) * 0.05;
        c.ring.scale.set(pulse, pulse, 1);
      }
      // Dash ghosts.
      if (p.dashT > 0) {
        ghostTimer -= dt;
        if (ghostTimer <= 0) {
          ghostTimer = 0.05;
          spawnGhost(p);
        }
      }
    }

    // Winner celebration: spin + jump + arms up, confetti rain, orbit camera.
    if (state === 'ended' && game.winner) {
      const c = chars.get(game.winner.id);
      if (c) {
        c.group.visible = true;
        c.group.rotation.y += dt * 3.2;
        c.group.position.y = Math.abs(Math.sin(time * 5)) * 1.1;
        c.armL.rotation.z = 2.4;
        c.armR.rotation.z = -2.4;
        c.legL.rotation.x = 0;
        c.legR.rotation.x = 0;
      }
      confetti.visible = true;
      const wpos = game.winner;
      for (let i = 0; i < CONFETTI_N; i++) {
        const s = confettiSeeds[i];
        s.y -= s.sp * dt;
        if (s.y < 0) { s.y = 14 + Math.random() * 4; s.a = Math.random() * Math.PI * 2; }
        confPos[i * 3] = wx(wpos.x) + Math.cos(s.a) * s.r;
        confPos[i * 3 + 1] = s.y;
        confPos[i * 3 + 2] = wz(wpos.y) + Math.sin(s.a) * s.r;
      }
      confGeo.attributes.position.needsUpdate = true;
    } else {
      confetti.visible = false;
    }

    // --- Cast detection: word sprite + caster pop + ring pulse ----------------------
    if (game.lastCast && game.lastCast.at !== lastCastAt) {
      lastCastAt = game.lastCast.at;
      spawnWordSprite(game.lastCast.word, game.lastCast.caster);
      const c = chars.get(game.lastCast.caster.id);
      if (c) c.popT = 0.3;
      spawnPulse(wx(game.lastCast.caster.x), wz(game.lastCast.caster.y), game.lastCast.word.color);
    }
    if (wordSprite) {
      wordSpriteLife -= dt;
      wordSprite.position.y += dt * 1.4;
      wordSprite.material.opacity = clamp(wordSpriteLife / 0.6, 0, 1);
      if (wordSpriteLife <= 0) {
        scene.remove(wordSprite);
        wordSprite.material.map.dispose();
        wordSprite.material.dispose();
        wordSprite = null;
      }
    }

    // --- Wordsmith spotlight ---------------------------------------------------------
    const ws = game.wordsmith;
    const spotlightOn = state === 'playing' && ws && ws.alive && game.castPhase && !game.castPhase.cast;
    beam.visible = spotlightOn;
    beamRing.visible = spotlightOn;
    beamStar.visible = spotlightOn;
    if (spotlightOn) {
      const bx = wx(ws.x);
      const bz = wz(ws.y);
      beam.position.set(bx, 15, bz);
      beamRing.position.set(bx, 0.06, bz);
      const bp = 1 + Math.sin(time * 4) * 0.12;
      beamRing.scale.set(2.0 * bp, 2.0 * bp, 1);
      beamStar.position.set(bx, 4.4 + Math.sin(time * 3) * 0.25, bz);
      beamStar.rotation.y = time * 2.5;
    }

    // --- Scroll pickup pulse ------------------------------------------------------------
    if (game.scrolls.length < prevScrollCount) {
      // A scroll vanished (picked up): pulse at the human if they learned.
      spawnPulse(wx(game.human ? game.human.x : 640), wz(game.human ? game.human.y : 392), '#ffd94d');
    }
    prevScrollCount = game.scrolls.length;

    // --- Hazards --------------------------------------------------------------------------
    const liveHazards = new Set(game.hazards);
    for (const [h, rec] of hazardMeshes) {
      if (!liveHazards.has(h)) {
        // Impact flash when a bomb or meteor finishes.
        if (h.kind === 'bomb') flashLevel = Math.max(flashLevel, 0.3);
        if (h.kind === 'meteorTarget') flashLevel = Math.max(flashLevel, 0.14);
        scene.remove(rec.group);
        hazardMeshes.delete(h);
      }
    }
    for (const h of game.hazards) {
      if (!hazardMeshes.has(h)) hazardMeshes.set(h, makeHazardMesh(h));
      const rec = hazardMeshes.get(h);
      rec.group.position.set(wx(h.x), 0, wz(h.y));
      updateHazardMesh(rec, h, game, time);
    }

    // --- Decals -----------------------------------------------------------------------------
    const liveDecals = new Set(game.decals || []);
    for (const [d, mesh] of decalMeshes) {
      if (!liveDecals.has(d)) {
        scene.remove(mesh);
        decalMeshes.delete(d);
      }
    }
    for (const d of game.decals || []) {
      if (!decalMeshes.has(d)) decalMeshes.set(d, makeDecalMesh(d));
      const age = (time - d.born) / d.dur;
      const mesh = decalMeshes.get(d);
      mesh.visible = age < 1;
      mesh.traverse((o) => {
        if (o.isMesh && o.material.transparent) o.material.opacity = o.material.opacity;
      });
    }

    // --- Scrolls ------------------------------------------------------------------------------
    const liveScrolls = new Set(game.scrolls);
    for (const [s, mesh] of scrollMeshes) {
      if (!liveScrolls.has(s)) {
        scene.remove(mesh);
        scrollMeshes.delete(s);
      }
    }
    for (const s of game.scrolls) {
      if (!scrollMeshes.has(s)) scrollMeshes.set(s, makeScrollMesh(s));
      const mesh = scrollMeshes.get(s);
      mesh.position.y = 1.4 + Math.sin(time * 3 + s.x) * 0.25;
      mesh.rotation.y = time * 1.5;
    }

    // --- Zone / flood / ice / night / rain / wind ------------------------------------------------
    const zr = game.zone.r * S;
    const zcx = wx(game.zone.cx);
    const zcz = wz(game.zone.cy);
    zoneWall.scale.set(zr, 1, zr);
    zoneWall.position.set(zcx, 3.5, zcz);
    zoneWall.material.opacity = 0.10 + Math.sin(time * 3) * 0.04;
    zoneRing.scale.set(zr, zr, 1);
    zoneRing.position.set(zcx, 0.05, zcz);
    zoneRing.material.opacity = 0.4 + Math.sin(time * 3) * 0.2;
    if (Math.abs(zr - zoneTintR) > 0.5 || zoneTintR < 0) rebuildZoneTint(zr, zcx, zcz);

    if (game.effects.flood) {
      const f = game.effects.flood;
      const progress = 1 - f.t / f.max;
      const waterR = (game.zone.r + 260 * (1 - progress)) * S;
      if (Math.abs(waterR - floodR) > 1 || floodR < 0) rebuildFlood(waterR, zcx, zcz);
      if (floodMesh) floodMesh.visible = true;
      floodRing.visible = true;
      floodRing.scale.set(waterR, waterR, 1);
      floodRing.position.set(zcx, 0.08, zcz);
    } else {
      if (floodMesh) floodMesh.visible = false;
      floodRing.visible = false;
      floodR = -1;
    }
    icePlane.visible = game.effects.ice > 0;

    const night = game.effects.night > 0;
    hemi.intensity = night ? 0.3 : 1.05;
    sun.intensity = night ? 0.35 : 1.6;
    scene.fog.near = night ? 12 : 70;
    scene.fog.far = night ? 52 : 150;
    scene.fog.color.setHex(night ? 0x05060a : 0x0d1420);
    scene.background.setHex(night ? 0x05060a : 0x0d1420);
    nightLight.visible = night && game.human && game.human.alive;
    if (nightLight.visible) nightLight.position.set(wx(game.human.x), 8, wz(game.human.y));

    // Rain streaks.
    rain.lines.visible = game.effects.rain > 0;
    if (rain.lines.visible) {
      for (let i = 0; i < rain.count; i++) {
        const s = rainSeeds[i];
        s.y -= 42 * dt;
        if (s.y < 0) { s.y = 30 + Math.random() * 4; s.x = (Math.random() - 0.5) * ARENA_W; s.z = (Math.random() - 0.5) * ARENA_H; }
        rain.pos[i * 6] = s.x;
        rain.pos[i * 6 + 1] = s.y;
        rain.pos[i * 6 + 2] = s.z;
        rain.pos[i * 6 + 3] = s.x - 0.4;
        rain.pos[i * 6 + 4] = s.y - 1.6;
        rain.pos[i * 6 + 5] = s.z;
      }
      rain.lines.geometry.attributes.position.needsUpdate = true;
    }
    // Wind streaks.
    wind.lines.visible = game.effects.wind.t > 0;
    if (wind.lines.visible) {
      const wdx = game.effects.wind.dx;
      const wdz = game.effects.wind.dy;
      for (let i = 0; i < wind.count; i++) {
        const s = windSeeds[i];
        s.x += wdx * 26 * dt;
        s.z += wdz * 26 * dt;
        if (s.x > ARENA_W / 2) s.x = -ARENA_W / 2;
        if (s.x < -ARENA_W / 2) s.x = ARENA_W / 2;
        if (s.z > ARENA_H / 2) s.z = -ARENA_H / 2;
        if (s.z < -ARENA_H / 2) s.z = ARENA_H / 2;
        wind.pos[i * 6] = s.x;
        wind.pos[i * 6 + 1] = s.y;
        wind.pos[i * 6 + 2] = s.z;
        wind.pos[i * 6 + 3] = s.x + wdx * 2.2;
        wind.pos[i * 6 + 4] = s.y;
        wind.pos[i * 6 + 5] = s.z + wdz * 2.2;
      }
      wind.lines.geometry.attributes.position.needsUpdate = true;
    }

    // Lightning flash (DOM overlay) + impact flashes.
    let boltFlash = 0;
    for (const h of game.hazards) {
      if (h.kind === 'bolt' && h.t >= 0) boltFlash = Math.max(boltFlash, (1 - h.t / h.dur) * 0.2);
    }
    flashLevel = Math.max(boltFlash, flashLevel - dt * 1.4);
    if (flashEl) flashEl.style.opacity = String(clamp(flashLevel, 0, 0.35));

    // Zone vignette: red edges while the human stands outside the zone.
    if (vignetteEl) {
      let outside = false;
      if (game.human && game.human.alive && state === 'playing') {
        const d = Math.hypot(game.human.x - game.zone.cx, game.human.y - game.zone.cy);
        outside = d > game.zone.r;
      }
      vignetteEl.style.opacity = outside ? String(0.45 + Math.sin(time * 5) * 0.15) : '0';
    }

    // --- Particles -----------------------------------------------------------------------------
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const pt = game.particles[i];
      if (pt) {
        pPos[i * 3] = wx(pt.x);
        pPos[i * 3 + 1] = 1.0 + (1 - pt.life / pt.maxLife) * 2.2;
        pPos[i * 3 + 2] = wz(pt.y);
        tmpColor.set(pt.color);
        pCol[i * 3] = tmpColor.r;
        pCol[i * 3 + 1] = tmpColor.g;
        pCol[i * 3 + 2] = tmpColor.b;
      } else {
        pPos[i * 3 + 1] = -100;
      }
    }
    pGeo.attributes.position.needsUpdate = true;
    pGeo.attributes.color.needsUpdate = true;

    // --- Bursts / ghosts / pulses ---------------------------------------------------------------
    for (let i = bursts.length - 1; i >= 0; i--) {
      const b = bursts[i];
      b.life -= dt;
      b.vy -= 22 * dt;
      b.mesh.position.x += b.vx * dt;
      b.mesh.position.y += b.vy * dt;
      b.mesh.position.z += b.vz * dt;
      if (b.mesh.position.y < 0.3) { b.mesh.position.y = 0.3; b.vy *= -0.4; }
      b.mesh.rotation.x += b.rx * dt;
      b.mesh.rotation.z += b.rz * dt;
      b.mesh.material.opacity = clamp(b.life / 0.5, 0, 1);
      if (b.life <= 0) {
        scene.remove(b.mesh);
        b.mesh.material.dispose();
        bursts.splice(i, 1);
      }
    }
    for (let i = ghosts.length - 1; i >= 0; i--) {
      const g = ghosts[i];
      g.life -= dt;
      for (const m of g.mats) m.opacity = clamp(g.life / 0.32, 0, 1) * 0.35;
      if (g.life <= 0) {
        scene.remove(g.group);
        for (const m of g.mats) m.dispose();
        ghosts.splice(i, 1);
      }
    }
    for (let i = pulses.length - 1; i >= 0; i--) {
      const pu = pulses[i];
      pu.life -= dt;
      const k = 1 - pu.life / 0.5;
      pu.mesh.scale.set(1 + k * 7, 1 + k * 7, 1);
      pu.mesh.material.opacity = 0.85 * (1 - k);
      if (pu.life <= 0) {
        scene.remove(pu.mesh);
        pu.mesh.material.dispose();
        pulses.splice(i, 1);
      }
    }

    // --- Camera ----------------------------------------------------------------------------------
    const focus = focusPlayer(game);
    const fx = focus ? wx(focus.x) : 0;
    const fz = focus ? wz(focus.y) : 0;
    if (state === 'menu') {
      menuAngle += dt * 0.07;
      const r = 38;
      camera.position.set(Math.cos(menuAngle) * r, 27, Math.sin(menuAngle) * r * 0.62);
      camLook.set(0, 0, 0);
      camera.lookAt(camLook);
    } else if (state === 'ended' && game.winner) {
      endAngle += dt * 0.45;
      const tx = wx(game.winner.x);
      const tz = wz(game.winner.y);
      camera.position.set(tx + Math.cos(endAngle) * 15, 9, tz + Math.sin(endAngle) * 15);
      camLook.set(tx, 1.6, tz);
      camera.lookAt(camLook);
    } else {
      const kPos = 1 - Math.exp(-4 * dt);
      const kLook = 1 - Math.exp(-5 * dt);
      camTarget.lerp(new THREE.Vector3(fx, 0, fz), kPos);
      camLook.lerp(new THREE.Vector3(fx, 1, fz - 1.5), kLook);
      const desired = new THREE.Vector3().copy(camTarget).add(CAM_OFF);
      if (introT >= 0 && introT < 1.4) {
        introT += Math.max(dt, wallDt);
        const e = clamp(introT / 1.4, 0, 1);
        const ease = 1 - Math.pow(1 - e, 3);
        camera.position.lerpVectors(introFrom, desired, ease);
        if (introT >= 1.4) introT = -1;
      } else {
        camera.position.lerp(desired, kPos);
      }
      // Camera shake from big hazards (engine shakeMag, in 2D units).
      if (game.shakeMag > 0.2) {
        const m = game.shakeMag * S * 1.6;
        camera.position.x += (Math.random() - 0.5) * m;
        camera.position.y += (Math.random() - 0.5) * m;
        camera.position.z += (Math.random() - 0.5) * m;
      }
      camera.lookAt(camLook);
    }

    if (!NO_GL) renderer.render(scene, camera);

    // --- Name tags (DOM, projected) ---------------------------------------------------------------
    for (const p of game.players) {
      const tag = tagFor(p);
      if (!p.alive || state === 'menu') {
        tag.el.style.display = 'none';
        continue;
      }
      const sp = toScreen(wx(p.x), 3.6, wz(p.y));
      if (!sp) {
        tag.el.style.display = 'none';
        continue;
      }
      tag.el.style.display = 'block';
      tag.el.style.transform = `translate(${sp.x.toFixed(1)}px, ${sp.y.toFixed(1)}px)`;
      tag.fill.style.width = `${Math.max(0, p.hp)}%`;
      tag.fill.style.background = p.hp > 50 ? '#4ade80' : p.hp > 25 ? '#facc15' : '#f87171';
    }

    // --- Damage floaters (DOM, projected) ----------------------------------------------------------
    const liveFloaters = new Set(game.floaters);
    for (const [f, el] of floaterEls) {
      if (!liveFloaters.has(f)) {
        el.remove();
        floaterEls.delete(f);
      }
    }
    for (const f of game.floaters) {
      if (!floaterEls.has(f)) {
        const el = document.createElement('div');
        el.className = 'floater';
        el.textContent = f.text;
        el.style.color = f.color;
        floaterLayer.appendChild(el);
        floaterEls.set(f, el);
      }
      const el = floaterEls.get(f);
      const rise = (0.9 - f.life) * 2.2;
      const sp = toScreen(wx(f.x), 3.8 + rise, wz(f.y));
      if (!sp) {
        el.style.display = 'none';
        continue;
      }
      el.style.display = 'block';
      el.style.transform = `translate(${sp.x.toFixed(1)}px, ${sp.y.toFixed(1)}px)`;
      el.style.opacity = String(Math.min(1, f.life * 2));
    }

    drawMinimap(game);
  }

  function getStats() {
    return {
      characters: chars.size,
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
    };
  }

  return { render, getStats, camera, scene };
}
