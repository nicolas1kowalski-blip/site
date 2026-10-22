using System;
using System.Collections.Generic;
using System.IO;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Imaging;

namespace MesPremiersJeux.Lib
{
    /// <summary>
    /// Images personnalisées à la place des emojis : si une image nommée existe
    /// dans « Contenu\Images » (ex. oiseau-1.png), les jeux l'affichent ; sinon
    /// ils retombent sur l'emoji — AUCUN risque, l'application marche toujours.
    /// Le parent dépose simplement des PNG (fond transparent de préférence,
    /// par ex. depuis kenney.nl ou générés par IA) avec les bons noms, listés
    /// dans le LISEZ-MOI du dossier.
    /// </summary>
    public static class Art
    {
        private static readonly Dictionary<string, ImageSource> Cache =
            new Dictionary<string, ImageSource>(StringComparer.OrdinalIgnoreCase);
        private static readonly string[] Exts = { ".png", ".jpg", ".jpeg", ".gif" };
        private static bool _ready;

        public static string Dir => Path.Combine(UserContent.RootDir, "Images");

        /// <summary>Images EMBARQUÉES avec l'application (copiées à côté de
        /// l'exécutable à la compilation) : toujours là, sur toutes les
        /// tablettes, sans rien installer.</summary>
        private static string BuiltInDir =>
            Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "Images");

        /// <summary>L'image nommée (sans extension), ou null si absente.
        /// Priorité : image du parent (Contenu\Images) → image embarquée.</summary>
        public static ImageSource Find(string name)
        {
            if (string.IsNullOrEmpty(name)) return null;
            EnsureFolder();
            if (Cache.TryGetValue(name, out var cached)) return cached;

            ImageSource src = null;
            try
            {
                foreach (var folder in new[] { Dir, BuiltInDir })
                {
                    foreach (var ext in Exts)
                    {
                        var path = Path.Combine(folder, name + ext);
                        if (!File.Exists(path)) continue;
                        var bmp = new BitmapImage();
                        bmp.BeginInit();
                        bmp.CacheOption = BitmapCacheOption.OnLoad; // fichier libéré aussitôt
                        bmp.UriSource = new Uri(path, UriKind.Absolute);
                        bmp.EndInit();
                        bmp.Freeze();
                        src = bmp;
                        break;
                    }
                    if (src != null) break;
                }
            }
            catch { src = null; }
            Cache[name] = src; // null aussi : évite de re-sonder le disque
            return src;
        }

        /// <summary>
        /// Le visuel d'un élément de jeu : l'image personnalisée si elle existe
        /// (carré de « size »), sinon l'emoji en repli (taille équivalente).
        /// </summary>
        public static FrameworkElement Visual(string name, string emojiFallback, double size)
        {
            var src = Find(name);
            if (src != null)
            {
                return new Image
                {
                    Source = src,
                    Width = size,
                    Height = size,
                    Stretch = Stretch.Uniform,
                    HorizontalAlignment = HorizontalAlignment.Center,
                    VerticalAlignment = VerticalAlignment.Center,
                };
            }
            return new TextBlock
            {
                Text = emojiFallback,
                FontSize = size * 0.78, // un emoji est ~25 % plus haut que sa FontSize
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
            };
        }

        // ------------------------------------------------------------------
        //  LA BANQUE DE DESSINS : ~115 petites illustrations cartoon embarquées
        //  (chat, banane, tracteur…). ForEmoji remplace un emoji par SON dessin
        //  s'il existe — sinon l'emoji s'affiche comme avant, aucun risque.
        // ------------------------------------------------------------------
        private static readonly Dictionary<string, string> EmojiNames =
            new Dictionary<string, string>
        {
            // Animaux
            { "🦀", "crabe" }, { "🐙", "pieuvre" }, { "🦉", "hibou" }, { "🐌", "escargot" },
            { "🐧", "pingouin" }, { "🐨", "koala" }, { "🐼", "panda" }, { "🐋", "baleine" },
            { "🐳", "baleine" }, { "🦌", "faon" }, { "🦖", "dinosaure" }, { "🦕", "dinosaure" },
            { "🦊", "renard" }, { "🐿", "ecureuil" }, { "🦭", "otarie" }, { "🦓", "zebre" },
            { "🦄", "licorne" }, { "🐉", "dragon" }, { "🐲", "dragon" }, { "🦔", "herisson" },
            { "🦈", "requin" }, { "🐛", "chenille" }, { "🦁", "lion" }, { "🐱", "chat" },
            { "🐈", "chat" }, { "🐶", "chien" }, { "🐕", "chien" }, { "🐻", "ours" },
            { "🧸", "ours-peluche" }, { "🐸", "grenouille" }, { "🦆", "canard" }, { "🦜", "perroquet" },
            { "🐢", "tortue" }, { "🦒", "girafe" }, { "🐰", "lapin" }, { "🐇", "lapin" },
            { "🐟", "poisson" }, { "🐠", "poisson" }, { "🐘", "elephant" }, { "🐵", "singe" },
            { "🐒", "singe" }, { "🦋", "papillon" }, { "🐝", "abeille" },
            // Fruits, légumes, gourmandises
            { "🍓", "fraise" }, { "🍇", "raisin" }, { "🍉", "pasteque" }, { "🍐", "poire" },
            { "🍒", "cerises" }, { "🌽", "mais" }, { "🥦", "brocoli" }, { "🍅", "tomate" },
            { "🧁", "cupcake" }, { "🍩", "donut" }, { "🍕", "pizza" }, { "🍪", "cookie" },
            { "🌰", "gland" }, { "🍍", "ananas" }, { "🍎", "pomme" }, { "🍌", "banane" },
            { "🥕", "carotte" }, { "🎂", "gateau" }, { "🍦", "glace" }, { "🍨", "glace" },
            // Nature
            { "🍃", "feuille" }, { "🍂", "feuille" }, { "🐚", "coquillage" }, { "🌈", "arc-en-ciel" },
            { "🌙", "lune" }, { "❄", "flocon" }, { "🌻", "tournesol" }, { "🌵", "cactus" },
            { "☀", "soleil" }, { "🌞", "soleil" }, { "🌸", "fleur" }, { "🌼", "fleur" },
            { "🌺", "fleur" }, { "🌳", "arbre" }, { "🌲", "arbre" }, { "🌠", "etoile-filante" },
            // Objets
            { "🔨", "marteau" }, { "🖌", "pinceau" }, { "🎨", "palette" }, { "🎒", "sac" },
            { "✏", "crayon" }, { "🔭", "telescope" }, { "🏀", "ballon-basket" }, { "🔍", "loupe" },
            { "🪁", "cerf-volant" }, { "🔑", "cle" }, { "🗝", "cle" }, { "🪞", "miroir" },
            { "📷", "appareil-photo" }, { "👑", "couronne" }, { "📱", "telephone" },
            { "🧦", "chaussette" }, { "👟", "chaussure" }, { "🪣", "seau" }, { "🎸", "guitare" },
            { "☂", "parapluie" }, { "🌂", "parapluie" }, { "☔", "parapluie" }, { "☕", "tasse" },
            { "⏰", "reveil" }, { "📖", "livre" }, { "📚", "livre" }, { "🎁", "cadeau" },
            { "🥁", "tambour" }, { "✂", "ciseaux" }, { "👒", "chapeau" }, { "🪥", "brosse-a-dents" },
            { "⚽", "ballon-foot" }, { "🎈", "ballon" }, { "🏠", "maison" },
            // Véhicules
            { "🚁", "helicoptere" }, { "🚀", "fusee" }, { "🚜", "tracteur" }, { "🏍", "moto" },
            { "🚚", "camion" }, { "🚌", "bus" }, { "⛵", "voilier" }, { "🚤", "bateau" },
            { "🚢", "bateau" }, { "⛴", "bateau" }, { "🚗", "voiture" }, { "🚂", "train" },
            { "🚆", "train" }, { "✈", "avion" }, { "🛩", "avion" }, { "🚲", "velo" },
            { "🚒", "camion-pompier" }, { "🚐", "autocar" }, { "🛴", "trottinette" },
            { "🛹", "skateboard" }, { "🚕", "taxi" }, { "🚑", "ambulance" },
            { "🚓", "voiture-police" }, { "🚔", "voiture-police" }, { "🚛", "camion-benne" },
            { "🛸", "soucoupe" }, { "🛳", "paquebot" }, { "🛥", "bateau-moteur" },
            { "🚇", "metro" },
            // Animaux de la ferme et d'ailleurs
            { "🐷", "cochon" }, { "🐖", "cochon" }, { "🐮", "vache" }, { "🐄", "vache" },
            { "🐑", "mouton" }, { "🐔", "poule" }, { "🐓", "poule" }, { "🐣", "poussin" },
            { "🐤", "poussin" }, { "🐥", "poussin" }, { "🫏", "ane" }, { "🐐", "chevre" },
            { "🐭", "souris" }, { "🐁", "souris" }, { "🦫", "castor" }, { "🦡", "blaireau" },
            { "🐊", "crocodile" }, { "🦛", "hippopotame" }, { "🐯", "tigre" }, { "🐅", "tigre" },
            { "🦘", "kangourou" }, { "🐪", "chameau" }, { "🐫", "chameau" },
            { "🐬", "dauphin" }, { "🐞", "coccinelle" },
            // Fruits et légumes du marché
            { "🍊", "orange" }, { "🥔", "pomme-de-terre" }, { "🥒", "concombre" },
            { "🍑", "peche" }, { "🍈", "melon" }, { "🫐", "myrtille" }, { "🥭", "mangue" },
            { "🥝", "kiwi" }, { "🥥", "noix-de-coco" }, { "🍋", "citron" },
            { "🍆", "aubergine" }, { "🫑", "poivron" }, { "🧅", "oignon" },
            { "🎃", "citrouille" }, { "🥬", "salade" }, { "🌟", "etoile" },
            // Plats du monde
            { "🍝", "plat-spaghetti" }, { "🌮", "plat-tacos" }, { "🌭", "plat-hot-dog" },
            { "🍜", "plat-ramen" }, { "🍛", "plat-curry" }, { "🥙", "plat-kebab" },
            { "🌯", "plat-burrito" }, { "🥨", "plat-bretzel" }, { "🍣", "plat-sushi" },
            { "🍔", "plat-hamburger" }, { "🥞", "plat-crepe" }, { "🫕", "plat-fondue" },
            { "🥘", "plat-paella" }, { "🍚", "plat-riz-frit" }, { "🥟", "plat-dim-sum" },
            { "🧆", "plat-falafel" }, { "🍲", "plat-goulasch" }, { "🍟", "plat-fish-and-chips" },
            // Monuments
            { "🗼", "lieu-france" }, { "🗽", "lieu-amerique" }, { "🗻", "lieu-japon" },
            { "🏯", "lieu-chine" }, { "🏰", "chateau-conte" },
            // Le monde magique
            { "👸", "princesse" }, { "🧚", "fee" }, { "🪄", "baguette-magique" },
            { "🛡", "chevalier" }, { "❤", "coeur" }, { "💖", "coeur-rose" },
            { "💗", "coeur-framboise" }, { "💜", "coeur-violet" }, { "☁", "nuage" },
            { "💎", "diamant" }, { "⭐", "etoile" },
            // Vêtements
            { "🧥", "manteau" }, { "👕", "t-shirt" }, { "👖", "jean" }, { "🩳", "short" },
            { "👗", "robe" }, { "👔", "chemise" }, { "🩱", "maillot-de-bain" },
            { "🧣", "echarpe" }, { "🧤", "moufles" }, { "🧢", "casquette" },
            { "👢", "bottes" }, { "🩴", "tongs" }, { "🕶", "lunettes-de-soleil" },
            { "🥿", "pantoufles" }, { "👠", "chaussure" },
            // Jouets
            { "🤖", "robot" }, { "🪀", "yoyo" }, { "🧩", "puzzle" }, { "🪅", "toupie" },
            // Cuisine et salle de bain
            { "🍽", "assiette" }, { "🥣", "bol" }, { "🍴", "fourchette" }, { "🥄", "cuillere" },
            { "🍳", "poele" }, { "🫖", "theiere" }, { "🥛", "verre" }, { "🧽", "eponge" },
            { "🛁", "baignoire" }, { "🚿", "douche" }, { "🧼", "savon" }, { "🚽", "toilettes" },
            { "🧻", "papier-toilette" }, { "🧺", "panier-a-linge" },
        };

        /// <summary>
        /// Le visuel d'un EMOJI : son dessin cartoon embarqué s'il existe (ou
        /// l'image du parent de même nom), sinon l'emoji tel quel. Les jeux
        /// peuvent l'appeler partout : c'est toujours sans risque.
        /// </summary>
        private static Dictionary<string, string> _emojiNorm;

        public static FrameworkElement ForEmoji(string emoji, double size)
        {
            // Table normalisée sans le sélecteur de variante (FE0F), présent ou
            // non selon la façon dont l'emoji a été tapé dans le code.
            if (_emojiNorm == null)
            {
                _emojiNorm = new Dictionary<string, string>();
                foreach (var kv in EmojiNames)
                    _emojiNorm[kv.Key.Replace("️", "")] = kv.Value;
            }
            // « nom|emoji » : le jeu désigne le dessin par son NOM (utile quand
            // deux objets partagent le même emoji : manteau / imperméable).
            int bar = (emoji ?? "").IndexOf('|');
            if (bar > 0)
                return Visual(emoji.Substring(0, bar), emoji.Substring(bar + 1), size);
            var key = (emoji ?? "").Replace("️", "").Trim();
            return _emojiNorm.TryGetValue(key, out var name)
                ? Visual(name, emoji, size)
                : Visual(null, emoji, size);
        }

        /// <summary>Crée le dossier « Images » et son mode d'emploi (une fois).</summary>
        public static void EnsureFolder()
        {
            if (_ready) return;
            _ready = true;
            try
            {
                Directory.CreateDirectory(Dir);
                var readme = Path.Combine(Dir, "LISEZ-MOI.txt");
                if (File.Exists(readme)) return;
                File.WriteAllText(readme,
                    "MES PREMIERS JEUX — Images personnalisées\r\n" +
                    "==========================================\r\n\r\n" +
                    "Déposez ici des images PNG (fond transparent de préférence) avec les\r\n" +
                    "noms ci-dessous : les jeux les utiliseront À LA PLACE des emojis.\r\n" +
                    "S'il manque une image, le jeu garde l'emoji : aucun risque.\r\n\r\n" +
                    "Où trouver de jolies images ?\r\n" +
                    "  - kenney.nl : des milliers de dessins de jeux GRATUITS (licence CC0),\r\n" +
                    "    style cartoon cohérent (animaux, fusées, visages...).\r\n" +
                    "  - L'IA (Bing Image Creator, ChatGPT...) : demandez par exemple\r\n" +
                    "    « oiseau cartoon mignon pour enfant, fond transparent, style flat ».\r\n\r\n" +
                    "NOMS ATTENDUS\r\n" +
                    "-------------\r\n\r\n" +
                    "Les oiseaux chanteurs :\r\n" +
                    "  oiseau-1.png ... oiseau-6.png   (6 oiseaux différents)\r\n" +
                    "  oiseau-1-vole.png ... (FACULTATIF : le même oiseau les AILES\r\n" +
                    "  OUVERTES — l'oiseau bat alors des ailes pendant qu'il chante !)\r\n" +
                    "  oiseau-1-vole2.png ... (FACULTATIF : pose INTERMÉDIAIRE, ailes\r\n" +
                    "  à moitié ouvertes — le battement devient tout fluide.)\r\n" +
                    "  oiseau-1-vole3.png ... (FACULTATIF : 2e pose intermédiaire,\r\n" +
                    "  ailes à peine ouvertes — battement encore plus fluide.)\r\n\r\n" +
                    "Tartes à la crème (21 personnages FOURNIS avec l'application) :\r\n" +
                    "  visage-1.png ... visage-21.png        (visages rigolos)\r\n" +
                    "  visage-touche-1.png ... -21.png       (le MÊME personnage qui a\r\n" +
                    "  reçu la tarte — les numéros se correspondent !)\r\n" +
                    "  tarte.png                             (la tarte qui vole)\r\n\r\n" +
                    "La fenêtre magique (les surprises cachées) :\r\n" +
                    "  surprise-1.png  (lion)        surprise-2.png  (licorne)\r\n" +
                    "  surprise-3.png  (fusée)       surprise-4.png  (château)\r\n" +
                    "  surprise-5.png  (baleine)     surprise-6.png  (tracteur)\r\n" +
                    "  surprise-7.png  (arc-en-ciel) surprise-8.png  (dinosaure)\r\n" +
                    "  surprise-9.png  (gâteau)      surprise-10.png (éléphant)\r\n" +
                    "  surprise-11.png (bateau)      surprise-12.png (princesse)\r\n" +
                    "  surprise-13.png (fée)         surprise-14.png (chevalier)\r\n" +
                    "  surprise-15.png (dragon)      (toutes FOURNIES avec l'application)\r\n\r\n" +
                    "Le monde magique (fourni) : princesse, fee, chevalier, chateau-conte,\r\n" +
                    "  baguette-magique, coeur, nuage, diamant, etoile-filante... (+ couleurs :\r\n" +
                    "  princesse-bleue, coeur-violet, etoile-rose, dragon-rouge...)\r\n\r\n" +
                    "Décors de scène (toute l'image de fond d'un jeu) :\r\n" +
                    "  decor-oiseaux.png   (les oiseaux chanteurs — ex. « grand arbre\r\n" +
                    "  feuillu avec deux branches horizontales dégagées, ciel doux,\r\n" +
                    "  style cartoon, sans oiseaux », format paysage 16:9)\r\n" +
                    "  decor-tartes.png    (les tartes à la crème — ex. « chapiteau de\r\n" +
                    "  cirque vu de l'intérieur, gai et coloré », format paysage 16:9)\r\n" +
                    "  maison-sons.png     (la maison des sons — maison cartoon rigolote\r\n" +
                    "  avec une GRANDE BULLE BLANCHE VIDE au-dessus du toit : la lettre\r\n" +
                    "  du son s'affiche dedans ! Fournie avec l'application.)\r\n" +
                    "  maison-sons-1.png ... -4.png  (FACULTATIF : plusieurs poses de la\r\n" +
                    "  MÊME maison, à peine différentes — alternées doucement, la maison\r\n" +
                    "  RESPIRE ! 4 poses sont déjà fournies.)\r\n\r\n" +
                    "PLACES PRÊTES (le jeu les utilise dès que l'image existe) :\r\n" +
                    "  tarte.png                    (la tarte à la crème qui vole)\r\n" +
                    "  lune-pleine.png, lune-demi.png, lune-croissant.png (formes de la Lune)\r\n" +
                    "  drapeau-france.png ... drapeau-amerique.png (8 drapeaux, le nom du\r\n" +
                    "  pays est ajouté dessous automatiquement)\r\n" +
                    "  chiffre-1.png ... chiffre-10.png (chiffres-personnages)\r\n" +
                    "  de-1.png ... de-6.png        (les faces du dé)\r\n" +
                    "  gobelet.png                  (le gobelet du bonneteau)\r\n\r\n" +
                    "Les décors plein écran (FOURNIS, format paysage 16:9) :\r\n" +
                    "  decor-oiseaux (ciel + 2 fils à 50 % et 86 % de la hauteur),\r\n" +
                    "  decor-ferme, decor-montagnes, decor-neige, decor-bonbons,\r\n" +
                    "  decor-jungle, decor-robots, decor-foret, decor-ocean,\r\n" +
                    "  decor-ocean-epave, decor-montgolfieres, decor-espace, decor-mare\r\n\r\n" +
                    "Jour et nuit (fourni) : la MÊME maison à 4 moments, même cadrage :\r\n" +
                    "  scene-jour.jpg, scene-coucher.jpg, scene-soir.jpg, scene-nuit.jpg\r\n" +
                    "  (fondues l'une dans l'autre : un vrai coucher / lever de soleil)\r\n\r\n" +
                    "La grille de communication 💬 (pictogrammes, fond blanc ou transparent) :\r\n" +
                    "  comm-oui, comm-non, comm-encore, comm-fini, comm-aide, comm-viens,\r\n" +
                    "  comm-mal, comm-calin, comm-content, comm-rigolo, comm-triste, comm-colere,\r\n" +
                    "  comm-peur, comm-malade, comm-sommeil, comm-ennui, comm-bruit, comm-pause,\r\n" +
                    "  comm-dormir, comm-tele, comm-position, comm-tete, comm-ventre, comm-dos,\r\n" +
                    "  comm-gorge, comm-dents, comm-oreille, comm-yeux, comm-bras, comm-main,\r\n" +
                    "  comm-jambe, comm-pied, comm-maman, comm-papa, comm-mamie, comm-papi,\r\n" +
                    "  comm-copain, comm-docteur, comm-bonjour, comm-aurevoir, comm-merci,\r\n" +
                    "  comm-stp, comm-bisou, comm-bravo   (sinon : un emoji en attendant)\r\n" +
                    "  Les PHOTOS du dossier Famille apparaissent dans la page « Les gens ».\r\n" +
                    "  Voix d'un parent pour une case : Contenu\\Voix\\comm-<clé>-1.wav\r\n\r\n" +
                    "Les lettres-personnages (fournies avec l'application) :\r\n" +
                    "  lettre-A.png ... lettre-Z.png   (l'alphabet rigolo — abécédaire,\r\n" +
                    "  Mon prénom, la bulle de la maison des sons)\r\n\r\n" +
                    "Le train du prénom (fournis avec l'application) :\r\n" +
                    "  locomotive.png                  (la locomotive rigolote)\r\n" +
                    "  wagon-1.png ... wagon-5.png     (les wagons vides où les lettres\r\n" +
                    "  du prénom viennent s'installer)\r\n\r\n" +
                    "Les planètes (TOUT est déjà fourni avec l'application) :\r\n" +
                    "  planete-soleil.png, planete-mercure.png, planete-venus.png,\r\n" +
                    "  planete-terre.png, planete-lune.png, planete-mars.png,\r\n" +
                    "  planete-jupiter.png, planete-saturne.png, planete-uranus.png,\r\n" +
                    "  planete-neptune.png, planete-pluton.png   (autocollants rigolos)\r\n" +
                    "  photo-soleil.png ... photo-pluton.png     (les VRAIES photos,\r\n" +
                    "  montrées après chaque bonne réponse)\r\n" +
                    "  decor-espace.png    (la grande scène étoilée du fond)\r\n\r\n" +
                    "Le tour du monde — monuments (dessins FOURNIS ; une PHOTO du même\r\n" +
                    "nom déposée ici les remplace) :\r\n" +
                    "  lieu-france.png      (tour Eiffel)      lieu-angleterre.png (Big Ben)\r\n" +
                    "  lieu-italie.png      (Colisée)          lieu-egypte.png     (pyramides)\r\n" +
                    "  lieu-russie.png      (cathédrale aux bulbes) lieu-chine.png (Cité interdite)\r\n" +
                    "  lieu-japon.png       (mont Fuji)        lieu-amerique.png   (statue de la Liberté)\r\n" +
                    "  monument-*.png : 22 autres monuments (Taj Mahal, tour de Pise...)\r\n" +
                    "  (photos libres : commons.wikimedia.org, pexels.com, pixabay.com)\r\n\r\n" +
                    "Le tour du monde — plats (dessins FOURNIS) :\r\n" +
                    "  plat-crepe.png, plat-pizza.png, plat-sushi.png, plat-raviolis.png,\r\n" +
                    "  plat-hamburger.png, plat-fish-and-chips.png, plat-falafel.png...\r\n" +
                    "  (53 plats en tout : paella, couscous, tajine, ramen, dim-sum, kimchi...)\r\n\r\n" +
                    "BON À SAVOIR : l'application embarque déjà près de 200 petits\r\n" +
                    "dessins cartoon (animaux, fruits et légumes, véhicules, objets...)\r\n" +
                    "qui remplacent les emojis dans les jeux. Un fichier du MÊME NOM\r\n" +
                    "déposé ici (ex. chat.png) remplace le dessin fourni.\r\n\r\n" +
                    "D'autres noms seront ajoutés au fil des jeux (ce fichier est recréé\r\n" +
                    "s'il est supprimé, avec la liste à jour).\r\n");
            }
            catch { }
        }
    }
}
