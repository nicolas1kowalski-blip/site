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
    /// « Grand ou petit » (PS), refondu en TROIS ACTES progressifs :
    ///   1. Découverte — le GRAND et le petit côte à côte : regarder le grand le
    ///      fait GROSSIR encore (« GRAND ! »), regarder le petit le fait se
    ///      blottir (« petit ! ») ; deux objets différents à explorer.
    ///   2. Trouve — « Trouve le GRAND chat ! » : le bon choix grossit fièrement
    ///      ou se fait tout petit, sous les confettis.
    ///   3. Range-les ! — trois tailles : montrer le plus petit, puis le moyen,
    ///      puis le plus grand — chacun gagne son ⭐ dans l'ordre.
    /// Consignes dites à voix haute (🔊), jamais à lire.
    /// </summary>
    public sealed class SizeGame : GameControl
    {
        private const double W = 1400, H = 680;

        private Canvas _canvas;
        private int _phase;
        private int _screen;          // acte 1 : 1er ou 2e objet
        private bool _sawBig, _sawSmall;
        private int _findRound, _orderRound, _orderStep;

        public SizeGame(Action celebrate) : base(celebrate) { }

        protected override void NewRound()
        {
            _screen = 0;
            StartDiscovery();
        }

        // « le chat » → « chat » (pour dire « le grand chat »).
        private static string StripArticle(string fr)
        {
            foreach (var a in new[] { "le ", "la ", "l'" })
                if (fr.StartsWith(a)) return fr.Substring(a.Length);
            return fr;
        }

        private Button ItemButton(CartoonItem item, double visual, double btnSize)
        {
            return new Button
            {
                Style = (Style)Application.Current.Resources["BalloonButton"],
                Width = btnSize,
                Height = btnSize,
                Content = new Viewbox
                {
                    Child = item.Build(),
                    Width = visual,
                    Height = visual,
                    VerticalAlignment = VerticalAlignment.Bottom,
                },
                RenderTransformOrigin = new Point(0.5, 0.9),
            };
        }

        // ==================================================================
        // ACTE 1 — Découverte du contraste grand / petit.
        // ==================================================================
        private void StartDiscovery()
        {
            _phase = 1;
            Locked = false;
            _sawBig = _sawSmall = false;
            var item = GameKit.Rand(CartoonArt.Items);
            string noun = StripArticle(item.Fr);
            Question.Text = "📏 Le GRAND et le petit " + noun;
            _canvas = new Canvas { Width = W, Height = H };

            var bigBtn = ItemButton(item, 350, 430);
            var smallBtn = ItemButton(item, 130, 430);
            Canvas.SetLeft(bigBtn, 180);
            Canvas.SetTop(bigBtn, 120);
            Canvas.SetLeft(smallBtn, 790);
            Canvas.SetTop(smallBtn, 120);
            _canvas.Children.Add(bigBtn);
            _canvas.Children.Add(smallBtn);

            var captBig = bigBtn;
            var captSmall = smallBtn;
            bigBtn.Click += (s, e) => DiscoverSize(captBig, true, noun);
            smallBtn.Click += (s, e) => DiscoverSize(captSmall, false, noun);

            var speaker = SpeakerButton(() => "Regarde le GRAND " + noun + ", et le petit " + noun + " !");
            Canvas.SetLeft(speaker, W - 140);
            Canvas.SetTop(speaker, 20);
            _canvas.Children.Add(speaker);

            SetBody(_canvas);
            Schedule(450, () => Speak("Regarde : le GRAND " + noun + "... et le petit " + noun + " ! Touche-les avec tes yeux !"));
        }

        private void DiscoverSize(Button btn, bool isBig, string noun)
        {
            if (_phase != 1 || Locked) return;

            var sc = new ScaleTransform(1, 1);
            btn.RenderTransform = sc;
            if (isBig)
            {
                // Le grand GROSSIT encore, tout fier (voix : « GRAND ! »).
                Speak("GRAND ! Le GRAND " + noun + " !");
                var grow = new DoubleAnimation(1, 1.35, TimeSpan.FromMilliseconds(450))
                { AutoReverse = true, EasingFunction = new BackEase { EasingMode = EasingMode.EaseOut, Amplitude = 0.5 } };
                sc.BeginAnimation(ScaleTransform.ScaleXProperty, grow);
                sc.BeginAnimation(ScaleTransform.ScaleYProperty, grow);
                if (!_sawBig) { _sawBig = true; AddStar(btn); }
            }
            else
            {
                // Le petit se blottit (voix douce : « petit ! »).
                Speak("petit ! Le tout petit " + noun + " !");
                var shrink = new DoubleAnimation(1, 0.6, TimeSpan.FromMilliseconds(420))
                { AutoReverse = true, EasingFunction = new SineEase() };
                sc.BeginAnimation(ScaleTransform.ScaleXProperty, shrink);
                sc.BeginAnimation(ScaleTransform.ScaleYProperty, shrink);
                if (!_sawSmall) { _sawSmall = true; AddStar(btn); }
            }

            if (_sawBig && _sawSmall)
            {
                _phase = 0;
                Locked = true;
                _screen++;
                if (_screen < 2)
                {
                    Speak("Bravo ! Regarde avec un autre ami !");
                    Schedule(2200, StartDiscovery);
                }
                else
                {
                    Speak("Tu as tout compris ! Maintenant, à toi de trouver !");
                    Schedule(2400, () => { _findRound = 0; NextFind(); });
                }
            }
        }

        private void AddStar(Button btn)
        {
            var star = new TextBlock { Text = "⭐", FontSize = 36, IsHitTestVisible = false };
            star.SetValue(Panel.ZIndexProperty, 60);
            Canvas.SetLeft(star, Canvas.GetLeft(btn) + btn.Width - 34);
            Canvas.SetTop(star, Canvas.GetTop(btn) - 6);
            _canvas.Children.Add(star);
        }

        // ==================================================================
        // ACTE 2 — « Trouve le GRAND / le petit ».
        // ==================================================================
        private void NextFind()
        {
            if (_findRound >= 4)
            {
                _phase = 0;
                Locked = true;
                Celebrate();
                Speak("Super ! Maintenant, on les range du plus petit au plus grand !");
                Schedule(2800, () => { _orderRound = 0; NextOrder(); });
                return;
            }

            _phase = 2;
            Locked = false;
            var item = GameKit.Rand(CartoonArt.Items);
            bool wantBig = GameKit.RandInt(2) == 0;
            string noun = StripArticle(item.Fr);
            Question.Text = wantBig ? "🔎 Trouve le GRAND " + noun + " !" : "🔎 Trouve le petit " + noun + " !";
            _canvas = new Canvas { Width = W, Height = H };

            bool bigFirst = GameKit.RandInt(2) == 0;
            double x = 180;
            foreach (var isBig in bigFirst ? new[] { true, false } : new[] { false, true })
            {
                var btn = ItemButton(item, isBig ? 350 : 130, 430);
                Canvas.SetLeft(btn, x);
                Canvas.SetTop(btn, 120);
                _canvas.Children.Add(btn);
                bool big = isBig;
                var captBtn = btn;
                btn.Click += (s, e) => AnswerFind(captBtn, big, wantBig, noun);
                x += 610;
            }

            var speaker = SpeakerButton(() => "Trouve le " + (wantBig ? "GRAND " : "petit ") + noun + " !");
            Canvas.SetLeft(speaker, W - 140);
            Canvas.SetTop(speaker, 20);
            _canvas.Children.Add(speaker);

            SetBody(_canvas);
            Schedule(400, () => Speak("Trouve le " + (wantBig ? "grand" : "petit") + " " + noun + " !"));
        }

        private void AnswerFind(Button btn, bool isBig, bool wantBig, string noun)
        {
            if (_phase != 2 || Locked) return;
            if (isBig == wantBig)
            {
                Locked = true;
                GameKit.Success();
                Celebrate();
                var sc = new ScaleTransform(1, 1);
                btn.RenderTransform = sc;
                var anim = wantBig
                    ? new DoubleAnimation(1, 1.4, TimeSpan.FromMilliseconds(500)) { AutoReverse = true, EasingFunction = new BackEase { EasingMode = EasingMode.EaseOut, Amplitude = 0.5 } }
                    : new DoubleAnimation(1, 0.55, TimeSpan.FromMilliseconds(460)) { AutoReverse = true, EasingFunction = new SineEase() };
                sc.BeginAnimation(ScaleTransform.ScaleXProperty, anim);
                sc.BeginAnimation(ScaleTransform.ScaleYProperty, anim);
                Speak("Bravo ! Ça, c'est le " + (wantBig ? "grand" : "petit") + " " + noun + " !");
                _findRound++;
                Schedule(2300, NextFind);
            }
            else
            {
                GameKit.Wrong();
                Shake(btn);
                Speak(wantBig ? "Non, ça c'est le petit ! Cherche le grand !" : "Non, ça c'est le grand ! Cherche le petit !");
            }
        }

        // ==================================================================
        // ACTE 3 — « Range-les ! » : du plus petit au plus grand.
        // ==================================================================
        private void NextOrder()
        {
            if (_orderRound >= 2)
            {
                _phase = 0;
                Locked = true;
                Question.Text = "🎉 Petit, moyen, grand : tu sais tout !";
                Celebrate();
                Speak("Bravo ! Petit, moyen, grand : tu sais les ranger !");
                ScheduleNext(4400);
                return;
            }

            _phase = 3;
            Locked = false;
            _orderStep = 0;
            var item = GameKit.Rand(CartoonArt.Items);
            string noun = StripArticle(item.Fr);
            Question.Text = "🪜 Montre le plus petit, puis le moyen, puis le plus grand !";
            _canvas = new Canvas { Width = W, Height = H };

            var sizes = new[] { 120, 220, 330 }; // 0 = petit, 1 = moyen, 2 = grand
            var order = GameKit.Shuffle(new[] { 0, 1, 2 });
            double x = 120;
            for (int i = 0; i < 3; i++)
            {
                int rank = order[i];
                var btn = ItemButton(item, sizes[rank], 400);
                Canvas.SetLeft(btn, x);
                Canvas.SetTop(btn, 130);
                _canvas.Children.Add(btn);
                int captRank = rank;
                var captBtn = btn;
                btn.Click += (s, e) => AnswerOrder(captBtn, captRank, noun);
                x += 440;
            }

            var speaker = SpeakerButton(() =>
                _orderStep == 0 ? "Montre le plus petit " + noun + " !"
                : _orderStep == 1 ? "Maintenant, le moyen !"
                : "Et le plus grand !");
            Canvas.SetLeft(speaker, W - 140);
            Canvas.SetTop(speaker, 20);
            _canvas.Children.Add(speaker);

            SetBody(_canvas);
            Schedule(400, () => Speak("On les range ! Montre le plus petit " + noun + " !"));
        }

        private void AnswerOrder(Button btn, int rank, string noun)
        {
            if (_phase != 3 || Locked) return;
            if (rank == _orderStep)
            {
                GameKit.Success();
                AddStar(btn);
                var sc = new ScaleTransform(1, 1);
                btn.RenderTransform = sc;
                var pop = new DoubleAnimation(1, 1.22, TimeSpan.FromMilliseconds(300))
                { AutoReverse = true, EasingFunction = new SineEase() };
                sc.BeginAnimation(ScaleTransform.ScaleXProperty, pop);
                sc.BeginAnimation(ScaleTransform.ScaleYProperty, pop);
                _orderStep++;
                if (_orderStep == 1) Speak("Oui, le plus petit ! Maintenant, le moyen !");
                else if (_orderStep == 2) Speak("Le moyen, bravo ! Et le plus grand !");
                else
                {
                    Locked = true;
                    Celebrate();
                    Speak("Petit, moyen, grand : parfait !");
                    _orderRound++;
                    Schedule(2600, NextOrder);
                }
            }
            else
            {
                GameKit.Wrong();
                Shake(btn);
                string want = _orderStep == 0 ? "le plus petit" : _orderStep == 1 ? "le moyen" : "le plus grand";
                string got = rank == 0 ? "le plus petit" : rank == 1 ? "le moyen" : "le plus grand";
                Speak("Ça, c'est " + got + ". Cherche " + want + " !");
            }
        }
    }
}
