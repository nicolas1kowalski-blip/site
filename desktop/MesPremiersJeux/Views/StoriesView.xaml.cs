using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Effects;
using MesPremiersJeux.Games;
using MesPremiersJeux.Lib;

namespace MesPremiersJeux.Views
{
    /// <summary>
    /// Onglet Histoires : bibliothèque de livres (histoire intégrée + livres
    /// ajoutés par le parent dans Documents\MesPremiersJeux\Histoires), puis
    /// lecture AU REGARD groupe de mots par groupe de mots : le groupe courant est
    /// surligné ; le fixer le lit à voix haute, le grise et allume le suivant.
    /// </summary>
    public sealed class StoriesView : UserControl
    {
        private static readonly Brush Dark = new SolidColorBrush(Color.FromRgb(0x3B, 0x2A, 0x5A));
        private static readonly Brush Grey = new SolidColorBrush(Color.FromRgb(0xC2, 0xBB, 0xD0));
        private static readonly Brush Violet = new SolidColorBrush(Color.FromRgb(0x7E, 0x3F, 0xF2));
        private static readonly Brush Yellow = new SolidColorBrush(Color.FromRgb(0xFF, 0xF2, 0xA8));

        // Petits mots regroupés avec le mot suivant (articles, pronoms, liaisons…).
        private static readonly HashSet<string> SmallWords = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "le", "la", "les", "un", "une", "des", "de", "du",
            "il", "elle", "ils", "elles", "on", "je", "tu", "nous", "vous",
            "et", "ou", "à", "au", "aux", "en", "par", "sur", "dans", "avec", "pour",
            "ne", "se", "ce", "cette", "son", "sa", "ses", "qui", "que",
            "tout", "toute", "tous", "très",
        };

        // --- Modèle de livre (intégré ou personnalisé) ---
        private sealed class Book
        {
            public string Title;
            public List<(string Text, Func<UIElement> Illus)> Pages = new List<(string, Func<UIElement>)>();
        }

        private readonly List<Book> _books = new List<Book>();

        // --- Interface ---
        private readonly Grid _menuRoot;
        private readonly UniformGrid _menu;
        private readonly Grid _readerRoot;
        private readonly TextBlock _title;
        private readonly ContentControl _illus;
        private readonly WrapPanel _wordHost;
        private readonly TextBlock _pageInfo;
        private readonly List<TextBlock> _groups = new List<TextBlock>();
        private Book _book;
        private int _index;
        private int _readIndex;

        public StoriesView()
        {
            UserContent.EnsureFolders();
            BuildBooks();

            var root = new Grid();
            root.Background = new LinearGradientBrush(
                Color.FromRgb(0xFF, 0xF3, 0xFB), Color.FromRgb(0xE9, 0xF2, 0xFF), 90);

            // --- Bibliothèque (choix du livre) ---
            _menuRoot = new Grid();
            _menu = new UniformGrid
            {
                Columns = 3,
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
            };
            _menuRoot.Children.Add(_menu);
            root.Children.Add(_menuRoot);

            // --- Lecteur ---
            _readerRoot = new Grid { Visibility = Visibility.Collapsed };
            _readerRoot.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });
            _readerRoot.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
            _readerRoot.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });

            _title = new TextBlock
            {
                FontSize = 30,
                FontWeight = FontWeights.Bold,
                Foreground = Violet,
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Top,
                Margin = new Thickness(0, 12, 0, 0),
            };
            var card = new Border
            {
                Background = Brushes.White,
                CornerRadius = new CornerRadius(30),
                Margin = new Thickness(24, 44, 24, 8),
                Effect = new DropShadowEffect { BlurRadius = 22, ShadowDepth = 3, Opacity = 0.18 },
            };
            _illus = new ContentControl { Margin = new Thickness(20) };
            card.Child = _illus;
            var illusHost = new Grid();
            illusHost.Children.Add(card);
            illusHost.Children.Add(_title);

            // Bouton retour bibliothèque.
            var backBtn = new Button
            {
                Style = (Style)Application.Current.Resources["BackButton"],
                Content = "📚  Livres",
                HorizontalAlignment = HorizontalAlignment.Left,
                VerticalAlignment = VerticalAlignment.Top,
                Margin = new Thickness(16),
            };
            backBtn.Click += (s, e) => ShowMenu();
            illusHost.Children.Add(backBtn);

            Grid.SetRow(illusHost, 0);
            _readerRoot.Children.Add(illusHost);

            _wordHost = new WrapPanel
            {
                HorizontalAlignment = HorizontalAlignment.Center,
                MaxWidth = 1300,
                Margin = new Thickness(24, 8, 24, 8),
            };
            Grid.SetRow(_wordHost, 1);
            _readerRoot.Children.Add(_wordHost);

            var nav = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                HorizontalAlignment = HorizontalAlignment.Center,
                Margin = new Thickness(0, 4, 0, 18),
            };
            nav.Children.Add(NavButton("⬅", () => ShowPage(_index - 1)));
            nav.Children.Add(NavButton("🔁", () => ShowPage(_index)));
            _pageInfo = new TextBlock
            {
                FontSize = 24,
                Foreground = new SolidColorBrush(Color.FromRgb(0x6B, 0x5B, 0x8A)),
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(24, 0, 24, 0),
            };
            nav.Children.Add(_pageInfo);
            nav.Children.Add(NavButton("➡", () => ShowPage(_index + 1)));
            Grid.SetRow(nav, 2);
            _readerRoot.Children.Add(nav);

            root.Children.Add(_readerRoot);
            Content = root;

            BuildMenu();
        }

        // --- Bibliothèque ---
        private void BuildBooks()
        {
            var builtIn = new Book { Title = "Étincelle la licorne" };
            foreach (var (text, art) in new[]
            {
                ("Voici Étincelle, une petite licorne toute rose.", "licorne"),
                ("Un matin, elle saute par-dessus un grand arc-en-ciel !", "arcenciel"),
                ("Elle rencontre Minou, un chat très rigolo.", "chat"),
                ("Ensemble, ils cueillent de jolies fleurs.", "fleur"),
                ("Un papillon vient danser avec eux.", "papillon"),
                ("Le soir, ils font un vœu sur une étoile. Bonne nuit !", "etoile"),
            })
            {
                var a = art;
                builtIn.Pages.Add((text, () => CartoonArt.Draw(a)));
            }
            _books.Add(builtIn);

            // Livres du parent (Documents\MesPremiersJeux\Histoires).
            foreach (var s in UserContent.LoadStories())
            {
                var book = new Book { Title = s.Title };
                foreach (var p in s.Pages)
                {
                    var path = p.ImagePath;
                    book.Pages.Add((p.Text, () => MakeUserIllustration(path)));
                }
                _books.Add(book);
            }
        }

        private static UIElement MakeUserIllustration(string path)
        {
            if (path == null)
                return new TextBlock { Text = "📖", FontSize = 160, HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center };
            try
            {
                return new Image { Source = UserContent.LoadBitmap(path), Stretch = Stretch.Uniform };
            }
            catch
            {
                return new TextBlock { Text = "🖼️", FontSize = 160 };
            }
        }

        private void BuildMenu()
        {
            _menu.Children.Clear();
            foreach (var b in _books)
            {
                var content = new StackPanel { HorizontalAlignment = HorizontalAlignment.Center };
                var preview = new ContentControl
                {
                    Content = b.Pages.Count > 0 ? b.Pages[0].Illus() : null,
                    Width = 150,
                    Height = 130,
                };
                content.Children.Add(preview);
                content.Children.Add(new TextBlock
                {
                    Text = b.Title,
                    FontSize = 24,
                    FontWeight = FontWeights.Bold,
                    Foreground = Dark,
                    TextWrapping = TextWrapping.Wrap,
                    TextAlignment = TextAlignment.Center,
                    MaxWidth = 220,
                    HorizontalAlignment = HorizontalAlignment.Center,
                    Margin = new Thickness(0, 8, 0, 0),
                });

                var tile = new Button { Style = (Style)Application.Current.Resources["MenuTile"], Content = content };
                var book = b;
                tile.Click += (s, e) => OpenBook(book);
                _menu.Children.Add(tile);
            }
        }

        private void ShowMenu()
        {
            _readerRoot.Visibility = Visibility.Collapsed;
            _menuRoot.Visibility = Visibility.Visible;
        }

        private void OpenBook(Book book)
        {
            _book = book;
            _title.Text = "✨ " + book.Title + " ✨";
            _menuRoot.Visibility = Visibility.Collapsed;
            _readerRoot.Visibility = Visibility.Visible;
            ShowPage(0);
        }

        private Button NavButton(string glyph, Action onClick)
        {
            var btn = new Button
            {
                Style = (Style)Application.Current.Resources["BackButton"],
                Content = glyph,
                FontSize = 40,
                Height = 100,
                MinWidth = 150,
                Margin = new Thickness(10, 0, 10, 0),
            };
            btn.Click += (s, e) => onClick();
            return btn;
        }

        // --- Lecture au regard ---
        private static List<string> SplitGroups(string text)
        {
            var groups = new List<string>();
            var buffer = "";
            foreach (var token in text.Split(' '))
            {
                bool punctOnly = token.Trim().Length > 0 && !char.IsLetterOrDigit(token.Trim()[0]);
                if (punctOnly && groups.Count > 0 && buffer.Length == 0)
                {
                    groups[groups.Count - 1] += " " + token; // « ! » collé au groupe précédent
                    continue;
                }
                buffer = buffer.Length == 0 ? token : buffer + " " + token;
                var bare = token.Trim().TrimEnd('.', ',', '!', '?', ';', ':').ToLowerInvariant();
                if (!SmallWords.Contains(bare))
                {
                    groups.Add(buffer); // mot « plein » : le groupe se termine ici
                    buffer = "";
                }
            }
            if (buffer.Length > 0) groups.Add(buffer);
            return groups;
        }

        private void ShowPage(int i)
        {
            if (_book == null || _book.Pages.Count == 0) return;
            int n = _book.Pages.Count;
            _index = ((i % n) + n) % n;
            var page = _book.Pages[_index];
            _illus.Content = new Viewbox { Child = page.Illus(), Stretch = Stretch.Uniform };
            _pageInfo.Text = $"{_index + 1} / {n}";

            _wordHost.Children.Clear();
            _groups.Clear();
            _readIndex = 0;

            int gi = 0;
            foreach (var g in SplitGroups(page.Text))
            {
                var tb = new TextBlock
                {
                    Text = g,
                    FontSize = 52,
                    FontWeight = FontWeights.SemiBold,
                    Foreground = Dark,
                    Padding = new Thickness(14, 8, 14, 8),
                    Margin = new Thickness(5, 6, 5, 6),
                    Background = Brushes.Transparent,
                };
                int idx = gi++;
                // Le dwell injecte un vrai clic : on lit le groupe si c'est le courant.
                tb.MouseLeftButtonDown += (s, e) => OnGroupClicked(idx);
                _groups.Add(tb);
                _wordHost.Children.Add(tb);
            }

            Refresh();
            Speech.Say("À toi de lire !");
        }

        private void OnGroupClicked(int idx)
        {
            if (idx != _readIndex || _readIndex >= _groups.Count) return;
            Speech.Say(_groups[idx].Text);
            _readIndex++;
            Refresh();
            if (_readIndex >= _groups.Count)
                Speech.Say("Bravo !");
        }

        // Met à jour les couleurs : lus = gris, courant = surligné, à venir = foncé.
        private void Refresh()
        {
            for (int k = 0; k < _groups.Count; k++)
            {
                if (k < _readIndex)
                {
                    _groups[k].Foreground = Grey;
                    _groups[k].Background = Brushes.Transparent;
                    _groups[k].FontWeight = FontWeights.SemiBold;
                }
                else if (k == _readIndex)
                {
                    _groups[k].Foreground = Violet;
                    _groups[k].Background = Yellow;
                    _groups[k].FontWeight = FontWeights.Bold;
                }
                else
                {
                    _groups[k].Foreground = Dark;
                    _groups[k].Background = Brushes.Transparent;
                    _groups[k].FontWeight = FontWeights.SemiBold;
                }
            }
        }
    }
}
