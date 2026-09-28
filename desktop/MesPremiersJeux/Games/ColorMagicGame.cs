using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Shapes;
using MesPremiersJeux.Lib;

namespace MesPremiersJeux.Games
{
    /// <summary>
    /// « La potion des couleurs » (PS/MS), en trois actes, pensée pour un enfant
    /// qui NE LIT PAS : toutes les consignes sont dites à voix haute (bouton 🔊
    /// pour les réentendre) et montrées en grand.
    ///   1. Les pots de peinture — découverte : chaque pot regardé éclabousse sa
    ///      couleur et dit son nom.
    ///   2. Le chaudron magique — on verse deux couleurs, la magie opère :
    ///      rouge + jaune = ORANGE ! (puis vert, puis violet).
    ///   3. Trouve la couleur — un grand rond de couleur en modèle, et des objets
    ///      à choisir : « Trouve ce qui est rouge ! »
    /// </summary>
    public sealed class ColorMagicGame : GameControl
    {
        private const double W = 1400, H = 680;

        private static readonly string[] CName = { "rouge", "jaune", "bleu", "vert", "orange", "violet" };
        private static readonly Color[] CVal =
        {
            Color.FromRgb(0xE8, 0x43, 0x3A), Color.FromRgb(0xF2, 0xC4, 0x0F), Color.FromRgb(0x2E, 0x7F, 0xE8),
            Color.FromRgb(0x2F, 0xA3, 0x4D), Color.FromRgb(0xF2, 0x83, 0x22), Color.FromRgb(0x8E, 0x5B, 0xD9),
        };
        private static readonly string[][] CObjs =
        {
            new[] { "🍓", "🍎", "🐞" }, new[] { "🍌", "🌻", "🐤" }, new[] { "💧", "🐳", "🦋" },
            new[] { "🐸", "🥦", "🌵" }, new[] { "🍊", "🥕", "🦊" }, new[] { "🍇", "🍆", "☂️" },
        };
        private static readonly (int A, int B, int R)[] Mixes = { (0, 1, 4), (2, 1, 3), (0, 2, 5) };

        private Canvas _canvas;
        private int _phase;
        private bool[] _seen;
        private int _mixRound, _findRound;
        private bool _pouredA, _pouredB;
        private Ellipse _cauldronFill;
        private Point _cauldronCenter;
        private int[] _findTargets;

        public ColorMagicGame(Action celebrate) : base(celebrate) { }

        protected override void NewRound()
        {
            StartDiscovery();
        }

        // Un pot de peinture avec sa grosse tache de couleur.
        private Grid PotVisual(int ci, double size)
        {
            var g = new Grid { Width = size, Height = size };
            g.Children.Add(new Border // le pot
            {
                Width = size * 0.84,
                Height = size * 0.58,
                CornerRadius = new CornerRadius(10, 10, size * 0.16, size * 0.16),
                Background = new LinearGradientBrush(Color.FromRgb(0xF4, 0xF4, 0xF8), Color.FromRgb(0xD2, 0xD2, 0xDE), 90),
                BorderBrush = new SolidColorBrush(Color.FromRgb(0x8A, 0x8A, 0xA2)),
                BorderThickness = new Thickness(3),
                VerticalAlignment = VerticalAlignment.Bottom,
                HorizontalAlignment = HorizontalAlignment.Center,
            });
            g.Children.Add(new Ellipse // la peinture qui déborde
            {
                Width = size * 0.66,
                Height = size * 0.42,
                Fill = new RadialGradientBrush(Lighten(CVal[ci]), CVal[ci])
                { GradientOrigin = new Point(0.35, 0.3), Center = new Point(0.35, 0.3) },
                Stroke = Brushes.White,
                StrokeThickness = 3,
                VerticalAlignment = VerticalAlignment.Top,
                HorizontalAlignment = HorizontalAlignment.Center,
                Margin = new Thickness(0, size * 0.14, 0, 0),
            });
            g.Children.Add(new Ellipse // une goutte qui coule
            {
                Width = size * 0.1,
                Height = size * 0.16,
                Fill = new SolidColorBrush(CVal[ci]),
                VerticalAlignment = VerticalAlignment.Top,
                HorizontalAlignment = HorizontalAlignment.Left,
                Margin = new Thickness(size * 0.22, size * 0.44, 0, 0),
            });
            return g;
        }

        // ==================================================================
        // ACTE 1 — les pots de peinture (découverte sans échec).
        // ==================================================================
        private void StartDiscovery()
        {
            _phase = 1;
            Locked = false;
            Question.Text = "🎨 La potion des couleurs";
            _canvas = new Canvas { Width = W, Height = H };
            _seen = new bool[6];

            double size = 196, gapX = 60, gapY = 34;
            double x0 = (W - 3 * size - 2 * gapX) / 2, y0 = 60;
            for (int i = 0; i < 6; i++)
            {
                var btn = new Button
                {
                    Style = (Style)Application.Current.Resources["BalloonButton"],
                    Width = size,
                    Height = size,
                    Content = PotVisual(i, size * 0.94),
                    RenderTransformOrigin = new Point(0.5, 0.5),
                };
                int ci = i;
                var captBtn = btn;
                btn.Click += (s, e) => DiscoverPot(captBtn, ci);
                Canvas.SetLeft(btn, x0 + (i % 3) * (size + gapX));
                Canvas.SetTop(btn, y0 + (i / 3) * (size + gapY));
                _canvas.Children.Add(btn);
            }

            var speaker = SpeakerButton(() => "Regarde chaque pot de peinture pour entendre sa couleur !");
            Canvas.SetLeft(speaker, W - 150);
            Canvas.SetTop(speaker, 40);
            _canvas.Children.Add(speaker);

            SetBody(_canvas);
            Schedule(450, () => Speak("La potion des couleurs ! Regarde chaque pot de peinture pour entendre sa couleur !"));
        }

        private void DiscoverPot(Button btn, int ci)
        {
            if (_phase != 1 || Locked) return;
            Wobble(btn);
            Splash(Canvas.GetLeft(btn) + btn.Width / 2, Canvas.GetTop(btn) + btn.Height / 2, CVal[ci]);
            Speak(Cap(CName[ci]) + " !");
            if (!_seen[ci])
            {
                _seen[ci] = true;
                var star = new TextBlock { Text = "⭐", FontSize = 30, IsHitTestVisible = false };
                Canvas.SetLeft(star, Canvas.GetLeft(btn) + btn.Width - 26);
                Canvas.SetTop(star, Canvas.GetTop(btn) - 12);
                _canvas.Children.Add(star);
            }
            if (_seen.All(v => v))
            {
                _phase = 0;
                Locked = true;
                Speak("Bravo, tu connais tous les pots ! Et maintenant... le chaudron magique !");
                Schedule(2800, () => { _mixRound = 0; StartMixRound(); });
            }
        }

        // ==================================================================
        // ACTE 2 — le chaudron magique : deux couleurs versées = une nouvelle !
        // ==================================================================
        private void StartMixRound()
        {
            if (_mixRound >= Mixes.Length)
            {
                Locked = true;
                Celebrate();
                Speak("Tu as fait toutes les potions magiques ! Maintenant, trouve les couleurs !");
                Schedule(3000, StartFind);
                return;
            }

            _phase = 2;
            Locked = false;
            _pouredA = _pouredB = false;
            var (a, b, _) = Mixes[_mixRound];
            Question.Text = "🫕 Le chaudron magique";
            _canvas = new Canvas { Width = W, Height = H };

            AddPotButton(a, 200, 60, true);
            AddPotButton(b, 940, 60, false);

            // Le chaudron.
            _cauldronCenter = new Point(W / 2, 430);
            var pot = new Ellipse
            {
                Width = 300,
                Height = 190,
                Fill = new RadialGradientBrush(Color.FromRgb(0x5A, 0x5A, 0x6E), Color.FromRgb(0x2E, 0x2E, 0x3E)),
                Stroke = new SolidColorBrush(Color.FromRgb(0x1A, 0x1A, 0x28)),
                StrokeThickness = 6,
                IsHitTestVisible = false,
            };
            Canvas.SetLeft(pot, _cauldronCenter.X - 150);
            Canvas.SetTop(pot, _cauldronCenter.Y - 95);
            _canvas.Children.Add(pot);
            _cauldronFill = new Ellipse
            {
                Width = 240,
                Height = 92,
                Fill = new SolidColorBrush(Color.FromRgb(0x6E, 0x6E, 0x84)),
                IsHitTestVisible = false,
            };
            Canvas.SetLeft(_cauldronFill, _cauldronCenter.X - 120);
            Canvas.SetTop(_cauldronFill, _cauldronCenter.Y - 82);
            _canvas.Children.Add(_cauldronFill);
            _canvas.Children.Add(MakeDeco("🔥", _cauldronCenter.X - 30, _cauldronCenter.Y + 92, 44));

            var speaker = SpeakerButton(() => "Regarde les deux pots pour les verser dans le chaudron magique !");
            Canvas.SetLeft(speaker, W - 150);
            Canvas.SetTop(speaker, 40);
            _canvas.Children.Add(speaker);

            SetBody(_canvas);
            Schedule(400, () => Speak("Verse le " + CName[a] + " et le " + CName[b] + " dans le chaudron ! Regarde un pot pour le verser !"));
        }

        private void AddPotButton(int ci, double x, double y, bool isA)
        {
            var btn = new Button
            {
                Style = (Style)Application.Current.Resources["BalloonButton"],
                Width = 250,
                Height = 250,
                Content = PotVisual(ci, 235),
                RenderTransformOrigin = new Point(0.5, 0.5),
            };
            var captBtn = btn;
            btn.Click += (s, e) => PourPot(captBtn, ci, isA);
            Canvas.SetLeft(btn, x);
            Canvas.SetTop(btn, y);
            _canvas.Children.Add(btn);
        }

        private void PourPot(Button btn, int ci, bool isA)
        {
            if (_phase != 2 || Locked) return;
            if (isA ? _pouredA : _pouredB) return;
            if (isA) _pouredA = true; else _pouredB = true;

            Wobble(btn);
            Speak(Cap(CName[ci]) + " !");

            // La goutte s'envole du pot jusqu'au chaudron.
            var drop = new Ellipse
            {
                Width = 46,
                Height = 58,
                Fill = new SolidColorBrush(CVal[ci]),
                Stroke = Brushes.White,
                StrokeThickness = 3,
                IsHitTestVisible = false,
            };
            double sx = Canvas.GetLeft(btn) + btn.Width / 2 - 23;
            double sy = Canvas.GetTop(btn) + btn.Height / 2 - 29;
            Canvas.SetLeft(drop, sx);
            Canvas.SetTop(drop, sy);
            drop.SetValue(Panel.ZIndexProperty, 60);
            _canvas.Children.Add(drop);
            var ax = new DoubleAnimation(sx, _cauldronCenter.X - 23, TimeSpan.FromMilliseconds(620))
            { EasingFunction = new QuadraticEase { EasingMode = EasingMode.EaseIn } };
            var ay = new DoubleAnimation(sy, _cauldronCenter.Y - 60, TimeSpan.FromMilliseconds(620))
            { EasingFunction = new QuadraticEase { EasingMode = EasingMode.EaseIn } };
            ay.Completed += (s, e) =>
            {
                _canvas.Children.Remove(drop);
                Splash(_cauldronCenter.X, _cauldronCenter.Y - 40, CVal[ci]);
                if (_pouredA && _pouredB) { Locked = true; Schedule(700, RevealMix); }
            };
            drop.BeginAnimation(Canvas.LeftProperty, ax);
            drop.BeginAnimation(Canvas.TopProperty, ay);
        }

        private void RevealMix()
        {
            var (a, b, r) = Mixes[_mixRound];
            _cauldronFill.Fill = new RadialGradientBrush(Lighten(CVal[r]), CVal[r]);
            Splash(_cauldronCenter.X, _cauldronCenter.Y - 50, CVal[r]);
            Splash(_cauldronCenter.X - 60, _cauldronCenter.Y - 30, CVal[r]);
            Splash(_cauldronCenter.X + 60, _cauldronCenter.Y - 30, CVal[r]);

            // La nouvelle couleur monte du chaudron, en grand.
            var blob = new Ellipse
            {
                Width = 150,
                Height = 150,
                Fill = new RadialGradientBrush(Lighten(CVal[r]), CVal[r]),
                Stroke = Brushes.White,
                StrokeThickness = 6,
                RenderTransformOrigin = new Point(0.5, 0.5),
                IsHitTestVisible = false,
            };
            var sc = new ScaleTransform(0.2, 0.2);
            blob.RenderTransform = sc;
            Canvas.SetLeft(blob, _cauldronCenter.X - 75);
            Canvas.SetTop(blob, _cauldronCenter.Y - 300);
            blob.SetValue(Panel.ZIndexProperty, 70);
            _canvas.Children.Add(blob);
            var pop = new DoubleAnimation(0.2, 1, TimeSpan.FromMilliseconds(520))
            { EasingFunction = new BackEase { EasingMode = EasingMode.EaseOut, Amplitude = 0.8 } };
            sc.BeginAnimation(ScaleTransform.ScaleXProperty, pop);
            sc.BeginAnimation(ScaleTransform.ScaleYProperty, pop);

            GameKit.Success();
            Speak("Abracadabra ! " + Cap(CName[a]) + " et " + CName[b] + "... ça fait... " + CName[r] + " !");
            RewardStore.Add();
            _mixRound++;
            Schedule(3400, StartMixRound);
        }

        // ==================================================================
        // ACTE 3 — « Trouve ce qui est rouge ! » : modèle en grand + objets.
        // ==================================================================
        private void StartFind()
        {
            _findTargets = GameKit.Shuffle(Enumerable.Range(0, 6)).Take(4).ToArray();
            _findRound = 0;
            NextFind();
        }

        private void NextFind()
        {
            if (_findRound >= _findTargets.Length)
            {
                Locked = true;
                Question.Text = "🎉 Tu connais les couleurs magiques !";
                Celebrate();
                Speak("Bravo ! Tu connais toutes les couleurs magiques !");
                ScheduleNext(4600);
                return;
            }

            _phase = 3;
            Locked = false;
            int target = _findTargets[_findRound];
            Question.Text = "🔎 Trouve ce qui est " + CName[target] + " !";
            _canvas = new Canvas { Width = W, Height = H };

            // CONSIGNE SANS LECTURE : le grand rond de couleur en modèle + 🔊.
            var model = new Ellipse
            {
                Width = 170,
                Height = 170,
                Fill = new RadialGradientBrush(Lighten(CVal[target]), CVal[target])
                { GradientOrigin = new Point(0.35, 0.3), Center = new Point(0.35, 0.3) },
                Stroke = Brushes.White,
                StrokeThickness = 6,
            };
            var card = new Border
            {
                CornerRadius = new CornerRadius(30),
                Background = Brushes.White,
                BorderBrush = new SolidColorBrush(Color.FromRgb(0xFF, 0xC1, 0x07)),
                BorderThickness = new Thickness(6),
                Padding = new Thickness(18),
                Child = model,
            };
            Canvas.SetLeft(card, W / 2 - 175);
            Canvas.SetTop(card, 14);
            _canvas.Children.Add(card);
            int spoken = target;
            var speaker = SpeakerButton(() => "Trouve ce qui est " + CName[spoken] + " ! Cherche la même couleur !");
            Canvas.SetLeft(speaker, W / 2 + 85);
            Canvas.SetTop(speaker, 66);
            _canvas.Children.Add(speaker);

            // Trois objets : un de la bonne couleur, deux d'autres couleurs.
            var others = GameKit.Shuffle(Enumerable.Range(0, 6).Where(c => c != target)).Take(2).ToList();
            var picks = new List<int> { target };
            picks.AddRange(others);
            picks = GameKit.Shuffle(picks);

            double size = 240, gap = 90;
            double x0 = (W - 3 * size - 2 * gap) / 2, y = 380;
            for (int i = 0; i < picks.Count; i++)
            {
                int ci = picks[i];
                var btn = new Button
                {
                    Style = (Style)Application.Current.Resources["AnswerButton"],
                    Width = size,
                    Height = size,
                    Content = new TextBlock
                    {
                        Text = GameKit.Rand(CObjs[ci].ToList()),
                        FontSize = 130,
                        HorizontalAlignment = HorizontalAlignment.Center,
                        VerticalAlignment = VerticalAlignment.Center,
                    },
                };
                int captured = ci;
                var captBtn = btn;
                btn.Click += (s, e) => PickObject(captBtn, captured, spoken);
                Canvas.SetLeft(btn, x0 + i * (size + gap));
                Canvas.SetTop(btn, y);
                _canvas.Children.Add(btn);
            }

            SetBody(_canvas);
            Schedule(400, () => Speak("Trouve ce qui est " + CName[target] + " !"));
        }

        private void PickObject(Button btn, int ci, int target)
        {
            if (_phase != 3 || Locked) return;
            if (ci == target)
            {
                Locked = true;
                GameKit.Success();
                Speak("Oui, c'est " + CName[target] + " ! " + GameKit.Praise());
                Wobble(btn);
                Splash(Canvas.GetLeft(btn) + btn.Width / 2, Canvas.GetTop(btn) + btn.Height / 2, CVal[target]);
                _findRound++;
                Schedule(1800, NextFind);
            }
            else
            {
                GameKit.Wrong();
                Shake(btn);
                Speak("Ça, c'est " + CName[ci] + ". Cherche le " + CName[target] + " !");
            }
        }

        // --- Petits effets. ---
        private static void Wobble(FrameworkElement el)
        {
            var sc = new ScaleTransform(1, 1);
            var rot = new RotateTransform(0);
            var grp = new TransformGroup();
            grp.Children.Add(sc);
            grp.Children.Add(rot);
            el.RenderTransform = grp;
            var pop = new DoubleAnimation(1, 1.22, TimeSpan.FromMilliseconds(260))
            { AutoReverse = true, EasingFunction = new SineEase() };
            sc.BeginAnimation(ScaleTransform.ScaleXProperty, pop);
            sc.BeginAnimation(ScaleTransform.ScaleYProperty, pop);
            var ra = new DoubleAnimationUsingKeyFrames { Duration = TimeSpan.FromMilliseconds(520) };
            ra.KeyFrames.Add(new LinearDoubleKeyFrame(-9, KeyTime.FromPercent(0.25)));
            ra.KeyFrames.Add(new LinearDoubleKeyFrame(8, KeyTime.FromPercent(0.6)));
            ra.KeyFrames.Add(new LinearDoubleKeyFrame(0, KeyTime.FromPercent(1)));
            rot.BeginAnimation(RotateTransform.AngleProperty, ra);
        }

        private void Splash(double cx, double cy, Color col)
        {
            var rng = new Random();
            for (int i = 0; i < 8; i++)
            {
                var d = new Ellipse
                {
                    Width = 12 + rng.Next(14),
                    Height = 12 + rng.Next(14),
                    Fill = new SolidColorBrush(col),
                    IsHitTestVisible = false,
                };
                d.SetValue(Panel.ZIndexProperty, 65);
                Canvas.SetLeft(d, cx - 8);
                Canvas.SetTop(d, cy - 8);
                _canvas.Children.Add(d);
                double ang = rng.NextDouble() * Math.PI * 2;
                double dist = 70 + rng.Next(90);
                var tt = new TranslateTransform();
                d.RenderTransform = tt;
                var dur = TimeSpan.FromMilliseconds(500 + rng.Next(350));
                tt.BeginAnimation(TranslateTransform.XProperty,
                    new DoubleAnimation(0, Math.Cos(ang) * dist, dur) { EasingFunction = new QuadraticEase { EasingMode = EasingMode.EaseOut } });
                tt.BeginAnimation(TranslateTransform.YProperty,
                    new DoubleAnimation(0, Math.Sin(ang) * dist, dur) { EasingFunction = new QuadraticEase { EasingMode = EasingMode.EaseOut } });
                var fade = new DoubleAnimation(1, 0, dur);
                var captured = d;
                fade.Completed += (s, e) => _canvas.Children.Remove(captured);
                d.BeginAnimation(UIElement.OpacityProperty, fade);
            }
        }

        private static TextBlock MakeDeco(string s, double x, double y, double size)
        {
            var t = new TextBlock { Text = s, FontSize = size, IsHitTestVisible = false };
            Canvas.SetLeft(t, x);
            Canvas.SetTop(t, y);
            return t;
        }

        private static string Cap(string s) => char.ToUpperInvariant(s[0]) + s.Substring(1);

        private static Color Lighten(Color c) => Color.FromRgb(
            (byte)(c.R + (255 - c.R) * 0.42), (byte)(c.G + (255 - c.G) * 0.42), (byte)(c.B + (255 - c.B) * 0.42));
    }
}
