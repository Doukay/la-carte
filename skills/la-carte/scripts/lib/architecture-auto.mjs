// Premier découpage d’un projet en parties, sans Claude : un dossier de tête devient une partie, et le dossier qui porte
// l’essentiel du code est découpé un niveau plus bas. Sert à sans-claude.mjs quand personne n’a encore écrit
// sources/architecture.json ; Claude le remplace dès qu’on lui demande la carte.
import { humaniser } from './noms.mjs';

const TYPES = [
  [/^(tests?|__tests__|spec|e2e|cypress|playwright)$/i, 'test'],
  [/^(scripts?|bin|tools|outils)$/i, 'script'],
  [/^(\.github|infra|deploy|docker|ops|terraform|k8s|helm)$/i, 'infra'],
  [/^(config|conf|settings|reglages)$/i, 'config'],
  [/^(db|database|migrations?|data|donnees|prisma|models?|schemas?)$/i, 'data'],
  [/^(frontend|front|web|client|ui|app|site|pages|components|composants|views|ecrans|public|static|www|mobile)$/i, 'ui'],
  [/^(backend|back|server|serveur|api|routes|services?|functions)$/i, 'service'],
  [/^(lib|libs|packages|shared|common|core|utils|commun)$/i, 'library'],
  [/^(workers?|jobs|queues?|cron|taches)$/i, 'worker'],
];
const typeDe = (nom, parDefaut = 'feature') => TYPES.find(([m]) => m.test(nom))?.[1] || parDefaut;
const ENVELOPPES = /^(src|app|lib|source|sources)$/i;

function grouper(fichiers, profondeur) {
  const groupes = new Map();
  for (const f of fichiers) {
    const segments = f.path.split('/');
    const cle = segments.length > profondeur + 1 ? segments[profondeur] : '';
    if (!groupes.has(cle)) groupes.set(cle, []);
    groupes.get(cle).push(f);
  }
  return [...groupes.entries()].sort((a, b) => b[1].length - a[1].length);
}

/** sources/architecture.json minimal pour les fichiers de code de `analyse` (le contenu de .cache/analyse.json). */
export function architectureAuto(analyse, nomProjet) {
  const code = analyse.files.filter((f) => f.category === 'code');
  const noeuds = [], pris = new Set();
  const identifiant = (brut) => {
    const base = String(brut).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'partie';
    let id = base === 'unassigned' ? 'non-range' : base;
    for (let n = 2; pris.has(id); n++) id = `${base}-${n}`;
    pris.add(id);
    return id;
  };
  for (const [tete, liste] of grouper(code, 0)) {
    if (!tete) {
      noeuds.push({ id: identifiant('racine'), label: 'Fichiers à la racine', kind: 'feature', summary: 'Les fichiers de code posés à la racine du projet.', paths: liste.map((f) => f.path) });
      continue;
    }
    const id = identifiant(tete);
    noeuds.push({ id, label: humaniser(tete), kind: typeDe(tete), summary: `Le dossier ${tete}/ (${liste.length} fichier${liste.length > 1 ? 's' : ''} de code).`, paths: [tete] });
    if (liste.length < 30 || liste.length < code.length / 2) continue;
    // un dossier qui porte l’essentiel du code est découpé un niveau plus bas ; on traverse les dossiers enveloppes (frontend/src)
    let prefixe = tete, profondeur = 1, sous = grouper(liste, profondeur);
    while (sous.length === 1 && sous[0][0] && (ENVELOPPES.test(sous[0][0]) || profondeur < 3)) {
      prefixe += '/' + sous[0][0];
      sous = grouper(liste, ++profondeur);
    }
    for (const [nom, fichiers] of sous) {
      if (!nom || fichiers.length < 2) continue;
      noeuds.push({ id: `${id}.${identifiant(nom)}`, parent: id, label: humaniser(nom), kind: typeDe(nom, typeDe(tete)), summary: `Le dossier ${prefixe}/${nom}/ (${fichiers.length} fichiers de code).`, paths: [`${prefixe}/${nom}`] });
    }
  }
  return {
    auto: true,
    projet: { name: nomProjet, summary: 'Carte faite sans Claude : les parties suivent les dossiers et attendent d’être décrites.' },
    nodes: noeuds,
  };
}
