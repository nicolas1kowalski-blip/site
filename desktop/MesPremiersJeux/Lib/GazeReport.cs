using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text;
using Microsoft.Win32;

namespace MesPremiersJeux.Lib
{
    /// <summary>
    /// 🔎 RAPPORT DU REGARD : tout ce qui décide si le regard direct marche sur
    /// une tablette — logiciels Tobii installés (et versions), programmes Tobii
    /// en marche, ce que chaque moteur a réellement envoyé à l'application.
    /// Fait sur deux tablettes (l'une marche, l'autre non), il montre la
    /// différence d'un coup d'œil. Écrit dans le dossier Contenu (synchronisé).
    /// </summary>
    public static class GazeReport
    {
        public static string Write(string driver, string activeSource, long consumerGaze, long consumerEyes,
                                   string streamStatus, string streamStats,
                                   string proStats, long proGuide, string proDevice, string proDiagnostic)
        {
            var sb = new StringBuilder();
            sb.AppendLine("RAPPORT DU REGARD — Eyzi");
            sb.AppendLine("=====================================");
            sb.AppendLine("Tablette : " + Environment.MachineName + "   ·   " + DateTime.Now.ToString("yyyy-MM-dd HH:mm"));
            sb.AppendLine("Windows : " + Environment.OSVersion.VersionString + (Environment.Is64BitOperatingSystem ? " (64 bits)" : ""));
            sb.AppendLine();
            sb.AppendLine("CE QUE L'APPLICATION REÇOIT");
            sb.AppendLine("  Pilote choisi : " + driver + "   ·   source utilisée : " + activeSource);
            sb.AppendLine("  SDK grand public (Tobii.Interaction) : " + consumerGaze + " points de regard, " + consumerEyes + " positions des yeux");
            sb.AppendLine("  Stream Engine (comme Grid 3) : " + streamStatus + " — regard valides/reçus = " + streamStats);
            sb.AppendLine("  Pro SDK (Tobii.Research) : regard valides/reçus = " + proStats + ", flux guide = " + proGuide);
            sb.AppendLine("  Tracker vu par le Pro SDK : " + (string.IsNullOrEmpty(proDevice) ? "(aucun)" : proDevice));
            if (!string.IsNullOrWhiteSpace(proDiagnostic))
            {
                sb.AppendLine("  Fiche technique du tracker :");
                foreach (var l in proDiagnostic.Split('\n')) sb.AppendLine("    " + l.TrimEnd());
            }
            sb.AppendLine();
            sb.AppendLine("LOGICIELS TOBII INSTALLÉS");
            var apps = InstalledTobii();
            if (apps.Count == 0) sb.AppendLine("  (aucun trouvé)");
            foreach (var a in apps) sb.AppendLine("  • " + a);
            sb.AppendLine();
            sb.AppendLine("OUTILS DE CALIBRAGE TROUVÉS (bouton « 🎯 Calibrer la tablette »)");
            List<TobiiTools.Tool> tools;
            try { tools = TobiiTools.FindCalibrationTools(); } catch { tools = new List<TobiiTools.Tool>(); }
            if (tools.Count == 0) sb.AppendLine("  (aucun)");
            foreach (var t in tools) sb.AppendLine("  • " + t.Name + " — " + t.Path);
            sb.AppendLine();
            sb.AppendLine("PROGRAMMES TOBII EN MARCHE");
            var procs = RunningTobii();
            if (procs.Count == 0) sb.AppendLine("  (aucun)");
            foreach (var p in procs) sb.AppendLine("  • " + p);

            string dir = UserContent.RootDir;
            try { Directory.CreateDirectory(dir); } catch { dir = Path.GetTempPath(); }
            var path = Path.Combine(dir, "rapport-regard-" + Environment.MachineName + ".txt");
            File.WriteAllText(path, sb.ToString(), Encoding.UTF8);
            Log.Write("app", "Rapport du regard écrit : " + path);
            return path;
        }

        private static List<string> InstalledTobii()
        {
            var res = new SortedSet<string>(StringComparer.OrdinalIgnoreCase);
            const string key = @"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall";
            foreach (var hive in new[] { RegistryHive.LocalMachine, RegistryHive.CurrentUser })
                foreach (var view in new[] { RegistryView.Registry64, RegistryView.Registry32 })
                {
                    try
                    {
                        using (var root = RegistryKey.OpenBaseKey(hive, view))
                        using (var un = root.OpenSubKey(key))
                        {
                            if (un == null) continue;
                            foreach (var sub in un.GetSubKeyNames())
                            {
                                using (var k = un.OpenSubKey(sub))
                                {
                                    var name = k?.GetValue("DisplayName") as string;
                                    if (string.IsNullOrEmpty(name)) continue;
                                    var pub = k.GetValue("Publisher") as string ?? "";
                                    if (name.IndexOf("tobii", StringComparison.OrdinalIgnoreCase) < 0 &&
                                        pub.IndexOf("tobii", StringComparison.OrdinalIgnoreCase) < 0) continue;
                                    var ver = k.GetValue("DisplayVersion") as string ?? "?";
                                    res.Add(name + "  —  version " + ver);
                                }
                            }
                        }
                    }
                    catch { }
                }
            return res.ToList();
        }

        public static List<string> RunningTobii()
        {
            var res = new SortedSet<string>(StringComparer.OrdinalIgnoreCase);
            try
            {
                foreach (var p in Process.GetProcesses())
                {
                    try
                    {
                        if (p.ProcessName.IndexOf("tobii", StringComparison.OrdinalIgnoreCase) >= 0 ||
                            p.ProcessName.IndexOf("eyex", StringComparison.OrdinalIgnoreCase) >= 0 ||
                            p.ProcessName.IndexOf("dynavox", StringComparison.OrdinalIgnoreCase) >= 0)
                            res.Add(p.ProcessName);
                    }
                    catch { }
                }
            }
            catch { }
            return res.ToList();
        }
    }
}
