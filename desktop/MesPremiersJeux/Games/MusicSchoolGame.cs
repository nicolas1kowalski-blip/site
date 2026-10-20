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
    /// 🎵 « Le petit orchestre » (PS/MS) : apprendre la musique en quatre actes.
    ///   1. LES INSTRUMENTS — regarder un instrument le fait jouer et dit son nom.
    ///   2. QUI FAIT CE BRUIT ? — on entend un instrument, on le retrouve parmi trois.
    ///   3. LE XYLOPHONE — cinq lames de couleur : do, ré, mi, fa, sol ; chaque
    ///      lame chante sa note et dit son nom (du grave à l'aigu).
    ///   4. LA CHANSON — « Au clair de la lune » : la lame à jouer brille,
    ///      l'enfant joue la mélodie note après note, puis on l'écoute en entier.
    /// Les sons sont synthétisés ; le parent peut déposer de vrais sons dans
    /// Contenu\Sons (tambour.wav, guitare.wav, xylophone.wav, piano.wav,
    /// trompette.wav, violon.wav).
    /// </summary>
    public sealed class MusicSchoolGame : GameControl
    {
        private const double W = 1400, H = 680;

        private sealed class Instr
        {
            public string Key, Name, Article, Emoji, Says;
        }

        private static readonly Instr[] Instruments =
        {
            new Instr { Key = "tambour", Name = "tambour", Article = "le", Emoji = "🥁", Says = "Boum, boum, boum !" },
            new Instr { Key = "guitare", Name = "guitare", Article = "la", Emoji = "🎸", Says = "Elle a des cordes qu'on pince !" },
            new Instr { Key = "xylophone", Name = "xylophone", Article = "le", Emoji = "🎹", Says = "On tape sur ses lames de couleur !" },
            new Instr { Key = "piano", Name = "piano", Article = "le", Emoji = "🎹", Says = "Il a des touches blanches et noires !" },
            new Instr { Key = "trompette", Name = "trompette", Article = "la", Emoji = "🎺", Says = "On souffle dedans très fort ! Tut, tut !" },
            new Instr { Key = "violon", Name = "violon", Article = "le", Emoji = "🎻", Says = "On le frotte avec un archet !" },
        };

        // Les cinq lames du xylophone : note, nom, couleur.
        private static readonly (int Degree, string Name, Color Color)[] Bars =
        {
            (0, "do", Color.FromRgb(0xFF, 0x6B, 0x6B)),
            (1, "ré", Color.FromRgb(0xFF, 0xA9, 0x3C)),
            (2, "mi", Color.FromRgb(0xFF, 0xD9, 0x3C)),
            (3, "fa", Color.FromRgb(0x7B, 0xE0, 0x6C)),
            (4, "sol", Color.FromRgb(0x5D, 0xAD, 0xE2)),
        };

        // « Au clair de la lune » (première phrase), en degrés des lames.
        private static readonly int[] Song = { 0, 0, 0, 1, 2, 1, 0, 2, 1, 1, 0 };
        private static readonly string[] SongWords = { "Au", "clair", "de", "la", "lu", "ne", "mon", "a", "mi", "Pier", "rot" };

        private Canvas _canvas;
        private int _act;
        private bool[] _seen;
        private List<Instr> _session;
        private int _quizRound;
        private Instr _quizTarget;
        private int _played;          // acte 3 : notes essayées
        private int _songPos;         // acte 4 : prochaine note à jouer
        private List<Border> _bars;
        private TextBlock _lyrics;

        public MusicSchoolGame(Action celebrate) : base(celebrate) { }

        protected override void NewRound()
        {
            _session = GameKit.Shuffle(Instruments).ToList();
            StartInstruments();
        }

        private static FrameworkElement Pic(Instr i, double size) => Art.Visual(i.Key, i.Emoji, size);

        // ==================================================================
        // ACTE 1 — Les instruments
        // ==================================================================
        private void StartInstruments()
        {
            _act = 1;
            Locked = false;
            _seen = new bool[_session.Count];
            Question.Text = "🎵 Le petit orchestre";
            _canvas = new Canvas { Width = W, Height = H };

            double size = 300, gapX = 60, gapY = 30;
            int cols = 3;
            double x0 = (W - cols * size - (cols - 1) * gapX) / 2, y0 = 20;
            for (int i = 0; i < _session.Count; i++)
            {
                var ins = _session[i];
                int idx = i;
                var content = new StackPanel { HorizontalAlignment = HorizontalAlignment.Center };
                content.Children.Add(Pic(ins, 180));
                content.Children.Add(new TextBlock
                {
                    Text = Cap(ins.Article) + " " + ins.Name, FontSize = 34, FontWeight = FontWeights.Bold,
                    Foreground = new SolidColorBrush(Color.FromRgb(0x3B, 0x2A, 0x5A)), HorizontalAlignment = HorizontalAlignment.Center,
                    Margin = new Thickness(0, 6, 0, 0),
                });
                var btn = AnswerButton(new Viewbox { Child = content, Margin = new Thickness(14) }, size);
                btn.Height = size;
                var captured = btn;
                btn.Click += (o, ev) => PlayInstrument(captured, idx);
                Canvas.SetLeft(btn, x0 + (i % cols) * (size + gapX));
                Canvas.SetTop(btn, y0 + (i / cols) * (size + gapY));
                _canvas.Children.Add(btn);
            }

            SetConsigne(Art.ForEmoji("🎵", 110), () => "Regarde chaque instrument pour l'entendre jouer !");
            SetBody(_canvas);
            Schedule(450, () => Speak("Bienvenue dans le petit orchestre ! Regarde chaque instrument pour l'entendre jouer !"));
        }

        private void PlayInstrument(Button btn, int i)
        {
            if (_act != 1 || Locked) return;
            var ins = _session[i];
            Pulse(btn);
            SoundFx.Instrument(ins.Key);
            bool first = !_seen[i];
            _seen[i] = true;
            Speech.WhenQuiet(() =>
            {
                if (Closed || _act != 1) return;
                Speak(Cap(ins.Article) + " " + ins.Name + " ! " + ins.Says);
            }, 1.6, 3);
            if (first) RewardStar();
            if (_seen.All(x => x))
            {
                Locked = true;
                Schedule(3200, () =>
                {
                    Speak("Tu connais tous les instruments ! Maintenant, écoute bien : qui fait ce bruit ?");
                    Schedule(3800, StartQuiz);
                });
            }
        }

        // ==================================================================
        // ACTE 2 — Qui fait ce bruit ?
        // ==================================================================
        private void StartQuiz()
        {
            _act = 2;
            _quizRound = 0;
            NextQuiz();
        }

        private void NextQuiz()
        {
            Locked = false;
            _quizRound++;
            if (_quizRound > 4) { StartXylophone(); return; }

            _quizTarget = _session[(_quizRound - 1) % _session.Count];
            var choices = GameKit.PickN(_session, 3, _quizTarget);
            Question.Text = "👂 Qui fait ce bruit ?";
            _canvas = new Canvas { Width = W, Height = H };

            double size = 330, gap = 60;
            double x0 = (W - 3 * size - 2 * gap) / 2;
            for (int k = 0; k < choices.Count; k++)
            {
                var ins = choices[k];
                var btn = AnswerButton(new Viewbox { Child = Pic(ins, 200), Margin = new Thickness(26) }, size);
                var captured = btn;
                btn.Click += (o, ev) => AnswerQuiz(captured, ins);
                Canvas.SetLeft(btn, x0 + k * (size + gap));
                Canvas.SetTop(btn, 150);
                _canvas.Children.Add(btn);
            }

            // Le haut-parleur REJOUE le son (pas le nom : c'est l'oreille qui travaille).
            var ear = AnswerButton(new TextBlock { Text = "👂", FontSize = 90, HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center }, 150);
            ear.Click += (o, ev) => { if (!Locked) SoundFx.Instrument(_quizTarget.Key); };
            Canvas.SetLeft(ear, W / 2 - 75);
            Canvas.SetTop(ear, 10);
            _canvas.Children.Add(ear);

            SetConsigne(new TextBlock { Text = "👂", FontSize = 60 }, () => "Écoute... Quel instrument fait ce bruit ? Regarde-le ! L'oreille le rejoue.");
            SetBody(_canvas);
            Schedule(400, () =>
            {
                Speak(_quizRound == 1 ? "Écoute bien... Quel instrument fait ce bruit ?" : "Et celui-là ?");
                Schedule(2300, () => SoundFx.Instrument(_quizTarget.Key));
            });
            ArmHint(ear, () => "Regarde l'oreille pour réentendre, puis l'instrument qui fait ce bruit !");
        }

        private void AnswerQuiz(Button btn, Instr ins)
        {
            if (_act != 2 || Locked) return;
            if (ins == _quizTarget)
            {
                Locked = true;
                DisarmHint();
                GameKit.Success();
                Pulse(btn);
                SoundFx.Instrument(ins.Key);
                Speech.WhenQuiet(() => { if (!Closed) Speak("Oui ! C'est " + ins.Article + " " + ins.Name + " ! " + GameKit.Praise()); }, 1.6, 3);
                Celebrate();
                Schedule(3400, NextQuiz);
            }
            else
            {
                Shake(btn);
                SoundFx.Instrument(ins.Key);
                Speech.WhenQuiet(() =>
                {
                    if (Closed || _act != 2) return;
                    Speak("Ça, c'est " + ins.Article + " " + ins.Name + ". Écoute encore !");
                    Schedule(2200, () => { if (!Locked) SoundFx.Instrument(_quizTarget.Key); });
                }, 1.6, 3);
            }
        }

        // ==================================================================
        // ACTE 3 — Le xylophone (do ré mi fa sol)
        // ==================================================================
        private void StartXylophone()
        {
            _act = 3;
            Locked = false;
            _played = 0;
            Question.Text = "🎹 Le xylophone";
            BuildXylophone();
            SetConsigne(Art.Visual("xylophone", "🎹", 110), () => "Regarde les lames du xylophone : chacune chante sa note ! Do, ré, mi, fa, sol !");
            SetBody(_canvas);
            Schedule(450, () => Speak("Voici le xylophone ! Regarde une lame pour l'entendre chanter. Du grave... à l'aigu !"));
        }

        private void BuildXylophone()
        {
            _canvas = new Canvas { Width = W, Height = H };
            _bars = new List<Border>();
            double barW = 190, gap = 34, baseH = 520;
            double x0 = (W - 5 * barW - 4 * gap) / 2;
            for (int i = 0; i < 5; i++)
            {
                var (deg, name, col) = Bars[i];
                double h = baseH - i * 62; // les lames raccourcissent vers l'aigu
                var label = new TextBlock
                {
                    Text = name, FontSize = 56, FontWeight = FontWeights.ExtraBold, Foreground = Brushes.White,
                    HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Bottom,
                    Margin = new Thickness(0, 0, 0, 22),
                };
                var bar = new Border
                {
                    Width = barW, Height = h, CornerRadius = new CornerRadius(40),
                    Background = new LinearGradientBrush(Lighten(col), col, 90),
                    BorderBrush = Brushes.White, BorderThickness = new Thickness(5),
                    Child = label, RenderTransformOrigin = new Point(0.5, 1),
                };
                var btn = new Button
                {
                    Style = (Style)Application.Current.Resources["AnswerButton"],
                    Width = barW + 16, Height = h + 16, Padding = new Thickness(0),
                    Background = Brushes.Transparent, Content = bar,
                };
                int idx = i;
                btn.Click += (o, ev) => BarPlayed(idx);
                Canvas.SetLeft(btn, x0 + i * (barW + gap));
                Canvas.SetTop(btn, H - 40 - h - 16);
                _canvas.Children.Add(btn);
                _bars.Add(bar);
            }
        }

        private void BarPlayed(int i)
        {
            if (Locked) return;
            var (deg, name, col) = Bars[i];
            SoundFx.PlayNote(deg);
            Pulse(_bars[i]);
            if (_act == 3)
            {
                Speech.WhenQuiet(() => { if (!Closed && _act == 3) Speak(name + " !"); }, 0.5, 2);
                if (++_played == 1) RewardStar();
                if (_played >= 6)
                {
                    Locked = true;
                    Schedule(1800, () =>
                    {
                        Speak("Bravo ! Maintenant, on joue une chanson ensemble : Au clair de la lune ! Joue la lame qui brille !");
                        Schedule(5200, StartSong);
                    });
                }
                return;
            }
            if (_act == 4) SongStep(i);
        }

        // ==================================================================
        // ACTE 4 — La chanson : « Au clair de la lune »
        // ==================================================================
        private void StartSong()
        {
            _act = 4;
            Locked = false;
            _songPos = 0;
            Question.Text = "🌙 Au clair de la lune";
            BuildXylophone();
            _lyrics = new TextBlock
            {
                FontSize = 44, FontWeight = FontWeights.Bold, Foreground = new SolidColorBrush(Color.FromRgb(0x3B, 0x2A, 0x5A)),
                Width = W, TextAlignment = TextAlignment.Center,
            };
            Canvas.SetTop(_lyrics, 18);
            _canvas.Children.Add(_lyrics);
            var moon = Art.Visual("lune", "🌙", 120);
            Canvas.SetLeft(moon, 40);
            Canvas.SetTop(moon, 10);
            _canvas.Children.Add(moon);
            SetConsigne(Art.Visual("lune", "🌙", 110), () => "Au clair de la lune ! Joue la lame qui brille, note après note !");
            SetBody(_canvas);
            ShowLyrics();
            Glow(Song[0]);
        }

        private void ShowLyrics()
        {
            // Les syllabes déjà jouées en clair, la prochaine en gras entre crochets.
            var parts = new List<string>();
            for (int k = 0; k < Song.Length; k++)
                parts.Add(k == _songPos ? "[" + SongWords[k] + "]" : SongWords[k]);
            _lyrics.Text = string.Join(" ", parts);
        }

        private void SongStep(int bar)
        {
            int want = Song[_songPos];
            if (bar != want)
            {
                // On a quand même entendu la note (c'est de la musique !) ; on remontre.
                Glow(want);
                if (_songPos == 0) Speak("Joue la lame qui brille !");
                return;
            }
            _songPos++;
            if (_songPos == 1) RewardStar();
            if (_songPos >= Song.Length)
            {
                Locked = true;
                ShowLyrics();
                foreach (var b in _bars) b.BeginAnimation(UIElement.OpacityProperty, null);
                GameKit.Success();
                Speak("Tu as joué toute la chanson ! Écoute-la !");
                Schedule(2600, PlayBack);
                return;
            }
            ShowLyrics();
            Glow(Song[_songPos]);
        }

        // Rejoue la mélodie en entier, lame après lame, puis la fête.
        private void PlayBack()
        {
            for (int k = 0; k < Song.Length; k++)
            {
                int bar = Song[k];
                Schedule(60 + k * 520, () =>
                {
                    SoundFx.PlayNote(Bars[bar].Degree);
                    Pulse(_bars[bar]);
                });
            }
            Schedule(60 + Song.Length * 520 + 400, () =>
            {
                Speak("Au clair de la lune, mon ami Pierrot ! Bravo, petite musicienne ! " + GameKit.Praise());
                Celebrate();
                Schedule(4500, NewRound);
            });
        }

        private void Glow(int bar)
        {
            for (int i = 0; i < _bars.Count; i++)
            {
                _bars[i].BeginAnimation(UIElement.OpacityProperty, null);
                _bars[i].Opacity = i == bar ? 1 : 0.55;
            }
            _bars[bar].BeginAnimation(UIElement.OpacityProperty, new DoubleAnimation(1, 0.6, TimeSpan.FromMilliseconds(500))
            { AutoReverse = true, RepeatBehavior = RepeatBehavior.Forever });
        }

        // ------------------------------------------------------------------
        private static void Pulse(FrameworkElement el)
        {
            var sc = new ScaleTransform(1, 1);
            if (el.RenderTransformOrigin == new Point(0, 0)) el.RenderTransformOrigin = new Point(0.5, 0.5);
            el.RenderTransform = sc;
            var a = new DoubleAnimation(1, 1.12, TimeSpan.FromMilliseconds(140)) { AutoReverse = true, EasingFunction = new SineEase() };
            sc.BeginAnimation(ScaleTransform.ScaleXProperty, a);
            sc.BeginAnimation(ScaleTransform.ScaleYProperty, a);
        }

        private static Color Lighten(Color c) => Color.FromRgb(
            (byte)(c.R + (255 - c.R) * 0.45), (byte)(c.G + (255 - c.G) * 0.45), (byte)(c.B + (255 - c.B) * 0.45));

        private static string Cap(string s) => s.Length == 0 ? s : char.ToUpperInvariant(s[0]) + s.Substring(1);
    }
}
