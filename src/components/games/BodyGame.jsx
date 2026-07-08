import React, { useCallback, useEffect, useRef, useState } from 'react';
import DwellButton from '../DwellButton.jsx';
import { appState } from '../../lib/appState.js';
import { BODY_PARTS, PRAISES, ENCOURAGE } from '../../data/games.js';
import { rand, shuffle, speak, successSound, wrongSound } from '../../lib/audio.js';
import { useCelebrate } from '../../context/FeedbackContext.jsx';

const CONFLICTS = {
  tete: ['oreille', 'nez', 'bouche', 'cou'],
  oreille: ['tete', 'nez', 'bouche'],
  nez: ['tete', 'oreille', 'bouche'],
  bouche: ['tete', 'oreille', 'nez'],
  cou: ['tete', 'ventre'],
  ventre: ['cou'],
  bras: ['main'],
  main: ['bras'],
  jambe: ['genou', 'pied'],
  genou: ['jambe'],
  pied: ['jambe'],
};

const SVG_HUMAIN = `
  <svg viewBox="0 0 400 600" xmlns="http://www.w3.org/2000/svg">
    <circle cx="200" cy="95" r="65" fill="#8B4513"/>
    <circle cx="145" cy="105" r="14" fill="#FAD6B1" stroke="#2B2D42" stroke-width="3"/>
    <circle cx="255" cy="105" r="14" fill="#FAD6B1" stroke="#2B2D42" stroke-width="3"/>
    <rect x="185" y="140" width="30" height="35" fill="#FAD6B1" stroke="#2B2D42" stroke-width="3"/>
    <path d="M140 200 L65 290" stroke="#FAD6B1" stroke-width="28" stroke-linecap="round"/>
    <path d="M260 200 L335 290" stroke="#FAD6B1" stroke-width="28" stroke-linecap="round"/>
    <path d="M165 350 L140 480" stroke="#FAD6B1" stroke-width="32" stroke-linecap="round"/>
    <path d="M235 350 L260 480" stroke="#FAD6B1" stroke-width="32" stroke-linecap="round"/>
    <ellipse cx="152" cy="415" rx="10" ry="14" fill="#E8B890" opacity="0.7"/>
    <ellipse cx="248" cy="415" rx="10" ry="14" fill="#E8B890" opacity="0.7"/>
    <ellipse cx="125" cy="500" rx="40" ry="25" fill="#FF6B6B" stroke="#2B2D42" stroke-width="3"/>
    <ellipse cx="275" cy="500" rx="40" ry="25" fill="#FF6B6B" stroke="#2B2D42" stroke-width="3"/>
    <path d="M130 330 L270 330 L265 400 L200 370 L135 400 Z" fill="#3A86FF" stroke="#2B2D42" stroke-width="3" stroke-linejoin="round"/>
    <rect x="125" y="170" width="150" height="170" rx="45" fill="#4ECDC4" stroke="#2B2D42" stroke-width="3"/>
    <polygon points="200,210 208,230 230,230 212,245 220,268 200,252 180,268 188,245 170,230 192,230" fill="#FFD93C"/>
    <circle cx="55" cy="300" r="22" fill="#FAD6B1" stroke="#2B2D42" stroke-width="3"/>
    <circle cx="345" cy="300" r="22" fill="#FAD6B1" stroke="#2B2D42" stroke-width="3"/>
    <circle cx="200" cy="100" r="55" fill="#FAD6B1" stroke="#2B2D42" stroke-width="3"/>
    <circle cx="180" cy="90" r="6" fill="#2B2D42"/>
    <circle cx="220" cy="90" r="6" fill="#2B2D42"/>
    <ellipse cx="200" cy="104" rx="5" ry="3" fill="#E8B890"/>
    <circle cx="165" cy="110" r="8" fill="#FF9FB5" opacity="0.6"/>
    <circle cx="235" cy="110" r="8" fill="#FF9FB5" opacity="0.6"/>
    <path d="M185 118 Q200 135 215 118" stroke="#2B2D42" stroke-width="4" fill="none" stroke-linecap="round"/>
    <path d="M145 80 Q200 30 255 80 Q200 50 145 80" fill="#8B4513"/>
  </svg>
`;

export default function BodyGame({ active }) {
  const [round, setRound] = useState(null);
  const [shakePart, setShakePart] = useState(null);
  const timerRef = useRef(null);
  const celebrate = useCelebrate();

  const newRound = useCallback(() => {
    appState.locked = false;
    setShakePart(null);
    speechSynthesis?.cancel();
    const target = rand(BODY_PARTS);
    let pool = shuffle(BODY_PARTS.filter((p) => p.id !== target.id && !(CONFLICTS[target.id] || []).includes(p.id)));
    let selectedParts = [target];
    for (const p of pool) {
      if (selectedParts.length === 4) break;
      let conflict = false;
      for (const s of selectedParts) {
        if ((CONFLICTS[s.id] || []).includes(p.id)) conflict = true;
      }
      if (!conflict) selectedParts.push(p);
    }
    setRound({ target, selectedParts });
    setTimeout(() => speak(`Regarde : ${target.name}`), 350);
  }, []);

  useEffect(() => {
    newRound();
    return () => clearTimeout(timerRef.current);
  }, [newRound]);

  if (!round) return null;

  function handleClick(partId) {
    if (appState.locked) return;
    if (partId === round.target.id) {
      appState.locked = true;
      successSound();
      celebrate();
      speak(`${rand(PRAISES)} C'est bien ${round.target.name} !`);
      timerRef.current = setTimeout(newRound, 2400);
    } else {
      wrongSound();
      setShakePart(partId);
      speak(rand(ENCOURAGE));
      setTimeout(() => setShakePart(null), 600);
    }
  }

  return (
    <>
      <div className="question">Regarde : {round.target.name}</div>
      <div className="stage">
        <div className="body-container">
          <span dangerouslySetInnerHTML={{ __html: SVG_HUMAIN }} />
          {round.selectedParts.flatMap((part) =>
            part.boxes.map((box, i) => (
              <DwellButton
                key={`${part.id}-${i}`}
                className={`body-part${shakePart === part.id ? ' shake' : ''}`}
                style={box}
                aria-label={part.name}
                onClick={() => handleClick(part.id)}
              />
            ))
          )}
        </div>
      </div>
    </>
  );
}
