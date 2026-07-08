import React from 'react';
import MotionCard from '../MotionCard.jsx';

export default function MusicMenu({ active, onSelect }) {
  return (
    <section className={`screen${active ? ' active' : ''}`}>
      <div className="home-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
        <MotionCard index={0} className="card" aria-label="Xylophone" onClick={() => onSelect('xylo')}>
          <div className="emoji">🎹</div>
          <div>Xylophone</div>
        </MotionCard>
        <MotionCard index={1} className="card" aria-label="Mes chansons" onClick={() => onSelect('songs')}>
          <div className="emoji">🎵</div>
          <div>Mes chansons</div>
        </MotionCard>
      </div>
    </section>
  );
}
