using System;
using System.Collections.Generic;
using System.IO;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Imaging;

namespace MesPremiersJeux.Lib
{
    /// <summary>
    /// Images personnalisées à la place des emojis : si une image nommée existe
    /// dans « Contenu\Images » (ex. oiseau-1.png), les jeux l'affichent ; sinon
    /// ils retombent sur l'emoji — AUCUN risque, l'application marche toujours.
    /// Le parent dépose simplement des PNG (fond transparent de préférence,
    /// par ex. depuis kenney.nl ou générés par IA) avec les bons noms, listés
    /// dans le LISEZ-MOI du dossier.
    /// </summary>
    public static class Art
    {
        private static readonly Dictionary<string, ImageSource> Cache =
            new Dictionary<string, ImageSource>(StringComparer.OrdinalIgnoreCase);
        private static readonly string[] Exts = { ".png", ".jpg", ".jpeg", ".gif" };
        private static bool _ready;

        public static string Dir => Path.Combine(UserContent.RootDir, "Images");

        /// <summary>L'image nommée (sans extension), ou null si absente.</summary>
        public static ImageSource Find(string name)
        {
            if (string.IsNullOrEmpty(name)) return null;
            EnsureFolder();
            if (Cache.TryGetValue(name, out var cached)) return cached;

            ImageSource src = null;
            try
            {
                foreach (var ext in Exts)
                {
                    var path = Path.Combine(Dir, name + ext);
                    if (!File.Exists(path)) continue;
                    var bmp = new BitmapImage();
                    bmp.BeginInit();
                    bmp.CacheOption = BitmapCacheOption.OnLoad; // fichier libéré aussitôt
                    bmp.UriSource = new Uri(path, UriKind.Absolute);
                    bmp.EndInit();
                    bmp.Freeze();
                    src = bmp;
                    break;
                }
            }
            catch { src = null; }
            Cache[name] = src; // null aussi : évite de re-sonder le disque
            return src;
        }

        /// <summary>
        /// Le visuel d'un élément de jeu : l'image personnalisée si elle existe
        /// (carré de « size »), sinon l'emoji en repli (taille équivalente).
        /// </summary>
        public static FrameworkElement Visual(string name, string emojiFallback, double size)
        {
            var src = Find(name);
            if (src != null)
            {
                return new Image
                {
                    Source = src,
                    Width = size,
                    Height = size,
                    Stretch = Stretch.Uniform,
                    HorizontalAlignment = HorizontalAlignment.Center,
                    VerticalAlignment = VerticalAlignment.Center,
                };
            }
            return new TextBlock
            {
                Text = emojiFallback,
                FontSize = size * 0.78, // un emoji est ~25 % plus haut que sa FontSize
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
            };
        }

        /// <summary>Crée le dossier « Images » et son mode d'emploi (une fois).</summary>
        public static void EnsureFolder()
        {
            if (_ready) return;
            _ready = true;
            try
            {
                Directory.CreateDirectory(Dir);
                var readme = Path.Combine(Dir, "LISEZ-MOI.txt");
                if (File.Exists(readme)) return;
                File.WriteAllText(readme,
                    "MES PREMIERS JEUX — Images personnalisées\r\n" +
                    "==========================================\r\n\r\n" +
                    "Déposez ici des images PNG (fond transparent de préférence) avec les\r\n" +
                    "noms ci-dessous : les jeux les utiliseront À LA PLACE des emojis.\r\n" +
                    "S'il manque une image, le jeu garde l'emoji : aucun risque.\r\n\r\n" +
                    "Où trouver de jolies images ?\r\n" +
                    "  - kenney.nl : des milliers de dessins de jeux GRATUITS (licence CC0),\r\n" +
                    "    style cartoon cohérent (animaux, fusées, visages...).\r\n" +
                    "  - L'IA (Bing Image Creator, ChatGPT...) : demandez par exemple\r\n" +
                    "    « oiseau cartoon mignon pour enfant, fond transparent, style flat ».\r\n\r\n" +
                    "NOMS ATTENDUS\r\n" +
                    "-------------\r\n\r\n" +
                    "Les oiseaux chanteurs :\r\n" +
                    "  oiseau-1.png ... oiseau-6.png   (6 oiseaux différents)\r\n\r\n" +
                    "Tartes à la crème :\r\n" +
                    "  visage-1.png ... visage-8.png   (visages rigolos)\r\n" +
                    "  visage-touche-1.png ... visage-touche-4.png   (grimaces « touché ! »)\r\n" +
                    "  tarte.png                        (la tarte qui vole)\r\n\r\n" +
                    "La fenêtre magique (les surprises cachées) :\r\n" +
                    "  surprise-1.png  (lion)        surprise-2.png  (licorne)\r\n" +
                    "  surprise-3.png  (fusée)       surprise-4.png  (château)\r\n" +
                    "  surprise-5.png  (baleine)     surprise-6.png  (tracteur)\r\n" +
                    "  surprise-7.png  (arc-en-ciel) surprise-8.png  (dinosaure)\r\n" +
                    "  surprise-9.png  (gâteau)      surprise-10.png (éléphant)\r\n" +
                    "  surprise-11.png (bateau)      surprise-12.png (manège)\r\n\r\n" +
                    "D'autres noms seront ajoutés au fil des jeux (ce fichier est recréé\r\n" +
                    "s'il est supprimé, avec la liste à jour).\r\n");
            }
            catch { }
        }
    }
}
