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
            public string Icon, Name;
            public Color Tint;
            public Func<List<Item>> Items;
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
        };

        private readonly UniformGrid _grid = new UniformGrid { Columns = 4, Rows = 3, Margin = new Thickness(6) };
        private readonly List<Button> _tabs = new List<Button>();
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

            // --- À gauche : les pages ---
            var tabs = new UniformGrid { Columns = 1, Rows = Cats.Length, Margin = new Thickness(0, 0, 8, 0) };
            for (int i = 0; i < Cats.Length; i++)
            {
                int idx = i;
                var t = BigButton(Cats[i].Icon, Cats[i].Name, Cats[i].Tint);
                t.Width = double.NaN;
                t.Height = double.NaN;
                t.Click += (s, e) => { ShowCategory(idx); Speech.SayAlways(Cats[idx].Name + " !"); };
                tabs.Children.Add(t);
                _tabs.Add(t);
            }
            Grid.SetRow(tabs, 1);
            root.Children.Add(tabs);

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
                HorizontalAlignment = HorizontalAlignment.Left,
                VerticalAlignment = VerticalAlignment.Bottom,
                Margin = new Thickness(8, 0, 0, 8), // tout au coin, en bas à gauche
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

        /// <summary>Ouverture : la grille s'annonce (« J'ai quelque chose à dire ! »).</summary>
        public void Open()
        {
            IsOpen = true;
            ShowCategory(0);
            Speech.SayAlways("J'ai quelque chose à dire !");
        }

        public void MarkClosed() => IsOpen = false;

        private void ShowCategory(int i)
        {
            for (int k = 0; k < _tabs.Count; k++)
            {
                _tabs[k].BorderBrush = k == i ? new SolidColorBrush(Color.FromRgb(0x7E, 0x3F, 0xF2)) : Brushes.Transparent;
                _tabs[k].BorderThickness = new Thickness(k == i ? 7 : 0);
            }
            _grid.Children.Clear();
            var cat = Cats[i];
            var items = cat.Items();
            foreach (var it in items.Take(12))
            {
                var item = it;
                var cell = Cell(item, item.Key.StartsWith("pers-") ? Yellow : SocialTint(item) ?? cat.Tint);
                cell.Click += (s, e) => SayItem(item, record: true, btn: cell);
                _grid.Children.Add(cell);
            }
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
