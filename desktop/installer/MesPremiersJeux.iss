; Installeur Windows de « Mes Premiers Jeux » (Inno Setup 6).
; Compilé par GitHub Actions (.github/workflows/build.yml) avec :
;   ISCC.exe /DVersion=2026.10.22.5 /DSource=..\MesPremiersJeux\bin\x64\Release\net472 MesPremiersJeux.iss
; Installation PAR UTILISATEUR (sans droits administrateur), dans
; %LocalAppData%\Programs\MesPremiersJeux. Le contenu de la famille (photos,
; voix, livres) vit ailleurs (%LocalAppData%\MesPremiersJeux\Contenu) et
; n'est jamais touché par une installation ou une désinstallation.

#ifndef Version
  #define Version "0.0.0.1"
#endif
#ifndef Source
  #define Source "..\MesPremiersJeux\bin\x64\Release\net472"
#endif

[Setup]
AppId={{7E3FF2A1-4C1B-4D2E-9B6A-1A2B3C4D5E6F}
AppName=Mes Premiers Jeux
AppVersion={#Version}
AppVerName=Mes Premiers Jeux {#Version}
AppPublisher=Mes Premiers Jeux
AppPublisherURL=https://github.com/nicolas1kowalski-blip/site
DefaultDirName={localappdata}\Programs\MesPremiersJeux
DefaultGroupName=Mes Premiers Jeux
DisableProgramGroupPage=yes
DisableDirPage=yes
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=Output
OutputBaseFilename=MesPremiersJeux-Setup-{#Version}
SetupIconFile=..\MesPremiersJeux\app.ico
UninstallDisplayIcon={app}\MesPremiersJeux.exe
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
CloseApplications=yes
RestartApplications=no
MinVersion=10.0
VersionInfoVersion={#Version}
VersionInfoProductName=Mes Premiers Jeux

[Languages]
Name: "french"; MessagesFile: "compiler:Languages\French.isl"

[Tasks]
Name: "desktopicon"; Description: "Créer une icône sur le Bureau"; GroupDescription: "Raccourcis :"
Name: "autostart"; Description: "Lancer Mes Premiers Jeux à l'ouverture de Windows (mode tablette)"; GroupDescription: "Démarrage :"; Flags: unchecked

[Files]
Source: "{#Source}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: "*.pdb,*.xml,Contenu\*,MiseAJour\*"

[Icons]
Name: "{group}\Mes Premiers Jeux"; Filename: "{app}\MesPremiersJeux.exe"
Name: "{group}\Désinstaller Mes Premiers Jeux"; Filename: "{uninstallexe}"
Name: "{autodesktop}\Mes Premiers Jeux"; Filename: "{app}\MesPremiersJeux.exe"; Tasks: desktopicon

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "MesPremiersJeux"; ValueData: """{app}\MesPremiersJeux.exe"""; Flags: uninsdeletevalue; Tasks: autostart

[Run]
; Après une installation à la main : on propose de lancer.
Filename: "{app}\MesPremiersJeux.exe"; Description: "Lancer Mes Premiers Jeux"; Flags: nowait postinstall skipifsilent
; Après une MISE À JOUR automatique (installation silencieuse lancée par l'appli
; avec /LAUNCH=1) : on relance l'application tout seul.
Filename: "{app}\MesPremiersJeux.exe"; Flags: nowait; Check: WantLaunch

[UninstallDelete]
Type: filesandordirs; Name: "{app}"

[Code]
function WantLaunch: Boolean;
begin
  Result := ExpandConstant('{param:LAUNCH|0}') = '1';
end;
