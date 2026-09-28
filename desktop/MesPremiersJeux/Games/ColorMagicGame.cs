using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Media.Imaging;
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
        private Canvas _cauldronGroup;
        private RotateTransform _cauldronWobble;
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
            g.Children.Add(new Ellipse // deuxième goutte, de l'autre côté
            {
                Width = size * 0.08,
                Height = size * 0.13,
                Fill = new SolidColorBrush(CVal[ci]),
                VerticalAlignment = VerticalAlignment.Top,
                HorizontalAlignment = HorizontalAlignment.Right,
                Margin = new Thickness(0, size * 0.5, size * 0.24, 0),
            });
            g.Children.Add(new Border // étiquette colorée collée sur le pot
            {
                Width = size * 0.34,
                Height = size * 0.18,
                CornerRadius = new CornerRadius(8),
                Background = new SolidColorBrush(CVal[ci]),
                BorderBrush = Brushes.White,
                BorderThickness = new Thickness(3),
                VerticalAlignment = VerticalAlignment.Bottom,
                HorizontalAlignment = HorizontalAlignment.Center,
                Margin = new Thickness(0, 0, 0, size * 0.12),
            });
            g.Children.Add(new TextBlock // le pinceau qui dépasse
            {
                Text = "🖌",
                FontSize = size * 0.34,
                RenderTransformOrigin = new Point(0.5, 0.5),
                RenderTransform = new RotateTransform(38),
                HorizontalAlignment = HorizontalAlignment.Right,
                VerticalAlignment = VerticalAlignment.Top,
                Margin = new Thickness(0, 0, size * 0.02, 0),
            });
            return g;
        }

        // Grande tache de peinture (le pot « déjà découvert ») : celui-là est fait !
        private Grid SplatVisual(int ci, double size)
        {
            var g = new Grid { Width = size, Height = size };
            var col = CVal[ci];
            void Blob(double w, double h, double x, double y) => g.Children.Add(new Ellipse
            {
                Width = w,
                Height = h,
                Fill = new SolidColorBrush(col),
                HorizontalAlignment = HorizontalAlignment.Left,
                VerticalAlignment = VerticalAlignment.Top,
                Margin = new Thickness(x, y, 0, 0),
            });
            Blob(size * 0.62, size * 0.46, size * 0.19, size * 0.27);
            Blob(size * 0.2, size * 0.16, size * 0.06, size * 0.18);
            Blob(size * 0.16, size * 0.13, size * 0.74, size * 0.2);
            Blob(size * 0.15, size * 0.12, size * 0.14, size * 0.66);
            Blob(size * 0.19, size * 0.15, size * 0.66, size * 0.62);
            Blob(size * 0.1, size * 0.09, size * 0.46, size * 0.1);
            g.Children.Add(new TextBlock
            {
                Text = "⭐",
                FontSize = size * 0.24,
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
            });
            return g;
        }

        // Silhouette grise d'un emoji (pour « colorier » l'objet une fois trouvé).
        private static UIElement EmojiSilhouette(string emoji, double size)
        {
            var host = new Grid { Width = size, Height = size };
            host.Children.Add(new TextBlock
            {
                Text = emoji,
                FontSize = size * 0.72,
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
            });
            host.Measure(new Size(size, size));
            host.Arrange(new Rect(0, 0, size, size));
            int px = Math.Max(1, (int)size);
            var rtb = new RenderTargetBitmap(px, px, 96, 96, PixelFormats.Pbgra32);
            rtb.Render(host);
            return new Rectangle
            {
                Width = size,
                Height = size,
                Fill = new SolidColorBrush(Color.FromRgb(0x9A, 0x9A, 0xA8)),
                OpacityMask = new ImageBrush(rtb) { Stretch = Stretch.Uniform },
            };
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

            var speaker = SpeakerButton(() => "Regarde chaque pot pour le renverser et entendre sa couleur ! Renverse-les tous !");
            Canvas.SetLeft(speaker, W - 150);
            Canvas.SetTop(speaker, 40);
            _canvas.Children.Add(speaker);

            SetBody(_canvas);
            Schedule(450, () => Speak("La potion des couleurs ! Regarde chaque pot de peinture pour le renverser !"));
        }

        private void DiscoverPot(Button btn, int ci)
        {
            if (_phase != 1 || Locked || _seen[ci]) return;
            _seen[ci] = true;
            Speak(Cap(CName[ci]) + " !");
            double cx = Canvas.GetLeft(btn) + btn.Width / 2, cy = Canvas.GetTop(btn) + btn.Height / 2;
            Splash(cx, cy, CVal[ci]);
            Splash(cx - 30, cy + 20, CVal[ci]);
            Wobble(btn);

            // Le pot renversé devient une GRANDE tache de peinture ⭐ : on voit
            // ceux qui sont faits, et le jeu se termine quand tout est renversé.
            btn.IsEnabled = false;
            Schedule(430, () => btn.Content = SplatVisual(ci, btn.Width * 0.94));

            if (_seen.All(v => v))
            {
                _phase = 0;
                Locked = true;
                Speak("Bravo, tu as renversé tous les pots ! Et maintenant... le chaudron magique !");
                Schedule(3000, () => { _mixRound = 0; StartMixRound(); });
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

            // Le chaudron (construit pièce par pièce, avec son feu et sa cuillère).
            BuildCauldron();

            var speaker = SpeakerButton(() => "Regarde les deux pots pour les verser dans le chaudron magique !");
            Canvas.SetLeft(speaker, W - 150);
            Canvas.SetTop(speaker, 40);
            _canvas.Children.Add(speaker);

            SetBody(_canvas);
            Schedule(400, () => Speak("Verse le " + CName[a] + " et le " + CName[b] + " dans le chaudron ! Regarde un pot pour le verser !"));
        }

        // Un VRAI chaudron de sorcière : pieds, ventre bombé avec reflet, anses,
        // rebord, potion, cuillère en bois et feu qui crépite dessous.
        private void BuildCauldron()
        {
            _cauldronCenter = new Point(W / 2, 430);
            var cg = new Canvas { Width = 380, Height = 330, IsHitTestVisible = false };
            _cauldronGroup = cg;
            _cauldronWobble = new RotateTransform(0);
            cg.RenderTransformOrigin = new Point(0.5, 0.6);
            cg.RenderTransform = _cauldronWobble;
            Canvas.SetLeft(cg, _cauldronCenter.X - 190);
            Canvas.SetTop(cg, _cauldronCenter.Y - 165);
            _canvas.Children.Add(cg);

            void Put(UIElement el, double x, double y)
            {
                Canvas.SetLeft(el, x);
                Canvas.SetTop(el, y);
                cg.Children.Add(el);
            }

            var iron = new SolidColorBrush(Color.FromRgb(0x14, 0x14, 0x1E));
            // Pieds.
            Put(new Border { Width = 30, Height = 46, CornerRadius = new CornerRadius(8), Background = new SolidColorBrush(Color.FromRgb(0x1C, 0x1C, 0x28)) }, 96, 250);
            Put(new Border { Width = 30, Height = 46, CornerRadius = new CornerRadius(8), Background = new SolidColorBrush(Color.FromRgb(0x1C, 0x1C, 0x28)) }, 254, 250);
            // Anses.
            Put(new Ellipse { Width = 36, Height = 54, Stroke = iron, StrokeThickness = 7 }, 4, 116);
            Put(new Ellipse { Width = 36, Height = 54, Stroke = iron, StrokeThickness = 7 }, 340, 116);
            // Ventre bombé.
            Put(new Ellipse
            {
                Width = 310,
                Height = 200,
                Fill = new RadialGradientBrush(Color.FromRgb(0x5A, 0x5A, 0x74), Color.FromRgb(0x20, 0x20, 0x2E))
                { GradientOrigin = new Point(0.3, 0.25), Center = new Point(0.3, 0.25) },
                Stroke = iron,
                StrokeThickness = 5,
            }, 35, 68);
            // Reflet.
            Put(new Ellipse { Width = 74, Height = 42, Fill = new SolidColorBrush(Color.FromArgb(0x30, 0xFF, 0xFF, 0xFF)) }, 78, 98);
            // Rebord.
            Put(new Ellipse
            {
                Width = 300,
                Height = 74,
                Fill = new SolidColorBrush(Color.FromRgb(0x2A, 0x2A, 0x3A)),
                Stroke = iron,
                StrokeThickness = 5,
            }, 40, 40);
            // La potion.
            _cauldronFill = new Ellipse { Width = 258, Height = 54, Fill = new SolidColorBrush(Color.FromRgb(0x6E, 0x6E, 0x84)) };
            Put(_cauldronFill, 61, 50);
            // Cuillère en bois.
            Put(new TextBlock
            {
                Text = "🥄",
                FontSize = 48,
                RenderTransformOrigin = new Point(0.5, 0.9),
                RenderTransform = new RotateTransform(-35),
            }, 258, 2);
            // Le feu et des étincelles.
            Put(new TextBlock { Text = "🔥", FontSize = 54 }, 118, 264);
            Put(new TextBlock { Text = "🔥", FontSize = 40 }, 194, 278);
            Put(new TextBlock { Text = "✨", FontSize = 24 }, 18, 28);
            Put(new TextBlock { Text = "✨", FontSize = 20 }, 336, 44);
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
            var ay = new DoubleAnimation(sy, _cauldronCenter.Y - 95, TimeSpan.FromMilliseconds(620))
            { EasingFunction = new QuadraticEase { EasingMode = EasingMode.EaseIn } };
            ay.Completed += (s, e) =>
            {
                _canvas.Children.Remove(drop);
                Splash(_cauldronCenter.X, _cauldronCenter.Y - 85, CVal[ci]);
                if (_pouredA && _pouredB) { Locked = true; Schedule(700, RevealMix); }
                else
                {
                    // Première couleur versée : la potion la prend tout de suite.
                    _cauldronFill.Fill = new RadialGradientBrush(Lighten(CVal[ci]), CVal[ci]);
                    Speak("La potion devient " + CName[ci] + " ! Verse l'autre pot !");
                }
            };
            drop.BeginAnimation(Canvas.LeftProperty, ax);
            drop.BeginAnimation(Canvas.TopProperty, ay);
        }

        private void RevealMix()
        {
            var (a, b, r) = Mixes[_mixRound];

            // 1) On MÉLANGE longuement : la potion devient bicolore, le chaudron
            //    remue, des bulles des deux couleurs montent — l'enfant voit le
            //    mélange se préparer.
            _cauldronFill.Fill = new LinearGradientBrush(CVal[a], CVal[b], 0);
            Speak("On mélange, on mélange ! Touille, touille, touille !");
            var wob = new DoubleAnimationUsingKeyFrames
            { Duration = TimeSpan.FromMilliseconds(620), RepeatBehavior = new RepeatBehavior(4) };
            wob.KeyFrames.Add(new LinearDoubleKeyFrame(-5, KeyTime.FromPercent(0.25)));
            wob.KeyFrames.Add(new LinearDoubleKeyFrame(5, KeyTime.FromPercent(0.75)));
            wob.KeyFrames.Add(new LinearDoubleKeyFrame(0, KeyTime.FromPercent(1)));
            _cauldronWobble.BeginAnimation(RotateTransform.AngleProperty, wob);
            for (int i = 0; i < 10; i++)
                Bubble(i % 2 == 0 ? CVal[a] : CVal[b], i * 240);

            Schedule(3000, () =>
            {
                // 2) L'ÉCLAIR magique : flash blanc, et la potion prend la
                //    nouvelle couleur dans une gerbe d'éclaboussures.
                GameKit.Success();
                var flash = new Ellipse
                {
                    Width = 380,
                    Height = 260,
                    Fill = new RadialGradientBrush(Color.FromArgb(0xEE, 0xFF, 0xFF, 0xFF), Color.FromArgb(0x00, 0xFF, 0xFF, 0xFF)),
                    IsHitTestVisible = false,
                };
                Canvas.SetLeft(flash, _cauldronCenter.X - 190);
                Canvas.SetTop(flash, _cauldronCenter.Y - 210);
                flash.SetValue(Panel.ZIndexProperty, 80);
                _canvas.Children.Add(flash);
                var fout = new DoubleAnimation(1, 0, TimeSpan.FromMilliseconds(700));
                var captured = flash;
                fout.Completed += (s2, e2) => _canvas.Children.Remove(captured);
                flash.BeginAnimation(UIElement.OpacityProperty, fout);

                _cauldronFill.Fill = new RadialGradientBrush(Lighten(CVal[r]), CVal[r]);
                Splash(_cauldronCenter.X, _cauldronCenter.Y - 85, CVal[r]);
                Splash(_cauldronCenter.X - 70, _cauldronCenter.Y - 60, CVal[r]);
                Splash(_cauldronCenter.X + 70, _cauldronCenter.Y - 60, CVal[r]);

                Schedule(700, () => BigReveal(a, b, r));
            });
        }

        // 3) La GRANDE révélation : une énorme bulle de la couleur nouvelle qui
        //    « respire », le nom dit lentement, et ses objets qui apparaissent
        //    un à un — on a le temps de bien la voir.
        private void BigReveal(int a, int b, int r)
        {
            var blob = new Ellipse
            {
                Width = 250,
                Height = 250,
                Fill = new RadialGradientBrush(Lighten(CVal[r]), CVal[r])
                { GradientOrigin = new Point(0.35, 0.3), Center = new Point(0.35, 0.3) },
                Stroke = Brushes.White,
                StrokeThickness = 7,
                RenderTransformOrigin = new Point(0.5, 0.5),
                IsHitTestVisible = false,
            };
            var sc = new ScaleTransform(0.15, 0.15);
            blob.RenderTransform = sc;
            double bx = _cauldronCenter.X, by = 190;
            Canvas.SetLeft(blob, bx - 125);
            Canvas.SetTop(blob, by - 125);
            blob.SetValue(Panel.ZIndexProperty, 85);
            _canvas.Children.Add(blob);
            var pop = new DoubleAnimation(0.15, 1, TimeSpan.FromMilliseconds(900))
            { EasingFunction = new BackEase { EasingMode = EasingMode.EaseOut, Amplitude = 0.6 } };
            pop.Completed += (s, e) =>
            {
                var breathe = new DoubleAnimation(1, 1.09, TimeSpan.FromMilliseconds(650))
                { AutoReverse = true, RepeatBehavior = RepeatBehavior.Forever, EasingFunction = new SineEase() };
                sc.BeginAnimation(ScaleTransform.ScaleXProperty, breathe);
                sc.BeginAnimation(ScaleTransform.ScaleYProperty, breathe);
            };
            sc.BeginAnimation(ScaleTransform.ScaleXProperty, pop);
            sc.BeginAnimation(ScaleTransform.ScaleYProperty, pop);

            Speak("Abracadabra ! " + Cap(CName[a]) + "... et " + CName[b] + "... ça fait... " + CName[r] + " !");
            RewardStore.Add();

            // Les objets de cette couleur apparaissent un à un autour de la bulle.
            for (int i = 0; i < CObjs[r].Length; i++)
            {
                var obj = new TextBlock
                {
                    Text = CObjs[r][i],
                    FontSize = 84,
                    IsHitTestVisible = false,
                    RenderTransformOrigin = new Point(0.5, 0.5),
                    Opacity = 0,
                };
                var osc = new ScaleTransform(0.2, 0.2);
                obj.RenderTransform = osc;
                double ang = -Math.PI / 2 + (i - 1) * 1.05;
                Canvas.SetLeft(obj, bx + Math.Cos(ang) * 250 - 42);
                Canvas.SetTop(obj, by + Math.Sin(ang) * 190 - 42 + 60);
                obj.SetValue(Panel.ZIndexProperty, 85);
                _canvas.Children.Add(obj);
                var delay = TimeSpan.FromMilliseconds(1600 + i * 450);
                obj.BeginAnimation(UIElement.OpacityProperty,
                    new DoubleAnimation(0, 1, TimeSpan.FromMilliseconds(260)) { BeginTime = delay });
                var opop = new DoubleAnimation(0.2, 1, TimeSpan.FromMilliseconds(430))
                { BeginTime = delay, EasingFunction = new BackEase { EasingMode = EasingMode.EaseOut, Amplitude = 0.8 } };
                osc.BeginAnimation(ScaleTransform.ScaleXProperty, opop);
                osc.BeginAnimation(ScaleTransform.ScaleYProperty, opop);
            }

            _mixRound++;
            Schedule(5400, StartMixRound);
        }

        // Une bulle colorée qui monte de la potion puis s'évanouit.
        private void Bubble(Color col, int delayMs)
        {
            var bub = new Ellipse
            {
                Width = 16 + GameKit.RandInt(16),
                Height = 16 + GameKit.RandInt(16),
                Fill = new SolidColorBrush(Color.FromArgb(0xCC, col.R, col.G, col.B)),
                Stroke = Brushes.White,
                StrokeThickness = 2,
                IsHitTestVisible = false,
            };
            Canvas.SetLeft(bub, _cauldronCenter.X - 70 + GameKit.RandInt(140));
            Canvas.SetTop(bub, _cauldronCenter.Y - 95);
            bub.SetValue(Panel.ZIndexProperty, 75);
            _canvas.Children.Add(bub);
            var t0 = TimeSpan.FromMilliseconds(delayMs);
            var tt = new TranslateTransform();
            bub.RenderTransform = tt;
            var dur = TimeSpan.FromMilliseconds(900 + GameKit.RandInt(400));
            tt.BeginAnimation(TranslateTransform.YProperty,
                new DoubleAnimation(0, -110 - GameKit.RandInt(70), dur)
                { BeginTime = t0, EasingFunction = new QuadraticEase { EasingMode = EasingMode.EaseOut } });
            var fade = new DoubleAnimation(1, 0, dur) { BeginTime = t0 };
            var captured = bub;
            fade.Completed += (s, e) => _canvas.Children.Remove(captured);
            bub.BeginAnimation(UIElement.OpacityProperty, fade);
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
                string emoji = GameKit.Rand(CObjs[ci].ToList());

                // L'objet a « perdu sa couleur » : silhouette grise. Bien choisi,
                // il sera COLORIÉ (la version en couleurs apparaît en dessous).
                var colored = new TextBlock
                {
                    Text = emoji,
                    FontSize = 132,
                    HorizontalAlignment = HorizontalAlignment.Center,
                    VerticalAlignment = VerticalAlignment.Center,
                    Opacity = 0,
                    RenderTransformOrigin = new Point(0.5, 0.5),
                };
                var silhouette = EmojiSilhouette(emoji, 190);
                var layers = new Grid();
                layers.Children.Add(colored);
                layers.Children.Add(silhouette);

                var btn = new Button
                {
                    Style = (Style)Application.Current.Resources["AnswerButton"],
                    Width = size,
                    Height = size,
                    Content = layers,
                };
                int captured = ci;
                var captBtn = btn;
                var captSil = silhouette;
                var captCol = colored;
                btn.Click += (s, e) => PickObject(captBtn, captured, spoken, captSil, captCol);
                Canvas.SetLeft(btn, x0 + i * (size + gap));
                Canvas.SetTop(btn, y);
                _canvas.Children.Add(btn);
            }

            SetBody(_canvas);
            Schedule(400, () => Speak("Oh, les objets ont perdu leurs couleurs ! Trouve celui qui est " + CName[target] + ", et colorie-le !"));
        }

        private void PickObject(Button btn, int ci, int target, UIElement silhouette, TextBlock colored)
        {
            if (_phase != 3 || Locked) return;
            double cx = Canvas.GetLeft(btn) + btn.Width / 2, cy = Canvas.GetTop(btn) + btn.Height / 2;
            if (ci == target)
            {
                Locked = true;
                GameKit.Success();

                // On COLORIE l'objet : la silhouette grise s'efface, la version en
                // couleurs surgit dans une gerbe de peinture.
                silhouette.Visibility = Visibility.Collapsed;
                colored.Opacity = 1;
                var sc = new ScaleTransform(0.3, 0.3);
                colored.RenderTransform = sc;
                var pop = new DoubleAnimation(0.3, 1, TimeSpan.FromMilliseconds(480))
                { EasingFunction = new BackEase { EasingMode = EasingMode.EaseOut, Amplitude = 0.8 } };
                sc.BeginAnimation(ScaleTransform.ScaleXProperty, pop);
                sc.BeginAnimation(ScaleTransform.ScaleYProperty, pop);
                Splash(cx, cy, CVal[target]);
                Splash(cx + 40, cy - 30, CVal[target]);

                Speak("Et voilà, tout colorié en " + CName[target] + " ! " + GameKit.Praise());
                _findRound++;
                Schedule(2300, NextFind);
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
