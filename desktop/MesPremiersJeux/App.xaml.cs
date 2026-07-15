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
            base.OnStartup(e);
        }

        protected override void OnExit(ExitEventArgs e)
        {
            try { _single?.ReleaseMutex(); _single?.Dispose(); } catch { }
            base.OnExit(e);
        }
    }
}
