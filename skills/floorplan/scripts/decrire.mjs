#!/usr/bin/env node
// floorplan describe : transforme le graphe construit en fiches de travail par module, que Claude (ou des sous-agents
// en parallèle) utilise pour écrire un nom lisible et une description d’une ligne pour chaque fichier et chaque route.
//
// usage : node decrire.mjs [racine]                  écrit les fiches de travail et les squelettes de description, affiche un index
//        node decrire.mjs [racine] --all            inclut aussi les entrées qui ont déjà une description
//        node decrire.mjs [racine] --max-files 40   nombre de fichiers par fiche avant de la découper en morceaux
//
// Lance d’abord construire.mjs : les fiches de travail sont générées à partir de floorplan/graphe.json.

import fs from 'node:fs';
import path from 'node:path';
import { lireArguments, formaterNombre, dossierCarte } from './lib/commun.mjs';
import { nomFichierParDefaut, nomRouteParDefaut, cleRoute } from './lib/noms.mjs';

const params = lireArguments(process.argv.slice(2));
const racine = path.resolve(params._[0] || '.');
const dossierSortie = dossierCarte(racine);
const fichierGraphe = path.join(dossierSortie, 'graphe.json');
if (!fs.existsSync(fichierGraphe)) { console.error('✗ Pas de floorplan/graphe.json. Lance d’abord construire.mjs.'); process.exit(1); }
const g = JSON.parse(fs.readFileSync(fichierGraphe, 'utf8'));
const maxFichiers = Number(params['max-files']) || 40;
const dossierFiches = path.join(dossierSortie, '.cache', 'worksheets');
const dossierDescriptions = path.join(dossierSortie, 'descriptions');
fs.mkdirSync(dossierFiches, { recursive: true });
fs.mkdirSync(dossierDescriptions, { recursive: true });
for (const f of fs.readdirSync(dossierFiches)) fs.unlinkSync(path.join(dossierFiches, f));

const partiesParId = new Map(g.nodes.map((n) => [n.id, n]));
const fichierParChemin = new Map(g.files.map((f) => [f.p, f]));
const etiquette = (id) => partiesParId.get(id)?.label || id;
// Pour qui la carte est écrite (le "audience" de architecture.json, copié dans graph.meta par construire.mjs).
const publicCible = g.meta?.audience === 'developers' ? 'developers' : 'everyone';
const STYLE = publicCible === 'developers'
  ? 'un style technique pour des ingénieurs : nomme les frameworks, les patterns et les mécanismes quand ça aide.'
  : 'un langage simple pour un propriétaire non technique : ce que ça fait pour l’activité ou pour ses utilisateurs, avec des mots de tous les jours, mais précis. Pas de jargon (endpoint, ORM, blueprint, webhook, worker…) : le chemin et la méthode ou l’URL sont déjà affichés à côté. Voir « Langage simple » dans references/ecrire-les-descriptions.md.';

// fichier -> voisins, résumés par partie propriétaire
const utilisations = new Map(), utilisateurs = new Map();
const incrementer = (m, k, v) => { if (!m.has(k)) m.set(k, new Map()); m.get(k).set(v, (m.get(k).get(v) || 0) + 1); };
for (const l of g.links) {
  if (!l.a.startsWith('f:')) continue;
  const a = l.a.slice(2);
  const partieB = l.b.startsWith('f:') ? fichierParChemin.get(l.b.slice(2))?.n : l.b.slice(2);
  if (partieB) incrementer(utilisations, a, etiquette(partieB));
  if (l.b.startsWith('f:')) { const partieA = fichierParChemin.get(a)?.n; if (partieA) incrementer(utilisateurs, l.b.slice(2), etiquette(partieA)); }
}
const principaux = (m, n = 5) => m ? [...m.entries()].sort((x, y) => y[1] - x[1]).slice(0, n).map(([k, v]) => `${k}${v > 1 ? ` ×${v}` : ''}`).join(', ') : '';

const routesParFichier = new Map();
for (const r of g.routes || []) { if (!routesParFichier.has(r.f)) routesParFichier.set(r.f, []); routesParFichier.get(r.f).push(r); }

const aBesoin = (f) => params.all || f.auto || f.review;
const parPartie = new Map();
for (const f of g.files) {
  const routesFichier = routesParFichier.get(f.p) || [];
  if (!aBesoin(f) && !routesFichier.some((r) => params.all || r.auto || r.review)) continue;
  if (!parPartie.has(f.n)) parPartie.set(f.n, []);
  parPartie.get(f.n).push(f);
}

const index = [];
for (const [idPartie, liste] of parPartie) {
  liste.sort((a, b) => a.p.localeCompare(b.p));
  // Découper en morceaux d’au plus maxFichiers fichiers ou ~100 routes, au premier des deux atteint.
  const morceaux = [[]];
  let routesDansMorceau = 0;
  for (const f of liste) {
    const nbRoutes = (routesParFichier.get(f.p) || []).length;
    const courant = morceaux[morceaux.length - 1];
    if (courant.length && (courant.length >= maxFichiers || routesDansMorceau + nbRoutes > 100)) { morceaux.push([]); routesDansMorceau = 0; }
    morceaux[morceaux.length - 1].push(f);
    routesDansMorceau += nbRoutes;
  }
  const nbMorceaux = morceaux.length;
  for (let i = 0; i < nbMorceaux; i++) {
    const morceau = morceaux[i];
    const cle = nbMorceaux > 1 ? `${idPartie}--${i + 1}` : idPartie;
    const fichierDescription = path.join(dossierDescriptions, `${cle}.json`);
    const n = partiesParId.get(idPartie);
    const sortie = [];
    sortie.push(`# Fiche de travail ${cle} : ${n?.label || idPartie}${nbMorceaux > 1 ? ` (morceau ${i + 1}/${nbMorceaux})` : ''}`);
    sortie.push(`Public : ${publicCible}. Écris en français, avec ${STYLE}`);
    if (n?.summary) sortie.push(`Module : ${n.summary}`);
    sortie.push(`À écrire dans : floorplan/descriptions/${cle}.json (un squelette y est déjà ; remplis chaque "description", améliore chaque "name").`);
    sortie.push('Les entrées marquées À REVOIR ont déjà une description mais leur code a changé : mets à jour name et description si le changement compte, puis supprime le champ "review". Les entrées absentes de cette fiche sont bonnes : n’y touche pas.');
    sortie.push('');
    let nbRoutesFiche = 0;
    for (const f of morceau) {
      sortie.push(`## ${f.p}  (${formaterNombre(f.loc)} lignes, ${f.l})${f.review ? '  À REVOIR' : !aBesoin(f) ? '  (déjà décrit ; seules ses routes sont à traiter)' : ''}`);
      if (f.review) sortie.push(`actuel : ${f.name} — ${f.d}
changement : ${f.review}`);
      if (f.doc) sortie.push(`doc : ${f.doc}`);
      if (f.s?.length) {
        const symboles = f.s.slice(0, 12).map((s) => `${s[0]}${s[1] === 'function' ? '()' : ''}${s[4] ? ` (${s[4]})` : ''}`);
        sortie.push(`définit : ${symboles.join('; ')}${f.s.length > 12 ? `; … +${f.s.length - 12}` : ''}`);
      }
      const u = principaux(utilisations.get(f.p)), b = principaux(utilisateurs.get(f.p));
      if (u) sortie.push(`utilise : ${u}`);
      if (b) sortie.push(`utilisé par : ${b}`);
      for (const r of routesParFichier.get(f.p) || []) {
        nbRoutesFiche++;
        const marque = r.review ? `  À REVOIR (${r.review}) ; actuel : ${r.name} — ${r.d}` : r.auto ? '  NOUVEAU' : '  (décrit)';
        sortie.push(`adresse du serveur : ${cleRoute({ method: r.m, path: r.p })}  gestionnaire ${r.h || '?'}${r.doc ? ` (${r.doc})` : ''}${marque}`);
      }
      sortie.push('');
    }
    fs.writeFileSync(path.join(dossierFiches, `${cle}.md`), sortie.join('\n'));

    // squelette : garder tout ce qui est déjà écrit, ajouter les clés manquantes
    let existant = {};
    try { existant = JSON.parse(fs.readFileSync(fichierDescription, 'utf8')); } catch {}
    const squelette = { files: { ...(existant.files || {}) }, routes: { ...(existant.routes || {}) } };
    for (const f of morceau) {
      if (!squelette.files[f.p]) squelette.files[f.p] = { name: f.auto ? nomFichierParDefaut(f.p) : f.name, description: f.auto ? '' : f.d };
      for (const r of routesParFichier.get(f.p) || []) {
        const k = cleRoute({ method: r.m, path: r.p });
        if (!squelette.routes[k]) squelette.routes[k] = { name: r.auto ? nomRouteParDefaut({ handler: r.h, method: r.m, path: r.p }) : r.name, description: r.auto ? '' : r.d };
      }
    }
    if (!Object.keys(squelette.routes).length) delete squelette.routes;
    fs.writeFileSync(fichierDescription, JSON.stringify(squelette, null, 2) + '\n');
    index.push({ key: cle, node: n?.label || idPartie, files: morceau.length, routes: nbRoutesFiche, loc: morceau.reduce((s, f) => s + f.loc, 0) });
  }
}

if (!index.length) { console.log('✓ Chaque fichier et chaque route a déjà une description. Utilise --all pour régénérer les fiches de travail de tout.'); process.exit(0); }
const totaux = index.reduce((s, w) => ({ files: s.files + w.files, routes: s.routes + w.routes }), { files: 0, routes: 0 });
console.log(`${index.length} fiche(s) de travail dans floorplan/.cache/worksheets/, pour ${totaux.files} fichiers et ${totaux.routes} routes encore à décrire.`);
console.log('Chacune a un squelette correspondant dans floorplan/descriptions/<clé>.json. Remplis-les, puis lance construire.mjs.');
console.log(`Public : ${publicCible}. Écris en français, avec ${STYLE}\n`);
console.log('clé'.padEnd(34) + 'fichiers'.padStart(9) + 'routes'.padStart(8) + 'lignes'.padStart(8) + '  module');
for (const w of index.sort((a, b) => b.files - a.files)) console.log(w.key.padEnd(34) + String(w.files).padStart(9) + String(w.routes).padStart(8) + formaterNombre(w.loc).padStart(8) + '  ' + w.node);
