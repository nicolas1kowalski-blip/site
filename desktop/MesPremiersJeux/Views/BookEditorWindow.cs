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
    /// Éditeur de livre (pour le parent) : titre + pages (texte, photo, zones
    /// interactives), et import d'un fichier JSON au même format que
    /// l'application web. À l'enregistrement, le livre est écrit dans
    /// Documents\MesPremiersJeux\Histoires et apparaît aussitôt.
    /// </summary>
    public sealed class BookEditorWindow : Window
    {
        private sealed class Row
        {
            public Border Ui;
            public TextBlock Header;
            public TextBox Text;
            public Button ImgBtn;
            public Button ZonesBtn;
            public PageDraft Draft = new PageDraft();
        }

        private readonly TextBox _title;
        private readonly StackPanel _pagesHost;
        private readonly List<Row> _rows = new List<Row>();

        public BookEditorWindow()
        {
            Title = "Nouveau livre";
            Width = 820;
            Height = 700;
            WindowStartupLocation = WindowStartupLocation.CenterOwner;
            Background = new SolidColorBrush(Color.FromRgb(0xFB, 0xF3, 0xFF));

            var dock = new DockPanel { Margin = new Thickness(18) };

            // Titre + import JSON.
            var titleRow = new DockPanel { Margin = new Thickness(0, 0, 0, 12) };
            titleRow.Children.Add(new TextBlock
            {
                Text = "Titre : ",
                FontSize = 20,
                FontWeight = FontWeights.Bold,
                VerticalAlignment = VerticalAlignment.Center,
            });
            var import = MakeButton("📥 Importer un JSON", ImportJson);
            DockPanel.SetDock(import, Dock.Right);
            titleRow.Children.Add(import);
            _title = new TextBox { FontSize = 20, Padding = new Thickness(8, 6, 8, 6), Margin = new Thickness(0, 0, 8, 0) };
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

        private Row AddRow()
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
            row.ImgBtn = new Button { Content = "🖼 Photo…", FontSize = 15, Padding = new Thickness(10, 8, 10, 8) };
            row.ImgBtn.Click += (s, e) => PickImage(row);
            side.Children.Add(row.ImgBtn);
            row.ZonesBtn = new Button
            {
                Content = "🎯 Zones",
                FontSize = 15,
                Padding = new Thickness(10, 8, 10, 8),
                Margin = new Thickness(6, 0, 0, 0),
                IsEnabled = false,
            };
            row.ZonesBtn.Click += (s, e) => EditZones(row);
            side.Children.Add(row.ZonesBtn);
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
            return row;
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
                Title = "Photo de la page",
                Filter = "Images|*.png;*.jpg;*.jpeg;*.bmp;*.gif",
            };
            if (dlg.ShowDialog(this) == true)
            {
                row.Draft.ImagePath = dlg.FileName;
                row.Draft.Zones.Clear(); // nouvelles zones pour la nouvelle photo
                RefreshRowButtons(row);
            }
        }

        private void EditZones(Row row)
        {
            if (string.IsNullOrEmpty(row.Draft.ImagePath)) return;
            var editor = new ZoneEditorWindow(row.Draft.ImagePath, row.Draft.Zones) { Owner = this };
            if (editor.ShowDialog() == true)
            {
                row.Draft.Zones = editor.Zones;
                RefreshRowButtons(row);
            }
        }

        private void RefreshRowButtons(Row row)
        {
            bool hasImg = !string.IsNullOrEmpty(row.Draft.ImagePath);
            row.ImgBtn.Content = hasImg ? "🖼 " + Path.GetFileName(row.Draft.ImagePath) : "🖼 Photo…";
            row.ZonesBtn.IsEnabled = hasImg;
            row.ZonesBtn.Content = row.Draft.Zones.Count > 0 ? $"🎯 Zones ({row.Draft.Zones.Count})" : "🎯 Zones";
        }

        // Import d'un JSON au format de l'application web.
        private void ImportJson(object sender, RoutedEventArgs e)
        {
            var dlg = new OpenFileDialog { Title = "Importer un livre (JSON)", Filter = "JSON|*.json" };
            if (dlg.ShowDialog(this) != true) return;

            var result = UserContent.ImportJson(File.ReadAllText(dlg.FileName), out var error);
            if (result == null)
            {
                MessageBox.Show(this, "Import impossible : " + error, "Importer un JSON");
                return;
            }

            _title.Text = result.Value.Title;
            _rows.Clear();
            _pagesHost.Children.Clear();
            foreach (var draft in result.Value.Pages)
            {
                var row = AddRow();
                row.Draft = draft;
                row.Text.Text = draft.Text;
                RefreshRowButtons(row);
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
            var pages = new List<PageDraft>();
            foreach (var r in _rows)
            {
                r.Draft.Text = r.Text.Text.Trim();
                if (r.Draft.Text.Length > 0 || !string.IsNullOrEmpty(r.Draft.ImagePath))
                    pages.Add(r.Draft);
            }
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
