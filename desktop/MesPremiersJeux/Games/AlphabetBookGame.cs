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
    /// « L'abécédaire » (PS/MS) : un livre des 26 lettres à feuilleter au regard.
    /// Sur chaque page : la lettre géante (elle dit son NOM), le bouton 👂 qui
    /// fait entendre son SON (phonologie : « le B fait beuh ! »), et ses MOTS en
    /// images (« Avion ! Ça commence par A ! »). Quand la page est entièrement
    /// explorée, la lettre gagne son ⭐. Découverte pure : aucun échec possible.
    /// </summary>
    public sealed class AlphabetBookGame : GameControl
    {
        private const double W = 1400, H = 680;

        private sealed class Page
        {
            public string L;                       // « A »
            public string Phon;                    // le son (« aaa », « beuh »…)
            public (string Word, string Emoji)[] Words;
        }

        private static readonly Page[] Book =
        {
            new Page { L = "A", Phon = "aaa", Words = new[] { ("avion", "✈️"), ("abeille", "🐝"), ("ananas", "🍍") } },
            new Page { L = "B", Phon = "beuh", Words = new[] { ("ballon", "🎈"), ("banane", "🍌"), ("bateau", "⛵") } },
            new Page { L = "C", Phon = "keuh", Words = new[] { ("canard", "🦆"), ("carotte", "🥕"), ("cadeau", "🎁") } },
            new Page { L = "D", Phon = "deuh", Words = new[] { ("dauphin", "🐬"), ("dinosaure", "🦖"), ("dé", "🎲") } },
            new Page { L = "E", Phon = "euh", Words = new[] { ("éléphant", "🐘"), ("escargot", "🐌"), ("étoile", "⭐") } },
            new Page { L = "F", Phon = "ffff", Words = new[] { ("fleur", "🌸"), ("fraise", "🍓"), ("fusée", "🚀") } },
            new Page { L = "G", Phon = "gueuh", Words = new[] { ("gâteau", "🎂"), ("gorille", "🦍"), ("gants", "🧤") } },
            new Page { L = "H", Phon = "", Words = new[] { ("hibou", "🦉"), ("hérisson", "🦔"), ("hélicoptère", "🚁") } },
            new Page { L = "I", Phon = "iii", Words = new[] { ("île", "🏝️"), ("iguane", "🦎") } },
            new Page { L = "J", Phon = "jeuh", Words = new[] { ("jouet", "🧸"), ("jardin", "🌷"), ("jus", "🧃") } },
            new Page { L = "K", Phon = "keuh", Words = new[] { ("koala", "🐨"), ("kiwi", "🥝"), ("kangourou", "🦘") } },
            new Page { L = "L", Phon = "llll", Words = new[] { ("lion", "🦁"), ("lune", "🌙"), ("lapin", "🐰") } },
            new Page { L = "M", Phon = "mmmm", Words = new[] { ("maison", "🏠"), ("mouton", "🐑"), ("moto", "🏍️") } },
            new Page { L = "N", Phon = "nnnn", Words = new[] { ("nuage", "☁️"), ("nid", "🪺"), ("noix", "🌰") } },
            new Page { L = "O", Phon = "ooo", Words = new[] { ("orange", "🍊"), ("oiseau", "🐦"), ("ours", "🐻") } },
            new Page { L = "P", Phon = "peuh", Words = new[] { ("papillon", "🦋"), ("pomme", "🍎"), ("poisson", "🐟") } },
            new Page { L = "Q", Phon = "keuh", Words = new[] { ("quatre", "4️⃣"), ("quille", "🎳") } },
            new Page { L = "R", Phon = "rrre", Words = new[] { ("robot", "🤖"), ("renard", "🦊"), ("raisin", "🍇") } },
            new Page { L = "S", Phon = "ssss", Words = new[] { ("soleil", "☀️"), ("serpent", "🐍"), ("sirène", "🧜") } },
            new Page { L = "T", Phon = "teuh", Words = new[] { ("tortue", "🐢"), ("train", "🚂"), ("tomate", "🍅") } },
            new Page { L = "U", Phon = "uuu", Words = new[] { ("un", "1️⃣"), ("univers", "🌌") } },
            new Page { L = "V", Phon = "vvve", Words = new[] { ("vélo", "🚲"), ("vache", "🐮"), ("voiture", "🚗") } },
            new Page { L = "W", Phon = "oua", Words = new[] { ("wagon", "🚃"), ("wapiti", "🦌") } },
            new Page { L = "X", Phon = "ksss", Words = new[] { ("xylophone", "🎵") } },
            new Page { L = "Y", Phon = "iii", Words = new[] { ("yoyo", "🪀"), ("yaourt", "🥣") } },
            new Page { L = "Z", Phon = "zzzz", Words = new[] { ("zèbre", "🦓"), ("zéro", "0️⃣") } },
        };

        private static readonly Color[] Rainbow =
        {
            Color.FromRgb(0xFF, 0x5F, 0x6D), Color.FromRgb(0xFF, 0x9F, 0x45),
            Color.FromRgb(0xFF, 0xC1, 0x07), Color.FromRgb(0x6B, 0xCB, 0x77),
            Color.FromRgb(0x3B, 0x9B, 0xFF), Color.FromRgb(0xA0, 0x6C, 0xD5),
            Color.FromRgb(0xFF, 0x6F, 0xB5),
        };

        private Canvas _canvas;
        private int _idx;
        private readonly bool[] _starred = new bool[26];
        // Exploration de la page en cours : nom, son, chaque mot.
        private bool _gotName, _gotSound;
        private bool[] _gotWords;
        private TextBlock _progress;

        public AlphabetBookGame(Action celebrate) : base(celebrate) { }

        protected override void NewRound()
        {
            _idx = 0;
            BuildPage(speakIntro: true);
        }

        private Color PageColor => Rainbow[_idx % Rainbow.Length];

        private void BuildPage(bool speakIntro = false)
        {
            var page = Book[_idx];
            _gotName = _gotSound = false;
            _gotWords = new bool[page.Words.Length];
            Locked = false;
            Question.Text = "📖 L'abécédaire — la lettre " + page.L;
            _canvas = new Canvas { Width = W, Height = H };

            // Flèches pour tourner les pages (le livre boucle).
            AddArrow("◀", 20, () => { _idx = (_idx + 25) % 26; BuildPage(); });
            AddArrow("▶", W - 160, () => { _idx = (_idx + 1) % 26; BuildPage(); });

            // La lettre géante « A a » : la regarder dit son NOM.
            var letterCard = new Button
            {
                Style = (Style)Application.Current.Resources["AnswerButton"],
                Width = 380,
                Height = 300,
                RenderTransformOrigin = new Point(0.5, 0.5),
                Content = new TextBlock
                {
                    Text = page.L + " " + page.L.ToLowerInvariant(),
                    FontSize = 170,
                    FontWeight = FontWeights.ExtraBold,
                    Foreground = new SolidColorBrush(PageColor),
                    HorizontalAlignment = HorizontalAlignment.Center,
                    VerticalAlignment = VerticalAlignment.Center,
                },
            };
            var captLetter = letterCard;
            letterCard.Click += (s, e) =>
            {
                if (Locked) return;
                Pop(captLetter);
                Speak(page.L + " ! La lettre " + page.L + " !");
                _gotName = true;
                CheckPageDone();
            };
            Canvas.SetLeft(letterCard, 300);
            Canvas.SetTop(letterCard, 30);
            _canvas.Children.Add(letterCard);

            // Le bouton 👂 : le SON de la lettre (phonologie).
            var soundBtn = new Button
            {
                Style = (Style)Application.Current.Resources["AnswerButton"],
                Width = 240,
                Height = 300,
                RenderTransformOrigin = new Point(0.5, 0.5),
                Content = new StackPanel
                {
                    HorizontalAlignment = HorizontalAlignment.Center,
                    VerticalAlignment = VerticalAlignment.Center,
                    Children =
                    {
                        new TextBlock { Text = "👂", FontSize = 110, HorizontalAlignment = HorizontalAlignment.Center },
                        new TextBlock
                        {
                            Text = "son bruit",
                            FontSize = 26,
                            FontWeight = FontWeights.Bold,
                            Foreground = new SolidColorBrush(Color.FromRgb(0x3B, 0x2A, 0x5A)),
                            HorizontalAlignment = HorizontalAlignment.Center,
                        },
                    },
                },
            };
            var captSound = soundBtn;
            soundBtn.Click += (s, e) =>
            {
                if (Locked) return;
                Pop(captSound);
                Pop(captLetter);
                // Le son est dit LENTEMENT, isolé et répété trois fois : c'est
                // lui que l'enfant doit entendre distinctement.
                if (page.L == "H")
                    Speech.SaySlow("Écoute bien ! Le H ne fait pas de bruit : il est muet ! Chut !");
                else
                    Speech.SaySlow("Écoute bien le " + page.L + "... " + page.Phon + ". ... " + page.Phon + ". ... " + page.Phon + " !");
                _gotSound = true;
                CheckPageDone();
            };
            Canvas.SetLeft(soundBtn, 720);
            Canvas.SetTop(soundBtn, 30);
            _canvas.Children.Add(soundBtn);

            // Les MOTS de la lettre, en images.
            double wsize = 250, wgap = 46;
            double wx0 = (W - page.Words.Length * wsize - (page.Words.Length - 1) * wgap) / 2;
            for (int i = 0; i < page.Words.Length; i++)
            {
                var (word, emoji) = page.Words[i];
                var btn = new Button
                {
                    Style = (Style)Application.Current.Resources["AnswerButton"],
                    Width = wsize,
                    Height = wsize,
                    RenderTransformOrigin = new Point(0.5, 0.5),
                    Content = new StackPanel
                    {
                        HorizontalAlignment = HorizontalAlignment.Center,
                        VerticalAlignment = VerticalAlignment.Center,
                        Children =
                        {
                            new TextBlock { Text = emoji, FontSize = 118, HorizontalAlignment = HorizontalAlignment.Center },
                            new TextBlock
                            {
                                Text = word,
                                FontSize = 27,
                                FontWeight = FontWeights.Bold,
                                Foreground = new SolidColorBrush(PageColor),
                                HorizontalAlignment = HorizontalAlignment.Center,
                            },
                        },
                    },
                };
                int wi = i;
                var captBtn = btn;
                btn.Click += (s, e) =>
                {
                    if (Locked) return;
                    Pop(captBtn);
                    Speak(Cap(word) + " ! " + Cap(word) + ", ça commence par " + page.L + " !");
                    _gotWords[wi] = true;
                    CheckPageDone();
                };
                Canvas.SetLeft(btn, wx0 + i * (wsize + wgap));
                Canvas.SetTop(btn, 372);
                _canvas.Children.Add(btn);
            }

            // Progression + aide vocale.
            _progress = new TextBlock
            {
                Text = "⭐ " + _starred.Count(v => v) + " / 26",
                FontSize = 30,
                FontWeight = FontWeights.Bold,
                Foreground = new SolidColorBrush(Color.FromRgb(0x3B, 0x2A, 0x5A)),
            };
            Canvas.SetLeft(_progress, W - 190);
            Canvas.SetTop(_progress, 8);
            _canvas.Children.Add(_progress);

            var speaker = SpeakerButton(() => "C'est la page du " + page.L + " ! Regarde la lettre, l'oreille pour son bruit, et ses images. Les flèches tournent les pages !", 96);
            Canvas.SetLeft(speaker, W - 140);
            Canvas.SetTop(speaker, 60);
            _canvas.Children.Add(speaker);

            if (_starred[_idx])
            {
                var done = new TextBlock { Text = "⭐", FontSize = 56, IsHitTestVisible = false };
                Canvas.SetLeft(done, 640);
                Canvas.SetTop(done, 10);
                _canvas.Children.Add(done);
            }

            SetBody(_canvas);
            Speak(speakIntro
                ? "L'abécédaire ! Le livre des lettres. Voici la lettre " + page.L + " !"
                : "La lettre " + page.L + " !");
        }

        private void AddArrow(string glyph, double x, Action go)
        {
            var btn = new Button
            {
                Style = (Style)Application.Current.Resources["AnswerButton"],
                Width = 140,
                Height = 260,
                FontSize = 64,
                Content = glyph,
            };
            btn.Click += (s, e) => { if (!Locked) go(); };
            Canvas.SetLeft(btn, x);
            Canvas.SetTop(btn, 180);
            _canvas.Children.Add(btn);
        }

        // La page est-elle entièrement explorée ? → ⭐ et petite fête.
        private void CheckPageDone()
        {
            if (_starred[_idx] || !_gotName || !_gotSound || !_gotWords.All(v => v)) return;
            _starred[_idx] = true;
            RewardStore.Add();
            _progress.Text = "⭐ " + _starred.Count(v => v) + " / 26";
            GameKit.Success();
            Celebrate();
            var page = Book[_idx];
            Speak("Bravo ! Tu connais tout du " + page.L + " ! Tourne la page quand tu veux !");
            var star = new TextBlock { Text = "⭐", FontSize = 56, IsHitTestVisible = false, RenderTransformOrigin = new Point(0.5, 0.5) };
            var sc = new ScaleTransform(0.2, 0.2);
            star.RenderTransform = sc;
            Canvas.SetLeft(star, 640);
            Canvas.SetTop(star, 10);
            star.SetValue(Panel.ZIndexProperty, 80);
            _canvas.Children.Add(star);
            var pop = new DoubleAnimation(0.2, 1, TimeSpan.FromMilliseconds(500))
            { EasingFunction = new BackEase { EasingMode = EasingMode.EaseOut, Amplitude = 0.8 } };
            sc.BeginAnimation(ScaleTransform.ScaleXProperty, pop);
            sc.BeginAnimation(ScaleTransform.ScaleYProperty, pop);
        }

        private static void Pop(FrameworkElement el)
        {
            var sc = new ScaleTransform(1, 1);
            el.RenderTransform = sc;
            var pop = new DoubleAnimation(1, 1.16, TimeSpan.FromMilliseconds(260))
            { AutoReverse = true, EasingFunction = new SineEase() };
            sc.BeginAnimation(ScaleTransform.ScaleXProperty, pop);
            sc.BeginAnimation(ScaleTransform.ScaleYProperty, pop);
        }

        private static string Cap(string s) => char.ToUpperInvariant(s[0]) + s.Substring(1);
    }
}
