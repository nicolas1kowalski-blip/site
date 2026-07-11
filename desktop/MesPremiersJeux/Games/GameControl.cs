using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Threading;
using MesPremiersJeux.Lib;

namespace MesPremiersJeux.Games
{
    /// <summary>
    /// Socle commun des jeux « trouve la bonne réponse » : titre en haut, corps
    /// de jeu en dessous, verrouillage pendant la félicitation, animation de
    /// tremblement sur une mauvaise réponse, et planification du tour suivant.
    /// </summary>
    public abstract class GameControl : UserControl
    {
        private readonly Action _celebrate;
        protected readonly TextBlock Question;
        protected readonly Grid Body;
        protected bool Locked;

        protected GameControl(Action celebrate)
        {
            _celebrate = celebrate;

            var root = new Grid();
            root.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
            root.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });

            Question = new TextBlock
            {
                FontSize = 34,
                FontWeight = FontWeights.Bold,
                Foreground = new SolidColorBrush(Color.FromRgb(0x3B, 0x2A, 0x5A)),
                HorizontalAlignment = HorizontalAlignment.Center,
                TextWrapping = TextWrapping.Wrap,
                TextAlignment = TextAlignment.Center,
                Margin = new Thickness(16, 14, 16, 6),
            };
            Grid.SetRow(Question, 0);
            root.Children.Add(Question);

            Body = new Grid { Margin = new Thickness(12) };
            Grid.SetRow(Body, 1);
            root.Children.Add(Body);

            Content = root;
            Loaded += (s, e) => { if (_started == false) { _started = true; NewRound(); } };
        }

        private bool _started;

        /// <summary>Démarre un nouveau tour (implémenté par chaque jeu).</summary>
        protected abstract void NewRound();

        protected void Speak(string text) => Speech.Say(text);
        protected void Celebrate() => _celebrate?.Invoke();

        protected void ScheduleNext(int ms) => Schedule(ms, NewRound);

        protected void Schedule(int ms, Action action)
        {
            var t = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(ms) };
            t.Tick += (s, e) => { t.Stop(); action(); };
            t.Start();
        }

        /// <summary>Dispose une « scène » centrale et une rangée de réponses en bas.</summary>
        protected void SetBody(UIElement stage, UIElement answers)
        {
            Body.Children.Clear();
            var dp = new DockPanel { LastChildFill = true };
            if (answers != null)
            {
                var ans = new ContentControl
                {
                    Content = answers,
                    HorizontalAlignment = HorizontalAlignment.Center,
                    Margin = new Thickness(0, 10, 0, 6),
                };
                DockPanel.SetDock(ans, Dock.Bottom);
                dp.Children.Add(ans);
            }
            dp.Children.Add(new ContentControl
            {
                Content = stage,
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
            });
            Body.Children.Add(dp);
        }

        /// <summary>Remplit le corps avec un contenu unique (grilles, etc.), mis à
        /// l'échelle vers le bas si besoin pour tenir sans défilement ni rognage.</summary>
        protected void SetBody(UIElement content)
        {
            Body.Children.Clear();
            Body.Children.Add(new Viewbox
            {
                Child = content,
                Stretch = Stretch.Uniform,
                StretchDirection = StretchDirection.DownOnly,
            });
        }

        // --- Fabrique de boutons-réponses (gaze-cliquables : ce sont des Button) ---
        protected Button AnswerButton(UIElement content, double size = 210)
        {
            return new Button
            {
                Style = (Style)Application.Current.Resources["AnswerButton"],
                Content = content,
                Width = size,
                Height = size,
            };
        }

        protected static StackPanel Row()
        {
            return new StackPanel
            {
                Orientation = Orientation.Horizontal,
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
            };
        }

        // --- Animation de tremblement (mauvaise réponse) ---
        protected static void Shake(FrameworkElement el)
        {
            el.RenderTransformOrigin = new Point(0.5, 0.5);
            var tt = new TranslateTransform();
            el.RenderTransform = tt;
            var a = new DoubleAnimationUsingKeyFrames();
            foreach (var (p, v) in new[] { (0.0, 0.0), (0.2, -12.0), (0.4, 10.0), (0.6, -8.0), (0.8, 6.0), (1.0, 0.0) })
                a.KeyFrames.Add(new LinearDoubleKeyFrame(v, KeyTime.FromPercent(p)));
            a.Duration = TimeSpan.FromMilliseconds(500);
            tt.BeginAnimation(TranslateTransform.XProperty, a);
        }
    }
}
