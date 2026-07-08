import React, { useCallback, useEffect, useRef, useState } from 'react';
import DwellButton from '../DwellButton.jsx';
import { appState } from '../../lib/appState.js';
import { COUNT_OBJECTS, PRAISES, ENCOURAGE } from '../../data/games.js';
import { rand, shuffle, speak, successSound, wrongSound } from '../../lib/audio.js';
import { useCelebrate } from '../../context/FeedbackContext.jsx';

const BG = { 1: '#FFE9C7', 2: '#C6F0E7', 3: '#FFD3DC' };

export default function CountGame({ active }) {
  const [round, setRound] = useState(null);
  const [shakeNum, setShakeNum] = useState(null);
  const timerRef = useRef(null);
  const celebrate = useCelebrate();

  const newRound = useCallback(() => {
    appState.locked = false;
    setShakeNum(null);
    const n = 1 + Math.floor(Math.random() * 3);
    const obj = rand(COUNT_OBJECTS);
    const options = shuffle([1, 2, 3]);
    setRound({ n, obj, options });
    setTimeout(() => speak('Combien ? Un... Deux... ou Trois ?'), 350);
  }, []);

  useEffect(() => {
    newRound();
    return () => clearTimeout(timerRef.current);
  }, [newRound]);

  if (!round) return null;

  function handleAnswer(num) {
    if (appState.locked) return;
    if (num === round.n) {
      appState.locked = true;
      successSound();
      celebrate();
      const detail = round.n === 1 ? 'Il y en a un !' : round.n === 2 ? 'Il y en a deux !' : 'Il y en a trois !';
      speak(`${rand(PRAISES)} ${detail}`);
      timerRef.current = setTimeout(newRound, 2400);
    } else {
      wrongSound();
      setShakeNum(num);
      speak(rand(ENCOURAGE));
      setTimeout(() => setShakeNum(null), 600);
    }
  }

  return (
    <>
      <div className="question">Combien ?</div>
      <div className="stage">
        <div className="visuals">
          {Array.from({ length: round.n }, (_, i) => (
            <span key={i} className="count-item">
              {round.obj}
            </span>
          ))}
        </div>
      </div>
      <div className="answers">
        {round.options.map((num) => (
          <DwellButton
            key={num}
            className={`answer${shakeNum === num ? ' shake' : ''}`}
            style={{ background: BG[num] }}
            onClick={() => handleAnswer(num)}
          >
            {num}
          </DwellButton>
        ))}
      </div>
    </>
  );
}
