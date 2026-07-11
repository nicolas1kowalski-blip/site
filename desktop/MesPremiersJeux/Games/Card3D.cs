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
    /// Carte 3D : un quad texturé (emoji au recto, étoile au verso) qui pivote
    /// autour de l'axe vertical pour se retourner. Sert au jeu de mémoire (face
    /// cachée puis révélée) et aux familles (face visible).
    /// </summary>
    public sealed class Card3D
    {
        public readonly Viewport3D Viewport;
        private readonly AxisAngleRotation3D _rot;
        private bool _up;

        public Card3D(string glyph, Color? frontBg = null)
        {
            var front = Face(glyph, frontBg ?? Colors.White);
            var back = Face("⭐", Color.FromRgb(0x8A, 0x6C, 0xE0));

            var model = new GeometryModel3D(Quad(),
                new DiffuseMaterial(new ImageBrush(front)))
            {
                BackMaterial = new DiffuseMaterial(new ImageBrush(back)),
            };
            _rot = new AxisAngleRotation3D(new Vector3D(0, 1, 0), 180); // recto caché au départ
            model.Transform = new RotateTransform3D(_rot);

            var group = new Model3DGroup();
            group.Children.Add(new AmbientLight(Colors.White)); // carte « à plat », non ombrée
            group.Children.Add(model);

            Viewport = new Viewport3D
            {
                IsHitTestVisible = false,
                Camera = new PerspectiveCamera(new Point3D(0, 0, 4.2), new Vector3D(0, 0, -1), new Vector3D(0, 1, 0), 45),
            };
            Viewport.Children.Add(new ModelVisual3D { Content = group });
        }

        /// <summary>Retourne la carte (recto visible si up).</summary>
        public void Flip(bool up)
        {
            if (_up == up) return;
            _up = up;
            _rot.BeginAnimation(AxisAngleRotation3D.AngleProperty,
                new DoubleAnimation(_rot.Angle, up ? 0 : 180, TimeSpan.FromMilliseconds(320)));
        }

        /// <summary>Fixe la carte recto visible sans animation.</summary>
        public void ShowFront()
        {
            _up = true;
            _rot.Angle = 0;
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

        // Rend une face de carte (fond arrondi + emoji) dans un bitmap ; on passe
        // par un TextBlock qui, lui, rend correctement les emojis en couleur.
        private static BitmapSource Face(string glyph, Color bg)
        {
            const int w = 256, h = 358;
            var grid = new Grid { Width = w, Height = h };
            grid.Children.Add(new Border
            {
                Background = new SolidColorBrush(bg),
                CornerRadius = new CornerRadius(28),
                BorderBrush = new SolidColorBrush(Color.FromRgb(0x2B, 0x2D, 0x42)),
                BorderThickness = new Thickness(6),
            });
            grid.Children.Add(new TextBlock
            {
                Text = glyph,
                FontSize = 150,
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
            });
            grid.Measure(new Size(w, h));
            grid.Arrange(new Rect(0, 0, w, h));
            var rtb = new RenderTargetBitmap(w, h, 96, 96, PixelFormats.Pbgra32);
            rtb.Render(grid);
            rtb.Freeze();
            return rtb;
        }
    }
}
