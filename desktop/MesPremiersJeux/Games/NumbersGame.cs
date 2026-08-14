using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using MesPremiersJeux.Lib;

namespace MesPremiersJeux.Games
{
    /// <summary>
    /// Éducatif (PS/MS) : dénombrer une petite quantité (1 à 5) et choisir le
    /// chiffre correspondant. Les objets comptés sont des dessins cartoon.
    /// </summary>
    public sealed class NumbersGame : GameControl
    {
        private static readonly string[] NumberWords = { "", "un", "deux", "trois", "quatre", "cinq" };

        private static readonly Color[] Bg =
        {
            Color.FromRgb(0xFF, 0xE9, 0xC7), Color.FromRgb(0xC6, 0xF0, 0xE7), Color.FromRgb(0xFF, 0xD3, 0xDC),
            Color.FromRgb(0xD8, 0xC9, 0xFF), Color.FromRgb(0xC9, 0xE7, 0xFF),
        };

        private int _lastN;

        public NumbersGame(Action celebrate) : base(celebrate) { }

        protected override void NewRound()
        {
            Locked = false;
            int n;
            do { n = 1 + GameKit.RandInt(5); } while (n == _lastN);
            _lastN = n;

            var item = GameKit.Rand(CartoonArt.Items);
            Question.Text = "Compte ! Combien il y en a ?";

            // Les objets à compter (sur une ligne, en quinconce léger).
            var visuals = new WrapPanel
            {
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
                MaxWidth = 1100,
            };
            for (int i = 0; i < n; i++)
            {
                visuals.Children.Add(new Viewbox
                {
                    Child = item.Build(),
                    Width = 190,
                    Height = 190,
                    Margin = new Thickness(12, i % 2 == 0 ? 0 : 22, 12, 0),
                });
            }

            // Trois chiffres possibles (dont le bon).
            var candidates = Enumerable.Range(1, 5).ToList();
            var options = GameKit.PickN(candidates, 3, n);
            var row = Row();
            foreach (var num in options)
            {
                var label = new TextBlock
                {
                    Text = num.ToString(),
                    FontSize = 110,
                    FontWeight = FontWeights.Bold,
                    Foreground = new SolidColorBrush(Color.FromRgb(0x3B, 0x2A, 0x5A)),
                };
                var btn = AnswerButton(label, 190);
                btn.Background = new SolidColorBrush(Bg[(num - 1) % Bg.Length]);
                int chosen = num;
                btn.Click += (s, e) => Answer(chosen, n, item.Fr, btn);
                row.Children.Add(btn);
            }

            SetBody(visuals, row);
            Schedule(350, () => Speak("Compte ! Combien il y en a ?"));
        }

        private void Answer(int chosen, int n, string itemName, Button btn)
        {
            if (Locked) return;
            if (chosen == n)
            {
                Locked = true;
                GameKit.Success();
                Celebrate();
                Speak($"Bravo ! Il y en a {NumberWords[n]} !");
                ScheduleNext(2600);
            }
            else
            {
                GameKit.Wrong();
                Shake(btn);
                Speak(GameKit.Encourage());
            }
        }
    }
}
