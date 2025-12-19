import { el } from '../renderer.js';

export function renderStore(root, ctx){
  root.appendChild(el('h1',{},['Shop']));
  root.appendChild(el('div',{},['IP: '+ctx.meta.ip]));
  const list = el('div',{class:'card-grid'});
  ctx.data.upgrades.forEach(u=>{
    const item = el('div',{class:'panel card'});
    item.appendChild(el('div',{},[u.upgrade||u.id]));
    item.appendChild(el('div',{class:'muted card-stat'},['Cost: '+u.ip_cost]));
    const b = el('button',{class:'btn'},['Buy']);
    b.addEventListener('click',()=>{ if(ctx.buyUpgrade) ctx.buyUpgrade(u.id); else { if(ctx.setMessage) ctx.setMessage('No buy handler'); } });
    item.appendChild(b);
    list.appendChild(item);
  });
  root.appendChild(list);

  // Legendary section (shown only when unlocked)
  if(ctx.meta && ctx.meta.legendaryUnlocked && ctx.data.legendary && ctx.data.legendary.length){
    root.appendChild(el('h2',{},['Legendary Items']));
    const legList = el('div',{class:'card-grid'});
    ctx.data.legendary.forEach(it=>{
      const elItem = el('div',{class:'panel card'});
      elItem.appendChild(el('div',{},[it.name||it.id]));
      elItem.appendChild(el('div',{class:'muted card-stat'},['Cost: '+it.ip_cost]));
      const buy = el('button',{class:'btn'},['Buy Legendary']);
      buy.addEventListener('click',()=>{ if(ctx.buyLegendaryItem) ctx.buyLegendaryItem(it.id); else { if(ctx.setMessage) ctx.setMessage('No buy handler'); } });
      elItem.appendChild(buy);
      legList.appendChild(elItem);
    });
    root.appendChild(legList);
  }

  // Owned preview
  const owned = el('div',{},[]);
  owned.appendChild(el('h3',{},['Owned']));
  owned.appendChild(el('div',{},['Cards: '+(ctx.meta.ownedCards||[]).join(', ')]));
  owned.appendChild(el('div',{},['Summons: '+(ctx.meta.ownedSummons||[]).join(', ')]));
  root.appendChild(owned);

  const cont = el('button',{class:'btn'},['Continue']);
  cont.addEventListener('click',()=> ctx.onLeaveStore());
  root.appendChild(cont);
}
