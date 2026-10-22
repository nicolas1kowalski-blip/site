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
    /// 🇬🇧 « Hello ! » (PS/MS) : les premiers mots d'anglais, en cinq actes.
    ///   1. HELLO ! — les petits mots (hello, bye-bye, yes, no) écrits avec les
    ///      lettres dessinées : on les entend en anglais, puis ce qu'ils veulent dire.
    ///   2. THE ANIMALS — six animaux : « Cat ! » … « Le chat, en anglais, c'est cat ! »
    ///   3. WHERE IS THE CAT ? — retrouver l'animal nommé en anglais, parmi trois.
    ///   4. COLOURS — red, blue, yellow, green ; puis « Show me red ! »
    ///   5. LET'S COUNT — one, two, three : combien de canards ?
    /// L'anglais est dit par la voix Azure anglaise (enfant) si elle est
    /// configurée, sinon par une voix anglaise de Windows, sinon par la voix
    /// française « à la française ».
    /// </summary>
    public sealed class EnglishGame : GameControl
    {
        private const double W = 1400, H = 680;

        private sealed class Word
        {
            public string En, Fr, Img, Emoji;
            public Word(string en, string fr, string img, string emoji) { En = en; Fr = fr; Img = img; Emoji = emoji; }
        }

        private static readonly Word[] Social =
        {
            new Word("Hello", "bonjour", null, "👋"),
            new Word("Bye-bye", "au revoir", null, "👋"),
            new Word("Yes", "oui", null, "👍"),
            new Word("No", "non", null, "👎"),
        };

        private static readonly Word[] Animals =
        {
            new Word("Cat", "le chat", "chat", "🐱"), new Word("Dog", "le chien", "chien", "🐶"),
            new Word("Fish", "le poisson", "poisson", "🐟"), new Word("Bird", "l'oiseau", "oiseau-1", "🐦"),
            new Word("Rabbit", "le lapin", "lapin", "🐰"), new Word("Cow", "la vache", "vache", "🐄"),
            new Word("Pig", "le cochon", "cochon", "🐷"), new Word("Duck", "le canard", "canard", "🦆"),
            new Word("Frog", "la grenouille", "grenouille", "🐸"), new Word("Lion", "le lion", "lion", "🦁"),
            new Word("Sheep", "le mouton", "mouton", "🐑"), new Word("Mouse", "la souris", "souris", "🐭"),
            new Word("Bear", "l'ours", "ours", "🐻"), new Word("Elephant", "l'éléphant", "elephant", "🐘"),
            new Word("Monkey", "le singe", "singe", "🐒"), new Word("Butterfly", "le papillon", "papillon", "🦋"),
            new Word("Turtle", "la tortue", "tortue", "🐢"), new Word("Horse", "le cheval", "cheval-a-bascule", "🐴"),
        };

        private sealed class Colour
        {
            public string En, Fr, Img, Emoji;
            public Color C;
        }

        private static readonly Colour[] Colours =
        {
            new Colour { En = "Red", Fr = "rouge", Img = "fraise", Emoji = "🍓", C = Color.FromRgb(0xFF, 0x5A, 0x5A) },
            new Colour { En = "Blue", Fr = "bleu", Img = "baleine", Emoji = "🐳", C = Color.FromRgb(0x4D, 0x9B, 0xFF) },
            new Colour { En = "Yellow", Fr = "jaune", Img = "banane", Emoji = "🍌", C = Color.FromRgb(0xFF, 0xE0, 0x3C) },
            new Colour { En = "Green", Fr = "vert", Img = "grenouille", Emoji = "🐸", C = Color.FromRgb(0x6F, 0xD6, 0x6F) },
        };

        private static readonly string[] NumEn = { "", "One", "Two", "Three" };
        private static readonly string[] NumFr = { "", "un", "deux", "trois" };

        private Canvas _canvas;
        private int _act;
        private bool[] _seen;
        private List<Word> _animals;
        private int _round;
        private Word _target;
        private Colour _colourTarget;
        private int _countTarget;

        private readonly int _startAct; // 1 = hello · 2 = les animaux · 4 = couleurs et nombres

        public EnglishGame(Action celebrate, int startAct = 1) : base(celebrate) { _startAct = startAct; }

        protected override void NewRound()
        {
            _animals = GameKit.Shuffle(Animals).Take(6).ToList();
            if (_startAct >= 4) StartColours();
            else if (_startAct >= 2) StartAnimals();
            else StartHello();
        }

        // L'anglais d'abord, puis le français quand la voix a fini.
        // En découverte (twice), le mot anglais est dit DEUX fois, bien séparées.
        private void En(string en, string fr, bool twice = false)
        {
            if (Closed) return;
            Speech.SayEnglish(en);
            Action french = () => { if (fr != null) Speech.WhenQuiet(() => { if (!Closed) Speak(fr); }, 0.3, 6); };
            if (twice) Speech.WhenQuiet(() => { if (Closed) return; Speech.SayEnglish(en); french(); }, 0.6, 6);
            else french();
        }

        // Le mot écrit avec les lettres dessinées (lettre-A … lettre-Z).
        private static FrameworkElement WordVisual(string word, double letterSize)
        {
            var row = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Center };
            foreach (var ch in word.ToUpperInvariant())
            {
                if (ch == ' ' || ch == '-') { row.Children.Add(new Border { Width = letterSize * 0.4 }); continue; }
                var src = Art.Find("lettre-" + ch);
                row.Children.Add(src != null
                    ? (FrameworkElement)new Image { Source = src, Height = letterSize, Margin = new Thickness(-letterSize * 0.08, 0, -letterSize * 0.08, 0) }
                    : new TextBlock { Text = ch.ToString(), FontSize = letterSize * 0.9, FontWeight = FontWeights.ExtraBold, Foreground = new SolidColorBrush(Color.FromRgb(0x3B, 0x2A, 0x5A)) });
            }
            return row;
        }

        private static TextBlock Label(string text, double size = 30, bool bold = true) => new TextBlock
        {
            Text = text, FontSize = size, FontWeight = bold ? FontWeights.Bold : FontWeights.Normal,
            Foreground = new SolidColorBrush(Color.FromRgb(0x3B, 0x2A, 0x5A)), HorizontalAlignment = HorizontalAlignment.Center,
            TextAlignment = TextAlignment.Center, TextWrapping = TextWrapping.Wrap,
        };

        private static FrameworkElement Flag() => new TextBlock { Text = "🇬🇧", FontSize = 60 };

        // ==================================================================
        // ACTE 1 — Hello !
        // ==================================================================
        private void StartHello()
        {
            _act = 1;
            Locked = false;
            _seen = new bool[Social.Length];
            Question.Text = "🇬🇧 Hello !";
            _canvas = new Canvas { Width = W, Height = H };

            double cw = 310, ch = 300, gap = 36;
            double x0 = (W - 4 * cw - 3 * gap) / 2;
            for (int i = 0; i < Social.Length; i++)
            {
                var w = Social[i];
                int idx = i;
                var content = new StackPanel { HorizontalAlignment = HorizontalAlignment.Center };
                content.Children.Add(new TextBlock { Text = w.Emoji, FontSize = 80, HorizontalAlignment = HorizontalAlignment.Center });
                content.Children.Add(WordVisual(w.En, 62));
                content.Children.Add(Label(w.Fr, 26, false));
                var btn = AnswerButton(new Viewbox { Child = content, Margin = new Thickness(16) }, cw);
                btn.Height = ch;
                var captured = btn;
                btn.Click += (o, ev) => HelloWord(captured, idx);
                Canvas.SetLeft(btn, x0 + i * (cw + gap));
                Canvas.SetTop(btn, 150);
                _canvas.Children.Add(btn);
            }

            SetConsigne(Flag(), () => "Regarde chaque mot pour l'entendre en anglais !");
            SetBody(_canvas);
            Schedule(450, () =>
            {
                Speak("On apprend l'anglais ! Écoute...");
                Schedule(1800, () => En("Hello!", "Hello, ça veut dire bonjour ! Regarde chaque mot pour l'entendre."));
            });
        }

        private void HelloWord(Button btn, int i)
        {
            if (_act != 1 || Locked) return;
            var w = Social[i];
            Pulse(btn);
            bool first = !_seen[i];
            _seen[i] = true;
            SetConsigne(WordVisual(w.En, 56), () => w.En + " ! " + Cap(w.En) + ", ça veut dire " + w.Fr + " !");
            En(w.En + "!", Cap(w.En) + ", ça veut dire " + w.Fr + " !", twice: true);
            if (first) RewardStar();
            if (_seen.All(x => x))
            {
                Locked = true;
                Schedule(4200, () =>
                {
                    Speak("Bravo ! Maintenant, les animaux en anglais !");
                    Schedule(2800, StartAnimals);
                });
            }
        }

        // ==================================================================
        // ACTE 2 — The animals
        // ==================================================================
        private void StartAnimals()
        {
            _act = 2;
            Locked = false;
            _seen = new bool[_animals.Count];
            Question.Text = "🐾 The animals";
            _canvas = new Canvas { Width = W, Height = H };

            double size = 300, gapX = 60, gapY = 30;
            int cols = 3;
            double x0 = (W - cols * size - (cols - 1) * gapX) / 2, y0 = 20;
            for (int i = 0; i < _animals.Count; i++)
            {
                var w = _animals[i];
                int idx = i;
                var content = new StackPanel { HorizontalAlignment = HorizontalAlignment.Center };
                content.Children.Add(Art.Visual(w.Img, w.Emoji, 170));
                content.Children.Add(Label(w.En, 38));
                var btn = AnswerButton(new Viewbox { Child = content, Margin = new Thickness(14) }, size);
                var captured = btn;
                btn.Click += (o, ev) => AnimalWord(captured, idx);
                Canvas.SetLeft(btn, x0 + (i % cols) * (size + gapX));
                Canvas.SetTop(btn, y0 + (i / cols) * (size + gapY));
                _canvas.Children.Add(btn);
            }

            SetConsigne(Flag(), () => "Regarde chaque animal pour entendre son nom en anglais !");
            SetBody(_canvas);
            Schedule(450, () => En("The animals!", "Les animaux ! Regarde chaque animal pour entendre son nom en anglais !"));
        }

        private void AnimalWord(Button btn, int i)
        {
            if (_act != 2 || Locked) return;
            var w = _animals[i];
            Pulse(btn);
            bool first = !_seen[i];
            _seen[i] = true;
            SetConsigne(WordVisual(w.En, 56), () => w.En + " ! " + Cap(w.Fr) + " ! En anglais, on dit " + w.En.ToLowerInvariant() + " !");
            En(w.En + "!", Cap(w.Fr) + " ! En anglais, on dit " + w.En.ToLowerInvariant() + " !", twice: true);
            if (first) RewardStar();
            if (_seen.All(x => x))
            {
                Locked = true;
                Schedule(4200, () =>
                {
                    Speak("Bravo ! Maintenant, écoute et trouve !");
                    Schedule(3200, StartWhere);
                });
            }
        }

        // ==================================================================
        // ACTE 3 — Where is the cat?
        // ==================================================================
        private void StartWhere()
        {
            _act = 3;
            _round = 0;
            NextWhere();
        }

        private void NextWhere()
        {
            Locked = false;
            _round++;
            if (_round > 5) { StartColours(); return; }
            _target = _animals[(_round - 1) % _animals.Count];
            var choices = Level.Pick(_animals, _target, 4);
            Question.Text = "🔎 Where is the " + _target.En.ToLowerInvariant() + "?";
            _canvas = new Canvas { Width = W, Height = H };

            double gap = 60, size = Math.Min(340, (W - 100 - (choices.Count - 1) * gap) / choices.Count);
            double x0 = (W - choices.Count * size - (choices.Count - 1) * gap) / 2;
            for (int k = 0; k < choices.Count; k++)
            {
                var w = choices[k];
                var btn = AnswerButton(new Viewbox { Child = Art.Visual(w.Img, w.Emoji, 220), Margin = new Thickness(26) }, size);
                var captured = btn;
                btn.Click += (o, ev) => AnswerWhere(captured, w);
                Canvas.SetLeft(btn, x0 + k * (size + gap));
                Canvas.SetTop(btn, 150);
                _canvas.Children.Add(btn);
            }
            var speaker = SpeakerButton(() => "Where is the " + _target.En.ToLowerInvariant() + "? Où est " + _target.Fr + " ?");
            Canvas.SetLeft(speaker, W / 2 - 54);
            Canvas.SetTop(speaker, 20);
            _canvas.Children.Add(speaker);

            SetConsigne(Flag(), () => "Where is the " + _target.En.ToLowerInvariant() + "? Où est " + _target.Fr + " ? Regarde-le !");
            SetBody(_canvas);
            Schedule(400, () => En("Where is the " + _target.En.ToLowerInvariant() + "?", "Où est " + _target.Fr + " ?"));
            ArmHint(speaker, () => "Where is the " + _target.En.ToLowerInvariant() + "? Où est " + _target.Fr + " ?");
        }

        private void AnswerWhere(Button btn, Word w)
        {
            if (_act != 3 || Locked) return;
            if (w == _target)
            {
                Locked = true;
                DisarmHint();
                GameKit.Success();
                Pulse(btn);
                En("Yes! The " + w.En.ToLowerInvariant() + "! Very good!", "Oui ! " + Cap(w.Fr) + ", c'est " + w.En.ToLowerInvariant() + " ! " + GameKit.Praise());
                Celebrate();
                Schedule(3600, NextWhere);
            }
            else
            {
                Shake(btn);
                En("No, this is the " + w.En.ToLowerInvariant() + ".", "Ça, c'est " + w.Fr + ". Cherche " + _target.Fr + " : the " + _target.En.ToLowerInvariant() + " !");
            }
        }

        // ==================================================================
        // ACTE 4 — Colours
        // ==================================================================
        private void StartColours()
        {
            _act = 4;
            Locked = false;
            _seen = new bool[Colours.Length];
            _round = 0;
            Question.Text = "🎨 Colours";
            BuildColours(discover: true);
            SetConsigne(Flag(), () => "Regarde chaque couleur pour l'entendre en anglais !");
            SetBody(_canvas);
            Schedule(450, () => En("Colours!", "Les couleurs ! Regarde chaque couleur pour l'entendre en anglais !"));
        }

        private void BuildColours(bool discover)
        {
            _canvas = new Canvas { Width = W, Height = H };
            double cw = 300, gap = 44;
            double x0 = (W - 4 * cw - 3 * gap) / 2;
            for (int i = 0; i < Colours.Length; i++)
            {
                var c = Colours[i];
                int idx = i;
                var disc = new Grid { Width = 200, Height = 200 };
                disc.Children.Add(new Ellipse { Fill = new SolidColorBrush(c.C), Stroke = Brushes.White, StrokeThickness = 6 });
                var pic = Art.Visual(c.Img, c.Emoji, 130);
                pic.HorizontalAlignment = HorizontalAlignment.Center;
                pic.VerticalAlignment = VerticalAlignment.Center;
                disc.Children.Add(pic);
                var content = new StackPanel { HorizontalAlignment = HorizontalAlignment.Center };
                content.Children.Add(disc);
                if (discover) content.Children.Add(Label(c.En, 38));
                var btn = AnswerButton(new Viewbox { Child = content, Margin = new Thickness(16) }, cw);
                btn.Height = discover ? 320 : 280;
                var captured = btn;
                btn.Click += (o, ev) => { if (discover) ColourWord(captured, idx); else AnswerColour(captured, idx); };
                Canvas.SetLeft(btn, x0 + i * (cw + gap));
                Canvas.SetTop(btn, discover ? 140 : 170);
                _canvas.Children.Add(btn);
            }
        }

        private void ColourWord(Button btn, int i)
        {
            if (_act != 4 || Locked) return;
            var c = Colours[i];
            Pulse(btn);
            bool first = !_seen[i];
            _seen[i] = true;
            SetConsigne(WordVisual(c.En, 56), () => c.En + " ! " + Cap(c.Fr) + " ! En anglais, " + c.En.ToLowerInvariant() + " !");
            En(c.En + "!", Cap(c.Fr) + " ! En anglais, " + c.En.ToLowerInvariant() + " !", twice: true);
            if (first) RewardStar();
            if (_seen.All(x => x))
            {
                Locked = true;
                Schedule(4000, () =>
                {
                    Speak("Bravo ! Maintenant, montre-moi la couleur que je dis !");
                    Schedule(3000, NextColour);
                });
            }
        }

        private void NextColour()
        {
            Locked = false;
            _round++;
            if (_round > 4) { StartCount(); return; }
            _colourTarget = Colours[GameKit.NextNumber("anglais-couleur", 0, Colours.Length - 1)];
            Question.Text = "🎨 Show me " + _colourTarget.En.ToLowerInvariant() + "!";
            BuildColours(discover: false);
            var speaker = SpeakerButton(() => "Show me " + _colourTarget.En.ToLowerInvariant() + "! Montre-moi " + _colourTarget.Fr + " !");
            Canvas.SetLeft(speaker, W / 2 - 54);
            Canvas.SetTop(speaker, 30);
            _canvas.Children.Add(speaker);
            SetConsigne(Flag(), () => "Show me " + _colourTarget.En.ToLowerInvariant() + "! Montre-moi " + _colourTarget.Fr + " !");
            SetBody(_canvas);
            Schedule(400, () => En("Show me " + _colourTarget.En.ToLowerInvariant() + "!", "Montre-moi " + _colourTarget.Fr + " !"));
            ArmHint(speaker, () => "Show me " + _colourTarget.En.ToLowerInvariant() + "! Montre-moi " + _colourTarget.Fr + " !");
        }

        private void AnswerColour(Button btn, int i)
        {
            if (_act != 4 || Locked) return;
            var c = Colours[i];
            if (c == _colourTarget)
            {
                Locked = true;
                DisarmHint();
                GameKit.Success();
                Pulse(btn);
                En("Yes! " + c.En + "! Well done!", "Oui ! " + Cap(c.Fr) + " ! " + GameKit.Praise());
                Celebrate();
                Schedule(3400, NextColour);
            }
            else
            {
                Shake(btn);
                En("No, this is " + c.En.ToLowerInvariant() + ".", "Ça, c'est " + c.Fr + ". Cherche " + _colourTarget.Fr + " : " + _colourTarget.En.ToLowerInvariant() + " !");
            }
        }

        // ==================================================================
        // ACTE 5 — Let's count!
        // ==================================================================
        private void StartCount()
        {
            _act = 5;
            _round = 0;
            Speak("Et pour finir, on compte en anglais ! One, two, three !");
            Schedule(3400, NextCount);
        }

        private void NextCount()
        {
            Locked = false;
            _round++;
            if (_round > 3)
            {
                Speak("Tu as fini ta leçon d'anglais ! Bravo ! " + GameKit.Praise());
                Celebrate();
                Schedule(4000, NewRound);
                return;
            }
            _countTarget = GameKit.NextNumber("anglais-compter", 1, 3);
            Question.Text = "🦆 How many ducks?";
            _canvas = new Canvas { Width = W, Height = H };

            // Les canards, en rang.
            double ds = 170, gap = 40;
            double x0 = (W - _countTarget * ds - (_countTarget - 1) * gap) / 2;
            for (int k = 0; k < _countTarget; k++)
            {
                var duck = Art.Visual("canard", "🦆", ds);
                Canvas.SetLeft(duck, x0 + k * (ds + gap));
                Canvas.SetTop(duck, 60);
                _canvas.Children.Add(duck);
            }

            // Les réponses : le chiffre et le mot anglais.
            double size = 260, agap = 60;
            double ax0 = (W - 3 * size - 2 * agap) / 2;
            for (int n = 1; n <= 3; n++)
            {
                int val = n;
                var content = new StackPanel { HorizontalAlignment = HorizontalAlignment.Center };
                content.Children.Add(new TextBlock { Text = n.ToString(), FontSize = 110, FontWeight = FontWeights.ExtraBold, Foreground = new SolidColorBrush(Color.FromRgb(0x2A, 0x5A, 0x3A)), HorizontalAlignment = HorizontalAlignment.Center });
                content.Children.Add(Label(NumEn[n], 34));
                var btn = AnswerButton(new Viewbox { Child = content, Margin = new Thickness(16) }, size);
                var captured = btn;
                btn.Click += (o, ev) => AnswerCount(captured, val);
                Canvas.SetLeft(btn, ax0 + (n - 1) * (size + agap));
                Canvas.SetTop(btn, 300);
                _canvas.Children.Add(btn);
            }

            SetConsigne(Flag(), () => "How many ducks? Combien de canards ? One, two, three ?");
            SetBody(_canvas);
            Schedule(400, () => En("How many ducks?", "Combien de canards ?"));
        }

        private void AnswerCount(Button btn, int n)
        {
            if (_act != 5 || Locked) return;
            if (n == _countTarget)
            {
                Locked = true;
                GameKit.Success();
                Pulse(btn);
                string count = string.Join(", ", Enumerable.Range(1, n).Select(k => NumEn[k].ToLowerInvariant()));
                En("Yes! " + Cap(count) + "! " + NumEn[n] + " ducks!", NumFr[n] + " canard" + (n > 1 ? "s" : "") + " ! " + GameKit.Praise());
                Celebrate();
                Schedule(3800, NextCount);
            }
            else
            {
                Shake(btn);
                En("No. Let's count!", "On compte ensemble : " + string.Join(", ", Enumerable.Range(1, _countTarget).Select(k => NumFr[k])) + " !");
            }
        }

        // ------------------------------------------------------------------
        private static void Pulse(FrameworkElement el)
        {
            var sc = new ScaleTransform(1, 1);
            el.RenderTransformOrigin = new Point(0.5, 0.5);
            el.RenderTransform = sc;
            var a = new DoubleAnimation(1, 1.12, TimeSpan.FromMilliseconds(140)) { AutoReverse = true, EasingFunction = new SineEase() };
            sc.BeginAnimation(ScaleTransform.ScaleXProperty, a);
            sc.BeginAnimation(ScaleTransform.ScaleYProperty, a);
        }

        private static string Cap(string s) => s.Length == 0 ? s : char.ToUpperInvariant(s[0]) + s.Substring(1);
    }
}
