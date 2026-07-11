using System;
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
    /// posé sur une cible (bouton ou surface) pendant <see cref="DwellTime"/>,
    /// l'action est déclenchée. Un anneau de progression suit le regard et la
    /// cible « prend vie » (elle grossit et frémit), comme dans la version web.
    /// </summary>
    public sealed class DwellController
    {
        private readonly FrameworkElement _root;
        private readonly Canvas _overlay;
        private readonly Ellipse _ring;
        private readonly DispatcherTimer _tick;

        // Dernier point de regard reçu (écrit depuis le thread Tobii).
        private volatile bool _hasGaze;
        private double _gx, _gy;

        // État du dwell courant.
        private object _target;
        private FrameworkElement _aliveElement;
        private Point _dwellScreen;
        private Point _lastScreen;
        private DateTime _dwellStart;

        public bool Enabled { get; set; } = true;
        public bool Locked { get; set; } = false;
        public int DwellTime { get; set; } = 900; // ms

        /// <summary>
        /// Si vrai, on suit la position du curseur (déplacé au regard par la I-13
        /// en mode « Contrôle de l'ordinateur ») au lieu du flux SDK Tobii.
        /// </summary>
        public bool UseCursor { get; set; } = false;

        [DllImport("user32.dll")]
        private static extern bool GetCursorPos(out POINT p);

        [StructLayout(LayoutKind.Sequential)]
        private struct POINT { public int X; public int Y; }

        public DwellController(FrameworkElement root, Canvas overlay, Ellipse ring)
        {
            _root = root;
            _overlay = overlay;
            _ring = ring;
            _ring.Visibility = Visibility.Collapsed;

            _tick = new DispatcherTimer(DispatcherPriority.Input)
            {
                Interval = TimeSpan.FromMilliseconds(33), // ~30 img/s
            };
            _tick.Tick += OnTick;
            _tick.Start();
        }

        /// <summary>Reçoit un point de regard (thread quelconque).</summary>
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

            Point screen;
            if (UseCursor)
            {
                if (!GetCursorPos(out var cp)) { Cancel(); return; }
                screen = new Point(cp.X, cp.Y);
            }
            else
            {
                if (!_hasGaze) { Cancel(); return; }
                screen = new Point(_gx, _gy);
            }
            _lastScreen = screen;
            Point local;
            try { local = _root.PointFromScreen(screen); }
            catch { Cancel(); return; }

            var target = FindTarget(local);
            if (target == null) { Cancel(); return; }

            bool moved = Distance(screen, _dwellScreen) > MoveThreshold(target);
            bool changed = !ReferenceEquals(target, _target);

            if (changed || (target is IGazeSurface && moved))
                StartDwell(target, screen);

            // Anneau qui suit le regard.
            PlaceRing(local);

            var elapsed = (DateTime.UtcNow - _dwellStart).TotalMilliseconds;
            if (elapsed >= DwellTime)
                Commit();
        }

        private double MoveThreshold(object target) => target is IGazeSurface ? ((IGazeSurface)target).ReArmDistance : 40.0;

        private void StartDwell(object target, Point screen)
        {
            StopAlive();
            _target = target;
            _dwellScreen = screen;
            _dwellStart = DateTime.UtcNow;

            _ring.Visibility = Visibility.Visible;
            BeginRingGrow();

            if (target is FrameworkElement fe && !(target is IGazeSurface))
                BeginAlive(fe);
        }

        private void Commit()
        {
            var target = _target;
            var screen = _lastScreen;
            // On réinitialise avant l'action pour éviter un double déclenchement.
            _dwellStart = DateTime.UtcNow;

            if (target is IGazeSurface surf)
            {
                if (surf.HitTestGaze(screen)) surf.CommitGaze(screen);
                // La surface se ré-armera au prochain déplacement.
            }
            else
            {
                StopAlive();
                _ring.Visibility = Visibility.Collapsed;
                _target = null;
                if (target is ButtonBase btn) InvokeButton(btn);
            }
        }

        private void Cancel()
        {
            _target = null;
            StopAlive();
            if (_ring.Visibility != Visibility.Collapsed)
                _ring.Visibility = Visibility.Collapsed;
        }

        // --- Recherche de la cible sous le regard ---
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

        // --- Anneau de progression ---
        private void PlaceRing(Point local)
        {
            const double size = 84;
            Canvas.SetLeft(_ring, local.X - size / 2);
            Canvas.SetTop(_ring, local.Y - size / 2);
        }

        private void BeginRingGrow()
        {
            var grow = new DoubleAnimation(0.25, 1.0, TimeSpan.FromMilliseconds(DwellTime));
            var st = EnsureScale(_ring);
            st.BeginAnimation(ScaleTransform.ScaleXProperty, grow);
            st.BeginAnimation(ScaleTransform.ScaleYProperty, grow);
            _ring.BeginAnimation(UIElement.OpacityProperty,
                new DoubleAnimation(0.5, 0.9, TimeSpan.FromMilliseconds(DwellTime)));
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

        private static ScaleTransform EnsureScale(UIElement el)
        {
            if (el.RenderTransform is ScaleTransform s) return s;
            var st = new ScaleTransform(1, 1);
            el.RenderTransformOrigin = new Point(0.5, 0.5);
            el.RenderTransform = st;
            return st;
        }

        private static void InvokeButton(ButtonBase btn)
        {
            // Nos boutons réagissent tous à l'événement routé Click ; le lever
            // suffit à déclencher leurs gestionnaires (pas de dépendance UIAutomation).
            btn.RaiseEvent(new RoutedEventArgs(ButtonBase.ClickEvent, btn));
            if (btn.Command != null && btn.Command.CanExecute(btn.CommandParameter))
                btn.Command.Execute(btn.CommandParameter);
        }
    }
}
