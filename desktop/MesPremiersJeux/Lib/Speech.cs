using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Security;
using System.Speech.Synthesis;

namespace MesPremiersJeux.Lib
{
    /// <summary>
    /// Voix de l'application. La voix est choisie dans les réglages, et une
    /// « hauteur » réglable (prosodie SSML) permet une voix plus aiguë, plus
    /// enfantine et moins robotique. SayPage lit un texte entier en signalant
    /// chaque mot prononcé (pour la lecture suivie).
    /// </summary>
    public static class Speech
    {
        private static SpeechSynthesizer _tts;
        private static bool _init;

        /// <summary>Nom de la voix installée à utiliser (null = voix par défaut).</summary>
        public static string VoiceName;

        /// <summary>Hauteur en % (-20 à +60). +25/+40 ≈ voix d'enfant.</summary>
        public static double Pitch;

        // Lecture de page avec suivi des mots.
        private static Action<int> _onWord;
        private static Action _onDone;
        private static bool _pageMode;
        private static int _wordCount;

        // ------------------------------------------------------------------
        //  « La voix d'abord » : tant qu'une consigne est en train d'être dite,
        //  les jeux d'apprentissage IGNORENT les clics (GameControl s'en sert).
        //  Azure donne la durée exacte du WAV ; la voix Windows est estimée
        //  puis corrigée par son événement de fin.
        // ------------------------------------------------------------------
        private static DateTime _busyUntil = DateTime.MinValue;
        private static DateTime _busyStart = DateTime.MinValue;

        /// <summary>
        /// La voix est-elle en train de parler ? Pour la voix WINDOWS, on
        /// interroge l'état RÉEL du synthétiseur (aucune estimation — c'était
        /// la cause des clics bloqués après la fin de la phrase) ; pour Azure,
        /// la durée exacte du WAV fait foi.
        /// </summary>
        public static bool IsBusy
        {
            get
            {
                if (DateTime.Now < _busyUntil) return true;
                try { return _tts != null && _tts.State == SynthesizerState.Speaking; }
                catch { return false; }
            }
        }

        /// <summary>Depuis combien de secondes la voix parle-t-elle ? (0 si libre)
        /// — permet de ne pas bloquer l'enfant sur les très longues phrases.</summary>
        public static double BusyElapsedSeconds =>
            IsBusy ? (DateTime.Now - _busyStart).TotalSeconds : 0;

        // ------------------------------------------------------------------
        //  Le verrou ne vaut que pour les CONSIGNES : les phrases dites
        //  lentement (SaySlow) et les phrases longues (explications). Les
        //  petits retours (« L ! Bravo ! ») ne bloquent JAMAIS le clic
        //  suivant — sinon, enchaîner les lettres du prénom ne marchait
        //  qu'une fois sur deux.
        // ------------------------------------------------------------------
        private static bool _gate;

        /// <summary>La voix parle ET c'est une consigne à écouter.</summary>
        public static bool IsGating => _gate && IsBusy;

        /// <summary>La phrase en cours ne doit pas bloquer (voix de papa/maman…).</summary>
        public static void ClearGate() => _gate = false;

        /// <summary>Déclare la voix occupée pendant « seconds » (0 = libre).</summary>
        public static void MarkBusy(double seconds)
        {
            if (seconds <= 0) { _busyUntil = DateTime.MinValue; return; }
            if (!IsBusy) _busyStart = DateTime.Now;
            var until = DateTime.Now.AddSeconds(seconds);
            if (until > _busyUntil) _busyUntil = until;
        }

        private static void Ensure()
        {
            if (_init) return;
            _init = true;
            try
            {
                _tts = new SpeechSynthesizer();
                try { _tts.SelectVoiceByHints(VoiceGender.Female, VoiceAge.Adult, 0, new CultureInfo("fr-FR")); }
                catch { }
                try { _defaultVoice = _tts.Voice.Name; } catch { }
                _tts.Rate = 0;
                _tts.SpeakProgress += (s, e) =>
                {
                    if (_pageMode) _onWord?.Invoke(_wordCount++);
                };
                _tts.SpeakCompleted += (s, e) =>
                {
                    // La voix Windows a VRAIMENT fini. (Une annulation — nouvelle
                    // phrase qui en coupe une autre — ne libère pas le verrou :
                    // Azure vient peut-être de le poser pour la suite.)
                    if (!e.Cancelled) _busyUntil = DateTime.MinValue;
                    if (_pageMode)
                    {
                        _pageMode = false;
                        _onDone?.Invoke();
                    }
                };
            }
            catch { _tts = null; }
        }

        /// <summary>Les voix installées sur ce PC (pour le réglage).</summary>
        public static List<string> Voices()
        {
            Ensure();
            try
            {
                return _tts?.GetInstalledVoices()
                    .Where(v => v.Enabled)
                    .Select(v => v.VoiceInfo.Name)
                    .ToList() ?? new List<string>();
            }
            catch { return new List<string>(); }
        }

        private static string _defaultVoice; // la voix française de départ (retour après l'anglais)

        private static void ApplyVoice()
        {
            if (_tts == null) return;
            var want = string.IsNullOrEmpty(VoiceName) ? _defaultVoice : VoiceName;
            if (string.IsNullOrEmpty(want)) return;
            try { if (_tts.Voice.Name != want) _tts.SelectVoice(want); } catch { }
        }

        // ------------------------------------------------------------------
        //  🇬🇧 L'ANGLAIS : voix Azure anglaise (enfant) si configurée, sinon une
        //  voix anglaise installée dans Windows, sinon la voix française qui
        //  lit une écriture « à la française » du mot (hello → « hèlo-ou »).
        // ------------------------------------------------------------------
        private static string _englishVoice; // nom de la voix anglaise locale (ou "" = aucune)

        /// <summary>Comment l'anglais sera dit (pour les réglages / le journal).</summary>
        public static string EnglishMode()
        {
            if (AzureTts.Enabled) return "voix naturelle Azure (anglais)";
            return string.IsNullOrEmpty(FindEnglishVoice()) ? "voix française (à défaut de voix anglaise installée)" : "voix Windows anglaise : " + _englishVoice;
        }

        private static string FindEnglishVoice()
        {
            if (_englishVoice != null) return _englishVoice;
            Ensure();
            _englishVoice = "";
            try
            {
                foreach (var v in _tts.GetInstalledVoices())
                    if (v.Enabled && v.VoiceInfo.Culture.TwoLetterISOLanguageName == "en")
                    {
                        _englishVoice = v.VoiceInfo.Name;
                        if (v.VoiceInfo.Gender == VoiceGender.Female) break; // on préfère une voix féminine
                    }
            }
            catch { }
            return _englishVoice;
        }

        private static bool _englishLogged;

        public static void SayEnglish(string text)
        {
            if (string.IsNullOrWhiteSpace(text) || Hold) return;
            _gate = false; // un mot anglais ne bloque jamais le clic
            if (!_englishLogged) { _englishLogged = true; Log.Write("voix", "Anglais : " + EnglishMode()); }
            // Un enregistrement du parent (Voix\en-<mot>, ex. en-hello, en-where-is-the-cat) passe avant tout.
            var slug = "en-" + System.Text.RegularExpressions.Regex.Replace(text.ToLowerInvariant(), @"[^a-z0-9]+", "-").Trim('-');
            if (VoiceBank.Has(slug)) { LocalStop(); AzureTts.StopPlayback(); VoiceBank.Play(slug); return; }
            if (AzureTts.Enabled)
            {
                LocalStop();
                MarkBusy(2.5); // occupée le temps que l'audio arrive (la durée exacte suivra)
                AzureTts.SpeakLang(text, "en-US", "en-US-AnaNeural", Pitch, () => LocalSayEnglish(text));
                return;
            }
            LocalSayEnglish(text);
        }

        private static void LocalSayEnglish(string text)
        {
            Ensure();
            if (_tts == null) return;
            try
            {
                _pageMode = false;
                _tts.SpeakAsyncCancelAll();
                _tts.Rate = -2; // un peu plus lent : l'enfant découvre les sons
                _busyStart = DateTime.Now;
                var en = FindEnglishVoice();
                if (!string.IsNullOrEmpty(en))
                {
                    try { _tts.SelectVoice(en); } catch { en = ""; }
                }
                if (!string.IsNullOrEmpty(en)) _tts.SpeakAsync(text);
                else { ApplyVoice(); _tts.SpeakAsync(FrenchSpelling(text)); }
            }
            catch { }
        }

        // Écriture « à la française » des mots anglais de l'application, pour
        // la voix française quand aucune voix anglaise n'est disponible.
        private static readonly Dictionary<string, string> EnglishAsFrench = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["hello"] = "hèlo-ou", ["bye-bye"] = "baille baille", ["goodbye"] = "goude baille", ["thank you"] = "sènn kiou",
            ["please"] = "plize", ["yes"] = "yèsse", ["no"] = "no-ou", ["good morning"] = "goude morningue",
            ["cat"] = "kate", ["dog"] = "dogue", ["fish"] = "fiche", ["bird"] = "beurde", ["rabbit"] = "rabite",
            ["cow"] = "kaou", ["pig"] = "pigue", ["duck"] = "deuk", ["frog"] = "frogue", ["lion"] = "laï-onne",
            ["horse"] = "horse", ["sheep"] = "chipe", ["mouse"] = "maouce", ["bear"] = "bère", ["elephant"] = "élifeunte",
            ["monkey"] = "meunki", ["butterfly"] = "beuteurflaï", ["turtle"] = "teurteul",
            ["apple"] = "apeul", ["banana"] = "beunana", ["strawberry"] = "strobéri", ["cake"] = "kéïke", ["milk"] = "milke",
            ["car"] = "kar", ["house"] = "haouce", ["sun"] = "seunne", ["moon"] = "moune", ["star"] = "star",
            ["flower"] = "flaoueur", ["book"] = "bouk", ["ball"] = "bol", ["train"] = "tréïne", ["boat"] = "bo-oute",
            ["red"] = "rède", ["blue"] = "blou", ["yellow"] = "yèlo-ou", ["green"] = "grine", ["pink"] = "pinke", ["orange"] = "orinje",
            ["one"] = "ouanne", ["two"] = "tou", ["three"] = "sri", ["four"] = "for", ["five"] = "faïve",
            ["where is the"] = "ouère ize ze", ["show me"] = "cho-ou mi", ["how many"] = "haou mèni", ["very good"] = "véri goude",
            ["the"] = "ze", ["is"] = "ize", ["it's"] = "itse", ["well done"] = "ouèl deune", ["let's count"] = "lètse kaounte",
            ["good night"] = "goude naïte", ["i love you"] = "aï love you", ["my name is"] = "maï néïme ize",
        };

        private static string FrenchSpelling(string text)
        {
            var t = text;
            foreach (var kv in EnglishAsFrench.OrderByDescending(k => k.Key.Length))
                t = System.Text.RegularExpressions.Regex.Replace(t, @"(?<![\p{L}])" + System.Text.RegularExpressions.Regex.Escape(kv.Key) + @"(?![\p{L}])",
                    kv.Value, System.Text.RegularExpressions.RegexOptions.IgnoreCase);
            return t;
        }

        private static string Ssml(string text)
        {
            var pitch = Math.Max(-20, Math.Min(60, Pitch));
            var sign = pitch >= 0 ? "+" : "";
            return "<speak version=\"1.0\" xmlns=\"http://www.w3.org/2001/10/synthesis\" xml:lang=\"fr-FR\">" +
                   $"<prosody pitch=\"{sign}{pitch.ToString("0", CultureInfo.InvariantCulture)}%\">" +
                   SecurityElement.Escape(text) +
                   "</prosody></speak>";
        }

        /// <summary>Grille de communication ouverte : les JEUX se taisent (seule
        /// la grille parle, via SayAlways).</summary>
        public static bool Hold;

        /// <summary>Parle même quand <see cref="Hold"/> est actif (la grille).</summary>
        public static void SayAlways(string text)
        {
            bool h = Hold;
            Hold = false;
            try { Say(text); } finally { Hold = h; }
        }

        // ------------------------------------------------------------------
        //  Les LETTRES lues comme des CHIFFRES ROMAINS : « iii » devenait
        //  « trois », « IIII » « quatre », « le I » « le un »… On réécrit ces
        //  mots pour que la voix dise bien le son ou le nom de la lettre.
        // ------------------------------------------------------------------
        private static readonly Dictionary<string, string> RomanLetters = new Dictionary<string, string>
        {
            ["I"] = "i", ["V"] = "vé", ["X"] = "ixe", ["L"] = "elle", ["C"] = "cé", ["D"] = "dé", ["M"] = "emme",
        };

        private static readonly System.Text.RegularExpressions.Regex IRun =
            new System.Text.RegularExpressions.Regex(@"(?<![\p{L}'’-])([iI]{2,})(\p{L}*)(?![\p{L}'’-])");

        private static readonly System.Text.RegularExpressions.Regex LoneCap =
            new System.Text.RegularExpressions.Regex(@"(?<![\p{L}'’-])([IVXLCDM])(?![\p{L}'’-])");

        /// <summary>Texte prêt pour la voix : pas de chiffres romains par erreur.</summary>
        public static string Fix(string text)
        {
            if (string.IsNullOrEmpty(text)) return text;
            // « iii », « IIII » (son étiré) → « hiii » (le h est muet) ;
            // « IIIIle » (île étirée) → « iiiile ».
            text = IRun.Replace(text, m => m.Groups[2].Length == 0
                ? "h" + m.Groups[1].Value.ToLowerInvariant()
                : m.Groups[1].Value.ToLowerInvariant() + m.Groups[2].Value);
            // Une lettre majuscule SEULE (« le I », « Trouve le L ») → son nom.
            text = LoneCap.Replace(text, m => RomanLetters[m.Groups[1].Value]);
            return text;
        }

        // ------------------------------------------------------------------
        //  DÉJÀ DIT : une phrase entendue une fois (il y a moins de 2 min) ne
        //  verrouille plus rien — l'enfant la connaît, il peut la couper.
        // ------------------------------------------------------------------
        private static readonly Dictionary<string, DateTime> Heard = new Dictionary<string, DateTime>();

        private static bool AlreadyHeard(string text)
        {
            var now = DateTime.Now;
            bool heard = Heard.TryGetValue(text, out var at) && (now - at).TotalSeconds < 120;
            Heard[text] = now;
            if (Heard.Count > 300)
                foreach (var k in Heard.Where(kv => (now - kv.Value).TotalSeconds > 120).Select(kv => kv.Key).ToList())
                    Heard.Remove(k);
            return heard;
        }

        /// <summary>Attend que la voix se taise (au plus <paramref name="maxSeconds"/>,
        /// et au moins <paramref name="minSeconds"/>), puis agit.</summary>
        public static void WhenQuiet(Action then, double minSeconds = 0, double maxSeconds = 8)
        {
            var start = DateTime.Now;
            var t = new System.Windows.Threading.DispatcherTimer { Interval = TimeSpan.FromMilliseconds(100) };
            t.Tick += (s, e) =>
            {
                double sec = (DateTime.Now - start).TotalSeconds;
                if (sec < minSeconds || (IsBusy && sec < maxSeconds)) return;
                t.Stop();
                then();
            };
            t.Start();
        }

        public static void Say(string text)
        {
            if (string.IsNullOrWhiteSpace(text) || Hold) return;
            text = Fix(text);
            // Seules les phrases LONGUES (consignes, explications) verrouillent
            // les clics ; les petits retours laissent l'enfant enchaîner.
            // Une phrase déjà entendue ne verrouille plus.
            _gate = text.Length >= 60 && !AlreadyHeard(text);

            // Si la voix de papa/maman est en train de parler (VoiceBank), on
            // attend poliment la fin avant de parler à notre tour.
            double wait = VoiceBank.RemainingSeconds();
            if (wait > 0.1)
            {
                var t = new System.Windows.Threading.DispatcherTimer { Interval = TimeSpan.FromSeconds(wait + 0.1) };
                t.Tick += (s, e) => { t.Stop(); Say(text); };
                t.Start();
                return;
            }

            // Voix naturelle Azure si configurée, sinon voix Windows locale.
            if (AzureTts.Enabled)
            {
                LocalStop();
                AzureTts.Speak(text, Pitch, () => LocalSay(text));
                return;
            }
            LocalSay(text);
        }

        /// <summary>
        /// Parle LENTEMENT et distinctement — pour les sons des lettres, que
        /// l'enfant doit bien entendre (débit réduit d'environ un tiers).
        /// </summary>
        public static void SaySlow(string text)
        {
            if (string.IsNullOrWhiteSpace(text) || Hold) return;
            text = Fix(text);
            _gate = !AlreadyHeard(text); // dit lentement = à écouter jusqu'au bout (la 1re fois)
            double wait = VoiceBank.RemainingSeconds();
            if (wait > 0.1)
            {
                var t = new System.Windows.Threading.DispatcherTimer { Interval = TimeSpan.FromSeconds(wait + 0.1) };
                t.Tick += (s, e) => { t.Stop(); SaySlow(text); };
                t.Start();
                return;
            }
            if (AzureTts.Enabled)
            {
                LocalStop();
                AzureTts.SpeakRate(text, Pitch, -35, () => LocalSaySlow(text));
                return;
            }
            LocalSaySlow(text);
        }

        private static void LocalSaySlow(string text)
        {
            Ensure();
            if (_tts == null) return;
            try
            {
                _pageMode = false;
                _tts.SpeakAsyncCancelAll();
                ApplyVoice();
                _tts.Rate = -4; // nettement plus lent (LocalSay remet 0)
                _busyStart = DateTime.Now; // l'état réel du synthétiseur fait foi
                if (Math.Abs(Pitch) < 1) _tts.SpeakAsync(text);
                else
                {
                    try { _tts.SpeakSsmlAsync(Ssml(text)); }
                    catch { _tts.SpeakAsync(text); }
                }
            }
            catch { }
        }

        private static void LocalStop()
        {
            try { _pageMode = false; _tts?.SpeakAsyncCancelAll(); } catch { }
        }

        private static void LocalSay(string text)
        {
            Ensure();
            if (_tts == null) return;
            try
            {
                _pageMode = false;
                _tts.SpeakAsyncCancelAll();
                ApplyVoice();
                _tts.Rate = 0; // débit normal (SaySlow l'a peut-être ralenti)
                _busyStart = DateTime.Now; // l'état réel du synthétiseur fait foi
                if (Math.Abs(Pitch) < 1)
                {
                    _tts.SpeakAsync(text);
                }
                else
                {
                    // Certaines voix n'acceptent pas la prosodie : on parle quand même.
                    try { _tts.SpeakSsmlAsync(Ssml(text)); }
                    catch { _tts.SpeakAsync(text); }
                }
            }
            catch { }
        }

        /// <summary>
        /// Lit un texte entier ; onWord est appelé à chaque mot prononcé (0, 1, 2…)
        /// et onDone à la fin. Utilisé pour l'« histoire racontée » synchronisée.
        /// </summary>
        public static void SayPage(string text, Action<int> onWord, Action onDone)
        {
            if (string.IsNullOrWhiteSpace(text)) { onDone?.Invoke(); return; }

            if (AzureTts.Enabled)
            {
                LocalStop();
                AzureTts.SpeakPage(text, Pitch, onWord, onDone,
                    () => LocalSayPage(text, onWord, onDone));
                return;
            }
            LocalSayPage(text, onWord, onDone);
        }

        private static void LocalSayPage(string text, Action<int> onWord, Action onDone)
        {
            Ensure();
            if (_tts == null) { onDone?.Invoke(); return; }
            try
            {
                _tts.SpeakAsyncCancelAll();
                ApplyVoice();
                _onWord = onWord;
                _onDone = onDone;
                _wordCount = 0;
                _pageMode = true;
                if (Math.Abs(Pitch) < 1) _tts.SpeakAsync(text);
                else _tts.SpeakSsmlAsync(Ssml(text));
            }
            catch { _pageMode = false; onDone?.Invoke(); }
        }

        public static void Stop()
        {
            AzureTts.StopPlayback();
            LocalStop();
            MarkBusy(0);
        }

        public static void Pop()
        {
            try { System.Media.SystemSounds.Asterisk.Play(); } catch { }
        }
    }
}
