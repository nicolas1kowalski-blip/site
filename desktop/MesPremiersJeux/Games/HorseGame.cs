using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Shapes;
using MesPremiersJeux.Gaze;
using MesPremiersJeux.Lib;

namespace MesPremiersJeux.Games
{
    /// <summary>
    /// Le jeu des chevaux, version course : deux chevaux (l'enfant et un parent),
    /// chacun sa piste colorée. On lance le grand dé au regard, le cheval galope
    /// d'autant de cases, et le premier à franchir la ligne d'arrivée 🏁 gagne.
    /// </summary>
    public sealed class HorseGame : GameControl
    {
        private const double W = 1440, H = 760;
        private const int TrackLen = 22;
        private const double StartX = 130, FinishX = 980;
        private const double Hw = 96, Hh = 96;

        private static readonly Color[] PlayerColor =
        {
            Color.FromRgb(0xE8, 0x3A, 0x3A), // rouge — l'enfant
            Color.FromRgb(0x2E, 0x8B, 0xE6), // bleu — le parent
        };
        private static readonly string[] PlayerName = { "Cheval rouge", "Cheval bleu" };
        private static readonly double[] LaneY = { 150, 360 };
        private const double LaneH = 168;

        private Canvas _canvas;
        private DiceView _dice;
        private Button _dieBtn;
        private Border _banner;
        private TextBlock _bannerText;

        private readonly TranslateTransform[] _tt = new TranslateTransform[2];
        private readonly ScaleTransform[] _ts = new ScaleTransform[2];
        private readonly Grid[] _horse = new Grid[2];
        private ScaleTransform _dieScale;
        private readonly int[] _pos = new int[2];
        private int _current;
        private int _lastVal;
        private bool _win;
        private bool _gazePaused; // le regard est-il en pause (tour du parent) ?

        private double Seg => (FinishX - StartX) / TrackLen;

        public HorseGame(Action celebrate) : base(celebrate)
        {
            Unloaded += (s, e) => ReleaseGaze();
        }

        // Tour de l'enfant (0) : regard actif. Tour du parent (1) : regard en pause,
        // le dé se lance à la souris / au toucher.
        private void SetGazeForPlayer(int p)
        {
            if (p == 0) ReleaseGaze();
            else if (!_gazePaused) { GazeGate.Push(); _gazePaused = true; }
        }

        private void ReleaseGaze()
        {
            if (_gazePaused) { GazeGate.Pop(); _gazePaused = false; }
        }

        protected override void NewRound()
        {
            ReleaseGaze();
            _win = false;
            Locked = false;
            _current = 0;
            _pos[0] = _pos[1] = 0;
            Question.Text = "🐴  La course des chevaux";

            _canvas = new Canvas { Width = W, Height = H };
            DrawTracks();
            DrawControls();
            DrawHorses();
            SetBody(_canvas);

            Schedule(500, () =>
            {
                Speak("La course des chevaux ! " + PlayerName[0] + ", regarde le dé pour lancer !");
                StartTurn();
            });
        }

        // --- Décor ---

        private void DrawTracks()
        {
            for (int p = 0; p < 2; p++)
            {
                var lane = new Border
                {
                    Width = FinishX - StartX + 200,
                    Height = LaneH,
                    CornerRadius = new CornerRadius(24),
                    Background = new SolidColorBrush(p == 0
                        ? Color.FromRgb(0xFF, 0xE6, 0xE6) : Color.FromRgb(0xE3, 0xF0, 0xFF)),
                    BorderBrush = new SolidColorBrush(PlayerColor[p]),
                    BorderThickness = new Thickness(3),
                };
                Canvas.SetLeft(lane, StartX - 90);
                Canvas.SetTop(lane, LaneY[p] - LaneH / 2);
                _canvas.Children.Add(lane);

                // Repères de cases le long de la piste.
                for (int i = 1; i < TrackLen; i++)
                {
                    var tick = new Line
                    {
                        X1 = StartX + i * Seg, Y1 = LaneY[p] - LaneH / 2 + 12,
                        X2 = StartX + i * Seg, Y2 = LaneY[p] + LaneH / 2 - 12,
                        Stroke = new SolidColorBrush(Color.FromArgb(0x55, PlayerColor[p].R, PlayerColor[p].G, PlayerColor[p].B)),
                        StrokeThickness = 2,
                        StrokeDashArray = new DoubleCollection { 2, 4 },
                    };
                    _canvas.Children.Add(tick);
                }

                // Ligne d'arrivée (damier).
                DrawFinish(LaneY[p]);
            }
        }

        private void DrawFinish(double centerY)
        {
            const double cell = 20;
            int rows = (int)(LaneH / cell);
            for (int r = 0; r < rows; r++)
                for (int c = 0; c < 2; c++)
                {
                    var sq = new Rectangle
                    {
                        Width = cell,
                        Height = cell,
                        Fill = ((r + c) % 2 == 0) ? Brushes.Black : Brushes.White,
                    };
                    Canvas.SetLeft(sq, FinishX + c * cell);
                    Canvas.SetTop(sq, centerY - LaneH / 2 + r * cell);
                    _canvas.Children.Add(sq);
                }
            var flag = new TextBlock { Text = "🏁", FontSize = 40 };
            Canvas.SetLeft(flag, FinishX + 4);
            Canvas.SetTop(flag, centerY - LaneH / 2 - 46);
            _canvas.Children.Add(flag);
        }

        private void DrawControls()
        {
            const double colX = 1070;

            _banner = new Border
            {
                Width = 340,
                CornerRadius = new CornerRadius(24),
                Padding = new Thickness(16, 14, 16, 14),
                Background = new SolidColorBrush(PlayerColor[0]),
            };
            _bannerText = new TextBlock
            {
                FontSize = 27,
                FontWeight = FontWeights.Bold,
                Foreground = Brushes.White,
                TextAlignment = TextAlignment.Center,
                TextWrapping = TextWrapping.Wrap,
                HorizontalAlignment = HorizontalAlignment.Center,
            };
            _banner.Child = _bannerText;
            Canvas.SetLeft(_banner, colX);
            Canvas.SetTop(_banner, 70);
            _canvas.Children.Add(_banner);

            _dice = new DiceView();
            _dieBtn = new Button
            {
                Style = (Style)Application.Current.Resources["BalloonButton"],
                Width = 224,
                Height = 224,
                Content = _dice.Root,
            };
            _dieBtn.Click += (s, e) => Roll();
            _dieBtn.RenderTransformOrigin = new Point(0.5, 0.5);
            _dieScale = new ScaleTransform(1, 1);
            _dieBtn.RenderTransform = _dieScale;
            Canvas.SetLeft(_dieBtn, colX + 170 - 112);
            Canvas.SetTop(_dieBtn, 280);
            _canvas.Children.Add(_dieBtn);

            var hint = new TextBlock
            {
                Text = "🐴 l'enfant regarde  ·  ✋ le parent touche",
                FontSize = 21,
                Foreground = new SolidColorBrush(Color.FromRgb(0x6B, 0x5A, 0x8A)),
                Width = 340,
                TextAlignment = TextAlignment.Center,
            };
            Canvas.SetLeft(hint, colX);
            Canvas.SetTop(hint, 528);
            _canvas.Children.Add(hint);
        }

        private void DrawHorses()
        {
            for (int p = 0; p < 2; p++)
            {
                var g = new Grid { Width = Hw, Height = Hh };
                g.Children.Add(new Ellipse
                {
                    Fill = new RadialGradientBrush(Lighten(PlayerColor[p]), PlayerColor[p]),
                    Stroke = Brushes.White,
                    StrokeThickness = 5,
                });
                g.Children.Add(new TextBlock
                {
                    Text = "🐴",
                    FontSize = 54,
                    HorizontalAlignment = HorizontalAlignment.Center,
                    VerticalAlignment = VerticalAlignment.Center,
                });
                g.RenderTransformOrigin = new Point(0.5, 0.5);
                var tt = new TranslateTransform(0, 0);
                var sc = new ScaleTransform(1, 1);
                var grp = new TransformGroup();
                grp.Children.Add(sc);
                grp.Children.Add(tt);
                g.RenderTransform = grp;
                _tt[p] = tt;
                _ts[p] = sc;
                _horse[p] = g;

                Canvas.SetLeft(g, StartX - Hw / 2);
                Canvas.SetTop(g, LaneY[p] - Hh / 2);
                _canvas.Children.Add(g);
            }
        }

        // --- Déroulé ---

        private void StartTurn()
        {
            if (_win) return;
            SetGazeForPlayer(_current); // regard actif (enfant) / en pause (parent)
            Locked = false;
            _dieBtn.IsEnabled = true;
            _banner.Background = new SolidColorBrush(PlayerColor[_current]);
            string how = _current == 0 ? "Regarde le dé 🎲" : "Touche le dé ✋";
            _bannerText.Text = "À toi, " + PlayerName[_current] + " !\n" + how;
            PulseDie();
        }

        private void Roll()
        {
            if (Locked || _win || !_dieBtn.IsEnabled) return;
            Locked = true;
            _dieBtn.IsEnabled = false;

            _lastVal = 1 + GameKit.RandInt(6);
            _dice.RollTo(_lastVal, () =>
            {
                Speak(NumberWord(_lastVal) + " ! Au galop !");
                Schedule(250, () => Gallop(_current, _lastVal));
            });
        }

        private void Gallop(int p, int steps)
        {
            if (_win) return;
            if (steps <= 0) { EndTurn(); return; }

            int from = _pos[p];
            int to = Math.Min(TrackLen, from + 1);
            _pos[p] = to;
            bool finished = to >= TrackLen;

            AnimateStep(p, from, to, () =>
            {
                if (finished) { Win(p); return; }
                Gallop(p, steps - 1);
            });
        }

        private void EndTurn()
        {
            if (_win) return;
            Schedule(700, () => { _current = 1 - _current; StartTurn(); });
        }

        private void Win(int p)
        {
            if (_win) return;
            _win = true;
            Locked = true;
            ReleaseGaze();
            _dieBtn.IsEnabled = false;
            _banner.Background = new SolidColorBrush(PlayerColor[p]);
            _bannerText.Text = "🎉  " + PlayerName[p] + " a gagné ! 🎉";
            Speak("Et c'est " + PlayerName[p] + " qui gagne la course ! Bravo !");
            Celebrate();
            CheerHorse(p);
            ScheduleNext(5000);
        }

        // --- Animations ---

        private void AnimateStep(int p, int fromIdx, int toIdx, Action done)
        {
            var tt = _tt[p];
            double x0 = fromIdx * Seg, x1 = toIdx * Seg;

            var ax = new DoubleAnimation(x0, x1, TimeSpan.FromMilliseconds(230))
            { EasingFunction = new QuadraticEase { EasingMode = EasingMode.EaseInOut } };

            // Galop : petite bosse verticale à chaque foulée.
            var ay = new DoubleAnimationUsingKeyFrames { Duration = TimeSpan.FromMilliseconds(230) };
            ay.KeyFrames.Add(new SplineDoubleKeyFrame(-20, KeyTime.FromPercent(0.5), new KeySpline(0.2, 0.8, 0.3, 1)));
            ay.KeyFrames.Add(new SplineDoubleKeyFrame(0, KeyTime.FromPercent(1), new KeySpline(0.4, 0, 0.7, 1)));

            _horse[p].SetValue(Panel.ZIndexProperty, 50);
            ay.Completed += (s, e) => done?.Invoke();
            tt.BeginAnimation(TranslateTransform.XProperty, ax);
            tt.BeginAnimation(TranslateTransform.YProperty, ay);
        }

        private void CheerHorse(int p)
        {
            var a = new DoubleAnimation(1, 1.35, TimeSpan.FromMilliseconds(340))
            { AutoReverse = true, RepeatBehavior = new RepeatBehavior(5), EasingFunction = new SineEase() };
            _ts[p].BeginAnimation(ScaleTransform.ScaleXProperty, a);
            _ts[p].BeginAnimation(ScaleTransform.ScaleYProperty, a);
        }

        private void PulseDie()
        {
            var a = new DoubleAnimation(1, 1.08, TimeSpan.FromMilliseconds(620))
            { AutoReverse = true, RepeatBehavior = new RepeatBehavior(3), EasingFunction = new SineEase() };
            _dieScale.BeginAnimation(ScaleTransform.ScaleXProperty, a);
            _dieScale.BeginAnimation(ScaleTransform.ScaleYProperty, a);
        }

        private static Color Lighten(Color c) => Color.FromRgb(
            (byte)(c.R + (255 - c.R) * 0.4), (byte)(c.G + (255 - c.G) * 0.4), (byte)(c.B + (255 - c.B) * 0.4));

        private static string NumberWord(int n)
        {
            switch (n)
            {
                case 1: return "Un";
                case 2: return "Deux";
                case 3: return "Trois";
                case 4: return "Quatre";
                case 5: return "Cinq";
                case 6: return "Six";
                default: return n.ToString();
            }
        }
    }
}
