using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Shapes;
using MesPremiersJeux.Lib;
using static MesPremiersJeux.Games.VecKit;

namespace MesPremiersJeux.Games
{
    /// <summary>
    /// Drapeaux dessinés en vectoriel pour « Le tour du monde » — Windows
    /// n'affiche pas les emojis de drapeaux, on les dessine donc : bandes,
    /// cercles, croix et étoiles. Index : 0 France · 1 Angleterre · 2 Italie ·
    /// 3 Égypte · 4 Russie · 5 Chine · 6 Japon · 7 États-Unis.
    /// </summary>
    public static class FlagArt
    {
        /// <summary>Le nom écrit sous chaque drapeau — le même mot que celui
        /// que dit la voix (d'où « Amérique » et non « États-Unis »).</summary>
        public static readonly string[] Names =
            { "France", "Angleterre", "Italie", "Égypte", "Russie", "Chine", "Japon", "Amérique",
              "Espagne", "Allemagne", "Grèce", "Inde", "Brésil", "Mexique", "Australie", "Turquie",
              "Pays-Bas", "Belgique", "Danemark", "Pérou", "Cambodge", "Corée du Sud", "Suisse", "Mali",
              "Tunisie", "Portugal", "Tanzanie", "Chili" };

        /// <summary>Le drapeau (largeur « size ») avec le NOM DU PAYS écrit
        /// dessous ; named = false pour le drapeau seul.</summary>
        private static readonly string[] Keys =
            { "france", "angleterre", "italie", "egypte", "russie", "chine", "japon", "amerique",
              "espagne", "allemagne", "grece", "inde", "bresil", "mexique", "australie", "turquie",
              "pays-bas", "belgique", "danemark", "perou", "cambodge", "coree", "suisse", "mali",
              "tunisie", "portugal", "tanzanie", "chili" };

        public static FrameworkElement Make(int kind, double size, bool named = true)
        {
            int k = ((kind % Names.Length) + Names.Length) % Names.Length;
            var c = new Canvas { Width = 300, Height = 200 };
            // Le drapeau DESSINÉ (drapeau-<pays>.png) s'il existe.
            var img = Art.Find("drapeau-" + Keys[k]);
            if (img != null)
            {
                c.Children.Add(new Image { Source = img, Width = 300, Height = 200, Stretch = Stretch.Uniform });
                return Finish(c, k, size, named);
            }
            switch (k)
            {
                case 0: // France : trois bandes verticales
                    Add(c, Rect(C(0x00, 0x55, 0xA4), 100, 200, 0), 0, 0);
                    Add(c, Rect(Colors.White, 100, 200, 0), 100, 0);
                    Add(c, Rect(C(0xEF, 0x41, 0x35), 100, 200, 0), 200, 0);
                    break;
                case 1: // Angleterre : croix de saint Georges
                    Add(c, Rect(Colors.White, 300, 200, 0), 0, 0);
                    Add(c, Rect(C(0xD6, 0x2E, 0x2E), 300, 44, 0), 0, 78);
                    Add(c, Rect(C(0xD6, 0x2E, 0x2E), 44, 200, 0), 128, 0);
                    break;
                case 2: // Italie
                    Add(c, Rect(C(0x00, 0x92, 0x46), 100, 200, 0), 0, 0);
                    Add(c, Rect(Colors.White, 100, 200, 0), 100, 0);
                    Add(c, Rect(C(0xCE, 0x2B, 0x37), 100, 200, 0), 200, 0);
                    break;
                case 3: // Égypte : rouge / blanc / noir + aigle doré (simplifié)
                    Add(c, Rect(C(0xCE, 0x2B, 0x37), 300, 67, 0), 0, 0);
                    Add(c, Rect(Colors.White, 300, 66, 0), 0, 67);
                    Add(c, Rect(C(0x2A, 0x26, 0x26), 300, 67, 0), 0, 133);
                    Add(c, El(C(0xC8, 0xA2, 0x3C), 44, 44), 128, 78);
                    break;
                case 4: // Russie : blanc / bleu / rouge
                    Add(c, Rect(Colors.White, 300, 67, 0), 0, 0);
                    Add(c, Rect(C(0x00, 0x39, 0xA6), 300, 66, 0), 0, 67);
                    Add(c, Rect(C(0xD5, 0x2B, 0x1E), 300, 67, 0), 0, 133);
                    break;
                case 5: // Chine : rouge + grande étoile dorée
                    Add(c, Rect(C(0xDE, 0x29, 0x10), 300, 200, 0), 0, 0);
                    AddStar(c, 34, 16, 74, C(0xFF, 0xDE, 0x00));
                    AddStar(c, 118, 14, 26, C(0xFF, 0xDE, 0x00));
                    AddStar(c, 134, 52, 26, C(0xFF, 0xDE, 0x00));
                    AddStar(c, 118, 92, 26, C(0xFF, 0xDE, 0x00));
                    break;
                case 6: // Japon : blanc + soleil rouge
                    Add(c, Rect(Colors.White, 300, 200, 0), 0, 0);
                    Add(c, El(C(0xBC, 0x00, 0x2D), 110, 110), 95, 45);
                    break;
                case 7: // États-Unis : bandes + canton étoilé (simplifié)
                    for (int i = 0; i < 7; i++)
                        Add(c, Rect(i % 2 == 0 ? C(0xB2, 0x22, 0x34) : Colors.White, 300, 29, 0), 0, i * 29);
                    Add(c, Rect(C(0x3C, 0x3B, 0x6E), 130, 115, 0), 0, 0);
                    for (int r = 0; r < 3; r++)
                        for (int col = 0; col < 4; col++)
                            AddStar(c, 10 + col * 30, 8 + r * 34, 18, Colors.White);
                    break;
                case 8: Bands(c, false, C(0xC6, 0x0B, 0x1E), C(0xFF, 0xC4, 0x00), C(0xFF, 0xC4, 0x00), C(0xC6, 0x0B, 0x1E)); break; // Espagne
                case 9: Bands(c, false, C(0x22, 0x22, 0x22), C(0xDD, 0x00, 0x00), C(0xFF, 0xCE, 0x00)); break;                    // Allemagne
                case 10: // Grèce : 9 bandes + canton à croix blanche
                    for (int i = 0; i < 9; i++)
                        Add(c, Rect(i % 2 == 0 ? C(0x0D, 0x5E, 0xAF) : Colors.White, 300, 200.0 / 9 + 0.5, 0), 0, i * 200.0 / 9);
                    Add(c, Rect(C(0x0D, 0x5E, 0xAF), 111, 111, 0), 0, 0);
                    Add(c, Rect(Colors.White, 111, 22, 0), 0, 44.5);
                    Add(c, Rect(Colors.White, 22, 111, 0), 44.5, 0);
                    break;
                case 11: // Inde : safran / blanc / vert + roue bleue
                    Bands(c, false, C(0xFF, 0x99, 0x33), Colors.White, C(0x13, 0x88, 0x08));
                    Add(c, new Ellipse { Width = 58, Height = 58, Stroke = new SolidColorBrush(C(0x00, 0x00, 0x80)), StrokeThickness = 6 }, 121, 71);
                    Add(c, El(C(0x00, 0x00, 0x80), 14, 14), 143, 93);
                    break;
                case 12: // Brésil : vert, losange jaune, globe bleu
                    Add(c, Rect(C(0x00, 0x9C, 0x3B), 300, 200, 0), 0, 0);
                    c.Children.Add(Poly(C(0xFF, 0xDF, 0x00), new Point(24, 100), new Point(150, 18), new Point(276, 100), new Point(150, 182)));
                    Add(c, El(C(0x00, 0x27, 0x76), 86, 86), 107, 57);
                    break;
                case 13: // Mexique : vert / blanc / rouge + aigle (simplifié)
                    Bands(c, true, C(0x00, 0x68, 0x47), Colors.White, C(0xCE, 0x11, 0x26));
                    Add(c, El(C(0x8B, 0x5A, 0x2B), 52, 52), 124, 74);
                    break;
                case 14: // Australie : bleu, petite croix, étoiles blanches
                    Add(c, Rect(C(0x00, 0x00, 0x8B), 300, 200, 0), 0, 0);
                    Add(c, Rect(Colors.White, 150, 22, 0), 0, 39);
                    Add(c, Rect(Colors.White, 22, 100, 0), 64, 0);
                    Add(c, Rect(C(0xE4, 0x00, 0x2B), 150, 10, 0), 0, 45);
                    Add(c, Rect(C(0xE4, 0x00, 0x2B), 10, 100, 0), 70, 0);
                    AddStar(c, 50, 112, 56, Colors.White);
                    AddStar(c, 200, 20, 30, Colors.White);
                    AddStar(c, 245, 70, 30, Colors.White);
                    AddStar(c, 196, 130, 30, Colors.White);
                    AddStar(c, 160, 72, 22, Colors.White);
                    break;
                case 15: // Turquie : rouge, croissant et étoile blancs
                    Add(c, Rect(C(0xE3, 0x0A, 0x17), 300, 200, 0), 0, 0);
                    Add(c, El(Colors.White, 100, 100), 55, 50);
                    Add(c, El(C(0xE3, 0x0A, 0x17), 80, 80), 80, 60);
                    AddStar(c, 150, 64, 56, Colors.White);
                    break;
                case 16: Bands(c, false, C(0xAE, 0x1C, 0x28), Colors.White, C(0x21, 0x46, 0x8B)); break;                    // Pays-Bas
                case 17: Bands(c, true, C(0x22, 0x22, 0x22), C(0xFD, 0xDA, 0x24), C(0xEF, 0x33, 0x40)); break;                // Belgique
                case 18: // Danemark : croix blanche décalée
                    Add(c, Rect(C(0xC8, 0x10, 0x2E), 300, 200, 0), 0, 0);
                    Add(c, Rect(Colors.White, 300, 30, 0), 0, 85);
                    Add(c, Rect(Colors.White, 30, 200, 0), 90, 0);
                    break;
                case 19: Bands(c, true, C(0xD9, 0x10, 0x23), Colors.White, C(0xD9, 0x10, 0x23)); break;                     // Pérou
                case 20: // Cambodge : bleu / rouge / bleu + temple blanc
                    Bands(c, false, C(0x03, 0x2E, 0xA1), C(0xE0, 0x00, 0x25), C(0xE0, 0x00, 0x25), C(0x03, 0x2E, 0xA1));
                    c.Children.Add(Poly(Colors.White, new Point(100, 136), new Point(200, 136), new Point(188, 104),
                        new Point(176, 104), new Point(168, 80), new Point(158, 80), new Point(150, 58), new Point(142, 80),
                        new Point(132, 80), new Point(124, 104), new Point(112, 104)));
                    break;
                case 21: // Corée du Sud : cercle rouge et bleu + traits noirs
                    Add(c, Rect(Colors.White, 300, 200, 0), 0, 0);
                    Add(c, El(C(0xCD, 0x2E, 0x3A), 90, 90), 105, 55);
                    var blue = El(C(0x00, 0x47, 0xA0), 90, 90);
                    blue.Clip = new RectangleGeometry(new Rect(0, 45, 90, 45));
                    Add(c, blue, 105, 55);
                    foreach (var (x, y, a) in new[] { (40.0, 40.0, 34.0), (220.0, 40.0, -34.0), (40.0, 145.0, -34.0), (220.0, 145.0, 34.0) })
                        for (int i = 0; i < 3; i++)
                            Add(c, Rot(Rect(C(0x22, 0x22, 0x22), 42, 6, 1), a), x, y + i * 10);
                    break;
                case 22: // Suisse : croix blanche sur rouge
                    Add(c, Rect(C(0xDA, 0x29, 0x1C), 300, 200, 0), 0, 0);
                    Add(c, Rect(Colors.White, 32, 110, 0), 134, 45);
                    Add(c, Rect(Colors.White, 110, 32, 0), 95, 84);
                    break;
                case 23: Bands(c, true, C(0x14, 0xB5, 0x3A), C(0xFC, 0xD1, 0x16), C(0xCE, 0x11, 0x26)); break;                // Mali
                case 24: // Tunisie : rouge, disque blanc, croissant et étoile rouges
                    Add(c, Rect(C(0xE7, 0x00, 0x13), 300, 200, 0), 0, 0);
                    Add(c, El(Colors.White, 100, 100), 100, 50);
                    Add(c, El(C(0xE7, 0x00, 0x13), 72, 72), 110, 64);
                    Add(c, El(Colors.White, 60, 60), 128, 70);
                    AddStar(c, 142, 74, 44, C(0xE7, 0x00, 0x13));
                    break;
                case 25: // Portugal : vert / rouge + sphère jaune
                    Add(c, Rect(C(0x04, 0x6A, 0x38), 120, 200, 0), 0, 0);
                    Add(c, Rect(C(0xDA, 0x29, 0x1C), 180, 200, 0), 120, 0);
                    Add(c, El(C(0xFF, 0xD1, 0x00), 74, 74), 83, 63);
                    Add(c, Rect(Colors.White, 28, 34, 6), 106, 83);
                    break;
                case 26: // Tanzanie : diagonale jaune et noire entre vert et bleu
                    c.Children.Add(Poly(C(0x1E, 0xB5, 0x3A), new Point(0, 0), new Point(300, 0), new Point(0, 200)));
                    c.Children.Add(Poly(C(0x00, 0xA3, 0xDD), new Point(300, 0), new Point(300, 200), new Point(0, 200)));
                    c.Children.Add(Poly(C(0xFC, 0xD1, 0x16), new Point(0, 160), new Point(0, 200), new Point(60, 200),
                        new Point(300, 40), new Point(300, 0), new Point(240, 0)));
                    c.Children.Add(Poly(C(0x22, 0x22, 0x22), new Point(0, 178), new Point(0, 200), new Point(33, 200),
                        new Point(300, 22), new Point(300, 0), new Point(267, 0)));
                    break;
                case 27: // Chili : blanc / rouge + canton bleu étoilé
                    Add(c, Rect(Colors.White, 300, 100, 0), 0, 0);
                    Add(c, Rect(C(0xD5, 0x2B, 0x1E), 300, 100, 0), 0, 100);
                    Add(c, Rect(C(0x00, 0x39, 0xA6), 100, 100, 0), 0, 0);
                    AddStar(c, 24, 18, 58, Colors.White);
                    break;
                default:
                    goto case 0;
            }
            // Le cadre du drapeau.
            var frame = new Rectangle
            {
                Width = 300,
                Height = 200,
                Stroke = new SolidColorBrush(C(0x4A, 0x3A, 0x5A)),
                StrokeThickness = 6,
                RadiusX = 8,
                RadiusY = 8,
            };
            Add(c, frame, 0, 0);
            return Finish(c, k, size, named);
        }

        private static FrameworkElement Finish(Canvas c, int k, double size, bool named)
        {
            if (!named)
                return new Viewbox { Width = size, Height = size * 2 / 3, Stretch = Stretch.Uniform, Child = c };

            // Le nom du pays dans une petite étiquette arrondie sous le drapeau.
            var label = new Border
            {
                Background = Brushes.White,
                BorderBrush = new SolidColorBrush(C(0x4A, 0x3A, 0x5A)),
                BorderThickness = new Thickness(4),
                CornerRadius = new CornerRadius(26),
                Padding = new Thickness(18, 2, 18, 4),
                Margin = new Thickness(0, 10, 0, 0),
                HorizontalAlignment = HorizontalAlignment.Center,
                Child = new Viewbox
                {
                    StretchDirection = StretchDirection.DownOnly,
                    MaxWidth = 250,
                    Child = new TextBlock
                    {
                        Text = Names[k],
                        FontSize = 44,
                        FontWeight = FontWeights.Bold,
                        Foreground = new SolidColorBrush(C(0x3B, 0x2A, 0x5A)),
                    },
                },
            };
            var stack = new StackPanel { Width = 300 };
            stack.Children.Add(c);
            stack.Children.Add(label);
            // 200 (drapeau) + ~74 (étiquette) : proportions gardées.
            return new Viewbox { Width = size, Height = size * 274 / 300, Stretch = Stretch.Uniform, Child = stack };
        }

        private static void Bands(Canvas c, bool vertical, params Color[] cols)
        {
            double n = cols.Length;
            for (int i = 0; i < cols.Length; i++)
            {
                if (vertical) Add(c, Rect(cols[i], 300 / n + 0.5, 200, 0), i * 300 / n, 0);
                else Add(c, Rect(cols[i], 300, 200 / n + 0.5, 0), 0, i * 200 / n);
            }
        }

        private static void AddStar(Canvas c, double x, double y, double size, Color color)
        {
            var star = new TextBlock
            {
                Text = "★",
                FontSize = size,
                Foreground = new SolidColorBrush(color),
            };
            Add(c, star, x, y);
        }
    }
}
