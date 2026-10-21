using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Media.Effects;
using MesPremiersJeux.Lib;

namespace MesPremiersJeux.Views
{
    /// <summary>
    /// 💬 LA GRILLE DE COMMUNICATION : ouverte à tout moment par le bouton
    /// « Parler » (toujours visible, même en plein jeu), refermée d'un regard
    /// pour reprendre le jeu là où il était. Cinq pages de 12 grandes cases :
    /// l'essentiel (oui, non, encore, aide, j'ai mal...), les émotions, les
    /// envies, où j'ai mal, les gens et les mots gentils. Chaque case est dite
    /// à voix haute (ou avec la voix de papa/maman : Contenu\Voix\comm-clé-1.wav)
    /// et reste affichée en grand en haut, pour l'adulte qui arrive.
    /// Couleurs par famille de mots, comme dans les tableaux de communication
    /// (code de Fitzgerald) : besoins orange, émotions bleu, envies vert,
    /// gens jaune, mots sociaux rose.
    /// </summary>
    public sealed class CommBoard : UserControl
    {
        public static bool IsOpen { get; private set; }

        /// <summary>Demande de fermeture (bouton « Retour au jeu »).</summary>
        public event Action CloseRequested;

        private sealed class Item
        {
            public string Key, Label, Say, Img, Emoji;
            public bool Alert;              // fait sonner avant de parler (appel, douleur)
            public Func<FrameworkElement> Photo; // photo de famille
        }

        private sealed class Category
        {
            public string Key, Icon, Name;
            public Color Tint;
            public Func<List<Item>> Items;
            public int MinLevel = 1; // la grille GRANDIT avec le niveau de l'enfant
        }

        private static Item I(string key, string label, string say, string img, string emoji, bool alert = false) =>
            new Item { Key = key, Label = label, Say = say, Img = img, Emoji = emoji, Alert = alert };

        private static readonly Color Orange = Color.FromRgb(0xFF, 0xD8, 0xA8);
        private static readonly Color Blue = Color.FromRgb(0xC8, 0xE4, 0xFF);
        private static readonly Color Green = Color.FromRgb(0xCF, 0xF2, 0xC8);
        private static readonly Color Yellow = Color.FromRgb(0xFF, 0xF0, 0xA8);
        private static readonly Color Pink = Color.FromRgb(0xFF, 0xD3, 0xE6);
        private static readonly Color Red = Color.FromRgb(0xFF, 0xC4, 0xC4);

        private static readonly List<Item> Essentials = new List<Item>
        {
            I("oui", "Oui", "Oui !", "comm-oui", "✅"),
            I("non", "Non", "Non !", "comm-non", "❌"),
            I("encore", "Encore", "Encore ! J'en veux encore !", "comm-encore", "🔁"),
            I("fini", "Fini", "C'est fini ! J'arrête.", "comm-fini", "✋"),
            I("aide", "Aide-moi", "Aide-moi, s'il te plaît !", "comm-aide", "🙋"),
            I("viens", "Viens !", "Viens me voir, s'il te plaît !", "comm-viens", "🔔", alert: true),
            I("mal", "J'ai mal", "J'ai mal !", "comm-mal", "🤕", alert: true),
            I("faim", "J'ai faim", "J'ai faim !", "assiette", "🍽"),
            I("soif", "J'ai soif", "J'ai soif ! Je voudrais boire.", "verre", "🥛"),
            I("toilettes", "Toilettes", "J'ai besoin des toilettes, ou d'être changé.", "toilettes", "🚽"),
            I("calin", "Câlin", "Je veux un câlin !", "comm-calin", "🤗"),
            I("jetaime", "Je t'aime", "Je t'aime !", "coeur", "❤"),
        };

        private static readonly List<Item> Feelings = new List<Item>
        {
            I("bien", "Ça va bien", "Ça va bien ! Je suis de bonne humeur !", "comm-content", "😄"),
            I("rigolo", "C'est rigolo", "C'est trop rigolo !", "comm-rigolo", "😂"),
            I("triste", "Triste", "Je suis triste.", "comm-triste", "😢"),
            I("colere", "En colère", "Je suis en colère !", "comm-colere", "😠"),
            I("peur", "J'ai peur", "J'ai peur !", "comm-peur", "😨", alert: true),
            I("pasbien", "Ça ne va pas", "Ça ne va pas, je ne me sens pas bien.", "comm-malade", "🤒", alert: true),
            I("sommeil", "Sommeil", "J'ai sommeil.", "comm-sommeil", "😴"),
            I("chaud", "J'ai chaud", "J'ai chaud !", "soleil", "🥵"),
            I("froid", "J'ai froid", "J'ai froid !", "bonnet", "🥶"),
            I("ennui", "Je m'ennuie", "Je m'ennuie... on fait autre chose ?", "comm-ennui", "😐"),
            I("bruit", "Trop de bruit", "Il y a trop de bruit !", "comm-bruit", "🔊"),
            I("pause", "Pause", "Je veux faire une pause.", "comm-pause", "⏸"),
        };

        private static readonly List<Item> Wants = new List<Item>
        {
            I("manger", "Manger", "Je veux manger.", "assiette", "🍽"),
            I("boire", "Boire", "Je veux boire.", "verre", "🥛"),
            I("dormir", "Dormir", "Je veux dormir.", "comm-dormir", "🛏"),
            I("jouer", "Jouer", "Je veux jouer !", "cubes", "🧸"),
            I("musique", "Musique", "Je veux écouter de la musique !", "tambour", "🎵"),
            I("histoire", "Une histoire", "Je veux une histoire !", "livre", "📖"),
            I("dehors", "Dehors", "Je veux aller dehors !", "arbre", "🌳"),
            I("bain", "Le bain", "Je veux prendre un bain !", "baignoire", "🛁"),
            I("doudou", "Mon doudou", "Je veux mon doudou !", "ours-peluche", "🧸"),
            I("tele", "La télé", "Je veux regarder la télé.", "comm-tele", "📺"),
            I("bouger", "Changer de position", "Je veux changer de position.", "comm-position", "🔄"),
            I("ballon", "Le ballon", "Je veux jouer au ballon !", "ballon", "⚽"),
        };

        private static readonly List<Item> Body = new List<Item>
        {
            I("mal-tete", "La tête", "J'ai mal à la tête.", "comm-tete", "🤕", alert: true),
            I("mal-ventre", "Le ventre", "J'ai mal au ventre.", "comm-ventre", "🤢", alert: true),
            I("mal-dos", "Le dos", "J'ai mal au dos.", "comm-dos", "🔙", alert: true),
            I("mal-gorge", "La gorge", "J'ai mal à la gorge.", "comm-gorge", "😷", alert: true),
            I("mal-dents", "Les dents", "J'ai mal aux dents.", "comm-dents", "🦷", alert: true),
            I("mal-oreille", "L'oreille", "J'ai mal à l'oreille.", "comm-oreille", "👂", alert: true),
            I("mal-yeux", "Les yeux", "J'ai mal aux yeux.", "comm-yeux", "👁", alert: true),
            I("mal-bras", "Le bras", "J'ai mal au bras.", "comm-bras", "💪", alert: true),
            I("mal-main", "La main", "J'ai mal à la main.", "comm-main", "✋", alert: true),
            I("mal-jambe", "La jambe", "J'ai mal à la jambe.", "comm-jambe", "🦵", alert: true),
            I("mal-pied", "Le pied", "J'ai mal au pied.", "comm-pied", "🦶", alert: true),
            I("mal-partout", "Je ne sais pas", "J'ai mal, mais je ne sais pas où.", "comm-mal", "❓", alert: true),
        };

        private static readonly List<Item> Social = new List<Item>
        {
            I("bonjour", "Bonjour", "Bonjour !", "comm-bonjour", "👋"),
            I("aurevoir", "Au revoir", "Au revoir !", "comm-aurevoir", "👋"),
            I("merci", "Merci", "Merci !", "comm-merci", "🙏"),
            I("stp", "S'il te plaît", "S'il te plaît !", "comm-stp", "🙏"),
            I("bisou", "Bisou", "Un bisou !", "comm-bisou", "😘"),
            I("bravo", "Bravo", "Bravo !", "comm-bravo", "👏"),
        };

        // Les gens : les PHOTOS de la famille d'abord (Contenu\Famille), puis
        // les personnes habituelles qui manquent ; et les mots gentils.
        private static List<Item> People()
        {
            var list = new List<Item>();
            try
            {
                foreach (var (name, path) in UserContent.LoadFamily().Take(6))
                {
                    var p = path;
                    var nice = name.Length > 0 ? char.ToUpperInvariant(name[0]) + name.Substring(1) : name;
                    list.Add(new Item
                    {
                        Key = "pers-" + name.ToLowerInvariant(),
                        Label = nice,
                        Say = nice + " !",
                        Photo = () => new Border
                        {
                            CornerRadius = new CornerRadius(20),
                            ClipToBounds = true,
                            Width = 170,
                            Height = 170,
                            Child = new Image { Source = UserContent.LoadBitmap(p, 400), Stretch = Stretch.UniformToFill },
                        },
                    });
                }
            }
            catch { }
            var defaults = new[]
            {
                I("pers-maman", "Maman", "Maman !", "comm-maman", "👩"),
                I("pers-papa", "Papa", "Papa !", "comm-papa", "👨"),
                I("pers-mamie", "Mamie", "Mamie !", "comm-mamie", "👵"),
                I("pers-papi", "Papi", "Papi !", "comm-papi", "👴"),
                I("pers-copain", "Mon copain", "Mon copain !", "comm-copain", "🧒"),
                I("pers-docteur", "Le docteur", "Le docteur.", "comm-docteur", "🩺"),
            };
            foreach (var d in defaults)
            {
                if (list.Count >= 6) break;
                if (list.Any(x => string.Equals(x.Label, d.Label, StringComparison.OrdinalIgnoreCase))) continue;
                list.Add(d);
            }
            return list.Take(6).Concat(Social).ToList();
        }

        private static readonly Category[] Cats =
        {
            new Category { Icon = "⭐", Name = "L'essentiel", Tint = Orange, Items = () => Essentials },
            new Category { Icon = "😊", Name = "Je ressens", Tint = Blue, Items = () => Feelings },
            new Category { Icon = "🙌", Name = "Je veux", Tint = Green, Items = () => Wants },
            new Category { Icon = "🤕", Name = "J'ai mal où ?", Tint = Red, Items = () => Body },
            new Category { Icon = "👪", Name = "Les gens", Tint = Yellow, Items = People },
            new Category { Key = "jour", Icon = "📅", Name = "Ma journée", Tint = Pink, Items = () => DayItems },
            new Category { Key = "phrase", Icon = "🧩", Name = "Je fais une phrase", Tint = Color.FromRgb(0xE0, 0xE8, 0xFF), Items = () => Starters, MinLevel = 2 },
        };

        // --- 📅 MA JOURNÉE : raconter ce qu'on a fait (les pictos s'ajoutent, puis on raconte). ---
        private static readonly List<Item> DayItems = new List<Item>
        {
            I("raconte", "Raconter", "Aujourd'hui...", "livre", "📣"),
            I("ecole", "L'école", "l'école", "bus", "🏫"), I("cantine", "La cantine", "la cantine", "assiette", "🍽"),
            I("copains", "Les copains", "les copains", "ballon-foot", "🧒"), I("promenade", "La promenade", "la promenade", "velo", "🚶"),
            I("piscine", "La piscine", "la piscine", "maillot", "🏊"), I("bain2", "Le bain", "le bain", "baignoire", "🛁"),
            I("tele2", "La télé", "la télé", "radio", "📺"), I("musique2", "La musique", "la musique", "note-musique", "🎵"),
            I("jeux", "Les jeux", "les jeux", "cubes", "🧸"), I("calin", "Un câlin", "un câlin", "coeur", "🤗"),
            I("docteur", "Le docteur", "le docteur", "ambulance", "🩺"),
        };
        private static readonly List<Item> _day = new List<Item>();
        private static DateTime _dayDate = DateTime.MinValue;

        // --- 🧩 JE FAIS UNE PHRASE : un début, puis un mot → la phrase entière. ---
        private static readonly List<Item> Starters = new List<Item>
        {
            I("s-veux", "Je veux", "Je veux", "comm-veux", "🙌"), I("s-aime", "J'aime", "J'aime", "coeur", "💖"),
            I("s-pasaime", "Je n'aime pas", "Je n'aime pas", "comm-non", "🙅"), I("s-encore", "Encore", "Encore", "comm-encore", "🔁"),
            I("s-donne", "Donne-moi", "Donne-moi", "comm-donne", "🤲"), I("s-vois", "Je vois", "Je vois", "comm-vois", "👀"),
            I("s-fini", "J'ai fini", "J'ai fini", "comm-fini", "✅"), I("s-ou", "Où est", "Où est", "comm-ou", "❓"),
        };
        private static readonly List<Item> SentenceWords = new List<Item>
        {
            I("w-jus", "Le jus", "le jus", "verre", "🧃"), I("w-gateau", "Le gâteau", "le gâteau", "gateau", "🎂"),
            I("w-pomme", "La pomme", "la pomme", "pomme", "🍎"), I("w-ballon", "Le ballon", "le ballon", "ballon", "🎈"),
            I("w-livre", "Le livre", "le livre", "livre", "📖"), I("w-doudou", "Mon doudou", "mon doudou", "ours-peluche", "🧸"),
            I("w-musique", "La musique", "la musique", "note-musique", "🎵"), I("w-dehors", "Dehors", "dehors", "arbre", "🌳"),
            I("w-dodo", "Dodo", "dormir", "lune", "🌙"), I("w-bain", "Le bain", "le bain", "baignoire", "🛁"),
            I("w-calin", "Un câlin", "un câlin", "coeur", "🤗"), I("w-chat", "Le chat", "le chat", "chat", "🐱"),
        };
        private Item _starter; // le début de phrase choisi (null = on choisit le début)

        private readonly UniformGrid _grid = new UniformGrid { Columns = 4, Rows = 3, Margin = new Thickness(6) };
        private readonly List<Button> _tabs = new List<Button>();
        private readonly UniformGrid _tabsPanel = new UniformGrid { Columns = 1, Margin = new Thickness(0, 0, 8, 0) };
        private int _tabCount;

        private void BuildTabs()
        {
            var visible = Cats.Where(c => c.MinLevel <= Level.Current).ToList();
            if (visible.Count == _tabCount && _tabs.Count > 0) return;
            _tabCount = visible.Count;
            _tabsPanel.Children.Clear();
            _tabs.Clear();
            _tabsPanel.Rows = visible.Count;
            for (int i = 0; i < visible.Count; i++)
            {
                int idx = Array.IndexOf(Cats, visible[i]);
                var t = BigButton(Cats[idx].Icon, Cats[idx].Name, Cats[idx].Tint);
                t.Width = double.NaN;
                t.Height = double.NaN;
                t.Click += (s, e) => { ShowCategory(idx); Speech.SayAlways(Cats[idx].Name + " !"); };
                _tabsPanel.Children.Add(t);
                _tabs.Add(t);
            }
        }
        private readonly ContentControl _msgPic = new ContentControl { Width = 110, Height = 110 };
        private readonly TextBlock _msgText = new TextBlock
        {
            FontSize = 46,
            FontWeight = FontWeights.Bold,
            Foreground = new SolidColorBrush(Color.FromRgb(0x3B, 0x2A, 0x5A)),
            VerticalAlignment = VerticalAlignment.Center,
            TextTrimming = TextTrimming.CharacterEllipsis,
            Margin = new Thickness(18, 0, 0, 0),
            Text = "Je veux dire...",
        };
        private Item _last;

        public CommBoard()
        {
            Background = new LinearGradientBrush(Color.FromRgb(0xF6, 0xF0, 0xFF), Color.FromRgb(0xFF, 0xF6, 0xEC), 90);

            var root = new Grid { Margin = new Thickness(14) };
            root.RowDefinitions.Add(new RowDefinition { Height = new GridLength(150) });
            root.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });
            root.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(250) });
            root.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });

            // --- En haut : le message dit (en grand), Redire, Retour au jeu ---
            var top = new Grid();
            top.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            top.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            top.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            var msg = new Border
            {
                Background = Brushes.White,
                CornerRadius = new CornerRadius(34),
                Padding = new Thickness(20, 10, 20, 10),
                Margin = new Thickness(0, 0, 12, 10),
                Effect = new DropShadowEffect { BlurRadius = 14, ShadowDepth = 2, Opacity = 0.18 },
                Child = new StackPanel { Orientation = Orientation.Horizontal, Children = { _msgPic, _msgText } },
            };
            top.Children.Add(msg);

            var again = BigButton("🔁", "Redire", Color.FromRgb(0xDC, 0xD6, 0xFF));
            again.Click += (s, e) => { if (_last != null) SayItem(_last, record: false); };
            Grid.SetColumn(again, 1);
            top.Children.Add(again);

            var back = BigButton("🎮", "Retour au jeu", Color.FromRgb(0xB8, 0xF0, 0xC0));
            back.Click += (s, e) => CloseRequested?.Invoke();
            Grid.SetColumn(back, 2);
            top.Children.Add(back);
            Grid.SetColumnSpan(top, 2);
            root.Children.Add(top);

            // --- À gauche : les pages (celles du niveau de l'enfant) ---
            Grid.SetRow(_tabsPanel, 1);
            root.Children.Add(_tabsPanel);
            BuildTabs();

            // --- Au centre : les 12 cases ---
            Grid.SetRow(_grid, 1);
            Grid.SetColumn(_grid, 1);
            root.Children.Add(_grid);

            Content = root;
            ShowCategory(0);
        }

        /// <summary>Le bouton « Parler », toujours accessible (posé par la fenêtre).</summary>
        public static Button MakeOpenButton()
        {
            var b = new Button
            {
                Style = (Style)Application.Current.Resources["AnswerButton"],
                Width = 128,
                Height = 128,
                HorizontalAlignment = HorizontalAlignment.Right,
                VerticalAlignment = VerticalAlignment.Bottom,
                Margin = new Thickness(0, 0, 8, 8), // tout au coin, en bas à droite
                Background = new LinearGradientBrush(Color.FromRgb(0xFF, 0x8F, 0xC8), Color.FromRgb(0xA0, 0x6C, 0xD5), 90),
                BorderBrush = Brushes.White,
                BorderThickness = new Thickness(5),
                ToolTip = "Parler (grille de communication)",
                Content = new StackPanel
                {
                    Children =
                    {
                        new TextBlock { Text = "💬", FontSize = 50, Foreground = Brushes.White, HorizontalAlignment = HorizontalAlignment.Center },
                        new TextBlock { Text = "Parler", FontSize = 22, FontWeight = FontWeights.Bold, Foreground = Brushes.White, HorizontalAlignment = HorizontalAlignment.Center },
                    },
                },
            };
            return b;
        }

        /// <summary>✅ ❌ OUI / NON toujours à portée de regard (coin bas gauche) :
        /// pour répondre à une question qu'on lui pose, sans ouvrir la grille.</summary>
        public static FrameworkElement MakeYesNoBar()
        {
            var bar = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                HorizontalAlignment = HorizontalAlignment.Left,
                VerticalAlignment = VerticalAlignment.Bottom,
                Margin = new Thickness(8, 0, 0, 8),
            };
            bar.Children.Add(YesNoButton("✓", "Oui", "Oui !", "oui", Color.FromRgb(0x4C, 0xC2, 0x6B), Color.FromRgb(0x2E, 0x9E, 0x4F)));
            bar.Children.Add(YesNoButton("✗", "Non", "Non !", "non", Color.FromRgb(0xFF, 0x7A, 0x7A), Color.FromRgb(0xE0, 0x4A, 0x4A)));
            return bar;
        }

        private static Button YesNoButton(string glyph, string label, string say, string key, Color c1, Color c2)
        {
            var b = new Button
            {
                Style = (Style)Application.Current.Resources["AnswerButton"],
                Width = 118,
                Height = 118,
                Margin = new Thickness(0, 0, 8, 0),
                Background = new LinearGradientBrush(c1, c2, 90),
                BorderBrush = Brushes.White,
                BorderThickness = new Thickness(5),
                ToolTip = label,
                Content = new StackPanel
                {
                    Children =
                    {
                        new TextBlock { Text = glyph, FontSize = 48, FontWeight = FontWeights.ExtraBold, Foreground = Brushes.White, HorizontalAlignment = HorizontalAlignment.Center, Margin = new Thickness(0, -4, 0, -6) },
                        new TextBlock { Text = label, FontSize = 24, FontWeight = FontWeights.Bold, Foreground = Brushes.White, HorizontalAlignment = HorizontalAlignment.Center },
                    },
                },
            };
            b.Click += (o, ev) =>
            {
                if (!VoiceBank.Play("comm-" + key)) Speech.SayAlways(say);
                GazeStats.RecordComm(key);
                var sc = new ScaleTransform(1, 1);
                b.RenderTransformOrigin = new Point(0.5, 0.5);
                b.RenderTransform = sc;
                var a = new DoubleAnimation(1, 1.18, TimeSpan.FromMilliseconds(150)) { AutoReverse = true };
                sc.BeginAnimation(ScaleTransform.ScaleXProperty, a);
                sc.BeginAnimation(ScaleTransform.ScaleYProperty, a);
            };
            return b;
        }

        /// <summary>Ouverture : la grille s'annonce (« J'ai quelque chose à dire ! »).</summary>
        public void Open()
        {
            IsOpen = true;
            BuildTabs();
            _starter = null;
            ShowCategory(0);
            Speech.SayAlways("J'ai quelque chose à dire !");
        }

        public void MarkClosed() => IsOpen = false;

        private void ShowCategory(int i)
        {
            var visible = Cats.Where(c => c.MinLevel <= Level.Current).ToList();
            int vi = visible.IndexOf(Cats[i]);
            for (int k = 0; k < _tabs.Count; k++)
            {
                _tabs[k].BorderBrush = k == vi ? new SolidColorBrush(Color.FromRgb(0x7E, 0x3F, 0xF2)) : Brushes.Transparent;
                _tabs[k].BorderThickness = new Thickness(k == vi ? 7 : 0);
            }
            _grid.Children.Clear();
            var cat = Cats[i];
            if (cat.Key == "phrase") { ShowSentence(cat); return; }
            if (cat.Key == "jour") { ShowDay(cat); return; }
            var items = cat.Items();
            foreach (var it in items.Take(12))
            {
                var item = it;
                var cell = Cell(item, item.Key.StartsWith("pers-") ? Yellow : SocialTint(item) ?? cat.Tint);
                cell.Click += (s, e) => SayItem(item, record: true, btn: cell);
                _grid.Children.Add(cell);
            }
        }

        // 🧩 La phrase : d'abord le début (« Je veux »), puis le mot (« le gâteau »).
        private void ShowSentence(Category cat)
        {
            if (_starter == null)
            {
                _msgText.Text = "Je fais une phrase...";
                foreach (var it in Starters.Take(12))
                {
                    var item = it;
                    var cell = Cell(item, cat.Tint);
                    cell.Click += (s, e) =>
                    {
                        _starter = item;
                        _msgText.Text = item.Say + "...";
                        _msgPic.Content = Art.Visual(item.Img, item.Emoji, 110);
                        Speech.SayAlways(item.Say + "...");
                        ShowSentence(cat);
                    };
                    _grid.Children.Add(cell);
                }
                return;
            }
            _grid.Children.Clear();
            var words = SentenceWords.ToList();
            // Les gens de la famille font aussi des mots (« Je veux papa »).
            try
            {
                foreach (var p in People().Where(x => x.Key.StartsWith("pers-")).Take(3))
                    words.Insert(0, p);
            }
            catch { }
            foreach (var it in words.Take(12))
            {
                var item = it;
                var cell = Cell(item, item.Key.StartsWith("pers-") ? Yellow : Green);
                cell.Click += (s, e) =>
                {
                    string obj = item.Key.StartsWith("pers-") ? item.Label : item.Say;
                    var sentence = new Item { Key = "phrase", Label = _starter.Say + " " + obj, Say = _starter.Say + " " + obj + " !", Img = item.Img, Emoji = item.Emoji, Photo = item.Photo };
                    SayItem(sentence, record: true, btn: cell);
                    GazeStats.RecordComm("phrase-" + _starter.Key + "-" + item.Key);
                    _starter = null;
                    var t = new System.Windows.Threading.DispatcherTimer { Interval = TimeSpan.FromMilliseconds(2500) };
                    t.Tick += (s2, e2) => { t.Stop(); if (IsOpen && _starter == null) ShowSentence(cat); };
                    t.Start();
                };
                _grid.Children.Add(cell);
            }
        }

        // 📅 Ma journée : chaque picto s'ajoute à l'histoire du jour ; « Raconter » la dit.
        private void ShowDay(Category cat)
        {
            if (_dayDate != DateTime.Today) { _day.Clear(); _dayDate = DateTime.Today; }
            foreach (var it in DayItems.Take(12))
            {
                var item = it;
                bool done = _day.Contains(item);
                var cell = Cell(item, item.Key == "raconte" ? Orange : done ? Color.FromRgb(0xB8, 0xF0, 0xC0) : cat.Tint);
                if (done) cell.Effect = new DropShadowEffect { BlurRadius = 24, ShadowDepth = 0, Color = Color.FromRgb(0x4C, 0xC2, 0x6B), Opacity = 0.9 };
                cell.Click += (s, e) =>
                {
                    if (item.Key == "raconte") { TellDay(cell); return; }
                    if (!_day.Contains(item)) { _day.Add(item); GazeStats.RecordComm("jour-" + item.Key); }
                    var said = new Item { Key = "jour-" + item.Key, Label = item.Label, Say = "J'ai fait " + item.Say + " !", Img = item.Img, Emoji = item.Emoji };
                    SayItem(said, record: false, btn: cell);
                    ShowDay(cat);
                };
                _grid.Children.Add(cell);
            }
        }

        private void TellDay(Button btn)
        {
            string story = _day.Count == 0 ? "Aujourd'hui... je n'ai encore rien raconté !"
                : "Aujourd'hui, j'ai fait " + (_day.Count == 1 ? _day[0].Say : string.Join(", ", _day.Take(_day.Count - 1).Select(d => d.Say)) + " et " + _day.Last().Say) + " !";
            SayItem(new Item { Key = "raconte", Label = "Ma journée", Say = story, Img = "livre", Emoji = "📣" }, record: true, btn: btn);
        }

        private static Color? SocialTint(Item it) => Social.Contains(it) ? Pink : (Color?)null;

        private static Button Cell(Item it, Color tint)
        {
            FrameworkElement pic = it.Photo != null ? it.Photo() : Art.Visual(it.Img, it.Emoji, 170);
            var content = new StackPanel
            {
                Children =
                {
                    new ContentControl { Content = pic, HorizontalAlignment = HorizontalAlignment.Center },
                    new TextBlock
                    {
                        Text = it.Label,
                        FontSize = 34,
                        FontWeight = FontWeights.Bold,
                        Foreground = new SolidColorBrush(Color.FromRgb(0x3B, 0x2A, 0x5A)),
                        HorizontalAlignment = HorizontalAlignment.Center,
                        Margin = new Thickness(0, 6, 0, 0),
                    },
                },
            };
            return new Button
            {
                Style = (Style)Application.Current.Resources["AnswerButton"],
                Margin = new Thickness(8),
                Background = new SolidColorBrush(tint),
                RenderTransformOrigin = new Point(0.5, 0.5),
                Content = new Viewbox { Stretch = Stretch.Uniform, StretchDirection = StretchDirection.DownOnly, Child = content },
            };
        }

        private static Button BigButton(string icon, string label, Color bg) => new Button
        {
            Style = (Style)Application.Current.Resources["AnswerButton"],
            Margin = new Thickness(6, 0, 6, 10),
            MinWidth = 190,
            Background = new SolidColorBrush(bg),
            Content = new Viewbox
            {
                Stretch = Stretch.Uniform,
                StretchDirection = StretchDirection.DownOnly,
                Child = new StackPanel
                {
                    Orientation = Orientation.Horizontal,
                    Children =
                    {
                        new TextBlock { Text = icon, FontSize = 44, VerticalAlignment = VerticalAlignment.Center },
                        new TextBlock
                        {
                            Text = label,
                            FontSize = 30,
                            FontWeight = FontWeights.Bold,
                            Foreground = new SolidColorBrush(Color.FromRgb(0x3B, 0x2A, 0x5A)),
                            VerticalAlignment = VerticalAlignment.Center,
                            Margin = new Thickness(10, 0, 0, 0),
                        },
                    },
                },
            },
        };

        private void SayItem(Item it, bool record, Button btn = null)
        {
            _last = it;
            _msgText.Text = it.Say;
            _msgPic.Content = it.Photo != null ? it.Photo() : Art.Visual(it.Img, it.Emoji, 110);
            if (record) GazeStats.RecordComm(it.Key);

            // Appel, douleur, peur : une petite sonnerie d'abord, pour que
            // l'adulte tourne la tête.
            if (it.Alert)
            {
                SoundFx.Note(4);
                var t = new System.Windows.Threading.DispatcherTimer { Interval = TimeSpan.FromMilliseconds(350) };
                t.Tick += (s, e) => { t.Stop(); SoundFx.Note(2); };
                t.Start();
            }
            // La voix de papa/maman pour cette case (comm-<clé>-1.wav), sinon la synthèse.
            var delay = it.Alert ? 800 : 0;
            Action speak = () => { if (!VoiceBank.Play("comm-" + it.Key)) Speech.SayAlways(it.Say); };
            if (delay == 0) speak();
            else
            {
                var t2 = new System.Windows.Threading.DispatcherTimer { Interval = TimeSpan.FromMilliseconds(delay) };
                t2.Tick += (s, e) => { t2.Stop(); speak(); };
                t2.Start();
            }

            if (btn != null)
            {
                var sc = new ScaleTransform(1, 1);
                btn.RenderTransform = sc;
                var pop = new DoubleAnimation(1, 1.08, TimeSpan.FromMilliseconds(200))
                { AutoReverse = true, EasingFunction = new SineEase() };
                sc.BeginAnimation(ScaleTransform.ScaleXProperty, pop);
                sc.BeginAnimation(ScaleTransform.ScaleYProperty, pop);
            }
        }
    }
}
