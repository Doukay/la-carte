// Reconstitue la page de la carte à partir de assets/carte/ : le gabarit, puis les feuilles de style et les morceaux de code,
// dans l'ordre de leur numéro. Les morceaux de code s'exécutent dans une seule fonction : ils partagent leurs variables.
import fs from 'node:fs';
import path from 'node:path';

const lireDossier = (dossier) => fs.readdirSync(dossier).sort().map((nom) => fs.readFileSync(path.join(dossier, nom), 'utf8').replace(/\n$/, '')).join('\n');

export function assemblerPage(dossierSkill) {
  const racine = path.join(dossierSkill, 'assets', 'carte');
  return fs.readFileSync(path.join(racine, 'page.html'), 'utf8')
    .replace('/*__CSS__*/', () => lireDossier(path.join(racine, 'css')))
    .replace('/*__JS__*/', () => lireDossier(path.join(racine, 'js')));
}
