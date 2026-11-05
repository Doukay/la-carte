#!/usr/bin/env node
// Avant tout envoi : le dépôt ne doit connaître ni son auteur, ni son ordinateur, ni l'installation de qui que ce soit.
// Regarde les fichiers suivis par git et, pour les mots privés, tout l'historique, les auteurs et les marques.
// Les mots privés restent hors du dépôt, un par ligne, dans .claude/mots-interdits.txt : les écrire ici les publierait.
//
// usage : node outils/rien-de-personnel.mjs [dossier]
// Se lance aussi tout seul avant chaque envoi, par le crochet .git/hooks/pre-push de l'ordinateur de développement.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// ce qui appartient à une installation, jamais à l'outil
const INTERDITS = [
  [/\b[A-Za-z]:[\\/]+(Dev|Users)\b/, 'chemin de cet ordinateur'],
  [/(^|[\s"'`(=])\/(Users|home)\/[a-z]/, 'chemin de cet ordinateur'],
  [/\b192\.168\.\d+\.\d+\b/, 'adresse du réseau local'],
  [/\b100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d+\.\d+\b/, 'adresse de réseau privé'],
  [/\.ts\.net\b|\btailscale\b/i, 'réseau privé'],
  [/\bmedia-?center\b/i, 'serveur personnel'],
  [/(?<![-\w])hub(?![-\w])/i, 'le hub : le dépôt ne le connaît pas'],
  [/_SUIVI-PROJETS|\bSUIVI\.md\b/, 'suivi personnel'],
];
// du code tiers, et ce fichier qui nomme forcément ce qu'il cherche
const HORS_CONTROLE = /^(skills\/la-carte\/assets\/vendor\/|outils\/rien-de-personnel\.mjs$|tests\/rien-de-personnel\.test\.mjs$)/;
const BINAIRE = /\.(png|jpe?g|gif|webp|ico|woff2?|ttf|pdf|zip)$/i;

const git = (racine, ...params) => execFileSync('git', ['-C', racine, ...params], { encoding: 'utf8', maxBuffer: 1 << 30, stdio: ['ignore', 'pipe', 'ignore'] });

export function lireMotsPrives(racine) {
  try { return fs.readFileSync(path.join(racine, '.claude', 'mots-interdits.txt'), 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#')); }
  catch { return []; }
}

/** Rend les fuites trouvées, sans jamais répéter un mot privé : ce résultat peut finir dans un journal. */
export function trouverFuites(racine, motsPrives = []) {
  const fuites = [];
  const echappes = motsPrives.map((m) => m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const prives = echappes.length ? new RegExp(echappes.join('|'), 'i') : null;
  for (const f of git(racine, 'ls-files').split('\n').filter(Boolean)) {
    if (prives?.test(f)) fuites.push(`nom de fichier privé : ${f.replace(prives, '…')}`);
    if (HORS_CONTROLE.test(f) || BINAIRE.test(f)) continue;
    let texte;
    try { texte = fs.readFileSync(path.join(racine, f), 'utf8'); } catch { continue; }
    texte.split('\n').forEach((ligne, i) => {
      for (const [motif, raison] of INTERDITS) if (motif.test(ligne)) fuites.push(`${f}:${i + 1} ${raison}`);
      if (prives?.test(ligne)) fuites.push(`${f}:${i + 1} mot privé`);
    });
  }
  if (prives) {
    const signatures = git(racine, 'log', '--all', '--format=%h %an %ae %cn %ce');
    for (const l of signatures.split('\n')) if (prives.test(l)) fuites.push(`commit ${l.split(' ')[0]} : signature privée`);
    const marques = git(racine, 'for-each-ref', '--format=%(refname:short) %(taggername) %(taggeremail)', 'refs/tags');
    for (const l of marques.split('\n')) if (prives.test(l)) fuites.push(`marque ${l.split(' ')[0]} : signature privée`);
    const motif = echappes.join('|');
    for (const h of new Set([...git(racine, 'log', '--all', '--format=%h', '-i', '-E', `--grep=${motif}`).split('\n'), ...git(racine, 'log', '--all', '--format=%h', '-i', '--extended-regexp', `-G${motif}`).split('\n')])) if (h) fuites.push(`commit ${h} : mot privé dans l’historique`);
  }
  return [...new Set(fuites)];
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const racine = path.resolve(process.argv[2] || '.');
  const mots = lireMotsPrives(racine);
  const fuites = trouverFuites(racine, mots);
  if (fuites.length) {
    console.error(`✗ ${fuites.length} élément(s) personnel(s) dans le dépôt. Rien ne doit partir tant qu'ils y sont :`);
    for (const f of fuites.slice(0, 40)) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`✓ Rien de personnel dans le dépôt (${mots.length ? `${mots.length} mots privés contrôlés aussi dans l'historique` : 'pas de liste de mots privés sur cet ordinateur'}).`);
}
