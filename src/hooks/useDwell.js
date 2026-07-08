import { useCallback, useEffect, useRef } from 'react';
import { appState } from '../lib/appState.js';

// Reproduit le "clic au survol" (commande oculaire) : rester un certain temps
// sur un élément déclenche automatiquement son activation, avec un anneau de
// progression visuel (voir .dwell-ring dans le CSS). Usage :
//   const dwell = useDwell(handleClick);
//   <button ref={dwell.ref} onMouseEnter={dwell.onMouseEnter} onMouseLeave={dwell.onMouseLeave}
//           onPointerDown={dwell.onPointerDown} onClick={handleClick}><div className="dwell-ring"/></button>
export function useDwell(onActivate, disabled = false) {
  const elRef = useRef(null);
  const timerRef = useRef(null);
  const rafRef = useRef(null);
  const onActivateRef = useRef(onActivate);
  onActivateRef.current = onActivate;

  const end = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    timerRef.current = null;
    rafRef.current = null;
    const el = elRef.current;
    if (el) {
      el.classList.remove('dwell-active');
      el.style.setProperty('--dwell-deg', '0deg');
    }
  }, []);

  const begin = useCallback(() => {
    if (!appState.dwellEnabled || appState.locked || disabled) return;
    const el = elRef.current;
    if (!el) return;
    el.classList.add('dwell-active');
    const startT = performance.now();
    const tick = () => {
      const elapsed = performance.now() - startT;
      const pct = Math.min(elapsed / appState.dwellTime, 1);
      el.style.setProperty('--dwell-deg', pct * 360 + 'deg');
      if (pct < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    timerRef.current = setTimeout(() => {
      end();
      onActivateRef.current?.();
    }, appState.dwellTime);
  }, [disabled, end]);

  useEffect(() => () => end(), [end]);

  return { ref: elRef, onMouseEnter: begin, onMouseLeave: end, onPointerDown: end };
}
