// Outils communs aux tests : construire un projet jetable sur le disque, lui appliquer les scripts du skill,
// et lire ce qu’ils ont écrit. Chaque projet vit dans le dossier temporaire du système et est supprimé ensuite.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const DEPOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DOSSIER_SKILL = path.join(DEPOT, 'skills', 'la-carte');
export const lib = (nom) => import(new URL(`../skills/la-carte/scripts/lib/${nom}`, import.meta.url));

/**
 * Écrit `fichiers` ({ 'chemin/relatif': 'contenu' }) dans un nouveau dossier temporaire. Chaque dossier de `repos`
 * devient son propre dépôt git, comme un frontend et un backend côte à côte. Renvoie le dossier.
 */
export function creerProjet(fichiers, { repos: depots = [], arch: archi } = {}) {
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), 'la-carte-test-'));
  for (const [p, source] of Object.entries(fichiers)) {
    fs.mkdirSync(path.dirname(path.join(racine, p)), { recursive: true });
    fs.writeFileSync(path.join(racine, p), source);
  }
  for (const r of depots) execFileSync('git', ['init', '-q', path.join(racine, r)]);
  if (archi) ecrireJson(path.join(racine, 'la-carte', 'architecture.json'), archi);
  return racine;
}

/** Lance un des scripts du skill (analyser.mjs, construire.mjs, …) sur un projet et renvoie ce qu’il a affiché. */
export function executer(script, racine, ...parametres) {
  return execFileSync(process.execPath, [path.join(DOSSIER_SKILL, 'scripts', script), racine, ...parametres], { encoding: 'utf8', stdio: 'pipe' });
}

/** scan + build, comme le skill fait une première carte (sans toucher à CLAUDE.local.md). */
export function analyserEtConstruire(racine) {
  return executer('analyser.mjs', racine) + executer('construire.mjs', racine, '--no-claude-md');
}

export const lireJson = (fichier) => JSON.parse(fs.readFileSync(fichier, 'utf8'));
export const ecrireJson = (fichier, donnees) => { fs.mkdirSync(path.dirname(fichier), { recursive: true }); fs.writeFileSync(fichier, JSON.stringify(donnees, null, 2)); };
export const lireGraphe = (racine) => lireJson(path.join(racine, 'la-carte', 'graphe.json'));
export const nettoyer = (racine) => fs.rmSync(racine, { recursive: true, force: true });

/** Chaque fichier d’un dossier, sous la forme { path, text }. */
export function tousLesFichiers(dossier) {
  return fs.readdirSync(dossier, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => { const p = path.join(e.parentPath ?? e.path, e.name); return { path: p, text: fs.readFileSync(p, 'utf8') }; });
}

/** « MÉTHODE /chemin » pour chaque adresse du serveur de la carte. */
export const clesRoutes = (graphe) => graphe.routes.map((r) => `${r.m} ${r.p}`).sort();

/** « MÉTHODE /chemin » pour chaque adresse du serveur que la Santé signale comme appelable par n’importe qui. */
export function adressesOuvertes(graphe) {
  return graphe.sante.problemes
    .filter((i) => i.kind === 'unprotected-endpoint')
    .flatMap((i) => i.items.filter((id) => id.startsWith('r:')).map((id) => graphe.routes[+id.slice(2)]))
    .map((r) => `${r.m} ${r.p}`)
    .sort();
}

// Un faux mot de passe pour l’appli d’exemple. Il est assemblé à l’exécution pour qu’aucune chaîne ressemblant à un secret
// ne soit jamais versée dans ce dépôt, et pour que les tests vérifient qu’il n’atteint rien de ce que la carte écrit.
export const FAUX_MOT_DE_PASSE = ['correct', 'horse', 'battery', 'staple', '42'].join('-');

/**
 * Une petite boutique : une API Express et une appli web dans deux dépôts. Elle a des adresses du serveur protégées de trois façons
 * (un middleware sur la route, un contrôle là où le routeur est monté, aucune), des appels au serveur
 * entre dépôts et un mot de passe écrit en dur.
 */
export function appliBoutique() {
  const fichiers = {
    'shop-api/package.json': JSON.stringify({ name: 'shop-api', type: 'module', dependencies: { express: '^4.19.0' } }),
    'shop-api/server.js': [
      `import express from 'express';`,
      `import orders from './routes/orders.js';`,
      `import admin from './routes/admin.js';`,
      `import notes from './routes/notes.js';`,
      `import { requireStaff } from './auth.js';`,
      ``,
      `const app = express();`,
      `app.use('/api', orders);`,
      `app.use('/admin', requireStaff, admin);`,
      `app.use('/api', notes);`,
      `app.listen(3000);`,
    ].join('\n'),
    'shop-api/auth.js': [
      `/** Rejects requests without a signed-in customer. */`,
      `export function requireAuth(req, res, next) { if (!req.headers.authorization) return res.status(401).end(); next(); }`,
      `/** Rejects requests that aren't from staff. */`,
      `export function requireStaff(req, res, next) { if (!req.user?.staff) return res.status(403).end(); next(); }`,
    ].join('\n'),
    'shop-api/config.js': `export const DB_PASSWORD = "${FAUX_MOT_DE_PASSE}";\nexport const PORT = 3000;\n`,
    'shop-api/routes/orders.js': [
      `import { Router } from 'express';`,
      `import { requireAuth } from '../auth.js';`,
      `import { DB_PASSWORD } from '../config.js';`,
      ``,
      `const router = Router();`,
      `/** Every order for the signed-in customer. */`,
      `router.get('/orders', requireAuth, async (req, res) => { res.json([]); });`,
      `router.post('/orders/:id/refund', requireAuth, async (req, res) => { res.json({ ok: !!DB_PASSWORD }); });`,
      `export default router;`,
    ].join('\n'),
    'shop-api/routes/admin.js': [
      `import { Router } from 'express';`,
      `const router = Router();`,
      `router.delete('/users/:id', async (req, res) => { res.status(204).end(); });`,
      `export default router;`,
    ].join('\n'),
    'shop-api/routes/notes.js': [
      `import { Router } from 'express';`,
      `const router = Router();`,
      `router.post('/notes', async (req, res) => { res.json({ saved: true }); });`,
      `export default router;`,
    ].join('\n'),
    'shop-web/package.json': JSON.stringify({ name: 'shop-web', type: 'module', dependencies: { react: '^18.3.0' } }),
    'shop-web/src/api.js': [
      `export const listOrders = () => fetch('/api/orders').then((r) => r.json());`,
      'export const refund = (id) => fetch(`/api/orders/${id}/refund`, { method: \'POST\' });',
    ].join('\n'),
    'shop-web/src/App.jsx': [
      `import { listOrders, refund } from './api.js';`,
      `export default function App() { return <button onClick={() => listOrders().then((o) => refund(o[0].id))}>Refund</button>; }`,
    ].join('\n'),
  };
  const archi = {
    projet: { name: 'Shop', summary: 'A sample shop.' },
    nodes: [
      { id: 'api', label: 'Server', kind: 'service', summary: 'The shop server.', paths: ['shop-api/**'] },
      { id: 'web', label: 'Website', kind: 'ui', summary: 'The shop website.', paths: ['shop-web/**'] },
    ],
  };
  return creerProjet(fichiers, { repos: ['shop-api', 'shop-web'], arch: archi });
}
