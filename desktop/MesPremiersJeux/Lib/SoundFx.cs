using System;
using System.Collections.Generic;
using System.IO;
using System.Media;

namespace MesPremiersJeux.Lib
{
    /// <summary>
    /// Petits sons synthétisés en mémoire — gazouillis d'oiseaux, boum de feu
    /// d'artifice, splat de tarte, pof de buée… Aucun fichier à installer : les
    /// ondes sont calculées une fois (cache) puis jouées. Rendu doux, pensé pour
    /// les jeux sensoriels.
    /// </summary>
    public static class SoundFx
    {
        private const int Rate = 22050;
        private static readonly Dictionary<string, byte[]> Cache = new Dictionary<string, byte[]>();
        private static SoundPlayer _player;
        private static MemoryStream _stream;

        // ------------------------------------------------------------------
        //  Les sons publics
        // ------------------------------------------------------------------

        // ------------------------------------------------------------------
        //  Chants d'oiseaux « qui s'accordent » (comme Look to Learn) : toutes
        //  les mélodies sont tirées de la MÊME gamme pentatonique — deux chants
        //  joués l'un après l'autre (ou ensemble) sonnent donc toujours en
        //  harmonie. Chaque oiseau garde sa tessiture (le hibou grave, le
        //  poussin aigu) et sa mélodie à lui, toujours la même.
        // ------------------------------------------------------------------
        private static readonly double[] Scale = { 523.25, 587.33, 659.25, 783.99, 880.0, 1046.5 };
        private static readonly double[] Registers = { 1.0, 1.5, 1.25, 0.5, 0.67, 0.8 };

        /// <summary>Le chant de l'oiseau n° voice (0..5).</summary>
        public static void BirdChirp(int voice)
            => Play("bird3-" + voice, () => Motif(voice));

        // ------------------------------------------------------------------
        //  Chants EN BOUCLE (fichiers WAV joués par des lecteurs indépendants :
        //  plusieurs oiseaux chantent réellement EN MÊME TEMPS). Tous chantent
        //  la MÊME phrase musicale, transposée dans leur tessiture : démarrés
        //  à des moments différents, c'est un CANON — ça s'accorde toujours.
        // ------------------------------------------------------------------
        private static readonly (int Note, double Dur, double Gap, bool Trill)[] Phrase =
        {
            (0, 0.20, 0.07, false), (2, 0.20, 0.07, false), (4, 0.30, 0.09, false),
            (3, 0.00, 0.08, true),  (2, 0.18, 0.06, false), (1, 0.18, 0.06, false),
            (0, 0.34, 0.10, false),
        };

        private static string FileCacheDir => Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "MesPremiersJeux", "sons-cache");

        /// <summary>Le fichier WAV (généré une fois) du chant en boucle de
        /// l'oiseau n° voice, à jouer avec un MediaPlayer.</summary>
        public static string BirdLoopFile(int voice)
        {
            Directory.CreateDirectory(FileCacheDir);
            var path = Path.Combine(FileCacheDir, "oiseau-" + voice + "-v1.wav");
            if (!File.Exists(path)) File.WriteAllBytes(path, ToWav(CanonPhrase(voice)));
            return path;
        }

        private static float[] CanonPhrase(int voice)
        {
            double reg = Registers[voice % Registers.Length];
            var buf = new List<float>();
            foreach (var step in Phrase)
            {
                if (step.Trill)
                    for (int r = 0; r < 8; r++)
                        AddNote(buf, Scale[r % 2 == 0 ? step.Note : step.Note + 1] * reg, 0.05, 0.30);
                else
                    AddNote(buf, Scale[step.Note] * reg, step.Dur, 0.30);
                AddGap(buf, step.Gap);
            }
            AddGap(buf, 0.55); // la respiration avant la reprise de la boucle
            return buf.ToArray();
        }

        /// <summary>Le GRAND CONCERT : les six chants mélangés (mixés dans un
        /// même tampon), décalés en canon — une vraie harmonie.</summary>
        public static void BirdChorus()
        {
            Play("chorus3", () =>
            {
                var parts = new float[6][];
                var offs = new int[6];
                int total = 0;
                for (int v = 0; v < 6; v++)
                {
                    parts[v] = Motif(v);
                    offs[v] = (int)(Rate * 0.42 * v);
                    total = Math.Max(total, offs[v] + parts[v].Length);
                }
                var mix = new float[total];
                for (int v = 0; v < 6; v++)
                    for (int i = 0; i < parts[v].Length; i++)
                        mix[offs[v] + i] += parts[v][i];
                float peak = 0.001f;
                foreach (var s in mix) peak = Math.Max(peak, Math.Abs(s));
                float gain = 0.85f / peak;
                for (int i = 0; i < mix.Length; i++) mix[i] *= gain;
                return mix;
            });
        }

        // La mélodie d'un oiseau : notes tenues (avec vibrato), trilles rapides
        // et glissandos, le tout sur la gamme commune, dans sa tessiture.
        private static float[] Motif(int voice)
        {
            var rng = new Random(voice * 101 + 7);
            double reg = Registers[voice % Registers.Length];
            var buf = new List<float>();
            int events = 6 + rng.Next(3);
            int prev = rng.Next(Scale.Length);
            for (int e = 0; e < events; e++)
            {
                int ni = Math.Max(0, Math.Min(Scale.Length - 1, prev + rng.Next(-2, 3)));
                double f = Scale[ni] * reg;
                switch (rng.Next(3))
                {
                    case 0: // note tenue, vibrato
                        AddNote(buf, f, 0.1 + rng.NextDouble() * 0.08, 0.4);
                        break;
                    case 1: // trille (alternance très rapide de deux notes voisines)
                        double f2 = Scale[Math.Min(Scale.Length - 1, ni + 1)] * reg;
                        int reps = 6 + rng.Next(4);
                        for (int r = 0; r < reps; r++)
                            AddNote(buf, r % 2 == 0 ? f : f2, 0.045, 0.36);
                        break;
                    default: // glissando vers la note suivante
                        double f3 = Scale[Math.Max(0, ni - 1)] * reg;
                        AddGlide(buf, rng.Next(2) == 0 ? f : f3, rng.Next(2) == 0 ? f3 : f, 0.12, 0.38);
                        break;
                }
                AddGap(buf, 0.03 + rng.NextDouble() * 0.09);
                prev = ni;
            }
            return buf.ToArray();
        }

        // Note flûtée : fondamentale + harmoniques légères + vibrato — un timbre
        // de sifflet d'oiseau, bien plus naturel qu'une sinusoïde nue.
        private static void AddNote(List<float> buf, double f, double dur, double vol)
        {
            int n = (int)(Rate * dur);
            double phase = 0;
            for (int i = 0; i < n; i++)
            {
                double t = i / (double)n;
                double vib = 1 + 0.012 * Math.Sin(2 * Math.PI * 6.0 * i / Rate);
                phase += 2 * Math.PI * f * vib / Rate;
                // Timbre flûté DOUX : harmoniques discrètes (les aigus criards
                // sont la première cause de « sons pas top »).
                double w = Math.Sin(phase) + 0.22 * Math.Sin(2 * phase) + 0.05 * Math.Sin(3 * phase);
                double env = Math.Pow(Math.Sin(Math.PI * t), 0.95);
                buf.Add((float)(w * env * vol / 1.3));
            }
        }

        private static void AddGlide(List<float> buf, double f0, double f1, double dur, double vol)
        {
            int n = (int)(Rate * dur);
            double phase = 0;
            for (int i = 0; i < n; i++)
            {
                double t = i / (double)n;
                double f = f0 + (f1 - f0) * t;
                phase += 2 * Math.PI * f / Rate;
                double w = Math.Sin(phase) + 0.3 * Math.Sin(2 * phase);
                double env = Math.Pow(Math.Sin(Math.PI * t), 0.8);
                buf.Add((float)(w * env * vol / 1.3));
            }
        }

        private static void AddGap(List<float> buf, double dur)
        {
            int n = (int)(Rate * dur);
            for (int i = 0; i < n; i++) buf.Add(0f);
        }

        /// <summary>Sifflement montant de la fusée (avant l'explosion).</summary>
        public static void Whistle()
            => Play("whistle", () => Glide(500, 1400, 0.55, 0.16));

        /// <summary>Boum sourd et rond du feu d'artifice.</summary>
        public static void Boom()
        {
            Play("boom", () =>
            {
                var rng = new Random(42);
                int n = (int)(Rate * 0.8);
                var s = new float[n];
                double lp = 0;
                for (int i = 0; i < n; i++)
                {
                    double t = i / (double)n;
                    double noise = rng.NextDouble() * 2 - 1;
                    lp += 0.045 * (noise - lp);       // passe-bas : grondement
                    double thump = Math.Sin(2 * Math.PI * 65 * (i / (double)Rate)) * Math.Exp(-6 * t);
                    s[i] = (float)((lp * 1.6 + thump * 0.8) * Math.Exp(-3.2 * t) * 0.8);
                }
                return s;
            });
        }

        /// <summary>SPLAT de la tarte à la crème (impact mou + éclaboussure).</summary>
        public static void Splat()
        {
            Play("splat", () =>
            {
                var rng = new Random(7);
                int n = (int)(Rate * 0.35);
                var s = new float[n];
                double lp = 0;
                for (int i = 0; i < n; i++)
                {
                    double t = i / (double)n;
                    double noise = rng.NextDouble() * 2 - 1;
                    lp += 0.18 * (noise - lp);
                    double thud = Math.Sin(2 * Math.PI * 110 * (i / (double)Rate)) * Math.Exp(-14 * t);
                    s[i] = (float)((lp * 1.2 + thud) * Math.Exp(-7 * t) * 0.85);
                }
                return s;
            });
        }

        /// <summary>Petit « pof » doux de la buée qui s'efface.</summary>
        public static void Puff()
        {
            Play("puff", () =>
            {
                var rng = new Random(3);
                int n = (int)(Rate * 0.18);
                var s = new float[n];
                double lp = 0;
                for (int i = 0; i < n; i++)
                {
                    double t = i / (double)n;
                    double noise = rng.NextDouble() * 2 - 1;
                    lp += 0.3 * (noise - lp);
                    s[i] = (float)(lp * Math.Sin(Math.PI * t) * 0.5);
                }
                return s;
            });
        }

        /// <summary>Petit « pop » joyeux (apparition, rebond).</summary>
        public static void PopSound()
            => Play("pop", () => Glide(420, 180, 0.1, 0.5));

        // ------------------------------------------------------------------
        //  Fabrique d'ondes
        // ------------------------------------------------------------------

        // Note sifflée : fréquence glissant de f0 à f1, enveloppe en cloche.
        private static float[] Glide(double f0, double f1, double dur, double vol)
        {
            int n = (int)(Rate * dur);
            var s = new float[n];
            double phase = 0;
            for (int i = 0; i < n; i++)
            {
                double t = i / (double)n;
                double f = f0 + (f1 - f0) * t;
                phase += 2 * Math.PI * f / Rate;
                double env = Math.Pow(Math.Sin(Math.PI * t), 0.7);
                s[i] = (float)(Math.Sin(phase) * env * vol);
            }
            return s;
        }

        private static float[] Silence(double dur) => new float[(int)(Rate * dur)];

        private static float[] Concat(List<float[]> parts)
        {
            int total = 0;
            foreach (var p in parts) total += p.Length;
            var res = new float[total];
            int off = 0;
            foreach (var p in parts) { Array.Copy(p, 0, res, off, p.Length); off += p.Length; }
            return res;
        }

        // ------------------------------------------------------------------
        //  WAV en mémoire + lecture
        // ------------------------------------------------------------------
        private static void Play(string key, Func<float[]> make)
        {
            try
            {
                if (!Cache.TryGetValue(key, out var wav))
                {
                    wav = ToWav(make());
                    Cache[key] = wav;
                }
                _stream = new MemoryStream(wav);
                _player = new SoundPlayer(_stream);
                _player.Play();
            }
            catch { }
        }

        private static byte[] ToWav(float[] samples)
        {
            using (var ms = new MemoryStream())
            using (var w = new BinaryWriter(ms))
            {
                int dataLen = samples.Length * 2;
                w.Write(new[] { 'R', 'I', 'F', 'F' });
                w.Write(36 + dataLen);
                w.Write(new[] { 'W', 'A', 'V', 'E', 'f', 'm', 't', ' ' });
                w.Write(16);
                w.Write((short)1);          // PCM
                w.Write((short)1);          // mono
                w.Write(Rate);
                w.Write(Rate * 2);          // octets/s
                w.Write((short)2);          // alignement
                w.Write((short)16);         // bits
                w.Write(new[] { 'd', 'a', 't', 'a' });
                w.Write(dataLen);
                foreach (var f in samples)
                {
                    var v = Math.Max(-1f, Math.Min(1f, f));
                    w.Write((short)(v * short.MaxValue * 0.9));
                }
                return ms.ToArray();
            }
        }
    }
}
