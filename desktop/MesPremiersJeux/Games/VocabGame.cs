using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Media;
using MesPremiersJeux.Lib;

namespace MesPremiersJeux.Games
{
    /// <summary>
    /// Éducatif (PS/MS) : l'imagier. Un mot est dit (« Trouve le chat ! » ou
    /// « Trouve papa ! ») et l'enfant montre la bonne image parmi trois. Les
    /// photos du dossier Documents\MesPremiersJeux\Famille (papa.jpg, maman.png…)
    /// sont mélangées aux dessins.
    /// </summary>
    public sealed class VocabGame : GameControl
    {
        private sealed class Entry
        {
            public string Key;
            public string Fr;
            public Func<UIElement> Visual;
        }

        private readonly List<Entry> _pool = new List<Entry>();

        public VocabGame(Action celebrate) : base(celebrate)
        {
            foreach (var it in CartoonArt.Items)
            {
                var item = it;
                _pool.Add(new Entry { Key = item.Name, Fr = item.Fr, Visual = () => item.Build() });
            }
            foreach (var (name, path) in UserContent.LoadFamily())
            {
                var p = path;
                _pool.Add(new Entry
                {
                    Key = "fam-" + name,
                    Fr = name,
                    Visual = () => MakePhoto(p),
                });
            }
        }

        private static UIElement MakePhoto(string path)
        {
            try
            {
                return new Border
                {
                    CornerRadius = new CornerRadius(18),
                    ClipToBounds = true,
                    Child = new Image { Source = UserContent.LoadBitmap(path, 700), Stretch = Stretch.UniformToFill },
                };
            }
            catch
            {
                return new TextBlock { Text = "🖼️", FontSize = 120 };
            }
        }

        protected override void NewRound()
        {
            Locked = false;
            var target = GameKit.Rand(_pool);
            var options = GameKit.PickN(_pool, 3, target);
            Question.Text = $"Trouve : {target.Fr}";

            var grid = new UniformGrid { Columns = 3 };
            foreach (var it in options)
            {
                var btn = new Button
                {
                    Style = (Style)Application.Current.Resources["AnswerButton"],
                    Content = new Viewbox { Child = it.Visual(), Margin = new Thickness(26) },
                };
                var chosen = it;
                btn.Click += (s, e) => Answer(chosen, target, btn);
                grid.Children.Add(btn);
            }

            SetBodyFill(grid);
            Schedule(350, () => Speak($"Trouve {target.Fr} !"));
        }

        private void Answer(Entry chosen, Entry target, Button btn)
        {
            if (Locked) return;
            if (chosen.Key == target.Key)
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
