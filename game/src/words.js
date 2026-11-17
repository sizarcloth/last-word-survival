// LAST WORD — the twenty words. Each word is a hazard (or a blessing) that
// becomes real when the Wordsmith casts it. A cast hits everyone in the
// arena, caster included — except heal and shield, which help only the
// caster. tier: 'basic' (known from the start), 'unlock' (learned by
// surviving or from scrolls), 'strong' (the big unlocks).

export const WORDS = [
  { id: 'rain', name: 'RAIN', tier: 'basic', color: '#5aa2ff', damage: 0, duration: 6, killVerb: '', blurb: 'Cold rain slows everyone down.' },
  { id: 'wind', name: 'WIND', tier: 'basic', color: '#a8e6a1', damage: 0, duration: 5, killVerb: '', blurb: 'A gale shoves everyone sideways.' },
  { id: 'fire', name: 'FIRE', tier: 'basic', color: '#ff7a1a', damage: 12, duration: 8, killVerb: 'burned in the fire', blurb: 'Burning patches spread on the ground.' },
  { id: 'ice', name: 'ICE', tier: 'basic', color: '#aee9ff', damage: 0, duration: 6, killVerb: '', blurb: 'The ground turns to slick ice.' },
  { id: 'lightning', name: 'LIGHTNING', tier: 'basic', color: '#ffe14d', damage: 34, duration: 2, killVerb: 'was struck by lightning', blurb: 'Bolts strike random players.' },
  { id: 'flood', name: 'FLOOD', tier: 'unlock', color: '#2f7fd0', damage: 9, duration: 7, killVerb: 'drowned in the flood', blurb: 'Water rises from the edges.' },
  { id: 'poison', name: 'POISON', tier: 'unlock', color: '#7ddb3a', damage: 10, duration: 9, killVerb: 'choked on poison', blurb: 'Toxic clouds linger and sting.' },
  { id: 'night', name: 'NIGHT', tier: 'unlock', color: '#5a4d8f', damage: 0, duration: 7, killVerb: '', blurb: 'Darkness falls; vision shrinks.' },
  { id: 'heal', name: 'HEAL', tier: 'unlock', color: '#ff6fa5', damage: 0, duration: 0, killVerb: '', blurb: 'Mends the caster (+40 HP).' },
  { id: 'shield', name: 'SHIELD', tier: 'unlock', color: '#ffd94d', damage: 0, duration: 8, killVerb: '', blurb: 'A bubble guards the caster.' },
  { id: 'teleport', name: 'TELEPORT', tier: 'unlock', color: '#c77dff', damage: 0, duration: 0, killVerb: '', blurb: 'Everyone blinks somewhere new.' },
  { id: 'bomb', name: 'BOMB', tier: 'unlock', color: '#ff4444', damage: 45, duration: 3, killVerb: 'was blown up', blurb: 'A bomb lands, beeps, explodes.' },
  { id: 'bees', name: 'BEES', tier: 'unlock', color: '#ffcf3f', damage: 8, duration: 9, killVerb: 'was stung to death', blurb: 'An angry swarm hunts a player.' },
  { id: 'gravity', name: 'GRAVITY', tier: 'unlock', color: '#b8b0ff', damage: 0, duration: 6, killVerb: '', blurb: 'Moon gravity: fast and floaty.' },
  { id: 'vines', name: 'VINES', tier: 'unlock', color: '#3fae5a', damage: 6, duration: 6, killVerb: 'was strangled by vines', blurb: 'Roots snare players in place.' },
  { id: 'meteor', name: 'METEOR', tier: 'strong', color: '#ff9a3d', damage: 42, duration: 4, killVerb: 'was crushed by a meteor', blurb: 'Rocks rain from the sky.' },
  { id: 'volcano', name: 'VOLCANO', tier: 'strong', color: '#ff5722', damage: 16, duration: 9, killVerb: 'melted in the lava', blurb: 'Lava pools erupt and burn.' },
  { id: 'tornado', name: 'TORNADO', tier: 'strong', color: '#cfd8dc', damage: 22, duration: 8, killVerb: 'was thrown by the tornado', blurb: 'A vortex wanders the arena.' },
  { id: 'zombies', name: 'ZOMBIES', tier: 'strong', color: '#9ccc65', damage: 14, duration: 12, killVerb: 'was eaten by zombies', blurb: 'Shamblers rise and hunt.' },
  { id: 'earthquake', name: 'EARTHQUAKE', tier: 'strong', color: '#b08968', damage: 20, duration: 2, killVerb: 'was swallowed by the quake', blurb: 'The ground shakes and throws all.' },
];

export const BASIC_WORD_IDS = ['rain', 'wind', 'fire', 'ice', 'lightning'];

export function wordById(id) {
  return WORDS.find((w) => w.id === id) || null;
}

// Match free-typed text to a word: case-insensitive, trims, forgives a
// trailing 's' (METEORS) and a few common misspellings.
export function matchWord(text) {
  if (!text) return null;
  let t = text.toLowerCase().trim().replace(/[^a-z]/g, '');
  if (!t) return null;
  let hit = WORDS.find((w) => w.id === t);
  if (hit) return hit;
  if (t.endsWith('s')) hit = WORDS.find((w) => w.id === t.slice(0, -1));
  if (hit) return hit;
  const fixes = { meteors: 'meteor', thunder: 'lightning', bolt: 'lightning', quake: 'earthquake', lava: 'volcano', storm: 'rain', snow: 'ice', flame: 'fire', flames: 'fire', zombie: 'zombies', bee: 'bees', swarm: 'bees', dark: 'night', darkness: 'night', plant: 'vines', root: 'vines', roots: 'vines', water: 'flood', wave: 'flood', boom: 'bomb', explode: 'bomb', moon: 'gravity', float: 'gravity', fog: 'poison', gas: 'poison', cloud: 'poison', twister: 'tornado', cyclone: 'tornado' };
  return fixes[t] ? wordById(fixes[t]) : null;
}

// Pick a word the player does not know yet, preferring strong words only
// after round 4 so the early game stays readable.
export function randomUnknownWord(known, round, rng) {
  const pool = WORDS.filter((w) => !known.has(w.id));
  if (!pool.length) return null;
  const gated = round < 4 ? pool.filter((w) => w.tier !== 'strong') : pool;
  const list = gated.length ? gated : pool;
  return list[Math.floor(rng() * list.length)];
}
