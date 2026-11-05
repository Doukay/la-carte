// Contrôle de santé : des avertissements en langage simple sur le code (secrets, adresses du serveur que n’importe qui peut appeler,
// les erreurs habituelles avec Supabase / Firebase / Stripe / CORS, fichiers inutilisés, fichiers trop gros), écrits pour
// des personnes qui ont créé une appli avec une IA et n’en connaissent pas l’intérieur. C’est un contrôle, pas un audit. Mieux vaut la précision
// que l’exhaustivité : une fausse alerte coûte plus cher à ce public qu’un oubli.
//
// trouverProblemes(source, f)  — appelée par analyser.mjs pour chaque fichier de code, de config ou de docs, avec son contenu.
//                           Renvoie les constats bruts de ce fichier, rangés dans analyse.json files[].problemes.
//                           Les constats ne contiennent jamais la valeur d’un secret, seulement sa ligne, son type et un indice masqué.
// construireSante(ctx)   — appelée par construire.mjs avec { graph, scan, arch, root } une fois le graphe construit.
//                           Renvoie { summary: { high, medium, low }, problemes: [...] }, rangé dans graph.sante.

import fs from 'node:fs';
import chemin from 'node:path';
import { git, compilerMotif } from './commun.mjs';

const indexLignes = (source) => {
  const debuts = [0];
  for (let i = 0; i < source.length; i++) if (source.charCodeAt(i) === 10) debuts.push(i + 1);
  return (decalage) => {
    let lo = 0, hi = debuts.length - 1;
    while (lo < hi) { const milieu = (lo + hi + 1) >> 1; if (debuts[milieu] <= decalage) lo = milieu; else hi = milieu - 1; }
    return lo + 1;
  };
};

/** Entropie de Shannon en bits par caractère : les clés aléatoires font environ 4 ou plus, les mots et les valeurs bidon environ 2 à 3. */
function entropie(s) {
  const compteurs = new Map();
  for (const c of s) compteurs.set(c, (compteurs.get(c) || 0) + 1);
  let e = 0;
  for (const n of compteurs.values()) { const p = n / s.length; e -= p * Math.log2(p); }
  return e;
}

// Fichiers où les clés sont le plus souvent fausses : tests, jeux de données, exemples, docs.
const FICHIER_TEST = /(^|\/)(tests?|__tests__|__mocks__|spec|specs|e2e|fixtures?|testdata|mocks?)\/|\.(test|spec|stories)\.[a-z]+$|(^|\/)test_[^/]*\.py$|_test\.(py|go)$|(^|\/)conftest\.py$/i;
const FICHIER_EXEMPLE = /(^|\/)(examples?|samples?|docs?|demo)\/|\.(example|sample|template|dist|tmpl)(\.|$)|(^|\/)[^/]*example[^/]*$/i;
const VALEUR_BIDON = /your|xxxx|example|changeme|change[-_]?me|placeholder|replace|dummy|fake|sample|redacted|insert|<[^>]*>|\$\{|\{\{|%\(|\*\*\*|0{8,}|1234567|abcdef|_here\b|-here\b/i;

// ---------- 1. secrets ----------

// Formats de clés connus. `sev` vaut high par défaut ; les formats `live` sont signalés même dans les fichiers de test.
const FORMATS = [
  { re: /\bAKIA[0-9A-Z]{16}\b/g, what: 'une clé d’accès Amazon Web Services (AWS)', svc: 'AWS', live: true },
  { re: /\b(?:sk|rk)_live_[0-9a-zA-Z]{20,}/g, what: 'une clé secrète Stripe de production', svc: 'Stripe', live: true },
  { re: /\b(?:sk|rk)_test_[0-9a-zA-Z]{20,}/g, what: 'une clé de test Stripe', svc: 'Stripe', sev: 'medium' },
  { re: /\bwhsec_[A-Za-z0-9]{24,}/g, what: 'un secret de signature de webhook Stripe', svc: 'Stripe' },
  { re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g, what: 'un jeton d’accès GitHub', svc: 'GitHub', live: true },
  { re: /\bgithub_pat_[A-Za-z0-9_]{50,}/g, what: 'un jeton d’accès GitHub', svc: 'GitHub', live: true },
  { re: /\bglpat-[A-Za-z0-9_-]{20,}/g, what: 'un jeton d’accès GitLab', svc: 'GitLab', live: true },
  { re: /\bxox[abposr]-[A-Za-z0-9-]{10,}/g, what: 'un jeton Slack', svc: 'Slack', live: true },
  { re: /https:\/\/hooks\.slack\.com\/services\/T[A-Z0-9]+\/B[A-Z0-9]+\/[A-Za-z0-9]{20,}/g, what: 'une adresse de webhook Slack (toute personne qui la possède peut écrire dans ton Slack)', svc: 'Slack', sev: 'medium' },
  { re: /\bAIza[0-9A-Za-z_\-]{35}\b/g, what: 'une clé d’API Google', svc: 'Google Cloud', sev: 'medium', skipIf: /firebase|authDomain|messagingSenderId/i },
  { re: /\bGOCSPX-[A-Za-z0-9_\-]{20,}/g, what: 'un secret client de connexion Google', svc: 'Google Cloud' },
  { re: /\bsk-ant-[a-z]+\d*-[A-Za-z0-9_\-]{40,}/g, what: 'une clé d’API Anthropic (Claude)', svc: 'Anthropic', live: true },
  { re: /\bsk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_\-]{16,}T3BlbkFJ[A-Za-z0-9_\-]{16,}/g, what: 'une clé d’API OpenAI', svc: 'OpenAI', live: true },
  { re: /\bsk-(?:proj|svcacct|admin)-[A-Za-z0-9_\-]{40,}/g, what: 'une clé d’API OpenAI', svc: 'OpenAI', live: true },
  // (une clé protégée par une phrase secrète, ENCRYPTED PRIVATE KEY ou Proc-Type: 4,ENCRYPTED, est laissée de côté : voir cleChiffreeA)
  { re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY(?: BLOCK)?-----/g, what: 'une clé privée', svc: null, whole: true },
  { re: /\bSG\.[A-Za-z0-9_\-]{22}\.[A-Za-z0-9_\-]{43}\b/g, what: 'une clé d’API d’envoi de mails SendGrid', svc: 'SendGrid', live: true },
  { re: /\bsq0csp-[0-9A-Za-z_\-]{40,}/g, what: 'un secret d’application Square', svc: 'Square', live: true },
  { re: /\bsq0atp-[0-9A-Za-z_\-]{20,}/g, what: 'un jeton d’accès Square', svc: 'Square', live: true },
  { re: /\bEAAA[A-Za-z0-9_\-]{60,}/g, what: 'un jeton d’accès Square', svc: 'Square', live: true },
  { re: /\bshp(?:at|ss|ca|pa)_[a-fA-F0-9]{32}\b/g, what: 'un jeton d’accès Shopify', svc: 'Shopify', live: true },
  { re: /\bhf_[A-Za-z0-9]{30,}\b/g, what: 'un jeton Hugging Face', svc: 'Hugging Face', live: true },
  { re: /\bnpm_[A-Za-z0-9]{36}\b/g, what: 'un jeton de publication npm', svc: 'npm', live: true },
  { re: /\bsbp_[a-f0-9]{40}\b/g, what: 'un jeton de compte Supabase', svc: 'Supabase', live: true },
  { re: /\bsb_secret_[A-Za-z0-9_\-]{20,}/g, what: 'une clé secrète Supabase', svc: 'Supabase', live: true },
  { re: /\b\d{8,10}:AA[0-9A-Za-z_\-]{33}\b/g, what: 'un jeton de bot Telegram', svc: 'Telegram', live: true },
  { re: /\bdop_v1_[a-f0-9]{64}\b/g, what: 'un jeton DigitalOcean', svc: 'DigitalOcean', live: true },
  { re: /\bpat[A-Za-z0-9]{14}\.[a-f0-9]{64}\b/g, what: 'un jeton Airtable', svc: 'Airtable', live: true },
];
const JWT = /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{20,}/g;
const URL_BDD = /\b(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|rediss?|amqps?)(?:\+\w+)?:\/\/([^:\s\/'"@]+):([^@\s'"]+)@([^\/\s'":?,]+)/g;
const HOTE_LOCAL = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|db|postgres|mysql|redis|mongo|database|host\.docker\.internal)$/i;

// Noms qui contiennent des secrets (après passage de camelCase à snake_case). Les clés publiques par conception sont exclues plus bas.
const NOM_SECRET = /(?:^|[_.-])(api_?key|apikey|secret(?:_?key)?|client_?secret|app_?secret|token|access_?token|refresh_?token|auth_?token|authtoken|bearer_?token|passw(?:or)?d|passwd|pwd|private_?key|secret_?access_?key|signing_?(?:key|secret)|signature_?key|webhook_?secret|encryption_?key|auth(?:orization)?_?key|master_?key|credentials?)$/i;
const NOM_PUBLIC = /(^|_)(public|publishable|anon|site_?key|example|sample|test|dummy|fake|mock|placeholder|default|field|label|header|name|type|url|uri|endpoint|path|file|env|var|prefix|length|len|min|max|regex|pattern|format|expires?|ttl)(_|$)|^(next_public|vite|react_app|expo_public|nuxt_public|gatsby)_/i;
const LECTURE_ENV = /os\.environ|os\.getenv|getenv\(|process\.env|import\.meta\.env|ENV\[|ENV\.fetch|System\.getenv|Deno\.env|secrets\.|config\(\s*['"]|env\(\s*['"]|\$\{\{/;
const NOM_MOT_DE_PASSE = /pass|pwd/i;
const LANGAGES_CONFIG = new Set(['yaml', 'yml', 'ini', 'cfg', 'conf', 'properties', 'env', 'toml']);

const versSnake = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
const typeSelonNom = (nom) => {
  const n = versSnake(nom);
  if (/pass|pwd/.test(n)) return 'un mot de passe';
  if (/private_?key/.test(n)) return 'une clé privée';
  if (/token/.test(n)) return 'un jeton d’accès';
  if (/api_?key|apikey/.test(n)) return 'une clé d’API';
  if (/credential/.test(n)) return 'des identifiants de connexion';
  return 'une clé secrète';
};
const masque = (v) => `${v.length} caractères`;

// Un mot de passe haché n’est pas le mot de passe : bcrypt / argon2 / scrypt / crypt(3) ($2b$…, $argon2id$…,
// $6$…), pbkdf2_sha256$… de Django, {SSHA}… de LDAP, et tout ce qui est rangé sous un nom qui dit que c’est un hachage.
const VALEUR_HACHEE = /^\$(2[abxy]?|argon2(id|i|d)|scrypt|pbkdf2[\w-]*|[156]|y|7|sha\d*|md5)\$|^(pbkdf2_sha\d+|bcrypt(_sha256)?|argon2|scrypt|sha1|md5)\$|^\{(S?SHA\d*|SMD5|CRYPT|PBKDF2[\w-]*)\}/i;
// (HASH_SECRET, PASSWORD_HASH_KEY et HASH_SALT sont le secret qui sert à fabriquer le hachage : ils ne comptent pas.)
const NOM_HACHE = /(^|_)(hash|hashed|hashes|digest|bcrypt|argon2?|scrypt|pbkdf2)(_(?!.*(secret|key|salt|pepper|token))|$)/i;
// Les valeurs chiffrées peuvent être commitées sans risque (c’est leur but) : encrypted:… de dotenvx, ENC[AES256_GCM,…] de sops,
// Ansible Vault, texte chiffré AWS KMS, transit HashiCorp Vault (vault:v1:…), blocs age et PGP, le format d’OpenSSL
// "Salted__" (U2FsdGVkX1…) et le Fernet de Python (gAAAAA…).
const VALEUR_CHIFFREE = /^encrypted:[A-Za-z0-9+/=_-]{20,}|^ENC\[[A-Z0-9_]+,data:|^\$ANSIBLE_VAULT;|^!vault\b|^AQICAH[A-Za-z0-9+/=]{40,}$|^vault:v\d+:|^-----BEGIN (AGE ENCRYPTED FILE|PGP MESSAGE)-----|^U2FsdGVkX1[A-Za-z0-9+/=]{10,}|^gAAAAA[A-Za-z0-9_=-]{40,}/;
/** Une valeur qui est un mot de passe haché ou un texte chiffré, et non le secret lui-même. */
export const valeurProtegee = (v, nom = '') => VALEUR_CHIFFREE.test(v) || VALEUR_HACHEE.test(v) || NOM_HACHE.test(versSnake(nom));

function valeurSembleReelle(v, nom) {
  if (/\s/.test(v) || VALEUR_BIDON.test(v)) return false;
  if (valeurProtegee(v, nom)) return false;
  if (/^(none|null|nil|undefined|true|false|string|number|text|required|optional|bearer|basic|secret|token|password|test|dev|development|local|admin)$/i.test(v)) return false;
  if (/^[A-Z][A-Z0-9_]+$/.test(v)) return false;                 // le NOM d’une variable d’environnement
  if (/^env\([A-Za-z_][\w]*\)$/.test(v)) return false;           // config.toml de Supabase qui en lit une : "env(S3_SECRET_KEY)"
  if (/^[a-z_]+(\.[a-z_]+)+$/i.test(v)) return false;            // identifiant à points / chemin de clé
  if (/^(\.{0,2}\/|~\/|https?:\/\/|[a-z]:\\)/i.test(v)) return false; // chemins et URLs
  if (/\.(json|pem|key|txt|ya?ml|env|crt|p12)$/i.test(v)) return false; // un nom de fichier, pas la clé
  if (/^x-[\w-]+$/i.test(v) || /^(application|text)\//.test(v)) return false;
  if (/^(.)\1+$/.test(v)) return false;
  if (/^(pass(word)?|secret|admin|test|user|changeit|letmein|qwerty|demo|guest|root|welcome)[\d!@#$._-]*$/i.test(v)) return false;
  if (NOM_MOT_DE_PASSE.test(nom)) return v.length >= 6 && !/^[a-z]+$/.test(v);
  return v.length >= 16 && entropie(v) >= 3.2 && /\d/.test(v) && /[a-zA-Z]/.test(v);
}

// Jetons publics par conception, parce que le navigateur doit les envoyer : la balise de Cloudflare Web Analytics
// (data-cf-beacon='{"token":"…"}') et les jetons publics de Mapbox (pk.…)
const LIGNE_JETON_PUBLIC = /data-cf-beacon|cloudflareinsights\.com/i;
const VALEUR_JETON_PUBLIC = /^pk\.[\w-]{20,}\.[\w-]{10,}$/;
// Un jeton de site donné au script d’un traceur du navigateur : le script le lit dans la page, donc chaque visiteur l’a.
// Les noms qui en disent plus que "token" (access, auth, secret…) et les vrais formats de clés ne sont jamais excusés ainsi.
const BALISE_SCRIPT = /<script\b|createElement\(\s*['"]script['"]\s*\)/i;
const FICHIER_SUIVI = /analytics|tracker|tracking|beacon|pixel|telemetry/i;
const PAS_JETON_SITE = /secret|passw|private|access|refresh|auth|bearer|api_?key|signing/i;
const echapperRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function jetonTraceur(nom, valeur, source, fichier) {
  const n = versSnake(nom);
  if (!/token$/.test(n) || PAS_JETON_SITE.test(n) || !BALISE_SCRIPT.test(source)) return false;
  if (FICHIER_SUIVI.test(fichier.split('/').pop())) return true;
  const id = echapperRegex(nom), valEchappee = echapperRegex(valeur);
  return new RegExp('<script\\b[^>]*\\bdata-[\\w-]+\\s*=\\s*(?:\\{\\s*' + id + '\\s*\\}|["\'`]' + valEchappee + ')', 'i').test(source)
    || new RegExp('dataset\\.\\w+\\s*=\\s*' + id + '\\b|setAttribute\\(\\s*[\'"]data-[\\w-]+[\'"]\\s*,\\s*' + id + '\\b').test(source);
}

/** Numéros de ligne (à partir de 1) situés dans des docstrings ou des commentaires de bloc (les exemples qui s’y trouvent ne sont pas de la vraie config). */
function lignesDoc(source, langage) {
  const ensemble = new Set();
  if (!['python', 'typescript', 'javascript', 'java', 'kotlin', 'go', 'csharp', 'php', 'rust', 'swift'].includes(langage)) return ensemble;
  const regex = langage === 'python' ? /("""|''')[\s\S]*?\1/g : /\/\*[\s\S]*?\*\//g;
  const ligneDe = indexLignes(source);
  for (const m of source.matchAll(regex)) { const a = ligneDe(m.index), b = ligneDe(m.index + m[0].length); for (let l = a; l <= b; l++) ensemble.add(l); }
  return ensemble;
}

/** Un bloc de clé privée PEM commençant à `indice` et protégé par une phrase secrète (anciens en-têtes OpenSSL). */
const cleChiffreeA = (source, indice) => /^[^\n]*\n(?:[^\n]*\n)?\s*Proc-Type:\s*4,\s*ENCRYPTED/.test(source.slice(indice, indice + 300));
/** Le début d’un fichier de clé contient une clé privée non protégée par une phrase secrète. */
const cleEnClairDans = (debut) => [...debut.matchAll(/-----BEGIN ([A-Z ]*)PRIVATE KEY(?: BLOCK)?-----/g)].some((m) => !/ENCRYPTED/.test(m[1]) && !cleChiffreeA(debut, m.index));

function trouverSecrets(source, f, sortie) {
  const ligneDe = indexLignes(source);
  const estTest = FICHIER_TEST.test(f.path) || FICHIER_EXEMPLE.test(f.path);
  const lignesVues = new Set();
  const ajouter = (ligne, enregistrement) => { if (lignesVues.has(ligne)) return; lignesVues.add(ligne); sortie.push({ k: 'secret', line: ligne, ...enregistrement }); };

  for (const fm of FORMATS) {
    if (fm.skipIf?.test(source)) continue;
    for (const m of source.matchAll(fm.re)) {
      const v = m[0];
      if (estTest && (!fm.live || fm.whole)) continue;
      if (!fm.whole && (/EXAMPLE|xxxx|XXXX|0{10,}/.test(v) || entropie(v) < 3)) continue;
      if (fm.whole && cleChiffreeA(source, m.index)) continue;
      ajouter(ligneDe(m.index), { what: fm.what, svc: fm.svc, sev: fm.sev || 'high', hint: fm.whole ? 'bloc de clé privée' : masque(v) });
    }
  }
  if (!estTest) {
    for (const m of source.matchAll(JWT)) {
      let charge = null;
      try { charge = JSON.parse(Buffer.from(m[0].split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')); } catch { continue; }
      if (charge?.role !== 'service_role') continue; // les clés "anon" sont publiques par conception
      ajouter(ligneDe(m.index), { what: 'une clé Supabase service-role (accès total à ta base de données, en ignorant toutes les règles de sécurité)', svc: 'Supabase', sev: 'high', hint: masque(m[0]) });
    }
    for (const m of source.matchAll(URL_BDD)) {
      const [, utilisateur, mdp, hote] = m;
      if (HOTE_LOCAL.test(hote) || VALEUR_BIDON.test(mdp) || /^[:$%{<]/.test(mdp) || mdp.length < 4 || /^(password|pass|postgres|root|secret|admin|user)$/i.test(mdp)) continue;
      ajouter(ligneDe(m.index), { what: 'un mot de passe de base de données dans une adresse de connexion', svc: 'ta base de données', sev: 'high', hint: masque(mdp) });
    }
  }
  if (estTest || f.category === 'docs') return;

  // Affectations : api_key = "…", "password": "…", PASSWORD=… (les fichiers de config peuvent laisser les valeurs sans guillemets).
  const lignes = source.split('\n');
  const dansDoc = lignesDoc(source, f.lang);
  // Les conteneurs de base de données de la CI / docker-compose reçoivent des mots de passe jetables
  const bddJetable = /(^|\/)\.github\/|(^|\/)(docker-)?compose[\w.-]*\.ya?ml$/i.test(f.path);
  const entreGuillemets = /(["']?)([A-Za-z_][\w.-]*)\1\s*(?::=|=>|=|:)\s*(?:[rbuRBU]{1,2})?(["'`])([^"'`\n]{6,200})\3/g;
  const sansGuillemets = /^\s*(?:export\s+)?([A-Za-z_][\w.-]*)\s*[:=]\s*([^\s#'"]{6,200})\s*(?:#.*)?$/;
  lignes.forEach((texte, i) => {
    if (texte.length > 400 || LECTURE_ENV.test(texte) || LIGNE_JETON_PUBLIC.test(texte) || dansDoc.has(i + 1) || /^\s*(#|\/\/|\*|\/\*|<!--)/.test(texte)) return;
    const paires = [...texte.matchAll(entreGuillemets)].map((m) => [m[2], m[4]]);
    if (!paires.length && (f.category === 'config' && LANGAGES_CONFIG.has(f.lang))) { const u = sansGuillemets.exec(texte); if (u) paires.push([u[1], u[2]]); }
    for (const [nom, valeur] of paires) {
      const n = versSnake(nom.split('.').pop());
      if (!NOM_SECRET.test(n) || NOM_PUBLIC.test(n) || VALEUR_JETON_PUBLIC.test(valeur) || !valeurSembleReelle(valeur, n)) continue;
      if (jetonTraceur(nom.split('.').pop(), valeur, source, f.path)) continue;
      if (bddJetable && /^(postgres|mysql|mariadb|mongo(_initdb_root)?|redis|pg|rabbitmq_default|db|database)_(root_)?(password|pass|pwd)$/.test(n)) continue;
      ajouter(i + 1, { what: typeSelonNom(nom), name: nom.split('.').pop(), sev: 'high', hint: masque(valeur), generic: true });
    }
  });
}

// ---------- 2. qui peut appeler chaque adresse du serveur ----------

// Décorateurs / middlewares / dépendances dont le nom dit « vérifier qui appelle ».
const NOM_GARDE = /(^|_)(login|auth|authenticated|authorized?|jwt|token|permission|permissions|perm|role|roles|staff|admin|superuser|owner|scope|scopes|session|api_?key|signature|signed|hmac|device|member|user)(_|$)|_required$|^requires?_|^ensure_|^verify_|^guard(?:_|$)|_guard$|^check_(auth|token|user|session|permission|role|api)|protect|^is_?authenticated|^is_?admin/i;
const PAS_GARDE = /^(route|get|post|put|patch|delete|cached?|limit|limiter|rate_?limit\w*|cross_origin|wraps|staticmethod|classmethod|property|retry|timed|log\w*|swag_from|validate\w*|expects|marshal\w*|doc|json_required|fields?_required|params?_required|body_required|transaction\w*|csrf\w*|exempt)$/i;
const estNomGarde = (nom) => !!nom && !PAS_GARDE.test(nom) && NOM_GARDE.test(versSnake(nom));
// Dépendances FastAPI qui fournissent une session de base de données au lieu de vérifier l’appelant
// (SessionDep, get_db, get_sql_session, SessionLocal, une unité de travail), reconnues d’après le nom en snake_case
const DEPENDANCE_BDD = /^(get_|new_|create_)?(async_)?(db|database|session|db_session|sessionmaker)$|(^|_)(db|database|sql\w*|engine|conn|connection|cursor|uow|unit_of_work)(_|$)|session_?(local|maker|factory)/i;
const estDepBdd = (nom) => DEPENDANCE_BDD.test(versSnake(nom));
const estDepGarde = (nom) => estNomGarde(nom) && !estDepBdd(nom);
// Le corps d’un gestionnaire qui inspecte lui-même l’appelant.
const VERIF_INTEGREE = /request\.headers(?:\.get)?\(?\s*\[?\s*['"](authorization|x-api-key|x-[\w-]*(token|key|secret|signature)[\w-]*)['"]|req\.headers(?:\.|\[\s*['"])(authorization|x-api-key)|\b(verify|check|require|validate|authenticate|authorize)_?\w*(auth|token|session|user|key|signature|webhook|hmac|jwt|device|staff|admin|permission|role|request|caller)\w*\s*\(|\bcurrent_user\b|get_jwt_identity|verify_jwt_in_request|compare_digest|abort\(\s*40[13]\b|,\s*40[13]\s*\)?\s*$|status(?:Code)?\s*[:=(]\s*40[13]\b|\.status\(\s*40[13]\s*\)|req\.user\b|req\.session\.user|req\.auth\b|jwt\.verify|jwtVerify|getServerSession|auth\(\)|currentUser\(|getAuth\(|auth\.getUser|getSession\(|verifyIdToken|getToken\(|\b(?:verify|check|require|validate|authenticate|authorize)\w*(?:Auth|Token|Session|Signature|Webhook|Hmac|Jwt|Secret|Permission|Role)\w*\s*\(|\bis_?(?:[Vv]alid_?)?(?:[Aa]uthorized|[Aa]uthenticated|[Ss]ignature|[Tt]oken|[Ss]ecret|[Aa]pi_?[Kk]ey)\w*\s*\(|timingSafeEqual|safeCompare|[!=]==?\s*(?:[`'"]Bearer\s+\$\{\s*)?process\.env\.\w*(?:SECRET|TOKEN|KEY|PASSWORD)|process\.env\.\w*(?:SECRET|TOKEN|KEY|PASSWORD)\w*\s*[!=]==?/m;
// Un simple paramètre Header n’est PAS une authentification. Ne le compter que si le
// gestionnaire vérifie ce jeton et rejette une mauvaise valeur avec un HTTP 401/403.
function entetePythonValide(sig, corps) {
  const noms = [...sig.matchAll(/\b([A-Za-z_]\w*(?:token|key|signature)\w*)\s*:\s*[^,\n]*=\s*Header\s*\(/g)]
    .map((m) => m[1]);
  if (!noms.length || !/raise\s+HTTPException\s*\(\s*status_code\s*=\s*40[13]\b/.test(corps)) return false;
  return noms.some((nom) => new RegExp('\\bif\\s+(?:not\\s+)?' + nom + '\\b').test(corps));
}

const VERIF_FIREBASE = /\b\w+\.auth\b(?!\s*\()|HttpsError\(\s*["'](unauthenticated|permission-denied)["']|enforceAppCheck\s*:\s*true|\b\w+\.app\b\s*(==|!=|===|!==)\s*(undefined|null)|!\s*\w+\.app\b/;
const VERIF_SIGNATURE =/hmac|signature|verify_?webhook|construct_?event|x-hub-signature|compare_digest|svix|webhooks?\.verify|jwt\.decode|oidc|id_token|authenticated|verify_\w*(token|request|push)/i;
const GARDE_NEXT = /getServerSession|\bauth\(\)|currentUser\(|getAuth\(|auth\.getUser|supabase\.auth\.get(User|Session)|getSession\(|verifyIdToken|jwt\.verify|jwtVerify|getToken\(|clerkClient|requireAuth|requireUser|withAuth|validateRequest|headers\(\)\.get\(\s*['"]authorization|status:\s*40[13]\b/;
// Une réponse marquée pour être stockée et servie à tout le monde ne peut pas contenir les données d’un seul appelant.
const REPONSE_PUBLIQUE = /cache-control['"]?\]?\s*[:,=]\s*[`'"f]*[^`'"\n]*\b(?:public|s-maxage)\b/i;
const REPONSE_PRIVEE = /cache-control['"]?\]?\s*[:,=]\s*[`'"f]*[^`'"\n]*\b(?:private|no-store)\b/i;
const NEXT_STATIQUE = /\bdynamic\s*=\s*['"]force-static['"]|export\s+const\s+revalidate\s*=\s*[1-9]/;
// Routes d’API d’une bibliothèque qui contrôle elle-même les accès : Payload CMS les génère et applique les règles d’accès de ses collections
const ROUTES_AUTO_CONTROLEES = /from\s+['"]@payloadcms\/next\/routes['"]/;
// D’où un GET Next.js pourrait tirer quelque chose à protéger : un stockage de données, la session de l’appelant ou un secret côté serveur
const LIT_PRIVE = /\b(?:prisma\w*|drizzle\w*|mongoose|mongodb|sequelize|typeorm|knex|kysely|supabase|firestore|firebase-admin|firebase\/\w+|dynamodb|redis|upstash|postgres|pg|mysql2?|sqlite3?|payload\w*|neon|turso|libsql)\b|\bdb\s*[.(]|\bdatabase\s*\.|\.(?:findMany|findUnique|findFirst|findOne|findAll|query|execute)\s*\(|\bcookies\s*\(|\bgetServerSession\b|\.session\b|\breq(?:uest)?\.(?:user|auth)\b|process\.env\.(?!NEXT_PUBLIC_|NODE_ENV\b|VERCEL|PUBLIC_|SITE_URL\b|BASE_URL\b|APP_URL\b)\w+/i;
const LIT_FICHIERS = /\b(?:readFile(?:Sync)?|createReadStream|readdir(?:Sync)?)\b/;
// Fonctions auxiliaires autour d’une route qui n’alimentent pas ce qu’elle renvoie
const PAS_SES_DONNEES = /(^|\/)[^/]*(rate-?limit|limiter|logger|logging|metrics|telemetry|sentry|analytics)[^/]*$/i;
const METHODE_REFUSEE = /status(?:Code)?\s*[:=(]\s*405\b|\.status\(\s*405\b|\bmethodNotAllowed\b/i;
/** Le code d’un gestionnaire exporté dans un fichier de route Next.js. */
function gestionnaireNext(source, methode) {
  const m = new RegExp('^[ \\t]*export\\s+(?:async\\s+)?(?:function|const)\\s+' + methode + '\\b', 'm').exec(source);
  if (!m) return '';
  const reste = source.slice(m.index + m[0].length);
  const fin = reste.search(/^[ \t]*export\s/m);
  return fin < 0 ? reste : reste.slice(0, fin);
}
const GARDE_MIDDLEWARE_NEXT = /getToken|withAuth|clerkMiddleware|authMiddleware|auth\(|supabase|getSession|jwtVerify|jwt\.verify|cookies\.get\([^)]*(session|token|auth)|redirect\([^)]*login/i;

function blocApres(lignes, idxDef) {
  // Le corps d’un def Python : toutes les lignes suivantes plus indentées, jusqu’à 120 lignes.
  const indentation = /^\s*/.exec(lignes[idxDef])[0].length;
  let fin = idxDef + 1;
  while (fin < lignes.length && fin < idxDef + 120 && (!lignes[fin].trim() || /^\s*/.exec(lignes[fin])[0].length > indentation || /^\s*[)\]]/.test(lignes[fin]))) fin++;
  return lignes.slice(idxDef, fin).join('\n');
}

function routesPython(source, f, sortie) {
  const lignes = source.split('\n');
  // Hooks before_request d’un Blueprint ou de toute l’appli, et dépendances de routeur qui vérifient l’appelant.
  const varsGardees = new Map();
  for (const m of source.matchAll(/^@(\w+)\.before_(?:app_)?request\s*\n(?:@.*\n)*\s*def\s+(\w+)/gm)) {
    const idxDef = source.slice(0, m.index + m[0].length).split('\n').length - 1;
    const corps = blocApres(lignes, idxDef);
    if (!/\b40[13]\b|Unauthorized|Forbidden|verify_jwt_in_request|login_required|is_authenticated|current_user/.test(corps)) continue;
    varsGardees.set(m[1], m[2]);
    if (m[1] === 'app') sortie.push({ k: 'global-guard', framework: 'flask', name: m[2], line: idxDef + 1 });
  }
  for (const m of source.matchAll(/^\s*(\w+)\s*=\s*(?:\w+\.)?APIRouter\(([^)]*(?:\([^)]*\)[^)]*)*)\)/gm)) {
    const dependance = /dependencies\s*=\s*\[[^\]]*Depends\(\s*([\w.]+)/.exec(m[2]);
    if (dependance && estDepGarde(dependance[1].split('.').pop())) varsGardees.set(m[1], dependance[1]);
  }
  // Alias de dépendances FastAPI, `AdminUser = Annotated[Session, Depends(admin_user)]`, et les fonctions de dépendance
  // qui les sous-tendent. Ils sont souvent importés d’un deps.py partagé : build décide donc pour tout le dépôt
  // lesquels vérifient l’appelant (voir gardesAliasPython).
  const ligneA = (i) => source.slice(0, i).split('\n').length - 1;
  const sigA = (indice) => lignes.slice(indice, indice + 15).join('\n').split(/\)\s*(->[^:]*)?:\s*$/m)[0];
  const dependancesDans = (texte) => [...texte.matchAll(/\b(?:Depends|Security)\(\s*([\w.]+)/g)].map((m) => m[1].split('.').pop());
  const typesDans = (sig) => [...new Set([...sig.matchAll(/\b\w+\s*:\s*(?:[\w.]*Annotated\[\s*)?([A-Za-z_][\w.]*)/g)].map((m) => m[1].split('.').pop()))];
  if (/\b(Depends|Security)\(/.test(source)) {
    for (const m of source.matchAll(/^(?:type\s+)?(\w+)\s*(?::[^=\n]*)?=\s*(?:[\w.]+\.)?Annotated\[/gm)) {
      let profondeur = 1, j = m.index + m[0].length;
      while (j < source.length && profondeur && j - m.index < 800) { if (source[j] === '[') profondeur++; else if (source[j] === ']') profondeur--; j++; }
      const fonction = dependancesDans(source.slice(m.index, j))[0];
      if (fonction) sortie.push({ k: 'py-alias', name: m[1], fn: fonction, line: ligneA(m.index) + 1 });
    }
    // fonctions de premier niveau qui ne sont pas des routes, avec les dépendances et les types qu’elles prennent
    for (const m of source.matchAll(/^(?:async\s+)?def\s+(\w+)\s*\(/gm)) {
      const indice = ligneA(m.index);
      if (indice > 0 && /^\s*@/.test(lignes[indice - 1])) continue;
      const sig = sigA(indice), dependances = dependancesDans(sig), types = typesDans(sig);
      if (dependances.length || types.length) sortie.push({ k: 'py-dep-fn', name: m[1], ...(dependances.length ? { deps: dependances } : {}), ...(types.length ? { types } : {}) });
    }
  }
  // Ne traiter une fonction auxiliaire comme un vérificateur que si son corps contrôle visiblement la
  // signature du fournisseur et rejette une requête invalide. Le nom d’une fonction auxiliaire seul
  // (validated_sender, par exemple) ne prouve pas une authentification.
  for (const m of source.matchAll(/^(?:async\s+)?def\s+(\w+)\s*\(/gm)) {
    const indice = ligneA(m.index);
    const corps = blocApres(lignes, indice);
    if (/\bRequestValidator\s*\(/.test(corps) && /\.validate\s*\(/.test(corps) &&
        /raise\s+HTTPException\s*\(\s*status_code\s*=\s*40[13]\b/.test(corps)) {
      sortie.push({ k: 'py-verified-helper', name: m[1], line: indice + 1 });
    }
  }
  // Décorateurs définis ici : ceux dont le nom parle d’authentification, et les enveloppes du projet comme `@endpoint(write=True)` dont
  // le corps applique lui-même un décorateur d’authentification. Une deuxième passe compte aussi l’enveloppe d’une enveloppe.
  const gardesLocales = new Set();
  const definitions = [...source.matchAll(/^def\s+(\w+)\s*\(/gm)].map((m) => { const indice = source.slice(0, m.index).split('\n').length - 1; return { name: m[1], line: indice + 1, body: blocApres(lignes, indice) }; });
  const ressembleDecorateur = (corps) => /wraps|decorat|def\s+\w+\(\s*\*args|return\s+\w+\s*$/m.test(corps);
  for (let passe = 0; passe < 2; passe++) for (const d of definitions) {
    if (gardesLocales.has(d.name) || !ressembleDecorateur(d.body)) continue;
    const appliques = [...d.body.matchAll(/^\s*@([\w.]+)/gm)].map((m) => m[1].split('.').pop());
    const enveloppes = appliques.some((a) => estNomGarde(a) || gardesLocales.has(a));
    if (estNomGarde(d.name) || enveloppes) { gardesLocales.add(d.name); sortie.push({ k: 'guard-def', name: d.name, line: d.line, ...(enveloppes && !estNomGarde(d.name) ? { wrapper: true } : {}) }); }
  }

  for (const r of f.routes || []) {
    // django : pas de contrôle par route à lire ; table : la connexion est vérifiée par le répartiteur ou dans le gestionnaire
    if (r.framework === 'django' || r.framework === 'table') continue;
    const i0 = r.line - 1;
    // décorateurs au-dessus du décorateur de route (mauvais endroit dans Flask/FastAPI : la route enregistre la fonction non enveloppée)
    const dessus = [];
    for (let i = i0 - 1; i >= 0 && /^\s*@/.test(lignes[i]); i--) dessus.push(/^\s*@([\w.]+)/.exec(lignes[i])[1].split('.').pop());
    // décorateurs en dessous, jusqu’au def
    const dessous = [];
    let idxDef = -1;
    for (let i = i0 + 1; i < lignes.length && i < i0 + 30; i++) {
      if (/^\s*(async\s+)?def\s/.test(lignes[i])) { idxDef = i; break; }
      const d = /^\s*@([\w.]+)/.exec(lignes[i]);
      if (d) dessous.push(d[1].split('.').pop());
    }
    const texteDecorateurs = lignes.slice(i0, idxDef > 0 ? idxDef : i0 + 1).join('\n');
    const sig = idxDef > 0 ? lignes.slice(idxDef, idxDef + 15).join('\n').split(/\)\s*(->[^:]*)?:\s*$/m)[0] : '';
    const corps = idxDef > 0 ? blocApres(lignes, idxDef) : '';
    const enregistrement = { k: 'route', line: r.line, method: r.method };
    const decorateur = dessous.find((d) => (estNomGarde(d) || gardesLocales.has(d)) && !/^(route|get|post|put|patch|delete)$/.test(d));
    const dependance = /Depends\(\s*([\w.]+)|Security\(\s*([\w.]+)/g;
    const dependances = [...(texteDecorateurs + '\n' + sig).matchAll(dependance)].map((m) => (m[1] || m[2]).split('.').pop());
    if (decorateur) Object.assign(enregistrement, { guard: decorateur, via: 'decorator' });
    else if (varsGardees.has(r.var)) Object.assign(enregistrement, { guard: varsGardees.get(r.var), via: 'blueprint' });
    else if (dependances.some(estDepGarde)) Object.assign(enregistrement, { guard: dependances.find(estDepGarde), via: 'dependency' });
    else if (VERIF_INTEGREE.test(corps)) Object.assign(enregistrement, { via: 'inline' });
    else if (entetePythonValide(sig, corps)) Object.assign(enregistrement, { via: 'inline' });
    else {
      const malPlace = dessus.find((d) => estNomGarde(d) && !/^(route|get|post|put|patch|delete)$/.test(d));
      if (malPlace) enregistrement.misplaced = malPlace;
      // d’autres décorateurs peuvent être des enveloppes d’authentification définies dans un autre fichier ; build les résout
      const autres = dessous.filter((d) => !/^(route|get|post|put|patch|delete|api_route|websocket)$/.test(d));
      if (autres.length) enregistrement.decos = autres;
      // les types de paramètres aussi : `user: AdminUser`, un alias de dépendance (gardesAliasPython)
      const types = typesDans(sig);
      if (types.length) enregistrement.types = types;
    }
    if (corps) enregistrement.calls = [...new Set([...corps.matchAll(/\b(?:await\s+)?([A-Za-z_]\w*)\s*\(/g)].map((m) => m[1]))];
    if (VERIF_SIGNATURE.test(corps)) enregistrement.signed = true;
    if (REPONSE_PUBLIQUE.test(corps)) enregistrement.publicResponse = true;
    if (idxDef > 0) enregistrement.fn = /def\s+(\w+)/.exec(lignes[idxDef])[1];
    sortie.push(enregistrement);
  }
}

function routesJs(source, f, sortie) {
  const routes = f.routes || [];
  if (!routes.length && !/\.use\(/.test(source) && !/(^|\/)middleware\.(t|j)s$/.test(f.path)) return;
  const lignes = source.split('\n');
  // middleware.ts de Next.js qui protège l’appli
  if (/(^|\/)(src\/)?middleware\.(t|j)s$/.test(f.path) && GARDE_MIDDLEWARE_NEXT.test(source)) {
    const motifRoutes = /matcher\s*:\s*([^\n]+)/.exec(source)?.[1] || '';
    if (!motifRoutes || /api|\(\?!/.test(motifRoutes)) sortie.push({ k: 'global-guard', framework: 'next', line: 1 });
  }
  // app.use(auth) / router.use(requireAuth) sans chemin protège tout ce qui est enregistré après
  const usages = [];
  for (const m of source.matchAll(/\b(\w+)\.use\(\s*([^'"`)][^)]*)\)/g)) {
    const noms = m[2].match(/[A-Za-z_$][\w$]*/g) || [];
    if (noms.some(estNomGarde)) usages.push({ v: m[1], line: source.slice(0, m.index).split('\n').length, name: noms.find(estNomGarde) });
  }
  for (const u of usages) if (u.v === 'app' || u.v === 'server') sortie.push({ k: 'global-guard', framework: 'express', name: u.name, line: u.line });

  routes.forEach((r, indice) => {
    if (r.framework === 'table') return; // la connexion est vérifiée par le répartiteur ou dans le gestionnaire
    const enregistrement = { k: 'route', line: r.line, method: r.method };
    if (r.framework === 'firebase') {
      // une fonction callable vérifie request.auth (v1 : context.auth) ou active App Check ; une fonction onRequest
      // vérifie elle-même un jeton ou une signature, comme n’importe quel autre gestionnaire
      const suivant = routes.slice(indice + 1).find((x) => x.line > r.line)?.line || r.line + 80;
      const corps = lignes.slice(r.line - 1, Math.min(suivant - 1, r.line + 80)).join('\n');
      if (VERIF_FIREBASE.test(corps) || VERIF_INTEGREE.test(corps)) enregistrement.via = 'inline';
      if (VERIF_SIGNATURE.test(corps)) enregistrement.signed = true;
      enregistrement.fn = r.handler;
      sortie.push(enregistrement);
      return;
    }
    if (r.framework === 'next') {
      if (ROUTES_AUTO_CONTROLEES.test(source)) enregistrement.via = 'library';
      else if (GARDE_NEXT.test(source) || VERIF_INTEGREE.test(source)) enregistrement.via = 'inline';
      if (VERIF_SIGNATURE.test(source)) enregistrement.signed = true;
      const gestionnaire = gestionnaireNext(source, r.method);
      if (METHODE_REFUSEE.test(gestionnaire) && !LIT_PRIVE.test(gestionnaire)) enregistrement.notAllowed = true;
      if (r.method === 'GET') enregistrement.nextGet = true;
      enregistrement.fn = r.method;
      sortie.push(enregistrement);
      return;
    }
    // les arguments propres à l’appel de route avant son gestionnaire : router.post('/x', requireAuth, async (req, res) => …),
    // ou router.post('/x', requireAuth, createOrder) où le dernier est le gestionnaire
    const debut = lignes.slice(r.line - 1, r.line + 4).join('\n');
    const appel = /\.\w+\(\s*["'`][^"'`]*["'`]\s*,/.exec(debut);
    let argsAppel = '';
    if (appel) {
      let profondeur = 1, j = appel.index + appel[0].length;
      for (; j < debut.length && profondeur; j++) { if (debut[j] === '(') profondeur++; else if (debut[j] === ')') profondeur--; }
      const propres = debut.slice(appel.index + appel[0].length, profondeur ? j : j - 1);
      const fonction = /(?:async\s*)?(?:\(\s*req\b|function\b|\breq\s*=>|\(\s*\{|\(\s*c\s*\)|\(\s*ctx\b)/.exec(propres);
      argsAppel = fonction ? propres.slice(0, fonction.index) : propres.slice(0, Math.max(0, propres.lastIndexOf(',')));
    }
    const interm = (argsAppel.match(/[A-Za-z_$][\w$.]*/g) || []).map((x) => x.split('.').pop()).find(estNomGarde);
    const suivant = routes[indice + 1]?.line || r.line + 60;
    const corps = lignes.slice(r.line - 1, Math.min(suivant - 1, r.line + 60)).join('\n');
    const anterieur = usages.find((u) => u.v === r.var && u.line < r.line);
    if (interm) Object.assign(enregistrement, { guard: interm, via: 'middleware' });
    else if (anterieur) Object.assign(enregistrement, { guard: anterieur.name, via: 'router' });
    else if (VERIF_INTEGREE.test(corps)) enregistrement.via = 'inline';
    if (VERIF_SIGNATURE.test(corps)) enregistrement.signed = true;
    if (REPONSE_PUBLIQUE.test(corps)) enregistrement.publicResponse = true;
    sortie.push(enregistrement);
  });
}

/**
 * Alias de dépendances FastAPI qui vérifient l’appelant, par dépôt : Map(dépôt -> Map(alias -> fichier)).
 * Un alias vérifie l’appelant quand sa fonction de dépendance le fait : par son nom (admin_user), en prenant une
 * dépendance qui vérifie (Depends(require_login)), ou en prenant lui-même un alias qui vérifie, par ex.
 * `AdminOffice = Annotated[Office, Depends(admin_owned_office)]` où admin_owned_office prend `admin: AdminUser`.
 * Un alias dont le nom lui-même se lit comme un contrôle compte aussi (`AdminAccess = Annotated[dict, Depends(check)]`),
 * sauf si l’un des deux noms dit que c’est une session de base de données (`SqlSessionDep` sur `get_sql_session`).
 */
function gardesAliasPython(fichiers, constats) {
  const parDepot = new Map(); // dépôt -> { aliases: Map(nom -> {fn, file}), fns: Map(nom -> {deps, types}) }
  for (const f of fichiers) for (const x of constats(f.path)) {
    if (x.k !== 'py-alias' && x.k !== 'py-dep-fn') continue;
    const k = f.repo ?? '';
    if (!parDepot.has(k)) parDepot.set(k, { aliases: new Map(), fns: new Map() });
    const r = parDepot.get(k);
    if (x.k === 'py-alias') r.aliases.set(x.name, { fn: x.fn, file: f.path });
    else r.fns.set(x.name, { deps: x.deps || [], types: x.types || [] });
  }
  const sortie = new Map();
  for (const [depot, { aliases: alias, fns: fonctions }] of parDepot) {
    const valides = new Map();
    const verifie = (fonction) => estDepGarde(fonction) || (!estDepBdd(fonction) && !!fonctions.get(fonction) && (fonctions.get(fonction).deps.some(estDepGarde) || fonctions.get(fonction).types.some((t) => valides.has(t))));
    const verifsAlias = (nom, fonction) => verifie(fonction) || (estDepGarde(nom) && !estDepBdd(fonction));
    // quelques passes, pour que les alias construits sur d’autres alias se résolvent quel que soit l’ordre des fichiers
    for (let passe = 0; passe < 3; passe++) for (const [nom, a] of alias) if (!valides.has(nom) && verifsAlias(nom, a.fn)) valides.set(nom, a.file);
    if (valides.size) sortie.set(depot, valides);
  }
  return sortie;
}

// ---------- 3. les erreurs habituelles des applis construites sur Supabase, Firebase, Stripe, Next.js et Vite ----------

// Les outils de build du frontend copient les variables ayant ces préfixes dans le code que chaque visiteur télécharge.
// (Un simple préfixe PUBLIC_ ne veut dire cela que pour SvelteKit et Astro : il ne compte que là où ils le lisent.)
const PREFIXE_PUBLIC = /^(NEXT_PUBLIC|VITE|REACT_APP|EXPO_PUBLIC|NUXT_PUBLIC|GATSBY|PUBLIC)_/;
const PREFIXE_CLIENT_SEUL = /^(VITE|REACT_APP|EXPO_PUBLIC|GATSBY|PUBLIC)_/; // ceux-ci n’existent que dans le code du navigateur
// Après le préfixe : les noms qui contiennent quelque chose de privé…
const NOM_PRIVE = /(^|_)(SECRETS?|SERVICE_ROLE|SERVICE_KEY|PRIVATE|PASSWORD|PASSWD|PWD|DATABASE_URL|DB_URL|CONNECTION_STRING|ADMIN_KEY|ADMIN_TOKEN|AUTH_TOKEN|JWT_SECRET)(_|$)/;
// …ou une clé ou un jeton pour un service qui te facture ou agit à ta place (IA, e-mail, messagerie, hébergement de code)
const SERVICE_PRIVE = /(^|_)(OPENAI|ANTHROPIC|CLAUDE|GEMINI|GROQ|GROK|XAI|MISTRAL|REPLICATE|ELEVEN_?LABS|SENDGRID|RESEND|POSTMARK|MAILGUN|BREVO|TWILIO|OPENROUTER|DEEPSEEK|PERPLEXITY|COHERE|TOGETHER|FIREWORKS|HUGGING_?FACE|HF|STABILITY|FAL|ASSEMBLY_?AI|DEEPGRAM|PINECONE|SERPAPI|TAVILY|FIRECRAWL|AIRTABLE|NOTION|GITHUB|SLACK|DISCORD|TELEGRAM|STRIPE)(_|$)/;
const CLE_PROBABLE = /(^|_)(KEY|API_?KEY|TOKEN|SECRET)$/;
// Clés publiques par conception : la clé anon de Supabase, la clé publiable de Stripe, les clés de site reCAPTCHA, les identifiants
const PUBLIC_PAR_CONCEPTION = /(^|_)(PUBLISHABLE|ANON|PK|PUBLIC|SITE|CLIENT_ID|APP_ID|PROJECT_ID|MEASUREMENT_ID)(_|$)/;
const NOM_SERVICE = { OPENAI: 'OpenAI', ANTHROPIC: 'Anthropic', CLAUDE: 'Anthropic', GEMINI: 'Google Gemini', GROQ: 'Groq', GROK: 'xAI', XAI: 'xAI', ELEVENLABS: 'ElevenLabs', ELEVEN_LABS: 'ElevenLabs', SENDGRID: 'SendGrid', OPENROUTER: 'OpenRouter', DEEPSEEK: 'DeepSeek', HF: 'Hugging Face', HUGGINGFACE: 'Hugging Face', HUGGING_FACE: 'Hugging Face', ASSEMBLYAI: 'AssemblyAI', ASSEMBLY_AI: 'AssemblyAI', SERPAPI: 'SerpApi', GITHUB: 'GitHub' };

/** Pour une variable comme VITE_OPENAI_API_KEY : le service qu’elle déverrouille ('OpenAI', ou '' pour un secret générique), ou null quand elle peut être publique sans risque. */
export function variablePubliqueFuyante(nom) {
  const m = PREFIXE_PUBLIC.exec(nom);
  if (!m) return null;
  const reste = nom.slice(m[0].length);
  if (PUBLIC_PAR_CONCEPTION.test(reste) || NOM_HACHE.test(reste)) return null;
  const serv = SERVICE_PRIVE.exec(reste)?.[2];
  if (serv && CLE_PROBABLE.test(reste)) return NOM_SERVICE[serv] || serv.charAt(0) + serv.slice(1).toLowerCase();
  if (NOM_PRIVE.test(reste)) return /SERVICE_ROLE|SERVICE_KEY/.test(reste) ? 'Supabase' : '';
  return null;
}

function trouverEnvPublic(source, f, sortie) {
  const ligneDe = indexLignes(source);
  const vus = new Set();
  const ajouter = (nom, indice) => { if (variablePubliqueFuyante(nom) === null || vus.has(nom)) return; vus.add(nom); sortie.push({ k: 'public-env', name: nom, line: ligneDe(indice) }); };
  for (const m of source.matchAll(/\b(process\.env\.|process\.env\[\s*['"]|import\.meta\.env\.)([A-Z][A-Z0-9_]*)/g)) {
    if (/^PUBLIC_/.test(m[2]) && m[1].startsWith('process')) continue; // PUBLIC_ ne veut rien dire pour Node
    ajouter(m[2], m.index);
  }
  for (const m of source.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]\$env\/(?:static|dynamic)\/public['"]/g)) for (const n of m[1].match(/[A-Z][A-Z0-9_]*/g) || []) ajouter(n, m.index);
}

// Stripe : du code qui réagit aux événements de paiement. Sans vérifier d’abord la signature de Stripe, n’importe qui peut envoyer
// un faux événement « paiement réussi » à l’adresse du webhook.
const EVENEMENT_STRIPE = /(?:\bcase\s*|[!=]==?\s*)["'](checkout\.session\.(?:completed|async_payment_succeeded)|payment_intent\.succeeded|invoice\.(?:paid|payment_succeeded|payment_failed)|customer\.subscription\.(?:created|updated|deleted)|charge\.(?:succeeded|refunded))["']/g;
const STRIPE_VERIFIE = /constructEvent(?:Async)?\s*\(|construct_event\s*\(|verifyHeader|verify_header|events\.retrieve\s*\(|Event\.retrieve\s*\(/;

function trouverWebhookStripe(source, f, sortie) {
  if (!/stripe/i.test(source) || STRIPE_VERIFIE.test(source)) return;
  const touches = [...source.matchAll(EVENEMENT_STRIPE)];
  if (!touches.length) return;
  sortie.push({ k: 'stripe-unsigned', line: indexLignes(source)(touches[0].index), events: [...new Set(touches.map((m) => m[1]))].slice(0, 4) });
}

// CORS : un serveur qui dit aux navigateurs que n’importe quel site web peut l’appeler. Sans danger pour une API publique sans cookies de
// connexion ; avec eux, n’importe quel site qu’un visiteur connecté ouvre pourrait agir à sa place.
function trouverCors(source, f, sortie) {
  const ligneDe = indexLignes(source);
  const ajouter = (indice, comment, identifiants) => sortie.push({ k: 'cors-any', line: ligneDe(indice), how: comment, credentials: identifiants });
  if (['typescript', 'javascript'].includes(f.lang)) {
    if (/require\(\s*['"]cors['"]\s*\)|from\s+['"]cors['"]/.test(source)) {
      for (const m of source.matchAll(/\bcors\(\s*\)/g)) ajouter(m.index, 'cors()', false);
      for (const m of source.matchAll(/\bcors\(\s*\{([^}]*)\}/g)) {
        const origine = /\borigin\s*:\s*(?:(['"`])\*\1|(true)\b)/.exec(m[1]);
        // '*' avec des identifiants est refusé par les navigateurs ; origin: true renvoie le site qui demande, quel qu’il soit
        if (origine) ajouter(m.index, origine[2] ? 'cors({ origin: true })' : "cors({ origin: '*' })", !!origine[2] && /\bcredentials\s*:\s*true/.test(m[1]));
      }
    }
    const enteteIdentifiants = /['"]Access-Control-Allow-Credentials['"]\s*[,:]\s*['"`]?true/i.test(source);
    for (const m of source.matchAll(/['"]Access-Control-Allow-Origin['"]\s*[,:]\s*(?:(['"`])\*\1|(req(?:uest)?\.headers(?:\.origin\b|\[\s*['"]origin['"]\s*\]|\.get\(\s*['"]origin['"]\s*\))))/gi)) {
      ajouter(m.index, m[2] ? 'Access-Control-Allow-Origin réglé sur l’origine de l’appelant' : 'Access-Control-Allow-Origin: *', !!m[2] && enteteIdentifiants);
    }
  } else if (f.lang === 'python') {
    for (const m of source.matchAll(/CORSMiddleware\s*,([\s\S]{0,800}?)\)\s*$/gm)) {
      if (/allow_origins\s*=\s*\[\s*(['"])\*\1\s*\]|allow_origin_regex\s*=\s*r?(['"])\.\*\2/.test(m[1])) ajouter(m.index, 'CORSMiddleware avec allow_origins=["*"]', /allow_credentials\s*=\s*True/.test(m[1]));
    }
    for (const m of source.matchAll(/\bCORS\(\s*\w+\s*(?:\)|,([^)]*)\))/g)) {
      const options = m[1] || '';
      if (/\borigins["']?\s*[:=]\s*(?!(['"])\*\1)/.test(options)) continue; // une liste de sites autorisés (origins=… ou "origins": …)
      ajouter(m.index, 'CORS(app) avec toutes les origines autorisées', /supports_credentials\s*=\s*True/.test(options));
    }
    const toutes = /^\s*CORS_(?:ALLOW_ALL_ORIGINS|ORIGIN_ALLOW_ALL)\s*=\s*True\b/m.exec(source);
    if (toutes) ajouter(toutes.index, 'CORS_ALLOW_ALL_ORIGINS = True', /^\s*CORS_ALLOW_CREDENTIALS\s*=\s*True\b/m.test(source));
  }
}

// Migrations Supabase / Postgres : tables, sécurité au niveau des lignes activée ou désactivée, tables supprimées ou
// renommées, et règles de sécurité qui laissent n’importe qui modifier une table. construire.mjs les rejoue dans l’ordre des fichiers.
const ID_SQL = String.raw`(?:"[^"]+"|[A-Za-z_][\w$]*)`;
const NOM_SQL = String.raw`(?:${ID_SQL}\s*\.\s*)?${ID_SQL}`;
const nomSql = (brut) => {
  const parties = brut.split(/\s*\.\s*(?=(?:"[^"]*"|[^"])*$)/).map((p) => p.trim().replace(/^"|"$/g, '').toLowerCase());
  return parties.length > 1 ? `${parties[0]}.${parties[1]}` : `public.${parties[0]}`;
};

function trouverSql(source, f, sortie) {
  // effacer les commentaires en gardant les sauts de ligne, pour que les numéros de ligne restent justes
  const s = source.replace(/--[^\n]*/g, (m) => ' '.repeat(m.length)).replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  const ligneDe = indexLignes(s);
  const trouves = [];
  for (const m of s.matchAll(new RegExp(String.raw`\bcreate\s+(?:(temp|temporary)\s+|unlogged\s+)?table\s+(?:if\s+not\s+exists\s+)?(${NOM_SQL})`, 'gi'))) {
    if (!m[1]) trouves.push({ i: m.index, k: 'sql-table', table: nomSql(m[2]) });
  }
  for (const m of s.matchAll(new RegExp(String.raw`\balter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(${NOM_SQL})\s+(enable|disable|force|no\s+force)\s+row\s+level\s+security`, 'gi'))) {
    trouves.push({ i: m.index, k: 'sql-rls', table: nomSql(m[1]), on: !/^(disable|no)/i.test(m[2]) });
  }
  for (const m of s.matchAll(new RegExp(String.raw`\balter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(${NOM_SQL})\s+rename\s+to\s+(${ID_SQL})`, 'gi'))) {
    const ancienNom = nomSql(m[1]);
    trouves.push({ i: m.index, k: 'sql-rename', table: ancienNom, to: `${ancienNom.split('.')[0]}.${m[2].replace(/^"|"$/g, '').toLowerCase()}` });
  }
  for (const m of s.matchAll(new RegExp(String.raw`\bdrop\s+table\s+(?:if\s+exists\s+)?(${NOM_SQL}(?:\s*,\s*${NOM_SQL})*)`, 'gi'))) {
    for (const t of m[1].split(/\s*,\s*/)) trouves.push({ i: m.index, k: 'sql-drop', table: nomSql(t) });
  }
  // une règle permissive qui laisse des visiteurs non connectés ajouter, modifier ou supprimer des lignes : `using (true)` / `with check (true)`
  for (const m of s.matchAll(new RegExp(String.raw`\bcreate\s+policy\s+(${ID_SQL})\s+on\s+(${NOM_SQL})([^;]*)`, 'gi'))) {
    const corps = m[3];
    if (/\bas\s+restrictive\b/i.test(corps)) continue;
    const commande = (/\bfor\s+(all|select|insert|update|delete)\b/i.exec(corps)?.[1] || 'all').toLowerCase();
    if (commande === 'select') continue;
    const vers = /\bto\s+([\w\s,"]+?)(?=\s+(?:using|with)\b|\s*$)/i.exec(corps)?.[1];
    const roles = vers ? vers.split(/\s*,\s*/).map((r) => r.replace(/"/g, '').trim().toLowerCase()) : ['public'];
    if (!roles.some((r) => r === 'anon' || r === 'public')) continue;
    const oui = (clause) => new RegExp(String.raw`\b${clause}\s*\(\s*\(?\s*true\s*\)?\s*\)`, 'i').test(corps);
    const ouvert = commande === 'insert' ? oui('with\\s+check') : commande === 'all' ? oui('using') || oui('with\\s+check') : oui('using');
    if (ouvert) trouves.push({ i: m.index, k: 'sql-open-policy', table: nomSql(m[2]), policy: m[1].replace(/^"|"$/g, ''), cmd: commande, signedOut: roles.includes('anon') || !vers });
  }
  for (const x of trouves.sort((a, b) => a.i - b.i)) { const { i, ...reste } = x; sortie.push({ ...reste, line: ligneDe(i) }); }
}

const UTILISE_SUPABASE = /@supabase\/(?:supabase-js|ssr|auth-helpers[\w-]*)|from\s+supabase\s+import|^\s*import\s+supabase\b/m;

// ---------- point d’entrée par fichier ----------

export function trouverProblemes(source, f) {
  const sortie = [];
  trouverSecrets(source, f, sortie);
  if (f.category !== 'code') return sortie;
  if (f.lang === 'sql') trouverSql(source, f, sortie);
  if (!FICHIER_TEST.test(f.path) && !FICHIER_EXEMPLE.test(f.path)) {
    if (['typescript', 'javascript', 'vue', 'svelte', 'astro'].includes(f.lang)) trouverEnvPublic(source, f, sortie);
    if (['typescript', 'javascript', 'python'].includes(f.lang)) { trouverWebhookStripe(source, f, sortie); trouverCors(source, f, sortie); }
  }
  if (['typescript', 'javascript', 'python'].includes(f.lang) && UTILISE_SUPABASE.test(source)) sortie.push({ k: 'uses-supabase' });
  if (f.lang === 'python') routesPython(source, f, sortie);
  else if (['typescript', 'javascript'].includes(f.lang)) routesJs(source, f, sortie);
  // lancé directement ou enregistré par son nom (donc « rien ne l’importe » ne veut pas dire inutilisé)
  if (/^#!|if\s+__name__\s*==\s*['"]__main__['"]|@(?:\w+\.)*(?:task|shared_task|command|group|receiver|scheduled_job|on_event|listener|hookimpl|periodic_task|cli\.command)\b|require\.main\s*===\s*module|import\.meta\.main/m.test(source)) sortie.push({ k: 'runnable' });
  // un frontend qui appelle une adresse localhost fixe (casse une fois déployé)
  // (seulement dans les fichiers sans bascule d’environnement / de nom d’hôte, où ça ne peut pas être une valeur de repli pour le développement)
  if (['typescript', 'javascript', 'vue', 'svelte'].includes(f.lang) && !FICHIER_TEST.test(f.path) && !/process\.env|import\.meta\.env|NODE_ENV|location\.(hostname|host|origin)|isDev|__DEV__/.test(source)) {
    source.split('\n').forEach((t, i) => {
      if (/["'`]https?:\/\/(localhost|127\.0\.0\.1):\d+/.test(t) && !/\?\?|\|\||local|dev|fallback|default|^\s*(\/\/|\*)/i.test(t.replace(/https?:\/\/(localhost|127\.0\.0\.1)/g, ''))) sortie.push({ k: 'localhost', line: i + 1 });
    });
  }
  return sortie;
}

// ======================= build : transformer les constats en problèmes =======================

const ORDRE_GRAVITE = { high: 0, medium: 1, low: 2 };
const CHEMIN_PUBLIC = /(^|\/)(health|healthz|healthcheck|ping|status|ready|readyz|readiness|live|livez|liveness|version|metrics|robots\.txt|sitemap[\w.]*|favicon[\w.]*|\.well-known|login|logout|signin|pair|sign-in|signout|signup|sign-up|register|forgot[\w-]*|reset[\w-]*|verify[\w-]*|oauth\w*|callback|auth|token|refresh|static|assets|public|newsletter|contact|waitlist|unsubscribe|openapi\.json|docs|swagger[\w.]*|i|images?)(\/|$)/i;
// Fichiers et flux faits pour être lus par les robots d’indexation, les lecteurs de flux et les outils d’IA. En lecture seulement : voir publicParConception.
const CHEMIN_FICHIER_PUBLIC = /(^|\/)(llms(-full)?\.txt|ai\.txt|humans\.txt|(app-)?ads\.txt|security\.txt|rss(\.xml)?|atom(\.xml)?|feed\.(xml|rss|atom|json)|index\.xml|opensearch\.xml|site\.webmanifest|manifest\.(json|webmanifest)|openapi\.ya?ml)$/i;
const FICHIER_LISTE = /(^|\/)(llms(-full)?\.txt|robots\.txt)$/i;
/** Les adresses qu’un projet publie dans son llms.txt, ou autorise explicitement dans son robots.txt. */
function cheminsListes(fichier, source) {
  const trouves = /robots\.txt$/i.test(fichier) ? [...source.matchAll(/^\s*Allow:\s*(\/\S*)/gim)] : [...source.matchAll(/(?:https?:\/\/[^\s/)\]"'<>]+|(?<![\w./-]))(\/[^\s)\]"'<>#?*]+)/g)];
  return trouves.map((m) => m[1].replace(/[.,;:]+$/, '').replace(/\/$/, '')).filter((p) => p.length > 1 && !p.includes('*'));
}
const CHEMIN_WEBHOOK = /webhook|\/hooks?\//i;
// adresses du serveur sous une URL de webhook qui gèrent les webhooks (créer, lister, tester…) au lieu de les recevoir
const ADMIN_WEBHOOK = /\/(manage|admin|setup|settings|config|list|create|register|delete|test[\w-]*)(\/|$)/i;
const TYPES_SANS_USAGE = new Set(['test', 'script', 'infra', 'config', 'worker', 'external']);
const FICHIER_SPECIAL = /(^|\/)(index|main|app|server|cli|manage|wsgi|asgi|__init__|__main__|conftest|setup|config|settings|env|middleware|instrumentation|layout|page|route|loading|error|not-found|template|default|global-error|sitemap|robots|manifest|opengraph-image|twitter-image|icon|apple-icon|_app|_document|_error|404|500|models|admin|apps|views|urls|signals|tasks|forms|serializers|celery|gunicorn\.conf|vite-env\.d|worker|sw|service-worker)\.[a-z]+$|\.d\.ts$|\.config\.[a-z]+$|\.stories\.|(^|\/)(pages|migrations|alembic|versions|scripts|bin|tools|seeds?|fixtures?|examples?|docs?|public|static|templates|\.github|e2e|cypress|playwright)\//i;
// Un commentaire disant qu’un outil ouvre ce fichier par son nom, ou qu’il est généré : ce n’est pas du code oublié, quoi qui l’importe
const CHARGE_PAR_NOM = /^\s*(?:\/\/|\/?\*|#|<!--|"""|''')[^\n]*(?:\b(?:cli|tool|tooling|framework|runner|bundler|build|compiler|plugin|sdk|script)\b[^\n]*\b(?:reads?|loads?|imports?|runs?|executes?|opens?|requires?|picks? up)\b[^\n]*\b(?:this file|directly|by name|by path|at runtime)\b|\bthis file is (?:read|loaded|imported|run|executed|required|used|picked up)\b[^\n]*\b(?:by|directly|at runtime)\b|\bthis (?:file|code) (?:is|was) (?:auto-?)?generated\b|@generated\b|\b(?:auto-?)?generated (?:file|code)\b|\bcode generated by\b|\bdo not (?:edit|modify|delete|remove) (?:this|it)\b)/im;
const LANGAGES_UTILISES = new Set(['typescript', 'javascript', 'python', 'vue', 'svelte', 'astro']);
const pluriel = (n, w, mots) => `${n} ${n === 1 ? w : mots || w + 's'}`;

export function construireSante({ graph: graphe, scan: analyse, arch: archi, root: racine }) {
  const listeProblemes = [];
  const noeudParId = new Map(graphe.nodes.map((n) => [n.id, n]));
  const fichierParChemin = new Map(graphe.files.map((f) => [f.p, f]));
  const analyseParChemin = new Map(analyse.files.map((f) => [f.path, f]));
  const ascendance = (id) => { const sortie = []; let n = noeudParId.get(id); while (n) { sortie.push(n); n = n.parent ? noeudParId.get(n.parent) : null; } return sortie; };
  const natures = (id) => ascendance(id).map((n) => n.kind);
  const estFrontal = (p) => { const f = fichierParChemin.get(p); return !!f && natures(f.n).includes('ui'); };
  const nomDe = (p) => fichierParChemin.get(p)?.name || p.split('/').pop();
  const etiquette = (id) => noeudParId.get(id)?.label || id;
  // Les fichiers hors de la carte (config, .env, règles Firebase) pointent vers le module qui possède leur dossier, ou
  // à défaut vers la partie de la carte la plus précise dont les chemins les nomment.
  const motifsArchi = (archi?.nodes || []).filter((n) => n?.id && noeudParId.has(n.id) && Array.isArray(n.paths)).flatMap((n) => n.paths.map((p) => ({ id: n.id, g: compilerMotif(p) })));
  const proprietaireMotif = (p) => motifsArchi.filter((x) => x.g.test(p)).sort((a, b) => b.g.specificity - a.g.specificity)[0]?.id;
  const proprietaireDossier = new Map();
  for (const f of graphe.files) { let d = f.p; while (d.includes('/')) { d = d.slice(0, d.lastIndexOf('/')); if (!proprietaireDossier.has(d)) proprietaireDossier.set(d, new Map()); const m = proprietaireDossier.get(d); m.set(f.n, (m.get(f.n) || 0) + 1); } }
  const elementPour = (p) => {
    if (fichierParChemin.has(p)) return 'f:' + p;
    let d = p;
    while (d.includes('/')) {
      d = d.slice(0, d.lastIndexOf('/'));
      const m = proprietaireDossier.get(d);
      const premier = m && [...m.entries()].filter(([n]) => n !== 'unassigned').sort((a, b) => b[1] - a[1])[0];
      if (premier) return 'n:' + premier[0];
    }
    const proprietaire = proprietaireMotif(p);
    return proprietaire ? 'n:' + proprietaire : null;
  };
  const constats = (p) => analyseParChemin.get(p)?.problemes || [];

  // ---------- secrets dans le code et la config ----------
  const fichiersSecrets = [];
  for (const f of analyse.files) {
    const s = constats(f.path).filter((x) => x.k === 'secret');
    if (s.length) fichiersSecrets.push({ path: f.path, list: s });
  }
  // fichiers d’identifiants (JSON de compte de service, clés .pem) que l’analyse ne lit pas comme de la config
  for (const f of analyse.files) {
    const base = f.path.split('/').pop();
    if (FICHIER_TEST.test(f.path) || FICHIER_EXEMPLE.test(f.path) || /\.pub$/.test(base)) continue;
    if (!/\.(pem|key|p12|pfx|jks|keystore)$|^id_(rsa|dsa|ecdsa|ed25519)$|service[-_]?account.*\.json$|^credentials?\.json$|firebase-adminsdk.*\.json$|^client_secret.*\.json$|-key\.json$/i.test(base)) continue;
    let debut = '';
    try { debut = lireDebut(chemin.join(racine, f.path), 65536); } catch { continue; }
    if (cleEnClairDans(debut) || /"private_key"\s*:\s*"-----|"client_secret"\s*:\s*"[^"]{8,}/.test(debut) || /\.(p12|pfx|jks|keystore)$/i.test(base)) fichiersSecrets.push({ path: f.path, list: [{ k: 'secret', line: 1, what: 'un fichier d’identifiants (une clé privée qui se connecte à la place de ton appli)', sev: 'high', hint: 'fichier entier' }], file: true });
  }
  const problemeSecret = (groupe) => {
    const emplacements = [], notes = {}, elements = [];
    const natures = new Set(), servs = new Set();
    let frontal = false;
    for (const { path: p, list: liste, file: fichier } of groupe) {
      liste.sort((a, b) => a.line - b.line);
      const elem = elementPour(p);
      if (elem && !elements.includes(elem)) elements.push(elem);
      for (const s of liste) {
        emplacements.push({ file: p, line: s.line });
        natures.add(s.what);
        if (s.svc) servs.add(s.svc);
      }
      if (estFrontal(p)) frontal = true;
      if (elem) notes[elem] = (notes[elem] ? notes[elem] + ' · ' : '') + liste.slice(0, 4).map((s) => `${fichier ? p.split('/').pop() : `ligne ${s.line}`} : ${s.name ? `${s.name}, ` : ''}${s.what.replace(/ \(.*\)$/, '')} (${s.hint})`).join(' · ') + (liste.length > 4 ? ` · +${liste.length - 4} autres` : '');
    }
    const n = emplacements.length;
    const grav = groupe.some((g) => g.list.some((s) => s.sev === 'high')) ? 'high' : 'medium';
    const seul = groupe.length === 1 ? groupe[0].path : null;
    const texteType = natures.size === 1 ? [...natures][0].replace(/ \(.*\)$/, '') : 'des mots de passe ou des clés';
    return {
      id: 'secret:' + (seul || groupe.map((g) => g.path).join('|')),
      kind: 'secret', severity: grav,
      title: n === 1 ? `Une clé secrète est écrite dans ${seul ? seul.split('/').pop() : `${groupe.length} autres fichiers`}` : `${n} mots de passe ou clés sont écrits dans ${seul ? seul.split('/').pop() : `${groupe.length} autres fichiers`}`,
      detail: `${seul ? `${nomDe(seul)} (${seul})` : pluriel(groupe.length, 'fichier')} contient ${n === 1 ? texteType : `${n} secrets (${texteType})`}. Quiconque peut voir le code peut s’en servir pour accéder à ${servs.size ? [...servs].slice(0, 4).join(', ') : 'tous les services concernés'} en se faisant passer pour toi${frontal ? ', et ce code est envoyé au navigateur de chaque visiteur' : ''}. Considère ${n === 1 ? 'ce secret' : 'ces secrets'} comme compromis : retire-${n === 1 ? 'le' : 'les'} du code et remplace-${n === 1 ? 'le par un nouveau' : 'les par de nouveaux'}.`,
      items: elements, notes, locations: emplacements,
      fix: [
        `Correctif de sécurité : secrets écrits en dur dans le code. N’affiche, ne répète et ne copie jamais la valeur d’un secret dans tes réponses, tes commits ou tes journaux. Réponds-moi en français, avec des mots simples, en me tutoyant.`,
        ``,
        `Ces lignes contiennent ${n === 1 ? 'un secret écrit' : 'des secrets écrits'} directement dans le code :`,
        ...groupe.flatMap(({ path: p, list: liste, file: fichier }) => liste.map((s) => `- ${p}${fichier ? ' (tout le fichier)' : `:${s.line}`}: ${s.name ? `${s.name} — ` : ''}${s.what.replace(/ \(.*\)$/, '')}`)),
        ``,
        `Pour chacun :`,
        `1. Remplace la valeur écrite en dur par la lecture d’une variable d’environnement (${groupe.some((g) => /\.py$/.test(g.path)) ? `os.environ["NOM"] en Python` : ''}${groupe.some((g) => /\.py$/.test(g.path)) && groupe.some((g) => /\.[jt]sx?$/.test(g.path)) ? ', ' : ''}${groupe.some((g) => /\.[jt]sx?$/.test(g.path)) ? 'process.env.NOM en JavaScript/TypeScript' : ''}${!groupe.some((g) => /\.(py|[jt]sx?)$/.test(g.path)) ? 'ou une référence à un gestionnaire de secrets' : ''}), avec un nom de variable clair. Si l’appli ne peut pas tourner sans elle, fais échouer le démarrage avec une erreur claire quand elle manque, au lieu de retomber sur une valeur écrite en dur.`,
        `2. Ajoute le nom de chaque variable (avec une valeur vide, jamais la vraie) dans .env.example, et vérifie que .env figure dans .gitignore.`,
        frontal ? `3. Ce code de frontend part dans le navigateur. Déplace l’appel qui a besoin du secret dans une route ou une fonction côté serveur, pour que la clé n’arrive jamais chez les visiteurs.` : `3. Mets à jour la config de déploiement (Docker, Cloud Run, Vercel, etc.) pour que la variable soit définie en production.`,
        groupe.some((g) => g.file) ? `4. Retire le fichier d’identifiants du dépôt (git rm --cached), ajoute son nom à .gitignore et charge-le depuis un chemin donné par une variable d’environnement.` : `4. Lance l’appli ou ses tests pour confirmer qu’elle démarre toujours avec les variables définies.`,
        ``,
        `Ensuite, donne-moi une courte liste (sans les valeurs) des services auxquels appartiennent ces clés, pour que je change chacune : créer une nouvelle clé dans le tableau de bord du service, la mettre dans mon environnement et révoquer l’ancienne. Comme les anciennes valeurs sont dans l’historique git, considère-les comme compromises.`,
      ].join('\n'),
    };
  };
  fichiersSecrets.sort((a, b) => b.list.length - a.list.length);
  const MAX_PROBLEMES_SECRETS = 8;
  fichiersSecrets.slice(0, MAX_PROBLEMES_SECRETS).forEach((g) => listeProblemes.push(problemeSecret([g])));
  if (fichiersSecrets.length > MAX_PROBLEMES_SECRETS) listeProblemes.push(problemeSecret(fichiersSecrets.slice(MAX_PROBLEMES_SECRETS)));

  // ---------- fichiers .env commités (ou qui vont l’être) ----------
  for (const f of analyse.files) {
    const base = f.path.split('/').pop();
    if (!/^\.env(\.[\w.-]+)?$/i.test(base) || /example|sample|template|dist|defaults?|schema|test/i.test(base)) continue;
    let source = '';
    try { source = lireDebut(chemin.join(racine, f.path), 262144); } catch { continue; }
    const varsSecretes = [];
    source.split('\n').forEach((t, i) => {
      const m = /^\s*(?:export\s+)?([A-Za-z_][\w.]*)\s*=\s*["']?([^"'#\s]*)/.exec(t);
      if (!m || !m[2]) return;
      const n = versSnake(m[1]);
      const connu = FORMATS.some((fm) => { fm.re.lastIndex = 0; const touche = fm.re.test(m[2]); fm.re.lastIndex = 0; return touche; });
      if (connu || (NOM_SECRET.test(n) && !NOM_PUBLIC.test(n) && valeurSembleReelle(m[2], n)) || (/url|uri|dsn/i.test(n) && /:\/\/[^:\s\/]+:[^@\s]+@/.test(m[2]))) varsSecretes.push({ name: m[1], line: i + 1 });
    });
    if (!varsSecretes.length) continue;
    const depotAbsolu = f.repo ? chemin.join(racine, f.repo) : racine;
    const relatifDansDepot = f.repo ? f.path.slice(f.repo.length + 1) : f.path;
    const suivi = !!git(depotAbsolu, ['ls-files', '--', relatifDansDepot]);
    const elem = elementPour(f.path);
    listeProblemes.push({
      id: 'env-file:' + f.path, kind: 'env-file', severity: suivi ? 'high' : 'medium',
      title: suivi ? 'Ton fichier de réglages privés est enregistré dans git' : 'Ton fichier de réglages privés n’est pas caché de git',
      detail: suivi
        ? `${f.path} contient ${pluriel(varsSecretes.length, 'mot de passe ou clé', 'mots de passe et clés')} et est enregistré dans git : toutes les personnes qui ont accès au code (et à son historique) peuvent ${varsSecretes.length === 1 ? 'le' : 'les'} lire. Ce fichier doit rester uniquement sur ton ordinateur.`
        : `${f.path} contient ${pluriel(varsSecretes.length, 'mot de passe ou clé', 'mots de passe et clés')} et n’est pas listé dans .gitignore : le prochain commit l’enverra avec ton code.`,
      items: elem ? [elem] : [], notes: elem ? { [elem]: `${f.path}: ${varsSecretes.slice(0, 6).map((v) => v.name).join(', ')}${varsSecretes.length > 6 ? '…' : ''}` } : {},
      locations: varsSecretes.map((v) => ({ file: f.path, line: v.line })),
      fix: [
        `Correctif de sécurité : ${f.path} contient des secrets et ${suivi ? 'est enregistré dans git' : 'n’est pas ignoré par git'}. N’affiche et ne répète aucune valeur qu’il contient. Réponds-moi en français, avec des mots simples, en me tutoyant.`,
        ``,
        `1. Ajoute ${base} (et .env*.local) à ${f.repo ? f.repo + '/' : ''}.gitignore, en gardant .env.example suivi par git.`,
        suivi ? `2. Arrête de le suivre sans supprimer ma copie locale : git rm --cached "${relatifDansDepot}" (à lancer dans ${f.repo || 'le dépôt'}), puis fais un commit.` : `2. Vérifie avec git status que le fichier n’apparaît plus comme un nouveau fichier.`,
        `3. Crée ou mets à jour .env.example à côté, avec les mêmes noms de variables et des valeurs vides : ${varsSecretes.map((v) => v.name).join(', ')}.`,
        suivi ? `4. Donne-moi une liste (noms seulement, sans valeurs) des clés que je dois changer dans le tableau de bord de chaque service, puisqu’elles sont dans l’historique git. Précise que les retirer de l’historique demande un outil comme git filter-repo, et demande-moi avant de le faire.` : `4. Dis-moi quels réglages de déploiement ont besoin de ces variables.`,
      ].join('\n'),
    });
  }

  // ---------- clés secrètes dans des variables que reçoit le navigateur (NEXT_PUBLIC_, VITE_ …) ----------
  const horsTest = (p) => !FICHIER_TEST.test(p) && !FICHIER_EXEMPLE.test(p);
  const variablesPubliques = new Map(); // nom -> { svc, refs: [{file, line}], defs: [{file, line}] }
  const variablePublique = (nom) => { if (!variablesPubliques.has(nom)) variablesPubliques.set(nom, { name: nom, svc: variablePubliqueFuyante(nom), refs: [], defs: [] }); return variablesPubliques.get(nom); };
  for (const f of analyse.files) if (horsTest(f.path)) for (const x of constats(f.path)) if (x.k === 'public-env') variablePublique(x.name).refs.push({ file: f.path, line: x.line });
  for (const f of analyse.files) {
    const base = f.path.split('/').pop();
    if (!/^\.env(\.[\w.-]+)?$/i.test(base) || /example|sample|template|dist|schema/i.test(base) || !horsTest(f.path)) continue;
    let source = '';
    try { source = lireDebut(chemin.join(racine, f.path), 262144); } catch { continue; }
    source.split('\n').forEach((t, i) => {
      const m = /^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=\s*["']?([^"'#\s]*)/.exec(t);
      if (!m || !m[2] || variablePubliqueFuyante(m[1]) === null) return;
      // VITE_ADMIN_PASSWORD=$2b$12$… est un hachage (ou un texte chiffré), pas le mot de passe
      if (valeurProtegee(m[2], m[1])) variablePublique(m[1]).protected = true;
      else if (!VALEUR_BIDON.test(m[2]) && !/^\$/.test(m[2])) variablePublique(m[1]).defs.push({ file: f.path, line: i + 1 });
    });
  }
  for (const [nom, v] of variablesPubliques) if (v.protected && !v.defs.length) variablesPubliques.delete(nom);
  if (variablesPubliques.size) {
    const variables = [...variablesPubliques.values()];
    const coteNavigateur = (p) => estFrontal(p) || /\.(jsx|tsx|vue|svelte|astro)$/.test(p);
    const grav = variables.some((v) => PREFIXE_CLIENT_SEUL.test(v.name) || v.refs.some((r) => coteNavigateur(r.file))) ? 'high' : 'medium';
    const servs = [...new Set(variables.map((v) => v.svc).filter(Boolean))];
    const emplacements = variables.flatMap((v) => [...v.defs, ...v.refs]);
    const elements = [], notes = {};
    for (const v of variables) for (const empl of [...v.refs, ...v.defs]) {
      const elem = elementPour(empl.file);
      if (!elem) continue;
      if (!elements.includes(elem)) elements.push(elem);
      const note = `ligne ${empl.line} : ${v.name}`;
      if (!(notes[elem] || '').includes(note)) notes[elem] = (notes[elem] ? notes[elem] + ' · ' : '') + note;
    }
    const noms = variables.map((v) => v.name);
    listeProblemes.push({
      id: 'public-env', kind: 'public-env-secret', severity: grav,
      title: variables.length === 1 ? `${noms[0]} est envoyé au navigateur de chaque visiteur` : `${variables.length} clés secrètes sont envoyées au navigateur de chaque visiteur`,
      detail: `Les réglages dont le nom commence par NEXT_PUBLIC_, VITE_ et similaires sont copiés dans le code que ton site envoie à chaque visiteur, où n’importe qui peut les lire avec les outils de développement de son navigateur. ${variables.length === 1 ? `${noms[0]} ressemble à une clé secrète` : `${noms.slice(0, 4).join(', ')}${variables.length > 4 ? '…' : ''} ressemblent à des clés secrètes`}${servs.length ? ` (pour ${servs.slice(0, 4).join(', ')})` : ''}, donc n’importe qui pourrait s’en servir à ta place : faire grimper ta facture, envoyer des messages en ton nom ou accéder à tes données.${grav === 'medium' ? ' Pour l’instant, seul du code côté serveur semble s’en servir : ce n’est peut-être pas encore arrivé dans un navigateur, mais le nom y invite.' : ''}`,
      items: elements, notes, locations: emplacements,
      fix: [
        `Correctif de sécurité : clés secrètes dans des variables d’environnement publiques (le navigateur reçoit toute variable portant ces préfixes). N’affiche, ne répète et ne copie aucune valeur de clé. Réponds-moi en français, avec des mots simples, en me tutoyant.`,
        ``,
        ...variables.map((v) => `- ${v.name}${v.svc ? ` (${v.svc})` : ''}: ${[...v.defs.map((d) => `définie dans ${d.file}:${d.line}`), ...v.refs.map((r) => `utilisée dans ${r.file}:${r.line}`)].slice(0, 6).join(', ')}`),
        ``,
        `Pour chacune :`,
        `1. Renomme-la sans le préfixe public (par exemple OPENAI_API_KEY au lieu de VITE_OPENAI_API_KEY) dans les fichiers .env, .env.example et les réglages de l’hébergeur.`,
        `2. Déplace tout ce qui l’utilise dans du code côté serveur (un gestionnaire de route ou une server action Next.js, une Edge Function Supabase, une fonction serverless ou le backend existant) et fais appeler cela par le frontend à la place, pour que la clé n’arrive jamais dans le navigateur.`,
        variables.some((v) => v.svc === 'Supabase') ? `3. Pour la clé service-role de Supabase : le code du navigateur doit utiliser la clé anon et s’appuyer sur la sécurité au niveau des lignes ; seul le code côté serveur peut utiliser la clé service-role.` : `3. Garde le même fonctionnement côté frontend et lance l’appli pour vérifier.`,
        ``,
        `Ensuite, donne-moi une liste (noms seulement, sans valeurs) des clés à changer dans le tableau de bord de chaque service : toute personne qui a ouvert le site a pu les copier.`,
      ].join('\n'),
    });
  }

  // ---------- tables Supabase que n’importe qui peut lire et modifier ----------
  const utiliseSupabase = analyse.files.some((f) => /(^|\/)supabase\/(migrations\/|config\.toml$|functions\/)/.test(f.path) || constats(f.path).some((x) => x.k === 'uses-supabase'));
  if (utiliseSupabase) {
    const parDepot = new Map(); // dépôt -> [fichier, …] dans l’ordre des chemins (les migrations sont nommées par date)
    for (const f of analyse.files) if (f.lang === 'sql' && horsTest(f.path) && constats(f.path).some((x) => x.k.startsWith('sql-'))) { const k = f.repo ?? ''; if (!parDepot.has(k)) parDepot.set(k, []); parDepot.get(k).push(f.path); }
    for (const [depot, fichiersSql] of parDepot) {
      const tables = new Map(); // table -> { file, line, rls, off }
      const politiques = [];
      for (const p of fichiersSql.sort()) for (const x of constats(p)) {
        const t = tables.get(x.table);
        if (x.k === 'sql-table' && !t) tables.set(x.table, { file: p, line: x.line, rls: null });
        else if (x.k === 'sql-rls' && t) { t.rls = x.on; t.off = x.on ? null : { file: p, line: x.line }; }
        else if (x.k === 'sql-rename' && t) { tables.delete(x.table); tables.set(x.to, t); for (const politique of politiques) if (politique.table === x.table) politique.table = x.to; }
        else if (x.k === 'sql-drop') tables.delete(x.table);
        else if (x.k === 'sql-open-policy') politiques.push({ ...x, file: p });
      }
      const court = (t) => t.replace(/^public\./, '');
      const ouvert = [...tables.entries()].filter(([nom, t]) => nom.startsWith('public.') && t.rls !== true);
      if (ouvert.length) {
        const elements = [], notes = {};
        for (const [nom, t] of ouvert) {
          const elem = elementPour(t.file);
          if (!elem) continue;
          if (!elements.includes(elem)) elements.push(elem);
          notes[elem] = (notes[elem] ? notes[elem] + ' · ' : '') + `ligne ${t.line} : ${court(nom)} (sécurité au niveau des lignes ${t.off ? 'désactivée' : 'jamais activée'})`;
        }
        const liste = ouvert.map(([nom]) => court(nom));
        listeProblemes.push({
          id: 'rls:' + depot, kind: 'database-rules', severity: 'high',
          title: ouvert.length === 1 ? `N’importe qui peut lire et modifier ta table ${liste[0]}` : `N’importe qui peut lire et modifier ${ouvert.length} de tes tables de base de données`,
          detail: `Ton appli parle à Supabase avec une clé publique que le navigateur de chaque visiteur possède. La sécurité au niveau des lignes (RLS) empêche une personne de lire ou de modifier les lignes d’une autre, et elle est désactivée pour ${ouvert.length === 1 ? `la table ${liste[0]}` : `les tables ${liste.slice(0, 6).join(', ')}${liste.length > 6 ? ` et ${liste.length - 6} autres` : ''}`}. Sans elle, n’importe qui peut utiliser cette clé pour lire, modifier ou supprimer chaque ligne${ouvert.length === 1 ? '' : ' de ces tables'}. Si ton appli n’accède à la base que depuis son propre serveur, le risque est plus faible, mais l’activer reste le choix le plus sûr.`,
          items: elements, notes,
          locations: ouvert.map(([, t]) => t.off || { file: t.file, line: t.line }),
          fix: [
            `Correctif de sécurité : tables Supabase sans sécurité au niveau des lignes (RLS). N’affiche aucune clé. Réponds-moi en français, avec des mots simples, en me tutoyant.`,
            ``,
            `Toute personne qui a la clé publique (anon) de l’appli peut lire et modifier ces tables :`,
            ...ouvert.map(([nom, t]) => `- ${nom}: créée dans ${t.file}:${t.line}${t.off ? `, sécurité au niveau des lignes désactivée dans ${t.off.file}:${t.off.line}` : ''}`),
            ``,
            `1. Regarde comment l’appli utilise chaque table : quelles pages la lisent ou y écrivent, et si les lignes appartiennent à un utilisateur (par exemple une colonne user_id qui devrait correspondre à auth.uid()).`,
            `2. Écris une nouvelle migration (ne modifie pas les anciennes) qui exécute \`alter table <table> enable row level security;\` pour chaque table, plus des politiques pour que l’appli continue de fonctionner : en général, les utilisateurs connectés ne peuvent lire et modifier que leurs propres lignes (\`using (auth.uid() = user_id)\`), et les tables faites pour être publiques reçoivent une politique en lecture seule. Le code serveur qui utilise la clé service-role n’est pas touché par ces règles.`,
            `3. Explique-moi les politiques avec des mots simples avant d’appliquer quoi que ce soit, et n’assouplis aucune politique existante.`,
            `4. Dis-moi comment appliquer la migration (par exemple \`supabase db push\`) et comment vérifier, une fois déconnecté, que je ne peux pas lire les lignes des autres.`,
          ].join('\n'),
        });
      }
      const laxistes = politiques.filter((politique) => tables.get(politique.table)?.rls === true);
      if (laxistes.length) {
        const verbe = (commande) => ({ insert: 'ajouter des lignes dans', update: 'modifier des lignes dans', delete: 'supprimer des lignes dans' }[commande] || 'ajouter, modifier et supprimer des lignes dans');
        const lignesDe = (commande, t) => `${verbe(commande)} la table ${t}`;
        const elements = [], notes = {};
        for (const politique of laxistes) {
          const elem = elementPour(politique.file);
          if (!elem) continue;
          if (!elements.includes(elem)) elements.push(elem);
          notes[elem] = (notes[elem] ? notes[elem] + ' · ' : '') + `ligne ${politique.line} : « ${politique.policy} » laisse n’importe qui ${lignesDe(politique.cmd, court(politique.table))}`;
        }
        listeProblemes.push({
          id: 'open-policy:' + depot, kind: 'database-rules', severity: 'medium',
          title: laxistes.length === 1 ? `Une règle de base de données laisse n’importe qui modifier ta table ${court(laxistes[0].table)}` : `${laxistes.length} règles de base de données laissent n’importe qui modifier tes données`,
          detail: `${laxistes.length === 1 ? `La règle « ${laxistes[0].policy} » laisse n’importe qui` : `Ces règles laissent n’importe qui`}${laxistes.some((politique) => politique.signedOut) ? ', même les personnes qui ne sont pas connectées,' : ''} ${laxistes.length === 1 ? lignesDe(laxistes[0].cmd, court(laxistes[0].table)) : `ajouter, modifier ou supprimer des lignes dans ${((tablesLaxistes) => `${tablesLaxistes.length === 1 ? 'la table' : 'les tables'} ${tablesLaxistes.join(', ')}`)([...new Set(laxistes.map((politique) => court(politique.table)))].slice(0, 5))}`}. Si une table sert à un formulaire public (comme une liste d’attente ou un formulaire de contact), laisser n’importe qui ajouter des lignes est acceptable ; sinon, limite l’accès aux utilisateurs connectés et à leurs propres lignes.`,
          items: elements, notes,
          locations: laxistes.map((politique) => ({ file: politique.file, line: politique.line })),
          fix: [
            `Revue de sécurité : politiques de sécurité au niveau des lignes de Supabase qui laissent n’importe qui modifier des données (\`using (true)\` / \`with check (true)\` pour anon ou public) :`,
            ...laxistes.map((politique) => `- « ${politique.policy} » sur ${politique.table} (pour ${politique.cmd}) — ${politique.file}:${politique.line}`),
            ``,
            `Pour chacune, dis-moi avec des mots simples ce qu’elle autorise et si l’appli en a besoin. Si la table n’est pas faite pour être publique, remplace \`true\` par une vérification comme \`auth.uid() = user_id\`, limitée aux utilisateurs authentifiés, dans une nouvelle migration. Si c’est un formulaire public, laisse l’ajout de lignes ouvert, mais assure-toi que personne ne puisse lire, modifier ou supprimer les lignes des autres. Montre-moi la modification avant de l’appliquer. Réponds-moi en français, avec des mots simples, en me tutoyant.`,
          ].join('\n'),
        });
      }
    }
  }

  // ---------- règles de sécurité Firebase qui laissent entrer n’importe qui ----------
  const aujourdhui = new Date();
  const dateLongue = (d) => d.toLocaleDateString('fr-FR', { timeZone: 'UTC', month: 'long', day: 'numeric', year: 'numeric' });
  for (const f of analyse.files) {
    const base = f.path.split('/').pop();
    if (!horsTest(f.path) || !(/\.rules$/i.test(base) || /^database(\.[\w-]+)?\.rules\.json$/i.test(base))) continue;
    let source = '';
    try { source = lireDebut(chemin.join(racine, f.path), 262144); } catch { continue; }
    const rtdb = /\.json$/i.test(base);
    const service = rtdb ? 'Realtime Database' : /service\s+firebase\.storage/.test(source) ? 'Storage' : /service\s+cloud\.firestore/.test(source) ? 'Firestore' : null;
    if (!service) continue;
    const regles = rtdb ? reglesFirebaseRtdb(source, aujourdhui) : reglesFirebase(source, aujourdhui);
    // toute la base de données, ou (Firestore et Storage) toute modification autre que l’ajout de nouveaux enregistrements à un endroit
    const grave = (r) => r.wide || (!rtdb && !r.createOnly);
    const ecritures = regles.filter((r) => r.write && r.open !== 'expired' && grave(r));
    const ecrituresProfondes = regles.filter((r) => r.write && r.open === 'always' && !grave(r));
    const lectures = regles.filter((r) => r.read && !r.write && r.open !== 'expired' && r.wide);
    const jusque = regles.find((r) => r.open === 'until');
    const expiree = regles.find((r) => r.open === 'expired');
    if (!ecritures.length && !ecrituresProfondes.length && !lectures.length && !expiree) continue;
    const fichiers = service === 'Storage';
    const quoi = fichiers ? 'fichiers' : 'données';
    const deploiement = { Firestore: 'firestore:rules', Storage: 'storage', 'Realtime Database': 'database' }[service];
    const montres = [...ecritures, ...ecrituresProfondes, ...lectures, ...(expiree ? [expiree] : [])];
    let titre, detail, gravite;
    if (jusque && ecritures.length) {
      gravite = 'high';
      titre = `Ton Firebase ${service} est ouvert à tout le monde jusqu’au ${dateLongue(jusque.until)}`;
      detail = `${base} contient encore les règles du « mode test » de Firebase : n’importe qui peut lire et modifier ${fichiers ? 'tous les fichiers' : 'tout'} jusqu’au ${dateLongue(jusque.until)}, sans se connecter ni passer par ton appli. Après cette date, toutes les demandes sont refusées et l’appli cesse de fonctionner : remplace ces règles par de vraies règles plutôt que de repousser la date.`;
    } else if (ecritures.length) {
      gravite = 'high';
      titre = fichiers ? 'N’importe qui peut envoyer, remplacer ou supprimer tes fichiers Firebase' : `N’importe qui peut modifier ou supprimer les données de ton Firebase ${service}`;
      detail = `Une règle dans ${base} (ligne ${ecritures[0].line}, sur ${ecritures[0].where}) laisse n’importe qui, connecté ou non, ${fichiers ? 'envoyer, remplacer ou supprimer des fichiers' : 'ajouter, modifier ou supprimer des données'}. Les réglages Firebase de ton appli se trouvent dans le navigateur de chaque visiteur : n’importe qui peut donc s’en servir pour accéder directement à ton ${service}, sans passer par ton appli.`;
    } else if (ecrituresProfondes.length || lectures.length) {
      gravite = 'medium';
      titre = lectures.length && !ecrituresProfondes.length ? `N’importe qui peut tout lire dans ton Firebase ${service}` : `N’importe qui peut modifier une partie de ton Firebase ${service}`;
      detail = [
        lectures.length ? `Une règle dans ${base} (ligne ${lectures[0].line}) laisse n’importe qui lire ${fichiers ? 'chaque fichier' : 'chaque enregistrement'}, y compris des données qui peuvent appartenir à tes utilisateurs. Si tout ce qui s’y trouve est censé être public, ce n’est pas un souci ; sinon, il faut une vérification de connexion.` : '',
        ecrituresProfondes.length ? `Une règle dans ${base} (ligne ${ecrituresProfondes[0].line}) laisse n’importe qui ${ecrituresProfondes[0].createOnly ? 'ajouter des éléments à' : 'modifier'} ${ecrituresProfondes[0].where} sans se connecter. Si c’est un formulaire public (comme une liste d’attente ou un formulaire de contact), ça peut convenir ; sinon, il faut une vérification de connexion.` : '',
      ].filter(Boolean).join(' ');
    } else {
      gravite = 'medium';
      titre = `Les règles en mode test de ton Firebase ${service} ont expiré le ${dateLongue(expiree.until)}`;
      detail = `${base} contient les règles du « mode test » de Firebase, qui ont cessé d’autoriser l’accès le ${dateLongue(expiree.until)}. Toute lecture et toute écriture sont maintenant refusées : les parties de l’appli qui utilisent ${service} ne fonctionneront pas. Remplace-les par de vraies règles plutôt que de repousser la date, ce qui rouvrirait tout à n’importe qui.`;
    }
    const elem = elementPour(f.path);
    listeProblemes.push({
      id: 'firebase-rules:' + f.path, kind: 'database-rules', severity: gravite, title: titre, detail,
      items: elem ? [elem] : [], notes: elem ? { [elem]: montres.slice(0, 4).map((r) => `ligne ${r.line} : ${r.text}`).join(' · ') } : {},
      locations: montres.map((r) => ({ file: f.path, line: r.line })),
      fix: [
        `Correctif de sécurité : règles de sécurité Firebase ${service} dans ${f.path}. Réponds-moi en français, avec des mots simples, en me tutoyant.`,
        ``,
        `Ces règles laissent entrer n’importe qui (ou ont expiré) :`,
        ...montres.map((r) => `- ligne ${r.line} : ${r.text}`),
        ``,
        `1. Regarde comment l’appli utilise chaque ${rtdb ? 'chemin' : fichiers ? 'dossier de stockage' : 'collection'} : ce que chaque écran lit et écrit, et quelles données appartiennent à un utilisateur (par exemple ${fichiers ? 'des fichiers rangés dans un dossier portant l’uid de l’utilisateur' : 'des documents indexés par l’uid de l’utilisateur, ou avec un champ ownerId'}).`,
        `2. Réécris les règles pour que les utilisateurs connectés ne puissent lire et écrire que leurs propres ${quoi} (${rtdb ? 'auth != null && auth.uid === $uid' : fichiers ? 'request.auth != null && request.auth.uid == userId' : 'request.auth != null && request.auth.uid == resource.data.ownerId'}), que le contenu public soit en lecture seule et que tout le reste soit refusé. N’utilise pas de dates de mode test.`,
        `3. Explique-moi les nouvelles règles avec des mots simples et attends mon accord.`,
        `4. Ensuite, déploie-les avec \`firebase deploy --only ${deploiement}\` et vérifie-les dans le Rules Playground de la console Firebase (ou dans l’émulateur) : une personne non connectée ne doit pouvoir lire ni modifier rien de privé.`,
      ].join('\n'),
    });
  }

  // ---------- webhooks Stripe qui ne vérifient pas la signature de Stripe ----------
  const fichiersStripe = new Map(); // fichier -> constat
  for (const f of analyse.files) if (horsTest(f.path)) { const x = constats(f.path).find((y) => y.k === 'stripe-unsigned'); if (x) fichiersStripe.set(f.path, x); }
  for (const [fichier, x] of fichiersStripe) {
    const routesIci = graphe.routes.map((r, i) => ({ r, i })).filter(({ r }) => r.f === fichier && r.m !== 'GET');
    const elem = elementPour(fichier);
    const elements = [...(elem ? [elem] : []), ...routesIci.map(({ i }) => 'r:' + i)];
    const estPython = /\.py$/.test(fichier);
    const suivant = /(^|\/)app\/.*route\.[jt]s$|(^|\/)pages\/api\//.test(fichier);
    listeProblemes.push({
      id: 'stripe-webhook:' + fichier, kind: 'stripe-webhook', severity: 'high',
      title: `N’importe qui pourrait simuler un paiement Stripe dans ${nomDe(fichier)}`,
      detail: `${fichier.split('/').pop()} réagit à des événements Stripe (comme « ${x.events[0]} ») sans vérifier la signature de Stripe : quiconque trouve l’adresse peut envoyer un faux message « paiement réussi » et obtenir gratuitement des commandes, des crédits ou un abonnement. Stripe signe chaque vrai événement ; vérifier cette signature ne demande que quelques lignes.`,
      items: elements, notes: Object.fromEntries(elements.map((id) => [id, id.startsWith('r:') ? 'Reçoit des événements Stripe sans vérifier qu’ils sont réels' : `ligne ${x.line} : traite ${x.events.join(', ')} sans vérifier la signature de Stripe`])),
      locations: [{ file: fichier, line: x.line }],
      fix: [
        `Correctif de sécurité dans ${fichier} : vérifie les signatures des webhooks Stripe avant de réagir à un événement. N’affiche aucune valeur secrète. Réponds-moi en français, avec des mots simples, en me tutoyant.`,
        ``,
        `Il traite ${x.events.join(', ')} (ligne ${x.line}) sans appeler ${estPython ? 'stripe.Webhook.construct_event' : 'stripe.webhooks.constructEvent'}.`,
        ``,
        estPython
          ? `1. Lis le corps brut de la requête en octets (FastAPI : \`await request.body()\` ; Flask : \`request.get_data()\`), pas le JSON déjà analysé.`
          : suivant ? `1. Lis le corps brut de la requête avec \`await req.text()\` (App Router) ou désactive l’analyseur de corps pour cette route (Pages Router), pas le JSON déjà analysé.` : `1. Donne le corps brut à cette route : \`express.raw({ type: 'application/json' })\` sur celle-ci, enregistré avant que \`express.json()\` ne s’exécute pour elle.`,
        estPython
          ? `2. Appelle \`stripe.Webhook.construct_event(payload, request.headers["stripe-signature"], os.environ["STRIPE_WEBHOOK_SECRET"])\` et renvoie 400 s’il lève une erreur.`
          : `2. Appelle \`stripe.webhooks.constructEvent(rawBody, signatureHeader, process.env.STRIPE_WEBHOOK_SECRET)\` (l’en-tête \`stripe-signature\`) et renvoie 400 s’il lève une erreur.`,
        `3. N’utilise ensuite que l’événement vérifié, et traite chaque événement une seule fois même si Stripe le renvoie.`,
        `4. Ajoute STRIPE_WEBHOOK_SECRET (vide) à .env.example et dis-moi où le trouver : le tableau de bord Stripe (Developers → Webhooks → l’adresse du webhook → Signing secret), ou \`stripe listen\` pour tester en local.`,
      ].join('\n'),
    });
  }

  // ---------- serveurs que n’importe quel site web peut appeler (CORS) ----------
  const cors = [];
  for (const f of analyse.files) if (horsTest(f.path)) for (const x of constats(f.path)) if (x.k === 'cors-any') cors.push({ file: f.path, ...x });
  if (cors.length) {
    const avecIdentifiants = cors.filter((c) => c.credentials);
    const fichiersCors = [...new Set(cors.map((c) => c.file))];
    const elements = [], notes = {};
    for (const c of cors) {
      const elem = elementPour(c.file);
      if (!elem) continue;
      if (!elements.includes(elem)) elements.push(elem);
      notes[elem] = (notes[elem] ? notes[elem] + ' · ' : '') + `ligne ${c.line} : ${c.how}${c.credentials ? ', avec cookies de connexion' : ''}`;
    }
    listeProblemes.push({
      id: 'cors', kind: 'cors', severity: avecIdentifiants.length ? 'medium' : 'low',
      title: avecIdentifiants.length ? 'N’importe quel site web pourrait agir à la place de tes utilisateurs connectés' : 'N’importe quel site web peut appeler ton serveur depuis le navigateur d’un visiteur',
      detail: avecIdentifiants.length
        ? `${avecIdentifiants[0].file.split('/').pop()} autorise n’importe quel site web à appeler ce serveur depuis le navigateur d’un visiteur et à envoyer avec l’appel ses cookies de connexion. Un site qu’un utilisateur connecté visite par hasard pourrait donc lire discrètement ses données ou agir à sa place. N’autorise plus que l’adresse de ta propre appli.`
        : `${fichiersCors.length === 1 ? fichiersCors[0].split('/').pop() : `${fichiersCors.length} fichiers`} ${fichiersCors.length === 1 ? 'indique' : 'indiquent'} aux navigateurs que n’importe quel site web peut appeler ce serveur. Ce n’est pas grave pour une API publique qui n’utilise pas de cookies de connexion (par exemple une API qui vérifie un jeton dans l’en-tête Authorization) ; sinon, n’autorise que l’adresse de ta propre appli.`,
      items: elements, notes,
      locations: cors.map((c) => ({ file: c.file, line: c.line })),
      fix: [
        `Revue de sécurité : réglages CORS qui autorisent tous les sites web :`,
        ...cors.map((c) => `- ${c.file}:${c.line}: ${c.how}${c.credentials ? ' (avec identifiants)' : ''}`),
        ``,
        `Dis-moi d’abord avec des mots simples si ce serveur utilise des cookies de connexion ou des sessions, et quels sites web l’appellent légitimement. Remplace ensuite le réglage « tout autoriser » par une liste explicite d’origines autorisées, lue dans une variable d’environnement (par exemple ALLOWED_ORIGINS=https://monappli.com,http://localhost:3000). Ne garde les identifiants que si l’appli se connecte avec des cookies, et ne les combine jamais avec "*" ni avec le renvoi de n’importe quelle origine qui demande. Montre-moi la modification avant de la faire, et ne change rien d’autre. Réponds-moi en français, en me tutoyant.`,
      ].join('\n'),
    });
  }

  // ---------- adresses du serveur que n’importe qui peut appeler ----------
  const constatRoute = new Map(); // `${file}|${line}|${method}` -> constat
  const gardesGlobales = new Map(); // dépôt -> [{framework, name, file}]
  const defsGardes = new Map();    // nom -> [{ file, wrapper }]
  for (const f of analyse.files) for (const x of constats(f.path)) {
    if (x.k === 'route') constatRoute.set(`${f.path}|${x.line}|${x.method}`, x);
    // les contrôles valables pour toute l’appli ne comptent que s’ils viennent de l’appli elle-même, pas de scripts ou de tests qui en montent un à part
    if (x.k === 'global-guard' && !FICHIER_TEST.test(f.path) && !/(^|\/)(scripts?|tools|bin|examples?)\//.test(f.path) && !(fichierParChemin.has(f.path) && natures(fichierParChemin.get(f.path).n).some((k) => TYPES_SANS_USAGE.has(k)))) { const k = f.repo ?? ''; if (!gardesGlobales.has(k)) gardesGlobales.set(k, []); gardesGlobales.get(k).push({ ...x, file: f.path }); }
    if (x.k === 'guard-def' && !FICHIER_TEST.test(f.path)) { if (!defsGardes.has(x.name)) defsGardes.set(x.name, []); defsGardes.get(x.name).push({ file: f.path, wrapper: !!x.wrapper }); }
  }
  const auxiliairesVerifies = new Map();
  for (const f of analyse.files) {
    if (FICHIER_TEST.test(f.path)) continue;
    for (const x of constats(f.path)) {
      if (x.k !== 'py-verified-helper') continue;
      const depot = f.repo ?? '';
      if (!auxiliairesVerifies.has(depot)) auxiliairesVerifies.set(depot, new Map());
      const parNom = auxiliairesVerifies.get(depot);
      if (!parNom.has(x.name)) parNom.set(x.name, []);
      parNom.get(x.name).push(f.path);
    }
  }
  const importsRoutes = new Map();
  const auxiliaireImporte = (fichier, auxiliaire, nom) => {
    if (fichier === auxiliaire) return true;
    let source = importsRoutes.get(fichier);
    if (source === undefined) {
      try { source = fs.readFileSync(chemin.join(racine, fichier), 'utf8'); }
      catch { source = ''; }
      importsRoutes.set(fichier, source);
    }
    const nomModule = auxiliaire.replace(/\.py$/, '').replace(/\//g, '.');
    const moduleEchappe = nomModule.replaceAll('.', '\\.');
    return new RegExp('^\\s*from\\s+' + moduleEchappe + '\\s+import\\s+[^\\n]*\\b' + nom + '\\b', 'm').test(source);
  };
  const gardesAlias = gardesAliasPython(analyse.files.filter((f) => !FICHIER_TEST.test(f.path)), constats);
  for (const [depot, alias] of gardesAlias) for (const [nom, fichier] of alias) {
    if (!defsGardes.has(nom)) defsGardes.set(nom, []);
    defsGardes.get(nom).push({ file: fichier, alias: true, repo: depot });
  }
  // un contrôle de connexion appliqué à l’endroit où le routeur de la route est monté : app.use('/admin', requireStaff, adminRouter),
  // ou app.include_router(admin.router, dependencies=[Depends(require_admin)]) (une session de base de données n’en est pas un)
  const gardeMontage = new Map((analyse.routes || []).filter((r) => r.mountMw?.some(estDepGarde)).map((r) => [`${r.file}|${r.line}|${r.method}`, r.mountMw.find(estDepGarde)]));
  const sourceDe = new Map();
  const lireSource = (p) => {
    if (!sourceDe.has(p)) { let source = ''; try { source = lireDebut(chemin.join(racine, p), 262144); } catch { /* illisible : rien à analyser */ } sourceDe.set(p, source); }
    return sourceDe.get(p);
  };
  const publies = new Map(); // dépôt -> adresses qu’il liste pour les robots d’indexation et les outils d’IA
  for (const f of analyse.files) {
    if (!FICHIER_LISTE.test(f.path) || FICHIER_TEST.test(f.path) || FICHIER_EXEMPLE.test(f.path)) continue;
    const k = f.repo ?? '';
    if (!publies.has(k)) publies.set(k, new Set());
    for (const p of cheminsListes(f.path, lireSource(f.path))) publies.get(k).add(p);
  }
  const estListe = (depot, p) => {
    const listees = publies.get(depot);
    if (!listees) return false;
    if (listees.has(p)) return true;
    if (!/\[\.\.\./.test(p)) return false; // une route fourre-tout couvre ce qui est listé en dessous
    const prefixe = p.split('[')[0];
    return prefixe.length > 1 && [...listees].some((x) => x.startsWith(prefixe));
  };
  const importsDe = new Map();
  for (const l of graphe.links) if (l.a !== l.b && l.a.startsWith('f:') && l.b.startsWith('f:')) { const a = l.a.slice(2); if (!importsDe.has(a)) importsDe.set(a, new Set()); importsDe.get(a).add(l.b.slice(2)); }
  const IMPORT_PROJET = /\bfrom\s+['"](?:\.{1,2}\/|@\/|~\/|#)|\bimport\s*\(\s*['"](?:\.{1,2}\/|@\/|~\/|#)|\brequire\(\s*['"](?:\.{1,2}\/|@\/|~\/|#)/g;
  /** Un fichier de route Next.js dont le code, et tout ce qu’il importe, ne montre aucun stockage de données, aucune session ni aucun secret serveur. */
  const neLitRienDePrive = (fichier, dynamique) => {
    const vus = new Set([fichier]), fileAttente = [fichier];
    while (fileAttente.length) {
      const p = fileAttente.pop();
      const source = lireSource(p);
      if (LIT_PRIVE.test(source) || (dynamique && LIT_FICHIERS.test(source))) return false;
      const suivant = [...(importsDe.get(p) || [])];
      // un import que nous n’avons pas pu suivre pourrait contenir n’importe quoi
      if ((source.match(IMPORT_PROJET) || []).length > suivant.length) return false;
      for (const n of suivant) if (!vus.has(n) && !PAS_SES_DONNEES.test(n)) { vus.add(n); fileAttente.push(n); }
      if (vus.size > 200) return false;
    }
    return true;
  };
  const marquePublic = (fichier) => {
    const source = lireSource(fichier);
    if (REPONSE_PUBLIQUE.test(source) || NEXT_STATIQUE.test(source)) return true;
    return [...(importsDe.get(fichier) || [])].some((p) => { const h = lireSource(p); return REPONSE_PUBLIQUE.test(h) && !REPONSE_PRIVEE.test(h); });
  };
  /** Une adresse du serveur en lecture ouverte exprès : son adresse, la liste propre au projet, sa réponse, ou le fait de n’avoir rien de privé à donner. */
  const publicParConception = (r, constat, depot) => {
    if (r.m !== 'GET') return false;
    if (CHEMIN_FICHIER_PUBLIC.test(r.p) || estListe(depot, r.p) || constat.publicResponse) return true;
    return !!constat.nextGet && (marquePublic(r.f) || neLitRienDePrive(r.f, /\[/.test(r.p)));
  };
  const bilansParDepot = new Map(); // dépôt -> { guarded, open: [], guardCounts }
  graphe.routes.forEach((r, i) => {
    const constat = constatRoute.get(`${r.f}|${r.l}|${r.m}`);
    if (!constat) return; // framework que nous n’analysons pas : ne rien dire
    const fichierGraphe = fichierParChemin.get(r.f);
    if (!fichierGraphe || natures(fichierGraphe.n).some((k) => TYPES_SANS_USAGE.has(k)) || FICHIER_TEST.test(r.f)) return;
    const depot = fichierGraphe.r ?? '';
    if (!bilansParDepot.has(depot)) bilansParDepot.set(depot, { guarded: 0, total: 0, open: [], misplaced: [], guardCounts: new Map(), fileGuards: new Map(), guardedIn: new Map() });
    const bilanDepot = bilansParDepot.get(depot);
    bilanDepot.total++;
    const gardeGlobale = (gardesGlobales.get(depot) || []).find((g) => g.framework === 'flask' || g.framework === 'express' || (g.framework === 'next' && constat.fn === r.m));
    // un décorateur non reconnu qui s’avère être une enveloppe d’authentification définie ailleurs dans le projet
    const viaEnveloppe = !constat.via && constat.decos?.find((d) => defsGardes.get(d)?.some((g) => (g.file.split('/')[0] === r.f.split('/')[0])));
    const monte = !constat.via && gardeMontage.get(`${r.f}|${r.l}|${r.m}`);
    // un paramètre typé avec un alias de dépendance qui vérifie l’appelant : `user: AdminUser`
    const viaAlias = !constat.via && constat.types?.find((t) => gardesAlias.get(depot)?.has(t));
    const viaAuxiliaireSignature = !constat.via && constat.calls?.find((nom) =>
      (auxiliairesVerifies.get(depot)?.get(nom) || []).some((auxiliaire) => auxiliaireImporte(r.f, auxiliaire, nom)));
    if (constat.via || gardeGlobale || viaEnveloppe || monte || viaAlias || viaAuxiliaireSignature) {
      bilanDepot.guarded++; bilanDepot.guardedIn.set(r.f, (bilanDepot.guardedIn.get(r.f) || 0) + 1);
      const nom = constat.guard || viaEnveloppe || monte || viaAlias;
      if (nom) {
        bilanDepot.guardCounts.set(nom, (bilanDepot.guardCounts.get(nom) || 0) + 1);
        if (!bilanDepot.fileGuards.has(r.f)) bilanDepot.fileGuards.set(r.f, new Map());
        bilanDepot.fileGuards.get(r.f).set(nom, (bilanDepot.fileGuards.get(r.f).get(nom) || 0) + 1);
      }
      return;
    }
    if (r.m === 'OPTIONS' || r.m === 'HEAD' || constat.notAllowed) return;
    // récepteurs de webhooks : par l’URL, ou un gestionnaire de type webhook dans un fichier de webhook (pas les adresses d’administration de ce fichier)
    const webhook = (CHEMIN_WEBHOOK.test(r.p) && !ADMIN_WEBHOOK.test(r.p)) || (/webhook|hooks?\//i.test(r.f) && /webhook|hook|notify|event|ingress|pubsub|callback|receive|inbound/i.test(r.h || '') && !/create|list|manage|register|delete|test|setup|sync/i.test((r.h || '') + r.p));
    if (webhook && constat.signed) return;
    // un webhook Stripe qui ne vérifie pas la signature de Stripe a son propre problème, plus précis
    if (fichiersStripe.has(r.f) && (webhook || /stripe|payment|hook/i.test(r.p) || graphe.routes.filter((x) => x.f === r.f && x.m !== 'GET').length === 1)) return;
    if (!webhook && CHEMIN_PUBLIC.test(r.p.replace(/<[^>]*>|\{[^}]*\}|:\w+|\[[^\]]*\]/g, 'x'))) return;
    if (r.p === '/' && r.m === 'GET') return;
    if (!webhook && publicParConception(r, constat, depot)) return;
    const entree = { i, r, fnd: constat, write: !['GET', 'ANY'].includes(r.m), webhook };
    if (constat.misplaced) bilanDepot.misplaced.push(entree); else bilanDepot.open.push(entree);
  });
  for (const [depot, bilanDepot] of bilansParDepot) {
    const premier = (m) => m && [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    // préférer ce que ce fichier utilise déjà, puis le contrôle réel (hors enveloppe) le plus courant du projet
    const indiceGarde = (fichier, langage) => {
      const locale = premier(bilanDepot.fileGuards.get(fichier));
      const nom = locale || premier(new Map([...bilanDepot.guardCounts].filter(([n]) => !defsGardes.get(n)?.every((g) => g.wrapper))));
      if (!nom) return `le contrôle de connexion déjà présent dans le projet (cherche comment les autres adresses protégées vérifient l’utilisateur ; s’il n’y en a aucun, demande-moi avant d’en ajouter un)`;
      const definitions = defsGardes.get(nom) || [];
      const endroit = definitions.find((g) => g.file === fichier) ? 'défini dans ce fichier' : definitions.length ? `défini dans ${definitions[0].file}` : '';
      const comment = definitions.some((g) => g.alias) ? `un paramètre typé ${nom}` : `${langage === 'python' ? '@' : ''}${nom}`;
      return `le même contrôle que ${locale ? 'les autres adresses de ce fichier' : 'les adresses protégées'} utilisent déjà (${comment}${endroit ? ', ' + endroit : ''})`;
    };
    const ligneRoute = (e) => `- ${e.r.m} ${e.r.p} — ${e.r.f}:${e.r.l}${e.fnd.fn && !/^[A-Z]+$/.test(e.fnd.fn) ? ` (${e.fnd.fn})` : ''}`;
    if (bilanDepot.misplaced.length) {
      const liste = bilanDepot.misplaced;
      listeProblemes.push({
        id: 'misplaced-guard:' + depot, kind: 'unprotected-endpoint', severity: 'high',
        title: 'Un contrôle de connexion est au mauvais endroit, donc il ne sert à rien',
        detail: `Sur ${pluriel(liste.length, 'adresse du serveur', 'adresses du serveur')}, le contrôle de connexion (@${liste[0].fnd.misplaced}) est écrit au-dessus de la ligne de route au lieu d’en dessous. Flask ne voit que ce qui est en dessous : ${liste.length === 1 ? 'elle est ouverte' : 'elles sont ouvertes'} à tout le monde alors que ${liste.length === 1 ? 'elle semble protégée' : 'elles semblent protégées'}.`,
        items: liste.slice(0, 24).map((e) => 'r:' + e.i),
        notes: Object.fromEntries(liste.slice(0, 24).map((e) => ['r:' + e.i, `@${e.fnd.misplaced} est au-dessus de la ligne de route : il est ignoré`])),
        locations: liste.map((e) => ({ file: e.r.f, line: e.r.l })),
        fix: [`Correctif de sécurité : ces adresses du serveur ont leur décorateur d’authentification au-dessus du décorateur de route, donc le framework enregistre la fonction non protégée :`, ...liste.map(ligneRoute), ``, `Place chaque décorateur d’authentification juste en dessous de la ligne @…route(...) (d’abord le décorateur de route, puis celui d’authentification, puis def). Ne change rien d’autre, puis lance les tests qui couvrent ces adresses du serveur. Réponds-moi en français, avec des mots simples, en me tutoyant.`].join('\n'),
      });
    }
    if (!bilanDepot.open.length) continue;
    // Rien dans ce dépôt ne vérifie l’appelant : probablement protégé ailleurs (passerelle, réseau privé), ou pas du tout.
    if (bilanDepot.guarded === 0) {
      const liste = bilanDepot.open.sort((a, b) => b.write - a.write);
      listeProblemes.push({
        id: 'no-auth:' + depot, kind: 'unprotected-endpoint', severity: 'medium',
        title: `Aucune des adresses du serveur ${depot ? `de ${depot}` : 'de ton appli'} ne vérifie qui appelle`,
        detail: `${pluriel(liste.length, 'adresse du serveur', 'adresses du serveur')} ${liste.length === 1 ? 'répond' : 'répondent'} à toute personne qui en connaît l’adresse, sans aucun contrôle de connexion dans le code. Ce n’est acceptable que si ce serveur est privé (par exemple derrière un réseau d’entreprise ou une passerelle qui vérifie les connexions) ; sinon, n’importe qui pourrait lire ou modifier ses données.`,
        items: liste.slice(0, 24).map((e) => 'r:' + e.i),
        notes: Object.fromEntries(liste.slice(0, 24).map((e) => ['r:' + e.i, e.write ? 'Modifie des données, sans contrôle de connexion' : 'Aucun contrôle de connexion'])),
        locations: liste.map((e) => ({ file: e.r.f, line: e.r.l })),
        fix: [`Revois le contrôle d’accès${depot ? ` dans ${depot}` : ''}. Aucune de ces adresses du serveur ne vérifie l’appelant dans le code :`, ...liste.slice(0, 40).map(ligneRoute), liste.length > 40 ? `- …et ${liste.length - 40} autres` : null, ``, `Dis-moi d’abord avec des mots simples si ce serveur est accessible depuis internet et si quelque chose devant lui (passerelle, règles réseau) vérifie les connexions. S’il est public, propose le moyen sûr le plus simple d’exiger une connexion d’abord pour les adresses qui modifient des données (POST/PUT/PATCH/DELETE), montre-moi le plan et attends mon accord avant de changer le code. Réponds-moi en français, en me tutoyant.`].filter((x) => x !== null).join('\n'),
      });
      continue;
    }
    // Un problème par fichier de route
    const parFichier = new Map();
    for (const e of bilanDepot.open) { if (!parFichier.has(e.r.f)) parFichier.set(e.r.f, []); parFichier.get(e.r.f).push(e); }
    for (const [fichier, liste] of parFichier) {
      liste.sort((a, b) => b.write - a.write || a.r.l - b.r.l);
      const ecritures = liste.filter((e) => e.write && !e.webhook), webhooks = liste.filter((e) => e.webhook), lectures = liste.filter((e) => !e.write && !e.webhook);
      // beaucoup de fournisseurs ne peuvent pas du tout signer leurs webhooks : un webhook non signé seul reste de gravité faible
      const grav = ecritures.length ? 'high' : lectures.length > 2 ? 'medium' : 'low';
      const langage = analyseParChemin.get(fichier)?.lang;
      const gardesDansFichier = bilanDepot.guardedIn.get(fichier) || 0;
      const nombreAvec = (n, seul, nombreux) => `${n} ${n === 1 ? seul : nombreux}`;
      const parties = [];
      if (ecritures.length) parties.push(nombreAvec(ecritures.length, 'adresse du serveur qui modifie des données (création, modification ou suppression)', 'adresses du serveur qui modifient des données (création, modification ou suppression)'));
      if (lectures.length) parties.push(nombreAvec(lectures.length, 'adresse du serveur qui renvoie des données', 'adresses du serveur qui renvoient des données'));
      const nOuverts = ecritures.length + lectures.length;
      const texteWebhooks = webhooks.length ? `${nombreAvec(webhooks.length, 'webhook (un message automatique d’un autre service) est', 'webhooks (des messages automatiques d’un autre service) sont')} ${webhooks.length === 1 ? 'accepté' : 'acceptés'} sans vérifier ${webhooks.length === 1 ? 'qu’il vient' : 'qu’ils viennent'} bien de ce service : n’importe qui pourrait donc en envoyer de faux. Certains fournisseurs ne savent pas signer leurs messages ; dans ce cas, c’est normal.` : '';
      listeProblemes.push({
        id: 'open-endpoints:' + fichier, kind: 'unprotected-endpoint', severity: grav,
        title: ecritures.length ? `N’importe qui pourrait modifier des données via ${nomDe(fichier)}` : webhooks.length ? `N’importe qui pourrait envoyer de faux événements à ${nomDe(fichier)}` : `N’importe qui pourrait lire des données depuis ${nomDe(fichier)}`,
        detail: [
          parties.length ? `${fichier.split('/').pop()} contient ${parties.join(' et ')} sans contrôle de connexion : quiconque en trouve l’adresse peut s’en servir${gardesDansFichier > 0 ? ` (${nombreAvec(gardesDansFichier, 'autre adresse du serveur', 'autres adresses du serveur')} du même fichier ${gardesDansFichier === 1 ? 'est protégée' : 'sont protégées'})` : ''}. ${nOuverts === 1 ? 'Si elle est censée être publique' : 'Si certaines sont censées être publiques'}, ce n’est pas un souci ; sinon, ${nOuverts === 1 ? 'elle a besoin' : 'elles ont besoin'} d’un contrôle de connexion.` : '',
          parties.length && webhooks.length ? `Il accepte aussi ${nombreAvec(webhooks.length, 'webhook', 'webhooks')} sans vérifier qui ${webhooks.length === 1 ? 'l’a envoyé' : 'les a envoyés'}.` : texteWebhooks,
        ].filter(Boolean).join(' '),
        items: liste.slice(0, 24).map((e) => 'r:' + e.i),
        notes: Object.fromEntries(liste.slice(0, 24).map((e) => ['r:' + e.i, e.webhook ? 'Webhook sans vérification de signature visible' : e.write ? 'Modifie des données, sans contrôle de connexion' : 'Renvoie des données, sans contrôle de connexion'])),
        locations: liste.map((e) => ({ file: e.r.f, line: e.r.l })),
        fix: [
          `Correctif de sécurité dans ${fichier} : ces adresses du serveur ne vérifient pas qui appelle :`,
          ...liste.map((e) => ligneRoute(e) + (e.webhook ? ' [webhook]' : '')),
          ``,
          `Pour chaque adresse du serveur qui n’est pas censée être publique, ajoute ${indiceGarde(fichier, langage)}.`,
          webhooks.length ? `Pour les webhooks, vérifie la signature du fournisseur (avec son secret de signature, lu dans une variable d’environnement) avant de faire quoi que ce soit, et rejette les requêtes qui échouent.` : null,
          `Si une adresse du serveur est publique exprès (par exemple une page publique ou un contrôle de santé), laisse-la telle quelle et dis-moi pourquoi. Ne change rien d’autre ; ensuite, liste précisément les adresses du serveur que tu as protégées et lance les tests concernés. Réponds-moi en français, avec des mots simples, en me tutoyant.`,
        ].filter((x) => x !== null).join('\n'),
      });
    }
  }

  // ---------- fichiers inutilisés ----------
  const entrants = new Set();
  for (const l of graphe.links) if (l.a !== l.b && l.b.startsWith('f:')) entrants.add(l.b.slice(2));
  const entree = new Set(graphe.projet?.entrypoints || []);
  const fichiersRoutes = new Set(graphe.routes.map((r) => r.f));
  for (const parc of graphe.parcours || []) for (const s of parc.steps || []) if (s.ref?.startsWith('f:')) entree.add(s.ref.slice(2));
  const candidats = graphe.files.filter((f) => {
    if (entrants.has(f.p) || entree.has(f.p) || fichiersRoutes.has(f.p) || !LANGAGES_UTILISES.has(f.l)) return false;
    if (FICHIER_TEST.test(f.p) || FICHIER_SPECIAL.test(f.p) || /(^|\/)app\/.*\/(page|layout|route|loading|error|template|default)\.[jt]sx?$/.test(f.p)) return false;
    if (/(^|\/)src\/routes\//.test(f.p) && /\+|\$|\[/.test(f.p.split('/').pop())) return false;
    if (natures(f.n).some((k) => TYPES_SANS_USAGE.has(k))) return false;
    if (constats(f.p).some((x) => x.k === 'runnable' || x.k === 'route')) return false;
    return true;
  });
  // Filet de sécurité pour le chargement dynamique : ignorer un fichier dont le nom apparaît dans un autre fichier source.
  if (candidats.length) {
    const voulus = new Map(candidats.map((f) => [radicalDe(f.p), f.p]));
    const mentionnes = new Set();
    for (const f of analyse.files) {
      if (!['code', 'config', 'docs'].includes(f.category) || f.tooLarge) continue;
      let source;
      try { source = fs.readFileSync(chemin.join(racine, f.path), 'utf8'); } catch { continue; }
      for (const jeton of new Set(source.match(/[\w$-]+/g) || [])) { const p = voulus.get(jeton); if (p && p !== f.path) mentionnes.add(p); }
    }
    const inutilises = candidats.filter((f) => !mentionnes.has(f.p) && !CHARGE_PAR_NOM.test(lireSource(f.p).split('\n', 20).join('\n')));
    // Un module dont la plupart des fichiers semblent inutilisés est plus probablement chargé d’une façon que nous ne voyons pas ; ne rien dire.
    const parNoeud = new Map();
    for (const f of inutilises) { if (!parNoeud.has(f.n)) parNoeud.set(f.n, []); parNoeud.get(f.n).push(f); }
    const groupes = [...parNoeud.entries()].filter(([n, liste]) => { const total = graphe.files.filter((f) => f.n === n).length; return n === 'unassigned' || liste.length <= 3 || liste.length / total <= 0.6; }).sort((a, b) => b[1].length - a[1].length);
    const MAX = 5;
    const fusionnes = groupes.length > MAX ? [...groupes.slice(0, MAX - 1), ['', groupes.slice(MAX - 1).flatMap(([, l]) => l)]] : groupes;
    for (const [idNoeud, liste] of fusionnes) {
      liste.sort((a, b) => b.loc - a.loc);
      const endroit = idNoeud ? etiquette(idNoeud) : 'les autres parties';
      const lignes = liste.reduce((s, f) => s + f.loc, 0);
      listeProblemes.push({
        id: 'unused:' + (idNoeud || 'other'), kind: 'unused-file', severity: 'low',
        title: liste.length === 1 ? `Un fichier dans ${endroit} semble inutilisé` : `${liste.length} fichiers dans ${endroit} semblent inutilisés`,
        detail: `Rien dans l’appli n’importe ni n’appelle ${liste.length === 1 ? 'ce fichier' : 'ces fichiers'} (${lignes.toLocaleString('fr-FR')} lignes). Le code oublié trouble les assistants IA, qui risquent de modifier ou de copier la mauvaise version. Revérifie avant de supprimer : certains fichiers sont chargés d’une façon que la carte ne peut pas voir.`,
        items: liste.slice(0, 24).map((f) => 'f:' + f.p),
        notes: Object.fromEntries(liste.slice(0, 24).map((f) => ['f:' + f.p, `Rien n’utilise ce fichier (${f.loc.toLocaleString('fr-FR')} lignes)`])),
        locations: liste.map((f) => ({ file: f.p, line: 1 })),
        fix: [`Vérification de ménage : ces fichiers semblent inutilisés (rien ne les importe ni ne les appelle) :`, ...liste.slice(0, 40).map((f) => `- ${f.p}`), liste.length > 40 ? `- …et ${liste.length - 40} autres` : null, ``, `Pour chaque fichier, cherche dans le code (y compris les configs, les scripts, les gabarits HTML et les imports dynamiques) pour confirmer que rien ne l’utilise. Dis-moi ensuite lesquels peuvent être supprimés sans risque et lesquels sont en fait utilisés, avec une ligne de preuve pour chacun. Ne supprime rien avant que je confirme. Réponds-moi en français, avec des mots simples, en me tutoyant.`].filter((x) => x !== null).join('\n'),
      });
    }
  }

  // ---------- fichiers très volumineux ----------
  const gros = graphe.files.filter((f) => f.loc > 1000 && LANGAGES_UTILISES.has(f.l) && !FICHIER_TEST.test(f.p) && !/(^|\/)(migrations|alembic|versions|fixtures?|seeds?|generated|__generated__)\//i.test(f.p) && !/\.d\.ts$/.test(f.p)).sort((a, b) => b.loc - a.loc);
  if (gros.length) {
    const enorme = gros.filter((f) => f.loc >= 2000);
    listeProblemes.push({
      id: 'large-files', kind: 'large-file', severity: enorme.length ? 'medium' : 'low',
      title: gros.length === 1 ? 'Un fichier est très volumineux' : `${gros.length} fichiers sont très volumineux`,
      detail: `${gros.length === 1 ? 'Ce fichier compte' : 'Ces fichiers comptent chacun'} plus de 1 000 lignes${enorme.length ? ` (le plus gros en compte ${gros[0].loc.toLocaleString('fr-FR')})` : ''}. Les assistants IA lisent et modifient moins bien les gros fichiers : ils perdent le fil de ce qui se trouve où et peuvent casser une partie en en réparant une autre. Les découper en fichiers plus petits, un par rôle, rend les prochaines modifications plus sûres.`,
      items: gros.slice(0, 24).map((f) => 'f:' + f.p),
      notes: Object.fromEntries(gros.slice(0, 24).map((f) => ['f:' + f.p, `${f.loc.toLocaleString('fr-FR')} lignes${f.tooLarge ? ' : trop gros pour que la carte le lise, donc ses liens et les secrets qu’il contient n’ont pas été vérifiés' : ''}`])),
      locations: gros.map((f) => ({ file: f.p, line: 1 })),
      fix: [`Plan de refonte : ces fichiers sont très volumineux :`, ...gros.slice(0, 15).map((f) => `- ${f.p} (${f.loc.toLocaleString('fr-FR')} lignes)`), ``, `Commence par ${gros[0].p}. Lis-le et propose comment le découper en fichiers plus petits, chacun avec un rôle clair (par exemple par fonctionnalité ou par type de travail), en gardant les mêmes noms de fonctions publiques et le même comportement. Montre-moi d’abord le plan. Après mon accord, déplace le code par petites étapes, mets à jour les imports et lance les tests après chaque étape. Ne change pas le comportement. Réponds-moi en français, avec des mots simples, en me tutoyant.`].join('\n'),
    });
  }

  // ---------- frontend écrit en dur vers localhost ----------
  const locale = [];
  for (const f of graphe.files) if (estFrontal(f.p)) for (const x of constats(f.p)) if (x.k === 'localhost') locale.push({ file: f.p, line: x.line });
  if (locale.length) {
    const fichiersLocal = [...new Set(locale.map((x) => x.file))];
    listeProblemes.push({
      id: 'localhost-url', kind: 'hardcoded-url', severity: 'low',
      title: 'L’appli pointe vers l’adresse de ton propre ordinateur',
      detail: `${fichiersLocal.length === 1 ? 'Un fichier de frontend appelle' : `${fichiersLocal.length} fichiers de frontend appellent`} une adresse « localhost » fixe. Cela ne marche que sur ton ordinateur ; une fois l’appli en ligne, ces appels échoueront pour tout le monde.`,
      items: fichiersLocal.slice(0, 24).map((p) => 'f:' + p),
      notes: Object.fromEntries(fichiersLocal.slice(0, 24).map((p) => ['f:' + p, `adresse localhost, ligne(s) ${locale.filter((x) => x.file === p).map((x) => x.line).join(', ')}`])),
      locations: locale,
      fix: [`Ces lignes de frontend utilisent une URL localhost écrite en dur :`, ...locale.map((x) => `- ${x.file}:${x.line}`), ``, `Remplace chacune par le réglage d’URL de base de l’API qui existe déjà dans le projet (ou ajoutes-en un, lu dans une variable d’environnement publique comme NEXT_PUBLIC_API_URL / VITE_API_URL, avec la valeur localhost seulement dans .env.development). Ne change rien d’autre. Réponds-moi en français, avec des mots simples, en me tutoyant.`].join('\n'),
    });
  }

  // un même fichier manquant dont beaucoup se servent : une seule alerte, qui dit la vraie cause et ne prend pas la place des autres
  const parFichierManquant = new Map();
  for (const c of analyse.casses || []) {
    if (c.kind !== 'fichier' || !c.chemin || !fichierParChemin.has(c.from)) continue;
    if (!parFichierManquant.has(c.chemin)) parFichierManquant.set(c.chemin, []);
    parFichierManquant.get(c.chemin).push(c);
  }
  const regroupes = new Set();
  for (const [chemin, liste] of parFichierManquant) {
    const fichiers = [...new Set(liste.map((c) => c.from))];
    if (fichiers.length < 3) continue;
    liste.forEach((c) => regroupes.add(c));
    const nom = chemin.split('/').pop();
    const items = fichiers.map((p) => 'f:' + p);
    listeProblemes.push({
      id: 'lien-casse:manquant:' + chemin, kind: 'lien-casse', severity: 'high',
      title: `${nom} n’existe plus : ${fichiers.length} fichiers s’en servent`,
      detail: `${fichiers.length} fichiers cherchent ${chemin}, qui n’existe plus (par exemple ${fichiers.slice(0, 3).map(nomDe).join(', ')}). Ces parties de l’appli risquent de ne plus marcher.`,
      items, notes: Object.fromEntries(items.map((i) => [i, liste.find((c) => 'f:' + c.from === i).target])),
      locations: liste.slice(0, 40).map((c) => ({ file: c.from, line: c.line })),
      fix: [`${chemin} n’existe plus, et ${fichiers.length} fichiers s’en servent, par exemple :`, ...fichiers.slice(0, 20).map((p) => `- ${p}`), ``, `Trouve s’il a été renommé, déplacé ou supprimé, puis répare ces liens sans changer ce que fait le code.`],
    });
  }
  const parFichierCoupe = new Map();
  for (const c of analyse.casses || []) {
    if (!fichierParChemin.has(c.from) || regroupes.has(c)) continue;
    if (!parFichierCoupe.has(c.from)) parFichierCoupe.set(c.from, []);
    parFichierCoupe.get(c.from).push(c);
  }
  const phraseCoupure = (c) => c.kind === 'fichier' ? `cherche ${c.target} (ligne ${c.line}), qui n’existe plus`
    : c.kind === 'fonction' ? `utilise ${c.target} de ${c.to} (ligne ${c.line}), qui n’y est plus`
    : c.mauvaiseMethode ? `appelle ${c.target} (ligne ${c.line}), mais le serveur ne répond pas à cette méthode`
    : `appelle ${c.target} (ligne ${c.line}), une adresse que le serveur n’a pas`;
  for (const [p, liste] of parFichierCoupe) {
    const elem = 'f:' + p;
    listeProblemes.push({
      id: 'lien-casse:' + p, kind: 'lien-casse', severity: 'high',
      title: liste.length === 1 ? `Un lien est coupé dans ${nomDe(p)}` : `${liste.length} liens sont coupés dans ${nomDe(p)}`,
      detail: `${nomDe(p)} (${p}) ${liste.map(phraseCoupure).join(' ; ')}. Cette partie de l’appli risque de ne plus marcher.`,
      items: [elem], notes: { [elem]: liste.map((c) => c.target).join(', ') },
      locations: liste.map((c) => ({ file: p, line: c.line })),
      fix: [`Des liens sont coupés dans ${p} :`, ...liste.map((c) => `- ${phraseCoupure(c)}`), ``, `Trouve ce qui a été renommé, déplacé ou supprimé, puis répare ces liens sans changer ce que fait le code. Réponds-moi en français, en me tutoyant, en langage simple.`],
    });
  }

  const ORDRE_TYPES = ['lien-casse', 'secret', 'public-env-secret', 'database-rules', 'stripe-webhook', 'env-file', 'unprotected-endpoint', 'cors', 'large-file', 'hardcoded-url', 'unused-file'];
  listeProblemes.sort((a, b) => ORDRE_GRAVITE[a.severity] - ORDRE_GRAVITE[b.severity] || ORDRE_TYPES.indexOf(a.kind) - ORDRE_TYPES.indexOf(b.kind) || (b.locations?.length || 0) - (a.locations?.length || 0));
  const retenus = listeProblemes.slice(0, 40);
  const resume = { high: 0, medium: 0, low: 0 };
  for (const i of retenus) resume[i.severity]++;
  return { summary: resume, problemes: retenus };
}

// ---------- « pas un problème » : problèmes que des personnes ont écartés du panneau Santé ----------
// serveur.mjs les enregistre dans la-carte/sources/rejets-sante.json sous la forme { dismissed: [{ id, locations: ['fichier:ligne'], reason, at }] }.
// Un rejet couvre le problème tel qu’il était : il réapparaît s’il devient plus ou moins grave, ou s’il trouve quelque chose de nouveau
// dans un fichier. Il compte par fichier, pas par ligne : une modification plus haut dans le fichier ne le fait pas revenir.
// (assets/ui/20-sante.js a la même règle pour la page.)
export function rejetPour(probleme, liste) {
  const d = (liste || []).find((x) => x && x.id === probleme.id);
  if (!d || (d.severity && d.severity !== probleme.severity)) return null;
  const restants = new Map();
  for (const empl of d.locations || []) { const f = String(empl).replace(/:[^:]*$/, ''); restants.set(f, (restants.get(f) || 0) + 1); }
  for (const l of probleme.locations || []) { const n = restants.get(l.file) || 0; if (!n) return null; restants.set(l.file, n - 1); }
  return d;
}
/** Intègre une liste de rejets dans un résultat de santé déjà construit : garde la liste et recompte le résumé sans eux. */
export function avecRejets(bilan, liste) {
  const rejetes = (Array.isArray(liste) ? liste : []).filter((x) => x && typeof x.id === 'string');
  const resume = { high: 0, medium: 0, low: 0 };
  for (const i of bilan.problemes) if (!rejetPour(i, rejetes)) resume[i.severity]++;
  return { ...bilan, summary: resume, ...(rejetes.length ? { dismissed: rejetes } : {}) };
}

/** Mode test, dans les règles Firestore/Storage (request.time < timestamp.date(Y, M, D)) ou Realtime Database (now < ms). */
const finModeTest = (condition) => {
  const d = /^request\.time\s*<\s*timestamp\.date\(\s*(\d{4})\s*,\s*(\d{1,2})\s*,\s*(\d{1,2})\s*\)$/.exec(condition);
  if (d) return new Date(Date.UTC(+d[1], +d[2] - 1, +d[3]));
  const ms = /^now\s*<\s*(\d{12,14})$/.exec(condition);
  return ms ? new Date(+ms[1]) : null;
};

/** Règles Firestore / Storage qui laissent entrer n’importe qui : `allow …: if true`, `allow …;` (sans condition) et mode test. */
function reglesFirebase(source, maintenant) {
  const s = source.replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length));
  const ligneDe = indexLignes(s);
  const correspondances = [...s.matchAll(/\bmatch\s+(\/\S*)\s*\{/g)].map((m) => ({ i: m.index, path: m[1] }));
  const sortie = [];
  for (const m of s.matchAll(/\ballow\s+([a-z][a-z,\s]*?)\s*(?::\s*if\s+([^;]+?))?\s*;/g)) {
    const operations = m[1].split(/[\s,]+/).filter(Boolean);
    const condition = (m[2] || 'true').trim().replace(/\s+/g, ' ');
    const fin = condition === 'true' ? null : finModeTest(condition);
    if (condition !== 'true' && !fin) continue;
    const endroit = correspondances.filter((x) => x.i < m.index).pop()?.path || '/';
    const operationsEcriture = operations.filter((o) => /^(write|create|update|delete)$/.test(o));
    sortie.push({
      line: ligneDe(m.index), text: `allow ${operations.join(', ')}${m[2] ? `: if ${condition}` : ' (sans condition)'} à ${endroit}`,
      read: operations.some((o) => /^(read|get|list)$/.test(o)), write: operationsEcriture.length > 0, createOnly: operationsEcriture.length > 0 && operationsEcriture.every((o) => o === 'create'),
      open: !fin ? 'always' : fin > maintenant ? 'until' : 'expired', until: fin, where: endroit,
      wide: /=\*\*\}/.test(endroit) || /\/documents$/.test(endroit) || endroit === '/',
    });
  }
  return sortie;
}

/** Règles Realtime Database (database.rules.json) avec ".read" / ".write" à true ou en mode test. */
function reglesFirebaseRtdb(source, maintenant) {
  const s = source.replace(/(^|[^:"])\/\/[^\n]*/g, (m, avant) => avant + ' '.repeat(m.length - avant.length));
  const ligneDe = indexLignes(s);
  const sortie = [];
  for (const m of s.matchAll(/"\.(read|write)"\s*:\s*(true\b|"([^"]*)")/g)) {
    const condition = m[2] === 'true' ? 'true' : (m[3] || '').trim();
    const fin = condition === 'true' ? null : finModeTest(condition);
    if (condition !== 'true' && !fin) continue;
    // à quelle profondeur il se trouve : { "rules": { ".read": … } } couvre toute la base de données
    let profondeur = 0;
    for (let i = 0; i < m.index; i++) { if (s[i] === '{') profondeur++; else if (s[i] === '}') profondeur--; }
    const cles = [...s.slice(0, m.index).matchAll(/"([^".][^"]*)"\s*:\s*\{/g)].map((k) => k[1]);
    const endroit = profondeur <= 2 ? 'toute la base de données' : '/' + cles.slice(-(profondeur - 2)).join('/');
    sortie.push({
      line: ligneDe(m.index), text: `"${m[1] === 'read' ? '.read' : '.write'}": ${m[2]} pour ${endroit}`,
      read: m[1] === 'read', write: m[1] === 'write', createOnly: false,
      open: !fin ? 'always' : fin > maintenant ? 'until' : 'expired', until: fin, where: endroit, wide: profondeur <= 2, root: profondeur <= 2,
    });
  }
  return sortie;
}

function lireDebut(fichier, maxi) {
  const descripteur = fs.openSync(fichier, 'r');
  try { const tampon = Buffer.alloc(maxi); const n = fs.readSync(descripteur, tampon, 0, maxi, 0); return tampon.subarray(0, n).toString('utf8'); } finally { fs.closeSync(descripteur); }
}
function radicalDe(p) {
  const base = p.split('/').pop().replace(/\.[^.]+$/, '');
  return base === 'index' ? p.split('/').slice(-2, -1)[0] : base;
}
