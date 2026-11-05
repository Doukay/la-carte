// Un écran chargé en différé garde son vrai fichier et son vrai nom, même si le chargeur est rangé à part.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { creerProjet, ecrireJson, executer, lireGraphe, nettoyer } from './aides.mjs';

test('un écran chargé par un chargeur rangé à part garde son vrai fichier', () => {
  const racine = creerProjet({
    'package.json': '{"dependencies":{"react-router-dom":"7"}}',
    'src/App.jsx': "const chargerAgenda = () => import('./PageAgenda');\nconst PageAgenda = lazy(chargerAgenda);\nconst PageNotes = lazy(() => import('./PageNotes'));\nexport default () => <Routes><Route path=\"/agenda\" element={<Garde><PageAgenda /></Garde>} /><Route path=\"/notes\" element={<PageNotes />} /></Routes>;\n",
    'src/PageAgenda.jsx': 'export default () => <div>Agenda</div>;\n',
    'src/PageNotes.jsx': 'export default () => <div>Notes</div>;\n',
  });
  try {
    executer('analyser.mjs', racine);
    ecrireJson(path.join(racine, 'la-carte', 'sources', 'architecture.json'), { projet: { name: 'E', summary: 'E.' }, nodes: [{ id: 'web', label: 'Web', kind: 'ui', summary: 'Le site.', paths: ['src/**'] }], edges: [] });
    executer('construire.mjs', racine);
    const parUrl = Object.fromEntries(lireGraphe(racine).ecrans.map((e) => [e.url, e.file]));
    assert.equal(parUrl['/agenda'], 'src/PageAgenda.jsx');
    assert.equal(parUrl['/notes'], 'src/PageNotes.jsx');
  } finally { nettoyer(racine); }
});
