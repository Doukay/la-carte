const G = window.LA_CARTE;
// qui répond aux questions et reçoit les demandes « Corriger avec … » : la ligne de commande que lance le serveur de la carte, sinon l'agent qui a construit la carte
const AGENT = (window.LA_CARTE_SERVER?.engine || window.LA_CARTE_SERVER?.want || G.meta.agent) === 'codex'
  ? { id: 'codex', name: 'Codex', app: 'Codex', cli: 'Codex', docs: 'https://developers.openai.com/codex',
      signIn: 'Ouvre l\'application Codex (ou lance <code>codex login</code> dans un terminal) pour te connecter, puis pose ta question à nouveau.' }
  : { id: 'claude', name: 'Claude', app: 'Claude Code', cli: 'Claude Code en ligne de commande', docs: 'https://docs.claude.com/en/docs/claude-code/overview',
      signIn: 'Lance <code>claude</code> une fois dans un terminal pour te connecter, puis pose ta question à nouveau.' };
const Maj = (t) => t[0].toUpperCase() + t.slice(1);
if (!G) { document.body.innerHTML = '<p style="padding:2rem">Aucune donnée. Lance construire.mjs.</p>'; return; }
// un plan : prévu à partir d'un cahier des charges, donc ses fichiers n'existent pas encore (pas de nombre de lignes, rien à ouvrir dans un éditeur)
const PLAN = !!G.meta.ebauche;
const requeteTelephone = matchMedia('(max-width: 700px)');
const estTelephone = () => requeteTelephone.matches;
const petitEcran = () => matchMedia('(max-width: 999px)').matches; // tablette comprise : à cette largeur, le panneau ouvert écraserait la carte
// une copie exportée (serveur.mjs --export, ou le bouton Exporter) : en lecture seule, pour les personnes sans Claude ni Codex
const COPIE_EXPORTEE = G.meta.exported || null;
if (typeof ELK === 'undefined') { document.body.innerHTML = '<p style="padding:2rem">Impossible de charger le moteur de mise en page ELK. Reconstruis la carte avec construire.mjs.</p>'; return; }

const NS = 'http://www.w3.org/2000/svg';
const $ = (s) => document.querySelector(s);
const svg = $('#svg'), vp = $('#viewport'), panneau = $('#panel');
const elk = new ELK();
const TYPES_CONNEXION = ['import', 'http', 'call', 'rpc', 'event', 'queue', 'data', 'config'];
// noms des connexions : simples par défaut, termes de développeur quand « Afficher le détail technique » est activé
const TYPE_TECHNIQUE = { contains: 'Contient', import: 'Importe', http: 'HTTP', call: 'Appelle', rpc: 'RPC', event: 'Événements', queue: 'Files d\'attente', data: 'Données', config: 'Configuration' };
const TYPE_SIMPLE = { contains: 'Contient', import: 'Utilise', http: 'Appels au serveur', call: 'Appelle', rpc: 'Appelle', event: 'Événements', queue: 'Tâches de fond', data: 'Lit et écrit des données', config: 'Réglages' };
const LIBELLE_TYPE = new Proxy({}, { get: (_, k) => (modeTechnique() ? TYPE_TECHNIQUE : TYPE_SIMPLE)[k] || k });
let drapeauTechnique = false;
// noms des types affichés à la place des mots techniques de la carte (un type inconnu s'affiche tel quel)
const NOMS_GENRES = { ui: 'interface', service: 'service', worker: 'tâche de fond', library: 'bibliothèque', feature: 'fonctionnalité', data: 'données', config: 'configuration', test: 'test', script: 'script', infra: 'infrastructure', external: 'service extérieur', misc: 'divers', dir: 'dossier', file: 'fichier', module: 'module', route: 'adresse du serveur', endpoint: 'adresse du serveur', function: 'fonction', class: 'classe', symbol: 'symbole' };
const nomGenre = (k) => NOMS_GENRES[k] || k;
const modeTechnique = () => drapeauTechnique;
const METHODES = { GET: 1, POST: 1, PUT: 1, PATCH: 1, DELETE: 1, CALL: 1 };
const stockageLocal = { get(k, d) { try { return JSON.parse(localStorage.getItem('la-carte:' + k) ?? localStorage.getItem('show-code:' + k)) ?? d; } catch { return d; } }, set(k, v) { try { localStorage.setItem('la-carte:' + k, JSON.stringify(v)); } catch {} } };
const h = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const formaterNombre = (n) => n >= 10000 ? Math.round(n / 1000) + ' k' : n >= 1000 ? (n / 1000).toFixed(1).replace('.', ',') + ' k' : String(n);
const nomDossier = (p) => p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '';
const borner = (v, a, b) => Math.max(a, Math.min(b, v));
const accorder = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
function el(balise, attrs = {}, parent) {
  const e = document.createElementNS(NS, balise);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
}

// ---------- pictogrammes ----------
const P = {
  ui: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  service: '<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/>',
  worker: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  library: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
  feature: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
  data: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  config: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  test: '<path d="M9 3h6M10 3v6L4.5 19a1.5 1.5 0 0 0 1.3 2h12.4a1.5 1.5 0 0 0 1.3-2L14 9V3"/><path d="M7 15h10"/>',
  script: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 3 3-3 3M13 15h4"/>',
  infra: '<path d="M7 18h10a4 4 0 0 0 .5-8 6 6 0 0 0-11.5 1.5A3.5 3.5 0 0 0 7 18z"/>',
  external: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.5 5.7 3.5 9s-1 6.3-3.5 9c-2.5-2.7-3.5-5.7-3.5-9s1-6.3 3.5-9z"/>',
  misc: '<circle cx="12" cy="12" r="8" stroke-dasharray="3 3"/>',
  dir: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M10 13l-2 2 2 2M14 13l2 2-2 2"/>',
  module: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
  function: '<path d="M10 20c2 0 2.5-1.5 3-4l2-9c.5-2.5 1-4 3-4M8 10h8"/>',
  class: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M14.5 9.5a3.5 3.5 0 1 0 0 5"/>',
  route: '<path d="M4 12h12M12 6l6 6-6 6"/><path d="M20 5v14"/>',
  in: '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3"/>',
  out: '<path d="M7 17 17 7M8 7h9v9"/>',
  open: '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  drill: '<path d="M9 18l6-6-6-6"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="3"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
  spark: '<path d="M12 3.5 13.8 9a2 2 0 0 0 1.2 1.2l5.5 1.8-5.5 1.8a2 2 0 0 0-1.2 1.2L12 20.5 10.2 15A2 2 0 0 0 9 13.8L3.5 12 9 10.2A2 2 0 0 0 10.2 9z"/>',
  panel: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M15 4v16"/>',
  fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  home: '<path d="m3 11 9-7 9 7"/><path d="M5 10v10h14V10"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  left: '<path d="m15 18-6-6 6-6"/>',
  right: '<path d="m9 18 6-6-6-6"/>',
  // les icônes que Claude choisit pour un bloc selon ce qu'il représente dans le projet (champ icon)
  'panier': '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.6 12.4a2 2 0 0 0 2 1.6h8.2a2 2 0 0 0 2-1.6L21 7H6"/>',
  'magasin': '<path d="m3 9 1.5-5h15L21 9"/><path d="M4 9v11h16V9"/><path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/><path d="M10 20v-6h4v6"/>',
  'telephone': '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
  'ordinateur': '<rect x="4" y="5" width="16" height="11" rx="2"/><path d="M2 20h20"/>',
  'etiquette': '<path d="M3 12V4a1 1 0 0 1 1-1h8l9 9a1.4 1.4 0 0 1 0 2l-7 7a1.4 1.4 0 0 1-2 0z"/><circle cx="8" cy="8" r="1.5"/>',
  'ticket': '<path d="M5 3v18l2.5-1.5L10 21l2-1.5 2 1.5 2.5-1.5L19 21V3l-2.5 1.5L14 3l-2 1.5L10 3 7.5 4.5z"/><path d="M9 9h6M9 13h6"/>',
  'argent': '<circle cx="12" cy="12" r="9"/><path d="M15 9a3.5 3.5 0 1 0 0 6M8 11h5M8 13.5h5"/>',
  'carte-bancaire': '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h3"/>',
  'personne': '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  'groupe': '<circle cx="9" cy="8" r="3.5"/><path d="M3 20a6 6 0 0 1 12 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3 6"/>',
  'cadenas': '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  'bouclier': '<path d="M12 3 5 6v6c0 5 3 8 7 9 4-1 7-4 7-9V6z"/>',
  'courriel': '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  'message': '<path d="M21 12a8 8 0 0 1-8 8H4l2-3a8 8 0 1 1 15-5z"/>',
  'cloche': '<path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>',
  'calendrier': '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  'horloge': '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  'image': '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="m21 16-5-5L6 20"/>',
  'appareil-photo': '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.5"/>',
  'document': '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  'livre': '<path d="M4 5a2 2 0 0 1 2-2h14v16H6a2 2 0 0 0-2 2z"/>',
  'graphique': '<path d="M4 4v16h16M8 16v-5M13 16V8M18 16V9"/>',
  'lien': '<path d="M10 14a4 4 0 0 0 5.7 0l3-3A4 4 0 0 0 13 5.3l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  'robot': '<rect x="5" y="8" width="14" height="12" rx="3"/><path d="M12 8V4M9.5 17h5"/><circle cx="9.5" cy="13" r="1"/><circle cx="14.5" cy="13" r="1"/>',
  'outils': '<path d="M14.5 6.5a4 4 0 0 0-5 5L3 18l3 3 6.5-6.5a4 4 0 0 0 5-5L15 12l-3-3z"/>',
  'camion': '<path d="M3 6h11v11H3zM14 10h4l3 3v4h-7"/><circle cx="7" cy="18.5" r="1.5"/><circle cx="17" cy="18.5" r="1.5"/>',
  'cadeau': '<rect x="3" y="9" width="18" height="4" rx="1"/><path d="M5 13v8h14v-8M12 9v12"/><path d="M12 9S9 3 7 5s2 4 5 4zM12 9s3-6 5-4-2 4-5 4z"/>',
  'coeur': '<path d="M12 20s-8-5-8-11a4.5 4.5 0 0 1 8-3 4.5 4.5 0 0 1 8 3c0 6-8 11-8 11z"/>',
  'etoile': '<path d="m12 3 2.7 5.8 6.3.8-4.6 4.3 1.2 6.3L12 17l-5.6 3.2 1.2-6.3L3 9.6l6.3-.8z"/>',
  'lieu': '<path d="M12 21s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/>',
  'code-barres': '<path d="M4 5v14M7 5v14M11 5v14M14 5v14M17 5v14M20 5v14"/>',
  'telechargement': '<path d="M12 3v12M7 10l5 5 5-5M4 20h16"/>',
  'synchronisation': '<path d="M20 11a8 8 0 0 0-14-4l-3 3M3 4v6h6M4 13a8 8 0 0 0 14 4l3-3M21 20v-6h-6"/>',
  'palette': '<path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 2-2s-.5-2 1-2h2a4 4 0 0 0 4-4c0-5.500-4-10-9-10z"/><circle cx="7.500" cy="11" r="1"/><circle cx="11" cy="7.500" r="1"/><circle cx="16" cy="9" r="1"/>',
  'puce': '<rect x="7" y="7" width="10" height="10" rx="1"/><path d="M3 10h4M3 14h4M17 10h4M17 14h4M10 3v4M14 3v4M10 17v4M14 17v4"/>',
  'liste': '<path d="M9 6h11M9 12h11M9 18h11"/><path d="m3 6 1 1 2-2M3 12l1 1 2-2M3 18l1 1 2-2"/>',
};
Object.assign(P, { 'ecran': P.ui, 'serveur': P.service, 'eclair': P.worker, 'boite': P.library, 'couches': P.feature, 'donnees': P.data, 'reglages': P.config, 'fiole': P.test, 'terminal': P.script, 'nuage': P.infra, 'globe': P.external, 'dossier': P.dir, 'maison': P.home, 'loupe': P.search, 'etincelle': P.spark });
const picto = (k) => `<svg viewBox="0 0 24 24">${P[k] || P.file}</svg>`;
const pictoI = (k) => `<svg class="i" viewBox="0 0 24 24">${P[k] || P.file}</svg>`;
const pictoSymbole = (genre) => (['class', 'interface', 'struct', 'type', 'enum', 'record', 'trait', 'object'].includes(genre) ? 'class' : 'function');

