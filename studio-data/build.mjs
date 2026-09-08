#!/usr/bin/env node
// Assemble StudioDataV7.html à partir de studio-data/src (voir src/README.md).
//   node studio-data/build.mjs            -> écrit ../StudioDataV7.html
//   node studio-data/build.mjs --check    -> vérifie que le fichier livré est à jour (code retour 1 sinon)
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(here, 'src');
const manifest = JSON.parse(fs.readFileSync(path.join(srcDir, 'manifest.json'), 'utf8'));
const outFile = path.resolve(srcDir, manifest.output);
let html = '', js = '';
for (const p of manifest.parts) {
  const f = path.join(srcDir, p.file);
  if (!fs.existsSync(f)) { console.error('Fichier manquant : ' + p.file); process.exit(2); }
  const txt = fs.readFileSync(f, 'utf8');
  if (p.file.endsWith('.js')) js += txt; else html += txt;
}
const outHtml = html + '    <script>\n' + js + '</script>\n</body>\n</html>\n';
const v = (outHtml.match(/const APP_VERSION = '([^']+)'/) || [])[1] || '?';
if (process.argv.includes('--check')) {
  const cur = fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8') : '';
  if (cur === outHtml) { console.log('OK : StudioDataV7.html est à jour (v' + v + ')'); process.exit(0); }
  console.error('ÉCART : StudioDataV7.html ne correspond pas aux sources — lancez node studio-data/build.mjs'); process.exit(1);
}
fs.writeFileSync(outFile, outHtml);
console.log('Construit ' + path.relative(process.cwd(), outFile) + ' (v' + v + ', ' + manifest.parts.length + ' fichiers, ' + (outHtml.length / 1024 / 1024).toFixed(2) + ' Mo)');
