using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Shapes;
using static MesPremiersJeux.Games.VecKit;

namespace MesPremiersJeux.Games
{
    /// <summary>
    /// Les visages rigolos des « Tartes à la crème », dessinés en vectoriel :
    /// huit personnages (clown, cow-boy, pirate, papi, reine, écolier, chef,
    /// magicien), quatre grimaces « touché ! » (yeux en croix, bouche grande
    /// ouverte), et la tarte. Une image du parent garde toujours la priorité.
    /// </summary>
    public static class FaceArt
    {
        private static readonly Color[] Skins =
        {
            C(0xFF, 0xD9, 0xB8), C(0xF2, 0xC4, 0x9A), C(0xFF, 0xE2, 0xC2), C(0xE8, 0xB4, 0x8A),
        };

        /// <summary>Visage n° kind (0..7) dans un carré « size ».</summary>
        public static FrameworkElement Make(int kind, double size)
        {
            kind = ((kind % 8) + 8) % 8;
            var c = new Canvas { Width = 200, Height = 200 };
            var skin = Skins[kind % Skins.Length];

            // La tête ronde, les joues, le sourire.
            Add(c, El(skin, 150, 150), 25, 35);
            Add(c, El(Color.FromArgb(120, 0xFF, 0x8F, 0xA0), 26, 16), 42, 118);
            Add(c, El(Color.FromArgb(120, 0xFF, 0x8F, 0xA0), 26, 16), 132, 118);
            var smile = new Path
            {
                Stroke = new SolidColorBrush(C(0x7A, 0x4A, 0x30)),
                StrokeThickness = 7,
                StrokeStartLineCap = PenLineCap.Round,
                StrokeEndLineCap = PenLineCap.Round,
                Data = Geometry.Parse("M 75,135 Q 100,158 125,135"),
            };
            c.Children.Add(smile);
            Eye(c, 62, 85);
            Eye(c, 112, 85);

            switch (kind)
            {
                case 0: // clown : nez rouge, houppes bleues, nœud papillon
                    Add(c, El(C(0xE8, 0x3A, 0x3A), 34, 34), 83, 102);
                    Add(c, El(C(0x3B, 0x9B, 0xFF), 44, 40), 10, 48);
                    Add(c, El(C(0x3B, 0x9B, 0xFF), 44, 40), 146, 48);
                    Add(c, Rot(Rect(C(0xFF, 0xC1, 0x07), 50, 22, 6), 0), 75, 180);
                    break;
                case 1: // cow-boy : grand chapeau
                    Add(c, El(C(0x9A, 0x6B, 0x3F), 170, 36), 15, 42);
                    Add(c, Rect(C(0x9A, 0x6B, 0x3F), 90, 46, 14), 55, 8);
                    Add(c, Rect(C(0x6B, 0x45, 0x28), 90, 12, 4), 55, 44);
                    break;
                case 2: // pirate : bandana rouge et cache-œil
                    Add(c, El(C(0xD8, 0x33, 0x44), 150, 70), 25, 28);
                    Add(c, Rot(Rect(C(0xD8, 0x33, 0x44), 54, 20, 8), 25), 150, 60);
                    Add(c, El(C(0x2A, 0x22, 0x30), 40, 40), 105, 78);   // cache-œil
                    Add(c, Rot(Rect(C(0x2A, 0x22, 0x30), 120, 7, 3), -12), 48, 72);
                    break;
                case 3: // papi : cheveux blancs, moustache, lunettes
                    Add(c, El(Colors.White, 46, 34), 20, 48);
                    Add(c, El(Colors.White, 46, 34), 134, 48);
                    Add(c, El(Colors.White, 60, 26), 50, 118);
                    Add(c, El(Colors.White, 60, 26), 92, 118);
                    AddGlasses(c);
                    break;
                case 4: // reine : couronne dorée
                    Add(c, Rect(C(0xFF, 0xC1, 0x07), 110, 30, 6), 45, 22);
                    Add(c, TriUp(C(0xFF, 0xC1, 0x07), 36, 34), 45, -8);
                    Add(c, TriUp(C(0xFF, 0xC1, 0x07), 36, 44), 82, -18);
                    Add(c, TriUp(C(0xFF, 0xC1, 0x07), 36, 34), 119, -8);
                    Add(c, El(C(0xE8, 0x3A, 0x6E), 16, 16), 92, 2);
                    Add(c, El(C(0xB3, 0x6B, 0x2C), 170, 60), 15, 60); // cheveux
                    Add(c, El(skin, 130, 130), 35, 45);
                    Eye(c, 64, 88); Eye(c, 110, 88);
                    RedrawSmile(c, "M 78,132 Q 100,152 122,132");
                    break;
                case 5: // écolier : casquette verte et taches de rousseur
                    Add(c, El(C(0x58, 0xC0, 0x6B), 120, 60), 40, 20);
                    Add(c, Rect(C(0x44, 0x9A, 0x55), 70, 16, 8), 120, 52);
                    for (int i = 0; i < 3; i++)
                    {
                        Add(c, El(C(0xC8, 0x8A, 0x5A), 7, 7), 70 + i * 10, 112);
                        Add(c, El(C(0xC8, 0x8A, 0x5A), 7, 7), 115 + i * 10, 112);
                    }
                    break;
                case 6: // chef : toque blanche
                    Add(c, Rect(Colors.White, 96, 44, 10), 52, 18);
                    Add(c, El(Colors.White, 54, 46), 40, 0);
                    Add(c, El(Colors.White, 54, 52), 73, -8);
                    Add(c, El(Colors.White, 54, 46), 106, 0);
                    Add(c, El(C(0x8A, 0x5A, 0x3A), 44, 18), 78, 150); // moustache fine
                    break;
                default: // magicien : haut-de-forme et nœud violet
                    Add(c, El(C(0x2A, 0x22, 0x30), 150, 30), 25, 42);
                    Add(c, Rect(C(0x2A, 0x22, 0x30), 84, 52, 8), 58, 0);
                    Add(c, Rect(C(0xA0, 0x6C, 0xD5), 84, 12, 4), 58, 38);
                    break;
            }
            return Box(c, size);
        }

        /// <summary>Grimace « touché ! » n° kind (0..3) : yeux en croix, bouche
        /// grande ouverte, étoiles — juste après la tarte.</summary>
        public static FrameworkElement Hit(int kind, double size)
        {
            kind = ((kind % 4) + 4) % 4;
            var c = new Canvas { Width = 200, Height = 200 };
            var skin = Skins[kind];

            Add(c, El(skin, 150, 150), 25, 35);
            // Mèches décoiffées par l'impact.
            Add(c, Rot(El(Shade(skin, 0.75), 30, 12), -30), 35, 30);
            Add(c, Rot(El(Shade(skin, 0.75), 30, 12), 20), 135, 28);
            CrossEye(c, 58, 82);
            CrossEye(c, 116, 82);
            // Bouche grande ouverte de surprise.
            Add(c, El(C(0x7A, 0x30, 0x30), 44, 54), 78, 118);
            Add(c, El(C(0xE8, 0x6A, 0x6A), 26, 18), 87, 150);
            // Petites étoiles qui tournent autour de la tête.
            foreach (var (x, y, s) in new[] { (12.0, 60.0, 26.0), (165.0, 50.0, 22.0), (150.0, 160.0, 20.0) })
            {
                var star = new TextBlock { Text = "✦", FontSize = s, Foreground = new SolidColorBrush(C(0xFF, 0xC1, 0x07)) };
                Add(c, star, x, y);
            }
            return Box(c, size);
        }

        /// <summary>La tarte à la crème qui vole.</summary>
        public static FrameworkElement Pie(double size)
        {
            var c = new Canvas { Width = 200, Height = 200 };
            // Moule / croûte.
            Add(c, El(C(0xC8, 0x8A, 0x4A), 170, 70), 15, 100);
            Add(c, El(C(0xE8, 0xB0, 0x6A), 160, 50), 20, 98);
            // La crème moussante (nuage de boules blanches).
            var cream = C(0xFF, 0xFA, 0xEE);
            foreach (var (x, y, w, h) in new[]
            {
                (30.0, 80.0, 60.0, 50.0), (70.0, 60.0, 70.0, 60.0), (115.0, 78.0, 58.0, 50.0),
                (50.0, 95.0, 110.0, 45.0), (20.0, 95.0, 50.0, 38.0), (135.0, 95.0, 48.0, 38.0),
            })
                Add(c, El(cream, w, h), x, y);
            // La cerise.
            Add(c, El(C(0xE8, 0x3A, 0x3A), 28, 28), 88, 48);
            Add(c, El(Color.FromArgb(160, 255, 255, 255), 10, 10), 94, 53);
            return Box(c, size);
        }

        private static void AddGlasses(Canvas c)
        {
            var col = C(0x4A, 0x3A, 0x5A);
            foreach (var x in new[] { 52.0, 102.0 })
            {
                var ring = new Ellipse { Width = 46, Height = 46, Stroke = new SolidColorBrush(col), StrokeThickness = 6 };
                Add(c, ring, x, 76);
            }
            Add(c, Rect(col, 12, 6, 2), 95, 94);
        }

        private static void RedrawSmile(Canvas c, string data)
        {
            var smile = new Path
            {
                Stroke = new SolidColorBrush(C(0x7A, 0x4A, 0x30)),
                StrokeThickness = 7,
                StrokeStartLineCap = PenLineCap.Round,
                StrokeEndLineCap = PenLineCap.Round,
                Data = Geometry.Parse(data),
            };
            c.Children.Add(smile);
        }
    }
}
