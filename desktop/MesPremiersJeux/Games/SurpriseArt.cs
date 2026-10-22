using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Shapes;
using static MesPremiersJeux.Games.VecKit;

namespace MesPremiersJeux.Games
{
    /// <summary>
    /// Les douze surprises de « La fenêtre magique », dessinées en vectoriel
    /// (flat cartoon) : lion, licorne, fusée, château, baleine, tracteur,
    /// arc-en-ciel, dinosaure, gâteau, éléphant, bateau, manège. Même ordre que
    /// la liste du jeu ; une image du parent (surprise-N.png) garde la priorité.
    /// </summary>
    public static class SurpriseArt
    {
        public static FrameworkElement Make(int kind, double size)
        {
            var c = new Canvas { Width = 240, Height = 240 };
            switch (((kind % 12) + 12) % 12)
            {
                case 0: Lion(c); break;
                case 1: Licorne(c); break;
                case 2: Fusee(c); break;
                case 3: Chateau(c); break;
                case 4: Baleine(c); break;
                case 5: Tracteur(c); break;
                case 6: ArcEnCiel(c); break;
                case 7: Dinosaure(c); break;
                case 8: Gateau(c); break;
                case 9: Elephant(c); break;
                case 10: Bateau(c); break;
                default: Manege(c); break;
            }
            return Box(c, size);
        }

        private static void Lion(Canvas c)
        {
            var mane = C(0xE8, 0x8A, 0x2C);
            // La crinière : une couronne de pétales.
            for (int i = 0; i < 10; i++)
                Add(c, Rot(El(mane, 60, 34), i * 36.0), 90 + 62 * System.Math.Cos(i * 0.628) - 30, 110 + 62 * System.Math.Sin(i * 0.628) - 17);
            Add(c, El(mane, 160, 160), 40, 40);
            Add(c, El(C(0xFF, 0xC1, 0x5E), 120, 120), 60, 60);
            // Oreilles.
            Add(c, El(C(0xFF, 0xC1, 0x5E), 34, 34), 56, 48);
            Add(c, El(C(0xFF, 0xC1, 0x5E), 34, 34), 150, 48);
            Eye(c, 88, 100, 22);
            Eye(c, 128, 100, 22);
            // Museau + truffe + sourire.
            Add(c, El(C(0xFF, 0xE8, 0xC8), 56, 42), 92, 128);
            Add(c, El(C(0x7A, 0x4A, 0x30), 20, 14), 110, 128);
            AddSmile(c, "M 104,158 Q 120,170 136,158");
        }

        private static void Licorne(Canvas c)
        {
            var white = C(0xFC, 0xF8, 0xFF);
            // Crinière arc-en-ciel derrière la tête.
            Add(c, Rot(El(C(0xFF, 0x8F, 0xD3), 70, 34), -30), 40, 70);
            Add(c, Rot(El(C(0xA0, 0x6C, 0xD5), 70, 34), -10), 30, 110);
            Add(c, Rot(El(C(0x5D, 0xAD, 0xE2), 70, 34), 15), 36, 150);
            // La tête et le museau.
            Add(c, El(white, 130, 120), 70, 70);
            Add(c, El(white, 70, 54), 150, 120);
            Add(c, El(C(0xFF, 0xC4, 0xDC), 40, 30), 172, 136);
            // L'oreille et la CORNE dorée.
            Add(c, Rot(El(white, 30, 44), -15), 92, 46);
            Add(c, Rot(TriUp(C(0xFF, 0xC1, 0x07), 26, 64), 10), 124, 10);
            Eye(c, 110, 108, 24);
            Add(c, El(C(0xFF, 0xA8, 0xC8), 16, 10), 92, 140); // joue
        }

        private static void Fusee(Canvas c)
        {
            // Flamme.
            Add(c, TriDown(C(0xFF, 0xC1, 0x07), 44, 54), 98, 178);
            Add(c, TriDown(C(0xFF, 0x7A, 0x2C), 28, 38), 106, 178);
            // Ailerons + corps + ogive + hublot.
            Add(c, Poly(C(0xE8, 0x3A, 0x3A), new Point(96, 130), new Point(60, 186), new Point(96, 172)), 0, 0);
            Add(c, Poly(C(0xE8, 0x3A, 0x3A), new Point(144, 130), new Point(180, 186), new Point(144, 172)), 0, 0);
            Add(c, Rect(C(0xEC, 0xEF, 0xF4), 48, 110, 24), 96, 70);
            Add(c, Poly(C(0xE8, 0x3A, 0x3A), new Point(96, 74), new Point(144, 74), new Point(120, 26)), 0, 0);
            var ring = new Ellipse { Width = 34, Height = 34, Stroke = new SolidColorBrush(C(0x5D, 0xAD, 0xE2)), StrokeThickness = 6, Fill = new SolidColorBrush(C(0xBF, 0xE3, 0xFF)) };
            Add(c, ring, 103, 94);
            // Étoiles.
            AddStar(c, 40, 50, 22); AddStar(c, 190, 80, 18); AddStar(c, 60, 150, 16);
        }

        private static void Chateau(Canvas c)
        {
            var stone = C(0xC9, 0xB8, 0xE8);
            var dark = Shade(stone, 0.85);
            // Tours + toits pointus + mur + créneaux + porte.
            Add(c, Rect(stone, 46, 110, 6), 30, 90);
            Add(c, Rect(stone, 46, 110, 6), 164, 90);
            Add(c, TriUp(C(0xA0, 0x6C, 0xD5), 54, 48), 26, 44);
            Add(c, TriUp(C(0xA0, 0x6C, 0xD5), 54, 48), 160, 44);
            Add(c, Rect(dark, 92, 80, 4), 74, 120);
            for (int i = 0; i < 4; i++) Add(c, Rect(dark, 16, 16, 2), 76 + i * 22, 104);
            Add(c, El(C(0x6B, 0x45, 0x28), 36, 56), 102, 150);
            Add(c, Rect(C(0x6B, 0x45, 0x28), 36, 30, 4), 102, 178);
            // Fanions + fenêtres.
            Add(c, Rect(C(0x8A, 0x7A, 0xA8), 6, 24, 2), 50, 22); Add(c, Poly(C(0xE8, 0x3A, 0x6E), new Point(56, 22), new Point(84, 29), new Point(56, 36)), 0, 0);
            Add(c, Rect(C(0x8A, 0x7A, 0xA8), 6, 24, 2), 184, 22); Add(c, Poly(C(0xE8, 0x3A, 0x6E), new Point(190, 22), new Point(218, 29), new Point(190, 36)), 0, 0);
            Add(c, El(C(0xFF, 0xF2, 0xC4), 16, 22), 45, 110);
            Add(c, El(C(0xFF, 0xF2, 0xC4), 16, 22), 179, 110);
        }

        private static void Baleine(Canvas c)
        {
            var blue = C(0x5D, 0xAD, 0xE2);
            // Jet d'eau.
            Add(c, Rot(El(C(0xBF, 0xE3, 0xFF), 16, 40), -20), 76, 24);
            Add(c, Rot(El(C(0xBF, 0xE3, 0xFF), 16, 40), 20), 104, 24);
            Add(c, El(C(0xBF, 0xE3, 0xFF), 18, 18), 90, 18);
            // Corps + ventre + queue.
            Add(c, El(blue, 170, 110), 20, 70);
            Add(c, El(C(0xD8, 0xEE, 0xFF), 120, 60), 40, 125);
            Add(c, Rot(El(blue, 56, 34), -35), 170, 76);
            Add(c, Rot(El(blue, 56, 34), 35), 186, 100);
            Eye(c, 60, 100, 22);
            AddSmile(c, "M 50,140 Q 70,152 90,142");
            // Vagues.
            Add(c, El(C(0x9A, 0xD0, 0xF2), 70, 20), 10, 196);
            Add(c, El(C(0x9A, 0xD0, 0xF2), 70, 20), 100, 200);
            Add(c, El(C(0x9A, 0xD0, 0xF2), 60, 20), 180, 196);
        }

        private static void Tracteur(Canvas c)
        {
            var red = C(0xE8, 0x3A, 0x3A);
            // Cabine + capot + cheminée.
            Add(c, Rect(red, 70, 70, 10), 90, 60);
            Add(c, Rect(C(0xBF, 0xE3, 0xFF), 46, 38, 6), 102, 72);
            Add(c, Rect(red, 70, 44, 10), 40, 100);
            Add(c, Rect(C(0x6B, 0x45, 0x28), 14, 34, 4), 52, 62);
            Add(c, El(C(0x8A, 0x8A, 0x8A), 22, 10), 48, 54);
            // Roues : grande à l'arrière, petite à l'avant.
            AddWheel(c, 110, 120, 84);
            AddWheel(c, 40, 150, 56);
            // Petit soleil.
            AddStar(c, 196, 36, 24);
        }

        private static void ArcEnCiel(Canvas c)
        {
            // Demi-anneaux concentriques (le bas est caché par les nuages).
            var cols = new[] { C(0xE8, 0x3A, 0x3A), C(0xFF, 0x9F, 0x45), C(0xFF, 0xD9, 0x3C), C(0x6B, 0xCB, 0x77), C(0x5D, 0xAD, 0xE2), C(0xA0, 0x6C, 0xD5) };
            for (int i = 0; i < cols.Length; i++)
            {
                var ring = new Ellipse
                {
                    Width = 220 - i * 28,
                    Height = 220 - i * 28,
                    Stroke = new SolidColorBrush(cols[i]),
                    StrokeThickness = 15,
                };
                Add(c, ring, 10 + i * 14, 60 + i * 14);
            }
            // Les nuages aux deux pieds (cachent le bas des anneaux).
            foreach (var x in new[] { -6.0, 150.0 })
            {
                Add(c, El(Colors.White, 60, 44), x, 160);
                Add(c, El(Colors.White, 50, 38), x + 36, 168);
                Add(c, El(Colors.White, 44, 34), x + 14, 178);
            }
        }

        private static void Dinosaure(Canvas c)
        {
            var green = C(0x6B, 0xCB, 0x77);
            var dark = Shade(green, 0.8);
            // Queue, corps, cou, tête.
            Add(c, Rot(El(green, 90, 40), 25), 10, 150);
            Add(c, El(green, 130, 100), 50, 110);
            Add(c, Rot(El(green, 50, 90), 15), 140, 50);
            Add(c, El(green, 66, 52), 150, 30);
            Add(c, El(C(0xD8, 0xF2, 0xDC), 80, 50), 70, 150);
            // Piques sur le dos.
            Add(c, TriUp(dark, 26, 28), 60, 92);
            Add(c, TriUp(dark, 26, 28), 90, 82);
            Add(c, TriUp(dark, 26, 28), 120, 80);
            // Pattes.
            Add(c, Rect(green, 26, 44, 10), 70, 190);
            Add(c, Rect(green, 26, 44, 10), 120, 190);
            Eye(c, 170, 42, 20);
            AddSmile(c, "M 160,68 Q 176,78 194,68");
        }

        private static void Gateau(Canvas c)
        {
            // Deux étages + glaçage + bougies + cerise.
            Add(c, Rect(C(0xF2, 0xA8, 0xC8), 160, 60, 14), 40, 140);
            Add(c, Rect(C(0xC8, 0x8A, 0x5A), 160, 24, 8), 40, 176);
            Add(c, Rect(C(0xF2, 0xA8, 0xC8), 110, 50, 12), 65, 95);
            // Glaçage qui coule.
            foreach (var (x, w) in new[] { (65.0, 26.0), (100.0, 30.0), (140.0, 24.0) })
                Add(c, El(Colors.White, w, 24), x, 88);
            Add(c, Rect(Colors.White, 110, 14, 7), 65, 90);
            // Bougies + flammes.
            foreach (var x in new[] { 85.0, 115.0, 145.0 })
            {
                Add(c, Rect(C(0x5D, 0xAD, 0xE2), 10, 30, 4), x, 58);
                Add(c, El(C(0xFF, 0xC1, 0x07), 14, 20), x - 2, 38);
            }
            Add(c, El(C(0xE8, 0x3A, 0x3A), 22, 22), 109, 112);
        }

        private static void Elephant(Canvas c)
        {
            var gray = C(0xA8, 0xB8, 0xD0);
            // Grande oreille, tête, trompe en trois segments.
            Add(c, El(Shade(gray, 0.85), 90, 100), 30, 60);
            Add(c, El(C(0xE8, 0xC8, 0xD8), 60, 70), 45, 75);
            Add(c, El(gray, 120, 110), 80, 55);
            Add(c, Rot(El(gray, 36, 60), 10), 150, 140);
            Add(c, Rot(El(gray, 32, 50), 35), 164, 170);
            Add(c, Rot(El(gray, 28, 36), 70), 182, 192);
            Eye(c, 120, 95, 24);
            Eye(c, 160, 95, 24);
            AddSmile(c, "M 120,150 Q 134,160 148,152");
        }

        private static void Bateau(Canvas c)
        {
            // Coque + mât + deux voiles + fanion + vagues.
            Add(c, Poly(C(0xC8, 0x6B, 0x3A), new Point(40, 160), new Point(200, 160), new Point(170, 200), new Point(70, 200)), 0, 0);
            Add(c, Rect(C(0x6B, 0x45, 0x28), 10, 120, 4), 115, 40);
            Add(c, Poly(C(0xEC, 0xEF, 0xF4), new Point(112, 45), new Point(112, 150), new Point(45, 150)), 0, 0);
            Add(c, Poly(C(0xE8, 0x3A, 0x3A), new Point(128, 45), new Point(128, 150), new Point(195, 150)), 0, 0);
            Add(c, Poly(C(0xFF, 0xC1, 0x07), new Point(125, 28), new Point(155, 36), new Point(125, 44)), 0, 0);
            Add(c, El(C(0x9A, 0xD0, 0xF2), 80, 22), 20, 198);
            Add(c, El(C(0x9A, 0xD0, 0xF2), 80, 22), 120, 202);
        }

        private static void Manege(Canvas c)
        {
            // Toit en chapiteau + fanion, plateau, mâts et chevaux stylisés.
            Add(c, TriUp(C(0xE8, 0x3A, 0x6E), 180, 70), 30, 30);
            Add(c, El(C(0xFF, 0xC4, 0xDC), 180, 26), 30, 88);
            Add(c, Rect(C(0xFF, 0xC1, 0x07), 6, 22, 2), 117, 10);
            Add(c, Poly(C(0xFF, 0xC1, 0x07), new Point(123, 10), new Point(148, 16), new Point(123, 22)), 0, 0);
            // Les mâts.
            foreach (var x in new[] { 60.0, 117.0, 174.0 })
                Add(c, Rect(C(0xC8, 0xA8, 0x4A), 6, 90, 2), x, 100);
            // Deux petits chevaux (corps + tête + pattes).
            foreach (var (x, col) in new[] { (42.0, C(0xFF, 0xFF, 0xFF)), (150.0, C(0xC9, 0xB8, 0xE8)) })
            {
                Add(c, El(col, 52, 30), x, 135);
                Add(c, El(col, 24, 20), x + 42, 122);
                Add(c, Rect(col, 8, 20, 3), x + 8, 160);
                Add(c, Rect(col, 8, 20, 3), x + 34, 160);
            }
            // Le plateau du bas.
            Add(c, El(C(0xE8, 0x8A, 0xB0), 190, 30), 25, 185);
        }

        // --- petits détails partagés ---
        private static void AddSmile(Canvas c, string data)
        {
            c.Children.Add(new Path
            {
                Stroke = new SolidColorBrush(C(0x4A, 0x3A, 0x3A)),
                StrokeThickness = 6,
                StrokeStartLineCap = PenLineCap.Round,
                StrokeEndLineCap = PenLineCap.Round,
                Data = Geometry.Parse(data),
            });
        }

        private static void AddStar(Canvas c, double x, double y, double size)
        {
            Add(c, new TextBlock { Text = "✦", FontSize = size, Foreground = new SolidColorBrush(C(0xFF, 0xC1, 0x07)) }, x, y);
        }

        private static void AddWheel(Canvas c, double x, double y, double d)
        {
            Add(c, El(C(0x3A, 0x34, 0x40), d, d), x, y);
            Add(c, El(C(0xC8, 0xC8, 0xD0), d * 0.5, d * 0.5), x + d * 0.25, y + d * 0.25);
            Add(c, El(C(0x3A, 0x34, 0x40), d * 0.16, d * 0.16), x + d * 0.42, y + d * 0.42);
        }
    }
}
