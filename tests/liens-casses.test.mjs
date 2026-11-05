// Les liens cassés : trouvés à l'analyse, sans fausse alerte, puis visibles sur la carte et dans la Santé.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { creerProjet, ecrireJson, executer, lireGraphe, lireJson, nettoyer } from './aides.mjs';

let racine, analyse;
const SOURCES = {
  'package.json': '{"name":"essai"}',
  'src/ok.js': "import { garde } from './outils.js';\nimport defaut from './outils.js';\nimport { reexporte } from './tout.js';\nimport './style.css';\nimport { dyn } from './cjs.js';\nexport const ok = () => [garde, defaut, reexporte, dyn];\n",
  'src/outils.js': 'export const garde = 1;\nexport default 2;\nexport const autre = 3;\n',
  'src/tout.js': "export * from './outils.js';\n",
  'src/cjs.js': 'exports.dyn = 1;\n',
  'src/style.css': 'body{}',
  'src/casse.js': "import { perdue } from './outils.js';\nimport { x } from './disparu.js';\nimport { y } from './pas-la/index.js';\nexport const c = [perdue, x, y];\n",
  'src/ignore.js': "const nom = 'a';\nexport const charger = () => import(`./${nom}.js`);\nimport('./dossier-dynamique/' + nom);\n",
  'web/api.js': "export const a = () => fetch('/api/produits');\nexport const b = () => fetch('/api/absente/lot');\nexport const c = () => fetch('/api/produits', { method: 'DELETE' });\nexport const d = () => fetch('https://exemple.com/api/absente');\nexport const e = () => fetch('/autre/chose');\nconst BASE = '/api';\nexport const f = () => fetch(BASE);\n",
  'serveur/routes.js': "import express from 'express';\nconst app = express();\napp.get('/api/produits', (req, res) => res.end());\napp.post('/api/produits', (req, res) => res.end());\napp.listen(3000);\n",
};
const ARCHI = { projet: { name: 'Essai', summary: 'Essai.' }, nodes: [{ id: 'src', label: 'Code', kind: 'library', summary: 'Le code.', paths: ['src'] }, { id: 'web', label: 'Site', kind: 'ui', summary: 'Le site.', paths: ['web'] }, { id: 'serveur', label: 'Serveur', kind: 'service', summary: 'Le serveur.', paths: ['serveur'] }] };

before(() => {
  racine = creerProjet(SOURCES);
  executer('analyser.mjs', racine);
  analyse = lireJson(path.join(racine, 'la-carte', '.cache', 'analyse.json'));
  ecrireJson(path.join(racine, 'la-carte', 'sources', 'architecture.json'), ARCHI);
  executer('construire.mjs', racine);
});
after(() => nettoyer(racine));
const de = (fichier) => analyse.casses.filter((c) => c.from === fichier).map((c) => `${c.kind} ${c.target}`).sort();

test('un fichier importé introuvable et une fonction disparue sont trouvés', () => {
  assert.deepEqual(de('src/casse.js'), ['fichier ./disparu.js', 'fichier ./pas-la/index.js', 'fonction perdue']);
});

test('pas de fausse alerte : export *, module.exports, fichier non-code présent, chemins dynamiques', () => {
  assert.deepEqual(de('src/ok.js'), []);
  assert.deepEqual(de('src/ignore.js'), []);
});

test('un appel à une adresse absente ou avec la mauvaise méthode est trouvé ; ni un site extérieur, ni un autre début de chemin, ni une base', () => {
  assert.deepEqual(de('web/api.js'), ['adresse DELETE /api/produits', 'adresse GET /api/absente/lot']);
});

test('sur la carte, un bloc « Introuvable » reçoit des liens de type coupé', () => {
  const g = lireGraphe(racine);
  const bloc = g.nodes.find((n) => n.id === 'casse');
  assert.equal(bloc.kind, 'casse');
  const coupes = g.links.filter((l) => l.k === 'casse');
  assert.ok(coupes.some((l) => l.a === 'f:src/casse.js' && l.b === 'n:casse' && l.labels.includes('./disparu.js')));
  assert.ok(coupes.some((l) => l.a === 'f:web/api.js' && l.b === 'n:casse' && l.labels.includes('GET /api/absente/lot')));
});

test('une fonction disparue coupe le vrai lien entre les deux fichiers', () => {
  const g = lireGraphe(racine);
  const lien = g.links.find((l) => l.k === 'casse' && l.a === 'f:src/casse.js' && l.b === 'f:src/outils.js');
  assert.ok(lien);
  assert.ok(lien.labels.includes('perdue'));
});

test('la Santé les liste à corriger en premier, avec le fichier et la ligne', () => {
  const p = lireGraphe(racine).sante.problemes.filter((i) => i.kind === 'lien-casse');
  assert.ok(p.length >= 2);
  assert.ok(p.every((i) => i.severity === 'high' && i.items.length));
  assert.ok(p.some((i) => i.id === 'lien-casse:src/casse.js' && /disparu\.js/.test(i.detail) && i.fix.join('\n').includes('src/casse.js')));
});

test('réparer le code efface le lien coupé à la mise à jour suivante', () => {
  fs.writeFileSync(path.join(racine, 'src/casse.js'), "import { garde } from './outils.js';\nexport const c = garde;\n");
  executer('actualiser.mjs', racine);
  const g = lireGraphe(racine);
  assert.ok(!g.links.some((l) => l.k === 'casse' && l.a === 'f:src/casse.js'));
  assert.ok(!g.sante.problemes.some((i) => i.id === 'lien-casse:src/casse.js'));
});

test('sans lien cassé, pas de bloc Introuvable', () => {
  const r = creerProjet({ 'package.json': '{}', 'src/a.js': 'export const a = 1;\n' });
  try {
    executer('analyser.mjs', r);
    ecrireJson(path.join(r, 'la-carte', 'sources', 'architecture.json'), { projet: { name: 'E', summary: 'E' }, nodes: [{ id: 'src', label: 'Code', kind: 'library', summary: 'Le code.', paths: ['src'] }] });
    executer('construire.mjs', r);
    assert.ok(!lireGraphe(r).nodes.some((n) => n.id === 'casse'));
  } finally { nettoyer(r); }
});

test('une adresse dont le début est posé ailleurs n’est pas un lien coupé', () => {
  const racine = creerProjet({
    'package.json': '{}',
    'server/app.py': "from fastapi import APIRouter\nrouter = APIRouter()\n@router.get('/{espace_id}')\ndef lire(espace_id): pass\n@router.get('/contrats')\ndef contrats(): pass\napi = APIRouter(prefix='/api')\n@api.get('/api/sante')\ndef sante(): pass\n",
    'scripts/essai.js': "fetch('/api/espaces');\nfetch('/api/contrats');\nfetch('/api/inconnue/rien/du/tout');\n",
  });
  try {
    executer('analyser.mjs', racine);
    const { casses } = JSON.parse(fs.readFileSync(path.join(racine, 'la-carte', '.cache', 'analyse.json'), 'utf8'));
    const cibles = casses.filter((c) => c.kind === 'adresse').map((c) => c.target);
    assert.ok(!cibles.includes('GET /api/espaces'), cibles.join());
    assert.ok(!cibles.includes('GET /api/contrats'), cibles.join());
  } finally { nettoyer(racine); }
});
