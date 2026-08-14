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
    /// « Le corps » — un enfant dessiné au trait, façon « livre de coloriage »
    /// (contours noirs nets, intérieur blanc, sans aucune étiquette), dont on
    /// apprend les parties du corps au regard. Le jeu demande « Montre le nez ! »,
    /// illumine la bonne partie et lance les confettis, et fait doucement trembler
    /// l'enfant sinon (on réessaie, sans pénalité).
    /// </summary>
    public sealed class BodyGame : GameControl
    {
        private const double W = 200, H = 320;
        private const double LW = 3.2;   // épaisseur du trait

        private static readonly Brush Ink = new SolidColorBrush(Color.FromRgb(0x1A, 0x1A, 0x1A));
        private static readonly Brush White = Brushes.White;

        private readonly Random _rng = new Random();
        private readonly List<(Rect r, string id)> _zones = new List<(Rect, string)>();

        private Canvas _overlay;
        private FrameworkElement _figure;
        private string _target, _last;
        private Ellipse _halo;

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

            Question.Text = Prompt(Fr(t));
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
            AddZone(58, 20, 84, 38, "tete");        // dessous : un détail du visage l'emporte
            AddZone(56, 18, 88, 30, "cheveux");
            AddZone(66, 56, 68, 22, "yeux");
            AddZone(88, 64, 24, 18, "nez");
            AddZone(80, 82, 40, 22, "bouche");
            AddZone(46, 58, 22, 28, "oreilles");    // gauche
            AddZone(132, 58, 22, 28, "oreilles");   // droite
            AddZone(72, 135, 56, 68, "ventre");
            AddZone(28, 140, 34, 68, "bras");        // gauche
            AddZone(138, 140, 34, 68, "bras");       // droit
            AddZone(16, 200, 40, 46, "mains");       // gauche
            AddZone(144, 200, 40, 46, "mains");      // droite
            AddZone(70, 214, 28, 78, "jambes");      // gauche
            AddZone(102, 214, 28, 78, "jambes");     // droite
            AddZone(60, 298, 44, 22, "pieds");       // gauche
            AddZone(96, 298, 44, 22, "pieds");       // droit

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
        private void ShowHalo()
        {
            var z = _zones.First(zz => zz.id == _target).r;
            double cx = z.X + z.Width / 2, cy = z.Y + z.Height / 2;
            double d = Math.Max(z.Width, z.Height) * 1.8 + 14;

            var brush = new RadialGradientBrush();
            brush.GradientStops.Add(new GradientStop(Color.FromArgb(210, 0xFF, 0xE7, 0x5C), 0.0));
            brush.GradientStops.Add(new GradientStop(Color.FromArgb(140, 0xFF, 0xD1, 0x3C), 0.55));
            brush.GradientStops.Add(new GradientStop(Color.FromArgb(0, 0xFF, 0xD1, 0x3C), 1.0));

            _halo = new Ellipse { Width = d, Height = d, Fill = brush, IsHitTestVisible = false };
            Canvas.SetLeft(_halo, cx - d / 2);
            Canvas.SetTop(_halo, cy - d / 2);
            _halo.RenderTransformOrigin = new Point(0.5, 0.5);
            var st = new ScaleTransform(0.5, 0.5);
            _halo.RenderTransform = st;
            _overlay.Children.Add(_halo);

            var grow = new DoubleAnimation(0.5, 1.0, TimeSpan.FromMilliseconds(420));
            st.BeginAnimation(ScaleTransform.ScaleXProperty, grow);
            st.BeginAnimation(ScaleTransform.ScaleYProperty, grow);
            _halo.BeginAnimation(OpacityProperty,
                new DoubleAnimation(0.55, 1.0, TimeSpan.FromMilliseconds(600))
                { AutoReverse = true, RepeatBehavior = RepeatBehavior.Forever });
        }

        private void ClearHalo()
        {
            if (_halo != null) { _overlay.Children.Remove(_halo); _halo = null; }
        }

        // ------------------------------------------------------------------ dessin (trait « coloriage »)
        private static FrameworkElement BuildFigure()
        {
            var c = new Canvas { Width = W, Height = H };

            // Bras (derrière le torse), mains ouvertes vers le bas.
            c.Children.Add(Pa(Capsule(72, 134, 40, 212, 26), White, Ink, LW));
            c.Children.Add(Pa(Capsule(128, 134, 160, 212, 26), White, Ink, LW));

            // Jambes (derrière le short).
            c.Children.Add(Pa(Capsule(86, 210, 84, 300, 32), White, Ink, LW));
            c.Children.Add(Pa(Capsule(114, 210, 116, 300, 32), White, Ink, LW));

            // Pieds nus (contour + orteils).
            Foot(c, 84, 302);
            Foot(c, 116, 302);

            // Torse (buste nu : le ventre se montre facilement).
            c.Children.Add(Pa("M72,130 C60,152 66,198 76,210 Q100,220 124,210 " +
                              "C134,198 140,152 128,130 Q100,120 72,130 Z", White, Ink, LW));
            // Short.
            c.Children.Add(Pa("M74,200 Q100,210 126,200 L130,240 L104,246 L100,232 L96,246 L70,240 Z", White, Ink, LW));
            // Nombril.
            c.Children.Add(Pa("M98,178 Q100,182 102,178", null, Ink, 2));

            // Mains ouvertes (doigts écartés).
            Hand(c, 40, 214, -1);
            Hand(c, 160, 214, +1);

            // Cou (derrière la tête).
            c.Children.Add(Pa("M88,116 L88,130 Q100,136 112,130 L112,116 Z", White, Ink, LW));

            // Oreilles (avant la tête, la tête recouvre l'attache).
            c.Children.Add(Oval(56, 70, 8, 11, White, Ink, LW));
            c.Children.Add(Oval(144, 70, 8, 11, White, Ink, LW));
            c.Children.Add(Pa("M56,64 Q60,70 56,76", null, Ink, 2));
            c.Children.Add(Pa("M144,64 Q140,70 144,76", null, Ink, 2));

            // Tête.
            c.Children.Add(Oval(100, 66, 42, 46, White, Ink, LW));

            // Cheveux courts en épis.
            c.Children.Add(Pa("M60,66 C54,38 68,24 84,24 C90,14 110,14 116,26 C134,24 146,40 140,66 " +
                              "C132,52 126,56 120,46 C116,58 106,54 104,44 C100,56 92,56 88,46 " +
                              "C84,58 74,56 72,50 C68,62 62,56 60,66 Z", White, Ink, LW));

            // Sourcils.
            c.Children.Add(Pa("M74,54 Q84,49 94,54", null, Ink, 2.6));
            c.Children.Add(Pa("M106,54 Q116,49 126,54", null, Ink, 2.6));

            // Yeux (pleins) + petit reflet.
            c.Children.Add(Oval(84, 64, 6.5, 8, Ink));
            c.Children.Add(Oval(116, 64, 6.5, 8, Ink));
            c.Children.Add(Circle(81.6, 61, 2.2, White));
            c.Children.Add(Circle(113.6, 61, 2.2, White));

            // Nez.
            c.Children.Add(Pa("M99,68 C104,73 104,79 98,79", null, Ink, 2.4));

            // Bouche (sourire ouvert).
            c.Children.Add(Pa("M84,86 Q100,93 116,86 Q109,103 100,103 Q91,103 84,86 Z", White, Ink, LW));

            return new Viewbox { Child = c, Stretch = Stretch.Uniform, IsHitTestVisible = false };
        }

        private static void Hand(Canvas c, double cx, double cy, int dir)
        {
            // Doigts écartés (pointant vers le bas).
            for (int i = 0; i < 4; i++)
            {
                double sx = cx - 8 + i * 5.5, sy = cy + 6;
                double ex = cx - 13 + i * 8.5, ey = cy + 24;
                c.Children.Add(Pa(Capsule(sx, sy, ex, ey, 6), White, Ink, 2.4));
            }
            // Pouce.
            c.Children.Add(Pa(Capsule(cx + dir * 6, cy + 2, cx + dir * 15, cy + 14, 6.5), White, Ink, 2.4));
            // Paume (par-dessus l'attache des doigts).
            c.Children.Add(Oval(cx, cy, 13, 12, White, Ink, LW));
        }

        private static void Foot(Canvas c, double cx, double cy)
        {
            c.Children.Add(Oval(cx, cy, 16, 10, White, Ink, LW));
            for (int i = 0; i < 5; i++)
                c.Children.Add(Oval(cx - 11 + i * 5.5, cy + 8, 3, 2.6, White, Ink, 2));
        }

        // ------------------------------------------------------------------ fabriques
        private static string Inv(FormattableString s) => FormattableString.Invariant(s);

        // Contour d'une « gélule » (membre/doigt) entre deux points, bouts arrondis.
        private static string Capsule(double x1, double y1, double x2, double y2, double w)
        {
            double dx = x2 - x1, dy = y2 - y1, len = Math.Sqrt(dx * dx + dy * dy);
            if (len < 0.001) len = 0.001;
            double ux = dx / len, uy = dy / len;   // direction
            double px = -uy, py = ux;              // perpendiculaire
            double h = w / 2;
            double ax = x1 + px * h, ay = y1 + py * h;
            double bx = x2 + px * h, by = y2 + py * h;
            double cx = x2 - px * h, cy = y2 - py * h;
            double dxp = x1 - px * h, dyp = y1 - py * h;
            double teX = x2 + ux * h, teY = y2 + uy * h;   // pointe côté fin
            double tsX = x1 - ux * h, tsY = y1 - uy * h;   // pointe côté départ
            return Inv($"M{ax},{ay} L{bx},{by} Q{teX},{teY} {cx},{cy} L{dxp},{dyp} Q{tsX},{tsY} {ax},{ay} Z");
        }

        private static Ellipse Circle(double cx, double cy, double r, Brush fill, Brush stroke = null, double sw = 3)
            => Oval(cx, cy, r, r, fill, stroke, sw);

        private static Ellipse Oval(double cx, double cy, double rx, double ry, Brush fill, Brush stroke = null, double sw = 3)
        {
            var e = new Ellipse { Width = 2 * rx, Height = 2 * ry, Fill = fill, Stroke = stroke, StrokeThickness = sw };
            Canvas.SetLeft(e, cx - rx); Canvas.SetTop(e, cy - ry);
            return e;
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
