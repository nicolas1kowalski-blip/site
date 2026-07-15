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
        private long _events;             // échantillons de regard reçus
        private long _valid;              // échantillons avec un point de regard valide
        private DateTime _lastGuideValid = DateTime.MinValue; // yeux vus par le guide

        /// <summary>Vrai si un tracker a été trouvé et que le flux est actif.</summary>
        public bool IsAvailable { get; private set; }

        /// <summary>Nom de l'appareil connecté (ex. « Tobii Pro Spark »).</summary>
        public string DeviceName { get; private set; } = "";

        /// <summary>Point de regard en pixels écran (thread SDK).</summary>
        public event Action<GazePoint> Gaze;

        /// <summary>Position des yeux dans la boîte de suivi (thread SDK).</summary>
        public event Action<EyeSample> Eyes;

        /// <summary>
        /// Présence du regard, émise à PLEIN DÉBIT avec chaque échantillon de
        /// regard (contrairement à <see cref="Eyes"/> qui peut suivre le flux
        /// « guide », plus lent). C'est elle qui alimente la détection
        /// « regard perdu » du dwell.
        /// </summary>
        public event Action<bool> Presence;

        /// <summary>Levé une fois quand un tracker est trouvé (thread de recherche).</summary>
        public event Action<string> Connected;

        /// <summary>Diagnostic : « points valides / échantillons reçus ».</summary>
        public string Stats => _valid + "/" + _events;

        /// <summary>Vrai si le flux de regard direct émet des points valides.</summary>
        public bool HasGaze => _valid > 0;

        /// <summary>
        /// Fiche technique du tracker vue par le Pro SDK : modèle, série, firmware,
        /// CAPACITÉS (dont « HasGazeData » : le flux de regard est-il autorisé ?)
        /// et fréquence. Les erreurs du SDK y sont recopiées telles quelles —
        /// c'est notre vérité terrain pour diagnostiquer les verrous de licence.
        /// </summary>
        public string Diagnostic { get; private set; } = "";

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
                Lib.Log.Write("pro", "Recherche de trackers (FindAllEyeTrackers)…");
                var all = EyeTrackingOperations.FindAllEyeTrackers();
                Lib.Log.Write("pro", $"Trackers trouvés : {(all == null ? 0 : all.Count())}");
                if (all != null)
                    foreach (var t in all)
                    {
                        try { Lib.Log.Write("pro", $"  - {t.Model} · « {t.DeviceName} » · s/n {t.SerialNumber} · {t.Address}"); }
                        catch (Exception ex) { Lib.Log.Write("pro", "  - (illisible : " + ex.Message + ")"); }
                    }
                _tracker = all?.FirstOrDefault();
                if (_tracker == null || _disposed) return;

                DeviceName = string.IsNullOrWhiteSpace(_tracker.DeviceName)
                    ? _tracker.Model.ToString()
                    : _tracker.DeviceName;

                // Fiche technique complète (capacités, fréquence) : chaque erreur du
                // SDK est capturée en clair pour comprendre ce que l'appareil autorise.
                var sb = new System.Text.StringBuilder();
                try { sb.Append(_tracker.Model).Append(" · s/n ").Append(_tracker.SerialNumber); } catch { }
                try { sb.Append(" · fw ").Append(_tracker.FirmwareVersion); } catch { }
                try { sb.Append("\nCapacités : ").Append(_tracker.DeviceCapabilities.ToString()); }
                catch (Exception ex) { sb.Append("\nCapacités : ERREUR ").Append(ex.Message); }
                try { sb.Append("\nFréquence : ").Append(_tracker.GetGazeOutputFrequency()).Append(" Hz"); }
                catch (Exception ex) { sb.Append("\nFréquence : ERREUR ").Append(ex.Message); }
                try
                {
                    var freqs = _tracker.GetAllGazeOutputFrequencies();
                    sb.Append("\nFréquences possibles : ").Append(string.Join(", ", freqs.Select(f => f.ToString("0"))));
                }
                catch (Exception ex) { sb.Append("\nFréquences possibles : ERREUR ").Append(ex.Message); }
                Diagnostic = sb.ToString();
                Lib.Log.Write("pro", "Fiche : " + Diagnostic.Replace("\n", " | "));

                // Connexion perdue/retrouvée : à voir dans le journal.
                try
                {
                    _tracker.ConnectionLost += (s, e) => Lib.Log.Write("pro", "⚠ CONNEXION PERDUE avec le tracker");
                    _tracker.ConnectionRestored += (s, e) => Lib.Log.Write("pro", "Connexion rétablie avec le tracker");
                }
                catch (Exception ex) { Lib.Log.Write("pro", "Abonnement connexion : " + ex.Message); }

                try
                {
                    _tracker.GazeDataReceived += OnGazeData;
                    Lib.Log.Write("pro", "Abonné au flux de REGARD (GazeDataReceived) : OK");
                }
                catch (Exception ex) { Lib.Log.Write("pro", "Abonnement flux de regard : ERREUR " + ex); }

                // Flux dédié au POSITIONNEMENT (fenêtre « Position des yeux ») :
                // plus fiable que GazeOrigin sur certains trackers.
                try
                {
                    _tracker.UserPositionGuideReceived += OnGuide;
                    Lib.Log.Write("pro", "Abonné au flux GUIDE (UserPositionGuideReceived) : OK");
                }
                catch (Exception ex) { Lib.Log.Write("pro", "Abonnement flux guide : ERREUR " + ex); }

                IsAvailable = true;
                Connected?.Invoke(DeviceName);
            }
            catch (Exception ex)
            {
                // Pro SDK absent / aucun tracker compatible : on reste inactif.
                Lib.Log.Write("pro", "Échec de la recherche : " + ex);
                IsAvailable = false;
            }
        }

        private int _gazeErrors;

        private void OnGazeData(object sender, GazeDataEventArgs e)
        {
            try
            {
                _events++;
                bool lv = e.LeftEye.GazePoint.Validity == Validity.Valid;
                bool rv = e.RightEye.GazePoint.Validity == Validity.Valid;

                // Journal : le tout premier échantillon en détail, puis un résumé
                // régulier (pour voir vivre le flux sans noyer le fichier).
                if (_events == 1)
                    Lib.Log.Write("pro", FormattableString.Invariant(
                        $"1er échantillon de REGARD : L={e.LeftEye.GazePoint.Validity} ({e.LeftEye.GazePoint.PositionOnDisplayArea.X:0.###};{e.LeftEye.GazePoint.PositionOnDisplayArea.Y:0.###}) " +
                        $"R={e.RightEye.GazePoint.Validity} ({e.RightEye.GazePoint.PositionOnDisplayArea.X:0.###};{e.RightEye.GazePoint.PositionOnDisplayArea.Y:0.###}) " +
                        $"originL={e.LeftEye.GazeOrigin.Validity} originR={e.RightEye.GazeOrigin.Validity}"));
                else if (_events % 500 == 0)
                    Lib.Log.Write("pro", $"Flux de regard : {_events} reçus, {_valid} valides");

                // Point de regard : moyenne des yeux valides, converti en pixels.
                double nx = 0, ny = 0;
                int n = 0;
                if (lv && Ok(e.LeftEye.GazePoint.PositionOnDisplayArea.X, e.LeftEye.GazePoint.PositionOnDisplayArea.Y))
                { nx += e.LeftEye.GazePoint.PositionOnDisplayArea.X; ny += e.LeftEye.GazePoint.PositionOnDisplayArea.Y; n++; }
                if (rv && Ok(e.RightEye.GazePoint.PositionOnDisplayArea.X, e.RightEye.GazePoint.PositionOnDisplayArea.Y))
                { nx += e.RightEye.GazePoint.PositionOnDisplayArea.X; ny += e.RightEye.GazePoint.PositionOnDisplayArea.Y; n++; }
                if (n > 0)
                {
                    _valid++;
                    double w = GetSystemMetrics(0), h = GetSystemMetrics(1); // écran principal (px)
                    Gaze?.Invoke(new GazePoint(nx / n * w, ny / n * h));
                }

                // Présence du regard, à plein débit : yeux vus si un point de
                // regard OU une origine d'œil est valide dans cet échantillon, OU si
                // le flux « guide » a vu les yeux très récemment (certains trackers
                // ne renseignent pas les validités du flux de regard).
                bool lo = e.LeftEye.GazeOrigin.Validity == Validity.Valid;
                bool ro = e.RightEye.GazeOrigin.Validity == Validity.Valid;
                bool guideFresh = (DateTime.UtcNow - _lastGuideValid).TotalSeconds < 1.0;
                Presence?.Invoke(lv || rv || lo || ro || guideFresh);

                // Position des yeux via GazeOrigin — seulement si le flux « guide »
                // n'émet pas (sinon c'est lui qui fait foi).
                if (!_guideSeen)
                {
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
            catch (Exception ex)
            {
                if (++_gazeErrors <= 3) Lib.Log.Write("pro", "ERREUR dans OnGazeData : " + ex);
            }
        }

        private long _guideEvents;
        private int _guideErrors;

        // Guide de positionnement : position normalisée de chaque œil (0..1),
        // pensé par Tobii précisément pour les écrans « placez-vous bien ».
        private void OnGuide(object sender, UserPositionGuideEventArgs e)
        {
            try
            {
                _guideSeen = true;
                _guideEvents++;
                if (_guideEvents == 1)
                    Lib.Log.Write("pro", FormattableString.Invariant(
                        $"1er échantillon GUIDE : L={e.LeftEye.Validity} ({e.LeftEye.UserPosition.X:0.###};{e.LeftEye.UserPosition.Y:0.###};{e.LeftEye.UserPosition.Z:0.###}) " +
                        $"R={e.RightEye.Validity}"));
                else if (_guideEvents % 300 == 0)
                    Lib.Log.Write("pro", $"Flux guide : {_guideEvents} reçus");
                var lp = e.LeftEye.UserPosition;
                var rp = e.RightEye.UserPosition;
                bool lv = e.LeftEye.Validity == Validity.Valid && Ok(lp.X, lp.Y);
                bool rv = e.RightEye.Validity == Validity.Valid && Ok(rp.X, rp.Y);
                if (lv || rv) _lastGuideValid = DateTime.UtcNow;
                Eyes?.Invoke(new EyeSample
                {
                    HasLeft = lv,
                    HasRight = rv,
                    LX = lp.X, LY = lp.Y, LZ = lp.Z,
                    RX = rp.X, RY = rp.Y, RZ = rp.Z,
                });
            }
            catch (Exception ex)
            {
                if (++_guideErrors <= 3) Lib.Log.Write("pro", "ERREUR dans OnGuide : " + ex);
            }
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
