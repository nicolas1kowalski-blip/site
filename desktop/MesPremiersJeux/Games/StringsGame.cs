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
    /// images dont SON château. Depuis la princesse part une ficelle emmêlée (parmi
    /// d'autres, toutes de la même couleur) qui traverse l'écran à l'HORIZONTALE :
    /// l'enfant SUIT la ficelle de la princesse jusqu'à son château, puis le choisit.
    /// Les ficelles sont bien séparées, une par ligne — aucune ne « part d'un carré »
    /// commun. Quand c'est juste, la ficelle de la princesse ET le château s'illuminent.
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

        private static readonly Color Gold = Color.FromRgb(0xFF, 0xC1, 0x07);

        private const double W = 1340, H = 640, CardW = 172, CardH = 150;
        private const double LeftX = 20, RightX = 1130, StartX = 200, EndX = 1120;

        private Path _princessString;
        private Button _chateauBtn;

        public StringsGame(Action celebrate) : base(celebrate) { }

        protected override void NewRound()
        {
            Locked = false;

            int n = 3 + GameKit.RandInt(2);            // 3 ou 4 lignes
            var color = new SolidColorBrush(Palette[GameKit.RandInt(Palette.Length)]);

            int princessLane = GameKit.RandInt(n);
            var perm = RandomPermutation(n);
            int chateauRight = perm[princessLane];     // là où arrive la ficelle de la princesse

            // Images de droite : le château à sa place, des leurres ailleurs.
            var pool = GameKit.Shuffle(Distractors.ToList());
            var rightNames = new string[n];
            int di = 0;
            for (int j = 0; j < n; j++)
                rightNames[j] = j == chateauRight ? "chateau" : pool[di++];

            Question.Text = "Aide la princesse à retrouver son château ! Suis sa ficelle.";

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
                Child = new Viewbox { Child = CartoonArt.Draw("princesse"), Margin = new Thickness(12) },
            };
            Canvas.SetLeft(princess, LeftX);
            Canvas.SetTop(princess, CenterY(princessLane, n) - CardH / 2);
            canvas.Children.Add(princess);

            // Images de droite (les réponses).
            _chateauBtn = null;
            for (int j = 0; j < n; j++)
            {
                var name = rightNames[j];
                var item = CartoonArt.Items.First(it => it.Name == name);
                var btn = new Button
                {
                    Style = (Style)Application.Current.Resources["AnswerButton"],
                    Width = CardW,
                    Height = CardH,
                    Content = new Viewbox { Child = item.Build(), Margin = new Thickness(8) },
                };
                bool ok = j == chateauRight;
                if (ok) _chateauBtn = btn;
                var fr = item.Fr;
                btn.Click += (s, e) => Answer(ok, fr, btn);
                Canvas.SetLeft(btn, RightX);
                Canvas.SetTop(btn, CenterY(j, n) - CardH / 2);
                canvas.Children.Add(btn);
            }

            SetBody(canvas);
            Schedule(350, () => Speak("Aide la princesse ! Suis sa ficelle pour retrouver son château."));
        }

        private static double CenterY(int lane, int n) => (lane + 0.5) * H / n;

        private static List<int> RandomPermutation(int n)
        {
            var p = GameKit.Shuffle(Enumerable.Range(0, n).ToList());
            // Évite le « tout droit » (au moins un croisement).
            bool identity = true;
            for (int i = 0; i < n; i++) if (p[i] != i) { identity = false; break; }
            if (identity) { var t = p[0]; p[0] = p[n - 1]; p[n - 1] = t; }
            return p;
        }

        private void Answer(bool ok, string chosenFr, Button btn)
        {
            if (Locked) return;
            if (ok)
            {
                Locked = true;
                Illuminate(_princessString, _chateauBtn);
                GameKit.Success();
                Celebrate();
                Speak("Bravo ! La princesse a retrouvé son château !");
                ScheduleNext(3000);
            }
            else
            {
                GameKit.Wrong();
                Shake(btn);
                Speak($"Non, ça c'est {chosenFr}. Suis bien la ficelle de la princesse !");
            }
        }

        private static void Illuminate(Path str, Button chateau)
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
