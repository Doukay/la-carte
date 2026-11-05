// Panneau du contrôle de santé : des avertissements en langage simple tirés de graphe.sante (lib/sante.mjs) — clés qui fuient,
// adresses du serveur ouvertes à tous, fichiers inutilisés ou trop gros — chacun avec « Voir sur la carte » et une demande
// toute prête à coller dans Claude Code ou Codex. Ne parle au visualiseur que par window.LaCarte.
(() => {
  const CARTE = window.LaCarte;
  // une copie exportée sans la Santé laisse le bouton de côté : une liste vide se lirait comme « tout va bien »
  if (!CARTE || (CARTE.exporte && !CARTE.graphe.sante)) return;
  const { h } = CARTE;
  const A = CARTE.agent || { name: 'Claude', app: 'Claude Code' };
  const problemes = (CARTE.graphe.sante && CARTE.graphe.sante.problemes) || [];
  // un plan (prévu, pas construit) a droit à une revue du plan plutôt qu'à un contrôle du code
  const PLAN = !!CARTE.graphe.meta.ebauche;
  const VERBE = PLAN ? 'Résoudre' : 'Corriger';
  const CONTROLE = PLAN ? 'la revue du plan' : 'le contrôle de santé';

  // ---------- « pas un problème » ----------
  // Enregistré par serveur.mjs dans la-carte/sources/rejets-sante.json (build le range dans graphe.sante.dismissed) ;
  // une carte ouverte sans le serveur les garde dans ce navigateur. Un rejet couvre le problème tel qu'il était : il
  // réapparaît s'il devient plus ou moins grave ou s'il trouve quelque chose de nouveau dans un fichier (compté par fichier, donc une
  // modification plus haut ne le fait pas revenir ; c'est la même règle que rejetPour dans lib/sante.mjs).
  const SERVEUR = window.LA_CARTE_SERVER;
  const CLE_STOCKAGE = 'health-dismissed:' + (CARTE.graphe.meta.rootName || '');
  const construits = (CARTE.graphe.sante && CARTE.graphe.sante.dismissed) || [];
  let rejetes = CARTE.exporte || SERVEUR ? construits : CARTE.stockage.get(CLE_STOCKAGE, construits);
  const lieuxDe = (issue) => (issue.locations || []).map((l) => `${l.file}:${l.line}`);
  const rejetDe = (issue) => {
    const d = rejetes.find((x) => x.id === issue.id);
    if (!d || (d.severity && d.severity !== issue.severity)) return null;
    const left = new Map();
    for (const loc of d.locations || []) { const f = String(loc).replace(/:[^:]*$/, ''); left.set(f, (left.get(f) || 0) + 1); }
    for (const l of issue.locations || []) { const n = left.get(l.file) || 0; if (!n) return null; left.set(l.file, n - 1); }
    return d;
  };
  const peutRejeter = !CARTE.exporte;
  async function enregistrerRejet(issue, raison) {
    const enregistrement = { id: issue.id, severity: issue.severity, locations: lieuxDe(issue), ...(raison ? { reason: raison } : {}) };
    if (SERVEUR) {
      const r = await fetch('/api/health/dismissed', { method: 'POST', headers: { 'content-type': 'application/json', 'x-la-carte-token': SERVEUR.token }, body: JSON.stringify(enregistrement) }).then((x) => x.json()).catch(() => null);
      if (!r) { CARTE.message('Impossible de joindre le serveur de la carte, donc ce n’est pas enregistré.'); return false; }
      rejetes = r.dismissed;
    } else {
      rejetes = [...rejetes.filter((x) => x.id !== issue.id), { ...enregistrement, at: new Date().toISOString() }];
      CARTE.stockage.set(CLE_STOCKAGE, rejetes);
    }
    return true;
  }
  async function annulerRejet(issue) {
    if (SERVEUR) {
      const r = await fetch('/api/health/dismissed', { method: 'DELETE', headers: { 'content-type': 'application/json', 'x-la-carte-token': SERVEUR.token }, body: JSON.stringify({ id: issue.id }) }).then((x) => x.json()).catch(() => null);
      if (!r) { CARTE.message('Impossible de joindre le serveur de la carte.'); return; }
      rejetes = r.dismissed;
    } else {
      rejetes = rejetes.filter((x) => x.id !== issue.id);
      CARTE.stockage.set(CLE_STOCKAGE, rejetes);
    }
    actualiser();
  }

  const GRAVITE = {
    high: { color: 'var(--sev-high)', group: 'À corriger en premier', word: 'à voir d’abord' },
    medium: { color: 'var(--sev-medium)', group: 'À corriger bientôt', word: 'à corriger bientôt' },
    low: { color: 'var(--sev-low)', group: 'À ranger quand tu peux', word: 'à ranger' },
  };
  const ORDRE = ['high', 'medium', 'low'];
  const actifs = () => problemes.filter((i) => !rejetDe(i));
  const compter = (gravite) => actifs().filter((i) => i.severity === gravite).length;
  const urgents = () => compter('high') + compter('medium');

  CARTE.icones.sante = '<path d="M3 12h4l2.5-6 4 12 2.5-6H21"/>';
  CARTE.icones.check = '<path d="m5 12.5 4.5 4.5L19 7.5"/>';

  const style = document.createElement('style');
  style.textContent = `
    .hc-issue { padding: 12px 14px; border-radius: 16px; background: rgba(var(--ink), .04); margin-bottom: 8px; }
    .hc-issue:last-child { margin-bottom: 0; }
    .hc-issue.off { background: none; box-shadow: inset 0 0 0 1px rgba(var(--ink), .08); }
    .hc-issue.off .hc-t { color: var(--text-2); }
    .hc-t { display: flex; gap: 9px; align-items: flex-start; font-weight: 500; line-height: 1.4; }
    .hc-t .dot { margin-top: 6px; }
    .hc-d { color: var(--text-2); font-size: 12.5px; line-height: 1.55; margin: 6px 0 0 17px; }
    .hc-n { color: var(--text-3); font-size: 12.5px; line-height: 1.45; margin: 4px 0 0 17px; }
    .hc-w { font-family: var(--mono); font-size: 11px; color: var(--text-3); margin: 6px 0 0 17px; word-break: break-all; line-height: 1.5; }
    .hc-a { display: flex; gap: 6px; flex-wrap: wrap; margin: 10px 0 0 17px; }
    .hc-a .btn { height: 30px; padding: 0 12px; font-size: 12.5px; gap: 6px; }
    .hc-a .btn svg.i { width: 14px; height: 14px; }
    .hc-calm { margin-top: 14px; padding: 11px 13px; border-radius: 14px; background: var(--ok-bg); color: var(--ok-text); font-size: 13px; line-height: 1.55; }
    .hc-sub { display: flex; flex-wrap: wrap; gap: 4px 14px; margin-top: 12px; font-size: 12px; color: var(--text-2); }
    .hc-sub span { display: inline-flex; align-items: center; gap: 6px; }
    #btn-health .badge { background: var(--hc-badge, var(--on)); color: var(--hc-badge-text, var(--on-text)); }
    #btn-health.calm svg.i { color: var(--ok); }
    #modal .hc-hint { margin: 0; }
    #modal .hc-hint b { color: var(--text); font-weight: 500; }
    #modal .hc-why { width: 100%; min-height: 72px; resize: vertical; margin-top: 12px; background: rgba(var(--ink), .05); border: 0; border-radius: 14px; padding: 11px 13px; color: var(--text); outline: none; font: inherit; font-size: 13px; line-height: 1.5; box-sizing: border-box; }
    #modal .hc-why:focus { background: rgba(var(--ink), .07); box-shadow: 0 0 0 1px rgba(var(--ink), .14); }
  `;
  document.head.appendChild(style);

  // ---------- actions ----------
  let estOuverte = false, ouverteA = null;
  const position = () => JSON.stringify([CARTE.etat.selected, CARTE.etat.container]);
  function fermerListe() { estOuverte = false; CARTE.fermerPanneau(); }
  function montrerSurCarte(issue) {
    const elements = (issue.items || []).filter((id) => CARTE.existe(id)).map((id) => ({ id, note: (issue.notes && issue.notes[id]) || '' }));
    if (!elements.length) { CARTE.message(`Celui-ci n’est pas sur la carte. Utilise plutôt « ${VERBE} avec ${A.name} ».`); return; }
    if (estOuverte) fermerListe();
    CARTE.montrerTableau({ title: issue.title, question: issue.detail, items: elements });
  }
  // un plan servi règle les points de la revue sur la carte : la demande va dans le mode Modifier de la bulle de questions,
  // pour que la personne la termine (une question ouverte attend sa réponse) ou la modifie, puis l'envoie
  const ici = (issue) => PLAN && !!issue.change && !!CARTE.peutChanger?.();
  function resoudreIci(issue) {
    if (estOuverte) fermerListe();
    if (!CARTE.preparerChangement(issue.change)) { corrigerAvec(issue); return; }
    CARTE.message(issue.kind === 'question' ? 'Écris ta réponse, puis appuie sur Entrée' : 'Modifie la demande si tu veux, puis appuie sur Entrée');
  }
  function corrigerAvec(issue) {
    CARTE.fenetre({
      title: `${VERBE} avec ${A.name}`,
      html: `<p class="hc-hint">Copie cette demande et colle-la dans <b>${A.app}</b>, ouvert dans le dossier de ton projet. Elle explique quoi changer et demande avant tout ce qui est risqué.</p><pre>${h(issue.fix)}</pre>`,
      actions: [{ label: 'Copier la demande', primary: true, icon: 'copy', onClick: () => { CARTE.copier(issue.fix); CARTE.message(`Copié. Colle-la dans ${A.app}.`); } }],
    });
  }
  function pasUnProbleme(issue) {
    const m = CARTE.fenetre({
      title: 'Pas un problème ?',
      html: `<p class="hc-hint">Marque « ${h(issue.title)} » comme fausse alerte : il descend en bas de la liste et n’est plus compté. Il revient si ${CONTROLE} trouve quelque chose de nouveau à cet endroit.</p>
        <textarea class="hc-why" placeholder="Pourquoi ? (facultatif) par exemple : cette valeur est un hachage bcrypt, pas le mot de passe" spellcheck="true"></textarea>`,
      actions: [{ label: 'Marquer comme pas un problème', primary: true, icon: 'check', keepOpen: true, onClick: async (fermer) => {
        const raison = m.el.querySelector('.hc-why').value.trim();
        if (!(await enregistrerRejet(issue, raison))) return;
        fermer();
        actualiser();
        CARTE.message('Marqué comme pas un problème.');
      } }],
    });
    const pourquoi = m.el.querySelector('.hc-why');
    pourquoi.focus();
  }
  const surLaCarte = (issue) => (issue.items || []).some((id) => CARTE.existe(id));

  // ---------- html ----------
  const texteLieux = (issue) => {
    const lieux = issue.locations || [];
    if (!CARTE.technique() || !lieux.length) return '';
    const affiches = lieux.slice(0, 3).map((l) => `${l.file}${l.line > 1 ? ':' + l.line : ''}`);
    return `<div class="hc-w">${affiches.map(h).join('<br>')}${lieux.length > 3 ? `<br>+${lieux.length - 3} autres` : ''}</div>`;
  };
  const htmlProbleme = (issue, indice, note) => {
    const d = rejetDe(issue);
    if (d) return `<div class="hc-issue off">
        <div class="hc-t"><span class="dot" style="background:rgba(var(--ink),.2)"></span><span>${h(issue.title)}</span></div>
        <div class="hc-n">Marqué comme pas un problème${d.reason ? `: ${h(d.reason)}` : ''}</div>
        ${peutRejeter ? `<div class="hc-a"><button class="btn soft" data-hc-undo="${indice}">Montrer à nouveau</button></div>` : ''}
      </div>`;
    return `<div class="hc-issue">
      <div class="hc-t"><span class="dot" style="background:${GRAVITE[issue.severity].color}"></span><span>${h(issue.title)}</span></div>
      ${note ? `<div class="hc-n">${h(note)}</div>` : `<div class="hc-d">${h(issue.detail)}</div>`}
      ${texteLieux(issue)}
      <div class="hc-a">
        ${surLaCarte(issue) ? `<button class="btn soft" data-hc-show="${indice}">${CARTE.iconeI('search')}Voir sur la carte</button>` : ''}
        ${CARTE.exporte ? '' : ici(issue) ? `<button class="btn soft" data-hc-here="${indice}">${CARTE.iconeI('spark')}Résoudre sur la carte</button>` : `<button class="btn soft" data-hc-fix="${indice}">${CARTE.iconeI('spark')}${VERBE} avec ${A.name}</button>`}
        ${peutRejeter ? `<button class="btn soft" data-hc-dismiss="${indice}">${CARTE.iconeI('check')}Pas un problème</button>` : ''}
      </div>
    </div>`;
  };
  const brancherProblemes = (el) => {
    const lier = (attribut, fonction) => el.querySelectorAll(`[data-hc-${attribut}]`).forEach((b) => b.addEventListener('click', (ev) => { ev.stopPropagation(); fonction(problemes[+b.getAttribute(`data-hc-${attribut}`)]); }));
    lier('show', montrerSurCarte); lier('fix', corrigerAvec); lier('here', resoudreIci); lier('dismiss', pasUnProbleme); lier('undo', annulerRejet);
  };
  const phraseTitre = () => urgents() ? `${CARTE.pluriel(urgents(), 'point')} demande${urgents() === 1 ? '' : 'nt'} de l’attention` : actifs().length ? 'Rien d’urgent' : 'Aucun problème trouvé';
  const repartition = () => `<div class="hc-sub">${ORDRE.filter(compter).map((s) => `<span><i class="dot" style="background:${GRAVITE[s].color}"></i>${compter(s)} ${GRAVITE[s].word}</span>`).join('')}</div>`;
  const couleurTitre = () => urgents() ? GRAVITE[compter('high') ? 'high' : 'medium'].color : 'var(--ok)';

  function htmlListe() {
    const vivants = actifs(), ecartes = problemes.filter(rejetDe);
    const haut = `<div class="sec">
        <div class="ph"><span class="ico" style="--c:${couleurTitre()}">${CARTE.icone('health')}</span><span class="kindlabel">${PLAN ? 'Revue du plan' : 'Contrôle de santé'}</span></div>
        <h2 class="pt">${h(phraseTitre())}</h2>
        <p class="pd">${PLAN ? 'On a vérifié le plan : les parties que n’importe qui sur Internet pourrait utiliser, les décisions que le PRD laisse ouvertes, et les morceaux auxquels rien n’est relié. Les régler maintenant coûte moins cher qu’après la construction.' : 'On a cherché les clés laissées dans le code ou envoyées au navigateur, les données et les parties de ton appli que n’importe qui sur Internet peut atteindre (tables Supabase, règles Firebase, webhooks Stripe, adresses du serveur), les fichiers inutilisés et les fichiers trop gros pour être modifiés sans risque. C’est un contrôle rapide, pas un audit de sécurité.'}</p>
        ${vivants.length ? repartition() : `<div class="hc-calm">${ecartes.length ? `Il ne reste rien à regarder : tu as marqué ${CARTE.pluriel(ecartes.length, 'point')} comme pas un problème.` : `Rien ne ressort.`}${PLAN ? ' C’est un contrôle automatique rapide, pas une vraie revue du plan.' : ''}</div>`}
        <div class="actions"><button class="btn soft" data-hc-back>${CARTE.iconeI('left')}Retour</button></div>
      </div>`;
    const groupes = ORDRE.map((gravite) => {
      const liste = problemes.map((i, indice) => [i, indice]).filter(([i]) => i.severity === gravite && !rejetDe(i));
      return liste.length ? `<div class="sec"><h3>${h(GRAVITE[gravite].group)} <span class="c">${liste.length}</span></h3>${liste.map(([i, indice]) => htmlProbleme(i, indice)).join('')}</div>` : '';
    }).join('');
    const htmlEcartes = ecartes.length ? `<div class="sec"><h3>Marqués comme pas un problème <span class="c">${ecartes.length}</span></h3>${problemes.map((i, indice) => [i, indice]).filter(([i]) => rejetDe(i)).map(([i, indice]) => htmlProbleme(i, indice)).join('')}</div>` : '';
    const pied = !vivants.length ? '' : CARTE.exporte ? `<div class="sec" style="color:var(--text-3);font-size:12px;line-height:1.6">Ce sont des indications automatiques, prises au moment de l’export de cette copie.</div>` : `<div class="sec" style="color:var(--text-3);font-size:12px;line-height:1.6">Ce sont des indications automatiques. ${vivants.some(ici)
      ? `« Résoudre sur la carte » met une demande dans le mode Modifier de la bulle de questions : termine-la ou modifie-la, appuie sur Entrée, et ${A.name} met à jour le plan et redessine la carte. Annuler remet tout comme avant.`
      : `« ${VERBE} avec ${A.name} » te donne une demande à coller dans ${A.app} ; ${PLAN ? 'elle explique le choix et met à jour le plan une fois que tu as décidé' : 'elle vérifie le code avant de changer quoi que ce soit'}.`} Si l’une d’elles est fausse, « Pas un problème » la met de côté.</div>`;
    return haut + groupes + htmlEcartes + pied;
  }
  function ouvrirListe() {
    estOuverte = true;
    ouverteA = position();
    CARTE.montrerPanneau(htmlListe(), (panneau) => {
      panneau.querySelector('[data-hc-back]')?.addEventListener('click', fermerListe);
      brancherProblemes(panneau);
    });
  }

  // ---------- en-tête ----------
  const bouton = CARTE.ajouterBoutonEntete({
    id: 'btn-health', label: PLAN ? 'Revue' : 'Santé', icon: 'health',
    onClick: () => (estOuverte ? fermerListe() : ouvrirListe()),
  });
  const pastille = document.createElement('span');
  pastille.className = 'badge';
  function majBouton() {
    const n = urgents();
    bouton.title = `${PLAN ? 'Revue du plan' : 'Contrôle de santé'} : ${n ? phraseTitre() : 'rien d’urgent'}`;
    bouton.querySelector('svg.i').innerHTML = CARTE.icones[n ? 'health' : 'check'];
    if (n) {
      pastille.textContent = n > 99 ? '99+' : String(n);
      bouton.style.setProperty('--hc-badge', compter('high') ? GRAVITE.high.color : GRAVITE.medium.color);
      bouton.style.setProperty('--hc-badge-text', 'var(--on-sev-text)');
      bouton.appendChild(pastille);
    } else pastille.remove();
    bouton.classList.toggle('calm', !n);
    bouton.setAttribute('aria-label', bouton.title); // garde son nom, avec le compte, quand seule l'icône s'affiche
  }
  function actualiser() {
    majBouton();
    if (estOuverte) ouvrirListe(); else CARTE.actualiserPanneau();
  }
  majBouton();
  // la liste du serveur est celle qui est enregistrée : elle a pu changer depuis la construction de cette carte
  if (SERVEUR && peutRejeter) fetch('/api/health/dismissed', { headers: { 'x-la-carte-token': SERVEUR.token } }).then((r) => r.json()).then((r) => { if (Array.isArray(r.dismissed)) { rejetes = r.dismissed; actualiser(); } }).catch(() => {});

  // Sélectionner autre chose sur la carte pendant que la liste est ouverte affiche cet élément à la place.
  CARTE.sur('panel', () => { if (estOuverte && ouverteA && position() !== ouverteA) { estOuverte = false; CARTE.fermerPanneau(); } });

  CARTE.ajouterSectionPanneau('overview', () => ({
    html: `<div class="sec"><h3>${PLAN ? 'Revue du plan' : 'Santé'}</h3><div class="list"><a class="row" data-hc-open>
        <span class="dot" style="background:${couleurTitre()}"></span>
        <span class="rt"><div class="rn">${h(phraseTitre())}</div><div class="rd">${actifs().length ? ORDRE.filter(compter).map((s) => `${compter(s)} ${GRAVITE[s].word}`).join(' · ') : PLAN ? 'Contrôle automatique rapide du plan' : 'Contrôle automatique rapide des secrets, des adresses du serveur ouvertes et des fichiers inutilisés'}</div></span>
        <span class="rc">${CARTE.iconeI('right')}</span></a></div></div>`,
    bind: (el) => el.querySelector('[data-hc-open]')?.addEventListener('click', (ev) => { ev.preventDefault(); ouvrirListe(); }),
  }));

  CARTE.ajouterSectionPanneau('item', (idElement) => {
    if (!idElement || typeof idElement !== 'string' || !problemes.length) return '';
    const touches = [];
    problemes.forEach((issue, indice) => {
      if (rejetDe(issue)) return;
      const dedans = (issue.items || []).filter((id) => id === idElement || (CARTE.existe(id) && CARTE.chaine(id).includes(idElement)));
      if (!dedans.length) return;
      const precis = issue.notes && dedans.includes(idElement) ? issue.notes[idElement] : '';
      touches.push(htmlProbleme(issue, indice, precis || (dedans.length > 1 || dedans[0] !== idElement ? `Concerne ${CARTE.pluriel(dedans.length, 'endroit')} à l’intérieur` : '')));
    });
    if (!touches.length) return '';
    return { html: `<div class="sec"><h3>${PLAN ? 'Revue du plan' : 'Santé'} <span class="c">${touches.length}</span></h3>${touches.slice(0, 6).join('')}${touches.length > 6 ? `<div class="more" data-hc-open style="cursor:pointer">+${touches.length - 6} autres dans ${CONTROLE}</div>` : ''}</div>`, bind: (el) => { brancherProblemes(el); el.querySelector('[data-hc-open]')?.addEventListener('click', ouvrirListe); } };
  });
})();
