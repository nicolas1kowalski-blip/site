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
    /// <summary>Jeu de mémoire : retrouver les paires (3 paires = 6 cartes).</summary>
    public sealed class MemoryGame : GameControl
    {
        private const int Pairs = 3;

        private string[] _deck;
        private bool[] _up;
        private bool[] _matched;
        private Button[] _btns;
        private readonly List<int> _sel = new List<int>();
        private bool _busy;

        public MemoryGame(Action celebrate) : base(celebrate) { }

        protected override void NewRound()
        {
            Locked = false;
            _busy = false;
            _sel.Clear();

            var chosen = GameKit.Shuffle(GameData.CountObjects).Take(Pairs).ToList();
            _deck = GameKit.Shuffle(chosen.Concat(chosen)).ToArray();
            _up = new bool[_deck.Length];
            _matched = new bool[_deck.Length];
            _btns = new Button[_deck.Length];

            Question.Text = "Trouve les paires !";

            var grid = new UniformGrid { Columns = 3, HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center };
            for (int i = 0; i < _deck.Length; i++)
            {
                var btn = AnswerButton(new TextBlock { Text = "⭐", FontSize = 60 }, 130);
                _btns[i] = btn;
                int idx = i;
                btn.Click += (s, e) => Flip(idx);
                grid.Children.Add(btn);
            }

            SetBody(grid);
            Schedule(350, () => Speak("Trouve les paires !"));
        }

        private void UpdateCard(int i)
        {
            bool faceUp = _up[i] || _matched[i];
            _btns[i].Content = new TextBlock { Text = faceUp ? _deck[i] : "⭐", FontSize = 60 };
            if (_matched[i]) _btns[i].Background = new SolidColorBrush(Color.FromRgb(0xB6, 0xEF, 0xB6));
        }

        private void Flip(int i)
        {
            if (_busy || _matched[i] || _sel.Contains(i)) return;
            _up[i] = true;
            _sel.Add(i);
            UpdateCard(i);
            if (_sel.Count < 2) return;

            _busy = true;
            int a = _sel[0], b = _sel[1];
            if (_deck[a] == _deck[b])
            {
                Schedule(450, () =>
                {
                    _matched[a] = _matched[b] = true;
                    _sel.Clear();
                    UpdateCard(a); UpdateCard(b);
                    GameKit.Success();
                    if (_matched.All(m => m))
                    {
                        Celebrate();
                        Speak($"Bravo ! {GameKit.Praise()}");
                        ScheduleNext(3000);
                    }
                    else
                    {
                        Speak(GameKit.Praise());
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
                    UpdateCard(a); UpdateCard(b);
                    _busy = false;
                });
            }
        }
    }
}
