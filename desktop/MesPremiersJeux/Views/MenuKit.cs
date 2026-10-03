using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;

namespace MesPremiersJeux.Views
{
    /// <summary>
    /// Fabrique des tuiles de menu partagées (Jeux, Éducatif…) : des tuiles qui
    /// REMPLISSENT leur case de grille et dont le contenu se réduit (Viewbox)
    /// si la place manque — par construction, ni chevauchement ni libellé coupé.
    /// </summary>
    public static class MenuKit
    {
        private static readonly SolidColorBrush Dark = new SolidColorBrush(Color.FromRgb(0x3B, 0x2A, 0x5A));

        /// <summary>Grande tuile de THÈME : icône, nom, et la farandole des
        /// icônes des jeux qu'elle contient.</summary>
        public static Button ThemeTile(string icon, string name, Color tint, string miniIcons)
        {
            var content = new StackPanel { HorizontalAlignment = HorizontalAlignment.Center };
            content.Children.Add(new TextBlock { Text = icon, FontSize = 96, HorizontalAlignment = HorizontalAlignment.Center });
            content.Children.Add(new TextBlock
            {
                Text = name,
                FontSize = 36,
                FontWeight = FontWeights.Bold,
                Foreground = Dark,
                HorizontalAlignment = HorizontalAlignment.Center,
                Margin = new Thickness(0, 8, 0, 0),
            });
            content.Children.Add(new TextBlock
            {
                Text = miniIcons,
                FontSize = 30,
                Opacity = 0.85,
                HorizontalAlignment = HorizontalAlignment.Center,
                Margin = new Thickness(0, 10, 0, 0),
            });
            var tile = Wrap(content);
            tile.Background = new SolidColorBrush(tint);
            return tile;
        }

        /// <summary>Tuile de JEU ou d'ACTIVITÉ : icône + libellé (+ sous-titre).</summary>
        public static Button GameTile(string icon, string label, string sub = null)
        {
            var content = new StackPanel { HorizontalAlignment = HorizontalAlignment.Center };
            content.Children.Add(new TextBlock { Text = icon, FontSize = 82, HorizontalAlignment = HorizontalAlignment.Center });
            content.Children.Add(new TextBlock
            {
                Text = label,
                FontSize = 27,
                FontWeight = FontWeights.Bold,
                Foreground = Dark,
                HorizontalAlignment = HorizontalAlignment.Center,
                Margin = new Thickness(0, 8, 0, 0),
            });
            if (sub != null)
            {
                content.Children.Add(new TextBlock
                {
                    Text = sub,
                    FontSize = 17,
                    Foreground = new SolidColorBrush(Color.FromRgb(0x5A, 0x7A, 0x9A)),
                    HorizontalAlignment = HorizontalAlignment.Center,
                    Margin = new Thickness(0, 3, 0, 0),
                });
            }
            return Wrap(content);
        }

        private static Button Wrap(UIElement content) => new Button
        {
            Style = (Style)Application.Current.Resources["MenuTile"],
            Content = new Viewbox
            {
                Stretch = Stretch.Uniform,
                StretchDirection = StretchDirection.DownOnly,
                Margin = new Thickness(14, 10, 14, 10),
                Child = content,
            },
            Width = double.NaN,
            Height = double.NaN,
        };
    }
}
