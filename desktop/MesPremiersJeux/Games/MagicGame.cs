using System;
using System.Collections.Generic;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Shapes;
using System.Windows.Threading;
using MesPremiersJeux.Gaze;
using MesPremiersJeux.Lib;

namespace MesPremiersJeux.Games
{
    /// <summary>
    /// « Bulles magiques » — jeu CAUSE À EFFET au regard pur : aucune fixation,
    /// aucun échec possible. Là où l'enfant regarde, des étincelles suivent ses
    /// yeux, et les bulles qu'il regarde ÉCLATENT. Toutes les 8 bulles : bravo +
    /// confettis + une étoile. C'est l'apprentissage « mes yeux agissent ».
    /// </summary>
    public sealed class MagicGame : UserControl
    {
        private readonly Action _celebrate;
        private readonly Canvas _canvas;
        private readonly DispatcherTimer _tick = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(30) };
        private readonly Random _rng = new Random();
        private readonly List<Bubble> _bubbles = new List<Bubble>();

        private Point _gazeLocal;
        private bool _gazeValid;
        private DateTime _lastSparkle = DateTime.MinValue;
        private int _pops;

        private static readonly Color[] BubbleColors =
        {
            Color.FromRgb(0x8A, 0xD6, 0xFF), Color.FromRgb(0xFF, 0x9F, 0xD3), Color.FromRgb(0xB3, 0x9D, 0xFF),
            Color.FromRgb(0x9F, 0xE0, 0x6C), Color.FromRgb(0xFF, 0xD9, 0x3C),
        };

        private sealed class Bubble
        {
            public Grid Ui;
            public double X, Y, R, Speed, Phase;
        }

        public MagicGame(Action celebrate)
        {
            _celebrate = celebrate;

            var root = new Grid();
            root.Background = new LinearGradientBrush(
                Color.FromRgb(0x1E, 0x2A, 0x4A), Color.FromRgb(0x3A, 0x21, 0x55), 90);
            _canvas = new Canvas { ClipToBounds = true };
            root.Children.Add(_canvas);
            root.Children.Add(new TextBlock
            {
                Text = "✨ Regarde les bulles pour les faire éclater ! ✨",
                FontSize = 30,
                FontWeight = FontWeights.Bold,
                Foreground = Brushes.White,
                Opacity = 0.9,
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Top,
                Margin = new Thickness(0, 14, 0, 0),
            });
            Content = root;

            Loaded += (s, e) =>
            {
                GazeGate.PushTargetsOnly(); // le regard n'actionne que le bouton retour
                GazeFeed.Sample += OnGaze;
                _tick.Tick += OnTick;
                _tick.Start();
                Speech.Say("Regarde les bulles pour les faire éclater !");
            };
            Unloaded += (s, e) =>
            {
                _tick.Stop();
                GazeFeed.Sample -= OnGaze;
                GazeGate.PopTargetsOnly();
            };
        }

        private void OnGaze(Point screen, bool valid)
        {
            _gazeValid = valid;
            if (!valid) return;
            try { _gazeLocal = _canvas.PointFromScreen(screen); }
            catch { _gazeValid = false; return; }

            // Traînée d'étincelles qui suit le regard (throttle : ~14/s).
            var now = DateTime.Now;
            if ((now - _lastSparkle).TotalMilliseconds > 70 &&
                _gazeLocal.X >= 0 && _gazeLocal.Y >= 0 &&
                _gazeLocal.X < _canvas.ActualWidth && _gazeLocal.Y < _canvas.ActualHeight)
            {
                _lastSparkle = now;
                Sparkle(_gazeLocal);
            }
        }

        private void OnTick(object sender, EventArgs e)
        {
            double w = _canvas.ActualWidth, h = _canvas.ActualHeight;
            if (w <= 0 || h <= 0) return;

            // Naissance des bulles (jusqu'à 6 en même temps).
            if (_bubbles.Count < 6 && _rng.NextDouble() < 0.05) SpawnBubble(w, h);

            // Montée + ondulation + collision avec le regard.
            for (int i = _bubbles.Count - 1; i >= 0; i--)
            {
                var b = _bubbles[i];
                b.Y -= b.Speed;
                b.Phase += 0.05;
                double x = b.X + Math.Sin(b.Phase) * 18;
                Canvas.SetLeft(b.Ui, x - b.R);
                Canvas.SetTop(b.Ui, b.Y - b.R);

                if (b.Y + b.R < 0) { _canvas.Children.Remove(b.Ui); _bubbles.RemoveAt(i); continue; }

                if (_gazeValid)
                {
                    double dx = _gazeLocal.X - x, dy = _gazeLocal.Y - b.Y;
                    if (dx * dx + dy * dy < b.R * b.R) Pop(b, i, x);
                }
            }
        }

        private void SpawnBubble(double w, double h)
        {
            double r = 55 + _rng.Next(45);
            var color = BubbleColors[_rng.Next(BubbleColors.Length)];

            var ui = new Grid { Width = 2 * r, Height = 2 * r };
            ui.Children.Add(new Ellipse
            {
                Fill = new RadialGradientBrush
                {
                    GradientOrigin = new Point(0.35, 0.3),
                    GradientStops =
                    {
                        new GradientStop(Color.FromArgb(0x50, color.R, color.G, color.B), 0.0),
                        new GradientStop(Color.FromArgb(0x88, color.R, color.G, color.B), 0.85),
                        new GradientStop(Color.FromArgb(0xE0, 0xFF, 0xFF, 0xFF), 1.0),
                    },
                },
            });
            // Reflet.
            var shine = new Ellipse
            {
                Width = r * 0.5, Height = r * 0.32,
                Fill = new SolidColorBrush(Color.FromArgb(0x99, 0xFF, 0xFF, 0xFF)),
                HorizontalAlignment = HorizontalAlignment.Left,
                VerticalAlignment = VerticalAlignment.Top,
                Margin = new Thickness(r * 0.35, r * 0.3, 0, 0),
                RenderTransform = new RotateTransform(-25),
            };
            ui.Children.Add(shine);

            var b = new Bubble
            {
                Ui = ui,
                X = r + _rng.NextDouble() * (w - 2 * r),
                Y = h + r,
                R = r,
                Speed = 1.4 + _rng.NextDouble() * 1.6,
                Phase = _rng.NextDouble() * Math.PI * 2,
            };
            Canvas.SetLeft(ui, b.X - r);
            Canvas.SetTop(ui, b.Y - r);
            _canvas.Children.Add(ui);
            _bubbles.Add(b);
        }

        private void Pop(Bubble b, int index, double x)
        {
            _canvas.Children.Remove(b.Ui);
            _bubbles.RemoveAt(index);
            GameKit.Success();

            // Éclat : gouttelettes qui partent en étoile.
            for (int k = 0; k < 8; k++)
            {
                double ang = Math.PI * 2 * k / 8;
                var drop = new Ellipse
                {
                    Width = 14, Height = 14,
                    Fill = new SolidColorBrush(Color.FromArgb(0xCC, 0xCF, 0xEC, 0xFF)),
                };
                Canvas.SetLeft(drop, x - 7);
                Canvas.SetTop(drop, b.Y - 7);
                _canvas.Children.Add(drop);
                var tt = new TranslateTransform();
                drop.RenderTransform = tt;
                double dist = b.R * (1.1 + _rng.NextDouble() * 0.6);
                tt.BeginAnimation(TranslateTransform.XProperty, new DoubleAnimation(0, Math.Cos(ang) * dist, TimeSpan.FromMilliseconds(420)));
                tt.BeginAnimation(TranslateTransform.YProperty, new DoubleAnimation(0, Math.Sin(ang) * dist, TimeSpan.FromMilliseconds(420)));
                var fade = new DoubleAnimation(1, 0, TimeSpan.FromMilliseconds(420));
                var captured = drop;
                fade.Completed += (s, e) => _canvas.Children.Remove(captured);
                drop.BeginAnimation(OpacityProperty, fade);
            }

            _pops++;
            if (_pops % 8 == 0)
            {
                RewardStore.Add();
                _celebrate?.Invoke();
                Speech.Say("Bravo !");
            }
        }

        // Étincelle qui suit le regard (petite étoile qui monte et s'efface).
        private void Sparkle(Point p)
        {
            var star = new Path
            {
                Data = Geometry.Parse("M10,0 L12.9,7.6 L21,7.6 L14.5,12.6 L17,20.4 L10,15.5 L3,20.4 L5.5,12.6 L-1,7.6 L7.1,7.6 Z"),
                Fill = new SolidColorBrush(Color.FromArgb(0xCC, 0xFF, 0xD9, 0x3C)),
                Stretch = Stretch.Uniform,
                Width = 18 + _rng.Next(12),
                Height = 18 + _rng.Next(12),
                IsHitTestVisible = false,
            };
            Canvas.SetLeft(star, p.X - star.Width / 2 + (_rng.NextDouble() - 0.5) * 26);
            Canvas.SetTop(star, p.Y - star.Height / 2 + (_rng.NextDouble() - 0.5) * 26);
            _canvas.Children.Add(star);

            var tt = new TranslateTransform();
            star.RenderTransform = tt;
            tt.BeginAnimation(TranslateTransform.YProperty, new DoubleAnimation(0, -30 - _rng.Next(24), TimeSpan.FromMilliseconds(650)));
            var fade = new DoubleAnimation(1, 0, TimeSpan.FromMilliseconds(650));
            var captured = star;
            fade.Completed += (s, e) => _canvas.Children.Remove(captured);
            star.BeginAnimation(OpacityProperty, fade);
        }
    }
}
