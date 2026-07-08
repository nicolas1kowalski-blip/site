import React from 'react';
import { speak } from '../../lib/audio.js';
import { readFileAsDataURL } from '../../lib/imageCompress.js';

export default function BookPageRow({ page, index, onChange, onRemove, onOpenZones }) {
  async function handleFileChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (/heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name)) {
      speak(
        'Ce format de photo (HEIC) n\'est pas pris en charge par les navigateurs. Sur iPhone, allez dans Réglages > Appareil photo > Formats, et choisissez "Le plus compatible", puis reprenez la photo.'
      );
      e.target.value = '';
      return;
    }
    const dataUrl = await readFileAsDataURL(file);
    onChange({ imageMode: 'new', imageSrc: dataUrl, zones: [] });
  }

  const hasImage = page.imageMode !== 'none' && page.imageSrc;

  return (
    <div className="book-page-row">
      <div className="book-page-row-header">
        <strong>Page {index + 1}</strong>
        <button type="button" className="btn-remove-page" aria-label="Supprimer cette page" onClick={onRemove}>
          ✕
        </button>
      </div>
      <input type="file" accept="image/*" capture="environment" aria-label="Photo de la page" className="page-image-input" onChange={handleFileChange} />
      {hasImage && <img className="page-thumb" src={page.imageSrc} alt="" />}
      {hasImage && (
        <button
          type="button"
          className="btn-remove-photo"
          onClick={() => onChange({ imageMode: 'none', imageSrc: null, zones: [] })}
        >
          ✕ Retirer la photo
        </button>
      )}
      {hasImage && (
        <button type="button" className="btn-zones" onClick={onOpenZones}>
          🎯 Zones interactives{page.zones.length > 0 ? ` (${page.zones.length})` : ''}
        </button>
      )}
      <textarea
        placeholder="Texte de cette page..."
        value={page.text}
        onChange={(e) => onChange({ text: e.target.value })}
      />
    </div>
  );
}
