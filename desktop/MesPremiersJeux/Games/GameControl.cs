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
            root.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto }); // consigne 🔊
            root.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });

            Question = new TextBlock
            {
                FontSize = 40,
                FontWeight = FontWeights.Bold,
                Foreground = new SolidColorBrush(Color.FromRgb(0x3B, 0x2A, 0x5A)),
                HorizontalAlignment = HorizontalAlignment.Center,
                TextWrapping = TextWrapping.Wrap,
                TextAlignment = TextAlignment.Center,
                Margin = new Thickness(16, 12, 16, 4),
            };
            Grid.SetRow(Question, 0);
            root.Children.Add(Question);

            // Barre de consigne SANS LECTURE : le modèle en grand + le bouton 🔊
            // qui répète la consigne (remplie par chaque jeu via SetConsigne).
            _consigne = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                HorizontalAlignment = HorizontalAlignment.Center,
                Margin = new Thickness(0, 2, 0, 2),
                Visibility = Visibility.Collapsed,
            };
            Grid.SetRow(_consigne, 1);
            root.Children.Add(_consigne);

            Body = new Grid { Margin = new Thickness(12) };
            Grid.SetRow(Body, 2);
            root.Children.Add(Body);

            Content = root;
            Loaded += (s, e) =>
            {
                if (_started) return;
                _started = true;
                try { NewRound(); }
                catch (Exception ex)
                {
                    Question.Text = "Oups, ce jeu a un souci.";
                    System.Diagnostics.Debug.WriteLine("NewRound error: " + ex);
                }
            };
        }

        private bool _started;
        private StackPanel _consigne;

        /// <summary>
        /// Remplit la barre de consigne accessible : un MODÈLE montré en grand
        /// (facultatif — la lettre, la couleur, l'objet à trouver…) et un gros
        /// bouton 🔊 qui redit la consigne à voix haute. Pensé pour un enfant qui
        /// ne lit pas : la consigne se voit et s'entend, elle ne se lit pas.
        /// À appeler à chaque tour ; (null, null) masque la barre.
        /// </summary>
        protected void SetConsigne(UIElement model, Func<string> speech, double modelHeight = 130)
        {
            _consigne.Children.Clear();
            if (model == null && speech == null)
            {
                _consigne.Visibility = Visibility.Collapsed;
                return;
            }
            if (model != null)
            {
                _consigne.Children.Add(new Border
                {
                    CornerRadius = new CornerRadius(24),
                    Background = Brushes.White,
                    BorderBrush = new SolidColorBrush(Color.FromRgb(0xFF, 0xC1, 0x07)),
                    BorderThickness = new Thickness(5),
                    Padding = new Thickness(14, 8, 14, 8),
                    Margin = new Thickness(0, 0, 18, 0),
                    VerticalAlignment = VerticalAlignment.Center,
                    Child = new Viewbox { Child = model, Height = modelHeight, Stretch = Stretch.Uniform },
                });
            }
            if (speech != null)
            {
                var b = SpeakerButton(speech, 96);
                b.VerticalAlignment = VerticalAlignment.Center;
                _consigne.Children.Add(b);
            }
            _consigne.Visibility = Visibility.Visible;
        }

        /// <summary>Démarre un nouveau tour (implémenté par chaque jeu).</summary>
        protected abstract void NewRound();

        protected void Speak(string text) => Speech.Say(text);

        /// <summary>
        /// Gros bouton 🔊 qui RÉPÈTE la consigne à voix haute — pour un enfant qui
        /// ne lit pas encore : la consigne s'entend et se voit (modèle en grand),
        /// elle ne se lit pas. Le texte est relu à chaque appui (il peut changer
        /// d'un tour à l'autre grâce à la fonction passée en paramètre).
        /// </summary>
        protected Button SpeakerButton(Func<string> text, double size = 108)
        {
            var b = new Button
            {
                Style = (Style)Application.Current.Resources["AnswerButton"],
                Width = size,
                Height = size,
                Content = new TextBlock
                {
                    Text = "🔊",
                    FontSize = size * 0.46,
                    HorizontalAlignment = HorizontalAlignment.Center,
                    VerticalAlignment = VerticalAlignment.Center,
                },
            };
            b.Click += (s, e) => { try { Speak(text()); } catch { } };
            return b;
        }

        protected void Celebrate()
        {
            RewardStore.Add(); // chaque réussite gagne une étoile ⭐
            _celebrate?.Invoke();
        }

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
            Body.Children.Add(FitBox(dp));
        }

        /// <summary>Remplit le corps avec un contenu unique (grilles, etc.).</summary>
        protected void SetBody(UIElement content)
        {
            Body.Children.Clear();
            Body.Children.Add(FitBox(content));
        }

        // Met le contenu à l'échelle pour occuper toute la page (cibles maximales),
        // sans défilement ni rognage.
        private static Viewbox FitBox(UIElement child) => new Viewbox
        {
            Child = child,
            Stretch = Stretch.Uniform,
            StretchDirection = StretchDirection.Both,
            Margin = new Thickness(8),
        };

        /// <summary>Remplit toute la page avec un contenu étiré (ex. grille de cartes
        /// dont chaque carte occupe sa cellule au maximum).</summary>
        protected void SetBodyFill(UIElement content)
        {
            Body.Children.Clear();
            if (content is FrameworkElement fe)
            {
                fe.HorizontalAlignment = HorizontalAlignment.Stretch;
                fe.VerticalAlignment = VerticalAlignment.Stretch;
            }
            Body.Children.Add(content);
        }

        /// <summary>Cellule : agrandit l'élément (sans le déformer) pour remplir sa case.</summary>
        protected static UIElement Cell(UIElement child) => new Viewbox
        {
            Child = child,
            Stretch = Stretch.Uniform,
            StretchDirection = StretchDirection.Both,
            Margin = new Thickness(10),
        };

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
