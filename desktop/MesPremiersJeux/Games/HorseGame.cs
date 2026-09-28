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
    /// Le vrai jeu des PETITS CHEVAUX (jeu de dada), règles classiques :
    /// - 2 à 4 joueurs, 4 chevaux chacun (ou 2 pour une partie rapide) ;
    /// - il faut un 6 pour sortir un cheval de l'écurie, et tout 6 fait rejouer ;
    /// - on fait le tour du plateau (56 cases) ; tomber sur un cheval adverse le
    ///   renvoie à son écurie ; on ne peut pas poser deux de ses chevaux sur la
    ///   même case ;
    /// - il faut tomber PILE sur sa dernière case (sinon on avance puis on recule
    ///   du surplus), puis monter l'escalier marche par marche avec le chiffre
    ///   EXACT : 1, puis 2, puis 3, 4, 5 et 6 — en haut, le cheval est arrivé ;
    /// - le premier joueur dont tous les chevaux sont arrivés gagne.
    /// Le joueur 1 (Rouge) est l'enfant, au regard ; chaque autre joueur peut
    /// être un humain au toucher OU un ordinateur (niveau réglable : très
    /// facile, facile, malin) — l'enfant peut donc jouer même toute seule.
    /// </summary>
    public sealed class HorseGame : GameControl
    {
        private const double W = 1440, H = 760;
        private const int Track = 56;                  // cases de la piste
        private const double Cx = 470, Cy = 390;       // centre du plateau
        private const double R = 310;                  // demi-côté du plateau CARRÉ
        private const double CellD = 42;               // diamètre d'une case
        private const double TokD = 42;                // diamètre d'un cheval

        // Ajoute un élément de décor (emoji) sur le canevas.
        private static TextBlock Deco(string s, double x, double y, double size)
        {
            var t = new TextBlock { Text = s, FontSize = size, IsHitTestVisible = false, Opacity = 0.95 };
            Canvas.SetLeft(t, x);
            Canvas.SetTop(t, y);
            return t;
        }

        private static readonly int[] StartIdx = { 7, 21, 35, 49 }; // milieux des côtés
        private static readonly Color[] PColor =
        {
            Color.FromRgb(0xE8, 0x43, 0x3A), // Rouge — l'enfant
            Color.FromRgb(0x2E, 0x7F, 0xE8), // Bleu
            Color.FromRgb(0x2F, 0xA3, 0x4D), // Vert
            Color.FromRgb(0xE8, 0xB0, 0x0F), // Jaune
        };
        private static readonly string[] PName = { "Rouge", "Bleu", "Vert", "Jaune" };
        // Écuries : les quatre coins INTÉRIEURS du plateau carré (comme sur le
        // vrai plateau de dada). P0 haut → coin NO, P1 droite → NE, P2 bas → SE,
        // P3 gauche → SO.
        private static readonly Point[] StablePos =
        {
            new Point(194, 108), new Point(598, 108), new Point(598, 544), new Point(194, 544),
        };

        private int _nPlayers = 2;
        private int _nHorses = 4;
        private readonly bool[] _isBot = new bool[4]; // joueurs automatiques 🤖
        private int _botLevel;                        // 0 très facile · 1 facile · 2 malin
        private readonly int[,] _pos = new int[4, 4]; // -1 écurie · 0..55 piste · 100+k marche k · 106 arrivé
        private int _current;
        private int _roll;
        private bool _over;
        private bool _gazePaused;

        private Canvas _canvas;
        private DiceView _dice;
        private Button _dieBtn;
        private ScaleTransform _dieScale;
        private Border _banner;
        private TextBlock _bannerText;
        private readonly Grid[,] _tok = new Grid[4, 4];
        private readonly Point[,] _tokAt = new Point[4, 4];
        private readonly TextBlock[] _homeTexts = new TextBlock[4];
        private readonly List<Button> _choiceBtns = new List<Button>();

        public HorseGame(Action celebrate) : base(celebrate)
        {
            Unloaded += (s, e) => ReleaseGaze();
        }

        private void SetGazeForPlayer(int p)
        {
            // Regard actif pour l'enfant ET pendant les tours des ordinateurs
            // (rien n'est cliquable, et l'enfant garde son point de regard).
            if (p == 0 || _isBot[p]) ReleaseGaze();
            else if (!_gazePaused) { GazeGate.Push(); _gazePaused = true; }
        }

        private void ReleaseGaze()
        {
            if (_gazePaused) { GazeGate.Pop(); _gazePaused = false; }
        }

        protected override void NewRound()
        {
            ReleaseGaze();
            _over = false;
            Locked = false;
            ShowPlayersSetup();
        }

        // ------------------------------------------------------------------
        // Écrans de préparation : combien de joueurs, combien de chevaux.
        // ------------------------------------------------------------------
        private void ShowPlayersSetup()
        {
            Question.Text = "🐴 Les petits chevaux — combien de joueurs ?";
            _canvas = new Canvas { Width = W, Height = H };
            string[] icons = { "👥", "👨‍👩‍👧", "👨‍👩‍👧‍👦" };
            for (int n = 2; n <= 4; n++)
            {
                var sp = new StackPanel { HorizontalAlignment = HorizontalAlignment.Center };
                sp.Children.Add(new TextBlock { Text = icons[n - 2], FontSize = 88, HorizontalAlignment = HorizontalAlignment.Center });
                sp.Children.Add(new TextBlock
                {
                    Text = n + " joueurs",
                    FontSize = 32,
                    FontWeight = FontWeights.Bold,
                    Foreground = new SolidColorBrush(Color.FromRgb(0x3B, 0x2A, 0x5A)),
                    HorizontalAlignment = HorizontalAlignment.Center,
                });
                sp.Children.Add(new TextBlock
                {
                    Text = string.Join(" ", Enumerable.Range(0, n).Select(i => "●")),
                    FontSize = 24,
                    Foreground = new SolidColorBrush(PColor[n - 2]),
                    HorizontalAlignment = HorizontalAlignment.Center,
                });
                var btn = new Button
                {
                    Style = (Style)Application.Current.Resources["AnswerButton"],
                    Width = 330,
                    Height = 280,
                    Content = sp,
                };
                int count = n;
                btn.Click += (s, e) => { _nPlayers = count; ShowHorsesSetup(); };
                Canvas.SetLeft(btn, 130 + (n - 2) * 400);
                Canvas.SetTop(btn, 200);
                _canvas.Children.Add(btn);
            }
            SetBody(_canvas);
            Schedule(400, () => Speak("Les petits chevaux ! Combien de joueurs ? Deux, trois ou quatre ?"));
        }

        private void ShowHorsesSetup()
        {
            Question.Text = "🐴 Combien de chevaux par joueur ?";
            _canvas = new Canvas { Width = W, Height = H };
            var opts = new[] { (2, "⚡ Partie rapide", "2 chevaux chacun"), (4, "🏆 Vraie partie", "4 chevaux chacun") };
            for (int i = 0; i < 2; i++)
            {
                var (count, title, sub) = opts[i];
                var sp = new StackPanel { HorizontalAlignment = HorizontalAlignment.Center };
                sp.Children.Add(new TextBlock { Text = string.Concat(Enumerable.Repeat("🐴", count)), FontSize = 54, HorizontalAlignment = HorizontalAlignment.Center });
                sp.Children.Add(new TextBlock
                {
                    Text = title,
                    FontSize = 32,
                    FontWeight = FontWeights.Bold,
                    Foreground = new SolidColorBrush(Color.FromRgb(0x3B, 0x2A, 0x5A)),
                    HorizontalAlignment = HorizontalAlignment.Center,
                });
                sp.Children.Add(new TextBlock
                {
                    Text = sub,
                    FontSize = 22,
                    Foreground = new SolidColorBrush(Color.FromRgb(0x6B, 0x5A, 0x8A)),
                    HorizontalAlignment = HorizontalAlignment.Center,
                });
                var btn = new Button
                {
                    Style = (Style)Application.Current.Resources["AnswerButton"],
                    Width = 400,
                    Height = 280,
                    Content = sp,
                };
                int hc = count;
                btn.Click += (s, e) => { _nHorses = hc; ShowWhoPlays(); };
                Canvas.SetLeft(btn, 240 + i * 560);
                Canvas.SetTop(btn, 200);
                _canvas.Children.Add(btn);
            }
            SetBody(_canvas);
            Schedule(300, () => Speak("Partie rapide à deux chevaux, ou vraie partie à quatre chevaux ?"));
        }

        // ------------------------------------------------------------------
        // Le plateau.
        // ------------------------------------------------------------------
        // Plateau CARRÉ : 56 cases au bord (14 par côté), sens des aiguilles
        // d'une montre. Les départs (7, 21, 35, 49) sont au milieu des côtés,
        // et chaque escalier part du milieu de son côté, droit vers le centre.
        private Point TrackPoint(int abs)
        {
            int side = abs / 14, k = abs % 14;
            double step = 2 * R / 14.0;
            switch (side)
            {
                case 0: return new Point(Cx - R + k * step, Cy - R);  // haut : gauche → droite
                case 1: return new Point(Cx + R, Cy - R + k * step);  // droite : haut → bas
                case 2: return new Point(Cx + R - k * step, Cy + R);  // bas : droite → gauche
                default: return new Point(Cx - R, Cy + R - k * step); // gauche : bas → haut
            }
        }

        private Point LadderPoint(int player, int step)
        {
            var s = TrackPoint(StartIdx[player]);
            double f = 0.14 + step * 0.115; // marche 1..6, vers le centre
            return new Point(s.X + (Cx - s.X) * f, s.Y + (Cy - s.Y) * f);
        }

        // Écran 3 : qui joue ? Chaque joueur (sauf l'enfant) peut être un humain
        // au toucher, ou un ORDINATEUR — avec un niveau commun à choisir.
        private static readonly string[] BotLevelNames = { "🐣 Très facile", "🙂 Facile", "🦊 Malin" };

        private void ShowWhoPlays()
        {
            Question.Text = "🐴 Qui joue ?";
            _canvas = new Canvas { Width = W, Height = H };

            // Le joueur 1, c'est l'enfant, toujours.
            for (int p = 1; p < _nPlayers; p++) _isBot[p] = true; // défaut : ordinateurs

            var rows = new Button[4];
            for (int p = 0; p < _nPlayers; p++)
            {
                var text = new TextBlock
                {
                    FontSize = 28,
                    FontWeight = FontWeights.Bold,
                    Foreground = Brushes.White,
                    TextAlignment = TextAlignment.Center,
                };
                var row = new Button
                {
                    Style = (Style)Application.Current.Resources["AnswerButton"],
                    Width = 620,
                    Height = 86,
                    Content = new Border
                    {
                        Width = 590,
                        Height = 66,
                        CornerRadius = new CornerRadius(16),
                        Background = new SolidColorBrush(PColor[p]),
                        Child = text,
                    },
                    IsEnabled = p > 0, // l'enfant ne se change pas
                };
                int player = p;
                row.Click += (s, e) =>
                {
                    _isBot[player] = !_isBot[player];
                    RefreshWhoRow(rows[player], player);
                };
                Canvas.SetLeft(row, 120);
                Canvas.SetTop(row, 90 + p * 100);
                _canvas.Children.Add(row);
                rows[p] = row;
                RefreshWhoRow(row, p);
            }

            // Niveau commun des ordinateurs.
            var lvlTitle = new TextBlock
            {
                Text = "Niveau des ordinateurs :",
                FontSize = 24,
                FontWeight = FontWeights.Bold,
                Foreground = new SolidColorBrush(Color.FromRgb(0x3B, 0x2A, 0x5A)),
            };
            Canvas.SetLeft(lvlTitle, 830);
            Canvas.SetTop(lvlTitle, 100);
            _canvas.Children.Add(lvlTitle);

            var lvlBtns = new Button[3];
            for (int l = 0; l < 3; l++)
            {
                var btn = new Button
                {
                    Style = (Style)Application.Current.Resources["AnswerButton"],
                    Width = 470,
                    Height = 78,
                    FontSize = 25,
                };
                int lvl = l;
                btn.Click += (s, e) =>
                {
                    _botLevel = lvl;
                    for (int j = 0; j < 3; j++) RefreshLevelBtn(lvlBtns[j], j);
                };
                Canvas.SetLeft(btn, 830);
                Canvas.SetTop(btn, 150 + l * 92);
                _canvas.Children.Add(btn);
                lvlBtns[l] = btn;
                RefreshLevelBtn(btn, l);
            }

            var go = new Button
            {
                Style = (Style)Application.Current.Resources["AnswerButton"],
                Width = 470,
                Height = 110,
                FontSize = 36,
                FontWeight = FontWeights.Bold,
                Content = "▶  C'est parti !",
            };
            go.Click += (s, e) => StartMatch();
            Canvas.SetLeft(go, 830);
            Canvas.SetTop(go, 470);
            _canvas.Children.Add(go);

            SetBody(_canvas);
            Schedule(300, () => Speak("Qui joue ? Touche un joueur pour choisir humain ou ordinateur, puis c'est parti !"));
        }

        private void RefreshWhoRow(Button row, int p)
        {
            var border = (Border)row.Content;
            var text = (TextBlock)border.Child;
            text.Text = p == 0
                ? "● " + PName[0] + " — toi, au regard 👁"
                : "● " + PName[p] + " — " + (_isBot[p] ? "🤖 Ordinateur (touche pour changer)" : "👤 Humain (touche pour changer)");
        }

        private void RefreshLevelBtn(Button btn, int l)
        {
            btn.Content = (l == _botLevel ? "✔  " : "") + BotLevelNames[l];
            btn.Opacity = l == _botLevel ? 1.0 : 0.55;
        }

        private void StartMatch()
        {
            _over = false;
            Locked = false;
            _current = 0;
            for (int p = 0; p < 4; p++)
                for (int h = 0; h < 4; h++)
                    _pos[p, h] = -1;

            Question.Text = "🐴 Les petits chevaux — un 6 pour sortir !";
            _canvas = new Canvas { Width = W, Height = H };

            // Fond « prairie » : ciel → herbe, soleil et fleurs.
            var bg = new LinearGradientBrush { StartPoint = new Point(0, 0), EndPoint = new Point(0, 1) };
            bg.GradientStops.Add(new GradientStop(Color.FromRgb(0xC3, 0xE8, 0xFF), 0.0));
            bg.GradientStops.Add(new GradientStop(Color.FromRgb(0xDE, 0xF3, 0xD2), 0.45));
            bg.GradientStops.Add(new GradientStop(Color.FromRgb(0xBE, 0xE8, 0x96), 1.0));
            _canvas.Children.Add(new Rectangle { Width = W, Height = H, Fill = bg });
            _canvas.Children.Add(Deco("☀️", 640, 0, 48));
            _canvas.Children.Add(Deco("🌼", 330, 8, 30));
            _canvas.Children.Add(Deco("🌷", 420, 4, 30));
            _canvas.Children.Add(Deco("🌸", 520, 10, 30));
            _canvas.Children.Add(Deco("🌻", 360, 248, 30));
            _canvas.Children.Add(Deco("🦋", 556, 252, 28));
            _canvas.Children.Add(Deco("🌷", 360, 500, 30));
            _canvas.Children.Add(Deco("🐞", 560, 505, 24));

            // La ROUTE : un anneau de terre battue qui relie les 56 cases.
            var ring = new PointCollection();
            for (int i = 0; i < Track; i++) ring.Add(TrackPoint(i));
            _canvas.Children.Add(new Polygon
            {
                Points = ring,
                Stroke = new SolidColorBrush(Color.FromRgb(0xB9, 0x7A, 0x46)),
                StrokeThickness = 54,
                StrokeLineJoin = PenLineJoin.Round,
                IsHitTestVisible = false,
            });
            var ring2 = new PointCollection();
            for (int i = 0; i < Track; i++) ring2.Add(TrackPoint(i));
            _canvas.Children.Add(new Polygon
            {
                Points = ring2,
                Stroke = new SolidColorBrush(Color.FromRgb(0xF6, 0xE6, 0xC3)),
                StrokeThickness = 38,
                StrokeLineJoin = PenLineJoin.Round,
                IsHitTestVisible = false,
            });

            // Pelouse centrale (sous le trophée et le haut des escaliers).
            var lawn = new Ellipse
            {
                Width = 120,
                Height = 110,
                Fill = new RadialGradientBrush(Color.FromRgb(0xD9, 0xF2, 0xB8), Color.FromRgb(0xA8, 0xD9, 0x7E)),
                Stroke = new SolidColorBrush(Color.FromArgb(0x66, 0x6B, 0x8A, 0x3A)),
                StrokeThickness = 3,
                IsHitTestVisible = false,
            };
            Canvas.SetLeft(lawn, Cx - 60);
            Canvas.SetTop(lawn, Cy - 62);
            _canvas.Children.Add(lawn);

            // La piste : 56 pastilles rondes et brillantes ; les départs colorés
            // portent une flèche qui montre le sens de la course.
            for (int i = 0; i < Track; i++)
            {
                var c = TrackPoint(i);
                int owner = Array.IndexOf(StartIdx, i);

                if (owner >= 0) // halo lumineux sous la case départ
                {
                    var halo = new Ellipse
                    {
                        Width = CellD + 26,
                        Height = CellD + 26,
                        Fill = new RadialGradientBrush(
                            Color.FromArgb(0x77, PColor[owner].R, PColor[owner].G, PColor[owner].B),
                            Color.FromArgb(0x00, PColor[owner].R, PColor[owner].G, PColor[owner].B)),
                        IsHitTestVisible = false,
                    };
                    Canvas.SetLeft(halo, c.X - (CellD + 26) / 2);
                    Canvas.SetTop(halo, c.Y - (CellD + 26) / 2);
                    _canvas.Children.Add(halo);
                }

                var shadow = new Ellipse
                {
                    Width = CellD,
                    Height = CellD,
                    Fill = new SolidColorBrush(Color.FromArgb(0x2E, 0x2A, 0x1A, 0x00)),
                    IsHitTestVisible = false,
                };
                Canvas.SetLeft(shadow, c.X - CellD / 2);
                Canvas.SetTop(shadow, c.Y - CellD / 2 + 3);
                _canvas.Children.Add(shadow);

                Color baseCol = owner >= 0 ? PColor[owner] : Color.FromRgb(0xFF, 0xFD, 0xF4);
                var cell = new Ellipse
                {
                    Width = CellD,
                    Height = CellD,
                    Fill = owner >= 0
                        ? (Brush)new RadialGradientBrush(Lighten(baseCol), baseCol)
                        { GradientOrigin = new Point(0.35, 0.3), Center = new Point(0.35, 0.3) }
                        : new RadialGradientBrush(Colors.White, Color.FromRgb(0xF0, 0xE7, 0xD2))
                        { GradientOrigin = new Point(0.35, 0.3), Center = new Point(0.35, 0.3) },
                    Stroke = owner >= 0 ? Brushes.White : new SolidColorBrush(Color.FromRgb(0xC9, 0xA8, 0x7A)),
                    StrokeThickness = owner >= 0 ? 3.5 : 2,
                    IsHitTestVisible = false,
                };
                Canvas.SetLeft(cell, c.X - CellD / 2);
                Canvas.SetTop(cell, c.Y - CellD / 2);
                _canvas.Children.Add(cell);

                if (owner >= 0) // flèche du sens de la course
                {
                    var n = TrackPoint((i + 1) % Track);
                    double deg = Math.Atan2(n.Y - c.Y, n.X - c.X) * 180.0 / Math.PI;
                    var arrow = new TextBlock
                    {
                        Text = "➤",
                        FontSize = 19,
                        FontWeight = FontWeights.Bold,
                        Foreground = Brushes.White,
                        RenderTransformOrigin = new Point(0.5, 0.5),
                        RenderTransform = new RotateTransform(deg),
                        IsHitTestVisible = false,
                    };
                    Canvas.SetLeft(arrow, c.X - 10);
                    Canvas.SetTop(arrow, c.Y - 14);
                    _canvas.Children.Add(arrow);
                }
            }

            // Écuries (petites fermes à toit coloré) + escaliers des joueurs actifs.
            for (int p = 0; p < _nPlayers; p++)
            {
                double sx = StablePos[p].X, sy = StablePos[p].Y;

                // Toit.
                _canvas.Children.Add(new Polygon
                {
                    Points = new PointCollection { new Point(sx - 8, sy + 8), new Point(sx + 156, sy + 8), new Point(sx + 74, sy - 24) },
                    Fill = new SolidColorBrush(PColor[p]),
                    Stroke = Brushes.White,
                    StrokeThickness = 3,
                    StrokeLineJoin = PenLineJoin.Round,
                    IsHitTestVisible = false,
                });

                // Corps de la ferme : bois clair teinté de la couleur du joueur.
                var barn = new LinearGradientBrush { StartPoint = new Point(0, 0), EndPoint = new Point(0, 1) };
                barn.GradientStops.Add(new GradientStop(Color.FromRgb(0xFA, 0xEF, 0xD8), 0));
                barn.GradientStops.Add(new GradientStop(Color.FromArgb(0x66, PColor[p].R, PColor[p].G, PColor[p].B), 1));
                var box = new Border
                {
                    Width = 148,
                    Height = 118,
                    CornerRadius = new CornerRadius(6, 6, 18, 18),
                    Background = barn,
                    BorderBrush = new SolidColorBrush(PColor[p]),
                    BorderThickness = new Thickness(4),
                };
                Canvas.SetLeft(box, sx);
                Canvas.SetTop(box, sy);
                _canvas.Children.Add(box);

                var lbl = new TextBlock
                {
                    Text = "🏇 " + PName[p] + (p == 0 ? " (toi)" : ""),
                    FontSize = 17,
                    FontWeight = FontWeights.Bold,
                    Foreground = new SolidColorBrush(PColor[p]),
                };
                Canvas.SetLeft(lbl, sx + 8);
                Canvas.SetTop(lbl, sy + 122);
                _canvas.Children.Add(lbl);

                // Ruban de l'escalier : du départ vers le centre.
                var s0 = TrackPoint(StartIdx[p]);
                var s6 = LadderPoint(p, 6);
                _canvas.Children.Add(new Line
                {
                    X1 = s0.X, Y1 = s0.Y, X2 = s6.X, Y2 = s6.Y,
                    Stroke = new SolidColorBrush(Color.FromArgb(0x3C, PColor[p].R, PColor[p].G, PColor[p].B)),
                    StrokeThickness = 26,
                    StrokeStartLineCap = PenLineCap.Round,
                    StrokeEndLineCap = PenLineCap.Round,
                    IsHitTestVisible = false,
                });

                for (int k = 1; k <= 6; k++)
                {
                    var lp = LadderPoint(p, k);
                    double d = 34;
                    var stepShadow = new Ellipse
                    {
                        Width = d,
                        Height = d,
                        Fill = new SolidColorBrush(Color.FromArgb(0x2E, 0x2A, 0x1A, 0x00)),
                        IsHitTestVisible = false,
                    };
                    Canvas.SetLeft(stepShadow, lp.X - d / 2);
                    Canvas.SetTop(stepShadow, lp.Y - d / 2 + 3);
                    _canvas.Children.Add(stepShadow);
                    var step = new Ellipse
                    {
                        Width = d,
                        Height = d,
                        Fill = new RadialGradientBrush(Lighten(PColor[p]), PColor[p])
                        { GradientOrigin = new Point(0.35, 0.3), Center = new Point(0.35, 0.3) },
                        Stroke = Brushes.White,
                        StrokeThickness = 2.5,
                        IsHitTestVisible = false,
                    };
                    Canvas.SetLeft(step, lp.X - d / 2);
                    Canvas.SetTop(step, lp.Y - d / 2);
                    _canvas.Children.Add(step);
                    var num = new TextBlock
                    {
                        Text = k.ToString(),
                        FontSize = 15,
                        FontWeight = FontWeights.Bold,
                        Foreground = Brushes.White,
                        IsHitTestVisible = false,
                    };
                    Canvas.SetLeft(num, lp.X - 5);
                    Canvas.SetTop(num, lp.Y - 11);
                    _canvas.Children.Add(num);
                }
            }

            // Trophée central : chevaux arrivés par joueur.
            var trophy = new TextBlock { Text = "🏆", FontSize = 40 };
            Canvas.SetLeft(trophy, Cx - 22);
            Canvas.SetTop(trophy, Cy - 58);
            _canvas.Children.Add(trophy);
            for (int p = 0; p < _nPlayers; p++)
            {
                _homeTexts[p] = new TextBlock
                {
                    Text = "● 0/" + _nHorses,
                    FontSize = 17,
                    FontWeight = FontWeights.Bold,
                    Foreground = new SolidColorBrush(PColor[p]),
                };
                Canvas.SetLeft(_homeTexts[p], Cx - 26);
                Canvas.SetTop(_homeTexts[p], Cy - 8 + p * 22);
                _canvas.Children.Add(_homeTexts[p]);
            }

            // Les chevaux, à l'écurie : un vrai petit cheval sur un jeton brillant.
            for (int p = 0; p < _nPlayers; p++)
                for (int h = 0; h < _nHorses; h++)
                {
                    var g = new Grid { Width = TokD, Height = TokD };
                    g.Children.Add(new Ellipse // ombre portée intégrée (suit le pion)
                    {
                        Fill = new SolidColorBrush(Color.FromArgb(0x38, 0x1A, 0x10, 0x00)),
                        Margin = new Thickness(3, 6, -3, -6),
                    });
                    g.Children.Add(new Ellipse
                    {
                        Fill = new RadialGradientBrush(Lighten(PColor[p]), PColor[p])
                        { GradientOrigin = new Point(0.35, 0.3), Center = new Point(0.35, 0.3) },
                        Stroke = Brushes.White,
                        StrokeThickness = 3,
                    });
                    g.Children.Add(new TextBlock
                    {
                        Text = "🐴",
                        FontSize = TokD * 0.5,
                        HorizontalAlignment = HorizontalAlignment.Center,
                        VerticalAlignment = VerticalAlignment.Center,
                        Margin = new Thickness(0, -3, 0, 0),
                    });
                    g.Children.Add(new TextBlock
                    {
                        Text = (h + 1).ToString(),
                        FontSize = 11,
                        FontWeight = FontWeights.Bold,
                        Foreground = Brushes.White,
                        HorizontalAlignment = HorizontalAlignment.Right,
                        VerticalAlignment = VerticalAlignment.Bottom,
                        Margin = new Thickness(0, 0, 4, 1),
                    });
                    g.SetValue(Panel.ZIndexProperty, 30);
                    _tok[p, h] = g;
                    var pt = SpotOf(p, h, -1);
                    _tokAt[p, h] = pt;
                    Canvas.SetLeft(g, pt.X - TokD / 2);
                    Canvas.SetTop(g, pt.Y - TokD / 2);
                    _canvas.Children.Add(g);
                }

            // Bannière + dé, à droite.
            _banner = new Border
            {
                Width = 470,
                CornerRadius = new CornerRadius(24),
                Padding = new Thickness(18, 14, 18, 14),
                Background = new SolidColorBrush(PColor[0]),
            };
            _bannerText = new TextBlock
            {
                FontSize = 27,
                FontWeight = FontWeights.Bold,
                Foreground = Brushes.White,
                TextAlignment = TextAlignment.Center,
                TextWrapping = TextWrapping.Wrap,
            };
            _banner.Child = _bannerText;
            Canvas.SetLeft(_banner, 940);
            Canvas.SetTop(_banner, 60);
            _canvas.Children.Add(_banner);

            _dice = new DiceView();
            _dieBtn = new Button
            {
                Style = (Style)Application.Current.Resources["BalloonButton"],
                Width = 220,
                Height = 220,
                Content = _dice.Root,
            };
            _dieBtn.Click += (s, e) => Roll();
            _dieBtn.RenderTransformOrigin = new Point(0.5, 0.5);
            _dieScale = new ScaleTransform(1, 1);
            _dieBtn.RenderTransform = _dieScale;
            Canvas.SetLeft(_dieBtn, 940 + 235 - 110);
            Canvas.SetTop(_dieBtn, 230);
            _canvas.Children.Add(_dieBtn);

            var rules = new TextBlock
            {
                Text = "6 = un cheval sort (et on rejoue) · pile sur la dernière case ·\nescalier : 1, 2, 3, 4, 5, 6 exacts",
                FontSize = 18,
                Foreground = new SolidColorBrush(Color.FromRgb(0x6B, 0x5A, 0x8A)),
                Width = 470,
                TextAlignment = TextAlignment.Center,
            };
            Canvas.SetLeft(rules, 940);
            Canvas.SetTop(rules, 470);
            _canvas.Children.Add(rules);

            SetBody(_canvas);
            Schedule(500, () =>
            {
                Speak("Les petits chevaux ! Il faut un six pour sortir un cheval de l'écurie. " + PName[0] + ", à toi !");
                BeginTurn();
            });
        }

        // Position d'un pion selon son état.
        private Point SpotOf(int p, int h, int pos)
        {
            if (pos < 0) // écurie : 2×2
                return new Point(StablePos[p].X + 40 + (h % 2) * 62, StablePos[p].Y + 34 + (h / 2) * 52);
            if (pos <= 55)
                return TrackPoint((StartIdx[p] + pos) % Track);
            int k = Math.Min(6, pos - 100);
            var lp = LadderPoint(p, k);
            return new Point(lp.X + (h - 1.5) * 5, lp.Y - 6); // léger décalage si plusieurs
        }

        // ------------------------------------------------------------------
        // Déroulé d'un tour.
        // ------------------------------------------------------------------
        private void BeginTurn()
        {
            if (_over) return;
            SetGazeForPlayer(_current);
            _banner.Background = new SolidColorBrush(PColor[_current]);

            if (_isBot[_current])
            {
                // Tour d'un ordinateur : il lance le dé tout seul.
                Locked = true;
                _dieBtn.IsEnabled = false;
                _bannerText.Text = "🤖 " + PName[_current] + " (ordinateur)\njoue…";
                Schedule(1100, () =>
                {
                    if (_over) return;
                    _roll = 1 + GameKit.RandInt(6);
                    _dice.RollTo(_roll, () =>
                    {
                        Speak(_roll == 6 ? "Six !" : _roll.ToString() + " !");
                        Schedule(350, AfterRoll);
                    });
                });
                return;
            }

            Locked = false;
            _dieBtn.IsEnabled = true;
            string how = _current == 0 ? "Regarde le dé 🎲" : "Touche le dé ✋";
            _bannerText.Text = "Au tour du " + PName[_current] + (_current == 0 ? " (toi) !" : " !") + "\n" + how;
            var a = new DoubleAnimation(1, 1.07, TimeSpan.FromMilliseconds(620))
            { AutoReverse = true, RepeatBehavior = new RepeatBehavior(3), EasingFunction = new SineEase() };
            _dieScale.BeginAnimation(ScaleTransform.ScaleXProperty, a);
            _dieScale.BeginAnimation(ScaleTransform.ScaleYProperty, a);
        }

        private void Roll()
        {
            if (_over || Locked || !_dieBtn.IsEnabled) return;
            Locked = true;
            _dieBtn.IsEnabled = false;
            _roll = 1 + GameKit.RandInt(6);
            _dice.RollTo(_roll, () =>
            {
                Speak(_roll == 6 ? "Six !" : _roll.ToString() + " !");
                Schedule(350, AfterRoll);
            });
        }

        private void AfterRoll()
        {
            // Chevaux jouables. Les chevaux à l'ÉCURIE sont interchangeables : on
            // n'en garde qu'un seul dans la liste (avant, les boutons de choix se
            // superposaient dans l'écurie et le choix ne servait à rien).
            var movable = new List<int>();
            bool stableTaken = false;
            for (int h = 0; h < _nHorses; h++)
            {
                if (!TryTarget(_current, h, _roll, out _, out _)) continue;
                if (_pos[_current, h] < 0)
                {
                    if (stableTaken) continue;
                    stableTaken = true;
                }
                movable.Add(h);
            }

            if (movable.Count == 0)
            {
                _bannerText.Text = PName[_current] + " ne peut pas jouer…";
                Speak(_roll == 6 ? "Personne ne peut bouger, même avec un six !" : "Pas de chance, aucun cheval ne peut bouger !");
                Schedule(1700, NextTurn);
                return;
            }

            // Ordinateur : il choisit son cheval selon son niveau.
            if (_isBot[_current])
            {
                int pick = BotChoose(movable);
                Schedule(650, () => DoMove(pick));
                return;
            }

            if (movable.Count == 1)
            {
                Schedule(450, () => DoMove(movable[0]));
                return;
            }

            // Plusieurs chevaux possibles : on les fait choisir (cibles au regard
            // pour l'enfant, au toucher pour les autres).
            _bannerText.Text = "Choisis ton cheval !";
            Speak("Choisis le cheval que tu veux bouger !");
            Locked = false;
            foreach (var h in movable)
            {
                var pt = _tokAt[_current, h];
                var btn = new Button
                {
                    Style = (Style)Application.Current.Resources["BalloonButton"],
                    Width = 74,
                    Height = 74,
                    Content = new Ellipse
                    {
                        Width = 60,
                        Height = 60,
                        Stroke = new SolidColorBrush(Color.FromRgb(0xFF, 0xC1, 0x07)),
                        StrokeThickness = 5,
                    },
                };
                btn.SetValue(Panel.ZIndexProperty, 60);
                int horse = h;
                btn.Click += (s, e) => { ClearChoices(); Locked = true; DoMove(horse); };
                Canvas.SetLeft(btn, pt.X - 37);
                Canvas.SetTop(btn, pt.Y - 37);
                _canvas.Children.Add(btn);
                _choiceBtns.Add(btn);
            }
        }

        private void ClearChoices()
        {
            foreach (var b in _choiceBtns) _canvas.Children.Remove(b);
            _choiceBtns.Clear();
        }

        // Cible d'un cheval pour un lancer : renvoie faux si le coup est interdit.
        private bool TryTarget(int p, int h, int roll, out int newPos, out int victimPlayer)
        {
            newPos = 0;
            victimPlayer = -1;
            int pos = _pos[p, h];

            if (pos == 106) return false;

            if (pos < 0) // à l'écurie : il faut un 6
            {
                if (roll != 6) return false;
                newPos = 0;
            }
            else if (pos == 55) // au pied de l'escalier : le chiffre exact
            {
                if (roll != 1) return false;
                newPos = 101;
            }
            else if (pos <= 54) // sur la piste : avancer, rebond sur la dernière case
            {
                int t2 = pos + roll;
                if (t2 > 55) t2 = 110 - t2;
                newPos = t2;
            }
            else // sur une marche k : il faut k+1 exactement
            {
                int k = pos - 100;
                if (roll != k + 1) return false;
                newPos = k + 1 >= 6 ? 106 : 100 + k + 1;
            }

            if (newPos <= 55) // occupation de la case visée
            {
                int abs = (StartIdx[p] + newPos) % Track;
                for (int q = 0; q < _nPlayers; q++)
                    for (int j = 0; j < _nHorses; j++)
                    {
                        if (q == p && j == h) continue;
                        int op = _pos[q, j];
                        if (op < 0 || op > 55) continue;
                        if ((StartIdx[q] + op) % Track != abs) continue;
                        if (q == p) return false; // deux chevaux à soi : interdit
                        victimPlayer = q;         // cheval adverse : il sera mangé
                    }
            }
            return true;
        }

        private void DoMove(int h)
        {
            int victim;
            if (!TryTarget(_current, h, _roll, out var newPos, out victim)) { NextTurn(); return; }
            int oldPos = _pos[_current, h];
            _pos[_current, h] = newPos;

            // Mange le cheval adverse présent sur la case.
            int vp = -1, vh = -1;
            if (victim >= 0 && newPos <= 55)
            {
                int abs = (StartIdx[_current] + newPos) % Track;
                for (int j = 0; j < _nHorses; j++)
                {
                    int op = _pos[victim, j];
                    if (op >= 0 && op <= 55 && (StartIdx[victim] + op) % Track == abs) { vp = victim; vh = j; break; }
                }
            }

            AnimateToken(_current, h, SpotOf(_current, h, newPos), 520, () =>
            {
                if (oldPos < 0) Speak("Un cheval " + PName[_current] + " sort de l'écurie !");
                else if (newPos == 106) Speak("En haut de l'escalier : un cheval " + PName[_current] + " est arrivé !");
                else if (newPos > 100) Speak("Marche " + (newPos - 100) + " !");
                else if (newPos == 55) Speak("Pile au pied de l'escalier !");

                if (vp >= 0)
                {
                    _pos[vp, vh] = -1;
                    Speak("Oh ! Le cheval " + PName[vp] + " est mangé : retour à l'écurie !");
                    AnimateToken(vp, vh, SpotOf(vp, vh, -1), 700, null);
                }

                UpdateHomeCounts();
                if (Enumerable.Range(0, _nHorses).All(j => _pos[_current, j] == 106)) { Win(_current); return; }

                if (_roll == 6)
                {
                    Speak("Six : tu rejoues !");
                    Schedule(900, BeginTurn); // même joueur
                }
                else Schedule(700, NextTurn);
            });
        }

        private void AnimateToken(int p, int h, Point to, int ms, Action done)
        {
            var g = _tok[p, h];
            var from = _tokAt[p, h];
            _tokAt[p, h] = to;
            g.SetValue(Panel.ZIndexProperty, 50);
            var ax = new DoubleAnimation(from.X - TokD / 2, to.X - TokD / 2, TimeSpan.FromMilliseconds(ms))
            { EasingFunction = new QuadraticEase { EasingMode = EasingMode.EaseInOut } };
            var ay = new DoubleAnimation(from.Y - TokD / 2, to.Y - TokD / 2, TimeSpan.FromMilliseconds(ms))
            { EasingFunction = new QuadraticEase { EasingMode = EasingMode.EaseInOut } };
            if (done != null) ay.Completed += (s, e) => done();
            g.BeginAnimation(Canvas.LeftProperty, ax);
            g.BeginAnimation(Canvas.TopProperty, ay);
        }

        private void UpdateHomeCounts()
        {
            for (int p = 0; p < _nPlayers; p++)
            {
                int n = Enumerable.Range(0, _nHorses).Count(j => _pos[p, j] == 106);
                _homeTexts[p].Text = "● " + n + "/" + _nHorses;
            }
        }

        // ------------------------------------------------------------------
        // La « cervelle » des joueurs automatiques.
        //   0 Très facile : cheval au hasard.
        //   1 Facile : préfère arriver, monter, manger, sortir.
        //   2 Malin : en plus, vise la case pile, fuit le danger et évite de
        //     se poser sous les sabots d'un adversaire.
        // ------------------------------------------------------------------
        private int BotChoose(List<int> movable)
        {
            if (_botLevel == 0 || movable.Count == 1) return GameKit.Rand(movable);

            int best = movable[0], bestScore = int.MinValue;
            foreach (var h in movable)
            {
                if (!TryTarget(_current, h, _roll, out var np, out var victim)) continue;
                int sc = GameKit.RandInt(3); // petit hasard pour départager
                if (np == 106) sc += 100;                    // un cheval arrive !
                else if (np > 100) sc += 80;                 // monte une marche
                if (victim >= 0) sc += 70;                   // mange un adversaire
                if (np == 55) sc += 55;                      // pile au pied de l'escalier
                if (_pos[_current, h] < 0) sc += 45;         // sort de l'écurie

                if (_botLevel >= 2)
                {
                    int cur = _pos[_current, h];
                    if (cur >= 0 && cur <= 55 && InDanger(_current, cur)) sc += 25; // fuit
                    if (np <= 55 && InDanger(_current, np)) sc -= 30;               // ne s'expose pas
                    if (np <= 55) sc += np / 4;              // pousse le cheval le plus avancé
                }
                else if (np <= 55) sc += np / 8;

                if (sc > bestScore) { bestScore = sc; best = h; }
            }
            return best;
        }

        // La case t (relative au joueur p) est-elle à portée (1..6) d'un adversaire ?
        private bool InDanger(int p, int t)
        {
            int abs = (StartIdx[p] + t) % Track;
            for (int q = 0; q < _nPlayers; q++)
            {
                if (q == p) continue;
                for (int j = 0; j < _nHorses; j++)
                {
                    int op = _pos[q, j];
                    if (op >= 0 && op <= 55)
                    {
                        int b = (StartIdx[q] + op) % Track;
                        int d = (abs - b + Track) % Track;
                        if (d >= 1 && d <= 6) return true;
                    }
                    else if (op < 0 && abs == StartIdx[q]) return true; // sortie possible sur nous
                }
            }
            return false;
        }

        private void NextTurn()
        {
            if (_over) return;
            _current = (_current + 1) % _nPlayers;
            BeginTurn();
        }

        private void Win(int p)
        {
            if (_over) return;
            _over = true;
            Locked = true;
            ReleaseGaze();
            _dieBtn.IsEnabled = false;
            _banner.Background = new SolidColorBrush(PColor[p]);
            _bannerText.Text = "🏆 Le " + PName[p] + " a gagné !\nTous ses chevaux sont arrivés ! 🎉";
            Speak("Le " + PName[p] + " a gagné ! Tous ses chevaux sont arrivés en haut de l'escalier ! Bravo !");
            Celebrate();
            ScheduleNext(6500);
        }

        private static Color Lighten(Color c) => Color.FromRgb(
            (byte)(c.R + (255 - c.R) * 0.55), (byte)(c.G + (255 - c.G) * 0.55), (byte)(c.B + (255 - c.B) * 0.55));
    }
}
