import React from 'react';
import DwellButton from './DwellButton.jsx';

const TABS = [
  { id: 'stories', icon: '📖', label: 'Histoires' },
  { id: 'games', icon: '🎮', label: 'Jeux' },
  { id: 'music', icon: '🎵', label: 'Musique' },
];

export default function Tabs({ active, onSelect }) {
  return (
    <nav className="tabs">
      {TABS.map((t) => (
        <DwellButton
          key={t.id}
          className={`tab${active === t.id ? ' active' : ''}`}
          onClick={() => onSelect(t.id)}
        >
          <span className="ico">{t.icon}</span>
          <span>{t.label}</span>
        </DwellButton>
      ))}
    </nav>
  );
}
