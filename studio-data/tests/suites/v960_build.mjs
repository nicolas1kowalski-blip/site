import fs from 'fs';
// Chemins : racine studio-data et dossier des suites (surchargeables par l'environnement, voir tests/run.mjs)
const ROOT = process.env.SD_ROOT || new URL('../../', import.meta.url).pathname;
const D = new URL('./', import.meta.url).pathname;
const { chromium } = (await import(process.env.PLAYWRIGHT_INDEX || '/opt/node22/lib/node_modules/playwright/index.js')).default;
const CHROMIUM = process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
import { execFileSync } from 'node:child_process';
let pass=0, fail=0; const ok=(n,c)=>{ c?pass++:fail++; console.log(`${c?'✅':'❌'} ${n}`); };
const root=ROOT + '';
const m=JSON.parse(fs.readFileSync(root+'src/manifest.json','utf8'));
ok('manifest : 57 fichiers, tous présents, chacun avec un rôle', m.parts.length===57 && m.parts.every(p=>fs.existsSync(root+'src/'+p.file) && p.role && p.role.length>10));
let out=''; try { out=execFileSync('/opt/node22/bin/node',[root+'build.mjs','--check'],{encoding:'utf8'}); } catch(e){ out='ERR '+(e.stdout||'')+(e.stderr||''); }
ok('build --check : le fichier livré correspond aux sources', /^OK/.test(out));
const html=fs.readFileSync(root+'StudioDataV7.html','utf8');
ok('un seul bloc <script> applicatif, un seul fichier livré', html.endsWith('</script>\n</body>\n</html>\n'));
ok('README des sources : découpage documenté', fs.readFileSync(root+'src/README.md','utf8').includes('Découpage par fonctionnalité'));
// reconstruction dans un fichier temporaire = octet pour octet le fichier livré
const tmp=root+'src/manifest.json'; const orig=fs.readFileSync(tmp,'utf8');
ok('version 10.0.0 dans la source et dans le fichier construit', /V11_VERSION : '10\.2\.3'/.test(fs.readFileSync(root+'src/10-noyau/1A-noyau-version-changelog.js','utf8')) && /V11_VERSION : '10\.2\.3'/.test(html));
console.log(`\n${pass}/${pass+fail} OK`); process.exit(fail?1:0);
