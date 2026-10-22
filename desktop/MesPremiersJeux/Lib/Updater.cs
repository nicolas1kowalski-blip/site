using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Reflection;
using System.Security.Cryptography;
using System.Text.RegularExpressions;
using System.Threading.Tasks;

namespace MesPremiersJeux.Lib
{
    /// <summary>
    /// 🔄 MISES À JOUR AUTOMATIQUES, comme un jeu sur Windows : l'application
    /// regarde les versions publiées sur GitHub (compilées automatiquement),
    /// télécharge l'installeur de la plus récente de SON CANAL, vérifie son
    /// empreinte SHA-256, l'installe en silence et se relance.
    ///   · canal test : toutes les versions, y compris les pré-versions ;
    ///   · canal prod : seulement les versions promues (non pré-versions).
    /// Les installeurs téléchargés sont gardés : « Revenir à la version
    /// précédente » relance le précédent.
    /// </summary>
    public static class Updater
    {
        private const string Repo = "nicolas1kowalski-blip/eyzi-releases";
        private static readonly HttpClient Http = new HttpClient { Timeout = TimeSpan.FromMinutes(5) };

        static Updater()
        {
            Http.DefaultRequestHeaders.UserAgent.ParseAdd("MesPremiersJeux/" + Current);
            Http.DefaultRequestHeaders.Accept.ParseAdd("application/vnd.github+json");
        }

        public static Version Current => Assembly.GetExecutingAssembly().GetName().Version ?? new Version(0, 0, 0, 1);

        /// <summary>Compilée à la main (Visual Studio) : pas de mise à jour automatique.</summary>
        public static bool IsDevBuild => Current.Major == 0;

        public static string UpdatesDir
        {
            get
            {
                var d = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "MesPremiersJeux", "MisesAJour");
                try { Directory.CreateDirectory(d); } catch { }
                return d;
            }
        }

        public sealed class Info
        {
            public Version Version;
            public string Tag, Title, Notes, SetupName, SetupUrl, ShaUrl;
            public bool Prerelease;
            public bool IsNewer => Version > Current;
        }

        /// <summary>La version la plus récente du canal (ou null si aucune / hors ligne).</summary>
        public static async Task<Info> CheckAsync(bool testChannel)
        {
            var json = await Http.GetStringAsync("https://api.github.com/repos/" + Repo + "/releases?per_page=20");
            // Découpage grossier des releases : chaque objet commence par "url":"…/releases/<id>".
            var releases = Regex.Split(json, "(?=\\{\\s*\"url\"\\s*:\\s*\"https://api\\.github\\.com/repos/[^\"]+/releases/\\d+\")");
            foreach (var r in releases)
            {
                if (string.IsNullOrWhiteSpace(r) || !r.Contains("\"tag_name\"")) continue;
                bool draft = Regex.IsMatch(r, "\"draft\"\\s*:\\s*true");
                bool pre = Regex.IsMatch(r, "\"prerelease\"\\s*:\\s*true");
                if (draft || (pre && !testChannel)) continue;
                var tag = Cloud.JsonGet(r, "tag_name") ?? "";
                if (!Version.TryParse(tag.TrimStart('v', 'V'), out var v)) continue;
                var setup = Regex.Match(r, "\"browser_download_url\"\\s*:\\s*\"([^\"]*Eyzi-Setup-[^\"]*\\.exe)\"");
                if (!setup.Success) continue;
                var sha = Regex.Match(r, "\"browser_download_url\"\\s*:\\s*\"([^\"]*Eyzi-Setup-[^\"]*\\.exe\\.sha256)\"");
                return new Info
                {
                    Version = v, Tag = tag, Prerelease = pre,
                    Title = Cloud.JsonGet(r, "name") ?? tag,
                    Notes = Cloud.JsonGet(r, "body") ?? "",
                    SetupUrl = setup.Groups[1].Value, SetupName = Path.GetFileName(setup.Groups[1].Value),
                    ShaUrl = sha.Success ? sha.Groups[1].Value : null,
                };
            }
            return null;
        }

        /// <summary>Télécharge l'installeur, vérifie l'empreinte, l'installe en silence et relance l'application.
        /// Renvoie null si l'installation a démarré, sinon le message d'erreur.</summary>
        public static async Task<string> InstallAsync(Info info, Action<string> status)
        {
            try
            {
                var path = Path.Combine(UpdatesDir, info.SetupName);
                status?.Invoke("Téléchargement de la version " + info.Version + "…");
                using (var res = await Http.GetAsync(info.SetupUrl, HttpCompletionOption.ResponseHeadersRead))
                {
                    res.EnsureSuccessStatusCode();
                    using (var fs = File.Create(path))
                        await res.Content.CopyToAsync(fs);
                }
                if (info.ShaUrl != null)
                {
                    status?.Invoke("Vérification…");
                    var expected = (await Http.GetStringAsync(info.ShaUrl)).Trim().Split(' ')[0].ToLowerInvariant();
                    var actual = Sha256(path);
                    if (expected != actual)
                    {
                        try { File.Delete(path); } catch { }
                        Log.Write("maj", "Empreinte différente : attendu " + expected + ", obtenu " + actual);
                        return "Le fichier téléchargé est abîmé (empreinte différente). Réessaie plus tard.";
                    }
                }
                Log.Write("maj", "Installation de " + info.Version + " depuis " + path);
                Settings.Load().Save(); // rien à changer, mais on s'assure que tout est écrit avant de quitter
                return Launch(path);
            }
            catch (Exception ex)
            {
                Log.Write("maj", "Échec : " + ex);
                return "Mise à jour impossible : " + ex.Message;
            }
        }

        /// <summary>L'installeur de la version précédente, s'il est encore là.</summary>
        public static string PreviousSetup()
        {
            try
            {
                return Directory.GetFiles(UpdatesDir, "*-Setup-*.exe")
                    .Select(f => (Path: f, Ver: ParseVersion(f)))
                    .Where(t => t.Ver != null && t.Ver < Current)
                    .OrderByDescending(t => t.Ver)
                    .Select(t => t.Path)
                    .FirstOrDefault();
            }
            catch { return null; }
        }

        public static string Rollback()
        {
            var prev = PreviousSetup();
            if (prev == null) return "Aucune version précédente n'est disponible sur cette tablette.";
            Log.Write("maj", "Retour à " + prev);
            return Launch(prev);
        }

        private static string Launch(string setupPath)
        {
            try
            {
                Process.Start(new ProcessStartInfo(setupPath, "/VERYSILENT /SUPPRESSMSGBOXES /NORESTART /CLOSEAPPLICATIONS /LAUNCH=1") { UseShellExecute = true });
            }
            catch (Exception ex) { return "Impossible de lancer l'installeur : " + ex.Message; }
            // L'installeur ferme l'application (CloseApplications) ; on part proprement nous-mêmes.
            System.Windows.Application.Current.Dispatcher.BeginInvoke(new Action(() => System.Windows.Application.Current.Shutdown()));
            return null;
        }

        private static Version ParseVersion(string path)
        {
            var m = Regex.Match(Path.GetFileName(path), "Setup-(\\d+\\.\\d+\\.\\d+\\.\\d+)");
            return m.Success && Version.TryParse(m.Groups[1].Value, out var v) ? v : null;
        }

        private static string Sha256(string path)
        {
            using (var sha = SHA256.Create())
            using (var fs = File.OpenRead(path))
                return BitConverter.ToString(sha.ComputeHash(fs)).Replace("-", "").ToLowerInvariant();
        }

        /// <summary>Ménage : on garde les trois derniers installeurs.</summary>
        public static void Cleanup()
        {
            try
            {
                foreach (var f in Directory.GetFiles(UpdatesDir, "*-Setup-*.exe")
                             .Select(f => (Path: f, Ver: ParseVersion(f))).OrderByDescending(t => t.Ver).Skip(3))
                    File.Delete(f.Path);
            }
            catch { }
        }
    }
}
