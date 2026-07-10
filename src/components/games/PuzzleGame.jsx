import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import DwellButton from '../DwellButton.jsx';
import { appState } from '../../lib/appState.js';
import { JIGSAW_PUZZLES, PRAISES, ENCOURAGE } from '../../data/games.js';
import { generateJigsaw } from '../../lib/jigsaw.js';
import { rand, shuffle, speak, popSound, successSound, wrongSound, pageSound } from '../../lib/audio.js';
import { useCelebrate } from '../../context/FeedbackContext.jsx';

// Puzzle simple pour les tout-petits : 2x2 = 4 grosses pièces.
const COLS = 2;
const ROWS = 2;

function PieceSvg({ piece, image, className }) {
  const { bbox } = piece;
  return (
    <svg
      className={className}
      viewBox={`${bbox.x} ${bbox.y} ${bbox.w} ${bbox.h}`}
      xmlns="http://www.w3.org/2000/svg"
    >
      <g clipPath={`url(#clip-${piece.clipId})`} dangerouslySetInnerHTML={{ __html: image }} />
      <path d={piece.d} className="piece-outline" />
    </svg>
  );
}

export default function PuzzleGame({ active }) {
  const [puzzle, setPuzzle] = useState(null);
  const [pieces, setPieces] = useState([]);
  const [placed, setPlaced] = useState(() => new Set());
  const [tray, setTray] = useState([]); // ids restants (mélangés)
  const [target, setTarget] = useState(null); // id de la pièce dont l'emplacement brille
  const [flying, setFlying] = useState(null);
  const [shakeId, setShakeId] = useState(null);
  const [done, setDone] = useState(false);

  const stageRef = useRef(null);
  const boardRef = useRef(null);
  const trayRefs = useRef({});
  const roundTimerRef = useRef(null);
  const shakeTimerRef = useRef(null);
  const pkeyRef = useRef(0);
  const lastPuzzleIdRef = useRef(null);
  const celebrate = useCelebrate();

  const newPuzzle = useCallback(() => {
    clearTimeout(roundTimerRef.current);
    appState.locked = false;
    // Jamais deux fois le même puzzle de suite.
    const pool = JIGSAW_PUZZLES.filter((p) => p.id !== lastPuzzleIdRef.current);
    const p = rand(pool.length ? pool : JIGSAW_PUZZLES);
    lastPuzzleIdRef.current = p.id;

    const key = ++pkeyRef.current;
    const gen = generateJigsaw(COLS, ROWS, p.size).map((pc) => ({ ...pc, clipId: `${key}-${pc.id}` }));
    const trayIds = shuffle(gen.map((pc) => pc.id));
    setPuzzle({ ...p, key });
    setPieces(gen);
    setPlaced(new Set());
    setTray(trayIds);
    setTarget(rand(trayIds));
    setFlying(null);
    setShakeId(null);
    setDone(false);
    setTimeout(() => speak(`Fais le puzzle : ${p.name}`), 350);
  }, []);

  useEffect(() => {
    newPuzzle();
    return () => {
      clearTimeout(roundTimerRef.current);
      clearTimeout(shakeTimerRef.current);
    };
  }, [newPuzzle]);

  const pieceById = useCallback((id) => pieces.find((p) => p.id === id), [pieces]);

  function selectPiece(id) {
    if (appState.locked || flying || done) return;

    if (id !== target) {
      // Mauvaise pièce : petit tremblement, on encourage, on réessaie.
      wrongSound();
      speak(rand(ENCOURAGE));
      setShakeId(id);
      clearTimeout(shakeTimerRef.current);
      shakeTimerRef.current = setTimeout(() => setShakeId(null), 550);
      return;
    }

    const piece = pieceById(id);
    const trayEl = trayRefs.current[id];
    const board = boardRef.current;
    if (!piece || !trayEl || !board) return;

    const from = trayEl.getBoundingClientRect();
    const b = board.getBoundingClientRect();
    const scale = b.width / puzzle.size;
    const to = {
      left: b.left + piece.bbox.x * scale,
      top: b.top + piece.bbox.y * scale,
      width: piece.bbox.w * scale,
      height: piece.bbox.h * scale,
    };

    appState.locked = true;
    pageSound();
    setTray((prev) => prev.filter((x) => x !== id));
    setFlying({ piece, from: { left: from.left, top: from.top, width: from.width, height: from.height }, to });
  }

  function finishFlight() {
    const piece = flying.piece;
    setFlying(null);
    popSound();
    spawnSnap(piece);
    setPlaced((prev) => {
      const next = new Set(prev);
      next.add(piece.id);
      const remaining = pieces.map((p) => p.id).filter((x) => !next.has(x));
      if (remaining.length === 0) {
        setDone(true);
        setTarget(null);
        setTimeout(() => {
          celebrate();
          speak(`Bravo ! Tu as fait ${puzzle.name} !`);
        }, 250);
        roundTimerRef.current = setTimeout(newPuzzle, 4000);
      } else {
        speak(rand(PRAISES));
        setTarget(rand(remaining));
        appState.locked = false;
      }
      return next;
    });
  }

  function spawnSnap(piece) {
    const stage = stageRef.current;
    const board = boardRef.current;
    if (!stage || !board) return;
    const sr = stage.getBoundingClientRect();
    const b = board.getBoundingClientRect();
    const scale = b.width / puzzle.size;
    const cx = b.left + piece.homeCx * scale - sr.left;
    const cy = b.top + piece.homeCy * scale - sr.top;
    const ring = document.createElement('div');
    ring.className = 'jigsaw-snap';
    ring.style.left = cx + 'px';
    ring.style.top = cy + 'px';
    stage.appendChild(ring);
    setTimeout(() => ring.remove(), 450);
  }

  if (!puzzle) return null;

  const placedPieces = pieces.filter((p) => placed.has(p.id));
  const targetPiece = target ? pieceById(target) : null;

  return (
    <>
      <div className="question">Fais le puzzle : {puzzle.name}</div>

      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
        <defs>
          {pieces.map((p) => (
            <clipPath key={p.id} id={`clip-${p.clipId}`} clipPathUnits="userSpaceOnUse">
              <path d={p.d} />
            </clipPath>
          ))}
        </defs>
      </svg>

      <div className="stage jigsaw-stage" ref={stageRef}>
        <div className={`jigsaw-board${done ? ' done' : ''}`} ref={boardRef}>
          <svg className="jigsaw-svg" viewBox={`0 0 ${puzzle.size} ${puzzle.size}`} xmlns="http://www.w3.org/2000/svg">
            <g className="jigsaw-ghost" dangerouslySetInnerHTML={{ __html: puzzle.image }} />
            {targetPiece && (
              <path d={targetPiece.d} className="slot-target" style={{ transformBox: 'fill-box', transformOrigin: 'center' }} />
            )}
            {placedPieces.map((p) => (
              <g className="piece-pop" key={p.id} style={{ transformBox: 'fill-box', transformOrigin: 'center' }}>
                <g clipPath={`url(#clip-${p.clipId})`} dangerouslySetInnerHTML={{ __html: puzzle.image }} />
                <path d={p.d} className="piece-outline-placed" />
              </g>
            ))}
          </svg>
        </div>
      </div>

      <div className="jigsaw-tray">
        {tray.map((id) => {
          const p = pieceById(id);
          if (!p) return null;
          return (
            <DwellButton
              key={id}
              ref={(node) => {
                if (node) trayRefs.current[id] = node;
              }}
              className={`tray-piece${shakeId === id ? ' shake' : ''}`}
              aria-label="pièce de puzzle"
              onClick={() => selectPiece(id)}
            >
              <PieceSvg piece={p} image={puzzle.image} className="piece-svg" />
            </DwellButton>
          );
        })}
      </div>

      {flying && (
        <motion.div
          className="flying-piece"
          initial={{ left: flying.from.left, top: flying.from.top, width: flying.from.width, height: flying.from.height, x: 0, y: 0, scale: 1 }}
          animate={{
            x: flying.to.left - flying.from.left,
            y: flying.to.top - flying.from.top,
            scale: flying.to.width / flying.from.width,
          }}
          transition={{ type: 'spring', stiffness: 170, damping: 20 }}
          onAnimationComplete={finishFlight}
          style={{ transformOrigin: '0 0' }}
        >
          <PieceSvg piece={flying.piece} image={puzzle.image} className="piece-svg" />
        </motion.div>
      )}
    </>
  );
}
