// Positionne la couche de zones interactives exactement sur la zone visible
// de la photo (qui peut être plus petite que son conteneur à cause de
// object-fit:contain), pour que les pourcentages définis dans l'éditeur de
// zones correspondent pile à ce que voit l'enfant.
export function fitZoneLayer(imgEl, layerEl) {
  if (!imgEl || !layerEl) return;
  const wrap = imgEl.parentElement;
  const wrapRect = wrap.getBoundingClientRect();
  const imgRect = imgEl.getBoundingClientRect();
  layerEl.style.left = imgRect.left - wrapRect.left + 'px';
  layerEl.style.top = imgRect.top - wrapRect.top + 'px';
  layerEl.style.width = imgRect.width + 'px';
  layerEl.style.height = imgRect.height + 'px';
}
