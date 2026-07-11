using System;
using System.Collections.Generic;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Shapes;
using System.Windows.Threading;
using MesPremiersJeux.Data;
using MesPremiersJeux.Lib;

namespace MesPremiersJeux.Games
{
    /// <summary>Ballons 3D (goutte + ficelle) qui montent, à profondeur variable ;
    /// on les éclate au regard. Progression par niveaux : la grande célébration
    /// survient à chaque niveau franchi, pas à chaque ballon.</summary>
    public sealed class BalloonsGame : UserControl
    {
        private const double BW = 130, BH = 210; // taille de référence (ballon + ficelle)

        private sealed class Balloon
        {
            public Button Btn;
            public Canvas Inner;
            public SolidColorBrush Diffuse;
            public double X, Y, Speed, Phase, Amp, Scale;
            public GameData.BalloonInfo Info;
            public bool Popping;
        }

        private readonly Canvas _canvas;
        private readonly List<Balloon> _balloons = new List<Balloon>();
        private readonly DispatcherTimer _timer;
        private readonly Random _rng = new Random();

        private int _level = 1, _popped = 0, _target = 6, _count = 8;
        private TextBlock _levelText;

        public BalloonsGame(Action celebrate)
        {
            _canvas = new Canvas { ClipToBounds = true };
            _canvas.Background = new LinearGradientBrush(
                Color.FromRgb(0xD8, 0xF0, 0xFF), Color.FromRgb(0xF3, 0xE9, 0xFF), 90);
            Content = _canvas;

            _timer = new DispatcherTimer(DispatcherPriority.Render) { Interval = TimeSpan.FromMilliseconds(30) };
            _timer.Tick += Tick;

            Loaded += (s, e) => Start();
            Unloaded += (s, e) => _timer.Stop();
        }

        private void Start()
        {
            if (_balloons.Count > 0) { _timer.Start(); return; }
            _levelText = new TextBlock
            {
                FontSize = 22,
                FontWeight = FontWeights.Bold,
                Foreground = new SolidColorBrush(Color.FromRgb(0x3B, 0x2A, 0x5A)),
            };
            Canvas.SetLeft(_levelText, 18); Canvas.SetTop(_levelText, 14);
            Panel.SetZIndex(_levelText, 10000);
            _canvas.Children.Add(_levelText);
            UpdateLevelUi();

            for (int i = 0; i < _count; i++) AddBalloon(i);
            _timer.Start();
        }

        private double Cw => _canvas.ActualWidth > 0 ? _canvas.ActualWidth : 1000;
        private double Ch => _canvas.ActualHeight > 0 ? _canvas.ActualHeight : 640;

        private void AddBalloon(int stagger)
        {
            var vp = Balloon3D.MakeBalloon(out var brush);
            vp.Width = BW; vp.Height = 150;

            var ficelle = new Path
            {
                Stroke = new SolidColorBrush(Color.FromRgb(0x6B, 0x6B, 0x6B)),
                StrokeThickness = 2,
                Data = Geometry.Parse("M65,146 q8,16 -3,28 q-8,12 4,30"),
            };
            // Ficelle qui se balance (pivot au niveau du nœud).
            var swingPivot = new RotateTransform(0, 65, 146);
            ficelle.RenderTransform = swingPivot;
            var swing = new DoubleAnimation(-9, 9, TimeSpan.FromMilliseconds(1500 + _rng.Next(1300)))
            {
                AutoReverse = true,
                RepeatBehavior = RepeatBehavior.Forever,
                BeginTime = TimeSpan.FromMilliseconds(_rng.Next(1000)),
            };
            swingPivot.BeginAnimation(RotateTransform.AngleProperty, swing);

            var inner = new Canvas { Width = BW, Height = BH };
            Canvas.SetLeft(vp, 0); Canvas.SetTop(vp, 0);
            inner.Children.Add(vp);
            inner.Children.Add(ficelle);

            var btn = new Button { Style = (Style)Application.Current.Resources["BalloonButton"], Content = inner };
            var b = new Balloon { Btn = btn, Inner = inner, Diffuse = brush };
            btn.Click += (s, e) => Pop(b);
            _canvas.Children.Add(btn);
            _balloons.Add(b);
            Respawn(b, stagger);
        }

        private void Respawn(Balloon b, int stagger = 0)
        {
            b.Scale = 0.7 + _rng.NextDouble() * 0.6; // profondeur : 0.7 (loin) .. 1.3 (près)
            b.Inner.LayoutTransform = new ScaleTransform(b.Scale, b.Scale);
            Panel.SetZIndex(b.Btn, (int)(b.Scale * 100)); // les plus proches devant

            double effW = BW * b.Scale;
            b.X = _rng.NextDouble() * Math.Max(1, Cw - effW);
            b.Y = Ch + _rng.Next(20, 160) + stagger * 55;
            b.Speed = (0.8 + _rng.NextDouble() * 1.4) * (0.6 + b.Scale * 0.6); // près = plus vite
            b.Amp = 8 + _rng.NextDouble() * 22;
            b.Phase = _rng.NextDouble() * 6.28;
            b.Diffuse.Color = GameData.BalloonColors[_rng.Next(GameData.BalloonColors.Length)];
            b.Info = GameKit.Rand(GameData.Balloons);
            b.Popping = false;
            b.Btn.BeginAnimation(OpacityProperty, null);
            b.Btn.Opacity = 1;
            b.Btn.RenderTransform = Transform.Identity;
            Place(b);
        }

        private void Place(Balloon b)
        {
            double sway = Math.Sin(b.Phase) * b.Amp;
            Canvas.SetLeft(b.Btn, b.X + sway);
            Canvas.SetTop(b.Btn, b.Y);
        }

        private void Tick(object sender, EventArgs e)
        {
            foreach (var b in _balloons)
            {
                if (b.Popping) continue;
                b.Y -= b.Speed;
                b.Phase += 0.03;
                if (b.Y < -BH * b.Scale - 20) Respawn(b);
                else Place(b);
            }
        }

        private void Pop(Balloon b)
        {
            if (b.Popping) return;
            b.Popping = true;

            Speech.Pop();
            Speak(b.Info);

            double cx = Canvas.GetLeft(b.Btn) + BW * b.Scale / 2;
            double cy = Canvas.GetTop(b.Btn) + 70 * b.Scale;
            Burst(cx, cy, b.Diffuse.Color, b.Scale);

            b.Btn.RenderTransformOrigin = new Point(0.5, 0.4);
            var st = new ScaleTransform(1, 1);
            b.Btn.RenderTransform = st;
            var grow = TimeSpan.FromMilliseconds(90);
            st.BeginAnimation(ScaleTransform.ScaleXProperty, new DoubleAnimation(1, 1.5, grow));
            st.BeginAnimation(ScaleTransform.ScaleYProperty, new DoubleAnimation(1, 1.5, grow));
            var fade = new DoubleAnimation(1, 0, TimeSpan.FromMilliseconds(140));
            fade.Completed += (s, e) => Respawn(b);
            b.Btn.BeginAnimation(OpacityProperty, fade);

            _popped++;
            UpdateLevelUi();
            if (_popped >= _target) LevelUp();
        }

        private void UpdateLevelUi()
        {
            if (_levelText != null) _levelText.Text = $"Niveau {_level}   🎈 {_popped}/{_target}";
        }

        private void LevelUp()
        {
            _level++;
            _popped = 0;
            _target += 2;
            UpdateLevelUi();
            Speech.Say($"Bravo ! Niveau {_level} !");
            CelebrateLevel();

            int newCount = Math.Min(14, 8 + (_level - 1) * 2);
            while (_balloons.Count < newCount) AddBalloon(_balloons.Count);
            _count = newCount;
        }

        // Gerbe d'éclats à l'endroit du ballon.
        private void Burst(double cx, double cy, Color col, double scale)
        {
            int n = (int)(12 + scale * 6);
            for (int i = 0; i < n; i++)
            {
                double ang = _rng.NextDouble() * Math.PI * 2;
                double dist = (45 + _rng.NextDouble() * 70) * scale;
                double sz = 12 * scale;
                var shard = new Ellipse { Width = sz, Height = sz, Fill = new SolidColorBrush(i % 3 == 0 ? Colors.White : col) };
                Canvas.SetLeft(shard, cx - sz / 2);
                Canvas.SetTop(shard, cy - sz / 2);
                Panel.SetZIndex(shard, 9000);
                var tt = new TranslateTransform();
                shard.RenderTransform = tt;
                _canvas.Children.Add(shard);

                double dur = 360 + _rng.Next(240);
                tt.BeginAnimation(TranslateTransform.XProperty,
                    new DoubleAnimation(0, Math.Cos(ang) * dist, TimeSpan.FromMilliseconds(dur)) { DecelerationRatio = 0.6 });
                tt.BeginAnimation(TranslateTransform.YProperty,
                    new DoubleAnimation(0, Math.Sin(ang) * dist + 40, TimeSpan.FromMilliseconds(dur)) { DecelerationRatio = 0.4 });
                var fade = new DoubleAnimation(1, 0, TimeSpan.FromMilliseconds(dur));
                var captured = shard;
                fade.Completed += (s, e) => _canvas.Children.Remove(captured);
                shard.BeginAnimation(OpacityProperty, fade);
            }
        }

        // Célébration de fin de niveau : fontaine de confettis + bannière.
        private void CelebrateLevel()
        {
            double w = Cw, h = Ch;
            var colors = GameData.BalloonColors;
            for (int i = 0; i < 46; i++)
            {
                double x = w / 2 + (_rng.NextDouble() - 0.5) * w * 0.5;
                var conf = new Rectangle
                {
                    Width = 10 + _rng.Next(8),
                    Height = 14 + _rng.Next(10),
                    Fill = new SolidColorBrush(colors[_rng.Next(colors.Length)]),
                    RadiusX = 2, RadiusY = 2,
                    RenderTransformOrigin = new Point(0.5, 0.5),
                };
                Canvas.SetLeft(conf, x);
                Canvas.SetTop(conf, h);
                Panel.SetZIndex(conf, 9500);
                var tt = new TranslateTransform();
                var rot = new RotateTransform(_rng.Next(360));
                var grp = new TransformGroup(); grp.Children.Add(rot); grp.Children.Add(tt);
                conf.RenderTransform = grp;
                _canvas.Children.Add(conf);

                double dur = 1100 + _rng.Next(1100);
                double rise = h * (0.45 + _rng.NextDouble() * 0.45);
                tt.BeginAnimation(TranslateTransform.XProperty,
                    new DoubleAnimation(0, (_rng.NextDouble() - 0.5) * w * 0.6, TimeSpan.FromMilliseconds(dur)));
                var up = new DoubleAnimationUsingKeyFrames { Duration = TimeSpan.FromMilliseconds(dur) };
                up.KeyFrames.Add(new SplineDoubleKeyFrame(-rise, KeyTime.FromPercent(0.45), new KeySpline(0.2, 0.7, 0.4, 1)));
                up.KeyFrames.Add(new SplineDoubleKeyFrame(60, KeyTime.FromPercent(1), new KeySpline(0.4, 0, 0.7, 1)));
                tt.BeginAnimation(TranslateTransform.YProperty, up);
                rot.BeginAnimation(RotateTransform.AngleProperty,
                    new DoubleAnimation(rot.Angle, rot.Angle + (_rng.Next(2) == 0 ? 540 : -540), TimeSpan.FromMilliseconds(dur)));
                var fade = new DoubleAnimation(1, 0, TimeSpan.FromMilliseconds(dur)) { BeginTime = TimeSpan.FromMilliseconds(dur * 0.6) };
                var captured = conf;
                fade.Completed += (s, e) => _canvas.Children.Remove(captured);
                conf.BeginAnimation(OpacityProperty, fade);
            }

            // Bannière « Niveau X ! ».
            var banner = new Border
            {
                Background = new SolidColorBrush(Color.FromArgb(0xF2, 0x7E, 0x3F, 0xF2)),
                CornerRadius = new CornerRadius(22),
                Padding = new Thickness(28, 14, 28, 14),
                Child = new TextBlock { Text = $"Niveau {_level} !", FontSize = 46, FontWeight = FontWeights.Bold, Foreground = Brushes.White },
                RenderTransformOrigin = new Point(0.5, 0.5),
            };
            _canvas.Children.Add(banner);
            Panel.SetZIndex(banner, 9800);
            banner.Loaded += (s, e) =>
            {
                Canvas.SetLeft(banner, (Cw - banner.ActualWidth) / 2);
                Canvas.SetTop(banner, Ch * 0.32);
            };
            var sc = new ScaleTransform(0.4, 0.4);
            banner.RenderTransform = sc;
            var pop = new DoubleAnimationUsingKeyFrames { Duration = TimeSpan.FromMilliseconds(500) };
            pop.KeyFrames.Add(new SplineDoubleKeyFrame(1.15, KeyTime.FromPercent(0.6), new KeySpline(0.2, 0.9, 0.3, 1)));
            pop.KeyFrames.Add(new LinearDoubleKeyFrame(1.0, KeyTime.FromPercent(1)));
            sc.BeginAnimation(ScaleTransform.ScaleXProperty, pop);
            sc.BeginAnimation(ScaleTransform.ScaleYProperty, pop);
            var bFade = new DoubleAnimation(1, 0, TimeSpan.FromMilliseconds(500)) { BeginTime = TimeSpan.FromMilliseconds(1300) };
            bFade.Completed += (s, e) => _canvas.Children.Remove(banner);
            banner.BeginAnimation(OpacityProperty, bFade);
        }

        private static void Speak(GameData.BalloonInfo info)
        {
            var text = string.IsNullOrEmpty(info.Sound) ? info.Name : $"{info.Name} ! {info.Sound}";
            Speech.Say(text);
        }
    }
}
