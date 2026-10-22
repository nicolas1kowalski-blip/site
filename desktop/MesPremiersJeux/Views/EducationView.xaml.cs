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
    /// Onglet Éducatif (maternelle PS/MS) : menu plein écran d'activités —
    /// lettres, nombres, grand/petit, suites logiques, imagier — chacune jouable
    /// au regard, avec confettis de félicitation.
    /// </summary>
    public partial class EducationView : UserControl
    {
        private sealed class Theme
        {
            public string Icon, Name;
            public Color Tint;
            public (string Icon, string Label, string Level, Func<Action, UserControl> Make)[] Activities;
        }

        // Les activités sont rangées par THÈMES (comme le menu Jeux) : jamais
        // plus d'une poignée de tuiles par écran, donc jamais de défilement.
        private readonly Theme[] _themes =
        {
            new Theme
            {
                Icon = "✍️", Name = "Lettres et écriture", Tint = Color.FromRgb(0xFF, 0xE9, 0xF2),
                Activities = new (string, string, string, Func<Action, UserControl>)[]
                {
                    ("💖", "Mon prénom", "PS · MS", c => new NameGame(c)),
                    ("🔤", "Les lettres", "PS · MS", c => new LettersGame(c)),
                    ("📖", "L'abécédaire", "PS · MS", c => new AlphabetBookGame(c)),
                    ("🥁", "Les syllabes", "MS", c => new SyllableGame(c)),
                    ("🏠", "La maison des sons", "MS", c => new SoundHouseGame(c)),
                    ("✍️", "J'écris !", "MS", c => new EyeWriteGame(c)),
                    ("💖", "Mon prénom écrit", "GS", c => new ReadingGame(c, 1)),
                    ("🖼️", "Le mot et l'image", "GS · CP", c => new ReadingGame(c, 2)),
                    ("🔡", "Les lettres mobiles", "GS · CP", c => new ReadingGame(c, 3)),
                    ("👂", "Le son de la fin", "GS", c => new ReadingGame(c, 4)),
                },
            },
            new Theme
            {
                Icon = "🔢", Name = "Les nombres", Tint = Color.FromRgb(0xE8, 0xF0, 0xFF),
                Activities = new (string, string, string, Func<Action, UserControl>)[]
                {
                    ("🎈", "Fête des nombres", "PS · MS", c => new NumberPartyGame(c)),
                    ("🔢", "Les nombres", "PS · MS", c => new NumbersGame(c)),
                    ("🧺", "Le panier", "MS", c => new CompleteGame(c)),
                    ("🎲", "Le nombre dans tous ses états", "MS", c => new NumberFormsGame(c)),
                    ("🧩", "Reproduis le modèle", "MS", c => new ModelCopyGame(c)),
                    ("➕", "Un de plus, un de moins", "GS · CP", c => new MathGame(c, 1)),
                    ("🍰", "Partager en deux", "GS · CP", c => new MathGame(c, 2)),
                    ("🔢", "La bande numérique", "GS · CP", c => new MathGame(c, 3)),
                },
            },
            new Theme
            {
                Icon = "🌱", Name = "Découvrir", Tint = Color.FromRgb(0xEA, 0xF8, 0xEE),
                Activities = new (string, string, string, Func<Action, UserControl>)[]
                {
                    ("🎨", "Couleurs magiques", "PS · MS", c => new ColorMagicGame(c)),
                    ("📏", "Grand ou petit", "PS", c => new SizeGame(c)),
                    ("🟡", "Les suites", "MS", c => new PatternGame(c)),
                    ("📿", "Le collier de perles", "MS", c => new NecklaceGame(c)),
                    ("🖼️", "L'imagier", "PS · MS", c => new VocabGame(c)),
                    ("🧒", "Le corps", "PS · MS", c => new BodyGame(c)),
                    ("😊", "Les émotions", "PS · MS", c => new EmotionsGame(c)),
                    ("🏠", "Range la maison", "PS · MS", c => new TidyHouseGame(c)),
                },
            },
            new Theme
            {
                Icon = "🎵", Name = "La musique", Tint = Color.FromRgb(0xFF, 0xF3, 0xD6),
                Activities = new (string, string, string, Func<Action, UserControl>)[]
                {
                    ("🥁", "Le petit orchestre", "PS · MS", c => new MusicSchoolGame(c, 1)),
                    ("🎹", "Le xylophone et la chanson", "PS · MS", c => new MusicSchoolGame(c, 3)),
                    ("🎸", "Je joue d'un instrument", "PS · MS", c => new MusicSchoolGame(c, 5)),
                    ("🐦", "Les oiseaux chanteurs", "PS", c => new BirdSongGame(c)),
                },
            },
            new Theme
            {
                Icon = "🇬🇧", Name = "L'anglais", Tint = Color.FromRgb(0xDD, 0xEE, 0xFF),
                Activities = new (string, string, string, Func<Action, UserControl>)[]
                {
                    ("👋", "Hello ! Les petits mots", "PS · MS", c => new EnglishGame(c, 1)),
                    ("🐾", "The animals", "PS · MS", c => new EnglishGame(c, 2)),
                    ("🎨", "Colours and numbers", "MS", c => new EnglishGame(c, 4)),
                },
            },
            new Theme
            {
                Icon = "🚀", Name = "Le monde et l'espace", Tint = Color.FromRgb(0xF1, 0xE6, 0xFF),
                Activities = new (string, string, string, Func<Action, UserControl>)[]
                {
                    ("🌍", "Le tour du monde", "MS", c => new CapitalsGame(c)),
                    ("🧳", "La valise du voyageur", "PS · MS", c => new SuitcaseGame(c)),
                    ("🍽️", "Les bons plats", "PS · MS", c => new FoodGame(c)),
                    ("🪐", "Les planètes", "PS · MS", c => new PlanetsGame(c)),
                    ("🌙", "Jour et nuit", "PS · MS", c => new DayNightGame(c)),
                },
            },
        };

        private readonly Random _rng = new Random();

        public EducationView()
        {
            InitializeComponent();

            // Décor de fond avec profondeur (ciel, nuages, collines), derrière tout.
            if (Content is Grid rootGrid) rootGrid.Children.Insert(0, DecorBackground.ForEducation());

            foreach (var t in _themes)
            {
                var theme = t;
                var tile = MenuKit.ThemeTile(t.Icon, t.Name, t.Tint,
                    string.Join("  ", Array.ConvertAll(t.Activities, a => a.Icon)));
                tile.Click += (s, e) => OpenTheme(theme);
                Cats.Children.Add(tile);
            }
        }

        private void OpenTheme(Theme t)
        {
            CatTitle.Text = t.Icon + "  " + t.Name;
            Menu.Columns = t.Activities.Length <= 4 ? 2 : 3;
            Menu.Children.Clear();
            foreach (var a in t.Activities)
            {
                var tile = MenuKit.GameTile(a.Icon, a.Label, a.Level);
                var make = a.Make;
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
                MesPremiersJeux.Lib.Chrome.Immersive = true; // plein écran pour l'activité
            }
            catch (Exception ex)
            {
                MessageBox.Show("Impossible d'ouvrir cette activité :\n" + ex.Message, "Eyzi");
            }
        }

        private void Back_Click(object sender, RoutedEventArgs e)
        {
            GameHost.Children.Clear();
            PlayRoot.Visibility = Visibility.Collapsed;
            ListRoot.Visibility = Visibility.Visible; // retour aux activités du thème
            MesPremiersJeux.Lib.Chrome.Immersive = false;
        }

        // --- Confettis (fontaine douce, comme dans les jeux) ---
        // --- Célébration : une animation différente à chaque fois (CelebrationKit) ---
        private void ShowConfetti() => CelebrationKit.Play(Confetti);
    }
}
