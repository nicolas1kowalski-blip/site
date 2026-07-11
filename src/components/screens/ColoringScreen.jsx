import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DwellButton from '../DwellButton.jsx';
import { appState } from '../../lib/appState.js';
import { PALETTE, BUILTIN_COLORINGS } from '../../data/colorings.js';
import { floodFill, makeFiller, paletteSwatchCanvas } from '../../lib/coloring.js';
import { popSound, speak } from '../../lib/audio.js';

const W = 800;
const H = 800;
const svgDataUrl = (svg) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);

export default function ColoringScreen({ active }) {
  const [pageIdx, setPageIdx] = useState(0);
  const [spec, setSpec] = useState(PALETTE[0]);

  const stageRef = useRef(null);
  const canvasRef = useRef(null);
  const ringRef = useRef(null);
  const imgDataRef = useRef(null);
  const dwellRef = useRef({ cx: 0, cy: 0, timer: null, active: false });
  const specRef = useRef(spec);
  specRef.current = spec;

  const pages = BUILTIN_COLORINGS;
  const swatchUrls = useMemo(() => PALETTE.map((s) => paletteSwatchCanvas(s)), []);
  const pageThumbs = useMemo(() => pages.map((p) => svgDataUrl(p.svg)), [pages]);

  const drawPage = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, W, H);
      ctx.drawImage(img, 0, 0, W, H);
      imgDataRef.current = ctx.getImageData(0, 0, W, H);
    };
    img.src = svgDataUrl(pages[pageIdx].svg);
  }, [pageIdx, pages]);

  useEffect(() => {
    if (active) drawPage();
  }, [active, drawPage]);

  function fillAt(clientX, clientY) {
    const canvas = canvasRef.current;
    const img = imgDataRef.current;
    if (!canvas || !img) return;
    const rect = canvas.getBoundingClientRect();
    const px = Math.round(((clientX - rect.left) / rect.width) * W);
    const py = Math.round(((clientY - rect.top) / rect.height) * H);
    const n = floodFill(img, px, py, makeFiller(specRef.current));
    if (n > 0) {
      canvas.getContext('2d', { willReadFrequently: true }).putImageData(img, 0, 0);
      popSound();
    }
  }

  function showRing(clientX, clientY) {
    const ring = ringRef.current;
    const stage = stageRef.current;
    if (!ring || !stage) return;
    const r = stage.getBoundingClientRect();
    ring.style.left = clientX - r.left + 'px';
    ring.style.top = clientY - r.top + 'px';
    ring.style.display = 'block';
    ring.animate(
      [
        { transform: 'translate(-50%,-50%) scale(0.2)', opacity: 0.6 },
        { transform: 'translate(-50%,-50%) scale(1)', opacity: 0.85 },
      ],
      { duration: appState.dwellTime, easing: 'linear' }
    );
  }
  function hideRing() {
    if (ringRef.current) ringRef.current.style.display = 'none';
  }

  function startDwell(clientX, clientY) {
    if (!appState.dwellEnabled || appState.locked) return;
    const d = dwellRef.current;
    clearTimeout(d.timer);
    d.cx = clientX;
    d.cy = clientY;
    d.active = true;
    showRing(clientX, clientY);
    d.timer = setTimeout(() => {
      d.active = false;
      hideRing();
      fillAt(clientX, clientY);
    }, appState.dwellTime);
  }
  function cancelDwell() {
    const d = dwellRef.current;
    clearTimeout(d.timer);
    d.active = false;
    hideRing();
  }

  function onPointerMove(e) {
    if (!appState.dwellEnabled) return;
    const d = dwellRef.current;
    if (d.active && Math.hypot(e.clientX - d.cx, e.clientY - d.cy) < 16) return;
    startDwell(e.clientX, e.clientY);
  }
  function onPointerDown() {
    cancelDwell();
  }
  function onClick(e) {
    // Souris / tactile : remplissage direct au clic.
    cancelDwell();
    fillAt(e.clientX, e.clientY);
  }

  useEffect(() => () => cancelDwell(), []);

  return (
    <section className={`screen coloring${active ? ' active' : ''}`}>
      <div className="coloring-top">
        <div className="coloring-stage" ref={stageRef}>
          <canvas
            ref={canvasRef}
            width={W}
            height={H}
            className="coloring-canvas"
            onPointerMove={onPointerMove}
            onPointerLeave={cancelDwell}
            onPointerCancel={cancelDwell}
            onPointerDown={onPointerDown}
            onClick={onClick}
          />
          <div className="color-ring" ref={ringRef} />
        </div>
        <div className="coloring-tools">
          {pages.map((p, i) => (
            <DwellButton
              key={p.id}
              className={`coloring-page-btn${i === pageIdx ? ' sel' : ''}`}
              aria-label={`Colorier ${p.name}`}
              onClick={() => setPageIdx(i)}
            >
              <img src={pageThumbs[i]} alt="" />
            </DwellButton>
          ))}
          <DwellButton className="coloring-reset" aria-label="Recommencer le coloriage" onClick={drawPage}>
            🔄
          </DwellButton>
        </div>
      </div>

      <div className="palette">
        {PALETTE.map((s, i) => (
          <DwellButton
            key={s.id}
            className={`swatch swatch-${s.type || 'solid'}${spec.id === s.id ? ' sel' : ''}`}
            aria-label={s.name}
            onClick={() => {
              setSpec(s);
              speak(s.name);
            }}
          >
            <img src={swatchUrls[i]} alt="" />
          </DwellButton>
        ))}
      </div>
    </section>
  );
}
