// ======================= infobulles =======================
const infobulle = $('#tooltip');
let minuterieInfobulle = null, dernierPointeur = null;
// un toucher envoie aussi mouseenter, donc on retient si le dernier pointeur était un doigt : les infobulles au survol sont pour la souris
let toucheEnCours = false;
['pointerdown', 'pointermove'].forEach((t) => window.addEventListener(t, (ev) => { toucheEnCours = ev.pointerType === 'touch'; }, { capture: true, passive: true }));
function montrerInfobulle(ev, html) { clearTimeout(minuterieInfobulle); if (!html || toucheEnCours || glisse?.moved || !$('#ctxmenu').hidden) return; infobulle.innerHTML = html; infobulle.hidden = false; deplacerInfobulle(ev); }
/** Les blocs s'expliquent après un court survol, pour que le simple passage de la souris ne fasse pas clignoter les infobulles. */
function infobulleDifferee(ev, fabriquer) { clearTimeout(minuterieInfobulle); dernierPointeur = ev; minuterieInfobulle = setTimeout(() => montrerInfobulle(dernierPointeur, fabriquer()), 420); }
function deplacerInfobulle(ev) {
  dernierPointeur = ev;
  if (infobulle.hidden) return;
  const r = $('#stage').getBoundingClientRect();
  let x = ev.clientX - r.left + 18, y = ev.clientY - r.top + 18;
  if (x + infobulle.offsetWidth + 12 > r.width) x = ev.clientX - r.left - infobulle.offsetWidth - 14;
  if (y + infobulle.offsetHeight + 12 > r.height) y = ev.clientY - r.top - infobulle.offsetHeight - 14;
  infobulle.style.left = Math.max(8, x) + 'px'; infobulle.style.top = Math.max(8, y) + 'px'; // retournée sur un écran étroit, elle reste quand même à l'écran
}
function masquerInfobulle() { clearTimeout(minuterieInfobulle); infobulle.hidden = true; }
function adressesDe(e) {
  const m = new Map();
  for (const l of e.links) for (const [ri] of l.calls || []) if (ri != null) m.set(ri, (m.get(ri) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([ri, n]) => ({ r: routes[ri], i: ri, n }));
}
function infobulleLien(e) {
  if (e.k === 'contains') return `<div class="tt">${h(nomDe(e.a))} contient ${h(nomDe(e.b))}</div>`;
  const eps = adressesDe(e);
  const noms = [...new Set(e.links.flatMap((l) => l.names || []))];
  const libelles = [...new Set(e.links.flatMap((l) => l.labels || []))].filter((x) => !/^[A-Z]+ \//.test(x));
  const desc = e.links.map((l) => l.desc).find(Boolean);
  const meta = eps.length ? eps.slice(0, 4).map((x) => `${x.r.m} ${x.r.p}`).join('\n') + (eps.length > 4 ? `\n+${eps.length - 4} de plus` : '')
    : noms.length ? 'utilise ' + noms.slice(0, 8).join(', ') + (noms.length > 8 ? '…' : '') : libelles.slice(0, 4).join('\n');
  return `<div class="tt">${h(nomDe(e.a))} → ${h(nomDe(e.b))}</div><div class="td">${h(LIBELLE_TYPE[e.k])} · ${accorder(e.w, 'connexion')}${eps.length ? ` · ${accorder(eps.length, 'adresse')} du serveur` : ''}</div>${desc ? `<div class="td">${h(desc)}</div>` : ''}${meta ? `<div class="tp">${h(meta)}</div>` : ''}<div class="th"><span><span class="kbd">clic</span> détails</span><span><span class="kbd">clic droit</span> plus</span></div>`;
}

