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
    /// <summary>Range par famille : sélectionne tous les objets (cartes 3D) de la bonne catégorie.</summary>
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
                var card = new Card3D(it.emoji);
                card.ShowFront();

                var check = new TextBlock
                {
                    Text = "✓",
                    FontSize = 46,
                    FontWeight = FontWeights.Bold,
                    Foreground = new SolidColorBrush(Color.FromRgb(0x2E, 0x7D, 0x32)),
                    HorizontalAlignment = HorizontalAlignment.Center,
                    VerticalAlignment = VerticalAlignment.Center,
                    Visibility = Visibility.Collapsed,
                };
                var overlay = new Border
                {
                    Background = new SolidColorBrush(Color.FromArgb(0x66, 0x8A, 0xE6, 0x8A)),
                    CornerRadius = new CornerRadius(16),
                    Visibility = Visibility.Collapsed,
                };

                var btn = new Button
                {
                    Style = (Style)Application.Current.Resources["BalloonButton"],
                    Width = 130,
                    Height = 168,
                    Margin = new Thickness(6),
                    Content = new Grid { Children = { card.Viewport, overlay, check } },
                };
                bool isTarget = it.isTarget;
                btn.Click += (s, e) => Pick(btn, isTarget, target.Name, overlay, check);
                grid.Children.Add(btn);
            }

            SetBody(grid);
            Schedule(350, () => Speak($"Regarde tous {target.Name} !"));
        }

        private void Pick(Button btn, bool isTarget, string familyName, UIElement overlay, UIElement check)
        {
            if (Locked || _found.Contains(btn)) return;
            if (isTarget)
            {
                GameKit.Success();
                _found.Add(btn);
                overlay.Visibility = Visibility.Visible;
                check.Visibility = Visibility.Visible;
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
