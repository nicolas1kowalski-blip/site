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
    <defs>
      <linearGradient id="hbSkin" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#F6D0AE"/><stop offset="1" stop-color="#E3AE86"/>
      </linearGradient>
      <linearGradient id="hbShirt" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#5FE0D6"/><stop offset="1" stop-color="#37B3AB"/>
      </linearGradient>
      <linearGradient id="hbShorts" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#4C93FF"/><stop offset="1" stop-color="#2E63D0"/>
      </linearGradient>
      <linearGradient id="hbShoe" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#FF8A8A"/><stop offset="1" stop-color="#E24B4B"/>
      </linearGradient>
      <linearGradient id="hbHair" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#7A5533"/><stop offset="1" stop-color="#5B3E24"/>
      </linearGradient>
    </defs>

    <!-- Jambes -->
    <path d="M170 352 L150 486" stroke="url(#hbSkin)" stroke-width="40" stroke-linecap="round"/>
    <path d="M230 352 L250 486" stroke="url(#hbSkin)" stroke-width="40" stroke-linecap="round"/>
    <path d="M170 352 L150 486" stroke="#2B2D42" stroke-width="40" stroke-linecap="round" fill="none" opacity="0.12"/>
    <path d="M230 352 L250 486" stroke="#2B2D42" stroke-width="40" stroke-linecap="round" fill="none" opacity="0.12"/>
    <path d="M170 352 L150 486" stroke="url(#hbSkin)" stroke-width="34" stroke-linecap="round"/>
    <path d="M230 352 L250 486" stroke="url(#hbSkin)" stroke-width="34" stroke-linecap="round"/>
    <!-- Genoux -->
    <ellipse cx="159" cy="420" rx="15" ry="18" fill="#D89A72" opacity="0.65"/>
    <ellipse cx="241" cy="420" rx="15" ry="18" fill="#D89A72" opacity="0.65"/>

    <!-- Chaussures -->
    <path d="M126 470 q-42 6 -44 34 q-1 14 22 16 l44 0 q10 -1 10 -12 l0 -30 q-14 -10 -32 -8z" fill="url(#hbShoe)" stroke="#2B2D42" stroke-width="3" stroke-linejoin="round"/>
    <path d="M274 470 q42 6 44 34 q1 14 -22 16 l-44 0 q-10 -1 -10 -12 l0 -30 q14 -10 32 -8z" fill="url(#hbShoe)" stroke="#2B2D42" stroke-width="3" stroke-linejoin="round"/>
    <path d="M84 512 l64 0" stroke="#fff" stroke-width="6" stroke-linecap="round" opacity="0.7"/>
    <path d="M316 512 l-64 0" stroke="#fff" stroke-width="6" stroke-linecap="round" opacity="0.7"/>

    <!-- Short -->
    <path d="M132 322 L268 322 L262 402 L232 402 L200 356 L168 402 L138 402 Z" fill="url(#hbShorts)" stroke="#2B2D42" stroke-width="3" stroke-linejoin="round"/>

    <!-- Bras -->
    <path d="M150 210 L62 300" stroke="url(#hbSkin)" stroke-width="30" stroke-linecap="round"/>
    <path d="M250 210 L338 300" stroke="url(#hbSkin)" stroke-width="30" stroke-linecap="round"/>
    <!-- Mains -->
    <circle cx="58" cy="304" r="23" fill="url(#hbSkin)" stroke="#2B2D42" stroke-width="3"/>
    <circle cx="342" cy="304" r="23" fill="url(#hbSkin)" stroke="#2B2D42" stroke-width="3"/>
    <g stroke="#C98F68" stroke-width="2.5" stroke-linecap="round">
      <line x1="46" y1="290" x2="42" y2="280"/><line x1="55" y1="286" x2="54" y2="275"/><line x1="64" y1="287" x2="66" y2="277"/>
      <line x1="354" y1="290" x2="358" y2="280"/><line x1="345" y1="286" x2="346" y2="275"/><line x1="336" y1="287" x2="334" y2="277"/>
    </g>

    <!-- Torse / tee-shirt -->
    <path d="M132 196 q68 -26 136 0 q14 6 14 40 l0 108 q0 22 -22 22 l-120 0 q-22 0 -22 -22 l0 -108 q0 -34 14 -40z" fill="url(#hbShirt)" stroke="#2B2D42" stroke-width="3.5"/>
    <!-- Manches -->
    <path d="M146 200 q-24 4 -30 28 q18 12 44 6 z" fill="url(#hbShirt)" stroke="#2B2D42" stroke-width="3" stroke-linejoin="round"/>
    <path d="M254 200 q24 4 30 28 q-18 12 -44 6 z" fill="url(#hbShirt)" stroke="#2B2D42" stroke-width="3" stroke-linejoin="round"/>
    <path d="M182 188 q18 20 36 0" fill="none" stroke="#2B2D42" stroke-width="3" opacity="0.5"/>

    <!-- Cou -->
    <path d="M184 150 l32 0 l0 40 q-16 10 -32 0 z" fill="url(#hbSkin)" stroke="#2B2D42" stroke-width="3"/>

    <!-- Oreilles -->
    <circle cx="141" cy="112" r="16" fill="url(#hbSkin)" stroke="#2B2D42" stroke-width="3"/>
    <circle cx="259" cy="112" r="16" fill="url(#hbSkin)" stroke="#2B2D42" stroke-width="3"/>
    <circle cx="141" cy="112" r="7" fill="#D89A72" opacity="0.6"/>
    <circle cx="259" cy="112" r="7" fill="#D89A72" opacity="0.6"/>

    <!-- Cheveux (arrière) -->
    <path d="M132 108 q-6 -86 68 -86 q74 0 68 86 q-10 -46 -68 -46 q-58 0 -68 46z" fill="url(#hbHair)"/>

    <!-- Tête -->
    <circle cx="200" cy="104" r="58" fill="url(#hbSkin)" stroke="#2B2D42" stroke-width="3.5"/>
    <!-- Joues -->
    <circle cx="160" cy="120" r="12" fill="#FF9FB5" opacity="0.55"/>
    <circle cx="240" cy="120" r="12" fill="#FF9FB5" opacity="0.55"/>
    <!-- Sourcils -->
    <path d="M168 82 q12 -8 26 -2" stroke="#5B3E24" stroke-width="4" fill="none" stroke-linecap="round"/>
    <path d="M232 82 q-12 -8 -26 -2" stroke="#5B3E24" stroke-width="4" fill="none" stroke-linecap="round"/>
    <!-- Yeux -->
    <ellipse cx="178" cy="98" rx="10" ry="12" fill="#fff" stroke="#2B2D42" stroke-width="2.5"/>
    <ellipse cx="222" cy="98" rx="10" ry="12" fill="#fff" stroke="#2B2D42" stroke-width="2.5"/>
    <circle cx="179" cy="100" r="5.5" fill="#2B2D42"/>
    <circle cx="223" cy="100" r="5.5" fill="#2B2D42"/>
    <circle cx="181" cy="97" r="2" fill="#fff"/>
    <circle cx="225" cy="97" r="2" fill="#fff"/>
    <!-- Nez -->
    <path d="M200 104 q7 10 -2 16" fill="none" stroke="#C98F68" stroke-width="3.5" stroke-linecap="round"/>
    <!-- Bouche -->
    <path d="M180 130 q20 20 40 0" fill="none" stroke="#C43C5A" stroke-width="4.5" stroke-linecap="round"/>
    <!-- Cheveux (frange) -->
    <path d="M144 92 q-4 -70 56 -70 q60 0 56 70 q-16 -34 -40 -18 q-8 8 -22 4 q-18 -6 -28 6 q-14 -2 -22 8z" fill="url(#hbHair)"/>
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
