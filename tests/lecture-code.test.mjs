// Ce que la carte lit dans les fichiers source : imports, adresses du serveur, appels au serveur et commentaires de documentation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lib } from './aides.mjs';

const { extraire, aplatirGabarits, nettoyerDoc } = await lib('extraction.mjs');
const adressesDe = (source, langage, fichier) => extraire(source, langage, fichier).routes.map((r) => `${r.method} ${r.path}`);

test('JavaScript : imports et adresses Express', () => {
  const r = extraire([
    `import express from 'express';`,
    `import { db, cache as c } from './db.js';`,
    `const router = express.Router();`,
    `router.get('/orders', list);`,
    `router.post('/orders/:id/refund', refund);`,
  ].join('\n'), 'javascript', 'api/orders.js');
  assert.deepEqual(r.imports.map((i) => i.spec), ['express', './db.js']);
  assert.deepEqual(r.imports[1].names, ['db', 'cache']);
  assert.deepEqual(r.routes.map((x) => `${x.method} ${x.path}`), ['GET /orders', 'POST /orders/:id/refund']);
  assert.equal(r.routes[0].var, 'router');
});

test('Next.js app router : chaque méthode exportée est une adresse du serveur au chemin du dossier', () => {
  assert.deepEqual(
    adressesDe(`export async function GET(req) { return Response.json([]) }\nexport async function POST(req) {}\n`, 'typescript', 'web/app/api/orders/route.ts'),
    ['GET /api/orders', 'POST /api/orders'],
  );
});

test('Flask : préfixe du blueprint, liste des méthodes et docstring de la fonction', () => {
  const r = extraire([
    `"""Order endpoints."""`,
    `from flask import Blueprint`,
    `bp = Blueprint('orders', __name__, url_prefix='/api')`,
    ``,
    `@bp.route('/orders', methods=['GET', 'POST'])`,
    `def list_orders():`,
    `    """List them."""`,
    `    return []`,
  ].join('\n'), 'python', 'api/orders.py');
  assert.deepEqual(r.routes.map((x) => `${x.method} ${x.path}`), ['GET /orders', 'POST /orders']);
  assert.equal(r.routes[0].handler, 'list_orders');
  assert.equal(r.routes[0].doc, 'List them.');
  assert.deepEqual(r.routers, { bp: '/api' });
  assert.equal(r.doc, 'Order endpoints.');
});

test('FastAPI : préfixe du routeur et paramètres de chemin', () => {
  const r = extraire([
    `from fastapi import APIRouter`,
    `router = APIRouter(prefix="/items")`,
    `@router.get("/{item_id}")`,
    `async def read_item(item_id: int):`,
    `    return {}`,
  ].join('\n'), 'python', 'api/items.py');
  assert.deepEqual(r.routes.map((x) => `${x.method} ${x.path}`), ['GET /{item_id}']);
  assert.equal(r.routes[0].handler, 'read_item');
  assert.deepEqual(r.routers, { router: '/items' });
});

test('Go : imports groupés et adresses http.HandleFunc', () => {
  const r = extraire(`package main\nimport (\n  "net/http"\n  "example.com/app/store"\n)\nfunc main() { http.HandleFunc("/health", h) }\n`, 'go', 'cmd/main.go');
  assert.deepEqual(r.imports.map((i) => i.spec), ['net/http', 'example.com/app/store']);
  assert.deepEqual(r.routes.map((x) => `${x.method} ${x.path}`), ['ANY /health']);
});

test('appels au serveur : fetch avec des gabarits de texte et axios avec une méthode', () => {
  const r = extraire([
    'export const load = (id) => fetch(`/api/orders/${id}`);',
    `export const pay = (id) => axios.post('/api/orders/' + id + '/pay');`,
  ].join('\n'), 'typescript', 'web/src/api.ts');
  const appels = r.calls.map((c) => `${c.method || '*'} ${c.path}`);
  assert.ok(appels.includes('* /api/orders/${x}'), appels.join(', '));
  assert.ok(appels.includes('POST /api/orders/'), appels.join(', '));
});

test('commentaires : un /* dans une chaîne n’est pas un commentaire, donc le code qui suit est quand même lu', () => {
  const r = extraire([
    `import { Hono } from 'hono';`,
    `const app = new Hono();`,
    `app.use('/api/*', cors());`,
    `app.get('/api/items', list);`,
    `app.post('/api/items', create);`,
    `/** Health check. */`,
    `app.get('/health', ok); // for the load balancer`,
  ].join('\n'), 'typescript', 'server/src/index.ts');
  assert.deepEqual(r.routes.map((x) => `${x.method} ${x.path} :${x.line}`), ['GET /api/items :4', 'POST /api/items :5', 'GET /health :7']);
});

test('aplatirGabarits remplace chaque ${…} par un repère, imbriqué ou non', () => {
  assert.equal(aplatirGabarits('fetch(`${API}/users/${id}`)'), 'fetch(`${x}/users/${x}`)');
});

test('commentaires de documentation : JSDoc est nettoyé, les en-têtes de licence sont ignorés', () => {
  assert.equal(nettoyerDoc('/**\n * Lists orders.\n * @param x\n */'), 'Lists orders.');
  assert.equal(nettoyerDoc('# Copyright 2020 Example Corp'), null);
});

test('commentaires de documentation : dates, pastilles, renvois et majuscules ne passent pas dans la description', () => {
  assert.equal(nettoyerDoc('// 🟡 06/09 (revue écran par écran) — LES PUCES DU FILTRE MEMBRE ANNONCENT LEUR ÉTAT.'), 'Les puces du filtre membre annoncent leur état.');
  assert.equal(nettoyerDoc('// 25/10 (audit sécurité du 24/10, M3) — la confirmation d\'email exige d\'être connecté au compte.'), 'La confirmation d\'email exige d\'être connecté au compte.');
  assert.equal(nettoyerDoc('// Ce que la page dit quand la liste est vide (02/09, revue).'), 'Ce que la page dit quand la liste est vide.');
  assert.equal(nettoyerDoc('// ROADMAP AI.04, lot 3a (décisions du 14/10) : la phrase de présentation d\'une liste, facultative.'), 'La phrase de présentation d\'une liste, facultative.');
  assert.equal(nettoyerDoc('// 2026-10-26 : les formateurs écrivent la même chose.'), 'Les formateurs écrivent la même chose.');
  // une abréviation ou un point dans des guillemets ne coupe pas la phrase
  assert.equal(nettoyerDoc('// pytest ajoute le dossier au chemin, ce qui rend le paquet importable (ex. dans les tests). Suite.'), 'Pytest ajoute le dossier au chemin, ce qui rend le paquet importable (ex. dans les tests).');
  assert.equal(nettoyerDoc('// En colonne étroite, un mois s\'écrit « oct. » et pas en entier. Suite.'), 'En colonne étroite, un mois s\'écrit « oct. » et pas en entier.');
  // un mot mis en relief reste tel quel, un sigle aussi
  assert.equal(nettoyerDoc('// Polices hébergées AVEC l\'application, pour la CSP.'), 'Polices hébergées AVEC l\'application, pour la CSP.');
  // la phrase en majuscules est baissée même si la suite du paragraphe ne l'est pas
  assert.equal(nettoyerDoc('// 🔴 06/09 (revue) — DEUX QUESTIONS, DEUX CHIFFRES.\n// La suite explique en minuscules ce que le test vérifie, longuement.'), 'Deux questions, deux chiffres.');
  // un renvoi entre parenthèses n'est pas coupé en deux, une suite datée est retirée
  assert.equal(nettoyerDoc('// 🟠 07/09 (audit, R8 — décision : « mets "Reste" ») — LE MOT « SOLDE » NE PARLE PAS D\'ARGENT.'), 'Le mot « solde » ne parle pas d\'argent.');
  assert.equal(nettoyerDoc('// Polices hébergées avec l\'application — 15/08 (audit performance).'), 'Polices hébergées avec l\'application.');
  // il ne reste qu'une date : rien
  assert.equal(nettoyerDoc('// 05/10'), null);
});
