using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading.Tasks;

namespace MesPremiersJeux.Lib
{
    /// <summary>
    /// Intégration Spotify pour la partie Musique.
    ///
    /// Le parent crée une petite « app développeur » gratuite sur Spotify (voir
    /// desktop/README.md) et colle son « Client ID » dans les réglages. Il se
    /// connecte une fois (flux OAuth « Authorization Code + PKCE », sans secret,
    /// adapté à une app de bureau) : on récupère un jeton de rafraîchissement que
    /// l'on stocke pour rouvrir la session automatiquement ensuite.
    ///
    /// La lecture des morceaux complets se fait via le Spotify Web Playback SDK
    /// hébergé dans un WebView2 (voir MusicView) : ce SDK crée un « appareil »
    /// Spotify dans l'app. Ici, on gère l'authentification et les commandes de
    /// l'API Web (lancer un morceau sur cet appareil). La lecture complète exige
    /// un compte Premium.
    /// </summary>
    public static class Spotify
    {
        // Doit correspondre EXACTEMENT à l'URI de redirection déclarée dans l'app
        // développeur Spotify. On écoute en local sur ce port le temps du login.
        public const string RedirectUri = "http://127.0.0.1:8888/callback";
        private const string ListenerPrefix = "http://127.0.0.1:8888/";

        // Permissions demandées : streaming = lecture in-app ; les autres servent à
        // lancer/contrôler la lecture et à vérifier le compte.
        private const string Scopes =
            "streaming user-read-email user-read-private user-modify-playback-state user-read-playback-state";

        private static readonly HttpClient Http = new HttpClient();

        private static string _accessToken;
        private static DateTime _accessExpiry = DateTime.MinValue;
        private static string _pkceVerifier;

        public static string ClientId => (Settings.Load().SpotifyClientId ?? "").Trim();
        public static bool IsConfigured => ClientId.Length > 0;
        public static bool IsConnected => !string.IsNullOrEmpty((Settings.Load().SpotifyRefreshToken ?? "").Trim());

        // ---------------------------------------------------------------------
        //  Connexion (OAuth Authorization Code + PKCE)
        // ---------------------------------------------------------------------

        /// <summary>
        /// Ouvre la page de connexion Spotify dans le navigateur, attend le retour
        /// sur 127.0.0.1, échange le code contre les jetons et sauvegarde le jeton
        /// de rafraîchissement. Renvoie null si tout va bien, sinon un message.
        /// </summary>
        public static async Task<string> LoginAsync()
        {
            var clientId = ClientId;
            if (clientId.Length == 0) return "Renseigne d'abord le « Client ID » Spotify.";

            HttpListener listener = null;
            try
            {
                listener = new HttpListener();
                listener.Prefixes.Add(ListenerPrefix);
                listener.Start();
            }
            catch (Exception ex)
            {
                return "Impossible d'ouvrir l'écoute locale (port 8888) : " + ex.Message;
            }

            try
            {
                _pkceVerifier = RandomUrlToken(64);
                var challenge = Base64Url(Sha256(_pkceVerifier));
                var state = RandomUrlToken(16);

                var authUrl =
                    "https://accounts.spotify.com/authorize?response_type=code" +
                    "&client_id=" + Uri.EscapeDataString(clientId) +
                    "&redirect_uri=" + Uri.EscapeDataString(RedirectUri) +
                    "&scope=" + Uri.EscapeDataString(Scopes) +
                    "&code_challenge_method=S256&code_challenge=" + challenge +
                    "&state=" + state;

                try { System.Diagnostics.Process.Start(authUrl); }
                catch (Exception ex) { return "Impossible d'ouvrir le navigateur : " + ex.Message; }

                // Attend le retour de Spotify (avec un délai de sécurité).
                var ctxTask = listener.GetContextAsync();
                if (await Task.WhenAny(ctxTask, Task.Delay(TimeSpan.FromMinutes(3))) != ctxTask)
                    return "Connexion expirée. Réessaie.";

                var ctx = await ctxTask;
                var code = ctx.Request.QueryString["code"];
                var err = ctx.Request.QueryString["error"];
                var gotState = ctx.Request.QueryString["state"];
                RespondAndClose(ctx);

                if (!string.IsNullOrEmpty(err)) return "Connexion refusée : " + err;
                if (gotState != state) return "Réponse inattendue (state). Réessaie.";
                if (string.IsNullOrEmpty(code)) return "Aucun code reçu. Réessaie.";

                var form = new Dictionary<string, string>
                {
                    ["grant_type"] = "authorization_code",
                    ["code"] = code,
                    ["redirect_uri"] = RedirectUri,
                    ["client_id"] = clientId,
                    ["code_verifier"] = _pkceVerifier,
                };
                var tok = await PostTokenAsync(form);
                if (tok == null) return "Échec de l'échange du jeton. Vérifie le Client ID et l'URI de redirection.";

                var s = Settings.Load();
                if (!string.IsNullOrEmpty(tok.refresh_token)) s.SpotifyRefreshToken = tok.refresh_token;
                s.Save();
                StoreAccess(tok);
                return null;
            }
            catch (Exception ex)
            {
                return "Erreur de connexion : " + ex.Message;
            }
            finally
            {
                try { listener?.Stop(); } catch { }
            }
        }

        public static void Disconnect()
        {
            var s = Settings.Load();
            s.SpotifyRefreshToken = "";
            s.Save();
            _accessToken = null;
            _accessExpiry = DateTime.MinValue;
        }

        /// <summary>
        /// Renvoie un jeton d'accès valide (rafraîchi si besoin) ou null si le
        /// parent n'est pas connecté / la config est incomplète.
        /// </summary>
        public static async Task<string> GetAccessTokenAsync()
        {
            if (!string.IsNullOrEmpty(_accessToken) && DateTime.UtcNow < _accessExpiry.AddSeconds(-30))
                return _accessToken;

            var s = Settings.Load();
            var refresh = (s.SpotifyRefreshToken ?? "").Trim();
            var clientId = (s.SpotifyClientId ?? "").Trim();
            if (refresh.Length == 0 || clientId.Length == 0) return null;

            var form = new Dictionary<string, string>
            {
                ["grant_type"] = "refresh_token",
                ["refresh_token"] = refresh,
                ["client_id"] = clientId,
            };
            var tok = await PostTokenAsync(form);
            if (tok == null) return null;

            // Spotify peut renvoyer un nouveau refresh_token : on le garde.
            if (!string.IsNullOrEmpty(tok.refresh_token) && tok.refresh_token != refresh)
            {
                s.SpotifyRefreshToken = tok.refresh_token;
                s.Save();
            }
            StoreAccess(tok);
            return _accessToken;
        }

        private static void StoreAccess(TokenResponse tok)
        {
            _accessToken = tok.access_token;
            _accessExpiry = DateTime.UtcNow.AddSeconds(tok.expires_in > 0 ? tok.expires_in : 3600);
        }

        private static async Task<TokenResponse> PostTokenAsync(Dictionary<string, string> form)
        {
            try
            {
                using (var req = new HttpRequestMessage(HttpMethod.Post, "https://accounts.spotify.com/api/token"))
                {
                    req.Content = new FormUrlEncodedContent(form);
                    using (var resp = await Http.SendAsync(req))
                    {
                        var body = await resp.Content.ReadAsStringAsync();
                        if (!resp.IsSuccessStatusCode) return null;
                        return Deserialize<TokenResponse>(body);
                    }
                }
            }
            catch { return null; }
        }

        // ---------------------------------------------------------------------
        //  Lecture (API Web) — lance un contenu sur l'appareil du SDK
        // ---------------------------------------------------------------------

        /// <summary>
        /// Lance la lecture de <paramref name="spotifyUri"/> sur l'appareil
        /// (device_id fourni par le SDK). Renvoie null si OK, sinon un message.
        /// </summary>
        public static async Task<string> PlayAsync(string deviceId, string spotifyUri)
        {
            if (string.IsNullOrEmpty(deviceId)) return "Le lecteur n'est pas encore prêt.";
            var token = await GetAccessTokenAsync();
            if (token == null) return "Connecte d'abord Spotify (mode réglages).";

            // Un morceau se passe en « uris » ; une playlist / un album / un artiste
            // en « context_uri ».
            string json;
            if (spotifyUri.StartsWith("spotify:track:", StringComparison.OrdinalIgnoreCase))
                json = "{\"uris\":[\"" + spotifyUri + "\"]}";
            else
                json = "{\"context_uri\":\"" + spotifyUri + "\"}";

            try
            {
                var url = "https://api.spotify.com/v1/me/player/play?device_id=" + Uri.EscapeDataString(deviceId);
                using (var req = new HttpRequestMessage(HttpMethod.Put, url))
                {
                    req.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);
                    req.Content = new StringContent(json, Encoding.UTF8, "application/json");
                    using (var resp = await Http.SendAsync(req))
                    {
                        if (resp.IsSuccessStatusCode) return null;
                        if (resp.StatusCode == HttpStatusCode.NotFound)
                            return "Lecteur introuvable. Rouvre l'onglet Musique.";
                        if ((int)resp.StatusCode == 403)
                            return "La lecture complète demande un compte Spotify Premium.";
                        return "Lecture impossible (" + (int)resp.StatusCode + ").";
                    }
                }
            }
            catch (Exception ex) { return "Lecture impossible : " + ex.Message; }
        }

        // ---------------------------------------------------------------------
        //  Métadonnées (oEmbed) — pochette + titre, sans authentification
        // ---------------------------------------------------------------------

        /// <summary>
        /// À partir d'un lien Spotify collé par le parent, renvoie l'URI spotify:,
        /// un titre et l'URL d'une pochette. Ne nécessite aucune connexion.
        /// </summary>
        public static async Task<Favorite> LookupAsync(string linkOrUri)
        {
            var uri = ToSpotifyUri(linkOrUri);
            if (uri == null) return null;

            var fav = new Favorite { Uri = uri, Title = "Ma musique", Thumb = "" };
            try
            {
                var httpsUrl = ToOpenUrl(uri);
                var oe = "https://open.spotify.com/oembed?url=" + Uri.EscapeDataString(httpsUrl);
                var body = await Http.GetStringAsync(oe);
                var meta = Deserialize<OEmbed>(body);
                if (meta != null)
                {
                    if (!string.IsNullOrEmpty(meta.title)) fav.Title = meta.title;
                    if (!string.IsNullOrEmpty(meta.thumbnail_url)) fav.Thumb = meta.thumbnail_url;
                }
            }
            catch { /* on garde le titre par défaut */ }
            return fav;
        }

        // Accepte une URL open.spotify.com/... ou une URI spotify:... et renvoie
        // une URI canonique spotify:type:id (ou null si non reconnu).
        public static string ToSpotifyUri(string input)
        {
            if (string.IsNullOrWhiteSpace(input)) return null;
            input = input.Trim();

            var m = Regex.Match(input, @"open\.spotify\.com/(?:intl-[a-z]+/)?(track|playlist|album|artist|show|episode)/([A-Za-z0-9]+)");
            if (m.Success) return "spotify:" + m.Groups[1].Value + ":" + m.Groups[2].Value;

            m = Regex.Match(input, @"^spotify:(track|playlist|album|artist|show|episode):([A-Za-z0-9]+)$");
            if (m.Success) return input;

            return null;
        }

        private static string ToOpenUrl(string uri)
        {
            var parts = uri.Split(':');
            return parts.Length == 3 ? "https://open.spotify.com/" + parts[1] + "/" + parts[2] : uri;
        }

        // ---------------------------------------------------------------------
        //  Utilitaires
        // ---------------------------------------------------------------------

        private static void RespondAndClose(HttpListenerContext ctx)
        {
            try
            {
                var html =
                    "<!doctype html><html lang='fr'><head><meta charset='utf-8'>" +
                    "<title>Spotify connecté</title></head>" +
                    "<body style='font-family:sans-serif;text-align:center;padding-top:60px;background:#1DB954;color:white'>" +
                    "<h1>✅ Spotify connecté !</h1><p>Tu peux revenir à l'application « Mes Premiers Jeux ».</p>" +
                    "</body></html>";
                var buf = Encoding.UTF8.GetBytes(html);
                ctx.Response.ContentType = "text/html; charset=utf-8";
                ctx.Response.ContentLength64 = buf.Length;
                ctx.Response.OutputStream.Write(buf, 0, buf.Length);
                ctx.Response.OutputStream.Close();
            }
            catch { }
        }

        private static string RandomUrlToken(int bytes)
        {
            var b = new byte[bytes];
            using (var rng = RandomNumberGenerator.Create()) rng.GetBytes(b);
            return Base64Url(b);
        }

        private static byte[] Sha256(string s)
        {
            using (var sha = SHA256.Create()) return sha.ComputeHash(Encoding.ASCII.GetBytes(s));
        }

        private static string Base64Url(byte[] b) =>
            Convert.ToBase64String(b).TrimEnd('=').Replace('+', '-').Replace('/', '_');

        private static T Deserialize<T>(string json) where T : class
        {
            try
            {
                using (var ms = new MemoryStream(Encoding.UTF8.GetBytes(json)))
                    return (T)new DataContractJsonSerializer(typeof(T)).ReadObject(ms);
            }
            catch { return null; }
        }

        [DataContract]
        private sealed class TokenResponse
        {
            [DataMember(Name = "access_token")] public string access_token { get; set; }
            [DataMember(Name = "token_type")] public string token_type { get; set; }
            [DataMember(Name = "expires_in")] public int expires_in { get; set; }
            [DataMember(Name = "refresh_token", EmitDefaultValue = false)] public string refresh_token { get; set; }
            [DataMember(Name = "scope", EmitDefaultValue = false)] public string scope { get; set; }
        }

        [DataContract]
        private sealed class OEmbed
        {
            [DataMember(Name = "title")] public string title { get; set; }
            [DataMember(Name = "thumbnail_url", EmitDefaultValue = false)] public string thumbnail_url { get; set; }
        }
    }

    /// <summary>Une musique favorite (tuile de l'onglet Musique).</summary>
    public sealed class Favorite
    {
        public string Uri;    // spotify:track:… / spotify:playlist:…
        public string Title;  // titre affiché
        public string Thumb;  // URL de la pochette (peut être vide)
    }
}
