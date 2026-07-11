using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Media;
using System.Windows.Media.Animation;
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

        // État du dwell courant.
        private object _target;
        private FrameworkElement _aliveElement;
        private Point _dwellScreen;   // point (lissé) au démarrage du dwell
        private Point _lastScreen;    // dernier point lissé
        private DateTime _dwellStart;
        private int _missTicks;       // images consécutives sans cible

        // Tolérances.
        private const int GraceTicks = 5;         // ~165 ms de perte tolérée
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

        public DwellController(FrameworkElement root, FrameworkElement indicator, Path progress)
        {
            _root = root;
            _indicator = indicator;
            _progress = progress;
            _indicator.Visibility = Visibility.Collapsed;

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

        /// <summary>Reçoit un point de regard SDK (thread quelconque).</summary>
        public void PushGaze(GazePoint p)
        {
            _gx = p.X;
            _gy = p.Y;
            _hasGaze = true;
        }

        private void OnTick(object sender, EventArgs e)
        {
            if (!Enabled || Locked || _root.ActualWidth <= 0)
            {
                Cancel();
                return;
            }

            // 1) Source du point brut.
            Point raw;
            if (UseCursor)
            {
                if (!GetCursorPos(out var cp)) { Cancel(); return; }
                raw = new Point(cp.X, cp.Y);
            }
            else
            {
                if (!_hasGaze) { Cancel(); return; }
                raw = new Point(_gx, _gy);
            }

            // 2) Lissage anti-bruit (filtre 1 €).
            double t = _clock.Elapsed.TotalSeconds;
            var screen = new Point(_fx.Filter(raw.X, t), _fy.Filter(raw.Y, t));
            _lastScreen = screen;

            Point local;
            try { local = _root.PointFromScreen(screen); }
            catch { Cancel(); return; }

            // 3) Cible sous le regard, avec tolérance aux brèves pertes.
            var target = FindTarget(local);
            if (target == null)
            {
                if (_target != null && _missTicks++ < GraceTicks) return; // on maintient
                Cancel();
                return;
            }
            _missTicks = 0;

            bool moved = Distance(screen, _dwellScreen) > MoveThreshold(target);
            bool changed = !ReferenceEquals(target, _target);
            if (changed || (target is IGazeSurface && moved))
                StartDwell(target, screen);

            // 4) Indicateur + progression.
            PlaceIndicator(local);
            double frac = Math.Min(1.0, (DateTime.UtcNow - _dwellStart).TotalMilliseconds / DwellTime);
            UpdateProgress(frac);

            if (frac >= 1.0) Commit();
        }

        private double MoveThreshold(object target)
            => target is IGazeSurface s ? s.ReArmDistance : 60.0;

        private void StartDwell(object target, Point screen)
        {
            StopAlive();
            _target = target;
            _dwellScreen = screen;
            _dwellStart = DateTime.UtcNow;
            _indicator.Visibility = Visibility.Visible;
            UpdateProgress(0);
            if (target is FrameworkElement fe && !(target is IGazeSurface))
                BeginAlive(fe);
        }

        private void Commit()
        {
            var target = _target;
            var screen = _lastScreen;
            _dwellStart = DateTime.UtcNow; // ré-armement immédiat

            if (target is IGazeSurface surf)
            {
                if (surf.HitTestGaze(screen)) surf.CommitGaze(screen);
                UpdateProgress(0);
            }
            else
            {
                StopAlive();
                _indicator.Visibility = Visibility.Collapsed;
                _target = null;
                if (target is ButtonBase btn) InvokeButton(btn);
            }
        }

        private void Cancel()
        {
            _target = null;
            _missTicks = 0;
            StopAlive();
            if (_indicator.Visibility != Visibility.Collapsed)
                _indicator.Visibility = Visibility.Collapsed;
        }

        // --- Cible sous le regard ---
        private object FindTarget(Point local)
        {
            DependencyObject hit = null;
            VisualTreeHelper.HitTest(
                _root, null,
                r => { hit = r.VisualHit; return HitTestResultBehavior.Stop; },
                new PointHitTestParameters(local));

            var d = hit;
            while (d != null)
            {
                if (d is IGazeSurface || d is ButtonBase) return d;
                d = VisualTreeHelper.GetParent(d) ?? (d as FrameworkElement)?.Parent;
            }
            return null;
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

        // --- « Prend vie » : la cible grossit et frémit ---
        private void BeginAlive(FrameworkElement fe)
        {
            _aliveElement = fe;
            fe.RenderTransformOrigin = new Point(0.5, 0.5);
            var scale = new ScaleTransform(1, 1);
            var rot = new RotateTransform(0);
            fe.RenderTransform = new TransformGroup { Children = { scale, rot } };

            var dur = TimeSpan.FromMilliseconds(DwellTime);
            scale.BeginAnimation(ScaleTransform.ScaleXProperty, new DoubleAnimation(1, 1.14, dur));
            scale.BeginAnimation(ScaleTransform.ScaleYProperty, new DoubleAnimation(1, 1.14, dur));

            var wobble = new DoubleAnimationUsingKeyFrames { RepeatBehavior = RepeatBehavior.Forever };
            wobble.KeyFrames.Add(new LinearDoubleKeyFrame(0, KeyTime.FromPercent(0)));
            wobble.KeyFrames.Add(new LinearDoubleKeyFrame(-3.5, KeyTime.FromPercent(0.25)));
            wobble.KeyFrames.Add(new LinearDoubleKeyFrame(0, KeyTime.FromPercent(0.5)));
            wobble.KeyFrames.Add(new LinearDoubleKeyFrame(3.5, KeyTime.FromPercent(0.75)));
            wobble.KeyFrames.Add(new LinearDoubleKeyFrame(0, KeyTime.FromPercent(1)));
            wobble.Duration = TimeSpan.FromMilliseconds(260);
            rot.BeginAnimation(RotateTransform.AngleProperty, wobble);
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
            // Nos boutons réagissent à l'événement routé Click ; le lever suffit
            // (pas de dépendance UIAutomation).
            btn.RaiseEvent(new RoutedEventArgs(ButtonBase.ClickEvent, btn));
            if (btn.Command != null && btn.Command.CanExecute(btn.CommandParameter))
                btn.Command.Execute(btn.CommandParameter);
        }
    }
}
