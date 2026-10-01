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
    /// « Feux d'artifice » (inspiré de Look to Learn) : là où l'enfant regarde,
    /// une fusée s'élance et explose en gerbe de couleurs, avec sifflement et
    /// boum doux. Cause-à-effet pur : TOUT l'écran répond au regard (grille de
    /// zones invisibles), aucun échec possible. Au bout de dix fusées : le
    /// bouquet final.
    /// </summary>
    public sealed class FireworksGame : GameControl
    {
        private const double W = 1500, H = 740;
        private const int Cols = 5, Rows = 3;

        private static readonly Color[] Palette =
        {
            Color.FromRgb(0xFF, 0x6B, 0x6B), Color.FromRgb(0xFF, 0xD9, 0x3C),
            Color.FromRgb(0x4E, 0xCD, 0xC4), Color.FromRgb(0x95, 0xE0, 0x6C),
            Color.FromRgb(0xB3, 0x88, 0xFF), Color.FromRgb(0xFF, 0x8F, 0xD3),
            Color.FromRgb(0x5D, 0xAD, 0xE2), Color.FromRgb(0xFF, 0xA9, 0x45),
        };

        private readonly Random _rng = new Random();
        private Canvas _canvas;
        private int _count;

        public FireworksGame(Action celebrate) : base(celebrate) { }

        protected override void NewRound()
        {
            Locked = false;
            _count = 0;
            Question.Text = "🎆 Feux d'artifice";
            SetConsigne(new TextBlock { Text = "👀✨" },
                () => "Regarde le ciel... et une fusée explose juste là ! Encore !");

            _canvas = new Canvas { Width = W, Height = H };

            // Nuit étoilée.
            _canvas.Children.Add(new Rectangle
            {
                Width = W,
                Height = H,
                RadiusX = 24,
                RadiusY = 24,
                Fill = new LinearGradientBrush(Color.FromRgb(0x1A, 0x1A, 0x3E), Color.FromRgb(0x3A, 0x2A, 0x5E), 90),
            });
            for (int i = 0; i < 26; i++)
            {
                var star = new TextBlock
                {
                    Text = "✦",
                    FontSize = 10 + _rng.Next(14),
                    Foreground = new SolidColorBrush(Color.FromArgb((byte)(120 + _rng.Next(120)), 255, 255, 220)),
                    IsHitTestVisible = false,
                };
                Canvas.SetLeft(star, _rng.NextDouble() * (W - 30));
                Canvas.SetTop(star, _rng.NextDouble() * (H - 120));
                _canvas.Children.Add(star);
            }
            var moon = new TextBlock { Text = "🌙", FontSize = 68, IsHitTestVisible = false };
            Canvas.SetLeft(moon, W - 140);
            Canvas.SetTop(moon, 24);
            _canvas.Children.Add(moon);
            var town = new TextBlock { Text = "🏠🏢🏠🌳🏰🌳🏠🏢🏠", FontSize = 52, IsHitTestVisible = false, Opacity = 0.65 };
            Canvas.SetLeft(town, W / 2 - 300);
            Canvas.SetTop(town, H - 72);
            _canvas.Children.Add(town);

            // La grille INVISIBLE : tout le ciel est cliquable au regard.
            double cw = W / Cols, ch = (H - 90) / Rows;
            for (int r = 0; r < Rows; r++)
                for (int c = 0; c < Cols; c++)
                {
                    var zone = InvisibleZone(cw - 8, ch - 8);
                    double cx = c * cw + cw / 2, cy = r * ch + ch / 2;
                    zone.Click += (s, e) => Launch(cx, cy);
                    Canvas.SetLeft(zone, c * cw + 4);
                    Canvas.SetTop(zone, r * ch + 4);
                    _canvas.Children.Add(zone);
                }

            SetBody(_canvas);
            Speak("Les feux d'artifice ! Regarde le ciel, là où tu veux... et boum !");
        }

        private static Button InvisibleZone(double w, double h)
        {
            var tpl = new ControlTemplate(typeof(Button));
            var border = new FrameworkElementFactory(typeof(Border));
            border.SetValue(Border.BackgroundProperty, Brushes.Transparent);
            tpl.VisualTree = border;
            return new Button { Template = tpl, Width = w, Height = h, Focusable = false };
        }

        private void Launch(double tx, double ty)
        {
            if (Locked) return;
            SoundFx.Whistle();

            // La fusée monte du sol vers le point regardé, avec une traînée.
            var rocket = new Ellipse
            {
                Width = 14,
                Height = 26,
                Fill = new SolidColorBrush(Color.FromRgb(0xFF, 0xE9, 0x9A)),
                IsHitTestVisible = false,
            };
            double x0 = tx + (_rng.NextDouble() - 0.5) * 120;
            Canvas.SetLeft(rocket, x0);
            Canvas.SetTop(rocket, H - 30);
            rocket.SetValue(Panel.ZIndexProperty, 50);
            _canvas.Children.Add(rocket);

            var dur = TimeSpan.FromMilliseconds(560);
            var ax = new DoubleAnimation(x0, tx, dur) { EasingFunction = new SineEase() };
            var ay = new DoubleAnimation(H - 30, ty, dur) { EasingFunction = new SineEase { EasingMode = EasingMode.EaseOut } };
            ay.Completed += (s, e) =>
            {
                _canvas.Children.Remove(rocket);
                Explode(tx, ty);
            };
            rocket.BeginAnimation(Canvas.LeftProperty, ax);
            rocket.BeginAnimation(Canvas.TopProperty, ay);

            // Petites étincelles qui tombent derrière la fusée.
            for (int k = 0; k < 5; k++)
            {
                var spark = new Ellipse { Width = 6, Height = 6, Fill = Brushes.Gold, IsHitTestVisible = false, Opacity = 0.8 };
                Canvas.SetLeft(spark, x0 + (_rng.NextDouble() - 0.5) * 14);
                Canvas.SetTop(spark, H - 30);
                _canvas.Children.Add(spark);
                var fall = new DoubleAnimation(H - 30, H - 30 - (ty - (H - 30)) * (k + 1) / 7.0, dur)
                { BeginTime = TimeSpan.FromMilliseconds(k * 60) };
                var fade = new DoubleAnimation(0.8, 0, TimeSpan.FromMilliseconds(400))
                { BeginTime = TimeSpan.FromMilliseconds(k * 60 + 150) };
                var captured = spark;
                fade.Completed += (s, e) => _canvas.Children.Remove(captured);
                spark.BeginAnimation(Canvas.TopProperty, fall);
                spark.BeginAnimation(OpacityProperty, fade);
            }
        }

        private void Explode(double cx, double cy)
        {
            SoundFx.Boom();
            var col = Palette[_rng.Next(Palette.Length)];
            var col2 = Palette[_rng.Next(Palette.Length)];

            // Flash central.
            var flash = new Ellipse
            {
                Width = 60,
                Height = 60,
                Fill = new SolidColorBrush(Color.FromArgb(200, 255, 255, 230)),
                IsHitTestVisible = false,
                RenderTransformOrigin = new Point(0.5, 0.5),
            };
            var fsc = new ScaleTransform(0.3, 0.3);
            flash.RenderTransform = fsc;
            Canvas.SetLeft(flash, cx - 30);
            Canvas.SetTop(flash, cy - 30);
            flash.SetValue(Panel.ZIndexProperty, 55);
            _canvas.Children.Add(flash);
            var grow = new DoubleAnimation(0.3, 2.6, TimeSpan.FromMilliseconds(320)) { EasingFunction = new SineEase { EasingMode = EasingMode.EaseOut } };
            var vanish = new DoubleAnimation(1, 0, TimeSpan.FromMilliseconds(320));
            var capturedFlash = flash;
            vanish.Completed += (s, e) => _canvas.Children.Remove(capturedFlash);
            fsc.BeginAnimation(ScaleTransform.ScaleXProperty, grow);
            fsc.BeginAnimation(ScaleTransform.ScaleYProperty, grow);
            flash.BeginAnimation(OpacityProperty, vanish);

            // La gerbe : particules qui rayonnent puis retombent doucement.
            int count = 22 + _rng.Next(8);
            for (int i = 0; i < count; i++)
            {
                double angle = 2 * Math.PI * i / count + _rng.NextDouble() * 0.2;
                double dist = 130 + _rng.NextDouble() * 150;
                double size = 9 + _rng.Next(9);
                var p = new Ellipse
                {
                    Width = size,
                    Height = size,
                    Fill = new SolidColorBrush(i % 2 == 0 ? col : col2),
                    IsHitTestVisible = false,
                    RenderTransformOrigin = new Point(0.5, 0.5),
                };
                var tt = new TranslateTransform();
                p.RenderTransform = tt;
                Canvas.SetLeft(p, cx - size / 2);
                Canvas.SetTop(p, cy - size / 2);
                p.SetValue(Panel.ZIndexProperty, 54);
                _canvas.Children.Add(p);

                double ms = 900 + _rng.Next(500);
                var ax = new DoubleAnimation(0, Math.Cos(angle) * dist, TimeSpan.FromMilliseconds(ms))
                { EasingFunction = new SineEase { EasingMode = EasingMode.EaseOut } };
                // Rayonne vers le haut puis la gravité la fait retomber.
                var ay = new DoubleAnimationUsingKeyFrames { Duration = TimeSpan.FromMilliseconds(ms) };
                ay.KeyFrames.Add(new SplineDoubleKeyFrame(Math.Sin(angle) * dist * 0.85, KeyTime.FromPercent(0.55), new KeySpline(0.2, 0.7, 0.4, 1)));
                ay.KeyFrames.Add(new SplineDoubleKeyFrame(Math.Sin(angle) * dist * 0.85 + 90, KeyTime.FromPercent(1), new KeySpline(0.5, 0, 0.8, 1)));
                var fade = new DoubleAnimation(1, 0, TimeSpan.FromMilliseconds(ms * 0.5)) { BeginTime = TimeSpan.FromMilliseconds(ms * 0.5) };
                var captured = p;
                fade.Completed += (s, e) => _canvas.Children.Remove(captured);
                tt.BeginAnimation(TranslateTransform.XProperty, ax);
                tt.BeginAnimation(TranslateTransform.YProperty, ay);
                p.BeginAnimation(OpacityProperty, fade);
            }

            if (Locked) return; // explosions du bouquet final : pas de recomptage
            _count++;
            if (_count == 4) Speak("Oh ! C'est magnifique !");
            if (_count < 10) return;

            // Bouquet final !
            Locked = true;
            Speak("Le bouquet final !");
            for (int i = 0; i < 6; i++)
            {
                int fi = i;
                Schedule(300 + i * 380, () =>
                {
                    SoundFx.Boom();
                    Explode(200 + fi * 220 + _rng.Next(80), 120 + _rng.Next(260));
                });
            }
            Schedule(3200, () =>
            {
                GameKit.Success();
                Celebrate();
                Speak("Quel feu d'artifice ! On recommence ?");
                Schedule(2200, NewRound);
            });
        }
    }
}
