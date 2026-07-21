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
    /// Le vrai jeu de l'oie (règles traditionnelles, sans la mise) : plateau en
    /// spirale de 63 cases, DEUX dés, deux joueurs (l'enfant et un parent). On lance
    /// les dés au regard. Cases spéciales authentiques : le pont (6→12), l'auberge
    /// (19, passe un tour), le puits (31) et la prison (52, on attend d'être libéré),
    /// le labyrinthe (42, recule de 3), la mort (58, retour au départ), les oies
    /// (cases dont la somme des chiffres fait 5 ou 9 → on rejoue du même nombre).
    /// Ouvertures au premier lancer : 3+6 → 26, 4+5 → 53. Premier à 63 pile gagne.
    /// </summary>
    public sealed class GooseGame : GameControl
    {
        private const double W = 1440, H = 760;
        private const int Cols = 9, Rows = 7;             // 63 cases
        private const double Bx = 26, By = 30, Cs = 86;   // origine + taille de case
        private const double Tok = 48;                    // taille d'un pion

        private enum Kind { Normal, Goose, Pont, Auberge, Puits, Prison, Labyrinthe, Mort, Start, Finish }

        // Cases « oie » : sommes des chiffres = 5 ou 9 (numéros 1-based).
        private static readonly int[] GooseCases =
            { 5, 9, 14, 18, 23, 27, 32, 36, 41, 45, 50, 54, 59 };

        private static readonly Color[] PlayerColor =
        {
            Color.FromRgb(0xFF, 0x6B, 0x3C), // orange — l'enfant
            Color.FromRgb(0x3B, 0x9B, 0xFF), // bleu — le parent
        };
        private static readonly string[] PlayerName = { "Le poussin", "Le renard" };
        private static readonly string[] PlayerEmoji = { "🐥", "🦊" };
        private static readonly Point[] PlayerNudge = { new Point(-14, -9), new Point(14, 9) };

        private static readonly Color[] Rainbow =
        {
            Color.FromRgb(0xFF, 0x6B, 0x6B), Color.FromRgb(0xFF, 0x9F, 0x45),
            Color.FromRgb(0xFF, 0xD9, 0x3D), Color.FromRgb(0x6B, 0xCB, 0x77),
            Color.FromRgb(0x4D, 0x96, 0xFF), Color.FromRgb(0x9B, 0x72, 0xF2),
            Color.FromRgb(0xFF, 0x6F, 0xB5),
        };

        private readonly List<(int C, int R)> _path = new List<(int, int)>();
        private Kind[] _kind;

        private Canvas _canvas;
        private DiceView _dice1, _dice2;
        private Button _dieBtn;
        private Border _banner;
        private TextBlock _bannerText;

        private readonly TranslateTransform[] _tt = new TranslateTransform[2];
        private readonly ScaleTransform[] _ts = new ScaleTransform[2];
        private readonly Grid[] _token = new Grid[2];
        private ScaleTransform _dieScale;

        private readonly int[] _pos = new int[2];
        private readonly bool[] _skip = new bool[2];       // auberge : passe un tour
        private readonly bool[] _stuck = new bool[2];      // puits / prison
        private readonly int[] _stuckAt = { -1, -1 };
        private readonly bool[] _firstRoll = new bool[2];  // ouverture à deux dés
        private int _current, _lastD1, _lastD2, _lastTotal, _gchain;
        private bool _win, _gazePaused;

        private int N => Cols * Rows; // 63
        private int FinishIdx => N - 1;

        public GooseGame(Action celebrate) : base(celebrate)
        {
            Unloaded += (s, e) => ReleaseGaze();
        }

        // Regard actif pour l'enfant (0), en pause pour le parent (1) : au tour du
        // parent, les dés se lancent à la souris / au toucher.
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
            for (int p = 0; p < 2; p++)
            {
                _pos[p] = 0;
                _skip[p] = false;
                _stuck[p] = false;
                _stuckAt[p] = -1;
                _firstRoll[p] = true;
            }
            Question.Text = "🪿  Le jeu de l'oie";

            BuildPath();
            BuildKinds();

            _canvas = new Canvas { Width = W, Height = H };
            DrawBackground();
            DrawBoard();
            DrawControls();
            DrawTokens();
            SetBody(_canvas);

            Schedule(500, () =>
            {
                Speak("Le jeu de l'oie ! " + PlayerName[0] + ", regarde les dés pour lancer !");
                StartTurn();
            });
        }

        // --- Plateau ---

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
            foreach (var caseNo in GooseCases)
            {
                int idx = caseNo - 1;
                if (idx > 0 && idx < N - 1) _kind[idx] = Kind.Goose;
            }
            _kind[5] = Kind.Pont;         // case 6
            _kind[18] = Kind.Auberge;     // case 19
            _kind[30] = Kind.Puits;       // case 31
            _kind[41] = Kind.Labyrinthe;  // case 42
            _kind[51] = Kind.Prison;      // case 52
            _kind[57] = Kind.Mort;        // case 58
            _kind[0] = Kind.Start;
            _kind[N - 1] = Kind.Finish;
        }

        private Point Center(int idx)
        {
            var (c, r) = _path[idx];
            return new Point(Bx + c * Cs + Cs / 2, By + r * Cs + Cs / 2);
        }

        private void DrawBackground()
        {
            var lg = new LinearGradientBrush { StartPoint = new Point(0, 0), EndPoint = new Point(0, 1) };
            lg.GradientStops.Add(new GradientStop(Color.FromRgb(0xBF, 0xE6, 0xFF), 0.0));
            lg.GradientStops.Add(new GradientStop(Color.FromRgb(0xDD, 0xF3, 0xD6), 0.55));
            lg.GradientStops.Add(new GradientStop(Color.FromRgb(0xC0, 0xEA, 0x9B), 1.0));
            _canvas.Children.Add(new Rectangle { Width = W, Height = H, Fill = lg });

            var rng = new Random(7);
            string[] flowers = { "🌷", "🌼", "🌸", "🌻", "🍄", "🌿" };
            double baseY = By + Rows * Cs + 18;
            for (double x = Bx + 8; x < Bx + Cols * Cs - 40; x += 90)
                _canvas.Children.Add(Emoji(flowers[rng.Next(flowers.Length)], x, baseY + rng.Next(14), 36));
            _canvas.Children.Add(Emoji("🌳", Bx - 10, baseY - 26, 66));
            _canvas.Children.Add(Emoji("🌳", Bx + Cols * Cs - 58, baseY - 26, 66));
            _canvas.Children.Add(Emoji("☁️", Bx + 150, -4, 48));
            _canvas.Children.Add(Emoji("☁️", Bx + 470, -10, 54));
        }

        private static TextBlock Emoji(string s, double x, double y, double size)
        {
            var t = new TextBlock { Text = s, FontSize = size, IsHitTestVisible = false, Opacity = 0.95 };
            Canvas.SetLeft(t, x);
            Canvas.SetTop(t, y);
            return t;
        }

        private PointCollection PathPoints()
        {
            var pc = new PointCollection();
            for (int i = 0; i < N; i++) pc.Add(Center(i));
            return pc;
        }

        private void DrawBoard()
        {
            _canvas.Children.Add(new Polyline
            {
                Points = PathPoints(),
                Stroke = new SolidColorBrush(Color.FromRgb(0xB9, 0x7A, 0x46)),
                StrokeThickness = 50,
                StrokeLineJoin = PenLineJoin.Round,
                StrokeStartLineCap = PenLineCap.Round,
                StrokeEndLineCap = PenLineCap.Round,
            });
            _canvas.Children.Add(new Polyline
            {
                Points = PathPoints(),
                Stroke = new SolidColorBrush(Color.FromRgb(0xF6, 0xE6, 0xC3)),
                StrokeThickness = 34,
                StrokeLineJoin = PenLineJoin.Round,
                StrokeStartLineCap = PenLineCap.Round,
                StrokeEndLineCap = PenLineCap.Round,
            });
            _canvas.Children.Add(new Polyline
            {
                Points = PathPoints(),
                Stroke = new SolidColorBrush(Color.FromArgb(0x99, 0xC9, 0x8A, 0x54)),
                StrokeThickness = 3,
                StrokeDashArray = new DoubleCollection { 2, 3.5 },
                StrokeLineJoin = PenLineJoin.Round,
            });

            for (int i = 0; i < N; i++) DrawTile(i);
        }

        private void DrawTile(int i)
        {
            var k = _kind[i];
            var c = Center(i);
            bool big = k == Kind.Finish || k == Kind.Start;
            double d = big ? 88 : (k == Kind.Normal ? 66 : 78);
            Color col = TileColor(k, i);

            if (k != Kind.Normal)
            {
                double halo = d + (big ? 30 : 18);
                var glow = new Ellipse
                {
                    Width = halo,
                    Height = halo,
                    Fill = new RadialGradientBrush(
                        Color.FromArgb((byte)(big ? 0x88 : 0x55), col.R, col.G, col.B),
                        Color.FromArgb(0x00, col.R, col.G, col.B)),
                    IsHitTestVisible = false,
                };
                Canvas.SetLeft(glow, c.X - halo / 2);
                Canvas.SetTop(glow, c.Y - halo / 2);
                _canvas.Children.Add(glow);
            }

            var shadow = new Ellipse
            {
                Width = d,
                Height = d,
                Fill = new SolidColorBrush(Color.FromArgb(0x30, 0x2A, 0x1A, 0x00)),
                IsHitTestVisible = false,
            };
            Canvas.SetLeft(shadow, c.X - d / 2);
            Canvas.SetTop(shadow, c.Y - d / 2 + 4);
            _canvas.Children.Add(shadow);

            var tileFill = new RadialGradientBrush(Lighten(col), col)
            {
                GradientOrigin = new Point(0.35, 0.30),
                Center = new Point(0.35, 0.30),
                RadiusX = 0.85,
                RadiusY = 0.85,
            };
            var g = new Grid { Width = d, Height = d };
            g.Children.Add(new Ellipse
            {
                Fill = tileFill,
                Stroke = Brushes.White,
                StrokeThickness = big ? 5 : 4,
            });

            string emoji = CellEmoji(k);
            if (!string.IsNullOrEmpty(emoji))
                g.Children.Add(new TextBlock
                {
                    Text = emoji,
                    FontSize = big ? 30 : 32,
                    HorizontalAlignment = HorizontalAlignment.Center,
                    VerticalAlignment = VerticalAlignment.Center,
                });
            else
                g.Children.Add(new TextBlock
                {
                    Text = (i + 1).ToString(),
                    FontSize = 17,
                    FontWeight = FontWeights.Bold,
                    Foreground = Brushes.White,
                    HorizontalAlignment = HorizontalAlignment.Center,
                    VerticalAlignment = VerticalAlignment.Center,
                });

            Canvas.SetLeft(g, c.X - d / 2);
            Canvas.SetTop(g, c.Y - d / 2);
            _canvas.Children.Add(g);
        }

        private static Color TileColor(Kind k, int i)
        {
            switch (k)
            {
                case Kind.Start: return Color.FromRgb(0x36, 0xD3, 0x99);
                case Kind.Finish: return Color.FromRgb(0xFF, 0xC0, 0x2E);
                case Kind.Goose: return Color.FromRgb(0x2E, 0xC4, 0xB6);
                case Kind.Pont: return Color.FromRgb(0xFF, 0x8A, 0x3D);
                case Kind.Auberge: return Color.FromRgb(0xE0, 0xA9, 0x6D);
                case Kind.Puits: return Color.FromRgb(0x8E, 0x6B, 0xE6);
                case Kind.Prison: return Color.FromRgb(0x88, 0x92, 0xA6);
                case Kind.Labyrinthe: return Color.FromRgb(0xFF, 0x5F, 0xA2);
                case Kind.Mort: return Color.FromRgb(0x4A, 0x4A, 0x5A);
                default: return Rainbow[i % Rainbow.Length];
            }
        }

        private static string CellEmoji(Kind k)
        {
            switch (k)
            {
                case Kind.Start: return "🏁";
                case Kind.Finish: return "🏡";
                case Kind.Goose: return "🪿";
                case Kind.Pont: return "🌉";
                case Kind.Auberge: return "🛏️";
                case Kind.Puits: return "🕳️";
                case Kind.Prison: return "🔒";
                case Kind.Labyrinthe: return "🌀";
                case Kind.Mort: return "💀";
                default: return "";
            }
        }

        // --- Panneau de droite : bannière + deux dés ---

        private void DrawControls()
        {
            const double colX = 872;

            var panel = new Border
            {
                Width = 560,
                Height = 620,
                CornerRadius = new CornerRadius(34),
                Background = new SolidColorBrush(Color.FromArgb(0xCC, 0xFF, 0xFF, 0xFF)),
                BorderBrush = new SolidColorBrush(Color.FromArgb(0xFF, 0xE6, 0xD8, 0xFF)),
                BorderThickness = new Thickness(3),
            };
            Canvas.SetLeft(panel, 852);
            Canvas.SetTop(panel, 40);
            _canvas.Children.Add(panel);

            _banner = new Border
            {
                Width = 520,
                CornerRadius = new CornerRadius(26),
                Padding = new Thickness(20, 16, 20, 16),
                Background = new SolidColorBrush(PlayerColor[0]),
            };
            _bannerText = new TextBlock
            {
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

            _dice1 = new DiceView();
            _dice2 = new DiceView();
            _dice1.Root.Margin = new Thickness(0, 0, 10, 0);
            _dice2.Root.Margin = new Thickness(10, 0, 0, 0);
            var dp = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
            };
            dp.Children.Add(_dice1.Root);
            dp.Children.Add(_dice2.Root);

            _dieBtn = new Button
            {
                Style = (Style)Application.Current.Resources["BalloonButton"],
                Width = 372,
                Height = 200,
                Content = dp,
            };
            _dieBtn.Click += (s, e) => Roll();
            _dieBtn.RenderTransformOrigin = new Point(0.5, 0.5);
            _dieScale = new ScaleTransform(1, 1);
            _dieBtn.RenderTransform = _dieScale;
            Canvas.SetLeft(_dieBtn, colX + 260 - 186);
            Canvas.SetTop(_dieBtn, 250);
            _canvas.Children.Add(_dieBtn);

            var hint = new TextBlock
            {
                Text = "🐥 l'enfant regarde les dés  ·  ✋ le parent les touche",
                FontSize = 20,
                Foreground = new SolidColorBrush(Color.FromRgb(0x6B, 0x5A, 0x8A)),
                Width = 520,
                TextAlignment = TextAlignment.Center,
            };
            Canvas.SetLeft(hint, colX);
            Canvas.SetTop(hint, 484);
            _canvas.Children.Add(hint);

            for (int p = 0; p < 2; p++)
            {
                var row = new StackPanel { Orientation = Orientation.Horizontal };
                row.Children.Add(new Border
                {
                    Width = 42,
                    Height = 42,
                    CornerRadius = new CornerRadius(21),
                    Background = new SolidColorBrush(PlayerColor[p]),
                    Child = new TextBlock { Text = PlayerEmoji[p], FontSize = 24, HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center },
                });
                row.Children.Add(new TextBlock
                {
                    Text = "  " + PlayerName[p],
                    FontSize = 23,
                    FontWeight = FontWeights.SemiBold,
                    VerticalAlignment = VerticalAlignment.Center,
                    Foreground = new SolidColorBrush(Color.FromRgb(0x3B, 0x2A, 0x5A)),
                });
                Canvas.SetLeft(row, colX + 46);
                Canvas.SetTop(row, 540 + p * 52);
                _canvas.Children.Add(row);
            }
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
                    FontSize = 28,
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
            SetGazeForPlayer(_current);
            int other = 1 - _current;

            // Coincé au puits / en prison : on attend d'être libéré.
            if (_stuck[_current])
            {
                if (_stuck[other]) // les deux coincés : on libère d'office pour ne pas bloquer
                {
                    _stuck[_current] = false;
                    _stuckAt[_current] = -1;
                    Speak(PlayerName[_current] + " est libéré !");
                }
                else
                {
                    UpdateBanner(PlayerName[_current] + " est coincé…\nil attend d'être libéré", _current);
                    Speak(PlayerName[_current] + " est coincé, il attend d'être libéré.");
                    Schedule(1700, () => { _current = 1 - _current; StartTurn(); });
                    return;
                }
            }

            // Auberge : passe un tour.
            if (_skip[_current])
            {
                _skip[_current] = false;
                UpdateBanner(PlayerName[_current] + " dort à l'auberge…\nil passe un tour", _current);
                Speak(PlayerName[_current] + " passe son tour.");
                Schedule(1700, () => { _current = 1 - _current; StartTurn(); });
                return;
            }

            Locked = false;
            _dieBtn.IsEnabled = true;
            string how = _current == 0 ? "Regarde les dés 🎲" : "Touche les dés ✋";
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

            _lastD1 = 1 + GameKit.RandInt(6);
            _lastD2 = 1 + GameKit.RandInt(6);
            _lastTotal = _lastD1 + _lastD2;
            _gchain = 0;

            RollBoth(_lastD1, _lastD2, () =>
            {
                Speak(_lastD1 + " et " + _lastD2 + ", ça fait " + _lastTotal + " !");
                Schedule(350, AfterRoll);
            });
        }

        private void RollBoth(int v1, int v2, Action done)
        {
            int c = 0;
            Action f = () => { if (++c == 2) done(); };
            _dice1.RollTo(v1, f);
            _dice2.RollTo(v2, f);
        }

        private void AfterRoll()
        {
            int p = _current;

            // Ouverture au tout premier lancer : 3+6 → 26, 4+5 → 53.
            if (_firstRoll[p])
            {
                _firstRoll[p] = false;
                if ((_lastD1 == 3 && _lastD2 == 6) || (_lastD1 == 6 && _lastD2 == 3))
                { Teleport(p, 25, "Trois et six ! Tu files à la case 26 !"); return; }
                if ((_lastD1 == 4 && _lastD2 == 5) || (_lastD1 == 5 && _lastD2 == 4))
                { Teleport(p, 52, "Quatre et cinq ! Tu files à la case 53 !"); return; }
            }

            MoveBy(p, _lastTotal, () => ResolveLanding(p));
        }

        // Avance de « total » cases, avec REBOND sur 63 (il faut arriver pile).
        private void MoveBy(int p, int total, Action done)
        {
            var seq = new List<int>();
            int pos = _pos[p], dir = 1, rem = total;
            while (rem > 0)
            {
                if (pos == FinishIdx) dir = -1; // arrivé au bout : on rebondit
                pos += dir;
                if (pos < 0) { pos = 0; dir = 1; }
                seq.Add(pos);
                rem--;
            }
            HopThrough(p, seq, 0, () =>
            {
                if (_pos[p] == FinishIdx) { Win(p); return; }
                done();
            });
        }

        private void HopThrough(int p, List<int> seq, int i, Action done)
        {
            if (_win) return;
            if (i >= seq.Count) { done(); return; }
            int from = _pos[p];
            int to = seq[i];
            _pos[p] = to;
            AnimateMove(p, from, to, 230, () => HopThrough(p, seq, i + 1, done));
        }

        private void ResolveLanding(int p)
        {
            if (_win) return;
            int idx = _pos[p];
            var k = _kind[idx];

            if (k == Kind.Goose)
            {
                if (_gchain < 8)
                {
                    _gchain++;
                    HighlightCell(idx);
                    Speak("Une oie ! Tu avances encore de " + _lastTotal + " !");
                    Schedule(650, () => MoveBy(p, _lastTotal, () => ResolveLanding(p)));
                    return;
                }
                EndTurn();
                return;
            }

            switch (k)
            {
                case Kind.Pont:
                    HighlightCell(idx);
                    Speak("Le pont ! Tu sautes à la case 12 !");
                    Teleport(p, 11, null);
                    return;

                case Kind.Auberge:
                    _skip[p] = true;
                    HighlightCell(idx);
                    Speak("L'auberge ! Tu dors ici et tu passes un tour.");
                    break;

                case Kind.Labyrinthe:
                    HighlightCell(idx);
                    Speak("Le labyrinthe ! Tu recules de trois cases.");
                    Teleport(p, Math.Max(0, idx - 3), null);
                    return;

                case Kind.Mort:
                    HighlightCell(idx);
                    Speak("Oh non, la tête de mort ! Tu recommences depuis le départ.");
                    Teleport(p, 0, null);
                    return;

                case Kind.Puits:
                    TrapPlayer(p, idx, "le puits");
                    return;

                case Kind.Prison:
                    TrapPlayer(p, idx, "la prison");
                    return;
            }
            EndTurn();
        }

        // Puits / prison : on reste coincé jusqu'à ce que l'autre joueur arrive sur
        // la même case (il prend alors notre place et nous libère).
        private void TrapPlayer(int p, int idx, string name)
        {
            int other = 1 - p;
            HighlightCell(idx);
            if (_stuck[other] && _stuckAt[other] == idx)
            {
                _stuck[other] = false;
                _stuckAt[other] = -1;
                _stuck[p] = true;
                _stuckAt[p] = idx;
                Speak("Tu libères " + PlayerName[other] + " ! Mais tu prends sa place à " + name + ".");
            }
            else
            {
                _stuck[p] = true;
                _stuckAt[p] = idx;
                Speak("Aïe, " + name + " ! Tu es coincé, il faudra qu'on te libère.");
            }
            EndTurn();
        }

        // Déplacement direct (pont, labyrinthe, mort, ouvertures) : pas de nouvelle
        // case spéciale déclenchée à l'arrivée (les destinations sont neutres).
        private void Teleport(int p, int toIdx, string speak)
        {
            if (speak != null) Speak(speak);
            int from = _pos[p];
            _pos[p] = toIdx;
            Schedule(400, () => AnimateMove(p, from, toIdx, 640, () =>
            {
                if (_pos[p] == FinishIdx) Win(p); else EndTurn();
            }));
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
            ReleaseGaze();
            _dieBtn.IsEnabled = false;
            UpdateBanner("🎉  " + PlayerName[p] + " a gagné ! 🎉", p);
            Speak("Bravo ! " + PlayerName[p] + " est arrivé à la case 63 ! Il a gagné !");
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

            var ay = new DoubleAnimationUsingKeyFrames { Duration = TimeSpan.FromMilliseconds(ms) };
            double mid = Math.Min(o0.Y, o1.Y) - 24;
            ay.KeyFrames.Add(new SplineDoubleKeyFrame(mid, KeyTime.FromPercent(0.5), new KeySpline(0.2, 0.8, 0.3, 1)));
            ay.KeyFrames.Add(new SplineDoubleKeyFrame(o1.Y, KeyTime.FromPercent(1), new KeySpline(0.4, 0, 0.7, 1)));

            _token[p].SetValue(Panel.ZIndexProperty, 50);
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
            var a = new DoubleAnimation(1, 1.07, TimeSpan.FromMilliseconds(620))
            { AutoReverse = true, RepeatBehavior = new RepeatBehavior(3), EasingFunction = new SineEase() };
            _dieScale.BeginAnimation(ScaleTransform.ScaleXProperty, a);
            _dieScale.BeginAnimation(ScaleTransform.ScaleYProperty, a);
        }

        private void HighlightCell(int idx)
        {
            var c = Center(idx);
            var halo = new Ellipse
            {
                Width = Cs,
                Height = Cs,
                Stroke = new SolidColorBrush(Color.FromRgb(0xFF, 0xD9, 0x3C)),
                StrokeThickness = 7,
                IsHitTestVisible = false,
            };
            Canvas.SetLeft(halo, c.X - Cs / 2);
            Canvas.SetTop(halo, c.Y - Cs / 2);
            halo.SetValue(Panel.ZIndexProperty, 40);
            _canvas.Children.Add(halo);
            var fade = new DoubleAnimation(1, 0, TimeSpan.FromMilliseconds(1100));
            fade.Completed += (s, e) => _canvas.Children.Remove(halo);
            halo.BeginAnimation(UIElement.OpacityProperty, fade);
            halo.RenderTransformOrigin = new Point(0.5, 0.5);
            var sc = new ScaleTransform(0.7, 0.7);
            halo.RenderTransform = sc;
            var grow = new DoubleAnimation(0.7, 1.15, TimeSpan.FromMilliseconds(1100));
            sc.BeginAnimation(ScaleTransform.ScaleXProperty, grow);
            sc.BeginAnimation(ScaleTransform.ScaleYProperty, grow);
        }

        private static Color Lighten(Color c) => Color.FromRgb(
            (byte)(c.R + (255 - c.R) * 0.4), (byte)(c.G + (255 - c.G) * 0.4), (byte)(c.B + (255 - c.B) * 0.4));
    }
}
