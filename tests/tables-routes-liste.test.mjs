// Une table d'adresses écrite en liste, comme dans un serveur sans framework.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { creerProjet, executer, lireJson, nettoyer } from './aides.mjs';

test('[\'GET\', \'/api/state\', state.getState] donne une adresse du serveur avec sa fonction, et une table d’autre chose n’en donne pas', () => {
  const r = creerProjet({
    'package.json': '{}',
    'server/router.js': "const ROUTES = [\n  ['GET', '/api/state', state.getState],\n  ['PUT', '/api/state', state.putState],\n  ['POST', '/api/import/:store', imports.postImport],\n];\nmodule.exports = { ROUTES };\n",
    'web/api.js': "export const lire = () => fetch('/api/state');\n",
    'data/couleurs.js': "export const LIGNES = [\n  ['GET', '/vert', 'couleur'],\n  ['PUT', '/rouge', 12],\n];\n",
  });
  try {
    executer('analyser.mjs', r);
    const a = lireJson(path.join(r, 'la-carte', '.cache', 'analyse.json'));
    assert.deepEqual(a.routes.map((x) => `${x.method} ${x.path} ${x.handler}`).sort(), ['GET /api/state getState', 'POST /api/import/:store postImport', 'PUT /api/state putState']);
    assert.ok(a.http.some((h) => h.from === 'web/api.js' && h.to === 'server/router.js'));
  } finally { nettoyer(r); }
});
