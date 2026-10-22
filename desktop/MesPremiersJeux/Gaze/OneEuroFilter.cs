using System;

namespace MesPremiersJeux.Gaze
{
    /// <summary>
    /// Filtre « 1 € » (One Euro Filter) pour lisser un signal bruité tout en
    /// restant réactif : peu de latence quand le regard bouge vite, fort lissage
    /// quand il est quasi immobile. On l'applique aux coordonnées du regard pour
    /// stabiliser la sélection sur les eye-trackers (ex. TD I-13).
    /// </summary>
    public sealed class OneEuroFilter
    {
        private sealed class LowPass
        {
            private double _s;
            public bool Initialized { get; private set; }
            public double Last => _s;
            public double Filter(double x, double alpha)
            {
                _s = Initialized ? alpha * x + (1 - alpha) * _s : x;
                Initialized = true;
                return _s;
            }
            public void Reset() => Initialized = false;
        }

        private readonly double _dCutoff;
        private readonly LowPass _x = new LowPass();
        private readonly LowPass _dx = new LowPass();
        private double _lastTime = -1;

        /// <summary>Fréquence de coupure au repos : plus bas = plus lissé/stable.</summary>
        public double MinCutoff { get; set; }

        /// <summary>Réactivité à la vitesse : plus haut = suit mieux les mouvements rapides.</summary>
        public double Beta { get; set; }

        public OneEuroFilter(double minCutoff = 0.7, double beta = 0.018, double dCutoff = 1.0)
        {
            MinCutoff = minCutoff;
            Beta = beta;
            _dCutoff = dCutoff;
        }

        private static double Alpha(double cutoff, double dt)
        {
            double tau = 1.0 / (2 * Math.PI * cutoff);
            return 1.0 / (1.0 + tau / dt);
        }

        /// <param name="t">Horodatage en secondes.</param>
        public double Filter(double value, double t)
        {
            double dt = _lastTime < 0 ? 1.0 / 60 : Math.Max(1e-3, t - _lastTime);
            _lastTime = t;
            double dValue = _x.Initialized ? (value - _x.Last) / dt : 0;
            double edValue = _dx.Filter(dValue, Alpha(_dCutoff, dt));
            double cutoff = MinCutoff + Beta * Math.Abs(edValue);
            return _x.Filter(value, Alpha(cutoff, dt));
        }

        public void Reset()
        {
            _x.Reset();
            _dx.Reset();
            _lastTime = -1;
        }
    }
}
