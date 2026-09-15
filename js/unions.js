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
  if(!u.id){ u.id = uid(); state.unions.push(u); }
  else { const idx = state.unions.findIndex(x=>x.id===u.id); if(idx>=0) state.unions[idx]=u; }
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