using System;
using System.Globalization;
using System.IO;

namespace MesPremiersJeux.Lib
{
    /// <summary>
    /// Étoiles de récompense : chaque réussite en gagne une. Total et compteur du
    /// jour sont conservés sur le disque (%AppData%\MesPremiersJeux\etoiles.ini).
    /// </summary>
    public static class RewardStore
    {
        public static int Total { get; private set; }
        public static int Today { get; private set; }

        /// <summary>Levé après chaque gain (pour rafraîchir l'affichage).</summary>
        public static event Action Changed;

        private static string _day = DateTime.Now.ToString("yyyy-MM-dd");
        private static bool _loaded;

        private static string FilePath => Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "MesPremiersJeux", "etoiles.ini");

        public static void Load()
        {
            if (_loaded) return;
            _loaded = true;
            try
            {
                if (!File.Exists(FilePath)) return;
                foreach (var line in File.ReadAllLines(FilePath))
                {
                    int eq = line.IndexOf('=');
                    if (eq <= 0) continue;
                    var key = line.Substring(0, eq).Trim();
                    var val = line.Substring(eq + 1).Trim();
                    if (key == "Total" && int.TryParse(val, out var t)) Total = t;
                    if (key == "Day") _day = val;
                    if (key == "Today" && int.TryParse(val, out var d)) Today = d;
                }
                // Nouveau jour : le compteur du jour repart de zéro.
                var now = DateTime.Now.ToString("yyyy-MM-dd");
                if (_day != now) { _day = now; Today = 0; }
            }
            catch { }
        }

        public static void Add(int n = 1)
        {
            Load();
            var now = DateTime.Now.ToString("yyyy-MM-dd");
            if (_day != now) { _day = now; Today = 0; }
            Total += n;
            Today += n;
            Save();
            Changed?.Invoke();
        }

        private static void Save()
        {
            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(FilePath));
                File.WriteAllLines(FilePath, new[]
                {
                    "Total=" + Total.ToString(CultureInfo.InvariantCulture),
                    "Day=" + _day,
                    "Today=" + Today.ToString(CultureInfo.InvariantCulture),
                });
            }
            catch { }
        }
    }
}
