using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;

namespace MesPremiersJeux.Lib
{
    /// <summary>
    /// ADAPTATION AUTOMATIQUE : chaque « compétence » (clé) a un niveau 0-1-2.
    /// Trois réussites d'affilée → on monte d'un niveau (plus de choix, plus
    /// dur) ; deux erreurs d'affilée → on redescend, sans jamais le dire à
    /// l'enfant. Les niveaux sont conservés sur le disque et visibles dans le
    /// bilan parent.
    /// </summary>
    public static class Adaptive
    {
        private sealed class Skill { public int Level; public int Streak; public int Fails; }

        private static readonly Dictionary<string, Skill> Skills = new Dictionary<string, Skill>();
        private static bool _loaded;

        private static string FilePath => Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "MesPremiersJeux", "niveaux.ini");

        private static Skill Get(string key)
        {
            Load();
            if (!Skills.TryGetValue(key, out var s)) { s = new Skill(); Skills[key] = s; }
            return s;
        }

        /// <summary>Le niveau actuel de la compétence (0 facile · 1 moyen · 2 costaud).</summary>
        public static int Level(string key) => Get(key).Level;

        /// <summary>À appeler après chaque réponse de l'enfant.</summary>
        public static void Report(string key, bool success)
        {
            var s = Get(key);
            if (success)
            {
                s.Fails = 0;
                s.Streak++;
                if (s.Streak >= 3 && s.Level < 2) { s.Level++; s.Streak = 0; }
            }
            else
            {
                s.Streak = 0;
                s.Fails++;
                if (s.Fails >= 2 && s.Level > 0) { s.Level--; s.Fails = 0; }
            }
            Save();
        }

        /// <summary>Toutes les compétences connues (pour le bilan parent).</summary>
        public static IEnumerable<(string Key, int Level)> All()
        {
            Load();
            return Skills.Select(kv => (kv.Key, kv.Value.Level)).OrderBy(t => t.Key);
        }

        private static void Load()
        {
            if (_loaded) return;
            _loaded = true;
            try
            {
                if (!File.Exists(FilePath)) return;
                foreach (var line in File.ReadAllLines(FilePath))
                {
                    var parts = line.Split('=');
                    if (parts.Length != 2) continue;
                    var v = parts[1].Split('|');
                    var s = new Skill();
                    if (v.Length > 0) int.TryParse(v[0], out s.Level);
                    if (v.Length > 1) int.TryParse(v[1], out s.Streak);
                    if (v.Length > 2) int.TryParse(v[2], out s.Fails);
                    s.Level = Math.Max(0, Math.Min(2, s.Level));
                    Skills[parts[0].Trim()] = s;
                }
            }
            catch { }
        }

        private static void Save()
        {
            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(FilePath));
                File.WriteAllLines(FilePath,
                    Skills.Select(kv => kv.Key + "=" + kv.Value.Level + "|" + kv.Value.Streak + "|" + kv.Value.Fails));
            }
            catch { }
        }
    }

    /// <summary>
    /// JOURNAL DE PROGRÈS : chaque réussite est comptée par jour et par
    /// activité (fichier progres.ini) — la matière du bilan parent.
    /// </summary>
    public static class Progress
    {
        private static string FilePath => Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "MesPremiersJeux", "progres.ini");

        public static void Add(string game)
        {
            try
            {
                var day = DateTime.Now.ToString("yyyy-MM-dd");
                var rows = LoadRaw();
                var key = day + "|" + game;
                rows[key] = rows.TryGetValue(key, out var n) ? n + 1 : 1;
                Directory.CreateDirectory(Path.GetDirectoryName(FilePath));
                File.WriteAllLines(FilePath,
                    rows.Select(kv => kv.Key + "|" + kv.Value.ToString(CultureInfo.InvariantCulture)));
            }
            catch { }
        }

        /// <summary>(jour, activité, nombre de réussites).</summary>
        public static List<(DateTime Day, string Game, int Count)> Load()
        {
            var res = new List<(DateTime, string, int)>();
            foreach (var kv in LoadRaw())
            {
                var parts = kv.Key.Split('|');
                if (parts.Length != 2) continue;
                if (DateTime.TryParseExact(parts[0], "yyyy-MM-dd", CultureInfo.InvariantCulture,
                        DateTimeStyles.None, out var day))
                    res.Add((day, parts[1], kv.Value));
            }
            return res;
        }

        private static Dictionary<string, int> LoadRaw()
        {
            var rows = new Dictionary<string, int>();
            try
            {
                if (!File.Exists(FilePath)) return rows;
                foreach (var line in File.ReadAllLines(FilePath))
                {
                    int last = line.LastIndexOf('|');
                    if (last <= 0) continue;
                    if (int.TryParse(line.Substring(last + 1), out var n))
                        rows[line.Substring(0, last)] = n;
                }
            }
            catch { }
            return rows;
        }
    }
}
