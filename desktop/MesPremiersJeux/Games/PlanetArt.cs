using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Shapes;
using static MesPremiersJeux.Games.VecKit;

namespace MesPremiersJeux.Games
{
    /// <summary>
    /// Le système solaire dessiné en vectoriel TRÈS coloré, façon dessin animé :
    /// chaque astre a un VISAGE rigolo (grands yeux + sourire). Index :
    /// 0 Soleil · 1 Mercure · 2 Vénus · 3 Terre · 4 Mars · 5 Jupiter ·
    /// 6 Saturne (anneaux !) · 7 Uranus · 8 Neptune.
    /// </summary>
    public static class PlanetArt
    {
        public static FrameworkElement Make(int kind, double size)
        {
            var c = new Canvas { Width = 240, Height = 240 };
            switch (((kind % 9) + 9) % 9)
            {
                case 0: Soleil(c); break;
                case 1: Ball(c, C(0xB8, 0xA8, 0x98), craters: true); break;
                case 2: Venus(c); break;
                case 3: Terre(c); break;
                case 4: Mars(c); break;
                case 5: Jupiter(c); break;
                case 6: Saturne(c); break;
                case 7: Uranus(c); break;
                default: Neptune(c); break;
            }
            return new Viewbox { Width = size, Height = size, Stretch = Stretch.Uniform, Child = c };
        }

        // ------------------------------------------------------------------
        private static void Soleil(Canvas c)
        {
            // Rayons tournants + cœur doré + visage.
            for (int i = 0; i < 12; i++)
                Add(c, Rot(TriUp(C(0xFF, 0xB3, 0x2C), 26, 40), i * 30),
                    120 + 104 * Math.Sin(i * Math.PI / 6) - 13,
                    120 - 104 * Math.Cos(i * Math.PI / 6) - 20);
            Add(c, El(C(0xFF, 0xD9, 0x3C), 170, 170), 35, 35);
            Add(c, El(C(0xFF, 0xE8, 0x8A), 130, 130), 55, 55);
            Face(c, 120, 118, 1.1);
            Cheeks(c, 120, 142, 1.1, C(0xFF, 0x9F, 0x45));
        }

        private static void Ball(Canvas c, Color col, bool craters)
        {
            Add(c, El(col, 170, 170), 35, 35);
            Add(c, El(Shade(col, 1.12), 120, 120), 48, 48);
            if (craters)
            {
                Add(c, El(Shade(col, 0.8), 34, 30), 62, 140);
                Add(c, El(Shade(col, 0.8), 24, 22), 150, 60);
                Add(c, El(Shade(col, 0.8), 20, 18), 142, 150);
            }
            Face(c, 120, 112, 1.0);
        }

        private static void Venus(Canvas c)
        {
            var gold = C(0xF2, 0xC7, 0x6B);
            Add(c, El(gold, 170, 170), 35, 35);
            Add(c, Rot(El(Shade(gold, 0.88), 150, 26), -12), 44, 76);
            Add(c, Rot(El(Shade(gold, 1.1), 130, 22), -12), 62, 136);
            Face(c, 120, 112, 1.0);
            Cheeks(c, 120, 138, 1.0, C(0xE8, 0x8A, 0x5A));
        }

        private static void Terre(Canvas c)
        {
            Add(c, El(C(0x3B, 0x9B, 0xFF), 170, 170), 35, 35);
            // Continents verts.
            Add(c, Rot(El(C(0x6B, 0xCB, 0x77), 70, 52), 20), 50, 60);
            Add(c, Rot(El(C(0x6B, 0xCB, 0x77), 56, 42), -15), 130, 120);
            Add(c, El(C(0x6B, 0xCB, 0x77), 34, 26), 90, 160);
            // Petits nuages.
            Add(c, El(Color.FromArgb(170, 255, 255, 255), 50, 18), 120, 58);
            Add(c, El(Color.FromArgb(170, 255, 255, 255), 40, 15), 55, 140);
            Face(c, 120, 108, 1.0);
            Cheeks(c, 120, 134, 1.0, C(0xFF, 0x8F, 0xA8));
        }

        private static void Mars(Canvas c)
        {
            var red = C(0xE8, 0x6A, 0x3C);
            Add(c, El(red, 170, 170), 35, 35);
            Add(c, El(Shade(red, 0.82), 44, 34), 60, 130);
            Add(c, El(Shade(red, 0.82), 30, 24), 150, 70);
            Add(c, El(Colors.White, 60, 26), 90, 38); // calotte de glace
            Face(c, 120, 112, 1.0);
        }

        private static void Jupiter(Canvas c)
        {
            var cream = C(0xF2, 0xD9, 0xB0);
            Add(c, El(cream, 190, 190), 25, 25);
            foreach (var (y, col, hgt) in new[]
            {
                (58.0, C(0xE8, 0xA8, 0x6A), 24.0), (96.0, C(0xD9, 0x8A, 0x55), 20.0),
                (150.0, C(0xE8, 0xA8, 0x6A), 26.0), (186.0, C(0xD9, 0x8A, 0x55), 16.0),
            })
                Add(c, El(col, 170 - Math.Abs(y - 120), hgt), 120 - (170 - Math.Abs(y - 120)) / 2, y);
            Add(c, El(C(0xD5, 0x5A, 0x3C), 40, 28), 140, 142); // la grande tache rouge
            Face(c, 120, 100, 1.1);
        }

        private static void Saturne(Canvas c)
        {
            var gold = C(0xF2, 0xC7, 0x6B);
            // Anneaux derrière…
            Add(c, Rot(Ring(C(0xC9, 0xA2, 0xE8), 230, 90, 18), -18), 5, 80);
            Add(c, El(gold, 150, 150), 45, 45);
            Add(c, Rot(El(Shade(gold, 0.88), 130, 20), -10), 55, 90);
            // … et le devant des anneaux PAR-DESSUS la planète.
            Add(c, Rot(Arc(C(0xB3, 0x88, 0xFF), 230, 90, 18), -18), 5, 80);
            Face(c, 120, 100, 0.95);
            Cheeks(c, 120, 124, 0.95, C(0xE8, 0x8A, 0x5A));
        }

        private static void Uranus(Canvas c)
        {
            var teal = C(0x7A, 0xD9, 0xD9);
            Add(c, Rot(Ring(C(0xA8, 0xC8, 0xE8), 110, 220, 10), 12), 65, 10);
            Add(c, El(teal, 160, 160), 40, 40);
            Add(c, El(Shade(teal, 1.1), 110, 110), 55, 55);
            Face(c, 120, 112, 1.0);
        }

        private static void Neptune(Canvas c)
        {
            var blue = C(0x3B, 0x6B, 0xE8);
            Add(c, El(blue, 170, 170), 35, 35);
            Add(c, Rot(El(Shade(blue, 1.25), 130, 22), -8), 55, 80);
            Add(c, Rot(El(Shade(blue, 0.8), 90, 18), -8), 90, 150);
            Face(c, 120, 112, 1.0);
        }

        // ------------------------------------------------------------------
        //  Le visage rigolo (yeux brillants + sourire) et les joues.
        // ------------------------------------------------------------------
        private static void Face(Canvas c, double cx, double cy, double s)
        {
            Eye(c, cx - 38 * s, cy - 14 * s, 30 * s);
            Eye(c, cx + 8 * s, cy - 14 * s, 30 * s);
            var smile = new System.Windows.Shapes.Path
            {
                Stroke = new SolidColorBrush(C(0x4A, 0x3A, 0x3A)),
                StrokeThickness = 6 * s,
                StrokeStartLineCap = PenLineCap.Round,
                StrokeEndLineCap = PenLineCap.Round,
                Data = Geometry.Parse(FormattableString.Invariant(
                    $"M {cx - 22 * s},{cy + 26 * s} Q {cx},{cy + 44 * s} {cx + 22 * s},{cy + 26 * s}")),
            };
            c.Children.Add(smile);
        }

        private static void Cheeks(Canvas c, double cx, double cy, double s, Color col)
        {
            Add(c, El(Color.FromArgb(150, col.R, col.G, col.B), 22 * s, 14 * s), cx - 62 * s, cy);
            Add(c, El(Color.FromArgb(150, col.R, col.G, col.B), 22 * s, 14 * s), cx + 40 * s, cy);
        }

        private static Ellipse Ring(Color col, double w, double h, double thick) => new Ellipse
        {
            Width = w,
            Height = h,
            Stroke = new SolidColorBrush(col),
            StrokeThickness = thick,
        };

        // Demi-anneau (le devant, dessiné par-dessus la planète) : un anneau
        // dont la moitié haute est rognée.
        private static FrameworkElement Arc(Color col, double w, double h, double thick)
        {
            var ring = Ring(col, w, h, thick);
            var host = new Canvas { Width = w, Height = h, ClipToBounds = false };
            host.Clip = new RectangleGeometry(new Rect(0, h / 2, w, h / 2 + thick));
            host.Children.Add(ring);
            return host;
        }
    }
}
