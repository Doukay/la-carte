// Claude Code et Codex : le skill remarque lequel le lance, et la carte s’en souvient, pour que sa bulle de questions
// et ses demandes « Corriger avec … » nomment le bon. Aucun des deux n’écrit de note CLAUDE.local.md (fonction retirée).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { lib, shopApp, run, readGraph, readJson, cleanup } from './helpers.mjs';

const { detecterAgent } = await lib('agent.mjs');

test('Codex est reconnu aux variables qu’il définit pour chaque commande', () => {
  assert.equal(detecterAgent({}, { CODEX_THREAD_ID: 'abc' }), 'codex');
  assert.equal(detecterAgent({}, { CODEX_SESSION_ID: 'abc' }), 'codex');
  assert.equal(detecterAgent({}, {}), 'claude');
  assert.equal(detecterAgent({}, { CLAUDECODE: '1' }), 'claude');
});

test('--agent et FLOORPLAN_AGENT l’emportent sur la devinette, et les valeurs absurdes sont ignorées', () => {
  assert.equal(detecterAgent({ agent: 'codex' }, {}), 'codex');
  assert.equal(detecterAgent({ agent: 'Claude' }, { CODEX_THREAD_ID: 'abc' }), 'claude');
  assert.equal(detecterAgent({}, { FLOORPLAN_AGENT: 'codex' }), 'codex');
  assert.equal(detecterAgent({ agent: 'gpt' }, { CODEX_THREAD_ID: 'abc' }), 'codex');
});

test('une carte construite sous Codex le note, et laisse les notes du projet tranquilles', () => {
  const racine = shopApp();
  try {
    run('scan.mjs', racine);
    const sortie = run('build.mjs', racine, '--agent', 'codex');
    assert.equal(readGraph(racine).meta.agent, 'codex');
    assert.match(sortie, /AGENT {2}Codex/);
    assert.ok(!fs.existsSync(path.join(racine, 'CLAUDE.local.md')), 'pas de CLAUDE.local.md');
    assert.ok(!fs.existsSync(path.join(racine, 'AGENTS.md')), 'pas d’AGENTS.md');
  } finally { cleanup(racine); }
});

test('une carte construite sous Claude Code le note, et n’écrit jamais de notes du projet', () => {
  const racine = shopApp();
  const notes = path.join(racine, 'CLAUDE.local.md');
  try {
    run('scan.mjs', racine);
    const sortie = run('build.mjs', racine, '--agent', 'claude', '--claude-md');
    assert.equal(readGraph(racine).meta.agent, 'claude');
    assert.doesNotMatch(sortie, /CLAUDE\.LOCAL\.MD/);
    assert.ok(!fs.existsSync(notes), 'pas de CLAUDE.local.md, même quand on le demande');
  } finally { cleanup(racine); }
});

test('la copie pour l’appli Claude dit toujours Claude, quel que soit celui qui a construit la carte', () => {
  const racine = shopApp();
  try {
    run('scan.mjs', racine);
    run('build.mjs', racine, '--agent', 'codex', '--artifact', '--no-claude-md');
    const html = fs.readFileSync(path.join(racine, 'floorplan', 'artifact.html'), 'utf8');
    assert.match(html, /"agent":"claude"/);
    assert.equal(readJson(path.join(racine, 'floorplan', 'graph.json')).meta.agent, 'codex');
  } finally { cleanup(racine); }
});
