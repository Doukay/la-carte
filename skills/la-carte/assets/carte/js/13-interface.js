// ======================= interface : contexte, fil d'Ariane, légende =======================
function afficherContexte() {
  if (etatVue.container === 'q:answer') {
    $('#context').innerHTML = `<h1>${h(etatVue.answer.title)}</h1><p>${h(etatVue.answer.question)}</p>`;
    return;
  }
  const i = infosBloc(etatVue.container);
  $('#context').innerHTML = `<h1>${h(i.name)}</h1>${i.desc ? `<p class="cd" id="ctx-desc">${h(i.desc)}</p>` : ''}${etatVue.view?.hidden ? `<p class="cx" style="color:var(--text-3);font-size:12.5px;margin-top:8px">${etatVue.view.hidden} export(s) de plus ne sont importés nulle part par leur nom ; ils sont listés dans le panneau de détails.</p>` : ''}${i.desc ? '<button type="button" class="ctx-more" aria-controls="ctx-desc" hidden></button>' : ''}`;
  replierContexte();
}
/** Sur un téléphone, la description se replie sur une ligne ; le bouton Plus / Moins n'apparaît que s'il y a plus à lire, et le choix est retenu sur cet appareil. */
function replierContexte() {
  const ctx = $('#context'), boutonPlus = ctx.querySelector('.ctx-more'), desc = ctx.querySelector('.cd');
  if (!boutonPlus || !desc) return;
  const deplie = stockageLocal.get('contextOpen', false);
  ctx.classList.add('folded');
  const long = desc.scrollHeight > desc.clientHeight + 1 || !!ctx.querySelector('.cx');
  ctx.classList.toggle('folded', !deplie);
  boutonPlus.hidden = !long;
  desc.inert = estTelephone() && long && !deplie; // replié sur un téléphone : on ne peut pas atteindre au clavier les liens des lignes cachées ; Plus le déplie
  boutonPlus.textContent = deplie ? 'Moins' : 'Plus';
  boutonPlus.setAttribute('aria-expanded', String(deplie));
  boutonPlus.onclick = () => { stockageLocal.set('contextOpen', !deplie); replierContexte(); };
}
function afficherFilAriane() {
  const c = $('#crumbs'); c.innerHTML = '';
  const chemin = lignee(etatVue.container).slice().reverse();
  chemin.forEach((element, idx) => {
    if (idx) { const s = document.createElement('span'); s.className = 'sep'; s.textContent = '/'; c.appendChild(s); }
    const b = document.createElement('button');
    b.textContent = element === 'root' ? 'Vue d\'ensemble' : element === 'q:answer' ? `${etatVue.answer.kind || 'Réponse'}: ${etatVue.answer.title}` : infosBloc(element).name;
    if (element === etatVue.container) b.className = 'cur';
    b.onclick = () => allerVers(element, { select: chemin[idx + 1] || null });
    c.appendChild(b);
  });
  $('#btn-up').hidden = etatVue.container === 'root';
}
function afficherLegende(vue) {
  const totaux = {}; for (const l of G.links) totaux[l.k] = (totaux[l.k] || 0) + 1;
  const ici = {}; for (const e of vue.edges) ici[e.k] = (ici[e.k] || 0) + 1;
  const L = $('#legend'); L.innerHTML = '<div class="lh">Afficher les liens</div>';
  const ligneTechnique = () => { const etiquette = document.createElement('label'); etiquette.className = 'tech' + (modeTechnique() ? '' : ' off'); etiquette.innerHTML = `<input type="checkbox" ${modeTechnique() ? 'checked' : ''}><span>Afficher le détail technique</span><span class="tog" style="margin-left:auto"></span>`; etiquette.querySelector('input').onchange = (ev) => reglerModeTechnique(ev.target.checked); return etiquette; };
  let nbDesactives = 0;
  for (const k of TYPES_CONNEXION) {
    if (!totaux[k]) continue;
    if (!etatVue.kinds[k]) nbDesactives++;
    const etiquette = document.createElement('label');
    etiquette.className = etatVue.kinds[k] ? '' : 'off';
    etiquette.innerHTML = `<input type="checkbox" ${etatVue.kinds[k] ? 'checked' : ''}><span class="sw" style="background:var(--k-${k})"></span>${LIBELLE_TYPE[k]}<span class="n">${ici[k] || ''}</span><span class="tog"></span>`;
    etiquette.querySelector('input').onchange = (ev) => { etatVue.kinds[k] = ev.target.checked; stockageLocal.set('kinds', etatVue.kinds); afficherVue({ keepTransform: true }); };
    L.appendChild(etiquette);
  }
  L.appendChild(ligneTechnique());
  if (recentsPar.size) {
    const etiquette = document.createElement('label'); etiquette.className = 'tech' + (recentVisible ? '' : ' off');
    etiquette.innerHTML = `<input type="checkbox" ${recentVisible ? 'checked' : ''}><span>Mettre en valeur le travail récent</span><span class="tog" style="margin-left:auto"></span>`;
    etiquette.querySelector('input').onchange = (ev) => { reglerRecentVisible(ev.target.checked); etiquette.classList.toggle('off', !ev.target.checked); };
    L.appendChild(etiquette);
  }
  const fb = $('#filters-btn');
  fb.querySelector('.badge')?.remove();
  if (nbDesactives) fb.insertAdjacentHTML('beforeend', `<span class="badge">${nbDesactives}</span>`);
  fb.classList.toggle('icon', !nbDesactives);
}

