using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Threading;

namespace MesPremiersJeux.Gaze
{
    /// <summary>
    /// Regard direct par le « Stream Engine » de Tobii : le moteur de plus bas
    /// niveau, celui qu'emploient les logiciels de communication comme Grid 3.
    /// Sur certaines tablettes (ex. PCEye 5), c'est la seule porte ouverte : le
    /// SDK grand public ne reçoit rien et le Pro SDK ne donne que la position
    /// des yeux. Si le moteur refuse (licence, appareil absent), la source reste
    /// inactive et le dit dans le journal.
    /// </summary>
    public sealed class StreamEngineSource : IEyeStream, IDisposable
    {
        public bool IsAvailable { get; private set; }

        /// <summary>Points de regard en pixels écran (hors thread UI).</summary>
        public event Action<GazePoint> Gaze;

        /// <summary>Présence : un point valide vient d'arriver (ou non).</summary>
        public event Action<bool> Presence;

        // Pas de position des yeux ici (interface commune) — jamais levé.
        public event Action<EyeSample> Eyes { add { } remove { } }

        private long _events, _valid;

        /// <summary>Diagnostic : « points valides / reçus ».</summary>
        public string Stats => _valid + "/" + _events;

        public bool HasGaze => _valid > 0;

        /// <summary>Échantillons reçus (valides ou non) : le flux est-il vivant ?</summary>
        public long Events => _events;

        /// <summary>Dernière étape atteinte ou erreur (pour le rapport).</summary>
        public string Status { get; private set; } = "non démarré";

        private IntPtr _api, _device;
        private Thread _thread;
        private volatile bool _running;
        private GazeCallback _callback; // gardé en vie : appelé depuis le code natif

        public void Start()
        {
            _running = true;
            _thread = new Thread(Run) { IsBackground = true, Name = "Tobii Stream Engine" };
            _thread.Start();
        }

        private void Run()
        {
            try
            {
                try
                {
                    if (tobii_get_api_version(out var v) == Err.NoError)
                        Lib.Log.Write("stream", $"Stream Engine version {v.Major}.{v.Minor}.{v.Revision}.{v.Build}");
                }
                catch { }
                var err = tobii_api_create(out _api, IntPtr.Zero, IntPtr.Zero);
                if (err != Err.NoError) { Fail("création de l'API : " + err); return; }

                var urls = new List<string>();
                UrlReceiver receiver = (url, data) => urls.Add(url);
                err = tobii_enumerate_local_device_urls(_api, receiver, IntPtr.Zero);
                GC.KeepAlive(receiver);
                if (err != Err.NoError) { Fail("liste des appareils : " + err); return; }
                Lib.Log.Write("stream", "Appareils trouvés : " + (urls.Count == 0 ? "aucun" : string.Join(", ", urls)));
                if (urls.Count == 0) { Fail("aucun eye-tracker visible par le Stream Engine"); return; }

                err = tobii_device_create(_api, urls[0], out _device);
                if (err != Err.NoError) { Fail("connexion à " + urls[0] + " : " + err); return; }

                _callback = OnGaze;
                err = tobii_gaze_point_subscribe(_device, _callback, IntPtr.Zero);
                if (err != Err.NoError)
                {
                    Fail("abonnement au regard : " + err +
                         (err == Err.InsufficientLicense ? " (cet appareil réserve le regard aux logiciels licenciés)" : ""));
                    return;
                }

                IsAvailable = true;
                Status = "abonné au regard (" + urls[0] + ")";
                Lib.Log.Write("stream", "Stream Engine : " + Status);

                var devices = new[] { _device };
                int failures = 0;
                while (_running)
                {
                    err = tobii_wait_for_callbacks(IntPtr.Zero, 1, devices);
                    if (err != Err.NoError && err != Err.TimedOut)
                    {
                        if (++failures % 20 == 1) Lib.Log.Write("stream", "Attente des données : " + err);
                        Thread.Sleep(200);
                        continue;
                    }
                    err = tobii_device_process_callbacks(_device);
                    if (err != Err.NoError && err != Err.ConnectionFailed && ++failures % 20 == 1)
                        Lib.Log.Write("stream", "Traitement des données : " + err);
                    LogRate();
                    if (err == Err.ConnectionFailed)
                    {
                        Lib.Log.Write("stream", "Connexion perdue : tentative de reconnexion");
                        tobii_device_reconnect(_device);
                        Thread.Sleep(500);
                    }
                }
            }
            catch (DllNotFoundException ex) { Fail("moteur absent (tobii_stream_engine.dll) : " + ex.Message); }
            catch (EntryPointNotFoundException ex) { Fail("version du moteur incompatible : " + ex.Message); }
            catch (Exception ex) { Fail(ex.GetType().Name + " : " + ex.Message); }
        }

        // Toutes les 5 s : débit et part de points valides (diagnostic).
        private DateTime _rateAt = DateTime.UtcNow;
        private long _rateEvents, _rateValid;

        private void LogRate()
        {
            var now = DateTime.UtcNow;
            double dt = (now - _rateAt).TotalSeconds;
            if (dt < 5) return;
            long ev = _events - _rateEvents, va = _valid - _rateValid;
            Lib.Log.Write("stream", FormattableString.Invariant(
                $"Débit : {ev / dt:0} échantillons/s, dont {va / dt:0} valides/s (total {_valid}/{_events})"));
            _rateAt = now;
            _rateEvents = _events;
            _rateValid = _valid;
        }

        private void OnGaze(ref GazePointData p, IntPtr userData)
        {
            _events++;
            // Les premiers échantillons BRUTS (vérifie le format des données).
            if (_events <= 3)
                Lib.Log.Write("stream", FormattableString.Invariant(
                    $"Échantillon brut n°{_events} : validité={p.Validity} x={p.X:0.###} y={p.Y:0.###} t={p.TimestampUs}"));
            bool ok = p.Validity == 1 && p.X >= -0.1 && p.X <= 1.1 && p.Y >= -0.1 && p.Y <= 1.1;
            if (ok)
            {
                if (++_valid == 1) Lib.Log.Write("stream", "1er point de regard reçu (Stream Engine)");
                else if (_valid % 3000 == 0) Lib.Log.Write("stream", "Points de regard : " + _valid + "/" + _events);
                double w = GetSystemMetrics(0), h = GetSystemMetrics(1); // écran principal (px)
                Gaze?.Invoke(new GazePoint(p.X * w, p.Y * h));
            }
            Presence?.Invoke(ok);
        }

        private void Fail(string why)
        {
            Status = why;
            IsAvailable = false;
            Lib.Log.Write("stream", "Stream Engine indisponible : " + why);
        }

        public void Dispose()
        {
            _running = false;
            try { _thread?.Join(600); } catch { }
            try
            {
                if (_device != IntPtr.Zero)
                {
                    tobii_gaze_point_unsubscribe(_device);
                    tobii_device_destroy(_device);
                }
                if (_api != IntPtr.Zero) tobii_api_destroy(_api);
            }
            catch { }
            _device = IntPtr.Zero;
            _api = IntPtr.Zero;
            IsAvailable = false;
        }

        // ------------------------------------------------------------------
        //  Interface native (tobii_stream_engine.dll, paquet Tobii.StreamEngine)
        // ------------------------------------------------------------------
        private const string Dll = "tobii_stream_engine";

        private enum Err
        {
            NoError, Internal, InsufficientLicense, NotSupported, NotAvailable, ConnectionFailed,
            TimedOut, AllocationFailed, InvalidParameter, CalibrationAlreadyStarted, CalibrationNotStarted,
            AlreadySubscribed, NotSubscribed, OperationFailed, ConflictingApiInstances, CalibrationBusy,
            CallbackInProgress, TooManySubscribers,
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct GazePointData
        {
            public long TimestampUs;
            public int Validity;   // 1 = valide
            public float X, Y;     // 0..1 sur la zone d'affichage de l'écran
        }

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        private delegate void GazeCallback(ref GazePointData gazePoint, IntPtr userData);

        [UnmanagedFunctionPointer(CallingConvention.Cdecl, CharSet = CharSet.Ansi)]
        private delegate void UrlReceiver(string url, IntPtr userData);

        [StructLayout(LayoutKind.Sequential)]
        private struct ApiVersion { public int Major, Minor, Revision, Build; }

        [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)]
        private static extern Err tobii_get_api_version(out ApiVersion version);

        [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)]
        private static extern Err tobii_api_create(out IntPtr api, IntPtr customAlloc, IntPtr customLog);

        [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)]
        private static extern Err tobii_api_destroy(IntPtr api);

        [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)]
        private static extern Err tobii_enumerate_local_device_urls(IntPtr api, UrlReceiver receiver, IntPtr userData);

        [DllImport(Dll, CallingConvention = CallingConvention.Cdecl, CharSet = CharSet.Ansi)]
        private static extern Err tobii_device_create(IntPtr api, string url, out IntPtr device);

        [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)]
        private static extern Err tobii_device_destroy(IntPtr device);

        [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)]
        private static extern Err tobii_device_reconnect(IntPtr device);

        [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)]
        private static extern Err tobii_wait_for_callbacks(IntPtr engine, int deviceCount, IntPtr[] devices);

        [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)]
        private static extern Err tobii_device_process_callbacks(IntPtr device);

        [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)]
        private static extern Err tobii_gaze_point_subscribe(IntPtr device, GazeCallback callback, IntPtr userData);

        [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)]
        private static extern Err tobii_gaze_point_unsubscribe(IntPtr device);

        [DllImport("user32.dll")]
        private static extern int GetSystemMetrics(int index);
    }
}
