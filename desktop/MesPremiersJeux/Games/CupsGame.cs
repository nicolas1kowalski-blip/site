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
    /// Les gobelets (bonneteau) : la balle est montrée sous un gobelet, les
    /// gobelets se mélangent sous les yeux de l'enfant, puis il doit retrouver
    /// la balle en fixant le bon gobelet.
    /// </summary>
    public sealed class CupsGame : GameControl
    {
        private const double W = 1300, H = 560;
        private static readonly double[] SlotX = { 110, 530, 950 }; // gauche des gobelets
        private const double CupW = 240, CupH = 260;
        private const double UpY = 40, DownY = 170;                 // gobelet levé / posé
        private const double BallY = 380;

        private static readonly Color[] CupColors =
        {
            Color.FromRgb(0xFF, 0x5F, 0x6D), Color.FromRgb(0x3B, 0x9B, 0xFF), Color.FromRgb(0xFF, 0xC1, 0x07),
        };

        private enum Phase { Show, Shuffle, Guess, Done }

        private Canvas _canvas;
        private Button[] _cups;      // par identité de gobelet
        private int[] _cupSlot;      // gobelet → case (0..2)
        private int _ballCup;        // gobelet qui cache la balle
        private Ellipse _ball;
        private Phase _phase;
        private int _swapsLeft;

        public CupsGame(Action celebrate) : base(celebrate) { }

        private static UIElement CupVisual(Color c)
        {
            var g = new Grid { Width = CupW, Height = CupH };
            var body = new Path
            {
                Fill = new LinearGradientBrush(Lighten(c), c, 90),
                Stroke = new SolidColorBrush(Color.FromRgb(0x2B, 0x2D, 0x42)),
                StrokeThickness = 5,
                StrokeLineJoin = PenLineJoin.Round,
                Data = Geometry.Parse("M 30,10 L 210,10 L 185,250 L 55,250 Z"),
            };
            g.Children.Add(body);
            // Bandes décoratives.
            g.Children.Add(new Path
            {
                Fill = new SolidColorBrush(Color.FromArgb(0x55, 0xFF, 0xFF, 0xFF)),
                Data = Geometry.Parse("M 34,40 L 206,40 L 201,85 L 39,85 Z"),
            });
            return g;
        }

        private static Color Lighten(Color c) => Color.FromRgb(
            (byte)(c.R + (255 - c.R) * 0.45), (byte)(c.G + (255 - c.G) * 0.45), (byte)(c.B + (255 - c.B) * 0.45));

        protected override void NewRound()
        {
            Locked = false;
            _phase = Phase.Show;
            Question.Text = "Regarde bien la balle !";

            _canvas = new Canvas { Width = W, Height = H };

            // La balle (dessinée sous les gobelets).
            _ball = new Ellipse
            {
                Width = 90,
                Height = 90,
                Fill = new RadialGradientBrush(Color.FromRgb(0xFF, 0x8F, 0xD3), Color.FromRgb(0xE9, 0x1E, 0x63)),
                Stroke = new SolidColorBrush(Color.FromRgb(0x2B, 0x2D, 0x42)),
                StrokeThickness = 4,
            };
            _ballCup = GameKit.RandInt(3);
            Canvas.SetTop(_ball, BallY);
            _canvas.Children.Add(_ball);

            // Les trois gobelets, levés au départ (la balle est visible).
            _cups = new Button[3];
            _cupSlot = new int[3];
            for (int i = 0; i < 3; i++)
            {
                _cupSlot[i] = i;
                var btn = new Button
                {
                    Style = (Style)Application.Current.Resources["BalloonButton"],
                    Width = CupW,
                    Height = CupH,
                    Content = CupVisual(CupColors[i]),
                };
                int cup = i;
                btn.Click += (s, e) => Guess(cup);
                Canvas.SetLeft(btn, SlotX[i]);
                Canvas.SetTop(btn, UpY);
                _canvas.Children.Add(btn);
                _cups[i] = btn;
            }
            PlaceBall();

            SetBody(_canvas);
            Schedule(350, () => Speak("Regarde bien où est la balle !"));

            // 1) On laisse regarder, 2) les gobelets descendent, 3) mélange.
            Schedule(2600, () =>
            {
                foreach (var c in _cups) AnimateTop(c, DownY);
                _ball.Visibility = Visibility.Hidden;
                Schedule(800, () =>
                {
                    _phase = Phase.Shuffle;
                    Question.Text = "Les gobelets se mélangent…";
                    _swapsLeft = 5;
                    DoNextSwap();
                });
            });
        }

        private void PlaceBall()
        {
            Canvas.SetLeft(_ball, SlotX[_cupSlot[_ballCup]] + (CupW - _ball.Width) / 2);
        }

        private void DoNextSwap()
        {
            if (_swapsLeft-- <= 0)
            {
                _phase = Phase.Guess;
                Question.Text = "Où est la balle ?";
                Speak("Où est la balle ?");
                return;
            }

            // Échange deux gobelets au hasard.
            int a = GameKit.RandInt(3);
            int b;
            do { b = GameKit.RandInt(3); } while (b == a);
            int sa = _cupSlot[a], sb = _cupSlot[b];
            _cupSlot[a] = sb;
            _cupSlot[b] = sa;
            AnimateLeft(_cups[a], SlotX[sb]);
            AnimateLeft(_cups[b], SlotX[sa]);

            Schedule(640, DoNextSwap);
        }

        private void Guess(int cup)
        {
            if (_phase != Phase.Guess || Locked) return;

            AnimateTop(_cups[cup], UpY);
            if (cup == _ballCup)
            {
                _phase = Phase.Done;
                Locked = true;
                PlaceBall();
                _ball.Visibility = Visibility.Visible;
                GameKit.Success();
                Celebrate();
                Speak("Bravo ! Tu as trouvé la balle !");
                ScheduleNext(2800);
            }
            else
            {
                GameKit.Wrong();
                Speak("Non, pas là ! Essaie encore !");
                Schedule(900, () => { if (_phase == Phase.Guess) AnimateTop(_cups[cup], DownY); });
            }
        }

        private static void AnimateLeft(UIElement el, double to)
        {
            var from = Canvas.GetLeft(el);
            el.BeginAnimation(Canvas.LeftProperty,
                new DoubleAnimation(from, to, TimeSpan.FromMilliseconds(520))
                { EasingFunction = new QuadraticEase { EasingMode = EasingMode.EaseInOut } });
        }

        private static void AnimateTop(UIElement el, double to)
        {
            var from = Canvas.GetTop(el);
            el.BeginAnimation(Canvas.TopProperty,
                new DoubleAnimation(from, to, TimeSpan.FromMilliseconds(420))
                { EasingFunction = new QuadraticEase { EasingMode = EasingMode.EaseInOut } });
        }
    }
}
