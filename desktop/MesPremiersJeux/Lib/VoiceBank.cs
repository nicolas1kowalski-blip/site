using System;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Windows.Media;

namespace MesPremiersJeux.Lib
{
    /// <summary>
    /// LA VOIX DE PAPA ET MAMAN : des petits enregistrements faits dans les
    /// réglages (« Bravo Laura ! », « Bonjour ma chérie ! ») rangés dans
    /// Contenu\Voix (donc synchronisés entre les tablettes). Quand il y en a,
    /// l'application les joue à la place de la voix de synthèse pour les
    /// moments forts — l'impact émotionnel est incomparable.
    /// Enregistrement par MCI (winmm, intégré à Windows) : aucun paquet à
    /// installer.
    /// </summary>
    public static class VoiceBank
    {
        [DllImport("winmm.dll", CharSet = CharSet.Unicode)]
        private static extern int mciSendString(string cmd, StringBuilder ret, int retLen, IntPtr callback);

        public static string Dir => Path.Combine(UserContent.RootDir, "Voix");

        private static MediaPlayer _player;
        private static DateTime _clipUntil = DateTime.MinValue;
        private static readonly Random Rng = new Random();

        /// <summary>Secondes restantes du clip parent en cours (0 = libre).
        /// Speech s'en sert pour attendre la fin avant de parler.</summary>
        public static double RemainingSeconds()
        {
            var left = (_clipUntil - DateTime.Now).TotalSeconds;
            return left > 0 ? left : 0;
        }

        // ------------------------------------------------------------------
        //  Lecture
        // ------------------------------------------------------------------
        public static bool Has(string category) => Files(category).Length > 0;

        public static string[] Files(string category)
        {
            try
            {
                if (!Directory.Exists(Dir)) return Array.Empty<string>();
                return Directory.GetFiles(Dir, category + "-*.wav").OrderBy(f => f).ToArray();
            }
            catch { return Array.Empty<string>(); }
        }

        /// <summary>Joue un clip au hasard de la catégorie (bravo, bonjour…).
        /// Renvoie false s'il n'y en a aucun.</summary>
        public static bool Play(string category)
        {
            var files = Files(category);
            if (files.Length == 0) return false;
            return PlayFile(files[Rng.Next(files.Length)]);
        }

        /// <summary>Le « Bravo ! » de papa/maman (s'il existe) : coupe la
        /// synthèse et parle à sa place ; la synthèse suivante attendra la fin.</summary>
        public static bool PlayPraise() => Has("bravo") && PlayAfterStop("bravo");

        private static bool PlayAfterStop(string category)
        {
            Speech.Stop();
            return Play(category);
        }

        public static bool PlayFile(string path)
        {
            try
            {
                if (_player == null) _player = new MediaPlayer { Volume = 1.0 };
                _player.Stop();
                _player.Open(new Uri(path));
                _player.Play();
                double dur = WavSeconds(path);
                _clipUntil = DateTime.Now.AddSeconds(dur + 0.2);
                Speech.MarkBusy(dur + 0.25); // la synthèse attend la fin du clip
                Speech.ClearGate();          // ... mais un bravo ne bloque pas les clics
                return true;
            }
            catch { return false; }
        }

        private static double WavSeconds(string path)
        {
            try
            {
                var fi = new FileInfo(path);
                using (var fs = fi.OpenRead())
                {
                    var head = new byte[44];
                    fs.Read(head, 0, 44);
                    int byteRate = BitConverter.ToInt32(head, 28);
                    if (byteRate <= 0) return 2.0;
                    return Math.Max(0.3, (fi.Length - 44.0) / byteRate);
                }
            }
            catch { return 2.0; }
        }

        // ------------------------------------------------------------------
        //  Enregistrement (micro Windows via MCI)
        // ------------------------------------------------------------------
        public static bool Recording { get; private set; }

        /// <summary>Démarre l'enregistrement micro. Renvoie null si OK, sinon
        /// le message d'erreur.</summary>
        public static string StartRecording()
        {
            try
            {
                Directory.CreateDirectory(Dir);
                mciSendString("close mpjrec", null, 0, IntPtr.Zero);
                if (mciSendString("open new type waveaudio alias mpjrec", null, 0, IntPtr.Zero) != 0)
                    return "Micro introuvable. Branche un micro et réessaie.";
                mciSendString("set mpjrec bitspersample 16 channels 1 samplespersec 22050", null, 0, IntPtr.Zero);
                if (mciSendString("record mpjrec", null, 0, IntPtr.Zero) != 0)
                {
                    mciSendString("close mpjrec", null, 0, IntPtr.Zero);
                    return "Impossible de démarrer l'enregistrement.";
                }
                Recording = true;
                return null;
            }
            catch (Exception ex) { return ex.Message; }
        }

        /// <summary>Arrête et GARDE l'enregistrement dans la catégorie donnée.
        /// Renvoie le chemin du fichier, ou null si échec.</summary>
        public static string StopRecording(string category)
        {
            try
            {
                if (!Recording) return null;
                Recording = false;
                mciSendString("stop mpjrec", null, 0, IntPtr.Zero);
                int n = 1;
                string path;
                do { path = Path.Combine(Dir, category + "-" + n + ".wav"); n++; }
                while (File.Exists(path));
                int rc = mciSendString("save mpjrec \"" + path + "\"", null, 0, IntPtr.Zero);
                mciSendString("close mpjrec", null, 0, IntPtr.Zero);
                return rc == 0 && File.Exists(path) ? path : null;
            }
            catch { return null; }
        }

        public static void CancelRecording()
        {
            Recording = false;
            try
            {
                mciSendString("stop mpjrec", null, 0, IntPtr.Zero);
                mciSendString("close mpjrec", null, 0, IntPtr.Zero);
            }
            catch { }
        }

        public static void DeleteLast(string category)
        {
            var files = Files(category);
            if (files.Length == 0) return;
            try { File.Delete(files[files.Length - 1]); } catch { }
        }
    }
}
