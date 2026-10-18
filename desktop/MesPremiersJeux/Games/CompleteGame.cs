using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Shapes;
using MesPremiersJeux.Lib;

namespace MesPremiersJeux.Games
{
    /// <summary>
    /// « Le panier de 4 » (MS — maths : COMPLÉMENTS À 4, compléter une
    /// collection, droit du programme de l'école) : il faut 4 fruits dans le
    /// panier ; il y en a déjà quelques-uns — combien en manque-t-il ?
    /// Acte 1 : on complète librement (chaque fruit vole dans le panier, on
    /// compte à voix haute). Acte 2 : on DEVINE combien il en manque, puis on
    /// vérifie en comptant ensemble — l'erreur enseigne. Zéro lecture.
    /// </summary>
    public sealed class CompleteGame : GameControl
    {
        private const double W = 1460, H = 660;
        private const int Target = 4;

        private static readonly (string Emoji, string One, string Many)[] Items =
        {
            ("🍎", "pomme", "pommes"), ("🍓", "fraise", "fraises"),
            ("🌼", "fleur", "fleurs"), ("🥕", "carotte", "carottes"),
        };

        private readonly Random _rng = new Random();
        private Canvas _canvas;
        private int _act;
        private int _round;
        private int _inBasket;
        private (string Emoji, string One, string Many) _item;
        private TextBlock _countBig;

        public CompleteGame(Action celebrate) : base(celebrate) { }

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
            if (_act == 2 && _round > 3)
            {
                Question.Text = "🧺 Champion du panier de 4 !";
                Speak("Bravo ! Tu sais toujours compléter jusqu'à 4 ! Quel champion !");
                GameKit.Success();
                Celebrate();
                Schedule(3200, NewRound);
                return;
            }

            _item = Items[_rng.Next(Items.Length)];
            _inBasket = 1 + _rng.Next(Target - 1); // 1 à 3 déjà dans le panier
            int missing = Target - _inBasket;

            Question.Text = "🧺 Le panier de " + Target;
            SetConsigne(new TextBlock { Text = _item.Emoji + "🧺", FontSize = 80 },
                () => _act == 1
                    ? "Il faut " + Target + " " + _item.Many + " dans le panier ! Ajoute les " + _item.Many + " qui manquent !"
                    : "Il y a " + _inBasket + " " + _item.Many + "... Il en faut " + Target + " ! COMBIEN en manque-t-il ? Choisis le chiffre !");

            _canvas = new Canvas { Width = W, Height = H };
            _canvas.Children.Add(new Rectangle
            {
                Width = W,
                Height = H,
                RadiusX = 26,
                RadiusY = 26,
                Fill = new LinearGradientBrush(Color.FromRgb(0xEA, 0xF8, 0xE8), Color.FromRgb(0xFF, 0xF6, 0xDE), 90),
            });
            AddDecor("🌳", 20, 40, 150);
            AddDecor("☀️", W - 160, 20, 76);

            // Le panier et son contenu.
            AddDecor("🧺", W / 2 - 110, H - 280, 220);
            for (int i = 0; i < _inBasket; i++) AddFruitInBasket(i, pop: false);

            // Le GRAND compteur au-dessus du panier.
            _countBig = new TextBlock
            {
                Text = _inBasket.ToString(),
                FontSize = 110,
                FontWeight = FontWeights.ExtraBold,
                Foreground = new SolidColorBrush(Color.FromRgb(0xE8, 0x5A, 0x2C)),
                IsHitTestVisible = false,
                RenderTransformOrigin = new Point(0.5, 0.5),
            };
            _countBig.RenderTransform = new ScaleTransform(1, 1);
            Canvas.SetLeft(_countBig, W / 2 - 30);
            Canvas.SetTop(_countBig, H - 450);
            _canvas.Children.Add(_countBig);
            // Le but : 4 silhouettes au-dessus (ce qu'on vise).
            var goal = new TextBlock
            {
                Text = string.Concat(System.Linq.Enumerable.Repeat(_item.Emoji, Target)),
                FontSize = 42,
                Opacity = 0.45,
                IsHitTestVisible = false,
            };
            Canvas.SetLeft(goal, W / 2 - 110);
            Canvas.SetTop(goal, H - 530);
            _canvas.Children.Add(goal);

            if (_act == 1) BuildStock();
            else BuildGuess(missing);

            SetBody(_canvas);
            Speak(_act == 1
                ? "Il faut " + Target + " " + _item.Many + " dans le panier ! Regarde : il y en a déjà " + _inBasket +
                  " ! Ajoute celles qui manquent !"
                : "Il y a " + _inBasket + " " + _item.Many + " dans le panier. Il en faut " + Target +
                  " ! Combien en manque-t-il ? Choisis le chiffre !");
        }

        // ------------------------------------------------------------------
        //  Acte 1 : le stock de fruits à ajouter (un par un, en comptant)
        // ------------------------------------------------------------------
        private void BuildStock()
        {
            double[] xs = { 160, 320, 480, 1000, 1160 };
            for (int i = 0; i < 5; i++)
            {
                var btn = new Button
                {
                    Style = (Style)Application.Current.Resources["AnswerButton"],
                    Width = 150,
                    Height = 150,
                    Content = new TextBlock { Text = _item.Emoji, FontSize = 86 },
                };
                var captured = btn;
                btn.Click += (s, e) => AddOne(captured);
                Canvas.SetLeft(btn, xs[i]);
                Canvas.SetTop(btn, 110 + (i % 2) * 40);
                _canvas.Children.Add(btn);
            }
        }

        private void AddOne(Button btn)
        {
            if (Locked || _inBasket >= Target) return;
            btn.IsHitTestVisible = false;
            btn.Visibility = Visibility.Hidden;

            var flying = new TextBlock { Text = _item.Emoji, FontSize = 86, IsHitTestVisible = false };
            double x0 = Canvas.GetLeft(btn) + 30, y0 = Canvas.GetTop(btn) + 20;
            Canvas.SetLeft(flying, x0);
            Canvas.SetTop(flying, y0);
            flying.SetValue(Panel.ZIndexProperty, 60);
            _canvas.Children.Add(flying);

            int slot = _inBasket;
            double x1 = BasketSlotX(slot), y1 = H - 300;
            var ax = new DoubleAnimation(x0, x1, TimeSpan.FromMilliseconds(600)) { EasingFunction = new SineEase() };
            var ay = new DoubleAnimationUsingKeyFrames { Duration = TimeSpan.FromMilliseconds(600) };
            ay.KeyFrames.Add(new SplineDoubleKeyFrame(Math.Min(y0, y1) - 130, KeyTime.FromPercent(0.5), new KeySpline(0.2, 0.8, 0.4, 1)));
            ay.KeyFrames.Add(new SplineDoubleKeyFrame(y1, KeyTime.FromPercent(1), new KeySpline(0.5, 0, 0.8, 1)));
            ay.Completed += (s, e) =>
            {
                _canvas.Children.Remove(flying);
                _inBasket++;
                AddFruitInBasket(_inBasket - 1, pop: true);
                SoundFx.Note(_inBasket);
                Speech.Say(_inBasket.ToString() + " !");
                BumpCounter();
                if (_inBasket >= Target)
                {
                    Locked = true;
                    Schedule(1100, () =>
                    {
                        GameKit.Success();
                        Speak(Target + " " + _item.Many + " ! Le panier est plein ! Bravo !");
                        Celebrate();
                        Schedule(2800, Next);
                    });
                }
            };
            flying.BeginAnimation(Canvas.LeftProperty, ax);
            flying.BeginAnimation(Canvas.TopProperty, ay);
        }

        // ------------------------------------------------------------------
        //  Acte 2 : combien en manque-t-il ? (puis vérification en comptant)
        // ------------------------------------------------------------------
        private void BuildGuess(int missing)
        {
            double[] xs = { 250, 500, 750, 1000 };
            for (int v = 1; v <= 4; v++)
            {
                int choice = v;
                var btn = new Button
                {
                    Style = (Style)Application.Current.Resources["AnswerButton"],
                    Width = 160,
                    Height = 160,
                    Content = new TextBlock
                    {
                        Text = v.ToString(),
                        FontSize = 84,
                        FontWeight = FontWeights.ExtraBold,
                        Foreground = new SolidColorBrush(Color.FromRgb(0x2A, 0x5A, 0x3A)),
                    },
                };
                var captured = btn;
                btn.Click += (s, e) =>
                {
                    if (Locked) return;
                    if (choice == missing) GuessRight(missing);
                    else
                    {
                        Shake(captured);
                        Speak("Hmm... regarde bien ! Il y a " + _inBasket + " " + _item.Many +
                              ", et il en faut " + Target + " ! Compte avec moi ce qui manque !");
                        ShowMissingHint(missing);
                    }
                };
                Canvas.SetLeft(btn, xs[v - 1]);
                Canvas.SetTop(btn, 110);
                _canvas.Children.Add(btn);
            }
        }

        private void GuessRight(int missing)
        {
            Locked = true;
            GameKit.Success();
            Speak("Oui ! Il en manque " + missing + " ! On vérifie : on les ajoute !");
            // La vérification : les fruits manquants arrivent un par un.
            for (int i = 0; i < missing; i++)
            {
                int slot = _inBasket + i;
                int num = _inBasket + i + 1;
                Schedule(1600 + i * 900, () =>
                {
                    AddFruitInBasket(slot, pop: true);
                    SoundFx.Note(num);
                    Speech.Say(num.ToString() + " !");
                    _countBig.Text = num.ToString();
                    BumpCounter();
                });
            }
            Schedule(1600 + missing * 900 + 500, () =>
            {
                Speak(Target + " " + _item.Many + " ! Le compte est bon ! Bravo !");
                Celebrate();
                Schedule(2600, Next);
            });
        }

        // L'indice après une erreur : les places vides clignotent.
        private void ShowMissingHint(int missing)
        {
            for (int i = 0; i < missing; i++)
            {
                var ghost = new TextBlock
                {
                    Text = _item.Emoji,
                    FontSize = 62,
                    Opacity = 0,
                    IsHitTestVisible = false,
                };
                Canvas.SetLeft(ghost, BasketSlotX(_inBasket + i));
                Canvas.SetTop(ghost, H - 300);
                ghost.SetValue(Panel.ZIndexProperty, 55);
                _canvas.Children.Add(ghost);
                var blink = new DoubleAnimation(0, 0.55, TimeSpan.FromMilliseconds(450))
                { AutoReverse = true, RepeatBehavior = new RepeatBehavior(3), BeginTime = TimeSpan.FromMilliseconds(i * 220) };
                var captured = ghost;
                blink.Completed += (s, e) => _canvas.Children.Remove(captured);
                ghost.BeginAnimation(OpacityProperty, blink);
            }
        }

        // ------------------------------------------------------------------
        private double BasketSlotX(int slot) => W / 2 - 92 + slot * 50;

        private void AddFruitInBasket(int slot, bool pop)
        {
            var f = new TextBlock
            {
                Text = _item.Emoji,
                FontSize = 62,
                IsHitTestVisible = false,
                RenderTransformOrigin = new Point(0.5, 0.5),
            };
            Canvas.SetLeft(f, BasketSlotX(slot));
            Canvas.SetTop(f, H - 300);
            f.SetValue(Panel.ZIndexProperty, 50);
            _canvas.Children.Add(f);
            if (!pop) return;
            var sc = new ScaleTransform(0.3, 0.3);
            f.RenderTransform = sc;
            var grow = new DoubleAnimation(0.3, 1, TimeSpan.FromMilliseconds(320))
            { EasingFunction = new BackEase { EasingMode = EasingMode.EaseOut, Amplitude = 0.7 } };
            sc.BeginAnimation(ScaleTransform.ScaleXProperty, grow);
            sc.BeginAnimation(ScaleTransform.ScaleYProperty, grow);
        }

        private void BumpCounter()
        {
            _countBig.Text = _inBasket.ToString();
            var sc = (ScaleTransform)_countBig.RenderTransform;
            var bump = new DoubleAnimation(1, 1.35, TimeSpan.FromMilliseconds(220))
            { AutoReverse = true, EasingFunction = new SineEase() };
            sc.BeginAnimation(ScaleTransform.ScaleXProperty, bump);
            sc.BeginAnimation(ScaleTransform.ScaleYProperty, bump);
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
