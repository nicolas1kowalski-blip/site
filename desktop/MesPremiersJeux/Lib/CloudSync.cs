using System;
using System.IO;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Threading.Tasks;

namespace MesPremiersJeux.Lib
{
    /// <summary>
    /// Sauvegarde en ligne du contenu via Supabase Storage (même technologie que
    /// l'ancienne application web, sans site à maintenir) : tout le contenu est
    /// envoyé/récupéré sous forme d'une archive « contenu.zip » dans un bucket.
    /// </summary>
    public static class CloudSync
    {
        public static string Url = "";   // ex. https://xxxx.supabase.co
        public static string Key = "";   // clé du projet (service_role ou anon)

        private const string Bucket = "contenu";
        private const string ObjectName = "contenu.zip";

        public static bool Enabled =>
            !string.IsNullOrWhiteSpace(Url) && !string.IsNullOrWhiteSpace(Key);

        private static readonly HttpClient Http = new HttpClient { Timeout = TimeSpan.FromMinutes(4) };

        private static string ObjectUrl =>
            Url.TrimEnd('/') + "/storage/v1/object/" + Bucket + "/" + ObjectName;

        private static void AddAuth(HttpRequestMessage req)
        {
            req.Headers.TryAddWithoutValidation("apikey", Key);
            req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", Key);
        }

        /// <summary>Exporte tout le contenu et l'envoie dans le nuage. Renvoie null si OK, sinon l'erreur.</summary>
        public static async Task<string> UploadAsync()
        {
            var tmp = Path.Combine(Path.GetTempPath(), "mpj-sauvegarde.zip");
            try
            {
                if (!UserContent.ExportZip(tmp)) return "Impossible de préparer l'archive.";

                using (var req = new HttpRequestMessage(HttpMethod.Post, ObjectUrl))
                {
                    AddAuth(req);
                    req.Headers.TryAddWithoutValidation("x-upsert", "true");
                    req.Content = new ByteArrayContent(File.ReadAllBytes(tmp));
                    req.Content.Headers.ContentType = new MediaTypeHeaderValue("application/zip");

                    var resp = await Http.SendAsync(req);
                    if (!resp.IsSuccessStatusCode)
                        return "Le serveur a répondu : " + (int)resp.StatusCode + " " + resp.ReasonPhrase;
                }
                return null;
            }
            catch (Exception ex) { return ex.Message; }
            finally { try { File.Delete(tmp); } catch { } }
        }

        /// <summary>Récupère le contenu du nuage et le recharge. Renvoie null si OK, sinon l'erreur.</summary>
        public static async Task<string> DownloadAsync()
        {
            var tmp = Path.Combine(Path.GetTempPath(), "mpj-restauration.zip");
            try
            {
                using (var req = new HttpRequestMessage(HttpMethod.Get, ObjectUrl))
                {
                    AddAuth(req);
                    var resp = await Http.SendAsync(req);
                    if (!resp.IsSuccessStatusCode)
                        return "Le serveur a répondu : " + (int)resp.StatusCode + " " + resp.ReasonPhrase;
                    File.WriteAllBytes(tmp, await resp.Content.ReadAsByteArrayAsync());
                }
                return UserContent.ImportZip(tmp) ? null : "Archive reçue mais impossible à lire.";
            }
            catch (Exception ex) { return ex.Message; }
            finally { try { File.Delete(tmp); } catch { } }
        }
    }
}
