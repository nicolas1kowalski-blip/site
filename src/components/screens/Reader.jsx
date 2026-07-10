import React, { useEffect, useRef, useState } from 'react';
import DwellButton from '../DwellButton.jsx';
import { appState } from '../../lib/appState.js';
import { gazeSound, pageSound, speak, spokenText, tokenizeWords } from '../../lib/audio.js';
import { attachGazeSpeakAll, useGazeSpeak } from '../../lib/gazeSpeak.js';
import { fitZoneLayer } from '../../lib/zoneLayer.js';
import { characterLabel, propLabel } from '../../data/storyLabels.js';

const PROP_POSITIONS = [
  { top: '8%', left: '6%' },
  { top: '10%', right: '8%' },
  { bottom: '12%', left: '8%' },
  { bottom: '14%', right: '10%' },
  { top: '50%', left: '4%' },
];

// Normalise un mot pour comparer nom de zone ↔ mot lu (minuscule, sans accents
// ni ponctuation).
const normalizeWord = (s) =>
  (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');

// Indices des zones dont le nom contient le mot lu (mots d'au moins 3 lettres,
// pour éviter de réagir sur « le », « la », « un »…).
function matchingZoneIdxs(word, zones) {
  const w = normalizeWord(word);
  if (w.length < 3 || !Array.isArray(zones)) return [];
  const out = [];
  zones.forEach((z, i) => {
    const parts = (z.label || '').split(/\s+/).map(normalizeWord);
    if (parts.some((p) => p.length >= 3 && p === w)) out.push(i);
  });
  return out;
}

function PhotoZone({ zone, pulse }) {
  const ref = useGazeSpeak(zone.label);
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (!pulse) return;
    const el = ref.current;
    if (!el || !el.animate) return;
    // Met en évidence le personnage : lueur dorée + petite pulsation.
    el.animate(
      [
        { boxShadow: '0 0 0 0 rgba(255,201,60,0)', background: 'rgba(255,201,60,0)', transform: 'scale(1)' },
        {
          offset: 0.18,
          boxShadow: '0 0 0 5px rgba(255,201,60,.95), 0 0 26px 8px rgba(255,201,60,.75)',
          background: 'rgba(255,201,60,.22)',
          transform: 'scale(1.07)',
        },
        { offset: 0.5, transform: 'scale(1.02)' },
        {
          offset: 0.68,
          boxShadow: '0 0 0 4px rgba(255,201,60,.85), 0 0 20px 6px rgba(255,201,60,.6)',
          background: 'rgba(255,201,60,.16)',
          transform: 'scale(1.05)',
        },
        { boxShadow: '0 0 0 0 rgba(255,201,60,0)', background: 'rgba(255,201,60,0)', transform: 'scale(1)' },
      ],
      { duration: 1700, easing: 'ease-out' }
    );
  }, [pulse]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div
      ref={ref}
      className="photo-zone speakable"
      style={{
        left: zone.left + '%',
        top: zone.top + '%',
        width: zone.width + '%',
        height: zone.height + '%',
        transformOrigin: 'center',
      }}
    />
  );
}
function PropItem({ emoji, index }) {
  const ref = useGazeSpeak(propLabel(emoji));
  const pos = PROP_POSITIONS[index % PROP_POSITIONS.length];
  return (
    <div ref={ref} className="prop speakable" style={{ ...pos, animationDelay: `${0.2 + index * 0.15}s` }}>
      {emoji}
    </div>
  );
}
function CharacterItem({ character }) {
  const ref = useGazeSpeak(characterLabel(character));
  return (
    <div ref={ref} className="character speakable">
      {character}
    </div>
  );
}

function Scene({ page, zonePulses }) {
  const sceneRef = useRef(null);
  const imgRef = useRef(null);
  const layerRef = useRef(null);

  useEffect(() => {
    if (!page?.svg) return;
    return attachGazeSpeakAll(sceneRef.current);
  }, [page]);

  useEffect(() => {
    if (!page?.image || !(page.zones && page.zones.length)) return;
    const img = imgRef.current;
    const layer = layerRef.current;
    const fit = () => fitZoneLayer(img, layer);
    if (img?.complete) fit();
    else img?.addEventListener('load', fit);
    window.addEventListener('resize', fit);
    return () => {
      img?.removeEventListener('load', fit);
      window.removeEventListener('resize', fit);
    };
  }, [page]);

  if (!page) return <div className="scene" />;

  if (page.svg) {
    return (
      <div className="scene scene-svg" ref={sceneRef}>
        <div className="svg-stage" dangerouslySetInnerHTML={{ __html: page.svg }} />
      </div>
    );
  }
  if (page.image) {
    const zones = Array.isArray(page.zones) ? page.zones : [];
    return (
      <div className="scene scene-photo">
        <div className="photo-zone-wrap">
          <img ref={imgRef} className="page-photo" src={page.image} alt="" />
          <div className="photo-zone-layer" ref={layerRef}>
            {zones.map((z, i) => (
              <PhotoZone key={i} zone={z} pulse={zonePulses?.[i] || 0} />
            ))}
          </div>
        </div>
      </div>
    );
  }
  if (page.plain) {
    return (
      <div className="scene scene-custom">
        <div className="book-icon">📖</div>
      </div>
    );
  }
  return (
    <div className={`scene scene-${page.scene}`}>
      {page.props.map((emo, i) => (
        <PropItem key={i} emoji={emo} index={i} />
      ))}
      <CharacterItem character={page.character} />
    </div>
  );
}

export default function Reader({ active, story, page, loading, onNext, onPrev }) {
  const pageData = story?.pages?.[page];
  const tokens = pageData ? tokenizeWords(pageData.text) : [];
  const [readIdx, setReadIdx] = useState(-1);
  const [gazingIdx, setGazingIdx] = useState(null);
  const [zonePulses, setZonePulses] = useState([]); // compteur par zone → relance l'animation de mise en évidence
  const gazeTimerRef = useRef(null);
  const wordAdvanceTimerRef = useRef(null);

  // Nouvelle page : on repart d'une lecture vierge.
  useEffect(() => {
    setReadIdx(-1);
    setGazingIdx(null);
    setZonePulses([]);
    if (gazeTimerRef.current) clearTimeout(gazeTimerRef.current);
    if (wordAdvanceTimerRef.current) clearTimeout(wordAdvanceTimerRef.current);
  }, [story?.id, page]);

  // Son de page + tourne-page automatique (optionnel, réglage "Tourner les pages automatiquement")
  useEffect(() => {
    if (!story || !pageData) return;
    pageSound();
    let t;
    if (appState.autoAdvance && page < story.pages.length - 1) {
      t = setTimeout(() => onNext(), 4000);
    }
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story?.id, page]);

  useEffect(() => {
    return () => {
      if (gazeTimerRef.current) clearTimeout(gazeTimerRef.current);
      if (wordAdvanceTimerRef.current) clearTimeout(wordAdvanceTimerRef.current);
    };
  }, []);

  function onWordRead(idx) {
    setReadIdx(idx);
    setGazingIdx(null);
    gazeSound();
    speak(spokenText(tokens[idx]), null, true);

    // Si le mot lu est le nom d'un personnage délimité sur l'image, on met en
    // évidence ce personnage (petite animation sur le dessin).
    const matched = matchingZoneIdxs(tokens[idx], pageData?.zones);
    if (matched.length) {
      setZonePulses((prev) => {
        const next = prev.slice();
        matched.forEach((i) => {
          next[i] = (next[i] || 0) + 1;
        });
        return next;
      });
    }

    if (idx === tokens.length - 1) {
      clearTimeout(wordAdvanceTimerRef.current);
      // Ne tourne automatiquement la page que s'il y en a une après : sur la
      // dernière page, on reste sur l'état "terminé" (tout en gris).
      if (story && page < story.pages.length - 1) {
        wordAdvanceTimerRef.current = setTimeout(() => onNext(), 900);
      }
    }
  }
  function handleWordEnter(idx) {
    if (!appState.wordGazeEnabled) return;
    if (idx !== readIdx + 1) return; // seul le mot attendu réagit au regard
    setGazingIdx(idx);
    gazeTimerRef.current = setTimeout(() => onWordRead(idx), appState.gazeReadTime);
  }
  function handleWordLeave() {
    if (gazeTimerRef.current) clearTimeout(gazeTimerRef.current);
    setGazingIdx(null);
  }

  const isLastPage = story && page === story.pages.length - 1;

  return (
    <section className={`screen${active ? ' active' : ''}`}>
      <div className="story-screen">
        <Scene page={pageData} zonePulses={zonePulses} />
        <div className="story-text">
          {loading
            ? 'Chargement du livre...'
            : tokens.map((w, i) => (
                <span
                  key={i}
                  className={
                    'story-word' +
                    (i <= readIdx ? ' word-read' : '') +
                    (i === readIdx + 1 ? ' word-next' : '') +
                    (gazingIdx === i ? ' gazing' : '')
                  }
                  onPointerEnter={() => handleWordEnter(i)}
                  onPointerLeave={handleWordLeave}
                  onPointerCancel={handleWordLeave}
                >
                  {w}
                </span>
              ))}
        </div>
        <div className="story-nav">
          <DwellButton className="story-btn" disabled={page === 0} onClick={onPrev}>
            <span className="arrow">◀</span> Avant
          </DwellButton>
          <div className="page-indicator">
            {story ? `${page + 1} / ${story.pages.length}` : ''}
          </div>
          <DwellButton className={`story-btn${isLastPage ? ' replay' : ''}`} onClick={onNext}>
            {isLastPage ? '🔁 Recommencer' : (
              <>
                Après <span className="arrow">▶</span>
              </>
            )}
          </DwellButton>
        </div>
      </div>
    </section>
  );
}
