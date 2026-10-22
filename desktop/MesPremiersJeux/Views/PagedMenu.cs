using System;
using System.Collections.Generic;
using System.Text;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Media;

namespace MesPremiersJeux.Views
{
    /// <summary>
    /// Galerie SANS DÉFILEMENT : une grille qui occupe tout l'écran, des tuiles
    /// qui se partagent la place, et de grandes flèches ◀ ▶ (cliquables au
    /// regard) pour tourner les pages quand il y a trop de contenu. Remplace
    /// les ascenseurs partout où l'enfant choisit (coloriages, livres, musiques).
    /// </summary>
    public sealed class PagedMenu : Grid
    {
        private readonly int _perPage;
        private readonly UniformGrid _grid;
        private readonly Button _prev, _next;
        private readonly TextBlock _dots;
        private List<(UIElement Content, Action OnClick)> _tiles = new List<(UIElement, Action)>();
        private List<UIElement> _elements; // mode « éléments prêts » (tuile déjà construite)
        private int _page;

        public PagedMenu(int columns, int rows)
        {
            _perPage = columns * rows;

            ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });
            RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });

            _grid = new UniformGrid { Columns = columns, Rows = rows, Margin = new Thickness(4) };
            SetColumn(_grid, 1);
            Children.Add(_grid);

            _prev = Arrow("◀", -1);
            SetColumn(_prev, 0);
            Children.Add(_prev);
            _next = Arrow("▶", +1);
            SetColumn(_next, 2);
            Children.Add(_next);

            _dots = new TextBlock
            {
                FontSize = 30,
                HorizontalAlignment = HorizontalAlignment.Center,
                Margin = new Thickness(0, 2, 0, 8),
                Foreground = new SolidColorBrush(Color.FromRgb(0xA0, 0x8F, 0xC0)),
            };
            SetRow(_dots, 1);
            SetColumn(_dots, 1);
            Children.Add(_dots);
        }

        private Button Arrow(string glyph, int dir)
        {
            var b = new Button
            {
                Style = (Style)Application.Current.Resources["AnswerButton"],
                Width = 120,
                Height = 260,
                FontSize = 56,
                Content = glyph,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(10),
            };
            b.Click += (s, e) => { _page += dir; Rebuild(); };
            return b;
        }

        /// <summary>Contenus de tuiles : PagedMenu construit la tuile (MenuTile +
        /// Viewbox) et branche le clic.</summary>
        public void SetTiles(List<(UIElement Content, Action OnClick)> tiles)
        {
            _tiles = tiles ?? new List<(UIElement, Action)>();
            _elements = null;
            _page = 0;
            Rebuild();
        }

        /// <summary>Éléments déjà construits (tuile + clic inclus) : PagedMenu ne
        /// fait que les paginer, chacun centré dans sa case.</summary>
        public void SetElements(List<UIElement> elements)
        {
            _elements = elements ?? new List<UIElement>();
            _tiles = null;
            _page = 0;
            Rebuild();
        }

        private int Count => _elements?.Count ?? _tiles.Count;

        private void Rebuild()
        {
            int pages = Math.Max(1, (int)Math.Ceiling(Count / (double)_perPage));
            _page = ((_page % pages) + pages) % pages; // les flèches bouclent

            _grid.Children.Clear();
            for (int i = _page * _perPage; i < Math.Min(Count, (_page + 1) * _perPage); i++)
            {
                if (_elements != null)
                {
                    var el = _elements[i];
                    if (el is FrameworkElement fe)
                    {
                        fe.HorizontalAlignment = HorizontalAlignment.Center;
                        fe.VerticalAlignment = VerticalAlignment.Center;
                    }
                    _grid.Children.Add(el);
                    continue;
                }
                var (content, onClick) = _tiles[i];
                var tile = new Button
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
                var act = onClick;
                tile.Click += (s, e) => act();
                _grid.Children.Add(tile);
            }

            bool multi = pages > 1;
            _prev.Visibility = _next.Visibility = multi ? Visibility.Visible : Visibility.Collapsed;
            _dots.Visibility = multi ? Visibility.Visible : Visibility.Collapsed;
            if (multi)
            {
                var sb = new StringBuilder();
                for (int p = 0; p < pages; p++) sb.Append(p == _page ? "● " : "○ ");
                _dots.Text = sb.ToString().TrimEnd();
            }
        }
    }
}
