// Exporter une copie de la carte à partager : serve.mjs --export et le bouton Exporter de la carte (POST /api/export)
// écrivent la même page autonome, marquée comme exportée, sans les détails de cet ordinateur ni le
// jeton du serveur, et avec seulement les options demandées. La santé et le travail récent sont omis sauf demande.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { shopApp, run, readJson, writeJson, cleanup, FAKE_PASSWORD } from './helpers.mjs';

const JETON_DANS_REMOTE = 'ghp-not-a-real-token-1234';
let racine, serveur, base, jeton;
const serveurJs = () => path.join(racine, 'floorplan', 'serve.mjs');
/** Le graphe contenu dans une page exportée. */
const donneesDe = (html) => JSON.parse(/<script>window\.FLOORPLAN = (.*?);<\/script>/s.exec(html)[1]);
/** Lance serve.mjs --export avec ces paramètres ; renvoie la page exportée et ce qui a été affiché. */
function exporterCli(...parametres) {
  const sortie = execFileSync(process.execPath, [serveurJs(), '--export', ...parametres], { cwd: racine, encoding: 'utf8' });
  const fichier = /Carte exportée vers (.+)/.exec(sortie)[1].trim();
  return { out: sortie, html: fs.readFileSync(fichier, 'utf8'), file: fichier };
}

before(async () => {
  racine = shopApp();
  execFileSync('git', ['-C', path.join(racine, 'shop-api'), 'remote', 'add', 'origin', `https://someone:${JETON_DANS_REMOTE}@example.com/shop-api.git`]);
  const archi = readJson(path.join(racine, 'floorplan', 'architecture.json'));
  writeJson(path.join(racine, 'floorplan', 'architecture.json'), {
    ...archi,
    annotations: [{ path: 'shop-api/config.js', note: 'Moving to the secrets manager next sprint.' }],
    parcours: [{ id: 'refund', title: 'Refund', description: 'A customer asks for a refund.', steps: [{ node: 'web', note: 'The website asks.' }, { node: 'api', note: 'The server refunds.' }] }],
  });
  writeJson(path.join(racine, 'floorplan', 'recent-work.json'), { tasks: [{ title: 'Refunds', summary: 'Added refunds.', items: [{ ref: 'shop-api/routes/orders.js', change: 'changed', note: 'Refund endpoint.' }] }] });
  run('scan.mjs', racine);
  run('build.mjs', racine, '--no-claude-md');

  const port = 20000 + Math.floor(Math.random() * 20000);
  serveur = spawn(process.execPath, [serveurJs(), '--port', String(port), '--no-open'], {
    cwd: racine, env: { ...process.env, FLOORPLAN_CLAUDE: path.join(racine, 'no-such-cli'), FLOORPLAN_CODEX: path.join(racine, 'no-such-cli'), FLOORPLAN_NO_PROMPTS: '1' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  base = await new Promise((resoudre, rejeter) => {
    let sortie = '';
    const minuteur = setTimeout(() => rejeter(new Error(`le serveur n’a pas démarré : ${sortie}`)), 20000);
    serveur.stdout.on('data', (d) => { sortie += d; const m = /Floorplan: (http:\/\/\S+)/.exec(sortie); if (m) { clearTimeout(minuteur); resoudre(m[1]); } });
    serveur.on('exit', (code) => rejeter(new Error(`le serveur s’est arrêté (${code}) : ${sortie}`)));
  });
  jeton = /"token":"([0-9a-f]+)"/.exec(await (await fetch(base + '/')).text())[1];
});
after(async () => {
  if (serveur && serveur.exitCode === null) await new Promise((resoudre) => { serveur.once('exit', resoudre); serveur.kill(); });
  cleanup(racine);
});

test('la carte a une santé, un travail récent, une note, un parcours et un dépôt distant à laisser de côté', () => {
  const g = donneesDe(fs.readFileSync(path.join(racine, 'floorplan', 'index.html'), 'utf8'));
  assert.ok(g.sante.problemes.length > 0);
  assert.equal(g.recent.items.length, 1);
  assert.ok(g.files.some((f) => f.note));
  assert.equal(g.parcours.length, 1);
  assert.ok(g.meta.root);
});

test('par défaut l’export garde les parcours et les notes, et laisse de côté la santé, le travail récent et cet ordinateur', () => {
  const { html, file: fichier, out: sortie } = exporterCli();
  assert.equal(path.basename(fichier), 'shop-map.html');
  assert.equal(path.dirname(fichier), path.join(fs.realpathSync(racine), 'floorplan'));
  const g = donneesDe(html);
  assert.match(g.meta.exported.at, /^\d{4}-\d\d-\d\dT/);
  assert.deepEqual(g.meta.exported.include, ['flows', 'notes']);
  assert.equal(g.sante, undefined);
  assert.equal(g.recent, undefined);
  assert.equal(g.parcours.length, 1);
  assert.ok(g.files.some((f) => f.note));
  assert.equal(g.meta.root, null);
  assert.ok(g.meta.repos.every((r) => !('remote' in r)));
  assert.ok(!html.includes(JETON_DANS_REMOTE), 'aucun jeton de connexion venant d’un dépôt distant git');
  const ici = readJson(path.join(racine, 'floorplan', 'graph.json')).meta.root;
  assert.ok(ici && !html.includes(ici), 'aucun chemin de dossier de cet ordinateur');
  assert.ok(!html.includes('FLOORPLAN_SERVER='), 'aucun détail du serveur');
  assert.match(sortie, /sans bulle de questions/);
  assert.doesNotMatch(sortie, /Ne le partage qu’avec des personnes de confiance/);
});

test('la santé et le travail récent n’entrent que sur demande, avec un avertissement pour la santé', () => {
  const { html, out: sortie } = exporterCli(path.join(racine, 'all.html'), '--include', 'flows,notes,recent,health');
  const g = donneesDe(html);
  assert.deepEqual(g.meta.exported.include, ['flows', 'notes', 'recent', 'health']);
  assert.ok(g.sante.problemes.length > 0);
  assert.equal(g.recent.items.length, 1);
  assert.match(sortie, /Ne le partage qu’avec des personnes de confiance/);
  // où se trouve un secret, jamais le secret lui-même
  assert.ok(!html.includes(FAKE_PASSWORD));
});

test('les parcours, la visite guidée et les notes peuvent aussi être laissés de côté', () => {
  const { html } = exporterCli(path.join(racine, 'bare.html'), '--include', 'none');
  const g = donneesDe(html);
  assert.deepEqual(g.meta.exported.include, []);
  assert.deepEqual(g.parcours, []);
  assert.deepEqual(g.visite, []);
  assert.ok(g.files.every((f) => !('note' in f)));
});

test('la page exportée est toujours la carte entière, prête à ouvrir', () => {
  const { html } = exporterCli(path.join(racine, 'page.html'));
  const g = donneesDe(html);
  const construit = readJson(path.join(racine, 'floorplan', 'graph.json'));
  assert.equal(g.files.length, construit.files.length);
  assert.equal(g.routes.length, construit.routes.length);
  assert.equal(g.links.length, construit.links.length);
  assert.match(html, /^<!doctype html>/i);
  assert.match(html, /ui\/60-export\.js/);
});

const appelerApi = (corps, entetes = {}) => fetch(base + '/api/export', { method: 'POST', headers: { 'content-type': 'application/json', ...entetes }, body: JSON.stringify(corps) });

test('le bouton Exporter demande le jeton de la page de la carte', async () => {
  assert.equal((await appelerApi({ include: ['flows'] })).status, 403);
  assert.equal((await appelerApi({ include: ['flows'] }, { 'x-floorplan-token': 'wrong' })).status, 403);
});

test('le bouton Exporter télécharge la copie, avec les parcours demandés depuis la dernière construction', async () => {
  const supplement = { id: 'custom-1', title: 'Admin deletes a user', description: '', steps: [{ ref: 'web', note: 'First.' }, { ref: 'api', note: 'Then.' }] };
  const r = await appelerApi({ include: ['flows', 'health'], parcours: [supplement, { id: 'bad', steps: 'nope' }] }, { 'x-floorplan-token': jeton });
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /text\/html/);
  assert.equal(r.headers.get('content-disposition'), 'attachment; filename="shop-map.html"');
  const g = donneesDe(await r.text());
  assert.deepEqual(g.meta.exported.include, ['flows', 'health']);
  assert.deepEqual(g.parcours.map((f) => f.id), ['refund', 'custom-1']);
  assert.equal(g.parcours[1].custom, true);
  assert.ok(g.files.every((f) => !('note' in f)), 'les notes n’étaient pas cochées');
  assert.equal(g.recent, undefined);
  assert.ok(g.sante);
});
