using System;
using System.Linq;
using System.Runtime.InteropServices;
using System.Threading;
using Tobii.Research;

namespace MesPremiersJeux.Gaze
{
    /// <summary>
    /// Accès DIRECT au tracker via le Tobii Pro SDK (Tobii.Research) : flux de
    /// regard brut (par œil, avec validité) et position des yeux dans la boîte de
    /// suivi — sans passer par le curseur ni par TD Control. Si aucun tracker
    /// n'est visible par le Pro SDK (cas probable sur les appareils grand
    /// public / AAC non licenciés « Pro »), la source reste simplement inactive.
    /// </summary>
    public sealed class ProGazeSource : IEyeStream, IDisposable
    {
        private IEyeTracker _tracker;
        private bool _disposed;
        private volatile bool _guideSeen; // le flux « guide de positionnement » émet

        /// <summary>Vrai si un tracker a été trouvé et que le flux est actif.</summary>
        public bool IsAvailable { get; private set; }

        /// <summary>Nom de l'appareil connecté (ex. « Tobii Pro Spark »).</summary>
        public string DeviceName { get; private set; } = "";

        /// <summary>Point de regard en pixels écran (thread SDK).</summary>
        public event Action<GazePoint> Gaze;

        /// <summary>Position des yeux dans la boîte de suivi (thread SDK).</summary>
        public event Action<EyeSample> Eyes;

        /// <summary>Levé une fois quand un tracker est trouvé (thread de recherche).</summary>
        public event Action<string> Connected;

        [DllImport("user32.dll")]
        private static extern int GetSystemMetrics(int index);

        public void Start()
        {
            // La découverte peut prendre 1 à 2 s : on la fait en arrière-plan.
            try
            {
                var th = new Thread(Find) { IsBackground = true, Name = "TobiiPro-Find" };
                th.Start();
            }
            catch { }
        }

        private void Find()
        {
            try
            {
                var all = EyeTrackingOperations.FindAllEyeTrackers();
                _tracker = all?.FirstOrDefault();
                if (_tracker == null || _disposed) return;

                DeviceName = string.IsNullOrWhiteSpace(_tracker.DeviceName)
                    ? _tracker.Model.ToString()
                    : _tracker.DeviceName;

                _tracker.GazeDataReceived += OnGazeData;
                // Flux dédié au POSITIONNEMENT (fenêtre « Position des yeux ») :
                // plus fiable que GazeOrigin sur certains trackers.
                try { _tracker.UserPositionGuideReceived += OnGuide; } catch { }
                IsAvailable = true;
                Connected?.Invoke(DeviceName);
            }
            catch
            {
                // Pro SDK absent / aucun tracker compatible : on reste inactif.
                IsAvailable = false;
            }
        }

        private void OnGazeData(object sender, GazeDataEventArgs e)
        {
            try
            {
                bool lv = e.LeftEye.GazePoint.Validity == Validity.Valid;
                bool rv = e.RightEye.GazePoint.Validity == Validity.Valid;

                // Point de regard : moyenne des yeux valides, converti en pixels.
                double nx = 0, ny = 0;
                int n = 0;
                if (lv && Ok(e.LeftEye.GazePoint.PositionOnDisplayArea.X, e.LeftEye.GazePoint.PositionOnDisplayArea.Y))
                { nx += e.LeftEye.GazePoint.PositionOnDisplayArea.X; ny += e.LeftEye.GazePoint.PositionOnDisplayArea.Y; n++; }
                if (rv && Ok(e.RightEye.GazePoint.PositionOnDisplayArea.X, e.RightEye.GazePoint.PositionOnDisplayArea.Y))
                { nx += e.RightEye.GazePoint.PositionOnDisplayArea.X; ny += e.RightEye.GazePoint.PositionOnDisplayArea.Y; n++; }
                if (n > 0)
                {
                    double w = GetSystemMetrics(0), h = GetSystemMetrics(1); // écran principal (px)
                    Gaze?.Invoke(new GazePoint(nx / n * w, ny / n * h));
                }

                // Position des yeux via GazeOrigin — seulement si le flux « guide »
                // n'émet pas (sinon c'est lui qui fait foi).
                if (!_guideSeen)
                {
                    bool lo = e.LeftEye.GazeOrigin.Validity == Validity.Valid;
                    bool ro = e.RightEye.GazeOrigin.Validity == Validity.Valid;
                    var lp = e.LeftEye.GazeOrigin.PositionInTrackBoxCoordinates;
                    var rp = e.RightEye.GazeOrigin.PositionInTrackBoxCoordinates;
                    Eyes?.Invoke(new EyeSample
                    {
                        HasLeft = lo && Ok(lp.X, lp.Y),
                        HasRight = ro && Ok(rp.X, rp.Y),
                        LX = lp.X, LY = lp.Y, LZ = lp.Z,
                        RX = rp.X, RY = rp.Y, RZ = rp.Z,
                    });
                }
            }
            catch { }
        }

        // Guide de positionnement : position normalisée de chaque œil (0..1),
        // pensé par Tobii précisément pour les écrans « placez-vous bien ».
        private void OnGuide(object sender, UserPositionGuideEventArgs e)
        {
            try
            {
                _guideSeen = true;
                var lp = e.LeftEye.UserPosition;
                var rp = e.RightEye.UserPosition;
                bool lv = e.LeftEye.Validity == Validity.Valid && Ok(lp.X, lp.Y);
                bool rv = e.RightEye.Validity == Validity.Valid && Ok(rp.X, rp.Y);
                Eyes?.Invoke(new EyeSample
                {
                    HasLeft = lv,
                    HasRight = rv,
                    LX = lp.X, LY = lp.Y, LZ = lp.Z,
                    RX = rp.X, RY = rp.Y, RZ = rp.Z,
                });
            }
            catch { }
        }

        private static bool Ok(double x, double y) => !double.IsNaN(x) && !double.IsNaN(y);

        public void Dispose()
        {
            _disposed = true;
            try
            {
                if (_tracker != null)
                {
                    _tracker.GazeDataReceived -= OnGazeData;
                    try { _tracker.UserPositionGuideReceived -= OnGuide; } catch { }
                }
                EyeTrackingOperations.Terminate();
            }
            catch { }
            _tracker = null;
            IsAvailable = false;
        }
    }
}
