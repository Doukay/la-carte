// Hygiène de publication : les manifestes du plugin, le journal des changements et les sommes de contrôle sont d’accord sur la version,
// pour qu’une publication ne parte jamais à moitié mise à jour.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DEPOT, DOSSIER_SKILL, lireJson } from './aides.mjs';

const plugin = lireJson(path.join(DEPOT, '.claude-plugin', 'plugin.json'));
const placeDeMarche = lireJson(path.join(DEPOT, '.claude-plugin', 'marketplace.json'));
const lire = (p) => fs.readFileSync(path.join(DEPOT, p), 'utf8');

test('la version du plugin est une version sémantique', () => {
  assert.match(plugin.version, /^\d+\.\d+\.\d+-fr\.\d+$/);
});

test('la place de marché liste ce plugin, depuis ce dépôt', () => {
  const entree = placeDeMarche.plugins.find((p) => p.name === plugin.name);
  assert.ok(entree, `marketplace.json liste ${plugin.name}`);
  assert.equal(entree.source, './');
});

test('le plugin Codex correspond au plugin Claude Code et pointe vers le même skill', () => {
  const codex = lireJson(path.join(DEPOT, '.codex-plugin', 'plugin.json'));
  assert.equal(codex.name, plugin.name);
  assert.equal(codex.version, plugin.version, 'version de .codex-plugin/plugin.json');
  assert.equal(codex.skills, './skills/');
  assert.ok(fs.existsSync(path.join(DEPOT, 'skills', 'la-carte', 'SKILL.md')));
});

test('la place de marché Codex liste ce plugin, depuis ce dépôt', () => {
  const placeDeMarcheCodex = lireJson(path.join(DEPOT, '.agents', 'plugins', 'marketplace.json'));
  const entree = placeDeMarcheCodex.plugins.find((p) => p.name === plugin.name);
  assert.ok(entree, `.agents/plugins/marketplace.json liste ${plugin.name}`);
  assert.deepEqual(entree.source, { source: 'local', path: './' });
});

// Le badge de version du README est retiré exprès (il n’y a plus rien à garder à jour de ce côté) : on vérifie qu’il reste absent.
test('le README n’a pas de badge de version', () => {
  assert.doesNotMatch(lire('README.md'), /badge\/version-/);
});

// Sans le badge, la version doit rester la même dans plugin.json, dans la dernière entrée du CHANGELOG et dans l’en-tête de EMPREINTES.txt.
test('la version est la même dans plugin.json, le journal des changements et EMPREINTES.txt', () => {
  const journal = /^## (\d+\.\d+\.\d+-fr\.\d+) \(\d{4}-\d{2}-\d{2}\)$/m.exec(lire('CHANGELOG.md'));
  const sommes = /^# la carte (\d+\.\d+\.\d+-fr\.\d+):/.exec(lire('EMPREINTES.txt'));
  assert.ok(journal, 'le journal des changements a une entrée de version datée');
  assert.ok(sommes, 'EMPREINTES.txt commence par une ligne de version');
  assert.deepEqual([journal[1], sommes[1]], [plugin.version, plugin.version], 'version du journal, version de EMPREINTES.txt');
});

test('le journal des changements a une entrée pour cette version', () => {
  assert.match(lire('CHANGELOG.md'), new RegExp(`^## ${plugin.version.replaceAll('.', '\\.')} \\(\\d{4}-\\d{2}-\\d{2}\\)$`, 'm'));
});

test('le skill a un nom et une description, et chaque fichier vers lequel il pointe existe', () => {
  const skill = fs.readFileSync(path.join(DOSSIER_SKILL, 'SKILL.md'), 'utf8');
  assert.match(skill, /^---\nname: la-carte\ndescription: .{50,}/);
  for (const [, ref] of skill.matchAll(/\]\((references\/[\w.-]+\.md)/g)) assert.ok(fs.existsSync(path.join(DOSSIER_SKILL, ref)), ref);
  for (const [, script] of skill.matchAll(/scripts\/(\w+\.mjs)/g)) assert.ok(fs.existsSync(path.join(DOSSIER_SKILL, 'scripts', script)), script);
});

test('EMPREINTES.txt est pour cette version, pour que chaque publication embarque ses empreintes', () => {
  assert.match(lire('EMPREINTES.txt'), new RegExp(`^# la carte ${plugin.version.replaceAll('.', '\\.')}:`), 'lance node outils/empreintes.mjs en changeant de version');
});
