import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import DwellButton from '../DwellButton.jsx';
import { appState } from '../../lib/appState.js';
import { BALLOON_POOL, BALLOON_COLORS, svgBalloon } from '../../data/games.js';
import { ensureAudio, popSound, rand, shuffle, speak, successSound } from '../../lib/audio.js';
import { useCelebrate } from '../../context/FeedbackContext.jsx';

function randomVel() {
  let v = (Math.random() - 0.5) * 1.5;
  if (Math.abs(v) < 0.35) v = v < 0 ? -0.45 : 0.45;
  return v;
}

function Balloon({ balloon, index, onPop, btnRefCallback }) {
  return (
    <DwellButton
      ref={btnRefCallback}
      className="balloon appearing"
      aria-label={balloon.item.name}
      onClick={() => onPop(index)}
    >
      <span style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: svgBalloon(balloon.color, index) }} />
      <span className="balloon-content">{balloon.item.emoji}</span>
    </DwellButton>
  );
}

export default function BalloonsGame({ active }) {
  const [balloonItems, setBalloonItems] = useState([]);
  const [target, setTarget] = useState(null);
  const arenaRef = useRef(null);
  const stageRef = useRef(null);
  const btnRefs = useRef([]);
  const moversRef = useRef([]);
  const animRef = useRef(null);
  const roundTimerRef = useRef(null);
  const keyRef = useRef(0);
  const celebrate = useCelebrate();

  const nextKey = () => ++keyRef.current;

  function stopAnim() {
    if (animRef.current) cancelAnimationFrame(animRef.current);
    animRef.current = null;
  }

  const newRound = useCallback(() => {
    appState.locked = false;
    stopAnim();
    const items = shuffle(BALLOON_POOL).slice(0, 4);
    const colors = shuffle(BALLOON_COLORS).slice(0, 4);
    const newItems = items.map((item, i) => ({ item, color: colors[i], key: nextKey() }));
    const newTarget = rand(newItems).item;
    btnRefs.current = [];
    setBalloonItems(newItems);
    setTarget(newTarget);
    setTimeout(() => speak(`Trouve ${newTarget.name} !`), 350);
  }, []);

  useEffect(() => {
    newRound();
    return () => {
      stopAnim();
      clearTimeout(roundTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newRound]);

  useLayoutEffect(() => {
    if (!balloonItems.length || !arenaRef.current) return;
    const rect = arenaRef.current.getBoundingClientRect();
    moversRef.current = balloonItems.map((_, idx) => {
      const btn = btnRefs.current[idx];
      const bw = btn?.offsetWidth || 110;
      const bh = btn?.offsetHeight || 150;
      const xZone = idx % 2;
      const yZone = Math.floor(idx / 2);
      const zoneW = Math.max(1, rect.width / 2 - bw);
      const zoneH = Math.max(1, rect.height / 2 - bh);
      const x = xZone * (rect.width / 2) + Math.random() * zoneW;
      const y = yZone * (rect.height / 2) + Math.random() * zoneH;
      if (btn) btn.style.transform = `translate(${x}px, ${y}px)`;
      return { x, y, vx: randomVel(), vy: randomVel() };
    });
    startAnim();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [balloonItems]);

  function startAnim() {
    stopAnim();
    const tick = () => {
      const arena = arenaRef.current;
      if (!arena || !active) {
        animRef.current = null;
        return;
      }
      const rect = arena.getBoundingClientRect();
      moversRef.current.forEach((m, idx) => {
        const btn = btnRefs.current[idx];
        if (!btn || !btn.isConnected) return;
        if (btn.classList.contains('popping')) return;
        const w = btn.offsetWidth;
        const h = btn.offsetHeight;
        m.x += m.vx;
        m.y += m.vy;
        if (m.x < 0) {
          m.x = 0;
          m.vx = Math.abs(m.vx);
        }
        if (m.x > rect.width - w) {
          m.x = rect.width - w;
          m.vx = -Math.abs(m.vx);
        }
        if (m.y < 0) {
          m.y = 0;
          m.vy = Math.abs(m.vy);
        }
        if (m.y > rect.height - h) {
          m.y = rect.height - h;
          m.vy = -Math.abs(m.vy);
        }
        // Sélection au regard : le ballon gonfle et tremble de plus en plus.
        // On compose l'échelle et le tremblement dans le même transform que la
        // position, sinon le transform inline de la physique les écraserait.
        const p = parseFloat(btn.style.getPropertyValue('--dwell-pct')) || 0;
        let sx = 0;
        let sy = 0;
        let scale = 1;
        if (p > 0) {
          const amp = p * p * 5;
          sx = (Math.random() - 0.5) * 2 * amp;
          sy = (Math.random() - 0.5) * 2 * amp;
          scale = 1 + p * 0.2;
        }
        btn.style.transform = `translate(${m.x + sx}px, ${m.y + sy}px) scale(${scale})`;
      });
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
  }

  function spawnParticles(centerEl, color) {
    const stage = stageRef.current;
    if (!stage || !centerEl) return;
    const stageRect = stage.getBoundingClientRect();
    const elRect = centerEl.getBoundingClientRect();
    const cx = elRect.left + elRect.width / 2 - stageRect.left;
    const cy = elRect.top + elRect.height / 2 - stageRect.top;

    // Éclair blanc bref au centre de l'explosion
    const flash = document.createElement('div');
    flash.className = 'pop-flash';
    flash.style.left = cx + 'px';
    flash.style.top = cy + 'px';
    stage.appendChild(flash);
    setTimeout(() => flash.remove(), 340);

    // Onde de choc de la couleur du ballon
    const ring = document.createElement('div');
    ring.className = 'pop-ring';
    ring.style.left = cx + 'px';
    ring.style.top = cy + 'px';
    ring.style.borderColor = color;
    stage.appendChild(ring);
    setTimeout(() => ring.remove(), 500);

    // Gerbe d'éclats : plus nombreux et plus dispersés = vraie explosion
    const wrap = document.createElement('div');
    wrap.className = 'pop-particles';
    wrap.style.left = cx + 'px';
    wrap.style.top = cy + 'px';
    const count = 22;
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
      const dist = 70 + Math.random() * 80;
      const size = 8 + Math.random() * 12;
      const p = document.createElement('span');
      p.className = 'particle-piece ' + (Math.random() < 0.4 ? 'diamond' : 'circle');
      p.style.width = size + 'px';
      p.style.height = size + 'px';
      // Quelques éclats blancs parmi ceux de la couleur du ballon, pour le côté "éclat"
      p.style.background = Math.random() < 0.22 ? '#ffffff' : color;
      p.style.setProperty('--tx', Math.cos(angle) * dist + 'px');
      p.style.setProperty('--ty', Math.sin(angle) * dist + 'px');
      p.style.setProperty('--rot', Math.random() * 540 + 'deg');
      wrap.appendChild(p);
    }
    stage.appendChild(wrap);
    setTimeout(() => wrap.remove(), 850);
  }

  function handlePop(idx) {
    if (appState.locked) return;
    const btn = btnRefs.current[idx];
    if (!btn || btn.classList.contains('popping')) return;
    const balloon = balloonItems[idx];
    const isTarget = balloon.item === target;

    popSound();
    spawnParticles(btn, balloon.color);
    btn.classList.add('popping');

    const item = balloon.item;
    if (isTarget) {
      appState.locked = true;
      successSound();
      const praise = item.sound ? `Bravo ! ${item.name} fait ${item.sound} !` : `Bravo ! C'est ${item.name} !`;
      speak(praise);
      setTimeout(celebrate, 500);
      roundTimerRef.current = setTimeout(newRound, 3000);
    } else {
      const phrase = item.sound ? `${item.name} fait ${item.sound}` : `C'est ${item.name}`;
      speak(phrase);
      setTimeout(() => replaceBalloon(idx), 700);
    }
  }

  function replaceBalloon(idx) {
    setBalloonItems((prev) => {
      const usedItems = prev.filter((_, i) => i !== idx).map((b) => b.item);
      const available = BALLOON_POOL.filter((it) => !usedItems.includes(it) && it !== target);
      if (available.length === 0) return prev;
      const newItem = rand(available);
      const newColor = rand(BALLOON_COLORS);
      const next = prev.slice();
      // Nouvelle clé => React recrée un nœud tout neuf pour ce ballon : plus de
      // classe "popping" résiduelle (qui le figeait et le rendait incliquable)
      // et l'animation d'apparition se rejoue.
      next[idx] = { item: newItem, color: newColor, key: nextKey() };
      const mover = moversRef.current[idx];
      if (mover) {
        mover.vx = randomVel();
        mover.vy = randomVel();
      }
      return next;
    });
  }

  useEffect(() => {
    ensureAudio();
  }, []);

  return (
    <>
      <div className="question">{target ? `Trouve ${target.name} !` : ''}</div>
      <div className="stage balloon-sky" ref={stageRef}>
        <div className="balloon-stage" ref={arenaRef}>
          <span className="balloon-cloud" aria-hidden="true">☁️</span>
          <span className="balloon-cloud" aria-hidden="true">☁️</span>
          <span className="balloon-cloud" aria-hidden="true">☁️</span>
          {balloonItems.map((b, idx) => (
            <Balloon
              key={b.key}
              balloon={b}
              index={idx}
              onPop={handlePop}
              btnRefCallback={(node) => {
                btnRefs.current[idx] = node;
                if (node) {
                  const preserved = moversRef.current[idx];
                  if (preserved) node.style.transform = `translate(${preserved.x}px, ${preserved.y}px)`;
                }
              }}
            />
          ))}
        </div>
      </div>
    </>
  );
}
