using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Media.Effects;
using System.Windows.Shapes;
using System.Windows.Threading;
using MesPremiersJeux.Lib;

namespace MesPremiersJeux.Games
{
    /// <summary>
    /// « La maison des sons » (MS — phonologie, la fameuse « maison du son A »
    /// de l'école) : une grande maison colorée porte un son (AAA, OOO, III).
    /// Autour, des images : celles où l'on ENTEND le son vont dans la maison
    /// (elles y volent, la maison s'illumine) ; les autres font gentiment
    /// « non non » (« vélo ? On n'entend pas AAA dans vélo ! »). Le mot est
    /// toujours dit en ÉTIRANT le son (« chaaaat ! »). Zéro lecture.
    /// </summary>
    public sealed class SoundHouseGame : GameControl
    {
        private const double W = 1460, H = 660;

        private sealed class Round
        {
            public string Letter;        // « A »
            public string Sound;         // « aaa »
            public (string Emoji, string Word, string Stretched)[] Yes;
            public (string Emoji, string Word)[] No;
        }

        private static readonly Round[] Rounds =
        {
            new Round
            {
                Letter = "A", Sound = "aaa",
                Yes = new[] { ("🐱", "chat", "chaaaat"), ("🍌", "banane", "banaaaane"), ("🍍", "ananas", "anaaanaaas") },
                No = new[] { ("🚲", "vélo"), ("🐭", "souris"), ("🦉", "hibou") },
            },
            new Round
            {
                Letter = "O", Sound = "ooo",
                Yes = new[] { ("🏍️", "moto", "motooooo"), ("🤖", "robot", "robooooot"), ("🎂", "gâteau", "gâtoooooo") },
                No = new[] { ("🐱", "chat"), ("🍓", "fraise"), ("🐭", "souris") },
            },
            new Round
            {
                Letter = "I", Sound = "iii",
                Yes = new[] { ("🐭", "souris", "souriiiiis"), ("🥝", "kiwi", "kiwiiiii"), ("🐜", "fourmi", "fourmiiiii") },
                No = new[] { ("🐱", "chat"), ("🎂", "gâteau"), ("🚗", "voiture") },
            },
        };

        private readonly Random _rng = new Random();
        private Canvas _canvas;
        private int _roundIdx;
        private int _found;
        private Canvas _house;          // la maison vectorielle (null si image)
        private TextBlock _houseLetter;
        private double _doorX, _doorY;  // où volent les images gagnées
        private double _joyX, _joyY;    // d'où sortent les étoiles de joie

        public SoundHouseGame(Action celebrate) : base(celebrate) { }

        protected override void NewRound()
        {
            _roundIdx = 0;
            BuildRound();
        }

        private void BuildRound()
        {
            Locked = false;
            _found = 0;
            var r = Rounds[_roundIdx % Rounds.Length];

            Question.Text = "🏠 La maison du son " + r.Letter;
            SetConsigne(new TextBlock { Text = r.Letter, FontSize = 96, FontWeight = FontWeights.ExtraBold, Foreground = new SolidColorBrush(Color.FromRgb(0xA0, 0x6C, 0xD5)) },
                () => "C'est la maison du son " + r.Sound + " ! Trouve les images où tu ENTENDS " + r.Sound + " : elles entrent dans la maison !");

            _canvas = new Canvas { Width = W, Height = H, ClipToBounds = true };
            if (HouseImage() != null)
            {
                // Le dessin couvre TOUTE la scène, et la couleur de page
                // prolonge son ciel et son herbe : vrai plein écran, sans
                // bandes ni emojis de décor (moches en noir et blanc).
                SetPageBackground(new LinearGradientBrush(
                    Color.FromRgb(0x8F, 0xD1, 0xF2), Color.FromRgb(0x6E, 0xC4, 0x5E), 90));
            }
            else
            {
                SetPageBackground(new LinearGradientBrush(
                    Color.FromRgb(0xF1, 0xE6, 0xFF), Color.FromRgb(0xFF, 0xF2, 0xDC), 90));
                _canvas.Children.Add(new Rectangle
                {
                    Width = W,
                    Height = H,
                    Fill = new LinearGradientBrush(Color.FromRgb(0xF1, 0xE6, 0xFF), Color.FromRgb(0xFF, 0xF2, 0xDC), 90),
                });
            }

            BuildHouse(r);

            // Les 6 images autour de la maison (mélangées).
            var cards = new List<(string Emoji, string Word, string Stretched, bool Yes)>();
            foreach (var (e, w, st) in r.Yes) cards.Add((e, w, st, true));
            foreach (var (e, w) in r.No) cards.Add((e, w, null, false));
            cards = cards.OrderBy(c => _rng.Next()).ToList();

            double[] xs = { 90, 90, 340, 1080, 1250, 1250 };
            double[] ys = { 90, 360, 60, 60, 90, 360 };
            for (int i = 0; i < cards.Count; i++)
            {
                var c = cards[i];
                // Plus de carte blanche : le dessin vit directement dans la
                // scène, avec un halo blanc doux pour rester bien visible.
                var vis = Art.ForEmoji(c.Emoji, 150);
                vis.Effect = new DropShadowEffect
                { BlurRadius = 18, ShadowDepth = 0, Color = Colors.White, Opacity = 0.95 };
                var btn = SceneButton(vis, 170, 170);
                btn.RenderTransformOrigin = new Point(0.5, 0.5);
                var captured = btn;
                btn.Click += (s, e) => Pick(r, c.Emoji, c.Word, c.Stretched, c.Yes, captured);
                Canvas.SetLeft(btn, xs[i]);
                Canvas.SetTop(btn, ys[i]);
                _canvas.Children.Add(btn);
            }

            SetBody(_canvas);
            SpeakSlow("La maison du son " + r.Sound + " ! " + r.Sound + " ! Trouve les images où tu entends " + r.Sound + " !");
        }

        // La grande maison colorée, avec sa lettre et sa porte ouverte.
        private void BuildHouse(Round r)
        {
            // La maison DESSINÉE si l'image existe (maison-sons, embarquée) :
            // toute la scène, avec la lettre du son affichée dans la bulle.
            var img = HouseImage();
            if (img != null) { BuildHouseFromImage(r, img); return; }

            _doorX = W / 2 - 40; _doorY = 395;
            _joyX = W / 2 + 100; _joyY = 160;
            _house = new Canvas { Width = 380, Height = 400, RenderTransformOrigin = new Point(0.5, 1) };
            // Les murs.
            Add(_house, RectShape(Color.FromRgb(0xFF, 0xE2, 0x9A), 320, 230, 12), 30, 150);
            // Le toit.
            var roof = new Polygon
            {
                Points = new PointCollection { new Point(0, 160), new Point(190, 20), new Point(380, 160) },
                Fill = new SolidColorBrush(Color.FromRgb(0xE8, 0x5A, 0x6E)),
            };
            _house.Children.Add(roof);
            // La cheminée + fumée.
            Add(_house, RectShape(Color.FromRgb(0xC8, 0x6B, 0x3A), 40, 70, 6), 290, 55);
            var smoke = new TextBlock { Text = "💨", FontSize = 40, Opacity = 0.7 };
            Add(_house, smoke, 300, 5);
            var tt = new TranslateTransform();
            smoke.RenderTransform = tt;
            var drift = new DoubleAnimation(0, -24, TimeSpan.FromSeconds(2))
            { AutoReverse = true, RepeatBehavior = RepeatBehavior.Forever, EasingFunction = new SineEase { EasingMode = EasingMode.EaseInOut } };
            tt.BeginAnimation(TranslateTransform.YProperty, drift);
            // La porte grande ouverte.
            Add(_house, RectShape(Color.FromRgb(0x8A, 0x5A, 0x30), 110, 150, 10), 135, 230);
            Add(_house, RectShape(Color.FromRgb(0x5E, 0x3A, 0x1E), 90, 130, 8), 145, 250);
            // La LETTRE géante sur le toit, qui respire.
            _houseLetter = new TextBlock
            {
                Text = r.Letter,
                FontSize = 110,
                FontWeight = FontWeights.ExtraBold,
                Foreground = Brushes.White,
                RenderTransformOrigin = new Point(0.5, 0.5),
            };
            _houseLetter.RenderTransform = new ScaleTransform(1, 1);
            Add(_house, _houseLetter, 150, 30);
            var breathe = new DoubleAnimation(1, 1.12, TimeSpan.FromSeconds(1.4))
            { AutoReverse = true, RepeatBehavior = RepeatBehavior.Forever, EasingFunction = new SineEase { EasingMode = EasingMode.EaseInOut } };
            var sc = (ScaleTransform)_houseLetter.RenderTransform;
            sc.BeginAnimation(ScaleTransform.ScaleXProperty, breathe);
            sc.BeginAnimation(ScaleTransform.ScaleYProperty, breathe);
            // Les fenêtres.
            Add(_house, RectShape(Color.FromRgb(0xBF, 0xE3, 0xFF), 60, 60, 8), 60, 190);
            Add(_house, RectShape(Color.FromRgb(0xBF, 0xE3, 0xFF), 60, 60, 8), 265, 190);

            Canvas.SetLeft(_house, W / 2 - 190);
            Canvas.SetTop(_house, 120);
            _house.SetValue(Panel.ZIndexProperty, 30);
            _canvas.Children.Add(_house);

            // La maison fait entendre son son quand on la regarde.
            var hit = new Button
            {
                Background = Brushes.Transparent,
                BorderThickness = new Thickness(0),
                Opacity = 0,
                Width = 380,
                Height = 400,
            };
            hit.Click += (s, e) => { if (!Locked) SpeakSlow(r.Sound + " ! " + r.Sound + " !"); };
            Canvas.SetLeft(hit, W / 2 - 190);
            Canvas.SetTop(hit, 120);
            hit.SetValue(Panel.ZIndexProperty, 31);
            _canvas.Children.Add(hit);
        }

        // La première pose de la maison dessinée (maison-sons-1, animée) ou
        // l'image unique (maison-sons) — null si aucune.
        private static ImageSource HouseImage() =>
            Art.Find("maison-sons-1") ?? Art.Find("maison-sons");

        // Bouton transparent : la cible vit dans la scène, sans carte blanche.
        private static Button SceneButton(UIElement content, double w, double h)
        {
            var tpl = new ControlTemplate(typeof(Button));
            var border = new FrameworkElementFactory(typeof(Border));
            border.SetValue(Border.BackgroundProperty, Brushes.Transparent);
            var cp = new FrameworkElementFactory(typeof(ContentPresenter));
            cp.SetValue(FrameworkElement.HorizontalAlignmentProperty, HorizontalAlignment.Center);
            cp.SetValue(FrameworkElement.VerticalAlignmentProperty, VerticalAlignment.Center);
            border.AppendChild(cp);
            tpl.VisualTree = border;
            return new Button { Template = tpl, Width = w, Height = h, Focusable = false, Content = content };
        }

        // La maison DESSINÉE (image « maison-sons ») : elle couvre TOUTE la
        // largeur de la scène, calée en haut (le bas de l'herbe est rogné) ;
        // la lettre du son vit DANS LA BULLE au-dessus du toit, et la porte
        // rouge est la cible où volent les images gagnées. Les repères sont
        // des fractions mesurées sur le dessin.
        private void BuildHouseFromImage(Round r, ImageSource img)
        {
            _house = null;
            double ratio = img.Width / img.Height;
            double ih = W / ratio; // hauteur affichée (déborde en bas, rognée)
            var image = new Image { Source = img, Width = W, Height = ih, Stretch = Stretch.Uniform, IsHitTestVisible = false };
            Canvas.SetLeft(image, 0);
            Canvas.SetTop(image, 0);
            _canvas.Children.Add(image);

            // LA RESPIRATION : un très léger gonflement continu, ancré au sol —
            // fluide et sans à-coup (les poses, elles, ne changent que les
            // petits détails : notes, traits, confettis).
            image.RenderTransformOrigin = new Point(0.5, 1);
            var bsc = new ScaleTransform(1, 1);
            image.RenderTransform = bsc;
            var breath = new DoubleAnimation(1, 1.015, TimeSpan.FromSeconds(2.2))
            { AutoReverse = true, RepeatBehavior = RepeatBehavior.Forever, EasingFunction = new SineEase { EasingMode = EasingMode.EaseInOut } };
            bsc.BeginAnimation(ScaleTransform.ScaleXProperty, breath);
            bsc.BeginAnimation(ScaleTransform.ScaleYProperty, breath);

            // Les poses quasi identiques (maison-sons-1..N, murs LISSES — la
            // pose « froissée » a été écartée) alternent en aller-retour pour
            // animer notes, bulles et petits traits.
            var frames = new List<ImageSource>();
            for (int i = 1; i <= 8; i++)
            {
                var f = Art.Find("maison-sons-" + i);
                if (f == null) break;
                frames.Add(f);
            }
            if (frames.Count >= 2)
            {
                int step = 0;
                int cycle = Math.Max(2, 2 * frames.Count - 2);
                var beat = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(650) };
                beat.Tick += (s, e) =>
                {
                    if (!image.IsLoaded) { beat.Stop(); return; } // scène quittée
                    step++;
                    int k = step % cycle;
                    image.Source = frames[k < frames.Count ? k : cycle - k];
                };
                beat.Start();
            }

            _doorX = 0.525 * W - 50;
            _doorY = 0.66 * ih;
            _joyX = 0.27 * W;
            _joyY = 0.32 * ih;

            // La LETTRE géante dans la bulle, qui respire — la lettre-
            // PERSONNAGE dessinée si on l'a, sinon la grande lettre violette.
            double bw = 0.34 * W, bh = 0.24 * ih;
            FrameworkElement face;
            var limg = Art.Find("lettre-" + r.Letter);
            if (limg != null)
            {
                face = new Image
                {
                    Source = limg,
                    Stretch = Stretch.Uniform,
                    HorizontalAlignment = HorizontalAlignment.Center,
                    VerticalAlignment = VerticalAlignment.Center,
                };
                _houseLetter = null;
            }
            else
            {
                _houseLetter = new TextBlock
                {
                    Text = r.Letter,
                    FontSize = bh * 0.82,
                    FontWeight = FontWeights.ExtraBold,
                    Foreground = new SolidColorBrush(Color.FromRgb(0x7E, 0x3F, 0xF2)),
                    HorizontalAlignment = HorizontalAlignment.Center,
                    VerticalAlignment = VerticalAlignment.Center,
                };
                face = _houseLetter;
            }
            face.RenderTransformOrigin = new Point(0.5, 0.5);
            face.RenderTransform = new ScaleTransform(1, 1);
            var bubble = new Grid { Width = bw, Height = bh, IsHitTestVisible = false };
            bubble.Children.Add(face);
            Canvas.SetLeft(bubble, 0.482 * W - bw / 2);
            Canvas.SetTop(bubble, 0.162 * ih - bh / 2);
            bubble.SetValue(Panel.ZIndexProperty, 32);
            _canvas.Children.Add(bubble);
            var breathe = new DoubleAnimation(1, 1.12, TimeSpan.FromSeconds(1.4))
            { AutoReverse = true, RepeatBehavior = RepeatBehavior.Forever, EasingFunction = new SineEase { EasingMode = EasingMode.EaseInOut } };
            var lsc = (ScaleTransform)face.RenderTransform;
            lsc.BeginAnimation(ScaleTransform.ScaleXProperty, breathe);
            lsc.BeginAnimation(ScaleTransform.ScaleYProperty, breathe);

            // La maison fait entendre son son quand on la regarde (zone choisie
            // pour ne recouvrir aucune carte-réponse).
            var hit = new Button
            {
                Background = Brushes.Transparent,
                BorderThickness = new Thickness(0),
                Opacity = 0,
                Width = 0.40 * W,
                Height = 0.50 * ih,
            };
            hit.Click += (s, e) => { if (!Locked) SpeakSlow(r.Sound + " ! " + r.Sound + " !"); };
            Canvas.SetLeft(hit, 0.32 * W);
            Canvas.SetTop(hit, 0.30 * ih);
            hit.SetValue(Panel.ZIndexProperty, 31);
            _canvas.Children.Add(hit);
        }

        private void Pick(Round r, string emoji, string word, string stretched, bool yes, Button btn)
        {
            if (Locked) return;
            if (!yes)
            {
                Shake(btn);
                SpeakSlow(Cap(word) + "... " + word + " ! Non, on n'entend pas " + r.Sound + " dans " + word + " ! Cherche encore !");
                return;
            }

            btn.IsHitTestVisible = false;
            SpeakSlow(Cap(stretched) + " ! Oui ! On entend " + r.Sound + " ! Dans la maison !");

            // L'image vole dans la porte de la maison.
            var flying = Art.ForEmoji(emoji, 120);
            flying.IsHitTestVisible = false;
            flying.RenderTransformOrigin = new Point(0.5, 0.5);
            double x0 = Canvas.GetLeft(btn) + 35, y0 = Canvas.GetTop(btn) + 25;
            double x1 = _doorX, y1 = _doorY;
            Canvas.SetLeft(flying, x0);
            Canvas.SetTop(flying, y0);
            flying.SetValue(Panel.ZIndexProperty, 60);
            _canvas.Children.Add(flying);
            btn.Visibility = Visibility.Hidden;

            var sc = new ScaleTransform(1, 1);
            flying.RenderTransform = sc;
            var ax = new DoubleAnimation(x0, x1, TimeSpan.FromMilliseconds(900)) { BeginTime = TimeSpan.FromMilliseconds(1400), EasingFunction = new SineEase() };
            var ay = new DoubleAnimationUsingKeyFrames { Duration = TimeSpan.FromMilliseconds(900), BeginTime = TimeSpan.FromMilliseconds(1400) };
            ay.KeyFrames.Add(new SplineDoubleKeyFrame(Math.Min(y0, y1) - 120, KeyTime.FromPercent(0.5), new KeySpline(0.2, 0.8, 0.4, 1)));
            ay.KeyFrames.Add(new SplineDoubleKeyFrame(y1, KeyTime.FromPercent(1), new KeySpline(0.5, 0, 0.8, 1)));
            var shrink = new DoubleAnimation(1, 0.35, TimeSpan.FromMilliseconds(350)) { BeginTime = TimeSpan.FromMilliseconds(1950) };
            ay.Completed += (s, e) =>
            {
                _canvas.Children.Remove(flying);
                SoundFx.PopSound();
                HouseJoy();
                _found++;
                if (_found < r.Yes.Length) return;

                Locked = true;
                Schedule(700, () =>
                {
                    GameKit.Success();
                    Speak("La maison du " + r.Sound + " est pleine ! Bravo !");
                    Celebrate();
                    _roundIdx++;
                    if (_roundIdx >= Rounds.Length)
                    {
                        // Toutes les maisons sont pleines : LE PETIT TRAIN DES
                        // SONS prend le relais (début ou fin du mot ?).
                        Schedule(2600, () =>
                        {
                            Speak("Bravo ! Maintenant, le petit train des sons !");
                            _trainIdx = 0;
                            Schedule(2600, BuildTrain);
                        });
                    }
                    else Schedule(2800, BuildRound);
                });
            };
            flying.BeginAnimation(Canvas.LeftProperty, ax);
            flying.BeginAnimation(Canvas.TopProperty, ay);
            sc.BeginAnimation(ScaleTransform.ScaleXProperty, shrink);
            sc.BeginAnimation(ScaleTransform.ScaleYProperty, shrink);
        }

        // ------------------------------------------------------------------
        //  LE PETIT TRAIN DES SONS : « tu entends le son au DÉBUT ou à la
        //  FIN du mot ? » (localiser un son — droit du programme MS).
        // ------------------------------------------------------------------
        private int _trainIdx;

        private static readonly (string Emoji, string Word, string Sound, bool AtStart, string Stretched)[] TrainWords =
        {
            ("🍍", "ananas", "aaa", true, "AAA... nanas"),
            ("🌳", "arbre", "aaa", true, "AAAARbre"),
            ("🍫", "chocolat", "aaa", false, "chocol... AAAA"),
            ("🐨", "koala", "aaa", false, "koal... AAAA"),
            ("🏝️", "île", "iii", true, "IIIIle"),
            ("🐭", "souris", "iii", false, "sour... IIII"),
            ("🥝", "kiwi", "iii", false, "kiw... IIII"),
            ("🤖", "robot", "ooo", false, "rob... OOOO"),
        };

        private void BuildTrain()
        {
            Locked = false;
            var w = TrainWords[_rng.Next(TrainWords.Length)];

            Question.Text = "🚂 Où est le son " + w.Sound + " ?";
            SetConsigne(Art.ForEmoji(w.Emoji, 110),
                () => Cap(w.Word) + " ! Tu entends " + w.Sound + " au DÉBUT du mot, comme la locomotive ? " +
                      "Ou à la FIN, comme le dernier wagon ?");

            _canvas = new Canvas { Width = W, Height = H };
            SetPageBackground(new LinearGradientBrush(
                Color.FromRgb(0xE8, 0xF0, 0xFF), Color.FromRgb(0xEA, 0xF8, 0xEE), 90));
            _canvas.Children.Add(new Rectangle
            {
                Width = W,
                Height = H,
                Fill = new LinearGradientBrush(Color.FromRgb(0xE8, 0xF0, 0xFF), Color.FromRgb(0xEA, 0xF8, 0xEE), 90),
            });
            AddDecor("⛰️", 40, 50, 90);
            AddDecor("🌳", W - 170, 60, 90);

            // Le mot en grand, au centre-haut, qui se balance.
            var big = Art.ForEmoji(w.Emoji, 190);
            big.IsHitTestVisible = false;
            big.RenderTransformOrigin = new Point(0.5, 0);
            var sway = new RotateTransform(0);
            big.RenderTransform = sway;
            Canvas.SetLeft(big, W / 2 - 95);
            Canvas.SetTop(big, 40);
            _canvas.Children.Add(big);
            sway.BeginAnimation(RotateTransform.AngleProperty,
                new DoubleAnimation(-7, 7, TimeSpan.FromSeconds(1.6))
                { AutoReverse = true, RepeatBehavior = RepeatBehavior.Forever, EasingFunction = new SineEase { EasingMode = EasingMode.EaseInOut } });

            // Les rails.
            var rail = new Rectangle { Width = W - 160, Height = 10, RadiusX = 5, RadiusY = 5, Fill = new SolidColorBrush(Color.FromRgb(0x8A, 0x7A, 0x6A)) };
            Canvas.SetLeft(rail, 80);
            Canvas.SetTop(rail, 500);
            _canvas.Children.Add(rail);

            // La LOCOMOTIVE (= début) et le DERNIER WAGON (= fin), nos boutons.
            var loco = new Button
            {
                Style = (Style)Application.Current.Resources["AnswerButton"],
                Width = 300,
                Height = 220,
                Content = new StackPanel
                {
                    Children =
                    {
                        Art.Visual("locomotive", "🚂", 140),
                        new TextBlock { Text = "au DÉBUT", FontSize = 28, FontWeight = FontWeights.Bold,
                            Foreground = new SolidColorBrush(Color.FromRgb(0x2A, 0x5A, 0x3A)), HorizontalAlignment = HorizontalAlignment.Center },
                    },
                },
            };
            var wagon = new Button
            {
                Style = (Style)Application.Current.Resources["AnswerButton"],
                Width = 300,
                Height = 220,
                Content = new StackPanel
                {
                    Children =
                    {
                        Art.Visual("wagon-3", "🚃🚩", 140),
                        new TextBlock { Text = "à la FIN", FontSize = 28, FontWeight = FontWeights.Bold,
                            Foreground = new SolidColorBrush(Color.FromRgb(0x8A, 0x1F, 0x33)), HorizontalAlignment = HorizontalAlignment.Center },
                    },
                },
            };
            void Answer(bool saidStart, Button btn)
            {
                if (Locked) return;
                if (saidStart == w.AtStart)
                {
                    Locked = true;
                    GameKit.Success();
                    SoundFx.Whistle();
                    SpeakSlow(w.Stretched + " ! Oui ! Le son " + w.Sound + " est " +
                                   (w.AtStart ? "au DÉBUT" : "à la FIN") + " du mot ! Bravo !");
                    Celebrate();
                    _trainIdx++;
                    if (_trainIdx >= 4)
                    {
                        Schedule(3200, () =>
                        {
                            Speak("Bravo ! Quelles bonnes oreilles !");
                            Schedule(3000, NewRound);
                        });
                    }
                    else Schedule(3200, BuildTrain);
                }
                else
                {
                    Shake(btn);
                    SpeakSlow("Écoute encore : " + w.Stretched + " ! Où entends-tu " + w.Sound + " ?");
                }
            }
            loco.Click += (s, e) => Answer(true, loco);
            wagon.Click += (s, e) => Answer(false, wagon);
            Canvas.SetLeft(loco, 240);
            Canvas.SetTop(loco, 290);
            Canvas.SetLeft(wagon, W - 540);
            Canvas.SetTop(wagon, 290);
            _canvas.Children.Add(loco);
            _canvas.Children.Add(wagon);

            SetBody(_canvas);
            SpeakSlow(Cap(w.Stretched) + " ! Tu entends " + w.Sound + " au début, ou à la fin ?");
        }

        // La maison sautille de joie et des étoiles sortent de la cheminée.
        private void HouseJoy()
        {
            if (_house != null)
            {
                var sc = new ScaleTransform(1, 1);
                _house.RenderTransform = sc;
                var hop = new DoubleAnimation(1, 1.06, TimeSpan.FromMilliseconds(180))
                { AutoReverse = true, EasingFunction = new SineEase() };
                sc.BeginAnimation(ScaleTransform.ScaleXProperty, hop);
                sc.BeginAnimation(ScaleTransform.ScaleYProperty, hop);
            }
            for (int i = 0; i < 4; i++)
            {
                var star = new TextBlock { Text = "✨", FontSize = 30, IsHitTestVisible = false };
                Canvas.SetLeft(star, _joyX + _rng.Next(60));
                Canvas.SetTop(star, _joyY);
                star.SetValue(Panel.ZIndexProperty, 65);
                _canvas.Children.Add(star);
                var up = new DoubleAnimation(_joyY, _joyY - 100 - i * 16, TimeSpan.FromMilliseconds(900))
                { BeginTime = TimeSpan.FromMilliseconds(i * 120), EasingFunction = new SineEase { EasingMode = EasingMode.EaseOut } };
                var fade = new DoubleAnimation(1, 0, TimeSpan.FromMilliseconds(900)) { BeginTime = TimeSpan.FromMilliseconds(i * 120) };
                var captured = star;
                fade.Completed += (s, e) => _canvas.Children.Remove(captured);
                star.BeginAnimation(Canvas.TopProperty, up);
                star.BeginAnimation(OpacityProperty, fade);
            }
        }

        private static Rectangle RectShape(Color c, double w, double h, double r) =>
            new Rectangle { Width = w, Height = h, RadiusX = r, RadiusY = r, Fill = new SolidColorBrush(c) };

        private static void Add(Canvas c, FrameworkElement el, double x, double y)
        {
            Canvas.SetLeft(el, x);
            Canvas.SetTop(el, y);
            c.Children.Add(el);
        }

        private void AddDecor(string emoji, double x, double y, double size)
        {
            var t = new TextBlock { Text = emoji, FontSize = size, IsHitTestVisible = false };
            Canvas.SetLeft(t, x);
            Canvas.SetTop(t, y);
            _canvas.Children.Add(t);
        }

        private static string Cap(string s) => char.ToUpperInvariant(s[0]) + s.Substring(1);
    }
}
