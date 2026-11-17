// LAST WORD — hand-in program for make.fun best-game-01.
//
// This program runs in the grader's sandbox (Node 22, standard library
// only, no network). It stages the entry into the output directory:
//   1. copy game/ (the playable static game) and screenshots/ there
//   2. write dossier.json with the kit's vendored library
// Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Play the game locally with: node serve.ts  (then http://localhost:8080)

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// Gate caps from the competition (reference/gate.json): the dossier text
// cap shapes the bytes; the rest refuse an entry the scorer would refuse.
const GATE = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
} as const;

function repoRoot(): string {
  return fileURLToPath(new URL('.', import.meta.url));
}

function outputDir(): string {
  return process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
}

function stageFolder(root: string, out: string, name: string): void {
  const source = join(root, name);
  if (!existsSync(source)) return;
  mkdirSync(join(out, name), { recursive: true });
  cpSync(source, join(out, name), { recursive: true });
}

function handIn(): void {
  const root = repoRoot();
  const out = outputDir();
  mkdirSync(out, { recursive: true });
  stageFolder(root, out, 'game');
  stageFolder(root, out, 'screenshots');
  const dossier = buildDossier(out, GATE);
  writeFileSync(join(out, 'dossier.json'), dossier);
}

handIn();
