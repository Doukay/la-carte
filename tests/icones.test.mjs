// Les icônes choisies pour le projet : chaque nom proposé est dessiné, et la carte reçoit celles que Claude a choisies.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { lib, appliBoutique, executer, lireGraphe, lireJson, ecrireJson, nettoyer, DOSSIER_SKILL } from './aides.mjs';

const { ICONES } = await lib('commun.mjs');
const { assemblerPage } = await lib('page.mjs');
const page = assemblerPage(DOSSIER_SKILL);

test('chaque icône proposée est dessinée dans la page et citée dans les consignes', () => {
  assert.ok(ICONES.length >= 40);
  const schema = fs.readFileSync(path.join(DOSSIER_SKILL, 'references', 'schema.md'), 'utf8');
  for (const nom of ICONES) {
    assert.ok(page.includes(`'${nom}':`), `${nom} n’est pas dessinée`);
    assert.ok(schema.includes(`\`${nom}\``), `${nom} n’est pas dans schema.md`);
  }
});

test('une partie garde l’icône choisie, une icône inconnue est écartée avec un avertissement', () => {
  const racine = appliBoutique();
  try {
    executer('analyser.mjs', racine);
    const fichier = path.join(racine, 'la-carte', 'sources', 'architecture.json');
    const arch = lireJson(fichier);
    arch.nodes[0].icon = 'panier';
    arch.nodes[1].icon = 'n-existe-pas';
    ecrireJson(fichier, arch);
    const sortie = executer('construire.mjs', racine);
    assert.match(sortie, /icône inconnue : n-existe-pas/);
    const noeuds = lireGraphe(racine).nodes;
    assert.equal(noeuds.find((n) => n.id === arch.nodes[0].id).icon, 'panier');
    assert.equal(noeuds.find((n) => n.id === arch.nodes[1].id).icon, undefined);
  } finally { nettoyer(racine); }
});

test('la page utilise l’icône choisie pour un bloc, et celle de son type sinon', () => {
  assert.match(page, /i\.type === 'node' \? \(P\[i\.n\.icon\] \? i\.n\.icon : i\.kind\)/);
  assert.doesNotMatch(page, /\.brand \.mark/); // le logo de l'auteur est retiré, y compris dans la copie exportée
});
