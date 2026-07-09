// Données des jeux (portées telles quelles depuis la version précédente)

export const COUNT_OBJECTS = ['🐶','🐱','🐰','🐻','🦊','🐸','🦋','🐝','🌟','🍎','🍌','🎈','🐷','🐢','🦁'];
export const COLORS = [
  {name:'rouge', value:'#FF4D4D'}, {name:'bleu', value:'#3A86FF'},
  {name:'jaune', value:'#FFD43B'}, {name:'vert', value:'#4CAF50'},
  {name:'rose', value:'#FF8FAB'}, {name:'violet', value:'#9D4EDD'},
  {name:'orange', value:'#FF8C42'},
];
export const SHAPES = [
  {name:'rond', svg:'<circle cx="50" cy="50" r="42" fill="#FF6B6B" stroke="#2B2D42" stroke-width="4"/>'},
  {name:'carré', svg:'<rect x="10" y="10" width="80" height="80" rx="6" fill="#4ECDC4" stroke="#2B2D42" stroke-width="4"/>'},
  {name:'triangle', svg:'<polygon points="50,10 92,85 8,85" fill="#FFD43B" stroke="#2B2D42" stroke-width="4" stroke-linejoin="round"/>'},
  {name:'étoile', svg:'<polygon points="50,8 61,38 92,38 67,57 77,88 50,70 23,88 33,57 8,38 39,38" fill="#FF8FAB" stroke="#2B2D42" stroke-width="4" stroke-linejoin="round"/>'},
  {name:'cœur', svg:'<path d="M50 85 C 20 65, 5 45, 20 25 C 32 12, 45 22, 50 32 C 55 22, 68 12, 80 25 C 95 45, 80 65, 50 85 Z" fill="#FF4D8D" stroke="#2B2D42" stroke-width="4" stroke-linejoin="round"/>'},
];
export const BODY_PARTS = [
  {id: 'tete', name: 'la tête', boxes: [{top:'5%', left:'30%', width:'40%', height:'22%'}]},
  {id: 'ventre', name: 'le ventre', boxes: [{top:'28%', left:'30%', width:'40%', height:'28%'}]},
  {id: 'main', name: 'la main', boxes: [{top:'44%', left:'4%', width:'22%', height:'15%'}, {top:'44%', left:'74%', width:'22%', height:'15%'}]},
  {id: 'pied', name: 'le pied', boxes: [{top:'77%', left:'18%', width:'26%', height:'15%'}, {top:'77%', left:'56%', width:'26%', height:'15%'}]},
  {id: 'cou', name: 'le cou', boxes: [{top:'21%', left:'38%', width:'24%', height:'8%'}]},
  {id: 'bras', name: 'le bras', boxes: [{top:'32%', left:'14%', width:'18%', height:'16%'}, {top:'32%', left:'68%', width:'18%', height:'16%'}]},
  {id: 'jambe', name: 'la jambe', boxes: [{top:'57%', left:'28%', width:'20%', height:'18%'}, {top:'57%', left:'52%', width:'20%', height:'18%'}]},
  {id: 'oreille', name: 'l\'oreille', boxes: [{top:'12%', left:'25%', width:'16%', height:'12%'}, {top:'12%', left:'59%', width:'16%', height:'12%'}]},
  {id: 'nez', name: 'le nez', boxes: [{top:'14%', left:'42%', width:'16%', height:'8%'}]},
  {id: 'bouche', name: 'la bouche', boxes: [{top:'18%', left:'40%', width:'20%', height:'8%'}]},
  {id: 'genou', name: 'le genou', boxes: [{top:'64%', left:'30%', width:'16%', height:'10%'}, {top:'64%', left:'54%', width:'16%', height:'10%'}]}
];
export const PRAISES = ['Bravo !','Super !','Excellent !','Magnifique !','Génial !','Bien joué !'];
export const ENCOURAGE = ["Essaie encore !","Presque !","Regarde bien !"];

/* ============================================================
   JIGSAW PUZZLES (vrai puzzle 2x2)
   Chaque puzzle = une image SVG complète. Elle est découpée en 4
   morceaux. Une case du puzzle est mise en surbrillance ; l'enfant
   choisit la pièce qui va à cet endroit parmi les pièces du côté.
============================================================ */
export const JIGSAW_PUZZLES = [
  {
    id:'maison', name:'la maison', size:400,
    image: `
      <rect width="400" height="280" fill="#B3E5FF"/>
      <rect y="280" width="400" height="120" fill="#A8E6A1"/>
      <ellipse cx="80" cy="80" rx="40" ry="22" fill="#fff" stroke="#2B2D42" stroke-width="3"/>
      <ellipse cx="60" cy="85" rx="22" ry="14" fill="#fff" stroke="#2B2D42" stroke-width="3"/>
      <ellipse cx="100" cy="85" rx="22" ry="14" fill="#fff" stroke="#2B2D42" stroke-width="3"/>
      <g stroke="#F5B400" stroke-width="6" stroke-linecap="round">
        <line x1="335" y1="25" x2="335" y2="42"/>
        <line x1="375" y1="80" x2="392" y2="80"/>
        <line x1="365" y1="50" x2="378" y2="37"/>
        <line x1="365" y1="110" x2="378" y2="123"/>
        <line x1="295" y1="50" x2="282" y2="37"/>
      </g>
      <circle cx="335" cy="80" r="35" fill="#FFD93C" stroke="#2B2D42" stroke-width="3"/>
      <circle cx="324" cy="75" r="4" fill="#2B2D42"/>
      <circle cx="346" cy="75" r="4" fill="#2B2D42"/>
      <path d="M322 90 Q335 100 348 90" stroke="#2B2D42" stroke-width="3" fill="none" stroke-linecap="round"/>
      <rect x="55" y="250" width="22" height="90" fill="#8B4513" stroke="#2B2D42" stroke-width="3"/>
      <circle cx="66" cy="225" r="50" fill="#4A8C2E" stroke="#2B2D42" stroke-width="3"/>
      <circle cx="50" cy="240" r="6" fill="#FF4D4D" stroke="#2B2D42" stroke-width="2"/>
      <circle cx="85" cy="220" r="6" fill="#FF4D4D" stroke="#2B2D42" stroke-width="2"/>
      <line x1="120" y1="320" x2="120" y2="380" stroke="#4A8C2E" stroke-width="4"/>
      <circle cx="120" cy="315" r="14" fill="#FF6B95" stroke="#2B2D42" stroke-width="2.5"/>
      <circle cx="120" cy="315" r="6" fill="#FFD93C"/>
      <rect x="180" y="200" width="170" height="150" fill="#FFE9C7" stroke="#2B2D42" stroke-width="3"/>
      <polygon points="170,200 360,200 265,120" fill="#FF6B6B" stroke="#2B2D42" stroke-width="3" stroke-linejoin="round"/>
      <rect x="240" y="270" width="55" height="80" fill="#8B4513" stroke="#2B2D42" stroke-width="3"/>
      <circle cx="285" cy="310" r="4" fill="#FFD93C"/>
      <rect x="195" y="220" width="35" height="35" fill="#A8E0F0" stroke="#2B2D42" stroke-width="3"/>
      <line x1="212" y1="220" x2="212" y2="255" stroke="#2B2D42" stroke-width="2"/>
      <line x1="195" y1="237" x2="230" y2="237" stroke="#2B2D42" stroke-width="2"/>
    `,
  },
  {
    id:'visage', name:'le visage souriant', size:400,
    image: `
      <rect width="400" height="400" fill="#FFE5B5"/>
      <polygon points="40,40 48,60 70,60 52,72 60,95 40,82 20,95 28,72 10,60 32,60" fill="#FFD93C" stroke="#2B2D42" stroke-width="2"/>
      <polygon points="360,40 368,60 390,60 372,72 380,95 360,82 340,95 348,72 330,60 352,60" fill="#FFD93C" stroke="#2B2D42" stroke-width="2"/>
      <circle cx="40" cy="360" r="20" fill="#FF6B95" stroke="#2B2D42" stroke-width="3"/>
      <circle cx="40" cy="360" r="8" fill="#FFD93C"/>
      <circle cx="360" cy="360" r="20" fill="#A06CD5" stroke="#2B2D42" stroke-width="3"/>
      <circle cx="360" cy="360" r="8" fill="#FFD93C"/>
      <circle cx="200" cy="200" r="140" fill="#FFE9C7" stroke="#2B2D42" stroke-width="4"/>
      <circle cx="155" cy="170" r="16" fill="#2B2D42"/>
      <circle cx="245" cy="170" r="16" fill="#2B2D42"/>
      <circle cx="159" cy="166" r="5" fill="#fff"/>
      <circle cx="249" cy="166" r="5" fill="#fff"/>
      <circle cx="125" cy="230" r="18" fill="#FFB5C5" opacity="0.7"/>
      <circle cx="275" cy="230" r="18" fill="#FFB5C5" opacity="0.7"/>
      <ellipse cx="200" cy="215" rx="10" ry="8" fill="#FF6B95" stroke="#2B2D42" stroke-width="2"/>
      <path d="M150 260 Q200 305 250 260" stroke="#2B2D42" stroke-width="8" fill="#FF4D8D" stroke-linecap="round"/>
    `,
  },
  {
    id:'voiture', name:'la voiture', size:400,
    image: `
      <rect width="400" height="400" fill="#B3E5FF"/>
      <rect y="330" width="400" height="70" fill="#888"/>
      <line x1="0" y1="365" x2="80" y2="365" stroke="#fff" stroke-width="5"/>
      <line x1="120" y1="365" x2="200" y2="365" stroke="#fff" stroke-width="5"/>
      <line x1="240" y1="365" x2="320" y2="365" stroke="#fff" stroke-width="5"/>
      <ellipse cx="80" cy="80" rx="40" ry="22" fill="#fff" stroke="#2B2D42" stroke-width="3"/>
      <ellipse cx="60" cy="85" rx="22" ry="14" fill="#fff" stroke="#2B2D42" stroke-width="3"/>
      <ellipse cx="100" cy="85" rx="22" ry="14" fill="#fff" stroke="#2B2D42" stroke-width="3"/>
      <g stroke="#F5B400" stroke-width="6" stroke-linecap="round">
        <line x1="335" y1="25" x2="335" y2="42"/>
        <line x1="375" y1="80" x2="392" y2="80"/>
      </g>
      <circle cx="335" cy="80" r="35" fill="#FFD93C" stroke="#2B2D42" stroke-width="3"/>
      <circle cx="324" cy="75" r="4" fill="#2B2D42"/>
      <circle cx="346" cy="75" r="4" fill="#2B2D42"/>
      <path d="M322 90 Q335 100 348 90" stroke="#2B2D42" stroke-width="3" fill="none" stroke-linecap="round"/>
      <rect x="60" y="230" width="280" height="90" rx="20" fill="#FF6B6B" stroke="#2B2D42" stroke-width="3"/>
      <path d="M120 230 L160 175 L260 175 L300 230 Z" fill="#FF6B6B" stroke="#2B2D42" stroke-width="3" stroke-linejoin="round"/>
      <rect x="135" y="185" width="55" height="40" fill="#A8E0F0" stroke="#2B2D42" stroke-width="2"/>
      <rect x="225" y="185" width="55" height="40" fill="#A8E0F0" stroke="#2B2D42" stroke-width="2"/>
      <circle cx="80" cy="245" r="6" fill="#FFD93C" stroke="#2B2D42" stroke-width="2"/>
      <circle cx="320" cy="245" r="6" fill="#FF4D4D" stroke="#2B2D42" stroke-width="2"/>
      <circle cx="120" cy="320" r="35" fill="#2B2D42"/>
      <circle cx="120" cy="320" r="18" fill="#888" stroke="#2B2D42" stroke-width="2"/>
      <circle cx="280" cy="320" r="35" fill="#2B2D42"/>
      <circle cx="280" cy="320" r="18" fill="#888" stroke="#2B2D42" stroke-width="2"/>
    `,
  },
  {
    id: 'chat', name: 'le chat', size: 400,
    image: `
      <rect width="400" height="400" fill="#FFE0B2"/>
      <circle cx="200" cy="215" r="130" fill="#FFB74D" stroke="#2B2D42" stroke-width="5"/>
      <polygon points="95,130 90,30 175,95" fill="#FFB74D" stroke="#2B2D42" stroke-width="5" stroke-linejoin="round"/>
      <polygon points="305,130 310,30 225,95" fill="#FFB74D" stroke="#2B2D42" stroke-width="5" stroke-linejoin="round"/>
      <polygon points="112,120 110,62 158,100" fill="#FF8A80"/>
      <polygon points="288,120 290,62 242,100" fill="#FF8A80"/>
      <circle cx="152" cy="195" r="26" fill="#fff" stroke="#2B2D42" stroke-width="4"/>
      <circle cx="248" cy="195" r="26" fill="#fff" stroke="#2B2D42" stroke-width="4"/>
      <circle cx="152" cy="198" r="12" fill="#2B2D42"/>
      <circle cx="248" cy="198" r="12" fill="#2B2D42"/>
      <polygon points="200,235 184,222 216,222" fill="#FF6B95" stroke="#2B2D42" stroke-width="3" stroke-linejoin="round"/>
      <path d="M200 248 Q180 268 158 252" stroke="#2B2D42" stroke-width="4" fill="none" stroke-linecap="round"/>
      <path d="M200 248 Q220 268 242 252" stroke="#2B2D42" stroke-width="4" fill="none" stroke-linecap="round"/>
      <g stroke="#2B2D42" stroke-width="3" stroke-linecap="round">
        <line x1="60" y1="230" x2="120" y2="225"/><line x1="60" y1="255" x2="120" y2="248"/>
        <line x1="340" y1="230" x2="280" y2="225"/><line x1="340" y1="255" x2="280" y2="248"/>
      </g>
      <circle cx="118" cy="240" r="16" fill="#FF8A80" opacity="0.6"/>
      <circle cx="282" cy="240" r="16" fill="#FF8A80" opacity="0.6"/>
    `,
  },
  {
    id: 'poisson', name: 'le poisson', size: 400,
    image: `
      <rect width="400" height="400" fill="#8ED6E8"/>
      <circle cx="70" cy="90" r="10" fill="#fff" opacity="0.7"/>
      <circle cx="110" cy="60" r="6" fill="#fff" opacity="0.7"/>
      <circle cx="330" cy="320" r="9" fill="#fff" opacity="0.6"/>
      <polygon points="300,200 380,140 380,260" fill="#FF7043" stroke="#2B2D42" stroke-width="5" stroke-linejoin="round"/>
      <ellipse cx="180" cy="200" rx="150" ry="105" fill="#FF9800" stroke="#2B2D42" stroke-width="5"/>
      <polygon points="150,95 200,150 130,160" fill="#FF7043" stroke="#2B2D42" stroke-width="4" stroke-linejoin="round"/>
      <path d="M120 200 q40 -30 90 0" fill="none" stroke="#E65100" stroke-width="5" stroke-linecap="round"/>
      <path d="M120 230 q40 -30 90 0" fill="none" stroke="#E65100" stroke-width="5" stroke-linecap="round"/>
      <circle cx="95" cy="180" r="30" fill="#fff" stroke="#2B2D42" stroke-width="4"/>
      <circle cx="90" cy="182" r="14" fill="#2B2D42"/>
      <circle cx="85" cy="177" r="5" fill="#fff"/>
      <path d="M70 235 q20 20 45 8" stroke="#2B2D42" stroke-width="4" fill="none" stroke-linecap="round"/>
    `,
  },
  {
    id: 'fusee', name: 'la fusée', size: 400,
    image: `
      <rect width="400" height="400" fill="#1A237E"/>
      <g fill="#FFF59D">
        <circle cx="60" cy="70" r="4"/><circle cx="120" cy="120" r="3"/><circle cx="330" cy="60" r="5"/>
        <circle cx="300" cy="150" r="3"/><circle cx="70" cy="300" r="4"/><circle cx="350" cy="300" r="3"/>
        <polygon points="150,55 156,73 175,73 160,84 166,102 150,90 134,102 140,84 125,73 144,73"/>
      </g>
      <ellipse cx="200" cy="150" rx="70" ry="120" fill="#ECEFF1" stroke="#2B2D42" stroke-width="5"/>
      <path d="M200 35 q-70 40 -70 115 h140 q0 -75 -70 -115z" fill="#EF5350" stroke="#2B2D42" stroke-width="5"/>
      <circle cx="200" cy="150" r="34" fill="#4FC3F7" stroke="#2B2D42" stroke-width="5"/>
      <circle cx="188" cy="140" r="10" fill="#fff" opacity="0.7"/>
      <polygon points="130,230 90,300 130,275" fill="#EF5350" stroke="#2B2D42" stroke-width="5" stroke-linejoin="round"/>
      <polygon points="270,230 310,300 270,275" fill="#EF5350" stroke="#2B2D42" stroke-width="5" stroke-linejoin="round"/>
      <path d="M170 268 q30 90 60 0 q-30 40 -60 0z" fill="#FFB300"/>
      <path d="M182 275 q18 60 36 0 q-18 26 -36 0z" fill="#FF7043"/>
    `,
  },
];

export const BALLOON_POOL = [
  // Animaux (avec leur cri en français)
  {emoji:'🐶', name:'le chien',      sound:'wouf wouf'},
  {emoji:'🐱', name:'le chat',       sound:'miaou miaou'},
  {emoji:'🐄', name:'la vache',      sound:'meuh meuh'},
  {emoji:'🦆', name:'le canard',     sound:'coin coin'},
  {emoji:'🐷', name:'le cochon',     sound:'groin groin'},
  {emoji:'🐔', name:'la poule',      sound:'cot cot codet'},
  {emoji:'🐸', name:'la grenouille', sound:'coâ coâ'},
  {emoji:'🐝', name:"l'abeille",     sound:'bzzz bzzz'},
  {emoji:'🦁', name:'le lion',       sound:'rooaarrr'},
  {emoji:'🐴', name:'le cheval',     sound:'hi hi hi'},
  // Chiffres
  {emoji:'1️⃣', name:'le un'},
  {emoji:'2️⃣', name:'le deux'},
  {emoji:'3️⃣', name:'le trois'},
  // Formes
  {emoji:'🔴', name:'le rond'},
  {emoji:'🟦', name:'le carré bleu'},
  {emoji:'🔺', name:'le triangle'},
  {emoji:'⭐', name:"l'étoile"},
  {emoji:'❤️', name:'le cœur'},
  // Fruits
  {emoji:'🍎', name:'la pomme'},
  {emoji:'🍌', name:'la banane'},
  {emoji:'🍓', name:'la fraise'},
  {emoji:'🍇', name:'le raisin'},
  {emoji:'🍐', name:'la poire'},
];

export const BALLOON_COLORS = ['#FF6B6B', '#4ECDC4', '#FFD93C', '#95E06C', '#A06CD5', '#FF9FB5', '#5DADE2', '#FFB347'];

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function mixColor(hex, target, amt) {
  const c = hexToRgb(hex);
  const t = hexToRgb(target);
  const r = Math.round(c.r + (t.r - c.r) * amt);
  const g = Math.round(c.g + (t.g - c.g) * amt);
  const b = Math.round(c.b + (t.b - c.b) * amt);
  return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');
}

// uid distingue les dégradés SVG de chaque ballon affiché en même temps :
// des id identiques entre plusieurs <svg> du DOM casseraient leur rendu.
export function svgBalloon(color, uid = '0') {
  const light = mixColor(color, '#ffffff', 0.55);
  const dark = mixColor(color, '#000000', 0.22);
  const gradId = `balloonGrad-${uid}`;
  const shineId = `balloonShine-${uid}`;
  const delay = (Number(uid) % 6) * 0.35;
  return `<svg class="balloon-svg" viewBox="0 0 100 150" xmlns="http://www.w3.org/2000/svg" style="animation-delay:${delay}s">
    <defs>
      <radialGradient id="${gradId}" cx="35%" cy="26%" r="80%">
        <stop offset="0%" stop-color="${light}"/>
        <stop offset="55%" stop-color="${color}"/>
        <stop offset="100%" stop-color="${dark}"/>
      </radialGradient>
      <radialGradient id="${shineId}" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#ffffff" stop-opacity="0.9"/>
        <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <ellipse cx="50" cy="111" rx="23" ry="4.5" fill="#2B2D42" opacity="0.12"/>
    <path d="M50 6 C74 6 90 32 90 61 C90 89 72 109 50 109 C28 109 10 89 10 61 C10 32 26 6 50 6 Z"
          fill="url(#${gradId})" stroke="#2B2D42" stroke-width="2.5" stroke-linejoin="round"/>
    <ellipse cx="34" cy="36" rx="17" ry="23" fill="url(#${shineId})"/>
    <ellipse cx="39" cy="27" rx="5" ry="9" fill="#fff" opacity="0.85"/>
    <path d="M44 107 L50 117 L56 107 Z" fill="${color}" stroke="#2B2D42" stroke-width="2" stroke-linejoin="round"/>
    <path d="M50 117 Q44 127 52 137 Q46 145 50 150" stroke="#2B2D42" stroke-width="1.8" fill="none" stroke-linecap="round"/>
  </svg>`;
}

export const XYLO_NOTES = [
  {name:'Do',  freq:261.63, color:'#FF4D4D'},
  {name:'Ré',  freq:293.66, color:'#FF8C42'},
  {name:'Mi',  freq:329.63, color:'#FFD43B'},
  {name:'Fa',  freq:349.23, color:'#7FD85C'},
  {name:'Sol', freq:392.00, color:'#3A86FF'},
  {name:'La',  freq:440.00, color:'#A06CD5'},
  {name:'Si',  freq:493.88, color:'#FF6B95'},
  {name:'Do',  freq:523.25, color:'#E84D4D'},
];
