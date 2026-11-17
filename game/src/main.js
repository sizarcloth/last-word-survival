// LAST WORD — boot, game loop, input, and the ?shot= / ?fast= hooks.
// ?fast=1 shortens round timers (for playtesting). ?shot=start|play|cast|end
// stages a deterministic scene (with ?seed=) and sets window.__shotReady
// when it is ready to screenshot. window.__game exposes the match for tests.

import { Game, mulberry32 } from './engine.js';
import { drawGame } from './render.js';
import { UI } from './ui.js';
import { matchWord, wordById } from './words.js';
import { makePlayers } from './players.js';
import { spawnWordHazard } from './hazards.js';

const params = new URLSearchParams(window.location.search);
const FAST = params.get('fast') === '1';
const SHOT = params.get('shot') || '';
const SEED = Number(params.get('seed')) || 7;

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const ui = new UI(document);

const hooks = {
  onBanner: (t, s) => ui.banner(t, s),
  onFeed: (t, c) => ui.feed(t, c),
  onGrimoire: () => ui.updateGrimoire(),
  onCastPrompt: (on, secs) => ui.castPrompt(on, secs),
  onCastTick: (secs) => ui.castTick(secs),
  onSpectate: (place) => ui.spectate(place),
  onEnd: (winner, stats) => ui.showEnd(winner, stats),
};

const game = new Game(hooks, { fast: FAST });
ui.bind(game);
window.__game = game;
window.__shotReady = false;

// --- Menu backdrop: a quiet arena with all twenty players placed. ---------
function seedBackdrop() {
  game.reset(SEED);
  game.players = makePlayers(game.arena, game.rng);
  game.human = game.players[0];
  game.state = 'menu';
}
seedBackdrop();
ui.showStart();

// --- Input -----------------------------------------------------------------
const keys = new Set();
const MOVE_KEYS = {
  KeyW: [0, -1], ArrowUp: [0, -1],
  KeyS: [0, 1], ArrowDown: [0, 1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0],
  KeyD: [1, 0], ArrowRight: [1, 0],
};

function typing() {
  return document.activeElement === ui.el.wordInput;
}

window.addEventListener('keydown', (e) => {
  if (typing()) {
    // The input's own listener handles Enter (submit); Escape just blurs.
    if (e.key === 'Escape') ui.el.wordInput.blur();
    return;
  }
  if (e.code === 'Space') {
    e.preventDefault();
    game.humanDash();
    return;
  }
  if (e.code === 'KeyR' && game.state === 'ended') {
    startMatch();
    return;
  }
  if (MOVE_KEYS[e.code]) {
    e.preventDefault();
    keys.add(e.code);
  }
});

window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

function readMoveInput() {
  let x = 0;
  let y = 0;
  for (const code of keys) {
    const d = MOVE_KEYS[code];
    if (d) { x += d[0]; y += d[1]; }
  }
  const len = Math.hypot(x, y);
  if (len > 1) { x /= len; y /= len; }
  return { x, y };
}

function submitWord() {
  const input = ui.el.wordInput;
  const text = input.value;
  if (!text.trim()) return;
  const word = matchWord(text);
  if (!word) {
    ui.feed(`"${text.trim()}" is not a word the arena knows`, 'warn');
    input.select();
    return;
  }
  if (!game.human.known.has(word.id)) {
    ui.feed(`You have not learned ${word.name} yet`, 'warn');
    input.select();
    return;
  }
  const cast = game.cast(word.id, game.human);
  if (cast) input.value = '';
  else input.select();
}

ui.el.wordInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    submitWord();
  }
});

// --- Start / restart -------------------------------------------------------
function startMatch() {
  const seed = (Date.now() % 2147483647) || 1;
  ui.clearFeed();
  ui.el.spectateChip.classList.add('hidden');
  game.start(seed);
  ui.showPlaying();
  ui.updateGrimoire();
  ui.updateHUD();
  if (document.activeElement) document.activeElement.blur();
}

ui.onStart(startMatch);
ui.onRestart(startMatch);

// --- Shot scenes (deterministic, for screenshots) --------------------------
function step(seconds, dt = 1 / 30) {
  const n = Math.ceil(seconds / dt);
  for (let i = 0; i < n && game.state === 'playing'; i++) game.update(dt);
}

function setupShot() {
  if (SHOT === 'start') {
    window.__shotReady = true;
    return;
  }
  if (SHOT === 'play') {
    game.start(SEED);
    ui.showPlaying();
    ui.updateGrimoire();
    step(26); // two rounds of natural play
    // Guarantee a meteor storm is mid-flight for the shot.
    const caster = game.alivePlayers().find((p) => !p.isHuman) || game.human;
    spawnWordHazard(game, wordById('meteor'), caster);
    game.hooks.onBanner('METEOR', `cast by ${caster.name}`);
    step(0.45);
    window.__shotReady = true;
    return;
  }
  if (SHOT === 'cast') {
    game.start(SEED);
    ui.showPlaying();
    ui.updateGrimoire();
    // Force the human to be this round's Wordsmith with METEOR typed.
    game.wordsmith = game.human;
    game.castPhase = { timeLeft: 9, cast: false, botDelay: 0 };
    game.hooks.onBanner(`ROUND ${game.round}`, 'Wordsmith: YOU');
    ui.castPrompt(true, 9);
    ui.el.wordInput.value = 'METEOR';
    window.__shotReady = true;
    return;
  }
  if (SHOT === 'end') {
    // Run a whole fast match to its natural end, then show the winner.
    game.fast = true;
    game.roundLen = 6;
    game.castWindow = 3;
    game.start(SEED);
    ui.showPlaying();
    ui.updateGrimoire();
    let guard = 0;
    while (game.state === 'playing' && guard < 20000) {
      game.update(1 / 30);
      guard += 1;
    }
    if (game.state === 'playing') {
      // Extremely defensive: force the end if the sim ever stalls.
      for (const p of game.players) {
        if (p !== game.human && p.alive) game.killPlayer(p, null, game.human);
      }
    }
    window.__shotReady = true;
  }
}

// --- Main loop -------------------------------------------------------------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (game.state === 'playing') {
    const mv = readMoveInput();
    game.setHumanInput(mv.x, mv.y);
    game.update(dt);
    ui.updateHUD();
  }
  drawGame(ctx, game);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

if (SHOT) setupShot();
