using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Shapes;
using MesPremiersJeux.Lib;

namespace MesPremiersJeux.Games
{
    /// <summary>
    /// Les ficelles : UN personnage à gauche tient une ficelle emmêlée parmi
    /// d'autres, toutes de la MÊME couleur (on ne peut pas tricher par la couleur,
    /// il faut la suivre du regard). À droite, trois arrivées A, B et C. « Où arrive
    /// la ficelle ? » — l'enfant suit le fil et choisit A, B ou C.
    /// </summary>
    public sealed class StringsGame : GameControl
    {
        private static readonly string[] Heroes =
            { "princesse", "licorne", "chat", "oiseau", "lapin", "chien", "cochon" };

        private static readonly Color[] Palette =
        {
            Color.FromRgb(0xFF, 0x6B, 0xB0), Color.FromRgb(0x5D, 0xAD, 0xE2),
            Color.FromRgb(0x7E, 0x3F, 0xF2), Color.FromRgb(0x2E, 0xA0, 0x43),
            Color.FromRgb(0xFF, 0x8F, 0x1F),
        };

        private static readonly string[] Letters = { "A", "B", "C" };

        private const double W = 1340, H = 620;
        private static readonly double[] LaneY = { 30, 230, 430 }; // haut des cases
        private const double CardMid = 82;                          // centre vertical d'une case

        public StringsGame(Action celebrate) : base(celebrate) { }

        protected override void NewRound()
        {
            Locked = false;

            var heroName = Heroes[GameKit.RandInt(Heroes.Length)];
            var heroFr = CartoonArt.Items.First(i => i.Name == heroName).Fr;
            var color = Palette[GameKit.RandInt(Palette.Length)];

            int charLane = GameKit.RandInt(3);

            // Permutation gauche→droite (on évite le « tout droit » pour que ça s'emmêle).
            var perm = GameKit.Shuffle(new List<int> { 0, 1, 2 });
            if (perm[0] == 0 && perm[1] == 1 && perm[2] == 2) perm = new List<int> { 1, 2, 0 };
            int correct = perm[charLane]; // case d'arrivée de la ficelle du héros

            Question.Text = $"Où arrive la ficelle de {heroFr} ? A, B ou C ?";

            var canvas = new Canvas { Width = W, Height = H };
            var brush = new SolidColorBrush(color);

            // Ficelles (toutes de la même couleur), emmêlées.
            for (int i = 0; i < 3; i++)
            {
                double y1 = LaneY[i] + CardMid, y2 = LaneY[perm[i]] + CardMid;
                double c1y = LaneY[(i + 1) % 3] + CardMid + GameKit.RandInt(70) - 35;
                double c2y = LaneY[(perm[i] + 2) % 3] + CardMid + GameKit.RandInt(70) - 35;
                canvas.Children.Add(new Path
                {
                    Stroke = brush,
                    StrokeThickness = 10,
                    StrokeStartLineCap = PenLineCap.Round,
                    StrokeEndLineCap = PenLineCap.Round,
                    Data = Geometry.Parse(FormattableString.Invariant(
                        $"M 205,{y1} C 560,{c1y} 800,{c2y} 1120,{y2}")),
                });
            }

            // Nœuds de départ (petits ronds de couleur) sur les lignes sans personnage.
            for (int i = 0; i < 3; i++)
            {
                if (i == charLane) continue;
                var knot = new Ellipse { Width = 26, Height = 26, Fill = brush, Stroke = Brushes.White, StrokeThickness = 3 };
                Canvas.SetLeft(knot, 205 - 13);
                Canvas.SetTop(knot, LaneY[i] + CardMid - 13);
                canvas.Children.Add(knot);
            }

            // Personnage (un seul), à gauche de sa ficelle.
            var heroBox = new Border
            {
                Width = 180,
                Height = 164,
                CornerRadius = new CornerRadius(22),
                Background = new SolidColorBrush(Color.FromArgb(0xC0, 0xFF, 0xFF, 0xFF)),
                BorderBrush = new SolidColorBrush(Color.FromRgb(0xFF, 0xC1, 0x07)),
                BorderThickness = new Thickness(6),
                Child = new Viewbox { Child = CartoonArt.Items.First(i => i.Name == heroName).Build(), Margin = new Thickness(14) },
            };
            Canvas.SetLeft(heroBox, 20);
            Canvas.SetTop(heroBox, LaneY[charLane]);
            canvas.Children.Add(heroBox);

            // Arrivées A / B / C (les réponses).
            for (int j = 0; j < 3; j++)
            {
                int lane = j;
                var letter = Letters[lane];
                var btn = new Button
                {
                    Style = (Style)Application.Current.Resources["AnswerButton"],
                    Width = 175,
                    Height = 164,
                    Content = new TextBlock
                    {
                        Text = letter,
                        FontSize = 96,
                        FontWeight = FontWeights.Bold,
                        Foreground = new SolidColorBrush(Color.FromRgb(0x3B, 0x2A, 0x5A)),
                        HorizontalAlignment = HorizontalAlignment.Center,
                        VerticalAlignment = VerticalAlignment.Center,
                    },
                };
                bool ok = lane == correct;
                btn.Click += (s, e) => Answer(ok, heroFr, letter, btn);
                Canvas.SetLeft(btn, 1120);
                Canvas.SetTop(btn, LaneY[lane]);
                canvas.Children.Add(btn);
            }

            SetBody(canvas);
            Schedule(350, () => Speak($"Suis la ficelle de {heroFr}. Où arrive-t-elle ? A, B ou C ?"));
        }

        private void Answer(bool ok, string heroFr, string letter, Button btn)
        {
            if (Locked) return;
            if (ok)
            {
                Locked = true;
                GameKit.Success();
                Celebrate();
                Speak($"Bravo ! La ficelle de {heroFr} arrive à {letter} !");
                ScheduleNext(2600);
            }
            else
            {
                GameKit.Wrong();
                Shake(btn);
                Speak($"Non, ce n'est pas {letter}. Suis bien la ficelle !");
            }
        }
    }
}
