// Vue Écrans : pars d’une page que les gens reconnaissent (« la page de paiement ») et vois tout ce qu’il y a derrière :
// les parties qui la composent, les appels qu’elle fait au serveur, le code du serveur qui y répond, les données et les
// services extérieurs concernés. Les données viennent de graphe.ecrans (scripts/lib/ecrans.mjs).
(() => {
  const CARTE = window.Floorplan;
  if (!CARTE) return;
  const G = CARTE.graphe;
  // les pages qui ne font que te renvoyer ailleurs n’ont rien derrière qui mérite un tableau
  const ecrans = (G.ecrans || []).filter((s) => s && s.url && Array.isArray(s.behind) && s.behind.length && !(s.behind.length < 2 && /redirect|redirig/i.test(`${s.name} ${s.description}`)));
  if (!ecrans.length) return;
  const { h } = CARTE;

  const style = document.createElement('style');
  style.textContent = `
#sc-menu { position: fixed; width: 340px; max-height: min(70vh, 580px); overflow: auto; transform-origin: top right; overscroll-behavior: contain; }
#sc-menu .sc-f { position: sticky; top: -6px; margin: -6px -6px 4px; padding: 10px 10px 6px; background: var(--menu-solid); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); z-index: 1; border-radius: 18px 18px 0 0; }
#sc-menu .sc-f input { width: 100%; height: 34px; border: 0; border-radius: 12px; padding: 0 12px; background: rgba(var(--ink), .06); color: var(--text); outline: none; transition: background .2s var(--ease), box-shadow .2s var(--ease); }
#sc-menu .sc-f input:focus { background: rgba(var(--ink), .08); box-shadow: 0 0 0 1px rgba(var(--ink), .14); }
#sc-menu .sc-g { padding: 10px 12px 4px; font-size: 12px; color: var(--text-3); }
#sc-menu .sc-r { display: block; width: 100%; text-align: left; border: 0; background: none; color: var(--text); padding: 9px 12px; border-radius: 12px; cursor: pointer; transition: background .15s var(--ease); }
#sc-menu .sc-r:hover, #sc-menu .sc-r.on { background: rgba(var(--ink), .07); }
#sc-menu .sc-r b { font-weight: 500; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#sc-menu .sc-r span { font-family: var(--mono); font-size: 11.5px; color: var(--text-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block; }
#sc-menu .sc-none { padding: 14px 12px; color: var(--text-3); font-size: 12.5px; }
`;
  document.head.appendChild(style);

  // ---------- données ----------
  const etiquetteHaute = new Map(G.nodes.filter((n) => !n.parent).map((n) => [n.id, n.label]));
  const nomApp = (id) => etiquetteHaute.get(id) || (id === 'unassigned' ? 'Autre' : id);
  const parApp = new Map();
  for (const s of ecrans) { if (!parApp.has(s.app)) parApp.set(s.app, []); parApp.get(s.app).push(s); }
  const parFichier = new Map();
  for (const s of ecrans) { if (!parFichier.has(s.file)) parFichier.set(s.file, []); parFichier.get(s.file).push(s); }
  // derrière quels écrans chaque bloc apparaît (pour « Derrière ces écrans » dans le panneau de détails)
  const utilisePar = new Map();
  for (const s of ecrans) for (const b of s.behind) {
    if (b.kind === 'screen' || b.id === 'f:' + s.file) continue;
    if (!utilisePar.has(b.id)) utilisePar.set(b.id, []);
    utilisePar.get(b.id).push(s);
  }

  function montrerEcran(s) {
    fermerMenu();
    const elements = s.behind.filter((b) => CARTE.existe(b.id));
    // un court trajet : l’écran → son premier appel au serveur → le code du serveur → là où ça finit
    const premierDe = (type) => elements.find((b) => b.kind === type);
    const etapes = [premierDe('screen'), premierDe('request'), premierDe('server'), premierDe('data') || premierDe('outside')].filter(Boolean);
    CARTE.montrerTableau({ kind: 'Écran', icon: 'ui', title: s.name, question: 'Tout ce qu’il y a derrière ' + s.url, items: elements, steps: etapes.length >= 3 ? etapes : [] });
  }

  // ---------- menu de l’en-tête ----------
  const menu = document.createElement('div');
  menu.id = 'sc-menu';
  menu.className = 'menu glass';
  document.body.appendChild(menu);
  let bouton = null;
  const beaucoup = ecrans.length > 8;

  function afficherListe(q = '') {
    const mots = q.toLowerCase().split(/\s+/).filter(Boolean);
    const correspond = (s) => !mots.length || mots.every((largeur) => `${s.name} ${s.url} ${nomApp(s.app)}`.toLowerCase().includes(largeur));
    let html = '', affiches = 0;
    for (const [app, liste] of parApp) {
      const lignes = liste.filter(correspond);
      if (!lignes.length) continue;
      if (parApp.size > 1) html += `<div class="sc-g">${h(nomApp(app))}</div>`;
      for (const s of lignes) html += `<button class="sc-r" data-sc="${h(s.id)}"><b>${h(s.name)}</b><span>${h(s.url)}</span></button>`;
      affiches += lignes.length;
    }
    if (!affiches) html = `<div class="sc-none">Aucun écran ne correspond à « ${h(q)} ».</div>`;
    const liste = menu.querySelector('.sc-l');
    liste.innerHTML = html;
    liste.querySelectorAll('[data-sc]').forEach((b) => b.onclick = (ev) => { ev.stopPropagation(); montrerEcran(ecrans.find((s) => s.id === b.dataset.sc)); });
    liste.querySelector('.sc-r')?.classList.add('on');
  }
  function afficherMenu() {
    menu.innerHTML = `${beaucoup ? '<div class="sc-f"><input id="sc-q" placeholder="Chercher un écran…" spellcheck="false" autocomplete="off"></div>' : ''}<div class="sc-l"></div>`;
    afficherListe('');
    const champ = menu.querySelector('#sc-q');
    if (!champ) return;
    champ.oninput = () => afficherListe(champ.value);
    champ.onkeydown = (ev) => {
      const lignes = [...menu.querySelectorAll('.sc-r')];
      const courant = lignes.findIndex((r) => r.classList.contains('on'));
      if (ev.key === 'Enter' && lignes[courant]) { ev.preventDefault(); lignes[courant].click(); }
      else if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
        ev.preventDefault();
        const suivant = lignes[Math.max(0, Math.min(lignes.length - 1, courant + (ev.key === 'ArrowDown' ? 1 : -1)))];
        lignes.forEach((r) => r.classList.toggle('on', r === suivant));
        suivant?.scrollIntoView({ block: 'nearest' });
      }
    };
  }
  function ouvrirMenu() {
    document.body.click(); // laisser le visualiseur fermer ses propres menus (Parcours, filtres)
    afficherMenu();
    placer();
    menu.classList.add('open');
    menu.querySelector('#sc-q')?.focus();
  }
  function placer() {
    const r = bouton.getBoundingClientRect();
    const largeur = Math.min(340, innerWidth - 16); // jamais plus large que l’écran
    menu.style.top = r.bottom + 8 + 'px';
    menu.style.width = largeur + 'px';
    menu.style.right = Math.min(Math.max(8, innerWidth - r.right), innerWidth - 8 - largeur) + 'px';
  }
  function fermerMenu() { menu.classList.remove('open'); }
  const estOuvert = () => menu.classList.contains('open');

  bouton = CARTE.ajouterBoutonEntete({ id: 'screens-btn', label: 'Écrans', icon: 'ui', title: 'Choisis un écran de l’app pour voir tout ce qu’il y a derrière', onClick: () => (estOuvert() ? fermerMenu() : ouvrirMenu()) });
  window.addEventListener('pointerdown', (ev) => { if (estOuvert() && !menu.contains(ev.target) && !bouton.contains(ev.target)) fermerMenu(); }, true);
  window.addEventListener('keydown', (ev) => {
    if (!estOuvert()) return;
    if (ev.key === 'Escape') { ev.stopImmediatePropagation(); ev.preventDefault(); fermerMenu(); }
    else if (ev.target?.id !== 'sc-q') ev.stopPropagation(); // garder les raccourcis du visualiseur hors du menu ouvert
  }, true);
  window.addEventListener('resize', () => { if (estOuvert()) placer(); });

  // ---------- panneau de détails ----------
  const ligne = (s, etiquette) => `<a class="row" data-sc="${h(s.id)}"><span class="dot" style="background:var(--n-ui)"></span><span class="rt"><div class="rn">${h(etiquette || s.name)}</div><div class="rp">${h(s.url)}</div></span></a>`;
  const lierLignes = (el) => el?.querySelectorAll('[data-sc]').forEach((a) => a.addEventListener('click', (ev) => { ev.preventDefault(); montrerEcran(ecrans.find((s) => s.id === a.dataset.sc)); }));
  CARTE.ajouterSectionPanneau('item', (id) => {
    if (typeof id !== 'string') return null;
    const propres = id.startsWith('f:') ? parFichier.get(id.slice(2)) || [] : [];
    const derriere = (utilisePar.get(id) || []).filter((s) => !propres.includes(s));
    if (!propres.length && !derriere.length) return null;
    let html = '';
    if (propres.length) html += `<div class="sec"><h3>C’est un écran</h3><div class="list">${propres.map((s) => ligne(s, 'Voir tout ce qu’il y a derrière cet écran')).join('')}</div></div>`;
    if (derriere.length) html += `<div class="sec"><h3>Derrière ces écrans <span class="c">${derriere.length}</span></h3><div class="list">${derriere.slice(0, 8).map((s) => ligne(s)).join('')}</div></div>`;
    return { html, bind: lierLignes };
  });
  CARTE.ajouterSectionPanneau('overview', () => ({
    html: `<div class="sec"><h3>Écrans <span class="c">${ecrans.length}</span></h3><div class="list"><a class="row" data-sc-open><span class="dot" style="background:var(--n-ui)"></span><span class="rt"><div class="rn">Partir d’un écran</div><div class="rd">Choisis une page de l’app pour voir les parties qui la composent, les appels qu’elle fait au serveur et le code du serveur qui y répond.</div></span></a></div></div>`,
    bind: (el) => el?.querySelector('[data-sc-open]')?.addEventListener('click', (ev) => { ev.preventDefault(); ev.stopPropagation(); ouvrirMenu(); }),
  }));

  // d’autres fonctions (la visite guidée) peuvent ouvrir le tableau d’un écran
  window.FloorplanScreens = { list: ecrans, show: montrerEcran, openMenu: ouvrirMenu };
})();
