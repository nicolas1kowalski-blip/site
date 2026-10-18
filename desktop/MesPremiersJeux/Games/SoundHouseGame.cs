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
    /// « La maison des sons » (MS — phonologie, la fameuse « maison du son A »
    /// de l'école) : une grande maison colorée porte un son (AAA, OOO, III).
    /// Autour, des images : celles où l'on ENTEND le son vont dans la maison
    /// (elles y volent, la maison s'illumine) ; les autres font gentiment
    /// « non non » (« vélo ? On n'entend pas AAA dans vélo ! »). Le mot est
    /// toujours dit en ÉTIRANT le son (« chaaaat ! »). Zéro lecture.
    /// </summary>
    public sealed class SoundHouseGame : GameControl
    {
        private const double W = 1460, H = 660;

        private sealed class Round
        {
            public string Letter;        // « A »
            public string Sound;         // « aaa »
            public (string Emoji, string Word, string Stretched)[] Yes;
            public (string Emoji, string Word)[] No;
        }

        private static readonly Round[] Rounds =
        {
            new Round
            {
                Letter = "A", Sound = "aaa",
                Yes = new[] { ("🐱", "chat", "chaaaat"), ("🍌", "banane", "banaaaane"), ("🍍", "ananas", "anaaanaaas") },
                No = new[] { ("🚲", "vélo"), ("🐭", "souris"), ("🦉", "hibou") },
            },
            new Round
            {
                Letter = "O", Sound = "ooo",
                Yes = new[] { ("🏍️", "moto", "motooooo"), ("🤖", "robot", "robooooot"), ("🎂", "gâteau", "gâtoooooo") },
                No = new[] { ("🐱", "chat"), ("🍓", "fraise"), ("🐭", "souris") },
            },
            new Round
            {
                Letter = "I", Sound = "iii",
                Yes = new[] { ("🐭", "souris", "souriiiiis"), ("🥝", "kiwi", "kiwiiiii"), ("🐜", "fourmi", "fourmiiiii") },
                No = new[] { ("🐱", "chat"), ("🎂", "gâteau"), ("🚗", "voiture") },
            },
        };

        private readonly Random _rng = new Random();
        private Canvas _canvas;
        private int _roundIdx;
        private int _found;
        private Canvas _house;
        private TextBlock _houseLetter;

        public SoundHouseGame(Action celebrate) : base(celebrate) { }

        protected override void NewRound()
        {
            _roundIdx = 0;
            BuildRound();
        }

        private void BuildRound()
        {
            Locked = false;
            _found = 0;
            var r = Rounds[_roundIdx % Rounds.Length];

            Question.Text = "🏠 La maison du son " + r.Letter;
            SetConsigne(new TextBlock { Text = r.Letter, FontSize = 96, FontWeight = FontWeights.ExtraBold, Foreground = new SolidColorBrush(Color.FromRgb(0xA0, 0x6C, 0xD5)) },
                () => "C'est la maison du son " + r.Sound + " ! Trouve les images où tu ENTENDS " + r.Sound + " : elles entrent dans la maison !");

            _canvas = new Canvas { Width = W, Height = H };
            _canvas.Children.Add(new Rectangle
            {
                Width = W,
                Height = H,
                RadiusX = 26,
                RadiusY = 26,
                Fill = new LinearGradientBrush(Color.FromRgb(0xF1, 0xE6, 0xFF), Color.FromRgb(0xFF, 0xF2, 0xDC), 90),
            });
            AddDecor("🌈", 30, 20, 90);
            AddDecor("☁️", W - 200, 30, 70);

            BuildHouse(r);

            // Les 6 images autour de la maison (mélangées).
            var cards = new List<(string Emoji, string Word, string Stretched, bool Yes)>();
            foreach (var (e, w, st) in r.Yes) cards.Add((e, w, st, true));
            foreach (var (e, w) in r.No) cards.Add((e, w, null, false));
            cards = cards.OrderBy(c => _rng.Next()).ToList();

            double[] xs = { 90, 90, 340, 1080, 1250, 1250 };
            double[] ys = { 90, 360, 60, 60, 90, 360 };
            for (int i = 0; i < cards.Count; i++)
            {
                var c = cards[i];
                var btn = new Button
                {
                    Style = (Style)Application.Current.Resources["AnswerButton"],
                    Width = 170,
                    Height = 170,
                    RenderTransformOrigin = new Point(0.5, 0.5),
                    Content = new TextBlock { Text = c.Emoji, FontSize = 100 },
                };
                var captured = btn;
                btn.Click += (s, e) => Pick(r, c.Emoji, c.Word, c.Stretched, c.Yes, captured);
                Canvas.SetLeft(btn, xs[i]);
                Canvas.SetTop(btn, ys[i]);
                _canvas.Children.Add(btn);
            }

            SetBody(_canvas);
            Speech.SaySlow("La maison du son " + r.Sound + " ! " + r.Sound + " ! Trouve les images où tu entends " + r.Sound + " !");
        }

        // La grande maison colorée, avec sa lettre et sa porte ouverte.
        private void BuildHouse(Round r)
        {
            _house = new Canvas { Width = 380, Height = 400, RenderTransformOrigin = new Point(0.5, 1) };
            // Les murs.
            Add(_house, RectShape(Color.FromRgb(0xFF, 0xE2, 0x9A), 320, 230, 12), 30, 150);
            // Le toit.
            var roof = new Polygon
            {
                Points = new PointCollection { new Point(0, 160), new Point(190, 20), new Point(380, 160) },
                Fill = new SolidColorBrush(Color.FromRgb(0xE8, 0x5A, 0x6E)),
            };
            _house.Children.Add(roof);
            // La cheminée + fumée.
            Add(_house, RectShape(Color.FromRgb(0xC8, 0x6B, 0x3A), 40, 70, 6), 290, 55);
            var smoke = new TextBlock { Text = "💨", FontSize = 40, Opacity = 0.7 };
            Add(_house, smoke, 300, 5);
            var tt = new TranslateTransform();
            smoke.RenderTransform = tt;
            var drift = new DoubleAnimation(0, -24, TimeSpan.FromSeconds(2))
            { AutoReverse = true, RepeatBehavior = RepeatBehavior.Forever, EasingFunction = new SineEase { EasingMode = EasingMode.EaseInOut } };
            tt.BeginAnimation(TranslateTransform.YProperty, drift);
            // La porte grande ouverte.
            Add(_house, RectShape(Color.FromRgb(0x8A, 0x5A, 0x30), 110, 150, 10), 135, 230);
            Add(_house, RectShape(Color.FromRgb(0x5E, 0x3A, 0x1E), 90, 130, 8), 145, 250);
            // La LETTRE géante sur le toit, qui respire.
            _houseLetter = new TextBlock
            {
                Text = r.Letter,
                FontSize = 110,
                FontWeight = FontWeights.ExtraBold,
                Foreground = Brushes.White,
                RenderTransformOrigin = new Point(0.5, 0.5),
            };
            _houseLetter.RenderTransform = new ScaleTransform(1, 1);
            Add(_house, _houseLetter, 150, 30);
            var breathe = new DoubleAnimation(1, 1.12, TimeSpan.FromSeconds(1.4))
            { AutoReverse = true, RepeatBehavior = RepeatBehavior.Forever, EasingFunction = new SineEase { EasingMode = EasingMode.EaseInOut } };
            var sc = (ScaleTransform)_houseLetter.RenderTransform;
            sc.BeginAnimation(ScaleTransform.ScaleXProperty, breathe);
            sc.BeginAnimation(ScaleTransform.ScaleYProperty, breathe);
            // Les fenêtres.
            Add(_house, RectShape(Color.FromRgb(0xBF, 0xE3, 0xFF), 60, 60, 8), 60, 190);
            Add(_house, RectShape(Color.FromRgb(0xBF, 0xE3, 0xFF), 60, 60, 8), 265, 190);

            Canvas.SetLeft(_house, W / 2 - 190);
            Canvas.SetTop(_house, 120);
            _house.SetValue(Panel.ZIndexProperty, 30);
            _canvas.Children.Add(_house);

            // La maison fait entendre son son quand on la regarde.
            var hit = new Button
            {
                Background = Brushes.Transparent,
                BorderThickness = new Thickness(0),
                Opacity = 0,
                Width = 380,
                Height = 400,
            };
            hit.Click += (s, e) => { if (!Locked) Speech.SaySlow(r.Sound + " ! " + r.Sound + " !"); };
            Canvas.SetLeft(hit, W / 2 - 190);
            Canvas.SetTop(hit, 120);
            hit.SetValue(Panel.ZIndexProperty, 31);
            _canvas.Children.Add(hit);
        }

        private void Pick(Round r, string emoji, string word, string stretched, bool yes, Button btn)
        {
            if (Locked) return;
            if (!yes)
            {
                Shake(btn);
                Speech.SaySlow(Cap(word) + "... " + word + " ! Non, on n'entend pas " + r.Sound + " dans " + word + " ! Cherche encore !");
                return;
            }

            btn.IsHitTestVisible = false;
            Speech.SaySlow(Cap(stretched) + " ! Oui ! On entend " + r.Sound + " ! Dans la maison !");

            // L'image vole dans la porte de la maison.
            var flying = new TextBlock { Text = emoji, FontSize = 100, IsHitTestVisible = false, RenderTransformOrigin = new Point(0.5, 0.5) };
            double x0 = Canvas.GetLeft(btn) + 35, y0 = Canvas.GetTop(btn) + 25;
            double x1 = W / 2 - 40, y1 = 395;
            Canvas.SetLeft(flying, x0);
            Canvas.SetTop(flying, y0);
            flying.SetValue(Panel.ZIndexProperty, 60);
            _canvas.Children.Add(flying);
            btn.Visibility = Visibility.Hidden;

            var sc = new ScaleTransform(1, 1);
            flying.RenderTransform = sc;
            var ax = new DoubleAnimation(x0, x1, TimeSpan.FromMilliseconds(900)) { BeginTime = TimeSpan.FromMilliseconds(1400), EasingFunction = new SineEase() };
            var ay = new DoubleAnimationUsingKeyFrames { Duration = TimeSpan.FromMilliseconds(900), BeginTime = TimeSpan.FromMilliseconds(1400) };
            ay.KeyFrames.Add(new SplineDoubleKeyFrame(Math.Min(y0, y1) - 120, KeyTime.FromPercent(0.5), new KeySpline(0.2, 0.8, 0.4, 1)));
            ay.KeyFrames.Add(new SplineDoubleKeyFrame(y1, KeyTime.FromPercent(1), new KeySpline(0.5, 0, 0.8, 1)));
            var shrink = new DoubleAnimation(1, 0.35, TimeSpan.FromMilliseconds(350)) { BeginTime = TimeSpan.FromMilliseconds(1950) };
            ay.Completed += (s, e) =>
            {
                _canvas.Children.Remove(flying);
                SoundFx.PopSound();
                HouseJoy();
                _found++;
                if (_found < r.Yes.Length) return;

                Locked = true;
                Schedule(700, () =>
                {
                    GameKit.Success();
                    Speak("La maison du " + r.Sound + " est pleine ! Bravo !");
                    Celebrate();
                    _roundIdx++;
                    if (_roundIdx >= Rounds.Length)
                    {
                        Schedule(2600, () =>
                        {
                            Speak("Bravo ! Tu as rempli toutes les maisons des sons ! Quelles bonnes oreilles !");
                            Schedule(3000, NewRound);
                        });
                    }
                    else Schedule(2800, BuildRound);
                });
            };
            flying.BeginAnimation(Canvas.LeftProperty, ax);
            flying.BeginAnimation(Canvas.TopProperty, ay);
            sc.BeginAnimation(ScaleTransform.ScaleXProperty, shrink);
            sc.BeginAnimation(ScaleTransform.ScaleYProperty, shrink);
        }

        // La maison sautille de joie et des étoiles sortent de la cheminée.
        private void HouseJoy()
        {
            var sc = new ScaleTransform(1, 1);
            _house.RenderTransform = sc;
            var hop = new DoubleAnimation(1, 1.06, TimeSpan.FromMilliseconds(180))
            { AutoReverse = true, EasingFunction = new SineEase() };
            sc.BeginAnimation(ScaleTransform.ScaleXProperty, hop);
            sc.BeginAnimation(ScaleTransform.ScaleYProperty, hop);
            for (int i = 0; i < 4; i++)
            {
                var star = new TextBlock { Text = "✨", FontSize = 30, IsHitTestVisible = false };
                Canvas.SetLeft(star, W / 2 + 100 + _rng.Next(60));
                Canvas.SetTop(star, 160);
                star.SetValue(Panel.ZIndexProperty, 65);
                _canvas.Children.Add(star);
                var up = new DoubleAnimation(160, 60 - i * 16, TimeSpan.FromMilliseconds(900))
                { BeginTime = TimeSpan.FromMilliseconds(i * 120), EasingFunction = new SineEase { EasingMode = EasingMode.EaseOut } };
                var fade = new DoubleAnimation(1, 0, TimeSpan.FromMilliseconds(900)) { BeginTime = TimeSpan.FromMilliseconds(i * 120) };
                var captured = star;
                fade.Completed += (s, e) => _canvas.Children.Remove(captured);
                star.BeginAnimation(Canvas.TopProperty, up);
                star.BeginAnimation(OpacityProperty, fade);
            }
        }

        private static Rectangle RectShape(Color c, double w, double h, double r) =>
            new Rectangle { Width = w, Height = h, RadiusX = r, RadiusY = r, Fill = new SolidColorBrush(c) };

        private static void Add(Canvas c, FrameworkElement el, double x, double y)
        {
            Canvas.SetLeft(el, x);
            Canvas.SetTop(el, y);
            c.Children.Add(el);
        }

        private void AddDecor(string emoji, double x, double y, double size)
        {
            var t = new TextBlock { Text = emoji, FontSize = size, IsHitTestVisible = false };
            Canvas.SetLeft(t, x);
            Canvas.SetTop(t, y);
            _canvas.Children.Add(t);
        }

        private static string Cap(string s) => char.ToUpperInvariant(s[0]) + s.Substring(1);
    }
}
