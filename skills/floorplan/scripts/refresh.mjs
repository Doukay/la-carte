#!/usr/bin/env node
// floorplan refresh : remet à jour une carte existante sans tout refaire.
// Ré-analyse, compare avec la dernière construction (graph.json), met en accord descriptions/*.json
// (renommages reportés, entrées supprimées retirées, entrées dont les exports ou les routes ont changé
// marquées "review"), reconstruit, puis dit précisément ce qu’il reste à regarder pour Claude.
//
// usage : node refresh.mjs [racine]

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { compilerMotif, lireArguments, dossierCarte } from './lib/common.mjs';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const params = lireArguments(process.argv.slice(2));
const racine = path.resolve(params._[0] || '.');
const dossierSortie = dossierCarte(racine);
const fichierGraphe = path.join(dossierSortie, 'graph.json');
const fichierArchi = path.join(dossierSortie, 'architecture.json');
if (!fs.existsSync(fichierGraphe) || !fs.existsSync(fichierArchi)) {
  console.log('Il n’y a pas encore de carte ici (floorplan/graph.json + architecture.json). Fais plutôt une première construction complète.');
  process.exit(0);
}
const ancien = JSON.parse(fs.readFileSync(fichierGraphe, 'utf8'));
const archi = JSON.parse(fs.readFileSync(fichierArchi, 'utf8'));

// Un plan est redessiné d’après plan.json, pas d’après le code. --from-code cartographie à la place le vrai code
// (plan.json est conservé : le plan peut être redessiné avec plan.mjs + build.mjs).
if (ancien.meta?.ebauche && !params['from-code']) {
  const lancer = (script, ...reste) => execFileSync(process.execPath, [path.join(ICI, script), racine, ...reste], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
  try {
    process.stdout.write(lancer('plan.mjs') + '\n' + lancer('build.mjs', ...process.argv.slice(2).filter((a) => a.startsWith('--'))));
  } catch (e) { process.stdout.write(String(e.stdout || '')); process.exit(1); }
  console.log('\nENSUITE  Cette carte est un plan, redessiné d’après floorplan/plan.json. Modifie plan.json et architecture.json pour changer le plan. Quand le code existera, lance refresh.mjs --from-code pour obtenir une carte du vrai code ; plan.json reste en place.');
  process.exit(0);
}

// ---------- 1. nouvelle analyse (aucun jeton) ----------
const executableNode = process.execPath;
execFileSync(executableNode, [path.join(ICI, 'scan.mjs'), racine], { stdio: ['ignore', 'ignore', 'inherit'] });
const analyse = JSON.parse(fs.readFileSync(path.join(dossierSortie, '.cache', 'scan.json'), 'utf8'));

const categoriesInclus = Array.isArray(archi.include) ? archi.include : ['code'];
const ignores = (archi.ignore || []).map(compilerMotif);
const maintenant = new Map(analyse.files.filter((f) => categoriesInclus.includes(f.category) && !ignores.some((g) => g.test(f.path))).map((f) => [f.path, f]));
const avant = new Map(ancien.files.map((f) => [f.p, f]));

// ---------- 2. comparer les fichiers ----------
const ajoutes = [...maintenant.keys()].filter((p) => !avant.has(p));
const disparus = [...avant.keys()].filter((p) => !maintenant.has(p));
const modifies = [...maintenant.keys()].filter((p) => avant.has(p) && avant.get(p).h && maintenant.get(p).h !== avant.get(p).h);
const empreinteChangee = modifies.filter((p) => avant.get(p).sig && maintenant.get(p).sig !== avant.get(p).sig);

// renommages : même contenu, ou même nom de fichier et même empreinte
const renommages = new Map();
const ajoutesRestants = new Set(ajoutes);
for (const r of disparus) {
  const o = avant.get(r);
  let correspondance = o.h ? [...ajoutesRestants].find((a) => maintenant.get(a).h === o.h) : null;
  if (!correspondance) {
    const candidats = [...ajoutesRestants].filter((a) => path.posix.basename(a) === path.posix.basename(r) && (!o.sig || maintenant.get(a).sig === o.sig));
    if (candidats.length === 1) correspondance = candidats[0];
  }
  if (correspondance) { renommages.set(r, correspondance); ajoutesRestants.delete(correspondance); }
}
const supprimes = disparus.filter((r) => !renommages.has(r));
const crees = [...ajoutesRestants];

// ce qui a changé dans les exports et les routes d’un fichier, pour la note de revue
const anciennesRoutesParFichier = new Map();
for (const r of ancien.routes || []) { if (!anciennesRoutesParFichier.has(r.f)) anciennesRoutesParFichier.set(r.f, []); anciennesRoutesParFichier.get(r.f).push(`${r.m} ${r.p}`); }
const nouvellesRoutesParFichier = new Map();
for (const r of analyse.routes) { if (!nouvellesRoutesParFichier.has(r.file)) nouvellesRoutesParFichier.set(r.file, []); nouvellesRoutesParFichier.get(r.file).push(`${r.method} ${r.path}`); }
function noteChangement(p, cheminPrecedent = p) {
  const o = avant.get(cheminPrecedent), n = maintenant.get(p);
  const symbolesAnciens = new Set((o.s || []).map((s) => s[0])), symbolesNouveaux = new Set((n.symbols || []).map((s) => s.name));
  const plus = [...symbolesNouveaux].filter((x) => !symbolesAnciens.has(x)), moins = [...symbolesAnciens].filter((x) => !symbolesNouveaux.has(x));
  const routesAnciennes = new Set(anciennesRoutesParFichier.get(cheminPrecedent) || []), routesNouvelles = new Set(nouvellesRoutesParFichier.get(p) || []);
  const routesEnPlus = [...routesNouvelles].filter((x) => !routesAnciennes.has(x)).length, routesEnMoins = [...routesAnciennes].filter((x) => !routesNouvelles.has(x)).length;
  const morceaux = [];
  if (plus.length) morceaux.push(`nouveaux exports : ${plus.slice(0, 6).join(', ')}${plus.length > 6 ? '…' : ''}`);
  if (moins.length) morceaux.push(`exports retirés : ${moins.slice(0, 6).join(', ')}${moins.length > 6 ? '…' : ''}`);
  if (routesEnPlus) morceaux.push(`${routesEnPlus} nouvelle(s) route(s)`);
  if (routesEnMoins) morceaux.push(`${routesEnMoins} route(s) retirée(s)`);
  if (!morceaux.length) morceaux.push('la documentation ou la structure a changé');
  return morceaux.join('; ');
}

// ---------- 3. comparer les routes ----------
const anciennesClesRoutes = new Map((ancien.routes || []).map((r) => [`${r.m} ${r.p}`, r]));
const nouvellesClesRoutes = new Map(analyse.routes.map((r) => [`${r.method} ${r.path}`, r]));
const deplacementsRoutes = new Map(); // ancienne clé -> nouvelle clé (même gestionnaire dans le même fichier, ou dans le fichier renommé)
const routesDisparues = [...anciennesClesRoutes.keys()].filter((k) => !nouvellesClesRoutes.has(k));
const nouvellesRoutes = new Set([...nouvellesClesRoutes.keys()].filter((k) => !anciennesClesRoutes.has(k)));
for (const k of routesDisparues) {
  const o = anciennesClesRoutes.get(k);
  const fichier = renommages.get(o.f) || o.f;
  const m = [...nouvellesRoutes].find((cleNouvelle) => { const n = nouvellesClesRoutes.get(cleNouvelle); return n.file === fichier && o.h && n.handler === o.h; });
  if (m) { deplacementsRoutes.set(k, m); nouvellesRoutes.delete(m); }
}

// ---------- 4. remettre les descriptions en accord ----------
const dossierDescriptions = path.join(dossierSortie, 'descriptions');
let reportees = 0, retirees = 0, signalees = 0, routesReportees = 0, routesRetirees = 0;
const ensembleEmpreinte = new Set(empreinteChangee);
if (fs.existsSync(dossierDescriptions)) {
  for (const nom of fs.readdirSync(dossierDescriptions).filter((n) => n.endsWith('.json'))) {
    const cheminFiche = path.join(dossierDescriptions, nom);
    let d;
    try { d = JSON.parse(fs.readFileSync(cheminFiche, 'utf8')); } catch { continue; }
    let modifie = false;
    const fichiersSortie = {};
    for (const [p, v] of Object.entries(d.files || {})) {
      if (renommages.has(p)) {
        const nouveauChemin = renommages.get(p);
        fichiersSortie[nouveauChemin] = maintenant.get(nouveauChemin).sig !== avant.get(p).sig ? { ...v, review: `déplacé depuis ${p} ; ${noteChangement(nouveauChemin, p)}` } : v;
        reportees++; modifie = true;
      } else if (supprimes.includes(p)) { retirees++; modifie = true; }
      else if (ensembleEmpreinte.has(p) && v.description) { fichiersSortie[p] = { ...v, review: noteChangement(p) }; signalees++; modifie = true; }
      else fichiersSortie[p] = v;
    }
    const routesSortie = {};
    for (const [k, v] of Object.entries(d.routes || {})) {
      if (deplacementsRoutes.has(k)) { routesSortie[deplacementsRoutes.get(k)] = { ...v, review: `chemin changé depuis ${k}` }; routesReportees++; modifie = true; }
      else if (!nouvellesClesRoutes.has(k) && anciennesClesRoutes.has(k)) { routesRetirees++; modifie = true; }
      else routesSortie[k] = v;
    }
    if (modifie) {
      const objetSortie = { files: fichiersSortie, ...(Object.keys(routesSortie).length ? { routes: routesSortie } : {}) };
      if (!Object.keys(fichiersSortie).length && !Object.keys(routesSortie).length) fs.unlinkSync(cheminFiche);
      else fs.writeFileSync(cheminFiche, JSON.stringify(objetSortie, null, 2) + '\n');
    }
  }
}

// ce qui a changé depuis la dernière construction, pour recent.mjs (marquer le travail récent sur la carte)
fs.writeFileSync(path.join(dossierSortie, '.cache', 'changes.json'), JSON.stringify({
  since: ancien.meta.generatedAt, at: new Date().toISOString(),
  files: { new: crees, edited: modifies.filter((p) => !crees.includes(p)), moved: [...renommages].map(([a, b]) => ({ from: a, to: b })), deleted: supprimes },
  routes: { new: [...nouvellesRoutes], removed: routesDisparues.filter((k) => !deplacementsRoutes.has(k)), moved: [...deplacementsRoutes].map(([a, b]) => ({ from: a, to: b })) },
}, null, 2));

// ---------- 5. reconstruire (aucun jeton) ----------
let sortieConstruction = '';
let constructionOk = true;
try { sortieConstruction = execFileSync(executableNode, [path.join(ICI, 'build.mjs'), racine], { encoding: 'utf8' }); }
catch (e) { sortieConstruction = (e.stdout || '') + (e.stderr || ''); constructionOk = false; }

// ---------- 6. rapport ----------
const depuis = new Date(ancien.meta.generatedAt);
const L = [];
L.push(`Mise à jour de Floorplan — dernière carte construite le ${depuis.toLocaleString('fr-FR')}`);
L.push(`  fichiers  +${crees.length} nouveaux · −${supprimes.length} supprimés · ${renommages.size} déplacés ou renommés (descriptions reportées) · ${modifies.length} modifiés, dont ${empreinteChangee.length} avec des exports ou des routes changés`);
L.push(`  routes    +${nouvellesRoutes.size} nouvelles · −${routesDisparues.length - deplacementsRoutes.size} retirées · ${deplacementsRoutes.size} avec un nouveau chemin (descriptions reportées)`);
L.push(`  descriptions : ${reportees + routesReportees} reportées, ${retirees + routesRetirees} retirées, ${signalees} à revoir`);
if (!avant.values().next().value?.h) L.push('  (la carte précédente date d’avant les empreintes de contenu : les modifications depuis n’ont pas pu être détectées ; les prochaines mises à jour le pourront)');
const parDossier = new Map();
for (const p of crees) { const d = p.split('/').slice(0, -1).join('/'); parDossier.set(d, (parDossier.get(d) || 0) + 1); }
if (parDossier.size) {
  L.push('  nouveaux fichiers par dossier :');
  for (const [d, c] of [...parDossier.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) L.push(`    ${String(c).padStart(4)}  ${d}/`);
}
L.push('');
L.push('CONSTRUCTION');
L.push(sortieConstruction.split('\n').filter((l) => /^(✗|!|  - |AFFECTATION|  non affectés|    |DESCRIPTIONS|  Lancer describe|✓)/.test(l)).slice(0, 40).join('\n'));
L.push('');
const aFaire = [];
if (!constructionOk) aFaire.push('Corrige dans architecture.json les erreurs de construction ci-dessus (en général une étape de parcours ou une annotation qui pointe vers un fichier supprimé), puis lance build.mjs.');
if (/non affectés, par dossier/.test(sortieConstruction)) aFaire.push('Des nouveaux fichiers sont hors de toute partie : ajoute des motifs (ou une partie) dans architecture.json pour les dossiers listés sous « non affectés ».');
if (/Lancer describe/.test(sortieConstruction)) aFaire.push('Lance describe.mjs : il écrit des fiches de travail pour les seuls éléments nouveaux ou signalés. Remplis-les (retire chaque champ "review" une fois l’entrée exacte), puis lance build.mjs.');
if (crees.length + supprimes.length > Math.max(20, avant.size * 0.15)) aFaire.push('Le changement est important : relis les résumés des parties qui ont gagné ou perdu beaucoup de fichiers, et vérifie que les parcours tiennent toujours.');
aFaire.push('Marque le travail récent : lance recent.mjs, réécris recent-work.json pour ce qui vient d’être travaillé (une liste "tasks" vide s’il n’y a rien), puis lance build.mjs.');
L.push('ENSUITE');
aFaire.forEach((t, i) => L.push(`  ${i + 1}. ${t}`));
console.log(L.join('\n'));
