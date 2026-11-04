// Tables de routes indexées par « MÉTHODE /chemin » (#54) : un serveur sans framework garde ses adresses dans une
// table qu’un répartiteur lit ({ "GET /api/orders": listOrders } en JS, un dict de fonctions en Python).
// Les clés sont les adresses du serveur, les appels du site web les atteignent, et Santé ne dit rien sur leur
// connexion, car le répartiteur ou la fonction la contrôle, hors de vue d’une lecture route par route.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { REPO, lib, makeProject, run, readGraph, routeKeys, openEndpoints, cleanup } from './helpers.mjs';

const { extraire } = await lib('extract.mjs');

let racine, graphe;
before(() => {
  racine = makeProject({}, { arch: {
    projet: { name: 'route-table-keys', summary: 'Test fixture.' },
    nodes: [
      { id: 'web', label: 'Website', kind: 'ui', summary: 'The website.', paths: ['web/**'] },
      { id: 'api', label: 'Library server', kind: 'service', summary: 'Python server.', paths: ['api/**'] },
      { id: 'shop', label: 'Shop server', kind: 'service', summary: 'Node server.', paths: ['shop/**'] },
    ],
  } });
  fs.cpSync(path.join(REPO, 'tests', 'fixtures', 'route-table-keys'), racine, { recursive: true });
  run('scan.mjs', racine);
  run('build.mjs', racine, '--no-claude-md');
  graphe = readGraph(racine);
});
after(() => cleanup(racine));

test('les clés d’une table de routes Python et JS sont des adresses du serveur ; les tables d’autres valeurs n’en sont pas', () => {
  assert.deepEqual(routeKeys(graphe), [
    'GET /api/books', 'GET /api/books/{book_id}', 'GET /api/orders', 'GET /api/orders/:id', 'GET /api/status',
    'POST /api/books/{book_id}/loans', 'POST /api/login', 'POST /api/orders',
  ]);
  const fichiers = new Set(graphe.routes.map((r) => r.f));
  assert.deepEqual([...fichiers].sort(), ['api/library/app.py', 'shop/server.js']);
});

test('chaque entrée nomme sa fonction : une fonction, une fonction de module, une lambda qui en appelle une, une fonction enveloppée', () => {
  const py = extraire(fs.readFileSync(path.join(racine, 'api/library/app.py'), 'utf8'), 'python', 'api/library/app.py');
  assert.deepEqual(py.routes.map((r) => `${r.method} ${r.path} ${r.handler}`), [
    'GET /api/books list_books', 'GET /api/books/{book_id} get_book', 'POST /api/books/{book_id}/loans lend',
    'POST /api/login login', 'GET /api/status health',
  ]);
  // la docstring de la fonction est celle de la route, pas celle du def suivant après la table
  assert.equal(py.routes.find((r) => r.path === '/api/books').doc, 'The whole catalogue, newest first.');
  const js = extraire(fs.readFileSync(path.join(racine, 'shop/server.js'), 'utf8'), 'javascript', 'shop/server.js');
  assert.deepEqual(js.routes.map((r) => `${r.method} ${r.path} ${r.handler}`), [
    'GET /api/orders listOrders', 'POST /api/orders createOrder', 'GET /api/orders/:id getOrder',
  ]);
});

test("les appels du site web atteignent les adresses des tables", () => {
  const http = graphe.links.filter((l) => l.k === 'http').map((l) => `${l.a.slice(2)} -> ${l.b.slice(2)} ${l.labels.join(', ')}`).sort();
  assert.deepEqual(http, [
    'web/src/api.js -> api/library/app.py GET /api/books, GET /api/books/{book_id}, POST /api/books/{book_id}/loans',
    'web/src/api.js -> shop/server.js GET /api/orders, POST /api/orders',
  ]);
});

test('Santé ne déclare pas ouvertes les adresses des tables : leur contrôle de connexion est hors de sa vue', () => {
  assert.deepEqual(openEndpoints(graphe), []);
});
