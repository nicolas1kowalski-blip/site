using System;
using System.Windows;
using System.Windows.Controls;
using MesPremiersJeux.Lib;

namespace MesPremiersJeux.Games
{
    /// <summary>
    /// Éducatif (PS) : les contraires grand / petit. Deux fois le même dessin,
    /// un grand et un petit ; l'enfant montre celui qui est demandé.
    /// </summary>
    public sealed class SizeGame : GameControl
    {
        public SizeGame(Action celebrate) : base(celebrate) { }

        protected override void NewRound()
        {
            Locked = false;
            var item = GameKit.Rand(CartoonArt.Items);
            bool wantBig = GameKit.RandInt(2) == 0;
            string sizeWord = wantBig ? "GRAND" : "petit";
            Question.Text = $"Trouve le {sizeWord} !";

            var row = Row();
            bool bigFirst = GameKit.RandInt(2) == 0;
            foreach (var isBig in bigFirst ? new[] { true, false } : new[] { false, true })
            {
                double size = isBig ? 360 : 150;
                var btn = AnswerButton(new Viewbox { Child = item.Build(), Width = size, Height = size }, 420);
                bool big = isBig;
                btn.Click += (s, e) => Answer(big, wantBig, item.Fr, btn);
                row.Children.Add(btn);
            }

            SetBody(new TextBlock(), row); // toute la place aux deux réponses
            Schedule(350, () => Speak($"Trouve le {(wantBig ? "grand" : "petit")} {StripArticle(item.Fr)} !"));
        }

        // « le chat » → « chat » (pour dire « le grand chat »).
        private static string StripArticle(string fr)
        {
            foreach (var a in new[] { "le ", "la ", "l'" })
                if (fr.StartsWith(a)) return fr.Substring(a.Length);
            return fr;
        }

        private void Answer(bool isBig, bool wantBig, string fr, Button btn)
        {
            if (Locked) return;
            if (isBig == wantBig)
            {
                Locked = true;
                GameKit.Success();
                Celebrate();
                Speak($"Bravo ! Ça, c'est le {(wantBig ? "grand" : "petit")} {StripArticle(fr)} !");
                ScheduleNext(2600);
            }
            else
            {
                GameKit.Wrong();
                Shake(btn);
                Speak(wantBig ? "Non, ça c'est le petit ! Cherche le grand !" : "Non, ça c'est le grand ! Cherche le petit !");
            }
        }
    }
}
