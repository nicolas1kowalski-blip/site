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

function PhotoZone({ zone }) {
  const ref = useGazeSpeak(zone.label);
  return (
    <div
      ref={ref}
      className="photo-zone speakable"
      style={{ left: zone.left + '%', top: zone.top + '%', width: zone.width + '%', height: zone.height + '%' }}
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

function Scene({ page }) {
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
              <PhotoZone key={i} zone={z} />
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
  const gazeTimerRef = useRef(null);
  const wordAdvanceTimerRef = useRef(null);

  // Nouvelle page : on repart d'une lecture vierge.
  useEffect(() => {
    setReadIdx(-1);
    setGazingIdx(null);
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
        <Scene page={pageData} />
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
                  onMouseEnter={() => handleWordEnter(i)}
                  onMouseLeave={handleWordLeave}
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
