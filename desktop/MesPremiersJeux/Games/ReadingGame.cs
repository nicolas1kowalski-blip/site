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
    /// 📖 LIRE ET ÉCRIRE (GS · CP), en quatre entrées, avec les lettres dessinées :
    ///   1. MON PRÉNOM ÉCRIT — retrouver son prénom parmi d'autres prénoms.
    ///   2. LE MOT ET L'IMAGE — une image, des mots écrits : lequel est le bon ?
    ///      (puis l'inverse : un mot, des images).
    ///   3. LES LETTRES MOBILES — composer un mot lettre après lettre (la case
    ///      qui attend brille), avec deux lettres intruses.
    ///   4. LE SON DE LA FIN — « Quel mot finit par ON ? » : les rimes. Un
    ///      regard sur une image la fait nommer, une fixation la choisit.
    /// Le nombre de choix suit le niveau.
    /// </summary>
    public sealed class ReadingGame : GameControl
    {
        private const double W = 1400, H = 680;

        private sealed class Word
        {
            public string Text, Img, Emoji, Said;
            public Word(string text, string img, string emoji, string said = null) { Text = text; Img = img; Emoji = emoji; Said = said ?? text.ToLowerInvariant(); }
        }

        private static readonly Word[] Words =
        {
            new Word("CHAT", "chat", "🐱"), new Word("CHIEN", "chien", "🐶"), new Word("LAPIN", "lapin", "🐰"),
            new Word("VACHE", "vache", "🐄"), new Word("LION", "lion", "🦁"), new Word("OURS", "ours", "🐻"),
            new Word("POULE", "poule", "🐔"), new Word("POMME", "pomme", "🍎"), new Word("FLEUR", "fleur", "🌸"),
            new Word("LUNE", "lune", "🌙"), new Word("ETOILE", "etoile", "⭐", "étoile"), new Word("TRAIN", "train", "🚆"),
            new Word("BALLON", "ballon", "🎈"), new Word("ROBOT", "robot", "🤖"), new Word("BATEAU", "bateau", "⛵"),
            new Word("GATEAU", "gateau", "🎂", "gâteau"), new Word("COCHON", "cochon", "🐷"), new Word("MOUTON", "mouton", "🐑"),
            new Word("SOURIS", "souris", "🐭"), new Word("HIBOU", "hibou", "🦉"), new Word("AVION", "avion", "✈️"),
            new Word("POISSON", "poisson", "🐟"), new Word("MAISON", "maison", "🏠"), new Word("VELO", "velo", "🚲", "vélo"),
        };

        // Les familles de rimes : (son dit, mots).
        private static readonly (string Sound, Word[] Members)[] Rhymes =
        {
            ("on", new[] { new Word("BALLON", "ballon", "🎈"), new Word("COCHON", "cochon", "🐷"), new Word("MOUTON", "mouton", "🐑"), new Word("AVION", "avion", "✈️"), new Word("PAPILLON", "papillon", "🦋"), new Word("POISSON", "poisson", "🐟"), new Word("CITRON", "citron", "🍋"), new Word("CAMION", "camion", "🚚") }),
            ("o", new[] { new Word("BATEAU", "bateau", "⛵"), new Word("GATEAU", "gateau", "🎂", "gâteau"), new Word("CHAPEAU", "chapeau", "👒"), new Word("MANTEAU", "manteau", "🧥"), new Word("CADEAU", "cadeau", "🎁"), new Word("SEAU", "seau", "🪣"), new Word("VELO", "velo", "🚲", "vélo"), new Word("ROBOT", "robot", "🤖") }),
            ("i", new[] { new Word("SOURIS", "souris", "🐭"), new Word("KIWI", "kiwi", "🥝"), new Word("RADIS", "radis", "🥕"), new Word("TAPIS", "tapis-de-bain", "🧶") }),
            ("ou", new[] { new Word("HIBOU", "hibou", "🦉"), new Word("CHOU", "chou", "🥬"), new Word("KANGOUROU", "kangourou", "🦘"), new Word("BISOU", "coeur", "💋") }),
            ("ette", new[] { new Word("TROMPETTE", "trompette", "🎺"), new Word("CHAUSSETTE", "chaussette", "🧦"), new Word("ASSIETTE", "assiette", "🍽️"), new Word("CASQUETTE", "casquette", "🧢"), new Word("TROTTINETTE", "trottinette", "🛴") }),
        };

        private static readonly string[] OtherNames =
        {
            "LOLA", "EMMA", "LEO", "NINA", "TOM", "JULES", "MILA", "NOAH", "ZOE", "LUCAS", "LENA", "HUGO", "ROSE", "SACHA", "LINA", "ADAM",
        };

        private readonly int _startAct; // 1 prénom · 2 mot et image · 3 lettres mobiles · 4 rimes
        private Canvas _canvas;
        private int _act, _round;
        private string _name;
        private Word _target;
        private List<Word> _deck;

        // Lettres mobiles
        private List<Border> _slots;
        private int _slotPos;

        public ReadingGame(Action celebrate, int startAct = 1) : base(celebrate) { _startAct = startAct; }

        protected override void NewRound()
        {
            _name = (Settings.Load().ChildName ?? "").Trim().ToUpperInvariant();
            if (_name.Length == 0) _name = "LAURA";
            _deck = GameKit.Shuffle(Words);
            _round = 0;
            switch (_startAct)
            {
                case 2: StartWordImage(); break;
                case 3: StartMobile(); break;
                case 4: StartRhymes(); break;
                default: StartName(); break;
            }
        }

        // ------------------------------------------------------------------
        //  Le mot écrit avec les lettres dessinées (lettre-A … lettre-Z).
        // ------------------------------------------------------------------
        private static FrameworkElement Letter(char ch, double size)
        {
            var src = Art.Find("lettre-" + char.ToUpperInvariant(ch));
            return src != null
                ? (FrameworkElement)new Image { Source = src, Height = size, Width = size * 0.82, Stretch = Stretch.Uniform }
                : new TextBlock { Text = ch.ToString(), FontSize = size * 0.9, FontWeight = FontWeights.ExtraBold, Foreground = new SolidColorBrush(Color.FromRgb(0x3B, 0x2A, 0x5A)), Width = size * 0.82, TextAlignment = TextAlignment.Center };
        }

        private static FrameworkElement WordVisual(string word, double size)
        {
            var row = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Center };
            foreach (var ch in word) row.Children.Add(Letter(ch, size));
            return row;
        }

        private Button WordButton(string word, double letterSize, double width, double height)
        {
            var btn = AnswerButton(new Viewbox { Child = WordVisual(word, letterSize), Margin = new Thickness(18), StretchDirection = StretchDirection.DownOnly }, width);
            btn.Height = height;
            return btn;
        }

        private static string Spell(string word) => string.Join(", ", word.Select(c => c.ToString()));

        // Place n boutons sur une ligne, taille adaptée au nombre.
        private (double size, double x0, double gap) RowLayout(int n, double maxSize, double gap)
        {
            double size = Math.Min(maxSize, (W - 100 - (n - 1) * gap) / n);
            return (size, (W - n * size - (n - 1) * gap) / 2, gap);
        }

        // ==================================================================
        // 1 · Mon prénom écrit
        // ==================================================================
        private void StartName()
        {
            _act = 1;
            Locked = false;
            _round++;
            if (_round > 5) { Finish("Tu reconnais ton prénom partout ! "); return; }
            Question.Text = "💖 Où est ton prénom ?";
            _canvas = new Canvas { Width = W, Height = H };

            var others = GameKit.Shuffle(OtherNames.Where(n => n != _name && Math.Abs(n.Length - _name.Length) <= 2 && n[0] != _name[0] || _round > 3)).Take(Level.Choices - 1).ToList();
            var choices = GameKit.Shuffle(others.Concat(new[] { _name }));
            var (size, x0, gap) = RowLayout(choices.Count, 420, 40);
            double h = Math.Min(220, size * 0.6);
            for (int k = 0; k < choices.Count; k++)
            {
                var w = choices[k];
                var btn = WordButton(w, 90, size, h);
                var captured = btn;
                btn.Click += (o, ev) => AnswerName(captured, w);
                Canvas.SetLeft(btn, x0 + k * (size + gap));
                Canvas.SetTop(btn, H / 2 - h / 2);
                _canvas.Children.Add(btn);
            }
            SetConsigne(new TextBlock { Text = "💖", FontSize = 60 }, () => "Où est ton prénom, " + Cap(_name.ToLowerInvariant()) + " ? Regarde bien les lettres : " + Spell(_name) + " !");
            SetBody(_canvas);
            Schedule(400, () => Speak(_round == 1 ? "Où est ton prénom ?" : "Et là, où est ton prénom ?"));
        }

        private void AnswerName(Button btn, string w)
        {
            if (_act != 1 || Locked) return;
            if (w == _name)
            {
                Locked = true;
                GameKit.Success();
                Pulse(btn);
                Speak("Oui ! " + Cap(_name.ToLowerInvariant()) + " ! " + Spell(_name) + " ! " + GameKit.Praise());
                RewardStar();
                Celebrate();
                Schedule(3200, StartName);
            }
            else
            {
                Shake(btn);
                Speak("Ça, c'est " + Cap(w.ToLowerInvariant()) + ". Ton prénom commence par " + _name[0] + " !");
            }
        }

        // ==================================================================
        // 2 · Le mot et l'image (puis l'inverse)
        // ==================================================================
        private void StartWordImage()
        {
            _act = 2;
            Locked = false;
            _round++;
            if (_round > 8) { Finish("Tu lis les mots ! "); return; }
            bool wordsAsChoices = _round <= 4; // 4 tours « image → mot », puis 4 tours « mot → image »
            _target = _deck[(_round - 1) % _deck.Count];
            var choices = Level.Pick(_deck, _target, 4);
            Question.Text = wordsAsChoices ? "📖 Quel mot ?" : "🖼️ Quelle image ?";
            _canvas = new Canvas { Width = W, Height = H };

            var model = wordsAsChoices ? Art.Visual(_target.Img, _target.Emoji, 220) : WordVisual(_target.Text, 110);
            var modelBox = new Border { Child = model, HorizontalAlignment = HorizontalAlignment.Center };
            Canvas.SetLeft(modelBox, W / 2 - (wordsAsChoices ? 110 : _target.Text.Length * 46));
            Canvas.SetTop(modelBox, 20);
            _canvas.Children.Add(modelBox);

            var (size, x0, gap) = RowLayout(choices.Count, 400, 36);
            double h = wordsAsChoices ? Math.Min(190, size * 0.55) : size * 0.8;
            for (int k = 0; k < choices.Count; k++)
            {
                var w = choices[k];
                var btn = wordsAsChoices
                    ? WordButton(w.Text, 80, size, h)
                    : AnswerButton(new Viewbox { Child = Art.Visual(w.Img, w.Emoji, 200), Margin = new Thickness(20) }, size);
                if (!wordsAsChoices) btn.Height = h;
                var captured = btn;
                btn.Click += (o, ev) => AnswerWordImage(captured, w);
                Canvas.SetLeft(btn, x0 + k * (size + gap));
                Canvas.SetTop(btn, H - h - 30);
                _canvas.Children.Add(btn);
            }
            var speaker = SpeakerButton(() => wordsAsChoices
                ? "Regarde l'image : " + _target.Said + ". Trouve le mot " + _target.Said + " ! Il commence par " + _target.Text[0] + " !"
                : "Lis le mot : " + Spell(_target.Text) + "... " + _target.Said + " ! Trouve l'image !", 96);
            Canvas.SetLeft(speaker, W - 140);
            Canvas.SetTop(speaker, 20);
            _canvas.Children.Add(speaker);
            SetConsigne(wordsAsChoices ? Art.Visual(_target.Img, _target.Emoji, 80) : WordVisual(_target.Text, 60),
                () => wordsAsChoices ? "Trouve le mot " + _target.Said + " !" : "Lis : " + _target.Said + ". Trouve l'image !");
            SetBody(_canvas);
            Schedule(400, () => Speak(wordsAsChoices ? "Trouve le mot : " + _target.Said + " !" : "Lis le mot, et trouve l'image !"));
        }

        private void AnswerWordImage(Button btn, Word w)
        {
            if (_act != 2 || Locked) return;
            if (w == _target)
            {
                Locked = true;
                GameKit.Success();
                Pulse(btn);
                Speak("Oui ! " + Spell(w.Text) + " : " + w.Said + " ! " + GameKit.Praise());
                RewardStar();
                Celebrate();
                Schedule(3400, StartWordImage);
            }
            else
            {
                Shake(btn);
                Speak("Ça, c'est " + w.Said + ". Cherche " + _target.Said + " : ça commence par " + _target.Text[0] + " !");
            }
        }

        // ==================================================================
        // 3 · Les lettres mobiles
        // ==================================================================
        private void StartMobile()
        {
            _act = 3;
            Locked = false;
            _round++;
            if (_round > 5) { Finish("Tu écris des mots ! "); return; }
            // Des mots courts d'abord, plus longs au fil des tours et du niveau.
            int maxLen = Math.Min(7, 3 + _round / 2 + Level.Current);
            var pool = _deck.Where(w => w.Text.Length <= maxLen).ToList();
            _target = pool[(_round - 1) % pool.Count];
            Question.Text = "✍️ Écris : " + _target.Text;
            _canvas = new Canvas { Width = W, Height = H };
            _slots = new List<Border>();
            _slotPos = 0;

            // Le modèle : l'image et le mot écrit, en haut.
            var top = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Center };
            top.Children.Add(Art.Visual(_target.Img, _target.Emoji, 150));
            var modelWord = WordVisual(_target.Text, 70);
            modelWord.Margin = new Thickness(30, 0, 0, 0);
            modelWord.VerticalAlignment = VerticalAlignment.Center;
            top.Children.Add(modelWord);
            var topBox = new Viewbox { Child = top, Width = 900, Height = 160, StretchDirection = StretchDirection.DownOnly };
            Canvas.SetLeft(topBox, W / 2 - 450);
            Canvas.SetTop(topBox, 10);
            _canvas.Children.Add(topBox);

            // Les cases vides du mot.
            int n = _target.Text.Length;
            double slotW = Math.Min(120, (W - 200) / n), slotGap = 14;
            double sx0 = (W - n * slotW - (n - 1) * slotGap) / 2;
            for (int i = 0; i < n; i++)
            {
                var slot = new Border
                {
                    Width = slotW, Height = slotW * 1.15, CornerRadius = new CornerRadius(18),
                    Background = new SolidColorBrush(Color.FromArgb(0xAA, 0xFF, 0xFF, 0xFF)),
                    BorderBrush = new SolidColorBrush(Color.FromRgb(0xB3, 0x88, 0xFF)), BorderThickness = new Thickness(4),
                };
                Canvas.SetLeft(slot, sx0 + i * (slotW + slotGap));
                Canvas.SetTop(slot, 200);
                _canvas.Children.Add(slot);
                _slots.Add(slot);
            }

            // Les lettres mobiles : celles du mot + deux intruses, mélangées.
            var letters = _target.Text.ToList();
            var alphabet = "ABCDEFGHIJKLMNOPRSTUV".Where(c => !letters.Contains(c)).ToList();
            var shuffledAlpha = GameKit.Shuffle(alphabet);
            letters.Add(shuffledAlpha[0]);
            letters.Add(shuffledAlpha[1]);
            letters = GameKit.Shuffle(letters);
            var (size, x0, gap) = RowLayout(letters.Count, 150, 20);
            for (int k = 0; k < letters.Count; k++)
            {
                char c = letters[k];
                var btn = AnswerButton(new Viewbox { Child = Letter(c, 100), Margin = new Thickness(14) }, size);
                var captured = btn;
                btn.Click += (o, ev) => PickLetter(captured, c);
                Canvas.SetLeft(btn, x0 + k * (size + gap));
                Canvas.SetTop(btn, H - size - 30);
                _canvas.Children.Add(btn);
            }
            GlowSlot();
            SetConsigne(WordVisual(_target.Text, 56), () => "Écris " + _target.Said + " : " + Spell(_target.Text) + ". Regarde la lettre qui va dans la case qui brille !");
            SetBody(_canvas);
            Schedule(400, () => Speak("Écris " + _target.Said + " ! Première lettre : " + _target.Text[0] + " !"));
        }

        private void GlowSlot()
        {
            for (int i = 0; i < _slots.Count; i++)
            {
                _slots[i].BorderBrush = new SolidColorBrush(i == _slotPos ? Color.FromRgb(0xFF, 0xB3, 0x00) : Color.FromRgb(0xB3, 0x88, 0xFF));
                _slots[i].Effect = i == _slotPos ? new System.Windows.Media.Effects.DropShadowEffect { BlurRadius = 40, ShadowDepth = 0, Color = Color.FromRgb(0xFF, 0xB3, 0x00), Opacity = 0.95 } : null;
            }
        }

        private void PickLetter(Button btn, char c)
        {
            if (_act != 3 || Locked) return;
            char want = _target.Text[_slotPos];
            if (c != want)
            {
                Shake(btn);
                Speak("Non, ça c'est " + c + ". Il faut " + want + " !");
                return;
            }
            GameKit.Success();
            Pulse(btn);
            // La lettre se pose dans sa case.
            _slots[_slotPos].Child = new Viewbox { Child = Letter(c, 100), Margin = new Thickness(8) };
            _slotPos++;
            if (_slotPos == 1) RewardStar();
            if (_slotPos >= _target.Text.Length)
            {
                Locked = true;
                foreach (var s in _slots) s.Effect = null;
                Speak(Spell(_target.Text) + " : " + _target.Said + " ! Tu as écrit " + _target.Said + " ! " + GameKit.Praise());
                Celebrate();
                Schedule(4200, StartMobile);
                return;
            }
            GlowSlot();
            Speak(c + " ! Maintenant : " + _target.Text[_slotPos] + " !");
        }


        // ==================================================================
        // 4 · Le son de la fin (les rimes)
        // ==================================================================
        private void StartRhymes()
        {
            _act = 4;
            Locked = false;
            _round++;
            if (_round > 6) { Finish("Tu entends les rimes ! "); return; }
            var family = Rhymes[(_round - 1) % Rhymes.Length];
            var good = GameKit.Rand(family.Members);
            var othersPool = Rhymes.Where(r => r.Sound != family.Sound).SelectMany(r => r.Members).ToList();
            int n = Math.Min(4, Level.Choices);
            var choices = GameKit.Shuffle(GameKit.Shuffle(othersPool).Take(n - 1).Concat(new[] { good }));
            _target = good;
            Question.Text = "👂 Quel mot finit par " + family.Sound.ToUpperInvariant() + " ?";
            _canvas = new Canvas { Width = W, Height = H };

            var (size, x0, gap) = RowLayout(choices.Count, 340, 50);
            var pads = new List<FrameworkElement>();
            for (int k = 0; k < choices.Count; k++)
            {
                var w = choices[k];
                var btn = AnswerButton(new Viewbox { Child = Art.Visual(w.Img, w.Emoji, 220), Margin = new Thickness(24) }, size);
                var captured = btn;
                btn.Click += (o, ev) => AnswerRhyme(captured, w, family.Sound);
                Canvas.SetLeft(btn, x0 + k * (size + gap));
                Canvas.SetTop(btn, 150);
                _canvas.Children.Add(btn);
                pads.Add(btn);
            }
            // Un regard nomme l'image (on écoute la fin du mot) ; la fixation choisit.
            var list = choices;
            SetGazePads(pads, i => { if (i >= 0 && _act == 4 && !Locked) Speak(list[i].Said + "..."); });

            var speaker = SpeakerButton(() => "Quel mot finit par " + family.Sound + " ? Écoute : " + string.Join("... ", list.Select(x => x.Said)) + ". Lequel finit par " + family.Sound + " ?", 96);
            Canvas.SetLeft(speaker, W - 140);
            Canvas.SetTop(speaker, 20);
            _canvas.Children.Add(speaker);
            SetConsigne(new TextBlock { Text = family.Sound.ToUpperInvariant(), FontSize = 64, FontWeight = FontWeights.ExtraBold, Foreground = new SolidColorBrush(Color.FromRgb(0x7E, 0x3F, 0xF2)) },
                () => "Quel mot finit par " + family.Sound + " ? Regarde une image pour l'entendre !");
            SetBody(_canvas);
            Schedule(400, () => Speak("Quel mot finit par " + family.Sound + " ?"));
        }

        private void AnswerRhyme(Button btn, Word w, string sound)
        {
            if (_act != 4 || Locked) return;
            if (w == _target)
            {
                Locked = true;
                SetGazePads(null, null);
                GameKit.Success();
                Pulse(btn);
                Speak("Oui ! " + Cap(w.Said) + " finit par " + sound + " ! " + GameKit.Praise());
                RewardStar();
                Celebrate();
                Schedule(3400, StartRhymes);
            }
            else
            {
                Shake(btn);
                Speak(Cap(w.Said) + "... non, ça ne finit pas par " + sound + ". Écoute encore !");
            }
        }

        // ------------------------------------------------------------------
        private void Finish(string bravo)
        {
            Locked = true;
            SetGazePads(null, null);
            Speak(bravo + GameKit.Praise());
            Celebrate();
            Schedule(4000, NewRound);
        }

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
