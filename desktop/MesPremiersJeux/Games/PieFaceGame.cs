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
    /// « Tartes à la crème » (inspiré de Look to Learn) : UN visage rigolo
    /// surgit À UN ENDROIT AU HASARD de l'écran — l'enfant doit le chercher
    /// des yeux (ça fait travailler le balayage du regard), puis le regarder
    /// pour lancer la tarte : SPLAT, grimace, crème qui dégouline… et un
    /// nouveau visage surgit ailleurs. Zéro échec, que du rire.
    /// </summary>
    public sealed class PieFaceGame : GameControl
    {
        private const double W = 1500, H = 720;
        private const double FaceSize = 290;

        private static readonly string[] Faces = { "😀", "🤠", "🤓", "😮", "🥸", "😊", "🧐", "😁" };
        private static readonly string[] Hit = { "😵", "🤪", "😝", "😜" };

        private readonly Random _rng = new Random();
        private Canvas _canvas;
        private int _splats;
        private double _lastX = -999, _lastY = -999;

        public PieFaceGame(Action celebrate) : base(celebrate) { }

        protected override void NewRound()
        {
            Locked = false;
            _splats = 0;
            Question.Text = "🥧 Tartes à la crème";
            SetConsigne(new TextBlock { Text = "🔍🥧" },
                () => "Cherche le visage rigolo... et regarde-le pour lancer la tarte ! SPLAT !");

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

            SpawnFace();

            SetBody(_canvas);
            Speak("Les tartes à la crème ! Cherche le visage... et regarde-le bien pour lancer la tarte !");
        }

        // Un endroit au hasard, loin du bord, du plat de tartes… et du visage
        // précédent (pour obliger le regard à VOYAGER).
        private (double X, double Y) RandomSpot()
        {
            for (int tries = 0; tries < 40; tries++)
            {
                double x = 30 + _rng.NextDouble() * (W - FaceSize - 60);
                double y = 60 + _rng.NextDouble() * (H - FaceSize - 90);
                bool nearPlate = y > H - FaceSize - 130 && x > W / 2 - 320 && x < W / 2 + 180;
                double dx = x - _lastX, dy = y - _lastY;
                if (!nearPlate && Math.Sqrt(dx * dx + dy * dy) > 420) return (x, y);
            }
            return (60, 80);
        }

        private void SpawnFace()
        {
            var (fx, fy) = RandomSpot();
            _lastX = fx;
            _lastY = fy;

            int fi = _rng.Next(Faces.Length);
            // Le visage : image du parent (visage-N.png) → dessin vectoriel
            // intégré (FaceArt) ; l'emoji n'est plus qu'un secours.
            var imgF = Art.Find("visage-" + (fi + 1));
            var visual = imgF != null
                ? (FrameworkElement)new Image { Source = imgF, Width = 245, Height = 245, Stretch = Stretch.Uniform }
                : FaceArt.Make(fi, 245);
            var face = new Button
            {
                Style = (Style)Application.Current.Resources["AnswerButton"],
                Width = FaceSize,
                Height = FaceSize,
                RenderTransformOrigin = new Point(0.5, 0.5),
                Content = new ContentControl { Content = visual },
            };
            var captured = face;
            face.Click += (s, e) => ThrowPie(captured, fx, fy);
            Canvas.SetLeft(face, fx);
            Canvas.SetTop(face, fy);
            _canvas.Children.Add(face);

            // Il SURGIT (pop) avec un petit bruit, pour attirer l'œil.
            SoundFx.PopSound();
            var sc = new ScaleTransform(0.15, 0.15);
            face.RenderTransform = sc;
            var grow = new DoubleAnimation(0.15, 1, TimeSpan.FromMilliseconds(450))
            { EasingFunction = new BackEase { EasingMode = EasingMode.EaseOut, Amplitude = 0.8 } };
            sc.BeginAnimation(ScaleTransform.ScaleXProperty, grow);
            sc.BeginAnimation(ScaleTransform.ScaleYProperty, grow);
        }

        private void ThrowPie(Button face, double fx, double fy)
        {
            if (Locked) return;
            face.IsHitTestVisible = false;

            // La tarte part du plat (en bas au centre) et file vers le visage
            // en tournant sur elle-même. Image du parent (tarte.png) sinon le
            // dessin vectoriel intégré.
            var imgP = Art.Find("tarte");
            FrameworkElement pie = imgP != null
                ? new Image { Source = imgP, Width = 140, Height = 140, Stretch = Stretch.Uniform }
                : FaceArt.Pie(140);
            pie.IsHitTestVisible = false;
            pie.RenderTransformOrigin = new Point(0.5, 0.5);
            var rot = new RotateTransform(0);
            pie.RenderTransform = rot;
            double px0 = W / 2 - 70, py0 = H - 110;
            double px1 = fx + 75, py1 = fy + 65;
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
                Splat(face, fx, fy);
            };
            pie.BeginAnimation(Canvas.LeftProperty, ax);
            pie.BeginAnimation(Canvas.TopProperty, ay);
        }

        private void Splat(Button face, double fx, double fy)
        {
            SoundFx.Splat();
            int hi = _rng.Next(Hit.Length);
            var imgH = Art.Find("visage-touche-" + (hi + 1));
            ((ContentControl)face.Content).Content = imgH != null
                ? (FrameworkElement)new Image { Source = imgH, Width = 245, Height = 245, Stretch = Stretch.Uniform }
                : FaceArt.Hit(hi, 245);

            // Le visage tremble sous le choc.
            Shake(face);

            // La crème : un gros nuage blanc qui s'écrase sur le visage…
            double cx = fx + 145, cy = fy + 130;
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

            // … puis la crème glisse, le visage s'en va, et un autre surgit
            // AILLEURS sur l'écran.
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
                SpawnFace();
            });
        }
    }
}
