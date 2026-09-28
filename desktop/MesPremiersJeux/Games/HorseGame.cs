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
    /// Le joueur 1 (Rouge) est l'enfant, au regard ; les autres jouent au toucher
    /// (le regard se met en pause à leur tour).
    /// </summary>
    public sealed class HorseGame : GameControl
    {
        private const double W = 1440, H = 760;
        private const int Track = 56;                  // cases de la piste
        private const double Cx = 470, Cy = 390;       // centre du plateau
        private const double Rx = 360, Ry = 280;       // rayons de la piste
        private const double CellD = 42;               // diamètre d'une case
        private const double TokD = 36;                // diamètre d'un cheval

        private static readonly int[] StartIdx = { 0, 14, 28, 42 };
        private static readonly Color[] PColor =
        {
            Color.FromRgb(0xE8, 0x43, 0x3A), // Rouge — l'enfant
            Color.FromRgb(0x2E, 0x7F, 0xE8), // Bleu
            Color.FromRgb(0x2F, 0xA3, 0x4D), // Vert
            Color.FromRgb(0xE8, 0xB0, 0x0F), // Jaune
        };
        private static readonly string[] PName = { "Rouge", "Bleu", "Vert", "Jaune" };
        // Écuries : quatre coins du plateau (x, y).
        private static readonly Point[] StablePos =
        {
            new Point(26, 22), new Point(756, 22), new Point(756, 610), new Point(26, 610),
        };

        private int _nPlayers = 2;
        private int _nHorses = 4;
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
                btn.Click += (s, e) => { _nHorses = hc; StartMatch(); };
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
        private Point TrackPoint(int abs)
        {
            double a = (-90 + abs * (360.0 / Track)) * Math.PI / 180.0;
            return new Point(Cx + Rx * Math.Cos(a), Cy + Ry * Math.Sin(a));
        }

        private Point LadderPoint(int player, int step)
        {
            var s = TrackPoint(StartIdx[player]);
            double f = 0.14 + step * 0.115; // marche 1..6, vers le centre
            return new Point(s.X + (Cx - s.X) * f, s.Y + (Cy - s.Y) * f);
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

            // Fond doux.
            _canvas.Children.Add(new Rectangle
            {
                Width = W,
                Height = H,
                Fill = new LinearGradientBrush(Color.FromRgb(0xEF, 0xF7, 0xE6), Color.FromRgb(0xDD, 0xEF, 0xCC), 90),
            });

            // La piste : 56 cases rondes, colorées aux départs.
            for (int i = 0; i < Track; i++)
            {
                var c = TrackPoint(i);
                int owner = Array.IndexOf(StartIdx, i);
                var cell = new Ellipse
                {
                    Width = CellD,
                    Height = CellD,
                    Fill = owner >= 0
                        ? new SolidColorBrush(Lighten(PColor[owner]))
                        : new SolidColorBrush(Colors.White),
                    Stroke = new SolidColorBrush(owner >= 0 ? PColor[owner] : Color.FromRgb(0x9A, 0x8A, 0xB8)),
                    StrokeThickness = owner >= 0 ? 4 : 2,
                    IsHitTestVisible = false,
                };
                Canvas.SetLeft(cell, c.X - CellD / 2);
                Canvas.SetTop(cell, c.Y - CellD / 2);
                _canvas.Children.Add(cell);
            }

            // Écuries + escaliers des joueurs actifs.
            for (int p = 0; p < _nPlayers; p++)
            {
                var box = new Border
                {
                    Width = 148,
                    Height = 118,
                    CornerRadius = new CornerRadius(20),
                    Background = new SolidColorBrush(Color.FromArgb(0x33, PColor[p].R, PColor[p].G, PColor[p].B)),
                    BorderBrush = new SolidColorBrush(PColor[p]),
                    BorderThickness = new Thickness(4),
                };
                Canvas.SetLeft(box, StablePos[p].X);
                Canvas.SetTop(box, StablePos[p].Y);
                _canvas.Children.Add(box);
                var lbl = new TextBlock
                {
                    Text = "🏠 " + PName[p] + (p == 0 ? " (toi)" : ""),
                    FontSize = 17,
                    FontWeight = FontWeights.Bold,
                    Foreground = new SolidColorBrush(PColor[p]),
                };
                Canvas.SetLeft(lbl, StablePos[p].X + 10);
                Canvas.SetTop(lbl, StablePos[p].Y - 26);
                _canvas.Children.Add(lbl);

                for (int k = 1; k <= 6; k++)
                {
                    var lp = LadderPoint(p, k);
                    double d = 34;
                    var step = new Ellipse
                    {
                        Width = d,
                        Height = d,
                        Fill = new SolidColorBrush(Color.FromArgb(0x55, PColor[p].R, PColor[p].G, PColor[p].B)),
                        Stroke = new SolidColorBrush(PColor[p]),
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
                        Foreground = new SolidColorBrush(PColor[p]),
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

            // Les chevaux, à l'écurie.
            for (int p = 0; p < _nPlayers; p++)
                for (int h = 0; h < _nHorses; h++)
                {
                    var g = new Grid { Width = TokD, Height = TokD };
                    g.Children.Add(new Ellipse
                    {
                        Fill = new RadialGradientBrush(Lighten(PColor[p]), PColor[p])
                        { GradientOrigin = new Point(0.35, 0.3), Center = new Point(0.35, 0.3) },
                        Stroke = Brushes.White,
                        StrokeThickness = 3,
                    });
                    g.Children.Add(new TextBlock
                    {
                        Text = (h + 1).ToString(),
                        FontSize = 16,
                        FontWeight = FontWeights.Bold,
                        Foreground = Brushes.White,
                        HorizontalAlignment = HorizontalAlignment.Center,
                        VerticalAlignment = VerticalAlignment.Center,
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
            Locked = false;
            _dieBtn.IsEnabled = true;
            _banner.Background = new SolidColorBrush(PColor[_current]);
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
            var movable = new List<int>();
            for (int h = 0; h < _nHorses; h++)
                if (TryTarget(_current, h, _roll, out _, out _)) movable.Add(h);

            if (movable.Count == 0)
            {
                _bannerText.Text = PName[_current] + " ne peut pas jouer…";
                Speak(_roll == 6 ? "Personne ne peut bouger, même avec un six !" : "Pas de chance, aucun cheval ne peut bouger !");
                Schedule(1700, NextTurn);
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
