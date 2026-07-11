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
    /// <summary>Ballons 3D (en forme de goutte, avec ficelle) qui montent ; on les
    /// fait éclater au regard avec une gerbe d'éclats.</summary>
    public sealed class BalloonsGame : UserControl
    {
        private const double BW = 130, BH = 210; // taille du bouton (ballon + ficelle)

        private sealed class Balloon
        {
            public Button Btn;
            public SolidColorBrush Diffuse;
            public double X, Y, Speed, Phase, Amp;
            public GameData.BalloonInfo Info;
            public bool Popping;
        }

        private readonly Action _celebrate;
        private readonly Canvas _canvas;
        private readonly List<Balloon> _balloons = new List<Balloon>();
        private readonly DispatcherTimer _timer;
        private readonly Random _rng = new Random();

        public BalloonsGame(Action celebrate)
        {
            _celebrate = celebrate;

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
            for (int i = 0; i < 6; i++)
            {
                var vp = Balloon3D.MakeBalloon(out var brush);
                vp.Width = BW; vp.Height = 150;

                // Ficelle sous le ballon.
                var ficelle = new Path
                {
                    Stroke = new SolidColorBrush(Color.FromRgb(0x6B, 0x6B, 0x6B)),
                    StrokeThickness = 2,
                    Data = Geometry.Parse("M65,146 q8,16 -3,28 q-8,12 4,30"),
                };

                var inner = new Canvas { Width = BW, Height = BH };
                Canvas.SetLeft(vp, 0); Canvas.SetTop(vp, 0);
                inner.Children.Add(vp);
                inner.Children.Add(ficelle);

                var btn = new Button
                {
                    Style = (Style)Application.Current.Resources["BalloonButton"],
                    Width = BW,
                    Height = BH,
                    Content = inner,
                };
                var b = new Balloon { Btn = btn, Diffuse = brush };
                btn.Click += (s, e) => Pop(b);
                _canvas.Children.Add(btn);
                _balloons.Add(b);
                Respawn(b, stagger: i);
            }
            _timer.Start();
        }

        private double Cw => _canvas.ActualWidth > 0 ? _canvas.ActualWidth : 1000;
        private double Ch => _canvas.ActualHeight > 0 ? _canvas.ActualHeight : 640;

        private void Respawn(Balloon b, int stagger = 0)
        {
            b.X = _rng.NextDouble() * Math.Max(1, Cw - BW);
            b.Y = Ch + _rng.Next(60, 320) + stagger * 90;
            b.Speed = 0.8 + _rng.NextDouble() * 1.6;
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
                if (b.Y < -BH - 20) Respawn(b);
                else Place(b);
            }
        }

        private void Pop(Balloon b)
        {
            if (b.Popping) return;
            b.Popping = true;

            Speech.Pop();
            Speak(b.Info);
            _celebrate?.Invoke();

            double cx = Canvas.GetLeft(b.Btn) + BW / 2;
            double cy = Canvas.GetTop(b.Btn) + 70;
            Burst(cx, cy, b.Diffuse.Color);

            // Éclatement : le ballon se gonfle très vite puis disparaît.
            b.Btn.RenderTransformOrigin = new Point(0.5, 0.4);
            var st = new ScaleTransform(1, 1);
            b.Btn.RenderTransform = st;
            var grow = TimeSpan.FromMilliseconds(90);
            st.BeginAnimation(ScaleTransform.ScaleXProperty, new DoubleAnimation(1, 1.5, grow));
            st.BeginAnimation(ScaleTransform.ScaleYProperty, new DoubleAnimation(1, 1.5, grow));
            var fade = new DoubleAnimation(1, 0, TimeSpan.FromMilliseconds(140));
            fade.Completed += (s, e) => Respawn(b);
            b.Btn.BeginAnimation(OpacityProperty, fade);
        }

        // Gerbe d'éclats colorés partant du ballon.
        private void Burst(double cx, double cy, Color col)
        {
            for (int i = 0; i < 14; i++)
            {
                double ang = _rng.NextDouble() * Math.PI * 2;
                double dist = 45 + _rng.NextDouble() * 70;
                var shard = new Ellipse
                {
                    Width = 12,
                    Height = 12,
                    Fill = new SolidColorBrush(i % 3 == 0 ? Colors.White : col),
                };
                Canvas.SetLeft(shard, cx - 6);
                Canvas.SetTop(shard, cy - 6);
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

        private static void Speak(GameData.BalloonInfo info)
        {
            var text = string.IsNullOrEmpty(info.Sound) ? info.Name : $"{info.Name} ! {info.Sound}";
            Speech.Say(text);
        }
    }
}
