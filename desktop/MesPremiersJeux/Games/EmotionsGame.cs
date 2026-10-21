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
    /// 😊 « Les émotions » (PS/MS), en quatre actes :
    ///   1. DÉCOUVERTE — six visages (content, triste, fâché, surpris, peur,
    ///      fatigué) : regarder un visage le fait bouger et dit ce qu'il ressent.
    ///   2. MONTRE-MOI — « Montre-moi celui qui est triste ! » parmi trois.
    ///   3. IL EST COMMENT ? — une petite situation (« sa glace est tombée… »),
    ///      et l'enfant choisit le visage qui va avec.
    ///   4. ET TOI ? — l'enfant montre comment ELLE se sent (pas de mauvaise
    ///      réponse) ; c'est noté dans le bilan, comme la grille « Je ressens ».
    /// Les visages viennent de la banque d'images (emotion-content, emotion-triste,
    /// emotion-fache, emotion-surpris, emotion-peur, emotion-fatigue) ; sans
    /// image, un visage rond tout simple est dessiné.
    /// </summary>
    public sealed class EmotionsGame : GameControl
    {
        private const double W = 1400, H = 680;

        private sealed class Emotion
        {
            public string Key, Adj, Noun, Says, Mouth;
            public double Brow; // inclinaison des sourcils (−1 triste … +1 fâché)
            public Color Tint;
        }

        // Les six émotions de base (actes 1 à 3)…
        private static readonly Emotion[] Emotions =
        {
            new Emotion { Key = "content", Adj = "content", Noun = "la joie", Says = "Il sourit, il rit ! Youpi !", Mouth = "smile", Brow = 0, Tint = Color.FromRgb(0xFF, 0xF1, 0xB8) },
            new Emotion { Key = "triste", Adj = "triste", Noun = "la tristesse", Says = "Il a une larme, il a envie de pleurer.", Mouth = "frown", Brow = -0.6, Tint = Color.FromRgb(0xD6, 0xE6, 0xFF) },
            new Emotion { Key = "fache", Adj = "fâché", Noun = "la colère", Says = "Il fronce les sourcils, il grogne : grrr !", Mouth = "flat", Brow = 1, Tint = Color.FromRgb(0xFF, 0xD0, 0xC8) },
            new Emotion { Key = "surpris", Adj = "surpris", Noun = "la surprise", Says = "Il ouvre grand les yeux et la bouche : oh !", Mouth = "o", Brow = -0.3, Tint = Color.FromRgb(0xE8, 0xD8, 0xFF) },
            new Emotion { Key = "peur", Adj = "effrayé", Noun = "la peur", Says = "Il tremble, il a peur ! Ouh là là !", Mouth = "wavy", Brow = -0.8, Tint = Color.FromRgb(0xD8, 0xF0, 0xE8) },
            new Emotion { Key = "fatigue", Adj = "fatigué", Noun = "la fatigue", Says = "Il bâille, ses yeux se ferment... il a sommeil.", Mouth = "yawn", Brow = -0.2, Tint = Color.FromRgb(0xE6, 0xE6, 0xF2) },
        };

        // … et trois de plus pour dire comment ON se sent (acte 4).
        private static readonly Emotion[] More =
        {
            new Emotion { Key = "malade", Adj = "malade", Noun = "la maladie", Says = "Il ne se sent pas bien, il a chaud au front.", Mouth = "frown", Brow = -0.4, Tint = Color.FromRgb(0xE0, 0xF2, 0xDC) },
            new Emotion { Key = "calme", Adj = "calme", Noun = "le calme", Says = "Il respire doucement, tout va bien.", Mouth = "smile", Brow = 0, Tint = Color.FromRgb(0xE2, 0xF4, 0xFF) },
            new Emotion { Key = "excite", Adj = "tout excité", Noun = "l'excitation", Says = "Il saute partout, il a des étoiles dans les yeux !", Mouth = "smile", Brow = 0, Tint = Color.FromRgb(0xFF, 0xE8, 0xC8) },
        };

        // Les petites situations de l'acte 3 : (image, histoire, émotion).
        private static readonly (string Img, string Emoji, string Story, string Key)[] Situations =
        {
            ("gateau", "🎂", "C'est son anniversaire ! Il y a un gros gâteau avec des bougies !", "content"),
            ("cadeau", "🎁", "Oh ! Quelqu'un lui apporte un cadeau surprise !", "surpris"),
            ("glace", "🍦", "Sa glace est tombée par terre...", "triste"),
            ("cubes", "🧱", "Son frère a cassé sa grande tour de cubes !", "fache"),
            ("chien", "🐕", "Un très gros chien aboie très fort devant lui !", "peur"),
            ("lune", "🌙", "C'est la nuit, il bâille... il est l'heure de dormir.", "fatigue"),
            ("ours-peluche", "🧸", "Il a perdu son doudou...", "triste"),
            ("ballon", "🎈", "Il joue au ballon avec ses copains, c'est trop bien !", "content"),
            ("dragon", "🐉", "Un dragon sort de la forêt et crache du feu !", "peur"),
            ("papillon", "🦋", "Un papillon vient se poser sur son nez ! Oh !", "surpris"),
        };

        private Canvas _canvas;
        private int _act;
        private bool[] _seen;
        private int _round;
        private Emotion _target;
        private List<(string Img, string Emoji, string Story, string Key)> _stories;

        public EmotionsGame(Action celebrate) : base(celebrate) { }

        protected override void NewRound()
        {
            _stories = GameKit.Shuffle(Situations).ToList();
            StartDiscovery();
        }

        // ------------------------------------------------------------------
        //  Le visage : l'image de la banque, sinon un visage rond dessiné.
        // ------------------------------------------------------------------
        private static FrameworkElement Face(Emotion e, double size)
        {
            var src = Art.Find("emotion-" + e.Key);
            if (src != null) return new Image { Source = src, Width = size, Height = size, Stretch = Stretch.Uniform };

            var c = new Canvas { Width = 200, Height = 200 };
            c.Children.Add(new Ellipse { Width = 190, Height = 190, Fill = new SolidColorBrush(Color.FromRgb(0xFF, 0xD9, 0x5C)), Stroke = new SolidColorBrush(Color.FromRgb(0xE0, 0xA8, 0x20)), StrokeThickness = 5, Margin = new Thickness(5) });
            double eyeH = e.Mouth == "yawn" ? 6 : e.Mouth == "o" || e.Mouth == "wavy" ? 30 : 22;
            foreach (double x in new[] { 65.0, 135.0 })
            {
                var eye = new Ellipse { Width = 22, Height = eyeH, Fill = new SolidColorBrush(Color.FromRgb(0x2B, 0x2D, 0x42)) };
                Canvas.SetLeft(eye, x - 11); Canvas.SetTop(eye, 80 - eyeH / 2);
                c.Children.Add(eye);
                // Sourcil : penché vers l'intérieur (fâché) ou vers l'extérieur (triste, peur).
                double dir = x < 100 ? 1 : -1;
                var brow = new Line { X1 = x - 16, Y1 = 52 - e.Brow * dir * -6, X2 = x + 16, Y2 = 52 + e.Brow * dir * -6, Stroke = new SolidColorBrush(Color.FromRgb(0x2B, 0x2D, 0x42)), StrokeThickness = 6, StrokeStartLineCap = PenLineCap.Round, StrokeEndLineCap = PenLineCap.Round };
                c.Children.Add(brow);
            }
            if (e.Key == "triste")
            {
                var tear = new Ellipse { Width = 12, Height = 18, Fill = new SolidColorBrush(Color.FromRgb(0x5D, 0xAD, 0xE2)) };
                Canvas.SetLeft(tear, 128); Canvas.SetTop(tear, 98);
                c.Children.Add(tear);
            }
            var mouth = new Path { Stroke = new SolidColorBrush(Color.FromRgb(0x2B, 0x2D, 0x42)), StrokeThickness = 7, StrokeStartLineCap = PenLineCap.Round, StrokeEndLineCap = PenLineCap.Round };
            switch (e.Mouth)
            {
                case "smile": mouth.Data = Geometry.Parse("M 60,125 Q 100,170 140,125"); break;
                case "frown": mouth.Data = Geometry.Parse("M 65,150 Q 100,118 135,150"); break;
                case "flat": mouth.Data = Geometry.Parse("M 65,142 L 135,142"); break;
                case "o": mouth.Data = Geometry.Parse("M 100,122 A 18,24 0 1 0 100,170 A 18,24 0 1 0 100,122"); mouth.Fill = new SolidColorBrush(Color.FromRgb(0x2B, 0x2D, 0x42)); break;
                case "wavy": mouth.Data = Geometry.Parse("M 62,142 Q 75,128 88,142 T 114,142 T 140,142"); break;
                default: mouth.Data = Geometry.Parse("M 100,118 A 22,30 0 1 0 100,178 A 22,30 0 1 0 100,118"); mouth.Fill = new SolidColorBrush(Color.FromRgb(0x2B, 0x2D, 0x42)); break;
            }
            c.Children.Add(mouth);
            return new Viewbox { Width = size, Height = size, Child = c };
        }

        private Button FaceButton(Emotion e, double size, bool withLabel)
        {
            var content = new StackPanel { HorizontalAlignment = HorizontalAlignment.Center };
            content.Children.Add(Face(e, withLabel ? 180 : 220));
            if (withLabel)
                content.Children.Add(new TextBlock
                {
                    Text = Cap(e.Adj), FontSize = 36, FontWeight = FontWeights.Bold,
                    Foreground = new SolidColorBrush(Color.FromRgb(0x3B, 0x2A, 0x5A)), HorizontalAlignment = HorizontalAlignment.Center, Margin = new Thickness(0, 6, 0, 0),
                });
            var btn = AnswerButton(new Viewbox { Child = content, Margin = new Thickness(14) }, size);
            btn.Background = new SolidColorBrush(e.Tint);
            return btn;
        }

        // ==================================================================
        // ACTE 1 — Découverte
        // ==================================================================
        private void StartDiscovery()
        {
            _act = 1;
            Locked = false;
            _seen = new bool[Emotions.Length];
            Question.Text = "😊 Les émotions";
            _canvas = new Canvas { Width = W, Height = H };
            double size = 300, gapX = 60, gapY = 30;
            int cols = 3;
            double x0 = (W - cols * size - (cols - 1) * gapX) / 2, y0 = 20;
            for (int i = 0; i < Emotions.Length; i++)
            {
                int idx = i;
                var btn = FaceButton(Emotions[i], size, true);
                var captured = btn;
                btn.Click += (o, ev) => Discover(captured, idx);
                Canvas.SetLeft(btn, x0 + (i % cols) * (size + gapX));
                Canvas.SetTop(btn, y0 + (i / cols) * (size + gapY));
                _canvas.Children.Add(btn);
            }
            SetConsigne(Face(Emotions[0], 90), () => "Regarde chaque visage pour savoir ce qu'il ressent !");
            SetBody(_canvas);
            Schedule(450, () => Speak("Regarde chaque visage !"));
        }

        private void Discover(Button btn, int i)
        {
            if (_act != 1 || Locked) return;
            var e = Emotions[i];
            Pulse(btn);
            bool first = !_seen[i];
            _seen[i] = true;
            Speak("Il est " + e.Adj + " ! " + e.Says);
            if (first) RewardStar();
            if (_seen.All(x => x))
            {
                Locked = true;
                Schedule(3800, () =>
                {
                    Speak("Bravo ! Maintenant, montre-moi celui que je dis !");
                    Schedule(3400, StartShow);
                });
            }
        }

        // ==================================================================
        // ACTE 2 — Montre-moi celui qui est…
        // ==================================================================
        private void StartShow()
        {
            _act = 2;
            _round = 0;
            NextShow();
        }

        private void NextShow()
        {
            Locked = false;
            _round++;
            if (_round > 4) { StartStories(); return; }
            _target = Emotions[GameKit.NextNumber("emotions-montre", 0, Emotions.Length - 1)];
            var choices = Level.Pick(Emotions.ToList(), _target, 4);
            Question.Text = "🔎 Montre-moi celui qui est " + _target.Adj;
            _canvas = new Canvas { Width = W, Height = H };
            double gap = 60, size = Math.Min(340, (W - 100 - (choices.Count - 1) * gap) / choices.Count);
            double x0 = (W - choices.Count * size - (choices.Count - 1) * gap) / 2;
            for (int k = 0; k < choices.Count; k++)
            {
                var e = choices[k];
                var btn = FaceButton(e, size, false);
                var captured = btn;
                btn.Click += (o, ev) => AnswerShow(captured, e);
                Canvas.SetLeft(btn, x0 + k * (size + gap));
                Canvas.SetTop(btn, 150);
                _canvas.Children.Add(btn);
            }
            var speaker = SpeakerButton(() => "Montre-moi celui qui est " + _target.Adj + " ! " + _target.Says);
            Canvas.SetLeft(speaker, W / 2 - 54);
            Canvas.SetTop(speaker, 20);
            _canvas.Children.Add(speaker);
            SetConsigne(new TextBlock { Text = "🔎", FontSize = 60 }, () => "Montre-moi celui qui est " + _target.Adj + " !");
            SetBody(_canvas);
            Schedule(400, () => Speak("Montre-moi celui qui est " + _target.Adj + " !"));
            ArmHint(speaker, () => "Montre-moi celui qui est " + _target.Adj + " ! " + _target.Says);
        }

        private void AnswerShow(Button btn, Emotion e)
        {
            if (_act != 2 || Locked) return;
            if (e == _target)
            {
                Locked = true;
                DisarmHint();
                GameKit.Success();
                Pulse(btn);
                Speak("Oui ! Il est " + e.Adj + " ! " + GameKit.Praise());
                Celebrate();
                Schedule(3200, NextShow);
            }
            else
            {
                Shake(btn);
                Speak("Lui, il est " + e.Adj + ". " + e.Says + " Cherche celui qui est " + _target.Adj + " !");
            }
        }

        // ==================================================================
        // ACTE 3 — Il est comment ? (les situations)
        // ==================================================================
        private void StartStories()
        {
            _act = 3;
            _round = 0;
            Speak("Écoute l'histoire : il est comment ?");
            Schedule(3400, NextStory);
        }

        private void NextStory()
        {
            Locked = false;
            _round++;
            if (_round > 4) { StartYou(); return; }
            var story = _stories[(_round - 1) % _stories.Count];
            _target = Emotions.First(x => x.Key == story.Key);
            var choices = Level.Pick(Emotions.ToList(), _target, 4);
            Question.Text = "💭 Il est comment ?";
            _canvas = new Canvas { Width = W, Height = H };

            // La scène : l'image de l'histoire, en grand, en haut.
            var pic = Art.Visual(story.Img, story.Emoji, 230);
            Canvas.SetLeft(pic, W / 2 - 115);
            Canvas.SetTop(pic, 10);
            _canvas.Children.Add(pic);

            double gap = 70, size = Math.Min(280, (W - 100 - (choices.Count - 1) * gap) / choices.Count);
            double x0 = (W - choices.Count * size - (choices.Count - 1) * gap) / 2;
            for (int k = 0; k < choices.Count; k++)
            {
                var e = choices[k];
                var btn = FaceButton(e, size, false);
                var captured = btn;
                btn.Click += (o, ev) => AnswerStory(captured, e, story.Story);
                Canvas.SetLeft(btn, x0 + k * (size + gap));
                Canvas.SetTop(btn, 300);
                _canvas.Children.Add(btn);
            }
            var speaker = SpeakerButton(() => story.Story + " Il est comment ?");
            Canvas.SetLeft(speaker, W - 150);
            Canvas.SetTop(speaker, 20);
            _canvas.Children.Add(speaker);
            SetConsigne(Art.Visual(story.Img, story.Emoji, 90), () => story.Story + " Il est comment ?");
            SetBody(_canvas);
            Schedule(400, () => Speak(story.Story + " Il est comment ?"));
            ArmHint(speaker, () => story.Story + " Il est comment ? Content, triste, fâché ?");
        }

        private void AnswerStory(Button btn, Emotion e, string story)
        {
            if (_act != 3 || Locked) return;
            if (e == _target)
            {
                Locked = true;
                DisarmHint();
                GameKit.Success();
                Pulse(btn);
                Speak("Oui ! Il est " + e.Adj + " ! " + e.Says + " " + GameKit.Praise());
                Celebrate();
                Schedule(3800, NextStory);
            }
            else
            {
                Shake(btn);
                Speak("Tu crois qu'il est " + e.Adj + " ? Écoute encore : " + story + " Alors, il est comment ?");
            }
        }

        // ==================================================================
        // ACTE 4 — Et toi, tu te sens comment ?
        // ==================================================================
        private void StartYou()
        {
            _act = 4;
            Locked = false;
            Question.Text = "💖 Et toi, tu te sens comment ?";
            _canvas = new Canvas { Width = W, Height = H };
            var all = Emotions.Concat(More).ToList();
            double size = 215, gapX = 40, gapY = 14;
            int cols = 3;
            double x0 = (W - cols * size - (cols - 1) * gapX) / 2, y0 = 4;
            for (int i = 0; i < all.Count; i++)
            {
                var e = all[i];
                var btn = FaceButton(e, size, true);
                var captured = btn;
                btn.Click += (o, ev) => AnswerYou(captured, e);
                Canvas.SetLeft(btn, x0 + (i % cols) * (size + gapX));
                Canvas.SetTop(btn, y0 + (i / cols) * (size + gapY));
                _canvas.Children.Add(btn);
            }
            SetConsigne(new TextBlock { Text = "💖", FontSize = 60 }, () => "Et toi, aujourd'hui, tu te sens comment ? Montre-moi le visage qui te ressemble !");
            SetBody(_canvas);
            Schedule(400, () => Speak("Et toi, tu te sens comment ?"));
        }

        private void AnswerYou(Button btn, Emotion e)
        {
            if (_act != 4 || Locked) return;
            Locked = true;
            Pulse(btn);
            GazeStats.RecordComm("ressens-" + e.Key); // comme la grille « Je ressens »
            string reply = e.Key == "content" ? "C'est la joie ! Youpi ! Moi aussi je suis contente de jouer avec toi !"
                : e.Key == "triste" ? "C'est la tristesse... Viens, je te fais un gros câlin. Ça va aller."
                : e.Key == "fache" ? "C'est la colère ! On souffle fort... et ça passe."
                : e.Key == "surpris" ? "C'est la surprise ! Oh ! Qu'est-ce qui t'a surprise ?"
                : e.Key == "peur" ? "C'est la peur... Je suis là, tout va bien. Respire doucement."
                : e.Key == "fatigue" ? "C'est la fatigue... Tu peux te reposer, on rejouera après."
                : e.Key == "malade" ? "Tu es malade... On va le dire à papa ou maman, et bien te soigner."
                : e.Key == "calme" ? "C'est le calme... Comme c'est agréable ! On respire tout doucement."
                : "C'est l'excitation ! Youhou ! Tu as plein d'énergie aujourd'hui !";
            Speak("Aujourd'hui, c'est " + e.Noun + ". " + reply);
            RewardStar();
            Celebrate();
            Schedule(7000, NewRound);
        }

        // ------------------------------------------------------------------
        private static void Pulse(FrameworkElement el)
        {
            var sc = new ScaleTransform(1, 1);
            el.RenderTransformOrigin = new Point(0.5, 0.5);
            el.RenderTransform = sc;
            var a = new DoubleAnimation(1, 1.12, TimeSpan.FromMilliseconds(160)) { AutoReverse = true, EasingFunction = new SineEase() };
            sc.BeginAnimation(ScaleTransform.ScaleXProperty, a);
            sc.BeginAnimation(ScaleTransform.ScaleYProperty, a);
        }

        private static string Cap(string s) => s.Length == 0 ? s : char.ToUpperInvariant(s[0]) + s.Substring(1);
    }
}
