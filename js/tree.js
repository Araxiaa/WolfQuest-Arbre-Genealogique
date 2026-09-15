/* ---------- Auto-layout (only fills in missing positions, never moves existing ones) ---------- */
function ensurePositions(treeId){
  const wolves = state.wolves.filter(w=>w.treeId===treeId);
  if(wolves.every(w=>w.pos)) return false;
  let maxX = 40;
  wolves.forEach(w=>{ if(w.pos) maxX = Math.max(maxX, w.pos.x); });
  let nextX = wolves.some(w=>w.pos) ? maxX + SPACING_X : 40;
  const visiting = new Set();
  function layout(wolfId, depth){
    const w = getWolf(wolfId);
    if(!w) return nextX;
    if(w.pos) return w.pos.x;
    if(visiting.has(wolfId)){ const x=nextX; nextX+=SPACING_X; return x; }
    visiting.add(wolfId);
    const unions = state.unions.filter(u=>u.treeId===treeId && (u.wolfA===wolfId||u.wolfB===wolfId));
    for(const u of unions){
      const partnerId = u.wolfA===wolfId ? u.wolfB : u.wolfA;
      const partner = partnerId ? getWolf(partnerId) : null;
      if(partner && partner.pos){
        const side = (u.wolfA===wolfId) ? -1 : 1;
        w.pos = { x: Math.max(40, partner.pos.x + side*(CARD_W+40)), y: partner.pos.y };
        return w.pos.x;
      }
    }
    let childIds = [];
    unions.forEach(u=>{ state.litters.filter(l=>l.unionId===u.id).forEach(l=> childIds.push(...l.pupIds)); });
    childIds = [...new Set(childIds)].filter(cid=>cid!==wolfId);
    let x;
    if(childIds.length){
      const xs = childIds.map(cid=>layout(cid, depth+1));
      x = (Math.min(...xs)+Math.max(...xs))/2;
    } else { x = nextX; nextX += SPACING_X; }
    w.pos = { x: Math.max(40,x), y: depth*SPACING_Y + 40 };
    return w.pos.x;
  }
  const roots = wolves.filter(w=> !state.litters.some(l=>l.treeId===treeId && l.pupIds.includes(w.id)));
  roots.forEach(r=>{ if(!r.pos) layout(r.id, 0); });
  wolves.forEach(w=>{ if(!w.pos){ w.pos = {x:nextX, y:40}; nextX += SPACING_X; } });
  return true;
}
function resetTreeLayout(){
  if(!confirm("Réorganiser automatiquement replacera toutes les cartes de cet arbre selon la généalogie. Tes positions actuelles seront perdues. Continuer ?")) return;
  state.wolves.filter(w=>w.treeId===state.currentTreeId).forEach(w=> w.pos=null);
  ensurePositions(state.currentTreeId);
  persist(); render();
}

/* ---------- Tree view (free canvas) ---------- */
function treeViewHTML(wolves){
  if(wolves.length===0){
    return `<div class="empty-state"><div class="paw-big">🐺</div><h3>Aucun loup pour l'instant</h3><p>Ajoute ton premier loup pour voir l'arbre prendre forme.</p></div>`;
  }
  const changed = ensurePositions(state.currentTreeId);
  if(changed) persist();
  const treeWolves = state.wolves.filter(w=>w.treeId===state.currentTreeId && w.pos);
  let maxX=700, maxY=520;
  treeWolves.forEach(w=>{ maxX=Math.max(maxX, w.pos.x+CARD_W+140); maxY=Math.max(maxY, w.pos.y+CARD_H+140); });
  const cardsHTML = treeWolves.map(w=>freeCardHTML(w.id)).join('');
  const editing = ui.mode==='edit';
  return `
    <div class="tree-toolbar">
      <input list="wolfNamesList" id="treeSearchInput" class="tree-search" placeholder="🔍 Rechercher un loup…" onkeyup="if(event.key==='Enter')searchAndFocus()">
      <datalist id="wolfNamesList">${treeWolves.map(w=>`<option value="${escapeHTML(w.name)}">`).join('')}</datalist>
      <button class="btn btn-ghost btn-sm" onclick="searchAndFocus()">Aller</button>
      <span style="flex:1"></span>
      <button class="btn btn-ghost btn-sm" onclick="zoomTree(0.15)">＋ Zoom</button>
      <button class="btn btn-ghost btn-sm" onclick="zoomTree(-0.15)">－ Zoom</button>
      <button class="btn btn-ghost btn-sm" onclick="zoomTree('reset')">100%</button>
      ${editing?`<button class="btn btn-ghost btn-sm" onclick="resetTreeLayout()">↻ Réorganiser</button>`:''}
    </div>
    <div class="tree-viewport">
      <div class="tree-scroll" id="treeScroll" onmousedown="onCanvasMouseDown(event)" onscroll="updateMinimap()">
        <div class="tree-canvas" id="treeCanvas" style="width:${maxX}px; height:${maxY}px; transform:scale(${window.__wqZoom||1});">
          <svg class="tree-lines" id="treeLines" width="${maxX}" height="${maxY}"></svg>
          ${cardsHTML}
        </div>
      </div>
      <div class="minimap" id="minimap" onclick="minimapJump(event)">
        <svg id="minimapSvg"></svg>
        <div class="minimap-viewport" id="minimapViewport"></div>
      </div>
    </div>
  `;
}
function zoomTree(delta){
  if(delta==='reset') window.__wqZoom = 1;
  else window.__wqZoom = Math.max(0.3, Math.min(2, (window.__wqZoom||1)+delta));
  const el = document.getElementById('treeCanvas');
  if(el) el.style.transform = `scale(${window.__wqZoom})`;
  updateMinimap();
}
function glowLine(x1,y1,x2,y2,cls){
  const a=x1.toFixed(1), b=y1.toFixed(1), c=x2.toFixed(1), d=y2.toFixed(1);
  return `<line class="link-glow ${cls}" x1="${a}" y1="${b}" x2="${c}" y2="${d}"/><line class="link ${cls}" x1="${a}" y1="${b}" x2="${c}" y2="${d}"/>`;
}
function drawConnectors(){
  const svg = document.getElementById('treeLines');
  if(!svg) return;
  const treeId = state.currentTreeId;
  let out = '';
  state.unions.filter(u=>u.treeId===treeId).forEach(u=>{
    const A = getWolf(u.wolfA); if(!A||!A.pos) return;
    const B = u.wolfB ? getWolf(u.wolfB) : null;
    const aCenter = {x:A.pos.x+CARD_W/2, y:A.pos.y+CARD_H/2};
    const aBottom = {x:A.pos.x+CARD_W/2, y:A.pos.y+CARD_H};
    let dropOrigin = aBottom;
    if(B && B.pos){
      const bCenter = {x:B.pos.x+CARD_W/2, y:B.pos.y+CARD_H/2};
      const bBottom = {x:B.pos.x+CARD_W/2, y:B.pos.y+CARD_H};
      dropOrigin = {x:(aBottom.x+bBottom.x)/2, y:Math.max(aBottom.y,bBottom.y)};
      out += glowLine(aCenter.x,aCenter.y,bCenter.x,bCenter.y, `link-couple ${u.status==='ex'?'link-ex':''}`);
    }
    const childPts = [];
    state.litters.filter(l=>l.unionId===u.id).forEach(li=>{
      li.pupIds.forEach(pid=>{
        const p = getWolf(pid); if(!p||!p.pos) return;
        childPts.push({x:p.pos.x+CARD_W/2, y:p.pos.y});
      });
    });
    if(childPts.length){
      const stubY = dropOrigin.y + 28;
      out += glowLine(dropOrigin.x, dropOrigin.y, dropOrigin.x, stubY, 'link-lineage');
      const xs = childPts.map(c=>c.x);
      const minX = Math.min(...xs, dropOrigin.x), maxX = Math.max(...xs, dropOrigin.x);
      if(maxX-minX>1) out += glowLine(minX, stubY, maxX, stubY, 'link-lineage');
      out += `<circle class="link-junction" cx="${dropOrigin.x.toFixed(1)}" cy="${stubY.toFixed(1)}" r="3.5"/>`;
      childPts.forEach(c=>{
        out += glowLine(c.x, stubY, c.x, c.y, 'link-lineage');
      });
    }
  });
  svg.innerHTML = out;
}

/* ---------- Drag a card (edit mode only) ---------- */
function onCardMouseDown(e, wolfId){
  if(e.button!==0) return;
  e.stopPropagation(); e.preventDefault();
  const w = getWolf(wolfId);
  dragState = { wolfId, startMouseX:e.clientX, startMouseY:e.clientY, startX:w.pos.x, startY:w.pos.y, moved:false };
  document.addEventListener('mousemove', onCardMouseMove);
  document.addEventListener('mouseup', onCardMouseUp);
}
function onCardMouseMove(e){
  if(!dragState) return;
  const zoom = window.__wqZoom||1;
  const dx = (e.clientX-dragState.startMouseX)/zoom;
  const dy = (e.clientY-dragState.startMouseY)/zoom;
  if(Math.abs(dx)>4 || Math.abs(dy)>4) dragState.moved = true;
  const w = getWolf(dragState.wolfId);
  w.pos.x = Math.max(10, dragState.startX + dx);
  w.pos.y = Math.max(10, dragState.startY + dy);
  const el = document.getElementById('card-'+dragState.wolfId);
  if(el){ el.style.left = w.pos.x+'px'; el.style.top = w.pos.y+'px'; }
  drawConnectors();
  updateMinimap();
}
function onCardMouseUp(){
  document.removeEventListener('mousemove', onCardMouseMove);
  document.removeEventListener('mouseup', onCardMouseUp);
  if(dragState && dragState.moved){
    persist();
    window.__wqSuppressClick = true;
    setTimeout(()=>{ window.__wqSuppressClick=false; }, 80);
  }
  dragState = null;
}
function cardClicked(wolfId){
  if(window.__wqSuppressClick) return;
  openWolfModal(wolfId);
}

/* ---------- Pan the canvas ---------- */
function onCanvasMouseDown(e){
  if(e.target.closest('.wolf-card-free')) return;
  if(e.button!==0) return;
  const scroller = document.getElementById('treeScroll');
  panState = { startX:e.clientX, startY:e.clientY, scrollLeft:scroller.scrollLeft, scrollTop:scroller.scrollTop };
  document.addEventListener('mousemove', onCanvasMouseMove);
  document.addEventListener('mouseup', onCanvasMouseUp);
  e.preventDefault();
}
function onCanvasMouseMove(e){
  if(!panState) return;
  const scroller = document.getElementById('treeScroll'); if(!scroller) return;
  scroller.scrollLeft = panState.scrollLeft - (e.clientX-panState.startX);
  scroller.scrollTop = panState.scrollTop - (e.clientY-panState.startY);
}
function onCanvasMouseUp(){
  panState = null;
  document.removeEventListener('mousemove', onCanvasMouseMove);
  document.removeEventListener('mouseup', onCanvasMouseUp);
}

/* ---------- Search ---------- */
function searchAndFocus(){
  const input = document.getElementById('treeSearchInput'); if(!input) return;
  const val = input.value.trim().toLowerCase(); if(!val) return;
  const treeWolves = state.wolves.filter(w=>w.treeId===state.currentTreeId && w.pos);
  const w = treeWolves.find(x=>x.name.toLowerCase()===val) || treeWolves.find(x=>x.name.toLowerCase().includes(val));
  if(!w) return;
  const scroller = document.getElementById('treeScroll'); if(!scroller) return;
  const zoom = window.__wqZoom||1;
  scroller.scrollTo({ left:(w.pos.x+CARD_W/2)*zoom-scroller.clientWidth/2, top:(w.pos.y+CARD_H/2)*zoom-scroller.clientHeight/2, behavior:'smooth' });
  const el = document.getElementById('card-'+w.id);
  if(el){ el.classList.add('pulse'); setTimeout(()=>el.classList.remove('pulse'), 1400); }
}

/* ---------- Minimap ---------- */
function updateMinimap(){
  const canvas = document.getElementById('treeCanvas');
  const scroller = document.getElementById('treeScroll');
  const svg = document.getElementById('minimapSvg');
  const vp = document.getElementById('minimapViewport');
  if(!canvas||!scroller||!svg||!vp) return;
  const cw = parseFloat(canvas.style.width)||1, ch = parseFloat(canvas.style.height)||1;
  const scale = Math.min(MINIMAP_W/cw, MINIMAP_H/ch);
  const treeWolves = state.wolves.filter(w=>w.treeId===state.currentTreeId && w.pos);
  svg.setAttribute('viewBox', `0 0 ${MINIMAP_W} ${MINIMAP_H}`);
  svg.innerHTML = treeWolves.map(w=>`<circle cx="${((w.pos.x+CARD_W/2)*scale).toFixed(1)}" cy="${((w.pos.y+CARD_H/2)*scale).toFixed(1)}" r="2.4" fill="var(--amber)"/>`).join('');
  const zoom = window.__wqZoom||1;
  const vw = Math.min(scroller.clientWidth/zoom*scale, MINIMAP_W);
  const vh = Math.min(scroller.clientHeight/zoom*scale, MINIMAP_H);
  vp.style.left = (scroller.scrollLeft/zoom*scale)+'px';
  vp.style.top = (scroller.scrollTop/zoom*scale)+'px';
  vp.style.width = vw+'px'; vp.style.height = vh+'px';
}
function minimapJump(e){
  const canvas = document.getElementById('treeCanvas');
  const scroller = document.getElementById('treeScroll');
  if(!canvas||!scroller) return;
  const rect = e.currentTarget.getBoundingClientRect();
  const cw = parseFloat(canvas.style.width)||1, ch = parseFloat(canvas.style.height)||1;
  const scale = Math.min(MINIMAP_W/cw, MINIMAP_H/ch);
  const zoom = window.__wqZoom||1;
  const clickX = (e.clientX-rect.left)/scale, clickY = (e.clientY-rect.top)/scale;
  scroller.scrollTo({ left:clickX*zoom-scroller.clientWidth/2, top:clickY*zoom-scroller.clientHeight/2, behavior:'smooth' });
}

window.addEventListener('resize', ()=>{ if(ui.screen==='tree' && ui.view==='arbre' && currentTree()) updateMinimap(); });
if(document.fonts && document.fonts.ready){ document.fonts.ready.then(()=>{ if(ui.screen==='tree' && ui.view==='arbre' && currentTree()){ drawConnectors(); updateMinimap(); } }); }