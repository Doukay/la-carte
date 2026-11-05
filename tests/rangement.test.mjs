// Le dossier créé dans le projet : la page à la racine, sources/ à garder dans git, .cache/ pour ce qui se refabrique, et Docker prévenu.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { appliBoutique, analyserEtConstruire, executer, nettoyer, lireGraphe } from './aides.mjs';

const git = (racine, ...args) => execFileSync('git', args, { cwd: racine, encoding: 'utf8' });
let racine;
before(() => {
  racine = appliBoutique();
  git(racine, 'init', '-q');
  analyserEtConstruire(racine);
});
after(() => nettoyer(racine));

test('la racine du dossier reste lisible : la page, sources/ et .cache/', () => {
  const noms = fs.readdirSync(path.join(racine, 'la-carte')).sort();
  assert.deepEqual(noms, ['.cache', '.gitignore', 'index.html', 'sources']);
  for (const f of ['graphe.json', 'requete.mjs', 'serveur.mjs']) assert.ok(fs.existsSync(path.join(racine, 'la-carte', '.cache', f)), f);
  assert.ok(fs.existsSync(path.join(racine, 'la-carte', 'sources', 'architecture.json')));
});

test('git voit sources/ et rien de ce qui se refabrique', () => {
  const vus = git(racine, 'status', '--porcelain', '-uall', '--', 'la-carte').split('\n').filter(Boolean).map((l) => l.slice(3));
  assert.ok(vus.includes('la-carte/sources/architecture.json'));
  assert.ok(vus.every((f) => f === 'la-carte/.gitignore' || f.startsWith('la-carte/sources/')), vus.join(', '));
});

test('une carte enregistrée dans git n’est pas analysée comme du code du projet', () => {
  git(racine, 'add', 'la-carte');
  analyserEtConstruire(racine);
  assert.ok(!lireGraphe(racine).files.some((f) => f.p.startsWith('la-carte/')));
});

test('un Dockerfile sans exclusion déclenche un avertissement, et plus après l’ajout dans .dockerignore', () => {
  fs.writeFileSync(path.join(racine, 'Dockerfile'), 'FROM node\nCOPY . .\n');
  assert.match(executer('construire.mjs', racine), /DOCKER {2}! .*la-carte\/.*\.dockerignore/);
  const avantDocker = fs.existsSync(path.join(racine, '.dockerignore'));
  assert.equal(avantDocker, false, 'la carte n’écrit rien hors de son dossier');
  fs.writeFileSync(path.join(racine, '.dockerignore'), 'node_modules\nla-carte/\n');
  assert.doesNotMatch(executer('construire.mjs', racine), /DOCKER/);
});
