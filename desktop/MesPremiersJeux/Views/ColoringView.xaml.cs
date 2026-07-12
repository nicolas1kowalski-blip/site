using System;
using System.Collections.Generic;
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

        // Une page à colorier : dessin intégré OU image au trait ajoutée par le parent.
        private sealed class PageEntry
        {
            public string Name;
            public Coloring BuiltIn;   // dessin vectoriel intégré
            public string ImagePath;   // image personnalisée (Documents\MesPremiersJeux\Coloriages)
        }

        private readonly List<PageEntry> _pages = new List<PageEntry>();

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
            UserContent.EnsureFolders();

            foreach (var c in Colorings.All)
                _pages.Add(new PageEntry { Name = c.Name, BuiltIn = c });
            foreach (var u in UserContent.LoadColorings())
                _pages.Add(new PageEntry { Name = u.Name, ImagePath = u.Path });

            BuildPalette();
            BuildTools();
            Loaded += (s, e) => DrawPage();
        }

        // Palette réduite : moins de couleurs mais grandes = plus simple à viser au regard.
        private static readonly string[] SimpleIds =
            { "rouge", "orange", "jaune", "vert", "bleu", "violet", "rose", "noir", "g-arc", "m-etoiles" };

        // --- Construction de l'interface ---
        private void BuildPalette()
        {
            bool first = true;
            foreach (var id in SimpleIds)
            {
                var swatch = Palette.All.Find(s => s.Id == id);
                if (swatch == null) continue;
                var btn = new Button
                {
                    Style = (Style)Application.Current.Resources["SwatchButton"],
                    Background = ColoringEngine.PreviewBrush(swatch),
                    Tag = swatch,
                    ToolTip = swatch.Name,
                };
                btn.Click += (s, e) => SelectSwatch(swatch, btn);
                PaletteHost.Children.Add(btn);
                if (first) { btn.BorderThickness = new Thickness(4); _spec = swatch; first = false; }
            }
        }

        private void BuildTools()
        {
            ToolsHost.Children.Clear();

            for (int i = 0; i < _pages.Count; i++)
            {
                int idx = i;
                var page = _pages[i];
                var btn = new Button
                {
                    Style = (Style)Application.Current.Resources["PageButton"],
                    Content = new Image { Source = RenderDrawing(page, 108), Width = 108, Height = 108 },
                    ToolTip = "Colorier " + page.Name,
                };
                btn.Click += (s, e) => { _pageIdx = idx; DrawPage(); HighlightPage(btn); };
                ToolsHost.Children.Add(btn);
                if (i == _pageIdx) btn.BorderThickness = new Thickness(4);
            }

            var add = new Button { Style = (Style)Application.Current.Resources["ToolButton"], Content = "➕", ToolTip = "Ajouter des coloriages" };
            add.Click += (s, e) => AddColorings();
            ToolsHost.Children.Add(add);

            var reset = new Button { Style = (Style)Application.Current.Resources["ToolButton"], Content = "🔄", ToolTip = "Recommencer" };
            reset.Click += (s, e) => DrawPage();
            ToolsHost.Children.Add(reset);

            var full = new Button { Style = (Style)Application.Current.Resources["ToolButton"], Content = "⛶", ToolTip = "Plein écran" };
            full.Click += (s, e) => ToggleFullscreenRequested?.Invoke(this, EventArgs.Empty);
            ToolsHost.Children.Add(full);
        }

        // Choisir des images au trait (PNG/JPG) : elles sont copiées dans
        // Documents\MesPremiersJeux\Coloriages et apparaissent immédiatement.
        private void AddColorings()
        {
            var dlg = new Microsoft.Win32.OpenFileDialog
            {
                Title = "Ajouter des coloriages (dessins au trait)",
                Filter = "Images|*.png;*.jpg;*.jpeg;*.bmp;*.gif",
                Multiselect = true,
            };
            if (dlg.ShowDialog(Window.GetWindow(this)) != true) return;

            var added = UserContent.AddColorings(dlg.FileNames);
            if (added.Count == 0) return;

            _pages.Clear();
            foreach (var c in Colorings.All)
                _pages.Add(new PageEntry { Name = c.Name, BuiltIn = c });
            foreach (var u in UserContent.LoadColorings())
                _pages.Add(new PageEntry { Name = u.Name, ImagePath = u.Path });

            _pageIdx = _pages.Count - 1; // ouvre le dernier ajouté
            BuildTools();
            DrawPage();
            Speech.Say("Le coloriage est ajouté !");
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

        // --- Rendu du dessin (intégré ou image personnalisée) ---
        private static RenderTargetBitmap RenderDrawing(PageEntry page, int size)
        {
            var dv = new DrawingVisual();
            using (var dc = dv.RenderOpen())
            {
                dc.DrawRectangle(Brushes.White, null, new Rect(0, 0, size, size));
                if (page.BuiltIn != null)
                {
                    double scale = size / 100.0;
                    dc.PushTransform(new ScaleTransform(scale, scale));
                    page.BuiltIn.Draw(dc);
                    dc.Pop();
                }
                else if (page.ImagePath != null)
                {
                    try
                    {
                        var img = UserContent.LoadBitmap(page.ImagePath);
                        // Ajustement uniforme, centré, avec une petite marge blanche.
                        double m = size * 0.03;
                        double avail = size - 2 * m;
                        double k = Math.Min(avail / img.PixelWidth, avail / img.PixelHeight);
                        double w = img.PixelWidth * k, h = img.PixelHeight * k;
                        dc.DrawImage(img, new Rect((size - w) / 2, (size - h) / 2, w, h));
                    }
                    catch { /* image illisible : page blanche */ }
                }
            }
            var rtb = new RenderTargetBitmap(size, size, 96, 96, PixelFormats.Pbgra32);
            rtb.Render(dv);
            return rtb;
        }

        private void DrawPage()
        {
            var rtb = RenderDrawing(_pages[_pageIdx], Size);
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
        public double ReArmDistance => 30.0;

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
