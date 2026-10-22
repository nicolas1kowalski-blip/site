using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace MesPremiersJeux.Lib
{
    /// <summary>
    /// 📈 CE QUI EST UTILISÉ, ET COMBIEN : par jour et par activité (un jeu, un
    /// onglet), le nombre d'ouvertures, de réussites et de secondes passées.
    /// Compté sur la tablette (usage.ini), envoyé au serveur de l'application
    /// une fois par jour et à la fermeture, pour que l'éditeur voie, PAR
    /// FAMILLE, ce qui sert le plus et le moins. Il ne part que des compteurs :
    /// ni prénom, ni photos, ni voix, ni ce qui a été dit.
    /// </summary>
    public static class Usage
    {
        private sealed class Row { public string Day, Activity; public int Launches, Successes; public double Seconds; public bool Sent; }

        private static readonly Dictionary<string, Row> Rows = new Dictionary<string, Row>();
        private static bool _loaded, _dirty;
        private static string _screen = "", _current = "";
        private static DateTime _since = DateTime.MinValue;

        private static string FilePath => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "MesPremiersJeux", "usage.ini");

        /// <summary>L'écran courant (onglet) : le temps lui est compté quand aucun jeu ne tourne.</summary>
        public static void Screen(string id)
        {
            if (string.IsNullOrEmpty(id)) return;
            _screen = "onglet:" + id;
            Switch(_screen, launch: true);
        }

        /// <summary>Un jeu démarre : le temps lui est compté jusqu'à GameStop.</summary>
        public static void GameStart(string game) => Switch(game, launch: true);

        /// <summary>Le jeu s'arrête : on retourne au temps de l'onglet.</summary>
        public static void GameStop() => Switch(_screen, launch: false);

        public static void Success(string activity) { lock (Rows) { Get(activity).Successes++; _dirty = true; } }

        private static void Switch(string next, bool launch)
        {
            lock (Rows)
            {
                Flush();
                _current = next ?? "";
                _since = DateTime.Now;
                if (launch && _current.Length > 0) { Get(_current).Launches++; _dirty = true; }
            }
            Save();
        }

        /// <summary>Crédite le temps écoulé à l'activité courante.</summary>
        private static void Flush()
        {
            if (_current.Length == 0 || _since == DateTime.MinValue) return;
            var sec = (DateTime.Now - _since).TotalSeconds;
            _since = DateTime.Now;
            if (sec > 0 && sec < 6 * 3600) { Get(_current).Seconds += sec; _dirty = true; }
        }

        private static Row Get(string activity)
        {
            Load();
            var day = DateTime.Today.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
            var key = day + "|" + activity;
            if (!Rows.TryGetValue(key, out var r)) Rows[key] = r = new Row { Day = day, Activity = activity };
            r.Sent = false;
            return r;
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
                    var p = line.Split('|');
                    if (p.Length < 6) continue;
                    var r = new Row { Day = p[0], Activity = p[1], Sent = p[5] == "1" };
                    int.TryParse(p[2], out r.Launches); int.TryParse(p[3], out r.Successes);
                    double.TryParse(p[4], NumberStyles.Float, CultureInfo.InvariantCulture, out r.Seconds);
                    Rows[r.Day + "|" + r.Activity] = r;
                }
            }
            catch { }
        }

        private static void Save()
        {
            lock (Rows)
            {
                if (!_dirty) return;
                _dirty = false;
                try
                {
                    Directory.CreateDirectory(Path.GetDirectoryName(FilePath));
                    var cutoff = DateTime.Today.AddDays(-120).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
                    File.WriteAllLines(FilePath, Rows.Values.Where(r => string.CompareOrdinal(r.Day, cutoff) >= 0)
                        .Select(r => r.Day + "|" + r.Activity + "|" + r.Launches + "|" + r.Successes + "|" + ((int)r.Seconds) + "|" + (r.Sent ? "1" : "0")));
                }
                catch { }
            }
        }

        /// <summary>Envoie au serveur ce qui n'a pas encore été envoyé. Renvoie null si OK (ou rien à faire), sinon l'erreur.</summary>
        public static async Task<string> SendAsync(Settings s)
        {
            if (s == null || !s.LicenceOk || Licence.IsMaster(s.LicenceKey) || !Cloud.Configured) return null;
            List<Row> pending;
            lock (Rows) { Flush(); Load(); pending = Rows.Values.Where(r => !r.Sent && (r.Launches > 0 || r.Successes > 0 || r.Seconds >= 1)).ToList(); }
            if (pending.Count == 0) return null;
            var sb = new StringBuilder("[");
            foreach (var r in pending)
            {
                if (sb.Length > 1) sb.Append(',');
                sb.Append("{\"day\":\"").Append(r.Day).Append("\",\"activity\":\"").Append(Esc(r.Activity))
                  .Append("\",\"label\":\"").Append(Esc(ActivityNames.Of(r.Activity)))
                  .Append("\",\"launches\":").Append(r.Launches).Append(",\"successes\":").Append(r.Successes)
                  .Append(",\"seconds\":").Append((int)r.Seconds).Append('}');
            }
            sb.Append(']');
            try
            {
                var body = "{\"p_key\":\"" + Esc(s.LicenceKey) + "\",\"p_machine\":\"" + Esc(Environment.MachineName) + "\",\"p_rows\":" + sb + "}";
                var json = await Cloud.RpcAsync("report_usage", body);
                if (!string.Equals(Cloud.JsonGet(json, "ok"), "true", StringComparison.OrdinalIgnoreCase))
                    return Cloud.JsonGet(json, "message") ?? "refusé";
                var today = DateTime.Today.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
                lock (Rows) { foreach (var r in pending) if (r.Day != today) r.Sent = true; _dirty = true; }
                Save();
                s.UsageSent = today;
                s.Save();
                return null;
            }
            catch (Exception ex) { return ex.Message; }
        }

        /// <summary>Au démarrage : au plus un envoi par jour.</summary>
        public static Task<string> SendDailyAsync(Settings s)
        {
            if (s != null && s.UsageSent == DateTime.Today.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)) return Task.FromResult<string>(null);
            return SendAsync(s);
        }

        /// <summary>À la fermeture : on solde le temps, on sauve, on envoie (quelques secondes au plus).</summary>
        public static void AtExit(Settings s)
        {
            lock (Rows) { Flush(); _dirty = true; }
            Save();
            try { SendAsync(s).Wait(TimeSpan.FromSeconds(8)); } catch { }
        }

        private static string Esc(string v) => (v ?? "").Replace("\\", "\\\\").Replace("\"", "\\\"");
    }

    /// <summary>Les noms français des activités (pour le bilan et le serveur).</summary>
    public static class ActivityNames
    {
        public static readonly Dictionary<string, string> Games = new Dictionary<string, string>
        {
            ["NameGame"] = "Mon prénom", ["LettersGame"] = "Les lettres", ["AlphabetBookGame"] = "L'abécédaire",
            ["SyllableGame"] = "Les syllabes", ["SoundHouseGame"] = "La maison des sons", ["EyeWriteGame"] = "J'écris !",
            ["NumberPartyGame"] = "Fête des nombres", ["NumbersGame"] = "Les nombres", ["CompleteGame"] = "Le panier",
            ["NumberFormsGame"] = "Le nombre dans tous ses états", ["ModelCopyGame"] = "Reproduis le modèle",
            ["ColorMagicGame"] = "Couleurs magiques", ["SizeGame"] = "Grand ou petit", ["PatternGame"] = "Les suites",
            ["NecklaceGame"] = "Le collier de perles", ["VocabGame"] = "L'imagier", ["BodyGame"] = "Le corps",
            ["CapitalsGame"] = "Le tour du monde", ["SuitcaseGame"] = "La valise du voyageur", ["FoodGame"] = "Les bons plats",
            ["PlanetsGame"] = "Les planètes", ["DayNightGame"] = "Jour et nuit",
            ["MagicGame"] = "Bulles magiques", ["BalloonsGame"] = "Ballons 3D", ["ColorsGame"] = "Couleurs",
            ["ShapesGame"] = "Formes", ["CountGame"] = "Compter", ["ShadowGame"] = "Les ombres",
            ["SeekFindGame"] = "Cherche et trouve", ["StringsGame"] = "Les ficelles", ["CupsGame"] = "Les gobelets",
            ["PuzzleGame"] = "Puzzle", ["FamiliesGame"] = "Les familles", ["MemoryGame"] = "Les paires",
            ["GooseGame"] = "Jeu de l'oie", ["HorseGame"] = "Petits chevaux", ["TicTacToeGame"] = "Morpion",
            ["ConnectFourGame"] = "Puissance 4", ["BirdSongGame"] = "Oiseaux chanteurs",
            ["FireworksGame"] = "Feux d'artifice", ["MagicWindowGame"] = "Fenêtre magique", ["PieFaceGame"] = "Tartes à la crème",
            ["ReadingGame"] = "Lire (prénom, mots, rimes)", ["MathGame"] = "Les nombres (un de plus, partager)",
            ["MusicSchoolGame"] = "L'école de musique", ["EnglishGame"] = "L'anglais", ["EmotionsGame"] = "Les émotions",
            ["TidyHouseGame"] = "Range la maison",
            ["onglet:accueil"] = "Accueil", ["onglet:stories"] = "Histoires", ["onglet:games"] = "Jeux (menu)",
            ["onglet:edu"] = "Éducatif (menu)", ["onglet:coloring"] = "Coloriage", ["onglet:music"] = "Musique",
            ["onglet:parcours"] = "Parcours", ["parler"] = "Parler (messages dits)",
        };

        public static string Of(string key) => key != null && Games.TryGetValue(key, out var fr) ? fr : key ?? "";
    }
}
