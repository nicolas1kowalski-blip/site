const BOOKS_API = '/api/books';
const ADMIN_TOKEN_KEY = 'adminToken';

export function getAdminToken() {
  try {
    return localStorage.getItem(ADMIN_TOKEN_KEY) || '';
  } catch (e) {
    return '';
  }
}
export function setAdminToken(token) {
  try {
    localStorage.setItem(ADMIN_TOKEN_KEY, token);
  } catch (e) {}
}
export function clearAdminToken() {
  try {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
  } catch (e) {}
}
function adminHeaders() {
  return { 'x-admin-token': getAdminToken() };
}
async function apiErrorDetail(res) {
  try {
    return (await res.json()).error || null;
  } catch (e) {
    return null;
  }
}

export async function apiVerifyAdmin(token) {
  const res = await fetch(BOOKS_API + '?verify=1', { headers: { 'x-admin-token': token } });
  let reason = null;
  if (!res.ok) {
    try {
      reason = (await res.json()).error;
    } catch (e) {}
  }
  return { ok: res.ok, reason };
}
export async function apiListBooks() {
  const res = await fetch(BOOKS_API);
  if (!res.ok) throw new Error('Échec du chargement des livres');
  return res.json();
}
export async function apiGetBook(id) {
  const res = await fetch(BOOKS_API + '?id=' + encodeURIComponent(id));
  if (!res.ok) throw new Error('Échec du chargement du livre');
  return res.json();
}
export async function apiSaveBook(book) {
  const res = await fetch(BOOKS_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...adminHeaders() },
    body: JSON.stringify(book),
  });
  if (res.status === 401) throw new Error("Mot de passe administrateur requis ou expiré");
  if (!res.ok) throw new Error((await apiErrorDetail(res)) || "Échec de l'enregistrement du livre");
  return res.json();
}
export async function apiDeleteBook(id) {
  const res = await fetch(BOOKS_API + '?id=' + encodeURIComponent(id), { method: 'DELETE', headers: adminHeaders() });
  if (res.status === 401) throw new Error("Mot de passe administrateur requis ou expiré");
  if (!res.ok) throw new Error((await apiErrorDetail(res)) || 'Échec de la suppression du livre');
  return res.json();
}

// ----- Migration ponctuelle des livres créés avec les anciennes versions -----
const BOOKS_DB_NAME = 'MesLivresDB';
const BOOKS_STORE = 'books';
let booksDbPromise = null;
function openBooksDB() {
  if (booksDbPromise) return booksDbPromise;
  booksDbPromise = new Promise((resolve) => {
    if (!window.indexedDB) {
      resolve(null);
      return;
    }
    const req = indexedDB.open(BOOKS_DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(BOOKS_STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
  return booksDbPromise;
}
async function dbGetAllBooks() {
  const db = await openBooksDB();
  if (!db) return [];
  return new Promise((resolve) => {
    const req = db.transaction(BOOKS_STORE, 'readonly').objectStore(BOOKS_STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => resolve([]);
  });
}
async function dbClearAllBooks() {
  const db = await openBooksDB();
  if (!db) return;
  return new Promise((resolve) => {
    const tx = db.transaction(BOOKS_STORE, 'readwrite');
    tx.objectStore(BOOKS_STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}
export async function migrateLegacyBooksToServer() {
  let legacy = [];
  try {
    const raw = localStorage.getItem('customBooks');
    if (raw) {
      legacy = legacy.concat(
        JSON.parse(raw).map((b) => ({
          title: b.title,
          accent: b.accent,
          pages: (b.pages || []).map((p) => ({ text: p.text || '', image: null, plain: true })),
        }))
      );
    }
  } catch (e) {}
  try {
    const idbBooks = await dbGetAllBooks();
    legacy = legacy.concat(
      idbBooks.map((b) => ({
        title: b.title,
        accent: b.accent,
        pages: (b.pages || []).map((p) => ({ text: p.text || '', image: p.image || null, plain: !p.image })),
        coverThumb: b.coverImage || null,
      }))
    );
  } catch (e) {}
  if (!legacy.length) return;
  for (const b of legacy) {
    if (!b.title || !b.pages.length) continue;
    await apiSaveBook(b);
  }
  try {
    localStorage.removeItem('customBooks');
  } catch (e) {}
  await dbClearAllBooks();
}
