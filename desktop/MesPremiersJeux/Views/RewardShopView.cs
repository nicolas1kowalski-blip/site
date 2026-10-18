using System;
using System.IO;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Shapes;
using System.Windows.Threading;
using MesPremiersJeux.Lib;

namespace MesPremiersJeux.Views
{
    /// <summary>
    /// ⭐ LA BOUTIQUE DE RÉCOMPENSES : les étoiles gagnées dans les jeux
    /// s'ÉCHANGENT ici — le grand feu d'artifice, la fête des ballons, une
    /// chanson (onglet Musique) ou une VIDÉO de la famille (Contenu\Videos).
    /// Tout est cliquable au regard, achat en DEUX regards (le premier
    /// demande confirmation à voix haute). S'il manque des étoiles, on
    /// compte ensemble ce qu'il reste à gagner — la boutique motive.
    /// </summary>
    public sealed class RewardShopView : UserControl
    {
        public event Action CloseRequested;
        public event Action MusicRequested;

        private readonly Grid _root;
        private readonly TextBlock _balance;
        private readonly StackPanel _tilesRow;
        private readonly Grid _showHost;   // les spectacles (feu d'artifice…)
        private readonly Random _rng = new Random();
        private int _selected = -1;        // la tuile « en attente du 2e regard »
        private DispatcherTimer _selectTimeout;

        private sealed class Reward
        {
            public string Icon, Name, Speak;
            public int Cost;
            public Action Run;
            public Func<bool> Available = () => true;
        }

        private readonly Reward[] _rewards;

        private static string VideosDir => System.IO.Path.Combine(UserContent.RootDir, "Videos");

        public RewardShopView()
        {
            _rewards = new[]
            {
                new Reward { Icon = "🎆", Name = "Le grand feu d'artifice", Cost = 5,
                    Speak = "le grand feu d'artifice", Run = FireworksShow },
                new Reward { Icon = "🎈", Name = "La fête des ballons", Cost = 5,
                    Speak = "la fête des ballons", Run = BalloonShow },
                new Reward { Icon = "🎵", Name = "Une chanson", Cost = 8,
                    Speak = "une chanson", Run = () => MusicRequested?.Invoke(),
                    Available = () => MusicLibrary.Load().Count > 0 },
                new Reward { Icon = "🎬", Name = "Une vidéo de ma famille", Cost = 10,
                    Speak = "une vidéo de ta famille", Run = PlayVideo,
                    Available = () => VideoFiles().Length > 0 },
            };

            _root = new Grid
            {
                Background = new LinearGradientBrush(
                    Color.FromRgb(0x2A, 0x1E, 0x5A), Color.FromRgb(0x5A, 0x2A, 0x7E), 90),
            };
            _root.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
            _root.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });
            _root.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });

            // L'en-tête : titre + porte-monnaie géant.
            var header = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Center, Margin = new Thickness(0, 18, 0, 0) };
            header.Children.Add(new TextBlock { Text = "🛍️ Ma boutique", FontSize = 44, FontWeight = FontWeights.Bold, Foreground = Brushes.White, VerticalAlignment = VerticalAlignment.Center });
            _balance = new TextBlock { FontSize = 44, FontWeight = FontWeights.ExtraBold, Foreground = new SolidColorBrush(Color.FromRgb(0xFF, 0xD9, 0x3C)), Margin = new Thickness(36, 0, 0, 0), VerticalAlignment = VerticalAlignment.Center };
            header.Children.Add(_balance);
            Grid.SetRow(header, 0);
            _root.Children.Add(header);

            _tilesRow = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center };
            Grid.SetRow(_tilesRow, 1);
            _root.Children.Add(_tilesRow);

            var back = new Button
            {
                Style = (Style)Application.Current.Resources["BackButton"],
                Content = "⬅  Retour aux jeux",
                HorizontalAlignment = HorizontalAlignment.Center,
                Margin = new Thickness(0, 0, 0, 20),
            };
            back.Click += (s, e) => CloseRequested?.Invoke();
            Grid.SetRow(back, 2);
            _root.Children.Add(back);

            _showHost = new Grid { Visibility = Visibility.Collapsed };
            Grid.SetRowSpan(_showHost, 3);
            _root.Children.Add(_showHost);

            Content = _root;
            RewardStore.Changed += () => Dispatcher.Invoke(RefreshBalance);
        }

        /// <summary>Appelée à chaque ouverture : rafraîchit tout et accueille.</summary>
        public void Open()
        {
            _selected = -1;
            _showHost.Visibility = Visibility.Collapsed;
            _showHost.Children.Clear();
            BuildTiles();
            RefreshBalance();
            Speech.Say("Ta boutique ! Tu as " + RewardStore.Balance +
                       (RewardStore.Balance > 1 ? " étoiles" : " étoile") +
                       " ! Choisis ta récompense !");
        }

        private void RefreshBalance() => _balance.Text = "⭐ " + RewardStore.Balance;

        // ------------------------------------------------------------------
        //  Les tuiles de récompenses (achat en deux regards)
        // ------------------------------------------------------------------
        private void BuildTiles()
        {
            _tilesRow.Children.Clear();
            for (int i = 0; i < _rewards.Length; i++)
            {
                var r = _rewards[i];
                bool available = r.Available();
                int idx = i;

                var content = new StackPanel { HorizontalAlignment = HorizontalAlignment.Center };
                content.Children.Add(new TextBlock { Text = r.Icon, FontSize = 96, HorizontalAlignment = HorizontalAlignment.Center });
                content.Children.Add(new TextBlock
                {
                    Text = r.Name,
                    FontSize = 24,
                    FontWeight = FontWeights.Bold,
                    Foreground = new SolidColorBrush(Color.FromRgb(0x3B, 0x2A, 0x5A)),
                    TextWrapping = TextWrapping.Wrap,
                    TextAlignment = TextAlignment.Center,
                    MaxWidth = 230,
                    HorizontalAlignment = HorizontalAlignment.Center,
                    Margin = new Thickness(0, 8, 0, 4),
                });
                content.Children.Add(new TextBlock
                {
                    Text = "⭐ × " + r.Cost,
                    FontSize = 30,
                    FontWeight = FontWeights.ExtraBold,
                    Foreground = new SolidColorBrush(Color.FromRgb(0xE8, 0x8A, 0x2C)),
                    HorizontalAlignment = HorizontalAlignment.Center,
                });

                var tile = new Button
                {
                    Style = (Style)Application.Current.Resources["MenuTile"],
                    Width = 280,
                    Height = 310,
                    Margin = new Thickness(14),
                    Content = content,
                    RenderTransformOrigin = new Point(0.5, 0.5),
                    Opacity = available ? 1 : 0.45,
                };
                tile.RenderTransform = new ScaleTransform(1, 1);
                if (!available)
                {
                    tile.IsHitTestVisible = false;
                    content.Children.Add(new TextBlock
                    {
                        Text = r.Icon == "🎬" ? "(ajoute des vidéos dans Contenu\\Videos)" : "(à configurer dans Musique)",
                        FontSize = 13,
                        Foreground = new SolidColorBrush(Color.FromRgb(0x8A, 0x7A, 0xA8)),
                        TextWrapping = TextWrapping.Wrap,
                        TextAlignment = TextAlignment.Center,
                        MaxWidth = 230,
                    });
                }
                else
                {
                    tile.Click += (s, e) => TileClicked(idx, tile);
                }
                _tilesRow.Children.Add(tile);
            }
        }

        private void TileClicked(int idx, Button tile)
        {
            var r = _rewards[idx];
            if (RewardStore.Balance < r.Cost)
            {
                int missing = r.Cost - RewardStore.Balance;
                var tt = new TranslateTransform();
                var grp = new TransformGroup();
                grp.Children.Add(tile.RenderTransform);
                grp.Children.Add(tt);
                tile.RenderTransform = grp;
                var shake = new DoubleAnimationUsingKeyFrames { Duration = TimeSpan.FromMilliseconds(450) };
                foreach (var (p, v) in new[] { (0.0, 0.0), (0.25, -10.0), (0.5, 9.0), (0.75, -6.0), (1.0, 0.0) })
                    shake.KeyFrames.Add(new LinearDoubleKeyFrame(v, KeyTime.FromPercent(p)));
                tt.BeginAnimation(TranslateTransform.XProperty, shake);
                Speech.Say("Il faut " + r.Cost + " étoiles pour " + r.Speak + "... Tu en as " +
                           RewardStore.Balance + " ! Encore " + missing +
                           (missing > 1 ? " étoiles" : " étoile") + " et c'est à toi ! Va jouer pour les gagner !");
                return;
            }

            if (_selected != idx)
            {
                // Premier regard : on demande confirmation.
                _selected = idx;
                var sc = FindScale(tile);
                var grow = new DoubleAnimation(1, 1.12, TimeSpan.FromMilliseconds(300))
                { EasingFunction = new BackEase { EasingMode = EasingMode.EaseOut, Amplitude = 0.5 } };
                sc.BeginAnimation(ScaleTransform.ScaleXProperty, grow);
                sc.BeginAnimation(ScaleTransform.ScaleYProperty, grow);
                Speech.Say(Cap(r.Speak) + " pour " + r.Cost + " étoiles ? Regarde encore la carte pour dire OUI !");
                _selectTimeout?.Stop();
                _selectTimeout = new DispatcherTimer { Interval = TimeSpan.FromSeconds(8) };
                _selectTimeout.Tick += (s, e) =>
                {
                    _selectTimeout.Stop();
                    _selected = -1;
                    var back = new DoubleAnimation(1.12, 1, TimeSpan.FromMilliseconds(250));
                    sc.BeginAnimation(ScaleTransform.ScaleXProperty, back);
                    sc.BeginAnimation(ScaleTransform.ScaleYProperty, back);
                };
                _selectTimeout.Start();
                return;
            }

            // Deuxième regard : ACHAT !
            _selectTimeout?.Stop();
            _selected = -1;
            if (!RewardStore.TrySpend(r.Cost)) return;
            SoundFx.PopSound();
            Speech.Say("C'est parti pour " + r.Speak + " ! Bravo, tu l'as bien mérité !");
            var t = new DispatcherTimer { Interval = TimeSpan.FromSeconds(2.2) };
            t.Tick += (s, e) => { t.Stop(); r.Run(); };
            t.Start();
        }

        private static ScaleTransform FindScale(Button tile)
        {
            if (tile.RenderTransform is ScaleTransform sc) return sc;
            if (tile.RenderTransform is TransformGroup g)
                foreach (var tr in g.Children)
                    if (tr is ScaleTransform sc2) return sc2;
            var created = new ScaleTransform(1, 1);
            tile.RenderTransform = created;
            return created;
        }

        // ------------------------------------------------------------------
        //  🎆 Le grand feu d'artifice (40 secondes de spectacle)
        // ------------------------------------------------------------------
        private static readonly Color[] Palette =
        {
            Color.FromRgb(0xFF, 0x6B, 0x6B), Color.FromRgb(0xFF, 0xD9, 0x3C),
            Color.FromRgb(0x4E, 0xCD, 0xC4), Color.FromRgb(0x95, 0xE0, 0x6C),
            Color.FromRgb(0xB3, 0x88, 0xFF), Color.FromRgb(0xFF, 0x8F, 0xD3),
        };

        private void FireworksShow()
        {
            var canvas = StartShow(Color.FromRgb(0x10, 0x10, 0x2E), Color.FromRgb(0x2A, 0x1E, 0x4A));
            int bursts = 0;
            var timer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(650) };
            timer.Tick += (s, e) =>
            {
                bursts++;
                double w = Math.Max(600, canvas.ActualWidth), h = Math.Max(400, canvas.ActualHeight);
                int count = bursts % 7 == 0 ? 3 : 1; // parfois un triple !
                for (int b = 0; b < count; b++)
                    Burst(canvas, 80 + _rng.NextDouble() * (w - 160), 60 + _rng.NextDouble() * (h * 0.6));
                if (bursts == 1) SoundFx.Boom();
                else if (bursts % 2 == 0) SoundFx.Boom();
                if (bursts >= 55)
                {
                    timer.Stop();
                    EndShow("Quel feu d'artifice ! Et il est à toi !");
                }
            };
            timer.Start();
            Speech.Say("Ooooh ! Regarde le ciel !");
        }

        private void Burst(Canvas canvas, double cx, double cy)
        {
            var col = Palette[_rng.Next(Palette.Length)];
            int n = 18 + _rng.Next(10);
            for (int i = 0; i < n; i++)
            {
                double angle = 2 * Math.PI * i / n;
                double dist = 90 + _rng.NextDouble() * 120;
                var p = new Ellipse { Width = 9 + _rng.Next(8), Height = 9 + _rng.Next(8), Fill = new SolidColorBrush(col), IsHitTestVisible = false };
                var tt = new TranslateTransform();
                p.RenderTransform = tt;
                Canvas.SetLeft(p, cx);
                Canvas.SetTop(p, cy);
                canvas.Children.Add(p);
                double ms = 900 + _rng.Next(400);
                var ax = new DoubleAnimation(0, Math.Cos(angle) * dist, TimeSpan.FromMilliseconds(ms)) { EasingFunction = new SineEase { EasingMode = EasingMode.EaseOut } };
                var ay = new DoubleAnimationUsingKeyFrames { Duration = TimeSpan.FromMilliseconds(ms) };
                ay.KeyFrames.Add(new SplineDoubleKeyFrame(Math.Sin(angle) * dist * 0.85, KeyTime.FromPercent(0.55), new KeySpline(0.2, 0.7, 0.4, 1)));
                ay.KeyFrames.Add(new SplineDoubleKeyFrame(Math.Sin(angle) * dist * 0.85 + 70, KeyTime.FromPercent(1), new KeySpline(0.5, 0, 0.8, 1)));
                var fade = new DoubleAnimation(1, 0, TimeSpan.FromMilliseconds(ms * 0.5)) { BeginTime = TimeSpan.FromMilliseconds(ms * 0.5) };
                var captured = p;
                fade.Completed += (s, e) => canvas.Children.Remove(captured);
                tt.BeginAnimation(TranslateTransform.XProperty, ax);
                tt.BeginAnimation(TranslateTransform.YProperty, ay);
                p.BeginAnimation(OpacityProperty, fade);
            }
        }

        // ------------------------------------------------------------------
        //  🎈 La fête des ballons (ils montent sans fin, en musique de notes)
        // ------------------------------------------------------------------
        private void BalloonShow()
        {
            var canvas = StartShow(Color.FromRgb(0xBF, 0xE3, 0xFF), Color.FromRgb(0xFF, 0xE9, 0xF2));
            int sent = 0;
            var timer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(420) };
            timer.Tick += (s, e) =>
            {
                sent++;
                double w = Math.Max(600, canvas.ActualWidth), h = Math.Max(400, canvas.ActualHeight);
                var b = new TextBlock
                {
                    Text = new[] { "🎈", "🎀", "🎉", "🎊" }[_rng.Next(4)],
                    FontSize = 60 + _rng.Next(70),
                    IsHitTestVisible = false,
                };
                double x = _rng.NextDouble() * (w - 90);
                Canvas.SetLeft(b, x);
                Canvas.SetTop(b, h + 30);
                canvas.Children.Add(b);
                var tt = new TranslateTransform();
                b.RenderTransform = tt;
                double ms = 4200 + _rng.Next(2500);
                var up = new DoubleAnimation(0, -(h + 220), TimeSpan.FromMilliseconds(ms));
                var swayB = new DoubleAnimation(-40, 40, TimeSpan.FromMilliseconds(1500))
                { AutoReverse = true, RepeatBehavior = RepeatBehavior.Forever, EasingFunction = new SineEase { EasingMode = EasingMode.EaseInOut } };
                var captured = b;
                up.Completed += (s2, e2) => canvas.Children.Remove(captured);
                tt.BeginAnimation(TranslateTransform.YProperty, up);
                tt.BeginAnimation(TranslateTransform.XProperty, swayB);
                if (sent % 3 == 0) SoundFx.Note(sent / 3);
                if (sent >= 70)
                {
                    timer.Stop();
                    EndShow("Quelle belle fête de ballons ! Bravo !");
                }
            };
            timer.Start();
            Speech.Say("Que la fête commence ! Regarde tous ces ballons !");
        }

        // ------------------------------------------------------------------
        //  🎬 Une vidéo de la famille (Contenu\Videos)
        // ------------------------------------------------------------------
        private static string[] VideoFiles()
        {
            try
            {
                if (!Directory.Exists(VideosDir)) return Array.Empty<string>();
                return Directory.GetFiles(VideosDir)
                    .Where(f => new[] { ".mp4", ".wmv", ".avi", ".mov" }
                        .Contains(System.IO.Path.GetExtension(f).ToLowerInvariant()))
                    .ToArray();
            }
            catch { return Array.Empty<string>(); }
        }

        private void PlayVideo()
        {
            var files = VideoFiles();
            if (files.Length == 0) { EndShow(null); return; }
            var file = files[_rng.Next(files.Length)];

            _showHost.Children.Clear();
            _showHost.Background = Brushes.Black;
            _showHost.Visibility = Visibility.Visible;
            var media = new MediaElement
            {
                Source = new Uri(file),
                LoadedBehavior = MediaState.Play,
                Stretch = Stretch.Uniform,
            };
            media.MediaEnded += (s, e) => EndShow("C'était une belle vidéo, hein ?");
            media.MediaFailed += (s, e) => EndShow("Oups, la vidéo n'a pas voulu démarrer...");
            _showHost.Children.Add(media);

            var stop = new Button
            {
                Style = (Style)Application.Current.Resources["BackButton"],
                Content = "⏹  Fini",
                HorizontalAlignment = HorizontalAlignment.Right,
                VerticalAlignment = VerticalAlignment.Top,
                Margin = new Thickness(0, 14, 14, 0),
            };
            stop.Click += (s, e) => { try { media.Stop(); } catch { } EndShow(null); };
            _showHost.Children.Add(stop);
        }

        // ------------------------------------------------------------------
        private Canvas StartShow(Color top, Color bottom)
        {
            _showHost.Children.Clear();
            _showHost.Background = new LinearGradientBrush(top, bottom, 90);
            _showHost.Visibility = Visibility.Visible;
            var canvas = new Canvas { ClipToBounds = true };
            _showHost.Children.Add(canvas);
            return canvas;
        }

        private void EndShow(string said)
        {
            _showHost.Visibility = Visibility.Collapsed;
            _showHost.Children.Clear();
            RefreshBalance();
            BuildTiles();
            if (said != null) Speech.Say(said + " Il te reste " + RewardStore.Balance +
                (RewardStore.Balance > 1 ? " étoiles !" : " étoile !"));
        }

        private static string Cap(string s) => char.ToUpperInvariant(s[0]) + s.Substring(1);
    }
}
