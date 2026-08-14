using System;
using System.Windows;

namespace MesPremiersJeux.Gaze
{
    /// <summary>
    /// Flux de regard partagé, alimenté par le moteur (DwellController) à chaque
    /// battement : les jeux « cause à effet », l'étoile de précision et le bilan
    /// de session s'y abonnent sans toucher au moteur.
    /// Tous les points sont en PIXELS ÉCRAN (physiques).
    /// </summary>
    public static class GazeFeed
    {
        /// <summary>Point BRUT (avant correction de précision et lissage) — pour mesurer le biais.</summary>
        public static event Action<Point> Raw;

        /// <summary>Point AFFICHÉ (corrigé + lissé + zone morte) et validité du regard.</summary>
        public static event Action<Point, bool> Sample;

        internal static void PushRaw(Point p) { try { Raw?.Invoke(p); } catch { } }
        internal static void Push(Point p, bool valid) { try { Sample?.Invoke(p, valid); } catch { } }
    }
}
