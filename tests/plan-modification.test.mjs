// Modifier un plan depuis la carte : le mode Modifier de la bulle de questions envoie une demande à l’agent (une doublure,
// ici fixtures/fake-cli), qui répond avec le plan complet mis à jour. serveur.mjs le contrôle avec plan.mjs et
// construire.mjs, l’enregistre, redessine la carte avec les changements mis en évidence, et peut l’annuler.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { DEPOT, creerProjet, appliBoutique, executer, lireGraphe, lireJson, ecrireJson, clesRoutes, nettoyer } from './aides.mjs';

const EXEMPLE = path.join(DEPOT, 'tests', 'fixtures', 'blueprint');
const FAUX = path.join(DEPOT, 'tests', 'fixtures', 'fake-cli', 'fake-claude.mjs');
const serveurs = [], racines = [];
after(async () => {
  await Promise.all(serveurs.filter((s) => s.exitCode === null).map((s) => new Promise((resoudre) => { s.once('exit', resoudre); s.kill(); })));
  for (const r of racines) nettoyer(r);
});

/** Le plan d’exemple, dessiné, avec le serveur de sa carte qui répond par l’agent doublure grâce à `reponses`. */
async function servi(reponses, racine) {
  if (!racine) {
    racine = creerProjet({});
    fs.cpSync(EXEMPLE, racine, { recursive: true });
    executer('plan.mjs', racine);
    executer('construire.mjs', racine, '--no-claude-md');
  }
  racines.push(racine);
  const fichierReponses = path.join(racine, 'replies.json');
  ecrireJson(fichierReponses, reponses);
  const journal = path.join(racine, 'fake.log');
  const port = 20000 + Math.floor(Math.random() * 20000);
  const serveur = spawn(process.execPath, [path.join(racine, 'la-carte', '.cache', 'serveur.mjs'), '--port', String(port), '--no-open'], {
    cwd: racine, env: { ...process.env, LA_CARTE_NO_PROMPTS: '1', LA_CARTE_CLAUDE: FAUX, FAKE_LOG: journal, FAKE_CHANGES: fichierReponses }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  serveurs.push(serveur);
  const base = await new Promise((resoudre, rejeter) => {
    let sortie = '';
    const minuteur = setTimeout(() => rejeter(new Error(`le serveur n’a pas démarré : ${sortie}`)), 20000);
    serveur.stdout.on('data', (d) => { sortie += d; const m = /la carte: (http:\/\/\S+)/.exec(sortie); if (m) { clearTimeout(minuteur); resoudre(m[1]); } });
    serveur.on('exit', (code) => rejeter(new Error(`le serveur s’est arrêté (${code}) : ${sortie}`)));
  });
  const page = JSON.parse(/window\.LA_CARTE_SERVER=(\{.*?\});/.exec(await (await fetch(base + '/')).text())[1]);
  const jeton = page.token;
  // la doublure tient lieu de Claude Code : la carte propose donc Modifier
  assert.equal(page.cli, true);
  const envoyer = (p, corps) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json', 'x-la-carte-token': jeton }, body: JSON.stringify(corps || {}) });
  return {
    root: racine,
    async change(question) {
      const texte = await (await envoyer('/api/ask', { question, mode: 'change' })).text();
      return texte.split('\n\n').filter(Boolean).map((b) => ({ event: /^event: (\w+)/.exec(b)[1], data: JSON.parse(/^data: (.*)$/m.exec(b)[1]) }));
    },
    undo: async () => (await envoyer('/api/plan/undo')).json(),
    calls: () => fs.readFileSync(journal, 'utf8').trim().split('\n').map((l) => JSON.parse(l)),
  };
}
const choisir = (evenements, name) => evenements.filter((e) => e.event === name).map((e) => e.data);

/** Le plan d’exemple avec les remboursements ajoutés : un nouveau fichier d’adresse du serveur, son adresse, et la page « My walks » qui l’appelle. */
function avecRemboursements(modification = (p) => p) {
  const plan = lireJson(path.join(EXEMPLE, 'la-carte', 'sources', 'plan.json'));
  plan.files.push({ path: 'api/src/routes/refunds.ts', name: 'Refund endpoints', description: 'Refunds a cancelled walk to the owner’s card.', uses: ['api/src/services/payments.ts', 'api/src/db/bookings.ts'] });
  plan.files.find((f) => f.path === 'web/app/bookings/page.tsx').calls.push('POST /api/refunds');
  plan.endpoints.push({ method: 'POST', path: '/api/refunds', file: 'api/src/routes/refunds.ts', name: 'Refund a walk', description: 'Sends the money back for a cancelled walk.', access: 'signed-in', who: 'the owner who booked it' });
  modification(plan);
  return {
    title: 'Planned out refunds',
    summary: 'Added a **refund** endpoint that the My walks page calls when a walk is cancelled.',
    plan: JSON.stringify(plan),
    architecture: fs.readFileSync(path.join(EXEMPLE, 'la-carte', 'sources', 'architecture.json'), 'utf8'),
    changes: [
      { ref: 'api/src/routes/refunds.ts', change: 'new', note: 'Where refunds are handled.' },
      { ref: 'POST /api/refunds', change: 'new', note: 'The request that refunds a walk.' },
      { ref: 'web/app/bookings/page.tsx', change: 'changed', note: 'Now asks for a refund when a walk is cancelled.' },
    ],
    followups: ['Email the owner when the refund goes through'],
  };
}

test('un changement est vérifié, enregistré et dessiné, avec ce qui a changé mis en évidence', async () => {
  const s = await servi([avecRemboursements()]);
  const evenements = await s.change('also plan out refunds');
  assert.deepEqual(choisir(evenements, 'failure'), []);
  assert.deepEqual(choisir(evenements, 'progress').map((p) => p.text), ['Lecture de la-carte/sources/plan.json', 'Vérification du plan mis à jour']);
  const [reponse] = choisir(evenements, 'answer');
  assert.equal(reponse.title, 'Planned out refunds');
  assert.equal(reponse.changes, 3);
  assert.deepEqual(reponse.followups, ['Email the owner when the refund goes through']);
  assert.match(reponse.undo, /^[0-9a-z]+$/);

  const g = lireGraphe(s.root);
  assert.ok(clesRoutes(g).includes('POST /api/refunds'));
  assert.ok(g.links.some((l) => l.a === 'f:web/app/bookings/page.tsx' && l.b === 'f:api/src/routes/refunds.ts' && l.labels.includes('POST /api/refunds')));
  assert.equal(g.recent.tasks[0].title, 'Planned out refunds');
  assert.equal(g.recent.tasks[0].request, 'also plan out refunds');
  assert.deepEqual(g.recent.items.map((x) => `${x.change} ${x.id}`).sort(), ['changed f:web/app/bookings/page.tsx', 'new f:api/src/routes/refunds.ts', `new r:${g.routes.findIndex((r) => r.p === '/api/refunds')}`].sort());
  assert.equal(lireJson(path.join(s.root, 'la-carte', 'sources', 'plan.json')).endpoints.at(-1).who, 'the owner who booked it');

  // l’agent a seulement lu : aucun outil de modification, et on lui a demandé le schéma de changement
  const [appel] = s.calls();
  assert.ok(!appel.args.join(' ').match(/\b(Edit|Write)\b/), 'l’agent n’a aucun outil de modification');
  assert.match(appel.args[appel.args.indexOf('--append-system-prompt') + 1], /Tu modifies un plan/);
  assert.equal(appel.input, 'also plan out refunds');

  // annuler remet le plan et la carte comme avant
  assert.deepEqual(await s.undo(), { ok: true, left: 0 });
  assert.ok(!clesRoutes(lireGraphe(s.root)).includes('POST /api/refunds'));
  assert.deepEqual(await s.undo(), { ok: false, error: 'Rien à annuler.' });
});

test('un plan qui échoue aux contrôles repart une fois vers l’agent, avec les problèmes', async () => {
  const casse = avecRemboursements((p) => { p.endpoints.at(-1).file = 'api/src/routes/refund.ts'; });
  const s = await servi([casse, avecRemboursements()]);
  const evenements = await s.change('also plan out refunds');
  assert.ok(choisir(evenements, 'progress').some((p) => p.text === 'Correction d’un problème trouvé par les contrôles'));
  assert.equal(choisir(evenements, 'answer')[0].title, 'Planned out refunds');
  const [, nouvelEssai] = s.calls();
  assert.match(nouvelEssai.input, /n’a pas passé les contrôles/);
  assert.match(nouvelEssai.input, /"api\/src\/routes\/refund\.ts" n’est pas un des fichiers prévus/);
  assert.equal(nouvelEssai.args[nouvelEssai.args.indexOf('--resume') + 1], 'test-session');
});

test('les nouveaux fichiers hors de toute partie sont renvoyés une fois, pour que l’agent ajoute un motif', async () => {
  const egare = avecRemboursements((p) => { p.files.push({ path: 'admin/app/page.tsx', name: 'Admin home', description: 'Our own admin page.' }); });
  const corrige = { ...egare, architecture: JSON.stringify({ ...lireJson(path.join(EXEMPLE, 'la-carte', 'sources', 'architecture.json')), nodes: [...lireJson(path.join(EXEMPLE, 'la-carte', 'sources', 'architecture.json')).nodes, { id: 'admin', label: 'Admin page', kind: 'ui', summary: 'Our own admin page.', paths: ['admin/**'] }] }) };
  const s = await servi([egare, corrige]);
  const evenements = await s.change('add an admin page');
  assert.match(s.calls()[1].input, /1 fichier\(s\) prévu\(s\) ne tombent dans les paths d’aucune partie/);
  assert.equal(choisir(evenements, 'answer').length, 1);
  assert.equal(lireGraphe(s.root).files.filter((f) => f.n === 'unassigned').length, 0);
});

test('si le second essai échoue aussi, rien ne change', async () => {
  const casse = avecRemboursements((p) => { p.endpoints.at(-1).access = 'owners'; });
  const s = await servi([casse]);
  const before = fs.readFileSync(path.join(s.root, 'la-carte', 'sources', 'plan.json'), 'utf8');
  const evenements = await s.change('also plan out refunds');
  const [echec] = choisir(evenements, 'failure');
  assert.equal(echec.code, 'change_invalid');
  assert.match(echec.message, /access "owners" doit être l’une de/);
  assert.equal(fs.readFileSync(path.join(s.root, 'la-carte', 'sources', 'plan.json'), 'utf8'), before);
  assert.ok(!clesRoutes(lireGraphe(s.root)).includes('POST /api/refunds'));
  assert.equal(s.calls().length, 2);
});

test('une carte de vrai code ne peut pas être modifiée de cette façon', async () => {
  const racine = appliBoutique();
  executer('analyser.mjs', racine);
  executer('construire.mjs', racine, '--no-claude-md');
  const s = await servi([avecRemboursements()], racine);
  const [echec] = choisir(await s.change('add refunds'), 'failure');
  assert.match(echec.message, /Seul un plan peut être modifié depuis la carte/);
});
