using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Animation;
using MesPremiersJeux.Lib;

namespace MesPremiersJeux.Games
{
    /// <summary>
    /// « Les lettres » (PS/MS), refondu en TROIS ACTES progressifs — découverte
    /// sans échec, reconnaissance guidée, puis production — comme « Mon prénom ».
    /// À chaque partie, CINQ lettres sont tirées au sort :
    ///   1. Les lettres chantent — regarder une lettre la fait danser, elle dit
    ///      son nom et son mot (« A ! Comme avion ! ») et son dessin surgit ; la
    ///      lettre gagne son dessin ⭐ : quand les cinq sont faites, on continue.
    ///   2. Attrape la lettre — le modèle en GRAND + 🔊, 2 puis 3 puis 4 choix.
    ///   3. La première lettre — le dessin en grand (« Lion ! Ça commence par
    ///      quelle lettre ? ») et trois lettres au choix : la vraie lecture
    ///      commence là. Consignes toujours dites et montrées, jamais à lire.
    /// </summary>
    public sealed class LettersGame : GameControl
    {
        private const double W = 1400, H = 680;

        private static readonly (string L, string Word, string Emoji)[] Alphabet =
        {
            ("A", "avion", "✈️"), ("B", "ballon", "🎈"), ("C", "chat", "🐱"),
            ("D", "dauphin", "🐬"), ("E", "éléphant", "🐘"), ("F", "fleur", "🌸"),
            ("G", "gâteau", "🎂"), ("H", "hibou", "🦉"), ("I", "île", "🏝️"),
            ("J", "jouet", "🧸"), ("K", "koala", "🐨"), ("L", "lion", "🦁"),
            ("M", "maison", "🏠"), ("N", "nuage", "☁️"), ("O", "orange", "🍊"),
            ("P", "papillon", "🦋"), ("R", "robot", "🤖"), ("S", "soleil", "☀️"),
            ("T", "tortue", "🐢"), ("V", "vélo", "🚲"), ("Z", "zèbre", "🦓"),
        };

        private static readonly Color[] Palette =
        {
            Color.FromRgb(0xFF, 0x5F, 0x6D), Color.FromRgb(0xFF, 0xC1, 0x07),
            Color.FromRgb(0x3B, 0x9B, 0xFF), Color.FromRgb(0x6B, 0xCB, 0x77),
            Color.FromRgb(0xA0, 0x6C, 0xD5),
        };

        private Canvas _canvas;
        private int _phase;
        private List<int> _session;   // 5 lettres de la partie (indices Alphabet)
        private bool[] _seen;
        private List<int> _findOrder; // ordre de l'acte 2
        private int _findRound, _wordRound;

        public LettersGame(Action celebrate) : base(celebrate) { }

        protected override void NewRound()
        {
            _session = GameKit.Shuffle(Enumerable.Range(0, Alphabet.Length)).Take(5).ToList();
            StartDiscovery();
        }

        private Color ColOf(int si) => Palette[si % Palette.Length]; // si = place dans la session

        private Grid LetterVisual(string letter, Color col, double size)
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
                Text = letter,
                FontSize = size * 0.56,
                FontWeight = FontWeights.ExtraBold,
                Foreground = Brushes.White,
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, -size * 0.04, 0, 0),
            });
            return g;
        }

        // ==================================================================
        // ACTE 1 — « Les lettres chantent » : découverte sans échec.
        // ==================================================================
        private void StartDiscovery()
        {
            _phase = 1;
            Locked = false;
            _seen = new bool[5];
            Question.Text = "🔤 Les lettres";
            _canvas = new Canvas { Width = W, Height = H };

            double size = 205, gap = 34;
            double x0 = (W - 5 * size - 4 * gap) / 2, y = 160;
            for (int i = 0; i < 5; i++)
            {
                var entry = Alphabet[_session[i]];
                var btn = new Button
                {
                    Style = (Style)Application.Current.Resources["BalloonButton"],
                    Width = size,
                    Height = size,
                    Content = LetterVisual(entry.L, ColOf(i), size * 0.94),
                    RenderTransformOrigin = new Point(0.5, 0.5),
                };
                int idx = i;
                var captBtn = btn;
                btn.Click += (s, e) => DiscoverLetter(captBtn, idx);
                Canvas.SetLeft(btn, x0 + i * (size + gap));
                Canvas.SetTop(btn, y);
                _canvas.Children.Add(btn);
            }

            var speaker = SpeakerButton(() => "Regarde chaque lettre pour la faire chanter !");
            Canvas.SetLeft(speaker, W - 150);
            Canvas.SetTop(speaker, 30);
            _canvas.Children.Add(speaker);

            SetBody(_canvas);
            Schedule(450, () => Speak("Les lettres ! Regarde chaque lettre pour la faire chanter !"));
        }

        private void DiscoverLetter(Button btn, int i)
        {
            if (_phase != 1 || Locked || _seen[i]) return;
            _seen[i] = true;
            var entry = Alphabet[_session[i]];
            Speak(entry.L + " ! Comme " + entry.Word + " !");
            Bounce(btn);

            // Le dessin du mot SURGIT au-dessus de la lettre, puis la lettre
            // garde son dessin ⭐ : on voit celles qui sont faites.
            double cx = Canvas.GetLeft(btn) + btn.Width / 2;
            double topY = Canvas.GetTop(btn);
            var big = new TextBlock
            {
                Text = entry.Emoji,
                FontSize = 96,
                IsHitTestVisible = false,
                RenderTransformOrigin = new Point(0.5, 0.5),
            };
            var sc = new ScaleTransform(0.2, 0.2);
            big.RenderTransform = sc;
            Canvas.SetLeft(big, cx - 48);
            Canvas.SetTop(big, topY - 116);
            big.SetValue(Panel.ZIndexProperty, 60);
            _canvas.Children.Add(big);
            var pop = new DoubleAnimation(0.2, 1, TimeSpan.FromMilliseconds(420))
            { EasingFunction = new BackEase { EasingMode = EasingMode.EaseOut, Amplitude = 0.8 } };
            sc.BeginAnimation(ScaleTransform.ScaleXProperty, pop);
            sc.BeginAnimation(ScaleTransform.ScaleYProperty, pop);

            var badge = new TextBlock { Text = entry.Emoji + "⭐", FontSize = 30, IsHitTestVisible = false };
            Canvas.SetLeft(badge, cx - 34);
            Canvas.SetTop(badge, topY + btn.Height - 8);
            _canvas.Children.Add(badge);

            if (_seen.All(v => v))
            {
                _phase = 0;
                Locked = true;
                Speak("Bravo, tu connais les cinq lettres ! Et maintenant, attrape-les !");
                Schedule(2800, () =>
                {
                    _findOrder = GameKit.Shuffle(Enumerable.Range(0, 5));
                    _findRound = 0;
                    NextFind();
                });
            }
        }

        // ==================================================================
        // ACTE 2 — « Attrape la lettre » : modèle en GRAND + 🔊.
        // ==================================================================
        private void NextFind()
        {
            if (_findRound >= _findOrder.Count)
            {
                _phase = 0;
                Locked = true;
                Celebrate();
                Speak("Super ! Maintenant, le jeu des mots : trouve la première lettre !");
                Schedule(2800, () => { _wordRound = 0; NextWord(); });
                return;
            }

            _phase = 2;
            Locked = false;
            int si = _findOrder[_findRound];
            var target = Alphabet[_session[si]];
            Question.Text = "🔎 Trouve le " + target.L + " !";
            _canvas = new Canvas { Width = W, Height = H };

            var card = new Border
            {
                CornerRadius = new CornerRadius(30),
                Background = Brushes.White,
                BorderBrush = new SolidColorBrush(Color.FromRgb(0xFF, 0xC1, 0x07)),
                BorderThickness = new Thickness(6),
                Padding = new Thickness(16),
                Child = LetterVisual(target.L, ColOf(si), 172),
            };
            Canvas.SetLeft(card, W / 2 - 172);
            Canvas.SetTop(card, 12);
            _canvas.Children.Add(card);
            var spoken = target;
            var speaker = SpeakerButton(() => "Trouve le " + spoken.L + ", comme " + spoken.Word + " ! Cherche la lettre pareille !");
            Canvas.SetLeft(speaker, W / 2 + 82);
            Canvas.SetTop(speaker, 60);
            _canvas.Children.Add(speaker);

            // Choix : d'abord les lettres de la session, puis d'autres de l'alphabet.
            int nChoices = _findRound < 2 ? 2 : (_findRound < 4 ? 3 : 4);
            var picks = new List<int> { _session[si] };
            foreach (var s2 in GameKit.Shuffle(_session.Where(v => v != _session[si])))
            {
                if (picks.Count >= nChoices) break;
                picks.Add(s2);
            }
            foreach (var o in GameKit.Shuffle(Enumerable.Range(0, Alphabet.Length).Where(v => !picks.Contains(v))))
            {
                if (picks.Count >= nChoices) break;
                picks.Add(o);
            }
            picks = GameKit.Shuffle(picks);

            double size = Math.Min(225, (W - 200) / picks.Count - 30), gap = 46;
            double total = picks.Count * size + (picks.Count - 1) * gap;
            double x0 = (W - total) / 2, y = 386;
            for (int i = 0; i < picks.Count; i++)
            {
                int ai = picks[i];
                int sessPos = _session.IndexOf(ai);
                var col = sessPos >= 0 ? ColOf(sessPos) : Color.FromRgb(0x8E, 0x9A, 0xAF);
                var btn = new Button
                {
                    Style = (Style)Application.Current.Resources["BalloonButton"],
                    Width = size,
                    Height = size,
                    Content = LetterVisual(Alphabet[ai].L, col, size * 0.94),
                    RenderTransformOrigin = new Point(0.5, 0.5),
                };
                int captured = ai;
                var captBtn = btn;
                btn.Click += (s, e) => PickLetter(captBtn, captured, _session[si]);
                Canvas.SetLeft(btn, x0 + i * (size + gap));
                Canvas.SetTop(btn, y);
                _canvas.Children.Add(btn);
            }

            SetBody(_canvas);
            Schedule(400, () => Speak("Trouve le " + target.L + " !"));
        }

        private void PickLetter(Button btn, int ai, int targetAi)
        {
            if (_phase != 2 || Locked) return;
            if (ai == targetAi)
            {
                Locked = true;
                GameKit.Success();
                Bounce(btn);
                Speak("Oui ! " + Alphabet[targetAi].L + ", comme " + Alphabet[targetAi].Word + " ! " + GameKit.Praise());
                _findRound++;
                Schedule(1900, NextFind);
            }
            else
            {
                GameKit.Wrong();
                Shake(btn);
                Speak("Ça, c'est le " + Alphabet[ai].L + ". Cherche le " + Alphabet[targetAi].L + " !");
            }
        }

        // ==================================================================
        // ACTE 3 — « La première lettre » : le début de la lecture.
        // ==================================================================
        private void NextWord()
        {
            if (_wordRound >= 4)
            {
                _phase = 0;
                Locked = true;
                Question.Text = "🎉 Tu connais bien tes lettres !";
                Celebrate();
                Speak("Bravo ! Tu connais tes lettres, et même le début des mots !");
                ScheduleNext(4800);
                return;
            }

            _phase = 3;
            Locked = false;
            var target = Alphabet[_session[GameKit.RandInt(5)]];
            Question.Text = "🧩 " + Cap(target.Word) + " commence par quelle lettre ?";
            _canvas = new Canvas { Width = W, Height = H };

            // Le dessin du mot, en GRAND : c'est LUI la consigne.
            var card = new Border
            {
                CornerRadius = new CornerRadius(30),
                Background = Brushes.White,
                BorderBrush = new SolidColorBrush(Color.FromRgb(0xFF, 0xC1, 0x07)),
                BorderThickness = new Thickness(6),
                Padding = new Thickness(24, 8, 24, 8),
                Child = new TextBlock { Text = target.Emoji, FontSize = 150 },
            };
            Canvas.SetLeft(card, W / 2 - 200);
            Canvas.SetTop(card, 10);
            _canvas.Children.Add(card);
            var spoken = target;
            var speaker = SpeakerButton(() => Cap(spoken.Word) + " ! Ça commence par quelle lettre ?");
            Canvas.SetLeft(speaker, W / 2 + 58);
            Canvas.SetTop(speaker, 62);
            _canvas.Children.Add(speaker);

            var picks = new List<int> { Array.FindIndex(Alphabet, a => a.L == target.L) };
            foreach (var o in GameKit.Shuffle(Enumerable.Range(0, Alphabet.Length).Where(v => Alphabet[v].L != target.L)))
            {
                if (picks.Count >= 3) break;
                picks.Add(o);
            }
            picks = GameKit.Shuffle(picks);

            double size = 220, gap = 70;
            double x0 = (W - 3 * size - 2 * gap) / 2, y = 390;
            for (int i = 0; i < picks.Count; i++)
            {
                int ai = picks[i];
                int sessPos = _session.IndexOf(ai);
                var col = sessPos >= 0 ? ColOf(sessPos) : Color.FromRgb(0x8E, 0x9A, 0xAF);
                var btn = new Button
                {
                    Style = (Style)Application.Current.Resources["BalloonButton"],
                    Width = size,
                    Height = size,
                    Content = LetterVisual(Alphabet[ai].L, col, size * 0.94),
                    RenderTransformOrigin = new Point(0.5, 0.5),
                };
                int captured = ai;
                var captBtn = btn;
                btn.Click += (s, e) => PickFirstLetter(captBtn, captured, target);
                Canvas.SetLeft(btn, x0 + i * (size + gap));
                Canvas.SetTop(btn, y);
                _canvas.Children.Add(btn);
            }

            SetBody(_canvas);
            Schedule(400, () => Speak(Cap(target.Word) + " ! Ça commence par quelle lettre ?"));
        }

        private void PickFirstLetter(Button btn, int ai, (string L, string Word, string Emoji) target)
        {
            if (_phase != 3 || Locked) return;
            if (Alphabet[ai].L == target.L)
            {
                Locked = true;
                GameKit.Success();
                Bounce(btn);
                Speak("Oui ! " + Cap(target.Word) + " commence par " + target.L + " ! " + GameKit.Praise());
                _wordRound++;
                Schedule(2100, NextWord);
            }
            else
            {
                GameKit.Wrong();
                Shake(btn);
                Speak("Ça, c'est le " + Alphabet[ai].L + ". " + Cap(target.Word) + "... " + target.L + " !");
            }
        }

        // --- Petits effets. ---
        private static void Bounce(FrameworkElement el)
        {
            var sc = new ScaleTransform(1, 1);
            el.RenderTransform = sc;
            var pop = new DoubleAnimation(1, 1.26, TimeSpan.FromMilliseconds(280))
            { AutoReverse = true, EasingFunction = new SineEase() };
            sc.BeginAnimation(ScaleTransform.ScaleXProperty, pop);
            sc.BeginAnimation(ScaleTransform.ScaleYProperty, pop);
        }

        private static string Cap(string s) => char.ToUpperInvariant(s[0]) + s.Substring(1);

        private static Color Lighten(Color c) => Color.FromRgb(
            (byte)(c.R + (255 - c.R) * 0.42), (byte)(c.G + (255 - c.G) * 0.42), (byte)(c.B + (255 - c.B) * 0.42));
    }
}
