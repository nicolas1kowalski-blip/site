using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;

namespace MesPremiersJeux.Lib
{
    /// <summary>
    /// Réglages du pilotage au regard, sauvegardés sur le disque pour être
    /// conservés d'une session à l'autre (utile sur la TD I-13).
    /// Fichier : %AppData%\MesPremiersJeux\settings.ini
    /// </summary>
    public sealed class Settings
    {
        public int DwellTime = 900;      // ms
        public double Smoothing = 0.8;   // 0 = réactif … 1 = très lissé/stable
        public double CircleSize = 90;   // diamètre du cercle de progression (px)

        private static string Dir =>
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "MesPremiersJeux");
        private static string FilePath => Path.Combine(Dir, "settings.ini");

        public static Settings Load()
        {
            var s = new Settings();
            try
            {
                if (!File.Exists(FilePath)) return s;
                foreach (var line in File.ReadAllLines(FilePath))
                {
                    int eq = line.IndexOf('=');
                    if (eq <= 0) continue;
                    var key = line.Substring(0, eq).Trim();
                    var val = line.Substring(eq + 1).Trim();
                    switch (key)
                    {
                        case "DwellTime": if (int.TryParse(val, NumberStyles.Integer, CultureInfo.InvariantCulture, out var d)) s.DwellTime = d; break;
                        case "Smoothing": if (double.TryParse(val, NumberStyles.Float, CultureInfo.InvariantCulture, out var sm)) s.Smoothing = sm; break;
                        case "CircleSize": if (double.TryParse(val, NumberStyles.Float, CultureInfo.InvariantCulture, out var c)) s.CircleSize = c; break;
                    }
                }
            }
            catch { /* réglages par défaut */ }
            return s;
        }

        public void Save()
        {
            try
            {
                Directory.CreateDirectory(Dir);
                var lines = new List<string>
                {
                    "DwellTime=" + DwellTime.ToString(CultureInfo.InvariantCulture),
                    "Smoothing=" + Smoothing.ToString(CultureInfo.InvariantCulture),
                    "CircleSize=" + CircleSize.ToString(CultureInfo.InvariantCulture),
                };
                File.WriteAllLines(FilePath, lines);
            }
            catch { /* ignore */ }
        }
    }
}
