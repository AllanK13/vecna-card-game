import { el, cardTile } from '../renderer.js';

export function renderStart(root, ctx){
  // wrapper to scope start-screen styles
  const container = el('div',{class:'start-screen'},[]);
  // show game title and centered title logo image
  const titleText = (ctx && ctx.meta && ctx.meta.gameName) ? ctx.meta.gameName : 'Battle for the Sword Coast';
  const titleEl = el('h1',{class:'game-title'},[titleText]);
  container.appendChild(titleEl);
  const logo = el('img',{src:'assets/title_logo.png', alt:titleText, class:'title-logo'});
  logo.addEventListener('error', ()=>{ logo.src='assets/title_logo.jpg'; });
  logo.addEventListener('error', ()=>{ logo.style.display='none'; });
  container.appendChild(logo);

  // Upgrades button shown centered below the title/logo (hidden until player earns IP)
  if(ctx.meta && (ctx.meta.totalIpEarned||0) > 0){
    const upgradesBtn = el('button',{class:'btn upgrades-btn', style:'display:block;margin:8px auto 16px auto'},[
      el('span',{class:'btn-icon-left'},['🏘️']),
      el('span',{class:'btn-label'},[' Visit Daggerford'])
    ]);
    upgradesBtn.addEventListener('click', ()=>{ if(ctx.onShowUpgrades) ctx.onShowUpgrades(); });
    container.appendChild(upgradesBtn);
  }

  // Add a fixed-position Stats button that only appears on the start/menu screen
  const statsBtn = el('button',{class:'btn stats-btn floating icon', style:'position:fixed;right:18px;bottom:36px;z-index:10030', title:'Stats'},['📊']);
  statsBtn.addEventListener('click', ()=>{ if(ctx.onShowStats) ctx.onShowStats(); });
  container.appendChild(statsBtn);

  // Debug UI (disabled by default). Enable by setting `ctx.meta.debugEnabled = true`.
  if(ctx.meta && ctx.meta.debugEnabled){
    const debugBtn = el('button',{class:'btn debug-btn floating icon', style:'position:fixed;left:18px;bottom:18px;z-index:10030', title:'Debug'},['🐞']);
    let debugOpen = false;
    const debugPanel = el('div',{class:'panel debug-panel', style:'position:fixed;left:18px;bottom:64px;z-index:10030;display:none;padding:8px;'},[]);
    const grantBtn = el('button',{class:'btn'},['Grant 10000 IP']);
    grantBtn.addEventListener('click',()=>{ if(ctx.onDebugGrant) ctx.onDebugGrant(); else if(ctx.setMessage) ctx.setMessage('No debug handler'); });
    const unlockBtn = el('button',{class:'btn'},['Unlock All Characters & Summons']);
    unlockBtn.style.display = 'block';
    unlockBtn.style.marginTop = '8px';
    unlockBtn.addEventListener('click',()=>{ if(ctx.onDebugUnlock) ctx.onDebugUnlock(); else if(ctx.setMessage) ctx.setMessage('No debug handler'); });
    debugPanel.appendChild(grantBtn);
    debugPanel.appendChild(unlockBtn);
    const unlockTownBtn = el('button',{class:'btn'},['Unlock Town (grant access to Daggerford)']);
    unlockTownBtn.style.display = 'block';
    unlockTownBtn.style.marginTop = '8px';
    unlockTownBtn.addEventListener('click',()=>{ if(ctx.onDebugUnlockTown) ctx.onDebugUnlockTown(); else if(ctx.setMessage) ctx.setMessage('No debug handler'); });
    debugPanel.appendChild(unlockTownBtn);
    debugBtn.addEventListener('click',()=>{ debugOpen = !debugOpen; debugPanel.style.display = debugOpen ? 'block' : 'none'; });
    container.appendChild(debugBtn);
    container.appendChild(debugPanel);
  }

  const info = el('div',{class:'hud'},[]);
  const ipAmount = (ctx && ctx.meta && typeof ctx.meta.ip !== 'undefined') ? ctx.meta.ip : 0;
  const ipDisplay = el('div',{class:'ip-display'},[]);
  ipDisplay.appendChild(el('div',{class:'ip-label'},['Inspiration Points: ']));
  ipDisplay.appendChild(el('div',{class:'ip-badge'},[String(ipAmount)]));
  info.appendChild(ipDisplay);
  const slots = (ctx.meta && ctx.meta.partySlots) ? ctx.meta.partySlots : 3;
  const slotDisplay = el('div',{class:'slot-badges'},[]);
  const label = el('div',{},['Party Slots: ']);
  const remainingBadge = el('div',{class:'badge remaining-badge'},[String(slots)]);
  const selLabel = el('div',{style:'margin:0 8px'},['Selected: ']);
  const selectedBadge = el('div',{class:'badge selected-badge'},['0']);
  slotDisplay.appendChild(label);
  slotDisplay.appendChild(remainingBadge);
  slotDisplay.appendChild(selLabel);
  slotDisplay.appendChild(selectedBadge);
  info.appendChild(slotDisplay);
  container.appendChild(info);

  const cardBox = el('div',{class:'card-grid panel'});
  container.appendChild(cardBox);
  const selected = new Set();
  function updateSlotDisplay(){
    const sel = selected.size;
    const remaining = Math.max(0, slots - sel);
    remainingBadge.textContent = String(remaining);
    selectedBadge.textContent = String(sel);
  }
  // render selectable cards: starters and any recruited/owned characters
  const ownedIds = (ctx.meta && Array.isArray(ctx.meta.ownedCards)) ? ctx.meta.ownedCards : [];
  (ctx.data.cards||[]).filter(c => c && (c.starter || ownedIds.includes(c.id))).forEach(c=>{
    const tile = cardTile(c, { hideCost: true, slotFirst: true });
    tile.style.cursor='pointer';
    tile.addEventListener('click',()=>{
      if(selected.has(c.id)){
        selected.delete(c.id);
        tile.classList.remove('selected');
        updateSlotDisplay();
        return;
      }
      // prevent selecting more than available slots
      if(selected.size >= slots){
        if(ctx.setMessage) ctx.setMessage('Cannot select more than '+slots+' cards');
        return;
      }
      selected.add(c.id);
      tile.classList.add('selected');
      updateSlotDisplay();
    });
    cardBox.appendChild(tile);
  });

  const startBtn = el('button',{class:'btn start-run-btn'},['Venture Forth']);
  startBtn.addEventListener('click',()=>{
    const seed = undefined;
    const deckIds = Array.from(selected);
    ctx.onStartRun({seed, deckIds});
  });
  container.appendChild(startBtn);

  

  root.appendChild(container);
}
