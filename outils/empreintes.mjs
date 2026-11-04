// Empreintes SHA-256 de chaque fichier d'où le plugin tourne, pour vérifier qu'une copie installée est
// exactement une version. Chaque version enregistre EMPREINTES.txt ; --check compare un dossier avec lui.
// usage : node outils/empreintes.mjs                    écrit EMPREINTES.txt pour cette copie de travail
//         node outils/empreintes.mjs --check <dossier>  compare une copie installée avec EMPREINTES.txt
// --list <fichier> lit ou écrit une autre liste à la place d'EMPREINTES.txt (les tests s'en servent).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const DEPOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// d'où le plugin tourne : le skill, les manifestes du plugin et les marketplaces qui pointent vers eux
const PARTIES = ['skills', '.claude-plugin', '.codex-plugin', '.agents', 'package.json'];
const indiceListe = process.argv.indexOf('--list');
const SORTIE = indiceListe > 0 ? path.resolve(process.argv[indiceListe + 1]) : path.join(DEPOT, 'EMPREINTES.txt');

function lister(racine) {
  const liste = [];
  for (const partie of PARTIES) {
    const p = path.join(racine, partie);
    if (!fs.existsSync(p)) continue;
    if (fs.statSync(p).isFile()) { liste.push(partie); continue; }
    for (const e of fs.readdirSync(p, { recursive: true, withFileTypes: true })) {
      if (e.isFile()) liste.push(path.relative(racine, path.join(e.parentPath ?? e.path, e.name)).replace(/\\/g, '/'));
    }
  }
  return liste.sort();
}
const empreinte = (racine, f) => crypto.createHash('sha256').update(fs.readFileSync(path.join(racine, f))).digest('hex');

const indiceControle = process.argv.indexOf('--check');
if (indiceControle < 0) {
  const version = JSON.parse(fs.readFileSync(path.join(DEPOT, '.claude-plugin', 'plugin.json'), 'utf8')).version;
  const lignes = lister(DEPOT).map((f) => `${empreinte(DEPOT, f)}  ${f}`);
  fs.writeFileSync(SORTIE, [
    `# Floorplan ${version}: SHA-256 de chaque fichier d'où le plugin tourne.`,
    `# Vérifier une copie installée : récupère cette version, puis lance node outils/empreintes.mjs --check <dossier installé>.`,
    ...lignes, '',
  ].join('\n'));
  console.log(`✓ ${path.basename(SORTIE)} écrit pour Floorplan ${version} (${lignes.length} fichiers)`);
  process.exit(0);
}

const dossier = process.argv[indiceControle + 1];
if (!dossier || !fs.existsSync(dossier)) { console.error('usage : node outils/empreintes.mjs --check <dossier du plugin installé>'); process.exit(1); }
const texte = fs.readFileSync(SORTIE, 'utf8');
const version = /^# Floorplan (\S+):/m.exec(texte)?.[1] || '?';
const attendus = new Map(texte.split('\n').filter((l) => /^[0-9a-f]{64}  /.test(l)).map((l) => [l.slice(66), l.slice(0, 64)]));
const presents = lister(dossier);
const modifies = presents.filter((f) => attendus.has(f) && attendus.get(f) !== empreinte(dossier, f));
const enTrop = presents.filter((f) => !attendus.has(f));
const manquants = [...attendus.keys()].filter((f) => !presents.includes(f));
if (!modifies.length && !enTrop.length && !manquants.length) {
  console.log(`✓ ${dossier} correspond à Floorplan ${version} : les ${attendus.size} fichiers sont identiques.`);
  process.exit(0);
}
console.log(`✗ ${dossier} ne correspond pas à Floorplan ${version}.`);
for (const [titre, fichiers] of [['Modifiés', modifies], ['Absents de la version', enTrop], ['Manquants', manquants]]) {
  if (fichiers.length) console.log(`${titre} :\n${fichiers.map((f) => `  ${f}`).join('\n')}`);
}
process.exit(1);
