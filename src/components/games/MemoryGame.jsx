import React, { useCallback, useEffect, useRef, useState } from 'react';
import DwellButton from '../DwellButton.jsx';
import { appState } from '../../lib/appState.js';
import { COUNT_OBJECTS, PRAISES } from '../../data/games.js';
import { shuffle, rand, speak, successSound, gazeSound } from '../../lib/audio.js';
import { useCelebrate } from '../../context/FeedbackContext.jsx';

const PAIRS = 3; // 3 paires = 6 cartes : doux pour un tout-petit

// Jeu de mémoire : retrouver les deux cartes identiques. La logique de sélection
// s'appuie sur des refs pour rester juste même si l'enfant enchaîne vite les
// cartes (indépendant du timing des re-rendus React).
export default function MemoryGame({ active }) {
  const [cards, setCards] = useState([]);
  const [flipped, setFlipped] = useState([]);
  const [matched, setMatched] = useState(() => new Set());

  const cardsRef = useRef([]);
  const selRef = useRef([]); // indices face visible non encore appariés
  const matchedRef = useRef(new Set());
  const busyRef = useRef(false);
  const timerRef = useRef(null);
  const roundTimerRef = useRef(null);
  const celebrate = useCelebrate();

  const newRound = useCallback(() => {
    clearTimeout(timerRef.current);
    clearTimeout(roundTimerRef.current);
    appState.locked = false;
    busyRef.current = false;
    selRef.current = [];
    matchedRef.current = new Set();
    const chosen = shuffle(COUNT_OBJECTS).slice(0, PAIRS);
    const deck = shuffle([...chosen, ...chosen].map((emoji) => ({ emoji })));
    cardsRef.current = deck;
    setCards(deck);
    setFlipped([]);
    setMatched(new Set());
    setTimeout(() => speak('Trouve les paires !'), 350);
  }, []);

  useEffect(() => {
    newRound();
    return () => {
      clearTimeout(timerRef.current);
      clearTimeout(roundTimerRef.current);
    };
  }, [newRound]);

  function flipCard(i) {
    if (busyRef.current) return;
    if (matchedRef.current.has(i) || selRef.current.includes(i)) return;
    gazeSound();
    selRef.current = [...selRef.current, i];
    setFlipped(selRef.current.slice());
    if (selRef.current.length < 2) return;

    busyRef.current = true;
    appState.locked = true;
    const [a, b] = selRef.current;
    const deck = cardsRef.current;
    if (deck[a].emoji === deck[b].emoji) {
      timerRef.current = setTimeout(() => {
        matchedRef.current = new Set(matchedRef.current).add(a).add(b);
        selRef.current = [];
        setMatched(new Set(matchedRef.current));
        setFlipped([]);
        successSound();
        if (matchedRef.current.size === deck.length) {
          celebrate();
          speak(`Bravo ! ${rand(PRAISES)}`);
          roundTimerRef.current = setTimeout(newRound, 3000);
        } else {
          speak(rand(PRAISES));
          busyRef.current = false;
          appState.locked = false;
        }
      }, 450);
    } else {
      timerRef.current = setTimeout(() => {
        selRef.current = [];
        setFlipped([]);
        busyRef.current = false;
        appState.locked = false;
      }, 1100);
    }
  }

  return (
    <>
      <div className="question">Trouve les paires !</div>
      <div className="memory-grid">
        {cards.map((c, i) => {
          const isUp = flipped.includes(i) || matched.has(i);
          return (
            <DwellButton
              key={i}
              className={`memory-card${isUp ? ' up' : ''}${matched.has(i) ? ' matched' : ''}`}
              aria-label="carte"
              onClick={() => flipCard(i)}
            >
              <div className="memory-inner">
                <div className="memory-face memory-back">⭐</div>
                <div className="memory-face memory-front">{c.emoji}</div>
              </div>
            </DwellButton>
          );
        })}
      </div>
    </>
  );
}
