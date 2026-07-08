import React, { forwardRef } from 'react';
import { useDwell } from '../hooks/useDwell.js';

// Bouton générique compatible clic au survol (commande oculaire). Englobe
// automatiquement l'anneau de progression (.dwell-ring).
const DwellButton = forwardRef(function DwellButton(
  { onClick, disabled, children, ...rest },
  forwardedRef
) {
  const dwell = useDwell(onClick, disabled);
  return (
    <button
      ref={(node) => {
        dwell.ref.current = node;
        if (typeof forwardedRef === 'function') forwardedRef(node);
        else if (forwardedRef) forwardedRef.current = node;
      }}
      onClick={onClick}
      onMouseEnter={dwell.onMouseEnter}
      onMouseLeave={dwell.onMouseLeave}
      onPointerDown={dwell.onPointerDown}
      disabled={disabled}
      {...rest}
    >
      {children}
      <div className="dwell-ring" />
    </button>
  );
});
export default DwellButton;
