using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Shapes;
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
            { "France", "Angleterre", "Italie", "Égypte", "Russie", "Chine", "Japon", "Amérique" };

        /// <summary>Le drapeau (largeur « size ») avec le NOM DU PAYS écrit
        /// dessous ; named = false pour le drapeau seul.</summary>
        public static FrameworkElement Make(int kind, double size, bool named = true)
        {
            int k = ((kind % 8) + 8) % 8;
            var c = new Canvas { Width = 300, Height = 200 };
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
                default: // États-Unis : bandes + canton étoilé (simplifié)
                    for (int i = 0; i < 7; i++)
                        Add(c, Rect(i % 2 == 0 ? C(0xB2, 0x22, 0x34) : Colors.White, 300, 29, 0), 0, i * 29);
                    Add(c, Rect(C(0x3C, 0x3B, 0x6E), 130, 115, 0), 0, 0);
                    for (int r = 0; r < 3; r++)
                        for (int col = 0; col < 4; col++)
                            AddStar(c, 10 + col * 30, 8 + r * 34, 18, Colors.White);
                    break;
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
                Child = new TextBlock
                {
                    Text = Names[k],
                    FontSize = 44,
                    FontWeight = FontWeights.Bold,
                    Foreground = new SolidColorBrush(C(0x3B, 0x2A, 0x5A)),
                },
            };
            var stack = new StackPanel { Width = 300 };
            stack.Children.Add(c);
            stack.Children.Add(label);
            // 200 (drapeau) + ~74 (étiquette) : proportions gardées.
            return new Viewbox { Width = size, Height = size * 274 / 300, Stretch = Stretch.Uniform, Child = stack };
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
