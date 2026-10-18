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

        /// <summary>
        /// « LA VOIX D'ABORD » : quand true (défaut), tous les clics du jeu sont
        /// IGNORÉS tant que la consigne est en train d'être dite — l'enfant
        /// écoute jusqu'au bout avant d'agir. Les jeux sensoriels purs
        /// (cause-à-effet) le désactivent pour rester instantanés.
        /// </summary>
        protected bool GateVoice = true;

        protected GameControl(Action celebrate)
        {
            _celebrate = celebrate;

            // Le verrou « la voix d'abord » : intercepte le clic AVANT les
            // boutons (vrai clic souris comme clic injecté par le regard).
            // Il est LIMITÉ (jamais plus de 7 s de blocage, même sur une longue
            // phrase) et VISIBLE : une petite oreille 👂 apparaît là où l'enfant
            // a cliqué, pour dire « écoute d'abord ! » — fini les clics avalés
            // mystérieusement. Un clic repousse aussi le coup de pouce.
            PreviewMouseLeftButtonDown += (s, e) =>
            {
                if (_hint != null) { _hint.Stop(); _hint.Start(); }
                if (GateVoice && Speech.IsGating && Speech.BusyElapsedSeconds < 7)
                {
                    e.Handled = true;
                    ShowListenCue(e.GetPosition(this));
                }
            };

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

            // LA TIRELIRE D'ÉTOILES, visible pendant le jeu (en haut à droite) :
            // à chaque réussite, une étoile VOLE dedans et le compteur saute.
            _jarText = new TextBlock
            {
                Text = "⭐ " + RewardStore.Balance,
                FontSize = 24,
                FontWeight = FontWeights.Bold,
                Foreground = new SolidColorBrush(Color.FromRgb(0x7A, 0x52, 0x0A)),
            };
            _jar = new Border
            {
                Background = new SolidColorBrush(Color.FromArgb(230, 0xFF, 0xF2, 0xC4)),
                BorderBrush = new SolidColorBrush(Color.FromRgb(0xFF, 0xC1, 0x07)),
                BorderThickness = new Thickness(4),
                CornerRadius = new CornerRadius(20),
                Padding = new Thickness(14, 6, 14, 6),
                HorizontalAlignment = HorizontalAlignment.Right,
                VerticalAlignment = VerticalAlignment.Top,
                Margin = new Thickness(0, 8, 14, 0),
                IsHitTestVisible = false,
                RenderTransformOrigin = new Point(0.5, 0.5),
                Child = _jarText,
            };
            _jar.RenderTransform = new ScaleTransform(1, 1);
            Grid.SetRowSpan(_jar, 3);
            root.Children.Add(_jar);

            _fxLayer = new Canvas { IsHitTestVisible = false };
            Grid.SetRowSpan(_fxLayer, 3);
            root.Children.Add(_fxLayer);

            _onStars = () => Dispatcher.Invoke(() => _jarText.Text = "⭐ " + RewardStore.Balance);
            RewardStore.Changed += _onStars;
            Unloaded += (s, e) => { RewardStore.Changed -= _onStars; DisarmHint(); };

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
        private Border _jar;
        private TextBlock _jarText;
        private Canvas _fxLayer;
        private Action _onStars;

        // ------------------------------------------------------------------
        //  💫 LE COUP DE POUCE AU REGARD : si l'enfant ne clique rien pendant
        //  un moment, la BONNE réponse se met à « respirer » doucement, puis la
        //  consigne est redite — un échafaudage qui s'efface dès qu'elle agit.
        //  Chaque jeu l'arme avec ArmHint(bonBouton, consigne).
        // ------------------------------------------------------------------
        private DispatcherTimer _hint;
        private FrameworkElement _hintTarget;
        private Func<string> _hintSay;
        private int _hintStage;

        protected void ArmHint(FrameworkElement target, Func<string> say = null)
        {
            DisarmHint();
            _hintTarget = target;
            _hintSay = say;
            _hintStage = 0;
            _hint = new DispatcherTimer { Interval = TimeSpan.FromSeconds(12) };
            _hint.Tick += (s, e) =>
            {
                if (Speech.IsBusy || Locked) return; // on n'interrompt pas la voix
                _hintStage++;
                PulseHint();
            };
            _hint.Start();
        }

        protected void DisarmHint()
        {
            try { _hint?.Stop(); } catch { }
            _hint = null;
            _hintTarget = null;
        }

        private void PulseHint()
        {
            var t = _hintTarget;
            if (t == null) return;
            // La cible « respire » : douce la première fois, plus franche ensuite.
            int reps = _hintStage == 1 ? 3 : 5;
            var pulse = new DoubleAnimation(1, 0.45, TimeSpan.FromMilliseconds(420))
            { AutoReverse = true, RepeatBehavior = new RepeatBehavior(reps), EasingFunction = new SineEase() };
            t.BeginAnimation(OpacityProperty, pulse);
            if (_hintStage == 1 && _hintSay != null) { try { Speak(_hintSay()); } catch { } }
            else if (_hintStage >= 2) Speak("Regarde ! C'est par ici !");
        }

        // L'étoile gagnée VOLE du centre de l'écran jusqu'à la tirelire.
        private void FlyStarToJar()
        {
            try
            {
                double w = ActualWidth, h = ActualHeight;
                if (w < 100 || h < 100) return;
                var star = new TextBlock { Text = "⭐", FontSize = 64, IsHitTestVisible = false, RenderTransformOrigin = new Point(0.5, 0.5) };
                Canvas.SetLeft(star, w / 2 - 32);
                Canvas.SetTop(star, h / 2 - 32);
                _fxLayer.Children.Add(star);
                double tx = w - 90, ty = 18;
                var ax = new DoubleAnimation(w / 2 - 32, tx, TimeSpan.FromMilliseconds(750))
                { EasingFunction = new SineEase { EasingMode = EasingMode.EaseIn } };
                var ay = new DoubleAnimationUsingKeyFrames { Duration = TimeSpan.FromMilliseconds(750) };
                ay.KeyFrames.Add(new SplineDoubleKeyFrame(h / 2 - 170, KeyTime.FromPercent(0.4), new KeySpline(0.2, 0.8, 0.4, 1)));
                ay.KeyFrames.Add(new SplineDoubleKeyFrame(ty, KeyTime.FromPercent(1), new KeySpline(0.5, 0, 0.8, 1)));
                var sc = new ScaleTransform(1, 1);
                star.RenderTransform = sc;
                var shrink = new DoubleAnimation(1.3, 0.5, TimeSpan.FromMilliseconds(750));
                ay.Completed += (s, e) =>
                {
                    _fxLayer.Children.Remove(star);
                    // La tirelire saute de joie.
                    var jsc = (ScaleTransform)_jar.RenderTransform;
                    var bump = new DoubleAnimation(1, 1.25, TimeSpan.FromMilliseconds(180))
                    { AutoReverse = true, EasingFunction = new SineEase() };
                    jsc.BeginAnimation(ScaleTransform.ScaleXProperty, bump);
                    jsc.BeginAnimation(ScaleTransform.ScaleYProperty, bump);
                };
                star.BeginAnimation(Canvas.LeftProperty, ax);
                star.BeginAnimation(Canvas.TopProperty, ay);
                sc.BeginAnimation(ScaleTransform.ScaleXProperty, shrink);
                sc.BeginAnimation(ScaleTransform.ScaleYProperty, shrink);
            }
            catch { }
        }

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

        // La petite oreille « écoute d'abord ! » là où le clic a été bloqué.
        private DateTime _lastCue = DateTime.MinValue;

        private void ShowListenCue(Point at)
        {
            if ((DateTime.Now - _lastCue).TotalMilliseconds < 600) return; // pas de spam
            _lastCue = DateTime.Now;
            var cue = new TextBlock { Text = "👂", FontSize = 54, IsHitTestVisible = false, RenderTransformOrigin = new Point(0.5, 0.5) };
            var sc = new ScaleTransform(0.4, 0.4);
            cue.RenderTransform = sc;
            Canvas.SetLeft(cue, at.X - 27);
            Canvas.SetTop(cue, at.Y - 70);
            _fxLayer.Children.Add(cue);
            var grow = new DoubleAnimation(0.4, 1.15, TimeSpan.FromMilliseconds(260))
            { AutoReverse = true, EasingFunction = new SineEase() };
            sc.BeginAnimation(ScaleTransform.ScaleXProperty, grow);
            sc.BeginAnimation(ScaleTransform.ScaleYProperty, grow);
            var fade = new DoubleAnimation(1, 0, TimeSpan.FromMilliseconds(400)) { BeginTime = TimeSpan.FromMilliseconds(450) };
            var captured = cue;
            fade.Completed += (s, e) => _fxLayer.Children.Remove(captured);
            cue.BeginAnimation(OpacityProperty, fade);
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

        private static readonly Random PraiseRng = new Random();

        protected void Celebrate()
        {
            RewardStore.Add(); // chaque réussite gagne une étoile ⭐
            Progress.Add(GetType().Name); // ... comptée dans le bilan parent
            DisarmHint();      // plus besoin d'aide : c'est gagné
            FlyStarToJar();    // ... qui VOLE dans la tirelire, sous ses yeux
            // La voix de PAPA/MAMAN dit bravo (si enregistrée dans les
            // réglages) — une fois sur trois, pour garder l'effet de surprise ;
            // la synthèse attend la fin avant de reprendre.
            if (PraiseRng.Next(3) == 0) VoiceBank.PlayPraise();
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
