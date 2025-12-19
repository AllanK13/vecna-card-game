export function buildDeck(cardDefs, initialIds, rng){
  const cards = initialIds.map(id => ({...cardDefs.find(c=>c.id===id)}));
  // New behavior: no draw/discard piles. All character cards start in hand for the encounter.
  const hand = rng ? rng.shuffle(cards) : cards.slice();
  return {
    hand,
    // drawing is removed; callers should not attempt to draw.
    playFromHand(cardIndex){
      return hand.splice(cardIndex,1)[0];
    },
    // discard/exhaust are intentionally no-ops to remove persistent piles during an encounter
    discardCard(){ /* no-op */ },
    exhaustCard(){ /* no-op */ },
    removeAll(){ hand.length = 0; }
  };
}
