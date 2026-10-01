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

        /// <summary>Chant d'oiseau : chaque « voix » (0, 1, 2…) a sa tessiture et
        /// sa petite mélodie propre, toujours la même (l'enfant la reconnaît).</summary>
        public static void BirdChirp(int voice)
        {
            Play("bird" + voice, () =>
            {
                var rng = new Random(voice * 7919 + 13);
                double baseF = 1400 + (voice % 6) * 320;
                int notes = 5 + rng.Next(4);
                var parts = new List<float[]>();
                for (int n = 0; n < notes; n++)
                {
                    double f0 = baseF * (0.8 + rng.NextDouble() * 0.7);
                    double f1 = f0 * (rng.Next(2) == 0 ? 1.4 : 0.72);
                    parts.Add(Glide(f0, f1, 0.06 + rng.NextDouble() * 0.09, 0.42));
                    parts.Add(Silence(0.03 + rng.NextDouble() * 0.06));
                }
                return Concat(parts);
            });
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
