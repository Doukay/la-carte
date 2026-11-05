// ======================= panneau de détails =======================
const urlEditeur = (p, ligne = 1) => G.meta.root && !PLAN ? `vscode://file/${encodeURI(G.meta.root.replace(/\\/g, '/'))}/${encodeURI(p)}:${ligne}` : null;
const ligneDe = (element, extra = '') => {
  const i = infosBloc(element);
  return `<a class="row" data-go="${h(element)}" title="${h(i.path || '')}"><span class="dot" style="background:${couleurBloc(i)}"></span><span class="rt"><div class="rn">${h(i.name)}</div>${i.desc ? `<div class="rd">${h(i.desc)}</div>` : ''}</span>${extra ? `<span class="rc">${extra}</span>` : ''}</a>`;
};
const ligneRoute = (ri, extra = '') => {
  const r = routes[ri];
  return `<a class="row" data-go="r:${ri}"><span class="method" style="--m:${varMethode(r.m)};margin-top:1px">${h(r.m)}</span><span class="rt"><div class="rn">${h(r.name)}</div>${r.d ? `<div class="rd">${h(r.d)}</div>` : ''}<div class="rp">${h(r.p)}</div></span>${extra ? `<span class="rc">${extra}</span>` : ''}</a>`;
};
const sectionListe = (titre, rangees, count, max = 30) => rangees.length ? `<div class="sec"><h3>${h(titre)} <span class="c">${count ?? rangees.length}</span></h3><div class="list">${rangees.slice(0, max).join('')}${rangees.length > max ? `<div class="more">+${rangees.length - max} de plus</div>` : ''}</div></div>` : '';
const boiteChemin = (p) => `<div class="pp"><span>${h(p)}</span><button data-copy="${h(p)}" title="Copier">${pictoI('copy')}</button></div>`;
function enteteFiche(i) {
  return `<div class="ph"><span class="ico" style="--c:${couleurBloc(i)}">${picto(clePicto(i))}</span><h2 class="pt">${h(i.name)}</h2></div>
    ${i.desc ? `<p class="pd">${h(i.desc)}</p>` : '<p class="pd empty">Pas encore de description.</p>'}`;
}

const CREDIT = `<div class="credit">D’après <a href="https://github.com/haydenschmitty/floorplan" target="_blank" rel="noopener">Floorplan de Hayden Smith</a> · traduction non officielle</div>`;
function afficherPanneau() {
  const sel = etatVue.selected;
  let html;
  if (sel && typeof sel === 'object' && sel.edge) html = panneauLien(etatVue.edgeEls.get(sel.edge)?.e);
  else if (sel && sel.startsWith('x:')) html = panneauElement(entiteConnecteur(sel), true);
  else if (sel && sel.startsWith('m:')) html = panneauElement('f:' + sel.slice(2));
  else if (sel) html = panneauElement(sel);
  else html = etatVue.container === 'root' ? panneauApercu() : etatVue.container === 'q:answer' ? panneauReponse() : panneauElement(etatVue.container);
  // les extensions ajoutent des sections : 'overview' sur le panneau du projet, 'item' sur un élément sélectionné ou ouvert
  const endroit = sel && typeof sel === 'object' ? null : sel ? 'item' : etatVue.container === 'root' ? 'overview' : etatVue.container === 'q:answer' ? null : 'item';
  const cible = sel && typeof sel === 'string' ? (sel.startsWith('x:') ? entiteConnecteur(sel) : sel.startsWith('m:') ? 'f:' + sel.slice(2) : sel) : etatVue.container;
  const sortiesExt = [];
  if (perso.panel) { html = perso.panel.html; sortiesExt.push(...(perso.panel.bind ? [{ bind: perso.panel.bind, whole: true }] : [])); }
  else if (endroit) for (const fn of ext.sections[endroit]) {
    try {
      const r = fn(cible);
      if (!r) continue;
      const o = typeof r === 'string' ? { html: r } : r;
      sortiesExt.push(o);
      const bloc = `<div data-ext="${sortiesExt.length - 1}">${o.html || ''}</div>`;
      // { top: true } : juste après la section d'en-tête du panneau au lieu de la fin
      const second = o.top ? html.indexOf('<div class="sec"', 1) : -1;
      html = second > 0 ? html.slice(0, second) + bloc + html.slice(second) : html + bloc;
    } catch (e) { console.error('la-carte extension', e); }
  }
  panneau.innerHTML = (html || '') + CREDIT + '<button type="button" class="feuille-x" aria-label="Fermer les détails">' + pictoI('x') + '</button>';
  panneau.classList.toggle('meme-sujet', !sel && !perso.panel);
  sortiesExt.forEach((o, i) => { try { o.bind?.(o.whole ? panneau : panneau.querySelector(`[data-ext="${i}"]`)); } catch (e) { console.error('la-carte extension', e); } });
  panneau.scrollTop = 0;
  panneau.querySelectorAll('[data-go]').forEach((a) => a.addEventListener('click', (ev) => { ev.preventDefault(); localiser(a.dataset.go); }));
  panneau.querySelectorAll('[data-open]').forEach((a) => a.addEventListener('click', (ev) => { ev.preventDefault(); ouvrirBloc(a.dataset.open); }));
  panneau.querySelectorAll('[data-flow]').forEach((a) => a.addEventListener('click', (ev) => { ev.preventDefault(); lancerParcours(a.dataset.flow); }));
  panneau.querySelectorAll('[data-sel]').forEach((a) => a.addEventListener('click', (ev) => { ev.preventDefault(); choisir(a.dataset.sel); centrerSur(a.dataset.sel); }));
  panneau.querySelectorAll('[data-copy]').forEach((a) => a.addEventListener('click', () => { navigator.clipboard?.writeText(a.dataset.copy); a.textContent = '✓'; }));
  emettre('panel', { selected: sel, container: etatVue.container });
}

function panneauReponse() {
  const a = etatVue.answer;
  return `<div class="sec"><div class="ph"><span class="ico" style="--c:var(--accent)">${picto('feature')}</span><span class="kind">${h(a.kind || 'Réponse')}</span></div><h2 class="pt">${h(a.title)}</h2><p class="pd">${h(a.question)}</p>${a.kind && a.answer ? `<div class="pd md">${md(a.answer)}</div>` : ''}
      </div>
    ${sectionListe('Sur ce tableau', a.items.map((x, i) => { const ii = infosBloc(x.id); return `<a class="row" data-sel="${h(x.id)}"><span class="anote" style="margin:0;padding:0;background:none;border:0"><b>${i + 1}</b></span><span class="rt"><div class="rn">${h(ii.name)}</div>${x.note ? `<div class="rd">${h(x.note)}</div>` : ''}${ii.path && modeTechnique() ? `<div class="rp">${h(ii.path)}</div>` : ''}</span></a>`; }))}
    ${a.steps?.length >= 2 ? `<div class="sec"><h3>Visite guidée <span class="c">${a.steps.length}</span></h3><div class="list">${a.steps.map((s, i) => `<a class="row" data-sel="${h(s.id)}"><span class="dot" style="background:var(--accent)"></span><span class="rt"><div class="rn">${i + 1}. ${h(infosBloc(s.id).name)}</div><div class="rd">${h(s.note)}</div></span></a>`).join('')}</div></div>` : ''}`;
}

// Parties de premier niveau, regroupées sous des noms compréhensibles plutôt que de simples points de couleur.
const GROUPES_SYSTEMES = [
  { label: 'À réparer', kinds: ['casse'] },
  { label: 'Applications utilisées', kinds: ['ui'] },
  { label: 'Dans les coulisses', kinds: ['service', 'worker', 'library', 'feature', 'data', 'config'] },
  { label: 'Services extérieurs', kinds: ['external'] },
  { label: 'Outils de développement', kinds: ['script', 'test', 'infra'] },
];
function sectionParties(racines) {
  const places = new Set();
  const parties = GROUPES_SYSTEMES.map((g) => {
    const elements = racines.filter((t) => g.kinds.includes(infosBloc(t).kind));
    elements.forEach((t) => places.add(t));
    return elements.length ? `<div class="group-h">${h(g.label)}</div><div class="list">${elements.map((t) => ligneDe(t, infosBloc(t).kind === 'external' ? '' : modeTechnique() && !PLAN && statsDe(t)?.files ? formaterNombre(statsDe(t).loc) + ' lignes' : statsDe(t)?.files ? accorder(statsDe(t).files, 'fichier') : '')).join('')}</div>` : '';
  });
  const reste = racines.filter((t) => !places.has(t));
  if (reste.length) parties.push(`<div class="group-h">Autres</div><div class="list">${reste.map((t) => ligneDe(t)).join('')}</div>`);
  return `<div class="sec"><h3>Parties <span class="c">${racines.length}</span></h3>${parties.join('')}</div>`;
}

function panneauApercu() {
  const p = G.projet;
  const racines = fils.get('root') || [];
  const nonDecrits = G.files.filter((f) => f.auto).length + routes.filter((r) => r.auto).length;
  return `<div class="sec"><div class="ph"><span class="ico" style="--c:var(--accent)">${picto('feature')}</span><span class="kind">${PLAN ? 'Plan' : 'Projet'}</span></div><h2 class="pt">${h(p.name)}</h2>${p.summary ? `<p class="pd">${h(p.summary)}</p>` : ''}
      <div class="stats" style="margin-top:14px"><div><b>${formaterNombre(G.meta.counts.files)}</b><span>${PLAN ? 'fichiers prévus' : 'fichiers'}</span></div>${PLAN ? `<div><b>${formaterNombre((G.ecrans || []).length)}</b><span>écrans</span></div>` : `<div><b>${formaterNombre(G.meta.counts.loc)}</b><span>lignes</span></div>`}${routes.length ? `<div><b>${formaterNombre(routes.length)}</b><span>adresses du serveur</span></div>` : ''}</div>
      ${nonDecrits ? `<div class="callout">${nonDecrits} fichiers et adresses du serveur gardent encore des noms générés. Demande à Claude de mettre à jour la carte pour les décrire.</div>` : ''}</div>
    ${sectionParties(racines)}
    ${sectionListe('Parcours guidés', G.parcours.map((f) => `<a class="row" data-flow="${h(f.id)}"><span class="dot" style="background:var(--accent)"></span><span class="rt"><div class="rn">${h(f.title)}</div>${f.description ? `<div class="rd">${h(f.description)}</div>` : ''}</span><span class="rc">${f.steps.length} étapes</span></a>`))}
    ${sectionListe('Dépôts', G.meta.repos.map((r) => `<div class="row" style="cursor:default"><span class="dot" style="background:var(--text-4)"></span><span class="rt"><div class="rn">${h(r.name)}</div><div class="rp">${h(r.branch || '')} @ ${h((r.head || '').slice(0, 7))}</div></span></div>`))}
    ${p.entrypoints?.length ? sectionListe('Points d\'entrée', p.entrypoints.filter((e) => fichiersParChemin.has(e)).map((e) => ligneDe('f:' + e))) : ''}
    <div class="sec" style="color:var(--text-3);line-height:1.7;font-size:12px">Clique sur un bloc pour l'inspecter · double-clique pour l'ouvrir<br><span class="kbd">/</span> rechercher · <span class="kbd">⌫</span> monter · <span class="kbd">F</span> ajuster · <span class="kbd">P</span> détails</div>`;
}

function connexions(element) {
  const propres = new Set(lignee(element));
  const dedans = (x) => lignee(x).includes(element);
  const voisinDe = (x) => { const ch = lignee(x); const idx = ch.findIndex((y) => propres.has(y)); return ch[idx - 1] || x; };
  const sortie = new Map(), entree = new Map();
  for (const l of G.links) {
    const ia = dedans(l.a), ib = dedans(l.b);
    if (ia === ib) continue;
    const voisin = voisinDe(ia ? l.b : l.a);
    const m = ia ? sortie : entree;
    const cle = voisin + '|' + l.k;
    const cur = m.get(cle) || { peer: voisin, k: l.k, w: 0 };
    cur.w += l.w; m.set(cle, cur);
  }
  const rangees = (m) => [...m.values()].sort((a, b) => b.w - a.w).map((c) => ligneDe(c.peer, `${LIBELLE_TYPE[c.k]} · ${c.w}`));
  return { out: rangees(sortie), inn: rangees(entree) };
}

function panneauElement(element, viaConnecteur) {
  const i = infosBloc(element);
  let html = `<div class="sec">${enteteFiche(i)}`;
  const actions = [];
  if (ouvrable(element) && etatVue.container !== element) actions.push(`<button class="btn soft" data-open="${h(element)}">${pictoI('drill')}Ouvrir</button>`);
  if (viaConnecteur || (parentsParId.get(element) !== etatVue.container && etatVue.container !== element)) actions.push(`<button class="btn soft" data-go="${h(element)}">Montrer sur la carte</button>`);
  if (i.type === 'node' || i.type === 'dir') {
    const n = i.n, s = statsDe(element);
    if (n?.details) html += n.details.split(/\n\n+/).map((p) => `<p class="pd" style="margin-top:8px">${h(p)}</p>`).join('');
    if (modeTechnique() && (n?.paths?.length || i.d)) html += boiteChemin(i.d ? i.d.path + '/' : n.paths.join('  '));
    if (actions.length) html += `<div class="actions">${actions.join('')}</div>`;
    html += '</div>';
    if (s?.files) {
      const langages = Object.entries(n?.stats.langs || {}).sort((a, b) => b[1] - a[1]).slice(0, 5);
      const tot = langages.reduce((a, [, v]) => a + v, 0) || 1;
      const couleurs = ['#a78bfa', '#38bdf8', '#34d399', '#fbbf24', '#f472b6'];
      const nr = routes.filter((r) => lignee('f:' + r.f).includes(element)).length;
      html += `<div class="sec"><div class="stats"><div><b>${formaterNombre(s.files)}</b><span>${PLAN ? 'fichiers prévus' : 'fichiers'}</span></div>${PLAN ? '' : `<div><b>${formaterNombre(s.loc)}</b><span>lignes</span></div>`}${nr ? `<div><b>${nr}</b><span>adresses du serveur</span></div>` : ''}</div>
        ${modeTechnique() && langages.length && !PLAN ? `<div class="bar">${langages.map(([, v], k) => `<span style="flex:${v};background:${couleurs[k]}"></span>`).join('')}</div><div class="legend-row">${langages.map(([l, v], k) => `<span><span class="dot" style="background:${couleurs[k]}"></span>${h(l)} ${Math.round((v / tot) * 100)}%</span>`).join('')}</div>` : ''}</div>`;
    }
    if (modeTechnique() && (n?.packages?.length || n?.hosts?.length || n?.tags?.length)) html += `<div class="sec"><h3>Repéré grâce à</h3><div class="tags">${[...n.packages.map((p) => 'paquet ' + p), ...n.hosts.map((p) => 'hôte ' + p), ...n.tags.map((t) => '#' + t)].map((t) => `<span class="tag">${h(t)}</span>`).join('')}</div></div>`;
    html += sectionListe('À l\'intérieur', (fils.get(element) || []).filter((k) => !k.startsWith('f:')).map((k) => ligneDe(k)));
    const c = connexions(element);
    html += sectionListe('Utilisé par', c.inn) + sectionListe('Dépend de', c.out);
    const fl = (i.d ? i.d.files : G.files.filter((f) => lignee('f:' + f.p).includes(element))).slice().sort((a, b) => b.loc - a.loc);
    html += sectionListe(PLAN ? 'Fichiers prévus' : 'Fichiers', fl.map((f) => ligneDe('f:' + f.p, PLAN ? '' : formaterNombre(f.loc))), fl.length, 25);
  } else if (i.type === 'file' || i.type === 'module') {
    const f = i.f, fid = 'f:' + f.p, url = urlEditeur(f.p);
    if (f.note) html += `<div class="callout">${h(f.note)}</div>`;
    if (f.tooLarge) html += `<div class="callout">Trop gros pour que la carte le lise : ce qu’il utilise, ses adresses du serveur et d’éventuels secrets n’ont pas été vérifiés. Demande à Claude de mettre à jour la carte avec une limite de taille de fichier plus grande pour l’inclure.</div>`;
    if (modeTechnique()) html += boiteChemin(f.p);
    if (url && modeTechnique()) actions.push(`<a class="btn soft" href="${url}">${pictoI('open')}Ouvrir dans l'éditeur</a>`);
    if (actions.length) html += `<div class="actions">${actions.join('')}</div>`;
    const proprietaire = noeudsParId.get(f.n);
    html += `</div><div class="sec"><div class="stats">${PLAN ? `<div><b>${formaterNombre(G.links.filter((l) => l.a === fid).length)}</b><span>utilise</span></div>` : `<div><b>${formaterNombre(f.loc)}</b><span>lignes</span></div>`}${(routesParFichier.get(f.p) || []).length || modeTechnique() ? `<div><b>${(routesParFichier.get(f.p) || []).length}</b><span>adresses du serveur</span></div>` : ''}${modeTechnique() ? `<div><b>${(f.s || []).length}</b><span>exports</span></div>` : ''}</div>
      ${proprietaire ? `<div class="list" style="margin-top:12px">${ligneDe('n:' + proprietaire.id)}</div>` : ''}</div>`;
    html += sectionListe('Adresses du serveur', (routesParFichier.get(f.p) || []).map((ri) => ligneRoute(ri)), undefined, 60);
    const liensEntrants = G.links.filter((l) => l.b === fid), liensSortants = G.links.filter((l) => l.a === fid);
    const ligneLien = (l, autre) => ligneDe(autre, l.calls?.length ? accorder(l.calls.length, 'appel') : LIBELLE_TYPE[l.k]);
    html += sectionListe('Utilisé par', liensEntrants.map((l) => ligneLien(l, l.a)));
    html += sectionListe('Dépend de', liensSortants.map((l) => ligneLien(l, l.b)));
    const gestionnaires = new Set((routesParFichier.get(f.p) || []).map((ri) => routes[ri].h));
    if (modeTechnique()) html += sectionListe('Exports', (f.s || []).map((s, k) => [s, k]).filter(([s]) => !gestionnaires.has(s[0])).map(([s, k]) => `<a class="row" ${parentsParId.has(`s:${f.p}#${k}`) ? `data-go="s:${h(f.p)}#${k}"` : ''}><span class="dot" style="background:var(--n-symbol)"></span><span class="rt"><div class="rn" style="font-family:var(--mono);font-size:12px">${h(s[0])}</div>${s[4] ? `<div class="rd">${h(s[4])}</div>` : ''}</span><span class="rc">${h(s[1])} · L${s[2]}</span></a>`), undefined, 60);
  } else if (i.type === 'route') {
    const r = i.r, url = urlEditeur(r.f, r.l);
    html += boiteChemin(`${r.m} ${r.p}`);
    if (url) actions.push(`<a class="btn soft" href="${url}">${pictoI('open')}Ouvrir le gestionnaire</a>`);
    html += `<div class="actions">${actions.join('')}</div></div>`;
    html += `<div class="sec"><h3>Géré par</h3><div class="list">${ligneDe('f:' + r.f, r.h ? h(r.h) + '()' : '')}</div></div>`;
    const ri = routes.indexOf(r);
    const appelants = new Map();
    for (const l of G.links) { const n = (l.calls || []).filter(([x]) => x === ri).length; if (n) appelants.set(l.a, (appelants.get(l.a) || 0) + n); }
    html += appelants.size ? sectionListe('Appelé depuis', [...appelants.entries()].map(([a, n]) => ligneDe(a, accorder(n, 'appel'))))
      : `<div class="sec"><h3>Appelé depuis</h3><p class="pd empty">Aucun appel trouvé dans le code analysé. Elle peut être appelée par un système extérieur, ou par une adresse construite pendant l'exécution.</p></div>`;
  } else if (i.type === 'symbol') {
    const url = urlEditeur(i.f.p, i.s[2]);
    html += boiteChemin(`${i.f.p}:${i.s[2]}`);
    if (url) actions.push(`<a class="btn soft" href="${url}">${pictoI('open')}Ouvrir dans l'éditeur</a>`);
    html += `<div class="actions">${actions.join('')}</div></div>`;
    html += `<div class="sec"><h3>Défini dans</h3><div class="list">${ligneDe('f:' + i.f.p)}</div></div>`;
    const importateurs = G.links.filter((l) => l.b === 'f:' + i.f.p && (l.names || []).some((nm) => nm === i.s[0] || (nm === 'default' && i.s[3])));
    html += sectionListe('Importé par', importateurs.map((l) => ligneDe(l.a)));
  } else html += '</div>';
  return html;
}

function panneauLien(e) {
  if (!e) return '';
  const eps = adressesDe(e);
  const noms = [...new Set(e.links.flatMap((l) => l.names || []))];
  const desc = e.k === 'casse' ? [`Ce lien est coupé : ${[...new Set(e.links.flatMap((l) => l.labels || []))].join(', ')} n’existe plus ou ne répond plus.`] : e.links.map((l) => l.desc).filter(Boolean);
  const ep = (id) => id.startsWith('x:') ? entiteConnecteur(id) : id;
  const paires = e.links.filter((l) => l.a.startsWith('f:') || l.b.startsWith('f:'));
  return `<div class="sec"><div class="ph"><span class="ico" style="--c:var(--k-${e.k})">${picto(e.k === 'http' ? 'route' : 'feature')}</span><span class="kind">Connexion · ${LIBELLE_TYPE[e.k]}</span></div>
      <h2 class="pt">${h(nomDe(e.a))} → ${h(nomDe(e.b))}</h2>
      <p class="pd">${desc.length ? h(desc.join(' ')) : `${accorder(e.w, 'connexion')}${eps.length ? ` sur ${accorder(eps.length, 'adresse')} du serveur` : ''}${e.k === 'http' && eps.length ? ', rapprochées des appels vers les adresses du serveur définies dans le code' : ''}.`}</p>
      <div class="actions"><button class="btn soft" data-go="${h(ep(e.a))}">Aller à la source</button><button class="btn soft" data-go="${h(ep(e.b))}">Aller à la cible</button></div></div>
    ${sectionListe('Adresses du serveur', eps.map((x) => ligneRoute(x.i, accorder(x.n, 'appel'))), eps.length, 40)}
    ${noms.length && modeTechnique() ? `<div class="sec"><h3>Noms importés <span class="c">${noms.length}</span></h3><div class="tags">${noms.slice(0, 60).map((x) => `<span class="tag">${h(x)}</span>`).join('')}</div></div>` : ''}
    ${sectionListe('Fichiers concernés', paires.map((l) => { const a = l.a.startsWith('f:') ? fichiersParChemin.get(l.a.slice(2)) : null, b = l.b.startsWith('f:') ? fichiersParChemin.get(l.b.slice(2)) : null;
      return `<a class="row" data-go="${h(l.a)}"><span class="dot" style="background:var(--k-${l.k})"></span><span class="rt"><div class="rn">${h(a ? a.name : nomDe(l.a))} → ${h(b ? b.name : nomDe(l.b))}</div>${modeTechnique() ? `<div class="rp">${h(a ? a.p : '')}</div>` : ''}</span><span class="rc">${l.w}</span></a>`; }), paires.length, 40)}`;
}

