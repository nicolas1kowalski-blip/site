using System;
using System.Collections.Generic;
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
    /// Le vrai jeu de l'oie : un plateau en spirale, deux pions (l'enfant et un
    /// parent), un grand dé animé qu'on lance au regard. Les cases spéciales — l'oie
    /// (on rejoue), le pont (on saute en avant), l'étoile (bonus) et le puits (on
    /// passe un tour) — donnent l'effet « waouh ». Premier au jardin de l'oie gagne.
    /// </summary>
    public sealed class GooseGame : GameControl
    {
        private const double W = 1440, H = 760;
        private const int Cols = 7, Rows = 5;              // 35 cases
        private const double Bx = 28, By = 46, Cs = 114;   // origine + taille de case
        private const double Tok = 60;                     // taille d'un pion

        private enum Kind { Normal, Goose, Bridge, Star, Well, Start, Finish }

        // Deux joueurs : couleur, nom, emoji de pion.
        private static readonly Color[] PlayerColor =
        {
            Color.FromRgb(0xFF, 0x6B, 0x3C), // orange — l'enfant
            Color.FromRgb(0x3B, 0x9B, 0xFF), // bleu — le parent
        };
        private static readonly string[] PlayerName = { "Le poussin", "Le renard" };
        private static readonly string[] PlayerEmoji = { "🐥", "🦊" };
        private static readonly Point[] PlayerNudge = { new Point(-20, -14), new Point(20, 14) };

        private readonly List<(int C, int R)> _path = new List<(int, int)>();
        private readonly Dictionary<int, int> _bridgeTo = new Dictionary<int, int>();
        private Kind[] _kind;

        private Canvas _canvas;
        private DiceView _dice;
        private Button _dieBtn;
        private Border _banner;
        private TextBlock _bannerText;

        private readonly TranslateTransform[] _tt = new TranslateTransform[2];
        private readonly ScaleTransform[] _ts = new ScaleTransform[2];
        private readonly Grid[] _token = new Grid[2];
        private ScaleTransform _dieScale;
        private readonly int[] _pos = new int[2];
        private readonly bool[] _skip = new bool[2];
        private int _current;
        private int _lastVal;
        private int _gooseChain;
        private bool _win;
        private bool _gazePaused; // le regard est-il en pause (tour du parent) ?

        private int N => Cols * Rows;

        public GooseGame(Action celebrate) : base(celebrate)
        {
            // Sécurité : si on quitte le jeu, on rend le regard à l'appli.
            Unloaded += (s, e) => ReleaseGaze();
        }

        // Tour de l'enfant (joueur 0) : regard actif. Tour du parent (joueur 1) :
        // regard EN PAUSE — le dé se lance alors à la souris / au toucher, pour que
        // le regard de l'enfant ne déclenche pas le dé à la place du parent.
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
            ReleaseGaze(); // repart d'un état de regard propre
            _win = false;
            Locked = false;
            _current = 0;
            _pos[0] = _pos[1] = 0;
            _skip[0] = _skip[1] = false;
            Question.Text = "🪿  Le jeu de l'oie";

            BuildPath();
            BuildKinds();

            _canvas = new Canvas { Width = W, Height = H };
            DrawBoard();
            DrawControls();
            DrawTokens();
            SetBody(_canvas);

            Schedule(500, () =>
            {
                Speak("Le jeu de l'oie ! " + PlayerName[0] + ", regarde le dé pour lancer !");
                StartTurn();
            });
        }

        // --- Construction du plateau ---

        private void BuildPath()
        {
            _path.Clear();
            int top = 0, bottom = Rows - 1, left = 0, right = Cols - 1;
            while (left <= right && top <= bottom)
            {
                for (int c = left; c <= right; c++) _path.Add((c, top));
                top++;
                for (int r = top; r <= bottom; r++) _path.Add((right, r));
                right--;
                if (top <= bottom) { for (int c = right; c >= left; c--) _path.Add((c, bottom)); bottom--; }
                if (left <= right) { for (int r = bottom; r >= top; r--) _path.Add((left, r)); left++; }
            }
        }

        private void BuildKinds()
        {
            _kind = new Kind[N];
            for (int i = 0; i < N; i++) _kind[i] = Kind.Normal;
            _kind[0] = Kind.Start;
            _kind[N - 1] = Kind.Finish;

            foreach (var i in new[] { 3, 8, 13, 17, 22, 26, 30 }) if (Ok(i)) _kind[i] = Kind.Goose;
            foreach (var i in new[] { 11, 20, 29 }) if (Ok(i)) _kind[i] = Kind.Star;
            if (Ok(15)) _kind[15] = Kind.Well;
            if (Ok(5)) { _kind[5] = Kind.Bridge; _bridgeTo[5] = 10; }
        }

        private bool Ok(int i) => i > 0 && i < N - 1 && _kind[i] == Kind.Normal;

        private Point Center(int idx)
        {
            var (c, r) = _path[idx];
            return new Point(Bx + c * Cs + Cs / 2, By + r * Cs + Cs / 2);
        }

        private void DrawBoard()
        {
            for (int i = 0; i < N; i++)
            {
                var (c, r) = _path[i];
                double x = Bx + c * Cs, y = By + r * Cs;

                var cell = new Border
                {
                    Width = Cs - 8,
                    Height = Cs - 8,
                    CornerRadius = new CornerRadius(16),
                    BorderThickness = new Thickness(3),
                    BorderBrush = new SolidColorBrush(Color.FromRgb(0x5B, 0x46, 0x8C)),
                    Background = CellFill(_kind[i], i),
                };
                Canvas.SetLeft(cell, x + 4);
                Canvas.SetTop(cell, y + 4);
                _canvas.Children.Add(cell);

                var stack = new Grid();
                string emoji = CellEmoji(_kind[i]);
                if (!string.IsNullOrEmpty(emoji))
                    stack.Children.Add(new TextBlock
                    {
                        Text = emoji,
                        FontSize = _kind[i] == Kind.Finish || _kind[i] == Kind.Start ? 34 : 44,
                        HorizontalAlignment = HorizontalAlignment.Center,
                        VerticalAlignment = VerticalAlignment.Center,
                    });
                // Numéro de case (petit, en haut à gauche).
                stack.Children.Add(new TextBlock
                {
                    Text = (i + 1).ToString(),
                    FontSize = 15,
                    FontWeight = FontWeights.Bold,
                    Foreground = new SolidColorBrush(Color.FromArgb(0xAA, 0x33, 0x22, 0x55)),
                    HorizontalAlignment = HorizontalAlignment.Left,
                    VerticalAlignment = VerticalAlignment.Top,
                    Margin = new Thickness(6, 4, 0, 0),
                });
                cell.Child = stack;
            }
        }

        private static Brush CellFill(Kind k, int i)
        {
            switch (k)
            {
                case Kind.Start: return new SolidColorBrush(Color.FromRgb(0xC8, 0xF7, 0xC5));
                case Kind.Finish: return new SolidColorBrush(Color.FromRgb(0xFF, 0xE7, 0x8A));
                case Kind.Goose: return new SolidColorBrush(Color.FromRgb(0xD8, 0xF3, 0xFF));
                case Kind.Bridge: return new SolidColorBrush(Color.FromRgb(0xFF, 0xDD, 0xC2));
                case Kind.Star: return new SolidColorBrush(Color.FromRgb(0xFF, 0xF3, 0xBF));
                case Kind.Well: return new SolidColorBrush(Color.FromRgb(0xE7, 0xDC, 0xFF));
                default:
                    return new SolidColorBrush((i % 2 == 0)
                        ? Color.FromRgb(0xFF, 0xFF, 0xFF) : Color.FromRgb(0xF3, 0xEC, 0xFF));
            }
        }

        private static string CellEmoji(Kind k)
        {
            switch (k)
            {
                case Kind.Start: return "🏁";
                case Kind.Finish: return "🏡";
                case Kind.Goose: return "🪿";
                case Kind.Bridge: return "🌉";
                case Kind.Star: return "⭐";
                case Kind.Well: return "🕳️";
                default: return "";
            }
        }

        // --- Panneau de droite : bannière de tour + grand dé ---

        private void DrawControls()
        {
            const double colX = 880;

            _banner = new Border
            {
                Width = 520,
                CornerRadius = new CornerRadius(26),
                Padding = new Thickness(20, 16, 20, 16),
                Background = new SolidColorBrush(PlayerColor[0]),
            };
            _bannerText = new TextBlock
            {
                Text = "",
                FontSize = 30,
                FontWeight = FontWeights.Bold,
                Foreground = Brushes.White,
                TextAlignment = TextAlignment.Center,
                TextWrapping = TextWrapping.Wrap,
                HorizontalAlignment = HorizontalAlignment.Center,
            };
            _banner.Child = _bannerText;
            Canvas.SetLeft(_banner, colX);
            Canvas.SetTop(_banner, 60);
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
            Canvas.SetLeft(_dieBtn, colX + 260 - 112);
            Canvas.SetTop(_dieBtn, 250);
            _canvas.Children.Add(_dieBtn);

            _canvas.Children.Add(Hint("🐥 l'enfant regarde le dé  ·  ✋ le parent le touche", colX, 500));

            // Légende des pions.
            for (int p = 0; p < 2; p++)
            {
                var row = new StackPanel { Orientation = Orientation.Horizontal };
                row.Children.Add(new Border
                {
                    Width = 44,
                    Height = 44,
                    CornerRadius = new CornerRadius(22),
                    Background = new SolidColorBrush(PlayerColor[p]),
                    Child = new TextBlock { Text = PlayerEmoji[p], FontSize = 26, HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center },
                });
                row.Children.Add(new TextBlock
                {
                    Text = "  " + PlayerName[p],
                    FontSize = 24,
                    FontWeight = FontWeights.SemiBold,
                    VerticalAlignment = VerticalAlignment.Center,
                    Foreground = new SolidColorBrush(Color.FromRgb(0x3B, 0x2A, 0x5A)),
                });
                Canvas.SetLeft(row, colX + 40);
                Canvas.SetTop(row, 580 + p * 60);
                _canvas.Children.Add(row);
            }
        }

        private static TextBlock Hint(string text, double x, double y)
        {
            var t = new TextBlock
            {
                Text = text,
                FontSize = 22,
                Foreground = new SolidColorBrush(Color.FromRgb(0x6B, 0x5A, 0x8A)),
                Width = 520,
                TextAlignment = TextAlignment.Center,
            };
            Canvas.SetLeft(t, x);
            Canvas.SetTop(t, y);
            return t;
        }

        private void DrawTokens()
        {
            var c0 = Center(0);
            for (int p = 0; p < 2; p++)
            {
                var ring = new Grid { Width = Tok, Height = Tok };
                ring.Children.Add(new Ellipse
                {
                    Fill = new RadialGradientBrush(Lighten(PlayerColor[p]), PlayerColor[p]),
                    Stroke = Brushes.White,
                    StrokeThickness = 4,
                });
                ring.Children.Add(new TextBlock
                {
                    Text = PlayerEmoji[p],
                    FontSize = 34,
                    HorizontalAlignment = HorizontalAlignment.Center,
                    VerticalAlignment = VerticalAlignment.Center,
                });
                ring.RenderTransformOrigin = new Point(0.5, 0.5);
                var tt = new TranslateTransform(0, 0);
                var sc = new ScaleTransform(1, 1);
                var grp = new TransformGroup();
                grp.Children.Add(sc);
                grp.Children.Add(tt);
                ring.RenderTransform = grp;
                _tt[p] = tt;
                _ts[p] = sc;
                _token[p] = ring;

                Canvas.SetLeft(ring, c0.X - Tok / 2 + PlayerNudge[p].X);
                Canvas.SetTop(ring, c0.Y - Tok / 2 + PlayerNudge[p].Y);
                _canvas.Children.Add(ring);
            }
        }

        // --- Déroulé du jeu ---

        private void StartTurn()
        {
            if (_win) return;
            SetGazeForPlayer(_current); // regard actif (enfant) / en pause (parent)

            if (_skip[_current])
            {
                _skip[_current] = false;
                UpdateBanner(PlayerName[_current] + " passe son tour…", _current);
                Speak(PlayerName[_current] + " passe son tour.");
                Schedule(1600, () => { _current = 1 - _current; StartTurn(); });
                return;
            }

            Locked = false;
            _dieBtn.IsEnabled = true;
            _banner.Background = new SolidColorBrush(PlayerColor[_current]);
            string how = _current == 0 ? "Regarde le dé 🎲" : "Touche le dé ✋";
            UpdateBanner("C'est à toi, " + PlayerName[_current] + " !\n" + how, _current);
            PulseDie();
        }

        private void UpdateBanner(string text, int player)
        {
            _bannerText.Text = text;
            _banner.Background = new SolidColorBrush(PlayerColor[player]);
        }

        private void Roll()
        {
            if (Locked || _win || !_dieBtn.IsEnabled) return;
            Locked = true;
            _dieBtn.IsEnabled = false;

            _lastVal = 1 + GameKit.RandInt(6);
            _dice.RollTo(_lastVal, () =>
            {
                Speak(NumberWord(_lastVal) + " !");
                _gooseChain = 0;
                Schedule(300, () => MoveSteps(_current, _lastVal, () => ResolveLanding(_current)));
            });
        }

        private void MoveSteps(int p, int steps, Action done)
        {
            if (_win) return;
            if (steps <= 0) { done(); return; }

            int from = _pos[p];
            int to = from + 1;
            bool reachedEnd = to >= N - 1;
            if (reachedEnd) to = N - 1;
            _pos[p] = to;

            AnimateMove(p, from, to, 250, () =>
            {
                if (reachedEnd) { Win(p); return; }
                MoveSteps(p, steps - 1, done);
            });
        }

        private void ResolveLanding(int p)
        {
            if (_win) return;
            int idx = _pos[p];
            switch (_kind[idx])
            {
                case Kind.Goose:
                    if (_gooseChain < 4)
                    {
                        _gooseChain++;
                        HighlightCell(idx);
                        Speak("Une oie ! Tu avances encore !");
                        Schedule(650, () => MoveSteps(p, _lastVal, () => ResolveLanding(p)));
                        return;
                    }
                    break;

                case Kind.Bridge:
                    int target = _bridgeTo.TryGetValue(idx, out var t) ? t : idx;
                    HighlightCell(idx);
                    Speak("Le pont ! Hop, tu sautes en avant !");
                    int from = _pos[p];
                    _pos[p] = target;
                    Schedule(500, () => AnimateMove(p, from, target, 620, () =>
                    {
                        if (target >= N - 1) Win(p); else ResolveLanding(p);
                    }));
                    return;

                case Kind.Star:
                    RewardStore.Add();
                    HighlightCell(idx);
                    Speak("Une étoile bonus ! Bravo !");
                    break;

                case Kind.Well:
                    _skip[p] = true;
                    HighlightCell(idx);
                    Speak("Oh, le puits ! Tu passes un tour.");
                    break;
            }
            EndTurn();
        }

        private void EndTurn()
        {
            if (_win) return;
            Schedule(900, () => { _current = 1 - _current; StartTurn(); });
        }

        private void Win(int p)
        {
            if (_win) return;
            _win = true;
            Locked = true;
            ReleaseGaze(); // fin de partie : le regard revient à l'appli
            _dieBtn.IsEnabled = false;
            UpdateBanner("🎉  " + PlayerName[p] + " a gagné ! 🎉", p);
            Speak("Bravo ! " + PlayerName[p] + " est arrivé au jardin de l'oie ! Il a gagné !");
            BounceToken(p);
            Celebrate();
            ScheduleNext(5200);
        }

        // --- Animations ---

        private Point Off(int idx)
        {
            var c = Center(idx);
            var c0 = Center(0);
            return new Point(c.X - c0.X, c.Y - c0.Y);
        }

        private void AnimateMove(int p, int fromIdx, int toIdx, int ms, Action done)
        {
            var tt = _tt[p];
            var o0 = Off(fromIdx);
            var o1 = Off(toIdx);

            var ax = new DoubleAnimation(o0.X, o1.X, TimeSpan.FromMilliseconds(ms))
            { EasingFunction = new QuadraticEase { EasingMode = EasingMode.EaseInOut } };

            // Saut : la case Y descend vers la cible mais avec une petite bosse (hop).
            var ay = new DoubleAnimationUsingKeyFrames { Duration = TimeSpan.FromMilliseconds(ms) };
            double mid = Math.Min(o0.Y, o1.Y) - 26;
            ay.KeyFrames.Add(new SplineDoubleKeyFrame(mid, KeyTime.FromPercent(0.5), new KeySpline(0.2, 0.8, 0.3, 1)));
            ay.KeyFrames.Add(new SplineDoubleKeyFrame(o1.Y, KeyTime.FromPercent(1), new KeySpline(0.4, 0, 0.7, 1)));

            _token[p].SetValue(Panel.ZIndexProperty, 50); // le pion qui bouge passe devant
            ay.Completed += (s, e) => done?.Invoke();
            tt.BeginAnimation(TranslateTransform.XProperty, ax);
            tt.BeginAnimation(TranslateTransform.YProperty, ay);
        }

        private void BounceToken(int p)
        {
            var a = new DoubleAnimation(1, 1.4, TimeSpan.FromMilliseconds(360))
            { AutoReverse = true, RepeatBehavior = new RepeatBehavior(4), EasingFunction = new SineEase() };
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

        private void HighlightCell(int idx)
        {
            var c = Center(idx);
            var halo = new Ellipse
            {
                Width = Cs, Height = Cs,
                Stroke = new SolidColorBrush(Color.FromRgb(0xFF, 0xD9, 0x3C)),
                StrokeThickness = 8,
                IsHitTestVisible = false,
            };
            Canvas.SetLeft(halo, c.X - Cs / 2);
            Canvas.SetTop(halo, c.Y - Cs / 2);
            halo.SetValue(Panel.ZIndexProperty, 40);
            _canvas.Children.Add(halo);
            var fade = new DoubleAnimation(1, 0, TimeSpan.FromMilliseconds(1100));
            fade.Completed += (s, e) => _canvas.Children.Remove(halo);
            halo.BeginAnimation(UIElement.OpacityProperty, fade);
            var grow = new DoubleAnimation(0.7, 1.15, TimeSpan.FromMilliseconds(1100));
            var sc = new ScaleTransform(0.7, 0.7);
            halo.RenderTransformOrigin = new Point(0.5, 0.5);
            halo.RenderTransform = sc;
            sc.BeginAnimation(ScaleTransform.ScaleXProperty, grow);
            sc.BeginAnimation(ScaleTransform.ScaleYProperty, grow);
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
