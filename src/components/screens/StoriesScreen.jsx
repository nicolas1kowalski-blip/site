import React from 'react';
import DwellButton from '../DwellButton.jsx';
import { STORIES } from '../../data/stories.js';
import { useBooks } from '../../context/BooksContext.jsx';

export default function StoriesScreen({ active, onOpenStory, onAddBook, onEditBook }) {
  const { isAdmin, customBooks, deleteBook } = useBooks();
  const allStories = [...STORIES, ...customBooks];

  return (
    <section className={`screen${active ? ' active' : ''}`}>
      <div className="lib-grid">
        {allStories.map((s) => (
          <DwellButton
            key={s.id}
            className="card"
            style={{ '--card-bg': s.accent }}
            aria-label={s.title}
            onClick={() => onOpenStory(s.id)}
          >
            {s.coverSvg ? (
              <span dangerouslySetInnerHTML={{ __html: s.coverSvg }} />
            ) : s.coverImage ? (
              <img className="cover-photo" src={s.coverImage} alt="" />
            ) : (
              <div className="emoji">{s.cover}</div>
            )}
            <div>{s.title}</div>
            {s.custom && isAdmin && (
              <>
                <button
                  className="delete-book"
                  aria-label="Supprimer le livre"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteBook(s.id);
                  }}
                >
                  ✕
                </button>
                <button
                  className="edit-book"
                  aria-label="Modifier le livre"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEditBook(s.id);
                  }}
                >
                  ✏️
                </button>
              </>
            )}
          </DwellButton>
        ))}
        {isAdmin && (
          <DwellButton className="card add-book-btn" aria-label="Ajouter un livre" onClick={onAddBook}>
            <div className="emoji">➕</div>
            <div>Ajouter un livre</div>
          </DwellButton>
        )}
      </div>
    </section>
  );
}
