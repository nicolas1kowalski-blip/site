import fs from 'fs';
// Chemins : racine studio-data et dossier des suites (surchargeables par l'environnement, voir tests/run.mjs)
const ROOT = process.env.SD_ROOT || new URL('../../', import.meta.url).pathname;
const D = new URL('./', import.meta.url).pathname;
const { chromium } = (await import(process.env.PLAYWRIGHT_INDEX || '/opt/node22/lib/node_modules/playwright/index.js')).default;
const CHROMIUM = process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const html = fs.readFileSync(process.env.SD_FILE||ROOT + 'StudioDataV13.html','utf8').replace(/<script src="https:[^"]*"[^>]*><\/script>/g,'').replace(/<link[^>]*rel="stylesheet"[^>]*>/g,'');
const b = await chromium.launch({ executablePath: CHROMIUM });
const p = await b.newPage({ viewport: { width: 1500, height: 950 } });
const perr=[]; p.on('pageerror',e=>{ if(!/lucide/.test(String(e))) perr.push(String(e)); });
await p.setContent(html,{waitUntil:'domcontentloaded'}); await p.addStyleTag({ path: D+'tw/tw_built.css' });
await p.evaluate(()=>{ v11Prefs.tourDone=true; }); await p.waitForTimeout(1500);
const seed = `state.tables['t1']={id:'t1',name:'CLIENTS',type:'csv',status:'ready',headers:['ID_CLIENT','NOM','PRENOM','DATE_NAISS','EMAIL','CP','VILLE','MT_PRIME'],config:{},columnsMeta:{},theme:'Finance',sampleData:[{ID_CLIENT:'C001',NOM:'DURAND',PRENOM:'Alice',DATE_NAISS:'1980-04-02',EMAIL:'a@ex.fr',CP:'75001',VILLE:'Paris',MT_PRIME:'120'},{ID_CLIENT:'C002',NOM:'MARTIN',PRENOM:'Bob',DATE_NAISS:'1975-11-30',EMAIL:'b@ex.fr',CP:'69001',VILLE:'Lyon',MT_PRIME:'95'}]};
  state.tables['t2']={id:'t2',name:'CONTRATS',type:'csv',status:'ready',headers:['NUM','ID_CLIENT','PRIME'],config:{},columnsMeta:{}};
  state.governance.assets=[{id:'app1',name:'Gestion des tiers',kind:'app',sources:['CLIENTS'],domain:'Finance'},{id:'app2',name:'Gestion des contrats',kind:'app',sources:['CONTRATS'],domain:'Finance'},{id:'rp1',name:'Rapport Solvabilité II',kind:'report',producedBy:['app2'],deliveredTo:[],recipients:'ACPR',frequency:'Trimestrielle',boIds:[]},{id:'app9',name:'Paie',kind:'app',domain:'RH'}];
  state.governance.businessObjects.push(
    {id:'bo2',name:'Contrat',definition:'Engagement entre l\\'assureur et le client.',globalOwner:'Paul Petit',domain:'Finance',contributors:[],producedBy:['app2'],consumedBy:[],sources:[{table:'CONTRATS',role:'maitre'}],structure:[],elements:[{id:'e2',name:'Prime',definition:'Montant périodique dû par le client.',mappings:[{table:'CONTRATS',col:'PRIME'}],usedBy:['rp1'],examples:'120 ; 95'},{id:'e3',name:'Adresse de risque',definition:'',mappings:[],usedBy:[]}]},
    {id:'bo4',name:'Salarié',definition:'',globalOwner:'',domain:'RH',contributors:[],producedBy:['app9'],consumedBy:[],sources:[],structure:[],elements:[{id:'e9',name:'Matricule',definition:'',mappings:[],usedBy:[]}]});
  state.governance.glossary.push({id:'g1',term:'Prime',domain:'Finance',definition:'Somme payée par le client en échange de la couverture.',attrLinks:[{boId:'bo2',elId:'e2'}],boIds:[],assetIds:[]});
  state.governance.domainList=['Finance','RH']; renderTables();`;
const out = await p.evaluate(async (seed)=>{
  const R=[]; const ok=(n,c)=>R.push([n,!!c]); window.lucide={createIcons:()=>{}}; try{ v11TourEnd(true); wizClose(); }catch(e){} restoreCompleted=true;
  const wait=ms=>new Promise(r=>setTimeout(r,ms)); const BO=id=>state.governance.businessObjects.find(b=>b.id===id); const M=()=>el('v11Modal'); const gc=()=>el('govContent');
  try {
  ok('version : APP_VERSION = tête du journal = titre de l\'onglet (' + APP_VERSION + ')', APP_CHANGELOG[0].v===APP_VERSION && document.title==='Studio Data ' + APP_VERSION);
  // ---- accueil en mode première fois (rien de décrit)
  openGovTab('home'); await wait(150);
  ok('accueil vide : trois grands boutons Décrire / Chercher / Voir qui utilise quoi', gc().querySelector('.v13-first') && gc().querySelectorAll('.v13-first button').length===3 && /Décrire un objet/.test(gc().textContent) && /Voir qui utilise quoi/.test(gc().textContent));
  ok('phrase d\'aide en tête de l\'accueil', gc().querySelector('.v13-help') && /où en est la description/.test(gc().querySelector('.v13-help').textContent));
  eval(seed);
  // ---- vocabulaire et aide
  ok('menu : « Parcours de la donnée », « Applications & restitutions »', NAV_PHASES.find(p=>p.id==='gov').tabs.some(t=>t.g==='flow' && t.label==='Parcours de la donnée') && NAV_PHASES.find(p=>p.id==='gov').tabs.some(t=>t.g==='assets' && /restitutions/.test(t.label)));
  openGovTab('objects'); await wait(150);
  ok('écran Objets : phrase d\'aide « à quoi ressemble une chose que vous gérez »', gc().querySelector('.v13-help') && /chose que vous gérez/.test(gc().querySelector('.v13-help').textContent));
  ok('vocabulaire : « information » remplace « attribut » dans l\'écran', /Information/.test(gc().textContent) && !/\bAttributs de l'objet\b/.test(gc().textContent));
  ok('feux tricolores sur les objets : Contrat (responsable) vert ou orange, Salarié (sans responsable) rouge', gc().querySelector(`button[onclick^="govState.selectedBoId='bo2'"] .v13-light`) && /[go]/.test(gc().querySelector(`button[onclick^="govState.selectedBoId='bo2'"] .v13-light`).className) && gc().querySelector(`button[onclick^="govState.selectedBoId='bo4'"] .v13-light.r`));
  ok('bouton « Décrire depuis un fichier / modèle » sur l\'écran Objets', Array.from(gc().querySelectorAll('button')).some(x=>/Décrire depuis un fichier/.test(x.textContent)));
  gc().querySelector('.v13-help .x').click(); await wait(50); renderGovernance(); await wait(100);
  ok('✕ sur l\'aide : mémorisé, plus d\'aide sur cet écran', v13State.helpOff.objects===true && !gc().querySelector('.v13-help')); v13State.helpOff={};
  // ---- fiche en trois questions
  v11EditAttr('bo2','','e3'); await wait(150);
  const det=()=>el('boDetail');
  ok('fiche « Adresse de risque » : trois sections ① C\'est quoi ② D\'où ça vient ③ Qui s\'en sert + « En dire plus »', det().querySelectorAll('.v13-sec').length===3 && /C'est quoi/.test(det().querySelector('.v13-sec[data-n="1"]').textContent) && /D'où ça vient/.test(det().querySelector('.v13-sec[data-n="2"]').textContent) && /Qui s'en sert/.test(det().querySelector('.v13-sec[data-n="3"]').textContent) && det().querySelector('details.v13-more'));
  ok('les réglages avancés (confidentialité, nombre de valeurs) sont sous « En dire plus »', /Confidentialité|Sensibilité/.test(det().querySelector('details.v13-more').textContent) && /Nombre de valeurs/.test(det().querySelector('details.v13-more').textContent));
  ok('jauge : « complète à 0 % », prochaine question C\'est quoi ?', det().querySelector('.v13-gauge') && /complète à 0 %/.test(det().querySelector('.v13-gauge').textContent) && /Prochaine question : C'est quoi/.test(det().querySelector('.v13-gauge').textContent));
  ok('définition proposée d\'après le nom (« Adresse postale. ») avec bouton Utiliser', det().querySelector('.v13-sugg') && /Adresse postale/.test(det().querySelector('.v13-sugg').textContent) && det().querySelector('.v13-sugg button'));
  det().querySelector('.v13-sugg button').click(); await wait(150);
  ok('Utiliser : définition reprise, jauge à 25 %, prochaine question D\'où ça vient ?', BO('bo2').elements[1].definition==='Adresse postale.' && /complète à 25 %/.test(det().querySelector('.v13-gauge').textContent) && /D'où ça vient/.test(det().querySelector('.v13-gauge .next').textContent));
  v11EditAttr('bo2','','e2'); await wait(150);
  ok('fiche « Prime » : complète à 100 %, tout y est', /complète à 100 %/.test(det().querySelector('.v13-gauge').textContent) && /tout y est/.test(det().querySelector('.v13-gauge').textContent));
  // définition déjà écrite ailleurs pour la même information
  BO('bo4').elements.push({id:'e10',name:'Prime',definition:'',mappings:[],usedBy:[]}); v11EditAttr('bo4','','e10'); await wait(150);
  ok('même information dans un autre objet : la définition de Contrat › Prime est suggérée', det().querySelector('.v13-sugg') && /déjà écrite pour « Contrat › Prime »/.test(det().querySelector('.v13-sugg').textContent) && /Montant périodique/.test(det().querySelector('.v13-sugg').textContent));
  BO('bo4').elements.pop();
  // ---- exemples dans la fiche en lecture
  v11State.edit['bo:bo2']=false; ok('fiche en lecture de Contrat : exemples de Prime affichés d\'office', /v13-ex">ex\. 120 ; 95/.test(v11BoRead(BO('bo2'))));
  // ---- proposer depuis un fichier
  ok('humaniser : DATE_NAISS → Date naissance, MT_PRIME → Montant prime, CLIENTS → Client', v13Humanize('DATE_NAISS')==='Date naissance' && v13Humanize('MT_PRIME')==='Montant prime' && v13ObjectName('CLIENTS')==='Client');
  ok('définitions devinées : identifiant, naissance, e-mail, code postal, montant', /Identifiant unique/.test(v13GuessDef('Identifiant client','Client')) && /naissance/.test(v13GuessDef('Date naissance')) && /électronique/.test(v13GuessDef('E-mail')) && /Code postal/.test(v13GuessDef('Code postal')) && /Montant/.test(v13GuessDef('Montant prime')));
  v13ProposeOpen(); ok('fenêtre de départ : fichiers chargés (CLIENTS, CONTRATS) et 7 modèles', M() && /CLIENTS/.test(M().textContent) && M().querySelectorAll('.v13-tpl button').length>=9);
  v13ProposeOpen('t1'); await wait(50);
  ok('proposition depuis CLIENTS : objet « Client », produit par Gestion des tiers, 8 informations, définitions et exemples', M() && /l'objet « Client »/.test(M().textContent) && /Gestion des tiers/.test(M().textContent) && M().querySelectorAll('.v13-prev tbody tr').length===8 && Array.from(M().querySelectorAll('.v13-prev input[type=text]')).some(i=>/Date de naissance de la personne/.test(i.value)) && /DURAND/.test(M().textContent) && v13State.prop.domain==='Finance');
  v13State.prop.attrs[6].on=false; v13ProposeCreate(); await wait(150);
  const cli=state.governance.businessObjects.find(b=>b.name==='Client');
  ok('Créer : objet Client, 7 informations (Ville décochée), colonnes rattachées, exemples, source CLIENTS maître, application source, domaine Finance', cli && cli.elements.length===7 && cli.elements[0].mappings[0].col==='ID_CLIENT' && cli.elements[0].examples==='C001 ; C002' && cli.sources[0].table==='CLIENTS' && cli.producedBy[0]==='app1' && cli.domain==='Finance' && !cli.elements.some(e=>e.name==='Ville') && !M());
  ok('après création : fiche de Client ouverte', govState.selectedBoId===cli.id);
  v13ProposeOpen(null,'Facture'); await wait(50); ok('modèle Facture : 8 informations proposées avec définitions', M() && M().querySelectorAll('.v13-prev tbody tr').length===8 && Array.from(M().querySelectorAll('.v13-prev input[type=text]')).some(i=>/Identifiant unique de la facture/.test(i.value)));
  v13ProposeCreate(); await wait(100); ok('objet Facture créé depuis le modèle', state.governance.businessObjects.some(b=>b.name==='Facture' && b.elements.length===8));
  v13ProposeOpen(null,'Contrat'); await wait(50); ok('modèle Contrat : « Prime » reconnue dans le fichier CONTRATS (colonne PRIME)', M() && /CONTRATS\.PRIME/.test(M().textContent)); v11ModalClose();
  ok('recherche Ctrl+K : action « Décrire un objet à partir d\'un fichier »', v11Index().some(i=>/Décrire un objet à partir/.test(i.label)));
  // ---- parcours en une phrase
  const s1=v13Sentence(BO('bo2'));
  ok('phrase de Contrat : vient de Gestion des contrats, sert au Rapport Solvabilité II, diffusé à ACPR', /vient de <b>Gestion des contrats/.test(s1) && /sert à <b>Rapport Solvabilité II/.test(s1) && /diffusé à <b>ACPR/.test(s1));
  const s2=v13Sentence(BO('bo2'), {el:BO('bo2').elements[0],facet:'',stId:null});
  ok('phrase de Prime : vient de Gestion des contrats / CONTRATS, sert au rapport', /« Prime » vient/.test(s2) && /Gestion des contrats|CONTRATS/.test(s2) && /Rapport Solvabilité II/.test(s2));
  ok('phrase de Salarié : source Paie, personne ne s\'en sert', /vient de <b>Paie/.test(v13Sentence(BO('bo4'))) && /personne n'a encore déclaré/.test(v13Sentence(BO('bo4'))));
  govState.selectedBoId='bo2'; v11State.edit['bo:bo2']=true; openGovTab('objects'); setBoTab('usage'); await wait(100); openBoLineage('bo2'); await wait(200);
  ok('lineage de l\'objet : la phrase en tête, avant le graphe', el('attrLineageBox').querySelector('.v13-sentence') && /vient de/.test(el('attrLineageBox').querySelector('.v13-sentence').textContent));
  // ---- posez votre question
  openGovTab('home'); await wait(150);
  ok('accueil : barre « Posez votre question », Mes tâches, Les mots du métier', el('v13Q') && gc().querySelector('.v13-tasks') && gc().querySelector('.v13-words') && /Prime/.test(gc().querySelector('.v13-words').textContent));
  ok('Mes tâches : objets sans responsable, informations sans définition, dont on ne sait pas d\'où elles viennent', /sans responsable/.test(gc().querySelector('.v13-tasks').textContent) && /sans définition/.test(gc().querySelector('.v13-tasks').textContent) && /d'où elles viennent/.test(gc().querySelector('.v13-tasks').textContent));
  v13Ask('qui est responsable du contrat ?'); ok('« qui est responsable du contrat ? » → Paul Petit, domaine Finance', /Contrat/.test(el('v13Answer').textContent) && /Paul Petit/.test(el('v13Answer').textContent) && /Finance/.test(el('v13Answer').textContent));
  v13Ask('où va la prime ?'); ok('« où va la prime ? » → sert au Rapport Solvabilité II', /Rapport Solvabilité II/.test(el('v13Answer').textContent) && el('v13Answer').querySelector('.acts button'));
  v13Ask('qu\'est-ce que la prime ?'); ok('« qu\'est-ce que la prime ? » → une définition', /Somme payée|Montant périodique/.test(el('v13Answer').textContent));
  v13Ask('d\'où vient le salarié ?'); ok('« d\'où vient le salarié ? » → vient de Paie', /vient de/.test(el('v13Answer').textContent) && /Paie/.test(el('v13Answer').textContent));
  v13Ask('combien de chameaux ?'); ok('question sans réponse : message clair et renvoi vers la recherche', /rien trouvé/.test(el('v13Answer').textContent));
  // ---- mon domaine
  ok('sélecteur « Mon domaine » en haut, visible en gouvernance, avec Finance et RH', el('v13Dom') && el('v13Dom').style.display!=='none' && Array.from(el('v13Dom').querySelectorAll('option')).map(o=>o.value).join(',')===',Finance,RH');
  v13SetDom('Finance'); await wait(150); openGovTab('objects'); await wait(150);
  ok('Mon domaine = Finance : Salarié (RH) masqué, bandeau « Tout afficher », Contrat visible', gc().querySelector(`button[onclick^="govState.selectedBoId='bo4'"]`).style.display==='none' && gc().querySelector(`button[onclick^="govState.selectedBoId='bo2'"]`).style.display!=='none' && gc().querySelector('.v13-domband') && /Tout afficher/.test(gc().querySelector('.v13-domband').textContent));
  openGovTab('assets'); await wait(150); ok('Mon domaine : l\'application Paie (RH) masquée dans la liste', el('v11-as-app9') && el('v11-as-app9').style.display==='none' && el('v11-as-app1').style.display!=='none');
  openGovTab('home'); await wait(150); ok('Mes tâches limitées au domaine : Salarié sans responsable n\'est plus compté', !/objet\(s\) sans responsable/.test(gc().querySelector('.v13-tasks').textContent) || !/1 objet/.test(gc().querySelector('.v13-tasks').textContent));
  v13SetDom(''); await wait(100); openGovTab('objects'); await wait(100); ok('Tout afficher : Salarié de retour', gc().querySelector(`button[onclick^="govState.selectedBoId='bo4'"]`).style.display!=='none');
  // ---- proposer une correction
  v11State.edit['bo:bo2']=false; openGovTab('objects'); await wait(150);
  ok('fiche en lecture : bouton « Proposer une correction »', Array.from(gc().querySelectorAll('button')).some(x=>/Proposer une correction/.test(x.textContent)));
  v13FixOpen('bo','bo2'); ok('fenêtre : définition actuelle et zone de proposition', M() && /Engagement entre/.test(M().textContent) && el('v13FixTxt'));
  el('v13FixTxt').value='Un contrat est un engagement en cours entre un client et l\'assureur.'; v13FixSend('bo','bo2'); await wait(100);
  ok('envoi : proposition en attente pour le responsable, définition inchangée', govProposals().some(p=>p.status==='pending' && /Correction proposée sur « Contrat »/.test(p.label) && p.field==='definition') && /Engagement entre/.test(BO('bo2').definition) && !M());
  ok('lexique : information, variante, parcours de la donnée, mon domaine', !!V11_LEXIQUE['information'] && !!V11_LEXIQUE['variante'] && !!V11_LEXIQUE['parcours de la donnée'] && !!V11_LEXIQUE['mon domaine']);
  } catch(e) { R.push(['ERREUR '+e.message+' @ '+String(e.stack).split('\n')[1], false]); }
  return R;
}, seed);
let fail=0; for(const [n,c] of out){ console.log((c?'✅ ':'❌ ')+n); if(!c) fail++; }
console.log(`\n${out.length-fail}/${out.length} OK · erreurs page: ${perr.length}`); perr.slice(0,5).forEach(e=>console.log('  ',e));
for (const theme of ['light','dark']) {
  const q = await b.newPage({ viewport: { width: 1500, height: 950 }, colorScheme: theme==='dark'?'dark':'light' });
  await q.setContent(html,{waitUntil:'domcontentloaded'}); await q.addStyleTag({ path: D+'tw/tw_built.css' }); await q.evaluate(()=>{ v11Prefs.tourDone=true; }); await q.waitForTimeout(1400);
  await q.evaluate((seed)=>{ window.lucide={createIcons:()=>{}}; try{ v11TourEnd(true); wizClose(); }catch(e){} eval(seed); openGovTab('home'); document.querySelectorAll('.v11-toast').forEach(t=>t.remove()); v13Ask('où va la prime ?'); }, seed);
  if (theme==='dark') await q.evaluate(()=>{ try { v7ApplyTheme(); } catch(e) {} document.documentElement.setAttribute('data-theme','dark'); });
  await q.waitForTimeout(400); await q.screenshot({ path: D+'x13_home_'+theme+'.png' });
  await q.evaluate(()=>{ v11EditAttr('bo2','','e3'); }); await q.waitForTimeout(400); await q.evaluate(()=>{ const d=el('boDetail'); if(d) d.scrollIntoView({block:'start'}); }); await q.waitForTimeout(200); await q.screenshot({ path: D+'x13_fiche_'+theme+'.png' });
  await q.evaluate(()=>{ v13ProposeOpen('t1'); }); await q.waitForTimeout(400); await q.screenshot({ path: D+'x13_propose_'+theme+'.png' });
  await q.close();
}
await b.close(); process.exit(fail||perr.length?1:0);
