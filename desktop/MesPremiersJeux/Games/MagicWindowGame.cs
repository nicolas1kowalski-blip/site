using System;
using System.Collections.Generic;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Shapes;
using MesPremiersJeux.Lib;

namespace MesPremiersJeux.Games
{
    /// <summary>
    /// « La fenêtre magique » (inspiré de Look to Learn) : une surprise se cache
    /// derrière une fenêtre couverte de buée. Chaque carreau regardé s'efface
    /// dans un petit nuage (et entraîne ses voisins) — le regard « essuie » la
    /// vitre et révèle l'image petit à petit. Découverte pure, aucun échec.
    /// </summary>
    public sealed class MagicWindowGame : GameControl
    {
        private const double W = 1400, H = 720;
        private const int Cols = 6, Rows = 4;

        private static readonly (string Emoji, string Name)[] Surprises =
        {
            ("🦁", "un lion"), ("🦄", "une licorne"), ("🚀", "une fusée"),
            ("🏰", "un château"), ("🐳", "une baleine"), ("🚜", "un tracteur"),
            ("🌈", "un arc-en-ciel"), ("🦖", "un dinosaure"), ("🎂", "un gâteau"),
            ("🐘", "un éléphant"), ("⛵", "un bateau"), ("🎠", "un manège"),
        };

        private readonly Random _rng = new Random();
        private Canvas _canvas;
        private Button[,] _panes;
        private int _remaining;
        private (string Emoji, string Name) _hidden;
        private FrameworkElement _picture;

        public MagicWindowGame(Action celebrate) : base(celebrate) { }

        protected override void NewRound()
        {
            Locked = false;
            int si = _rng.Next(Surprises.Length);
            _hidden = Surprises[si];
            Question.Text = "🧽 La fenêtre magique";
            SetConsigne(new TextBlock { Text = "👀🧽" },
                () => "Quelque chose se cache derrière la buée ! Essuie la fenêtre avec tes yeux !");

            _canvas = new Canvas { Width = W, Height = H };

            // Le cadre de la fenêtre et l'image cachée derrière.
            _canvas.Children.Add(new Rectangle
            {
                Width = W,
                Height = H,
                RadiusX = 26,
                RadiusY = 26,
                Fill = new LinearGradientBrush(Color.FromRgb(0xFF, 0xF6, 0xDE), Color.FromRgb(0xFF, 0xE9, 0xC8), 90),
                Stroke = new SolidColorBrush(Color.FromRgb(0xB8, 0x8A, 0x5A)),
                StrokeThickness = 10,
            });
            // La surprise, par priorité : image du parent (surprise-N.png) →
            // dessin vectoriel intégré (SurpriseArt).
            var img = Art.Find("surprise-" + (si + 1));
            _picture = img != null
                ? new System.Windows.Controls.Image { Source = img, Width = 460, Height = 460, Stretch = Stretch.Uniform }
                : SurpriseArt.Make(si, 460);
            _picture.IsHitTestVisible = false;
            _picture.RenderTransformOrigin = new Point(0.5, 0.5);
            _picture.RenderTransform = new ScaleTransform(1, 1);
            Canvas.SetLeft(_picture, W / 2 - 230);
            Canvas.SetTop(_picture, H / 2 - 240);
            _canvas.Children.Add(_picture);
            AddDecor("✨", 150, 90, 54);
            AddDecor("✨", W - 200, H - 160, 54);

            // Les carreaux de buée.
            _panes = new Button[Rows, Cols];
            _remaining = Rows * Cols;
            double cw = (W - 24) / Cols, ch = (H - 24) / Rows;
            for (int r = 0; r < Rows; r++)
                for (int c = 0; c < Cols; c++)
                {
                    var pane = new Button
                    {
                        Style = (Style)Application.Current.Resources["AnswerButton"],
                        Width = cw - 6,
                        Height = ch - 6,
                        Opacity = 0.97,
                        RenderTransformOrigin = new Point(0.5, 0.5),
                        Content = new TextBlock
                        {
                            Text = "☁️",
                            FontSize = 46,
                            Opacity = 0.55,
                            HorizontalAlignment = HorizontalAlignment.Center,
                            VerticalAlignment = VerticalAlignment.Center,
                        },
                    };
                    int rr = r, cc = c;
                    pane.Click += (s, e) => Wipe(rr, cc);
                    Canvas.SetLeft(pane, 12 + c * cw + 3);
                    Canvas.SetTop(pane, 12 + r * ch + 3);
                    pane.SetValue(Panel.ZIndexProperty, 40);
                    _panes[r, c] = pane;
                    _canvas.Children.Add(pane);
                }

            SetBody(_canvas);
            Speak("La fenêtre magique ! Qu'est-ce qui se cache derrière la buée ? Essuie avec tes yeux !");
        }

        // Essuie le carreau regardé ET ses voisins : chaque regard dégage une
        // belle zone, la surprise apparaît en quelques regards.
        private void Wipe(int r, int c)
        {
            if (Locked) return;
            SoundFx.Puff();
            ClearPane(r, c, 0);
            ClearPane(r - 1, c, 90);
            ClearPane(r + 1, c, 90);
            ClearPane(r, c - 1, 90);
            ClearPane(r, c + 1, 90);
        }

        private void ClearPane(int r, int c, int delay)
        {
            if (r < 0 || r >= Rows || c < 0 || c >= Cols) return;
            var pane = _panes[r, c];
            if (pane == null) return;
            _panes[r, c] = null;
            _remaining--;
            pane.IsHitTestVisible = false;

            // Le carreau s'évapore : il gonfle en nuage et disparaît.
            var sc = new ScaleTransform(1, 1);
            pane.RenderTransform = sc;
            var grow = new DoubleAnimation(1, 1.5, TimeSpan.FromMilliseconds(420))
            { BeginTime = TimeSpan.FromMilliseconds(delay), EasingFunction = new SineEase { EasingMode = EasingMode.EaseOut } };
            var fade = new DoubleAnimation(pane.Opacity, 0, TimeSpan.FromMilliseconds(420))
            { BeginTime = TimeSpan.FromMilliseconds(delay) };
            var captured = pane;
            fade.Completed += (s, e) =>
            {
                _canvas.Children.Remove(captured);
                if (_remaining == 0) Reveal();
            };
            sc.BeginAnimation(ScaleTransform.ScaleXProperty, grow);
            sc.BeginAnimation(ScaleTransform.ScaleYProperty, grow);
            pane.BeginAnimation(OpacityProperty, fade);
        }

        private void Reveal()
        {
            if (Locked) return;
            Locked = true;

            // La surprise bondit de joie.
            var sc = (ScaleTransform)_picture.RenderTransform;
            var pop = new DoubleAnimation(1, 1.22, TimeSpan.FromMilliseconds(520))
            { AutoReverse = true, EasingFunction = new BackEase { EasingMode = EasingMode.EaseOut, Amplitude = 0.7 } };
            sc.BeginAnimation(ScaleTransform.ScaleXProperty, pop);
            sc.BeginAnimation(ScaleTransform.ScaleYProperty, pop);

            SoundFx.PopSound();
            Speak("C'était... " + _hidden.Name + " ! Bravo !");
            GameKit.Success();
            Celebrate();
            Schedule(3200, NewRound);
        }

        private void AddDecor(string emoji, double x, double y, double size)
        {
            var t = new TextBlock { Text = emoji, FontSize = size, IsHitTestVisible = false };
            Canvas.SetLeft(t, x);
            Canvas.SetTop(t, y);
            _canvas.Children.Add(t);
        }
    }
}
