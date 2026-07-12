using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Effects;
using MesPremiersJeux.Games;
using MesPremiersJeux.Lib;

namespace MesPremiersJeux.Views
{
    /// <summary>
    /// Onglet Histoires : une histoire illustrée (dessins cartoon), avec un grand
    /// texte lu à voix haute et de grands boutons pour tourner les pages au regard.
    /// </summary>
    public sealed class StoriesView : UserControl
    {
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
        private readonly TextBlock _text;
        private readonly TextBlock _pageInfo;
        private int _index;

        public StoriesView()
        {
            var root = new Grid();
            root.Background = new LinearGradientBrush(
                Color.FromRgb(0xFF, 0xF3, 0xFB), Color.FromRgb(0xE9, 0xF2, 0xFF), 90);
            root.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });
            root.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
            root.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });

            // Titre.
            var title = new TextBlock
            {
                Text = "✨ Étincelle la licorne ✨",
                FontSize = 30,
                FontWeight = FontWeights.Bold,
                Foreground = new SolidColorBrush(Color.FromRgb(0x7E, 0x3F, 0xF2)),
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Top,
                Margin = new Thickness(0, 12, 0, 0),
            };

            // Illustration (grande carte).
            var card = new Border
            {
                Background = Brushes.White,
                CornerRadius = new CornerRadius(30),
                Margin = new Thickness(24, 44, 24, 8),
                Effect = new DropShadowEffect { BlurRadius = 22, ShadowDepth = 3, Opacity = 0.18 },
            };
            _illus = new ContentControl { Margin = new Thickness(24) };
            card.Child = _illus;
            Grid.SetRow(card, 0);

            var titleHost = new Grid();
            titleHost.Children.Add(card);
            titleHost.Children.Add(title);
            Grid.SetRow(titleHost, 0);
            root.Children.Add(titleHost);

            // Grand texte.
            _text = new TextBlock
            {
                FontSize = 52,
                FontWeight = FontWeights.SemiBold,
                Foreground = new SolidColorBrush(Color.FromRgb(0x3B, 0x2A, 0x5A)),
                TextWrapping = TextWrapping.Wrap,
                TextAlignment = TextAlignment.Center,
                HorizontalAlignment = HorizontalAlignment.Center,
                MaxWidth = 1100,
                Margin = new Thickness(24, 6, 24, 6),
            };
            Grid.SetRow(_text, 1);
            root.Children.Add(_text);

            // Navigation.
            var nav = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                HorizontalAlignment = HorizontalAlignment.Center,
                Margin = new Thickness(0, 4, 0, 18),
            };
            nav.Children.Add(NavButton("⬅", () => Show(_index - 1)));
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
        }

        private Button NavButton(string glyph, Action onClick)
        {
            var btn = new Button
            {
                Style = (Style)Application.Current.Resources["BackButton"],
                Content = glyph,
                FontSize = 46,
                Height = 100,
                MinWidth = 140,
                Margin = new Thickness(10, 0, 10, 0),
            };
            btn.Click += (s, e) => onClick();
            return btn;
        }

        private void Show(int i)
        {
            int n = _pages.Length;
            _index = ((i % n) + n) % n; // boucle
            var page = _pages[_index];
            _illus.Content = new Viewbox { Child = CartoonArt.Draw(page.Art), Stretch = Stretch.Uniform };
            _text.Text = page.Text;
            _pageInfo.Text = $"{_index + 1} / {n}";
            Speech.Say(page.Text);
        }
    }
}
