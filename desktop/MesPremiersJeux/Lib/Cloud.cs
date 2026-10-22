using System;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Threading.Tasks;

namespace MesPremiersJeux.Lib
{
    /// <summary>
    /// ☁ LE NUAGE DE L'APPLICATION (Supabase) : licences, et plus tard l'espace
    /// chiffré de chaque famille. L'adresse et la clé « anon » sont PUBLIQUES
    /// par conception (le cloisonnement se fait côté serveur, par les règles
    /// RLS) ; elles sont embarquées ici, et un réglage peut les remplacer.
    /// </summary>
    public static class Cloud
    {
        // À remplir avec le projet Supabase de l'application (réglages : SupabaseUrl / SupabaseKey en priorité).
        public const string DefaultUrl = "";
        public const string DefaultAnonKey = "";

        public static string Url = DefaultUrl;
        public static string AnonKey = DefaultAnonKey;

        public static bool Configured => !string.IsNullOrWhiteSpace(Url) && !string.IsNullOrWhiteSpace(AnonKey);

        private static readonly HttpClient Http = new HttpClient { Timeout = TimeSpan.FromSeconds(20) };

        /// <summary>Appelle une fonction SQL (rpc) et renvoie le JSON brut.</summary>
        public static async Task<string> RpcAsync(string function, string jsonBody)
        {
            using (var req = new HttpRequestMessage(HttpMethod.Post, Url.TrimEnd('/') + "/rest/v1/rpc/" + function))
            {
                req.Headers.TryAddWithoutValidation("apikey", AnonKey);
                req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", AnonKey);
                req.Content = new StringContent(jsonBody, Encoding.UTF8, "application/json");
                using (var res = await Http.SendAsync(req))
                {
                    var text = await res.Content.ReadAsStringAsync();
                    if (!res.IsSuccessStatusCode) throw new Exception("serveur " + (int)res.StatusCode + " : " + Shorten(text));
                    return text;
                }
            }
        }

        private static string Shorten(string s) => s.Length > 200 ? s.Substring(0, 200) + "…" : s;

        /// <summary>Lecture d'une valeur simple dans un petit JSON plat ("clé":"valeur" / nombre / bool / null).</summary>
        public static string JsonGet(string json, string key)
        {
            if (json == null) return null;
            var m = System.Text.RegularExpressions.Regex.Match(json, "\"" + System.Text.RegularExpressions.Regex.Escape(key) + "\"\\s*:\\s*(\"((?:[^\"\\\\]|\\\\.)*)\"|[^,}\\]]+)");
            if (!m.Success) return null;
            if (m.Groups[2].Success) return System.Text.RegularExpressions.Regex.Unescape(m.Groups[2].Value);
            var v = m.Groups[1].Value.Trim();
            return v == "null" ? null : v;
        }
    }
}
