using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Shapes;
using MesPremiersJeux.Lib;

namespace MesPremiersJeux.Views
{
    /// <summary>
    /// Éditeur de zones interactives (comme sur le web) : on dessine un rectangle
    /// à la souris sur la photo, on lui donne un nom (« le chat », « la maison »…),
    /// et pendant la lecture la zone s'illumine quand l'enfant lit ce mot.
    /// </summary>
    public sealed class ZoneEditorWindow : Window
    {
        public List<UserZone> Zones { get; }

        private readonly Canvas _overlay;
        private readonly double _imgW, _imgH;
        private readonly TextBox _label;
        private readonly StackPanel _zoneList;

        private Point _dragStart;
        private Rectangle _dragRect;

        public ZoneEditorWindow(string imagePath, IEnumerable<UserZone> zones)
        {
            Zones = zones?.Select(z => new UserZone
            {
                Left = z.Left, Top = z.Top, Width = z.Width, Height = z.Height, Label = z.Label,
            }).ToList() ?? new List<UserZone>();

            Gaze.GazeGate.Push();
            Closed += (s, e) => Gaze.GazeGate.Pop();

            Title = "Zones interactives";
            Width = 1060;
            Height = 720;
            WindowStartupLocation = WindowStartupLocation.CenterOwner;
            Background = new SolidColorBrush(Color.FromRgb(0xFB, 0xF3, 0xFF));

            var img = UserContent.LoadBitmap(imagePath);
            // Ajuste l'image dans ~780x560 en conservant les proportions.
            double k = Math.Min(780.0 / img.PixelWidth, 560.0 / img.PixelHeight);
            _imgW = img.PixelWidth * k;
            _imgH = img.PixelHeight * k;

            var root = new DockPanel { Margin = new Thickness(14) };

            // Bandeau : nom de la zone + aide.
            var top = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 0, 0, 10) };
            top.Children.Add(new TextBlock
            {
                Text = "Nom de la prochaine zone : ",
                FontSize = 17,
                VerticalAlignment = VerticalAlignment.Center,
            });
            _label = new TextBox { FontSize = 17, Width = 260, Padding = new Thickness(6, 4, 6, 4) };
            top.Children.Add(_label);
            top.Children.Add(new TextBlock
            {
                Text = "   puis dessine un rectangle sur la photo (cliquer-glisser)",
                FontSize = 14,
                Foreground = Brushes.Gray,
                VerticalAlignment = VerticalAlignment.Center,
            });
            DockPanel.SetDock(top, Dock.Top);
            root.Children.Add(top);

            // Boutons bas.
            var buttons = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                HorizontalAlignment = HorizontalAlignment.Right,
                Margin = new Thickness(0, 10, 0, 0),
            };
            var ok = new Button { Content = "✔ Valider", FontSize = 17, Padding = new Thickness(16, 10, 16, 10) };
            ok.Click += (s, e) => DialogResult = true;
            var cancel = new Button { Content = "Annuler", FontSize = 17, Padding = new Thickness(16, 10, 16, 10), Margin = new Thickness(8, 0, 0, 0) };
            cancel.Click += (s, e) => DialogResult = false;
            buttons.Children.Add(ok);
            buttons.Children.Add(cancel);
            DockPanel.SetDock(buttons, Dock.Bottom);
            root.Children.Add(buttons);

            // Liste des zones (droite).
            _zoneList = new StackPanel { Width = 220, Margin = new Thickness(12, 0, 0, 0) };
            var listScroll = new ScrollViewer { Content = _zoneList, VerticalScrollBarVisibility = ScrollBarVisibility.Auto };
            DockPanel.SetDock(listScroll, Dock.Right);
            root.Children.Add(listScroll);

            // Photo + calque de dessin.
            var host = new Grid { Width = _imgW, Height = _imgH, HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center };
            host.Children.Add(new Image { Source = img, Stretch = Stretch.Fill, Width = _imgW, Height = _imgH });
            _overlay = new Canvas { Background = Brushes.Transparent, Width = _imgW, Height = _imgH };
            _overlay.MouseLeftButtonDown += StartDrag;
            _overlay.MouseMove += Drag;
            _overlay.MouseLeftButtonUp += EndDrag;
            host.Children.Add(_overlay);
            root.Children.Add(new Border
            {
                Child = host,
                Background = Brushes.White,
                BorderBrush = Brushes.LightGray,
                BorderThickness = new Thickness(1),
            });

            Content = root;
            Redraw();
        }

        // --- Dessin d'une zone au cliquer-glisser ---
        private void StartDrag(object sender, MouseButtonEventArgs e)
        {
            _dragStart = e.GetPosition(_overlay);
            _dragRect = new Rectangle
            {
                Stroke = new SolidColorBrush(Color.FromRgb(0x7E, 0x3F, 0xF2)),
                StrokeThickness = 3,
                Fill = new SolidColorBrush(Color.FromArgb(0x33, 0x7E, 0x3F, 0xF2)),
            };
            Canvas.SetLeft(_dragRect, _dragStart.X);
            Canvas.SetTop(_dragRect, _dragStart.Y);
            _overlay.Children.Add(_dragRect);
            _overlay.CaptureMouse();
        }

        private void Drag(object sender, MouseEventArgs e)
        {
            if (_dragRect == null) return;
            var p = e.GetPosition(_overlay);
            Canvas.SetLeft(_dragRect, Math.Min(p.X, _dragStart.X));
            Canvas.SetTop(_dragRect, Math.Min(p.Y, _dragStart.Y));
            _dragRect.Width = Math.Abs(p.X - _dragStart.X);
            _dragRect.Height = Math.Abs(p.Y - _dragStart.Y);
        }

        private void EndDrag(object sender, MouseButtonEventArgs e)
        {
            _overlay.ReleaseMouseCapture();
            if (_dragRect == null) return;
            var rect = _dragRect;
            _dragRect = null;

            double w = rect.Width, h = rect.Height;
            _overlay.Children.Remove(rect);
            if (w < 12 || h < 12) return; // trop petit : ignoré

            var label = _label.Text.Trim();
            if (label.Length == 0)
            {
                MessageBox.Show(this, "Écris d'abord le nom de la zone (ex. « le chat »), puis dessine le rectangle.", "Zones");
                return;
            }

            Zones.Add(new UserZone
            {
                Left = Canvas.GetLeft(rect) / _imgW * 100,
                Top = Canvas.GetTop(rect) / _imgH * 100,
                Width = w / _imgW * 100,
                Height = h / _imgH * 100,
                Label = label,
            });
            _label.Text = "";
            Redraw();
        }

        // --- Affichage des zones + liste avec suppression ---
        private void Redraw()
        {
            _overlay.Children.Clear();
            _zoneList.Children.Clear();

            foreach (var z in Zones)
            {
                var r = new Border
                {
                    Width = z.Width / 100 * _imgW,
                    Height = z.Height / 100 * _imgH,
                    BorderBrush = new SolidColorBrush(Color.FromRgb(0x7E, 0x3F, 0xF2)),
                    BorderThickness = new Thickness(3),
                    Background = new SolidColorBrush(Color.FromArgb(0x22, 0x7E, 0x3F, 0xF2)),
                    CornerRadius = new CornerRadius(6),
                    Child = new TextBlock
                    {
                        Text = z.Label,
                        FontSize = 14,
                        FontWeight = FontWeights.Bold,
                        Foreground = new SolidColorBrush(Color.FromRgb(0x7E, 0x3F, 0xF2)),
                        Margin = new Thickness(4, 2, 4, 2),
                    },
                };
                Canvas.SetLeft(r, z.Left / 100 * _imgW);
                Canvas.SetTop(r, z.Top / 100 * _imgH);
                _overlay.Children.Add(r);

                var row = new DockPanel { Margin = new Thickness(0, 0, 0, 6) };
                var del = new Button { Content = "🗑", Padding = new Thickness(8, 4, 8, 4) };
                var zz = z;
                del.Click += (s, e) => { Zones.Remove(zz); Redraw(); };
                DockPanel.SetDock(del, Dock.Right);
                row.Children.Add(del);
                row.Children.Add(new TextBlock
                {
                    Text = "🎯 " + z.Label,
                    FontSize = 15,
                    VerticalAlignment = VerticalAlignment.Center,
                    TextTrimming = TextTrimming.CharacterEllipsis,
                });
                _zoneList.Children.Add(row);
            }
        }
    }
}
