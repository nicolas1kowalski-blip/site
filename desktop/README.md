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

Les onglets Histoires / Jeux / Musique sont pour l'instant des écrans « bientôt » :
on les remplira activité par activité (le portage du coloriage sert de patron).

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

## Réglages du dwell

Dans `Gaze/DwellController.cs` :

- `DwellTime` (ms) — durée de fixation avant déclenchement (900 ms par défaut).
- L'anneau et l'animation « prend vie » se calent automatiquement sur cette durée.

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
