// Noms lisibles de repli, utilisés tant que Claude n’a pas écrit les vrais dans la-carte/sources/descriptions/.
import path from 'node:path';

const P = path.posix;
const ACRONYMES = /(?<![\p{L}\p{N}])(api|ui|ux|id|ids|sku|skus|csv|url|urls|http|db|sql|bc|mcp|pos|gcs|s3|aws|gcp|jwt|pdf|ai|llm|cli|css|html|json|xml|oauth|sso|cdn|dns|ip|io|qa|ci|cd|crud|rpc|grpc|sdk|ttl|uuid|mtg)(?![\p{L}\p{N}])/gu;
const GENERIQUES = /^(index|page|layout|route|routes|__init__|__main__|main|mod|lib|app|server|loading|error|not-found|template|default|handler|handlers|views?|urls|models?|schemas?|types?|constants?|utils?|helpers?|config|settings)$/i;

// mots français souvent écrits sans accent dans les noms de code (etat_deux_facteurs, PageSante)
const ACCENTS = Object.fromEntries(`état états régénérer définir vérifier réinitialiser créer créé créée clé clés santé
  proposée proposées proposé proposés dépense dépenses récurrente récurrentes récurrent récurrents catégorie catégories
  événement événements sécurité donnée données paramètre paramètres préférence préférences déjà téléphone numéro système
  réglage réglages mémoire réponse réponses requête requêtes générer généré modèle modèles échéance échéances période
  périodes fréquence départ déconnexion désinscription désabonner réinscription réessayer thème aperçu accès entrée
  entrées activité activités déménagement électricité énergie équipe écran écrans étape étapes étiquette
  étiquettes idée idées supprimé modifié envoyé reçu problème méthode résultat résultats
  première précédente télécharger téléverser privé privée publié publiée médecin fiscalité sécurisé série séries`.split(/\s+/).filter(Boolean)
  .map((m) => [m.normalize('NFD').replace(/[\u0300-\u036f]/g, ''), m]));

export function humaniser(id) {
  let s = String(id)
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/[_\-.\s]+/g, ' ')
    .trim()
    .toLowerCase();
  s = s.replace(/\p{L}+/gu, (m) => ACCENTS[m] || m).replace(ACRONYMES, (m) => m.toUpperCase());
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : String(id);
}

// mots génériques de noms de fichiers → nom français (tout le reste passe par humaniser)
const GENERIQUES_FR = { config: 'Configuration', settings: 'Réglages', utils: 'Utilitaires', util: 'Utilitaire', helpers: 'Aides', helper: 'Aide', models: 'Modèles', model: 'Modèle', schemas: 'Schémas', schema: 'Schéma', types: 'Types', type: 'Type', constants: 'Constantes', constant: 'Constante', handlers: 'Gestionnaires', handler: 'Gestionnaire', views: 'Vues', view: 'Vue', urls: 'Adresses', main: 'Principal', server: 'Serveur', app: 'Application', lib: 'Bibliothèque', mod: 'Module', template: 'Gabarit', default: 'Par défaut', 'not-found': 'Introuvable' };
// première lettre en minuscule, sauf pour un sigle (API, URL…)
const minuscule = (s) => (/^\p{Lu}\p{Ll}/u.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);
// « de » ou « d’ » devant une voyelle
const de = (s) => (/^[aeiouyéèê]/i.test(s) ? 'd’' : 'de ') + s;
const nettoyerSegment = (segment) => segment.replace(/^\((.*)\)$/, '$1').replace(/^\[\.{0,3}(.*)\]$/, '$1 détail');

export function nomFichierParDefaut(p) {
  const nomBase = P.basename(p);
  const radicalFichier = nomBase.replace(/\.(test|spec)(?=\.)/, '').replace(/\.[^.]+$/, '');
  const estTest = /\.(test|spec)\.[a-z]+$/i.test(nomBase) || /^test_/.test(nomBase) || /_test\.(py|go)$/.test(nomBase);
  const radical = radicalFichier.replace(/^test_/, '').replace(/_test$/, '');
  let nom;
  if (GENERIQUES.test(radical)) {
    const dossiers = P.dirname(p).split('/').filter((d) => d && !/^(src|app|lib|pkg|internal)$/.test(d)).map(nettoyerSegment);
    const parent = dossiers.slice(-1)[0] || '';
    const styles = /\.(css|scss|sass|less)$/i.test(nomBase);
    const role = styles ? 'Styles' : { page: 'Page', layout: 'Mise en page', route: 'Route', __init__: 'Paquet', index: '', loading: 'État de chargement', error: 'État d’erreur' }[radical.toLowerCase()];
    nom = parent ? (role === '' ? humaniser(parent) : `${role ?? GENERIQUES_FR[radical.toLowerCase()] ?? humaniser(radical)} ${de(minuscule(humaniser(parent)))}`) : (GENERIQUES_FR[radical.toLowerCase()] ?? humaniser(radical));
  } else nom = humaniser(radical);
  return estTest ? `Tests ${de(minuscule(nom))}` : nom;
}

// mots anglais courants dans les adresses et les noms de gestionnaires (le reste garde son mot d'origine)
const VERBES_EN = { get: 'Lire', fetch: 'Lire', read: 'Lire', show: 'Lire', load: 'Lire', list: 'Lister', create: 'Créer', add: 'Ajouter', new: 'Créer', update: 'Modifier', edit: 'Modifier', patch: 'Modifier', set: 'Modifier', delete: 'Supprimer', remove: 'Supprimer', send: 'Envoyer', upload: 'Envoyer', download: 'Télécharger', search: 'Chercher', find: 'Chercher', check: 'Vérifier', verify: 'Vérifier', validate: 'Vérifier', export: 'Exporter', import: 'Importer', handle: 'Traiter', process: 'Traiter' };
const MOTS_EN = { users: 'utilisateurs', user: 'utilisateur', reports: 'rapports', report: 'rapport', settings: 'réglages', orders: 'commandes', order: 'commande', products: 'produits', product: 'produit', items: 'éléments', item: 'élément', files: 'fichiers', file: 'fichier', accounts: 'comptes', account: 'compte', payments: 'paiements', payment: 'paiement', invoices: 'factures', invoice: 'facture', events: 'événements', event: 'événement', tasks: 'tâches', task: 'tâche', comments: 'commentaires', comment: 'commentaire', stats: 'statistiques', health: 'santé', status: 'état', state: 'état', count: 'nombre', profile: 'profil', password: 'mot de passe', token: 'jeton', tokens: 'jetons', refund: 'remboursement', refunds: 'remboursements', cart: 'panier', customers: 'clients', customer: 'client', lists: 'listes', list: 'liste', groups: 'groupes', group: 'groupe', members: 'membres', member: 'membre', uploads: 'envois', login: 'connexion', logout: 'déconnexion', register: 'inscription', signup: 'inscription', search: 'recherche', me: 'mon compte', root: 'racine' };
const SANS_SENS = /^(api|v\d+|rest|json|public|private)$/i;
// un mot d'adresse : traduit s'il est connu, en minuscules sauf un sigle
const motFr = (m) => MOTS_EN[m.toLowerCase()] || (/^[A-Z0-9]{2,}$/.test(m) ? m : m.toLowerCase());

export function nomRouteParDefaut(r) {
  if (r.handler && !/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|ANY)$/.test(r.handler)) {
    const mots = humaniser(r.handler).split(' ');
    while (mots.length > 1 && /^(route|handler|view|endpoint|api|controller)$/i.test(mots[mots.length - 1])) mots.pop();
    const verbeEn = mots.length > 1 && VERBES_EN[mots[0].toLowerCase()];
    const s = (verbeEn ? [verbeEn, ...mots.slice(1).map(motFr)] : mots).join(' ');
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  const segments = r.path.split('/').filter((s) => s && !/[<{:[*]/.test(s) && !SANS_SENS.test(s));
  const verbe = { GET: 'Lire', POST: 'Créer', PUT: 'Remplacer', PATCH: 'Mettre à jour', DELETE: 'Supprimer' }[r.method] || r.method;
  const mot = (s) => humaniser(s).split(' ').map(motFr).join(' ');
  const [contexte, objet] = segments.length > 1 ? segments.slice(-2) : [null, segments[0] || 'racine'];
  return `${verbe} ${mot(objet)}${contexte ? ` (${mot(contexte)})` : ''}`;
}

export const cleRoute = (r) => `${r.method} ${r.path}`;
