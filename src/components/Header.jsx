import React from 'react';
import DwellButton from './DwellButton.jsx';

export default function Header({ showBack, onBack, onOpenSettings }) {
  return (
    <header>
      <h1 className="title">
        <span className="star">★</span> Mes Premiers Jeux
      </h1>
      <div className="header-controls">
        {showBack && (
          <DwellButton className="btn-icon" aria-label="Retour" onClick={onBack}>
            🏠
          </DwellButton>
        )}
        <DwellButton className="btn-icon" aria-label="Paramètres" onClick={onOpenSettings}>
          ⚙️
        </DwellButton>
      </div>
    </header>
  );
}
