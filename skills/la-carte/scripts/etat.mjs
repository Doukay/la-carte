#!/usr/bin/env node
// Affiche s’il existe déjà une carte ici et à quel point elle est périmée. N’échoue jamais.
// usage : node etat.mjs [racine]
import fs from 'node:fs';
import path from 'node:path';
import { git, dossierCarte, estDossierCarte } from './lib/commun.mjs';

try {
  const racine = path.resolve(process.argv[2] || '.');
  const dossier = dossierCarte(racine);
  const fichierGraphe = path.join(dossier, '.cache', 'graphe.json');
  const aArchi = fs.existsSync(path.join(dossier, 'sources', 'architecture.json'));
  if (!fs.existsSync(fichierGraphe)) {
    const aPlan = fs.existsSync(path.join(dossier, 'sources', 'plan.json'));
    console.log(aPlan ? 'un plan a été commencé (sources/plan.json) mais jamais dessiné : écris sources/architecture.json s’il manque, puis lance plan.mjs et construire.mjs.' : aArchi ? 'architecture.json existe mais n’a jamais été construit : lance construire.mjs.' : 'aucune : pas encore de la-carte ici (première construction).');
    process.exit(0);
  }
  const g = JSON.parse(fs.readFileSync(fichierGraphe, 'utf8'));
  if (g.meta.ebauche) {
    console.log(`un plan (prévu, pas encore construit${g.meta.ebauche.source ? `, d’après ${g.meta.ebauche.source}` : ''}) dessiné le ${g.meta.generatedAt} : ${g.meta.counts.files} fichiers prévus, ${g.nodes.length} parties.\nPour changer le plan, modifie la-carte/sources/plan.json et sources/architecture.json, puis lance actualiser.mjs (il redessine d’après sources/plan.json). Si le code existe maintenant et que la personne veut une carte de ce code, lance actualiser.mjs --from-code.`);
    process.exit(0);
  }
  const lignes = [`carte construite le ${g.meta.generatedAt}, elle couvre ${g.meta.counts.files} fichiers et ${g.nodes.length} parties.`];
  for (const r of g.meta.repos || []) {
    const absolu = path.join(racine, r.path);
    const tete = git(absolu, ['rev-parse', 'HEAD']);
    if (!tete || !/^[0-9a-f]{7,64}$/.test(r.head || '')) { lignes.push(`  ${r.path}: n’est plus un dépôt git`); continue; }
    const horsCarte = (p) => !/(^|\/)la-carte\//.test(p);
    const modifies = tete === r.head ? [] : (git(absolu, ['diff', '--name-only', r.head, tete]) || '').split('\n').filter(Boolean).filter(horsCarte);
    const nonCommites = (git(absolu, ['status', '--porcelain']) || '').split('\n').filter(Boolean).filter(horsCarte).length;
    lignes.push(`  ${r.path}: ${tete === r.head ? 'même commit' : `${modifies.length} fichier(s) modifié(s) depuis ${r.head.slice(0, 7)}`}${nonCommites ? `, ${nonCommites} non commité(s)` : ''}`);
    if (modifies.length) lignes.push(`    par exemple : ${modifies.slice(0, 6).map((p) => (r.path === '.' ? p : `${r.path}/${p}`)).join(', ')}`);
  }
  lignes.push('Une carte existe : mets-la à jour avec actualiser.mjs (seuls les fichiers modifiés coûtent des jetons) plutôt que de tout recommencer.');
  console.log(lignes.join('\n'));
} catch (e) {
  console.log(`état indisponible (${e.message})`);
}
