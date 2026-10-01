using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Shapes;
using MesPremiersJeux.Lib;

namespace MesPremiersJeux.Games
{
    /// <summary>
    /// « Tartes à la crème » (inspiré de Look to Learn) : trois visages rigolos ;
    /// regarder un visage lance une tarte qui s'écrase dessus — SPLAT ! — le
    /// visage fait une grimace, la crème dégouline puis glisse, et un nouveau
    /// visage revient. Le jeu le plus drôle : pur cause-à-effet, zéro échec.
    /// </summary>
    public sealed class PieFaceGame : GameControl
    {
        private const double W = 1500, H = 720;

        private static readonly string[] Faces = { "😀", "🤠", "🤓", "😮", "🥸", "😊", "🧐", "😁" };
        private static readonly string[] Hit = { "😵", "🤪", "😝", "😜" };

        private readonly Random _rng = new Random();
        private Canvas _canvas;
        private int _splats;
        private readonly double[] _faceX = { 180, 635, 1090 };
        private const double FaceY = 170;

        public PieFaceGame(Action celebrate) : base(celebrate) { }

        protected override void NewRound()
        {
            Locked = false;
            _splats = 0;
            Question.Text = "🥧 Tartes à la crème";
            SetConsigne(new TextBlock { Text = "🥧😜" },
                () => "Regarde un visage... et SPLAT ! La tarte à la crème ! Hi hi !");

            _canvas = new Canvas { Width = W, Height = H };
            _canvas.Children.Add(new Rectangle
            {
                Width = W,
                Height = H,
                RadiusX = 24,
                RadiusY = 24,
                Fill = new LinearGradientBrush(Color.FromRgb(0xFF, 0xE9, 0xF2), Color.FromRgb(0xFF, 0xF6, 0xDE), 90),
            });
            // Le rideau de cirque en haut.
            var curtain = new TextBlock { Text = "🎪🎈🎪🎈🎪", FontSize = 46, IsHitTestVisible = false, Opacity = 0.8 };
            Canvas.SetLeft(curtain, W / 2 - 180);
            Canvas.SetTop(curtain, 8);
            _canvas.Children.Add(curtain);
            // L'assiette de tartes en bas.
            var pies = new TextBlock { Text = "🥧🥧🥧", FontSize = 58, IsHitTestVisible = false };
            Canvas.SetLeft(pies, W / 2 - 110);
            Canvas.SetTop(pies, H - 86);
            _canvas.Children.Add(pies);

            for (int i = 0; i < _faceX.Length; i++) SpawnFace(i, false);

            SetBody(_canvas);
            Speak("Les tartes à la crème ! Regarde un visage... et splat ! Hi hi hi !");
        }

        private void SpawnFace(int slot, bool pop)
        {
            int fi = _rng.Next(Faces.Length);
            var face = new Button
            {
                Style = (Style)Application.Current.Resources["AnswerButton"],
                Width = 290,
                Height = 290,
                RenderTransformOrigin = new Point(0.5, 0.5),
                // Image personnalisée (Contenu\Images\visage-N.png) sinon emoji.
                Content = new ContentControl { Content = Art.Visual("visage-" + (fi + 1), Faces[fi], 245) },
            };
            int s = slot;
            var captured = face;
            face.Click += (snd, e) => ThrowPie(s, captured);
            Canvas.SetLeft(face, _faceX[slot]);
            Canvas.SetTop(face, FaceY);
            _canvas.Children.Add(face);

            if (!pop) return;
            var sc = new ScaleTransform(0.2, 0.2);
            face.RenderTransform = sc;
            var grow = new DoubleAnimation(0.2, 1, TimeSpan.FromMilliseconds(420))
            { EasingFunction = new BackEase { EasingMode = EasingMode.EaseOut, Amplitude = 0.7 } };
            sc.BeginAnimation(ScaleTransform.ScaleXProperty, grow);
            sc.BeginAnimation(ScaleTransform.ScaleYProperty, grow);
        }

        private void ThrowPie(int slot, Button face)
        {
            if (Locked) return;
            face.IsHitTestVisible = false;

            // La tarte part du plat (en bas au centre) et file vers le visage
            // en tournant sur elle-même.
            var pie = Art.Visual("tarte", "🥧", 140);
            pie.IsHitTestVisible = false;
            pie.RenderTransformOrigin = new Point(0.5, 0.5);
            var rot = new RotateTransform(0);
            pie.RenderTransform = rot;
            double px0 = W / 2 - 70, py0 = H - 110;
            double px1 = _faceX[slot] + 75, py1 = FaceY + 65;
            Canvas.SetLeft(pie, px0);
            Canvas.SetTop(pie, py0);
            pie.SetValue(Panel.ZIndexProperty, 70);
            _canvas.Children.Add(pie);

            var dur = TimeSpan.FromMilliseconds(420);
            var ax = new DoubleAnimation(px0, px1, dur) { EasingFunction = new SineEase() };
            var ay = new DoubleAnimation(py0, py1, dur) { EasingFunction = new SineEase { EasingMode = EasingMode.EaseIn } };
            rot.BeginAnimation(RotateTransform.AngleProperty, new DoubleAnimation(0, 540, dur));
            ay.Completed += (s, e) =>
            {
                _canvas.Children.Remove(pie);
                Splat(slot, face);
            };
            pie.BeginAnimation(Canvas.LeftProperty, ax);
            pie.BeginAnimation(Canvas.TopProperty, ay);
        }

        private void Splat(int slot, Button face)
        {
            SoundFx.Splat();
            int hi = _rng.Next(Hit.Length);
            ((ContentControl)face.Content).Content = Art.Visual("visage-touche-" + (hi + 1), Hit[hi], 245);

            // Le visage tremble sous le choc.
            Shake(face);

            // La crème : un gros nuage blanc qui s'écrase sur le visage…
            double cx = _faceX[slot] + 145, cy = FaceY + 130;
            var cream = new Canvas { IsHitTestVisible = false, RenderTransformOrigin = new Point(0.5, 0.5) };
            var csc = new ScaleTransform(0.25, 0.25);
            cream.RenderTransform = csc;
            var creamBrush = new SolidColorBrush(Color.FromRgb(0xFF, 0xFA, 0xEE));
            foreach (var (dx, dy, r) in new[]
            {
                (0.0, 0.0, 95.0), (-70.0, -30.0, 55.0), (70.0, -25.0, 58.0),
                (-45.0, 50.0, 50.0), (50.0, 55.0, 52.0), (0.0, -70.0, 48.0),
            })
            {
                var blob = new Ellipse { Width = r * 2, Height = r * 2, Fill = creamBrush };
                Canvas.SetLeft(blob, dx - r);
                Canvas.SetTop(blob, dy - r);
                cream.Children.Add(blob);
            }
            Canvas.SetLeft(cream, cx);
            Canvas.SetTop(cream, cy);
            cream.SetValue(Panel.ZIndexProperty, 75);
            _canvas.Children.Add(cream);
            var pop = new DoubleAnimation(0.25, 1.05, TimeSpan.FromMilliseconds(220))
            { EasingFunction = new BackEase { EasingMode = EasingMode.EaseOut, Amplitude = 0.5 } };
            csc.BeginAnimation(ScaleTransform.ScaleXProperty, pop);
            csc.BeginAnimation(ScaleTransform.ScaleYProperty, pop);

            // … des gouttes qui dégoulinent…
            for (int k = 0; k < 4; k++)
            {
                var drip = new Ellipse { Width = 22 - k * 3, Height = 30, Fill = creamBrush, IsHitTestVisible = false };
                Canvas.SetLeft(drip, cx - 60 + k * 40);
                Canvas.SetTop(drip, cy + 60);
                drip.SetValue(Panel.ZIndexProperty, 74);
                _canvas.Children.Add(drip);
                var fall = new DoubleAnimation(cy + 60, cy + 150 + k * 28, TimeSpan.FromMilliseconds(900 + k * 180))
                { BeginTime = TimeSpan.FromMilliseconds(250 + k * 120), EasingFunction = new SineEase { EasingMode = EasingMode.EaseIn } };
                var dfade = new DoubleAnimation(1, 0, TimeSpan.FromMilliseconds(500))
                { BeginTime = TimeSpan.FromMilliseconds(900 + k * 240) };
                var capturedDrip = drip;
                dfade.Completed += (s, e) => _canvas.Children.Remove(capturedDrip);
                drip.BeginAnimation(Canvas.TopProperty, fall);
                drip.BeginAnimation(OpacityProperty, dfade);
            }

            _splats++;
            if (_splats % 3 == 0) Speak("Splat ! En pleine figure ! Hi hi hi !");

            // … puis la crème glisse et le visage repart (un nouveau arrive).
            Schedule(1500, () =>
            {
                var slide = new DoubleAnimation(cy, cy + 260, TimeSpan.FromMilliseconds(700))
                { EasingFunction = new SineEase { EasingMode = EasingMode.EaseIn } };
                var cfade = new DoubleAnimation(1, 0, TimeSpan.FromMilliseconds(700));
                var capturedCream = cream;
                cfade.Completed += (s, e) => _canvas.Children.Remove(capturedCream);
                cream.BeginAnimation(Canvas.TopProperty, slide);
                cream.BeginAnimation(OpacityProperty, cfade);
            });
            Schedule(2100, () =>
            {
                _canvas.Children.Remove(face);
                if (_splats >= 8 && !Locked)
                {
                    Locked = true;
                    Speak("Quelle bataille de tartes ! Bravo !");
                    GameKit.Success();
                    Celebrate();
                    Schedule(2600, NewRound);
                    return;
                }
                SpawnFace(slot, pop: true);
                SoundFx.PopSound();
            });
        }
    }
}
