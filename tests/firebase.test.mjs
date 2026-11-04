// Firebase Cloud Functions (#8) : les fonctions appelables et onRequest sont des adresses du serveur nommées d’après leur
// export, les appels httpsCallable et fetch du site web les atteignent, et Écrans et Santé suivent.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { REPO, lib, makeProject, run, readGraph, routeKeys, openEndpoints, cleanup } from './helpers.mjs';

const { extraire } = await lib('extract.mjs');
const { associerAppels } = await lib('routes.mjs');

let racine, graphe, resume;
before(() => {
  racine = makeProject({}, { arch: {
    projet: { name: 'firebase-app', summary: 'Test fixture.' },
    nodes: [
      { id: 'web', label: 'Website', kind: 'ui', summary: 'The website.', paths: ['web/**'] },
      { id: 'fn', label: 'Functions', kind: 'service', summary: 'Cloud Functions.', paths: ['functions/**'] },
    ],
  } });
  fs.cpSync(path.join(REPO, 'tests', 'fixtures', 'firebase-app'), racine, { recursive: true });
  resume = run('scan.mjs', racine);
  run('build.mjs', racine, '--no-claude-md');
  graphe = readGraph(racine);
});
after(() => cleanup(racine));

test('les fonctions appelables et onRequest sont des adresses du serveur, sous le nom exporté par le fichier d’entrée', () => {
  // archiveItem est exporté sous le nom retireItem ; api est une appli Express, donc ses propres routes sont les adresses du serveur
  assert.deepEqual(routeKeys(graphe), [
    'ANY /legacyPing', 'ANY /signDocument', 'CALL /approveItem', 'CALL /legacyStats', 'CALL /retireItem',
    'GET /api/reports', 'POST /api/reports',
  ]);
  assert.equal(graphe.routes.find((r) => r.p === '/approveItem').d, 'Approves an item once an admin has reviewed it.');
  assert.equal(graphe.routes.find((r) => r.p === '/api/reports' && r.m === 'GET').name, 'Lire api reports');
});

test("les appels du site web atteignent les fonctions : httpsCallable, un utilitaire autour, et fetch", () => {
  const http = graphe.links.filter((l) => l.k === 'http').map((l) => `${l.a.slice(2)} -> ${l.b.slice(2)} ${l.labels.join(', ')}`).sort();
  assert.deepEqual(http, [
    'web/src/lib/firebase.ts -> functions/src/docs/api.ts GET /api/reports',
    'web/src/lib/firebase.ts -> functions/src/docs/signDocument.ts ANY /signDocument',
    'web/src/pages/Items.tsx -> functions/src/items/itemCallables.ts CALL /approveItem, CALL /retireItem',
    'web/src/pages/Items.tsx -> functions/src/legacy/v1.js CALL /legacyStats',
  ]);
});

test('Écrans montre le code serveur derrière une page qui appelle des fonctions', () => {
  const ecranItems = graphe.ecrans.find((s) => s.url === '/items');
  assert.ok(ecranItems, 'l’écran /items');
  const serveur = ecranItems.behind.filter((b) => b.kind === 'server').map((b) => b.id);
  assert.deepEqual(serveur, ['f:functions/src/items/itemCallables.ts', 'f:functions/src/legacy/v1.js']);
});

test('Santé : une fonction appelable qui vérifie request.auth ou context.auth est protégée ; une qui ne le fait pas est ouverte', () => {
  assert.deepEqual(openEndpoints(graphe), ['ANY /legacyPing', 'CALL /retireItem', 'GET /api/reports', 'POST /api/reports']);
});

test('les fonctions de tâche de fond sont listées dans le résumé de l’analyse', () => {
  assert.match(resume, /FONCTIONS FIREBASE {2}3 appelables \(onCall\), 3 onRequest, 3 en tâche de fond/);
  assert.match(resume, /nightlyCleanup {2}onSchedule "every day 03:00"/);
  assert.match(resume, /onOrderCreated {2}onDocumentCreated "orders\/\{orderId\}"/);
  assert.match(resume, /weeklyDigest {2}pubsub\.onRun "every monday 09:00"/);
});

test('chaînes v1, génériques sur plusieurs lignes, noms groupés et adresses cloudfunctions.net', () => {
  const fn = extraire([
    `const functions = require('firebase-functions');`,
    `exports.report = functions.region('europe-west1').runWith({ memory: '1GB' }).https.onRequest((req, res) => res.end());`,
    `exports.onSignup = functions.auth.user().onCreate(async (user) => {});`,
    `const unsubscribe = db.collection('x').onSnapshot(() => {});`,
  ].join('\n'), 'javascript', 'functions/index.js');
  assert.deepEqual(fn.routes.map((r) => `${r.method} ${r.path}`), ['ANY /report']);
  assert.deepEqual(fn.triggers.map((t) => `${t.name} ${t.on}`), ['onSignup auth.onCreate']);

  const web = extraire([
    `import { httpsCallable } from 'firebase/functions';`,
    `const a = httpsCallable<`,
    `  Req,`,
    `  Promise<Res>`,
    `>(getFunctions(app), 'items-approve');`,
    `const b = functions.httpsCallable('legacyName');`,
    'fetch(`https://${REGION}-${PROJECT}.cloudfunctions.net/report`);',
  ].join('\n'), 'typescript', 'web/api.ts');
  assert.deepEqual(web.calls.map((c) => `${c.method} ${c.path}`).sort(), ['CALL /items/approve', 'CALL /legacyName', 'null /report']);
  assert.deepEqual(web.hosts, []);
});

test('une fonction appelable ne correspond qu’à des fonctions appelables, et une URL ne correspond jamais à une fonction appelable', () => {
  const routes = [
    { file: 'fn/a.ts', method: 'CALL', path: '/approve' },
    { file: 'api/b.ts', method: 'ANY', path: '/approve' },
  ];
  const fichiers = [{ path: 'web/x.ts', calls: [{ path: '/approve', method: 'CALL', line: 1 }, { path: '/approve', method: 'POST', line: 2 }] }];
  assert.deepEqual(associerAppels(fichiers, routes).map((h) => `${h.line} ${h.to}`), ['1 fn/a.ts', '2 api/b.ts']);
});
