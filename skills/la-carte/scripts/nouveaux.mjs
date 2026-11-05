#!/usr/bin/env node
// la-carte nouveaux : le travail du bouton Décrire de la carte. Donne le prochain lot de fichiers et d'adresses du serveur
// sans description, puis enregistre ce que Claude a répondu après l'avoir contrôlé. Claude n'écrit rien lui-même.
//
// usage : node nouveaux.mjs [racine] --liste                  écrit le lot en JSON (ce qu'il faut demander à Claude)
//        node nouveaux.mjs [racine] --enregistrer <fichier>  contrôle la réponse et l'écrit dans la-carte/sources/descriptions/

import fs from 'node:fs';
import path from 'node:path';
import { lireArguments, dossierCarte, ICONES } from './lib/commun.mjs';
import { cleRoute } from './lib/noms.mjs';

const LOT = 40;
const NOM_MAX = 70;
const DESCRIPTION_MAX = 260;
// une suite aussi longue sans espace dans un texte pour un humain : une clé plutôt qu'une phrase
const RESSEMBLE_A_UNE_CLE = /[A-Za-z0-9+/_=-]{40,}/;

const params = lireArguments(process.argv.slice(2));
const racine = path.resolve(params._[0] || '.');
const dossierSortie = dossierCarte(racine);
const fichierGraphe = path.join(dossierSortie, '.cache', 'graphe.json');
if (!fs.existsSync(fichierGraphe)) { console.error('✗ Pas de la-carte/.cache/graphe.json. Lance d’abord construire.mjs.'); process.exit(1); }
const g = JSON.parse(fs.readFileSync(fichierGraphe, 'utf8'));
const dossierDescriptions = path.join(dossierSortie, 'sources', 'descriptions');

const cleDe = (r) => cleRoute({ method: r.m, path: r.p });

/** Le prochain lot : les fichiers dans l'ordre, chacun avec ses adresses, pour que Claude les voie ensemble. */
function prochainLot() {
  const routesAuto = (g.routes || []).filter((r) => r.auto);
  const chemins = [...new Set([...g.files.filter((f) => f.auto).map((f) => f.p), ...routesAuto.map((r) => r.f)])].sort();
  const parChemin = new Map(g.files.map((f) => [f.p, f]));
  const fichiers = [], routes = [];
  for (const p of chemins) {
    if (fichiers.length + routes.length >= LOT) break;
    const f = parChemin.get(p);
    if (f?.auto) fichiers.push(f);
    for (const r of routesAuto) if (r.f === p && fichiers.length + routes.length < LOT) routes.push(r);
  }
  return { total: g.files.filter((f) => f.auto).length + routesAuto.length, fichiers, routes };
}

function demandeDuLot({ fichiers, routes }) {
  const lignes = [];
  if (fichiers.length) lignes.push('Fichiers :');
  for (const f of fichiers) {
    const symboles = (f.s || []).slice(0, 8).map((s) => s[0]).join(', ');
    lignes.push(`- ${f.p} (${f.loc} lignes${symboles ? `, définit ${symboles}` : ''}${f.doc ? `, commentaire : ${f.doc}` : ''})`);
  }
  if (routes.length) lignes.push('', 'Adresses du serveur :');
  for (const r of routes) lignes.push(`- ${cleDe(r)} (dans ${r.f}${r.h ? `, gestionnaire ${r.h}` : ''})`);
  lignes.push('', `Icônes possibles pour un fichier : ${ICONES.join(', ')}.`);
  return lignes.join('\n');
}

const texteValide = (v, max) => {
  if (typeof v !== 'string') return null;
  const t = v.replace(/\s+/g, ' ').trim();
  return t && t.length <= max && !RESSEMBLE_A_UNE_CLE.test(t) ? t : null;
};

/** Ne retient que ce qui a été demandé et qui a la forme d'un nom et d'une phrase : une réponse de Claude reste une donnée à contrôler. */
function enregistrer(reponse) {
  const lot = prochainLot();
  const fichiersDemandes = new Map(lot.fichiers.map((f) => [f.p, f]));
  const routesDemandees = new Map(lot.routes.map((r) => [cleDe(r), r]));
  const parChemin = new Map(g.files.map((f) => [f.p, f]));
  const retenues = [];
  let rejetes = 0;
  const trier = (liste, cleEntree, demandes, section, partie) => {
    for (const x of Array.isArray(liste) ? liste : []) {
      const cle = String(x?.[cleEntree] ?? '');
      const name = texteValide(x?.name, NOM_MAX), description = texteValide(x?.description, DESCRIPTION_MAX);
      if (!demandes.has(cle) || !name || !description) { rejetes++; continue; }
      const icone = section === 'files' && ICONES.includes(x.icon) ? { icon: x.icon } : {};
      retenues.push({ section, cle, partie: partie(demandes.get(cle)), valeur: { name, description, ...icone } });
    }
  };
  trier(reponse?.files, 'path', fichiersDemandes, 'files', (f) => f.n);
  trier(reponse?.routes, 'key', routesDemandees, 'routes', (r) => parChemin.get(r.f)?.n || 'adresses');

  fs.mkdirSync(dossierDescriptions, { recursive: true });
  // un fichier illisible n'est jamais écrasé : il contient peut-être des descriptions écrites à la main
  const existants = new Map();
  for (const nom of fs.readdirSync(dossierDescriptions).filter((n) => n.endsWith('.json')).sort()) {
    try { existants.set(nom, JSON.parse(fs.readFileSync(path.join(dossierDescriptions, nom), 'utf8'))); }
    catch { console.error(`✗ sources/descriptions/${nom} n’est pas un JSON valide. Corrige-le, puis réessaie.`); process.exit(1); }
  }
  const modifies = new Set();
  for (const { section, cle, partie, valeur } of retenues) {
    // là où l'élément est déjà rangé, sinon dans le fichier de sa partie
    const deja = [...existants].filter(([, d]) => d?.[section]?.[cle]).map(([nom]) => nom);
    const cibles = deja.length ? deja : [`${String(partie).replace(/[^\p{L}\p{N}._-]+/gu, '-')}.json`];
    for (const nom of cibles) {
      if (!existants.has(nom)) existants.set(nom, { files: {} });
      const d = existants.get(nom);
      d[section] = d[section] || {};
      d[section][cle] = { ...d[section][cle], ...valeur };
      modifies.add(nom);
    }
  }
  for (const nom of modifies) fs.writeFileSync(path.join(dossierDescriptions, nom), JSON.stringify(existants.get(nom), null, 2) + '\n');
  return { ok: true, ecrits: retenues.length, rejetes, restants: lot.total - retenues.length };
}

if (params.liste) {
  const lot = prochainLot();
  console.log(JSON.stringify({ total: lot.total, demande: demandeDuLot(lot) }));
} else if (typeof params.enregistrer === 'string') {
  console.log(JSON.stringify(enregistrer(JSON.parse(fs.readFileSync(params.enregistrer, 'utf8')))));
} else {
  console.error('usage : node nouveaux.mjs [racine] --liste | --enregistrer <fichier>');
  process.exit(1);
}
