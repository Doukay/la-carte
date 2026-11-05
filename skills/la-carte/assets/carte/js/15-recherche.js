// ======================= recherche (palette de commandes) =======================
const indexRecherche = [
  ...G.nodes.map((n) => ({ id: 'n:' + n.id, name: n.label, desc: n.summary || '', path: n.id, kind: n.kind, w: 4 })),
  ...G.files.map((f) => ({ id: 'f:' + f.p, name: f.name, desc: f.d || '', path: f.p, kind: 'file', w: 3 })),
  ...routes.map((r, i) => ({ id: 'r:' + i, name: r.name, desc: r.d || '', path: `${r.m} ${r.p}`, kind: 'route', w: 3 })),
  ...G.files.flatMap((f) => (f.s || []).map((s, i) => ({ id: `s:${f.p}#${i}`, name: s[0], desc: s[4] || '', path: f.p, kind: pictoSymbole(s[1]), w: 1 }))).filter((x) => parentsParId.has(x.id)),
];
const elPalette = $('#palette'), champRecherche = $('#search'), zoneResultats = $('#results');
let indexActif = 0, resultatsRecherche = [];
function openPalette() { elPalette.classList.add('open'); champRecherche.value = ''; lancerRecherche(); setTimeout(() => champRecherche.focus(), 0); }
function fermerPalette() { elPalette.classList.remove('open'); }
function lancerRecherche() {
  const termes = champRecherche.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  let notes = [];
  if (!termes.length) notes = (fils.get('root') || []).map((id) => [1, indexRecherche.find((x) => x.id === id)]).filter((x) => x[1]);
  else for (const it of indexRecherche) {
    if (!modeTechnique() && (it.kind === 'function' || it.kind === 'class')) continue;
    const n = it.name.toLowerCase(), d = it.desc.toLowerCase(), p = it.path.toLowerCase();
    let s = 0;
    for (const t of termes) {
      const sc = n === t ? 30 : n.startsWith(t) ? 20 : n.includes(t) ? 12 : p.includes(t) ? 6 : d.includes(t) ? 4 : 0;
      if (!sc) { s = 0; break; }
      s += sc;
    }
    if (s) notes.push([s + it.w * 2 - n.length * 0.02, it]);
  }
  resultatsRecherche = notes.sort((a, b) => b[0] - a[0]).slice(0, 40).map((x) => x[1]);
  indexActif = 0;
  zoneResultats.innerHTML = resultatsRecherche.map((it, i) => {
    const ii = infosBloc(it.id);
    const ic = it.kind === 'route' ? `<span class="method" style="--m:${varMethode(ii.r.m)}">${h(ii.r.m)}</span>` : `<span class="ico" style="--c:${couleurBloc(ii)}">${picto(clePicto(ii))}</span>`;
    return `<div class="r${i === 0 ? ' active' : ''}" data-i="${i}">${ic}<span class="rt"><div class="rn">${h(it.name)}</div><div class="rd">${h(it.desc || it.path)}</div></span><span class="rk">${h(it.kind === 'route' ? ii.r.p : nomGenre(it.kind))}</span></div>`;
  }).join('') || '<div class="empty">Aucun résultat</div>';
  zoneResultats.querySelectorAll('.r').forEach((r) => { r.addEventListener('mousedown', (ev) => { ev.preventDefault(); choisirResultat(+r.dataset.i); }); r.addEventListener('mousemove', () => activer(+r.dataset.i)); });
}
function activer(i) { indexActif = i; zoneResultats.querySelectorAll('.r').forEach((r, k) => r.classList.toggle('active', k === i)); zoneResultats.children[i]?.scrollIntoView({ block: 'nearest' }); }
function choisirResultat(i) { const it = resultatsRecherche[i]; if (!it) return; fermerPalette(); localiser(it.id); }
champRecherche.addEventListener('input', lancerRecherche);
champRecherche.addEventListener('keydown', (ev) => {
  if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') { ev.preventDefault(); activer(borner(indexActif + (ev.key === 'ArrowDown' ? 1 : -1), 0, resultatsRecherche.length - 1)); }
  else if (ev.key === 'Enter') choisirResultat(indexActif);
  else if (ev.key === 'Escape') fermerPalette();
});
elPalette.addEventListener('mousedown', (ev) => { if (ev.target === elPalette) fermerPalette(); });
$('#search-btn').onclick = openPalette;

