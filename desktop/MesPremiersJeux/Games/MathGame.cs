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
    /// 🔢 LES NOMBRES JUSQU'À 10 (GS · CP), trois entrées :
    ///   1. UN DE PLUS, UN DE MOINS — des objets, on en ajoute (ou retire) un :
    ///      combien maintenant ? Puis l'objet arrive (ou part) sous ses yeux.
    ///   2. PARTAGER EN DEUX — des gâteaux pour Laura et Nounours, autant pour
    ///      chacun : combien chacun ? Puis les gâteaux se répartissent.
    ///   3. LA BANDE NUMÉRIQUE — 1 à 10, un nombre manque : lequel ?
    /// Les grands nombres n'arrivent qu'avec le niveau (5, 7, 10).
    /// </summary>
    public sealed class MathGame : GameControl
    {
        private const double W = 1400, H = 680;

        private static readonly string[] Num = { "zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix", "onze" };

        private static readonly (string Img, string Emoji, string One, string Many)[] Things =
        {
            ("pomme", "🍎", "une pomme", "pommes"), ("fraise", "🍓", "une fraise", "fraises"), ("ballon", "🎈", "un ballon", "ballons"),
            ("etoile", "⭐", "une étoile", "étoiles"), ("fleur", "🌸", "une fleur", "fleurs"), ("cookie", "🍪", "un gâteau", "gâteaux"),
            ("poussin", "🐤", "un poussin", "poussins"), ("coeur", "❤️", "un cœur", "cœurs"), ("cupcake", "🧁", "un gâteau", "gâteaux"),
        };

        private readonly int _startAct; // 1 un de plus/moins · 2 partager · 3 bande numérique
        private Canvas _canvas;
        private int _act, _round, _answer;
        private (string Img, string Emoji, string One, string Many) _thing;
        private readonly List<FrameworkElement> _items = new List<FrameworkElement>();

        public MathGame(Action celebrate, int startAct = 1) : base(celebrate) { _startAct = startAct; }

        protected override void NewRound()
        {
            _round = 0;
            if (_startAct >= 3) NextStrip();
            else if (_startAct == 2) NextShare();
            else NextPlusMinus();
        }

        private static TextBlock Digit(int n, double size = 110) => new TextBlock
        {
            Text = n.ToString(), FontSize = size, FontWeight = FontWeights.ExtraBold,
            Foreground = new SolidColorBrush(Color.FromRgb(0x2A, 0x5A, 0x3A)), HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center,
        };

        // Les objets en ligne(s), centrés ; taille adaptée au nombre.
        private void LayItems(int n, double top, double areaW, double left = 0)
        {
            _items.Clear();
            int perRow = n <= 5 ? n : (n + 1) / 2;
            double size = Math.Min(150, (areaW - 40) / Math.Max(1, perRow) - 14);
            for (int i = 0; i < n; i++)
            {
                int row = i / perRow, col = i % perRow;
                int inRow = Math.Min(perRow, n - row * perRow);
                double x0 = left + (areaW - inRow * (size + 14)) / 2;
                var el = Art.Visual(_thing.Img, _thing.Emoji, size);
                Canvas.SetLeft(el, x0 + col * (size + 14));
                Canvas.SetTop(el, top + row * (size + 10));
                _canvas.Children.Add(el);
                _items.Add(el);
            }
        }

        private void NumberRow(IList<int> options, Action<Button, int> onPick, double top)
        {
            double gap = 40, size = Math.Min(200, (W - 100 - (options.Count - 1) * gap) / options.Count);
            double x0 = (W - options.Count * size - (options.Count - 1) * gap) / 2;
            for (int k = 0; k < options.Count; k++)
            {
                int v = options[k];
                var btn = AnswerButton(Digit(v), size);
                var captured = btn;
                btn.Click += (o, ev) => onPick(captured, v);
                Canvas.SetLeft(btn, x0 + k * (size + gap));
                Canvas.SetTop(btn, top);
                _canvas.Children.Add(btn);
            }
        }

        private List<int> Options(int answer, int min, int max)
        {
            var pool = Enumerable.Range(min, max - min + 1).ToList();
            return Level.Pick(pool, answer, 4).OrderBy(v => v).ToList();
        }

        // ==================================================================
        // 1 · Un de plus, un de moins
        // ==================================================================
        private void NextPlusMinus()
        {
            _act = 1;
            Locked = false;
            _round++;
            if (_round > 6) { Finish("Un de plus, un de moins : tu sais ! "); return; }
            _thing = Things[GameKit.RandInt(Things.Length)];
            bool plus = _round % 2 == 1;
            int max = Level.MaxNumber;
            int n = plus ? GameKit.NextNumber("math-plus", 1, max - 1) : GameKit.NextNumber("math-moins", 2, max);
            _answer = plus ? n + 1 : n - 1;
            Question.Text = plus ? "➕ Un de plus !" : "➖ Un de moins !";
            _canvas = new Canvas { Width = W, Height = H };
            LayItems(n, 30, W);

            // Le signe, en grand, à droite.
            var sign = new TextBlock { Text = plus ? "+1" : "−1", FontSize = 90, FontWeight = FontWeights.ExtraBold, Foreground = new SolidColorBrush(Color.FromRgb(0x7E, 0x3F, 0xF2)) };
            Canvas.SetLeft(sign, W - 190);
            Canvas.SetTop(sign, 40);
            _canvas.Children.Add(sign);

            NumberRow(Options(_answer, Math.Max(1, _answer - 2), Math.Min(max, _answer + 2)), AnswerPlusMinus, H - 230);
            string ask = Num[n] + " " + _thing.Many + "... " + (plus ? "un de plus" : "un de moins") + " : combien ?";
            SetConsigne(Art.Visual(_thing.Img, _thing.Emoji, 80), () => "Il y a " + Num[n] + " " + _thing.Many + ". " + (plus ? "J'en ajoute un" : "J'en enlève un") + " ! Combien ça fait ?");
            SetBody(_canvas);
            Schedule(400, () => Speak(ask));
        }

        private void AnswerPlusMinus(Button btn, int v)
        {
            if (_act != 1 || Locked) return;
            if (v != _answer)
            {
                Shake(btn);
                Speak("Non, pas " + Num[v] + ". Compte bien !");
                return;
            }
            Locked = true;
            GameKit.Success();
            Pulse(btn);
            bool plus = _round % 2 == 1;
            // L'objet arrive (ou s'en va) : on voit le nombre changer.
            if (plus)
            {
                int n = _items.Count;
                var el = Art.Visual(_thing.Img, _thing.Emoji, 150);
                el.Opacity = 0;
                Canvas.SetLeft(el, W - 190);
                Canvas.SetTop(el, 150);
                _canvas.Children.Add(el);
                el.BeginAnimation(UIElement.OpacityProperty, new DoubleAnimation(0, 1, TimeSpan.FromMilliseconds(500)));
                var last = _items[n - 1];
                el.BeginAnimation(Canvas.LeftProperty, new DoubleAnimation(W - 190, Canvas.GetLeft(last) + 164, TimeSpan.FromMilliseconds(900)) { EasingFunction = new SineEase() });
                el.BeginAnimation(Canvas.TopProperty, new DoubleAnimation(150, Canvas.GetTop(last), TimeSpan.FromMilliseconds(900)) { EasingFunction = new SineEase() });
            }
            else
            {
                var last = _items[_items.Count - 1];
                last.BeginAnimation(UIElement.OpacityProperty, new DoubleAnimation(1, 0, TimeSpan.FromMilliseconds(700)));
            }
            Speak("Oui ! " + Cap(Num[_answer]) + " " + _thing.Many + " ! " + GameKit.Praise());
            RewardStar();
            Celebrate();
            Schedule(3400, NextPlusMinus);
        }

        // ==================================================================
        // 2 · Partager en deux
        // ==================================================================
        private void NextShare()
        {
            _act = 2;
            Locked = false;
            _round++;
            if (_round > 5) { Finish("Tu sais partager ! "); return; }
            _thing = Things[GameKit.RandInt(Things.Length)];
            int half = GameKit.NextNumber("math-partage", 1, Level.MaxNumber / 2);
            int total = half * 2;
            _answer = half;
            Question.Text = "🍰 Autant pour chacun !";
            _canvas = new Canvas { Width = W, Height = H };
            LayItems(total, 20, W);

            // Les deux assiettes : Laura et Nounours.
            string name = (Settings.Load().ChildName ?? "Laura").Trim();
            foreach (var (label, img, emoji, x) in new[] { (name, "princesse", "👧", 250.0), ("Nounours", "ours-peluche", "🧸", W - 250 - 220) })
            {
                var plate = new StackPanel { HorizontalAlignment = HorizontalAlignment.Center };
                plate.Children.Add(Art.Visual(img, emoji, 120));
                plate.Children.Add(new TextBlock { Text = label, FontSize = 30, FontWeight = FontWeights.Bold, Foreground = new SolidColorBrush(Color.FromRgb(0x3B, 0x2A, 0x5A)), HorizontalAlignment = HorizontalAlignment.Center });
                var box = new Border { Width = 220, Child = plate };
                Canvas.SetLeft(box, x);
                Canvas.SetTop(box, 250);
                _canvas.Children.Add(box);
            }

            NumberRow(Options(half, 1, Math.Max(3, half + 2)), AnswerShare, H - 230);
            SetConsigne(Art.Visual(_thing.Img, _thing.Emoji, 80), () => Num[total] + " " + _thing.Many + " pour " + name + " et Nounours, autant pour chacun. Combien chacun ?");
            SetBody(_canvas);
            Schedule(400, () => Speak(Num[total] + " " + _thing.Many + ", pour deux. Combien chacun ?"));
        }

        private void AnswerShare(Button btn, int v)
        {
            if (_act != 2 || Locked) return;
            if (v != _answer)
            {
                Shake(btn);
                Speak("Non, pas " + Num[v] + ". Un pour chacun, un pour chacun... Combien ?");
                return;
            }
            Locked = true;
            GameKit.Success();
            Pulse(btn);
            // Les objets se répartissent : un à gauche, un à droite, en alternance.
            for (int i = 0; i < _items.Count; i++)
            {
                var el = _items[i];
                double tx = (i % 2 == 0 ? 250 + 110 : W - 250 - 110) - 40 + (i / 2) * 22 - _answer * 10;
                double ty = 390 + (i / 2) * 6;
                el.BeginAnimation(Canvas.LeftProperty, new DoubleAnimation(Canvas.GetLeft(el), tx, TimeSpan.FromMilliseconds(900)) { BeginTime = TimeSpan.FromMilliseconds(i * 160), EasingFunction = new SineEase() });
                el.BeginAnimation(Canvas.TopProperty, new DoubleAnimation(Canvas.GetTop(el), ty, TimeSpan.FromMilliseconds(900)) { BeginTime = TimeSpan.FromMilliseconds(i * 160), EasingFunction = new SineEase() });
            }
            Speak("Oui ! " + Cap(Num[_answer]) + " chacun ! " + GameKit.Praise());
            RewardStar();
            Celebrate();
            Schedule(3800 + _items.Count * 160, NextShare);
        }

        // ==================================================================
        // 3 · La bande numérique
        // ==================================================================
        private void NextStrip()
        {
            _act = 3;
            Locked = false;
            _round++;
            if (_round > 6) { Finish("Tu connais la bande des nombres ! "); return; }
            int max = Level.MaxNumber;
            _answer = GameKit.NextNumber("math-bande", 1, max);
            Question.Text = "🔢 Quel nombre manque ?";
            _canvas = new Canvas { Width = W, Height = H };

            double gap = 10, cell = Math.Min(120, (W - 80 - (max - 1) * gap) / max);
            double x0 = (W - max * cell - (max - 1) * gap) / 2;
            Border hole = null;
            for (int v = 1; v <= max; v++)
            {
                bool missing = v == _answer;
                var b = new Border
                {
                    Width = cell, Height = cell * 1.2, CornerRadius = new CornerRadius(20),
                    Background = new SolidColorBrush(missing ? Color.FromArgb(0xAA, 0xFF, 0xFF, 0xFF) : Color.FromRgb(0xE3, 0xF6, 0xE8)),
                    BorderBrush = new SolidColorBrush(missing ? Color.FromRgb(0xFF, 0xB3, 0x00) : Color.FromRgb(0x7B, 0xE0, 0x6C)), BorderThickness = new Thickness(missing ? 6 : 3),
                    Child = missing ? new TextBlock { Text = "?", FontSize = cell * 0.6, FontWeight = FontWeights.ExtraBold, Foreground = new SolidColorBrush(Color.FromRgb(0xFF, 0xB3, 0x00)), HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center }
                                    : Digit(v, cell * 0.6),
                };
                if (missing) { hole = b; b.Effect = new System.Windows.Media.Effects.DropShadowEffect { BlurRadius = 40, ShadowDepth = 0, Color = Color.FromRgb(0xFF, 0xB3, 0x00), Opacity = 0.9 }; }
                Canvas.SetLeft(b, x0 + (v - 1) * (cell + gap));
                Canvas.SetTop(b, 120);
                _canvas.Children.Add(b);
            }
            var options = Options(_answer, Math.Max(1, _answer - 2), Math.Min(max, _answer + 2));
            NumberRow(options, (btn, v) => AnswerStrip(btn, v, hole), H - 230);
            string before = _answer > 1 ? Num[_answer - 1] : null, after = _answer < max ? Num[_answer + 1] : null;
            SetConsigne(new TextBlock { Text = "?", FontSize = 70, FontWeight = FontWeights.ExtraBold, Foreground = new SolidColorBrush(Color.FromRgb(0xFF, 0xB3, 0x00)) },
                () => "Compte avec moi : " + string.Join(", ", Enumerable.Range(1, max).Select(v => v == _answer ? "..." : Num[v])) + ". Quel nombre manque ?");
            SetBody(_canvas);
            Schedule(400, () => Speak(before != null && after != null ? Num[_answer - 1] + "... ? ... " + Num[_answer + 1] + ". Quel nombre manque ?"
                : before != null ? Num[_answer - 1] + "... et après ?" : "Avant " + Num[_answer + 1] + ", c'est ?"));
        }

        private void AnswerStrip(Button btn, int v, Border hole)
        {
            if (_act != 3 || Locked) return;
            if (v != _answer)
            {
                Shake(btn);
                Speak("Non, pas " + Num[v] + ". Compte : " + (_answer > 1 ? Num[_answer - 1] + ", et après ?" : "un ?"));
                return;
            }
            Locked = true;
            GameKit.Success();
            Pulse(btn);
            if (hole != null)
            {
                hole.Child = Digit(_answer, hole.Width * 0.6);
                hole.Background = new SolidColorBrush(Color.FromRgb(0xFF, 0xF1, 0xB8));
                hole.Effect = null;
            }
            Speak("Oui ! " + Cap(Num[_answer]) + " ! " + GameKit.Praise());
            RewardStar();
            Celebrate();
            Schedule(3200, NextStrip);
        }

        // ------------------------------------------------------------------
        private void Finish(string bravo)
        {
            Locked = true;
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
