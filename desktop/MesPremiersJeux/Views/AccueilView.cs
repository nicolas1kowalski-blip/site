using System;
using System.Globalization;
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

        private readonly Canvas _fx = new Canvas { IsHitTestVisible = false };
        private readonly TextBlock _starsText;
        private FrameworkElement _friendPic;
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

            // Le décor du moment (jour / coucher / soir / nuit).
            root.Children.Add(Decor());

            // Petites choses qui flottent doucement (ballon, papillon, étoile…).
            var floats = new Canvas { IsHitTestVisible = false };
            root.Children.Add(floats);
            AddFloat(floats, "ballon", "🎈", 0.06, 0.55, 6.5);
            AddFloat(floats, "papillon", "🦋", 0.14, 0.18, 5.0);
            AddFloat(floats, "etoile", "⭐", 0.86, 0.14, 4.2);
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
            string name = (Settings.Load().ChildName ?? "").Trim();
            if (name.Length == 0) name = "Laura";

            // « Bonjour Laura ! »
            column.Children.Add(Bubble(new TextBlock
            {
                Text = Hello(now) + " " + name + " !",
                FontSize = 74,
                FontWeight = FontWeights.ExtraBold,
                Foreground = new SolidColorBrush(Color.FromRgb(0x3B, 0x2A, 0x5A)),
                HorizontalAlignment = HorizontalAlignment.Center,
            }, 36));

            // La date et la saison.
            column.Children.Add(Bubble(new TextBlock
            {
                Text = SeasonEmoji(now) + "  " + Cap(DateText(now)) + "   ·   " + Special(now),
                FontSize = 38,
                FontWeight = FontWeights.SemiBold,
                Foreground = new SolidColorBrush(Color.FromRgb(0x5A, 0x4A, 0x7A)),
                HorizontalAlignment = HorizontalAlignment.Center,
                Margin = new Thickness(0),
            }, 22, 10));

            // Les trois cartes « fun » : l'ami du jour · mes étoiles · surprise.
            var cards = new UniformGrid { Columns = 3, Margin = new Thickness(0, 16, 0, 10), HorizontalAlignment = HorizontalAlignment.Center };
            column.Children.Add(cards);

            var friend = Friend(now);
            _friendPic = Art.Visual(friend.Img, "🐾", 150);
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
            var starsCard = Card(_starsText, "Mes étoiles", "Ma boutique", Color.FromRgb(0xFF, 0xF4, 0xD6));
            starsCard.Click += (s, e) =>
            {
                int n = RewardStore.Balance;
                Speech.Say(n == 0 ? "Pas encore d'étoile ! Viens jouer pour en gagner !"
                    : "Tu as " + n + (n > 1 ? " étoiles" : " étoile") + " ! Bravo ! On va voir la boutique ?");
                if (n > 0) ShopRequested?.Invoke();
            };
            cards.Children.Add(starsCard);
            RewardStore.Changed += () => Dispatcher.Invoke(() => _starsText.Text = "⭐ " + RewardStore.Balance);

            var giftPic = Art.Visual("cadeau", "🎁", 150);
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

            root.Children.Add(_fx);

            // Le bonjour à voix haute, à l'arrivée sur la page (pas plus d'une fois par heure).
            IsVisibleChanged += (s, e) =>
            {
                if (!(bool)e.NewValue) return;
                if ((DateTime.Now - _lastHello).TotalMinutes < 60) return;
                _lastHello = DateTime.Now;
                var t = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(600) };
                t.Tick += (s2, e2) =>
                {
                    t.Stop();
                    var d = DateTime.Now;
                    Speech.Say(Hello(d) + " " + name + " ! Aujourd'hui, c'est " + DateText(d) + ". " +
                               SeasonText(d) + " " + SpecialSay(d) + " L'ami du jour, c'est " + Friend(d).Name + " !");
                };
                t.Start();
            };
        }

        // ------------------------------------------------------------------
        //  Les morceaux
        // ------------------------------------------------------------------
        private FrameworkElement Decor()
        {
            int h = DateTime.Now.Hour;
            string scene = h < 7 || h >= 21 ? "scene-nuit" : h < 17 ? "scene-jour" : h < 19 ? "scene-coucher" : "scene-soir";
            var src = Art.Find(scene);
            if (src == null) return DecorBackground.ForGames();
            var g = new Grid { IsHitTestVisible = false };
            g.Children.Add(new Image { Source = src, Stretch = Stretch.UniformToFill });
            // Un léger voile clair pour que les textes restent lisibles.
            g.Children.Add(new Border { Background = new SolidColorBrush(Color.FromArgb(0x33, 0xFF, 0xFF, 0xFF)) });
            return g;
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

        private static Button Card(FrameworkElement pic, string title, string sub, Color tint)
        {
            var content = new StackPanel { HorizontalAlignment = HorizontalAlignment.Center };
            content.Children.Add(new TextBlock
            {
                Text = title, FontSize = 24, FontWeight = FontWeights.Bold,
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
                Width = 300, Height = 300,
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
