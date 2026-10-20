using System;
using System.Collections.Generic;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Threading;
using MesPremiersJeux.Games;
using MesPremiersJeux.Lib;

namespace MesPremiersJeux.Views
{
    /// <summary>
    /// 📅 LE PARCOURS DU JOUR : la séance rituelle en PICTOGRAMMES, pour que
    /// l'enfant sache toujours ce qui vient après (la prévisibilité rassure).
    /// Quatre étapes : un jeu magique → un apprentissage → un jeu → la
    /// boutique ⭐. La frise reste visible en haut : l'étape en cours respire,
    /// les étapes finies gagnent leur ✔. Une étape est finie après DEUX
    /// réussites (ou cinq minutes) — petite fanfare, et on avance.
    /// </summary>
    public sealed class ParcoursView : UserControl
    {
        public event Action ShopRequested;
        public event Action ExitRequested;

        private sealed class Step
        {
            public string Icon, Label, Say;
            public Func<Action, UserControl> Make; // null = la boutique
        }

        private readonly Random _rng = new Random();
        private readonly Grid _host;
        private readonly Canvas _fx;
        private readonly StackPanel _strip;
        private List<Step> _steps;
        private int _current;
        private int _starsInStep;
        private DispatcherTimer _stepTimeout;

        public ParcoursView()
        {
            var root = new Grid { Background = new SolidColorBrush(Color.FromRgb(0xF3, 0xE9, 0xFF)) };
            root.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
            root.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });

            // La FRISE des pictogrammes, toujours visible.
            var bar = new Border
            {
                Background = new LinearGradientBrush(Color.FromRgb(0xB3, 0x88, 0xFF), Color.FromRgb(0x8A, 0xD6, 0xFF), 0),
                Padding = new Thickness(10, 8, 10, 8),
            };
            var barRow = new DockPanel();
            var back = new Button
            {
                Style = (Style)Application.Current.Resources["BackButton"],
                Content = "⬅",
                MinWidth = 80,
            };
            back.Click += (s, e) => { StopStep(); Chrome.Immersive = false; ExitRequested?.Invoke(); };
            DockPanel.SetDock(back, Dock.Left);
            barRow.Children.Add(back);
            // Le bouton « Suivant » (cliquable au regard) : on peut TOUJOURS
            // passer à l'étape d'après sans attendre les réussites.
            var next = new Button
            {
                Style = (Style)Application.Current.Resources["BackButton"],
                Content = "Suivant  ▶",
                MinWidth = 150,
            };
            next.Click += (s, e) => { if (_current >= 0 && _current < _steps?.Count) StepDone(); };
            DockPanel.SetDock(next, Dock.Right);
            barRow.Children.Add(next);
            _strip = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Center };
            barRow.Children.Add(_strip);
            bar.Child = barRow;
            root.Children.Add(bar);

            _host = new Grid();
            Grid.SetRow(_host, 1);
            root.Children.Add(_host);

            // Le canevas des célébrations, par-dessus tout.
            _fx = new Canvas { IsHitTestVisible = false, ClipToBounds = true };
            Grid.SetRowSpan(_fx, 2);
            root.Children.Add(_fx);

            Content = root;
            Unloaded += (s, e) => StopStep();
            // Changer d'onglet pendant un parcours arrête proprement le jeu en cours.
            IsVisibleChanged += (s, e) => { if (!(bool)e.NewValue) StopStep(); };
        }

        // ------------------------------------------------------------------
        //  Composition du parcours (tirée au sort à chaque séance)
        // ------------------------------------------------------------------
        private Step Pick(params Step[] options) => options[_rng.Next(options.Length)];

        public void Start()
        {
            _steps = new List<Step>
            {
                Pick(
                    new Step { Icon = "🐦", Label = "Les oiseaux", Say = "les oiseaux chanteurs", Make = c => new BirdSongGame(c) },
                    new Step { Icon = "🎆", Label = "Feux d'artifice", Say = "les feux d'artifice", Make = c => new FireworksGame(c) },
                    new Step { Icon = "🧽", Label = "Fenêtre magique", Say = "la fenêtre magique", Make = c => new MagicWindowGame(c) },
                    new Step { Icon = "🥧", Label = "Les tartes", Say = "les tartes à la crème", Make = c => new PieFaceGame(c) }),
                Pick(
                    new Step { Icon = "🥁", Label = "Les syllabes", Say = "les syllabes", Make = c => new SyllableGame(c) },
                    new Step { Icon = "🏠", Label = "Maison des sons", Say = "la maison des sons", Make = c => new SoundHouseGame(c) },
                    new Step { Icon = "🧺", Label = "Le panier", Say = "le panier", Make = c => new CompleteGame(c) },
                    new Step { Icon = "🎲", Label = "Les nombres", Say = "le nombre dans tous ses états", Make = c => new NumberFormsGame(c) },
                    new Step { Icon = "🪐", Label = "Les planètes", Say = "les planètes", Make = c => new PlanetsGame(c) },
                    new Step { Icon = "🌍", Label = "Tour du monde", Say = "le tour du monde", Make = c => new CapitalsGame(c) }),
                Pick(
                    new Step { Icon = "🌑", Label = "Les ombres", Say = "les ombres", Make = c => new ShadowGame(c) },
                    new Step { Icon = "🃏", Label = "Les paires", Say = "les paires", Make = c => new MemoryGame(c) },
                    new Step { Icon = "🧩", Label = "Puzzle", Say = "le puzzle", Make = c => new PuzzleGame(c) },
                    new Step { Icon = "🌈", Label = "Couleurs", Say = "les couleurs", Make = c => new ColorsGame(c) }),
                new Step { Icon = "⭐", Label = "Boutique", Say = "ta boutique de récompenses", Make = null },
            };
            _current = -1;
            BuildStrip();
            Speech.Say("C'est l'heure de ton parcours ! Aujourd'hui : " +
                       _steps[0].Say + ", puis " + _steps[1].Say + ", puis " + _steps[2].Say +
                       "... et pour finir, la boutique ! C'est parti !");
            var t = new DispatcherTimer { Interval = TimeSpan.FromSeconds(7) };
            t.Tick += (s, e) => { t.Stop(); NextStep(); };
            t.Start();
        }

        private void BuildStrip()
        {
            _strip.Children.Clear();
            for (int i = 0; i < _steps.Count; i++)
            {
                if (i > 0)
                    _strip.Children.Add(new TextBlock { Text = "▶", FontSize = 26, Foreground = Brushes.White, VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(8, 0, 8, 0) });
                var s = _steps[i];
                var cell = new Border
                {
                    Background = Brushes.White,
                    CornerRadius = new CornerRadius(16),
                    Padding = new Thickness(14, 4, 14, 4),
                    Opacity = 0.55,
                    RenderTransformOrigin = new Point(0.5, 0.5),
                    Child = new StackPanel
                    {
                        Children =
                        {
                            new TextBlock { Text = s.Icon, FontSize = 38, HorizontalAlignment = HorizontalAlignment.Center },
                            new TextBlock { Text = s.Label, FontSize = 14, FontWeight = FontWeights.Bold,
                                Foreground = new SolidColorBrush(Color.FromRgb(0x3B, 0x2A, 0x5A)), HorizontalAlignment = HorizontalAlignment.Center },
                        },
                    },
                };
                cell.RenderTransform = new ScaleTransform(1, 1);
                _strip.Children.Add(cell);
            }
            RefreshStrip();
        }

        private void RefreshStrip()
        {
            int cellIdx = 0;
            for (int i = 0; i < _strip.Children.Count; i++)
            {
                if (!(_strip.Children[i] is Border cell)) continue;
                var sc = (ScaleTransform)cell.RenderTransform;
                sc.BeginAnimation(ScaleTransform.ScaleXProperty, null);
                sc.BeginAnimation(ScaleTransform.ScaleYProperty, null);
                sc.ScaleX = sc.ScaleY = 1;
                var stack = (StackPanel)cell.Child;
                var icon = (TextBlock)stack.Children[0];
                var step = _steps[cellIdx];
                if (cellIdx < _current)
                {
                    cell.Opacity = 1;
                    icon.Text = "✔";
                    icon.Foreground = new SolidColorBrush(Color.FromRgb(0x2A, 0x9A, 0x4A));
                }
                else
                {
                    icon.Text = step.Icon;
                    icon.Foreground = SystemColors.ControlTextBrush;
                    cell.Opacity = cellIdx == _current ? 1 : 0.55;
                    if (cellIdx == _current)
                    {
                        // L'étape en cours RESPIRE.
                        var breathe = new DoubleAnimation(1, 1.12, TimeSpan.FromSeconds(1.1))
                        { AutoReverse = true, RepeatBehavior = RepeatBehavior.Forever, EasingFunction = new SineEase { EasingMode = EasingMode.EaseInOut } };
                        sc.BeginAnimation(ScaleTransform.ScaleXProperty, breathe);
                        sc.BeginAnimation(ScaleTransform.ScaleYProperty, breathe);
                    }
                }
                cellIdx++;
            }
        }

        // ------------------------------------------------------------------
        //  L'enchaînement des étapes
        // ------------------------------------------------------------------
        private void NextStep()
        {
            StopStep();
            _current++;
            if (_current >= _steps.Count) return;
            RefreshStrip();
            var step = _steps[_current];

            if (step.Make == null)
            {
                // La dernière étape : LA BOUTIQUE !
                Chrome.Immersive = false;
                _host.Children.Clear();
                Speech.WhenQuiet(() =>
                {
                    Speech.Say("Ton parcours est fini ! Bravo ! Et maintenant... ta boutique !");
                    Speech.WhenQuiet(() => ShopRequested?.Invoke(), 3.2);
                }, 0, 6);
                return;
            }

            _starsInStep = 0;
            _host.Children.Clear();
            Speech.Say("Et maintenant... " + step.Say + " !");
            // Le jeu n'arrive qu'une fois l'annonce finie : sa consigne ne la coupe pas.
            int idx = _current;
            Speech.WhenQuiet(() =>
            {
                if (_current != idx || !IsVisible) return; // parcours quitté entre-temps
                try { _host.Children.Add(step.Make(OnStepCelebrate)); }
                catch { NextStep(); return; }
                Chrome.Immersive = true; // PLEIN ÉCRAN pendant le jeu (la frise reste)

                // Filet de sécurité : au bout de 3 minutes, on avance quand même.
                _stepTimeout = new DispatcherTimer { Interval = TimeSpan.FromMinutes(3) };
                _stepTimeout.Tick += (s, e) => StepDone();
                _stepTimeout.Start();
            }, 0.6, 5);
        }

        // Les jeux appellent ceci à chaque réussite (c'est leur « celebrate »).
        // Le jeu magique (étape 1) avance dès UNE réussite — ses victoires sont
        // longues à obtenir ; les autres étapes en demandent deux.
        private void OnStepCelebrate()
        {
            CelebrationKit.Play(_fx);
            _starsInStep++;
            int needed = _current == 0 ? 1 : 2;
            if (_starsInStep >= needed) StepDone();
        }

        private void StepDone()
        {
            StopStep();
            SoundFx.PopSound();
            // Le « Bravo ! » du jeu finit sa phrase, puis la frise, puis la suite.
            Speech.WhenQuiet(() =>
            {
                Speech.Say("Étape réussie ! Regarde ta frise !");
                Speech.WhenQuiet(NextStep, 2.4);
            }, 0, 6);
        }

        private void StopStep()
        {
            try { _stepTimeout?.Stop(); } catch { }
            _stepTimeout = null;
            _host.Children.Clear(); // décharge le jeu en cours (Unloaded)
        }
    }
}
