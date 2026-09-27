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
    /// « Mon prénom » (PS/MS) : apprendre à reconnaître puis écrire son prénom,
    /// en trois actes progressifs et pilotables au regard.
    ///   1. Les lettres dansent — découverte sans échec : chaque lettre regardée
    ///      danse, scintille et dit son nom ; puis le prénom est épelé en chœur.
    ///   2. Attrape la lettre — « Trouve le L ! » parmi 2, puis 3, puis 4 choix.
    ///   3. Le train du prénom — remplir les wagons dans l'ordre pour écrire le
    ///      prénom ; le train complet siffle et démarre sous les confettis.
    /// Astuce pédagogique : chaque lettre garde SA couleur d'un acte à l'autre
    /// (L rouge, A jaune…), un repère de plus pour la mémorisation.
    /// Le prénom se règle dans ⚙ Réglages (par défaut : Laura).
    /// </summary>
    public sealed class NameGame : GameControl
    {
        private const double W = 1400, H = 680;

        // Couleurs attitrées des lettres du prénom (dans l'ordre d'apparition).
        private static readonly Color[] Palette =
        {
            Color.FromRgb(0xFF, 0x5F, 0x6D), // rouge corail
            Color.FromRgb(0xFF, 0xC1, 0x07), // jaune soleil
            Color.FromRgb(0x3B, 0x9B, 0xFF), // bleu ciel
            Color.FromRgb(0x6B, 0xCB, 0x77), // vert pomme
            Color.FromRgb(0xA0, 0x6C, 0xD5), // violet
            Color.FromRgb(0xFF, 0x8F, 0xD3), // rose
            Color.FromRgb(0xFF, 0x9F, 0x45), // orange
            Color.FromRgb(0x4E, 0xCD, 0xC4), // turquoise
        };

        // Couleurs des lettres intruses (jamais celles du prénom).
        private static readonly Color[] OtherPalette =
        {
            Color.FromRgb(0x8E, 0x9A, 0xAF), Color.FromRgb(0xB8, 0x86, 0x5A),
            Color.FromRgb(0x7F, 0xB2, 0x8A), Color.FromRgb(0x9A, 0x8A, 0xB8),
        };

        private string _name = "LAURA";
        private Dictionary<char, Color> _colorOf = new Dictionary<char, Color>();

        private Canvas _canvas;
        private int _phase; // 1 = danse, 2 = attrape, 3 = train (0 = transition)

        // Acte 1.
        private bool[] _seen;
        private ScaleTransform[] _p1Scale;
        private RotateTransform[] _p1Rot;
        private double[] _p1X;
        private double _p1Y, _p1Size;

        // Acte 2.
        private int _ask;

        // Acte 3.
        private int _slot;
        private Canvas _trainLayer;
        private TranslateTransform _trainTT;
        private Border[] _wagons;
        private TextBlock[] _wagonLetters;
        private ScaleTransform[] _wagonScale;
        private double[] _wagonX;
        private double _wagonY, _wagonSize;

        public NameGame(Action celebrate) : base(celebrate) { }

        protected override void NewRound()
        {
            LoadName();
            StartDiscovery();
        }

        // --- Le prénom vient des réglages (par défaut : Laura). ---
        private void LoadName()
        {
            string n = "";
            try { n = Settings.Load().ChildName; } catch { }
            n = new string((n ?? "").Trim().ToUpperInvariant().Where(char.IsLetter).ToArray());
            if (n.Length < 2 || n.Length > 10) n = "LAURA";
            _name = n;

            _colorOf = new Dictionary<char, Color>();
            int k = 0;
            foreach (var ch in _name)
                if (!_colorOf.ContainsKey(ch))
                    _colorOf[ch] = Palette[k++ % Palette.Length];
        }

        private string Pretty => char.ToUpperInvariant(_name[0]) + _name.Substring(1).ToLowerInvariant();

        // --- Brique visuelle : une grosse lettre colorée et brillante. ---
        private Grid LetterVisual(char ch, Color col, double size)
        {
            var g = new Grid { Width = size, Height = size };
            g.Children.Add(new Border
            {
                CornerRadius = new CornerRadius(size * 0.22),
                Background = new LinearGradientBrush(Lighten(col), col, 90),
                BorderBrush = Brushes.White,
                BorderThickness = new Thickness(5),
            });
            g.Children.Add(new TextBlock
            {
                Text = ch.ToString(),
                FontSize = size * 0.58,
                FontWeight = FontWeights.ExtraBold,
                Foreground = Brushes.White,
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, -size * 0.04, 0, 0),
            });
            return g;
        }

        private Color ColorFor(char ch) =>
            _colorOf.TryGetValue(ch, out var c) ? c : OtherPalette[(ch - 'A') % OtherPalette.Length];

        // ==================================================================
        // ACTE 1 — « Les lettres dansent » : découverte sans échec.
        // ==================================================================
        private void StartDiscovery()
        {
            _phase = 1;
            Locked = false;
            Question.Text = "💖 Regarde les lettres de ton prénom !";

            _canvas = new Canvas { Width = W, Height = H };
            int n = _name.Length;
            double size = Math.Min(215, (W - 120) / n - 22);
            double gap = 22;
            double total = n * size + (n - 1) * gap;
            double x0 = (W - total) / 2, y = H * 0.28;

            _seen = new bool[n];
            _p1Scale = new ScaleTransform[n];
            _p1Rot = new RotateTransform[n];
            _p1X = new double[n];
            _p1Y = y;
            _p1Size = size;

            for (int i = 0; i < n; i++)
            {
                char ch = _name[i];
                var vis = LetterVisual(ch, _colorOf[ch], size);
                vis.RenderTransformOrigin = new Point(0.5, 0.5);
                var sc = new ScaleTransform(1, 1);
                var rot = new RotateTransform(0);
                var grp = new TransformGroup();
                grp.Children.Add(sc);
                grp.Children.Add(rot);
                vis.RenderTransform = grp;
                _p1Scale[i] = sc;
                _p1Rot[i] = rot;

                var btn = new Button
                {
                    Style = (Style)Application.Current.Resources["BalloonButton"],
                    Width = size,
                    Height = size,
                    Content = vis,
                };
                int idx = i;
                btn.Click += (s, e) => Discover(idx);
                _p1X[i] = x0 + i * (size + gap);
                Canvas.SetLeft(btn, _p1X[i]);
                Canvas.SetTop(btn, y);
                _canvas.Children.Add(btn);
            }

            var hint = new TextBlock
            {
                Text = "Regarde chaque lettre pour la faire danser ✨",
                FontSize = 28,
                FontWeight = FontWeights.SemiBold,
                Foreground = new SolidColorBrush(Color.FromRgb(0x6B, 0x5A, 0x8A)),
                Width = W,
                TextAlignment = TextAlignment.Center,
            };
            Canvas.SetLeft(hint, 0);
            Canvas.SetTop(hint, y + size + 70);
            _canvas.Children.Add(hint);

            SetBody(_canvas);
            Schedule(450, () => Speak("Voici ton prénom : " + Pretty + " ! Regarde chaque lettre pour la faire danser !"));
        }

        private void Discover(int idx)
        {
            if (_phase != 1 || Locked) return;
            char ch = _name[idx];
            Dance(idx);
            Twinkle(_p1X[idx] + _p1Size / 2, _p1Y + _p1Size / 2);
            Speak(ch + " !");

            if (!_seen[idx])
            {
                _seen[idx] = true;
                var star = new TextBlock { Text = "⭐", FontSize = 34, IsHitTestVisible = false };
                Canvas.SetLeft(star, _p1X[idx] + _p1Size - 26);
                Canvas.SetTop(star, _p1Y - 20);
                _canvas.Children.Add(star);
            }

            if (_seen.All(v => v))
            {
                _phase = 0;
                Locked = true;
                Schedule(1000, SpellOutThenFind);
            }
        }

        // Épellation en chœur : chaque lettre danse à son tour, puis le prénom.
        private void SpellOutThenFind()
        {
            Question.Text = "✨ " + string.Join(" · ", _name.ToCharArray()) + "  →  " + Pretty + " !";
            int i = 0;
            Action step = null;
            step = () =>
            {
                if (i >= _name.Length)
                {
                    Speak("Ça fait... " + Pretty + " ! Bravo ! Et maintenant, à toi de jouer !");
                    Schedule(2800, StartFind);
                    return;
                }
                Speak(_name[i].ToString());
                Dance(i);
                i++;
                Schedule(800, step);
            };
            step();
        }

        private void Dance(int idx)
        {
            var pop = new DoubleAnimation(1, 1.32, TimeSpan.FromMilliseconds(280))
            { AutoReverse = true, EasingFunction = new SineEase() };
            _p1Scale[idx].BeginAnimation(ScaleTransform.ScaleXProperty, pop);
            _p1Scale[idx].BeginAnimation(ScaleTransform.ScaleYProperty, pop);
            var ra = new DoubleAnimationUsingKeyFrames { Duration = TimeSpan.FromMilliseconds(540) };
            ra.KeyFrames.Add(new LinearDoubleKeyFrame(-11, KeyTime.FromPercent(0.25)));
            ra.KeyFrames.Add(new LinearDoubleKeyFrame(10, KeyTime.FromPercent(0.6)));
            ra.KeyFrames.Add(new LinearDoubleKeyFrame(0, KeyTime.FromPercent(1)));
            _p1Rot[idx].BeginAnimation(RotateTransform.AngleProperty, ra);
        }

        // ==================================================================
        // ACTE 2 — « Attrape la lettre » : 2, puis 3, puis 4 choix.
        // ==================================================================
        private void StartFind()
        {
            _phase = 2;
            _ask = 0;
            Locked = false;
            AskNext();
        }

        private void AskNext()
        {
            if (_ask >= _name.Length)
            {
                _phase = 0;
                Locked = true;
                Question.Text = "🎉 Toutes les lettres trouvées !";
                Celebrate();
                Speak("Super ! Maintenant... le train du prénom !");
                Schedule(2400, StartTrain);
                return;
            }

            Locked = false;
            char target = _name[_ask];
            int nChoices = _ask < 2 ? 2 : (_ask < 4 ? 3 : 4);

            // Distracteurs : d'abord une autre lettre du prénom (le vrai défi),
            // puis des lettres étrangères au prénom.
            var choices = new List<char> { target };
            var inName = _name.Where(c => c != target).Distinct().ToList();
            if (inName.Count > 0 && nChoices > 1) choices.Add(GameKit.Rand(inName));
            var outside = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".Where(c => !_name.Contains(c)).ToList();
            while (choices.Count < nChoices && outside.Count > 0)
            {
                var c = GameKit.Rand(outside);
                outside.Remove(c);
                choices.Add(c);
            }
            choices = GameKit.Shuffle(choices);

            Question.Text = "🔎 Trouve le " + target + " !";
            _canvas = new Canvas { Width = W, Height = H };

            double size = Math.Min(250, (W - 160) / choices.Count - 30);
            double gap = 42;
            double total = choices.Count * size + (choices.Count - 1) * gap;
            double x0 = (W - total) / 2, y = (H - size) / 2 - 30;

            for (int i = 0; i < choices.Count; i++)
            {
                char ch = choices[i];
                var btn = new Button
                {
                    Style = (Style)Application.Current.Resources["BalloonButton"],
                    Width = size,
                    Height = size,
                    Content = LetterVisual(ch, ColorFor(ch), size),
                };
                char captured = ch;
                var captBtn = btn;
                btn.Click += (s, e) => Pick(captBtn, captured, target);
                Canvas.SetLeft(btn, x0 + i * (size + gap));
                Canvas.SetTop(btn, y);
                _canvas.Children.Add(btn);
            }

            SetBody(_canvas);
            Schedule(350, () => Speak("Trouve le " + target + " !"));
        }

        private void Pick(Button btn, char ch, char target)
        {
            if (_phase != 2 || Locked) return;
            if (ch == target)
            {
                Locked = true;
                GameKit.Success();
                Speak("Oui ! C'est le " + target + " ! " + GameKit.Praise());
                var sc = new ScaleTransform(1, 1);
                btn.RenderTransformOrigin = new Point(0.5, 0.5);
                btn.RenderTransform = sc;
                var pop = new DoubleAnimation(1, 1.35, TimeSpan.FromMilliseconds(340))
                { AutoReverse = true, RepeatBehavior = new RepeatBehavior(2), EasingFunction = new SineEase() };
                sc.BeginAnimation(ScaleTransform.ScaleXProperty, pop);
                sc.BeginAnimation(ScaleTransform.ScaleYProperty, pop);
                Twinkle(Canvas.GetLeft(btn) + btn.Width / 2, Canvas.GetTop(btn) + btn.Height / 2);
                _ask++;
                Schedule(1700, AskNext);
            }
            else
            {
                GameKit.Wrong();
                Shake(btn);
                // Nommer la lettre montrée : l'erreur aussi fait apprendre.
                Speak("Ça, c'est le " + ch + ". Cherche le " + target + " !");
            }
        }

        // ==================================================================
        // ACTE 3 — « Le train du prénom » : écrire le prénom wagon par wagon.
        // ==================================================================
        private void StartTrain()
        {
            _phase = 3;
            _slot = 0;
            Locked = false;
            Question.Text = "🚂 Remplis le train pour écrire " + Pretty + " !";

            _canvas = new Canvas { Width = W, Height = H };

            // Couche « train » (pour l'animation de départ à la fin).
            _trainLayer = new Canvas { Width = W, Height = H };
            _trainTT = new TranslateTransform(0, 0);
            _trainLayer.RenderTransform = _trainTT;
            _canvas.Children.Add(_trainLayer);

            int n = _name.Length;
            _wagonSize = Math.Min(150, (W - 320) / n - 16);
            double gap = 16;
            double x0 = 250;
            _wagonY = 130;

            var loco = new TextBlock { Text = "🚂", FontSize = 130 };
            Canvas.SetLeft(loco, 60);
            Canvas.SetTop(loco, _wagonY - 34);
            _trainLayer.Children.Add(loco);

            _wagons = new Border[n];
            _wagonLetters = new TextBlock[n];
            _wagonScale = new ScaleTransform[n];
            _wagonX = new double[n];

            for (int i = 0; i < n; i++)
            {
                var g = new Grid { Width = _wagonSize, Height = _wagonSize, RenderTransformOrigin = new Point(0.5, 0.5) };
                var sc = new ScaleTransform(1, 1);
                g.RenderTransform = sc;
                _wagonScale[i] = sc;

                var body = new Border
                {
                    CornerRadius = new CornerRadius(18),
                    Background = new SolidColorBrush(Color.FromArgb(0x2E, 0x9A, 0x8A, 0xB8)),
                    BorderBrush = new SolidColorBrush(Color.FromRgb(0x9A, 0x8A, 0xB8)),
                    BorderThickness = new Thickness(4),
                };
                g.Children.Add(body);
                var letter = new TextBlock
                {
                    Text = _name[i].ToString(),
                    FontSize = _wagonSize * 0.56,
                    FontWeight = FontWeights.ExtraBold,
                    Foreground = new SolidColorBrush(Color.FromArgb(0x55, 0x6B, 0x5A, 0x8A)),
                    HorizontalAlignment = HorizontalAlignment.Center,
                    VerticalAlignment = VerticalAlignment.Center,
                };
                g.Children.Add(letter);
                // Petites roues sous le wagon.
                var wheels = new TextBlock { Text = "⚙⚙", FontSize = _wagonSize * 0.2, Foreground = new SolidColorBrush(Color.FromRgb(0x6B, 0x5A, 0x8A)) };
                Canvas.SetLeft(wheels, x0 + i * (_wagonSize + gap) + _wagonSize * 0.24);
                Canvas.SetTop(wheels, _wagonY + _wagonSize - 4);
                _trainLayer.Children.Add(wheels);

                _wagons[i] = body;
                _wagonLetters[i] = letter;
                _wagonX[i] = x0 + i * (_wagonSize + gap);
                Canvas.SetLeft(g, _wagonX[i]);
                Canvas.SetTop(g, _wagonY);
                _trainLayer.Children.Add(g);
            }
            MarkNextWagon();

            // La réserve de lettres, mélangée, en bas (une par lettre du prénom).
            var order = GameKit.Shuffle(Enumerable.Range(0, n));
            double bankSize = Math.Min(190, (W - 160) / n - 24);
            double bgap = 30;
            double btotal = n * bankSize + (n - 1) * bgap;
            double bx0 = (W - btotal) / 2, by = H - bankSize - 40;

            for (int j = 0; j < n; j++)
            {
                char ch = _name[order[j]];
                var btn = new Button
                {
                    Style = (Style)Application.Current.Resources["BalloonButton"],
                    Width = bankSize,
                    Height = bankSize,
                    Content = LetterVisual(ch, _colorOf[ch], bankSize),
                };
                var captBtn = btn;
                char captured = ch;
                btn.Click += (s, e) => BankPick(captBtn, captured);
                Canvas.SetLeft(btn, bx0 + j * (bankSize + bgap));
                Canvas.SetTop(btn, by);
                _canvas.Children.Add(btn);
            }

            SetBody(_canvas);
            Schedule(450, () => Speak("Mets les lettres dans les wagons, dans l'ordre, pour écrire " + Pretty + " !"));
        }

        private void MarkNextWagon()
        {
            for (int i = 0; i < _wagons.Length; i++)
                if (i == _slot)
                {
                    _wagons[i].BorderBrush = new SolidColorBrush(Color.FromRgb(0xFF, 0xC1, 0x07));
                    _wagons[i].BorderThickness = new Thickness(6);
                }
                else if (i > _slot)
                {
                    _wagons[i].BorderBrush = new SolidColorBrush(Color.FromRgb(0x9A, 0x8A, 0xB8));
                    _wagons[i].BorderThickness = new Thickness(4);
                }
        }

        private void BankPick(Button btn, char ch)
        {
            if (_phase != 3 || Locked) return;
            char need = _name[_slot];
            if (ch != need)
            {
                GameKit.Wrong();
                Shake(btn);
                Speak("D'abord le " + need + " !");
                return;
            }

            Locked = true;
            btn.IsEnabled = false;
            btn.Visibility = Visibility.Hidden;

            // La lettre s'envole de la réserve jusqu'à son wagon.
            int slot = _slot;
            var clone = LetterVisual(ch, _colorOf[ch], _wagonSize);
            Canvas.SetLeft(clone, Canvas.GetLeft(btn) + (btn.Width - _wagonSize) / 2);
            Canvas.SetTop(clone, Canvas.GetTop(btn) + (btn.Height - _wagonSize) / 2);
            clone.SetValue(Panel.ZIndexProperty, 60);
            _canvas.Children.Add(clone);

            var ax = new DoubleAnimation(Canvas.GetLeft(clone), _wagonX[slot], TimeSpan.FromMilliseconds(520))
            { EasingFunction = new QuadraticEase { EasingMode = EasingMode.EaseInOut } };
            var ay = new DoubleAnimation(Canvas.GetTop(clone), _wagonY, TimeSpan.FromMilliseconds(520))
            { EasingFunction = new QuadraticEase { EasingMode = EasingMode.EaseInOut } };
            ay.Completed += (s, e) =>
            {
                _canvas.Children.Remove(clone);
                FillWagon(slot, ch);
            };
            clone.BeginAnimation(Canvas.LeftProperty, ax);
            clone.BeginAnimation(Canvas.TopProperty, ay);
        }

        private void FillWagon(int slot, char ch)
        {
            var col = _colorOf[ch];
            _wagons[slot].Background = new LinearGradientBrush(Lighten(col), col, 90);
            _wagons[slot].BorderBrush = Brushes.White;
            _wagons[slot].BorderThickness = new Thickness(5);
            _wagonLetters[slot].Foreground = Brushes.White;
            var pop = new DoubleAnimation(1, 1.25, TimeSpan.FromMilliseconds(240))
            { AutoReverse = true, EasingFunction = new SineEase() };
            _wagonScale[slot].BeginAnimation(ScaleTransform.ScaleXProperty, pop);
            _wagonScale[slot].BeginAnimation(ScaleTransform.ScaleYProperty, pop);
            Speak(ch + " !");

            _slot++;
            if (_slot >= _name.Length) { FinishTrain(); return; }
            MarkNextWagon();
            Locked = false;
        }

        private void FinishTrain()
        {
            Locked = true;
            Question.Text = "🎉 " + string.Join("", _name.ToCharArray()) + " ! Bravo " + Pretty + " ! 🎉";

            // La ola des wagons, l'épellation, puis le train démarre.
            int i = 0;
            Action wave = null;
            wave = () =>
            {
                if (i < _name.Length)
                {
                    var pop = new DoubleAnimation(1, 1.35, TimeSpan.FromMilliseconds(240))
                    { AutoReverse = true, EasingFunction = new SineEase() };
                    _wagonScale[i].BeginAnimation(ScaleTransform.ScaleXProperty, pop);
                    _wagonScale[i].BeginAnimation(ScaleTransform.ScaleYProperty, pop);
                    Speak(_name[i].ToString());
                    i++;
                    Schedule(650, wave);
                    return;
                }
                Speak("Ça fait " + Pretty + " ! Bravo " + Pretty + ", tu as écrit ton prénom ! Tchou tchou !");
                Celebrate();
                Schedule(1800, () =>
                {
                    var go = new DoubleAnimation(0, W + 500, TimeSpan.FromMilliseconds(3000))
                    { EasingFunction = new QuadraticEase { EasingMode = EasingMode.EaseIn } };
                    _trainTT.BeginAnimation(TranslateTransform.XProperty, go);
                });
            };
            wave();
            ScheduleNext(5300 + _name.Length * 650); // ola + départ du train, puis on rejoue
        }

        // --- Étincelles de fête autour d'un point. ---
        private void Twinkle(double cx, double cy)
        {
            var rng = new Random();
            for (int i = 0; i < 7; i++)
            {
                var star = new TextBlock { Text = "✨", FontSize = 22 + rng.Next(14), IsHitTestVisible = false };
                star.SetValue(Panel.ZIndexProperty, 70);
                Canvas.SetLeft(star, cx - 12);
                Canvas.SetTop(star, cy - 12);
                _canvas.Children.Add(star);

                double ang = rng.NextDouble() * Math.PI * 2;
                double dist = 90 + rng.Next(90);
                var tt = new TranslateTransform();
                star.RenderTransform = tt;
                var dur = TimeSpan.FromMilliseconds(600 + rng.Next(400));
                tt.BeginAnimation(TranslateTransform.XProperty,
                    new DoubleAnimation(0, Math.Cos(ang) * dist, dur) { EasingFunction = new QuadraticEase { EasingMode = EasingMode.EaseOut } });
                tt.BeginAnimation(TranslateTransform.YProperty,
                    new DoubleAnimation(0, Math.Sin(ang) * dist, dur) { EasingFunction = new QuadraticEase { EasingMode = EasingMode.EaseOut } });
                var fade = new DoubleAnimation(1, 0, dur);
                var captured = star;
                fade.Completed += (s, e) => _canvas.Children.Remove(captured);
                star.BeginAnimation(UIElement.OpacityProperty, fade);
            }
        }

        private static Color Lighten(Color c) => Color.FromRgb(
            (byte)(c.R + (255 - c.R) * 0.42), (byte)(c.G + (255 - c.G) * 0.42), (byte)(c.B + (255 - c.B) * 0.42));
    }
}
