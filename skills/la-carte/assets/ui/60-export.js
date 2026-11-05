// Export : une copie de la carte à partager, en un seul fichier HTML, pour les personnes sans Claude.
// Le serveur de la carte (serveur.mjs) la fabrique : la même page sans la bulle de questions, sans demandes à
// Claude, sans liens vers cet ordinateur, avec en plus les éléments cochés ici. Ce fichier ne parle à
// la carte que par window.LaCarte.
(() => {
  const CARTE = window.LaCarte;
  if (!CARTE || CARTE.exporte) return;
  const SERVEUR = window.LA_CARTE_SERVER;
  // ouverte dans l'appli Claude : il n'y a pas de dossier de carte d'où exporter
  if (!SERVEUR && location.protocol !== 'file:') return;
  const { h } = CARTE;
  const GRAPHE = CARTE.graphe;
  const EST_UN_PLAN = !!GRAPHE.meta.ebauche;
  const COMMANDE = 'node la-carte/.cache/serveur.mjs --export';

  const style = document.createElement('style');
  style.textContent = `
.xp-opts { display: flex; flex-direction: column; gap: 2px; margin: 14px 0 4px; }
.xp-opt { display: flex; gap: 12px; align-items: flex-start; padding: 10px 12px; border-radius: 12px; cursor: pointer; }
.xp-opt:hover { background: rgba(var(--ink), .05); }
.xp-opt input { margin: 3px 0 0; width: 16px; height: 16px; accent-color: var(--accent); flex: none; cursor: pointer; }
.xp-opt b { display: block; font-weight: 500; color: var(--text); }
.xp-opt span { display: block; font-size: 12.5px; color: var(--text-3); line-height: 1.5; }
.xp-opt.warn span { color: var(--warn-text); }
.xp-note { font-size: 12.5px; color: var(--text-3); line-height: 1.55; margin-top: 10px; }
.xp-err { font-size: 12.5px; color: var(--warn-text); background: var(--warn-bg); border-radius: 10px; padding: 8px 12px; margin-top: 10px; }
`;
  document.head.appendChild(style);
  CARTE.icones.export = '<path d="M12 15V4M7.5 8.5 12 4l4.5 4.5"/><path d="M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"/>';

  // seulement ce que cette carte contient ; ce qui dit comment attaquer l'appli reste décoché par défaut
  const ELEMENTS = [
    { id: 'flows', titre: 'Parcours et visite guidée', aide: 'Les explications pas à pas, y compris celles que tu as demandées.', coche: true, present: GRAPHE.parcours.length > 0 || (GRAPHE.visite || []).length > 0 },
    { id: 'notes', titre: 'Notes sur les fichiers', aide: 'Les notes affichées sur les cartes des fichiers.', coche: true, present: GRAPHE.files.some((f) => f.note) },
    { id: 'recent', titre: 'Travail récent', aide: 'Ce qui vient de changer, et pourquoi.', coche: false, present: !!GRAPHE.recent?.items?.length },
    EST_UN_PLAN
      ? { id: 'health', titre: 'Revue du plan', aide: 'Les décisions que le plan laisse encore ouvertes.', coche: false, present: !!GRAPHE.sante?.problemes?.length }
      : { id: 'health', titre: 'Contrôle de santé', aide: 'Montre les adresses du serveur ouvertes à tous et où se trouvent les secrets dans le code (jamais leur valeur). À inclure seulement pour des personnes de confiance.', coche: false, attention: true, present: !!GRAPHE.sante?.problemes?.length },
    { id: 'suivi', titre: 'Où j’en suis', aide: 'Ta note de suivi. À inclure seulement si cette personne peut la lire.', coche: false, present: !!GRAPHE.suivi },
  ].filter((e) => e.present);

  async function telecharger(fenetre, fermer) {
    const erreur = fenetre.querySelector('.xp-err');
    const inclus = [...fenetre.querySelectorAll('[data-xp]')].filter((c) => c.checked).map((c) => c.dataset.xp);
    // les parcours demandés depuis la dernière construction de la carte n'existent pour l'instant que sur cette page
    const parcours = GRAPHE.parcours.filter((f) => f.custom).map((f) => ({ id: f.id, title: f.title, description: f.description, steps: f.steps }));
    try {
      const reponse = await fetch('/api/export', { method: 'POST', headers: { 'content-type': 'application/json', 'x-la-carte-token': SERVEUR.token }, body: JSON.stringify({ include: inclus, parcours: parcours }) });
      if (reponse.status === 403) throw new Error('Le serveur de la carte a redémarré depuis l’ouverture de cette page. Recharge la page et réessaie.');
      if (!reponse.ok) throw new Error((await reponse.json().catch(() => ({}))).error || 'Le serveur de la carte n’a pas pu l’exporter.');
      const nom = /filename="([^"]+)"/.exec(reponse.headers.get('content-disposition') || '')?.[1] || 'carte-la-carte.html';
      const lien = document.createElement('a');
      lien.href = URL.createObjectURL(await reponse.blob());
      lien.download = nom;
      document.body.appendChild(lien); lien.click(); lien.remove();
      setTimeout(() => URL.revokeObjectURL(lien.href), 30000);
      fermer();
      CARTE.message(`${nom} téléchargé`);
    } catch (e) {
      erreur.hidden = false;
      // 'Failed to fetch' est le texte du navigateur : il reste en anglais
      erreur.textContent = e.message === 'Failed to fetch' ? 'Impossible de joindre le serveur de la carte. Demande à Claude de rouvrir la carte, puis réessaie.' : e.message;
    }
  }

  function ouvrirExport() {
    if (!SERVEUR) {
      CARTE.fenetre({
        title: 'Exporter une copie',
        html: `<p>L’export a besoin du serveur de la carte. Demande à Claude d’« exporter la carte », ou lance ceci dans le dossier du projet :</p><pre>${h(COMMANDE)}</pre>`,
        actions: [{ label: 'Copier la commande', primary: true, icon: 'copy', onClick: () => { CARTE.copier(COMMANDE); CARTE.message('Copié'); } }],
      });
      return;
    }
    const fenetre = CARTE.fenetre({
      title: 'Exporter une copie',
      html: `<p>Un seul fichier avec toute la carte, à envoyer à qui tu veux. Il s’ouvre dans n’importe quel navigateur sans rien installer, et n’a pas de bulle de questions.</p>
        ${ELEMENTS.length ? `<div class="xp-opts">${ELEMENTS.map((e) => `<label class="xp-opt${e.attention ? ' warn' : ''}"><input type="checkbox" data-xp="${e.id}"${e.coche ? ' checked' : ''}><div><b>${h(e.titre)}</b><span>${h(e.aide)}</span></div></label>`).join('')}</div>` : ''}
        <p class="xp-note">Il montre comment ${h(GRAPHE.projet.name)} est construit : chaque partie, chaque fichier, chaque adresse du serveur et le nom des fonctions, mais pas le code lui-même.</p>
        <div class="xp-err" hidden></div>`,
      actions: [{ label: 'Télécharger', primary: true, icon: 'export', keepOpen: true, onClick: (fermer) => { telecharger(fenetre.el, fermer); } }],
    });
  }

  CARTE.ajouterBoutonEntete({ id: 'btn-export', label: 'Exporter', icon: 'export', title: 'Exporter une copie de cette carte à partager', onClick: ouvrirExport });
})();
