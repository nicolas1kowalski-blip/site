using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
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
        public List<UserQuestion> Questions = new List<UserQuestion>(); // quiz de fin
    }

    /// <summary>Type de question du quiz de fin d'histoire.</summary>
    public enum QuizKind { TrueFalse, Image }

    /// <summary>Une réponse-image du quiz (photo, ou dessin intégré via « draw »).</summary>
    public sealed class QuizChoice
    {
        public string ImagePath;  // fichier image (peut être null)
        public string Draw;       // nom d'un dessin intégré : chat, licorne… (peut être null)
        public bool Correct;      // vraie réponse ?
    }

    /// <summary>Une question posée à la fin de l'histoire : Vrai/Faux ou choix d'image.</summary>
    public sealed class UserQuestion
    {
        public string Text = "";
        public QuizKind Kind = QuizKind.TrueFalse;
        public bool Answer;                                        // pour Vrai/Faux
        public List<QuizChoice> Choices = new List<QuizChoice>();  // pour Image
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
        [DataMember(Name = "metadata", EmitDefaultValue = false)] public BookMetaJson Metadata; // certains fichiers mettent le titre ici
        [DataMember(Name = "pages")] public List<BookPageJson> Pages;
        [DataMember(Name = "questions", EmitDefaultValue = false)] public List<BookQuestionJson> Questions;
    }

    [DataContract]
    internal sealed class BookMetaJson
    {
        [DataMember(Name = "title", EmitDefaultValue = false)] public string Title;
    }

    [DataContract]
    internal sealed class BookQuestionJson
    {
        [DataMember(Name = "text")] public string Text;
        [DataMember(Name = "type", EmitDefaultValue = false)] public string Type;        // "vraifaux" | "image"
        [DataMember(Name = "answer", EmitDefaultValue = false)] public bool Answer;      // pour vraifaux
        [DataMember(Name = "choices", EmitDefaultValue = false)] public List<BookChoiceJson> Choices;
    }

    [DataContract]
    internal sealed class BookChoiceJson
    {
        [DataMember(Name = "image", EmitDefaultValue = false)] public string Image;      // fichier ou data URL
        [DataMember(Name = "draw", EmitDefaultValue = false)] public string Draw;        // dessin intégré
        [DataMember(Name = "correct", EmitDefaultValue = false)] public bool Correct;
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
                ZipFile.CreateFromDirectory(RootDir, zipPath);
                return true;
            }
            catch { return false; }
        }

        public static bool ImportZip(string zipPath)
        {
            try
            {
                EnsureFolders();
                using (var zip = ZipFile.OpenRead(zipPath))
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
                        "  - soit histoire.txt (une ligne = une page) + 1.png, 2.png…\r\n\r\n" +
                        "IMAGE (champ \"image\") : peut être\r\n" +
                        "  - un nom de fichier posé dans le dossier du livre : \"1.png\" ;\r\n" +
                        "  - un chemin complet : \"C:\\\\Users\\\\Moi\\\\Images\\\\photo.png\" ;\r\n" +
                        "  - une adresse Internet : \"https://exemple.com/photo.png\" ;\r\n" +
                        "  - une image encodée (data URL) : \"data:image/png;base64,....\".\r\n" +
                        "  Astuce : les fichiers et data URL sont copiés dans le livre (contenu\r\n" +
                        "  portable) ; une adresse http reste un lien (nécessite Internet).\r\n\r\n" +
                        "QUIZ DE FIN (facultatif) : dans livre.json, ajoutez un tableau\r\n" +
                        "  \"questions\" après \"pages\". Deux types :\r\n" +
                        "  - Vrai/Faux : {\"text\":\"La licorne est rose ?\",\"type\":\"vraifaux\",\"answer\":true}\r\n" +
                        "  - Images    : {\"text\":\"Montre le chat !\",\"type\":\"image\",\"choices\":[\r\n" +
                        "                  {\"draw\":\"chat\",\"correct\":true},{\"draw\":\"poisson\"}]}\r\n" +
                        "  « draw » = dessin intégré (chat, chien, licorne, princesse, fleur,\r\n" +
                        "  poisson, papillon, arcenciel, etoile, coeur, soleil, nuage, cochon,\r\n" +
                        "  lapin, oiseau, couronne, chateau). Ou « image »:\"photo.png\" (fichier\r\n" +
                        "  dans le dossier du livre). Le plus simple : le bouton « Nouveau livre ».\r\n");
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

            var story = new UserStory { Title = BookTitle(data, Path.GetFileName(dir)) };
            foreach (var p in data.Pages)
            {
                var page = new UserStoryPage { Text = (p.Text ?? "").Trim() };
                if (!string.IsNullOrEmpty(p.Image))
                {
                    var img = ResolveImageRef(dir, p.Image);
                    if (img != null) page.ImagePath = img;
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

            // Quiz de fin (images résolues comme les pages : fichier du dossier,
            // chemin absolu, URL ou data URL).
            if (data.Questions != null)
            {
                foreach (var q in data.Questions)
                {
                    var uq = ParseQuestion(q, dir);
                    if (uq != null) story.Questions.Add(uq);
                }
            }
            return story;
        }

        // Construit une UserQuestion à partir du JSON. « dir » = dossier du livre
        // (peut être null lors d'un import sans fichiers).
        private static UserQuestion ParseQuestion(BookQuestionJson q, string dir)
        {
            if (q == null || string.IsNullOrWhiteSpace(q.Text)) return null;
            var uq = new UserQuestion { Text = q.Text.Trim() };

            bool isImage = string.Equals(q.Type, "image", StringComparison.OrdinalIgnoreCase)
                           || (q.Choices != null && q.Choices.Count > 0);
            if (isImage)
            {
                uq.Kind = QuizKind.Image;
                if (q.Choices != null)
                {
                    foreach (var c in q.Choices)
                    {
                        var choice = new QuizChoice
                        {
                            Correct = c.Correct,
                            Draw = string.IsNullOrWhiteSpace(c.Draw) ? null : c.Draw.Trim(),
                        };
                        if (!string.IsNullOrEmpty(c.Image))
                            choice.ImagePath = ResolveImageRef(dir, c.Image);
                        if (choice.ImagePath != null || choice.Draw != null) uq.Choices.Add(choice);
                    }
                }
                if (uq.Choices.Count < 2 || !uq.Choices.Any(c => c.Correct)) return null;
            }
            else
            {
                uq.Kind = QuizKind.TrueFalse;
                uq.Answer = q.Answer;
            }
            return uq;
        }

        /// <summary>Vrai si la référence est une URL http(s) ou une data URL (à stocker telle quelle).</summary>
        public static bool IsRemoteOrData(string s) =>
            !string.IsNullOrEmpty(s) &&
            (s.StartsWith("data:image", StringComparison.OrdinalIgnoreCase) ||
             s.StartsWith("http://", StringComparison.OrdinalIgnoreCase) ||
             s.StartsWith("https://", StringComparison.OrdinalIgnoreCase));

        /// <summary>Vrai si la référence est affichable (fichier existant, URL ou data URL).</summary>
        public static bool IsImageRef(string s) =>
            IsRemoteOrData(s) || (!string.IsNullOrEmpty(s) && File.Exists(s));

        /// <summary>
        /// Résout une référence d'image écrite dans le JSON en un chemin/URL
        /// exploitable, ou null. Accepte : data URL (décodée vers un fichier
        /// temporaire), URL http(s), file:///, chemin absolu, ou nom de fichier
        /// relatif au dossier du livre.
        /// </summary>
        public static string ResolveImageRef(string dir, string value)
        {
            if (string.IsNullOrWhiteSpace(value)) return null;
            value = value.Trim();
            if (value.StartsWith("data:image", StringComparison.OrdinalIgnoreCase)) return DecodeDataUrl(value);
            if (value.StartsWith("http://", StringComparison.OrdinalIgnoreCase) ||
                value.StartsWith("https://", StringComparison.OrdinalIgnoreCase)) return value;
            if (value.StartsWith("file:///", StringComparison.OrdinalIgnoreCase))
            {
                try { var p = new Uri(value).LocalPath; return File.Exists(p) ? p : null; }
                catch { return null; }
            }
            try { if (Path.IsPathRooted(value) && File.Exists(value)) return value; }
            catch { }
            if (dir != null)
            {
                var p = Path.Combine(dir, value);
                if (File.Exists(p)) return p;
            }
            return null;
        }

        /// <summary>Enregistre un livre (format livre.json + images) ; renvoie null si échec.</summary>
        public static string SaveStory(string title, IList<PageDraft> pages, IList<UserQuestion> questions = null)
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
                return WriteStory(dir, title, pages, questions);
            }
            catch { return null; }
        }

        /// <summary>Met à jour un livre existant (dans son dossier) ; renvoie null si échec.</summary>
        public static string UpdateStory(string dir, string title, IList<PageDraft> pages, IList<UserQuestion> questions = null)
        {
            try
            {
                if (!Directory.Exists(dir)) return SaveStory(title, pages, questions);

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
                // Idem pour les images-réponses du quiz.
                if (questions != null)
                    foreach (var c in questions.SelectMany(q => q.Choices))
                    {
                        if (string.IsNullOrEmpty(c.ImagePath) || !File.Exists(c.ImagePath)) continue;
                        if (!c.ImagePath.StartsWith(dir, StringComparison.OrdinalIgnoreCase)) continue;
                        var tmp = Path.Combine(Path.GetTempPath(), "mpj-" + Guid.NewGuid().ToString("N") + Path.GetExtension(c.ImagePath));
                        File.Copy(c.ImagePath, tmp, true);
                        c.ImagePath = tmp;
                    }

                foreach (var f in Directory.GetFiles(dir)) File.Delete(f);
                return WriteStory(dir, title, pages, questions);
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

        private static string WriteStory(string dir, string title, IList<PageDraft> pages, IList<UserQuestion> questions = null)
        {
            try
            {
                var data = new BookJson { Title = title.Trim(), Pages = new List<BookPageJson>() };
                for (int i = 0; i < pages.Count; i++)
                {
                    var p = pages[i];
                    var pj = new BookPageJson { Text = p.Text ?? "" };
                    pj.Image = StoreImage(dir, (i + 1).ToString(), p.ImagePath);
                    if (pj.Image != null && p.Zones != null && p.Zones.Count > 0)
                        pj.Zones = p.Zones.Select(z => new BookZoneJson
                        {
                            Left = z.Left, Top = z.Top, Width = z.Width, Height = z.Height, Label = z.Label,
                        }).ToList();
                    data.Pages.Add(pj);
                }

                // Quiz de fin : images-réponses copiées en q1_1.png, q1_2.png…
                if (questions != null)
                {
                    var qList = new List<BookQuestionJson>();
                    for (int i = 0; i < questions.Count; i++)
                    {
                        var q = questions[i];
                        if (string.IsNullOrWhiteSpace(q.Text)) continue;
                        var qj = new BookQuestionJson { Text = q.Text.Trim() };
                        if (q.Kind == QuizKind.Image)
                        {
                            qj.Type = "image";
                            qj.Choices = new List<BookChoiceJson>();
                            int ci = 0;
                            foreach (var c in q.Choices)
                            {
                                ci++;
                                var cj = new BookChoiceJson { Correct = c.Correct };
                                if (!string.IsNullOrWhiteSpace(c.Draw))
                                {
                                    cj.Draw = c.Draw.Trim();
                                }
                                else
                                {
                                    cj.Image = StoreImage(dir, "q" + (i + 1) + "_" + ci, c.ImagePath);
                                    if (cj.Image == null) continue;
                                }
                                qj.Choices.Add(cj);
                            }
                            if (qj.Choices.Count >= 2 && qj.Choices.Any(x => x.Correct)) qList.Add(qj);
                        }
                        else
                        {
                            qj.Type = "vraifaux";
                            qj.Answer = q.Answer;
                            qList.Add(qj);
                        }
                    }
                    if (qList.Count > 0) data.Questions = qList;
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

        // Décide comment stocker une image dans le livre : un fichier local est
        // copié dans le dossier (nom « baseName.ext » → contenu portable) ; une URL
        // http(s) est conservée telle quelle (lien). Renvoie la valeur du champ
        // « image » du JSON, ou null si rien d'exploitable.
        private static string StoreImage(string dir, string baseName, string src)
        {
            if (string.IsNullOrEmpty(src)) return null;
            if (src.StartsWith("http://", StringComparison.OrdinalIgnoreCase) ||
                src.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
                return src; // lien conservé tel quel
            if (File.Exists(src))
            {
                var ext = Path.GetExtension(src).ToLowerInvariant();
                if (!ImageExts.Contains(ext)) return null;
                var name = baseName + ext;
                File.Copy(src, Path.Combine(dir, name), true);
                return name;
            }
            return null;
        }

        /// <summary>Livre importé depuis un JSON (pour pré-remplir l'éditeur).</summary>
        public sealed class ImportedBook
        {
            public string Title;
            public List<PageDraft> Pages = new List<PageDraft>();
            public List<UserQuestion> Questions = new List<UserQuestion>();
        }

        /// <summary>
        /// Importe un JSON au format web (title/pages/text/image dataURL/zones) plus
        /// le quiz de fin (questions) : les images en data: sont décodées vers des
        /// fichiers temporaires. Renvoie null (avec message) si le JSON est invalide.
        /// </summary>
        public static ImportedBook ImportJson(string jsonText, out string error)
        {
            error = null;
            BookJson data;
            try { data = ParseJson(jsonText); }
            catch { error = "Ce fichier n'est pas un JSON valide."; return null; }

            if (data == null)
            { error = "Ce fichier n'est pas un JSON valide."; return null; }
            if (data.Pages == null || data.Pages.Count == 0)
            { error = "Le champ « pages » doit être une liste non vide."; return null; }

            // Le titre n'est PAS bloquant : on le prend où qu'il soit (racine ou
            // metadata), sinon on laisse vide (le parent le complétera dans l'éditeur).
            var book = new ImportedBook { Title = BookTitle(data, "") };
            foreach (var p in data.Pages)
            {
                var draft = new PageDraft { Text = (p.Text ?? "").Trim() };
                // Image : seules les data URL sont embarquées dans le JSON ; un nom
                // de fichier (ex. « page_001.png ») sera ajouté par le parent ensuite.
                if (!string.IsNullOrEmpty(p.Image) && p.Image.StartsWith("data:image"))
                    draft.ImagePath = DecodeDataUrl(p.Image);
                // Zones : conservées même sans image, pour ne pas perdre le travail
                // (elles seront réutilisées quand une photo sera ajoutée à la page).
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
                        if (zone.Width > 0 && zone.Height > 0) draft.Zones.Add(zone);
                    }
                }
                book.Pages.Add(draft);
            }

            // Quiz : images en data URL décodées ; noms de fichiers ignorés (l'import
            // JSON n'embarque pas de fichiers séparés).
            if (data.Questions != null)
            {
                foreach (var q in data.Questions)
                {
                    var uq = ParseQuestion(q, null);
                    if (uq != null) book.Questions.Add(uq);
                }
            }
            return book;
        }

        // Titre du livre : racine « title », sinon « metadata.title », sinon repli.
        private static string BookTitle(BookJson data, string fallback)
        {
            if (data == null) return fallback;
            if (!string.IsNullOrWhiteSpace(data.Title)) return data.Title.Trim();
            if (!string.IsNullOrWhiteSpace(data.Metadata?.Title)) return data.Metadata.Title.Trim();
            return fallback;
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
