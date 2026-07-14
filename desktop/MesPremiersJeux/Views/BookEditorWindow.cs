using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using Microsoft.Win32;
using MesPremiersJeux.Games;
using MesPremiersJeux.Lib;

namespace MesPremiersJeux.Views
{
    /// <summary>
    /// Éditeur de livre (pour le parent) : titre + pages (texte, photo, zones
    /// interactives) + un quiz de fin (questions Vrai/Faux ou choix d'image),
    /// et import d'un fichier JSON au même format que l'application web. À
    /// l'enregistrement, le livre est écrit dans le dossier Contenu\Histoires.
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
            public Image Preview;
            public PageDraft Draft = new PageDraft();
        }

        // Une question dans l'éditeur.
        private sealed class QRow
        {
            public Border Ui;
            public TextBlock Header;
            public TextBox Text;
            public ComboBox Type;
            public StackPanel VfPanel;
            public RadioButton VfTrue;
            public StackPanel ImgPanel;
            public StackPanel ChoicesHost;
            public readonly List<QChoice> Choices = new List<QChoice>();
            public readonly string Group = Guid.NewGuid().ToString("N"); // radios « bonne réponse »
        }

        private sealed class QChoice
        {
            public Border Ui;
            public ContentControl Preview;
            public RadioButton Correct;
            public QuizChoice Data = new QuizChoice();
        }

        private readonly TextBox _title;
        private readonly StackPanel _pagesHost;
        private readonly StackPanel _questionsHost;
        private readonly List<Row> _rows = new List<Row>();
        private readonly List<QRow> _qRows = new List<QRow>();
        private readonly string _existingDir; // non nul = modification d'un livre

        /// <summary>Ouvre l'éditeur pré-rempli pour modifier un livre existant.</summary>
        public BookEditorWindow(string title, List<PageDraft> pages, List<UserQuestion> questions, string existingDir) : this()
        {
            _existingDir = existingDir;
            Title = "Modifier le livre";
            _title.Text = title;

            _rows.Clear();
            _pagesHost.Children.Clear();
            foreach (var draft in pages)
            {
                var row = AddRow();
                row.Draft = draft;
                row.Text.Text = draft.Text;
                RefreshRowButtons(row);
            }

            if (questions != null)
                foreach (var q in questions) AddQuestion(q);
        }

        public BookEditorWindow()
        {
            // Pause du regard tant que l'éditeur est ouvert (usage parent, souris).
            Gaze.GazeGate.Push();
            Closed += (s, e) => Gaze.GazeGate.Pop();

            Title = "Nouveau livre";
            Width = 860;
            Height = 720;
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

            // Contenu défilant : pages, puis section « Questions ».
            _pagesHost = new StackPanel();
            _questionsHost = new StackPanel();

            var scrollHost = new StackPanel();
            scrollHost.Children.Add(SectionTitle("📖 Pages"));
            scrollHost.Children.Add(_pagesHost);

            scrollHost.Children.Add(SectionTitle("🎯 Questions de fin (quiz)"));
            scrollHost.Children.Add(new TextBlock
            {
                Text = "Facultatif : à la fin de l'histoire, l'enfant répond à ces questions " +
                       "(Vrai / Faux, ou en choisissant la bonne image).",
                FontSize = 14,
                Foreground = new SolidColorBrush(Color.FromRgb(0x6B, 0x5B, 0x8A)),
                TextWrapping = TextWrapping.Wrap,
                Margin = new Thickness(2, 0, 2, 8),
            });
            scrollHost.Children.Add(_questionsHost);
            scrollHost.Children.Add(MakeButton("➕ Ajouter une question", (s, e) => AddQuestion(null)));

            dock.Children.Add(new ScrollViewer
            {
                Content = scrollHost,
                VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
            });

            Content = dock;
            AddRow();
        }

        private static TextBlock SectionTitle(string text) => new TextBlock
        {
            Text = text,
            FontSize = 19,
            FontWeight = FontWeights.Bold,
            Foreground = new SolidColorBrush(Color.FromRgb(0x7E, 0x3F, 0xF2)),
            Margin = new Thickness(0, 10, 0, 8),
        };

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

        // ------------------------------------------------------------------ pages
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
            row.Preview = new Image
            {
                Width = 120,
                Height = 84,
                Stretch = Stretch.Uniform,
                Margin = new Thickness(0, 0, 8, 0),
                Visibility = Visibility.Collapsed,
            };
            side.Children.Add(row.Preview);
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
            // Réordonner la page (utile si l'import n'est pas dans l'ordre).
            var up = new Button { Content = "⬆", FontSize = 15, Padding = new Thickness(10, 8, 10, 8), Margin = new Thickness(12, 0, 0, 0), ToolTip = "Monter la page" };
            up.Click += (s, e) => MoveRow(row, -1);
            side.Children.Add(up);
            var down = new Button { Content = "⬇", FontSize = 15, Padding = new Thickness(6, 8, 6, 8), Margin = new Thickness(6, 0, 0, 0), ToolTip = "Descendre la page" };
            down.Click += (s, e) => MoveRow(row, +1);
            side.Children.Add(down);
            var del = new Button { Content = "🗑", FontSize = 15, Padding = new Thickness(10, 8, 10, 8), Margin = new Thickness(12, 0, 0, 0) };
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

        // Déplace une page vers le haut (-1) ou le bas (+1) dans la liste et à l'écran.
        private void MoveRow(Row row, int delta)
        {
            int i = _rows.IndexOf(row);
            int j = i + delta;
            if (i < 0 || j < 0 || j >= _rows.Count) return;
            _rows.RemoveAt(i);
            _rows.Insert(j, row);
            _pagesHost.Children.RemoveAt(i);
            _pagesHost.Children.Insert(j, row.Ui);
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
            bool hasImg = UserContent.IsImageRef(row.Draft.ImagePath);
            row.ImgBtn.Content = hasImg ? "🖼 Changer" : "🖼 Photo…";
            row.ZonesBtn.IsEnabled = hasImg;
            row.ZonesBtn.Content = row.Draft.Zones.Count > 0 ? $"🎯 Zones ({row.Draft.Zones.Count})" : "🎯 Zones";

            if (hasImg)
            {
                try
                {
                    row.Preview.Source = UserContent.LoadBitmap(row.Draft.ImagePath, 300);
                    row.Preview.Visibility = Visibility.Visible;
                }
                catch { row.Preview.Visibility = Visibility.Collapsed; }
            }
            else
            {
                row.Preview.Visibility = Visibility.Collapsed;
            }
        }

        // ------------------------------------------------------------------ questions
        private void AddQuestion(UserQuestion data)
        {
            var q = new QRow();

            var panel = new StackPanel();

            var head = new DockPanel { Margin = new Thickness(0, 0, 0, 6) };
            q.Header = new TextBlock
            {
                FontSize = 16,
                FontWeight = FontWeights.Bold,
                Foreground = new SolidColorBrush(Color.FromRgb(0x7E, 0x3F, 0xF2)),
                VerticalAlignment = VerticalAlignment.Center,
            };
            head.Children.Add(q.Header);
            var delQ = new Button { Content = "🗑", FontSize = 15, Padding = new Thickness(10, 5, 10, 5), HorizontalAlignment = HorizontalAlignment.Right };
            delQ.Click += (s, e) => RemoveQuestion(q);
            DockPanel.SetDock(delQ, Dock.Right);
            head.Children.Add(delQ);
            panel.Children.Add(head);

            q.Text = new TextBox
            {
                FontSize = 18,
                Padding = new Thickness(8, 6, 8, 6),
                TextWrapping = TextWrapping.Wrap,
                MinHeight = 40,
                Margin = new Thickness(0, 0, 0, 8),
            };
            panel.Children.Add(q.Text);

            var typeRow = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 0, 0, 8) };
            typeRow.Children.Add(new TextBlock { Text = "Type : ", FontSize = 15, VerticalAlignment = VerticalAlignment.Center });
            q.Type = new ComboBox { FontSize = 15, Width = 160 };
            q.Type.Items.Add("Vrai / Faux");
            q.Type.Items.Add("Images");
            q.Type.SelectedIndex = 0;
            q.Type.SelectionChanged += (s, e) => UpdateQuestionType(q);
            typeRow.Children.Add(q.Type);
            panel.Children.Add(typeRow);

            // Vrai / Faux.
            q.VfPanel = new StackPanel { Orientation = Orientation.Horizontal };
            q.VfTrue = new RadioButton { Content = "Vrai", FontSize = 16, GroupName = "vf" + q.Group, IsChecked = true, Margin = new Thickness(0, 0, 20, 0) };
            var vfFalse = new RadioButton { Content = "Faux", FontSize = 16, GroupName = "vf" + q.Group };
            q.VfPanel.Children.Add(new TextBlock { Text = "Bonne réponse : ", FontSize = 15, VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(0, 0, 10, 0) });
            q.VfPanel.Children.Add(q.VfTrue);
            q.VfPanel.Children.Add(vfFalse);
            panel.Children.Add(q.VfPanel);

            // Images.
            q.ImgPanel = new StackPanel { Visibility = Visibility.Collapsed };
            q.ImgPanel.Children.Add(new TextBlock
            {
                Text = "Ajoute 2 à 4 images et coche la bonne réponse :",
                FontSize = 14,
                Foreground = new SolidColorBrush(Color.FromRgb(0x6B, 0x5B, 0x8A)),
                Margin = new Thickness(0, 0, 0, 6),
            });
            q.ChoicesHost = new StackPanel();
            q.ImgPanel.Children.Add(q.ChoicesHost);
            q.ImgPanel.Children.Add(MakeButton("➕ Image réponse", (s, e) => AddChoice(q, null)));
            panel.Children.Add(q.ImgPanel);

            q.Ui = new Border
            {
                Background = Brushes.White,
                CornerRadius = new CornerRadius(10),
                Padding = new Thickness(12),
                Margin = new Thickness(0, 0, 0, 10),
                Child = panel,
            };

            _qRows.Add(q);
            _questionsHost.Children.Add(q.Ui);
            RenumberQuestions();

            // Pré-remplissage (édition / import).
            if (data != null)
            {
                q.Text.Text = data.Text;
                if (data.Kind == QuizKind.Image)
                {
                    q.Type.SelectedIndex = 1;
                    foreach (var c in data.Choices) AddChoice(q, c);
                }
                else
                {
                    q.Type.SelectedIndex = 0;
                    q.VfTrue.IsChecked = data.Answer;
                    ((RadioButton)q.VfPanel.Children[q.VfPanel.Children.Count - 1]).IsChecked = !data.Answer;
                }
                UpdateQuestionType(q);
            }
        }

        private void UpdateQuestionType(QRow q)
        {
            bool image = q.Type.SelectedIndex == 1;
            q.VfPanel.Visibility = image ? Visibility.Collapsed : Visibility.Visible;
            q.ImgPanel.Visibility = image ? Visibility.Visible : Visibility.Collapsed;
            if (image && q.Choices.Count == 0)
            {
                AddChoice(q, null);
                AddChoice(q, null);
            }
        }

        private void RemoveQuestion(QRow q)
        {
            _qRows.Remove(q);
            _questionsHost.Children.Remove(q.Ui);
            RenumberQuestions();
        }

        private void RenumberQuestions()
        {
            for (int i = 0; i < _qRows.Count; i++)
                _qRows[i].Header.Text = "Question " + (i + 1);
        }

        private void AddChoice(QRow q, QuizChoice data)
        {
            if (q.Choices.Count >= 4) return;
            var choice = new QChoice { Data = data ?? new QuizChoice() };

            var line = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 0, 0, 6) };
            choice.Preview = new ContentControl { Width = 64, Height = 48, Margin = new Thickness(0, 0, 8, 0) };
            line.Children.Add(choice.Preview);

            var pick = new Button { Content = "🖼 Image…", FontSize = 14, Padding = new Thickness(10, 6, 10, 6) };
            pick.Click += (s, e) => PickChoiceImage(choice);
            line.Children.Add(pick);

            choice.Correct = new RadioButton
            {
                Content = "Bonne réponse",
                FontSize = 15,
                GroupName = "ok" + q.Group,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(12, 0, 0, 0),
                IsChecked = choice.Data.Correct || q.Choices.Count == 0, // la 1re est cochée par défaut
            };
            line.Children.Add(choice.Correct);

            var del = new Button { Content = "🗑", FontSize = 14, Padding = new Thickness(8, 6, 8, 6), Margin = new Thickness(12, 0, 0, 0) };
            del.Click += (s, e) => { q.Choices.Remove(choice); q.ChoicesHost.Children.Remove(choice.Ui); };
            line.Children.Add(del);

            choice.Ui = new Border
            {
                Background = new SolidColorBrush(Color.FromRgb(0xF6, 0xF1, 0xFF)),
                CornerRadius = new CornerRadius(8),
                Padding = new Thickness(8),
                Margin = new Thickness(0, 0, 0, 6),
                Child = line,
            };
            q.Choices.Add(choice);
            q.ChoicesHost.Children.Add(choice.Ui);
            RefreshChoicePreview(choice);
        }

        private void PickChoiceImage(QChoice choice)
        {
            var dlg = new OpenFileDialog
            {
                Title = "Image de la réponse",
                Filter = "Images|*.png;*.jpg;*.jpeg;*.bmp;*.gif",
            };
            if (dlg.ShowDialog(this) == true)
            {
                choice.Data.ImagePath = dlg.FileName;
                choice.Data.Draw = null;
                RefreshChoicePreview(choice);
            }
        }

        private static void RefreshChoicePreview(QChoice choice)
        {
            try
            {
                if (!string.IsNullOrEmpty(choice.Data.Draw))
                {
                    choice.Preview.Content = new Viewbox { Child = CartoonArt.Draw(choice.Data.Draw), Stretch = Stretch.Uniform };
                    return;
                }
                if (UserContent.IsImageRef(choice.Data.ImagePath))
                {
                    choice.Preview.Content = new Image { Source = UserContent.LoadBitmap(choice.Data.ImagePath, 200), Stretch = Stretch.Uniform };
                    return;
                }
            }
            catch { }
            choice.Preview.Content = new TextBlock { Text = "🖼", FontSize = 30, HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center };
        }

        private List<UserQuestion> CollectQuestions()
        {
            var list = new List<UserQuestion>();
            foreach (var q in _qRows)
            {
                var text = q.Text.Text.Trim();
                if (text.Length == 0) continue;

                var uq = new UserQuestion { Text = text };
                if (q.Type.SelectedIndex == 1)
                {
                    uq.Kind = QuizKind.Image;
                    foreach (var c in q.Choices)
                    {
                        c.Data.Correct = c.Correct.IsChecked == true;
                        if (!string.IsNullOrEmpty(c.Data.ImagePath) || !string.IsNullOrEmpty(c.Data.Draw))
                            uq.Choices.Add(c.Data);
                    }
                    if (uq.Choices.Count < 2 || !uq.Choices.Any(c => c.Correct)) continue; // question incomplète : ignorée
                }
                else
                {
                    uq.Kind = QuizKind.TrueFalse;
                    uq.Answer = q.VfTrue.IsChecked == true;
                }
                list.Add(uq);
            }
            return list;
        }

        // ------------------------------------------------------------------ import / enregistrement
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

            _title.Text = result.Title;
            _rows.Clear();
            _pagesHost.Children.Clear();
            foreach (var draft in result.Pages)
            {
                var row = AddRow();
                row.Draft = draft;
                row.Text.Text = draft.Text;
                RefreshRowButtons(row);
            }

            _qRows.Clear();
            _questionsHost.Children.Clear();
            foreach (var q in result.Questions) AddQuestion(q);
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

            var questions = CollectQuestions();

            var saved = _existingDir != null
                ? UserContent.UpdateStory(_existingDir, title, pages, questions)
                : UserContent.SaveStory(title, pages, questions);
            if (saved == null)
            {
                MessageBox.Show(this, "Impossible d'enregistrer le livre.", "Nouveau livre");
                return;
            }
            DialogResult = true;
        }
    }
}
