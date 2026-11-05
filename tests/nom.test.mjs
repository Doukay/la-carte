// Le nom de l'outil : La carte partout, et Floorplan seulement pour désigner l'œuvre de l'auteur, avec son crédit et son lien.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { appliBoutique, analyserEtConstruire, nettoyer } from './aides.mjs';

let racine, page;
before(() => {
  racine = appliBoutique();
  analyserEtConstruire(racine);
  page = fs.readFileSync(path.join(racine, 'la-carte', 'index.html'), 'utf8');
});
after(() => nettoyer(racine));

test('la carte s’écrit dans la-carte/, et plus dans floorplan/', () => {
  assert.ok(fs.existsSync(path.join(racine, 'la-carte', 'index.html')));
  assert.ok(!fs.existsSync(path.join(racine, 'floorplan')));
});

test('sur la carte, Floorplan n’apparaît plus que dans le crédit de l’auteur et l’avis de licence, qui n’est pas affiché', () => {
  const sansCredit = page.replace(/<!--[\s\S]*?Permission is hereby granted[\s\S]*?-->/, '').replaceAll('<a href="https://github.com/haydenschmitty/floorplan" target="_blank" rel="noopener">Floorplan de Hayden Smith</a>', '');
  assert.doesNotMatch(sansCredit, /floorplan/i);
});

test('le crédit de l’auteur reste, avec son lien, et la licence accompagne la page', () => {
  assert.equal(page.split('D’après <a href="https://github.com/haydenschmitty/floorplan"').length - 1, 2, 'panneau et colonne du téléphone');
  assert.match(page, /D’après <a [^>]*>Floorplan de Hayden Smith<\/a><\/div>/);
  assert.ok(!page.includes('traduction non officielle'));
  // la licence MIT demande que son texte accompagne les copies : il voyage dans la page, donc aussi dans une copie exportée
  assert.match(page, /Copyright \(c\) 2026 Hayden Smith/);
  assert.match(page, /Permission is hereby granted/);
});
