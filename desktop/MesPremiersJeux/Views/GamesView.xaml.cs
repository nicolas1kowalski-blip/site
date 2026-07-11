using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Shapes;
using MesPremiersJeux.Games;

namespace MesPremiersJeux.Views
{
    /// <summary>
    /// Onglet Jeux : un sélecteur de jeu à gauche, le jeu actif au centre, et une
    /// pluie de confettis pour féliciter.
    /// </summary>
    public partial class GamesView : UserControl
    {
        private readonly (string Icon, string Label, Func<Action, UserControl> Make)[] _games =
        {
            ("🎈", "Ballons 3D",   c => new BalloonsGame(c)),
            ("🌈", "Couleurs",     c => new ColorsGame(c)),
            ("🔺", "Formes",       c => new ShapesGame(c)),
            ("🔢", "Compter",      c => new CountGame(c)),
            ("🌑", "Les ombres",   c => new ShadowGame(c)),
            ("🗂️", "Les familles", c => new FamiliesGame(c)),
            ("🃏", "Les paires",   c => new MemoryGame(c)),
        };

        private readonly Button[] _pickButtons;
        private readonly Random _rng = new Random();

        public GamesView()
        {
            InitializeComponent();
            _pickButtons = new Button[_games.Length];

            for (int i = 0; i < _games.Length; i++)
            {
                var g = _games[i];
                var content = new StackPanel { HorizontalAlignment = HorizontalAlignment.Center };
                content.Children.Add(new TextBlock { Text = g.Icon, FontSize = 30, HorizontalAlignment = HorizontalAlignment.Center });
                content.Children.Add(new TextBlock { Text = g.Label, FontSize = 14, FontWeight = FontWeights.SemiBold,
                    Foreground = new SolidColorBrush(Color.FromRgb(0x3B, 0x2A, 0x5A)), HorizontalAlignment = HorizontalAlignment.Center, Margin = new Thickness(0, 4, 0, 0) });

                var btn = new Button { Style = (Style)Application.Current.Resources["GamePick"], Content = content };
                int idx = i;
                btn.Click += (s, e) => Select(idx);
                _pickButtons[i] = btn;
                Picker.Children.Add(btn);
            }

            Loaded += (s, e) => { if (GameHost.Children.Count == 0) Select(0); };
        }

        private void Select(int i)
        {
            for (int k = 0; k < _pickButtons.Length; k++)
                _pickButtons[k].BorderThickness = new Thickness(k == i ? 3 : 0);

            GameHost.Children.Clear();
            GameHost.Children.Add(_games[i].Make(ShowConfetti));
        }

        // --- Confettis de félicitation ---
        private void ShowConfetti()
        {
            double w = Confetti.ActualWidth, h = Confetti.ActualHeight;
            if (w <= 0 || h <= 0) return;
            var colors = new[]
            {
                Color.FromRgb(0xFF, 0x6B, 0x6B), Color.FromRgb(0x4E, 0xCD, 0xC4), Color.FromRgb(0xFF, 0xD9, 0x3C),
                Color.FromRgb(0x95, 0xE0, 0x6C), Color.FromRgb(0xA0, 0x6C, 0xD5), Color.FromRgb(0x5D, 0xAD, 0xE2),
            };

            for (int i = 0; i < 32; i++)
            {
                var piece = new Rectangle
                {
                    Width = 10 + _rng.Next(8),
                    Height = 14 + _rng.Next(10),
                    Fill = new SolidColorBrush(colors[_rng.Next(colors.Length)]),
                    RadiusX = 2,
                    RadiusY = 2,
                    RenderTransformOrigin = new Point(0.5, 0.5),
                };
                double x = _rng.NextDouble() * w;
                Canvas.SetLeft(piece, x);
                Canvas.SetTop(piece, -30);
                var rot = new RotateTransform(_rng.Next(360));
                piece.RenderTransform = rot;
                Confetti.Children.Add(piece);

                double dur = 1400 + _rng.Next(1200);
                var fall = new DoubleAnimation(-30, h + 40, TimeSpan.FromMilliseconds(dur)) { AccelerationRatio = 0.3 };
                var spin = new DoubleAnimation(rot.Angle, rot.Angle + (_rng.Next(2) == 0 ? 360 : -360), TimeSpan.FromMilliseconds(dur));
                var fade = new DoubleAnimation(1, 0, TimeSpan.FromMilliseconds(dur)) { BeginTime = TimeSpan.FromMilliseconds(dur / 2) };

                var captured = piece;
                fall.Completed += (s, e) => Confetti.Children.Remove(captured);
                piece.BeginAnimation(Canvas.TopProperty, fall);
                rot.BeginAnimation(RotateTransform.AngleProperty, spin);
                piece.BeginAnimation(OpacityProperty, fade);
            }
        }
    }
}
