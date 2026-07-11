using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Media;
using MesPremiersJeux.Data;
using MesPremiersJeux.Lib;

namespace MesPremiersJeux.Games
{
    /// <summary>Range par famille : sélectionne tous les objets de la bonne catégorie.</summary>
    public sealed class FamiliesGame : GameControl
    {
        private int _need;
        private readonly HashSet<Button> _found = new HashSet<Button>();

        public FamiliesGame(Action celebrate) : base(celebrate) { }

        protected override void NewRound()
        {
            Locked = false;
            _found.Clear();

            var target = GameKit.Rand(GameData.Families);
            var others = GameData.Families.Where(f => f != target).SelectMany(f => f.Items).ToList();
            var targetItems = GameKit.Shuffle(target.Items).Take(3).ToList();
            var distractors = GameKit.Shuffle(others).Take(3).ToList();
            _need = targetItems.Count;

            var items = GameKit.Shuffle(
                targetItems.Select(e => (emoji: e, isTarget: true))
                    .Concat(distractors.Select(e => (emoji: e, isTarget: false))));

            Question.Text = $"Regarde tous {target.Name} !";

            var grid = new UniformGrid { Columns = 3, HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center };
            foreach (var it in items)
            {
                var btn = AnswerButton(new TextBlock { Text = it.emoji, FontSize = 66 }, 130);
                bool isTarget = it.isTarget;
                btn.Click += (s, e) => Pick(btn, isTarget, target.Name);
                grid.Children.Add(btn);
            }

            SetBody(grid);
            Schedule(350, () => Speak($"Regarde tous {target.Name} !"));
        }

        private void Pick(Button btn, bool isTarget, string familyName)
        {
            if (Locked || _found.Contains(btn)) return;
            if (isTarget)
            {
                GameKit.Success();
                _found.Add(btn);
                btn.Background = new SolidColorBrush(Color.FromRgb(0xB6, 0xEF, 0xB6));
                var emoji = btn.Content as UIElement;
                btn.Content = null; // détache l'emoji avant de le re-parenter
                var check = new TextBlock
                {
                    Text = "✓",
                    FontSize = 30,
                    Foreground = new SolidColorBrush(Color.FromRgb(0x2E, 0x7D, 0x32)),
                    HorizontalAlignment = HorizontalAlignment.Right,
                    VerticalAlignment = VerticalAlignment.Top,
                    Margin = new Thickness(0, 4, 6, 0),
                };
                btn.Content = new Grid { Children = { emoji, check } };
                if (_found.Count >= _need)
                {
                    Locked = true;
                    Celebrate();
                    Speak($"Bravo ! Tu as trouvé tous {familyName} !");
                    ScheduleNext(3000);
                }
                else
                {
                    Speak(GameKit.Praise());
                }
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
