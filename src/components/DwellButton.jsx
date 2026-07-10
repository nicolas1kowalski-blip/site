import React, { forwardRef } from 'react';
import { useDwell } from '../hooks/useDwell.js';

// Bouton générique compatible clic au survol (commande oculaire). Le retour
// visuel de sélection (l'objet grandit et tremble) est géré par la classe
// .dwell-active posée par useDwell — aucun overlay à rendre ici.
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
      onPointerEnter={dwell.onPointerEnter}
      onPointerLeave={dwell.onPointerLeave}
      onPointerDown={dwell.onPointerDown}
      onPointerCancel={dwell.onPointerCancel}
      disabled={disabled}
      {...rest}
    >
      {children}
    </button>
  );
});
export default DwellButton;
