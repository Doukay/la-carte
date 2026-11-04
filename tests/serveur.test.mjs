// Le serveur local de la carte : il n’écoute que sur cette machine, et son API ne répond qu’à la page de la carte
// qu’il a servie (un jeton propre à chaque démarrage, de la même origine), donc d’autres sites web ne peuvent pas s’en servir.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { appliBoutique, analyserEtConstruire, nettoyer } from './aides.mjs';

let racine, serveur, base, jeton;
before(async () => {
  racine = appliBoutique();
  analyserEtConstruire(racine);
  const port = 20000 + Math.floor(Math.random() * 20000);
  // ni CLI de Claude Code ni de Codex : ce test n’exerce que le serveur lui-même
  serveur = spawn(process.execPath, [path.join(racine, 'floorplan', 'serveur.mjs'), '--port', String(port), '--no-open'], {
    cwd: racine, env: { ...process.env, FLOORPLAN_CLAUDE: path.join(racine, 'no-such-cli'), FLOORPLAN_CODEX: path.join(racine, 'no-such-cli'), FLOORPLAN_NO_PROMPTS: '1' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  base = await new Promise((resoudre, rejeter) => {
    let sortie = '';
    const minuteur = setTimeout(() => rejeter(new Error(`le serveur n’a pas démarré : ${sortie}`)), 20000);
    serveur.stdout.on('data', (d) => { sortie += d; const m = /Floorplan: (http:\/\/\S+)/.exec(sortie); if (m) { clearTimeout(minuteur); resoudre(m[1]); } });
    serveur.on('exit', (code) => rejeter(new Error(`le serveur s’est arrêté (${code}) : ${sortie}`)));
  });
  jeton = /"token":"([0-9a-f]+)"/.exec(await (await fetch(base + '/')).text())?.[1];
});
after(async () => {
  // attendre d’abord l’arrêt du serveur : sous Windows, son dossier de travail ne peut pas être supprimé tant qu’il tourne
  if (serveur && serveur.exitCode === null) await new Promise((resoudre) => { serveur.once('exit', resoudre); serveur.kill(); });
  nettoyer(racine);
});

const appelerApi = (p, { headers: entetes = {}, ...options } = {}) => fetch(base + p, { ...options, headers: { 'content-type': 'application/json', ...entetes } });

test('il n’écoute que sur 127.0.0.1', () => {
  assert.match(base, /^http:\/\/127\.0\.0\.1:\d+$/);
});

test('la page qu’il sert porte un jeton neuf', () => {
  assert.match(jeton || '', /^[0-9a-f]{32}$/);
});

test('les appels à l’API sans le jeton sont refusés', async () => {
  assert.equal((await appelerApi('/api/flows')).status, 403);
  assert.equal((await appelerApi('/api/ask', { method: 'POST', body: '{"question":"hi"}' })).status, 403);
  assert.equal((await appelerApi('/api/flows', { headers: { 'x-floorplan-token': 'wrong' } })).status, 403);
});

test('les appels à l’API avec le jeton, venant d’un autre site web, sont refusés', async () => {
  const r = await appelerApi('/api/flows', { headers: { 'x-floorplan-token': jeton, origin: 'https://evil.example' } });
  assert.equal(r.status, 403);
});

/** Un appel au serveur sous un autre nom d’hôte, comme en enverrait un site qui redirige son domaine vers 127.0.0.1. */
const sousHote = (hote, p) => new Promise((resoudre, rejeter) => {
  const u = new URL(base + p);
  http.get({ hostname: u.hostname, port: u.port, path: u.pathname, headers: { host: hote, 'x-floorplan-token': jeton } }, (r) => { r.resume(); resoudre(r.statusCode); }).on('error', rejeter);
});

test('les appels sous tout autre nom d’hôte sont refusés, page comprise (DNS rebinding)', async () => {
  const port = new URL(base).port;
  assert.equal(await sousHote(`evil.example:${port}`, '/'), 403);
  assert.equal(await sousHote(`evil.example:${port}`, '/api/flows'), 403);
  assert.equal(await sousHote('127.0.0.1:1', '/'), 403);
  assert.equal(await sousHote(`localhost:${port}`, '/'), 200);
  assert.equal(await sousHote(`127.0.0.1:${port}`, '/api/flows'), 200);
});

test('les appels à l’API avec le jeton venant de la carte elle-même marchent', async () => {
  const r = await appelerApi('/api/flows', { headers: { 'x-floorplan-token': jeton } });
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { parcours: [] });
});

test('les fichiers hors du dossier de la carte ne sont jamais servis', async () => {
  // y compris un dossier voisin dont le nom commence par « floorplan »
  fs.mkdirSync(path.join(racine, 'floorplan-old'));
  fs.writeFileSync(path.join(racine, 'floorplan-old', 'notes.txt'), 'private notes');
  for (const p of ['/../shop-api/config.js', '/%2e%2e/shop-api/config.js', '/..%2fshop-api%2fconfig.js', '/..%2ffloorplan-old%2fnotes.txt']) {
    const r = await fetch(base + p);
    const corps = await r.text();
    assert.ok(!corps.includes('DB_PASSWORD') && !corps.includes('private notes'), `${p} -> ${r.status}`);
  }
});

test('une adresse mal formée donne une erreur, et le serveur continue de tourner', async () => {
  assert.equal((await fetch(base + '/%E0%A4%A')).status, 400);
  assert.equal((await fetch(base + '/')).status, 200);
});
