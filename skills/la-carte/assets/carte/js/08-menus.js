// ======================= menus du clic droit =======================
const menuContextuel = $('#ctxmenu');
function openMenu(ev, elements) {
  const acts = [];
  menuContextuel.innerHTML = elements.filter(Boolean).map((it) => {
    if (it === '-') return '<div class="mi-sep"></div>';
    if (it.title) return `<div class="mi-title">${h(it.title)}</div>`;
    acts.push(it.run);
    return `<button class="mi" data-k="${acts.length - 1}">${pictoI(it.icon || 'right')}<span>${h(it.label)}</span>${it.hint ? `<span class="hint">${h(it.hint)}</span>` : ''}</button>`;
  }).join('').replace(/^(<div class="mi-sep"><\/div>)+|(<div class="mi-sep"><\/div>)+$/g, '');
  menuContextuel.querySelectorAll('.mi').forEach((b) => b.onclick = (e) => { e.stopPropagation(); fermerMenu(); acts[+b.dataset.k](); });
  menuContextuel.hidden = false;
  const w = menuContextuel.offsetWidth, haut = menuContextuel.offsetHeight;
  const x = Math.min(ev.clientX, innerWidth - w - 8), y = Math.min(ev.clientY, innerHeight - haut - 8);
  menuContextuel.style.left = x + 'px'; menuContextuel.style.top = y + 'px';
  menuContextuel.style.transformOrigin = `${ev.clientX - x}px ${ev.clientY - y}px`;
}
function fermerMenu() { menuContextuel.hidden = true; }
const copierTexte = (texte) => navigator.clipboard?.writeText(texte).catch(() => {});
function menuElement(id) {
  const reel = id.startsWith('x:') ? entiteConnecteur(id) : id.startsWith('m:') ? 'f:' + id.slice(2) : id;
  const i = infosBloc(reel);
  const chemin = i.type === 'route' ? `${i.r.m} ${i.r.p}` : i.type === 'node' ? (i.n.paths || []).join(' ') : i.path;
  const fichierPourEditeur = i.type === 'file' ? [i.f.p, 1] : i.type === 'route' ? [i.r.f, i.r.l] : i.type === 'symbol' ? [i.f.p, i.s[2]] : null;
  const url = fichierPourEditeur && urlEditeur(...fichierPourEditeur);
  return [
    { title: i.name },
    id.startsWith('x:') ? { label: `Aller à ${i.name}`, icon: 'right', hint: '2×clic', run: () => localiser(reel) }
      : ouvrable(reel) && etatVue.container !== reel ? { label: 'Ouvrir', icon: 'drill', hint: '2×clic', run: () => ouvrirBloc(reel) } : null,
    etatVue.container === 'q:answer' && !id.startsWith('x:') ? { label: 'Montrer sur la carte', icon: 'external', run: () => localiser(reel) } : null,
    COPIE_EXPORTEE ? null : { label: 'Demander à ce sujet', icon: 'spark', run: () => epinglerContexte(reel) },
    { label: 'Voir les détails', icon: 'panel', run: () => { reglerPanneau(true); if (id.startsWith('x:')) localiser(reel); else choisir(id); } },
    '-',
    chemin ? { label: i.type === 'route' ? 'Copier l\'adresse du serveur' : 'Copier le chemin', icon: 'copy', run: () => copierTexte(chemin) } : null,
    { label: 'Copier le nom', icon: 'copy', run: () => copierTexte(i.name) },
    url ? { label: 'Ouvrir dans l\'éditeur', icon: 'open', run: () => { location.href = url; } } : null,
  ];
}
function menuLien(e) {
  const ep = (x) => x.startsWith('x:') ? entiteConnecteur(x) : x.startsWith('m:') ? 'f:' + x.slice(2) : x;
  return [
    { title: `${nomDe(e.a)} → ${nomDe(e.b)}` },
    COPIE_EXPORTEE ? null : { label: 'Demander à propos de cette connexion', icon: 'spark', run: () => { epinglerContexte(ep(e.a)); epinglerContexte(ep(e.b)); } },
    { label: 'Voir les détails', icon: 'panel', run: () => { reglerPanneau(true); choisir({ edge: e.id }); } },
    '-',
    { label: `Aller à ${nomDe(e.a)}`, icon: 'left', run: () => localiser(ep(e.a)) },
    { label: `Aller à ${nomDe(e.b)}`, icon: 'right', run: () => localiser(ep(e.b)) },
  ];
}
function menuCarte() {
  return [
    { label: 'Ajuster à l\'écran', icon: 'fit', hint: 'F', run: () => ajusterVue(true) },
    etatVue.container !== 'root' ? { label: 'Niveau supérieur', icon: 'left', hint: '⌫', run: monterNiveau } : null,
    etatVue.container !== 'root' ? { label: 'Retour à la vue d\'ensemble', icon: 'home', run: () => allerVers('root') } : null,
    '-',
    { label: 'Rechercher', icon: 'search', hint: '/', run: openPalette },
    COPIE_EXPORTEE ? null : { label: 'Demander à propos de cette vue', icon: 'spark', run: () => { if (etatVue.container !== 'root' && etatVue.container !== 'q:answer') epinglerContexte(etatVue.container); champQuestion.focus(); } },
  ];
}
svg.addEventListener('contextmenu', (ev) => { ev.preventDefault(); masquerInfobulle(); openMenu(ev, menuCarte()); });
window.addEventListener('pointerdown', (ev) => { if (!menuContextuel.hidden && !menuContextuel.contains(ev.target)) fermerMenu(); }, true);
window.addEventListener('blur', fermerMenu);

