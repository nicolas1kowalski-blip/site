using System;
using System.IO;

namespace MesPremiersJeux.Lib
{
    /// <summary>
    /// Journal de diagnostic : chaque étape de la chaîne du regard (SDK, tracker,
    /// flux, moteur) écrit une ligne horodatée dans « journal.txt » à côté de
    /// l'application (repli : %AppData%\MesPremiersJeux). Pensé pour être envoyé
    /// tel quel afin d'identifier précisément où ça casse.
    /// </summary>
    public static class Log
    {
        private static readonly object Lock = new object();
        private static string _path;

        public static string FilePath
        {
            get { if (_path == null) Init(); return _path; }
        }

        private static void Init()
        {
            // Essaie à côté de l'exe (portable), sinon AppData.
            var exeDir = AppDomain.CurrentDomain.BaseDirectory;
            var candidate = Path.Combine(exeDir, "journal.txt");
            try
            {
                File.AppendAllText(candidate, "");
                _path = candidate;
            }
            catch
            {
                var dir = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "MesPremiersJeux");
                try { Directory.CreateDirectory(dir); } catch { }
                _path = Path.Combine(dir, "journal.txt");
            }

            try
            {
                // Nouveau démarrage : on repart d'un fichier frais s'il devient gros.
                if (File.Exists(_path) && new FileInfo(_path).Length > 2_000_000) File.Delete(_path);
            }
            catch { }

            Write("app", $"===== DÉMARRAGE {DateTime.Now:yyyy-MM-dd HH:mm:ss} =====");
            try
            {
                Write("app", $"OS {Environment.OSVersion} · 64bits={Environment.Is64BitProcess}");
                Write("app", $"Écran px physiques : {NativeW()}x{NativeH()} · WPF DIP : "
                             + $"{System.Windows.SystemParameters.PrimaryScreenWidth:0}x{System.Windows.SystemParameters.PrimaryScreenHeight:0}");
            }
            catch { }
        }

        [System.Runtime.InteropServices.DllImport("user32.dll")]
        private static extern int GetSystemMetrics(int i);
        private static int NativeW() => GetSystemMetrics(0);
        private static int NativeH() => GetSystemMetrics(1);

        /// <summary>Écrit une ligne « HH:mm:ss.fff [tag] message ». Ne jette jamais.</summary>
        public static void Write(string tag, string msg)
        {
            try
            {
                lock (Lock)
                    File.AppendAllText(FilePath, $"{DateTime.Now:HH:mm:ss.fff} [{tag}] {msg}\r\n");
            }
            catch { }
        }

        /// <summary>Ouvre le journal dans l'application par défaut (Bloc-notes).</summary>
        public static void Open()
        {
            try { System.Diagnostics.Process.Start(FilePath); } catch { }
        }
    }
}
