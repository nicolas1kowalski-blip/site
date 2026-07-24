# Studio Data - petit serveur statique local (aucune dependance : PowerShell/.NET).
# Sert le dossier -Root sur http://localhost:-Port. Utilise par Lancer_StudioData_localhost.bat
# quand Python n'est pas installe. Localhost uniquement, en lecture seule.
param([int]$Port = 8765, [string]$Root = ".")

try { $Root = (Resolve-Path -LiteralPath $Root).Path } catch { Write-Host "Dossier introuvable : $Root"; exit 1 }
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
try { $listener.Start() }
catch {
  Write-Host ""
  Write-Host "Impossible de demarrer le serveur sur le port $Port."
  Write-Host "Un autre programme l'utilise peut-etre. Modifiez PORT dans le .bat, ou fermez l'autre serveur."
  Write-Host $_.Exception.Message
  Write-Host ""; Read-Host "Appuyez sur Entree pour fermer"; exit 1
}
Write-Host ""
Write-Host "  Serveur Studio Data demarre : http://localhost:$Port/"
Write-Host "  Racine : $Root"
Write-Host "  >>> Laissez cette fenetre OUVERTE. Fermez-la pour arreter le serveur. <<<"
Write-Host ""

$mime = @{
  ".html" = "text/html; charset=utf-8"; ".htm" = "text/html; charset=utf-8";
  ".js" = "text/javascript; charset=utf-8"; ".mjs" = "text/javascript; charset=utf-8";
  ".css" = "text/css; charset=utf-8"; ".json" = "application/json; charset=utf-8";
  ".csv" = "text/csv; charset=utf-8"; ".txt" = "text/plain; charset=utf-8";
  ".wasm" = "application/wasm"; ".png" = "image/png"; ".jpg" = "image/jpeg"; ".jpeg" = "image/jpeg";
  ".gif" = "image/gif"; ".svg" = "image/svg+xml"; ".ico" = "image/x-icon"; ".woff2" = "font/woff2"
}

while ($listener.IsListening) {
  try {
    $ctx = $listener.GetContext()
    $rel = [System.Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart('/')
    if ([string]::IsNullOrEmpty($rel)) {
      $first = Get-ChildItem -LiteralPath $Root -Filter "StudioData*.html" | Select-Object -First 1
      if ($first) { $rel = $first.Name }
    }
    $path = Join-Path $Root $rel
    $full = [System.IO.Path]::GetFullPath($path)
    if (-not $full.StartsWith($Root, [System.StringComparison]::OrdinalIgnoreCase)) {
      $ctx.Response.StatusCode = 403; $ctx.Response.Close(); continue
    }
    if (Test-Path -LiteralPath $full -PathType Leaf) {
      $ext = [System.IO.Path]::GetExtension($full).ToLower()
      if ($mime.ContainsKey($ext)) { $ctx.Response.ContentType = $mime[$ext] }
      $ctx.Response.Headers.Add("Cache-Control", "no-store")
      $bytes = [System.IO.File]::ReadAllBytes($full)
      $ctx.Response.ContentLength64 = $bytes.Length
      $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $ctx.Response.StatusCode = 404
      $msg = [System.Text.Encoding]::UTF8.GetBytes("404 - fichier introuvable : $rel")
      $ctx.Response.OutputStream.Write($msg, 0, $msg.Length)
    }
    $ctx.Response.Close()
  } catch { }
}
