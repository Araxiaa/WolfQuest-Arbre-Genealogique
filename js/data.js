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
let ui = { view:'liste', search:'', statusFilter:'all', modal:null };
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