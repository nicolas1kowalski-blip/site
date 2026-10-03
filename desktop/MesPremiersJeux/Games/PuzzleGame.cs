using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using MesPremiersJeux.Lib;

namespace MesPremiersJeux.Games
{
    /// <summary>Puzzle : une image cartoon à laquelle il manque un morceau ;
    /// l'enfant choisit la bonne pièce parmi trois.</summary>
    public sealed class PuzzleGame : GameControl
    {
        private const int Size = 400, Half = 200;

        private static readonly Color[] Bgs =
        {
            Color.FromRgb(0xC9, 0xE7, 0xFF), Color.FromRgb(0xFF, 0xE6, 0xB3), Color.FromRgb(0xD8, 0xC9, 0xFF),
            Color.FromRgb(0xC9, 0xF5, 0xD8), Color.FromRgb(0xFF, 0xD3, 0xE2),
        };

        public PuzzleGame(Action celebrate) : base(celebrate) { }

        private static RenderTargetBitmap RenderItem(CartoonItem item, Color bg)
        {
            var root = new Grid { Width = Size, Height = Size };
            root.Children.Add(new Border { Background = new SolidColorBrush(bg) });
            root.Children.Add(new Viewbox { Child = item.Build(), Margin = new Thickness(Size * 0.1) });
            root.Measure(new Size(Size, Size));
            root.Arrange(new Rect(0, 0, Size, Size));
            var rtb = new RenderTargetBitmap(Size, Size, 96, 96, PixelFormats.Pbgra32);
            rtb.Render(root);
            rtb.Freeze();
            return rtb;
        }

        private static Int32Rect QuadRect(int idx) => new Int32Rect((idx % 2) * Half, (idx / 2) * Half, Half, Half);

        protected override void NewRound()
        {
            Locked = false;
            var target = GameKit.Rand(CartoonArt.Items);
            var bg = Bgs[GameKit.RandInt(Bgs.Length)];
            var img = RenderItem(target, bg);
            int missing = GameKit.RandInt(4);
            Question.Text = "Complète l'image !";

            // Plateau 2x2 (une case vide = la pièce manquante).
            var board = new UniformGrid { Columns = 2, Width = Size, Height = Size };
            Border missingCell = null;
            ImageSource correctSrc = new CroppedBitmap(img, QuadRect(missing));
            for (int idx = 0; idx < 4; idx++)
            {
                var cell = new Border();
                if (idx == missing)
                {
                    missingCell = cell;
                    cell.Background = new SolidColorBrush(Color.FromArgb(0x3A, 0xB1, 0x88, 0xFF));
                    cell.BorderBrush = new SolidColorBrush(Color.FromRgb(0x7E, 0x3F, 0xF2));
                    cell.BorderThickness = new Thickness(4);
                    cell.Child = new TextBlock
                    {
                        Text = "?",
                        FontSize = 96,
                        FontWeight = FontWeights.Bold,
                        Foreground = new SolidColorBrush(Color.FromArgb(0x99, 0x7E, 0x3F, 0xF2)),
                        HorizontalAlignment = HorizontalAlignment.Center,
                        VerticalAlignment = VerticalAlignment.Center,
                    };
                }
                else
                {
                    cell.Child = new Image { Source = new CroppedBitmap(img, QuadRect(idx)), Stretch = Stretch.Fill };
                }
                board.Children.Add(cell);
            }
            var boardBorder = new Border
            {
                Width = Size,
                Height = Size,
                CornerRadius = new CornerRadius(14),
                ClipToBounds = true,
                BorderBrush = new SolidColorBrush(Color.FromRgb(0xE4, 0xCC, 0xF2)),
                BorderThickness = new Thickness(3),
                Child = board,
            };

            // Trois pièces candidates (même emplacement, images différentes).
            var others = GameKit.Shuffle(CartoonArt.Items.Where(i => i != target)).Take(2).ToList();
            var opts = new List<(ImageSource Src, bool Ok)> { (correctSrc, true) };
            foreach (var o in others)
                opts.Add((new CroppedBitmap(RenderItem(o, bg), QuadRect(missing)), false));
            opts = GameKit.Shuffle(opts);

            var row = Row();
            foreach (var opt in opts)
            {
                var btn = AnswerButton(new Image { Source = opt.Src, Stretch = Stretch.Uniform }, 180);
                bool ok = opt.Ok;
                btn.Click += (s, e) => Answer(ok, btn, missingCell, correctSrc);
                row.Children.Add(btn);
            }

            SetBody(boardBorder, row);
            Schedule(350, () => Speak("Complète l'image !"));
        }

        private void Answer(bool ok, Button btn, Border missingCell, ImageSource correctSrc)
        {
            if (Locked) return;
            if (ok)
            {
                Locked = true;
                missingCell.Background = null;
                missingCell.BorderThickness = new Thickness(0);
                missingCell.Child = new Image { Source = correctSrc, Stretch = Stretch.Fill };
                GameKit.Success();
                Celebrate();
                Speak($"Bravo ! {GameKit.Praise()}");
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
