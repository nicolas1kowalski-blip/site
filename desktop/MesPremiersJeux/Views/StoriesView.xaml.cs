using System;
using System.Collections.Generic;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Effects;
using System.Windows.Threading;
using MesPremiersJeux.Games;
using MesPremiersJeux.Lib;

namespace MesPremiersJeux.Views
{
    /// <summary>
    /// Onglet Histoires : une histoire illustrée. Le texte se lit MOT À MOT :
    /// chaque mot est surligné et lu à voix haute, puis on avance automatiquement
    /// au suivant ; les mots déjà lus passent en gris.
    /// </summary>
    public sealed class StoriesView : UserControl
    {
        private static readonly Brush Dark = new SolidColorBrush(Color.FromRgb(0x3B, 0x2A, 0x5A));
        private static readonly Brush Read = new SolidColorBrush(Color.FromRgb(0xC2, 0xBB, 0xD0));
        private static readonly Brush Current = new SolidColorBrush(Color.FromRgb(0x7E, 0x3F, 0xF2));
        private static readonly Brush Highlight = new SolidColorBrush(Color.FromRgb(0xFF, 0xF2, 0xA8));

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
        private readonly List<TextBlock> _words = new List<TextBlock>();
        private readonly DispatcherTimer _readTimer;
        private int _index;
        private int _readIndex;

        public StoriesView()
        {
            _readTimer = new DispatcherTimer();
            _readTimer.Tick += (s, e) => ReadNext();

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
                Foreground = Current,
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
                MaxWidth = 1200,
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
            nav.Children.Add(NavButton("▶ Lire", StartReading));
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
            Loaded += (s, e) => Show(0);
            Unloaded += (s, e) => _readTimer.Stop();
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

        private void Show(int i)
        {
            int n = _pages.Length;
            _index = ((i % n) + n) % n;
            var page = _pages[_index];
            _illus.Content = new Viewbox { Child = CartoonArt.Draw(page.Art), Stretch = Stretch.Uniform };
            _pageInfo.Text = $"{_index + 1} / {n}";

            _wordHost.Children.Clear();
            _words.Clear();
            foreach (var w in page.Text.Split(' '))
            {
                _words.Add(new TextBlock
                {
                    Text = w,
                    FontSize = 52,
                    FontWeight = FontWeights.SemiBold,
                    Foreground = Dark,
                    Padding = new Thickness(10, 4, 10, 4),
                    Margin = new Thickness(4, 6, 4, 6),
                });
            }
            foreach (var t in _words) _wordHost.Children.Add(t);

            StartReading();
        }

        // Lance (ou relance) la lecture mot à mot depuis le début.
        private void StartReading()
        {
            _readTimer.Stop();
            _readIndex = -1;
            ReadNext();
        }

        private void ReadNext()
        {
            _readTimer.Stop();
            _readIndex++;
            if (_readIndex >= _words.Count)
            {
                // Fin : tous les mots en gris (lus).
                foreach (var w in _words) { w.Foreground = Read; w.Background = null; w.FontWeight = FontWeights.SemiBold; }
                return;
            }

            for (int k = 0; k < _words.Count; k++)
            {
                if (k < _readIndex) { _words[k].Foreground = Read; _words[k].Background = null; _words[k].FontWeight = FontWeights.SemiBold; }
                else if (k == _readIndex) { _words[k].Foreground = Current; _words[k].Background = Highlight; _words[k].FontWeight = FontWeights.Bold; }
                else { _words[k].Foreground = Dark; _words[k].Background = null; _words[k].FontWeight = FontWeights.SemiBold; }
            }

            var word = _words[_readIndex].Text;
            Speech.Say(word);
            // Durée avant le mot suivant (proportionnelle à la longueur du mot).
            _readTimer.Interval = TimeSpan.FromMilliseconds(650 + 75 * word.Length);
            _readTimer.Start();
        }
    }
}
