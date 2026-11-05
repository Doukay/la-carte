// Les liens cassés à l'instant de l'analyse : un fichier importé qui n'existe plus, une fonction importée qui a disparu,
// un appel à une adresse du serveur qui n'existe pas. On préfère rater un cas que crier au loup : dès qu'un doute existe
// (chemin dynamique, fichier présent sur le disque mais hors de git, export * dans la cible), le lien n'est pas signalé.
import fs from 'node:fs';
import path from 'node:path';
import { noterAppel, segmentsRoute } from './routes.mjs';

const LANGUES_JS = new Set(['javascript', 'typescript', 'js', 'ts', 'jsx', 'tsx']);
const EXTENSIONS = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts', '.vue', '.svelte', '.json', '.css', '.scss', '.sass', '.less', '.d.ts'];
const FICHIER_TEST = /(^|\/)(tests?|__tests__|__mocks__|spec|specs|e2e|fixtures?)\/|\.(test|spec|stories)\.[a-z]+$/;

export function trouverLiensCasses(racine, fichiers, routes) {
  const casses = [];
  const textes = new Map();
  const texteDe = (p) => {
    if (!textes.has(p)) { try { textes.set(p, fs.readFileSync(path.join(racine, p), 'utf8')); } catch { textes.set(p, null); } }
    return textes.get(p);
  };
  const existe = (depuis, specifieur) => {
    const base = path.join(racine, path.dirname(depuis), specifieur.split(/[?#]/)[0]);
    return EXTENSIONS.some((e) => fs.existsSync(base + e));
  };
  const parChemin = new Map(fichiers.map((f) => [f.path, f]));
  // Python : seulement les imports relatifs (from .prix import calcul). Un import absolu peut venir de n'importe quel paquet installé.
  const existePy = (depuis, spec) => {
    const points = /^\.+/.exec(spec)[0].length;
    let dossier = path.dirname(depuis);
    for (let n = 1; n < points; n++) dossier = path.dirname(dossier);
    const base = path.join(racine, dossier, ...spec.slice(points).split('.').filter(Boolean));
    return fs.existsSync(`${base}.py`) || fs.existsSync(`${base}.pyi`) || fs.existsSync(`${base}.so`) || fs.existsSync(base);
  };
  for (const f of fichiers) {
    if (f.lang !== 'python') continue;
    for (const i of f.imports || []) {
      const spec = String(i.spec || '');
      if (!spec.startsWith('.')) continue;
      if (!/^\.+$/.test(spec) && !i.files?.length) {
        if (!existePy(f.path, spec)) casses.push({ from: f.path, kind: 'fichier', target: spec, line: i.line });
        continue;
      }
      if (/^\.+$/.test(spec) || i.files?.length !== 1) continue;
      const cible = parChemin.get(i.files[0]);
      if (cible?.lang !== 'python') continue;
      const texte = texteDe(cible.path);
      // from x import * et __getattr__ fabriquent des noms que la lecture du fichier ne montre pas
      if (texte == null || /\bimport\s+\*|__getattr__/.test(texte)) continue;
      for (const nom of new Set(i.names || [])) {
        // dans un paquet, le nom importé peut être un fichier ou un dossier voisin de __init__.py
        // « from .noyau import base » : la cible est alors le fichier base.py lui-même, le nom désigne le fichier
        if (path.basename(cible.path).replace(/\.pyi?$/, '') === nom) continue;
        const voisin = path.join(racine, path.dirname(cible.path), nom);
        if (path.basename(cible.path) === '__init__.py' && (fs.existsSync(`${voisin}.py`) || fs.existsSync(voisin))) continue;
        if (!new RegExp(`(^|[^\\w])${nom}([^\\w]|$)`).test(texte)) casses.push({ from: f.path, kind: 'fonction', target: nom, to: cible.path, line: i.line });
      }
    }
  }

  for (const f of fichiers) {
    if (!LANGUES_JS.has(f.lang)) continue;
    for (const i of f.imports || []) {
      const spec = String(i.spec || '');
      if (!spec.startsWith('.') || /[`$*{]/.test(spec)) continue;
      if (!i.files?.length) {
        if (!existe(f.path, spec)) casses.push({ from: f.path, kind: 'fichier', target: spec, line: i.line });
        continue;
      }
      if (i.files.length !== 1 || !i.locals) continue;
      const cible = parChemin.get(i.files[0]);
      if (!cible || !LANGUES_JS.has(cible.lang)) continue;
      const connus = new Set((cible.symbols || []).map((s) => s.name));
      const manquants = Object.values(i.locals).filter((o) => o && o !== 'default' && o !== '*' && !connus.has(o));
      if (!manquants.length) continue;
      const texte = texteDe(cible.path);
      // export * et module.exports : on ne peut pas savoir ce que le fichier exporte vraiment
      if (texte == null || /\bexport\s*\*|\bmodule\.exports\b|\bexports\.\w/.test(texte)) continue;
      for (const nom of new Set(manquants)) {
        if (!new RegExp(`(^|[^\\w$])${nom.replace(/\$/g, '\\$')}([^\\w$]|$)`).test(texte)) casses.push({ from: f.path, kind: 'fonction', target: nom, to: cible.path, line: i.line });
      }
    }
  }

  // un appel se compare seulement aux adresses de ce projet : sans adresse connue, ou hors de leurs débuts de chemin, on ne dit rien
  const adresses = routes.filter((r) => r.method !== 'CALL').map((r) => ({ ...r, segs: segmentsRoute(r.path) }));
  const debuts = new Set(adresses.map((r) => r.segs[0]).filter((s) => s && s !== '*'));
  if (adresses.length) for (const f of fichiers) {
    if (FICHIER_TEST.test(f.path)) continue;
    for (const appel of f.calls || []) {
      if (appel.method === 'CALL' || !String(appel.path || '').startsWith('/')) continue;
      const segs = segmentsRoute(appel.path);
      if (!debuts.has(segs[0])) continue;
      // /api/v1 seul est souvent une base à laquelle le code ajoute la suite : ce n'est pas une adresse manquante
      if (adresses.some((r) => segs.length < r.segs.length && segs.every((s, n) => s === r.segs[n] || s === '*' || r.segs[n] === '*'))) continue;
      // le début de l'adresse d'un routeur peut être posé ailleurs, hors de portée de la lecture : l'appel complet finit alors par ce qu'on a lu
      if (adresses.some((r) => r.segs.length && r.segs.length < segs.length && r.segs.every((s, n) => { const c = segs[segs.length - r.segs.length + n]; return s === c || s === '*' || c === '*'; }))) continue;
      const memeChemin = adresses.filter((r) => noterAppel(segs, r.segs));
      if (!memeChemin.length) casses.push({ from: f.path, kind: 'adresse', target: `${appel.method || 'GET'} ${appel.path}`, line: appel.line });
      else if (appel.method && !memeChemin.some((r) => r.method === appel.method || r.method === 'ANY')) casses.push({ from: f.path, kind: 'adresse', target: `${appel.method} ${appel.path}`, line: appel.line, mauvaiseMethode: true });
    }
  }
  const vus = new Set();
  return casses.filter((c) => { const k = `${c.from}|${c.kind}|${c.target}`; if (vus.has(k)) return false; vus.add(k); return true; });
}
