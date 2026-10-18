using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;

namespace MesPremiersJeux.Lib
{
    /// <summary>
    /// 🎯 Les programmes de CALIBRAGE / réglages d'eye-tracking installés par
    /// Tobii ou Tobii Dynavox sur la tablette (PCEye 5, I-Series…), pour les
    /// lancer depuis l'application — sans passer par TD Control.
    /// </summary>
    public static class TobiiTools
    {
        public sealed class Tool
        {
            public string Path;
            public string Name;   // nom lisible (description du fichier)
            public int Rank;      // 0 = calibrage, 1 = réglages eye-tracking, 2 = configuration, 3 = réglages
        }

        // Ce qui n'est JAMAIS un outil de calibrage (installeurs, services…).
        private static readonly string[] Excluded =
        {
            "unins", "uninstall", "install", "setup", "update", "service", "crash", "report",
            "helper", "host", "server", "driver", "firmware", "elevat", "watchdog", "bootstrap",
        };

        public static List<Tool> FindCalibrationTools()
        {
            var roots = new[]
            {
                Environment.GetEnvironmentVariable("ProgramW6432"),
                Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
                Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),
            }.Where(r => !string.IsNullOrEmpty(r)).Distinct(StringComparer.OrdinalIgnoreCase);

            var res = new List<Tool>();
            foreach (var root in roots)
            {
                IEnumerable<string> tops;
                try { tops = Directory.GetDirectories(root); } catch { continue; }
                foreach (var top in tops)
                {
                    var dir = System.IO.Path.GetFileName(top).ToLowerInvariant();
                    if (!(dir.Contains("tobii") || dir.Contains("dynavox"))) continue;
                    foreach (var exe in Walk(top, 5))
                    {
                        string desc = "";
                        try { desc = FileVersionInfo.GetVersionInfo(exe).FileDescription ?? ""; } catch { }
                        var file = System.IO.Path.GetFileNameWithoutExtension(exe);
                        var key = (file + " " + desc).ToLowerInvariant().Replace(" ", "").Replace(".", "");
                        if (Excluded.Any(x => file.ToLowerInvariant().Contains(x))) continue;
                        int rank =
                            key.Contains("calibrat") ? 0 :
                            key.Contains("eyetracking") && key.Contains("setting") ? 1 :
                            key.Contains("configuration") ? 2 :
                            key.Contains("setting") ? 3 : -1;
                        if (rank < 0) continue;
                        if (res.Any(t => string.Equals(t.Path, exe, StringComparison.OrdinalIgnoreCase))) continue;
                        res.Add(new Tool { Path = exe, Name = string.IsNullOrWhiteSpace(desc) ? file : desc.Trim(), Rank = rank });
                        Log.Write("calib", "Outil Tobii trouvé : " + exe + " (« " + desc + " », rang " + rank + ")");
                    }
                }
            }
            return res.OrderBy(t => t.Rank).ThenBy(t => t.Name).Take(6).ToList();
        }

        private static IEnumerable<string> Walk(string dir, int depth)
        {
            var res = new List<string>();
            try { res.AddRange(Directory.GetFiles(dir, "*.exe")); } catch { }
            if (depth > 0)
            {
                string[] subs;
                try { subs = Directory.GetDirectories(dir); } catch { subs = new string[0]; }
                foreach (var s in subs) res.AddRange(Walk(s, depth - 1));
            }
            return res;
        }
    }
}
