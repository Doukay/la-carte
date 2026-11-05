// ======================= projection de la vue =======================
const etatVue = { container: 'root', selected: null, kinds: Object.fromEntries(TYPES_CONNEXION.map((k) => [k, true])), t: { x: 0, y: 0, k: 1 }, layout: null, flow: null };

function projeter(element, ctx) {
  const ch = lignee(element);
  for (const x of ch) { if (ctx.vis.has(x)) return { item: x }; if (x === ctx.container) return null; }
  if (ctx.cchain.has(element)) return null;
  const idx = ch.findIndex((x) => ctx.cchain.has(x));
  return { outside: ch[idx - 1] };
}
/** L'export visible dont la définition précède de plus près une ligne (l'appelant d'un appel au serveur). */
function symboleEnglobant(f, ligne) {
  let meilleur = null;
  (f.s || []).forEach((s, i) => { if (s[2] <= ligne && (!meilleur || s[2] > meilleur.line)) meilleur = { line: s[2], id: `s:${f.p}#${i}` }; });
  return meilleur && parentsParId.has(meilleur.id) ? meilleur.id : null;
}

/** Le tableau improvisé d'une réponse : seulement les blocs choisis par Claude, et toutes les connexions entre eux. */
function construireVueReponse() {
  const visibles = etatVue.answer.items.map((x) => x.id);
  const ensVisible = new Set(visibles);
  const monterNiveau = (x) => { for (const y of lignee(x)) if (ensVisible.has(y)) return y; return null; };
  // un fichier absent du tableau dont certaines adresses du serveur ou certains exports y figurent : on passe par ceux-là
  const descendre = (x, noms) => {
    if (!x.startsWith('f:')) return [];
    const dedans = visibles.filter((v) => v !== x && lignee(v).includes(x));
    if (!noms?.length) return dedans;
    const f = fichiersParChemin.get(x.slice(2));
    const parNom = dedans.filter((v) => v.startsWith('s:') && noms.some((nm) => { const s = symboleDe(v).s; return nm === s[0] || (nm === 'default' && s[3]); }));
    return parNom.length ? parNom : dedans;
  };
  const projetes = (x, noms) => { const u = monterNiveau(x); return u ? [u] : descendre(x, noms); };
  // un saut caché : un écran qui atteint un appel au serveur par un fichier client d'API absent du tableau
  const importateursDe = new Map();
  for (const l of G.links) if (l.k === 'import' && l.b.startsWith('f:')) { if (!importateursDe.has(l.b)) importateursDe.set(l.b, []); importateursDe.get(l.b).push(l.a); }
  const viaMasque = (x) => [...new Set((importateursDe.get(x) || []).map(monterNiveau).filter(Boolean))];
  const agg = new Map();
  const ajouter = (a, b, l, w) => {
    const cle = `${a}>${b}>${l.k}`;
    let e = agg.get(cle);
    if (!e) { e = { id: 'e' + agg.size, a, b, k: l.k, w: 0, links: [] }; agg.set(cle, e); }
    e.w += w; if (!e.links.includes(l)) e.links.push(l);
  };
  for (const l of G.links) {
    if (!etatVue.kinds[l.k]) continue;
    let srcs = projetes(l.a), dsts = projetes(l.b, l.names);
    if (!srcs.length && l.k === 'http' && l.a.startsWith('f:') && dsts.length) srcs = viaMasque(l.a);
    if (l.calls?.length) {
      const rs = [...new Set(l.calls.map(([ri]) => ri))].filter((ri) => ri != null && ensVisible.has('r:' + ri)).map((ri) => 'r:' + ri);
      if (rs.length) dsts = rs;
      const f = l.a.startsWith('f:') ? fichiersParChemin.get(l.a.slice(2)) : null;
      const symboles = f ? [...new Set(l.calls.map(([, ligne]) => symboleEnglobant(f, ligne)).filter((s) => s && ensVisible.has(s)))] : [];
      if (symboles.length) srcs = symboles;
    }
    for (const s of srcs) for (const d of dsts) if (s !== d && !lignee(d).includes(s) && !lignee(s).includes(d)) ajouter(s, d, l, l.calls?.length ? l.calls.length : l.w);
  }
  // montrer l'inclusion (un fichier et son adresse du serveur, tous deux sur le tableau) par un trait léger
  const lienContient = { k: 'contains', w: 1, a: '', b: '' };
  for (const v of visibles) { const p = lignee(v).slice(1).find((y) => ensVisible.has(y)); if (p) ajouter(p, v, lienContient, 1); }
  return { container: 'q:answer', visible: visibles, connectors: [], edges: [...agg.values()], hidden: 0 };
}
const noteReponse = (element) => {
  if (etatVue.container !== 'q:answer' || !etatVue.answer) return null;
  const i = etatVue.answer.items.findIndex((x) => x.id === element);
  return i < 0 || !etatVue.answer.items[i].note ? null : { n: i + 1, text: etatVue.answer.items[i].note };
};

function construireVue(conteneur) {
  if (conteneur === 'q:answer') return construireVueReponse();
  const estFichier = conteneur.startsWith('f:');
  const visibles = filsVisibles(conteneur).slice();
  if (estFichier) visibles.unshift('m:' + conteneur.slice(2));
  const ctx = { container: conteneur, vis: new Set(visibles), cchain: new Set(lignee(conteneur)) };
  const agg = new Map(), connecteurs = new Map();
  const ajouter = (a, b, l, w = l.w) => {
    const cle = `${a}>${b}>${l.k}`;
    let e = agg.get(cle);
    if (!e) { e = { id: 'e' + agg.size, a, b, k: l.k, w: 0, links: [] }; agg.set(cle, e); }
    e.w += w; if (!e.links.includes(l)) e.links.push(l);
  };
  const connecteur = (cote, entite) => { const id = `x:${cote}:${entite}`; if (!connecteurs.has(id)) connecteurs.set(id, { id, side: cote, entity: entite }); return id; };

  for (const l of G.links) {
    if (!etatVue.kinds[l.k]) continue;
    if (estFichier) {
      const fid = conteneur, f = fichiersParChemin.get(fid.slice(2));
      if (l.b === fid && l.a !== fid) {
        const pa = projeter(l.a, ctx); if (!pa?.outside) continue;
        const src = connecteur('in', pa.outside);
        if (l.calls?.length) { let trouve = false; for (const [ri] of l.calls) if (ri != null && ctx.vis.has('r:' + ri)) { ajouter(src, 'r:' + ri, l, 1); trouve = true; } if (!trouve) ajouter(src, 'm:' + f.p, l); continue; }
        const cibles = new Set();
        for (const nm of l.names || []) { const i = (f.s || []).findIndex((s) => nm === 'default' ? s[3] : s[0] === nm); if (i >= 0 && ctx.vis.has(`s:${f.p}#${i}`)) cibles.add(`s:${f.p}#${i}`); }
        if (!cibles.size) cibles.add('m:' + f.p);
        for (const t of cibles) ajouter(src, t, l);
      } else if (l.a === fid && l.b !== fid) {
        const pb = projeter(l.b, ctx); if (!pb?.outside) continue;
        const dst = connecteur('out', pb.outside);
        if (l.calls?.length) { for (const [, ligne] of l.calls) ajouter(symboleEnglobant(f, ligne) || 'm:' + f.p, dst, l, 1); continue; }
        ajouter('m:' + f.p, dst, l);
      }
      continue;
    }
    const pa = projeter(l.a, ctx), pb = projeter(l.b, ctx);
    if (!pa || !pb) continue;
    if (pa.item && pb.item) { if (pa.item !== pb.item) ajouter(pa.item, pb.item, l); }
    else if (pa.item && pb.outside) ajouter(pa.item, connecteur('out', pb.outside), l);
    else if (pa.outside && pb.item) ajouter(connecteur('in', pa.outside), pb.item, l);
  }
  const liens = [...agg.values()];
  let nbMasques = 0;
  if (estFichier && visibles.length > 22) {
    const utilises = new Set(liens.flatMap((e) => [e.a, e.b]));
    const garder = visibles.filter((v) => v.startsWith('m:') || utilises.has(v));
    nbMasques = visibles.length - garder.length;
    visibles.length = 0; visibles.push(...garder);
  }
  return { container: conteneur, visible: visibles, connectors: [...connecteurs.values()], edges: liens, hidden: nbMasques };
}

