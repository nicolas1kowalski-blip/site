using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Shapes;
using MesPremiersJeux.Lib;

namespace MesPremiersJeux.Games
{
    /// <summary>Une ombre (silhouette noire d'un dessin cartoon) : retrouver le bon dessin.</summary>
    public sealed class ShadowGame : GameControl
    {
        public ShadowGame(Action celebrate) : base(celebrate) { }

        private static UIElement Draw(CartoonItem item, double size)
            => new Viewbox { Child = item.Build(), Width = size, Height = size };

        // Silhouette : on rend le dessin dans un bitmap, puis on s'en sert comme
        // masque d'opacité sur un rectangle noir.
        private static UIElement Silhouette(CartoonItem item, double size)
        {
            var host = new Viewbox { Child = item.Build(), Width = size, Height = size };
            host.Measure(new Size(size, size));
            host.Arrange(new Rect(0, 0, size, size));
            int px = Math.Max(1, (int)size);
            var rtb = new RenderTargetBitmap(px, px, 96, 96, PixelFormats.Pbgra32);
            rtb.Render(host);
            return new Rectangle
            {
                Width = size,
                Height = size,
                Fill = new SolidColorBrush(Color.FromRgb(0x22, 0x22, 0x2A)),
                OpacityMask = new ImageBrush(rtb) { Stretch = Stretch.Uniform },
            };
        }

        protected override void NewRound()
        {
            Locked = false;
            var target = GameKit.Rand(CartoonArt.Items);
            var options = GameKit.PickN(CartoonArt.Items, 3, target);
            Question.Text = "Quel objet fait cette ombre ?";

            var silhouette = Silhouette(target, 320);
            var colored = Draw(target, 320);
            colored.Visibility = Visibility.Collapsed;
            var stage = new Grid { Children = { silhouette, colored } };

            var row = Row();
            foreach (var s in options)
            {
                var btn = AnswerButton(Draw(s, 175));
                var chosen = s;
                btn.Click += (ev, e) => Answer(chosen, target, btn, silhouette, colored);
                row.Children.Add(btn);
            }

            SetBody(stage, row);
            Schedule(350, () => Speak("Quel objet fait cette ombre ?"));
        }

        private void Answer(CartoonItem s, CartoonItem target, Button btn, UIElement silhouette, UIElement colored)
        {
            if (Locked) return;
            if (s.Name == target.Name)
            {
                Locked = true;
                silhouette.Visibility = Visibility.Collapsed;
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
