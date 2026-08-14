using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Media;
using System.Net.Http;
using System.Security;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Threading;

namespace MesPremiersJeux.Lib
{
    /// <summary>
    /// Voix naturelles Azure Speech (neuronales, dont Eloise : voix d'enfant
    /// française). L'audio est demandé en WAV via l'API REST, mis en cache sur le
    /// disque (les phrases répétées ne consomment plus de quota), puis joué.
    /// En cas d'erreur (pas d'internet, mauvaise clé), l'appelant bascule sur la
    /// voix Windows locale.
    /// </summary>
    public static class AzureTts
    {
        public static string Key = "";
        public static string Region = "francecentral";
        public static string Voice = "fr-FR-EloiseNeural";

        public static bool Enabled => !string.IsNullOrWhiteSpace(Key);

        /// <summary>Voix françaises proposées (affichage → nom technique).</summary>
        public static readonly (string Label, string Name)[] Voices =
        {
            ("Eloise (enfant)",        "fr-FR-EloiseNeural"),
            ("Denise (femme)",         "fr-FR-DeniseNeural"),
            ("Vivienne (femme)",       "fr-FR-VivienneMultilingualNeural"),
            ("Brigitte (femme)",       "fr-FR-BrigitteNeural"),
            ("Coralie (femme)",        "fr-FR-CoralieNeural"),
            ("Jacqueline (femme)",     "fr-FR-JacquelineNeural"),
            ("Henri (homme)",          "fr-FR-HenriNeural"),
            ("Rémy (homme)",           "fr-FR-RemyMultilingualNeural"),
            ("Yves (homme)",           "fr-FR-YvesNeural"),
        };

        private static readonly HttpClient Http = new HttpClient();
        private static SoundPlayer _player;
        private static DispatcherTimer _wordTimer;
        private static Stopwatch _playClock;

        private static string CacheDir => Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "MesPremiersJeux", "voix-cache");

        // ------------------------------------------------------------------
        // Lecture simple
        // ------------------------------------------------------------------
        public static async void Speak(string text, double pitch, Action onFail)
        {
            try
            {
                var file = await GetAudio(text, pitch);
                StopPlayback();
                _player = new SoundPlayer(file);
                _player.Play();
            }
            catch { onFail?.Invoke(); }
        }

        // ------------------------------------------------------------------
        // Lecture d'une page avec suivi des mots (temps estimés sur la durée
        // réelle de l'audio, pondérés par la longueur des mots).
        // ------------------------------------------------------------------
        public static async void SpeakPage(string text, double pitch, Action<int> onWord, Action onDone, Action onFail)
        {
            try
            {
                var file = await GetAudio(text, pitch);
                double duration = WavDurationSeconds(file);

                var words = text.Split(' ').Where(t => t.Any(char.IsLetterOrDigit)).ToList();
                var times = new List<double>();
                double totalWeight = words.Sum(w => w.Length + 2.0);
                double cum = 0;
                foreach (var w in words)
                {
                    times.Add(duration * (cum / totalWeight));
                    cum += w.Length + 2.0;
                }

                StopPlayback();
                _player = new SoundPlayer(file);
                _player.Play();
                _playClock = Stopwatch.StartNew();

                int next = 0;
                _wordTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(40) };
                _wordTimer.Tick += (s, e) =>
                {
                    double t = _playClock.Elapsed.TotalSeconds;
                    while (next < times.Count && t >= times[next]) onWord?.Invoke(next++);
                    if (t >= duration + 0.15)
                    {
                        _wordTimer.Stop();
                        onDone?.Invoke();
                    }
                };
                _wordTimer.Start();
            }
            catch { onFail?.Invoke(); }
        }

        public static void StopPlayback()
        {
            try { _wordTimer?.Stop(); } catch { }
            try { _player?.Stop(); } catch { }
        }

        // ------------------------------------------------------------------
        // Récupération de l'audio (cache disque, sinon API REST Azure)
        // ------------------------------------------------------------------
        private static async Task<string> GetAudio(string text, double pitch)
        {
            Directory.CreateDirectory(CacheDir);
            var keyText = Voice + "|" + (int)pitch + "|" + text;
            string hash;
            using (var sha = SHA1.Create())
                hash = BitConverter.ToString(sha.ComputeHash(Encoding.UTF8.GetBytes(keyText))).Replace("-", "");
            var path = Path.Combine(CacheDir, hash + ".wav");
            if (File.Exists(path)) return path;

            var sign = pitch >= 0 ? "+" : "";
            var ssml =
                "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='fr-FR'>" +
                $"<voice name='{Voice}'>" +
                $"<prosody pitch='{sign}{(int)pitch}%'>" +
                SecurityElement.Escape(text) +
                "</prosody></voice></speak>";

            using (var req = new HttpRequestMessage(HttpMethod.Post,
                       $"https://{Region}.tts.speech.microsoft.com/cognitiveservices/v1"))
            {
                req.Headers.Add("Ocp-Apim-Subscription-Key", Key);
                req.Headers.Add("X-Microsoft-OutputFormat", "riff-24khz-16bit-mono-pcm");
                req.Headers.Add("User-Agent", "MesPremiersJeux");
                req.Content = new StringContent(ssml, Encoding.UTF8, "application/ssml+xml");

                var resp = await Http.SendAsync(req);
                resp.EnsureSuccessStatusCode();
                var bytes = await resp.Content.ReadAsByteArrayAsync();
                File.WriteAllBytes(path, bytes);
            }
            return path;
        }

        // Durée d'un WAV 24 kHz 16 bits mono (48 000 octets par seconde).
        private static double WavDurationSeconds(string path)
        {
            var len = new FileInfo(path).Length - 44; // en-tête RIFF standard
            return Math.Max(0.1, len / 48000.0);
        }
    }
}
