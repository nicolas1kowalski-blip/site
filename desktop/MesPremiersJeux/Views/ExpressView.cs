using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Shapes;
using System.Windows.Threading;
using MesPremiersJeux.Games;
using MesPremiersJeux.Lib;

namespace MesPremiersJeux.Views
{
    /// <summary>
    /// Onglet « Je m'exprime » : un tableau de communication piloté au regard. On
    /// fixe une frimousse (émotion, besoin, politesse) → elle s'affiche EN GRAND et
    /// ANIMÉE (elle rebondit, tremble, fait coucou, cœurs qui montent…) et la voix
    /// dit la phrase. Personnage original, dans l'esprit d'un tableau AAC.
    /// </summary>
    public sealed class ExpressView : UserControl
    {
        private enum Anim { Bounce, Shake, Sway, Tremble, Pop, Breathe, Wave }
        private enum Particle { None, Hearts, Zzz, Tears, Stars, Sweat }

        private sealed class Expr
        {
            public string Id, Phrase, Cat, Label;
            public Face Face;
            public Anim Anim;
            public Particle Particle;
        }

        private static readonly Brush Dark = new SolidColorBrush(Color.FromRgb(0x3B, 0x2A, 0x5A));

        private readonly (string Key, string Icon, string Name)[] _cats =
        {
            ("emotion",   "😊", "Émotions"),
            ("besoin",    "🍽", "Besoins"),
            ("politesse", "🙌", "Politesse"),
        };

        private readonly List<Expr> _all = Build();
        private readonly StackPanel _catBar;
        private readonly UniformGrid _tiles;
        private readonly ContentControl _mascotHost;
        private readonly TextBlock _phrase;
        private readonly Canvas _particles;
        private string _cat = "emotion";

        private readonly DispatcherTimer _particleTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(520) };
        private Particle _current = Particle.None;
        private readonly Random _rng = new Random();

        public ExpressView()
        {
            var root = new Grid();
            root.Background = new LinearGradientBrush(Color.FromRgb(0xFF, 0xF6, 0xFB), Color.FromRgb(0xE9, 0xF2, 0xFF), 90);
            root.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            root.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });

            // Catégories (gauche).
            _catBar = new StackPanel { Margin = new Thickness(10, 12, 6, 12), VerticalAlignment = VerticalAlignment.Center };
            Grid.SetColumn(_catBar, 0);
            root.Children.Add(_catBar);

            var content = new Grid();
            content.RowDefinitions.Add(new RowDefinition { Height = new GridLength(3, GridUnitType.Star) });
            content.RowDefinitions.Add(new RowDefinition { Height = new GridLength(4, GridUnitType.Star) });
            Grid.SetColumn(content, 1);
            root.Children.Add(content);

            // Grand affichage animé (haut).
            var stage = new Grid { Margin = new Thickness(8) };
            var card = new Border
            {
                Background = Brushes.White,
                CornerRadius = new CornerRadius(28),
                Effect = new System.Windows.Media.Effects.DropShadowEffect { BlurRadius = 20, ShadowDepth = 3, Opacity = 0.15 },
            };
            stage.Children.Add(card);
            _mascotHost = new ContentControl { HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center };
            stage.Children.Add(_mascotHost);
            _particles = new Canvas { IsHitTestVisible = false };
            stage.Children.Add(_particles);
            _phrase = new TextBlock
            {
                FontSize = 34,
                FontWeight = FontWeights.Bold,
                Foreground = new SolidColorBrush(Color.FromRgb(0x7E, 0x3F, 0xF2)),
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Bottom,
                Margin = new Thickness(0, 0, 0, 14),
            };
            stage.Children.Add(_phrase);
            Grid.SetRow(stage, 0);
            content.Children.Add(stage);

            // Grille des frimousses (bas).
            _tiles = new UniformGrid { Columns = 4, Margin = new Thickness(8) };
            var scroll = new ScrollViewer { Content = _tiles, VerticalScrollBarVisibility = ScrollBarVisibility.Auto };
            Grid.SetRow(scroll, 1);
            content.Children.Add(scroll);

            Content = root;

            _particleTimer.Tick += (s, e) => SpawnParticle();

            BuildCats();
            BuildTiles();
            Loaded += (s, e) => { var first = _all.FirstOrDefault(x => x.Cat == _cat); if (first != null) Select(first); };
        }

        private void BuildCats()
        {
            _catBar.Children.Clear();
            foreach (var cat in _cats)
            {
                var content = new StackPanel { HorizontalAlignment = HorizontalAlignment.Center };
                content.Children.Add(new TextBlock { Text = cat.Icon, FontSize = 40, HorizontalAlignment = HorizontalAlignment.Center });
                content.Children.Add(new TextBlock { Text = cat.Name, FontSize = 16, FontWeight = FontWeights.Bold, Foreground = Dark, HorizontalAlignment = HorizontalAlignment.Center });

                var btn = new Button
                {
                    Content = content,
                    Width = 130,
                    Height = 110,
                    Margin = new Thickness(0, 0, 0, 12),
                    Cursor = System.Windows.Input.Cursors.Hand,
                    Background = cat.Key == _cat ? new SolidColorBrush(Color.FromRgb(0xE6, 0xD9, 0xFF)) : Brushes.White,
                    BorderBrush = new SolidColorBrush(Color.FromRgb(0x7E, 0x3F, 0xF2)),
                    BorderThickness = new Thickness(cat.Key == _cat ? 3 : 0),
                };
                var key = cat.Key;
                btn.Click += (s, e) => { _cat = key; BuildCats(); BuildTiles(); };
                _catBar.Children.Add(btn);
            }
        }

        private void BuildTiles()
        {
            _tiles.Children.Clear();
            foreach (var ex in _all.Where(x => x.Cat == _cat))
            {
                var stack = new StackPanel { HorizontalAlignment = HorizontalAlignment.Center };
                var m = Mascot.Build(ex.Face);
                var box = new Viewbox { Child = m, Width = 120, Height = 120, Stretch = Stretch.Uniform };
                stack.Children.Add(box);
                stack.Children.Add(new TextBlock
                {
                    Text = ex.Label,
                    FontSize = 20,
                    FontWeight = FontWeights.Bold,
                    Foreground = Dark,
                    HorizontalAlignment = HorizontalAlignment.Center,
                    Margin = new Thickness(0, 4, 0, 0),
                });
                var tile = new Button { Style = (Style)Application.Current.Resources["MenuTile"], Content = stack };
                var e2 = ex;
                tile.Click += (s, e) => Select(e2);
                _tiles.Children.Add(tile);
            }
        }

        private void Select(Expr ex)
        {
            _phrase.Text = ex.Label;
            var big = Mascot.Build(ex.Face);
            big.Width = 320;
            big.Height = 320;
            ApplyAnim(ex.Anim, big);
            _mascotHost.Content = big;

            _particles.Children.Clear();
            _current = ex.Particle;
            _particleTimer.Stop();
            if (_current != Particle.None) { SpawnParticle(); _particleTimer.Start(); }

            Speech.Say(ex.Phrase);
        }

        // ---- Animations du grand personnage ----
        private static void ApplyAnim(Anim a, FrameworkElement el)
        {
            switch (a)
            {
                case Anim.Bounce:
                    el.RenderTransformOrigin = new Point(0.5, 1.0);
                    var sb = new ScaleTransform(1, 1); el.RenderTransform = sb;
                    var by = new DoubleAnimation(1, 1.10, TimeSpan.FromMilliseconds(480)) { AutoReverse = true, RepeatBehavior = RepeatBehavior.Forever, EasingFunction = new SineEase { EasingMode = EasingMode.EaseInOut } };
                    sb.BeginAnimation(ScaleTransform.ScaleYProperty, by);
                    sb.BeginAnimation(ScaleTransform.ScaleXProperty, new DoubleAnimation(1, 0.96, TimeSpan.FromMilliseconds(480)) { AutoReverse = true, RepeatBehavior = RepeatBehavior.Forever, EasingFunction = new SineEase { EasingMode = EasingMode.EaseInOut } });
                    break;
                case Anim.Breathe:
                    el.RenderTransformOrigin = new Point(0.5, 0.5);
                    var stb = new ScaleTransform(1, 1); el.RenderTransform = stb;
                    var br = new DoubleAnimation(1, 1.05, TimeSpan.FromMilliseconds(1400)) { AutoReverse = true, RepeatBehavior = RepeatBehavior.Forever, EasingFunction = new SineEase { EasingMode = EasingMode.EaseInOut } };
                    stb.BeginAnimation(ScaleTransform.ScaleXProperty, br);
                    stb.BeginAnimation(ScaleTransform.ScaleYProperty, br);
                    break;
                case Anim.Shake:
                    el.RenderTransform = KeyframeTranslate(new[] { 0.0, -9, 8, -7, 6, 0 }, 420, true);
                    break;
                case Anim.Tremble:
                    el.RenderTransform = KeyframeTranslate(new[] { 0.0, -3, 3, -2, 2, -3, 0 }, 260, true);
                    break;
                case Anim.Sway:
                    el.RenderTransformOrigin = new Point(0.5, 1.0);
                    var rt = new RotateTransform(); el.RenderTransform = rt;
                    var sw = new DoubleAnimation(-6, 6, TimeSpan.FromMilliseconds(1100)) { AutoReverse = true, RepeatBehavior = RepeatBehavior.Forever, EasingFunction = new SineEase { EasingMode = EasingMode.EaseInOut } };
                    rt.BeginAnimation(RotateTransform.AngleProperty, sw);
                    break;
                case Anim.Wave:
                    el.RenderTransformOrigin = new Point(0.5, 1.0);
                    var rw = new RotateTransform(); el.RenderTransform = rw;
                    var wv = new DoubleAnimation(-9, 9, TimeSpan.FromMilliseconds(360)) { AutoReverse = true, RepeatBehavior = RepeatBehavior.Forever, EasingFunction = new SineEase { EasingMode = EasingMode.EaseInOut } };
                    rw.BeginAnimation(RotateTransform.AngleProperty, wv);
                    break;
                case Anim.Pop:
                    el.RenderTransformOrigin = new Point(0.5, 0.5);
                    var sp = new ScaleTransform(0.5, 0.5); el.RenderTransform = sp;
                    DoubleAnimation Pop() => new DoubleAnimation(0.5, 1.0, TimeSpan.FromMilliseconds(600)) { EasingFunction = new BackEase { EasingMode = EasingMode.EaseOut, Amplitude = 0.6 } };
                    sp.BeginAnimation(ScaleTransform.ScaleXProperty, Pop());
                    sp.BeginAnimation(ScaleTransform.ScaleYProperty, Pop());
                    break;
            }
        }

        private static TranslateTransform KeyframeTranslate(double[] xs, double ms, bool repeat)
        {
            var tt = new TranslateTransform();
            var a = new DoubleAnimationUsingKeyFrames { Duration = TimeSpan.FromMilliseconds(ms) };
            if (repeat) a.RepeatBehavior = RepeatBehavior.Forever;
            for (int i = 0; i < xs.Length; i++)
                a.KeyFrames.Add(new LinearDoubleKeyFrame(xs[i], KeyTime.FromPercent((double)i / (xs.Length - 1))));
            tt.BeginAnimation(TranslateTransform.XProperty, a);
            return tt;
        }

        // ---- Particules (cœurs, zzz, larmes, étoiles, goutte) ----
        private void SpawnParticle()
        {
            double w = _particles.ActualWidth, h = _particles.ActualHeight;
            if (w <= 0 || h <= 0) return;
            double cx = w / 2;

            switch (_current)
            {
                case Particle.Hearts:
                    FloatUp(HeartShape(), cx + (_rng.NextDouble() - 0.5) * 120, h * 0.68, -h * 0.5, 1700);
                    break;
                case Particle.Zzz:
                    FloatUp(ZLetter(), cx + 90, h * 0.32, -h * 0.28, 1900, drift: 60);
                    break;
                case Particle.Tears:
                    FallDown(TearShape(), cx + (_rng.Next(2) == 0 ? -60 : 60), h * 0.42, h * 0.35, 1200);
                    break;
                case Particle.Stars:
                    Twinkle(StarShape(), cx + (_rng.NextDouble() - 0.5) * 260, h * (0.25 + _rng.NextDouble() * 0.4));
                    break;
                case Particle.Sweat:
                    FallDown(SweatShape(), cx + 70, h * 0.3, h * 0.2, 900);
                    break;
            }
        }

        private void FloatUp(FrameworkElement el, double x, double y, double rise, double dur, double drift = 30)
        {
            Canvas.SetLeft(el, x); Canvas.SetTop(el, y);
            _particles.Children.Add(el);
            var tt = new TranslateTransform(); el.RenderTransform = tt;
            tt.BeginAnimation(TranslateTransform.YProperty, new DoubleAnimation(0, rise, TimeSpan.FromMilliseconds(dur)));
            tt.BeginAnimation(TranslateTransform.XProperty, new DoubleAnimation(0, (_rng.NextDouble() - 0.5) * drift * 2, TimeSpan.FromMilliseconds(dur)));
            Fade(el, dur);
        }

        private void FallDown(FrameworkElement el, double x, double y, double drop, double dur)
        {
            Canvas.SetLeft(el, x); Canvas.SetTop(el, y);
            _particles.Children.Add(el);
            var tt = new TranslateTransform(); el.RenderTransform = tt;
            tt.BeginAnimation(TranslateTransform.YProperty, new DoubleAnimation(0, drop, TimeSpan.FromMilliseconds(dur)) { AccelerationRatio = 0.6 });
            Fade(el, dur);
        }

        private void Twinkle(FrameworkElement el, double x, double y)
        {
            Canvas.SetLeft(el, x); Canvas.SetTop(el, y);
            el.RenderTransformOrigin = new Point(0.5, 0.5);
            var st = new ScaleTransform(0.2, 0.2); el.RenderTransform = st;
            _particles.Children.Add(el);
            st.BeginAnimation(ScaleTransform.ScaleXProperty, new DoubleAnimation(0.2, 1, TimeSpan.FromMilliseconds(500)) { AutoReverse = true });
            st.BeginAnimation(ScaleTransform.ScaleYProperty, new DoubleAnimation(0.2, 1, TimeSpan.FromMilliseconds(500)) { AutoReverse = true });
            Fade(el, 1000);
        }

        private void Fade(FrameworkElement el, double dur)
        {
            var fade = new DoubleAnimation(1, 0, TimeSpan.FromMilliseconds(dur)) { BeginTime = TimeSpan.FromMilliseconds(dur * 0.5) };
            fade.Completed += (s, e) => _particles.Children.Remove(el);
            el.BeginAnimation(OpacityProperty, fade);
        }

        private static FrameworkElement HeartShape() => new Path
        {
            Data = Geometry.Parse("M12,21 C2,13 0,8 5,4 C8,2 12,5 12,9 C12,5 16,2 19,4 C24,8 22,13 12,21 Z"),
            Fill = new SolidColorBrush(Color.FromRgb(0xFF, 0x6B, 0x95)),
            Stretch = Stretch.Uniform, Width = 34, Height = 34,
        };

        private static FrameworkElement ZLetter() => new TextBlock
        {
            Text = "z", FontSize = 40, FontWeight = FontWeights.Bold,
            Foreground = new SolidColorBrush(Color.FromRgb(0x5D, 0xAD, 0xE2)),
        };

        private static FrameworkElement TearShape() => new Ellipse
        {
            Width = 16, Height = 22, Fill = new SolidColorBrush(Color.FromArgb(0xCC, 0x5D, 0xAD, 0xE2)),
        };

        private static FrameworkElement SweatShape() => new Ellipse
        {
            Width = 18, Height = 24, Fill = new SolidColorBrush(Color.FromArgb(0xCC, 0x8A, 0xD6, 0xFF)),
        };

        private static FrameworkElement StarShape() => new Path
        {
            Data = Geometry.Parse("M10,0 L12.9,7.6 L21,7.6 L14.5,12.6 L17,20.4 L10,15.5 L3,20.4 L5.5,12.6 L-1,7.6 L7.1,7.6 Z"),
            Fill = new SolidColorBrush(Color.FromRgb(0xFF, 0xD9, 0x3C)),
            Stretch = Stretch.Uniform, Width = 30, Height = 30,
        };

        // ---- Données ----
        private static List<Expr> Build()
        {
            var l = new List<Expr>();
            void E(string id, string label, string phrase, string cat, Face f, Anim a, Particle p = Particle.None)
                => l.Add(new Expr { Id = id, Label = label, Phrase = phrase, Cat = cat, Face = f, Anim = a, Particle = p });

            // Émotions
            E("content", "Content", "Je suis content !", "emotion", new Face { Eyes = Eyes.Happy, Mouth = Mouth.BigSmile, Hands = Hands.Open }, Anim.Bounce);
            E("triste", "Triste", "Je suis triste.", "emotion", new Face { Eyes = Eyes.Sad, Mouth = Mouth.Frown, Brows = Brows.Sad, Cheeks = false }, Anim.Sway, Particle.Tears);
            E("fache", "Fâché", "Je suis fâché !", "emotion", new Face { Eyes = Eyes.Angry, Mouth = Mouth.Frown, Brows = Brows.Angry, Cheeks = false, Color = "#FF7A59" }, Anim.Shake);
            E("fatigue", "Fatigué", "Je suis fatigué.", "emotion", new Face { Eyes = Eyes.Sleepy, Mouth = Mouth.Flat }, Anim.Breathe, Particle.Zzz);
            E("peur", "Peur", "J'ai peur !", "emotion", new Face { Eyes = Eyes.Surprised, Mouth = Mouth.Open, Brows = Brows.Up, Cheeks = false }, Anim.Tremble, Particle.Sweat);
            E("surpris", "Surpris", "Oh ! Quelle surprise !", "emotion", new Face { Eyes = Eyes.Surprised, Mouth = Mouth.Open, Brows = Brows.Up }, Anim.Pop, Particle.Stars);
            E("amour", "Je t'aime", "Je t'aime !", "emotion", new Face { Eyes = Eyes.Happy, Mouth = Mouth.Smile, Item = Item.Heart }, Anim.Bounce, Particle.Hearts);
            E("rire", "Rigolo", "Ha ha ha !", "emotion", new Face { Eyes = Eyes.Happy, Mouth = Mouth.BigSmile }, Anim.Bounce);

            // Besoins
            E("faim", "J'ai faim", "J'ai faim.", "besoin", new Face { Eyes = Eyes.Normal, Mouth = Mouth.Smile, Item = Item.Bowl }, Anim.Bounce);
            E("soif", "J'ai soif", "J'ai soif.", "besoin", new Face { Eyes = Eyes.Normal, Mouth = Mouth.Smile, Item = Item.Cup }, Anim.Bounce);
            E("dodo", "Dormir", "Je veux dormir.", "besoin", new Face { Eyes = Eyes.Sleepy, Mouth = Mouth.Flat }, Anim.Breathe, Particle.Zzz);
            E("jouer", "Jouer", "Je veux jouer !", "besoin", new Face { Eyes = Eyes.Happy, Mouth = Mouth.BigSmile, Item = Item.Ball }, Anim.Bounce);
            E("calin", "Câlin", "Je veux un câlin.", "besoin", new Face { Eyes = Eyes.Happy, Mouth = Mouth.Smile, Hands = Hands.Open, Item = Item.Heart }, Anim.Bounce, Particle.Hearts);
            E("aide", "Aide", "Aide-moi, s'il te plaît.", "besoin", new Face { Eyes = Eyes.Sad, Mouth = Mouth.Frown, Brows = Brows.Sad, Hands = Hands.Wave }, Anim.Wave);

            // Politesse
            E("coucou", "Coucou", "Coucou !", "politesse", new Face { Eyes = Eyes.Happy, Mouth = Mouth.Smile, Hands = Hands.Wave }, Anim.Wave);
            E("aurevoir", "Au revoir", "Au revoir !", "politesse", new Face { Eyes = Eyes.Happy, Mouth = Mouth.Smile, Hands = Hands.Wave }, Anim.Wave);
            E("oui", "Oui", "Oui !", "politesse", new Face { Eyes = Eyes.Happy, Mouth = Mouth.Smile, Hands = Hands.ThumbsUp }, Anim.Bounce);
            E("non", "Non", "Non !", "politesse", new Face { Eyes = Eyes.Angry, Mouth = Mouth.Flat, Brows = Brows.Angry, Cheeks = false }, Anim.Shake);
            E("merci", "Merci", "Merci !", "politesse", new Face { Eyes = Eyes.Happy, Mouth = Mouth.Smile }, Anim.Bounce, Particle.Stars);
            E("stp", "S'il te plaît", "S'il te plaît.", "politesse", new Face { Eyes = Eyes.Happy, Mouth = Mouth.Smile, Hands = Hands.Open }, Anim.Bounce);
            E("bravo", "Bravo", "Bravo !", "politesse", new Face { Eyes = Eyes.Happy, Mouth = Mouth.BigSmile, Hands = Hands.ThumbsUp }, Anim.Bounce, Particle.Stars);
            E("encore", "Encore", "Encore !", "politesse", new Face { Eyes = Eyes.Happy, Mouth = Mouth.Smile, Hands = Hands.Open }, Anim.Bounce);

            return l;
        }
    }
}
