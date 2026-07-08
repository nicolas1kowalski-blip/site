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

function Balloon({ balloon, index, appearing, onPop, btnRefCallback }) {
  return (
    <DwellButton
      ref={btnRefCallback}
      className={`balloon${appearing ? ' appearing' : ''}`}
      aria-label={balloon.item.name}
      onClick={() => onPop(index)}
    >
      <span style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: svgBalloon(balloon.color) }} />
      <span className="balloon-content">{balloon.item.emoji}</span>
    </DwellButton>
  );
}

export default function BalloonsGame({ active }) {
  const [balloonItems, setBalloonItems] = useState([]);
  const [target, setTarget] = useState(null);
  const [appearingIdx, setAppearingIdx] = useState(() => new Set());
  const arenaRef = useRef(null);
  const stageRef = useRef(null);
  const btnRefs = useRef([]);
  const moversRef = useRef([]);
  const animRef = useRef(null);
  const roundTimerRef = useRef(null);
  const celebrate = useCelebrate();

  function stopAnim() {
    if (animRef.current) cancelAnimationFrame(animRef.current);
    animRef.current = null;
  }

  const newRound = useCallback(() => {
    appState.locked = false;
    stopAnim();
    const items = shuffle(BALLOON_POOL).slice(0, 4);
    const colors = shuffle(BALLOON_COLORS).slice(0, 4);
    const newItems = items.map((item, i) => ({ item, color: colors[i] }));
    const newTarget = rand(newItems).item;
    btnRefs.current = [];
    setAppearingIdx(new Set([0, 1, 2, 3]));
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
        btn.style.transform = `translate(${m.x}px, ${m.y}px)`;
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
    const wrap = document.createElement('div');
    wrap.className = 'pop-particles';
    wrap.style.left = cx + 'px';
    wrap.style.top = cy + 'px';
    for (let i = 0; i < 10; i++) {
      const angle = (Math.PI * 2 * i) / 10;
      const dist = 60 + Math.random() * 40;
      const p = document.createElement('span');
      p.style.background = color;
      p.style.setProperty('--tx', Math.cos(angle) * dist + 'px');
      p.style.setProperty('--ty', Math.sin(angle) * dist + 'px');
      wrap.appendChild(p);
    }
    stage.appendChild(wrap);
    setTimeout(() => wrap.remove(), 700);
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
      next[idx] = { item: newItem, color: newColor };
      setAppearingIdx((prevSet) => new Set(prevSet).add(idx));
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
      <div className="stage" ref={stageRef}>
        <div className="balloon-stage" ref={arenaRef}>
          {balloonItems.map((b, idx) => (
            <Balloon
              key={idx}
              balloon={b}
              index={idx}
              appearing={appearingIdx.has(idx)}
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
