using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Shapes;
using MesPremiersJeux.Lib;

namespace MesPremiersJeux.Games
{
    /// <summary>
    /// « Les oiseaux chanteurs » (inspiré de Look to Learn) : six oiseaux posés
    /// sur des branches ; en regarder un le fait sautiller, ouvrir grand les
    /// ailes et CHANTER sa petite mélodie à lui (gazouillis synthétisés, chaque
    /// oiseau a sa voix). Pur cause-à-effet, aucun échec possible. Quand tous
    /// les oiseaux ont chanté : le grand concert et les confettis.
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
        private bool[] _sung;

        public BirdSongGame(Action celebrate) : base(celebrate) { }

        protected override void NewRound()
        {
            Locked = false;
            _sung = new bool[Perch.Length];
            Question.Text = "🐦 Les oiseaux chanteurs";
            SetConsigne(new TextBlock { Text = "🐦🎵" },
                () => "Regarde un oiseau... et il chante pour toi ! Écoute-les tous !");

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

            // Branches sous chaque rangée d'oiseaux.
            AddBranch(60, 350, 1380);
            AddBranch(120, 648, 1300);

            for (int i = 0; i < Perch.Length; i++)
            {
                var (emoji, x, y) = Perch[i];
                // Image personnalisée (Contenu\Images\oiseau-N.png) sinon emoji.
                var body = Art.Visual("oiseau-" + (i + 1), emoji, 150);
                var note = new TextBlock
                {
                    Text = "🎵",
                    FontSize = 34,
                    Opacity = 0.25,        // devient net quand l'oiseau a chanté
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
                var sway = new RotateTransform(0);   // balancement permanent
                var tt = new TranslateTransform();   // le bond quand il chante
                var idle = new TranslateTransform(); // la respiration permanente
                var grp = new TransformGroup();
                grp.Children.Add(sc);
                grp.Children.Add(sway);
                grp.Children.Add(tt);
                grp.Children.Add(idle);
                bird.RenderTransform = grp;

                // Les oiseaux VIVENT en permanence : chacun se balance et
                // sautille doucement à son propre rythme (phases décalées).
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
                bird.Click += (s, e) => Sing(idx, bird, body, sc, tt, note, x, y);
                Canvas.SetLeft(bird, x);
                Canvas.SetTop(bird, y);
                _canvas.Children.Add(bird);
            }

            SetBody(_canvas);
            Speak("Les oiseaux chanteurs ! Regarde un oiseau pour l'entendre chanter !");
        }

        private void Sing(int idx, Button bird, FrameworkElement body, ScaleTransform sc, TranslateTransform tt, TextBlock note, double x, double y)
        {
            SoundFx.BirdChirp(idx);

            // Battement d'ailes : si une 2e image « oiseau-N-vole.png » existe
            // (ailes ouvertes), on alterne les deux pendant le chant.
            if (body is System.Windows.Controls.Image img)
            {
                var open = Art.Find("oiseau-" + (idx + 1) + "-vole");
                if (open != null)
                {
                    var closed = img.Source;
                    for (int f = 0; f < 8; f++)
                    {
                        int ff = f;
                        Schedule(ff * 130, () => img.Source = ff % 2 == 0 ? open : closed);
                    }
                    Schedule(8 * 130, () => img.Source = closed);
                }
            }

            // L'oiseau sautille (deux petits bonds) et se gonfle.
            var hop = new DoubleAnimationUsingKeyFrames { Duration = TimeSpan.FromMilliseconds(700) };
            hop.KeyFrames.Add(new SplineDoubleKeyFrame(-34, KeyTime.FromPercent(0.2), new KeySpline(0.2, 0.8, 0.4, 1)));
            hop.KeyFrames.Add(new SplineDoubleKeyFrame(0, KeyTime.FromPercent(0.45), new KeySpline(0.5, 0, 0.8, 1)));
            hop.KeyFrames.Add(new SplineDoubleKeyFrame(-20, KeyTime.FromPercent(0.65), new KeySpline(0.2, 0.8, 0.4, 1)));
            hop.KeyFrames.Add(new SplineDoubleKeyFrame(0, KeyTime.FromPercent(1), new KeySpline(0.5, 0, 0.8, 1)));
            tt.BeginAnimation(TranslateTransform.YProperty, hop);
            var puff = new DoubleAnimation(1, 1.18, TimeSpan.FromMilliseconds(350))
            { AutoReverse = true, EasingFunction = new SineEase() };
            sc.BeginAnimation(ScaleTransform.ScaleXProperty, puff);
            sc.BeginAnimation(ScaleTransform.ScaleYProperty, puff);

            // Des notes de musique s'envolent au-dessus de lui.
            for (int k = 0; k < 4; k++)
            {
                var n = new TextBlock
                {
                    Text = k % 2 == 0 ? "🎵" : "🎶",
                    FontSize = 34 + k * 5,
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

                int begin = k * 180;
                var up = new DoubleAnimation(0, -140 - k * 30, TimeSpan.FromMilliseconds(1300))
                { BeginTime = TimeSpan.FromMilliseconds(begin), EasingFunction = new SineEase { EasingMode = EasingMode.EaseOut } };
                var sway = new DoubleAnimation(0, k % 2 == 0 ? -36 : 36, TimeSpan.FromMilliseconds(1300))
                { BeginTime = TimeSpan.FromMilliseconds(begin), EasingFunction = new SineEase() };
                var fade = new DoubleAnimationUsingKeyFrames { Duration = TimeSpan.FromMilliseconds(1300), BeginTime = TimeSpan.FromMilliseconds(begin) };
                fade.KeyFrames.Add(new LinearDoubleKeyFrame(1, KeyTime.FromPercent(0.15)));
                fade.KeyFrames.Add(new LinearDoubleKeyFrame(1, KeyTime.FromPercent(0.6)));
                fade.KeyFrames.Add(new LinearDoubleKeyFrame(0, KeyTime.FromPercent(1)));
                var captured = n;
                fade.Completed += (s, e) => _canvas.Children.Remove(captured);
                ntt.BeginAnimation(TranslateTransform.YProperty, up);
                ntt.BeginAnimation(TranslateTransform.XProperty, sway);
                n.BeginAnimation(OpacityProperty, fade);
            }

            if (_sung[idx]) return;
            _sung[idx] = true;
            note.Opacity = 1; // souvenir : cet oiseau a chanté

            int heard = 0;
            foreach (var v in _sung) if (v) heard++;
            if (heard < _sung.Length) return;

            // Tous ont chanté : le grand concert !
            Locked = true;
            Schedule(900, () =>
            {
                for (int i = 0; i < Perch.Length; i++)
                {
                    int vi = i;
                    Schedule(i * 350, () => SoundFx.BirdChirp(vi));
                }
                Speak("Bravo ! Tous les oiseaux ont chanté ! Quel joli concert !");
                GameKit.Success();
                Celebrate();
                Schedule(4200, NewRound);
            });
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
            Canvas.SetTop(b, y + 218);
            _canvas.Children.Add(b);
            AddDecor("🍃", x + width - 60, y + 190, 40);
            AddDecor("🍃", x + 10, y + 192, 36);
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
