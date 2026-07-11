using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using MesPremiersJeux.Data;
using MesPremiersJeux.Lib;

namespace MesPremiersJeux.Games
{
    /// <summary>Une forme sombre (ombre 3D) tourne : retrouver la forme correspondante.</summary>
    public sealed class ShadowGame : GameControl
    {
        public ShadowGame(Action celebrate) : base(celebrate) { }

        protected override void NewRound()
        {
            Locked = false;
            var target = GameKit.Rand(GameData.Shapes);
            var options = GameKit.PickN(GameData.Shapes, 3, target);
            Question.Text = "Quel objet fait cette ombre ?";

            var silhouette = Shape3D.View(Shape3D.ShapeMesh(target.Name), Color.FromRgb(0x22, 0x22, 0x2A), 330);
            var colored = Shape3D.View(Shape3D.ShapeMesh(target.Name), target.Color, 330);
            colored.Visibility = Visibility.Collapsed;
            var stage = new Grid { Children = { silhouette, colored } };

            var row = Row();
            foreach (var s in options)
            {
                var btn = AnswerButton(Shape3D.View(Shape3D.ShapeMesh(s.Name), s.Color, 175));
                var chosen = s;
                btn.Click += (ev, e) => Answer(chosen, target, btn, silhouette, colored);
                row.Children.Add(btn);
            }

            SetBody(stage, row);
            Schedule(350, () => Speak("Quel objet fait cette ombre ?"));
        }

        private void Answer(GameShape s, GameShape target, Button btn, UIElement silhouette, UIElement colored)
        {
            if (Locked) return;
            if (s.Name == target.Name)
            {
                Locked = true;
                silhouette.Visibility = Visibility.Collapsed; // l'ombre laisse place à l'objet coloré
                colored.Visibility = Visibility.Visible;
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
