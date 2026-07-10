import React, { Suspense, lazy } from 'react';
import CountGame from '../games/CountGame.jsx';
import ColorsGame from '../games/ColorsGame.jsx';
import ShapesGame from '../games/ShapesGame.jsx';
import PuzzleGame from '../games/PuzzleGame.jsx';
import BodyGame from '../games/BodyGame.jsx';
import ShadowGame from '../games/ShadowGame.jsx';
import CompleteGame from '../games/CompleteGame.jsx';

// Le jeu des ballons embarque three.js (rendu 3D) : on le charge à la demande
// pour ne pas alourdir le démarrage des autres écrans.
const BalloonsGame = lazy(() => import('../games/BalloonsGame.jsx'));

const GAME_COMPONENTS = {
  count: CountGame,
  colors: ColorsGame,
  shapes: ShapesGame,
  puzzle: PuzzleGame,
  balloons: BalloonsGame,
  body: BodyGame,
  shadow: ShadowGame,
  complete: CompleteGame,
};

export default function GamePlay({ active, game }) {
  const GameComponent = game ? GAME_COMPONENTS[game] : null;
  return (
    <section className={`screen${active ? ' active' : ''}`}>
      {GameComponent && (
        <Suspense fallback={<div className="stage" style={{ display: 'grid', placeItems: 'center', fontSize: 'clamp(20px,3vw,32px)' }}>Chargement…</div>}>
          <GameComponent key={game} active={active} />
        </Suspense>
      )}
    </section>
  );
}
