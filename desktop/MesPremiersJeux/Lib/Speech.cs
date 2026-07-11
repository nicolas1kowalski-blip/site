using System;
using System.Globalization;
using System.Speech.Synthesis;

namespace MesPremiersJeux.Lib
{
    /// <summary>
    /// Voix française (synthèse) pour nommer les couleurs, et un petit « pop »
    /// sonore de validation. Tout est protégé : si aucune voix n'est installée,
    /// l'application continue en silence.
    /// </summary>
    public static class Speech
    {
        private static SpeechSynthesizer _tts;
        private static bool _init;

        private static void Ensure()
        {
            if (_init) return;
            _init = true;
            try
            {
                _tts = new SpeechSynthesizer();
                try { _tts.SelectVoiceByHints(VoiceGender.Female, VoiceAge.Adult, 0, new CultureInfo("fr-FR")); }
                catch { /* voix par défaut */ }
                _tts.Rate = 0;
            }
            catch { _tts = null; }
        }

        public static void Say(string text)
        {
            Ensure();
            if (_tts == null || string.IsNullOrWhiteSpace(text)) return;
            try { _tts.SpeakAsyncCancelAll(); _tts.SpeakAsync(text); } catch { }
        }

        public static void Pop()
        {
            try { System.Media.SystemSounds.Asterisk.Play(); } catch { }
        }
    }
}
