using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Shapes;
using MesPremiersJeux.Data;
using MesPremiersJeux.Lib;

namespace MesPremiersJeux.Games
{
    /// <summary>Trouve la forme nommée parmi trois (les choix sont en une couleur neutre).</summary>
    public sealed class ShapesGame : GameControl
    {
        private static readonly Color Dark = Color.FromRgb(0x2B, 0x2D, 0x42);

        public ShapesGame(Action celebrate) : base(celebrate) { }

        private static UIElement ShapeVisual(GameShape s, Color fill, double size)
        {
            var path = new Path
            {
                Data = s.Geo,
                Fill = new SolidColorBrush(fill),
                Stroke = new SolidColorBrush(Dark),
                StrokeThickness = 4,
                StrokeLineJoin = PenLineJoin.Round,
            };
            return new Viewbox { Width = size, Height = size, Child = path };
        }

        protected override void NewRound()
        {
            Locked = false;
            var target = GameKit.Rand(GameData.Shapes);
            var options = GameKit.PickN(GameData.Shapes, 3, target);
            Question.Text = $"Trouve : {target.Name}";

            var stage = ShapeVisual(target, target.Color, 200);

            var row = Row();
            foreach (var s in options)
            {
                var btn = AnswerButton(ShapeVisual(s, GameData.ShapeNeutral, 110));
                var chosen = s;
                btn.Click += (ev, e) => Answer(chosen, target, btn);
                row.Children.Add(btn);
            }

            SetBody(stage, row);
            Schedule(350, () => Speak($"Trouve : {target.Name}"));
        }

        private void Answer(GameShape s, GameShape target, Button btn)
        {
            if (Locked) return;
            if (s.Name == target.Name)
            {
                Locked = true;
                GameKit.Success();
                Celebrate();
                Speak($"{GameKit.Praise()} C'est un {target.Name} !");
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
