import React, { useEffect, useRef, useState } from 'react';
import DwellButton from '../DwellButton.jsx';
import { speak } from '../../lib/audio.js';

function detectSpotify(url) {
  return /open\.spotify\.com/i.test(url);
}
function spotifyToEmbed(url) {
  if (/\/embed\//.test(url)) return url.split('?')[0];
  return url.replace(/open\.spotify\.com\//i, 'open.spotify.com/embed/').split('?')[0];
}

export default function Songs({ active }) {
  const [songsData, setSongsData] = useState([]);
  const [currentSong, setCurrentSong] = useState(null);
  const [isPaused, setIsPaused] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const audioRef = useRef(null);
  const songsDataRef = useRef([]);
  songsDataRef.current = songsData;

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        try {
          audioRef.current.pause();
        } catch (e) {}
      }
    };
  }, []);

  // En quittant cet écran (changement d'onglet, bouton retour), on arrête
  // la lecture en cours — comme dans la version précédente.
  useEffect(() => {
    if (!active) stopCurrentSong();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  function stopCurrentSong() {
    if (audioRef.current) {
      try {
        audioRef.current.pause();
      } catch (e) {}
      audioRef.current = null;
    }
    setCurrentSong(null);
  }

  function playSong(song) {
    if (audioRef.current) {
      try {
        audioRef.current.pause();
      } catch (e) {}
      audioRef.current = null;
    }
    setCurrentSong(song);
    if (song.type !== 'spotify') {
      const audio = new Audio(song.url);
      audioRef.current = audio;
      setIsPaused(false);
      audio.play().catch((err) => {
        console.warn('Erreur lecture audio:', err);
        speak('Désolé, je ne peux pas lire ce fichier');
      });
      audio.addEventListener('ended', () => {
        const list = songsDataRef.current;
        const idx = list.findIndex((s) => s.url === song.url);
        if (idx >= 0 && idx < list.length - 1) playSong(list[idx + 1]);
      });
    }
  }

  function deleteSong(idx) {
    const songToDelete = songsData[idx];
    if (currentSong && currentSong.url === songToDelete.url) stopCurrentSong();
    setSongsData((prev) => prev.filter((_, i) => i !== idx));
  }

  function handleSave() {
    const title = newTitle.trim();
    const url = newUrl.trim();
    if (!title || !url) {
      speak('Il manque le nom ou le lien');
      return;
    }
    const type = detectSpotify(url) ? 'spotify' : 'audio';
    setSongsData((prev) => [...prev, { title, url, type }]);
    setModalOpen(false);
    setNewTitle('');
    setNewUrl('');
  }

  function togglePlayPause() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.play();
      setIsPaused(false);
    } else {
      audio.pause();
      setIsPaused(true);
    }
  }
  function playPrev() {
    const idx = songsData.findIndex((s) => s.url === currentSong?.url);
    if (idx > 0) playSong(songsData[idx - 1]);
  }
  function playNext() {
    const idx = songsData.findIndex((s) => s.url === currentSong?.url);
    if (idx < songsData.length - 1) playSong(songsData[idx + 1]);
  }

  return (
    <section className={`screen${active ? ' active' : ''}`}>
      <div className="songs-screen">
        {!currentSong ? (
          <div className="song-player empty">Choisis une chanson dans la liste ci-dessous</div>
        ) : currentSong.type === 'spotify' ? (
          <div className="song-player">
            <iframe
              title={currentSong.title}
              src={spotifyToEmbed(currentSong.url)}
              allow="encrypted-media; autoplay"
              allowTransparency="true"
            />
          </div>
        ) : (
          <div className="song-player">
            <div className="song-player-info">
              <div className="song-player-title">🎵 {currentSong.title}</div>
            </div>
            <div className="song-player-controls">
              <DwellButton className="btn-icon" aria-label="Précédent" onClick={playPrev}>
                ⏮
              </DwellButton>
              <DwellButton className="btn-icon" aria-label="Lecture/Pause" onClick={togglePlayPause}>
                {isPaused ? '▶' : '⏸'}
              </DwellButton>
              <DwellButton className="btn-icon" aria-label="Suivant" onClick={playNext}>
                ⏭
              </DwellButton>
            </div>
          </div>
        )}

        <div className="songs-list">
          {songsData.map((song, idx) => (
            <DwellButton
              key={song.url + idx}
              className={`song-card${currentSong && currentSong.url === song.url ? ' playing' : ''}`}
              onClick={(e) => {
                if (e.target.closest('.delete')) return;
                playSong(song);
              }}
            >
              <span className="icon">{song.type === 'spotify' ? '🎧' : '🎵'}</span>
              <span className="title">{song.title}</span>
              <button
                className="delete"
                aria-label="Supprimer"
                onClick={(e) => {
                  e.stopPropagation();
                  deleteSong(idx);
                }}
              >
                ✕
              </button>
            </DwellButton>
          ))}
          <DwellButton className="song-card add-song-btn" onClick={() => setModalOpen(true)}>
            <span className="icon">➕</span>
            <span className="title">Ajouter</span>
          </DwellButton>
        </div>
      </div>

      <div className={`modal${modalOpen ? ' open' : ''}`}>
        <div className="modal-content">
          <h2>🎵 Ajouter une chanson</h2>
          <label>
            <span>Nom de la chanson :</span>
            <input
              type="text"
              maxLength={60}
              placeholder="Ex : Mes comptines préférées"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
            />
          </label>
          <label>
            <span>Lien (URL) :</span>
            <input type="text" placeholder="https://..." value={newUrl} onChange={(e) => setNewUrl(e.target.value)} />
          </label>
          <div className="modal-info">
            💡 <strong>Formats acceptés :</strong>
            <br />
            • <strong>Spotify</strong> : copiez un lien depuis Spotify (titre, album ou playlist). Exemple :{' '}
            <em>https://open.spotify.com/playlist/...</em>
            <br />
            • <strong>Fichier audio MP3/OGG</strong> : URL directe vers un fichier audio en ligne
            <br />
            <br />
            <strong>Pour Spotify :</strong> vous devez être connecté(e) à votre compte Spotify dans le navigateur pour
            que la lecture fonctionne.
          </div>
          <div className="modal-buttons">
            <button
              className="btn-cancel"
              onClick={() => {
                setModalOpen(false);
                setNewTitle('');
                setNewUrl('');
              }}
            >
              Annuler
            </button>
            <button className="btn-save" onClick={handleSave}>
              Ajouter
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
