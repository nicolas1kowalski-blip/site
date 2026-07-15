using System;
using System.Collections.Generic;
using System.IO;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;
using MesPremiersJeux.Gaze;
using MesPremiersJeux.Lib;

namespace MesPremiersJeux.Views
{
    /// <summary>
    /// Onglet Musique : des tuiles « mes musiques » (chansons / playlists Spotify
    /// ajoutées par le parent) que l'enfant lance au regard, avec de gros boutons
    /// ⏮ ⏯ ⏭. La lecture des morceaux COMPLETS se fait dans l'app grâce au Spotify
    /// Web Playback SDK hébergé dans un WebView2 invisible (compte Premium requis).
    ///
    /// Côté parent (mode ⚙ admin) : coller son « Client ID » Spotify, se connecter
    /// une fois, puis coller des liens Spotify pour créer des tuiles.
    /// </summary>
    public sealed class MusicView : UserControl
    {
        private static readonly Brush Dark = new SolidColorBrush(Color.FromRgb(0x3B, 0x2A, 0x5A));
        private static readonly Brush Violet = new SolidColorBrush(Color.FromRgb(0x7E, 0x3F, 0xF2));

        // WebView2 minuscule et non cliquable, calé dans un coin : il sert seulement
        // d'hôte audio au SDK Spotify (Opacity est en lecture seule sur WebView2, on
        // le rend donc « invisible » par une taille de 1 px dans un coin).
        private readonly WebView2 _web = new WebView2
        {
            Width = 1,
            Height = 1,
            IsHitTestVisible = false,
            HorizontalAlignment = HorizontalAlignment.Left,
            VerticalAlignment = VerticalAlignment.Top,
        };
        private bool _webReady;
        private string _deviceId;

        private readonly List<Favorite> _favs;

        // UI
        private readonly WrapPanel _tiles;
        private readonly TextBlock _emptyMsg;
        private readonly TextBlock _nowPlaying;
        private readonly TextBlock _toggleGlyph;
        private readonly StackPanel _adminPanel;
        private readonly TextBox _clientIdBox;
        private readonly TextBox _linkBox;
        private readonly Button _connectBtn;
        private readonly TextBlock _statusText;

        public MusicView()
        {
            _favs = MusicLibrary.Load();

            var root = new Grid { Background = new LinearGradientBrush(
                Color.FromRgb(0xFF, 0xF3, 0xFB), Color.FromRgb(0xE9, 0xF2, 0xFF), 90) };
            for (int i = 0; i < 4; i++) root.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
            root.RowDefinitions[1].Height = new GridLength(1, GridUnitType.Star); // tuiles

            // --- Panneau parent (admin) ---
            _clientIdBox = new TextBox { Width = 360, FontSize = 16, Margin = new Thickness(6, 0, 12, 0), VerticalContentAlignment = VerticalAlignment.Center, Text = Settings.Load().SpotifyClientId ?? "" };
            _clientIdBox.TextChanged += (s, e) =>
            {
                var st = Settings.Load();
                st.SpotifyClientId = _clientIdBox.Text.Trim();
                st.Save();
                UpdateStatus();
            };
            _connectBtn = new Button { Content = "🎧  Connecter Spotify", Style = Res("BackButton"), Margin = new Thickness(0, 0, 12, 0) };
            _connectBtn.Click += Connect_Click;

            _linkBox = new TextBox { Width = 360, FontSize = 16, Margin = new Thickness(6, 0, 12, 0), VerticalContentAlignment = VerticalAlignment.Center };
            var addBtn = new Button { Content = "➕  Ajouter", Style = Res("BackButton") };
            addBtn.Click += Add_Click;
            _statusText = new TextBlock { Foreground = Dark, FontSize = 15, VerticalAlignment = VerticalAlignment.Center, TextWrapping = TextWrapping.Wrap, MaxWidth = 900, Margin = new Thickness(0, 6, 0, 0) };

            _adminPanel = new StackPanel { Margin = new Thickness(16, 12, 16, 6) };
            var row1 = new WrapPanel { Orientation = Orientation.Horizontal };
            row1.Children.Add(new TextBlock { Text = "🔑 Client ID :", Foreground = Dark, FontWeight = FontWeights.Bold, FontSize = 16, VerticalAlignment = VerticalAlignment.Center });
            row1.Children.Add(_clientIdBox);
            row1.Children.Add(_connectBtn);
            var row2 = new WrapPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 8, 0, 0) };
            row2.Children.Add(new TextBlock { Text = "🎵 Lien Spotify :", Foreground = Dark, FontWeight = FontWeights.Bold, FontSize = 16, VerticalAlignment = VerticalAlignment.Center });
            row2.Children.Add(_linkBox);
            row2.Children.Add(addBtn);
            _adminPanel.Children.Add(row1);
            _adminPanel.Children.Add(row2);
            _adminPanel.Children.Add(_statusText);
            Grid.SetRow(_adminPanel, 0);
            root.Children.Add(_adminPanel);

            // --- Tuiles (choix des musiques) ---
            _tiles = new WrapPanel { HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center };
            var scroll = new ScrollViewer { VerticalScrollBarVisibility = ScrollBarVisibility.Auto, HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled, Content = _tiles };
            var tilesArea = new Grid();
            _emptyMsg = new TextBlock
            {
                Text = "🎵\nDemande à un grand d'ajouter tes chansons préférées !",
                TextAlignment = TextAlignment.Center, FontSize = 26, Foreground = Dark,
                HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center,
            };
            tilesArea.Children.Add(_emptyMsg);
            tilesArea.Children.Add(scroll);
            tilesArea.Children.Add(_web); // WebView2 invisible (lecteur)
            Grid.SetRow(tilesArea, 1);
            root.Children.Add(tilesArea);

            // --- Titre en cours ---
            _nowPlaying = new TextBlock { Text = "", FontSize = 22, FontWeight = FontWeights.SemiBold, Foreground = Violet, HorizontalAlignment = HorizontalAlignment.Center, Margin = new Thickness(0, 4, 0, 4), TextTrimming = TextTrimming.CharacterEllipsis, MaxWidth = 1000 };
            Grid.SetRow(_nowPlaying, 2);
            root.Children.Add(_nowPlaying);

            // --- Barre de transport ⏮ ⏯ ⏭ ---
            var transport = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Center, Margin = new Thickness(0, 0, 0, 18) };
            transport.Children.Add(TransportButton("⏮", () => RunJs("window.__prev()")));
            _toggleGlyph = new TextBlock { Text = "⏯", FontSize = 60, HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center };
            var toggleBtn = new Button { Style = Res("AnswerButton"), Width = 150, Height = 120, Content = _toggleGlyph, Margin = new Thickness(16, 0, 16, 0) };
            toggleBtn.Click += (s, e) => RunJs("window.__toggle()");
            transport.Children.Add(toggleBtn);
            transport.Children.Add(TransportButton("⏭", () => RunJs("window.__next()")));
            Grid.SetRow(transport, 3);
            root.Children.Add(transport);

            Content = root;

            AdminMode.Changed += OnAdminChanged;
            Loaded += (s, e) => { OnAdminChanged(); RebuildTiles(); UpdateStatus(); };
            Unloaded += (s, e) => AdminMode.Changed -= OnAdminChanged;

            InitWebViewAsync();
        }

        private Button TransportButton(string glyph, Action onClick)
        {
            var b = new Button
            {
                Style = Res("AnswerButton"), Width = 130, Height = 110, Margin = new Thickness(8, 0, 8, 0),
                Content = new TextBlock { Text = glyph, FontSize = 48, HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center },
            };
            b.Click += (s, e) => onClick();
            return b;
        }

        private static Style Res(string key) => (Style)Application.Current.Resources[key];

        // ------------------------------------------------------------------
        //  Admin / statut
        // ------------------------------------------------------------------

        private void OnAdminChanged()
        {
            Dispatcher.Invoke(() =>
            {
                _adminPanel.Visibility = AdminMode.IsActive ? Visibility.Visible : Visibility.Collapsed;
                RebuildTiles(); // ré-affiche/masque les croix de suppression
                UpdateStatus();
            });
        }

        private void UpdateStatus()
        {
            if (!AdminMode.IsActive) return;
            string msg;
            if (!Spotify.IsConfigured)
                msg = "① Crée une app sur developer.spotify.com, ajoute l'URI de redirection " + Spotify.RedirectUri +
                      " puis colle ici le « Client ID ».";
            else if (!Spotify.IsConnected)
                msg = "② Clique « Connecter Spotify » et connecte-toi (une seule fois). Un compte Premium est requis pour la lecture complète.";
            else
                msg = "✅ Spotify connecté. Colle un lien (chanson ou playlist) puis « Ajouter ». Décoche le mode admin pour laisser jouer l'enfant.";
            _statusText.Text = msg;
            _connectBtn.Content = Spotify.IsConnected ? "🔄  Reconnecter Spotify" : "🎧  Connecter Spotify";
        }

        private async void Connect_Click(object sender, RoutedEventArgs e)
        {
            if (!Spotify.IsConfigured)
            {
                MessageBox.Show("Colle d'abord ton « Client ID » Spotify.", "Spotify");
                return;
            }
            GazeGate.Push();
            _connectBtn.IsEnabled = false;
            _connectBtn.Content = "⏳  Connexion…";
            try
            {
                var err = await Spotify.LoginAsync();
                MessageBox.Show(err ?? "Spotify est connecté ! Tu peux ajouter des musiques.", "Spotify");
            }
            finally
            {
                _connectBtn.IsEnabled = true;
                UpdateStatus();
                GazeGate.Pop();
                // Redémarre le lecteur pour qu'il prenne le nouveau jeton.
                ReloadPlayer();
            }
        }

        private async void Add_Click(object sender, RoutedEventArgs e)
        {
            var link = _linkBox.Text.Trim();
            if (link.Length == 0) return;
            if (Spotify.ToSpotifyUri(link) == null)
            {
                MessageBox.Show("Ce lien n'est pas reconnu. Colle un lien Spotify (chanson, album ou playlist).", "Spotify");
                return;
            }
            var fav = await Spotify.LookupAsync(link);
            if (fav == null)
            {
                MessageBox.Show("Impossible de lire ce lien.", "Spotify");
                return;
            }
            _favs.Add(fav);
            MusicLibrary.Save(_favs);
            _linkBox.Text = "";
            RebuildTiles();
        }

        private void Remove(Favorite fav)
        {
            _favs.Remove(fav);
            MusicLibrary.Save(_favs);
            RebuildTiles();
        }

        // ------------------------------------------------------------------
        //  Tuiles
        // ------------------------------------------------------------------

        private void RebuildTiles()
        {
            _tiles.Children.Clear();
            foreach (var fav in _favs) _tiles.Children.Add(BuildTile(fav));
            _emptyMsg.Visibility = _favs.Count == 0 ? Visibility.Visible : Visibility.Collapsed;
        }

        private FrameworkElement BuildTile(Favorite fav)
        {
            var stack = new StackPanel();
            var cover = new Border
            {
                Width = 200, Height = 150, CornerRadius = new CornerRadius(16), ClipToBounds = true,
                Background = new SolidColorBrush(Color.FromRgb(0xED, 0xE0, 0xFF)),
                Margin = new Thickness(0, 0, 0, 8),
            };
            if (!string.IsNullOrEmpty(fav.Thumb))
            {
                try
                {
                    var bmp = new BitmapImage();
                    bmp.BeginInit();
                    bmp.CacheOption = BitmapCacheOption.OnLoad;
                    bmp.UriSource = new Uri(fav.Thumb, UriKind.Absolute);
                    bmp.EndInit();
                    cover.Child = new Image { Source = bmp, Stretch = Stretch.UniformToFill };
                }
                catch { cover.Child = EmojiCover(); }
            }
            else cover.Child = EmojiCover();

            stack.Children.Add(cover);
            stack.Children.Add(new TextBlock
            {
                Text = fav.Title, FontSize = 18, FontWeight = FontWeights.SemiBold, Foreground = Dark,
                TextAlignment = TextAlignment.Center, TextWrapping = TextWrapping.Wrap, MaxWidth = 220,
                TextTrimming = TextTrimming.CharacterEllipsis, MaxHeight = 52,
            });

            var tile = new Button { Style = Res("MenuTile"), Width = 232, Height = 232, Content = stack };
            tile.Click += async (s, e) => await Play(fav);

            if (!AdminMode.IsActive) return tile;

            // En mode admin : superpose une croix de suppression.
            var grid = new Grid();
            grid.Children.Add(tile);
            var del = new Button
            {
                Content = "✕", FontSize = 22, FontWeight = FontWeights.Bold, Width = 44, Height = 44,
                HorizontalAlignment = HorizontalAlignment.Right, VerticalAlignment = VerticalAlignment.Top,
                Margin = new Thickness(0, 4, 4, 0), Foreground = Brushes.White, Background = Brushes.Crimson,
                BorderThickness = new Thickness(0), Cursor = System.Windows.Input.Cursors.Hand,
            };
            del.Click += (s, e) => Remove(fav);
            grid.Children.Add(del);
            return grid;
        }

        private static TextBlock EmojiCover() => new TextBlock
        {
            Text = "🎵", FontSize = 64, HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center,
        };

        private async System.Threading.Tasks.Task Play(Favorite fav)
        {
            _nowPlaying.Text = "🎵 " + fav.Title;
            if (!_webReady)
            {
                _nowPlaying.Text = "⏳ Le lecteur se prépare… réessaie dans un instant.";
                return;
            }
            var err = await Spotify.PlayAsync(_deviceId, fav.Uri);
            if (err != null)
            {
                _nowPlaying.Text = "⚠ " + err;
                Speech.Say(err);
            }
        }

        // ------------------------------------------------------------------
        //  WebView2 : hôte du Spotify Web Playback SDK
        // ------------------------------------------------------------------

        private async void InitWebViewAsync()
        {
            try
            {
                // --autoplay-policy : autorise le démarrage audio sans geste direct
                // dans la page (le clic au regard reste un vrai clic côté app).
                var opts = new CoreWebView2EnvironmentOptions("--autoplay-policy=no-user-gesture-required");
                var env = await CoreWebView2Environment.CreateAsync(null, null, opts);
                await _web.EnsureCoreWebView2Async(env);

                _web.CoreWebView2.WebMessageReceived += OnWebMessage;

                // Sert la page depuis un hôte virtuel https → contexte sécurisé
                // exigé par le SDK (lecture protégée EME/Widevine).
                var dir = Path.Combine(Path.GetTempPath(), "MpjSpotify");
                Directory.CreateDirectory(dir);
                File.WriteAllText(Path.Combine(dir, "player.html"), PlayerHtml);
                _web.CoreWebView2.SetVirtualHostNameToFolderMapping(
                    "mpj.player", dir, CoreWebView2HostResourceAccessKind.Allow);
                _web.CoreWebView2.Navigate("https://mpj.player/player.html");
            }
            catch (Exception ex)
            {
                Dispatcher.Invoke(() => _nowPlaying.Text =
                    "⚠ Lecteur indisponible : installe « WebView2 Runtime » de Microsoft. (" + ex.Message + ")");
            }
        }

        private void ReloadPlayer()
        {
            _webReady = false;
            _deviceId = null;
            try { _web.CoreWebView2?.Navigate("https://mpj.player/player.html"); } catch { }
        }

        private async void OnWebMessage(object sender, CoreWebView2WebMessageReceivedEventArgs e)
        {
            string msg;
            try { msg = e.TryGetWebMessageAsString(); }
            catch { return; }
            if (string.IsNullOrEmpty(msg)) return;

            var bar = msg.IndexOf('|');
            var kind = bar < 0 ? msg : msg.Substring(0, bar);
            var arg = bar < 0 ? "" : msg.Substring(bar + 1);

            switch (kind)
            {
                case "ready":
                    _deviceId = arg;
                    _webReady = true;
                    break;
                case "notready":
                    _webReady = false;
                    break;
                case "token_request":
                    var token = await Spotify.GetAccessTokenAsync();
                    if (!string.IsNullOrEmpty(token))
                        RunJs("window.__provideToken(\"" + EscapeJs(token) + "\")");
                    break;
                case "state":
                    _toggleGlyph.Text = arg == "playing" ? "⏸" : "▶";
                    break;
                case "error":
                    _nowPlaying.Text = "⚠ " + arg;
                    break;
            }
        }

        private async void RunJs(string js)
        {
            try
            {
                if (_web.CoreWebView2 != null) await _web.CoreWebView2.ExecuteScriptAsync(js);
            }
            catch { /* lecteur pas prêt */ }
        }

        private static string EscapeJs(string s) => (s ?? "").Replace("\\", "\\\\").Replace("\"", "\\\"");

        // Page hôte du SDK. getOAuthToken demande le jeton à l'app (token_request) ;
        // l'app répond via window.__provideToken. Les commandes ⏯/⏭/⏮ appellent le
        // lecteur. Les événements (ready, état, erreurs) remontent par postMessage.
        private const string PlayerHtml = @"<!doctype html>
<html lang=""fr""><head><meta charset=""utf-8""></head>
<body style=""margin:0;background:#000"">
<script src=""https://sdk.scdn.co/spotify-player.js""></script>
<script>
  var player = null, tokenCb = null;
  function post(m){ try { window.chrome.webview.postMessage(m); } catch(e){} }
  window.__provideToken = function(t){ if (tokenCb) { var f = tokenCb; tokenCb = null; f(t); } };
  window.__toggle = function(){ if (player) player.togglePlay(); };
  window.__next   = function(){ if (player) player.nextTrack(); };
  window.__prev   = function(){ if (player) player.previousTrack(); };
  window.onSpotifyWebPlaybackSDKReady = function(){
    player = new Spotify.Player({
      name: 'Mes Premiers Jeux',
      volume: 0.85,
      getOAuthToken: function(cb){ tokenCb = cb; post('token_request'); }
    });
    player.addListener('ready', function(e){ post('ready|' + e.device_id); });
    player.addListener('not_ready', function(e){ post('notready|' + e.device_id); });
    player.addListener('player_state_changed', function(s){
      post('state|' + (s && !s.paused ? 'playing' : 'paused'));
    });
    player.addListener('initialization_error', function(e){ post('error|' + e.message); });
    player.addListener('authentication_error', function(e){ post('error|connexion: ' + e.message); });
    player.addListener('account_error', function(e){ post('error|Premium requis: ' + e.message); });
    player.addListener('playback_error', function(e){ post('error|lecture: ' + e.message); });
    player.connect();
  };
</script>
</body></html>";
    }
}
