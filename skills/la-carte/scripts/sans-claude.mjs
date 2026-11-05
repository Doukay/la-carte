#!/usr/bin/env node
// la-carte sans Claude : remet une carte à jour sans aucun jeton, pour une tâche planifiée.
// Analyse le code ; sans sources/architecture.json, range les fichiers par dossier (lib/architecture-auto.mjs) ; sinon garde
// les descriptions déjà écrites (actualiser.mjs) et donne un nom par défaut aux nouveaux fichiers. Remplit ensuite
// « Récent » avec les commits Git (recents.mjs --git), reconstruit, et peut écrire une copie à partager.
//
// usage : node sans-claude.mjs [racine] [--export <fichier>] [--min-code 3] [--nom "Nom du projet"]
// Avec LA_CARTE_DOSSIER=<dossier>, la carte est rangée là au lieu de <racine>/la-carte : le projet n’est pas touché.
// Code de sortie : 0 carte à jour, 3 pas assez de code pour une carte, 1 échec.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { lireArguments, dossierCarte } from './lib/commun.mjs';
import { architectureAuto } from './lib/architecture-auto.mjs';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const params = lireArguments(process.argv.slice(2));
const racine = path.resolve(params._[0] || '.');
const dossier = dossierCarte(racine);
const fichierArchi = path.join(dossier, 'sources', 'architecture.json');
const lancer = (script, ...reste) => execFileSync(process.execPath, [path.join(ICI, script), racine, ...reste], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

try {
  // une carte faite ici sans Claude reprend le nom demandé (celle que Claude a décrite garde le sien)
  if (typeof params.nom === 'string' && params.nom.trim() && fs.existsSync(fichierArchi)) {
    const archi = JSON.parse(fs.readFileSync(fichierArchi, 'utf8'));
    if (archi.auto && archi.projet?.name !== params.nom.trim()) { archi.projet = { ...archi.projet, name: params.nom.trim() }; fs.writeFileSync(fichierArchi, JSON.stringify(archi, null, 2) + '\n'); }
  }
  // actualiser.mjs a besoin d’une construction précédente ; des sources recopiées d’ailleurs n’en ont pas encore
  if (fs.existsSync(fichierArchi) && fs.existsSync(path.join(dossier, '.cache', 'graphe.json'))) lancer('actualiser.mjs');
  else {
    lancer('analyser.mjs');
    if (!fs.existsSync(fichierArchi)) {
      const analyse = JSON.parse(fs.readFileSync(path.join(dossier, '.cache', 'analyse.json'), 'utf8'));
      const nbCode = analyse.files.filter((f) => f.category === 'code').length;
      if (nbCode < (Number(params['min-code']) || 3)) { console.log(`Pas de carte : ${nbCode} fichier(s) de code seulement.`); process.exit(3); }
      fs.mkdirSync(path.dirname(fichierArchi), { recursive: true });
      fs.writeFileSync(fichierArchi, JSON.stringify(architectureAuto(analyse, (typeof params.nom === 'string' && params.nom.trim()) || analyse.rootName || path.basename(racine)), null, 2) + '\n');
    }
    lancer('construire.mjs');
  }
  if (!fs.existsSync(path.join(dossier, '.cache', 'graphe.json'))) throw new Error('la construction n’a pas écrit .cache/graphe.json');
  const recent = lancer('recents.mjs', '--git').trim();
  lancer('construire.mjs');
  const graphe = JSON.parse(fs.readFileSync(path.join(dossier, '.cache', 'graphe.json'), 'utf8'));
  const aDecrire = graphe.files.filter((f) => f.auto).length;
  console.log(`Carte à jour : ${graphe.files.length} fichiers, dont ${aDecrire} sans description de Claude. ${recent}`);
  if (params.export) {
    // pas de contrôle de santé dans la copie : il dit où sont les secrets dans le code
    execFileSync(process.execPath, [path.join(dossier, '.cache', 'serveur.mjs'), '--export', path.resolve(params.export), '--include', 'flows,notes,recent'], { stdio: ['ignore', 'pipe', 'pipe'] });
    console.log(`Copie écrite : ${path.resolve(params.export)}`);
  }
} catch (e) {
  console.error(`✗ ${String(e.stderr || '').trim().split('\n').slice(-3).join(' ') || e.message}`);
  process.exit(1);
}
