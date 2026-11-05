// Le bouton Décrire : Claude reste en lecture seule, le serveur contrôle sa réponse avant d'écrire, et la carte perd ses noms provisoires.
import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { creerProjet, ecrireJson, executer, lireGraphe, nettoyer } from './aides.mjs';

const FAUX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'fake-cli', 'fake-claude.mjs');
const serveurs = [];
const racines = [];

function projet(fichiers) {
  const racine = creerProjet({ 'package.json': '{}', ...fichiers });
  racines.push(racine);
  executer('analyser.mjs', racine);
  ecrireJson(path.join(racine, 'la-carte', 'sources', 'architecture.json'), { projet: { name: 'E', summary: 'E.' }, nodes: [{ id: 'src', label: 'Code', kind: 'library', summary: 'Le code.', paths: ['src/**'] }], edges: [] });
  executer('construire.mjs', racine);
  return racine;
}

async function servir(racine, env) {
  const port = 20000 + Math.floor(Math.random() * 20000);
  const journal = path.join(racine, 'fake.log');
  const serveur = spawn(process.execPath, [path.join(racine, 'la-carte', '.cache', 'serveur.mjs'), '--port', String(port), '--no-open'], { cwd: racine, env: { ...process.env, LA_CARTE_NO_PROMPTS: '1', FAKE_LOG: journal, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  serveurs.push(serveur);
  const base = await new Promise((resoudre, rejeter) => {
    let sortie = '';
    const minuteur = setTimeout(() => rejeter(new Error(`le serveur n’a pas démarré : ${sortie}`)), 20000);
    serveur.stdout.on('data', (d) => { sortie += d; const m = /la carte: (http:\/\/\S+)/.exec(sortie); if (m) { clearTimeout(minuteur); resoudre(m[1].replace(/\/$/, '')); } });
  });
  const jeton = /"token":"([0-9a-f]+)"/.exec(await (await fetch(base + '/')).text())[1];
  const demander = async () => {
    const res = await fetch(base + '/api/ask', { method: 'POST', headers: { 'content-type': 'application/json', 'x-la-carte-token': jeton }, body: JSON.stringify({ mode: 'describe', question: 'ignore ceci' }) });
    const evenements = (await res.text()).split('\n\n').filter(Boolean).map((b) => ({ nom: /^event: (.*)$/m.exec(b)?.[1], donnees: JSON.parse(/^data: (.*)$/m.exec(b)?.[1] || 'null') }));
    return { reponse: evenements.find((e) => e.nom === 'answer')?.donnees, echec: evenements.find((e) => e.nom === 'failure')?.donnees };
  };
  const journalDe = () => fs.readFileSync(journal, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  return { base, demander, journalDe };
}

function reponseFausse(racine, contenu) {
  const f = path.join(racine, 'fausse-reponse.json');
  fs.writeFileSync(f, JSON.stringify(contenu));
  return { LA_CARTE_CLAUDE: FAUX, FAKE_DESCRIPTIONS: f };
}
const decrits = (racine) => Object.fromEntries(lireGraphe(racine).files.map((f) => [f.p, { name: f.name, d: f.d, auto: !!f.auto, icon: f.icon }]));

afterEach(async () => {
  await Promise.all(serveurs.splice(0).filter((s) => s.exitCode === null).map((s) => new Promise((resoudre) => { s.once('exit', resoudre); s.kill(); })));
});
after(() => { for (const r of racines) nettoyer(r); });

test('sans le jeton, personne ne peut lancer la description', async () => {
  const racine = projet({ 'src/a.js': 'export const a = 1;\n' });
  const { base } = await servir(racine, { LA_CARTE_CLAUDE: FAUX });
  assert.equal((await fetch(base + '/api/ask', { method: 'POST', body: JSON.stringify({ mode: 'describe' }) })).status, 403);
});

test('Claude n’a aucun outil d’écriture, et les noms reçus arrivent sur la carte', async () => {
  const racine = projet({ 'src/a.js': 'export const a = 1;\n', 'src/b.js': 'export const b = 2;\n' });
  assert.equal(decrits(racine)['src/a.js'].auto, true);
  const s = await servir(racine, reponseFausse(racine, { files: [{ path: 'src/a.js', name: 'Calcul du prix', description: 'Calcule le prix affiché.', icon: 'argent' }, { path: 'src/b.js', name: 'Calcul des frais', description: 'Calcule les frais.' }], routes: [] }));
  const { reponse, echec } = await s.demander();
  assert.equal(echec, undefined);
  assert.deepEqual({ ecrits: reponse.ecrits, rejetes: reponse.rejetes, restants: reponse.restants }, { ecrits: 2, rejetes: 0, restants: 0 });
  const apres = decrits(racine);
  assert.deepEqual(apres['src/a.js'], { name: 'Calcul du prix', d: 'Calcule le prix affiché.', auto: false, icon: 'argent' });
  assert.equal(apres['src/b.js'].auto, false);

  const { args, input } = s.journalDe()[0];
  const outils = args[args.indexOf('--tools') + 1];
  assert.equal(outils, 'Read,Grep,Glob,Bash');
  assert.ok(!args.some((a) => /^(Write|Edit|NotebookEdit)/.test(a)), 'aucun outil d’écriture');
  assert.ok(args.includes('Read(**/.env)'), 'les secrets restent refusés');
  assert.ok(input.includes('src/a.js'), 'la liste part du graphe');
  assert.ok(!input.includes('ignore ceci'), 'le navigateur ne dicte pas la demande');
});

test('une réponse hors liste, trop longue ou qui ressemble à une clé n’est pas écrite', async () => {
  const racine = projet({ 'src/a.js': 'export const a = 1;\n', 'src/b.js': 'export const b = 2;\n', 'src/c.js': 'export const c = 3;\n', 'src/d.js': 'export const d = 4;\n' });
  const s = await servir(racine, reponseFausse(racine, { files: [
    { path: '../../evil.js', name: 'Évasion', description: 'Hors du projet.' },
    { path: 'src/inconnu.js', name: 'Inconnu', description: 'Pas demandé.' },
    { path: 'src/a.js', name: 'x'.repeat(200), description: 'Nom trop long.' },
    { path: 'src/b.js', name: 'Clé', description: `La clé est ${'A1'.repeat(30)}.` },
    { path: 'src/c.js', name: 'Sans description', description: '' },
    { path: 'src/d.js', name: 'Bon nom', description: 'Une bonne phrase.', icon: 'inexistante' },
  ], routes: [] }));
  const { reponse } = await s.demander();
  assert.deepEqual({ ecrits: reponse.ecrits, rejetes: reponse.rejetes, restants: reponse.restants }, { ecrits: 1, rejetes: 5, restants: 3 });
  const apres = decrits(racine);
  assert.equal(apres['src/a.js'].auto, true);
  assert.equal(apres['src/b.js'].auto, true);
  assert.equal(apres['src/c.js'].auto, true);
  assert.equal(apres['src/d.js'].name, 'Bon nom');
  assert.equal(apres['src/d.js'].icon, undefined);
  assert.ok(!JSON.stringify(fs.readdirSync(path.join(racine, 'la-carte', 'sources', 'descriptions')).map((n) => fs.readFileSync(path.join(racine, 'la-carte', 'sources', 'descriptions', n), 'utf8'))).includes('evil'));
  assert.ok(!fs.existsSync(path.join(racine, '..', 'evil.js')));
});

test('un clic traite 40 éléments au plus, le reste attend le clic suivant', async () => {
  const fichiers = {};
  for (let i = 10; i < 55; i++) fichiers[`src/f${i}.js`] = `export const f${i} = 1;\n`;
  const racine = projet(fichiers);
  const toutes = Object.keys(fichiers).sort().map((p) => ({ path: p, name: `Nom de ${p.slice(4, 7)}`, description: 'Une phrase.' }));
  const s = await servir(racine, reponseFausse(racine, { files: toutes, routes: [] }));
  const un = (await s.demander()).reponse;
  assert.deepEqual({ ecrits: un.ecrits, rejetes: un.rejetes, restants: un.restants }, { ecrits: 40, rejetes: 5, restants: 5 });
  assert.equal(Object.values(decrits(racine)).filter((f) => f.auto).length, 5);
  assert.ok(!s.journalDe()[0].input.includes('src/f54.js'), 'le 41e n’est pas envoyé');
});

test('le lot prend d’abord ce qui est le plus utilisé, et les tests en dernier', () => {
  const fichiers = { 'src/aaa-seul.js': 'export const a = 1;\n', 'src/commun.js': 'export const c = 1;\n', 'tests/aaa.test.js': "import { c } from '../src/commun.js';\nexport const t = c;\n" };
  for (let i = 0; i < 4; i++) fichiers[`src/u${i}.js`] = `import { c } from './commun.js';\nexport const u${i} = c;\n`;
  const racine = projet(fichiers);
  const { demande } = JSON.parse(executer('nouveaux.mjs', racine, '--liste'));
  const ordre = [...demande.matchAll(/^- (\S+)/gm)].map((m) => m[1]);
  assert.equal(ordre[0], 'src/commun.js');
  assert.equal(ordre.at(-1), 'tests/aaa.test.js');
});

test('les adresses du serveur sont décrites aussi, et une description écrite à la main n’est pas touchée', async () => {
  const racine = projet({ 'src/serveur.js': "import express from 'express';\nconst app = express();\napp.get('/api/prix', (req, res) => res.json({}));\n", 'src/main.js': 'export const m = 1;\n' });
  ecrireJson(path.join(racine, 'la-carte', 'sources', 'descriptions', 'main.json'), { files: { 'src/main.js': { name: 'Écrit à la main', description: 'Une phrase à moi.' } } });
  executer('construire.mjs', racine);
  const s = await servir(racine, reponseFausse(racine, { files: [{ path: 'src/serveur.js', name: 'Serveur', description: 'Répond aux demandes.' }, { path: 'src/main.js', name: 'Remplacé', description: 'Ne doit pas passer.' }], routes: [{ key: 'GET /api/prix', name: 'Donner le prix', description: 'Répond avec le prix.' }] }));
  const { reponse } = await s.demander();
  assert.deepEqual({ ecrits: reponse.ecrits, rejetes: reponse.rejetes, restants: reponse.restants }, { ecrits: 2, rejetes: 1, restants: 0 });
  assert.equal(decrits(racine)['src/main.js'].name, 'Écrit à la main');
  const route = lireGraphe(racine).routes.find((r) => r.p === '/api/prix');
  assert.equal(route.name, 'Donner le prix');
  assert.ok(!route.auto);
});

test('un fichier de descriptions illisible n’est pas écrasé', async () => {
  const racine = projet({ 'src/a.js': 'export const a = 1;\n' });
  const s = await servir(racine, reponseFausse(racine, { files: [{ path: 'src/a.js', name: 'Nom', description: 'Une phrase.' }], routes: [] }));
  const abime = path.join(racine, 'la-carte', 'sources', 'descriptions', 'src.json');
  fs.mkdirSync(path.dirname(abime), { recursive: true });
  fs.writeFileSync(abime, '{ pas du json');
  const { echec } = await s.demander();
  assert.match(echec.message, /src\.json/);
  assert.equal(fs.readFileSync(abime, 'utf8'), '{ pas du json');
});

test('sans Claude, le serveur le dit, et rien à décrire ne lance pas Claude', async () => {
  const racine = projet({ 'src/a.js': 'export const a = 1;\n' });
  const sans = await servir(racine, { LA_CARTE_CLAUDE: path.join(racine, 'absent.cmd'), PATH: '' });
  assert.equal((await sans.demander()).echec?.code, 'cli_missing');
  ecrireJson(path.join(racine, 'la-carte', 'sources', 'descriptions', 'src.json'), { files: { 'src/a.js': { name: 'Nom', description: 'Une phrase.' } } });
  executer('construire.mjs', racine);
  const s = await servir(racine, { LA_CARTE_CLAUDE: FAUX });
  const { reponse } = await s.demander();
  assert.deepEqual({ ecrits: reponse.ecrits, restants: reponse.restants }, { ecrits: 0, restants: 0 });
  assert.ok(!fs.existsSync(path.join(racine, 'fake.log')), 'Claude n’a pas été lancé');
});
