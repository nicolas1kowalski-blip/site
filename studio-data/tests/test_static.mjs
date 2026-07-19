import fs from 'fs'; import crypto from 'crypto';
const H = fs.readFileSync(new URL('../StudioData.html', import.meta.url),'utf8');
let pass=0, fail=0; const R=[];
const ok=(n,c,d='')=>{ (c?pass++:fail++); R.push(`${c?'✅':'❌'} ${n}${d&&!c?' — '+d:''}`); };
// 1. plus de versions flottantes
ok('Aucune version CDN flottante (g6@4 / lucide@latest / chart.js nue)',
   !/@antv\/g6@4\/|lucide@latest|npm\/chart\.js"/.test(H));
// 2. SRI présents sur les 4 libs
for (const lib of ['xlsx@0.18.5','@antv/g6@4.8.24','chart.js@4.4.6','lucide@0.474.0']) {
  const re = new RegExp('src="[^"]*'+lib.replace(/[.*+?^${}()|[\]\\/]/g,'\\$&')+'[^"]*"[^>]*integrity="sha384-');
  ok('SRI présent pour '+lib, re.test(H));
}
// 3. crossorigin
ok('crossorigin=anonymous sur les libs SRI', (H.match(/crossorigin="anonymous"/g)||[]).length>=4);
// 4. CSP présente et directives clés
const csp = (H.match(/Content-Security-Policy" content="([^"]+)"/)||[])[1]||'';
ok('CSP présente', !!csp);
ok("CSP object-src 'none'", /object-src 'none'/.test(csp));
ok("CSP base-uri 'self'", /base-uri 'self'/.test(csp));
ok('CSP autorise WASM (wasm-unsafe-eval)', /wasm-unsafe-eval/.test(csp));
ok('CSP autorise workers blob', /worker-src blob:/.test(csp));
ok('CSP script-src limite à jsdelivr+tailwind', /script-src[^;]*cdn\.jsdelivr\.net[^;]*cdn\.tailwindcss\.com/.test(csp));
// 5. showError/showSuccess en textContent (pas innerHTML de msg)
ok('showError utilise textContent', /function showError\(msg\)\s*\{\s*el\('globalErrorText'\)\.textContent = msg/.test(H));
ok('showSuccess : msg via textContent', /querySelector\('span'\)\.textContent = msg/.test(H));
// 6. purge OPFS + no-persist
ok('wipeOpfsData supprime la base OPFS', /removeEntry\('studio_data\.db'|\['studio_data\.db'/.test(H) || /studio_data\.db.*removeEntry|removeEntry.*studio_data/.test(H));
ok('mode sans persistance gate persistAppState', /function persistAppState\(\)\s*\{\s*if \(state\.noPersist\) return/.test(H));
ok('mode sans persistance gate persistTableData', /persistTableData\(tId\)\s*\{\s*if \(state\.noPersist\) return/.test(H));
// 7. les octets servis = mes empreintes (revérif locale)
const files = {
 'xlsx@0.18.5':(process.env.SRI_DIR||'/tmp/sri/x')+'/xlsx-0.18.5/package/dist/xlsx.full.min.js',
 '@antv/g6@4.8.24':(process.env.SRI_DIR||'/tmp/sri/x')+'/antv-g6-4.8.24/package/dist/g6.min.js',
 'chart.js@4.4.6':(process.env.SRI_DIR||'/tmp/sri/x')+'/chart.js-4.4.6/package/dist/chart.umd.js',
 'lucide@0.474.0':(process.env.SRI_DIR||'/tmp/sri/x')+'/lucide-0.474.0/package/dist/umd/lucide.min.js',
};
for (const [lib,f] of Object.entries(files)) {
  try { const h='sha384-'+crypto.createHash('sha384').update(fs.readFileSync(f)).digest('base64');
    ok('Empreinte SRI recalculée cohérente ('+lib+')', H.includes(h)); }
  catch(e){ ok('Empreinte '+lib,false,'fichier npm absent'); }
}
console.log(R.join('\n'));
console.log(`\nSTATIQUE : ${pass} réussis / ${fail} échoués`);
process.exit(fail?1:0);
