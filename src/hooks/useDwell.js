import { useCallback, useEffect, useRef } from 'react';
import { appState } from '../lib/appState.js';

// Reproduit le "clic au survol" (commande oculaire) : rester un certain temps
// sur un élément déclenche automatiquement son activation. Le retour visuel se
// fait par l'objet lui-même qui grandit et tremble de plus en plus (voir la
// règle .dwell-active dans le CSS), plutôt que par un anneau/carré en overlay.
// Pendant le survol, on écrit trois variables CSS sur l'élément :
//   --dwell-pct   progression 0 → 1 (pilote l'agrandissement + la lueur)
//   --dwell-sx    décalage de tremblement horizontal (px), amplitude ∝ pct
//   --dwell-sy    décalage de tremblement vertical (px)
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
      el.style.setProperty('--dwell-pct', 0);
      el.style.setProperty('--dwell-sx', '0px');
      el.style.setProperty('--dwell-sy', '0px');
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
      // Le tremblement s'intensifie de façon quadratique : imperceptible au
      // début, bien visible juste avant l'activation ("ça va éclater").
      const amp = pct * pct * 4;
      el.style.setProperty('--dwell-pct', pct);
      el.style.setProperty('--dwell-sx', (Math.random() - 0.5) * 2 * amp + 'px');
      el.style.setProperty('--dwell-sy', (Math.random() - 0.5) * 2 * amp + 'px');
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
