using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Shapes;
using System.Windows.Threading;
using MesPremiersJeux.Lib;

namespace MesPremiersJeux.Games
{
    /// <summary>
    /// « Les oiseaux chanteurs » (inspiré de Look to Learn) : six oiseaux posés
    /// sur des branches. Regarder un oiseau le fait chanter EN BOUCLE (il ne
    /// s'arrête pas tout seul) ; le regarder à nouveau l'arrête. Chaque oiseau
    /// a son lecteur audio indépendant : plusieurs oiseaux chantent réellement
    /// en même temps, et comme tous chantent la même phrase transposée, leurs
    /// entrées décalées forment un CANON toujours harmonieux. Tous les six
    /// ensemble : le grand orchestre et les confettis.
    /// </summary>
    public sealed class BirdSongGame : GameControl
    {
        private const double W = 1500, H = 740;

        private static readonly (string Emoji, double X, double Y)[] Perch =
        {
            ("🐦", 150, 180), ("🐤", 620, 120), ("🦜", 1120, 170),
            ("🦉", 320, 470), ("🐧", 780, 430), ("🦆", 1210, 480),
        };

        private Canvas _canvas;
        private readonly MediaPlayer[] _players = new MediaPlayer[6];
        private readonly DispatcherTimer[] _anim = new DispatcherTimer[6];
        private readonly bool[] _on = new bool[6];
        private bool _celebrated;

        public BirdSongGame(Action celebrate) : base(celebrate)
        {
            Unloaded += (s, e) => StopAll(); // quitter le jeu coupe les chants
        }

        protected override void NewRound()
        {
            StopAll();
            Locked = false;
            _celebrated = false;
            Question.Text = "🐦 Les oiseaux chanteurs";
            SetConsigne(new TextBlock { Text = "🐦🎵" },
                () => "Regarde un oiseau : il chante sans s'arrêter ! Regarde-le encore pour l'arrêter. " +
                      "Fais-les chanter tous ensemble !");

            _canvas = new Canvas { Width = W, Height = H };

            // Ciel, soleil, nuages.
            _canvas.Children.Add(new Rectangle
            {
                Width = W,
                Height = H,
                RadiusX = 24,
                RadiusY = 24,
                Fill = new LinearGradientBrush(Color.FromRgb(0xBF, 0xE3, 0xFF), Color.FromRgb(0xEA, 0xF8, 0xE8), 90),
            });
            AddDecor("☀️", W - 150, 20, 80);
            AddDecor("☁️", 220, 30, 64);
            AddDecor("☁️", 900, 55, 52);

            // Branches juste sous les pattes de chaque rangée d'oiseaux.
            AddBranch(60, 400, 1380);
            AddBranch(120, 700, 1300);

            for (int i = 0; i < Perch.Length; i++)
            {
                var (emoji, x, y) = Perch[i];

                // Visuel : image du parent (oiseau-N.png + oiseau-N-vole.png)
                // → sinon le dessin vectoriel intégré, deux poses.
                FrameworkElement closed, openWings;
                var imgC = Art.Find("oiseau-" + (i + 1));
                if (imgC != null)
                {
                    closed = new Image { Source = imgC, Width = 150, Height = 150, Stretch = Stretch.Uniform };
                    var imgO = Art.Find("oiseau-" + (i + 1) + "-vole");
                    openWings = imgO == null ? null
                        : new Image { Source = imgO, Width = 150, Height = 150, Stretch = Stretch.Uniform };
                }
                else
                {
                    closed = BirdArt.Make(i, open: false, 150);
                    openWings = BirdArt.Make(i, open: true, 150);
                }
                var body = new ContentControl { Content = closed, HorizontalAlignment = HorizontalAlignment.Center };

                var note = new TextBlock
                {
                    Text = "🎵",
                    FontSize = 34,
                    Opacity = 0.25,        // s'allume quand l'oiseau chante
                    HorizontalAlignment = HorizontalAlignment.Center,
                };
                var bird = new Button
                {
                    Style = (Style)Application.Current.Resources["AnswerButton"],
                    Width = 230,
                    Height = 230,
                    RenderTransformOrigin = new Point(0.5, 0.5),
                    Content = new StackPanel { Children = { body, note } },
                };
                var sc = new ScaleTransform(1, 1);
                var sway = new RotateTransform(0);
                var tt = new TranslateTransform();
                var idle = new TranslateTransform();
                var grp = new TransformGroup();
                grp.Children.Add(sc);
                grp.Children.Add(sway);
                grp.Children.Add(tt);
                grp.Children.Add(idle);
                bird.RenderTransform = grp;

                // Vie permanente : respiration + balancement, phases décalées.
                var bob = new DoubleAnimation(0, -8, TimeSpan.FromSeconds(1.5 + i * 0.27))
                {
                    AutoReverse = true,
                    RepeatBehavior = RepeatBehavior.Forever,
                    BeginTime = TimeSpan.FromMilliseconds(i * 340),
                    EasingFunction = new SineEase { EasingMode = EasingMode.EaseInOut },
                };
                idle.BeginAnimation(TranslateTransform.YProperty, bob);
                var rock = new DoubleAnimation(-2.6, 2.6, TimeSpan.FromSeconds(2.0 + i * 0.33))
                {
                    AutoReverse = true,
                    RepeatBehavior = RepeatBehavior.Forever,
                    BeginTime = TimeSpan.FromMilliseconds(i * 520),
                    EasingFunction = new SineEase { EasingMode = EasingMode.EaseInOut },
                };
                sway.BeginAnimation(RotateTransform.AngleProperty, rock);

                int idx = i;
                bird.Click += (s, e) => Toggle(idx, body, closed, openWings, sc, tt, note, x, y);
                Canvas.SetLeft(bird, x);
                Canvas.SetTop(bird, y);
                _canvas.Children.Add(bird);
            }

            SetBody(_canvas);
            Speak("Les oiseaux chanteurs ! Regarde un oiseau pour qu'il chante. " +
                  "Regarde-le encore pour l'arrêter !");
        }

        // ------------------------------------------------------------------
        //  Marche / arrêt du chant (comme Look to Learn)
        // ------------------------------------------------------------------
        private void Toggle(int idx, ContentControl body, FrameworkElement closed, FrameworkElement openWings,
                            ScaleTransform sc, TranslateTransform tt, TextBlock note, double x, double y)
        {
            if (_on[idx]) StopBird(idx, body, closed, note);
            else StartBird(idx, body, closed, openWings, sc, tt, note, x, y);
        }

        private void StartBird(int idx, ContentControl body, FrameworkElement closed, FrameworkElement openWings,
                               ScaleTransform sc, TranslateTransform tt, TextBlock note, double x, double y)
        {
            _on[idx] = true;
            note.Opacity = 1;

            // Le lecteur de CET oiseau (indépendant → vraie polyphonie), qui
            // reboucle sans fin jusqu'à ce qu'on l'arrête.
            try
            {
                var p = _players[idx];
                if (p == null)
                {
                    p = new MediaPlayer { Volume = 0.6 };
                    p.MediaEnded += (s, e) => { p.Position = TimeSpan.Zero; p.Play(); };
                    _players[idx] = p;
                }
                p.Open(new Uri(SoundFx.BirdLoopFile(idx)));
                p.Play();
            }
            catch { }

            // Petit bond de départ.
            var hop = new DoubleAnimationUsingKeyFrames { Duration = TimeSpan.FromMilliseconds(600) };
            hop.KeyFrames.Add(new SplineDoubleKeyFrame(-30, KeyTime.FromPercent(0.3), new KeySpline(0.2, 0.8, 0.4, 1)));
            hop.KeyFrames.Add(new SplineDoubleKeyFrame(0, KeyTime.FromPercent(1), new KeySpline(0.5, 0, 0.8, 1)));
            tt.BeginAnimation(TranslateTransform.YProperty, hop);
            var puff = new DoubleAnimation(1, 1.15, TimeSpan.FromMilliseconds(320))
            { AutoReverse = true, EasingFunction = new SineEase() };
            sc.BeginAnimation(ScaleTransform.ScaleXProperty, puff);
            sc.BeginAnimation(ScaleTransform.ScaleYProperty, puff);

            // Tant qu'il chante : battement d'ailes continu + notes régulières.
            int tick = 0;
            var timer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(240) };
            timer.Tick += (s, e) =>
            {
                tick++;
                if (openWings != null)
                    body.Content = tick % 2 == 0 ? openWings : closed;
                if (tick % 5 == 0) SpawnNote(x, y, tick / 5);
            };
            timer.Start();
            _anim[idx] = timer;

            // Tous les six chantent EN MÊME TEMPS : le grand orchestre !
            if (_celebrated) return;
            foreach (var v in _on) if (!v) return;
            _celebrated = true;
            Speak("Tous les oiseaux chantent ensemble ! Quel orchestre ! Bravo !");
            GameKit.Success();
            Celebrate();
        }

        private void StopBird(int idx, ContentControl body, FrameworkElement closed, TextBlock note)
        {
            _on[idx] = false;
            note.Opacity = 0.25;
            try { _anim[idx]?.Stop(); } catch { }
            _anim[idx] = null;
            body.Content = closed;
            try { _players[idx]?.Stop(); } catch { }
        }

        private void StopAll()
        {
            for (int i = 0; i < 6; i++)
            {
                _on[i] = false;
                try { _anim[i]?.Stop(); } catch { }
                _anim[i] = null;
                try { _players[i]?.Stop(); } catch { }
                try { _players[i]?.Close(); } catch { }
                _players[i] = null;
            }
        }

        // Une note de musique qui s'envole au-dessus de l'oiseau.
        private void SpawnNote(double x, double y, int k)
        {
            var n = new TextBlock
            {
                Text = k % 2 == 0 ? "🎵" : "🎶",
                FontSize = 34 + (k % 3) * 6,
                IsHitTestVisible = false,
                Opacity = 0,
                RenderTransformOrigin = new Point(0.5, 0.5),
            };
            var ntt = new TranslateTransform();
            n.RenderTransform = ntt;
            Canvas.SetLeft(n, x + 90 + (k % 2 == 0 ? -30 : 40));
            Canvas.SetTop(n, y - 10);
            n.SetValue(Panel.ZIndexProperty, 60);
            _canvas.Children.Add(n);

            var up = new DoubleAnimation(0, -150, TimeSpan.FromMilliseconds(1400))
            { EasingFunction = new SineEase { EasingMode = EasingMode.EaseOut } };
            var swing = new DoubleAnimation(0, k % 2 == 0 ? -38 : 38, TimeSpan.FromMilliseconds(1400))
            { EasingFunction = new SineEase() };
            var fade = new DoubleAnimationUsingKeyFrames { Duration = TimeSpan.FromMilliseconds(1400) };
            fade.KeyFrames.Add(new LinearDoubleKeyFrame(1, KeyTime.FromPercent(0.15)));
            fade.KeyFrames.Add(new LinearDoubleKeyFrame(1, KeyTime.FromPercent(0.6)));
            fade.KeyFrames.Add(new LinearDoubleKeyFrame(0, KeyTime.FromPercent(1)));
            var captured = n;
            fade.Completed += (s, e) => _canvas.Children.Remove(captured);
            ntt.BeginAnimation(TranslateTransform.YProperty, up);
            ntt.BeginAnimation(TranslateTransform.XProperty, swing);
            n.BeginAnimation(OpacityProperty, fade);
        }

        private void AddBranch(double x, double y, double width)
        {
            var b = new Rectangle
            {
                Width = width,
                Height = 16,
                RadiusX = 8,
                RadiusY = 8,
                Fill = new SolidColorBrush(Color.FromRgb(0x9A, 0x6B, 0x3F)),
            };
            Canvas.SetLeft(b, x);
            Canvas.SetTop(b, y);
            _canvas.Children.Add(b);
            AddDecor("🍃", x + width - 60, y - 28, 40);
            AddDecor("🍃", x + 10, y - 26, 36);
        }

        private void AddDecor(string emoji, double x, double y, double size)
        {
            var t = new TextBlock { Text = emoji, FontSize = size, IsHitTestVisible = false };
            Canvas.SetLeft(t, x);
            Canvas.SetTop(t, y);
            _canvas.Children.Add(t);
        }
    }
}
