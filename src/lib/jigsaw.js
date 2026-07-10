// Génère de vraies pièces de puzzle qui s'emboîtent (tenons/mortaises).
// Chaque bord intérieur partagé entre deux pièces est échantillonné de façon
// identique (mêmes points), garantissant un emboîtement parfait. Les chemins
// sont exprimés dans l'espace de l'image source (viewBox 0..size).

const TAB = 0.22; // hauteur du tenon en fraction de la longueur du bord
const SAMPLES = 18;

function edgePoints(p0, p1, sign, qx, qy) {
  if (sign === 0) return [p0, p1];
  const dx = p1[0] - p0[0];
  const dy = p1[1] - p0[1];
  const L = Math.hypot(dx, dy);
  const pts = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const t = i / SAMPLES;
    let perp = 0;
    if (t > 0.34 && t < 0.66) {
      const u = (t - 0.34) / 0.32;
      perp = sign * TAB * L * 0.5 * (1 - Math.cos(2 * Math.PI * u));
    }
    pts.push([p0[0] + dx * t + qx * perp, p0[1] + dy * t + qy * perp]);
  }
  return pts;
}

const rev = (a) => a.slice().reverse();

export function generateJigsaw(cols, rows, size) {
  const cw = size / cols;
  const ch = size / rows;

  const vSign = []; // bord vertical à droite de la cellule (r,c), c ∈ 0..cols-2
  const hSign = []; // bord horizontal sous la cellule (r,c), r ∈ 0..rows-2
  for (let r = 0; r < rows; r++) {
    vSign[r] = [];
    for (let c = 0; c < cols - 1; c++) vSign[r][c] = Math.random() < 0.5 ? -1 : 1;
  }
  for (let r = 0; r < rows - 1; r++) {
    hSign[r] = [];
    for (let c = 0; c < cols; c++) hSign[r][c] = Math.random() < 0.5 ? -1 : 1;
  }

  const pieces = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x0 = c * cw;
      const y0 = r * ch;
      const x1 = x0 + cw;
      const y1 = y0 + ch;
      const TL = [x0, y0];
      const TR = [x1, y0];
      const BR = [x1, y1];
      const BL = [x0, y1];

      const topS = r === 0 ? 0 : hSign[r - 1][c];
      const botS = r === rows - 1 ? 0 : hSign[r][c];
      const leftS = c === 0 ? 0 : vSign[r][c - 1];
      const rightS = c === cols - 1 ? 0 : vSign[r][c];

      // Sens canonique : horizontal gauche→droite (q=bas) ; vertical haut→bas (q=droite).
      const top = edgePoints(TL, TR, topS, 0, 1);
      const right = edgePoints(TR, BR, rightS, 1, 0);
      const bottom = rev(edgePoints(BL, BR, botS, 0, 1)); // parcours BR→BL
      const left = rev(edgePoints(TL, BL, leftS, 1, 0)); // parcours BL→TL

      const ring = [];
      top.forEach((p) => ring.push(p));
      right.slice(1).forEach((p) => ring.push(p));
      bottom.slice(1).forEach((p) => ring.push(p));
      left.slice(1, -1).forEach((p) => ring.push(p));

      const d = 'M' + ring.map((p) => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(' L') + ' Z';

      const m = TAB * Math.max(cw, ch) + 2;
      pieces.push({
        id: `${r}-${c}`,
        row: r,
        col: c,
        d,
        bbox: { x: x0 - m, y: y0 - m, w: cw + 2 * m, h: ch + 2 * m },
        homeCx: x0 + cw / 2,
        homeCy: y0 + ch / 2,
      });
    }
  }
  return pieces;
}
