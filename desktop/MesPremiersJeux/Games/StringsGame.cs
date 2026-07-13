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
    /// Les ficelles : trois personnages, trois ficelles emmêlées, trois objets.
    /// « Aide la princesse à retrouver son château ! » — l'enfant suit la ficelle
    /// du héros et choisit l'objet au bout.
    /// </summary>
    public sealed class StringsGame : GameControl
    {
        private sealed class Pair
        {
            public string Hero, Target, Phrase; // « son château », « sa fleur »…
        }

        private static readonly Pair[] Pairs =
        {
            new Pair { Hero = "princesse", Target = "chateau",   Phrase = "son château" },
            new Pair { Hero = "licorne",   Target = "arcenciel", Phrase = "son arc-en-ciel" },
            new Pair { Hero = "chat",      Target = "poisson",   Phrase = "son poisson" },
            new Pair { Hero = "oiseau",    Target = "nuage",     Phrase = "son nuage" },
            new Pair { Hero = "lapin",     Target = "fleur",     Phrase = "sa fleur" },
        };

        private static readonly Color[] StringColors =
        {
            Color.FromRgb(0xFF, 0x6B, 0xB0), Color.FromRgb(0x5D, 0xAD, 0xE2), Color.FromRgb(0xFF, 0xC1, 0x07),
        };

        private const double W = 1340, H = 640;
        private static readonly double[] LaneY = { 40, 240, 440 }; // haut des cases

        public StringsGame(Action celebrate) : base(celebrate) { }

        protected override void NewRound()
        {
            Locked = false;
            var chosen = GameKit.Shuffle(Pairs).Take(3).ToList();
            var hero = chosen[0];
            Question.Text = $"Aide {CartoonArt.Items.First(i => i.Name == hero.Hero).Fr} à retrouver {hero.Phrase} !";

            var canvas = new Canvas { Width = W, Height = H };

            // Position des héros (gauche, dans l'ordre mélangé) et des objets
            // (droite, permutation aléatoire des cibles).
            var leftOrder = GameKit.Shuffle(chosen);
            var rightOrder = GameKit.Shuffle(chosen);

            // Ficelles d'abord (sous les personnages/objets).
            for (int li = 0; li < 3; li++)
            {
                var p = leftOrder[li];
                int ri = rightOrder.IndexOf(p);
                double y1 = LaneY[li] + 80;
                double y2 = LaneY[ri] + 80;

                // Points de contrôle croisés pour emmêler les ficelles.
                double c1y = LaneY[(li + 1) % 3] + 80 + GameKit.RandInt(60) - 30;
                double c2y = LaneY[(li + 2) % 3] + 80 + GameKit.RandInt(60) - 30;

                var path = new Path
                {
                    Stroke = new SolidColorBrush(StringColors[li]),
                    StrokeThickness = 9,
                    StrokeStartLineCap = PenLineCap.Round,
                    StrokeEndLineCap = PenLineCap.Round,
                    Data = Geometry.Parse(FormattableString.Invariant(
                        $"M 210,{y1} C 560,{c1y} 800,{c2y} 1130,{y2}")),
                    Opacity = 0.9,
                };
                canvas.Children.Add(path);
            }

            // Personnages à gauche (le héros est entouré d'un halo doré).
            for (int li = 0; li < 3; li++)
            {
                var p = leftOrder[li];
                var item = CartoonArt.Items.First(i => i.Name == p.Hero);
                var host = new Border
                {
                    Width = 170,
                    Height = 160,
                    CornerRadius = new CornerRadius(20),
                    Background = new SolidColorBrush(Color.FromArgb(0xB0, 0xFF, 0xFF, 0xFF)),
                    BorderBrush = p == hero ? new SolidColorBrush(Color.FromRgb(0xFF, 0xC1, 0x07)) : Brushes.Transparent,
                    BorderThickness = new Thickness(p == hero ? 6 : 0),
                    Child = new Viewbox { Child = item.Build(), Margin = new Thickness(14) },
                };
                Canvas.SetLeft(host, 30);
                Canvas.SetTop(host, LaneY[li]);
                canvas.Children.Add(host);
            }

            // Objets à droite : les boutons-réponses.
            for (int ri = 0; ri < 3; ri++)
            {
                var p = rightOrder[ri];
                var item = CartoonArt.Items.First(i => i.Name == p.Target);
                var btn = new Button
                {
                    Style = (Style)Application.Current.Resources["AnswerButton"],
                    Width = 180,
                    Height = 165,
                    Content = new Viewbox { Child = item.Build(), Margin = new Thickness(10) },
                };
                bool ok = p == hero;
                var targetItem = item;
                btn.Click += (s, e) => Answer(ok, hero, targetItem.Fr, btn);
                Canvas.SetLeft(btn, 1130);
                Canvas.SetTop(btn, LaneY[ri]);
                canvas.Children.Add(btn);
            }

            SetBody(canvas);
            Schedule(350, () => Speak(Question.Text + " Suis la ficelle !"));
        }

        private void Answer(bool ok, Pair hero, string chosenFr, Button btn)
        {
            if (Locked) return;
            if (ok)
            {
                Locked = true;
                GameKit.Success();
                Celebrate();
                var heroFr = CartoonArt.Items.First(i => i.Name == hero.Hero).Fr;
                Speak($"Bravo ! {heroFr} a retrouvé {hero.Phrase} !");
                ScheduleNext(2800);
            }
            else
            {
                GameKit.Wrong();
                Shake(btn);
                Speak($"Non, ça c'est {chosenFr}. Suis bien la ficelle !");
            }
        }
    }
}
