using System;

namespace MesPremiersJeux.Lib
{
    /// <summary>
    /// Mode « immersif » : pendant une activité (un jeu ouvert, un livre en lecture,
    /// un dessin en cours de coloriage…), la barre d'onglets du haut est masquée pour
    /// laisser le MAXIMUM d'écran à l'activité. Revenir au menu de l'activité la
    /// réaffiche. La fenêtre principale écoute <see cref="Changed"/>.
    /// </summary>
    public static class Chrome
    {
        private static bool _immersive;

        public static event Action Changed;

        public static bool Immersive
        {
            get => _immersive;
            set
            {
                if (_immersive == value) return;
                _immersive = value;
                Changed?.Invoke();
            }
        }
    }
}
