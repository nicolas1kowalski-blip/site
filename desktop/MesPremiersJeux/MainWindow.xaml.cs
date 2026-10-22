using System;
using System.Collections.Generic;
using System.Linq;
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
        private StreamEngineSource _stream; // moteur bas niveau (comme Grid 3)
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
            Closed += (s, e) =>
            {
                try { System.IO.File.Delete(CrashFlag); } catch { } // fermeture normale : pas un plantage
                StopGazeSources();
                Usage.AtExit(_settings);
                CloudSyncAtExit();
            };
        }

        private void BuildViews()
        {
            var coloring = new ColoringView();
            coloring.ToggleFullscreenRequested += (s, e) => ToggleFullscreen();

            // 🏠 L'accueil : bonjour, la date, l'ami du jour… et les grands boutons.
            var accueil = new AccueilView();
            _accueil = accueil;
            accueil.Navigate += id =>
            {
                if (id == "parcours") Parcours_Click(this, null);
                else Select(id);
            };
            accueil.ShopRequested += () => Shop_Click(this, null);
            _views["accueil"] = accueil;
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
            Select("accueil");

            // La boutique de récompenses (surcouche plein écran).
            _shop = new RewardShopView();
            _shop.CloseRequested += () => ShopHost.Visibility = Visibility.Collapsed;
            _shop.MusicRequested += () =>
            {
                ShopHost.Visibility = Visibility.Collapsed;
                Select("music");
            };
            ShopHost.Children.Add(_shop);

            // 📒 Le carnet de progrès (ouvert depuis l'accueil, carte « Mes étoiles »).
            _book = new ProgressBookView();
            _book.CloseRequested += () => BookHost.Visibility = Visibility.Collapsed;
            _book.ShopRequested += () => { BookHost.Visibility = Visibility.Collapsed; Shop_Click(this, null); };
            BookHost.Children.Add(_book);

            // 🙋 Je choisis (ouvert par le parent depuis les réglages).
            _choice = new ChoiceView();
            _choice.CloseRequested += () => { ChoiceHost.Visibility = Visibility.Collapsed; _choice.MarkClosed(); };
            ChoiceHost.Children.Add(_choice);
            accueil.BookRequested += () => { BookHost.Visibility = Visibility.Visible; _book.Open(); };

            // Le parcours du jour (séance rituelle en pictogrammes).
            _parcours = new ParcoursView { Visibility = Visibility.Collapsed };
            _parcours.ShopRequested += () => { ShopHost.Visibility = Visibility.Visible; _shop.Open(); };
            _parcours.ExitRequested += () => Select("games");
            _views["parcours"] = _parcours;
            ContentHost.Children.Add(_parcours);

            // 💬 La grille de communication + son bouton « Parler », posés
            // au-dessus de TOUT (jeux en plein écran, boutique) sauf le regard.
            _comm = new CommBoard { Visibility = Visibility.Collapsed };
            _comm.CloseRequested += CloseComm;
            _commBtn = CommBoard.MakeOpenButton();
            _commBtn.Click += (s, e) => OpenComm();
            _yesNo = CommBoard.MakeYesNoBar();
            int gi = RootGrid.Children.IndexOf(GazeLayer);
            RootGrid.Children.Insert(gi, _yesNo);
            RootGrid.Children.Insert(gi + 1, _commBtn);
            RootGrid.Children.Insert(gi + 2, _comm);
        }

        private CommBoard _comm;
        private Button _commBtn;
        private FrameworkElement _yesNo;

        private void YesNo_Changed(object sender, RoutedEventArgs e)
        {
            if (_settings == null) return;
            _settings.YesNoButtons = YesNoCheck.IsChecked == true;
            _settings.Save();
            if (_yesNo != null && !CommBoard.IsOpen)
                _yesNo.Visibility = _settings.YesNoButtons ? Visibility.Visible : Visibility.Collapsed;
        }

        private void OpenComm()
        {
            Speech.Stop();
            Speech.Hold = true;              // les jeux se taisent, la grille parle
            GazeTargets.ModalRoot = _comm;   // le regard ne vise que la grille
            _commBtn.Visibility = Visibility.Collapsed;
            _yesNo.Visibility = Visibility.Collapsed;
            _comm.Visibility = Visibility.Visible;
            _comm.Open();
        }

        private void CloseComm()
        {
            _comm.Visibility = Visibility.Collapsed;
            _comm.MarkClosed();
            GazeTargets.ModalRoot = null;
            Speech.Hold = false;
            _commBtn.Visibility = _settings == null || _settings.CommButton ? Visibility.Visible : Visibility.Collapsed;
            _yesNo.Visibility = _settings == null || _settings.YesNoButtons ? Visibility.Visible : Visibility.Collapsed;
            Speech.Say("On reprend !");
        }

        private void CommBtn_Changed(object sender, RoutedEventArgs e)
        {
            if (_settings == null) return;
            _settings.CommButton = CommBtnCheck.IsChecked == true;
            _settings.Save();
            if (_commBtn != null && !CommBoard.IsOpen)
                _commBtn.Visibility = _settings.CommButton ? Visibility.Visible : Visibility.Collapsed;
        }

        private void AutoDwell_Changed(object sender, RoutedEventArgs e)
        {
            if (_settings == null) return;
            _settings.AutoDwell = AutoDwellCheck.IsChecked == true;
            _settings.Save();
            GazeStats.AutoDwell = _settings.AutoDwell;
        }

        private RewardShopView _shop;
        private AccueilView _accueil;
        private ProgressBookView _book;
        private ChoiceView _choice;

        private void Choice_Click(object sender, RoutedEventArgs e)
        {
            SettingsPopup.IsOpen = false;
            ChoiceHost.Visibility = Visibility.Visible;
            _choice.Open();
        }
        private ParcoursView _parcours;

        private void Parcours_Click(object sender, RoutedEventArgs e)
        {
            Select("parcours");
            _parcours.Start();
        }

        private void Shop_Click(object sender, RoutedEventArgs e)
        {
            ShopHost.Visibility = Visibility.Visible;
            _shop.Open();
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

            // Réglages partagés entre tablettes (clé de la voix, prénom…) :
            // appliqués depuis le dossier synchronisé, puis gardés en local.
            _accueil?.RefreshName();

            // ☁ Le serveur de l'application (réglages en priorité, sinon la valeur embarquée).
            if (!string.IsNullOrWhiteSpace(_settings.SupabaseUrl)) Cloud.Url = _settings.SupabaseUrl;
            if (!string.IsNullOrWhiteSpace(_settings.SupabaseKey)) Cloud.AnonKey = _settings.SupabaseKey;

            // 🔑 LA LICENCE, avant tout le reste : sans licence valide, on s'arrête là.
            if (!Licence.IsValid(_settings))
            {
                GazeGate.Push();
                var lw = new LicenceWindow(_settings) { Owner = this };
                bool okLic = lw.ShowDialog() == true;
                GazeGate.Pop();
                if (!okLic) { Lib.Log.Write("licence", "Pas de licence : fermeture"); Close(); return; }
            }
            RefreshLicenceText();
            _ = Licence.RecheckAsync(_settings).ContinueWith(t => Dispatcher.Invoke(RefreshLicenceText));
            _ = Usage.SendDailyAsync(_settings).ContinueWith(t => { if (t.Result != null) Lib.Log.Write("usage", "Envoi : " + t.Result); });
            Updater.Cleanup();
            CheckUpdatesAtStartup();
            RefreshCloudStatus();
            CloudSyncAtStartup();

            // 👋 PREMIER DÉMARRAGE sur cette tablette : on demande le prénom de
            // l'enfant (une seule fois ; les réglages partagés peuvent déjà l'avoir).
            if (!_settings.NameAsked) Dispatcher.BeginInvoke(new Action(AskChildName), System.Windows.Threading.DispatcherPriority.ApplicationIdle);

            // L'application démarre TOUJOURS en plein écran « kiosque » : en
            // fenêtré elle est inopérable au regard. Le bouton ⛶ reste
            // disponible pour en sortir volontairement (maintenance).
            if (!_isFullscreen) ToggleFullscreen();

            // Et elle Y RESTE : si la fenêtre revient d'une réduction (ou si
            // Windows change son état), le mode kiosque est réaffirmé.
            StateChanged += (s2, e2) =>
            {
                if (!_isFullscreen || WindowState == WindowState.Minimized) return;
                WindowState = WindowState.Normal;
                Topmost = true;
                Left = 0;
                Top = 0;
                Width = SystemParameters.PrimaryScreenWidth;
                Height = SystemParameters.PrimaryScreenHeight;
            };

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
                        + " · Moteur Tobii : " + (_stream?.IsAvailable == true ? _stream.Stats : (_stream != null ? _stream.Status : "—"))
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
            try
            {
                EnglishVoiceText.Text = "🇬🇧 Anglais : " + Speech.EnglishMode() +
                    ". Pour une vraie voix anglaise sans clé Azure : Paramètres Windows → Heure et langue → Voix → Ajouter des voix → English.";
            }
            catch { }

            // Sauvegarde en ligne (Supabase).
            CloudSync.Url = _settings.SupabaseUrl;
            CloudSync.Key = _settings.SupabaseKey;
            Cloud.Url = string.IsNullOrWhiteSpace(_settings.SupabaseUrl) ? Cloud.DefaultUrl : _settings.SupabaseUrl;
            Cloud.AnonKey = string.IsNullOrWhiteSpace(_settings.SupabaseKey) ? Cloud.DefaultAnonKey : _settings.SupabaseKey;
            SupabaseUrlBox.Text = _settings.SupabaseUrl;
            SupabaseKeyBox.Text = _settings.SupabaseKey;

            // Synchronisation entre tablettes (dossier partagé type OneDrive).
            RefreshContentDirInfo();

            // Le « Bonjour ! » de papa/maman (s'il est enregistré), après que
            // tout est en place.
            var helloTimer = new System.Windows.Threading.DispatcherTimer
            { Interval = TimeSpan.FromMilliseconds(1500) };
            helloTimer.Tick += (s4, e4) => { helloTimer.Stop(); VoiceBank.Play("bonjour"); };
            helloTimer.Start();


            // Applique les réglages sauvegardés au contrôleur.
            _dwell.DwellTime = _settings.DwellTime;
            ApplySmoothing(_settings.Smoothing);
            _dwell.SetIndicatorSize(_settings.CircleSize);
            _dwell.SetBiasFromString(_settings.BiasMap);   // correction « étoile »
            _dwell.SetQuickOffsetFromString(_settings.QuickOffset); // réglage éclair
            SyncDriverCombo(); // reflète le pilote choisi dans la liste
            ChildNameBox.Text = _settings.ChildName; // prénom (« Mon prénom »)

            // 🎚 Le niveau : réglage, sauvegarde, et la voix quand elle monte.
            Level.Setting = _settings.Level ?? "auto";
            Level.Auto = _settings.AutoLevel;
            Level.Save = () => { _settings.AutoLevel = Level.Auto; _settings.Save(); };
            foreach (ComboBoxItem it in LevelCombo.Items)
                if ((string)it.Tag == Level.Setting) { LevelCombo.SelectedItem = it; break; }
            if (LevelCombo.SelectedItem == null) LevelCombo.SelectedIndex = 0;
            RefreshLevelStatus();
            foreach (ComboBoxItem it in SessionCombo.Items)
                if ((string)it.Tag == _settings.SessionMinutes.ToString()) { SessionCombo.SelectedItem = it; break; }
            if (SessionCombo.SelectedItem == null) SessionCombo.SelectedIndex = 2;
            StartSessionWatch();
            Level.Changed += (lvl, up) => Dispatcher.Invoke(() =>
            {
                RefreshLevelStatus();
                if (up)
                {
                    Speech.Say("Bravo ! Tu as grandi : tu passes au niveau suivant !");
                    ShowParentNotice("🎚 Niveau automatique : " + Level.Name(lvl) + " (elle réussit presque tout)");
                }
                else ShowParentNotice("🎚 Niveau automatique : retour à " + Level.Name(lvl) + " (trop d'erreurs ces derniers temps)");
            });

            // 👁 Mesures du regard + temps de fixation ajusté tout seul.
            GazeStats.AutoDwell = _settings.AutoDwell;
            GazeStats.GetDwell = () => _dwell.DwellTime;
            GazeStats.SetDwell = v =>
            {
                _dwell.DwellTime = v;
                _settings.DwellTime = v;
                _settings.Save();
                if (DwellSlider != null) DwellSlider.Value = v;
            };
            CommBtnCheck.IsChecked = _settings.CommButton;
            YesNoCheck.IsChecked = _settings.YesNoButtons;
            AutoDwellCheck.IsChecked = _settings.AutoDwell;
            _commBtn.Visibility = _settings.CommButton ? Visibility.Visible : Visibility.Collapsed;
            _yesNo.Visibility = _settings.YesNoButtons ? Visibility.Visible : Visibility.Collapsed;

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
            CheckStreamCrash();

            try
            {
                switch (driver)
                {
                    case "direct":
                        StartChain(Engines("consumer", FirstStream(), SecondStream(), "pro")); // secours si la tablette ne répond pas
                        break;

                    case "stream":
                        StartChain(Engines(FirstStream(), SecondStream(), "pro"));
                        break;

                    case "streamA": // le moteur fourni avec l'application, seul
                        StartChain(Engines("stream", "pro"));
                        break;

                    case "pro":
                        StartChain("pro");
                        break;

                    case "curseur":
                        // Le pointage vient du curseur ; le Pro SDK (flux « guide »)
                        // fournit quand même présence + position des yeux.
                        _pro = NewPro();
                        _pro.Start();
                        break;

                    default: // auto
                        StartChain(Engines("pro", "consumer", FirstStream(), SecondStream()));
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
            try { _stream?.Dispose(); } catch { }
            _gaze = null;
            _pro = null;
            _stream = null;
        }

        /// <summary>
        /// Essaie les moteurs de regard l'un après l'autre (6 s chacun) jusqu'à
        /// en trouver un qui ENVOIE vraiment des points : « consumer » (SDK grand
        /// public, I-13), « stream » (Stream Engine, comme Grid 3, ex. PCEye 5),
        /// « pro » (Pro SDK). Le Pro SDK, s'il tourne, reste allumé (il donne la
        /// présence des yeux). Si aucun ne répond : on suit le curseur.
        /// </summary>
        private void StartChain(params string[] order)
        {
            int i = 0;
            var t0 = DateTime.UtcNow;
            StartOne(order[0]);
            var w = new System.Windows.Threading.DispatcherTimer
            { Interval = TimeSpan.FromMilliseconds(600) };
            _fallbackWatch = w;
            w.Tick += (s, e) =>
            {
                if (!ReferenceEquals(_fallbackWatch, w)) { w.Stop(); return; } // pilote changé
                if (HasGaze(order[i]))
                {
                    w.Stop();
                    _fallbackWatch = null;
                    Lib.Log.Write("app", "Regard direct confirmé : " + Label(order[i]) + " (" + Diag(order[i]) + ")");
                    // On retient le moteur Tobii direct qui marche : essayé en premier la prochaine fois.
                    if (order[i].StartsWith("stream") && _settings != null && _settings.StreamEngine != order[i])
                    {
                        _settings.StreamEngine = order[i];
                        _settings.Save();
                    }
                    return;
                }
                // Un flux VIVANT mais encore sans point valide (personne devant la
                // caméra ?) : on lui laisse 30 s au lieu de 6 avant de passer au suivant.
                bool alive = order[i].StartsWith("stream") && (_stream?.Events ?? 0) > 0;
                double limit = alive ? 30.0 : 6.0;
                if ((DateTime.UtcNow - t0).TotalSeconds < limit) return;

                // Un Stream Engine VIVANT (il envoie des échantillons, simplement
                // personne n'est encore vu) : on le GARDE TOUJOURS. Changer de
                // moteur Tobii en cours de route faisait FERMER l'application
                // (deux moteurs natifs dans le même programme). En attendant le
                // regard, le curseur prend le relais tout seul.
                if (alive)
                {
                    w.Stop();
                    _fallbackWatch = null;
                    Lib.Log.Write("app", "On garde " + Label(order[i]) + " : flux vivant, en attente d'un regard (" + Diag(order[i]) + ")");
                    try { Lib.Log.Write("app", "Programmes Tobii en marche : " + string.Join(", ", Lib.GazeReport.RunningTobii())); } catch { }
                    if (_stream != null && !_stream.HasGaze)
                        ShowParentNotice("👀 La caméra Tobii marche mais ne voit pas les yeux.\n" +
                                         "• Quelqu'un est-il bien en face, à 50–70 cm ?\n" +
                                         "• Grid 3, TD Control ou un calibrage Tobii est-il ouvert ? (les fermer complètement)\n" +
                                         "• Le suivi est-il en pause dans le logiciel Tobii (icône près de l'horloge) ?\n" +
                                         "• Sinon : redémarrer la tablette.");
                    return;
                }

                Lib.Log.Write("app", "Pas de regard par " + Label(order[i]) + " en " + limit + " s — " + Diag(order[i]));
                if (order[i] == "consumer") { try { _gaze?.Dispose(); } catch { } _gaze = null; }
                if (order[i].StartsWith("stream")) { try { _stream?.Dispose(); } catch { } _stream = null; }
                i++;
                t0 = DateTime.UtcNow;
                if (i >= order.Length)
                {
                    w.Stop();
                    _fallbackWatch = null;
                    NoDirectGaze();
                    return;
                }
                Lib.Log.Write("app", "Essai suivant : " + Label(order[i]));
                StartOne(order[i]);
            };
            w.Start();
        }

        // « streamT » = le Stream Engine INSTALLÉ sur la tablette (plus récent) ;
        // retiré de la liste s'il n'y en a pas.
        // Ordre des deux moteurs Tobii directs : celui qui a déjà marché d'abord,
        // sinon celui de la TABLETTE (récent, comme le logiciel Tobii installé).
        private string FirstStream() => _settings?.StreamEngine == "stream" || TabletEngine() == null ? "stream" : "streamT";
        private string SecondStream() => FirstStream() == "stream" ? "streamT" : "stream";

        private string[] Engines(params string[] keys) =>
            keys.Where(k => k != "streamT" || TabletEngine() != null).ToArray();

        private string _tabletEngine;
        private bool _tabletSearched;

        private string TabletEngine()
        {
            if (_tabletSearched) return _tabletEngine;
            _tabletSearched = true;
            try { _tabletEngine = StreamEngineSource.FindInstalled().FirstOrDefault(); }
            catch (Exception ex) { Lib.Log.Write("stream", "Recherche du moteur de la tablette : " + ex.Message); }
            Lib.Log.Write("stream", "Moteur de la tablette retenu : " + (_tabletEngine ?? "aucun (moteur de l'application seul)"));
            return _tabletEngine;
        }

        // GARDE-FOU : si l'application s'est fermée pendant le démarrage d'un
        // moteur Tobii direct, la prochaine fois on prend l'autre moteur.
        private static string CrashFlag => System.IO.Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "MesPremiersJeux", "moteur-en-cours.txt");

        private void CheckStreamCrash()
        {
            try
            {
                if (!System.IO.File.Exists(CrashFlag)) return;
                var k = System.IO.File.ReadAllText(CrashFlag).Trim();
                System.IO.File.Delete(CrashFlag);
                if (!k.StartsWith("stream") || _settings == null) return;
                _settings.StreamEngine = k == "stream" ? "streamT" : "stream";
                _settings.Save();
                Lib.Log.Write("app", "La dernière fois, l'application s'est fermée au démarrage de " + Label(k) +
                                     " : on essaie d'abord " + Label(_settings.StreamEngine));
            }
            catch { }
        }

        private void StartOne(string k)
        {
            try
            {
                if (k.StartsWith("stream"))
                {
                    try
                    {
                        System.IO.Directory.CreateDirectory(System.IO.Path.GetDirectoryName(CrashFlag));
                        System.IO.File.WriteAllText(CrashFlag, k);
                    }
                    catch { }
                    var clear = new System.Windows.Threading.DispatcherTimer { Interval = TimeSpan.FromSeconds(20) };
                    clear.Tick += (s, e) => { clear.Stop(); try { System.IO.File.Delete(CrashFlag); } catch { } };
                    clear.Start();
                }
                if (k == "consumer") { _gaze = NewConsumer(); _gaze.Start(); }
                else if (k == "streamT") { _stream = NewStream(TabletEngine()); _stream.Start(); }
                else if (k == "stream") { _stream = NewStream(); _stream.Start(); }
                else if (_pro == null) { _pro = NewPro(); _pro.Start(); }
            }
            catch (Exception ex) { Lib.Log.Write("app", "Démarrage " + Label(k) + " : " + ex.Message); }
        }

        private bool HasGaze(string k) =>
            k == "consumer" ? (_gaze?.Samples ?? 0) > 0
            : k.StartsWith("stream") ? _stream?.HasGaze == true
            : _pro?.HasGaze == true;

        private static string Label(string k) =>
            k == "consumer" ? "SDK grand public (Tobii.Interaction)"
            : k == "streamT" ? "Stream Engine de la tablette (comme Grid 3)"
            : k == "stream" ? "Stream Engine de l'application"
            : "Pro SDK (Tobii.Research)";

        private string Diag(string k)
        {
            if (k == "consumer")
            {
                long eyes = _gaze?.EyeSamples ?? 0;
                return "points " + (_gaze?.Samples ?? 0) + ", positions des yeux " + eyes +
                       ((_gaze?.Samples ?? 0) == 0
                           ? (eyes > 0 ? " — yeux vus mais pas le regard (écran non configuré dans le logiciel Tobii ?)"
                                       : " — rien du tout (moteur Tobii « Interaction » absent ou incompatible)")
                           : "");
            }
            if (k.StartsWith("stream")) return (_stream?.Status ?? "—") + ", points " + (_stream?.Stats ?? "—");
            return "points " + (_pro?.Stats ?? "—") + ", guide " + (_pro?.GuideEvents ?? 0);
        }

        private StreamEngineSource NewStream(string dllPath = null)
        {
            var st = new StreamEngineSource(dllPath);
            st.Gaze += p => _dwell.PushGaze(p);
            st.Presence += v => _dwell.PushEye(v);
            return st;
        }

        // Aucun regard direct : l'application suit le curseur Windows (déplacé
        // par TD Control / Computer Control) et le dit clairement au parent.
        private void NoDirectGaze()
        {
            Lib.Log.Write("app", "Aucun moteur Tobii ne donne le regard : on suit le CURSEUR");
            ShowParentNotice("👁 Le regard direct ne répond pas sur cette tablette : l'application suit le curseur.\n" +
                             "Activez le contrôle de l'ordinateur au regard (TD Control / Computer Control) en mode « souris », " +
                             "SANS clic automatique — l'application fait elle-même la sélection. (Réglages ⚙ → pilote « Curseur »)");
        }

        private Border _notice;

        private void ShowParentNotice(string text)
        {
            var note = new Border
            {
                Background = new SolidColorBrush(Color.FromArgb(0xF0, 0x3B, 0x2A, 0x5A)),
                CornerRadius = new CornerRadius(18),
                Padding = new Thickness(20, 12, 20, 12),
                Margin = new Thickness(0, 90, 0, 0),
                MaxWidth = 900,
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Top,
                IsHitTestVisible = false,
                Child = new TextBlock { Text = text, Foreground = Brushes.White, FontSize = 18, TextWrapping = TextWrapping.Wrap },
            };
            if (_notice != null) RootGrid.Children.Remove(_notice); // un message à la fois
            _notice = note;
            int gi = RootGrid.Children.IndexOf(GazeLayer);
            RootGrid.Children.Insert(gi, note);
            var t = new System.Windows.Threading.DispatcherTimer { Interval = TimeSpan.FromSeconds(25) };
            t.Tick += (s, e) => { t.Stop(); RootGrid.Children.Remove(note); if (_notice == note) _notice = null; };
            t.Start();
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

        // 🔎 Rapport du regard : teste les DEUX moteurs Tobii l'un après l'autre
        // (~7 s chacun), note les logiciels Tobii installés, écrit le rapport
        // dans le dossier Contenu, puis relance le pilote habituel.
        private void GazeReport_Click(object sender, RoutedEventArgs e)
        {
            SettingsPopup.IsOpen = false;
            string driver = string.IsNullOrWhiteSpace(_settings?.GazeDriver) ? "auto" : _settings.GazeDriver;
            string before = _dwell.ActiveSource;
            ShowParentNotice("🔎 Test du regard (20 s) : regarde l'écran tranquillement, sans bouger…");
            StopGazeSources();
            var consumer = NewConsumer();
            try { consumer.Start(); } catch (Exception ex) { Lib.Log.Write("app", "Test grand public : " + ex.Message); }
            _gaze = consumer;

            After(7, () =>
            {
                long cg = consumer.Samples, ce = consumer.EyeSamples;
                try { consumer.Dispose(); } catch { }
                _gaze = null;
                var stream = NewStream(TabletEngine()); // le moteur de la tablette s'il existe
                try { stream.Start(); } catch (Exception ex) { Lib.Log.Write("app", "Test Stream Engine : " + ex.Message); }
                _stream = stream;

                After(7, () =>
                {
                    string sStatus = stream.Status, sStats = stream.Stats;
                    try { stream.Dispose(); } catch { }
                    _stream = null;
                    var pro = NewPro();
                    try { pro.Start(); } catch (Exception ex) { Lib.Log.Write("app", "Test Pro SDK : " + ex.Message); }
                    _pro = pro;

                    After(7, () =>
                    {
                        string path = null;
                        try
                        {
                            path = GazeReport.Write(driver, before, cg, ce, sStatus, sStats,
                                                    pro.Stats, pro.GuideEvents, pro.DeviceName, pro.Diagnostic);
                        }
                        catch (Exception ex) { Lib.Log.Write("app", "Rapport du regard : " + ex.Message); }
                        StartGazeSources(); // retour au pilote habituel
                        if (path != null)
                        {
                            try { System.Diagnostics.Process.Start("notepad.exe", "\"" + path + "\""); } catch { }
                            ShowParentNotice("🔎 Rapport écrit dans le dossier Contenu : " + System.IO.Path.GetFileName(path));
                        }
                    });
                });
            });
        }

        private static void After(double seconds, Action a)
        {
            var t = new System.Windows.Threading.DispatcherTimer { Interval = TimeSpan.FromSeconds(seconds) };
            t.Tick += (s, e) => { t.Stop(); a(); };
            t.Start();
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

        // Prénom de l'enfant : utilisé par l'activité « Mon prénom » (Éducatif).
        // ------------------------------------------------------------------
        //  🔑 Licence et 🔄 mises à jour
        // ------------------------------------------------------------------
        private void RefreshLicenceText()
        {
            try
            {
                LicenceText.Text = "Licence : " + Licence.Describe(_settings);
                VersionText.Text = "Eyzi bêta · version " + Updater.Current + (Updater.IsDevBuild ? " (compilée à la main : pas de mise à jour automatique)" : " · canal " + (Licence.IsTest(_settings) ? "TEST" : "prod"));
            }
            catch { }
        }

        private async void ReleaseTablet_Click(object sender, RoutedEventArgs e)
        {
            SettingsPopup.IsOpen = false;
            GazeGate.Push();
            try
            {
                var r = MessageBox.Show(this,
                    "Libérer cette tablette ?\n\nSa place dans la licence « " + (_settings.LicenceFamily ?? "") + " » redevient libre pour une autre tablette. " +
                    "L'application va se fermer et redemandera un numéro de licence au prochain démarrage.\n\nLes photos, voix et livres restent sur la tablette.",
                    "Changement de poste", MessageBoxButton.YesNo, MessageBoxImage.Question);
                if (r != MessageBoxResult.Yes) return;
                Usage.AtExit(_settings);
                var err = await Licence.ReleaseAsync(_settings);
                if (err != null) { MessageBox.Show(this, err, "Libérer cette tablette", MessageBoxButton.OK, MessageBoxImage.Warning); return; }
                MessageBox.Show(this, "C'est fait : la place est libre. À bientôt !", "Libérer cette tablette", MessageBoxButton.OK, MessageBoxImage.Information);
                Close();
            }
            finally { GazeGate.Pop(); }
        }

        private void Licence_Click(object sender, RoutedEventArgs e)
        {
            SettingsPopup.IsOpen = false;
            GazeGate.Push();
            var lw = new LicenceWindow(_settings) { Owner = this };
            lw.ShowDialog();
            GazeGate.Pop();
            RefreshLicenceText();
        }

        private async void CheckUpdate_Click(object sender, RoutedEventArgs e)
        {
            SettingsPopup.IsOpen = false;
            if (Updater.IsDevBuild)
            {
                MessageBox.Show(this, "Cette version a été compilée à la main (Visual Studio) : les mises à jour automatiques ne s'appliquent qu'aux versions installées avec l'installeur.", "Mises à jour");
                return;
            }
            ShowParentNotice("🔄 Recherche d'une mise à jour…");
            Updater.Info info = null;
            try { info = await Updater.CheckAsync(Licence.IsTest(_settings)); }
            catch (Exception ex) { MessageBox.Show(this, "Impossible de vérifier : " + ex.Message, "Mises à jour"); return; }
            if (info == null || !info.IsNewer)
            {
                MessageBox.Show(this, "Tu as déjà la dernière version (" + Updater.Current + ").", "Mises à jour");
                return;
            }
            await OfferUpdate(info);
        }

        private async void CheckUpdatesAtStartup()
        {
            if (Updater.IsDevBuild) return;
            try
            {
                await System.Threading.Tasks.Task.Delay(4000);
                var info = await Updater.CheckAsync(Licence.IsTest(_settings));
                if (info == null || !info.IsNewer) return;
                Lib.Log.Write("maj", "Version disponible : " + info.Version + (info.Prerelease ? " (test)" : " (prod)"));
                await OfferUpdate(info);
            }
            catch (Exception ex) { Lib.Log.Write("maj", "Vérification au démarrage : " + ex.Message); }
        }

        private async System.Threading.Tasks.Task OfferUpdate(Updater.Info info)
        {
            GazeGate.Push();
            var r = MessageBox.Show(this,
                "Nouvelle version disponible : " + info.Version + (info.Prerelease ? " (test)" : "") + "\n" +
                "Tu as la " + Updater.Current + ".\n\nL'installer maintenant ? L'application se ferme, s'installe toute seule et se relance (moins d'une minute).",
                "Mise à jour", MessageBoxButton.YesNo, MessageBoxImage.Question);
            GazeGate.Pop();
            _settings.LastUpdateSeen = info.Version.ToString();
            _settings.Save();
            if (r != MessageBoxResult.Yes) return;
            ShowParentNotice("🔄 Mise à jour vers " + info.Version + " : téléchargement…");
            var err = await Updater.InstallAsync(info, s => ShowParentNotice("🔄 " + s));
            if (err != null) MessageBox.Show(this, err, "Mise à jour");
        }

        private void Rollback_Click(object sender, RoutedEventArgs e)
        {
            SettingsPopup.IsOpen = false;
            var prev = Updater.PreviousSetup();
            if (prev == null) { MessageBox.Show(this, "Aucune version précédente n'est disponible sur cette tablette.", "Version précédente"); return; }
            GazeGate.Push();
            var r = MessageBox.Show(this, "Revenir à la version précédente ?\n" + System.IO.Path.GetFileName(prev) + "\n\nL'application se ferme, se réinstalle et se relance.", "Version précédente", MessageBoxButton.YesNo, MessageBoxImage.Question);
            GazeGate.Pop();
            if (r != MessageBoxResult.Yes) return;
            var err = Updater.Rollback();
            if (err != null) MessageBox.Show(this, err, "Version précédente");
        }

        private void Level_Changed(object sender, SelectionChangedEventArgs e)
        {
            if (_settings == null) return;
            var tag = (LevelCombo.SelectedItem as ComboBoxItem)?.Tag as string;
            if (string.IsNullOrEmpty(tag) || tag == _settings.Level) return;
            _settings.Level = tag;
            Level.Setting = tag;
            _settings.Save();
            RefreshLevelStatus();
            Lib.Log.Write("niveau", "Réglé par le parent : " + tag + " → " + Level.Name(Level.Current));
        }

        private void Session_Changed(object sender, SelectionChangedEventArgs e)
        {
            if (_settings == null) return;
            var tag = (SessionCombo.SelectedItem as ComboBoxItem)?.Tag as string;
            if (tag == null || !int.TryParse(tag, out var m)) return;
            _settings.SessionMinutes = m;
            _settings.Save();
            _playedSeconds = 0;
        }

        // ------------------------------------------------------------------
        //  ⏱ LES SÉANCES : au bout de N minutes de jeu, la voix propose une
        //  pause — deux gros choix : « Encore un peu » ou « Une pause » (la
        //  musique, calme). Le temps ne compte que pendant les jeux.
        // ------------------------------------------------------------------
        private double _playedSeconds;
        private bool _pauseShown;

        private void StartSessionWatch()
        {
            var t = new System.Windows.Threading.DispatcherTimer { Interval = TimeSpan.FromSeconds(5) };
            t.Tick += (s, e) =>
            {
                int limit = _settings?.SessionMinutes ?? 0;
                if (limit <= 0 || _pauseShown || CommBoard.IsOpen) return;
                bool playing = _views.Any(kv => kv.Value.IsVisible && (kv.Key == "games" || kv.Key == "edu" || kv.Key == "parcours" || kv.Key == "stories" || kv.Key == "coloring"));
                if (!playing || !IsActive) return;
                _playedSeconds += 5;
                if (_playedSeconds >= limit * 60) ProposePause();
            };
            t.Start();
        }

        private void ProposePause()
        {
            _pauseShown = true;
            _playedSeconds = 0;
            Lib.Log.Write("seance", "Pause proposée après " + (_settings?.SessionMinutes ?? 0) + " min de jeu");
            PauseHost.Children.Clear();
            var veil = new Grid { Background = new SolidColorBrush(Color.FromArgb(0xD8, 0x2A, 0x1E, 0x5A)) };
            var panel = new StackPanel { HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center };
            panel.Children.Add(new TextBlock
            {
                Text = "Ça fait un moment qu'on joue !", FontSize = 52, FontWeight = FontWeights.ExtraBold, Foreground = Brushes.White,
                HorizontalAlignment = HorizontalAlignment.Center, Margin = new Thickness(0, 0, 0, 30),
            });
            var row = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Center };
            Button Choice(string pic, string emoji, string label, Color tint)
            {
                var content = new StackPanel { HorizontalAlignment = HorizontalAlignment.Center };
                content.Children.Add(Art.Visual(pic, emoji, 200));
                content.Children.Add(new TextBlock { Text = label, FontSize = 40, FontWeight = FontWeights.ExtraBold, Foreground = new SolidColorBrush(Color.FromRgb(0x3B, 0x2A, 0x5A)), HorizontalAlignment = HorizontalAlignment.Center, Margin = new Thickness(0, 10, 0, 0) });
                return new Button
                {
                    Style = (Style)Application.Current.Resources["AnswerButton"], Width = 420, Height = 360, Margin = new Thickness(30),
                    Background = new SolidColorBrush(tint), Content = new Viewbox { Child = content, Margin = new Thickness(20) },
                };
            }
            var more = Choice("ballon", "🎈", "Encore un peu !", Color.FromRgb(0xFF, 0xF1, 0xB8));
            more.Click += (s, e) => { EndPause(false); };
            var rest = Choice("note-musique", "🎵", "Une pause", Color.FromRgb(0xD6, 0xF0, 0xFF));
            rest.Click += (s, e) => { EndPause(true); };
            row.Children.Add(more);
            row.Children.Add(rest);
            panel.Children.Add(row);
            veil.Children.Add(panel);
            PauseHost.Children.Add(veil);
            PauseHost.Visibility = Visibility.Visible;
            GazeTargets.ModalRoot = PauseHost;
            Speech.Stop();
            Speech.Say("Ça fait un moment qu'on joue ! On continue encore un peu, ou on fait une petite pause ?");
        }

        private void EndPause(bool rest)
        {
            GazeTargets.ModalRoot = null;
            PauseHost.Visibility = Visibility.Collapsed;
            PauseHost.Children.Clear();
            _pauseShown = false;
            _playedSeconds = 0;
            GazeStats.RecordComm(rest ? "pause-oui" : "pause-non");
            if (rest)
            {
                Speech.Say("On fait une pause, avec un peu de musique. Tu reviendras quand tu veux !");
                Select("music");
            }
            else Speech.Say("On continue ! Mais pas trop longtemps !");
        }

        private void RefreshLevelStatus()
        {
            try
            {
                LevelStatus.Text = "En ce moment : " + Level.Name(Level.Current) + " — " + Level.Choices + " choix, nombres jusqu'à " + Level.MaxNumber +
                    (Level.IsAuto ? ". Toutes les 20 réponses : ≥ 85 % de réussite → niveau suivant, < 40 % → niveau précédent." : ".");
            }
            catch { }
        }

        private void AskChildName()
        {
            if (_settings == null) return;
            GazeGate.Push(); // pas de clics au regard pendant qu'on tape
            try
            {
                var win = new Window
                {
                    Title = "Bienvenue !", Owner = this, Topmost = true,
                    WindowStartupLocation = WindowStartupLocation.CenterOwner, ResizeMode = ResizeMode.NoResize,
                    SizeToContent = SizeToContent.WidthAndHeight, WindowStyle = WindowStyle.ToolWindow,
                };
                var panel = new StackPanel { Margin = new Thickness(26), Width = 460 };
                panel.Children.Add(new TextBlock { Text = "👋 Bienvenue dans Eyzi !", FontSize = 22, FontWeight = FontWeights.Bold, Margin = new Thickness(0, 0, 0, 10) });
                panel.Children.Add(new TextBlock { Text = "Comment s'appelle l'enfant ? Son prénom sera dit par la voix (« Bonjour Laura ! », « Mon prénom »…). Tu pourras le changer dans les réglages.", FontSize = 15, TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 0, 0, 14) });
                var box = new TextBox { Text = _settings.ChildName ?? "", FontSize = 26, Padding = new Thickness(10, 8, 10, 8) };
                panel.Children.Add(box);
                var ok = new Button { Content = "C'est parti !", FontSize = 18, Padding = new Thickness(20, 10, 20, 10), Margin = new Thickness(0, 16, 0, 0), HorizontalAlignment = HorizontalAlignment.Right, IsDefault = true };
                ok.Click += (s, e) => win.DialogResult = true;
                panel.Children.Add(ok);
                win.Content = panel;
                win.Loaded += (s, e) => { box.Focus(); box.SelectAll(); };
                if (win.ShowDialog() == true)
                {
                    var n = (box.Text ?? "").Trim();
                    if (n.Length > 0) { _settings.ChildName = n; ChildNameBox.Text = n; }
                }
                _settings.NameAsked = true;
                _settings.Save();
                _accueil?.RefreshName();
                Lib.Log.Write("app", "Premier démarrage : prénom = " + _settings.ChildName);
                Speech.Say("Bonjour " + _settings.ChildName + " ! Bienvenue !");
            }
            catch (Exception ex) { Lib.Log.Write("app", "Demande du prénom : " + ex.Message); }
            finally { GazeGate.Pop(); }
        }

        private void ChildName_Changed(object sender, RoutedEventArgs e)
        {
            if (_settings == null) return;
            var n = (ChildNameBox.Text ?? "").Trim();
            if (n.Length == 0) { ChildNameBox.Text = _settings.ChildName; return; }
            if (n == _settings.ChildName) return;
            _settings.ChildName = n;
            _settings.Save();
            Lib.Log.Write("app", "Prénom de l'enfant : " + n);
            _accueil?.RefreshName();
        }

        // « Réglage éclair » : une étoile, 3 secondes, recale tout le regard.
        private void QuickFix_Click(object sender, RoutedEventArgs e)        {
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
            // Moteur Tobii direct (PCEye 5…) d'abord, puis Pro SDK, puis grand public.
            IEyeStream src = _stream?.IsAvailable == true ? _stream
                : _pro?.IsAvailable == true ? (IEyeStream)_pro : _gaze;
            if (src == null)
            {
                MessageBox.Show(this,
                    "Aucune source de position des yeux n'est active avec ce pilote.\n" +
                    "Choisis « Auto », « Regard direct » ou « Pro SDK » dans les réglages.",
                    "Position des yeux");
                return;
            }
            string diag =
                src == _stream ? "Moteur Tobii direct (" + _stream.Status + ")\nRegard : " + _stream.Stats +
                                 " · position des yeux : " + _stream.EyeStatus + " (" + _stream.EyeEvents + " reçues)"
                : src == _pro ? _pro.Diagnostic + "\nFlux de regard : " + _pro.Stats
                : null;
            new EyeTrackWindow(src, diag, CalibrateDevice) { Owner = this }.ShowDialog();
        }

        private void DeviceCalib_Click(object sender, RoutedEventArgs e)
        {
            SettingsPopup.IsOpen = false;
            CalibrateDevice();
        }

        // 🎯 Calibrage de la TABLETTE (logiciel Tobii / Tobii Dynavox installé),
        // sans TD Control. Pendant ce temps : pas de clics au regard chez nous,
        // et notre fenêtre quitte le premier plan pour laisser la place.
        private void CalibrateDevice()
        {
            List<Lib.TobiiTools.Tool> tools;
            try { tools = Lib.TobiiTools.FindCalibrationTools(); }
            catch (Exception ex) { Lib.Log.Write("calib", "Recherche des outils : " + ex.Message); tools = new List<Lib.TobiiTools.Tool>(); }
            if (tools.Count == 0)
            {
                MessageBox.Show(this,
                    "Aucun programme de calibrage Tobii n'a été trouvé sur cette tablette.\n\n" +
                    "Calibre depuis l'icône Tobii près de l'horloge (en bas à droite), puis reviens ici.\n" +
                    "« 🔎 Rapport du regard » liste les logiciels Tobii installés.",
                    "Calibrer la tablette");
                return;
            }
            if (tools.Count == 1 || tools[0].Rank == 0 && tools.Count(t => t.Rank == 0) == 1) { LaunchTool(tools[0]); return; }

            // Plusieurs candidats : le parent choisit (gros boutons).
            var win = new Window
            {
                Title = "Calibrer la tablette", Owner = this, SizeToContent = SizeToContent.WidthAndHeight,
                WindowStartupLocation = WindowStartupLocation.CenterOwner, ResizeMode = ResizeMode.NoResize,
                Topmost = true,
            };
            var panel = new StackPanel { Margin = new Thickness(20), MinWidth = 420 };
            panel.Children.Add(new TextBlock
            {
                Text = "Quel programme Tobii ouvrir pour calibrer ?", FontSize = 18, FontWeight = FontWeights.Bold,
                Margin = new Thickness(0, 0, 0, 12),
            });
            foreach (var t in tools)
            {
                var b = new Button
                {
                    Content = (t.Rank == 0 ? "🎯 " : "⚙ ") + t.Name, FontSize = 16, Padding = new Thickness(12, 10, 12, 10),
                    Margin = new Thickness(0, 0, 0, 8), HorizontalContentAlignment = HorizontalAlignment.Left,
                    ToolTip = t.Path,
                };
                var tool = t;
                b.Click += (s2, e2) => { win.Close(); LaunchTool(tool); };
                panel.Children.Add(b);
            }
            var cancel = new Button { Content = "Annuler", FontSize = 14, Padding = new Thickness(12, 6, 12, 6), HorizontalAlignment = HorizontalAlignment.Right };
            cancel.Click += (s2, e2) => win.Close();
            panel.Children.Add(cancel);
            win.Content = panel;
            GazeGate.Push();
            win.Closed += (s2, e2) => GazeGate.Pop();
            win.ShowDialog();
        }

        private void LaunchTool(Lib.TobiiTools.Tool tool)
        {
            Lib.Log.Write("calib", "Lancement : " + tool.Path);
            System.Diagnostics.Process proc = null;
            try
            {
                proc = System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(tool.Path)
                {
                    UseShellExecute = true,
                    WorkingDirectory = System.IO.Path.GetDirectoryName(tool.Path),
                });
            }
            catch (Exception ex)
            {
                Lib.Log.Write("calib", "Lancement impossible : " + ex.Message);
                MessageBox.Show(this, "Impossible d'ouvrir « " + tool.Name + " » :\n" + ex.Message, "Calibrer la tablette");
                return;
            }

            // Le temps du calibrage : regard en pause ici, fenêtre en arrière-plan.
            // On reprend dès que l'application est de nouveau au premier plan
            // (vérifié chaque seconde, après 8 s), et au plus tard après 3 min :
            // le regard ne doit JAMAIS rester bloqué en pause.
            GazeGate.Push();
            Topmost = false;
            var since = DateTime.Now;
            var watch = new System.Windows.Threading.DispatcherTimer { Interval = TimeSpan.FromSeconds(1) };
            bool resumed = false;
            watch.Tick += (s, e) =>
            {
                double sec = (DateTime.Now - since).TotalSeconds;
                if (!resumed && sec >= 8 && (IsActive || sec >= 180))
                {
                    resumed = true;
                    GazeGate.Pop();
                    Lib.Log.Write("calib", "Retour dans l'application : regard réactivé");
                }
                // Tant que l'outil Tobii est ouvert, on ne repasse PAS par-dessus :
                // un calibrage resté ouvert caché derrière bloque la caméra.
                bool toolOpen = false;
                try { toolOpen = proc != null && !proc.HasExited; } catch { }
                if (resumed && !toolOpen)
                {
                    watch.Stop();
                    Topmost = _isFullscreen;
                    Lib.Log.Write("calib", "Outil Tobii fermé : application de nouveau au premier plan");
                }
            };
            watch.Start();
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

        // ------------------------------------------------------------------
        //  Synchronisation entre tablettes (dossier partagé type OneDrive)
        // ------------------------------------------------------------------
        private void RefreshContentDirInfo()
        {
            try
            {
                var dir = Lib.Art.Dir;
                int n = System.IO.Directory.Exists(dir)
                    ? System.IO.Directory.GetFiles(dir, "*.png").Length +
                      System.IO.Directory.GetFiles(dir, "*.jpg").Length
                    : 0;
                var builtIn = System.IO.Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "Images");
                int nb = System.IO.Directory.Exists(builtIn)
                    ? System.IO.Directory.GetFiles(builtIn, "*.png").Length
                    : 0;
                ContentDirInfo.Text = "📂 Contenu lu ici : " + UserContent.RootDir +
                                      "\n🖼 Images du parent : " + n +
                                      " · embarquées avec l'appli : " + nb;
            }
            catch { ContentDirInfo.Text = ""; }
        }

        private void RecordVoices_Click(object sender, RoutedEventArgs e)
        {
            SettingsPopup.IsOpen = false;
            new VoiceRecorderWindow { Owner = this }.ShowDialog();
        }

        private void Bilan_Click(object sender, RoutedEventArgs e)
        {
            SettingsPopup.IsOpen = false;
            new BilanWindow { Owner = this }.ShowDialog();
        }

        private void Supabase_Changed(object sender, RoutedEventArgs e)
        {
            if (_settings == null || SupabaseUrlBox == null) return;
            _settings.SupabaseUrl = SupabaseUrlBox.Text.Trim();
            _settings.SupabaseKey = SupabaseKeyBox.Text.Trim();
            _settings.Save();
            CloudSync.Url = _settings.SupabaseUrl;
            CloudSync.Key = _settings.SupabaseKey;
            Cloud.Url = string.IsNullOrWhiteSpace(_settings.SupabaseUrl) ? Cloud.DefaultUrl : _settings.SupabaseUrl;
            Cloud.AnonKey = string.IsNullOrWhiteSpace(_settings.SupabaseKey) ? Cloud.DefaultAnonKey : _settings.SupabaseKey;
        }

        private async void CloudUp_Click(object sender, RoutedEventArgs e)
        {
            SettingsPopup.IsOpen = false;
            if (!FamilyCloud.Available(_settings))
            {
                MessageBox.Show(this, "Le nuage de la famille n'est pas prêt : il faut une licence activée en ligne et un mot de passe famille (bouton « Changer la licence »).", "Nuage");
                return;
            }
            CloudUpBtn.IsEnabled = CloudDownBtn.IsEnabled = false;
            var err = await FamilyCloud.UploadAsync(_settings, force: true, status: t => ShowParentNotice("☁️ " + t));
            CloudUpBtn.IsEnabled = CloudDownBtn.IsEnabled = true;
            RefreshCloudStatus();
            MessageBox.Show(this, err == null ? "Contenu envoyé dans le nuage de la famille !" : "Envoi impossible : " + err, "Nuage");
        }

        private async void CloudDown_Click(object sender, RoutedEventArgs e)
        {
            SettingsPopup.IsOpen = false;
            if (!FamilyCloud.Available(_settings))
            {
                MessageBox.Show(this, "Le nuage de la famille n'est pas prêt : il faut une licence activée en ligne et un mot de passe famille (bouton « Changer la licence »).", "Nuage");
                return;
            }
            CloudUpBtn.IsEnabled = CloudDownBtn.IsEnabled = false;
            var err = await FamilyCloud.DownloadAsync(_settings, force: true, status: t => ShowParentNotice("☁️ " + t));
            CloudUpBtn.IsEnabled = CloudDownBtn.IsEnabled = true;
            RefreshCloudStatus();
            RefreshContentDirInfo();
            MessageBox.Show(this, err == null ? "Contenu récupéré ! (" + FamilyCloud.Status + ")" : "Récupération impossible : " + err, "Nuage");
        }

        private void RefreshCloudStatus()
        {
            try
            {
                CloudStatusText.Text = !Cloud.Configured ? "Serveur non configuré."
                    : !FamilyCloud.Available(_settings) ? "Nuage famille : pas prêt (licence en ligne + mot de passe famille)."
                    : "Nuage famille : prêt" + (string.IsNullOrEmpty(FamilyCloud.Status) ? "" : " · " + FamilyCloud.Status) +
                      (string.IsNullOrEmpty(_settings.CloudLastSync) ? "" : " · dernière synchro " + _settings.CloudLastSync.Split('T')[0]);
            }
            catch { }
        }

        // Au démarrage : on récupère ce que l'autre tablette a ajouté ; à la fermeture : on envoie ce qu'on a ajouté.
        private async void CloudSyncAtStartup()
        {
            if (!FamilyCloud.Available(_settings)) return;
            try
            {
                await System.Threading.Tasks.Task.Delay(2500);
                var err = await FamilyCloud.DownloadAsync(_settings, force: false);
                if (err != null) Lib.Log.Write("nuage", "Synchro au démarrage : " + err);
                else if (FamilyCloud.Status.StartsWith("récupéré")) { ShowParentNotice("☁️ Contenu de la famille récupéré."); RefreshContentDirInfo(); }
                RefreshCloudStatus();
            }
            catch (Exception ex) { Lib.Log.Write("nuage", "Synchro au démarrage : " + ex.Message); }
        }

        private void CloudSyncAtExit()
        {
            if (!FamilyCloud.Available(_settings)) return;
            if (FamilyCloud.LocalFingerprint() == _settings.CloudLastFingerprint) return;
            try
            {
                // On envoie avant de partir (quelques secondes au plus : le reste attendra la prochaine fermeture).
                var task = FamilyCloud.UploadAsync(_settings, force: false);
                task.Wait(TimeSpan.FromSeconds(25));
            }
            catch (Exception ex) { Lib.Log.Write("nuage", "Envoi à la fermeture : " + ex.Message); }
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
            Usage.Screen(id);
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
