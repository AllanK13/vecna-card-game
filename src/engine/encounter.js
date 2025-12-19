export function startEncounter(enemyDef, deck, rng, opts={}){
  const enemy = { ...enemyDef };
  const state = {
    enemy,
    rng,
    deck,
    turn:0,
    apPerTurn: opts.apPerTurn || 3,
    ap: opts.apPerTurn || 3,
    playfield: [null,null,null], // 0,1 front; 2 back
    summons: [],
    exhaustedThisEncounter: [],
    summonUsed: {},
    summonCooldowns: {}
  };
  // All character cards should already be provided in `deck.hand` by the deck builder.
  // Drawing has been removed — no action needed here.
  return state;
}

function _selectSingleTargetIndex(state, rng){
  // prefer a hero marked by support 'Help'
  const helpedIndex = state.playfield.findIndex(h => h && h.helped);
  if(helpedIndex !== -1) return helpedIndex;
  // prefer front-line heroes (0,1)
  const front = [0,1].filter(i=>state.playfield[i]).map(i=>i);
  if(front.length>0) return rng ? front[rng.int(front.length)] : front[Math.floor(Math.random()*front.length)];
  // otherwise target the back slot (2) if present
  if(state.playfield[2]) return 2;
  return -1;
}

function parseDamageFromAbility(card){
  const m = (card.ability||"").match(/(\d+)/);
  return m ? Number(m[1]) : 0;
}

export function placeHero(state, card){
  // find first empty slot or return false
  const idx = state.playfield.findIndex(s=>s===null);
  if(idx === -1) return { success:false };
  const hero = { cardId: card.id, hp: card.hp, base: card, tempHp: 0 };
  state.playfield[idx] = hero;
  return { success:true, slot: idx };
}

export function placeHeroAt(state, slotIndex, card){
  if(typeof slotIndex !== 'number' || slotIndex < 0 || slotIndex >= state.playfield.length) return { success:false, reason: 'invalid slot' };
  if(state.playfield[slotIndex] !== null) return { success:false, reason: 'slot occupied' };
  const hero = { cardId: card.id, hp: card.hp, base: card, tempHp: 0 };
  state.playfield[slotIndex] = hero;
  return { success:true, slot: slotIndex };
}

export function playHeroAttack(state, slotIndex){
  if(state.ap <= 0) return { success:false, reason:'no AP' };
  const hero = state.playfield[slotIndex];
  if(!hero) return { success:false, reason:'no hero' };
  const baseDmg = parseDamageFromAbility(hero.base);
  const mult = state.nextAttackMultiplier || 1;
  const dmg = Math.floor(baseDmg * mult);
  state.enemy.hp -= dmg;
  // reset multiplier if it was applied
  if(mult !== 1) state.nextAttackMultiplier = 1;
  state.ap -= 1;
  return { success:true, dmg, enemyHp: state.enemy.hp };
}

export function playHeroAction(state, slotIndex, targetIndex=null){
  // generic action: attack or heal based on card ability text
  if(state.ap <= 0) return { success:false, reason:'no AP' };
  const hero = state.playfield[slotIndex];
  if(!hero) return { success:false, reason:'no hero' };
  const ability = (hero.base && hero.base.ability) ? hero.base.ability.toLowerCase() : '';
  const amount = parseDamageFromAbility(hero.base);
  // prefer explicit actionType on the card, fallback to ability-text parsing
  const actionType = (hero.base && hero.base.actionType) ? hero.base.actionType : ( /heal|cure|restore|regen|heals?/i.test(ability) ? 'heal' : 'attack' );
  // support-type action (e.g., Piter's Help) - mark this hero as the redirect target for the next enemy single-target attack
  if(actionType === 'support'){
    // Special: Shalendra's ability refreshes Volo's summon (make it available again)
    if (hero.base && (hero.base.id === 'shalendra' || /shalendra/i.test(hero.base.name))) {
      if (!state.summonUsed) state.summonUsed = {};
      state.summonUsed['volo'] = false;
      // Also reset cooldown if present
      if (!state.summonCooldowns) state.summonCooldowns = {};
      state.summonCooldowns['volo'] = 0;
      state.ap -= 1;
      return { success:true, type:'support', slot: slotIndex, refreshed: 'volo' };
    }
    // Default support: mark as helped
    hero.helped = true;
    state.ap -= 1;
    return { success:true, type:'support', slot: slotIndex };
  }
  const isHeal = (actionType === 'heal');
  if(isHeal){
    // if a targetIndex is provided, heal the target; otherwise heal self
    const targetSlot = (typeof targetIndex === 'number' && state.playfield[targetIndex]) ? state.playfield[targetIndex] : hero;
    const before = targetSlot.hp;
    targetSlot.hp = Math.min(targetSlot.base.hp, targetSlot.hp + (amount || 1));
    state.ap -= 1;
    const healed = targetSlot.hp - before;
    const slot = (targetSlot === hero) ? slotIndex : state.playfield.findIndex(h=>h===targetSlot);
    return { success:true, type:'heal', healed, slot, hp: targetSlot.hp };
  }
  // fallback to attack behavior
  const baseDmg = amount || 0;
  const mult = state.nextAttackMultiplier || 1;
  const dmg = Math.floor(baseDmg * mult);
  state.enemy.hp -= dmg;
  if(mult !== 1) state.nextAttackMultiplier = 1;
  state.ap -= 1;
  return { success:true, type:'attack', dmg, enemyHp: state.enemy.hp };
}

export function defendHero(state, slotIndex){
  if(state.ap <= 0) return { success:false, reason:'no AP' };
  const hero = state.playfield[slotIndex];
  if(!hero) return { success:false, reason:'no hero' };
  // mark hero as defending for the upcoming enemy action
  hero.defending = true;
  state.ap -= 1;
  return { success:true };
}

export function replaceHero(state, slotIndex, newCard){
  if(state.ap <= 0) return { success:false, reason:'no AP' };
  const old = state.playfield[slotIndex];
  if(old){
    // Return the replaced character card back into the player's hand so it can be reused
    // during the remainder of the encounter (killed heroes remain removed).
    try{
      if(state.deck && Array.isArray(state.deck.hand)){
        // clone the base card but preserve current HP so returned card keeps damage taken
        const returned = Object.assign({}, old.base, { hp: old.hp });
        state.deck.hand.push(returned);
      }
    }catch(e){ /* ignore */ }
  }
  state.playfield[slotIndex] = { cardId: newCard.id, hp: newCard.hp, base: newCard };
  state.ap -= 1;
  return { success:true };
}

export function endPlayerTurn(state){
  // end of player turn: enemy will act next. drawing is performed after enemy act
  // so the player receives a card at the start of their next turn.
}

export function enemyAct(state){
  state.turn++;
  // check stunned
  if(state.enemy.stunnedTurns && state.enemy.stunnedTurns>0){
    state.enemy.stunnedTurns--;
    // skip action
    state.ap = state.apPerTurn;
    // decrement summon cooldowns
    Object.keys(state.summonCooldowns).forEach(k=>{
      if(state.summonCooldowns[k] > 0) state.summonCooldowns[k]--;
    });
    return { did:'enemyStunned', events:[{type:'stunned', msg:'Enemy stunned and skipped its turn'}] };
  }
  // simple AI: choose single-target vs AOE randomly
  const rng = state.rng;
  const isAOE = rng ? (rng.int(2)===0) : (Math.random() < 0.3);
  const dmg = state.enemy.attack || 1;
  const events = [];
  // Special behavior for Snurre: three single-target attacks with fixed dmg
  if(state.enemy && (state.enemy.id === 'snurre' || (state.enemy.name && state.enemy.name.toLowerCase().includes('snurre')))){
    const atkIndex = rng ? rng.int(3) : Math.floor(Math.random()*3);
    const atkDmg = (atkIndex === 0) ? 5 : (atkIndex === 1) ? 6 : 7;
    const attackName = (atkIndex === 0) ? 'Rock Throw' : (atkIndex === 1) ? 'Greatsword' : 'Legendary Attack';
    // prefer helped hero (support 'Help') if present
    const idx = _selectSingleTargetIndex(state, rng);
    if(idx !== -1){
      let h = state.playfield[idx];
      if(h){
        let remaining = h.defending ? 0 : atkDmg;
        let tempTaken = 0;
        if(h.tempHp && h.tempHp>0){ const take = Math.min(h.tempHp, remaining); h.tempHp -= take; tempTaken = take; remaining -= take; }
        let hpTaken = 0;
        if(remaining>0) { h.hp -= remaining; hpTaken = remaining; }
        const died = h.hp <= 0;
        const heroName = h.base && h.base.name ? h.base.name : null;
        if(died){ state.exhaustedThisEncounter.push(h.base); state.playfield[idx]=null }
        events.push({ type:'hit', slot:idx, dmg:atkDmg, tempTaken, hpTaken, remainingHp: died?0:h.hp, died, heroName, attack: atkIndex+1, attackName });
      }
    }
    // after performing Snurre attack(s), perform end-of-enemy-turn housekeeping
    state.ap = state.apPerTurn;
    Object.keys(state.summonCooldowns).forEach(k=>{ if(state.summonCooldowns[k] > 0) state.summonCooldowns[k]--; });
    state.playfield.forEach(h=>{ if(h && h.defending) h.defending = false; });
    state.playfield.forEach(h=>{ if(h && h.helped) h.helped = false; });
    // drawing removed — cards remain static in `deck.hand` for duration of encounter
    return {did:'enemyAct', events};
  }
  // Special behavior for Twig Blight: choose one of three single-target attacks each turn
  if(state.enemy && (state.enemy.id === 'twig_blight' || (state.enemy.name && state.enemy.name.toLowerCase().includes('twig')))){
    const atkIndex = rng ? rng.int(3) : Math.floor(Math.random()*3);
    const atkDmg = (atkIndex === 2) ? 2 : 1; // attacks 0 & 1 -> 1 dmg, attack 2 -> 2 dmg
    const attackName = (atkIndex === 2) ? 'Lash' : 'Claws';
    // prefer helped hero (support 'Help') if present
    const idx = _selectSingleTargetIndex(state, rng);
    if(idx !== -1){
      let h = state.playfield[idx];
      if(h){
        let remaining = h.defending ? 0 : atkDmg;
        let tempTaken = 0;
        if(h.tempHp && h.tempHp>0){ const take = Math.min(h.tempHp, remaining); h.tempHp -= take; tempTaken = take; remaining -= take; }
        let hpTaken = 0;
        if(remaining>0) { h.hp -= remaining; hpTaken = remaining; }
        const died = h.hp <= 0;
        const heroName = h.base && h.base.name ? h.base.name : null;
        if(died){ state.exhaustedThisEncounter.push(h.base); state.playfield[idx]=null }
        events.push({ type:'hit', slot:idx, dmg:atkDmg, tempTaken, hpTaken, remainingHp: died?0:h.hp, died, heroName, attack: atkIndex+1, attackName });
      }
    }
    // after performing twig blight attack(s), perform end-of-enemy-turn housekeeping (same as below)
    // after enemy turn, reset AP for player next round
    state.ap = state.apPerTurn;
    // decrement summon cooldowns
    Object.keys(state.summonCooldowns).forEach(k=>{
      if(state.summonCooldowns[k] > 0) state.summonCooldowns[k]--;
    });
    // clear defending flags -- defending only lasts for the enemy's action
    state.playfield.forEach(h=>{ if(h && h.defending) h.defending = false; });
    // clear helped flags (support 'Help' applies to the next enemy single-target attack only)
    state.playfield.forEach(h=>{ if(h && h.helped) h.helped = false; });
    // drawing removed — cards remain static in `deck.hand` for duration of encounter
    return {did:'enemyAct', events};
  }
  // If the enemy defines an `attacks` array, pick one at random and use its
  // type/dmg/name to drive the action. This allows more varied enemy behaviors
  // without hardcoding in JS.
  // Note: Szass Tam (id: 'szass_tam') is defined in `data/enemies.json` and
  // uses this data-driven `attacks` array (Paralyzing Touch, Cone of Cold,
  // Disintegrate). The generic `attacks` handling below will pick an attack
  // and emit `attackName`/`attack` in the resulting events for UI messaging.
  if(state.enemy && Array.isArray(state.enemy.attacks) && state.enemy.attacks.length>0){
    const picks = state.enemy.attacks;
    const atkIndex = rng ? rng.int(picks.length) : Math.floor(Math.random()*picks.length);
    const atk = picks[atkIndex] || {};
    const attackName = atk.name || ('Attack '+(atkIndex+1));
    const type = (atk.type || 'single').toLowerCase();
    const baseDmg = (typeof atk.dmg === 'number') ? atk.dmg : (state.enemy.attack || 1);
    // handle AOE attacks
    if(type === 'aoe'){
      const baseAoE = baseDmg;
      for(let i=0;i<state.playfield.length;i++){
        const h = state.playfield[i];
        if(h){
          let remaining = baseAoE;
          if(h.defending) remaining = Math.ceil(remaining/2);
          let tempTaken = 0;
          if(h.tempHp && h.tempHp>0){ const take = Math.min(h.tempHp, remaining); h.tempHp -= take; tempTaken = take; remaining -= take; }
          let hpTaken = 0;
          if(remaining>0){ h.hp -= remaining; hpTaken = remaining; }
          const died = h.hp <= 0;
          const heroName = h.base && h.base.name ? h.base.name : null;
          if(died){ state.exhaustedThisEncounter.push(h.base); state.playfield[i] = null; }
          events.push({ type:'hit', slot:i, dmg: baseAoE, tempTaken, hpTaken, remainingHp: died?0:h.hp, died, heroName, attack: atkIndex+1, attackName });
        }
      }
    } else {
      // single-target attack
      // prefer helped hero (support 'Help') if present
      const helpedIndex = state.playfield.findIndex(h => h && h.helped);
      const idx = _selectSingleTargetIndex(state, rng);
      if(idx !== -1){
        let h = state.playfield[idx];
        if(h){
          // single-target: defended heroes take no damage
          let remaining = h.defending ? 0 : baseDmg;
          let tempTaken = 0;
          if(h.tempHp && h.tempHp>0){ const take = Math.min(h.tempHp, remaining); h.tempHp -= take; tempTaken = take; remaining -= take; }
          let hpTaken = 0;
          if(remaining>0) { h.hp -= remaining; hpTaken = remaining; }
          const died = h.hp <= 0;
          const heroName = h.base && h.base.name ? h.base.name : null;
          if(died){ state.exhaustedThisEncounter.push(h.base); state.playfield[idx]=null }
          events.push({ type:'hit', slot:idx, dmg:baseDmg, tempTaken, hpTaken, remainingHp: died?0:h.hp, died, heroName, attack: atkIndex+1, attackName });
        }
      }
    }
    // after performing the attack(s), perform end-of-enemy-turn housekeeping
    state.ap = state.apPerTurn;
    Object.keys(state.summonCooldowns).forEach(k=>{ if(state.summonCooldowns[k] > 0) state.summonCooldowns[k]--; });
    state.playfield.forEach(h=>{ if(h && h.defending) h.defending = false; });
    state.playfield.forEach(h=>{ if(h && h.helped) h.helped = false; });
    // drawing removed — cards remain static in `deck.hand` for duration of encounter
    return {did:'enemyAct', events};
  }
  // Special behavior for Wiltherp: two single-target attacks (2 dmg) and one AOE (1 dmg)
  if(state.enemy && (state.enemy.id === 'wiltherp' || (state.enemy.name && state.enemy.name.toLowerCase().includes('wiltherp')))){
    const atkIndex = rng ? rng.int(3) : Math.floor(Math.random()*3);
    // atkIndex 0 -> Poison Spray (single-target, 2 dmg)
    // atkIndex 1 -> Shillelagh (single-target, 2 dmg)
    // atkIndex 2 -> Thunderwave (AOE, 1 dmg)
    if(atkIndex === 2){
      const attackName = 'Thunderwave';
      const baseAoE = 1;
      for(let i=0;i<state.playfield.length;i++){
        const h = state.playfield[i];
        if(h){
          let remaining = baseAoE;
          if(h.defending) remaining = Math.ceil(remaining/2);
          let tempTaken = 0;
          if(h.tempHp && h.tempHp>0){ const take = Math.min(h.tempHp, remaining); h.tempHp -= take; tempTaken = take; remaining -= take; }
          let hpTaken = 0;
          if(remaining>0){ h.hp -= remaining; hpTaken = remaining; }
          const died = h.hp <= 0;
          const heroName = h.base && h.base.name ? h.base.name : null;
          if(died){ state.exhaustedThisEncounter.push(h.base); state.playfield[i] = null; }
          events.push({ type:'hit', slot:i, dmg: baseAoE, tempTaken, hpTaken, remainingHp: died?0:h.hp, died, heroName, attack: atkIndex+1, attackName });
        }
      }
    } else {
      const atkDmg = 2;
      const attackName = (atkIndex === 0) ? 'Poison Spray' : 'Shillelagh';
      // prefer helped hero
      const helpedIndex = state.playfield.findIndex(h => h && h.helped);
      const idx = _selectSingleTargetIndex(state, rng);
      if(idx !== -1){
        let h = state.playfield[idx];
        if(h){
          let remaining = h.defending ? 0 : atkDmg;
          let tempTaken = 0;
          if(h.tempHp && h.tempHp>0){ const take = Math.min(h.tempHp, remaining); h.tempHp -= take; tempTaken = take; remaining -= take; }
          let hpTaken = 0;
          if(remaining>0) { h.hp -= remaining; hpTaken = remaining; }
          const died = h.hp <= 0;
          const heroName = h.base && h.base.name ? h.base.name : null;
          if(died){ state.exhaustedThisEncounter.push(h.base); state.playfield[idx]=null }
          events.push({ type:'hit', slot:idx, dmg:atkDmg, tempTaken, hpTaken, remainingHp: died?0:h.hp, died, heroName, attack: atkIndex+1, attackName });
        }
      }
    }
    // after performing Wiltherp attack(s), perform end-of-enemy-turn housekeeping
    state.ap = state.apPerTurn;
    Object.keys(state.summonCooldowns).forEach(k=>{ if(state.summonCooldowns[k] > 0) state.summonCooldowns[k]--; });
    state.playfield.forEach(h=>{ if(h && h.defending) h.defending = false; });
    state.playfield.forEach(h=>{ if(h && h.helped) h.helped = false; });
    // drawing removed — cards remain static in `deck.hand` for duration of encounter
    return {did:'enemyAct', events};
  }
  if(isAOE){
    // hit all heroes
    for(let i=0;i<state.playfield.length;i++){
      const h = state.playfield[i];
      if(h){
        // base AOE damage is half of enemy dmg; defending heroes take half of that
        let remaining = Math.ceil(dmg/2);
        if(h.defending) remaining = Math.ceil(remaining/2);
        let tempTaken = 0;
        if(h.tempHp && h.tempHp>0){
          const takeFromTemp = Math.min(h.tempHp, remaining);
          h.tempHp -= takeFromTemp;
          tempTaken = takeFromTemp;
          remaining -= takeFromTemp;
        }
        let hpTaken = 0;
        if(remaining>0){ h.hp -= remaining; hpTaken = remaining; }
        const died = h.hp <= 0;
        // preserve hero name for messaging
        const heroName = h.base && h.base.name ? h.base.name : null;
        if(died){
          state.exhaustedThisEncounter.push(h.base);
          state.playfield[i] = null;
        }
        events.push({ type:'hit', slot:i, dmg:dmg, tempTaken, hpTaken, remainingHp: died?0:h.hp, died, heroName });
      }
    }
  } else {
    // single target: first check for any hero that was marked by a support 'Help' action
    const helpedIndex = state.playfield.findIndex(h => h && h.helped);
    if(helpedIndex !== -1){
      // target the helped hero
      const idx = helpedIndex;
      let h = state.playfield[idx];
      if(h){
        // single-target: defended heroes take no damage
        let remaining = h.defending ? 0 : dmg;
        let tempTaken = 0;
        if(h.tempHp && h.tempHp>0){ const take = Math.min(h.tempHp, remaining); h.tempHp -= take; tempTaken = take; remaining -= take; }
        let hpTaken = 0;
        if(remaining>0) { h.hp -= remaining; hpTaken = remaining; }
        const died = h.hp <= 0;
        const heroName = h.base && h.base.name ? h.base.name : null;
        if(died){ state.exhaustedThisEncounter.push(h.base); state.playfield[idx]=null }
        events.push({ type:'hit', slot:idx, dmg:dmg, tempTaken, hpTaken, remainingHp: died?0:h.hp, died, heroName });
      }
    } else {
      const idx = _selectSingleTargetIndex(state, rng);
      if(idx !== -1){
        let h = state.playfield[idx];
        if(h){
          // single-target: defended heroes take no damage
          let remaining = h.defending ? 0 : dmg;
          let tempTaken = 0;
          if(h.tempHp && h.tempHp>0){ const take = Math.min(h.tempHp, remaining); h.tempHp -= take; tempTaken = take; remaining -= take; }
          let hpTaken = 0;
          if(remaining>0) { h.hp -= remaining; hpTaken = remaining; }
          const died = h.hp <= 0;
          const heroName = h.base && h.base.name ? h.base.name : null;
          if(died){ state.exhaustedThisEncounter.push(h.base); state.playfield[idx]=null }
          events.push({ type:'hit', slot:idx, dmg:dmg, tempTaken, hpTaken, remainingHp: died?0:h.hp, died, heroName });
        }
      }
  }
  // after enemy turn, reset AP for player next round
  state.ap = state.apPerTurn;
  // decrement summon cooldowns
  Object.keys(state.summonCooldowns).forEach(k=>{
    if(state.summonCooldowns[k] > 0) state.summonCooldowns[k]--;
  });
  // clear defending flags -- defending only lasts for the enemy's action
  state.playfield.forEach(h=>{ if(h && h.defending) h.defending = false; });
  // clear helped flags (support 'Help' applies to the next enemy single-target attack only)
  state.playfield.forEach(h=>{ if(h && h.helped) h.helped = false; });
  // drawing removed — cards remain static in `deck.hand` for duration of encounter
  return {did:'enemyAct', events};
}
}

export function useSummon(state, summonDef, targetIndex=null){
  if(!summonDef || !summonDef.id) return { success:false, reason:'invalid' };
  const id = summonDef.id;
  // check once-per-encounter restriction
  if(summonDef.restriction && summonDef.restriction.toLowerCase().includes('once')){
    if(state.summonUsed[id]) return { success:false, reason:'used' };
  }
  // check cooldown
  const cd = state.summonCooldowns[id] || 0;
  if(cd > 0) return { success:false, reason:'cooldown' };
  // Concrete effects by known summon ids
  if(id === 'garon'){
    // heal entire party 1 HP
    state.playfield.forEach(h=>{ if(h) h.hp = Math.min(h.base.hp, h.hp + 1); });
  } else if(id === 'volo'){
    // double next attack
    state.nextAttackMultiplier = 2;
  } else if(id === 'blackrazor'){
    // give 30 temp HP to a target (if provided) or lowest-HP hero
    const heroes = state.playfield;
    if(!heroes.some(h=>h)) return { success:false, reason:'no_target' };
    let target = null;
    if(targetIndex !== null && heroes[targetIndex]) target = heroes[targetIndex];
    else target = heroes.filter(h=>h).reduce((a,b)=> (a.hp < b.hp ? a : b));
    if(!target) return { success:false, reason:'no_target' };
    target.tempHp = (target.tempHp||0) + 30;
  } else if(id === 'whelm'){
    // stun enemy for 1 turn
    state.enemy.stunnedTurns = Math.max(1, state.enemy.stunnedTurns||0) + 1;
  } else if(id === 'wave'){
    // reduce enemy HP by 50% of max
    const max = state.enemy.maxHp || state.enemy.hp;
    const reduce = Math.floor((max * 0.5));
    state.enemy.hp = Math.max(0, state.enemy.hp - reduce);
  } else {
    // fallback: try to parse numeric heal
    const m = (summonDef.ability||'').match(/(\d+)/);
    const v = m ? Number(m[1]) : null;
    if(v){ state.playfield.forEach(h=>{ if(h) h.hp = Math.min(h.base.hp, h.hp + v); }); }
  }
  // mark used or set cooldown; use large number for once-per-encounter/run
  if(summonDef.restriction && summonDef.restriction.toLowerCase().includes('once per encounter')){
    state.summonUsed[id] = true;
    state.summonCooldowns[id] = 9999;
  } else if(summonDef.cooldown){
    state.summonCooldowns[id] = summonDef.cooldown;
  } else if(summonDef.restriction && summonDef.restriction.toLowerCase().includes('once per run')){
    state.summonUsed[id] = true;
    state.summonCooldowns[id] = 9999;
  }
  return { success:true };
}

export function isFinished(state){
  if(state.enemy.hp<=0) return { winner: 'player' };
  // lose if no heroes on field and no cards in hand/draw?
  const anyHeroes = state.playfield.some(s=>s!==null);
  if(!anyHeroes){
    // only consider the run lost if at least one enemy turn has occurred
    // (i.e., after the first round). This prevents immediate loss on initial empty field.
    if(state.turn && state.turn > 0) return { winner: 'enemy' };
    return { winner: null };
  }
  return { winner: null };
}

