using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using MesPremiersJeux.Data;
using MesPremiersJeux.Lib;

namespace MesPremiersJeux.Games
{
    /// <summary>Trouve la couleur nommée parmi trois pastilles.</summary>
    public sealed class ColorsGame : GameControl
    {
        public ColorsGame(Action celebrate) : base(celebrate) { }

        protected override void NewRound()
        {
            Locked = false;
            var target = GameKit.Rand(GameData.Colors);
            var options = GameKit.PickN(GameData.Colors, 3, target);
            Question.Text = $"Trouve la couleur : {target.Name}";

            var blob = new Border
            {
                Width = 190,
                Height = 190,
                CornerRadius = new CornerRadius(95),
                Background = new SolidColorBrush(target.Value),
                BorderBrush = new SolidColorBrush(Color.FromRgb(0x2B, 0x2D, 0x42)),
                BorderThickness = new Thickness(4),
            };

            var row = Row();
            foreach (var c in options)
            {
                var swatch = new Border
                {
                    Width = 110,
                    Height = 110,
                    CornerRadius = new CornerRadius(18),
                    Background = new SolidColorBrush(c.Value),
                };
                var btn = AnswerButton(swatch);
                var chosen = c;
                btn.Click += (s, e) => Answer(chosen, target, btn);
                row.Children.Add(btn);
            }

            SetBody(blob, row);
            Schedule(350, () => Speak($"Trouve la couleur {target.Name}"));
        }

        private void Answer(GameColor c, GameColor target, Button btn)
        {
            if (Locked) return;
            if (c.Name == target.Name)
            {
                Locked = true;
                GameKit.Success();
                Celebrate();
                Speak($"{GameKit.Praise()} C'est {target.Name} !");
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
