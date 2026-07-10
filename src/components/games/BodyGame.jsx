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
      <linearGradient id="hbSkin" x1="0.1" y1="0" x2="0.9" y2="1">
        <stop offset="0" stop-color="#FBD8B6"/><stop offset="1" stop-color="#EBAF86"/>
      </linearGradient>
      <radialGradient id="hbHead" cx="0.38" cy="0.34" r="0.75">
        <stop offset="0" stop-color="#FEE0C4"/><stop offset="0.7" stop-color="#F6CBA4"/><stop offset="1" stop-color="#E7AF87"/>
      </radialGradient>
      <linearGradient id="hbShirt" x1="0.2" y1="0" x2="0.5" y2="1">
        <stop offset="0" stop-color="#6FE9DF"/><stop offset="1" stop-color="#31A8A0"/>
      </linearGradient>
      <linearGradient id="hbShorts" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#5A9BFF"/><stop offset="1" stop-color="#2C60CE"/>
      </linearGradient>
      <linearGradient id="hbShoe" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#FF9A9A"/><stop offset="1" stop-color="#E14B4B"/>
      </linearGradient>
      <linearGradient id="hbHair" x1="0" y1="0" x2="0.3" y2="1">
        <stop offset="0" stop-color="#8A6239"/><stop offset="1" stop-color="#5C3E22"/>
      </linearGradient>
    </defs>

    <!-- Ombre au sol -->
    <ellipse cx="200" cy="566" rx="128" ry="18" fill="#2B2D42" opacity="0.10"/>

    <!-- Jambes (galbées) -->
    <path d="M146.7 355.7 L124.5 495.9 A18 18 0 0 1 159.5 504.1 L201.3 368.3 A28 28 0 0 1 146.7 355.7 Z" fill="url(#hbSkin)" stroke="#4A3A2E" stroke-width="3.5" stroke-linejoin="round"/>
    <path d="M198.7 368.3 L240.5 504.1 A18 18 0 0 1 275.5 495.9 L253.3 355.7 A28 28 0 0 1 198.7 368.3 Z" fill="url(#hbSkin)" stroke="#4A3A2E" stroke-width="3.5" stroke-linejoin="round"/>
    <!-- Genoux -->
    <ellipse cx="156" cy="426" rx="13" ry="17" fill="#D9976F" opacity="0.55"/>
    <ellipse cx="244" cy="426" rx="13" ry="17" fill="#D9976F" opacity="0.55"/>

    <!-- Chaussures -->
    <path d="M120 486 q-40 2 -42 32 q-1 13 20 14 l52 0 q13 -1 13 -14 l0 -20 q-2 -18 -22 -20 z" fill="url(#hbShoe)" stroke="#4A3A2E" stroke-width="3.5" stroke-linejoin="round"/>
    <path d="M280 486 q40 2 42 32 q1 13 -20 14 l-52 0 q-13 -1 -13 -14 l0 -20 q2 -18 22 -20 z" fill="url(#hbShoe)" stroke="#4A3A2E" stroke-width="3.5" stroke-linejoin="round"/>
    <path d="M80 518 l66 0" stroke="#fff" stroke-width="7" stroke-linecap="round" opacity="0.85"/>
    <path d="M320 518 l-66 0" stroke="#fff" stroke-width="7" stroke-linecap="round" opacity="0.85"/>
    <ellipse cx="126" cy="498" rx="12" ry="7" fill="#fff" opacity="0.5"/>
    <ellipse cx="274" cy="498" rx="12" ry="7" fill="#fff" opacity="0.5"/>

    <!-- Short -->
    <path d="M128 320 q72 -16 144 0 l-6 74 q-1 12 -14 12 l-28 0 q-10 0 -14 -8 L200 356 l-12 34 q-4 8 -14 8 l-28 0 q-13 0 -14 -12 z" fill="url(#hbShorts)" stroke="#4A3A2E" stroke-width="3.5" stroke-linejoin="round"/>
    <path d="M150 330 q50 -8 100 0" stroke="#2C60CE" stroke-width="4" fill="none" opacity="0.5" stroke-linecap="round"/>

    <!-- Bras (galbés) -->
    <path d="M134.1 197.4 L49.6 289.2 A15 15 0 0 1 70.4 310.8 L165.9 230.6 A23 23 0 0 1 134.1 197.4 Z" fill="url(#hbSkin)" stroke="#4A3A2E" stroke-width="3.5" stroke-linejoin="round"/>
    <path d="M234.1 230.6 L329.6 310.8 A15 15 0 0 1 350.4 289.2 L265.9 197.4 A23 23 0 0 1 234.1 230.6 Z" fill="url(#hbSkin)" stroke="#4A3A2E" stroke-width="3.5" stroke-linejoin="round"/>

    <!-- Mains -->
    <ellipse cx="44" cy="292" rx="9" ry="12" fill="url(#hbSkin)" stroke="#4A3A2E" stroke-width="3" transform="rotate(-28 44 292)"/>
    <circle cx="60" cy="303" r="21" fill="url(#hbSkin)" stroke="#4A3A2E" stroke-width="3.5"/>
    <ellipse cx="356" cy="292" rx="9" ry="12" fill="url(#hbSkin)" stroke="#4A3A2E" stroke-width="3" transform="rotate(28 356 292)"/>
    <circle cx="340" cy="303" r="21" fill="url(#hbSkin)" stroke="#4A3A2E" stroke-width="3.5"/>

    <!-- Cou -->
    <path d="M182 150 l36 0 l0 42 q-18 12 -36 0 z" fill="url(#hbSkin)" stroke="#4A3A2E" stroke-width="3.5"/>
    <path d="M182 172 q18 12 36 0" fill="none" stroke="#C98F68" stroke-width="3" opacity="0.5"/>

    <!-- Torse / tee-shirt -->
    <path d="M126 202 q74 -32 148 0 q18 8 18 46 l0 96 q0 28 -28 28 l-128 0 q-28 0 -28 -28 l0 -96 q0 -38 18 -46 z" fill="url(#hbShirt)" stroke="#4A3A2E" stroke-width="4"/>
    <!-- Reflet tee-shirt -->
    <path d="M150 210 q-14 6 -16 40 l0 80" stroke="#fff" stroke-width="10" fill="none" opacity="0.18" stroke-linecap="round"/>
    <!-- Col -->
    <path d="M178 190 q22 22 44 0" fill="none" stroke="#4A3A2E" stroke-width="3.5" opacity="0.55"/>
    <!-- Manches courtes -->
    <path d="M150 202 q-30 6 -34 34 q22 14 50 4 z" fill="url(#hbShirt)" stroke="#4A3A2E" stroke-width="3.5" stroke-linejoin="round"/>
    <path d="M250 202 q30 6 34 34 q-22 14 -50 4 z" fill="url(#hbShirt)" stroke="#4A3A2E" stroke-width="3.5" stroke-linejoin="round"/>

    <!-- Oreilles -->
    <circle cx="139" cy="114" r="16" fill="url(#hbSkin)" stroke="#4A3A2E" stroke-width="3.5"/>
    <circle cx="261" cy="114" r="16" fill="url(#hbSkin)" stroke="#4A3A2E" stroke-width="3.5"/>
    <path d="M135 108 q8 6 2 14" fill="none" stroke="#C98F68" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M265 108 q-8 6 -2 14" fill="none" stroke="#C98F68" stroke-width="2.5" stroke-linecap="round"/>

    <!-- Cheveux (arrière) -->
    <path d="M126 116 q-10 -96 74 -96 q84 0 74 96 q-14 -52 -74 -52 q-60 0 -74 52 z" fill="url(#hbHair)"/>

    <!-- Tête -->
    <circle cx="200" cy="106" r="62" fill="url(#hbHead)" stroke="#4A3A2E" stroke-width="4"/>
    <!-- Reflet joue -->
    <circle cx="176" cy="86" r="20" fill="#fff" opacity="0.14"/>
    <!-- Joues -->
    <circle cx="156" cy="122" r="13" fill="#FF9FB5" opacity="0.5"/>
    <circle cx="244" cy="122" r="13" fill="#FF9FB5" opacity="0.5"/>
    <!-- Sourcils -->
    <path d="M164 84 q14 -9 30 -3" stroke="#6B4A29" stroke-width="4.5" fill="none" stroke-linecap="round"/>
    <path d="M236 84 q-14 -9 -30 -3" stroke="#6B4A29" stroke-width="4.5" fill="none" stroke-linecap="round"/>
    <!-- Yeux (grands et expressifs) -->
    <ellipse cx="176" cy="102" rx="13" ry="16" fill="#fff" stroke="#4A3A2E" stroke-width="2.5"/>
    <ellipse cx="224" cy="102" rx="13" ry="16" fill="#fff" stroke="#4A3A2E" stroke-width="2.5"/>
    <circle cx="178" cy="104" r="9" fill="#7B4F2C"/>
    <circle cx="222" cy="104" r="9" fill="#7B4F2C"/>
    <circle cx="178" cy="104" r="4.5" fill="#2B211A"/>
    <circle cx="222" cy="104" r="4.5" fill="#2B211A"/>
    <circle cx="181.5" cy="100" r="2.8" fill="#fff"/>
    <circle cx="225.5" cy="100" r="2.8" fill="#fff"/>
    <!-- Nez -->
    <path d="M200 108 q8 11 -2 18" fill="none" stroke="#D09468" stroke-width="4" stroke-linecap="round"/>
    <!-- Bouche souriante -->
    <path d="M176 134 q24 24 48 0 q-24 10 -48 0 z" fill="#C43C5A" stroke="#A72E48" stroke-width="2"/>
    <path d="M186 140 q14 8 28 0" fill="#fff" opacity="0.85"/>
    <!-- Cheveux (frange) -->
    <path d="M140 96 q-6 -76 60 -76 q66 0 60 76 q-16 -36 -42 -20 q-9 8 -24 4 q-19 -6 -30 6 q-15 -2 -24 10 z" fill="url(#hbHair)"/>
    <path d="M150 44 q30 -20 60 -6" stroke="#fff" stroke-width="5" fill="none" opacity="0.14" stroke-linecap="round"/>
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
