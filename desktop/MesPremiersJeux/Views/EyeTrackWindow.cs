using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Shapes;
using System.Windows.Threading;
using MesPremiersJeux.Gaze;

namespace MesPremiersJeux.Views
{
    /// <summary>
    /// « Position des yeux » : montre en direct où la caméra voit les yeux de
    /// l'enfant (deux points dans une boîte), pour vérifier que la tablette est
    /// bien placée (points au centre et verts = bien placé). Effet miroir.
    /// </summary>
    public sealed class EyeTrackWindow : Window
    {
        private readonly IEyeStream _gaze;
        private readonly Canvas _box;
        private readonly Ellipse _left, _right;
        private readonly Rectangle _depthMark;
        private readonly TextBlock _status;
        private readonly DispatcherTimer _timer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(40) };

        private const double BX = 70, BY = 110, BW = 420, BH = 300;   // boîte de suivi
        private const double DX = 520, DW = 40;                       // jauge de distance

        private EyeSample _latest;
        private DateTime _lastEye = DateTime.MinValue;

        public EyeTrackWindow(IEyeStream gaze)
        {
            _gaze = gaze;
            Gaze.GazeGate.Push();
            Closed += (s, e) => { Gaze.GazeGate.Pop(); _gaze.Eyes -= OnEye; _timer.Stop(); };

            Title = "Position des yeux";
            Width = 640;
            Height = 560;
            WindowStartupLocation = WindowStartupLocation.CenterOwner;
            Background = new SolidColorBrush(Color.FromRgb(0x22, 0x1B, 0x38));

            var root = new Grid();
            root.Children.Add(new TextBlock
            {
                Text = "Place-toi bien en face de la tablette.\nLes deux points doivent être au CENTRE et VERTS.",
                Foreground = Brushes.White,
                FontSize = 18,
                TextAlignment = TextAlignment.Center,
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Top,
                Margin = new Thickness(0, 16, 0, 0),
            });

            _box = new Canvas();
            root.Children.Add(_box);

            // Boîte de suivi + repère central (zone idéale).
            _box.Children.Add(new Rectangle
            {
                Width = BW, Height = BH, RadiusX = 24, RadiusY = 24,
                Stroke = new SolidColorBrush(Color.FromRgb(0x6C, 0x5A, 0x9A)), StrokeThickness = 3,
                Fill = new SolidColorBrush(Color.FromRgb(0x2E, 0x25, 0x4C)),
            });
            SetPos(_box.Children[_box.Children.Count - 1], BX, BY);
            var target = new Ellipse
            {
                Width = BW * 0.42, Height = BH * 0.42,
                Stroke = new SolidColorBrush(Color.FromArgb(0x66, 0x9F, 0xE0, 0x6C)), StrokeThickness = 2,
                StrokeDashArray = new DoubleCollection { 4, 4 },
            };
            _box.Children.Add(target);
            SetPos(target, BX + BW / 2 - BW * 0.21, BY + BH / 2 - BH * 0.21);

            _left = EyeDot();
            _right = EyeDot();
            _box.Children.Add(_left);
            _box.Children.Add(_right);

            // Jauge de distance (Z), avec bande idéale au milieu.
            _box.Children.Add(new Rectangle { Width = DW, Height = BH, RadiusX = 12, RadiusY = 12, Fill = new SolidColorBrush(Color.FromRgb(0x2E, 0x25, 0x4C)), Stroke = new SolidColorBrush(Color.FromRgb(0x6C, 0x5A, 0x9A)), StrokeThickness = 2 });
            SetPos(_box.Children[_box.Children.Count - 1], DX, BY);
            var ideal = new Rectangle { Width = DW, Height = BH / 3, Fill = new SolidColorBrush(Color.FromArgb(0x44, 0x9F, 0xE0, 0x6C)) };
            _box.Children.Add(ideal);
            SetPos(ideal, DX, BY + BH / 3);
            _depthMark = new Rectangle { Width = DW + 12, Height = 10, RadiusX = 5, RadiusY = 5, Fill = Brushes.White, Visibility = Visibility.Hidden };
            _box.Children.Add(_depthMark);

            _status = new TextBlock
            {
                FontSize = 24, FontWeight = FontWeights.Bold, Foreground = Brushes.White,
                HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Bottom,
                Margin = new Thickness(0, 0, 0, 74), TextAlignment = TextAlignment.Center,
            };
            root.Children.Add(_status);

            var close = new Button { Content = "Fermer", FontSize = 16, Padding = new Thickness(22, 10, 22, 10), HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Bottom, Margin = new Thickness(0, 0, 0, 18) };
            close.Click += (s, e) => Close();
            root.Children.Add(close);

            Content = root;

            _gaze.Eyes += OnEye;
            _timer.Tick += (s, e) => Render();
            _timer.Start();
        }

        private static Ellipse EyeDot() => new Ellipse
        {
            Width = 40, Height = 40,
            Stroke = Brushes.White, StrokeThickness = 3,
            Visibility = Visibility.Hidden,
        };

        private static void SetPos(UIElement el, double x, double y) { Canvas.SetLeft(el, x); Canvas.SetTop(el, y); }

        private void OnEye(EyeSample s) { _latest = s; _lastEye = DateTime.Now; }

        private void Render()
        {
            if (!_gaze.IsAvailable)
            {
                _status.Text = "Eye tracker non détecté sur cet appareil.";
                _left.Visibility = _right.Visibility = _depthMark.Visibility = Visibility.Hidden;
                return;
            }

            bool fresh = (DateTime.Now - _lastEye).TotalMilliseconds < 600;
            var s = _latest;
            bool anyValid = fresh && (s.HasLeft || s.HasRight);

            PlaceEye(_left, s.HasLeft && fresh, s.LX, s.LY);
            PlaceEye(_right, s.HasRight && fresh, s.RX, s.RY);

            // Distance (Z) : marqueur dans la jauge, si au moins un œil est vu.
            double z = s.HasLeft ? s.LZ : (s.HasRight ? s.RZ : 0.5);
            if (anyValid)
            {
                _depthMark.Visibility = Visibility.Visible;
                SetPos(_depthMark, DX - 6, BY + Clamp01(z) * BH - 5);
            }
            else _depthMark.Visibility = Visibility.Hidden;

            if (!anyValid)
            {
                _status.Text = "👀 Aucun œil détecté.\nRepositionne la tablette bien en face.";
                _status.Foreground = new SolidColorBrush(Color.FromRgb(0xFF, 0xC1, 0x07));
                return;
            }

            double cx = 0, cy = 0; int n = 0;
            if (s.HasLeft) { cx += s.LX; cy += s.LY; n++; }
            if (s.HasRight) { cx += s.RX; cy += s.RY; n++; }
            cx /= n; cy /= n;
            bool centered = Math.Abs(cx - 0.5) < 0.20 && Math.Abs(cy - 0.5) < 0.20;

            if (centered)
            {
                _status.Text = "✅ Bien placé !";
                _status.Foreground = new SolidColorBrush(Color.FromRgb(0x7B, 0xE0, 0x6C));
            }
            else
            {
                _status.Text = "Recentre : amène les points au milieu du cadre.";
                _status.Foreground = Brushes.White;
            }
        }

        private void PlaceEye(Ellipse dot, bool valid, double nx, double ny)
        {
            if (!valid) { dot.Visibility = Visibility.Hidden; return; }
            double mx = 1 - Clamp01(nx); // effet miroir (comme une glace)
            double x = BX + mx * BW - dot.Width / 2;
            double y = BY + Clamp01(ny) * BH - dot.Height / 2;
            SetPos(dot, x, y);
            dot.Fill = new SolidColorBrush(Color.FromRgb(0x2E, 0xCC, 0x71));
            dot.Visibility = Visibility.Visible;
        }

        private static double Clamp01(double v) => v < 0 ? 0 : (v > 1 ? 1 : v);
    }
}
