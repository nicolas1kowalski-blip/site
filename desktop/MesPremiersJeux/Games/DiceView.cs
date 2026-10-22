using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Shapes;
using System.Windows.Threading;

namespace MesPremiersJeux.Games
{
    /// <summary>
    /// Un dé à six faces, entièrement DESSINÉ (aucune image) et animé : il « roule »
    /// en changeant de face de plus en plus lentement, puis s'immobilise sur la
    /// valeur voulue avec un petit rebond. Partagé par le jeu de l'oie et la course
    /// de chevaux.
    /// </summary>
    public sealed class DiceView
    {
        private const double S = 150; // côté du dé
        private static readonly Random Rng = new Random();
        private readonly Ellipse[] _pips = new Ellipse[9]; // grille 3×3 de points
        private readonly RotateTransform _rot = new RotateTransform(0);
        private readonly ScaleTransform _scale = new ScaleTransform(1, 1);
        private DispatcherTimer _timer;

        /// <summary>Élément visuel à insérer dans l'arbre (typiquement dans un bouton).</summary>
        public Grid Root { get; }

        public DiceView()
        {
            var face = new Border
            {
                Width = S,
                Height = S,
                CornerRadius = new CornerRadius(26),
                Background = new LinearGradientBrush(
                    Color.FromRgb(0xFF, 0xFF, 0xFF), Color.FromRgb(0xE7, 0xEB, 0xF5), 90),
                BorderBrush = new SolidColorBrush(Color.FromRgb(0x2B, 0x2D, 0x42)),
                BorderThickness = new Thickness(5),
            };

            var g = new Grid { Margin = new Thickness(20) };
            for (int i = 0; i < 3; i++)
            {
                g.RowDefinitions.Add(new RowDefinition());
                g.ColumnDefinitions.Add(new ColumnDefinition());
            }
            for (int i = 0; i < 9; i++)
            {
                var dot = new Ellipse
                {
                    Width = 30,
                    Height = 30,
                    Fill = new RadialGradientBrush(Color.FromRgb(0x54, 0x57, 0x74), Color.FromRgb(0x1C, 0x1E, 0x2E)),
                    HorizontalAlignment = HorizontalAlignment.Center,
                    VerticalAlignment = VerticalAlignment.Center,
                    Visibility = Visibility.Hidden,
                };
                Grid.SetRow(dot, i / 3);
                Grid.SetColumn(dot, i % 3);
                g.Children.Add(dot);
                _pips[i] = dot;
            }
            face.Child = g;

            Root = new Grid { Width = S, Height = S, RenderTransformOrigin = new Point(0.5, 0.5) };
            var grp = new TransformGroup();
            grp.Children.Add(_scale);
            grp.Children.Add(_rot);
            Root.RenderTransform = grp;
            Root.Children.Add(face);

            SetFace(1);
        }

        // Points allumés (indices 0..8 de la grille 3×3) pour chaque valeur 1..6.
        private static readonly int[][] Faces =
        {
            new int[0],
            new[] { 4 },                 // 1
            new[] { 0, 8 },              // 2
            new[] { 0, 4, 8 },           // 3
            new[] { 0, 2, 6, 8 },        // 4
            new[] { 0, 2, 4, 6, 8 },     // 5
            new[] { 0, 2, 3, 5, 6, 8 },  // 6
        };

        public void SetFace(int n)
        {
            n = Math.Max(1, Math.Min(6, n));
            for (int i = 0; i < 9; i++) _pips[i].Visibility = Visibility.Hidden;
            foreach (var i in Faces[n]) _pips[i].Visibility = Visibility.Visible;
        }

        /// <summary>Fait rouler le dé puis l'immobilise sur <paramref name="finalValue"/>.</summary>
        public void RollTo(int finalValue, Action done)
        {
            _timer?.Stop();
            _rot.BeginAnimation(RotateTransform.AngleProperty,
                new DoubleAnimation(0, 360, TimeSpan.FromMilliseconds(780))
                { EasingFunction = new QuadraticEase { EasingMode = EasingMode.EaseOut } });

            int ticks = 0;
            const int total = 15;
            _timer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(45) };
            _timer.Tick += (s, e) =>
            {
                ticks++;
                if (ticks >= total)
                {
                    _timer.Stop();
                    SetFace(finalValue);
                    var pop = new DoubleAnimation(1.28, 1, TimeSpan.FromMilliseconds(280))
                    { EasingFunction = new BackEase { EasingMode = EasingMode.EaseOut, Amplitude = 0.7 } };
                    _scale.BeginAnimation(ScaleTransform.ScaleXProperty, pop);
                    _scale.BeginAnimation(ScaleTransform.ScaleYProperty, pop);
                    done?.Invoke();
                }
                else
                {
                    SetFace(1 + Rng.Next(6));
                    _timer.Interval = TimeSpan.FromMilliseconds(45 + ticks * 9); // ralentit
                }
            };
            _timer.Start();
        }
    }
}
