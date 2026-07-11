using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Media.Media3D;

namespace MesPremiersJeux.Games
{
    /// <summary>Fabrique un ballon 3D (WPF Viewport3D) : sphère éclairée, brillante,
    /// en rotation douce. Le pinceau diffus est renvoyé pour pouvoir recolorer.</summary>
    public static class Balloon3D
    {
        private static MeshGeometry3D Sphere(int stacks, int slices, double rx, double ry, double rz)
        {
            var m = new MeshGeometry3D();
            for (int i = 0; i <= stacks; i++)
            {
                double v = Math.PI * i / stacks;
                double y = Math.Cos(v), r = Math.Sin(v);
                for (int j = 0; j <= slices; j++)
                {
                    double u = 2 * Math.PI * j / slices;
                    double x = r * Math.Cos(u), z = r * Math.Sin(u);
                    m.Positions.Add(new Point3D(x * rx, y * ry, z * rz));
                    m.Normals.Add(new Vector3D(x, y, z));
                }
            }
            for (int i = 0; i < stacks; i++)
                for (int j = 0; j < slices; j++)
                {
                    int a = i * (slices + 1) + j, b = a + slices + 1;
                    m.TriangleIndices.Add(a); m.TriangleIndices.Add(b); m.TriangleIndices.Add(a + 1);
                    m.TriangleIndices.Add(b); m.TriangleIndices.Add(b + 1); m.TriangleIndices.Add(a + 1);
                }
            m.Freeze();
            return m;
        }

        private static readonly MeshGeometry3D BalloonMesh = Sphere(18, 26, 0.92, 1.16, 0.92);

        public static Viewport3D MakeBalloon(out SolidColorBrush diffuse)
        {
            diffuse = new SolidColorBrush(Colors.Red);
            var mat = new MaterialGroup();
            mat.Children.Add(new DiffuseMaterial(diffuse));
            mat.Children.Add(new SpecularMaterial(new SolidColorBrush(Color.FromArgb(200, 255, 255, 255)), 40));

            var model = new GeometryModel3D(BalloonMesh, mat);
            var rot = new AxisAngleRotation3D(new Vector3D(0, 1, 0), 0);
            model.Transform = new RotateTransform3D(rot);

            var group = new Model3DGroup();
            group.Children.Add(new AmbientLight(Color.FromRgb(0x6E, 0x6E, 0x6E)));
            group.Children.Add(new DirectionalLight(Colors.White, new Vector3D(-0.4, -0.7, -1)));
            group.Children.Add(model);

            var vp = new Viewport3D
            {
                IsHitTestVisible = false, // le bouton parent capte le regard
                Camera = new PerspectiveCamera(new Point3D(0, 0, 4.3), new Vector3D(0, 0, -1), new Vector3D(0, 1, 0), 45),
            };
            vp.Children.Add(new ModelVisual3D { Content = group });

            var spin = new DoubleAnimation(0, 360, TimeSpan.FromSeconds(6)) { RepeatBehavior = RepeatBehavior.Forever };
            rot.BeginAnimation(AxisAngleRotation3D.AngleProperty, spin);
            return vp;
        }
    }
}
