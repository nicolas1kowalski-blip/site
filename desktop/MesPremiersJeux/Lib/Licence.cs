using System;
using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;

namespace MesPremiersJeux.Lib
{
    /// <summary>
    /// 🔑 LA LICENCE : un numéro donné par l'éditeur (EYZ-XXXX-XXXX-XXXX-XXXX ; les anciens MPJ- restent acceptés).
    /// Vérifié en ligne à l'activation (serveur de l'application), gardé sur la
    /// tablette, re-vérifié au plus tous les jours quand il y a du réseau, et
    /// valable 30 jours hors ligne. La licence porte le CANAL de mises à jour
    /// (test / prod), le nom de la famille, le nombre de tablettes, une date
    /// de fin éventuelle. Toutes les tablettes d'une même licence forment une
    /// famille (synchronisation entre elles seulement).
    /// Quelques licences « maîtres » sont reconnues hors ligne (empreinte
    /// SHA-256 embarquée) : celles du développeur.
    /// </summary>
    public static class Licence
    {
        private const int OfflineDays = 30;
        public const int TrialDays = 10;

        // L'essai : 10 jours sans licence. La date de début est gardée dans les
        // réglages ET dans un petit fichier qui survit à une désinstallation ;
        // la plus ancienne des deux compte.
        private static string TrialMarker => System.IO.Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "MesPremiersJeux", "essai.txt");

        public static DateTime? TrialStart(Settings s)
        {
            DateTime? best = null;
            if (s != null && DateTime.TryParseExact(s.TrialStart ?? "", "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var a)) best = a;
            try
            {
                if (System.IO.File.Exists(TrialMarker) && DateTime.TryParseExact(System.IO.File.ReadAllText(TrialMarker).Trim(), "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var b))
                    best = best == null || b < best ? b : best;
            }
            catch { }
            return best;
        }

        /// <summary>Jours d'essai restants (0 = terminé ; -1 = jamais commencé).</summary>
        public static int TrialDaysLeft(Settings s)
        {
            var start = TrialStart(s);
            if (start == null) return -1;
            return Math.Max(0, TrialDays - (int)(DateTime.Today - start.Value.Date).TotalDays);
        }

        public static bool TrialActive(Settings s) => TrialDaysLeft(s) > 0;

        /// <summary>Démarre l'essai (une seule fois par tablette).</summary>
        public static void StartTrial(Settings s)
        {
            if (TrialStart(s) != null) return;
            var today = DateTime.Today.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
            s.TrialStart = today; s.Save();
            try { System.IO.Directory.CreateDirectory(System.IO.Path.GetDirectoryName(TrialMarker)); System.IO.File.WriteAllText(TrialMarker, today); } catch { }
            Log.Write("licence", "Essai de " + TrialDays + " jours commencé");
        }

        // Empreintes SHA-256 des licences reconnues sans serveur (canal test).
        private static readonly string[] MasterHashes =
        {
            "72a39bf8bf6e7b5ac34a747b243cc91dca0e2769468ffccf65edc04c5e6917fc", // EYZ-XW4A-EPNW-HCWC-VSDN
        };

        public static string Normalize(string key)
        {
            if (key == null) return "";
            var sb = new StringBuilder();
            foreach (var c in key.ToUpperInvariant()) if (char.IsLetterOrDigit(c)) sb.Append(c);
            var s = sb.ToString();
            if (s.StartsWith("EYZ") || s.StartsWith("MPJ")) s = s.Substring(3);
            if (s.Length != 16) return key.Trim().ToUpperInvariant();
            return "EYZ-" + s.Substring(0, 4) + "-" + s.Substring(4, 4) + "-" + s.Substring(8, 4) + "-" + s.Substring(12, 4);
        }

        public static string Hash(string key)
        {
            using (var sha = SHA256.Create())
                return BitConverter.ToString(sha.ComputeHash(Encoding.UTF8.GetBytes(Normalize(key)))).Replace("-", "").ToLowerInvariant();
        }

        public static bool IsMaster(string key) => Array.IndexOf(MasterHashes, Hash(key)) >= 0;

        /// <summary>La licence enregistrée est-elle utilisable maintenant ?</summary>
        public static bool IsValid(Settings s)
        {
            if (s == null) return false;
            if (!s.LicenceOk || string.IsNullOrWhiteSpace(s.LicenceKey)) return TrialActive(s);
            if (IsMaster(s.LicenceKey)) return true;
            if (DateTime.TryParseExact(s.LicenceUntil ?? "", "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var until) && DateTime.Today > until)
                return false;
            if (DateTime.TryParseExact(s.LicenceChecked ?? "", "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var checkedAt)
                && (DateTime.Today - checkedAt).TotalDays > OfflineDays)
                return false;
            return true;
        }

        public static bool IsTest(Settings s) => s != null && string.Equals(s.LicenceChannel, "test", StringComparison.OrdinalIgnoreCase);

        public static string Describe(Settings s)
        {
            if (s == null || string.IsNullOrWhiteSpace(s.LicenceKey) || !s.LicenceOk)
            {
                int left = TrialDaysLeft(s);
                if (left > 0) return "essai · " + left + (left > 1 ? " jours restants" : " jour restant") + " · licence gratuite sur eyzi.fr";
                if (left == 0) return "essai terminé · licence gratuite sur eyzi.fr";
                return "aucune licence";
            }
            var sb = new StringBuilder();
            sb.Append(s.LicenceKey).Append(" · ").Append(string.IsNullOrEmpty(s.LicenceFamily) ? "famille" : s.LicenceFamily);
            sb.Append(" · canal ").Append(IsTest(s) ? "TEST" : "prod");
            if (s.LicenceUsed > 0) sb.Append(" · tablettes : ").Append(s.LicenceUsed).Append('/').Append(s.LicenceMax);
            if (!string.IsNullOrEmpty(s.LicenceUntil)) sb.Append(" · jusqu'au ").Append(s.LicenceUntil);
            if (!string.IsNullOrEmpty(s.LicenceChecked)) sb.Append(" · vérifiée le ").Append(s.LicenceChecked);
            if (!IsValid(s)) sb.Append(" · ⚠ NON VALIDE");
            return sb.ToString();
        }

        /// <summary>Active (ou re-vérifie) une licence. Renvoie null si OK, sinon le message pour le parent.</summary>
        public static async Task<string> ActivateAsync(Settings s, string key)
        {
            key = Normalize(key);
            if (key.Length < 8) return "Le numéro de licence est incomplet.";

            // 1) Les licences maîtres : reconnues sans serveur (canal test).
            if (IsMaster(key))
            {
                Apply(s, key, "Développement", "test", 99, "", true);
                s.LicenceUsed = 1; s.Save();
                Log.Write("licence", "Licence maître activée (test)");
                return null;
            }

            // 2) Le serveur de l'application.
            if (!Cloud.Configured) return "Le serveur de licences n'est pas configuré dans cette version.";
            string json;
            try
            {
                var body = "{\"p_key\":\"" + key + "\",\"p_machine\":\"" + Esc(Environment.MachineName) + "\",\"p_version\":\"" + Updater.Current + "\"}";
                json = await Cloud.RpcAsync("activate_licence", body);
            }
            catch (Exception ex)
            {
                Log.Write("licence", "Vérification impossible : " + ex.Message);
                // Déjà activée : on tolère une panne de réseau (30 jours).
                return s.LicenceOk && s.LicenceKey == key ? null : "Impossible de joindre le serveur : " + ex.Message;
            }
            Log.Write("licence", "Réponse du serveur : " + json);
            bool ok = string.Equals(Cloud.JsonGet(json, "ok"), "true", StringComparison.OrdinalIgnoreCase);
            if (!ok)
            {
                var msg = Cloud.JsonGet(json, "message") ?? "licence refusée";
                Apply(s, key, Cloud.JsonGet(json, "family") ?? "", s.LicenceChannel, s.LicenceMax, s.LicenceUntil, false);
                return msg;
            }
            int max = 2;
            int.TryParse(Cloud.JsonGet(json, "max_tablets") ?? "2", out max);
            int.TryParse(Cloud.JsonGet(json, "used_tablets") ?? "1", out s.LicenceUsed);
            s.CloudEmail = Cloud.JsonGet(json, "cloud_email") ?? s.CloudEmail;
            s.CloudSecret = Cloud.JsonGet(json, "cloud_secret") ?? s.CloudSecret;
            Apply(s, key, Cloud.JsonGet(json, "family") ?? "", (Cloud.JsonGet(json, "channel") ?? "prod").ToLowerInvariant(), max,
                  (Cloud.JsonGet(json, "expires_at") ?? "").Split('T')[0], true);
            return null;
        }

        private static void Apply(Settings s, string key, string family, string channel, int max, string until, bool ok)
        {
            s.LicenceKey = key;
            s.LicenceFamily = family;
            s.LicenceChannel = channel == "test" ? "test" : "prod";
            s.LicenceMax = max;
            s.LicenceUntil = until ?? "";
            s.LicenceChecked = DateTime.Today.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
            s.LicenceOk = ok;
            s.Save();
        }

        /// <summary>Au démarrage : re-vérification silencieuse (au plus une fois par jour).</summary>
        public static async Task RecheckAsync(Settings s)
        {
            if (s == null || !s.LicenceOk || IsMaster(s.LicenceKey) || !Cloud.Configured) return;
            if (DateTime.TryParseExact(s.LicenceChecked ?? "", "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var c) && c == DateTime.Today) return;
            await ActivateAsync(s, s.LicenceKey);
        }

        /// <summary>Libère cette tablette (changement de poste) : la place redevient libre pour une autre.
        /// Renvoie null si OK, sinon le message.</summary>
        public static async Task<string> ReleaseAsync(Settings s)
        {
            if (s == null || string.IsNullOrWhiteSpace(s.LicenceKey)) return "Aucune licence sur cette tablette.";
            if (!IsMaster(s.LicenceKey))
            {
                if (!Cloud.Configured) return "Le serveur de licences n'est pas configuré : impossible de libérer la place.";
                try
                {
                    var body = "{\"p_key\":\"" + s.LicenceKey + "\",\"p_machine\":\"" + Esc(Environment.MachineName) + "\"}";
                    var json = await Cloud.RpcAsync("release_activation", body);
                    if (!string.Equals(Cloud.JsonGet(json, "ok"), "true", StringComparison.OrdinalIgnoreCase))
                        return Cloud.JsonGet(json, "message") ?? "refusé";
                }
                catch (Exception ex) { return "Impossible de joindre le serveur : " + ex.Message; }
            }
            Log.Write("licence", "Tablette libérée (" + s.LicenceKey + ")");
            s.LicenceOk = false; s.LicenceUsed = 0; s.LicenceChecked = "";
            s.CloudEmail = ""; s.CloudSecret = ""; s.CloudLastSync = ""; s.CloudLastFingerprint = "";
            s.Save();
            return null;
        }

        private static string Esc(string v) => (v ?? "").Replace("\\", "\\\\").Replace("\"", "\\\"");

        /// <summary>Identifiant de famille (pour le nuage) : l'empreinte de la licence.</summary>
        public static string FamilyId(Settings s) => string.IsNullOrWhiteSpace(s?.LicenceKey) ? "" : Hash(s.LicenceKey).Substring(0, 32);
    }
}
