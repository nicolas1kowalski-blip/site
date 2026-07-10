import React, { useCallback, useEffect, useRef, useState } from 'react';
import DwellButton from '../DwellButton.jsx';
import { appState } from '../../lib/appState.js';
import { COUNT_OBJECTS, PRAISES, ENCOURAGE } from '../../data/games.js';
import { pickN, rand, speak, successSound, wrongSound } from '../../lib/audio.js';
import { useCelebrate } from '../../context/FeedbackContext.jsx';

// Jeu des ombres : une silhouette noire est montrée, l'enfant choisit parmi
// quelques images celle qui correspond à l'ombre.
export default function ShadowGame({ active }) {
  const [round, setRound] = useState(null);
  const [shakeEmoji, setShakeEmoji] = useState(null);
  const timerRef = useRef(null);
  const celebrate = useCelebrate();

  const newRound = useCallback(() => {
    appState.locked = false;
    setShakeEmoji(null);
    const target = rand(COUNT_OBJECTS);
    const options = pickN(COUNT_OBJECTS, 3, target);
    setRound({ target, options });
    setTimeout(() => speak('Quel objet fait cette ombre ?'), 350);
  }, []);

  useEffect(() => {
    newRound();
    return () => clearTimeout(timerRef.current);
  }, [newRound]);

  if (!round) return null;

  function handleAnswer(emoji) {
    if (appState.locked) return;
    if (emoji === round.target) {
      appState.locked = true;
      successSound();
      celebrate();
      speak(rand(PRAISES));
      timerRef.current = setTimeout(newRound, 2400);
    } else {
      wrongSound();
      setShakeEmoji(emoji);
      speak(rand(ENCOURAGE));
      setTimeout(() => setShakeEmoji(null), 600);
    }
  }

  return (
    <>
      <div className="question">Quel objet fait cette ombre ?</div>
      <div className="stage">
        <div className="shadow-target">{round.target}</div>
      </div>
      <div className="answers">
        {round.options.map((emo, i) => (
          <DwellButton
            key={i}
            className={`answer${shakeEmoji === emo ? ' shake' : ''}`}
            aria-label="objet"
            onClick={() => handleAnswer(emo)}
          >
            <span className="shadow-choice">{emo}</span>
          </DwellButton>
        ))}
      </div>
    </>
  );
}
