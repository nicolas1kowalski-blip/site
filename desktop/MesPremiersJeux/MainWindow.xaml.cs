using System;
using System.Collections.Generic;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using MesPremiersJeux.Gaze;
using MesPremiersJeux.Lib;
using MesPremiersJeux.Views;

namespace MesPremiersJeux
{
    public partial class MainWindow : Window
    {
        private readonly GazeService _gaze = new GazeService();
        private readonly ProGazeSource _pro = new ProGazeSource();
        private string _srcName = "Regard";
        private int _clicks;
        private DwellController _dwell;
        private Settings _settings;

        private readonly Dictionary<string, FrameworkElement> _views = new Dictionary<string, FrameworkElement>();

        // Sauvegarde pour la bascule plein écran.
        private WindowStyle _prevStyle;
        private ResizeMode _prevResize;
        private WindowState _prevState;
        private bool _prevTopmost;
        private Rect _prevRect;
        private bool _isFullscreen;

        public MainWindow()
        {
            InitializeComponent();
            // Mode immersif : masque/affiche la barre du haut pendant une activité.
            Chrome.Changed += () => Dispatcher.Invoke(() =>
                TopBar.Visibility = Chrome.Immersive ? Visibility.Collapsed : Visibility.Visible);
            BuildViews();
            Loaded += OnLoaded;
            Closed += (s, e) => { _gaze.Dispose(); _pro.Dispose(); };
        }

        private void BuildViews()
        {
            var coloring = new ColoringView();
            coloring.ToggleFullscreenRequested += (s, e) => ToggleFullscreen();

            _views["stories"] = new StoriesView();
            _views["games"] = new GamesView();
            _views["edu"] = new EducationView();
            _views["coloring"] = coloring;
            _views["music"] = new MusicView();

            foreach (var v in _views.Values)
            {
                v.Visibility = Visibility.Collapsed;
                ContentHost.Children.Add(v);
            }
            Select("coloring");
        }

        private static FrameworkElement Placeholder(string emoji, string title, string subtitle)
        {
            var panel = new StackPanel { HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center };
            panel.Children.Add(new TextBlock { Text = emoji, FontSize = 96, HorizontalAlignment = HorizontalAlignment.Center });
            panel.Children.Add(new TextBlock { Text = title, FontSize = 40, FontWeight = FontWeights.Bold, Foreground = new SolidColorBrush(Color.FromRgb(0x3B, 0x2A, 0x5A)), HorizontalAlignment = HorizontalAlignment.Center, Margin = new Thickness(0, 8, 0, 4) });
            panel.Children.Add(new TextBlock { Text = subtitle, FontSize = 20, Foreground = new SolidColorBrush(Color.FromRgb(0x6B, 0x5B, 0x8A)), HorizontalAlignment = HorizontalAlignment.Center });
            return new Grid { Children = { panel } };
        }

        private void OnLoaded(object sender, RoutedEventArgs e)
        {
            _settings = Settings.Load();

            _dwell = new DwellController(RootGrid, GazeIndicator, GazeProgress, GazeDot);

            // Source DIRECTE (Tobii Pro SDK) : prioritaire si un tracker est visible.
            _pro.Gaze += p => _dwell.PushGaze(p);
            // Présence : via le flux de regard s'il émet (plein débit), ET via le
            // flux « guide » (position des yeux) — sur la I-13 le flux de regard
            // est verrouillé par licence, seul le guide fournit la présence.
            _pro.Presence += v => _dwell.PushEye(v);
            _pro.Eyes += s => _dwell.PushEye(s.AnyValid);
            _pro.Connected += name => Dispatcher.Invoke(() =>
            {
                _srcName = "Tobii direct";
                GazeStatus.Text = $"👁  Tobii direct : {name}";
                // Une seule source de vérité : on coupe l'ancien SDK pour éviter
                // deux flux superposés (le suivi du curseur est ignoré de toute
                // façon tant que le flux direct est frais).
                try { _gaze.Dispose(); } catch { }
            });
            _pro.Start();

            // Source SDK grand public (Tobii Experience), puis repli curseur.
            _gaze.Gaze += p => _dwell.PushGaze(p);
            _gaze.Eyes += s => _dwell.PushEye(s.AnyValid); // sait quand le regard est perdu
            _gaze.Start();
            GazeStatus.Text = "👁  Regard actif";
            _dwell.Clicked += p => Dispatcher.Invoke(() => _clicks++);

            // Diagnostic en direct : source active + « points valides/reçus » du
            // flux direct + compteur de clics. Rafraîchi toutes les 700 ms.
            var statusTimer = new System.Windows.Threading.DispatcherTimer
            { Interval = TimeSpan.FromMilliseconds(700) };
            statusTimer.Tick += (s2, e2) =>
            {
                if (AdminCheck?.IsChecked == true || GazeGate.IsPaused) return; // texte « pause » prioritaire
                string src = !_pro.IsAvailable ? _srcName
                    : _pro.HasGaze ? "Tobii direct"
                    : "curseur + yeux Tobii"; // regard verrouillé : pointage TD Control, présence Tobii
                GazeStatus.Text = _pro.IsAvailable
                    ? $"👁  {src} · {_pro.Stats} · Clics : {_clicks}"
                    : $"👁  {src} · Clics : {_clicks}";
            };
            statusTimer.Start();

            // Pause automatique du regard quand une fenêtre d'édition est ouverte.
            GazeGate.PauseChanged = paused => Dispatcher.Invoke(ApplyGazeMode);

            // Étoiles de récompense.
            RewardStore.Load();
            StarsText.Text = $"⭐ {RewardStore.Today}";
            RewardStore.Changed += () => Dispatcher.Invoke(() => StarsText.Text = $"⭐ {RewardStore.Today}");

            // Voix : liste des voix installées + réglages sauvegardés.
            Speech.VoiceName = _settings.VoiceName;
            Speech.Pitch = _settings.VoicePitch;
            foreach (var v in Speech.Voices()) VoiceCombo.Items.Add(v);
            if (!string.IsNullOrEmpty(_settings.VoiceName) && VoiceCombo.Items.Contains(_settings.VoiceName))
                VoiceCombo.SelectedItem = _settings.VoiceName;
            PitchSlider.Value = _settings.VoicePitch;

            // Voix naturelle Azure.
            AzureTts.Key = _settings.AzureKey;
            AzureTts.Region = _settings.AzureRegion;
            AzureTts.Voice = _settings.AzureVoice;
            AzureKeyBox.Text = _settings.AzureKey;
            AzureRegionBox.Text = _settings.AzureRegion;
            foreach (var (label, name) in AzureTts.Voices)
                AzureVoiceCombo.Items.Add(new ComboBoxItem { Content = label, Tag = name });
            foreach (ComboBoxItem it in AzureVoiceCombo.Items)
                if ((string)it.Tag == _settings.AzureVoice) { AzureVoiceCombo.SelectedItem = it; break; }

            // Sauvegarde en ligne (Supabase).
            CloudSync.Url = _settings.SupabaseUrl;
            CloudSync.Key = _settings.SupabaseKey;
            SupabaseUrlBox.Text = _settings.SupabaseUrl;
            SupabaseKeyBox.Text = _settings.SupabaseKey;

            // Applique les réglages sauvegardés au contrôleur.
            _dwell.DwellTime = _settings.DwellTime;
            ApplySmoothing(_settings.Smoothing);
            _dwell.SetIndicatorSize(_settings.CircleSize);

            // Reporte ces réglages dans les curseurs du panneau ⚙.
            DwellSlider.Value = _settings.DwellTime;
            SmoothSlider.Value = _settings.Smoothing * 100;
            CircleSlider.Value = _settings.CircleSize;

            // Le pilotage au regard est actif par défaut. Sans SDK (TD I-13), on
            // suit le curseur déplacé par le regard, ce qui rend l'appli utilisable
            // d'emblée sans devoir ouvrir les réglages.
            GazeModeCheck.IsChecked = true;
            ApplyGazeMode();
        }

        private void ApplySmoothing(double s)
        {
            // s ∈ [0,1] : 0 = réactif (peu de lissage), 1 = très stable (fort lissage
            // + grande zone morte pour compenser les mouvements involontaires).
            double minCutoff = 3.5 - s * 3.0; // 3.5 (réactif) → 0.5 (très lissé)
            double beta = 0.015 + (1 - s) * 0.04;
            double deadZone = 8 + s * 28;     // 8 → 36 px : micro-bougés ignorés
            _dwell.SetStability(minCutoff, beta, deadZone);
        }

        private void Settings_Click(object sender, RoutedEventArgs e)
        {
            SettingsPopup.IsOpen = !SettingsPopup.IsOpen;
        }

        private void EyeTrack_Click(object sender, RoutedEventArgs e)
        {
            SettingsPopup.IsOpen = false;
            // La fenêtre des yeux utilise la meilleure source disponible.
            new EyeTrackWindow(_pro.IsAvailable ? (IEyeStream)_pro : _gaze) { Owner = this }.ShowDialog();
        }

        private void GazeMode_Changed(object sender, RoutedEventArgs e) => ApplyGazeMode();

        private void ApplyGazeMode()
        {
            if (_dwell == null) return;
            // Le regard est actif si : la case est cochée, le mode admin est
            // désactivé, et aucune fenêtre d'édition (parent) n'est ouverte.
            bool admin = AdminCheck != null && AdminCheck.IsChecked == true;
            AdminMode.Set(admin); // affiche/masque les outils parent partout
            _dwell.Enabled = GazeModeCheck.IsChecked == true && !admin && !GazeGate.IsPaused;
            if (admin || GazeGate.IsPaused)
                GazeStatus.Text = "⏸  Regard en pause";
        }

        private void FamilyManager_Click(object sender, RoutedEventArgs e)
        {
            SettingsPopup.IsOpen = false;
            new FamilyManagerWindow { Owner = this }.ShowDialog();
        }

        private void OpenContent_Click(object sender, RoutedEventArgs e)
        {
            UserContent.EnsureFolders();
            try { System.Diagnostics.Process.Start("explorer.exe", UserContent.RootDir); } catch { }
        }

        private void ExportContent_Click(object sender, RoutedEventArgs e)
        {
            GazeGate.Push();
            try
            {
                var dlg = new Microsoft.Win32.SaveFileDialog
                {
                    Title = "Exporter le contenu",
                    Filter = "Archive|*.zip",
                    FileName = "MesPremiersJeux-contenu-" + DateTime.Now.ToString("yyyy-MM-dd") + ".zip",
                };
                if (dlg.ShowDialog(this) != true) return;
                MessageBox.Show(this,
                    UserContent.ExportZip(dlg.FileName)
                        ? "Contenu exporté ! Copie ce fichier sur l'autre PC puis « Importer »."
                        : "Impossible d'exporter le contenu.",
                    "Exporter");
            }
            finally { GazeGate.Pop(); }
        }

        private void ImportContent_Click(object sender, RoutedEventArgs e)
        {
            GazeGate.Push();
            try
            {
                var dlg = new Microsoft.Win32.OpenFileDialog
                {
                    Title = "Importer du contenu",
                    Filter = "Archive|*.zip",
                };
                if (dlg.ShowDialog(this) != true) return;
                MessageBox.Show(this,
                    UserContent.ImportZip(dlg.FileName)
                        ? "Contenu importé ! Livres, coloriages et photos sont à jour."
                        : "Impossible d'importer ce fichier.",
                    "Importer");
            }
            finally { GazeGate.Pop(); }
        }

        private void DwellSlider_Changed(object sender, RoutedPropertyChangedEventArgs<double> e)
        {
            if (_dwell == null) return;
            _dwell.DwellTime = (int)e.NewValue;
            if (DwellValue != null) DwellValue.Text = $"{e.NewValue / 1000.0:0.0} s";
            if (_settings != null) { _settings.DwellTime = (int)e.NewValue; _settings.Save(); }
        }

        private void SmoothSlider_Changed(object sender, RoutedPropertyChangedEventArgs<double> e)
        {
            if (_dwell == null) return;
            double s = e.NewValue / 100.0;
            ApplySmoothing(s);
            if (_settings != null) { _settings.Smoothing = s; _settings.Save(); }
        }

        private void CircleSlider_Changed(object sender, RoutedPropertyChangedEventArgs<double> e)
        {
            if (_dwell == null) return;
            _dwell.SetIndicatorSize(e.NewValue);
            if (_settings != null) { _settings.CircleSize = e.NewValue; _settings.Save(); }
        }

        private void Voice_Changed(object sender, System.Windows.Controls.SelectionChangedEventArgs e)
        {
            if (_settings == null || VoiceCombo.SelectedItem == null) return;
            Speech.VoiceName = VoiceCombo.SelectedItem.ToString();
            _settings.VoiceName = Speech.VoiceName;
            _settings.Save();
        }

        private void Pitch_Changed(object sender, RoutedPropertyChangedEventArgs<double> e)
        {
            if (_settings == null) return;
            Speech.Pitch = e.NewValue;
            _settings.VoicePitch = e.NewValue;
            _settings.Save();
        }

        private void VoiceTest_Click(object sender, RoutedEventArgs e)
        {
            Speech.Say("Bonjour ! On joue ensemble ?");
        }

        private void Supabase_Changed(object sender, RoutedEventArgs e)
        {
            if (_settings == null || SupabaseUrlBox == null) return;
            _settings.SupabaseUrl = SupabaseUrlBox.Text.Trim();
            _settings.SupabaseKey = SupabaseKeyBox.Text.Trim();
            _settings.Save();
            CloudSync.Url = _settings.SupabaseUrl;
            CloudSync.Key = _settings.SupabaseKey;
        }

        private async void CloudUp_Click(object sender, RoutedEventArgs e)
        {
            if (!CloudSync.Enabled)
            {
                MessageBox.Show(this, "Renseigne d'abord l'URL et la clé Supabase.", "Sauvegarde en ligne");
                return;
            }
            CloudUpBtn.IsEnabled = CloudDownBtn.IsEnabled = false;
            CloudUpBtn.Content = "⏳ Envoi…";
            var err = await CloudSync.UploadAsync();
            CloudUpBtn.Content = "☁️⬆ Sauvegarder";
            CloudUpBtn.IsEnabled = CloudDownBtn.IsEnabled = true;
            MessageBox.Show(this, err == null
                ? "Contenu sauvegardé dans le nuage ! Sur l'autre PC : « Récupérer »."
                : "Échec de la sauvegarde : " + err, "Sauvegarde en ligne");
        }

        private async void CloudDown_Click(object sender, RoutedEventArgs e)
        {
            if (!CloudSync.Enabled)
            {
                MessageBox.Show(this, "Renseigne d'abord l'URL et la clé Supabase.", "Sauvegarde en ligne");
                return;
            }
            CloudUpBtn.IsEnabled = CloudDownBtn.IsEnabled = false;
            CloudDownBtn.Content = "⏳ Réception…";
            var err = await CloudSync.DownloadAsync();
            CloudDownBtn.Content = "☁️⬇ Récupérer";
            CloudUpBtn.IsEnabled = CloudDownBtn.IsEnabled = true;
            MessageBox.Show(this, err == null
                ? "Contenu récupéré ! Livres, coloriages et photos sont à jour."
                : "Échec de la récupération : " + err, "Sauvegarde en ligne");
        }

        private void Azure_Changed(object sender, RoutedEventArgs e)
        {
            if (_settings == null || AzureKeyBox == null) return;
            _settings.AzureKey = AzureKeyBox.Text.Trim();
            _settings.AzureRegion = AzureRegionBox.Text.Trim();
            if (AzureVoiceCombo.SelectedItem is ComboBoxItem it)
                _settings.AzureVoice = (string)it.Tag;
            _settings.Save();

            AzureTts.Key = _settings.AzureKey;
            AzureTts.Region = _settings.AzureRegion;
            AzureTts.Voice = _settings.AzureVoice;
        }

        private void Tab_Click(object sender, RoutedEventArgs e)
        {
            if (sender is FrameworkElement fe && fe.Tag is string id) Select(id);
        }

        private void Select(string id)
        {
            Chrome.Immersive = false; // changer d'onglet réaffiche toujours la barre
            foreach (var kv in _views) kv.Value.Visibility = kv.Key == id ? Visibility.Visible : Visibility.Collapsed;
        }

        private void Fullscreen_Click(object sender, RoutedEventArgs e)
        {
            SettingsPopup.IsOpen = false;
            ToggleFullscreen();
        }

        private void Minimize_Click(object sender, RoutedEventArgs e)
        {
            SettingsPopup.IsOpen = false;
            WindowState = WindowState.Minimized;
        }

        private void Close_Click(object sender, RoutedEventArgs e) => Close();

        // Plein écran « kiosque » : on dimensionne la fenêtre à l'écran entier et on
        // la met au premier plan (Topmost) pour passer PAR-DESSUS la barre des tâches
        // Windows, ce qu'un simple « Maximisé » ne fait pas toujours (surtout I-13).
        private void ToggleFullscreen()
        {
            if (!_isFullscreen)
            {
                _prevStyle = WindowStyle;
                _prevResize = ResizeMode;
                _prevState = WindowState;
                _prevTopmost = Topmost;
                _prevRect = new Rect(Left, Top, ActualWidth, ActualHeight);

                WindowStyle = WindowStyle.None;
                ResizeMode = ResizeMode.NoResize;
                WindowState = WindowState.Normal; // repart de Normal pour poser nos dimensions
                Topmost = true;
                Left = 0;
                Top = 0;
                Width = SystemParameters.PrimaryScreenWidth;
                Height = SystemParameters.PrimaryScreenHeight;
                _isFullscreen = true;
            }
            else
            {
                WindowStyle = _prevStyle;
                ResizeMode = _prevResize;
                Topmost = _prevTopmost;
                if (_prevState == WindowState.Normal)
                {
                    Left = _prevRect.Left;
                    Top = _prevRect.Top;
                    Width = _prevRect.Width;
                    Height = _prevRect.Height;
                }
                WindowState = _prevState;
                _isFullscreen = false;
            }
        }
    }
}
