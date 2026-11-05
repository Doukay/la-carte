// Noms lisibles de repli, utilisés tant que Claude n’a pas écrit les vrais dans la-carte/sources/descriptions/.
import path from 'node:path';

const P = path.posix;
const ACRONYMES = /\b(api|ui|ux|id|ids|sku|skus|csv|url|urls|http|db|sql|bc|mcp|pos|gcs|s3|aws|gcp|jwt|pdf|ai|llm|cli|css|html|json|xml|oauth|sso|cdn|dns|ip|io|qa|ci|cd|crud|rpc|grpc|sdk|ttl|uuid|mtg)\b/g;
const GENERIQUES = /^(index|page|layout|route|routes|__init__|__main__|main|mod|lib|app|server|loading|error|not-found|template|default|handler|handlers|views?|urls|models?|schemas?|types?|constants?|utils?|helpers?|config|settings)$/i;

export function humaniser(id) {
  let s = String(id)
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/[_\-.\s]+/g, ' ')
    .trim()
    .toLowerCase();
  s = s.replace(ACRONYMES, (m) => m.toUpperCase());
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : String(id);
}

// mots génériques de noms de fichiers → nom français (tout le reste passe par humaniser)
const GENERIQUES_FR = { config: 'Configuration', settings: 'Réglages', utils: 'Utilitaires', util: 'Utilitaire', helpers: 'Aides', helper: 'Aide', models: 'Modèles', model: 'Modèle', schemas: 'Schémas', schema: 'Schéma', types: 'Types', type: 'Type', constants: 'Constantes', constant: 'Constante', handlers: 'Gestionnaires', handler: 'Gestionnaire', views: 'Vues', view: 'Vue', urls: 'Adresses', main: 'Principal', server: 'Serveur', app: 'Application', lib: 'Bibliothèque', mod: 'Module', template: 'Gabarit', default: 'Par défaut', 'not-found': 'Introuvable' };
// première lettre en minuscule, sauf pour un sigle (API, URL…)
const minuscule = (s) => (/^[A-Z][a-z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);
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
    const role = { page: 'Page', layout: 'Mise en page', route: 'Route', __init__: 'Paquet', index: '', loading: 'État de chargement', error: 'État d’erreur' }[radical.toLowerCase()];
    nom = parent ? (role === '' ? humaniser(parent) : `${role ?? GENERIQUES_FR[radical.toLowerCase()] ?? humaniser(radical)} ${de(minuscule(humaniser(parent)))}`) : (GENERIQUES_FR[radical.toLowerCase()] ?? humaniser(radical));
  } else nom = humaniser(radical);
  return estTest ? `Tests ${de(minuscule(nom))}` : nom;
}

export function nomRouteParDefaut(r) {
  if (r.handler && !/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|ANY)$/.test(r.handler)) return humaniser(r.handler);
  const segments = r.path.split('/').filter((s) => s && !/[<{:[*]/.test(s));
  const verbe = { GET: 'Lire', POST: 'Créer', PUT: 'Remplacer', PATCH: 'Mettre à jour', DELETE: 'Supprimer' }[r.method] || r.method;
  return `${verbe} ${humaniser(segments.slice(-2).join(' ') || 'racine').toLowerCase()}`;
}

export const cleRoute = (r) => `${r.method} ${r.path}`;
