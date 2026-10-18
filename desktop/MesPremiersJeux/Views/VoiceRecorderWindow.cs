using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using MesPremiersJeux.Gaze;
using MesPremiersJeux.Lib;

namespace MesPremiersJeux.Views
{
    /// <summary>
    /// Fenêtre parent « 🎙 Vos voix » : enregistrer au micro des « Bravo ! »
    /// et des « Bonjour ! » avec VOTRE voix. L'application les joue ensuite
    /// aux moments forts, à la place de la voix de synthèse — pour l'enfant,
    /// entendre papa ou maman le féliciter change tout. Les fichiers vivent
    /// dans Contenu\Voix (synchronisés entre les tablettes).
    /// </summary>
    public sealed class VoiceRecorderWindow : Window
    {
        private static readonly Brush Dark = new SolidColorBrush(Color.FromRgb(0x3B, 0x2A, 0x5A));
        private string _recordingCat;

        public VoiceRecorderWindow()
        {
            Title = "🎙 Vos voix";
            Width = 640;
            Height = 560;
            WindowStartupLocation = WindowStartupLocation.CenterOwner;
            Background = new SolidColorBrush(Color.FromRgb(0xFB, 0xF4, 0xFF));
            GazeGate.Push(); // le regard ne clique pas pendant qu'on enregistre
            Closed += (s, e) => { VoiceBank.CancelRecording(); GazeGate.Pop(); };

            var root = new StackPanel { Margin = new Thickness(22) };
            root.Children.Add(new TextBlock
            {
                Text = "Enregistrez des petites phrases avec VOTRE voix : l'application " +
                       "les jouera aux bons moments, à la place de la voix de synthèse.\n" +
                       "Conseil : parlez joyeusement, tout près du micro, 1 à 3 secondes.",
                FontSize = 15,
                Foreground = Dark,
                TextWrapping = TextWrapping.Wrap,
                Margin = new Thickness(0, 0, 0, 14),
            });

            root.Children.Add(Section("👏  Les « Bravo ! »",
                "Exemples : « Bravo Laura ! », « Super ma chérie ! », « Youpi, tu as réussi ! »\n" +
                "Joués quand elle réussit (une fois sur trois, pour la surprise). Enregistrez-en plusieurs !",
                "bravo"));
            root.Children.Add(Section("👋  Le « Bonjour ! »",
                "Exemple : « Bonjour Laura ! On va bien jouer ensemble ! »\n" +
                "Joué à l'ouverture de l'application.",
                "bonjour"));

            Content = new ScrollViewer { Content = root, VerticalScrollBarVisibility = ScrollBarVisibility.Auto };
        }

        private UIElement Section(string title, string hint, string cat)
        {
            var panel = new StackPanel { Margin = new Thickness(0, 6, 0, 10) };
            panel.Children.Add(new TextBlock { Text = title, FontSize = 19, FontWeight = FontWeights.Bold, Foreground = Dark });
            panel.Children.Add(new TextBlock { Text = hint, FontSize = 13, Foreground = new SolidColorBrush(Color.FromRgb(0x8A, 0x7A, 0xA8)), TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 2, 0, 6) });

            var count = new TextBlock { FontSize = 14, Foreground = Dark, VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(10, 0, 0, 0) };
            void Refresh() => count.Text = VoiceBank.Files(cat).Length + " enregistrement(s)";
            Refresh();

            var rec = new Button { Content = "🔴  Enregistrer", FontSize = 15, Padding = new Thickness(12, 8, 12, 8), Margin = new Thickness(0, 0, 8, 0) };
            var play = new Button { Content = "▶  Écouter le dernier", FontSize = 15, Padding = new Thickness(12, 8, 12, 8), Margin = new Thickness(0, 0, 8, 0) };
            var del = new Button { Content = "🗑  Supprimer le dernier", FontSize = 15, Padding = new Thickness(12, 8, 12, 8) };

            rec.Click += (s, e) =>
            {
                if (_recordingCat == null)
                {
                    var err = VoiceBank.StartRecording();
                    if (err != null) { MessageBox.Show(this, err, "Micro"); return; }
                    _recordingCat = cat;
                    rec.Content = "⏹  Terminer et garder";
                    rec.Background = new SolidColorBrush(Color.FromRgb(0xFF, 0xC4, 0xC4));
                }
                else if (_recordingCat == cat)
                {
                    var path = VoiceBank.StopRecording(cat);
                    _recordingCat = null;
                    rec.Content = "🔴  Enregistrer";
                    rec.ClearValue(BackgroundProperty);
                    if (path == null) MessageBox.Show(this, "L'enregistrement n'a pas pu être gardé.", "Micro");
                    else { Refresh(); VoiceBank.PlayFile(path); }
                }
                else
                {
                    MessageBox.Show(this, "Termine d'abord l'enregistrement en cours.", "Micro");
                }
            };
            play.Click += (s, e) =>
            {
                var files = VoiceBank.Files(cat);
                if (files.Length > 0) VoiceBank.PlayFile(files[files.Length - 1]);
            };
            del.Click += (s, e) => { VoiceBank.DeleteLast(cat); Refresh(); };

            var row = new StackPanel { Orientation = Orientation.Horizontal };
            row.Children.Add(rec);
            row.Children.Add(play);
            row.Children.Add(del);
            row.Children.Add(count);
            panel.Children.Add(row);
            panel.Children.Add(new Separator { Margin = new Thickness(0, 12, 0, 0) });
            return panel;
        }
    }
}
