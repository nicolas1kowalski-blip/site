import fs from 'fs';
// Chemins : racine studio-data et dossier des suites (surchargeables par l'environnement, voir tests/run.mjs)
const ROOT = process.env.SD_ROOT || new URL('../../', import.meta.url).pathname;
const D = new URL('./', import.meta.url).pathname;
const { chromium } = (await import(process.env.PLAYWRIGHT_INDEX || '/opt/node22/lib/node_modules/playwright/index.js')).default;
const CHROMIUM = process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const FILE = process.env.SD_FILE||ROOT + 'StudioDataV12.html'; const isV13=/V13/.test(FILE);
const html = fs.readFileSync(FILE,'utf8').replace(/<script src="https:[^"]*"[^>]*><\/script>/g,'').replace(/<link[^>]*rel="stylesheet"[^>]*>/g,'');
const b = await chromium.launch({ executablePath: CHROMIUM });
const p = await b.newPage({ viewport: { width: 1500, height: 950 } });
const perr=[]; p.on('pageerror',e=>{ if(!/lucide/.test(String(e))) perr.push(String(e)); });
await p.setContent(html,{waitUntil:'domcontentloaded'}); await p.addStyleTag({ path: D+'tw/tw_built.css' });
await p.evaluate(()=>{ v11Prefs.tourDone=true; }); await p.waitForTimeout(1500);
const seed = fs.readFileSync(D+'v12111_extract_fix.mjs','utf8').match(/const seed = `([\s\S]*?)`;/)[1];
const out = await p.evaluate(async ({seed,isV13})=>{
  const R=[]; const ok=(n,c)=>R.push([n,!!c]); window.lucide={createIcons:()=>{}}; try{ v11TourEnd(true); wizClose(); }catch(e){} restoreCompleted=true;
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  try {
  ok('version : APP_VERSION = tête du journal = titre de l\'onglet (' + APP_VERSION + ')', APP_CHANGELOG[0].v===APP_VERSION && document.title==='Studio Data ' + APP_VERSION);
  eval(seed); el('adv-col-col').value='NUM'; advAddColumn(); await wait(50);
  // faux moteur : la 1re requête « métier » échoue en voulant écrire un fichier temporaire ; après SET temp_directory='' elle réussit
  const log=[]; let noSpill=false; let failNext=true; let memLimit='';
  const fakeConn={ query: async sql => { log.push(sql); if (/SET temp_directory=''/.test(sql)) { noSpill=true; return {}; } if (/SET temp_directory='/.test(sql)) { noSpill=false; return {}; } if (/SET memory_limit='(\w+)'/.test(sql)) { memLimit=RegExp.$1; return {}; } if (/RESET memory_limit/.test(sql)) { memLimit=''; return {}; }
      if (failNext && !noSpill) { failNext=false; throw new Error('Invalid Error: HTML FileReaders do not support writing'); }
      const n=42; return { schema:{fields:[{name:'n'}]}, numRows:1, [Symbol.iterator]: function*(){ yield { n }; } }; } };
  window.__realGetDB = getDB; window.__fakeDB = { conn: fakeConn };
  // on remplace le moteur au niveau le plus bas (avant les enveloppes V12) : getDB de la couche 96 appelle _v12_getDB ; ici on substitue la fonction globale entière puis on remet
  const savedGetDB = getDB; getDB = async () => ({ conn: (v12State.noSpill > 0) ? v12ConnNoSpill(fakeConn) : fakeConn });
  const objs = typeof arrowResultToObjects === 'function';
  await advCount(); await wait(50);
  getDB = savedGetDB;
  ok('faux moteur : la 1re requête a échoué (fichier temporaire), la même requête a été relancée', log.filter(s=>/COUNT\(\*\)::BIGINT AS n/.test(s)).length===2);
  ok('entre les deux : mémoire relevée puis temp_directory désactivé, puis réglages restaurés', log.some(s=>/SET memory_limit='4GB'/.test(s)) && log.some(s=>/SET temp_directory=''/.test(s)) && memLimit==='' && log.findIndex(s=>/SET temp_directory=''/.test(s)) < log.map((s,i)=>/COUNT/.test(s)?i:-1).filter(i=>i>=0)[1]);
  ok('compteur affiché après le repli (42 lignes), aucune erreur à l\'écran', /42/.test(el('adv-count').textContent) && el('globalError').classList.contains('hidden'));
  // échec définitif : message en clair avec conseils
  const fake2={ query: async sql => { if (/^SET|^RESET/.test(sql)) return {}; throw new Error('Invalid Error: HTML FileReaders do not support writing'); } };
  getDB = async () => ({ conn: (v12State.noSpill > 0) ? v12ConnNoSpill(fake2) : fake2 });
  await advPreview(); await wait(50); getDB = savedGetDB;
  ok('échec même en mémoire pure : message d\'explication (500 lignes, filtre, colonnes transposées) au lieu du message brut', /trop volumineux pour la mémoire/.test(el('adv-preview').textContent) && /500 lignes/.test(el('adv-preview').textContent) && /FileReaders/.test(el('adv-preview').textContent));
  ok('hors des actions Extraire, le moteur n\'est pas enveloppé (compteur à zéro)', v12State.noSpill===0);
  // une erreur ordinaire n'est pas relancée
  let calls=0; const fake3={ query: async sql => { calls++; throw new Error('Binder Error: colonne inconnue'); } };
  getDB = async () => ({ conn: (v12State.noSpill > 0) ? v12ConnNoSpill(fake3) : fake3 }); await advCount(); await wait(30); getDB = savedGetDB;
  ok('erreur ordinaire : une seule tentative, message d\'origine', calls===1 && /Binder Error/.test(el('globalErrorText').textContent)); hideError();
  } catch(e) { R.push(['ERREUR '+e.message+' @ '+String(e.stack).split('\n')[1], false]); }
  return R;
}, {seed,isV13});
let fail=0; for(const [n,c] of out){ console.log((c?'✅ ':'❌ ')+n); if(!c) fail++; }
console.log(`\n${out.length-fail}/${out.length} OK · erreurs page: ${perr.length}`); perr.slice(0,5).forEach(e=>console.log('  ',e));
await b.close(); process.exit(fail||perr.length?1:0);
