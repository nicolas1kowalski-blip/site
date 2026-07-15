using System;
using System.Collections.Generic;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Shapes;
using System.Windows.Threading;
using MesPremiersJeux.Gaze;
using MesPremiersJeux.Lib;

namespace MesPremiersJeux.Views
{
    /// <summary>
    /// « Suis l'étoile » : une étoile animée passe par 5 endroits de l'écran ;
    /// pendant que l'enfant la regarde, on mesure l'écart entre le point visé et
    /// le regard BRUT, et on en déduit une correction appliquée en permanence.
    /// Compense une calibration d'appareil imparfaite — sans toucher à l'appareil.
    /// </summary>
    public sealed class CalibrationWindow : Window
    {
        /// <summary>Correction mesurée : points d'ancrage (0..1) + décalages (px).</summary>
        public List<(Point Anchor, Vector Offset)> Result { get; } = new List<(Point, Vector)>();

        // 9 points (3×3) : correction fine sur tout l'écran, décisive quand deux
        // cibles sont côte à côte.
        private static readonly Point[] Anchors =
        {
            new Point(0.50, 0.50),
            new Point(0.15, 0.18), new Point(0.50, 0.18), new Point(0.85, 0.18),
            new Point(0.15, 0.50), new Point(0.85, 0.50),
            new Point(0.15, 0.82), new Point(0.50, 0.82), new Point(0.85, 0.82),
        };

        private readonly Canvas _canvas;
        private readonly Grid _star;
        private readonly TextBlock _title;
        private readonly DispatcherTimer _timer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(50) };

        private int _step = -1;
        private DateTime _phaseStart;
        private bool _collecting;
        private double _sumX, _sumY;
        private int _samples;
        private readonly TextBlock _eyeState;  // « yeux vus / non vus » en direct
        private bool _eyesValid;

        public CalibrationWindow()
        {
            GazeGate.Push(); // pas de clics pendant la mesure (le flux, lui, continue)
            Closed += (s, e) => { GazeGate.Pop(); GazeFeed.Raw -= OnRaw; _timer.Stop(); };

            Title = "Suis l'étoile";
            WindowStyle = WindowStyle.None;
            ResizeMode = ResizeMode.NoResize;
            WindowState = WindowState.Maximized;
            Topmost = true;
            Background = new SolidColorBrush(Color.FromRgb(0x1E, 0x17, 0x33));
            Cursor = Cursors.None;

            var root = new Grid();
            _canvas = new Canvas();
            root.Children.Add(_canvas);

            _title = new TextBlock
            {
                Text = "✨ Suis l'étoile avec tes yeux ! ✨",
                FontSize = 34,
                FontWeight = FontWeights.Bold,
                Foreground = Brushes.White,
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Top,
                Margin = new Thickness(0, 26, 0, 0),
            };
            root.Children.Add(_title);

            // Petit bouton parent pour annuler (souris) + touche Échap.
            var cancel = new Button
            {
                Content = "✖",
                FontSize = 18,
                Width = 46,
                Height = 40,
                Opacity = 0.5,
                HorizontalAlignment = HorizontalAlignment.Right,
                VerticalAlignment = VerticalAlignment.Top,
                Margin = new Thickness(0, 10, 12, 0),
            };
            cancel.Click += (s, e) => DialogResult = false;
            root.Children.Add(cancel);
            KeyDown += (s, e) => { if (e.Key == Key.Escape) DialogResult = false; };

            // L'étoile (dessin vectoriel + pulsation).
            _star = new Grid { Width = 110, Height = 110, RenderTransformOrigin = new Point(0.5, 0.5) };
            _star.Children.Add(new Path
            {
                Data = Geometry.Parse("M55,4 L68,40 L106,40 L76,63 L87,101 L55,78 L23,101 L34,63 L4,40 L42,40 Z"),
                Fill = new SolidColorBrush(Color.FromRgb(0xFF, 0xD9, 0x3C)),
                Stroke = Brushes.White,
                StrokeThickness = 4,
                StrokeLineJoin = PenLineJoin.Round,
            });
            var pulse = new ScaleTransform(1, 1);
            _star.RenderTransform = pulse;
            var anim = new DoubleAnimation(0.8, 1.15, TimeSpan.FromMilliseconds(450))
            { AutoReverse = true, RepeatBehavior = RepeatBehavior.Forever, EasingFunction = new SineEase() };
            pulse.BeginAnimation(ScaleTransform.ScaleXProperty, anim);
            pulse.BeginAnimation(ScaleTransform.ScaleYProperty, anim);
            _canvas.Children.Add(_star);

            // Indicateur en direct : la caméra voit-elle les yeux, là, maintenant ?
            _eyeState = new TextBlock
            {
                FontSize = 20,
                FontWeight = FontWeights.Bold,
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Bottom,
                Margin = new Thickness(0, 0, 0, 22),
                Text = "…",
                Foreground = Brushes.White,
            };
            root.Children.Add(_eyeState);

            Content = root;

            GazeFeed.Raw += OnRaw;
            GazeFeed.Sample += OnSample;
            Closed += (s, e) => GazeFeed.Sample -= OnSample;
            _timer.Tick += (s, e) => Tick();
            // ContentRendered : la fenêtre est réellement affichée et mesurée
            // (à Loaded, les dimensions peuvent encore être à zéro).
            ContentRendered += (s, e) =>
            {
                if (_step >= 0) return;
                Log.Write("etoile", FormattableString.Invariant(
                    $"Démarrage : fenêtre {ActualWidth:0}x{ActualHeight:0}"));
                NextStep();
                _timer.Start();
                Speech.Say("Suis l'étoile avec tes yeux !");
            };
        }

        private void OnRaw(Point p)
        {
            if (!_collecting) return;
            _sumX += p.X; _sumY += p.Y; _samples++;
        }

        private void OnSample(Point p, bool valid)
        {
            _eyesValid = valid;
            _eyeState.Text = valid ? "👁 Yeux vus" : "👀 Yeux non détectés — place-toi bien en face";
            _eyeState.Foreground = new SolidColorBrush(valid
                ? Color.FromRgb(0x7B, 0xE0, 0x6C) : Color.FromRgb(0xFF, 0xC1, 0x07));
        }

        private void NextStep()
        {
            _step++;
            _collecting = false;
            if (_step >= Anchors.Length) { Finish(); return; }

            double w = _canvas.ActualWidth, h = _canvas.ActualHeight;
            if (w <= 0) { w = ActualWidth; h = ActualHeight; }
            var a = Anchors[_step];
            Canvas.SetLeft(_star, a.X * w - _star.Width / 2);
            Canvas.SetTop(_star, a.Y * h - _star.Height / 2);
            _phaseStart = DateTime.Now;
        }

        private void Tick()
        {
            if (_step < 0 || _step >= Anchors.Length) return;
            double elapsed = (DateTime.Now - _phaseStart).TotalMilliseconds;

            // 0,9 s pour amener le regard (le chrono ne démarre pas tant que les
            // yeux ne sont pas vus), puis mesure jusqu'à avoir assez d'échantillons
            // (3,5 s maximum).
            if (!_collecting && elapsed > 900)
            {
                if (!_eyesValid) { _phaseStart = DateTime.Now.AddMilliseconds(-600); return; }
                _collecting = true;
                _sumX = _sumY = 0;
                _samples = 0;
            }
            else if (_collecting && ((_samples >= 15 && elapsed > 1700) || elapsed > 3500))
            {
                _collecting = false;
                if (_samples >= 5)
                {
                    // Centre réel de l'étoile en pixels écran.
                    Point starScreen;
                    try { starScreen = _star.PointToScreen(new Point(_star.Width / 2, _star.Height / 2)); }
                    catch { starScreen = new Point(0, 0); }
                    var mean = new Point(_sumX / _samples, _sumY / _samples);
                    var offset = starScreen - mean;
                    // Un décalage aberrant (> 600 px) = mesure ratée : ignorée.
                    if (offset.Length < 600)
                    {
                        Result.Add((Anchors[_step], offset));
                        Log.Write("etoile", FormattableString.Invariant(
                            $"Point {_step + 1} : cible=({starScreen.X:0};{starScreen.Y:0}) mesuré=({mean.X:0};{mean.Y:0}) décalage=({offset.X:0};{offset.Y:0}) ({_samples} éch.)"));
                    }
                    else Log.Write("etoile", $"Point {_step + 1} ignoré (décalage aberrant)");
                    Speech.Pop();
                }
                else Log.Write("etoile", $"Point {_step + 1} ignoré ({_samples} échantillons seulement)");
                NextStep();
            }
        }

        private void Finish()
        {
            _timer.Stop();
            Log.Write("etoile", $"Terminé : {Result.Count} points valides sur {Anchors.Length}");
            if (Result.Count >= 4)
            {
                Speech.Say("Bravo ! C'est réglé !");
                DialogResult = true;
            }
            else
            {
                Speech.Say("On n'a pas bien vu tes yeux. On réessaiera !");
                MessageBox.Show(this,
                    "Pas assez de mesures fiables (yeux non détectés ?).\nRéessaie en te plaçant bien en face.",
                    "Suis l'étoile");
                DialogResult = false;
            }
        }
    }
}
