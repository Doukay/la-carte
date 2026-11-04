#!/usr/bin/env node
// floorplan plan : transforme floorplan/plan.json (les fichiers, les adresses du serveur et les liens qu’aurait un système,
// prévus à partir d’un cahier des charges ou d’une description) en floorplan/.cache/scan.json, de la même forme que
// ce que scan.mjs écrit pour du vrai code. build.mjs le dessine ensuite comme un plan : la même carte, marquée « prévu ».
//
// usage : node plan.mjs [racine] [--plan <fichier>]

import fs from 'node:fs';
import path from 'node:path';
import { lireArguments, versPosix, dossierCarte, garderHorsGit } from './lib/common.mjs';
import { planVersAnalyse } from './lib/blueprint.mjs';

const params = lireArguments(process.argv.slice(2));
const racine = path.resolve(params._[0] || '.');
const dossierSortie = dossierCarte(racine);
const fichierPlan = path.resolve(params.plan || path.join(dossierSortie, 'plan.json'));
const fichierSortie = path.join(dossierSortie, '.cache', 'scan.json');

const echouer = (message) => { console.error(`✗ ${message}`); process.exit(1); };
if (!fs.existsSync(fichierPlan)) echouer(`Aucun plan à ${fichierPlan}. Écris-le d’abord (voir references/blueprint.md).`);
let plan;
try { plan = JSON.parse(fs.readFileSync(fichierPlan, 'utf8')); } catch (e) { echouer(`plan.json n’est pas un JSON valide : ${e.message}`); }

const { scan: analyse, errors: erreurs, warnings: avertissements } = planVersAnalyse(plan, racine);
// "services" et "data" désignent des parties de architecture.json : les vérifier dès maintenant si le fichier est écrit
const fichierArchi = path.join(dossierSortie, 'architecture.json');
if (analyse && fs.existsSync(fichierArchi)) {
  let ids = null;
  try { ids = (JSON.parse(fs.readFileSync(fichierArchi, 'utf8')).nodes || []).map((n) => n?.id).filter(Boolean); } catch {}
  if (ids) for (const l of analyse.nodeLinks) if (!ids.includes(l.to)) {
    const proche = ids.find((id) => id.toLowerCase().startsWith(l.to.toLowerCase().slice(0, 3)));
    erreurs.push(`files "${l.from}".${l.kind === 'data' ? 'data' : 'services'} "${l.to}" n’est pas un identifiant de partie dans architecture.json${proche ? ` (tu voulais dire "${proche}" ?)` : ''}`);
  }
}
const sortie = [];
if (erreurs.length) { sortie.push(`✗ ${erreurs.length} erreur(s) dans ${versPosix(path.relative(racine, fichierPlan))} :`); for (const e of erreurs) sortie.push(`  - ${e}`); }
if (avertissements.length) { sortie.push(`! ${avertissements.length} avertissement(s) :`); for (const w of avertissements.slice(0, 40)) sortie.push(`  - ${w}`); }
if (erreurs.length) { console.log(sortie.join('\n')); console.log('\nCorrige les erreurs ci-dessus et relance plan.mjs.'); process.exit(1); }

fs.mkdirSync(path.dirname(fichierSortie), { recursive: true });
fs.writeFileSync(fichierSortie, JSON.stringify(analyse));
garderHorsGit(dossierSortie);

const infosPlan = analyse.ebauche;
const parDossier = new Map();
for (const f of analyse.files) { const d = f.path.split('/').slice(0, -1).slice(0, 2).join('/') || '.'; parDossier.set(d, (parDossier.get(d) || 0) + 1); }
if (sortie.length) sortie.push('');
sortie.push(`PLAN  ${analyse.files.length} fichiers prévus · ${analyse.routes.length} adresses du serveur · ${analyse.http.length} appels vers des adresses prévues · ${analyse.nodeLinks.length} liens vers des services et des données`);
for (const [d, n] of [...parDossier].sort((a, b) => b[1] - a[1]).slice(0, 15)) sortie.push(`  ${String(n).padStart(4)}  ${d}/`);
const nbEcrans = analyse.files.filter((f) => f.ecrans).length;
if (nbEcrans) sortie.push(`ÉCRANS  ${nbEcrans} prévu(s)`);
if (infosPlan.questions.length) sortie.push(`QUESTIONS OUVERTES  ${infosPlan.questions.length} (affichées dans Santé tant qu’elles n’ont pas de réponse)`);
sortie.push('');
sortie.push(`✓ écrit ${versPosix(path.relative(racine, fichierSortie))}. Ensuite : lance build.mjs${fs.existsSync(fichierArchi) ? '' : ' une fois floorplan/architecture.json écrit'}.`);
console.log(sortie.join('\n'));
