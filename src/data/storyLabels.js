// Tables de noms pour les emojis des anciennes histoires (nomination au regard)
const PROP_LABELS = {
  '🌙': 'la lune', '⭐': 'une étoile', '🛏️': 'le lit',
  '🌅': 'le lever du soleil', '☀️': 'le soleil',
  '🥞': 'une crêpe', '🥛': 'du lait', '🍓': 'une fraise',
  '🪥': 'la brosse à dents', '💧': "une goutte d'eau", '🫧': 'des bulles',
  '🌸': 'une fleur', '🌼': 'une fleur', '🦋': 'un papillon',
  '🧥': 'un manteau', '🧣': 'une écharpe', '👢': 'une botte',
  '🌳': 'un arbre', '🏠': 'une maison', '☁️': 'un nuage',
  '🛝': 'le toboggan', '⚽': 'un ballon',
  '🌿': "de l'herbe", '💕': 'des cœurs',
  '❓': "un point d'interrogation", '🧸': 'un doudou',
  '🥿': 'un chausson', '🍪': 'un biscuit', '🌷': 'une tulipe',
  '🧺': 'un panier',
  '🥚': 'un œuf', '🐛': 'un ver de terre', '☔': 'un parapluie', '🌈': 'un arc-en-ciel',
};
export function propLabel(emoji) {
  return PROP_LABELS[emoji] || 'regarde !';
}
export function characterLabel(c) {
  if (c.includes('🐷')) return 'Lulu le cochon';
  if (c.includes('🐻')) return 'Nounours';
  if (c.includes('🐱')) return 'Mimi la chatte';
  if (c.includes('🦆')) return 'les petits canards';
  if (c.includes('🐰')) return 'le lapin';
  if (c.includes('🐥')) return 'Pilou le poussin';
  if (c.includes('🐔')) return 'Maman Poule';
  if (c.includes('🐘')) return "Bibi l'éléphant";
  return 'le personnage';
}
