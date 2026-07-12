using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Media.Media3D;
using System.Windows.Shapes;
using System.Windows.Threading;

namespace MesPremiersJeux.Gaze
{
    /// <summary>
    /// Transforme le flux de regard en « dwell-click » : quand le regard reste
    /// posé sur une cible pendant <see cref="DwellTime"/>, l'action se déclenche.
    /// Le point de regard est lissé (filtre 1 €) pour absorber le tremblement des
    /// eye-trackers, la sélection tolère les petits écarts et les brèves pertes,
    /// et un cercle de progression se remplit pendant la fixation.
    /// </summary>
    public sealed class DwellController
    {
        private readonly FrameworkElement _root;
        private readonly FrameworkElement _indicator; // cercle de progression (conteneur)
        private readonly Path _progress;              // arc qui se remplit
        private readonly DispatcherTimer _tick;
        private readonly Stopwatch _clock = Stopwatch.StartNew();

        private readonly OneEuroFilter _fx = new OneEuroFilter();
        private readonly OneEuroFilter _fy = new OneEuroFilter();

        // Dernier point de regard SDK reçu (écrit depuis le thread Tobii).
        private volatile bool _hasGaze;
        private double _gx, _gy;

        // État du dwell courant (dwell « par zone de stabilité »).
        private bool _active;             // un dwell est en cours
        private object _startTarget;      // cible verrouillée au démarrage du dwell
        private FrameworkElement _aliveElement;
        private Point _dwellScreen;       // point (lissé) au démarrage du dwell
        private Point _dwellLocal;        // idem, en coordonnées fenêtre
        private Point _lastScreen;        // dernier point lissé
        private DateTime _dwellStart;
        private double _cooldownUntil = -1; // courte pause (temps) après un clic, pas de blocage spatial

        // Tolérances (généreuses : enfants en situation de handicap).
        private const double HoldRadius = 160;    // px : tant qu'on reste dans ce rayon, le dwell continue
        private const double IndicatorR = 37;     // rayon de l'arc de progression

        public bool Enabled { get; set; } = true;
        public bool Locked { get; set; } = false;
        public int DwellTime { get; set; } = 900; // ms

        /// <summary>Suivre le curseur (déplacé au regard par la I-13) au lieu du SDK.</summary>
        public bool UseCursor { get; set; } = false;

        [DllImport("user32.dll")]
        private static extern bool GetCursorPos(out POINT p);

        [StructLayout(LayoutKind.Sequential)]
        private struct POINT { public int X; public int Y; }

        private readonly FrameworkElement _dot; // point de regard toujours visible
        private readonly Shape _dotShape;
        private static readonly Brush DotIdle = Freeze(new SolidColorBrush(Color.FromArgb(0x88, 0xFF, 0x3D, 0x7F)));   // rose : rien sous le regard
        private static readonly Brush DotActive = Freeze(new SolidColorBrush(Color.FromArgb(0x99, 0x35, 0xC7, 0x66))); // vert : cible détectée

        private static Brush Freeze(Brush b) { b.Freeze(); return b; }

        public DwellController(FrameworkElement root, FrameworkElement indicator, Path progress, FrameworkElement dot)
        {
            _root = root;
            _indicator = indicator;
            _progress = progress;
            _dot = dot;
            _dotShape = dot as Shape;
            _indicator.Visibility = Visibility.Collapsed;
            if (_dot != null) _dot.Visibility = Visibility.Collapsed;

            _tick = new DispatcherTimer(DispatcherPriority.Input)
            {
                Interval = TimeSpan.FromMilliseconds(30),
            };
            _tick.Tick += OnTick;
            _tick.Start();
        }

        /// <summary>Règle le lissage anti-bruit (mêmes paramètres sur X et Y).</summary>
        public void SetSmoothing(double minCutoff, double beta)
        {
            _fx.MinCutoff = minCutoff; _fx.Beta = beta;
            _fy.MinCutoff = minCutoff; _fy.Beta = beta;
        }

        /// <summary>Règle le diamètre (px) du cercle de progression.</summary>
        public void SetIndicatorSize(double diameter)
        {
            double k = diameter / _indicator.Width; // conteneur de base = 90 px
            _indicator.RenderTransform = new ScaleTransform(k, k)
            {
                CenterX = _indicator.Width / 2,
                CenterY = _indicator.Height / 2,
            };
        }

        private double _lastGazeTime = -10; // dernier instant (s) où une donnée SDK est arrivée

        /// <summary>Reçoit un point de regard SDK (thread quelconque).</summary>
        public void PushGaze(GazePoint p)
        {
            _gx = p.X;
            _gy = p.Y;
            _hasGaze = true;
            _lastGazeTime = _clock.Elapsed.TotalSeconds;
        }

        private void OnTick(object sender, EventArgs e)
        {
            // Ne jamais laisser une exception tuer la boucle de regard.
            try { OnTickCore(); } catch { }
        }

        private void OnTickCore()
        {
            if (!Enabled || _root.ActualWidth <= 0)
            {
                HideDot();
                Cancel();
                return;
            }

            // 1) Source du point brut : on suit le curseur, sauf si des données SDK
            //    Tobii affluent réellement (sinon on ne verrait jamais le point).
            double t = _clock.Elapsed.TotalSeconds;
            bool sdkFresh = _hasGaze && (t - _lastGazeTime) < 0.4;
            Point raw;
            if (sdkFresh)
            {
                raw = new Point(_gx, _gy);
            }
            else if (GetCursorPos(out var cp))
            {
                raw = new Point(cp.X, cp.Y);
            }
            else
            {
                HideDot();
                Cancel();
                return;
            }

            // 2) Lissage anti-bruit (filtre 1 €).
            var screen = new Point(_fx.Filter(raw.X, t), _fy.Filter(raw.Y, t));
            _lastScreen = screen;

            Point local;
            try { local = _root.PointFromScreen(screen); }
            catch { HideDot(); Cancel(); return; }

            // Point de regard toujours visible (l'enfant voit où il regarde).
            PlaceDot(local);

            if (Locked) { Cancel(); return; }

            // 3) Dwell « par zone de stabilité » : une fois la cible verrouillée,
            //    tant que le regard reste dans un petit rayon, le compte à rebours
            //    continue jusqu'au bout (même si la détection clignote une image).
            if (_active && Distance(screen, _dwellScreen) <= HoldRadius)
            {
                SetDotActive(true);
                PlaceIndicator(_dwellLocal);
                double frac = Math.Min(1.0, (DateTime.UtcNow - _dwellStart).TotalMilliseconds / DwellTime);
                UpdateProgress(frac);
                if (frac >= 1.0) Commit();
                return;
            }

            // Courte pause après un clic (évite les clics en rafale), sans bloquer
            // spatialement les cibles voisines.
            if (t < _cooldownUntil) { SetDotActive(false); return; }

            // On (re)cherche une cible sous le point courant.
            var target = FindTarget(local);
            SetDotActive(target != null);
            if (target == null) { Cancel(); return; }

            // Démarrage d'un nouveau dwell, verrouillé sur cette cible et ce point.
            _active = true;
            _startTarget = target;
            _dwellScreen = screen;
            _dwellLocal = local;
            _dwellStart = DateTime.UtcNow;
            _indicator.Visibility = Visibility.Visible;
            PlaceIndicator(local);
            UpdateProgress(0);
            if (target is FrameworkElement fe && !(target is IGazeSurface)) BeginAlive(fe);
        }

        private void SetDotActive(bool active)
        {
            if (_dotShape != null) _dotShape.Fill = active ? DotActive : DotIdle;
        }

        private void PlaceDot(Point local)
        {
            if (_dot == null) return;
            Canvas.SetLeft(_dot, local.X - _dot.Width / 2);
            Canvas.SetTop(_dot, local.Y - _dot.Height / 2);
            if (_dot.Visibility != Visibility.Visible) _dot.Visibility = Visibility.Visible;
        }

        private void HideDot()
        {
            if (_dot != null && _dot.Visibility != Visibility.Collapsed) _dot.Visibility = Visibility.Collapsed;
        }

        private void Commit()
        {
            var target = _startTarget;
            var screen = _lastScreen;

            if (target is IGazeSurface surf)
            {
                if (surf.HitTestGaze(screen)) surf.CommitGaze(screen);
                // On désarme : il faudra bouger le regard pour colorier une nouvelle zone.
                Cancel();
            }
            else
            {
                Cancel();
                _cooldownUntil = _clock.Elapsed.TotalSeconds + 0.45; // petite pause avant le prochain clic
                if (target is ButtonBase btn) InvokeButton(btn);
            }
        }

        private void Cancel()
        {
            _active = false;
            _startTarget = null;
            StopAlive();
            UpdateProgress(0);
            if (_indicator.Visibility != Visibility.Collapsed)
                _indicator.Visibility = Visibility.Collapsed;
        }

        // Décalages d'« aimantation » : si le point n'est pas pile sur une cible,
        // on regarde tout autour (2 anneaux) pour attraper le bouton le plus proche.
        private static readonly Point[] SnapOffsets = BuildSnap();
        private static Point[] BuildSnap()
        {
            // Anneaux croissants (12 directions) : le premier bouton trouvé est le
            // plus proche. Rayon large pour combler les espaces entre cibles.
            var radii = new[] { 40.0, 75.0, 110.0, 150.0 };
            var arr = new Point[radii.Length * 12];
            int i = 0;
            for (int ri = 0; ri < radii.Length; ri++)
                for (int a = 0; a < 12; a++)
                {
                    double ang = Math.PI * 2 * a / 12 + (ri % 2 == 1 ? Math.PI / 12 : 0);
                    arr[i++] = new Point(Math.Cos(ang) * radii[ri], Math.Sin(ang) * radii[ri]);
                }
            return arr;
        }

        // --- Cible sous le regard (avec aimantation vers la plus proche) ---
        private object FindTarget(Point local)
        {
            var t = HitAt(local);
            if (t != null) return t;
            foreach (var o in SnapOffsets)
            {
                t = HitAt(new Point(local.X + o.X, local.Y + o.Y));
                if (t != null) return t;
            }
            return null;
        }

        private object HitAt(Point local)
        {
            DependencyObject hit = null;
            try
            {
                VisualTreeHelper.HitTest(
                    _root, null,
                    r => { hit = r.VisualHit; return HitTestResultBehavior.Stop; },
                    new PointHitTestParameters(local));
            }
            catch { return null; }

            var d = hit;
            int guard = 0;
            while (d != null && guard++ < 300)
            {
                if (d is IGazeSurface || d is ButtonBase) return d;
                d = SafeParent(d);
            }
            return null;
        }

        // Remonte l'arbre sans jamais lever d'exception (VisualTreeHelper.GetParent
        // lève pour un ContentElement ; on gère alors le parent logique).
        private static DependencyObject SafeParent(DependencyObject d)
        {
            if (d is Visual || d is Visual3D)
            {
                try
                {
                    var p = VisualTreeHelper.GetParent(d);
                    if (p != null) return p;
                }
                catch { }
            }
            return (d as FrameworkElement)?.Parent ?? (d as FrameworkContentElement)?.Parent;
        }

        private static double Distance(Point a, Point b)
        {
            double dx = a.X - b.X, dy = a.Y - b.Y;
            return Math.Sqrt(dx * dx + dy * dy);
        }

        // --- Cercle de progression (arc qui se remplit) ---
        private void PlaceIndicator(Point local)
        {
            Canvas.SetLeft(_indicator, local.X - _indicator.Width / 2);
            Canvas.SetTop(_indicator, local.Y - _indicator.Height / 2);
        }

        private void UpdateProgress(double frac)
        {
            frac = Math.Max(0, Math.Min(1, frac));
            double cx = _indicator.Width / 2, cy = _indicator.Height / 2, r = IndicatorR;
            if (frac <= 0.001)
            {
                _progress.Data = Geometry.Empty;
                return;
            }
            if (frac >= 0.999)
            {
                _progress.Data = new EllipseGeometry(new Point(cx, cy), r, r);
                return;
            }
            double ang = frac * 2 * Math.PI;
            var start = new Point(cx, cy - r);
            var end = new Point(cx + r * Math.Sin(ang), cy - r * Math.Cos(ang));
            var fig = new PathFigure { StartPoint = start, IsClosed = false };
            fig.Segments.Add(new ArcSegment(end, new Size(r, r), 0, frac > 0.5, SweepDirection.Clockwise, true));
            var geo = new PathGeometry();
            geo.Figures.Add(fig);
            _progress.Data = geo;
        }

        // --- « Prend vie » : la cible grossit doucement ---
        // (Pas de rotation/frémissement : cela déplacerait la cible sous le regard
        //  et pourrait ré-initialiser le dwell. On garde un simple agrandissement.)
        private void BeginAlive(FrameworkElement fe)
        {
            _aliveElement = fe;
            fe.RenderTransformOrigin = new Point(0.5, 0.5);
            var scale = new ScaleTransform(1, 1);
            fe.RenderTransform = scale;

            var dur = TimeSpan.FromMilliseconds(Math.Min(DwellTime, 500));
            scale.BeginAnimation(ScaleTransform.ScaleXProperty, new DoubleAnimation(1, 1.1, dur));
            scale.BeginAnimation(ScaleTransform.ScaleYProperty, new DoubleAnimation(1, 1.1, dur));
        }

        private void StopAlive()
        {
            if (_aliveElement != null)
            {
                _aliveElement.RenderTransform = Transform.Identity;
                _aliveElement = null;
            }
        }

        private static void InvokeButton(ButtonBase btn)
        {
            // Clic canonique via UI Automation (même mécanisme que les outils
            // d'accessibilité) ; repli sur l'événement routé Click.
            try
            {
                var peer = System.Windows.Automation.Peers.UIElementAutomationPeer.CreatePeerForElement(btn)
                           ?? System.Windows.Automation.Peers.UIElementAutomationPeer.FromElement(btn);
                if (peer?.GetPattern(System.Windows.Automation.Peers.PatternInterface.Invoke)
                        is System.Windows.Automation.Provider.IInvokeProvider invoke)
                {
                    invoke.Invoke();
                    return;
                }
            }
            catch { /* repli ci-dessous */ }

            btn.RaiseEvent(new RoutedEventArgs(ButtonBase.ClickEvent, btn));
            if (btn.Command != null && btn.Command.CanExecute(btn.CommandParameter))
                btn.Command.Execute(btn.CommandParameter);
        }
    }
}
