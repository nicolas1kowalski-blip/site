using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Animation;
using MesPremiersJeux.Lib;

namespace MesPremiersJeux.Games
{
    /// <summary>
    /// « Le tour du monde » (MS) : les pays, leurs CAPITALES et leurs monuments
    /// célèbres. Trois actes : 1) DÉCOUVERTE en avion ✈️ (le drapeau dit son
    /// pays et sa capitale, le monument se présente), 2) « Où est la tour
    /// Eiffel ? » (retrouver le monument — l'erreur enseigne : « ça, c'est le
    /// Colisée, il est à Rome ! »), 3) associer le MONUMENT à son DRAPEAU.
    /// Les monuments sont des emojis — ou de VRAIES PHOTOS si le parent dépose
    /// lieu-france.png, lieu-italie.png… dans le dossier Images.
    /// </summary>
    public sealed class CapitalsGame : GameControl
    {
        private sealed class Place
        {
            public string Country;     // « la France »
            public string Capital;     // « Paris »
            public string Monument;    // « la tour Eiffel »
            public string In;          // « en France » / « au Japon »
            public string Emoji;       // repli visuel du monument
            public string Key;         // lieu-<key>.png (photo du parent)
            public int Flag;           // index FlagArt
        }

        private static readonly Place[] Places =
        {
            new Place { Country = "la France", In = "en France", Capital = "Paris", Monument = "la tour Eiffel", Emoji = "🗼", Key = "france", Flag = 0 },
            new Place { Country = "l'Angleterre", In = "en Angleterre", Capital = "Londres", Monument = "Big Ben, la grande horloge", Emoji = "💂", Key = "angleterre", Flag = 1 },
            new Place { Country = "l'Italie", In = "en Italie", Capital = "Rome", Monument = "le Colisée", Emoji = "🏛️", Key = "italie", Flag = 2 },
            new Place { Country = "l'Égypte", In = "en Égypte", Capital = "Le Caire", Monument = "les pyramides", Emoji = "🐫", Key = "egypte", Flag = 3 },
            new Place { Country = "la Russie", In = "en Russie", Capital = "Moscou", Monument = "la cathédrale aux bulbes de toutes les couleurs", Emoji = "🏰", Key = "russie", Flag = 4 },
            new Place { Country = "la Chine", In = "en Chine", Capital = "Pékin", Monument = "la Cité interdite, le palais de l'empereur", Emoji = "🏯", Key = "chine", Flag = 5 },
            new Place { Country = "le Japon", In = "au Japon", Capital = "Tokyo", Monument = "le mont Fuji, la montagne au chapeau de neige", Emoji = "⛩️", Key = "japon", Flag = 6 },
            new Place { Country = "l'Amérique", In = "en Amérique", Capital = "Washington", Monument = "la statue de la Liberté", Emoji = "🗽", Key = "amerique", Flag = 7 },
        };

        private readonly Random _rng = new Random();
        private int _act;      // 1 découverte · 2 trouve le monument · 3 trouve le drapeau
        private int _round;
        private List<Place> _order;

        public CapitalsGame(Action celebrate) : base(celebrate) { }

        protected override void NewRound()
        {
            _act = 1;
            _round = 0;
            _order = Places.OrderBy(p => _rng.Next()).ToList();
            Next();
        }

        private void Next()
        {
            Locked = false;
            _round++;
            if (_act == 1 && _round > 3) { _act = 2; _round = 1; }
            else if (_act == 2 && _round > 3) { _act = 3; _round = 1; }
            else if (_act == 3 && _round > 3)
            {
                Question.Text = "🌍 Quel beau voyage !";
                Speak("Bravo ! Tu as fait le tour du monde ! Quel beau voyage !");
                GameKit.Success();
                Celebrate();
                Schedule(3200, NewRound);
                return;
            }

            var p = _order[(_round - 1 + (_act - 1) * 3) % _order.Count];
            switch (_act)
            {
                case 1: Discover(p); break;
                case 2: FindMonument(p); break;
                default: FindFlag(p); break;
            }
        }

        // Le visuel d'un monument : photo du parent (lieu-<key>.png) sinon emoji.
        private static FrameworkElement Monument(Place p, double size)
            => Art.Visual("lieu-" + p.Key, p.Emoji, size);

        // ------------------------------------------------------------------
        //  Acte 1 : la DÉCOUVERTE en avion
        // ------------------------------------------------------------------
        private void Discover(Place p)
        {
            Question.Text = "🌍 Le tour du monde";
            SetConsigne(new TextBlock { Text = "✈️🌍" },
                () => "On visite " + p.Country + " ! Regarde le drapeau, puis le monument : ils te racontent !");

            var plane = new TextBlock { Text = "✈️", FontSize = 90, HorizontalAlignment = HorizontalAlignment.Center, RenderTransformOrigin = new Point(0.5, 0.5) };
            var tt = new TranslateTransform();
            plane.RenderTransform = tt;
            var fly = new DoubleAnimation(-40, 40, TimeSpan.FromSeconds(2.4))
            { AutoReverse = true, RepeatBehavior = RepeatBehavior.Forever, EasingFunction = new SineEase { EasingMode = EasingMode.EaseInOut } };
            tt.BeginAnimation(TranslateTransform.XProperty, fly);

            bool sawFlag = false, sawMonu = false;
            void CheckDone()
            {
                if (!sawFlag || !sawMonu) return;
                Locked = true;
                Speak("Direction le pays suivant ! Accroche ta ceinture !");
                // L'avion décolle pour de vrai vers la droite de l'écran.
                SoundFx.Whistle();
                var off = new DoubleAnimation(0, 1000, TimeSpan.FromMilliseconds(1600))
                { BeginTime = TimeSpan.FromMilliseconds(600), EasingFunction = new SineEase { EasingMode = EasingMode.EaseIn } };
                tt.BeginAnimation(TranslateTransform.XProperty, off);
                Schedule(2400, Next);
            }

            var flagBtn = AnswerButton(FlagArt.Make(p.Flag, 290), 340);
            flagBtn.Click += (s, e) =>
            {
                if (Locked) return;
                Pop(flagBtn);
                Speak("C'est le drapeau de " + p.Country + " ! Sa capitale, c'est " + p.Capital + " !");
                sawFlag = true;
                CheckDone();
            };

            var monuBtn = AnswerButton(new StackPanel
            {
                Children =
                {
                    new ContentControl { Content = Monument(p, 220), HorizontalAlignment = HorizontalAlignment.Center },
                    new TextBlock
                    {
                        Text = p.Capital,
                        FontSize = 34,
                        FontWeight = FontWeights.Bold,
                        Foreground = new SolidColorBrush(Color.FromRgb(0x1F, 0x3A, 0x5A)),
                        HorizontalAlignment = HorizontalAlignment.Center,
                        Margin = new Thickness(0, 6, 0, 0),
                    },
                },
            }, 340);
            monuBtn.Click += (s, e) =>
            {
                if (Locked) return;
                Pop(monuBtn);
                Speak("Voici " + p.Monument + " ! C'est à " + p.Capital + ", " + p.In + " !");
                sawMonu = true;
                CheckDone();
            };

            var row = Row();
            row.Children.Add(flagBtn);
            row.Children.Add(plane);
            row.Children.Add(monuBtn);
            SetBody(row);
            Speak("Le tour du monde ! Aujourd'hui, on visite " + p.Country + " ! Regarde le drapeau et le monument !");
        }

        // ------------------------------------------------------------------
        //  Acte 2 : « Où est la tour Eiffel ? »
        // ------------------------------------------------------------------
        private void FindMonument(Place target)
        {
            Question.Text = "🔍 Où est " + target.Monument + " ?";
            SetConsigne(FlagArt.Make(target.Flag, 150),
                () => "Trouve " + target.Monument + " ! C'est à " + target.Capital + ", le pays de ce drapeau !");

            var choices = Pick(target);
            var row = Row();
            Button correctBtn = null;
            foreach (var p in choices)
            {
                var pp = p;
                var btn = AnswerButton(new ContentControl { Content = Monument(pp, 220) }, 300);
                if (pp == target) correctBtn = btn;
                btn.Click += (s, e) =>
                {
                    if (Locked) return;
                    if (pp == target)
                    {
                        Adaptive.Report("capitales", true);
                        Locked = true;
                        Pop(btn);
                        GameKit.Success();
                        Speak("Oui ! " + Cap(target.Monument) + ", à " + target.Capital + " ! Bravo !");
                        Celebrate();
                        Schedule(2600, Next);
                    }
                    else
                    {
                        // L'erreur enseigne : ce monument-là a aussi son histoire.
                        Adaptive.Report("capitales", false);
                        Shake(btn);
                        Speak("Ça, c'est " + pp.Monument + "... c'est à " + pp.Capital + " ! Cherche " + target.Monument + " !");
                    }
                };
                row.Children.Add(btn);
            }
            SetBody(row);
            ArmHint(correctBtn, () => "Cherche " + target.Monument + " !");
            Speak("Où est " + target.Monument + " ?");
        }

        // ------------------------------------------------------------------
        //  Acte 3 : le monument cherche SON drapeau
        // ------------------------------------------------------------------
        private void FindFlag(Place target)
        {
            Question.Text = "🚩 Trouve le drapeau !";
            SetConsigne(new ContentControl { Content = Monument(target, 150) },
                () => Cap(target.Monument) + " est à " + target.Capital + ", " + target.In +
                      " ! Trouve le drapeau de " + target.Country + " !");

            var choices = Pick(target);
            var row = Row();
            Button correctBtn = null;
            foreach (var p in choices)
            {
                var pp = p;
                var btn = AnswerButton(FlagArt.Make(pp.Flag, 250), 300);
                if (pp == target) correctBtn = btn;
                btn.Click += (s, e) =>
                {
                    if (Locked) return;
                    if (pp == target)
                    {
                        Adaptive.Report("capitales", true);
                        Locked = true;
                        Pop(btn);
                        GameKit.Success();
                        Speak("Oui ! Le drapeau de " + target.Country + " ! " + Cap(target.Monument) + " est bien à " + target.Capital + " !");
                        Celebrate();
                        Schedule(2800, Next);
                    }
                    else
                    {
                        Adaptive.Report("capitales", false);
                        Shake(btn);
                        Speak("Ça, c'est le drapeau de " + pp.Country + " ! Cherche celui de " + target.Country + " !");
                    }
                };
                row.Children.Add(btn);
            }
            SetBody(row);
            ArmHint(correctBtn, () => "Cherche le drapeau de " + target.Country + " !");
            Speak(Cap(target.Monument) + " ! Trouve le drapeau de son pays : " + target.Country + " !");
        }

        // ADAPTATION : 2 choix au niveau 0, 3 ensuite.
        private List<Place> Pick(Place target)
        {
            int n = Adaptive.Level("capitales") == 0 ? 1 : 2;
            var others = Places.Where(p => p != target).OrderBy(p => _rng.Next()).Take(n);
            return others.Concat(new[] { target }).OrderBy(p => _rng.Next()).ToList();
        }

        private static void Pop(FrameworkElement el)
        {
            el.RenderTransformOrigin = new Point(0.5, 0.5);
            var sc = new ScaleTransform(1, 1);
            el.RenderTransform = sc;
            var pop = new DoubleAnimation(1, 1.14, TimeSpan.FromMilliseconds(260))
            { AutoReverse = true, EasingFunction = new SineEase() };
            sc.BeginAnimation(ScaleTransform.ScaleXProperty, pop);
            sc.BeginAnimation(ScaleTransform.ScaleYProperty, pop);
        }

        private static string Cap(string s) => char.ToUpperInvariant(s[0]) + s.Substring(1);
    }
}
