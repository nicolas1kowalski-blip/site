#!/usr/bin/env node
// Assemble les fichiers livrés à partir de studio-data/src (voir src/README.md).
//   node studio-data/build.mjs                 -> construit StudioDataV7.html (manifest.json)
//   node studio-data/build.mjs --target v11    -> construit StudioDataV11.html (manifest-v11.json)
//   node studio-data/build.mjs --target v12    -> construit StudioDataV12.html (manifest-v12.json)
//   node studio-data/build.mjs --all           -> construit les trois
//   ... --check                                -> vérifie que le(s) fichier(s) livré(s) sont à jour (code retour 1 sinon)
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(here, 'src');
const args = process.argv.slice(2);
const check = args.includes('--check');
const tIdx = args.indexOf('--target');
const targets = args.includes('--all') ? ['v7', 'v11', 'v12'] : [tIdx >= 0 ? args[tIdx + 1] : 'v7'];
const MANIFESTS = { v7: 'manifest.json', v11: 'manifest-v11.json', v12: 'manifest-v12.json' };
let rc = 0;
for (const target of targets) {
  const manifest = JSON.parse(fs.readFileSync(path.join(srcDir, MANIFESTS[target] || 'manifest.json'), 'utf8'));
  const outFile = path.resolve(srcDir, manifest.output);
  let html = '', js = '';
  for (const p of manifest.parts) {
    const f = path.join(srcDir, p.file);
    if (!fs.existsSync(f)) { console.error('Fichier manquant : ' + p.file); process.exit(2); }
    const txt = fs.readFileSync(f, 'utf8');
    if (p.file.endsWith('.js')) js += txt; else html += txt;
  }
  const outHtml = html + '    <script>\n' + js + '</script>\n</body>\n</html>\n';
  const v = target === 'v12' ? ((outHtml.match(/const V12_VERSION = '([^']+)'/) || [])[1] || '?') : (target === 'v11' ? ((outHtml.match(/const V11_VERSION = '([^']+)'/) || [])[1] || '?') : ((outHtml.match(/V11_VERSION : '([^']+)'/) || [])[1] || '?'));
  const name = path.basename(outFile);
  if (check) {
    const cur = fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8') : '';
    if (cur === outHtml) console.log('OK : ' + name + ' est à jour (v' + v + ')');
    else { console.error('ÉCART : ' + name + ' ne correspond pas aux sources — lancez node studio-data/build.mjs' + (target !== 'v7' ? ' --target ' + target : '')); rc = 1; }
    continue;
  }
  fs.writeFileSync(outFile, outHtml);
  console.log('Construit ' + path.relative(process.cwd(), outFile) + ' (v' + v + ', ' + manifest.parts.length + ' fichiers, ' + (outHtml.length / 1024 / 1024).toFixed(2) + ' Mo)');
}
process.exit(rc);
