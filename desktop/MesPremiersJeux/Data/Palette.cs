using System.Collections.Generic;

namespace MesPremiersJeux.Data
{
    public enum SwatchKind { Solid, Glitter, Rainbow, Pattern }

    /// <summary>
    /// Une entrée de la palette : couleur simple, à paillettes, arc-en-ciel ou à motifs.
    /// Repris de la version web (src/data/colorings.js).
    /// </summary>
    public sealed class Swatch
    {
        public string Id;
        public string Name;
        public SwatchKind Kind;

        // Solide
        public string Color;

        // Paillettes
        public string Base;
        public string Spark;

        // Motifs
        public string Pattern; // "dots" | "stripes" | "stars" | "hearts"
        public string Bg;
        public string Fg;
    }

    public static class Palette
    {
        public static readonly List<Swatch> All = new List<Swatch>
        {
            // Couleurs simples
            new Swatch { Id = "rouge",  Name = "rouge",      Kind = SwatchKind.Solid, Color = "#E53935" },
            new Swatch { Id = "orange", Name = "orange",     Kind = SwatchKind.Solid, Color = "#FB8C00" },
            new Swatch { Id = "jaune",  Name = "jaune",      Kind = SwatchKind.Solid, Color = "#FDD835" },
            new Swatch { Id = "vert",   Name = "vert",       Kind = SwatchKind.Solid, Color = "#43A047" },
            new Swatch { Id = "bleu",   Name = "bleu",       Kind = SwatchKind.Solid, Color = "#1E88E5" },
            new Swatch { Id = "cyan",   Name = "bleu clair", Kind = SwatchKind.Solid, Color = "#4FC3F7" },
            new Swatch { Id = "violet", Name = "violet",     Kind = SwatchKind.Solid, Color = "#8E24AA" },
            new Swatch { Id = "rose",   Name = "rose",       Kind = SwatchKind.Solid, Color = "#EC407A" },
            new Swatch { Id = "marron", Name = "marron",     Kind = SwatchKind.Solid, Color = "#8D6E63" },
            new Swatch { Id = "gris",   Name = "gris",       Kind = SwatchKind.Solid, Color = "#9E9E9E" },
            new Swatch { Id = "noir",   Name = "noir",       Kind = SwatchKind.Solid, Color = "#2B2D42" },
            new Swatch { Id = "blanc",  Name = "blanc",      Kind = SwatchKind.Solid, Color = "#FFFFFF" },
            // Couleurs à paillettes
            new Swatch { Id = "g-or",     Name = "or pailleté",    Kind = SwatchKind.Glitter, Base = "#E7B924", Spark = "#FFF3B0" },
            new Swatch { Id = "g-rose",   Name = "rose pailleté",  Kind = SwatchKind.Glitter, Base = "#FF4F9A", Spark = "#FFD6E8" },
            new Swatch { Id = "g-violet", Name = "violet pailleté",Kind = SwatchKind.Glitter, Base = "#9C4DFF", Spark = "#E9D9FF" },
            new Swatch { Id = "g-arc",    Name = "arc-en-ciel pailleté", Kind = SwatchKind.Rainbow },
            // Couleurs à motifs
            new Swatch { Id = "m-pois",    Name = "à pois",    Kind = SwatchKind.Pattern, Pattern = "dots",    Bg = "#FFE08A", Fg = "#FF7043" },
            new Swatch { Id = "m-rayures", Name = "à rayures", Kind = SwatchKind.Pattern, Pattern = "stripes", Bg = "#A0E7E5", Fg = "#2E86DE" },
            new Swatch { Id = "m-etoiles", Name = "à étoiles", Kind = SwatchKind.Pattern, Pattern = "stars",   Bg = "#B39DDB", Fg = "#FFD93C" },
            new Swatch { Id = "m-coeurs",  Name = "à cœurs",   Kind = SwatchKind.Pattern, Pattern = "hearts",  Bg = "#FFC9DE", Fg = "#FF4D6D" },
        };
    }
}
