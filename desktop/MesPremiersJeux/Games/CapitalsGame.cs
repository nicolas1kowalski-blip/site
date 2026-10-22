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
    /// « Le tour du monde » (MS) : 28 pays, chacun avec TROIS choses bien
    /// séparées — son DRAPEAU, sa CAPITALE (la ville-étoile, comme sur les
    /// cartes) et son MONUMENT. Elles ne sont jamais mélangées : la capitale
    /// n'est pas dite avec le monument, le monument est dit avec son pays.
    /// Chaque partie visite 4 pays (les suivants à la partie d'après), puis
    /// joue avec eux : trouve le drapeau, trouve le monument, trouve la capitale.
    /// </summary>
    public sealed class CapitalsGame : GameControl
    {
        private sealed class Place
        {
            public string Country;     // « la France »
            public string Of;          // « de la France » / « du Japon » / « des Pays-Bas »
            public string In;          // « en France » / « au Japon » / « aux Pays-Bas »
            public string Capital;     // « Paris »
            public string Monument;    // « la tour Eiffel »
            public string Img;         // dessin du monument (Images\)
            public int Flag;           // index FlagArt
        }

        private static Place P(int flag, string country, string of, string inn, string capital, string monument, string img) =>
            new Place { Flag = flag, Country = country, Of = of, In = inn, Capital = capital, Monument = monument, Img = img };

        private static readonly Place[] Places =
        {
            P(0, "la France", "de la France", "en France", "Paris", "la tour Eiffel", "lieu-france"),
            P(1, "l'Angleterre", "de l'Angleterre", "en Angleterre", "Londres", "Big Ben, la grande horloge", "lieu-angleterre"),
            P(2, "l'Italie", "de l'Italie", "en Italie", "Rome", "le Colisée", "lieu-italie"),
            P(3, "l'Égypte", "de l'Égypte", "en Égypte", "Le Caire", "les pyramides", "lieu-egypte"),
            P(4, "la Russie", "de la Russie", "en Russie", "Moscou", "la cathédrale aux bulbes de toutes les couleurs", "lieu-russie"),
            P(5, "la Chine", "de la Chine", "en Chine", "Pékin", "la Cité interdite, le palais de l'empereur", "lieu-chine"),
            P(6, "le Japon", "du Japon", "au Japon", "Tokyo", "le mont Fuji, la montagne au chapeau de neige", "lieu-japon"),
            P(7, "l'Amérique", "de l'Amérique", "en Amérique", "Washington", "la statue de la Liberté", "lieu-amerique"),
            P(8, "l'Espagne", "de l'Espagne", "en Espagne", "Madrid", "l'Alhambra, le grand palais", "monument-alhambra"),
            P(9, "l'Allemagne", "de l'Allemagne", "en Allemagne", "Berlin", "la porte de Brandebourg", "monument-porte-brandebourg"),
            P(10, "la Grèce", "de la Grèce", "en Grèce", "Athènes", "le Parthénon, le temple aux colonnes", "monument-parthenon"),
            P(11, "l'Inde", "de l'Inde", "en Inde", "New Delhi", "le Taj Mahal, le palais tout blanc", "monument-taj-mahal"),
            P(12, "le Brésil", "du Brésil", "au Brésil", "Brasilia", "la grande statue aux bras ouverts", "monument-christ-redempteur"),
            P(13, "le Mexique", "du Mexique", "au Mexique", "Mexico", "la pyramide de Chichén Itzá", "monument-chichen-itza"),
            P(14, "l'Australie", "de l'Australie", "en Australie", "Canberra", "l'opéra de Sydney, comme des voiles de bateau", "monument-opera-sydney"),
            P(15, "la Turquie", "de la Turquie", "en Turquie", "Ankara", "la mosquée bleue", "monument-mosquee-bleue"),
            P(16, "les Pays-Bas", "des Pays-Bas", "aux Pays-Bas", "Amsterdam", "les moulins à vent", "monument-moulins"),
            P(17, "la Belgique", "de la Belgique", "en Belgique", "Bruxelles", "l'Atomium, les grosses boules d'argent", "monument-atomium"),
            P(18, "le Danemark", "du Danemark", "au Danemark", "Copenhague", "la petite sirène", "monument-petite-sirene"),
            P(19, "le Pérou", "du Pérou", "au Pérou", "Lima", "le Machu Picchu, la ville dans les montagnes", "monument-machu-picchu"),
            P(20, "le Cambodge", "du Cambodge", "au Cambodge", "Phnom Penh", "le temple d'Angkor", "monument-angkor-wat"),
            P(21, "la Corée du Sud", "de la Corée du Sud", "en Corée du Sud", "Séoul", "la tour de Séoul", "monument-tour-seoul"),
            P(22, "la Suisse", "de la Suisse", "en Suisse", "Berne", "le château de Chillon, au bord du lac", "monument-chateau-chillon"),
            P(23, "le Mali", "du Mali", "au Mali", "Bamako", "la mosquée de Djenné, toute en terre", "monument-mosquee-djenne"),
            P(24, "la Tunisie", "de la Tunisie", "en Tunisie", "Tunis", "les ruines de Carthage", "monument-carthage"),
            P(25, "le Portugal", "du Portugal", "au Portugal", "Lisbonne", "le château d'Almourol", "monument-chateau-almourol"),
            P(26, "la Tanzanie", "de la Tanzanie", "en Tanzanie", "Dodoma", "le Kilimandjaro, la plus haute montagne d'Afrique", "monument-kilimandjaro"),
            P(27, "le Chili", "du Chili", "au Chili", "Santiago", "les moaïs, les grandes têtes de pierre", "monument-moai"),
        };

        private const int PerGame = 4;           // pays visités par partie
        private static List<Place> _deck;        // ordre de visite, gardé d'une partie à l'autre
        private static int _cursor;

        private readonly Random _rng = new Random();
        private List<Place> _session;
        private int _act;      // 1 découverte · 2 drapeau · 3 monument · 4 capitale
        private int _round;
        private Place _last;

        public CapitalsGame(Action celebrate) : base(celebrate) { }

        protected override void NewRound()
        {
            // Tous les pays défilent, 4 par partie, avant de recommencer.
            if (_deck == null || _cursor + PerGame > _deck.Count)
            {
                _deck = Places.OrderBy(p => _rng.Next()).ToList();
                _cursor = 0;
            }
            _session = _deck.Skip(_cursor).Take(PerGame).ToList();
            _cursor += PerGame;
            _act = 1;
            _round = 0;
            _last = null;
            Next();
        }

        private void Next()
        {
            Locked = false;
            _round++;
            int rounds = _act == 1 ? _session.Count : 3;
            if (_round > rounds) { _act++; _round = 1; }
            if (_act > 4)
            {
                Question.Text = "🌍 Quel beau voyage !";
                Speak("Bravo ! Tu as fait le tour du monde ! Quel beau voyage !");
                GameKit.Success();
                Celebrate();
                Schedule(3200, NewRound);
                return;
            }
            switch (_act)
            {
                case 1: Discover(_session[_round - 1]); break;
                case 2: FindFlag(Target()); break;
                case 3: FindMonument(Target()); break;
                default: FindCapital(Target()); break;
            }
        }

        // Un pays de la partie, différent du précédent.
        private Place Target()
        {
            var pool = _session.Where(p => p != _last).ToList();
            _last = pool[_rng.Next(pool.Count)];
            return _last;
        }

        // Le monument dessiné (une photo du parent du même nom a la priorité).
        private static FrameworkElement Monument(Place p, double size) => Art.Visual(p.Img, "🏛️", size);

        // La CAPITALE : l'étoile (comme sur les cartes) et le nom de la ville.
        private static FrameworkElement CapitalCard(Place p, double size) => new StackPanel
        {
            Children =
            {
                new ContentControl { Content = Art.Visual("etoile", "⭐", size * 0.62), HorizontalAlignment = HorizontalAlignment.Center },
                new Viewbox
                {
                    StretchDirection = StretchDirection.DownOnly,
                    MaxWidth = size * 1.15,
                    Margin = new Thickness(0, 8, 0, 0),
                    Child = new TextBlock
                    {
                        Text = p.Capital,
                        FontSize = 42,
                        FontWeight = FontWeights.Bold,
                        Foreground = new SolidColorBrush(Color.FromRgb(0x1F, 0x3A, 0x5A)),
                    },
                },
            },
        };

        // ------------------------------------------------------------------
        //  Acte 1 : la DÉCOUVERTE — trois cartes, trois choses à apprendre
        // ------------------------------------------------------------------
        private void Discover(Place p)
        {
            Question.Text = "🌍 Le tour du monde";
            SetConsigne(Art.ForEmoji("✈️", 72),
                () => "On visite " + p.Country + " ! Regarde le drapeau, la capitale et le monument !");

            var plane = Art.ForEmoji("✈️", 110);
            plane.HorizontalAlignment = HorizontalAlignment.Center;
            var tt = new TranslateTransform();
            plane.RenderTransform = tt;
            tt.BeginAnimation(TranslateTransform.XProperty, new DoubleAnimation(-60, 60, TimeSpan.FromSeconds(2.4))
            { AutoReverse = true, RepeatBehavior = RepeatBehavior.Forever, EasingFunction = new SineEase { EasingMode = EasingMode.EaseInOut } });

            var seen = new bool[3];
            void Saw(int i, Button b)
            {
                if (!seen[i])
                {
                    seen[i] = true;
                    b.BorderBrush = new SolidColorBrush(Color.FromRgb(0x4C, 0xAF, 0x50));
                    b.BorderThickness = new Thickness(6);
                }
                if (seen.All(v => v))
                {
                    Locked = true;
                    Schedule(3800, () =>
                    {
                        Speak("Direction le pays suivant ! Accroche ta ceinture !");
                        SoundFx.Whistle();
                        tt.BeginAnimation(TranslateTransform.XProperty, new DoubleAnimation(0, 1400, TimeSpan.FromMilliseconds(1600))
                        { EasingFunction = new SineEase { EasingMode = EasingMode.EaseIn } });
                        Schedule(2200, Next);
                    });
                }
            }

            var flagBtn = AnswerButton(FlagArt.Make(p.Flag, 260), 320);
            flagBtn.Click += (s, e) =>
            {
                if (Locked) return;
                Pop(flagBtn);
                Speak("Voici le drapeau " + p.Of + " !");
                Saw(0, flagBtn);
            };

            var capBtn = AnswerButton(CapitalCard(p, 230), 320);
            capBtn.Click += (s, e) =>
            {
                if (Locked) return;
                Pop(capBtn);
                Speak("La capitale " + p.Of + ", c'est " + p.Capital + " ! C'est la ville la plus importante du pays.");
                Saw(1, capBtn);
            };

            var monuBtn = AnswerButton(new ContentControl { Content = Monument(p, 250) }, 320);
            monuBtn.Click += (s, e) =>
            {
                if (Locked) return;
                Pop(monuBtn);
                Speak("Voici " + p.Monument + " ! C'est " + p.In + " !");
                Saw(2, monuBtn);
            };

            var row = Row();
            row.Children.Add(flagBtn);
            row.Children.Add(capBtn);
            row.Children.Add(monuBtn);
            var stack = new StackPanel { Children = { plane, row } };
            SetBody(stack);
            Speak("Le tour du monde ! On visite " + p.Country + " ! Regarde le drapeau, la capitale, et le monument !");
        }

        // ------------------------------------------------------------------
        //  Les trois jeux : un seul savoir à chaque fois
        // ------------------------------------------------------------------
        private void FindFlag(Place target)
        {
            Question.Text = "🚩 Trouve le drapeau !";
            Quiz(target,
                ask: "Trouve le drapeau " + target.Of + " !",
                model: null,
                visual: pp => FlagArt.Make(pp.Flag, 250),
                good: "Oui ! Le drapeau " + target.Of + " ! Bravo !",
                wrong: pp => "Ça, c'est le drapeau " + pp.Of + " ! Cherche le drapeau " + target.Of + " !");
        }

        private void FindMonument(Place target)
        {
            Question.Text = "🔍 Trouve le monument !";
            Quiz(target,
                ask: "Trouve " + target.Monument + " !",
                model: null,
                visual: pp => new ContentControl { Content = Monument(pp, 230) },
                good: "Oui ! " + Cap(target.Monument) + " ! C'est " + target.In + " ! Bravo !",
                wrong: pp => "Ça, c'est " + pp.Monument + ", " + pp.In + " ! Cherche " + target.Monument + " !");
        }

        private void FindCapital(Place target)
        {
            Question.Text = "⭐ Trouve la capitale !";
            Quiz(target,
                ask: "La capitale " + target.Of + "... c'est " + target.Capital + " ! Trouve " + target.Capital + " !",
                model: FlagArt.Make(target.Flag, 150),
                visual: pp => CapitalCard(pp, 200),
                good: "Oui ! " + target.Capital + ", la capitale " + target.Of + " ! Bravo !",
                wrong: pp => "Ça, c'est " + pp.Capital + ", la capitale " + pp.Of + " ! Cherche " + target.Capital + " !");
        }

        private void Quiz(Place target, string ask, FrameworkElement model, Func<Place, FrameworkElement> visual,
                          string good, Func<Place, string> wrong)
        {
            SetConsigne(model, () => ask);
            var row = Row();
            Button correctBtn = null;
            foreach (var p in Pick(target))
            {
                var pp = p;
                var btn = AnswerButton(visual(pp), 300);
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
                        Speak(good);
                        Celebrate();
                        Schedule(3000, Next);
                    }
                    else
                    {
                        // L'erreur enseigne : on dit ce que c'était vraiment.
                        Adaptive.Report("capitales", false);
                        Shake(btn);
                        Speak(wrong(pp));
                    }
                };
                row.Children.Add(btn);
            }
            SetBody(row);
            ArmHint(correctBtn, () => ask);
            Speak(ask);
        }

        // ADAPTATION : 2 choix au niveau 0, 3 ensuite — pris parmi les pays
        // visités dans la partie.
        private List<Place> Pick(Place target)
        {
            int n = Adaptive.Level("capitales") == 0 ? 1 : 2;
            var others = _session.Where(p => p != target).OrderBy(p => _rng.Next()).Take(n);
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
