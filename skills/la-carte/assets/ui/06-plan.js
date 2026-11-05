// Plans : une carte prévue à partir d’un PRD ou d’une description, avant que le moindre code existe (graphe.meta.ebauche,
// issue de scripts/plan.mjs). Les blocs ont un contour en pointillés et le nom du projet une pastille « Plan », la
// vue d’ensemble dit à partir de quoi elle a été prévue, et chaque partie prévue propose « Construire ça avec Claude » : une
// demande toute prête pour construire seulement cette partie, en suivant le plan. Ne parle au visualiseur que par window.LaCarte.
(() => {
  const CARTE = window.LaCarte;
  const EBAUCHE = CARTE && CARTE.graphe.meta.ebauche;
  if (!EBAUCHE) return;
  const { h } = CARTE;
  const Maj = (t) => t[0].toUpperCase() + t.slice(1);
  const A = CARTE.agent || { name: 'Claude', app: 'Claude Code' };
  const G = CARTE.graphe;

  document.documentElement.classList.add('blueprint');
  const style = document.createElement('style');
  style.textContent = `
    /* prévu, pas construit : un contour en pointillés sur chaque bloc */
    html.blueprint .card:not(.connector)::after { content: ""; position: absolute; inset: 0; border-radius: inherit; border: 2.5px dashed rgba(var(--ink), .32); pointer-events: none; }
    .bp-pill { display: inline-flex; align-items: center; height: 20px; padding: 0 8px; margin-left: 8px; border-radius: 999px; font-size: 11px; font-weight: 500; letter-spacing: .02em; color: var(--text-2); border: 1px dashed rgba(var(--ink), .35); flex: none; }
    .bp-list { margin: 8px 0 0; padding-left: 18px; color: var(--text-2); font-size: 13px; line-height: 1.55; }
    .bp-list li + li { margin-top: 4px; }
  `;
  document.head.appendChild(style);

  // une pastille « Plan » à côté du titre du tableau, qui est redessiné à chaque déplacement
  const ajouterPastille = () => {
    const k = document.querySelector('#context h1');
    if (!k || k.querySelector('.bp-pill')) return;
    k.insertAdjacentHTML('beforeend', '<span class="bp-pill" title="Prévu, pas encore construit : chaque bloc est une partie dont le système aurait besoin.">Plan</span>');
  };
  CARTE.sur('render', ajouterPastille);
  CARTE.sur('ready', ajouterPastille);

  const ACCES = { public: 'tout le monde', 'signed-in': 'les utilisateurs connectés', team: 'seulement l’équipe qui fait tourner le service', webhook: 'le service qui l’envoie, qui doit prouver que c’est lui', internal: 'seulement nos propres services' };
  /** "accès : les responsables de ce site", ou la question ouverte quand personne n’a décidé. */
  const quiPeut = (r) => !r.access ? 'accès : pas encore décidé, demande-moi'
    : `accès : ${r.access === 'signed-in' && r.who ? r.who : ACCES[r.access] || r.access}${r.publicBecause ? ` ; raison : ${r.publicBecause.replace(/\.$/, '')}` : ''}`;

  CARTE.ajouterSectionPanneau('overview', () => ({
    html: `<div class="sec"><h3>Plan</h3>
      <p class="pd">Prévu${EBAUCHE.source ? ` à partir de <b>${h(EBAUCHE.source)}</b>` : ''}, pas encore construit. Chaque bloc en pointillés est une partie dont le système aurait besoin.${CARTE.exporte ? '' : ` Choisis-en un puis clique sur <b>Construire ça avec ${h(A.name)}</b> pour commencer.`}</p>
      ${EBAUCHE.stack?.length ? `<div class="tags" style="margin-top:10px">${EBAUCHE.stack.map((s) => `<span class="tag">${h(s)}</span>`).join('')}</div>` : ''}
      ${EBAUCHE.assumptions?.length ? `<h3 style="margin-top:14px">Hypothèses</h3><ul class="bp-list">${EBAUCHE.assumptions.map((a) => `<li>${h(a)}</li>`).join('')}</ul>` : ''}
    </div>`,
  }));

  /** Les fichiers prévus dans un élément (une partie, un dossier ou un seul fichier). */
  const fichiersDans = (id) => G.files.filter((f) => id === 'f:' + f.p || CARTE.chaine('f:' + f.p).includes(id));
  function construireDemande(id) {
    const i = CARTE.infos(id);
    const fichiersPartie = fichiersDans(id);
    const chemins = new Set(fichiersPartie.map((f) => 'f:' + f.p));
    const adresses = CARTE.routes.filter((r) => chemins.has('f:' + r.f));
    const dependances = new Map();
    for (const l of G.links) {
      if (!chemins.has(l.a) || chemins.has(l.b)) continue;
      const o = CARTE.infos(l.b);
      if (o) dependances.set(l.b, `${o.name}${l.b.startsWith('f:') ? ` (${l.b.slice(2)})` : ''}`);
    }
    // questions ouvertes du PRD qui touchent cette partie
    const dedans = (x) => x === id || chemins.has(x) || (x.startsWith('r:') && chemins.has('f:' + CARTE.routes[+x.slice(2)]?.f)) || (CARTE.existe(x) && CARTE.chaine(x).includes(id));
    const questions = (G.sante?.problemes || []).filter((q) => q.kind === 'question' && (q.items || []).some(dedans)).map((q) => q.title);
    return [
      `Construis « ${i.name} » à partir du plan de ${G.projet.name} : la-carte/sources/plan.json et la-carte/sources/architecture.json${EBAUCHE.source ? `, prévu à partir de ${EBAUCHE.source}` : ''}.`,
      i.desc ? `\nÀ quoi ça sert : ${i.desc}` : '',
      EBAUCHE.stack?.length ? `\nTechnologies utilisées : ${EBAUCHE.stack.join('; ')}.` : '',
      `\nFichiers à créer :`,
      ...fichiersPartie.map((f) => `- ${f.p} : ${f.name}${f.d ? `. ${f.d}` : ''}`),
      adresses.length ? `\nAdresses du serveur à créer (garde exactement la méthode, le chemin et qui peut les utiliser, comme prévu) :` : '',
      ...adresses.map((r) => `- ${r.m} ${r.p} (${quiPeut(r)}) : ${r.name}${r.d ? `. ${r.d}` : ''}`),
      dependances.size ? `\nDépendances : ${[...dependances.values()].join('; ')}.` : '',
      questions.length ? `\nPas encore décidé (demande-moi avant de construire ce qui en dépend) :\n${questions.map((q) => `- ${q}`).join('\n')}` : '',
      `\nAvant d’écrire du code, lis ces parties de plan.json et regarde lesquelles de ses dépendances existent déjà ; si certaines manquent, dis-le-moi et propose ce qu’il faut construire en premier. Garde les chemins et les noms de fichiers du plan. Si le plan te paraît faux ou incomplet pour cette partie, dis-le-moi avant d’y toucher. Quand c’est terminé, lance-le ou lance ses tests et explique-moi comment l’essayer. Réponds-moi en français, en me tutoyant, en langage simple.`,
    ].filter((x) => x !== '').join('\n');
  }

  CARTE.ajouterSectionPanneau('item', (id) => {
    if (!id || typeof id !== 'string') return '';
    // une adresse du serveur : qui le plan laisse l’utiliser
    if (id.startsWith('r:')) {
      const r = CARTE.routes[+id.slice(2)];
      if (!r) return '';
      const texte = !r.access ? `Pas encore décidé.${CARTE.graphe.sante ? ' La revue du plan la signale.' : ''}` : `${Maj(r.access === 'signed-in' && r.who ? r.who : ACCES[r.access] || r.access)}.${r.publicBecause ? ` Ouverte exprès : ${r.publicBecause}` : ''}`;
      return `<div class="sec"><h3>Qui peut l’utiliser</h3><p class="pd">${h(texte)}</p></div>`;
    }
    const i = CARTE.infos(id);
    if (CARTE.exporte || !i || (i.type === 'node' && i.n.kind === 'external') || !fichiersDans(id).length) return '';
    return {
      html: `<div class="sec"><h3>Construire</h3><p class="pd">Une demande prête pour ${h(A.app)} afin de construire ${i.type === 'file' ? 'ce fichier' : 'cette partie'} comme le décrit le plan.</p>
        <div class="actions"><button class="btn soft" data-bp-build>${CARTE.iconeI('spark')}Construire ça avec ${h(A.name)}</button></div></div>`,
      bind: (el) => el.querySelector('[data-bp-build]')?.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const demande = construireDemande(id);
        CARTE.fenetre({
          title: `Construire ça avec ${A.name}`,
          html: `<p class="hc-hint">Copie cette demande et colle-la dans <b>${h(A.app)}</b>, ouvert dans le dossier de ton projet.</p><pre>${h(demande)}</pre>`,
          actions: [{ label: 'Copier la demande', primary: true, icon: 'copy', onClick: () => { CARTE.copier(demande); CARTE.message(`Copié. Colle la demande dans ${A.app}.`); } }],
        });
      }),
    };
  });
})();
