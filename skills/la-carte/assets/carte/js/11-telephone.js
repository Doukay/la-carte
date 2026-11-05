// ======================= téléphone : la colonne qui défile =======================
// Sur un téléphone, on ne zoome pas et on ne déplace pas : les blocs se suivent de haut en bas, dans l'ordre du schéma.
// Toucher un bloc l'ouvre s'il a un intérieur, sinon montre ses détails.
const colonne = $('#colonne'), listeColonne = $('#colonne-liste');
/** Les rangées du schéma, de gauche à droite : deux blocs presque à la même abscisse sont dans la même rangée. */
function rangsColonne(vue, res) {
  const relies = new Set(vue.edges.flatMap((e) => [e.a, e.b]));
  const aLaFin = (id) => !relies.has(id) || (id.startsWith('n:') && ['test', 'script', 'infra'].includes(infosBloc(id).kind));
  const rangs = [], fin = [];
  for (const c of res.children.slice().sort((p, q) => p.x - q.x || p.y - q.y)) {
    if (aLaFin(c.id)) { fin.push(c); continue; }
    const dernier = rangs[rangs.length - 1];
    if (dernier && c.x - dernier.x < 60) dernier.blocs.push(c); else rangs.push({ x: c.x, blocs: [c] });
  }
  rangs.forEach((r) => r.blocs.sort((p, q) => p.y - q.y));
  fin.sort((p, q) => p.y - q.y);
  rangs.forEach((r, i) => {
    const suivant = rangs[i + 1]; if (!suivant) return;
    const ici = new Set(r.blocs.map((c) => c.id)), la = new Set(suivant.blocs.map((c) => c.id));
    suivant.relie = vue.edges.some((e) => (ici.has(e.a) && la.has(e.b)) || (la.has(e.a) && ici.has(e.b)));
  });
  return fin.length ? [...rangs, { blocs: fin, relie: false }] : rangs;
}
function liensColonne(vue, id) {
  const cibles = [...new Set(vue.edges.filter((e) => e.a === id).map((e) => e.b))];
  if (!cibles.length) return '';
  // barré seulement si rien d'autre ne relie encore les deux blocs
  const saines = new Set(vue.edges.filter((e) => e.a === id && e.k !== 'casse').map((e) => e.b));
  const coupes = new Set(vue.edges.filter((e) => e.a === id && e.k === 'casse' && !saines.has(e.b)).map((e) => e.b));
  cibles.sort((x, y) => coupes.has(y) - coupes.has(x));
  const bouton = (b, cache) => `<button type="button" class="col-lien${coupes.has(b) ? ' coupe' : ''}" data-vers="${h(b)}"${cache ? ' hidden' : ''}><span>${h(nomDe(b))}</span></button>`;
  return `<div class="col-liens"><span class="col-titre">Utilise</span>${cibles.map((b, n) => bouton(b, n >= 2)).join('')}${cibles.length > 2 ? `<button type="button" class="col-plus" aria-label="Montrer les ${cibles.length - 2} autres liens">+${cibles.length - 2}</button>` : ''}</div>`;
}
function rendreColonne(vue, res) {
  if (!modeColonne()) { listeColonne.innerHTML = ''; return; }
  const connecteurs = new Map(vue.connectors.map((c) => [c.id, c]));
  listeColonne.innerHTML = rangsColonne(vue, res).map((r) => `<div class="col-rang${r.relie ? ' relie' : ''}">${r.blocs.filter(({ id }) => estTelephone() || !connecteurs.has(id)).map(({ id }) => {
    const estConnecteur = connecteurs.has(id);
    const nom = nomDe(id);
    const couleur = couleurBloc(infosBloc(estConnecteur ? connecteurs.get(id).entity : id));
    return `<div class="col-bloc" data-id="${h(id)}" style="--c:${couleur}"><div class="col-zone" role="button" tabindex="0" aria-label="${h(nom)}">${estConnecteur ? connecteurHTML(connecteurs.get(id)) : blocHTML(id)}${ouvrable(id) ? `<span class="col-ouvrir">${pictoI('right')}</span>` : ''}</div>${liensColonne(vue, id)}</div>`;
  }).join('')}</div>`).join('');
  colonne.scrollTop = 0;
}
function montrerDansColonne(id, surligner = true) {
  if (!modeColonne()) return;
  const bloc = [...listeColonne.querySelectorAll('.col-bloc')].find((x) => x.dataset.id === id);
  if (!bloc) return false;
  if (surligner) bloc.classList.add('sel');
  bloc.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  return true;
}
colonne.addEventListener('click', (ev) => {
  const plus = ev.target.closest('.col-plus');
  if (plus) { ev.stopPropagation(); plus.parentElement.querySelectorAll('.col-lien[hidden]').forEach((x) => { x.hidden = false; }); plus.remove(); return; }
  const lien = ev.target.closest('[data-vers]');
  if (lien) { ev.stopPropagation(); const v = lien.dataset.vers; if (!montrerDansColonne(v)) localiser(v.startsWith('x:') ? entiteConnecteur(v) : v); return; }
  const zone = ev.target.closest('.col-zone');
  if (zone) { ev.stopPropagation(); const id = zone.parentElement.dataset.id; if (id.startsWith('x:') || ouvrable(id)) ouvrirBloc(id); else choisir(id); return; }
  if (estTelephone()) fermerFeuille(); else if (etatVue.selected) choisir(null);
});
colonne.addEventListener('keydown', (ev) => {
  const zone = ev.target.closest?.('.col-zone');
  if (zone && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); zone.click(); }
});

