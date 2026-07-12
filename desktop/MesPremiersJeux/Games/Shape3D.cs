using System;
using System.Collections.Generic;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Media.Media3D;

namespace MesPremiersJeux.Games
{
    /// <summary>
    /// Boîte à outils 3D partagée par les jeux : maillages (sphère, cube, prismes
    /// extrudés) et fabrique de vues 3D éclairées, inclinées et en rotation douce.
    /// Les normales sont laissées à WPF (calcul automatique) et un éclairage
    /// ambiant + les deux faces garantissent que la forme reste toujours visible.
    /// </summary>
    public static class Shape3D
    {
        // --- Maillages ---
        public static MeshGeometry3D Sphere(int stacks = 18, int slices = 26, double r = 1.0)
        {
            var m = new MeshGeometry3D();
            for (int i = 0; i <= stacks; i++)
            {
                double v = Math.PI * i / stacks, y = Math.Cos(v), rr = Math.Sin(v);
                for (int j = 0; j <= slices; j++)
                {
                    double u = 2 * Math.PI * j / slices, x = rr * Math.Cos(u), z = rr * Math.Sin(u);
                    m.Positions.Add(new Point3D(x * r, y * r, z * r));
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

        public static MeshGeometry3D Box(double w = 1.5, double h = 1.5, double d = 1.5)
        {
            double x = w / 2, y = h / 2, z = d / 2;
            var p = new[]
            {
                new Point3D(-x,-y, z), new Point3D( x,-y, z), new Point3D( x, y, z), new Point3D(-x, y, z), // avant
                new Point3D(-x,-y,-z), new Point3D( x,-y,-z), new Point3D( x, y,-z), new Point3D(-x, y,-z), // arrière
            };
            var m = new MeshGeometry3D();
            foreach (var pt in p) m.Positions.Add(pt);
            void Quad(int a, int b, int c, int dd)
            { m.TriangleIndices.Add(a); m.TriangleIndices.Add(b); m.TriangleIndices.Add(c);
              m.TriangleIndices.Add(a); m.TriangleIndices.Add(c); m.TriangleIndices.Add(dd); }
            Quad(0, 1, 2, 3); Quad(1, 5, 6, 2); Quad(5, 4, 7, 6);
            Quad(4, 0, 3, 7); Quad(3, 2, 6, 7); Quad(4, 5, 1, 0);
            m.Freeze();
            return m;
        }

        /// <summary>Prisme obtenu en extrudant un polygone 2D (points normalisés ~[-1,1]).</summary>
        public static MeshGeometry3D ExtrudedPolygon(IList<Point> pts, double depth = 0.55)
        {
            var m = new MeshGeometry3D();
            double hz = depth / 2;
            int n = pts.Count;

            // Centre (pour trianguler en éventail).
            double cx = 0, cy = 0;
            foreach (var p in pts) { cx += p.X; cy += p.Y; }
            cx /= n; cy /= n;

            int frontCenter = 0;
            m.Positions.Add(new Point3D(cx, cy, hz));
            for (int i = 0; i < n; i++) m.Positions.Add(new Point3D(pts[i].X, pts[i].Y, hz)); // 1..n
            int backCenter = n + 1;
            m.Positions.Add(new Point3D(cx, cy, -hz));
            for (int i = 0; i < n; i++) m.Positions.Add(new Point3D(pts[i].X, pts[i].Y, -hz)); // n+2 ..

            for (int i = 0; i < n; i++)
            {
                int a = 1 + i, b = 1 + (i + 1) % n;
                m.TriangleIndices.Add(frontCenter); m.TriangleIndices.Add(a); m.TriangleIndices.Add(b);      // face avant
                int ba = backCenter + 1 + i, bb = backCenter + 1 + (i + 1) % n;
                m.TriangleIndices.Add(backCenter); m.TriangleIndices.Add(bb); m.TriangleIndices.Add(ba);      // face arrière
                // paroi latérale (quad a,b,bb,ba)
                m.TriangleIndices.Add(a); m.TriangleIndices.Add(ba); m.TriangleIndices.Add(b);
                m.TriangleIndices.Add(b); m.TriangleIndices.Add(ba); m.TriangleIndices.Add(bb);
            }
            m.Freeze();
            return m;
        }

        // --- Contours 2D normalisés ---
        public static List<Point> TrianglePoints() => new List<Point>
            { new Point(0, 1), new Point(0.9, -0.7), new Point(-0.9, -0.7) };

        public static List<Point> StarPoints()
        {
            var pts = new List<Point>();
            for (int i = 0; i < 10; i++)
            {
                double ang = -Math.PI / 2 + i * Math.PI / 5;
                double r = i % 2 == 0 ? 1.0 : 0.45;
                pts.Add(new Point(Math.Cos(ang) * r, Math.Sin(ang) * r));
            }
            return pts;
        }

        public static List<Point> HeartPoints()
        {
            var raw = new List<Point>();
            for (int i = 0; i < 28; i++)
            {
                double t = 2 * Math.PI * i / 28;
                double x = 16 * Math.Pow(Math.Sin(t), 3);
                double y = 13 * Math.Cos(t) - 5 * Math.Cos(2 * t) - 2 * Math.Cos(3 * t) - Math.Cos(4 * t);
                raw.Add(new Point(x, y));
            }
            // Normalisation dans ~[-1,1], centré.
            double minX = double.MaxValue, maxX = double.MinValue, minY = double.MaxValue, maxY = double.MinValue;
            foreach (var p in raw) { minX = Math.Min(minX, p.X); maxX = Math.Max(maxX, p.X); minY = Math.Min(minY, p.Y); maxY = Math.Max(maxY, p.Y); }
            double cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
            double scale = 1.0 / Math.Max((maxX - minX) / 2, (maxY - minY) / 2);
            var res = new List<Point>();
            foreach (var p in raw) res.Add(new Point((p.X - cx) * scale, (p.Y - cy) * scale));
            return res;
        }

        public static MeshGeometry3D ShapeMesh(string name)
        {
            switch (name)
            {
                case "rond": return Sphere(20, 28, 1.05);
                case "carré": return Box(1.7, 1.7, 1.7);
                case "triangle": return ExtrudedPolygon(TrianglePoints(), 0.95);
                case "étoile": return ExtrudedPolygon(StarPoints(), 0.8);
                case "cœur": return ExtrudedPolygon(HeartPoints(), 0.95);
                default: return Sphere();
            }
        }

        // --- Fabrique de vue 3D ---
        public static Viewport3D View(MeshGeometry3D mesh, Color color, double size, out SolidColorBrush diffuse, bool spin = true)
        {
            diffuse = new SolidColorBrush(color);
            var mat = new MaterialGroup();
            mat.Children.Add(new DiffuseMaterial(diffuse));
            // Émissif = la couleur reste vive même dans l'ombre (rendu joyeux).
            mat.Children.Add(new EmissiveMaterial(new SolidColorBrush(Dim(color, 0.28))));
            mat.Children.Add(new SpecularMaterial(new SolidColorBrush(Color.FromArgb(180, 255, 255, 255)), 32));
            var model = new GeometryModel3D(mesh, mat) { BackMaterial = new DiffuseMaterial(diffuse) };

            // On fait tourner autour d'un axe légèrement incliné : les faces et
            // l'épaisseur défilent, ce qui donne bien le volume.
            var spinR = new AxisAngleRotation3D(new Vector3D(0.25, 1, 0), 0);
            var tilt = new AxisAngleRotation3D(new Vector3D(1, 0, 0), 24);
            var tg = new Transform3DGroup();
            tg.Children.Add(new RotateTransform3D(spinR));
            tg.Children.Add(new RotateTransform3D(tilt));
            model.Transform = tg;

            var group = new Model3DGroup();
            // Ambiant plus faible + deux directionnelles : plus de contraste = plus de relief.
            group.Children.Add(new AmbientLight(Color.FromRgb(0x4C, 0x4C, 0x4C)));
            group.Children.Add(new DirectionalLight(Colors.White, new Vector3D(-0.4, -0.7, -1)));
            group.Children.Add(new DirectionalLight(Color.FromRgb(0x66, 0x66, 0x66), new Vector3D(0.6, 0.4, 0.3)));
            group.Children.Add(model);

            var vp = new Viewport3D
            {
                Width = size,
                Height = size,
                IsHitTestVisible = false,
                Camera = new PerspectiveCamera(new Point3D(0, 0, 3.6), new Vector3D(0, 0, -1), new Vector3D(0, 1, 0), 45),
            };
            vp.Children.Add(new ModelVisual3D { Content = group });

            if (spin)
            {
                var a = new DoubleAnimation(0, 360, TimeSpan.FromSeconds(7)) { RepeatBehavior = RepeatBehavior.Forever };
                spinR.BeginAnimation(AxisAngleRotation3D.AngleProperty, a);
            }
            return vp;
        }

        public static Viewport3D View(MeshGeometry3D mesh, Color color, double size, bool spin = true)
            => View(mesh, color, size, out _, spin);

        private static Color Dim(Color c, double f)
            => Color.FromRgb((byte)(c.R * f), (byte)(c.G * f), (byte)(c.B * f));
    }
}
