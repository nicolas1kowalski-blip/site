using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Shapes;

namespace MesPremiersJeux.Games
{
    public enum Eyes { Normal, Happy, Sad, Angry, Surprised, Sleepy, Wink }
    public enum Mouth { Smile, BigSmile, Frown, Open, Flat, Tongue }
    public enum Brows { None, Angry, Sad, Up }
    public enum Hands { Rest, Wave, ThumbsUp, Open }
    public enum Item { None, Bowl, Cup, Ball, Heart }

    /// <summary>Configuration d'une frimousse de la mascotte « Je m'exprime ».</summary>
    public sealed class Face
    {
        public Eyes Eyes = Eyes.Normal;
        public Mouth Mouth = Mouth.Smile;
        public Brows Brows = Brows.None;
        public bool Cheeks = true;
        public Hands Hands = Hands.Rest;
        public Item Item = Item.None;
        public string Color = "#FFC24B"; // couleur du corps (mascotte originale)
    }

    /// <summary>
    /// Mascotte expressive (personnage original), dessinée en vectoriel dans un
    /// repère 0..100. On change les yeux/la bouche/les sourcils/les mains/l'objet
    /// tenu pour exprimer une émotion, un besoin ou une politesse.
    /// </summary>
    public static class Mascot
    {
        private static readonly Brush Ink = B("#3A2E4A");
        private static readonly Brush Pink = B("#FF9FB5");
        private static readonly Brush White = Brushes.White;

        public static FrameworkElement Build(Face f)
        {
            var c = new Canvas { Width = 100, Height = 100 };
            var body = B(f.Color);
            var dark = B(Darker(f.Color));

            // Pieds.
            c.Children.Add(Oval(40, 90, 8, 5, dark, Ink, 2));
            c.Children.Add(Oval(60, 90, 8, 5, dark, Ink, 2));

            // Bras (derrière le corps selon la pose).
            Arms(c, f.Hands, body);

            // Corps.
            c.Children.Add(Oval(50, 54, 33, 35, body, Ink, 3));
            // Petit ventre plus clair.
            c.Children.Add(Oval(50, 62, 20, 20, B(Lighter(f.Color)), null, 0));

            // Visage.
            DrawBrows(c, f.Brows);
            DrawEyes(c, f.Eyes);
            if (f.Cheeks) { c.Children.Add(Circle(30, 60, 5, Pink)); c.Children.Add(Circle(70, 60, 5, Pink)); }
            DrawMouth(c, f.Mouth);

            // Objet tenu devant.
            DrawItem(c, f.Item);

            return new Viewbox { Child = c, Stretch = Stretch.Uniform };
        }

        // ---- Bras / mains ----
        private static void Arms(Canvas c, Hands h, Brush body)
        {
            switch (h)
            {
                case Hands.Wave:
                    // Bras gauche au repos, bras droit levé qui salue.
                    c.Children.Add(Cap(17, 58, 30, 66, 11, body));
                    c.Children.Add(Cap(83, 58, 90, 24, 11, body));
                    c.Children.Add(Circle(90, 20, 8, body, Ink, 2.5)); // main
                    break;
                case Hands.ThumbsUp:
                    c.Children.Add(Cap(17, 58, 30, 66, 11, body));
                    c.Children.Add(Cap(83, 58, 88, 40, 11, body));
                    c.Children.Add(Circle(90, 34, 8, body, Ink, 2.5));
                    c.Children.Add(Pa("M90,34 L90,22", null, Ink, 4)); // pouce levé
                    break;
                case Hands.Open:
                    c.Children.Add(Cap(20, 55, 8, 34, 11, body));
                    c.Children.Add(Cap(80, 55, 92, 34, 11, body));
                    c.Children.Add(Circle(8, 30, 8, body, Ink, 2.5));
                    c.Children.Add(Circle(92, 30, 8, body, Ink, 2.5));
                    break;
                default: // Rest
                    c.Children.Add(Cap(18, 56, 14, 74, 11, body));
                    c.Children.Add(Cap(82, 56, 86, 74, 11, body));
                    break;
            }
        }

        // ---- Yeux ----
        private static void DrawEyes(Canvas c, Eyes e)
        {
            double lx = 38, rx = 62, y = 46;
            switch (e)
            {
                case Eyes.Happy:
                    c.Children.Add(Pa(Inv($"M{lx - 9},{y + 2} Q{lx},{y - 8} {lx + 9},{y + 2}"), null, Ink, 3));
                    c.Children.Add(Pa(Inv($"M{rx - 9},{y + 2} Q{rx},{y - 8} {rx + 9},{y + 2}"), null, Ink, 3));
                    break;
                case Eyes.Sleepy:
                    c.Children.Add(Pa(Inv($"M{lx - 9},{y} Q{lx},{y + 6} {lx + 9},{y}"), null, Ink, 3));
                    c.Children.Add(Pa(Inv($"M{rx - 9},{y} Q{rx},{y + 6} {rx + 9},{y}"), null, Ink, 3));
                    break;
                case Eyes.Surprised:
                    EyeBall(c, lx, y, 12, 5);
                    EyeBall(c, rx, y, 12, 5);
                    break;
                case Eyes.Sad:
                    EyeBall(c, lx, y + 1, 10, 4.5);
                    EyeBall(c, rx, y + 1, 10, 4.5);
                    c.Children.Add(Pa(Inv($"M{lx - 10},{y - 8} Q{lx},{y - 4} {lx + 10},{y - 6}"), null, Ink, 2.5));
                    c.Children.Add(Pa(Inv($"M{rx - 10},{y - 6} Q{rx},{y - 4} {rx + 10},{y - 8}"), null, Ink, 2.5));
                    break;
                case Eyes.Angry:
                    EyeBall(c, lx, y + 1, 10, 4.5);
                    EyeBall(c, rx, y + 1, 10, 4.5);
                    break;
                case Eyes.Wink:
                    c.Children.Add(Pa(Inv($"M{lx - 9},{y + 2} Q{lx},{y - 8} {lx + 9},{y + 2}"), null, Ink, 3));
                    EyeBall(c, rx, y, 10, 4.5);
                    break;
                default: // Normal
                    EyeBall(c, lx, y, 10, 4.5);
                    EyeBall(c, rx, y, 10, 4.5);
                    break;
            }
        }

        private static void EyeBall(Canvas c, double cx, double cy, double r, double pr)
        {
            c.Children.Add(Circle(cx, cy, r, White, Ink, 2.5));
            c.Children.Add(Circle(cx + 1, cy + 1, pr, Ink));
            c.Children.Add(Circle(cx - 1, cy - 1, pr * 0.4, White));
        }

        // ---- Sourcils ----
        private static void DrawBrows(Canvas c, Brows b)
        {
            double lx = 38, rx = 62, y = 33;
            switch (b)
            {
                case Brows.Angry:
                    c.Children.Add(Pa(Inv($"M{lx - 10},{y - 3} L{lx + 8},{y + 4}"), null, Ink, 3.5));
                    c.Children.Add(Pa(Inv($"M{rx + 10},{y - 3} L{rx - 8},{y + 4}"), null, Ink, 3.5));
                    break;
                case Brows.Sad:
                    c.Children.Add(Pa(Inv($"M{lx - 10},{y + 4} L{lx + 8},{y - 2}"), null, Ink, 3));
                    c.Children.Add(Pa(Inv($"M{rx + 10},{y + 4} L{rx - 8},{y - 2}"), null, Ink, 3));
                    break;
                case Brows.Up:
                    c.Children.Add(Pa(Inv($"M{lx - 9},{y} Q{lx},{y - 6} {lx + 9},{y}"), null, Ink, 3));
                    c.Children.Add(Pa(Inv($"M{rx - 9},{y} Q{rx},{y - 6} {rx + 9},{y}"), null, Ink, 3));
                    break;
            }
        }

        // ---- Bouche ----
        private static void DrawMouth(Canvas c, Mouth m)
        {
            switch (m)
            {
                case Mouth.BigSmile:
                    c.Children.Add(Pa("M38,64 Q50,82 62,64 Q50,72 38,64 Z", B("#B0405E"), Ink, 2));
                    break;
                case Mouth.Frown:
                    c.Children.Add(Pa("M40,74 Q50,66 60,74", null, Ink, 3));
                    break;
                case Mouth.Open:
                    c.Children.Add(Oval(50, 72, 7, 9, B("#B0405E"), Ink, 2));
                    break;
                case Mouth.Flat:
                    c.Children.Add(Pa("M42,70 L58,70", null, Ink, 3));
                    break;
                case Mouth.Tongue:
                    c.Children.Add(Pa("M40,66 Q50,76 60,66", null, Ink, 3));
                    c.Children.Add(Oval(50, 72, 5, 4, Pink, Ink, 1.5));
                    break;
                default: // Smile
                    c.Children.Add(Pa("M40,67 Q50,76 60,67", null, Ink, 3));
                    break;
            }
        }

        // ---- Objet tenu ----
        private static void DrawItem(Canvas c, Item it)
        {
            switch (it)
            {
                case Item.Bowl:
                    c.Children.Add(Pa("M34,78 Q50,96 66,78 Z", B("#8AD6FF"), Ink, 2.5));
                    c.Children.Add(Pa("M40,78 Q50,72 60,78", null, B("#FFB84D"), 4)); // nourriture
                    break;
                case Item.Cup:
                    c.Children.Add(Pa("M40,74 L44,92 L56,92 L60,74 Z", B("#8AD6FF"), Ink, 2.5));
                    break;
                case Item.Ball:
                    c.Children.Add(Circle(50, 86, 9, B("#FF6B6B"), Ink, 2.5));
                    break;
                case Item.Heart:
                    c.Children.Add(Pa("M50,92 C40,84 36,78 42,73 C46,70 50,74 50,78 C50,74 54,70 58,73 C64,78 60,84 50,92 Z", B("#FF6B95"), Ink, 2));
                    break;
            }
        }

        // ---- Fabriques ----
        private static string Inv(FormattableString s) => FormattableString.Invariant(s);

        private static SolidColorBrush B(string hex)
        {
            var h = hex.Replace("#", "");
            if (h.Length == 8) h = h.Substring(2);
            return new SolidColorBrush(Color.FromRgb(
                Convert.ToByte(h.Substring(0, 2), 16), Convert.ToByte(h.Substring(2, 2), 16), Convert.ToByte(h.Substring(4, 2), 16)));
        }

        private static string Lighter(string hex) => Mix(hex, 255, 255, 255, 0.45);
        private static string Darker(string hex) => Mix(hex, 0, 0, 0, 0.18);

        private static string Mix(string hex, int tr, int tg, int tb, double t)
        {
            var b = B(hex).Color;
            int r = (int)(b.R + (tr - b.R) * t), g = (int)(b.G + (tg - b.G) * t), bl = (int)(b.B + (tb - b.B) * t);
            return $"#{r:X2}{g:X2}{bl:X2}";
        }

        private static Ellipse Circle(double cx, double cy, double r, Brush fill, Brush stroke = null, double sw = 3)
            => Oval(cx, cy, r, r, fill, stroke, sw);

        private static Ellipse Oval(double cx, double cy, double rx, double ry, Brush fill, Brush stroke = null, double sw = 3)
        {
            var e = new Ellipse { Width = 2 * rx, Height = 2 * ry, Fill = fill, Stroke = stroke, StrokeThickness = sw };
            Canvas.SetLeft(e, cx - rx); Canvas.SetTop(e, cy - ry);
            return e;
        }

        // Bras « gélule » entre deux points.
        private static Path Cap(double x1, double y1, double x2, double y2, double w, Brush fill)
        {
            double dx = x2 - x1, dy = y2 - y1, len = Math.Sqrt(dx * dx + dy * dy); if (len < 0.01) len = 0.01;
            double ux = dx / len, uy = dy / len, px = -uy, py = ux, hh = w / 2;
            double ax = x1 + px * hh, ay = y1 + py * hh, bx = x2 + px * hh, by = y2 + py * hh;
            double cx = x2 - px * hh, cy = y2 - py * hh, dxp = x1 - px * hh, dyp = y1 - py * hh;
            var d = Inv($"M{ax},{ay} L{bx},{by} Q{x2 + ux * hh},{y2 + uy * hh} {cx},{cy} L{dxp},{dyp} Q{x1 - ux * hh},{y1 - uy * hh} {ax},{ay} Z");
            return Pa(d, fill, Ink, 2.5);
        }

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
    }
}
