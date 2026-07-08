import React from 'react';
import DwellButton from '../DwellButton.jsx';

export default function MusicMenu({ active, onSelect }) {
  return (
    <section className={`screen${active ? ' active' : ''}`}>
      <div className="home-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
        <DwellButton className="card" aria-label="Xylophone" onClick={() => onSelect('xylo')}>
          <div className="emoji">🎹</div>
          <div>Xylophone</div>
        </DwellButton>
        <DwellButton className="card" aria-label="Mes chansons" onClick={() => onSelect('songs')}>
          <div className="emoji">🎵</div>
          <div>Mes chansons</div>
        </DwellButton>
      </div>
    </section>
  );
}
