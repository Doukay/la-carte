// Gestes tactiles : sur la carte construite, un doigt la fait glisser, deux doigts pincent et la déplacent, et aucun geste ne la laisse bloquée ni
// ne la recadre. Ce sont des contrôles sur la page construite (les règles et le code sont là), pas sur un vrai écran.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { appliBoutique, analyserEtConstruire, nettoyer } from './aides.mjs';

let racine, page;
before(() => { racine = appliBoutique(); analyserEtConstruire(racine); page = fs.readFileSync(path.join(racine, 'floorplan', 'index.html'), 'utf8'); });
after(() => nettoyer(racine));

test('la carte prend le toucher elle-même, et la page ne rebondit pas dessous (écrans tactiles seulement)', () => {
  assert.match(page, /#svg \{ touch-action: none; \}/); // un doigt peut faire glisser la carte, et un pincement ne zoome pas toute la page
  assert.match(page, /@media \(pointer: coarse\) \{ html, body \{ overscroll-behavior: none; \} \}/);
});

test('deux doigts pincent la carte (zoom autour du point entre eux) et la déplacent, avec les mêmes limites que la molette', () => {
  assert.match(page, /const k = borner\(t0\.k \* maintenant\.d \/ pincement\.d, 0\.08, 2\.5\)/);
  assert.match(page, /const k = borner\(etatVue\.t\.k \* f, 0\.08, 2\.5\)/); // les limites de la molette
  assert.match(page, /if \(doigts\.size === 2\) \{ if \(glisse\?\.moved\) avalerClic = true; glisse = null;/); // le deuxième doigt met fin au glissement à un doigt
});

test('un glissement ne suit que le doigt qui l’a commencé, se termine quand le navigateur annule le toucher, et la barre d’adresse d’un téléphone ne recadre pas la carte', () => {
  assert.match(page, /if \(!glisse \|\| ev\.pointerId !== glisse\.id\) return;/);
  assert.match(page, /window\.addEventListener\('pointercancel', finGlisse\)/);
  assert.match(page, /window\.addEventListener\('pointercancel', leverDoigt\)/);
  assert.match(page, /if \(matchMedia\('\(pointer: coarse\)'\)\.matches && \(seulementHauteur \|\| glisse \|\| pincement\)\) return;\n  ajusterVue\(false\);/);
});

test('un troisième doigt est ignoré, et le clic qui termine un glissement est avalé une fois puis effacé au toucher suivant, pour que le toucher d’après marche encore', () => {
  assert.match(page, /avalerClic = false; vp\.classList\.remove\('anim'\)/);
  assert.match(page, /if \(ev\.pointerType === 'touch'\) \{\n    if \(doigts\.size >= 2\) return; \/\/ un troisième doigt est ignoré/);
});

test('un toucher ne laisse pas d’infobulle de survol sur les détails, et une infobulle reste à l’écran sur un écran étroit', () => {
  assert.match(page, /\(ev\) => \{ toucheEnCours = ev\.pointerType === 'touch'; \}/);
  assert.match(page, /if \(!html \|\| toucheEnCours \|\| glisse\?\.moved/);
  assert.match(page, /infobulle\.style\.left = Math\.max\(8, x\) \+ 'px'; infobulle\.style\.top = Math\.max\(8, y\) \+ 'px';/);
});

test('rien de tout ça ne change la souris : la glissade n’est annulée que pour un doigt, et le glissement à la souris garde sa protection d’origine contre le clic unique', () => {
  assert.match(page, /if \(ev\.pointerType === 'touch'\) avalerClic = true; else svg\.addEventListener\('click', \(e\) => e\.stopPropagation\(\), \{ capture: true, once: true \}\)/);
  assert.match(page, /svg\.addEventListener\('click', \(\) => choisir\(null\)\);/);
});
