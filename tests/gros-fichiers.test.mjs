// Les fichiers au-dessus de la limite de taille de l’analyse ne sont pas lus, mais ils restent sur la carte avec leur nombre de lignes, et
// l’analyse, la Santé et la carte disent qu’ils n’ont pas été vérifiés (#16). La limite est baissée ici pour garder l’exemple petit.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { creerProjet, executer, lireGraphe, lireJson, nettoyer } from './aides.mjs';

const NB_LIGNES = 1500;
let racine, sortieAnalyse, graphe;
before(() => {
  const gros = Array.from({ length: NB_LIGNES }, (_, i) => `def step_${i}(x):\n    return x + ${i}\n`).join('').split('\n').slice(0, NB_LIGNES).join('\n') + '\n';
  racine = creerProjet({
    'app/main.py': 'from app import rules\n\nprint(rules.step_1(1))\n',
    'app/rules.py': gros,
  }, { arch: { projet: { name: 'Sample', summary: 'A small sample.' }, nodes: [{ id: 'app', label: 'App', kind: 'service', summary: 'The app.', paths: ['app/**'] }] } });
  sortieAnalyse = executer('analyser.mjs', racine, '--max-file-kb', '8');
  executer('construire.mjs', racine, '--no-claude-md');
  graphe = lireGraphe(racine);
});
after(() => nettoyer(racine));

test('un fichier au-dessus de la limite reste sur la carte avec son nombre de lignes', () => {
  const analyse = lireJson(path.join(racine, 'floorplan', '.cache', 'analyse.json'));
  const f = analyse.files.find((x) => x.path === 'app/rules.py');
  assert.equal(f.tooLarge, true);
  assert.equal(f.loc, NB_LIGNES);
  const g = graphe.files.find((x) => x.p === 'app/rules.py');
  assert.equal(g.tooLarge, true);
  assert.equal(g.loc, NB_LIGNES);
  assert.equal(graphe.files.find((x) => x.p === 'app/main.py').tooLarge, undefined);
});

test('l’analyse dit quels fichiers elle n’a pas lus et comment les inclure', () => {
  assert.match(sortieAnalyse, /NON LUS {2}1 fichier\(s\) de plus de 8 Ko/);
  assert.match(sortieAnalyse, /--max-file-kb/);
  assert.match(sortieAnalyse, /Ko {2}app\/rules\.py/);
});

test('la Santé le liste comme gros fichier et dit qu’il n’a pas été vérifié', () => {
  const gros = graphe.sante.problemes.find((i) => i.id === 'large-files');
  assert.ok(gros, 'un élément large-files était attendu');
  assert.match(gros.notes['f:app/rules.py'], /^1\s500 lignes : trop gros pour que Floorplan le lise/);
});

test('la limite par défaut lit un fichier au-dessus de l’ancienne limite de 512 Ko', () => {
  const r = creerProjet({ 'app/main.py': 'x = 1\n'.repeat(110000) });
  try {
    assert.ok(fs.statSync(path.join(r, 'app', 'main.py')).size > 512 * 1024);
    executer('analyser.mjs', r);
    const f = lireJson(path.join(r, 'floorplan', '.cache', 'analyse.json')).files.find((x) => x.path === 'app/main.py');
    assert.equal(f.tooLarge, undefined);
    assert.equal(f.loc, 110000);
  } finally { nettoyer(r); }
});
