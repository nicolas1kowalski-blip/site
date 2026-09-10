import fs from 'fs';
// Chemins : racine studio-data et dossier des suites (surchargeables par l'environnement, voir tests/run.mjs)
const ROOT = process.env.SD_ROOT || new URL('../../', import.meta.url).pathname;
const D = new URL('./', import.meta.url).pathname;
const { chromium } = (await import(process.env.PLAYWRIGHT_INDEX || '/opt/node22/lib/node_modules/playwright/index.js')).default;
const CHROMIUM = process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const html = fs.readFileSync(process.env.SD_FILE||ROOT + 'StudioDataV12.html','utf8').replace(/<script src="https:[^"]*"[^>]*><\/script>/g,'').replace(/<link[^>]*rel="stylesheet"[^>]*>/g,'');
const b = await chromium.launch({ executablePath: CHROMIUM });
const p = await b.newPage({ viewport: { width: 1500, height: 950 } });
const perr=[]; p.on('pageerror',e=>{ if(!/lucide/.test(String(e))) perr.push(String(e)); });
await p.setContent(html,{waitUntil:'domcontentloaded'}); await p.addStyleTag({ path: D+'tw/tw_built.css' });
await p.evaluate(()=>{ v11Prefs.tourDone=true; }); await p.waitForTimeout(1500);
const out = await p.evaluate(async ()=>{
  const R=[]; const ok=(n,c)=>R.push([n,!!c]); window.lucide={createIcons:()=>{}}; try{ v11TourEnd(true); wizClose(); }catch(e){} restoreCompleted=true;
  const vis=n=>!!n && getComputedStyle(n).display!=='none'; const M=()=>el('v11Modal'); const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const mk=(id,name,kind,origin)=>v12TmpRegister({id,name,type:'extraction',headers:['ID','NOM','VILLE'],rows:3,size:3,sampleData:[],tmpKind:kind,origin,originFrom:['CLIENTS']});
  try {
  ok('version : APP_VERSION = tête du journal = titre de l\'onglet (' + APP_VERSION + ')', APP_CHANGELOG[0].v===APP_VERSION && document.title==='Studio Data ' + APP_VERSION);
  ok('bouton ⏳ Jeux en haut, sans compteur', el('v12TmpBtn') && /Jeux/.test(el('v12TmpBtn').textContent) && !el('v12TmpBtn').querySelector('.n'));
  // sans aucune source : un jeu temporaire suffit aux écrans de données
  const t0 = mk('tmp_a','Extraction CLIENTS','extract','extraction de CLIENTS · 3 colonnes · 1 filtre');
  ok('jeu enregistré : lisible par id, invisible à l\'énumération', state.tables['tmp_a']===t0 && t0.temp && !Object.keys(state.tables).includes('tmp_a') && v12TmpList().length===1);
  ok('compteur 1 sur le bouton', el('v12TmpBtn').querySelector('.n') && el('v12TmpBtn').querySelector('.n').textContent==='1');
  switchTab(8); await wait(150);
  ok('Qualité sans source : pas de bandeau « Aucune source », le jeu est dans le sélecteur (groupe ⏳)', !el('step-8').querySelector('.v12-band.info') && el('qualTable').querySelector('optgroup.v12-tmpgrp option[value="tmp_a"]'));
  ok('persistance : la configuration sauvegardée ne mentionne pas le jeu', !JSON.stringify(collectPersistedConfig()).includes('Extraction CLIENTS'));
  // avec des sources
  state.tables['t1']={id:'t1',name:'CLIENTS',type:'csv',status:'ready',headers:['ID','NOM','EMAIL','VILLE'],config:{},columnsMeta:{},theme:'Finance'};
  state.tables['t2']={id:'t2',name:'FACTURES',type:'xlsx',status:'ready',headers:['NUM','ID_CLIENT','MONTANT'],config:{},columnsMeta:{}};
  renderTables(); switchTab(1); await wait(150);
  ok('Sources : le jeu n\'apparaît pas dans la liste des sources', !el('tablesGrid').textContent.includes('Extraction CLIENTS') && el('tablesGrid').textContent.includes('CLIENTS'));
  ok('recherche Ctrl+K : action « Jeux temporaires » et le jeu lui-même, mais pas comme source', v11Index().some(i=>/Jeux temporaires/.test(i.label)) && v11Index().some(i=>i.label==='Jeu temporaire : Extraction CLIENTS') && !v11Index().some(i=>i.label==='Extraction CLIENTS'));
  switchTab(7); await wait(150);
  ok('Comparer : « Fichier extérieur… » sous A et B ; le jeu dans les deux sélecteurs, après les sources', el('step-7').querySelectorAll('.v12t-ext').length===2 && el('compTableA').querySelector('optgroup.v12-tmpgrp option[value="tmp_a"]') && el('compTableB').querySelector('optgroup.v12-tmpgrp option[value="tmp_a"]') && el('compTableA').querySelector('option[value="t1"]'));
  ok('libellé du groupe et préfixe ⏳ sur l\'option', /Jeux temporaires/.test(el('compTableA').querySelector('optgroup.v12-tmpgrp').label) && /⏳ Extraction CLIENTS/.test(el('compTableA').querySelector('option[value="tmp_a"]').textContent));
  const t1 = mk('tmp_b','Fichier partenaire','file','fichier déposé, non ajouté aux sources'); await wait(150);
  ok('second jeu : groupe mis à jour dans les sélecteurs déjà rendus', el('compTableA').querySelectorAll('optgroup.v12-tmpgrp option').length===2);
  v12TmpUse('tmp_a','comp'); ok('Utiliser dans Comparer : côté A = le jeu', currentTab===7 && el('compTableA').value==='tmp_a');
  v12TmpUse('tmp_b','comp'); ok('second « Utiliser dans Comparer » : côté B = l\'autre jeu, A conservé', el('compTableA').value==='tmp_a' && el('compTableB').value==='tmp_b');
  v12TmpUse('tmp_a','audit'); ok('Utiliser dans Qualité : table sélectionnée', currentTab===8 && el('qualTable').value==='tmp_a');
  v12TmpUse('tmp_a','stats'); ok('Utiliser dans Statistiques', currentTab===4 && el('vizBaseTable').value==='tmp_a');
  v12TmpUse('tmp_a','explore'); ok('Utiliser dans Explorer', currentTab===6 && el('browserTableSelect').value==='tmp_a');
  v12TmpUse('tmp_a','extract'); await wait(100); ok('Utiliser dans Extraire : table de départ = le jeu, colonnes du jeu proposées', currentTab===3 && el('baseTableSelect').value==='tmp_a' && state.advExtract.baseId==='tmp_a' && el('adv-col-tbl') && el('adv-col-tbl').value==='tmp_a');
  ok('Extraire : bouton « Garder comme jeu temporaire » dans le panneau Résultat', el('v12TmpExtractBtn') && el('v12x').querySelector('.v12x-side').contains(el('v12TmpExtractBtn')));
  let threw=false; try { await v12TmpFromExtract(); } catch(e){ threw=true; } ok('Garder sans moteur : message d\'erreur, pas d\'exception', !threw);
  // panneau
  v12TmpOpen(); ok('panneau : 2 jeux, nom modifiable, origine, « Utiliser dans » ×5, CSV, Promouvoir, ✕', M() && M().classList.contains('v12t-modal') && el('v12TmpList').querySelectorAll('.v12t-row').length===2 && el('v12TmpList').querySelector('.v12t-name').value==='Extraction CLIENTS' && /extraction de CLIENTS/.test(el('v12TmpList').textContent) && el('v12TmpList').querySelector('.v12t-row').querySelectorAll('.v12t-use button').length===5 && /Promouvoir/.test(el('v12TmpList').textContent));
  ok('panneau : bouton « Ajouter un fichier extérieur »', /Ajouter un fichier extérieur/.test(M().textContent));
  v12TmpRename('tmp_b','Partenaire septembre'); await wait(150);
  ok('renommer : nom mis à jour dans le panneau et dans les sélecteurs', state.tables['tmp_b'].name==='Partenaire septembre' && Array.from(el('v12TmpList').querySelectorAll('.v12t-name')).some(i=>i.value==='Partenaire septembre') && /Partenaire septembre/.test(el('compTableB').querySelector('option[value="tmp_b"]').textContent));
  v12TmpRename('tmp_b','Extraction CLIENTS'); ok('renommer avec un nom déjà pris : suffixe (2)', state.tables['tmp_b'].name==='Extraction CLIENTS (2)');
  // promotion
  window.prompt=()=>'Clients filtrés'; await v12TmpPromote('tmp_a'); await wait(150);
  ok('promotion : devient une source (énumérable), lineage renseigné, plus dans les jeux, visible dans Sources', Object.keys(state.tables).includes('tmp_a') && !state.tables['tmp_a'].temp && state.tables['tmp_a'].name==='Clients filtrés' && state.governance.lineage['Clients filtrés'] && state.governance.lineage['Clients filtrés'].from.includes('CLIENTS') && v12TmpList().length===1 && el('tablesGrid').textContent.includes('Clients filtrés'));
  ok('après promotion : option ordinaire dans les sélecteurs, plus dans le groupe ⏳', el('compTableA').querySelector('option[value="tmp_a"]') && !el('compTableA').querySelector('optgroup.v12-tmpgrp option[value="tmp_a"]'));
  // suppression
  window.confirm=()=>true; await v12TmpDelete('tmp_b'); await wait(100);
  ok('suppression : jeu retiré de l\'état et des sélecteurs, compteur effacé', !state.tables['tmp_b'] && !document.querySelector('option[value="tmp_b"]') && v12TmpList().length===0 && !el('v12TmpBtn').querySelector('.n'));
  v11ModalClose();
  // Comparer : résultat gardé
  v12State.cmpRunning=true; await duckDropTable('cmp_zz'); v12State.cmpRunning=false;
  ok('pendant une comparaison, le rapport n\'est pas détruit : identifiant conservé', v12State.cmpKeep==='cmp_zz');
  switchTab(7); el('compSummary').innerHTML='<div>Comparaison terminée</div>'; v12TmpCompareResult();
  ok('après comparaison : « garder les écarts seulement / tout le rapport »', el('v12TmpCmpBar') && el('v12TmpCmpBar').querySelectorAll('button').length===2 && /écarts seulement/.test(el('v12TmpCmpBar').textContent));
  // Qualité : bouton Garder sur les anomalies
  ok('inspecteur d\'anomalies : bouton ⏳ Garder ajouté à Voir / CSV', /⏳ Garder/.test(qualInspectButtons(0)) && /👁 Voir/.test(qualInspectButtons(0)));
  // fichier extérieur
  v12TmpFileOpen(); ok('fenêtre Fichier extérieur : dépôt + collage', M() && el('v12tDrop') && el('v12tPaste'));
  el('v12tPaste').value='REF;MONTANT\nA1;10\nA2;20'; v12TmpPasteChanged();
  ok('aperçu : 2 lignes, 2 colonnes, nom modifiable, bouton Garder', /2 ligne/.test(el('v12tBody').textContent) && el('v12tName') && el('v12tBody').querySelectorAll('tbody tr').length===2 && /Garder comme jeu temporaire/.test(el('v12tBody').textContent));
  threw=false; try { await v12TmpFileConfirm(); } catch(e){ threw=true; } ok('Garder sans moteur : erreur affichée, pas d\'exception, fenêtre fermée', !threw && !M());
  ok('lexique : jeu temporaire', !!V11_LEXIQUE['jeu temporaire']);
  } catch(e) { R.push(['ERREUR '+e.message+' @ '+String(e.stack).split('\n')[1], false]); }
  return R;
});
let fail=0; for(const [n,c] of out){ console.log((c?'✅ ':'❌ ')+n); if(!c) fail++; }
console.log(`\n${out.length-fail}/${out.length} OK · erreurs page: ${perr.length}`); perr.slice(0,5).forEach(e=>console.log('  ',e));
for (const theme of ['light','dark']) {
  const q = await b.newPage({ viewport: { width: 1500, height: 950 }, colorScheme: theme==='dark'?'dark':'light' });
  await q.setContent(html,{waitUntil:'domcontentloaded'}); await q.addStyleTag({ path: D+'tw/tw_built.css' }); await q.evaluate(()=>{ v11Prefs.tourDone=true; }); await q.waitForTimeout(1400);
  await q.evaluate(()=>{ window.lucide={createIcons:()=>{}}; try{ v11TourEnd(true); wizClose(); }catch(e){}
    state.tables['t1']={id:'t1',name:'CLIENTS',type:'csv',status:'ready',headers:['ID','NOM','EMAIL','VILLE'],config:{},columnsMeta:{},theme:'Finance'}; state.tables['t2']={id:'t2',name:'FACTURES',type:'xlsx',status:'ready',headers:['NUM','ID_CLIENT','MONTANT'],config:{},columnsMeta:{}};
    renderTables();
    v12TmpRegister({id:'tmp_a',name:'Extraction CLIENTS Paris',type:'extraction',headers:['ID','NOM','VILLE'],rows:1198,size:1198,sampleData:[],tmpKind:'extract',origin:'extraction de CLIENTS · 3 colonnes · 1 filtre · liste clients_partenaire.xlsx',originFrom:['CLIENTS']});
    v12TmpRegister({id:'tmp_b',name:'clients_partenaire',type:'extraction',headers:['ID','SEGMENT','COMMENTAIRE'],rows:1240,size:1240,sampleData:[],tmpKind:'file',origin:'fichier déposé, non ajouté aux sources',originFrom:[]});
    v12TmpRegister({id:'tmp_c',name:'Écarts Extraction vs clients_partenaire',type:'extraction',headers:['ID','STATUT_LIGNE'],rows:42,size:42,sampleData:[],tmpKind:'compare',origin:'écarts de la comparaison Extraction CLIENTS Paris ↔ clients_partenaire',originFrom:['CLIENTS']});
    switchTab(7); document.querySelectorAll('.v11-toast').forEach(t=>t.remove()); });
  if (theme==='dark') await q.evaluate(()=>{ try { v7ApplyTheme(); } catch(e) {} document.documentElement.setAttribute('data-theme','dark'); });
  await q.waitForTimeout(300);
  await q.evaluate(()=>{ v12TmpUse('tmp_a','comp'); v12TmpUse('tmp_b','comp'); el('compSummary').innerHTML='<div class="text-xs text-slate-500 mb-3">Comparaison terminée.</div>'; v12TmpCompareResult(); });
  await q.waitForTimeout(300); await q.screenshot({ path: D+'t_comp_'+theme+'.png' });
  await q.evaluate(()=>{ v12TmpOpen(); }); await q.waitForTimeout(300); await q.screenshot({ path: D+'t_panel_'+theme+'.png' });
  await q.evaluate(()=>{ v11ModalClose(); v12TmpUse('tmp_a','extract'); v12State.xAddOpen=false; v12xShowAdd(); document.querySelectorAll('.v11-toast').forEach(t=>t.remove()); }); await q.waitForTimeout(300); await q.screenshot({ path: D+'t_extract_'+theme+'.png' });
  await q.close();
}
await b.close(); process.exit(fail||perr.length?1:0);
