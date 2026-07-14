using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Media.Effects;
using System.Windows.Shapes;
using MesPremiersJeux.Lib;

namespace MesPremiersJeux.Games
{
    /// <summary>
    /// Les ficelles : la princesse est AU MILIEU ; des ficelles emmêlées (même
    /// couleur) partent d'elle vers plusieurs images tout autour, dont son château.
    /// Chaque ficelle porte une lettre (A, B, C, D) près de la princesse ; en bas,
    /// des boutons A/B/C/D. L'enfant suit du regard et désigne la bonne ficelle ;
    /// quand c'est juste, la ficelle ET le château s'illuminent.
    /// </summary>
    public sealed class StringsGame : GameControl
    {
        private static readonly string[] Distractors =
            { "fleur", "poisson", "arcenciel", "nuage", "etoile", "coeur", "soleil", "papillon", "couronne" };

        private static readonly string[] Letters = { "A", "B", "C", "D" };
        private static readonly Color Gold = Color.FromRgb(0xFF, 0xC1, 0x07);

        private const double W = 1340, H = 760, CardW = 150, CardH = 140;
        private const double ImgY = 36, HubR = 108;

        private Path[] _strings;
        private Border _chateauCard;
        private int _correct;

        public StringsGame(Action celebrate) : base(celebrate) { }

        protected override void NewRound()
        {
            Locked = false;

            int n = 3 + GameKit.RandInt(2);              // 3 ou 4 ficelles
            var color = new SolidColorBrush(Palette());
            double cx = W / 2, cy = 384;                 // la princesse, au centre

            var perm = RandomPermutation(n);             // ficelle k → image perm[k]
            int chateauSlot = GameKit.RandInt(n);
            _correct = Array.IndexOf(perm.ToArray(), chateauSlot); // lettre menant au château

            // Images (le château + des leurres), réparties en haut.
            var pool = GameKit.Shuffle(Distractors.ToList());
            var names = new string[n];
            int di = 0;
            for (int j = 0; j < n; j++) names[j] = j == chateauSlot ? "chateau" : pool[di++];

            Question.Text = "Quelle ficelle mène la princesse à son château ? A, B, C ou D ?";

            var canvas = new Canvas { Width = W, Height = H };

            // Points de départ des ficelles autour de la princesse (elle les tient).
            var start = new Point[n];
            for (int k = 0; k < n; k++)
            {
                double a = (25 + 130.0 * (n == 1 ? 0.5 : (double)k / (n - 1))) * Math.PI / 180.0;
                start[k] = new Point(cx + HubR * Math.Cos(a), cy - HubR * Math.Sin(a));
            }
            double SlotCx(int j) => (j + 0.5) * W / n;

            // Ficelles (même couleur), emmêlées.
            _strings = new Path[n];
            for (int k = 0; k < n; k++)
            {
                double sx = start[k].X, sy = start[k].Y;
                double ex = SlotCx(perm[k]), ey = ImgY + CardH;
                var p = new Path
                {
                    Stroke = color,
                    StrokeThickness = 9,
                    StrokeStartLineCap = PenLineCap.Round,
                    StrokeEndLineCap = PenLineCap.Round,
                    Data = Geometry.Parse(FormattableString.Invariant(
                        $"M {sx},{sy} C {(sx + ex) / 2},{sy} {(sx + ex) / 2},{ey} {ex},{ey}")),
                };
                _strings[k] = p;
                canvas.Children.Add(p);
            }

            // Images en haut.
            for (int j = 0; j < n; j++)
            {
                var item = CartoonArt.Items.First(it => it.Name == names[j]);
                var card = new Border
                {
                    Width = CardW,
                    Height = CardH,
                    CornerRadius = new CornerRadius(18),
                    Background = new SolidColorBrush(Color.FromArgb(0xC0, 0xFF, 0xFF, 0xFF)),
                    Child = new Viewbox { Child = item.Build(), Margin = new Thickness(8) },
                };
                Canvas.SetLeft(card, SlotCx(j) - CardW / 2);
                Canvas.SetTop(card, ImgY);
                canvas.Children.Add(card);
                if (j == chateauSlot) _chateauCard = card;
            }

            // La princesse, au centre.
            var princess = new Border
            {
                Width = 190,
                Height = 180,
                CornerRadius = new CornerRadius(22),
                Background = new SolidColorBrush(Color.FromArgb(0xD0, 0xFF, 0xFF, 0xFF)),
                BorderBrush = new SolidColorBrush(Gold),
                BorderThickness = new Thickness(6),
                Child = new Viewbox { Child = CartoonArt.Draw("princesse"), Margin = new Thickness(12) },
            };
            Canvas.SetLeft(princess, cx - 95);
            Canvas.SetTop(princess, cy - 90);
            canvas.Children.Add(princess);

            // Étiquettes-lettres au départ de chaque ficelle.
            for (int k = 0; k < n; k++)
            {
                var tag = new Grid { Width = 42, Height = 42 };
                tag.Children.Add(new Ellipse { Fill = color, Stroke = Brushes.White, StrokeThickness = 3 });
                tag.Children.Add(new TextBlock { Text = Letters[k], FontSize = 24, FontWeight = FontWeights.Bold, Foreground = Brushes.White, HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center });
                Canvas.SetLeft(tag, start[k].X - 21);
                Canvas.SetTop(tag, start[k].Y - 21);
                canvas.Children.Add(tag);
            }

            // Barre A/B/C/D en bas (les réponses).
            double bw = 140, gap = 18, total = n * bw + (n - 1) * gap, bx0 = (W - total) / 2;
            for (int k = 0; k < n; k++)
            {
                int idx = k;
                var btn = new Button
                {
                    Style = (Style)Application.Current.Resources["AnswerButton"],
                    Width = bw,
                    Height = 120,
                    Content = new TextBlock { Text = Letters[k], FontSize = 72, FontWeight = FontWeights.Bold, Foreground = new SolidColorBrush(Color.FromRgb(0x3B, 0x2A, 0x5A)), HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center },
                };
                btn.Click += (s, e) => Answer(idx, btn);
                Canvas.SetLeft(btn, bx0 + k * (bw + gap));
                Canvas.SetTop(btn, H - 140);
                canvas.Children.Add(btn);
            }

            SetBody(canvas);
            Schedule(350, () => Speak("Suis les ficelles ! Laquelle mène la princesse à son château ?"));
        }

        private void Answer(int idx, Button btn)
        {
            if (Locked) return;
            if (idx == _correct)
            {
                Locked = true;
                Illuminate(_strings[_correct], _chateauCard);
                GameKit.Success();
                Celebrate();
                Speak($"Bravo ! La ficelle {Letters[_correct]} mène au château !");
                ScheduleNext(3000);
            }
            else
            {
                GameKit.Wrong();
                Shake(btn);
                Speak("Non, suis bien la ficelle de la princesse !");
            }
        }

        private static void Illuminate(Path str, Border chateau)
        {
            var glow = new SolidColorBrush(Gold);
            str.Stroke = glow;
            str.StrokeThickness = 16;
            str.Effect = new DropShadowEffect { Color = Gold, BlurRadius = 26, ShadowDepth = 0, Opacity = 1 };
            var pulse = new DoubleAnimation(0.55, 1, TimeSpan.FromMilliseconds(360)) { AutoReverse = true, RepeatBehavior = RepeatBehavior.Forever };
            str.BeginAnimation(UIElement.OpacityProperty, pulse);

            if (chateau != null)
            {
                chateau.BorderBrush = glow;
                chateau.BorderThickness = new Thickness(8);
                chateau.Effect = new DropShadowEffect { Color = Gold, BlurRadius = 34, ShadowDepth = 0, Opacity = 1 };
                chateau.RenderTransformOrigin = new Point(0.5, 0.5);
                var st = new ScaleTransform(1, 1);
                chateau.RenderTransform = st;
                var grow = new DoubleAnimation(1, 1.12, TimeSpan.FromMilliseconds(420)) { AutoReverse = true, RepeatBehavior = RepeatBehavior.Forever };
                st.BeginAnimation(ScaleTransform.ScaleXProperty, grow);
                st.BeginAnimation(ScaleTransform.ScaleYProperty, grow);
            }
        }

        private static Color Palette()
        {
            Color[] p =
            {
                Color.FromRgb(0xFF, 0x6B, 0xB0), Color.FromRgb(0x5D, 0xAD, 0xE2),
                Color.FromRgb(0x7E, 0x3F, 0xF2), Color.FromRgb(0x2E, 0xA0, 0x43),
            };
            return p[GameKit.RandInt(p.Length)];
        }

        private static List<int> RandomPermutation(int n)
        {
            var p = GameKit.Shuffle(Enumerable.Range(0, n).ToList());
            bool identity = true;
            for (int i = 0; i < n; i++) if (p[i] != i) { identity = false; break; }
            if (identity) { var t = p[0]; p[0] = p[n - 1]; p[n - 1] = t; }
            return p;
        }
    }
}
