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
    /// Enveloppe le SDK grand public Tobii (Tobii.Interaction / Core SDK) et
    /// expose un flux de points de regard. Si aucun eye-tracker n'est présent,
    /// le service reste inactif : l'application fonctionne alors à la souris.
    /// </summary>
    public sealed class GazeService : IDisposable
    {
        private Host _host;
        private object _stream; // conserve une référence pour éviter le ramasse-miettes

        /// <summary>Vrai si le moteur Tobii a démarré correctement.</summary>
        public bool IsAvailable { get; private set; }

        /// <summary>Levé pour chaque point de regard (souvent hors du thread UI).</summary>
        public event Action<GazePoint> Gaze;

        public void Start()
        {
            try
            {
                _host = new Host();
                var stream = _host.Streams.CreateGazePointDataStream();
                stream.GazePoint((x, y, ts) => Gaze?.Invoke(new GazePoint(x, y)));
                _stream = stream;
                IsAvailable = true;
            }
            catch (Exception)
            {
                // Pas de Tobii Experience installé / pas de tracker : mode souris.
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
            IsAvailable = false;
        }
    }
}
