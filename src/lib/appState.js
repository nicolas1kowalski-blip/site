// État d'interaction partagé (commande oculaire, son) — lu de façon impérative
// par les hooks de dwell/regard au moment des événements, plutôt que par le
// cycle de rendu React. Ça reproduit le comportement de l'ancienne version
// (un seul objet d'état global) pour les réglages qui n'ont pas besoin de
// déclencher un nouveau rendu à chaque changement.
export const appState = {
  dwellEnabled: true,
  dwellTime: 1500,
  gazeReadEnabled: true,
  gazeReadTime: 700,
  soundEnabled: true,
  speechRate: 0.9,
  wordGazeEnabled: true,
  autoAdvance: false,
  locked: false,
};
