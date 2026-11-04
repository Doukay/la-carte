#!/usr/bin/env node
// Analyseur de Floorplan : trouve tous les dépôts sous une racine de code, liste les fichiers, extrait les imports,
// les symboles et les routes et appels HTTP, les résout, et écrit floorplan/.cache/analyse.json.
// Imprime un résumé compact fait pour être lu par Claude (le JSON lui-même peut être gros).
//
// usage : node analyser.mjs [racine] [--out <fichier>] [--include-worktrees] [--max-file-kb 2048]

import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { decouvrir, fichiersGit, infosGit, classer, versPosix, lireArguments, formaterNombre, DOSSIERS_TOUJOURS_IGNORES, DOSSIER_CARTE, ANCIEN_DOSSIER_CARTE, estDossierCarte, dossierCarte, garderHorsGit } from './lib/commun.mjs';
import { extraire, appelsAppelablesVia } from './lib/extraction.mjs';
import { trouverProblemes } from './lib/sante.mjs';
import { trouverEcrans } from './lib/ecrans.mjs';
import { creerResolveur } from './lib/resolution.mjs';
import { resoudreRoutes, associerAppels } from './lib/routes.mjs';

const parametres = lireArguments(process.argv.slice(2));
const racine = path.resolve(parametres._[0] || '.');
const dossierSortie = parametres.out ? path.dirname(path.dirname(path.resolve(parametres.out))) : dossierCarte(racine);
const fichierSortie = path.resolve(parametres.out || path.join(dossierSortie, '.cache', 'analyse.json'));
const maxOctets = (Number(parametres['max-file-kb']) || 2048) * 1024;
const t0 = Date.now();
const empreinte = (s) => createHash('sha1').update(s).digest('hex').slice(0, 12);

// ---------- 1. trouver les dépôts et les fichiers ----------
const trouve = decouvrir(racine, { includeWorktrees: !!parametres['include-worktrees'] });
const depots = [];
const listeFichiers = []; // { path, repo }
const vus = new Set();
// les dossiers de carte (le nôtre, ou un ancien show-code/) sont un résultat, pas du code
const dossiersCarte = new Map();
const dansCarte = (p) => {
  const segments = p.split('/');
  for (let i = 0; i < segments.length - 1; i++) {
    if (segments[i] !== DOSSIER_CARTE && segments[i] !== ANCIEN_DOSSIER_CARTE) continue;
    const d = segments.slice(0, i + 1).join('/');
    if (!dossiersCarte.has(d)) dossiersCarte.set(d, estDossierCarte(path.join(racine, d)));
    if (dossiersCarte.get(d)) return true;
  }
  return false;
};
const ignoreParDossier = (p) => p.split('/').some((segment) => DOSSIERS_TOUJOURS_IGNORES.has(segment)) || dansCarte(p);

for (const r of trouve.repos) {
  const listes = fichiersGit(r.abs);
  const infosDepot = infosGit(r.abs);
  const prefixe = r.path === '.' ? '' : r.path + '/';
  let nombre = 0;
  for (const f of listes || []) {
    const p = prefixe + f;
    if (vus.has(p) || ignoreParDossier(p)) continue;
    vus.add(p);
    listeFichiers.push({ path: p, repo: r.path });
    nombre++;
  }
  depots.push({ path: r.path, name: path.basename(r.abs), ...infosDepot, files: nombre, ...(r.worktreeOf ? { worktreeOf: versPosix(r.worktreeOf) } : {}) });
}
for (const p of trouve.loose) if (!vus.has(p) && !dansCarte(p)) { vus.add(p); listeFichiers.push({ path: p, repo: null }); }

// ---------- 2. classer, lire, extraire ----------
const fichiers = [];
for (const { path: p, repo: depot } of listeFichiers) {
  const absolu = path.join(racine, p);
  let statut;
  try { statut = fs.statSync(absolu); } catch { continue; }
  if (!statut.isFile()) continue;
  const { category: categorie, lang: langage } = classer(p, statut.size);
  const f = { path: p, repo: depot, category: categorie, lang: langage, bytes: statut.size, loc: 0 };
  if ((categorie === 'code' || categorie === 'config' || categorie === 'docs') && statut.size <= maxOctets) {
    let source;
    try { source = fs.readFileSync(absolu, 'utf8'); } catch { source = ''; }
    if (source.includes('\u0000')) { f.category = 'asset'; fichiers.push(f); continue; }
    f.loc = source.split('\n').filter((l) => l.trim()).length;
    if (categorie === 'code' && source.length) {
      try { Object.assign(f, extraire(source, langage, p)); } catch (e) { f.extractError = String(e.message || e); }
      // h : le contenu exact. sig : les parties dont dépend une description (exports, routes, docstring),
      // pour que modifier l'intérieur d'une fonction ne rende pas la description d'un fichier périmée.
      f.h = empreinte(source);
      f.sig = empreinte(JSON.stringify([(f.symbols || []).map((s) => s.name).sort(), (f.routes || []).map((r) => `${r.method} ${r.path}`).sort(), f.doc || '']));
    }
    // points d'extension : les problèmes de santé de chaque fichier (lib/sante.mjs) et les écrans de l'appli (lib/ecrans.mjs)
    if (source.length) {
      try { const trouves = trouverProblemes(source, f); if (trouves?.length) f.problemes = trouves; } catch (e) { f.healthError = String(e.message || e); }
      try { const ecransTrouves = trouverEcrans(source, f); if (ecransTrouves?.length) f.ecrans = ecransTrouves; } catch (e) { f.screensError = String(e.message || e); }
    }
  } else if (categorie === 'code' || categorie === 'config' || categorie === 'docs') {
    // trop gros pour être lu et analysé, mais toujours sur la carte : on compte ses lignes sans tout charger
    f.tooLarge = true;
    f.loc = compterLignes(absolu);
  }
  fichiers.push(f);
}

/** Nombre de lignes d'un fichier, lu par morceaux pour qu'un fichier énorme ne tienne jamais tout entier en mémoire. */
function compterLignes(absolu) {
  let fd, n = 0, dernier = 10;
  try {
    fd = fs.openSync(absolu, 'r');
    const tampon = Buffer.alloc(1 << 20);
    for (let lus; (lus = fs.readSync(fd, tampon, 0, tampon.length, null)) > 0;) {
      for (let i = 0; i < lus; i++) if (tampon[i] === 10) n++;
      dernier = tampon[lus - 1];
    }
  } catch { return 0; } finally { if (fd !== undefined) fs.closeSync(fd); }
  return n + (dernier === 10 ? 0 : 1);
}

// ---------- 3. résoudre les imports ----------
const resoudre = creerResolveur(racine, fichiers);
const liens = [];
const externes = new Map(); // `${eco}:${name}` -> { eco, name, count, files:Set }
const liensExternes = [];
let nonResolus = 0;
for (const f of fichiers) {
  if (!f.imports) continue;
  for (const importe of f.imports) {
    const resultat = resoudre(f, importe);
    if (resultat.file || resultat.files) {
      importe.files = resultat.files || [resultat.file];
      const cibles = resultat.files ? resultat.files.map((t, i) => [t, resultat.names?.[i]]) : [[resultat.file, null]];
      for (const [vers, sousNom] of cibles) {
        if (vers === f.path) continue;
        liens.push({ from: f.path, to: vers, names: sousNom ? [] : (importe.names || []), line: importe.line, ...(importe.dynamic ? { dynamic: true } : {}) });
      }
    } else if (resultat.external) {
      const cle = `${resultat.eco}:${resultat.external}`;
      if (!externes.has(cle)) externes.set(cle, { eco: resultat.eco, name: resultat.external, count: 0, files: new Set() });
      const e = externes.get(cle);
      e.count++;
      e.files.add(f.path);
      liensExternes.push({ from: f.path, pkg: cle });
    } else if (resultat.unresolved) nonResolus++;
  }
}
// fusionne les liens en double (même départ et même arrivée)
const liensFusionnes = new Map();
for (const e of liens) {
  const k = e.from + '\u0000' + e.to;
  const precedent = liensFusionnes.get(k);
  if (precedent) { precedent.names = [...new Set([...precedent.names, ...e.names])]; precedent.count++; }
  else liensFusionnes.set(k, { ...e, count: 1 });
}

// Aides Firebase pour appeler une fonction, utilisées depuis d'autres fichiers : `import { callFunction } from '../lib/firebase'`,
// puis callFunction('approveItem', data) appelle la fonction approveItem
const enveloppes = new Map(fichiers.filter((f) => f.callableWrappers).map((f) => [f.path, new Set(f.callableWrappers)]));
if (enveloppes.size) for (const f of fichiers) {
  const via = (f.imports || []).flatMap((importe) => Object.entries(importe.locals || {}).filter(([, origine]) => importe.files?.some((t) => enveloppes.get(t)?.has(origine))).map(([nomLocal]) => nomLocal));
  if (!via.length) continue;
  let source;
  try { source = fs.readFileSync(path.join(racine, f.path), 'utf8'); } catch { continue; }
  for (const nomLocal of via) f.calls = [...(f.calls || []), ...appelsAppelablesVia(source, nomLocal)];
}

// ---------- 4. routes et appels HTTP ----------
const routes = resoudreRoutes(fichiers);
const liensHttp = associerAppels(fichiers, routes);
const hotes = [];
for (const f of fichiers) for (const h of f.hosts || []) hotes.push({ from: f.path, host: h.host, line: h.line });

// ---------- 5. écrire analyse.json ----------
const analyse = {
  version: 1,
  generatedAt: new Date().toISOString(),
  root: versPosix(racine),
  rootName: path.basename(racine),
  repos: depots,
  skipped: trouve.skipped,
  files: fichiers.map((f) => ({
    path: f.path, repo: f.repo, category: f.category, lang: f.lang, loc: f.loc, bytes: f.bytes,
    ...(f.doc ? { doc: f.doc } : {}),
    ...(f.h ? { h: f.h, sig: f.sig } : {}),
    ...(f.symbols?.length ? { symbols: f.symbols } : {}),
    ...(f.tooLarge ? { tooLarge: true } : {}),
    ...(f.problemes ? { problemes: f.problemes } : {}),
    ...(f.ecrans ? { ecrans: f.ecrans } : {}),
    ...(f.triggers ? { triggers: f.triggers } : {}),
  })),
  edges: [...liensFusionnes.values()].map(({ from: depuis, to: vers, names: noms, count: nombre, dynamic: dynamique }) => ({ from: depuis, to: vers, ...(noms.length ? { names: noms } : {}), ...(nombre > 1 ? { count: nombre } : {}), ...(dynamique ? { dynamic: dynamique } : {}) })),
  externals: [...externes.values()].map((e) => ({ id: `${e.eco}:${e.name}`, eco: e.eco, name: e.name, imports: e.count, files: e.files.size })),
  extEdges: dedupliquerExternes(liensExternes),
  routes,
  http: liensHttp,
  hosts: hotes,
};
fs.mkdirSync(path.dirname(fichierSortie), { recursive: true });
fs.writeFileSync(fichierSortie, JSON.stringify(analyse));
if (!parametres.out) garderHorsGit(dossierSortie);

function dedupliquerExternes(liste) {
  const m = new Map();
  for (const e of liste) { const k = e.from + '|' + e.pkg; m.set(k, (m.get(k) || 0) + 1); }
  return [...m.entries()].map(([k, nombre]) => { const [depuis, paquet] = k.split('|'); return { from: depuis, pkg: paquet, count: nombre }; });
}

// ---------- 6. résumé pour Claude ----------
const code = analyse.files.filter((f) => f.category === 'code');
const sortie = [];
const ligne = (s = '') => sortie.push(s);
ligne(`Analyse Floorplan de ${analyse.rootName}  (${((Date.now() - t0) / 1000).toFixed(1)}s) -> ${versPosix(path.relative(racine, fichierSortie))}`);
ligne();
ligne(`DÉPÔTS (${depots.length})`);
for (const r of depots) ligne(`  ${r.path.padEnd(40)} ${String(r.files).padStart(6)} fichiers  ${r.branch || '-'}@${(r.head || '').slice(0, 8)}${r.worktreeOf ? '  (worktree)' : ''}`);
const nbIsoles = analyse.files.filter((f) => f.repo === null).length;
if (nbIsoles) ligne(`  (hors de tout dépôt)${''.padEnd(20)} ${String(nbIsoles).padStart(6)} fichiers`);
const worktrees = trouve.skipped.filter((s) => s.reason.includes('worktree'));
if (worktrees.length) ligne(`  ${worktrees.length} worktree(s) en double sauté(s), par ex. ${worktrees.slice(0, 3).map((s) => s.path).join(', ')}`);
const grosDossiers = trouve.skipped.filter((s) => s.reason.includes('export de données'));
if (grosDossiers.length) ligne(`  ${grosDossiers.length} gros dossier(s) hors git sauté(s), par ex. ${grosDossiers.slice(0, 2).map((s) => s.path).join(', ')}`);
ligne();

const parCategorie = {};
for (const f of analyse.files) parCategorie[f.category] = (parCategorie[f.category] || 0) + 1;
ligne(`FICHIERS  ${Object.entries(parCategorie).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
const parLangage = {};
for (const f of code) { parLangage[f.lang] ??= { files: 0, loc: 0 }; parLangage[f.lang].files++; parLangage[f.lang].loc += f.loc; }
ligne(`CODE   ${Object.entries(parLangage).sort((a, b) => b[1].loc - a[1].loc).slice(0, 10).map(([k, v]) => `${k} ${v.files} fichiers/${formaterNombre(v.loc)} lignes`).join(' · ')}`);
ligne();

// arbre des dossiers du code, en regroupant les petits dossiers
ligne('ARBRE DU CODE (fichiers / lignes ; dossiers de moins de 2 % du code regroupés)');
const arbre = { children: new Map(), files: 0, loc: 0 };
for (const f of code) {
  let noeud = arbre;
  noeud.files++; noeud.loc += f.loc;
  const morceaux = f.path.split('/').slice(0, -1);
  for (const morceau of morceaux) {
    if (!noeud.children.has(morceau)) noeud.children.set(morceau, { children: new Map(), files: 0, loc: 0 });
    noeud = noeud.children.get(morceau);
    noeud.files++; noeud.loc += f.loc;
  }
}
const minLignes = Math.max(50, arbre.loc * 0.02);
const afficherArbre = (noeud, prefixe, profondeur) => {
  const enfants = [...noeud.children.entries()].sort((a, b) => b[1].loc - a[1].loc);
  const affiches = enfants.filter(([, n]) => n.loc >= minLignes);
  for (const [nom, n] of affiches) {
    ligne(`${prefixe}${nom}/`.padEnd(64) + `${String(n.files).padStart(5)}  ${formaterNombre(n.loc).padStart(6)}`);
    if (profondeur < 5) afficherArbre(n, prefixe + '  ', profondeur + 1);
  }
  const reste = enfants.length - affiches.length;
  if (reste > 0) { const fichiersReste = enfants.slice(affiches.length).reduce((s, [, n]) => s + n.files, 0); ligne(`${prefixe}… ${reste} dossier(s) plus petit(s), ${fichiersReste} fichiers`); }
};
afficherArbre(arbre, '  ', 0);
ligne();

// points d'entrée possibles
const POINTS_ENTREE = /(^|\/)(main|index|app|server|cli|manage|wsgi|asgi|__main__|program|lib)\.(py|ts|tsx|js|mjs|go|rs|java|kt|cs|rb)$|(^|\/)app\/(page|layout)\.(t|j)sx?$|(^|\/)cmd\/[^/]+\/main\.go$|(^|\/)Dockerfile[^/]*$|(^|\/)(docker-compose|compose)\.ya?ml$|(^|\/)(cloudbuild|serverless|vercel|netlify|fly|render|app)\.(ya?ml|json|toml)$/i;
const entrees = analyse.files.filter((f) => POINTS_ENTREE.test(f.path) && f.path.split('/').length <= 5).map((f) => f.path);
ligne(`POINTS D'ENTRÉE / DÉPLOIEMENT POSSIBLES (${entrees.length})`);
for (const e of entrees.slice(0, 30)) ligne(`  ${e}`);
if (entrees.length > 30) ligne(`  … ${entrees.length - 30} de plus`);
ligne();

// groupes de dépendances au niveau des dossiers
const dossierDe = (p, profondeur) => p.split('/').slice(0, -1).slice(0, profondeur).join('/') || '.';
const profondeurPour = (p) => {
  const r = p.split('/');
  return Math.min(r.length - 1, 3 + (depots.length > 1 ? 1 : 0));
};
const liensDossiers = new Map();
for (const e of analyse.edges) {
  const a = dossierDe(e.from, profondeurPour(e.from)), b = dossierDe(e.to, profondeurPour(e.to));
  if (a === b) continue;
  const k = `${a} -> ${b}`;
  liensDossiers.set(k, (liensDossiers.get(k) || 0) + (e.count || 1));
}
ligne(`LIENS D'IMPORT  ${analyse.edges.length} fichier->fichier résolus, ${nonResolus} non résolus. Les plus lourds, dossier->dossier :`);
for (const [k, v] of [...liensDossiers.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)) ligne(`  ${String(v).padStart(5)}  ${k}`);
ligne();

ligne(`HTTP  ${routes.length} adresses du serveur définies, ${liensHttp.length} liens appel->adresse (liens entre fichiers que les imports ne montrent pas)`);
const httpParDossier = new Map();
for (const h of liensHttp) {
  const k = `${dossierDe(h.from, profondeurPour(h.from))} -> ${dossierDe(h.to, profondeurPour(h.to))}`;
  httpParDossier.set(k, (httpParDossier.get(k) || 0) + 1);
}
for (const [k, v] of [...httpParDossier.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) ligne(`  ${String(v).padStart(5)}  ${k}`);
ligne();

// Firebase Cloud Functions : les adresses du serveur sont déjà dans la ligne HTTP ; celles de fond ont besoin d'une place sur la carte
const routesFirebase = fichiers.flatMap((f) => (f.routes || []).filter((r) => r.framework === 'firebase'));
const declencheurs = fichiers.flatMap((f) => (f.triggers || []).map((t) => ({ ...t, file: f.path })));
if (routesFirebase.length || declencheurs.length) {
  const appelables = routesFirebase.filter((r) => r.method === 'CALL').length;
  ligne(`FONCTIONS FIREBASE  ${appelables} appelables (onCall), ${routesFirebase.length - appelables} onRequest, ${declencheurs.length} en tâche de fond`);
  if (declencheurs.length) {
    ligne('  tâches de fond (planifications et déclencheurs ; place-les dans un nœud worker) :');
    for (const t of declencheurs.slice(0, 20)) ligne(`    ${t.name}  ${t.on}${t.what ? ` "${t.what}"` : ''}  ${t.file}:${t.line}`);
    if (declencheurs.length > 20) ligne(`    … ${declencheurs.length - 20} de plus`);
  }
  ligne();
}

const topExternes = analyse.externals.sort((a, b) => b.files - a.files).slice(0, 25);
ligne(`PAQUETS EXTERNES (les ${topExternes.length} premiers, par nombre de fichiers qui les importent)`);
ligne('  ' + topExternes.map((e) => `${e.id}(${e.files})`).join('  '));
const nombreParHote = new Map();
for (const h of hotes) nombreParHote.set(h.host, (nombreParHote.get(h.host) || 0) + 1);
if (nombreParHote.size) {
  ligne(`SERVICES EXTÉRIEURS (hôtes appelés depuis le code)`);
  ligne('  ' + [...nombreParHote.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([h, c]) => `${h}(${c})`).join('  '));
}
ligne();
const gros = code.filter((f) => f.loc > 1500).sort((a, b) => b.loc - a.loc).slice(0, 10);
if (gros.length) { ligne('PLUS GROS FICHIERS'); for (const f of gros) ligne(`  ${formaterNombre(f.loc).padStart(6)}  ${f.path}`); ligne(); }
const nonLus = fichiers.filter((f) => f.tooLarge).sort((a, b) => b.bytes - a.bytes);
if (nonLus.length) {
  ligne(`NON LUS  ${nonLus.length} fichier(s) de plus de ${formaterNombre(maxOctets / 1024)} Ko : sur la carte, mais leurs imports, adresses du serveur, appels au serveur et secrets n'ont pas été vérifiés. Relance analyser.mjs avec --max-file-kb <plus grand> pour les lire.`);
  for (const f of nonLus.slice(0, 15)) ligne(`  ${formaterNombre(Math.round(f.bytes / 1024)).padStart(6)} Ko  ${f.path}`);
  if (nonLus.length > 15) ligne(`  … ${nonLus.length - 15} de plus`);
  ligne();
}
ligne('Ensuite : lis references/schema.md, explore les points d\'entrée, puis écris floorplan/architecture.json et lance construire.mjs.');
console.log(sortie.join('\n'));
