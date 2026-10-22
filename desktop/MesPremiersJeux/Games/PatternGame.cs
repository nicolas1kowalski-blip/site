using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Animation;
using MesPremiersJeux.Data;
using MesPremiersJeux.Lib;

namespace MesPremiersJeux.Games
{
    /// <summary>
    /// « Les suites » (MS), refondu en TROIS ACTES progressifs :
    ///   1. Regarde la suite — elle se CONSTRUIT toute seule sous les yeux de
    ///      l'enfant, un rond à la fois, chaque couleur dite à voix haute.
    ///   2. Continue la suite — A-B-A-B-? avec DEUX choix : le rond choisi VOLE
    ///      jusqu'à sa place, et toute la suite fait la ola.
    ///   3. La suite difficile — A-B-C-A-B-? avec trois choix.
    /// En cas d'erreur, on RELIT la suite ensemble (chaque rond saute pendant
    /// que sa couleur est dite) avant de réessayer. Consignes dites, jamais lues.
    /// </summary>
    public sealed class PatternGame : GameControl
    {
        private const double W = 1400, H = 680;
        private const double DotSize = 118;

        private Canvas _canvas;
        private int _phase;
        private int _round;                    // manche dans l'acte en cours
        private GameColor[] _pattern;          // le motif (2 ou 3 couleurs)
        private int _shownCount;               // ronds déjà posés
        private GameColor _answer;             // la couleur attendue
        private readonly List<Border> _dots = new List<Border>(); // ronds posés
        private Border _slot;                  // la case « ? »
        private Point _slotPos;

        public PatternGame(Action celebrate) : base(celebrate) { }

        protected override void NewRound()
        {
            StartWatch();
        }

        private static Border Dot(Color c, double size) => new Border
        {
            Width = size,
            Height = size,
            CornerRadius = new CornerRadius(size / 2),
            Background = new SolidColorBrush(c),
            BorderBrush = new SolidColorBrush(Color.FromRgb(0x2B, 0x2D, 0x42)),
            BorderThickness = new Thickness(4),
            RenderTransformOrigin = new Point(0.5, 0.5),
        };

        private GameColor[] PickPattern(int n)
        {
            var list = new List<GameColor>();
            while (list.Count < n)
            {
                var c = GameKit.Rand(GameData.Colors);
                if (list.All(x => x.Name != c.Name)) list.Add(c);
            }
            return list.ToArray();
        }

        // ==================================================================
        // ACTE 1 — « Regarde la suite » : elle se construit toute seule.
        // ==================================================================
        private void StartWatch()
        {
            _phase = 1;
            Locked = true;
            _pattern = PickPattern(2);
            Question.Text = "🟡 Les suites — regarde bien !";
            _canvas = new Canvas { Width = W, Height = H };
            _dots.Clear();

            var speaker = SpeakerButton(() => "Regarde bien : les ronds arrivent l'un après l'autre. C'est une suite !");
            Canvas.SetLeft(speaker, W - 140);
            Canvas.SetTop(speaker, 20);
            _canvas.Children.Add(speaker);

            SetBody(_canvas);
            Speak("Regarde bien : une suite se fabrique !");
            Schedule(1500, () => WatchStep(0));
        }

        private void WatchStep(int i)
        {
            const int count = 6;
            if (i >= count)
            {
                string a = _pattern[0].Name, b = _pattern[1].Name;
                Speak("Tu as vu ? " + a + ", " + b + ", " + a + ", " + b + "... C'est une suite ! À toi de jouer !");
                Schedule(3200, () => { _phase = 0; _round = 0; StartRound(2); });
                return;
            }

            var col = _pattern[i % 2];
            double total = count * (DotSize + 22) - 22;
            double x = (W - total) / 2 + i * (DotSize + 22);
            var dot = Dot(col.Value, DotSize);
            PlaceWithPop(dot, x, 240);
            Speak(col.Name);
            Schedule(950, () => WatchStep(i + 1));
        }

        private void PlaceWithPop(Border dot, double x, double y)
        {
            var sc = new ScaleTransform(0.2, 0.2);
            dot.RenderTransform = sc;
            Canvas.SetLeft(dot, x);
            Canvas.SetTop(dot, y);
            _canvas.Children.Add(dot);
            _dots.Add(dot);
            var pop = new DoubleAnimation(0.2, 1, TimeSpan.FromMilliseconds(380))
            { EasingFunction = new BackEase { EasingMode = EasingMode.EaseOut, Amplitude = 0.8 } };
            sc.BeginAnimation(ScaleTransform.ScaleXProperty, pop);
            sc.BeginAnimation(ScaleTransform.ScaleYProperty, pop);
        }

        // ==================================================================
        // ACTES 2 et 3 — continuer la suite (motif à 2, puis à 3 couleurs).
        // ==================================================================
        private void StartRound(int patternLen)
        {
            _phase = patternLen; // 2 = acte 2, 3 = acte 3
            Locked = false;
            _pattern = PickPattern(patternLen);
            _shownCount = patternLen == 2 ? 4 : 5;
            _answer = _pattern[_shownCount % patternLen];
            Question.Text = "🟡 Qu'est-ce qui vient après ?";
            _canvas = new Canvas { Width = W, Height = H };
            _dots.Clear();

            int cells = _shownCount + 1;
            double total = cells * (DotSize + 22) - 22;
            double x0 = (W - total) / 2, y = 170;
            for (int i = 0; i < _shownCount; i++)
            {
                var dot = Dot(_pattern[i % patternLen].Value, DotSize);
                Canvas.SetLeft(dot, x0 + i * (DotSize + 22));
                Canvas.SetTop(dot, y);
                _canvas.Children.Add(dot);
                _dots.Add(dot);
            }

            // La case « ? » qui attend son rond.
            _slotPos = new Point(x0 + _shownCount * (DotSize + 22), y);
            _slot = new Border
            {
                Width = DotSize,
                Height = DotSize,
                CornerRadius = new CornerRadius(DotSize / 2),
                Background = new SolidColorBrush(Color.FromArgb(0x30, 0x7E, 0x3F, 0xF2)),
                BorderBrush = new SolidColorBrush(Color.FromRgb(0x7E, 0x3F, 0xF2)),
                BorderThickness = new Thickness(4),
                Child = new TextBlock
                {
                    Text = "?",
                    FontSize = 62,
                    FontWeight = FontWeights.Bold,
                    Foreground = new SolidColorBrush(Color.FromRgb(0x7E, 0x3F, 0xF2)),
                    HorizontalAlignment = HorizontalAlignment.Center,
                    VerticalAlignment = VerticalAlignment.Center,
                },
                RenderTransformOrigin = new Point(0.5, 0.5),
            };
            Canvas.SetLeft(_slot, _slotPos.X);
            Canvas.SetTop(_slot, _slotPos.Y);
            _canvas.Children.Add(_slot);
            // La case « ? » pulse pour appeler le regard.
            var psc = new ScaleTransform(1, 1);
            _slot.RenderTransform = psc;
            var pulse = new DoubleAnimation(1, 1.1, TimeSpan.FromMilliseconds(600))
            { AutoReverse = true, RepeatBehavior = RepeatBehavior.Forever, EasingFunction = new SineEase() };
            psc.BeginAnimation(ScaleTransform.ScaleXProperty, pulse);
            psc.BeginAnimation(ScaleTransform.ScaleYProperty, pulse);

            var speaker = SpeakerButton(() => "Regarde bien la suite des couleurs. Qu'est-ce qui vient après ?");
            Canvas.SetLeft(speaker, W - 140);
            Canvas.SetTop(speaker, 20);
            _canvas.Children.Add(speaker);

            // Les choix.
            var options = new List<GameColor>(_pattern);
            if (patternLen == 2 && GameData.Colors.Count > 2)
            {
                // à deux couleurs, on ne propose QUE les deux du motif : A ou B ?
            }
            options = GameKit.Shuffle(options);
            double bs = 200, bgap = 90;
            double bx0 = (W - options.Count * bs - (options.Count - 1) * bgap) / 2, by = 400;
            foreach (var col in options)
            {
                var btn = new Button
                {
                    Style = (Style)Application.Current.Resources["BalloonButton"],
                    Width = bs,
                    Height = bs,
                    Content = Dot(col.Value, bs * 0.8),
                    RenderTransformOrigin = new Point(0.5, 0.5),
                };
                var chosen = col;
                var captBtn = btn;
                btn.Click += (s, e) => Answer(captBtn, chosen);
                Canvas.SetLeft(btn, bx0);
                Canvas.SetTop(btn, by);
                bx0 += bs + bgap;
                _canvas.Children.Add(btn);
            }

            SetBody(_canvas);
            Schedule(400, () => Speak("Regarde bien la suite. Qu'est-ce qui vient après ?"));
        }

        private void Answer(Button btn, GameColor chosen)
        {
            if ((_phase != 2 && _phase != 3) || Locked) return;
            if (chosen.Name == _answer.Name)
            {
                Locked = true;
                GameKit.Success();

                // Le rond choisi VOLE jusqu'à la case « ? ».
                var flying = Dot(chosen.Value, DotSize);
                double sx = Canvas.GetLeft(btn) + btn.Width / 2 - DotSize / 2;
                double sy = Canvas.GetTop(btn) + btn.Height / 2 - DotSize / 2;
                Canvas.SetLeft(flying, sx);
                Canvas.SetTop(flying, sy);
                flying.SetValue(Panel.ZIndexProperty, 80);
                _canvas.Children.Add(flying);
                var ax = new DoubleAnimation(sx, _slotPos.X, TimeSpan.FromMilliseconds(650))
                { EasingFunction = new QuadraticEase { EasingMode = EasingMode.EaseInOut } };
                var ay = new DoubleAnimation(sy, _slotPos.Y, TimeSpan.FromMilliseconds(650))
                { EasingFunction = new QuadraticEase { EasingMode = EasingMode.EaseInOut } };
                ay.Completed += (s, e) =>
                {
                    _slot.Background = new SolidColorBrush(chosen.Value);
                    ((TextBlock)_slot.Child).Text = "";
                    _canvas.Children.Remove(flying);
                    _dots.Add(_slot);
                    Celebrate();
                    Speak("Bravo ! C'est " + _answer.Name + " qui continue la suite !");
                    WaveThen(NextAfterSuccess);
                };
                flying.BeginAnimation(Canvas.LeftProperty, ax);
                flying.BeginAnimation(Canvas.TopProperty, ay);
            }
            else
            {
                GameKit.Wrong();
                Shake(btn);
                // On RELIT la suite ensemble avant de réessayer.
                Locked = true;
                ReplayStep(0);
            }
        }

        private void NextAfterSuccess()
        {
            _round++;
            if (_phase == 2 && _round >= 3) { _round = 0; Schedule(1000, () => StartRound(3)); }
            else if (_phase == 3 && _round >= 2)
            {
                Question.Text = "🎉 Tu es le roi des suites !";
                Speak("Bravo ! Tu sais continuer toutes les suites !");
                Celebrate();
                ScheduleNext(4400);
            }
            else
            {
                int len = _phase;
                Schedule(1200, () => StartRound(len));
            }
        }

        // Relecture pédagogique : chaque rond saute pendant que sa couleur est dite.
        private void ReplayStep(int i)
        {
            int patternLen = _phase;
            if (i >= _shownCount)
            {
                Speak("Alors après, c'est... ? À toi !");
                Schedule(1600, () => Locked = false);
                return;
            }
            var dot = _dots[i];
            var sc = new ScaleTransform(1, 1);
            dot.RenderTransform = sc;
            var pop = new DoubleAnimation(1, 1.3, TimeSpan.FromMilliseconds(260))
            { AutoReverse = true, EasingFunction = new SineEase() };
            sc.BeginAnimation(ScaleTransform.ScaleXProperty, pop);
            sc.BeginAnimation(ScaleTransform.ScaleYProperty, pop);
            Speak(_pattern[i % patternLen].Name);
            Schedule(800, () => ReplayStep(i + 1));
        }

        // La ola de la suite complétée, puis la suite du jeu.
        private void WaveThen(Action after)
        {
            for (int i = 0; i < _dots.Count; i++)
            {
                var dot = _dots[i];
                var sc = new ScaleTransform(1, 1);
                dot.RenderTransform = sc;
                var pop = new DoubleAnimation(1, 1.28, TimeSpan.FromMilliseconds(240))
                { BeginTime = TimeSpan.FromMilliseconds(i * 130), AutoReverse = true, EasingFunction = new SineEase() };
                sc.BeginAnimation(ScaleTransform.ScaleXProperty, pop);
                sc.BeginAnimation(ScaleTransform.ScaleYProperty, pop);
            }
            Schedule(_dots.Count * 130 + 900, after);
        }
    }
}
