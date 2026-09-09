        // ======================= V12 : LINEAGE D'UN OBJET — VISION SYNTHÉTIQUE ET COMPLÈTE =======================
        // Le graphe d'un objet ne montrait que les applications déclarées sur l'objet (producteurs,
        // consommateurs) et les tables de la fiche Sources. Tout ce qui est rattaché au niveau des
        // ATTRIBUTS restait invisible : application source propre à un attribut, tables des colonnes
        // rattachées et des composants (et l'application qui les produit), objets d'origine (V12.6),
        // objets qui reprennent des attributs, objets référencés, processus qui lisent les tables.
        // Ici : tout est ajouté au graphe, regroupé par application / objet (une flèche « n attribut(s) »
        // plutôt qu'un nœud par attribut), et un panneau « Synthèse » liste chaque élément relié avec
        // son rôle, pour que rien ne soit caché. Le moteur de gouvernance n'est pas modifié.
        function v12BoLinTables(bo) {
            const out = {}; const rows = boAllAttrRows(bo) || [];
            rows.forEach(r => {
                const e2 = r.el; const ft = r.stId ? ((getBoFacets(bo).find(x => x.id === r.stId) || {}).table) : null;
                const maps = r.stId ? (e2.col ? [{ table: ft, col: e2.col }] : []) : (e2.mappings || []);
                maps.forEach(m => { if (!m || !m.table) return; const t = out[m.table] = out[m.table] || { n: 0, cols: [] }; t.n++; if (m.col && !t.cols.includes(m.col)) t.cols.push(m.col); });
            });
            getBoFacets(bo).forEach(st => { if (st.table && !out[st.table]) out[st.table] = { n: 0, cols: [], facet: st.name }; });
            return out;
        }
        const _v12blBuild = buildBoLineageGraph;
        buildBoLineageGraph = function (bo, opts) {
            const gr = _v12blBuild.apply(this, arguments);
            try {
                const files = opts && opts.files !== undefined ? !!opts.files : lineageFilesOn();
                const G = state.governance; const boId = 'bo:' + bo.id; const rows = boAllAttrRows(bo) || [];
                const has = id => gr.nodes.some(n => n.id === id); const add = n => { if (!has(n.id)) gr.nodes.push(n); };
                const edge = (s, t) => gr.edges.find(e => e.source === s && e.target === t);
                const GRAY = { stroke: '#334155', lineWidth: 1.5, endArrow: { path: '', fill: '#334155' } }, BLUE = { stroke: '#2563eb', endArrow: { path: '', fill: '#2563eb' } }, ORANGE = { stroke: '#ea580c', endArrow: { path: '', fill: '#ea580c' } }, PURPLE = { stroke: '#7c3aed', lineWidth: 2, endArrow: { path: '', fill: '#7c3aed' } }, TEAL = { stroke: '#0d9488', lineDash: [4, 3], endArrow: { path: '', fill: '#0d9488' } };
                const appNode = a => ({ id: 'as:' + a.id, type: 'studio-rich-node', title: (a.kind === 'process' ? '⚙️ ' : '🖥 ') + a.name, content: a.kind === 'process' ? 'processus' : (a.criticality || 'application'), fill: a.kind === 'process' ? '#ffedd5' : '#e2e8f0', stroke: a.kind === 'process' ? '#ea580c' : '#334155' });
                const BO = id => (G.businessObjects || []).find(b => b.id === id);
                const srcTables = new Set((bo.sources || []).filter(s => s && s.table).map(s => s.table));
                // 1. Applications sources propres à des attributs
                const byApp = {};
                rows.forEach(r => { const a = assetById(r.el.sourceApp); if (a && !(bo.producedBy || []).includes(a.id)) { (byApp[a.id] = byApp[a.id] || { a, n: 0 }).n++; } });
                Object.values(byApp).forEach(({ a, n }) => { const id = 'as:' + a.id; add(appNode(a)); const e = edge(id, boId); if (e) e.label += ' · ' + n + ' attribut(s)'; else gr.edges.push({ id: 'v12p' + a.id, source: id, target: boId, label: 'produit ' + n + ' attribut(s)', style: GRAY }); });
                // 2. Tables des colonnes rattachées et des composants, hors fiche Sources, et leur application
                const tabs = v12BoLinTables(bo);
                Object.entries(tabs).forEach(([t, info]) => {
                    if (srcTables.has(t)) return;
                    const own = appOwnerOfSource(t); const what = info.n ? info.n + ' attribut(s)' : ('composant « ' + info.facet + ' »');
                    if (!files && own) { const id = 'as:' + own.id; add(appNode(own)); const e = edge(id, boId); if (e) e.label += ' · ' + what + ' via ' + t; else gr.edges.push({ id: 'v12t' + t, source: id, target: boId, label: 'alimente ' + what + ' via ' + t, style: GRAY }); const nn = gr.nodes.find(x => x.id === id); if (nn && !/via /.test(nn.content)) nn.content = 'via ' + t; else if (nn && !nn.content.includes(t)) nn.content += ', ' + t; return; }
                    const tid = 'tbl:' + t;
                    add({ id: tid, type: 'studio-rich-node', title: '▦ ' + t, content: 'alimente ' + what + (own ? '' : ' · sans application'), fill: '#dbeafe', stroke: '#2563eb' });
                    if (!edge(tid, boId)) gr.edges.push({ id: 'v12tb' + t, source: tid, target: boId, label: 'alimente ' + what, style: BLUE });
                    if (own) { add(appNode(own)); if (!edge('as:' + own.id, tid)) gr.edges.push({ id: 'v12to' + t, source: 'as:' + own.id, target: tid, label: 'produit', style: GRAY }); }
                });
                // 3. Objets amont (origines des attributs) et objets aval (qui reprennent des attributs)
                if (typeof v12OrgList === 'function') {
                    const up = {};
                    rows.forEach(r => v12OrgList(r.el).forEach(o => { if (o.boId === bo.id) return; const u = up[o.boId] = up[o.boId] || { n: 0, kinds: [] }; u.n++; if (!u.kinds.includes(o.kind)) u.kinds.push(o.kind); }));
                    Object.entries(up).forEach(([id, u]) => { const ob = BO(id); if (!ob) return; const nid = 'bo:' + id; add({ id: nid, type: 'studio-rich-node', title: '🏛️ ' + ob.name, content: 'objet amont', fill: '#ede9fe', stroke: '#7c3aed' }); if (!edge(nid, boId)) gr.edges.push({ id: 'v12ou' + id, source: nid, target: boId, label: u.n + ' attribut(s) repris (' + u.kinds.map(k => v12OrgKindLbl(k).toLowerCase()).join(', ') + ')', style: PURPLE }); });
                    const down = {};
                    (G.businessObjects || []).forEach(ob => { if (ob.id === bo.id) return; (boAllAttrRows(ob) || []).forEach(r => v12OrgList(r.el).forEach(o => { if (o.boId === bo.id) (down[ob.id] = down[ob.id] || { n: 0 }).n++; })); });
                    Object.entries(down).forEach(([id, d]) => { const ob = BO(id); if (!ob) return; const nid = 'bo:' + id; add({ id: nid, type: 'studio-rich-node', title: '🏛️ ' + ob.name, content: 'objet aval', fill: '#ede9fe', stroke: '#7c3aed' }); if (!edge(boId, nid)) gr.edges.push({ id: 'v12od' + id, source: boId, target: nid, label: 'reprend ' + d.n + ' attribut(s)', style: PURPLE }); });
                }
                // 4. Objets référencés / qui référencent
                (bo.references || []).forEach(rf => { const ob = BO(rf.boId); if (!ob) return; const nid = 'bo:' + ob.id; add({ id: nid, type: 'studio-rich-node', title: '🏛️ ' + ob.name, content: 'objet référencé', fill: '#ccfbf1', stroke: '#0d9488' }); if (!edge(boId, nid)) gr.edges.push({ id: 'v12rf' + ob.id, source: boId, target: nid, label: 'référence' + (rf.cardinality ? ' ' + rf.cardinality : ''), style: TEAL }); });
                (G.businessObjects || []).forEach(ob => { if (ob.id === bo.id) return; (ob.references || []).forEach(rf => { if (rf.boId !== bo.id) return; const nid = 'bo:' + ob.id; add({ id: nid, type: 'studio-rich-node', title: '🏛️ ' + ob.name, content: 'objet qui référence', fill: '#ccfbf1', stroke: '#0d9488' }); if (!edge(nid, boId)) gr.edges.push({ id: 'v12rb' + ob.id, source: nid, target: boId, label: 'référencé par', style: TEAL }); }); });
                // 5. Processus et applications qui lisent les tables de l'objet
                const allTables = new Set([...srcTables, ...Object.keys(tabs)]);
                (G.assets || []).forEach(a => {
                    const used = [...allTables].filter(t => (a.tables || []).includes(t) || (a.columns || []).some(c => c && c.table === t));
                    if (!used.length || (a.kind === 'app' && (a.sources || []).some(t => allTables.has(t)))) return; // une appli qui PRODUIT la table n'est pas un lecteur
                    add(appNode(a)); if (!edge(boId, 'as:' + a.id) && !edge('as:' + a.id, boId)) gr.edges.push({ id: 'v12ut' + a.id, source: boId, target: 'as:' + a.id, label: 'lit ' + used.join(', '), style: ORANGE });
                });
                // 6. Les nœuds « aucune source / aucun usage » ne se justifient plus si quelque chose est relié
                const isRef = e => /^v12r[fb]/.test(String(e.id)); // une référence entre objets n'est ni une source ni un usage
                if (gr.edges.some(e => e.target === boId && e.source !== 'nosrc' && !isRef(e))) { gr.nodes = gr.nodes.filter(n => n.id !== 'nosrc'); gr.edges = gr.edges.filter(e => e.source !== 'nosrc'); }
                if (gr.edges.some(e => e.source === boId && e.target !== 'nouse' && !isRef(e))) { gr.nodes = gr.nodes.filter(n => n.id !== 'nouse'); gr.edges = gr.edges.filter(e => e.target !== 'nouse'); }
            } catch (e) { console.warn('v12 lineage objet', e); }
            return gr;
        };
        // ---- synthèse : tout ce qui est relié, avec son rôle ----
        function v12BoLinSynth(bo, gr) {
            const boId = 'bo:' + bo.id; const rows = [];
            gr.nodes.filter(n => n.id !== boId && n.id !== 'nosrc' && n.id !== 'nouse').forEach(n => {
                const ins = gr.edges.filter(e => e.source === n.id && e.target === boId), outs = gr.edges.filter(e => e.target === n.id && e.source === boId);
                const other = gr.edges.filter(e => (e.source === n.id || e.target === n.id) && e.source !== boId && e.target !== boId);
                let dir = 'amont', how = '';
                if (ins.length) how = ins.map(e => e.label).filter(Boolean).join(' · ');
                else if (outs.length) { dir = 'aval'; how = outs.map(e => e.label).filter(Boolean).join(' · '); }
                else if (other.length) { const o = other[0]; const tgt = gr.nodes.find(x => x.id === (o.source === n.id ? o.target : o.source)); dir = o.source === n.id ? 'amont' : 'aval'; how = (o.label || 'lié') + ' → ' + (tgt ? tgt.title.replace(/^[^\w]+/, '') : ''); }
                const kind = n.id.startsWith('as:') ? (n.title.startsWith('⚙️') ? 'processus' : 'application') : (n.id.startsWith('bo:') ? 'objet' : 'fichier');
                rows.push({ id: n.id, title: n.title, kind, dir, how, sub: n.content || '' });
            });
            const order = { application: 0, fichier: 1, objet: 2, processus: 3 };
            rows.sort((a, b) => (a.dir === b.dir ? 0 : (a.dir === 'amont' ? -1 : 1)) || (order[a.kind] - order[b.kind]) || a.title.localeCompare(b.title, 'fr'));
            return rows;
        }
        function v12BoLinSynthHtml(bo, gr) {
            const rows = v12BoLinSynth(bo, gr); const cnt = (dir, kind) => rows.filter(r => r.dir === dir && r.kind === kind).length;
            const chip = (n, l, cls) => n ? `<span class="v12bl-chip ${cls}"><b>${n}</b> ${l}</span>` : '';
            const up = chip(cnt('amont', 'application'), 'application(s) source', 'app') + chip(cnt('amont', 'fichier'), 'fichier(s)', 'tbl') + chip(cnt('amont', 'objet'), 'objet(s) amont', 'obj');
            const dn = chip(cnt('aval', 'application'), 'application(s) consommatrice(s)', 'app') + chip(cnt('aval', 'processus'), 'processus', 'proc') + chip(cnt('aval', 'objet'), 'objet(s) aval', 'obj') + chip(cnt('aval', 'fichier'), 'fichier(s) destinataire(s)', 'tbl');
            const tr = r => `<tr class="${r.dir}"><td><span class="v12bl-dir ${r.dir}">${r.dir === 'amont' ? '⇠ amont' : 'aval ⇢'}</span></td><td><b>${escapeHTML(r.title)}</b>${r.sub ? `<span class="sub">${escapeHTML(r.sub)}</span>` : ''}</td><td>${escapeHTML(r.kind)}</td><td>${escapeHTML(r.how)}</td></tr>`;
            return `<div class="v12bl-synth" data-ro="keep">
                <div class="v12bl-head"><span class="v12bl-t">Synthèse</span>${up || '<span class="v12bl-none">aucune source reliée</span>'}<span class="v12bl-obj">🏛️ ${escapeHTML(bo.name)}</span>${dn || '<span class="v12bl-none">aucun consommateur relié</span>'}</div>
                <details class="v12bl-list" ${rows.length && rows.length <= 12 ? 'open' : ''}><summary>Tout ce qui est relié à l'objet (${rows.length}) — rien n'est masqué</summary>
                <div class="overflow-x-auto"><table class="v11-tbl v12bl-tbl"><thead><tr><th>Sens</th><th>Élément</th><th>Type</th><th>Rôle</th></tr></thead><tbody>${rows.map(tr).join('') || '<tr><td colspan="4" class="v12bl-none">Rien n\'est relié : déclarez les sources, applications et usages dans la fiche.</td></tr>'}</tbody></table></div></details></div>`;
        }
        const _v12blOpen = openBoLineage;
        openBoLineage = function (boId) {
            const r = _v12blOpen.apply(this, arguments);
            try {
                const bo = (state.governance.businessObjects || []).find(x => x.id === boId); const wrap = el('attrLineageWrap'); if (!bo || !wrap) return r;
                const gr = buildBoLineageGraph(bo);
                const old = el('attrLineageBox').querySelector('.v12bl-synth'); if (old) old.remove();
                wrap.insertAdjacentHTML('beforebegin', v12BoLinSynthHtml(bo, gr));
                // hauteur adaptée au nombre d'éléments de chaque côté, puis nouveau rendu
                const boN = 'bo:' + bo.id; const nIn = gr.edges.filter(e => e.target === boN).length, nOut = gr.edges.filter(e => e.source === boN).length;
                const h = Math.min(760, Math.max(300, 52 * Math.max(nIn, nOut, 3) + 40));
                wrap.style.height = h + 'px'; wrap.classList.remove('h-[300px]');
                if (attrLineageGraph) { try { attrLineageGraph.destroy(); } catch (e) {} }
                attrLineageGraph = createSvgGraph(wrap); attrLineageGraph.data(gr); attrLineageGraph.render(); attrLineageGraph.fitView(20);
            } catch (e) { console.warn('v12 lineage objet (panneau)', e); }
            return r;
        };
        // ---- carte des flux (vue globale) : les rattachements de niveau attribut y apparaissent aussi ----
        function v12BoLinMapEdges(d) {
            if (!d || !Array.isArray(d.nodes) || !Array.isArray(d.edges)) return;
            const ids = new Set(d.nodes.map(n => n.id)); const has = (s, t) => d.edges.some(e => e.source === s && e.target === t);
            (state.governance.businessObjects || []).forEach(bo => {
                const boId = 'bo:' + bo.id; if (!ids.has(boId)) return; const rows = boAllAttrRows(bo) || [];
                const byApp = {}, byUse = {};
                rows.forEach(r => { if (r.el.sourceApp) byApp[r.el.sourceApp] = (byApp[r.el.sourceApp] || 0) + 1; (r.el.usedBy || []).forEach(id => byUse[id] = (byUse[id] || 0) + 1); });
                Object.entries(byApp).forEach(([id, n]) => { if (ids.has('as:' + id) && !has('as:' + id, boId)) d.edges.push({ id: 'v12mp:' + id + '>' + bo.id, source: 'as:' + id, target: boId, label: 'produit ' + n + ' attribut(s)', style: { stroke: '#334155', lineWidth: 1.5, endArrow: { path: '', fill: '#334155' } } }); });
                Object.entries(byUse).forEach(([id, n]) => { if (ids.has('as:' + id) && !has(boId, 'as:' + id)) d.edges.push({ id: 'v12mu:' + bo.id + '>' + id, source: boId, target: 'as:' + id, label: 'utilise ' + n + ' attribut(s)', style: { stroke: '#ea580c', endArrow: { path: '', fill: '#ea580c' } } }); });
                const srcTables = new Set((bo.sources || []).filter(s => s && s.table).map(s => s.table));
                Object.entries(v12BoLinTables(bo)).forEach(([t, info]) => { if (srcTables.has(t)) return; if (ids.has('tbl:' + t) && !has('tbl:' + t, boId)) d.edges.push({ id: 'v12mt:' + t + '>' + bo.id, source: 'tbl:' + t, target: boId, label: 'alimente ' + (info.n ? info.n + ' attribut(s)' : 'un composant'), style: { stroke: '#2563eb', endArrow: { path: '', fill: '#2563eb' } } }); else { const own = appOwnerOfSource(t); if (own && ids.has('as:' + own.id) && !ids.has('tbl:' + t) && !has('as:' + own.id, boId)) d.edges.push({ id: 'v12mo:' + own.id + '>' + bo.id, source: 'as:' + own.id, target: boId, label: 'via ' + t, style: { stroke: '#334155', lineWidth: 1.5, endArrow: { path: '', fill: '#334155' } } }); } });
                (bo.references || []).forEach(rf => { if (ids.has('bo:' + rf.boId) && !has(boId, 'bo:' + rf.boId) && !has('bo:' + rf.boId, boId)) d.edges.push({ id: 'v12mr:' + bo.id + '>' + rf.boId, source: boId, target: 'bo:' + rf.boId, label: 'référence', style: { stroke: '#0d9488', lineDash: [4, 3], endArrow: { path: '', fill: '#0d9488' } } }); });
            });
        }
        if (typeof v12OrgLineageEdges === 'function') { const _v12blOrg = v12OrgLineageEdges; v12OrgLineageEdges = function (d) { _v12blOrg.apply(this, arguments); try { v12BoLinMapEdges(d); } catch (e) {} }; }
        Object.assign(V11_LEXIQUE, { 'lineage de l\'objet': 'Tout ce qui est relié à un objet : applications et fichiers qui l\'alimentent (au niveau de l\'objet ou de ses attributs), objets dont il reprend des attributs, objets référencés, applications et processus qui l\'utilisent.' });
