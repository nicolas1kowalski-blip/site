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
    /// « L'imagier » (PS/MS), refondu en TROIS ACTES progressifs. À chaque partie,
    /// SIX images sont tirées au sort (dessins + photos de famille du dossier
    /// Documents\MesPremiersJeux\Famille) :
    ///   1. Découverte — regarder une image la fait danser et dit son nom ;
    ///      chaque image vue gagne son ⭐, on continue quand les six sont vues.
    ///   2. Montre-moi — « Trouve le chat ! » parmi TROIS images, 🔊 pour
    ///      réentendre (montrer un modèle donnerait la réponse : ici on travaille
    ///      le mot entendu).
    ///   3. Le grand imagier — même jeu mais parmi les SIX images à la fois.
    /// L'image trouvée surgit en grand au centre, sous les confettis.
    /// </summary>
    public sealed class VocabGame : GameControl
    {
        private const double W = 1400, H = 680;

        private sealed class Entry
        {
            public string Key;
            public string Fr;
            public Func<UIElement> Visual;
        }

        private readonly List<Entry> _pool = new List<Entry>();

        private Canvas _canvas;
        private int _phase;
        private List<Entry> _session;
        private bool[] _seen;
        private List<int> _askOrder;
        private int _askRound, _hardRound;

        public VocabGame(Action celebrate) : base(celebrate)
        {
            foreach (var it in CartoonArt.Items)
            {
                var item = it;
                _pool.Add(new Entry { Key = item.Name, Fr = item.Fr, Visual = () => item.Build() });
            }
            foreach (var (name, path) in UserContent.LoadFamily())
            {
                var p = path;
                _pool.Add(new Entry
                {
                    Key = "fam-" + name,
                    Fr = name,
                    Visual = () => MakePhoto(p),
                });
            }
        }

        private static UIElement MakePhoto(string path)
        {
            try
            {
                return new Border
                {
                    CornerRadius = new CornerRadius(18),
                    ClipToBounds = true,
                    Child = new Image { Source = UserContent.LoadBitmap(path, 700), Stretch = Stretch.UniformToFill },
                };
            }
            catch
            {
                return new TextBlock { Text = "🖼️", FontSize = 120 };
            }
        }

        protected override void NewRound()
        {
            _session = GameKit.Shuffle(_pool).Take(Math.Min(6, _pool.Count)).ToList();
            StartDiscovery();
        }

        private Button ImageButton(Entry e, double size)
        {
            return new Button
            {
                Style = (Style)Application.Current.Resources["AnswerButton"],
                Width = size,
                Height = size,
                Content = new Viewbox { Child = e.Visual(), Margin = new Thickness(18) },
                RenderTransformOrigin = new Point(0.5, 0.5),
            };
        }

        // ==================================================================
        // ACTE 1 — Découverte : chaque image dit son nom.
        // ==================================================================
        private void StartDiscovery()
        {
            _phase = 1;
            Locked = false;
            _seen = new bool[_session.Count];
            Question.Text = "🖼️ L'imagier";
            _canvas = new Canvas { Width = W, Height = H };

            double size = 285, gapX = 40, gapY = 26;
            int cols = 3;
            double x0 = (W - cols * size - (cols - 1) * gapX) / 2, y0 = 26;
            for (int i = 0; i < _session.Count; i++)
            {
                var btn = ImageButton(_session[i], size);
                int idx = i;
                var captBtn = btn;
                btn.Click += (s, e) => Discover(captBtn, idx);
                Canvas.SetLeft(btn, x0 + (i % cols) * (size + gapX));
                Canvas.SetTop(btn, y0 + (i / cols) * (size + gapY));
                _canvas.Children.Add(btn);
            }

            var speaker = SpeakerButton(() => "Regarde chaque image pour entendre son nom !");
            Canvas.SetLeft(speaker, W - 140);
            Canvas.SetTop(speaker, 20);
            _canvas.Children.Add(speaker);

            SetBody(_canvas);
            Schedule(450, () => Speak("L'imagier ! Regarde chaque image pour entendre son nom !"));
        }

        private void Discover(Button btn, int i)
        {
            if (_phase != 1 || Locked || _seen[i]) return;
            _seen[i] = true;
            Speak("C'est " + _session[i].Fr + " !");
            Bounce(btn);
            var star = new TextBlock { Text = "⭐", FontSize = 34, IsHitTestVisible = false };
            star.SetValue(Panel.ZIndexProperty, 60);
            Canvas.SetLeft(star, Canvas.GetLeft(btn) + btn.Width - 30);
            Canvas.SetTop(star, Canvas.GetTop(btn) - 8);
            _canvas.Children.Add(star);

            if (_seen.All(v => v))
            {
                _phase = 0;
                Locked = true;
                Speak("Bravo, tu as tout regardé ! Maintenant, montre-moi !");
                Schedule(2600, () =>
                {
                    _askOrder = GameKit.Shuffle(Enumerable.Range(0, _session.Count));
                    _askRound = 0;
                    NextAsk();
                });
            }
        }

        // ==================================================================
        // ACTE 2 — « Montre-moi » : trouver parmi TROIS.
        // ==================================================================
        private void NextAsk()
        {
            if (_askRound >= 4)
            {
                _phase = 0;
                Locked = true;
                Celebrate();
                Speak("Super ! Maintenant, le grand imagier : toutes les images en même temps !");
                Schedule(2800, () => { _hardRound = 0; NextHard(); });
                return;
            }

            _phase = 2;
            Locked = false;
            var target = _session[_askOrder[_askRound]];
            Question.Text = "🔎 Trouve : " + target.Fr;
            _canvas = new Canvas { Width = W, Height = H };

            var speaker = SpeakerButton(() => "Trouve " + target.Fr + " !");
            Canvas.SetLeft(speaker, W / 2 - 54);
            Canvas.SetTop(speaker, 14);
            _canvas.Children.Add(speaker);

            var picks = new List<Entry> { target };
            foreach (var o in GameKit.Shuffle(_session.Where(e2 => e2.Key != target.Key)))
            {
                if (picks.Count >= 3) break;
                picks.Add(o);
            }
            picks = GameKit.Shuffle(picks);

            double size = 330, gap = 70;
            double x0 = (W - 3 * size - 2 * gap) / 2, y = 180;
            foreach (var it in picks)
            {
                var btn = ImageButton(it, size);
                var chosen = it;
                var captBtn = btn;
                btn.Click += (s, e) => Answer(captBtn, chosen, target);
                Canvas.SetLeft(btn, x0);
                Canvas.SetTop(btn, y);
                x0 += size + gap;
                _canvas.Children.Add(btn);
            }

            SetBody(_canvas);
            Schedule(400, () => Speak("Trouve " + target.Fr + " !"));
        }

        // ==================================================================
        // ACTE 3 — « Le grand imagier » : trouver parmi les SIX.
        // ==================================================================
        private void NextHard()
        {
            if (_hardRound >= 4)
            {
                _phase = 0;
                Locked = true;
                Question.Text = "🎉 Tu connais toutes les images !";
                Celebrate();
                Speak("Bravo ! Tu connais tout l'imagier !");
                ScheduleNext(4600);
                return;
            }

            _phase = 3;
            Locked = false;
            var target = _session[GameKit.RandInt(_session.Count)];
            Question.Text = "🔎 Trouve : " + target.Fr;
            _canvas = new Canvas { Width = W, Height = H };

            var speaker = SpeakerButton(() => "Cherche bien : trouve " + target.Fr + " !");
            Canvas.SetLeft(speaker, W - 140);
            Canvas.SetTop(speaker, 20);
            _canvas.Children.Add(speaker);

            double size = 285, gapX = 40, gapY = 26;
            int cols = 3;
            double x0 = (W - cols * size - (cols - 1) * gapX) / 2, y0 = 26;
            var order = GameKit.Shuffle(Enumerable.Range(0, _session.Count));
            for (int i = 0; i < _session.Count; i++)
            {
                var it = _session[order[i]];
                var btn = ImageButton(it, size);
                var chosen = it;
                var captBtn = btn;
                btn.Click += (s, e) => Answer(captBtn, chosen, target);
                Canvas.SetLeft(btn, x0 + (i % cols) * (size + gapX));
                Canvas.SetTop(btn, y0 + (i / cols) * (size + gapY));
                _canvas.Children.Add(btn);
            }

            SetBody(_canvas);
            Schedule(400, () => Speak("Trouve " + target.Fr + " !"));
        }

        private void Answer(Button btn, Entry chosen, Entry target)
        {
            if ((_phase != 2 && _phase != 3) || Locked) return;
            if (chosen.Key == target.Key)
            {
                Locked = true;
                GameKit.Success();
                Celebrate();
                Bounce(btn);
                Speak("Bravo ! C'est " + target.Fr + " !");

                // L'image trouvée SURGIT en grand au centre de l'écran.
                var big = new Border
                {
                    Width = 340,
                    Height = 340,
                    CornerRadius = new CornerRadius(30),
                    Background = Brushes.White,
                    BorderBrush = new SolidColorBrush(Color.FromRgb(0xFF, 0xC1, 0x07)),
                    BorderThickness = new Thickness(7),
                    Child = new Viewbox { Child = target.Visual(), Margin = new Thickness(20) },
                    RenderTransformOrigin = new Point(0.5, 0.5),
                    IsHitTestVisible = false,
                };
                var sc = new ScaleTransform(0.2, 0.2);
                big.RenderTransform = sc;
                Canvas.SetLeft(big, W / 2 - 170);
                Canvas.SetTop(big, H / 2 - 190);
                big.SetValue(Panel.ZIndexProperty, 90);
                _canvas.Children.Add(big);
                var pop = new DoubleAnimation(0.2, 1, TimeSpan.FromMilliseconds(520))
                { EasingFunction = new BackEase { EasingMode = EasingMode.EaseOut, Amplitude = 0.7 } };
                sc.BeginAnimation(ScaleTransform.ScaleXProperty, pop);
                sc.BeginAnimation(ScaleTransform.ScaleYProperty, pop);

                if (_phase == 2) { _askRound++; Schedule(2500, NextAsk); }
                else { _hardRound++; Schedule(2500, NextHard); }
            }
            else
            {
                GameKit.Wrong();
                Shake(btn);
                Speak("Non, ça c'est " + chosen.Fr + ". Cherche " + target.Fr + " !");
            }
        }

        private static void Bounce(FrameworkElement el)
        {
            var sc = new ScaleTransform(1, 1);
            el.RenderTransform = sc;
            var pop = new DoubleAnimation(1, 1.18, TimeSpan.FromMilliseconds(280))
            { AutoReverse = true, EasingFunction = new SineEase() };
            sc.BeginAnimation(ScaleTransform.ScaleXProperty, pop);
            sc.BeginAnimation(ScaleTransform.ScaleYProperty, pop);
        }
    }
}
