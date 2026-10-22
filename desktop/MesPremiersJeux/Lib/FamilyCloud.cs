using System;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;

namespace MesPremiersJeux.Lib
{
    /// <summary>
    /// ☁🔒 LE NUAGE DE LA FAMILLE : le contenu (photos, voix, livres…) de
    /// toutes les tablettes d'une même licence, synchronisé par l'application,
    /// CHIFFRÉ DE BOUT EN BOUT avec le mot de passe famille (AES-256 + HMAC,
    /// clé dérivée par PBKDF2) : le serveur ne voit que du charabia.
    /// Chaque famille a son espace (familles/&lt;identité&gt;/…), cloisonné par
    /// le serveur : la tablette se connecte avec l'identité que le serveur lui a
    /// donnée à l'activation de la licence.
    ///   · au démarrage : si le nuage est plus récent, on récupère (on AJOUTE,
    ///     on n'efface jamais un fichier local) ;
    ///   · à la fermeture (et à la demande) : si le contenu a changé, on envoie.
    /// </summary>
    public static class FamilyCloud
    {
        private const string Bucket = "familles";
        private static readonly HttpClient Http = new HttpClient { Timeout = TimeSpan.FromMinutes(6) };

        public static bool Available(Settings s) =>
            Cloud.Configured && s != null && s.LicenceOk && !string.IsNullOrEmpty(s.CloudEmail) && !string.IsNullOrEmpty(s.CloudSecret)
            && !string.IsNullOrEmpty(s.FamilyPassphrase);

        public static string Status = "";

        // ------------------------------------------------------------------
        //  Connexion (identité de la famille, donnée par le serveur)
        // ------------------------------------------------------------------
        private static string _token, _uid;
        private static DateTime _tokenAt = DateTime.MinValue;

        private static async Task SignInAsync(Settings s)
        {
            if (_token != null && (DateTime.UtcNow - _tokenAt).TotalMinutes < 40) return;
            using (var req = new HttpRequestMessage(HttpMethod.Post, Cloud.Url.TrimEnd('/') + "/auth/v1/token?grant_type=password"))
            {
                req.Headers.TryAddWithoutValidation("apikey", Cloud.AnonKey);
                req.Content = new StringContent("{\"email\":\"" + s.CloudEmail + "\",\"password\":\"" + s.CloudSecret.Replace("\"", "\\\"") + "\"}", Encoding.UTF8, "application/json");
                using (var res = await Http.SendAsync(req))
                {
                    var text = await res.Content.ReadAsStringAsync();
                    if (!res.IsSuccessStatusCode) throw new Exception("connexion refusée (" + (int)res.StatusCode + ")");
                    _token = Cloud.JsonGet(text, "access_token");
                    var user = text.IndexOf("\"user\"", StringComparison.Ordinal);
                    _uid = Cloud.JsonGet(user >= 0 ? text.Substring(user) : text, "id");
                    if (string.IsNullOrEmpty(_token) || string.IsNullOrEmpty(_uid)) throw new Exception("réponse de connexion incomplète");
                    _tokenAt = DateTime.UtcNow;
                }
            }
        }

        private static HttpRequestMessage Req(HttpMethod m, string objectPath)
        {
            var req = new HttpRequestMessage(m, Cloud.Url.TrimEnd('/') + "/storage/v1/object/" + Bucket + "/" + _uid + "/" + objectPath);
            req.Headers.TryAddWithoutValidation("apikey", Cloud.AnonKey);
            req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _token);
            return req;
        }

        // ------------------------------------------------------------------
        //  Chiffrement : clé AES et clé HMAC dérivées du mot de passe famille
        // ------------------------------------------------------------------
        private static void Keys(Settings s, out byte[] aesKey, out byte[] macKey)
        {
            var salt = Encoding.UTF8.GetBytes("MPJ-famille:" + Licence.FamilyId(s));
            using (var kdf = new Rfc2898DeriveBytes(s.FamilyPassphrase, salt, 150_000))
            {
                aesKey = kdf.GetBytes(32);
                macKey = kdf.GetBytes(32);
            }
        }

        private static byte[] Encrypt(byte[] plain, byte[] aesKey, byte[] macKey)
        {
            using (var aes = Aes.Create())
            {
                aes.Key = aesKey; aes.GenerateIV();
                byte[] cipher;
                using (var enc = aes.CreateEncryptor()) cipher = enc.TransformFinalBlock(plain, 0, plain.Length);
                var body = new byte[4 + 16 + cipher.Length];
                Encoding.ASCII.GetBytes("MPJ1").CopyTo(body, 0);
                aes.IV.CopyTo(body, 4);
                cipher.CopyTo(body, 20);
                using (var h = new HMACSHA256(macKey))
                {
                    var mac = h.ComputeHash(body);
                    var all = new byte[body.Length + 32];
                    body.CopyTo(all, 0); mac.CopyTo(all, body.Length);
                    return all;
                }
            }
        }

        private static byte[] Decrypt(byte[] all, byte[] aesKey, byte[] macKey)
        {
            if (all.Length < 4 + 16 + 32 || Encoding.ASCII.GetString(all, 0, 4) != "MPJ1") throw new Exception("fichier du nuage inattendu");
            var body = new byte[all.Length - 32];
            Array.Copy(all, body, body.Length);
            using (var h = new HMACSHA256(macKey))
            {
                var mac = h.ComputeHash(body);
                bool same = true;
                for (int i = 0; i < 32; i++) same &= mac[i] == all[body.Length + i];
                if (!same) throw new Exception("mot de passe famille incorrect (ou fichier abîmé)");
            }
            using (var aes = Aes.Create())
            {
                aes.Key = aesKey;
                var iv = new byte[16]; Array.Copy(body, 4, iv, 0, 16); aes.IV = iv;
                using (var dec = aes.CreateDecryptor()) return dec.TransformFinalBlock(body, 20, body.Length - 20);
            }
        }

        // ------------------------------------------------------------------
        //  Empreinte du contenu local : a-t-il changé depuis le dernier envoi ?
        // ------------------------------------------------------------------
        public static string LocalFingerprint()
        {
            try
            {
                var root = UserContent.RootDir;
                var sb = new StringBuilder();
                foreach (var f in Directory.GetFiles(root, "*", SearchOption.AllDirectories).OrderBy(x => x, StringComparer.OrdinalIgnoreCase))
                {
                    var name = Path.GetFileName(f);
                    if (name.StartsWith(".") || name == "journal.txt" || f.Contains("\\MiseAJour\\") || f.Contains("cache")) continue;
                    var fi = new FileInfo(f);
                    sb.Append(f.Substring(root.Length)).Append('|').Append(fi.Length).Append('|').Append(fi.LastWriteTimeUtc.Ticks / 10_000_000).Append('\n');
                }
                using (var sha = SHA256.Create())
                    return BitConverter.ToString(sha.ComputeHash(Encoding.UTF8.GetBytes(sb.ToString()))).Replace("-", "").Substring(0, 24);
            }
            catch { return ""; }
        }

        // ------------------------------------------------------------------
        //  Envoyer / récupérer
        // ------------------------------------------------------------------
        /// <summary>Envoie le contenu local (s'il a changé, ou si force). Renvoie null si OK, sinon le message.</summary>
        public static async Task<string> UploadAsync(Settings s, bool force, Action<string> status = null)
        {
            if (!Available(s)) return "nuage non configuré";
            var fp = LocalFingerprint();
            if (!force && fp == s.CloudLastFingerprint) { Status = "rien de nouveau à envoyer"; return null; }
            var tmp = Path.Combine(Path.GetTempPath(), "mpj-famille.zip");
            try
            {
                status?.Invoke("Préparation du contenu…");
                if (!UserContent.ExportZip(tmp)) return "impossible de préparer le contenu";
                Keys(s, out var k1, out var k2);
                var enc = Encrypt(File.ReadAllBytes(tmp), k1, k2);
                status?.Invoke("Connexion…");
                await SignInAsync(s);
                status?.Invoke("Envoi (" + (enc.Length / 1_048_576.0).ToString("0.0", CultureInfo.InvariantCulture) + " Mo)…");
                using (var req = Req(HttpMethod.Post, "contenu.enc"))
                {
                    req.Headers.TryAddWithoutValidation("x-upsert", "true");
                    req.Content = new ByteArrayContent(enc);
                    req.Content.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");
                    using (var res = await Http.SendAsync(req))
                        if (!res.IsSuccessStatusCode) return "envoi refusé (" + (int)res.StatusCode + ") : " + await res.Content.ReadAsStringAsync();
                }
                var stamp = DateTime.UtcNow.ToString("o");
                var manifest = "{\"version\":1,\"updated_at\":\"" + stamp + "\",\"machine\":\"" + Environment.MachineName.Replace("\"", "") + "\",\"fingerprint\":\"" + fp + "\",\"size\":" + enc.Length + "}";
                using (var req = Req(HttpMethod.Post, "manifest.json"))
                {
                    req.Headers.TryAddWithoutValidation("x-upsert", "true");
                    req.Content = new StringContent(manifest, Encoding.UTF8, "application/json");
                    using (var res = await Http.SendAsync(req))
                        if (!res.IsSuccessStatusCode) return "envoi du manifeste refusé (" + (int)res.StatusCode + ")";
                }
                s.CloudLastFingerprint = fp;
                s.CloudLastSync = stamp;
                s.Save();
                Status = "envoyé le " + DateTime.Now.ToString("dd/MM HH:mm");
                Log.Write("nuage", "Contenu envoyé (" + enc.Length + " octets)");
                return null;
            }
            catch (Exception ex) { Log.Write("nuage", "Envoi : " + ex.Message); return ex.Message; }
            finally { try { File.Delete(tmp); } catch { } }
        }

        /// <summary>Récupère le contenu du nuage s'il est plus récent (ou si force), et l'AJOUTE au contenu local.</summary>
        public static async Task<string> DownloadAsync(Settings s, bool force, Action<string> status = null)
        {
            if (!Available(s)) return "nuage non configuré";
            var tmp = Path.Combine(Path.GetTempPath(), "mpj-famille-recu.zip");
            try
            {
                status?.Invoke("Connexion…");
                await SignInAsync(s);
                string manifest;
                using (var req = Req(HttpMethod.Get, "manifest.json"))
                using (var res = await Http.SendAsync(req))
                {
                    if (res.StatusCode == System.Net.HttpStatusCode.NotFound) { Status = "rien dans le nuage"; return null; }
                    if (!res.IsSuccessStatusCode) return "lecture refusée (" + (int)res.StatusCode + ")";
                    manifest = await res.Content.ReadAsStringAsync();
                }
                var remoteStamp = Cloud.JsonGet(manifest, "updated_at") ?? "";
                var remoteFp = Cloud.JsonGet(manifest, "fingerprint") ?? "";
                if (!force && (remoteFp == s.CloudLastFingerprint || string.CompareOrdinal(remoteStamp, s.CloudLastSync ?? "") <= 0))
                { Status = "à jour"; return null; }

                status?.Invoke("Récupération…");
                byte[] enc;
                using (var req = Req(HttpMethod.Get, "contenu.enc"))
                using (var res = await Http.SendAsync(req))
                {
                    if (!res.IsSuccessStatusCode) return "récupération refusée (" + (int)res.StatusCode + ")";
                    enc = await res.Content.ReadAsByteArrayAsync();
                }
                Keys(s, out var k1, out var k2);
                File.WriteAllBytes(tmp, Decrypt(enc, k1, k2));
                status?.Invoke("Installation du contenu…");
                if (!UserContent.ImportZip(tmp)) return "impossible d'installer le contenu reçu";
                s.CloudLastSync = remoteStamp;
                s.CloudLastFingerprint = LocalFingerprint();
                s.Save();
                Status = "récupéré le " + DateTime.Now.ToString("dd/MM HH:mm");
                Log.Write("nuage", "Contenu récupéré (" + enc.Length + " octets, de " + (Cloud.JsonGet(manifest, "machine") ?? "?") + ")");
                return null;
            }
            catch (Exception ex) { Log.Write("nuage", "Récupération : " + ex.Message); return ex.Message; }
            finally { try { File.Delete(tmp); } catch { } }
        }
    }
}
