import fs from 'fs';
// Chemins : racine studio-data et dossier des suites (surchargeables par l'environnement, voir tests/run.mjs)
const ROOT = process.env.SD_ROOT || new URL('../../', import.meta.url).pathname;
const D = new URL('./', import.meta.url).pathname;
const { chromium } = (await import(process.env.PLAYWRIGHT_INDEX || '/opt/node22/lib/node_modules/playwright/index.js')).default;
const CHROMIUM = process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const FILE = process.env.SD_FILE||ROOT + 'StudioDataV12.html';
const html = fs.readFileSync(FILE,'utf8').replace(/<script src="https:[^"]*"[^>]*><\/script>/g,'').replace(/<link[^>]*rel="stylesheet"[^>]*>/g,'');
const b = await chromium.launch({ executablePath: CHROMIUM });
const p = await b.newPage({ viewport: { width: 1500, height: 950 } });
const perr=[]; p.on('pageerror',e=>{ if(!/lucide/.test(String(e))) perr.push(String(e)); });
await p.setContent(html,{waitUntil:'domcontentloaded'}); await p.addStyleTag({ path: D+'tw/tw_built.css' });
await p.evaluate(()=>{ v11Prefs.tourDone=true; }); await p.waitForTimeout(1500);
const out = await p.evaluate(async (isV13)=>{
  const R=[]; const ok=(n,c)=>R.push([n,!!c]); window.lucide={createIcons:()=>{}}; try{ v11TourEnd(true); wizClose(); }catch(e){} restoreCompleted=true;
  const wait=ms=>new Promise(r=>setTimeout(r,ms)); const BO=id=>state.governance.businessObjects.find(b=>b.id===id);
  try {
  ok('version : APP_VERSION = tête du journal = titre de l\'onglet (' + APP_VERSION + ')', APP_CHANGELOG[0].v===APP_VERSION && document.title==='Studio Data ' + APP_VERSION);
  state.governance.assets=[{id:'app2',name:'Gestion des contrats',kind:'app',sources:['CONTRATS']},{id:'pr1',name:'Moteur de reporting',kind:'process'},{id:'rp1',name:'Rapport Solvabilité II',kind:'report',producedBy:['pr1'],deliveredTo:['app2'],recipients:'ACPR',frequency:'Trimestrielle',format:'Fichier réglementaire',boIds:[],description:'Rapport réglementaire trimestriel.'}];
  state.governance.businessObjects.push({id:'bo1',name:'Personne',definition:'',globalOwner:'',contributors:[],producedBy:[],sources:[],structure:[],elements:[{id:'e1',name:'Adresse',mappings:[],usedBy:[]}]},{id:'bo2',name:'Contrat',definition:'Engagement.',globalOwner:'Paul',contributors:[],producedBy:['app2'],sources:[],structure:[],elements:[{id:'e2',name:'Prime',definition:'Montant dû.',mappings:[],usedBy:['rp1']},{id:'e3',name:'Adresse de risque',definition:'',mappings:[],usedBy:[],origins:[{boId:'bo1',elId:'e1',kind:'copy',rule:''}]}]});
  // catalogue
  const ix=catBuildIndex(); const rep=ix.find(e=>e.type==='asset' && e.id==='rp1');
  ok('catalogue : la restitution a pour sous-titre « Restitution · trimestrielle · Fichier réglementaire »', rep && /^Restitution · trimestrielle · Fichier réglementaire$/.test(rep.sub));
  openGovTab('catalog'); await wait(150); catRes=catBuildIndex(); const i=catRes.findIndex(e=>e.type==='attr' && e.elId==='e3'); catOpenFiche(i); await wait(100);
  ok('fiche catalogue de « Adresse de risque » : section « Provient d\'un autre objet » avec Personne › Adresse (copie)', /Provient d'un autre objet/.test(el('uxDrawerBody').textContent) && /Personne › Adresse/.test(el('uxDrawerBody').textContent) && /copie/.test(el('uxDrawerBody').textContent));
  const j=catRes.findIndex(e=>e.type==='attr' && e.elId==='e1'); catOpenFiche(j); await wait(100);
  ok('fiche catalogue de « Adresse » : « Réutilisé par » Contrat › Adresse de risque', /Réutilisé par/.test(el('uxDrawerBody').textContent) && /Contrat › Adresse de risque/.test(el('uxDrawerBody').textContent));
  // export / import en masse
  const rows=giTemplateRows('assets'); ok('export en masse : type « restitution » pour le rapport, « processus » pour le moteur', rows.some(r=>r[0]==='Rapport Solvabilité II' && r[1]==='restitution') && rows.some(r=>r[0]==='Moteur de reporting' && r[1]==='processus'));
  giState={target:'assets',cols:['Nom','Type'],rows:[{Nom:'Tableau de bord ventes',Type:'restitution'}],map:{name:'Nom',kind:'Type'},fileName:'x.xlsx'}; giApply(null); await wait(50);
  const imp=state.governance.assets.find(a=>a.name==='Tableau de bord ventes'); ok('import en masse : une ligne « restitution » crée une restitution', imp && imp.kind==='report' && Array.isArray(imp.deliveredTo));
  // dossier de gouvernance
  let captured=null; const oldC=URL.createObjectURL; URL.createObjectURL=b=>{ captured=b; return 'blob:x'; }; const oldClick=HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click=function(){};
  exportGovernanceReport(); const txt=captured ? await captured.text() : ''; URL.createObjectURL=oldC; HTMLAnchorElement.prototype.click=oldClick;
  ok('dossier de gouvernance : section Restitutions (générée par Moteur, diffusée à Gestion des contrats, ACPR ; Contrat › Prime) et section origines (Personne › Adresse)', /Restitutions \(\d\)/.test(txt) && /Moteur de reporting/.test(txt) && /ACPR/.test(txt) && /Contrat › Prime/.test(txt) && /provenant d'un autre objet/.test(txt) && /Personne › Adresse/.test(txt));
  if (isV13) ok('V13 : le dossier utilise le vocabulaire métier (plus d\'« Attributs », des « Informations »)', /Information/.test(txt) && !/>Attributs</.test(txt));
  // Extraire avec des jeux temporaires seuls
  v12TmpRegister({id:'tmp_z',name:'Extraction test',type:'extraction',headers:['ID','NOM'],rows:2,size:2,sampleData:[],tmpKind:'extract',origin:''});
  ok('sans aucune source : le jeu reste invisible à l\'énumération', !Object.keys(state.tables).includes('tmp_z'));
  switchTab(3); await wait(150); v12TmpUse('tmp_z','extract'); await wait(150);
  ok('Extraire avec un jeu temporaire seul : plan de travail affiché, jeu en table de départ, colonnes proposées', el('v12x') && state.advExtract.baseId==='tmp_z' && el('adv-col-tbl') && el('adv-col-tbl').value==='tmp_z' && !/Chargez au moins une source/.test(el('advExtractBody').textContent));
  ok('après le rendu, le jeu est de nouveau non énumérable (sources, sauvegardes)', !Object.keys(state.tables).includes('tmp_z') && state.tables['tmp_z'].temp);
  if (isV13) {
    // impression avec vocabulaire
    const oldP=window.print; window.print=()=>{}; v11Print('bo','bo2'); await wait(120); window.print=oldP;
    ok('V13 : la fiche imprimée parle d\'informations, pas d\'attributs', el('v11PrintArea') && /Information/.test(el('v11PrintArea').textContent) && !/Attribut\b/.test(el('v11PrintArea').textContent.replace(/attribut métier/g,'')));
  }
  } catch(e) { R.push(['ERREUR '+e.message+' @ '+String(e.stack).split('\n')[1], false]); }
  return R;
}, /V13/.test(FILE));
let fail=0; for(const [n,c] of out){ console.log((c?'✅ ':'❌ ')+n); if(!c) fail++; }
console.log(`\n${out.length-fail}/${out.length} OK · erreurs page: ${perr.length}`); perr.slice(0,5).forEach(e=>console.log('  ',e));
await b.close(); process.exit(fail||perr.length?1:0);
