using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Media;
using MesPremiersJeux.Gaze;
using MesPremiersJeux.Lib;

namespace MesPremiersJeux.Views
{
    /// <summary>
    /// 📊 LE BILAN PARENT : ce que l'enfant a fait cette semaine (réussites par
    /// jour, activités préférées), ses niveaux d'adaptation automatique, et
    /// l'état de la tirelire — en une page simple, utile aussi pour les
    /// professionnels qui suivent l'enfant (ergo, ortho...).
    /// </summary>
    public sealed class BilanWindow : Window
    {
        private static readonly Brush Dark = new SolidColorBrush(Color.FromRgb(0x3B, 0x2A, 0x5A));
        private static readonly Brush Soft = new SolidColorBrush(Color.FromRgb(0x8A, 0x7A, 0xA8));

        // Noms français des activités (le journal stocke les noms techniques).
        private static Dictionary<string, string> Names => ActivityNames.Games;

        private static readonly Dictionary<string, string> SkillNames = new Dictionary<string, string>
        {
            ["planetes"] = "Les planètes", ["capitales"] = "Le tour du monde",
            ["nombres-formes"] = "Reconnaissance des nombres",
        };

        public BilanWindow()
        {
            Title = "📊 Bilan";
            Width = 680;
            Height = 780;
            WindowStartupLocation = WindowStartupLocation.CenterOwner;
            Background = new SolidColorBrush(Color.FromRgb(0xFB, 0xF4, 0xFF));
            GazeGate.Push();
            Closed += (s, e) => GazeGate.Pop();

            var root = new StackPanel { Margin = new Thickness(26) };

            Title2(root, "⭐ La tirelire");
            Line(root, "Étoiles gagnées au total : " + RewardStore.Total +
                       "   ·   aujourd'hui : " + RewardStore.Today +
                       "   ·   dans la tirelire : " + RewardStore.Balance);

            // La semaine : réussites par jour (7 derniers jours).
            Title2(root, "📅 Les 7 derniers jours");
            var data = Progress.Load();
            var week = Enumerable.Range(0, 7).Select(i => DateTime.Today.AddDays(-6 + i)).ToList();
            var perDay = week.ToDictionary(d => d, d => data.Where(r => r.Day == d).Sum(r => r.Count));
            int max = Math.Max(1, perDay.Values.Max());
            var daysRow = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Center, Margin = new Thickness(0, 4, 0, 6) };
            string[] dayNames = { "lun", "mar", "mer", "jeu", "ven", "sam", "dim" };
            foreach (var d in week)
            {
                int n = perDay[d];
                var col = new StackPanel { Width = 72, Margin = new Thickness(4, 0, 4, 0) };
                var barHost = new Grid { Height = 110 };
                var bar = new Border
                {
                    Width = 36,
                    Height = Math.Max(4, 104.0 * n / max),
                    VerticalAlignment = VerticalAlignment.Bottom,
                    HorizontalAlignment = HorizontalAlignment.Center,
                    CornerRadius = new CornerRadius(8),
                    Background = new SolidColorBrush(n > 0 ? Color.FromRgb(0xA0, 0x6C, 0xD5) : Color.FromRgb(0xE0, 0xDA, 0xEE)),
                };
                barHost.Children.Add(bar);
                col.Children.Add(barHost);
                col.Children.Add(new TextBlock { Text = n.ToString(), FontSize = 15, FontWeight = FontWeights.Bold, Foreground = Dark, HorizontalAlignment = HorizontalAlignment.Center });
                col.Children.Add(new TextBlock { Text = dayNames[((int)d.DayOfWeek + 6) % 7], FontSize = 13, Foreground = Soft, HorizontalAlignment = HorizontalAlignment.Center });
                daysRow.Children.Add(col);
            }
            root.Children.Add(daysRow);
            Line(root, "Total de la semaine : " + perDay.Values.Sum() + " réussites.");

            // Les activités préférées (semaine).
            Title2(root, "💚 Ses activités de la semaine");
            var weekRows = data.Where(r => r.Day >= DateTime.Today.AddDays(-6))
                .GroupBy(r => r.Game)
                .Select(g => (Game: g.Key, Count: g.Sum(r => r.Count)))
                .OrderByDescending(t => t.Count)
                .Take(5)
                .ToList();
            if (weekRows.Count == 0) Line(root, "(rien encore cette semaine)");
            foreach (var (game, count) in weekRows)
                Line(root, "• " + (Names.TryGetValue(game, out var fr) ? fr : game) + " — " + count +
                           (count > 1 ? " réussites" : " réussite"));

            // Les niveaux d'adaptation.
            Title2(root, "🧠 Niveaux automatiques");
            var skills = Adaptive.All().ToList();
            if (skills.Count == 0) Line(root, "(l'application s'ajuste au fil des réponses — rien encore)");
            foreach (var (key, level) in skills)
            {
                var name = SkillNames.TryGetValue(key, out var fr) ? fr : key;
                var label = level == 0 ? "🌱 tranquille (2 choix)" : level == 1 ? "🌿 à l'aise (3 choix)" : "🌳 costaud (4 choix)";
                Line(root, "• " + name + " : " + label);
            }
            Line(root, "Trois réussites d'affilée font monter le niveau ; deux erreurs le redescendent, sans jamais le dire à l'enfant.");

            AddGazeSection(root);
            AddCommSection(root);

            // Imprimer (ou « Microsoft Print to PDF » pour un fichier à envoyer
            // à l'ergothérapeute, à l'orthophoniste ou à l'école).
            var print = new Button
            {
                Content = "🖨  Imprimer / enregistrer en PDF",
                FontSize = 15,
                Padding = new Thickness(10, 8, 10, 8),
                Margin = new Thickness(0, 18, 0, 0),
                HorizontalAlignment = HorizontalAlignment.Left,
            };
            print.Click += (s, e) => Print(root, print);
            root.Children.Add(print);

            Content = new ScrollViewer { Content = root, VerticalScrollBarVisibility = ScrollBarVisibility.Auto };
        }

        // ------------------------------------------------------------------
        //  👁 Le regard : comment l'enfant sélectionne (7 derniers jours)
        // ------------------------------------------------------------------
        private static void AddGazeSection(Panel root)
        {
            Title2(root, "👁 Le regard (7 derniers jours)");
            var w = GazeStats.Range(DateTime.Today.AddDays(-6), DateTime.Today);
            double G(string k) => GazeStats.Get(w, k);
            double sel = G("sel"), abort = G("abort"), wrong = G("wrong"), succ = G("succ");
            if (sel < 1) { Line(root, "(pas encore de mesures : elles se remplissent pendant qu'elle joue)"); return; }

            Line(root, $"• {sel:0} sélections au regard, en {G("selSec") / sel:0.0} s en moyenne (du moment où le regard arrive sur la cible jusqu'au choix).");
            double hes = abort / Math.Max(1, sel + abort);
            Line(root, $"• Hésitations : {hes:P0} des fixations sont lâchées juste avant la fin (« presque choisi »)." +
                       (hes > 0.3 ? " C'est beaucoup : le temps de fixation est peut-être un peu long." : ""));
            if (succ + wrong > 0)
                Line(root, $"• Réponses : {succ:0} réussites pour {wrong:0} erreurs ({succ / Math.Max(1, succ + wrong):P0} de réussite).");
            if (succ > 0)
                Line(root, $"• Il lui faut en moyenne {G("succSec") / succ:0} s pour réussir une étape.");

            // Fatigue : le temps pour réussir selon le moment de la séance.
            double F(int b) => G("f" + b + "n") > 0 ? G("f" + b + "s") / G("f" + b + "n") : -1;
            double f0 = F(0), f1 = F(1), f2 = F(2);
            string Fmt(double v) => v < 0 ? "—" : v.ToString("0") + " s";
            Line(root, $"• Selon le moment de la séance : début {Fmt(f0)} · 10-20 min {Fmt(f1)} · après 20 min {Fmt(f2)}.");
            if (f0 > 0 && f2 > 1.5 * f0)
                Line(root, "  → Elle ralentit nettement après 20 minutes : une pause vers 20 minutes peut l'aider.");
            else if (f0 > 0 && f1 > 1.5 * f0)
                Line(root, "  → Elle ralentit déjà après 10 minutes : des séances courtes lui conviennent mieux.");

            // Zones de l'écran : réussite des fixations par zone (3 × 3).
            Line(root, "• L'écran en 9 zones — part des fixations menées jusqu'au bout (vert = facile, rouge = difficile) :");
            var grid = new UniformGrid { Columns = 3, Rows = 3, Width = 330, Height = 186, HorizontalAlignment = HorizontalAlignment.Left, Margin = new Thickness(14, 4, 0, 4) };
            for (int z = 0; z < 9; z++)
            {
                double ok = G("zs" + z), ko = G("za" + z), n = ok + ko;
                double rate = n > 0 ? ok / n : -1;
                var col = rate < 0 ? Color.FromRgb(0xEE, 0xEA, 0xF4)
                        : rate >= 0.8 ? Color.FromRgb(0xB8, 0xE8, 0xB0)
                        : rate >= 0.6 ? Color.FromRgb(0xFF, 0xE6, 0x9A)
                        : Color.FromRgb(0xFF, 0xB8, 0xB0);
                grid.Children.Add(new Border
                {
                    Background = new SolidColorBrush(col),
                    BorderBrush = Brushes.White,
                    BorderThickness = new Thickness(2),
                    CornerRadius = new CornerRadius(6),
                    Child = new TextBlock
                    {
                        Text = rate < 0 ? "—" : $"{rate:P0}\n({n:0})",
                        FontSize = 13,
                        TextAlignment = TextAlignment.Center,
                        Foreground = Dark,
                        HorizontalAlignment = HorizontalAlignment.Center,
                        VerticalAlignment = VerticalAlignment.Center,
                    },
                });
            }
            root.Children.Add(grid);

            // Temps de fixation : réglage actuel et ajustements automatiques.
            double up = G("adjUp"), down = G("adjDown");
            var dwell = GazeStats.GetDwell != null ? GazeStats.GetDwell() : 0;
            Line(root, $"• Temps de fixation actuel : {dwell / 1000.0:0.00} s" +
                       (GazeStats.AutoDwell ? $" — ajusté tout seul cette semaine : {down:0} fois plus court, {up:0} fois plus long." : " (réglage automatique désactivé)."));

            // Jeux quittés tout de suite (moins d'une minute, sans réussite).
            var quit = w.Where(kv => kv.Key.StartsWith("g:") && kv.Key.EndsWith(":aband"))
                .Select(kv => (Game: kv.Key.Substring(2, kv.Key.Length - 8), Count: kv.Value))
                .OrderByDescending(t => t.Count).Take(4).ToList();
            if (quit.Count > 0)
                Line(root, "• Jeux souvent quittés tout de suite : " + string.Join(", ",
                    quit.Select(q => (Names.TryGetValue(q.Game, out var fr) ? fr : q.Game) + " (" + q.Count.ToString("0") + ")")) +
                    " — trop durs, ou pas à son goût ?");
        }

        // ------------------------------------------------------------------
        //  💬 Ce qu'elle a dit avec la grille de communication
        // ------------------------------------------------------------------
        private static void AddCommSection(Panel root)
        {
            Title2(root, "💬 Ce qu'elle a dit avec la grille");
            var today = GazeStats.Day(DateTime.Today);
            var week = GazeStats.Range(DateTime.Today.AddDays(-6), DateTime.Today);
            List<(string Key, double Count)> Top(Dictionary<string, double> d) => d
                .Where(kv => kv.Key.StartsWith("c:"))
                .Select(kv => (Key: kv.Key.Substring(2), Count: kv.Value))
                .OrderByDescending(t => t.Count).ToList();
            var todayTop = Top(today);
            var wk = Top(week);
            if (wk.Count == 0) { Line(root, "(la grille n'a pas encore été utilisée — bouton « Parler » 💬 en bas à droite)"); return; }
            Line(root, "• Aujourd'hui : " + (todayTop.Count == 0 ? "rien" : string.Join(", ", todayTop.Take(8).Select(x => Nice(x.Key) + " ×" + x.Count.ToString("0")))));
            Line(root, "• Cette semaine : " + string.Join(", ", wk.Take(10).Select(x => Nice(x.Key) + " ×" + x.Count.ToString("0"))));
        }

        private static string Nice(string key)
        {
            if (key.StartsWith("pers-")) key = key.Substring(5);
            if (key.StartsWith("mal-")) return "mal : " + key.Substring(4);
            return key;
        }

        private static void Print(FrameworkElement root, Button hide)
        {
            try
            {
                var pd = new PrintDialog();
                if (pd.ShowDialog() != true) return;
                hide.Visibility = Visibility.Collapsed;
                root.UpdateLayout();
                double sx = pd.PrintableAreaWidth / Math.Max(1, root.ActualWidth);
                double sy = pd.PrintableAreaHeight / Math.Max(1, root.ActualHeight);
                double k = Math.Min(1, Math.Min(sx, sy));
                root.LayoutTransform = new ScaleTransform(k, k);
                root.UpdateLayout();
                pd.PrintVisual(root, "Bilan Eyzi");
            }
            catch (Exception ex) { MessageBox.Show("Impression impossible : " + ex.Message, "Bilan"); }
            finally
            {
                root.LayoutTransform = null;
                hide.Visibility = Visibility.Visible;
            }
        }

        private static void Title2(Panel p, string text) =>
            p.Children.Add(new TextBlock { Text = text, FontSize = 20, FontWeight = FontWeights.Bold, Foreground = Dark, Margin = new Thickness(0, 12, 0, 4) });

        private static void Line(Panel p, string text) =>
            p.Children.Add(new TextBlock { Text = text, FontSize = 15, Foreground = Dark, TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 2, 0, 0) });
    }
}
