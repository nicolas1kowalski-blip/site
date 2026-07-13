using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Shapes;

namespace MesPremiersJeux.Games
{
    /// <summary>
    /// « Le corps » — un joli petit personnage dessiné (assez réaliste, tout doux)
    /// dont on apprend les parties du corps : le jeu demande « Montre le nez ! »,
    /// « Où sont les yeux ? »… et l'enfant fixe la bonne zone au regard. Chaque
    /// partie est une zone transparente cliquable posée sur le dessin ; une bonne
    /// réponse illumine la partie et lance les confettis, une réponse à côté fait
    /// trembler le personnage sans le pénaliser (on peut réessayer).
    /// </summary>
    public sealed class BodyGame : GameControl
    {
        // Repère du dessin (le tout est mis à l'échelle pour remplir la page).
        private const double W = 120, H = 182;

        private static readonly Brush Ink   = B("#3A2E4A");
        private static readonly Brush Skin   = B("#FAD3AD");
        private static readonly Brush SkinLn = B("#E3AE85");
        private static readonly Brush Hair   = B("#7A4A28");
        private static readonly Brush Shirt  = B("#FF6B6B");
        private static readonly Brush Shorts = B("#4C9BE8");
        private static readonly Brush Shoes  = B("#FFD93C");
        private static readonly Brush Cheek  = Semi("#FF9FB5", 190);
        private static readonly Brush Bow    = B("#FF7FB0");

        private readonly Random _rng = new Random();
        private readonly List<(Rect r, string id)> _zones = new List<(Rect, string)>();

        private Canvas _overlay;      // zones + halo de réussite
        private FrameworkElement _figure;
        private string _target, _last;

        // Parties à apprendre (identifiant → texte parlé/affiché).
        private static readonly (string Id, string Fr)[] Parts =
        {
            ("tete",     "la tête"),
            ("cheveux",  "les cheveux"),
            ("yeux",     "les yeux"),
            ("nez",      "le nez"),
            ("bouche",   "la bouche"),
            ("oreilles", "les oreilles"),
            ("ventre",   "le ventre"),
            ("bras",     "les bras"),
            ("mains",    "les mains"),
            ("jambes",   "les jambes"),
            ("pieds",    "les pieds"),
        };

        // « la tête » accepte aussi qu'on montre un détail du visage.
        private static readonly HashSet<string> HeadParts =
            new HashSet<string> { "tete", "cheveux", "yeux", "nez", "bouche", "oreilles" };

        public BodyGame(Action celebrate) : base(celebrate) { }

        protected override void NewRound()
        {
            if (_overlay == null) BuildScene();
            ClearHalo();
            Locked = false;

            string t;
            do { t = Parts[_rng.Next(Parts.Length)].Id; } while (t == _last && Parts.Length > 1);
            _last = _target = t;

            var fr = Fr(t);
            Question.Text = Prompt(fr);
            Speak(Question.Text);
        }

        private string Prompt(string fr)
        {
            switch (_rng.Next(3))
            {
                case 0:  return "Montre " + fr + " !";
                case 1:  return "Où " + (fr.StartsWith("les ") ? "sont " : "est ") + fr + " ?";
                default: return "Trouve " + fr + " !";
            }
        }

        private void OnPart(string id)
        {
            if (Locked) return;

            bool ok = id == _target || (_target == "tete" && HeadParts.Contains(id));
            if (ok)
            {
                Locked = true;
                ShowHalo();
                Speak("Bravo ! C'est " + Fr(_target) + " !");
                Celebrate();
                ScheduleNext(2000);
            }
            else
            {
                Shake(_figure);
                Speak("Presque ! Montre " + Fr(_target) + ".");
            }
        }

        private static string Fr(string id) => Parts.First(p => p.Id == id).Fr;

        // ------------------------------------------------------------------ scène
        private void BuildScene()
        {
            _figure = BuildFigure();

            _overlay = new Canvas { Width = W, Height = H, Background = Brushes.Transparent };
            // La tête d'abord (dessous) : un détail du visage la remporte au-dessus.
            AddZone(30, 8, 60, 30, "tete");
            AddZone(30, 8, 60, 20, "cheveux");
            AddZone(38, 28, 44, 14, "yeux");
            AddZone(50, 41, 20, 8, "nez");
            AddZone(44, 48, 32, 12, "bouche");
            AddZone(23, 33, 15, 15, "oreilles");   // oreille gauche
            AddZone(82, 33, 15, 15, "oreilles");   // oreille droite
            AddZone(40, 82, 40, 26, "ventre");
            AddZone(18, 74, 18, 42, "bras");        // bras gauche
            AddZone(84, 74, 18, 42, "bras");        // bras droit
            AddZone(14, 110, 22, 22, "mains");      // main gauche
            AddZone(84, 110, 22, 22, "mains");      // main droite
            AddZone(44, 132, 16, 34, "jambes");     // jambe gauche
            AddZone(60, 132, 16, 34, "jambes");     // jambe droite
            AddZone(40, 165, 22, 15, "pieds");      // pied gauche
            AddZone(58, 165, 22, 15, "pieds");      // pied droit

            var grid = new Grid { Width = W, Height = H };
            grid.Children.Add(_figure);
            grid.Children.Add(_overlay);
            SetBody(grid);
        }

        private void AddZone(double x, double y, double w, double h, string id)
        {
            var b = new Button
            {
                Template = TransparentTemplate(),
                Background = Brushes.Transparent,
                Cursor = Cursors.Hand,
                Width = w,
                Height = h,
            };
            Canvas.SetLeft(b, x);
            Canvas.SetTop(b, y);
            b.Click += (s, e) => OnPart(id);
            _overlay.Children.Add(b);
            _zones.Add((new Rect(x, y, w, h), id));
        }

        private static ControlTemplate TransparentTemplate()
        {
            var tpl = new ControlTemplate(typeof(Button));
            var f = new FrameworkElementFactory(typeof(Border));
            f.SetValue(Border.BackgroundProperty, Brushes.Transparent);
            tpl.VisualTree = f;
            return tpl;
        }

        // ------------------------------------------------------------------ halo de réussite
        private Ellipse _halo;

        private void ShowHalo()
        {
            var z = _zones.First(zz => zz.id == _target).r;
            double cx = z.X + z.Width / 2, cy = z.Y + z.Height / 2;
            double d = Math.Max(z.Width, z.Height) * 1.7 + 8;

            var brush = new RadialGradientBrush();
            brush.GradientStops.Add(new GradientStop(Color.FromArgb(220, 0xFF, 0xF3, 0x7A), 0.0));
            brush.GradientStops.Add(new GradientStop(Color.FromArgb(150, 0xFF, 0xD9, 0x3C), 0.55));
            brush.GradientStops.Add(new GradientStop(Color.FromArgb(0, 0xFF, 0xD9, 0x3C), 1.0));

            _halo = new Ellipse { Width = d, Height = d, Fill = brush, IsHitTestVisible = false };
            Canvas.SetLeft(_halo, cx - d / 2);
            Canvas.SetTop(_halo, cy - d / 2);
            _halo.RenderTransformOrigin = new Point(0.5, 0.5);
            var st = new ScaleTransform(0.5, 0.5);
            _halo.RenderTransform = st;
            _overlay.Children.Add(_halo);

            var grow = new DoubleAnimation(0.5, 1.0, TimeSpan.FromMilliseconds(420)) { AutoReverse = false };
            st.BeginAnimation(ScaleTransform.ScaleXProperty, grow);
            st.BeginAnimation(ScaleTransform.ScaleYProperty, grow);
            var pulse = new DoubleAnimation(0.55, 1.0, TimeSpan.FromMilliseconds(600))
            { AutoReverse = true, RepeatBehavior = RepeatBehavior.Forever };
            _halo.BeginAnimation(OpacityProperty, pulse);
        }

        private void ClearHalo()
        {
            if (_halo != null) { _overlay.Children.Remove(_halo); _halo = null; }
        }

        // ------------------------------------------------------------------ dessin du personnage
        private static FrameworkElement BuildFigure()
        {
            var c = new Canvas { Width = W, Height = H };

            // Jambes (derrière le short).
            c.Children.Add(Limb(52, 130, 52, 164));
            c.Children.Add(Limb(68, 130, 68, 164));
            // Chaussures.
            c.Children.Add(Shoe(50, 168));
            c.Children.Add(Shoe(70, 168));
            // Short.
            c.Children.Add(Pa("M38,106 Q60,114 82,106 L80,128 L63,130 L60,120 L57,130 L40,128 Z", Shorts, Ink, 2.5));
            // Bras (derrière le tee-shirt).
            c.Children.Add(Limb(42, 80, 27, 116));
            c.Children.Add(Limb(78, 80, 93, 116));
            // Mains.
            c.Children.Add(Circle(26, 118, 8, Skin, SkinLn, 2));
            c.Children.Add(Circle(94, 118, 8, Skin, SkinLn, 2));
            // Cou.
            var neck = new Rectangle { Width = 12, Height = 14, RadiusX = 4, RadiusY = 4, Fill = Skin, Stroke = SkinLn, StrokeThickness = 1.5 };
            Canvas.SetLeft(neck, 54); Canvas.SetTop(neck, 58);
            c.Children.Add(neck);
            // Tee-shirt.
            c.Children.Add(Pa("M40,76 Q60,70 80,76 L83,108 Q60,116 37,108 Z", Shirt, Ink, 2.5));
            c.Children.Add(Pa("M40,76 Q31,80 31,94 Q37,97 44,90 Z", Shirt, Ink, 2));  // manche gauche
            c.Children.Add(Pa("M80,76 Q89,80 89,94 Q83,97 76,90 Z", Shirt, Ink, 2));  // manche droite
            c.Children.Add(Pa("M52,72 Q60,80 68,72", null, Ink, 2));                  // col

            // Cheveux (derrière la tête).
            c.Children.Add(Circle(60, 38, 33, Hair, Ink, 2.5));
            // Oreilles.
            c.Children.Add(Circle(34, 40, 6, Skin, SkinLn, 2));
            c.Children.Add(Circle(86, 40, 6, Skin, SkinLn, 2));
            // Tête.
            var head = new Ellipse { Width = 54, Height = 56, Fill = Skin, Stroke = SkinLn, StrokeThickness = 2 };
            Canvas.SetLeft(head, 33); Canvas.SetTop(head, 10);
            c.Children.Add(head);
            // Frange.
            c.Children.Add(Pa("M34,34 Q34,13 60,11 Q86,13 86,34 Q72,22 60,24 Q48,22 34,34 Z", Hair, Ink, 2));
            // Petit nœud.
            c.Children.Add(Pa("M45,14 L37,9 L37,20 Z", Bow, Ink, 1.5));
            c.Children.Add(Pa("M45,14 L53,9 L53,20 Z", Bow, Ink, 1.5));
            c.Children.Add(Circle(45, 14, 3, B("#FF5C9A"), Ink, 1));
            // Yeux.
            c.Children.Add(Circle(51, 35, 5.5, Brushes.White, Ink, 1.6));
            c.Children.Add(Circle(69, 35, 5.5, Brushes.White, Ink, 1.6));
            c.Children.Add(Circle(52, 36, 3, Ink));
            c.Children.Add(Circle(70, 36, 3, Ink));
            c.Children.Add(Circle(50.6, 34.4, 1.2, Brushes.White));
            c.Children.Add(Circle(68.6, 34.4, 1.2, Brushes.White));
            // Sourcils.
            c.Children.Add(Pa("M46,28 Q51,26 56,28", null, Ink, 2));
            c.Children.Add(Pa("M64,28 Q69,26 74,28", null, Ink, 2));
            // Joues.
            c.Children.Add(Circle(44, 45, 5, Cheek));
            c.Children.Add(Circle(76, 45, 5, Cheek));
            // Nez.
            c.Children.Add(Pa("M57,41 Q60,45 63,42", null, Ink, 2));
            // Bouche (sourire).
            c.Children.Add(Pa("M51,49 Q60,58 69,49 Q60,53 51,49 Z", B("#E8607F"), Ink, 2.4));

            return new Viewbox { Child = c, Stretch = Stretch.Uniform, IsHitTestVisible = false };
        }

        // ------------------------------------------------------------------ petites fabriques
        private static SolidColorBrush B(string hex)
        {
            var h = hex.Replace("#", "");
            return new SolidColorBrush(Color.FromRgb(
                Convert.ToByte(h.Substring(0, 2), 16), Convert.ToByte(h.Substring(2, 2), 16), Convert.ToByte(h.Substring(4, 2), 16)));
        }

        private static SolidColorBrush Semi(string hex, byte a)
        {
            var h = hex.Replace("#", "");
            return new SolidColorBrush(Color.FromArgb(a,
                Convert.ToByte(h.Substring(0, 2), 16), Convert.ToByte(h.Substring(2, 2), 16), Convert.ToByte(h.Substring(4, 2), 16)));
        }

        private static Ellipse Circle(double cx, double cy, double r, Brush fill, Brush stroke = null, double sw = 3)
        {
            var e = new Ellipse { Width = 2 * r, Height = 2 * r, Fill = fill, Stroke = stroke, StrokeThickness = sw };
            Canvas.SetLeft(e, cx - r); Canvas.SetTop(e, cy - r);
            return e;
        }

        // Membre « tout doux » : un trait épais couleur peau, bouts arrondis.
        private static Path Limb(double x1, double y1, double x2, double y2)
            => new Path
            {
                Data = Geometry.Parse(FormattableString.Invariant($"M{x1},{y1} L{x2},{y2}")),
                Stroke = Skin,
                StrokeThickness = 13,
                StrokeStartLineCap = PenLineCap.Round,
                StrokeEndLineCap = PenLineCap.Round,
            };

        private static Path Shoe(double cx, double cy)
        {
            var p = new Path
            {
                Data = Geometry.Parse(FormattableString.Invariant(
                    $"M{cx - 10},{cy} Q{cx - 11},{cy + 8} {cx - 2},{cy + 8} L{cx + 11},{cy + 8} Q{cx + 12},{cy} {cx + 8},{cy - 3} Z")),
                Fill = Shoes,
                Stroke = Ink,
                StrokeThickness = 2,
                StrokeLineJoin = PenLineJoin.Round,
            };
            return p;
        }

        private static Path Pa(string d, Brush fill, Brush stroke = null, double sw = 3)
            => new Path
            {
                Data = Geometry.Parse(d),
                Fill = fill,
                Stroke = stroke,
                StrokeThickness = sw,
                StrokeLineJoin = PenLineJoin.Round,
                StrokeStartLineCap = PenLineCap.Round,
                StrokeEndLineCap = PenLineCap.Round,
            };
    }
}
