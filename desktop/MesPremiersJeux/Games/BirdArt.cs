using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Shapes;

namespace MesPremiersJeux.Games
{
    /// <summary>
    /// Les six oiseaux chanteurs DESSINÉS en vectoriel (style flat cartoon) :
    /// corps rond, ventre clair, ailes, grands yeux brillants, bec, pattes —
    /// chacun sa couleur et sa personnalité (houppette, hibou aux grands yeux,
    /// pingouin, canard…). Deux poses : ailes repliées / ailes ouvertes (pour
    /// battre des ailes pendant le chant). Une image déposée par le parent dans
    /// Contenu\Images garde toujours la priorité sur ces dessins.
    /// </summary>
    public static class BirdArt
    {
        // Par oiseau : corps, ventre, bec/pattes, type de personnage.
        // Types : 0 bleu houppette, 1 poussin, 2 perroquet, 3 hibou, 4 pingouin, 5 canard.
        private static readonly (Color Body, Color Belly, Color Beak)[] P =
        {
            (C(0x4F, 0xA8, 0xE8), C(0xC4, 0xE5, 0xFF), C(0xF2, 0xA3, 0x3C)),
            (C(0xFF, 0xD2, 0x3C), C(0xFF, 0xF0, 0xB0), C(0xF2, 0x8C, 0x28)),
            (C(0xE8, 0x4F, 0x5E), C(0xFF, 0xD9, 0xDD), C(0xF2, 0xA3, 0x3C)),
            (C(0x9A, 0x6B, 0x4D), C(0xE8, 0xCB, 0xA8), C(0xF2, 0xA3, 0x3C)),
            (C(0x37, 0x40, 0x4F), C(0xF4, 0xF8, 0xFB), C(0xF2, 0xA3, 0x3C)),
            (C(0xF8, 0xF2, 0xE4), C(0xFF, 0xFF, 0xFF), C(0xF2, 0x8C, 0x28)),
        };

        private static Color C(byte r, byte g, byte b) => Color.FromRgb(r, g, b);

        private static Color Shade(Color c, double f) =>
            Color.FromRgb((byte)(c.R * f), (byte)(c.G * f), (byte)(c.B * f));

        /// <summary>L'oiseau n° kind (0..5), ailes ouvertes ou non, dans un carré « size ».</summary>
        public static FrameworkElement Make(int kind, bool open, double size)
        {
            kind = ((kind % 6) + 6) % 6;
            var (body, belly, beak) = P[kind];
            var dark = Shade(body, 0.78);
            var c = new Canvas { Width = 200, Height = 200 };

            // Queue (petites plumes derrière).
            Add(c, Rot(El(dark, 44, 20), 30), 18, 108);
            Add(c, Rot(El(dark, 44, 20), 55), 10, 126);

            // Ailes OUVERTES : dessinées derrière le corps, levées vers le haut.
            if (open)
            {
                Add(c, Rot(El(dark, 74, 34), -38), 2, 52);
                Add(c, Rot(El(dark, 74, 34), 38), 126, 52);
            }

            // Corps + ventre.
            Add(c, El(body, 132, 128), 34, 48);
            Add(c, El(belly, 86, 76), 57, 92);

            // Aile REPLIÉE sur le côté (pose posée).
            if (!open)
                Add(c, Rot(El(dark, 64, 40), 24), 24, 92);

            // Personnalité selon l'oiseau.
            switch (kind)
            {
                case 0: // houppette du bleu
                    Add(c, Rot(El(dark, 26, 12), -35), 78, 32);
                    Add(c, Rot(El(dark, 26, 12), 15), 94, 26);
                    break;
                case 1: // poussin : joues roses
                    Add(c, El(Color.FromArgb(150, 0xFF, 0x9A, 0xA8), 20, 14), 44, 96);
                    Add(c, El(Color.FromArgb(150, 0xFF, 0x9A, 0xA8), 20, 14), 136, 96);
                    break;
                case 2: // perroquet : calotte verte + joues blanches
                    Add(c, El(C(0x58, 0xC0, 0x6B), 92, 46), 54, 42);
                    Add(c, El(Colors.White, 34, 34), 56, 66);
                    Add(c, El(Colors.White, 34, 34), 110, 66);
                    break;
                case 3: // hibou : aigrettes + grands disques d'yeux
                    Add(c, Rot(Tri(dark, 26, 30), -18), 46, 30);
                    Add(c, Rot(Tri(dark, 26, 30), 18), 128, 30);
                    Add(c, El(C(0xF6, 0xEA, 0xD6), 48, 48), 50, 60);
                    Add(c, El(C(0xF6, 0xEA, 0xD6), 48, 48), 102, 60);
                    break;
                case 4: // pingouin : grand plastron blanc remontant
                    Add(c, El(belly, 96, 104), 52, 66);
                    break;
                case 5: // canard : petite mèche
                    Add(c, Rot(El(Shade(body, 0.9), 24, 10), -25), 86, 30);
                    break;
            }

            // Yeux : blanc + pupille + reflet (le hibou a déjà ses disques).
            double eyeY = kind == 3 ? 70 : 68;
            AddEye(c, 66, eyeY);
            AddEye(c, 112, eyeY);

            // Bec : triangle pointu, ou bec plat du canard.
            if (kind == 5)
                Add(c, El(beak, 44, 20), 78, 96);
            else
                Add(c, Tri(beak, 26, 22), 87, 94);

            // Pattes.
            Add(c, Rect(beak, 8, 20), 76, 172);
            Add(c, Rect(beak, 8, 20), 116, 172);
            Add(c, El(beak, 20, 8), 70, 188);
            Add(c, El(beak, 20, 8), 110, 188);

            return new Viewbox { Width = size, Height = size, Stretch = Stretch.Uniform, Child = c };
        }

        // --- petites fabriques de formes ---
        private static Ellipse El(Color color, double w, double h) =>
            new Ellipse { Width = w, Height = h, Fill = new SolidColorBrush(color) };

        private static Rectangle Rect(Color color, double w, double h) =>
            new Rectangle { Width = w, Height = h, RadiusX = 3, RadiusY = 3, Fill = new SolidColorBrush(color) };

        private static Polygon Tri(Color color, double w, double h) => new Polygon
        {
            Points = new PointCollection { new Point(0, 0), new Point(w, 0), new Point(w / 2, h) },
            Fill = new SolidColorBrush(color),
        };

        private static FrameworkElement Rot(FrameworkElement el, double angle)
        {
            el.RenderTransformOrigin = new Point(0.5, 0.5);
            el.RenderTransform = new RotateTransform(angle);
            return el;
        }

        private static void Add(Canvas c, FrameworkElement el, double x, double y)
        {
            Canvas.SetLeft(el, x);
            Canvas.SetTop(el, y);
            c.Children.Add(el);
        }

        private static void AddEye(Canvas c, double x, double y)
        {
            Add(c, El(Colors.White, 26, 26), x, y);
            Add(c, El(C(0x2A, 0x22, 0x30), 13, 13), x + 7, y + 7);
            Add(c, El(Colors.White, 5, 5), x + 14, y + 9);
        }
    }
}
