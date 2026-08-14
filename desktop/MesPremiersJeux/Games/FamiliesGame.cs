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
    /// <summary>Range par famille : sélectionne toutes les cartes cartoon de la bonne catégorie.</summary>
    public sealed class FamiliesGame : GameControl
    {
        private int _need;
        private readonly HashSet<Button> _found = new HashSet<Button>();

        public FamiliesGame(Action celebrate) : base(celebrate) { }

        protected override void NewRound()
        {
            Locked = false;
            _found.Clear();

            var cats = CartoonArt.Items.Select(i => i.Cat).Distinct().ToList();
            var targetCat = GameKit.Rand(cats);
            var targetPool = CartoonArt.Items.Where(i => i.Cat == targetCat).ToList();
            var others = CartoonArt.Items.Where(i => i.Cat != targetCat).ToList();

            var targetItems = GameKit.Shuffle(targetPool).Take(3).ToList();
            var distractors = GameKit.Shuffle(others).Take(3).ToList();
            _need = targetItems.Count;

            var items = GameKit.Shuffle(
                targetItems.Select(it => (item: it, isTarget: true))
                    .Concat(distractors.Select(it => (item: it, isTarget: false))));

            Question.Text = $"Regarde tous {targetCat} !";

            var grid = new UniformGrid { Columns = 3 }; // 2 lignes de 3, grandes cartes
            foreach (var entry in items)
            {
                var card = new Card3D(entry.item.Build(), entry.item.Name);
                card.ShowFront();

                var check = new TextBlock
                {
                    Text = "✓",
                    FontSize = 70,
                    FontWeight = FontWeights.Bold,
                    Foreground = new SolidColorBrush(Color.FromRgb(0x2E, 0x7D, 0x32)),
                    HorizontalAlignment = HorizontalAlignment.Center,
                    VerticalAlignment = VerticalAlignment.Center,
                    Visibility = Visibility.Collapsed,
                };
                var overlay = new Border
                {
                    Background = new SolidColorBrush(Color.FromArgb(0x66, 0x8A, 0xE6, 0x8A)),
                    CornerRadius = new CornerRadius(20),
                    Visibility = Visibility.Collapsed,
                };

                var btn = new Button
                {
                    Style = (Style)Application.Current.Resources["BalloonButton"],
                    Width = 440,
                    Height = 440,
                    Margin = new Thickness(6),
                    Content = new Grid { Children = { card.Viewport, overlay, check } },
                };
                bool isTarget = entry.isTarget;
                btn.Click += (s, e) => Pick(btn, isTarget, targetCat, overlay, check);
                grid.Children.Add(btn);
            }

            SetBody(grid);
            Schedule(350, () => Speak($"Regarde tous {targetCat} !"));
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
