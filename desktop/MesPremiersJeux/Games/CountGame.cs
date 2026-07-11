using System;
using System.Collections.Generic;
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
        };

        public CountGame(Action celebrate) : base(celebrate) { }

        protected override void NewRound()
        {
            Locked = false;
            int n = 1 + new Random().Next(3);
            var options = GameKit.Shuffle(new[] { 1, 2, 3 });
            Question.Text = "Combien ?";

            var sphere = Shape3D.Sphere(16, 22, 1.0);
            var col = GameData.BalloonColors[new Random().Next(GameData.BalloonColors.Length)];
            var visuals = Row();
            for (int i = 0; i < n; i++)
            {
                var vp = Shape3D.View(sphere, col, 120);
                vp.Margin = new Thickness(10, 0, 10, 0);
                visuals.Children.Add(vp);
            }

            var row = Row();
            foreach (var num in options)
            {
                var label = new TextBlock
                {
                    Text = num.ToString(),
                    FontSize = 56,
                    FontWeight = FontWeights.Bold,
                    Foreground = new SolidColorBrush(Color.FromRgb(0x3B, 0x2A, 0x5A)),
                };
                var btn = AnswerButton(label, 120);
                btn.Background = new SolidColorBrush(Bg[num]);
                int chosen = num;
                btn.Click += (s, e) => Answer(chosen, n, btn);
                row.Children.Add(btn);
            }

            SetBody(visuals, row);
            Schedule(350, () => Speak("Combien ? Un... Deux... ou Trois ?"));
        }

        private void Answer(int num, int n, Button btn)
        {
            if (Locked) return;
            if (num == n)
            {
                Locked = true;
                GameKit.Success();
                Celebrate();
                string detail = n == 1 ? "Il y en a un !" : n == 2 ? "Il y en a deux !" : "Il y en a trois !";
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
