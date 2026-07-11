using System;
using System.Collections.Generic;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Shapes;

namespace MesPremiersJeux.Games
{
    public sealed class CartoonItem { public string Name; public Func<UIElement> Build; }

    /// <summary>
    /// Petits personnages « cartoon » dessinés en vectoriel (formes + visages
    /// mignons), dans un repère 0..100. Chaque appel à Build() renvoie un élément
    /// neuf (un UIElement ne pouvant avoir qu'un parent à la fois).
    /// </summary>
    public static class CartoonArt
    {
        private static readonly Brush Ink = new SolidColorBrush(Color.FromRgb(0x2B, 0x2D, 0x42));

        private static SolidColorBrush B(string hex)
        {
            var h = hex.Replace("#", "");
            return new SolidColorBrush(Color.FromRgb(
                Convert.ToByte(h.Substring(0, 2), 16), Convert.ToByte(h.Substring(2, 2), 16), Convert.ToByte(h.Substring(4, 2), 16)));
        }

        private static Ellipse Circle(double cx, double cy, double r, Brush fill, Brush stroke = null, double sw = 3)
        {
            var e = new Ellipse { Width = 2 * r, Height = 2 * r, Fill = fill, Stroke = stroke, StrokeThickness = sw };
            Canvas.SetLeft(e, cx - r); Canvas.SetTop(e, cy - r);
            return e;
        }

        // Formate un tracé en culture invariante (point décimal), sinon en français
        // « 52,5 » casse l'analyse (la virgule sépare déjà les coordonnées).
        private static string Inv(FormattableString s) => FormattableString.Invariant(s);

        private static Path Pa(string d, Brush fill, Brush stroke = null, double sw = 3)
            => new Path
            {
                Data = Geometry.Parse(d),
                Fill = fill,
                Stroke = stroke,
                StrokeThickness = sw,
                StrokeLineJoin = PenLineJoin.Round,
                StrokeStartLineCap = PenLineCap.Round,
                StrokeEndLineCap = PenLineCap.Round,
            };

        private static void Face(Canvas c, double cx, double cy, double dx, double eyeR, double smileW)
        {
            c.Children.Add(Circle(cx - dx, cy, eyeR, Ink));
            c.Children.Add(Circle(cx + dx, cy, eyeR, Ink));
            c.Children.Add(Circle(cx - dx - eyeR * 0.6, cy + eyeR * 1.7, eyeR * 0.9, B("#FF9FB5")));
            c.Children.Add(Circle(cx + dx + eyeR * 0.6, cy + eyeR * 1.7, eyeR * 0.9, B("#FF9FB5")));
            c.Children.Add(Pa(Inv($"M{cx - smileW},{cy + smileW * 0.7} Q{cx},{cy + smileW * 1.9} {cx + smileW},{cy + smileW * 0.7}"), null, Ink, 2.4));
        }

        private static UIElement Wrap(Canvas c) => new Viewbox { Child = c, Stretch = Stretch.Uniform };
        private static Canvas New() => new Canvas { Width = 100, Height = 100 };

        // --- Personnages ---
        private static UIElement Star()
        {
            var c = New();
            c.Children.Add(Pa("M50,6 L61,38 L95,38 L67,58 L77,92 L50,72 L23,92 L33,58 L5,38 L39,38 Z", B("#FFD93C"), Ink, 3));
            Face(c, 50, 54, 9, 3.1, 8);
            return Wrap(c);
        }

        private static UIElement Heart()
        {
            var c = New();
            c.Children.Add(Pa("M50,88 C16,64 4,44 21,25 C34,11 47,21 50,33 C53,21 66,11 79,25 C96,44 84,64 50,88 Z", B("#FF6B95"), Ink, 3));
            Face(c, 50, 44, 9, 3.1, 8);
            return Wrap(c);
        }

        private static UIElement Flower()
        {
            var c = New();
            foreach (var a in new[] { 0, 60, 120, 180, 240, 300 })
            {
                var p = new Ellipse { Width = 24, Height = 42, Fill = B("#FF8FD3"), Stroke = Ink, StrokeThickness = 2.5 };
                Canvas.SetLeft(p, 50 - 12); Canvas.SetTop(p, 50 - 42);
                p.RenderTransform = new RotateTransform(a, 12, 42);
                c.Children.Add(p);
            }
            c.Children.Add(Circle(50, 50, 15, B("#FFD93C"), Ink, 2.5));
            Face(c, 50, 49, 5, 2.2, 5);
            return Wrap(c);
        }

        private static UIElement Cat()
        {
            var c = New();
            c.Children.Add(Pa("M24,34 L20,10 L44,26 Z", B("#FFB74D"), Ink, 2.5));
            c.Children.Add(Pa("M76,34 L80,10 L56,26 Z", B("#FFB74D"), Ink, 2.5));
            c.Children.Add(Circle(50, 56, 34, B("#FFB74D"), Ink, 3));
            c.Children.Add(Circle(38, 52, 4, Ink));
            c.Children.Add(Circle(62, 52, 4, Ink));
            c.Children.Add(Pa("M50,60 L45,66 L55,66 Z", B("#FF6B95"), Ink, 1.5));
            c.Children.Add(Pa("M50,66 Q42,73 34,68", null, Ink, 2));
            c.Children.Add(Pa("M50,66 Q58,73 66,68", null, Ink, 2));
            foreach (var y in new[] { 60.0, 66.0 })
            {
                c.Children.Add(Pa(Inv($"M30,{y} L14,{y - 3}"), null, Ink, 2));
                c.Children.Add(Pa(Inv($"M70,{y} L86,{y - 3}"), null, Ink, 2));
            }
            c.Children.Add(Circle(30, 64, 5, B("#FF9FB5")));
            c.Children.Add(Circle(70, 64, 5, B("#FF9FB5")));
            return Wrap(c);
        }

        private static UIElement Crown()
        {
            var c = New();
            c.Children.Add(Pa("M14,74 L14,38 L34,56 L50,30 L66,56 L86,38 L86,74 Z", B("#FFD93C"), Ink, 3));
            c.Children.Add(Circle(50, 40, 4, B("#FF6B95"), Ink, 1.5));
            c.Children.Add(Circle(26, 48, 3.5, B("#5DADE2"), Ink, 1.5));
            c.Children.Add(Circle(74, 48, 3.5, B("#5DADE2"), Ink, 1.5));
            c.Children.Add(new Rectangle { Width = 60, Height = 10, Fill = B("#FFC107") });
            var band = (Rectangle)c.Children[c.Children.Count - 1];
            Canvas.SetLeft(band, 20); Canvas.SetTop(band, 66);
            return Wrap(c);
        }

        private static UIElement Rainbow()
        {
            var c = New();
            string[] cols = { "#FF6B6B", "#FF9F43", "#FFD93C", "#4CAF50", "#5DADE2", "#9D4EDD" };
            for (int i = 0; i < cols.Length; i++)
            {
                double r = 40 - i * 6;
                c.Children.Add(Pa(Inv($"M{50 - r},72 A{r},{r} 0 0 1 {50 + r},72"), null, B(cols[i]), 6));
            }
            c.Children.Add(Circle(18, 74, 9, Brushes.White, Ink, 2.5));
            c.Children.Add(Circle(82, 74, 9, Brushes.White, Ink, 2.5));
            return Wrap(c);
        }

        private static UIElement Butterfly()
        {
            var c = New();
            c.Children.Add(Pa("M50,50 C24,26 8,34 14,52 C8,70 30,74 50,54 Z", B("#B37DFF"), Ink, 2.5));
            c.Children.Add(Pa("M50,50 C76,26 92,34 86,52 C92,70 70,74 50,54 Z", B("#B37DFF"), Ink, 2.5));
            c.Children.Add(Pa("M50,52 C34,60 24,74 30,86 C42,90 50,72 50,64 Z", B("#D6B3FF"), Ink, 2.5));
            c.Children.Add(Pa("M50,52 C66,60 76,74 70,86 C58,90 50,72 50,64 Z", B("#D6B3FF"), Ink, 2.5));
            c.Children.Add(new Rectangle { Width = 6, Height = 44, RadiusX = 3, RadiusY = 3, Fill = Ink });
            var body = (Rectangle)c.Children[c.Children.Count - 1];
            Canvas.SetLeft(body, 47); Canvas.SetTop(body, 30);
            c.Children.Add(Pa("M48,30 Q42,18 36,16", null, Ink, 2));
            c.Children.Add(Pa("M52,30 Q58,18 64,16", null, Ink, 2));
            return Wrap(c);
        }

        private static UIElement Cloud()
        {
            var c = New();
            c.Children.Add(Pa("M26,68 A16,16 0 0 1 30,38 A20,20 0 0 1 68,36 A16,16 0 0 1 74,68 Z", Brushes.White, Ink, 3));
            Face(c, 50, 52, 9, 3, 7);
            return Wrap(c);
        }

        private static UIElement Sun()
        {
            var c = New();
            for (int i = 0; i < 12; i++)
            {
                double a = Math.PI * 2 * i / 12;
                double x1 = 50 + Math.Cos(a) * 34, y1 = 50 + Math.Sin(a) * 34;
                double x2 = 50 + Math.Cos(a) * 46, y2 = 50 + Math.Sin(a) * 46;
                c.Children.Add(Pa(Inv($"M{x1},{y1} L{x2},{y2}"), null, B("#FFC107"), 4));
            }
            c.Children.Add(Circle(50, 50, 30, B("#FFD93C"), Ink, 3));
            Face(c, 50, 48, 9, 3.2, 8);
            return Wrap(c);
        }

        private static UIElement Fish()
        {
            var c = New();
            c.Children.Add(Pa("M70,50 L92,34 L88,50 L92,66 Z", B("#FF7043"), Ink, 2.5));
            c.Children.Add(Circle(42, 50, 30, B("#FF9800"), Ink, 3));
            c.Children.Add(Circle(30, 44, 5, Brushes.White, Ink, 2));
            c.Children.Add(Circle(29, 45, 2.4, Ink));
            c.Children.Add(Pa("M28,58 Q36,64 46,58", null, Ink, 2));
            return Wrap(c);
        }

        public static readonly List<CartoonItem> Items = new List<CartoonItem>
        {
            new CartoonItem { Name = "etoile",    Build = Star },
            new CartoonItem { Name = "coeur",     Build = Heart },
            new CartoonItem { Name = "fleur",     Build = Flower },
            new CartoonItem { Name = "chat",      Build = Cat },
            new CartoonItem { Name = "couronne",  Build = Crown },
            new CartoonItem { Name = "arcenciel", Build = Rainbow },
            new CartoonItem { Name = "papillon",  Build = Butterfly },
            new CartoonItem { Name = "nuage",     Build = Cloud },
            new CartoonItem { Name = "soleil",    Build = Sun },
            new CartoonItem { Name = "poisson",   Build = Fish },
        };
    }
}
