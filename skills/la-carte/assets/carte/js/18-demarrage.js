// ======================= démarrage =======================
if (COPIE_EXPORTEE) document.body.classList.add('exported');
document.title = `Carte de ${G.projet.name}`;
$('#btn-up').onclick = monterNiveau;
// glisse le bord gauche du panneau pour le redimensionner ; la largeur est conservée d'une visite à l'autre
const reglerLargeurPanneau = (w) => { document.documentElement.style.setProperty('--panel-w', `${borner(Math.round(w), 300, Math.min(720, innerWidth - 360))}px`); };
reglerLargeurPanneau(stockageLocal.get('panelWidth', 360));
$('#panel-resize').addEventListener('pointerdown', (ev) => {
  ev.preventDefault();
  const poignee = ev.currentTarget;
  poignee.setPointerCapture(ev.pointerId);
  document.body.classList.add('resizing');
  const deplacer = (e) => reglerLargeurPanneau(innerWidth - e.clientX - 16);
  const fin = () => {
    document.body.classList.remove('resizing');
    poignee.removeEventListener('pointermove', deplacer);
    stockageLocal.set('panelWidth', $('#panel').offsetWidth);
  };
  poignee.addEventListener('pointermove', deplacer);
  poignee.addEventListener('pointerup', fin, { once: true });
  poignee.addEventListener('pointercancel', fin, { once: true });
});
$('#panel-resize').addEventListener('dblclick', () => { reglerLargeurPanneau(360); stockageLocal.set('panelWidth', 360); });
// téléphones : les détails s'ouvrent en feuille et démarrent fermés ; le choix n'est pas enregistré, pour ne pas fermer le panneau latéral d'un ordinateur qui partage ce stockage
const fermerFeuille = () => { if (petitEcran() && !document.body.classList.contains('no-panel')) reglerPanneau(false); }; // entrer dans un bloc ou en sortir range la feuille pour laisser voir la carte
svg.addEventListener('click', fermerFeuille); // toucher un espace vide range aussi la feuille
// sur un téléphone, l'avertissement sur la connexion d'un outil d'IA n'apparaît que pendant qu'on utilise la bulle de questions : la toucher ou la sélectionner l'affiche, la quitter le masque.
// Le champ peut être désactivé quand rien n'est connecté, donc un toucher n'importe où sur la barre compte. Quand il apparaît, il est lu à voix haute une fois.
const boiteQuestion = $('#ask'), annonceQuestion = $('#ask-live');
const questionActive = (on) => {
  if (boiteQuestion.classList.contains('asking') === on) return;
  boiteQuestion.classList.toggle('asking', on);
  annonceQuestion.textContent = '';
  if (on && estTelephone() && !alerte.hidden) setTimeout(() => { annonceQuestion.textContent = alerte.querySelector('span')?.textContent || ''; }, 50);
};
['pointerdown', 'touchstart', 'focusin'].forEach((t) => boiteQuestion.addEventListener(t, () => questionActive(true), { passive: true }));
window.addEventListener('pointerdown', (ev) => { if (!boiteQuestion.contains(ev.target)) questionActive(false); }, true);
boiteQuestion.addEventListener('focusout', (ev) => { if (!boiteQuestion.contains(ev.relatedTarget)) questionActive(false); });
window.addEventListener('resize', replierContexte); // savoir s'il y a plus à lire dépend de la largeur
// quand rien n'est connecté, le champ est désactivé : sur un téléphone, c'est donc la barre elle-même qui prend le focus clavier pour montrer la note
const formQuestion = $('#ask-form');
const tabulationQuestion = () => { const on = estTelephone() && champQuestion.disabled && !alerte.hidden; if (on) { formQuestion.tabIndex = 0; formQuestion.setAttribute('aria-label', 'Bulle de questions : voir pourquoi on ne peut pas poser de question'); } else { formQuestion.removeAttribute('tabindex'); formQuestion.removeAttribute('aria-label'); } };
new MutationObserver(tabulationQuestion).observe(alerte, { attributes: true, attributeFilter: ['hidden'] });
new MutationObserver(tabulationQuestion).observe(champQuestion, { attributes: true, attributeFilter: ['disabled'] });
requeteTelephone.addEventListener('change', tabulationQuestion); tabulationQuestion();
// sur un téléphone, la feuille est une boîte de dialogue étiquetée et non modale ; pour les utilisateurs du clavier, le focus y entre puis en ressort quand elle se ferme
let utilisateurClavier = false, retourFeuille = null;
window.addEventListener('keydown', () => { utilisateurClavier = true; }, true);
window.addEventListener('pointerdown', () => { utilisateurClavier = false; }, true);
const roleFeuille = () => { if (estTelephone()) { panneau.setAttribute('role', 'dialog'); panneau.setAttribute('aria-label', 'Détails'); panneau.tabIndex = -1; } else { panneau.removeAttribute('role'); panneau.removeAttribute('aria-label'); panneau.removeAttribute('tabindex'); } };
requeteTelephone.addEventListener('change', roleFeuille); roleFeuille();
const reglerPanneau = (on) => {
  const etait = !document.body.classList.contains('no-panel'); document.body.classList.toggle('no-panel', !on); $('#btn-panel').setAttribute('aria-expanded', String(on));
  if (!petitEcran()) stockageLocal.set('panel', on);
  if (etait !== on && !estTelephone()) ajusterVue(true);
  if (etait !== on && estTelephone()) {
    if (on && utilisateurClavier) { retourFeuille = document.activeElement; panneau.focus({ preventScroll: true }); }
    else if (!on && retourFeuille) { if (panneau.contains(document.activeElement) || document.activeElement === document.body) retourFeuille.focus?.({ preventScroll: true }); retourFeuille = null; }
  }
};
document.body.classList.toggle('no-panel', petitEcran() || !stockageLocal.get('panel', true));
$('#btn-panel').setAttribute('aria-expanded', String(!document.body.classList.contains('no-panel')));
// la barre du haut peut faire une ou deux lignes : tout ce qui est dessous suit sa hauteur réelle
const elEntete = document.querySelector('header');
const synchroniserEntete = () => document.documentElement.style.setProperty('--hh', elEntete.offsetHeight + 'px');
new ResizeObserver(synchroniserEntete).observe(elEntete); synchroniserEntete(); window.addEventListener('resize', synchroniserEntete);
// sur un téléphone, le titre et la description défilent avec la colonne ; sur un écran plus large, ils reviennent au-dessus de la carte
const elContexte = $('#context'), contexteOrigine = elContexte.parentNode, contexteSuivant = elContexte.nextSibling;
const placerContexte = () => { if (estTelephone()) colonne.prepend(elContexte); else contexteOrigine.insertBefore(elContexte, contexteSuivant); synchroniserEntete(); };
requeteTelephone.addEventListener('change', () => { placerContexte(); if (etatVue.view && etatVue.layout) rendreColonne(etatVue.view, etatVue.layout); }); placerContexte();
$('#btn-panel').onclick = () => reglerPanneau(document.body.classList.contains('no-panel'));
panneau.addEventListener('click', (ev) => { if (ev.target.closest('.feuille-x')) reglerPanneau(false); });
Object.assign(etatVue.kinds, stockageLocal.get('kinds', {}));
window.addEventListener('keydown', (ev) => {
  if (elPalette.classList.contains('open') || ev.target.tagName === 'INPUT') return;
  if (ev.key === '/' || (ev.key === 'k' && (ev.metaKey || ev.ctrlKey))) { ev.preventDefault(); openPalette(); }
  else if (ev.key === 'Backspace') { ev.preventDefault(); monterNiveau(); }
  else if (ev.key === 'Escape') {
    if ($('#modal').classList.contains('open')) { $('#modal').classList.remove('open'); return; }
    if (!menuContextuel.hidden || fm.classList.contains('open') || elLegende.classList.contains('open')) { fermerMenu(); fm.classList.remove('open'); elLegende.classList.remove('open'); }
    else if (estTelephone() && !document.body.classList.contains('no-panel')) fermerFeuille(); // sur un téléphone, le premier Échap range la feuille de détails
    else if (etatVue.flow) finirParcours(); else if (etatVue.selected) choisir(null); else monterNiveau();
  }
  else if (ev.key === 'f' || ev.key === 'F') ajusterVue(true);
  else if (ev.key === 'p' || ev.key === 'P') $('#btn-panel').click();
  else if (ev.key === 'Enter' && typeof etatVue.selected === 'string') ouvrirBloc(etatVue.selected);
  else if (etatVue.flow && ev.key === 'ArrowRight') $('#fl-next')?.click();
  else if (etatVue.flow && ev.key === 'ArrowLeft') $('#fl-prev')?.click();
  else if (ev.key === '=' || ev.key === '+') zoomerDe(1.2);
  else if (ev.key === '-') zoomerDe(0.83);
});
