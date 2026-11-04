// Contrôle des secrets de Santé : il trouve les clés et mots de passe écrits dans le code, note seulement où ils sont
// et un indice masqué, et ne garde jamais la valeur elle-même. Les valeurs de test qui ressemblent à des secrets sont assemblées à
// l’exécution pour qu’aucune ne soit jamais enregistrée dans ce dépôt.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lib, FAUX_MOT_DE_PASSE } from './aides.mjs';

const { trouverProblemes } = await lib('sante.mjs');
const secrets = (source, path = 'app/config.py', lang = 'python') => trouverProblemes(source, { path, category: 'code', lang }).filter((x) => x.k === 'secret');
const FAUX_JETON_GITHUB = 'ghp_' + 'aBcD' + '1e2F3g4H5i6J7k8L9m0N1o2P3q4R5s6T7u8V';

test('un mot de passe écrit en dur est trouvé, avec sa ligne, et masqué', () => {
  const [s, ...reste] = secrets(`PORT = 3000\nDB_PASSWORD = "${FAUX_MOT_DE_PASSE}"\n`);
  assert.equal(reste.length, 0);
  assert.equal(s.line, 2);
  assert.equal(s.name, 'DB_PASSWORD');
  assert.equal(s.sev, 'high');
  assert.equal(s.hint, `${FAUX_MOT_DE_PASSE.length} caractères`, 'l’indice d’un mot de passe donne seulement sa longueur');
});

test('un mot de passe dans une adresse n’arrive jamais dans la liste des sites extérieurs', async () => {
  const { extraire } = await lib('extraction.mjs');
  const { hosts } = extraire(`fetch("https://bob:${FAUX_MOT_DE_PASSE}@api.stripe.com/x")`, 'javascript', 'a.js');
  assert.deepEqual(hosts.map((h) => h.host), ['api.stripe.com']);
});

test('un format de clé connu porte le nom de son service et ne montre que sa longueur', () => {
  const [s] = secrets(`token = "${FAUX_JETON_GITHUB}"`);
  assert.equal(s.svc, 'GitHub');
  assert.equal(s.hint, `${FAUX_JETON_GITHUB.length} caractères`);
});

test('la valeur du secret n’apparaît jamais dans ce que Santé enregistre', () => {
  for (const trouves of [secrets(`DB_PASSWORD = "${FAUX_MOT_DE_PASSE}"`), secrets(`token = "${FAUX_JETON_GITHUB}"`)]) {
    const texte = JSON.stringify(trouves);
    assert.ok(!texte.includes(FAUX_MOT_DE_PASSE) && !texte.includes(FAUX_JETON_GITHUB.slice(4)), texte);
  }
});

test('les valeurs à remplacer, les valeurs lues dans l’environnement et les réglages publics ne sont pas signalés', () => {
  assert.deepEqual(secrets('DB_PASSWORD = "changeme"\nAPI_KEY = "your-api-key-here"\nSECRET = "xxx"\n'), []);
  assert.deepEqual(secrets('DB_PASSWORD = os.environ["DB_PASSWORD"]\nAPI_KEY = os.getenv("API_KEY")\n'), []);
  assert.deepEqual(secrets('API_URL = "https://api.example.com/v1/orders"\n'), []);
  // le config.toml de Supabase lit les secrets dans l’environnement avec env(NOM)
  assert.deepEqual(secrets('s3_secret_key = "env(S3_SECRET_KEY)"\n', 'supabase/config.toml', 'toml'), []);
});

test('les jetons publics par conception ne sont pas signalés (#23)', () => {
  const hex = [...Array(32)].map((_, i) => '01234567890abcdef'[(i * 7 + 3) % 16]).join('');
  // le jeton de la balise de Cloudflare Web Analytics doit être dans la page pour que les statistiques marchent
  const balise = `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "${hex}"}'></script>`;
  assert.deepEqual(secrets(balise, 'site/index.html', 'html'), []);
  // la même valeur sous un nom qui sonne comme un secret, ailleurs, est quand même signalée
  assert.equal(secrets(`ACCESS_TOKEN = "${hex}"`).length, 1);
  // un jeton public de Mapbox
  assert.deepEqual(secrets(`mapboxToken = "pk.${'eyJ1IjoiZXhhbXBsZSIsImEiOiJ'}${hex}.${hex.slice(0, 22)}"`, 'web/map.ts', 'typescript'), []);
});
