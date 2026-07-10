import React, { useCallback, useEffect, useRef, useState } from 'react';
import DwellButton from '../DwellButton.jsx';
import { appState } from '../../lib/appState.js';
import { PRAISES, ENCOURAGE } from '../../data/games.js';
import { shuffle, pickN, rand, speak, successSound, wrongSound } from '../../lib/audio.js';
import { useCelebrate } from '../../context/FeedbackContext.jsx';

const FAMILIES = [
  { name: 'les animaux', items: ['🐶', '🐱', '🐰', '🐻', '🦊', '🐸', '🐷', '🦁', '🐴', '🐔', '🐢'] },
  { name: 'les fruits', items: ['🍎', '🍌', '🍓', '🍇', '🍐', '🍊', '🍒', '🍉', '🍑'] },
  { name: 'les véhicules', items: ['🚗', '🚌', '🚂', '✈️', '🚀', '🚲', '⛵', '🚁'] },
];

// Range par famille : « Regarde tous les animaux » — l'enfant sélectionne les
// éléments de la bonne catégorie parmi un mélange.
export default function FamiliesGame({ active }) {
  const [round, setRound] = useState(null);
  const [found, setFound] = useState(() => new Set());
  const [shakeIdx, setShakeIdx] = useState(null);
  const timerRef = useRef(null);
  const celebrate = useCelebrate();

  const newRound = useCallback(() => {
    clearTimeout(timerRef.current);
    appState.locked = false;
    setFound(new Set());
    setShakeIdx(null);
    const target = rand(FAMILIES);
    const others = FAMILIES.filter((f) => f !== target).flatMap((f) => f.items);
    const targetItems = pickN(target.items, 3);
    const distractors = pickN(others, 3);
    const items = shuffle([
      ...targetItems.map((emoji) => ({ emoji, isTarget: true })),
      ...distractors.map((emoji) => ({ emoji, isTarget: false })),
    ]);
    setRound({ target, items, targetCount: targetItems.length });
    setTimeout(() => speak(`Regarde tous ${target.name} !`), 350);
  }, []);

  useEffect(() => {
    newRound();
    return () => clearTimeout(timerRef.current);
  }, [newRound]);

  if (!round) return null;

  function pick(i) {
    if (appState.locked || found.has(i)) return;
    const it = round.items[i];
    if (it.isTarget) {
      successSound();
      const nextFound = new Set(found);
      nextFound.add(i);
      setFound(nextFound);
      if (nextFound.size === round.targetCount) {
        appState.locked = true;
        celebrate();
        speak(`Bravo ! Tu as trouvé tous ${round.target.name} !`);
        timerRef.current = setTimeout(newRound, 3000);
      } else {
        speak(rand(PRAISES));
      }
    } else {
      wrongSound();
      setShakeIdx(i);
      speak(rand(ENCOURAGE));
      setTimeout(() => setShakeIdx(null), 600);
    }
  }

  return (
    <>
      <div className="question">
        Regarde tous <strong>{round.target.name}</strong> !
      </div>
      <div className="sort-grid">
        {round.items.map((it, i) => (
          <DwellButton
            key={i}
            className={`sort-item${found.has(i) ? ' found' : ''}${shakeIdx === i ? ' shake' : ''}`}
            aria-label="objet"
            onClick={() => pick(i)}
          >
            <span className="sort-emoji">{it.emoji}</span>
            {found.has(i) && <span className="sort-check">✓</span>}
          </DwellButton>
        ))}
      </div>
    </>
  );
}
