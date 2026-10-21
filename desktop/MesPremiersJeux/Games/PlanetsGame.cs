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
    /// « Les planètes » (PS/MS) : le système solaire façon dessin animé — des
    /// planètes très colorées avec des visages rigolos (PlanetArt), qui
    /// flottent dans un ciel étoilé. ZÉRO lecture : tout est dit à voix haute.
    /// 1) DÉCOUVERTE : regarder une planète la fait danser et se présenter.
    /// 2) « Trouve la planète rouge ! » (l'erreur enseigne : « ça, c'est
    /// Jupiter, la géante ! »). 3) LA FUSÉE : 3, 2, 1… décollage vers la
    /// planète demandée !
    /// </summary>
    public sealed class PlanetsGame : GameControl
    {
        private const double W = 1500, H = 700;

        private sealed class Planet
        {
            public int Art;          // index PlanetArt
            public string Key;       // nom de fichier : planete-<Key> / photo-<Key>
            public string Name;      // « Saturne »
            public string Fun;       // sa présentation rigolote
            public string Clue;      // l'indice de l'acte 2 (« la planète rouge »)
            public double Size;
        }

        private static readonly Planet[] All =
        {
            new Planet { Art = 1, Key = "mercure", Name = "Mercure", Fun = "la toute petite, la plus proche du Soleil ! Elle a plein de petits trous, comme la Lune !", Clue = "la toute petite planète grise", Size = 100 },
            new Planet { Art = 2, Key = "venus", Name = "Vénus", Fun = "la planète dorée ! C'est la plus chaude de toutes !", Clue = "la planète dorée", Size = 125 },
            new Planet { Art = 3, Key = "terre", Name = "la Terre", Fun = "notre maison ! La planète bleue, avec ses mers et ses forêts !", Clue = "notre maison, la planète bleue", Size = 135 },
            new Planet { Art = 4, Key = "mars", Name = "Mars", Fun = "la planète rouge ! C'est là que vont les robots explorateurs !", Clue = "la planète rouge", Size = 120 },
            new Planet { Art = 5, Key = "jupiter", Name = "Jupiter", Fun = "la plus GROSSE de toutes ! Une vraie géante, avec sa grande tache rouge !", Clue = "la plus grosse, la géante", Size = 195 },
            new Planet { Art = 6, Key = "saturne", Name = "Saturne", Fun = "la planète aux grands anneaux ! La plus élégante !", Clue = "la planète aux grands anneaux", Size = 185 },
            new Planet { Art = 7, Key = "uranus", Name = "Uranus", Fun = "la planète bleu-vert, toute penchée sur le côté !", Clue = "la planète bleu-vert", Size = 125 },
            new Planet { Art = 8, Key = "neptune", Name = "Neptune", Fun = "la planète bleu foncé, tout au bout, où souffle un vent terrible !", Clue = "la planète bleu foncé, la plus lointaine", Size = 125 },
        };

        // L'astre : l'AUTOCOLLANT dessiné s'il existe (planete-<key>, fournis
        // avec l'application), sinon le dessin vectoriel PlanetArt.
        private static FrameworkElement Orb(string key, int art, double size)
        {
            var img = Art.Find("planete-" + key);
            return img != null
                ? (FrameworkElement)new Image { Source = img, Width = size, Height = size, Stretch = Stretch.Uniform }
                : PlanetArt.Make(art, size);
        }

        private readonly Random _rng = new Random();
        private Canvas _canvas;
        private int _act;
        private int _round;
        private bool[] _visited;

        public PlanetsGame(Action celebrate) : base(celebrate) { }

        protected override void NewRound()
        {
            _act = 1;
            _round = 0;
            _visited = new bool[All.Length];
            BuildDiscovery();
        }

        private void SpaceBackground()
        {
            _canvas = new Canvas { Width = W, Height = H, ClipToBounds = true };
            // Plein écran : la page autour de la scène continue l'espace.
            SetPageBackground(new SolidColorBrush(Color.FromRgb(0x29, 0x1F, 0x4E)));
            // Le fond galaxie (decor-espace) : une belle nébuleuse SANS
            // planètes dedans — rien ne se mélange avec celles du jeu, donc
            // l'image s'affiche entière, sans voile.
            var decor = Art.Find("decor-espace");
            if (decor != null)
                _canvas.Children.Add(new Image { Source = decor, Width = W, Height = H, Stretch = Stretch.UniformToFill });
            else
                _canvas.Children.Add(new Rectangle
                {
                    Width = W,
                    Height = H,
                    Fill = new LinearGradientBrush(Color.FromRgb(0x1A, 0x1E, 0x4A), Color.FromRgb(0x3A, 0x2A, 0x6E), 90),
                });
            for (int i = 0; i < 34; i++)
            {
                var star = new TextBlock
                {
                    Text = "✦",
                    FontSize = 9 + _rng.Next(15),
                    Foreground = new SolidColorBrush(Color.FromArgb((byte)(110 + _rng.Next(130)), 255, 255, 220)),
                    IsHitTestVisible = false,
                };
                Canvas.SetLeft(star, _rng.NextDouble() * (W - 30));
                Canvas.SetTop(star, _rng.NextDouble() * (H - 30));
                _canvas.Children.Add(star);
                var tw = new DoubleAnimation(0.25, 1, TimeSpan.FromSeconds(1.6 + _rng.NextDouble() * 2.4))
                { AutoReverse = true, RepeatBehavior = RepeatBehavior.Forever, BeginTime = TimeSpan.FromSeconds(_rng.NextDouble() * 3) };
                star.BeginAnimation(UIElement.OpacityProperty, tw);
            }
            // Une comète qui traverse de temps en temps.
            var comet = new TextBlock { Text = "☄️", FontSize = 44, IsHitTestVisible = false, Opacity = 0 };
            Canvas.SetTop(comet, 60);
            _canvas.Children.Add(comet);
            var cx = new DoubleAnimation(W + 40, -80, TimeSpan.FromSeconds(5))
            { RepeatBehavior = RepeatBehavior.Forever, BeginTime = TimeSpan.FromSeconds(4) };
            var co = new DoubleAnimationUsingKeyFrames { Duration = TimeSpan.FromSeconds(5), RepeatBehavior = RepeatBehavior.Forever, BeginTime = TimeSpan.FromSeconds(4) };
            co.KeyFrames.Add(new LinearDoubleKeyFrame(0.9, KeyTime.FromPercent(0.08)));
            co.KeyFrames.Add(new LinearDoubleKeyFrame(0.9, KeyTime.FromPercent(0.5)));
            co.KeyFrames.Add(new LinearDoubleKeyFrame(0, KeyTime.FromPercent(0.7)));
            comet.BeginAnimation(Canvas.LeftProperty, cx);
            comet.BeginAnimation(UIElement.OpacityProperty, co);
        }

        // Bouton transparent : la planète flotte dans l'espace, sans carte.
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

        // Fait flotter doucement un élément (chaque astre à son rythme).
        private static void Drift(FrameworkElement el, int seed)
        {
            el.RenderTransformOrigin = new Point(0.5, 0.5);
            var tt = new TranslateTransform();
            el.RenderTransform = tt;
            var bob = new DoubleAnimation(0, -14, TimeSpan.FromSeconds(1.8 + (seed % 5) * 0.4))
            { AutoReverse = true, RepeatBehavior = RepeatBehavior.Forever, BeginTime = TimeSpan.FromMilliseconds(seed * 300), EasingFunction = new SineEase { EasingMode = EasingMode.EaseInOut } };
            tt.BeginAnimation(TranslateTransform.YProperty, bob);
        }

        // ------------------------------------------------------------------
        //  Acte 1 : la grande promenade dans le système solaire
        // ------------------------------------------------------------------
        private void BuildDiscovery()
        {
            Locked = false;
            Question.Text = "🪐 Les planètes";
            SetConsigne(new TextBlock { Text = "🔭✨" },
                () => "Bienvenue dans l'espace ! Regarde une planète : elle danse et se présente ! Va les voir toutes !");

            SpaceBackground();

            // Le Soleil, énorme, à gauche — lui aussi parle.
            var sun = SceneButton(Orb("soleil", 0, 280), 300, 300);
            sun.Click += (s, e) =>
            {
                if (Locked) return;
                Dance(sun);
                Speak("Le Soleil ! C'est une étoile, pas une planète !");
            };
            Canvas.SetLeft(sun, -60);
            Canvas.SetTop(sun, H / 2 - 150);
            _canvas.Children.Add(sun);
            Drift(sun, 0);

            // Les 8 planètes, du Soleil vers le bout, sur deux vagues.
            double[] xs = { 290, 440, 590, 740, 900, 1110, 1270, 1360 };
            double[] ys = { 160, 420, 130, 440, 230, 440, 140, 370 };
            for (int i = 0; i < All.Length; i++)
            {
                var p = All[i];
                var btn = SceneButton(Orb(p.Key, p.Art, p.Size), Math.Max(150, p.Size + 40), Math.Max(150, p.Size + 40));
                int idx = i;
                var captured = btn;
                btn.Click += (s, e) =>
                {
                    if (Locked) return;
                    Dance(captured);
                    SoundFx.PopSound();
                    Speak(p.Name + " ! C'est " + p.Fun);
                    if (!_visited[idx])
                    {
                        _visited[idx] = true;
                        var star = new TextBlock { Text = "⭐", FontSize = 36, IsHitTestVisible = false };
                        Canvas.SetLeft(star, Canvas.GetLeft(captured) + 20);
                        Canvas.SetTop(star, Canvas.GetTop(captured) - 10);
                        star.SetValue(Panel.ZIndexProperty, 70);
                        _canvas.Children.Add(star);
                        if (_visited.All(v => v))
                        {
                            Locked = true;
                            Schedule(3200, () =>
                            {
                                GameKit.Success();
                                Celebrate();
                                Speak("Bravo ! Maintenant, retrouve les planètes !");
                                _act = 2;
                                _round = 0;
                                Schedule(3400, NextQuiz);
                            });
                        }
                    }
                };
                Canvas.SetLeft(btn, xs[i] - 40);
                Canvas.SetTop(btn, ys[i] - 40);
                _canvas.Children.Add(btn);
                Drift(btn, i + 1);
            }

            SetBody(_canvas);
            Speak("Bienvenue dans l'espace ! Regarde une planète !");
        }

        private static void Dance(FrameworkElement el)
        {
            // Par-dessus la flottaison : un tour sur soi-même + gonflement.
            var grp = el.RenderTransform as TransformGroup;
            if (grp == null)
            {
                grp = new TransformGroup();
                if (el.RenderTransform is Transform t && !(t is TransformGroup)) grp.Children.Add(t);
                var sc2 = new ScaleTransform(1, 1);
                var rot2 = new RotateTransform(0);
                grp.Children.Add(sc2);
                grp.Children.Add(rot2);
                el.RenderTransform = grp;
            }
            ScaleTransform sc = null;
            RotateTransform rot = null;
            foreach (var t in grp.Children)
            {
                if (t is ScaleTransform s2) sc = s2;
                if (t is RotateTransform r2) rot = r2;
            }
            if (sc == null) { sc = new ScaleTransform(1, 1); grp.Children.Add(sc); }
            if (rot == null) { rot = new RotateTransform(0); grp.Children.Add(rot); }
            var puff = new DoubleAnimation(1, 1.18, TimeSpan.FromMilliseconds(380))
            { AutoReverse = true, EasingFunction = new SineEase() };
            sc.BeginAnimation(ScaleTransform.ScaleXProperty, puff);
            sc.BeginAnimation(ScaleTransform.ScaleYProperty, puff);
            rot.BeginAnimation(RotateTransform.AngleProperty,
                new DoubleAnimation(-8, 8, TimeSpan.FromMilliseconds(190)) { AutoReverse = true, RepeatBehavior = new RepeatBehavior(2) });
        }

        // ------------------------------------------------------------------
        //  Acte 2 : « Trouve la planète rouge ! »  ·  Acte 3 : la fusée 🚀
        // ------------------------------------------------------------------
        private void NextQuiz()
        {
            Locked = false;
            _round++;
            if (_act == 2 && _round > 4) { _act = 3; _round = 1; }
            if (_act == 3 && _round > 3)
            {
                Question.Text = "🪐 Quel voyage dans les étoiles !";
                Speak("Bravo, petit astronaute !");
                GameKit.Success();
                Celebrate();
                Schedule(3400, NewRound);
                return;
            }

            var target = All[_rng.Next(All.Length)];
            // ADAPTATION : au niveau 0 on ne montre que 2 planètes, puis 3.
            int nChoices = Adaptive.Level("planetes") == 0 ? 2 : 3;
            var choices = All.Where(p => p != target).OrderBy(p => _rng.Next()).Take(nChoices - 1)
                             .Concat(new[] { target }).OrderBy(p => _rng.Next()).ToList();

            SpaceBackground();
            Question.Text = _act == 2 ? "🔭 Trouve " + target.Clue + " !" : "🚀 En route vers " + target.Name + " !";
            SetConsigne(new TextBlock { Text = _act == 2 ? "🔭" : "🚀", FontSize = 90 },
                () => _act == 2
                    ? "Trouve " + target.Clue + " ! Regarde-la bien !"
                    : "La fusée veut aller sur " + target.Name + ", " + target.Clue + " ! Montre-lui le chemin !");

            double[] xs = { 310, 750, 1190 };
            double[] xs2 = { 480, 1020, 0 };
            Button correctBtn = null;
            for (int i = 0; i < choices.Count; i++)
            {
                var p = choices[i];
                var btn = SceneButton(Orb(p.Key, p.Art, 230), 290, 290);
                var captured = btn;
                if (p == target) correctBtn = btn;
                btn.Click += (s, e) =>
                {
                    if (Locked) return;
                    if (p == target)
                    {
                        Adaptive.Report("planetes", true);
                        Locked = true;
                        Dance(captured);
                        if (_act == 2)
                        {
                            GameKit.Success();
                            Speak("Oui ! " + target.Name + ", " + target.Clue + " ! Bravo !");
                            Celebrate();
                            if (Art.Find("photo-" + target.Key) != null)
                            {
                                Schedule(2400, () => ShowRealPhoto(target));
                                Schedule(6400, NextQuiz);
                            }
                            else Schedule(2600, NextQuiz);
                        }
                        else
                        {
                            Launch(Canvas.GetLeft(captured) + 145, Canvas.GetTop(captured) + 220, target);
                        }
                    }
                    else
                    {
                        Adaptive.Report("planetes", false);
                        Shake(captured);
                        Speak("Ça, c'est " + p.Name + ", " + p.Clue + " ! Cherche " + target.Clue + " !");
                    }
                };
                Canvas.SetLeft(btn, (choices.Count == 2 ? xs2[i] : xs[i]) - (choices.Count == 2 ? 0 : 145));
                Canvas.SetTop(btn, 150);
                _canvas.Children.Add(btn);
                Drift(btn, i + 2);
            }
            // Le coup de pouce : si rien ne bouge, la bonne planète respire.
            ArmHint(correctBtn, () => _act == 2
                ? "Trouve " + target.Clue + " !"
                : "La fusée attend ! Regarde " + target.Clue + " !");

            SetBody(_canvas);
            Speak(_act == 2
                ? "Trouve " + target.Clue + " !"
                : "La fusée veut aller sur " + target.Name + " ! Regarde " + target.Clue + " pour l'y emmener !");
        }

        // La VRAIE planète, en photo prise dans l'espace : un petit émerveillement
        // pédagogique après le dessin animé. La carte surgit, puis s'efface.
        private void ShowRealPhoto(Planet p)
        {
            var img = Art.Find("photo-" + p.Key);
            if (img == null) return;
            var card = new Border
            {
                CornerRadius = new CornerRadius(30),
                Background = new SolidColorBrush(Color.FromArgb(235, 0x10, 0x12, 0x30)),
                BorderBrush = Brushes.White,
                BorderThickness = new Thickness(4),
                Padding = new Thickness(20, 16, 20, 12),
                IsHitTestVisible = false,
                RenderTransformOrigin = new Point(0.5, 0.5),
                Child = new StackPanel
                {
                    Children =
                    {
                        new Image { Source = img, Width = 300, Height = 300, Stretch = Stretch.Uniform },
                        new TextBlock
                        {
                            Text = "✨ " + p.Name + " — en vrai ! ✨",
                            FontSize = 30,
                            FontWeight = FontWeights.Bold,
                            Foreground = Brushes.White,
                            HorizontalAlignment = HorizontalAlignment.Center,
                            Margin = new Thickness(0, 8, 0, 0),
                        },
                    },
                },
            };
            Canvas.SetLeft(card, W / 2 - 190);
            Canvas.SetTop(card, 110);
            card.SetValue(Panel.ZIndexProperty, 90);
            _canvas.Children.Add(card);
            Speak("Et regarde : " + p.Name + " en vrai, prise en photo dans l'espace !");

            var sc = new ScaleTransform(0.3, 0.3);
            card.RenderTransform = sc;
            var pop = new DoubleAnimation(0.3, 1, TimeSpan.FromMilliseconds(420))
            { EasingFunction = new BackEase { EasingMode = EasingMode.EaseOut, Amplitude = 0.6 } };
            sc.BeginAnimation(ScaleTransform.ScaleXProperty, pop);
            sc.BeginAnimation(ScaleTransform.ScaleYProperty, pop);
            Schedule(3400, () =>
            {
                var fade = new DoubleAnimation(1, 0, TimeSpan.FromMilliseconds(450));
                fade.Completed += (s, e) => _canvas.Children.Remove(card);
                card.BeginAnimation(OpacityProperty, fade);
            });
        }

        private void Launch(double tx, double ty, Planet target)
        {
            Speak("Décollage ! 3... 2... 1... Partez !");
            var rocket = new TextBlock { Text = "🚀", FontSize = 84, IsHitTestVisible = false, RenderTransformOrigin = new Point(0.5, 0.5) };
            rocket.RenderTransform = new RotateTransform(-20);
            Canvas.SetLeft(rocket, W / 2 - 40);
            Canvas.SetTop(rocket, H + 10);
            rocket.SetValue(Panel.ZIndexProperty, 80);
            _canvas.Children.Add(rocket);

            Schedule(2300, () =>
            {
                SoundFx.Whistle();
                var ax = new DoubleAnimation(W / 2 - 40, tx - 40, TimeSpan.FromMilliseconds(1100)) { EasingFunction = new SineEase() };
                var ay = new DoubleAnimation(H + 10, ty - 60, TimeSpan.FromMilliseconds(1100)) { EasingFunction = new SineEase { EasingMode = EasingMode.EaseOut } };
                ay.Completed += (s, e) =>
                {
                    SoundFx.PopSound();
                    // Petites étincelles d'arrivée.
                    for (int i = 0; i < 8; i++)
                    {
                        var sp = new TextBlock { Text = "✨", FontSize = 26, IsHitTestVisible = false };
                        Canvas.SetLeft(sp, tx - 60 + _rng.Next(120));
                        Canvas.SetTop(sp, ty - 100 + _rng.Next(90));
                        sp.SetValue(Panel.ZIndexProperty, 79);
                        _canvas.Children.Add(sp);
                        var fade = new DoubleAnimation(1, 0, TimeSpan.FromMilliseconds(900))
                        { BeginTime = TimeSpan.FromMilliseconds(i * 70) };
                        var captured = sp;
                        fade.Completed += (s2, e2) => _canvas.Children.Remove(captured);
                        sp.BeginAnimation(UIElement.OpacityProperty, fade);
                    }
                    GameKit.Success();
                    Speak("La fusée est arrivée sur " + target.Name + " ! Bravo, petit astronaute !");
                    Celebrate();
                    if (Art.Find("photo-" + target.Key) != null)
                    {
                        Schedule(2800, () => ShowRealPhoto(target));
                        Schedule(6800, NextQuiz);
                    }
                    else Schedule(3000, NextQuiz);
                };
                rocket.BeginAnimation(Canvas.LeftProperty, ax);
                rocket.BeginAnimation(Canvas.TopProperty, ay);
            });
        }
    }
}
