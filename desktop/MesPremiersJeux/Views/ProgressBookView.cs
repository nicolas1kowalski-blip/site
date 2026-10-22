using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Media.Effects;
using MesPremiersJeux.Lib;

namespace MesPremiersJeux.Views
{
    /// <summary>
    /// 📒 MON CARNET : les progrès de l'enfant, POUR ELLE (gros, en images, dits
    /// à voix haute). L'arbre qui pousse avec ses étoiles (une pomme tous les
    /// 25), ses étoiles par domaine (lettres, nombres, musique, parler,
    /// découvrir, jeux) avec un petit podium de niveau, et ses badges. Un regard
    /// sur un domaine ou un badge le fait raconter.
    /// </summary>
    public sealed class ProgressBookView : UserControl
    {
        public event Action CloseRequested;
        public event Action ShopRequested;

        private sealed class Domain
        {
            public string Key, Name, Icon, Img;
            public string[] Games;
            public Color Tint;
        }

        private static readonly Domain[] Domains =
        {
            new Domain { Key = "lettres", Name = "Les lettres", Icon = "🔤", Img = "livre", Tint = Color.FromRgb(0xFF, 0xE9, 0xF2),
                Games = new[] { "NameGame", "LettersGame", "AlphabetBookGame", "SyllableGame", "SoundHouseGame", "EyeWriteGame", "ReadingGame" } },
            new Domain { Key = "nombres", Name = "Les nombres", Icon = "🔢", Img = "cubes", Tint = Color.FromRgb(0xE8, 0xF0, 0xFF),
                Games = new[] { "NumberPartyGame", "NumbersGame", "CompleteGame", "NumberFormsGame", "ModelCopyGame", "CountGame", "MathGame" } },
            new Domain { Key = "musique", Name = "La musique", Icon = "🎵", Img = "note-musique", Tint = Color.FromRgb(0xFF, 0xF3, 0xD6),
                Games = new[] { "MusicSchoolGame", "BirdSongGame" } },
            new Domain { Key = "parler", Name = "Parler", Icon = "💬", Img = "micro", Tint = Color.FromRgb(0xDD, 0xEE, 0xFF), Games = new string[0] },
            new Domain { Key = "decouvrir", Name = "Découvrir", Icon = "🌱", Img = "arbre-2", Tint = Color.FromRgb(0xEA, 0xF8, 0xEE),
                Games = new[] { "ColorMagicGame", "SizeGame", "PatternGame", "NecklaceGame", "VocabGame", "BodyGame", "EmotionsGame", "TidyHouseGame",
                                "CapitalsGame", "SuitcaseGame", "FoodGame", "PlanetsGame", "DayNightGame", "EnglishGame", "ColorsGame", "ShapesGame", "ShadowGame" } },
            new Domain { Key = "jeux", Name = "Les jeux", Icon = "🎮", Img = "ballon", Tint = Color.FromRgb(0xF1, 0xE6, 0xFF), Games = null }, // tout le reste
        };

        private sealed class Badge
        {
            public string Key, Name, Say, Img, Emoji;
            public Func<Stats, bool> Earned;
        }

        private sealed class Stats
        {
            public int Stars, Days, Streak, Comm, Music, Level;
            public Dictionary<string, int> ByDomain = new Dictionary<string, int>();
        }

        private static readonly Badge[] Badges =
        {
            new Badge { Key = "10", Name = "10 étoiles", Say = "Tes dix premières étoiles !", Img = "etoile", Emoji = "⭐", Earned = s => s.Stars >= 10 },
            new Badge { Key = "50", Name = "50 étoiles", Say = "Cinquante étoiles ! Quelle collection !", Img = "etoile-rose", Emoji = "🌟", Earned = s => s.Stars >= 50 },
            new Badge { Key = "100", Name = "100 étoiles", Say = "Cent étoiles ! Tu es une championne !", Img = "etoile-violette", Emoji = "💫", Earned = s => s.Stars >= 100 },
            new Badge { Key = "250", Name = "250 étoiles", Say = "Deux cent cinquante étoiles ! Incroyable !", Img = "etoile-filante", Emoji = "🌠", Earned = s => s.Stars >= 250 },
            new Badge { Key = "3j", Name = "3 jours de suite", Say = "Tu as joué trois jours de suite !", Img = "soleil", Emoji = "☀️", Earned = s => s.Streak >= 3 },
            new Badge { Key = "7j", Name = "7 jours de suite", Say = "Une semaine entière ! Bravo !", Img = "arc-en-ciel", Emoji = "🌈", Earned = s => s.Streak >= 7 },
            new Badge { Key = "n2", Name = "Moyenne section", Say = "Tu es passée en moyenne section !", Img = "couronne", Emoji = "👑", Earned = s => s.Level >= 2 },
            new Badge { Key = "n3", Name = "Grande section", Say = "Tu es en grande section ! Comme une grande !", Img = "diamant", Emoji = "💎", Earned = s => s.Level >= 3 },
            new Badge { Key = "parle", Name = "Je parle !", Say = "Tu as dit plein de choses avec ta grille !", Img = "micro", Emoji = "💬", Earned = s => s.Comm >= 10 },
            new Badge { Key = "musique", Name = "Musicienne", Say = "Tu es une vraie musicienne !", Img = "note-musique", Emoji = "🎵", Earned = s => s.Music >= 20 },
        };

        private readonly Grid _root;
        private readonly Canvas _treeCanvas = new Canvas { Width = 520, Height = 520, IsHitTestVisible = false };
        private readonly TextBlock _title;
        private readonly UniformGrid _domainRow = new UniformGrid { Columns = 6, Margin = new Thickness(10, 0, 10, 0) };
        private readonly UniformGrid _badgeRow = new UniformGrid { Columns = 5, Rows = 2, Margin = new Thickness(10, 0, 10, 0) };
        private Stats _stats;

        public ProgressBookView()
        {
            _root = new Grid
            {
                Background = new LinearGradientBrush(Color.FromRgb(0xE3, 0xF6, 0xE8), Color.FromRgb(0xFF, 0xF7, 0xE0), 90),
            };
            _root.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
            _root.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });
            _root.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
            _root.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });

            // En haut : titre + étoiles, et les boutons.
            var top = new DockPanel { Margin = new Thickness(16, 10, 16, 4) };
            var back = Big("⬅  Jouer", 170);
            back.Click += (o, ev) => CloseRequested?.Invoke();
            DockPanel.SetDock(back, Dock.Left);
            top.Children.Add(back);
            var shop = Big("🛒  Boutique", 190);
            shop.Click += (o, ev) => ShopRequested?.Invoke();
            DockPanel.SetDock(shop, Dock.Right);
            top.Children.Add(shop);
            _title = new TextBlock
            {
                Text = "📒 Mon carnet", FontSize = 46, FontWeight = FontWeights.ExtraBold,
                Foreground = new SolidColorBrush(Color.FromRgb(0x3B, 0x2A, 0x5A)), HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center,
            };
            top.Children.Add(_title);
            Grid.SetRow(top, 0);
            _root.Children.Add(top);

            // Au milieu : l'arbre à gauche, les domaines à droite.
            var middle = new Grid();
            middle.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(2, GridUnitType.Star) });
            middle.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(3, GridUnitType.Star) });
            var treeBox = new Viewbox { Child = _treeCanvas, Stretch = Stretch.Uniform, Margin = new Thickness(10) };
            Grid.SetColumn(treeBox, 0);
            middle.Children.Add(treeBox);
            var domainsBox = new Viewbox { Child = _domainRow, Stretch = Stretch.Uniform, StretchDirection = StretchDirection.DownOnly, Margin = new Thickness(6) };
            _domainRow.Columns = 3;
            _domainRow.Rows = 2;
            _domainRow.Width = 780;
            _domainRow.Height = 440;
            Grid.SetColumn(domainsBox, 1);
            middle.Children.Add(domainsBox);
            Grid.SetRow(middle, 1);
            _root.Children.Add(middle);

            // En bas : les badges.
            var badgesTitle = new TextBlock { Text = "🏅 Mes badges", FontSize = 26, FontWeight = FontWeights.Bold, Foreground = new SolidColorBrush(Color.FromRgb(0x5A, 0x4A, 0x7A)), Margin = new Thickness(20, 0, 0, 0) };
            Grid.SetRow(badgesTitle, 2);
            _root.Children.Add(badgesTitle);
            var badgesBox = new Viewbox { Child = _badgeRow, Stretch = Stretch.Uniform, StretchDirection = StretchDirection.DownOnly, Margin = new Thickness(6, 0, 6, 8), MaxHeight = 230 };
            _badgeRow.Width = 1300;
            _badgeRow.Height = 220;
            Grid.SetRow(badgesBox, 3);
            _root.Children.Add(badgesBox);

            Content = _root;
        }

        private static Button Big(string text, double width) => new Button
        {
            Style = (Style)Application.Current.Resources["AnswerButton"],
            Width = width, Height = 76, Content = new TextBlock { Text = text, FontSize = 22, FontWeight = FontWeights.Bold, Foreground = new SolidColorBrush(Color.FromRgb(0x3B, 0x2A, 0x5A)) },
            VerticalAlignment = VerticalAlignment.Center,
        };

        /// <summary>À chaque ouverture : on recompte tout, et la voix raconte.</summary>
        public void Open()
        {
            _stats = Compute();
            _title.Text = "📒 Mon carnet  ·  ⭐ " + _stats.Stars;
            BuildTree();
            BuildDomains();
            BuildBadges();
            int badges = Badges.Count(b => b.Earned(_stats));
            Speech.Say("Ton carnet ! Tu as " + _stats.Stars + (_stats.Stars > 1 ? " étoiles" : " étoile") + " ! " +
                       (_stats.Stars >= 25 ? "Ton arbre a grandi ! " : "Ton arbre va grandir ! ") +
                       (badges > 0 ? "Et tu as " + badges + (badges > 1 ? " badges !" : " badge !") : "Joue pour gagner des badges !"));
        }

        // ------------------------------------------------------------------
        //  Les comptes
        // ------------------------------------------------------------------
        private static Stats Compute()
        {
            var s = new Stats();
            foreach (var d in Domains) s.ByDomain[d.Key] = 0;
            var rows = Progress.Load();
            var days = new HashSet<DateTime>();
            foreach (var (day, game, count) in rows)
            {
                days.Add(day.Date);
                var dom = Domains.FirstOrDefault(d => d.Games != null && d.Games.Contains(game)) ?? Domains.Last();
                s.ByDomain[dom.Key] += count;
                if (dom.Key == "musique") s.Music += count;
            }
            s.Stars = Math.Max(RewardStore.Total, rows.Sum(r => r.Count));
            s.Days = days.Count;
            // Jours de suite, en remontant depuis aujourd'hui (ou hier).
            var cursor = days.Contains(DateTime.Today) ? DateTime.Today : DateTime.Today.AddDays(-1);
            while (days.Contains(cursor)) { s.Streak++; cursor = cursor.AddDays(-1); }
            try
            {
                var comm = GazeStats.Range(DateTime.Today.AddDays(-365), DateTime.Today);
                s.Comm = (int)comm.Where(kv => kv.Key.StartsWith("c:")).Sum(kv => kv.Value);
            }
            catch { }
            s.ByDomain["parler"] = s.Comm;
            s.Level = Level.Current;
            return s;
        }

        // ------------------------------------------------------------------
        //  L'arbre qui pousse
        // ------------------------------------------------------------------
        private void BuildTree()
        {
            _treeCanvas.Children.Clear();
            // Taille : 180 px à 0 étoile, 500 px vers 300 étoiles (courbe douce).
            double size = 180 + 320 * Math.Min(1, Math.Log(1 + _stats.Stars) / Math.Log(301));
            var tree = Art.Visual("arbre-2", "🌳", size);
            Canvas.SetLeft(tree, 260 - size / 2);
            Canvas.SetTop(tree, 520 - size);
            _treeCanvas.Children.Add(tree);
            // Une pomme tous les 25 étoiles (12 au plus), posées dans le feuillage.
            int apples = Math.Min(12, _stats.Stars / 25);
            var rng = new Random(42);
            for (int i = 0; i < apples; i++)
            {
                var apple = Art.Visual("pomme", "🍎", size * 0.14);
                double ang = rng.NextDouble() * Math.PI * 2, rad = rng.NextDouble() * size * 0.3;
                Canvas.SetLeft(apple, 260 + Math.Cos(ang) * rad - size * 0.07);
                Canvas.SetTop(apple, 520 - size * 0.62 + Math.Sin(ang) * rad * 0.6 - size * 0.07);
                _treeCanvas.Children.Add(apple);
                var tr = new ScaleTransform(0, 0);
                apple.RenderTransformOrigin = new Point(0.5, 0.5);
                apple.RenderTransform = tr;
                var grow = new DoubleAnimation(0, 1, TimeSpan.FromMilliseconds(400)) { BeginTime = TimeSpan.FromMilliseconds(300 + i * 120), EasingFunction = new BounceEase { Bounces = 2, Bounciness = 3 } };
                tr.BeginAnimation(ScaleTransform.ScaleXProperty, grow);
                tr.BeginAnimation(ScaleTransform.ScaleYProperty, grow);
            }
            var label = new TextBlock
            {
                Text = apples > 0 ? apples + (apples > 1 ? " pommes" : " pomme") + " · prochaine à " + ((_stats.Stars / 25 + 1) * 25) + " ⭐" : "Première pomme à 25 ⭐",
                FontSize = 24, FontWeight = FontWeights.Bold, Foreground = new SolidColorBrush(Color.FromRgb(0x3B, 0x2A, 0x5A)), Width = 520, TextAlignment = TextAlignment.Center,
            };
            Canvas.SetTop(label, 2);
            _treeCanvas.Children.Add(label);
        }

        // ------------------------------------------------------------------
        //  Les domaines : étoiles et podium (0 à 3)
        // ------------------------------------------------------------------
        private static int Podium(int count) => count >= 60 ? 3 : count >= 30 ? 2 : count >= 10 ? 1 : 0;

        private void BuildDomains()
        {
            _domainRow.Children.Clear();
            foreach (var d in Domains)
            {
                int n = _stats.ByDomain[d.Key];
                int p = Podium(n);
                var content = new StackPanel { HorizontalAlignment = HorizontalAlignment.Center };
                content.Children.Add(Art.Visual(d.Img, d.Icon, 90));
                content.Children.Add(new TextBlock { Text = d.Name, FontSize = 22, FontWeight = FontWeights.Bold, Foreground = new SolidColorBrush(Color.FromRgb(0x3B, 0x2A, 0x5A)), HorizontalAlignment = HorizontalAlignment.Center, Margin = new Thickness(0, 4, 0, 0) });
                content.Children.Add(new TextBlock { Text = (d.Key == "parler" ? "💬 " : "⭐ ") + n, FontSize = 30, FontWeight = FontWeights.ExtraBold, Foreground = new SolidColorBrush(Color.FromRgb(0xF2, 0x9E, 0x00)), HorizontalAlignment = HorizontalAlignment.Center });
                content.Children.Add(new TextBlock { Text = new string('●', p) + new string('○', 3 - p), FontSize = 22, Foreground = new SolidColorBrush(Color.FromRgb(0x7E, 0x3F, 0xF2)), HorizontalAlignment = HorizontalAlignment.Center });
                var btn = new Button
                {
                    Style = (Style)Application.Current.Resources["MenuTile"],
                    Width = 240, Height = 200, Margin = new Thickness(8),
                    Background = new SolidColorBrush(d.Tint),
                    Content = new Viewbox { Child = content, Margin = new Thickness(8), StretchDirection = StretchDirection.DownOnly },
                };
                var dom = d;
                btn.Click += (o, ev) =>
                {
                    Pulse(btn);
                    string say = dom.Key == "parler"
                        ? (n == 0 ? "Parler : tu n'as pas encore utilisé ta grille. Regarde le bouton Parler !" : "Parler : tu as dit " + n + " choses avec ta grille ! ")
                        : dom.Name + " : " + n + (n > 1 ? " étoiles" : " étoile") + ". " + (p == 3 ? "Tu es une championne !" : p == 2 ? "Tu es très forte !" : p == 1 ? "Tu progresses bien !" : "Viens jouer pour gagner des étoiles !");
                    Speech.Say(say);
                };
                _domainRow.Children.Add(btn);
            }
        }

        // ------------------------------------------------------------------
        //  Les badges
        // ------------------------------------------------------------------
        private void BuildBadges()
        {
            _badgeRow.Children.Clear();
            foreach (var b in Badges)
            {
                bool got = b.Earned(_stats);
                var content = new StackPanel { HorizontalAlignment = HorizontalAlignment.Center };
                var pic = Art.Visual(b.Img, b.Emoji, 70);
                pic.Opacity = got ? 1 : 0.25;
                content.Children.Add(pic);
                content.Children.Add(new TextBlock { Text = b.Name, FontSize = 18, FontWeight = FontWeights.Bold, Foreground = new SolidColorBrush(got ? Color.FromRgb(0x3B, 0x2A, 0x5A) : Color.FromRgb(0xA0, 0xA0, 0xB0)), HorizontalAlignment = HorizontalAlignment.Center, TextAlignment = TextAlignment.Center, TextWrapping = TextWrapping.Wrap, Width = 200 });
                var btn = new Button
                {
                    Style = (Style)Application.Current.Resources["AnswerButton"],
                    Width = 240, Height = 100, Margin = new Thickness(6),
                    Background = got ? new SolidColorBrush(Color.FromRgb(0xFF, 0xF1, 0xB8)) : new SolidColorBrush(Color.FromArgb(0x66, 0xFF, 0xFF, 0xFF)),
                    Content = new Viewbox { Child = content, Margin = new Thickness(4), StretchDirection = StretchDirection.DownOnly },
                };
                if (got) btn.Effect = new DropShadowEffect { BlurRadius = 18, ShadowDepth = 0, Color = Color.FromRgb(0xFF, 0xB3, 0x00), Opacity = 0.6 };
                var badge = b;
                btn.Click += (o, ev) =>
                {
                    Pulse(btn);
                    Speech.Say(got ? badge.Name + " ! " + badge.Say : badge.Name + " : pas encore ! " + Hint(badge));
                };
                _badgeRow.Children.Add(btn);
            }
        }

        private string Hint(Badge b)
        {
            switch (b.Key)
            {
                case "10": case "50": case "100": case "250": return "Il te faut " + b.Name + ". Continue à jouer !";
                case "3j": case "7j": return "Joue un peu chaque jour !";
                case "n2": case "n3": return "Réussis bien tes jeux, et tu monteras de niveau !";
                case "parle": return "Dis des choses avec ta grille Parler !";
                default: return "Joue avec le petit orchestre !";
            }
        }

        private static void Pulse(FrameworkElement el)
        {
            var sc = new ScaleTransform(1, 1);
            el.RenderTransformOrigin = new Point(0.5, 0.5);
            el.RenderTransform = sc;
            var a = new DoubleAnimation(1, 1.08, TimeSpan.FromMilliseconds(160)) { AutoReverse = true, EasingFunction = new SineEase() };
            sc.BeginAnimation(ScaleTransform.ScaleXProperty, a);
            sc.BeginAnimation(ScaleTransform.ScaleYProperty, a);
        }
    }
}
