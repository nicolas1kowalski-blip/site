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
    /// « Le collier de perles » (MS — « enfiler en respectant les couleurs »,
    /// droit du programme de l'école, version regard) : un collier MODÈLE en
    /// haut ; l'enfant enfile les perles une par une en suivant les couleurs —
    /// chaque perle GLISSE le long du fil jusqu'à sa place (note de musique).
    /// À la fin, le collier brille et va au cou du nounours 🧸. L'erreur
    /// guide : la perle attendue clignote sur le modèle.
    /// </summary>
    public sealed class NecklaceGame : GameControl
    {
        private const double W = 1460, H = 640;

        private static readonly (Color C, string Name)[] Beads =
        {
            (Color.FromRgb(0xE8, 0x3A, 0x3A), "rouge"),
            (Color.FromRgb(0x3B, 0x9B, 0xFF), "bleue"),
            (Color.FromRgb(0xFF, 0xC1, 0x07), "jaune"),
            (Color.FromRgb(0x6B, 0xCB, 0x77), "verte"),
        };

        private readonly Random _rng = new Random();
        private Canvas _canvas;
        private int _act;      // 1 : 4 perles (A-B) · 2 : 6 perles (A-B-C)
        private int _round;
        private int[] _pattern;
        private int _next;
        private Ellipse[] _modelBeads;

        public NecklaceGame(Action celebrate) : base(celebrate) { }

        protected override void NewRound()
        {
            _act = 1;
            _round = 0;
            Next();
        }

        private void Next()
        {
            Locked = false;
            _round++;
            if (_act == 1 && _round > 2) { _act = 2; _round = 1; }
            else if (_act == 2 && _round > 2)
            {
                Question.Text = "📿 Quel beau bijou !";
                Speak("Bravo ! Nounours est ravi !");
                GameKit.Success();
                Celebrate();
                Schedule(3200, NewRound);
                return;
            }

            // Le motif : A-B répété (acte 1) ou A-B-C répété (acte 2).
            int kinds = _act == 1 ? 2 : 3;
            int length = _act == 1 ? 4 : 6;
            var chosen = Enumerable.Range(0, Beads.Length).OrderBy(i => _rng.Next()).Take(kinds).ToArray();
            _pattern = new int[length];
            for (int i = 0; i < length; i++) _pattern[i] = chosen[i % kinds];
            _next = 0;

            Question.Text = "📿 Le collier de perles";
            SetConsigne(new TextBlock { Text = "📿🧸" },
                () => "Regarde le collier modèle ! Enfile les perles dans le MÊME ordre des couleurs, une par une !");

            _canvas = new Canvas { Width = W, Height = H };
            _canvas.Children.Add(new Rectangle
            {
                Width = W,
                Height = H,
                RadiusX = 26,
                RadiusY = 26,
                Fill = new LinearGradientBrush(Color.FromRgb(0xFF, 0xE9, 0xF2), Color.FromRgb(0xFF, 0xF6, 0xDE), 90),
            });
            AddDecor("🧸", W - 220, H - 300, 180);
            AddDecor("✨", 60, 60, 50);

            // Le collier MODÈLE en haut (fil + perles).
            BuildString(140, 90, model: true);
            // Le fil de l'ENFANT au milieu (vide, avec les emplacements).
            BuildString(140, 280, model: false);

            // Les perles à choisir, en bas.
            var used = chosen.ToArray();
            double bw = 170, gap = 60;
            double x0 = (W - used.Length * bw - (used.Length - 1) * gap) / 2 - 120;
            for (int k = 0; k < used.Length; k++)
            {
                int kind = used[k];
                var btn = new Button
                {
                    Style = (Style)Application.Current.Resources["AnswerButton"],
                    Width = bw,
                    Height = 150,
                    Content = BeadVisual(kind, 100),
                };
                var captured = btn;
                btn.Click += (s, e) => Choose(kind, captured);
                Canvas.SetLeft(btn, x0 + k * (bw + gap));
                Canvas.SetTop(btn, H - 185);
                _canvas.Children.Add(btn);
            }

            SetBody(_canvas);
            Speak(_round == 1 && _act == 1
                ? "Le collier de perles ! Regarde le modèle en haut... et enfile les perles dans le même ordre !"
                : _act == 2 && _round == 1
                    ? "Maintenant un GRAND collier à trois couleurs ! Regarde bien l'ordre !"
                    : "Un nouveau collier ! Regarde bien le modèle !");
        }

        private double SlotX(int i) => 240 + i * 130;
        private const double StringY = 60;

        private void BuildString(double x, double y, bool model)
        {
            // Le fil : une jolie courbe.
            var path = new System.Windows.Shapes.Path
            {
                Stroke = new SolidColorBrush(Color.FromRgb(0x8A, 0x5A, 0x30)),
                StrokeThickness = 7,
                StrokeStartLineCap = PenLineCap.Round,
                StrokeEndLineCap = PenLineCap.Round,
                Data = Geometry.Parse(FormattableString.Invariant(
                    $"M {x},{y + 50} Q {x + 480},{y + 110} {x + 960},{y + 50}")),
            };
            _canvas.Children.Add(path);

            if (model)
            {
                _modelBeads = new Ellipse[_pattern.Length];
                for (int i = 0; i < _pattern.Length; i++)
                {
                    var bead = Bead(_pattern[i], 72);
                    Canvas.SetLeft(bead, SlotX(i));
                    Canvas.SetTop(bead, y + StringY - 20 + Dip(i));
                    _canvas.Children.Add(bead);
                    _modelBeads[i] = bead;
                }
            }
            else
            {
                for (int i = 0; i < _pattern.Length; i++)
                {
                    var slot = new Ellipse
                    {
                        Width = 72,
                        Height = 72,
                        Stroke = new SolidColorBrush(Color.FromRgb(0xB8, 0xB0, 0xC8)),
                        StrokeThickness = 4,
                        StrokeDashArray = new DoubleCollection { 4, 3 },
                        Fill = Brushes.Transparent,
                        IsHitTestVisible = false,
                    };
                    Canvas.SetLeft(slot, SlotX(i));
                    Canvas.SetTop(slot, y + StringY - 20 + Dip(i));
                    _canvas.Children.Add(slot);
                }
            }
        }

        // La courbe du fil fait plonger un peu les perles du milieu.
        private double Dip(int i)
        {
            double t = _pattern.Length <= 1 ? 0.5 : i / (double)(_pattern.Length - 1);
            return 55 * 4 * t * (1 - t) * 0.5;
        }

        private static Ellipse Bead(int kind, double size)
        {
            var bead = new Ellipse
            {
                Width = size,
                Height = size,
                Fill = new RadialGradientBrush(Colors.White, Beads[kind].C) { Center = new Point(0.35, 0.3), GradientOrigin = new Point(0.35, 0.3) },
                Stroke = new SolidColorBrush(VecKit.Shade(Beads[kind].C, 0.7)),
                StrokeThickness = 4,
                RenderTransformOrigin = new Point(0.5, 0.5),
            };
            bead.RenderTransform = new ScaleTransform(1, 1);
            return bead;
        }

        private static FrameworkElement BeadVisual(int kind, double size) => Bead(kind, size);

        private void Choose(int kind, Button btn)
        {
            if (Locked || _next >= _pattern.Length) return;
            int want = _pattern[_next];
            if (kind != want)
            {
                Shake(btn);
                // La perle attendue clignote sur le MODÈLE.
                var mb = _modelBeads[_next];
                var sc = (ScaleTransform)mb.RenderTransform;
                var pulse = new DoubleAnimation(1, 1.4, TimeSpan.FromMilliseconds(300))
                { AutoReverse = true, RepeatBehavior = new RepeatBehavior(3) };
                sc.BeginAnimation(ScaleTransform.ScaleXProperty, pulse);
                sc.BeginAnimation(ScaleTransform.ScaleYProperty, pulse);
                Speak("Regarde le modèle : la prochaine perle est " + Beads[want].Name + " !");
                return;
            }

            // La perle GLISSE le long du fil jusqu'à sa place.
            int slot = _next;
            _next++;
            var bead = Bead(kind, 72);
            double x1 = SlotX(slot), y1 = 280 + StringY - 20 + Dip(slot);
            Canvas.SetLeft(bead, 150);
            Canvas.SetTop(bead, 280 + StringY - 20);
            bead.SetValue(Panel.ZIndexProperty, 60);
            _canvas.Children.Add(bead);
            var ax = new DoubleAnimation(150, x1, TimeSpan.FromMilliseconds(700))
            { EasingFunction = new SineEase { EasingMode = EasingMode.EaseOut } };
            var ay = new DoubleAnimation(280 + StringY - 20, y1, TimeSpan.FromMilliseconds(700))
            { EasingFunction = new SineEase() };
            ay.Completed += (s, e) =>
            {
                SoundFx.Note(slot);
                Speak(Beads[kind].Name + " !");
                if (_next < _pattern.Length) return;

                // Collier fini : il brille puis va au cou du nounours.
                Locked = true;
                Schedule(900, () =>
                {
                    GameKit.Success();
                    Speak("Le collier est fini ! Pour Nounours !");
                    for (int i = 0; i < 8; i++)
                    {
                        var sp = new TextBlock { Text = "✨", FontSize = 30, IsHitTestVisible = false };
                        Canvas.SetLeft(sp, 200 + _rng.Next(900));
                        Canvas.SetTop(sp, 300 + _rng.Next(120));
                        sp.SetValue(Panel.ZIndexProperty, 70);
                        _canvas.Children.Add(sp);
                        var fade = new DoubleAnimation(1, 0, TimeSpan.FromMilliseconds(1100))
                        { BeginTime = TimeSpan.FromMilliseconds(i * 100) };
                        var captured = sp;
                        fade.Completed += (s2, e2) => _canvas.Children.Remove(captured);
                        sp.BeginAnimation(OpacityProperty, fade);
                    }
                    // Un petit collier apparaît au cou du nounours.
                    Schedule(1400, () =>
                    {
                        var mini = new TextBlock { Text = "📿", FontSize = 70, IsHitTestVisible = false, RenderTransformOrigin = new Point(0.5, 0.5) };
                        var msc = new ScaleTransform(0.2, 0.2);
                        mini.RenderTransform = msc;
                        Canvas.SetLeft(mini, W - 165);
                        Canvas.SetTop(mini, H - 190);
                        mini.SetValue(Panel.ZIndexProperty, 71);
                        _canvas.Children.Add(mini);
                        var grow = new DoubleAnimation(0.2, 1, TimeSpan.FromMilliseconds(450))
                        { EasingFunction = new BackEase { EasingMode = EasingMode.EaseOut, Amplitude = 0.8 } };
                        msc.BeginAnimation(ScaleTransform.ScaleXProperty, grow);
                        msc.BeginAnimation(ScaleTransform.ScaleYProperty, grow);
                        SoundFx.PopSound();
                        Celebrate();
                        Schedule(2600, Next);
                    });
                });
            };
            bead.BeginAnimation(Canvas.LeftProperty, ax);
            bead.BeginAnimation(Canvas.TopProperty, ay);
        }

        private void AddDecor(string emoji, double x, double y, double size)
        {
            var t = new TextBlock { Text = emoji, FontSize = size, IsHitTestVisible = false };
            Canvas.SetLeft(t, x);
            Canvas.SetTop(t, y);
            _canvas.Children.Add(t);
        }
    }
}
