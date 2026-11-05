#!/usr/bin/env node
// Faits pour marquer le « travail récent » sur la carte : ce qui a changé depuis la dernière carte (d’après actualiser.mjs),
// les changements non commités et les commits récents, chacun relié au bloc qu’il devient. Claude ajoute le pourquoi
// (ce que la personne avait demandé) et écrit la-carte/.cache/travail-recent.json. Lecture seule.
// Avec --git, aucun Claude : chaque commit des derniers jours devient une tâche (son message pour titre) et le script écrit
// lui-même travail-recent.json, sauf si Claude en a écrit un plus récent que le dernier commit.
// usage : node recents.mjs [racine] [--days 7] [--git]
import fs from 'node:fs';
import path from 'node:path';
import { git, lireArguments, dossierCarte } from './lib/commun.mjs';

const params = lireArguments(process.argv.slice(2));
const racine = path.resolve(params._[0] || '.');
const dossier = dossierCarte(racine);
const fichierGraphe = path.join(dossier, '.cache', 'graphe.json');
if (!fs.existsSync(fichierGraphe)) { console.error('✗ Pas de la-carte/.cache/graphe.json. Lance d’abord construire.mjs.'); process.exit(1); }
const G = JSON.parse(fs.readFileSync(fichierGraphe, 'utf8'));
const lireJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const changements = lireJson(path.join(dossier, '.cache', 'changes.json'));
const actuel = lireJson(path.join(dossier, '.cache', 'travail-recent.json'));

const fichiers = new Map(G.files.map((f) => [f.p, f]));
const etiquettes = new Map(G.nodes.map((n) => [n.id, n.label]));
const routesDe = new Map();
for (const r of G.routes) { if (!routesDe.has(r.f)) routesDe.set(r.f, []); routesDe.get(r.f).push(`${r.m} ${r.p}`); }
const blocDe = (p) => {
  const f = fichiers.get(p);
  if (!f) return '(pas sur la carte)';
  const routesFichier = routesDe.get(p) || [];
  return `"${f.name}" dans ${etiquettes.get(f.n) || f.n}${routesFichier.length ? ` · ${routesFichier.length} adresse(s) du serveur` : ''}`;
};

if (params.git) {
  const depuisGit = new Date(Date.now() - (Number(params.days) || 7) * 86400000).toISOString();
  const taches = [];
  let dernierCommit = 0;
  for (const r of G.meta.repos || []) {
    const prefixe = r.path === '.' ? '' : r.path + '/';
    const journal = git(path.join(racine, r.path), ['log', `--since=${depuisGit}`, '--max-count=15', '--no-merges', '--name-status', '--date=iso-strict', '--format=@@%h%x09%ad%x09%s']) || '';
    for (const bloc of journal.split('@@').filter((b) => b.trim())) {
      const [entete, ...lignes] = bloc.trim().split('\n').filter(Boolean);
      const [hash, date, ...sujet] = entete.split('\t');
      dernierCommit = Math.max(dernierCommit, Date.parse(date) || 0);
      const elements = lignes.map((l) => l.split('\t'))
        .map((champs) => ({ ref: prefixe + champs[champs.length - 1], change: champs[0].startsWith('A') ? 'new' : 'changed' }))
        .filter((e) => fichiers.has(e.ref));
      if (elements.length) taches.push({ title: sujet.join('\t'), summary: `Commit ${hash} du ${date.slice(0, 10)}.`, at: Date.parse(date) || 0, items: elements.slice(0, 12) });
    }
  }
  // un travail récent écrit par Claude (avec le pourquoi) reste tant qu’aucun commit n’est venu après lui
  const ecritLe = actuel && (Date.parse(actuel.updatedAt) || fs.statSync(path.join(dossier, '.cache', 'travail-recent.json')).mtimeMs);
  if (actuel && actuel.source !== 'git' && ecritLe >= dernierCommit) {
    console.log(`Travail récent écrit par Claude le ${actuel.updatedAt} gardé : aucun commit depuis.`);
    process.exit(0);
  }
  taches.sort((a, b) => b.at - a.at);
  const sortie = { source: 'git', updatedAt: new Date().toISOString(), tasks: taches.slice(0, 10).map(({ at, ...t }) => t) };
  fs.writeFileSync(path.join(dossier, '.cache', 'travail-recent.json'), JSON.stringify(sortie, null, 2) + '\n');
  console.log(`Travail récent d’après Git : ${sortie.tasks.length} commit(s) des ${Number(params.days) || 7} derniers jours. Lance construire.mjs.`);
  process.exit(0);
}

const L = [];
const MAXIMUM = 40;
const liste = (lignes) => { lignes.slice(0, MAXIMUM).forEach((r) => L.push('  ' + r)); if (lignes.length > MAXIMUM) L.push(`  … +${lignes.length - MAXIMUM} de plus`); };

L.push(`TRAVAIL RÉCENT  éléments pour ${G.projet.name}  (carte construite le ${G.meta.generatedAt})`);
L.push(actuel?.tasks
  ? `.cache/travail-recent.json actuel : ${actuel.tasks.length} tâche(s), mis à jour le ${actuel.updatedAt || 'date inconnue'}. Réécris-le : il remplace les blocs mis en avant précédemment.`
  : 'Pas encore de .cache/travail-recent.json.');

if (changements) {
  L.push('', `CHANGÉ DEPUIS LA CARTE PRÉCÉDENTE (${changements.since} → ${changements.at})`);
  const lignes = [
    ...changements.files.new.map((p) => `nouveau  ${p}  → ${blocDe(p)}`),
    ...changements.files.edited.map((p) => `modifié  ${p}  → ${blocDe(p)}`),
    ...changements.files.moved.map((m) => `déplacé  ${m.from} → ${m.to}  → ${blocDe(m.to)}`),
    ...changements.files.deleted.map((p) => `supprimé ${p}  (disparu de la carte ; mentionne-le dans le résumé de la tâche)`),
    ...changements.routes.new.map((k) => `nouvelle adresse du serveur  ${k}`),
    ...changements.routes.moved.map((m) => `adresse du serveur au nouveau chemin  ${m.from} → ${m.to}`),
    ...changements.routes.removed.map((k) => `adresse du serveur retirée  ${k}`),
  ];
  if (lignes.length) liste(lignes); else L.push('  rien');
}

const depuis = changements?.since || actuel?.updatedAt || new Date(Date.now() - (Number(params.days) || 7) * 86400000).toISOString();
for (const r of G.meta.repos || []) {
  const absolu = path.join(racine, r.path);
  const prefixe = r.path === '.' ? '' : r.path + '/';
  const statut = (git(absolu, ['status', '--porcelain=v1', '-uall']) || '').split('\n').filter(Boolean).filter((s) => !/(^|\/|\s)la-carte\//.test(s));
  const journal = (git(absolu, ['log', `--since=${depuis}`, '--max-count=20', '--no-merges', '--name-only', '--date=short', '--format=@@%h %ad %s']) || '').trim();
  if (!statut.length && !journal) continue;
  L.push('', `DÉPÔT ${r.path === '.' ? G.meta.rootName : r.path}`);
  if (statut.length) {
    L.push('  non commités :');
    liste(statut.map((s) => { const p = prefixe + s.slice(3).replace(/^.* -> /, '').replace(/"/g, ''); return `  ${s.slice(0, 2).trim().padEnd(2)} ${p}  → ${blocDe(p)}`; }));
  }
  if (journal) {
    L.push(`  commits depuis le ${depuis.slice(0, 10)} :`);
    for (const bloc of journal.split('@@').filter(Boolean)) {
      const [entete, ...tousChemins] = bloc.trim().split('\n').filter(Boolean);
      const chemins = tousChemins.filter((p) => !/(^|\/)la-carte\//.test(p));
      L.push(`    ${entete}`);
      chemins.slice(0, 8).forEach((p) => L.push(`        ${prefixe + p}  → ${blocDe(prefixe + p)}`));
      if (chemins.length > 8) L.push(`        … +${chemins.length - 8} fichiers de plus`);
    }
  }
}

L.push('', 'Écris la-carte/.cache/travail-recent.json (refs : un chemin de fichier, un id de partie, ou "METHODE /chemin" ; voir references/schema.md#travail-récent) :',
  '  { "tasks": [ { "title": "…", "request": "ce que la personne a demandé", "summary": "ce qui a été fait pour y répondre, et où ça en est",',
  '      "items": [ { "ref": "<chemin du fichier>", "change": "changed|new", "note": "ce qui a changé ici, et en quoi ça sert la demande" } ] } ] }',
  'Puis lance construire.mjs. Utilise { "tasks": [] } quand rien n’a été travaillé.');
console.log(L.join('\n'));
