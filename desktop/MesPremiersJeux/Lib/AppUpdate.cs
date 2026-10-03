using System;
using System.Diagnostics;
using System.IO;
using System.Text;

namespace MesPremiersJeux.Lib
{
    /// <summary>
    /// Mise à jour de l'APPLICATION via le dossier synchronisé (OneDrive…) :
    /// sur la tablette de développement, « Publier l'application » copie les
    /// fichiers du programme dans « MiseAJour » du dossier partagé ; OneDrive
    /// les transporte ; au démarrage, l'autre tablette détecte qu'une version
    /// plus récente est disponible, la propose, l'installe et redémarre.
    /// Aucun serveur, aucune clé USB, rien à recopier.
    /// </summary>
    public static class AppUpdate
    {
        private const string ExeName = "MesPremiersJeux.exe";
        private static string AppDir => AppDomain.CurrentDomain.BaseDirectory;
        public static string UpdateDir => Path.Combine(UserContent.RootDir, "MiseAJour");

        // Dossiers à ne JAMAIS copier avec l'application : le contenu (il vit
        // déjà dans le dossier partagé) et la mise à jour elle-même.
        private static readonly string[] Excluded = { "Contenu", "MiseAJour", "voix-cache", "sons-cache" };

        /// <summary>Copie l'application (cette version) vers le dossier partagé.
        /// Renvoie null si OK, sinon le message d'erreur.</summary>
        public static string Publish()
        {
            try
            {
                Directory.CreateDirectory(UpdateDir);
                CopyDir(AppDir, UpdateDir);
                File.WriteAllText(Path.Combine(UpdateDir, "version.txt"),
                    "Publiée le " + DateTime.Now.ToString("dd/MM/yyyy HH:mm") +
                    " depuis " + Environment.MachineName);
                return null;
            }
            catch (Exception ex) { return ex.Message; }
        }

        /// <summary>Une version plus récente attend-elle dans le dossier partagé ?
        /// (comparaison des dates de l'exécutable, marge de 90 s).</summary>
        public static bool UpdateAvailable()
        {
            try
            {
                var src = Path.Combine(UpdateDir, ExeName);
                var local = Path.Combine(AppDir, ExeName);
                if (!File.Exists(src) || !File.Exists(local)) return false;
                return File.GetLastWriteTimeUtc(src) > File.GetLastWriteTimeUtc(local).AddSeconds(90);
            }
            catch { return false; }
        }

        /// <summary>Description de la version disponible (contenu de version.txt).</summary>
        public static string UpdateInfo()
        {
            try { return File.ReadAllText(Path.Combine(UpdateDir, "version.txt")).Trim(); }
            catch { return ""; }
        }

        /// <summary>
        /// Installe la mise à jour : un petit script attend la fermeture de
        /// l'application, copie les nouveaux fichiers par-dessus (sans toucher
        /// au contenu), puis relance l'application.
        /// </summary>
        public static void ApplyAndRestart()
        {
            var cmd = Path.Combine(Path.GetTempPath(), "mpj-mise-a-jour.cmd");
            var script =
                "@echo off\r\n" +
                "chcp 65001 > nul\r\n" +
                "timeout /t 2 /nobreak > nul\r\n" +
                "robocopy \"" + UpdateDir.TrimEnd('\\') + "\" \"" + AppDir.TrimEnd('\\') + "\"" +
                " /E /XD Contenu MiseAJour /XF version.txt /R:5 /W:2 > nul\r\n" +
                "start \"\" \"" + Path.Combine(AppDir, ExeName) + "\"\r\n" +
                "del \"%~f0\"\r\n";
            File.WriteAllText(cmd, script, new UTF8Encoding(false)); // UTF-8 sans BOM (chcp 65001)

            Process.Start(new ProcessStartInfo
            {
                FileName = cmd,
                WindowStyle = ProcessWindowStyle.Hidden,
                UseShellExecute = true,
            });
            System.Windows.Application.Current.Shutdown();
        }

        private static void CopyDir(string from, string to)
        {
            Directory.CreateDirectory(to);
            foreach (var f in Directory.GetFiles(from))
            {
                try { File.Copy(f, Path.Combine(to, Path.GetFileName(f)), overwrite: true); }
                catch { /* fichier verrouillé : il sera repris à la prochaine publication */ }
            }
            foreach (var d in Directory.GetDirectories(from))
            {
                var name = Path.GetFileName(d);
                bool skip = false;
                foreach (var ex in Excluded)
                    if (string.Equals(name, ex, StringComparison.OrdinalIgnoreCase)) { skip = true; break; }
                if (!skip) CopyDir(d, Path.Combine(to, name));
            }
        }
    }
}
