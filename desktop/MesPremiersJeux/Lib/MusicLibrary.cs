using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;

namespace MesPremiersJeux.Lib
{
    /// <summary>
    /// Liste des musiques favorites (tuiles de l'onglet Musique), enregistrée sur
    /// le disque. Format simple : une ligne par favori « uri \t titre \t pochette ».
    /// Fichier : %AppData%\MesPremiersJeux\musique.tsv
    /// </summary>
    public static class MusicLibrary
    {
        private static string Dir =>
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "MesPremiersJeux");
        private static string FilePath => Path.Combine(Dir, "musique.tsv");

        public static List<Favorite> Load()
        {
            var list = new List<Favorite>();
            try
            {
                if (!File.Exists(FilePath)) return list;
                foreach (var line in File.ReadAllLines(FilePath))
                {
                    if (string.IsNullOrWhiteSpace(line)) continue;
                    var p = line.Split('\t');
                    if (p.Length < 1 || string.IsNullOrWhiteSpace(p[0])) continue;
                    list.Add(new Favorite
                    {
                        Uri = p[0].Trim(),
                        Title = p.Length > 1 ? p[1] : "Ma musique",
                        Thumb = p.Length > 2 ? p[2] : "",
                    });
                }
            }
            catch { /* liste vide */ }
            return list;
        }

        public static void Save(IEnumerable<Favorite> favorites)
        {
            try
            {
                Directory.CreateDirectory(Dir);
                var lines = favorites.Select(f =>
                    (f.Uri ?? "").Replace('\t', ' ') + "\t" +
                    (f.Title ?? "").Replace('\t', ' ').Replace('\n', ' ').Replace('\r', ' ') + "\t" +
                    (f.Thumb ?? "").Replace('\t', ' '));
                File.WriteAllLines(FilePath, lines, Encoding.UTF8);
            }
            catch { /* ignore */ }
        }
    }
}
