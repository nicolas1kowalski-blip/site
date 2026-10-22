using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Windows;
using System.Windows.Threading;

namespace MesPremiersJeux.Lib
{
    /// <summary>
    /// 👁 COMMENT L'ENFANT JOUE AU REGARD : sélections (et le temps qu'elles
    /// prennent), fixations ABANDONNÉES juste avant la fin (« presque choisi »),
    /// erreurs, temps pour réussir, fatigue au fil de la séance, zones de
    /// l'écran faciles ou difficiles, jeux quittés tout de suite, messages de la
    /// grille de communication. Compteurs par jour dans regard.ini (AppData).
    ///
    /// Le temps de fixation s'AJUSTE tout seul, par petits pas : beaucoup de
    /// fixations abandonnées sans erreurs → il raccourcit (l'enfant vise bien
    /// mais n'arrive pas à tenir) ; beaucoup d'erreurs sans hésitation → il
    /// s'allonge (sélections trop rapides, accidentelles).
    /// </summary>
    public static class GazeStats
    {
        private static string FilePath => Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "MesPremiersJeux", "regard.ini");

        private static Dictionary<string, Dictionary<string, double>> _days;
        private static bool _dirty;
        private static DispatcherTimer _saver;
        private static readonly DateTime AppStart = DateTime.Now;

        // --- Ajustement automatique du temps de fixation ---
        public static Func<int> GetDwell;
        public static Action<int> SetDwell;
        public static bool AutoDwell = true;
        public const int DwellMin = 600, DwellMax = 1800, DwellStep = 50;
        private const int TuneEvery = 25; // sélections entre deux décisions
        private static int _winSel, _winAbort, _winWrong;

        // ------------------------------------------------------------------
        //  Enregistrement
        // ------------------------------------------------------------------
        /// <summary>Une sélection au regard : <paramref name="seconds"/> entre
        /// l'arrivée du regard sur la cible et le clic.</summary>
        public static void RecordSelection(Point screen, double seconds)
        {
            Add("sel", 1);
            Add("selSec", Math.Max(0, Math.Min(30, seconds)));
            Add("zs" + Zone(screen), 1);
            _winSel++;
            MaybeTune();
        }

        /// <summary>Une fixation bien entamée puis abandonnée (« presque choisi »).</summary>
        public static void RecordAbort(Point screen)
        {
            Add("abort", 1);
            Add("za" + Zone(screen), 1);
            _winAbort++;
        }

        public static void RecordWrong()
        {
            Add("wrong", 1);
            _winWrong++;
        }

        /// <summary>Une réussite, <paramref name="seconds"/> après la précédente
        /// (ou le début du jeu) — rangée par moment de la séance (fatigue).</summary>
        public static void RecordSuccess(double seconds)
        {
            double s = Math.Max(0, Math.Min(180, seconds));
            Add("succ", 1);
            Add("succSec", s);
            double min = (DateTime.Now - AppStart).TotalMinutes;
            int b = min < 10 ? 0 : min < 20 ? 1 : 2;
            Add("f" + b + "n", 1);
            Add("f" + b + "s", s);
        }

        /// <summary>Une partie terminée : durée, et « quittée tout de suite » si
        /// moins d'une minute sans aucune réussite.</summary>
        public static void RecordGame(string game, double seconds, int successes)
        {
            if (seconds < 3) return; // simple passage
            Add("g:" + game + ":n", 1);
            Add("g:" + game + ":sec", seconds);
            if (seconds < 60 && successes == 0) Add("g:" + game + ":aband", 1);
        }

        /// <summary>Un message dit avec la grille de communication.</summary>
        public static void RecordComm(string key) { Add("c:" + key, 1); Usage.Success("parler"); }

        // ------------------------------------------------------------------
        //  Lecture (pour le bilan)
        // ------------------------------------------------------------------
        public static Dictionary<string, double> Day(DateTime d) => Range(d, d);

        /// <summary>Somme des compteurs des jours [from, to].</summary>
        public static Dictionary<string, double> Range(DateTime from, DateTime to)
        {
            Ensure();
            var res = new Dictionary<string, double>();
            foreach (var kv in _days)
            {
                if (!DateTime.TryParseExact(kv.Key, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var day)) continue;
                if (day < from.Date || day > to.Date) continue;
                foreach (var c in kv.Value)
                    res[c.Key] = (res.TryGetValue(c.Key, out var o) ? o : 0) + c.Value;
            }
            return res;
        }

        public static double Get(Dictionary<string, double> d, string key) => d.TryGetValue(key, out var v) ? v : 0;

        /// <summary>Zone de l'écran (0..8, 3×3, de gauche à droite puis de haut en bas).</summary>
        public static int Zone(Point screen)
        {
            double w = SystemParameters.PrimaryScreenWidth, h = SystemParameters.PrimaryScreenHeight;
            try
            {
                var src = PresentationSource.FromVisual(Application.Current.MainWindow);
                var m = src?.CompositionTarget?.TransformToDevice;
                if (m.HasValue) { w *= m.Value.M11; h *= m.Value.M22; } // pixels physiques
            }
            catch { }
            int col = Math.Max(0, Math.Min(2, (int)(screen.X / Math.Max(1, w) * 3)));
            int row = Math.Max(0, Math.Min(2, (int)(screen.Y / Math.Max(1, h) * 3)));
            return row * 3 + col;
        }

        // ------------------------------------------------------------------
        //  Ajustement du temps de fixation
        // ------------------------------------------------------------------
        private static void MaybeTune()
        {
            if (!AutoDwell || GetDwell == null || SetDwell == null || _winSel < TuneEvery) return;
            double abortRate = _winAbort / (double)(_winSel + _winAbort);
            double wrongRate = _winWrong / (double)_winSel;
            _winSel = _winAbort = _winWrong = 0;

            int dwell = GetDwell(), next = dwell;
            if (abortRate > 0.30 && wrongRate < 0.25) next = Math.Max(DwellMin, dwell - DwellStep);
            else if (wrongRate > 0.40 && abortRate < 0.15) next = Math.Min(DwellMax, dwell + DwellStep);
            if (next == dwell) return;

            SetDwell(next);
            Add(next < dwell ? "adjDown" : "adjUp", 1);
            Log.Write("regard", FormattableString.Invariant(
                $"fixation ajustée {dwell} → {next} ms (abandons {abortRate:P0}, erreurs {wrongRate:P0})"));
        }

        // ------------------------------------------------------------------
        //  Stockage
        // ------------------------------------------------------------------
        private static void Add(string key, double v)
        {
            Ensure();
            var day = DateTime.Today.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
            if (!_days.TryGetValue(day, out var d)) _days[day] = d = new Dictionary<string, double>();
            d[key] = (d.TryGetValue(key, out var o) ? o : 0) + v;
            _dirty = true;
        }

        private static void Ensure()
        {
            if (_days != null) return;
            _days = new Dictionary<string, Dictionary<string, double>>();
            try
            {
                if (File.Exists(FilePath))
                    foreach (var line in File.ReadAllLines(FilePath))
                    {
                        var p = line.Split('|');
                        if (p.Length != 3) continue;
                        if (!double.TryParse(p[2], NumberStyles.Float, CultureInfo.InvariantCulture, out var v)) continue;
                        if (!_days.TryGetValue(p[0], out var d)) _days[p[0]] = d = new Dictionary<string, double>();
                        d[p[1]] = v;
                    }
            }
            catch { }
            try
            {
                _saver = new DispatcherTimer { Interval = TimeSpan.FromSeconds(10) };
                _saver.Tick += (s, e) => Flush();
                _saver.Start();
                Application.Current.Exit += (s, e) => Flush();
            }
            catch { }
        }

        public static void Flush()
        {
            if (!_dirty || _days == null) return;
            _dirty = false;
            try
            {
                var keep = DateTime.Today.AddDays(-120).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
                var lines = _days.Where(kv => string.CompareOrdinal(kv.Key, keep) >= 0)
                    .SelectMany(kv => kv.Value.Select(c =>
                        kv.Key + "|" + c.Key + "|" + c.Value.ToString(CultureInfo.InvariantCulture)));
                Directory.CreateDirectory(Path.GetDirectoryName(FilePath));
                File.WriteAllLines(FilePath, lines);
            }
            catch { }
        }
    }
}
