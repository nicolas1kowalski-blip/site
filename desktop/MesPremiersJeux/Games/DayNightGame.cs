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
    /// « Jour et nuit » (PS/MS) : pourquoi fait-il nuit ? Un paysage dont le
    /// CIEL CHANGE DE COULEUR en direct (animation des couleurs du dégradé) :
    /// regarder le Soleil fait venir le jour (cocorico, oiseaux), regarder la
    /// Lune fait venir la nuit (étoiles qui s'allument, hibou, dodo 💤). Puis
    /// la Terre qui tourne explique tout, on apprend les formes de la Lune
    /// (pleine, croissant…) et on trie : « quand est-ce qu'on dort ? ».
    /// </summary>
    public sealed class DayNightGame : GameControl
    {
        private const double W = 1500, H = 680;

        private readonly Random _rng = new Random();
        private Canvas _canvas;
        private GradientStop _skyTop, _skyBottom;
        private readonly List<TextBlock> _stars = new List<TextBlock>();
        private TextBlock _zzz;
        // Le paysage DESSINÉ (scene-jour / -coucher / -soir / -nuit) : 4 calques
        // superposés que l'on fond l'un dans l'autre — un vrai coucher de soleil.
        private Image[] _scene;
        private SolidColorBrush _page;
        private bool _sawDay, _sawNight;
        private int _round;
        private int _act;

        public DayNightGame(Action celebrate) : base(celebrate) { }

        protected override void NewRound()
        {
            _act = 1;
            _round = 0;
            _sawDay = _sawNight = false;
            BuildScene();
        }

        // ------------------------------------------------------------------
        //  Acte 1 : le paysage magique (le ciel change de couleur)
        // ------------------------------------------------------------------
        private void BuildScene()
        {
            Locked = false;
            Question.Text = "🌙 Jour et nuit";
            SetConsigne(new TextBlock { Text = "🌞🌙" },
                () => "Regarde le Soleil pour faire venir le JOUR... et la Lune pour faire venir la NUIT ! Essaie les deux !");

            _canvas = new Canvas { Width = W, Height = H };

            // Le ciel : un dégradé dont on ANIME les couleurs (jour ↔ nuit).
            _skyTop = new GradientStop(Color.FromRgb(0x8A, 0xC8, 0xFF), 0);
            _skyBottom = new GradientStop(Color.FromRgb(0xE8, 0xF4, 0xFF), 1);
            var sky = new Rectangle
            {
                Width = W,
                Height = H,
                RadiusX = 26,
                RadiusY = 26,
                Fill = new LinearGradientBrush { StartPoint = new Point(0, 0), EndPoint = new Point(0, 1), GradientStops = { _skyTop, _skyBottom } },
            };
            _canvas.Children.Add(sky);
            _canvas.ClipToBounds = true;
            _page = new SolidColorBrush(Color.FromRgb(0x8A, 0xC8, 0xFF));
            SetPageBackground(_page); // le ciel continue jusqu'aux bords de l'écran
            _stars.Clear();
            _scene = PaintedScene();
            bool painted = _scene != null;

            // Les étoiles (invisibles le jour, elles s'allument la nuit) — le
            // dessin de nuit a déjà les siennes.
            for (int i = 0; i < (painted ? 0 : 26); i++)
            {
                var star = new TextBlock
                {
                    Text = "✦",
                    FontSize = 12 + _rng.Next(16),
                    Foreground = new SolidColorBrush(Color.FromRgb(0xFF, 0xF2, 0xC4)),
                    Opacity = 0,
                    IsHitTestVisible = false,
                };
                Canvas.SetLeft(star, _rng.NextDouble() * (W - 40));
                Canvas.SetTop(star, _rng.NextDouble() * (H * 0.5));
                _canvas.Children.Add(star);
                _stars.Add(star);
            }

            // Le paysage : collines, maison, arbre (sans dessin seulement).
            if (!painted) AddVectorLandscape();
            _zzz = new TextBlock { Text = "💤", FontSize = 60, Opacity = 0, IsHitTestVisible = false };
            Canvas.SetLeft(_zzz, painted ? 975 : W / 2 + 40);   // près de la cheminée
            Canvas.SetTop(_zzz, painted ? 120 : H - 360);
            _canvas.Children.Add(_zzz);

            // Le SOLEIL et la LUNE — nos deux boutons. Sur le paysage dessiné,
            // ils se posent EXACTEMENT sur le soleil et la lune du dessin :
            // jamais deux soleils ni deux lunes, et toujours visibles.
            var sun = SceneButton(SunVisual(250), 270, 270);
            sun.Click += (s, e) => { if (!Locked) GoDay(); };
            Canvas.SetLeft(sun, painted ? 356 - 135 : 60);
            Canvas.SetTop(sun, painted ? 177 - 135 : 30);
            _canvas.Children.Add(sun);
            Bob(sun, 0);

            var moon = SceneButton(MoonVisual(painted ? 215 : 230, full: true), 240, 240);
            moon.Click += (s, e) => { if (!Locked) GoNight(); };
            Canvas.SetLeft(moon, painted ? 1287 - 120 : W - 320);
            Canvas.SetTop(moon, painted ? 122 - 120 + 6 : 30);
            _canvas.Children.Add(moon);
            Bob(moon, 1);

            SetBody(_canvas);
            Speak("Regarde le soleil... ou la lune !");
        }

        // Les 4 moments de la journée dessinés, empilés (jour en dessous, nuit
        // au-dessus) ; seul le jour est visible au départ. null si absents.
        private Image[] PaintedScene()
        {
            var keys = new[] { "scene-jour", "scene-coucher", "scene-soir", "scene-nuit" };
            var srcs = keys.Select(Art.Find).ToArray();
            if (srcs.Any(x => x == null)) return null;
            double ih = W * srcs[0].Height / srcs[0].Width; // ~840 : on rogne un peu le bas
            var layers = new Image[4];
            for (int i = 0; i < 4; i++)
            {
                layers[i] = new Image
                {
                    Source = srcs[i],
                    Width = W,
                    Height = ih,
                    Stretch = Stretch.Fill,
                    Opacity = i == 0 ? 1 : 0,
                    IsHitTestVisible = false,
                };
                Canvas.SetLeft(layers[i], 0);
                Canvas.SetTop(layers[i], -30); // repère des boutons soleil/lune
                _canvas.Children.Add(layers[i]);
            }
            return layers;
        }

        // Fond l'un dans l'autre : la nuit tombe (coucher → soir → nuit) ou le
        // jour se lève (nuit → soir → coucher → jour), en ~2,7 s.
        private void FadeScene(bool toNight)
        {
            if (_scene == null) return;
            for (int k = 1; k <= 3; k++)
            {
                int step = toNight ? k - 1 : 3 - k; // ordre d'apparition / de disparition
                _scene[k].BeginAnimation(UIElement.OpacityProperty,
                    new DoubleAnimation(toNight ? 1 : 0, TimeSpan.FromMilliseconds(1000))
                    {
                        BeginTime = TimeSpan.FromMilliseconds(step * 850),
                        EasingFunction = new SineEase { EasingMode = EasingMode.EaseInOut },
                    });
            }
        }

        private void AddVectorLandscape()
        {
            var hill1 = new Ellipse { Width = 1100, Height = 380, Fill = new SolidColorBrush(Color.FromRgb(0x8F, 0xD6, 0x7A)) };
            Canvas.SetLeft(hill1, -220);
            Canvas.SetTop(hill1, H - 220);
            _canvas.Children.Add(hill1);
            var hill2 = new Ellipse { Width = 1200, Height = 420, Fill = new SolidColorBrush(Color.FromRgb(0x6B, 0xCB, 0x77)) };
            Canvas.SetLeft(hill2, 620);
            Canvas.SetTop(hill2, H - 190);
            _canvas.Children.Add(hill2);
            AddDecor("🏡", W / 2 - 110, H - 290, 150);
            AddDecor("🌳", W / 2 + 160, H - 300, 130);
            AddDecor("🌷🌼🌷", 180, H - 160, 48);
        }

        private void AnimateSky(Color top, Color bottom)
        {
            _page?.BeginAnimation(SolidColorBrush.ColorProperty,
                new ColorAnimation(top, TimeSpan.FromMilliseconds(2400)));
            _skyTop.BeginAnimation(GradientStop.ColorProperty,
                new ColorAnimation(top, TimeSpan.FromMilliseconds(1400)) { EasingFunction = new SineEase { EasingMode = EasingMode.EaseInOut } });
            _skyBottom.BeginAnimation(GradientStop.ColorProperty,
                new ColorAnimation(bottom, TimeSpan.FromMilliseconds(1400)) { EasingFunction = new SineEase { EasingMode = EasingMode.EaseInOut } });
        }

        private void GoDay()
        {
            AnimateSky(Color.FromRgb(0x8A, 0xC8, 0xFF), Color.FromRgb(0xE8, 0xF4, 0xFF));
            FadeScene(toNight: false); // le soleil se lève sur la maison
            foreach (var st in _stars)
                st.BeginAnimation(UIElement.OpacityProperty, new DoubleAnimation(0, TimeSpan.FromMilliseconds(900)));
            _zzz.BeginAnimation(UIElement.OpacityProperty, new DoubleAnimation(0, TimeSpan.FromMilliseconds(600)));
            Speak("Cocorico ! C'est le jour !");
            SoundFx.BirdChirp(2);
            _sawDay = true;
            CheckBoth();
        }

        private void GoNight()
        {
            AnimateSky(Color.FromRgb(0x1A, 0x1E, 0x4A), Color.FromRgb(0x3A, 0x2A, 0x6E));
            FadeScene(toNight: true); // coucher de soleil, puis la nuit tombe
            foreach (var st in _stars)
            {
                st.BeginAnimation(UIElement.OpacityProperty, new DoubleAnimation(1, TimeSpan.FromMilliseconds(1200))
                { BeginTime = TimeSpan.FromMilliseconds(_rng.Next(900)) });
                var tw = new DoubleAnimation(0.3, 1, TimeSpan.FromSeconds(1.4 + _rng.NextDouble() * 2))
                { AutoReverse = true, RepeatBehavior = RepeatBehavior.Forever, BeginTime = TimeSpan.FromSeconds(1.5) };
                st.BeginAnimation(UIElement.OpacityProperty, tw, HandoffBehavior.Compose);
            }
            _zzz.BeginAnimation(UIElement.OpacityProperty, new DoubleAnimation(1, TimeSpan.FromMilliseconds(1400)));
            Speak("Hou, hou ! C'est la nuit ! Chut...");
            _sawNight = true;
            CheckBoth();
        }

        private void CheckBoth()
        {
            if (!_sawDay || !_sawNight || Locked) return;
            Locked = true;
            Schedule(4300, ExplainSpin);
        }

        // La Terre qui TOURNE devant le Soleil : le secret du jour et de la nuit.
        private void ExplainSpin()
        {
            Question.Text = "🌍 Le secret du jour et de la nuit";
            SetConsigne(null, null);
            _canvas = new Canvas { Width = W, Height = H };
            _canvas.Children.Add(new Rectangle
            {
                Width = W,
                Height = H,
                RadiusX = 26,
                RadiusY = 26,
                Fill = new LinearGradientBrush(Color.FromRgb(0x1A, 0x1E, 0x4A), Color.FromRgb(0x3A, 0x2A, 0x6E), 90),
            });
            for (int i = 0; i < 24; i++)
            {
                var star = new TextBlock { Text = "✦", FontSize = 10 + _rng.Next(14), Foreground = new SolidColorBrush(Color.FromArgb(170, 255, 242, 196)), IsHitTestVisible = false };
                Canvas.SetLeft(star, _rng.NextDouble() * (W - 30));
                Canvas.SetTop(star, _rng.NextDouble() * (H - 30));
                _canvas.Children.Add(star);
            }
            var sun = SunVisual(300);
            Canvas.SetLeft(sun, 100);
            Canvas.SetTop(sun, H / 2 - 150);
            _canvas.Children.Add(sun);

            var earth = OrbImage("planete-terre", 3, 240);
            earth.RenderTransformOrigin = new Point(0.5, 0.5);
            var spin = new RotateTransform(0);
            earth.RenderTransform = spin;
            Canvas.SetLeft(earth, W - 500);
            Canvas.SetTop(earth, H / 2 - 120);
            _canvas.Children.Add(earth);
            spin.BeginAnimation(RotateTransform.AngleProperty,
                new DoubleAnimation(0, 360, TimeSpan.FromSeconds(6)) { RepeatBehavior = RepeatBehavior.Forever });

            SetBody(_canvas);
            Speak("Voici le secret : la Terre TOURNE sur elle-même, sans arrêt ! " +
                  "Quand notre maison est devant le Soleil, c'est le jour ! " +
                  "Quand elle tourne de l'autre côté, c'est la nuit ! Et ça recommence tous les jours !");
            Schedule(11000, () => { _act = 2; _round = 0; NextMoon(); });
        }

        // ------------------------------------------------------------------
        //  Acte 2 : les formes de la Lune — Acte 3 : jour ou nuit ?
        // ------------------------------------------------------------------
        // Le Soleil et la Terre dessinés (planete-soleil / planete-terre).
        private static FrameworkElement SunVisual(double size) => OrbImage("planete-soleil", 0, size);
        private static FrameworkElement OrbImage(string name, int art, double size)
        {
            var img = Art.Find(name);
            return img != null
                ? (FrameworkElement)new Image { Source = img, Width = size, Height = size, Stretch = Stretch.Uniform }
                : PlanetArt.Make(art, size);
        }

        private FrameworkElement MoonVisual(double size, bool full, double phase = 0)
        {
            // Les dessins d'abord : pleine lune (lune-pleine, sinon planete-lune),
            // croissant (lune-croissant, sinon lune), demi-lune (lune-demi).
            string[] names = full ? new[] { "lune-pleine", "planete-lune" }
                           : phase >= 0.7 ? new[] { "lune-croissant", "lune" }
                           : new[] { "lune-demi" };
            foreach (var n in names)
            {
                var img = Art.Find(n);
                if (img != null)
                    return new Image { Source = img, Width = size, Height = size, Stretch = Stretch.Uniform };
            }
            // phase 0 = pleine ; 0.55 = moitié ; 0.8 = croissant.
            var c = new Canvas { Width = 240, Height = 240 };
            var cream = Color.FromRgb(0xF2, 0xE8, 0xC4);
            var m = new Ellipse { Width = 200, Height = 200, Fill = new SolidColorBrush(cream) };
            Canvas.SetLeft(m, 20);
            Canvas.SetTop(m, 20);
            c.Children.Add(m);
            foreach (var (x, y, r) in new[] { (60.0, 90.0, 34.0), (130.0, 60.0, 24.0), (120.0, 150.0, 28.0) })
            {
                var cr = new Ellipse { Width = r, Height = r, Fill = new SolidColorBrush(Color.FromRgb(0xD9, 0xCB, 0x9E)) };
                Canvas.SetLeft(cr, x);
                Canvas.SetTop(cr, y);
                c.Children.Add(cr);
            }
            if (!full)
            {
                // L'ombre : un disque couleur de nuit qui recouvre une partie
                // (plus la phase est grande, plus la Lune est « croquée »).
                var shadow = new Ellipse { Width = 210, Height = 210, Fill = new SolidColorBrush(Color.FromRgb(0x1A, 0x1E, 0x4A)) };
                Canvas.SetLeft(shadow, 200 * phase - 190);
                Canvas.SetTop(shadow, 15);
                c.Children.Add(shadow);
            }
            return new Viewbox { Width = size, Height = size, Stretch = Stretch.Uniform, Child = c };
        }

        private void NextMoon()
        {
            Locked = false;
            _round++;
            if (_act == 2 && _round > 3) { _act = 3; _round = 1; }
            if (_act == 3 && _round > 3)
            {
                Question.Text = "🌙 Quelle belle journée... et quelle belle nuit !";
                Speak("Bravo ! Fais de beaux rêves !");
                GameKit.Success();
                Celebrate();
                Schedule(3400, NewRound);
                return;
            }
            if (_act == 2) MoonQuiz();
            else DayOrNight();
        }

        private void MoonQuiz()
        {
            // La Lune change de forme : pleine, moitié, croissant.
            var shapes = new (string Name, string Said, double Phase, bool Full)[]
            {
                ("pleine", "la Lune toute RONDE, la pleine lune", 0, true),
                ("moitié", "la DEMI-lune, coupée en deux", 0.52, false),
                ("croissant", "le petit CROISSANT de lune", 0.82, false),
            };
            var target = shapes[(_round - 1) % shapes.Length];
            var order = shapes.OrderBy(s => _rng.Next()).ToList();

            Question.Text = "🌙 Trouve " + (target.Name == "pleine" ? "la lune toute ronde !" : target.Name == "moitié" ? "la demi-lune !" : "le petit croissant !");
            SetConsigne(new TextBlock { Text = "🌙✨" }, () => "La Lune change de forme dans le ciel ! Trouve " + target.Said + " !");

            _canvas = new Canvas { Width = W, Height = H };
            _canvas.Children.Add(new Rectangle
            {
                Width = W,
                Height = H,
                RadiusX = 26,
                RadiusY = 26,
                Fill = new LinearGradientBrush(Color.FromRgb(0x1A, 0x1E, 0x4A), Color.FromRgb(0x3A, 0x2A, 0x6E), 90),
            });
            for (int i = 0; i < 22; i++)
            {
                var star = new TextBlock { Text = "✦", FontSize = 10 + _rng.Next(14), Foreground = new SolidColorBrush(Color.FromArgb(170, 255, 242, 196)), IsHitTestVisible = false };
                Canvas.SetLeft(star, _rng.NextDouble() * (W - 30));
                Canvas.SetTop(star, _rng.NextDouble() * (H - 30));
                _canvas.Children.Add(star);
                var tw = new DoubleAnimation(0.25, 1, TimeSpan.FromSeconds(1.5 + _rng.NextDouble() * 2))
                { AutoReverse = true, RepeatBehavior = RepeatBehavior.Forever, BeginTime = TimeSpan.FromSeconds(_rng.NextDouble() * 2) };
                star.BeginAnimation(UIElement.OpacityProperty, tw);
            }
            AddDecor("🦉", 70, H - 190, 100);

            double[] xs = { 260, 680, 1100 };
            for (int i = 0; i < 3; i++)
            {
                var sh = order[i];
                var btn = SceneButton(MoonVisual(230, sh.Full, sh.Phase), 280, 280);
                var captured = btn;
                btn.Click += (s, e) =>
                {
                    if (Locked) return;
                    if (sh.Name == target.Name)
                    {
                        Locked = true;
                        GameKit.Success();
                        Speak("Oui ! C'est " + target.Said + " ! Bravo !");
                        Celebrate();
                        Schedule(2600, NextMoon);
                    }
                    else
                    {
                        Shake(captured);
                        Speak("Ça, c'est " + sh.Said + " ! Cherche " + target.Said + " !");
                    }
                };
                Canvas.SetLeft(btn, xs[i] - 140);
                Canvas.SetTop(btn, 170);
                _canvas.Children.Add(btn);
                Bob(btn, i);
            }
            SetBody(_canvas);
            Speak("Trouve " + target.Said + " !");
        }

        private void DayOrNight()
        {
            var acts = new (string Emoji, string Name, bool Night)[]
            {
                ("🛏️", "faire dodo", true), ("⚽", "jouer au ballon dehors", false),
                ("🥣", "prendre le petit déjeuner", false), ("⭐", "regarder les étoiles", true),
                ("🦉", "entendre le hibou", true), ("🏫", "aller à l'école", false),
            };
            var target = acts[_rng.Next(acts.Length)];

            Question.Text = "🌞🌙 Le jour ou la nuit ?";
            SetConsigne(Art.ForEmoji(target.Emoji, 115),
                () => Cap(target.Name) + "... c'est le JOUR, avec le soleil ? Ou la NUIT, avec la lune ?");

            _canvas = new Canvas { Width = W, Height = H };
            // Moitié jour / moitié nuit, séparées au milieu.
            // La maison au soleil / la maison sous les étoiles (dessins) si on
            // les a, sinon les deux ciels en dégradé.
            var dayImg = Art.Find("scene-jour");
            var nightImg = Art.Find("scene-nuit");
            bool painted = dayImg != null && nightImg != null;
            SetPageBackground(new LinearGradientBrush(Color.FromRgb(0x8A, 0xC8, 0xFF), Color.FromRgb(0x1A, 0x1E, 0x4A), 0));
            _canvas.Children.Add(new Rectangle
            {
                Width = W / 2, Height = H, RadiusX = 26, RadiusY = 26,
                Fill = painted
                    ? new ImageBrush(dayImg) { Stretch = Stretch.UniformToFill, AlignmentX = AlignmentX.Left }
                    : (Brush)new LinearGradientBrush(Color.FromRgb(0x8A, 0xC8, 0xFF), Color.FromRgb(0xE8, 0xF4, 0xFF), 90),
            });
            var night = new Rectangle
            {
                Width = W / 2, Height = H, RadiusX = 26, RadiusY = 26,
                Fill = painted
                    ? new ImageBrush(nightImg) { Stretch = Stretch.UniformToFill, AlignmentX = AlignmentX.Right }
                    : (Brush)new LinearGradientBrush(Color.FromRgb(0x1A, 0x1E, 0x4A), Color.FromRgb(0x3A, 0x2A, 0x6E), 90),
            };
            Canvas.SetLeft(night, W / 2);
            _canvas.Children.Add(night);
            for (int i = 0; i < (painted ? 0 : 12); i++)
            {
                var star = new TextBlock { Text = "✦", FontSize = 10 + _rng.Next(14), Foreground = new SolidColorBrush(Color.FromArgb(180, 255, 242, 196)), IsHitTestVisible = false };
                Canvas.SetLeft(star, W / 2 + 30 + _rng.NextDouble() * (W / 2 - 80));
                Canvas.SetTop(star, _rng.NextDouble() * (H - 60));
                _canvas.Children.Add(star);
            }
            if (!painted)
            {
                AddDecor("🌼", 90, H - 140, 56);
                AddDecor("🦉", W - 160, H - 190, 90);
            }

            // L'activité mystère, au centre, qui se balance.
            var item = Art.ForEmoji(target.Emoji, 170);
            item.IsHitTestVisible = false;
            item.RenderTransformOrigin = new Point(0.5, 0);
            var sway = new RotateTransform(0);
            item.RenderTransform = sway;
            Canvas.SetLeft(item, W / 2 - 80);
            Canvas.SetTop(item, 60);
            item.SetValue(Panel.ZIndexProperty, 70);
            _canvas.Children.Add(item);
            sway.BeginAnimation(RotateTransform.AngleProperty,
                new DoubleAnimation(-8, 8, TimeSpan.FromSeconds(1.6)) { AutoReverse = true, RepeatBehavior = RepeatBehavior.Forever, EasingFunction = new SineEase { EasingMode = EasingMode.EaseInOut } });

            // Sur les dessins, chaque bouton se pose sur le soleil / la lune du
            // dessin (moitié jour cadrée à gauche, moitié nuit à droite).
            var sunBtn = SceneButton(SunVisual(240), 300, 300);
            Canvas.SetLeft(sunBtn, painted ? 287 - 150 : W / 4 - 150);
            Canvas.SetTop(sunBtn, painted ? 167 - 150 : 260);
            _canvas.Children.Add(sunBtn);
            Bob(sunBtn, 0);
            var moonBtn = SceneButton(MoonVisual(painted ? 215 : 240, full: true), painted ? 240 : 300, painted ? 240 : 300);
            Canvas.SetLeft(moonBtn, painted ? 1328 - 120 : 3 * W / 4 - 150);
            Canvas.SetTop(moonBtn, painted ? 3 : 260);
            _canvas.Children.Add(moonBtn);
            Bob(moonBtn, 1);

            void Pick(bool night2, Button b)
            {
                if (Locked) return;
                if (night2 == target.Night)
                {
                    Locked = true;
                    GameKit.Success();
                    Speak("Oui ! " + Cap(target.Name) + ", c'est " + (target.Night ? "la NUIT, avec la lune et les étoiles !" : "le JOUR, avec le soleil !") + " Bravo !");
                    Celebrate();
                    Schedule(2800, NextMoon);
                }
                else
                {
                    Shake(b);
                    Speak(target.Night
                        ? "En plein jour ? Non non... " + Cap(target.Name) + ", c'est quand il fait tout noir ! Cherche la lune !"
                        : "La nuit ? Non non... " + Cap(target.Name) + ", c'est quand le soleil brille ! Cherche le soleil !");
                }
            }
            sunBtn.Click += (s, e) => Pick(false, sunBtn);
            moonBtn.Click += (s, e) => Pick(true, moonBtn);

            SetBody(_canvas);
            Speak(Cap(target.Name) + "... c'est le jour ou la nuit ? Regarde le soleil ou la lune !");
        }

        // ------------------------------------------------------------------
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

        private static void Bob(FrameworkElement el, int seed)
        {
            el.RenderTransformOrigin = new Point(0.5, 0.5);
            var tt = new TranslateTransform();
            el.RenderTransform = tt;
            var bob = new DoubleAnimation(0, -12, TimeSpan.FromSeconds(1.9 + seed * 0.4))
            { AutoReverse = true, RepeatBehavior = RepeatBehavior.Forever, BeginTime = TimeSpan.FromMilliseconds(seed * 400), EasingFunction = new SineEase { EasingMode = EasingMode.EaseInOut } };
            tt.BeginAnimation(TranslateTransform.YProperty, bob);
        }

        private void AddDecor(string emoji, double x, double y, double size)
        {
            var tb = Art.ForEmoji(emoji, size * 1.2);
            tb.IsHitTestVisible = false;
            Canvas.SetLeft(tb, x);
            Canvas.SetTop(tb, y);
            _canvas.Children.Add(tb);
        }

        private static string Cap(string s) => char.ToUpperInvariant(s[0]) + s.Substring(1);
    }
}
