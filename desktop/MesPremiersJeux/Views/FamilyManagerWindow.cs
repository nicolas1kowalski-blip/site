using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using Microsoft.Win32;
using MesPremiersJeux.Lib;

namespace MesPremiersJeux.Views
{
    /// <summary>
    /// Gestion des photos de famille (pour le parent) : ajouter une photo avec le
    /// nom de la personne (« papa », « maman »…), voir la liste, supprimer.
    /// Ces photos apparaissent dans l'imagier (« Trouve papa ! »).
    /// </summary>
    public sealed class FamilyManagerWindow : Window
    {
        private readonly WrapPanel _list;
        private readonly TextBox _name;

        public FamilyManagerWindow()
        {
            Gaze.GazeGate.Push();
            Closed += (s, e) => Gaze.GazeGate.Pop();

            Title = "Photos de famille";
            Width = 760;
            Height = 620;
            WindowStartupLocation = WindowStartupLocation.CenterOwner;
            Background = new SolidColorBrush(Color.FromRgb(0xFB, 0xF3, 0xFF));

            var dock = new DockPanel { Margin = new Thickness(18) };

            // Barre d'ajout : nom + choisir la photo.
            var addRow = new DockPanel { Margin = new Thickness(0, 0, 0, 14) };
            addRow.Children.Add(new TextBlock
            {
                Text = "Nom : ",
                FontSize = 18,
                FontWeight = FontWeights.Bold,
                VerticalAlignment = VerticalAlignment.Center,
            });
            var addBtn = new Button { Content = "🖼 Choisir la photo…", FontSize = 16, Padding = new Thickness(14, 8, 14, 8), Margin = new Thickness(8, 0, 0, 0) };
            addBtn.Click += (s, e) => AddPhoto();
            DockPanel.SetDock(addBtn, Dock.Right);
            addRow.Children.Add(addBtn);
            _name = new TextBox { FontSize = 18, Padding = new Thickness(8, 6, 8, 6) };
            addRow.Children.Add(_name);
            DockPanel.SetDock(addRow, Dock.Top);
            dock.Children.Add(addRow);

            var help = new TextBlock
            {
                Text = "Écris le nom (ex. « papa »), choisis la photo : elle apparaîtra dans l'imagier (« Trouve papa ! »).",
                FontSize = 13,
                Foreground = Brushes.Gray,
                TextWrapping = TextWrapping.Wrap,
                Margin = new Thickness(0, 0, 0, 12),
            };
            DockPanel.SetDock(help, Dock.Top);
            dock.Children.Add(help);

            var close = new Button
            {
                Content = "Fermer",
                FontSize = 16,
                Padding = new Thickness(16, 10, 16, 10),
                HorizontalAlignment = HorizontalAlignment.Right,
                Margin = new Thickness(0, 12, 0, 0),
            };
            close.Click += (s, e) => Close();
            DockPanel.SetDock(close, Dock.Bottom);
            dock.Children.Add(close);

            _list = new WrapPanel();
            dock.Children.Add(new ScrollViewer
            {
                Content = _list,
                VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
            });

            Content = dock;
            Refresh();
        }

        private void AddPhoto()
        {
            var name = _name.Text.Trim();
            if (name.Length == 0)
            {
                MessageBox.Show(this, "Écris d'abord le nom de la personne (ex. « papa »).", "Photos de famille");
                return;
            }
            var dlg = new OpenFileDialog
            {
                Title = "Photo de " + name,
                Filter = "Images|*.png;*.jpg;*.jpeg;*.bmp;*.gif",
            };
            if (dlg.ShowDialog(this) != true) return;

            if (UserContent.AddFamilyPhoto(dlg.FileName, name))
            {
                _name.Text = "";
                Refresh();
            }
            else
            {
                MessageBox.Show(this, "Impossible d'ajouter cette photo.", "Photos de famille");
            }
        }

        private void Refresh()
        {
            _list.Children.Clear();
            foreach (var (name, path) in UserContent.LoadFamily())
            {
                var card = new StackPanel { Margin = new Thickness(8), Width = 150 };
                try
                {
                    card.Children.Add(new Border
                    {
                        CornerRadius = new CornerRadius(12),
                        ClipToBounds = true,
                        Height = 120,
                        Child = new Image { Source = UserContent.LoadBitmap(path, 300), Stretch = Stretch.UniformToFill },
                    });
                }
                catch { card.Children.Add(new TextBlock { Text = "🖼️", FontSize = 60, HorizontalAlignment = HorizontalAlignment.Center }); }

                card.Children.Add(new TextBlock
                {
                    Text = name,
                    FontSize = 16,
                    FontWeight = FontWeights.Bold,
                    HorizontalAlignment = HorizontalAlignment.Center,
                    Margin = new Thickness(0, 6, 0, 2),
                });
                var del = new Button { Content = "🗑 Supprimer", FontSize = 13, Padding = new Thickness(8, 4, 8, 4), HorizontalAlignment = HorizontalAlignment.Center };
                var p = path;
                var n = name;
                del.Click += (s, e) =>
                {
                    if (MessageBox.Show(this, $"Supprimer la photo de « {n} » ?", "Photos de famille",
                            MessageBoxButton.YesNo, MessageBoxImage.Warning) == MessageBoxResult.Yes)
                    {
                        UserContent.DeleteFamilyPhoto(p);
                        Refresh();
                    }
                };
                card.Children.Add(del);
                _list.Children.Add(card);
            }

            if (_list.Children.Count == 0)
                _list.Children.Add(new TextBlock { Text = "Aucune photo pour l'instant.", FontSize = 15, Foreground = Brushes.Gray, Margin = new Thickness(8) });
        }
    }
}
