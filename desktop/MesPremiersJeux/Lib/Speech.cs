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

        private static void Ensure()
        {
            if (_init) return;
            _init = true;
            try
            {
                _tts = new SpeechSynthesizer();
                try { _tts.SelectVoiceByHints(VoiceGender.Female, VoiceAge.Adult, 0, new CultureInfo("fr-FR")); }
                catch { }
                _tts.Rate = 0;
                _tts.SpeakProgress += (s, e) =>
                {
                    if (_pageMode) _onWord?.Invoke(_wordCount++);
                };
                _tts.SpeakCompleted += (s, e) =>
                {
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

        private static void ApplyVoice()
        {
            if (_tts == null || string.IsNullOrEmpty(VoiceName)) return;
            try { if (_tts.Voice.Name != VoiceName) _tts.SelectVoice(VoiceName); } catch { }
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

        public static void Say(string text)
        {
            if (string.IsNullOrWhiteSpace(text)) return;

            // Voix naturelle Azure si configurée, sinon voix Windows locale.
            if (AzureTts.Enabled)
            {
                LocalStop();
                AzureTts.Speak(text, Pitch, () => LocalSay(text));
                return;
            }
            LocalSay(text);
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
        }

        public static void Pop()
        {
            try { System.Media.SystemSounds.Asterisk.Play(); } catch { }
        }
    }
}
