using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Shapes;
using MesPremiersJeux.Games;

namespace MesPremiersJeux.Views
{
    /// <summary>
    /// Onglet Éducatif (maternelle PS/MS) : menu plein écran d'activités —
    /// lettres, nombres, grand/petit, suites logiques, imagier — chacune jouable
    /// au regard, avec confettis de félicitation.
    /// </summary>
    public partial class EducationView : UserControl
    {
        private readonly (string Icon, string Label, string Level, Func<Action, UserControl> Make)[] _activities =
        {
            ("🔤", "Les lettres",    "PS · MS", c => new LettersGame(c)),
            ("🔢", "Les nombres",    "PS · MS", c => new NumbersGame(c)),
            ("📏", "Grand ou petit", "PS",      c => new SizeGame(c)),
            ("🟡", "Les suites",     "MS",      c => new PatternGame(c)),
            ("🖼️", "L'imagier",      "PS · MS", c => new VocabGame(c)),
        };

        private readonly Random _rng = new Random();

        public EducationView()
        {
            InitializeComponent();

            foreach (var a in _activities)
            {
                var content = new StackPanel { HorizontalAlignment = HorizontalAlignment.Center };
                content.Children.Add(new TextBlock { Text = a.Icon, FontSize = 76, HorizontalAlignment = HorizontalAlignment.Center });
                content.Children.Add(new TextBlock
                {
                    Text = a.Label,
                    FontSize = 26,
                    FontWeight = FontWeights.Bold,
                    Foreground = new SolidColorBrush(Color.FromRgb(0x1F, 0x3A, 0x5A)),
                    HorizontalAlignment = HorizontalAlignment.Center,
                    Margin = new Thickness(0, 6, 0, 0),
                });
                content.Children.Add(new TextBlock
                {
                    Text = a.Level,
                    FontSize = 17,
                    Foreground = new SolidColorBrush(Color.FromRgb(0x5A, 0x7A, 0x9A)),
                    HorizontalAlignment = HorizontalAlignment.Center,
                    Margin = new Thickness(0, 3, 0, 0),
                });

                var tile = new Button { Style = (Style)Application.Current.Resources["MenuTile"], Content = content };
                var make = a.Make;
                tile.Click += (s, e) => Play(make);
                Menu.Children.Add(tile);
            }
        }

        private void Play(Func<Action, UserControl> make)
        {
            try
            {
                GameHost.Children.Clear();
                GameHost.Children.Add(make(ShowConfetti));
                MenuRoot.Visibility = Visibility.Collapsed;
                PlayRoot.Visibility = Visibility.Visible;
            }
            catch (Exception ex)
            {
                MessageBox.Show("Impossible d'ouvrir cette activité :\n" + ex.Message, "Mes Premiers Jeux");
            }
        }

        private void Back_Click(object sender, RoutedEventArgs e)
        {
            GameHost.Children.Clear();
            PlayRoot.Visibility = Visibility.Collapsed;
            MenuRoot.Visibility = Visibility.Visible;
        }

        // --- Confettis (fontaine douce, comme dans les jeux) ---
        private static readonly Color[] ConfettiColors =
        {
            Color.FromRgb(0xFF, 0x6B, 0x6B), Color.FromRgb(0x4E, 0xCD, 0xC4), Color.FromRgb(0xFF, 0xD9, 0x3C),
            Color.FromRgb(0x95, 0xE0, 0x6C), Color.FromRgb(0xA0, 0x6C, 0xD5), Color.FromRgb(0x5D, 0xAD, 0xE2),
            Color.FromRgb(0xFF, 0x8F, 0xD3),
        };

        private const string StarPath = "M10,0 L12.9,7.6 L21,7.6 L14.5,12.6 L17,20.4 L10,15.5 L3,20.4 L5.5,12.6 L-1,7.6 L7.1,7.6 Z";

        private void ShowConfetti()
        {
            double w = Confetti.ActualWidth, h = Confetti.ActualHeight;
            if (w <= 0 || h <= 0) return;

            for (int i = 0; i < 60; i++)
            {
                var col = ConfettiColors[_rng.Next(ConfettiColors.Length)];
                var brush = new SolidColorBrush(col);
                FrameworkElement piece;
                switch (_rng.Next(3))
                {
                    case 0: piece = new Rectangle { Width = 12 + _rng.Next(8), Height = 16 + _rng.Next(10), RadiusX = 3, RadiusY = 3, Fill = brush }; break;
                    case 1: piece = new Ellipse { Width = 12 + _rng.Next(8), Height = 12 + _rng.Next(8), Fill = brush }; break;
                    default: piece = new Path { Data = Geometry.Parse(StarPath), Fill = brush, Stretch = Stretch.Uniform, Width = 20 + _rng.Next(10), Height = 20 + _rng.Next(10) }; break;
                }
                piece.RenderTransformOrigin = new Point(0.5, 0.5);

                double x0 = w * (0.5 + (_rng.NextDouble() - 0.5) * 0.3);
                double y0 = h * 0.86;
                Canvas.SetLeft(piece, x0);
                Canvas.SetTop(piece, y0);
                var tt = new TranslateTransform();
                var rot = new RotateTransform(_rng.Next(360));
                var grp = new TransformGroup();
                grp.Children.Add(rot);
                grp.Children.Add(tt);
                piece.RenderTransform = grp;
                Confetti.Children.Add(piece);

                double dur = 1500 + _rng.Next(1300);
                double rise = h * (0.45 + _rng.NextDouble() * 0.42);
                double drift = (_rng.NextDouble() - 0.5) * w * 0.7;

                var yAnim = new DoubleAnimationUsingKeyFrames { Duration = TimeSpan.FromMilliseconds(dur) };
                yAnim.KeyFrames.Add(new SplineDoubleKeyFrame(-rise, KeyTime.FromPercent(0.42), new KeySpline(0.15, 0.7, 0.35, 1)));
                yAnim.KeyFrames.Add(new SplineDoubleKeyFrame(80, KeyTime.FromPercent(1), new KeySpline(0.4, 0, 0.7, 1)));
                tt.BeginAnimation(TranslateTransform.YProperty, yAnim);
                tt.BeginAnimation(TranslateTransform.XProperty,
                    new DoubleAnimation(0, drift, TimeSpan.FromMilliseconds(dur)) { AccelerationRatio = 0.2 });
                rot.BeginAnimation(RotateTransform.AngleProperty,
                    new DoubleAnimation(rot.Angle, rot.Angle + (_rng.Next(2) == 0 ? 720 : -720), TimeSpan.FromMilliseconds(dur)));

                var fade = new DoubleAnimation(1, 0, TimeSpan.FromMilliseconds(dur)) { BeginTime = TimeSpan.FromMilliseconds(dur * 0.62) };
                var captured = piece;
                fade.Completed += (s, e) => Confetti.Children.Remove(captured);
                piece.BeginAnimation(OpacityProperty, fade);
            }
        }
    }
}
