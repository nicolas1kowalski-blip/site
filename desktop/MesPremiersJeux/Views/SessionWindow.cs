using System;
using System.IO;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using MesPremiersJeux.Lib;

namespace MesPremiersJeux.Views
{
    /// <summary>
    /// « Bilan de la session » : carte de chaleur du regard (où l'enfant a regardé,
    /// du bleu au rouge), durée, temps de regard actif, sélections et étoiles.
    /// Peut être enregistré en image (Contenu\Bilans) pour les thérapeutes.
    /// </summary>
    public sealed class SessionWindow : Window
    {
        private readonly Grid _report;

        public SessionWindow()
        {
            Gaze.GazeGate.Push();
            Closed += (s, e) => Gaze.GazeGate.Pop();

            Title = "Bilan de la session";
            Width = 900;
            Height = 680;
            WindowStartupLocation = WindowStartupLocation.CenterOwner;
            Background = new SolidColorBrush(Color.FromRgb(0xFB, 0xF3, 0xFF));

            var dock = new DockPanel { Margin = new Thickness(18) };

            // Boutons bas.
            var buttons = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                HorizontalAlignment = HorizontalAlignment.Right,
                Margin = new Thickness(0, 12, 0, 0),
            };
            var save = Btn("💾 Enregistrer l'image");
            save.Click += Save_Click;
            var reset = Btn("🔄 Remettre à zéro");
            reset.Click += (s, e) => { SessionLog.Reset(); Close(); };
            var close = Btn("Fermer");
            close.Click += (s, e) => Close();
            buttons.Children.Add(save);
            buttons.Children.Add(reset);
            buttons.Children.Add(close);
            DockPanel.SetDock(buttons, Dock.Bottom);
            dock.Children.Add(buttons);

            // Rapport (statistiques + carte de chaleur) — c'est lui qu'on exporte.
            _report = new Grid { Background = Brushes.White };
            _report.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
            _report.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });

            var d = SessionLog.Duration;
            var stats = new TextBlock
            {
                FontSize = 17,
                Foreground = new SolidColorBrush(Color.FromRgb(0x3B, 0x2A, 0x5A)),
                TextAlignment = TextAlignment.Center,
                Margin = new Thickness(10, 14, 10, 10),
                Text = $"📊 Session du {SessionLog.Started:dd/MM/yyyy HH:mm}\n" +
                       $"Durée : {(int)d.TotalMinutes} min {d.Seconds:00} s   ·   " +
                       $"Regard actif : {SessionLog.ActiveMinutes:0.0} min   ·   " +
                       $"Sélections : {SessionLog.Clicks}   ·   ⭐ gagnées : {SessionLog.StarsGained}",
            };
            Grid.SetRow(stats, 0);
            _report.Children.Add(stats);

            // Carte de chaleur, dans un cadre au format écran.
            var heatImage = new Image
            {
                Source = BuildHeatmap(),
                Stretch = Stretch.Fill,
            };
            RenderOptions.SetBitmapScalingMode(heatImage, BitmapScalingMode.Fant);
            var frame = new Border
            {
                Background = new SolidColorBrush(Color.FromRgb(0x2E, 0x25, 0x4C)),
                CornerRadius = new CornerRadius(14),
                Margin = new Thickness(24, 4, 24, 18),
                Padding = new Thickness(6),
                Child = heatImage,
            };
            Grid.SetRow(frame, 1);
            _report.Children.Add(frame);

            dock.Children.Add(new Border
            {
                Child = _report,
                CornerRadius = new CornerRadius(12),
                Background = Brushes.White,
                Effect = new System.Windows.Media.Effects.DropShadowEffect { BlurRadius = 14, ShadowDepth = 2, Opacity = 0.15 },
            });

            Content = dock;
        }

        private static Button Btn(string label) => new Button
        {
            Content = label,
            FontSize = 16,
            Padding = new Thickness(16, 10, 16, 10),
            Margin = new Thickness(8, 0, 0, 0),
        };

        // Grille de chaleur → image (transparent → bleu → vert → jaune → rouge).
        private static BitmapSource BuildHeatmap()
        {
            var heat = SessionLog.Snapshot();
            int gw = SessionLog.GW, gh = SessionLog.GH;
            double max = 0;
            foreach (var v in heat) if (v > max) max = v;

            var px = new byte[gw * gh * 4];
            for (int y = 0; y < gh; y++)
                for (int x = 0; x < gw; x++)
                {
                    double v = max <= 0 ? 0 : heat[x, y] / max;
                    var (r, g, b, a) = HeatColor(v);
                    int i = (y * gw + x) * 4;
                    px[i] = b; px[i + 1] = g; px[i + 2] = r; px[i + 3] = a;
                }

            var bmp = BitmapSource.Create(gw, gh, 96, 96, PixelFormats.Bgra32, null, px, gw * 4);
            bmp.Freeze();
            return bmp;
        }

        private static (byte r, byte g, byte b, byte a) HeatColor(double v)
        {
            if (v <= 0.02) return (0, 0, 0, 0);
            // bleu (froid) → vert → jaune → rouge (chaud)
            byte a = (byte)(90 + 165 * Math.Min(1, v * 1.6));
            if (v < 0.33) { double k = v / 0.33; return ((byte)(0), (byte)(160 * k + 60), (byte)(220), a); }
            if (v < 0.66) { double k = (v - 0.33) / 0.33; return ((byte)(240 * k), (byte)(220), (byte)(220 * (1 - k)), a); }
            double k2 = (v - 0.66) / 0.34;
            return ((byte)(240), (byte)(220 * (1 - k2)), (byte)0, a);
        }

        private void Save_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                var rtb = new RenderTargetBitmap(
                    (int)Math.Max(600, _report.ActualWidth), (int)Math.Max(400, _report.ActualHeight),
                    96, 96, PixelFormats.Pbgra32);
                rtb.Render(_report);
                var enc = new PngBitmapEncoder();
                enc.Frames.Add(BitmapFrame.Create(rtb));

                var dir = Path.Combine(UserContent.RootDir, "Bilans");
                Directory.CreateDirectory(dir);
                var file = Path.Combine(dir, $"bilan-{DateTime.Now:yyyyMMdd-HHmm}.png");
                using (var fs = File.Create(file)) enc.Save(fs);
                MessageBox.Show(this, "Bilan enregistré :\n" + file, "Bilan de la session");
            }
            catch (Exception ex)
            {
                MessageBox.Show(this, "Impossible d'enregistrer : " + ex.Message, "Bilan de la session");
            }
        }
    }
}
