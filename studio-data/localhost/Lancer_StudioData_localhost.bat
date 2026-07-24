@echo off
rem =====================================================================
rem  Studio Data - lanceur "localhost"
rem  Ouvre Studio Data via http://localhost (au lieu de file://) pour
rem  activer la sauvegarde automatique sur dossier + lever le plafond
rem  memoire des gros fichiers. Aucune installation requise :
rem  utilise Python s'il est present, sinon un serveur PowerShell integre.
rem
rem  A PLACER dans le MEME dossier que StudioDataV5.html, puis double-clic.
rem =====================================================================
setlocal enabledelayedexpansion
cd /d "%~dp0"

set "PORT=8765"
set "FILE=StudioDataV5.html"
if not exist "!FILE!" (
  for %%f in (StudioData*.html) do set "FILE=%%f"
)
if not exist "!FILE!" (
  echo.
  echo  ERREUR : aucun fichier StudioData*.html trouve dans ce dossier.
  echo  Placez ce lanceur A COTE de StudioDataV5.html puis relancez.
  echo.
  pause
  exit /b 1
)

rem --- Choisir un serveur : Python (py / python / python3), sinon PowerShell ---
set "SRV="
where py       >nul 2>nul && set "SRV=py -3 -m http.server !PORT!"
if not defined SRV ( where python  >nul 2>nul && set "SRV=python -m http.server !PORT!" )
if not defined SRV ( where python3 >nul 2>nul && set "SRV=python3 -m http.server !PORT!" )

if defined SRV (
  echo  Serveur : !SRV!
  start "Studio Data - serveur local (NE PAS FERMER)" cmd /c "cd /d ""%~dp0"" ^& !SRV!"
) else (
  echo  Python introuvable : demarrage du serveur PowerShell integre...
  start "Studio Data - serveur local (NE PAS FERMER)" powershell -ExecutionPolicy Bypass -NoProfile -File "%~dp0serve.ps1" -Port !PORT! -Root "%~dp0"
)

rem --- Laisser le serveur demarrer puis ouvrir le navigateur ---
timeout /t 2 >nul
start "" "http://localhost:!PORT!/!FILE!"

echo.
echo  Studio Data ouvert sur : http://localhost:!PORT!/!FILE!
echo.
echo  IMPORTANT :
echo   - Laissez la fenetre "serveur local" OUVERTE tant que vous utilisez l'app.
echo   - Fermez-la pour arreter le serveur.
echo   - 1re fois : dans l'app, Sauvegarde ^& partage -^> Importer votre bundle,
echo     puis "Choisir un dossier de sauvegarde" (idealement un dossier synchronise).
echo.
timeout /t 4 >nul
exit /b 0
