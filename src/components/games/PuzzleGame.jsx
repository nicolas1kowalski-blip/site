import React, { useCallback, useEffect, useRef, useState } from 'react';
import DwellButton from '../DwellButton.jsx';
import { appState } from '../../lib/appState.js';
import { JIGSAW_PUZZLES, ENCOURAGE } from '../../data/games.js';
import { rand, shuffle, speak, successSound, wrongSound } from '../../lib/audio.js';
import { useCelebrate } from '../../context/FeedbackContext.jsx';

function makeSlots(size) {
  const h = size / 2;
  return [
    { id: 0, x: 0, y: 0, w: h, h, label: 'en haut à gauche' },
    { id: 1, x: h, y: 0, w: h, h, label: 'en haut à droite' },
    { id: 2, x: 0, y: h, w: h, h, label: 'en bas à gauche' },
    { id: 3, x: h, y: h, w: h, h, label: 'en bas à droite' },
  ];
}

export default function PuzzleGame({ active }) {
  const [puzzle, setPuzzle] = useState(null);
  const [slots, setSlots] = useState([]);
  const [placedSlots, setPlacedSlots] = useState([]);
  const [targetSlot, setTargetSlot] = useState(null);
  const [shakeSlot, setShakeSlot] = useState(null);
  const [pieceOrder, setPieceOrder] = useState([]);
  const timerRef = useRef(null);
  const celebrate = useCelebrate();

  const newRound = useCallback(() => {
    appState.locked = false;
    speechSynthesis?.cancel();
    const p = rand(JIGSAW_PUZZLES);
    const s = makeSlots(p.size);
    const target = rand(s).id;
    setPuzzle(p);
    setSlots(s);
    setPlacedSlots([]);
    setTargetSlot(target);
    setPieceOrder(shuffle(s.map((x) => x.id)));
    setTimeout(() => speak('Quelle pièce va dans la case jaune ?'), 350);
  }, []);

  useEffect(() => {
    newRound();
    return () => clearTimeout(timerRef.current);
  }, [newRound]);

  if (!puzzle) return null;

  function handlePieceClick(slotId) {
    if (appState.locked) return;
    if (slotId === targetSlot) {
      const newPlaced = [...placedSlots, slotId];
      successSound();
      if (newPlaced.length === slots.length) {
        appState.locked = true;
        setPlacedSlots(newPlaced);
        setTimeout(celebrate, 400);
        speak(`Bravo ! Tu as fait ${puzzle.name} !`);
        timerRef.current = setTimeout(newRound, 3800);
      } else {
        const empty = slots.filter((s) => !newPlaced.includes(s.id));
        setPlacedSlots(newPlaced);
        setTargetSlot(rand(empty).id);
        setPieceOrder(shuffle(empty.map((s) => s.id)));
        speak('Super ! Encore une.');
      }
    } else {
      wrongSound();
      setShakeSlot(slotId);
      speak(rand(ENCOURAGE));
      setTimeout(() => setShakeSlot(null), 600);
    }
  }

  const remaining = pieceOrder.filter((id) => !placedSlots.includes(id));

  return (
    <>
      <div className="question">Quelle pièce va ici ?</div>
      <div className="stage">
        <div className="jigsaw-board">
          <svg viewBox={`0 0 ${puzzle.size} ${puzzle.size}`} preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
            <g dangerouslySetInnerHTML={{ __html: puzzle.image }} />
            {slots
              .filter((slot) => !placedSlots.includes(slot.id))
              .map((slot) => (
                <rect
                  key={slot.id}
                  x={slot.x}
                  y={slot.y}
                  width={slot.w}
                  height={slot.h}
                  className={`slot-overlay${slot.id === targetSlot ? ' active' : ''}`}
                />
              ))}
          </svg>
        </div>
      </div>
      <div className="answers" style={{ gridTemplateColumns: `repeat(${remaining.length}, 1fr)` }}>
        {remaining.map((slotId) => {
          const slot = slots.find((s) => s.id === slotId);
          return (
            <DwellButton
              key={slotId}
              className={`answer jigsaw-piece${shakeSlot === slotId ? ' shake' : ''}`}
              onClick={() => handlePieceClick(slotId)}
            >
              <svg viewBox={`${slot.x} ${slot.y} ${slot.w} ${slot.h}`} preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
                <g dangerouslySetInnerHTML={{ __html: puzzle.image }} />
              </svg>
            </DwellButton>
          );
        })}
      </div>
    </>
  );
}
