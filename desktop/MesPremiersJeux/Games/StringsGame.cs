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
    /// Les ficelles : la princesse est À GAUCHE et tient plusieurs ficelles dont les
    /// DÉPARTS sont repérés par une lettre (A, B, C, D), bien séparés, un par ligne.
    /// À DROITE, des pictos dont SON château. Les ficelles (même couleur) traversent
    /// l'écran à l'horizontale et s'ENTREMÊLENT ; chacune arrive à un picto, une SEULE
    /// au château. En bas, une barre A/B/C/D. L'enfant suit du regard chaque ficelle
    /// depuis sa lettre de départ et désigne celle qui mène au château. Quand c'est
    /// juste, cette ficelle ET le château s'illuminent.
    /// « Aide la princesse : quelle ficelle mène à son château ? »
    /// </summary>
    public sealed class StringsGame : GameControl
    {
        // Pictos « leurres » possibles à droite (le château est toujours présent).
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
        private const double PrincessX = 20, PrincessW = 150;
        private const double DepX = 210;       // départ des ficelles (et pastille-lettre)
        private const double EndX = 1115;      // arrivée des ficelles (bord des pictos)
        private const double RightX = 1120;    // bord gauche des pictos de droite

        private Path _correctString;
        private Border _chateauCard;
        private int _correct;

        public StringsGame(Action celebrate) : base(celebrate) { }

        protected override void NewRound()
        {
            Locked = false;

            int n = 3 + GameKit.RandInt(2);            // 3 ou 4 ficelles (A/B/C ou A/B/C/D)
            var color = new SolidColorBrush(Palette[GameKit.RandInt(Palette.Length)]);

            // Ficelle de départ k (lettre k) → picto d'arrivée perm[k].
            var perm = RandomPermutation(n);
            int chateauDest = GameKit.RandInt(n);      // ligne d'arrivée du château (à droite)
            _correct = perm.IndexOf(chateauDest);      // la ficelle (lettre) qui y mène

            // Pictos de droite : le château à sa place, des leurres ailleurs.
            var pool = GameKit.Shuffle(Distractors.ToList());
            var rightNames = new string[n];
            int di = 0;
            for (int j = 0; j < n; j++)
                rightNames[j] = j == chateauDest ? "chateau" : pool[di++];

            Question.Text = "Quelle ficelle mène la princesse à son château ? Suis A, B, C ou D !";

            var canvas = new Canvas { Width = W, Height = H };

            // La princesse, à gauche : elle tient toutes les ficelles.
            var princess = new Border
            {
                Width = PrincessW,
                Height = PlayH - 40,
                CornerRadius = new CornerRadius(22),
                Background = new SolidColorBrush(Color.FromArgb(0xC0, 0xFF, 0xFF, 0xFF)),
                BorderBrush = new SolidColorBrush(Gold),
                BorderThickness = new Thickness(6),
                Child = new Viewbox { Child = CartoonArt.Draw("princesse"), Margin = new Thickness(12) },
            };
            Canvas.SetLeft(princess, PrincessX);
            Canvas.SetTop(princess, 20);
            canvas.Children.Add(princess);

            // Ficelles (toutes de la même couleur), départs séparés à gauche, arrivées
            // séparées à droite, entremêlées au milieu. On garde celle du château.
            var strings = new Path[n];
            for (int k = 0; k < n; k++)
            {
                double y1 = CenterY(k, n), y2 = CenterY(perm[k], n);
                double c1y = CenterY((k + 1) % n, n) + GameKit.RandInt(80) - 40;
                double c2y = CenterY((perm[k] + 1) % n, n) + GameKit.RandInt(80) - 40;
                var str = new Path
                {
                    Stroke = color,
                    StrokeThickness = 10,
                    StrokeStartLineCap = PenLineCap.Round,
                    StrokeEndLineCap = PenLineCap.Round,
                    Data = Geometry.Parse(FormattableString.Invariant(
                        $"M {DepX},{y1} C 560,{c1y} 800,{c2y} {EndX},{y2}")),
                };
                strings[k] = str;
                canvas.Children.Add(str);
            }
            _correctString = strings[_correct];

            // Pastilles-lettres au DÉPART de chaque ficelle (côté princesse).
            for (int k = 0; k < n; k++)
            {
                var tag = new Grid { Width = 50, Height = 50 };
                tag.Children.Add(new Ellipse { Fill = new SolidColorBrush(color.Color), Stroke = Brushes.White, StrokeThickness = 3 });
                tag.Children.Add(new TextBlock { Text = Letters[k], FontSize = 28, FontWeight = FontWeights.Bold, Foreground = Brushes.White, HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center });
                Canvas.SetLeft(tag, DepX - 25);
                Canvas.SetTop(tag, CenterY(k, n) - 25);
                canvas.Children.Add(tag);
            }

            // Pictos d'arrivée à droite (le château + les leurres), un par ligne.
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
                if (j == chateauDest) _chateauCard = card;
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
            Schedule(350, () => Speak("Suis les ficelles ! Laquelle mène la princesse à son château ? A, B, C ou D ?"));
        }

        private static double CenterY(int lane, int n) => (lane + 0.5) * PlayH / n;

        private static List<int> RandomPermutation(int n)
        {
            var p = GameKit.Shuffle(Enumerable.Range(0, n).ToList());
            // Évite le « tout droit » (au moins un croisement pour que ça s'entremêle).
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
                Illuminate(_correctString, _chateauCard);
                GameKit.Success();
                Celebrate();
                Speak($"Bravo ! La ficelle {Letters[_correct]} mène la princesse à son château !");
                ScheduleNext(3000);
            }
            else
            {
                GameKit.Wrong();
                Shake(btn);
                Speak("Non, suis bien la ficelle jusqu'au château !");
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
