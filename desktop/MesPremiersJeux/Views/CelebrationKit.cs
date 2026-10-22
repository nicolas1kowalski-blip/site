using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Shapes;
using MesPremiersJeux.Lib;

namespace MesPremiersJeux.Views
{
    /// <summary>
    /// 🎉 LE KIT DE CÉLÉBRATIONS : huit animations de félicitation différentes,
    /// tirées au sort à chaque réussite (sans jamais répéter la précédente) —
    /// fontaine de confettis, feu d'artifice éclair, cœurs qui s'envolent,
    /// lâcher de ballons, spirale d'étoiles, parade des animaux, vol de
    /// papillons, ondes arc-en-ciel. La surprise fait partie de la récompense.
    /// </summary>
    public static class CelebrationKit
    {
        private static readonly Random Rng = new Random();
        private static int _last = -1;

        private static readonly Color[] Palette =
        {
            Color.FromRgb(0xFF, 0x6B, 0x6B), Color.FromRgb(0x4E, 0xCD, 0xC4), Color.FromRgb(0xFF, 0xD9, 0x3C),
            Color.FromRgb(0x95, 0xE0, 0x6C), Color.FromRgb(0xA0, 0x6C, 0xD5), Color.FromRgb(0x5D, 0xAD, 0xE2),
            Color.FromRgb(0xFF, 0x8F, 0xD3),
        };

        /// <summary>Joue une célébration AU HASARD sur le canevas donné.</summary>
        public static void Play(Canvas c)
        {
            double w = c.ActualWidth, h = c.ActualHeight;
            if (w <= 0 || h <= 0) return;
            int pick;
            do { pick = Rng.Next(8); } while (pick == _last);
            _last = pick;
            switch (pick)
            {
                case 0: Confetti(c, w, h); break;
                case 1: Fireworks(c, w, h); break;
                case 2: Hearts(c, w, h); break;
                case 3: Balloons(c, w, h); break;
                case 4: StarSpiral(c, w, h); break;
                case 5: Parade(c, w, h); break;
                case 6: Butterflies(c, w, h); break;
                default: RainbowRings(c, w, h); break;
            }
        }

        // ------------------------------------------------------------------
        //  0 · La fontaine de confettis (le classique)
        // ------------------------------------------------------------------
        private const string StarPath = "M10,0 L12.9,7.6 L21,7.6 L14.5,12.6 L17,20.4 L10,15.5 L3,20.4 L5.5,12.6 L-1,7.6 L7.1,7.6 Z";

        private static void Confetti(Canvas c, double w, double h)
        {
            for (int i = 0; i < 60; i++)
            {
                var col = Palette[Rng.Next(Palette.Length)];
                var brush = new SolidColorBrush(col);
                FrameworkElement piece;
                switch (Rng.Next(3))
                {
                    case 0: piece = new Rectangle { Width = 12 + Rng.Next(8), Height = 16 + Rng.Next(10), RadiusX = 3, RadiusY = 3, Fill = brush }; break;
                    case 1: piece = new Ellipse { Width = 12 + Rng.Next(8), Height = 12 + Rng.Next(8), Fill = brush }; break;
                    default: piece = new Path { Data = Geometry.Parse(StarPath), Fill = brush, Stretch = Stretch.Uniform, Width = 20 + Rng.Next(10), Height = 20 + Rng.Next(10) }; break;
                }
                piece.RenderTransformOrigin = new Point(0.5, 0.5);
                double x0 = w * (0.5 + (Rng.NextDouble() - 0.5) * 0.3);
                double y0 = h * 0.86;
                Canvas.SetLeft(piece, x0);
                Canvas.SetTop(piece, y0);
                var tt = new TranslateTransform();
                var rot = new RotateTransform(Rng.Next(360));
                var grp = new TransformGroup();
                grp.Children.Add(rot);
                grp.Children.Add(tt);
                piece.RenderTransform = grp;
                c.Children.Add(piece);

                double dur = 1500 + Rng.Next(1300);
                double rise = h * (0.45 + Rng.NextDouble() * 0.42);
                double drift = (Rng.NextDouble() - 0.5) * w * 0.7;
                var yAnim = new DoubleAnimationUsingKeyFrames { Duration = TimeSpan.FromMilliseconds(dur) };
                yAnim.KeyFrames.Add(new SplineDoubleKeyFrame(-rise, KeyTime.FromPercent(0.42), new KeySpline(0.15, 0.7, 0.35, 1)));
                yAnim.KeyFrames.Add(new SplineDoubleKeyFrame(80, KeyTime.FromPercent(1), new KeySpline(0.4, 0, 0.7, 1)));
                tt.BeginAnimation(TranslateTransform.YProperty, yAnim);
                tt.BeginAnimation(TranslateTransform.XProperty,
                    new DoubleAnimation(0, drift, TimeSpan.FromMilliseconds(dur)) { AccelerationRatio = 0.2 });
                rot.BeginAnimation(RotateTransform.AngleProperty,
                    new DoubleAnimation(rot.Angle, rot.Angle + (Rng.Next(2) == 0 ? 720 : -720), TimeSpan.FromMilliseconds(dur)));
                FadeOutRemove(c, piece, dur, dur * 0.62);
            }
        }

        // ------------------------------------------------------------------
        //  1 · Le feu d'artifice éclair (trois bouquets)
        // ------------------------------------------------------------------
        private static void Fireworks(Canvas c, double w, double h)
        {
            for (int b = 0; b < 3; b++)
            {
                double cx = w * (0.25 + Rng.NextDouble() * 0.5), cy = h * (0.2 + Rng.NextDouble() * 0.35);
                int begin = b * 380;
                var col = Palette[Rng.Next(Palette.Length)];
                for (int i = 0; i < 22; i++)
                {
                    double angle = 2 * Math.PI * i / 22;
                    double dist = 100 + Rng.NextDouble() * 110;
                    var p = new Ellipse { Width = 10, Height = 10, Fill = new SolidColorBrush(col), Opacity = 0 };
                    var tt = new TranslateTransform();
                    p.RenderTransform = tt;
                    Canvas.SetLeft(p, cx);
                    Canvas.SetTop(p, cy);
                    c.Children.Add(p);
                    var show = new DoubleAnimation(0, 1, TimeSpan.FromMilliseconds(60)) { BeginTime = TimeSpan.FromMilliseconds(begin) };
                    p.BeginAnimation(UIElement.OpacityProperty, show);
                    var ax = new DoubleAnimation(0, Math.Cos(angle) * dist, TimeSpan.FromMilliseconds(900))
                    { BeginTime = TimeSpan.FromMilliseconds(begin), EasingFunction = new SineEase { EasingMode = EasingMode.EaseOut } };
                    var ay = new DoubleAnimation(0, Math.Sin(angle) * dist + 60, TimeSpan.FromMilliseconds(900))
                    { BeginTime = TimeSpan.FromMilliseconds(begin), EasingFunction = new SineEase { EasingMode = EasingMode.EaseOut } };
                    tt.BeginAnimation(TranslateTransform.XProperty, ax);
                    tt.BeginAnimation(TranslateTransform.YProperty, ay);
                    FadeOutRemove(c, p, 500, begin + 450);
                }
            }
            SoundFx.Boom();
        }

        // ------------------------------------------------------------------
        //  2 · Les cœurs qui s'envolent
        // ------------------------------------------------------------------
        private static void Hearts(Canvas c, double w, double h)
        {
            string[] glyphs = { "💖", "💛", "💙", "💚", "🧡" };
            for (int i = 0; i < 14; i++)
            {
                var t = new TextBlock { Text = glyphs[Rng.Next(glyphs.Length)], FontSize = 34 + Rng.Next(36), IsHitTestVisible = false };
                double x0 = Rng.NextDouble() * (w - 60);
                Canvas.SetLeft(t, x0);
                Canvas.SetTop(t, h + 20);
                var tt = new TranslateTransform();
                t.RenderTransform = tt;
                c.Children.Add(t);
                double dur = 2200 + Rng.Next(1400);
                int begin = i * 120;
                tt.BeginAnimation(TranslateTransform.YProperty,
                    new DoubleAnimation(0, -(h + 120), TimeSpan.FromMilliseconds(dur)) { BeginTime = TimeSpan.FromMilliseconds(begin) });
                tt.BeginAnimation(TranslateTransform.XProperty,
                    new DoubleAnimation(-36, 36, TimeSpan.FromMilliseconds(900))
                    { AutoReverse = true, RepeatBehavior = RepeatBehavior.Forever, EasingFunction = new SineEase { EasingMode = EasingMode.EaseInOut } });
                FadeOutRemove(c, t, 600, begin + dur - 600);
            }
        }

        // ------------------------------------------------------------------
        //  3 · Le lâcher de ballons
        // ------------------------------------------------------------------
        private static void Balloons(Canvas c, double w, double h)
        {
            for (int i = 0; i < 11; i++)
            {
                var t = new TextBlock { Text = i % 4 == 0 ? "🎉" : "🎈", FontSize = 52 + Rng.Next(44), IsHitTestVisible = false };
                Canvas.SetLeft(t, Rng.NextDouble() * (w - 80));
                Canvas.SetTop(t, h + 30);
                var tt = new TranslateTransform();
                t.RenderTransform = tt;
                c.Children.Add(t);
                double dur = 2600 + Rng.Next(1600);
                int begin = i * 140;
                tt.BeginAnimation(TranslateTransform.YProperty,
                    new DoubleAnimation(0, -(h + 150), TimeSpan.FromMilliseconds(dur)) { BeginTime = TimeSpan.FromMilliseconds(begin) });
                tt.BeginAnimation(TranslateTransform.XProperty,
                    new DoubleAnimation(-30, 30, TimeSpan.FromMilliseconds(1200))
                    { AutoReverse = true, RepeatBehavior = RepeatBehavior.Forever, EasingFunction = new SineEase { EasingMode = EasingMode.EaseInOut } });
                FadeOutRemove(c, t, 500, begin + dur - 500);
            }
            SoundFx.PopSound();
        }

        // ------------------------------------------------------------------
        //  4 · La spirale d'étoiles (depuis le centre)
        // ------------------------------------------------------------------
        private static void StarSpiral(Canvas c, double w, double h)
        {
            double cx = w / 2, cy = h / 2;
            for (int i = 0; i < 26; i++)
            {
                double angle = i * 0.62;
                double dist = 90 + i * 22;
                var t = new TextBlock { Text = i % 3 == 0 ? "✨" : "⭐", FontSize = 22 + Rng.Next(26), IsHitTestVisible = false, Opacity = 0, RenderTransformOrigin = new Point(0.5, 0.5) };
                var tt = new TranslateTransform();
                var rot = new RotateTransform(0);
                var grp = new TransformGroup();
                grp.Children.Add(rot);
                grp.Children.Add(tt);
                t.RenderTransform = grp;
                Canvas.SetLeft(t, cx);
                Canvas.SetTop(t, cy);
                c.Children.Add(t);
                int begin = i * 55;
                var show = new DoubleAnimation(0, 1, TimeSpan.FromMilliseconds(120)) { BeginTime = TimeSpan.FromMilliseconds(begin) };
                t.BeginAnimation(UIElement.OpacityProperty, show);
                tt.BeginAnimation(TranslateTransform.XProperty,
                    new DoubleAnimation(0, Math.Cos(angle) * dist, TimeSpan.FromMilliseconds(1100))
                    { BeginTime = TimeSpan.FromMilliseconds(begin), EasingFunction = new SineEase { EasingMode = EasingMode.EaseOut } });
                tt.BeginAnimation(TranslateTransform.YProperty,
                    new DoubleAnimation(0, Math.Sin(angle) * dist * 0.7, TimeSpan.FromMilliseconds(1100))
                    { BeginTime = TimeSpan.FromMilliseconds(begin), EasingFunction = new SineEase { EasingMode = EasingMode.EaseOut } });
                rot.BeginAnimation(RotateTransform.AngleProperty,
                    new DoubleAnimation(0, 360, TimeSpan.FromMilliseconds(1100)) { BeginTime = TimeSpan.FromMilliseconds(begin) });
                FadeOutRemove(c, t, 450, begin + 800);
            }
        }

        // ------------------------------------------------------------------
        //  5 · La parade des animaux (ils traversent en bondissant)
        // ------------------------------------------------------------------
        private static void Parade(Canvas c, double w, double h)
        {
            string[] animals = { "🦁", "🐸", "🐵", "🐰", "🦊", "🐥" };
            int n = 5;
            for (int i = 0; i < n; i++)
            {
                var t = new TextBlock { Text = animals[Rng.Next(animals.Length)], FontSize = 64, IsHitTestVisible = false };
                Canvas.SetLeft(t, -90);
                Canvas.SetTop(t, h - 110);
                var tt = new TranslateTransform();
                t.RenderTransform = tt;
                c.Children.Add(t);
                int begin = i * 320;
                double dur = 2800;
                tt.BeginAnimation(TranslateTransform.XProperty,
                    new DoubleAnimation(0, w + 180, TimeSpan.FromMilliseconds(dur)) { BeginTime = TimeSpan.FromMilliseconds(begin) });
                // Les petits bonds tout le long.
                var hop = new DoubleAnimation(0, -46, TimeSpan.FromMilliseconds(260))
                { AutoReverse = true, RepeatBehavior = RepeatBehavior.Forever, BeginTime = TimeSpan.FromMilliseconds(begin), EasingFunction = new SineEase { EasingMode = EasingMode.EaseOut } };
                tt.BeginAnimation(TranslateTransform.YProperty, hop);
                Remove(c, t, begin + dur + 100);
            }
            SoundFx.Note(0);
        }

        // ------------------------------------------------------------------
        //  6 · Le vol de papillons
        // ------------------------------------------------------------------
        private static void Butterflies(Canvas c, double w, double h)
        {
            for (int i = 0; i < 8; i++)
            {
                var t = new TextBlock { Text = i % 3 == 2 ? "🐝" : "🦋", FontSize = 40 + Rng.Next(26), IsHitTestVisible = false };
                bool fromLeft = i % 2 == 0;
                Canvas.SetLeft(t, fromLeft ? -70 : w + 20);
                Canvas.SetTop(t, h * (0.15 + Rng.NextDouble() * 0.55));
                var tt = new TranslateTransform();
                t.RenderTransform = tt;
                c.Children.Add(t);
                int begin = i * 240;
                double dur = 2600 + Rng.Next(900);
                tt.BeginAnimation(TranslateTransform.XProperty,
                    new DoubleAnimation(0, (fromLeft ? 1 : -1) * (w + 160), TimeSpan.FromMilliseconds(dur))
                    { BeginTime = TimeSpan.FromMilliseconds(begin) });
                tt.BeginAnimation(TranslateTransform.YProperty,
                    new DoubleAnimation(-50, 50, TimeSpan.FromMilliseconds(620))
                    { AutoReverse = true, RepeatBehavior = RepeatBehavior.Forever, EasingFunction = new SineEase { EasingMode = EasingMode.EaseInOut } });
                Remove(c, t, begin + dur + 100);
            }
        }

        // ------------------------------------------------------------------
        //  7 · Les ondes arc-en-ciel (anneaux colorés depuis le centre)
        // ------------------------------------------------------------------
        private static void RainbowRings(Canvas c, double w, double h)
        {
            double cx = w / 2, cy = h / 2;
            for (int i = 0; i < 6; i++)
            {
                var ring = new Ellipse
                {
                    Width = 60,
                    Height = 60,
                    Stroke = new SolidColorBrush(Palette[i % Palette.Length]),
                    StrokeThickness = 10,
                    Opacity = 0,
                    IsHitTestVisible = false,
                    RenderTransformOrigin = new Point(0.5, 0.5),
                };
                var sc = new ScaleTransform(0.3, 0.3);
                ring.RenderTransform = sc;
                Canvas.SetLeft(ring, cx - 30);
                Canvas.SetTop(ring, cy - 30);
                c.Children.Add(ring);
                int begin = i * 170;
                var show = new DoubleAnimation(0, 0.9, TimeSpan.FromMilliseconds(120)) { BeginTime = TimeSpan.FromMilliseconds(begin) };
                ring.BeginAnimation(UIElement.OpacityProperty, show);
                double grow = 6 + i * 2.5;
                sc.BeginAnimation(ScaleTransform.ScaleXProperty,
                    new DoubleAnimation(0.3, grow, TimeSpan.FromMilliseconds(1300))
                    { BeginTime = TimeSpan.FromMilliseconds(begin), EasingFunction = new SineEase { EasingMode = EasingMode.EaseOut } });
                sc.BeginAnimation(ScaleTransform.ScaleYProperty,
                    new DoubleAnimation(0.3, grow, TimeSpan.FromMilliseconds(1300))
                    { BeginTime = TimeSpan.FromMilliseconds(begin), EasingFunction = new SineEase { EasingMode = EasingMode.EaseOut } });
                FadeOutRemove(c, ring, 500, begin + 850);
            }
        }

        // ------------------------------------------------------------------
        private static void FadeOutRemove(Canvas c, FrameworkElement el, double fadeMs, double beginMs)
        {
            var fade = new DoubleAnimation(0, TimeSpan.FromMilliseconds(fadeMs)) { BeginTime = TimeSpan.FromMilliseconds(beginMs) };
            fade.Completed += (s, e) => c.Children.Remove(el);
            el.BeginAnimation(UIElement.OpacityProperty, fade, HandoffBehavior.Compose);
        }

        private static void Remove(Canvas c, FrameworkElement el, double afterMs)
        {
            var t = new System.Windows.Threading.DispatcherTimer { Interval = TimeSpan.FromMilliseconds(afterMs) };
            t.Tick += (s, e) => { t.Stop(); c.Children.Remove(el); };
            t.Start();
        }
    }
}
