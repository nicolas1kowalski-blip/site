using System.Collections.Generic;
using System.Windows;
using System.Windows.Media;

namespace MesPremiersJeux.Data
{
    public sealed class GameColor { public string Name; public Color Value; }
    public sealed class GameShape { public string Name; public Geometry Geo; public Color Color; }
    public sealed class Family { public string Name; public string[] Items; }

    /// <summary>Données des jeux, portées depuis src/data/games.js.</summary>
    public static class GameData
    {
        public static readonly string[] CountObjects =
            { "🐶", "🐱", "🐰", "🐻", "🦊", "🐸", "🦋", "🐝", "🌟", "🍎", "🍌", "🎈", "🐷", "🐢", "🦁" };

        public static readonly string[] Praises =
            { "Bravo !", "Super !", "Excellent !", "Magnifique !", "Génial !", "Bien joué !" };
        public static readonly string[] Encourage =
            { "Essaie encore !", "Presque !", "Regarde bien !" };

        private static Color C(string hex)
        {
            var h = hex.Replace("#", "");
            byte r = System.Convert.ToByte(h.Substring(0, 2), 16);
            byte g = System.Convert.ToByte(h.Substring(2, 2), 16);
            byte b = System.Convert.ToByte(h.Substring(4, 2), 16);
            return Color.FromRgb(r, g, b);
        }

        public static readonly List<GameColor> Colors = new List<GameColor>
        {
            new GameColor { Name = "rouge",  Value = C("#FF4D4D") },
            new GameColor { Name = "bleu",   Value = C("#3A86FF") },
            new GameColor { Name = "jaune",  Value = C("#FFD43B") },
            new GameColor { Name = "vert",   Value = C("#4CAF50") },
            new GameColor { Name = "rose",   Value = C("#FF8FAB") },
            new GameColor { Name = "violet", Value = C("#9D4EDD") },
            new GameColor { Name = "orange", Value = C("#FF8C42") },
        };

        private static Geometry P(string data) { var g = Geometry.Parse(data); g.Freeze(); return g; }

        public static readonly List<GameShape> Shapes = new List<GameShape>
        {
            new GameShape { Name = "rond",     Color = C("#FF6B6B"), Geo = P("M50,8 A42,42 0 1 0 50,92 A42,42 0 1 0 50,8 Z") },
            new GameShape { Name = "carré",    Color = C("#4ECDC4"), Geo = P("M16,10 H84 A6,6 0 0 1 90,16 V84 A6,6 0 0 1 84,90 H16 A6,6 0 0 1 10,84 V16 A6,6 0 0 1 16,10 Z") },
            new GameShape { Name = "triangle", Color = C("#FFD43B"), Geo = P("M50,10 L92,85 L8,85 Z") },
            new GameShape { Name = "étoile",   Color = C("#FF8FAB"), Geo = P("M50,8 L61,38 L92,38 L67,57 L77,88 L50,70 L23,88 L33,57 L8,38 L39,38 Z") },
            new GameShape { Name = "cœur",     Color = C("#FF4D8D"), Geo = P("M50,85 C20,65 5,45 20,25 C32,12 45,22 50,32 C55,22 68,12 80,25 C95,45 80,65 50,85 Z") },
        };
        public static readonly Color ShapeNeutral = C("#FFB347");

        public sealed class BalloonInfo { public string Name; public string Sound; }

        public static readonly List<BalloonInfo> Balloons = new List<BalloonInfo>
        {
            new BalloonInfo { Name = "le chien",       Sound = "wouf wouf" },
            new BalloonInfo { Name = "le chat",        Sound = "miaou miaou" },
            new BalloonInfo { Name = "la vache",       Sound = "meuh meuh" },
            new BalloonInfo { Name = "le canard",      Sound = "coin coin" },
            new BalloonInfo { Name = "le cochon",      Sound = "groin groin" },
            new BalloonInfo { Name = "la grenouille",  Sound = "coâ coâ" },
            new BalloonInfo { Name = "l'abeille",      Sound = "bzzz bzzz" },
            new BalloonInfo { Name = "le lion",        Sound = "rooaar" },
            new BalloonInfo { Name = "le cheval",      Sound = "hi hi hi" },
            new BalloonInfo { Name = "l'étoile" },
            new BalloonInfo { Name = "le cœur" },
            new BalloonInfo { Name = "la pomme" },
        };

        public static readonly Color[] BalloonColors =
        {
            C("#FF6B6B"), C("#4ECDC4"), C("#FFD93C"), C("#95E06C"),
            C("#A06CD5"), C("#FF9FB5"), C("#5DADE2"), C("#FFB347"),
        };

        // Set « fun » pour les cartes (mémoire) : princesses, magie, mignon.
        public static readonly string[] FunPool =
            { "👸", "🦄", "🧚", "👑", "🌈", "⭐", "❤️", "🌸", "🦋", "🎀", "🏰", "🍰", "🍦", "🐱", "🌷", "🧜‍♀️" };

        public static readonly List<Family> Families = new List<Family>
        {
            new Family { Name = "les animaux mignons", Items = new[] { "🐱", "🐰", "🐶", "🦊", "🐻", "🐼", "🐨", "🦁", "🐯", "🐸" } },
            new Family { Name = "les fruits",          Items = new[] { "🍎", "🍓", "🍒", "🍑", "🍊", "🍇", "🍉", "🍌", "🍐" } },
            new Family { Name = "la magie",            Items = new[] { "👸", "🦄", "🧚", "👑", "🌈", "⭐", "🎀", "🏰", "🌸" } },
        };
    }
}
