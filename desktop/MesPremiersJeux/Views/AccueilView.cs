using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Media.Effects;
using System.Windows.Threading;
using MesPremiersJeux.Lib;

namespace MesPremiersJeux.Views
{
    /// <summary>
    /// 🏠 L'ACCUEIL : la première page quand l'application s'ouvre. Un décor
    /// selon l'heure (jour, coucher de soleil, soir, nuit), « Bonjour Laura ! »,
    /// la date du jour dite à voix haute, la saison, l'ami du jour (un animal
    /// différent chaque jour, qui parle quand on le regarde), les étoiles
    /// gagnées, une surprise, et les grands boutons vers les activités.
    /// </summary>
    public sealed class AccueilView : UserControl
    {
        /// <summary>Aller vers un onglet (« games », « parcours », « stories », « music »).</summary>
        public event Action<string> Navigate;
        public event Action ShopRequested;
        public event Action BookRequested;

        private readonly Canvas _fx = new Canvas { IsHitTestVisible = false };
        private readonly TextBlock _starsText;
        private FrameworkElement _friendPic;

        // Le PASSAGE JOUR / NUIT : 4 paysages empilés (jour, coucher, soir, nuit)
        // fondus l'un dans l'autre, le soleil ou la lune en haut à droite (qui
        // se regarde : la nuit tombe, ou le jour se lève), et les étoiles.
        private Image[] _layers;
        private FrameworkElement _sun, _moon;
        private Canvas _stars;
        private int _phase = -1;        // 0 jour · 1 coucher · 2 soir · 3 nuit
        private int _autoPhase = -1;    // la phase « vraie » (selon l'heure)
        private readonly DispatcherTimer _clock = new DispatcherTimer { Interval = TimeSpan.FromSeconds(30) };
        private DateTime _lastHello = DateTime.MinValue;
        private readonly Random _rng = new Random();

        // L'ami du jour : (image, « le hérisson », sa petite phrase).
        private static readonly (string Img, string Name, string Fun)[] Friends =
        {
            ("herisson", "le hérisson", "Il se roule en boule, tout piquant !"),
            ("grenouille", "la grenouille", "Elle saute de nénuphar en nénuphar ! Coâ, coâ !"),
            ("papillon", "le papillon", "Il vole de fleur en fleur, tout léger !"),
            ("coccinelle", "la coccinelle", "Elle a des petits points noirs sur le dos !"),
            ("escargot", "l'escargot", "Il porte sa maison sur son dos, et il va tout doucement !"),
            ("tortue", "la tortue", "Elle a une grosse carapace et elle vit très, très longtemps !"),
            ("pingouin", "le pingouin", "Il glisse sur la glace, sur le ventre ! Wouuuh !"),
            ("panda", "le panda", "Il mange du bambou toute la journée !"),
            ("koala", "le koala", "Il dort dans les arbres, bien accroché !"),
            ("girafe", "la girafe", "Elle a un cou très, très long pour manger les feuilles tout en haut !"),
            ("elephant", "l'éléphant", "Il arrose tout le monde avec sa trompe ! Pschhh !"),
            ("lion", "le lion", "C'est le roi ! Il fait rooaar !"),
            ("singe", "le singe", "Il fait des galipettes dans les arbres !"),
            ("dauphin", "le dauphin", "Il saute hors de l'eau et il sourit tout le temps !"),
            ("baleine", "la baleine", "C'est le plus gros animal du monde ! Elle chante sous l'eau !"),
            ("poisson", "le poisson", "Il fait des bulles ! Blup, blup !"),
            ("poussin", "le poussin", "Il est tout jaune et tout doux ! Piou, piou !"),
            ("canard", "le canard", "Il nage sur la mare ! Coin, coin !"),
            ("mouton", "le mouton", "Il a une laine toute douce ! Bêêê !"),
            ("cochon", "le cochon", "Il adore se rouler dans la boue ! Groin, groin !"),
            ("vache", "la vache", "Elle donne du lait ! Meuuuh !"),
            ("renard", "le renard", "Il est roux et très malin !"),
            ("ecureuil", "l'écureuil", "Il cache des noisettes pour l'hiver !"),
            ("hibou", "le hibou", "Il ouvre ses grands yeux la nuit ! Hou, hou !"),
            ("ours", "l'ours", "Il adore le miel et il dort tout l'hiver !"),
            ("licorne", "la licorne", "Elle a une corne magique et une crinière arc-en-ciel !"),
            ("dragon", "le dragon", "Il crache du feu, mais il est très gentil !"),
            ("kangourou", "le kangourou", "Il saute très haut, avec son bébé dans sa poche !"),
            ("crocodile", "le crocodile", "Il a plein de dents et il sourit dans l'eau !"),
            ("zebre", "le zèbre", "Il a des rayures noires et blanches, comme un pyjama !"),
            ("tigre", "le tigre", "Il est rayé et il court très vite !"),
            ("perroquet", "le perroquet", "Il répète tout ce qu'on dit ! Coco !"),
            ("souris", "la souris", "Elle est toute petite et elle adore le fromage !"),
            ("abeille", "l'abeille", "Elle fabrique du miel ! Bzzz !"),
            ("otarie", "l'otarie", "Elle fait tourner un ballon sur son nez !"),
            ("pieuvre", "la pieuvre", "Elle a huit bras pour faire plein de câlins !"),
            ("chat", "le chat", "Il ronronne quand on le caresse ! Miaou !"),
            ("chien", "le chien", "Il remue la queue quand il est content ! Ouaf !"),
            ("lapin", "le lapin", "Il a de grandes oreilles et il adore les carottes !"),
        };

        public AccueilView()
        {
            var root = new Grid();
            Content = root;

            // Le décor du moment (jour / coucher / soir / nuit), et les étoiles.
            root.Children.Add(Decor());
            _stars = new Canvas { IsHitTestVisible = false, Opacity = 0 };
            root.Children.Add(_stars);
            AddStars();

            // Petites choses qui flottent doucement (ballon, papillon, étoile…).
            var floats = new Canvas { IsHitTestVisible = false };
            root.Children.Add(floats);
            AddFloat(floats, "ballon", "🎈", 0.06, 0.55, 6.5);
            AddFloat(floats, "papillon", "🦋", 0.14, 0.18, 5.0);
            AddFloat(floats, "etoile", "⭐", 0.70, 0.12, 4.2);
            AddFloat(floats, "nuage", "☁️", 0.80, 0.60, 8.0);
            AddFloat(floats, "montgolfiere", "🎈", 0.93, 0.36, 7.0);

            var column = new StackPanel { HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center };
            root.Children.Add(new Viewbox
            {
                Stretch = Stretch.Uniform,
                StretchDirection = StretchDirection.DownOnly,
                Margin = new Thickness(24, 12, 24, 12),
                Child = column,
            });

            var now = DateTime.Now;
            ReadName();

            // « Bonjour Laura ! »
            _hello = new TextBlock
            {
                Text = Hello(now) + " " + _name + " !",
                FontSize = 74,
                FontWeight = FontWeights.ExtraBold,
                Foreground = new SolidColorBrush(Color.FromRgb(0x3B, 0x2A, 0x5A)),
                HorizontalAlignment = HorizontalAlignment.Center,
            };
            column.Children.Add(Bubble(_hello, 36));

            // La date et la saison.
            column.Children.Add(Bubble(new TextBlock
            {
                Text = SeasonEmoji(now) + "  " + Cap(DateText(now)) + "   ·   " + Special(now),
                FontSize = 30,
                FontWeight = FontWeights.SemiBold,
                Foreground = new SolidColorBrush(Color.FromRgb(0x5A, 0x4A, 0x7A)),
                HorizontalAlignment = HorizontalAlignment.Center,
                Margin = new Thickness(0),
            }, 22, 10));

            // Les quatre cartes : dire bonjour · l'ami du jour · mes étoiles · surprise.
            var cards = new UniformGrid { Columns = 4, Margin = new Thickness(0, 16, 0, 10), HorizontalAlignment = HorizontalAlignment.Center };
            cards.Children.Add(HelloCard());
            column.Children.Add(cards);

            var friend = Friend(now);
            _friendPic = Art.Visual(friend.Img, "🐾", 175);
            var friendCard = Card(_friendPic, "L'ami du jour", Cap(friend.Name), Color.FromRgb(0xE2, 0xF6, 0xE4));
            friendCard.Click += (s, e) =>
            {
                Bounce(_friendPic);
                SoundFx.PopSound();
                Speech.Say("L'ami du jour, c'est " + friend.Name + " ! " + friend.Fun);
            };
            cards.Children.Add(friendCard);

            _starsText = new TextBlock
            {
                Text = "⭐ " + RewardStore.Balance,
                FontSize = 64, FontWeight = FontWeights.ExtraBold,
                Foreground = new SolidColorBrush(Color.FromRgb(0xF2, 0x9E, 0x00)),
                HorizontalAlignment = HorizontalAlignment.Center,
            };
            var starsCard = Card(_starsText, "Mes étoiles", "Mon carnet", Color.FromRgb(0xFF, 0xF4, 0xD6));
            starsCard.Click += (s, e) => BookRequested?.Invoke();
            cards.Children.Add(starsCard);
            RewardStore.Changed += () => Dispatcher.Invoke(() => _starsText.Text = "⭐ " + RewardStore.Balance);

            var giftPic = Art.Visual("cadeau", "🎁", 175);
            var giftCard = Card(giftPic, "Surprise !", "Regarde-moi", Color.FromRgb(0xFF, 0xE4, 0xF1));
            giftCard.Click += (s, e) =>
            {
                Bounce(giftPic);
                SoundFx.PopSound();
                CelebrationKit.Play(_fx);
                string[] wow = { "Ooooh !", "Waouh !", "Regarde le ciel !", "Que c'est beau !", "Encore ?", "Tadaaa !" };
                Speech.Say(wow[_rng.Next(wow.Length)]);
            };
            cards.Children.Add(giftCard);

            // Les grands boutons vers les activités.
            var go = new UniformGrid { Columns = 4, Margin = new Thickness(0, 6, 0, 0), HorizontalAlignment = HorizontalAlignment.Center };
            column.Children.Add(go);
            go.Children.Add(Go("🎮", "Jouer", "games"));
            go.Children.Add(Go("📅", "Mon parcours", "parcours"));
            go.Children.Add(Go("📖", "Histoires", "stories"));
            go.Children.Add(Go("🎵", "Musique", "music"));

            // Le soleil / la lune : un regard dessus, et la nuit tombe (ou le jour se lève).
            root.Children.Add(OrbButton());

            root.Children.Add(_fx);

            // L'heure tourne : si le vrai moment de la journée change (le soir
            // tombe pendant qu'on joue), le paysage suit tout seul.
            _autoPhase = PhaseNow();
            SetPhase(_autoPhase, false);
            _clock.Tick += (s, e) =>
            {
                int p = PhaseNow();
                if (p == _autoPhase) return;
                _autoPhase = p;
                if (IsVisible) SetPhase(p, true); else SetPhase(p, false);
            };
            _clock.Start();

            // Le bonjour à voix haute, à l'arrivée sur la page (pas plus d'une fois par heure).
            IsVisibleChanged += (s, e) =>
            {
                if (!(bool)e.NewValue) return;
                RefreshName(); // le prénom des réglages, même changé en cours de route
                if ((DateTime.Now - _lastHello).TotalMinutes < 60) return;
                _lastHello = DateTime.Now;
                var t = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(600) };
                t.Tick += (s2, e2) =>
                {
                    t.Stop();
                    var d = DateTime.Now;
                    Speech.Say(Hello(d) + " " + _name + " ! Aujourd'hui, c'est " + DateText(d) + ". " +
                               SeasonText(d) + " " + SpecialSay(d) + " L'ami du jour, c'est " + Friend(d).Name + " !");
                };
                t.Start();
            };
        }

        // ------------------------------------------------------------------
        //  Les morceaux
        // ------------------------------------------------------------------
        private static int PhaseNow()
        {
            int h = DateTime.Now.Hour;
            return h < 7 || h >= 21 ? 3 : h < 17 ? 0 : h < 19 ? 1 : 2;
        }

        private FrameworkElement Decor()
        {
            var keys = new[] { "scene-jour", "scene-coucher", "scene-soir", "scene-nuit" };
            var srcs = new ImageSource[4];
            for (int i = 0; i < 4; i++) srcs[i] = Art.Find(keys[i]);
            if (srcs[0] == null) return DecorBackground.ForGames();
            var g = new Grid { IsHitTestVisible = false };
            _layers = new Image[4];
            for (int i = 0; i < 4; i++)
            {
                _layers[i] = new Image { Source = srcs[i] ?? srcs[0], Stretch = Stretch.UniformToFill, Opacity = i == 0 ? 1 : 0 };
                g.Children.Add(_layers[i]);
            }
            // Un léger voile clair pour que les textes restent lisibles.
            g.Children.Add(new Border { Background = new SolidColorBrush(Color.FromArgb(0x33, 0xFF, 0xFF, 0xFF)) });
            return g;
        }

        // Fond les paysages l'un dans l'autre : la nuit tombe (coucher → soir →
        // nuit) ou le jour se lève, en ~2,7 s ; soleil et lune se relaient.
        private void SetPhase(int phase, bool animate)
        {
            if (phase == _phase) return;
            bool toNight = phase > _phase;
            _phase = phase;
            if (_layers != null)
                for (int k = 1; k <= 3; k++)
                {
                    double target = k <= phase ? 1 : 0;
                    if (!animate) { _layers[k].BeginAnimation(UIElement.OpacityProperty, null); _layers[k].Opacity = target; continue; }
                    int step = toNight ? k - 1 : 3 - k;
                    _layers[k].BeginAnimation(UIElement.OpacityProperty, new DoubleAnimation(target, TimeSpan.FromMilliseconds(1000))
                    {
                        BeginTime = TimeSpan.FromMilliseconds(step * 850),
                        EasingFunction = new SineEase { EasingMode = EasingMode.EaseInOut },
                    });
                }
            bool night = phase >= 2;
            var dur = TimeSpan.FromMilliseconds(animate ? 2200 : 0);
            _sun?.BeginAnimation(UIElement.OpacityProperty, new DoubleAnimation(night ? 0 : 1, dur));
            _moon?.BeginAnimation(UIElement.OpacityProperty, new DoubleAnimation(night ? 1 : 0, dur));
            _stars?.BeginAnimation(UIElement.OpacityProperty, new DoubleAnimation(phase == 3 ? 1 : phase == 2 ? 0.5 : 0, dur));
        }

        private Button OrbButton()
        {
            _sun = Art.Visual("soleil", "☀️", 150);
            _moon = Art.Visual("lune", "🌙", 150);
            var stack = new Grid();
            stack.Children.Add(_sun);
            stack.Children.Add(_moon);
            var b = new Button
            {
                Style = (Style)Application.Current.Resources["AnswerButton"],
                Width = 190, Height = 190,
                Background = new SolidColorBrush(Color.FromArgb(0x55, 0xFF, 0xFF, 0xFF)),
                HorizontalAlignment = HorizontalAlignment.Right,
                VerticalAlignment = VerticalAlignment.Top,
                Margin = new Thickness(0, 24, 28, 0),
                ToolTip = "Jour / nuit",
                Content = stack,
            };
            b.Click += (s, e) =>
            {
                bool night = _phase >= 2;
                SetPhase(night ? 0 : 3, true);
                Bounce(night ? _sun : _moon);
                SoundFx.PopSound();
                Speech.Say(night
                    ? "Le soleil se lève ! Cocorico ! Bonjour tout le monde !"
                    : "La nuit tombe... Regarde les étoiles ! Chut, tout le monde dort. Bonne nuit !");
            };
            return b;
        }

        private void AddStars()
        {
            var rng = new Random(7);
            for (int i = 0; i < 14; i++)
            {
                var star = new TextBlock { Text = i % 3 == 0 ? "⭐" : "✨", FontSize = 22 + rng.Next(22), Opacity = 0.4 + rng.NextDouble() * 0.6 };
                double fx = 0.03 + rng.NextDouble() * 0.94, fy = 0.03 + rng.NextDouble() * 0.42;
                _stars.Children.Add(star);
                void Place()
                {
                    Canvas.SetLeft(star, fx * Math.Max(1, _stars.ActualWidth));
                    Canvas.SetTop(star, fy * Math.Max(1, _stars.ActualHeight));
                }
                _stars.SizeChanged += (s, e) => Place();
                Place();
                // Scintillement doux, chacune à son rythme.
                star.BeginAnimation(UIElement.OpacityProperty, new DoubleAnimation(0.25, 1, TimeSpan.FromSeconds(1.2 + rng.NextDouble() * 2))
                { AutoReverse = true, RepeatBehavior = RepeatBehavior.Forever, BeginTime = TimeSpan.FromMilliseconds(rng.Next(2000)) });
            }
        }

        private static Border Bubble(UIElement child, double radius, double pad = 16) => new Border
        {
            CornerRadius = new CornerRadius(radius),
            Background = new SolidColorBrush(Color.FromArgb(0xD8, 0xFF, 0xFF, 0xFF)),
            Padding = new Thickness(pad * 2, pad, pad * 2, pad),
            Margin = new Thickness(0, 6, 0, 6),
            HorizontalAlignment = HorizontalAlignment.Center,
            Effect = new DropShadowEffect { BlurRadius = 18, ShadowDepth = 2, Opacity = 0.18 },
            Child = child,
        };

        // 👋 DIRE BONJOUR : la carte parle POUR l'enfant. Avec les photos de la
        // famille (Contenu\Famille), chaque regard salue quelqu'un d'autre
        // (« Bonjour Papa ! », photo à l'appui), puis tout le monde.
        // Le prénom vient des réglages ; relu à chaque affichage de la page.
        private string _name = "Laura";
        private TextBlock _hello;

        private void ReadName()
        {
            string n = (Settings.Load().ChildName ?? "").Trim();
            _name = n.Length == 0 ? "Laura" : n;
        }

        /// <summary>Relit le prénom des réglages et met la page à jour.</summary>
        public void RefreshName()
        {
            ReadName();
            if (_hello != null) _hello.Text = Hello(DateTime.Now) + " " + _name + " !";
        }

        private Button HelloCard()
        {
            var host = new Grid { Width = 150, Height = 150 };
            var wave = new TextBlock { Text = "👋", FontSize = 110, HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center };
            host.Children.Add(wave);
            var card = Card(host, "Dire bonjour", "Bonjour !", Color.FromRgb(0xDD, 0xEE, 0xFF));

            List<(string Name, string Path)> family;
            try { family = UserContent.LoadFamily().Take(8).ToList(); } catch { family = new List<(string, string)>(); }
            int turn = -1;
            card.Click += (s, e) =>
            {
                SoundFx.PopSound();
                string hello = Hello(DateTime.Now);
                string text;
                FrameworkElement pic = wave;
                if (family.Count > 0)
                {
                    turn = (turn + 1) % (family.Count + 1);
                    if (turn < family.Count)
                    {
                        var f = family[turn];
                        text = hello + " " + Cap(f.Name) + " !";
                        try
                        {
                            pic = new Border
                            {
                                CornerRadius = new CornerRadius(24), ClipToBounds = true, Width = 150, Height = 150,
                                Child = new Image { Source = UserContent.LoadBitmap(f.Path, 400), Stretch = Stretch.UniformToFill },
                            };
                        }
                        catch { pic = wave; }
                    }
                    else text = hello + " tout le monde ! C'est " + _name + " !";
                }
                else
                {
                    string[] v = { hello + " !", "Coucou !", hello + " tout le monde !", hello + ", c'est " + _name + " !" };
                    turn = (turn + 1) % v.Length;
                    text = v[turn];
                }
                host.Children.Clear();
                host.Children.Add(pic);
                Bounce(pic);
                Speech.Say(text);
                GazeStats.RecordComm("bonjour");
            };
            return card;
        }

        private static Button Card(FrameworkElement pic, string title, string sub, Color tint)
        {
            var content = new StackPanel { HorizontalAlignment = HorizontalAlignment.Center };
            content.Children.Add(new TextBlock
            {
                Text = title, FontSize = 20, FontWeight = FontWeights.SemiBold,
                Foreground = new SolidColorBrush(Color.FromRgb(0x5A, 0x4A, 0x7A)),
                HorizontalAlignment = HorizontalAlignment.Center, Margin = new Thickness(0, 0, 0, 8),
            });
            pic.HorizontalAlignment = HorizontalAlignment.Center;
            content.Children.Add(pic);
            content.Children.Add(new TextBlock
            {
                Text = sub, FontSize = 30, FontWeight = FontWeights.ExtraBold,
                Foreground = new SolidColorBrush(Color.FromRgb(0x3B, 0x2A, 0x5A)),
                HorizontalAlignment = HorizontalAlignment.Center, Margin = new Thickness(0, 8, 0, 0),
            });
            var b = new Button
            {
                Style = (Style)Application.Current.Resources["MenuTile"],
                Width = 270, Height = 290,
                Background = new SolidColorBrush(tint),
                Content = new Viewbox { Stretch = Stretch.Uniform, StretchDirection = StretchDirection.DownOnly, Margin = new Thickness(12), Child = content },
            };
            return b;
        }

        private Button Go(string icon, string label, string id)
        {
            var b = MenuKit.GameTile(icon, label);
            b.Width = 290;
            b.Height = 200;
            b.Click += (s, e) => Navigate?.Invoke(id);
            return b;
        }

        private void AddFloat(Canvas c, string img, string emoji, double fx, double fy, double seconds)
        {
            var el = Art.Visual(img, emoji, 90);
            el.Opacity = 0.85;
            c.Children.Add(el);
            void Place()
            {
                Canvas.SetLeft(el, fx * Math.Max(1, c.ActualWidth) - 45);
                Canvas.SetTop(el, fy * Math.Max(1, c.ActualHeight) - 45);
            }
            c.SizeChanged += (s, e) => Place();
            Place();
            var tr = new TranslateTransform();
            el.RenderTransform = tr;
            tr.BeginAnimation(TranslateTransform.YProperty, new DoubleAnimation(-14, 14, TimeSpan.FromSeconds(seconds))
            { AutoReverse = true, RepeatBehavior = RepeatBehavior.Forever, EasingFunction = new SineEase { EasingMode = EasingMode.EaseInOut } });
            tr.BeginAnimation(TranslateTransform.XProperty, new DoubleAnimation(-8, 8, TimeSpan.FromSeconds(seconds * 1.37))
            { AutoReverse = true, RepeatBehavior = RepeatBehavior.Forever, EasingFunction = new SineEase { EasingMode = EasingMode.EaseInOut } });
        }

        private static void Bounce(FrameworkElement el)
        {
            var sc = new ScaleTransform(1, 1);
            el.RenderTransform = sc;
            el.RenderTransformOrigin = new Point(0.5, 0.5);
            var a = new DoubleAnimation(1, 1.25, TimeSpan.FromMilliseconds(180)) { AutoReverse = true, EasingFunction = new BounceEase { Bounces = 2, Bounciness = 3 } };
            sc.BeginAnimation(ScaleTransform.ScaleXProperty, a);
            sc.BeginAnimation(ScaleTransform.ScaleYProperty, a);
        }

        // ------------------------------------------------------------------
        //  Les mots du jour
        // ------------------------------------------------------------------
        private static readonly CultureInfo Fr = new CultureInfo("fr-FR");

        private static string Hello(DateTime d) => d.Hour < 5 || d.Hour >= 18 ? "Bonsoir" : "Bonjour";

        private static string DateText(DateTime d) => d.ToString("dddd d MMMM", Fr).Replace(" 1 ", " 1er ");

        private static string Cap(string s) => s.Length == 0 ? s : char.ToUpper(s[0], Fr) + s.Substring(1);

        private static int Season(DateTime d)
        {
            int md = d.Month * 100 + d.Day;
            return md >= 1221 || md < 320 ? 0 : md < 621 ? 1 : md < 923 ? 2 : 3; // hiver, printemps, été, automne
        }

        private static string SeasonEmoji(DateTime d) => new[] { "❄️", "🌸", "☀️", "🍂" }[Season(d)];

        private static string SeasonText(DateTime d) => new[]
        {
            "C'est l'hiver : il fait froid, on met un gros manteau !",
            "C'est le printemps : les fleurs poussent !",
            "C'est l'été : il fait chaud, youpi !",
            "C'est l'automne : les feuilles tombent des arbres !",
        }[Season(d)];

        private static string Special(DateTime d)
        {
            switch (d.Month * 100 + d.Day)
            {
                case 101: return "🎉 Bonne année !";
                case 214: return "💖 Jour des amoureux";
                case 1031: return "🎃 Halloween !";
                case 1224: return "🎄 C'est bientôt Noël !";
                case 1225: return "🎄 Joyeux Noël !";
            }
            switch (d.DayOfWeek)
            {
                case DayOfWeek.Saturday:
                case DayOfWeek.Sunday: return "🎈 C'est le week-end !";
                case DayOfWeek.Wednesday: return "🌈 C'est mercredi !";
                case DayOfWeek.Monday: return "🚀 La semaine commence !";
                case DayOfWeek.Friday: return "🎉 Bientôt le week-end !";
                default: return "✨ Belle journée !";
            }
        }

        private static string SpecialSay(DateTime d)
        {
            switch (d.Month * 100 + d.Day)
            {
                case 101: return "Bonne année !";
                case 1031: return "C'est Halloween ! Bouh !";
                case 1224: return "Demain, c'est Noël !";
                case 1225: return "Joyeux Noël !";
            }
            return d.DayOfWeek == DayOfWeek.Saturday || d.DayOfWeek == DayOfWeek.Sunday ? "C'est le week-end !" : "";
        }

        private static (string Img, string Name, string Fun) Friend(DateTime d) =>
            Friends[(d.DayOfYear + d.Year) % Friends.Length];
    }
}
