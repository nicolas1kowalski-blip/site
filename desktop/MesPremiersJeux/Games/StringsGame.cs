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
    /// Les ficelles : la princesse est À GAUCHE, sur sa ligne ; à droite, plusieurs
    /// images dont SON château, chacune repérée par une lettre (A, B, C, D). Depuis
    /// la princesse part une ficelle emmêlée (parmi d'autres, toutes de la même
    /// couleur) qui traverse l'écran à l'HORIZONTALE : l'enfant SUIT la ficelle de la
    /// princesse jusqu'à l'image où elle arrive, puis appuie sur la lettre
    /// correspondante dans la barre A/B/C/D du bas. Les ficelles sont bien séparées,
    /// une par ligne — aucune ne « part d'un carré » commun. Quand c'est juste, la
    /// ficelle de la princesse ET son château s'illuminent.
    /// « Aide la princesse à retrouver son château ! »
    /// </summary>
    public sealed class StringsGame : GameControl
    {
        // Images « leurres » possibles à droite (le château est toujours présent).
        private static readonly string[] Distractors =
            { "fleur", "poisson", "arcenciel", "nuage", "etoile", "coeur", "soleil", "papillon", "couronne" };

        private static readonly Color[] Palette =
        {
            Color.FromRgb(0xFF, 0x6B, 0xB0), Color.FromRgb(0x5D, 0xAD, 0xE2),
            Color.FromRgb(0x7E, 0x3F, 0xF2), Color.FromRgb(0x2E, 0xA0, 0x43),
            Color.FromRgb(0xFF, 0x8F, 0x1F),
        };

        private static readonly string[] Letters = { "A", "B", "C", "D" };
        private static readonly Color Gold = Color.FromRgb(0xFF, 0xC1, 0x07);

        private const double W = 1340, H = 760, PlayH = 600;
        private const double CardW = 168, CardH = 128;
        private const double LeftX = 20, RightX = 1130, StartX = 200, EndX = 1120;

        private Path _princessString;
        private Border _chateauCard;
        private int _correct;

        public StringsGame(Action celebrate) : base(celebrate) { }

        protected override void NewRound()
        {
            Locked = false;

            int n = 3 + GameKit.RandInt(2);            // 3 ou 4 lignes (A/B/C ou A/B/C/D)
            var color = new SolidColorBrush(Palette[GameKit.RandInt(Palette.Length)]);

            int princessLane = GameKit.RandInt(n);
            var perm = RandomPermutation(n);
            int chateauRight = perm[princessLane];     // ligne d'arrivée de la ficelle de la princesse
            _correct = chateauRight;                   // la lettre à désigner

            // Images de droite : le château à sa place, des leurres ailleurs.
            var pool = GameKit.Shuffle(Distractors.ToList());
            var rightNames = new string[n];
            int di = 0;
            for (int j = 0; j < n; j++)
                rightNames[j] = j == chateauRight ? "chateau" : pool[di++];

            Question.Text = "Suis la ficelle de la princesse jusqu'à son château, puis choisis A, B, C ou D !";

            var canvas = new Canvas { Width = W, Height = H };

            // Ficelles (toutes de la même couleur), emmêlées mais bien séparées :
            // une part de chaque ligne à gauche et traverse à l'horizontale vers la
            // droite. On garde une référence à celle de la princesse pour l'illuminer.
            for (int i = 0; i < n; i++)
            {
                double y1 = CenterY(i, n), y2 = CenterY(perm[i], n);
                double c1y = CenterY((i + 1) % n, n) + GameKit.RandInt(80) - 40;
                double c2y = CenterY((perm[i] + 1) % n, n) + GameKit.RandInt(80) - 40;
                var str = new Path
                {
                    Stroke = color,
                    StrokeThickness = 10,
                    StrokeStartLineCap = PenLineCap.Round,
                    StrokeEndLineCap = PenLineCap.Round,
                    Data = Geometry.Parse(FormattableString.Invariant(
                        $"M {StartX},{y1} C 560,{c1y} 800,{c2y} {EndX},{y2}")),
                };
                if (i == princessLane) _princessString = str;
                canvas.Children.Add(str);
            }

            // Nœuds de départ des leurres (petits ronds) là où il n'y a pas la princesse.
            for (int i = 0; i < n; i++)
            {
                if (i == princessLane) continue;
                var knot = new Ellipse { Width = 26, Height = 26, Fill = color, Stroke = Brushes.White, StrokeThickness = 3 };
                Canvas.SetLeft(knot, StartX - 13);
                Canvas.SetTop(knot, CenterY(i, n) - 13);
                canvas.Children.Add(knot);
            }

            // La princesse (à gauche, sur sa ligne).
            var princess = new Border
            {
                Width = CardW,
                Height = CardH,
                CornerRadius = new CornerRadius(20),
                Background = new SolidColorBrush(Color.FromArgb(0xC0, 0xFF, 0xFF, 0xFF)),
                BorderBrush = new SolidColorBrush(Gold),
                BorderThickness = new Thickness(6),
                Child = new Viewbox { Child = CartoonArt.Draw("princesse"), Margin = new Thickness(10) },
            };
            Canvas.SetLeft(princess, LeftX);
            Canvas.SetTop(princess, CenterY(princessLane, n) - CardH / 2);
            canvas.Children.Add(princess);

            // Images d'arrivée à droite, chacune repérée par sa lettre (A, B, C, D).
            _chateauCard = null;
            for (int j = 0; j < n; j++)
            {
                var item = CartoonArt.Items.First(it => it.Name == rightNames[j]);
                var card = new Border
                {
                    Width = CardW,
                    Height = CardH,
                    CornerRadius = new CornerRadius(18),
                    Background = new SolidColorBrush(Color.FromArgb(0xC0, 0xFF, 0xFF, 0xFF)),
                    Child = new Viewbox { Child = item.Build(), Margin = new Thickness(8) },
                };
                Canvas.SetLeft(card, RightX);
                Canvas.SetTop(card, CenterY(j, n) - CardH / 2);
                canvas.Children.Add(card);
                if (j == chateauRight) _chateauCard = card;

                // Pastille-lettre en haut à gauche de l'image.
                var tag = new Grid { Width = 46, Height = 46 };
                tag.Children.Add(new Ellipse { Fill = new SolidColorBrush(color.Color), Stroke = Brushes.White, StrokeThickness = 3 });
                tag.Children.Add(new TextBlock { Text = Letters[j], FontSize = 26, FontWeight = FontWeights.Bold, Foreground = Brushes.White, HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center });
                Canvas.SetLeft(tag, RightX - 10);
                Canvas.SetTop(tag, CenterY(j, n) - CardH / 2 - 10);
                canvas.Children.Add(tag);
            }

            // Barre de réponses A / B / C / D en bas.
            double bw = 150, gap = 20, total = n * bw + (n - 1) * gap, bx0 = (W - total) / 2;
            for (int k = 0; k < n; k++)
            {
                int idx = k;
                var btn = new Button
                {
                    Style = (Style)Application.Current.Resources["AnswerButton"],
                    Width = bw,
                    Height = 118,
                    Content = new TextBlock
                    {
                        Text = Letters[k],
                        FontSize = 68,
                        FontWeight = FontWeights.Bold,
                        Foreground = new SolidColorBrush(Color.FromRgb(0x3B, 0x2A, 0x5A)),
                        HorizontalAlignment = HorizontalAlignment.Center,
                        VerticalAlignment = VerticalAlignment.Center,
                    },
                };
                btn.Click += (s, e) => Answer(idx, btn);
                Canvas.SetLeft(btn, bx0 + k * (bw + gap));
                Canvas.SetTop(btn, H - 130);
                canvas.Children.Add(btn);
            }

            SetBody(canvas);
            Schedule(350, () => Speak("Aide la princesse ! Suis sa ficelle, puis choisis A, B, C ou D."));
        }

        private static double CenterY(int lane, int n) => (lane + 0.5) * PlayH / n;

        private static List<int> RandomPermutation(int n)
        {
            var p = GameKit.Shuffle(Enumerable.Range(0, n).ToList());
            // Évite le « tout droit » (au moins un croisement).
            bool identity = true;
            for (int i = 0; i < n; i++) if (p[i] != i) { identity = false; break; }
            if (identity) { var t = p[0]; p[0] = p[n - 1]; p[n - 1] = t; }
            return p;
        }

        private void Answer(int idx, Button btn)
        {
            if (Locked) return;
            if (idx == _correct)
            {
                Locked = true;
                Illuminate(_princessString, _chateauCard);
                GameKit.Success();
                Celebrate();
                Speak($"Bravo ! La ficelle {Letters[_correct]} mène la princesse à son château !");
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
            if (str != null)
            {
                str.Stroke = glow;
                str.StrokeThickness = 16;
                str.Effect = new DropShadowEffect { Color = Gold, BlurRadius = 26, ShadowDepth = 0, Opacity = 1 };
                var pulse = new DoubleAnimation(0.55, 1, TimeSpan.FromMilliseconds(360)) { AutoReverse = true, RepeatBehavior = RepeatBehavior.Forever };
                str.BeginAnimation(UIElement.OpacityProperty, pulse);
            }

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
    }
}
