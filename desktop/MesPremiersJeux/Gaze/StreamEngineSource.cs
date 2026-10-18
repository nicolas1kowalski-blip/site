using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Threading;

namespace MesPremiersJeux.Gaze
{
    /// <summary>
    /// Regard direct par le « Stream Engine » de Tobii : le moteur de plus bas
    /// niveau, celui qu'emploient les logiciels de communication comme Grid 3.
    /// Deux variantes : le moteur INSTALLÉ sur la tablette (récent, déclare un
    /// usage interactif — « field of use ») et celui fourni avec l'application
    /// (paquet Tobii.StreamEngine 2.2). Les fonctions sont chargées
    /// dynamiquement depuis la DLL choisie, et leur forme dépend de sa version.
    /// Si le moteur refuse ou masque le regard, la source reste inactive et le
    /// dit dans le journal.
    /// </summary>
    public sealed class StreamEngineSource : IEyeStream, IDisposable
    {
        public bool IsAvailable { get; private set; }

        /// <summary>Points de regard en pixels écran (hors thread UI).</summary>
        public event Action<GazePoint> Gaze;

        /// <summary>Présence : un point valide vient d'arriver (ou non).</summary>
        public event Action<bool> Presence;

        /// <summary>Position des yeux dans la boîte de suivi (0..1), hors thread UI.
        /// Demandée au moteur SEULEMENT tant que quelqu'un écoute (la fenêtre
        /// « position des yeux ») : en jeu, le moteur ne fournit que le regard.</summary>
        public event Action<EyeSample> Eyes
        {
            add { lock (_eyeLock) { _eyes += value; _wantEyes = _eyes != null; } }
            remove { lock (_eyeLock) { _eyes -= value; _wantEyes = _eyes != null; } }
        }

        private readonly object _eyeLock = new object();
        private Action<EyeSample> _eyes;
        private volatile bool _wantEyes;
        private bool _eyeTried; // une seule tentative par ouverture (pas d'insistance si refus)

        private long _eyeEvents;

        /// <summary>Diagnostic : positions des yeux reçues.</summary>
        public long EyeEvents => _eyeEvents;

        /// <summary>État de l'abonnement à la position des yeux (pour la fenêtre des yeux).</summary>
        public string EyeStatus { get; private set; } = "non demandé";

        private long _events, _valid;

        /// <summary>Diagnostic : « points valides / reçus ».</summary>
        public string Stats => _valid + "/" + _events;

        public bool HasGaze => _valid > 0;

        /// <summary>Échantillons reçus (valides ou non) : le flux est-il vivant ?</summary>
        public long Events => _events;

        // Dernier échantillon reçu : un flux qui se tait est relancé.
        private long _lastEventTicks;

        /// <summary>Secondes depuis le dernier échantillon (0 tant que rien n'est arrivé).</summary>
        public double SilentSeconds =>
            _lastEventTicks == 0 ? 0 : (DateTime.UtcNow - new DateTime(_lastEventTicks, DateTimeKind.Utc)).TotalSeconds;

        /// <summary>Le chemin demandé à la création (null = moteur de l'application).</summary>
        public string RequestedPath { get; }

        /// <summary>Dernière étape atteinte ou erreur (pour le rapport).</summary>
        public string Status { get; private set; } = "non démarré";

        private readonly string _dllPath;
        private readonly string _label;
        private IntPtr _module, _api, _device;
        private Thread _thread;
        private volatile bool _running;
        private GazeCallback _callback; // gardé en vie : appelé depuis le code natif
        private EyePosCallback _eyeCallback;

        /// <param name="dllPath">Chemin complet de tobii_stream_engine.dll
        /// (null = celle fournie avec l'application).</param>
        public StreamEngineSource(string dllPath = null)
        {
            RequestedPath = dllPath;
            _dllPath = dllPath ?? Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "tobii_stream_engine.dll");
            _label = dllPath == null ? "moteur de l'application" : "moteur de la tablette";
        }

        public void Start()
        {
            _running = true;
            _thread = new Thread(Run) { IsBackground = true, Name = "Tobii Stream Engine" };
            _thread.Start();
        }

        // ------------------------------------------------------------------
        //  Les moteurs installés sur la tablette (x64, du plus récent au plus ancien)
        // ------------------------------------------------------------------
        public static List<string> FindInstalled()
        {
            var roots = new[]
            {
                Environment.GetEnvironmentVariable("ProgramW6432"),
                Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
                Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),
                Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
            }.Where(r => !string.IsNullOrEmpty(r)).Distinct(StringComparer.OrdinalIgnoreCase);

            var found = new List<(string Path, Version Ver)>();
            foreach (var root in roots)
            {
                IEnumerable<string> tops;
                try { tops = Directory.GetDirectories(root); } catch { continue; }
                foreach (var top in tops)
                {
                    var name = Path.GetFileName(top).ToLowerInvariant();
                    if (!(name.Contains("tobii") || name.Contains("dynavox") || name.Contains("smartbox"))) continue;
                    foreach (var f in Walk(top, 6))
                    {
                        bool x64 = IsX64(f);
                        Version ver = new Version(0, 0);
                        try { ver = Version.Parse(FileVersionInfo.GetVersionInfo(f).FileVersion.Replace(',', '.').Split(' ')[0]); } catch { }
                        Lib.Log.Write("stream", $"Moteur trouvé sur la tablette : {f} (version {ver}, {(x64 ? "64 bits" : "32 bits — inutilisable ici")})");
                        if (x64) found.Add((f, ver));
                    }
                }
            }
            return found.OrderByDescending(x => x.Ver).Select(x => x.Path).ToList();
        }

        private static IEnumerable<string> Walk(string dir, int depth)
        {
            var res = new List<string>();
            try { res.AddRange(Directory.GetFiles(dir, "tobii_stream_engine.dll")); } catch { }
            if (depth > 0)
            {
                string[] subs;
                try { subs = Directory.GetDirectories(dir); } catch { subs = new string[0]; }
                foreach (var s in subs) res.AddRange(Walk(s, depth - 1));
            }
            return res;
        }

        // En-tête PE : 0x8664 = x64 (seul chargeable dans notre processus 64 bits).
        private static bool IsX64(string path)
        {
            try
            {
                using (var fs = File.OpenRead(path))
                using (var br = new BinaryReader(fs))
                {
                    fs.Position = 0x3C;
                    int pe = br.ReadInt32();
                    fs.Position = pe + 4;
                    return br.ReadUInt16() == 0x8664;
                }
            }
            catch { return false; }
        }

        // ------------------------------------------------------------------
        //  Connexion et réception
        // ------------------------------------------------------------------
        private void Run()
        {
            try
            {
                _module = LoadLibrary(_dllPath);
                if (_module == IntPtr.Zero) { Fail("impossible de charger " + _dllPath + " (erreur " + Marshal.GetLastWin32Error() + ")"); return; }

                int major = 2;
                var getVersion = Fn<GetVersionFn>("tobii_get_api_version");
                if (getVersion != null && getVersion(out var v) == Err.NoError)
                {
                    major = v.Major;
                    Lib.Log.Write("stream", $"{Cap(_label)} : version {v.Major}.{v.Minor}.{v.Revision}.{v.Build} ({_dllPath})");
                }

                var apiCreate = Fn<ApiCreateFn>("tobii_api_create");
                var enumerate = Fn<EnumerateFn>("tobii_enumerate_local_device_urls");
                var subscribe = Fn<SubscribeFn>("tobii_gaze_point_subscribe");
                _process = Fn<DeviceFn>("tobii_device_process_callbacks");
                _reconnect = Fn<DeviceFn>("tobii_device_reconnect");
                _unsubscribe = Fn<DeviceFn>("tobii_gaze_point_unsubscribe");
                _deviceDestroy = Fn<DeviceFn>("tobii_device_destroy");
                _apiDestroy = Fn<DeviceFn>("tobii_api_destroy");
                _eyeSubscribe = Fn<EyeSubscribeFn>("tobii_eye_position_normalized_subscribe");
                _getState = Fn<GetStateBoolFn>("tobii_get_state_bool");
                _eyeUnsubscribe = Fn<DeviceFn>("tobii_eye_position_normalized_unsubscribe");
                if (apiCreate == null || enumerate == null || subscribe == null || _process == null)
                { Fail("fonctions du moteur introuvables dans cette version"); return; }

                var err = apiCreate(out _api, IntPtr.Zero, IntPtr.Zero);
                if (err != Err.NoError) { Fail("création de l'API : " + err); return; }

                var urls = new List<string>();
                UrlReceiver receiver = (url, data) => urls.Add(url);
                err = enumerate(_api, receiver, IntPtr.Zero);
                GC.KeepAlive(receiver);
                if (err != Err.NoError) { Fail("liste des appareils : " + err); return; }
                Lib.Log.Write("stream", "Appareils trouvés : " + (urls.Count == 0 ? "aucun" : string.Join(", ", urls)));
                if (urls.Count == 0) { Fail("aucun eye-tracker visible par le Stream Engine"); return; }

                // Version 4 et plus : on déclare l'usage « interactif » (le regard
                // n'est ni enregistré ni transmis) — ce que fait un logiciel de
                // pilotage au regard.
                var create4 = major >= 4 ? Fn<DeviceCreate4Fn>("tobii_device_create") : null;
                var create2 = major >= 4 ? null : Fn<DeviceCreate2Fn>("tobii_device_create");
                string url = urls[0];
                Err CreateDevice() => create4 != null
                    ? create4(_api, url, 1 /* TOBII_FIELD_OF_USE_STORE_OR_TRANSFER_FALSE */, out _device)
                    : create2(_api, url, out _device);

                err = CreateDevice();
                if (err != Err.NoError) { Fail("connexion à " + url + " : " + err); return; }

                _callback = OnGaze;
                err = subscribe(_device, _callback, IntPtr.Zero);
                if (err != Err.NoError)
                {
                    Fail("abonnement au regard : " + err +
                         (err == Err.InsufficientLicense ? " (cet appareil réserve le regard aux logiciels licenciés)" : ""));
                    return;
                }

                IsAvailable = true;
                Status = "abonné au regard (" + _label + ", " + urls[0] + ")";
                Lib.Log.Write("stream", "Stream Engine : " + Status);
                Lib.Log.Write("stream", "État de la caméra : " + States());

                int failures = 0, kicks = 0;
                var nextKick = DateTime.MinValue;
                while (_running)
                {
                    // FLUX MUET (la caméra s'est tue) : relances DOUCES et de plus en
                    // plus espacées (5 s, 10 s, 20 s, puis toutes les 30 s), TOUTES
                    // dans ce fil — jamais en même temps qu'une lecture :
                    // 1) réabonnement, 2) reconnexion, 3+) appareil recréé.
                    double silent = SilentSeconds;
                    if (silent < 1) { kicks = 0; nextKick = DateTime.MinValue; }
                    else if (_events > 0 && silent > 5 && DateTime.UtcNow >= nextKick)
                    {
                        kicks++;
                        nextKick = DateTime.UtcNow.AddSeconds(Math.Min(30, 5 * Math.Pow(2, kicks - 1)));
                        Lib.Log.Write("stream", FormattableString.Invariant($"Flux muet depuis {silent:0} s : relance n°{kicks}"));
                        try
                        {
                            if (kicks == 1 && _device != IntPtr.Zero)
                            {
                                _unsubscribe?.Invoke(_device);
                                Lib.Log.Write("stream", "Réabonnement au regard : " + subscribe(_device, _callback, IntPtr.Zero));
                            }
                            else if (kicks == 2 && _device != IntPtr.Zero)
                                Lib.Log.Write("stream", "Reconnexion : " + (_reconnect?.Invoke(_device) ?? Err.NotSupported));
                            else
                            {
                                if (_device != IntPtr.Zero)
                                {
                                    _unsubscribe?.Invoke(_device);
                                    if (_eyeCallback != null) _eyeUnsubscribe?.Invoke(_device);
                                    _deviceDestroy?.Invoke(_device);
                                    _device = IntPtr.Zero;
                                }
                                var ce = CreateDevice();
                                var se = ce == Err.NoError ? subscribe(_device, _callback, IntPtr.Zero) : ce;
                                Lib.Log.Write("stream", "Appareil recréé : " + ce + " / abonnement : " + se);
                                _eyeCallback = null; // à redemander si la fenêtre des yeux est ouverte
                                _eyeTried = false;
                            }
                        }
                        catch (Exception ex) { Lib.Log.Write("stream", "Relance : " + ex.Message); }
                    }
                    // Appareil pas (encore) recréé : on n'y touche pas, on attend la relance suivante.
                    if (_device == IntPtr.Zero) { Thread.Sleep(1000); continue; }

                    // Position des yeux à la demande (toujours dans ce fil).
                    if (_wantEyes && _eyeCallback == null && !_eyeTried) { _eyeTried = true; SubscribeEyes(); }
                    else if (!_wantEyes && (_eyeCallback != null || _eyeTried))
                    {
                        if (_eyeCallback != null)
                        {
                            try { _eyeUnsubscribe?.Invoke(_device); } catch { }
                            Lib.Log.Write("stream", "Position des yeux : arrêtée (fenêtre fermée)");
                        }
                        _eyeCallback = null;
                        _eyeTried = false;
                    }

                    err = _process(_device);
                    if (err == Err.ConnectionFailed)
                    {
                        Lib.Log.Write("stream", "Connexion perdue : tentative de reconnexion");
                        _reconnect?.Invoke(_device);
                        Thread.Sleep(1000);
                    }
                    else if (err != Err.NoError && ++failures % 200 == 1)
                        Lib.Log.Write("stream", "Traitement des données : " + err);
                    LogRate();
                    Thread.Sleep(8); // ~120 lectures/s : bien plus que le débit de la caméra
                }
            }
            catch (Exception ex) { Fail(ex.GetType().Name + " : " + ex.Message); }
        }

        private DateTime _statesAt = DateTime.MinValue;

        // tobii_state_t (moteur 4.x) : ce qui peut empêcher la caméra de suivre.
        private static readonly (int Id, string Name)[] StateNames =
        {
            (0, "économie d'énergie"), (2, "en pause"), (3, "réservée par un autre logiciel (mode exclusif)"),
            (4, "en panne"), (5, "avertissement"), (7, "calibrage en cours"),
        };

        private string States()
        {
            if (_getState == null) return "non disponible avec ce moteur";
            var on = new List<string>();
            foreach (var (id, name) in StateNames)
            {
                try
                {
                    var err = _getState(_device, id, out int v);
                    if (err == Err.NoError && v != 0) on.Add(name.ToUpperInvariant());
                    else if (err != Err.NoError && err != Err.NotSupported) on.Add(name + " ? (" + err + ")");
                }
                catch { }
            }
            return on.Count == 0 ? "rien d'anormal signalé (yeux non vus ?)" : string.Join(", ", on);
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
                $"Débit ({_label}) : {ev / dt:0} échantillons/s, dont {va / dt:0} valides/s (total {_valid}/{_events})"));
            // Flux vivant mais AUCUN point valide : on demande à la caméra son
            // état (pause, économie d'énergie, autre logiciel en mode exclusif…).
            if (ev > 0 && va == 0 && (now - _statesAt).TotalSeconds > 60)
            {
                _statesAt = now;
                Lib.Log.Write("stream", "État de la caméra : " + States());
            }
            _rateAt = now;
            _rateEvents = _events;
            _rateValid = _valid;
        }

        private void OnGaze(ref GazePointData p, IntPtr userData)
        {
            try { OnGazeCore(ref p); }
            catch { /* une erreur ici ne doit JAMAIS remonter dans le moteur natif */ }
        }

        private void OnGazeCore(ref GazePointData p)
        {
            _events++;
            _lastEventTicks = DateTime.UtcNow.Ticks;
            // Les premiers échantillons BRUTS (vérifie le format des données).
            if (_events <= 3)
                Lib.Log.Write("stream", FormattableString.Invariant(
                    $"Échantillon brut n°{_events} : validité={p.Validity} x={p.X:0.###} y={p.Y:0.###} t={p.TimestampUs}"));
            bool ok = p.Validity == 1 && p.X >= -0.1 && p.X <= 1.1 && p.Y >= -0.1 && p.Y <= 1.1;
            if (ok)
            {
                if (++_valid == 1) Lib.Log.Write("stream", "1er point de regard reçu (Stream Engine, " + _label + ")");
                double w = GetSystemMetrics(0), h = GetSystemMetrics(1); // écran principal (px)
                Gaze?.Invoke(new GazePoint(p.X * w, p.Y * h));
            }
            Presence?.Invoke(ok);
        }

        // Position des yeux (facultative) : pour « Vérifier la position des yeux »
        // et la référence de tête de l'étoile. Un refus n'empêche pas le regard.
        private void SubscribeEyes()
        {
            if (_eyeSubscribe == null) { EyeStatus = "non proposée par ce moteur"; Lib.Log.Write("stream", "Position des yeux : " + EyeStatus); return; }
            try
            {
                _eyeCallback = OnEyePos;
                var err = _eyeSubscribe(_device, _eyeCallback, IntPtr.Zero);
                if (err != Err.NoError) _eyeCallback = null;
                EyeStatus = err == Err.NoError ? "abonné"
                    : "refusée (" + err + (err == Err.InsufficientLicense ? " : réservée aux logiciels licenciés" : "") + ")";
            }
            catch (Exception ex) { _eyeCallback = null; EyeStatus = "erreur : " + ex.Message; }
            Lib.Log.Write("stream", "Position des yeux : " + EyeStatus);
        }

        private void OnEyePos(ref EyePosData d, IntPtr userData)
        {
            try
            {
                if (++_eyeEvents == 1)
                    Lib.Log.Write("stream", FormattableString.Invariant(
                        $"1re position des yeux : G={d.LeftValidity} ({d.LX:0.##};{d.LY:0.##};{d.LZ:0.##}) D={d.RightValidity} ({d.RX:0.##};{d.RY:0.##};{d.RZ:0.##})"));
                _eyes?.Invoke(new EyeSample
                {
                    HasLeft = d.LeftValidity == 1,
                    HasRight = d.RightValidity == 1,
                    LX = d.LX, LY = d.LY, LZ = d.LZ,
                    RX = d.RX, RY = d.RY, RZ = d.RZ,
                });
            }
            catch { /* jamais d'erreur vers le moteur natif */ }
        }

        private void Fail(string why)
        {
            Status = why;
            IsAvailable = false;
            Lib.Log.Write("stream", "Stream Engine indisponible (" + _label + ") : " + why);
        }

        public void Dispose()
        {
            _running = false;
            bool stopped = true;
            try { stopped = _thread == null || _thread.Join(5000); } catch { }
            if (!stopped)
            {
                // Le fil est encore dans le moteur (reconnexion lente) : détruire
                // maintenant ferait planter l'application. On abandonne la
                // connexion telle quelle, le fil s'arrêtera de lui-même.
                Lib.Log.Write("stream", "Arrêt : le moteur est encore occupé — connexion laissée telle quelle");
                IsAvailable = false;
                return;
            }
            try
            {
                if (_device != IntPtr.Zero)
                {
                    _unsubscribe?.Invoke(_device);
                    if (_eyeCallback != null) _eyeUnsubscribe?.Invoke(_device);
                    _deviceDestroy?.Invoke(_device);
                }
                if (_api != IntPtr.Zero) _apiDestroy?.Invoke(_api);
            }
            catch { }
            _device = IntPtr.Zero;
            _api = IntPtr.Zero;
            IsAvailable = false;
            // La DLL reste chargée : la décharger pendant qu'un fil natif finit
            // pourrait faire planter l'application.
        }

        private static string Cap(string s) => char.ToUpperInvariant(s[0]) + s.Substring(1);

        // ------------------------------------------------------------------
        //  Interface native, chargée depuis la DLL choisie
        // ------------------------------------------------------------------
        private T Fn<T>(string name) where T : class
        {
            var p = GetProcAddress(_module, name);
            return p == IntPtr.Zero ? null : Marshal.GetDelegateForFunctionPointer(p, typeof(T)) as T;
        }

        private DeviceFn _process, _reconnect, _unsubscribe, _deviceDestroy, _apiDestroy, _eyeUnsubscribe;
        private EyeSubscribeFn _eyeSubscribe;
        private GetStateBoolFn _getState;

        private enum Err
        {
            NoError, Internal, InsufficientLicense, NotSupported, NotAvailable, ConnectionFailed,
            TimedOut, AllocationFailed, InvalidParameter, CalibrationAlreadyStarted, CalibrationNotStarted,
            AlreadySubscribed, NotSubscribed, OperationFailed, ConflictingApiInstances, CalibrationBusy,
            CallbackInProgress, TooManySubscribers,
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct ApiVersion { public int Major, Minor, Revision, Build; }

        [StructLayout(LayoutKind.Sequential)]
        private struct GazePointData
        {
            public long TimestampUs;
            public int Validity;   // 1 = valide
            public float X, Y;     // 0..1 sur la zone d'affichage de l'écran
        }

        // tobii_eye_position_normalized_t : position de chaque œil dans la boîte
        // de suivi, 0..1 sur chaque axe.
        [StructLayout(LayoutKind.Sequential)]
        private struct EyePosData
        {
            public long TimestampUs;
            public int LeftValidity;   // 1 = valide
            public float LX, LY, LZ;
            public int RightValidity;
            public float RX, RY, RZ;
        }

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        private delegate void EyePosCallback(ref EyePosData data, IntPtr userData);

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        private delegate Err EyeSubscribeFn(IntPtr device, EyePosCallback callback, IntPtr userData);

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        private delegate void GazeCallback(ref GazePointData gazePoint, IntPtr userData);

        [UnmanagedFunctionPointer(CallingConvention.Cdecl, CharSet = CharSet.Ansi)]
        private delegate void UrlReceiver(string url, IntPtr userData);

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        private delegate Err GetVersionFn(out ApiVersion version);

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        private delegate Err ApiCreateFn(out IntPtr api, IntPtr customAlloc, IntPtr customLog);

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        private delegate Err EnumerateFn(IntPtr api, UrlReceiver receiver, IntPtr userData);

        [UnmanagedFunctionPointer(CallingConvention.Cdecl, CharSet = CharSet.Ansi)]
        private delegate Err DeviceCreate2Fn(IntPtr api, string url, out IntPtr device);

        [UnmanagedFunctionPointer(CallingConvention.Cdecl, CharSet = CharSet.Ansi)]
        private delegate Err DeviceCreate4Fn(IntPtr api, string url, int fieldOfUse, out IntPtr device);

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        private delegate Err SubscribeFn(IntPtr device, GazeCallback callback, IntPtr userData);

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        private delegate Err DeviceFn(IntPtr device);

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        private delegate Err GetStateBoolFn(IntPtr device, int state, out int value);

        [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        private static extern IntPtr LoadLibrary(string path);

        [DllImport("kernel32.dll", CharSet = CharSet.Ansi, ExactSpelling = true)]
        private static extern IntPtr GetProcAddress(IntPtr module, string name);

        [DllImport("user32.dll")]
        private static extern int GetSystemMetrics(int index);
    }
}
