// Le bouton Thème : Auto (suit ton appareil) -> Clair -> Sombre -> Auto. Le choix est retenu sur cet
// appareil. Le thème lui-même est choisi par un petit script en haut de viewer.html, avant que rien soit dessiné,
// pour que la page n'affiche jamais un instant les mauvaises couleurs ; ce fichier ajoute seulement le bouton et le tient à jour.
(() => {
  const CARTE = window.Floorplan;
  const T = window.floorplanTheme;
  if (!CARTE || !T) return;

  const ICONES = {
    auto: '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/>',
    light: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/>',
    dark: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  };
  const NOMS = { auto: 'Auto (suit ton appareil)', light: 'Clair', dark: 'Sombre' };
  const MOTS = { auto: 'Auto', light: 'Clair', dark: 'Sombre' };
  const SUIVANT = { auto: 'light', light: 'dark', dark: 'auto' };

  const style = document.createElement('style');
  style.textContent = `
    /* une cible de 44 px ; la forme ronde au survol reste à 36 px comme les boutons voisins */
    #theme-toggle { position: relative; flex: none; width: 44px; height: 44px; padding: 0; background: none; }
    #theme-toggle::before { content: ""; position: absolute; inset: 4px; border-radius: 999px; transition: background .2s var(--ease); }
    #theme-toggle:hover { background: none; }
    #theme-toggle:hover::before { background: rgba(var(--ink), .07); }
    #theme-toggle svg { position: relative; width: 18px; height: 18px; }
    #theme-toggle:focus-visible { outline: 2px solid var(--ring); outline-offset: -3px; }
    .theme-status { position: fixed; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
    @media (prefers-reduced-motion: reduce) { #theme-toggle, #theme-toggle::before { transition: none; } #theme-toggle:active { transform: none; } }`;
  document.head.appendChild(style);

  // lu par les lecteurs d'écran quand le thème change
  const statut = document.createElement('span');
  statut.className = 'theme-status';
  statut.setAttribute('role', 'status');
  document.body.appendChild(statut);

  const bouton = CARTE.ajouterBoutonEntete({ id: 'theme-toggle', svg: ICONES.auto, onClick: () => {
    const suivant = SUIVANT[T.get()];
    T.set(suivant);
    statut.textContent = `Le thème est maintenant ${suivant === 'auto' ? 'Auto, selon ton appareil' : MOTS[suivant]}.`;
  } });

  const afficher = () => {
    const c = T.get();
    bouton.querySelector('svg').innerHTML = ICONES[c];
    const texte = `Thème : ${NOMS[c]}. Appuie pour passer à ${MOTS[SUIVANT[c]]}.`;
    bouton.title = texte;
    bouton.setAttribute('aria-label', texte);
  };
  // Entrée et Espace appuient sur ce bouton ; elles ne doivent pas aussi lancer la touche de la page qui « ouvre le bloc sélectionné »
  bouton.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') ev.stopPropagation(); });
  window.addEventListener('floorplan-theme-change', afficher);
  afficher();
})();
