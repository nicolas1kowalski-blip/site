using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using MesPremiersJeux.Data;
using MesPremiersJeux.Gaze;
using MesPremiersJeux.Lib;

namespace MesPremiersJeux.Views
{
    /// <summary>
    /// Activité « coloriage » : palette variée (couleurs simples, à paillettes,
    /// à motifs), grand dessin au centre rempli au regard (dwell) ou à la souris.
    /// Portage de src/components/screens/ColoringScreen.jsx.
    /// </summary>
    public partial class ColoringView : UserControl, IGazeSurface
    {
        private const int Size = 800;

        private WriteableBitmap _bmp;
        private byte[] _pixels;
        private Swatch _spec = Palette.All[0];
        private int _pageIdx = 0;
        private double _lastFillX = -999, _lastFillY = -999;

        /// <summary>Demande de bascule plein écran, gérée par la fenêtre principale.</summary>
        public event EventHandler ToggleFullscreenRequested;

        public ColoringView()
        {
            InitializeComponent();
            BuildPalette();
            BuildTools();
            Loaded += (s, e) => DrawPage();
        }

        // --- Construction de l'interface ---
        private void BuildPalette()
        {
            for (int i = 0; i < Palette.All.Count; i++)
            {
                var swatch = Palette.All[i];
                var btn = new Button
                {
                    Style = (Style)Application.Current.Resources["SwatchButton"],
                    Background = ColoringEngine.PreviewBrush(swatch),
                    Tag = swatch,
                    ToolTip = swatch.Name,
                };
                btn.Click += (s, e) => SelectSwatch(swatch, btn);
                PaletteHost.Children.Add(btn);
                if (i == 0) btn.BorderThickness = new Thickness(4);
            }
        }

        private void BuildTools()
        {
            for (int i = 0; i < Colorings.All.Count; i++)
            {
                int idx = i;
                var page = Colorings.All[i];
                var btn = new Button
                {
                    Style = (Style)Application.Current.Resources["PageButton"],
                    Content = new Image { Source = RenderDrawing(page, 108), Width = 108, Height = 108 },
                    ToolTip = "Colorier " + page.Name,
                };
                btn.Click += (s, e) => { _pageIdx = idx; DrawPage(); HighlightPage(btn); };
                ToolsHost.Children.Add(btn);
                if (i == 0) btn.BorderThickness = new Thickness(4);
            }

            var reset = new Button { Style = (Style)Application.Current.Resources["ToolButton"], Content = "🔄", ToolTip = "Recommencer" };
            reset.Click += (s, e) => DrawPage();
            ToolsHost.Children.Add(reset);

            var full = new Button { Style = (Style)Application.Current.Resources["ToolButton"], Content = "⛶", ToolTip = "Plein écran" };
            full.Click += (s, e) => ToggleFullscreenRequested?.Invoke(this, EventArgs.Empty);
            ToolsHost.Children.Add(full);
        }

        private void SelectSwatch(Swatch s, Button btn)
        {
            _spec = s;
            foreach (var child in PaletteHost.Children)
                if (child is Button b) b.BorderThickness = new Thickness(ReferenceEquals(b, btn) ? 4 : 0);
            Speech.Say(s.Name);
        }

        private void HighlightPage(Button btn)
        {
            foreach (var child in ToolsHost.Children)
                if (child is Button b && b.Content is Image) b.BorderThickness = new Thickness(ReferenceEquals(b, btn) ? 4 : 0);
        }

        // --- Rendu du dessin ---
        private static RenderTargetBitmap RenderDrawing(Coloring page, int size)
        {
            var dv = new DrawingVisual();
            using (var dc = dv.RenderOpen())
            {
                dc.DrawRectangle(Brushes.White, null, new Rect(0, 0, size, size));
                double scale = size / 100.0;
                dc.PushTransform(new ScaleTransform(scale, scale));
                page.Draw(dc);
                dc.Pop();
            }
            var rtb = new RenderTargetBitmap(size, size, 96, 96, PixelFormats.Pbgra32);
            rtb.Render(dv);
            return rtb;
        }

        private void DrawPage()
        {
            var rtb = RenderDrawing(Colorings.All[_pageIdx], Size);
            _pixels = new byte[Size * Size * 4];
            rtb.CopyPixels(_pixels, Size * 4, 0);
            _bmp = new WriteableBitmap(Size, Size, 96, 96, PixelFormats.Pbgra32, null);
            _bmp.WritePixels(new Int32Rect(0, 0, Size, Size), _pixels, Size * 4, 0);
            Img.Source = _bmp;
            _lastFillX = _lastFillY = -999;
        }

        // --- Remplissage ---
        private void FillAtImagePoint(Point p)
        {
            if (_pixels == null) return;
            int px = (int)Math.Round(p.X);
            int py = (int)Math.Round(p.Y);
            int n = ColoringEngine.FloodFill(_pixels, Size, Size, px, py, ColoringEngine.MakeFiller(_spec));
            if (n > 0)
            {
                _bmp.WritePixels(new Int32Rect(0, 0, Size, Size), _pixels, Size * 4, 0);
                Speech.Pop();
            }
        }

        private void Img_MouseLeftButtonDown(object sender, System.Windows.Input.MouseButtonEventArgs e)
        {
            FillAtImagePoint(e.GetPosition(Img));
        }

        // --- IGazeSurface (dwell) ---
        public double ReArmDistance => 18.0;

        private bool TryMap(Point screenPoint, out Point imgPoint)
        {
            imgPoint = default;
            if (_pixels == null || Img.ActualWidth <= 0) return false;
            try { imgPoint = Img.PointFromScreen(screenPoint); }
            catch { return false; }
            return imgPoint.X >= 0 && imgPoint.Y >= 0 && imgPoint.X < Size && imgPoint.Y < Size;
        }

        public bool HitTestGaze(Point screenPoint) => TryMap(screenPoint, out _);

        public void CommitGaze(Point screenPoint)
        {
            if (!TryMap(screenPoint, out var p)) return;
            // Évite de re-remplir exactement au même endroit d'un dwell à l'autre.
            if (Math.Abs(p.X - _lastFillX) < 4 && Math.Abs(p.Y - _lastFillY) < 4) return;
            _lastFillX = p.X; _lastFillY = p.Y;
            FillAtImagePoint(p);
        }
    }
}
