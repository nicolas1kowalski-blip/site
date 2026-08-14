using System;
using System.Collections.Generic;
using System.Linq;
using MesPremiersJeux.Data;

namespace MesPremiersJeux.Lib
{
    /// <summary>Aléas et retours (voix/sons) partagés par les jeux.</summary>
    public static class GameKit
    {
        private static readonly Random Rng = new Random();

        public static T Rand<T>(IList<T> list) => list[Rng.Next(list.Count)];

        /// <summary>Entier dans [0, maxExclusive) via le générateur partagé.</summary>
        public static int RandInt(int maxExclusive) => Rng.Next(maxExclusive);

        public static List<T> Shuffle<T>(IEnumerable<T> src)
        {
            var list = src.ToList();
            for (int i = list.Count - 1; i > 0; i--)
            {
                int j = Rng.Next(i + 1);
                (list[i], list[j]) = (list[j], list[i]);
            }
            return list;
        }

        /// <summary>« must » + (n-1) autres éléments distincts, le tout mélangé.</summary>
        public static List<T> PickN<T>(IList<T> pool, int n, T must)
        {
            var res = new List<T> { must };
            foreach (var o in Shuffle(pool))
            {
                if (res.Count >= n) break;
                if (!EqualityComparer<T>.Default.Equals(o, must) && !res.Contains(o)) res.Add(o);
            }
            return Shuffle(res);
        }

        public static string Praise() => Rand(GameData.Praises);
        public static string Encourage() => Rand(GameData.Encourage);

        public static void Success() { Speech.Pop(); }
        public static void Wrong() { try { System.Media.SystemSounds.Exclamation.Play(); } catch { } }
    }
}
