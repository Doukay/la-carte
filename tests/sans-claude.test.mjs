// Mise à jour sans Claude (sans-claude.mjs) : une carte rangée hors du projet, des parties tirées des dossiers quand
// personne n'a encore écrit architecture.json, « Récent » rempli par les commits Git, et une copie à partager.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { creerProjet, lireJson, ecrireJson, lib, DOSSIER_SKILL } from './aides.mjs';

const { architectureAuto } = await lib('architecture-auto.mjs');
const aNettoyer = [];
after(() => { for (const d of aNettoyer) fs.rmSync(d, { recursive: true, force: true }); });

const gitDans = (racine, ...args) => execFileSync('git', ['-C', racine, '-c', 'user.name=Essai', '-c', 'user.email=essai@exemple.test', ...args], { stdio: 'pipe' });
function projetAvecCommit() {
  const racine = creerProjet({
    'frontend/src/pages/Accueil.jsx': "import { lire } from '../api/client.js';\nexport default function Accueil() { return lire(); }\n",
    'frontend/src/api/client.js': "export const lire = () => fetch('/api/liste');\n",
    'backend/serveur.js': "// Le serveur de l'appli.\nconst app = require('express')();\napp.get('/api/liste', (req, res) => res.json([]));\n",
    'backend/stockage.js': 'module.exports = {};\n',
  }, { repos: ['.'] });
  aNettoyer.push(racine);
  gitDans(racine, 'add', '.');
  gitDans(racine, 'commit', '-q', '-m', 'Première version de la liste');
  return racine;
}
function dossierAilleurs() { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'la-carte-ailleurs-')); aNettoyer.push(d); return d; }
const sansClaude = (racine, dossier, ...reste) => execFileSync(process.execPath, [path.join(DOSSIER_SKILL, 'scripts', 'sans-claude.mjs'), racine, ...reste],
  { encoding: 'utf8', env: { ...process.env, LA_CARTE_DOSSIER: dossier }, stdio: 'pipe' });

test('sans Claude : la carte est rangée hors du projet, ses parties suivent les dossiers, « Récent » vient de Git', () => {
  const racine = projetAvecCommit(), dossier = dossierAilleurs();
  const sortie = sansClaude(racine, dossier, '--export', path.join(dossier, 'copie.html'));
  assert.match(sortie, /Carte à jour : 4 fichiers/);
  assert.equal(fs.existsSync(path.join(racine, 'la-carte')), false, 'rien n’est écrit dans le projet');
  assert.equal(gitDans(racine, 'status', '--porcelain').toString(), '');
  const archi = lireJson(path.join(dossier, 'sources', 'architecture.json'));
  assert.equal(archi.auto, true);
  assert.deepEqual(archi.nodes.map((n) => [n.id, n.kind]).sort(), [['backend', 'service'], ['frontend', 'ui']]);
  const g = lireJson(path.join(dossier, '.cache', 'graphe.json'));
  assert.equal(g.recent.tasks[0].title, 'Première version de la liste');
  assert.ok(g.recent.items.some((i) => i.id === 'f:backend/serveur.js' && i.change === 'new'));
  const copie = fs.readFileSync(path.join(dossier, 'copie.html'), 'utf8');
  assert.match(copie, /"exported":\{/);
  assert.doesNotMatch(copie, /"sante":/, 'pas de contrôle de santé dans la copie');
});

test('sans Claude : une deuxième fois, les descriptions écrites sont gardées et un nouveau fichier reçoit un nom par défaut', () => {
  const racine = projetAvecCommit(), dossier = dossierAilleurs();
  sansClaude(racine, dossier);
  ecrireJson(path.join(dossier, 'sources', 'descriptions', 'backend.json'), { files: { 'backend/serveur.js': { name: 'Serveur de la liste', description: 'Répond à la page.' } } });
  fs.writeFileSync(path.join(racine, 'backend', 'rappels.js'), 'module.exports = () => 1;\n');
  sansClaude(racine, dossier);
  const g = lireJson(path.join(dossier, '.cache', 'graphe.json'));
  assert.equal(g.files.find((f) => f.p === 'backend/serveur.js').name, 'Serveur de la liste');
  assert.equal(g.files.find((f) => f.p === 'backend/rappels.js').name, 'Rappels');
});

test('sans Claude : des sources recopiées sans construction précédente donnent une première carte', () => {
  const racine = projetAvecCommit(), dossier = dossierAilleurs();
  ecrireJson(path.join(dossier, 'sources', 'architecture.json'), { projet: { name: 'Liste' }, nodes: [{ id: 'tout', label: 'Tout le code', kind: 'feature', paths: ['frontend', 'backend'] }] });
  sansClaude(racine, dossier);
  const g = lireJson(path.join(dossier, '.cache', 'graphe.json'));
  assert.deepEqual(g.nodes.filter((n) => n.id !== 'unassigned').map((n) => n.id), ['tout']);
});

test('sans Claude : trop peu de code, pas de carte (code 3)', () => {
  const racine = creerProjet({ 'README.md': '# Notes\n', 'plan.f3d': 'x' });
  aNettoyer.push(racine);
  const dossier = dossierAilleurs();
  assert.throws(() => sansClaude(racine, dossier), (e) => e.status === 3);
});

test('recents --git ne remplace pas un travail récent écrit par Claude après le dernier commit', () => {
  const racine = projetAvecCommit(), dossier = dossierAilleurs();
  sansClaude(racine, dossier);
  const fichier = path.join(dossier, '.cache', 'travail-recent.json');
  ecrireJson(fichier, { updatedAt: new Date(Date.now() + 60000).toISOString(), tasks: [{ title: 'Demande de Thomas', items: [] }] });
  const sortie = execFileSync(process.execPath, [path.join(DOSSIER_SKILL, 'scripts', 'recents.mjs'), racine, '--git'], { encoding: 'utf8', env: { ...process.env, LA_CARTE_DOSSIER: dossier } });
  assert.match(sortie, /gardé/);
  assert.equal(lireJson(fichier).tasks[0].title, 'Demande de Thomas');
});

test('découpage automatique : le dossier qui porte l’essentiel est découpé, en traversant src/', () => {
  const fichiers = [];
  for (const sous of ['pages', 'composants', 'api']) for (let i = 0; i < 12; i++) fichiers.push({ path: `frontend/src/${sous}/f${i}.js`, category: 'code' });
  fichiers.push({ path: 'backend/a.py', category: 'code' }, { path: 'main.py', category: 'code' }, { path: 'README.md', category: 'docs' });
  const a = architectureAuto({ files: fichiers }, 'Essai');
  assert.deepEqual(a.nodes.map((n) => n.id), ['frontend', 'frontend.pages', 'frontend.composants', 'frontend.api', 'backend', 'racine']);
  assert.deepEqual(a.nodes.find((n) => n.id === 'frontend.api').paths, ['frontend/src/api']);
  assert.equal(a.nodes.find((n) => n.id === 'frontend.pages').kind, 'ui');
  assert.deepEqual(a.nodes.find((n) => n.id === 'racine').paths, ['main.py']);
});

test('une carte rangée à l’intérieur du dossier cartographié (même sous un autre nom) n’est pas lue comme du code', () => {
  const racine = projetAvecCommit();
  const autre = path.join(racine, 'cartes', 'AUTRE');
  sansClaude(racine, autre);   // une première carte, rangée dans le projet sous un nom quelconque
  const dossier = dossierAilleurs();
  sansClaude(racine, dossier);
  const g = lireJson(path.join(dossier, '.cache', 'graphe.json'));
  assert.deepEqual(g.files.filter((f) => f.p.startsWith('cartes/')).map((f) => f.p), []);
  assert.equal(g.files.length, 4);
});

test('LA_CARTE_DOSSIER vaut aussi pour les autres scripts', () => {
  const racine = projetAvecCommit(), dossier = dossierAilleurs();
  execFileSync(process.execPath, [path.join(DOSSIER_SKILL, 'scripts', 'analyser.mjs'), racine], { env: { ...process.env, LA_CARTE_DOSSIER: dossier }, stdio: 'pipe' });
  assert.ok(fs.existsSync(path.join(dossier, '.cache', 'analyse.json')));
  assert.equal(fs.existsSync(path.join(racine, 'la-carte')), false);
});
