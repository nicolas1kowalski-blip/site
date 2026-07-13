using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using MesPremiersJeux.Lib;

namespace MesPremiersJeux.Games
{
    /// <summary>
    /// Cherche et trouve : plusieurs personnages sont éparpillés sur la scène,
    /// l'enfant doit trouver celui qui est demandé (« Où est le chat ? »).
    /// </summary>
    public sealed class SeekFindGame : GameControl
    {
        private const double SceneW = 1300, SceneH = 640, ItemSize = 190;

        public SeekFindGame(Action celebrate) : base(celebrate) { }

        protected override void NewRound()
        {
            Locked = false;
            var items = GameKit.Shuffle(CartoonArt.Items).Take(6).ToList();
            var target = GameKit.Rand(items);
            Question.Text = $"Où est {target.Fr} ?";

            var canvas = new Canvas { Width = SceneW, Height = SceneH };

            // Positions éparpillées mais sans chevauchement (grille + hasard).
            var cells = new List<(double X, double Y)>();
            for (int r = 0; r < 2; r++)
                for (int c = 0; c < 3; c++)
                    cells.Add((c * (SceneW / 3), r * (SceneH / 2)));
            cells = GameKit.Shuffle(cells);

            for (int i = 0; i < items.Count; i++)
            {
                var it = items[i];
                double cw = SceneW / 3, ch = SceneH / 2;
                double x = cells[i].X + 30 + GameKit.RandInt((int)(cw - ItemSize - 60));
                double y = cells[i].Y + 20 + GameKit.RandInt((int)(ch - ItemSize - 40));

                var btn = new Button
                {
                    Style = (Style)Application.Current.Resources["BalloonButton"],
                    Width = ItemSize,
                    Height = ItemSize,
                    Content = new Viewbox { Child = it.Build() },
                };
                var chosen = it;
                btn.Click += (s, e) => Answer(chosen, target, btn);
                Canvas.SetLeft(btn, x);
                Canvas.SetTop(btn, y);
                canvas.Children.Add(btn);
            }

            SetBody(canvas);
            Schedule(350, () => Speak($"Où est {target.Fr} ? Cherche bien !"));
        }

        private void Answer(CartoonItem chosen, CartoonItem target, Button btn)
        {
            if (Locked) return;
            if (chosen.Name == target.Name)
            {
                Locked = true;
                GameKit.Success();
                Celebrate();
                Speak($"Bravo ! Tu as trouvé {target.Fr} !");
                ScheduleNext(2600);
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
