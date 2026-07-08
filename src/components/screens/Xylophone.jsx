import React, { useState } from 'react';
import DwellButton from '../DwellButton.jsx';
import { XYLO_NOTES } from '../../data/games.js';
import { playXyloNote } from '../../lib/audio.js';

export default function Xylophone({ active }) {
  const [playingIdx, setPlayingIdx] = useState(null);

  return (
    <section className={`screen${active ? ' active' : ''}`}>
      <div className="xylo-row">
        {XYLO_NOTES.map((note, i) => (
          <DwellButton
            key={i}
            className={`xylo-note${playingIdx === i ? ' playing' : ''}`}
            style={{ background: note.color }}
            aria-label={`Note ${note.name}`}
            onClick={() => {
              playXyloNote(note.freq);
              setPlayingIdx(i);
              setTimeout(() => setPlayingIdx((cur) => (cur === i ? null : cur)), 220);
            }}
          >
            {note.name}
          </DwellButton>
        ))}
      </div>
    </section>
  );
}
