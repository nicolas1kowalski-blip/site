using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;
using System.Text;
using System.Windows.Media.Imaging;

namespace MesPremiersJeux.Lib
{
    /// <summary>Zone interactive sur la photo d'une page (pourcentages, comme sur le web).</summary>
    public sealed class UserZone
    {
        public double Left, Top, Width, Height; // en % de l'image
        public string Label;
    }

    /// <summary>Une page d'histoire : texte + image éventuelle + zones interactives.</summary>
    public sealed class UserStoryPage
    {
        public string Text;
        public string ImagePath; // peut être null
        public List<UserZone> Zones = new List<UserZone>();
    }

    /// <summary>Une histoire chargée depuis Documents\MesPremiersJeux\Histoires.</summary>
    public sealed class UserStory
    {
        public string Title;
        public string Dir; // dossier du livre (pour modifier / supprimer)
        public List<UserStoryPage> Pages = new List<UserStoryPage>();
    }

    /// <summary>Page en cours d'édition (éditeur de livre).</summary>
    public sealed class PageDraft
    {
        public string Text = "";
        public string ImagePath;
        public List<UserZone> Zones = new List<UserZone>();
    }

    /// <summary>Un coloriage personnalisé (dessin au trait).</summary>
    public sealed class UserColoring
    {
        public string Name;
        public string Path;
    }

    // --- Schéma JSON des livres (identique à l'application web) ---
    [DataContract]
    internal sealed class BookJson
    {
        [DataMember(Name = "title")] public string Title;
        [DataMember(Name = "pages")] public List<BookPageJson> Pages;
    }

    [DataContract]
    internal sealed class BookPageJson
    {
        [DataMember(Name = "text", EmitDefaultValue = false)] public string Text;
        [DataMember(Name = "image", EmitDefaultValue = false)] public string Image; // data URL ou nom de fichier
        [DataMember(Name = "zones", EmitDefaultValue = false)] public List<BookZoneJson> Zones;
    }

    [DataContract]
    internal sealed class BookZoneJson
    {
        [DataMember(Name = "left")] public double Left;
        [DataMember(Name = "top")] public double Top;
        [DataMember(Name = "width")] public double Width;
        [DataMember(Name = "height")] public double Height;
        [DataMember(Name = "label")] public string Label;
    }

    /// <summary>
    /// Contenu ajouté par le parent (Documents\MesPremiersJeux) :
    ///   Coloriages\ → images au trait ;
    ///   Histoires\MonLivre\ → livre.json (+ images), ou histoire.txt + 1.png…
    /// </summary>
    public static class UserContent
    {
        private static readonly string[] ImageExts = { ".png", ".jpg", ".jpeg", ".bmp", ".gif" };

        /// <summary>Levé quand le contenu change en dehors des écrans (ex. import).</summary>
        public static event Action ContentChanged;

        private static string _root;

        /// <summary>
        /// Dossier du contenu. PORTABLE : « Contenu » à côté de l'application →
        /// copier le dossier de l'appli transporte tout (livres, coloriages,
        /// photos) sur n'importe quel PC. Repli sur Documents si non inscriptible.
        /// Le contenu existant de Documents est migré automatiquement (une fois).
        /// </summary>
        public static string RootDir
        {
            get
            {
                if (_root == null) _root = ResolveRoot();
                return _root;
            }
        }

        private static string DocsRoot =>
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments), "MesPremiersJeux");

        private static string ResolveRoot()
        {
            try
            {
                var portable = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "Contenu");
                Directory.CreateDirectory(portable);
                var probe = Path.Combine(portable, ".test-ecriture");
                File.WriteAllText(probe, "ok");
                File.Delete(probe);

                // Migration unique de l'ancien emplacement (Documents).
                var marker = Path.Combine(portable, ".migration-faite");
                if (!File.Exists(marker) && Directory.Exists(DocsRoot))
                {
                    CopyDirectory(DocsRoot, portable);
                    File.WriteAllText(marker, DateTime.Now.ToString("s"));
                }
                return portable;
            }
            catch
            {
                // Dossier programme non inscriptible (ex. Program Files).
                return DocsRoot;
            }
        }

        private static void CopyDirectory(string from, string to)
        {
            Directory.CreateDirectory(to);
            foreach (var f in Directory.GetFiles(from))
            {
                try
                {
                    var dest = Path.Combine(to, Path.GetFileName(f));
                    if (!File.Exists(dest)) File.Copy(f, dest);
                }
                catch { }
            }
            foreach (var d in Directory.GetDirectories(from))
                CopyDirectory(d, Path.Combine(to, Path.GetFileName(d)));
        }

        // ------------------------------------------------------------------
        // Export / import de tout le contenu (un seul fichier .zip)
        // ------------------------------------------------------------------
        public static bool ExportZip(string zipPath)
        {
            try
            {
                EnsureFolders();
                if (File.Exists(zipPath)) File.Delete(zipPath);
                System.IO.Compression.ZipFile.CreateFromDirectory(RootDir, zipPath);
                return true;
            }
            catch { return false; }
        }

        public static bool ImportZip(string zipPath)
        {
            try
            {
                EnsureFolders();
                using (var zip = System.IO.Compression.ZipFile.OpenRead(zipPath))
                {
                    foreach (var entry in zip.Entries)
                    {
                        if (entry.FullName.Contains("..")) continue; // sécurité
                        var dest = Path.Combine(RootDir, entry.FullName.Replace('/', Path.DirectorySeparatorChar));
                        if (string.IsNullOrEmpty(entry.Name)) // dossier
                        {
                            Directory.CreateDirectory(dest);
                            continue;
                        }
                        Directory.CreateDirectory(Path.GetDirectoryName(dest));
                        entry.ExtractToFile(dest, true);
                    }
                }
                ContentChanged?.Invoke();
                return true;
            }
            catch { return false; }
        }
        public static string ColoringsDir => Path.Combine(RootDir, "Coloriages");
        public static string StoriesDir => Path.Combine(RootDir, "Histoires");
        public static string FamilyDir => Path.Combine(RootDir, "Famille");

        public static void EnsureFolders()
        {
            try
            {
                Directory.CreateDirectory(ColoringsDir);
                Directory.CreateDirectory(StoriesDir);
                Directory.CreateDirectory(FamilyDir);

                var readme = Path.Combine(RootDir, "LISEZ-MOI.txt");
                if (!File.Exists(readme))
                {
                    File.WriteAllText(readme,
                        "MES PREMIERS JEUX — Ajouter du contenu\r\n" +
                        "=======================================\r\n\r\n" +
                        "Le plus simple : utilisez les boutons ➕ dans l'application\r\n" +
                        "(onglet Coloriage, et « Nouveau livre » dans Histoires).\r\n\r\n" +
                        "COLORIAGES : déposez des images au trait (PNG/JPG) dans « Coloriages ».\r\n\r\n" +
                        "FAMILLE : déposez des photos nommées par la personne (papa.jpg,\r\n" +
                        "  maman.png, mamie.jpg…) dans « Famille » : elles apparaissent dans\r\n" +
                        "  l'imagier de l'onglet Éducatif (« Trouve papa ! »).\r\n\r\n" +
                        "HISTOIRES : un dossier par livre dans « Histoires », contenant soit\r\n" +
                        "  - livre.json (même format que l'application web) + les images ;\r\n" +
                        "  - soit histoire.txt (une ligne = une page) + 1.png, 2.png…\r\n");
                }
            }
            catch { }
        }

        // ------------------------------------------------------------------
        // Coloriages
        // ------------------------------------------------------------------
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

        // ------------------------------------------------------------------
        // Famille (photos nommées : papa.jpg, maman.png, mamie.jpg…)
        // ------------------------------------------------------------------
        public static List<(string Name, string Path)> LoadFamily()
        {
            var list = new List<(string, string)>();
            try
            {
                if (!Directory.Exists(FamilyDir)) return list;
                foreach (var f in Directory.GetFiles(FamilyDir).OrderBy(f => f))
                {
                    if (!ImageExts.Contains(Path.GetExtension(f).ToLowerInvariant())) continue;
                    var name = Path.GetFileNameWithoutExtension(f).Trim();
                    if (name.Length > 0) list.Add((name, f));
                }
            }
            catch { }
            return list;
        }

        /// <summary>Copie une photo dans le dossier Famille sous le nom donné.</summary>
        public static bool AddFamilyPhoto(string sourcePath, string personName)
        {
            try
            {
                EnsureFolders();
                var ext = Path.GetExtension(sourcePath).ToLowerInvariant();
                if (!ImageExts.Contains(ext)) return false;
                var safe = new string(personName.Trim()
                    .Where(c => Array.IndexOf(Path.GetInvalidFileNameChars(), c) < 0).ToArray());
                if (safe.Length == 0) return false;
                File.Copy(sourcePath, UniquePath(FamilyDir, safe + ext));
                return true;
            }
            catch { return false; }
        }

        /// <summary>Supprime une photo du dossier Famille.</summary>
        public static bool DeleteFamilyPhoto(string path)
        {
            try
            {
                if (File.Exists(path) && path.StartsWith(FamilyDir, StringComparison.OrdinalIgnoreCase))
                {
                    File.Delete(path);
                    return true;
                }
            }
            catch { }
            return false;
        }

        /// <summary>Supprime un coloriage personnalisé.</summary>
        public static bool DeleteColoring(string path)
        {
            try
            {
                if (File.Exists(path) && path.StartsWith(ColoringsDir, StringComparison.OrdinalIgnoreCase))
                {
                    File.Delete(path);
                    return true;
                }
            }
            catch { }
            return false;
        }

        // ------------------------------------------------------------------
        // Histoires
        // ------------------------------------------------------------------
        public static List<UserStory> LoadStories()
        {
            var stories = new List<UserStory>();
            try
            {
                if (!Directory.Exists(StoriesDir)) return stories;
                foreach (var dir in Directory.GetDirectories(StoriesDir).OrderBy(d => d))
                {
                    var story = LoadStory(dir);
                    if (story != null && story.Pages.Count > 0)
                    {
                        story.Dir = dir;
                        stories.Add(story);
                    }
                }
            }
            catch { }
            return stories;
        }

        private static UserStory LoadStory(string dir)
        {
            try
            {
                var json = Path.Combine(dir, "livre.json");
                if (File.Exists(json)) return LoadJsonStory(dir, json);

                var txt = Directory.GetFiles(dir, "*.txt").OrderBy(f => f).FirstOrDefault();
                if (txt == null) return null;
                var lines = File.ReadAllLines(txt).Select(l => l.Trim()).Where(l => l.Length > 0).ToList();
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

        private static UserStory LoadJsonStory(string dir, string jsonPath)
        {
            var data = ParseJson(File.ReadAllText(jsonPath));
            if (data?.Pages == null || data.Pages.Count == 0) return null;

            var story = new UserStory
            {
                Title = string.IsNullOrWhiteSpace(data.Title) ? Path.GetFileName(dir) : data.Title.Trim(),
            };
            foreach (var p in data.Pages)
            {
                var page = new UserStoryPage { Text = (p.Text ?? "").Trim() };
                if (!string.IsNullOrEmpty(p.Image))
                {
                    var img = Path.Combine(dir, p.Image);
                    if (File.Exists(img)) page.ImagePath = img;
                }
                if (p.Zones != null)
                {
                    foreach (var z in p.Zones)
                    {
                        if (string.IsNullOrWhiteSpace(z.Label)) continue;
                        var zone = new UserZone
                        {
                            Left = Clamp(z.Left), Top = Clamp(z.Top),
                            Width = Clamp(z.Width), Height = Clamp(z.Height),
                            Label = z.Label.Trim(),
                        };
                        if (zone.Width > 0 && zone.Height > 0) page.Zones.Add(zone);
                    }
                }
                story.Pages.Add(page);
            }
            return story;
        }

        /// <summary>Enregistre un livre (format livre.json + images) ; renvoie null si échec.</summary>
        public static string SaveStory(string title, IList<PageDraft> pages)
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
                return WriteStory(dir, title, pages);
            }
            catch { return null; }
        }

        /// <summary>Met à jour un livre existant (dans son dossier) ; renvoie null si échec.</summary>
        public static string UpdateStory(string dir, string title, IList<PageDraft> pages)
        {
            try
            {
                if (!Directory.Exists(dir)) return SaveStory(title, pages);

                // Sécurise les images référencées DANS le dossier : copie temporaire
                // avant de nettoyer, pour pouvoir réécrire proprement 1.png, 2.png…
                foreach (var p in pages)
                {
                    if (string.IsNullOrEmpty(p.ImagePath) || !File.Exists(p.ImagePath)) continue;
                    if (!p.ImagePath.StartsWith(dir, StringComparison.OrdinalIgnoreCase)) continue;
                    var tmp = Path.Combine(Path.GetTempPath(), "mpj-" + Guid.NewGuid().ToString("N") + Path.GetExtension(p.ImagePath));
                    File.Copy(p.ImagePath, tmp, true);
                    p.ImagePath = tmp;
                }

                foreach (var f in Directory.GetFiles(dir)) File.Delete(f);
                return WriteStory(dir, title, pages);
            }
            catch { return null; }
        }

        /// <summary>Supprime définitivement un livre.</summary>
        public static bool DeleteStory(string dir)
        {
            try
            {
                if (Directory.Exists(dir) && dir.StartsWith(StoriesDir, StringComparison.OrdinalIgnoreCase))
                {
                    Directory.Delete(dir, true);
                    return true;
                }
            }
            catch { }
            return false;
        }

        private static string WriteStory(string dir, string title, IList<PageDraft> pages)
        {
            try
            {
                var data = new BookJson { Title = title.Trim(), Pages = new List<BookPageJson>() };
                for (int i = 0; i < pages.Count; i++)
                {
                    var p = pages[i];
                    var pj = new BookPageJson { Text = p.Text ?? "" };
                    if (!string.IsNullOrEmpty(p.ImagePath) && File.Exists(p.ImagePath))
                    {
                        var ext = Path.GetExtension(p.ImagePath).ToLowerInvariant();
                        if (ImageExts.Contains(ext))
                        {
                            var name = (i + 1) + ext;
                            File.Copy(p.ImagePath, Path.Combine(dir, name), true);
                            pj.Image = name;
                            if (p.Zones != null && p.Zones.Count > 0)
                                pj.Zones = p.Zones.Select(z => new BookZoneJson
                                {
                                    Left = z.Left, Top = z.Top, Width = z.Width, Height = z.Height, Label = z.Label,
                                }).ToList();
                        }
                    }
                    data.Pages.Add(pj);
                }

                using (var fs = File.Create(Path.Combine(dir, "livre.json")))
                {
                    var ser = new DataContractJsonSerializer(typeof(BookJson));
                    ser.WriteObject(fs, data);
                }
                return dir;
            }
            catch { return null; }
        }

        /// <summary>
        /// Importe un JSON au format web (title/pages/text/image dataURL/zones) :
        /// les images en data: sont décodées vers des fichiers temporaires.
        /// Renvoie null (avec message) si le JSON est invalide.
        /// </summary>
        public static (string Title, List<PageDraft> Pages)? ImportJson(string jsonText, out string error)
        {
            error = null;
            BookJson data;
            try { data = ParseJson(jsonText); }
            catch { error = "Ce fichier n'est pas un JSON valide."; return null; }

            if (data == null || string.IsNullOrWhiteSpace(data.Title))
            { error = "Le champ « title » est manquant ou vide."; return null; }
            if (data.Pages == null || data.Pages.Count == 0)
            { error = "Le champ « pages » doit être une liste non vide."; return null; }

            var pages = new List<PageDraft>();
            foreach (var p in data.Pages)
            {
                var draft = new PageDraft { Text = (p.Text ?? "").Trim() };
                if (!string.IsNullOrEmpty(p.Image) && p.Image.StartsWith("data:image"))
                {
                    draft.ImagePath = DecodeDataUrl(p.Image);
                    if (draft.ImagePath != null && p.Zones != null)
                    {
                        foreach (var z in p.Zones)
                        {
                            if (string.IsNullOrWhiteSpace(z.Label)) continue;
                            var zone = new UserZone
                            {
                                Left = Clamp(z.Left), Top = Clamp(z.Top),
                                Width = Clamp(z.Width), Height = Clamp(z.Height),
                                Label = z.Label.Trim(),
                            };
                            if (zone.Width > 0 && zone.Height > 0) draft.Zones.Add(zone);
                        }
                    }
                }
                pages.Add(draft);
            }
            return (data.Title.Trim(), pages);
        }

        private static BookJson ParseJson(string jsonText)
        {
            using (var ms = new MemoryStream(Encoding.UTF8.GetBytes(jsonText)))
            {
                var ser = new DataContractJsonSerializer(typeof(BookJson));
                return (BookJson)ser.ReadObject(ms);
            }
        }

        private static string DecodeDataUrl(string dataUrl)
        {
            try
            {
                int comma = dataUrl.IndexOf(',');
                if (comma < 0) return null;
                var header = dataUrl.Substring(0, comma);
                var ext = header.Contains("image/png") ? ".png" : header.Contains("image/gif") ? ".gif" : ".jpg";
                var bytes = Convert.FromBase64String(dataUrl.Substring(comma + 1));
                var path = Path.Combine(Path.GetTempPath(), "mpj-" + Guid.NewGuid().ToString("N") + ext);
                File.WriteAllBytes(path, bytes);
                return path;
            }
            catch { return null; }
        }

        private static double Clamp(double v) => double.IsNaN(v) ? 0 : Math.Max(0, Math.Min(100, v));

        private static string FindPageImage(string dir, int page)
        {
            foreach (var ext in ImageExts)
            {
                var p = Path.Combine(dir, page + ext);
                if (File.Exists(p)) return p;
            }
            return null;
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
