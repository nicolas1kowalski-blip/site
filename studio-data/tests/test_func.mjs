import pkg from '/opt/node22/lib/node_modules/playwright/index.js'; const { chromium } = pkg;
import fs from 'fs';
const html = fs.readFileSync(new URL('../StudioData.html', import.meta.url),'utf8')
  .replace(/<script src="https:[^"]*"[^>]*><\/script>/g,'')
  .replace(/<link[^>]*rel="stylesheet"[^>]*>/g,'');
const b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage();
let xssFired=false; await p.exposeFunction('__xss',()=>{xssFired=true;});
const csp=[]; p.on('console',m=>{ if(/Content Security Policy|Refused to/i.test(m.text())) csp.push(m.text()); });
const perr=[]; p.on('pageerror',e=>perr.push(String(e)));
await p.setContent(html,{waitUntil:'domcontentloaded'});
const out = await p.evaluate(async ()=>{
  const R=[]; const ok=(n,c)=>R.push([n,!!c]);
  window.lucide={createIcons:()=>{}};
  const XSS=`<img src=x onerror="window.__xss&&window.__xss()">PWN`;
  // --- Sécurité XSS ---
  showSuccess(`src "${XSS}"`); showError(`err ${XSS}`);
  ok('toast: pas de <img> injecté', !document.querySelector('#toastContainer img'));
  ok('erreur: pas de <img> injecté', !document.getElementById('globalErrorText').querySelector('img'));
  ok('toast: charge visible en texte', document.querySelector('#toastContainer span').textContent.includes('PWN'));
  state.tables['x']={id:'x',name:XSS,type:'csv',status:'ready',headers:[XSS,'OK'],config:{},columnsMeta:{}};
  renderTables();
  ok('cartes sources: pas de <img> injecté', !document.getElementById('tablesGrid').querySelector('img[src="x"]'));
  // --- CSP inline ---
  const d=document.createElement('button'); d.setAttribute('onclick','window.__ih=1'); document.body.appendChild(d); d.click();
  ok('CSP: gestionnaire onclick inline exécuté', window.__ih===1);
  // --- Navigation 2 niveaux ---
  switchTab(10); ok('Nav: onglet Tables (10) visible', !document.getElementById('step-10').classList.contains('hidden'));
  switchPhase('gov'); ok('Nav: phase Gouvernance → écran 9', !document.getElementById('step-9').classList.contains('hidden'));
  ok('Nav: sous-onglets gouvernance présents', document.querySelectorAll('#subTabNav button').length>=9);
  // --- No-persist ---
  const w=[]; const op=window.idbPut; window.idbPut=async(...a)=>{w.push(a[0]);};
  window.confirm=()=>true; // la purge du mode sans persistance exige désormais une confirmation
  await toggleNoPersist(true); persistAppState(); await persistTableData('x');
  ok('No-persist: aucune écriture locale', w.length===0 && state.noPersist===true);
  await toggleNoPersist(false); ok('No-persist: réactivation OK', state.noPersist===false);
  window.idbPut=op;
  // --- Filtres d'audit ET/OU (SQL) ---
  qualFilters.file=[{col:'A',op:'eq',val:'1',conn:'AND'},{col:'B',op:'contains',val:'x',conn:'OR'}];
  const w1=buildQualWhere('file');
  ok('Filtres audit: composition ET/OU', /\) OR /.test(w1) && w1.includes("'1'") && w1.includes("'%x%'"));
  qualFilters.file=[];
  // --- Table conçue : génération SQL ---
  state.tables['sA']={id:'sA',name:'SA',type:'csv',status:'ready',headers:['CD','LB'],config:{},columnsMeta:{}};
  state.tables['sB']={id:'sB',name:'SB',type:'csv',status:'ready',headers:['CODE','LIB'],config:{},columnsMeta:{}};
  tdNewDesign(); tdSetName('T'); tdAddSource('SA');
  tdRenameAttr(0,'Code'); tdRenameAttr(1,'Libellé'); tdAddSource('SB');
  tdSetMap(1,0,'CODE'); tdSetMap(1,1,'LIB'); tdToggleKey(0);
  tdSetFormat(0,'code');
  const sql=tdBuildSql(tdState.editing);
  ok('Table conçue: UNION des 2 sources', /UNION ALL/.test(sql));
  ok('Table conçue: SOURCE_ORIGINE tracé', sql.includes('SOURCE_ORIGINE'));
  ok('Table conçue: dédoublonnage par clé (QUALIFY)', /QUALIFY row_number/.test(sql));
  ok('Table conçue: normalisation format code (UPPER)', /UPPER\(TRIM/.test(sql));
  window.__covSql=null;
  // --- Analyse de couverture : génération SQL ---
  state.tables['t1']={id:'t1',name:'EQ',type:'csv',status:'ready',headers:['ID','NAT','ST','SITE'],config:{},columnsMeta:{}};
  state.tables['t2']={id:'t2',name:'SITES',type:'csv',status:'ready',headers:['SITE','NOM'],config:{},columnsMeta:{}};
  state.tables['t3']={id:'t3',name:'CTRL',type:'csv',status:'ready',headers:['ID','TYPE'],config:{},columnsMeta:{}};
  state.relations.push({id:'r1',sourceTable:'t1',sourceCol:'SITE',targetTable:'t2',targetCol:'SITE'});
  state.relations.push({id:'r2',sourceTable:'t1',sourceCol:'ID',targetTable:'t3',targetCol:'ID'});
  switchTab(4);
  el('covBase').value='t1'; covBaseChanged();
  el('covDimTable').value='t2'; covDimTableChanged(); el('covDimCol').value='NOM';
  el('covRel').value='t3';
  covFilters.base=[{col:'NAT',op:'eq',val:'A',conn:'AND'}]; covFilters.rel=[{col:'TYPE',op:'eq',val:'X',conn:'OR'}];
  const origDB=window.__duckdbPromise;
  window.__duckdbPromise=Promise.resolve({db:{},conn:{query:async(s)=>{window.__covSql=window.__covSql||s;const rows=[{dim:'Paris',total:5n,avec:3n}];return{schema:{fields:[]},numRows:1,toArray:()=>rows,[Symbol.iterator]:function*(){for(const r of rows)yield r;}};}}});
  await runCoverageAnalysis(null);
  ok('Couverture: résultat affiché', !document.getElementById('covResult').classList.contains('hidden'));
  ok('Couverture: SQL avec population + présence liée', /WITH b AS/.test(window.__covSql||'') && /IN \(SELECT k FROM e\)/.test(window.__covSql||''));
  return { R, covSql: window.__covSql };
});
await p.waitForTimeout(250);
let pass=0,fail=0;
out.R.forEach(([n,c])=>{ c?pass++:fail++; console.log(`${c?'✅':'❌'} ${n}`); });
console.log(`✅ XSS onerror jamais exécuté (global): ${!xssFired}`); xssFired?fail++:pass++;
console.log(`✅ Aucune violation CSP inattendue: ${csp.length===0}`); csp.length?fail++:pass++;
const pe=perr.filter(e=>!/lucide|Chart|XLSX|G6|duckdb|__duckdb/i.test(e));
console.log(`✅ Aucune erreur JS de page: ${pe.length===0}`); pe.length?fail++:pass++;
if(pe.length) console.log('   ', pe);
fs.writeFileSync('/tmp/_cov_final.sql', out.covSql||'');
console.log(`\nFONCTIONNEL : ${pass} réussis / ${fail} échoués`);
await b.close(); process.exit(fail?1:0);
