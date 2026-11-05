// Les réponses gardées : une question déjà posée s'affiche sans repasser par Claude, et le serveur dit, sans jeton, si les
// fichiers qu'elle utilise ont changé depuis. Une fausse CLI (fixtures/fake-cli) compte les appels.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { DEPOT, appliBoutique, executer, lireGraphe, nettoyer } from './aides.mjs';

const FAUX = path.join(DEPOT, 'tests', 'fixtures', 'fake-cli', 'fake-claude.mjs');
let racine, s, journal;
const serveurs = [];
const fichierQuestions = () => path.join(racine, 'la-carte', 'sources', 'questions.json');
const appelsClaude = () => (fs.existsSync(journal) ? fs.readFileSync(journal, 'utf8').trim().split('\n').filter(Boolean).length : 0);

async function servir(cli = FAUX) {
  const port = 20000 + Math.floor(Math.random() * 20000);
  const serveur = spawn(process.execPath, [path.join(racine, 'la-carte', '.cache', 'serveur.mjs'), '--port', String(port), '--no-open'], {
    cwd: racine, env: { ...process.env, LA_CARTE_NO_PROMPTS: '1', FAKE_LOG: journal, LA_CARTE_CLAUDE: cli }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  serveurs.push(serveur);
  const base = await new Promise((resoudre, rejeter) => {
    let sortie = '';
    const minuteur = setTimeout(() => rejeter(new Error(`le serveur n’a pas démarré : ${sortie}`)), 20000);
    serveur.stdout.on('data', (d) => { sortie += d; const m = /la carte: (http:\/\/\S+)/.exec(sortie); if (m) { clearTimeout(minuteur); resoudre(m[1]); } });
  });
  const html = await (await fetch(base + '/')).text();
  return { base, token: JSON.parse(/window\.LA_CARTE_SERVER=(\{.*?\});/.exec(html)[1]).token, arreter: () => serveur.kill() };
}
const entetes = (serveur) => ({ 'content-type': 'application/json', 'x-la-carte-token': serveur.token });
async function demander(corps, serveur = s) {
  const r = await fetch(serveur.base + '/api/ask', { method: 'POST', headers: entetes(serveur), body: JSON.stringify(corps) });
  const evenements = (await r.text()).split('\n\n').filter(Boolean).map((b) => ({ event: /^event: (\w+)/.exec(b)[1], data: JSON.parse(/^data: (.*)$/m.exec(b)[1]) }));
  return evenements.find((e) => e.event === 'answer')?.data || { echec: evenements.find((e) => e.event === 'failure')?.data };
}
const liste = async () => (await (await fetch(s.base + '/api/questions', { headers: entetes(s) })).json()).questions;
const lireUne = async (id) => (await fetch(`${s.base}/api/questions?id=${id}`, { headers: entetes(s) })).json();
const toucher = (relatif, contenu) => fs.writeFileSync(path.join(racine, relatif), contenu);

before(async () => {
  racine = appliBoutique();
  journal = path.join(racine, 'fake.log');
  executer('analyser.mjs', racine);
  executer('construire.mjs', racine, '--no-claude-md');
  s = await servir();
});
after(async () => {
  await Promise.all(serveurs.map((x) => new Promise((fini) => { if (x.exitCode !== null || x.signalCode) return fini(); x.on('exit', fini); x.kill(); })));
  nettoyer(racine);
});
beforeEach(() => { fs.rmSync(fichierQuestions(), { force: true }); fs.rmSync(journal, { force: true }); });

test('une question déjà posée revient sans appeler Claude, même écrite un peu autrement', async () => {
  const premiere = await demander({ question: 'Comment ça fonctionne ?' });
  assert.equal(appelsClaude(), 1);
  assert.equal(premiere.garde, undefined);
  assert.equal(premiere.session, 'test-session');
  const seconde = await demander({ question: 'comment ca FONCTIONNE' });
  assert.equal(appelsClaude(), 1);
  assert.equal(seconde.answer, premiere.answer);
  assert.ok(Date.parse(seconde.garde.at));
  assert.deepEqual(seconde.garde.changements, []);
  assert.equal(seconde.session, undefined);
  await demander({ question: 'Comment ça fonctionne vraiment ?' });
  assert.equal(appelsClaude(), 2, 'une question seulement ressemblante repart vers Claude');
});

test('une réponse gardée survit au redémarrage et se relit sans Claude Code', async () => {
  await demander({ question: 'Où sont les données ?' });
  const sansCli = await servir(path.join(racine, 'no-such-cli'));
  const r = await demander({ question: 'Où sont les données ?' }, sansCli);
  assert.equal(r.title, 'Refunds');
  assert.ok(r.garde);
  sansCli.arreter();
});

test('le serveur dit quels fichiers ont changé, et seulement ceux qui comptent pour la réponse', async () => {
  const orders = 'shop-api/routes/orders.js';
  const avant = fs.readFileSync(path.join(racine, orders), 'utf8');
  await demander({ question: 'Comment marchent les remboursements ?' });
  const q = { question: 'Comment marchent les remboursements ?' };
  assert.deepEqual((await demander(q)).garde.changements, []);
  assert.ok((await demander(q)).garde.surveilles >= 1);

  toucher('shop-web/ailleurs.js', 'export const x = 1;\n');
  assert.deepEqual((await demander(q)).garde.changements, [], 'un fichier sans rapport ne déclenche rien');
  fs.rmSync(path.join(racine, 'shop-web/ailleurs.js'));

  toucher(orders, avant + '\n// changé\n');
  assert.deepEqual((await demander(q)).garde.changements, [{ p: orders, etat: 'modifié' }]);
  toucher(orders, avant);
  assert.deepEqual((await demander(q)).garde.changements, [], 'revenu à l’identique : plus rien à signaler');

  fs.rmSync(path.join(racine, orders));
  assert.deepEqual((await demander(q)).garde.changements, [{ p: orders, etat: 'disparu' }]);
  toucher(orders, avant);

  await new Promise((r) => setTimeout(r, 20));
  toucher('shop-api/routes/nouveau.js', 'export const y = 2;\n');
  const voisin = (await demander(q)).garde.changements;
  fs.rmSync(path.join(racine, 'shop-api/routes/nouveau.js'));
  assert.deepEqual(voisin, [{ p: 'shop-api/routes/nouveau.js', etat: 'nouveau' }]);
  assert.equal(appelsClaude(), 1);
});

test('reposer la question repart vers Claude, remplace la réponse et efface l’avertissement', async () => {
  const orders = 'shop-api/routes/orders.js';
  const avant = fs.readFileSync(path.join(racine, orders), 'utf8');
  const q = { question: 'Comment marchent les commandes ?' };
  await demander(q);
  toucher(orders, avant + '\n// changé encore\n');
  assert.equal((await demander(q)).garde.changements.length, 1);
  const refaite = await demander({ ...q, rafraichir: true });
  assert.equal(appelsClaude(), 2);
  assert.equal(refaite.garde, undefined);
  assert.deepEqual((await demander(q)).garde.changements, []);
  assert.equal((await liste()).length, 1);
  toucher(orders, avant);
});

test('une question de suite est gardée mais jamais reprise toute seule', async () => {
  await demander({ question: 'Comment ça démarre ?' });
  await demander({ question: 'Et ensuite ?', affiche: 'Et ensuite ?', suite: true, suiteDe: 'Comment ça démarre ?', session: 'test-session' });
  assert.equal(appelsClaude(), 2);
  const r = await demander({ question: 'Et ensuite ?' });
  assert.equal(r.garde, undefined, 'seule, cette phrase ne veut rien dire');
  assert.equal(appelsClaude(), 3);
  const suite = (await liste()).find((x) => x.suiteDe);
  assert.equal(suite.suiteDe, 'Comment ça démarre ?');
  const relue = await lireUne(suite.id);
  assert.equal(relue.question, 'Et ensuite ?');
  assert.ok(relue.garde);
  assert.equal(appelsClaude(), 3);
});

test('une question sur un bloc épinglé ne reprend pas la réponse d’un autre bloc', async () => {
  await demander({ question: 'À quoi ça sert ?\n\nConcentre-toi sur a', affiche: 'À quoi ça sert ?', contexte: ['n:a'] });
  await demander({ question: 'À quoi ça sert ?\n\nConcentre-toi sur b', affiche: 'À quoi ça sert ?', contexte: ['n:b'] });
  assert.equal(appelsClaude(), 2);
  const r = await demander({ question: 'À quoi ça sert ?\n\nConcentre-toi sur a', affiche: 'À quoi ça sert ?', contexte: ['n:a'] });
  assert.ok(r.garde);
  assert.equal(appelsClaude(), 2);
});

test('une erreur de Claude n’est pas gardée', async () => {
  const r = await demander({ question: 'SIGNED-OUT' });
  assert.equal(r.echec.code, 'not_logged_in');
  assert.equal(fs.existsSync(fichierQuestions()), false);
});

test('ce qui ressemble à une clé est masqué avant d’être gardé, sans abîmer les chemins de fichiers', async () => {
  const cle = 'A'.repeat(20) + 'b1'.repeat(15);
  const r = await demander({ question: `SECRET-IN-ANSWER ${cle}` });
  const ecrit = fs.readFileSync(fichierQuestions(), 'utf8');
  assert.ok(!ecrit.includes(cle), 'la clé de la question');
  assert.ok(!ecrit.includes('correct-horse-value'), 'le mot de passe de la réponse');
  assert.ok(!r.answer.includes('correct-horse-value'), 'la première réponse affichée est déjà masquée');
  assert.match(r.answer, /DB_PASSWORD = •••/);
  assert.ok(r.answer.includes('[[f:shop-api/routes/a-very-long-folder-name/with-a-long-file-name-too.js]]'), r.answer);
});

test('un fichier lu hors du projet n’est jamais surveillé', async () => {
  await demander({ question: 'READ-OUTSIDE' });
  const [entree] = JSON.parse(fs.readFileSync(fichierQuestions(), 'utf8')).questions;
  assert.deepEqual(Object.keys(entree.fichiers), ['shop-api/routes/orders.js']);
});

test('un fichier inventé dans questions.json ne fait rien lire hors du projet', async () => {
  await demander({ question: 'Une question' });
  const donnees = JSON.parse(fs.readFileSync(fichierQuestions(), 'utf8'));
  donnees.questions[0].fichiers = { '../../hors-du-projet.txt': 'abc', 'la-carte/.cache/server.json': 'abc' };
  fs.writeFileSync(fichierQuestions(), JSON.stringify(donnees));
  const r = await demander({ question: 'Une question' });
  assert.deepEqual(r.garde.changements, []);
});

test('un bloc de la carte surveille tous ses fichiers, sous-parties comprises', async () => {
  const g = lireGraphe(racine);
  const fichierAvecBloc = g.files.find((f) => f.n);
  const parent = g.nodes.find((n) => n.id === fichierAvecBloc.n);
  await demander({ question: `ITEM:n:${parent.id}` });
  const [entree] = JSON.parse(fs.readFileSync(fichierQuestions(), 'utf8')).questions;
  assert.ok(entree.fichiers[fichierAvecBloc.p], JSON.stringify(Object.keys(entree.fichiers)));
});

test('la liste, oublier une question, et le jeton obligatoire', async () => {
  await demander({ question: 'Première' });
  await demander({ question: 'Seconde' });
  const [recente, ancienne] = await liste();
  assert.equal(recente.question, 'Seconde');
  assert.equal(ancienne.question, 'Première');
  assert.equal(recente.answer, undefined, 'la liste reste légère');
  assert.equal((await fetch(s.base + '/api/questions')).status, 403);
  assert.equal((await fetch(s.base + '/api/questions', { method: 'DELETE', body: JSON.stringify({ id: recente.id }) })).status, 403);
  assert.equal((await fetch(`${s.base}/api/questions?id=inconnue`, { headers: entetes(s) })).status, 404);
  await fetch(s.base + '/api/questions', { method: 'DELETE', headers: entetes(s), body: JSON.stringify({ id: recente.id }) });
  assert.deepEqual((await liste()).map((x) => x.question), ['Première']);
  await demander({ question: 'Seconde' });
  assert.equal(appelsClaude(), 3, 'une question oubliée repart vers Claude');
});

test('une copie exportée ne contient aucune réponse gardée', async () => {
  await demander({ question: 'Question très privée sur le projet' });
  const sortie = execFileSync(process.execPath, [path.join(racine, 'la-carte', '.cache', 'serveur.mjs'), '--export'], { cwd: racine, encoding: 'utf8' });
  const html = fs.readFileSync(/Carte exportée vers (.+)/.exec(sortie)[1].trim(), 'utf8');
  assert.ok(!html.includes('Question très privée'));
});

test('la page propose les questions de base et les réponses gardées, sans le faire sur une copie', () => {
  const html = fs.readFileSync(path.join(racine, 'la-carte', 'index.html'), 'utf8');
  assert.ok(html.includes('id="ask-liste"'));
  assert.ok(html.includes('Comment ça fonctionne ?'));
  assert.match(html, /if \(!COPIE_EXPORTEE && window\.LA_CARTE_SERVER\) chargerQuestions\(\);/);
});
