/* ---------- IndexedDB layer ---------- */
const DB_NAME='wq-genealogy-db', STORE='data', KEY='state';
function idbOpen(){
  return new Promise((resolve,reject)=>{
    const r = indexedDB.open(DB_NAME,1);
    r.onupgradeneeded=()=>{ r.result.createObjectStore(STORE); };
    r.onsuccess=()=>resolve(r.result);
    r.onerror=()=>reject(r.error);
  });
}
async function idbLoad(){
  try{
    const db = await idbOpen();
    return await new Promise((resolve,reject)=>{
      const tx = db.transaction(STORE,'readonly');
      const rq = tx.objectStore(STORE).get(KEY);
      rq.onsuccess=()=>resolve(rq.result||null);
      rq.onerror=()=>reject(rq.error);
    });
  }catch(e){ console.error('idbLoad failed', e); return null; }
}
async function idbSave(state){
  try{
    const db = await idbOpen();
    return await new Promise((resolve,reject)=>{
      const tx = db.transaction(STORE,'readwrite');
      tx.objectStore(STORE).put(state, KEY);
      tx.oncomplete=()=>resolve(true);
      tx.onerror=()=>reject(tx.error);
    });
  }catch(e){ console.error('idbSave failed', e); return false; }
}

/* ---------- Constants ---------- */
const STATUS_OPTIONS = ['Vivant','Mort','Disperseur','Inconnu'];
const STATUS_COLORS = {'Vivant':'#5C7A5E','Mort':'#9C3B2E','Disperseur':'#B96A2C','Inconnu':'#8A8A80'};
const SKILL_DEFS = [['force','Force'],['endurance','Endurance'],['vitesse','Vitesse'],['vie','Vie']];
const AGE_PERKS = [
  {cat:'Attributs physiques', items:['Force','Vie','Vitesse','Endurance']},
  {cat:'Clout', items:['Territorial Might','Youthful Prowess','Fun Parent','Elder Authority']},
  {cat:'Connaissance', items:['Knowing Nose','Health Perception','Good Memory']}
];

/* ---------- State ---------- */
let state = null;
let ui = { view:'liste', search:'', statusFilter:'all', modal:null };

function uid(){ return 'id-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,9); }
function escapeHTML(str){ return String(str??'').replace(/[&<>"']/g, s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s])); }
function getWolf(id){ return state.wolves.find(w=>w.id===id); }
function getTree(id){ return state.trees.find(t=>t.id===id); }
function currentTree(){ return state.trees.find(t=>t.id===state.currentTreeId) || null; }
async function persist(){ await idbSave(state); }

/* ---------- Boot ---------- */
(async function init(){
  const loaded = await idbLoad();
  state = loaded || { trees:[], wolves:[], unions:[], litters:[], currentTreeId:null };
  state.trees ||= []; state.wolves ||= []; state.unions ||= []; state.litters ||= [];
  render();
})();

/* ---------- Tree CRUD ---------- */
function createTree(){
  const name = (document.getElementById('newTreeName')||{}).value;
  const n = name && name.trim() ? name.trim() : 'Nouvel arbre';
  const t = { id: uid(), name: n, createdAt: Date.now() };
  state.trees.push(t);
  state.currentTreeId = t.id;
  persist(); ui.modal=null; render();
}
function openNewTreeModal(){ ui.modal = {type:'newtree'}; render(); }
function selectTree(id){ state.currentTreeId = id; ui.view='liste'; persist(); render(); }
function renameTree(id){
  const t = getTree(id); if(!t) return;
  const name = prompt('Nouveau nom de cet arbre :', t.name);
  if(name===null) return;
  t.name = name.trim() || t.name;
  persist(); render();
}
function deleteTree(id){
  const t = getTree(id); if(!t) return;
  if(!confirm(`Supprimer l'arbre « ${t.name} » et tous les loups, unions et portées qu'il contient ? Cette action est irréversible.`)) return;
  state.trees = state.trees.filter(x=>x.id!==id);
  state.wolves = state.wolves.filter(x=>x.treeId!==id);
  state.unions = state.unions.filter(x=>x.treeId!==id);
  state.litters = state.litters.filter(x=>x.treeId!==id);
  if(state.currentTreeId===id) state.currentTreeId = state.trees[0]?.id || null;
  persist(); render();
}

/* ---------- Export / Import ---------- */
function exportData(){
  const blob = new Blob([JSON.stringify(state,null,2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'meute-sauvegarde.json';
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
function triggerImport(){ document.getElementById('importFile').click(); }
function handleImportFile(input){
  const file = input.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    try{
      const data = JSON.parse(reader.result);
      if(!data || !Array.isArray(data.trees) || !Array.isArray(data.wolves)) throw new Error('format invalide');
      if(!confirm('Importer ce fichier remplacera toutes les données actuelles. Continuer ?')) return;
      state = { trees:data.trees||[], wolves:data.wolves||[], unions:data.unions||[], litters:data.litters||[], currentTreeId:(data.trees&&data.trees[0])?data.trees[0].id:null };
      await persist(); render();
    }catch(e){ alert("Ce fichier n'a pas pu être importé : "+e.message); }
    input.value='';
  };
  reader.readAsText(file);
}

/* ---------- View toggle / filters ---------- */
function setView(v){ ui.view=v; render(); }
function setSearch(v){ ui.search=v; }
function applySearch(){ render(); }
function setStatusFilter(v){ ui.statusFilter=v; render(); }

/* ---------- Wolf modal ---------- */
function blankWolf(treeId){
  return { id:uid(), treeId, name:'', sex:'?', status:'Vivant', pack:'', notes:'', portrait:null,
    skills:{force:0,endurance:0,vitesse:0,vie:0}, agePerks:[], timeline:[] };
}
function openWolfModal(id){
  const w = id ? JSON.parse(JSON.stringify(getWolf(id))) : blankWolf(state.currentTreeId);
  ui.modal = { type:'wolf', isNew: !id, draft:w, tab:'info' };
  render();
}
function wolfModalTab(tab){ ui.modal.tab = tab; render(); }
function setDraft(path, value){
  const parts = path.split('.');
  let obj = ui.modal.draft;
  for(let i=0;i<parts.length-1;i++) obj = obj[parts[i]];
  obj[parts[parts.length-1]] = value;
}
function adjustSkill(key, delta){
  const s = ui.modal.draft.skills;
  let v = (s[key]||0) + delta;
  v = Math.max(-2, Math.min(2, v));
  s[key] = v;
  render();
}
function setPortraitFile(input){
  const file = input.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = () => { ui.modal.draft.portrait = reader.result; render(); };
  reader.readAsDataURL(file);
}
function addAgePerkEntry(){
  ui.modal.draft.agePerks.push({ id:uid(), age:'', perks:[], note:'' });
  render();
}
function removeAgePerkEntry(idx){
  ui.modal.draft.agePerks.splice(idx,1); render();
}
function togglePerk(idx, perkName){
  const entry = ui.modal.draft.agePerks[idx];
  const i = entry.perks.indexOf(perkName);
  if(i>=0) entry.perks.splice(i,1); else entry.perks.push(perkName);
  render();
}
function addTimelineEntry(){
  ui.modal.draft.timeline.push({ id:uid(), date:'', title:'', desc:'', photo:null });
  render();
}
function removeTimelineEntry(idx){ ui.modal.draft.timeline.splice(idx,1); render(); }
function moveTimelineEntry(idx, dir){
  const arr = ui.modal.draft.timeline;
  const j = idx+dir; if(j<0||j>=arr.length) return;
  [arr[idx],arr[j]] = [arr[j],arr[idx]];
  render();
}
function setTimelinePhoto(idx, input){
  const file = input.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = () => { ui.modal.draft.timeline[idx].photo = reader.result; render(); };
  reader.readAsDataURL(file);
}
function saveWolfModal(){
  const w = ui.modal.draft;
  if(!w.name || !w.name.trim()){ alert('Le nom du loup est requis.'); return; }
  const idx = state.wolves.findIndex(x=>x.id===w.id);
  if(idx>=0) state.wolves[idx]=w; else state.wolves.push(w);
  persist();
  ui.modal.isNew = false;
  render();
}
function deleteWolfFromModal(){
  const w = ui.modal.draft;
  const exists = state.wolves.some(x=>x.id===w.id);
  if(!exists){ closeModal(); return; }
  if(!confirm(`Supprimer ${w.name} ? Ses unions et portées associées seront aussi supprimées (les autres loups liés resteront, mais détachés).`)) return;
  const unionIds = state.unions.filter(u=>u.wolfA===w.id||u.wolfB===w.id).map(u=>u.id);
  state.unions = state.unions.filter(u=>!unionIds.includes(u.id));
  state.litters = state.litters.filter(l=>!unionIds.includes(l.unionId));
  state.litters.forEach(l=>{ l.pupIds = l.pupIds.filter(pid=>pid!==w.id); });
  state.wolves = state.wolves.filter(x=>x.id!==w.id);
  persist(); closeModal();
}
function closeModal(){ ui.modal=null; render(); }

/* ---------- Union modal ---------- */
function openUnionModal(id, presetWolfA){
  if(id){
    ui.modal = { type:'union', draft: JSON.parse(JSON.stringify(state.unions.find(u=>u.id===id))), backTo: presetWolfA||null };
  } else {
    ui.modal = { type:'union', draft:{ id:null, treeId:state.currentTreeId, wolfA:presetWolfA, wolfB:null, status:'actuelle', startDate:'', endDate:'', note:'' }, backTo: presetWolfA };
  }
  render();
}
function saveUnionModal(){
  const u = ui.modal.draft;
  if(!u.wolfB){ alert('Choisis un ou une partenaire.'); return; }
  if(!u.id){
    u.id = uid();
    state.unions.push(u);
  } else {
    const idx = state.unions.findIndex(x=>x.id===u.id);
    if(idx>=0) state.unions[idx]=u;
  }
  persist(); render();
}
function deleteUnionModal(){
  const u = ui.modal.draft;
  if(!u.id){ closeModal(); return; }
  if(!confirm("Supprimer cette union et toutes ses portées ? Les louveteaux resteront mais seront détachés.")) return;
  state.unions = state.unions.filter(x=>x.id!==u.id);
  state.litters = state.litters.filter(l=>l.unionId!==u.id);
  persist();
  const back = ui.modal.backTo;
  if(back) openWolfModal(back); else closeModal();
}
function backToWolfFromUnion(){
  const back = ui.modal.backTo;
  if(back) openWolfModal(back); else closeModal();
}
function addLitter(unionId){
  const l = { id:uid(), treeId: state.currentTreeId, unionId, date:'', note:'', pupIds:[] };
  state.litters.push(l);
  persist(); render();
}
function updateLitterField(litterId, field, value){
  const l = state.litters.find(x=>x.id===litterId); if(!l) return;
  l[field]=value; persist();
}
function deleteLitter(litterId){
  if(!confirm('Supprimer cette portée ? Les louveteaux resteront mais seront détachés.')) return;
  state.litters = state.litters.filter(x=>x.id!==litterId);
  persist(); render();
}
function removePupFromLitter(litterId, pupId){
  const l = state.litters.find(x=>x.id===litterId); if(!l) return;
  l.pupIds = l.pupIds.filter(id=>id!==pupId);
  persist(); render();
}
function quickCreatePup(litterId){
  const nameInput = document.getElementById('pupname-'+litterId);
  const sexSelect = document.getElementById('pupsex-'+litterId);
  const name = nameInput.value.trim();
  if(!name){ nameInput.focus(); return; }
  const w = blankWolf(state.currentTreeId);
  w.name = name; w.sex = sexSelect.value;
  state.wolves.push(w);
  const l = state.litters.find(x=>x.id===litterId);
  l.pupIds.push(w.id);
  persist(); render();
}
function linkExistingPup(litterId){
  const sel = document.getElementById('pupexisting-'+litterId);
  const pid = sel.value; if(!pid) return;
  const l = state.litters.find(x=>x.id===litterId);
  if(!l.pupIds.includes(pid)) l.pupIds.push(pid);
  persist(); render();
}

/* ---------- Rendering ---------- */
function render(){
  document.getElementById('app').innerHTML = appHTML();
}

function appHTML(){
  return `
    <div class="sidebar">
      <div class="brand"><span class="brand-mark">🐺</span><div><h1>Meute</h1><small>Arbres généalogiques WolfQuest</small></div></div>
      <button class="btn btn-amber btn-block" onclick="openNewTreeModal()">+ Nouvel arbre</button>
      <div class="tree-list">
        <div class="tree-list-title">Tes arbres</div>
        ${state.trees.map(t=>`
          <button class="tree-item ${t.id===state.currentTreeId?'active':''}" onclick="selectTree('${t.id}')">
            <span class="paw">🐾</span><span style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHTML(t.name)}</span>
          </button>
        `).join('') || `<div class="hint" style="color:rgba(237,230,214,.5); padding:6px 4px;">Aucun arbre pour l'instant.</div>`}
      </div>
      ${currentTree() ? `
      <div style="display:flex; gap:6px;">
        <button class="btn btn-ghost btn-sm" style="flex:1;" onclick="renameTree('${state.currentTreeId}')">Renommer</button>
        <button class="btn btn-danger btn-sm" style="flex:1;" onclick="deleteTree('${state.currentTreeId}')">Supprimer</button>
      </div>` : ''}
      <div class="sidebar-foot">
        <button class="btn btn-ghost" onclick="exportData()">⭳ Exporter la sauvegarde</button>
        <button class="btn btn-ghost" onclick="triggerImport()">⭱ Importer une sauvegarde</button>
        <input type="file" id="importFile" accept="application/json" style="display:none" onchange="handleImportFile(this)">
      </div>
    </div>
    <div class="main">
      ${mainHTML()}
    </div>
    ${ui.modal ? modalHTML() : ''}
  `;
}

function mainHTML(){
  const t = currentTree();
  if(!t){
    return `<div class="content"><div class="empty-state">
      <div class="paw-big">🐾</div>
      <h3>Crée ton premier arbre</h3>
      <p>Chaque arbre correspond à une partie jouée : ses loups, ses unions et ses portées lui sont propres.</p>
      <button class="btn btn-amber" onclick="openNewTreeModal()">+ Nouvel arbre</button>
    </div></div>`;
  }
  const wolves = state.wolves.filter(w=>w.treeId===t.id);
  return `
    <div class="topbar">
      <div>
        <h2>${escapeHTML(t.name)}</h2>
        <div class="topbar-sub">${wolves.length} loup${wolves.length>1?'s':''}</div>
      </div>
      <div class="topbar-actions">
        <div class="view-toggle">
          <button class="${ui.view==='liste'?'active':''}" onclick="setView('liste')">Liste</button>
          <button class="${ui.view==='arbre'?'active':''}" onclick="setView('arbre')">Arbre</button>
        </div>
        <button class="btn btn-amber" onclick="openWolfModal(null)">+ Ajouter un loup</button>
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
    filtered = filtered.filter(w=>(w.name||'').toLowerCase().includes(q) || (w.pack||'').toLowerCase().includes(q));
  }
  return `
    <div class="filters">
      <input type="text" placeholder="Rechercher un loup ou une meute…" value="${escapeHTML(ui.search)}" oninput="setSearch(this.value)" onkeyup="if(event.key==='Enter')applySearch()" onblur="applySearch()">
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

function wolfCardHTML(wolfId, opts){
  opts = opts||{};
  const w = getWolf(wolfId); if(!w) return '';
  const color = STATUS_COLORS[w.status]||'#8A8A80';
  const photo = w.portrait ? `<img src="${w.portrait}" alt="">` : `<div class="wolf-photo-placeholder">🐾</div>`;
  const sexIcon = w.sex==='M'?'♂':w.sex==='F'?'♀':'?';
  return `<button class="wolf-card ${opts.small?'wolf-card--small':''}" onclick="openWolfModal('${w.id}')">
    <div class="wolf-photo">${photo}</div>
    <div class="wolf-card-name">${escapeHTML(w.name)}<span class="wolf-sex">${sexIcon}</span></div>
    <div class="wolf-card-status"><span class="status-dot" style="background:${color}"></span>${w.status||'—'}</div>
  </button>`;
}
function ghostCardHTML(){
  return `<div class="wolf-card wolf-card--small wolf-card--ghost">
    <div class="wolf-photo"><div class="wolf-photo-placeholder">?</div></div>
    <div class="wolf-card-name">Partenaire inconnu</div>
  </div>`;
}

function treeViewHTML(wolves){
  if(wolves.length===0){
    return `<div class="empty-state"><div class="paw-big">🐺</div><h3>Aucun loup pour l'instant</h3><p>Ajoute ton premier loup pour voir l'arbre prendre forme.</p></div>`;
  }
  const roots = wolves.filter(w=> !state.litters.some(l=>l.treeId===state.currentTreeId && l.pupIds.includes(w.id)) );
  const renderedPrimary = new Set();
  const renderedUnionChildren = new Set();
  let blocks = [];
  roots.forEach(r=>{
    if(renderedPrimary.has(r.id)) return;
    blocks.push(renderUnitHTML(r.id, renderedPrimary, renderedUnionChildren));
  });
  wolves.forEach(w=>{
    if(!renderedPrimary.has(w.id)) blocks.push(renderUnitHTML(w.id, renderedPrimary, renderedUnionChildren));
  });
  return `
    <div class="tree-toolbar">
      <button class="btn btn-ghost btn-sm" onclick="zoomTree(0.15)">＋ Zoom</button>
      <button class="btn btn-ghost btn-sm" onclick="zoomTree(-0.15)">－ Zoom</button>
      <button class="btn btn-ghost btn-sm" onclick="zoomTree('reset')">Réinitialiser</button>
    </div>
    <div class="tree-scroll">
      <div class="tree-canvas" id="treeCanvas" style="transform:scale(${window.__wqZoom||1});">
        ${blocks.join('<div class="forest-divider"></div>')}
      </div>
    </div>
  `;
}
function zoomTree(delta){
  if(delta==='reset') window.__wqZoom = 1;
  else window.__wqZoom = Math.max(0.4, Math.min(2, (window.__wqZoom||1)+delta));
  const el = document.getElementById('treeCanvas');
  if(el) el.style.transform = `scale(${window.__wqZoom})`;
}

function renderUnitHTML(wolfId, renderedPrimary, renderedUnionChildren){
  renderedPrimary.add(wolfId);
  const treeId = state.currentTreeId;
  const unions = state.unions.filter(u=>u.treeId===treeId && (u.wolfA===wolfId||u.wolfB===wolfId));
  unions.sort((a,b)=> (a.status==='actuelle'?0:1) - (b.status==='actuelle'?0:1));
  let branchesHTML = '';
  if(unions.length){
    branchesHTML = unions.map(u=>{
      const partnerId = u.wolfA===wolfId ? u.wolfB : u.wolfA;
      if(partnerId) renderedPrimary.add(partnerId);
      const partnerHTML = (partnerId && getWolf(partnerId)) ? wolfCardHTML(partnerId,{small:true}) : ghostCardHTML();
      let childrenHTML = '';
      if(!renderedUnionChildren.has(u.id)){
        renderedUnionChildren.add(u.id);
        const litters = state.litters.filter(l=>l.unionId===u.id);
        if(litters.length){
          childrenHTML = `<div class="children-row">${litters.map(li=>{
            const pups = li.pupIds.filter(pid=>getWolf(pid)).map(pid=>{
              if(renderedPrimary.has(pid)){
                return `<div class="pup-wrap pup-wrap--ref">${wolfCardHTML(pid,{small:true})}</div>`;
              }
              return `<div class="pup-wrap">${renderUnitHTML(pid, renderedPrimary, renderedUnionChildren)}</div>`;
            }).join('');
            return `<div class="litter-block"><div class="litter-tag">🐾 ${escapeHTML(li.date||'Portée')}</div><div class="litter-pups">${pups}</div></div>`;
          }).join('')}</div>`;
        }
      }
      const icon = u.status==='actuelle' ? '♡' : '⚮';
      return `<div class="union-branch">
        <div class="union-pair"><span class="union-icon">${icon}</span>${partnerHTML}</div>
        ${childrenHTML}
      </div>`;
    }).join('');
  }
  return `<div class="family-unit"><div class="unit-row">
    ${wolfCardHTML(wolfId)}
    ${branchesHTML ? `<div class="branches">${branchesHTML}</div>` : ''}
  </div></div>`;
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
  const tabs = [['info','Infos'],['skills','Compétences'],['perks','Age Perks'],['timeline','Frise de vie'],['unions','Unions']];
  return `<div class="overlay" onclick="if(event.target===this) closeModal()">
    <div class="modal">
      <div class="modal-head"><h3>${ui.modal.isNew?'Nouveau loup':escapeHTML(w.name||'Loup')}</h3><button class="modal-close" onclick="closeModal()">✕</button></div>
      <div class="modal-body">
        <div class="tabs">${tabs.map(([k,l])=>`<button class="tab ${tab===k?'active':''}" onclick="wolfModalTab('${k}')">${l}</button>`).join('')}</div>
        ${tab==='info'?wolfTabInfo(w):''}
        ${tab==='skills'?wolfTabSkills(w):''}
        ${tab==='perks'?wolfTabPerks(w):''}
        ${tab==='timeline'?wolfTabTimeline(w):''}
        ${tab==='unions'?wolfTabUnions(w):''}
      </div>
      <div class="modal-foot">
        <div>${!ui.modal.isNew?`<button class="btn btn-danger btn-sm" onclick="deleteWolfFromModal()">Supprimer ce loup</button>`:''}</div>
        <div style="display:flex; gap:8px;">
          <button class="btn btn-ghost" onclick="closeModal()">Fermer</button>
          <button class="btn btn-amber" onclick="saveWolfModal()">Enregistrer</button>
        </div>
      </div>
    </div>
  </div>`;
}

function wolfTabInfo(w){
  return `
    <div class="portrait-row">
      <div class="portrait-preview">${w.portrait?`<img src="${w.portrait}">`:'<span style="font-size:26px;opacity:.4;">🐾</span>'}</div>
      <div>
        <label class="btn btn-ghost btn-sm file-btn">Choisir une photo<input type="file" accept="image/*" style="display:none" onchange="setPortraitFile(this)"></label>
        <div class="hint">Portrait principal du loup.</div>
      </div>
    </div>
    <div class="field"><label>Nom</label><input type="text" value="${escapeHTML(w.name)}" oninput="setDraft('name', this.value)"></div>
    <div class="row2">
      <div class="field"><label>Sexe</label>
        <select onchange="setDraft('sex', this.value)">
          <option value="M" ${w.sex==='M'?'selected':''}>Mâle</option>
          <option value="F" ${w.sex==='F'?'selected':''}>Femelle</option>
          <option value="?" ${w.sex==='?'?'selected':''}>Inconnu</option>
        </select>
      </div>
      <div class="field"><label>Statut</label>
        <select onchange="setDraft('status', this.value)">
          ${STATUS_OPTIONS.map(s=>`<option value="${s}" ${w.status===s?'selected':''}>${s}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="field"><label>Meute d'origine / territoire</label><input type="text" value="${escapeHTML(w.pack)}" oninput="setDraft('pack', this.value)"></div>
    <div class="field"><label>Notes</label><textarea oninput="setDraft('notes', this.value)">${escapeHTML(w.notes)}</textarea></div>
  `;
}

function wolfTabSkills(w){
  return `<div class="hint" style="margin-bottom:10px;">Les points vont de -2 à +2, comme la répartition des compétences dans WolfQuest AE.</div>
    ${SKILL_DEFS.map(([key,label])=>`
      <div class="skill-row">
        <span class="skill-name">${label}</span>
        <div class="skill-stepper">
          <button class="stepper-btn" onclick="adjustSkill('${key}', -1)">−</button>
          <span class="skill-val">${w.skills[key]>0?'+':''}${w.skills[key]}</span>
          <button class="stepper-btn" onclick="adjustSkill('${key}', 1)">+</button>
        </div>
      </div>
    `).join('')}
  `;
}

function wolfTabPerks(w){
  return `<div class="hint" style="margin-bottom:10px;">Ajoute une entrée par année où ton loup a choisi des Age Perks (jusqu'à 3 par an dans le jeu).</div>
    ${w.agePerks.map((entry,idx)=>`
      <div class="perk-entry">
        <div class="perk-entry-head">
          <div style="display:flex; align-items:center; gap:10px;">
            <input type="number" min="1" style="width:70px;" placeholder="Âge" value="${escapeHTML(entry.age)}" oninput="setDraft('agePerks.${idx}.age', this.value)">
            ${Number(entry.age)>=8?'<span class="elder-tag">Loup Ancien</span>':''}
          </div>
          <button class="btn btn-danger btn-sm" onclick="removeAgePerkEntry(${idx})">Retirer</button>
        </div>
        ${AGE_PERKS.map(group=>`
          <div class="perk-cat-title">${group.cat}</div>
          <div class="perk-chip-list">
            ${group.items.map(p=>`
              <label class="perk-chip"><input type="checkbox" ${entry.perks.includes(p)?'checked':''} onchange="togglePerk(${idx}, '${p.replace(/'/g,"\\'")}')"> ${p}</label>
            `).join('')}
          </div>
        `).join('')}
        <div class="field" style="margin-top:10px;"><label>Note</label><input type="text" value="${escapeHTML(entry.note)}" oninput="setDraft('agePerks.${idx}.note', this.value)"></div>
      </div>
    `).join('')}
    <button class="btn btn-ghost btn-sm" onclick="addAgePerkEntry()">+ Ajouter une année</button>
  `;
}

function wolfTabTimeline(w){
  return `<div class="hint" style="margin-bottom:10px;">Étapes libres de la vie de ton loup, avec une photo si tu en as une.</div>
    ${w.timeline.map((e,idx)=>`
      <div class="timeline-entry">
        <div>
          <div class="timeline-photo">${e.photo?`<img src="${e.photo}">`:'<span style="opacity:.4;">🖼️</span>'}</div>
          <label class="btn btn-ghost btn-sm file-btn" style="margin-top:6px; font-size:11px;">Photo<input type="file" accept="image/*" style="display:none" onchange="setTimelinePhoto(${idx}, this)"></label>
        </div>
        <div class="timeline-entry-body">
          <div class="timeline-entry-top">
            <input type="text" placeholder="Date / période" value="${escapeHTML(e.date)}" oninput="setDraft('timeline.${idx}.date', this.value)" style="max-width:160px;">
            <div style="display:flex; gap:4px;">
              <button class="stepper-btn" title="Monter" onclick="moveTimelineEntry(${idx}, -1)">↑</button>
              <button class="stepper-btn" title="Descendre" onclick="moveTimelineEntry(${idx}, 1)">↓</button>
              <button class="stepper-btn" title="Retirer" onclick="removeTimelineEntry(${idx})">✕</button>
            </div>
          </div>
          <input type="text" placeholder="Titre de l'étape" value="${escapeHTML(e.title)}" oninput="setDraft('timeline.${idx}.title', this.value)" style="margin:8px 0;">
          <textarea placeholder="Description…" oninput="setDraft('timeline.${idx}.desc', this.value)">${escapeHTML(e.desc)}</textarea>
        </div>
      </div>
    `).join('')}
    <button class="btn btn-ghost btn-sm" onclick="addTimelineEntry()">+ Ajouter une étape</button>
  `;
}

function wolfTabUnions(w){
  const exists = state.wolves.some(x=>x.id===w.id);
  if(!exists){
    return `<p class="hint">Enregistre d'abord ce loup pour pouvoir lui créer des unions.</p>`;
  }
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
        <button class="btn btn-ghost btn-sm" onclick="openUnionModal('${u.id}', '${w.id}')">Gérer</button>
      </div>`;
    }).join('')}
    <button class="btn btn-amber btn-sm" onclick="openUnionModal(null, '${w.id}')">+ Nouvelle union</button>
  `;
}

function unionModalHTML(){
  const u = ui.modal.draft;
  const wolfA = getWolf(u.wolfA);
  const treeWolves = state.wolves.filter(x=>x.treeId===state.currentTreeId && x.id!==u.wolfA);
  const litters = u.id ? state.litters.filter(l=>l.unionId===u.id) : [];
  return `<div class="overlay" onclick="if(event.target===this) closeModal()">
    <div class="modal">
      <div class="modal-head"><h3>Union${wolfA?' — '+escapeHTML(wolfA.name):''}</h3><button class="modal-close" onclick="closeModal()">✕</button></div>
      <div class="modal-body">
        <div class="field"><label>Partenaire</label>
          <select onchange="setDraft('wolfB', this.value)">
            <option value="">— Choisir —</option>
            ${treeWolves.map(x=>`<option value="${x.id}" ${u.wolfB===x.id?'selected':''}>${escapeHTML(x.name)}</option>`).join('')}
          </select>
        </div>
        <div class="row2">
          <div class="field"><label>Statut</label>
            <select onchange="setDraft('status', this.value)">
              <option value="actuelle" ${u.status==='actuelle'?'selected':''}>Union actuelle</option>
              <option value="ex" ${u.status==='ex'?'selected':''}>Ex-partenaire</option>
            </select>
          </div>
          <div class="field"><label>Début</label><input type="text" placeholder="Ex : Année 2" value="${escapeHTML(u.startDate)}" oninput="setDraft('startDate', this.value)"></div>
        </div>
        <div class="field"><label>Fin (si séparation ou décès)</label><input type="text" value="${escapeHTML(u.endDate)}" oninput="setDraft('endDate', this.value)"></div>
        <div class="field"><label>Note</label><textarea oninput="setDraft('note', this.value)">${escapeHTML(u.note)}</textarea></div>

        ${u.id ? `
          <h4 style="margin-top:22px;">Portées</h4>
          ${litters.length===0?`<p class="hint" style="margin-bottom:10px;">Aucune portée enregistrée.</p>`:''}
          ${litters.map(l=>{
            const availablePups = state.wolves.filter(x=>x.treeId===state.currentTreeId && !l.pupIds.includes(x.id) && x.id!==u.wolfA && x.id!==u.wolfB);
            return `<div class="litter-manage">
              <div class="row2">
                <div class="field"><label>Date de la portée</label><input type="text" value="${escapeHTML(l.date)}" oninput="updateLitterField('${l.id}','date',this.value)"></div>
                <div class="field"><label>Note</label><input type="text" value="${escapeHTML(l.note)}" oninput="updateLitterField('${l.id}','note',this.value)"></div>
              </div>
              <div>${l.pupIds.map(pid=>{
                const p = getWolf(pid); if(!p) return '';
                return `<span class="pup-chip">${escapeHTML(p.name)}<button onclick="removePupFromLitter('${l.id}','${pid}')" title="Retirer">✕</button></span>`;
              }).join('')}</div>
              <div class="add-pup-row">
                <input type="text" id="pupname-${l.id}" placeholder="Nom du nouveau louveteau">
                <select id="pupsex-${l.id}"><option value="M">Mâle</option><option value="F">Femelle</option><option value="?">Inconnu</option></select>
                <button class="btn btn-ghost btn-sm" onclick="quickCreatePup('${l.id}')">+ Créer</button>
              </div>
              ${availablePups.length?`<div class="add-pup-row">
                <select id="pupexisting-${l.id}"><option value="">— Lier un loup existant —</option>${availablePups.map(x=>`<option value="${x.id}">${escapeHTML(x.name)}</option>`).join('')}</select>
                <button class="btn btn-ghost btn-sm" onclick="linkExistingPup('${l.id}')">Lier</button>
              </div>`:''}
              <button class="btn btn-danger btn-sm" style="margin-top:10px;" onclick="deleteLitter('${l.id}')">Supprimer cette portée</button>
            </div>`;
          }).join('')}
          <button class="btn btn-ghost btn-sm" onclick="addLitter('${u.id}')">+ Ajouter une portée</button>
        ` : `<p class="hint" style="margin-top:18px;">Enregistre d'abord cette union pour pouvoir y ajouter des portées.</p>`}
      </div>
      <div class="modal-foot">
        <div>${u.id?`<button class="btn btn-danger btn-sm" onclick="deleteUnionModal()">Supprimer l'union</button>`:''}</div>
        <div style="display:flex; gap:8px;">
          <button class="btn btn-ghost" onclick="backToWolfFromUnion()">← Retour au loup</button>
          <button class="btn btn-amber" onclick="saveUnionModal()">Enregistrer</button>
        </div>
      </div>
    </div>
  </div>`;
}