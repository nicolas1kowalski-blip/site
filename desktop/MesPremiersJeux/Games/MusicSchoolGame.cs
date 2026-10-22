using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Media.Effects;
using System.Windows.Threading;
using MesPremiersJeux.Lib;

namespace MesPremiersJeux.Games
{
    /// <summary>
    /// 🎵 « Le petit orchestre » (PS/MS) : apprendre la musique.
    /// TOUT JOUE DÈS QUE LE REGARD SE POSE (pas besoin de fixer) — jamais de
    /// silence : regarder un instrument, c'est l'entendre.
    ///   1. LES INSTRUMENTS — un regard : ça joue ; une fixation : son nom.
    ///   2. QUI FAIT CE BRUIT ? — on entend un instrument, on le retrouve parmi trois.
    ///   3. LE XYLOPHONE — cinq lames : do, ré, mi, fa, sol, qui chantent au regard.
    ///   4. LA CHANSON — « Au clair de la lune » : la lame à jouer brille.
    ///   5. JE JOUE ! — on choisit un instrument (xylophone, piano, guitare,
    ///      trompette, violon, batterie) et on en joue librement au regard.
    /// Le parent peut déposer de vrais sons dans Contenu\Sons (tambour.wav,
    /// guitare.wav, xylophone.wav, piano.wav, trompette.wav, violon.wav,
    /// grosse-caisse.wav, caisse-claire.wav, tom.wav, cymbale.wav).
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

        // Les notes : nom et couleur (do … do aigu).
        private static readonly (string Name, Color Color)[] Notes =
        {
            ("do", Color.FromRgb(0xFF, 0x6B, 0x6B)), ("ré", Color.FromRgb(0xFF, 0xA9, 0x3C)), ("mi", Color.FromRgb(0xFF, 0xD9, 0x3C)),
            ("fa", Color.FromRgb(0x7B, 0xE0, 0x6C)), ("sol", Color.FromRgb(0x5D, 0xAD, 0xE2)), ("la", Color.FromRgb(0x7E, 0x8C, 0xF2)),
            ("si", Color.FromRgb(0xC0, 0x7E, 0xE6)), ("do", Color.FromRgb(0xFF, 0x8F, 0xC8)),
        };

        // « Au clair de la lune » (première phrase), en degrés.
        private static readonly int[] Song = { 0, 0, 0, 1, 2, 1, 0, 2, 1, 1, 0 };
        private static readonly string[] SongWords = { "Au", "clair", "de", "la", "lu", "ne", "mon", "a", "mi", "Pier", "rot" };

        private readonly int _startAct; // 1 instruments · 3 xylophone et chanson · 5 je joue
        private Canvas _canvas;
        private int _act;
        private bool[] _seen;
        private List<Instr> _session;
        private int _quizRound;
        private Instr _quizTarget;
        private int _played;
        private int _songPos;
        private List<Border> _bars;
        private List<Button> _barButtons;
        private TextBlock _lyrics;
        private FrameworkElement _marker; // l'étoile qui désigne la lame à jouer
        private readonly Dictionary<int, DateTime> _lastPlay = new Dictionary<int, DateTime>();

        // REGARD TENU = la note se RÉPÈTE (do, do, do…) : pas besoin de sortir
        // et de revenir sur la lame. Toutes les 750 ms tant qu'on reste dessus.
        private int _gazeBar = -1;
        private Action<int> _repeatAction;
        private readonly DispatcherTimer _repeat = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(100) };
        private const int RepeatMs = 750;

        public MusicSchoolGame(Action celebrate, int startAct = 1) : base(celebrate)
        {
            _startAct = startAct;
            _repeat.Tick += (o, ev) =>
            {
                if (Closed || Locked || _gazeBar < 0 || _repeatAction == null) return;
                if (_lastPlay.TryGetValue(_gazeBar, out var t) && (DateTime.Now - t).TotalMilliseconds < RepeatMs) return;
                _repeatAction(_gazeBar);
            };
            Loaded += (o, ev) => _repeat.Start();
            Unloaded += (o, ev) => _repeat.Stop();
        }

        protected override void NewRound()
        {
            _session = GameKit.Shuffle(Instruments).ToList();
            if (_startAct >= 5) StartFreePlay();
            else if (_startAct >= 3) StartXylophone();
            else StartInstruments();
        }

        private static FrameworkElement Pic(Instr i, double size) => Art.Visual(i.Key, i.Emoji, size);

        // Un pad ne rejoue pas s'il vient de jouer (le regard tremble un peu).
        private bool CanPlay(int pad, int cooldownMs)
        {
            var now = DateTime.Now;
            if (_lastPlay.TryGetValue(pad, out var t) && (now - t).TotalMilliseconds < cooldownMs) return false;
            _lastPlay[pad] = now;
            return true;
        }

        // ==================================================================
        // ACTE 1 — Les instruments : ça joue dès le regard, le nom au clic.
        // ==================================================================
        private void StartInstruments()
        {
            _act = 1;
            Locked = false;
            _seen = new bool[_session.Count];
            _lastPlay.Clear();
            Question.Text = "🎵 Le petit orchestre";
            _canvas = new Canvas { Width = W, Height = H };
            var pads = new List<FrameworkElement>();

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
                var captured = btn;
                btn.Click += (o, ev) => NameInstrument(captured, idx);
                Canvas.SetLeft(btn, x0 + (i % cols) * (size + gapX));
                Canvas.SetTop(btn, y0 + (i / cols) * (size + gapY));
                _canvas.Children.Add(btn);
                pads.Add(btn);
            }
            _repeatAction = null; // les instruments ne se répètent pas en boucle
            SetGazePads(pads, i =>
            {
                _gazeBar = -1;
                if (i < 0 || _act != 1 || Locked || !CanPlay(i, 1500)) return;
                SoundFx.Instrument(_session[i].Key);
                Pulse(pads[i]);
                Highlight(pads[i], false);
                if (!_seen[i]) { _seen[i] = true; RewardStar(); CheckAllHeard(); }
            });

            SetConsigne(Art.ForEmoji("🎵", 110), () => "Regarde un instrument : il joue tout de suite ! Fixe-le pour entendre son nom.");
            SetBody(_canvas);
            Schedule(450, () => Speak("Regarde un instrument : il joue !"));
        }

        private void NameInstrument(Button btn, int i)
        {
            if (_act != 1 || Locked) return;
            var ins = _session[i];
            SoundFx.Instrument(ins.Key);
            Pulse(btn);
            Speak(Cap(ins.Article) + " " + ins.Name + " ! " + ins.Says);
            if (!_seen[i]) { _seen[i] = true; RewardStar(); CheckAllHeard(); }
        }

        private void CheckAllHeard()
        {
            if (!_seen.All(x => x)) return;
            Locked = true;
            Schedule(3000, () =>
            {
                Speak("Bravo ! Maintenant : qui fait ce bruit ?");
                Schedule(3800, StartQuiz);
            });
        }

        // ==================================================================
        // ACTE 2 — Qui fait ce bruit ? (au clic : c'est un choix)
        // ==================================================================
        private void StartQuiz()
        {
            _act = 2;
            _quizRound = 0;
            SetGazePads(null, null);
            _repeatAction = null;
            _gazeBar = -1;
            NextQuiz();
        }

        private void NextQuiz()
        {
            Locked = false;
            _quizRound++;
            if (_quizRound > 4) { StartXylophone(); return; }

            _quizTarget = _session[(_quizRound - 1) % _session.Count];
            var choices = Level.Pick(_session, _quizTarget, 4);
            Question.Text = "👂 Qui fait ce bruit ?";
            _canvas = new Canvas { Width = W, Height = H };

            double gap = 60, size = Math.Min(330, (W - 100 - (choices.Count - 1) * gap) / choices.Count);
            double x0 = (W - choices.Count * size - (choices.Count - 1) * gap) / 2;
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
                Speak("Oui ! C'est " + ins.Article + " " + ins.Name + " ! " + GameKit.Praise());
                Celebrate();
                Schedule(3400, NextQuiz);
            }
            else
            {
                Shake(btn);
                SoundFx.Instrument(ins.Key);
                Speak("Ça, c'est " + ins.Article + " " + ins.Name + ". Écoute encore !");
                Schedule(2600, () => { if (!Locked && _act == 2) SoundFx.Instrument(_quizTarget.Key); });
            }
        }

        // ==================================================================
        // ACTE 3 — Le xylophone (do ré mi fa sol), qui chante au regard
        // ==================================================================
        private void StartXylophone()
        {
            _act = 3;
            Locked = false;
            _played = 0;
            Question.Text = "🎹 Le xylophone";
            BuildBars(5, "xylophone", null);
            SetConsigne(Art.Visual("xylophone", "🎹", 110), () => "Regarde les lames du xylophone : chacune chante sa note ! Do, ré, mi, fa, sol !");
            SetBody(_canvas);
            Schedule(450, () => Speak("Le xylophone ! Regarde une lame, elle chante !"));
        }

        // Les lames (ou touches) : n notes, un timbre, et ce qui se passe quand
        // une note est jouée (regard ou clic).
        private void BuildBars(int n, string timbre, Action<int> onPlayed)
        {
            _canvas = new Canvas { Width = W, Height = H };
            _bars = new List<Border>();
            _lastPlay.Clear();
            var pads = new List<FrameworkElement>();
            double gap = n > 5 ? 18 : 34;
            double barW = Math.Min(190, (W - 80 - (n - 1) * gap) / n);
            double baseH = 520;
            double x0 = (W - n * barW - (n - 1) * gap) / 2;
            for (int i = 0; i < n; i++)
            {
                var (name, col) = Notes[i];
                double h = baseH - i * (n > 5 ? 40 : 62); // plus court vers l'aigu
                var label = new TextBlock
                {
                    Text = name, FontSize = n > 5 ? 44 : 56, FontWeight = FontWeights.ExtraBold, Foreground = Brushes.White,
                    HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Bottom,
                    Margin = new Thickness(0, 0, 0, 22),
                };
                var bar = new Border
                {
                    Width = barW, Height = h, CornerRadius = new CornerRadius(Math.Min(40, barW / 3)),
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
                btn.Click += (o, ev) => PlayBar(idx, timbre, onPlayed, 0);
                Canvas.SetLeft(btn, x0 + i * (barW + gap));
                Canvas.SetTop(btn, H - 40 - h - 16);
                _canvas.Children.Add(btn);
                _bars.Add(bar);
                pads.Add(btn);
            }
            _barButtons = pads.Cast<Button>().ToList();
            _marker = null;
            _gazeBar = -1;
            _repeatAction = i => PlayBar(i, timbre, onPlayed, 0);
            SetGazePads(pads, i => { _gazeBar = i; if (i >= 0) PlayBar(i, timbre, onPlayed, 350); });
        }

        private void PlayBar(int i, string timbre, Action<int> onPlayed, int cooldown)
        {
            if (Locked || !CanPlay(i, cooldown)) return;
            SoundFx.PlayNote(i, timbre);
            Pulse(_bars[i]);
            if (onPlayed != null) { onPlayed(i); return; }
            if (_act == 3)
            {
                Speak(Notes[i].Name + " !");
                if (++_played == 1) RewardStar();
                if (_played >= 8)
                {
                    Locked = true;
                    Schedule(1800, () =>
                    {
                        Speak("Bravo ! Maintenant, une chanson : regarde la lame qui brille !");
                        Schedule(5200, StartSong);
                    });
                }
            }
            else if (_act == 4) SongStep(i);
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
            BuildBars(5, "xylophone", null);
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
            SetConsigne(Art.Visual("lune", "🌙", 110), () => "Au clair de la lune ! Regarde la lame qui brille, note après note !");
            SetBody(_canvas);
            ShowLyrics();
            Glow(Song[0]);
        }

        private void ShowLyrics()
        {
            var parts = new List<string>();
            for (int k = 0; k < Song.Length; k++)
                parts.Add(k == _songPos ? "[" + SongWords[k] + "]" : SongWords[k]);
            _lyrics.Text = string.Join(" ", parts);
        }

        private void SongStep(int bar)
        {
            int want = Song[_songPos];
            if (bar != want) { Glow(want); return; } // on a entendu la note ; la bonne rebrille
            _songPos++;
            if (_songPos == 1) RewardStar();
            if (_songPos >= Song.Length)
            {
                Locked = true;
                ShowLyrics();
                ClearGlow();
                GameKit.Success();
                Speak("Tu as joué toute la chanson ! Écoute-la !");
                Schedule(2600, PlayBack);
                return;
            }
            ShowLyrics();
            Glow(Song[_songPos]);
        }

        private void PlayBack()
        {
            for (int k = 0; k < Song.Length; k++)
            {
                int bar = Song[k];
                Schedule(60 + k * 520, () => { SoundFx.PlayNote(bar); Pulse(_bars[bar]); });
            }
            Schedule(60 + Song.Length * 520 + 400, () =>
            {
                Speak("Au clair de la lune, mon ami Pierrot ! Bravo ! " + GameKit.Praise());
                Celebrate();
                Schedule(4500, _startAct >= 3 ? (Action)StartFreePlay : NewRound);
            });
        }

        // La lame à jouer est ÉVIDENTE : les autres s'éteignent, elle garde un
        // gros halo doré, et une étoile sautille juste au-dessus.
        private void Glow(int bar)
        {
            for (int i = 0; i < _bars.Count; i++)
            {
                _bars[i].BeginAnimation(UIElement.OpacityProperty, null);
                _bars[i].Opacity = i == bar ? 1 : 0.35;
                _bars[i].Effect = i == bar
                    ? new DropShadowEffect { BlurRadius = 70, ShadowDepth = 0, Color = Color.FromRgb(0xFF, 0xB3, 0x00), Opacity = 1 }
                    : null;
            }
            if (_marker == null)
            {
                _marker = Art.Visual("etoile", "⭐", 110);
                _marker.IsHitTestVisible = false;
                var tr = new TranslateTransform();
                _marker.RenderTransform = tr;
                tr.BeginAnimation(TranslateTransform.YProperty, new DoubleAnimation(-18, 14, TimeSpan.FromMilliseconds(380))
                { AutoReverse = true, RepeatBehavior = RepeatBehavior.Forever, EasingFunction = new SineEase { EasingMode = EasingMode.EaseInOut } });
                _canvas.Children.Add(_marker);
            }
            var btn = _barButtons[bar];
            // Dans le haut de la lame (au-dessus, elle cacherait les paroles).
            Canvas.SetLeft(_marker, Canvas.GetLeft(btn) + btn.Width / 2 - 55);
            Canvas.SetTop(_marker, Canvas.GetTop(btn) + 22);
        }

        private void ClearGlow()
        {
            foreach (var b in _bars) { b.BeginAnimation(UIElement.OpacityProperty, null); b.Opacity = 1; b.Effect = null; }
            if (_marker != null) { _canvas.Children.Remove(_marker); _marker = null; }
        }

        // ==================================================================
        // ACTE 5 — Je joue ! Choisir un instrument, puis en jouer au regard.
        // ==================================================================
        private static readonly (string Key, string Name, string Emoji)[] Playable =
        {
            ("xylophone", "Le xylophone", "🎹"), ("piano", "Le piano", "🎹"), ("guitare", "La guitare", "🎸"),
            ("trompette", "La trompette", "🎺"), ("violon", "Le violon", "🎻"), ("batterie", "La batterie", "🥁"),
        };

        private void StartFreePlay()
        {
            _act = 5;
            Locked = false;
            SetGazePads(null, null);
            _repeatAction = null;
            _gazeBar = -1;
            Question.Text = "🎸 Je joue !";
            _canvas = new Canvas { Width = W, Height = H };
            double size = 300, gapX = 60, gapY = 30;
            int cols = 3;
            double x0 = (W - cols * size - (cols - 1) * gapX) / 2, y0 = 20;
            for (int i = 0; i < Playable.Length; i++)
            {
                var (key, name, emoji) = Playable[i];
                var content = new StackPanel { HorizontalAlignment = HorizontalAlignment.Center };
                content.Children.Add(Art.Visual(key, emoji, 180));
                content.Children.Add(new TextBlock
                {
                    Text = name, FontSize = 34, FontWeight = FontWeights.Bold,
                    Foreground = new SolidColorBrush(Color.FromRgb(0x3B, 0x2A, 0x5A)), HorizontalAlignment = HorizontalAlignment.Center, Margin = new Thickness(0, 6, 0, 0),
                });
                var btn = AnswerButton(new Viewbox { Child = content, Margin = new Thickness(14) }, size);
                var k = key; var n = name;
                btn.Click += (o, ev) => OpenInstrument(k, n);
                Canvas.SetLeft(btn, x0 + (i % cols) * (size + gapX));
                Canvas.SetTop(btn, y0 + (i / cols) * (size + gapY));
                _canvas.Children.Add(btn);
            }
            SetConsigne(Art.ForEmoji("🎵", 110), () => "Choisis un instrument, et joue avec tes yeux !");
            SetBody(_canvas);
            Schedule(450, () => Speak("Choisis un instrument !"));
        }

        private void OpenInstrument(string key, string name)
        {
            if (_act != 5 || Locked) return;
            _act = 6;
            Question.Text = "🎵 " + name;
            if (key == "batterie") BuildDrums();
            else BuildBars(8, key, i => { if (i == 0 && _played == 0) RewardStar(); _played++; });
            _played = 0;

            // Le bouton pour changer d'instrument (au clic, en haut à droite).
            var back = AnswerButton(new TextBlock { Text = "🔁", FontSize = 70, HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center }, 130);
            back.Click += (o, ev) => { if (_act == 6) StartFreePlay(); };
            Canvas.SetLeft(back, W - 150);
            Canvas.SetTop(back, 16);
            _canvas.Children.Add(back);

            SetConsigne(Art.Visual(key, "🎵", 110), () => name + " ! Regarde une touche, elle joue ! La flèche change d'instrument.");
            SetBody(_canvas);
            Schedule(300, () => Speak(name + " ! Regarde les touches pour jouer !"));
        }

        // La batterie : quatre gros pads (grosse caisse, caisse claire, tom, cymbale).
        private void BuildDrums()
        {
            _canvas = new Canvas { Width = W, Height = H };
            _bars = new List<Border>();
            _lastPlay.Clear();
            var pads = new List<FrameworkElement>();
            (string Name, Color C)[] kit =
            {
                ("boum", Color.FromRgb(0xE0, 0x4A, 0x4A)), ("tac", Color.FromRgb(0xFF, 0xC1, 0x07)),
                ("tom", Color.FromRgb(0x4C, 0xC2, 0x6B)), ("tching", Color.FromRgb(0x5D, 0xAD, 0xE2)),
            };
            double size = 280, gap = 40;
            double x0 = (W - 4 * size - 3 * gap) / 2;
            for (int i = 0; i < 4; i++)
            {
                var pad = new Border
                {
                    Width = size, Height = size, CornerRadius = new CornerRadius(size / 2),
                    Background = new RadialGradientBrush(Lighten(kit[i].C), kit[i].C),
                    BorderBrush = Brushes.White, BorderThickness = new Thickness(8),
                    Child = new TextBlock { Text = kit[i].Name, FontSize = 48, FontWeight = FontWeights.ExtraBold, Foreground = Brushes.White, HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center },
                    RenderTransformOrigin = new Point(0.5, 0.5),
                };
                var btn = new Button
                {
                    Style = (Style)Application.Current.Resources["AnswerButton"],
                    Width = size + 16, Height = size + 16, Padding = new Thickness(0), Background = Brushes.Transparent, Content = pad,
                };
                int idx = i;
                btn.Click += (o, ev) => HitDrum(idx, 0);
                Canvas.SetLeft(btn, x0 + i * (size + gap));
                Canvas.SetTop(btn, 220);
                _canvas.Children.Add(btn);
                _bars.Add(pad);
                pads.Add(btn);
            }
            _gazeBar = -1;
            _repeatAction = i => HitDrum(i, 0);
            SetGazePads(pads, i => { _gazeBar = i; if (i >= 0) HitDrum(i, 250); });
        }

        private void HitDrum(int i, int cooldown)
        {
            if (Locked || !CanPlay(i, cooldown)) return;
            SoundFx.DrumKit(i);
            Pulse(_bars[i]);
            if (_played++ == 0) RewardStar();
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
