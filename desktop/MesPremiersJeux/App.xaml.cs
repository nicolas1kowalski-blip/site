using System;
using System.Threading;
using System.Windows;

namespace MesPremiersJeux
{
    public partial class App : Application
    {
        private Mutex _single;

        protected override void OnStartup(StartupEventArgs e)
        {
            // INSTANCE UNIQUE : plusieurs exemplaires simultanés = plusieurs moteurs
            // de regard qui injectent chacun leurs clics (chaos observé au journal).
            // Si l'application tourne déjà, ce nouvel exemplaire se ferme sans bruit.
            _single = new Mutex(true, @"Local\MesPremiersJeux-instance-unique", out bool isNew);
            if (!isNew)
            {
                Lib.Log.Write("app", "Instance déjà en cours : ce double se ferme.");
                Shutdown();
                return;
            }

            Lib.Log.Write("app", $"PID {System.Diagnostics.Process.GetCurrentProcess().Id} — instance unique acquise");

            // 🛟 JAMAIS DE FERMETURE MUETTE : toute erreur imprévue est écrite dans
            // le journal (avec l'endroit exact dans le code) et dans un fichier
            // plantage-<tablette>.txt du dossier Contenu. Une erreur sur le fil
            // d'affichage est AVALÉE : l'application reste ouverte pour l'enfant.
            DispatcherUnhandledException += (s, ex) =>
            {
                Crash("fil d'affichage", ex.Exception);
                ex.Handled = true;
            };
            AppDomain.CurrentDomain.UnhandledException += (s, ex) =>
                Crash("fil de fond" + (ex.IsTerminating ? " — FATAL, l'application se ferme" : ""), ex.ExceptionObject as Exception);
            System.Threading.Tasks.TaskScheduler.UnobservedTaskException += (s, ex) =>
            {
                Crash("tâche", ex.Exception);
                ex.SetObserved();
            };

            base.OnStartup(e);
        }

        private static int _crashes;

        private static void Crash(string where, Exception ex)
        {
            try
            {
                _crashes++;
                var text = "ERREUR IMPRÉVUE (" + where + ") n°" + _crashes + " : " + (ex?.ToString() ?? "(inconnue)");
                Lib.Log.Write("plantage", text);
                var dir = Lib.UserContent.RootDir;
                var path = System.IO.Path.Combine(dir, "plantage-" + Environment.MachineName + ".txt");
                System.IO.File.AppendAllText(path, DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + "  " + text + "\r\n\r\n");
            }
            catch { }
            // Trop d'erreurs d'affilée : quelque chose est vraiment cassé, on le dit.
            if (_crashes == 1 || _crashes % 10 == 0)
            {
                try { Lib.Speech.Say("Oups, petit souci, mais on continue !"); } catch { }
            }
        }

        protected override void OnExit(ExitEventArgs e)
        {
            try { _single?.ReleaseMutex(); _single?.Dispose(); } catch { }
            base.OnExit(e);
        }
    }
}
