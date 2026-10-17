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

            // Les étoiles (invisibles le jour, elles s'allument la nuit).
            for (int i = 0; i < 26; i++)
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

            // Le paysage : collines, maison, arbre.
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
            _zzz = new TextBlock { Text = "💤", FontSize = 60, Opacity = 0, IsHitTestVisible = false };
            Canvas.SetLeft(_zzz, W / 2 + 40);
            Canvas.SetTop(_zzz, H - 360);
            _canvas.Children.Add(_zzz);

            // Le SOLEIL (à gauche) et la LUNE (à droite) — nos deux boutons.
            var sun = SceneButton(PlanetArt.Make(0, 230), 260, 260);
            sun.Click += (s, e) => { if (!Locked) GoDay(); };
            Canvas.SetLeft(sun, 60);
            Canvas.SetTop(sun, 30);
            _canvas.Children.Add(sun);
            Bob(sun, 0);

            var moon = SceneButton(MoonVisual(230, full: true), 260, 260);
            moon.Click += (s, e) => { if (!Locked) GoNight(); };
            Canvas.SetLeft(moon, W - 320);
            Canvas.SetTop(moon, 30);
            _canvas.Children.Add(moon);
            Bob(moon, 1);

            SetBody(_canvas);
            Speak("Jour et nuit ! Regarde le Soleil pour faire venir le jour... et la Lune pour faire venir la nuit !");
        }

        private void AnimateSky(Color top, Color bottom)
        {
            _skyTop.BeginAnimation(GradientStop.ColorProperty,
                new ColorAnimation(top, TimeSpan.FromMilliseconds(1400)) { EasingFunction = new SineEase { EasingMode = EasingMode.EaseInOut } });
            _skyBottom.BeginAnimation(GradientStop.ColorProperty,
                new ColorAnimation(bottom, TimeSpan.FromMilliseconds(1400)) { EasingFunction = new SineEase { EasingMode = EasingMode.EaseInOut } });
        }

        private void GoDay()
        {
            AnimateSky(Color.FromRgb(0x8A, 0xC8, 0xFF), Color.FromRgb(0xE8, 0xF4, 0xFF));
            foreach (var st in _stars)
                st.BeginAnimation(UIElement.OpacityProperty, new DoubleAnimation(0, TimeSpan.FromMilliseconds(900)));
            _zzz.BeginAnimation(UIElement.OpacityProperty, new DoubleAnimation(0, TimeSpan.FromMilliseconds(600)));
            Speak("Cocorico ! C'est le JOUR ! Le soleil brille, les oiseaux chantent, on joue dehors !");
            SoundFx.BirdChirp(2);
            _sawDay = true;
            CheckBoth();
        }

        private void GoNight()
        {
            AnimateSky(Color.FromRgb(0x1A, 0x1E, 0x4A), Color.FromRgb(0x3A, 0x2A, 0x6E));
            foreach (var st in _stars)
            {
                st.BeginAnimation(UIElement.OpacityProperty, new DoubleAnimation(1, TimeSpan.FromMilliseconds(1200))
                { BeginTime = TimeSpan.FromMilliseconds(_rng.Next(900)) });
                var tw = new DoubleAnimation(0.3, 1, TimeSpan.FromSeconds(1.4 + _rng.NextDouble() * 2))
                { AutoReverse = true, RepeatBehavior = RepeatBehavior.Forever, BeginTime = TimeSpan.FromSeconds(1.5) };
                st.BeginAnimation(UIElement.OpacityProperty, tw, HandoffBehavior.Compose);
            }
            _zzz.BeginAnimation(UIElement.OpacityProperty, new DoubleAnimation(1, TimeSpan.FromMilliseconds(1400)));
            Speak("Hou, hou ! C'est la NUIT ! Les étoiles s'allument... Chut, tout le monde dort ! Dodo...");
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
            var sun = PlanetArt.Make(0, 300);
            Canvas.SetLeft(sun, 100);
            Canvas.SetTop(sun, H / 2 - 150);
            _canvas.Children.Add(sun);

            var earth = PlanetArt.Make(3, 240);
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
        private FrameworkElement MoonVisual(double size, bool full, double phase = 0)
        {
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
                Speak("Bravo ! Tu sais tout sur le jour, la nuit et la Lune ! Fais de beaux rêves !");
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
            SetConsigne(new TextBlock { Text = target.Emoji, FontSize = 96 },
                () => Cap(target.Name) + "... c'est le JOUR, avec le soleil ? Ou la NUIT, avec la lune ?");

            _canvas = new Canvas { Width = W, Height = H };
            // Moitié jour / moitié nuit, séparées au milieu.
            _canvas.Children.Add(new Rectangle { Width = W / 2, Height = H, RadiusX = 26, RadiusY = 26, Fill = new LinearGradientBrush(Color.FromRgb(0x8A, 0xC8, 0xFF), Color.FromRgb(0xE8, 0xF4, 0xFF), 90) });
            var night = new Rectangle { Width = W / 2, Height = H, RadiusX = 26, RadiusY = 26, Fill = new LinearGradientBrush(Color.FromRgb(0x1A, 0x1E, 0x4A), Color.FromRgb(0x3A, 0x2A, 0x6E), 90) };
            Canvas.SetLeft(night, W / 2);
            _canvas.Children.Add(night);
            for (int i = 0; i < 12; i++)
            {
                var star = new TextBlock { Text = "✦", FontSize = 10 + _rng.Next(14), Foreground = new SolidColorBrush(Color.FromArgb(180, 255, 242, 196)), IsHitTestVisible = false };
                Canvas.SetLeft(star, W / 2 + 30 + _rng.NextDouble() * (W / 2 - 80));
                Canvas.SetTop(star, _rng.NextDouble() * (H - 60));
                _canvas.Children.Add(star);
            }
            AddDecor("🌼", 90, H - 140, 56);
            AddDecor("🦉", W - 160, H - 190, 90);

            // L'activité mystère, au centre, qui se balance.
            var item = new TextBlock { Text = target.Emoji, FontSize = 140, IsHitTestVisible = false, RenderTransformOrigin = new Point(0.5, 0) };
            var sway = new RotateTransform(0);
            item.RenderTransform = sway;
            Canvas.SetLeft(item, W / 2 - 80);
            Canvas.SetTop(item, 60);
            item.SetValue(Panel.ZIndexProperty, 70);
            _canvas.Children.Add(item);
            sway.BeginAnimation(RotateTransform.AngleProperty,
                new DoubleAnimation(-8, 8, TimeSpan.FromSeconds(1.6)) { AutoReverse = true, RepeatBehavior = RepeatBehavior.Forever, EasingFunction = new SineEase { EasingMode = EasingMode.EaseInOut } });

            var sunBtn = SceneButton(PlanetArt.Make(0, 240), 300, 300);
            Canvas.SetLeft(sunBtn, W / 4 - 150);
            Canvas.SetTop(sunBtn, 260);
            _canvas.Children.Add(sunBtn);
            Bob(sunBtn, 0);
            var moonBtn = SceneButton(MoonVisual(240, full: true), 300, 300);
            Canvas.SetLeft(moonBtn, 3 * W / 4 - 150);
            Canvas.SetTop(moonBtn, 260);
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
            var tb = new TextBlock { Text = emoji, FontSize = size, IsHitTestVisible = false };
            Canvas.SetLeft(tb, x);
            Canvas.SetTop(tb, y);
            _canvas.Children.Add(tb);
        }

        private static string Cap(string s) => char.ToUpperInvariant(s[0]) + s.Substring(1);
    }
}
