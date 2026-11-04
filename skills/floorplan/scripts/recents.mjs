#!/usr/bin/env node
// Faits pour marquer le « travail récent » sur la carte : ce qui a changé depuis la dernière carte (d’après actualiser.mjs),
// les changements non commités et les commits récents, chacun relié au bloc qu’il devient. Claude ajoute le pourquoi
// (ce que la personne avait demandé) et écrit floorplan/travail-recent.json. Lecture seule.
// usage : node recents.mjs [racine] [--days 7]
import fs from 'node:fs';
import path from 'node:path';
import { git, lireArguments, dossierCarte } from './lib/commun.mjs';

const params = lireArguments(process.argv.slice(2));
const racine = path.resolve(params._[0] || '.');
const dossier = dossierCarte(racine);
const fichierGraphe = path.join(dossier, 'graphe.json');
if (!fs.existsSync(fichierGraphe)) { console.error('✗ Pas de floorplan/graphe.json. Lance d’abord construire.mjs.'); process.exit(1); }
const G = JSON.parse(fs.readFileSync(fichierGraphe, 'utf8'));
const lireJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const changements = lireJson(path.join(dossier, '.cache', 'changes.json'));
const actuel = lireJson(path.join(dossier, 'travail-recent.json'));

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
const L = [];
const MAXIMUM = 40;
const liste = (lignes) => { lignes.slice(0, MAXIMUM).forEach((r) => L.push('  ' + r)); if (lignes.length > MAXIMUM) L.push(`  … +${lignes.length - MAXIMUM} de plus`); };

L.push(`TRAVAIL RÉCENT  éléments pour ${G.projet.name}  (carte construite le ${G.meta.generatedAt})`);
L.push(actuel?.tasks
  ? `travail-recent.json actuel : ${actuel.tasks.length} tâche(s), mis à jour le ${actuel.updatedAt || 'date inconnue'}. Réécris-le : il remplace les blocs mis en avant précédemment.`
  : 'Pas encore de travail-recent.json.');

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
  const statut = (git(absolu, ['status', '--porcelain=v1', '-uall']) || '').split('\n').filter(Boolean);
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
      const [entete, ...chemins] = bloc.trim().split('\n').filter(Boolean);
      L.push(`    ${entete}`);
      chemins.slice(0, 8).forEach((p) => L.push(`        ${prefixe + p}  → ${blocDe(prefixe + p)}`));
      if (chemins.length > 8) L.push(`        … +${chemins.length - 8} fichiers de plus`);
    }
  }
}

L.push('', 'Écris floorplan/travail-recent.json (refs : un chemin de fichier, un id de partie, ou "METHODE /chemin" ; voir references/schema.md#travail-récent) :',
  '  { "tasks": [ { "title": "…", "request": "ce que la personne a demandé", "summary": "ce qui a été fait pour y répondre, et où ça en est",',
  '      "items": [ { "ref": "<chemin du fichier>", "change": "changed|new", "note": "ce qui a changé ici, et en quoi ça sert la demande" } ] } ] }',
  'Puis lance construire.mjs. Utilise { "tasks": [] } quand rien n’a été travaillé.');
console.log(L.join('\n'));
