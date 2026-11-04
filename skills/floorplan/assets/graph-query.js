// Requêtes sur le graphe de Floorplan, partagées par le visualiseur (comme outils de page pour l'appli Claude) et par
// floorplan/query.mjs (comme ligne de commande appelée par Claude Code ou Codex). Script simple : ni import ni export.
// Ids des éléments : n:<id du nœud>  f:<chemin du fichier>  r:<numéro de route>  s:<chemin du fichier>#<numéro d'export>

function creerRequetesGraphe(G) {
  const noeuds = new Map(G.nodes.map((n) => [n.id, n]));
  const fichiers = new Map(G.files.map((f) => [f.p, f]));
  const routes = G.routes || [];
  const routesParFichier = new Map();
  routes.forEach((r, i) => { if (!routesParFichier.has(r.f)) routesParFichier.set(r.f, []); routesParFichier.get(r.f).push(i); });
  const enfantsDe = new Map();
  for (const n of G.nodes) if (n.parent) { if (!enfantsDe.has(n.parent)) enfantsDe.set(n.parent, []); enfantsDe.get(n.parent).push(n.id); }

  const chaineNoeud = (id) => { const sortants = []; let n = noeuds.get(id); while (n) { sortants.push(n.id); n = n.parent ? noeuds.get(n.parent) : null; } return sortants; };
  /** Les ids des nœuds sous lesquels se trouve un élément, du plus profond au plus haut. */
  function proprietaires(id) {
    if (id.startsWith('n:')) return chaineNoeud(id.slice(2));
    if (id.startsWith('f:')) { const f = fichiers.get(id.slice(2)); return f ? chaineNoeud(f.n) : []; }
    if (id.startsWith('r:')) { const r = routes[+id.slice(2)]; return r ? proprietaires('f:' + r.f) : []; }
    if (id.startsWith('s:')) return proprietaires('f:' + id.slice(2).replace(/#\d+$/, ''));
    return [];
  }
  function brief(id) {
    if (id.startsWith('n:')) { const n = noeuds.get(id.slice(2)); return n && { id, type: n.kind === 'external' ? 'external' : 'module', name: n.label, description: n.summary || '' }; }
    if (id.startsWith('f:')) { const f = fichiers.get(id.slice(2)); return f && { id, type: 'file', name: f.name, description: f.d || '', path: f.p }; }
    if (id.startsWith('r:')) { const r = routes[+id.slice(2)]; return r && { id, type: 'endpoint', name: r.name, description: r.d || '', path: `${r.m} ${r.p}` }; }
    if (id.startsWith('s:')) {
      const m = /^s:(.*)#(\d+)$/.exec(id); const f = m && fichiers.get(m[1]); const s = f?.s?.[+m[2]];
      return s && { id, type: s[1], name: s[0], description: s[4] || '', path: `${f.p}:${s[2]}` };
    }
    return null;
  }
  const exists = (id) => !!brief(id);
  const dedans = (x, conteneur) => x === conteneur || (conteneur.startsWith('n:') && proprietaires(x).includes(conteneur.slice(2))) || (conteneur.startsWith('f:') && (x.startsWith('r:') ? 'f:' + routes[+x.slice(2)].f === conteneur : x.startsWith('s:') ? 'f:' + x.slice(2).replace(/#\d+$/, '') === conteneur : false));
  const elementProprietaire = (adresse) => adresse.startsWith('f:') ? 'n:' + (fichiers.get(adresse.slice(2))?.n || '') : adresse;

  /** Accepte un id, ou ce que les gens passent naturellement : un chemin de fichier, un id de partie, ou "GET /chemin". */
  function normaliserId(id) {
    id = String(id || '').trim().replace(/^\.\//, '').replace(/\\/g, '/');
    if (brief(id)) return id;
    if (fichiers.has(id)) return 'f:' + id;
    if (noeuds.has(id)) return 'n:' + id;
    const m = /^([A-Z]+)\s+(\/\S*)$/i.exec(id);
    if (m) { const ri = routes.findIndex((r) => r.m === m[1].toUpperCase() && r.p === m[2]); if (ri >= 0) return 'r:' + ri; }
    return id;
  }

  const MOTS_VIDES = new Set(['how', 'does', 'do', 'did', 'the', 'a', 'an', 'is', 'are', 'where', 'what', 'which', 'who', 'of', 'to', 'for', 'in', 'on', 'and', 'or', 'we', 'i', 'my', 'our', 'it', 'work', 'works', 'happen', 'happens', 'get', 'gets', 'with',
    // petits mots français
    'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'et', 'ou', 'à', 'au', 'aux', 'pour', 'dans', 'sur', 'qui', 'que', 'quoi', 'comment', 'où', 'est', 'sont']);
  function find(requete, genre, limite = 15) {
    const mots = String(requete || '').toLowerCase().split(/\s+/).filter(Boolean);
    const termes = mots.filter((t) => !MOTS_VIDES.has(t)).length ? mots.filter((t) => !MOTS_VIDES.has(t)) : mots;
    if (!termes.length) return [];
    const reservoir = [];
    if (!genre || genre === 'module') for (const n of G.nodes) reservoir.push(['n:' + n.id, n.label, n.summary || '', n.id, 4]);
    if (!genre || genre === 'file') for (const f of G.files) reservoir.push(['f:' + f.p, f.name, f.d || '', f.p, 3]);
    if (!genre || genre === 'endpoint') routes.forEach((r, i) => reservoir.push(['r:' + i, r.name, r.d || '', `${r.m} ${r.p}`, 3]));
    if (!genre || genre === 'symbol') for (const f of G.files) (f.s || []).forEach((s, i) => reservoir.push([`s:${f.p}#${i}`, s[0], s[4] || '', f.p, 1]));
    // tout ce qui contient chaque mot ; si rien ne convient, les meilleurs résultats partiels
    const notes = [];
    for (const [id, nom, desc, p, w] of reservoir) {
      const n = nom.toLowerCase(), d = desc.toLowerCase(), chemin = p.toLowerCase();
      let s = 0, touches = 0;
      for (const t of termes) {
        const pts = n === t ? 30 : n.startsWith(t) ? 20 : n.includes(t) ? 12 : chemin.includes(t) ? 7 : d.includes(t) ? 5 : 0;
        if (pts) { s += pts; touches++; }
      }
      if (touches) notes.push([touches, s + w * 2 - n.length * 0.02, id]);
    }
    const meilleur = Math.max(0, ...notes.map((x) => x[0]));
    const seuil = meilleur === termes.length ? meilleur : Math.max(1, Math.ceil(termes.length / 2));
    return notes.filter((x) => x[0] >= seuil).sort((a, b) => b[0] - a[0] || b[1] - a[1])
      .slice(0, Math.min(Number(limite) || 15, 40)).map(([, , id]) => brief(id));
  }

  function connexions(id, maxi = 15) {
    const sortants = new Map(), entrants = new Map();
    for (const l of G.links) {
      const ia = dedans(l.a, id), ib = dedans(l.b, id);
      if (ia === ib) continue;
      const autre = ia ? l.b : l.a;
      const cle = (id.startsWith('n:') ? elementProprietaire(autre) : autre) + '|' + l.k;
      const m = ia ? sortants : entrants;
      const courant = m.get(cle) || { id: cle.split('|')[0], via: l.k, weight: 0, endpoints: new Set() };
      courant.weight += l.w;
      for (const [ri] of l.calls || []) if (ri != null) courant.endpoints.add(ri);
      m.set(cle, courant);
    }
    const formater = (m) => [...m.values()].sort((a, b) => b.weight - a.weight).slice(0, maxi).map((c) => ({
      ...brief(c.id), via: c.via, weight: c.weight,
      ...(c.endpoints.size ? { endpoints: [...c.endpoints].slice(0, 6).map((ri) => `r:${ri} ${routes[ri].m} ${routes[ri].p}`) } : {}),
    })).filter((x) => x.id);
    return { dependsOn: formater(sortants), usedBy: formater(entrants) };
  }

  function show(id) {
    id = normaliserId(id);
    const b = brief(id);
    if (!b) throw new Error(`Id inconnu « ${id} ». Utilise d’abord find ; les ids ressemblent à n:api, f:src/app.ts, r:12, s:src/app.ts#3.`);
    const parent = proprietaires(id)[id.startsWith('n:') ? 1 : 0];
    const resultat = { ...b, ...(parent ? { partOf: brief('n:' + parent) && { id: 'n:' + parent, name: noeuds.get(parent).label } } : {}) };
    const recents = (G.recent?.items || []).filter((x) => x.id === id);
    if (recents.length) resultat.recentWork = recents.map((x) => `${G.recent.tasks[x.task]?.title}: ${x.note}`);
    if (id.startsWith('n:')) {
      const n = noeuds.get(id.slice(2));
      if (n.details) resultat.details = n.details;
      resultat.size = { files: n.stats.files, loc: n.stats.loc };
      resultat.children = (enfantsDe.get(n.id) || []).map((k) => ({ id: 'n:' + k, name: noeuds.get(k).label, description: noeuds.get(k).summary || '' }));
      const fichiersDuNoeud = G.files.filter((f) => proprietaires('f:' + f.p).includes(n.id)).sort((a, z) => z.loc - a.loc);
      resultat.files = fichiersDuNoeud.slice(0, 12).map((f) => ({ id: 'f:' + f.p, name: f.name, description: f.d || '' }));
      if (fichiersDuNoeud.length > 12) resultat.moreFiles = fichiersDuNoeud.length - 12;
      resultat.endpoints = routes.filter((r) => proprietaires('f:' + r.f).includes(n.id)).length;
      Object.assign(resultat, connexions(id));
    } else if (id.startsWith('f:')) {
      const f = fichiers.get(id.slice(2));
      Object.assign(resultat, { loc: f.loc, module: { id: 'n:' + f.n, name: noeuds.get(f.n)?.label }, ...(f.note ? { note: f.note } : {}) });
      const routesDuFichier = routesParFichier.get(f.p) || [];
      if (routesDuFichier.length) resultat.endpoints = routesDuFichier.slice(0, 40).map((ri) => ({ id: 'r:' + ri, method: routes[ri].m, path: routes[ri].p, name: routes[ri].name }));
      const gestionnaires = new Set(routesDuFichier.map((ri) => routes[ri].h));
      const exportes = (f.s || []).map((s, i) => [s, i]).filter(([s]) => !gestionnaires.has(s[0]));
      if (exportes.length) resultat.exports = exportes.slice(0, 30).map(([s, i]) => `s:${f.p}#${i} ${s[0]} (${s[1]})`);
      Object.assign(resultat, connexions(id, 20));
    } else if (id.startsWith('r:')) {
      const ri = +id.slice(2), r = routes[ri];
      Object.assign(resultat, { method: r.m, routePath: r.p, handler: r.h, line: r.l, file: { id: 'f:' + r.f, name: fichiers.get(r.f)?.name } });
      const appelants = new Map();
      for (const l of G.links) { const n = (l.calls || []).filter(([x]) => x === ri).length; if (n) appelants.set(l.a, (appelants.get(l.a) || 0) + n); }
      resultat.calledFrom = [...appelants.entries()].map(([a, n]) => ({ ...brief(a), calls: n }));
    } else {
      const m = /^s:(.*)#(\d+)$/.exec(id); const f = fichiers.get(m[1]); const s = f.s[+m[2]];
      resultat.file = { id: 'f:' + f.p, name: f.name };
      resultat.importedBy = G.links.filter((l) => l.b === 'f:' + f.p && (l.names || []).some((nm) => nm === s[0] || (nm === 'default' && s[3]))).slice(0, 25).map((l) => brief(l.a));
    }
    return resultat;
  }

  /** Plus courte chaîne de dépendances entre n'importe quoi dans `depart` et n'importe quoi dans `arrivee`. */
  function path(depart, arrivee) {
    depart = normaliserId(depart); arrivee = normaliserId(arrivee);
    if (!exists(depart) || !exists(arrivee)) throw new Error('Id inconnu ; utilise d’abord find.');
    const adjacence = new Map();
    const ajouter = (a, b, l) => { if (!adjacence.has(a)) adjacence.set(a, []); adjacence.get(a).push([b, l]); };
    for (const l of G.links) ajouter(l.a, l.b, l);
    const departs = [...new Set([...G.links.map((l) => l.a), ...G.links.map((l) => l.b)])].filter((x) => dedans(x, depart));
    const estBut = (x) => dedans(x, arrivee);
    const precedent = new Map(departs.map((s) => [s, null]));
    const attente = [...departs];
    let but = null;
    while (attente.length && !but) {
      const x = attente.shift();
      for (const [y, l] of adjacence.get(x) || []) {
        if (precedent.has(y)) continue;
        precedent.set(y, [x, l]);
        if (estBut(y)) { but = y; break; }
        attente.push(y);
      }
    }
    if (!but) return { found: false, note: `Aucune chaîne d’imports ou d’appels ne mène de ${depart} à ${arrivee}. Essaie dans l’autre sens, ou les deux ne se rejoignent peut-être que par une dépendance commune.` };
    const sauts = [];
    for (let x = but; precedent.get(x); x = precedent.get(x)[0]) {
      const [p, l] = precedent.get(x);
      sauts.unshift({ from: brief(p), to: brief(x), via: l.k, ...(l.calls?.length ? { endpoints: l.calls.slice(0, 3).map(([ri]) => ri != null ? `r:${ri} ${routes[ri].m} ${routes[ri].p}` : '').filter(Boolean) } : {}) });
    }
    return { found: true, hops: sauts.slice(0, 15) };
  }

  function overview() {
    return {
      projet: G.projet.name, summary: G.projet.summary || '',
      systems: G.nodes.filter((n) => !n.parent).map((n) => ({ id: 'n:' + n.id, name: n.label, kind: n.kind, description: n.summary || '', modules: (enfantsDe.get(n.id) || []).map((k) => `n:${k} ${noeuds.get(k).label}`) })),
      parcours: (G.parcours || []).map((f) => ({ title: f.title, steps: f.steps.map((s) => `${s.ref} ${s.note}`) })),
      counts: { files: G.files.length, endpoints: routes.length },
      ...(G.recent ? { recentWork: (G.recent.tasks || []).map((t, ti) => ({ title: t.title, request: t.request, summary: t.summary, changed: G.recent.items.filter((x) => x.task === ti).map((x) => `${x.id} ${x.note}`) })) } : {}),
    };
  }

  return { find, show, path, overview, exists, brief };
}

// À quoi ressemble une réponse, pour les deux moteurs (schéma JSON).
const FLOORPLAN_SCHEMA_REPONSE = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'Titre court pour la vue de la réponse, 6 mots au maximum.' },
    answer: { type: 'string', description: 'La réponse en Markdown, ~180 mots au maximum, en français et en tutoyant. Cite les éléments de la carte dans le texte sous la forme [[id]].' },
    items: { type: 'array', description: 'Les 3 à 14 éléments de la carte les plus utiles à la réponse, le plus important d’abord.', items: { type: 'object', properties: { id: { type: 'string' }, note: { type: 'string', description: 'Pourquoi cet élément compte ici, 15 mots au maximum, en français.' } }, required: ['id', 'note'] } },
    steps: { type: 'array', description: 'Déroulé facultatif, dans l’ordre, quand la réponse est une suite d’étapes (le trajet d’un appel au serveur, un parcours des données). Vide sinon.', items: { type: 'object', properties: { id: { type: 'string' }, note: { type: 'string' } }, required: ['id', 'note'] } },
    followups: { type: 'array', description: '2 ou 3 questions de suite courtes que la personne pourrait poser ensuite, en français.', items: { type: 'string' } },
  },
  required: ['title', 'answer', 'items'],
};

// Un parcours demandé : un déroulé dans l'ordre d'éléments de la carte (schéma JSON).
const FLOORPLAN_SCHEMA_PARCOURS = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'Titre court du parcours, 6 mots au maximum, en français, par exemple « Du panier au paiement Stripe ».' },
    description: { type: 'string', description: 'Une phrase, en français, sur ce que montre le parcours.' },
    steps: { type: 'array', description: 'De 3 à 9 étapes, dans l’ordre où les choses se passent, chacune étant un élément de la carte et ce qui s’y passe.', items: { type: 'object', properties: { id: { type: 'string' }, note: { type: 'string', description: 'Ce qui se passe à cette étape, 18 mots au maximum, en français.' } }, required: ['id', 'note'] } },
  },
  required: ['title', 'steps'],
};

// Un changement demandé sur un plan : les plan.json et architecture.json complets et à jour, et ce qui a changé
// (schéma JSON). Les documents voyagent en texte JSON pour que le schéma reste le même pour chaque moteur.
const FLOORPLAN_SCHEMA_CHANGEMENT = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'Ce qui a changé, 2 à 6 mots, en français, par exemple « Paiements prévus ».' },
    summary: { type: 'string', description: 'En Markdown, ~150 mots au maximum, en français et en tutoyant, avec des mots simples : ce que tu as ajouté, changé ou retiré et pourquoi, plus les nouvelles hypothèses ou questions ouvertes.' },
    plan: { type: 'string', description: 'Le floorplan/plan.json complet et à jour, sous forme de texte JSON.' },
    architecture: { type: 'string', description: 'Le floorplan/architecture.json complet et à jour, sous forme de texte JSON.' },
    changes: { type: 'array', description: 'Chaque bloc nouveau ou modifié : un chemin de fichier, un id de nœud ou "MÉTHODE /chemin".', items: { type: 'object', properties: { ref: { type: 'string' }, change: { type: 'string', enum: ['new', 'changed'] }, note: { type: 'string', description: 'En quoi ce bloc répond à la demande, en une phrase simple et en français.' } }, required: ['ref', 'change', 'note'] } },
    followups: { type: 'array', description: '2 ou 3 changements courts que la personne pourrait demander ensuite, en français.', items: { type: 'string' } },
  },
  required: ['title', 'summary', 'plan', 'architecture', 'changes'],
};

function floorplanConsignesChangement(G) {
  const source = G.meta?.ebauche?.source;
  return [
    `Tu modifies un plan : une carte interactive de « ${G.projet.name} », un système qui est prévu mais pas encore construit. La personne qui la regarde demande un changement, un ajout ou un retrait (« prévois aussi les paiements », « enlève la page d’administration », « l’équipe doit se connecter avec Google »), et tu mets le plan à jour.`,
    `Lis d’abord floorplan/plan.json et floorplan/architecture.json${source ? `, et ${source} (le PRD, le cahier des charges dont il est tiré) quand la demande touche à ce qu’il dit` : ''}. Tu peux chercher dans la carte avec \`node floorplan/query.mjs find "<mots>"\` et \`show <id>\`.`,
    'Format de plan.json : { source, stack[], assumptions[], questions[{question, about[]}], files[{path, name, description, screen?, uses[], calls["MÉTHODE /chemin"], services[ids de nœuds], data[ids de nœuds]}], endpoints[{method, path, file, name, description, access: public|signed-in|team|webhook|internal, who?, publicBecause?}] }. Le fichier de chaque adresse du serveur (endpoint) est un fichier prévu, chaque appel correspond exactement à une adresse du serveur prévue, et services/data désignent des nœuds de architecture.json.',
    'architecture.json : { project, nodes[{id, label, kind, parent?, summary, paths[globs]}], edges[], flows[{id, title, steps[{node, note}]}], tour[] }. Types (kind) : ui service worker library feature data config test script infra external. Les nœuds de type external (services extérieurs, base de données) ne possèdent aucun fichier. Chaque fichier prévu doit entrer dans les paths d’un nœud, donc ajoute ou élargis des globs pour les nouveaux dossiers. Les étapes de flows et de tour désignent des ids de nœuds ou des chemins de fichiers prévus.',
    'Change seulement ce que la demande exige, dans le style du reste du plan : même pile technique et mêmes conventions, des mots simples pour tout le monde, de vrais chemins de fichiers, le tout écrit en français. Garde tous les autres fichiers, adresses du serveur, ids et descriptions exactement comme ils sont. Si le PRD ou le plan a déjà décidé quelque chose, suis-le ; note un nouveau choix dans assumptions et une vraie décision encore ouverte dans questions. Si la demande retire quelque chose, retire tout ce qui ne servait qu’à cela. Si elle répond à l’une des questions de plan.json, supprime cette question, intègre la réponse au plan et note-la dans assumptions ; si elle décide qui peut utiliser une adresse du serveur, renseigne access (et who ou publicBecause). Beaucoup de demandes viennent de la revue du plan de la carte : règle exactement ce qu’elle nomme.',
    'Réponds uniquement en JSON : {"title", "summary", "plan", "architecture", "changes", "followups"} (les clés restent en anglais ; title, summary, les notes et followups sont en français, en tutoyant la personne). plan et architecture sont les fichiers complets et à jour, sous forme de texte JSON, pas seulement les parties modifiées. changes liste chaque fichier, chaque adresse du serveur ("MÉTHODE /chemin") ou chaque id de nœud nouveau ou modifié, avec une note sur la façon dont il répond à la demande.',
    'Ne modifie aucun fichier toi-même : le serveur de la carte vérifie ton JSON, l’enregistre et redessine la carte.',
  ].join('\n');
}

function floorplanConsignesParcours(G, moteur) {
  return [
    `Tu construis des parcours guidés pour la carte d’architecture interactive du code « ${G.projet.name} ». Un parcours est un déroulé dans l’ordre : chaque étape est un élément de la carte (partie n:..., fichier f:..., adresse du serveur r:... ou export s:...) et une note sur ce qui s’y passe. Écris les titres et les notes en français, en langage simple, en tutoyant la personne si tu t’adresses à elle.`,
    moteur === 'cli'
      ? 'Trouve les éléments avec `node floorplan/query.mjs find "<mots>"`, `show <id>` et `path <idDepart> <idArrivee>` ; lis les fichiers source quand tu dois confirmer l’ordre des événements.'
      : 'Trouve les éléments avec les outils find_items, get_item et dependency_path.',
    'Suis ce que la personne demande depuis son déclencheur (une action de l’utilisateur, un webhook, une tâche planifiée) jusqu’à son effet final (écriture dans la base de données, appel à un service extérieur, réponse).',
    'Utilise de 3 à 9 étapes. Préfère l’élément le plus précis qui raconte l’histoire (une adresse du serveur plutôt que son fichier, un fichier plutôt que sa partie), et choisis des étapes consécutives qui s’appellent ou s’importent vraiment les unes les autres.',
    'Réponds uniquement en JSON : {"title", "description", "steps": [{"id", "note"}]} (les clés restent en anglais). N’utilise que des ids donnés par la carte.',
  ].join('\n');
}

function floorplanConsignesQuestion(G, moteur) {
  const outils = moteur === 'cli'
    ? `Interroge la carte depuis le terminal : \`node floorplan/query.mjs overview\`, \`node floorplan/query.mjs find "<mots>" [--kind module|file|endpoint|symbol]\`, \`node floorplan/query.mjs show <id>\`, \`node floorplan/query.mjs path <idDepart> <idArrivee>\`. Chaque résultat est du JSON avec des ids. Commence par la carte ; lis les fichiers source ou cherche dedans quand il te faut des précisions que la carte n’a pas.`
    : `Utilise les outils find_items, get_item et dependency_path pour explorer la carte. Tu ne peux pas lire les fichiers source : réponds à partir des noms, des descriptions, des adresses du serveur et des connexions de la carte, et dis-le quand une question demande le code lui-même.`;
  const ebauche = G.meta?.ebauche;
  return [
    `Tu réponds à des questions sur le code « ${G.projet.name} » pour quelqu’un qui explore sa carte d’architecture interactive. Réponds toujours en français, en tutoyant la personne, avec des mots simples : elle n’est pas forcément développeuse.`,
    `La carte a des blocs pour les parties (ids n:...), les fichiers (f:<chemin>), les adresses du serveur (r:<numéro>) et les éléments exportés (s:<chemin>#<numéro>), chacun avec un nom et une description lisibles, reliés par des imports et des appels au serveur.`,
    outils,
    ebauche ? `Cette carte est un plan : celui d’un système qui n’est pas encore construit, donc ses fichiers n’existent pas.${moteur === 'cli' ? ` Au lieu des fichiers source, lis floorplan/plan.json${ebauche.source ? ` et ${ebauche.source} (le document dont il est tiré)` : ''} quand tu as besoin de plus que la carte.` : ''} Réponds sur ce qui serait construit et pourquoi, et dis clairement quand le plan ne couvre pas un point.` : '',
    'Fais quelques recherches, pas des dizaines. Réponds ensuite uniquement en JSON : {"title", "answer", "items", "steps", "followups"} (les clés restent en anglais).',
    '- answer : en Markdown, ~180 mots au maximum, simple et précis, en français et en tutoyant. Cite les éléments de la carte dans le texte sous la forme [[id]] (ils deviennent cliquables).',
    '- items : les 3 à 14 blocs qui montrent le mieux la réponse, le plus important d’abord, chacun avec une note (15 mots au maximum, en français) sur son rôle.',
    '- steps : un déroulé dans l’ordre quand la réponse est une suite d’étapes (le trajet d’un appel au serveur, un parcours des données) ; sinon [].',
    '- followups : 2 ou 3 questions de suite courtes, en français.',
    'N’utilise que des ids donnés par la carte.',
  ].filter(Boolean).join('\n');
}
