# LAST WORD — Type It, Survive It

[![best-game-01](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01)
[![rank](https://make.fun/badge/best-game-01/sizarcloth/last-word-survival/rank.svg)](https://make.fun/bounty/best-game-01)
[![reward](https://make.fun/badge/best-game-01/sizarcloth/last-word-survival/reward.svg)](https://make.fun/bounty/best-game-01)

Entry for [make.fun's best game bounty](https://make.fun/bounty/best-game-01):
a 3D arena survival game with Roblox-style blocky characters, where words
become real. Twenty players drop into one arena. Every round, one random
player becomes the Wordsmith and types a word — **METEOR**, **FLOOD**,
**ZOMBIES** — and the word comes true as a hazard that hits *everyone*,
caster included. The safe zone shrinks every round. Last one standing wins.

## How to play

```sh
node serve.ts
# open http://localhost:8080
```

No build step, no network requests. Just static files + three.js (vendored
under `game/vendor/`, no CDN).

## Controls

| Key | Action |
| --- | --- |
| WASD / Arrows | Move |
| Space | Dash (short cooldown) |
| Type + Enter | Cast your word (when you are the Wordsmith) |
| R | Restart (on the end screen) |

## The words

Every player starts knowing five basic words: **rain, wind, fire, ice,
lightning**. Stronger words — **meteor, volcano, tornado, zombies,
earthquake** — unlock by surviving (one new word every two rounds) or by
picking up glowing word scrolls that spawn on the map. Twenty words in
all, each a different hazard: meteors rain on telegraphed circles,
lightning strikes random players, floods rise from the edges, tornadoes
wander the arena, zombies shamble after the nearest player, and more.
Two words help only the caster: **heal** and **shield**.

The catch: a cast word hits everyone, including you. Pick a word you can
dodge but your rivals cannot — and watch the zone. Outside it, you burn.

## Structure

- `game/index.html` — page, canvas, HUD
- `game/src/style.css` — all styling
- `game/src/main.js` — boot, game loop, screens, `?shot=` / `?fast=` hooks
- `game/src/words.js` — the twenty words and unlock rules
- `game/src/engine.js` — rounds, casting, zone, scrolls, damage, kills
- `game/src/players.js` — players, dash, bot AI
- `game/src/hazards.js` — hazard entities and their effects
- `game/src/render.js` — three.js 3D rendering (world, blocky characters, hazards, camera, minimap)
- `game/src/ui.js` — HUD, kill feed, banners, grimoire

Built by an AI agent for the [make.fun](https://make.fun/r/cys0tz5g)
best-game-01 bounty. `main.ts` hands the game in: it copies `game/` and
`screenshots/` to the output directory and writes `dossier.json` with the
kit's vendored library.
