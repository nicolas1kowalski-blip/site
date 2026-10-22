using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Shapes;

namespace MesPremiersJeux.Views
{
    /// <summary>
    /// Décor de fond avec de la PROFONDEUR pour chaque onglet : ciel en dégradé,
    /// soleil pâle, nuages qui dérivent lentement, collines arrondies sur deux
    /// plans, petites étincelles. Tout est vectoriel, très doux (faible
    /// saturation) pour ne jamais gêner la lecture des tuiles, et insensible au
    /// regard (IsHitTestVisible = false).
    /// </summary>
    public sealed class DecorBackground : Viewbox
    {
        private const double W = 1600, H = 900;
        private readonly Canvas _canvas;
        private readonly Random _rng = new Random(12345);

        private DecorBackground(Color sky1, Color sky2, Color hillBack, Color hillFront)
        {
            Stretch = Stretch.Fill;
            IsHitTestVisible = false;
            _canvas = new Canvas { Width = W, Height = H };
            Child = _canvas;

            // Ciel.
            _canvas.Children.Add(new Rectangle
            {
                Width = W,
                Height = H,
                Fill = new LinearGradientBrush(sky1, sky2, 90),
            });

            // Soleil pâle avec son halo.
            var halo = new Ellipse
            {
                Width = 300,
                Height = 300,
                Fill = new RadialGradientBrush(Color.FromArgb(70, 255, 236, 160), Colors.Transparent),
            };
            Canvas.SetLeft(halo, W - 330);
            Canvas.SetTop(halo, -60);
            _canvas.Children.Add(halo);
            var sun = new Ellipse
            {
                Width = 130,
                Height = 130,
                Fill = new SolidColorBrush(Color.FromArgb(120, 255, 224, 130)),
            };
            Canvas.SetLeft(sun, W - 245);
            Canvas.SetTop(sun, 25);
            _canvas.Children.Add(sun);

            // Nuages (3 plans), qui dérivent très lentement en boucle.
            AddCloud(180, 90, 1.0, 95);
            AddCloud(760, 150, 0.72, 140);
            AddCloud(1180, 60, 0.85, 120);

            // Collines : plan arrière puis plan avant (grandes ellipses douces).
            AddHill(hillBack, -250, H - 190, 1100, 420);
            AddHill(hillBack, 820, H - 160, 1200, 380);
            AddHill(hillFront, -150, H - 110, 900, 360);
            AddHill(hillFront, 600, H - 90, 1300, 400);

            // Quelques étincelles discrètes qui respirent.
            for (int i = 0; i < 6; i++)
            {
                var sp = new TextBlock
                {
                    Text = "✦",
                    FontSize = 16 + _rng.Next(12),
                    Foreground = new SolidColorBrush(Color.FromArgb(90, 255, 255, 255)),
                };
                Canvas.SetLeft(sp, 80 + _rng.NextDouble() * (W - 160));
                Canvas.SetTop(sp, 40 + _rng.NextDouble() * (H * 0.5));
                _canvas.Children.Add(sp);
                var breathe = new DoubleAnimation(0.25, 1, TimeSpan.FromSeconds(2.2 + _rng.NextDouble() * 2))
                { AutoReverse = true, RepeatBehavior = RepeatBehavior.Forever, BeginTime = TimeSpan.FromSeconds(_rng.NextDouble() * 3) };
                sp.BeginAnimation(UIElement.OpacityProperty, breathe);
            }
        }

        private void AddCloud(double x, double y, double scale, double driftSeconds)
        {
            var cloud = new Canvas { Width = 220, Height = 90, Opacity = 0.75 };
            var white = new SolidColorBrush(Color.FromArgb(200, 255, 255, 255));
            foreach (var (dx, dy, r) in new[]
            {
                (0.0, 25.0, 38.0), (45.0, 5.0, 48.0), (105.0, 0.0, 52.0), (155.0, 20.0, 40.0), (60.0, 30.0, 45.0),
            })
            {
                var e = new Ellipse { Width = r * 2, Height = r * 1.6, Fill = white };
                Canvas.SetLeft(e, dx);
                Canvas.SetTop(e, dy);
                cloud.Children.Add(e);
            }
            cloud.RenderTransformOrigin = new Point(0.5, 0.5);
            var tt = new TranslateTransform();
            var grp = new TransformGroup();
            grp.Children.Add(new ScaleTransform(scale, scale));
            grp.Children.Add(tt);
            cloud.RenderTransform = grp;
            Canvas.SetLeft(cloud, x);
            Canvas.SetTop(cloud, y);
            _canvas.Children.Add(cloud);

            // Dérive lente, aller-retour infini (douce : ±90 px).
            var drift = new DoubleAnimation(-90, 90, TimeSpan.FromSeconds(driftSeconds))
            { AutoReverse = true, RepeatBehavior = RepeatBehavior.Forever, EasingFunction = new SineEase { EasingMode = EasingMode.EaseInOut } };
            tt.BeginAnimation(TranslateTransform.XProperty, drift);
        }

        private void AddHill(Color color, double x, double y, double w, double h)
        {
            var e = new Ellipse { Width = w, Height = h, Fill = new SolidColorBrush(color) };
            Canvas.SetLeft(e, x);
            Canvas.SetTop(e, y);
            _canvas.Children.Add(e);
        }

        // ------------------------------------------------------------------
        //  Un univers de couleurs par onglet (tons pastel, faible saturation).
        // ------------------------------------------------------------------
        public static DecorBackground ForGames() => new DecorBackground(
            Color.FromRgb(0xED, 0xE3, 0xFF), Color.FromRgb(0xFB, 0xF4, 0xFF),
            Color.FromArgb(90, 0xB3, 0x88, 0xFF), Color.FromArgb(110, 0xC9, 0xA8, 0xFF));

        public static DecorBackground ForEducation() => new DecorBackground(
            Color.FromRgb(0xDF, 0xF0, 0xFF), Color.FromRgb(0xF2, 0xFA, 0xFF),
            Color.FromArgb(90, 0x8A, 0xD6, 0xFF), Color.FromArgb(110, 0xAE, 0xE3, 0xFF));

        public static DecorBackground ForColoring() => new DecorBackground(
            Color.FromRgb(0xFF, 0xE6, 0xF4), Color.FromRgb(0xFF, 0xF6, 0xFB),
            Color.FromArgb(90, 0xFF, 0x9F, 0xD6), Color.FromArgb(110, 0xFF, 0xBC, 0xE3));

        public static DecorBackground ForStories() => new DecorBackground(
            Color.FromRgb(0xFF, 0xEF, 0xDC), Color.FromRgb(0xFF, 0xF9, 0xF0),
            Color.FromArgb(90, 0xFF, 0xC1, 0x7E), Color.FromArgb(110, 0xFF, 0xD6, 0xA5));

        public static DecorBackground ForMusic() => new DecorBackground(
            Color.FromRgb(0xDE, 0xF7, 0xEA), Color.FromRgb(0xF2, 0xFC, 0xF6),
            Color.FromArgb(90, 0x6B, 0xCB, 0x77), Color.FromArgb(110, 0x9A, 0xDD, 0xA4));
    }
}
