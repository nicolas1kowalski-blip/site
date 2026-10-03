using System;
using System.Collections.Generic;
using System.Windows;
using System.Windows.Media;

namespace MesPremiersJeux.Data
{
    /// <summary>
    /// Un dessin au trait à colorier : régions blanches délimitées par des traits
    /// noirs. Dessiné dans un espace 0..100 (comme le viewBox SVG de la version web),
    /// mis à l'échelle par l'appelant vers la taille du bitmap.
    /// </summary>
    public sealed class Coloring
    {
        public string Id;
        public string Name;
        public Action<DrawingContext> Draw;
    }

    public static class Colorings
    {
        private static readonly Brush White = Brushes.White;

        // Région à colorier : fond blanc + contour noir.
        private static void Region(DrawingContext dc, Geometry g, double w)
            => dc.DrawGeometry(White, new Pen(Brushes.Black, w), g);

        // Trait simple (tige, antenne…) : contour noir sans remplissage.
        private static void Line(DrawingContext dc, Geometry g, double w)
            => dc.DrawGeometry(null, new Pen(Brushes.Black, w), g);

        private static Geometry Path(string data) => Geometry.Parse(data);

        private static Geometry Ellipse(double cx, double cy, double rx, double ry, double rot = 0)
        {
            var g = new EllipseGeometry(new Point(cx, cy), rx, ry);
            if (rot != 0) g.Transform = new RotateTransform(rot, cx, cy);
            return g;
        }

        public static readonly List<Coloring> All = new List<Coloring>
        {
            new Coloring
            {
                Id = "fleur", Name = "la fleur",
                Draw = dc =>
                {
                    Line(dc, Path("M50 60 L50 93"), 3);
                    Region(dc, Ellipse(36, 76, 11, 5.5, -28), 2);
                    Region(dc, Ellipse(64, 84, 11, 5.5, 28), 2);
                    foreach (var a in new[] { 0, 60, 120, 180, 240, 300 })
                    {
                        var pet = new EllipseGeometry(new Point(50, 30), 9, 15)
                        { Transform = new RotateTransform(a, 50, 50) };
                        Region(dc, pet, 2);
                    }
                    Region(dc, Ellipse(50, 50, 11, 11), 2);
                }
            },
            new Coloring
            {
                Id = "papillon", Name = "le papillon",
                Draw = dc =>
                {
                    Line(dc, Path("M48 33 Q42 22 37 19"), 2);
                    Line(dc, Path("M52 33 Q58 22 63 19"), 2);
                    Region(dc, Path("M47 42 Q17 23 19 47 Q20 61 47 54 Z"), 2);
                    Region(dc, Path("M53 42 Q83 23 81 47 Q80 61 53 54 Z"), 2);
                    Region(dc, Path("M47 56 Q25 61 29 79 Q33 88 47 70 Z"), 2);
                    Region(dc, Path("M53 56 Q75 61 71 79 Q67 88 53 70 Z"), 2);
                    Region(dc, Ellipse(31, 44, 4.5, 4.5), 1.5);
                    Region(dc, Ellipse(69, 44, 4.5, 4.5), 1.5);
                    Region(dc, Ellipse(50, 52, 4.5, 20), 2);
                }
            },
            new Coloring
            {
                Id = "poisson", Name = "le poisson",
                Draw = dc =>
                {
                    Region(dc, Path("M72 50 L93 33 L89 50 L93 67 Z"), 2);
                    Region(dc, Path("M18 50 Q40 20 73 50 Q40 80 18 50 Z"), 2);
                    Region(dc, Path("M42 29 Q52 16 62 31 Z"), 2);
                    Line(dc, Path("M46 37 Q41 50 46 63"), 1.5);
                    Region(dc, Ellipse(31, 46, 4.5, 4.5), 2);
                    Region(dc, Ellipse(13, 30, 4.5, 4.5), 1.5);
                    Region(dc, Ellipse(22, 19, 3, 3), 1.5);
                }
            },
            new Coloring
            {
                Id = "etoile", Name = "l'étoile",
                Draw = dc =>
                {
                    var star = Path("M50 12 L61 38 L89 40 L67 58 L74 86 L50 70 L26 86 L33 58 L11 40 L39 38 Z");
                    dc.DrawGeometry(White, new Pen(Brushes.Black, 2.5) { LineJoin = PenLineJoin.Round }, star);
                    Region(dc, Ellipse(50, 52, 9, 9), 1.5);
                }
            },
        };
    }
}
