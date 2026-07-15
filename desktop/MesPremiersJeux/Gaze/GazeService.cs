using System;
using Tobii.Interaction;

namespace MesPremiersJeux.Gaze
{
    /// <summary>
    /// Point de regard en pixels écran (coordonnées du bureau virtuel).
    /// </summary>
    public struct GazePoint
    {
        public double X;
        public double Y;
        public GazePoint(double x, double y) { X = x; Y = y; }
    }

    /// <summary>
    /// Position des yeux dans la « boîte de suivi » de la caméra (normalisée 0..1) :
    /// X = gauche/droite, Y = haut/bas, Z = distance. Sert à vérifier que la tablette
    /// est bien placée devant l'enfant, et à savoir si le regard est détecté.
    /// </summary>
    public struct EyeSample
    {
        public bool HasLeft, HasRight;
        public double LX, LY, LZ, RX, RY, RZ;
        public bool AnyValid => HasLeft || HasRight;
    }

    /// <summary>
    /// Enveloppe le SDK grand public Tobii (Tobii.Interaction / Core SDK) et
    /// expose un flux de points de regard. Si aucun eye-tracker n'est présent,
    /// le service reste inactif : l'application fonctionne alors à la souris.
    /// </summary>
    public sealed class GazeService : IEyeStream, IDisposable
    {
        private Host _host;
        private object _stream;    // conserve une référence pour éviter le ramasse-miettes
        private object _eyeStream;

        /// <summary>Vrai si le moteur Tobii a démarré correctement.</summary>
        public bool IsAvailable { get; private set; }

        /// <summary>Levé pour chaque point de regard (souvent hors du thread UI).</summary>
        public event Action<GazePoint> Gaze;

        /// <summary>Levé pour chaque mesure de position des yeux (hors thread UI).</summary>
        public event Action<EyeSample> Eyes;

        private long _samples;

        public void Start()
        {
            try
            {
                _host = new Host();
                var stream = _host.Streams.CreateGazePointDataStream();
                stream.GazePoint((x, y, ts) =>
                {
                    if (++_samples == 1) Lib.Log.Write("sdk", "1er point de regard reçu (Tobii.Interaction)");
                    else if (_samples % 2000 == 0) Lib.Log.Write("sdk", $"Points de regard reçus : {_samples}");
                    Gaze?.Invoke(new GazePoint(x, y));
                });
                _stream = stream;
                IsAvailable = true;
                Lib.Log.Write("sdk", "SDK grand public (Tobii.Interaction) démarré");

                // Flux « position des yeux » (facultatif : ignoré s'il échoue).
                try
                {
                    var eye = _host.Streams.CreateEyePositionStream();
                    eye.EyePosition(d => Eyes?.Invoke(new EyeSample
                    {
                        HasLeft = d.HasLeftEyePosition,
                        HasRight = d.HasRightEyePosition,
                        LX = d.LeftEyeNormalized.X, LY = d.LeftEyeNormalized.Y, LZ = d.LeftEyeNormalized.Z,
                        RX = d.RightEyeNormalized.X, RY = d.RightEyeNormalized.Y, RZ = d.RightEyeNormalized.Z,
                    }));
                    _eyeStream = eye;
                }
                catch { _eyeStream = null; }
            }
            catch (Exception ex)
            {
                // Pas de Tobii Experience installé / pas de tracker : mode souris.
                Lib.Log.Write("sdk", "SDK grand public indisponible : " + ex.Message);
                IsAvailable = false;
            }
        }

        public void Dispose()
        {
            try
            {
                _host?.DisableConnection();
                _host?.Dispose();
            }
            catch { /* ignore */ }
            _host = null;
            _stream = null;
            _eyeStream = null;
            IsAvailable = false;
        }
    }
}
