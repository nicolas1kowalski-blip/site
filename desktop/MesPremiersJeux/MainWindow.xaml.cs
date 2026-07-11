using System;
using System.Collections.Generic;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using MesPremiersJeux.Gaze;
using MesPremiersJeux.Views;

namespace MesPremiersJeux
{
    public partial class MainWindow : Window
    {
        private readonly GazeService _gaze = new GazeService();
        private DwellController _dwell;

        private readonly Dictionary<string, FrameworkElement> _views = new Dictionary<string, FrameworkElement>();

        // Sauvegarde pour la bascule plein écran.
        private WindowStyle _prevStyle;
        private ResizeMode _prevResize;
        private WindowState _prevState;
        private bool _isFullscreen;

        public MainWindow()
        {
            InitializeComponent();
            BuildViews();
            Loaded += OnLoaded;
            Closed += (s, e) => _gaze.Dispose();
        }

        private void BuildViews()
        {
            var coloring = new ColoringView();
            coloring.ToggleFullscreenRequested += (s, e) => ToggleFullscreen();

            _views["stories"] = Placeholder("📖", "Histoires", "Bientôt : les livres et le lecteur au regard.");
            _views["games"] = Placeholder("🎮", "Jeux", "Bientôt : ballons, corps, puzzle, paires…");
            _views["coloring"] = coloring;
            _views["music"] = Placeholder("🎵", "Musique", "Bientôt : les comptines.");

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
            _dwell = new DwellController(RootGrid, GazeLayer, GazeRing);
            _gaze.Gaze += p => _dwell.PushGaze(p);
            _gaze.Start();
            GazeStatus.Text = _gaze.IsAvailable ? "👁  Regard actif" : "🖱  Souris (aucun Tobii détecté)";

            // Valeurs par défaut des réglages (après création du dwell).
            DwellSlider.Value = _dwell.DwellTime;
            // Si un tracker SDK est présent, le regard pilote d'emblée ; sinon on
            // laisse le parent l'activer (mode curseur pour la TD I-13).
            GazeModeCheck.IsChecked = _gaze.IsAvailable;
            ApplyGazeMode();
        }

        private void Settings_Click(object sender, RoutedEventArgs e)
        {
            SettingsPopup.IsOpen = !SettingsPopup.IsOpen;
        }

        private void GazeMode_Changed(object sender, RoutedEventArgs e) => ApplyGazeMode();

        private void ApplyGazeMode()
        {
            if (_dwell == null) return;
            bool on = GazeModeCheck.IsChecked == true;
            _dwell.Enabled = on;
            // Sans SDK Tobii, on suit le curseur (déplacé au regard par la I-13).
            _dwell.UseCursor = on && !_gaze.IsAvailable;
        }

        private void DwellSlider_Changed(object sender, RoutedPropertyChangedEventArgs<double> e)
        {
            if (_dwell == null) return;
            _dwell.DwellTime = (int)e.NewValue;
            if (DwellValue != null) DwellValue.Text = $"{e.NewValue / 1000.0:0.0} s";
        }

        private void Tab_Click(object sender, RoutedEventArgs e)
        {
            if (sender is FrameworkElement fe && fe.Tag is string id) Select(id);
        }

        private void Select(string id)
        {
            foreach (var kv in _views) kv.Value.Visibility = kv.Key == id ? Visibility.Visible : Visibility.Collapsed;
        }

        private void ToggleFullscreen()
        {
            if (!_isFullscreen)
            {
                _prevStyle = WindowStyle;
                _prevResize = ResizeMode;
                _prevState = WindowState;
                WindowStyle = WindowStyle.None;
                ResizeMode = ResizeMode.NoResize;
                WindowState = WindowState.Normal; // force re-maximize pour couvrir la barre des tâches
                WindowState = WindowState.Maximized;
                _isFullscreen = true;
            }
            else
            {
                WindowStyle = _prevStyle;
                ResizeMode = _prevResize;
                WindowState = _prevState;
                _isFullscreen = false;
            }
        }
    }
}
