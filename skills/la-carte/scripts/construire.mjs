#!/usr/bin/env node
// constructeur la carte : vérifie la-carte/sources/architecture.json par rapport à l’analyse, affecte chaque fichier à une
// partie, rattache les liens d’import, d’appel au serveur et vers l’extérieur, puis écrit la-carte/.cache/graphe.json + la-carte/index.html.
//
// usage : node construire.mjs [racine] [--arch <fichier>] [--scan <fichier>] [--out <dossier>] [--check]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compilerMotif, lireArguments, formaterNombre, dossierCarte, garderGeneresHorsGit, avertissementDocker, ICONES } from './lib/commun.mjs';
import { nomFichierParDefaut, nomRouteParDefaut, cleRoute } from './lib/noms.mjs';
import { assemblerPage } from './lib/page.mjs';
import { construireSante, avecRejets, rejetPour } from './lib/sante.mjs';
import { construireSantePlan } from './lib/ebauche.mjs';
import { construireEcrans } from './lib/ecrans.mjs';
import { detecterAgent } from './lib/agent.mjs';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const DOSSIER_SKILL = path.resolve(ICI, '..');
const params = lireArguments(process.argv.slice(2));
const agent = detecterAgent(params);
const racine = path.resolve(params._[0] || '.');
const dossierSortie = path.resolve(params.out || dossierCarte(racine));
const fichierArchi = path.resolve(params.arch || path.join(dossierSortie, 'sources', 'architecture.json'));
const fichierAnalyse = path.resolve(params.scan || path.join(dossierSortie, '.cache', 'analyse.json'));

export const TYPES_NOEUDS = ['ui', 'service', 'worker', 'library', 'feature', 'data', 'config', 'test', 'script', 'infra', 'external'];
export const TYPES_LIENS = ['import', 'call', 'http', 'rpc', 'event', 'queue', 'data', 'config'];

const erreurs = [];
const avertissements = [];
const signalerErreur = (message) => erreurs.push(message);
const signalerAvertissement = (message) => avertissements.push(message);

const echouer = (message) => { console.error(`✗ ${message}`); process.exit(1); };
if (!fs.existsSync(fichierAnalyse)) echouer(`Aucune analyse à ${fichierAnalyse}. Lance : node ${path.join(DOSSIER_SKILL, 'scripts', 'analyser.mjs')} "${racine}"`);
if (!fs.existsSync(fichierArchi)) echouer(`Aucun fichier d’architecture à ${fichierArchi}. Écris-le d’abord (voir references/schema.md).`);
const analyse = JSON.parse(fs.readFileSync(fichierAnalyse, 'utf8'));
let archi;
try { archi = JSON.parse(fs.readFileSync(fichierArchi, 'utf8')); } catch (e) { echouer(`sources/architecture.json n’est pas un JSON valide : ${e.message}`); }

// ---------- vérifier la forme ----------
const estTexte = (v) => typeof v === 'string' && v.length > 0;
const estListeTextes = (v) => Array.isArray(v) && v.every((x) => typeof x === 'string');
function leMoinsEloigne(mot, options) {
  let meilleur = null, meilleureDistance = Infinity;
  for (const o of options) {
    const d = distanceEdition(mot, o);
    if (d < meilleureDistance) { meilleureDistance = d; meilleur = o; }
  }
  return meilleureDistance <= Math.max(2, mot.length / 3) ? meilleur : null;
}
function distanceEdition(a, b) {
  const ligne = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let precedent = ligne[0]; ligne[0] = i;
    for (let j = 1; j <= b.length; j++) { const memo = ligne[j]; ligne[j] = Math.min(ligne[j] + 1, ligne[j - 1] + 1, precedent + (a[i - 1] === b[j - 1] ? 0 : 1)); precedent = memo; }
  }
  return ligne[b.length];
}
const voulaisTuDire = (w, choix) => { const c = leMoinsEloigne(w, choix); return c ? ` — tu voulais dire "${c}" ?` : ''; };

if (!archi || typeof archi !== 'object') echouer('architecture.json doit être un objet');
if (!archi.projet || !estTexte(archi.projet.name)) signalerErreur('projet.name est obligatoire');
if (!Array.isArray(archi.nodes) || !archi.nodes.length) signalerErreur('nodes doit être une liste non vide');
const noeuds = Array.isArray(archi.nodes) ? archi.nodes : [];
const liensArchi = Array.isArray(archi.edges) ? archi.edges : [];
const parcoursArchi = Array.isArray(archi.parcours) ? archi.parcours : [];
const annotations = Array.isArray(archi.annotations) ? archi.annotations : [];
const categoriesInclus = estListeTextes(archi.include) ? archi.include : ['code'];
const motifsIgnores = (estListeTextes(archi.ignore) ? archi.ignore : []).map(compilerMotif);
// pour qui sont écrites les descriptions : "everyone" (langage simple, par défaut) ou "developers"
const PUBLICS = ['everyone', 'developers'];
if (archi.audience !== undefined && !PUBLICS.includes(archi.audience)) signalerErreur(`audience "${archi.audience}" doit être parmi ${PUBLICS.join(', ')}${voulaisTuDire(String(archi.audience), PUBLICS)}`);
const publicCible = PUBLICS.includes(archi.audience) ? archi.audience : 'everyone';

const parId = new Map();
noeuds.forEach((n, i) => {
  const endroit = `nodes[${i}]${n?.id ? ` ("${n.id}")` : ''}`;
  if (!n || typeof n !== 'object') return signalerErreur(`${endroit} doit être un objet`);
  if (!estTexte(n.id)) return signalerErreur(`${endroit}.id est obligatoire`);
  if (!/^[A-Za-z0-9_.\-]+$/.test(n.id)) signalerErreur(`${endroit}.id n’accepte que des lettres, des chiffres, "_", "-" et "."`);
  if (n.id === 'unassigned') signalerErreur(`${endroit}.id "unassigned" est réservé`);
  if (parId.has(n.id)) signalerErreur(`${endroit}.id existe déjà dans une partie précédente`);
  parId.set(n.id, n);
  if (!estTexte(n.label)) signalerErreur(`${endroit}.label est obligatoire`);
  if (!TYPES_NOEUDS.includes(n.kind)) signalerErreur(`${endroit}.kind "${n.kind}" doit être parmi ${TYPES_NOEUDS.join(', ')}${voulaisTuDire(String(n.kind), TYPES_NOEUDS)}`);
  for (const k of ['paths', 'exclude', 'packages', 'hosts', 'tags']) if (n[k] !== undefined && !estListeTextes(n[k])) signalerErreur(`${endroit}.${k} doit être une liste de textes`);
  if (n.kind === 'external' && n.paths?.length) signalerAvertissement(`${endroit} est extérieure mais a des paths ; une partie extérieure ne possède normalement aucun fichier`);
});
const ids = [...parId.keys()];
for (const n of noeuds) {
  if (n?.parent === undefined) continue;
  if (!parId.has(n.parent)) signalerErreur(`partie "${n.id}" : son parent "${n.parent}" n’existe pas${voulaisTuDire(n.parent, ids)}`);
}
// cycles et profondeur
const profondeurDe = new Map();
const profondeur = (id, vus = new Set()) => {
  if (profondeurDe.has(id)) return profondeurDe.get(id);
  if (vus.has(id)) { signalerErreur(`la partie "${id}" fait partie d’un cycle de parents`); return 0; }
  vus.add(id);
  const n = parId.get(id);
  const d = n?.parent && parId.has(n.parent) ? profondeur(n.parent, vus) + 1 : 0;
  profondeurDe.set(id, d);
  return d;
};
ids.forEach((id) => profondeur(id));

// ---------- fichiers ----------
const tousFichiers = analyse.files;
const fichierParChemin = new Map(tousFichiers.map((f) => [f.path, f]));
const fichiersInclus = tousFichiers.filter((f) => categoriesInclus.includes(f.category) && !motifsIgnores.some((g) => g.test(f.path)));
const ensembleInclus = new Set(fichiersInclus.map((f) => f.path));

// ---------- affecter les fichiers aux parties ----------
// Le `exclude` d’une partie vaut aussi pour ses descendantes : « web exclut les tests » tient donc jusqu’en bas.
const exclusionsHeritees = (n, vus = new Set()) => {
  if (!n || vus.has(n.id)) return [];
  vus.add(n.id);
  return [...(estListeTextes(n.exclude) ? n.exclude : []), ...(n.parent ? exclusionsHeritees(parId.get(n.parent), vus) : [])];
};
const associations = noeuds.filter((n) => n?.id && estListeTextes(n.paths ?? [])).map((n, ordre) => ({
  id: n.id, order: ordre, depth: profondeurDe.get(n.id) || 0,
  paths: (n.paths || []).map(compilerMotif), exclude: exclusionsHeritees(n).map(compilerMotif), hits: new Array((n.paths || []).length).fill(0),
}));
const proprietaire = new Map();
let ambigus = 0;
const exemplesAmbigus = [];
for (const f of fichiersInclus) {
  let meilleur = null, meilleureCle = null, egalite = null;
  for (const m of associations) {
    if (m.exclude.some((g) => g.test(f.path))) continue;
    let precision = -1;
    m.paths.forEach((g, i) => { if (g.test(f.path)) { m.hits[i]++; precision = Math.max(precision, g.specificity); } });
    if (precision < 0) continue;
    const cle = [m.depth, precision];
    if (!meilleur || cle[0] > meilleureCle[0] || (cle[0] === meilleureCle[0] && cle[1] > meilleureCle[1])) { meilleur = m; meilleureCle = cle; egalite = null; }
    else if (cle[0] === meilleureCle[0] && cle[1] === meilleureCle[1]) egalite = m.id;
  }
  if (egalite) { ambigus++; if (exemplesAmbigus.length < 3) exemplesAmbigus.push(`${f.path} (${meilleur.id} vs ${egalite})`); }
  proprietaire.set(f.path, meilleur ? meilleur.id : 'unassigned');
}
for (const m of associations) m.hits.forEach((h, i) => { if (!h) signalerAvertissement(`partie "${m.id}" : le motif "${m.paths[i].glob}" ne correspond à aucun fichier inclus`); });
if (ambigus) signalerAvertissement(`${ambigus} fichier(s) correspondent à égalité à deux parties sœurs ; la première déclarée l’emporte. Précise les motifs ou ajoute un exclude. Par exemple : ${exemplesAmbigus.join('; ')}`);

// ---------- extrémités des liens ----------
const resoudreExtremite = (reference, endroit) => {
  if (!estTexte(reference)) { signalerErreur(`${endroit} doit être un identifiant de partie ou un chemin de fichier`); return null; }
  if (parId.has(reference)) return `n:${reference}`;
  const p = reference.replace(/^file:/, '');
  if (ensembleInclus.has(p)) return `f:${p}`;
  if (fichierParChemin.has(p)) { signalerErreur(`${endroit} "${reference}" est un fichier non inclus (catégorie ${fichierParChemin.get(p).category}) ; désigne plutôt sa partie`); return null; }
  signalerErreur(`${endroit} "${reference}" n’est ni un identifiant de partie ni un fichier analysé${voulaisTuDire(reference, ids)}`);
  return null;
};

// ---------- liens ----------
const liens = new Map(); // clé -> lien
const ajouterLien = (a, b, k, supplement = {}) => {
  if (!a || !b || a === b) return;
  const cle = `${a}|${b}|${k}`;
  let l = liens.get(cle);
  if (!l) { l = { a, b, k, w: 0 }; liens.set(cle, l); }
  l.w += supplement.w || 1;
  if (supplement.names?.length) l.names = [...new Set([...(l.names || []), ...supplement.names])].slice(0, 40);
  if (supplement.label) { l.labels = l.labels || []; if (!l.labels.includes(supplement.label) && l.labels.length < 40) l.labels.push(supplement.label); }
  if (supplement.inferred) l.inferred = true;
  if (supplement.desc) l.desc = supplement.desc;
  if (supplement.route !== undefined) { l.calls = l.calls || []; if (l.calls.length < 80) l.calls.push([supplement.route, supplement.callLine || 0]); }
};

// ---------- routes ----------
const indexRoutes = new Map();
const routesRetenues = analyse.routes.filter((r) => ensembleInclus.has(r.file));
routesRetenues.forEach((r, i) => indexRoutes.set(`${r.file}|${r.method}|${r.path}`, i));

for (const e of analyse.edges) if (ensembleInclus.has(e.from) && ensembleInclus.has(e.to)) ajouterLien(`f:${e.from}`, `f:${e.to}`, 'import', { w: e.count || 1, names: e.names });
for (const h of analyse.http) if (ensembleInclus.has(h.from) && ensembleInclus.has(h.to)) ajouterLien(`f:${h.from}`, `f:${h.to}`, 'http', { label: `${h.method} ${h.path}`, inferred: true, route: indexRoutes.get(`${h.to}|${h.method}|${h.path}`), callLine: h.line });

// services extérieurs : paquets et hôtes revendiqués par les parties
const idsExterieurs = analyse.externals.map((e) => e.id);
const assocPaquets = noeuds.filter((n) => n?.packages?.length).map((n) => ({ id: n.id, globs: n.packages.map((p) => compilerMotif(p.includes(':') ? p : `*:${p}`)), hits: 0 }));
const assocHotes = noeuds.filter((n) => n?.hosts?.length).map((n) => ({ id: n.id, globs: n.hosts.map((h) => compilerMotif(h.toLowerCase())), hits: 0 }));
for (const e of analyse.extEdges) {
  if (!ensembleInclus.has(e.from)) continue;
  const m = assocPaquets.find((assocPaquet) => assocPaquet.globs.some((g) => g.test(e.pkg)));
  if (m) { m.hits++; ajouterLien(`f:${e.from}`, `n:${m.id}`, 'import', { w: e.count, names: [e.pkg.split(':')[1]] }); }
}
for (const h of analyse.hosts) {
  if (!ensembleInclus.has(h.from)) continue;
  const m = assocHotes.find((assocHote) => assocHote.globs.some((g) => g.test(h.host)));
  if (m) { m.hits++; ajouterLien(`f:${h.from}`, `n:${m.id}`, 'http', { label: h.host, inferred: true }); }
}
for (const assocPaquet of assocPaquets) if (!assocPaquet.hits) signalerAvertissement(`partie "${assocPaquet.id}" : ses packages ne correspondent à rien d’importé. Connus : ${idsExterieurs.slice(0, 8).join(', ')}…`);
for (const assocHote of assocHotes) if (!assocHote.hits) signalerAvertissement(`partie "${assocHote.id}" : ses hosts ne correspondent à aucun hôte appelé par le code`);

// liens prévus par un plan, des fichiers vers les services extérieurs et les stockages de données (« services » et « data » de sources/plan.json)
for (const e of analyse.nodeLinks || []) {
  if (!ensembleInclus.has(e.from)) continue;
  if (!parId.has(e.to)) { signalerErreur(`sources/plan.json : "${e.from}" nomme "${e.to}" dans ses ${e.kind === 'data' ? 'data' : 'services'}, qui n’est pas un identifiant de partie dans sources/architecture.json${voulaisTuDire(e.to, ids)}`); continue; }
  ajouterLien(`f:${e.from}`, `n:${e.to}`, TYPES_LIENS.includes(e.kind) ? e.kind : 'call', { label: e.label });
}

liensArchi.forEach((e, i) => {
  const endroit = `edges[${i}]`;
  if (!TYPES_LIENS.includes(e?.kind)) signalerErreur(`${endroit}.kind "${e?.kind}" doit être parmi ${TYPES_LIENS.join(', ')}${voulaisTuDire(String(e?.kind), TYPES_LIENS)}`);
  const a = resoudreExtremite(e?.from, `${endroit}.from`);
  const b = resoudreExtremite(e?.to, `${endroit}.to`);
  if (a && b && TYPES_LIENS.includes(e.kind)) ajouterLien(a, b, e.kind, { label: e.label, desc: e.description, w: 1 });
});

// ---------- parcours et annotations ----------
const parcoursSortie = [];
parcoursArchi.forEach((parc, i) => {
  const endroit = `parcours[${i}]`;
  if (!estTexte(parc?.id) || !estTexte(parc?.title)) signalerErreur(`${endroit} a besoin d’un id et d’un title`);
  if (!Array.isArray(parc?.steps) || parc.steps.length < 2) { signalerErreur(`${endroit}.steps doit avoir au moins 2 étapes`); return; }
  const etapes = parc.steps.map((s, j) => ({ ref: resoudreExtremite(s?.node, `${endroit}.steps[${j}].node`), note: s?.note || '' }));
  parcoursSortie.push({ id: parc.id, title: parc.title, description: parc.description || '', steps: etapes });
});
// Parcours demandés depuis la carte (enregistrés par serveur.mjs). Les étapes utilisent des références stables —
// "route:METHOD /path" et "sym:<fichier>#<nom>" — pour survivre aux reconstructions ; les étapes périmées sont retirées.
const fichierPerso = path.join(dossierSortie, 'sources', 'parcours-perso.json');
if (fs.existsSync(fichierPerso)) {
  let perso = [];
  try { perso = JSON.parse(fs.readFileSync(fichierPerso, 'utf8')).parcours || []; } catch (e) { signalerAvertissement(`sources/parcours-perso.json n’est pas un JSON valide : ${e.message}`); }
  const routeParCle = new Map(routesRetenues.map((r, i) => [cleRoute(r), i]));
  const resoudreEtape = (reference) => {
    if (typeof reference !== 'string') return null;
    if (reference.startsWith('route:')) { const i = routeParCle.get(reference.slice(6)); return i == null ? null : `r:${i}`; }
    if (reference.startsWith('sym:')) {
      const [p, nom] = [reference.slice(4, reference.lastIndexOf('#')), reference.slice(reference.lastIndexOf('#') + 1)];
      const i = (fichierParChemin.get(p)?.symbols || []).findIndex((s) => s.name === nom);
      return ensembleInclus.has(p) && i >= 0 ? `s:${p}#${i}` : null;
    }
    if (reference.startsWith('n:')) return parId.has(reference.slice(2)) ? reference : null;
    if (reference.startsWith('f:')) return ensembleInclus.has(reference.slice(2)) ? reference : null;
    return null;
  };
  let retirees = 0;
  for (const parc of perso) {
    const etapes = (parc.steps || []).map((s) => ({ ref: resoudreEtape(s.ref), note: s.note || '' })).filter((s) => s.ref);
    retirees += (parc.steps || []).length - etapes.length;
    if (etapes.length >= 2 && estTexte(parc.id) && !parcoursSortie.some((x) => x.id === parc.id)) parcoursSortie.push({ id: parc.id, title: parc.title || 'Parcours', description: parc.description || '', steps: etapes, custom: true });
  }
  if (retirees) signalerAvertissement(`${retirees} étape(s) de sources/parcours-perso.json pointent vers du code qui n’existe plus et ont été retirées.`);
}
// Visite guidée « Commencer ici » : 3 à 8 étapes commentées (identifiant de partie ou chemin de fichier), écrites par Claude dans sources/architecture.json
const visiteSortie = [];
if (archi.visite !== undefined) {
  if (!Array.isArray(archi.visite)) signalerErreur('visite doit être une liste de { node, title, note }');
  else archi.visite.forEach((s, i) => {
    const reference = resoudreExtremite(s?.node, `visite[${i}].node`);
    if (reference) visiteSortie.push({ ref: reference, title: estTexte(s.title) ? s.title : '', note: estTexte(s.note) ? s.note : '' });
  });
}
// « Travail récent » : ce que Claude vient de changer, tâche par tâche, en regard de ce que la personne avait demandé
// (la-carte/.cache/travail-recent.json, réécrit à chaque création ou mise à jour). Une référence périmée donne un avertissement, jamais une erreur.
let recentSortie = null;
const fichierRecent = path.join(dossierSortie, '.cache', 'travail-recent.json');
if (fs.existsSync(fichierRecent)) {
  let travailRecent = null;
  try { travailRecent = JSON.parse(fs.readFileSync(fichierRecent, 'utf8')); } catch (e) { signalerAvertissement(`.cache/travail-recent.json n’est pas un JSON valide : ${e.message}`); }
  const indexRoutes = new Map(routesRetenues.map((r, i) => [cleRoute(r), i]));
  const resoudreRecent = (reference) => {
    if (!estTexte(reference)) return null;
    const s = reference.trim().replace(/^\.\//, '').replace(/^(route:|file:)/, '');
    if (/^n:/.test(s)) return parId.has(s.slice(2)) ? s : null;
    if (/^f:/.test(s)) return ensembleInclus.has(s.slice(2)) ? s : null;
    if (parId.has(s)) return 'n:' + s;
    if (ensembleInclus.has(s)) return 'f:' + s;
    const m = /^([A-Za-z]+)\s+(\/\S*)$/.exec(s);
    if (m && indexRoutes.has(`${m[1].toUpperCase()} ${m[2]}`)) return `r:${indexRoutes.get(`${m[1].toUpperCase()} ${m[2]}`)}`;
    return null;
  };
  if (travailRecent && !Array.isArray(travailRecent.tasks)) signalerAvertissement('travail-recent.json doit contenir une liste "tasks" (une liste vide efface les blocs mis en avant)');
  else if (travailRecent) {
    const taches = [], elements = [], manquants = [];
    travailRecent.tasks.forEach((t, indexTache) => {
      if (!estTexte(t?.title)) return signalerAvertissement(`.cache/travail-recent.json tasks[${indexTache}] a besoin d’un title`);
      taches.push({ title: t.title, request: estTexte(t.request) ? t.request : '', summary: estTexte(t.summary) ? t.summary : '', ...(estTexte(t.status) ? { status: t.status } : {}) });
      for (const element of Array.isArray(t.items) ? t.items : []) {
        const id = resoudreRecent(element?.ref);
        if (!id) { manquants.push(element?.ref); continue; }
        elements.push({ id, task: taches.length - 1, change: element.change === 'new' ? 'new' : 'changed', note: estTexte(element.note) ? element.note : '' });
      }
    });
    if (manquants.length) signalerAvertissement(`.cache/travail-recent.json : ${manquants.length} référence(s) ne sont pas sur la carte et ont été retirées (utilise un chemin de fichier, un identifiant de partie ou "METHODE /chemin") : ${manquants.slice(0, 5).map(String).join(', ')}${manquants.length > 5 ? '…' : ''}`);
    recentSortie = { updatedAt: estTexte(travailRecent.updatedAt) ? travailRecent.updatedAt : fs.statSync(fichierRecent).mtime.toISOString(), tasks: taches, items: elements };
  }
}
const notes = new Map();
annotations.forEach((a, i) => {
  if (!estTexte(a?.path) || !estTexte(a?.note)) return signalerErreur(`annotations[${i}] a besoin d’un path et d’une note`);
  if (!ensembleInclus.has(a.path)) return signalerErreur(`annotations[${i}].path "${a.path}" n’est pas un fichier inclus`);
  notes.set(a.path, { note: a.note, tags: estListeTextes(a.tags) ? a.tags : undefined });
});
for (const pointEntree of archi.projet?.entrypoints || []) if (!ensembleInclus.has(pointEntree)) signalerAvertissement(`projet.entrypoints "${pointEntree}" n’est pas un fichier inclus`);

// ---------- noms et descriptions (la-carte/sources/descriptions/*.json) ----------
const dossierDescriptions = path.join(dossierSortie, 'sources', 'descriptions');
const descFichiers = new Map(), descRoutes = new Map();
const clesRoutes = new Set(routesRetenues.map(cleRoute));
let fichiersPerimes = 0, routesPerimees = 0;
const exemplesPerimes = [];
if (fs.existsSync(dossierDescriptions)) {
  for (const nom of fs.readdirSync(dossierDescriptions).filter((n) => n.endsWith('.json')).sort()) {
    let d;
    try { d = JSON.parse(fs.readFileSync(path.join(dossierDescriptions, nom), 'utf8')); } catch (e) { signalerErreur(`sources/descriptions/${nom} n’est pas un JSON valide : ${e.message}`); continue; }
    for (const [p, v] of Object.entries(d.files || {})) {
      if (!v || typeof v !== 'object') { signalerErreur(`sources/descriptions/${nom}: files["${p}"] doit être { name, description }`); continue; }
      if (!ensembleInclus.has(p)) { fichiersPerimes++; if (exemplesPerimes.length < 3) exemplesPerimes.push(p); continue; }
      descFichiers.set(p, { name: estTexte(v.name) ? v.name.trim() : null, d: estTexte(v.description) ? v.description.trim() : null, icon: ICONES.includes(v.icon) ? v.icon : null, iconBrute: v.icon, review: estTexte(v.review) ? v.review : null });
    }
    for (const [k, v] of Object.entries(d.routes || {})) {
      if (!v || typeof v !== 'object') { signalerErreur(`sources/descriptions/${nom}: routes["${k}"] doit être { name, description }`); continue; }
      if (!clesRoutes.has(k)) { routesPerimees++; continue; }
      descRoutes.set(k, { name: estTexte(v.name) ? v.name.trim() : null, d: estTexte(v.description) ? v.description.trim() : null, review: estTexte(v.review) ? v.review : null });
    }
  }
}
if (fichiersPerimes) signalerAvertissement(`${fichiersPerimes} fichier(s) décrit(s) n’existent plus ou ne sont pas inclus (par exemple ${exemplesPerimes.join(', ')}). Retire-les de sources/descriptions/.`);
if (routesPerimees) signalerAvertissement(`${routesPerimees} route(s) décrite(s) ne correspondent plus à une route de l’analyse ; retire-les ou change leur clé.`);

// ---------- statistiques ----------
const nonAffectes = fichiersInclus.filter((f) => proprietaire.get(f.path) === 'unassigned');
const statistiques = new Map([...ids, 'unassigned'].map((id) => [id, { files: 0, loc: 0, langs: {}, repos: new Set() }]));
for (const f of fichiersInclus) {
  let id = proprietaire.get(f.path);
  while (id) {
    const s = statistiques.get(id);
    s.files++; s.loc += f.loc; s.langs[f.lang || f.category] = (s.langs[f.lang || f.category] || 0) + f.loc;
    if (f.repo !== null) s.repos.add(f.repo);
    id = id === 'unassigned' ? null : parId.get(id)?.parent;
  }
}

// ---------- rapport ----------
const pourcent = fichiersInclus.length ? (nonAffectes.length / fichiersInclus.length) * 100 : 0;
const rapport = [];
if (erreurs.length) {
  rapport.push(`✗ ${erreurs.length} erreur(s) dans ${path.relative(racine, fichierArchi)}${analyse.ebauche ? ' ou sources/plan.json' : ''} :`);
  for (const e of erreurs) rapport.push(`  - ${e}`);
}
const iconesInconnues = [...noeuds.map((n) => n?.icon), ...[...descFichiers.values()].map((d) => d.iconBrute)].filter((x) => x && !ICONES.includes(x));
if (iconesInconnues.length) signalerAvertissement(`icône inconnue : ${[...new Set(iconesInconnues)].join(', ')} (voir la liste dans references/schema.md)`);
if (avertissements.length) {
  rapport.push(`! ${avertissements.length} avertissement(s) :`);
  for (const w of avertissements.slice(0, 40)) rapport.push(`  - ${w}`);
}
rapport.push('');
rapport.push(`AFFECTATION  ${fichiersInclus.length} fichiers (${categoriesInclus.join('+')}), ${nonAffectes.length} non affectés (${pourcent.toFixed(1)}%)`);
for (const n of noeuds.filter((n) => n?.id && !n.parent)) {
  const s = statistiques.get(n.id);
  rapport.push(`  ${n.id.padEnd(28)} ${String(s.files).padStart(5)} fichier${s.files > 1 ? 's' : ''} ${analyse.ebauche ? '' : `${formaterNombre(s.loc).padStart(6)} lignes  `}[${n.kind}]`);
}
if (nonAffectes.length) {
  const parDossier = new Map();
  for (const f of nonAffectes) { const d = f.path.split('/').slice(0, -1).join('/') || '.'; parDossier.set(d, (parDossier.get(d) || 0) + 1); }
  rapport.push(`  non affectés, par dossier :`);
  for (const [d, c] of [...parDossier.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) rapport.push(`    ${String(c).padStart(4)}  ${d}/`);
}
const parType = {};
for (const l of liens.values()) parType[l.k] = (parType[l.k] || 0) + 1;
rapport.push(`LIENS  ${[...liens.values()].length} (${Object.entries(parType).map(([k, v]) => `${k} ${v}`).join(', ')})`);
const fichiersDecrits = fichiersInclus.filter((f) => descFichiers.get(f.path)?.d || f.desc).length;
const routesDecrites = routesRetenues.filter((r) => descRoutes.get(cleRoute(r))?.d || r.desc).length;
const sansResume = noeuds.filter((n) => n?.id && !estTexte(n.summary)).map((n) => n.id);
const nbARevoir = [...descFichiers.values(), ...descRoutes.values()].filter((d) => d.review).length;
rapport.push(`DESCRIPTIONS  fichiers ${fichiersDecrits}/${fichiersInclus.length} · routes ${routesDecrites}/${routesRetenues.length} · modules ${noeuds.length - sansResume.length}/${noeuds.length}${nbARevoir ? ` · ${nbARevoir} à revoir (le code a changé)` : ''}`);
if (sansResume.length) rapport.push(`  modules sans résumé : ${sansResume.slice(0, 12).join(', ')}${sansResume.length > 12 ? '…' : ''}`);
if (fichiersDecrits < fichiersInclus.length || routesDecrites < routesRetenues.length || nbARevoir) rapport.push(`  Lancer decrire.mjs pour obtenir les fiches de travail des ${fichiersInclus.length - fichiersDecrits} fichier(s) et ${routesRetenues.length - routesDecrites} route(s) qui n’ont pas encore de description.`);

if (erreurs.length) { console.log(rapport.join('\n')); console.log('\nCorrige les erreurs ci-dessus et relance build.'); process.exit(1); }
if (params.check) { console.log(rapport.join('\n')); process.exit(0); }

// ---------- écrire .cache/graphe.json et index.html ----------
const graphe = {
  schema: 'la-carte/graph@1',
  meta: {
    generatedAt: new Date().toISOString(), scanAt: analyse.generatedAt, rootName: analyse.rootName, root: analyse.root,
    audience: publicCible, agent,
    ...(analyse.ebauche ? { ebauche: { source: analyse.ebauche.source, stack: analyse.ebauche.stack, assumptions: analyse.ebauche.assumptions } } : {}),
    repos: analyse.repos.map(({ path: p, name: nom, branch: branche, head: tete, remote: distant }) => ({ path: p, name: nom, branch: branche, head: tete, remote: distant })),
    counts: { files: fichiersInclus.length, loc: fichiersInclus.reduce((s, f) => s + f.loc, 0), unassigned: nonAffectes.length },
  },
  projet: archi.projet,
  nodes: [
    ...noeuds.map((n) => ({
      id: n.id, parent: n.parent || null, label: n.label, kind: n.kind, summary: n.summary || '', details: n.details || '', ...(ICONES.includes(n.icon) ? { icon: n.icon } : {}),
      tags: n.tags || [], paths: n.paths || [], packages: n.packages || [], hosts: n.hosts || [],
      stats: { ...statistiques.get(n.id), repos: [...statistiques.get(n.id).repos] },
    })),
    ...(nonAffectes.length ? [{ id: 'unassigned', parent: null, label: 'Non affectés', kind: 'misc', summary: 'Fichiers qu’aucune partie ne revendique. Ajoute des motifs dans sources/architecture.json pour les placer.', details: '', tags: [], paths: [], packages: [], hosts: [], stats: { ...statistiques.get('unassigned'), repos: [...statistiques.get('unassigned').repos] } }] : []),
  ],
  files: fichiersInclus.map((f) => {
    const d = descFichiers.get(f.path);
    return {
      p: f.path, n: proprietaire.get(f.path), r: f.repo, l: f.lang || f.category, loc: f.loc,
      name: d?.name || f.name || nomFichierParDefaut(f.path), ...(d?.icon ? { icon: d.icon } : {}), d: d?.d || f.desc || f.doc || '', ...(d?.d || f.desc ? {} : { auto: true }),
      ...(f.doc ? { doc: f.doc } : {}),
      ...(f.tooLarge ? { tooLarge: true } : {}),
      ...(d?.review ? { review: d.review } : {}),
      ...(f.h ? { h: f.h, sig: f.sig } : {}),
      ...(f.symbols ? { s: f.symbols.map((s) => [s.name, s.kind, s.line, s.default ? 1 : 0, s.doc || '']) } : {}),
      ...(notes.has(f.path) ? notes.get(f.path) : {}),
    };
  }),
  routes: routesRetenues.map((r) => {
    const d = descRoutes.get(cleRoute(r));
    return { f: r.file, m: r.method, p: r.path, l: r.line, h: r.handler || null, name: d?.name || r.name || nomRouteParDefaut(r), d: d?.d || r.desc || r.doc || '', ...(d?.d || r.desc ? {} : { auto: true }), ...(d?.review ? { review: d.review } : {}), ...(r.doc ? { doc: r.doc } : {}), ...(r.access ? { access: r.access } : {}), ...(r.who ? { who: r.who } : {}), ...(r.publicBecause ? { publicBecause: r.publicBecause } : {}) };
  }),
  links: [...liens.values()],
  parcours: parcoursSortie,
  visite: visiteSortie,
  ...(recentSortie?.items.length ? { recent: recentSortie } : {}),
};
// points d’extension, calculés à partir du graphe terminé et de l’analyse brute
// un plan n’a pas de code à contrôler : sa Santé est une revue du plan (calculée après les écrans)
if (!analyse.ebauche) try { graphe.sante = construireSante({ graph: graphe, scan: analyse, arch: archi, root: racine }); } catch (e) { signalerAvertissement(`le contrôle de santé a échoué : ${e.message}`); graphe.sante = { problemes: [] }; }
try { graphe.ecrans = construireEcrans({ graph: graphe, scan: analyse, arch: archi, root: racine }); } catch (e) { signalerAvertissement(`la détection des écrans a échoué : ${e.message}`); graphe.ecrans = []; }
if (analyse.ebauche) try { graphe.sante = construireSantePlan({ graph: graphe, scan: analyse }); } catch (e) { signalerAvertissement(`la revue du plan a échoué : ${e.message}`); graphe.sante = { problemes: [] }; }
// les problèmes marqués « Pas un problème » sur la carte (enregistrés par serveur.mjs) restent listés, à part, et sortent des totaux
const fichierRejets = path.join(dossierSortie, 'sources', 'rejets-sante.json');
if (graphe.sante?.problemes && fs.existsSync(fichierRejets)) {
  try { graphe.sante = avecRejets(graphe.sante, JSON.parse(fs.readFileSync(fichierRejets, 'utf8')).dismissed); } catch (e) { signalerAvertissement(`sources/rejets-sante.json n’est pas un JSON valide : ${e.message}`); }
}
fs.mkdirSync(dossierSortie, { recursive: true });
const avertissementSuivi = garderGeneresHorsGit(dossierSortie);
const alerteDocker = avertissementDocker(racine);
fs.writeFileSync(path.join(dossierSortie, '.cache', 'graphe.json'), JSON.stringify(graphe, null, 0));

const gabarit = assemblerPage(DOSSIER_SKILL);
// Le moteur de mise en page (elkjs 0.9.3) et la police (Inter) sont fournis dans assets/vendor/ et
// intégrés à la page : la carte ne fait aucun appel extérieur et marche hors ligne.
const dossierTiers = path.join(DOSSIER_SKILL, 'assets', 'vendor');
const baliseElk = `<script>${fs.readFileSync(path.join(dossierTiers, 'elk.bundled.js'), 'utf8').replace(/<\/script/gi, '<\\/script')}</script>`;
const PLAGES_POLICES = {
  latin: 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
  'latin-ext': 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF',
};
const cssPolices = [['Inter', 'inter']].flatMap(([famille, fichier]) => Object.entries(PLAGES_POLICES).map(([sousEnsemble, plage]) =>
  `@font-face{font-family:"${famille}";font-style:normal;font-display:swap;font-weight:100 900;unicode-range:${plage};src:url(data:font/woff2;base64,${fs.readFileSync(path.join(dossierTiers, 'fonts', `${fichier}-${sousEnsemble}-wght-normal.woff2`)).toString('base64')}) format("woff2")}`)).join('\n');
const codeRequetes = fs.readFileSync(path.join(DOSSIER_SKILL, 'assets', 'requetes-graphe.js'), 'utf8');
const page = (g) => gabarit
  .replace('/*__GRAPH_QUERY__*/', () => codeRequetes.replace(/<\/script/gi, '<\\/script'))
  .replace('<!--__ELK_SCRIPT__-->', () => baliseElk)
  .replace('/*__FONTS__*/', () => cssPolices)
  .replace('/*__LA_CARTE_DATA__*/null', () => JSON.stringify(g).replace(/<\/(script)/gi, '<\\/$1').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029'))
  .replace(/__LA_CARTE_TITLE__/g, () => echapperHtml(`${archi.projet.name} : la carte`))
  .replace('<!--__UI_EXTENSIONS__-->', () => scriptsUi);
const dossierUi = path.join(DOSSIER_SKILL, 'assets', 'ui');
const scriptsUi = fs.existsSync(dossierUi) ? fs.readdirSync(dossierUi).filter((n) => n.endsWith('.js')).sort().map((n) => `<script>/* ui/${n} */\n${fs.readFileSync(path.join(dossierUi, n), 'utf8').replace(/<\/script/gi, '<\\/script')}</script>`).join('\n') : '';
const html = page(graphe);
fs.writeFileSync(path.join(dossierSortie, 'index.html'), html);
// --artifact : une copie à publier dans l’application Claude, sans le chemin absolu de cet ordinateur (liens vers l’éditeur)
// (et sans les raisons des problèmes de santé rejetés, qui sont des notes personnelles)
const santePartagee = graphe.sante?.dismissed ? { ...graphe.sante, dismissed: graphe.sante.dismissed.map(({ reason: raison, ...d }) => d) } : graphe.sante;
if (params.artifact) fs.writeFileSync(path.join(dossierSortie, 'artifact.html'), page({ ...graphe, ...(santePartagee ? { sante: santePartagee } : {}), meta: { ...graphe.meta, root: null, agent: 'claude' } }));
// Outils autonomes à côté de la carte : poser des questions via la CLI Claude Code ou Codex (serveur.mjs)
// et les recherches dans le graphe qu’il leur confie (requete.mjs). Ils n’ont besoin que de Node, pas de ce skill.
fs.writeFileSync(path.join(dossierSortie, '.cache', 'requete.mjs'), `${codeRequetes}
// ---- cli ----
${fs.readFileSync(path.join(DOSSIER_SKILL, 'assets', 'requete-cli.mjs'), 'utf8')}`);
fs.copyFileSync(path.join(DOSSIER_SKILL, 'assets', 'serveur.mjs'), path.join(dossierSortie, '.cache', 'serveur.mjs'));
// un plan peut être modifié depuis la carte : serveur.mjs le redessine avec plan.mjs et construire.mjs de ce skill
if (analyse.ebauche) { fs.mkdirSync(path.join(dossierSortie, '.cache'), { recursive: true }); fs.writeFileSync(path.join(dossierSortie, '.cache', 'skill.json'), JSON.stringify({ dir: DOSSIER_SKILL })); }
function echapperHtml(s) { return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]); }

const resumeSante = graphe.sante?.summary;
if (resumeSante && (resumeSante.high || resumeSante.medium || resumeSante.low)) {
  rapport.push(`${analyse.ebauche ? 'REVUE DU PLAN' : 'SANTÉ'}  ${resumeSante.high} important(s) · ${resumeSante.medium} à corriger · ${resumeSante.low} mineur(s)`);
  for (const i of graphe.sante.problemes.filter((x) => x.severity !== 'low' && !rejetPour(x, graphe.sante.dismissed)).slice(0, 8)) rapport.push(`  [${i.severity}] ${i.title}`);
}
if (graphe.ecrans?.length) rapport.push(`ÉCRANS  ${graphe.ecrans.length} détecté(s)`);
rapport.push(graphe.recent
  ? `TRAVAIL RÉCENT  ${graphe.recent.items.length} bloc(s) mis en avant sur ${graphe.recent.tasks.length} tâche(s)`
  : `TRAVAIL RÉCENT  rien de mis en avant${fs.existsSync(fichierRecent) ? '' : ' (pas de .cache/travail-recent.json)'}`);
// orienter les futures sessions Claude Code de ce projet vers la carte. Codex n’a pas d’équivalent personnel
// hors Git (AGENTS.md est partagé avec l’équipe) : une carte construite par Codex laisse donc les notes du projet tranquilles.
if (agent === 'codex') rapport.push('AGENT  Codex : les questions posées sur la carte passent par Codex');
if (analyse.ebauche) rapport.push('PLAN  prévu, pas encore construit : dessiné d’après la-carte/sources/plan.json');
rapport.push(avertissementSuivi ? `GIT  ! ${avertissementSuivi}` : 'GIT  seul la-carte/sources/ est à enregistrer avec le projet, le reste s’ignore tout seul');
if (alerteDocker) rapport.push(`DOCKER  ! ${alerteDocker}`);
rapport.push('');
rapport.push(`✓ écrit ${path.relative(racine, path.join(dossierSortie, 'index.html'))} (${Math.round(html.length / 1024)} Ko) et .cache/graphe.json`);
if (pourcent > 10) rapport.push(`  Non affectés : ${pourcent.toFixed(0)} %. Ajoute des parties ou des motifs pour les dossiers ci-dessus (ou mets-les dans "ignore") puis relance build.`);
console.log(rapport.join('\n'));
