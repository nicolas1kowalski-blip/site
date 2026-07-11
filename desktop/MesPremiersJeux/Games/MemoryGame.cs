using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using MesPremiersJeux.Data;
using MesPremiersJeux.Lib;

namespace MesPremiersJeux.Games
{
    /// <summary>Jeu de mémoire avec des cartes 3D qui se retournent (3 paires).</summary>
    public sealed class MemoryGame : GameControl
    {
        private const int Pairs = 3;

        private string[] _deck;
        private bool[] _up;
        private bool[] _matched;
        private Card3D[] _cards;
        private readonly List<int> _sel = new List<int>();
        private bool _busy;

        public MemoryGame(Action celebrate) : base(celebrate) { }

        protected override void NewRound()
        {
            Locked = false;
            _busy = false;
            _sel.Clear();

            var chosen = GameKit.Shuffle(GameData.FunPool).Take(Pairs).ToList();
            _deck = GameKit.Shuffle(chosen.Concat(chosen)).ToArray();
            _up = new bool[_deck.Length];
            _matched = new bool[_deck.Length];
            _cards = new Card3D[_deck.Length];

            Question.Text = "Trouve les paires !";

            var grid = new UniformGrid { Columns = 3, HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center };
            for (int i = 0; i < _deck.Length; i++)
            {
                var card = new Card3D(_deck[i]);
                _cards[i] = card;
                var btn = new Button
                {
                    Style = (Style)Application.Current.Resources["BalloonButton"],
                    Width = 200,
                    Height = 258,
                    Margin = new Thickness(12),
                    Content = card.Viewport,
                };
                int idx = i;
                btn.Click += (s, e) => Flip(idx);
                grid.Children.Add(btn);
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
                    Refresh(a); Refresh(b);
                    _busy = false;
                });
            }
        }
    }
}
