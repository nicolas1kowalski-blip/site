using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Media;
using MesPremiersJeux.Data;
using MesPremiersJeux.Lib;

namespace MesPremiersJeux.Games
{
    /// <summary>Jeu de mémoire avec des cartes 3D qui se retournent (3 paires).</summary>
    public sealed class MemoryGame : GameControl
    {
        private const int Pairs = 3; // 3 paires = 6 grandes cartes (une rangée)

        private CartoonItem[] _deck;
        private bool[] _up;
        private bool[] _matched;
        private Card3D[] _cards;
        private readonly List<int> _sel = new List<int>();
        private bool _busy;

        // 👧👨 À DEUX : l'enfant (au regard) et un adulte (au doigt), chacun son
        // tour ; une paire trouvée fait rejouer ; la voix dit à qui c'est.
        private readonly bool _duo;
        private int _turn;          // 0 = l'enfant · 1 = l'adulte
        private readonly int[] _score = new int[2];
        private TextBlock _scoreText;
        private string _child = "Laura", _adult = "toi";

        public MemoryGame(Action celebrate, bool duo = false) : base(celebrate) { _duo = duo; }

        private string Who(int t) => t == 0 ? _child : _adult;

        private void ShowTurn()
        {
            if (_scoreText == null) return;
            _scoreText.Text = "👧 " + _child + " : " + _score[0] + "     👨 " + _adult + " : " + _score[1] + "     ➡ À " + Who(_turn) + " !";
        }

        protected override void NewRound()
        {
            Locked = false;
            _busy = false;
            _sel.Clear();

            _child = (Settings.Load().ChildName ?? "Laura").Trim();
            if (_child.Length == 0) _child = "Laura";
            _adult = "Papa ou Maman";
            _score[0] = _score[1] = 0;
            _turn = 0;
            int pairs = _duo ? 4 : Pairs;
            var chosen = GameKit.Shuffle(CartoonArt.Items).Take(pairs).ToList();
            _deck = GameKit.Shuffle(chosen.Concat(chosen)).ToArray();
            _up = new bool[_deck.Length];
            _matched = new bool[_deck.Length];
            _cards = new Card3D[_deck.Length];

            Question.Text = "Trouve les paires !";

            var grid = new UniformGrid { Columns = _duo ? 4 : 3 }; // 2 lignes de 3 (ou de 4 à deux), grandes cartes
            for (int i = 0; i < _deck.Length; i++)
            {
                var card = new Card3D(_deck[i].Build(), _deck[i].Name);
                _cards[i] = card;
                var btn = new Button
                {
                    Style = (Style)Application.Current.Resources["BalloonButton"],
                    Width = 440,
                    Height = 440,
                    Margin = new Thickness(6),
                    Content = card.Viewport,
                };
                int idx = i;
                btn.Click += (s, e) => Flip(idx);
                grid.Children.Add(btn);
            }

            if (_duo)
            {
                _scoreText = new TextBlock
                {
                    FontSize = 34, FontWeight = FontWeights.Bold, Foreground = new SolidColorBrush(Color.FromRgb(0x3B, 0x2A, 0x5A)),
                    HorizontalAlignment = HorizontalAlignment.Center, Margin = new Thickness(0, 0, 0, 8),
                };
                var stack = new StackPanel();
                stack.Children.Add(_scoreText);
                stack.Children.Add(grid);
                ShowTurn();
                SetBody(stack);
                Schedule(350, () => Speak("Les paires à deux ! " + _child + " commence !"));
                return;
            }
            SetBody(grid);
            Schedule(350, () => Speak("Trouve les paires !"));
        }

        private void Refresh(int i) => _cards[i].Flip(_up[i] || _matched[i]);

        private void Flip(int i)
        {
            if (_busy || _matched[i] || _sel.Contains(i)) return;
            _up[i] = true;
            _sel.Add(i);
            Refresh(i);
            if (_sel.Count < 2) return;

            _busy = true;
            int a = _sel[0], b = _sel[1];
            if (_deck[a] == _deck[b])
            {
                Schedule(500, () =>
                {
                    _matched[a] = _matched[b] = true;
                    _sel.Clear();
                    GameKit.Success();
                    if (_duo) { _score[_turn]++; ShowTurn(); }
                    if (_matched.All(m => m))
                    {
                        if (_duo)
                        {
                            string end = _score[0] > _score[1] ? _child + " a gagné ! " + _score[0] + " à " + _score[1] + " !"
                                : _score[1] > _score[0] ? _adult + " a gagné, " + _score[1] + " à " + _score[0] + " ! On rejoue ?"
                                : "Égalité ! " + _score[0] + " partout ! Bravo tous les deux !";
                            if (_score[0] >= _score[1]) Celebrate();
                            Speak(end);
                        }
                        else
                        {
                            Celebrate();
                            Speak($"Bravo ! {GameKit.Praise()}");
                        }
                        ScheduleNext(3600);
                    }
                    else
                    {
                        Speak(_duo ? "Une paire pour " + Who(_turn) + " ! Encore à " + Who(_turn) + " !" : GameKit.Praise());
                        _busy = false;
                    }
                });
            }
            else
            {
                Schedule(1100, () =>
                {
                    _up[a] = _up[b] = false;
                    _sel.Clear();
                    Refresh(a); Refresh(b);
                    if (_duo) { _turn = 1 - _turn; ShowTurn(); Speak("À " + Who(_turn) + " !"); }
                    _busy = false;
                });
            }
        }
    }
}
