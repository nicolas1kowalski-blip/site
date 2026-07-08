import React, { useCallback, useEffect, useRef, useState } from 'react';
import DwellButton from '../DwellButton.jsx';
import { appState } from '../../lib/appState.js';
import { SHAPES, PRAISES, ENCOURAGE } from '../../data/games.js';
import { pickN, rand, speak, successSound, wrongSound } from '../../lib/audio.js';
import { useCelebrate } from '../../context/FeedbackContext.jsx';

export default function ShapesGame({ active }) {
  const [round, setRound] = useState(null);
  const [shakeName, setShakeName] = useState(null);
  const timerRef = useRef(null);
  const celebrate = useCelebrate();

  const newRound = useCallback(() => {
    appState.locked = false;
    setShakeName(null);
    const target = rand(SHAPES);
    const options = pickN(SHAPES, 3, target);
    setRound({ target, options });
    setTimeout(() => speak(`Trouve : ${target.name}`), 350);
  }, []);

  useEffect(() => {
    newRound();
    return () => clearTimeout(timerRef.current);
  }, [newRound]);

  if (!round) return null;

  function handleAnswer(shape) {
    if (appState.locked) return;
    if (shape.name === round.target.name) {
      appState.locked = true;
      successSound();
      celebrate();
      speak(`${rand(PRAISES)} C'est un ${round.target.name} !`);
      timerRef.current = setTimeout(newRound, 2400);
    } else {
      wrongSound();
      setShakeName(shape.name);
      speak(rand(ENCOURAGE));
      setTimeout(() => setShakeName(null), 600);
    }
  }

  return (
    <>
      <div className="question">Trouve : {round.target.name}</div>
      <div className="stage">
        <div className="shape-display">
          <svg viewBox="0 0 100 100" dangerouslySetInnerHTML={{ __html: round.target.svg }} />
        </div>
      </div>
      <div className="answers">
        {round.options.map((s) => {
          const svgGrey = s.svg.replace(/fill="[^"]+"/, 'fill="#FFB347"');
          return (
            <DwellButton
              key={s.name}
              className={`answer${shakeName === s.name ? ' shake' : ''}`}
              aria-label={s.name}
              onClick={() => handleAnswer(s)}
            >
              <svg viewBox="0 0 100 100" dangerouslySetInnerHTML={{ __html: svgGrey }} />
            </DwellButton>
          );
        })}
      </div>
    </>
  );
}
