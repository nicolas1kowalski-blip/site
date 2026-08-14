using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Shapes;

namespace MesPremiersJeux.Games
{
    public sealed class CartoonItem
    {
        public string Name;             // identifiant (sans accents)
        public string Fr;               // nom français parlé (« le chat »)
        public string Cat;              // catégorie (familles)
        public Func<UIElement> Build;   // fabrique le dessin
    }

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

        /// <summary>Construit un dessin par son nom (pour les histoires).</summary>
        public static UIElement Draw(string name) => Items.First(i => i.Name == name).Build();
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

        private static UIElement Dog()
        {
            var c = New();
            c.Children.Add(Pa("M22,40 Q8,44 12,68 Q22,74 32,60 Z", B("#A97442"), Ink, 2.5));
            c.Children.Add(Pa("M78,40 Q92,44 88,68 Q78,74 68,60 Z", B("#A97442"), Ink, 2.5));
            c.Children.Add(Circle(50, 54, 32, B("#C8895A"), Ink, 3));
            c.Children.Add(Circle(50, 66, 16, B("#EAD1B8"), Ink, 2));
            c.Children.Add(Circle(38, 50, 4, Ink));
            c.Children.Add(Circle(62, 50, 4, Ink));
            c.Children.Add(Circle(50, 60, 5, Ink));
            c.Children.Add(Pa("M50,65 Q44,71 38,67", null, Ink, 2));
            c.Children.Add(Pa("M50,65 Q56,71 62,67", null, Ink, 2));
            return Wrap(c);
        }

        private static UIElement Rabbit()
        {
            var c = New();
            c.Children.Add(Pa("M40,46 Q34,10 44,8 Q50,26 48,46 Z", B("#F0F0F5"), Ink, 2.5));
            c.Children.Add(Pa("M60,46 Q66,10 56,8 Q50,26 52,46 Z", B("#F0F0F5"), Ink, 2.5));
            c.Children.Add(Pa("M42,44 Q39,20 44,16 Q47,30 46,44 Z", B("#FFC2D6")));
            c.Children.Add(Pa("M58,44 Q61,20 56,16 Q53,30 54,44 Z", B("#FFC2D6")));
            c.Children.Add(Circle(50, 60, 30, B("#F5F5FA"), Ink, 3));
            c.Children.Add(Circle(40, 56, 4, Ink));
            c.Children.Add(Circle(60, 56, 4, Ink));
            c.Children.Add(Circle(50, 64, 4, B("#FF9FB5"), Ink, 1.5));
            c.Children.Add(Circle(37, 66, 5, B("#FFC2D6")));
            c.Children.Add(Circle(63, 66, 5, B("#FFC2D6")));
            return Wrap(c);
        }

        private static UIElement Bird()
        {
            var c = New();
            c.Children.Add(Circle(50, 55, 30, B("#5DADE2"), Ink, 3));
            c.Children.Add(Pa("M50,50 Q30,54 34,72 Q46,68 54,58 Z", B("#3E90C8"), Ink, 2));
            c.Children.Add(Pa("M76,54 L92,51 L78,62 Z", B("#FFB300"), Ink, 2));
            c.Children.Add(Circle(64, 47, 5, Brushes.White, Ink, 2));
            c.Children.Add(Circle(65, 48, 2.4, Ink));
            c.Children.Add(Pa("M50,26 L45,15 M50,26 L55,15", null, Ink, 2));
            return Wrap(c);
        }

        private static UIElement Unicorn()
        {
            var c = New();
            c.Children.Add(Pa("M34,34 L30,18 L44,30 Z", B("#FDFDFF"), Ink, 2));
            c.Children.Add(Pa("M62,58 Q86,40 80,66 Q96,60 84,82 Q94,86 78,92", null, B("#FF6BB0"), 7));
            c.Children.Add(Pa("M66,54 Q88,52 82,74", null, B("#8AD6FF"), 6));
            c.Children.Add(Circle(50, 58, 29, B("#FDFDFF"), Ink, 3));
            c.Children.Add(Pa("M44,32 L50,6 L56,32 Z", B("#FFD54A"), Ink, 2));
            c.Children.Add(Circle(43, 56, 4, Ink));
            c.Children.Add(Pa("M42,68 Q50,74 60,68", null, Ink, 2));
            c.Children.Add(Circle(60, 66, 2, Ink));
            c.Children.Add(Circle(37, 63, 5, B("#FFC2D6")));
            return Wrap(c);
        }

        private static UIElement Princess()
        {
            var c = New();
            c.Children.Add(Pa("M24,52 Q20,86 36,90 L64,90 Q80,86 76,52 Q80,30 50,26 Q20,30 24,52 Z", B("#8B5A2B"), Ink, 2.5));
            c.Children.Add(Circle(50, 56, 24, B("#FFE0BD"), Ink, 2.5));
            c.Children.Add(Pa("M32,34 L34,20 L42,30 L50,16 L58,30 L66,20 L68,34 Z", B("#FFD54A"), Ink, 2));
            c.Children.Add(Circle(50, 22, 2.5, B("#FF6BB0"), Ink, 1));
            c.Children.Add(Circle(42, 56, 3.5, Ink));
            c.Children.Add(Circle(58, 56, 3.5, Ink));
            c.Children.Add(Pa("M42,66 Q50,72 58,66", null, Ink, 2));
            c.Children.Add(Circle(37, 62, 4, B("#FF9FB5")));
            c.Children.Add(Circle(63, 62, 4, B("#FF9FB5")));
            return Wrap(c);
        }

        private static UIElement Pig()
        {
            var c = New();
            c.Children.Add(Pa("M30,38 L24,22 L44,32 Z", B("#FF9EC4"), Ink, 2));
            c.Children.Add(Pa("M70,38 L76,22 L56,32 Z", B("#FF9EC4"), Ink, 2));
            c.Children.Add(Circle(50, 56, 30, B("#FFB3D1"), Ink, 3));
            var snout = new Ellipse { Width = 40, Height = 28, Fill = B("#FF9EC4"), Stroke = Ink, StrokeThickness = 2 };
            Canvas.SetLeft(snout, 30); Canvas.SetTop(snout, 52);
            c.Children.Add(snout);
            c.Children.Add(Circle(44, 66, 3, Ink));
            c.Children.Add(Circle(56, 66, 3, Ink));
            c.Children.Add(Circle(40, 48, 4, Ink));
            c.Children.Add(Circle(60, 48, 4, Ink));
            c.Children.Add(Circle(31, 58, 5, B("#FF7FB0")));
            c.Children.Add(Circle(69, 58, 5, B("#FF7FB0")));
            return Wrap(c);
        }

        private static UIElement Castle()
        {
            var c = New();
            // Tours et corps du château.
            c.Children.Add(Pa("M14,38 L14,92 L34,92 L34,38 Z", B("#D8C9FF"), Ink, 2.5));
            c.Children.Add(Pa("M66,38 L66,92 L86,92 L86,38 Z", B("#D8C9FF"), Ink, 2.5));
            c.Children.Add(Pa("M30,52 L30,92 L70,92 L70,52 Z", B("#EDE4FF"), Ink, 2.5));
            // Créneaux.
            c.Children.Add(Pa("M14,38 L14,30 L20,30 L20,38 M24,38 L24,30 L30,30 L30,38 M28,38 L34,38", B("#D8C9FF"), Ink, 2));
            c.Children.Add(Pa("M66,38 L66,30 L72,30 L72,38 M76,38 L76,30 L82,30 L82,38 M80,38 L86,38", B("#D8C9FF"), Ink, 2));
            // Porte + fenêtres + drapeau.
            c.Children.Add(Pa("M42,92 L42,72 Q50,62 58,72 L58,92 Z", B("#B57EDC"), Ink, 2.5));
            c.Children.Add(Circle(24, 50, 4, B("#FFF3B0"), Ink, 1.5));
            c.Children.Add(Circle(76, 50, 4, B("#FFF3B0"), Ink, 1.5));
            c.Children.Add(Pa("M50,52 L50,20 L64,25 L50,30", B("#FF6BB0"), Ink, 2));
            return Wrap(c);
        }

        public static readonly List<CartoonItem> Items = new List<CartoonItem>
        {
            new CartoonItem { Name = "chateau",   Fr = "le château",     Cat = "la magie",    Build = Castle },
            new CartoonItem { Name = "chat",      Fr = "le chat",        Cat = "les animaux", Build = Cat },
            new CartoonItem { Name = "cochon",    Fr = "le cochon",      Cat = "les animaux", Build = Pig },
            new CartoonItem { Name = "chien",     Fr = "le chien",       Cat = "les animaux", Build = Dog },
            new CartoonItem { Name = "lapin",     Fr = "le lapin",       Cat = "les animaux", Build = Rabbit },
            new CartoonItem { Name = "oiseau",    Fr = "l'oiseau",       Cat = "les animaux", Build = Bird },
            new CartoonItem { Name = "poisson",   Fr = "le poisson",     Cat = "les animaux", Build = Fish },
            new CartoonItem { Name = "papillon",  Fr = "le papillon",    Cat = "les animaux", Build = Butterfly },
            new CartoonItem { Name = "licorne",   Fr = "la licorne",     Cat = "la magie",    Build = Unicorn },
            new CartoonItem { Name = "princesse", Fr = "la princesse",   Cat = "la magie",    Build = Princess },
            new CartoonItem { Name = "etoile",    Fr = "l'étoile",       Cat = "la magie",    Build = Star },
            new CartoonItem { Name = "coeur",     Fr = "le cœur",        Cat = "la magie",    Build = Heart },
            new CartoonItem { Name = "fleur",     Fr = "la fleur",       Cat = "la magie",    Build = Flower },
            new CartoonItem { Name = "couronne",  Fr = "la couronne",    Cat = "la magie",    Build = Crown },
            new CartoonItem { Name = "arcenciel", Fr = "l'arc-en-ciel",  Cat = "la magie",    Build = Rainbow },
            new CartoonItem { Name = "soleil",    Fr = "le soleil",      Cat = "la magie",    Build = Sun },
            new CartoonItem { Name = "nuage",     Fr = "le nuage",       Cat = "la magie",    Build = Cloud },
        };
    }
}
