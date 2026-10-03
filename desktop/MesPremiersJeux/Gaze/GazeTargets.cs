using System.Collections.Generic;
using System.Windows;
using System.Windows.Controls.Primitives;
using System.Windows.Media;

namespace MesPremiersJeux.Gaze
{
    /// <summary>
    /// Recense les « cibles » visibles à l'écran pour l'aimant du regard : tous les
    /// boutons actifs, plus tout élément marqué GazeTargets.IsTarget="true" (mots
    /// de lecture, zones des histoires…). Le moteur attire le regard vers la cible
    /// la plus proche et remplit le cercle SUR elle.
    /// </summary>
    public static class GazeTargets
    {
        public static readonly DependencyProperty IsTargetProperty =
            DependencyProperty.RegisterAttached("IsTarget", typeof(bool), typeof(GazeTargets),
                new PropertyMetadata(false));

        public static void SetIsTarget(DependencyObject el, bool value) => el.SetValue(IsTargetProperty, value);
        public static bool GetIsTarget(DependencyObject el) => (bool)el.GetValue(IsTargetProperty);

        public sealed class Target
        {
            public FrameworkElement Element;
            public Rect ScreenRect; // pixels écran (physiques)
        }

        /// <summary>Collecte les cibles visibles sous la racine donnée.</summary>
        public static List<Target> Collect(Visual root)
        {
            var list = new List<Target>();
            Walk(root, list);
            return list;
        }

        private static void Walk(DependencyObject d, List<Target> list)
        {
            if (d == null) return;

            if (d is FrameworkElement fe)
            {
                if (!fe.IsVisible) return; // sous-arbre invisible : inutile de descendre

                bool isButton = fe is ButtonBase b && b.IsEnabled;
                if ((isButton || GetIsTarget(fe)) && fe.IsHitTestVisible)
                {
                    try
                    {
                        var tl = fe.PointToScreen(new Point(0, 0));
                        var br = fe.PointToScreen(new Point(fe.ActualWidth, fe.ActualHeight));
                        var r = new Rect(tl, br);
                        if (r.Width >= 8 && r.Height >= 8)
                            list.Add(new Target { Element = fe, ScreenRect = r });
                    }
                    catch { /* élément pas encore connecté à l'écran */ }
                    return; // le contenu d'une cible n'est pas une cible séparée
                }
            }

            int n = VisualTreeHelper.GetChildrenCount(d);
            for (int i = 0; i < n; i++) Walk(VisualTreeHelper.GetChild(d, i), list);
        }
    }
}
