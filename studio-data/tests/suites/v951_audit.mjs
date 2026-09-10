import fs from 'fs';
// Chemins : racine studio-data et dossier des suites (surchargeables par l'environnement, voir tests/run.mjs)
const ROOT = process.env.SD_ROOT || new URL('../../', import.meta.url).pathname;
const D = new URL('./', import.meta.url).pathname;
const { chromium } = (await import(process.env.PLAYWRIGHT_INDEX || '/opt/node22/lib/node_modules/playwright/index.js')).default;
const CHROMIUM = process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const html = fs.readFileSync(process.env.SD_FILE||ROOT + 'StudioDataV7.html','utf8').replace(/<script src="https:[^"]*"[^>]*><\/script>/g,'').replace(/<link[^>]*rel="stylesheet"[^>]*>/g,'');
const b = await chromium.launch({ executablePath: CHROMIUM });
const p = await b.newPage({ viewport: { width: 1600, height: 950 } }); const perr=[]; p.on('pageerror',e=>{ if(!/lucide/.test(String(e))) perr.push(String(e)); });
await p.setContent(html,{waitUntil:'domcontentloaded'}); await p.addStyleTag({ path: D+'tw/tw_built.css' });
const out = await p.evaluate(async ()=>{
  const R=[]; const ok=(n,c)=>R.push([n,!!c]);
  window.lucide={createIcons:()=>{}};
  ok('version : APP_VERSION = tête du journal = titre de l\'onglet (' + APP_VERSION + ')', APP_CHANGELOG[0].v===APP_VERSION && document.title==='Studio Data ' + APP_VERSION);
  const a=document.getElementById('qualAlertsDet'), i=document.getElementById('qualInspDet');
  ok('Alertes sémantiques repliée par défaut', a && !a.open);
  ok('Inspecteur d\'anomalies replié par défaut', i && !i.open);
  ok('les autres sections du profilage restent ouvertes', [...document.querySelectorAll('#qual-sub-profiling details')].filter(d=>d.open).length>=1);
  // rendu d'un rapport de profilage synthétique -> compteurs
  state.tables['t1']={id:'t1',name:'T',type:'csv',status:'ready',headers:['A','B'],config:{},columnsMeta:{}};
  const stats={tableName:'T',totalRows:100,emptyRows:0,duplicateRows:0,funcDupCols:[],funcDuplicateRows:0,filledCells:180,columns:{
    A:{name:'A',nullCount:40,numNum:0,numDate:0,numEmail:0,numPhone:0,semanticType:'Texte',physicalType:'string',completeness:60,distinctCount:5,hasMoreDistinct:false,minLen:1,maxLen:5,avgLen:3,mean:0,stdDev:0,min:null,max:null,sum:0,spaceIssues:3,multiSpace:0,placeholders:2,caseDupGroups:1,outliers:0,outliersIqr:0,p05:null,p25:null,median:null,p75:null,p95:null,cardinalityRatio:0.05,frequentValues:[],patterns:[]},
    B:{name:'B',nullCount:0,numNum:0,numDate:0,numEmail:0,numPhone:0,semanticType:'Texte',physicalType:'string',completeness:100,distinctCount:100,hasMoreDistinct:false,minLen:1,maxLen:5,avgLen:3,mean:0,stdDev:0,min:null,max:null,sum:0,spaceIssues:0,multiSpace:0,placeholders:0,caseDupGroups:0,outliers:0,outliersIqr:0,p05:null,p25:null,median:null,p75:null,p95:null,cardinalityRatio:1,frequentValues:[],patterns:[]}}};
  let err='';
  try { currentProfilingStats=stats; currentProfilingTableId='t1'; renderProfilingReport(stats); } catch(e){ err=String(e)+' @ '+String(e.stack).split('\n').slice(1,3).join(' ; '); }
  try { renderQualAnomalyInspector(stats,'t1'); } catch(e){ err+=' | '+String(e); }
  const ac=document.getElementById('qualAlertsCount'), ic=document.getElementById('qualInspCount');
  ok('compteur des alertes renseigné ('+(ac?ac.textContent:'?')+')', ac && /alerte\(s\)|aucune/.test(ac.textContent));
  ok('compteur de l\'inspecteur renseigné ('+(ic?ic.textContent:'?')+')', ic && /\d+ anomalie\(s\)/.test(ic.textContent));
  ok('rendu sans erreur ('+err.slice(0,160)+')', !err);
  ok('toujours repliées après le rendu', !a.open && !i.open);
  a.open=true; ok('un clic déplie (contenu présent)', a.open && document.getElementById('profilingAlerts').innerHTML.length>10);
  toggleQualSections(null); const after=[...document.querySelectorAll('#qual-sub-profiling details')];
  ok('« Tout replier » ferme tout', after.every(d=>!d.open));
  toggleQualSections(null);
  ok('« Tout déplier » ouvre tout, inspecteur compris', after.every(d=>d.open));
  return R;
});
let fail=0; for(const [n,c] of out){ console.log((c?'✅ ':'❌ ')+n); if(!c) fail++; }
console.log(`\n${out.length-fail}/${out.length} OK · erreurs page: ${perr.length}`); perr.slice(0,3).forEach(e=>console.log('  ',e));
await b.close(); process.exit(fail||perr.length?1:0);
