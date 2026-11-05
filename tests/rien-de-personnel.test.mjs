// Le dépôt ne connaît ni son auteur, ni son ordinateur, ni l'installation de quelqu'un : le contrôle voit les fuites, et le dépôt n'en a aucune.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { trouverFuites, lireMotsPrives } from '../outils/rien-de-personnel.mjs';

const DEPOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const estDepotGit = fs.existsSync(path.join(DEPOT, '.git'));

function depotEssai() {
  const r = fs.mkdtempSync(path.join(os.tmpdir(), 'la-carte-perso-'));
  const git = (...a) => execFileSync('git', ['-c', 'user.name=essai', '-c', 'user.email=essai@exemple.fr', ...a], { cwd: r, stdio: 'pipe' });
  git('init', '-q');
  return { r, git, ecrire: (f, t) => fs.writeFileSync(path.join(r, f), t), fin: () => fs.rmSync(r, { recursive: true, force: true }) };
}

test('ce dépôt ne contient rien de personnel, ni dans ses fichiers ni dans son histoire', { skip: !estDepotGit }, () => {
  assert.deepEqual(trouverFuites(DEPOT, lireMotsPrives(DEPOT)), []);
});

test('un chemin, une adresse privée ou le hub dans un fichier suivi sont signalés', () => {
  const d = depotEssai();
  try {
    d.ecrire('a.md', 'Voir C:\\Dev\\projet\n');
    d.ecrire('b.js', 'const s = "192.168.1.20";\n');
    d.ecrire('c.md', 'Publié dans mon hub.\n');
    d.ecrire('d.md', 'Le serveur media-center.\n');
    d.ecrire('propre.js', "fetch('/users/1'); // GitHub, x-hub-signature\n");
    d.git('add', '-A');
    const f = trouverFuites(d.r).join('\n');
    assert.match(f, /a\.md:1/);
    assert.match(f, /b\.js:1/);
    assert.match(f, /c\.md:1/);
    assert.match(f, /d\.md:1/);
    assert.ok(!f.includes('propre.js'), f);
  } finally { d.fin(); }
});

test('un mot privé est trouvé jusque dans l’historique, sans être répété dans le résultat', () => {
  const d = depotEssai();
  try {
    d.ecrire('a.md', 'signé Durandal\n');
    d.git('add', '-A');
    d.git('commit', '-qm', 'depart');
    assert.equal(trouverFuites(d.r, []).length, 0, 'sans la liste, ce mot n’est pas connu');
    d.ecrire('a.md', 'signé\n');
    d.git('add', '-A');
    d.git('commit', '-qm', 'retire');
    const f = trouverFuites(d.r, ['durandal']);
    assert.ok(f.some((x) => x.includes('historique')), f.join('\n'));
    assert.ok(!f.join('\n').toLowerCase().includes('durandal'));
  } finally { d.fin(); }
});

test('la signature d’un commit est contrôlée', () => {
  const d = depotEssai();
  try {
    d.ecrire('a.md', 'x\n');
    d.git('add', '-A');
    d.git('commit', '-qm', 'depart');
    assert.ok(trouverFuites(d.r, ['essai@exemple.fr']).some((x) => x.includes('signature')));
  } finally { d.fin(); }
});
