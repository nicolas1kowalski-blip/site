using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.Linq;
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

        // Après un clic : petite pause + éviter de re-cliquer au même endroit.
        private double _cooldownUntil = -1;
        private bool _hasLastClick;
        private Point _lastClickScreen;

        // Anti-bruit renforcé : médiane (rejet des à-coups de tête) + zone morte
        // (le point ne bouge pas tant que le regard ne se déplace pas franchement).
        private readonly double[] _mx = new double[5];
        private readonly double[] _my = new double[5];
        private int _mCount;
        private Point _display;
        private bool _hasDisplay;
        private double _lastMoveTime;
        private double _deadZone = 18;   // px : micro-bougés ignorés

        // Détection « regard perdu » via la validité des yeux (SDK Tobii).
        private volatile bool _eyeSeen;
        private double _lastEyeValidTime = -10;
        private bool _lostLogged;
        private double _lastHeartbeat = -10;

        // Tolérances (généreuses : enfants en situation de handicap).
        private const double HoldRadius = 150;      // px : stabilité tant qu'on reste dans ce rayon
        private const double RearmDistance = 95;    // px : il FAUT s'éloigner pour re-sélectionner
        private const double CooldownSeconds = 0.5;
        private const double MoveEps = 6;           // px : en deçà, on considère le point immobile
        private const double GazeLostSeconds = 0.60; // yeux invalides plus longtemps = regard perdu
                                                     // (0,6 s : un clignement ne coupe pas le point)
        private const double FrozenSeconds = 2.2;   // point figé plus longtemps = pas d'action
        private const double IndicatorR = 37;       // rayon de l'arc de progression

        // --- Aimant à cibles + fixation « intelligente » ---
        private const double SnapRadius = 80;        // px : le regard proche d'un bouton est attiré dessus
        private const double GraceSeconds = 0.35;    // un écart bref ne remet PAS la progression à zéro
        private const double SaccadePxPerSec = 1100; // au-delà = mouvement brusque : progression en pause

        private List<GazeTargets.Target> _targets = new List<GazeTargets.Target>();
        private double _lastTargetScan = -10;
        private FrameworkElement _curTargetEl;   // cible en cours de fixation
        private Rect _curTargetRect;
        private double _progressSec;             // fixation accumulée (s)
        private double _lastTickTime = -1;
        private double _outSince = -1;           // sortie momentanée (grâce)
        private Point _prevScreen;
        private bool _hasPrevScreen;
        private readonly Border _highlight;      // halo posé sur la cible visée
        private readonly Canvas _layer;          // calque des indicateurs

        // --- MÉMOIRE DE PROGRESSION (secousses de tête, clignements longs) ---
        // Quand le regard quitte une cible, sa progression n'est pas jetée : elle
        // DÉCROÎT. Si le regard revient sur la MÊME cible dans la foulée, on
        // repart de ce qui reste au lieu de zéro — décisif quand la tête bouge.
        private FrameworkElement _memTargetEl;
        private double _memProgress;
        private double _memAt = -10;
        private const double MemWindowSec = 1.6;   // durée de validité de la mémoire
        private const double MemDecayPerSec = 0.9; // fraction de fixation perdue par seconde

        // --- BRUIT MESURÉ + FIXATION ADAPTATIVE ---
        // On mesure en continu l'agitation du regard (px par tic, après médiane).
        // Quand ça tremble, le temps de fixation s'allonge automatiquement (jusqu'à
        // +60 %) pour éviter les clics accidentels ; quand c'est calme, il revient
        // à la valeur réglée. C'est ce que font les systèmes pro.
        private double _jitterEma;
        private Point _prevMed;
        private bool _hasPrevMed;
        private const double JitterCalmPx = 7;   // en deçà : aucun rallongement

        /// <summary>Rallonge la fixation quand le regard tremble (activé par défaut).</summary>
        public bool AdaptiveDwell { get; set; } = true;

        /// <summary>Agitation mesurée du regard (px par tic, lissée).</summary>
        public double JitterPx => _jitterEma;

        /// <summary>Temps de fixation réellement appliqué (ms), bruit compris.</summary>
        public double EffectiveDwellMs
        {
            get
            {
                if (!AdaptiveDwell) return DwellTime;
                double over = Math.Max(0, _jitterEma - JitterCalmPx);
                return DwellTime * (1 + Math.Min(0.6, over / 40.0));
            }
        }

        // --- PUITS DE GRAVITÉ : une cible ENGAGÉE (progression entamée) retient
        // le regard plus fort — rayon d'accroche élargi et hystérésis renforcée —
        // pour que les secousses ne la fassent pas lâcher. ---
        private const double EngagedSnapBoost = 1.5;   // rayon d'accroche ×1,5
        private const double EngagedStickyBoost = 1.8; // hystérésis voisine ×1,8

        // --- RÉGLAGE ÉCLAIR (1 point) : décalage global appliqué avant tout le
        // reste, mesuré en ~3 s sur une seule étoile centrale. Recale le regard
        // sans refaire les 9 points. ---
        private Vector _quickOffset;

        /// <summary>Ajoute le décalage mesuré par le réglage éclair (plafonné).</summary>
        public void NudgeQuickOffset(Vector v)
        {
            _quickOffset += v;
            if (_quickOffset.Length > 160) _quickOffset = _quickOffset / _quickOffset.Length * 160;
            Lib.Log.Write("dwell", FormattableString.Invariant(
                $"Réglage éclair : +({v.X:0};{v.Y:0}) → total ({_quickOffset.X:0};{_quickOffset.Y:0})"));
        }

        public string QuickOffsetToString() => string.Format(CultureInfo.InvariantCulture,
            "{0:0.#};{1:0.#}", _quickOffset.X, _quickOffset.Y);

        public void SetQuickOffsetFromString(string s)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(s)) { _quickOffset = new Vector(0, 0); return; }
                var v = s.Split(';');
                if (v.Length == 2)
                    _quickOffset = new Vector(
                        double.Parse(v[0], CultureInfo.InvariantCulture),
                        double.Parse(v[1], CultureInfo.InvariantCulture));
            }
            catch { _quickOffset = new Vector(0, 0); }
        }

        /// <summary>Résumé de l'état de précision (affiché dans les réglages).</summary>
        public string PrecisionInfo => FormattableString.Invariant(
            $"bruit {_jitterEma:0.0} px · fixation {EffectiveDwellMs:0} ms · dérive ({_drift.X:0};{_drift.Y:0}) · éclair ({_quickOffset.X:0};{_quickOffset.Y:0})");

        /// <summary>Vrai : le dwell ne se déclenche que sur des cibles (jeux d'exploration).</summary>
        public bool TargetsOnly { get; set; }

        /// <summary>Vrai : pointer avec le curseur TD Control même si le regard direct émet.</summary>
        public bool PreferCursor { get; set; }

        // --- Correction de précision (« étoile ») : décalages mesurés en 9 points,
        // interpolés sur tout l'écran et appliqués au point brut. ---
        private (Point Anchor, Vector Offset)[] _bias;

        // --- Micro-correction continue (dérive apprise) : à chaque sélection, on
        // note de quel côté le regard « atterrit » par rapport au centre visé, et
        // on compense doucement. Corrige le « c'est toujours le voisin du même
        // côté qui gagne ». ---
        private Vector _drift;
        private const double DriftAlpha = 0.06; // apprentissage doux
        private const double DriftMax = 50;     // px : compensation plafonnée

        // --- Compensation de la POSITION DE LA TÊTE ---
        // L'étoile mémorise où était la tête pendant la mesure (_headRef). En jeu,
        // on suit la tête (_headNow, lissée) et on apprend comment le décalage
        // varie quand elle s'écarte de la référence (gains linéaires, appris à
        // chaque sélection réussie — méthode LMS, plafonnée).
        private double _hx, _hy, _hz;          // tête actuelle (lissée, 0..1)
        private volatile bool _headSeen;
        private (double X, double Y, double Z)? _headRef;
        private double _gxx, _gxz, _gyy, _gyz; // gains appris (px par unité de déplacement)
        private const double HeadMu = 0.04;    // vitesse d'apprentissage
        private const double HeadGainMax = 600;
        private const double HeadDeltaMax = 0.5;

        /// <summary>Instance active (fenêtre de calibration : lecture de la tête).</summary>
        public static DwellController Instance { get; private set; }

        /// <summary>Position actuelle de la tête (lissée) et validité.</summary>
        public (bool Ok, double X, double Y, double Z) CurrentHead =>
            (_headSeen, _hx, _hy, _hz);

        /// <summary>Accès sûr à la tête depuis les fenêtres (null-safe).</summary>
        public static (bool Ok, double X, double Y, double Z) CurrentHeadSafe()
            => Instance?.CurrentHead ?? (false, 0, 0, 0);

        /// <summary>Vrai si la tête est loin de la position où l'étoile a été faite.</summary>
        public bool HeadFarFromRef =>
            _headRef.HasValue && _headSeen &&
            Math.Abs(_hx - _headRef.Value.X) + Math.Abs(_hy - _headRef.Value.Y) + Math.Abs(_hz - _headRef.Value.Z) > 0.28;

        /// <summary>Reçoit la position des yeux (thread SDK) pour suivre la tête.</summary>
        public void PushHead(EyeSample s)
        {
            if (!s.AnyValid) return;
            double x = s.HasLeft && s.HasRight ? (s.LX + s.RX) / 2 : (s.HasLeft ? s.LX : s.RX);
            double y = s.HasLeft && s.HasRight ? (s.LY + s.RY) / 2 : (s.HasLeft ? s.LY : s.RY);
            double z = s.HasLeft && s.HasRight ? (s.LZ + s.RZ) / 2 : (s.HasLeft ? s.LZ : s.RZ);
            if (double.IsNaN(x) || double.IsNaN(y) || double.IsNaN(z)) return;
            if (!_headSeen) { _hx = x; _hy = y; _hz = z; _headSeen = true; return; }
            const double a = 0.12; // lissage doux
            _hx += (x - _hx) * a; _hy += (y - _hy) * a; _hz += (z - _hz) * a;
        }

        // Écart actuel de la tête par rapport à la référence de l'étoile (borné).
        private (double dx, double dy, double dz) HeadDelta()
        {
            if (!_headRef.HasValue || !_headSeen) return (0, 0, 0);
            double C(double v) => Math.Max(-HeadDeltaMax, Math.Min(HeadDeltaMax, v));
            return (C(_hx - _headRef.Value.X), C(_hy - _headRef.Value.Y), C(_hz - _headRef.Value.Z));
        }

        // Hystérésis entre cibles voisines : il faut être NETTEMENT plus près du
        // centre de la voisine pour changer de cible.
        private const double StickyMargin = 30;

        public bool Enabled { get; set; } = true;
        public bool Locked { get; set; } = false;
        public int DwellTime { get; set; } = 900; // ms

        /// <summary>Source réellement utilisée au dernier instant (« Regard direct » / « Curseur »).</summary>
        public string ActiveSource { get; private set; } = "…";

        /// <summary>Levé à chaque clic injecté (diagnostic / retour visuel).</summary>
        public event Action<Point> Clicked;

        [DllImport("user32.dll")]
        private static extern bool GetCursorPos(out POINT p);

        [DllImport("user32.dll")]
        private static extern bool SetCursorPos(int x, int y);

        [DllImport("user32.dll")]
        private static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra);

        [DllImport("user32.dll")]
        private static extern int GetSystemMetrics(int index);

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

            // Halo doré posé sur la cible visée (sous le cercle de progression).
            _layer = indicator.Parent as Canvas;
            _highlight = new Border
            {
                CornerRadius = new CornerRadius(18),
                BorderBrush = new SolidColorBrush(Color.FromRgb(0xFF, 0xC1, 0x07)),
                BorderThickness = new Thickness(5),
                Background = new SolidColorBrush(Color.FromArgb(0x22, 0xFF, 0xC1, 0x07)),
                Visibility = Visibility.Collapsed,
                IsHitTestVisible = false,
            };
            _layer?.Children.Insert(0, _highlight);

            _tick = new DispatcherTimer(DispatcherPriority.Input)
            {
                Interval = TimeSpan.FromMilliseconds(30),
            };
            _tick.Tick += OnTick;
            _tick.Start();
            Instance = this;
        }

        /// <summary>Règle le lissage anti-bruit (mêmes paramètres sur X et Y).</summary>
        public void SetSmoothing(double minCutoff, double beta)
        {
            _fx.MinCutoff = minCutoff; _fx.Beta = beta;
            _fy.MinCutoff = minCutoff; _fy.Beta = beta;
        }

        /// <summary>Règle la stabilité globale : lissage + taille de la zone morte.</summary>
        public void SetStability(double minCutoff, double beta, double deadZone)
        {
            SetSmoothing(minCutoff, beta);
            _deadZone = Math.Max(0, deadZone);
        }

        // Rythme réel des mesures de présence (certaines sources émettent à 60 Hz,
        // d'autres — le « guide » Tobii — à quelques Hz seulement) : le seuil de
        // « regard perdu » s'adapte à ce rythme.
        private double _eyeIntervalEma = 0.05;
        private double _lastEyeAnyTime = -10;

        /// <summary>Reçoit la validité des yeux (thread SDK) pour détecter la perte du regard.</summary>
        public void PushEye(bool anyValid)
        {
            double t = _clock.Elapsed.TotalSeconds;
            if (_lastEyeAnyTime > 0)
            {
                double dt = Math.Min(1.0, t - _lastEyeAnyTime);
                _eyeIntervalEma = 0.7 * _eyeIntervalEma + 0.3 * dt;
            }
            _lastEyeAnyTime = t;
            _eyeSeen = true;
            if (anyValid) _lastEyeValidTime = t;
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

        // ------------------------------------------------------------------
        // Correction de précision (« suis l'étoile ») : offsets mesurés en
        // quelques points d'ancrage (coordonnées normalisées 0..1), interpolés
        // par pondération inverse à la distance, appliqués au point brut.
        // ------------------------------------------------------------------
        public void SetBias(IList<(Point Anchor, Vector Offset)> points,
                            (double X, double Y, double Z)? headRef = null)
        {
            _bias = points != null && points.Count > 0 ? points.ToArray() : null;
            _headRef = _bias == null ? null : headRef;
            _drift = new Vector(0, 0);              // la dérive apprise repart de zéro
            _gxx = _gxz = _gyy = _gyz = 0;          // les gains « tête » aussi
            _quickOffset = new Vector(0, 0);        // une vraie étoile remplace l'éclair
            Lib.Log.Write("dwell", _bias == null
                ? "Correction de précision effacée"
                : "Correction de précision appliquée (" + _bias.Length + " points"
                  + (headRef.HasValue ? FormattableString.Invariant(
                        $", tête réf. {headRef.Value.X:0.00};{headRef.Value.Y:0.00};{headRef.Value.Z:0.00}") : "")
                  + ")");
        }

        public void SetBiasFromString(string s)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(s)) { _bias = null; _headRef = null; return; }
                (double, double, double)? head = null;
                var list = new List<(Point, Vector)>();
                foreach (var part in s.Split(';'))
                {
                    if (part.StartsWith("H:")) // position de la tête pendant l'étoile
                    {
                        var hv = part.Substring(2).Split(',');
                        if (hv.Length == 3)
                            head = (double.Parse(hv[0], CultureInfo.InvariantCulture),
                                    double.Parse(hv[1], CultureInfo.InvariantCulture),
                                    double.Parse(hv[2], CultureInfo.InvariantCulture));
                        continue;
                    }
                    var v = part.Split(',');
                    if (v.Length != 4) continue;
                    list.Add((new Point(
                            double.Parse(v[0], CultureInfo.InvariantCulture),
                            double.Parse(v[1], CultureInfo.InvariantCulture)),
                        new Vector(
                            double.Parse(v[2], CultureInfo.InvariantCulture),
                            double.Parse(v[3], CultureInfo.InvariantCulture))));
                }
                SetBias(list, head);
            }
            catch { _bias = null; _headRef = null; }
        }

        public static string BiasToString(IList<(Point Anchor, Vector Offset)> points,
                                          (double X, double Y, double Z)? headRef = null)
        {
            if (points == null || points.Count == 0) return "";
            var body = string.Join(";", points.Select(p => string.Format(CultureInfo.InvariantCulture,
                "{0:0.####},{1:0.####},{2:0.#},{3:0.#}", p.Anchor.X, p.Anchor.Y, p.Offset.X, p.Offset.Y)));
            if (headRef.HasValue)
                body = string.Format(CultureInfo.InvariantCulture, "H:{0:0.###},{1:0.###},{2:0.###};",
                    headRef.Value.X, headRef.Value.Y, headRef.Value.Z) + body;
            return body;
        }

        private Point ApplyBias(Point raw)
        {
            // Réglage éclair (1 point) : décalage global, appliqué en premier.
            raw = new Point(raw.X + _quickOffset.X, raw.Y + _quickOffset.Y);

            // Dérive apprise (toujours appliquée, même sans étoile).
            raw = new Point(raw.X + _drift.X, raw.Y + _drift.Y);

            // Compensation « tête » apprise : le décalage supplémentaire dû à
            // l'écart entre la tête actuelle et la position de calibration.
            var (hdx, hdy, hdz) = HeadDelta();
            raw = new Point(raw.X + _gxx * hdx + _gxz * hdz,
                            raw.Y + _gyy * hdy + _gyz * hdz);

            var b = _bias;
            if (b == null) return raw;
            double w = GetSystemMetrics(0), h = GetSystemMetrics(1);
            if (w <= 0 || h <= 0) return raw;
            double nx = raw.X / w, ny = raw.Y / h;
            double sw = 0, ox = 0, oy = 0;
            foreach (var p in b)
            {
                double dx = nx - p.Anchor.X, dy = ny - p.Anchor.Y;
                double wi = 1.0 / (dx * dx + dy * dy + 0.004); // correction locale (9 points)
                sw += wi; ox += p.Offset.X * wi; oy += p.Offset.Y * wi;
            }
            return new Point(raw.X + ox / sw, raw.Y + oy / sw);
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
            if (_root.ActualWidth <= 0)
            {
                HideAll();
                return;
            }

            double t = _clock.Elapsed.TotalSeconds;
            double dt = _lastTickTime < 0 ? 0.03 : Math.Min(0.1, t - _lastTickTime);
            _lastTickTime = t;

            // 0) Regard perdu (yeux invalides) : le curseur disparaît et rien n'est
            //    sélectionné tant que les yeux ne sont pas revenus. Le seuil s'adapte
            //    au rythme de la source de présence (guide Tobii = quelques Hz).
            if (_eyeSeen && (t - _lastEyeAnyTime) > 10)
            {
                _eyeSeen = false; // source de présence morte : on n'aveugle pas l'appli
                Lib.Log.Write("dwell", "Source de présence muette depuis 10 s : détection de perte désactivée");
            }
            double lostAfter = Math.Max(GazeLostSeconds, _eyeIntervalEma * 4 + 0.15);
            if (_eyeSeen && (t - _lastEyeValidTime) > lostAfter)
            {
                if (!_lostLogged)
                {
                    _lostLogged = true;
                    Lib.Log.Write("dwell", FormattableString.Invariant(
                        $"REGARD PERDU (dernier valide il y a {t - _lastEyeValidTime:0.00}s, seuil {lostAfter:0.00}s, rythme {_eyeIntervalEma * 1000:0} ms)"));
                }
                HideAll();
                _hasDisplay = false;
                _mCount = 0; // repart proprement quand le regard revient
                GazeFeed.Push(_display, false); // les jeux savent que le regard est parti
                return;
            }
            if (_lostLogged)
            {
                _lostLogged = false;
                Lib.Log.Write("dwell", "Regard retrouvé");
            }

            // 1) Source du point : le regard direct (SDK) s'il émet — sauf si le
            //    parent a choisi le curseur TD Control — sinon le curseur.
            bool sdkFresh = !PreferCursor && _hasGaze && (t - _lastGazeTime) < 0.4;
            ActiveSource = sdkFresh ? "Regard direct" : "Curseur";
            Point raw;
            if (sdkFresh) raw = new Point(_gx, _gy);
            else if (GetCursorPos(out var cp)) raw = new Point(cp.X, cp.Y);
            else { HideAll(); return; }

            // Flux partagé (étoile de précision : point brut AVANT correction).
            GazeFeed.PushRaw(raw);
            // Correction de précision mesurée avec l'étoile.
            raw = ApplyBias(raw);

            // Battement de cœur toutes les 2 s : l'état complet du moteur.
            if (t - _lastHeartbeat > 2)
            {
                _lastHeartbeat = t;
                Lib.Log.Write("dwell", FormattableString.Invariant(
                    $"hb src={(sdkFresh ? "REGARD-DIRECT" : "CURSEUR")} pos=({raw.X:0};{raw.Y:0}) actif={Enabled} yeuxVus={_eyeSeen} âgeValide={(t - _lastEyeValidTime):0.00}s rythme={_eyeIntervalEma * 1000:0}ms fixation={_holdActive} verrou={Locked} dérive=({_drift.X:0};{_drift.Y:0})"));
            }

            // 2) Médiane courte (rejette les à-coups de tête) puis filtre 1 €.
            var med = Median(raw);
            // Bruit mesuré (px par tic, lissé) : pilote la fixation adaptative.
            if (_hasPrevMed)
                _jitterEma += (Distance(med, _prevMed) - _jitterEma) * 0.05;
            _prevMed = med; _hasPrevMed = true;
            var filtered = new Point(_fx.Filter(med.X, t), _fy.Filter(med.Y, t));

            // 3) Zone morte : on ne déplace le point que si le regard s'est vraiment
            //    déplacé — sinon on le fige (compense les tremblements).
            if (!_hasDisplay)
            {
                _display = filtered; _hasDisplay = true; _lastMoveTime = t;
            }
            else if (Distance(filtered, _display) > _deadZone)
            {
                if (Distance(filtered, _display) > MoveEps) _lastMoveTime = t;
                _display = filtered;
            }
            var screen = _display;

            // Vitesse du point affiché : un mouvement brusque (saccade, à-coup de
            // tête) met la progression en PAUSE au lieu de la remettre à zéro.
            double speed = 0;
            if (_hasPrevScreen && dt > 0) speed = Distance(screen, _prevScreen) / dt;
            _prevScreen = screen; _hasPrevScreen = true;
            bool saccade = speed > SaccadePxPerSec;

            // Flux partagé : point affiché (jeux « cause à effet », bilan…).
            GazeFeed.Push(screen, true);

            // Regard en pause (fenêtre parent, case décochée…) : le flux continue
            // mais ni point, ni sélection.
            if (!Enabled) { HideAll(); return; }

            Point local;
            try { local = _root.PointFromScreen(screen); }
            catch { HideAll(); return; }

            PlaceDot(local);

            if (Locked) { ResetHold(); return; }

            // 4) Point FIGÉ trop longtemps (regard immobile / curseur gelé) : aucune
            //    sélection. Il faut un vrai mouvement pour (re)déclencher une action.
            if ((t - _lastMoveTime) > FrozenSeconds) { ResetHold(); return; }

            // 5) Petite pause après un clic.
            if (t < _cooldownUntil) { ResetHold(); return; }

            // 6) Ré-armement STRICT : pour re-sélectionner, il faut d'abord S'ÉLOIGNER
            //    du dernier clic (plus de re-clics en rafale sur place).
            if (_hasLastClick && Distance(screen, _lastClickScreen) < RearmDistance)
            {
                ResetHold();
                return;
            }
            _hasLastClick = false; // on s'est éloigné : ré-armé

            // 7) AIMANT À CIBLES : les boutons visibles sont recensés, et le regard
            //    posé sur (ou près d') une cible remplit le cercle SUR la cible.
            if (t - _lastTargetScan > 0.4)
            {
                _lastTargetScan = t;
                try { _targets = GazeTargets.Collect(_root); } catch { _targets = new List<GazeTargets.Target>(); }
            }

            var tgt = FindTarget(screen);

            // Hystérésis entre voisins : quand une cible est déjà engagée, la
            // voisine ne la « vole » que si le regard est clairement DANS la
            // voisine ET nettement plus près de son centre. Sinon, à la frontière,
            // le bruit ferait toujours gagner le voisin du même côté.
            if (tgt != null && _curTargetEl != null && !ReferenceEquals(tgt.Element, _curTargetEl))
            {
                var cur = _targets.FirstOrDefault(x => ReferenceEquals(x.Element, _curTargetEl));
                // PUITS DE GRAVITÉ : plus la fixation est engagée, plus la cible
                // en cours retient le regard (rayon élargi, hystérésis renforcée).
                bool engaged = _progressSec * 1000.0 > EffectiveDwellMs * 0.15;
                double keepRadius = SnapRadius * (engaged ? EngagedSnapBoost : 1.0);
                double sticky = StickyMargin * (engaged ? EngagedStickyBoost : 1.0);
                if (cur != null && RectDistance(cur.ScreenRect, screen) <= keepRadius)
                {
                    bool insideNew = tgt.ScreenRect.Contains(screen);
                    double dNew = Distance(screen, RectCenter(tgt.ScreenRect));
                    double dCur = Distance(screen, RectCenter(cur.ScreenRect));
                    if (!insideNew || dNew > dCur - sticky)
                        tgt = cur; // on reste sur la cible engagée
                }
            }

            if (tgt != null)
            {
                if (!ReferenceEquals(tgt.Element, _curTargetEl))
                {
                    // Nouvelle cible : la progression repart — SAUF si c'est la même
                    // cible qu'il y a un instant (secousse de tête, clignement) :
                    // on reprend alors ce qui reste de la progression décrue.
                    _curTargetEl = tgt.Element;
                    _holdActive = false;
                    if (ReferenceEquals(tgt.Element, _memTargetEl) && (t - _memAt) < MemWindowSec)
                    {
                        double kept = _memProgress - (t - _memAt) * MemDecayPerSec * (EffectiveDwellMs / 1000.0);
                        _progressSec = Math.Max(0, kept);
                    }
                    else _progressSec = 0;
                    _memTargetEl = null;
                }
                _curTargetRect = tgt.ScreenRect;
                _outSince = -1;
                if (!saccade) _progressSec += dt;
                ShowTargetVisuals();
                if (_progressSec * 1000.0 >= EffectiveDwellMs)
                {
                    var c = RectCenter(_curTargetRect);

                    // Micro-correction continue : le regard atterrit toujours un
                    // peu à côté du centre visé ? On apprend ce décalage (doucement,
                    // plafonné) et on le compense en permanence.
                    var err = c - screen;
                    if (err.Length < 120)
                    {
                        _drift = _drift * (1 - DriftAlpha) + err * DriftAlpha;
                        if (_drift.Length > DriftMax) _drift = _drift / _drift.Length * DriftMax;

                        // Gains « tête » (LMS) : on n'apprend que si la tête est
                        // réellement écartée de la référence (signal identifiable).
                        var (hdx, hdy, hdz) = HeadDelta();
                        double G(double g, double e, double d) =>
                            Math.Abs(d) < 0.03 ? g :
                            Math.Max(-HeadGainMax, Math.Min(HeadGainMax, g + HeadMu * e * Math.Sign(d) * Math.Min(1, Math.Abs(d) / 0.1)));
                        _gxx = G(_gxx, err.X, hdx);
                        _gxz = G(_gxz, err.X, hdz);
                        _gyy = G(_gyy, err.Y, hdy);
                        _gyz = G(_gyz, err.Y, hdz);
                    }

                    Click(c, t); // clic au CENTRE de la cible : précision maximale
                }
                return;
            }

            // Le regard vient de quitter une cible : GRÂCE avant d'abandonner
            // (un tremblement ne remet pas la progression à zéro).
            if (_curTargetEl != null)
            {
                if (_outSince < 0) _outSince = t;
                if (t - _outSince < GraceSeconds) { ShowTargetVisuals(); return; }
                ClearTarget();
            }

            // Jeux d'exploration : pas de sélection en dehors des cibles.
            if (TargetsOnly) { ResetHold(); return; }

            // 8) DWELL LIBRE (coloriage, zones sans cible…) : fenêtre de stabilité
            //    avec accumulation + grâce, comme pour les cibles.
            if (!_holdActive)
            {
                StartFreeHold(screen, local, t);
                return;
            }
            if (Distance(screen, _holdScreen) > HoldRadius)
            {
                if (_outSince < 0) _outSince = t;
                if (t - _outSince >= GraceSeconds) { StartFreeHold(screen, local, t); return; }
                // en grâce : on n'accumule pas, mais on ne repart pas de zéro
            }
            else
            {
                _outSince = -1;
                if (!saccade) _progressSec += dt;
            }

            PlaceIndicator(_holdLocal);
            if (_indicator.Visibility != Visibility.Visible) _indicator.Visibility = Visibility.Visible;
            double frac = Math.Min(1.0, _progressSec * 1000.0 / EffectiveDwellMs);
            UpdateProgress(frac);
            if (frac >= 1.0) Click(screen, t);
        }

        private static Point RectCenter(Rect r) => new Point(r.X + r.Width / 2, r.Y + r.Height / 2);

        private static double RectDistance(Rect r, Point p)
        {
            double dx = Math.Max(Math.Max(r.Left - p.X, 0), p.X - r.Right);
            double dy = Math.Max(Math.Max(r.Top - p.Y, 0), p.Y - r.Bottom);
            return Math.Sqrt(dx * dx + dy * dy);
        }

        // --- Aimant : trouve la cible sous le point, sinon la plus proche (rayon). ---
        private GazeTargets.Target FindTarget(Point screen)
        {
            GazeTargets.Target inside = null;
            double insideArea = double.MaxValue;
            GazeTargets.Target near = null;
            double nearDist = SnapRadius;

            foreach (var tg in _targets)
            {
                var r = tg.ScreenRect;
                if (r.Contains(screen))
                {
                    double area = r.Width * r.Height;
                    if (area < insideArea) { inside = tg; insideArea = area; } // la plus petite gagne
                }
                else if (inside == null)
                {
                    double dx = Math.Max(Math.Max(r.Left - screen.X, 0), screen.X - r.Right);
                    double dy = Math.Max(Math.Max(r.Top - screen.Y, 0), screen.Y - r.Bottom);
                    double d = Math.Sqrt(dx * dx + dy * dy);
                    if (d < nearDist) { near = tg; nearDist = d; }
                }
            }
            return inside ?? near;
        }

        // Halo sur la cible + cercle de progression au centre de la cible.
        private void ShowTargetVisuals()
        {
            Point tl, br;
            try
            {
                tl = _root.PointFromScreen(_curTargetRect.TopLeft);
                br = _root.PointFromScreen(_curTargetRect.BottomRight);
            }
            catch { return; }

            if (_highlight != null)
            {
                _highlight.Width = Math.Max(0, br.X - tl.X) + 12;
                _highlight.Height = Math.Max(0, br.Y - tl.Y) + 12;
                Canvas.SetLeft(_highlight, tl.X - 6);
                Canvas.SetTop(_highlight, tl.Y - 6);
                if (_highlight.Visibility != Visibility.Visible) _highlight.Visibility = Visibility.Visible;
            }

            var center = new Point((tl.X + br.X) / 2, (tl.Y + br.Y) / 2);
            PlaceIndicator(center);
            if (_indicator.Visibility != Visibility.Visible) _indicator.Visibility = Visibility.Visible;
            UpdateProgress(Math.Min(1.0, _progressSec * 1000.0 / EffectiveDwellMs));
        }

        private void ClearTarget()
        {
            // La progression n'est pas jetée : on la mémorise (décroissante) pour
            // la rendre si le regard revient vite sur la même cible.
            if (_curTargetEl != null && _progressSec > 0)
            {
                _memTargetEl = _curTargetEl;
                _memProgress = _progressSec;
                _memAt = _clock.Elapsed.TotalSeconds;
            }
            _curTargetEl = null;
            _progressSec = 0;
            _outSince = -1;
            if (_highlight != null && _highlight.Visibility != Visibility.Collapsed)
                _highlight.Visibility = Visibility.Collapsed;
        }

        private void StartFreeHold(Point screen, Point local, double t)
        {
            _holdActive = true;
            _holdScreen = screen;
            _holdLocal = local;
            _progressSec = 0;
            _outSince = -1;
            _indicator.Visibility = Visibility.Visible;
            PlaceIndicator(local);
            UpdateProgress(0);
        }

        // Médiane des derniers points (rejette un pic isolé dû à un mouvement brusque).
        private Point Median(Point p)
        {
            int n = _mx.Length;
            int idx = _mCount % n;
            _mx[idx] = p.X; _my[idx] = p.Y;
            _mCount++;
            int len = Math.Min(_mCount, n);
            return new Point(MedianOf(_mx, len), MedianOf(_my, len));
        }

        private static double MedianOf(double[] src, int len)
        {
            var a = new double[len];
            Array.Copy(src, a, len);
            Array.Sort(a);
            return len % 2 == 1 ? a[len / 2] : (a[len / 2 - 1] + a[len / 2]) / 2.0;
        }

        // Injecte un vrai clic souris Windows au point donné (pixels écran).
        private void Click(Point screen, double t)
        {
            ResetHold();
            _memTargetEl = null; // pas de reprise de progression après un clic
            _cooldownUntil = t + CooldownSeconds;
            _hasLastClick = true;
            _lastClickScreen = screen;

            try
            {
                SetCursorPos((int)Math.Round(screen.X), (int)Math.Round(screen.Y));
                mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, UIntPtr.Zero);
                mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, UIntPtr.Zero);
            }
            catch { /* rien : le prochain dwell retentera */ }

            Lib.Log.Write("dwell", FormattableString.Invariant($"CLIC injecté à ({screen.X:0};{screen.Y:0})"));
            Clicked?.Invoke(screen);
        }

        private void ResetHold()
        {
            _holdActive = false;
            ClearTarget();
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
