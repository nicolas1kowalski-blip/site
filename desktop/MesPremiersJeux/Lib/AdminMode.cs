using System;

namespace MesPremiersJeux.Lib
{
    /// <summary>
    /// Mode administration (activé dans ⚙) : tant qu'il est actif, le regard est
    /// en pause et les outils « parent » (ajouter / modifier / supprimer du
    /// contenu) sont visibles. Désactivé, l'enfant ne voit que le contenu.
    /// </summary>
    public static class AdminMode
    {
        public static bool IsActive { get; private set; }

        /// <summary>Levé quand le mode change (pour afficher/cacher les outils).</summary>
        public static event Action Changed;

        public static void Set(bool active)
        {
            if (IsActive == active) return;
            IsActive = active;
            Changed?.Invoke();
        }
    }
}
