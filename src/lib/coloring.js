// Coloriage « pot de peinture » : remplissage par diffusion (flood fill) d'une
// région délimitée par les traits noirs du dessin, plus des textures pour les
// couleurs à paillettes et à motifs.

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// --- Génération des tuiles (couleurs simples / paillettes / motifs) ---
const tileCache = new Map();

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function drawStar(ctx, cx, cy, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const ang = (Math.PI / 5) * i - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.45;
    ctx[i === 0 ? 'moveTo' : 'lineTo'](cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

function drawHeart(ctx, cx, cy, s, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx, cy + s * 0.3);
  ctx.bezierCurveTo(cx + s, cy - s * 0.5, cx + s * 0.5, cy - s, cx, cy - s * 0.35);
  ctx.bezierCurveTo(cx - s * 0.5, cy - s, cx - s, cy - s * 0.5, cx, cy + s * 0.3);
  ctx.closePath();
  ctx.fill();
}

// Construit la tuile (canvas) correspondant à une entrée de palette.
function buildTileCanvas(spec) {
  if (spec.type === 'rainbow') {
    const w = 160;
    const c = makeCanvas(w, 24);
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, w, 0);
    const stops = ['#FF5252', '#FF9800', '#FFEB3B', '#66BB6A', '#29B6F6', '#7E57C2', '#EC407A'];
    stops.forEach((col, i) => g.addColorStop(i / (stops.length - 1), col));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, 24);
    return c;
  }
  if (spec.type === 'glitter') {
    const s = 72;
    const c = makeCanvas(s, s);
    const ctx = c.getContext('2d');
    ctx.fillStyle = spec.base;
    ctx.fillRect(0, 0, s, s);
    // voile lumineux diagonal
    const g = ctx.createLinearGradient(0, 0, s, s);
    g.addColorStop(0, 'rgba(255,255,255,0.45)');
    g.addColorStop(0.5, 'rgba(255,255,255,0)');
    g.addColorStop(1, 'rgba(255,255,255,0.3)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    // paillettes
    let seed = spec.id.length * 997 + 13;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let i = 0; i < 90; i++) {
      const x = rnd() * s;
      const y = rnd() * s;
      const r = 0.6 + rnd() * 1.8;
      ctx.fillStyle = rnd() > 0.5 ? spec.spark : '#ffffff';
      ctx.globalAlpha = 0.4 + rnd() * 0.6;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    return c;
  }
  if (spec.type === 'pattern') {
    const s = 48;
    const c = makeCanvas(s, s);
    const ctx = c.getContext('2d');
    ctx.fillStyle = spec.bg;
    ctx.fillRect(0, 0, s, s);
    if (spec.pattern === 'dots') {
      ctx.fillStyle = spec.fg;
      for (const [x, y] of [[12, 12], [36, 12], [24, 24], [12, 36], [36, 36], [0, 24], [48, 24]]) {
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (spec.pattern === 'stripes') {
      ctx.strokeStyle = spec.fg;
      ctx.lineWidth = 8;
      for (let o = -s; o < s * 2; o += 20) {
        ctx.beginPath();
        ctx.moveTo(o, 0);
        ctx.lineTo(o + s, s);
        ctx.stroke();
      }
    } else if (spec.pattern === 'stars') {
      drawStar(ctx, 12, 12, 9, spec.fg);
      drawStar(ctx, 36, 36, 9, spec.fg);
    } else if (spec.pattern === 'hearts') {
      drawHeart(ctx, 13, 15, 9, spec.fg);
      drawHeart(ctx, 37, 39, 9, spec.fg);
    }
    return c;
  }
  // solide
  const c = makeCanvas(1, 1);
  const ctx = c.getContext('2d');
  ctx.fillStyle = spec.color;
  ctx.fillRect(0, 0, 1, 1);
  return c;
}

function getTile(spec) {
  if (tileCache.has(spec.id)) return tileCache.get(spec.id);
  const canvas = buildTileCanvas(spec);
  const ctx = canvas.getContext('2d');
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const tile = { data: img.data, w: canvas.width, h: canvas.height, canvas };
  tileCache.set(spec.id, tile);
  return tile;
}

// Aperçu (canvas) pour afficher la pastille de couleur dans la palette.
export function paletteSwatchCanvas(spec, size = 64) {
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  if (spec.type === 'solid' || !spec.type) {
    ctx.fillStyle = spec.color;
    ctx.fillRect(0, 0, size, size);
  } else {
    const tile = getTile(spec);
    const pat = ctx.createPattern(tile.canvas, 'repeat');
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, size, size);
  }
  return c.toDataURL();
}

// Fonction de remplissage : renvoie [r,g,b] pour un pixel donné (x,y).
export function makeFiller(spec) {
  if (spec.type === 'solid' || !spec.type) {
    const rgb = hexToRgb(spec.color);
    return () => rgb;
  }
  const tile = getTile(spec);
  const { data, w, h } = tile;
  return (x, y) => {
    const i = (((y % h) + h) % h) * w * 4 + (((x % w) + w) % w) * 4;
    return [data[i], data[i + 1], data[i + 2]];
  };
}

// Remplissage par diffusion à partir de (sx, sy) sur une ImageData.
// filler(x, y) -> [r,g,b]. On ne remplit pas si on démarre sur un trait noir.
export function floodFill(img, sx, sy, filler, tol = 62) {
  const { width: w, height: h, data } = img;
  sx |= 0;
  sy |= 0;
  if (sx < 0 || sy < 0 || sx >= w || sy >= h) return 0;
  const si = (sy * w + sx) * 4;
  const sr = data[si];
  const sg = data[si + 1];
  const sb = data[si + 2];
  if (0.299 * sr + 0.587 * sg + 0.114 * sb < 95) return 0; // trait : on ne remplit pas
  const t2 = tol * tol;
  const matches = (i) => {
    const dr = data[i] - sr;
    const dg = data[i + 1] - sg;
    const db = data[i + 2] - sb;
    return dr * dr + dg * dg + db * db <= t2;
  };
  const seen = new Uint8Array(w * h);
  const stack = [sx, sy];
  let filled = 0;
  while (stack.length) {
    const y = stack.pop();
    const x = stack.pop();
    const base = y * w;
    if (seen[base + x]) continue;
    let l = x;
    while (l > 0 && !seen[base + l - 1] && matches((base + l - 1) * 4)) l--;
    let r = x;
    while (r < w - 1 && !seen[base + r + 1] && matches((base + r + 1) * 4)) r++;
    for (let ix = l; ix <= r; ix++) {
      const p = base + ix;
      if (seen[p]) continue;
      seen[p] = 1;
      const c = filler(ix, y);
      const pi = p * 4;
      data[pi] = c[0];
      data[pi + 1] = c[1];
      data[pi + 2] = c[2];
      data[pi + 3] = 255;
      filled++;
      if (y > 0) {
        const up = p - w;
        if (!seen[up] && matches(up * 4)) stack.push(ix, y - 1);
      }
      if (y < h - 1) {
        const dn = p + w;
        if (!seen[dn] && matches(dn * 4)) stack.push(ix, y + 1);
      }
    }
  }
  return filled;
}
