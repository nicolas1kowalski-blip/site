using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Media.Media3D;

namespace MesPremiersJeux.Games
{
    /// <summary>Fabrique un ballon 3D en forme de goutte (corps renflé + col + nœud),
    /// obtenu par révolution d'un profil. Le pinceau diffus est renvoyé pour recolorer.</summary>
    public static class Balloon3D
    {
        // Profil du ballon (rayon, hauteur), du nœud (bas) vers le sommet.
        private static readonly Point[] Profile =
        {
            new Point(0.00, -1.35), // pointe du nœud
            new Point(0.10, -1.18), // renflement du nœud
            new Point(0.05, -1.02), // col pincé
            new Point(0.32, -0.82),
            new Point(0.63, -0.52),
            new Point(0.86, -0.14),
            new Point(0.95,  0.26),
            new Point(0.85,  0.63),
            new Point(0.60,  0.95),
            new Point(0.31,  1.16),
            new Point(0.00,  1.30), // sommet
        };

        private static MeshGeometry3D Lathe(Point[] profile, int slices)
        {
            var m = new MeshGeometry3D();
            for (int i = 0; i < profile.Length; i++)
            {
                double r = profile[i].X, y = profile[i].Y;
                for (int j = 0; j <= slices; j++)
                {
                    double u = 2 * Math.PI * j / slices;
                    m.Positions.Add(new Point3D(r * Math.Cos(u), y, r * Math.Sin(u)));
                }
            }
            int ring = slices + 1;
            for (int i = 0; i < profile.Length - 1; i++)
                for (int j = 0; j < slices; j++)
                {
                    int a = i * ring + j, b = a + 1, c = a + ring, d = c + 1;
                    m.TriangleIndices.Add(a); m.TriangleIndices.Add(c); m.TriangleIndices.Add(b);
                    m.TriangleIndices.Add(b); m.TriangleIndices.Add(c); m.TriangleIndices.Add(d);
                }
            m.Freeze();
            return m;
        }

        private static readonly MeshGeometry3D BalloonMesh = Lathe(Profile, 30);

        public static Viewport3D MakeBalloon(out SolidColorBrush diffuse)
        {
            diffuse = new SolidColorBrush(Colors.Red);
            var mat = new MaterialGroup();
            mat.Children.Add(new DiffuseMaterial(diffuse));
            mat.Children.Add(new SpecularMaterial(new SolidColorBrush(Color.FromArgb(220, 255, 255, 255)), 50));

            var model = new GeometryModel3D(BalloonMesh, mat) { BackMaterial = new DiffuseMaterial(diffuse) };
            var rot = new AxisAngleRotation3D(new Vector3D(0, 1, 0), 0);
            model.Transform = new RotateTransform3D(rot);

            var group = new Model3DGroup();
            group.Children.Add(new AmbientLight(Color.FromRgb(0x5A, 0x5A, 0x5A)));
            group.Children.Add(new DirectionalLight(Colors.White, new Vector3D(-0.4, -0.6, -1)));
            group.Children.Add(model);

            var vp = new Viewport3D
            {
                IsHitTestVisible = false, // le bouton parent capte le regard
                Camera = new PerspectiveCamera(new Point3D(0, 0, 4.6), new Vector3D(0, 0, -1), new Vector3D(0, 1, 0), 45),
            };
            vp.Children.Add(new ModelVisual3D { Content = group });

            // Léger balancement (plutôt qu'une rotation complète : plus « ballon »).
            var sway = new DoubleAnimationUsingKeyFrames { RepeatBehavior = RepeatBehavior.Forever, Duration = TimeSpan.FromSeconds(4) };
            sway.KeyFrames.Add(new LinearDoubleKeyFrame(-14, KeyTime.FromPercent(0)));
            sway.KeyFrames.Add(new LinearDoubleKeyFrame(14, KeyTime.FromPercent(0.5)));
            sway.KeyFrames.Add(new LinearDoubleKeyFrame(-14, KeyTime.FromPercent(1)));
            rot.BeginAnimation(AxisAngleRotation3D.AngleProperty, sway);
            return vp;
        }
    }
}
