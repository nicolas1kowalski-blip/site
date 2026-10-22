; Installeur Windows de « Eyzi » (Inno Setup 6).
; Compilé par GitHub Actions (.github/workflows/build.yml) avec :
;   ISCC.exe /DVersion=2026.10.22.5 /DSource=..\MesPremiersJeux\bin\x64\Release\net472 Eyzi.iss
; Installation PAR UTILISATEUR (sans droits administrateur), dans
; %LocalAppData%\Programs\Eyzi (les anciennes installations restent dans leur dossier). Le contenu de la famille (photos,
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
AppName=Eyzi
AppVersion={#Version}
AppVerName=Eyzi {#Version}
AppPublisher=Eyzi
AppPublisherURL=https://github.com/nicolas1kowalski-blip/site
DefaultDirName={localappdata}\Programs\Eyzi
DefaultGroupName=Eyzi
DisableProgramGroupPage=yes
DisableDirPage=yes
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=Output
OutputBaseFilename=Eyzi-Setup-{#Version}
SetupIconFile=..\MesPremiersJeux\app.ico
UninstallDisplayIcon={app}\Eyzi.exe
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
CloseApplications=yes
RestartApplications=no
MinVersion=10.0
VersionInfoVersion={#Version}
VersionInfoProductName=Eyzi

[Languages]
Name: "french"; MessagesFile: "compiler:Languages\French.isl"

[Tasks]
Name: "desktopicon"; Description: "Créer une icône sur le Bureau"; GroupDescription: "Raccourcis :"
Name: "autostart"; Description: "Lancer Eyzi à l'ouverture de Windows (mode tablette)"; GroupDescription: "Démarrage :"; Flags: unchecked

[Files]
Source: "{#Source}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: "*.pdb,*.xml,Contenu\*,MiseAJour\*"

[Icons]
Name: "{group}\Eyzi"; Filename: "{app}\Eyzi.exe"
Name: "{group}\Désinstaller Eyzi"; Filename: "{uninstallexe}"
Name: "{autodesktop}\Eyzi"; Filename: "{app}\Eyzi.exe"; Tasks: desktopicon

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "Eyzi"; ValueData: """{app}\Eyzi.exe"""; Flags: uninsdeletevalue; Tasks: autostart
; L'ancien démarrage automatique (« MesPremiersJeux ») est retiré : c'est Eyzi.exe qui démarre.
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: none; ValueName: "MesPremiersJeux"; Flags: deletevalue

[Run]
; Après une installation à la main : on propose de lancer.
Filename: "{app}\Eyzi.exe"; Description: "Lancer Eyzi"; Flags: nowait postinstall skipifsilent
; Après une MISE À JOUR automatique (installation silencieuse lancée par l'appli
; avec /LAUNCH=1) : on relance l'application tout seul.
Filename: "{app}\Eyzi.exe"; Flags: nowait; Check: WantLaunch

[InstallDelete]
; Transition depuis « Mes Premiers Jeux » : l'ancien exécutable et les anciens raccourcis disparaissent.
Type: files; Name: "{app}\MesPremiersJeux.exe"
Type: files; Name: "{app}\MesPremiersJeux.exe.config"
Type: files; Name: "{autodesktop}\Mes Premiers Jeux.lnk"
Type: filesandordirs; Name: "{userprograms}\Mes Premiers Jeux"

[UninstallDelete]
Type: filesandordirs; Name: "{app}"

[Code]
function WantLaunch: Boolean;
begin
  Result := ExpandConstant('{param:LAUNCH|0}') = '1';
end;
