using System;
using System.Collections.Generic;
using System.Linq;
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
    /// Morpion (tic-tac-toe) : contre un proche (le regard se met en pause à son
    /// tour, il joue à la souris / au toucher) ou contre l'ordinateur avec quatre
    /// niveaux — du très facile (il joue au hasard) au difficile (imbattable,
    /// minimax). L'enfant joue toujours les ❌ rouges, au regard.
    /// </summary>
    public sealed class TicTacToeGame : GameControl
    {
        private const double W = 1440, H = 720;

        private enum Mode { Setup, TwoPlayers, Cpu }

        private static readonly Color ChildColor = Color.FromRgb(0xE8, 0x43, 0x3A);
        private static readonly Color OtherColor = Color.FromRgb(0x2E, 0x7F, 0xE8);
        private static readonly string[] LevelNames = { "Très facile", "Facile", "Moyen", "Difficile" };
        private static readonly string[] LevelIcons = { "🐣", "🙂", "😎", "🦊" };

        private Mode _mode = Mode.Setup;
        private int _level;
        private readonly int[] _board = new int[9]; // 0 vide, 1 enfant ❌, 2 adversaire ⭕
        private Button[] _cells;
        private Canvas _canvas;
        private Border _banner;
        private TextBlock _bannerText;
        private bool _childTurn;
        private bool _childStarts = true;
        private bool _over;
        private bool _gazePaused;

        public TicTacToeGame(Action celebrate) : base(celebrate)
        {
            Unloaded += (s, e) => ReleaseGaze();
        }

        private void SetGazeForChild(bool childPlays)
        {
            if (childPlays) ReleaseGaze();
            else if (_mode == Mode.TwoPlayers && !_gazePaused) { GazeGate.Push(); _gazePaused = true; }
        }

        private void ReleaseGaze()
        {
            if (_gazePaused) { GazeGate.Pop(); _gazePaused = false; }
        }

        protected override void NewRound()
        {
            ReleaseGaze();
            _mode = Mode.Setup;
            ShowModeSetup();
        }

        // --- Écran 1 : contre qui ? ---
        private void ShowModeSetup()
        {
            Locked = false;
            Question.Text = "❌⭕ Le morpion — contre qui veux-tu jouer ?";
            _canvas = new Canvas { Width = W, Height = H };

            AddBigChoice("👥", "À deux", "l'autre joueur touche l'écran", 260, () =>
            { _mode = Mode.TwoPlayers; StartMatch(); });
            AddBigChoice("🤖", "L'ordinateur", "du très facile au difficile", 800, ShowLevelSetup);

            SetBody(_canvas);
            Schedule(400, () => Speak("Le morpion ! Tu joues contre quelqu'un, ou contre l'ordinateur ?"));
        }

        private void AddBigChoice(string icon, string title, string sub, double x, Action pick)
        {
            var sp = new StackPanel { HorizontalAlignment = HorizontalAlignment.Center };
            sp.Children.Add(new TextBlock { Text = icon, FontSize = 96, HorizontalAlignment = HorizontalAlignment.Center });
            sp.Children.Add(new TextBlock
            {
                Text = title,
                FontSize = 34,
                FontWeight = FontWeights.Bold,
                Foreground = new SolidColorBrush(Color.FromRgb(0x3B, 0x2A, 0x5A)),
                HorizontalAlignment = HorizontalAlignment.Center,
            });
            sp.Children.Add(new TextBlock
            {
                Text = sub,
                FontSize = 20,
                Foreground = new SolidColorBrush(Color.FromRgb(0x6B, 0x5A, 0x8A)),
                HorizontalAlignment = HorizontalAlignment.Center,
            });
            var btn = new Button
            {
                Style = (Style)Application.Current.Resources["AnswerButton"],
                Width = 380,
                Height = 300,
                Content = sp,
            };
            btn.Click += (s, e) => pick();
            Canvas.SetLeft(btn, x);
            Canvas.SetTop(btn, 180);
            _canvas.Children.Add(btn);
        }

        // --- Écran 2 : niveau de l'ordinateur. ---
        private void ShowLevelSetup()
        {
            Question.Text = "🤖 Quel niveau pour l'ordinateur ?";
            _canvas = new Canvas { Width = W, Height = H };

            double size = 280, gap = 50;
            double x0 = (W - 4 * size - 3 * gap) / 2;
            for (int l = 0; l < 4; l++)
            {
                var sp = new StackPanel { HorizontalAlignment = HorizontalAlignment.Center };
                sp.Children.Add(new TextBlock { Text = LevelIcons[l], FontSize = 84, HorizontalAlignment = HorizontalAlignment.Center });
                sp.Children.Add(new TextBlock
                {
                    Text = LevelNames[l],
                    FontSize = 27,
                    FontWeight = FontWeights.Bold,
                    Foreground = new SolidColorBrush(Color.FromRgb(0x3B, 0x2A, 0x5A)),
                    HorizontalAlignment = HorizontalAlignment.Center,
                });
                var btn = new Button
                {
                    Style = (Style)Application.Current.Resources["AnswerButton"],
                    Width = size,
                    Height = 250,
                    Content = sp,
                };
                int lvl = l;
                btn.Click += (s, e) => { _level = lvl; _mode = Mode.Cpu; StartMatch(); };
                Canvas.SetLeft(btn, x0 + l * (size + gap));
                Canvas.SetTop(btn, 210);
                _canvas.Children.Add(btn);
            }
            SetBody(_canvas);
            Schedule(300, () => Speak("Choisis le niveau : très facile, facile, moyen, ou difficile !"));
        }

        // --- La partie. ---
        private void StartMatch()
        {
            _over = false;
            Locked = false;
            for (int i = 0; i < 9; i++) _board[i] = 0;
            _childTurn = _childStarts;
            _childStarts = !_childStarts; // on alterne qui commence

            _canvas = new Canvas { Width = W, Height = H };

            // La grille 3×3, au centre-gauche.
            double cell = 190, gap = 14;
            double gx = 250, gy = (H - 3 * cell - 2 * gap) / 2;
            _cells = new Button[9];
            for (int i = 0; i < 9; i++)
            {
                var btn = new Button
                {
                    Style = (Style)Application.Current.Resources["AnswerButton"],
                    Width = cell,
                    Height = cell,
                    FontSize = 110,
                    Content = "",
                };
                int idx = i;
                btn.Click += (s, e) => CellClick(idx);
                Canvas.SetLeft(btn, gx + (i % 3) * (cell + gap));
                Canvas.SetTop(btn, gy + (i / 3) * (cell + gap));
                _canvas.Children.Add(btn);
                _cells[i] = btn;
            }

            // Bannière de tour, à droite.
            _banner = new Border
            {
                Width = 430,
                CornerRadius = new CornerRadius(24),
                Padding = new Thickness(18, 16, 18, 16),
                Background = new SolidColorBrush(ChildColor),
            };
            _bannerText = new TextBlock
            {
                FontSize = 28,
                FontWeight = FontWeights.Bold,
                Foreground = Brushes.White,
                TextAlignment = TextAlignment.Center,
                TextWrapping = TextWrapping.Wrap,
            };
            _banner.Child = _bannerText;
            Canvas.SetLeft(_banner, 940);
            Canvas.SetTop(_banner, 120);
            _canvas.Children.Add(_banner);

            var legend = new TextBlock
            {
                Text = "❌ toi   ·   ⭕ " + (_mode == Mode.Cpu ? "l'ordinateur (" + LevelNames[_level] + ")" : "l'autre joueur"),
                FontSize = 23,
                Foreground = new SolidColorBrush(Color.FromRgb(0x6B, 0x5A, 0x8A)),
                Width = 430,
                TextAlignment = TextAlignment.Center,
            };
            Canvas.SetLeft(legend, 940);
            Canvas.SetTop(legend, 260);
            _canvas.Children.Add(legend);

            SetBody(_canvas);
            Question.Text = "❌⭕ Le morpion";
            BeginTurn();
        }

        private void BeginTurn()
        {
            if (_over) return;
            SetGazeForChild(_childTurn);
            if (_childTurn)
            {
                Locked = false;
                _banner.Background = new SolidColorBrush(ChildColor);
                _bannerText.Text = "À toi ! ❌\nRegarde une case";
            }
            else if (_mode == Mode.Cpu)
            {
                Locked = true;
                _banner.Background = new SolidColorBrush(OtherColor);
                _bannerText.Text = "L'ordinateur réfléchit… 🤖";
                Schedule(950, CpuMove);
            }
            else
            {
                Locked = false;
                _banner.Background = new SolidColorBrush(OtherColor);
                _bannerText.Text = "À l'autre joueur ! ⭕\nTouche une case ✋";
            }
        }

        private void CellClick(int i)
        {
            if (_over || Locked || _board[i] != 0) return;
            if (!_childTurn && _mode == Mode.Cpu) return;
            Place(i, _childTurn ? 1 : 2);
        }

        private void Place(int i, int who)
        {
            _board[i] = who;
            _cells[i].Content = new TextBlock
            {
                Text = who == 1 ? "❌" : "⭕",
                FontSize = 108,
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
                Foreground = new SolidColorBrush(who == 1 ? ChildColor : OtherColor),
            };
            Pop(_cells[i]);

            var line = WinLine(_board, who);
            if (line != null) { End(who, line); return; }
            if (_board.All(v => v != 0)) { End(0, null); return; }

            _childTurn = !_childTurn;
            BeginTurn();
        }

        private void End(int winner, int[] line)
        {
            _over = true;
            Locked = true;
            ReleaseGaze();
            if (line != null)
                foreach (var i in line)
                {
                    var b = new Border
                    {
                        Width = _cells[i].Width + 10,
                        Height = _cells[i].Height + 10,
                        CornerRadius = new CornerRadius(22),
                        BorderBrush = new SolidColorBrush(Color.FromRgb(0xFF, 0xC1, 0x07)),
                        BorderThickness = new Thickness(7),
                        IsHitTestVisible = false,
                    };
                    Canvas.SetLeft(b, Canvas.GetLeft(_cells[i]) - 5);
                    Canvas.SetTop(b, Canvas.GetTop(_cells[i]) - 5);
                    _canvas.Children.Add(b);
                }

            if (winner == 1)
            {
                _banner.Background = new SolidColorBrush(ChildColor);
                _bannerText.Text = "🎉 Tu as gagné ! 🎉";
                GameKit.Success();
                Celebrate();
                Speak("Trois croix alignées... Tu as gagné ! Bravo !");
            }
            else if (winner == 2)
            {
                _banner.Background = new SolidColorBrush(OtherColor);
                _bannerText.Text = "⭕ a gagné !\nOn se revanche ?";
                Speak(_mode == Mode.Cpu ? "L'ordinateur a gagné cette fois. On rejoue !" : "Les ronds ont gagné ! On rejoue !");
            }
            else
            {
                _bannerText.Text = "🤝 Égalité !\nBien joué à tous les deux !";
                Speak("Égalité ! Personne n'a perdu. On rejoue !");
            }
            Schedule(3600, StartMatch);
        }

        // --- L'ordinateur, du hasard complet au minimax imbattable. ---
        private void CpuMove()
        {
            if (_over) return;
            var empty = Enumerable.Range(0, 9).Where(i => _board[i] == 0).ToList();
            if (empty.Count == 0) return;
            int move;
            switch (_level)
            {
                case 0: // très facile : au hasard
                    move = GameKit.Rand(empty);
                    break;
                case 1: // facile : gagne s'il peut, sinon hasard
                    move = FindWinning(2) ?? GameKit.Rand(empty);
                    break;
                case 2: // moyen : gagne, sinon bloque, sinon centre/coin
                    move = FindWinning(2) ?? FindWinning(1)
                        ?? (_board[4] == 0 ? 4 : (int?)null)
                        ?? GameKit.Rand(new[] { 0, 2, 6, 8 }.Where(i => _board[i] == 0).DefaultIfEmpty(GameKit.Rand(empty)).ToList());
                    break;
                default: // difficile : minimax parfait
                    move = BestMove();
                    break;
            }
            Place(move, 2);
        }

        private int? FindWinning(int who)
        {
            for (int i = 0; i < 9; i++)
            {
                if (_board[i] != 0) continue;
                _board[i] = who;
                bool wins = WinLine(_board, who) != null;
                _board[i] = 0;
                if (wins) return i;
            }
            return null;
        }

        private int BestMove()
        {
            int best = -1, bestScore = int.MinValue;
            for (int i = 0; i < 9; i++)
            {
                if (_board[i] != 0) continue;
                _board[i] = 2;
                int sc = Minimax(false, 0);
                _board[i] = 0;
                if (sc > bestScore) { bestScore = sc; best = i; }
            }
            return best;
        }

        private int Minimax(bool cpuTurn, int depth)
        {
            if (WinLine(_board, 2) != null) return 10 - depth;
            if (WinLine(_board, 1) != null) return depth - 10;
            if (_board.All(v => v != 0)) return 0;
            int best = cpuTurn ? int.MinValue : int.MaxValue;
            for (int i = 0; i < 9; i++)
            {
                if (_board[i] != 0) continue;
                _board[i] = cpuTurn ? 2 : 1;
                int sc = Minimax(!cpuTurn, depth + 1);
                _board[i] = 0;
                best = cpuTurn ? Math.Max(best, sc) : Math.Min(best, sc);
            }
            return best;
        }

        private static readonly int[][] Lines =
        {
            new[] { 0, 1, 2 }, new[] { 3, 4, 5 }, new[] { 6, 7, 8 },
            new[] { 0, 3, 6 }, new[] { 1, 4, 7 }, new[] { 2, 5, 8 },
            new[] { 0, 4, 8 }, new[] { 2, 4, 6 },
        };

        private static int[] WinLine(int[] b, int who)
            => Lines.FirstOrDefault(l => b[l[0]] == who && b[l[1]] == who && b[l[2]] == who);

        private static void Pop(FrameworkElement el)
        {
            el.RenderTransformOrigin = new Point(0.5, 0.5);
            var sc = new ScaleTransform(1, 1);
            el.RenderTransform = sc;
            var a = new DoubleAnimation(0.55, 1, TimeSpan.FromMilliseconds(320))
            { EasingFunction = new BackEase { EasingMode = EasingMode.EaseOut, Amplitude = 0.7 } };
            sc.BeginAnimation(ScaleTransform.ScaleXProperty, a);
            sc.BeginAnimation(ScaleTransform.ScaleYProperty, a);
        }
    }
}
