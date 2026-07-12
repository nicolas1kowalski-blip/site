using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using MesPremiersJeux.Lib;

namespace MesPremiersJeux.Games
{
    /// <summary>
    /// Éducatif (PS/MS) : l'imagier. Un mot est dit (« Trouve le chat ! ») et
    /// l'enfant montre la bonne image parmi trois. Travaille le vocabulaire et
    /// la compréhension orale.
    /// </summary>
    public sealed class VocabGame : GameControl
    {
        public VocabGame(Action celebrate) : base(celebrate) { }

        protected override void NewRound()
        {
            Locked = false;
            var target = GameKit.Rand(CartoonArt.Items);
            var options = GameKit.PickN(CartoonArt.Items, 3, target);
            Question.Text = $"Trouve : {target.Fr}";

            var grid = new UniformGrid { Columns = 3 };
            foreach (var it in options)
            {
                var btn = new Button
                {
                    Style = (Style)Application.Current.Resources["AnswerButton"],
                    Content = new Viewbox { Child = it.Build(), Margin = new Thickness(26) },
                };
                var chosen = it;
                btn.Click += (s, e) => Answer(chosen, target, btn);
                grid.Children.Add(btn);
            }

            SetBodyFill(grid);
            Schedule(350, () => Speak($"Trouve {target.Fr} !"));
        }

        private void Answer(CartoonItem chosen, CartoonItem target, Button btn)
        {
            if (Locked) return;
            if (chosen.Name == target.Name)
            {
                Locked = true;
                GameKit.Success();
                Celebrate();
                Speak($"Bravo ! C'est {target.Fr} !");
                ScheduleNext(2400);
            }
            else
            {
                GameKit.Wrong();
                Shake(btn);
                Speak($"Non, ça c'est {chosen.Fr}. Cherche {target.Fr} !");
            }
        }
    }
}
