// LAST WORD — DOM HUD: top bar (round, alive, timer, HP), the grimoire
// panel of known words, the kill feed, the round banner, the cast box, and
// the start / spectate / end overlays. The canvas draws the world; this
// file draws everything around it.

import { WORDS } from './words.js';
import { drawCastRow } from './render.js';

export class UI {
  constructor(doc) {
    this.doc = doc;
    this.el = {};
    const ids = ['topbar', 'roundLabel', 'aliveLabel', 'timerLabel', 'hpBar', 'hpText',
      'grimoire', 'wordList', 'feed', 'feedList', 'banner', 'bannerTitle', 'bannerSub',
      'castbox', 'castLabel', 'wordInput', 'castTimer', 'spectateChip', 'spectateText',
      'startScreen', 'startBtn', 'endScreen', 'endTitle', 'endSub', 'endStats', 'restartBtn',
      'wordPreview', 'castCanvas', 'elimToast'];
    for (const id of ids) this.el[id] = doc.getElementById(id);
    this.bannerTimer = null;
    this.elimTimer = null;
    this.game = null;
    // Fill the start screen's word preview.
    if (this.el.wordPreview) {
      this.el.wordPreview.textContent = WORDS.map((w) => w.name).join('  ·  ');
    }
  }

  bind(game) {
    this.game = game;
  }

  onStart(cb) {
    this.el.startBtn.addEventListener('click', cb);
  }

  onRestart(cb) {
    this.el.restartBtn.addEventListener('click', cb);
  }

  showStart() {
    this.el.startScreen.classList.remove('hidden');
    this.el.endScreen.classList.add('hidden');
    this.el.topbar.classList.add('hidden');
    this.el.grimoire.classList.add('hidden');
    this.el.feed.classList.add('hidden');
    this.el.castbox.classList.add('hidden');
    this.el.spectateChip.classList.add('hidden');
    // Paint the cast portraits on the start screen.
    if (this.el.castCanvas && this.game && this.game.players.length) {
      drawCastRow(this.el.castCanvas, this.game.players);
    }
  }

  showPlaying() {
    this.el.startScreen.classList.add('hidden');
    this.el.endScreen.classList.add('hidden');
    this.el.topbar.classList.remove('hidden');
    this.el.grimoire.classList.remove('hidden');
    this.el.feed.classList.remove('hidden');
  }

  updateHUD() {
    const g = this.game;
    if (!g || g.state !== 'playing') return;
    this.el.roundLabel.textContent = `ROUND ${g.round}`;
    this.el.aliveLabel.textContent = `${g.aliveCount()} ALIVE`;
    this.el.timerLabel.textContent = `${Math.max(0, Math.ceil(g.roundT))}s`;
    const hp = g.human ? Math.max(0, Math.round(g.human.hp)) : 0;
    this.el.hpBar.style.width = `${hp}%`;
    this.el.hpBar.style.background = hp > 50 ? '#4ade80' : hp > 25 ? '#facc15' : '#f87171';
    this.el.hpText.textContent = `HP ${hp}`;
  }

  updateGrimoire() {
    const g = this.game;
    if (!g || !g.human) return;
    const list = this.el.wordList;
    list.innerHTML = '';
    const known = [...g.human.known];
    known.sort((a, b) => {
      const wa = WORDS.find((w) => w.id === a);
      const wb = WORDS.find((w) => w.id === b);
      const rank = { basic: 0, unlock: 1, strong: 2 };
      return rank[wa.tier] - rank[wb.tier] || wa.name.localeCompare(wb.name);
    });
    for (const id of known) {
      const w = WORDS.find((x) => x.id === id);
      const chip = this.doc.createElement('span');
      chip.className = `word-chip tier-${w.tier}`;
      chip.textContent = w.name;
      chip.title = w.blurb;
      list.appendChild(chip);
    }
    const count = this.doc.createElement('div');
    count.className = 'word-count';
    count.textContent = `${known.length} / ${WORDS.length} words known`;
    list.appendChild(count);
  }

  feed(text, cls = '') {
    const item = this.doc.createElement('div');
    item.className = `feed-item ${cls}`;
    item.textContent = text;
    const list = this.el.feedList;
    list.prepend(item);
    while (list.children.length > 6) list.removeChild(list.lastChild);
  }

  clearFeed() {
    this.el.feedList.innerHTML = '';
  }

  // Elimination announcement: a quick toast when anyone bursts into blocks.
  eliminate(name) {
    const t = this.el.elimToast;
    if (!t) return;
    t.textContent = `💥 ${name} ELIMINATED`;
    t.classList.remove('hidden');
    t.classList.remove('pop');
    void t.offsetWidth; // restart the pop animation
    t.classList.add('pop');
    if (this.elimTimer) clearTimeout(this.elimTimer);
    this.elimTimer = setTimeout(() => t.classList.add('hidden'), 1600);
  }

  banner(title, sub = '') {
    this.el.bannerTitle.textContent = title;
    this.el.bannerSub.textContent = sub;
    const b = this.el.banner;
    b.classList.remove('hidden');
    b.classList.remove('pop');
    void b.offsetWidth; // restart the pop animation
    b.classList.add('pop');
    if (this.bannerTimer) clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => b.classList.add('hidden'), 2400);
  }

  castPrompt(on, secs) {
    const box = this.el.castbox;
    if (on) {
      box.classList.remove('hidden');
      this.el.castLabel.textContent = 'YOU ARE THE WORDSMITH — type a word!';
      this.el.castTimer.textContent = `${Math.ceil(secs)}s`;
      this.el.wordInput.value = '';
      this.el.wordInput.disabled = false;
      setTimeout(() => this.el.wordInput.focus(), 30);
    } else {
      box.classList.add('hidden');
      this.el.wordInput.disabled = true;
    }
  }

  castTick(secs) {
    this.el.castTimer.textContent = `${Math.ceil(secs)}s`;
  }

  spectate(place) {
    this.el.spectateText.textContent = `SPECTATING — You placed #${place} of 20`;
    this.el.spectateChip.classList.remove('hidden');
  }

  showEnd(winner, stats) {
    const humanWon = winner && winner.isHuman;
    this.el.endTitle.textContent = humanWon ? 'YOU WIN!' : winner ? `${winner.name} WINS` : 'NO ONE SURVIVED';
    this.el.endTitle.className = humanWon ? 'win' : 'lose';
    this.el.endSub.textContent = humanWon
      ? 'The last word was yours.'
      : stats.humanPlace
        ? `You placed #${stats.humanPlace} of 20.`
        : 'The arena has spoken.';
    const rows = [];
    if (winner) {
      rows.push(['Winner', winner.name]);
      rows.push(['Rounds survived', String(winner.roundsSurvived)]);
      rows.push(['Words cast', String(winner.wordsCast)]);
      rows.push(['Kills', String(winner.kills)]);
    }
    rows.push(['Match rounds', String(stats.rounds)]);
    rows.push(['Your kills', String(stats.humanKills)]);
    rows.push(['Your words cast', String(stats.humanWords)]);
    this.el.endStats.innerHTML = rows.map(([k, v]) => `<div class="stat"><span>${k}</span><b>${v}</b></div>`).join('');
    this.el.endScreen.classList.remove('hidden');
    this.el.castbox.classList.add('hidden');
  }
}
