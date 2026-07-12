using System;
using System.Collections.Generic;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Media;
using MesPremiersJeux.Lib;

namespace MesPremiersJeux.Games
{
    /// <summary>
    /// Éducatif (PS/MS) : reconnaître les lettres. Une lettre est nommée
    /// (« Trouve la lettre A ! ») ; l'enfant la choisit parmi trois grands
    /// panneaux. Chaque réussite associe la lettre à un mot (« A comme avion ! »).
    /// </summary>
    public sealed class LettersGame : GameControl
    {
        private static readonly (string Letter, string Word)[] Alphabet =
        {
            ("A", "avion"), ("B", "ballon"), ("C", "chat"), ("D", "dauphin"),
            ("E", "éléphant"), ("F", "fleur"), ("G", "gâteau"), ("H", "hibou"),
            ("I", "île"), ("J", "jouet"), ("K", "koala"), ("L", "lion"),
            ("M", "maison"), ("N", "nuage"), ("O", "orange"), ("P", "papillon"),
            ("R", "robot"), ("S", "soleil"), ("T", "tortue"), ("V", "vélo"), ("Z", "zèbre"),
        };

        private static readonly Color[] Panels =
        {
            Color.FromRgb(0xFF, 0xC9, 0xE0), Color.FromRgb(0xC9, 0xE7, 0xFF), Color.FromRgb(0xFF, 0xE6, 0xB3),
            Color.FromRgb(0xC9, 0xF5, 0xD8), Color.FromRgb(0xD8, 0xC9, 0xFF), Color.FromRgb(0xFF, 0xD3, 0xC2),
        };

        public LettersGame(Action celebrate) : base(celebrate) { }

        protected override void NewRound()
        {
            Locked = false;
            var target = GameKit.Rand(Alphabet);
            var options = GameKit.PickN(Alphabet, 3, target);
            Question.Text = $"Trouve la lettre : {target.Letter}";

            var grid = new UniformGrid { Columns = 3 };
            int ci = GameKit.RandInt(Panels.Length);
            foreach (var opt in options)
            {
                var bg = Panels[ci++ % Panels.Length];
                var btn = new Button
                {
                    Style = (Style)Application.Current.Resources["AnswerButton"],
                    Background = new SolidColorBrush(bg),
                    Content = new Viewbox
                    {
                        Margin = new Thickness(30),
                        Child = new TextBlock
                        {
                            Text = opt.Letter,
                            FontSize = 200,
                            FontWeight = FontWeights.Bold,
                            Foreground = new SolidColorBrush(Color.FromRgb(0x3B, 0x2A, 0x5A)),
                        },
                    },
                };
                var chosen = opt;
                btn.Click += (s, e) => Answer(chosen, target, btn);
                grid.Children.Add(btn);
            }

            SetBodyFill(grid);
            Schedule(350, () => Speak($"Trouve la lettre {target.Letter} !"));
        }

        private void Answer((string Letter, string Word) chosen, (string Letter, string Word) target, Button btn)
        {
            if (Locked) return;
            if (chosen.Letter == target.Letter)
            {
                Locked = true;
                GameKit.Success();
                Celebrate();
                Speak($"Bravo ! {target.Letter}, comme {target.Word} !");
                ScheduleNext(2800);
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
