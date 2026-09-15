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
const STATUS_COLORS = {'Vivant':'#7FD99A','Mort':'#E2735A','Disperseur':'#C9A6E8','Inconnu':'#8A8FB0'};
const SKILL_DEFS = [['force','Force'],['endurance','Endurance'],['vitesse','Vitesse'],['vie','Vie']];
const AGE_PERKS = [
  {cat:'Attributs physiques', items:['Force','Vie','Vitesse','Endurance']},
  {cat:'Clout', items:['Territorial Might','Youthful Prowess','Fun Parent','Elder Authority']},
  {cat:'Connaissance', items:['Knowing Nose','Health Perception','Good Memory']}
];
const CARD_W=150, CARD_H=172, SPACING_X=200, SPACING_Y=210, MINIMAP_W=160, MINIMAP_H=110;

/* ---------- State ---------- */
let state = null;
let ui = { screen:'dashboard', mode:'view', view:'arbre', search:'', statusFilter:'all', modal:null };
let dragState = null, panState = null;

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

/* ---------- Screens & mode ---------- */
function openTree(id, mode){ state.currentTreeId=id; ui.screen='tree'; ui.mode=mode; ui.view='arbre'; persist(); render(); }
function goToDashboard(){ ui.screen='dashboard'; render(); }
function toggleMode(){ ui.mode = ui.mode==='edit' ? 'view' : 'edit'; render(); }

/* ---------- Tree CRUD ---------- */
function createTree(){
  const name = (document.getElementById('newTreeName')||{}).value;
  const n = name && name.trim() ? name.trim() : 'Nouvel arbre';
  const t = { id: uid(), name: n, createdAt: Date.now() };
  state.trees.push(t);
  persist(); ui.modal=null;
  openTree(t.id, 'edit');
}
function openNewTreeModal(){ ui.modal = {type:'newtree'}; render(); }
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
  if(state.currentTreeId===id){ state.currentTreeId=null; ui.screen='dashboard'; }
  persist(); render();
}
function duplicateTree(id){
  const t = getTree(id); if(!t) return;
  const idMap = {}, unionIdMap = {};
  const newTreeId = uid();
  const newTree = { id:newTreeId, name:t.name+' (copie)', createdAt:Date.now() };
  const newWolves = state.wolves.filter(w=>w.treeId===id).map(w=>{
    const nid = uid(); idMap[w.id]=nid;
    return { ...JSON.parse(JSON.stringify(w)), id:nid, treeId:newTreeId, pos:null };
  });
  const newUnions = state.unions.filter(u=>u.treeId===id).map(u=>{
    const nid = uid(); unionIdMap[u.id]=nid;
    return { ...u, id:nid, treeId:newTreeId, wolfA:idMap[u.wolfA]||u.wolfA, wolfB:u.wolfB?(idMap[u.wolfB]||u.wolfB):null };
  });
  const newLitters = state.litters.filter(l=>l.treeId===id).map(l=>({
    ...l, id:uid(), treeId:newTreeId, unionId:unionIdMap[l.unionId], pupIds:l.pupIds.map(pid=>idMap[pid]||pid)
  }));
  state.trees.push(newTree);
  state.wolves.push(...newWolves);
  state.unions.push(...newUnions);
  state.litters.push(...newLitters);
  persist(); render();
}

/* ---------- Export / Import ---------- */
function exportData(){
  const blob = new Blob([JSON.stringify(state,null,2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'meute-sauvegarde-complete.json';
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
function exportTree(id){
  const t = getTree(id); if(!t) return;
  const data = {
    trees:[t],
    wolves: state.wolves.filter(w=>w.treeId===id),
    unions: state.unions.filter(u=>u.treeId===id),
    litters: state.litters.filter(l=>l.treeId===id)
  };
  const blob = new Blob([JSON.stringify(data,null,2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `arbre-${t.name.replace(/[^a-z0-9]+/gi,'-').toLowerCase()}.json`;
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
      if(!data || !Array.isArray(data.trees) || !Array.isArray(data.wolves)) throw new Error('format de fichier invalide');
      const doMerge = confirm("Clique sur OK pour fusionner ce fichier avec tes données actuelles (rien n'est perdu), ou sur Annuler pour TOUT remplacer par ce fichier.");
      if(doMerge){
        const idMap = {};
        const existingIds = new Set([...state.trees,...state.wolves,...state.unions,...state.litters].map(x=>x.id));
        function mapId(id){
          if(id==null) return id;
          if(idMap[id]!==undefined) return idMap[id];
          const nid = existingIds.has(id) ? uid() : id;
          idMap[id]=nid; existingIds.add(nid);
          return nid;
        }
        (data.trees||[]).forEach(t=> state.trees.push({...t, id:mapId(t.id)}));
        (data.wolves||[]).forEach(w=> state.wolves.push({...w, id:mapId(w.id), treeId:mapId(w.treeId)}));
        (data.unions||[]).forEach(u=> state.unions.push({...u, id:mapId(u.id), treeId:mapId(u.treeId), wolfA:mapId(u.wolfA), wolfB:u.wolfB?mapId(u.wolfB):null}));
        (data.litters||[]).forEach(l=> state.litters.push({...l, id:mapId(l.id), treeId:mapId(l.treeId), unionId:mapId(l.unionId), pupIds:(l.pupIds||[]).map(pid=>mapId(pid))}));
      } else {
        if(!confirm('Tout remplacer supprimera définitivement tes données actuelles. Continuer ?')) return;
        state = { trees:data.trees||[], wolves:data.wolves||[], unions:data.unions||[], litters:data.litters||[], currentTreeId:null };
      }
      await persist(); ui.screen='dashboard'; render();
    }catch(e){ alert("Ce fichier n'a pas pu être importé : "+e.message); }
    input.value='';
  };
  reader.readAsText(file);
}

/* ---------- View toggle / filters / theme ---------- */
function setView(v){ ui.view=v; render(); }
function setSearch(v){ ui.search=v; }
function applySearch(){ render(); }
function setStatusFilter(v){ ui.statusFilter=v; render(); }
function toggleTheme(){
  const cur = document.documentElement.getAttribute('data-theme');
  document.documentElement.setAttribute('data-theme', cur==='light' ? 'dark' : 'light');
  localStorage.setItem('wq-theme', document.documentElement.getAttribute('data-theme'));
}
(function initTheme(){
  const saved = localStorage.getItem('wq-theme');
  if(saved) document.documentElement.setAttribute('data-theme', saved);
})();