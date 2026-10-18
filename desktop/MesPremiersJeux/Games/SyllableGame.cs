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
    /// « Les syllabes » (MS) : la grenouille 🐸 saute de nénuphar en nénuphar —
    /// UN saut par syllabe, avec un coup de tambour et la syllabe dite bien
    /// fort. Trois actes : 1) DÉCOUVERTE (la grenouille scande le mot, chaque
    /// nénuphar se rejoue au regard), 2) COMPTER les syllabes (avec l'erreur
    /// qui enseigne : on recompte ensemble), 3) le PRÉNOM de l'enfant en
    /// apothéose (LAU-RA !). Le prénom est découpé automatiquement.
    /// </summary>
    public sealed class SyllableGame : GameControl
    {
        private const double W = 1460, H = 640;

        private sealed class Entry
        {
            public string Word;
            public string Emoji;
            public string[] S;
        }

        private static readonly Entry[] Words =
        {
            new Entry { Word = "chat", Emoji = "🐱", S = new[] { "chat" } },
            new Entry { Word = "lapin", Emoji = "🐰", S = new[] { "la", "pin" } },
            new Entry { Word = "vélo", Emoji = "🚲", S = new[] { "vé", "lo" } },
            new Entry { Word = "bateau", Emoji = "⛵", S = new[] { "ba", "teau" } },
            new Entry { Word = "soleil", Emoji = "☀️", S = new[] { "so", "leil" } },
            new Entry { Word = "tomate", Emoji = "🍅", S = new[] { "to", "mate" } },
            new Entry { Word = "papillon", Emoji = "🦋", S = new[] { "pa", "pi", "llon" } },
            new Entry { Word = "éléphant", Emoji = "🐘", S = new[] { "é", "lé", "phant" } },
            new Entry { Word = "chocolat", Emoji = "🍫", S = new[] { "cho", "co", "lat" } },
            new Entry { Word = "kangourou", Emoji = "🦘", S = new[] { "kan", "gou", "rou" } },
            new Entry { Word = "domino", Emoji = "🎲", S = new[] { "do", "mi", "no" } },
            new Entry { Word = "ananas", Emoji = "🍍", S = new[] { "a", "na", "nas" } },
            new Entry { Word = "crocodile", Emoji = "🐊", S = new[] { "cro", "co", "dile" } },
        };

        private readonly Random _rng = new Random();
        private Canvas _canvas;
        private int _act;                 // 1 découverte · 2 compter · 3 prénom
        private int _round;
        private Entry _cur;
        private List<Border> _pads;
        private TextBlock _frog;
        private bool _demoRunning;

        public SyllableGame(Action celebrate) : base(celebrate) { }

        protected override void NewRound()
        {
            _act = 1;
            _round = 0;
            NextWord();
        }

        // ------------------------------------------------------------------
        //  Découpage automatique du PRÉNOM en syllabes (français simple).
        // ------------------------------------------------------------------
        private static Entry NameEntry()
        {
            var name = (Settings.Load().ChildName ?? "").Trim();
            if (name.Length == 0) name = "Laura";
            var sylls = Syllabify(name.ToLowerInvariant());
            return new Entry { Word = name, Emoji = "💖", S = sylls };
        }

        private static readonly string Vowels = "aeiouyàâäéèêëîïôöùûü";

        private static string[] Syllabify(string w)
        {
            try
            {
                bool V(char c) => Vowels.IndexOf(c) >= 0;
                var cuts = new List<int> { 0 };
                int i = 0;
                while (i < w.Length)
                {
                    if (!V(w[i])) { i++; continue; }
                    while (i < w.Length && V(w[i])) i++;      // fin du groupe de voyelles
                    int j = i;
                    while (j < w.Length && !V(w[j])) j++;      // groupe de consonnes
                    if (j >= w.Length) break;                  // consonnes finales : collées
                    int cons = j - i;
                    int cut;
                    if (cons <= 1) cut = i;                    // V | CV
                    else
                    {
                        var pair = w.Substring(j - 2, 2);
                        // digrammes et groupes consonne+l/r : ils démarrent la syllabe
                        if (pair == "ch" || pair == "ph" || pair == "th" || pair == "gn" ||
                            pair[1] == 'l' || pair[1] == 'r')
                            cut = j - 2;
                        else cut = j - 1;                      // VC | CV
                        if (cut < i) cut = i;
                    }
                    if (cut > cuts[cuts.Count - 1]) cuts.Add(cut);
                    i = j;
                }
                cuts.Add(w.Length);
                var res = new List<string>();
                for (int k = 0; k + 1 < cuts.Count; k++)
                {
                    var s = w.Substring(cuts[k], cuts[k + 1] - cuts[k]);
                    if (s.Length > 0) res.Add(s);
                }
                return res.Count > 0 ? res.ToArray() : new[] { w };
            }
            catch { return new[] { w }; }
        }

        // ------------------------------------------------------------------
        //  Construction d'un tour
        // ------------------------------------------------------------------
        private void NextWord()
        {
            Locked = false;
            _round++;

            if (_act == 1 && _round > 2) { _act = 2; _round = 1; }
            if (_act == 2 && _round > 3) { _act = 3; _round = 1; }

            _cur = _act == 3 ? NameEntry() : Words[_rng.Next(Words.Length)];

            Question.Text = _act == 2 ? "🥁 Combien de syllabes ?" : "🥁 Les syllabes";
            SetConsigne(Art.ForEmoji(_cur.Emoji, 110),
                () => _act == 2
                    ? "Écoute bien " + _cur.Word + "... et dis combien de syllabes tu entends ! Compte les sauts de la grenouille !"
                    : "La grenouille saute une fois par syllabe ! Regarde un nénuphar pour réentendre sa syllabe !");

            _canvas = new Canvas { Width = W, Height = H };

            // La mare : eau + roseaux.
            _canvas.Children.Add(new Rectangle
            {
                Width = W,
                Height = H,
                RadiusX = 26,
                RadiusY = 26,
                Fill = new LinearGradientBrush(Color.FromRgb(0xC9, 0xED, 0xF7), Color.FromRgb(0x9E, 0xD9, 0xEE), 90),
            });
            AddDecor("🌾", 30, H - 150, 80);
            AddDecor("🌾", W - 110, H - 160, 86);
            AddDecor("🦋", W - 220, 40, 44);

            // Le MOT en image, en grand à gauche.
            var card = new Border
            {
                Background = Brushes.White,
                CornerRadius = new CornerRadius(26),
                Padding = new Thickness(26, 16, 26, 16),
                Child = new StackPanel
                {
                    Children =
                    {
                        Art.ForEmoji(_cur.Emoji, 150),
                        new TextBlock
                        {
                            Text = _act == 3 ? _cur.Word : _cur.Word,
                            FontSize = 40,
                            FontWeight = FontWeights.Bold,
                            Foreground = new SolidColorBrush(Color.FromRgb(0x2A, 0x5A, 0x3A)),
                            HorizontalAlignment = HorizontalAlignment.Center,
                        },
                    },
                },
            };
            Canvas.SetLeft(card, 60);
            Canvas.SetTop(card, 120);
            _canvas.Children.Add(card);

            // Les nénuphars : un par syllabe.
            _pads = new List<Border>();
            int n = _cur.S.Length;
            double x0 = 480, gap = Math.Min(240, (W - x0 - 180) / Math.Max(1, n));
            for (int k = 0; k < n; k++)
            {
                var pad = BuildPad(_cur.S[k], k);
                Canvas.SetLeft(pad, x0 + k * gap);
                Canvas.SetTop(pad, 320);
                _canvas.Children.Add(pad);
                _pads.Add(pad);
            }

            // La grenouille, au bord de la mare.
            _frog = new TextBlock { Text = "🐸", FontSize = 96, IsHitTestVisible = false, RenderTransformOrigin = new Point(0.5, 0.5) };
            _frog.RenderTransform = new TranslateTransform();
            Canvas.SetLeft(_frog, 360);
            Canvas.SetTop(_frog, 330);
            _frog.SetValue(Panel.ZIndexProperty, 60);
            _canvas.Children.Add(_frog);

            // Acte 2 : les boutons-nombres (1 à 4).
            if (_act == 2)
            {
                for (int v = 1; v <= 4; v++)
                {
                    int choice = v;
                    var btn = new Button
                    {
                        Style = (Style)Application.Current.Resources["AnswerButton"],
                        Width = 150,
                        Height = 150,
                        Content = new TextBlock
                        {
                            Text = v.ToString(),
                            FontSize = 76,
                            FontWeight = FontWeights.ExtraBold,
                            Foreground = new SolidColorBrush(Color.FromRgb(0x2A, 0x5A, 0x3A)),
                        },
                    };
                    btn.Click += (s, e) => { if (!Locked && !_demoRunning) Answer(choice, btn); };
                    Canvas.SetLeft(btn, 420 + (v - 1) * 180);
                    Canvas.SetTop(btn, 70);
                    _canvas.Children.Add(btn);
                }
            }

            SetBody(_canvas);

            // Entrée en scène : le mot est scandé une fois par la grenouille.
            if (_act == 3)
                Speak("Et maintenant... TON prénom ! " + _cur.Word + " !");
            else if (_act == 2)
                Speak("Écoute bien : " + _cur.Word + " !");
            else
                Speak(_cur.Word + " ! Regarde la grenouille scander les syllabes !");
            Schedule(1700, () => Demo(0, andCount: _act == 2 ? 0 : -1, thenSpeakCount: _act != 2));
        }

        // Chaque syllabe a SA couleur (nénuphars arc-en-ciel) et SA note de
        // musique : scander un mot, c'est chanter une petite mélodie.
        private static readonly (Color Bg, Color Border, Color Text)[] PadColors =
        {
            (Color.FromRgb(0xFF, 0x9F, 0xA8), Color.FromRgb(0xD5, 0x5A, 0x6E), Color.FromRgb(0x8A, 0x1F, 0x33)),
            (Color.FromRgb(0xFF, 0xD9, 0x7A), Color.FromRgb(0xD9, 0xA2, 0x2C), Color.FromRgb(0x7A, 0x52, 0x0A)),
            (Color.FromRgb(0x8F, 0xD6, 0x7A), Color.FromRgb(0x5E, 0xA8, 0x4C), Color.FromRgb(0x1F, 0x4A, 0x2A)),
            (Color.FromRgb(0x8A, 0xC8, 0xFF), Color.FromRgb(0x4A, 0x8A, 0xC8), Color.FromRgb(0x1F, 0x3A, 0x6E)),
        };

        private Border BuildPad(string syll, int k)
        {
            var col = PadColors[k % PadColors.Length];
            var label = new TextBlock
            {
                Text = syll.ToUpperInvariant(),
                FontSize = 46,
                FontWeight = FontWeights.ExtraBold,
                Foreground = new SolidColorBrush(col.Text),
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
            };
            // Regarder un nénuphar rejoue SA syllabe (la grenouille y saute).
            var hit = new Button
            {
                Background = Brushes.Transparent,
                BorderThickness = new Thickness(0),
                Opacity = 0,
            };
            int kk = k;
            hit.Click += (s, e) => { if (!Locked && !_demoRunning) HopTo(kk, speak: true); };

            var pad = new Border
            {
                Width = 190,
                Height = 150,
                Background = new SolidColorBrush(col.Bg),
                CornerRadius = new CornerRadius(90),
                BorderBrush = new SolidColorBrush(col.Border),
                BorderThickness = new Thickness(6),
                RenderTransformOrigin = new Point(0.5, 0.5),
                Child = new Grid { Children = { label, hit } },
            };
            pad.RenderTransform = new ScaleTransform(1, 1);
            return pad;
        }

        // ------------------------------------------------------------------
        //  La grenouille scande : saut + tambour + syllabe (+ badge compteur)
        // ------------------------------------------------------------------
        private readonly List<TextBlock> _badges = new List<TextBlock>();

        private void Demo(int k, int andCount, bool thenSpeakCount)
        {
            _demoRunning = true;
            if (k == 0) ClearBadges();
            if (k >= _cur.S.Length)
            {
                _demoRunning = false;
                if (thenSpeakCount)
                {
                    Speak(string.Join("... ", _cur.S.Select(s => s.ToUpperInvariant())) + " ! " +
                          _cur.S.Length + (_cur.S.Length > 1 ? " syllabes !" : " syllabe !"));
                    if (_act == 3) FinaleName();
                    else Schedule(3300, NextWord);
                }
                return;
            }
            HopTo(k, speak: true, withBadge: andCount >= 0);
            Schedule(1050, () => Demo(k + 1, andCount, thenSpeakCount));
        }

        private void HopTo(int k, bool speak, bool withBadge = false)
        {
            var pad = _pads[k];
            double px = Canvas.GetLeft(pad) + 50, py = Canvas.GetTop(pad) - 60;

            // Saut en cloche vers le nénuphar.
            var fx = Canvas.GetLeft(_frog);
            var fy = Canvas.GetTop(_frog);
            var ax = new DoubleAnimation(fx, px, TimeSpan.FromMilliseconds(520)) { EasingFunction = new SineEase() };
            var ay = new DoubleAnimationUsingKeyFrames { Duration = TimeSpan.FromMilliseconds(520) };
            ay.KeyFrames.Add(new SplineDoubleKeyFrame(Math.Min(fy, py) - 110, KeyTime.FromPercent(0.5), new KeySpline(0.2, 0.8, 0.4, 1)));
            ay.KeyFrames.Add(new SplineDoubleKeyFrame(py, KeyTime.FromPercent(1), new KeySpline(0.5, 0, 0.8, 1)));
            ay.Completed += (s, e) =>
            {
                SoundFx.Note(k); // la syllabe a SA note : le mot devient mélodie
                if (speak) Speech.SaySlow(_cur.S[k]);
                // Une note de musique s'envole du nénuphar.
                var mus = new TextBlock
                {
                    Text = k % 2 == 0 ? "🎵" : "🎶",
                    FontSize = 40,
                    IsHitTestVisible = false,
                    RenderTransformOrigin = new Point(0.5, 0.5),
                };
                var mtt = new TranslateTransform();
                mus.RenderTransform = mtt;
                Canvas.SetLeft(mus, px + 60);
                Canvas.SetTop(mus, Canvas.GetTop(pad) - 20);
                mus.SetValue(Panel.ZIndexProperty, 65);
                _canvas.Children.Add(mus);
                var upn = new DoubleAnimation(0, -110, TimeSpan.FromMilliseconds(900))
                { EasingFunction = new SineEase { EasingMode = EasingMode.EaseOut } };
                var fdn = new DoubleAnimation(1, 0, TimeSpan.FromMilliseconds(900));
                var capturedMus = mus;
                fdn.Completed += (s2, e2) => _canvas.Children.Remove(capturedMus);
                mtt.BeginAnimation(TranslateTransform.YProperty, upn);
                mus.BeginAnimation(OpacityProperty, fdn);
                // Le nénuphar s'enfonce et rebondit.
                var sc = (ScaleTransform)pad.RenderTransform;
                var dip = new DoubleAnimation(1, 0.86, TimeSpan.FromMilliseconds(160))
                { AutoReverse = true, EasingFunction = new SineEase() };
                sc.BeginAnimation(ScaleTransform.ScaleXProperty, dip);
                sc.BeginAnimation(ScaleTransform.ScaleYProperty, dip);
                Splash(px + 40, Canvas.GetTop(pad) + 140);
                if (withBadge) AddBadge(k, Canvas.GetLeft(pad) + 70, Canvas.GetTop(pad) - 130);
            };
            _frog.BeginAnimation(Canvas.LeftProperty, ax);
            _frog.BeginAnimation(Canvas.TopProperty, ay);
        }

        private void AddBadge(int k, double x, double y)
        {
            var b = new TextBlock
            {
                Text = (k + 1).ToString(),
                FontSize = 62,
                FontWeight = FontWeights.ExtraBold,
                Foreground = new SolidColorBrush(Color.FromRgb(0xE8, 0x5A, 0x2C)),
                IsHitTestVisible = false,
                RenderTransformOrigin = new Point(0.5, 0.5),
            };
            var sc = new ScaleTransform(0.2, 0.2);
            b.RenderTransform = sc;
            Canvas.SetLeft(b, x);
            Canvas.SetTop(b, y);
            b.SetValue(Panel.ZIndexProperty, 70);
            _canvas.Children.Add(b);
            _badges.Add(b);
            var pop = new DoubleAnimation(0.2, 1, TimeSpan.FromMilliseconds(360))
            { EasingFunction = new BackEase { EasingMode = EasingMode.EaseOut, Amplitude = 0.8 } };
            sc.BeginAnimation(ScaleTransform.ScaleXProperty, pop);
            sc.BeginAnimation(ScaleTransform.ScaleYProperty, pop);
        }

        private void ClearBadges()
        {
            foreach (var b in _badges) _canvas.Children.Remove(b);
            _badges.Clear();
        }

        private void Splash(double x, double y)
        {
            for (int i = 0; i < 5; i++)
            {
                var d = new Ellipse
                {
                    Width = 10,
                    Height = 14,
                    Fill = new SolidColorBrush(Color.FromArgb(180, 0x7A, 0xC8, 0xE8)),
                    IsHitTestVisible = false,
                };
                Canvas.SetLeft(d, x + (i - 2) * 16);
                Canvas.SetTop(d, y);
                _canvas.Children.Add(d);
                var up = new DoubleAnimationUsingKeyFrames { Duration = TimeSpan.FromMilliseconds(500) };
                up.KeyFrames.Add(new SplineDoubleKeyFrame(y - 40 - Math.Abs(i - 2) * 10, KeyTime.FromPercent(0.5), new KeySpline(0.2, 0.8, 0.4, 1)));
                up.KeyFrames.Add(new SplineDoubleKeyFrame(y + 10, KeyTime.FromPercent(1), new KeySpline(0.5, 0, 0.8, 1)));
                var fade = new DoubleAnimation(1, 0, TimeSpan.FromMilliseconds(500));
                var captured = d;
                fade.Completed += (s, e) => _canvas.Children.Remove(captured);
                d.BeginAnimation(Canvas.TopProperty, up);
                d.BeginAnimation(OpacityProperty, fade);
            }
        }

        // ------------------------------------------------------------------
        //  Acte 2 : la réponse (avec l'erreur qui enseigne)
        // ------------------------------------------------------------------
        private void Answer(int choice, Button btn)
        {
            int n = _cur.S.Length;
            if (choice == n)
            {
                Locked = true;
                GameKit.Success();
                Speak("Oui ! " + n + (n > 1 ? " syllabes !" : " syllabe !") + " On compte ensemble !");
                ClearBadges();
                ResetFrog();
                Schedule(1400, () => Demo(0, andCount: 0, thenSpeakCount: false));
                Schedule(1400 + n * 1050 + 600, () =>
                {
                    Celebrate();
                    Schedule(1800, NextWord);
                });
                return;
            }

            // Erreur pédagogique : on recompte, et on MONTRE le décalage.
            Shake(btn);
            Locked = true;
            Speak(choice < n
                ? "Tu as dit " + choice + "... mais écoute, il y en a plus ! On compte !"
                : "Tu as dit " + choice + "... mais écoute, il y en a moins ! On compte !");
            ClearBadges();
            ResetFrog();
            Schedule(1600, () => Demo(0, andCount: 0, thenSpeakCount: false));
            Schedule(1600 + n * 1050 + 500, () =>
            {
                Speak(n + (n > 1 ? " syllabes !" : " syllabe !") + " Essaie encore !");
                Locked = false;
            });
        }

        private void ResetFrog()
        {
            _frog.BeginAnimation(Canvas.LeftProperty, null);
            _frog.BeginAnimation(Canvas.TopProperty, null);
            Canvas.SetLeft(_frog, 360);
            Canvas.SetTop(_frog, 330);
        }

        // ------------------------------------------------------------------
        //  Acte 3 : le prénom — pluie de cœurs et grande fête
        // ------------------------------------------------------------------
        private void FinaleName()
        {
            Locked = true;
            Speak("Bravo " + _cur.Word + " ! Ton prénom a " + _cur.S.Length +
                  (_cur.S.Length > 1 ? " syllabes !" : " syllabe !"));
            for (int i = 0; i < 14; i++)
            {
                var heart = new TextBlock
                {
                    Text = i % 3 == 0 ? "💖" : i % 3 == 1 ? "⭐" : "💛",
                    FontSize = 34 + _rng.Next(26),
                    IsHitTestVisible = false,
                    Opacity = 0.95,
                };
                double x = _rng.NextDouble() * (W - 60);
                Canvas.SetLeft(heart, x);
                Canvas.SetTop(heart, -60);
                heart.SetValue(Panel.ZIndexProperty, 90);
                _canvas.Children.Add(heart);
                var fall = new DoubleAnimation(-60, H - 30, TimeSpan.FromMilliseconds(2200 + _rng.Next(1500)))
                { BeginTime = TimeSpan.FromMilliseconds(i * 160), EasingFunction = new SineEase { EasingMode = EasingMode.EaseIn } };
                var captured = heart;
                fall.Completed += (s, e) => _canvas.Children.Remove(captured);
                heart.BeginAnimation(Canvas.TopProperty, fall);
            }
            GameKit.Success();
            Celebrate();
            Schedule(4500, NewRound);
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
