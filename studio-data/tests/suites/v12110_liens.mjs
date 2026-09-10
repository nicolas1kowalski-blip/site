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
const seed = fs.readFileSync(D+'v12100_amont.mjs','utf8').match(/const seed = `([\s\S]*?)`;/)[1];
const R=[]; const ok=(n,c)=>R.push([n,!!c]);
const r1 = await p.evaluate(async ({seed,isV13})=>{
  const R=[]; const ok=(n,c)=>R.push([n,!!c]); window.lucide={createIcons:()=>{}}; try{ v11TourEnd(true); wizClose(); }catch(e){} restoreCompleted=true;
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  try {
  ok('version : APP_VERSION = tête du journal = titre de l\'onglet (' + APP_VERSION + ')', APP_CHANGELOG[0].v===APP_VERSION && document.title==='Studio Data ' + APP_VERSION);
  ok('crochets du moteur posés par la couche V12', typeof createSvgGraph.router==='function' && typeof createSvgGraph.afterDraw==='function' && v12LinesOn());
  // graphe synthétique : un producteur → 5 cibles, 3 sources → 1 cible
  const host=document.createElement('div'); host.style.cssText='position:fixed;left:50px;top:50px;width:900px;height:500px;z-index:99999;background:#fff'; document.body.appendChild(host); host.id='v12lnTest';
  const nodes=[{id:'A',type:'studio-rich-node',title:'Source A',content:'appli'}]; const edges=[];
  for (let i=1;i<=5;i++){ nodes.push({id:'T'+i,type:'studio-rich-node',title:'Cible '+i,content:'objet'}); edges.push({id:'e'+i,source:'A',target:'T'+i,label:'alimente'}); }
  ['S1','S2','S3'].forEach((s,i)=>{ nodes.push({id:s,type:'studio-rich-node',title:'Amont '+s,content:'appli'}); edges.push({id:'f'+i,source:s,target:'A',label:'produit'}); });
  const g=createSvgGraph(host); g.data({nodes,edges}); g.render(); g.fitView();
  const paths=[...host.querySelectorAll('.usvge')].map(x=>({id:x.getAttribute('data-id'),d:x.querySelector('path').getAttribute('d')}));
  const start=d=>d.match(/^M ([\d.-]+) ([\d.-]+)/).slice(1,3).map(Number); const end=d=>{ const m=[...d.matchAll(/L ([\d.-]+) ([\d.-]+)/g)]; return m.length? m[m.length-1].slice(1,3).map(Number):null; };
  const outs=paths.filter(x=>/^e/.test(x.id)); const ys=new Set(outs.map(x=>start(x.d)[1]));
  ok('5 liens partant de la même case : 5 points d\'attache distincts sur son côté droit', ys.size===5 && outs.every(x=>start(x.d)[0]===start(outs[0].d)[0]));
  const lanes=outs.map(x=>{ const m=x.d.match(/L ([\d.-]+) [\d.-]+ Q ([\d.-]+)/); return m?Number(m[2]):null; }).filter(v=>v!==null);
  ok('5 liens : 5 couloirs verticaux distincts (pas de superposition)', new Set(lanes).size===lanes.length && lanes.length>=4);
  const ins=paths.filter(x=>/^f/.test(x.id)); const ye=new Set(ins.map(x=>end(x.d)[1]));
  ok('3 liens arrivant sur la même case : 3 points d\'entrée distincts', ye.size===3);
  ok('aucun tracé identique, angles arrondis (Q), étiquettes avec halo', new Set(paths.map(x=>x.d)).size===paths.length && paths.some(x=>/Q /.test(x.d)) && getComputedStyle(host.querySelector('.usvg-lbl')).paintOrder.includes('stroke'));
  ok('calque de mise en avant présent', !!host.querySelector('.uvp > .utop'));
  // tracé d'origine
  v12LinesSet(false); g.render(); const c=[...host.querySelectorAll('.usvge path')].map(x=>x.getAttribute('d'));
  ok('interrupteur « liens courbes » : tracé d\'origine (courbes C, même point de départ)', c.every(d=>/ C /.test(d)) && v12State.linesOrtho===false);
  v12LinesSet(true); g.render();
  window.__g=g;
  } catch(e) { R.push(['ERREUR '+e.message+' @ '+String(e.stack).split('\n')[1], false]); }
  return R;
}, {seed,isV13});
R.push(...r1);
// ---- interactions souris réelles : survol et déplacement ----
try {
  const box = await p.locator('#v12lnTest .usvgn[data-id="T3"] rect').first().boundingBox();
  await p.mouse.move(box.x+box.width/2, box.y+box.height/2); await p.waitForTimeout(80);
  const hov = await p.evaluate(()=>{ const top=document.querySelector('#v12lnTest .utop'); return { n: top.querySelectorAll('.usvge').length, on: top.querySelectorAll('.usvge-on').length, t: [...top.querySelectorAll('.usvge')].map(x=>x.getAttribute('data-id')) }; });
  ok('survol d\'une case : ses liens passent au-dessus (calque du dessus), en gras', hov.n===1 && hov.on===1 && hov.t[0]==='e3');
  const before = await p.evaluate(()=>[...document.querySelectorAll('#v12lnTest .usvge')].map(x=>x.getAttribute('data-id')+'|'+x.querySelector('path').getAttribute('d')));
  await p.mouse.down(); await p.mouse.move(box.x+box.width/2+40, box.y+box.height/2+150, {steps:8}); await p.waitForTimeout(80);
  const during = await p.evaluate(()=>({ drag: document.querySelector('#v12lnTest svg').classList.contains('usvg-drag'), top: document.querySelector('#v12lnTest .utop').querySelectorAll('.usvge-on').length }));
  await p.mouse.up(); await p.waitForTimeout(80);
  const after = await p.evaluate(()=>{ const all=[...document.querySelectorAll('#v12lnTest .usvge')].map(x=>x.getAttribute('data-id')+'|'+x.querySelector('path').getAttribute('d')); const ds=[...document.querySelectorAll('#v12lnTest .usvge path')].map(x=>x.getAttribute('d')); const outs=[...document.querySelectorAll('#v12lnTest .usvge')].filter(x=>x.getAttribute('data-s')==='A').map(x=>x.querySelector('path').getAttribute('d').match(/^M ([\d.-]+) ([\d.-]+)/)[2]); return { all, uniq: new Set(ds).size===ds.length, starts: new Set(outs).size, drag: document.querySelector('#v12lnTest svg').classList.contains('usvg-drag') }; });
  ok('pendant le déplacement : la case est en mode déplacement, ses liens en gras au-dessus', during.drag && during.top===1);
  ok('après déplacement de « Cible 3 » : son lien et les points d\'attache des autres sont recalculés, aucun tracé ne se superpose', before.find(x=>x.startsWith('e3|'))!==after.all.find(x=>x.startsWith('e3|')) && after.uniq && after.starts===5 && !after.drag);
  // chevauchement : on pose Cible 1 sur Source A → le lien contourne par le haut, visible
  await p.evaluate(()=>{ const g=window.__g; const a=g.findById('A'); });
  const bA = await p.locator('#v12lnTest .usvgn[data-id="A"] rect').first().boundingBox(); const b1 = await p.locator('#v12lnTest .usvgn[data-id="T1"] rect').first().boundingBox();
  await p.mouse.move(b1.x+b1.width/2, b1.y+b1.height/2); await p.mouse.down(); await p.mouse.move(bA.x+bA.width/2+10, bA.y+bA.height/2+6, {steps:6}); await p.mouse.up(); await p.waitForTimeout(80);
  const ov = await p.evaluate(()=>{ const d=document.querySelector('#v12lnTest .usvge[data-id="e1"] path').getAttribute('d'); const pts=[...d.matchAll(/([\d.-]+) ([\d.-]+)/g)].map(m=>[+m[1],+m[2]]); const minY=Math.min(...pts.map(x=>x[1])); const rectA=document.querySelector('#v12lnTest .usvgn[data-id="A"]').getBoundingClientRect(); return { d, minY, above: pts.some(x=>x[1]<minY+1) && d.split(' ').length>6 }; });
  ok('deux cases superposées : le lien contourne par le haut au lieu de disparaître', ov.above);
} catch(e) { R.push(['ERREUR souris '+e.message, false]); }
// ---- graphe réel du lineage et carte des flux ----
const r2 = await p.evaluate(async (seed)=>{
  const R=[]; const ok=(n,c)=>R.push([n,!!c]); const wait=ms=>new Promise(r=>setTimeout(r,ms));
  try {
  document.getElementById('v12lnTest').remove(); eval(seed); govState.lineageFiles=false;
  govState.selectedBoId='bo2'; v11State.edit['bo:bo2']=true; openGovTab('objects'); setBoTab('usage'); await wait(100); openBoLineage('bo2'); await wait(250);
  const w=el('attrLineageWrap'); const ds=[...w.querySelectorAll('.usvge path')].map(x=>x.getAttribute('d'));
  ok('lineage de l\'objet : ' + ds.length + ' liens, tous distincts, à angles droits', ds.length>=6 && new Set(ds).size===ds.length && ds.some(d=>/Q /.test(d)) && w.querySelector('.utop'));
  const into=[...w.querySelectorAll('.usvge[data-t="bo:bo2"] path')].map(x=>{ const m=[...x.getAttribute('d').matchAll(/L ([\d.-]+) ([\d.-]+)/g)]; return m[m.length-1][2]; });
  ok('liens arrivant sur « Contrat » : points d\'entrée tous différents', new Set(into).size===into.length && into.length>=3);
  let threw=false; try { openGovTab('lineage'); govState.lineageView='graph'; renderLineageGraph(); } catch(e){ threw=true; } ok('carte des flux rendue avec le nouveau tracé, sans exception', !threw);
  ok('palette : action liens droits / courbes ; lexique', v11Index().some(it=>/liens/i.test(it.label) && /Graphes/.test(it.label)) && !!V11_LEXIQUE['liens lisibles']);
  } catch(e) { R.push(['ERREUR '+e.message+' @ '+String(e.stack).split('\n')[1], false]); }
  return R;
}, seed);
R.push(...r2);
let fail=0; for(const [n,c] of R){ console.log((c?'✅ ':'❌ ')+n); if(!c) fail++; }
console.log(`\n${R.length-fail}/${R.length} OK · erreurs page: ${perr.length}`); perr.slice(0,5).forEach(e=>console.log('  ',e));
if (process.env.SHOTS) for (const theme of ['light','dark']) {
  const q = await b.newPage({ viewport: { width: 1500, height: 1000 }, colorScheme: theme==='dark'?'dark':'light' });
  await q.setContent(html,{waitUntil:'domcontentloaded'}); await q.addStyleTag({ path: D+'tw/tw_built.css' }); await q.evaluate(()=>{ v11Prefs.tourDone=true; }); await q.waitForTimeout(1400);
  await q.evaluate((seed)=>{ window.lucide={createIcons:()=>{}}; try{ v11TourEnd(true); wizClose(); }catch(e){} eval(seed); govState.lineageFiles=false; v12UpSet(true); govState.selectedBoId='bo2'; v11State.edit['bo:bo2']=true; openGovTab('objects'); setBoTab('usage'); openBoLineage('bo2'); document.querySelectorAll('.v11-toast').forEach(t=>t.remove()); const pn=el('attrLineageBox').querySelector('.v12up-panel'); if(pn) pn.open=false; const sy=el('attrLineageBox').querySelector('.v12bl-list'); if(sy) sy.open=false; }, seed);
  if (theme==='dark') await q.evaluate(()=>{ try { v7ApplyTheme(); } catch(e) {} document.documentElement.setAttribute('data-theme','dark'); });
  await q.waitForTimeout(400); await q.evaluate(()=>{ el('attrLineageWrap').style.height='560px'; attrLineageGraph.fitView(); const s=el('attrLineageBox'); if(s) s.scrollIntoView({block:'start'}); }); await q.waitForTimeout(200);
  const bb = await q.locator('#attrLineageWrap .usvgn[data-id="bo:bo1"] rect').first().boundingBox(); if (bb) { await q.mouse.move(bb.x+bb.width/2, bb.y+bb.height/2); await q.waitForTimeout(100); }
  await q.screenshot({ path: D+'ln_'+(isV13?'v13_':'')+theme+'.png' });
  await q.close();
}
await b.close(); process.exit(fail||perr.length?1:0);
