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
const seed = `['CLIENTS','CONTRATS','SEGMENTS','SINISTRES'].forEach((n,i)=>{ state.tables['t'+i]={id:'t'+i,name:n,type:'csv',status:'ready',headers:['ID','CODE','PRIME','MONTANT'],config:{},columnsMeta:{}}; });
  state.governance.assets=[{id:'app1',name:'Gestion des tiers',kind:'app',sources:['CLIENTS']},{id:'app2',name:'Gestion des contrats',kind:'app',sources:['CONTRATS']},{id:'app3',name:'Scoring',kind:'app'},{id:'app4',name:'Référentiel produits',kind:'app',sources:['SEGMENTS']},{id:'pr1',name:'Reporting Solvabilité',kind:'process'},{id:'pr2',name:'Batch quittancement',kind:'process',tables:['CONTRATS']}];
  state.governance.businessObjects.push(
    {id:'bo1',name:'Personne',definition:'',globalOwner:'',contributors:[],producedBy:['app1'],sources:[{table:'CLIENTS',role:'maitre'}],structure:[],elements:[{id:'e1',name:'Adresse',mappings:[{table:'CLIENTS',col:'CODE'}],usedBy:[]}]},
    {id:'bo2',name:'Contrat',definition:'',globalOwner:'Paul',contributors:[],producedBy:['app2'],sources:[{table:'CONTRATS',role:'maitre'}],structure:[],references:[{boId:'bo4',cardinality:'N–1'}],elements:[{id:'e2',name:'Adresse de risque',mappings:[],usedBy:['pr1'],origins:[{boId:'bo1',elId:'e1',kind:'copy',rule:''}]},{id:'e3',name:'Score',mappings:[],usedBy:[],sourceApp:'app3'},{id:'e5',name:'Segment',mappings:[{table:'SEGMENTS',col:'CODE'}],usedBy:[]},{id:'e6',name:'Prime',mappings:[{table:'CONTRATS',col:'PRIME'}],usedBy:[]}]},
    {id:'bo3',name:'Sinistre',definition:'',globalOwner:'',contributors:[],producedBy:[],sources:[{table:'SINISTRES',role:'maitre'}],structure:[],elements:[{id:'e4',name:'Lieu du sinistre',mappings:[],usedBy:[],origins:[{boId:'bo2',elId:'e2',kind:'derived',rule:'au jour du sinistre'}]}]},
    {id:'bo4',name:'Produit',definition:'',globalOwner:'',contributors:[],producedBy:[],sources:[],structure:[],elements:[]});
  renderTables();`;
const out = await p.evaluate(async (seed)=>{
  const R=[]; const ok=(n,c)=>R.push([n,!!c]); window.lucide={createIcons:()=>{}}; try{ v11TourEnd(true); wizClose(); }catch(e){} restoreCompleted=true;
  const wait=ms=>new Promise(r=>setTimeout(r,ms)); const BO=id=>state.governance.businessObjects.find(b=>b.id===id);
  try {
  ok('version : APP_VERSION = tête du journal = titre de l\'onglet (' + APP_VERSION + ')', APP_CHANGELOG[0].v===APP_VERSION && document.title==='Studio Data ' + APP_VERSION);
  eval(seed);
  govState.lineageFiles=false;
  const g=buildBoLineageGraph(BO('bo2')); const N=id=>g.nodes.find(n=>n.id===id); const E=(s,t)=>g.edges.find(e=>e.source===s && e.target===t);
  ok('producteur de l\'objet toujours là : Gestion des contrats → Contrat', N('as:app2') && E('as:app2','bo:bo2'));
  ok('application source d\'un attribut : Scoring « produit 1 attribut(s) »', N('as:app3') && E('as:app3','bo:bo2') && /produit 1 attribut/.test(E('as:app3','bo:bo2').label));
  ok('table hors fiche Sources : Référentiel produits « alimente 1 attribut(s) via SEGMENTS »', N('as:app4') && E('as:app4','bo:bo2') && /alimente 1 attribut\(s\) via SEGMENTS/.test(E('as:app4','bo:bo2').label) && /SEGMENTS/.test(N('as:app4').content));
  ok('objet amont : Personne « 1 attribut(s) repris (copie) »', N('bo:bo1') && E('bo:bo1','bo:bo2') && /1 attribut\(s\) repris \(copie\)/.test(E('bo:bo1','bo:bo2').label));
  ok('objet aval : Sinistre « reprend 1 attribut(s) »', N('bo:bo3') && E('bo:bo2','bo:bo3') && /reprend 1 attribut/.test(E('bo:bo2','bo:bo3').label));
  ok('objet référencé : Produit « référence N–1 »', N('bo:bo4') && E('bo:bo2','bo:bo4') && /référence N–1/.test(E('bo:bo2','bo:bo4').label));
  ok('processus lecteur de la table : Batch quittancement « lit CONTRATS »', N('as:pr2') && E('bo:bo2','as:pr2') && /lit CONTRATS/.test(E('bo:bo2','as:pr2').label));
  ok('consommateur d\'attribut conservé : Reporting « utilise 1 attribut(s) »', N('as:pr1') && E('bo:bo2','as:pr1'));
  ok('Gestion des contrats n\'est pas compté comme lecteur de sa propre table', !/lit CONTRATS/.test((E('bo:bo2','as:app2')||{}).label||''));
  ok('pas de doublon de nœud, pas de « aucune source / aucun usage »', new Set(g.nodes.map(n=>n.id)).size===g.nodes.length && !N('nosrc') && !N('nouse'));
  // ---- « Afficher les fichiers » décoché : plus AUCUNE case de fichier ----
  // La règle n'était appliquée que si une application était déclarée pour le fichier. SINISTRES n'a
  // aucune application : la case bleue « ▦ SINISTRES » restait dessinée, case décochée.
  const sansFichiers=buildBoLineageGraph(BO('bo3'));
  ok('aucun fichier n\'est dessiné quand la case est décochée, même sans application déclarée',
    !sansFichiers.nodes.some(n=>String(n.id).startsWith('tbl:')));
  ok('le fichier est porté par une case « Application non déclarée », qui le cite', (()=>{
    const sans=sansFichiers.nodes.find(n=>n.id===LINEAGE_SANS_APPLICATION);
    return sans && /Application non déclarée/.test(sans.title) && /SINISTRES/.test(sans.content)
      && sansFichiers.edges.some(e=>e.source===LINEAGE_SANS_APPLICATION && e.target==='bo:bo3'); })());
  ok('et l\'objet n\'est donc pas déclaré « sans source »', !sansFichiers.nodes.some(n=>n.id==='nosrc'));
  ok('avec la case cochée, le fichier revient : rien n\'est perdu', (()=>{
    const avec=buildBoLineageGraph(BO('bo3'),{files:true});
    return avec.nodes.some(n=>n.id==='tbl:SINISTRES')
      && !avec.nodes.some(n=>n.id===LINEAGE_SANS_APPLICATION); })());
  ok('une table destinataire sans application ne se dessine pas non plus', (()=>{
    const aval={id:'boX',name:'Aval',definition:'',globalOwner:'',contributors:[],producedBy:[],
      sources:[{table:'SINISTRES',role:'destinataire'}],structure:[],elements:[]};
    const g2=buildBoLineageGraph(aval);
    return !g2.nodes.some(n=>String(n.id).startsWith('tbl:'))
      && g2.edges.some(e=>e.source==='bo:boX' && e.target===LINEAGE_SANS_APPLICATION); })());
  // ---- cliquer sur une case d'objet ouvre sa fiche ----
  ok('cliquer sur un objet métier ouvre sa fiche, onglet Objets', (()=>{
    govState.tab='catalog'; govState.selectedBoId=null;
    const fait=lineageOuvrirLaFiche('bo:bo1');
    return fait===true && govState.tab==='objects' && govState.selectedBoId==='bo1'; })());
  ok('effacer un fichier ne coupe pas la chaîne : on remonte à l\'application qui est derrière', (()=>{
    // CONCUE est bâtie sur SEGMENTS, que produit Référentiel produits. Sans fichiers, c\'est cette
    // application-là qui doit apparaître, pas une case « non déclarée » qui perdrait la piste.
    state.tables['tc']={id:'tc',name:'CONCUE',type:'designed',status:'ready',headers:['CODE'],config:{},
      columnsMeta:{},design:{sources:[{src:'SEGMENTS'}],joins:[]}};
    const bo={id:'boY',name:'Conçu',definition:'',globalOwner:'',contributors:[],producedBy:[],
      sources:[{table:'CONCUE',role:'maitre'}],structure:[],elements:[]};
    const g2=buildBoLineageGraph(bo);
    return lineageApplicationDerriere('CONCUE') && lineageApplicationDerriere('CONCUE').id==='app4'
      && g2.nodes.some(n=>n.id==='as:app4') && /CONCUE/.test((g2.nodes.find(n=>n.id==='as:app4')||{}).content||'')
      && !g2.nodes.some(n=>String(n.id).startsWith('tbl:')); })());
  ok('et une remontée qui tourne en rond s\'arrête au lieu de boucler', (()=>{
    state.tables['tz']={id:'tz',name:'BOUCLE_A',type:'designed',status:'ready',headers:['ID'],config:{},
      columnsMeta:{},design:{sources:[{src:'BOUCLE_B'}],joins:[]}};
    state.tables['tz2']={id:'tz2',name:'BOUCLE_B',type:'designed',status:'ready',headers:['ID'],config:{},
      columnsMeta:{},design:{sources:[{src:'BOUCLE_A'}],joins:[]}};
    return lineageApplicationDerriere('BOUCLE_A')===null; })());
  ok('et cliquer sur un objet qui n\'existe pas ne fait rien du tout', (()=>{
    govState.selectedBoId='bo1';
    return lineageOuvrirLaFiche('bo:inconnu')===false && govState.selectedBoId==='bo1'; })());
  ok('la vue « objets » branche ce clic sur le graphe', /lineageOuvrirLaFiche/.test(String(v12LinRender)));
  // Et le graphe du catalogue, pour de vrai : on clique sur la case « Personne » du parcours de Contrat.
  ok('un vrai clic sur la case d\'un objet, dans le catalogue, ouvre sa fiche', await (async ()=>{
    switchTab(20); openGovTab('catalog'); await wait(200);
    // L'encart du parcours vit dans le tiroir d'une fiche : on le pose pour l'exercer seul.
    if (!el('catLineageBox')) document.body.insertAdjacentHTML('beforeend', '<div id="catLineageBox" class="hidden"></div>');
    govState.selectedBoId=null;
    catShowAttrLineage({ type:'bo', bo:'bo2', title:'Contrat' });
    await wait(250);
    const caseObjet = el('catLineageWrap') && el('catLineageWrap').querySelector('.usvgn[data-id="bo:bo1"]');
    if (!caseObjet) return false;
    const coup = type => caseObjet.dispatchEvent(new MouseEvent(type, { bubbles:true, clientX:10, clientY:10 }));
    coup('mousedown'); window.dispatchEvent(new MouseEvent('mouseup', { bubbles:true, clientX:10, clientY:10 }));
    await wait(150);
    return govState.tab==='objects' && govState.selectedBoId==='bo1';
  })());
  ok('et l\'invite le dit, sinon personne n\'essaie',
    /Cliquez sur une case/.test(lineageInviteAuClic()) && /sur un trait/.test(lineageInviteAuClic()));
  // ---- cliquer sur les autres cases ----
  switchTab(20); await wait(150);
  ok('une application s\'ouvre sur sa carte, onglet Applications & processus', (()=>{
    govState.tab='objects';
    return lineageOuvrirLaFiche('as:app1')===true && govState.tab==='assets'
      && !!el('gov-asset-app1'); })());
  ok('un attribut ouvre la fiche de l\'objet qui le porte', (()=>{
    govState.tab='assets'; govState.selectedBoId=null;
    return lineageOuvrirLaFiche('attr:e5')===true && govState.tab==='objects' && govState.selectedBoId==='bo2'; })());
  ok('un fichier ouvre sa fiche du catalogue', (()=>{
    govState.tab='objects';
    return lineageOuvrirLaFiche('tbl:CLIENTS')===true && govState.tab==='catalog'; })());
  ok('et la case « Application non déclarée » dit quoi faire au lieu d\'ouvrir le vide',
    lineageOuvrirLaFiche(LINEAGE_SANS_APPLICATION)===false);
  ok('ce qui n\'existe pas ne s\'ouvre pas', lineageOuvrirLaFiche('tbl:INCONNUE')===false
    && lineageOuvrirLaFiche('as:inconnue')===false && lineageOuvrirLaFiche('attr:inconnu')===false
    && lineageOuvrirLaFiche('col:main')===false);
  // ---- cliquer sur un trait : ce qui y passe ----
  const gLien=buildBoLineageGraph(BO('bo2'));
  const lienDe=(s,t2)=>(gLien.edges.find(e=>e.source===s && e.target===t2)||{}).id;
  ok('un trait application → objet rend les attributs que cette application alimente', (()=>{
    const d=lineageDonneesDuLien(gLien, lienDe('as:app3','bo:bo2'));
    return d && d.lignes.length===1 && d.lignes[0].nom==='Score' && d.lignes[0].objet==='Contrat'
      && /application source/.test(d.lignes[0].detail) && /1 information/.test(d.phrase); })());
  ok('et il nomme les deux bouts et le rôle du trait', (()=>{
    const d=lineageDonneesDuLien(gLien, lienDe('as:app3','bo:bo2'));
    return /Scoring/.test(d.depuis) && /Contrat/.test(d.vers) && /produit 1 attribut/.test(d.role); })());
  ok('un trait qui passe par un fichier dit DE QUELLE COLONNE vient chaque information', (()=>{
    const d=lineageDonneesDuLien(gLien, lienDe('as:app4','bo:bo2'));
    return d && d.lignes.some(l=>l.nom==='Segment' && /SEGMENTS · CODE/.test(l.detail)); })());
  ok('un trait entre deux objets rend ce que l\'aval reprend de l\'amont', (()=>{
    const d=lineageDonneesDuLien(gLien, lienDe('bo:bo1','bo:bo2'));
    return d && d.lignes.length===1 && d.lignes[0].nom==='Adresse de risque'
      && /repris de Personne/.test(d.lignes[0].detail); })());
  ok('un trait vers un consommateur rend ce qu\'il utilise', (()=>{
    const d=lineageDonneesDuLien(gLien, lienDe('bo:bo2','as:pr1'));
    return d && d.lignes.some(l=>l.nom==='Adresse de risque' && /utilisé par/.test(l.detail)); })());
  ok('avec les fichiers affichés, le trait fichier → objet marche aussi', (()=>{
    const gf2=buildBoLineageGraph(BO('bo2'),{files:true});
    const id=(gf2.edges.find(e=>e.source==='tbl:SEGMENTS' && e.target==='bo:bo2')||{}).id;
    const d=lineageDonneesDuLien(gf2, id);
    return d && d.lignes.some(l=>l.nom==='Segment' && /SEGMENTS · CODE/.test(l.detail)); })());
  ok('un trait sans aucune information rattachée le dit franchement, sans mentir', (()=>{
    const d=lineageDonneesDuLien(gLien, lienDe('bo:bo2','bo:bo4'));
    return d && d.lignes.length===0 && /Aucune information/.test(d.phrase); })());
  ok('et un lien qui n\'existe pas ne rend rien', lineageDonneesDuLien(gLien,'nexistepas')===null);
  ok('le panneau du lien s\'ouvre au-dessus du schéma, et se referme', (()=>{
    // Un conteneur de dépannage, retiré aussitôt : sans quoi il usurperait l'identifiant du vrai,
    // et les contrôles de plein écran plus bas porteraient sur une boîte sans style.
    let depannage = null;
    if (!el('attrLineageWrap')) {
      document.body.insertAdjacentHTML('beforeend', '<div id="zzDepannage"><div id="attrLineageWrap"></div></div>');
      depannage = el('zzDepannage');
    }
    const wrap=el('attrLineageWrap');
    const pose=lineageAfficherLeLien(wrap, gLien, lienDe('as:app3','bo:bo2'));
    const boite=el('lineageLienBox');
    const vu=pose && boite && /Score/.test(boite.textContent) && /Scoring/.test(boite.textContent);
    lineageFermerLeLien();
    if (depannage) depannage.remove();
    return vu && !el('lineageLienBox'); })());
  ok('la vue « objets » branche ce clic sur les traits', /edge:click/.test(String(v12LinRender)));
  // Et pour de vrai dans le catalogue : on clique sur le trait « Personne → Contrat ».
  ok('un vrai clic sur un trait, dans le catalogue, dit ce qui y passe', await (async ()=>{
    switchTab(20); openGovTab('catalog'); await wait(200);
    if (!el('catLineageBox')) document.body.insertAdjacentHTML('beforeend', '<div id="catLineageBox" class="hidden"></div>');
    lineageFermerLeLien();
    catShowAttrLineage({ type:'bo', bo:'bo2', title:'Contrat' });
    await wait(250);
    const wrap=el('catLineageWrap');
    const donnees=lineageDonneesDuLien(buildBoLineageGraph(BO('bo2')), lienDe('bo:bo1','bo:bo2'));
    const trait=wrap && wrap.querySelector('.usvge[data-id="' + donnees.id + '"] .usvge-cible');
    if (!trait) return false;
    trait.dispatchEvent(new MouseEvent('mousedown', { bubbles:true, clientX:10, clientY:10 }));
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles:true, clientX:10, clientY:10 }));
    await wait(150);
    const boite=el('lineageLienBox');
    return !!boite && /Adresse de risque/.test(boite.textContent) && /repris de Personne/.test(boite.textContent);
  })());
  ok('et déplacer le schéma en partant d\'un trait n\'ouvre pas ce panneau', await (async ()=>{
    lineageFermerLeLien();
    const wrap=el('catLineageWrap');
    const donnees=lineageDonneesDuLien(buildBoLineageGraph(BO('bo2')), lienDe('bo:bo1','bo:bo2'));
    const trait=wrap && wrap.querySelector('.usvge[data-id="' + donnees.id + '"] .usvge-cible');
    if (!trait) return false;
    trait.dispatchEvent(new MouseEvent('mousedown', { bubbles:true, clientX:10, clientY:10 }));
    for (let pas=1; pas<=6; pas++)
      window.dispatchEvent(new MouseEvent('mousemove', { bubbles:true, clientX:10+pas*6, clientY:10 }));
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles:true, clientX:46, clientY:10 }));
    await wait(150);
    return !el('lineageLienBox');
  })());

  // mode fichiers
  const gf=buildBoLineageGraph(BO('bo2'),{files:true});
  ok('avec fichiers : SEGMENTS en table produite par Référentiel produits, alimente Contrat', gf.nodes.some(n=>n.id==='tbl:SEGMENTS') && gf.edges.some(e=>e.source==='as:app4' && e.target==='tbl:SEGMENTS') && gf.edges.some(e=>e.source==='tbl:SEGMENTS' && e.target==='bo:bo2'));
  // synthèse
  const rows=v12BoLinSynth(BO('bo2'), g);
  ok('synthèse : une ligne par élément relié, amont avant aval, rôles renseignés', rows.length===g.nodes.length-1 && rows[0].dir==='amont' && rows.every(r=>r.how) && rows.some(r=>r.title.includes('Scoring') && r.kind==='application' && r.dir==='amont') && rows.some(r=>r.title.includes('Sinistre') && r.dir==='aval' && r.kind==='objet'));
  // ouverture réelle
  govState.selectedBoId='bo2'; v11State.edit['bo:bo2']=true; openGovTab('objects'); setBoTab('usage'); await wait(100); openBoLineage('bo2'); await wait(200);
  const box=el('attrLineageBox');
  ok('panneau Synthèse au-dessus du graphe : compteurs amont / aval', box && box.querySelector('.v12bl-synth') && /application\(s\) source/.test(box.textContent) && /objet\(s\) amont/.test(box.textContent) && /objet\(s\) aval/.test(box.textContent) && /processus/.test(box.textContent));
  ok('liste « Tout ce qui est relié » : ' + rows.length + ' lignes, Scoring et Produit présents', box.querySelectorAll('.v12bl-tbl tbody tr').length===rows.length && /Scoring/.test(box.textContent) && /Produit/.test(box.textContent));
  ok('graphe rendu avec une hauteur adaptée (> 300 px)', el('attrLineageWrap').querySelector('svg') && parseInt(el('attrLineageWrap').style.height)>=300);
  openBoLineage('bo2'); await wait(100); ok('réouverture : un seul panneau Synthèse', box.querySelectorAll('.v12bl-synth').length===1);
  // objet vide
  const g4=buildBoLineageGraph(BO('bo4')); ok('objet sans rattachement propre : « référencé par Contrat » ; une référence n\'est ni une source ni un usage, les rappels « aucune source / aucun usage » restent', g4.nodes.some(n=>n.id==='bo:bo2') && g4.edges.some(e=>e.source==='bo:bo2' && e.target==='bo:bo4' && /référencé par/.test(e.label)) && g4.nodes.some(n=>n.id==='nosrc') && g4.nodes.some(n=>n.id==='nouse'));
  // carte des flux
  const d={nodes:[{id:'bo:bo2'},{id:'as:app3'},{id:'as:pr1'},{id:'bo:bo4'},{id:'as:app4'}],edges:[]}; v12OrgLineageEdges(d);
  ok('carte des flux : Scoring → Contrat (1 attribut), Contrat → Reporting, Référentiel produits via SEGMENTS, Contrat → Produit référence', d.edges.some(e=>e.source==='as:app3' && e.target==='bo:bo2') && d.edges.some(e=>e.source==='bo:bo2' && e.target==='as:pr1') && d.edges.some(e=>e.source==='as:app4' && /via SEGMENTS/.test(e.label)) && d.edges.some(e=>e.source==='bo:bo2' && e.target==='bo:bo4'));
  let threw=false; try { openGovTab('lineage'); govState.lineageView='graph'; renderLineageGraph(); } catch(e){ threw=true; } ok('rendu réel de la carte des flux : pas d\'exception', !threw);
  ok('lexique : lineage de l\'objet', !!V11_LEXIQUE['lineage de l\'objet']);
  } catch(e) { R.push(['ERREUR '+e.message+' @ '+String(e.stack).split('\n')[1], false]); }
  return R;
}, seed);
// ---- le plein écran d'un schéma : une planche à dessin, pas un fond gris ----
// Ces conteneurs sont translucides ; en plein écran le navigateur pose du NOIR derrière, et le blanc
// à moitié transparent vire au gris terne. On vérifie sur un vrai plein écran, pas sur le CSS écrit.
const okFs=(n,c)=>out.push([n,!!c]);
const planche = await p.evaluate(async ()=>{
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  // On rouvre le parcours : c'est le VRAI conteneur, avec ses classes, qu'il faut mettre en plein écran.
  govState.selectedBoId='bo2'; openGovTab('objects'); setBoTab('usage'); await wait(150);
  openBoLineage('bo2'); await wait(300);
  document.body.insertAdjacentHTML('beforeend',
    '<button id="zzFs" style="position:fixed;left:2px;top:2px;z-index:99999">fs</button>');
  el('zzFs').addEventListener('click', ()=>{ el('attrLineageWrap').requestFullscreen(); });
  await wait(20);
  return true;
});
await p.click('#zzFs'); await p.waitForTimeout(400);
const vuEnGrand = await p.evaluate(()=>{
  const wrap = el('attrLineageWrap');
  const style = getComputedStyle(wrap);
  return { plein: wrap === document.fullscreenElement, fond: style.backgroundColor,
    trame: style.backgroundImage, marge: style.padding, cadre: style.borderTopWidth,
    haut: Math.round(wrap.getBoundingClientRect().height) };
});
okFs('en plein écran, le schéma a un fond PLEIN — plus de translucide qui vire au gris sur le noir',
  vuEnGrand.plein && vuEnGrand.fond === 'rgb(255, 255, 255)');
okFs('il porte une trame de points, qui aide l\'œil à situer les cases', /radial-gradient/.test(vuEnGrand.trame));
okFs('il occupe l\'écran, avec de l\'air autour et sans cadre',
  vuEnGrand.haut >= 600 && vuEnGrand.marge === '18px' && vuEnGrand.cadre === '0px');
const enSombre = await p.evaluate(async ()=>{
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  document.documentElement.setAttribute('data-theme','dark');
  await wait(60);
  const style = getComputedStyle(el('attrLineageWrap'));
  const etiquette = el('attrLineageWrap').querySelector('.usvg-lbl');
  const styleEtiquette = etiquette ? getComputedStyle(etiquette) : {};
  return { fond: style.backgroundColor, trame: style.backgroundImage,
    encre: styleEtiquette.fill, halo: styleEtiquette.stroke };
});
okFs('et elle reste CLAIRE même en thème sombre : un schéma se lit comme un document, pas comme un écran',
  enSombre.fond === 'rgb(255, 255, 255)' && /radial-gradient/.test(enSombre.trame));
okFs('les étiquettes des liens suivent la planche : encre sombre sur halo blanc, pas de pâté noir',
  enSombre.encre === 'rgb(71, 85, 105)' && enSombre.halo === 'rgb(255, 255, 255)');
await p.evaluate(()=>{ document.documentElement.removeAttribute('data-theme'); return document.exitFullscreen().catch(()=>{}); });
await p.waitForTimeout(200);
// ---- en plein écran, ouvrir quelque chose doit RAMENER à l'écran ----
// Le schéma occupe seul l'écran : la fiche ouverte s'affichait derrière, invisible, et l'on restait
// devant le même schéma en se demandant pourquoi rien ne se passait.
await p.click('#zzFs'); await p.waitForTimeout(300);
okFs('ouvrir une fiche depuis le plein écran en fait sortir, et emmène sur la fiche',
  await p.evaluate(async ()=>{
    const wait=ms=>new Promise(r=>setTimeout(r,ms));
    if (!document.fullscreenElement) return false;
    govState.tab='catalog'; govState.selectedBoId=null;
    lineageOuvrirLaFiche('bo:bo1');
    await wait(250);
    return !document.fullscreenElement && govState.tab==='objects' && govState.selectedBoId==='bo1';
  }));
await p.evaluate(async ()=>{
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  govState.selectedBoId='bo2'; openGovTab('objects'); setBoTab('usage'); await wait(150);
  openBoLineage('bo2'); await wait(300);
});
await p.click('#zzFs'); await p.waitForTimeout(300);
okFs('et le panneau d\'un lien aussi : il se pose au-dessus du schéma, il faut donc en sortir',
  await p.evaluate(async ()=>{
    const wait=ms=>new Promise(r=>setTimeout(r,ms));
    if (!document.fullscreenElement) return false;
    const graphe = buildBoLineageGraph((state.governance.businessObjects||[]).find(b=>b.id==='bo2'));
    const lien = graphe.edges.find(e=>e.source==='bo:bo1' && e.target==='bo:bo2');
    lineageAfficherLeLien(el('attrLineageWrap'), graphe, lien.id);
    await wait(250);
    const vu = !document.fullscreenElement && !!el('lineageLienBox');
    lineageFermerLeLien();
    return vu;
  }));
okFs('en sortant du plein écran, le schéma redevient ce qu\'il était',
  await p.evaluate(()=>{ const s=getComputedStyle(el('attrLineageWrap'));
    return !document.fullscreenElement && s.padding === '0px' && s.backgroundImage === 'none'; }));

// L'écran « Lineage » lui-même, pour de vrai : c'est là que les traits ne répondaient pas.
const surLEcranLineage = await p.evaluate(async ()=>{
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  lineageFermerLeLien();
  openGovTab('lineage'); govState.lineageView='graph';
  try { renderLineageGraph(); } catch (e) { return { erreur: String(e.message) }; }
  await wait(400);
  const wrap = el('lineageGraphWrap');
  const trait = wrap && wrap.querySelector('.usvge .usvge-cible');
  return { legende: /double-cliquez-le/.test(el('govContent').textContent),
    traits: wrap ? wrap.querySelectorAll('.usvge').length : 0, cible: !!trait };
});
okFs('l\'écran « Lineage » dessine bien des traits que l\'on peut viser à la souris',
  surLEcranLineage.traits > 0 && surLEcranLineage.cible);
okFs('et sa légende annonce le clic sur un trait et le double clic sur une case', surLEcranLineage.legende);
okFs('un vrai clic sur un trait de cet écran dit ce qui y passe', await p.evaluate(async ()=>{
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const trait = el('lineageGraphWrap').querySelector('.usvge .usvge-cible');
  trait.dispatchEvent(new MouseEvent('mousedown', { bubbles:true, clientX:10, clientY:10 }));
  window.dispatchEvent(new MouseEvent('mouseup', { bubbles:true, clientX:10, clientY:10 }));
  await wait(200);
  const vu = !!el('lineageLienBox');
  lineageFermerLeLien();
  return vu;
}));
okFs('et un double clic sur une case y ouvre sa fiche', await p.evaluate(async ()=>{
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const caseObjet = el('lineageGraphWrap').querySelector('.usvgn[data-id^="bo:"]');
  if (!caseObjet) return false;
  const attendu = caseObjet.getAttribute('data-id').slice(3);
  govState.tab='lineage'; govState.selectedBoId=null;
  for (let coup=0; coup<2; coup++) {
    caseObjet.dispatchEvent(new MouseEvent('mousedown', { bubbles:true, clientX:10, clientY:10 }));
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles:true, clientX:10, clientY:10 }));
  }
  await wait(250);
  return govState.tab==='objects' && govState.selectedBoId===attendu;
}));
await p.evaluate(()=>document.fullscreenElement && document.exitFullscreen().catch(()=>{}));
await p.waitForTimeout(200);

let fail=0; for(const [n,c] of out){ console.log((c?'✅ ':'❌ ')+n); if(!c) fail++; }
console.log(`\n${out.length-fail}/${out.length} OK · erreurs page: ${perr.length}`); perr.slice(0,5).forEach(e=>console.log('  ',e));
for (const theme of ['light','dark']) {
  const q = await b.newPage({ viewport: { width: 1500, height: 950 }, colorScheme: theme==='dark'?'dark':'light' });
  await q.setContent(html,{waitUntil:'domcontentloaded'}); await q.addStyleTag({ path: D+'tw/tw_built.css' }); await q.evaluate(()=>{ v11Prefs.tourDone=true; }); await q.waitForTimeout(1400);
  await q.evaluate((seed)=>{ window.lucide={createIcons:()=>{}}; try{ v11TourEnd(true); wizClose(); }catch(e){} eval(seed); govState.lineageFiles=false; govState.selectedBoId='bo2'; v11State.edit['bo:bo2']=true; openGovTab('objects'); setBoTab('usage'); openBoLineage('bo2'); document.querySelectorAll('.v11-toast').forEach(t=>t.remove()); }, seed);
  if (theme==='dark') await q.evaluate(()=>{ try { v7ApplyTheme(); } catch(e) {} document.documentElement.setAttribute('data-theme','dark'); });
  await q.waitForTimeout(500); await q.evaluate(()=>{ const s=el('attrLineageBox'); if(s) s.scrollIntoView({block:'start'}); }); await q.waitForTimeout(200); await q.screenshot({ path: D+'bl_'+theme+'.png' });
  await q.close();
}
await b.close(); process.exit(fail||perr.length?1:0);
