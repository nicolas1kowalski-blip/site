using System;
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
    /// « Réglage éclair » : UNE étoile au centre, ~3 secondes. On mesure le
    /// décalage global entre le point visé et le regard brut, et on recale tout
    /// l'écran d'un coup — sans refaire les 9 points de la grande étoile.
    /// À utiliser en début de séance ou quand l'enfant a changé de position.
    /// </summary>
    public sealed class QuickFixWindow : Window
    {
        /// <summary>Décalage mesuré (px écran), valide si <see cref="Measured"/>.</summary>
        public Vector Offset { get; private set; }
        public bool Measured { get; private set; }

        private readonly Grid _star;
        private readonly TextBlock _state;
        private readonly DispatcherTimer _timer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(50) };
        private DateTime _phaseStart;
        private bool _collecting;
        private double _sumX, _sumY;
        private int _samples;
        private bool _eyesValid;
        private bool _started;

        public QuickFixWindow()
        {
            GazeGate.Push(); // pas de clics pendant la mesure
            Closed += (s, e) =>
            {
                GazeGate.Pop();
                GazeFeed.Raw -= OnRaw;
                GazeFeed.Sample -= OnSample;
                _timer.Stop();
            };

            Title = "Réglage éclair";
            WindowStyle = WindowStyle.None;
            ResizeMode = ResizeMode.NoResize;
            WindowState = WindowState.Maximized;
            Topmost = true;
            Background = new SolidColorBrush(Color.FromRgb(0x1E, 0x17, 0x33));
            Cursor = Cursors.None;

            var root = new Grid();

            root.Children.Add(new TextBlock
            {
                Text = "⭐ Regarde l'étoile ! ⭐",
                FontSize = 34,
                FontWeight = FontWeights.Bold,
                Foreground = Brushes.White,
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Top,
                Margin = new Thickness(0, 26, 0, 0),
            });

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

            // L'étoile, au centre, avec pulsation.
            _star = new Grid
            {
                Width = 120,
                Height = 120,
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
                RenderTransformOrigin = new Point(0.5, 0.5),
            };
            _star.Children.Add(new Path
            {
                Data = Geometry.Parse("M60,4 L74,44 L116,44 L83,69 L95,110 L60,85 L25,110 L37,69 L4,44 L46,44 Z"),
                Fill = new SolidColorBrush(Color.FromRgb(0xFF, 0xD9, 0x3C)),
                Stroke = Brushes.White,
                StrokeThickness = 4,
                StrokeLineJoin = PenLineJoin.Round,
            });
            var pulse = new ScaleTransform(1, 1);
            _star.RenderTransform = pulse;
            var anim = new DoubleAnimation(0.85, 1.18, TimeSpan.FromMilliseconds(430))
            { AutoReverse = true, RepeatBehavior = RepeatBehavior.Forever, EasingFunction = new SineEase() };
            pulse.BeginAnimation(ScaleTransform.ScaleXProperty, anim);
            pulse.BeginAnimation(ScaleTransform.ScaleYProperty, anim);
            root.Children.Add(_star);

            _state = new TextBlock
            {
                Text = "…",
                FontSize = 20,
                FontWeight = FontWeights.Bold,
                Foreground = Brushes.White,
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Bottom,
                Margin = new Thickness(0, 0, 0, 22),
            };
            root.Children.Add(_state);

            Content = root;

            GazeFeed.Raw += OnRaw;
            GazeFeed.Sample += OnSample;
            _timer.Tick += (s, e) => Tick();
            ContentRendered += (s, e) =>
            {
                if (_started) return;
                _started = true;

                // Le réglage éclair mesure le REGARD BRUT : sans regard direct,
                // il recalerait le curseur TD (déjà calibré) — refus propre.
                var src = DwellController.Instance?.ActiveSource ?? "";
                if (src != "Regard direct")
                {
                    Log.Write("eclair", "Refusé : pas de regard direct (source = " + src + ")");
                    Speech.Say("Le regard direct n'est pas disponible sur cet appareil.");
                    MessageBox.Show(this,
                        "Le réglage éclair a besoin du REGARD DIRECT du capteur.\n" +
                        "Ici le pointage passe par le curseur : la précision se règle\n" +
                        "dans la calibration TD Control / Tobii de l'appareil.",
                        "Réglage éclair");
                    DialogResult = false;
                    return;
                }

                _phaseStart = DateTime.Now;
                _timer.Start();
                Speech.Say("Regarde l'étoile !");
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
            _state.Text = valid ? "👁 Yeux vus" : "👀 Yeux non détectés — place-toi bien en face";
            _state.Foreground = new SolidColorBrush(valid
                ? Color.FromRgb(0x7B, 0xE0, 0x6C) : Color.FromRgb(0xFF, 0xC1, 0x07));
        }

        private void Tick()
        {
            double elapsed = (DateTime.Now - _phaseStart).TotalMilliseconds;

            // 0,9 s pour amener le regard (le chrono attend que les yeux soient
            // vus), puis 1,6 s de mesure (4 s maximum au total).
            if (!_collecting && elapsed > 900)
            {
                if (!_eyesValid) { _phaseStart = DateTime.Now.AddMilliseconds(-600); return; }
                _collecting = true;
                _sumX = _sumY = 0;
                _samples = 0;
            }
            else if (_collecting && ((_samples >= 12 && elapsed > 2500) || elapsed > 4000))
            {
                _timer.Stop();
                _collecting = false;
                if (_samples >= 6)
                {
                    Point starScreen;
                    try { starScreen = _star.PointToScreen(new Point(_star.Width / 2, _star.Height / 2)); }
                    catch { starScreen = new Point(0, 0); }
                    var mean = new Point(_sumX / _samples, _sumY / _samples);
                    var offset = starScreen - mean;
                    if (offset.Length < 450) // un décalage aberrant = mesure ratée
                    {
                        Offset = offset;
                        Measured = true;
                        Log.Write("eclair", FormattableString.Invariant(
                            $"Mesuré : cible=({starScreen.X:0};{starScreen.Y:0}) regard=({mean.X:0};{mean.Y:0}) décalage=({offset.X:0};{offset.Y:0}) ({_samples} éch.)"));
                        Speech.Say("C'est réglé !");
                        DialogResult = true;
                        return;
                    }
                    Log.Write("eclair", FormattableString.Invariant(
                        $"Décalage aberrant ({offset.X:0};{offset.Y:0}) : ignoré"));
                }
                else Log.Write("eclair", $"Trop peu d'échantillons ({_samples})");
                Speech.Say("On n'a pas bien vu tes yeux. On réessaiera !");
                DialogResult = false;
            }
        }
    }
}
