// ======================= affichage =======================
function cheminArrondi(points, r = 10) {
  let d = `M${points[0].x},${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1], b = points[i], c = points[i + 1];
    const d1 = Math.hypot(b.x - a.x, b.y - a.y), d2 = Math.hypot(c.x - b.x, c.y - b.y);
    const rr = Math.min(r, d1 / 2, d2 / 2);
    if (!rr) { d += `L${b.x},${b.y}`; continue; }
    const p1 = { x: b.x + ((a.x - b.x) * rr) / d1, y: b.y + ((a.y - b.y) * rr) / d1 };
    const p2 = { x: b.x + ((c.x - b.x) * rr) / d2, y: b.y + ((c.y - b.y) * rr) / d2 };
    d += `L${p1.x.toFixed(1)},${p1.y.toFixed(1)}Q${b.x},${b.y} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  const z = points[points.length - 1];
  return d + `L${z.x},${z.y}`;
}

let jetonAffichage = 0;
async function afficherVue(options = {}) {
  const jeton = ++jetonAffichage;
  const vue = construireVue(etatVue.container);
  const chargement = setTimeout(() => $('#loading').classList.add('on'), 160);
  let res;
  try { res = await disposer(vue); }
  catch (e) { console.error(e); clearTimeout(chargement); $('#loading').classList.remove('on'); $('#empty').hidden = false; $('#empty').textContent = 'Mise en page impossible : ' + e.message; return; }
  clearTimeout(chargement);
  $('#loading').classList.remove('on');
  if (jeton !== jetonAffichage) return;
  etatVue.view = vue; etatVue.layout = res;
  queueMicrotask(() => emettre('render', { container: etatVue.container, view: vue }));
  dessiner(vue, res);
  rendreColonne(vue, res);
  afficherContexte(); afficherFilAriane(); afficherLegende(vue);
  $('#empty').hidden = vue.visible.length > 0;
  $('#empty').textContent = vue.visible.length ? '' : 'Rien à l\'intérieur.';
  if (options.keepTransform) appliquerTransformation(); else ajusterVue(false);
  appliquerSelection();
  if (options.after) options.after();
}

function dessiner(vue, res) {
  vp.innerHTML = '';
  etatVue.bounds = { x: 0, y: 0, w: res.width, h: res.height };
  const lienParId = new Map(vue.edges.map((e) => [e.id, e]));
  // couches, de bas en haut : traits, effets de parcours (ligne de la visite + pulsation), blocs, points d'accroche
  const gCols = el('g', { class: 'cols' }, vp);
  const gEdges = el('g', { class: 'edges' }, vp), gFx = el('g', {}, vp), gNodes = el('g', {}, vp), gPorts = el('g', { class: 'edges' }, vp);
  etatVue.fxLayer = gFx;
  dessinerColonnes(gCols, vue, res);
  etatVue.edgeEls = new Map(); etatVue.chipEls = new Map();
  for (const re of res.edges || []) {
    const e = lienParId.get(re.id), s = re.sections?.[0];
    if (!s) continue;
    const points = [s.startPoint, ...(s.bendPoints || []), s.endPoint];
    const d = cheminArrondi(points, 14);
    const g = el('g', { class: `edge k-${e.k}`, style: `color:var(--k-${e.k})` }, gEdges);
    const largeur = 1.3 + Math.min(4, Math.log2(e.w + 1)) * 0.5;
    el('path', { class: 'trace', d, 'stroke-width': largeur.toFixed(2) }, g);
    el('path', { class: 'flow', d }, g);
    el('path', { class: 'hit', d }, g);
    if (e.k === 'casse') {
      // la marque de coupure, au milieu du plus long morceau du lien
      const [p, q] = points.slice(1).map((b, n) => [points[n], b]).sort(([a1, b1], [a2, b2]) => Math.hypot(b2.x - a2.x, b2.y - a2.y) - Math.hypot(b1.x - a1.x, b1.y - a1.y))[0];
      const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
      const m = el('g', { class: 'coupure' }, g);
      el('circle', { cx: mx, cy: my, r: 10 }, m);
      el('path', { d: `M${mx - 4},${my - 4}L${mx + 4},${my + 4}M${mx + 4},${my - 4}L${mx - 4},${my + 4}` }, m);
    }
    const pg = el('g', { class: `edge k-${e.k}`, style: `color:var(--k-${e.k})` }, gPorts);
    el('circle', { class: 'port', cx: s.startPoint.x, cy: s.startPoint.y, r: 3.4 }, pg);
    el('circle', { class: 'port', cx: s.endPoint.x, cy: s.endPoint.y, r: 3.4 }, pg);
    g.addEventListener('mouseenter', (ev) => montrerInfobulle(ev, infobulleLien(e)));
    g.addEventListener('mousemove', deplacerInfobulle);
    g.addEventListener('mouseleave', masquerInfobulle);
    g.addEventListener('click', (ev) => { ev.stopPropagation(); choisir({ edge: e.id }); });
    g.addEventListener('contextmenu', (ev) => { ev.preventDefault(); ev.stopPropagation(); masquerInfobulle(); openMenu(ev, menuLien(e)); });
    etatVue.edgeEls.set(e.id, { g, pg, d, e });
  }
  // les blocs apparaissent de gauche à droite, à quelques millisecondes d'écart
  const ordre = res.children.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  const delais = new Map(ordre.map((c, i) => [c.id, Math.min(i * 18, 360)]));
  for (const c of res.children) {
    const g = el('g', { class: 'node', transform: `translate(${c.x},${c.y})` }, gNodes);
    const fo = el('foreignObject', { x: -MARGE, y: -MARGE, width: c.width + MARGE * 2, height: c.height + MARGE * 2 }, g);
    fo.innerHTML = `<div class="fo-pad">${c.id.startsWith('x:') ? connecteurHTML(vue.connectors.find((x) => x.id === c.id)) : blocHTML(c.id)}</div>`;
    fo.querySelector('.card')?.style.setProperty('--d', `${delais.get(c.id)}ms`);
    g.addEventListener('click', (ev) => { ev.stopPropagation(); choisir(c.id); });
    g.addEventListener('dblclick', (ev) => { ev.stopPropagation(); if (ev.button !== 0) return; masquerInfobulle(); ouvrirBloc(c.id); });
    g.addEventListener('contextmenu', (ev) => { ev.preventDefault(); ev.stopPropagation(); masquerInfobulle(); openMenu(ev, menuElement(c.id)); });
    g.addEventListener('mouseenter', (ev) => infobulleDifferee(ev, () => infobulleBloc(c.id)));
    g.addEventListener('mousemove', deplacerInfobulle);
    g.addEventListener('mouseleave', masquerInfobulle);
    etatVue.chipEls.set(c.id, g);
  }
}

/** Accolades au-dessus des trois colonnes d'une vue qui a des connexions extérieures : ce qui utilise cette partie (à gauche),
 *  ce qu'elle contient (au milieu), et ce qu'elle utilise (à droite). Dessinées dans l'espace de la carte pour suivre ses déplacements et son zoom. */
function dessinerColonnes(g, vue, res) {
  if (!vue.connectors?.length || etatVue.container === 'root' || etatVue.container === 'q:answer') return;
  const etendue = (cs) => cs.length ? [Math.min(...cs.map((c) => c.x)), Math.max(...cs.map((c) => c.x + c.width))] : null;
  const entrees = res.children.filter((c) => c.id.startsWith('x:in:'));
  const sorties = res.children.filter((c) => c.id.startsWith('x:out:'));
  const milieu = res.children.filter((c) => !c.id.startsWith('x:'));
  const y = Math.min(...res.children.map((c) => c.y)) - 26;
  const colonnes = [[etendue(entrees), 'Utilisé par'], [etendue(milieu), `À l'intérieur de ${infosBloc(etatVue.container).name}`], [etendue(sorties), 'Utilise']];
  const hautDe = (cs) => {
    if (!cs.length) return y;
    const propre = Math.min(...cs.map((c) => c.y)) - 26;
    const [x0, x1] = etendue(cs);
    const gene = milieu.some((c) => c.x < x1 && c.x + c.width > x0 && c.y < propre + 12 && c.y + c.height > propre - 12);
    return gene ? y : propre;
  };
  const hauteurs = [hautDe(entrees), y, hautDe(sorties)];
  colonnes.forEach(([s, libelle], n) => {
    if (!s) return;
    const y = hauteurs[n];
    const [x0, x1] = s, cx = (x0 + x1) / 2;
    const half = Math.min(largeurTexte(libelle, 13, 500) / 2 + 10, (x1 - x0) / 2 - 12);
    // ⌐—— libellé ——¬ : les bouts du trait s'incurvent vers les blocs, avec une coupure dans la ligne pour le libellé
    el('path', { d: `M${x0},${y + 9} v-5 q0,-4 4,-4 H${cx - half} M${cx + half},${y} H${x1 - 4} q4,0 4,4 v5` }, g);
    el('text', { x: cx, y }, g).textContent = libelle;
  });
}

