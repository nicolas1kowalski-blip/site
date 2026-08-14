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
        // Sources du regard : créées/détruites par StartGazeSources() selon le
        // PILOTE choisi dans les réglages (auto / direct / pro / curseur).
        private GazeService _gaze;
        private ProGazeSource _pro;
        private System.Windows.Threading.DispatcherTimer _fallbackWatch;
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
            Closed += (s, e) => StopGazeSources();
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

            // Sources du regard : démarrées selon le PILOTE choisi (réglages).
            StartGazeSources();
            GazeStatus.Text = "👁  Regard actif";
            _dwell.Clicked += p => Dispatcher.Invoke(() => _clicks++);

            // Diagnostic en direct : source active + « points valides/reçus » du
            // flux direct + compteur de clics. Rafraîchi toutes les 700 ms.
            var statusTimer = new System.Windows.Threading.DispatcherTimer
            { Interval = TimeSpan.FromMilliseconds(700) };
            statusTimer.Tick += (s2, e2) =>
            {
                // État détaillé des sources, visible dans le panneau de réglages.
                if (SettingsPopup.IsOpen && DriverStatus != null)
                    DriverStatus.Text =
                        "Pro : " + (_pro?.IsAvailable == true ? _pro.Stats : "—")
                        + " · Direct : " + (_gaze?.IsAvailable == true ? _gaze.Samples + " pts" : "—")
                        + "\n" + _dwell.PrecisionInfo;

                if (AdminCheck?.IsChecked == true || GazeGate.IsPaused) return; // texte « pause » prioritaire
                // La vérité vient du moteur : quelle source pilote le point, là,
                // maintenant (« Regard direct » via SDK, ou « Curseur »). Le 🧭
                // signale une tête loin de la position de calibration.
                string headHint = _dwell.HeadFarFromRef ? " · 🧭 tête décalée" : "";
                GazeStatus.Text = $"👁  {_dwell.ActiveSource}{headHint} · Clics : {_clicks}";
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
            _dwell.SetBiasFromString(_settings.BiasMap);   // correction « étoile »
            _dwell.SetQuickOffsetFromString(_settings.QuickOffset); // réglage éclair
            SyncDriverCombo(); // reflète le pilote choisi dans la liste

            // Bilan de session (carte de chaleur + compteurs).
            SessionLog.Init();
            _dwell.Clicked += p => SessionLog.Clicks++;

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

        // ------------------------------------------------------------------
        // GESTION DES SOURCES DU REGARD — le « pilote » choisi dans les réglages
        // décide quel moteur possède le tracker. Compatible avec le maximum
        // d'appareils Tobii :
        //   auto    : Pro SDK seul d'abord ; s'il ne donne pas de regard en 6 s,
        //             repli sur le SDK grand public ; sinon curseur (TD Control).
        //   direct  : SDK grand public (Tobii Experience) uniquement.
        //   pro     : Pro SDK uniquement (jamais de concurrent).
        //   curseur : le point suit la souris (TD Control, Computer Control,
        //             Windows Eye Control… — toute commande oculaire) ; le Pro
        //             SDK reste ouvert pour la présence/position des yeux.
        // La bascule se fait À CHAUD, sans redémarrer l'application.
        // ------------------------------------------------------------------

        private GazeService NewConsumer()
        {
            var g = new GazeService();
            g.Gaze += p => _dwell.PushGaze(p);
            g.Eyes += s => { _dwell.PushEye(s.AnyValid); _dwell.PushHead(s); }; // présence + tête
            return g;
        }

        private ProGazeSource NewPro()
        {
            var p = new ProGazeSource();
            p.Gaze += q => _dwell.PushGaze(q);
            p.Presence += v => _dwell.PushEye(v);
            p.Eyes += s => { _dwell.PushEye(s.AnyValid); _dwell.PushHead(s); };
            p.Connected += name => Dispatcher.Invoke(() =>
            {
                _srcName = "Tobii";
                GazeStatus.Text = $"👁  Tobii : {name}";
                Lib.Log.Write("app", $"Tracker connecté (Pro SDK) : {name}");
            });
            return p;
        }

        private void StartGazeSources()
        {
            StopGazeSources();
            string driver = _settings?.GazeDriver;
            if (string.IsNullOrWhiteSpace(driver)) driver = "auto";
            _dwell.PreferCursor = driver == "curseur";
            Lib.Log.Write("app", "Pilote du regard : " + driver);

            try
            {
                switch (driver)
                {
                    case "direct":
                        _gaze = NewConsumer();
                        _gaze.Start();
                        break;

                    case "pro":
                        _pro = NewPro();
                        _pro.Start();
                        break;

                    case "curseur":
                        // Le pointage vient du curseur ; le Pro SDK (flux « guide »)
                        // fournit quand même présence + position des yeux.
                        _pro = NewPro();
                        _pro.Start();
                        break;

                    default: // auto
                        _pro = NewPro();
                        _pro.Start();
                        StartConsumerFallbackWatch();
                        break;
                }
            }
            catch (Exception ex)
            {
                Lib.Log.Write("app", "Démarrage des sources : " + ex.Message);
            }
        }

        private void StopGazeSources()
        {
            _fallbackWatch?.Stop();
            _fallbackWatch = null;
            try { _gaze?.Dispose(); } catch { }
            try { _pro?.Dispose(); } catch { }
            _gaze = null;
            _pro = null;
        }

        /// <summary>
        /// Mode AUTO : on laisse au Pro SDK sa chance d'ouvrir SEUL le flux de
        /// regard direct. S'il n'a rien donné après ~6 s, on réveille le SDK
        /// grand public en repli (comportement historique de la I-13).
        /// </summary>
        private void StartConsumerFallbackWatch()
        {
            var t0 = DateTime.UtcNow;
            var w = new System.Windows.Threading.DispatcherTimer
            { Interval = TimeSpan.FromMilliseconds(600) };
            _fallbackWatch = w;
            w.Tick += (s, e) =>
            {
                if (!ReferenceEquals(_fallbackWatch, w)) { w.Stop(); return; } // pilote changé

                if (_pro?.HasGaze == true)
                {
                    w.Stop();
                    _fallbackWatch = null;
                    Lib.Log.Write("app", $"Regard direct du Pro SDK confirmé ({_pro.Stats}) — SDK grand public NON démarré (pas de concurrence)");
                    return;
                }

                if ((DateTime.UtcNow - t0).TotalSeconds >= 6.0)
                {
                    w.Stop();
                    _fallbackWatch = null;
                    Lib.Log.Write("app", $"Pas de regard direct du Pro SDK après 6 s ({_pro?.Stats ?? "—"}) — démarrage du SDK grand public (repli)");
                    try
                    {
                        _gaze = NewConsumer();
                        _gaze.Start();
                    }
                    catch (Exception ex) { Lib.Log.Write("app", "Repli grand public : " + ex.Message); }
                }
            };
            w.Start();
        }

        private void SyncDriverCombo()
        {
            foreach (var item in DriverCombo.Items)
                if (item is ComboBoxItem it && (string)it.Tag == _settings.GazeDriver)
                { DriverCombo.SelectedItem = it; return; }
            DriverCombo.SelectedIndex = 0; // auto
        }

        private void Driver_Changed(object sender, SelectionChangedEventArgs e)
        {
            if (_dwell == null || _settings == null) return; // encore en chargement
            var tag = (DriverCombo.SelectedItem as ComboBoxItem)?.Tag as string;
            if (string.IsNullOrEmpty(tag) || tag == _settings.GazeDriver) return;
            _settings.GazeDriver = tag;
            _settings.PreferCursor = tag == "curseur"; // compat anciennes versions
            _settings.Save();
            Lib.Log.Write("app", "Pilote du regard changé par le parent : " + tag);
            StartGazeSources();
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

        private void OpenLog_Click(object sender, RoutedEventArgs e)
        {
            SettingsPopup.IsOpen = false;
            Lib.Log.Write("app", "Journal ouvert par l'utilisateur");
            Lib.Log.Open();
        }

        // « Suis l'étoile » : mesure le décalage du regard et applique la correction.
        private void Calibrate_Click(object sender, RoutedEventArgs e)
        {
            SettingsPopup.IsOpen = false;
            var win = new CalibrationWindow { Owner = this };
            if (win.ShowDialog() == true && win.Result.Count > 0)
            {
                _dwell.SetBias(win.Result, win.HeadRef); // remet aussi l'éclair à zéro
                _settings.BiasMap = DwellController.BiasToString(win.Result, win.HeadRef);
                _settings.QuickOffset = "";
                _settings.Save();
            }
        }

        private void ClearBias_Click(object sender, RoutedEventArgs e)
        {
            _dwell.SetBias(null); // efface étoile + dérive + tête + éclair
            _settings.BiasMap = "";
            _settings.QuickOffset = "";
            _settings.Save();
            Speech.Say("Correction annulée.");
        }

        private void Session_Click(object sender, RoutedEventArgs e)
        {
            SettingsPopup.IsOpen = false;
            new SessionWindow { Owner = this }.ShowDialog();
        }

        // « Réglage éclair » : une étoile, 3 secondes, recale tout le regard.
        private void QuickFix_Click(object sender, RoutedEventArgs e)
        {
            SettingsPopup.IsOpen = false;
            var win = new QuickFixWindow { Owner = this };
            if (win.ShowDialog() == true && win.Measured)
            {
                _dwell.NudgeQuickOffset(win.Offset);
                _settings.QuickOffset = _dwell.QuickOffsetToString();
                _settings.Save();
            }
        }

        private void EyeTrack_Click(object sender, RoutedEventArgs e)
        {
            SettingsPopup.IsOpen = false;
            // La fenêtre des yeux utilise la meilleure source disponible, et affiche
            // la fiche technique du tracker (diagnostic licence/capacités).
            IEyeStream src = _pro?.IsAvailable == true ? (IEyeStream)_pro : _gaze;
            if (src == null)
            {
                MessageBox.Show(this,
                    "Aucune source de position des yeux n'est active avec ce pilote.\n" +
                    "Choisis « Auto », « Regard direct » ou « Pro SDK » dans les réglages.",
                    "Position des yeux");
                return;
            }
            new EyeTrackWindow(src,
                _pro?.IsAvailable == true ? _pro.Diagnostic + "\nFlux de regard : " + _pro.Stats : null)
            { Owner = this }.ShowDialog();
        }

        private void GazeMode_Changed(object sender, RoutedEventArgs e) => ApplyGazeMode();

        private void ApplyGazeMode()
        {
            if (_dwell == null) return;
            // Le regard est actif si : la case est cochée, le mode admin est
            // désactivé, et aucune fenêtre d'édition (parent) n'est ouverte.
            bool admin = AdminCheck != null && AdminCheck.IsChecked == true;
            AdminMode.Set(admin); // affiche/masque les outils parent partout
            bool enabled = GazeModeCheck.IsChecked == true && !admin && !GazeGate.IsPaused;
            if (_dwell.Enabled != enabled)
                Lib.Log.Write("app", $"Pilotage au regard : {(enabled ? "ACTIF" : "en pause")} (case={GazeModeCheck.IsChecked == true}, admin={admin}, fenêtreParent={GazeGate.IsPaused})");
            _dwell.Enabled = enabled;
            _dwell.TargetsOnly = GazeGate.IsTargetsOnly; // jeux d'exploration
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
