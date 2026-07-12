using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Media;
using MesPremiersJeux.Data;
using MesPremiersJeux.Lib;

namespace MesPremiersJeux.Games
{
    /// <summary>Trouve la couleur nommée : trois grands panneaux de couleur.</summary>
    public sealed class ColorsGame : GameControl
    {
        public ColorsGame(Action celebrate) : base(celebrate) { }

        protected override void NewRound()
        {
            Locked = false;
            var target = GameKit.Rand(GameData.Colors);
            var options = GameKit.PickN(GameData.Colors, 3, target);
            Question.Text = $"Trouve la couleur : {target.Name}";

            // Trois grands panneaux pleins qui remplissent la page (cibles énormes,
            // presque collées : plus de zone morte entre les couleurs).
            var grid = new UniformGrid { Columns = 3 };
            foreach (var c in options)
            {
                var btn = new Button
                {
                    Style = (Style)Application.Current.Resources["ColorPanel"],
                    Background = new SolidColorBrush(c.Value),
                };
                var chosen = c;
                btn.Click += (s, e) => Answer(chosen, target, btn);
                grid.Children.Add(btn);
            }

            SetBody(grid);
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
