using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Shapes;
using MesPremiersJeux.Data;
using MesPremiersJeux.Lib;

namespace MesPremiersJeux.Games
{
    /// <summary>Une ombre (silhouette noire) est montrée : retrouver l'objet correspondant.</summary>
    public sealed class ShadowGame : GameControl
    {
        public ShadowGame(Action celebrate) : base(celebrate) { }

        // Rend l'emoji dans un bitmap, puis s'en sert comme masque d'opacité sur
        // un rectangle noir → une silhouette fiable (un VisualBrush d'un élément
        // hors arbre visuel ne se rend pas toujours).
        private static UIElement Silhouette(string emoji, double size)
        {
            var tb = new TextBlock { Text = emoji, FontSize = size * 0.95 };
            tb.Measure(new Size(double.PositiveInfinity, double.PositiveInfinity));
            tb.Arrange(new Rect(tb.DesiredSize));
            int w = Math.Max(1, (int)Math.Ceiling(tb.DesiredSize.Width));
            int h = Math.Max(1, (int)Math.Ceiling(tb.DesiredSize.Height));
            var rtb = new RenderTargetBitmap(w, h, 96, 96, PixelFormats.Pbgra32);
            rtb.Render(tb);
            return new Rectangle
            {
                Width = size,
                Height = size,
                Fill = Brushes.Black,
                OpacityMask = new ImageBrush(rtb) { Stretch = Stretch.Uniform },
            };
        }

        protected override void NewRound()
        {
            Locked = false;
            var target = GameKit.Rand(GameData.CountObjects);
            var options = GameKit.PickN(GameData.CountObjects, 3, target);
            Question.Text = "Quel objet fait cette ombre ?";

            // Silhouette : un rectangle noir masqué par la forme de l'emoji.
            var silhouette = Silhouette(target, 200);
            var colored = new TextBlock
            {
                Text = target,
                FontSize = 190,
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
                Visibility = Visibility.Collapsed,
            };
            var stage = new Grid { Children = { silhouette, colored } };

            var row = Row();
            foreach (var emo in options)
            {
                var btn = AnswerButton(new TextBlock { Text = emo, FontSize = 80 });
                var chosen = emo;
                btn.Click += (s, e) => Answer(chosen, target, btn, silhouette, colored);
                row.Children.Add(btn);
            }

            SetBody(stage, row);
            Schedule(350, () => Speak("Quel objet fait cette ombre ?"));
        }

        private void Answer(string emo, string target, Button btn, UIElement silhouette, UIElement colored)
        {
            if (Locked) return;
            if (emo == target)
            {
                Locked = true;
                silhouette.Visibility = Visibility.Collapsed; // l'ombre laisse place à l'objet
                colored.Visibility = Visibility.Visible;
                GameKit.Success();
                Celebrate();
                Speak(GameKit.Praise());
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
