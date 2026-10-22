// Palette de couleurs (simples, à paillettes, à motifs) et dessins à colorier
// intégrés (dessins au trait, régions blanches délimitées par des traits noirs).

export const PALETTE = [
  // Couleurs simples
  { id: 'rouge', type: 'solid', name: 'rouge', color: '#E53935' },
  { id: 'orange', type: 'solid', name: 'orange', color: '#FB8C00' },
  { id: 'jaune', type: 'solid', name: 'jaune', color: '#FDD835' },
  { id: 'vert', type: 'solid', name: 'vert', color: '#43A047' },
  { id: 'bleu', type: 'solid', name: 'bleu', color: '#1E88E5' },
  { id: 'cyan', type: 'solid', name: 'bleu clair', color: '#4FC3F7' },
  { id: 'violet', type: 'solid', name: 'violet', color: '#8E24AA' },
  { id: 'rose', type: 'solid', name: 'rose', color: '#EC407A' },
  { id: 'marron', type: 'solid', name: 'marron', color: '#8D6E63' },
  { id: 'gris', type: 'solid', name: 'gris', color: '#9E9E9E' },
  { id: 'noir', type: 'solid', name: 'noir', color: '#2B2D42' },
  { id: 'blanc', type: 'solid', name: 'blanc', color: '#FFFFFF' },
  // Couleurs à paillettes
  { id: 'g-or', type: 'glitter', name: 'or pailleté', base: '#E7B924', spark: '#FFF3B0' },
  { id: 'g-rose', type: 'glitter', name: 'rose pailleté', base: '#FF4F9A', spark: '#FFD6E8' },
  { id: 'g-violet', type: 'glitter', name: 'violet pailleté', base: '#9C4DFF', spark: '#E9D9FF' },
  { id: 'g-arc', type: 'rainbow', name: 'arc-en-ciel pailleté' },
  // Couleurs à motifs
  { id: 'm-pois', type: 'pattern', pattern: 'dots', name: 'à pois', bg: '#FFE08A', fg: '#FF7043' },
  { id: 'm-rayures', type: 'pattern', pattern: 'stripes', name: 'à rayures', bg: '#A0E7E5', fg: '#2E86DE' },
  { id: 'm-etoiles', type: 'pattern', pattern: 'stars', name: 'à étoiles', bg: '#B39DDB', fg: '#FFD93C' },
  { id: 'm-coeurs', type: 'pattern', pattern: 'hearts', name: 'à cœurs', bg: '#FFC9DE', fg: '#FF4D6D' },
];

// Un pétale de fleur, décliné par rotations autour du centre (50,50).
const petals = [0, 60, 120, 180, 240, 300]
  .map((a) => `<ellipse cx="50" cy="30" rx="9" ry="15" transform="rotate(${a} 50 50)"/>`)
  .join('');

export const BUILTIN_COLORINGS = [
  {
    id: 'fleur',
    name: 'la fleur',
    svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <rect width="100" height="100" fill="#fff"/>
      <path d="M50 60 L50 93" stroke="#000" stroke-width="3" fill="none"/>
      <ellipse cx="36" cy="76" rx="11" ry="5.5" fill="#fff" stroke="#000" stroke-width="2" transform="rotate(-28 36 76)"/>
      <ellipse cx="64" cy="84" rx="11" ry="5.5" fill="#fff" stroke="#000" stroke-width="2" transform="rotate(28 64 84)"/>
      <g fill="#fff" stroke="#000" stroke-width="2">${petals}</g>
      <circle cx="50" cy="50" r="11" fill="#fff" stroke="#000" stroke-width="2"/>
    </svg>`,
  },
  {
    id: 'papillon',
    name: 'le papillon',
    svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <rect width="100" height="100" fill="#fff"/>
      <path d="M48 33 Q42 22 37 19" stroke="#000" stroke-width="2" fill="none"/>
      <path d="M52 33 Q58 22 63 19" stroke="#000" stroke-width="2" fill="none"/>
      <path d="M47 42 Q17 23 19 47 Q20 61 47 54 Z" fill="#fff" stroke="#000" stroke-width="2"/>
      <path d="M53 42 Q83 23 81 47 Q80 61 53 54 Z" fill="#fff" stroke="#000" stroke-width="2"/>
      <path d="M47 56 Q25 61 29 79 Q33 88 47 70 Z" fill="#fff" stroke="#000" stroke-width="2"/>
      <path d="M53 56 Q75 61 71 79 Q67 88 53 70 Z" fill="#fff" stroke="#000" stroke-width="2"/>
      <circle cx="31" cy="44" r="4.5" fill="#fff" stroke="#000" stroke-width="1.5"/>
      <circle cx="69" cy="44" r="4.5" fill="#fff" stroke="#000" stroke-width="1.5"/>
      <ellipse cx="50" cy="52" rx="4.5" ry="20" fill="#fff" stroke="#000" stroke-width="2"/>
    </svg>`,
  },
  {
    id: 'poisson',
    name: 'le poisson',
    svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <rect width="100" height="100" fill="#fff"/>
      <path d="M72 50 L93 33 L89 50 L93 67 Z" fill="#fff" stroke="#000" stroke-width="2"/>
      <path d="M18 50 Q40 20 73 50 Q40 80 18 50 Z" fill="#fff" stroke="#000" stroke-width="2"/>
      <path d="M42 29 Q52 16 62 31 Z" fill="#fff" stroke="#000" stroke-width="2"/>
      <path d="M46 37 Q41 50 46 63" stroke="#000" stroke-width="1.5" fill="none"/>
      <circle cx="31" cy="46" r="4.5" fill="#fff" stroke="#000" stroke-width="2"/>
      <circle cx="13" cy="30" r="4.5" fill="#fff" stroke="#000" stroke-width="1.5"/>
      <circle cx="22" cy="19" r="3" fill="#fff" stroke="#000" stroke-width="1.5"/>
    </svg>`,
  },
  {
    id: 'etoile',
    name: "l'étoile",
    svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <rect width="100" height="100" fill="#fff"/>
      <path d="M50 12 L61 38 L89 40 L67 58 L74 86 L50 70 L26 86 L33 58 L11 40 L39 38 Z" fill="#fff" stroke="#000" stroke-width="2.5" stroke-linejoin="round"/>
      <circle cx="50" cy="52" r="9" fill="#fff" stroke="#000" stroke-width="1.5"/>
    </svg>`,
  },
];
