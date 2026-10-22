using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Shapes;
using MesPremiersJeux.Games;

namespace MesPremiersJeux.Views
{
    /// <summary>
    /// Onglet Jeux : un menu plein écran de grandes tuiles (sans défilement, tout
    /// mis à l'échelle par un Viewbox). On choisit un jeu, il occupe toute la page,
    /// et un bouton « Menu » ramène au choix. Confettis pour féliciter.
    /// </summary>
    public partial class GamesView : UserControl
    {
        private sealed class Theme
        {
            public string Icon, Name;
            public Color Tint;
            public (string Icon, string Label, Func<Action, UserControl> Make)[] Games;
        }

        // Les jeux sont rangés par THÈMES : un premier écran de grandes tuiles,
        // puis les jeux du thème — jamais plus d'une poignée par écran, donc
        // jamais de défilement ni de chevauchement.
        private readonly Theme[] _themes =
        {
            new Theme
            {
                Icon = "✨", Name = "Magie du regard", Tint = Color.FromRgb(0xF1, 0xE6, 0xFF),
                Games = new (string, string, Func<Action, UserControl>)[]
                {
                    ("🐦", "Oiseaux chanteurs", c => new BirdSongGame(c)),
                    ("🎆", "Feux d'artifice", c => new FireworksGame(c)),
                    ("🧽", "Fenêtre magique", c => new MagicWindowGame(c)),
                    ("🥧", "Tartes à la crème", c => new PieFaceGame(c)),
                    ("✨", "Bulles magiques", c => new MagicGame(c)),
                    ("🎈", "Ballons 3D", c => new BalloonsGame(c)),
                },
            },
            new Theme
            {
                Icon = "🔍", Name = "Observation", Tint = Color.FromRgb(0xE3, 0xF2, 0xFF),
                Games = new (string, string, Func<Action, UserControl>)[]
                {
                    ("🌑", "Les ombres", c => new ShadowGame(c)),
                    ("🔍", "Cherche et trouve", c => new SeekFindGame(c)),
                    ("🧩", "Puzzle", c => new PuzzleGame(c)),
                    ("🗂️", "Les familles", c => new FamiliesGame(c)),
                    ("🃏", "Les paires", c => new MemoryGame(c)),
                    ("👧👨", "Les paires à deux", c => new MemoryGame(c, duo: true)),
                },
            },
            new Theme
            {
                Icon = "🧠", Name = "Petits malins", Tint = Color.FromRgb(0xE8, 0xF8, 0xE8),
                Games = new (string, string, Func<Action, UserControl>)[]
                {
                    ("🌈", "Couleurs", c => new ColorsGame(c)),
                    ("🔺", "Formes", c => new ShapesGame(c)),
                    ("🔢", "Compter", c => new CountGame(c)),
                    ("🧶", "Les ficelles", c => new StringsGame(c)),
                    ("🥤", "Les gobelets", c => new CupsGame(c)),
                },
            },
            new Theme
            {
                Icon = "🎲", Name = "Jeux de société", Tint = Color.FromRgb(0xFF, 0xF2, 0xDC),
                Games = new (string, string, Func<Action, UserControl>)[]
                {
                    ("🪿", "Le jeu de l'oie", c => new GooseGame(c)),
                    ("🐴", "Petits chevaux", c => new HorseGame(c)),
                    ("❌", "Morpion", c => new TicTacToeGame(c)),
                    ("🔴", "Puissance 4", c => new ConnectFourGame(c)),
                },
            },
        };

        private readonly Random _rng = new Random();

        public GamesView()
        {
            InitializeComponent();

            // Décor de fond avec profondeur (ciel, nuages, collines), derrière tout.
            if (Content is Grid rootGrid) rootGrid.Children.Insert(0, DecorBackground.ForGames());

            foreach (var t in _themes)
            {
                var theme = t;
                var tile = MenuKit.ThemeTile(t.Icon, t.Name, t.Tint,
                    string.Join("  ", Array.ConvertAll(t.Games, g => g.Icon)));
                tile.Click += (s, e) => OpenTheme(theme);
                Cats.Children.Add(tile);
            }
        }

        private void OpenTheme(Theme t)
        {
            CatTitle.Text = t.Icon + "  " + t.Name;
            Menu.Columns = t.Games.Length <= 4 ? 2 : 3;
            Menu.Children.Clear();
            foreach (var g in t.Games)
            {
                var tile = MenuKit.GameTile(g.Icon, g.Label);
                var make = g.Make;
                tile.Click += (s, e) => Play(make);
                Menu.Children.Add(tile);
            }
            MenuRoot.Visibility = Visibility.Collapsed;
            ListRoot.Visibility = Visibility.Visible;
            MesPremiersJeux.Lib.Speech.Say(t.Name + " !");
        }

        private void Themes_Click(object sender, RoutedEventArgs e)
        {
            ListRoot.Visibility = Visibility.Collapsed;
            MenuRoot.Visibility = Visibility.Visible;
        }

        private void Play(Func<Action, UserControl> make)
        {
            try
            {
                GameHost.Children.Clear();
                GameHost.Children.Add(make(ShowConfetti));
                MenuRoot.Visibility = Visibility.Collapsed;
                ListRoot.Visibility = Visibility.Collapsed;
                PlayRoot.Visibility = Visibility.Visible;
                MesPremiersJeux.Lib.Chrome.Immersive = true; // plein écran pour jouer
            }
            catch (Exception ex)
            {
                MessageBox.Show("Impossible d'ouvrir ce jeu :\n" + ex.Message, "Eyzi");
            }
        }

        private void Back_Click(object sender, RoutedEventArgs e)
        {
            GameHost.Children.Clear(); // arrête le jeu (Unloaded)
            PlayRoot.Visibility = Visibility.Collapsed;
            ListRoot.Visibility = Visibility.Visible; // retour aux jeux du thème
            MesPremiersJeux.Lib.Chrome.Immersive = false;
        }

        // --- Célébration : une animation différente à chaque fois (CelebrationKit) ---
        private void ShowConfetti() => CelebrationKit.Play(Confetti);
    }
}
