import React, { useEffect, useRef, useState } from 'react';
import BookPageRow from './BookPageRow.jsx';
import ZoneEditorModal from './ZoneEditorModal.jsx';
import { useBooks } from '../../context/BooksContext.jsx';
import { apiGetBook } from '../../lib/booksApi.js';
import { compressImage } from '../../lib/imageCompress.js';
import { rand, speak } from '../../lib/audio.js';

const BOOK_ACCENTS = ['#FFD93C', '#FF9FB5', '#A8D8A8', '#A8E0F0', '#D4B5E8', '#FFB07A'];

function emptyPage(id) {
  return { id, text: '', imageMode: 'none', imageSrc: null, zones: [] };
}

export default function AddBookModal({ open, editId, onClose }) {
  const { saveBook } = useBooks();
  const [title, setTitle] = useState('');
  const [pages, setPages] = useState([]);
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const [zoneEditorPageId, setZoneEditorPageId] = useState(null);
  const editingBookRef = useRef(null);
  const pageIdCounter = useRef(0);

  useEffect(() => {
    if (!open) return;
    setSaveError('');
    if (editId) {
      editingBookRef.current = null;
      setTitle('Chargement...');
      setPages([]);
      (async () => {
        try {
          const book = await apiGetBook(editId);
          editingBookRef.current = { id: book.id, accent: book.accent };
          setTitle(book.title || '');
          const loaded =
            book.pages && book.pages.length
              ? book.pages.map((p) => ({
                  id: ++pageIdCounter.current,
                  text: p.text || '',
                  imageMode: p.image ? 'existing' : 'none',
                  imageSrc: p.image || null,
                  zones: Array.isArray(p.zones) ? p.zones : [],
                }))
              : [emptyPage(++pageIdCounter.current)];
          setPages(loaded);
        } catch (e) {
          onClose();
          speak('Impossible de charger ce livre pour le modifier');
        }
      })();
    } else {
      editingBookRef.current = null;
      setTitle('');
      setPages([emptyPage(++pageIdCounter.current)]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editId]);

  if (!open) return null;

  function updatePage(id, fields) {
    setPages((prev) => prev.map((p) => (p.id === id ? { ...p, ...fields } : p)));
  }
  function removePage(id) {
    setPages((prev) => prev.filter((p) => p.id !== id));
  }
  function addPage() {
    setPages((prev) => [...prev, emptyPage(++pageIdCounter.current)]);
  }

  async function handleImportJson(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setSaveError('');
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data || typeof data.title !== 'string' || !data.title.trim()) {
        throw new Error('le champ "title" est manquant ou vide');
      }
      if (!Array.isArray(data.pages) || data.pages.length === 0) {
        throw new Error('le champ "pages" doit être une liste non vide');
      }
      const importedPages = data.pages.map((p) => {
        const hasImage = typeof p.image === 'string' && p.image.startsWith('data:image');
        return {
          id: ++pageIdCounter.current,
          text: typeof p.text === 'string' ? p.text : '',
          imageMode: hasImage ? 'new' : 'none',
          imageSrc: hasImage ? p.image : null,
          zones: [],
        };
      });
      editingBookRef.current = null;
      setTitle(data.title.trim());
      setPages(importedPages);
    } catch (err) {
      setSaveError(`Fichier JSON invalide : ${err.message}. Vérifiez le format attendu.`);
    }
  }

  async function handleSave() {
    setSaveError('');
    setSaving(true);

    const builtPages = [];
    let firstPageImageIsNew = false;
    for (const p of pages) {
      const text = p.text.trim();
      const mode = p.imageMode;
      if (!text && mode === 'none') continue;

      let image = null;
      if (mode === 'new') {
        image = await compressImage(p.imageSrc);
        if (!image) {
          setSaveError("Une des photos n'a pas pu être traitée (format non pris en charge). Essayez de la remplacer par un JPEG ou un PNG.");
          setSaving(false);
          return;
        }
      } else if (mode === 'existing') {
        image = p.imageSrc; // URL déjà hébergée, pas besoin de la retraiter
      }
      if (builtPages.length === 0 && mode === 'new') firstPageImageIsNew = true;
      builtPages.push({ text, image, plain: !image, zones: image ? p.zones : [] });
    }

    const titleTrim = title.trim();
    if (!titleTrim || builtPages.length === 0) {
      setSaveError('Il manque le titre ou au moins une page.');
      setSaving(false);
      return;
    }

    // On ne renvoie une nouvelle vignette de couverture que si la photo de la
    // première page vient d'être ajoutée/changée ; sinon le serveur garde
    // l'ancienne couverture (cas d'une modification sans toucher à cette page).
    const coverThumb = firstPageImageIsNew && builtPages[0].image ? await compressImage(builtPages[0].image, 220, 0.6) : null;
    const payload = {
      title: titleTrim,
      accent: (editingBookRef.current && editingBookRef.current.accent) || rand(BOOK_ACCENTS),
      pages: builtPages,
      coverThumb,
    };
    if (editingBookRef.current) payload.id = editingBookRef.current.id;

    const payloadMB = (JSON.stringify(payload).length / (1024 * 1024)).toFixed(1);
    if (payloadMB > 5.5) {
      setSaveError(
        `Ce livre pèse environ ${payloadMB} méga-octets, c'est trop pour être enregistré en une fois. Essayez de le diviser en deux livres, ou retirez une photo.`
      );
      setSaving(false);
      return;
    }

    try {
      await saveBook(payload);
      onClose();
    } catch (e) {
      setSaveError(e.message || "Impossible d'enregistrer le livre, vérifiez la connexion internet.");
    }
    setSaving(false);
  }

  const zoneEditorPage = pages.find((p) => p.id === zoneEditorPageId) || null;

  return (
    <>
      <div className="modal open">
        <div className="modal-content">
          <h2>{editId ? '📖 Modifier le livre' : '📖 Ajouter un livre'}</h2>
          {!editId && (
            <label className="btn-import-json">
              <span>📥 Importer depuis un fichier JSON :</span>
              <input type="file" accept="application/json,.json" onChange={handleImportJson} />
            </label>
          )}
          <label>
            <span>Titre du livre :</span>
            <input
              type="text"
              maxLength={60}
              placeholder="Ex : Le petit chat curieux"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <div className="modal-info">
            💡 Ajoutez une page à la fois : une photo (ou un scan) de la page, et son texte en dessous (pour que
            l'enfant puisse le suivre du regard). Ajoutez autant de pages que le livre en a.
            {!editId && (
              <>
                <br />
                <br />
                📥 <strong>Import JSON :</strong> {'{ "title": "...", "pages": [{ "text": "...", "image":'} <em>
                  "data:image/jpeg;base64,..." (optionnel)
                </em>
                {'} , ...] }'}. Les photos peuvent être ajoutées à la main après import.
              </>
            )}
          </div>
          <div className="book-pages-list">
            {pages.map((p, i) => (
              <BookPageRow
                key={p.id}
                page={p}
                index={i}
                onChange={(fields) => updatePage(p.id, fields)}
                onRemove={() => removePage(p.id)}
                onOpenZones={() => setZoneEditorPageId(p.id)}
              />
            ))}
          </div>
          <button type="button" className="btn-add-page" onClick={addPage}>
            ➕ Ajouter une page
          </button>
          {saveError && (
            <div className="modal-info" style={{ background: '#FFE0E0' }}>
              {saveError}
            </div>
          )}
          <div className="modal-buttons">
            <button className="btn-cancel" onClick={onClose}>
              Annuler
            </button>
            <button className="btn-save" disabled={saving} onClick={handleSave}>
              {saving ? 'Enregistrement...' : editId ? 'Enregistrer les modifications' : 'Enregistrer le livre'}
            </button>
          </div>
        </div>
      </div>

      <ZoneEditorModal
        open={!!zoneEditorPage}
        imageSrc={zoneEditorPage?.imageSrc}
        zones={zoneEditorPage?.zones || []}
        onDone={(zones) => {
          if (zoneEditorPageId) updatePage(zoneEditorPageId, { zones });
          setZoneEditorPageId(null);
        }}
      />
    </>
  );
}
