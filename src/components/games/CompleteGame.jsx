import React, { useCallback, useEffect, useRef, useState } from 'react';
import DwellButton from '../DwellButton.jsx';
import { appState } from '../../lib/appState.js';
import { JIGSAW_PUZZLES, PRAISES, ENCOURAGE } from '../../data/games.js';
import { generateJigsaw } from '../../lib/jigsaw.js';
import { rand, shuffle, speak, successSound, wrongSound } from '../../lib/audio.js';
import { useCelebrate } from '../../context/FeedbackContext.jsx';

// Complète l'image : une jolie image à laquelle il manque UN morceau (un trou) ;
// l'enfant choisit la bonne pièce manquante parmi trois de même forme.
export default function CompleteGame({ active }) {
  const [round, setRound] = useState(null);
  const [solved, setSolved] = useState(false);
  const [shakeKey, setShakeKey] = useState(null);
  const timerRef = useRef(null);
  const pkeyRef = useRef(0);
  const lastIdRef = useRef(null);
  const celebrate = useCelebrate();

  const newRound = useCallback(() => {
    clearTimeout(timerRef.current);
    appState.locked = false;
    setSolved(false);
    setShakeKey(null);

    const pool = JIGSAW_PUZZLES.filter((p) => p.id !== lastIdRef.current);
    const puzzle = rand(pool.length ? pool : JIGSAW_PUZZLES);
    lastIdRef.current = puzzle.id;

    const key = ++pkeyRef.current;
    const pieces = generateJigsaw(2, 2, puzzle.size);
    const missing = { ...rand(pieces), clipId: `${key}-hole` };

    const others = shuffle(JIGSAW_PUZZLES.filter((p) => p.id !== puzzle.id)).slice(0, 2);
    const options = shuffle([
      { key: 'ok', image: puzzle.image, correct: true },
      { key: 'x1', image: (others[0] || puzzle).image, correct: false },
      { key: 'x2', image: (others[1] || others[0] || puzzle).image, correct: false },
    ]);

    setRound({ puzzle, missing, options });
    setTimeout(() => speak('Quelle pièce complète l’image ?'), 350);
  }, []);

  useEffect(() => {
    newRound();
    return () => clearTimeout(timerRef.current);
  }, [newRound]);

  if (!round) return null;
  const { puzzle, missing, options } = round;

  function handleAnswer(opt) {
    if (appState.locked || solved) return;
    if (opt.correct) {
      appState.locked = true;
      setSolved(true);
      successSound();
      setTimeout(celebrate, 250);
      speak(`Bravo ! ${rand(PRAISES)}`);
      timerRef.current = setTimeout(newRound, 3200);
    } else {
      wrongSound();
      setShakeKey(opt.key);
      speak(rand(ENCOURAGE));
      setTimeout(() => setShakeKey(null), 600);
    }
  }

  return (
    <>
      <div className="question">Quelle pièce complète l&rsquo;image ?</div>

      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
        <defs>
          <clipPath id={`clip-${missing.clipId}`} clipPathUnits="userSpaceOnUse">
            <path d={missing.d} />
          </clipPath>
        </defs>
      </svg>

      <div className="stage jigsaw-stage">
        <div className={`jigsaw-board${solved ? ' done' : ''}`}>
          <svg className="jigsaw-svg" viewBox={`0 0 ${puzzle.size} ${puzzle.size}`} xmlns="http://www.w3.org/2000/svg">
            <g dangerouslySetInnerHTML={{ __html: puzzle.image }} />
            {!solved && <path d={missing.d} className="jigsaw-hole" />}
          </svg>
        </div>
      </div>

      <div className="answers">
        {options.map((opt) => (
          <DwellButton
            key={opt.key}
            className={`answer${shakeKey === opt.key ? ' shake' : ''}`}
            aria-label="pièce"
            onClick={() => handleAnswer(opt)}
          >
            <svg
              className="piece-svg"
              viewBox={`${missing.bbox.x} ${missing.bbox.y} ${missing.bbox.w} ${missing.bbox.h}`}
              xmlns="http://www.w3.org/2000/svg"
            >
              <g clipPath={`url(#clip-${missing.clipId})`} dangerouslySetInnerHTML={{ __html: opt.image }} />
              <path d={missing.d} className="piece-outline" />
            </svg>
          </DwellButton>
        ))}
      </div>
    </>
  );
}
