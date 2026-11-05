// Les liens coupés en Python : seulement les imports relatifs, pour ne pas confondre avec un paquet installé.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { creerProjet, executer, lireJson, nettoyer } from './aides.mjs';

test('en Python, un import relatif introuvable et un nom disparu sont trouvés, sans fausse alerte', () => {
  const r = creerProjet({
    'requirements.txt': 'flask\n',
    'app/__init__.py': '',
    'app/prix.py': 'def calcul():\n    return 1\n',
    'app/tout.py': 'from .prix import *\n',
    'app/noyau/__init__.py': '',
    'app/noyau/base.py': 'connexion = 1\n',
    'app/vue.py': 'import flask\nfrom .prix import calcul, disparue\nfrom .absent import x\nfrom . import prix\nfrom .tout import calcul as c2\nfrom ..hors import y\nfrom .noyau import base\n',
  });
  try {
    executer('analyser.mjs', r);
    const a = lireJson(path.join(r, 'la-carte', '.cache', 'analyse.json'));
    assert.deepEqual(a.casses.filter((c) => c.from === 'app/vue.py').map((c) => `${c.kind} ${c.target}`).sort(), ['fichier ..hors', 'fichier .absent', 'fonction disparue']);
  } finally { nettoyer(r); }
});
