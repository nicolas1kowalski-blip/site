using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Text;
using System.Windows.Controls.Primitives;
using System.Windows.Media;
using System.Windows.Media.Effects;
using MesPremiersJeux.Games;
using MesPremiersJeux.Gaze;
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
        private sealed class BookPage
        {
            public string Text;
            public Func<UIElement> Cartoon;   // dessin intégré
            public string ImagePath;          // photo personnalisée
            public List<UserZone> Zones = new List<UserZone>();
        }

        private sealed class Book
        {
            public string Title;
            public string Dir; // dossier du livre personnalisé (null = livre intégré)
            public List<BookPage> Pages = new List<BookPage>();
        }

        // Zones affichées sur la page courante (pour les faire réagir à la lecture).
        private readonly List<(UserZone Zone, Border Ui)> _zoneUis = new List<(UserZone, Border)>();

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

        // Histoire racontée : texte de la page et correspondance mot → groupe.
        private string _pageText = "";
        private readonly List<int> _wordToGroup = new List<int>();

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
            nav.Children.Add(NavButton("🔊", ListenPage));
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
                builtIn.Pages.Add(new BookPage { Text = text, Cartoon = () => CartoonArt.Draw(a) });
            }
            _books.Add(builtIn);

            // Livres du parent (Documents\MesPremiersJeux\Histoires).
            foreach (var s in UserContent.LoadStories())
            {
                var book = new Book { Title = s.Title, Dir = s.Dir };
                foreach (var p in s.Pages)
                    book.Pages.Add(new BookPage { Text = p.Text, ImagePath = p.ImagePath, Zones = p.Zones });
                _books.Add(book);
            }
        }

        // Construit l'illustration d'une page : dessin intégré, ou photo avec ses
        // zones interactives (fixer une zone la nomme ; lire son mot l'illumine).
        private UIElement MakeIllustration(BookPage page)
        {
            _zoneUis.Clear();
            if (page.Cartoon != null) return page.Cartoon();
            if (page.ImagePath == null)
                return new TextBlock { Text = "📖", FontSize = 160, HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center };

            try
            {
                var bmp = UserContent.LoadBitmap(page.ImagePath);
                double w = bmp.PixelWidth, h = bmp.PixelHeight;
                var host = new Grid { Width = w, Height = h };
                host.Children.Add(new Image { Source = bmp, Stretch = Stretch.Fill, Width = w, Height = h });

                var layer = new Canvas { Width = w, Height = h, Background = Brushes.Transparent };
                foreach (var z in page.Zones ?? new List<UserZone>())
                {
                    var ui = new Border
                    {
                        Width = z.Width / 100 * w,
                        Height = z.Height / 100 * h,
                        CornerRadius = new CornerRadius(10),
                        Background = Brushes.Transparent,
                        BorderBrush = new SolidColorBrush(Color.FromArgb(0x50, 0x7E, 0x3F, 0xF2)),
                        BorderThickness = new Thickness(3),
                    };
                    Canvas.SetLeft(ui, z.Left / 100 * w);
                    Canvas.SetTop(ui, z.Top / 100 * h);
                    var zone = z;
                    ui.MouseLeftButtonDown += (s, e) => Speech.Say(zone.Label); // fixer la zone la nomme
                    layer.Children.Add(ui);
                    _zoneUis.Add((zone, ui));
                }
                host.Children.Add(layer);
                return host;
            }
            catch
            {
                return new TextBlock { Text = "🖼️", FontSize = 160 };
            }
        }

        // --- Mise en évidence d'une zone quand son mot est lu (comme sur le web) ---
        private static string NormalizeWord(string s)
        {
            var d = s.ToLowerInvariant().Normalize(NormalizationForm.FormD);
            var sb = new StringBuilder();
            foreach (var c in d)
                if (System.Globalization.CharUnicodeInfo.GetUnicodeCategory(c) != System.Globalization.UnicodeCategory.NonSpacingMark
                    && char.IsLetterOrDigit(c))
                    sb.Append(c);
            return sb.ToString();
        }

        private void PulseMatchingZones(string groupText)
        {
            if (_zoneUis.Count == 0) return;
            var words = groupText.Split(' ').Select(NormalizeWord).Where(x => x.Length >= 3).ToList();
            if (words.Count == 0) return;

            foreach (var (zone, ui) in _zoneUis)
            {
                var labelParts = zone.Label.Split(' ').Select(NormalizeWord);
                if (!labelParts.Any(lp => words.Contains(lp))) continue;

                // Petit flash : fond jaune + bord épais qui s'estompent.
                var flash = new SolidColorBrush(Color.FromArgb(0x88, 0xFF, 0xE0, 0x5C));
                ui.Background = flash;
                ui.BorderBrush = new SolidColorBrush(Color.FromRgb(0xFF, 0xC1, 0x07));
                flash.BeginAnimation(SolidColorBrush.ColorProperty,
                    new System.Windows.Media.Animation.ColorAnimation(
                        Color.FromArgb(0x88, 0xFF, 0xE0, 0x5C),
                        Color.FromArgb(0x00, 0xFF, 0xE0, 0x5C),
                        TimeSpan.FromMilliseconds(1600)));
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
                    Content = b.Pages.Count > 0 ? PreviewOf(b.Pages[0]) : null,
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

                // Livres personnalisés : boutons Modifier / Supprimer (pour le parent).
                if (b.Dir != null)
                {
                    var admin = new StackPanel
                    {
                        Orientation = Orientation.Horizontal,
                        HorizontalAlignment = HorizontalAlignment.Center,
                        Margin = new Thickness(0, 8, 0, 0),
                    };
                    var bookRef = b;
                    var edit = new Button { Content = "✏️", FontSize = 18, Padding = new Thickness(10, 4, 10, 4), Margin = new Thickness(4, 0, 4, 0) };
                    edit.Click += (s, e) => { e.Handled = true; EditBook(bookRef); };
                    var del = new Button { Content = "🗑", FontSize = 18, Padding = new Thickness(10, 4, 10, 4), Margin = new Thickness(4, 0, 4, 0) };
                    del.Click += (s, e) => { e.Handled = true; DeleteBook(bookRef); };
                    admin.Children.Add(edit);
                    admin.Children.Add(del);
                    content.Children.Add(admin);
                }

                var tile = new Button { Style = (Style)Application.Current.Resources["MenuTile"], Content = content };
                var book = b;
                tile.Click += (s, e) => OpenBook(book);
                _menu.Children.Add(tile);
            }

            // Tuile « nouveau livre » (pour le parent).
            var addContent = new StackPanel { HorizontalAlignment = HorizontalAlignment.Center };
            addContent.Children.Add(new TextBlock { Text = "➕", FontSize = 74, HorizontalAlignment = HorizontalAlignment.Center });
            addContent.Children.Add(new TextBlock
            {
                Text = "Nouveau livre",
                FontSize = 22,
                FontWeight = FontWeights.Bold,
                Foreground = Dark,
                HorizontalAlignment = HorizontalAlignment.Center,
                Margin = new Thickness(0, 8, 0, 0),
            });
            var addTile = new Button { Style = (Style)Application.Current.Resources["MenuTile"], Content = addContent };
            addTile.Click += (s, e) => AddBook();
            _menu.Children.Add(addTile);
        }

        private void AddBook()
        {
            var editor = new BookEditorWindow { Owner = Window.GetWindow(this) };
            if (editor.ShowDialog() == true)
            {
                ReloadBooks();
                Speech.Say("Le livre est ajouté !");
            }
        }

        private void EditBook(Book book)
        {
            var drafts = book.Pages.Select(p => new PageDraft
            {
                Text = p.Text ?? "",
                ImagePath = p.ImagePath,
                Zones = p.Zones?.Select(z => new UserZone
                {
                    Left = z.Left, Top = z.Top, Width = z.Width, Height = z.Height, Label = z.Label,
                }).ToList() ?? new List<UserZone>(),
            }).ToList();

            var editor = new BookEditorWindow(book.Title, drafts, book.Dir) { Owner = Window.GetWindow(this) };
            if (editor.ShowDialog() == true)
            {
                ReloadBooks();
                Speech.Say("Le livre est modifié !");
            }
        }

        private void DeleteBook(Book book)
        {
            // Pause du regard pendant la confirmation (action parent, souris).
            GazeGate.Push();
            var res = MessageBox.Show(
                Window.GetWindow(this),
                $"Supprimer définitivement « {book.Title} » ?",
                "Supprimer le livre",
                MessageBoxButton.YesNo,
                MessageBoxImage.Warning);
            GazeGate.Pop();

            if (res == MessageBoxResult.Yes && UserContent.DeleteStory(book.Dir))
                ReloadBooks();
        }

        private void ReloadBooks()
        {
            _books.Clear();
            BuildBooks();
            BuildMenu();
        }

        // Aperçu léger d'une page pour la tuile de la bibliothèque.
        private static UIElement PreviewOf(BookPage page)
        {
            if (page.Cartoon != null) return page.Cartoon();
            if (page.ImagePath != null)
            {
                try { return new Image { Source = UserContent.LoadBitmap(page.ImagePath, 400), Stretch = Stretch.Uniform }; }
                catch { }
            }
            return new TextBlock { Text = "📖", FontSize = 90, HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center };
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
            _illus.Content = new Viewbox { Child = MakeIllustration(page), Stretch = Stretch.Uniform };
            _pageInfo.Text = $"{_index + 1} / {n}";

            _wordHost.Children.Clear();
            _groups.Clear();
            _readIndex = 0;
            _pageText = page.Text;
            _wordToGroup.Clear();

            int gi = 0;
            foreach (var g in SplitGroups(page.Text))
            {
                // Nombre de mots réellement prononcés dans ce groupe (pour la
                // synchronisation de l'histoire racontée).
                foreach (var tok in g.Split(' '))
                    if (tok.Any(char.IsLetterOrDigit)) _wordToGroup.Add(gi);
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

        // Histoire racontée : la voix lit toute la page ; les groupes se
        // surlignent au fil des mots, et les zones s'illuminent.
        private void ListenPage()
        {
            if (_groups.Count == 0) return;
            _readIndex = 0;
            Refresh();
            PulseMatchingZones(_groups[0].Text);

            Speech.SayPage(
                _pageText,
                wordIdx => Dispatcher.Invoke(() =>
                {
                    if (_wordToGroup.Count == 0) return;
                    int g = _wordToGroup[Math.Min(wordIdx, _wordToGroup.Count - 1)];
                    if (g != _readIndex && g < _groups.Count)
                    {
                        _readIndex = g;
                        Refresh();
                        PulseMatchingZones(_groups[g].Text);
                    }
                }),
                () => Dispatcher.Invoke(() =>
                {
                    _readIndex = 0; // la page se remet au début pour la lecture au regard
                    Refresh();
                }));
        }

        private void OnGroupClicked(int idx)
        {
            if (idx != _readIndex || _readIndex >= _groups.Count) return;
            Speech.Say(_groups[idx].Text);
            PulseMatchingZones(_groups[idx].Text); // la zone correspondante s'illumine
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
