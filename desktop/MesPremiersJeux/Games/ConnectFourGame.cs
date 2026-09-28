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
    /// Puissance 4 : contre un proche (regard en pause à son tour, il joue au
    /// toucher) ou contre l'ordinateur — quatre niveaux, du très facile (hasard)
    /// au difficile (minimax alpha-bêta, calculé en arrière-plan). L'enfant joue
    /// les jetons ROUGES, au regard : il fixe la colonne, le jeton tombe.
    /// </summary>
    public sealed class ConnectFourGame : GameControl
    {
        private const double W = 1440, H = 730;
        private const int Cols = 7, Rows = 6;
        private const double Cell = 92;
        private const double Bx = 205, By = 140; // coin haut-gauche du plateau

        private enum Mode { Setup, TwoPlayers, Cpu }

        private static readonly Color ChildColor = Color.FromRgb(0xE8, 0x43, 0x3A); // rouge
        private static readonly Color OtherColor = Color.FromRgb(0xF2, 0xC4, 0x0F); // jaune
        private static readonly Color BoardBlue = Color.FromRgb(0x2E, 0x5C, 0xB8);
        private static readonly string[] LevelNames = { "Très facile", "Facile", "Moyen", "Difficile" };
        private static readonly string[] LevelIcons = { "🐣", "🙂", "😎", "🦊" };

        private Mode _mode = Mode.Setup;
        private int _level;
        private int[,] _g = new int[Cols, Rows]; // 0 vide, 1 enfant, 2 adversaire ; ligne 0 = bas
        private int[] _h = new int[Cols];        // hauteur de chaque colonne
        private Canvas _canvas;
        private Button[] _colBtns;
        private Border _banner;
        private TextBlock _bannerText;
        private bool _childTurn;
        private bool _childStarts = true;
        private bool _over;
        private bool _gazePaused;

        public ConnectFourGame(Action celebrate) : base(celebrate)
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

        // --- Écrans de choix (mode puis niveau). ---
        private void ShowModeSetup()
        {
            Locked = false;
            Question.Text = "🔴🟡 Puissance 4 — contre qui veux-tu jouer ?";
            _canvas = new Canvas { Width = W, Height = H };
            AddBigChoice("👥", "À deux", "l'autre joueur touche l'écran", 260, () =>
            { _mode = Mode.TwoPlayers; StartMatch(); });
            AddBigChoice("🤖", "L'ordinateur", "du très facile au difficile", 800, ShowLevelSetup);
            SetBody(_canvas);
            Schedule(400, () => Speak("Puissance 4 ! Tu joues contre quelqu'un, ou contre l'ordinateur ?"));
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
            Canvas.SetTop(btn, 190);
            _canvas.Children.Add(btn);
        }

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
                Canvas.SetTop(btn, 220);
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
            _g = new int[Cols, Rows];
            _h = new int[Cols];
            _childTurn = _childStarts;
            _childStarts = !_childStarts;

            _canvas = new Canvas { Width = W, Height = H };

            // Boutons de colonne (les cibles du regard), au-dessus du plateau.
            _colBtns = new Button[Cols];
            for (int c = 0; c < Cols; c++)
            {
                var btn = new Button
                {
                    Style = (Style)Application.Current.Resources["AnswerButton"],
                    Width = Cell - 6,
                    Height = 86,
                    Content = new TextBlock { Text = "⬇", FontSize = 44, HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center },
                };
                int col = c;
                btn.Click += (s, e) => ColumnClick(col);
                Canvas.SetLeft(btn, Bx + c * Cell + 3);
                Canvas.SetTop(btn, By - 100);
                _canvas.Children.Add(btn);
                _colBtns[c] = btn;
            }

            // Le plateau bleu percé de trous.
            var panel = new Border
            {
                Width = Cols * Cell + 24,
                Height = Rows * Cell + 24,
                CornerRadius = new CornerRadius(26),
                Background = new LinearGradientBrush(Color.FromRgb(0x3E, 0x71, 0xD6), BoardBlue, 90),
                BorderBrush = new SolidColorBrush(Color.FromRgb(0x1E, 0x3E, 0x82)),
                BorderThickness = new Thickness(5),
            };
            Canvas.SetLeft(panel, Bx - 12);
            Canvas.SetTop(panel, By - 12);
            _canvas.Children.Add(panel);
            for (int c = 0; c < Cols; c++)
                for (int r = 0; r < Rows; r++)
                {
                    var hole = new Ellipse
                    {
                        Width = Cell - 18,
                        Height = Cell - 18,
                        Fill = new SolidColorBrush(Color.FromRgb(0xF3, 0xEE, 0xFF)),
                        Stroke = new SolidColorBrush(Color.FromRgb(0x1E, 0x3E, 0x82)),
                        StrokeThickness = 3,
                        IsHitTestVisible = false,
                    };
                    Canvas.SetLeft(hole, CellX(c) - (Cell - 18) / 2);
                    Canvas.SetTop(hole, CellY(r) - (Cell - 18) / 2);
                    _canvas.Children.Add(hole);
                }

            // Bannière + légende, à droite.
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
            Canvas.SetLeft(_banner, 950);
            Canvas.SetTop(_banner, 150);
            _canvas.Children.Add(_banner);

            var legend = new TextBlock
            {
                Text = "🔴 toi   ·   🟡 " + (_mode == Mode.Cpu ? "l'ordinateur (" + LevelNames[_level] + ")" : "l'autre joueur"),
                FontSize = 23,
                Foreground = new SolidColorBrush(Color.FromRgb(0x6B, 0x5A, 0x8A)),
                Width = 430,
                TextAlignment = TextAlignment.Center,
            };
            Canvas.SetLeft(legend, 950);
            Canvas.SetTop(legend, 290);
            _canvas.Children.Add(legend);

            SetBody(_canvas);
            Question.Text = "🔴🟡 Puissance 4 : aligne 4 jetons !";
            BeginTurn();
        }

        private static double CellX(int c) => Bx + c * Cell + Cell / 2;
        private static double CellY(int r) => By + (Rows - 1 - r) * Cell + Cell / 2;

        private void BeginTurn()
        {
            if (_over) return;
            SetGazeForChild(_childTurn);
            if (_childTurn)
            {
                Locked = false;
                _banner.Background = new SolidColorBrush(ChildColor);
                _bannerText.Text = "À toi ! 🔴\nRegarde une flèche ⬇";
            }
            else if (_mode == Mode.Cpu)
            {
                Locked = true;
                _banner.Background = new SolidColorBrush(OtherColor);
                _bannerText.Text = "L'ordinateur réfléchit… 🤖";
                var snapshot = (int[,])_g.Clone();
                var level = _level;
                System.Threading.Tasks.Task.Run(() => CpuChoose(snapshot, level))
                    .ContinueWith(t => Dispatcher.Invoke(() =>
                    {
                        if (_over || _childTurn) return;
                        int col = t.IsFaulted ? FirstFree() : t.Result;
                        if (col < 0 || _h[col] >= Rows) col = FirstFree();
                        if (col >= 0) Drop(col, 2);
                    }));
            }
            else
            {
                Locked = false;
                _banner.Background = new SolidColorBrush(OtherColor);
                _bannerText.Text = "À l'autre joueur ! 🟡\nTouche une flèche ✋";
            }
        }

        private int FirstFree()
        {
            foreach (var c in ColOrder) if (_h[c] < Rows) return c;
            return -1;
        }

        private void ColumnClick(int col)
        {
            if (_over || Locked || _h[col] >= Rows) return;
            if (!_childTurn && _mode == Mode.Cpu) return;
            Drop(col, _childTurn ? 1 : 2);
        }

        private void Drop(int col, int who)
        {
            Locked = true;
            int row = _h[col];
            _g[col, row] = who;
            _h[col]++;

            var disc = new Ellipse
            {
                Width = Cell - 22,
                Height = Cell - 22,
                Fill = new RadialGradientBrush(
                    Lighten(who == 1 ? ChildColor : OtherColor),
                    who == 1 ? ChildColor : OtherColor)
                { GradientOrigin = new Point(0.35, 0.3), Center = new Point(0.35, 0.3) },
                Stroke = new SolidColorBrush(Color.FromRgb(0x1E, 0x3E, 0x82)),
                StrokeThickness = 3,
                IsHitTestVisible = false,
            };
            Canvas.SetLeft(disc, CellX(col) - (Cell - 22) / 2);
            Canvas.SetTop(disc, By - 110);
            _canvas.Children.Add(disc);

            var fall = new DoubleAnimation(By - 110, CellY(row) - (Cell - 22) / 2,
                TimeSpan.FromMilliseconds(160 + (Rows - row) * 60))
            { EasingFunction = new BounceEase { EasingMode = EasingMode.EaseOut, Bounces = 2, Bounciness = 5 } };
            fall.Completed += (s, e) => AfterDrop(col, row, who);
            disc.BeginAnimation(Canvas.TopProperty, fall);
        }

        private void AfterDrop(int col, int row, int who)
        {
            var winCells = WinCellsAt(_g, col, row);
            if (winCells != null) { End(who, winCells); return; }
            if (Enumerable.Range(0, Cols).All(c => _h[c] >= Rows)) { End(0, null); return; }
            _childTurn = !_childTurn;
            BeginTurn();
        }

        private void End(int winner, List<(int C, int R)> cells)
        {
            _over = true;
            Locked = true;
            ReleaseGaze();
            if (cells != null)
                foreach (var (c, r) in cells)
                {
                    var ring = new Ellipse
                    {
                        Width = Cell - 8,
                        Height = Cell - 8,
                        Stroke = new SolidColorBrush(Color.FromRgb(0xFF, 0xC1, 0x07)),
                        StrokeThickness = 7,
                        IsHitTestVisible = false,
                    };
                    Canvas.SetLeft(ring, CellX(c) - (Cell - 8) / 2);
                    Canvas.SetTop(ring, CellY(r) - (Cell - 8) / 2);
                    _canvas.Children.Add(ring);
                }

            if (winner == 1)
            {
                _banner.Background = new SolidColorBrush(ChildColor);
                _bannerText.Text = "🎉 Quatre alignés :\ntu as gagné ! 🎉";
                GameKit.Success();
                Celebrate();
                Speak("Quatre jetons alignés ! Tu as gagné ! Bravo !");
            }
            else if (winner == 2)
            {
                _banner.Background = new SolidColorBrush(OtherColor);
                _bannerText.Text = "🟡 a gagné !\nOn se revanche ?";
                Speak(_mode == Mode.Cpu ? "L'ordinateur a aligné quatre jetons. On rejoue !" : "Les jaunes ont gagné ! On rejoue !");
            }
            else
            {
                _bannerText.Text = "🤝 Égalité !\nLa grille est pleine !";
                Speak("La grille est pleine : égalité ! On rejoue !");
            }
            Schedule(4000, StartMatch);
        }

        // ==================================================================
        // L'ordinateur — du hasard au minimax alpha-bêta.
        // ==================================================================
        private static readonly int[] ColOrder = { 3, 2, 4, 1, 5, 0, 6 };
        private static readonly Random Rng = new Random();

        private static int CpuChoose(int[,] g, int level)
        {
            var h = Heights(g);
            var free = Enumerable.Range(0, Cols).Where(c => h[c] < Rows).ToList();
            if (free.Count == 0) return -1;

            switch (level)
            {
                case 0: // très facile : au hasard
                    return free[Rng.Next(free.Count)];

                case 1: // facile : gagne, sinon bloque, sinon hasard un peu centré
                {
                    var win = ImmediateWin(g, h, 2);
                    if (win >= 0) return win;
                    var block = ImmediateWin(g, h, 1);
                    if (block >= 0) return block;
                    return ColOrder.Where(free.Contains).Skip(Rng.Next(Math.Min(3, free.Count))).First();
                }

                case 2: // moyen : minimax peu profond
                    return Search(g, h, 4);

                default: // difficile : minimax profond
                    return Search(g, h, 7);
            }
        }

        private static int[] Heights(int[,] g)
        {
            var h = new int[Cols];
            for (int c = 0; c < Cols; c++)
            {
                int r = 0;
                while (r < Rows && g[c, r] != 0) r++;
                h[c] = r;
            }
            return h;
        }

        private static int ImmediateWin(int[,] g, int[] h, int who)
        {
            for (int c = 0; c < Cols; c++)
            {
                if (h[c] >= Rows) continue;
                g[c, h[c]] = who;
                bool w = WinCellsAt(g, c, h[c]) != null;
                g[c, h[c]] = 0;
                if (w) return c;
            }
            return -1;
        }

        private static int Search(int[,] g, int[] h, int depth)
        {
            int best = -1, bestScore = int.MinValue;
            foreach (var c in ColOrder)
            {
                if (h[c] >= Rows) continue;
                int r = h[c];
                g[c, r] = 2; h[c]++;
                int sc = WinCellsAt(g, c, r) != null
                    ? 1000000
                    : -Negamax(g, h, depth - 1, int.MinValue + 1, int.MaxValue - 1, 1);
                g[c, r] = 0; h[c]--;
                if (sc > bestScore) { bestScore = sc; best = c; }
            }
            return best;
        }

        // Negamax alpha-bêta : « who » est le joueur au trait (1 = enfant).
        private static int Negamax(int[,] g, int[] h, int depth, int alpha, int beta, int who)
        {
            bool full = true;
            for (int c = 0; c < Cols; c++) if (h[c] < Rows) { full = false; break; }
            if (full) return 0;
            if (depth <= 0) return who == 2 ? Eval(g) : -Eval(g);

            int best = int.MinValue + 1;
            foreach (var c in ColOrder)
            {
                if (h[c] >= Rows) continue;
                int r = h[c];
                g[c, r] = who; h[c]++;
                int sc = WinCellsAt(g, c, r) != null
                    ? 900000 + depth
                    : -Negamax(g, h, depth - 1, -beta, -alpha, 3 - who);
                g[c, r] = 0; h[c]--;
                if (sc > best) best = sc;
                if (best > alpha) alpha = best;
                if (alpha >= beta) break;
            }
            return best;
        }

        // Évaluation : fenêtres de 4 (l'ordinateur = positif), bonus colonne centrale.
        private static int Eval(int[,] g)
        {
            int score = 0;
            for (int c = 0; c < Cols; c++)
                for (int r = 0; r < Rows; r++)
                {
                    score += Window(g, c, r, 1, 0);
                    score += Window(g, c, r, 0, 1);
                    score += Window(g, c, r, 1, 1);
                    score += Window(g, c, r, 1, -1);
                }
            for (int r = 0; r < Rows; r++)
            {
                if (g[3, r] == 2) score += 4;
                else if (g[3, r] == 1) score -= 4;
            }
            return score;
        }

        private static int Window(int[,] g, int c, int r, int dc, int dr)
        {
            if (c + 3 * dc >= Cols || r + 3 * dr >= Rows || r + 3 * dr < 0) return 0;
            int cpu = 0, kid = 0;
            for (int k = 0; k < 4; k++)
            {
                int v = g[c + k * dc, r + k * dr];
                if (v == 2) cpu++;
                else if (v == 1) kid++;
            }
            if (cpu > 0 && kid > 0) return 0;
            if (cpu == 3) return 120;
            if (cpu == 2) return 12;
            if (cpu == 1) return 1;
            if (kid == 3) return -120;
            if (kid == 2) return -12;
            if (kid == 1) return -1;
            return 0;
        }

        // Les 4 jetons gagnants passant par (col,row), ou null.
        private static List<(int C, int R)> WinCellsAt(int[,] g, int col, int row)
        {
            int who = g[col, row];
            if (who == 0) return null;
            int[][] dirs = { new[] { 1, 0 }, new[] { 0, 1 }, new[] { 1, 1 }, new[] { 1, -1 } };
            foreach (var d in dirs)
            {
                var cells = new List<(int, int)> { (col, row) };
                for (int s = 1; s <= 3; s++)
                {
                    int c = col + d[0] * s, r = row + d[1] * s;
                    if (c < 0 || c >= Cols || r < 0 || r >= Rows || g[c, r] != who) break;
                    cells.Add((c, r));
                }
                for (int s = 1; s <= 3; s++)
                {
                    int c = col - d[0] * s, r = row - d[1] * s;
                    if (c < 0 || c >= Cols || r < 0 || r >= Rows || g[c, r] != who) break;
                    cells.Add((c, r));
                }
                if (cells.Count >= 4) return cells.Take(4).ToList();
            }
            return null;
        }

        private static Color Lighten(Color c) => Color.FromRgb(
            (byte)(c.R + (255 - c.R) * 0.42), (byte)(c.G + (255 - c.G) * 0.42), (byte)(c.B + (255 - c.B) * 0.42));
    }
}
