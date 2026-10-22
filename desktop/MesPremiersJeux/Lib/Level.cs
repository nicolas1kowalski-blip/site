using System;
using System.Collections.Generic;
using System.Linq;

namespace MesPremiersJeux.Lib
{
    /// <summary>
    /// 🎚 LE NIVEAU de l'enfant, qui grandit avec elle :
    ///   1 · Petite section  — 2 choix, nombres jusqu'à 5
    ///   2 · Moyenne section — 3 choix, nombres jusqu'à 7
    ///   3 · Grande section / CP — 4 choix, nombres jusqu'à 10
    /// Réglé à la main dans les réglages, ou AUTOMATIQUE : après 20 réponses,
    /// ≥ 85 % de réussites → on monte d'un cran ; &lt; 40 % → on redescend.
    /// Les jeux demandent <see cref="Choices"/>, <see cref="MaxNumber"/> ou
    /// <see cref="Pick"/> ; ils n'ont pas à connaître la règle.
    /// </summary>
    public static class Level
    {
        public const int Min = 1, Max = 3;

        /// <summary>Réglage : "auto" ou "1".."3".</summary>
        public static string Setting = "auto";

        /// <summary>Niveau atteint en automatique (persistant).</summary>
        public static int Auto = 1;

        // Fenêtre glissante des 20 dernières réponses (1 = réussite).
        private static readonly List<bool> Window = new List<bool>();
        private const int WindowSize = 20;

        /// <summary>Appelé quand le niveau change (nouveau niveau, montée ?).</summary>
        public static event Action<int, bool> Changed;

        /// <summary>Sauvegarde des réglages (branché par la fenêtre principale).</summary>
        public static Action Save;

        public static int Current
        {
            get
            {
                if (int.TryParse(Setting, out var n) && n >= Min && n <= Max) return n;
                return Math.Max(Min, Math.Min(Max, Auto));
            }
        }

        public static bool IsAuto => !(int.TryParse(Setting, out var n) && n >= Min && n <= Max);

        public static string Name(int level) =>
            level <= 1 ? "Petite section" : level == 2 ? "Moyenne section" : "Grande section · CP";

        /// <summary>Nombre de choix proposés (2, 3 ou 4).</summary>
        public static int Choices => Current + 1;

        /// <summary>Le plus grand nombre travaillé (5, 7 ou 10).</summary>
        public static int MaxNumber => Current <= 1 ? 5 : Current == 2 ? 7 : 10;

        /// <summary>Choix du niveau parmi un bassin, avec la bonne réponse dedans.</summary>
        public static List<T> Pick<T>(IList<T> pool, T must) =>
            GameKit.PickN(pool, Math.Min(Choices, pool.Count), must);

        /// <summary>Choix bornés (ex. jamais plus de 3 pour un petit écran).</summary>
        public static List<T> Pick<T>(IList<T> pool, T must, int atMost) =>
            GameKit.PickN(pool, Math.Min(Math.Min(Choices, atMost), pool.Count), must);

        // ------------------------------------------------------------------
        //  Progression automatique
        // ------------------------------------------------------------------
        public static void Record(bool success)
        {
            Window.Add(success);
            if (Window.Count < WindowSize) return;
            double rate = Window.Count(x => x) / (double)Window.Count;
            Window.Clear();
            if (!IsAuto) return;
            int before = Auto;
            if (rate >= 0.85 && Auto < Max) Auto++;
            else if (rate < 0.40 && Auto > Min) Auto--;
            if (Auto == before) return;
            Log.Write("niveau", FormattableString.Invariant($"Réussite {rate:P0} sur {WindowSize} réponses : niveau {before} → {Auto} ({Name(Auto)})"));
            try { Save?.Invoke(); } catch { }
            try { Changed?.Invoke(Auto, Auto > before); } catch { }
        }
    }
}
