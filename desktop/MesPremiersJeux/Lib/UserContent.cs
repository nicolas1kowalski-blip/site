using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Windows.Media.Imaging;

namespace MesPremiersJeux.Lib
{
    /// <summary>Une page d'histoire personnalisée : texte + image éventuelle.</summary>
    public sealed class UserStoryPage
    {
        public string Text;
        public string ImagePath; // peut être null
    }

    /// <summary>Une histoire personnalisée chargée depuis Documents\MesPremiersJeux\Histoires.</summary>
    public sealed class UserStory
    {
        public string Title;
        public List<UserStoryPage> Pages = new List<UserStoryPage>();
    }

    /// <summary>Un coloriage personnalisé (dessin au trait) chargé depuis Documents\MesPremiersJeux\Coloriages.</summary>
    public sealed class UserColoring
    {
        public string Name;
        public string Path;
    }

    /// <summary>
    /// Contenu ajouté par le parent, via de simples dossiers dans
    /// Documents\MesPremiersJeux :
    ///
    ///   Coloriages\  → des images au trait (PNG/JPG, traits noirs sur fond clair).
    ///   Histoires\MonHistoire\ → « histoire.txt » (une ligne = une page)
    ///                            + images « 1.png », « 2.png », … (page 1, 2, …).
    /// </summary>
    public static class UserContent
    {
        private static readonly string[] ImageExts = { ".png", ".jpg", ".jpeg", ".bmp", ".gif" };

        public static string RootDir =>
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments), "MesPremiersJeux");
        public static string ColoringsDir => Path.Combine(RootDir, "Coloriages");
        public static string StoriesDir => Path.Combine(RootDir, "Histoires");

        /// <summary>Crée les dossiers (avec un mode d'emploi) s'ils n'existent pas.</summary>
        public static void EnsureFolders()
        {
            try
            {
                Directory.CreateDirectory(ColoringsDir);
                Directory.CreateDirectory(StoriesDir);

                var readme = Path.Combine(RootDir, "LISEZ-MOI.txt");
                if (!File.Exists(readme))
                {
                    File.WriteAllText(readme,
                        "MES PREMIERS JEUX — Ajouter du contenu\r\n" +
                        "=======================================\r\n\r\n" +
                        "COLORIAGES\r\n" +
                        "  Déposez des images au trait (PNG ou JPG, contours noirs sur fond\r\n" +
                        "  blanc) dans le dossier « Coloriages ». Elles apparaissent dans\r\n" +
                        "  l'onglet Coloriage au prochain lancement.\r\n\r\n" +
                        "HISTOIRES\r\n" +
                        "  Créez un dossier par histoire dans « Histoires », par exemple :\r\n" +
                        "    Histoires\\La petite sirène\\\r\n" +
                        "  Dedans :\r\n" +
                        "    - histoire.txt : une ligne de texte par page ;\r\n" +
                        "    - 1.png, 2.png, 3.png… : l'image de la page 1, 2, 3…\r\n" +
                        "  Le nom du dossier devient le titre du livre.\r\n");
                }
            }
            catch { /* pas bloquant */ }
        }

        public static List<UserColoring> LoadColorings()
        {
            var list = new List<UserColoring>();
            try
            {
                if (!Directory.Exists(ColoringsDir)) return list;
                foreach (var f in Directory.GetFiles(ColoringsDir).OrderBy(f => f))
                {
                    if (!ImageExts.Contains(Path.GetExtension(f).ToLowerInvariant())) continue;
                    list.Add(new UserColoring { Name = Path.GetFileNameWithoutExtension(f), Path = f });
                }
            }
            catch { }
            return list;
        }

        public static List<UserStory> LoadStories()
        {
            var stories = new List<UserStory>();
            try
            {
                if (!Directory.Exists(StoriesDir)) return stories;
                foreach (var dir in Directory.GetDirectories(StoriesDir).OrderBy(d => d))
                {
                    var story = LoadStory(dir);
                    if (story != null && story.Pages.Count > 0) stories.Add(story);
                }
            }
            catch { }
            return stories;
        }

        private static UserStory LoadStory(string dir)
        {
            try
            {
                var txt = Directory.GetFiles(dir, "*.txt").OrderBy(f => f).FirstOrDefault();
                if (txt == null) return null;
                var lines = File.ReadAllLines(txt)
                    .Select(l => l.Trim())
                    .Where(l => l.Length > 0)
                    .ToList();
                if (lines.Count == 0) return null;

                var story = new UserStory { Title = Path.GetFileName(dir) };
                for (int i = 0; i < lines.Count; i++)
                {
                    story.Pages.Add(new UserStoryPage
                    {
                        Text = lines[i],
                        ImagePath = FindPageImage(dir, i + 1),
                    });
                }
                return story;
            }
            catch { return null; }
        }

        private static string FindPageImage(string dir, int page)
        {
            foreach (var ext in ImageExts)
            {
                var p = Path.Combine(dir, page + ext);
                if (File.Exists(p)) return p;
            }
            return null;
        }

        /// <summary>Copie des images dans le dossier Coloriages ; renvoie les chemins ajoutés.</summary>
        public static List<string> AddColorings(IEnumerable<string> files)
        {
            EnsureFolders();
            var added = new List<string>();
            foreach (var f in files)
            {
                try
                {
                    if (!ImageExts.Contains(Path.GetExtension(f).ToLowerInvariant())) continue;
                    var dest = UniquePath(ColoringsDir, Path.GetFileName(f));
                    File.Copy(f, dest);
                    added.Add(dest);
                }
                catch { }
            }
            return added;
        }

        /// <summary>Enregistre un livre (titre + pages texte/image) ; renvoie null si échec.</summary>
        public static string SaveStory(string title, IList<(string Text, string ImagePath)> pages)
        {
            try
            {
                EnsureFolders();
                var safe = new string(title.Trim()
                    .Where(c => Array.IndexOf(Path.GetInvalidFileNameChars(), c) < 0).ToArray());
                if (safe.Length == 0) safe = "Mon histoire";
                var dir = Path.Combine(StoriesDir, safe);
                for (int i = 2; Directory.Exists(dir); i++) dir = Path.Combine(StoriesDir, safe + " " + i);
                Directory.CreateDirectory(dir);

                File.WriteAllLines(Path.Combine(dir, "histoire.txt"),
                    pages.Select(p => p.Text.Trim().Replace("\r", " ").Replace("\n", " ")));

                for (int i = 0; i < pages.Count; i++)
                {
                    var img = pages[i].ImagePath;
                    if (string.IsNullOrEmpty(img) || !File.Exists(img)) continue;
                    var ext = Path.GetExtension(img).ToLowerInvariant();
                    if (!ImageExts.Contains(ext)) continue;
                    File.Copy(img, Path.Combine(dir, (i + 1) + ext), true);
                }
                return dir;
            }
            catch { return null; }
        }

        private static string UniquePath(string dir, string fileName)
        {
            var name = Path.GetFileNameWithoutExtension(fileName);
            var ext = Path.GetExtension(fileName);
            var p = Path.Combine(dir, fileName);
            for (int i = 2; File.Exists(p); i++) p = Path.Combine(dir, name + " " + i + ext);
            return p;
        }

        /// <summary>Charge une image depuis le disque (sans verrouiller le fichier).</summary>
        public static BitmapImage LoadBitmap(string path, int maxSize = 1600)
        {
            var bmp = new BitmapImage();
            bmp.BeginInit();
            bmp.CacheOption = BitmapCacheOption.OnLoad;
            bmp.UriSource = new Uri(path);
            bmp.DecodePixelWidth = maxSize;
            bmp.EndInit();
            bmp.Freeze();
            return bmp;
        }
    }
}
