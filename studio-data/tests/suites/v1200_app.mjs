import fs from 'fs';
// Chemins : racine studio-data et dossier des suites (surchargeables par l'environnement, voir tests/run.mjs)
const ROOT = process.env.SD_ROOT || new URL('../../', import.meta.url).pathname;
const D = new URL('./', import.meta.url).pathname;
const { chromium } = (await import(process.env.PLAYWRIGHT_INDEX || '/opt/node22/lib/node_modules/playwright/index.js')).default;
const CHROMIUM = process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const html = fs.readFileSync(ROOT + 'StudioDataV12.html','utf8').replace(/<script src="https:[^"]*"[^>]*><\/script>/g,'').replace(/<link[^>]*rel="stylesheet"[^>]*>/g,'');
const b = await chromium.launch({ executablePath: CHROMIUM });
const p = await b.newPage({ viewport: { width: 1500, height: 950 } });
const perr=[]; p.on('pageerror',e=>{ if(!/lucide/.test(String(e))) perr.push(String(e)); });
await p.setContent(html,{waitUntil:'domcontentloaded'}); await p.addStyleTag({ path: D+'tw/tw_built.css' });
await p.evaluate(()=>{ v11Prefs.tourDone=true; }); await p.waitForTimeout(1500);
const out = await p.evaluate(async ()=>{
  const R=[]; const ok=(n,c)=>R.push([n,!!c]); window.lucide={createIcons:()=>{}}; try{ v11TourEnd(true); }catch(e){} restoreCompleted=true;
  const g=state.governance; const vis=n=>n && getComputedStyle(n).display!=='none' && !n.classList.contains('hidden');
  try {
  ok('version : APP_VERSION = tête du journal = titre de l\'onglet (' + APP_VERSION + ')', APP_CHANGELOG[0].v===APP_VERSION && document.title==='Studio Data ' + APP_VERSION);
  ok('menu : « Accueil » à la place du cockpit, gouvernance « Vue d\'ensemble »', NAV_PHASES[0].tabs[0].label==='Accueil' && NAV_PHASES.find(p=>p.id==='gov').tabs.find(t=>t.g==='home').label==="Vue d'ensemble");
  ok('premier écran sans données = accueil, fenêtre « Par où commencer » non ouverte', currentTab===11 && el('wizOverlay').classList.contains('hidden'));
  const C=()=>el('cockpitContent');
  ok('accueil vide : bienvenue, charger, exemple, prochaine étape « Chargez une première source »', C().textContent.includes('Bienvenue') && C().textContent.includes('Charger un fichier') && C().textContent.includes('Chargez une première source'));
  // données
  state.tables['t1']={id:'t1',name:'CLIENTS',type:'csv',status:'ready',headers:['ID','NOM','EMAIL'],config:{},columnsMeta:{},theme:'Finance',lastRows:1200,file:{name:'c.csv'},lastRefresh:Date.now()-9*864e5};
  state.tables['t2']={id:'t2',name:'FACTURES',type:'xlsx',status:'ready',headers:['NUM','ID_CLIENT'],config:{},columnsMeta:{},lastRows:5400};
  renderTables();
  ok('renderTables sur l\'accueil : accueil re-rendu, 2 sources, étapes « Reliez vos tables » et « domaine »', C().textContent.includes('2 source(s)') && C().textContent.includes('Reliez vos tables') && C().textContent.includes('Donnez un domaine'));
  ok('accueil : points d\'attention (non reliée, sans domaine, non rafraîchie), quatre phases, tableau des sources avec actions', C().textContent.includes('non reliée') && C().textContent.includes('sans domaine') && C().textContent.includes('non rafraîchie') && C().querySelectorAll('.v12-phase .p').length===4 && C().querySelectorAll('.v12-srctbl, .v11-tbl tbody tr').length>=2 && C().innerHTML.includes("v12GoAudit('t1')"));
  C().querySelector('.v12-step').click(); ok('clic sur une étape : navigation (Modèle)', currentTab===2);
  // fil d'Ariane + historique hors gouvernance
  ok('fil d\'Ariane de la barre de contexte : Accueil › ① Données & Modèle › Modèle de données', el('ctxCrumb').textContent.replace(/\s/g,'').includes('Accueil›①Données&Modèle›Modèlededonnées') && el('ctxCrumb').querySelectorAll('a').length===2);
  switchTab(3); switchTab(8); v11Back(); ok('◀ revient sur Extraire', currentTab===3); v11Back(); ok('◀ revient sur Modèle', currentTab===2); v11Fwd(); v11Fwd(); ok('▶ ▶ retour sur Qualité', currentTab===8);
  openGovTab('objects'); v11Back(); ok('◀ depuis la gouvernance revient sur Qualité (écran numéroté)', currentTab===8);
  // en-têtes unifiés + en savoir plus
  switchTab(13); const sec=el('step-13'); const more=sec.querySelector('.v12-more'); ok('en-tête : phrase courte + « En savoir plus » replié', more && sec.querySelector('.v12-long') && !sec.querySelector('.v12-long').classList.contains('open') && sec.querySelector('h2').classList.contains('v12-h2'));
  more.click(); ok('En savoir plus déplie le texte', sec.querySelector('.v12-long').classList.contains('open'));
  ok('titre unifié : couleur du texte (plus indigo/teal)', getComputedStyle(sec.querySelector('h2')).color===getComputedStyle(document.body).color || /15, 23, 42|233, 238, 246/.test(getComputedStyle(sec.querySelector('h2')).color));
  ok('« Et ensuite ? » en bas de Préparation → Extraire, Auditer', sec.querySelector('.v12-next') && sec.querySelector('.v12-next').textContent.includes('Extraire') && sec.querySelector('.v12-next').textContent.includes('Auditer'));
  sec.querySelector('.v12-next button').click(); ok('lien « et ensuite » navigue', currentTab===3);
  // barres collantes
  ok('Extraire : plus de barre collante, panneau Résultat du plan de travail à la place', !el('step-3').querySelector('.v12-sticky') && el('v12x') && el('v12x').querySelector('.v12x-side [onclick="advCount()"]'));
  switchTab(8); ok('Qualité : barre collante « Lancer »', el('step-8').querySelector('.v12-sticky') && /Lancer/.test(el('step-8').querySelector('.v12-sticky').textContent));
  // actions rapides sur les sources
  switchTab(1); ok('Sources : bascule Cartes / Liste, actions rapides sur les cartes, état vide masqué', el('v12SrcBar') && el('tablesGrid').querySelectorAll('.v12-qa').length===2 && el('emptyStateSources').classList.contains('hidden'));
  v12SrcView('list'); ok('vue liste : tableau des sources (2 lignes), cartes masquées, préférence mémorisée', el('v12SrcList').querySelectorAll('tbody tr').length===2 && getComputedStyle(el('tablesGrid')).display==='none' && v11Prefs.srcView==='list');
  v12SrcView('cards');
  v12GoExplore('t2'); ok('Explorer depuis une source : écran Explorer, table sélectionnée', currentTab===6 && el('browserTableSelect').value==='t2');
  v12GoAudit('t1'); ok('Auditer depuis une source : écran Qualité, table sélectionnée', currentTab===8 && el('qualTable').value==='t1');
  v12GoExtract('t2'); ok('Extraire depuis une source : table de départ FACTURES', currentTab===3 && state.advExtract.baseId==='t2');
  ok('vocabulaire : « Sources » à la place de « Fichiers chargés »', (switchTab(1), el('step-1').querySelector('h2').textContent.trim()==='Sources'));
  // bandeau sans données
  const keep=state.tables; state.tables={}; switchTab(6); ok('sans source : bandeau explicatif avec bouton Charger', el('step-6').querySelector('.v12-band.info') && el('step-6').querySelector('.v12-band.info').textContent.includes('Aucune source chargée'));
  state.tables=keep; switchTab(6); ok('avec sources : bandeau retiré', !el('step-6').querySelector('.v12-band.info'));
  // plein écran sur un conteneur de données
  el('browserDataBody').innerHTML='<tr><td>x</td></tr>'; renderBrowserTableHTML && (()=>{ try{ v12FsButtons(); }catch(e){} })();
  ok('bouton ⛶ sur le tableau de données', !!el('browserTableContainer').querySelector('.v11-fsbtn'));
  el('browserTableContainer').querySelector('.v11-fsbtn').click(); ok('plein écran ouvert sur le tableau', el('v11Fs') && el('v11Fs').querySelector('#browserTableContainer')); v11FsClose();
  // recherche
  v11PaletteOpen(); el('v11PalIn').value='charger'; el('v11PalIn').dispatchEvent(new Event('input')); ok('recherche : action « Charger un fichier »', el('v11PalRes').textContent.includes('Charger un fichier'));
  el('v11PalIn').value='extraire'; el('v11PalIn').dispatchEvent(new Event('input')); ok('recherche : écran « Extraire » (Exploitation)', Array.from(document.querySelectorAll('#v11PalRes .it')).some(i=>i.textContent.includes('Extraire') && i.textContent.includes('Exploitation')));
  el('v11PalIn').value='règle'; el('v11PalIn').dispatchEvent(new Event('input')); const it=Array.from(document.querySelectorAll('#v11PalRes .it')).find(i=>/Créer une règle/.test(i.textContent)); ok('recherche : action « Créer une règle »', !!it); v11PaletteGo(Array.from(document.querySelectorAll('#v11PalRes .it')).indexOf(it)); ok('ouvre Règles & score', currentTab===12);
  // raccourcis
  document.dispatchEvent(new KeyboardEvent('keydown',{key:'g',bubbles:true})); document.dispatchEvent(new KeyboardEvent('keydown',{key:'s',bubbles:true})); ok('G puis S → Sources', currentTab===1);
  document.dispatchEvent(new KeyboardEvent('keydown',{key:'g',bubbles:true})); document.dispatchEvent(new KeyboardEvent('keydown',{key:'i',bubbles:true})); ok('G puis I → Accueil', currentTab===11);
  // moteur indisponible
  try { await getDB(); } catch(e) {}
  ok('bandeau moteur indisponible en haut de la page, avec Réessayer', el('v12Engine') && el('v12Engine').textContent.includes('moteur de données') && el('v12Engine').textContent.includes('Réessayer'));
  el('v12Engine').querySelector('.x').click(); ok('bandeau masquable', !el('v12Engine'));
  // aide / visite
  v11HelpOpen(); ok('aide : lexique étendu (table conçue, rapprochement) et raccourcis G puis S', el('v11Help').textContent.includes('Table conçue') && el('v11Help').textContent.includes('Rapprochement') && el('v11Help').textContent.includes('G puis I')); v11HelpClose();
  v11TourStart(); ok('visite guidée : 5 étapes sur toute l\'application', el('v11Tour').textContent.includes('1 / 5') && el('v11Tour').textContent.includes('Quatre phases')); v11TourEnd(true);
  // gouvernance intacte
  switchPhase('gov'); ok('gouvernance : vue d\'ensemble V11 toujours là', govState.tab==='home' && el('govContent').textContent.includes('Chiffres clés'));
  } catch(e) { R.push(['ERREUR '+e.message+' @ '+String(e.stack).split('\n')[1], false]); }
  return R;
});
let fail=0; for(const [n,c] of out){ console.log((c?'✅ ':'❌ ')+n); if(!c) fail++; }
console.log(`\n${out.length-fail}/${out.length} OK · erreurs page: ${perr.length}`); perr.slice(0,5).forEach(e=>console.log('  ',e));
await b.close(); process.exit(fail||perr.length?1:0);
