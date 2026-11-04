// Poser des questions sur la carte : serveur.mjs lance la CLI de Claude Code ou Codex avec la connexion de la personne,
// en lecture seule, et transforme leur flux d’événements en lignes de progression et en tableau de réponse. De fausses CLI
// (fixtures/fake-cli) notent ce qu’on leur donne : ces tests tournent donc sans qu’aucune des deux soit installée.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { DEPOT, appliBoutique, executer, nettoyer } from './aides.mjs';

const FAUX = path.join(DEPOT, 'tests', 'fixtures', 'fake-cli');
let racine;
const serveurs = [];

/** Démarre le serveur de la carte avec ces variables d’environnement ; renvoie { base, token, page, calls }. */
async function servir(env) {
  const journal = path.join(racine, `fake-${serveurs.length}.log`);
  const port = 20000 + Math.floor(Math.random() * 20000);
  const serveur = spawn(process.execPath, [path.join(racine, 'floorplan', 'serveur.mjs'), '--port', String(port), '--no-open'], {
    cwd: racine, env: { ...process.env, FLOORPLAN_NO_PROMPTS: '1', FLOORPLAN_ENGINE: '', FAKE_LOG: journal, ...env }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  serveurs.push(serveur);
  const base = await new Promise((resoudre, rejeter) => {
    let sortie = '';
    const minuteur = setTimeout(() => rejeter(new Error(`le serveur n’a pas démarré : ${sortie}`)), 20000);
    serveur.stdout.on('data', (d) => { sortie += d; const m = /Floorplan: (http:\/\/\S+)/.exec(sortie); if (m) { clearTimeout(minuteur); resoudre(m[1]); } });
    serveur.on('exit', (code) => rejeter(new Error(`le serveur s’est arrêté (${code}) : ${sortie}`)));
  });
  const html = await (await fetch(base + '/')).text();
  const page = JSON.parse(/window\.FLOORPLAN_SERVER=(\{.*?\});/.exec(html)[1]);
  return { base, token: page.token, page, calls: () => fs.readFileSync(journal, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) };
}

/** Pose une question et renvoie ses événements serveur sous la forme [{ event, data }]. */
async function demander(s, question, session) {
  const r = await fetch(s.base + '/api/ask', { method: 'POST', headers: { 'content-type': 'application/json', 'x-floorplan-token': s.token }, body: JSON.stringify({ question, session }) });
  return (await r.text()).split('\n\n').filter(Boolean).map((b) => ({ event: /^event: (\w+)/.exec(b)[1], data: JSON.parse(/^data: (.*)$/m.exec(b)[1]) }));
}
const choisir = (evenements, nom) => evenements.filter((e) => e.event === nom).map((e) => e.data);

// construite « par Claude Code » quel que soit l’agent qui lance les tests, pour que l’ordre des moteurs ci-dessous soit prévisible
before(() => { racine = appliBoutique(); executer('analyser.mjs', racine); executer('construire.mjs', racine, '--no-claude-md', '--agent', 'claude'); });
after(async () => {
  // attendre d’abord l’arrêt des serveurs : sous Windows, leur dossier de travail ne peut pas être supprimé tant qu’ils tournent
  await Promise.all(serveurs.filter((s) => s.exitCode === null).map((s) => new Promise((resoudre) => { s.once('exit', resoudre); s.kill(); })));
  nettoyer(racine);
});

test('avec Codex seul installé, les questions passent par Codex, en lecture seule et hors de son historique', async () => {
  const s = await servir({ FLOORPLAN_CLAUDE: path.join(racine, 'no-such-cli'), FLOORPLAN_CODEX: path.join(FAUX, 'fake-codex.mjs') });
  assert.equal(s.page.engine, 'codex');
  assert.equal(s.page.cli, true);

  const evenements = await demander(s, 'How do refunds work?');
  assert.deepEqual(choisir(evenements, 'progress').map((p) => p.text), ['Recherche de "refund" dans la carte', 'Lecture de shop-api/routes/orders.js']);
  const [reponse] = choisir(evenements, 'answer');
  assert.equal(reponse.title, 'Refunds');
  assert.deepEqual(reponse.items.map((i) => i.id), ['f:shop-api/routes/orders.js']);
  assert.match(reponse.session, /^[0-9a-f]{16}$/);

  const [appel] = s.calls();
  const option = (nom) => appel.args[appel.args.indexOf(nom) + 1];
  assert.equal(appel.args[0], 'exec');
  assert.equal(option('--sandbox'), 'read-only');
  assert.ok(appel.args.includes('--ephemeral'), 'rien n’est enregistré dans l’historique de Codex');
  // Node lance serveur.mjs depuis son vrai chemin, et sous macOS le dossier temporaire /var/… est en réalité /private/var/…
  assert.equal(fs.realpathSync(option('-C')), fs.realpathSync(racine));
  assert.match(appel.input, /How do refunds work\?/);
  assert.match(appel.input, /node floorplan\/requete\.mjs/);
});

test('Codex reçoit un schéma de réponse qu’il accepte : toutes les propriétés obligatoires, rien en plus', async () => {
  const s = await servir({ FLOORPLAN_CLAUDE: path.join(racine, 'no-such-cli'), FLOORPLAN_CODEX: path.join(FAUX, 'fake-codex.mjs') });
  await demander(s, 'What is this?');
  const { schema } = s.calls()[0];
  const verifier = (node, endroit) => {
    if (node.type === 'object') {
      assert.equal(node.additionalProperties, false, endroit);
      assert.deepEqual([...node.required].sort(), Object.keys(node.properties).sort(), endroit);
      for (const [k, v] of Object.entries(node.properties)) verifier(v, `${endroit}.${k}`);
    }
    if (node.type === 'array') verifier(node.items, `${endroit}[]`);
  };
  verifier(schema, 'answer');
  assert.ok(schema.required.includes('steps') && schema.required.includes('followups'));
});

test('une question de suite à Codex porte la conversation jusque-là', async () => {
  const s = await servir({ FLOORPLAN_CLAUDE: path.join(racine, 'no-such-cli'), FLOORPLAN_CODEX: path.join(FAUX, 'fake-codex.mjs') });
  const [premier] = choisir(await demander(s, 'How do refunds work?'), 'answer');
  const [deuxieme] = choisir(await demander(s, 'Who can ask for one?', premier.session), 'answer');
  assert.equal(deuxieme.session, premier.session);
  const appels = s.calls();
  assert.doesNotMatch(appels[0].input, /Plus tôt dans cette conversation/);
  assert.match(appels[1].input, /Plus tôt dans cette conversation :\nQ : How do refunds work\?\nR : Refunds go through/);
  // une session inconnue démarre une nouvelle conversation
  const [autre] = choisir(await demander(s, 'Start over', 'not-a-session'), 'answer');
  assert.notEqual(autre.session, premier.session);
  assert.doesNotMatch(s.calls()[2].input, /Plus tôt dans cette conversation/);
});

test('un Codex déconnecté le dit, pour que la carte puisse demander à la personne de se connecter', async () => {
  const s = await servir({ FLOORPLAN_CLAUDE: path.join(racine, 'no-such-cli'), FLOORPLAN_CODEX: path.join(FAUX, 'fake-codex.mjs') });
  const [echec] = choisir(await demander(s, 'SIGNED-OUT question'), 'failure');
  assert.equal(echec.code, 'not_logged_in');
  assert.equal(choisir(await demander(s, 'SIGNED-OUT again'), 'answer').length, 0);
});

test('la CLI de Claude Code passe en premier pour une carte construite par Claude, avec des outils en lecture seule, et les questions de suite reprennent la session', async () => {
  const s = await servir({ FLOORPLAN_CLAUDE: path.join(FAUX, 'fake-claude.mjs'), FLOORPLAN_CODEX: path.join(FAUX, 'fake-codex.mjs') });
  assert.equal(s.page.engine, 'claude');
  const evenements = await demander(s, 'How do refunds work?');
  assert.deepEqual(choisir(evenements, 'progress').map((p) => p.text), ['Lecture de l’aperçu de la carte', 'Lecture de shop-api/routes/orders.js']);
  const [reponse] = choisir(evenements, 'answer');
  assert.equal(reponse.session, 'test-session');
  await demander(s, 'And then?', reponse.session);
  const [premier, deuxieme] = s.calls();
  assert.ok(premier.args.includes('-p'));
  assert.deepEqual(premier.args.slice(premier.args.indexOf('--allowedTools') + 1, premier.args.indexOf('--disallowedTools')), ['Bash(node floorplan/requete.mjs:*)', 'Read', 'Grep', 'Glob']);
  assert.ok(premier.args.includes('Read(**/.env)') && premier.args.includes('Read(**/.env.*)'), 'les fichiers secrets restent fermés');
  assert.ok(premier.args.includes('--strict-mcp-config'), "les serveurs MCP de la machine restent hors de la demande");
  assert.equal(premier.input, 'How do refunds work?');
  assert.equal(deuxieme.args[deuxieme.args.indexOf('--resume') + 1], 'test-session');
});

test('--engine choisit une seule CLI et ne se rabat jamais sur l’autre', async () => {
  const s = await servir({ FLOORPLAN_ENGINE: 'codex', FLOORPLAN_CLAUDE: path.join(FAUX, 'fake-claude.mjs'), FLOORPLAN_CODEX: path.join(racine, 'no-such-cli') });
  assert.equal(s.page.cli, false);
  assert.equal(s.page.want, 'codex');
  const [echec] = choisir(await demander(s, 'Anything?'), 'failure');
  assert.equal(echec.code, 'cli_missing');
  assert.match(echec.message, /Codex est introuvable/);
});

// Windows : une installation npm récente de Claude Code a le vrai programme dans <npm>/node_modules/@anthropic-ai/claude-code/bin/claude.exe, sans cli.js, et seulement
// des raccourcis shell à côté (le « claude » sans extension que `where claude` liste en premier, et claude.cmd), qu’on ne peut pas lancer. Le serveur doit utiliser le vrai programme.
test('sous Windows, une installation npm de Claude Code avec seulement bin/claude.exe est trouvée et lancée (pas le raccourci shell)', { skip: process.platform !== 'win32' }, async () => {
  const npm = path.join(racine, 'fake-npm');
  const paquet = path.join(npm, 'node_modules', '@anthropic-ai', 'claude-code', 'bin');
  fs.mkdirSync(paquet, { recursive: true });
  fs.writeFileSync(path.join(npm, 'claude'), '#!/bin/sh\n'); // le raccourci : un fichier texte qu’on ne peut pas lancer
  const fauxExe = path.join(paquet, 'claude.exe');
  fs.copyFileSync(process.execPath, fauxExe); // un programme qui répond à --version (une copie, pas un lien : un lien ne peut pas être supprimé ensuite sur certains Windows)
  fs.chmodSync(fauxExe, 0o666); // la copie garde l’attribut lecture seule de Node, ce qui empêche de nettoyer le dossier
  const s = await servir({ FLOORPLAN_CLAUDE: path.join(npm, 'claude'), FLOORPLAN_CODEX: path.join(racine, 'no-such-cli') });
  assert.equal(s.page.engine, 'claude');
  assert.equal(s.page.version, process.version);
});
