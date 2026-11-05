// « Où j'en suis » sur la fiche du projet : une note de suivi écrite par la personne, dans le fichier texte de son choix.
// Facultatif : sans réglage, la carte n'en parle pas. Réglage dans la-carte/sources/reglages.json :
//   { "suivi": { "fichier": "notes/etat.md", "sections": ["Où j'en suis", "Prochaine étape"] } }
// `sections` est facultatif : sans lui, tout le fichier. Le chemin part de la racine du projet et peut remonter d'un dossier, pas plus.
import fs from 'node:fs';
import path from 'node:path';

const EXTENSIONS = new Set(['.md', '.txt']);
const TAILLE_MAX = 200 * 1024;
const TEXTE_MAX = 3000;
const RESSEMBLE_A_UNE_CLE = /[A-Za-z0-9+/_=-]{40,}/g;
const titreComparable = (t) => String(t).trim().toLowerCase().replace(/’/g, "'");
const TITRE_FICHE = "où j'en suis";

/** Les sections demandées, dans l'ordre demandé : chacune va de son titre au prochain titre de même niveau ou plus haut. */
function extraireSections(texte, voulues) {
  const lignes = texte.split(/\r?\n/);
  const morceaux = [];
  for (const voulue of voulues) {
    const cible = titreComparable(voulue);
    const debut = lignes.findIndex((l) => /^#{1,6}\s/.test(l) && titreComparable(l.replace(/^#+\s+/, '')) === cible);
    if (debut < 0) continue;
    const niveau = /^#+/.exec(lignes[debut])[0].length;
    let fin = debut + 1;
    while (fin < lignes.length && !(/^#{1,6}\s/.test(lignes[fin]) && /^#+/.exec(lignes[fin])[0].length <= niveau)) fin++;
    const corps = lignes.slice(debut + 1, fin).join('\n').trim();
    // la fiche a déjà ce titre : ne pas le dire deux fois
    morceaux.push(cible === TITRE_FICHE ? corps : `**${lignes[debut].replace(/^#+\s+/, '').trim()}**\n${corps}`);
  }
  return morceaux.join('\n\n');
}

/** Le chemin réglé, s'il reste dans ce qu'on accepte de lire ; un dépôt récupéré ailleurs ne doit pas faire lire n'importe quoi. */
function cheminAutorise(racine, fichier) {
  if (typeof fichier !== 'string' || !fichier.trim() || path.isAbsolute(fichier) || /^[A-Za-z]:/.test(fichier)) return null;
  if (!EXTENSIONS.has(path.extname(fichier).toLowerCase())) return null;
  const plein = path.resolve(racine, fichier);
  const relatif = path.relative(path.dirname(racine), plein);
  if (relatif.startsWith('..') || path.isAbsolute(relatif)) return null;
  return plein;
}

export function lireSuivi(racine, dossierCarte, avertir) {
  let reglages;
  try { reglages = JSON.parse(fs.readFileSync(path.join(dossierCarte, 'sources', 'reglages.json'), 'utf8')); }
  catch (e) { if (e.code !== 'ENOENT') avertir(`sources/reglages.json n’est pas un JSON valide : ${e.message}`); return null; }
  const suivi = reglages?.suivi;
  if (!suivi) return null;
  const plein = cheminAutorise(racine, suivi.fichier);
  if (!plein) { avertir('sources/reglages.json : "suivi.fichier" doit être un fichier .md ou .txt, donné depuis la racine du projet, un dossier plus haut au maximum.'); return null; }
  let vrai, infos;
  try { vrai = fs.realpathSync(plein); infos = fs.statSync(vrai); }
  catch { avertir(`Le fichier de suivi ${suivi.fichier} est introuvable : la fiche du projet ne montre pas « Où j’en suis ».`); return null; }
  // un lien symbolique ne sort pas du périmètre non plus
  if (!cheminAutorise(fs.realpathSync(racine), path.relative(fs.realpathSync(racine), vrai)) || !infos.isFile() || infos.size > TAILLE_MAX) { avertir(`Le fichier de suivi ${suivi.fichier} n’a pas été lu : il sort du projet ou dépasse 200 Ko.`); return null; }
  const brut = fs.readFileSync(vrai, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  let texte = Array.isArray(suivi.sections) && suivi.sections.length ? extraireSections(brut, suivi.sections) : brut.trim();
  texte = texte
    .replace(RESSEMBLE_A_UNE_CLE, '•••')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // un lien du fichier ne mène nulle part depuis la carte
    .replace(/\n{3,}/g, '\n\n');
  if (!texte.trim()) { avertir(`Le fichier de suivi ${suivi.fichier} ne contient aucune des sections demandées.`); return null; }
  const coupe = texte.length > TEXTE_MAX;
  return { fichier: path.basename(vrai), texte: coupe ? `${texte.slice(0, TEXTE_MAX).trimEnd()}…` : texte, ...(coupe ? { coupe: true } : {}), date: infos.mtime.toISOString() };
}
