        // ======================= V12 : LINEAGE — REMONTER JUSQU'AU DÉBUT DE LA DONNÉE =======================
        // Les graphes d'un objet, d'un attribut ou d'une colonne (onglet Objets, catalogue) s'arrêtaient
        // au premier niveau amont : l'application ou le fichier qui alimente directement. Si ce fichier
        // vient lui-même d'une autre application, si l'objet amont a ses propres sources, si l'application
        // reçoit ses données d'un système tiers (carte des flux), rien ne le montrait.
        // Ici : à partir de chaque élément amont du graphe, on remonte tout ce que la gouvernance sait —
        //  • un OBJET amont → ses propres sources (applications, fichiers, objets dont il reprend des
        //    attributs, objets référencés), récursivement ;
        //  • un ATTRIBUT d'origine sans colonne rattachée → les sources de son objet ;
        //  • une APPLICATION → les fichiers qu'elle lit et leurs producteurs, les applications qui
        //    l'alimentent (carte des flux), les applications sur lesquelles s'appuie un processus ;
        //  • un FICHIER → l'application qui le produit, les fichiers dont il est construit (table
        //    conçue, extraction promue, connecteur), les alimentations de la carte des flux.
        // Chaque élément ajouté porte son niveau (« amont 2 », « amont 3 »…) et le tout premier maillon
        // est marqué « début de la chaîne ». Un panneau « Depuis le début » liste les chaînes complètes en
        // clair, et l'interrupteur « ⇠ Jusqu'au début » revient à la vue à un niveau. Rien n'est modifié
        // dans le moteur : les constructeurs de graphe sont enveloppés, les identifiants de nœuds restent
        // ceux de l'application (as:, tbl:, bo:), donc la synthèse, le repli et la carte des flux suivent.
        v12State.linDeep = (() => { try { return localStorage.getItem('sd_v12_deep') !== '0'; } catch (e) { return true; } })();
        function v12UpOn() { return v12State.linDeep !== false; }
        function v12UpSet(on) { v12State.linDeep = !!on; try { localStorage.setItem('sd_v12_deep', on ? '1' : '0'); } catch (e) {} if (typeof _lineageRedraw === 'function') _lineageRedraw(); }
        const V12_UP_MAX_DEPTH = 8, V12_UP_MAX_NODES = 160;
        const V12_UP_STYLE = { GRAY: { stroke: '#334155', lineWidth: 1.5, endArrow: { path: '', fill: '#334155' } }, BLUE: { stroke: '#2563eb', endArrow: { path: '', fill: '#2563eb' } }, PURPLE: { stroke: '#7c3aed', lineWidth: 1.5, endArrow: { path: '', fill: '#7c3aed' } }, TEAL: { stroke: '#0d9488', lineDash: [4, 3], endArrow: { path: '', fill: '#0d9488' } }, EXT: { stroke: '#64748b', lineDash: [3, 3], endArrow: { path: '', fill: '#64748b' } } };
        function v12UpBase(id) { return String(id).replace(/^(?:o\d+_)+/, ''); }
        function v12UpAppNode(a) { return { id: 'as:' + a.id, type: 'studio-rich-node', title: (a.kind === 'process' ? '⚙️ ' : (a.kind === 'report' ? '📊 ' : '🖥 ')) + a.name, content: a.kind === 'process' ? 'processus' : (a.kind === 'report' ? 'restitution' : (a.criticality || 'application')), fill: a.kind === 'process' ? '#ffedd5' : (a.kind === 'report' ? '#fef3c7' : '#e2e8f0'), stroke: a.kind === 'process' ? '#ea580c' : (a.kind === 'report' ? '#d97706' : '#334155') }; }
        function v12UpTblNode(t, what) { return { id: 'tbl:' + t, type: 'studio-rich-node', title: '▦ ' + t, content: what || 'fichier', fill: '#dbeafe', stroke: '#2563eb' }; }
        // Nœud de la carte des flux qui porte cette application / ce fichier (s'il existe).
        function v12UpFlowApp(a) { const m = typeof lfModel === 'function' ? lfModel() : null; if (!m || !a) return null; return m.nodes.find(x => x.assetId === a.id) || m.nodes.find(x => lfNodeKind(x) === 'app' && String(x.name || '').toLowerCase() === String(a.name || '').toLowerCase()) || null; }
        function v12UpFlowTbl(t) { const m = typeof lfModel === 'function' ? lfModel() : null; if (!m) return null; return m.nodes.find(x => x.tableName === t) || m.nodes.find(x => lfNodeKind(x) === 'table' && !x.tableName && String(x.name || '').toLowerCase() === String(t).toLowerCase()) || null; }
        // Sources amont d'un élément : liste de { node, label, style } à relier VERS cet élément.
        function v12UpSourcesOf(base, ctx) {
            const G = state.governance; const out = []; const files = ctx.files;
            const push = (node, label, style) => { if (node && node.id !== base) out.push({ node, label, style }); };
            const tblOrOwner = (t, labelTbl, labelApp) => {
                // sans fichiers : l'application propriétaire remplace le fichier ; sinon le fichier, puis son producteur
                const own = typeof appOwnerOfSource === 'function' ? appOwnerOfSource(t) : null;
                if (!files && own) { push(v12UpAppNode(own), (labelApp || 'alimente') + ' via ' + t, V12_UP_STYLE.GRAY); return; }
                push(v12UpTblNode(t, own ? 'fichier' : 'fichier · sans application'), labelTbl || 'alimente', V12_UP_STYLE.BLUE);
            };
            if (base.startsWith('as:')) {
                const a = assetById(base.slice(3)); if (!a) return out;
                // 1. fichiers lus par l'application / le processus
                const reads = Array.from(new Set([...(a.tables || []), ...((a.columns || []).map(c => c && c.table).filter(Boolean))])).filter(t => !(a.sources || []).includes(t));
                reads.forEach(t => tblOrOwner(t, 'lu par', 'alimente'));
                // 2. processus : applications sur lesquelles il s'appuie
                if (a.kind === 'process') (a.appIds || []).forEach(id => { const x = assetById(id); if (x) push(v12UpAppNode(x), 's\'appuie sur', V12_UP_STYLE.GRAY); });
                // 3. carte des flux : ce qui arrive sur cette application (fichiers lus, applications qui l'alimentent)
                const fn = v12UpFlowApp(a);
                if (fn) lfModel().edges.filter(e => e.target === fn.id && e.source !== fn.id).forEach(e => {
                    const s = lfNode(e.source); if (!s) return; const rel = lfEdgeRel(e);
                    if (lfNodeKind(s) === 'app') { const x = s.assetId ? assetById(s.assetId) : (G.assets || []).find(z => z.kind !== 'report' && String(z.name || '').toLowerCase() === String(s.name || '').toLowerCase()); if (x) push(v12UpAppNode(x), 'alimente', V12_UP_STYLE.GRAY); else push({ id: 'ext:' + s.id, type: 'studio-rich-node', title: '🖥 ' + s.name, content: 'application de la carte des flux', fill: '#f1f5f9', stroke: '#64748b' }, 'alimente', V12_UP_STYLE.EXT); }
                    else if (lfNodeKind(s) === 'table' && rel === 'reads') { const t = s.tableName || s.name; if (t && !reads.includes(t)) tblOrOwner(t, 'lu par', 'alimente'); }
                });
            } else if (base.startsWith('tbl:')) {
                const t = base.slice(4);
                // 1. application qui produit le fichier
                const own = typeof appOwnerOfSource === 'function' ? appOwnerOfSource(t) : null; if (own) push(v12UpAppNode(own), 'produit', V12_UP_STYLE.GRAY);
                // 2. fichier construit à partir d'autres fichiers (table conçue) ; extraction promue / connecteur (traçabilité)
                const tb = typeof tableByName === 'function' ? tableByName(t) : null; const feeders = new Set();
                if (tb && tb.design) { (tb.design.sources || []).forEach(s => { if (s && s.src) feeders.add(s.src); }); (tb.design.joins || []).forEach(j => { if (j && j.src) feeders.add(j.src); if (j && j.viaSrc) feeders.add(j.viaSrc); }); }
                ((G.lineage || {})[t] || {}).from && (G.lineage[t].from || []).forEach(src => { if (typeof tableByName === 'function' && tableByName(src)) feeders.add(src); else if (src) push({ id: 'src:' + src, type: 'studio-rich-node', title: '⇠ ' + String(src).slice(0, 60), content: 'origine externe (traçabilité)', fill: '#f1f5f9', stroke: '#64748b' }, 'à l\'origine de', V12_UP_STYLE.EXT); });
                // 3. carte des flux : fichiers qui alimentent ce fichier
                const fn = v12UpFlowTbl(t);
                if (fn) lfModel().edges.filter(e => e.target === fn.id && e.source !== fn.id).forEach(e => { const s = lfNode(e.source); if (!s) return; if (lfNodeKind(s) === 'table') { const st = s.tableName || s.name; if (st) feeders.add(st); } else if (lfNodeKind(s) === 'app' && lfEdgeRel(e) === 'writes' && !own) { const x = s.assetId ? assetById(s.assetId) : null; if (x) push(v12UpAppNode(x), 'produit', V12_UP_STYLE.GRAY); } });
                feeders.forEach(f => { if (f === t) return; tblOrOwner(f, 'alimente', 'alimente'); });
            } else if (base.startsWith('bo:')) {
                const ob = (G.businessObjects || []).find(b => b.id === base.slice(3)); if (!ob) return out;
                // l'amont d'un objet = la partie amont de son propre graphe (déjà enrichi par V12.7 / V12.8), sans remonter récursivement ici
                const sub = v12UpExtend._quiet(() => buildBoLineageGraph(ob, { files })); const bid = 'bo:' + ob.id;
                const up = v12UpUpstream(sub, bid);
                sub.edges.forEach(e => { if (!up.has(e.source) || !(up.has(e.target) || e.target === bid)) return; if (e.source === 'nosrc' || e.source === 'nouse' || /^rcp:/.test(e.source)) return; const n = sub.nodes.find(x => x.id === e.source); if (!n) return; out.push({ node: Object.assign({}, n), label: e.label, style: e.style, target: e.target === bid ? null : e.target }); });
            } else if (base.startsWith('attr:') || base.startsWith('dep:')) {
                // attribut d'origine (V12.6) sans colonne rattachée : les sources de son objet
                const elId = base.startsWith('dep:') ? base.split(':')[2] : base.slice(5); let found = null;
                (G.businessObjects || []).some(b => { const r = (boAllAttrRows(b) || []).find(x => x.el.id === elId); if (r) { found = { bo: b, r }; return true; } return false; });
                if (!found) return out; const r = found.r, bo = found.bo; const st = r.stId ? getBoFacets(bo).find(x => x.id === r.stId) : null;
                const maps = st ? (r.el.col ? [{ table: st.table, col: r.el.col }] : []) : (r.el.mappings || []);
                if (maps.length || r.el.sourceApp || (typeof v12OrgList === 'function' && v12OrgList(r.el).length)) return out;
                push({ id: 'bo:' + bo.id, type: 'studio-rich-node', title: '🏛️ ' + bo.name, content: 'objet de l\'information', fill: '#ede9fe', stroke: '#7c3aed' }, 'porte', V12_UP_STYLE.PURPLE);
            } else if (base.startsWith('col:')) {
                const n = ctx.node; const t = n && String(n.title || '').replace(/^▦\s*/, ''); if (t && !/^\s*🔹/.test(t)) return v12UpSourcesOf('tbl:' + t, ctx);
            }
            return out;
        }
        // Ensemble des nœuds à partir desquels le centre est atteignable (l'amont, à tous niveaux).
        function v12UpUpstream(gr, centerId) {
            const up = new Set(); const q = [centerId];
            while (q.length) { const id = q.shift(); gr.edges.forEach(e => { if (e.target === id && !up.has(e.source) && e.source !== centerId) { up.add(e.source); q.push(e.source); } }); }
            return up;
        }
        function v12UpExtend(gr, centerId) {
            if (!gr || !Array.isArray(gr.nodes) || !v12UpOn() || v12UpExtend._busy) return gr;
            v12UpExtend._busy = true;
            try {
                const files = lineageFilesOn(); const byId = () => new Map(gr.nodes.map(n => [n.id, n]));
                const edge = (s, t) => gr.edges.some(e => e.source === s && e.target === t);
                const skip = id => /^(?:nosrc|nouse|grp:|rcp:|src:|ext:)/.test(id) || /^(?:o\d+_)*use:/.test(id);
                let frontier = Array.from(v12UpUpstream(gr, centerId));
                const done = new Set(); let added = 0, k = 0;
                for (let d = 1; d <= V12_UP_MAX_DEPTH && frontier.length && added < V12_UP_MAX_NODES; d++) {
                    const next = [];
                    frontier.forEach(id => {
                        if (done.has(id) || skip(id)) return; done.add(id);
                        const map = byId(); const node = map.get(id); if (!node) return; const base = v12UpBase(id);
                        if (base === centerId) return;
                        const srcs = v12UpSourcesOf(base, { files, node }).filter(s => s.node && s.node.id !== id && s.node.id !== centerId); // ni boucle sur soi-même, ni retour au centre
                        // 1. les nœuds (un élément déjà présent — même côté aval — n'est pas dupliqué ni déplacé)
                        srcs.forEach(s => { const sid = s.node.id; if (map.has(sid)) { const ex = map.get(sid); const via = /^via .+/.exec(String(s.node.content || '').split(' · ')[0]); if (via && ex.deep && !String(ex.content || '').includes(via[0].slice(4))) ex.content = via[0] + ' · ' + String(ex.content || '').replace(/^(?:application|processus|fichier)(?: · )?/, ''); return; } const nn = Object.assign({}, s.node); nn.content = (nn.content ? nn.content + ' · ' : '') + 'amont ' + (d + 1); nn.deep = d + 1; gr.nodes.push(nn); map.set(sid, nn); added++; });
                        // 2. les liens, vers l'élément lui-même ou vers un maillon intermédiaire de son propre graphe ;
                        //    un élément relié en amont est exploré au niveau suivant (jamais un élément resté côté aval)
                        srcs.forEach(s => { const sid = s.node.id; const tgt = s.target || id; if (tgt === sid || !map.has(tgt)) return; if (!edge(sid, tgt) && !edge(tgt, sid)) gr.edges.push({ id: 'v12up' + (k++) + ':' + sid + '>' + tgt, source: sid, target: tgt, label: s.label || '', style: s.style || V12_UP_STYLE.GRAY }); if (edge(sid, tgt) && !done.has(sid) && !next.includes(sid)) next.push(sid); });
                    });
                    frontier = next;
                }
                // Marquer le tout premier maillon de chaque chaîne
                const up = v12UpUpstream(gr, centerId);
                gr.nodes.forEach(n => { if (!up.has(n.id) || /^(?:nosrc|nouse)$/.test(n.id)) return; if (!gr.edges.some(e => e.target === n.id)) { n.first = true; if (!/début de la chaîne/.test(n.content || '')) n.content = (n.content ? n.content + ' · ' : '') + 'début de la chaîne'; } });
                gr.deepAdded = added;
            } catch (e) { console.warn('v12 amont complet', e); }
            finally { v12UpExtend._busy = false; }
            return gr;
        }
        v12UpExtend._busy = false;
        v12UpExtend._quiet = fn => { const b = v12UpExtend._busy; v12UpExtend._busy = true; try { return fn(); } finally { v12UpExtend._busy = b; } };
        // ---- les constructeurs de graphe remontent jusqu'au début ----
        const _v12upBo = buildBoLineageGraph;
        buildBoLineageGraph = function (bo) { const gr = _v12upBo.apply(this, arguments); try { if (bo) v12UpExtend(gr, 'bo:' + bo.id); } catch (e) {} return gr; };
        const _v12upAttr = buildAttrLineageGraph;
        buildAttrLineageGraph = function (bo, st, e2, _depth) { const gr = _v12upAttr.apply(this, arguments); try { if (!_depth && e2) v12UpExtend(gr, 'attr:' + e2.id); } catch (e) {} return gr; };
        const _v12upCol = buildColumnLineageGraph;
        buildColumnLineageGraph = function (tbl, col) { const gr = _v12upCol.apply(this, arguments); try { if (!buildColumnLineageGraph._viaAttr) v12UpExtend(gr, 'col:main'); } catch (e) {} return gr; };
        // ---- chaînes complètes en clair : « début → … → élément » ----
        function v12UpPaths(gr, centerId, max) {
            const paths = []; const seen = new Set();
            const walk = (id, path) => {
                if (paths.length >= (max || 20) || path.length > V12_UP_MAX_DEPTH + 3) return;
                const ins = gr.edges.filter(e => e.target === id && !path.includes(e.source) && !/^(?:nosrc|nouse|grp:)/.test(e.source));
                if (!ins.length) { if (path.length > 1) { const key = path.join('>'); if (!seen.has(key)) { seen.add(key); paths.push(path.slice()); } } return; }
                ins.forEach(e => walk(e.source, [e.source, ...path]));
            };
            walk(centerId, [centerId]);
            paths.sort((a, b) => b.length - a.length);
            return paths;
        }
        function v12UpClean(t) { return String(t || '').replace(/^[^\wÀ-ÿ]+\s*/, ''); }
        function v12UpPanelHtml(gr, centerId) {
            const paths = v12UpPaths(gr, centerId, 24); const N = id => gr.nodes.find(n => n.id === id);
            const deep = paths.filter(p => p.length > 2);
            const chain = p => p.map((id, i) => { const n = N(id); const t = n ? v12UpClean(n.title) : id; return `<span class="v12up-step${i === 0 ? ' first' : ''}${id === centerId ? ' me' : ''}">${escapeHTML(t)}</span>`; }).join('<span class="v12up-arr">⇢</span>');
            const on = v12UpOn();
            const body = !on ? `<span class="v12up-none">Vue à un niveau : cochez « ⇠ Jusqu'au début » pour remonter toute la chaîne.</span>`
                : (!paths.length ? `<span class="v12up-none">Aucune source déclarée : rien à remonter.</span>`
                : (!deep.length ? `<span class="v12up-none">Tout l'amont connu tient en un niveau : ${paths.length} source(s) directe(s), rien de déclaré plus haut.</span>`
                : deep.slice(0, 12).map(p => `<div class="v12up-chain">${chain(p)}</div>`).join('') + (deep.length > 12 ? `<div class="v12up-none">… et ${deep.length - 12} autre(s) chaîne(s)</div>` : '')));
            const firsts = gr.nodes.filter(n => n.first).map(n => v12UpClean(n.title));
            return `<details class="v12up-panel" data-ro="keep" ${on && deep.length ? 'open' : ''}><summary>⇠ Depuis le début${on && deep.length ? ` : ${deep.length} chaîne(s), ${firsts.length} point(s) de départ` : ''}${on && firsts.length && deep.length ? ` — <b>${escapeHTML(firsts.slice(0, 4).join(', '))}${firsts.length > 4 ? '…' : ''}</b>` : ''}</summary><div class="v12up-body">${body}</div></details>`;
        }
        function v12UpToggleHtml() { return `<label data-ro="keep" class="v12up-toggle" title="Remonter tout l'amont connu : sources des objets amont, fichiers lus par les applications, producteurs des fichiers, alimentations de la carte des flux. Décochez pour ne voir que le premier niveau."><input type="checkbox" ${v12UpOn() ? 'checked' : ''} onchange="v12UpSet(this.checked)"> ⇠ Jusqu'au début</label>`; }
        if (typeof v12LinBarHtml === 'function') { const _v12upBar = v12LinBarHtml; v12LinBarHtml = function () { return _v12upBar.apply(this, arguments).replace(/<\/span>\s*$/, '') + v12UpToggleHtml() + '</span>'; }; }
        // Onglet Objets : panneau « Depuis le début » sous la phrase / la synthèse, avant le graphe
        function v12UpInject(box, gr, centerId) {
            if (!box) return; const old = box.querySelector('.v12up-panel'); if (old) old.remove();
            const wrap = box.querySelector('#attrLineageWrap') || box.querySelector('#catLineageWrap'); if (!wrap) return;
            wrap.insertAdjacentHTML('beforebegin', v12UpPanelHtml(gr, centerId));
        }
        const _v12upOpenBo = openBoLineage;
        openBoLineage = function (boId) { const r = _v12upOpenBo.apply(this, arguments); try { const bo = (state.governance.businessObjects || []).find(x => x.id === boId); if (bo) v12UpInject(el('attrLineageBox'), buildBoLineageGraph(bo), 'bo:' + bo.id); } catch (e) {} return r; };
        const _v12upOpenAttr = openAttrLineage;
        openAttrLineage = function (boId, stId, elId) { const r = _v12upOpenAttr.apply(this, arguments); try { const bo = (state.governance.businessObjects || []).find(x => x.id === boId); const st = bo && stId ? getBoFacets(bo).find(x => x.id === stId) : null; const e2 = bo && (st ? (st.elements || []).find(x => x.id === elId) : (bo.elements || []).find(x => x.id === elId)); if (e2) v12UpInject(el('attrLineageBox'), buildAttrLineageGraph(bo, st, e2), 'attr:' + e2.id); } catch (e) {} return r; };
        // Catalogue : même panneau et même interrupteur dans la fiche
        if (typeof catShowAttrLineage === 'function') {
            const _v12upCat = catShowAttrLineage;
            catShowAttrLineage = function (e2) {
                const r = _v12upCat.apply(this, arguments);
                try {
                    const box = el('catLineageBox'); if (!box || !e2) return r;
                    const bo = e2.bo ? (state.governance.businessObjects || []).find(x => x.id === e2.bo) : null; let gr = null, cid = '';
                    if (e2.type === 'bo' && bo) { gr = buildBoLineageGraph(bo); cid = 'bo:' + bo.id; }
                    else if (e2.type === 'attr' && bo) { const rr = (boAllAttrRows(bo) || []).find(x => x.el.id === e2.elId); const st = rr && rr.stId ? getBoFacets(bo).find(x => x.id === rr.stId) : null; if (rr) { gr = buildAttrLineageGraph(bo, st, rr.el); cid = 'attr:' + rr.el.id; } }
                    else if (e2.type === 'column') { gr = buildColumnLineageGraph(e2.tbl, e2.col); cid = buildColumnLineageGraph._viaAttr ? (gr.nodes.find(n => /^attr:/.test(n.id)) || {}).id : 'col:main'; }
                    if (!gr || !cid) return r;
                    const closeBtn = box.querySelector('[onclick="catCloseLineage()"]'); const host = closeBtn && closeBtn.parentElement; if (host && !host.querySelector('.v12up-toggle')) host.insertAdjacentHTML('afterbegin', v12UpToggleHtml());
                    v12UpInject(box, gr, cid);
                } catch (e) { console.warn('v12 amont complet (catalogue)', e); }
                return r;
            };
        }
        // Synthèse (V12.7) : les éléments lointains sont distingués, avec leur niveau
        if (typeof v12BoLinSynth === 'function') { const _v12upSynth = v12BoLinSynth; v12BoLinSynth = function (bo, gr) { const rows = _v12upSynth.apply(this, arguments); try { rows.forEach(r => { const n = gr.nodes.find(x => x.id === r.id); if (n && n.deep) { r.dir = 'amont'; r.how = (r.how ? r.how + ' · ' : '') + 'niveau ' + n.deep + (n.first ? ' · début de la chaîne' : ''); } }); } catch (e) {} return rows; }; }
        if (typeof v12LinKind === 'function') { const _v12upKind = v12LinKind; v12LinKind = function (n) { if (/^(?:src|ext):/.test(String(n.id))) return 'autre'; return _v12upKind.apply(this, arguments); }; }
        Object.assign(V11_LEXIQUE, { 'jusqu\'au début': 'Dans un lineage, remonter toute la chaîne connue de la donnée : les sources des objets amont, les fichiers lus par les applications et leurs producteurs, les alimentations de la carte des flux, jusqu\'au tout premier maillon (« début de la chaîne »).' });
        if (typeof v11Index === 'function') { const _v12upIdx = v11Index; v11Index = function () { const items = _v12upIdx.apply(this, arguments); try { if (Array.isArray(items)) items.push({ grp: 'Actions', ic: '⇠', label: v12UpOn() ? 'Lineage : ne montrer que le premier niveau amont' : 'Lineage : remonter jusqu\'au début', sub: 'graphes d\'objet, d\'information et de colonne', key: 'lineage amont début chaîne remonter', go: () => v12UpSet(!v12UpOn()) }); } catch (e) {} return items; }; }
