import React, { useCallback, useEffect, useRef, useState } from 'react';

export default function ZoneEditorModal({ open, imageSrc, zones, onDone }) {
  const [workingZones, setWorkingZones] = useState([]);
  const [draft, setDraft] = useState(null);
  const imgRef = useRef(null);
  const dragStartRef = useRef(null);

  useEffect(() => {
    if (open) setWorkingZones((zones || []).map((z) => ({ ...z })));
  }, [open, zones]);

  const percentPos = useCallback((clientX, clientY) => {
    const img = imgRef.current;
    if (!img) return { x: 0, y: 0 };
    const rect = img.getBoundingClientRect();
    let x = ((clientX - rect.left) / rect.width) * 100;
    let y = ((clientY - rect.top) / rect.height) * 100;
    x = Math.max(0, Math.min(100, x));
    y = Math.max(0, Math.min(100, y));
    return { x, y };
  }, []);

  const handleDown = useCallback(
    (e) => {
      if (e.target.closest && e.target.closest('.zone-box')) return;
      const point = e.touches ? e.touches[0] : e;
      const start = percentPos(point.clientX, point.clientY);
      dragStartRef.current = start;
      setDraft({ left: start.x, top: start.y, width: 0, height: 0 });
    },
    [percentPos]
  );
  const handleMove = useCallback(
    (e) => {
      if (!dragStartRef.current) return;
      const point = e.touches ? e.touches[0] : e;
      const p = percentPos(point.clientX, point.clientY);
      const start = dragStartRef.current;
      setDraft({
        left: Math.min(start.x, p.x),
        top: Math.min(start.y, p.y),
        width: Math.abs(p.x - start.x),
        height: Math.abs(p.y - start.y),
      });
    },
    [percentPos]
  );
  const handleUp = useCallback(
    (e) => {
      if (!dragStartRef.current) return;
      const point = e.changedTouches ? e.changedTouches[0] : e;
      const p = percentPos(point.clientX, point.clientY);
      const start = dragStartRef.current;
      const left = Math.min(start.x, p.x);
      const top = Math.min(start.y, p.y);
      const width = Math.abs(p.x - start.x);
      const height = Math.abs(p.y - start.y);
      dragStartRef.current = null;
      setDraft(null);
      if (width < 3 || height < 3) return; // trop petit : probablement un clic accidentel
      const label = window.prompt("Nom de cette zone (ce que l'enfant entendra) :", '');
      if (label && label.trim()) {
        setWorkingZones((prev) => [...prev, { left, top, width, height, label: label.trim() }]);
      }
    },
    [percentPos]
  );

  // Le glisser peut se poursuivre en dehors de la zone de dessin : on écoute
  // le mouvement/relâchement au niveau de la fenêtre, pas seulement du cadre.
  useEffect(() => {
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [handleMove, handleUp]);

  function renameZone(idx) {
    const next = window.prompt("Nom de cette zone (ce que l'enfant entendra) :", workingZones[idx].label);
    if (next !== null && next.trim()) {
      setWorkingZones((prev) => {
        const copy = prev.slice();
        copy[idx] = { ...copy[idx], label: next.trim() };
        return copy;
      });
    }
  }
  function deleteZone(idx) {
    setWorkingZones((prev) => prev.filter((_, i) => i !== idx));
  }

  return (
    <div className={`modal${open ? ' open' : ''}`}>
      <div className="modal-content" style={{ maxWidth: 800 }}>
        <h2>🎯 Zones interactives</h2>
        <div className="modal-info">
          💡 Cliquez et glissez sur la photo pour dessiner une zone autour d'un personnage ou d'un objet, puis
          donnez-lui un nom. En regardant cette zone, l'enfant entendra ce nom prononcé à voix haute. Cliquez sur le
          nom d'une zone pour le modifier, ou sur le ✕ pour la supprimer.
        </div>
        <div className="zone-editor-stage" onMouseDown={handleDown} onTouchStart={handleDown} onTouchMove={handleMove} onTouchEnd={handleUp}>
          {open && <img id="zoneEditorImg" ref={imgRef} src={imageSrc} alt="" />}
          <div className="zone-editor-overlay">
            {workingZones.map((z, i) => (
              <div
                key={i}
                className="zone-box"
                style={{ left: z.left + '%', top: z.top + '%', width: z.width + '%', height: z.height + '%' }}
              >
                <span
                  className="zone-label"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    renameZone(i);
                  }}
                >
                  {z.label}
                </span>
                <button
                  type="button"
                  className="zone-delete"
                  aria-label="Supprimer cette zone"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteZone(i);
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
            {draft && (
              <div
                className="zone-draft"
                style={{ left: draft.left + '%', top: draft.top + '%', width: draft.width + '%', height: draft.height + '%' }}
              />
            )}
          </div>
        </div>
        <div className="modal-buttons">
          <button className="btn-save" style={{ flex: 1 }} onClick={() => onDone(workingZones)}>
            Terminé
          </button>
        </div>
      </div>
    </div>
  );
}
