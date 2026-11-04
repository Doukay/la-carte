// De bout en bout : cartographier une petite boutique à deux dépôts comme le fait le skill, puis vérifier la carte, le contrôle de
// santé, les promesses de confidentialité (hors ligne, aucune valeur de secret, rien de versé dans git) et une mise à jour.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { shopApp, scanAndBuild, run, readGraph, readJson, writeJson, routeKeys, openEndpoints, allFiles, cleanup, FAKE_PASSWORD } from './helpers.mjs';

let racine, graphe, sortie;
before(() => { racine = shopApp(); sortie = scanAndBuild(racine); graphe = readGraph(racine); });
after(() => cleanup(racine));

test('les deux dépôts sont trouvés et chaque fichier tombe dans une partie de la carte', () => {
  assert.deepEqual(graphe.meta.repos.map((r) => r.path).sort(), ['shop-api', 'shop-web']);
  assert.equal(graphe.meta.counts.unassigned, 0);
  assert.ok(graphe.files.some((f) => f.p === 'shop-web/src/App.jsx' && f.n === 'web'));
});

test('les adresses du serveur reçoivent le préfixe du routeur sous lequel elles sont montées', () => {
  assert.deepEqual(routeKeys(graphe), ['DELETE /admin/users/:id', 'GET /api/orders', 'POST /api/notes', 'POST /api/orders/:id/refund']);
});

test("les appels du site web sont associés aux adresses du serveur d’un dépôt à l’autre", () => {
  const http = graphe.links.filter((l) => l.k === 'http' && l.a === 'f:shop-web/src/api.js').map((l) => l.b);
  assert.ok(http.includes('f:shop-api/routes/orders.js'), JSON.stringify(graphe.links.filter((l) => l.k === 'http')));
  assert.ok(graphe.links.some((l) => l.k === 'import' && l.a === 'f:shop-web/src/App.jsx' && l.b === 'f:shop-web/src/api.js'));
});

test('la Santé ne signale que l’adresse du serveur sans contrôle de connexion, et le mot de passe écrit en dur', () => {
  // orders utilise requireAuth sur la route, admin est contrôlé là où il est monté, notes n’a rien
  assert.deepEqual(openEndpoints(graphe), ['POST /api/notes']);
  const secret = graphe.sante.problemes.find((i) => i.kind === 'secret');
  assert.ok(secret, 'le mot de passe de config.js est signalé');
  assert.deepEqual(secret.locations, [{ file: 'shop-api/config.js', line: 1 }]);
});

test('la valeur du secret n’est écrite nulle part où Floorplan écrit, ni affichée', () => {
  assert.ok(!sortie.includes(FAKE_PASSWORD), 'sortie du scan et de la construction');
  for (const f of allFiles(path.join(racine, 'floorplan'))) assert.ok(!f.text.includes(FAKE_PASSWORD), path.relative(racine, f.path));
});

test('la carte ne fait aucun appel extérieur : scripts, styles et polices sont tous dans le fichier', () => {
  const html = fs.readFileSync(path.join(racine, 'floorplan', 'index.html'), 'utf8');
  assert.doesNotMatch(html, /<script[^>]*\ssrc\s*=\s*["']?(https?:)?\/\//i);
  assert.doesNotMatch(html, /<link[^>]*\shref\s*=\s*["']?(https?:)?\/\//i);
  assert.doesNotMatch(html, /url\(\s*["']?(https?:)?\/\//i);
  assert.doesNotMatch(html, /@import/);
  assert.match(html, /@font-face\{font-family:"Inter"/);
});

test('rien de ce que Floorplan fabrique n’est versé dans git : floorplan/ s’ignore lui-même', () => {
  assert.equal(fs.readFileSync(path.join(racine, 'floorplan', '.gitignore'), 'utf8').trim().split('\n').pop(), '*');
});

test('query.mjs trouve des éléments de la carte avec des mots simples', () => {
  const trouve = JSON.parse(execFileSync(process.execPath, [path.join(racine, 'floorplan', 'query.mjs'), 'find', 'refund'], { encoding: 'utf8' }));
  const ids = JSON.stringify(trouve);
  assert.ok(ids.includes('r:'), `une adresse du serveur est trouvée : ${ids.slice(0, 300)}`);
});

test('une mise à jour reporte les descriptions sur un fichier renommé', () => {
  const fichierDescriptions = path.join(racine, 'floorplan', 'descriptions', 'api.json');
  const description = { name: 'Customer notes', description: 'Saves a note a customer leaves.' };
  writeJson(fichierDescriptions, { files: { 'shop-api/routes/notes.js': description } });
  fs.renameSync(path.join(racine, 'shop-api/routes/notes.js'), path.join(racine, 'shop-api/routes/feedback.js'));
  const serveur = path.join(racine, 'shop-api/server.js');
  fs.writeFileSync(serveur, fs.readFileSync(serveur, 'utf8').replaceAll('notes', 'feedback'));
  run('refresh.mjs', racine);
  const fichiers = readJson(fichierDescriptions).files;
  assert.deepEqual(fichiers['shop-api/routes/feedback.js'], description);
  assert.equal(fichiers['shop-api/routes/notes.js'], undefined);
  assert.equal(readGraph(racine).files.find((f) => f.p === 'shop-api/routes/feedback.js').name, 'Customer notes');
});
