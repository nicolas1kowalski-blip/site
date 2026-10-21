using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Media.Effects;
using MesPremiersJeux.Gaze;
using MesPremiersJeux.Lib;

namespace MesPremiersJeux.Views
{
    /// <summary>
    /// 🙋 JE CHOISIS : le vrai choix du quotidien. Le parent prend 2 à 4 images
    /// (photos de la famille, photos déposées dans Contenu\Choix, ou dessins de
    /// la banque : jus, gâteau, livre, ballon…), puis l'enfant regarde celle
    /// qu'elle veut : la voix le dit pour elle (« Je veux le jus ! »).
    /// Deux temps : 1) le parent choisit (à la souris), 2) l'enfant choisit (au regard).
    /// </summary>
    public sealed class ChoiceView : UserControl
    {
        public event Action CloseRequested;

        private sealed class Pick
        {
            public string Key, Label, Say, Img, Emoji, Photo;
        }

        private static readonly Pick[] Bank =
        {
            P("jus", "Le jus", "le jus", "verre", "🧃"), P("eau", "De l'eau", "de l'eau", "bouilloire", "💧"), P("lait", "Du lait", "du lait", "bol", "🥛"),
            P("pomme", "La pomme", "la pomme", "pomme", "🍎"), P("banane", "La banane", "la banane", "banane", "🍌"), P("fraise", "Les fraises", "des fraises", "fraise", "🍓"),
            P("gateau", "Le gâteau", "du gâteau", "gateau", "🎂"), P("cookie", "Le biscuit", "un biscuit", "cookie", "🍪"), P("glace", "La glace", "une glace", "glace", "🍦"),
            P("pizza", "La pizza", "de la pizza", "pizza", "🍕"), P("livre", "Un livre", "un livre", "livre", "📖"), P("ballon", "Le ballon", "le ballon", "ballon", "🎈"),
            P("doudou", "Mon doudou", "mon doudou", "ours-peluche", "🧸"), P("puzzle", "Le puzzle", "le puzzle", "puzzle", "🧩"), P("cubes", "Les cubes", "les cubes", "cubes", "🧱"),
            P("poupee", "La poupée", "la poupée", "poupee", "🪆"), P("musique", "La musique", "la musique", "note-musique", "🎵"), P("tele", "La télé", "la télé", "radio", "📺"),
            P("dehors", "Dehors", "aller dehors", "arbre", "🌳"), P("velo", "Le vélo", "le vélo", "velo", "🚲"), P("bain", "Le bain", "le bain", "baignoire", "🛁"),
            P("dodo", "Dodo", "dormir", "lune", "🌙"), P("calin", "Un câlin", "un câlin", "coeur", "🤗"), P("tablette", "Jouer ici", "jouer à la tablette", "robot", "🤖"),
            P("rouge", "Le rouge", "le rouge", "coeur-rose", "🔴"), P("bleu", "Le bleu", "le bleu", "baleine", "🔵"), P("jaune", "Le jaune", "le jaune", "soleil", "🟡"),
            P("vert", "Le vert", "le vert", "grenouille", "🟢"), P("chien", "Le chien", "le chien", "chien", "🐶"), P("chat", "Le chat", "le chat", "chat", "🐱"),
        };

        private static Pick P(string key, string label, string say, string img, string emoji) =>
            new Pick { Key = key, Label = label, Say = say, Img = img, Emoji = emoji };

        private readonly Grid _root = new Grid();
        private readonly List<Pick> _selected = new List<Pick>();
        private readonly Dictionary<Pick, Button> _tiles = new Dictionary<Pick, Button>();
        private Button _go;
        private TextBlock _hint;

        public ChoiceView()
        {
            Background = new LinearGradientBrush(Color.FromRgb(0xEE, 0xF6, 0xFF), Color.FromRgb(0xFF, 0xF4, 0xE8), 90);
            Content = _root;
        }

        private static FrameworkElement Picture(Pick p, double size)
        {
            if (p.Photo != null)
            {
                try
                {
                    return new Border
                    {
                        CornerRadius = new CornerRadius(22), ClipToBounds = true, Width = size, Height = size,
                        Child = new Image { Source = UserContent.LoadBitmap(p.Photo, 700), Stretch = Stretch.UniformToFill },
                    };
                }
                catch { }
            }
            return Art.Visual(p.Img, p.Emoji, size);
        }

        /// <summary>Temps 1 : le parent compose le choix.</summary>
        public void Open()
        {
            _selected.Clear();
            _tiles.Clear();
            _root.Children.Clear();
            _root.RowDefinitions.Clear();
            _root.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
            _root.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });

            var top = new DockPanel { Margin = new Thickness(16, 10, 16, 6) };
            var cancel = Big("✖  Annuler", 160, Color.FromRgb(0xFF, 0xD0, 0xC8));
            cancel.Click += (o, ev) => CloseRequested?.Invoke();
            DockPanel.SetDock(cancel, Dock.Left);
            top.Children.Add(cancel);
            _go = Big("▶  C'est parti !", 220, Color.FromRgb(0xB8, 0xF0, 0xC0));
            _go.IsEnabled = false;
            _go.Click += (o, ev) => StartChild();
            DockPanel.SetDock(_go, Dock.Right);
            top.Children.Add(_go);
            _hint = new TextBlock
            {
                Text = "🙋 Je choisis — touche 2 à 4 images (photos de la famille, dossier Contenu\\Choix, ou dessins)",
                FontSize = 24, FontWeight = FontWeights.Bold, Foreground = new SolidColorBrush(Color.FromRgb(0x3B, 0x2A, 0x5A)),
                VerticalAlignment = VerticalAlignment.Center, TextWrapping = TextWrapping.Wrap, Margin = new Thickness(12, 0, 12, 0),
            };
            top.Children.Add(_hint);
            Grid.SetRow(top, 0);
            _root.Children.Add(top);

            var wrap = new WrapPanel { HorizontalAlignment = HorizontalAlignment.Center, Margin = new Thickness(10) };
            foreach (var p in Candidates())
            {
                var pick = p;
                var content = new StackPanel { HorizontalAlignment = HorizontalAlignment.Center };
                content.Children.Add(Picture(pick, 110));
                content.Children.Add(new TextBlock { Text = pick.Label, FontSize = 18, FontWeight = FontWeights.Bold, Foreground = new SolidColorBrush(Color.FromRgb(0x3B, 0x2A, 0x5A)), HorizontalAlignment = HorizontalAlignment.Center, TextTrimming = TextTrimming.CharacterEllipsis, MaxWidth = 150 });
                var tile = new Button
                {
                    Style = (Style)Application.Current.Resources["AnswerButton"],
                    Width = 170, Height = 170, Margin = new Thickness(6),
                    Content = new Viewbox { Child = content, Margin = new Thickness(6), StretchDirection = StretchDirection.DownOnly },
                };
                tile.Click += (o, ev) => Toggle(pick);
                _tiles[pick] = tile;
                wrap.Children.Add(tile);
            }
            var scroll = new ScrollViewer { Content = wrap, VerticalScrollBarVisibility = ScrollBarVisibility.Auto };
            Grid.SetRow(scroll, 1);
            _root.Children.Add(scroll);
        }

        private static IEnumerable<Pick> Candidates()
        {
            var list = new List<Pick>();
            try
            {
                foreach (var (name, path) in UserContent.LoadFamily())
                    list.Add(new Pick { Key = "pers-" + name.ToLowerInvariant(), Label = Cap(name), Say = Cap(name), Photo = path, Emoji = "🙂" });
            }
            catch { }
            try
            {
                var dir = Path.Combine(UserContent.RootDir, "Choix");
                if (Directory.Exists(dir))
                    foreach (var f in Directory.GetFiles(dir).OrderBy(f => f))
                    {
                        var ext = Path.GetExtension(f).ToLowerInvariant();
                        if (ext != ".jpg" && ext != ".jpeg" && ext != ".png") continue;
                        var name = Path.GetFileNameWithoutExtension(f).Trim();
                        list.Add(new Pick { Key = "choix-" + name.ToLowerInvariant(), Label = Cap(name), Say = name, Photo = f, Emoji = "🖼️" });
                    }
            }
            catch { }
            list.AddRange(Bank);
            return list;
        }

        private void Toggle(Pick p)
        {
            if (_selected.Contains(p)) _selected.Remove(p);
            else if (_selected.Count < 4) _selected.Add(p);
            foreach (var kv in _tiles)
            {
                bool on = _selected.Contains(kv.Key);
                kv.Value.BorderThickness = new Thickness(on ? 7 : 0);
                kv.Value.BorderBrush = new SolidColorBrush(Color.FromRgb(0x4C, 0xC2, 0x6B));
                kv.Value.Effect = on ? new DropShadowEffect { BlurRadius = 24, ShadowDepth = 0, Color = Color.FromRgb(0x4C, 0xC2, 0x6B), Opacity = 0.9 } : null;
            }
            _go.IsEnabled = _selected.Count >= 2;
            _hint.Text = _selected.Count < 2
                ? "🙋 Je choisis — touche 2 à 4 images"
                : "🙋 " + string.Join("  ·  ", _selected.Select(s => s.Label)) + "  →  C'est parti !";
        }

        /// <summary>Temps 2 : l'enfant choisit au regard.</summary>
        private void StartChild()
        {
            var picks = _selected.ToList();
            _root.Children.Clear();
            _root.RowDefinitions.Clear();
            _root.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
            _root.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });

            var title = new TextBlock
            {
                Text = "Qu'est-ce que tu veux ?", FontSize = 48, FontWeight = FontWeights.ExtraBold,
                Foreground = new SolidColorBrush(Color.FromRgb(0x3B, 0x2A, 0x5A)), HorizontalAlignment = HorizontalAlignment.Center, Margin = new Thickness(0, 14, 0, 0),
            };
            Grid.SetRow(title, 0);
            _root.Children.Add(title);

            var row = new UniformGrid { Columns = picks.Count, Rows = 1, Margin = new Thickness(20) };
            foreach (var p in picks)
            {
                var pick = p;
                var content = new StackPanel { HorizontalAlignment = HorizontalAlignment.Center };
                content.Children.Add(Picture(pick, 300));
                content.Children.Add(new TextBlock { Text = pick.Label, FontSize = 40, FontWeight = FontWeights.ExtraBold, Foreground = new SolidColorBrush(Color.FromRgb(0x3B, 0x2A, 0x5A)), HorizontalAlignment = HorizontalAlignment.Center, Margin = new Thickness(0, 10, 0, 0) });
                var card = new Button
                {
                    Style = (Style)Application.Current.Resources["AnswerButton"],
                    Margin = new Thickness(14),
                    Content = new Viewbox { Child = content, Margin = new Thickness(16), StretchDirection = StretchDirection.DownOnly },
                };
                card.Click += (o, ev) => Chosen(card, pick, row);
                row.Children.Add(card);
            }
            Grid.SetRow(row, 1);
            _root.Children.Add(row);

            GazeTargets.ModalRoot = this; // le regard ne vise que ces cartes
            Speech.Stop();
            Speech.SayAlways("Qu'est-ce que tu veux ? " + string.Join(", ou ", picks.Select(x => x.Say)) + " ?");
        }

        private void Chosen(Button card, Pick pick, UniformGrid row)
        {
            foreach (Button b in row.Children) b.IsEnabled = b == card;
            card.Effect = new DropShadowEffect { BlurRadius = 60, ShadowDepth = 0, Color = Color.FromRgb(0xFF, 0xB3, 0x00), Opacity = 1 };
            var sc = new ScaleTransform(1, 1);
            card.RenderTransformOrigin = new Point(0.5, 0.5);
            card.RenderTransform = sc;
            var a = new DoubleAnimation(1, 1.1, TimeSpan.FromMilliseconds(220)) { AutoReverse = true };
            sc.BeginAnimation(ScaleTransform.ScaleXProperty, a);
            sc.BeginAnimation(ScaleTransform.ScaleYProperty, a);
            SoundFx.PopSound();
            string say = pick.Key.StartsWith("pers-") ? "Je veux " + pick.Say + " !" : "Je veux " + pick.Say + " !";
            if (!VoiceBank.Play("choix-" + pick.Key)) Speech.SayAlways(say);
            GazeStats.RecordComm("choix-" + pick.Key);
            Log.Write("choix", "Choisi : " + pick.Label + " parmi " + string.Join(", ", _selected.Select(s => s.Label)));
            var t = new System.Windows.Threading.DispatcherTimer { Interval = TimeSpan.FromSeconds(3.5) };
            t.Tick += (o, ev) => { t.Stop(); GazeTargets.ModalRoot = null; CloseRequested?.Invoke(); };
            t.Start();
        }

        /// <summary>Fermeture (par le parent) : on rend le regard aux jeux.</summary>
        public void MarkClosed() => GazeTargets.ModalRoot = null;

        private static Button Big(string text, double width, Color tint) => new Button
        {
            Style = (Style)Application.Current.Resources["AnswerButton"],
            Width = width, Height = 70, Background = new SolidColorBrush(tint),
            Content = new TextBlock { Text = text, FontSize = 20, FontWeight = FontWeights.Bold, Foreground = new SolidColorBrush(Color.FromRgb(0x3B, 0x2A, 0x5A)) },
            VerticalAlignment = VerticalAlignment.Center,
        };

        private static string Cap(string s) => s.Length == 0 ? s : char.ToUpperInvariant(s[0]) + s.Substring(1);
    }
}
