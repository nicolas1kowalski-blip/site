using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Shapes;
using System.Windows.Threading;

namespace MesPremiersJeux.Gaze
{
    /// <summary>
    /// Dwell-click « à la GRID » : quand le point (curseur déplacé au regard, ou
    /// flux SDK Tobii) reste stable n'importe où sur la fenêtre, un cercle se
    /// remplit ; au bout du délai, un VRAI clic souris Windows est injecté à cet
    /// endroit. Aucune détection de cible : le système reçoit un clic physique,
    /// donc tout ce qui répond à la souris répond au regard.
    /// </summary>
    public sealed class DwellController
    {
        private readonly FrameworkElement _root;
        private readonly FrameworkElement _indicator; // cercle de progression (conteneur)
        private readonly Path _progress;              // arc qui se remplit
        private readonly FrameworkElement _dot;       // point de regard toujours visible
        private readonly DispatcherTimer _tick;
        private readonly Stopwatch _clock = Stopwatch.StartNew();

        private readonly OneEuroFilter _fx = new OneEuroFilter();
        private readonly OneEuroFilter _fy = new OneEuroFilter();

        // Dernier point de regard SDK reçu (écrit depuis le thread Tobii).
        private volatile bool _hasGaze;
        private double _gx, _gy;
        private double _lastGazeTime = -10;

        // Fenêtre de stabilité courante.
        private bool _holdActive;
        private Point _holdScreen;   // point (écran) où la stabilité a commencé
        private Point _holdLocal;    // idem, en coordonnées fenêtre
        private double _holdStart;   // en secondes (horloge interne)

        // Après un clic : petite pause + éviter de re-cliquer au même endroit.
        private double _cooldownUntil = -1;
        private bool _hasLastClick;
        private Point _lastClickScreen;
        private double _lastClickTime = -10;

        // Tolérances (généreuses : enfants en situation de handicap).
        private const double HoldRadius = 140;    // px : stabilité tant qu'on reste dans ce rayon
        private const double RearmDistance = 70;  // px : sortir de cette zone ré-arme le clic
        private const double RearmSeconds = 2.5;  // ou attendre ce délai pour re-cliquer au même endroit
        private const double CooldownSeconds = 0.7;
        private const double IndicatorR = 37;     // rayon de l'arc de progression

        public bool Enabled { get; set; } = true;
        public bool Locked { get; set; } = false;
        public int DwellTime { get; set; } = 900; // ms

        /// <summary>Levé à chaque clic injecté (diagnostic / retour visuel).</summary>
        public event Action<Point> Clicked;

        [DllImport("user32.dll")]
        private static extern bool GetCursorPos(out POINT p);

        [DllImport("user32.dll")]
        private static extern bool SetCursorPos(int x, int y);

        [DllImport("user32.dll")]
        private static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra);

        private const uint MOUSEEVENTF_LEFTDOWN = 0x02;
        private const uint MOUSEEVENTF_LEFTUP = 0x04;

        [StructLayout(LayoutKind.Sequential)]
        private struct POINT { public int X; public int Y; }

        public DwellController(FrameworkElement root, FrameworkElement indicator, Path progress, FrameworkElement dot)
        {
            _root = root;
            _indicator = indicator;
            _progress = progress;
            _dot = dot;
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
                HideAll();
                return;
            }

            // 1) Source du point : curseur (déplacé au regard sur la I-13, souris
            //    sur PC), sauf si des données SDK Tobii affluent réellement.
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
                HideAll();
                return;
            }

            // 2) Lissage anti-bruit (filtre 1 €).
            var screen = new Point(_fx.Filter(raw.X, t), _fy.Filter(raw.Y, t));

            Point local;
            try { local = _root.PointFromScreen(screen); }
            catch { HideAll(); return; }

            // Point de regard toujours visible.
            PlaceDot(local);

            if (Locked) { ResetHold(); return; }

            // 3) Petite pause après un clic.
            if (t < _cooldownUntil) { ResetHold(); return; }

            // 4) Ré-armement : pour re-cliquer au même endroit, il faut s'éloigner
            //    un peu OU attendre un court délai (évite les clics en rafale).
            if (_hasLastClick
                && Distance(screen, _lastClickScreen) < RearmDistance
                && (t - _lastClickTime) < RearmSeconds)
            {
                ResetHold();
                return;
            }

            // 5) Fenêtre de stabilité : si le point sort du rayon, on repart d'ici.
            if (!_holdActive || Distance(screen, _holdScreen) > HoldRadius)
            {
                _holdActive = true;
                _holdScreen = screen;
                _holdLocal = local;
                _holdStart = t;
                _indicator.Visibility = Visibility.Visible;
                PlaceIndicator(local);
                UpdateProgress(0);
                return;
            }

            // 6) Stable : le cercle se remplit, puis on clique POUR DE VRAI.
            PlaceIndicator(_holdLocal);
            double frac = Math.Min(1.0, (t - _holdStart) * 1000.0 / DwellTime);
            UpdateProgress(frac);
            if (frac >= 1.0) Click(screen, t);
        }

        // Injecte un vrai clic souris Windows au point donné (pixels écran).
        private void Click(Point screen, double t)
        {
            ResetHold();
            _cooldownUntil = t + CooldownSeconds;
            _hasLastClick = true;
            _lastClickScreen = screen;
            _lastClickTime = t;

            try
            {
                SetCursorPos((int)Math.Round(screen.X), (int)Math.Round(screen.Y));
                mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, UIntPtr.Zero);
                mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, UIntPtr.Zero);
            }
            catch { /* rien : le prochain dwell retentera */ }

            Clicked?.Invoke(screen);
        }

        private void ResetHold()
        {
            _holdActive = false;
            UpdateProgress(0);
            if (_indicator.Visibility != Visibility.Collapsed)
                _indicator.Visibility = Visibility.Collapsed;
        }

        private void HideAll()
        {
            ResetHold();
            if (_dot != null && _dot.Visibility != Visibility.Collapsed)
                _dot.Visibility = Visibility.Collapsed;
        }

        private void PlaceDot(Point local)
        {
            if (_dot == null) return;
            Canvas.SetLeft(_dot, local.X - _dot.Width / 2);
            Canvas.SetTop(_dot, local.Y - _dot.Height / 2);
            if (_dot.Visibility != Visibility.Visible) _dot.Visibility = Visibility.Visible;
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
    }
}
