// Glossaire de la carte : explique les mots techniques qu'une personne qui n'est pas développeuse rencontre sur la carte.
// La première fois qu'un terme connu apparaît dans une description (panneau de détails, zone de titre du tableau), il est
// souligné en pointillés ; le survoler ou le sélectionner affiche une explication en une phrase. Désactivé tant que
// « Afficher le détail technique » est activé. Ne parle au visualiseur que par window.LaCarte.
(() => {
  const CARTE = window.LaCarte;
  if (!CARTE) return;

  // [nom affiché, explication simple, alias...]. Les alias sont comparés comme des mots entiers, sans tenir compte de la casse,
  // sauf ceux marqués d'un « = » au début (comparés exactement, pour que « REST » ne se déclenche pas sur « le reste »).
  const TERMES = [
    ['API', 'La façon dont des programmes se parlent entre eux : l’un demande quelque chose (des prix, une commande) et l’autre répond.', 'API', 'APIs', 'API client', 'interface de programmation'],
    ['Adresse du serveur', 'Une demande précise que l’appli peut recevoir, comme « marquer cette commande comme expédiée » ; chacune a sa propre adresse web.', 'endpoint', 'endpoints', 'adresse du serveur', 'adresses du serveur'],
    ['Webhook', 'Un message qu’un autre service envoie tout seul à ton appli quand quelque chose s’y passe, par exemple « un paiement est passé ».', 'webhook', 'webhooks'],
    ['Serveur', 'Un ordinateur dans le cloud qui fait le travail de l’appli en coulisses et répond aux demandes venant des écrans.', 'server', 'servers', 'main server', 'serveur', 'serveurs', 'serveur principal'],
    ['Frontend (ce qu’on voit)', 'La partie de l’appli que les gens voient et sur laquelle ils cliquent : les écrans, boutons et formulaires dans le navigateur.', 'frontend', 'front end', 'front-end', 'partie visible'],
    ['Backend (les coulisses)', 'La partie de l’appli qui travaille en coulisses : elle garde les données, applique les règles et parle aux autres services.', 'backend', 'back end', 'back-end'],
    ['Base de données', 'L’endroit où l’appli garde ses données (produits, commandes, clients) pour que rien ne se perde quand elle redémarre.', 'database', 'databases', 'DB', 'base de données', 'bases de données'],
    ['Enregistrement', 'Une entrée sauvegardée dans la base de données, comme une commande ou un client ; une table est la liste de tous les enregistrements d’un même genre.', 'database record', 'database records', 'database table', 'database tables', 'enregistrement en base', 'enregistrements en base', 'table de la base', 'tables de la base', 'table de base de données', 'tables de base de données'],
    ['Modèle de données', 'Dans le code, un modèle décrit comment un genre d’enregistrement (une commande, un client) est rangé dans la base de données.', 'model', 'models', 'ORM', 'ORM model', 'ORM models', 'data model', 'modèle de données', 'modèles de données'],
    ['Requête sur la base', 'Une question que l’appli pose à la base de données, comme « toutes les commandes d’aujourd’hui qui ne sont pas encore parties ».', 'query', 'queries', 'requête SQL', 'requêtes SQL'],
    ['File d’attente', 'Une file de tâches qui attendent leur tour ; le travail y est déposé puis traité un par un en arrière-plan, pour que rien ne se perde.', 'queue', 'queues', 'queued', 'outbox', 'message queue', 'file d’attente', 'files d’attente', 'file d\'attente', 'files d\'attente'],
    ['Tâche de fond', 'Une tâche qui tourne toute seule en coulisses, pour que les gens n’aient pas à l’attendre à l’écran.', 'background job', 'background jobs', 'background task', 'background tasks', 'worker', 'workers', 'tâche de fond', 'tâches de fond'],
    ['Tâche planifiée', 'Une tâche qui se lance automatiquement selon un horaire, par exemple toutes les heures ou chaque nuit.', 'cron', 'cron job', 'cron jobs', 'scheduled job', 'scheduled jobs', 'scheduler', 'tâche planifiée', 'tâches planifiées'],
    ['Variable d’environnement', 'Un réglage rangé en dehors du code, comme la base de données ou le compte à utiliser, pour qu’il puisse changer entre les tests et la vraie mise en ligne.', 'environment variable', 'environment variables', 'env var', 'env vars', '.env', 'variable d’environnement', 'variables d’environnement', 'variable d\'environnement', 'variables d\'environnement'],
    ['Secret', 'Un mot de passe ou une clé que l’appli utilise pour se connecter à un autre service ; il ne doit jamais être partagé ni mis dans le code.', 'secret', 'secrets', 'API key', 'API keys', 'credentials', 'clé d’API', 'clés d’API', 'clé d\'API', 'clés d\'API', 'identifiants'],
    ['Déploiement', 'Mettre en ligne une nouvelle version de l’appli pour que les gens commencent à l’utiliser.', 'deploy', 'deploys', 'deployed', 'deployment', 'deployments', 'déploiement', 'déploiements', 'déployer', 'déployé', 'déployée', 'mise en ligne'],
    ['Migration', 'Un changement unique dans la façon dont les données sont rangées, comme ajouter un nouveau champ à chaque commande.', 'migration', 'migrations'],
    ['Cache', 'Une copie gardée à portée de main pour que ça s’affiche plus vite, au lieu de tout recalculer.', 'cache', 'cached', 'caching', 'mise en cache'],
    ['Se connecter', 'Vérifier qui est la personne (en général avec un mot de passe) avant de la laisser entrer.', 'auth', 'authentication', 'login', 'log in', 'sign-in', 'sign in', 'authentification', 'se connecter', 'page de connexion'],
    ['Droits d’accès', 'Les règles qui disent qui a le droit de faire quoi, par exemple seuls les responsables peuvent faire un remboursement.', 'permissions', 'authorization', 'roles', 'RBAC', 'droits d’accès', 'droits d\'accès', 'autorisations', 'rôles'],
    ['Session', 'La façon dont l’appli se souvient que tu es connecté, pour que tu n’aies pas à retaper ton mot de passe sur chaque écran.', 'session', 'sessions'],
    ['Jeton', 'Un laissez-passer numérique temporaire que l’appli remet après la connexion et vérifie à chaque appel au serveur.', 'token', 'tokens', 'bearer token', 'access token', 'jeton', 'jetons'],
    ['SDK', 'Un kit de code prêt à l’emploi qu’une entreprise fournit pour que les applis parlent plus facilement à son service.', 'SDK', 'SDKs'],
    ['Dépôt', 'Le dossier qui contient tout le code d’un projet et tout l’historique de ses modifications.', 'repository', 'repositories', 'repo', 'repos', 'dépôt', 'dépôts'],
    ['Composant', 'Une brique réutilisable des écrans, comme un bouton, un tableau ou tout un éditeur de produit.', 'component', 'components', 'composant', 'composants'],
    ['Route', 'Une adresse web à laquelle l’appli répond : côté écrans c’est une page, côté serveur c’est un genre d’appel.', 'route', 'routes', 'routing', 'App Router', 'routage'],
    ['Appel au serveur', 'Un message qui demande au serveur de faire ou de chercher quelque chose ; le serveur renvoie une réponse avec le résultat.', 'request', 'requests', 'response', 'responses', 'requête', 'requêtes', 'requête HTTP', 'requêtes HTTP', 'appel au serveur', 'appels au serveur', 'réponse du serveur', 'réponses du serveur'],
    ['JSON', 'Un format texte simple que les programmes utilisent pour s’envoyer des données, comme une liste avec des étiquettes.', 'JSON'],
    ['REST', 'Un style courant pour construire des API, où chaque adresse web représente un genre de chose (commandes, produits).', '=REST', '=RESTful'],
    ['Méthode HTTP', 'Le genre de demande : GET lit quelque chose, POST crée, PUT ou PATCH modifie, DELETE supprime.', 'HTTP method', 'HTTP methods', 'méthode HTTP', 'méthodes HTTP', '=GET', '=POST', '=PUT', '=PATCH', '=DELETE'],
    ['HTTP', 'Le langage que les navigateurs et les serveurs utilisent pour se parler sur le web ; HTTPS est la version chiffrée.', 'HTTP', 'HTTPS'],
    ['CDN', 'Un réseau de serveurs dans le monde entier qui livre vite les images et les fichiers depuis un endroit proche du visiteur.', 'CDN', 'CDNs'],
    ['Espace de stockage', 'Un stockage de fichiers dans le cloud, pour les images de produits, les envois de fichiers et les exports.', 'storage bucket', 'bucket', 'buckets', 'S3', 'GCS', 'Cloud Storage', 'espace de stockage', 'espaces de stockage'],
    ['Pub/Sub', 'Le service de messages de Google : une partie de l’appli publie un événement et d’autres le récupèrent pour le traiter en arrière-plan.', 'Pub/Sub', 'PubSub'],
    ['MCP', 'Une façon standard de relier des assistants IA (comme Claude ou ChatGPT) à une appli pour qu’ils puissent y chercher des choses.', 'MCP', 'MCP server', 'Model Context Protocol', 'serveur MCP'],
    ['Next.js', 'Une boîte à outils très utilisée pour construire des sites et des applis web avec React.', 'Next.js', 'NextJS'],
    ['React', 'Une bibliothèque très utilisée pour construire des écrans interactifs à partir de pièces réutilisables.', '=React'],
    ['Flask', 'Une boîte à outils Python pour construire des serveurs web.', 'Flask'],
    ['SQLAlchemy', 'Une boîte à outils Python qui permet au code de lire et d’enregistrer des données de la base sans écrire de commandes brutes pour la base.', 'SQLAlchemy'],
    ['Postgres', 'Une base de données très utilisée ; RDS et Cloud SQL sont les versions hébergées d’Amazon et de Google.', 'Postgres', 'PostgreSQL', 'RDS', 'Cloud SQL'],
    ['Docker', 'Une façon d’emballer une appli avec tout ce dont elle a besoin pour qu’elle tourne pareil sur n’importe quel ordinateur ou cloud.', 'Docker', 'container', 'containers', 'conteneur', 'conteneurs'],
    ['Cloud Run', 'Le service de Google pour faire tourner les serveurs et les tâches de fond d’une appli dans le cloud sans gérer de machines.', 'Cloud Run'],
    ['Intergiciel (middleware)', 'Une vérification par laquelle passe chaque appel à son arrivée, par exemple « cette personne est-elle connectée ? ».', 'middleware', 'intergiciel'],
    ['Blueprint Flask', 'Dans Flask, un groupe d’appels liés entre eux, comme tous les appels sur les commandes.', 'blueprint', 'blueprints'],
    ['Tests', 'Des vérifications automatiques que le code fait toujours ce qu’il doit, lancées avant la mise en ligne des changements.', 'test suite', 'unit test', 'unit tests', 'pytest', 'Vitest', 'tests unitaires', 'test unitaire', 'tests automatiques'],
    ['Script', 'Un petit programme lancé à la main pour un travail ponctuel, comme corriger ou importer des données.', 'script', 'scripts'],
    ['OAuth', 'Le standard derrière les boutons « Se connecter avec… » : il permet à une appli d’en utiliser une autre en ton nom sans partager ton mot de passe.', 'OAuth'],
  ];

  const exacts = new Map(), souples = new Map(), alternatives = [];
  TERMES.forEach(([nom, texte, ...alias], i) => {
    for (let a of alias) {
      const strict = a.startsWith('=');
      if (strict) a = a.slice(1);
      (strict ? exacts : souples).set(strict ? a : a.toLowerCase(), i);
      alternatives.push(a);
    }
  });
  const echapper = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  alternatives.sort((a, b) => b.length - a.length);
  const MOTIF = new RegExp(`(?<![\\w./-])(?:${alternatives.map(echapper).join('|')})(?![\\w/]|-\\w|\\.\\w)`, 'gi');
  const termeDe = (m) => exacts.has(m) ? exacts.get(m) : souples.has(m.toLowerCase()) ? souples.get(m.toLowerCase()) : -1;

  // Où chercher, et ce qu'il faut laisser tranquille.
  const CIBLES = '.pd, .rd, .callout';
  const IGNORES = 'a[href], button, code, pre, kbd, samp, input, textarea, select, [contenteditable], .tag, .rp, .pp, .method, .kbd, .sc-term, [data-noglossary]';
  const CLIQUABLES = 'a, [data-go], [data-sel], [data-flow], [data-open], [role="button"]';
  const estMono = (el) => /mono|monospace/i.test(el.style?.fontFamily || '');

  function annoter(portee, cibles) {
    if (!portee || CARTE.technique()) return;
    const utilises = new Set([...portee.querySelectorAll('.sc-term')].map((s) => +s.dataset.term)); // un seul par terme et par zone
    const aIgnorer = (depart, arret) => { for (let p = depart; p && p !== arret; p = p.parentElement) if (p.matches(IGNORES) || estMono(p)) return true; return false; };
    for (const el of cibles) {
      if (aIgnorer(el, portee)) continue;
      const parcoureur = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
        acceptNode: (t) => !t.nodeValue.trim() || aIgnorer(t.parentElement, el) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
      });
      const textes = [];
      while (parcoureur.nextNode()) textes.push(parcoureur.currentNode);
      for (const t of textes) envelopper(t, utilises);
    }
  }
  function envelopper(noeudTexte, utilises) {
    let noeud = noeudTexte;
    while (noeud) {
      MOTIF.lastIndex = 0;
      let m, trouve = null;
      while ((m = MOTIF.exec(noeud.nodeValue))) {
        const i = termeDe(m[0]);
        if (i >= 0 && !utilises.has(i)) { trouve = { m, i }; break; }
      }
      if (!trouve) return;
      utilises.add(trouve.i);
      const mot = noeud.splitText(trouve.m.index);
      const reste = mot.splitText(trouve.m[0].length);
      const etiquette = document.createElement('span');
      etiquette.className = 'sc-term';
      etiquette.dataset.term = String(trouve.i);
      if (!mot.parentElement.closest(CLIQUABLES)) etiquette.tabIndex = 0; // dans les lignes cliquables : survol seulement, les clics passent au travers
      mot.replaceWith(etiquette);
      etiquette.appendChild(mot);
      noeud = reste;
    }
  }
  function retirer(portee) {
    if (!portee) return;
    for (const s of portee.querySelectorAll('.sc-term')) s.replaceWith(...s.childNodes);
    portee.normalize();
  }

  const elementPanneau = () => document.getElementById('panel');
  const elementContexte = () => document.getElementById('context');
  const traiterPanneau = () => { const p = elementPanneau(); if (p) annoter(p, p.querySelectorAll(CIBLES)); };
  const traiterContexte = () => { const c = elementContexte(); if (c) annoter(c, c.querySelectorAll('p, .callout')); };

  // Lancé après que le visualiseur et les autres extensions ont fini de remplir la page.
  CARTE.sur('panel', () => { masquer(true); queueMicrotask(traiterPanneau); });
  CARTE.sur('render', () => { masquer(true); queueMicrotask(traiterContexte); });
  CARTE.sur('technical', (on) => {
    masquer(true);
    if (on) { retirer(elementPanneau()); retirer(elementContexte()); }
    else { queueMicrotask(() => { retirer(elementPanneau()); retirer(elementContexte()); traiterPanneau(); traiterContexte(); }); }
  });

  // ---------- bulle d'explication ----------
  const style = document.createElement('style');
  style.textContent = `
.sc-term { pointer-events: auto; cursor: help; border-radius: 4px; text-decoration-line: underline; text-decoration-style: dotted; text-decoration-thickness: 1px; text-underline-offset: 3px;
  text-decoration-color: rgba(var(--ink), .32); text-decoration-color: color-mix(in srgb, currentColor 45%, transparent); transition: text-decoration-color .2s var(--ease), color .2s var(--ease); }
.sc-term:hover, .sc-term.on { text-decoration-color: currentColor; color: var(--text); }
.callout .sc-term:hover, .callout .sc-term.on { color: inherit; }
.sc-term:focus { outline: none; }
.sc-term:focus-visible { box-shadow: 0 0 0 2px var(--focus); }
#sc-gloss { position: fixed; left: 0; top: 0; z-index: 55; max-width: 280px; padding: 11px 13px; border-radius: 14px; font-size: 12.5px; line-height: 1.5; color: var(--text-2);
  pointer-events: none; opacity: 0; transform: translateY(3px); transition: opacity .15s var(--ease), transform .25s var(--ease); }
#sc-gloss.on { opacity: 1; transform: none; }
#sc-gloss b { display: block; color: var(--text); font-weight: 600; margin-bottom: 2px; }`;
  document.head.appendChild(style);

  const bulle = document.createElement('div');
  bulle.id = 'sc-gloss';
  bulle.className = 'glass';
  bulle.setAttribute('role', 'tooltip');
  document.body.appendChild(bulle);

  let courant = null, minuteurAffichage = 0, minuteurMasquage = 0;
  function afficher(el) {
    clearTimeout(minuteurMasquage);
    if (courant === el) return;
    const terme = TERMES[+el.dataset.term];
    if (!terme) return;
    courant?.classList.remove('on'); courant?.removeAttribute('aria-describedby');
    courant = el;
    el.classList.add('on');
    el.setAttribute('aria-describedby', 'sc-gloss');
    bulle.innerHTML = `<b>${CARTE.h(terme[0])}</b>${CARTE.h(terme[1])}`;
    const r = el.getClientRects()[0] || el.getBoundingClientRect();
    const largeurBulle = bulle.offsetWidth, hauteurBulle = bulle.offsetHeight, ecart = 8;
    const x = Math.max(12, Math.min(r.left, innerWidth - largeurBulle - 12));
    const enDessous = r.bottom + ecart + hauteurBulle <= innerHeight - 12;
    const y = enDessous ? r.bottom + ecart : Math.max(12, r.top - ecart - hauteurBulle);
    bulle.style.left = `${Math.round(x)}px`;
    bulle.style.top = `${Math.round(y)}px`;
    bulle.classList.add('on');
  }
  function masquer(immediat) {
    clearTimeout(minuteurAffichage); clearTimeout(minuteurMasquage);
    const terminer = () => { bulle.classList.remove('on'); courant?.classList.remove('on'); courant?.removeAttribute('aria-describedby'); courant = null; };
    if (immediat === true) terminer(); else minuteurMasquage = setTimeout(terminer, 90);
  }
  const termeSous = (ev) => ev.target instanceof Element ? ev.target.closest('.sc-term') : null;
  document.addEventListener('mouseover', (ev) => { const t = termeSous(ev); if (!t) return; clearTimeout(minuteurAffichage); minuteurAffichage = setTimeout(() => afficher(t), courant ? 0 : 140); });
  document.addEventListener('mouseout', (ev) => { const t = termeSous(ev); if (t && !t.contains(ev.relatedTarget)) { clearTimeout(minuteurAffichage); masquer(); } });
  document.addEventListener('focusin', (ev) => { const t = termeSous(ev); if (t) afficher(t); });
  document.addEventListener('focusout', (ev) => { if (termeSous(ev)) masquer(); });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && courant) masquer(true); });
  document.addEventListener('scroll', () => { if (courant) masquer(true); }, true);
  addEventListener('resize', () => { if (courant) masquer(true); });

  // premier passage, au cas où le premier affichage ou panneau aurait eu lieu avant ce script
  if (document.readyState !== 'loading') queueMicrotask(() => { traiterPanneau(); traiterContexte(); });
})();
