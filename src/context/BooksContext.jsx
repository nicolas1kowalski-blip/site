import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  apiDeleteBook,
  apiListBooks,
  apiSaveBook,
  apiVerifyAdmin,
  clearAdminToken,
  getAdminToken,
  migrateLegacyBooksToServer,
  setAdminToken,
} from '../lib/booksApi.js';
import { speak } from '../lib/audio.js';

const BooksContext = createContext(null);
export function useBooks() {
  return useContext(BooksContext);
}

export function BooksProvider({ children }) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [customBooks, setCustomBooks] = useState([]);
  const [loginError, setLoginError] = useState(null);
  const [loggingIn, setLoggingIn] = useState(false);

  const refreshBooks = useCallback(async () => {
    try {
      const books = await apiListBooks();
      setCustomBooks(books);
    } catch (e) {
      setCustomBooks([]);
      console.warn('Livres du serveur indisponibles :', e);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const token = getAdminToken();
      let admin = false;
      if (token) {
        try {
          admin = (await apiVerifyAdmin(token)).ok;
        } catch (e) {
          admin = false;
        }
      }
      setIsAdmin(admin);
      if (admin) {
        try {
          await migrateLegacyBooksToServer();
        } catch (e) {}
      }
      await refreshBooks();
    })();
  }, [refreshBooks]);

  const login = useCallback(
    async (password) => {
      if (!password) return false;
      setLoggingIn(true);
      setLoginError(null);
      try {
        const { ok, reason } = await apiVerifyAdmin(password);
        if (ok) {
          setAdminToken(password);
          setIsAdmin(true);
          await refreshBooks();
          try {
            await migrateLegacyBooksToServer();
            await refreshBooks();
          } catch (e) {}
          setLoggingIn(false);
          return true;
        }
        if (reason === 'not-configured') {
          setLoginError(
            "Le mot de passe administrateur n'est pas encore configuré sur le serveur : ajoutez la variable ADMIN_PASSWORD dans Netlify (Site configuration → Environment variables), puis redéployez le site."
          );
        } else {
          setLoginError('Mot de passe incorrect.');
        }
      } catch (e) {
        setLoginError('Connexion impossible, vérifiez votre connexion internet.');
      }
      setLoggingIn(false);
      return false;
    },
    [refreshBooks]
  );

  const logout = useCallback(() => {
    clearAdminToken();
    setIsAdmin(false);
  }, []);

  const deleteBook = useCallback(async (id) => {
    let removed = null;
    setCustomBooks((prev) => {
      removed = prev.find((b) => b.id === id) || null;
      return prev.filter((b) => b.id !== id);
    });
    try {
      await apiDeleteBook(id);
    } catch (e) {
      // La suppression a échoué côté serveur : on remet le livre dans la liste
      // pour ne pas laisser croire qu'il a bien été supprimé.
      if (removed) setCustomBooks((prev) => (prev.some((b) => b.id === id) ? prev : [...prev, removed]));
      speak('Erreur pendant la suppression du livre, vérifiez la connexion internet');
    }
  }, []);

  const saveBook = useCallback(async (payload) => {
    const meta = await apiSaveBook(payload);
    setCustomBooks((prev) => {
      const idx = prev.findIndex((b) => b.id === meta.id);
      if (idx >= 0) {
        const copy = prev.slice();
        copy[idx] = meta;
        return copy;
      }
      return [...prev, meta];
    });
    return meta;
  }, []);

  const value = {
    isAdmin,
    customBooks,
    login,
    logout,
    loginError,
    loggingIn,
    clearLoginError: () => setLoginError(null),
    deleteBook,
    saveBook,
  };

  return <BooksContext.Provider value={value}>{children}</BooksContext.Provider>;
}
