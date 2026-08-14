using System;
using System.Collections.Generic;
using System.Windows;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using MesPremiersJeux.Data;

namespace MesPremiersJeux.Lib
{
    /// <summary>
    /// Remplissage « pot de peinture » (flood fill) sur un tampon BGRA, et
    /// génération des textures (paillettes, arc-en-ciel, motifs). Portage de
    /// src/lib/coloring.js.
    /// </summary>
    public static class ColoringEngine
    {
        public struct Rgb { public byte R, G, B; public Rgb(byte r, byte g, byte b) { R = r; G = g; B = b; } }

        public static Rgb HexToRgb(string hex)
        {
            var h = hex.Replace("#", "");
            if (h.Length == 3) h = "" + h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
            int n = Convert.ToInt32(h, 16);
            return new Rgb((byte)((n >> 16) & 255), (byte)((n >> 8) & 255), (byte)(n & 255));
        }

        // --- Remplissage par diffusion (scanline) sur un tampon BGRA (Pbgra32) ---
        // On ne remplit pas si le pixel de départ est un trait (sombre).
        public static int FloodFill(byte[] data, int w, int h, int sx, int sy, Func<int, int, Rgb> filler, int tol = 62)
        {
            if (sx < 0 || sy < 0 || sx >= w || sy >= h) return 0;
            int si = (sy * w + sx) * 4;
            byte sb = data[si], sg = data[si + 1], sr = data[si + 2];
            if (0.299 * sr + 0.587 * sg + 0.114 * sb < 95) return 0; // trait

            int t2 = tol * tol;
            bool Matches(int i)
            {
                int dr = data[i + 2] - sr, dg = data[i + 1] - sg, db = data[i] - sb;
                return dr * dr + dg * dg + db * db <= t2;
            }

            var seen = new bool[w * h];
            var stack = new Stack<int>();
            stack.Push(sx); stack.Push(sy);
            int filled = 0;

            while (stack.Count > 0)
            {
                int y = stack.Pop();
                int x = stack.Pop();
                int baseIdx = y * w;
                if (seen[baseIdx + x]) continue;

                int l = x;
                while (l > 0 && !seen[baseIdx + l - 1] && Matches((baseIdx + l - 1) * 4)) l--;
                int r = x;
                while (r < w - 1 && !seen[baseIdx + r + 1] && Matches((baseIdx + r + 1) * 4)) r++;

                for (int ix = l; ix <= r; ix++)
                {
                    int p = baseIdx + ix;
                    if (seen[p]) continue;
                    seen[p] = true;
                    var c = filler(ix, y);
                    int pi = p * 4;
                    data[pi] = c.B; data[pi + 1] = c.G; data[pi + 2] = c.R; data[pi + 3] = 255;
                    filled++;
                    if (y > 0) { int up = p - w; if (!seen[up] && Matches(up * 4)) { stack.Push(ix); stack.Push(y - 1); } }
                    if (y < h - 1) { int dn = p + w; if (!seen[dn] && Matches(dn * 4)) { stack.Push(ix); stack.Push(y + 1); } }
                }
            }
            return filled;
        }

        // --- Fonctions de remplissage par pastille ---
        public static Func<int, int, Rgb> MakeFiller(Swatch s)
        {
            if (s.Kind == SwatchKind.Solid)
            {
                var rgb = HexToRgb(s.Color);
                return (x, y) => rgb;
            }
            var tile = GetTile(s);
            int tw = tile.W, th = tile.H;
            var d = tile.Data;
            return (x, y) =>
            {
                int i = (((y % th) + th) % th) * tw * 4 + (((x % tw) + tw) % tw) * 4;
                return new Rgb(d[i + 2], d[i + 1], d[i]);
            };
        }

        // --- Génération / cache des tuiles ---
        private struct Tile { public byte[] Data; public int W, H; }
        private static readonly Dictionary<string, Tile> _tiles = new Dictionary<string, Tile>();

        private static Tile GetTile(Swatch s)
        {
            if (_tiles.TryGetValue(s.Id, out var t)) return t;
            t = BuildTile(s);
            _tiles[s.Id] = t;
            return t;
        }

        private static Tile BuildTile(Swatch s)
        {
            switch (s.Kind)
            {
                case SwatchKind.Rainbow: return Render(160, 24, dc => DrawRainbow(dc, 160, 24));
                case SwatchKind.Glitter: return Render(72, 72, dc => DrawGlitter(dc, s, 72));
                case SwatchKind.Pattern: return Render(48, 48, dc => DrawPattern(dc, s, 48));
                default:
                    var rgb = HexToRgb(s.Color);
                    return new Tile { W = 1, H = 1, Data = new byte[] { rgb.B, rgb.G, rgb.R, 255 } };
            }
        }

        private static Tile Render(int w, int h, Action<DrawingContext> draw)
        {
            var dv = new DrawingVisual();
            using (var dc = dv.RenderOpen()) draw(dc);
            var rtb = new RenderTargetBitmap(w, h, 96, 96, PixelFormats.Pbgra32);
            rtb.Render(dv);
            int stride = w * 4;
            var buf = new byte[stride * h];
            rtb.CopyPixels(buf, stride, 0);
            return new Tile { Data = buf, W = w, H = h };
        }

        // --- Dessins de tuiles ---
        private static void DrawRainbow(DrawingContext dc, int w, int h)
        {
            var stops = new[] { "#FF5252", "#FF9800", "#FFEB3B", "#66BB6A", "#29B6F6", "#7E57C2", "#EC407A" };
            var g = new LinearGradientBrush { StartPoint = new Point(0, 0), EndPoint = new Point(1, 0) };
            for (int i = 0; i < stops.Length; i++)
                g.GradientStops.Add(new GradientStop(Parse(stops[i]), (double)i / (stops.Length - 1)));
            dc.DrawRectangle(g, null, new Rect(0, 0, w, h));
        }

        private static void DrawGlitter(DrawingContext dc, Swatch s, int size)
        {
            dc.DrawRectangle(new SolidColorBrush(Parse(s.Base)), null, new Rect(0, 0, size, size));
            var veil = new LinearGradientBrush { StartPoint = new Point(0, 0), EndPoint = new Point(1, 1) };
            veil.GradientStops.Add(new GradientStop(Color.FromArgb(115, 255, 255, 255), 0));
            veil.GradientStops.Add(new GradientStop(Color.FromArgb(0, 255, 255, 255), 0.5));
            veil.GradientStops.Add(new GradientStop(Color.FromArgb(77, 255, 255, 255), 1));
            dc.DrawRectangle(veil, null, new Rect(0, 0, size, size));

            long seed = s.Id.Length * 997 + 13;
            double Rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / (double)0x7fffffff; }
            var spark = Parse(s.Spark);
            for (int i = 0; i < 90; i++)
            {
                double x = Rnd() * size, y = Rnd() * size, r = 0.6 + Rnd() * 1.8;
                var col = Rnd() > 0.5 ? spark : Colors.White;
                byte a = (byte)((0.4 + Rnd() * 0.6) * 255);
                dc.DrawEllipse(new SolidColorBrush(Color.FromArgb(a, col.R, col.G, col.B)), null, new Point(x, y), r, r);
            }
        }

        private static void DrawPattern(DrawingContext dc, Swatch s, int size)
        {
            dc.DrawRectangle(new SolidColorBrush(Parse(s.Bg)), null, new Rect(0, 0, size, size));
            var fg = new SolidColorBrush(Parse(s.Fg));
            switch (s.Pattern)
            {
                case "dots":
                    foreach (var (x, y) in new[] { (12, 12), (36, 12), (24, 24), (12, 36), (36, 36), (0, 24), (48, 24) })
                        dc.DrawEllipse(fg, null, new Point(x, y), 6, 6);
                    break;
                case "stripes":
                    var pen = new Pen(fg, 8);
                    for (int o = -size; o < size * 2; o += 20)
                        dc.DrawLine(pen, new Point(o, 0), new Point(o + size, size));
                    break;
                case "stars":
                    dc.DrawGeometry(fg, null, Star(12, 12, 9));
                    dc.DrawGeometry(fg, null, Star(36, 36, 9));
                    break;
                case "hearts":
                    dc.DrawGeometry(fg, null, Heart(13, 15, 9));
                    dc.DrawGeometry(fg, null, Heart(37, 39, 9));
                    break;
                case "fur":
                    DrawFur(dc, s, size);
                    break;
                case "scales":
                    DrawScales(dc, s, size);
                    break;
            }
        }

        // Poils : petits traits fins et serrés, dans un ton plus foncé de la couleur.
        private static void DrawFur(DrawingContext dc, Swatch s, int size)
        {
            var fg = Parse(s.Fg);
            long seed = s.Id.Length * 911 + 7;
            double Rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / (double)0x7fffffff; }
            for (int i = 0; i < 150; i++)
            {
                double x = Rnd() * size, y = Rnd() * size;
                double len = 5 + Rnd() * 6;
                double ang = Math.PI / 2 + (Rnd() - 0.5) * 0.7; // vers le bas, légèrement incliné
                var p2 = new Point(x + Math.Cos(ang) * len, y + Math.Sin(ang) * len);
                byte a = (byte)((0.35 + Rnd() * 0.5) * 255);
                var pen = new Pen(new SolidColorBrush(Color.FromArgb(a, fg.R, fg.G, fg.B)), 1.1)
                { StartLineCap = PenLineCap.Round, EndLineCap = PenLineCap.Round };
                dc.DrawLine(pen, new Point(x, y), p2);
            }
        }

        // Écailles : rangées d'arcs qui se chevauchent, façon poisson/dragon.
        private static void DrawScales(DrawingContext dc, Swatch s, int size)
        {
            var pen = new Pen(new SolidColorBrush(Parse(s.Fg)), 1.8)
            { StartLineCap = PenLineCap.Round, EndLineCap = PenLineCap.Round };
            const double w = 16, rowH = 9;
            for (int row = 0; row * rowH < size + rowH; row++)
            {
                double y = row * rowH;
                double off = (row % 2 == 0) ? 0 : w / 2;
                for (double x = -w + off; x < size + w; x += w)
                    dc.DrawGeometry(null, pen, Scallop(x, y, w, rowH + 3));
            }
        }

        private static Geometry Scallop(double x, double y, double w, double h)
        {
            var g = new StreamGeometry();
            using (var c = g.Open())
            {
                c.BeginFigure(new Point(x, y), false, false);
                c.ArcTo(new Point(x + w, y), new Size(w / 2, h), 0, false, SweepDirection.Clockwise, true, false);
            }
            g.Freeze();
            return g;
        }

        private static Geometry Star(double cx, double cy, double r)
        {
            var g = new StreamGeometry();
            using (var c = g.Open())
            {
                for (int i = 0; i < 10; i++)
                {
                    double ang = Math.PI / 5 * i - Math.PI / 2;
                    double rr = i % 2 == 0 ? r : r * 0.45;
                    var p = new Point(cx + Math.Cos(ang) * rr, cy + Math.Sin(ang) * rr);
                    if (i == 0) c.BeginFigure(p, true, true);
                    else c.LineTo(p, true, false);
                }
            }
            g.Freeze();
            return g;
        }

        private static Geometry Heart(double cx, double cy, double s)
        {
            var g = new StreamGeometry();
            using (var c = g.Open())
            {
                c.BeginFigure(new Point(cx, cy + s * 0.3), true, true);
                c.BezierTo(new Point(cx + s, cy - s * 0.5), new Point(cx + s * 0.5, cy - s), new Point(cx, cy - s * 0.35), true, false);
                c.BezierTo(new Point(cx - s * 0.5, cy - s), new Point(cx - s, cy - s * 0.5), new Point(cx, cy + s * 0.3), true, false);
            }
            g.Freeze();
            return g;
        }

        private static Color Parse(string hex)
        {
            var c = HexToRgb(hex);
            return Color.FromRgb(c.R, c.G, c.B);
        }

        // --- Pinceau d'aperçu pour la pastille de palette ---
        public static Brush PreviewBrush(Swatch s)
        {
            if (s.Kind == SwatchKind.Solid)
                return new SolidColorBrush(Parse(s.Color));
            var tile = GetTile(s);
            var bmp = BitmapSource.Create(tile.W, tile.H, 96, 96, PixelFormats.Pbgra32, null, tile.Data, tile.W * 4);
            if (s.Kind == SwatchKind.Rainbow)
                return new ImageBrush(bmp) { Stretch = Stretch.Fill };
            return new ImageBrush(bmp)
            {
                TileMode = TileMode.Tile,
                Viewport = new Rect(0, 0, tile.W, tile.H),
                ViewportUnits = BrushMappingMode.Absolute,
                Stretch = Stretch.None,
            };
        }
    }
}
