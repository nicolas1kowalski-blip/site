using System;
using System.Runtime.InteropServices;
using System.Windows;
using MesPremiersJeux.Gaze;

namespace MesPremiersJeux.Lib
{
    /// <summary>
    /// Bilan de la session en cours : carte de chaleur (où l'enfant a regardé),
    /// temps de regard actif, sélections, étoiles gagnées. Alimenté par le flux
    /// partagé — à montrer aux thérapeutes ou pour suivre les progrès.
    /// </summary>
    public static class SessionLog
    {
        public const int GW = 48, GH = 27; // grille de chaleur (16:9)

        private static readonly double[,] Heat = new double[GW, GH];
        private static double _activeSec;
        private static DateTime _lastValid = DateTime.MinValue;
        private static int _starsStart = -1;
        private static bool _init;

        public static DateTime Started { get; private set; } = DateTime.Now;
        public static int Clicks;

        [DllImport("user32.dll")]
        private static extern int GetSystemMetrics(int index);

        public static void Init()
        {
            if (_init) return;
            _init = true;
            RewardStore.Load();
            _starsStart = RewardStore.Today;
            GazeFeed.Sample += OnSample;
        }

        private static void OnSample(Point p, bool valid)
        {
            var now = DateTime.Now;
            if (valid && _lastValid != DateTime.MinValue)
            {
                double dt = (now - _lastValid).TotalSeconds;
                if (dt < 0.5) _activeSec += dt; // regard réellement présent
            }
            if (!valid) { _lastValid = DateTime.MinValue; return; }
            _lastValid = now;

            double w = GetSystemMetrics(0), h = GetSystemMetrics(1);
            if (w <= 0 || h <= 0) return;
            int gx = (int)(p.X / w * GW), gy = (int)(p.Y / h * GH);
            if (gx < 0) gx = 0; if (gx >= GW) gx = GW - 1;
            if (gy < 0) gy = 0; if (gy >= GH) gy = GH - 1;
            Heat[gx, gy] += 1;
        }

        public static double[,] Snapshot()
        {
            var copy = new double[GW, GH];
            Array.Copy(Heat, copy, Heat.Length);
            return copy;
        }

        public static TimeSpan Duration => DateTime.Now - Started;
        public static double ActiveMinutes => _activeSec / 60.0;
        public static int StarsGained => _starsStart < 0 ? 0 : Math.Max(0, RewardStore.Today - _starsStart);

        public static void Reset()
        {
            Array.Clear(Heat, 0, Heat.Length);
            _activeSec = 0;
            Started = DateTime.Now;
            Clicks = 0;
            _starsStart = RewardStore.Today;
        }
    }
}
