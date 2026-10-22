using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using MesPremiersJeux.Data;
using MesPremiersJeux.Lib;

namespace MesPremiersJeux.Games
{
    /// <summary>Combien d'objets ? Choisir 1, 2 ou 3.</summary>
    public sealed class CountGame : GameControl
    {
        private static readonly Dictionary<int, Color> Bg = new Dictionary<int, Color>
        {
            { 1, Color.FromRgb(0xFF, 0xE9, 0xC7) },
            { 2, Color.FromRgb(0xC6, 0xF0, 0xE7) },
            { 3, Color.FromRgb(0xFF, 0xD3, 0xDC) },
            { 4, Color.FromRgb(0xDC, 0xD6, 0xFF) },
            { 5, Color.FromRgb(0xFF, 0xF3, 0xB0) },
        };

        private int _lastN;
        private static readonly string[] Words = { "zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix" };

        public CountGame(Action celebrate) : base(celebrate) { }

        protected override void NewRound()
        {
            Locked = false;
            int n;
            n = GameKit.NextNumber("compter", 1, Level.MaxNumber);
            _lastN = n;
            // Trois choix voisins (dont la bonne réponse), dans l'ordre 1 → 5.
            var options = Level.Pick(Enumerable.Range(1, Level.MaxNumber).ToList(), n).OrderBy(v => v).ToList();
            string ask = "Combien ? " + string.Join("... ", options.Select(v => Words[v])) + " ?";
            Question.Text = "Combien ?";
            SetConsigne(null, () => ask);

            var item = GameKit.Rand(CartoonArt.Items);
            var visuals = Row();
            for (int i = 0; i < n; i++)
            {
                visuals.Children.Add(new Viewbox
                {
                    Child = item.Build(),
                    Width = 200,
                    Height = 200,
                    Margin = new Thickness(12, 0, 12, 0),
                });
            }

            var row = Row();
            foreach (var num in options)
            {
                var label = new TextBlock
                {
                    Text = num.ToString(),
                    FontSize = 88,
                    FontWeight = FontWeights.Bold,
                    Foreground = new SolidColorBrush(Color.FromRgb(0x3B, 0x2A, 0x5A)),
                };
                var btn = AnswerButton(label, 180);
                btn.Background = new SolidColorBrush(Bg[num]);
                int chosen = num;
                btn.Click += (s, e) => Answer(chosen, n, btn);
                row.Children.Add(btn);
            }

            SetBody(visuals, row);
            Schedule(350, () => Speak(ask));
        }

        private void Answer(int num, int n, Button btn)
        {
            if (Locked) return;
            if (num == n)
            {
                Locked = true;
                GameKit.Success();
                Celebrate();
                string detail = "Il y en a " + Words[n] + " !";
                Speak($"{GameKit.Praise()} {detail}");
                ScheduleNext(2400);
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
