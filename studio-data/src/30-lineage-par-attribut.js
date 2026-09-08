        // ================= 🔬 LINEAGE PAR ATTRIBUT : vue en COLONNES =================
        // Applications sources -> colonnes techniques -> attributs de l'objet -> consommateurs.
        // Lisible même avec beaucoup d'applications : clic = isoler une chaîne, recherche = filtrer.
        let _afData = null;
        function renderAttrFlow(wrap) {
            const bos = state.governance.businessObjects || [];
            if (!bos.length) { wrap.innerHTML = '<p class="p-8 text-sm text-slate-400 italic text-center">Créez un objet métier pour utiliser la vue par attribut.</p>'; return; }
            if (!govState.lineageAttrBo || !bos.some(b => b.id === govState.lineageAttrBo)) govState.lineageAttrBo = bos[0].id;
            const bo = bos.find(b => b.id === govState.lineageAttrBo);
            const rows = boAllAttrRows(bo);
            const prod = new Map(), cols = new Map(), cons = new Map(), links = [];
            const attrs = [];
            rows.forEach(r => {
                const e2 = r.el; const aid = 'a:' + e2.id;
                const facetTable = r.stId ? (getBoFacets(bo).find(x => x.id === r.stId) || {}).table : null;
                const maps = r.stId ? (e2.col ? [{ table: facetTable, col: e2.col }] : []) : (e2.mappings || []);
                let srcApp = assetById(e2.sourceApp) || assetById((bo.producedBy || [])[0]) || null;
                if (!srcApp && maps[0]) { const sys = String((state.governance.dictionary[maps[0].table] || {}).sourceSystem || '').trim().toLowerCase(); if (sys) srcApp = (state.governance.assets || []).find(x => x.kind === 'app' && String(x.name).trim().toLowerCase() === sys) || null; }
                attrs.push({ id: aid, el: e2, facet: r.facet, maps, srcApp, diff: !!(e2.sourceApp && e2.sourceApp !== ((bo.producedBy || [])[0] || '')) });
                if (srcApp) prod.set(srcApp.id, srcApp);
                maps.forEach(m => { const key = m.table + '.' + m.col; cols.set(key, m); links.push(['c:' + key, aid]); if (srcApp) links.push(['p:' + srcApp.id, 'c:' + key]); });
                if (!maps.length && srcApp) links.push(['p:' + srcApp.id, aid]);
                (e2.usedBy || []).forEach(id => { const a = assetById(id); if (a) { cons.set(id, a); links.push([aid, 'u:' + id]); } });
            });
            const pill = (fid, main, sub, cls) => `<div data-fid="${escapeHTML(fid)}" onclick="attrFlowClick('${escapeHTML(fid)}')" class="af-pill cursor-pointer border rounded-lg px-2.5 py-1.5 mb-1.5 text-[11px] leading-tight ${cls}"><div class="font-bold truncate">${main}</div>${sub ? `<div class="text-[9px] opacity-70 truncate">${sub}</div>` : ''}</div>`;
            const deg = fid => links.filter(l => l[0] === fid || l[1] === fid).length;
            const colHtml = (title, items) => `<div class="flex-1 min-w-[160px] relative z-10"><div class="text-[10px] uppercase font-bold text-slate-400 mb-1.5 text-center">${title}</div>${items.join('') || '<div class="text-[10px] text-slate-300 italic text-center py-3">—</div>'}</div>`;
            const noUse = attrs.filter(a => !(a.el.usedBy || []).length).length;
            wrap.style.height = 'auto'; wrap.style.minHeight = '300px';
            wrap.innerHTML = `<div class="p-3">
                <div class="flex items-center gap-2 mb-2 flex-wrap text-[11px] text-slate-500">
                    <span class="font-bold text-slate-700">🏛️ ${escapeHTML(bo.name)}</span>
                    <span>${attrs.length} attribut(s) · ${prod.size} application(s) source · ${cons.size} consommateur(s)</span>
                    ${noUse ? `<span class="bg-amber-50 border border-amber-200 text-amber-700 rounded-full px-2 py-0.5 font-bold">😴 ${noUse} sans usage</span>` : ''}
                    <span class="text-slate-300">·</span><span>💡 cliquez un élément pour isoler sa chaîne, re-cliquez pour tout revoir</span>
                </div>
                <div id="afCard" class="hidden"></div>
                <div id="afBoard" class="relative flex gap-8 items-start">
                    <svg id="afSvg" class="absolute inset-0 w-full h-full z-0 pointer-events-none"></svg>
                    <div id="afHint" class="hidden absolute left-1/2 top-24 -translate-x-1/2 z-20 bg-white/95 border border-indigo-200 rounded-full px-4 py-2 text-[11px] font-bold text-indigo-700 shadow-sm pointer-events-none">👆 Cliquez un attribut, une colonne ou une application : sa chaîne s'affiche seule, le reste s'estompe</div>
                    ${colHtml('🖥 Applications sources', [...prod.values()].sort((x, y) => deg('p:' + y.id) - deg('p:' + x.id)).map(a => pill('p:' + a.id, '🖥 ' + escapeHTML(a.name), deg('p:' + a.id) + ' flux', 'bg-slate-100 border-slate-300 text-slate-700')))}
                    ${colHtml('📄 Colonnes techniques', [...cols.entries()].map(([k, m]) => pill('c:' + k, escapeHTML(m.col), escapeHTML(m.table), 'bg-blue-50 border-blue-200 text-blue-800')))}
                    ${colHtml('🏛️ Attributs de l\'objet', attrs.map(a => pill(a.id, escapeHTML(a.el.name) + (a.diff ? ' <span class="text-amber-600 font-black">≠</span>' : '') + ((a.el.usedBy || []).length ? '' : ' 😴'), a.facet ? '◆ ' + escapeHTML(a.facet) : '', 'bg-emerald-50 border-emerald-300 text-emerald-900')))}
                    ${colHtml('🖥⚙️ Consommateurs', [...cons.values()].sort((x, y) => deg('u:' + y.id) - deg('u:' + x.id)).map(a => pill('u:' + a.id, escapeHTML(assetLabel(a)), deg('u:' + a.id) + ' attribut(s)', a.kind === 'app' ? 'bg-slate-100 border-slate-300 text-slate-700' : 'bg-orange-50 border-orange-200 text-orange-800')))}
                </div>
                ${prod.size || cons.size ? '' : '<p class="text-[11px] text-amber-600 mt-2">⚠️ Déclarez les sources et usages dans la fiche de l\'objet (onglet 🔌 Applis & usages) pour peupler cette vue.</p>'}
            </div>`;
            const attrMap = {};
            attrs.forEach(a => { attrMap[a.id] = {
                name: a.el.name, facet: a.facet, diff: a.diff,
                app: a.srcApp ? a.srcApp.name : null,
                cols: a.maps.map(m => ({ table: m.table, col: m.col })),
                cons: (a.el.usedBy || []).map(id => assetById(id)).filter(Boolean).map(x => ({ name: x.name, kind: x.kind })) }; });
            _afData = { links, focus: null, attrs: attrMap };
            requestAnimationFrame(attrFlowDraw);
        }
        // Mini-carte « parcours » d'un attribut : amont (application source + colonnes techniques)
        // → cet attribut → aval (consommateurs). Affichée en plus du flux, refermable.
        function attrFlowCard(fid) {
            const box = el('afCard'); if (!box) return;
            const a = _afData && _afData.attrs ? _afData.attrs[fid] : null;
            if (!a) { box.classList.add('hidden'); box.innerHTML = ''; return; }
            const chip = (txt, cls) => `<div class="text-[11px] ${cls} border rounded px-2 py-1 mb-1 truncate font-semibold">${txt}</div>`;
            const zone = (title, items, empty) => `<div class="flex-1 min-w-[150px]"><div class="text-[9px] uppercase font-bold text-slate-400 mb-1">${title}</div>${items.length ? items.join('') : `<div class="text-[10px] text-slate-300 italic">${empty}</div>`}</div>`;
            const amont = [];
            if (a.app) amont.push(chip('🖥 ' + escapeHTML(a.app), 'bg-slate-100 border-slate-300 text-slate-700'));
            a.cols.forEach(c => amont.push(chip('📄 ' + escapeHTML(c.col) + ' <span class="opacity-60">(' + escapeHTML(c.table) + ')</span>', 'bg-blue-50 border-blue-200 text-blue-800')));
            const aval = a.cons.map(c => chip((c.kind === 'app' ? '🖥 ' : '⚙️ ') + escapeHTML(c.name), c.kind === 'app' ? 'bg-slate-100 border-slate-300 text-slate-700' : 'bg-orange-50 border-orange-200 text-orange-800'));
            box.className = 'mb-3 border border-emerald-200 bg-emerald-50/40 rounded-xl p-3';
            box.innerHTML = `<div class="flex items-center justify-between mb-2">
                    <span class="text-[11px] font-bold text-emerald-800">🔎 Parcours de « ${escapeHTML(a.name)} »</span>
                    <button onclick="attrFlowClick('${escapeHTML(fid)}')" class="text-[10px] text-slate-400 hover:text-slate-600 font-bold">✕ fermer</button></div>
                <div class="flex items-stretch gap-2">
                    ${zone('D\'où vient la donnée (amont)', amont, 'source non déclarée')}
                    <div class="flex items-center text-slate-300 font-black">→</div>
                    <div class="flex-1 min-w-[130px]"><div class="text-[9px] uppercase font-bold text-slate-400 mb-1">Cet attribut</div>
                        <div class="text-[12px] bg-emerald-100 border border-emerald-300 text-emerald-900 rounded px-2 py-2 font-bold">🏛️ ${escapeHTML(a.name)}${a.facet ? `<div class="text-[9px] font-medium opacity-70">◆ ${escapeHTML(a.facet)}</div>` : ''}${a.diff ? '<div class="text-[9px] text-amber-600 font-bold">≠ source différente du producteur</div>' : ''}</div></div>
                    <div class="flex items-center text-slate-300 font-black">→</div>
                    ${zone('Où elle est utilisée (aval)', aval, '😴 aucun usage déclaré')}
                </div>`;
            box.classList.remove('hidden');
        }
        function attrFlowDraw() {
            const board = el('afBoard'), svg = el('afSvg'); if (!board || !svg || !_afData) return;
            const keep = _afData.focusSet;
            const many = _afData.links.length > 30;
            const hint = el('afHint'); if (hint) hint.classList.toggle('hidden', !!keep || !many);
            const els = {}; board.querySelectorAll('.af-pill').forEach(x => els[x.getAttribute('data-fid')] = x);
            svg.setAttribute('viewBox', `0 0 ${board.clientWidth} ${board.scrollHeight}`);
            svg.style.height = board.scrollHeight + 'px';
            let paths = '';
            _afData.links.forEach(([f, t]) => {
                const A = els[f], B = els[t]; if (!A || !B) return;
                const onChain = keep && keep.has(f) && keep.has(t);
                // Lisibilité d'abord : quand c'est dense, AUCUNE courbe hors sélection —
                // la pelote de 80 liens ne se dessine plus jamais.
                if (!onChain && many) return;
                const dimmed = keep && !onChain;
                const x1 = A.offsetLeft + A.offsetWidth, y1 = A.offsetTop + A.offsetHeight / 2;
                const x2 = B.offsetLeft, y2 = B.offsetTop + B.offsetHeight / 2;
                const mx = (x1 + x2) / 2;
                paths += `<path d="M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}" fill="none" stroke="${dimmed ? '#e2e8f0' : (f.startsWith('a:') || t.startsWith('u:') ? '#ea580c' : '#4f46e5')}" stroke-width="${dimmed ? 1 : (onChain ? 2.4 : 1.6)}" stroke-opacity="${dimmed ? 0.4 : 0.9}"/>`;
            });
            svg.innerHTML = paths;
            board.querySelectorAll('.af-pill').forEach(x => {
                const fid = x.getAttribute('data-fid');
                const on = !keep || keep.has(fid);
                x.style.opacity = on ? '' : '0.15';
                x.style.boxShadow = keep && on ? '0 0 0 2px ' + (fid === _afData.focus ? '#4f46e5' : '#a5b4fc') : '';
                x.style.fontWeight = keep && fid === _afData.focus ? '800' : '';
            });
        }
        function attrFlowClick(fid) {
            if (!_afData) return;
            if (_afData.focus === fid) { _afData.focus = null; _afData.focusSet = null; attrFlowCard(null); attrFlowDraw(); return; }
            _afData.focus = fid;
            _afData.focusSet = attrFlowChain([fid]);
            attrFlowCard(fid.startsWith('a:') ? fid : null);
            attrFlowDraw();
        }
        // Chaîne de bout en bout ORIENTÉE : on remonte l'amont et on descend l'aval du noeud
        // choisi, sans jamais « rebondir » latéralement par les applications-hubs — cliquer un
        // attribut n'allume donc que SES colonnes, SON application source et SES consommateurs.
        function attrFlowChain(startIds) {
            const fwd = {}, back = {};
            _afData.links.forEach(([f, t]) => { (fwd[f] = fwd[f] || []).push(t); (back[t] = back[t] || []).push(f); });
            const keep = new Set(startIds);
            let q = [...startIds];
            while (q.length) { const u = q.shift(); (fwd[u] || []).forEach(v => { if (!keep.has(v)) { keep.add(v); q.push(v); } }); }
            q = [...startIds];
            const backSeen = new Set(startIds);
            while (q.length) { const u = q.shift(); (back[u] || []).forEach(v => { if (!backSeen.has(v)) { backSeen.add(v); keep.add(v); q.push(v); } }); }
            return keep;
        }
        function attrFlowApplyFocus() {
            if (!_afData) return;
            const q = srcNorm(govState.lineageAttrQ || '');
            if (!q) { _afData.focus = null; _afData.focusSet = null; attrFlowDraw(); return; }
            const board = el('afBoard'); if (!board) return;
            const keep = new Set();
            board.querySelectorAll('.af-pill').forEach(x => {
                const fid = x.getAttribute('data-fid');
                if (!fid.startsWith('a:')) return;
                if (srcNorm(x.textContent).includes(q)) attrFlowChain([fid]).forEach(v => keep.add(v));
            });
            _afData.focus = '__search__'; _afData.focusSet = keep; attrFlowCard(null); attrFlowDraw();
        }
        function _renderLineageImpl(wrap) {
            const nodes = [], edges = [], seen = new Set();
            const showSrcs = govState.lineageSrcs !== false, showBos = govState.lineageBos !== false;
            // V6.7 : par défaut, un fichier source est INTÉGRÉ à l'application qui le produit — ses liens
            // sont reportés sur l'application (c'est elle le maître, pas le fichier).
            const foldSrc = govState.lineageFoldSrc !== false && govState.lineageApps !== false;
            const srcFold = {}; const foldOwners = new Set(); const foldNames = {};
            if (showSrcs) Object.values(state.tables).filter(t => t.status === 'ready').forEach(t => {
                const own = foldSrc ? appOwnerOfSource(t.name) : null;
                seen.add(t.name);
                if (own) { srcFold['tbl:' + t.name] = 'as:' + own.id; foldOwners.add(own.id); (foldNames[own.id] = foldNames[own.id] || []).push(t.name); return; }
                const colors = t.type === 'extraction' ? ['#f3e8ff', '#7c3aed'] : (t.type === 'api' ? ['#cffafe', '#0891b2'] : ['#dbeafe', '#2563eb']);
                nodes.push({ id: 'tbl:' + t.name, type: 'studio-rich-node', title: t.name, content: (state.governance.dictionary[t.name] || {}).sourceSystem || '', fill: colors[0], stroke: colors[1] });
            });
            Object.keys(state.governance.lineage).forEach(derived => {
                if (!seen.has(derived)) return;
                (state.governance.lineage[derived].from || []).forEach(src => {
                    if (seen.has(src) && src !== derived) edges.push({ id: 'lin:' + src + '>' + derived, source: 'tbl:' + src, target: 'tbl:' + derived, label: 'alimente', style: { stroke: '#7c3aed', lineWidth: 2, endArrow: { path: '', fill: '#7c3aed' } } });
                });
            });
            state.relations.forEach(r => {
                const sN = state.tables[r.sourceTable] ? state.tables[r.sourceTable].name : null;
                const tN = state.tables[r.targetTable] ? state.tables[r.targetTable].name : null;
                if (sN && tN && r.sourceCol && r.targetCol && seen.has(sN) && seen.has(tN)) {
                    const isSelf = sN === tN;
                    edges.push({ id: 'rel:' + r.id, source: 'tbl:' + sN, target: 'tbl:' + tN, label: (isSelf ? '🌳 ' : '') + relEdgeLabel(r), type: isSelf ? 'loop' : undefined, loopCfg: isSelf ? { position: 'top', dist: 40 } : undefined, style: isSelf ? { stroke: '#059669', lineWidth: 1.5 } : { stroke: '#cbd5e1', lineDash: [4, 3] } });
                }
            });
            // ---- Applications (amont) & Processus (aval) : le lineage de bout en bout ----
            const showApps = govState.lineageApps !== false, showProcs = govState.lineageProcs !== false;
            const assets = state.governance.assets || [];
            const usedAssets = new Set();
            foldOwners.forEach(id => usedAssets.add(id)); // une appli qui absorbe ses sources reste affichée
            const assetOk = a => a && ((a.kind === 'app' && showApps) || (a.kind === 'process' && showProcs));
            if (showApps) Object.values(state.tables).filter(t => t.status === 'ready').forEach(t => {
                const sys = String((state.governance.dictionary[t.name] || {}).sourceSystem || '').trim().toLowerCase(); if (!sys) return;
                const a = assets.find(x => x.kind === 'app' && String(x.name).trim().toLowerCase() === sys); if (!a) return;
                usedAssets.add(a.id);
                edges.push({ id: 'app:' + a.id + '>' + t.name, source: 'as:' + a.id, target: 'tbl:' + t.name, label: 'produit', style: { stroke: '#334155', lineWidth: 2, endArrow: { path: '', fill: '#334155' } } });
            });
            (state.governance.businessObjects || []).forEach(bo => {
                (bo.producedBy || []).forEach(id => { const a = assetById(id); if (!assetOk(a)) return; usedAssets.add(id); edges.push({ id: 'prod:' + id + '>' + bo.id, source: 'as:' + id, target: 'bo:' + bo.id, label: 'produit', style: { stroke: '#334155', lineWidth: 2, endArrow: { path: '', fill: '#334155' } } }); });
                (bo.consumedBy || []).forEach(id => { const a = assetById(id); if (!assetOk(a)) return; usedAssets.add(id); edges.push({ id: 'cons:' + bo.id + '>' + id, source: 'bo:' + bo.id, target: 'as:' + id, label: 'consommé par', style: { stroke: '#ea580c', lineWidth: 1.6, endArrow: { path: '', fill: '#ea580c' } } }); });
            });
            // Un processus s'appuie sur une ou plusieurs applications (v3.7).
            assets.filter(a2 => a2.kind === 'process').forEach(pr => {
                if (!assetOk(pr)) return;
                (pr.appIds || []).forEach(id => { const a = assetById(id); if (!assetOk(a)) return; usedAssets.add(id); usedAssets.add(pr.id); edges.push({ id: 'papp:' + id + '>' + pr.id, source: 'as:' + id, target: 'as:' + pr.id, label: 'outille', style: { stroke: '#94a3b8', lineDash: [4, 3], endArrow: { path: '', fill: '#94a3b8' } } }); });
                const linkedTables = new Set([...(pr.tables || []), ...(pr.columns || []).map(c => c.table)]);
                linkedTables.forEach(tn => { if (seen.has(tn)) { usedAssets.add(pr.id); edges.push({ id: 'use:' + pr.id + ':' + tn, source: 'tbl:' + tn, target: 'as:' + pr.id, label: 'utilisé par', style: { stroke: '#d97706', endArrow: { path: '', fill: '#d97706' } } }); } });
            });
            assets.forEach(a => { if (!usedAssets.has(a.id)) return; const isApp = a.kind === 'app';
                const fn = foldNames[a.id] || [];
                const sub = [assetDomainEff(a), a.criticality || '', fn.length ? '📦 ' + fn.length + ' source' + (fn.length > 1 ? 's' : '') + ' : ' + fn.slice(0, 3).join(', ') + (fn.length > 3 ? '…' : '') : ''].filter(Boolean).join(' · ');
                nodes.push({ id: 'as:' + a.id, type: 'studio-rich-node', title: (isApp ? '🖥 ' : '⚙️ ') + a.name, content: sub, fill: isApp ? '#e2e8f0' : '#ffedd5', stroke: isApp ? '#334155' : '#ea580c' }); });
            if (showBos) state.governance.businessObjects.forEach(bo => {
                // Vision fine : les attributs de l'objet avec leur colonne source (mode 🔬).
                if (govState.lineageBoDetail && (bo.elements || []).length) {
                    const rows = (bo.elements || []).slice(0, 14).map(e2 => { const m = (e2.mappings || [])[0];
                        const srcA = e2.sourceApp && e2.sourceApp !== ((bo.producedBy || [])[0] || '') ? assetById(e2.sourceApp) : null;
                        return e2.name + (m ? '  ←  ' + m.table + '.' + m.col : '') + (srcA ? '  [src: ' + srcA.name + ']' : '') + (((e2.usedBy || []).length || !(state.governance.assets || []).length) ? '' : '  😴'); });
                    if ((bo.elements || []).length > 14) rows.push('… +' + ((bo.elements || []).length - 14) + ' attribut(s)');
                    nodes.push({ id: 'bo:' + bo.id, type: 'studio-uml-node', title: '🏛️ ' + bo.name, rows, headFill: '#dcfce7', titleFill: '#14532d', stroke: '#16a34a' });
                } else
                nodes.push({ id: 'bo:' + bo.id, type: 'studio-rich-node', title: '🏛️ ' + bo.name, content: bo.globalOwner ? 'Prop. : ' + bo.globalOwner : '⚠️ sans propriétaire', fill: '#dcfce7', stroke: '#16a34a' });
                const declared = new Set();
                // Circulation de la donnée selon le rôle : maître/contributeur alimentent l'objet,
                // l'objet est diffusé vers les destinataires.
                (bo.sources || []).forEach(s => {
                    if (!seen.has(s.table)) return; declared.add(s.table);
                    if (s.role === 'maitre') edges.push({ id: 'bos:' + bo.id + ':' + s.table, source: 'tbl:' + s.table, target: 'bo:' + bo.id, label: '👑 maître', style: { stroke: '#16a34a', lineWidth: 2.5, endArrow: { path: '', fill: '#16a34a' } } });
                    else if (s.role === 'contributeur') edges.push({ id: 'bos:' + bo.id + ':' + s.table, source: 'tbl:' + s.table, target: 'bo:' + bo.id, label: 'contribue', style: { stroke: '#16a34a', lineDash: [4, 3], endArrow: { path: '', fill: '#16a34a' } } });
                    else edges.push({ id: 'bos:' + bo.id + ':' + s.table, source: 'bo:' + bo.id, target: 'tbl:' + s.table, label: 'diffusé vers', style: { stroke: '#0d9488', endArrow: { path: '', fill: '#0d9488' } } });
                });
                // Maîtres contextuels (règles de maîtrise) : la source fait foi pour certaines valeurs
                // du contexte seulement — flèche maître en pointillés longs, sauf si déjà maître global.
                const globalMasters = new Set((bo.sources || []).filter(s => s.role === 'maitre').map(s => s.table));
                const ctxElem = (bo.elements || []).find(e2 => e2.id === (bo.contextRules || {}).elementId);
                const ctxMasters = new Set((((bo.contextRules || {}).rules) || []).map(r => r.masterTable).filter(Boolean));
                ctxMasters.forEach(tn => { if (seen.has(tn) && !globalMasters.has(tn)) edges.push({ id: 'boc:' + bo.id + ':' + tn, source: 'tbl:' + tn, target: 'bo:' + bo.id, label: `👑 maître selon ${ctxElem ? ctxElem.name : 'contexte'}`, style: { stroke: '#16a34a', lineWidth: 2, lineDash: [8, 4], endArrow: { path: '', fill: '#16a34a' } } }); });
                // Tables mappées via les sous-éléments mais sans rôle déclaré : simple lien descriptif.
                const linkedTables = new Set(); (bo.elements || []).forEach(e2 => (e2.mappings || []).forEach(m => linkedTables.add(m.table)));
                linkedTables.forEach(tn => { if (seen.has(tn) && !declared.has(tn) && !ctxMasters.has(tn)) edges.push({ id: 'bo:' + bo.id + ':' + tn, source: 'tbl:' + tn, target: 'bo:' + bo.id, label: 'décrit', style: { stroke: '#86efac', lineDash: [2, 3], endArrow: { path: '', fill: '#86efac' } } }); });
            });
            // Sources repliées : leurs liens sont reportés sur l'application qui les produit ; le lien
            // « produit » app → fichier devient interne (self-edge) et disparaît, puis on dédoublonne.
            const _fm = id => srcFold[id] || id;
            const _fseen = new Set(); const foldedEdges = [];
            edges.forEach(e => {
                const s = _fm(e.source), t = _fm(e.target);
                if (s === t) return;
                const k = s + '¦' + t + '¦' + (e.label || '');
                if (_fseen.has(k)) return; _fseen.add(k);
                foldedEdges.push((s === e.source && t === e.target) ? e : Object.assign({}, e, { source: s, target: t }));
            });
            // Les liens vers des nœuds masqués par les filtres sont écartés.
            const nodeIds = new Set(nodes.map(n => n.id));
            const shownEdges = foldedEdges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target));
            if (lineageGraph) { lineageGraph.destroy(); lineageGraph = null; }
            lineageGraph = createSvgGraph(wrap, { type: 'dagre', rankdir: 'LR', nodesep: 18, ranksep: 80 }, {
                width: wrap.clientWidth || 900, height: wrap.clientHeight || 550,
                defaultEdge: { type: 'cubic-horizontal', labelCfg: { autoRotate: true, style: { fill: '#64748b', fontSize: 9, background: { fill: '#fff', stroke: '#e2e8f0', padding: [2, 4, 2, 4], radius: 3 } } } },
            });
            pinNodeOnDrag(lineageGraph);
            lineageGraph.data({ nodes, edges: shownEdges });
            lineageGraph.render();
            lineageGraph.fitView(20);
            // Chaîne de bout en bout au clic + recherche « aller à ».
            window._linData = { nodes, edges: shownEdges };
            window._linFocus = null;
            lineageGraph.on('node:click', ev => { const id = ev.item && ev.item.getID ? ev.item.getID() : null; if (id) lineageChainFocus(id); });
            const dl = el('linGotoList'); if (dl) dl.innerHTML = nodes.map(n => `<option value="${escapeHTML(n.title)}">`).join('');
        }
        // Mise en évidence de la chaîne COMPLÈTE (amont + aval) d'un nœud du lineage.
        function lineageChainFocus(id) {
            const hint = el('lineageHint');
            if (!lineageGraph || !window._linData) return;
            if (window._linFocus === id) { window._linFocus = null; lineageGraph.dimExcept(null); if (hint) hint.classList.add('hidden'); return; }
            window._linFocus = id;
            const up = {}, down = {};
            window._linData.edges.forEach(e => { (down[e.source] = down[e.source] || []).push(e.target); (up[e.target] = up[e.target] || []).push(e.source); });
            const keep = new Set([id]);
            const bfs = adj => { const q = [id]; const vis = new Set([id]); while (q.length) { const u = q.shift(); (adj[u] || []).forEach(v => { if (!vis.has(v)) { vis.add(v); keep.add(v); q.push(v); } }); } };
            bfs(up); bfs(down);
            lineageGraph.dimExcept(keep);
            const n0 = window._linData.nodes.find(n => n.id === id);
            if (hint) { hint.classList.remove('hidden'); hint.innerHTML = `🔗 Chaîne de <strong>${escapeHTML(n0 ? n0.title : id)}</strong> : ${keep.size} élément(s) de bout en bout (amont + aval). <button onclick="lineageChainFocus('${escapeHTML(id)}')" class="ml-2 text-[10px] bg-white border border-emerald-300 rounded px-1.5 py-0.5 font-bold">effacer</button>`; }
        }
        function lineageGoto(title) {
            if (!window._linData || !lineageGraph) return;
            const n0 = window._linData.nodes.find(n => n.title === title); if (!n0) return;
            lineageGraph.centerOn(n0.id);
            lineageChainFocus(n0.id);
        }
        function lineageFullscreen() {
            const w = el('lineageFsWrap'); if (!w) return;
            if (document.fullscreenElement) { document.exitFullscreen().catch(() => {}); }
            else { w.requestFullscreen().then(() => setTimeout(() => reflowGraph('lineage'), 200)).catch(e => showError('Plein écran refusé : ' + e.message)); }
        }
        document.addEventListener('fullscreenchange', () => { if (el('lineageFsWrap')) setTimeout(() => reflowGraph('lineage'), 150); });

