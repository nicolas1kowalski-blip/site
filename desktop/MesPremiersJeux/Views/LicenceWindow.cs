using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using MesPremiersJeux.Lib;

namespace MesPremiersJeux.Views
{
    /// <summary>
    /// 🔑 L'écran d'activation : « Entrez votre numéro de licence ». Affiché au
    /// démarrage tant qu'aucune licence valide n'est enregistrée. Pour le
    /// parent, à la souris ou au clavier.
    /// </summary>
    public sealed class LicenceWindow : Window
    {
        private readonly Settings _settings;
        private readonly TextBox _box;
        private readonly TextBlock _msg;
        private readonly Button _ok;

        public LicenceWindow(Settings settings)
        {
            _settings = settings;
            Title = "Mes Premiers Jeux — Licence";
            Width = 640;
            Height = 420;
            WindowStartupLocation = WindowStartupLocation.CenterScreen;
            ResizeMode = ResizeMode.NoResize;
            Topmost = true;
            Background = new LinearGradientBrush(Color.FromRgb(0xF6, 0xF0, 0xFF), Color.FromRgb(0xFF, 0xF6, 0xEC), 90);

            var panel = new StackPanel { Margin = new Thickness(36, 28, 36, 20) };
            panel.Children.Add(new TextBlock
            {
                Text = "🔑 Bienvenue dans Mes Premiers Jeux", FontSize = 26, FontWeight = FontWeights.ExtraBold,
                Foreground = new SolidColorBrush(Color.FromRgb(0x3B, 0x2A, 0x5A)),
            });
            panel.Children.Add(new TextBlock
            {
                Text = "Entrez le numéro de licence qui vous a été donné. Il est de la forme MPJ-XXXX-XXXX-XXXX-XXXX. " +
                       "Toutes les tablettes activées avec le même numéro forment une même famille.",
                FontSize = 15, TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 10, 0, 16),
                Foreground = new SolidColorBrush(Color.FromRgb(0x5A, 0x4A, 0x7A)),
            });
            _box = new TextBox
            {
                Text = settings.LicenceKey ?? "", FontSize = 28, FontFamily = new FontFamily("Consolas"), Padding = new Thickness(12, 8, 12, 8),
                CharacterCasing = CharacterCasing.Upper, MaxLength = 32,
            };
            _box.TextChanged += (s, e) => _ok.IsEnabled = _box.Text.Trim().Length >= 8;
            panel.Children.Add(_box);
            _msg = new TextBlock { FontSize = 14, TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 10, 0, 0), Foreground = new SolidColorBrush(Color.FromRgb(0xC0, 0x39, 0x2B)), MinHeight = 44 };
            panel.Children.Add(_msg);

            var row = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Right, Margin = new Thickness(0, 10, 0, 0) };
            var quit = new Button { Content = "Quitter", FontSize = 16, Padding = new Thickness(18, 8, 18, 8), Margin = new Thickness(0, 0, 10, 0) };
            quit.Click += (s, e) => { DialogResult = false; Close(); };
            _ok = new Button { Content = "Activer", FontSize = 16, FontWeight = FontWeights.Bold, Padding = new Thickness(22, 8, 22, 8), IsDefault = true, IsEnabled = _box.Text.Trim().Length >= 8 };
            _ok.Click += async (s, e) => await Activate();
            row.Children.Add(quit);
            row.Children.Add(_ok);
            panel.Children.Add(row);

            panel.Children.Add(new TextBlock
            {
                Text = "Version " + Updater.Current + (Cloud.Configured ? "" : " · serveur de licences non configuré (licences maîtres seulement)"),
                FontSize = 11, Foreground = new SolidColorBrush(Color.FromRgb(0x9A, 0x8A, 0xB8)), Margin = new Thickness(0, 14, 0, 0),
            });
            Content = panel;
            Loaded += (s, e) => { _box.Focus(); _box.SelectAll(); };
        }

        private async System.Threading.Tasks.Task Activate()
        {
            _ok.IsEnabled = false;
            _msg.Foreground = new SolidColorBrush(Color.FromRgb(0x5A, 0x4A, 0x7A));
            _msg.Text = "Vérification…";
            string err = null;
            try { err = await Licence.ActivateAsync(_settings, _box.Text); }
            catch (Exception ex) { err = ex.Message; }
            if (err == null)
            {
                _msg.Foreground = new SolidColorBrush(Color.FromRgb(0x2E, 0x9E, 0x4F));
                _msg.Text = "✅ Licence activée : " + Licence.Describe(_settings);
                await System.Threading.Tasks.Task.Delay(900);
                DialogResult = true;
                Close();
                return;
            }
            _msg.Foreground = new SolidColorBrush(Color.FromRgb(0xC0, 0x39, 0x2B));
            _msg.Text = "⚠ " + err;
            _ok.IsEnabled = true;
        }
    }
}
