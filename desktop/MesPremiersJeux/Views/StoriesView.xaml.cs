using System;
using System.Collections.Generic;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Effects;
using MesPremiersJeux.Games;
using MesPremiersJeux.Lib;

namespace MesPremiersJeux.Views
{
    /// <summary>
    /// Onglet Histoires : l'enfant lit l'histoire AU REGARD, groupe de mots par
    /// groupe de mots. Le groupe courant est mis en évidence ; quand l'enfant le
    /// fixe (le dwell clique dessus), il est lu à voix haute et passe en gris,
    /// puis le groupe suivant s'allume. Les petits mots (articles, pronoms…) et
    /// la ponctuation sont regroupés avec le mot voisin pour ne pas hacher la
    /// lecture.
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

        private readonly (string Text, string Art)[] _pages =
        {
            ("Voici Étincelle, une petite licorne toute rose.", "licorne"),
            ("Un matin, elle saute par-dessus un grand arc-en-ciel !", "arcenciel"),
            ("Elle rencontre Minou, un chat très rigolo.", "chat"),
            ("Ensemble, ils cueillent de jolies fleurs.", "fleur"),
            ("Un papillon vient danser avec eux.", "papillon"),
            ("Le soir, ils font un vœu sur une étoile. Bonne nuit !", "etoile"),
        };

        private readonly ContentControl _illus;
        private readonly WrapPanel _wordHost;
        private readonly TextBlock _pageInfo;
        private readonly List<TextBlock> _groups = new List<TextBlock>();
        private int _index;
        private int _readIndex;

        public StoriesView()
        {
            var root = new Grid();
            root.Background = new LinearGradientBrush(
                Color.FromRgb(0xFF, 0xF3, 0xFB), Color.FromRgb(0xE9, 0xF2, 0xFF), 90);
            root.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });
            root.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
            root.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });

            var title = new TextBlock
            {
                Text = "✨ Étincelle la licorne ✨",
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
            illusHost.Children.Add(title);
            Grid.SetRow(illusHost, 0);
            root.Children.Add(illusHost);

            _wordHost = new WrapPanel
            {
                HorizontalAlignment = HorizontalAlignment.Center,
                MaxWidth = 1300,
                Margin = new Thickness(24, 8, 24, 8),
            };
            Grid.SetRow(_wordHost, 1);
            root.Children.Add(_wordHost);

            var nav = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                HorizontalAlignment = HorizontalAlignment.Center,
                Margin = new Thickness(0, 4, 0, 18),
            };
            nav.Children.Add(NavButton("⬅", () => Show(_index - 1)));
            nav.Children.Add(NavButton("🔁", () => Show(_index)));
            _pageInfo = new TextBlock
            {
                FontSize = 24,
                Foreground = new SolidColorBrush(Color.FromRgb(0x6B, 0x5B, 0x8A)),
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(24, 0, 24, 0),
            };
            nav.Children.Add(_pageInfo);
            nav.Children.Add(NavButton("➡", () => Show(_index + 1)));
            Grid.SetRow(nav, 2);
            root.Children.Add(nav);

            Content = root;
            Loaded += (s, e) => { if (_groups.Count == 0) Show(0); };
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

        // Découpe une phrase en groupes de lecture : les petits mots et la
        // ponctuation sont rattachés au mot voisin.
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

        private void Show(int i)
        {
            int n = _pages.Length;
            _index = ((i % n) + n) % n;
            var page = _pages[_index];
            _illus.Content = new Viewbox { Child = CartoonArt.Draw(page.Art), Stretch = Stretch.Uniform };
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
