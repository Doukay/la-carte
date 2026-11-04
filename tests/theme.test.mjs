// Clair et sombre : la carte construite porte les deux thèmes, en choisit un avant que rien soit dessiné, et a un seul bouton Thème.
// Le script de démarrage est lancé ici dans un faux navigateur, pour contrôler la logique du choix sans en avoir un vrai.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { appliBoutique, analyserEtConstruire, nettoyer } from './aides.mjs';

let racine, page;
before(() => { racine = appliBoutique(); analyserEtConstruire(racine); page = fs.readFileSync(path.join(racine, 'floorplan', 'index.html'), 'utf8'); });
after(() => nettoyer(racine));

const scriptDemarrage = () => {
  const position = page.indexOf("/* Thème : s'exécute avant");
  return page.slice(page.lastIndexOf('<script>', position) + '<script>'.length, page.indexOf('</script>', position));
};

/** Lance le script de démarrage avec un faux appareil et rend ce qu’il a fait à la page. */
function demarrer({ enregistre, appareilClair = false, stockageBloque = false } = {}) {
  const attributs = {}, classes = new Set(), stockage = new Map(enregistre ? [['floorplan-theme', enregistre]] : []);
  const ecouteurs = {}, evenements = [];
  const requete = { matches: appareilClair, addEventListener: (_, f) => { requete.change = f; } };
  const fenetre = {
    document: { documentElement: { setAttribute: (k, v) => { attributs[k] = v; }, classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c) } } },
    matchMedia: () => requete,
    localStorage: { getItem: (k) => { if (stockageBloque) throw new Error('bloqué'); return stockage.get(k) ?? null; }, setItem: (k, v) => { if (stockageBloque) throw new Error('bloqué'); stockage.set(k, v); } },
    addEventListener: (t, f) => { ecouteurs[t] = f; },
    dispatchEvent: (e) => { evenements.push(e.type); },
    Event: class { constructor(type) { this.type = type; } },
    requestAnimationFrame: (f) => f(),
  };
  fenetre.window = fenetre;
  vm.runInNewContext(scriptDemarrage(), Object.assign(fenetre, { Event: fenetre.Event }));
  return { attributs, stockage, requete, evenements, theme: fenetre.floorplanTheme, classes };
}

test('la page a un jeu de couleurs sombre et un jeu clair, et le sombre reste celui par défaut', () => {
  assert.match(page, /:root \{[^}]*--bg: #0f0f0f;/);
  assert.match(page, /:root\[data-theme="light"\] \{[^}]*--bg: #f3f3f1;/);
  assert.match(page, /:root\[data-theme="light"\] \{[^}]*color-scheme: light;/);
  // chaque variable de couleur définie en sombre a aussi une valeur claire
  const variables = (bloc) => new Set([...bloc.matchAll(/(--[\w-]+):/g)].map((m) => m[1]));
  const sombre = variables(page.match(/\n:root \{([\s\S]*?)\n\}/)[1]);
  const clair = variables(page.match(/:root\[data-theme="light"\] \{([\s\S]*?)\n\}/)[1]);
  const identiquesDesDeux = new Set(['--sans', '--mono', '--r-card', '--r-panel', '--r-ctl', '--ease', '--ease-io', '--panel-w', '--pw', '--gutter', '--m-ANY', '--focus']);
  for (const v of sombre) assert.ok(clair.has(v) || identiquesDesDeux.has(v), `${v} n’a pas de valeur claire`);
});

test('la page ne peint plus avec des teintes blanches fixes qui disparaîtraient en clair', () => {
  // le bloc clair peut lui-même utiliser du blanc (blocs blancs) ; partout ailleurs les teintes passent par --ink
  const horsClair = page.replace(/:root\[data-theme="light"\] \{[\s\S]*?\n\}/, '');
  const restes = horsClair.match(/rgba\(255, 255, 255, [.\d]+\)/g) || [];
  assert.equal(restes.length, 0, `teintes blanches fixes restantes : ${restes.join(' ')}`);
});

test('le script de démarrage est dans l’en-tête, avant que la page soit dessinée', () => {
  assert.ok(page.indexOf("Thème : s'exécute avant") < page.indexOf('<style>'), 'le script vient avant les styles');
  assert.ok(page.indexOf("Thème : s'exécute avant") < page.indexOf('<body>'));
});

test('Auto suit l’appareil, en direct', () => {
  const sombre = demarrer({ appareilClair: false });
  assert.equal(sombre.attributs['data-theme'], 'dark');
  const clair = demarrer({ appareilClair: true });
  assert.equal(clair.attributs['data-theme'], 'light');
  sombre.requete.matches = true; sombre.requete.change();
  assert.equal(sombre.attributs['data-theme'], 'light');
});

test('un choix enregistré l’emporte sur l’appareil, et un nouveau choix est enregistré', () => {
  assert.equal(demarrer({ enregistre: 'dark', appareilClair: true }).attributs['data-theme'], 'dark');
  assert.equal(demarrer({ enregistre: 'light', appareilClair: false }).attributs['data-theme'], 'light');
  const b = demarrer({ appareilClair: false });
  b.theme.set('light');
  assert.equal(b.stockage.get('floorplan-theme'), 'light');
  assert.equal(b.attributs['data-theme'], 'light');
  assert.equal(b.theme.get(), 'light');
  assert.ok(b.evenements.length >= 2, 'le bouton est prévenu');
});

test('une valeur enregistrée inconnue est ignorée, et un stockage bloqué marche quand même pour cette visite', () => {
  assert.equal(demarrer({ enregistre: 'purple', appareilClair: false }).attributs['data-theme'], 'dark');
  const b = demarrer({ stockageBloque: true, appareilClair: false });
  b.theme.set('light');
  assert.equal(b.attributs['data-theme'], 'light');
  assert.equal(b.theme.get(), 'light');
});

test('le bouton Thème est dans la page construite, avec un libellé simple, une cible de 44 px et un anneau de focus visible', () => {
  assert.match(page, /\/\* ui\/05-theme\.js \*\//);
  assert.ok(page.includes('Thème : ${NOMS[c]}. Appuie pour passer à ${MOTS[SUIVANT[c]]}.'));
  assert.ok(page.includes("auto: 'Auto (suit ton appareil)'"));
  assert.match(page, /#theme-toggle \{[^}]*width: 44px; height: 44px;/);
  assert.match(page, /#theme-toggle:focus-visible \{ outline: 2px solid/);
  assert.match(page, /prefers-reduced-motion: reduce\) \{ #theme-toggle/);
});

test('en Clair, le texte sur la pastille rouge et ambre de Santé est lisible (4,5:1 ou mieux)', () => {
  const clair = page.match(/:root\[data-theme="light"\] \{([\s\S]*?)\n\}/)[1];
  const valeur = (nom) => clair.match(new RegExp(`${nom}: (#[0-9a-f]{3,6})`, 'i'))[1].replace(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i, '#$1$1$2$2$3$3');
  const luminance = (hex) => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const contraste = (a, b) => { const [haut, bas] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (haut + 0.05) / (bas + 0.05); };
  for (const pastille of ['--sev-high', '--sev-medium']) assert.ok(contraste(valeur('--on-sev-text'), valeur(pastille)) >= 4.5, `${pastille} : la pastille est trop pâle`);
  assert.ok(contraste(valeur('--text-3'), valeur('--raise')) >= 4.5, 'le texte de la zone de recherche est trop pâle');
});

test("la zone de recherche cède la place du bouton Thème pour que le nom du projet et les boutons tiennent comme avant", () => {
  assert.match(page, /@media \(min-width: 701px\) \{ #search-btn \{ width: min\(460px, max\(calc\(36vw - 48px\), 250px\)\); \} \}/);
});
