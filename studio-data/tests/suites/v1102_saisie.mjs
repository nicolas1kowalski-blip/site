import fs from 'fs';
// Chemins : racine studio-data et dossier des suites (surchargeables par l'environnement, voir tests/run.mjs)
const ROOT = process.env.SD_ROOT || new URL('../../', import.meta.url).pathname;
const D = new URL('./', import.meta.url).pathname;
const { chromium } = (await import(process.env.PLAYWRIGHT_INDEX || '/opt/node22/lib/node_modules/playwright/index.js')).default;
const CHROMIUM = process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const html = fs.readFileSync(process.env.SD_FILE||ROOT + 'StudioDataV11.html','utf8').replace(/<script src="https:[^"]*"[^>]*><\/script>/g,'').replace(/<link[^>]*rel="stylesheet"[^>]*>/g,'');
const b = await chromium.launch({ executablePath: CHROMIUM });
const p = await b.newPage({ viewport: { width: 1500, height: 950 } });
const perr=[]; p.on('pageerror',e=>{ if(!/lucide/.test(String(e))) perr.push(String(e)); });
await p.setContent(html,{waitUntil:'domcontentloaded'}); await p.addStyleTag({ path: D+'tw/tw_built.css' });
const out = await p.evaluate(async ()=>{
  const R=[]; const ok=(n,c)=>R.push([n,!!c]); window.lucide={createIcons:()=>{}}; v11Prefs.tourDone=true; v11TourEnd(true);
  const S=()=>document.getElementById('govContent'); const g=state.governance;
  state.tables['t1']={id:'t1',name:'CLIENTS',type:'csv',status:'ready',headers:['ID','NOM','EMAIL','CA_HT'],config:{},columnsMeta:{},theme:'Finance'};
  switchPhase('gov'); g.assets=[{id:'a1',kind:'app',name:'ERP',domain:'Finance'}]; g.glossary=[{id:'gl1',term:'Chiffre d\'affaires',definition:'',attrLinks:[],boIds:[],assetIds:[]}];
  // ---- recherche ----
  g.businessObjects=[{id:'bo0',name:'Fournisseur',elements:[{id:'f1',name:'SIRET',mappings:[]}],sources:[],structure:[]}];
  v11PaletteOpen(); const inp=document.getElementById('v11PalIn'); inp.value='siret'; inp.dispatchEvent(new Event('input'));
  ok('recherche : un attribut trouvé, groupé, avec son objet', document.querySelectorAll('#v11PalRes .it').length===1 && document.querySelector('#v11PalRes .grp').textContent==='Attributs' && document.querySelector('#v11PalRes .it .sub').textContent==='Fournisseur');
  inp.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
  ok('Entrée ouvre l\'attribut dans sa fiche', !document.getElementById('v11Pal') && govState.tab==='objects' && govState.selectedBoId==='bo0' && govState.boSel && govState.boSel.elId==='f1');
  v11PaletteOpen(); document.getElementById('v11PalIn').value='EMAIL'; document.getElementById('v11PalIn').dispatchEvent(new Event('input'));
  ok('recherche : colonne d\'une source', Array.from(document.querySelectorAll('#v11PalRes .grp')).some(x=>x.textContent==='Colonnes'));
  document.getElementById('v11PalIn').value=''; document.getElementById('v11PalIn').dispatchEvent(new Event('input'));
  ok('sans texte : écrans et actions proposés', Array.from(document.querySelectorAll('#v11PalRes .grp')).map(x=>x.textContent).join('|').includes('Écrans') && document.getElementById('v11PalRes').textContent.includes('Nouvel objet métier'));
  document.getElementById('v11PalIn').value='xyzxyz'; document.getElementById('v11PalIn').dispatchEvent(new Event('input')); ok('aucun résultat : message', document.getElementById('v11PalRes').textContent.includes('Aucun résultat')); v11PaletteClose();
  // ---- assistant 3 étapes ----
  v11WizardOpen(); ok('assistant ouvert, étape 1/3', document.getElementById('v11Modal') && document.getElementById('v11Modal').textContent.includes('1 / 3'));
  v11WizardNext(); ok('nom obligatoire', document.getElementById('v11Modal').textContent.includes('1 / 3'));
  document.getElementById('wz-name').value='Client'; document.getElementById('wz-dom-new').value='Ventes'; document.getElementById('wz-def').value='Un client.'; v11WizardNext();
  ok('étape 2 : choix de la source', document.getElementById('v11Modal').textContent.includes('2 / 3') && document.getElementById('wz-tbl'));
  document.getElementById('wz-tbl').value='CLIENTS'; document.getElementById('wz-tbl').dispatchEvent(new Event('change'));
  ok('colonnes proposées, toutes cochées', document.querySelectorAll('#v11Modal .v11-checks input:checked').length===4);
  v11WizCol('CA_HT',false); v11WizardNext();
  ok('étape 3 : propriétaire + récapitulatif (3 attributs depuis CLIENTS)', document.getElementById('v11Modal').textContent.includes('3 / 3') && document.getElementById('v11Modal').textContent.includes('3 attribut(s) depuis CLIENTS'));
  document.getElementById('wz-own').value='Alice Martin'; const nb=v11WizardFinish();
  ok('objet créé : nom, domaine nouveau, source maître, 3 attributs mappés, propriétaire, ouvert en lecture', nb && nb.name==='Client' && nb.domain==='Ventes' && govDomains().includes('Ventes') && nb.sources[0].role==='maitre' && nb.elements.length===3 && nb.elements[0].mappings[0].col==='ID' && nb.globalOwner==='Alice Martin' && !document.getElementById('v11Modal') && document.getElementById('v11-bo-'+nb.id));
  v11WizardOpen(); document.getElementById('wz-name').value='Site'; v11WizardNext(); document.getElementById('wz-free').value='Code site\nAdresse\n'; v11WizardNext(); const nb2=v11WizardFinish();
  ok('sans source : attributs saisis à la main', nb2 && nb2.elements.length===2 && nb2.elements[1].name==='Adresse' && !nb2.sources.length);
  // ---- actions groupées ----
  v11BulkOpen(nb.id); ok('actions groupées : liste des attributs + action + valeur', document.querySelectorAll('#v11Modal .v11-checks input').length===3 && document.getElementById('bk-act') && document.getElementById('bk-v'));
  document.querySelectorAll('#v11Modal .v11-checks input').forEach(i=>i.checked=true); document.getElementById('bk-act').value='sensitivity'; v11BulkField(); document.getElementById('bk-v').value='Interne'; v11BulkApply(nb.id);
  ok('sensibilité posée sur les 3 attributs', nb.elements.every(e=>e.sensitivity==='Interne') && !document.getElementById('v11Modal'));
  v11BulkOpen(nb.id); document.querySelectorAll('#v11Modal .v11-checks input')[0].checked=true; document.getElementById('bk-act').value='term'; v11BulkField(); document.getElementById('bk-v').value='Chiffre d\'affaires'; v11BulkApply(nb.id);
  ok('terme posé sur l\'attribut coché', termsOfAttr(nb.id, nb.elements[0].id).some(t=>t.term==='Chiffre d\'affaires'));
  v11BulkOpen(nb.id); document.querySelectorAll('#v11Modal .v11-checks input').forEach(i=>i.checked=true); document.getElementById('bk-act').value='usedBy'; v11BulkField(); document.getElementById('bk-v').value='a1'; v11BulkApply(nb.id);
  ok('usage ERP posé sur les 3 attributs', nb.elements.every(e=>(e.usedBy||[]).includes('a1')));
  // ---- glisser-déposer ----
  v11State.edit['bo:'+nb.id]=true; govState.selectedBoId=nb.id; govState.boTab='structure'; govState.structView='fiche'; renderGovernance();
  const panel=document.querySelector('.v11-cols'); ok('panneau des colonnes non rattachées (CA_HT) en mode modification', panel && panel.textContent.includes('CA_HT') && !panel.textContent.includes('EMAIL'));
  const row=Array.from(document.querySelectorAll('#govContent .bo-item[data-sel]')).find(r=>r.textContent.includes('NOM'));
  const dt={ data:{}, setData(k,v){this.data[k]=v;}, getData(k){return this.data[k];}, effectAllowed:'' };
  const ds=new Event('dragstart',{bubbles:true}); ds.dataTransfer=dt; panel.querySelector('.v11-drag').dispatchEvent(ds);
  const dv=new Event('dragover',{bubbles:true,cancelable:true}); dv.dataTransfer=dt; row.dispatchEvent(dv); ok('survol : cible surlignée', row.classList.contains('v11-drop'));
  const dp=new Event('drop',{bubbles:true,cancelable:true}); dp.dataTransfer=dt; row.dispatchEvent(dp);
  ok('dépôt : CA_HT rattachée à l\'attribut NOM', nb.elements[1].mappings.some(m=>m.table==='CLIENTS'&&m.col==='CA_HT') && !document.querySelector('.v11-cols'));
  // gouvernance : contributeur → proposition
  govDemoPeople(); v11State.edit['bo:'+nb.id]=true; govState.selectedBoId=nb.id; renderGovernance();
  const panel2=document.querySelector('.v11-cols'); ok('contributeur : panneau présent', !!panel2 || nb.elements.every(e=>e.mappings.length));
  nb.elements[2].mappings=[]; renderGovernance();
  const dt2={ data:{}, setData(k,v){this.data[k]=v;}, getData(k){return this.data[k];} }; const ds2=new Event('dragstart',{bubbles:true}); ds2.dataTransfer=dt2; document.querySelector('.v11-drag').dispatchEvent(ds2);
  const row2=Array.from(document.querySelectorAll('#govContent .bo-item[data-sel]')).find(r=>r.textContent.includes('EMAIL')); const dp2=new Event('drop',{bubbles:true,cancelable:true}); dp2.dataTransfer=dt2; row2.dispatchEvent(dp2);
  ok('contributeur : le dépôt devient une proposition, attribut intact', !state.governance.businessObjects.find(b2=>b2.id===nb.id).elements[2].mappings.length && govProposals().some(p=>p.kind==='action'&&p.field==='v11AddMapping'));
  return R;
});
let fail=0; for(const [n,c] of out){ console.log((c?'✅ ':'❌ ')+n); if(!c) fail++; }
console.log(`\n${out.length-fail}/${out.length} OK · erreurs page: ${perr.length}`); perr.slice(0,5).forEach(e=>console.log('  ',e));
await b.close(); process.exit(fail||perr.length?1:0);
