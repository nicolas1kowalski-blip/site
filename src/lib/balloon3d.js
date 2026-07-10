import * as THREE from 'three';

// Taille nominale (px) d'un ballon = celle de sa zone de clic DOM. Le maillage
// 3D et la zone de clic transparente partagent ces dimensions et la même
// position, de sorte que la commande oculaire (clic au survol sur le DOM)
// reste parfaitement alignée sur le ballon rendu en WebGL.
export const BALLOON_W = 104;
export const BALLOON_H = 150;

const UNIT = 108; // échelle px du maillage (largeur ballon ≈ 0.86 * UNIT)

// Profil (rayon, hauteur) tourné autour de l'axe Y → forme de ballon.
const PROFILE = [
  [0.001, 0.62],
  [0.16, 0.58],
  [0.30, 0.46],
  [0.4, 0.26],
  [0.43, 0.02],
  [0.4, -0.2],
  [0.3, -0.38],
  [0.16, -0.5],
  [0.06, -0.58],
  [0.001, -0.61],
].map(([r, y]) => new THREE.Vector2(r, y));

function easeOutBack(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function makeEmojiTexture(emoji) {
  const s = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, s, s);
  ctx.font = '92px "Segoe UI Emoji","Noto Color Emoji","Apple Color Emoji",sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, s / 2, s / 2 + 4);
  const tex = new THREE.CanvasTexture(cv);
  tex.anisotropy = 4;
  return tex;
}

function buildBalloon(colorHex, emoji) {
  const group = new THREE.Group();
  const color = new THREE.Color(colorHex);

  const body = new THREE.Mesh(
    new THREE.LatheGeometry(PROFILE, 48),
    new THREE.MeshPhongMaterial({
      color,
      // Une touche d'émissif garde des couleurs vives et joyeuses malgré
      // l'éclairage ; un spéculaire plus serré donne un petit reflet net
      // (au lieu d'une grosse tache blanche).
      emissive: color.clone().multiplyScalar(0.22),
      shininess: 130,
      specular: new THREE.Color(0x8a8a8a),
    })
  );
  body.scale.setScalar(UNIT);
  group.add(body);

  const knot = new THREE.Mesh(
    new THREE.SphereGeometry(0.055, 12, 12),
    new THREE.MeshPhongMaterial({ color: color.clone().multiplyScalar(0.7) })
  );
  knot.scale.setScalar(UNIT);
  knot.position.y = -0.63 * UNIT;
  group.add(knot);

  const pts = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    pts.push(new THREE.Vector3(Math.sin(t * 7) * 4, (-0.63 - t * 0.32) * UNIT, 0));
  }
  const string = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({ color: 0x2b2d42 })
  );
  group.add(string);

  const spr = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: makeEmojiTexture(emoji), transparent: true, depthTest: false, depthWrite: false })
  );
  spr.scale.setScalar(58);
  spr.position.set(0, 8, 60);
  spr.renderOrder = 999;
  group.add(spr);

  group.userData = { body, spr, spawnT: 0, phase: Math.random() * Math.PI * 2 };
  return group;
}

export class Balloon3DScene {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 4000);
    this.camera.position.z = 1200;

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.95));
    const key = new THREE.DirectionalLight(0xffffff, 0.7);
    key.position.set(-0.6, 1, 1.2);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.22);
    fill.position.set(1, -0.4, 0.6);
    this.scene.add(fill);

    this.slots = [null, null, null, null];
    this.fragments = [];
    this.w = 1;
    this.h = 1;
  }

  setSize(w, h) {
    if (w < 2 || h < 2) return;
    this.w = w;
    this.h = h;
    this.renderer.setSize(w, h, false);
    this.camera.left = -w / 2;
    this.camera.right = w / 2;
    this.camera.top = h / 2;
    this.camera.bottom = -h / 2;
    this.camera.updateProjectionMatrix();
  }

  // items : [{ key, colorHex, emoji }] indexé par emplacement (0..3).
  sync(items) {
    for (let i = 0; i < 4; i++) {
      const it = items[i];
      const slot = this.slots[i];
      if (!it) {
        if (slot) {
          this._dispose(slot.group);
          this.slots[i] = null;
        }
        continue;
      }
      if (slot && slot.key === it.key) continue;
      if (slot) this._dispose(slot.group);
      const group = buildBalloon(it.colorHex, it.emoji);
      this.scene.add(group);
      this.slots[i] = { key: it.key, group, colorHex: new THREE.Color(it.colorHex).getHex() };
    }
  }

  _dispose(obj) {
    this.scene.remove(obj);
    obj.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        if (o.material.map) o.material.map.dispose();
        o.material.dispose();
      }
    });
  }

  explode(idx) {
    const slot = this.slots[idx];
    if (!slot) return;
    slot.group.visible = false;
    const pos = slot.group.position.clone();
    const N = 26;
    for (let i = 0; i < N; i++) {
      const size = 5 + Math.random() * 11;
      const white = Math.random() < 0.2;
      const mat = new THREE.MeshPhongMaterial({
        color: white ? 0xffffff : slot.colorHex,
        shininess: 60,
        transparent: true,
        opacity: 1,
      });
      const mesh = new THREE.Mesh(new THREE.TetrahedronGeometry(size), mat);
      mesh.position.copy(pos);
      const ang = Math.random() * Math.PI * 2;
      const speed = 200 + Math.random() * 340;
      this.fragments.push({
        mesh,
        mat,
        vx: Math.cos(ang) * speed,
        vy: Math.sin(ang) * speed * 0.7 + (80 + Math.random() * 240),
        vz: (Math.random() - 0.5) * 620,
        avx: (Math.random() - 0.5) * 14,
        avy: (Math.random() - 0.5) * 14,
        avz: (Math.random() - 0.5) * 14,
        life: 0.85 + Math.random() * 0.35,
      });
      this.scene.add(mesh);
    }
  }

  // movers : [{x, y}] coin haut-gauche px ; dwell : [pct] ; dt & t en secondes.
  update(movers, dwell, dt, t) {
    const halfW = this.w / 2;
    const halfH = this.h / 2;
    for (let i = 0; i < 4; i++) {
      const slot = this.slots[i];
      const m = movers[i];
      if (!slot || !m) continue;
      const g = slot.group;
      if (!g.visible) continue;

      const p = dwell[i] || 0;
      if (g.userData.spawnT < 1) {
        g.userData.spawnT = Math.min(1, g.userData.spawnT + dt / 0.42);
      }
      const spawn = easeOutBack(g.userData.spawnT);

      let jx = 0;
      let jy = 0;
      if (p > 0) {
        const amp = p * p * 7;
        jx = (Math.random() - 0.5) * 2 * amp;
        jy = (Math.random() - 0.5) * 2 * amp;
      }
      const cx = m.x + BALLOON_W / 2;
      const cy = m.y + BALLOON_H / 2;
      const bob = Math.sin(t * 2 + g.userData.phase) * 4;
      g.position.set(cx - halfW + jx, halfH - cy + jy + bob, 0);
      g.scale.setScalar(spawn * (1 + p * 0.28));
      g.rotation.z = Math.sin(t * 1.4 + g.userData.phase) * 0.11 + (p > 0 ? (Math.random() - 0.5) * p * 0.3 : 0);
      g.rotation.y = Math.sin(t * 0.6 + g.userData.phase) * 0.28;
    }

    for (let i = this.fragments.length - 1; i >= 0; i--) {
      const f = this.fragments[i];
      f.life -= dt;
      if (f.life <= 0) {
        this.scene.remove(f.mesh);
        f.mesh.geometry.dispose();
        f.mat.dispose();
        this.fragments.splice(i, 1);
        continue;
      }
      f.vy -= 1000 * dt; // gravité (monde y vers le haut)
      f.mesh.position.x += f.vx * dt;
      f.mesh.position.y += f.vy * dt;
      f.mesh.position.z += f.vz * dt;
      f.mesh.rotation.x += f.avx * dt;
      f.mesh.rotation.y += f.avy * dt;
      f.mesh.rotation.z += f.avz * dt;
      f.mat.opacity = Math.max(0, Math.min(1, f.life / 0.4));
      f.mesh.scale.setScalar(Math.max(0.15, 1 + f.mesh.position.z * 0.0007));
    }

    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.slots.forEach((s) => s && this._dispose(s.group));
    this.slots = [null, null, null, null];
    this.fragments.forEach((f) => {
      this.scene.remove(f.mesh);
      f.mesh.geometry.dispose();
      f.mat.dispose();
    });
    this.fragments = [];
    this.renderer.dispose();
  }
}
