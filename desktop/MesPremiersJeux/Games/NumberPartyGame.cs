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
    /// « La fête des nombres » (1 à 5, PS/MS), en trois actes, pensée pour un
    /// enfant qui NE LIT PAS : consignes dites à voix haute (bouton 🔊 pour les
    /// réentendre) et montrées en grand.
    ///   1. Les ballons — découverte : chaque ballon regardé dit son nombre et
    ///      fait éclater autant d'étoiles.
    ///   2. Trouve le nombre — le chiffre modèle en GRAND + 🔊, et des chiffres
    ///      à choisir (2, puis 3, puis 4 choix).
    ///   3. Compte avec moi — des animaux à compter, et le bon chiffre à choisir ;
    ///      la réponse est comptée à voix haute : « Un, deux, trois ! »
    /// Chaque chiffre garde SA couleur d'un acte à l'autre.
    /// </summary>
    public sealed class NumberPartyGame : GameControl
    {
        private const double W = 1400, H = 680;
        private const int Max = 5;

        private static readonly Color[] NColor =
        {
            Color.FromRgb(0xE8, 0x43, 0x3A), Color.FromRgb(0xF2, 0xA6, 0x0F),
            Color.FromRgb(0x2E, 0x7F, 0xE8), Color.FromRgb(0x2F, 0xA3, 0x4D),
            Color.FromRgb(0x8E, 0x5B, 0xD9),
        };
        private static readonly string[] NWord = { "un", "deux", "trois", "quatre", "cinq" };
        private static readonly (string Emoji, string Name)[] Animals =
        {
            ("🦋", "papillons"), ("🐥", "poussins"), ("🐞", "coccinelles"),
            ("🐟", "poissons"), ("🐰", "lapins"),
        };

        private Canvas _canvas;
        private int _phase;
        private bool[] _seen;
        private List<int> _findOrder;
        private int _findRound, _countRound;
        private List<TextBlock> _countAnimals;

        public NumberPartyGame(Action celebrate) : base(celebrate) { }

        protected override void NewRound()
        {
            StartDiscovery();
        }

        private Color ColOf(int n) => NColor[(n - 1) % NColor.Length];

        // Tuile-chiffre colorée et brillante.
        private Grid DigitVisual(int n, double size)
        {
            var g = new Grid { Width = size, Height = size };
            g.Children.Add(new Border
            {
                CornerRadius = new CornerRadius(size * 0.22),
                Background = new LinearGradientBrush(Lighten(ColOf(n)), ColOf(n), 90),
                BorderBrush = Brushes.White,
                BorderThickness = new Thickness(5),
            });
            g.Children.Add(new TextBlock
            {
                Text = n.ToString(),
                FontSize = size * 0.58,
                FontWeight = FontWeights.ExtraBold,
                Foreground = Brushes.White,
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, -size * 0.04, 0, 0),
            });
            return g;
        }

        // ==================================================================
        // ACTE 1 — les ballons des nombres (découverte sans échec).
        // ==================================================================
        private void StartDiscovery()
        {
            _phase = 1;
            Locked = false;
            Question.Text = "🎈 La fête des nombres";
            _canvas = new Canvas { Width = W, Height = H };
            _seen = new bool[Max + 1];

            double size = 205, gap = 32;
            double x0 = (W - Max * size - (Max - 1) * gap) / 2, y = 90;
            for (int n = 1; n <= Max; n++)
            {
                var balloon = new Grid { Width = size, Height = size };
                balloon.Children.Add(new Ellipse
                {
                    Width = size * 0.8,
                    Height = size * 0.9,
                    Fill = new RadialGradientBrush(Lighten(ColOf(n)), ColOf(n))
                    { GradientOrigin = new Point(0.35, 0.3), Center = new Point(0.35, 0.3) },
                    Stroke = Brushes.White,
                    StrokeThickness = 4,
                    VerticalAlignment = VerticalAlignment.Top,
                    HorizontalAlignment = HorizontalAlignment.Center,
                });
                balloon.Children.Add(new TextBlock
                {
                    Text = n.ToString(),
                    FontSize = size * 0.42,
                    FontWeight = FontWeights.ExtraBold,
                    Foreground = Brushes.White,
                    HorizontalAlignment = HorizontalAlignment.Center,
                    VerticalAlignment = VerticalAlignment.Top,
                    Margin = new Thickness(0, size * 0.2, 0, 0),
                });
                balloon.Children.Add(new TextBlock
                {
                    Text = "🎀",
                    FontSize = size * 0.14,
                    HorizontalAlignment = HorizontalAlignment.Center,
                    VerticalAlignment = VerticalAlignment.Bottom,
                    Margin = new Thickness(0, 0, 0, size * 0.02),
                });

                var btn = new Button
                {
                    Style = (Style)Application.Current.Resources["BalloonButton"],
                    Width = size,
                    Height = size,
                    Content = balloon,
                    RenderTransformOrigin = new Point(0.5, 0.5),
                };
                int num = n;
                var captBtn = btn;
                btn.Click += (s, e) => DiscoverBalloon(captBtn, num);
                Canvas.SetLeft(btn, x0 + (n - 1) * (size + gap));
                Canvas.SetTop(btn, y);
                _canvas.Children.Add(btn);
            }

            var speaker = SpeakerButton(() => "Regarde chaque ballon pour entendre son nombre !");
            Canvas.SetLeft(speaker, W - 150);
            Canvas.SetTop(speaker, 30);
            _canvas.Children.Add(speaker);

            SetBody(_canvas);
            Schedule(450, () => Speak("La fête des nombres ! Regarde chaque ballon pour entendre son nombre !"));
        }

        private void DiscoverBalloon(Button btn, int n)
        {
            if (_phase != 1 || Locked) return;
            Bounce(btn);
            Speak(Cap(NWord[n - 1]) + " !");

            // n étoiles éclatent autour du ballon — on VOIT la quantité.
            double cx = Canvas.GetLeft(btn) + btn.Width / 2;
            double cy = Canvas.GetTop(btn) + btn.Height / 2;
            var rng = new Random();
            for (int i = 0; i < n; i++)
            {
                var star = new TextBlock { Text = "⭐", FontSize = 40, IsHitTestVisible = false };
                star.SetValue(Panel.ZIndexProperty, 60);
                Canvas.SetLeft(star, cx - 20);
                Canvas.SetTop(star, cy - 20);
                _canvas.Children.Add(star);
                double ang = Math.PI * 2 * i / n - Math.PI / 2;
                double dist = 130 + rng.Next(40);
                var tt = new TranslateTransform();
                star.RenderTransform = tt;
                var dur = TimeSpan.FromMilliseconds(800 + rng.Next(300));
                tt.BeginAnimation(TranslateTransform.XProperty,
                    new DoubleAnimation(0, Math.Cos(ang) * dist, dur) { EasingFunction = new QuadraticEase { EasingMode = EasingMode.EaseOut } });
                tt.BeginAnimation(TranslateTransform.YProperty,
                    new DoubleAnimation(0, Math.Sin(ang) * dist, dur) { EasingFunction = new QuadraticEase { EasingMode = EasingMode.EaseOut } });
                var fade = new DoubleAnimation(1, 0, dur) { BeginTime = TimeSpan.FromMilliseconds(600) };
                var captured = star;
                fade.Completed += (s, e) => _canvas.Children.Remove(captured);
                star.BeginAnimation(UIElement.OpacityProperty, fade);
            }

            if (!_seen[n])
            {
                _seen[n] = true;
                var badge = new TextBlock { Text = "⭐", FontSize = 30, IsHitTestVisible = false };
                Canvas.SetLeft(badge, Canvas.GetLeft(btn) + btn.Width - 26);
                Canvas.SetTop(badge, Canvas.GetTop(btn) - 12);
                _canvas.Children.Add(badge);
            }
            if (Enumerable.Range(1, Max).All(k => _seen[k]))
            {
                _phase = 0;
                Locked = true;
                Speak("Bravo ! Et maintenant, retrouve les nombres !");
                Schedule(2600, () =>
                {
                    _findOrder = GameKit.Shuffle(Enumerable.Range(1, Max));
                    _findRound = 0;
                    NextFind();
                });
            }
        }

        // ==================================================================
        // ACTE 2 — « Trouve le 3 ! » : modèle en GRAND + 🔊, chiffres à choisir.
        // ==================================================================
        private void NextFind()
        {
            if (_findRound >= _findOrder.Count)
            {
                Locked = true;
                Celebrate();
                Speak("Super ! Maintenant... compte avec moi !");
                Schedule(2600, () => { _countRound = 0; NextCount(); });
                return;
            }

            _phase = 2;
            Locked = false;
            int target = _findOrder[_findRound];
            Question.Text = "🔎 Trouve le " + target + " !";
            _canvas = new Canvas { Width = W, Height = H };

            var card = new Border
            {
                CornerRadius = new CornerRadius(30),
                Background = Brushes.White,
                BorderBrush = new SolidColorBrush(Color.FromRgb(0xFF, 0xC1, 0x07)),
                BorderThickness = new Thickness(6),
                Padding = new Thickness(16),
                Child = DigitVisual(target, 175),
            };
            Canvas.SetLeft(card, W / 2 - 175);
            Canvas.SetTop(card, 12);
            _canvas.Children.Add(card);
            int spoken = target;
            var speaker = SpeakerButton(() => "Trouve le " + NWord[spoken - 1] + " ! Cherche le chiffre pareil !");
            Canvas.SetLeft(speaker, W / 2 + 85);
            Canvas.SetTop(speaker, 62);
            _canvas.Children.Add(speaker);

            int nChoices = _findRound < 2 ? 2 : (_findRound < 4 ? 3 : 4);
            var picks = new List<int> { target };
            foreach (var k in GameKit.Shuffle(Enumerable.Range(1, Max).Where(v => v != target)))
            {
                if (picks.Count >= nChoices) break;
                picks.Add(k);
            }
            picks = GameKit.Shuffle(picks);

            double size = Math.Min(230, (W - 200) / picks.Count - 30), gap = 46;
            double total = picks.Count * size + (picks.Count - 1) * gap;
            double x0 = (W - total) / 2, y = 390;
            for (int i = 0; i < picks.Count; i++)
            {
                int n = picks[i];
                var btn = new Button
                {
                    Style = (Style)Application.Current.Resources["BalloonButton"],
                    Width = size,
                    Height = size,
                    Content = DigitVisual(n, size * 0.94),
                    RenderTransformOrigin = new Point(0.5, 0.5),
                };
                int captured = n;
                var captBtn = btn;
                btn.Click += (s, e) => PickDigit(captBtn, captured, spoken);
                Canvas.SetLeft(btn, x0 + i * (size + gap));
                Canvas.SetTop(btn, y);
                _canvas.Children.Add(btn);
            }

            SetBody(_canvas);
            Schedule(400, () => Speak("Trouve le " + NWord[target - 1] + " !"));
        }

        private void PickDigit(Button btn, int n, int target)
        {
            if (_phase != 2 || Locked) return;
            if (n == target)
            {
                Locked = true;
                GameKit.Success();
                Speak("Oui, c'est le " + NWord[target - 1] + " ! " + GameKit.Praise());
                Bounce(btn);
                _findRound++;
                Schedule(1700, NextFind);
            }
            else
            {
                GameKit.Wrong();
                Shake(btn);
                Speak("Ça, c'est le " + NWord[n - 1] + ". Cherche le " + NWord[target - 1] + " !");
            }
        }

        // ==================================================================
        // ACTE 3 — « Compte avec moi » : des animaux, et le bon chiffre.
        // ==================================================================
        private void NextCount()
        {
            if (_countRound >= 4)
            {
                Locked = true;
                Question.Text = "🎉 Tu sais compter jusqu'à 5 !";
                Celebrate();
                Speak("Bravo ! Tu sais compter jusqu'à cinq ! Quelle fête !");
                ScheduleNext(4800);
                return;
            }

            _phase = 3;
            Locked = false;
            int k = 1 + GameKit.RandInt(Max);
            var animal = Animals[GameKit.RandInt(Animals.Length)];
            Question.Text = "🧮 Combien de " + animal.Name + " ?";
            _canvas = new Canvas { Width = W, Height = H };

            // Les animaux à compter, en GRAND au centre (on garde chaque animal
            // pour le comptage interactif : le chiffre s'affichera au-dessus).
            _countAnimals = new List<TextBlock>();
            double aw = 130;
            double ax0 = (W - k * aw) / 2;
            for (int i = 0; i < k; i++)
            {
                var a = new TextBlock
                {
                    Text = animal.Emoji,
                    FontSize = 104,
                    IsHitTestVisible = false,
                    RenderTransformOrigin = new Point(0.5, 0.5),
                };
                Canvas.SetLeft(a, ax0 + i * aw);
                Canvas.SetTop(a, 150);
                _canvas.Children.Add(a);
                _countAnimals.Add(a);
            }

            int spokenK = k;
            string name = animal.Name;
            var speaker = SpeakerButton(() => "Compte les " + name + " ! Combien il y en a ?");
            Canvas.SetLeft(speaker, W - 150);
            Canvas.SetTop(speaker, 40);
            _canvas.Children.Add(speaker);

            // Trois chiffres au choix.
            var picks = new List<int> { k };
            foreach (var v in GameKit.Shuffle(Enumerable.Range(1, Max).Where(x => x != k)))
            {
                if (picks.Count >= 3) break;
                picks.Add(v);
            }
            picks = GameKit.Shuffle(picks);

            double size = 220, gap = 70;
            double x0 = (W - 3 * size - 2 * gap) / 2, y = 380;
            for (int i = 0; i < picks.Count; i++)
            {
                int n = picks[i];
                var btn = new Button
                {
                    Style = (Style)Application.Current.Resources["BalloonButton"],
                    Width = size,
                    Height = size,
                    Content = DigitVisual(n, size * 0.94),
                    RenderTransformOrigin = new Point(0.5, 0.5),
                };
                int captured = n;
                var captBtn = btn;
                btn.Click += (s, e) => PickCount(captBtn, captured, spokenK, name);
                Canvas.SetLeft(btn, x0 + i * (size + gap));
                Canvas.SetTop(btn, y);
                _canvas.Children.Add(btn);
            }

            SetBody(_canvas);
            Schedule(400, () => Speak("Compte les " + name + " ! Combien il y en a ?"));
        }

        private void PickCount(Button btn, int n, int k, string name)
        {
            if (_phase != 3 || Locked) return;
            if (n == k)
            {
                Locked = true;
                GameKit.Success();
                Bounce(btn);
                // COMPTAGE INTERACTIF : on compte à voix haute ET le chiffre
                // s'affiche au-dessus de chaque animal, un par un : 1... 2... 3...
                CountStep(0, k, name);
            }
            else
            {
                GameKit.Wrong();
                Shake(btn);
                Speak("Non, ça c'est le " + NWord[n - 1] + ". Compte encore !");
            }
        }

        // Compte un animal à la fois : le mot est DIT, l'animal saute, et le
        // chiffre correspondant apparaît au-dessus de lui — 1, puis 2, puis 3…
        private void CountStep(int i, int k, string name)
        {
            if (i >= k)
            {
                Speak(Cap(NWord[k - 1]) + " " + name + " ! " + GameKit.Praise());
                _countRound++;
                Schedule(2300, NextCount);
                return;
            }

            var animal = _countAnimals[i];
            Speak(NWord[i]);
            Bounce(animal);

            var badge = DigitVisual(i + 1, 74);
            badge.IsHitTestVisible = false;
            badge.RenderTransformOrigin = new Point(0.5, 0.5);
            var sc = new ScaleTransform(0.2, 0.2);
            badge.RenderTransform = sc;
            Canvas.SetLeft(badge, Canvas.GetLeft(animal) + 15);
            Canvas.SetTop(badge, 56);
            badge.SetValue(Panel.ZIndexProperty, 70);
            _canvas.Children.Add(badge);
            var pop = new DoubleAnimation(0.2, 1, TimeSpan.FromMilliseconds(340))
            { EasingFunction = new BackEase { EasingMode = EasingMode.EaseOut, Amplitude = 0.8 } };
            sc.BeginAnimation(ScaleTransform.ScaleXProperty, pop);
            sc.BeginAnimation(ScaleTransform.ScaleYProperty, pop);

            Schedule(880, () => CountStep(i + 1, k, name));
        }

        // --- Petits effets. ---
        private static void Bounce(FrameworkElement el)
        {
            var sc = new ScaleTransform(1, 1);
            el.RenderTransform = sc;
            var pop = new DoubleAnimation(1, 1.28, TimeSpan.FromMilliseconds(280))
            { AutoReverse = true, EasingFunction = new SineEase() };
            sc.BeginAnimation(ScaleTransform.ScaleXProperty, pop);
            sc.BeginAnimation(ScaleTransform.ScaleYProperty, pop);
        }

        private static string Cap(string s) => char.ToUpperInvariant(s[0]) + s.Substring(1);

        private static Color Lighten(Color c) => Color.FromRgb(
            (byte)(c.R + (255 - c.R) * 0.42), (byte)(c.G + (255 - c.G) * 0.42), (byte)(c.B + (255 - c.B) * 0.42));
    }
}
