import React from 'react';
import DwellButton from '../DwellButton.jsx';
import { ensureAudio } from '../../lib/audio.js';

const GAMES = [
  { id: 'count', emoji: '🔢', label: 'Compter' },
  { id: 'colors', emoji: '🎨', label: 'Couleurs' },
  { id: 'shapes', emoji: '🔷', label: 'Formes' },
  { id: 'puzzle', emoji: '🧩', label: 'Puzzle' },
  { id: 'balloons', emoji: '🎈', label: 'Ballons' },
  { id: 'body', emoji: '🧍', label: 'Le Corps' },
];

export default function GamesMenu({ active, onStartGame }) {
  return (
    <section id="screenGames" className={`screen${active ? ' active' : ''}`}>
      <div className="home-grid">
        {GAMES.map((g) => (
          <DwellButton
            key={g.id}
            className="card"
            aria-label={`Jeu ${g.label.toLowerCase()}`}
            onClick={() => {
              ensureAudio();
              onStartGame(g.id);
            }}
          >
            <div className="emoji">{g.emoji}</div>
            <div>{g.label}</div>
          </DwellButton>
        ))}
      </div>
    </section>
  );
}
