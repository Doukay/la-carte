// floorplan/requete.mjs : cherche dans le graphe.json de ce dossier. Généré par construire.mjs ; la CLI Claude
// Code l’appelle quand tu poses des questions depuis la carte (node floorplan/serveur.mjs).
//
// usage : node floorplan/requete.mjs overview
//        node floorplan/requete.mjs find "<mots>" [--kind module|file|endpoint|symbol] [--limit 15]
//        node floorplan/requete.mjs show <id>
//        node floorplan/requete.mjs path <idDepart> <idArrivee>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ici = path.dirname(fileURLToPath(import.meta.url));
const G = JSON.parse(fs.readFileSync(path.join(ici, 'graphe.json'), 'utf8'));
const q = creerRequetesGraphe(G);
const argv = process.argv.slice(2);
const lireOption = (nom) => { const i = argv.indexOf('--' + nom); if (i < 0) return undefined; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const type = lireOption('kind'), limite = lireOption('limit');
const [commande, ...reste] = argv;
try {
  let sortie;
  if (commande === 'overview') sortie = q.overview();
  else if (commande === 'find') sortie = q.find(reste.join(' '), type, limite);
  else if (commande === 'show') sortie = q.show(reste[0]);
  else if (commande === 'path') sortie = q.path(reste[0], reste[1]);
  else { console.log('commandes : overview | find "<mots>" [--kind module|file|endpoint|symbol] | show <id> | path <idDepart> <idArrivee>'); process.exit(commande ? 1 : 0); }
  console.log(JSON.stringify(sortie, null, 1));
} catch (e) {
  console.log(JSON.stringify({ error: e.message }));
  process.exit(1);
}
