import React, { useCallback, useState } from 'react';
import { BooksProvider, useBooks } from './context/BooksContext.jsx';
import { FeedbackProvider } from './context/FeedbackContext.jsx';
import Header from './components/Header.jsx';
import Tabs from './components/Tabs.jsx';
import SettingsPanel from './components/SettingsPanel.jsx';
import StoriesScreen from './components/screens/StoriesScreen.jsx';
import Reader from './components/screens/Reader.jsx';
import GamesMenu from './components/screens/GamesMenu.jsx';
import GamePlay from './components/screens/GamePlay.jsx';
import MusicMenu from './components/screens/MusicMenu.jsx';
import Xylophone from './components/screens/Xylophone.jsx';
import Songs from './components/screens/Songs.jsx';
import AddBookModal from './components/modals/AddBookModal.jsx';
import { STORIES } from './data/stories.js';
import { apiGetBook } from './lib/booksApi.js';
import { ensureAudio, speak } from './lib/audio.js';

function AppInner() {
  const [tab, setTab] = useState('stories');
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [inStory, setInStory] = useState(false);
  const [story, setStory] = useState(null);
  const [storyLoading, setStoryLoading] = useState(false);
  const [page, setPage] = useState(0);

  const [inGame, setInGame] = useState(false);
  const [game, setGame] = useState(null);

  const [musicSub, setMusicSub] = useState(null); // null | 'xylo' | 'songs'

  const [bookModal, setBookModal] = useState({ open: false, editId: null });

  const { customBooks } = useBooks();

  const showBack = Boolean(inGame || inStory || musicSub);

  function switchTab(next) {
    setTab(next);
    setInGame(false);
    setGame(null);
    setInStory(false);
    setStory(null);
    setMusicSub(null);
    speechSynthesis?.cancel();
  }

  function handleBack() {
    if (inGame) {
      setInGame(false);
      setGame(null);
    } else if (inStory) {
      setInStory(false);
      setStory(null);
      speechSynthesis?.cancel();
    } else if (musicSub) {
      setMusicSub(null);
    }
  }

  const openStory = useCallback(
    async (id) => {
      ensureAudio();
      const allStories = [...STORIES, ...customBooks];
      let s = allStories.find((x) => x.id === id);
      if (!s) return;
      setInStory(true);
      setPage(0);
      if (s.custom && !s.pages) {
        // Livre côté serveur : on ne connaît que la fiche légère, on charge le contenu complet
        setStoryLoading(true);
        setStory(null);
        try {
          s = await apiGetBook(id);
        } catch (e) {
          speak('Impossible de charger ce livre, vérifiez la connexion internet');
          setInStory(false);
          setStoryLoading(false);
          return;
        }
        setStoryLoading(false);
      }
      setStory(s);
    },
    [customBooks]
  );

  const nextPage = useCallback(() => {
    setPage((p) => {
      if (!story) return p;
      return p < story.pages.length - 1 ? p + 1 : 0;
    });
  }, [story]);
  const prevPage = useCallback(() => {
    setPage((p) => Math.max(0, p - 1));
  }, []);

  function startGame(g) {
    ensureAudio();
    setGame(g);
    setInGame(true);
  }

  return (
    <>
      <div className="clouds" aria-hidden="true">
        <div className="cloud">☁️</div>
        <div className="cloud">☁️</div>
        <div className="cloud">☁️</div>
      </div>
      <div className="app">
        <Header showBack={showBack} onBack={handleBack} onOpenSettings={() => setSettingsOpen(true)} />
        <Tabs active={tab} onSelect={switchTab} />

        <StoriesScreen
          active={tab === 'stories' && !inStory}
          onOpenStory={openStory}
          onAddBook={() => setBookModal({ open: true, editId: null })}
          onEditBook={(id) => setBookModal({ open: true, editId: id })}
        />
        <Reader
          active={tab === 'stories' && inStory}
          story={story}
          page={page}
          loading={storyLoading}
          onNext={nextPage}
          onPrev={prevPage}
        />

        <GamesMenu active={tab === 'games' && !inGame} onStartGame={startGame} />
        <GamePlay active={tab === 'games' && inGame} game={game} />

        <MusicMenu active={tab === 'music' && !musicSub} onSelect={setMusicSub} />
        <Xylophone active={tab === 'music' && musicSub === 'xylo'} />
        <Songs active={tab === 'music' && musicSub === 'songs'} />
      </div>

      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <AddBookModal
        open={bookModal.open}
        editId={bookModal.editId}
        onClose={() => setBookModal({ open: false, editId: null })}
      />
    </>
  );
}

export default function App() {
  return (
    <FeedbackProvider>
      <BooksProvider>
        <AppInner />
      </BooksProvider>
    </FeedbackProvider>
  );
}
