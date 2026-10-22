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
    /// « Le nombre dans tous ses états » (MS — maths : reconnaître les nombres
    /// de différentes manières, comme les abaques et boîtes à compter de
    /// l'école) : le même nombre se montre en CHIFFRE, en points sur un DÉ,
    /// en perles sur un ABAQUE et en OBJETS. Acte 1 : le défilé des formes
    /// (chacune se présente). Actes 2-3 : retrouver le dé / l'abaque qui
    /// montre le nombre demandé — l'erreur compte avec l'enfant. Zéro lecture.
    /// </summary>
    public sealed class NumberFormsGame : GameControl
    {
        private readonly Random _rng = new Random();
        private int _act;
        private int _round;

        public NumberFormsGame(Action celebrate) : base(celebrate) { }

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
            else if (_act == 2 && _round > 3) { _act = 3; _round = 1; }
            else if (_act == 3 && _round > 3)
            {
                Question.Text = "🔢 Champion des nombres !";
                Speak("Bravo ! Tu reconnais les nombres partout !");
                GameKit.Success();
                Celebrate();
                Schedule(3200, NewRound);
                return;
            }
            if (_act == 1) Parade();
            else Quiz();
        }

        // ------------------------------------------------------------------
        //  Les quatre VISUELS d'un nombre
        // ------------------------------------------------------------------
        private static FrameworkElement Digit(int n, double size) =>
            Art.Find("chiffre-" + n) is ImageSource img
                ? new Image { Source = img, Width = size, Height = size, Stretch = Stretch.Uniform }
                : (FrameworkElement)new Viewbox
        {
            Width = size,
            Height = size,
            Child = new TextBlock
            {
                Text = n.ToString(),
                FontSize = 120,
                FontWeight = FontWeights.ExtraBold,
                Foreground = new SolidColorBrush(Color.FromRgb(0xE8, 0x5A, 0x2C)),
            },
        };

        // Le dé : points noirs disposés comme sur un vrai dé.
        private static FrameworkElement Dice(int n, double size)
        {
            if (Art.Find("de-" + n) is ImageSource dimg) // la face de dé dessinée
                return new Image { Source = dimg, Width = size, Height = size, Stretch = Stretch.Uniform };
            var c = new Canvas { Width = 200, Height = 200 };
            c.Children.Add(new Rectangle
            {
                Width = 200,
                Height = 200,
                RadiusX = 34,
                RadiusY = 34,
                Fill = Brushes.White,
                Stroke = new SolidColorBrush(Color.FromRgb(0x4A, 0x3A, 0x5A)),
                StrokeThickness = 8,
            });
            var spots = new Dictionary<int, (double X, double Y)[]>
            {
                [1] = new[] { (100.0, 100.0) },
                [2] = new[] { (58.0, 58.0), (142.0, 142.0) },
                [3] = new[] { (52.0, 52.0), (100.0, 100.0), (148.0, 148.0) },
                [4] = new[] { (58.0, 58.0), (142.0, 58.0), (58.0, 142.0), (142.0, 142.0) },
                [5] = new[] { (55.0, 55.0), (145.0, 55.0), (100.0, 100.0), (55.0, 145.0), (145.0, 145.0) },
            };
            foreach (var (x, y) in spots[Math.Max(1, Math.Min(5, n))])
            {
                var dot = new Ellipse { Width = 34, Height = 34, Fill = new SolidColorBrush(Color.FromRgb(0x2A, 0x22, 0x30)) };
                Canvas.SetLeft(dot, x - 17);
                Canvas.SetTop(dot, y - 17);
                c.Children.Add(dot);
            }
            return new Viewbox { Width = size, Height = size, Child = c };
        }

        // L'abaque : une tige avec n perles colorées enfilées.
        private static readonly Color[] BeadColors =
        {
            Color.FromRgb(0xE8, 0x3A, 0x3A), Color.FromRgb(0xFF, 0xC1, 0x07),
            Color.FromRgb(0x6B, 0xCB, 0x77), Color.FromRgb(0x3B, 0x9B, 0xFF),
            Color.FromRgb(0xA0, 0x6C, 0xD5),
        };

        private static FrameworkElement Abacus(int n, double size)
        {
            var c = new Canvas { Width = 200, Height = 200 };
            // Le socle et la tige.
            var baseR = new Rectangle { Width = 150, Height = 22, RadiusX = 10, RadiusY = 10, Fill = new SolidColorBrush(Color.FromRgb(0x8A, 0x5A, 0x30)) };
            Canvas.SetLeft(baseR, 25);
            Canvas.SetTop(baseR, 168);
            c.Children.Add(baseR);
            var rod = new Rectangle { Width = 14, Height = 150, RadiusX = 6, RadiusY = 6, Fill = new SolidColorBrush(Color.FromRgb(0xB5, 0x7A, 0x45)) };
            Canvas.SetLeft(rod, 93);
            Canvas.SetTop(rod, 24);
            c.Children.Add(rod);
            // Les perles, empilées depuis le bas.
            for (int i = 0; i < Math.Max(1, Math.Min(5, n)); i++)
            {
                var bead = new Ellipse
                {
                    Width = 64,
                    Height = 30,
                    Fill = new SolidColorBrush(BeadColors[i % BeadColors.Length]),
                    Stroke = new SolidColorBrush(Color.FromRgb(0x4A, 0x3A, 0x5A)),
                    StrokeThickness = 3,
                };
                Canvas.SetLeft(bead, 68);
                Canvas.SetTop(bead, 138 - i * 28);
                c.Children.Add(bead);
            }
            return new Viewbox { Width = size, Height = size, Child = c };
        }

        private static readonly string[] ObjEmojis = { "🍎", "🌟", "🐟", "🎈", "🌼" };

        private FrameworkElement Objects(int n, double size)
        {
            var emoji = ObjEmojis[_rng.Next(ObjEmojis.Length)];
            var wrap = new WrapPanel { Width = 190, HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center };
            for (int i = 0; i < n; i++)
            {
                var o = Art.ForEmoji(emoji, 64); // le dessin cartoon si on l'a
                o.Margin = new Thickness(4);
                wrap.Children.Add(o);
            }
            return new Viewbox { Width = size, Height = size, Child = new Grid { Width = 200, Height = 200, Children = { wrap } } };
        }

        // ------------------------------------------------------------------
        //  Acte 1 : le défilé — le même nombre sous quatre habits
        // ------------------------------------------------------------------
        private void Parade()
        {
            int n = GameKit.NextNumber("formes-defile", 1, Math.Min(6, Level.MaxNumber)); // le dé s'arrête à 6
            Question.Text = "🔢 Le nombre dans tous ses états";
            SetConsigne(Digit(n, 110),
                () => "Le nombre " + n + " peut se montrer de plein de façons ! Regarde chaque carte : elle se présente !");

            var row = Row();
            var forms = new (FrameworkElement Visual, string Said)[]
            {
                (Digit(n, 200), "Le CHIFFRE " + n + " !"),
                (Dice(n, 200), n + " points sur le dé ! " + CountWords(n)),
                (Abacus(n, 200), n + " perles sur l'abaque ! " + CountWords(n)),
                (Objects(n, 200), n + " objets ! " + CountWords(n)),
            };
            int seen = 0;
            var done = new bool[forms.Length];
            for (int i = 0; i < forms.Length; i++)
            {
                var f = forms[i];
                int idx = i;
                var btn = AnswerButton(f.Visual, 250);
                var captured = btn;
                btn.Click += (s, e) =>
                {
                    if (Locked) return;
                    Pop(captured);
                    SpeakSlow(f.Said);
                    if (!done[idx]) { done[idx] = true; seen++; }
                    if (seen == forms.Length)
                    {
                        Locked = true;
                        Schedule(2600, () =>
                        {
                            Speak("Toujours " + n + " ! C'est le même nombre !");
                            Schedule(3400, Next);
                        });
                    }
                };
                row.Children.Add(btn);
            }
            SetBody(row);
            Speak("Le nombre " + n + " ! Il peut se montrer de plein de façons ! Regarde chaque carte !");
        }

        // ------------------------------------------------------------------
        //  Actes 2-3 : retrouve la bonne carte (dé, abaque ou objets)
        // ------------------------------------------------------------------
        private void Quiz()
        {
            int n = GameKit.NextNumber("formes-quiz", 1, Math.Min(6, Level.MaxNumber));
            // ADAPTATION : 2 cartes au niveau 0, 3 au niveau 1, 4 au niveau 2.
            int nChoices = 2 + Adaptive.Level("nombres-formes");
            var wrong = Enumerable.Range(1, 5).Where(v => v != n).OrderBy(v => _rng.Next()).Take(nChoices - 1).ToList();
            var values = wrong.Concat(new[] { n }).OrderBy(v => _rng.Next()).ToList();
            int kind = _rng.Next(3); // 0 dé · 1 abaque · 2 objets
            string kindName = kind == 0 ? "le dé" : kind == 1 ? "l'abaque" : "la carte d'objets";
            Button correctBtn = null;

            if (_act == 2)
            {
                // Le chiffre est donné → trouve la représentation.
                Question.Text = "🎲 Trouve " + kindName + " qui montre…";
                SetConsigne(Digit(n, 120),
                    () => "Trouve " + kindName + " qui montre " + n + " ! Compte bien !");
                var row = Row();
                foreach (var v in values)
                {
                    var vv = v;
                    var visual = kind == 0 ? Dice(vv, 210) : kind == 1 ? Abacus(vv, 210) : Objects(vv, 210);
                    var btn = AnswerButton(visual, 260);
                    var captured = btn;
                    if (vv == n) correctBtn = btn;
                    btn.Click += (s, e) => Answer(vv, n, captured);
                    row.Children.Add(btn);
                }
                SetBody(row);
                ArmHint(correctBtn, () => "Trouve " + kindName + " qui montre " + n + " ! Compte bien !");
                Speak("Trouve " + kindName + " qui montre " + n + " !");
            }
            else
            {
                // La représentation est donnée → trouve le chiffre.
                Question.Text = "🔢 Quel nombre montre cette carte ?";
                var model = kind == 0 ? Dice(n, 130) : kind == 1 ? Abacus(n, 130) : Objects(n, 130);
                SetConsigne(model, () => "Compte bien ce que montre la carte... et choisis le bon chiffre !");
                var row = Row();
                foreach (var v in values)
                {
                    var vv = v;
                    var btn = AnswerButton(Digit(vv, 180), 230);
                    var captured = btn;
                    if (vv == n) correctBtn = btn;
                    btn.Click += (s, e) => Answer(vv, n, captured);
                    row.Children.Add(btn);
                }
                SetBody(row);
                ArmHint(correctBtn, () => "Compte bien la carte... et choisis le bon chiffre !");
                Speak("Compte bien... et trouve le chiffre !");
            }
        }

        private void Answer(int chosen, int target, Button btn)
        {
            if (Locked) return;
            if (chosen == target)
            {
                Adaptive.Report("nombres-formes", true);
                Locked = true;
                Pop(btn);
                GameKit.Success();
                Speak("Oui ! " + target + " ! " + CountWords(target) + " Bravo !");
                Celebrate();
                Schedule(2600, Next);
            }
            else
            {
                Adaptive.Report("nombres-formes", false);
                Shake(btn);
                Speak("On compte : " + CountWords(chosen) + " Ça fait " + chosen + ", pas " + target + " ! Cherche encore !");
            }
        }

        private static string CountWords(int n)
            => string.Join(", ", Enumerable.Range(1, n)) + " !";

        private static void Pop(FrameworkElement el)
        {
            el.RenderTransformOrigin = new Point(0.5, 0.5);
            var sc = new ScaleTransform(1, 1);
            el.RenderTransform = sc;
            var pop = new DoubleAnimation(1, 1.15, TimeSpan.FromMilliseconds(260))
            { AutoReverse = true, EasingFunction = new SineEase() };
            sc.BeginAnimation(ScaleTransform.ScaleXProperty, pop);
            sc.BeginAnimation(ScaleTransform.ScaleYProperty, pop);
        }
    }
}
