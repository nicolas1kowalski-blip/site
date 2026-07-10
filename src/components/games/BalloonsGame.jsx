import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import DwellButton from '../DwellButton.jsx';
import { appState } from '../../lib/appState.js';
import { BALLOON_POOL, BALLOON_COLORS } from '../../data/games.js';
import { ensureAudio, popSound, rand, shuffle, speak, successSound } from '../../lib/audio.js';
import { useCelebrate } from '../../context/FeedbackContext.jsx';
import { Balloon3DScene, BALLOON_W, BALLOON_H } from '../../lib/balloon3d.js';

// Vitesse en px/seconde (le mouvement est intégré avec le delta temps réel).
function randomVel() {
  let v = (Math.random() - 0.5) * 150;
  if (Math.abs(v) < 45) v = v < 0 ? -55 : 55;
  return v;
}

export default function BalloonsGame({ active }) {
  const [balloonItems, setBalloonItems] = useState([]);
  const [target, setTarget] = useState(null);

  const stageRef = useRef(null);
  const arenaRef = useRef(null);
  const canvasRef = useRef(null);
  const btnRefs = useRef([]);
  const moversRef = useRef([]);
  const sceneRef = useRef(null);
  const rafRef = useRef(null);
  const lastTRef = useRef(0);
  const roundTimerRef = useRef(null);
  const keyRef = useRef(0);

  // Miroirs pour la boucle de rendu (évite les fermetures périmées).
  const itemsRef = useRef([]);
  const targetRef = useRef(null);
  const activeRef = useRef(active);
  itemsRef.current = balloonItems;
  targetRef.current = target;
  activeRef.current = active;

  const celebrate = useCelebrate();
  const nextKey = () => ++keyRef.current;

  const newRound = useCallback(() => {
    appState.locked = false;
    const items = shuffle(BALLOON_POOL).slice(0, 4);
    const colors = shuffle(BALLOON_COLORS).slice(0, 4);
    const newItems = items.map((item, i) => ({ item, color: colors[i], key: nextKey() }));
    const newTarget = rand(newItems).item;
    setBalloonItems(newItems);
    setTarget(newTarget);
    setTimeout(() => speak(`Trouve ${newTarget.name} !`), 350);
  }, []);

  // --- Initialisation de la scène three.js (une seule fois) ---
  useEffect(() => {
    ensureAudio();
    const scene = new Balloon3DScene(canvasRef.current);
    sceneRef.current = scene;

    const resize = () => {
      const el = arenaRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      scene.setSize(r.width, r.height);
    };
    resize();
    const ro = new ResizeObserver(resize);
    if (arenaRef.current) ro.observe(arenaRef.current);

    const loop = (now) => {
      rafRef.current = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - lastTRef.current) / 1000 || 0);
      lastTRef.current = now;
      if (!activeRef.current) return;
      const arena = arenaRef.current;
      if (!arena) return;
      const rect = arena.getBoundingClientRect();
      if (rect.width < 2) return;

      const dwell = [];
      for (let i = 0; i < moversRef.current.length; i++) {
        const m = moversRef.current[i];
        const btn = btnRefs.current[i];
        if (!m) {
          dwell[i] = 0;
          continue;
        }
        m.x += m.vx * dt;
        m.y += m.vy * dt;
        if (m.x < 0) { m.x = 0; m.vx = Math.abs(m.vx); }
        if (m.x > rect.width - BALLOON_W) { m.x = rect.width - BALLOON_W; m.vx = -Math.abs(m.vx); }
        if (m.y < 0) { m.y = 0; m.vy = Math.abs(m.vy); }
        if (m.y > rect.height - BALLOON_H) { m.y = rect.height - BALLOON_H; m.vy = -Math.abs(m.vy); }
        if (btn) btn.style.transform = `translate(${m.x}px, ${m.y}px)`;
        dwell[i] = btn ? parseFloat(btn.style.getPropertyValue('--dwell-pct')) || 0 : 0;
      }
      scene.update(moversRef.current, dwell, dt, now / 1000);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      clearTimeout(roundTimerRef.current);
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  // Premier round au montage.
  useEffect(() => {
    newRound();
  }, [newRound]);

  // Positions : on ne (ré)assigne que les emplacements dont le ballon a changé
  // (nouvelle clé), pour ne pas téléporter les ballons inchangés.
  useLayoutEffect(() => {
    const el = arenaRef.current;
    if (!el || !balloonItems.length) return;
    const rect = el.getBoundingClientRect();
    const w = rect.width || 600;
    const h = rect.height || 400;
    balloonItems.forEach((b, idx) => {
      const existing = moversRef.current[idx];
      if (existing && existing.key === b.key) return;
      const xZone = idx % 2;
      const yZone = Math.floor(idx / 2);
      const zoneW = Math.max(1, w / 2 - BALLOON_W);
      const zoneH = Math.max(1, h / 2 - BALLOON_H);
      moversRef.current[idx] = {
        x: xZone * (w / 2) + Math.random() * zoneW,
        y: yZone * (h / 2) + Math.random() * zoneH,
        vx: randomVel(),
        vy: randomVel(),
        key: b.key,
      };
    });
    moversRef.current.length = balloonItems.length;
  }, [balloonItems]);

  // Synchronise les maillages 3D avec l'état (création/remplacement par clé).
  useEffect(() => {
    if (!sceneRef.current) return;
    sceneRef.current.sync(
      balloonItems.map((b) => ({ key: b.key, colorHex: b.color, emoji: b.item.emoji }))
    );
  }, [balloonItems]);

  function handlePop(idx) {
    if (appState.locked) return;
    const btn = btnRefs.current[idx];
    // Déjà éclaté (en attente de remplacement) : on ignore un second déclenchement.
    if (btn && btn.style.pointerEvents === 'none') return;
    const item = itemsRef.current[idx];
    if (!item) return;
    const isTarget = item.item === targetRef.current;

    if (btn) btn.style.pointerEvents = 'none';
    popSound();
    if (sceneRef.current) sceneRef.current.explode(idx);

    if (isTarget) {
      appState.locked = true;
      successSound();
      const praise = item.item.sound
        ? `Bravo ! ${item.item.name} fait ${item.item.sound} !`
        : `Bravo ! C'est ${item.item.name} !`;
      speak(praise);
      setTimeout(celebrate, 500);
      roundTimerRef.current = setTimeout(newRound, 3000);
    } else {
      const phrase = item.item.sound
        ? `${item.item.name} fait ${item.item.sound}`
        : `C'est ${item.item.name}`;
      speak(phrase);
      setTimeout(() => replaceBalloon(idx), 700);
    }
  }

  function replaceBalloon(idx) {
    setBalloonItems((prev) => {
      const usedItems = prev.filter((_, i) => i !== idx).map((b) => b.item);
      const available = BALLOON_POOL.filter((it) => !usedItems.includes(it) && it !== targetRef.current);
      if (available.length === 0) return prev;
      const next = prev.slice();
      next[idx] = { item: rand(available), color: rand(BALLOON_COLORS), key: nextKey() };
      return next;
    });
  }

  return (
    <>
      <div className="question">{target ? `Trouve ${target.name} !` : ''}</div>
      <div className="stage balloon-sky" ref={stageRef}>
        <div className="balloon-stage" ref={arenaRef}>
          <span className="balloon-cloud" aria-hidden="true">☁️</span>
          <span className="balloon-cloud" aria-hidden="true">☁️</span>
          <span className="balloon-cloud" aria-hidden="true">☁️</span>
          <canvas className="balloon-canvas" ref={canvasRef} />
          {balloonItems.map((b, idx) => (
            <DwellButton
              key={b.key}
              ref={(node) => {
                btnRefs.current[idx] = node;
                const m = moversRef.current[idx];
                if (node && m) node.style.transform = `translate(${m.x}px, ${m.y}px)`;
              }}
              className="balloon-hit"
              style={{ width: BALLOON_W, height: BALLOON_H }}
              aria-label={b.item.name}
              onClick={() => handlePop(idx)}
            />
          ))}
        </div>
      </div>
    </>
  );
}
