using System;
using System.Collections.Generic;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using MesPremiersJeux.Data;
using MesPremiersJeux.Gaze;
using MesPremiersJeux.Lib;

namespace MesPremiersJeux.Views
{
    /// <summary>
    /// Activité « coloriage » façon bibliothèque : une galerie de dessins (comme les
    /// livres) ; on en choisit un, il s'ouvre en grand avec une palette complète en
    /// bas. Remplissage au regard (dwell → vrai clic) ou à la souris.
    /// </summary>
    public partial class ColoringView : UserControl, IGazeSurface
    {
        private const int Size = 800;

        private static readonly Brush Dark = new SolidColorBrush(Color.FromRgb(0x3B, 0x2A, 0x5A));

        // Une page à colorier : dessin intégré OU image au trait ajoutée par le parent.
        private sealed class PageEntry
        {
            public string Name;
            public Coloring BuiltIn;   // dessin vectoriel intégré
            public string ImagePath;   // image personnalisée (Contenu\Coloriages)
        }

        private readonly List<PageEntry> _pages = new List<PageEntry>();

        private WriteableBitmap _bmp;
        private byte[] _pixels;
        private Swatch _spec = Palette.All[0];
        private int _pageIdx = -1;   // -1 = galerie (aucun dessin ouvert)
        private double _lastFillX = -999, _lastFillY = -999;

        /// <summary>Demande de bascule plein écran, gérée par la fenêtre principale.</summary>
        public event EventHandler ToggleFullscreenRequested;

        public ColoringView()
        {
            InitializeComponent();
            UserContent.EnsureFolders();

            LoadPages();
            BuildPalette();
            BuildGallery();

            // Les outils parent (➕ / 🗑) suivent le mode admin.
            AdminMode.Changed += () => Dispatcher.Invoke(() => { BuildGallery(); if (_pageIdx >= 0) BuildColorTools(); });
            // Après un import de contenu, les coloriages se rechargent.
            UserContent.ContentChanged += () => Dispatcher.Invoke(ReloadPages);
        }

        private void LoadPages()
        {
            _pages.Clear();
            foreach (var c in Colorings.All)
                _pages.Add(new PageEntry { Name = c.Name, BuiltIn = c });
            foreach (var u in UserContent.LoadColorings())
                _pages.Add(new PageEntry { Name = u.Name, ImagePath = u.Path });
        }

        // ------------------------------------------------------------------ galerie
        private void BuildGallery()
        {
            Gallery.Children.Clear();
            for (int i = 0; i < _pages.Count; i++)
            {
                int idx = i;
                var page = _pages[i];

                var content = new StackPanel { HorizontalAlignment = HorizontalAlignment.Center };
                content.Children.Add(new Image { Source = RenderDrawing(page, 300), Width = 150, Height = 150 });
                content.Children.Add(new TextBlock
                {
                    Text = page.Name,
                    FontSize = 22,
                    FontWeight = FontWeights.Bold,
                    Foreground = Dark,
                    TextWrapping = TextWrapping.Wrap,
                    TextAlignment = TextAlignment.Center,
                    MaxWidth = 220,
                    HorizontalAlignment = HorizontalAlignment.Center,
                    Margin = new Thickness(0, 8, 0, 0),
                });

                var tile = new Button { Style = (Style)Application.Current.Resources["MenuTile"], Content = content };
                tile.Click += (s, e) => OpenColoring(idx);
                Gallery.Children.Add(tile);
            }

            // Tuile « ajouter des dessins » (mode admin uniquement).
            if (AdminMode.IsActive)
            {
                var add = new StackPanel { HorizontalAlignment = HorizontalAlignment.Center };
                add.Children.Add(new TextBlock { Text = "➕", FontSize = 74, HorizontalAlignment = HorizontalAlignment.Center });
                add.Children.Add(new TextBlock
                {
                    Text = "Ajouter des dessins",
                    FontSize = 20,
                    FontWeight = FontWeights.Bold,
                    Foreground = Dark,
                    HorizontalAlignment = HorizontalAlignment.Center,
                    Margin = new Thickness(0, 8, 0, 0),
                });
                var addTile = new Button { Style = (Style)Application.Current.Resources["MenuTile"], Content = add };
                addTile.Click += (s, e) => AddColorings();
                Gallery.Children.Add(addTile);
            }
        }

        private void OpenColoring(int idx)
        {
            if (idx < 0 || idx >= _pages.Count) return;
            _pageIdx = idx;
            DrawPage();
            BuildColorTools();
            MenuRoot.Visibility = Visibility.Collapsed;
            ColorRoot.Visibility = Visibility.Visible;
            Chrome.Immersive = true; // plein écran pour colorier
        }

        private void Back_Click(object sender, RoutedEventArgs e)
        {
            _pageIdx = -1;
            ColorRoot.Visibility = Visibility.Collapsed;
            MenuRoot.Visibility = Visibility.Visible;
            Chrome.Immersive = false;
            BuildGallery();
        }

        // ------------------------------------------------------------------ outils (écran de coloriage)
        private void BuildColorTools()
        {
            TopTools.Children.Clear();

            var reset = ToolButton("🔄", "Recommencer");
            reset.Click += (s, e) => DrawPage();
            TopTools.Children.Add(reset);

            var full = ToolButton("⛶", "Plein écran");
            full.Click += (s, e) => ToggleFullscreenRequested?.Invoke(this, EventArgs.Empty);
            TopTools.Children.Add(full);

            // Supprimer ce coloriage (personnalisé, mode admin).
            if (AdminMode.IsActive && _pageIdx >= 0 && _pages[_pageIdx].ImagePath != null)
            {
                var del = ToolButton("🗑", "Supprimer ce coloriage");
                del.Click += (s, e) => DeleteCurrentColoring();
                TopTools.Children.Add(del);
            }
        }

        private static Button ToolButton(string glyph, string tip) => new Button
        {
            Style = (Style)Application.Current.Resources["BackButton"],
            Content = glyph,
            FontSize = 30,
            MinWidth = 90,
            Margin = new Thickness(10, 0, 0, 0),
            ToolTip = tip,
        };

        // ------------------------------------------------------------------ palette (complète)
        private void BuildPalette()
        {
            bool first = true;
            foreach (var swatch in Palette.All)
            {
                var btn = new Button
                {
                    Style = (Style)Application.Current.Resources["SwatchButton"],
                    Width = 120,
                    Height = 120,
                    Background = ColoringEngine.PreviewBrush(swatch),
                    BorderBrush = new SolidColorBrush(Color.FromRgb(0xB8, 0xB0, 0xC8)),
                    BorderThickness = new Thickness(1.5),
                    Tag = swatch,
                    ToolTip = swatch.Name,
                };
                btn.Click += (s, e) => SelectSwatch(swatch, btn);
                PaletteHost.Children.Add(btn);
                if (first) { btn.BorderBrush = Dark; btn.BorderThickness = new Thickness(4); _spec = swatch; first = false; }
            }
        }

        private void SelectSwatch(Swatch s, Button btn)
        {
            _spec = s;
            var idle = new SolidColorBrush(Color.FromRgb(0xB8, 0xB0, 0xC8));
            foreach (var child in PaletteHost.Children)
                if (child is Button b)
                {
                    bool sel = ReferenceEquals(b, btn);
                    b.BorderBrush = sel ? Dark : idle;
                    b.BorderThickness = new Thickness(sel ? 4 : 1.5);
                }
            Speech.Say(s.Name);
        }

        // ------------------------------------------------------------------ ajout / suppression (parent)
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

            LoadPages();
            BuildGallery();
            Speech.Say("Le coloriage est ajouté !");
        }

        private void DeleteCurrentColoring()
        {
            if (_pageIdx < 0) return;
            var page = _pages[_pageIdx];
            if (page.ImagePath == null) return;

            GazeGate.Push();
            var res = MessageBox.Show(Window.GetWindow(this),
                $"Supprimer le coloriage « {page.Name} » ?", "Coloriage",
                MessageBoxButton.YesNo, MessageBoxImage.Warning);
            GazeGate.Pop();
            if (res != MessageBoxResult.Yes) return;

            UserContent.DeleteColoring(page.ImagePath);
            LoadPages();
            Back_Click(this, null); // retour à la galerie
        }

        private void ReloadPages()
        {
            LoadPages();
            if (_pageIdx >= _pages.Count) { Back_Click(this, null); return; }
            BuildGallery();
            if (_pageIdx >= 0) { DrawPage(); BuildColorTools(); }
        }

        // ------------------------------------------------------------------ rendu / remplissage
        // Rend le dessin en le RECADRANT sur son contenu (le tracé), pour qu'il
        // remplisse le carré sans marge blanche autour. On rend d'abord en double
        // résolution, on cherche la boîte englobante des pixels non blancs, puis on
        // la ré-étale pour occuper toute la surface.
        private static RenderTargetBitmap RenderDrawing(PageEntry page, int size)
        {
            int hi = size * 2;
            var raw = RenderRaw(page, hi);
            var rect = ContentBounds(raw, hi);

            var dv = new DrawingVisual();
            using (var dc = dv.RenderOpen())
            {
                dc.DrawRectangle(Brushes.White, null, new Rect(0, 0, size, size));
                if (rect.Width > 1 && rect.Height > 1)
                {
                    double pad = size * 0.015;
                    double avail = size - 2 * pad;
                    double k = Math.Min(avail / rect.Width, avail / rect.Height);
                    double w = rect.Width * k, h = rect.Height * k;
                    double ox = (size - w) / 2 - rect.X * k;
                    double oy = (size - h) / 2 - rect.Y * k;
                    dc.PushTransform(new TranslateTransform(ox, oy));
                    dc.PushTransform(new ScaleTransform(k, k));
                    dc.DrawImage(raw, new Rect(0, 0, hi, hi));
                    dc.Pop(); dc.Pop();
                }
                else
                {
                    dc.DrawImage(raw, new Rect(0, 0, size, size)); // dessin vide : tel quel
                }
            }
            var rtb = new RenderTargetBitmap(size, size, 96, 96, PixelFormats.Pbgra32);
            rtb.Render(dv);
            return rtb;
        }

        // Rendu « brut » du dessin (fond blanc + tracé / image), sans recadrage.
        private static RenderTargetBitmap RenderRaw(PageEntry page, int size)
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
                        double k = Math.Min((double)size / img.PixelWidth, (double)size / img.PixelHeight);
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

        // Boîte englobante des pixels « non blancs » (le tracé du dessin).
        private static Rect ContentBounds(RenderTargetBitmap bmp, int size)
        {
            var px = new byte[size * size * 4];
            bmp.CopyPixels(px, size * 4, 0);
            int minX = size, minY = size, maxX = -1, maxY = -1;
            for (int y = 0; y < size; y++)
            {
                int row = y * size * 4;
                for (int x = 0; x < size; x++)
                {
                    int i = row + x * 4;                 // Pbgra32 : B, G, R, A
                    bool bg = px[i + 3] < 8 || (px[i] > 244 && px[i + 1] > 244 && px[i + 2] > 244);
                    if (bg) continue;
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                }
            }
            if (maxX < 0) return Rect.Empty;
            return new Rect(minX, minY, maxX - minX + 1, maxY - minY + 1);
        }

        private void DrawPage()
        {
            if (_pageIdx < 0 || _pageIdx >= _pages.Count) return;
            var rtb = RenderDrawing(_pages[_pageIdx], Size);
            _pixels = new byte[Size * Size * 4];
            rtb.CopyPixels(_pixels, Size * 4, 0);
            _bmp = new WriteableBitmap(Size, Size, 96, 96, PixelFormats.Pbgra32, null);
            _bmp.WritePixels(new Int32Rect(0, 0, Size, Size), _pixels, Size * 4, 0);
            Img.Source = _bmp;
            _lastFillX = _lastFillY = -999;
        }

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

        // ------------------------------------------------------------------ IGazeSurface (dwell)
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
            if (Math.Abs(p.X - _lastFillX) < 4 && Math.Abs(p.Y - _lastFillY) < 4) return;
            _lastFillX = p.X; _lastFillY = p.Y;
            FillAtImagePoint(p);
        }
    }
}
