import React from 'react';
import CountGame from '../games/CountGame.jsx';
import ColorsGame from '../games/ColorsGame.jsx';
import ShapesGame from '../games/ShapesGame.jsx';
import PuzzleGame from '../games/PuzzleGame.jsx';
import BalloonsGame from '../games/BalloonsGame.jsx';
import BodyGame from '../games/BodyGame.jsx';

const GAME_COMPONENTS = {
  count: CountGame,
  colors: ColorsGame,
  shapes: ShapesGame,
  puzzle: PuzzleGame,
  balloons: BalloonsGame,
  body: BodyGame,
};

export default function GamePlay({ active, game }) {
  const GameComponent = game ? GAME_COMPONENTS[game] : null;
  return (
    <section className={`screen${active ? ' active' : ''}`}>
      {GameComponent && <GameComponent key={game} active={active} />}
    </section>
  );
}
