import { useEffect, useRef } from 'react';
import { appState } from './appState.js';
import { gazeSound, speak } from './audio.js';

// Attache la nomination au regard à un élément DOM déjà existant (utilisé pour
// le contenu SVG injecté via dangerouslySetInnerHTML, où on ne peut pas
// attacher directement des props React). Retourne une fonction de nettoyage.
export function attachGazeSpeakNative(el) {
  let timer = null;
  let cooldown = false;
  const onEnter = () => {
    if (!appState.gazeReadEnabled || cooldown) return;
    const label = el.dataset.label;
    if (!label) return;
    el.classList.add('gazing');
    timer = setTimeout(() => {
      gazeSound();
      speak(label, null, true);
      cooldown = true;
      setTimeout(() => {
        cooldown = false;
      }, 1500);
    }, appState.gazeReadTime);
  };
  const onLeave = () => {
    if (timer) clearTimeout(timer);
    el.classList.remove('gazing');
  };
  // Pointer Events : compatible souris, tactile, stylet et pointeurs des
  // commandes oculaires (voir useDwell pour le détail).
  el.addEventListener('pointerenter', onEnter);
  el.addEventListener('pointerleave', onLeave);
  el.addEventListener('pointercancel', onLeave);
  return () => {
    if (timer) clearTimeout(timer);
    el.removeEventListener('pointerenter', onEnter);
    el.removeEventListener('pointerleave', onLeave);
    el.removeEventListener('pointercancel', onLeave);
  };
}

// Attache la nomination au regard à tous les éléments .speakable contenus
// dans un conteneur (pour du HTML injecté en une fois, ex: une scène SVG).
export function attachGazeSpeakAll(container) {
  if (!container) return () => {};
  const cleanups = Array.from(container.querySelectorAll('.speakable')).map(attachGazeSpeakNative);
  return () => cleanups.forEach((fn) => fn());
}

// Version hook pour un élément rendu directement en JSX.
export function useGazeSpeak(label) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.dataset.label = label || '';
    return attachGazeSpeakNative(el);
  }, [label]);
  return ref;
}
