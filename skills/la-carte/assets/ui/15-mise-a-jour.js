// Le bouton Mettre à jour : refait la carte d'après le code actuel, sans appeler Claude, donc sans consommer de jeton.
// Une pastille dit combien de fichiers ont changé depuis la dernière carte. Sert uniquement quand la carte est ouverte par son serveur.
(() => {
  const CARTE = window.LaCarte;
  const SERVEUR = window.LA_CARTE_SERVER;
  if (!CARTE || CARTE.exporte || !SERVEUR || CARTE.graphe.meta.ebauche) return;
  const entetes = { 'x-la-carte-token': SERVEUR.token };
  const CLE_MESSAGE = 'la-carte:message-apres-mise-a-jour';
  let enCours = false;

  const bouton = CARTE.ajouterBoutonEntete({ id: 'btn-update', label: 'Mettre à jour', icon: 'synchronisation', title: 'Refaire la carte d’après le code actuel. Ne consomme aucun jeton.', onClick: lancer });
  const libelle = bouton.querySelector('.bl');
  const pastille = document.createElement('span');
  pastille.className = 'badge';
  pastille.hidden = true;
  bouton.appendChild(pastille);

  async function verifier() {
    if (enCours || document.hidden) return;
    let etat;
    try { etat = await fetch('/api/fraicheur', { headers: entetes }).then((r) => (r.ok ? r.json() : null)); } catch { return; }
    if (!etat?.suivi) return;
    pastille.hidden = !etat.fichiers;
    pastille.textContent = etat.fichiers > 99 ? '99+' : String(etat.fichiers);
    bouton.title = etat.fichiers ? `${CARTE.pluriel(etat.fichiers, 'fichier')} modifié${etat.fichiers > 1 ? 's' : ''} depuis la dernière carte. Mettre à jour ne consomme aucun jeton.` : 'La carte correspond au code actuel.';
  }

  async function lancer() {
    if (enCours) return;
    enCours = true;
    bouton.disabled = true;
    if (libelle) libelle.textContent = 'Mise à jour…';
    CARTE.message('Mise à jour de la carte…');
    let r;
    try { r = await fetch('/api/update', { method: 'POST', headers: entetes }).then((x) => x.json()); } catch { r = { ok: false, error: 'Impossible de joindre le serveur de la carte.' }; }
    if (r.ok) {
      const message = r.sansDescription ? `Carte à jour. ${CARTE.pluriel(r.sansDescription, 'fichier')} sans description : demande à Claude de ${r.sansDescription > 1 ? 'les' : 'le'} décrire.` : 'Carte à jour.';
      CARTE.stockage.set(CLE_MESSAGE, message);
      // le serveur recharge les onglets quand la page change ; si rien n'a changé dans la page, on recharge quand même
      setTimeout(() => location.reload(), 2500);
      return;
    }
    enCours = false;
    bouton.disabled = false;
    if (libelle) libelle.textContent = 'Mettre à jour';
    CARTE.message(r.error || 'La mise à jour n’a pas abouti.');
  }

  const apres = CARTE.stockage.get(CLE_MESSAGE, '');
  if (apres) { CARTE.stockage.set(CLE_MESSAGE, ''); setTimeout(() => CARTE.message(apres), 400); }
  verifier();
  setInterval(verifier, 20000);
  document.addEventListener('visibilitychange', verifier);
})();
