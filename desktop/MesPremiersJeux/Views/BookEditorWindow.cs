using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using Microsoft.Win32;
using MesPremiersJeux.Lib;

namespace MesPremiersJeux.Views
{
    /// <summary>
    /// Éditeur de livre (pour le parent, à la souris) : un titre + des pages
    /// (texte de la page et image facultative). À l'enregistrement, le livre est
    /// écrit dans Documents\MesPremiersJeux\Histoires et apparaît aussitôt dans
    /// la bibliothèque.
    /// </summary>
    public sealed class BookEditorWindow : Window
    {
        private sealed class Row
        {
            public Border Ui;
            public TextBlock Header;
            public TextBox Text;
            public Button ImgBtn;
            public string ImagePath;
        }

        private readonly TextBox _title;
        private readonly StackPanel _pagesHost;
        private readonly List<Row> _rows = new List<Row>();

        public BookEditorWindow()
        {
            Title = "Nouveau livre";
            Width = 780;
            Height = 680;
            WindowStartupLocation = WindowStartupLocation.CenterOwner;
            Background = new SolidColorBrush(Color.FromRgb(0xFB, 0xF3, 0xFF));

            var dock = new DockPanel { Margin = new Thickness(18) };

            // Titre du livre.
            var titleRow = new DockPanel { Margin = new Thickness(0, 0, 0, 12) };
            titleRow.Children.Add(new TextBlock
            {
                Text = "Titre : ",
                FontSize = 20,
                FontWeight = FontWeights.Bold,
                VerticalAlignment = VerticalAlignment.Center,
            });
            _title = new TextBox { FontSize = 20, Padding = new Thickness(8, 6, 8, 6) };
            titleRow.Children.Add(_title);
            DockPanel.SetDock(titleRow, Dock.Top);
            dock.Children.Add(titleRow);

            // Boutons du bas.
            var buttons = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                HorizontalAlignment = HorizontalAlignment.Right,
                Margin = new Thickness(0, 12, 0, 0),
            };
            buttons.Children.Add(MakeButton("➕ Ajouter une page", (s, e) => AddRow()));
            buttons.Children.Add(MakeButton("💾 Enregistrer", Save));
            buttons.Children.Add(MakeButton("Annuler", (s, e) => DialogResult = false));
            DockPanel.SetDock(buttons, Dock.Bottom);
            dock.Children.Add(buttons);

            // Pages.
            _pagesHost = new StackPanel();
            dock.Children.Add(new ScrollViewer
            {
                Content = _pagesHost,
                VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
            });

            Content = dock;
            AddRow();
        }

        private static Button MakeButton(string label, RoutedEventHandler onClick)
        {
            var b = new Button
            {
                Content = label,
                FontSize = 17,
                Padding = new Thickness(16, 10, 16, 10),
                Margin = new Thickness(8, 0, 0, 0),
            };
            b.Click += onClick;
            return b;
        }

        private void AddRow()
        {
            var row = new Row();

            var grid = new Grid();
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            grid.RowDefinitions.Add(new RowDefinition());
            grid.RowDefinitions.Add(new RowDefinition());

            row.Header = new TextBlock
            {
                FontSize = 16,
                FontWeight = FontWeights.Bold,
                Foreground = new SolidColorBrush(Color.FromRgb(0x7E, 0x3F, 0xF2)),
                Margin = new Thickness(0, 0, 0, 4),
            };
            Grid.SetRow(row.Header, 0);
            Grid.SetColumnSpan(row.Header, 2);
            grid.Children.Add(row.Header);

            row.Text = new TextBox
            {
                FontSize = 18,
                Padding = new Thickness(8, 6, 8, 6),
                TextWrapping = TextWrapping.Wrap,
                AcceptsReturn = false,
                MinHeight = 44,
                VerticalContentAlignment = VerticalAlignment.Center,
            };
            Grid.SetRow(row.Text, 1);
            Grid.SetColumn(row.Text, 0);
            grid.Children.Add(row.Text);

            var side = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(8, 0, 0, 0) };
            row.ImgBtn = new Button { Content = "🖼 Image…", FontSize = 15, Padding = new Thickness(10, 8, 10, 8) };
            row.ImgBtn.Click += (s, e) => PickImage(row);
            side.Children.Add(row.ImgBtn);
            var del = new Button { Content = "🗑", FontSize = 15, Padding = new Thickness(10, 8, 10, 8), Margin = new Thickness(6, 0, 0, 0) };
            del.Click += (s, e) => RemoveRow(row);
            side.Children.Add(del);
            Grid.SetRow(side, 1);
            Grid.SetColumn(side, 1);
            grid.Children.Add(side);

            row.Ui = new Border
            {
                Background = Brushes.White,
                CornerRadius = new CornerRadius(10),
                Padding = new Thickness(12),
                Margin = new Thickness(0, 0, 0, 10),
                Child = grid,
            };

            _rows.Add(row);
            _pagesHost.Children.Add(row.Ui);
            RenumberRows();
        }

        private void RemoveRow(Row row)
        {
            if (_rows.Count <= 1) return; // toujours au moins une page
            _rows.Remove(row);
            _pagesHost.Children.Remove(row.Ui);
            RenumberRows();
        }

        private void RenumberRows()
        {
            for (int i = 0; i < _rows.Count; i++)
                _rows[i].Header.Text = "Page " + (i + 1);
        }

        private void PickImage(Row row)
        {
            var dlg = new OpenFileDialog
            {
                Title = "Image de la page",
                Filter = "Images|*.png;*.jpg;*.jpeg;*.bmp;*.gif",
            };
            if (dlg.ShowDialog(this) == true)
            {
                row.ImagePath = dlg.FileName;
                row.ImgBtn.Content = "🖼 " + Path.GetFileName(dlg.FileName);
            }
        }

        private void Save(object sender, RoutedEventArgs e)
        {
            var title = _title.Text.Trim();
            if (title.Length == 0)
            {
                MessageBox.Show(this, "Donne un titre au livre 🙂", "Nouveau livre");
                return;
            }
            var pages = _rows
                .Where(r => r.Text.Text.Trim().Length > 0)
                .Select(r => (r.Text.Text.Trim(), r.ImagePath))
                .ToList();
            if (pages.Count == 0)
            {
                MessageBox.Show(this, "Écris au moins une page 🙂", "Nouveau livre");
                return;
            }

            if (UserContent.SaveStory(title, pages) == null)
            {
                MessageBox.Show(this, "Impossible d'enregistrer le livre.", "Nouveau livre");
                return;
            }
            DialogResult = true;
        }
    }
}
