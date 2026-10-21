using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Shapes;
using MesPremiersJeux.Lib;

namespace MesPremiersJeux.Games
{
    /// <summary>
    /// « Reproduis le modèle » (MS — maths : reproduction de pavage avec
    /// modèle, discriminer visuellement et reconstituer à l'identique, droit
    /// du programme) : un MODÈLE coloré à gauche, une grille vide à droite.
    /// Les cases se remplissent UNE PAR UNE : la case en cours clignote, et
    /// l'enfant choisit la bonne couleur (ou la bonne forme) parmi trois gros
    /// boutons. L'erreur guide : la case du modèle correspondante clignote.
    /// </summary>
    public sealed class ModelCopyGame : GameControl
    {
        private const double W = 1460, H = 640;

        private static readonly (Color C, string Name)[] Palette =
        {
            (Color.FromRgb(0xE8, 0x3A, 0x3A), "rouge"),
            (Color.FromRgb(0x3B, 0x9B, 0xFF), "bleu"),
            (Color.FromRgb(0xFF, 0xC1, 0x07), "jaune"),
            (Color.FromRgb(0x6B, 0xCB, 0x77), "vert"),
        };

        private static readonly (string Glyph, string Name)[] Shapes =
        {
            ("●", "le rond"), ("▲", "le triangle"), ("■", "le carré"),
        };

        private readonly Random _rng = new Random();
        private Canvas _canvas;
        private int _act;      // 1 : 2×2 couleurs · 2 : formes · 3 : 3×3 couleurs
        private int _round;
        private int[] _model;          // indices couleur (ou forme)
        private int _cursor;           // la case en cours
        private int _cols, _rows;
        private bool _shapeMode;
        private Border[] _modelCells;
        private Border[] _copyCells;

        public ModelCopyGame(Action celebrate) : base(celebrate) { }

        protected override void NewRound()
        {
            _act = 1;
            _round = 0;
            Next();
        }

        private void Next()
        {
            Locked = false;
            _round++;
            if (_act == 1 && _round > 2) { _act = 2; _round = 1; }
            else if (_act == 2 && _round > 2) { _act = 3; _round = 1; }
            else if (_act == 3 && _round > 2)
            {
                Question.Text = "🧩 Les yeux de lynx !";
                Speak("Bravo ! Quels yeux de lynx !");
                GameKit.Success();
                Celebrate();
                Schedule(3200, NewRound);
                return;
            }

            _shapeMode = _act == 2;
            _cols = _act == 3 ? 3 : 2;
            _rows = _act == 3 ? 3 : 2;
            int cells = _cols * _rows;
            int kinds = _shapeMode ? Shapes.Length : 3;
            _model = new int[cells];
            for (int i = 0; i < cells; i++) _model[i] = _rng.Next(kinds);
            _cursor = 0;

            Question.Text = "🧩 Reproduis le modèle !";
            SetConsigne(new TextBlock { Text = "👀🧩" },
                () => "Regarde bien le MODÈLE ! La case qui clignote attend " +
                      (_shapeMode ? "sa forme" : "sa couleur") + " : choisis la bonne en bas !");

            _canvas = new Canvas { Width = W, Height = H };
            _canvas.Children.Add(new Rectangle
            {
                Width = W,
                Height = H,
                RadiusX = 26,
                RadiusY = 26,
                Fill = new LinearGradientBrush(Color.FromRgb(0xE8, 0xF0, 0xFF), Color.FromRgb(0xFF, 0xF6, 0xDE), 90),
            });

            // Le modèle (à gauche, dans un cadre doré) et la copie (à droite).
            _modelCells = BuildGrid(190, 60, isModel: true);
            _copyCells = BuildGrid(820, 60, isModel: false);
            AddLabelDecor("👀", 190 + GridWidth() / 2 - 30, 8);
            AddLabelDecor("✏️", 820 + GridWidth() / 2 - 30, 8);
            // La flèche entre les deux.
            AddLabelDecor("➡️", W / 2 - 40, 150);

            // Les boutons de réponse (couleurs ou formes).
            BuildChoices();

            SetBody(_canvas);
            HighlightCursor();
            Speak(_round == 1 && _act == 1
                ? "Reproduis le modèle ! Regarde la grille modèle... et remplis l'autre pareil, case par case !"
                : _shapeMode && _round == 1
                    ? "Maintenant avec des FORMES ! Regarde bien le modèle !"
                    : "Un nouveau modèle ! Regarde bien !");
        }

        private double CellSize() => _cols == 3 ? 110 : 150;
        private double GridWidth() => _cols * (CellSize() + 10);

        private Border[] BuildGrid(double x0, double y0, bool isModel)
        {
            var cells = new Border[_model.Length];
            double size = CellSize();
            var frame = new Border
            {
                Background = Brushes.White,
                CornerRadius = new CornerRadius(18),
                BorderBrush = new SolidColorBrush(isModel ? Color.FromRgb(0xFF, 0xC1, 0x07) : Color.FromRgb(0xB8, 0xB0, 0xC8)),
                BorderThickness = new Thickness(6),
                Padding = new Thickness(10),
            };
            var grid = new UniformGrid { Columns = _cols, Rows = _rows };
            for (int i = 0; i < _model.Length; i++)
            {
                var cell = new Border
                {
                    Width = size,
                    Height = size,
                    Margin = new Thickness(5),
                    CornerRadius = new CornerRadius(12),
                    Background = new SolidColorBrush(Color.FromRgb(0xEE, 0xEE, 0xF4)),
                    RenderTransformOrigin = new Point(0.5, 0.5),
                };
                cell.RenderTransform = new ScaleTransform(1, 1);
                if (isModel) Fill(cell, _model[i]);
                grid.Children.Add(cell);
                cells[i] = cell;
            }
            frame.Child = grid;
            Canvas.SetLeft(frame, x0);
            Canvas.SetTop(frame, y0);
            _canvas.Children.Add(frame);
            return cells;
        }

        private void Fill(Border cell, int kind)
        {
            if (_shapeMode)
            {
                cell.Background = Brushes.White;
                cell.Child = new TextBlock
                {
                    Text = Shapes[kind].Glyph,
                    FontSize = CellSize() * 0.62,
                    Foreground = new SolidColorBrush(Palette[kind].C),
                    HorizontalAlignment = HorizontalAlignment.Center,
                    VerticalAlignment = VerticalAlignment.Center,
                };
            }
            else
            {
                cell.Background = new SolidColorBrush(Palette[kind].C);
            }
        }

        private void BuildChoices()
        {
            int kinds = _shapeMode ? Shapes.Length : 3;
            double bw = 170, gap = 50;
            double x0 = (W - kinds * bw - (kinds - 1) * gap) / 2;
            for (int k = 0; k < kinds; k++)
            {
                int kk = k;
                UIElement content = _shapeMode
                    ? new TextBlock { Text = Shapes[k].Glyph, FontSize = 92, Foreground = new SolidColorBrush(Palette[k].C) }
                    : (UIElement)new Ellipse { Width = 110, Height = 110, Fill = new SolidColorBrush(Palette[k].C) };
                var btn = new Button
                {
                    Style = (Style)Application.Current.Resources["AnswerButton"],
                    Width = bw,
                    Height = 150,
                    Content = content,
                };
                var captured = btn;
                btn.Click += (s, e) => Choose(kk, captured);
                Canvas.SetLeft(btn, x0 + k * (bw + gap));
                Canvas.SetTop(btn, H - 180);
                _canvas.Children.Add(btn);
            }
        }

        // La case en cours clignote doucement pour appeler sa couleur.
        private void HighlightCursor()
        {
            if (_cursor >= _copyCells.Length) return;
            var cell = _copyCells[_cursor];
            var blink = new DoubleAnimation(1, 0.35, TimeSpan.FromMilliseconds(500))
            { AutoReverse = true, RepeatBehavior = RepeatBehavior.Forever };
            cell.BeginAnimation(UIElement.OpacityProperty, blink);
            cell.BorderBrush = new SolidColorBrush(Color.FromRgb(0xE8, 0x5A, 0x2C));
            cell.BorderThickness = new Thickness(5);
        }

        private void UnhighlightCursor()
        {
            if (_cursor >= _copyCells.Length) return;
            var cell = _copyCells[_cursor];
            cell.BeginAnimation(UIElement.OpacityProperty, null);
            cell.Opacity = 1;
            cell.BorderThickness = new Thickness(0);
        }

        private void Choose(int kind, Button btn)
        {
            if (Locked || _cursor >= _model.Length) return;
            int want = _model[_cursor];
            if (kind != want)
            {
                Shake(btn);
                // Le modèle montre la bonne case en clignotant.
                var modelCell = _modelCells[_cursor];
                var sc = (ScaleTransform)modelCell.RenderTransform;
                var pulse = new DoubleAnimation(1, 1.25, TimeSpan.FromMilliseconds(320))
                { AutoReverse = true, RepeatBehavior = new RepeatBehavior(3) };
                sc.BeginAnimation(ScaleTransform.ScaleXProperty, pulse);
                sc.BeginAnimation(ScaleTransform.ScaleYProperty, pulse);
                Speak("Regarde bien le modèle : cette case-là est " +
                      (_shapeMode ? Shapes[want].Name : Palette[want].Name) + " !");
                return;
            }

            UnhighlightCursor();
            Fill(_copyCells[_cursor], kind);
            SoundFx.Note(_cursor);
            var csc = (ScaleTransform)_copyCells[_cursor].RenderTransform;
            var pop = new DoubleAnimation(0.4, 1, TimeSpan.FromMilliseconds(320))
            { EasingFunction = new BackEase { EasingMode = EasingMode.EaseOut, Amplitude = 0.7 } };
            csc.BeginAnimation(ScaleTransform.ScaleXProperty, pop);
            csc.BeginAnimation(ScaleTransform.ScaleYProperty, pop);

            _cursor++;
            if (_cursor < _model.Length)
            {
                HighlightCursor();
                return;
            }

            // Grille terminée : les deux grilles se font un high-five visuel.
            Locked = true;
            GameKit.Success();
            Speak("Pareil que le modèle ! C'est exactement ça ! Bravo !");
            for (int i = 0; i < _copyCells.Length; i++)
            {
                var cell = _copyCells[i];
                var sc2 = (ScaleTransform)cell.RenderTransform;
                var wave = new DoubleAnimation(1, 1.18, TimeSpan.FromMilliseconds(220))
                { AutoReverse = true, BeginTime = TimeSpan.FromMilliseconds(i * 110), EasingFunction = new SineEase() };
                sc2.BeginAnimation(ScaleTransform.ScaleXProperty, wave);
                sc2.BeginAnimation(ScaleTransform.ScaleYProperty, wave);
            }
            Celebrate();
            Schedule(2800, Next);
        }

        private void AddLabelDecor(string emoji, double x, double y)
        {
            var t = new TextBlock { Text = emoji, FontSize = 48, IsHitTestVisible = false };
            Canvas.SetLeft(t, x);
            Canvas.SetTop(t, y);
            _canvas.Children.Add(t);
        }
    }
}
