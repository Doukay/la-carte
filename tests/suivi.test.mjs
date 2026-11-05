// « Où j'en suis » : facultatif, lu depuis le fichier réglé, borné au projet, et absent des copies sauf demande.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { creerProjet, ecrireJson, executer, lireGraphe, nettoyer } from './aides.mjs';

const racines = [];
function projet(fichiers = {}) {
  const racine = creerProjet({ 'package.json': '{}', 'src/a.js': 'export const a = 1;\n', ...fichiers });
  racines.push(racine);
  executer('analyser.mjs', racine);
  ecrireJson(path.join(racine, 'la-carte', 'sources', 'architecture.json'), { projet: { name: 'E', summary: 'E.' }, nodes: [{ id: 'src', label: 'Code', kind: 'library', summary: 'Le code.', paths: ['src/**'] }], edges: [] });
  return racine;
}
const regler = (racine, suivi) => ecrireJson(path.join(racine, 'la-carte', 'sources', 'reglages.json'), { suivi });
const construireEtLire = (racine, ...p) => { executer('construire.mjs', racine, ...p); return lireGraphe(racine); };
after(() => { for (const r of racines) nettoyer(r); });

const NOTE = `# Mon projet
<!-- caché : ne doit pas sortir -->
Intro à ignorer.

## Où j'en suis
- Le paiement marche, voir [le détail](docs/paiement.md).
- ~~ancien~~ → nouveau
- Clé collée par erreur : ${'aZ9'.repeat(20)}

### Détail
Sous-partie gardée.

## Journal
Ne doit pas apparaître.

## Prochaine étape
Tester le remboursement.
`;

test('sans réglage, la carte ne parle pas de suivi', () => {
  assert.equal(construireEtLire(projet({ 'etat.md': NOTE })).suivi, undefined);
});

test('seules les sections demandées passent, dans l’ordre demandé, sans commentaire caché, sans lien et sans clé', () => {
  const racine = projet({ 'notes/etat.md': NOTE });
  regler(racine, { fichier: 'notes/etat.md', sections: ['Prochaine étape', "Où j'en suis"] });
  const { suivi } = construireEtLire(racine);
  assert.equal(suivi.fichier, 'etat.md');
  assert.ok(suivi.texte.indexOf('Tester le remboursement') < suivi.texte.indexOf('Le paiement marche'));
  assert.match(suivi.texte, /Sous-partie gardée/);
  assert.match(suivi.texte, /voir le détail\./);
  assert.ok(!/Journal|caché|Intro|docs\/paiement|aZ9aZ9/.test(suivi.texte), suivi.texte);
  assert.match(suivi.texte, /•••/);
  assert.match(suivi.texte, /- nouveau/);
  assert.ok(!suivi.texte.includes('ancien'), 'le barré reste dans le fichier');
  assert.ok(!Number.isNaN(Date.parse(suivi.date)));
  assert.ok(!JSON.stringify(suivi).includes(racine), 'aucun chemin de cet ordinateur');
});

test('une section qui porte le titre de la fiche ne le répète pas, quelle que soit l’apostrophe', () => {
  const racine = projet({ 'etat.md': "## Où j’en suis\nÇa avance.\n\n## Suite\nLa suite.\n" });
  regler(racine, { fichier: 'etat.md', sections: ["Où j'en suis", 'Suite'] });
  const { suivi } = construireEtLire(racine);
  assert.equal(suivi.texte, 'Ça avance.\n\n**Suite**\nLa suite.');
});

test('sans sections, tout le fichier passe, et un très long fichier est coupé', () => {
  const racine = projet({ 'etat.txt': `Début\n${'mot '.repeat(2000)}` });
  regler(racine, { fichier: 'etat.txt' });
  const { suivi } = construireEtLire(racine);
  assert.equal(suivi.coupe, true);
  assert.ok(suivi.texte.length <= 3001);
});

test('le fichier peut être un dossier plus haut, pas davantage, et jamais autre chose que du texte', () => {
  const racine = projet({ 'secret.env': 'x', 'etat.json': '{}' });
  const parent = path.join(racine, '..');
  const voisin = path.join(parent, `note-${path.basename(racine)}.md`);
  fs.writeFileSync(voisin, '## État\nVu au-dessus.\n');
  try {
    regler(racine, { fichier: `../${path.basename(voisin)}` });
    assert.match(construireEtLire(racine).suivi.texte, /Vu au-dessus/);
  } finally { fs.rmSync(voisin, { force: true }); }
  for (const fichier of ['../../loin.md', voisin, 'secret.env', 'etat.json', '', 12]) {
    regler(racine, { fichier });
    assert.equal(construireEtLire(racine).suivi, undefined, String(fichier));
  }
});

test('un fichier absent ou un réglage abîmé préviennent sans empêcher la carte', () => {
  const racine = projet();
  regler(racine, { fichier: 'absent.md' });
  assert.equal(construireEtLire(racine).suivi, undefined);
  fs.writeFileSync(path.join(racine, 'la-carte', 'sources', 'reglages.json'), '{ abîmé');
  assert.equal(construireEtLire(racine).suivi, undefined);
  assert.ok(fs.existsSync(path.join(racine, 'la-carte', 'index.html')));
});

test('une copie exportée ne contient la note que si on la demande, et la copie à publier jamais', () => {
  const racine = projet({ 'etat.md': '## État\nNote très privée.\n' });
  regler(racine, { fichier: 'etat.md' });
  construireEtLire(racine, '--artifact');
  const carte = path.join(racine, 'la-carte');
  assert.ok(fs.readFileSync(path.join(carte, 'index.html'), 'utf8').includes('Note très privée'));
  assert.ok(!fs.readFileSync(path.join(carte, 'artifact.html'), 'utf8').includes('Note très privée'));
  const exporter = (nom, ...p) => {
    const f = path.join(racine, nom);
    execFileSync(process.execPath, [path.join(carte, '.cache', 'serveur.mjs'), '--export', f, ...p], { cwd: racine, stdio: 'pipe' });
    return fs.readFileSync(f, 'utf8');
  };
  assert.ok(!exporter('defaut.html').includes('Note très privée'));
  assert.ok(exporter('avec.html', '--include', 'flows,notes,suivi').includes('Note très privée'));
});
