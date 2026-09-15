/* ---------- Rendering ---------- */
function render(){
  document.getElementById('app').innerHTML = appHTML();
  if(ui.screen==='tree' && ui.view==='arbre' && currentTree()){
    requestAnimationFrame(()=>{ drawConnectors(); updateMinimap(); });
  }
}

function globalStats(){
  const byStatus={}; STATUS_OPTIONS.forEach(s=>byStatus[s]=0);
  state.wolves.forEach(w=>{ byStatus[w.status] = (byStatus[w.status]||0)+1; });
  return { trees:state.trees.length, wolves:state.wolves.length, unions:state.unions.length, litters:state.litters.length, byStatus };
}

function appHTML(){
  return `
    <div class="sidebar">
      <button class="brand" onclick="goToDashboard()">
        <span class="brand-mark">🐺</span><div><h1>Meute</h1><small>Arbres généalogiques WolfQuest</small></div>
      </button>
      <button class="btn btn-amber btn-block" onclick="openNewTreeModal()">+ Nouvel arbre</button>
      <div class="sidebar-foot">
        <button class="btn btn-ghost" onclick="toggleTheme()">☀︎ / ☾ Changer le thème</button>
        <button class="btn btn-ghost" onclick="exportData()">⭳ Exporter tout</button>
        <button class="btn btn-ghost" onclick="triggerImport()">⭱ Importer une sauvegarde</button>
        <input type="file" id="importFile" accept="application/json" style="display:none" onchange="handleImportFile(this)">
      </div>
    </div>
    <div class="main">
      ${ui.screen==='dashboard' ? dashboardHTML() : treePageHTML()}
    </div>
    ${ui.modal ? modalHTML() : ''}
  `;
}

function dashboardHTML(){
  const stats = globalStats();
  return `<div class="content">
    <div class="dash-header">
      <div><h2>Tableau de bord</h2><div class="topbar-sub">Vue d'ensemble de toutes tes meutes</div></div>
      <button class="btn btn-amber" onclick="openNewTreeModal()">+ Nouvel arbre</button>
    </div>
    <div class="stats-row">
      <div class="stat-card"><div class="stat-num">${stats.trees}</div><div class="stat-label">Arbres</div></div>
      <div class="stat-card"><div class="stat-num">${stats.wolves}</div><div class="stat-label">Loups</div></div>
      <div class="stat-card"><div class="stat-num">${stats.unions}</div><div class="stat-label">Unions</div></div>
      <div class="stat-card"><div class="stat-num">${stats.litters}</div><div class="stat-label">Portées</div></div>
      ${STATUS_OPTIONS.map(s=>`<div class="stat-card stat-card--mini"><div class="stat-num" style="color:${STATUS_COLORS[s]}">${stats.byStatus[s]||0}</div><div class="stat-label">${s}</div></div>`).join('')}
    </div>
    ${state.trees.length===0 ? `<div class="empty-state"><div class="paw-big">🐾</div><h3>Crée ton premier arbre</h3><p>Chaque arbre correspond à une partie jouée.</p><button class="btn btn-amber" onclick="openNewTreeModal()">+ Nouvel arbre</button></div>` :
    `<div class="tree-grid">${state.trees.map(t=>treeCardHTML(t)).join('')}</div>`}
  </div>`;
}
function treeCardHTML(t){
  const wolves = state.wolves.filter(w=>w.treeId===t.id);
  const unions = state.unions.filter(u=>u.treeId===t.id);
  return `<div class="tree-card">
    <div>
      <h3>${escapeHTML(t.name)}</h3>
      <div class="hint">${wolves.length} loup${wolves.length>1?'s':''} · ${unions.length} union${unions.length>1?'s':''}</div>
    </div>
    <div class="tree-card-actions">
      <button class="btn btn-ghost btn-sm" onclick="openTree('${t.id}','view')">👁 Consulter</button>
      <button class="btn btn-amber btn-sm" onclick="openTree('${t.id}','edit')">✎ Éditer</button>
    </div>
    <div class="tree-card-actions">
      <button class="btn btn-ghost btn-sm" onclick="renameTree('${t.id}')">Renommer</button>
      <button class="btn btn-ghost btn-sm" onclick="duplicateTree('${t.id}')">Dupliquer</button>
      <button class="btn btn-ghost btn-sm" onclick="exportTree('${t.id}')">Exporter</button>
      <button class="btn btn-danger btn-sm" onclick="deleteTree('${t.id}')">Supprimer</button>
    </div>
  </div>`;
}

function treePageHTML(){
  const t = currentTree();
  if(!t){ ui.screen='dashboard'; return dashboardHTML(); }
  const wolves = state.wolves.filter(w=>w.treeId===t.id);
  const editing = ui.mode==='edit';
  return `
    <div class="topbar">
      <div>
        <button class="btn btn-ghost btn-sm" onclick="goToDashboard()" style="margin-bottom:8px;">← Tableau de bord</button>
        <h2>${escapeHTML(t.name)}</h2>
        <div class="topbar-sub">${wolves.length} loup${wolves.length>1?'s':''}</div>
      </div>
      <div class="topbar-actions">
        <div class="view-toggle">
          <button class="${ui.view==='liste'?'active':''}" onclick="setView('liste')">Liste</button>
          <button class="${ui.view==='arbre'?'active':''}" onclick="setView('arbre')">Arbre</button>
        </div>
        <button class="btn ${editing?'btn-amber':'btn-ghost'} btn-sm" onclick="toggleMode()">${editing?'✎ Édition':'👁 Lecture'} · changer</button>
        ${editing?`<button class="btn btn-amber" onclick="openWolfModal(null)">+ Ajouter un loup</button>`:''}
      </div>
    </div>
    <div class="content">
      ${ui.view==='liste' ? listViewHTML(wolves) : treeViewHTML(wolves)}
    </div>
  `;
}

function listViewHTML(wolves){
  let filtered = wolves;
  if(ui.statusFilter!=='all') filtered = filtered.filter(w=>w.status===ui.statusFilter);
  if(ui.search && ui.search.trim()){
    const q = ui.search.trim().toLowerCase();
    filtered = filtered.filter(w=>(w.name||'').toLowerCase().includes(q) || (w.pack||'').toLowerCase().includes(q) || (w.coat||'').toLowerCase().includes(q));
  }
  return `
    <div class="filters">
      <input type="text" placeholder="Rechercher un loup, une meute, une robe…" value="${escapeHTML(ui.search)}" oninput="setSearch(this.value)" onkeyup="if(event.key==='Enter')applySearch()" onblur="applySearch()">
      <select onchange="setStatusFilter(this.value)">
        <option value="all" ${ui.statusFilter==='all'?'selected':''}>Tous les statuts</option>
        ${STATUS_OPTIONS.map(s=>`<option value="${s}" ${ui.statusFilter===s?'selected':''}>${s}</option>`).join('')}
      </select>
    </div>
    ${wolves.length===0 ? `<div class="empty-state"><div class="paw-big">🐺</div><h3>Aucun loup pour l'instant</h3><p>Ajoute ton premier loup pour commencer cet arbre.</p></div>` :
    filtered.length===0 ? `<p class="hint">Aucun loup ne correspond à ta recherche.</p>` :
    `<div class="wolf-grid">${filtered.map(w=>wolfCardHTML(w.id)).join('')}</div>`}
  `;
}

function wolfCardHTML(wolfId){
  const w = getWolf(wolfId); if(!w) return '';
  const color = STATUS_COLORS[w.status]||'#8A8FB0';
  const photo = w.portrait ? `<img src="${w.portrait}" alt="">` : `<div class="wolf-photo-placeholder">🐾</div>`;
  const sexIcon = w.sex==='M'?'♂':w.sex==='F'?'♀':'?';
  return `<button class="wolf-card" onclick="openWolfModal('${w.id}')">
    <div class="wolf-photo" style="--status-ring:${color};">${photo}<span class="wolf-sex-badge">${sexIcon}</span></div>
    <div class="wolf-card-name">${escapeHTML(w.name)}</div>
    ${w.coat?`<div class="wolf-card-coat">${escapeHTML(w.coat)}</div>`:''}
    <span class="wolf-status-pill" style="background:${color}22; color:${color};">${w.status||'—'}</span>
  </button>`;
}
function freeCardHTML(wolfId){
  const w = getWolf(wolfId); if(!w||!w.pos) return '';
  const color = STATUS_COLORS[w.status]||'#8A8FB0';
  const photo = w.portrait ? `<img src="${w.portrait}" alt="">` : `<div class="wolf-photo-placeholder">🐾</div>`;
  const sexIcon = w.sex==='M'?'♂':w.sex==='F'?'♀':'?';
  const editing = ui.mode==='edit';
  const dragAttr = editing ? `onmousedown="onCardMouseDown(event,'${w.id}')"` : '';
  return `<div class="wolf-card wolf-card-free ${editing?'':'wolf-card-free--ro'}" id="card-${w.id}" style="left:${w.pos.x}px; top:${w.pos.y}px; --status-ring:${color};"
    ${dragAttr} onclick="cardClicked('${w.id}')">
    <div class="wolf-photo" style="--status-ring:${color};">${photo}<span class="wolf-sex-badge">${sexIcon}</span></div>
    <div class="wolf-card-name">${escapeHTML(w.name)}</div>
    ${w.coat?`<div class="wolf-card-coat">${escapeHTML(w.coat)}</div>`:''}
    <span class="wolf-status-pill" style="background:${color}22; color:${color};">${w.status||'—'}</span>
  </div>`;
}

/* ---------- Modal router ---------- */
function modalHTML(){
  if(ui.modal.type==='newtree') return newTreeModalHTML();
  if(ui.modal.type==='wolf') return wolfModalHTML();
  if(ui.modal.type==='union') return unionModalHTML();
  return '';
}
function newTreeModalHTML(){
  return `<div class="overlay" onclick="if(event.target===this) closeModal()">
    <div class="modal" style="max-width:400px;">
      <div class="modal-head"><h3>Nouvel arbre</h3><button class="modal-close" onclick="closeModal()">✕</button></div>
      <div class="modal-body">
        <div class="field"><label>Nom de l'arbre (ex : nom de ta partie)</label>
          <input id="newTreeName" type="text" placeholder="Ex : Meute de la Rivière Grise" onkeyup="if(event.key==='Enter')createTree()">
        </div>
      </div>
      <div class="modal-foot"><span></span><button class="btn btn-amber" onclick="createTree()">Créer l'arbre</button></div>
    </div>
  </div>`;
}

function wolfModalHTML(){
  const w = ui.modal.draft;
  const tab = ui.modal.tab;
  const ro = ui.modal.readonly;
  const tabs = [['info','Infos'],['skills','Compétences'],['perks','Age Perks'],['timeline','Frise de vie'],['unions','Unions']];
  return `<div class="overlay" onclick="if(event.target===this) closeModal()">
    <div class="modal">
      <div class="modal-head"><h3>${ui.modal.isNew?'Nouveau loup':escapeHTML(w.name||'Loup')}${ro?'<span class="ro-badge">Lecture seule</span>':''}</h3><button class="modal-close" onclick="closeModal()">✕</button></div>
      <div class="modal-body">
        <div class="tabs">${tabs.map(([k,l])=>`<button class="tab ${tab===k?'active':''}" onclick="wolfModalTab('${k}')">${l}</button>`).join('')}</div>
        ${tab==='info'?wolfTabInfo(w,ro):''}
        ${tab==='skills'?wolfTabSkills(w,ro):''}
        ${tab==='perks'?wolfTabPerks(w,ro):''}
        ${tab==='timeline'?wolfTabTimeline(w,ro):''}
        ${tab==='unions'?wolfTabUnions(w,ro):''}
      </div>
      <div class="modal-foot">
        <div>${(!ui.modal.isNew && !ro)?`<button class="btn btn-danger btn-sm" onclick="deleteWolfFromModal()">Supprimer ce loup</button>`:''}</div>
        <div style="display:flex; gap:8px;">
          <button class="btn btn-ghost" onclick="closeModal()">Fermer</button>
          ${!ro?`<button class="btn btn-amber" onclick="saveWolfModal()">Enregistrer</button>`:''}
        </div>
      </div>
    </div>
  </div>`;
}
function wolfTabInfo(w, ro){
  return `
    <div class="portrait-row">
      <div class="portrait-preview">${w.portrait?`<img src="${w.portrait}">`:'<span style="font-size:26px;opacity:.4;">🐾</span>'}</div>
      ${!ro?`<div>
        <label class="btn btn-ghost btn-sm file-btn">Choisir une photo<input type="file" accept="image/*" style="display:none" onchange="setPortraitFile(this)"></label>
        <div class="hint">Portrait principal du loup.</div>
      </div>`:''}
    </div>
    <div class="field"><label>Nom</label><input type="text" value="${escapeHTML(w.name)}" oninput="setDraft('name', this.value)" ${ro?'disabled':''}></div>
    <div class="field"><label>Robe (nom du pelage)</label><input type="text" placeholder="Ex : Timber, Arctic, Dawn…" value="${escapeHTML(w.coat)}" oninput="setDraft('coat', this.value)" ${ro?'disabled':''}></div>
    <div class="row2">
      <div class="field"><label>Sexe</label>
        <select onchange="setDraft('sex', this.value)" ${ro?'disabled':''}>
          <option value="M" ${w.sex==='M'?'selected':''}>Mâle</option>
          <option value="F" ${w.sex==='F'?'selected':''}>Femelle</option>
          <option value="?" ${w.sex==='?'?'selected':''}>Inconnu</option>
        </select>
      </div>
      <div class="field"><label>Statut</label>
        <select onchange="setDraft('status', this.value)" ${ro?'disabled':''}>
          ${STATUS_OPTIONS.map(s=>`<option value="${s}" ${w.status===s?'selected':''}>${s}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="field"><label>Meute d'origine / territoire</label><input type="text" value="${escapeHTML(w.pack)}" oninput="setDraft('pack', this.value)" ${ro?'disabled':''}></div>
    <div class="field"><label>Notes</label><textarea oninput="setDraft('notes', this.value)" ${ro?'disabled':''}>${escapeHTML(w.notes)}</textarea></div>
  `;
}
function wolfTabSkills(w, ro){
  return `<div class="hint" style="margin-bottom:10px;">Les points vont de -2 à +2, comme la répartition des compétences dans WolfQuest AE.</div>
    ${SKILL_DEFS.map(([key,label])=>`
      <div class="skill-row">
        <span class="skill-name">${label}</span>
        <div class="skill-stepper">
          ${!ro?`<button class="stepper-btn" onclick="adjustSkill('${key}', -1)">−</button>`:''}
          <span class="skill-val">${w.skills[key]>0?'+':''}${w.skills[key]}</span>
          ${!ro?`<button class="stepper-btn" onclick="adjustSkill('${key}', 1)">+</button>`:''}
        </div>
      </div>
    `).join('')}
  `;
}
function wolfTabPerks(w, ro){
  return `<div class="hint" style="margin-bottom:10px;">${ro?'Historique des Age Perks de ce loup.':"Ajoute une entrée par année où ton loup a choisi des Age Perks (jusqu'à 3 par an dans le jeu)."}</div>
    ${w.agePerks.length===0&&ro?`<p class="hint">Aucune entrée.</p>`:''}
    ${w.agePerks.map((entry,idx)=>`
      <div class="perk-entry">
        <div class="perk-entry-head">
          <div style="display:flex; align-items:center; gap:10px;">
            <input type="number" min="1" style="width:70px;" placeholder="Âge" value="${escapeHTML(entry.age)}" oninput="setDraft('agePerks.${idx}.age', this.value)" ${ro?'disabled':''}>
            ${Number(entry.age)>=8?'<span class="elder-tag">Loup Ancien</span>':''}
          </div>
          ${!ro?`<button class="btn btn-danger btn-sm" onclick="removeAgePerkEntry(${idx})">Retirer</button>`:''}
        </div>
        ${AGE_PERKS.map(group=>`
          <div class="perk-cat-title">${group.cat}</div>
          <div class="perk-chip-list">
            ${group.items.map(p=>`
              <label class="perk-chip"><input type="checkbox" ${entry.perks.includes(p)?'checked':''} ${ro?'disabled':''} onchange="togglePerk(${idx}, '${p.replace(/'/g,"\\'")}')"> ${p}</label>
            `).join('')}
          </div>
        `).join('')}
        <div class="field" style="margin-top:10px;"><label>Note</label><input type="text" value="${escapeHTML(entry.note)}" oninput="setDraft('agePerks.${idx}.note', this.value)" ${ro?'disabled':''}></div>
      </div>
    `).join('')}
    ${!ro?`<button class="btn btn-ghost btn-sm" onclick="addAgePerkEntry()">+ Ajouter une année</button>`:''}
  `;
}
function wolfTabTimeline(w, ro){
  return `<div class="hint" style="margin-bottom:10px;">${ro?'Frise de vie de ce loup.':'Étapes libres de la vie de ton loup, avec une photo si tu en as une.'}</div>
    ${w.timeline.length===0&&ro?`<p class="hint">Aucune étape.</p>`:''}
    ${w.timeline.map((e,idx)=>`
      <div class="timeline-entry">
        <div>
          <div class="timeline-photo">${e.photo?`<img src="${e.photo}">`:'<span style="opacity:.4;">🖼️</span>'}</div>
          ${!ro?`<label class="btn btn-ghost btn-sm file-btn" style="margin-top:6px; font-size:11px;">Photo<input type="file" accept="image/*" style="display:none" onchange="setTimelinePhoto(${idx}, this)"></label>`:''}
        </div>
        <div class="timeline-entry-body">
          <div class="timeline-entry-top">
            <input type="text" placeholder="Date / période" value="${escapeHTML(e.date)}" oninput="setDraft('timeline.${idx}.date', this.value)" style="max-width:160px;" ${ro?'disabled':''}>
            ${!ro?`<div style="display:flex; gap:4px;">
              <button class="stepper-btn" title="Monter" onclick="moveTimelineEntry(${idx}, -1)">↑</button>
              <button class="stepper-btn" title="Descendre" onclick="moveTimelineEntry(${idx}, 1)">↓</button>
              <button class="stepper-btn" title="Retirer" onclick="removeTimelineEntry(${idx})">✕</button>
            </div>`:''}
          </div>
          <input type="text" placeholder="Titre de l'étape" value="${escapeHTML(e.title)}" oninput="setDraft('timeline.${idx}.title', this.value)" style="margin:8px 0;" ${ro?'disabled':''}>
          <textarea placeholder="Description…" oninput="setDraft('timeline.${idx}.desc', this.value)" ${ro?'disabled':''}>${escapeHTML(e.desc)}</textarea>
        </div>
      </div>
    `).join('')}
    ${!ro?`<button class="btn btn-ghost btn-sm" onclick="addTimelineEntry()">+ Ajouter une étape</button>`:''}
  `;
}
function wolfTabUnions(w, ro){
  const exists = state.wolves.some(x=>x.id===w.id);
  if(!exists){ return `<p class="hint">Enregistre d'abord ce loup pour pouvoir lui créer des unions.</p>`; }
  const unions = state.unions.filter(u=>u.treeId===state.currentTreeId && (u.wolfA===w.id||u.wolfB===w.id));
  return `
    ${unions.length===0?`<p class="hint" style="margin-bottom:12px;">Aucune union enregistrée.</p>`:unions.map(u=>{
      const partnerId = u.wolfA===w.id?u.wolfB:u.wolfA;
      const partner = partnerId?getWolf(partnerId):null;
      return `<div class="union-list-item">
        <div class="u-left">
          <span class="badge ${u.status==='actuelle'?'badge-current':'badge-ex'}">${u.status==='actuelle'?'Actuelle':'Ex'}</span>
          <span>${partner?escapeHTML(partner.name):'Partenaire inconnu'}</span>
        </div>
        <button class="btn btn-ghost btn-sm" onclick="openUnionModal('${u.id}', '${w.id}')">${ro?'Voir':'Gérer'}</button>
      </div>`;
    }).join('')}
    ${!ro?`<button class="btn btn-amber btn-sm" onclick="openUnionModal(null, '${w.id}')">+ Nouvelle union</button>`:''}
  `;
}

function unionModalHTML(){
  const u = ui.modal.draft;
  const ro = ui.modal.readonly;
  const wolfA = getWolf(u.wolfA);
  const wolfBObj = u.wolfB ? getWolf(u.wolfB) : null;
  const treeWolves = state.wolves.filter(x=>x.treeId===state.currentTreeId && x.id!==u.wolfA);
  const litters = u.id ? state.litters.filter(l=>l.unionId===u.id) : [];
  return `<div class="overlay" onclick="if(event.target===this) closeModal()">
    <div class="modal">
      <div class="modal-head"><h3>Union${wolfA?' — '+escapeHTML(wolfA.name):''}${ro?'<span class="ro-badge">Lecture seule</span>':''}</h3><button class="modal-close" onclick="closeModal()">✕</button></div>
      <div class="modal-body">
        <div class="field"><label>Partenaire</label>
          ${ro?`<input type="text" value="${wolfBObj?escapeHTML(wolfBObj.name):'—'}" disabled>`:`
          <select onchange="setDraft('wolfB', this.value)">
            <option value="">— Choisir —</option>
            ${treeWolves.map(x=>`<option value="${x.id}" ${u.wolfB===x.id?'selected':''}>${escapeHTML(x.name)}</option>`).join('')}
          </select>`}
        </div>
        <div class="row2">
          <div class="field"><label>Statut</label>
            ${ro?`<input type="text" value="${u.status==='actuelle'?'Union actuelle':'Ex-partenaire'}" disabled>`:`
            <select onchange="setDraft('status', this.value)">
              <option value="actuelle" ${u.status==='actuelle'?'selected':''}>Union actuelle</option>
              <option value="ex" ${u.status==='ex'?'selected':''}>Ex-partenaire</option>
            </select>`}
          </div>
          <div class="field"><label>Début</label><input type="text" placeholder="Ex : Année 2" value="${escapeHTML(u.startDate)}" oninput="setDraft('startDate', this.value)" ${ro?'disabled':''}></div>
        </div>
        <div class="field"><label>Fin (si séparation ou décès)</label><input type="text" value="${escapeHTML(u.endDate)}" oninput="setDraft('endDate', this.value)" ${ro?'disabled':''}></div>
        <div class="field"><label>Note</label><textarea oninput="setDraft('note', this.value)" ${ro?'disabled':''}>${escapeHTML(u.note)}</textarea></div>

        ${u.id ? `
          <h4 style="margin-top:22px;">Portées</h4>
          ${litters.length===0?`<p class="hint" style="margin-bottom:10px;">Aucune portée enregistrée.</p>`:''}
          ${litters.map(l=>{
            const availablePups = state.wolves.filter(x=>x.treeId===state.currentTreeId && !l.pupIds.includes(x.id) && x.id!==u.wolfA && x.id!==u.wolfB);
            return `<div class="litter-manage">
              <div class="row2">
                <div class="field"><label>Date de la portée</label><input type="text" value="${escapeHTML(l.date)}" oninput="updateLitterField('${l.id}','date',this.value)" ${ro?'disabled':''}></div>
                <div class="field"><label>Note</label><input type="text" value="${escapeHTML(l.note)}" oninput="updateLitterField('${l.id}','note',this.value)" ${ro?'disabled':''}></div>
              </div>
              <div>${l.pupIds.map(pid=>{
                const p = getWolf(pid); if(!p) return '';
                return `<span class="pup-chip">${escapeHTML(p.name)}${!ro?`<button onclick="removePupFromLitter('${l.id}','${pid}')" title="Retirer">✕</button>`:''}</span>`;
              }).join('')}</div>
              ${!ro?`<div class="add-pup-row">
                <input type="text" id="pupname-${l.id}" placeholder="Nom du nouveau louveteau">
                <select id="pupsex-${l.id}"><option value="M">Mâle</option><option value="F">Femelle</option><option value="?">Inconnu</option></select>
                <button class="btn btn-ghost btn-sm" onclick="quickCreatePup('${l.id}')">+ Créer</button>
              </div>
              ${availablePups.length?`<div class="add-pup-row">
                <select id="pupexisting-${l.id}"><option value="">— Lier un loup existant —</option>${availablePups.map(x=>`<option value="${x.id}">${escapeHTML(x.name)}</option>`).join('')}</select>
                <button class="btn btn-ghost btn-sm" onclick="linkExistingPup('${l.id}')">Lier</button>
              </div>`:''}
              <button class="btn btn-danger btn-sm" style="margin-top:10px;" onclick="deleteLitter('${l.id}')">Supprimer cette portée</button>`:''}
            </div>`;
          }).join('')}
          ${!ro?`<button class="btn btn-ghost btn-sm" onclick="addLitter('${u.id}')">+ Ajouter une portée</button>`:''}
        ` : `<p class="hint" style="margin-top:18px;">Enregistre d'abord cette union pour pouvoir y ajouter des portées.</p>`}
      </div>
      <div class="modal-foot">
        <div>${(u.id && !ro)?`<button class="btn btn-danger btn-sm" onclick="deleteUnionModal()">Supprimer l'union</button>`:''}</div>
        <div style="display:flex; gap:8px;">
          <button class="btn btn-ghost" onclick="backToWolfFromUnion()">← Retour au loup</button>
          ${!ro?`<button class="btn btn-amber" onclick="saveUnionModal()">Enregistrer</button>`:''}
        </div>
      </div>
    </div>
  </div>`;
}