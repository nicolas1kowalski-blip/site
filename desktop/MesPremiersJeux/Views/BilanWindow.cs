using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
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
        private static readonly Dictionary<string, string> Names = new Dictionary<string, string>
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
        };

        private static readonly Dictionary<string, string> SkillNames = new Dictionary<string, string>
        {
            ["planetes"] = "Les planètes", ["capitales"] = "Le tour du monde",
            ["nombres-formes"] = "Reconnaissance des nombres",
        };

        public BilanWindow()
        {
            Title = "📊 Bilan";
            Width = 680;
            Height = 640;
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

            Content = new ScrollViewer { Content = root, VerticalScrollBarVisibility = ScrollBarVisibility.Auto };
        }

        private static void Title2(Panel p, string text) =>
            p.Children.Add(new TextBlock { Text = text, FontSize = 20, FontWeight = FontWeights.Bold, Foreground = Dark, Margin = new Thickness(0, 12, 0, 4) });

        private static void Line(Panel p, string text) =>
            p.Children.Add(new TextBlock { Text = text, FontSize = 15, Foreground = Dark, TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 2, 0, 0) });
    }
}
