/* ---------- Wolf modal ---------- */
function blankWolf(treeId){
  return { id:uid(), treeId, name:'', coat:'', sex:'?', status:'Vivant', pack:'', notes:'', portrait:null, pos:null,
    skills:{force:0,endurance:0,vitesse:0,vie:0}, agePerks:[], timeline:[] };
}
function openWolfModal(id){
  const w = id ? JSON.parse(JSON.stringify(getWolf(id))) : blankWolf(state.currentTreeId);
  ui.modal = { type:'wolf', isNew: !id, draft:w, tab:'info', readonly: ui.mode!=='edit' };
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
function addAgePerkEntry(){ ui.modal.draft.agePerks.push({ id:uid(), age:'', perks:[], note:'' }); render(); }
function removeAgePerkEntry(idx){ ui.modal.draft.agePerks.splice(idx,1); render(); }
function togglePerk(idx, perkName){
  const entry = ui.modal.draft.agePerks[idx];
  const i = entry.perks.indexOf(perkName);
  if(i>=0) entry.perks.splice(i,1); else entry.perks.push(perkName);
  render();
}
function addTimelineEntry(){ ui.modal.draft.timeline.push({ id:uid(), date:'', title:'', desc:'', photo:null }); render(); }
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