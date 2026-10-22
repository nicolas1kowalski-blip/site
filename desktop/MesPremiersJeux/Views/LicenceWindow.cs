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
        private readonly PasswordBox _pass;

        public LicenceWindow(Settings settings)
        {
            _settings = settings;
            Title = "Eyzi — Licence";
            Width = 640;
            Height = 560;
            WindowStartupLocation = WindowStartupLocation.CenterScreen;
            ResizeMode = ResizeMode.NoResize;
            Topmost = true;
            Background = new LinearGradientBrush(Color.FromRgb(0xF6, 0xF0, 0xFF), Color.FromRgb(0xFF, 0xF6, 0xEC), 90);

            var panel = new StackPanel { Margin = new Thickness(36, 28, 36, 20) };
            panel.Children.Add(new TextBlock
            {
                Text = "🔑 Bienvenue dans Eyzi", FontSize = 26, FontWeight = FontWeights.ExtraBold,
                Foreground = new SolidColorBrush(Color.FromRgb(0x3B, 0x2A, 0x5A)),
            });
            panel.Children.Add(new TextBlock
            {
                Text = TrialIntro(settings),
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
            panel.Children.Add(new TextBlock
            {
                Text = "Mot de passe famille (le même sur toutes vos tablettes : il chiffre vos photos et vos voix dans le nuage ; personne d'autre ne peut les lire, pas même l'éditeur) :",
                FontSize = 13, TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 14, 0, 4), Foreground = new SolidColorBrush(Color.FromRgb(0x5A, 0x4A, 0x7A)),
            });
            _pass = new PasswordBox { FontSize = 20, Padding = new Thickness(10, 6, 10, 6), Password = settings.FamilyPassphrase ?? "" };
            panel.Children.Add(_pass);
            _msg = new TextBlock { FontSize = 14, TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 10, 0, 0), Foreground = new SolidColorBrush(Color.FromRgb(0xC0, 0x39, 0x2B)), MinHeight = 44 };
            panel.Children.Add(_msg);

            var row = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Right, Margin = new Thickness(0, 10, 0, 0) };
            var quit = new Button { Content = "Quitter", FontSize = 16, Padding = new Thickness(18, 8, 18, 8), Margin = new Thickness(0, 0, 10, 0) };
            quit.Click += (s, e) => { DialogResult = false; Close(); };
            int left = Licence.TrialDaysLeft(settings);
            if (left != 0 && !(settings.LicenceOk && !string.IsNullOrWhiteSpace(settings.LicenceKey)))
            {
                var trial = new Button
                {
                    Content = left < 0 ? "🎁 Essayer " + Licence.TrialDays + " jours sans licence" : "▶ Continuer l'essai (" + left + (left > 1 ? " jours)" : " jour)"),
                    FontSize = 16, Padding = new Thickness(18, 8, 18, 8), Margin = new Thickness(0, 0, 10, 0),
                };
                trial.Click += (s, e) => { Licence.StartTrial(_settings); DialogResult = true; Close(); };
                row.Children.Add(trial);
            }
            _ok = new Button { Content = "Activer", FontSize = 16, FontWeight = FontWeights.Bold, Padding = new Thickness(22, 8, 22, 8), IsDefault = true, IsEnabled = _box.Text.Trim().Length >= 8 };
            _ok.Click += async (s, e) => await Activate();
            row.Children.Add(quit);
            row.Children.Add(_ok);
            panel.Children.Add(row);

            panel.Children.Add(new TextBlock
            {
                Text = "eyzi.fr · version bêta " + Updater.Current + (Cloud.Configured ? "" : " · serveur de licences non configuré (licences maîtres seulement)"),
                FontSize = 11, Foreground = new SolidColorBrush(Color.FromRgb(0x9A, 0x8A, 0xB8)), Margin = new Thickness(0, 14, 0, 0),
            });
            Content = panel;
            Loaded += (s, e) => { _box.Focus(); _box.SelectAll(); };
        }

        private static string TrialIntro(Settings s)
        {
            int left = Licence.TrialDaysLeft(s);
            string lic = "Entrez le numéro de licence qui vous a été donné (forme EYZ-XXXX-XXXX-XXXX-XXXX). Toutes les tablettes activées avec le même numéro forment une même famille. Pendant la bêta, la licence est gratuite : eyzi.fr/licence.html";
            if (s.LicenceOk && !string.IsNullOrWhiteSpace(s.LicenceKey)) return lic;
            if (left < 0) return "Vous pouvez essayer Eyzi " + Licence.TrialDays + " jours sans licence, toutes fonctions ouvertes. " + lic;
            if (left > 0) return "Essai gratuit : il reste " + left + (left > 1 ? " jours." : " jour.") + " " + lic;
            return "L'essai gratuit de " + Licence.TrialDays + " jours est terminé. " + lic;
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
                var pass = _pass.Password ?? "";
                if (pass.Length > 0 && pass.Length < 6) { _msg.Text = "⚠ Le mot de passe famille doit faire au moins 6 caractères."; _ok.IsEnabled = true; return; }
                if (pass != (_settings.FamilyPassphrase ?? "")) { _settings.FamilyPassphrase = pass; _settings.CloudLastSync = ""; _settings.CloudLastFingerprint = ""; _settings.Save(); }
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
