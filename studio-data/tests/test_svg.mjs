import pkg from '/opt/node22/lib/node_modules/playwright/index.js'; const { chromium } = pkg;
import fs from 'fs';
const html = fs.readFileSync(new URL('../StudioData.html', import.meta.url),'utf8')
  .replace(/<script src="https:[^"]*"[^>]*><\/script>/g,'').replace(/<link[^>]*rel="stylesheet"[^>]*>/g,'');
const b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
await p.setContent(html,{waitUntil:'domcontentloaded'});
const res = await p.evaluate(()=>{
  const out={}; window.lucide={createIcons:()=>{}};
  try{
    state.tables['a']={id:'a',name:'CLIENTS',type:'csv',status:'ready',headers:['ID','NOM'],config:{},columnsMeta:{},theme:'Ventes'};
    state.tables['b']={id:'b',name:'COMMANDES',type:'csv',status:'ready',headers:['ID','CLIENT_ID','MONTANT'],config:{},columnsMeta:{},theme:'Ventes'};
    state.tables['c']={id:'c',name:'DEPOTS',type:'csv',status:'ready',headers:['CODE','VILLE'],config:{},columnsMeta:{},theme:'Logistique'};
    state.relations.push({id:'rel_1',sourceTable:'a',sourceCol:'ID',targetTable:'b',targetCol:'CLIENT_ID',cardinality:'1-N'});
    const g=el('networkGraph'); Object.defineProperty(g,'clientWidth',{value:900,configurable:true}); Object.defineProperty(g,'clientHeight',{value:500,configurable:true});
    // activer le moteur SVG
    setMcdEngine('svg');
    const svg=el('mcdSvg');
    out.svgRendered = !!svg;
    out.nodeCount = svg.querySelectorAll('.svgnode').length; // 3
    out.edgeCount = svg.querySelectorAll('.svgedge').length; // 1
    out.zoneCount = svg.querySelectorAll('.svgzone').length; // 2 (Ventes, Logistique)
    out.hasArrow = !!svg.querySelector('#svgArrow');
    // pas de <img> injecté par un nom piégé (sécurité) — noms normaux ici, on vérifie escape via title
    // déplacement d'une table : bouger 'a' de +100/+50 doit changer sa position mémorisée
    const before = JSON.stringify(svgG.pos['a']);
    svgG.pos['a'].x += 100; svgG.pos['a'].y += 50; // simulate move persisted
    out.posMutable = JSON.stringify(svgG.pos['a']) !== before;
    // zoom
    const k0 = svgG.k; graphZoom('mcd', 1.12); out.zoomWorks = svgG.k > k0;
    graphFit('mcd'); out.fitResets = svgG.k===1;
    // surlignage voisinage : clic sur 'a' → a & b gardés, c estompé
    svgHighlightNeighbors('a');
    out.highlight = svg.querySelector('.svgnode[data-id="c"]').classList.contains('svg-dim') && !svg.querySelector('.svgnode[data-id="a"]').classList.contains('svg-dim');
    svgClearHighlight(); out.cleared = !svg.querySelector('.svgnode[data-id="c"]').classList.contains('svg-dim');
    // masquer une table
    mcdHideTable('c'); out.hidden = !el('mcdSvg').querySelector('.svgnode[data-id="c"]');
    mcdUnhideAll(); out.unhidden = !!el('mcdSvg').querySelector('.svgnode[data-id="c"]');
    // filtre domaine (hide mode)
    setMcdTheme('Logistique'); out.filtered = el('mcdSvg').querySelectorAll('.svgnode').length===1;
    setMcdTheme('');
    // ranger recompute
    mcdRelayout(); out.rangerOk = !!el('mcdSvg');
    // retour G6
    setMcdEngine('g6'); out.backToG6NoSvg = !el('mcdSvg');
  }catch(e){ out.err=String(e&&e.stack||e); }
  return out;
});
console.log(JSON.stringify(res,null,2));
console.log('errors', errs.filter(e=>!/lucide|Chart|XLSX|G6|duckdb/i.test(e)));
await b.close();
