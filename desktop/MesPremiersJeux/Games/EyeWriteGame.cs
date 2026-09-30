using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Shapes;
using MesPremiersJeux.Lib;

namespace MesPremiersJeux.Games
{
    /// <summary>
    /// « J'écris ! » (MS) — apprendre le GESTE d'écriture avec les yeux : une
    /// coccinelle 🐞 parcourt la forme point après point ; chaque fois que le
    /// regard l'attrape, le trait se dessine derrière elle (avec le crayon ✏️).
    /// Progression de graphisme maternelle : les traits (—, |, ○) d'abord, puis
    /// les LETTRES DU PRÉNOM de l'enfant, puis d'autres lettres. Une forme
    /// terminée s'illumine sous les confettis : « Tu as écrit le L ! »
    /// Aucun échec possible : la coccinelle attend le regard.
    /// </summary>
    public sealed class EyeWriteGame : GameControl
    {
        private const double W = 1400, H = 680;
        private const double BoxX = 140, BoxY = 40, Box = 560; // zone d'écriture
        private const double Spacing = 0.24;                   // écart entre points (0..1)

        // Échantillonne un arc d'ellipse (angles en degrés, y vers le bas) : les
        // lettres rondes suivent ainsi de VRAIES courbes, pas des segments.
        private static double[] Arc(double cx, double cy, double rx, double ry, double a0, double a1, int steps)
        {
            var res = new double[(steps + 1) * 2];
            for (int i = 0; i <= steps; i++)
            {
                double a = (a0 + (a1 - a0) * i / steps) * Math.PI / 180.0;
                res[i * 2] = cx + rx * Math.Cos(a);
                res[i * 2 + 1] = cy + ry * Math.Sin(a);
            }
            return res;
        }

        // Chaque lettre = une liste de TRAITS ; un trait = une polyligne x,y (0..1).
        private static readonly Dictionary<char, double[][]> Letters = new Dictionary<char, double[][]>
        {
            ['I'] = new[] { new[] { 0.5, 0.08, 0.5, 0.92 } },
            ['L'] = new[] { new[] { 0.3, 0.08, 0.3, 0.9, 0.78, 0.9 } },
            ['T'] = new[] { new[] { 0.18, 0.12, 0.82, 0.12 }, new[] { 0.5, 0.12, 0.5, 0.9 } },
            ['E'] = new[] { new[] { 0.75, 0.1, 0.28, 0.1, 0.28, 0.9, 0.75, 0.9 }, new[] { 0.28, 0.5, 0.68, 0.5 } },
            ['F'] = new[] { new[] { 0.75, 0.1, 0.3, 0.1, 0.3, 0.9 }, new[] { 0.3, 0.5, 0.7, 0.5 } },
            ['H'] = new[] { new[] { 0.25, 0.08, 0.25, 0.92 }, new[] { 0.75, 0.08, 0.75, 0.92 }, new[] { 0.25, 0.5, 0.75, 0.5 } },
            ['O'] = new[] { Arc(0.5, 0.5, 0.31, 0.4, -90, 270, 10) },
            ['C'] = new[] { Arc(0.5, 0.5, 0.31, 0.4, -50, -310, 8) },
            ['U'] = new[] { new[] { 0.25, 0.08, 0.25, 0.62, 0.5, 0.9, 0.75, 0.62, 0.75, 0.08 } },
            ['V'] = new[] { new[] { 0.2, 0.08, 0.5, 0.9, 0.8, 0.08 } },
            ['A'] = new[] { new[] { 0.18, 0.9, 0.5, 0.08, 0.82, 0.9 }, new[] { 0.32, 0.58, 0.68, 0.58 } },
            ['M'] = new[] { new[] { 0.15, 0.9, 0.15, 0.1, 0.5, 0.55, 0.85, 0.1, 0.85, 0.9 } },
            ['N'] = new[] { new[] { 0.2, 0.9, 0.2, 0.1, 0.8, 0.9, 0.8, 0.1 } },
            ['Z'] = new[] { new[] { 0.2, 0.14, 0.8, 0.14, 0.2, 0.86, 0.8, 0.86 } },
            ['P'] = new[] { new[] { 0.28, 0.92, 0.28, 0.08, 0.62, 0.1, 0.75, 0.26, 0.62, 0.46, 0.28, 0.48 } },
            ['R'] = new[] { new[] { 0.28, 0.92, 0.28, 0.08, 0.62, 0.1, 0.75, 0.26, 0.62, 0.46, 0.28, 0.48 }, new[] { 0.48, 0.54, 0.78, 0.92 } },
            ['B'] = new[] { new[] { 0.28, 0.92, 0.28, 0.08, 0.6, 0.1, 0.72, 0.26, 0.6, 0.46, 0.28, 0.48, 0.64, 0.52, 0.76, 0.7, 0.62, 0.9, 0.28, 0.92 } },
            ['D'] = new[] { new[] { 0.28, 0.92, 0.28, 0.08, 0.6, 0.12, 0.78, 0.4, 0.78, 0.62, 0.6, 0.88, 0.28, 0.92 } },
            ['S'] = new[] { new[] { 0.75, 0.2, 0.5, 0.1, 0.26, 0.24, 0.44, 0.46, 0.62, 0.56, 0.74, 0.74, 0.5, 0.9, 0.25, 0.8 } },
        };

        // Les formes de graphisme (avant les lettres) : nom parlé + traits.
        private static readonly (string Name, string Label, double[][] Strokes)[] Shapes =
        {
            ("le trait couché", "—", new[] { new[] { 0.12, 0.5, 0.88, 0.5 } }),
            ("le trait debout", "|", new[] { new[] { 0.5, 0.1, 0.5, 0.9 } }),
            ("le rond", "○", new[] { Arc(0.5, 0.5, 0.33, 0.4, -90, 270, 10) }),
        };

        private static readonly Color[] InkColors =
        {
            Color.FromRgb(0xE8, 0x43, 0x3A), Color.FromRgb(0x2E, 0x7F, 0xE8),
            Color.FromRgb(0x2F, 0xA3, 0x4D), Color.FromRgb(0xA0, 0x6C, 0xD5),
            Color.FromRgb(0xFF, 0x8A, 0x3D),
        };

        private Canvas _canvas;
        private List<(string Name, string Label, double[][] Strokes)> _plan;
        private int _item;
        private List<List<Point>> _waypoints; // par trait, en pixels
        private int _stroke, _wp;
        private Path _inkPath;                // l'encre du trait en cours
        private List<Point> _inkPts;          // ses points déjà atteints
        private Button _bug;
        private TextBlock _pencil;
        private TextBlock _bigLabel;
        private bool _done;

        public EyeWriteGame(Action celebrate) : base(celebrate) { }

        protected override void NewRound()
        {
            // Le programme : les traits, puis les lettres du PRÉNOM, puis d'autres.
            _plan = new List<(string, string, double[][])>();
            foreach (var s in Shapes) _plan.Add(s);

            string name = "";
            try { name = Settings.Load().ChildName; } catch { }
            name = new string((name ?? "").Trim().ToUpperInvariant().Where(char.IsLetter).ToArray());
            var used = new HashSet<char>();
            foreach (var ch in name)
                if (!used.Contains(ch) && Letters.ContainsKey(ch))
                {
                    used.Add(ch);
                    _plan.Add(("la lettre " + ch, ch.ToString(), Letters[ch]));
                }
            foreach (var kv in "ILTOEHUVCAMNZPRBDS")
                if (!used.Contains(kv) && Letters.ContainsKey(kv))
                {
                    used.Add(kv);
                    _plan.Add(("la lettre " + kv, kv.ToString(), Letters[kv]));
                }

            _item = 0;
            StartItem(speakIntro: true);
        }

        private Color Ink => InkColors[_item % InkColors.Length];

        private static Point Px(double x, double y) =>
            new Point(BoxX + x * Box, BoxY + y * Box);

        // Découpe les traits en points d'étape régulièrement espacés.
        private static List<List<Point>> BuildWaypoints(double[][] strokes)
        {
            var res = new List<List<Point>>();
            foreach (var s in strokes)
            {
                var pts = new List<Point>();
                for (int i = 0; i + 1 < s.Length; i += 2) pts.Add(new Point(s[i], s[i + 1]));
                var wps = new List<Point> { Px(pts[0].X, pts[0].Y) };
                for (int i = 1; i < pts.Count; i++)
                {
                    var a = pts[i - 1];
                    var b = pts[i];
                    double d = Math.Sqrt((b.X - a.X) * (b.X - a.X) + (b.Y - a.Y) * (b.Y - a.Y));
                    // JAMAIS deux arrêts trop proches : le clic au regard doit se
                    // réarmer entre deux points (Floor, pas Ceiling).
                    int steps = Math.Max(1, (int)Math.Floor(d / Spacing));
                    for (int k = 1; k <= steps; k++)
                        wps.Add(Px(a.X + (b.X - a.X) * k / steps, a.Y + (b.Y - a.Y) * k / steps));
                }
                res.Add(wps);
            }
            return res;
        }

        private void StartItem(bool speakIntro = false)
        {
            var (name, label, strokes) = _plan[_item];
            _waypoints = BuildWaypoints(strokes);
            _stroke = 0;
            _wp = 0;
            _done = false;
            Locked = false;
            Question.Text = "✍️ On écrit " + name + " !";
            _canvas = new Canvas { Width = W, Height = H };

            // La zone d'écriture (une belle ardoise).
            var slate = new Border
            {
                Width = Box + 60,
                Height = Box + 60,
                CornerRadius = new CornerRadius(30),
                Background = new SolidColorBrush(Color.FromRgb(0xFF, 0xFD, 0xF4)),
                BorderBrush = new SolidColorBrush(Color.FromRgb(0xC9, 0xA8, 0x7A)),
                BorderThickness = new Thickness(6),
            };
            Canvas.SetLeft(slate, BoxX - 30);
            Canvas.SetTop(slate, BoxY - 30);
            _canvas.Children.Add(slate);

            // Le modèle en filigrane (pour les lettres).
            if (label.Length == 1 && char.IsLetter(label[0]))
            {
                var ghost = new TextBlock
                {
                    Text = label,
                    FontSize = Box * 0.96,
                    FontWeight = FontWeights.ExtraBold,
                    Foreground = new SolidColorBrush(Color.FromArgb(0x22, 0x3B, 0x2A, 0x5A)),
                    Width = Box,
                    TextAlignment = TextAlignment.Center,
                    IsHitTestVisible = false,
                };
                Canvas.SetLeft(ghost, BoxX);
                Canvas.SetTop(ghost, BoxY - Box * 0.08);
                _canvas.Children.Add(ghost);
            }

            // Les petits points du chemin (pâles), tous visibles.
            foreach (var strokeWps in _waypoints)
                foreach (var p in strokeWps)
                {
                    var dot = new Ellipse
                    {
                        Width = 16,
                        Height = 16,
                        Fill = new SolidColorBrush(Color.FromArgb(0x55, Ink.R, Ink.G, Ink.B)),
                        IsHitTestVisible = false,
                    };
                    Canvas.SetLeft(dot, p.X - 8);
                    Canvas.SetTop(dot, p.Y - 8);
                    _canvas.Children.Add(dot);
                }

            // Panneau de droite : le modèle en grand, l'aide, la progression.
            _bigLabel = new TextBlock
            {
                Text = label,
                FontSize = 200,
                FontWeight = FontWeights.ExtraBold,
                Foreground = new SolidColorBrush(Ink),
                Width = 500,
                TextAlignment = TextAlignment.Center,
                RenderTransformOrigin = new Point(0.5, 0.5),
                IsHitTestVisible = false,
            };
            Canvas.SetLeft(_bigLabel, 830);
            Canvas.SetTop(_bigLabel, 110);
            _canvas.Children.Add(_bigLabel);

            var progress = new TextBlock
            {
                Text = (_item + 1) + " / " + _plan.Count,
                FontSize = 28,
                FontWeight = FontWeights.Bold,
                Foreground = new SolidColorBrush(Color.FromRgb(0x6B, 0x5A, 0x8A)),
                Width = 500,
                TextAlignment = TextAlignment.Center,
            };
            Canvas.SetLeft(progress, 830);
            Canvas.SetTop(progress, 380);
            _canvas.Children.Add(progress);

            var speaker = SpeakerButton(() => "Suis la coccinelle avec tes yeux pour écrire " + name + " ! Attrape-la à chaque arrêt !");
            Canvas.SetLeft(speaker, 1030);
            Canvas.SetTop(speaker, 440);
            _canvas.Children.Add(speaker);

            // Le crayon et la coccinelle.
            _pencil = new TextBlock
            {
                Text = "✏️",
                FontSize = 46,
                IsHitTestVisible = false,
                Visibility = Visibility.Collapsed,
            };
            _pencil.SetValue(Panel.ZIndexProperty, 70);
            _canvas.Children.Add(_pencil);

            _bug = new Button
            {
                Style = (Style)Application.Current.Resources["BalloonButton"],
                Width = 110,
                Height = 110,
                Content = new TextBlock { Text = "🐞", FontSize = 60, HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center },
            };
            _bug.Click += (s, e) => BugCaught();
            _bug.SetValue(Panel.ZIndexProperty, 80);
            _canvas.Children.Add(_bug);
            StartStroke();

            SetBody(_canvas);
            Speak(speakIntro
                ? "On apprend à écrire avec les yeux ! Suis la coccinelle pour écrire " + name + " !"
                : "Maintenant, " + name + " ! Suis la coccinelle !");
        }

        private void StartStroke()
        {
            _wp = 0;
            // Nouveau trait : une nouvelle encre, DESSINÉE EN COURBES DOUCES
            // (les points atteints sont reliés par des courbes de Bézier, pas par
            // des segments raides — décisif pour les lettres rondes).
            _inkPts = new List<Point>();
            _inkPath = new Path
            {
                Stroke = new SolidColorBrush(Ink),
                StrokeThickness = 18,
                StrokeLineJoin = PenLineJoin.Round,
                StrokeStartLineCap = PenLineCap.Round,
                StrokeEndLineCap = PenLineCap.Round,
                IsHitTestVisible = false,
            };
            _inkPath.SetValue(Panel.ZIndexProperty, 60);
            _canvas.Children.Add(_inkPath);
            MoveBugTo(_waypoints[_stroke][0]);
        }

        // Courbe douce passant par tous les points (lissage Catmull-Rom → Bézier).
        private static Geometry BuildSmooth(List<Point> p)
        {
            var fig = new PathFigure { StartPoint = p[0], IsClosed = false };
            if (p.Count == 2)
            {
                fig.Segments.Add(new LineSegment(p[1], true));
            }
            else
            {
                for (int i = 1; i < p.Count; i++)
                {
                    var p0 = p[Math.Max(0, i - 2)];
                    var p1 = p[i - 1];
                    var p2 = p[i];
                    var p3 = p[Math.Min(p.Count - 1, i + 1)];
                    var c1 = new Point(p1.X + (p2.X - p0.X) / 6.0, p1.Y + (p2.Y - p0.Y) / 6.0);
                    var c2 = new Point(p2.X - (p3.X - p1.X) / 6.0, p2.Y - (p3.Y - p1.Y) / 6.0);
                    fig.Segments.Add(new BezierSegment(c1, c2, p2, true));
                }
            }
            var g = new PathGeometry();
            g.Figures.Add(fig);
            return g;
        }

        private void MoveBugTo(Point p)
        {
            Canvas.SetLeft(_bug, p.X - _bug.Width / 2);
            Canvas.SetTop(_bug, p.Y - _bug.Height / 2);
        }

        private void BugCaught()
        {
            if (_done || Locked) return;
            var wps = _waypoints[_stroke];
            var p = wps[_wp];

            // Le trait s'allonge jusqu'ici (en courbe douce), le crayon suit.
            _inkPts.Add(p);
            if (_inkPts.Count >= 2) _inkPath.Data = BuildSmooth(_inkPts);
            Canvas.SetLeft(_pencil, p.X + 4);
            Canvas.SetTop(_pencil, p.Y - 44);
            _pencil.Visibility = Visibility.Visible;
            GameKit.Success();

            _wp++;
            if (_wp < wps.Count)
            {
                MoveBugTo(wps[_wp]);
                return;
            }

            // Trait terminé.
            _stroke++;
            if (_stroke < _waypoints.Count)
            {
                Speak("Hop ! On lève le crayon !");
                StartStroke();
                return;
            }
            FinishItem();
        }

        private void FinishItem()
        {
            _done = true;
            Locked = true;
            _bug.Visibility = Visibility.Hidden;
            _pencil.Visibility = Visibility.Collapsed;
            var (name, _, _) = _plan[_item];
            GameKit.Success();
            Celebrate();
            RewardStore.Add();
            Speak("Bravo ! Tu as écrit " + name + " ! Comme une grande !");

            // Le modèle applaudit : il grossit et tourne de joie.
            var sc = new ScaleTransform(1, 1);
            var rot = new RotateTransform(0);
            var grp = new TransformGroup();
            grp.Children.Add(sc);
            grp.Children.Add(rot);
            _bigLabel.RenderTransform = grp;
            var pop = new DoubleAnimation(1, 1.3, TimeSpan.FromMilliseconds(360))
            { AutoReverse = true, RepeatBehavior = new RepeatBehavior(3), EasingFunction = new SineEase() };
            sc.BeginAnimation(ScaleTransform.ScaleXProperty, pop);
            sc.BeginAnimation(ScaleTransform.ScaleYProperty, pop);
            var wig = new DoubleAnimationUsingKeyFrames { Duration = TimeSpan.FromMilliseconds(700), RepeatBehavior = new RepeatBehavior(2) };
            wig.KeyFrames.Add(new LinearDoubleKeyFrame(-8, KeyTime.FromPercent(0.25)));
            wig.KeyFrames.Add(new LinearDoubleKeyFrame(8, KeyTime.FromPercent(0.75)));
            wig.KeyFrames.Add(new LinearDoubleKeyFrame(0, KeyTime.FromPercent(1)));
            rot.BeginAnimation(RotateTransform.AngleProperty, wig);

            _item++;
            if (_item >= _plan.Count)
            {
                Question.Text = "🎉 Tu sais écrire plein de choses !";
                Speak("Tu as tout écrit ! Quelle écriture magnifique !");
                ScheduleNext(5200);
            }
            else Schedule(3400, () => StartItem());
        }
    }
}
