// ======================= sélection =======================
function choisir(sel) {
  perso.panel = null; etatVue.selected = sel; if (typeof sel === 'string' || sel === null) ecrireHash(etatVue.container, sel); appliquerSelection(); afficherPanneau();
  // sur un téléphone, toucher un bloc montre ses détails : on ouvre la feuille, puis on amène le bloc dans la partie de l'écran que la feuille laisse libre
  if (sel && estTelephone() && document.body.classList.contains('no-panel')) { reglerPanneau(true); if (typeof sel === 'string') { amenerDansVue(sel); montrerDansColonne(sel); } }
  else if (sel && petitEcran() && document.body.classList.contains('no-panel')) reglerPanneau(true); // tablette : toucher un bloc montre ses détails
}
function appliquerSelection() {
  const sel = etatVue.selected;
  svg.classList.remove('dim');
  listeColonne.querySelectorAll('.col-bloc.sel').forEach((x) => x.classList.remove('sel'));
  if (typeof sel === 'string') montrerDansColonne(sel);
  for (const g of etatVue.chipEls?.values() || []) g.classList.remove('sel', 'hl');
  for (const { g, pg } of etatVue.edgeEls?.values() || []) { g.classList.remove('hl'); pg.classList.remove('hl'); }
  if (!sel) return;
  const marquer = (x) => { x.g.classList.add('hl'); x.pg.classList.add('hl'); };
  if (typeof sel === 'object' && sel.edge) {
    const x = etatVue.edgeEls.get(sel.edge); if (!x) return;
    svg.classList.add('dim'); marquer(x);
    for (const id of [x.e.a, x.e.b]) etatVue.chipEls.get(id)?.classList.add('hl');
    return;
  }
  const g = etatVue.chipEls?.get(sel); if (!g) return;
  svg.classList.add('dim'); g.classList.add('sel', 'hl');
  for (const x of etatVue.edgeEls.values()) if (x.e.a === sel || x.e.b === sel) { marquer(x); etatVue.chipEls.get(x.e.a === sel ? x.e.b : x.e.a)?.classList.add('hl'); }
}

