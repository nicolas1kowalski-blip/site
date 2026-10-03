using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;

namespace MesPremiersJeux.Lib
{
    /// <summary>
    /// Réglages PARTAGÉS entre les tablettes via le dossier de contenu
    /// synchronisé (OneDrive…) : la clé Azure (licence de voix), la voix
    /// choisie, la hauteur, le prénom de l'enfant. Le parent les « envoie »
    /// depuis la tablette de réglage ; au démarrage, chaque tablette applique
    /// automatiquement ce qu'elle trouve — plus rien à recopier à la main.
    /// </summary>
    public static class SharedSettings
    {
        private static string FilePath => Path.Combine(UserContent.RootDir, "reglages-partages.ini");

        /// <summary>Écrit les réglages à partager dans le dossier synchronisé.</summary>
        public static string Publish(Settings s)
        {
            try
            {
                File.WriteAllLines(FilePath, new[]
                {
                    "# Réglages partagés entre les tablettes (appliqués au démarrage).",
                    "AzureKey=" + (s.AzureKey ?? ""),
                    "AzureRegion=" + (s.AzureRegion ?? ""),
                    "AzureVoice=" + (s.AzureVoice ?? ""),
                    "VoiceName=" + (s.VoiceName ?? ""),
                    "VoicePitch=" + s.VoicePitch.ToString(CultureInfo.InvariantCulture),
                    "ChildName=" + (s.ChildName ?? ""),
                });
                return null;
            }
            catch (Exception ex) { return ex.Message; }
        }

        /// <summary>
        /// Applique les réglages partagés trouvés dans le dossier synchronisé.
        /// Renvoie true si quelque chose a changé (l'appelant sauvegarde alors
        /// en local, pour que ça marche aussi hors ligne ensuite).
        /// </summary>
        public static bool Apply(Settings s)
        {
            try
            {
                if (!File.Exists(FilePath)) return false;
                bool changed = false;
                foreach (var line in File.ReadAllLines(FilePath))
                {
                    int eq = line.IndexOf('=');
                    if (eq <= 0 || line.StartsWith("#")) continue;
                    var key = line.Substring(0, eq).Trim();
                    var val = line.Substring(eq + 1).Trim();
                    if (val.Length == 0) continue; // un champ vide n'écrase rien
                    switch (key)
                    {
                        case "AzureKey": if (s.AzureKey != val) { s.AzureKey = val; changed = true; } break;
                        case "AzureRegion": if (s.AzureRegion != val) { s.AzureRegion = val; changed = true; } break;
                        case "AzureVoice": if (s.AzureVoice != val) { s.AzureVoice = val; changed = true; } break;
                        case "VoiceName": if (s.VoiceName != val) { s.VoiceName = val; changed = true; } break;
                        case "VoicePitch":
                            if (double.TryParse(val, NumberStyles.Float, CultureInfo.InvariantCulture, out var p) &&
                                Math.Abs(s.VoicePitch - p) > 0.01) { s.VoicePitch = p; changed = true; }
                            break;
                        case "ChildName": if (s.ChildName != val) { s.ChildName = val; changed = true; } break;
                    }
                }
                return changed;
            }
            catch { return false; }
        }
    }
}
