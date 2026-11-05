// La commande que ouvrir.mjs affiche pour arrêter le serveur doit marcher telle quelle, copiée depuis le dossier du projet.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { appliBoutique, executer, nettoyer } from './aides.mjs';

const OUVRIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'skills', 'la-carte', 'scripts', 'ouvrir.mjs');

test('la commande d’arrêt affichée par ouvrir.mjs arrête vraiment le serveur', async () => {
  const racine = appliBoutique();
  try {
    executer('analyser.mjs', racine);
    executer('construire.mjs', racine, '--no-claude-md');
    const port = String(20000 + Math.floor(Math.random() * 20000));
    const env = { ...process.env, LA_CARTE_CLAUDE: path.join(racine, 'no-such-cli'), LA_CARTE_NO_PROMPTS: '1' };
    const sortie = execFileSync(process.execPath, [OUVRIR, '--no-open', '--port', port], { cwd: racine, env, encoding: 'utf8', timeout: 30000 });

    const commande = /Pour l’arrêter maintenant : node (\S+) --stop/.exec(sortie);
    assert.ok(commande, sortie);
    assert.ok(fs.existsSync(path.join(racine, commande[1])), `${commande[1]} n’existe pas`);

    execFileSync(process.execPath, [commande[1], '--stop'], { cwd: racine, env, encoding: 'utf8', timeout: 15000 });
    const arrete = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(2000) }).then(() => false, () => true);
    assert.ok(arrete, 'le serveur répond encore après la commande');
  } finally {
    try { execFileSync(process.execPath, [path.join(racine, 'la-carte', '.cache', 'serveur.mjs'), '--stop'], { cwd: racine, stdio: 'ignore', timeout: 15000 }); } catch {}
    nettoyer(racine);
  }
});
