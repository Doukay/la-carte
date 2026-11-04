// Fastify : les plugins montés avec app.register(plugin, { prefix }) placent leurs routes sous ce préfixe,
// les register imbriqués se composent, et les appels du site web atteignent le bon plugin.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { REPO, lib, makeProject, run, readGraph, routeKeys, cleanup } from './helpers.mjs';

const { extraire } = await lib('extract.mjs');

let racine, graphe;
before(() => {
  racine = makeProject({}, { arch: {
    projet: { name: 'fastify-app', summary: 'Test fixture.' },
    nodes: [
      { id: 'web', label: 'Website', kind: 'ui', summary: 'The website.', paths: ['web/**'] },
      { id: 'api', label: 'Server', kind: 'service', summary: 'The Fastify server.', paths: ['api/**'] },
    ],
  } });
  fs.cpSync(path.join(REPO, 'tests', 'fixtures', 'fastify-app'), racine, { recursive: true });
  run('scan.mjs', racine);
  run('build.mjs', racine, '--no-claude-md');
  graphe = readGraph(racine);
});
after(() => cleanup(racine));

test('register(plugin, { prefix }) est un montage : importé par nom, par import() ou par require()', () => {
  const r = extraire([
    `import ticketRoutes from './routes/tickets.js';`,
    `import { inviteRoutes as invites } from './routes/invites.js';`,
    `const legacy = require('./routes/legacy');`,
    `async function local(app) { app.get('/x', h) }`,
    `await app.register(ticketRoutes, { prefix: '/api/tickets' });`,
    `await app.register(invites, {`,
    `  prefix: '/api/invites',`,
    `});`,
    `app.register(import('./routes/health.js'), { prefix: '/health' });`,
    `app.register(require('./routes/legacy'), { prefix: '/legacy' });`,
    `app.register(ticketRoutes);`,
    `app.register(local, { prefix: '/local' });`,
    `app.register(cors, { origin: true });`,
    'app.register(ticketRoutes, { prefix: `/v${n}` });',
  ].join('\n'), 'typescript', 'api/app.ts');
  // un plugin sans préfixe se place sous celui de son parent (un montage vide) ; un plugin défini dans le même
  // fichier, un register sans plugin à nous (cors) et un préfixe construit à l’exécution sont laissés de côté
  assert.deepEqual(r.mounts.map((m) => `${m.prefix} ${m.var || m.spec}`), [
    '/api/tickets ticketRoutes', '/api/invites invites', '/health ./routes/health.js', '/legacy ./routes/legacy', ' ticketRoutes',
  ]);
  // et un préfixe n’est pas pris pour un appel que le fichier fait
  assert.deepEqual(r.calls, []);
});

test('les adresses du serveur reçoivent le préfixe sous lequel leur plugin est enregistré, à travers des register imbriqués avec ou sans préfixe', () => {
  assert.deepEqual(routeKeys(graphe), [
    'GET /api/v1/buildings', 'GET /api/v1/buildings/:buildingId/faq', 'GET /api/v1/buildings/:buildingId/notes', 'GET /api/v1/invites', 'GET /api/v1/tickets',
    'GET /api/v1/tickets/:id', 'GET /health', 'POST /api/v1/invites/accept', 'POST /api/v1/tickets/:id/accept',
  ]);
});

test("les appels du site web atteignent le plugin qui y répond", () => {
  const http = graphe.links.filter((l) => l.k === 'http').map((l) => `${l.a.slice(2)} -> ${l.b.slice(2)} ${l.labels.join(', ')}`).sort();
  assert.deepEqual(http, [
    'web/src/api.ts -> api/src/routes/buildings/faq.ts GET /api/v1/buildings/:buildingId/faq',
    'web/src/api.ts -> api/src/routes/invites.ts POST /api/v1/invites/accept',
    'web/src/api.ts -> api/src/routes/tickets.ts GET /api/v1/tickets, POST /api/v1/tickets/:id/accept',
  ]);
});
