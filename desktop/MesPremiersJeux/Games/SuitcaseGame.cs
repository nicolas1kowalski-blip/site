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
    /// « La valise du voyageur » (PS/MS) : on part en voyage ! Selon la MÉTÉO
    /// du pays (neige qui tombe ❄, pluie qui ruisselle 💧, grand soleil ☀ —
    /// animées à l'écran), l'enfant choisit les bons habits et les met dans la
    /// valise (ils y volent en cloche, la valise rebondit). Les mauvais choix
    /// font rire : « le maillot de bain en Russie ? On va geler ! » Zéro
    /// lecture, tout est parlé.
    /// </summary>
    public sealed class SuitcaseGame : GameControl
    {
        private const double W = 1500, H = 700;

        private sealed class Trip
        {
            public string Country;    // « la Russie »
            public int Flag;          // FlagArt
            public string Weather;    // neige | pluie | soleil
            public string Why;        // « il fait très froid »
            public (string Emoji, string Name)[] Good;
            public (string Emoji, string Name, string Joke)[] Bad;
        }

        private static readonly Trip[] Trips =
        {
            new Trip
            {
                Country = "la Russie", Flag = 4, Weather = "neige", Why = "il fait très très froid, il neige",
                Good = new[] { ("🧣", "l'écharpe"), ("🧤", "les moufles"), ("🧥", "le gros manteau") },
                Bad = new[]
                {
                    ("maillot-de-bain|🩳", "le maillot de bain", "Le maillot de bain dans la neige ? Brrr, on va geler ! Hi hi !"),
                    ("🕶️", "les lunettes de soleil", "Des lunettes de soleil ? Mais il neige ! Hi hi !"),
                    ("🩴", "les tongs", "Des tongs dans la neige ? Les pieds vont devenir tout bleus ! Hi hi !"),
                },
            },
            new Trip
            {
                Country = "l'Égypte", Flag = 3, Weather = "soleil", Why = "il fait très très chaud, le soleil tape fort",
                Good = new[] { ("🧢", "la casquette"), ("🕶️", "les lunettes de soleil"), ("👕", "le tee-shirt") },
                Bad = new[]
                {
                    ("🧣", "l'écharpe", "Une écharpe en plein désert ? On va cuire ! Hi hi !"),
                    ("🧤", "les moufles", "Des moufles au soleil ? Les mains vont fondre ! Hi hi !"),
                    ("🧥", "le gros manteau", "Le gros manteau sous le grand soleil ? Quelle idée ! Hi hi !"),
                },
            },
            new Trip
            {
                Country = "l'Angleterre", Flag = 1, Weather = "pluie", Why = "il pleut beaucoup",
                Good = new[] { ("☂️", "le parapluie"), ("👢", "les bottes"), ("impermeable|🧥", "l'imperméable") },
                Bad = new[]
                {
                    ("maillot-de-bain|🩳", "le maillot de bain", "Le maillot sous la pluie ? Brrr ! Hi hi !"),
                    ("🕶️", "les lunettes de soleil", "Des lunettes de soleil sous les nuages gris ? Hi hi !"),
                    ("👒", "le chapeau de paille", "Le chapeau de paille va être tout mouillé ! Hi hi !"),
                },
            },
        };

        private readonly Random _rng = new Random();
        private Canvas _canvas;
        private int _tripIdx;
        private int _packed;
        private Canvas _case;
        private RotateTransform _lid;

        public SuitcaseGame(Action celebrate) : base(celebrate) { }

        protected override void NewRound()
        {
            _tripIdx = 0;
            BuildTrip();
        }

        private void BuildTrip()
        {
            Locked = false;
            _packed = 0;
            var t = Trips[_tripIdx % Trips.Length];

            Question.Text = "🧳 La valise du voyageur";
            SetConsigne(FlagArt.Make(t.Flag, 140),
                () => "On part " + Dest(t) + " ! Là-bas, " + t.Why + " ! Mets les BONS habits dans la valise !");

            _canvas = new Canvas { Width = W, Height = H };
            BuildWeather(t.Weather);

            // La valise, dessinée, au centre-bas — couvercle qui s'ouvre.
            BuildSuitcase();

            // Les 6 habits en cercle autour (boutons invisibles : pas de cartes).
            var items = new List<(string Emoji, string Name, string Joke, bool Good)>();
            foreach (var (e, n) in t.Good) items.Add((e, n, null, true));
            foreach (var (e, n, j) in t.Bad) items.Add((e, n, j, false));
            items = items.OrderBy(i => _rng.Next()).ToList();

            double[] xs = { 120, 120, 420, 1010, 1290, 1290 };
            double[] ys = { 130, 400, 60, 60, 130, 400 };
            for (int i = 0; i < items.Count; i++)
            {
                var it = items[i];
                var btn = SceneButton(Art.ForEmoji(it.Emoji, 135), 190, 190);
                var captured = btn;
                btn.Click += (s, e) => PickItem(t, it.Emoji, it.Name, it.Joke, it.Good, captured);
                Canvas.SetLeft(btn, xs[i]);
                Canvas.SetTop(btn, ys[i]);
                _canvas.Children.Add(btn);
                // Chaque habit se dandine doucement.
                var sway = new RotateTransform(0);
                btn.RenderTransformOrigin = new Point(0.5, 0.5);
                btn.RenderTransform = sway;
                var rock = new DoubleAnimation(-6, 6, TimeSpan.FromSeconds(1.4 + i * 0.2))
                { AutoReverse = true, RepeatBehavior = RepeatBehavior.Forever, BeginTime = TimeSpan.FromMilliseconds(i * 220), EasingFunction = new SineEase { EasingMode = EasingMode.EaseInOut } };
                sway.BeginAnimation(RotateTransform.AngleProperty, rock);
            }

            SetBody(_canvas);
            Speak("La valise du voyageur ! On part " + Dest(t) + " ! Là-bas, " + t.Why +
                  " ! Regarde les bons habits pour les mettre dans la valise !");
        }

        private static string Dest(Trip t) => "en " + t.Country.Replace("la ", "").Replace("l'", "");

        // ------------------------------------------------------------------
        //  La météo ANIMÉE : neige, pluie ou grand soleil.
        // ------------------------------------------------------------------
        private void BuildWeather(string weather)
        {
            Color top = weather == "soleil" ? Color.FromRgb(0xBF, 0xE3, 0xFF)
                      : weather == "pluie" ? Color.FromRgb(0x9A, 0xA8, 0xC0)
                      : Color.FromRgb(0xC8, 0xD8, 0xF2);
            Color bottom = weather == "soleil" ? Color.FromRgb(0xFF, 0xF2, 0xC4)
                        : weather == "pluie" ? Color.FromRgb(0xC8, 0xD2, 0xE0)
                        : Color.FromRgb(0xEE, 0xF4, 0xFF);
            _canvas.Children.Add(new Rectangle
            {
                Width = W,
                Height = H,
                RadiusX = 26,
                RadiusY = 26,
                Fill = new LinearGradientBrush(top, bottom, 90),
            });

            if (weather == "soleil")
            {
                var halo = new Ellipse
                {
                    Width = 260,
                    Height = 260,
                    Fill = new RadialGradientBrush(Color.FromArgb(120, 255, 220, 100), Colors.Transparent),
                    RenderTransformOrigin = new Point(0.5, 0.5),
                };
                var hsc = new ScaleTransform(1, 1);
                halo.RenderTransform = hsc;
                Canvas.SetLeft(halo, W - 300);
                Canvas.SetTop(halo, -40);
                _canvas.Children.Add(halo);
                var pulse = new DoubleAnimation(1, 1.35, TimeSpan.FromSeconds(1.8))
                { AutoReverse = true, RepeatBehavior = RepeatBehavior.Forever, EasingFunction = new SineEase { EasingMode = EasingMode.EaseInOut } };
                hsc.BeginAnimation(ScaleTransform.ScaleXProperty, pulse);
                hsc.BeginAnimation(ScaleTransform.ScaleYProperty, pulse);
                var sun = new TextBlock { Text = "☀️", FontSize = 110, IsHitTestVisible = false };
                Canvas.SetLeft(sun, W - 240);
                Canvas.SetTop(sun, 15);
                _canvas.Children.Add(sun);
                AddDecor("🌴", 40, H - 180, 110);
                AddDecor("🐫", W - 250, H - 150, 80);
            }
            else
            {
                // Nuages + flocons ou gouttes qui TOMBENT en boucle.
                AddDecor("☁️", 180, 10, 90);
                AddDecor("☁️", 650, -5, 110);
                AddDecor("☁️", 1120, 12, 95);
                string drop = weather == "neige" ? "❄️" : "💧";
                for (int i = 0; i < 14; i++)
                {
                    var f = new TextBlock
                    {
                        Text = drop,
                        FontSize = weather == "neige" ? 22 + _rng.Next(16) : 18 + _rng.Next(10),
                        IsHitTestVisible = false,
                        Opacity = 0.85,
                    };
                    double x = 40 + _rng.NextDouble() * (W - 100);
                    Canvas.SetLeft(f, x);
                    Canvas.SetTop(f, -40);
                    _canvas.Children.Add(f);
                    double dur = weather == "neige" ? 4.5 + _rng.NextDouble() * 3 : 1.3 + _rng.NextDouble() * 0.8;
                    var fall = new DoubleAnimation(-40, H + 20, TimeSpan.FromSeconds(dur))
                    { RepeatBehavior = RepeatBehavior.Forever, BeginTime = TimeSpan.FromSeconds(_rng.NextDouble() * dur) };
                    f.BeginAnimation(Canvas.TopProperty, fall);
                    if (weather == "neige")
                    {
                        var tt = new TranslateTransform();
                        f.RenderTransform = tt;
                        var swayF = new DoubleAnimation(-30, 30, TimeSpan.FromSeconds(1.8 + _rng.NextDouble()))
                        { AutoReverse = true, RepeatBehavior = RepeatBehavior.Forever, EasingFunction = new SineEase { EasingMode = EasingMode.EaseInOut } };
                        tt.BeginAnimation(TranslateTransform.XProperty, swayF);
                    }
                }
                if (weather == "neige") { AddDecor("⛄", 60, H - 170, 100); AddDecor("🏔️", W - 230, H - 190, 120); }
                else { AddDecor("💂", W - 180, H - 190, 100); AddDecor("🏰", 50, H - 190, 110); }
            }
        }

        // ------------------------------------------------------------------
        //  La valise vectorielle (couvercle animé) et le rangement.
        // ------------------------------------------------------------------
        private void BuildSuitcase()
        {
            _case = new Canvas { Width = 360, Height = 260, RenderTransformOrigin = new Point(0.5, 1) };
            var brown = Color.FromRgb(0xB5, 0x7A, 0x45);
            var dark = Color.FromRgb(0x8A, 0x5A, 0x30);
            // Le corps.
            var body = new Rectangle { Width = 340, Height = 150, RadiusX = 20, RadiusY = 20, Fill = new SolidColorBrush(brown), Stroke = new SolidColorBrush(dark), StrokeThickness = 6 };
            Canvas.SetLeft(body, 10);
            Canvas.SetTop(body, 100);
            _case.Children.Add(body);
            // Les sangles.
            foreach (var x in new[] { 90.0, 250.0 })
            {
                var strap = new Rectangle { Width = 26, Height = 150, Fill = new SolidColorBrush(dark) };
                Canvas.SetLeft(strap, x);
                Canvas.SetTop(strap, 100);
                _case.Children.Add(strap);
            }
            // Le couvercle (pivote pour s'ouvrir).
            var lidCanvas = new Canvas { Width = 340, Height = 70, RenderTransformOrigin = new Point(0, 1) };
            var lid = new Rectangle { Width = 340, Height = 64, RadiusX = 20, RadiusY = 20, Fill = new SolidColorBrush(Color.FromRgb(0xC8, 0x8A, 0x52)), Stroke = new SolidColorBrush(dark), StrokeThickness = 6 };
            lidCanvas.Children.Add(lid);
            var handle = new Rectangle { Width = 90, Height = 26, RadiusX = 12, RadiusY = 12, Fill = new SolidColorBrush(dark) };
            Canvas.SetLeft(handle, 125);
            Canvas.SetTop(handle, -20);
            lidCanvas.Children.Add(handle);
            _lid = new RotateTransform(-55); // ouverte au départ
            lidCanvas.RenderTransform = _lid;
            Canvas.SetLeft(lidCanvas, 10);
            Canvas.SetTop(lidCanvas, 40);
            _case.Children.Add(lidCanvas);

            Canvas.SetLeft(_case, W / 2 - 180);
            Canvas.SetTop(_case, H - 290);
            _case.SetValue(Panel.ZIndexProperty, 40);
            _canvas.Children.Add(_case);
        }

        private void PickItem(Trip t, string emoji, string name, string joke, bool good, Button btn)
        {
            if (Locked) return;
            if (!good)
            {
                Shake(btn);
                Speak(joke);
                return;
            }
            btn.IsHitTestVisible = false;
            Speak(Cap(name) + " ! Oui, dans la valise !");
            SoundFx.PopSound();

            // L'habit VOLE en cloche jusqu'à la valise.
            var flying = Art.ForEmoji(emoji, 110);
            flying.IsHitTestVisible = false;
            flying.RenderTransformOrigin = new Point(0.5, 0.5);
            double x0 = Canvas.GetLeft(btn) + 40, y0 = Canvas.GetTop(btn) + 30;
            double x1 = W / 2 - 40, y1 = H - 230;
            Canvas.SetLeft(flying, x0);
            Canvas.SetTop(flying, y0);
            flying.SetValue(Panel.ZIndexProperty, 60);
            _canvas.Children.Add(flying);
            btn.Visibility = Visibility.Hidden;

            var rot = new RotateTransform(0);
            flying.RenderTransform = rot;
            rot.BeginAnimation(RotateTransform.AngleProperty, new DoubleAnimation(0, 360, TimeSpan.FromMilliseconds(750)));
            var ax = new DoubleAnimation(x0, x1, TimeSpan.FromMilliseconds(750)) { EasingFunction = new SineEase() };
            var ay = new DoubleAnimationUsingKeyFrames { Duration = TimeSpan.FromMilliseconds(750) };
            ay.KeyFrames.Add(new SplineDoubleKeyFrame(Math.Min(y0, y1) - 150, KeyTime.FromPercent(0.5), new KeySpline(0.2, 0.8, 0.4, 1)));
            ay.KeyFrames.Add(new SplineDoubleKeyFrame(y1, KeyTime.FromPercent(1), new KeySpline(0.5, 0, 0.8, 1)));
            ay.Completed += (s, e) =>
            {
                _canvas.Children.Remove(flying);
                SoundFx.Splat();
                // La valise rebondit.
                var sc = new ScaleTransform(1, 1);
                _case.RenderTransform = sc;
                var squash = new DoubleAnimation(1, 0.9, TimeSpan.FromMilliseconds(140))
                { AutoReverse = true, EasingFunction = new SineEase() };
                sc.BeginAnimation(ScaleTransform.ScaleYProperty, squash);

                _packed++;
                if (_packed < t.Good.Length) return;

                // Valise pleine : le couvercle se FERME, autocollant, et on décolle !
                Locked = true;
                Schedule(500, () =>
                {
                    _lid.BeginAnimation(RotateTransform.AngleProperty,
                        new DoubleAnimation(-55, 0, TimeSpan.FromMilliseconds(520))
                        { EasingFunction = new BackEase { EasingMode = EasingMode.EaseIn, Amplitude = 0.4 } });
                    Schedule(560, () =>
                    {
                        SoundFx.Drum();
                        var sticker = new TextBlock { Text = "⭐", FontSize = 56, IsHitTestVisible = false, RenderTransformOrigin = new Point(0.5, 0.5) };
                        var ssc = new ScaleTransform(0.2, 0.2);
                        sticker.RenderTransform = ssc;
                        Canvas.SetLeft(sticker, 250);
                        Canvas.SetTop(sticker, 130);
                        _case.Children.Add(sticker);
                        var popA = new DoubleAnimation(0.2, 1, TimeSpan.FromMilliseconds(400))
                        { EasingFunction = new BackEase { EasingMode = EasingMode.EaseOut, Amplitude = 0.8 } };
                        ssc.BeginAnimation(ScaleTransform.ScaleXProperty, popA);
                        ssc.BeginAnimation(ScaleTransform.ScaleYProperty, popA);
                        GameKit.Success();
                        Speak("La valise est prête ! En route ! Bon voyage !");
                        Celebrate();
                        _tripIdx++;
                        if (_tripIdx >= Trips.Length)
                        {
                            Schedule(2600, () =>
                            {
                                Speak("Bravo, petit voyageur !");
                                Schedule(3200, NewRound);
                            });
                        }
                        else Schedule(2800, BuildTrip);
                    });
                });
            };
            flying.BeginAnimation(Canvas.LeftProperty, ax);
            flying.BeginAnimation(Canvas.TopProperty, ay);
        }

        private static Button SceneButton(UIElement content, double w, double h)
        {
            var tpl = new ControlTemplate(typeof(Button));
            var border = new FrameworkElementFactory(typeof(Border));
            border.SetValue(Border.BackgroundProperty, Brushes.Transparent);
            var cp = new FrameworkElementFactory(typeof(ContentPresenter));
            cp.SetValue(FrameworkElement.HorizontalAlignmentProperty, HorizontalAlignment.Center);
            cp.SetValue(FrameworkElement.VerticalAlignmentProperty, VerticalAlignment.Center);
            border.AppendChild(cp);
            tpl.VisualTree = border;
            return new Button { Template = tpl, Width = w, Height = h, Focusable = false, Content = content };
        }

        private void AddDecor(string emoji, double x, double y, double size)
        {
            var tb = Art.ForEmoji(emoji, size * 1.2);
            tb.IsHitTestVisible = false;
            Canvas.SetLeft(tb, x);
            Canvas.SetTop(tb, y);
            _canvas.Children.Add(tb);
        }

        private static string Cap(string s) => char.ToUpperInvariant(s[0]) + s.Substring(1);
    }
}
