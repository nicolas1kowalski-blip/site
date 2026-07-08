import React, { useCallback, useEffect, useRef, useState } from 'react';
import DwellButton from '../DwellButton.jsx';
import { appState } from '../../lib/appState.js';
import { COLORS, PRAISES, ENCOURAGE } from '../../data/games.js';
import { pickN, rand, speak, successSound, wrongSound } from '../../lib/audio.js';
import { useCelebrate } from '../../context/FeedbackContext.jsx';

export default function ColorsGame({ active }) {
  const [round, setRound] = useState(null);
  const [shakeName, setShakeName] = useState(null);
  const timerRef = useRef(null);
  const celebrate = useCelebrate();

  const newRound = useCallback(() => {
    appState.locked = false;
    setShakeName(null);
    const target = rand(COLORS);
    const options = pickN(COLORS, 3, target);
    setRound({ target, options });
    setTimeout(() => speak(`Trouve la couleur ${target.name}`), 350);
  }, []);

  useEffect(() => {
    newRound();
    return () => clearTimeout(timerRef.current);
  }, [newRound]);

  if (!round) return null;

  function handleAnswer(color) {
    if (appState.locked) return;
    if (color.name === round.target.name) {
      appState.locked = true;
      successSound();
      celebrate();
      speak(`${rand(PRAISES)} C'est ${round.target.name} !`);
      timerRef.current = setTimeout(newRound, 2400);
    } else {
      wrongSound();
      setShakeName(color.name);
      speak(rand(ENCOURAGE));
      setTimeout(() => setShakeName(null), 600);
    }
  }

  return (
    <>
      <div className="question">Trouve la couleur : {round.target.name}</div>
      <div className="stage">
        <div className="color-blob" style={{ background: round.target.value }} />
      </div>
      <div className="answers">
        {round.options.map((c) => (
          <DwellButton
            key={c.name}
            className={`answer${shakeName === c.name ? ' shake' : ''}`}
            aria-label={c.name}
            onClick={() => handleAnswer(c)}
          >
            <div className="swatch" style={{ background: c.value }} />
          </DwellButton>
        ))}
      </div>
    </>
  );
}
