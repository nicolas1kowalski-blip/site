using System;
using System.IO;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Shapes;
using MesPremiersJeux.Lib;

namespace MesPremiersJeux.Views
{
    /// <summary>
    /// Rogner une image : on dessine un rectangle à la souris sur la photo, et
    /// « Valider » enregistre la partie choisie dans un nouveau fichier (temporaire),
    /// dont le chemin est renvoyé via <see cref="ResultPath"/>.
    /// </summary>
    public sealed class ImageCropWindow : Window
    {
        public string ResultPath { get; private set; }

        private readonly BitmapSource _bmp;
        private readonly Canvas _overlay;
        private readonly double _imgW, _imgH;

        private Point _dragStart;
        private Rectangle _cropRect;

        public ImageCropWindow(string imagePath)
        {
            Gaze.GazeGate.Push();
            Closed += (s, e) => Gaze.GazeGate.Pop();

            Title = "Rogner l'image";
            Width = 1000;
            Height = 720;
            WindowStartupLocation = WindowStartupLocation.CenterOwner;
            Background = new SolidColorBrush(Color.FromRgb(0xFB, 0xF3, 0xFF));

            _bmp = UserContent.LoadBitmap(imagePath, 2400); // bonne résolution pour un rognage net
            double k = Math.Min(820.0 / _bmp.PixelWidth, 560.0 / _bmp.PixelHeight);
            _imgW = _bmp.PixelWidth * k;
            _imgH = _bmp.PixelHeight * k;

            var root = new DockPanel { Margin = new Thickness(14) };

            root.Children.Add(WithDock(new TextBlock
            {
                Text = "Dessine un rectangle sur la photo (cliquer-glisser) pour choisir la partie à garder.",
                FontSize = 15,
                Margin = new Thickness(0, 0, 0, 10),
            }, Dock.Top));

            var buttons = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                HorizontalAlignment = HorizontalAlignment.Right,
                Margin = new Thickness(0, 10, 0, 0),
            };
            var reset = new Button { Content = "↺ Recommencer", FontSize = 16, Padding = new Thickness(14, 9, 14, 9), Margin = new Thickness(0, 0, 8, 0) };
            reset.Click += (s, e) => ClearRect();
            var ok = new Button { Content = "✂ Rogner", FontSize = 16, Padding = new Thickness(16, 9, 16, 9) };
            ok.Click += Crop;
            var cancel = new Button { Content = "Annuler", FontSize = 16, Padding = new Thickness(16, 9, 16, 9), Margin = new Thickness(8, 0, 0, 0) };
            cancel.Click += (s, e) => DialogResult = false;
            buttons.Children.Add(reset);
            buttons.Children.Add(ok);
            buttons.Children.Add(cancel);
            root.Children.Add(WithDock(buttons, Dock.Bottom));

            var host = new Grid { Width = _imgW, Height = _imgH, HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center };
            host.Children.Add(new Image { Source = _bmp, Stretch = Stretch.Fill, Width = _imgW, Height = _imgH });
            _overlay = new Canvas { Background = Brushes.Transparent, Width = _imgW, Height = _imgH };
            _overlay.MouseLeftButtonDown += StartDrag;
            _overlay.MouseMove += Drag;
            _overlay.MouseLeftButtonUp += EndDrag;
            host.Children.Add(_overlay);
            root.Children.Add(new Border { Child = host, Background = Brushes.White, BorderBrush = Brushes.LightGray, BorderThickness = new Thickness(1) });

            Content = root;
        }

        private static FrameworkElement WithDock(FrameworkElement el, Dock side) { DockPanel.SetDock(el, side); return el; }

        private void ClearRect()
        {
            if (_cropRect != null) { _overlay.Children.Remove(_cropRect); _cropRect = null; }
        }

        private void StartDrag(object sender, MouseButtonEventArgs e)
        {
            ClearRect();
            _dragStart = e.GetPosition(_overlay);
            _cropRect = new Rectangle
            {
                Stroke = new SolidColorBrush(Color.FromRgb(0x7E, 0x3F, 0xF2)),
                StrokeThickness = 3,
                Fill = new SolidColorBrush(Color.FromArgb(0x33, 0x7E, 0x3F, 0xF2)),
            };
            Canvas.SetLeft(_cropRect, _dragStart.X);
            Canvas.SetTop(_cropRect, _dragStart.Y);
            _overlay.Children.Add(_cropRect);
            _overlay.CaptureMouse();
        }

        private void Drag(object sender, MouseEventArgs e)
        {
            if (_cropRect == null || !_overlay.IsMouseCaptured) return;
            var p = e.GetPosition(_overlay);
            Canvas.SetLeft(_cropRect, Math.Min(p.X, _dragStart.X));
            Canvas.SetTop(_cropRect, Math.Min(p.Y, _dragStart.Y));
            _cropRect.Width = Math.Abs(p.X - _dragStart.X);
            _cropRect.Height = Math.Abs(p.Y - _dragStart.Y);
        }

        private void EndDrag(object sender, MouseButtonEventArgs e) => _overlay.ReleaseMouseCapture();

        private void Crop(object sender, RoutedEventArgs e)
        {
            if (_cropRect == null || _cropRect.Width < 10 || _cropRect.Height < 10)
            {
                MessageBox.Show(this, "Dessine d'abord un rectangle sur la photo.", "Rogner");
                return;
            }
            try
            {
                int PW = _bmp.PixelWidth, PH = _bmp.PixelHeight;
                int x = (int)(Canvas.GetLeft(_cropRect) / _imgW * PW);
                int y = (int)(Canvas.GetTop(_cropRect) / _imgH * PH);
                int w = (int)(_cropRect.Width / _imgW * PW);
                int h = (int)(_cropRect.Height / _imgH * PH);
                x = Math.Max(0, Math.Min(x, PW - 1));
                y = Math.Max(0, Math.Min(y, PH - 1));
                w = Math.Max(1, Math.Min(w, PW - x));
                h = Math.Max(1, Math.Min(h, PH - y));

                var crop = new CroppedBitmap(_bmp, new Int32Rect(x, y, w, h));
                var enc = new PngBitmapEncoder();
                enc.Frames.Add(BitmapFrame.Create(crop));
                var path = Path.Combine(Path.GetTempPath(), "mpj-crop-" + Guid.NewGuid().ToString("N") + ".png");
                using (var fs = File.Create(path)) enc.Save(fs);

                ResultPath = path;
                DialogResult = true;
            }
            catch (Exception ex)
            {
                MessageBox.Show(this, "Impossible de rogner l'image :\n" + ex.Message, "Rogner");
            }
        }
    }
}
