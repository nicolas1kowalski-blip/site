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
    /// « Le corps » — un enfant dessiné en vectoriel mais volumétrique (dégradés
    /// de peau, ombres douces, yeux réalistes avec iris et reflets, cheveux en
    /// mèches, mains avec doigts…), dont on apprend les parties du corps au regard.
    /// Le jeu demande « Montre le nez ! », illumine la partie et lance les confettis
    /// quand c'est juste, et fait doucement trembler l'enfant sinon (on réessaie).
    /// </summary>
    public sealed class BodyGame : GameControl
    {
        private const double W = 200, H = 320;

        // ---- Palette / brosses partagées (réutilisables sur plusieurs formes) ----
        private static readonly Brush Ink = Col("#3A2E4A");

        // Peau : dégradé radial pour le visage (lumière en haut à gauche), dégradé
        // linéaire pour les membres (effet cylindrique).
        private static readonly Brush SkinFace = Rad(0.38, 0.30, 0.50, 0.48, 0.72, 0.78,
            (0.0, "#FCE4CB"), (0.55, "#F2C29B"), (1.0, "#DDA379"));
        private static readonly Brush SkinLimb = Lin(0, 0, 1, 0,
            (0.0, "#FBDCC1"), (0.45, "#F0BE94"), (1.0, "#D69C71"));
        private static readonly Brush SkinLn = Col("#C68C61");
        private static readonly Brush SkinShade = Col("#3AC08A63"); // ombre translucide

        private static readonly Brush HairBrush = Lin(0.2, 0, 0.8, 1,
            (0.0, "#8A5A30"), (0.5, "#6E4522"), (1.0, "#4E3016"));
        private static readonly Brush HairHi = Col("#B98A55");

        private static readonly Brush Dress = Lin(0.3, 0, 0.6, 1,
            (0.0, "#FF9DB2"), (0.5, "#FF6E8C"), (1.0, "#E7527A"));
        private static readonly Brush DressLn = Col("#C7476B");
        private static readonly Brush Fold = Col("#33962E52");

        private static readonly Brush IrisBrush = Rad(0.5, 0.4, 0.5, 0.5, 0.5, 0.5,
            (0.0, "#8A5E36"), (0.55, "#6B4522"), (1.0, "#3A2210"));
        private static readonly Brush EyeWhite = Lin(0, 0, 0, 1,
            (0.0, "#E9E1D6"), (0.3, "#F7F2EB"), (1.0, "#FBF8F3"));
        private static readonly Brush LipTop = Col("#D25574");
        private static readonly Brush LipBottom = Lin(0, 0, 0, 1,
            (0.0, "#F06A88"), (1.0, "#D9506F"));
        private static readonly Brush Cheek = RadA(0.5, 0.5, 0.5, 0.5, 0.5, 0.5,
            (0.0, "#78FF8FB0"), (1.0, "#00FF8FB0"));

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
            AddZone(48, 8, 104, 46, "tete");        // dessous : un détail du visage l'emporte
            AddZone(44, 6, 112, 38, "cheveux");
            AddZone(58, 54, 84, 26, "yeux");
            AddZone(84, 78, 32, 18, "nez");
            AddZone(74, 96, 52, 22, "bouche");
            AddZone(38, 58, 22, 28, "oreilles");    // gauche
            AddZone(140, 58, 22, 28, "oreilles");   // droite
            AddZone(70, 150, 60, 62, "ventre");
            AddZone(26, 150, 30, 80, "bras");        // gauche
            AddZone(144, 150, 30, 80, "bras");       // droit
            AddZone(12, 224, 38, 40, "mains");       // gauche
            AddZone(150, 224, 38, 40, "mains");      // droite
            AddZone(70, 224, 28, 74, "jambes");      // gauche
            AddZone(102, 224, 28, 74, "jambes");     // droite
            AddZone(62, 298, 40, 22, "pieds");       // gauche
            AddZone(98, 298, 40, 22, "pieds");       // droit

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

        // ------------------------------------------------------------------ dessin
        private static FrameworkElement BuildFigure()
        {
            var c = new Canvas { Width = W, Height = H };

            // 1) Chevelure arrière (mèches qui tombent derrière les épaules).
            c.Children.Add(Pa("M50,74 Q38,18 100,12 Q162,18 150,74 " +
                              "Q160,120 146,170 Q136,182 126,172 Q132,120 124,86 " +
                              "L76,86 Q68,120 74,172 Q64,182 54,170 Q40,120 50,74 Z", HairBrush, Ink, 2));

            // 2) Jambes (derrière la robe), avec genou clair.
            c.Children.Add(Limb(87, 226, 85, 302, 26));
            c.Children.Add(Limb(113, 226, 115, 302, 26));
            c.Children.Add(Oval(85, 262, 12, 14, Highlight(), null, 0));
            c.Children.Add(Oval(115, 262, 12, 14, Highlight(), null, 0));

            // 3) Pieds nus (talon + orteils).
            Foot(c, 82, 306);
            Foot(c, 118, 306);

            // 4) Bras (derrière la robe).
            c.Children.Add(Limb(62, 154, 30, 236, 22));
            c.Children.Add(Limb(138, 154, 170, 236, 22));

            // 5) Mains avec doigts.
            Hand(c, 29, 240, -1);
            Hand(c, 171, 240, +1);

            // 6) Robe (corps), évasée, avec plis et col.
            c.Children.Add(Pa("M62,150 Q100,140 138,150 L158,224 Q100,240 42,224 Z", Dress, DressLn, 2.5));
            c.Children.Add(Pa("M84,158 Q80,196 74,222", null, Fold, 3));
            c.Children.Add(Pa("M116,158 Q120,196 126,222", null, Fold, 3));
            c.Children.Add(Pa("M100,150 L100,232", null, Fold, 2));
            // Manches courtes.
            c.Children.Add(Pa("M64,150 Q50,156 52,176 Q66,176 74,160 Z", Dress, DressLn, 2));
            c.Children.Add(Pa("M136,150 Q150,156 148,176 Q134,176 126,160 Z", Dress, DressLn, 2));
            // Encolure.
            c.Children.Add(Pa("M84,148 Q100,158 116,148", null, DressLn, 2.5));

            // 7) Cou + ombre sous le menton.
            var neck = new Rectangle { Width = 26, Height = 34, RadiusX = 10, RadiusY = 10, Fill = SkinLimb, Stroke = SkinLn, StrokeThickness = 1.5 };
            Canvas.SetLeft(neck, 87); Canvas.SetTop(neck, 108);
            c.Children.Add(neck);
            c.Children.Add(Pa("M74,116 Q100,132 126,116 Q100,126 74,116 Z", SkinShade, null, 0));

            // 8) Oreilles.
            Ear(c, 50, 72);
            Ear(c, 150, 72);

            // 9) Tête (grand ovale, dégradé volumétrique).
            c.Children.Add(Oval(100, 64, 50, 56, SkinFace, SkinLn, 2));
            // Ombres douces des tempes/mâchoire.
            c.Children.Add(Pa("M52,60 Q46,92 74,112 Q58,88 60,60 Z", SkinShade, null, 0));
            c.Children.Add(Pa("M148,60 Q154,92 126,112 Q142,88 140,60 Z", SkinShade, null, 0));

            // 10) Frange + mèches devant, encadrant le visage.
            c.Children.Add(Pa("M50,66 Q44,20 100,14 Q156,20 150,66 " +
                              "Q150,44 128,40 Q116,30 100,32 Q84,30 72,40 Q50,44 50,66 Z", HairBrush, Ink, 2));
            c.Children.Add(Pa("M100,14 Q70,18 60,54 Q66,34 84,30 Q92,20 100,20 Z", HairHi, null, 0));
            c.Children.Add(Pa("M64,42 Q58,58 62,80 Q66,56 74,46 Z", HairBrush, Ink, 1.5)); // mèche gauche
            c.Children.Add(Pa("M136,42 Q142,58 138,80 Q134,56 126,46 Z", HairBrush, Ink, 1.5)); // mèche droite

            // 11) Sourcils.
            c.Children.Add(Pa("M62,52 Q78,44 94,51 Q78,48 62,52 Z", HairBrush, null, 0));
            c.Children.Add(Pa("M106,51 Q122,44 138,52 Q122,48 106,51 Z", HairBrush, null, 0));

            // 12) Yeux réalistes (blanc, iris, pupille, reflet, paupière, cils).
            Eye(c, 78, 68, -1);
            Eye(c, 122, 68, +1);

            // 13) Nez (ombre latérale, narines, petit reflet).
            c.Children.Add(Pa("M100,62 Q94,80 99,88 Q104,86 105,80 Q104,72 100,62 Z", SkinShade, null, 0));
            c.Children.Add(Oval(95, 87, 2.2, 1.6, Ink, null, 0));
            c.Children.Add(Oval(105, 87, 2.2, 1.6, Ink, null, 0));
            c.Children.Add(Oval(101, 82, 2.4, 3, Highlight(), null, 0));

            // 14) Lèvres.
            c.Children.Add(Pa("M80,100 Q90,95 100,99 Q110,95 120,100 Q110,105 100,103 Q90,105 80,100 Z", LipTop, Col("#B0405E"), 1));
            c.Children.Add(Pa("M82,101 Q100,116 118,101 Q100,108 82,101 Z", LipBottom, Col("#C7506C"), 1));
            c.Children.Add(Pa("M92,106 Q100,110 108,106", null, Col("#66FFB8C8"), 2)); // brillance

            // 15) Joues rosées.
            c.Children.Add(Oval(70, 86, 13, 10, Cheek, null, 0));
            c.Children.Add(Oval(130, 86, 13, 10, Cheek, null, 0));

            return new Viewbox { Child = c, Stretch = Stretch.Uniform, IsHitTestVisible = false };
        }

        // ---- Sous-ensembles réutilisables ----
        private static void Eye(Canvas c, double cx, double cy, int dir)
        {
            // Blanc de l'œil (amande).
            c.Children.Add(Pa(Inv($"M{cx - 14},{cy} Q{cx},{cy - 11} {cx + 14},{cy} Q{cx},{cy + 9} {cx - 14},{cy} Z"),
                EyeWhite, Col("#8C6B57"), 1.2));
            // Iris + pupille + reflet.
            c.Children.Add(Circle(cx, cy, 7.5, IrisBrush, Col("#3A2210"), 0.8));
            c.Children.Add(Circle(cx, cy, 3.4, Ink));
            c.Children.Add(Circle(cx - 2.4, cy - 2.6, 1.7, Brushes.White));
            c.Children.Add(Circle(cx + 2, cy + 2, 0.9, Col("#66FFFFFF")));
            // Paupière supérieure (trait + ombre) et quelques cils.
            c.Children.Add(Pa(Inv($"M{cx - 14},{cy} Q{cx},{cy - 11.5} {cx + 14},{cy}"), null, Col("#5A4636"), 2));
            c.Children.Add(Pa(Inv($"M{cx + dir * 13},{cy - 1} l{dir * 4},{-3}"), null, Col("#5A4636"), 1.6));
            c.Children.Add(Pa(Inv($"M{cx + dir * 10},{cy - 4} l{dir * 3},{-3}"), null, Col("#5A4636"), 1.4));
            // Pli sous l'œil.
            c.Children.Add(Pa(Inv($"M{cx - 10},{cy + 6} Q{cx},{cy + 9} {cx + 10},{cy + 6}"), null, Col("#40C08A63"), 1.4));
        }

        private static void Ear(Canvas c, double cx, double cy)
        {
            c.Children.Add(Oval(cx, cy, 10, 15, SkinFace, SkinLn, 1.5));
            c.Children.Add(Pa(Inv($"M{cx},{cy - 8} Q{cx + 5},{cy} {cx},{cy + 7} Q{cx - 3},{cy} {cx},{cy - 8} Z"),
                Col("#33C08A63"), null, 0));
        }

        private static void Hand(Canvas c, double cx, double cy, int dir)
        {
            // Doigts (derrière la paume).
            for (int i = 0; i < 4; i++)
            {
                double fx = cx - 8 + i * 5.3;
                var f = new Rectangle { Width = 4.6, Height = 15, RadiusX = 2.3, RadiusY = 2.3, Fill = SkinLimb, Stroke = SkinLn, StrokeThickness = 0.8 };
                Canvas.SetLeft(f, fx - 2.3); Canvas.SetTop(f, cy + 4);
                c.Children.Add(f);
            }
            // Pouce.
            var th = new Rectangle { Width = 5.2, Height = 11, RadiusX = 2.6, RadiusY = 2.6, Fill = SkinLimb, Stroke = SkinLn, StrokeThickness = 0.8 };
            th.RenderTransformOrigin = new Point(0.5, 0.5);
            th.RenderTransform = new RotateTransform(dir * 55);
            Canvas.SetLeft(th, cx + dir * 10 - 2.6); Canvas.SetTop(th, cy - 2);
            c.Children.Add(th);
            // Paume.
            c.Children.Add(Oval(cx, cy, 12, 12, SkinLimb, SkinLn, 1.4));
        }

        private static void Foot(Canvas c, double cx, double cy)
        {
            c.Children.Add(Oval(cx, cy, 15, 9, SkinLimb, SkinLn, 1.5));
            for (int i = 0; i < 5; i++)
                c.Children.Add(Oval(cx - 10 + i * 5, cy + 7, 2.6, 2.2, SkinLimb, SkinLn, 0.7));
        }

        // ------------------------------------------------------------------ fabriques
        private static string Inv(FormattableString s) => FormattableString.Invariant(s);

        private static Brush Highlight() => Col("#4CFFFFFF");

        // Col → brosse pleine (utilisée partout comme Fill/Stroke) ; C → couleur brute
        // (pour les arrêts de dégradé).
        private static SolidColorBrush Col(string hex) => new SolidColorBrush(C(hex));

        private static Color C(string hex)
        {
            var h = hex.Replace("#", "");
            if (h.Length == 8)
                return Color.FromArgb(
                    Convert.ToByte(h.Substring(0, 2), 16), Convert.ToByte(h.Substring(2, 2), 16),
                    Convert.ToByte(h.Substring(4, 2), 16), Convert.ToByte(h.Substring(6, 2), 16));
            return Color.FromRgb(
                Convert.ToByte(h.Substring(0, 2), 16), Convert.ToByte(h.Substring(2, 2), 16), Convert.ToByte(h.Substring(4, 2), 16));
        }

        private static LinearGradientBrush Lin(double x1, double y1, double x2, double y2, params (double o, string hex)[] s)
        {
            var b = new LinearGradientBrush { StartPoint = new Point(x1, y1), EndPoint = new Point(x2, y2) };
            foreach (var (o, hex) in s) b.GradientStops.Add(new GradientStop(C(hex), o));
            return b;
        }

        private static RadialGradientBrush Rad(double ox, double oy, double cx, double cy, double rx, double ry, params (double o, string hex)[] s)
        {
            var b = new RadialGradientBrush { GradientOrigin = new Point(ox, oy), Center = new Point(cx, cy), RadiusX = rx, RadiusY = ry };
            foreach (var (o, hex) in s) b.GradientStops.Add(new GradientStop(C(hex), o));
            return b;
        }

        private static RadialGradientBrush RadA(double ox, double oy, double cx, double cy, double rx, double ry, params (double o, string hex)[] s)
            => Rad(ox, oy, cx, cy, rx, ry, s);

        private static Ellipse Circle(double cx, double cy, double r, Brush fill, Brush stroke = null, double sw = 3)
            => Oval(cx, cy, r, r, fill, stroke, sw);

        private static Ellipse Oval(double cx, double cy, double rx, double ry, Brush fill, Brush stroke = null, double sw = 3)
        {
            var e = new Ellipse { Width = 2 * rx, Height = 2 * ry, Fill = fill, Stroke = stroke, StrokeThickness = sw };
            Canvas.SetLeft(e, cx - rx); Canvas.SetTop(e, cy - ry);
            return e;
        }

        private static Path Limb(double x1, double y1, double x2, double y2, double th)
            => new Path
            {
                Data = Geometry.Parse(Inv($"M{x1},{y1} L{x2},{y2}")),
                Stroke = SkinLimb,
                StrokeThickness = th,
                StrokeStartLineCap = PenLineCap.Round,
                StrokeEndLineCap = PenLineCap.Round,
            };

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
