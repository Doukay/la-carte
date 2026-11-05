// Le bouton Mettre à jour : il refait la carte sans Claude, demande le jeton, et la fraîcheur compte les fichiers modifiés depuis la dernière carte.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { creerProjet, ecrireJson, executer, lireGraphe, nettoyer } from './aides.mjs';

let racine, serveur, base, jeton;
const git = (...a) => execFileSync('git', ['-c', 'user.name=essai', '-c', 'user.email=essai@exemple.fr', ...a], { cwd: racine, stdio: 'pipe' });
const api = (p, options = {}) => fetch(base + p, { ...options, headers: { 'x-la-carte-token': jeton, ...(options.headers || {}) } });

before(async () => {
  racine = creerProjet({ 'package.json': '{}', 'src/a.js': "import { b } from './b.js';\nexport const a = b;\n", 'src/b.js': 'export const b = 1;\n' });
  git('init', '-q');
  executer('analyser.mjs', racine);
  ecrireJson(path.join(racine, 'la-carte', 'sources', 'architecture.json'), { projet: { name: 'E', summary: 'E.' }, nodes: [{ id: 'src', label: 'Code', kind: 'library', summary: 'Le code.', paths: ['src'] }] });
  executer('construire.mjs', racine);
  git('add', '-A');
  git('commit', '-qm', 'depart');
  executer('construire.mjs', racine);
  const port = 20000 + Math.floor(Math.random() * 20000);
  // aucun Claude disponible : la mise à jour doit marcher sans lui
  serveur = spawn(process.execPath, [path.join(racine, 'la-carte', '.cache', 'serveur.mjs'), '--port', String(port), '--no-open'], { cwd: racine, env: { ...process.env, LA_CARTE_CLAUDE: path.join(racine, 'no-such-cli'), LA_CARTE_NO_PROMPTS: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  base = await new Promise((resoudre, rejeter) => {
    let sortie = '';
    const minuteur = setTimeout(() => rejeter(new Error(`le serveur n’a pas démarré : ${sortie}`)), 20000);
    serveur.stdout.on('data', (d) => { sortie += d; const m = /la carte: (http:\/\/\S+)/.exec(sortie); if (m) { clearTimeout(minuteur); resoudre(m[1].replace(/\/$/, '')); } });
    serveur.on('exit', (code) => rejeter(new Error(`le serveur s’est arrêté (${code}) : ${sortie}`)));
  });
  jeton = /"token":"([0-9a-f]+)"/.exec(await (await fetch(base + '/')).text())?.[1];
});
after(async () => {
  if (serveur && serveur.exitCode === null) await new Promise((resoudre) => { serveur.once('exit', resoudre); serveur.kill(); });
  nettoyer(racine);
});

test('sans le jeton, ni la fraîcheur ni la mise à jour ne répondent', async () => {
  assert.equal((await fetch(base + '/api/fraicheur')).status, 403);
  assert.equal((await fetch(base + '/api/update', { method: 'POST' })).status, 403);
});

test('une carte à jour annonce zéro fichier modifié', async () => {
  assert.deepEqual(await (await api('/api/fraicheur')).json(), { suivi: true, fichiers: 0 });
});

test('casser le code est compté, et Mettre à jour le montre coupé, sans Claude', async () => {
  fs.rmSync(path.join(racine, 'src/b.js'));
  assert.equal((await (await api('/api/fraicheur')).json()).fichiers, 1);
  const r = await (await api('/api/update', { method: 'POST' })).json();
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.ok(lireGraphe(racine).links.some((l) => l.k === 'casse' && l.a === 'f:src/a.js' && l.labels.includes('./b.js')));
  assert.ok(lireGraphe(racine).nodes.some((n) => n.id === 'casse'));
});

test('réparer le code puis Mettre à jour retire la coupure', async () => {
  fs.writeFileSync(path.join(racine, 'src/b.js'), 'export const b = 1;\n');
  assert.equal((await (await api('/api/update', { method: 'POST' })).json()).ok, true);
  assert.ok(!lireGraphe(racine).links.some((l) => l.k === 'casse'));
  assert.ok(!lireGraphe(racine).nodes.some((n) => n.id === 'casse'));
});

test('une description survit à l’absence de son fichier : changer de branche ne coûte pas de jetons', async () => {
  const fiche = path.join(racine, 'la-carte', 'sources', 'descriptions', 'src.json');
  ecrireJson(fiche, { files: { 'src/b.js': { name: 'Le fichier b', description: 'Une phrase payée en jetons.' } } });
  assert.equal((await (await api('/api/update', { method: 'POST' })).json()).ok, true);
  const b = () => lireGraphe(racine).files.find((f) => f.p === 'src/b.js');
  assert.equal(b().name, 'Le fichier b');
  const texte = fs.readFileSync(path.join(racine, 'src/b.js'), 'utf8');
  fs.rmSync(path.join(racine, 'src/b.js'));
  assert.equal((await (await api('/api/update', { method: 'POST' })).json()).ok, true);
  assert.equal(b(), undefined);
  assert.ok(fs.readFileSync(fiche, 'utf8').includes('Une phrase payée en jetons.'));
  fs.writeFileSync(path.join(racine, 'src/b.js'), texte);
  assert.equal((await (await api('/api/update', { method: 'POST' })).json()).ok, true);
  assert.equal(b().name, 'Le fichier b');
  assert.ok(!b().auto);
});
