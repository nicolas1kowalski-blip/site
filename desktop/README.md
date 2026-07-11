# Mes Premiers Jeux — version bureau (C# / WPF + Tobii)

Version **native Windows** de l'application, pilotée à la **commande oculaire**
via le **SDK grand public Tobii** (`Tobii.Interaction`, dit *Tobii Core / EyeX*),
compatible avec le **Tobii Eye Tracker 5** et les PC équipés de **Tobii Experience**.

Contrairement à la version web intégrée dans GRID 3, cette version lit le regard
**directement** et fait le *dwell-click* elle-même : plus besoin que GRID transmette
le regard dans une cellule web.

## Ce qui est inclus dans ce premier socle

- **Moteur de regard Tobii** (`Gaze/GazeService.cs`) — flux de points de regard ;
  si aucun tracker n'est présent, l'appli bascule automatiquement en mode souris.
- **Dwell-click** (`Gaze/DwellController.cs`) — quand le regard reste posé sur une
  cible, l'action se déclenche ; un anneau de progression suit le regard et la cible
  « prend vie » (elle grossit et frémit), comme dans la version web.
- **Coquille plein écran à onglets** (Histoires / Jeux / Coloriage / Musique).
- **Activité Coloriage complète** : palette variée (couleurs simples, **à paillettes**,
  **arc-en-ciel**, **à motifs**), grand dessin au centre rempli au regard *ou* à la
  souris (remplissage « pot de peinture »), 4 dessins intégrés, bouton *Recommencer*
  et bouton *Plein écran*. Voix française qui nomme la couleur choisie.

- **Jeux (tous en 3D WPF `Viewport3D`)** : **Ballons 3D** (ballons volumétriques
  qui montent, éclatés au regard), **Couleurs** (sphères 3D), **Formes** (solides :
  sphère, cube, prismes triangle/étoile/cœur), **Compter** (sphères 3D), **Les
  ombres** (forme 3D sombre qui tourne, révélée en couleur), **Les familles** et
  **Les paires** (cartes 3D qui se retournent). **Menu plein écran sans
  défilement** (grandes tuiles) : on choisit un jeu, il occupe toute la page, et
  un bouton **« ⬅ Menu »** ramène au choix. Cibles agrandies pour le pilotage au
  regard. Félicitations en confettis, voix française. Au regard (dwell) ou à la souris.

Les onglets Histoires / Musique — et les jeux restants (corps, puzzles) — sont à
venir : on les ajoute un par un (le coloriage et ces jeux servent de patron).

## Prérequis

- **Windows 10/11**
- **Visual Studio 2022** (charge de travail « Développement .NET Desktop »)
- **.NET Framework 4.7.2** (Developer Pack)
- **Tobii Experience** installé + un **Tobii Eye Tracker 5** calibré
  (facultatif pour lancer : sans tracker, l'appli marche à la souris)

## Compiler et lancer

1. Ouvrir `desktop/MesPremiersJeux.sln` dans Visual Studio 2022.
2. Choisir la configuration **x64** (important : les DLL natives Tobii ne se
   chargent pas en *AnyCPU*).
3. Restaurer les paquets NuGet (`Tobii.Interaction` se télécharge tout seul).
4. **F5** pour lancer.

En ligne de commande :

```powershell
cd desktop
dotnet restore
msbuild MesPremiersJeux.sln /p:Platform=x64 /p:Configuration=Release
```

> `dotnet build` peut suffire, mais `Tobii.Interaction` cible .NET Framework :
> si `dotnet` pose souci, privilégier **MSBuild via Visual Studio**.

## Réglages du dwell (au regard)

Un bouton **⚙** en haut à droite ouvre un panneau, **réglable en direct** et
**mémorisé** d'une session à l'autre (fichier `%AppData%\MesPremiersJeux\settings.ini`) :

- **Piloter au regard (dwell)** — active/désactive le déclenchement par fixation.
- **Durée de fixation** — de 0,4 s à 2,5 s.
- **Lissage (stabilité du regard)** — de « réactif » à « très stable ». Augmente-le
  si le point tremble trop ; diminue-le si le cercle traîne derrière le regard.
- **Taille du cercle** — diamètre du cercle de progression.

Deux sources de regard sont gérées automatiquement :

- **SDK Tobii présent** (tracker grand public) → le regard pilote directement,
  case « Piloter au regard » cochée par défaut.
- **Pas de SDK** (ex. **Tobii Dynavox TD I-13**) → l'appli suit la **position du
  curseur** déplacé au regard. Il suffit d'activer le mode *« Contrôle de
  l'ordinateur / Windows Control »* de la I-13, puis de cocher « Piloter au
  regard » dans le panneau ⚙.

## Calibrage

Le calibrage se fait **au niveau de l'appareil / du runtime**, pas dans l'appli :

- **TD I-13 (Tobii Dynavox)** : réglages d'eye-tracking de l'appareil →
  **Calibrer** (interface Tobii Dynavox).
- **Tracker grand public** : via **Tobii Experience** (l'appli Tobii de Windows).

## Version autonome (sans Visual Studio) — pour la TD I-13

1. Dans Visual Studio, choisir **Release** + **x64**, puis menu **Générer →
   Générer la solution** (Ctrl+Maj+B).
2. Le résultat se trouve dans :
   `desktop/MesPremiersJeux/bin/x64/Release/net472/`
3. Ce dossier est **autonome** : il contient `MesPremiersJeux.exe` **et** les DLL
   Tobii. **Copie le dossier entier** sur la TD I-13 (clé USB, OneDrive…).
4. Sur la I-13, double-clique **`MesPremiersJeux.exe`**. Aucune installation
   requise : .NET Framework 4.8 est déjà présent sur Windows 10/11.

> Astuce : pour un lancement facile par l'enfant, crée un **raccourci** de
> `MesPremiersJeux.exe` sur le Bureau, et utilise le bouton **⛶ Plein écran**.

## Prochaines étapes prévues

1. Portage des jeux (ballons, corps, puzzle, ombres, paires, familles).
2. Portage du lecteur d'histoires (livres + surbrillance des mots lus).
3. Chargement de coloriages personnalisés (images au trait) — y compris des
   personnages connus — synchronisés comme dans la version web.
4. Réglages (durée du dwell, verrouillage) accessibles au regard.

## Architecture (repères)

```
desktop/MesPremiersJeux/
  App.xaml(.cs)              Styles globaux (boutons, onglets)
  MainWindow.xaml(.cs)       Coquille plein écran, onglets, anneau de regard
  Gaze/
    GazeService.cs           Flux de regard Tobii (Tobii.Interaction)
    DwellController.cs        Dwell-click + anneau + « prend vie »
    IGazeSurface.cs          Surface continue (ex. coloriage)
  Data/
    Palette.cs               Palette (simples / paillettes / arc-en-ciel / motifs)
    Colorings.cs             Dessins au trait intégrés
  Lib/
    ColoringEngine.cs        Remplissage par diffusion + textures
    Speech.cs                Voix française + « pop » de validation
  Views/
    ColoringView.xaml(.cs)   Activité coloriage
```
