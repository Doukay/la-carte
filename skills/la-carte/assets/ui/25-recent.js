// Travail récent : ce que Claude vient de changer (graphe.recent, tiré de la-carte/.cache/travail-recent.json), mis en regard de
// ce que la personne avait demandé. Les blocs portent l'étiquette verte et la note au survol (visualiseur de base) ; ce fichier ajoute le
// bouton d'en-tête qui range les blocs modifiés sur un seul tableau, et les sections du panneau. Ne parle au visualiseur que
// par window.LaCarte.
(() => {
  const CARTE = window.LaCarte;
  const R = CARTE && CARTE.graphe.recent;
  if (!R || !R.items || !R.items.length) return;
  const { h } = CARTE;
  const taches = R.tasks || [];
  const elements = R.items.filter((it) => CARTE.existe(it.id));
  if (!elements.length) return;

  CARTE.icones.recent = '<path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/>';

  const style = document.createElement('style');
  style.textContent = `
    #btn-recent svg.i { color: var(--recent); }
    .rw-task { padding: 12px 14px; border-radius: 16px; background: color-mix(in srgb, var(--recent) 6%, transparent); margin-bottom: 8px; }
    .rw-task:last-child { margin-bottom: 0; }
    .rw-tt { display: flex; gap: 9px; align-items: center; font-weight: 600; line-height: 1.4; }
    .rw-tt::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: var(--recent); flex: none; }
    .rw-q { color: var(--text-3); font-size: 12.5px; line-height: 1.5; margin: 6px 0 0 16px; }
    .rw-q b { color: var(--text-2); font-weight: 500; }
    .rw-s { color: var(--text-2); font-size: 12.5px; line-height: 1.55; margin: 6px 0 0 16px; }
    .rw-a { display: flex; gap: 6px; margin: 10px 0 0 16px; }
    .rw-a .btn { height: 30px; padding: 0 12px; font-size: 12.5px; gap: 6px; }
    .rw-note { margin-top: 10px; padding: 10px 12px; border-radius: 14px; background: color-mix(in srgb, var(--recent) 9%, transparent); font-size: 13px; line-height: 1.55; }
    .rw-note .rw-h { color: var(--recent); font-size: 11.5px; font-weight: 600; margin-bottom: 3px; }
    .rw-when { color: var(--text-3); font-size: 12px; margin-top: 4px; }
  `;
  document.head.appendChild(style);

  const ilYA = (iso) => {
    const t = Date.parse(iso); if (!t) return '';
    const m = Math.round((Date.now() - t) / 60000);
    return m < 2 ? 'à l’instant' : m < 60 ? `il y a ${m} minutes` : m < 48 * 60 ? `il y a ${CARTE.pluriel(Math.round(m / 60), 'heure')}` : `il y a ${Math.round(m / 1440)} jours`;
  };
  const elementsDe = (ti) => elements.filter((it) => ti == null || it.task === ti);

  /** Un tableau avec seulement les blocs modifiés (et la façon dont ils sont reliés), chacun avec sa note. */
  function montrerRecent(ti) {
    const seule = ti != null ? taches[ti] : taches.length === 1 ? taches[0] : null;
    CARTE.montrerTableau({
      kind: 'Travail récent', icon: 'recent',
      title: seule ? seule.title : 'Travail récent',
      question: seule ? (seule.request ? `Tu as demandé : ${seule.request}` : '') : taches.map((t) => t.title).join(' · '),
      answer: seule ? seule.summary : taches.map((t) => `**${t.title}.** ${t.summary}`).join('\n\n'),
      items: elementsDe(ti != null ? ti : null).map((it) => ({ id: it.id, note: it.note || (it.change === 'new' ? 'Nouveau' : 'Modifié') })),
    });
  }

  const bouton = CARTE.ajouterBoutonEntete({ id: 'btn-recent', label: 'Travail récent', icon: 'recent', title: 'Ce sur quoi on vient de travailler, sur un seul tableau', onClick: () => montrerRecent() });
  const b = document.createElement('span');
  b.className = 'badge';
  b.textContent = String(elements.length);
  bouton.appendChild(b);

  // panneau du code : chaque tâche, ce qui était demandé, ce qui a été fait, et un moyen de voir ses blocs
  CARTE.ajouterSectionPanneau('overview', () => ({
    top: true,
    html: `<div class="sec"><h3>Travail récent <span class="c">${elements.length}</span></h3>${R.updatedAt ? `<div class="rw-when">Mis à jour ${h(ilYA(R.updatedAt))}</div>` : ''}<div style="margin-top:10px">${taches.map((t, i) => elementsDe(i).length ? `
      <div class="rw-task"><div class="rw-tt">${h(t.title)}</div>
        ${t.request ? `<div class="rw-q"><b>Tu as demandé :</b> ${h(t.request)}</div>` : ''}
        ${t.summary ? `<div class="rw-s">${h(t.summary)}</div>` : ''}
        <div class="rw-a"><button class="btn soft" data-rw="${i}">${CARTE.iconeI('recent')}Voir ${CARTE.pluriel(elementsDe(i).length, 'bloc')}</button></div></div>` : '').join('')}</div></div>`,
    bind: (el) => el.querySelectorAll('[data-rw]').forEach((x) => x.addEventListener('click', () => montrerRecent(+x.dataset.rw))),
  }));

  // un bloc sélectionné qui a changé : la note complète, et la demande qui l'a provoqué. Une partie qui
  // contient des changements : ce qui a changé à l'intérieur, chacun à un clic.
  CARTE.ajouterSectionPanneau('item', (id) => {
    const cle = id.startsWith('m:') ? 'f:' + id.slice(2) : id;
    const miens = elements.filter((it) => it.id === cle);
    const dedans = elements.filter((it) => it.id !== cle && CARTE.chaine(it.id).includes(cle));
    if (!miens.length && !dedans.length) return '';
    if (!miens.length) return { top: true, html: `<div class="sec"><h3>Travail récent à l’intérieur <span class="c">${dedans.length}</span></h3><div class="list">${dedans.map((it) => {
      const i = CARTE.infos(it.id);
      return `<a class="row" data-go="${h(it.id)}"><span class="dot" style="background:var(--recent)"></span><span class="rt"><div class="rn">${h(i.name)}</div>${it.note ? `<div class="rd">${h(it.note)}</div>` : ''}</span></a>`;
    }).join('')}</div></div>` };
    return { top: true, html: `<div class="sec">${miens.map((it) => {
      const t = taches[it.task] || {};
      return `<div class="rw-note"><div class="rw-h">${it.change === 'new' ? 'Nouveau' : 'Modifié'} · ${h(t.title || 'Travail récent')}</div>${h(it.note || '')}${t.request ? `<div class="rw-q" style="margin:6px 0 0"><b>Tu as demandé :</b> ${h(t.request)}</div>` : ''}</div>`;
    }).join('')}</div>` };
  });

  window.LaCarteRecent = { show: montrerRecent, items: elements, tasks: taches };
})();
