// Le bouton Décrire : Claude nomme et décrit les fichiers et les adresses du serveur qui n'ont qu'un nom provisoire. Il consomme des jetons :
// l'encart le dit à côté du bouton, et un clic ne traite qu'un lot. Sert uniquement quand la carte est ouverte par son serveur avec Claude Code.
const LOT_DESCRIPTION = 40;
const CLE_MESSAGE_DESCRIPTION = 'la-carte:message-apres-description';
let descriptionLancee = null;

function compterNonDecrits() { return G.files.filter((f) => f.auto).length + routes.filter((r) => r.auto).length; }

function encartNonDecrits(n) {
  if (COPIE_EXPORTEE) return ''; // celui qui reçoit une copie ne peut rien y changer
  const debut = n > 1 ? `${n} fichiers ou adresses gardent un nom provisoire.` : '1 fichier ou adresse garde un nom provisoire.';
  if (!window.LA_CARTE_SERVER?.cli || PLAN) return `<div class="callout">${debut} Demande à Claude de mettre à jour la carte pour les décrire.</div>`;
  if (descriptionLancee) return `<div class="callout" id="encart-decrire"><span id="decrire-avance" aria-live="polite">${h(descriptionLancee.texte)}</span><div class="actions"><button class="btn soft" data-decrire-stop>Arrêter</button></div></div>`;
  return `<div class="callout" id="encart-decrire">${debut} Claude peut ${n > 1 ? 'les nommer et les décrire' : 'le nommer et le décrire'}, ce qui consomme des jetons.<div class="actions"><button class="btn soft" data-decrire>${n > LOT_DESCRIPTION ? `Décrire les ${LOT_DESCRIPTION} premiers` : 'Décrire'}</button></div></div>`;
}

function redessinerEncartDecrire() {
  const encart = document.getElementById('encart-decrire');
  if (encart) encart.outerHTML = encartNonDecrits(compterNonDecrits());
}

async function lancerDescription() {
  if (descriptionLancee) return;
  const ctl = new AbortController();
  descriptionLancee = { ctl, texte: 'Préparation de la liste…' };
  redessinerEncartDecrire();
  const avance = (texte) => {
    descriptionLancee.texte = texte;
    const ligne = document.getElementById('decrire-avance');
    if (ligne) ligne.textContent = texte;
  };
  try {
    const res = await fetch('/api/ask', { method: 'POST', signal: ctl.signal, headers: { 'content-type': 'application/json', 'x-la-carte-token': window.LA_CARTE_SERVER.token }, body: JSON.stringify({ mode: 'describe' }) });
    const r = await lireFlux(res, avance);
    if (r.ecrits) {
      const fait = r.ecrits > 1 ? `${r.ecrits} fichiers ou adresses décrits.` : '1 fichier ou adresse décrit.';
      stockageLocal.set(CLE_MESSAGE_DESCRIPTION, r.restants ? `${fait} Encore ${r.restants} à décrire.` : fait);
      // le serveur recharge les onglets quand la page change ; si la page n'a pas changé, on recharge quand même
      setTimeout(() => location.reload(), 2500);
      return;
    }
    descriptionLancee = null;
    afficherMessage('Claude n’a rien renvoyé d’utilisable. Rien n’a changé.');
  } catch (e) {
    descriptionLancee = null;
    const textes = { not_logged_in: `${Maj(AGENT.cli)} a besoin que tu te reconnectes.`, rate_limited: `${AGENT.name} est occupé ou tu as atteint une limite d'utilisation. Réessaie dans un moment.`, cli_missing: `${Maj(AGENT.cli)} est introuvable.` };
    afficherMessage(e?.name === 'AbortError' ? 'Arrêté. Rien n’a changé.' : textes[e?.code] || String(e?.message || 'La description n’a pas abouti.').split('\n')[0]);
  }
  redessinerEncartDecrire();
}

setTimeout(() => {
  const apres = stockageLocal.get(CLE_MESSAGE_DESCRIPTION, '');
  if (apres) { stockageLocal.set(CLE_MESSAGE_DESCRIPTION, ''); afficherMessage(apres); }
}, 400);
