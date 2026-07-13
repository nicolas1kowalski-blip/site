using System;

namespace MesPremiersJeux.Gaze
{
    /// <summary>
    /// Pause du pilotage au regard pendant les tâches « parent » : chaque fenêtre
    /// d'édition appelle Push() à l'ouverture et Pop() à la fermeture, pour que le
    /// dwell n'injecte pas de clics pendant qu'on utilise la souris.
    /// </summary>
    public static class GazeGate
    {
        /// <summary>Notifié quand l'état de pause change (true = regard en pause).</summary>
        public static Action<bool> PauseChanged;

        private static int _count;

        public static bool IsPaused => _count > 0;

        public static void Push()
        {
            _count++;
            if (_count == 1) PauseChanged?.Invoke(true);
        }

        public static void Pop()
        {
            if (_count > 0 && --_count == 0) PauseChanged?.Invoke(false);
        }
    }
}
