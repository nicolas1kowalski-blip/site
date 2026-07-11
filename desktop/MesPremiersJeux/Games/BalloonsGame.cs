using System;
using System.Collections.Generic;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Threading;
using MesPremiersJeux.Data;
using MesPremiersJeux.Lib;

namespace MesPremiersJeux.Games
{
    /// <summary>Ballons 3D qui montent ; on les fait éclater au regard.</summary>
    public sealed class BalloonsGame : UserControl
    {
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
                var btn = new Button
                {
                    Style = (Style)Application.Current.Resources["BalloonButton"],
                    Width = 120,
                    Height = 165,
                    Content = vp,
                };
                var b = new Balloon { Btn = btn, Diffuse = brush };
                btn.Click += (s, e) => Pop(b);
                _canvas.Children.Add(btn);
                _balloons.Add(b);
                Respawn(b, startBelow: true, stagger: i);
            }
            _timer.Start();
        }

        private double Cw => _canvas.ActualWidth > 0 ? _canvas.ActualWidth : 1000;
        private double Ch => _canvas.ActualHeight > 0 ? _canvas.ActualHeight : 640;

        private void Respawn(Balloon b, bool startBelow = true, int stagger = 0)
        {
            b.X = _rng.NextDouble() * Math.Max(1, Cw - 120);
            b.Y = startBelow ? Ch + _rng.Next(60, 320) + stagger * 90 : Ch + 40;
            b.Speed = 0.8 + _rng.NextDouble() * 1.6;
            b.Amp = 8 + _rng.NextDouble() * 22;
            b.Phase = _rng.NextDouble() * 6.28;
            b.Diffuse.Color = GameData.BalloonColors[_rng.Next(GameData.BalloonColors.Length)];
            b.Info = GameKit.Rand(GameData.Balloons);
            b.Popping = false;
            b.Btn.BeginAnimation(OpacityProperty, null); // libère l'anim d'éclatement
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
                if (b.Y < -180) Respawn(b);
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

            b.Btn.RenderTransformOrigin = new Point(0.5, 0.5);
            var st = new ScaleTransform(1, 1);
            b.Btn.RenderTransform = st;
            var dur = TimeSpan.FromMilliseconds(200);
            st.BeginAnimation(ScaleTransform.ScaleXProperty, new DoubleAnimation(1, 1.7, dur));
            st.BeginAnimation(ScaleTransform.ScaleYProperty, new DoubleAnimation(1, 1.7, dur));
            var fade = new DoubleAnimation(1, 0, dur);
            fade.Completed += (s, e) => Respawn(b);
            b.Btn.BeginAnimation(OpacityProperty, fade);
        }

        private static void Speak(GameData.BalloonInfo info)
        {
            var text = string.IsNullOrEmpty(info.Sound) ? info.Name : $"{info.Name} ! {info.Sound}";
            Speech.Say(text);
        }
    }
}
