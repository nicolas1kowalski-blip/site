using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Shapes;

namespace MesPremiersJeux.Games
{
    /// <summary>
    /// Petites fabriques de formes partagées par les dessins vectoriels de
    /// l'application (oiseaux, visages, surprises…) : ellipses, rectangles
    /// arrondis, triangles, rotation, pose sur un Canvas.
    /// </summary>
    internal static class VecKit
    {
        public static Color C(byte r, byte g, byte b) => Color.FromRgb(r, g, b);

        public static Color Shade(Color c, double f) =>
            Color.FromRgb((byte)(c.R * f), (byte)(c.G * f), (byte)(c.B * f));

        public static Ellipse El(Color color, double w, double h) =>
            new Ellipse { Width = w, Height = h, Fill = new SolidColorBrush(color) };

        public static Rectangle Rect(Color color, double w, double h, double radius = 4) =>
            new Rectangle { Width = w, Height = h, RadiusX = radius, RadiusY = radius, Fill = new SolidColorBrush(color) };

        /// <summary>Triangle pointe en BAS (bec, fanion…).</summary>
        public static Polygon TriDown(Color color, double w, double h) => new Polygon
        {
            Points = new PointCollection { new Point(0, 0), new Point(w, 0), new Point(w / 2, h) },
            Fill = new SolidColorBrush(color),
        };

        /// <summary>Triangle pointe en HAUT (toit, pique de dinosaure…).</summary>
        public static Polygon TriUp(Color color, double w, double h) => new Polygon
        {
            Points = new PointCollection { new Point(0, h), new Point(w, h), new Point(w / 2, 0) },
            Fill = new SolidColorBrush(color),
        };

        public static Polygon Poly(Color color, params Point[] pts)
        {
            var p = new Polygon { Fill = new SolidColorBrush(color) };
            foreach (var pt in pts) p.Points.Add(pt);
            return p;
        }

        public static FrameworkElement Rot(FrameworkElement el, double angle)
        {
            el.RenderTransformOrigin = new Point(0.5, 0.5);
            el.RenderTransform = new RotateTransform(angle);
            return el;
        }

        public static void Add(Canvas c, FrameworkElement el, double x, double y)
        {
            Canvas.SetLeft(el, x);
            Canvas.SetTop(el, y);
            c.Children.Add(el);
        }

        /// <summary>Œil cartoon : blanc + pupille + reflet.</summary>
        public static void Eye(Canvas c, double x, double y, double size = 26)
        {
            Add(c, El(Colors.White, size, size), x, y);
            Add(c, El(C(0x2A, 0x22, 0x30), size * 0.5, size * 0.5), x + size * 0.27, y + size * 0.27);
            Add(c, El(Colors.White, size * 0.19, size * 0.19), x + size * 0.54, y + size * 0.35);
        }

        /// <summary>Œil « touché » : croix ✕ (après la tarte !).</summary>
        public static void CrossEye(Canvas c, double x, double y, double size = 26)
        {
            var col = C(0x2A, 0x22, 0x30);
            Add(c, Rot(Rect(col, size, 6, 3), 45), x, y + size / 2 - 3);
            Add(c, Rot(Rect(col, size, 6, 3), -45), x, y + size / 2 - 3);
        }

        public static Viewbox Box(Canvas c, double size) =>
            new Viewbox { Width = size, Height = size, Stretch = Stretch.Uniform, Child = c };
    }
}
