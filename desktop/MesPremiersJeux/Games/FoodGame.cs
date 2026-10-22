using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Shapes;
using MesPremiersJeux.Lib;

namespace MesPremiersJeux.Games
{
    /// <summary>
    /// « Les bons plats » (PS/MS) : la pizza, la crêpe, les sushis… chaque
    /// pays a son plat préféré ! Les plats FUMENT (vapeur animée), se dandinent,
    /// et quand on trouve la bonne réponse, le plat vole dans une grande bouche
    /// qui le CROQUE — miam ! Trois actes : découverte à table, « qui mange la
    /// pizza ? » (choisir le drapeau), « qu'est-ce qu'on mange en France ? »
    /// (choisir le plat). L'erreur enseigne, tout est parlé, zéro lecture.
    /// </summary>
    public sealed class FoodGame : GameControl
    {
        private const double W = 1500, H = 680;

        private sealed class Dish
        {
            public string Emoji;
            public string Key;       // dessin : plat-<Key>.png (fourni)
            public string Name;      // « la pizza »
            public string Country;   // « l'Italie »
            public string In;        // « en Italie »
            public int Flag;
        }

        private static readonly Dish[] Dishes =
        {
            new Dish { Emoji = "🥞", Key = "crepe", Name = "la crêpe", Country = "la France", In = "en France", Flag = 0 },
            new Dish { Emoji = "🍕", Key = "pizza", Name = "la pizza", Country = "l'Italie", In = "en Italie", Flag = 2 },
            new Dish { Emoji = "🍣", Key = "sushi", Name = "les sushis", Country = "le Japon", In = "au Japon", Flag = 6 },
            new Dish { Emoji = "🥟", Key = "dim-sum", Name = "les petits raviolis", Country = "la Chine", In = "en Chine", Flag = 5 },
            new Dish { Emoji = "🍔", Key = "hamburger", Name = "le hamburger", Country = "l'Amérique", In = "en Amérique", Flag = 7 },
            new Dish { Emoji = "🍟", Key = "fish-and-chips", Name = "le poisson-frites", Country = "l'Angleterre", In = "en Angleterre", Flag = 1 },
            new Dish { Emoji = "🧆", Key = "falafel", Name = "les boulettes de falafel", Country = "l'Égypte", In = "en Égypte", Flag = 3 },
        };

        // « la crêpe, on LA mange » / « les sushis, on LES mange » / « le… LE ».
        private static string Pronoun(Dish d) =>
            d.Name.StartsWith("les ") ? "les" : d.Name.StartsWith("la ") ? "la" : "le";

        // Le dessin du plat (plat-<key>) sinon l'emoji.
        private static FrameworkElement DishVisual(Dish d, double size) =>
            Art.Visual("plat-" + d.Key, d.Emoji, size);

        private readonly Random _rng = new Random();
        private Canvas _canvas;
        private int _act;
        private int _round;
        private List<Dish> _order;
        private HashSet<string> _tasted;

        public FoodGame(Action celebrate) : base(celebrate) { }

        protected override void NewRound()
        {
            _act = 1;
            _round = 0;
            _order = Dishes.OrderBy(d => _rng.Next()).ToList();
            _tasted = new HashSet<string>();
            Next();
        }

        private void Next()
        {
            Locked = false;
            _round++;
            if (_act == 1 && _round > (Dishes.Length + 2) / 3) { _act = 2; _round = 1; } // tous goûtés
            else if (_act == 2 && _round > 3) { _act = 3; _round = 1; }
            else if (_act == 3 && _round > 3)
            {
                Question.Text = "🍽️ Quel festin !";
                Speak("Bravo, petit gourmand ! Bon appétit !");
                GameKit.Success();
                Celebrate();
                Schedule(3200, NewRound);
                return;
            }
            if (_act == 1) Taste();
            else Quiz();
        }

        private void Table()
        {
            _canvas = new Canvas { Width = W, Height = H };
            _canvas.Children.Add(new Rectangle
            {
                Width = W,
                Height = H,
                RadiusX = 26,
                RadiusY = 26,
                Fill = new LinearGradientBrush(Color.FromRgb(0xFF, 0xF2, 0xDC), Color.FromRgb(0xFF, 0xE2, 0xC8), 90),
            });
            // La nappe à carreaux (bandes croisées semi-transparentes).
            for (int i = 0; i < 10; i++)
            {
                var band = new Rectangle { Width = 60, Height = 300, Fill = new SolidColorBrush(Color.FromArgb(40, 0xE8, 0x3A, 0x3A)) };
                Canvas.SetLeft(band, i * 160);
                Canvas.SetTop(band, H - 300);
                _canvas.Children.Add(band);
            }
            for (int i = 0; i < 3; i++)
            {
                var band = new Rectangle { Width = W, Height = 40, Fill = new SolidColorBrush(Color.FromArgb(40, 0xE8, 0x3A, 0x3A)) };
                Canvas.SetLeft(band, 0);
                Canvas.SetTop(band, H - 260 + i * 100);
                _canvas.Children.Add(band);
            }
            AddDecor("👨‍🍳", W - 170, 20, 100);
        }

        // Un plat sur son assiette, qui FUME et se dandine.
        private Button DishButton(Dish d, double size)
        {
            var host = new Canvas { Width = size + 60, Height = size + 70 };
            var plate = new Ellipse { Width = size + 50, Height = 44, Fill = new SolidColorBrush(Color.FromRgb(0xEC, 0xEF, 0xF4)), Stroke = new SolidColorBrush(Color.FromRgb(0xB8, 0xC0, 0xD0)), StrokeThickness = 4 };
            Canvas.SetLeft(plate, 5);
            Canvas.SetTop(plate, size + 10);
            host.Children.Add(plate);
            var food = DishVisual(d, size * 1.25);
            food.RenderTransformOrigin = new Point(0.5, 1);
            var sway = new RotateTransform(0);
            food.RenderTransform = sway;
            Canvas.SetLeft(food, 30);
            Canvas.SetTop(food, 0);
            host.Children.Add(food);
            var rock = new DoubleAnimation(-5, 5, TimeSpan.FromSeconds(1.3 + _rng.NextDouble()))
            { AutoReverse = true, RepeatBehavior = RepeatBehavior.Forever, EasingFunction = new SineEase { EasingMode = EasingMode.EaseInOut } };
            sway.BeginAnimation(RotateTransform.AngleProperty, rock);

            // La vapeur : trois volutes qui montent en boucle.
            for (int i = 0; i < 3; i++)
            {
                var steam = new Ellipse { Width = 16, Height = 26, Fill = new SolidColorBrush(Color.FromArgb(120, 255, 255, 255)), Opacity = 0 };
                double sx = 25 + size / 2 + (i - 1) * 24;
                Canvas.SetLeft(steam, sx);
                Canvas.SetTop(steam, 10);
                host.Children.Add(steam);
                var tt = new TranslateTransform();
                steam.RenderTransform = tt;
                double dur = 1.6 + i * 0.3;
                var up = new DoubleAnimation(0, -70, TimeSpan.FromSeconds(dur))
                { RepeatBehavior = RepeatBehavior.Forever, BeginTime = TimeSpan.FromSeconds(i * 0.5) };
                var fade = new DoubleAnimationUsingKeyFrames { Duration = TimeSpan.FromSeconds(dur), RepeatBehavior = RepeatBehavior.Forever, BeginTime = TimeSpan.FromSeconds(i * 0.5) };
                fade.KeyFrames.Add(new LinearDoubleKeyFrame(0.9, KeyTime.FromPercent(0.2)));
                fade.KeyFrames.Add(new LinearDoubleKeyFrame(0, KeyTime.FromPercent(1)));
                tt.BeginAnimation(TranslateTransform.YProperty, up);
                steam.BeginAnimation(UIElement.OpacityProperty, fade);
            }

            var tpl = new ControlTemplate(typeof(Button));
            var border = new FrameworkElementFactory(typeof(Border));
            border.SetValue(Border.BackgroundProperty, Brushes.Transparent);
            var cp = new FrameworkElementFactory(typeof(ContentPresenter));
            cp.SetValue(FrameworkElement.HorizontalAlignmentProperty, HorizontalAlignment.Center);
            cp.SetValue(FrameworkElement.VerticalAlignmentProperty, VerticalAlignment.Center);
            border.AppendChild(cp);
            tpl.VisualTree = border;
            return new Button { Template = tpl, Width = size + 80, Height = size + 100, Focusable = false, Content = host };
        }

        // ------------------------------------------------------------------
        //  Acte 1 : à table ! On goûte tout.
        // ------------------------------------------------------------------
        private void Taste()
        {
            Question.Text = "🍽️ Les bons plats";
            SetConsigne(new TextBlock { Text = "😋🍽️" },
                () => "À table ! Regarde un plat : il te dit son nom et son pays ! Goûte-les tous !");

            Table();
            var trio = _order.Skip((_round - 1) * 3).Take(3).ToList();
            // Un tour incomplet (1 ou 2 plats) reste centré sur la table.
            double[] xs = trio.Count == 1 ? new double[] { 620 }
                        : trio.Count == 2 ? new double[] { 400, 840 }
                        : new double[] { 180, 620, 1060 };
            int eaten = 0;
            for (int i = 0; i < trio.Count; i++)
            {
                var d = trio[i];
                var btn = DishButton(d, 150);
                var captured = btn;
                btn.Click += (s, e) =>
                {
                    if (Locked) return;
                    if (_tasted.Add(d.Emoji))
                    {
                        eaten++;
                        var flag = FlagArt.Make(d.Flag, 130); // drapeau + nom du pays
                        Canvas.SetLeft(flag, Canvas.GetLeft(captured) + 50);
                        Canvas.SetTop(flag, Canvas.GetTop(captured) - 115);
                        flag.IsHitTestVisible = false;
                        _canvas.Children.Add(flag);
                    }
                    SoundFx.PopSound();
                    Speak("Miam, " + d.Name + " ! On " + Pronoun(d) + " mange " + d.In + " !");
                    if (eaten == trio.Count)
                    {
                        Locked = true;
                        Schedule(2800, Next);
                    }
                };
                Canvas.SetLeft(btn, xs[i]);
                Canvas.SetTop(btn, 180);
                _canvas.Children.Add(btn);
            }
            SetBody(_canvas);
            Speak(_round == 1
                ? "Les bons plats ! À table ! Regarde un plat pour le goûter et savoir d'où il vient !"
                : "Encore des bonnes choses ! Goûte-les toutes !");
        }

        // ------------------------------------------------------------------
        //  Actes 2 et 3 : les devinettes (+ la bouche qui croque)
        // ------------------------------------------------------------------
        private void Quiz()
        {
            var target = _order[(_round - 1) % _order.Count];
            var others = Dishes.Where(d => d != target).OrderBy(d => _rng.Next()).Take(2).ToList();
            var choices = others.Concat(new[] { target }).OrderBy(d => _rng.Next()).ToList();

            Table();
            if (_act == 2)
            {
                Question.Text = "🍕 Qui mange " + target.Name + " ?";
                SetConsigne(DishVisual(target, 110),
                    () => "Dans quel pays mange-t-on " + target.Name + " ? Trouve le bon drapeau !");
                // Le plat au centre-haut, fumant.
                var dish = DishButton(target, 140);
                dish.IsHitTestVisible = false;
                Canvas.SetLeft(dish, W / 2 - 110);
                Canvas.SetTop(dish, 10);
                _canvas.Children.Add(dish);

                double[] xs = { 190, 620, 1050 };
                for (int i = 0; i < 3; i++)
                {
                    var d = choices[i];
                    var btn = AnswerButton(FlagArt.Make(d.Flag, 230), 280);
                    var captured = btn;
                    btn.Click += (s, e) =>
                    {
                        if (Locked) return;
                        if (d == target) Win(target, Canvas.GetLeft(captured) + 140, Canvas.GetTop(captured));
                        else
                        {
                            Shake(captured);
                            Speak("Ça, c'est le drapeau de " + d.Country + " ! " + Cap(d.In) + ", on mange " + d.Name + " ! Cherche encore !");
                        }
                    };
                    Canvas.SetLeft(btn, xs[i]);
                    Canvas.SetTop(btn, 330);
                    _canvas.Children.Add(btn);
                }
                SetBody(_canvas);
                Speak("Miam, " + target.Name + " ! Trouve le drapeau du pays !");
            }
            else
            {
                Question.Text = "🍽️ Qu'est-ce qu'on mange " + target.In + " ?";
                SetConsigne(FlagArt.Make(target.Flag, 150),
                    () => "Qu'est-ce qu'on mange " + target.In + " ? Trouve le bon plat !");
                double[] xs = { 150, 590, 1030 };
                for (int i = 0; i < 3; i++)
                {
                    var d = choices[i];
                    var btn = DishButton(d, 160);
                    var captured = btn;
                    btn.Click += (s, e) =>
                    {
                        if (Locked) return;
                        if (d == target) Win(target, Canvas.GetLeft(captured) + 120, Canvas.GetTop(captured) + 40);
                        else
                        {
                            Shake(captured);
                            Speak("Ça, c'est " + d.Name + " ! On " + Pronoun(d) + " mange " + d.In + " ! Cherche encore !");
                        }
                    };
                    Canvas.SetLeft(btn, xs[i]);
                    Canvas.SetTop(btn, 220);
                    _canvas.Children.Add(btn);
                }
                SetBody(_canvas);
                Speak("Qu'est-ce qu'on mange " + target.In + " ? Trouve le bon plat !");
            }
        }

        // La victoire : le plat vole vers la grande bouche qui le CROQUE.
        private void Win(Dish d, double fromX, double fromY)
        {
            Locked = true;
            GameKit.Success();
            Speak("Oui ! " + Cap(d.Name) + ", " + d.In + " ! Miam miam miam !");

            var mouth = new TextBlock { Text = "😋", FontSize = 150, IsHitTestVisible = false, RenderTransformOrigin = new Point(0.5, 0.5) };
            var msc = new ScaleTransform(0.2, 0.2);
            mouth.RenderTransform = msc;
            Canvas.SetLeft(mouth, W / 2 - 85);
            Canvas.SetTop(mouth, 30);
            mouth.SetValue(Panel.ZIndexProperty, 80);
            _canvas.Children.Add(mouth);
            var grow = new DoubleAnimation(0.2, 1, TimeSpan.FromMilliseconds(380))
            { EasingFunction = new BackEase { EasingMode = EasingMode.EaseOut, Amplitude = 0.7 } };
            msc.BeginAnimation(ScaleTransform.ScaleXProperty, grow);
            msc.BeginAnimation(ScaleTransform.ScaleYProperty, grow);

            var flying = DishVisual(d, 120);
            flying.IsHitTestVisible = false;
            flying.RenderTransformOrigin = new Point(0.5, 0.5);
            var rot = new RotateTransform(0);
            flying.RenderTransform = rot;
            Canvas.SetLeft(flying, fromX);
            Canvas.SetTop(flying, fromY);
            flying.SetValue(Panel.ZIndexProperty, 81);
            _canvas.Children.Add(flying);
            Schedule(700, () =>
            {
                rot.BeginAnimation(RotateTransform.AngleProperty, new DoubleAnimation(0, 360, TimeSpan.FromMilliseconds(650)));
                var ax = new DoubleAnimation(fromX, W / 2 - 50, TimeSpan.FromMilliseconds(650)) { EasingFunction = new SineEase() };
                var ay = new DoubleAnimation(fromY, 70, TimeSpan.FromMilliseconds(650)) { EasingFunction = new SineEase { EasingMode = EasingMode.EaseIn } };
                ay.Completed += (s, e) =>
                {
                    _canvas.Children.Remove(flying);
                    SoundFx.Splat();
                    // La bouche croque (deux coups de mâchoire) + miettes.
                    var chomp = new DoubleAnimation(1, 1.25, TimeSpan.FromMilliseconds(150))
                    { AutoReverse = true, RepeatBehavior = new RepeatBehavior(2), EasingFunction = new SineEase() };
                    msc.BeginAnimation(ScaleTransform.ScaleXProperty, chomp);
                    msc.BeginAnimation(ScaleTransform.ScaleYProperty, chomp);
                    for (int i = 0; i < 6; i++)
                    {
                        var crumb = new Ellipse { Width = 10, Height = 10, Fill = new SolidColorBrush(Color.FromRgb(0xC8, 0x8A, 0x4A)), IsHitTestVisible = false };
                        Canvas.SetLeft(crumb, W / 2 - 20 + (i - 3) * 22);
                        Canvas.SetTop(crumb, 160);
                        _canvas.Children.Add(crumb);
                        var fall = new DoubleAnimation(160, 260 + (i % 3) * 30, TimeSpan.FromMilliseconds(600))
                        { EasingFunction = new SineEase { EasingMode = EasingMode.EaseIn } };
                        var fade = new DoubleAnimation(1, 0, TimeSpan.FromMilliseconds(600));
                        var captured = crumb;
                        fade.Completed += (s2, e2) => _canvas.Children.Remove(captured);
                        crumb.BeginAnimation(Canvas.TopProperty, fall);
                        crumb.BeginAnimation(UIElement.OpacityProperty, fade);
                    }
                    Celebrate();
                    Schedule(2400, Next);
                };
                flying.BeginAnimation(Canvas.LeftProperty, ax);
                flying.BeginAnimation(Canvas.TopProperty, ay);
            });
        }

        private void AddDecor(string emoji, double x, double y, double size)
        {
            var tb = new TextBlock { Text = emoji, FontSize = size, IsHitTestVisible = false };
            Canvas.SetLeft(tb, x);
            Canvas.SetTop(tb, y);
            _canvas.Children.Add(tb);
        }

        private static string Cap(string s) => char.ToUpperInvariant(s[0]) + s.Substring(1);
    }
}
