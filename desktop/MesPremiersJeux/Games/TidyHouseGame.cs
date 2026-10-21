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
    /// 🏠 « Range la maison » (PS/MS) : chaque objet va dans sa pièce.
    ///   1. LES PIÈCES — la cuisine, la salle de bain, la chambre : un regard sur
    ///      une pièce dit à quoi elle sert.
    ///   2. ON RANGE — un objet apparaît (« Où va la brosse à dents ? »), trois
    ///      pièces en bas : l'objet s'envole dans la pièce choisie si c'est la
    ///      bonne ; sinon on explique et on réessaie. Huit objets par partie,
    ///      tirés d'un paquet mélangé (jamais les mêmes d'une partie à l'autre).
    ///   3. LA MAISON EST RANGÉE — la fête !
    /// Tous les objets sont des dessins de la banque d'images.
    /// </summary>
    public sealed class TidyHouseGame : GameControl
    {
        private const double W = 1400, H = 680;

        private sealed class Room
        {
            public string Key, Name, Says, Icon, Emoji;
            public Color Tint;
            public (string Img, string Name)[] Things;
        }

        private static readonly Room[] Rooms =
        {
            new Room
            {
                Key = "cuisine", Name = "la cuisine", Says = "C'est là qu'on prépare à manger ! Miam !", Icon = "frigo", Emoji = "🍳",
                Tint = Color.FromRgb(0xFF, 0xF1, 0xC8),
                Things = new[]
                {
                    ("casserole", "la casserole"), ("poele", "la poêle"), ("cuillere", "la cuillère"), ("fourchette", "la fourchette"),
                    ("assiette", "l'assiette"), ("verre", "le verre"), ("bol", "le bol"), ("tasse", "la tasse"),
                    ("grille-pain", "le grille-pain"), ("bouilloire", "la bouilloire"), ("theiere", "la théière"), ("louche", "la louche"),
                    ("marmite", "la marmite"), ("fouet", "le fouet"), ("micro-ondes", "le micro-ondes"), ("cafetiere", "la cafetière"),
                },
            },
            new Room
            {
                Key = "salle-de-bain", Name = "la salle de bain", Says = "C'est là qu'on se lave ! Splash !", Icon = "baignoire", Emoji = "🛁",
                Tint = Color.FromRgb(0xD6, 0xF0, 0xFF),
                Things = new[]
                {
                    ("brosse-a-dents", "la brosse à dents"), ("dentifrice", "le dentifrice"), ("savon", "le savon"), ("shampoing", "le shampoing"),
                    ("serviette", "la serviette"), ("gant-de-toilette", "le gant de toilette"), ("peignoir", "le peignoir"), ("eponge", "l'éponge"),
                    ("seche-cheveux", "le sèche-cheveux"), ("papier-toilette", "le papier toilette"), ("brosse-a-cheveux", "la brosse à cheveux"),
                    ("canard-de-bain", "le canard de bain"), ("tapis-de-bain", "le tapis de bain"), ("miroir", "le miroir"),
                },
            },
            new Room
            {
                Key = "chambre", Name = "la chambre", Says = "C'est là qu'on dort et qu'on joue ! Chut...", Icon = "ours-peluche", Emoji = "🧸",
                Tint = Color.FromRgb(0xEC, 0xE0, 0xFF),
                Things = new[]
                {
                    ("ours-peluche", "le nounours"), ("poupee", "la poupée"), ("cubes", "les cubes"), ("toupie", "la toupie"),
                    ("livre", "le livre"), ("puzzle", "le puzzle"), ("robot", "le robot"), ("train", "le petit train"),
                    ("pull", "le pull"), ("pantalon", "le pantalon"), ("chaussette", "la chaussette"),
                    ("bonnet", "le bonnet"), ("robe", "la robe"), ("pantoufles", "les pantoufles"), ("reveil", "le réveil"),
                },
            },
        };

        private const int PerGame = 8;
        private static readonly List<(Room Room, string Img, string Name)> Deck = new List<(Room, string, string)>();

        private static List<(Room Room, string Img, string Name)> Draw()
        {
            var res = new List<(Room, string, string)>();
            while (res.Count < PerGame)
            {
                if (Deck.Count == 0)
                    Deck.AddRange(GameKit.Shuffle(Rooms.SelectMany(r => r.Things.Select(t => (r, t.Img, t.Name)))));
                res.Add(Deck[0]);
                Deck.RemoveAt(0);
            }
            return res;
        }

        private Canvas _canvas;
        private int _act;
        private bool[] _seen;
        private List<(Room Room, string Img, string Name)> _todo;
        private int _idx;
        private FrameworkElement _thing;
        private readonly List<Button> _roomBtns = new List<Button>();

        public TidyHouseGame(Action celebrate) : base(celebrate) { }

        protected override void NewRound()
        {
            _todo = Draw();
            StartRooms();
        }

        private Button RoomButton(Room r, double size, bool big)
        {
            var content = new StackPanel { HorizontalAlignment = HorizontalAlignment.Center };
            content.Children.Add(Art.Visual(r.Icon, r.Emoji, big ? 170 : 130));
            content.Children.Add(new TextBlock
            {
                Text = Cap(r.Name), FontSize = big ? 36 : 30, FontWeight = FontWeights.Bold,
                Foreground = new SolidColorBrush(Color.FromRgb(0x3B, 0x2A, 0x5A)), HorizontalAlignment = HorizontalAlignment.Center, Margin = new Thickness(0, 6, 0, 0),
            });
            var btn = AnswerButton(new Viewbox { Child = content, Margin = new Thickness(14) }, size);
            btn.Background = new SolidColorBrush(r.Tint);
            return btn;
        }

        // ==================================================================
        // ACTE 1 — Les pièces
        // ==================================================================
        private void StartRooms()
        {
            _act = 1;
            Locked = false;
            _seen = new bool[Rooms.Length];
            Question.Text = "🏠 Range la maison";
            _canvas = new Canvas { Width = W, Height = H };
            double size = 360, gap = 70;
            double x0 = (W - 3 * size - 2 * gap) / 2;
            for (int i = 0; i < Rooms.Length; i++)
            {
                int idx = i;
                var btn = RoomButton(Rooms[i], size, true);
                var captured = btn;
                btn.Click += (o, ev) => DiscoverRoom(captured, idx);
                Canvas.SetLeft(btn, x0 + i * (size + gap));
                Canvas.SetTop(btn, 140);
                _canvas.Children.Add(btn);
            }
            SetConsigne(Art.Visual("maison", "🏠", 90), () => "Voici la maison ! Regarde chaque pièce pour savoir à quoi elle sert.");
            SetBody(_canvas);
            Schedule(450, () => Speak("Regarde chaque pièce de la maison !"));
        }

        private void DiscoverRoom(Button btn, int i)
        {
            if (_act != 1 || Locked) return;
            var r = Rooms[i];
            Pulse(btn);
            bool first = !_seen[i];
            _seen[i] = true;
            Speak(Cap(r.Name) + " ! " + r.Says);
            if (first) RewardStar();
            if (_seen.All(x => x))
            {
                Locked = true;
                Schedule(3600, () =>
                {
                    Speak("Tout est en désordre ! On range ?");
                    Schedule(3800, StartTidy);
                });
            }
        }

        // ==================================================================
        // ACTE 2 — On range
        // ==================================================================
        private void StartTidy()
        {
            _act = 2;
            _idx = -1;
            NextThing();
        }

        private void NextThing()
        {
            Locked = false;
            _idx++;
            if (_idx >= _todo.Count) { Finish(); return; }
            var item = _todo[_idx];
            Question.Text = "🧺 Où va " + item.Name + " ?";
            _canvas = new Canvas { Width = W, Height = H };
            _roomBtns.Clear();

            // L'objet à ranger, en grand, en haut.
            _thing = Art.Visual(item.Img, "📦", 230);
            Canvas.SetLeft(_thing, W / 2 - 115);
            Canvas.SetTop(_thing, 20);
            _canvas.Children.Add(_thing);
            Bob(_thing);

            // Le compteur : objets déjà rangés.
            var done = new TextBlock
            {
                Text = "✅ " + _idx + " / " + _todo.Count, FontSize = 34, FontWeight = FontWeights.Bold,
                Foreground = new SolidColorBrush(Color.FromRgb(0x3B, 0x2A, 0x5A)),
            };
            Canvas.SetLeft(done, 30);
            Canvas.SetTop(done, 20);
            _canvas.Children.Add(done);

            double size = 300, gap = 90;
            double x0 = (W - 3 * size - 2 * gap) / 2;
            for (int i = 0; i < Rooms.Length; i++)
            {
                var r = Rooms[i];
                var btn = RoomButton(r, size, false);
                var captured = btn;
                btn.Click += (o, ev) => Put(captured, r);
                Canvas.SetLeft(btn, x0 + i * (size + gap));
                Canvas.SetTop(btn, H - size - 20);
                _canvas.Children.Add(btn);
                _roomBtns.Add(btn);
            }
            var speaker = SpeakerButton(() => "Où va " + item.Name + " ? Dans la cuisine, la salle de bain, ou la chambre ?");
            Canvas.SetLeft(speaker, W - 150);
            Canvas.SetTop(speaker, 20);
            _canvas.Children.Add(speaker);

            SetConsigne(Art.Visual(item.Img, "📦", 90), () => "Où va " + item.Name + " ? Regarde la bonne pièce !");
            SetBody(_canvas);
            Schedule(400, () => Speak(_idx == 0 ? "Où va " + item.Name + " ? Regarde la bonne pièce !" : "Et " + item.Name + ", où est-ce que ça va ?"));
            ArmHint(_roomBtns[Array.IndexOf(Rooms, item.Room)], () => "Où va " + item.Name + " ? " + item.Room.Says);
        }

        private void Put(Button btn, Room r)
        {
            if (_act != 2 || Locked) return;
            var item = _todo[_idx];
            if (r == item.Room)
            {
                Locked = true;
                DisarmHint();
                GameKit.Success();
                Pulse(btn);
                FlyInto(_thing, btn);
                Speak("Oui ! " + Cap(item.Name) + " va dans " + r.Name + " ! " + GameKit.Praise());
                RewardStar();
                Schedule(2600, NextThing);
            }
            else
            {
                Shake(btn);
                Speak("Non, " + item.Name + " ne va pas dans " + r.Name + ". " + item.Room.Says + " Où est-ce ?");
            }
        }

        // L'objet s'envole dans la pièce et rétrécit.
        private void FlyInto(FrameworkElement thing, Button room)
        {
            thing.BeginAnimation(UIElement.OpacityProperty, null);
            double x0 = Canvas.GetLeft(thing), y0 = Canvas.GetTop(thing);
            double x1 = Canvas.GetLeft(room) + room.Width / 2 - 115;
            double y1 = Canvas.GetTop(room) + room.Height / 2 - 115;
            var dur = TimeSpan.FromMilliseconds(900);
            var ease = new SineEase { EasingMode = EasingMode.EaseInOut };
            thing.BeginAnimation(Canvas.LeftProperty, new DoubleAnimation(x0, x1, dur) { EasingFunction = ease });
            thing.BeginAnimation(Canvas.TopProperty, new DoubleAnimation(y0, y1, dur) { EasingFunction = ease });
            var sc = new ScaleTransform(1, 1);
            thing.RenderTransformOrigin = new Point(0.5, 0.5);
            thing.RenderTransform = sc;
            sc.BeginAnimation(ScaleTransform.ScaleXProperty, new DoubleAnimation(1, 0.25, dur) { EasingFunction = ease });
            sc.BeginAnimation(ScaleTransform.ScaleYProperty, new DoubleAnimation(1, 0.25, dur) { EasingFunction = ease });
            thing.BeginAnimation(UIElement.OpacityProperty, new DoubleAnimation(1, 0, TimeSpan.FromMilliseconds(300)) { BeginTime = TimeSpan.FromMilliseconds(700) });
        }

        // Petit flottement de l'objet qui attend d'être rangé.
        private static void Bob(FrameworkElement el)
        {
            var tr = new TranslateTransform();
            el.RenderTransform = tr;
            tr.BeginAnimation(TranslateTransform.YProperty, new DoubleAnimation(-8, 8, TimeSpan.FromSeconds(1.2))
            { AutoReverse = true, RepeatBehavior = RepeatBehavior.Forever, EasingFunction = new SineEase { EasingMode = EasingMode.EaseInOut } });
        }

        // ==================================================================
        // ACTE 3 — La maison est rangée !
        // ==================================================================
        private void Finish()
        {
            _act = 3;
            Locked = true;
            Question.Text = "🎉 La maison est rangée !";
            _canvas = new Canvas { Width = W, Height = H };
            var house = Art.Visual("maison", "🏠", 420);
            Canvas.SetLeft(house, W / 2 - 210);
            Canvas.SetTop(house, 100);
            _canvas.Children.Add(house);
            SetConsigne(null, null);
            SetBody(_canvas);
            Pulse(house);
            Speak("La maison est rangée ! " + GameKit.Praise());
            Celebrate();
            Schedule(4500, NewRound);
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
