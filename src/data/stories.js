// Illustrations SVG + données des histoires (portées telles quelles depuis la version précédente)

// Petite souris Miko — pose debout, vue de face
export function svgMiko(x, y, scale=1, options={}){
  const eyesClosed = options.sleeping;
  const eyes = eyesClosed
    ? `<path d="M78 78 Q85 73 92 78" stroke="#2B2D42" stroke-width="3" fill="none" stroke-linecap="round"/>
       <path d="M108 78 Q115 73 122 78" stroke="#2B2D42" stroke-width="3" fill="none" stroke-linecap="round"/>`
    : `<circle cx="85" cy="78" r="7" fill="#2B2D42"/>
       <circle cx="115" cy="78" r="7" fill="#2B2D42"/>
       <circle cx="87" cy="76" r="2.5" fill="#fff"/>
       <circle cx="117" cy="76" r="2.5" fill="#fff"/>`;
  const zzz = eyesClosed ? `<text x="155" y="50" font-family="Baloo 2" font-size="28" fill="#5A6BAB" font-weight="800">z z Z</text>` : '';
  return `<g class="speakable" data-label="la souris" transform="translate(${x},${y}) scale(${scale})">
    <path d="M145 130 Q175 130 180 100 Q185 78 165 75" stroke="#8A7A6E" stroke-width="4" fill="none" stroke-linecap="round"/>
    <ellipse cx="80" cy="175" rx="14" ry="7" fill="#FFB5C5" stroke="#2B2D42" stroke-width="2.5"/>
    <ellipse cx="120" cy="175" rx="14" ry="7" fill="#FFB5C5" stroke="#2B2D42" stroke-width="2.5"/>
    <ellipse cx="100" cy="135" rx="55" ry="45" fill="#D4CFC8" stroke="#2B2D42" stroke-width="2.5"/>
    <ellipse cx="100" cy="148" rx="33" ry="22" fill="#F2EDE5"/>
    <circle cx="100" cy="80" r="42" fill="#D4CFC8" stroke="#2B2D42" stroke-width="2.5"/>
    <circle cx="72" cy="52" r="20" fill="#D4CFC8" stroke="#2B2D42" stroke-width="2.5"/>
    <circle cx="128" cy="52" r="20" fill="#D4CFC8" stroke="#2B2D42" stroke-width="2.5"/>
    <circle cx="72" cy="54" r="11" fill="#FFB5C5"/>
    <circle cx="128" cy="54" r="11" fill="#FFB5C5"/>
    <circle cx="75" cy="93" r="7" fill="#FFB5C5" opacity="0.65"/>
    <circle cx="125" cy="93" r="7" fill="#FFB5C5" opacity="0.65"/>
    ${eyes}
    <ellipse cx="100" cy="100" rx="6" ry="4.5" fill="#FF6B95" stroke="#2B2D42" stroke-width="1.8"/>
    <path d="M92 108 Q100 114 108 108" stroke="#2B2D42" stroke-width="2.2" fill="none" stroke-linecap="round"/>
    <line x1="80" y1="100" x2="55" y2="98" stroke="#8A7A6E" stroke-width="1.8" stroke-linecap="round"/>
    <line x1="80" y1="104" x2="55" y2="108" stroke="#8A7A6E" stroke-width="1.8" stroke-linecap="round"/>
    <line x1="120" y1="100" x2="145" y2="98" stroke="#8A7A6E" stroke-width="1.8" stroke-linecap="round"/>
    <line x1="120" y1="104" x2="145" y2="108" stroke="#8A7A6E" stroke-width="1.8" stroke-linecap="round"/>
    ${zzz}
  </g>`;
}

// Souris amie (petite, autre couleur)
export function svgAmiSouris(x, y, scale=1, color='#B89D7F'){
  return `<g class="speakable" data-label="un ami souris" transform="translate(${x},${y}) scale(${scale})">
    <path d="M145 130 Q175 130 180 100 Q185 78 165 75" stroke="#5A4A3E" stroke-width="4" fill="none" stroke-linecap="round"/>
    <ellipse cx="80" cy="175" rx="14" ry="7" fill="#FFB5C5" stroke="#2B2D42" stroke-width="2.5"/>
    <ellipse cx="120" cy="175" rx="14" ry="7" fill="#FFB5C5" stroke="#2B2D42" stroke-width="2.5"/>
    <ellipse cx="100" cy="135" rx="55" ry="45" fill="${color}" stroke="#2B2D42" stroke-width="2.5"/>
    <ellipse cx="100" cy="148" rx="33" ry="22" fill="#E8D8C0"/>
    <circle cx="100" cy="80" r="42" fill="${color}" stroke="#2B2D42" stroke-width="2.5"/>
    <circle cx="72" cy="52" r="20" fill="${color}" stroke="#2B2D42" stroke-width="2.5"/>
    <circle cx="128" cy="52" r="20" fill="${color}" stroke="#2B2D42" stroke-width="2.5"/>
    <circle cx="72" cy="54" r="11" fill="#FFB5C5"/>
    <circle cx="128" cy="54" r="11" fill="#FFB5C5"/>
    <circle cx="85" cy="78" r="7" fill="#2B2D42"/>
    <circle cx="115" cy="78" r="7" fill="#2B2D42"/>
    <circle cx="87" cy="76" r="2.5" fill="#fff"/>
    <circle cx="117" cy="76" r="2.5" fill="#fff"/>
    <ellipse cx="100" cy="100" rx="6" ry="4.5" fill="#FF6B95" stroke="#2B2D42" stroke-width="1.8"/>
    <path d="M92 108 Q100 114 108 108" stroke="#2B2D42" stroke-width="2.2" fill="none" stroke-linecap="round"/>
  </g>`;
}

// Fromage (triangle avec trous)
export function svgFromage(x, y, scale=1){
  return `<g class="speakable" data-label="un fromage" transform="translate(${x},${y}) scale(${scale})">
    <path d="M10 80 L10 30 Q12 22 22 22 L130 22 Q138 22 138 30 L138 80 Q138 88 130 88 L18 88 Q10 88 10 80 Z"
          fill="#FFD43B" stroke="#2B2D42" stroke-width="3" stroke-linejoin="round"/>
    <path d="M10 30 L138 30" stroke="#2B2D42" stroke-width="3"/>
    <ellipse cx="35" cy="55" rx="9" ry="7" fill="#E0A920" stroke="#2B2D42" stroke-width="2"/>
    <ellipse cx="70" cy="45" rx="6" ry="5" fill="#E0A920" stroke="#2B2D42" stroke-width="2"/>
    <ellipse cx="95" cy="65" rx="8" ry="6" fill="#E0A920" stroke="#2B2D42" stroke-width="2"/>
    <ellipse cx="120" cy="50" rx="5" ry="4" fill="#E0A920" stroke="#2B2D42" stroke-width="2"/>
    <ellipse cx="60" cy="70" rx="5" ry="4" fill="#E0A920" stroke="#2B2D42" stroke-width="2"/>
  </g>`;
}

// Soleil
export function svgSoleil(x, y, scale=1){
  return `<g class="speakable" data-label="le soleil" transform="translate(${x},${y}) scale(${scale})">
    <g style="transform-origin: 60px 60px;">
      <line x1="60" y1="5" x2="60" y2="20" stroke="#F5B400" stroke-width="5" stroke-linecap="round"/>
      <line x1="60" y1="100" x2="60" y2="115" stroke="#F5B400" stroke-width="5" stroke-linecap="round"/>
      <line x1="5" y1="60" x2="20" y2="60" stroke="#F5B400" stroke-width="5" stroke-linecap="round"/>
      <line x1="100" y1="60" x2="115" y2="60" stroke="#F5B400" stroke-width="5" stroke-linecap="round"/>
      <line x1="20" y1="20" x2="30" y2="30" stroke="#F5B400" stroke-width="5" stroke-linecap="round"/>
      <line x1="90" y1="90" x2="100" y2="100" stroke="#F5B400" stroke-width="5" stroke-linecap="round"/>
      <line x1="20" y1="100" x2="30" y2="90" stroke="#F5B400" stroke-width="5" stroke-linecap="round"/>
      <line x1="90" y1="30" x2="100" y2="20" stroke="#F5B400" stroke-width="5" stroke-linecap="round"/>
    </g>
    <circle cx="60" cy="60" r="32" fill="#FFD93C" stroke="#2B2D42" stroke-width="3"/>
    <circle cx="50" cy="55" r="4" fill="#2B2D42"/>
    <circle cx="70" cy="55" r="4" fill="#2B2D42"/>
    <path d="M48 68 Q60 78 72 68" stroke="#2B2D42" stroke-width="3" fill="none" stroke-linecap="round"/>
    <circle cx="44" cy="68" r="4" fill="#FFB5C5" opacity="0.7"/>
    <circle cx="76" cy="68" r="4" fill="#FFB5C5" opacity="0.7"/>
  </g>`;
}

// Lune
export function svgLune(x, y, scale=1){
  return `<g class="speakable" data-label="la lune" transform="translate(${x},${y}) scale(${scale})">
    <circle cx="50" cy="50" r="38" fill="#FFF6BC" stroke="#2B2D42" stroke-width="3"/>
    <circle cx="38" cy="42" r="6" fill="#E8D680" opacity="0.7"/>
    <circle cx="58" cy="60" r="4" fill="#E8D680" opacity="0.7"/>
    <circle cx="62" cy="40" r="3" fill="#E8D680" opacity="0.7"/>
    <circle cx="42" cy="58" r="5" fill="#E8D680" opacity="0.7"/>
  </g>`;
}

// Étoile
export function svgEtoile(x, y, scale=1){
  return `<g class="speakable" data-label="une étoile" transform="translate(${x},${y}) scale(${scale})">
    <polygon points="20,3 25,15 38,15 28,23 32,36 20,28 8,36 12,23 2,15 15,15"
             fill="#FFE066" stroke="#2B2D42" stroke-width="2"/>
  </g>`;
}

// Fleur
export function svgFleur(x, y, scale=1, color='#FF6B95'){
  return `<g class="speakable" data-label="une fleur" transform="translate(${x},${y}) scale(${scale})">
    <line x1="40" y1="50" x2="40" y2="90" stroke="#4A8C2E" stroke-width="4" stroke-linecap="round"/>
    <path d="M30 75 Q22 70 18 78 Q22 85 32 80" fill="#7FD85C" stroke="#2B2D42" stroke-width="2"/>
    <circle cx="40" cy="25" r="12" fill="${color}" stroke="#2B2D42" stroke-width="2"/>
    <circle cx="55" cy="35" r="12" fill="${color}" stroke="#2B2D42" stroke-width="2"/>
    <circle cx="50" cy="50" r="12" fill="${color}" stroke="#2B2D42" stroke-width="2"/>
    <circle cx="30" cy="50" r="12" fill="${color}" stroke="#2B2D42" stroke-width="2"/>
    <circle cx="25" cy="35" r="12" fill="${color}" stroke="#2B2D42" stroke-width="2"/>
    <circle cx="40" cy="38" r="10" fill="#FFD93C" stroke="#2B2D42" stroke-width="2"/>
  </g>`;
}

// Trou de souris
export function svgTrou(x, y, scale=1){
  return `<g class="speakable" data-label="le trou" transform="translate(${x},${y}) scale(${scale})">
    <path d="M10 100 L10 50 Q10 10 60 10 Q110 10 110 50 L110 100 Z"
          fill="#2B2D42" stroke="#2B2D42" stroke-width="3"/>
    <path d="M10 100 L10 50 Q10 10 60 10 Q110 10 110 50 L110 100 Z"
          fill="url(#trou-grad)"/>
    <defs>
      <radialGradient id="trou-grad" cx="0.5" cy="0.4" r="0.6">
        <stop offset="0%" stop-color="#2B2D42"/>
        <stop offset="100%" stop-color="#000"/>
      </radialGradient>
    </defs>
  </g>`;
}

// Fenêtre
export function svgFenetre(x, y, scale=1, content=''){
  return `<g class="speakable" data-label="la fenêtre" transform="translate(${x},${y}) scale(${scale})">
    <rect x="0" y="0" width="140" height="120" rx="8" fill="#A8C8E8" stroke="#2B2D42" stroke-width="3"/>
    <rect x="5" y="5" width="130" height="110" rx="4" fill="#7FA8D8"/>
    ${content}
    <line x1="70" y1="5" x2="70" y2="115" stroke="#2B2D42" stroke-width="3"/>
    <line x1="5" y1="60" x2="135" y2="60" stroke="#2B2D42" stroke-width="3"/>
    <rect x="-5" y="115" width="150" height="10" rx="3" fill="#C09060" stroke="#2B2D42" stroke-width="3"/>
  </g>`;
}

// Table
export function svgTable(x, y, scale=1){
  return `<g class="speakable" data-label="la table" transform="translate(${x},${y}) scale(${scale})">
    <rect x="10" y="20" width="180" height="20" rx="5" fill="#C09060" stroke="#2B2D42" stroke-width="3"/>
    <rect x="25" y="40" width="14" height="80" fill="#A07440" stroke="#2B2D42" stroke-width="3"/>
    <rect x="161" y="40" width="14" height="80" fill="#A07440" stroke="#2B2D42" stroke-width="3"/>
  </g>`;
}

// Assiette
export function svgAssiette(x, y, scale=1){
  return `<g class="speakable" data-label="une assiette" transform="translate(${x},${y}) scale(${scale})">
    <ellipse cx="60" cy="30" rx="55" ry="14" fill="#fff" stroke="#2B2D42" stroke-width="3"/>
    <ellipse cx="60" cy="28" rx="48" ry="10" fill="#F5F5F0" stroke="#D0CCC4" stroke-width="1.5"/>
  </g>`;
}

// Coccinelle (bonus, pour variété)
export function svgCoccinelle(x, y, scale=1){
  return `<g class="speakable" data-label="une coccinelle" transform="translate(${x},${y}) scale(${scale})">
    <ellipse cx="40" cy="30" rx="32" ry="25" fill="#FF4D4D" stroke="#2B2D42" stroke-width="3"/>
    <path d="M40 5 L40 55" stroke="#2B2D42" stroke-width="3"/>
    <circle cx="25" cy="20" r="4" fill="#2B2D42"/>
    <circle cx="55" cy="20" r="4" fill="#2B2D42"/>
    <circle cx="30" cy="38" r="4" fill="#2B2D42"/>
    <circle cx="50" cy="38" r="4" fill="#2B2D42"/>
    <ellipse cx="40" cy="10" rx="14" ry="10" fill="#2B2D42"/>
    <circle cx="35" cy="8" r="2" fill="#fff"/>
    <circle cx="45" cy="8" r="2" fill="#fff"/>
  </g>`;
}

// Herbe (décor non interactif)
export function svgHerbe(x, y, scale=1){
  return `<g transform="translate(${x},${y}) scale(${scale})">
    <path d="M0 20 L5 5 L10 20 L15 8 L20 20 L25 5 L30 20" fill="none" stroke="#4A8C2E" stroke-width="3" stroke-linecap="round"/>
  </g>`;
}

// Mur intérieur (déco non interactive)
export function svgMurInterieur(){
  return `<rect x="0" y="0" width="800" height="500" fill="#F8DEB0"/>
          <rect x="0" y="380" width="800" height="120" fill="#C09060"/>
          <line x1="0" y1="380" x2="800" y2="380" stroke="#2B2D42" stroke-width="3"/>`;
}

/* ============================================================
   PAGES DE L'HISTOIRE MIKO (composées avec les SVG ci-dessus)
============================================================ */
export function pageMikoDort(){
  return `<svg viewBox="0 0 800 500" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg-night" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stop-color="#1F2C5E"/>
        <stop offset="0.7" stop-color="#3D4D8A"/>
        <stop offset="1" stop-color="#5A4A3E"/>
      </linearGradient>
    </defs>
    <rect x="0" y="0" width="800" height="500" fill="url(#bg-night)"/>
    <rect x="0" y="380" width="800" height="120" fill="#5A4A3E"/>
    <line x1="0" y1="380" x2="800" y2="380" stroke="#2B2D42" stroke-width="3"/>
    ${svgFenetre(540, 60, 1.4, `
      <circle cx="40" cy="50" r="26" fill="#FFF6BC" stroke="#2B2D42" stroke-width="2.5"/>
      <circle cx="80" cy="25" r="3" fill="#FFE066"/>
      <circle cx="100" cy="80" r="2" fill="#FFE066"/>
      <circle cx="60" cy="90" r="2.5" fill="#FFE066"/>
    `)}
    ${svgEtoile(120, 60, 1.5)}
    ${svgEtoile(280, 110, 1.2)}
    ${svgEtoile(420, 80, 1.3)}
    ${svgEtoile(180, 200, 1)}
    <!-- Trou de souris avec Miko qui dort dedans -->
    <g transform="translate(80, 310)">
      ${svgTrou(0, 0, 1.5)}
    </g>
    <g transform="translate(95, 320) scale(0.85)">
      ${svgMiko(0, 0, 1, {sleeping:true})}
    </g>
  </svg>`;
}

export function pageMiko1Fromage(){
  return `<svg viewBox="0 0 800 500" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg-morn" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stop-color="#FFE6A0"/>
        <stop offset="1" stop-color="#FFD7A8"/>
      </linearGradient>
    </defs>
    <rect x="0" y="0" width="800" height="500" fill="url(#bg-morn)"/>
    <rect x="0" y="380" width="800" height="120" fill="#C09060"/>
    <line x1="0" y1="380" x2="800" y2="380" stroke="#2B2D42" stroke-width="3"/>
    ${svgFenetre(60, 50, 1.4, `
      <rect x="0" y="60" width="140" height="60" fill="#A8E0F0"/>
      <rect x="0" y="0" width="140" height="60" fill="#FFCC80"/>
    `)}
    ${svgSoleil(660, 60, 1.3)}
    ${svgTable(280, 280, 1.3)}
    <g transform="translate(330, 235)">${svgAssiette(0, 0, 1.4)}</g>
    <g transform="translate(360, 200)">${svgFromage(0, 0, 1)}</g>
    <g transform="translate(140, 280)">${svgMiko(0, 0, 1.1)}</g>
  </svg>`;
}

export function pageMiko2Fromages(){
  return `<svg viewBox="0 0 800 500" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg-kit" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stop-color="#FFE6A0"/>
        <stop offset="1" stop-color="#FFD7A8"/>
      </linearGradient>
    </defs>
    <rect x="0" y="0" width="800" height="500" fill="url(#bg-kit)"/>
    <rect x="0" y="380" width="800" height="120" fill="#C09060"/>
    <line x1="0" y1="380" x2="800" y2="380" stroke="#2B2D42" stroke-width="3"/>
    <!-- Étagère -->
    <rect x="100" y="170" width="600" height="20" rx="5" fill="#A07440" stroke="#2B2D42" stroke-width="3"/>
    <rect x="110" y="190" width="8" height="40" fill="#A07440"/>
    <rect x="682" y="190" width="8" height="40" fill="#A07440"/>
    ${svgSoleil(660, 30, 1)}
    <g transform="translate(220, 90)">${svgFromage(0, 0, 1)}</g>
    <g transform="translate(440, 90)">${svgFromage(0, 0, 1)}</g>
    <g transform="translate(310, 270)">${svgMiko(0, 0, 1.2)}</g>
  </svg>`;
}

export function pageMiko3Fromages(){
  return `<svg viewBox="0 0 800 500" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg-tri" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stop-color="#FFD3A0"/>
        <stop offset="1" stop-color="#FFE9C7"/>
      </linearGradient>
    </defs>
    <rect x="0" y="0" width="800" height="500" fill="url(#bg-tri)"/>
    <rect x="0" y="400" width="800" height="100" fill="#C09060"/>
    <line x1="0" y1="400" x2="800" y2="400" stroke="#2B2D42" stroke-width="3"/>
    ${svgSoleil(660, 60, 1.2)}
    <!-- Bulle 1, 2, 3 -->
    <g transform="translate(540, 80)">
      <ellipse cx="80" cy="40" rx="80" ry="35" fill="#fff" stroke="#2B2D42" stroke-width="3"/>
      <text x="80" y="55" font-family="Baloo 2" font-size="40" font-weight="800" fill="#2B2D42" text-anchor="middle">1 · 2 · 3 !</text>
      <path d="M30 65 L20 90 L45 75 Z" fill="#fff" stroke="#2B2D42" stroke-width="3" stroke-linejoin="round"/>
    </g>
    <g transform="translate(120, 280)">${svgFromage(0, 0, 0.9)}</g>
    <g transform="translate(340, 250)">${svgFromage(0, 0, 1)}</g>
    <g transform="translate(560, 280)">${svgFromage(0, 0, 0.9)}</g>
    <g transform="translate(290, 200)">${svgMiko(0, 0, 1.1)}</g>
  </svg>`;
}

export function pageMikoPartage(){
  return `<svg viewBox="0 0 800 500" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg-gar" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stop-color="#B3E5FF"/>
        <stop offset="0.5" stop-color="#C6F0E7"/>
        <stop offset="1" stop-color="#A8E6A1"/>
      </linearGradient>
    </defs>
    <rect x="0" y="0" width="800" height="500" fill="url(#bg-gar)"/>
    ${svgSoleil(660, 50, 1.2)}
    <!-- Nuages -->
    <g transform="translate(140, 90)">
      <ellipse cx="40" cy="20" rx="40" ry="18" fill="#fff" stroke="#2B2D42" stroke-width="2.5"/>
      <ellipse cx="20" cy="22" rx="22" ry="14" fill="#fff" stroke="#2B2D42" stroke-width="2.5"/>
      <ellipse cx="60" cy="22" rx="22" ry="14" fill="#fff" stroke="#2B2D42" stroke-width="2.5"/>
    </g>
    <!-- Herbe -->
    ${svgHerbe(50, 380, 1.5)}
    ${svgHerbe(700, 390, 1.5)}
    ${svgHerbe(630, 410, 1.2)}
    <!-- Fleurs -->
    <g transform="translate(20, 350)">${svgFleur(0, 0, 0.6, '#FF6B95')}</g>
    <g transform="translate(710, 360)">${svgFleur(0, 0, 0.6, '#A06CD5')}</g>
    <!-- Coccinelle -->
    <g transform="translate(110, 250)">${svgCoccinelle(0, 0, 0.8)}</g>
    <!-- Nappe pique-nique -->
    <ellipse cx="400" cy="430" rx="260" ry="40" fill="#FF6B6B" stroke="#2B2D42" stroke-width="3"/>
    <path d="M170 425 L630 425" stroke="#fff" stroke-width="3" stroke-dasharray="15 10"/>
    <!-- 3 fromages au milieu -->
    <g transform="translate(220, 350)">${svgFromage(0, 0, 0.7)}</g>
    <g transform="translate(370, 340)">${svgFromage(0, 0, 0.8)}</g>
    <g transform="translate(520, 350)">${svgFromage(0, 0, 0.7)}</g>
    <!-- Miko + 2 amis -->
    <g transform="translate(80, 220)">${svgMiko(0, 0, 0.95)}</g>
    <g transform="translate(320, 195)">${svgAmiSouris(0, 0, 0.85, '#B89D7F')}</g>
    <g transform="translate(560, 220)">${svgAmiSouris(0, 0, 0.95, '#E8C8A0')}</g>
  </svg>`;
}

// Couverture de l'histoire Miko (pour la bibliothèque)
export function svgMikoCover(){
  return `<svg class="cover-svg" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
    <circle cx="100" cy="100" r="95" fill="#FFE9C7" stroke="#2B2D42" stroke-width="3"/>
    <g transform="translate(80, 110) scale(0.55)">${svgFromage(0, 0, 1)}</g>
    <g transform="translate(15, 30) scale(0.7)">${svgMiko(0, 0, 1)}</g>
  </svg>`;
}

/* ============================================================
   HISTOIRES
============================================================ */
export const STORIES = [
  {
    id:'miko', title:'Miko et les trois fromages',
    coverSvg: svgMikoCover(), accent:'#FFD93C',
    pages:[
      {svg: pageMikoDort(), text:'Chut ! La nuit, Miko dort dans son petit trou.'},
      {svg: pageMiko1Fromage(), text:'Oh ! Un fromage sur la table ! Miam !'},
      {svg: pageMiko2Fromages(), text:'Encore un fromage ! Maintenant Miko en a deux.'},
      {svg: pageMiko3Fromages(), text:'Trois fromages ! Un... deux... trois !'},
      {svg: pageMikoPartage(), text:'Miko partage avec ses amis. Quel beau pique-nique !'},
    ]
  },
  {
    id:'lulu', title:'La journée de Lulu', cover:'🐷', accent:'#FF9FB5',
    pages:[
      {scene:'night', character:'🐷', props:['🌙','⭐','🛏️'], text:'Chut ! Lulu dort dans son lit.'},
      {scene:'morning', character:'🐷', props:['🌅','☀️'], text:'Bonjour le soleil ! Lulu se réveille.'},
      {scene:'kitchen', character:'🐷', props:['🥞','🥛','🍓'], text:'Miam ! Lulu mange une crêpe.'},
      {scene:'bathroom', character:'🐷', props:['🪥','💧','🫧'], text:'Frotte, frotte ! Les dents bien propres.'},
      {scene:'garden', character:'🐷', props:['🌸','🌼','🦋'], text:'Hop ! Lulu est prête pour jouer !'},
    ]
  },
  {
    id:'nounours', title:'Nounours au parc', cover:'🐻', accent:'#A8D8A8',
    pages:[
      {scene:'room', character:'🐻', props:['🧥','🧣','👢'], text:'Nounours met son manteau rouge.'},
      {scene:'street', character:'🐻', props:['🌳','🏠','☁️'], text:'Un, deux, un, deux ! On va au parc.'},
      {scene:'park', character:'🐻', props:['🛝','🌳','🌼'], text:'Youpi ! Le grand toboggan !'},
      {scene:'park', character:'🐻🐰', props:['⚽','🌳'], text:'Coucou Lapin ! On joue ensemble ?'},
      {scene:'evening', character:'🐻', props:['🌅','🏠'], text:'Quelle belle journée ! Nounours est content.'},
    ]
  },
  {
    id:'canards', title:'Les petits canards', cover:'🦆', accent:'#A8E0F0',
    pages:[
      {scene:'pond', character:'🦆', props:['🌿','💧','☀️'], text:'Un petit canard sur l\'eau. Coin coin !'},
      {scene:'pond', character:'🦆🦆', props:['🌿','💧'], text:'Voilà un ami ! Maintenant ils sont deux.'},
      {scene:'pond', character:'🦆🦆🦆', props:['🌿','🌸'], text:'Encore un ! Un, deux, trois petits canards !'},
      {scene:'pond', character:'🦆🦆🦆', props:['💕','☀️','🌸'], text:'Trois petits canards heureux ensemble !'},
    ]
  },
  {
    id:'mimi', title:'Mimi et son doudou', cover:'🐱', accent:'#D4B5E8',
    pages:[
      {scene:'room', character:'🐱', props:['❓','🧸'], text:'Où est mon doudou ? Mimi ne le trouve plus !'},
      {scene:'room', character:'🐱', props:['🛏️','🥿'], text:'Sous le lit ? Non, juste un chausson.'},
      {scene:'kitchen', character:'🐱', props:['🍪','🥛'], text:'Dans la cuisine ? Non, juste un biscuit.'},
      {scene:'garden', character:'🐱', props:['🌳','🌷'], text:'Dans le jardin ? Non, juste une fleur.'},
      {scene:'room', character:'🐱🧸', props:['💕','🧺'], text:'Mon doudou ! Il était caché dans le panier !'},
    ]
  },
  {
    id:'poussin', title:'Pilou le poussin', cover:'🐥', accent:'#FFE066',
    pages:[
      {scene:'morning', character:'🐥', props:['🌅','🥚'], text:'Cui cui ! Pilou sort de son œuf ce matin.'},
      {scene:'garden', character:'🐥', props:['🐛','🌼'], text:'Miam, un petit ver de terre pour le petit-déjeuner !'},
      {scene:'garden', character:'🐥🐔', props:['🌸','🦋'], text:'Coucou Maman Poule ! Pilou n\'est plus tout seul.'},
      {scene:'park', character:'🐥', props:['🛝','☁️'], text:'Pilou essaie de voler... pas encore, mais il court très vite !'},
      {scene:'evening', character:'🐥🐔', props:['🌅','🏠'], text:'Le soir, Pilou rentre se blottir contre Maman Poule.'},
    ]
  },
  {
    id:'elephant', title:'Bibi et le grand parapluie', cover:'🐘', accent:'#8ECBE8',
    pages:[
      {scene:'room', character:'🐘', props:['☔','☁️'], text:'Il pleut ! Bibi cherche son parapluie.'},
      {scene:'street', character:'🐘', props:['💧','🏠'], text:'Trouvé ! Un grand parapluie tout rouge.'},
      {scene:'park', character:'🐘🐰', props:['💧','🌳'], text:'Coucou Lapin, viens vite sous mon parapluie !'},
      {scene:'park', character:'🐘🐰', props:['🌈','☀️'], text:'La pluie s\'arrête... un arc-en-ciel apparaît !'},
      {scene:'evening', character:'🐘', props:['🏠','🌅'], text:'Bibi rentre à la maison, tout content de sa journée.'},
    ]
  },
];
