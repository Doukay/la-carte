// Vérifie les liens internes du README et des docs : chaque fichier cité existe, et chaque ancre (#…) correspond à un
// titre du fichier visé (selon la règle de GitHub) ou à un <a id="…">. Usage : node outils/verifier-liens.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEPOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// CHANGELOG.md n'est pas relu : le journal de l'auteur, gardé tel quel, cite des fichiers qui n'existent plus ici
const fichiers = ['README.md', 'CONTRIBUER.md', 'SECURITY.md', ...fs.readdirSync(path.join(DEPOT, 'docs')).filter((f) => f.endsWith('.md')).map((f) => `docs/${f}`)];
// règle de GitHub : minuscules, ponctuation retirée (accents gardés), espaces en tirets
const ancre = (titre) => titre.trim().toLowerCase().replace(/[`*_]/g, '').replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s/g, '-');
function ancresDe(fichier) {
  const texte = fs.readFileSync(path.join(DEPOT, fichier), 'utf8').replace(/```[\s\S]*?```/g, '');
  const vues = new Map(), sortie = new Set();
  for (const m of texte.matchAll(/^#{1,6}\s+(.+)$/gm)) {
    const a = ancre(m[1].replace(/\[([^\]]*)\]\([^)]*\)/g, '$1'));
    const n = vues.get(a) || 0;
    sortie.add(n ? `${a}-${n}` : a);
    vues.set(a, n + 1);
  }
  for (const m of texte.matchAll(/<a id="([^"]+)"/g)) sortie.add(m[1]);
  return sortie;
}
const erreurs = [];
for (const f of fichiers) {
  const texte = fs.readFileSync(path.join(DEPOT, f), 'utf8').replace(/```[\s\S]*?```/g, '');
  for (const m of texte.matchAll(/\]\(([^)\s]+)\)|<img src="([^"]+)"/g)) {
    const cible = m[1] || m[2];
    if (/^(https?:|mailto:)/.test(cible)) continue;
    const [chemin, morceau] = cible.split('#');
    const vise = chemin ? path.posix.normalize(path.posix.join(path.posix.dirname(f), chemin)) : f;
    if (!fs.existsSync(path.join(DEPOT, vise))) { erreurs.push(`${f} → ${cible} : fichier absent`); continue; }
    if (morceau && vise.endsWith('.md') && !ancresDe(vise).has(decodeURIComponent(morceau))) erreurs.push(`${f} → ${cible} : ancre absente`);
  }
}
if (erreurs.length) { console.log(erreurs.join('\n')); process.exit(1); }
console.log(`✓ Liens internes du README et des docs : tous trouvés (${fichiers.length} fichiers).`);
