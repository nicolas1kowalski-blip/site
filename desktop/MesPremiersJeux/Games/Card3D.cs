using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Media.Imaging;
using System.Windows.Media.Media3D;

namespace MesPremiersJeux.Games
{
    /// <summary>
    /// Carte 3D : un quad texturé (jolie carte pastel décorée au recto, carte
    /// « magique » au verso) qui pivote autour de l'axe vertical pour se retourner.
    /// Le recto peut être un emoji ou un dessin cartoon vectoriel.
    /// </summary>
    public sealed class Card3D
    {
        public readonly Viewport3D Viewport;
        private readonly AxisAngleRotation3D _rot;
        private bool _up;

        private static readonly Color[] Pastels =
        {
            Color.FromRgb(0xFF, 0xC9, 0xE0), Color.FromRgb(0xC9, 0xE7, 0xFF), Color.FromRgb(0xFF, 0xE6, 0xB3),
            Color.FromRgb(0xD8, 0xC9, 0xFF), Color.FromRgb(0xC9, 0xF5, 0xD8), Color.FromRgb(0xFF, 0xD3, 0xC2),
        };

        public Card3D(string glyph, Color? frontBg = null)
            : this(GlyphElement(glyph), frontBg ?? PastelFor(glyph)) { }

        public Card3D(UIElement art, string key, Color? frontBg = null)
            : this(art, frontBg ?? PastelFor(key)) { }

        private Card3D(UIElement frontArt, Color bg)
        {
            var front = Face(frontArt, bg);
            var back = Face(GlyphElement("⭐"), Color.FromRgb(0x9A, 0x6C, 0xE0));

            var model = new GeometryModel3D(Quad(), new DiffuseMaterial(new ImageBrush(front)))
            {
                BackMaterial = new DiffuseMaterial(new ImageBrush(back)),
            };
            _rot = new AxisAngleRotation3D(new Vector3D(0, 1, 0), 180); // recto caché au départ
            model.Transform = new RotateTransform3D(_rot);

            var group = new Model3DGroup();
            group.Children.Add(new AmbientLight(Colors.White));
            group.Children.Add(model);

            Viewport = new Viewport3D
            {
                IsHitTestVisible = false,
                Camera = new PerspectiveCamera(new Point3D(0, 0, 4.2), new Vector3D(0, 0, -1), new Vector3D(0, 1, 0), 45),
            };
            Viewport.Children.Add(new ModelVisual3D { Content = group });
        }

        public void Flip(bool up)
        {
            if (_up == up) return;
            _up = up;
            _rot.BeginAnimation(AxisAngleRotation3D.AngleProperty,
                new DoubleAnimation(_rot.Angle, up ? 0 : 180, TimeSpan.FromMilliseconds(320)));
        }

        public void ShowFront()
        {
            _up = true;
            _rot.Angle = 0;
        }

        private static UIElement GlyphElement(string glyph) => new TextBlock
        {
            Text = glyph,
            FontSize = 100,
            HorizontalAlignment = HorizontalAlignment.Center,
            VerticalAlignment = VerticalAlignment.Center,
        };

        private static Color PastelFor(string glyph)
        {
            int h = 0;
            foreach (char c in glyph) h = h * 31 + c;
            return Pastels[Math.Abs(h) % Pastels.Length];
        }

        private static MeshGeometry3D Quad()
        {
            var m = new MeshGeometry3D();
            m.Positions.Add(new Point3D(-1, -1.4, 0));
            m.Positions.Add(new Point3D(1, -1.4, 0));
            m.Positions.Add(new Point3D(1, 1.4, 0));
            m.Positions.Add(new Point3D(-1, 1.4, 0));
            m.TextureCoordinates.Add(new Point(0, 1));
            m.TextureCoordinates.Add(new Point(1, 1));
            m.TextureCoordinates.Add(new Point(1, 0));
            m.TextureCoordinates.Add(new Point(0, 0));
            for (int i = 0; i < 4; i++) m.Normals.Add(new Vector3D(0, 0, 1));
            m.TriangleIndices.Add(0); m.TriangleIndices.Add(1); m.TriangleIndices.Add(2);
            m.TriangleIndices.Add(0); m.TriangleIndices.Add(2); m.TriangleIndices.Add(3);
            m.Freeze();
            return m;
        }

        private static Color Lighten(Color c, double a) => Mix(c, Colors.White, a);
        private static Color Darken(Color c, double a) => Mix(c, Colors.Black, a);
        private static Color Mix(Color c, Color t, double a) => Color.FromRgb(
            (byte)(c.R + (t.R - c.R) * a), (byte)(c.G + (t.G - c.G) * a), (byte)(c.B + (t.B - c.B) * a));

        // Jolie face de carte (fond pastel dégradé, cadre, panneau doux, paillettes)
        // avec le dessin mis à l'échelle pour occuper une grande part de la carte.
        private static BitmapSource Face(UIElement content, Color bg)
        {
            const int w = 384, h = 536;
            var root = new Grid { Width = w, Height = h };

            root.Children.Add(new Border
            {
                Background = new LinearGradientBrush(Lighten(bg, 0.55), bg, 90),
                CornerRadius = new CornerRadius(46),
                BorderBrush = new SolidColorBrush(Darken(bg, 0.28)),
                BorderThickness = new Thickness(12),
            });
            root.Children.Add(new Border
            {
                Margin = new Thickness(26),
                Background = new SolidColorBrush(Color.FromArgb(0x66, 0xFF, 0xFF, 0xFF)),
                CornerRadius = new CornerRadius(34),
            });

            void Sparkle(double x, double y, double r, byte a)
            {
                var e = new System.Windows.Shapes.Ellipse
                {
                    Width = r * 2,
                    Height = r * 2,
                    Fill = new SolidColorBrush(Color.FromArgb(a, 0xFF, 0xFF, 0xFF)),
                    HorizontalAlignment = HorizontalAlignment.Left,
                    VerticalAlignment = VerticalAlignment.Top,
                    Margin = new Thickness(x, y, 0, 0),
                };
                root.Children.Add(e);
            }
            Sparkle(46, 54, 12, 0xCC); Sparkle(312, 84, 8, 0xB0);
            Sparkle(60, 452, 9, 0xB0); Sparkle(322, 470, 13, 0xCC);

            root.Children.Add(new Viewbox
            {
                Child = content,
                Stretch = Stretch.Uniform,
                Margin = new Thickness(48, 60, 48, 60),
            });

            root.Measure(new Size(w, h));
            root.Arrange(new Rect(0, 0, w, h));
            var rtb = new RenderTargetBitmap(w, h, 96, 96, PixelFormats.Pbgra32);
            rtb.Render(root);
            rtb.Freeze();
            return rtb;
        }
    }
}
