using System;
using System.Collections.Generic;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using MesPremiersJeux.Data;
using MesPremiersJeux.Lib;

namespace MesPremiersJeux.Games
{
    /// <summary>
    /// Éducatif (MS) : les suites logiques (algorithme A-B-A-B…). Une suite de
    /// ronds colorés est montrée avec un « ? » à la fin ; l'enfant choisit la
    /// couleur qui continue la suite.
    /// </summary>
    public sealed class PatternGame : GameControl
    {
        public PatternGame(Action celebrate) : base(celebrate) { }

        private static Border Dot(Color c, double size) => new Border
        {
            Width = size,
            Height = size,
            CornerRadius = new CornerRadius(size / 2),
            Background = new SolidColorBrush(c),
            BorderBrush = new SolidColorBrush(Color.FromRgb(0x2B, 0x2D, 0x42)),
            BorderThickness = new Thickness(4),
            Margin = new Thickness(10, 0, 10, 0),
            VerticalAlignment = VerticalAlignment.Center,
        };

        protected override void NewRound()
        {
            Locked = false;
            Question.Text = "Qu'est-ce qui vient après ?";

            // Deux couleurs bien distinctes pour la suite A-B-A-B-?
            var a = GameKit.Rand(GameData.Colors);
            GameColor b;
            do { b = GameKit.Rand(GameData.Colors); } while (b.Name == a.Name);

            // Suite montrée : A B A B (la réponse est A).
            var stage = Row();
            foreach (var col in new[] { a, b, a, b })
                stage.Children.Add(Dot(col.Value, 120));
            stage.Children.Add(new Border
            {
                Width = 120,
                Height = 120,
                CornerRadius = new CornerRadius(60),
                Background = new SolidColorBrush(Color.FromArgb(0x30, 0x7E, 0x3F, 0xF2)),
                BorderBrush = new SolidColorBrush(Color.FromRgb(0x7E, 0x3F, 0xF2)),
                BorderThickness = new Thickness(4),
                Margin = new Thickness(10, 0, 10, 0),
                VerticalAlignment = VerticalAlignment.Center,
                Child = new TextBlock
                {
                    Text = "?",
                    FontSize = 64,
                    FontWeight = FontWeights.Bold,
                    Foreground = new SolidColorBrush(Color.FromRgb(0x7E, 0x3F, 0xF2)),
                    HorizontalAlignment = HorizontalAlignment.Center,
                    VerticalAlignment = VerticalAlignment.Center,
                },
            });

            // Choix : la bonne couleur + deux autres.
            var options = GameKit.PickN(GameData.Colors, 3, a);
            var row = Row();
            foreach (var col in options)
            {
                var btn = AnswerButton(Dot(col.Value, 130), 190);
                var chosen = col;
                btn.Click += (s, e) => Answer(chosen, a, btn);
                row.Children.Add(btn);
            }

            SetBody(stage, row);
            Schedule(350, () => Speak("Regarde bien la suite. Qu'est-ce qui vient après ?"));
        }

        private void Answer(GameColor chosen, GameColor target, Button btn)
        {
            if (Locked) return;
            if (chosen.Name == target.Name)
            {
                Locked = true;
                GameKit.Success();
                Celebrate();
                Speak($"Bravo ! C'est {target.Name} qui continue la suite !");
                ScheduleNext(2600);
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
