        // ======================= Rendu SVG maison du Modèle de données =======================
        // Aucune dépendance externe : on dessine des cartes (rect + textes) et des liens (path) en SVG.
        // Positions calculées par computeDomainPositions (couloirs par domaine, sans collision). Le
        // déplacement, le zoom et le pan sont gérés à la main → 100 % fiables et testables.
        let svgG = { pos: {}, k: 1, tx: 40, ty: 40, size: {} };
        let _svgWin = { mm: null, mu: null };
        // Index DOM du graphe (reconstruit à chaque rendu) : évite les querySelector à chaque
        // mouvement de souris — c'était la cause des saccades sur les gros modèles.
        let _svgIdx = { nodeEls: {}, edgesByNode: {} };
        function svgBuildNodeModels(visibleIds, schemaMode) {
            const hier = tableHierarchyInfo();
            const keyCols = {};
            state.relations.filter(r => r.sourceCol && r.targetCol).forEach(r => {
                (keyCols[r.sourceTable] = keyCols[r.sourceTable] || new Set()).add(r.sourceCol);
                (keyCols[r.targetTable] = keyCols[r.targetTable] || new Set()).add(r.targetCol);
            });
            return Object.values(state.tables).filter(t => visibleIds.has(t.id)).map(t => {
                const ks = keyCols[t.id] || new Set();
                const design = t.type === 'designed' ? (t.design || {}) : null;
                const pk = new Set(design ? (design.key || []) : []);
                const fmts = design ? (design.formats || {}) : {};
                const fkAttrs = new Set(design ? (design.fks || []).map(f => f.attr) : []);
                let cols = schemaMode ? t.headers.slice() : [...t.headers].sort((a, b) => ((pk.has(b) || ks.has(b)) ? 1 : 0) - ((pk.has(a) || ks.has(a)) ? 1 : 0));
                const lineOf = h => (pk.has(h) ? '🔑 ' : (fkAttrs.has(h) ? '🔐 ' : (ks.has(h) ? '🔗 ' : '· '))) + h + (fmts[h] ? '  〈' + tdFormatLabel(fmts[h]) + '〉' : '');
                const max = schemaMode ? 40 : 7;
                const rows = cols.slice(0, max).map(lineOf);
                if (cols.length > max) rows.push(`… ${cols.length - max} autre(s) colonne(s)`);
                const hierTxt = hierNodeContent(hier, t.id); if (hierTxt) rows.unshift('🌳 ' + hierTxt);
                const isH = isHierTable(hier, t.id), isD = t.type === 'designed';
                const pal = t.theme ? themePalette(t.theme.trim()) : null;
                const title = (isD ? '🧱 ' : (isH ? '🌳 ' : '📄 ')) + t.name;
                return { id: t.id, title, rows, size: umlNodeSize(title, rows), theme: (t.theme || '').trim(),
                    headFill: pal ? pal.head : (isD ? '#dbeafe' : (isH ? '#d1fae5' : '#e0e7ff')),
                    titleFill: pal ? pal.title : (isD ? '#1e40af' : (isH ? '#065f46' : '#312e81')),
                    stroke: pal ? pal.stroke : (isD ? '#3b82f6' : (isH ? '#059669' : '#6366f1')) };
            });
        }
        function svgBorderPoint(b, tx, ty) {
            const dx = tx - b.cx, dy = ty - b.cy; if (!dx && !dy) return { x: b.cx, y: b.cy };
            const s = Math.min(dx ? (b.w / 2) / Math.abs(dx) : Infinity, dy ? (b.h / 2) / Math.abs(dy) : Infinity);
            return { x: b.cx + dx * s, y: b.cy + dy * s };
        }
        function svgApplyTransform() { const vp = el('mcdVp'); if (vp) vp.setAttribute('transform', `translate(${svgG.tx},${svgG.ty}) scale(${svgG.k})`); try { svgRenderMinimap(); } catch (e) {} }
        function renderGraphSVG(cont) {
            const schemaMode = state.graphConfig.mcdView === 'schema';
            const visibleIds = mcdVisibleIds();
            const nodes = svgBuildNodeModels(visibleIds, schemaMode);
            nodes.forEach(n => svgG.size[n.id] = n.size);
            // Positions : recalcule tout si rien de mémorisé, sinon place seulement les nouvelles tables.
            const missing = nodes.filter(n => !svgG.pos[n.id]);
            if (missing.length === nodes.length) { computeDomainPositions(nodes); nodes.forEach(n => svgG.pos[n.id] = { x: n.x, y: n.y }); svgG.needFit = true; }
            else if (missing.length) { const clone = nodes.map(n => ({ id: n.id, size: n.size })); computeDomainPositions(clone); clone.forEach(c => { if (!svgG.pos[c.id]) svgG.pos[c.id] = { x: c.x, y: c.y }; }); }
            nodes.forEach(n => { const p = svgG.pos[n.id]; n.x = p.x; n.y = p.y; });
            const boxOf = id => { const p = svgG.pos[id], s = svgG.size[id] || [180, 60]; return { cx: p.x, cy: p.y, w: s[0], h: s[1] }; };
            const idset = new Set(nodes.map(n => n.id));
            const _hierRelIds = new Set(); Object.values(tableHierarchyInfo()).forEach(h => h.relIds.forEach(id2 => _hierRelIds.add(id2)));
            const edges = state.relations.filter(r => r.sourceCol && r.targetCol && idset.has(r.sourceTable) && idset.has(r.targetTable))
                .map(r => ({ id: r.id, source: r.sourceTable, target: r.targetTable, label: relEdgeLabel(r), hier: _hierRelIds.has(r.id) }));

            // Zones par domaine (rectangles derrière les blocs).
            const byDom = {}; nodes.forEach(n => { const d = n.theme || '(sans domaine)'; (byDom[d] = byDom[d] || []).push(n); });
            let zonesSvg = '';
            Object.keys(byDom).forEach(d => {
                if (d === '(sans domaine)') return; const pal = themePalette(d); if (!pal) return;
                let x1 = 1e9, y1 = 1e9, x2 = -1e9, y2 = -1e9;
                byDom[d].forEach(n => { const b = boxOf(n.id); x1 = Math.min(x1, b.cx - b.w / 2); y1 = Math.min(y1, b.cy - b.h / 2); x2 = Math.max(x2, b.cx + b.w / 2); y2 = Math.max(y2, b.cy + b.h / 2); });
                const P = 22;
                zonesSvg += `<g class="svgzone" data-dom="${escapeHTML(d)}" style="cursor:move"><rect x="${x1 - P}" y="${y1 - P - 16}" width="${x2 - x1 + 2 * P}" height="${y2 - y1 + 2 * P + 16}" rx="12" fill="${pal.zone}" fill-opacity="0.05" stroke="${pal.zone}" stroke-dasharray="6 4" stroke-width="1.5"/><text x="${x1 - P + 8}" y="${y1 - P - 3}" font-size="12" font-weight="700" fill="${pal.zone}">🗂 ${escapeHTML(d)} <tspan fill="${pal.zone}" fill-opacity="0.6">— glisser pour déplacer le domaine</tspan></text></g>`;
            });

            // Liens.
            let edgesSvg = '';
            edges.forEach(e => {
                const a = boxOf(e.source), b = boxOf(e.target);
                const p1 = svgBorderPoint(a, b.cx, b.cy), p2 = svgBorderPoint(b, a.cx, a.cy);
                const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
                const col = e.hier ? '#059669' : '#94a3b8';
                edgesSvg += `<g class="svgedge" data-id="${e.id}" data-s="${e.source}" data-t="${e.target}">
                    <path d="M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}" stroke="${col}" stroke-width="${e.hier ? 2 : 1.4}" fill="none" marker-end="url(#svgArrow)"/>
                    <path class="svgedge-hit" d="M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}" stroke="transparent" stroke-width="12" fill="none" style="cursor:pointer"/>
                    ${e.label ? `<text x="${mx}" y="${my - 3}" text-anchor="middle" font-size="10" fill="#475569" style="paint-order:stroke;stroke:#fff;stroke-width:3px">${escapeHTML((e.hier ? '🌳 ' : '') + e.label)}</text>` : ''}
                </g>`;
            });

            // Cartes.
            let nodesSvg = '';
            nodes.forEach(n => {
                const [w, h] = n.size; const headH = 28, rowH = 15;
                const x = n.x - w / 2, y = n.y - h / 2;
                let inner = `<rect width="${w}" height="${h}" rx="8" fill="#fff" stroke="${n.stroke}" stroke-width="1.2"/>`;
                inner += `<path d="M0 ${headH} h${w}" stroke="${n.stroke}" stroke-opacity="0.5"/>`;
                inner += `<rect width="${w}" height="${headH}" rx="8" fill="${n.headFill}"/><rect y="${headH - 8}" width="${w}" height="8" fill="${n.headFill}"/>`;
                inner += `<text x="10" y="${headH / 2 + 4}" font-size="12" font-weight="700" fill="${n.titleFill}">${escapeHTML(svgTrunc(n.title, w))}</text>`;
                n.rows.forEach((r, i) => { inner += `<text x="10" y="${headH + 12 + i * rowH}" font-size="10" fill="${String(r).startsWith('…') ? '#94a3b8' : '#475569'}">${escapeHTML(svgTrunc(r, w))}</text>`; });
                nodesSvg += `<g class="svgnode" data-id="${n.id}" transform="translate(${x},${y})" style="cursor:grab">${inner}</g>`;
            });

            const W = cont.clientWidth || 800, H = cont.clientHeight || 520;
            cont.innerHTML = `<svg id="mcdSvg" width="100%" height="100%" style="display:block;touch-action:none">
                <defs><marker id="svgArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="#94a3b8"/></marker></defs>
                <style>.svg-dim{opacity:.12}.svgnode:hover rect:first-child{stroke-width:2}</style>
                <g id="mcdVp"><g class="zones">${zonesSvg}</g><g class="edges">${edgesSvg}</g><g class="nodes">${nodesSvg}</g></g>
            </svg>`;
            svgBindEvents(cont);
            // Cadrage automatique tant que l'utilisateur n'a pas navigué manuellement (ou après « Ranger »).
            if (svgG.needFit) { svgG.needFit = false; svgFitAll(); } else { svgApplyTransform(); }
            // rétablit un éventuel focus/surlignage actif
            mcdHighlightId = null; svgApplyFocus();
            try { svgRenderMinimap(); } catch (e) {}
        }
        // « Tout voir » : cadre l'ensemble du modèle dans la fenêtre (indispensable pour naviguer).
        function svgFitAll() {
            const cont = el('networkGraph'); if (!cont) return;
            const ids = Object.keys(svgG.pos); if (!ids.length) { svgApplyTransform(); return; }
            let x1 = 1e9, y1 = 1e9, x2 = -1e9, y2 = -1e9;
            ids.forEach(id => { const p = svgG.pos[id], s = svgG.size[id] || [180, 60]; x1 = Math.min(x1, p.x - s[0] / 2); y1 = Math.min(y1, p.y - s[1] / 2); x2 = Math.max(x2, p.x + s[0] / 2); y2 = Math.max(y2, p.y + s[1] / 2); });
            const W = cont.clientWidth || 800, H = cont.clientHeight || 500, M = 50;
            const bw = x2 - x1, bh = y2 - y1; if (bw <= 0 || bh <= 0) { svgApplyTransform(); return; }
            svgG.k = Math.max(0.12, Math.min(1.4, Math.min((W - 2 * M) / bw, (H - 2 * M) / bh)));
            svgG.tx = (W - bw * svgG.k) / 2 - x1 * svgG.k;
            svgG.ty = (H - bh * svgG.k) / 2 - y1 * svgG.k;
            svgApplyTransform();
        }
        function svgTrunc(s, w) { const max = Math.max(6, Math.floor((w - 20) / 6.2)); s = String(s); return s.length > max ? s.slice(0, max - 1) + '…' : s; }

        // ---- Interactions SVG (drag nœud, pan, zoom, clic, clic droit) ----
        function svgBindEvents(cont) {
            const svg = el('mcdSvg'); if (!svg) return;
            // Évite l'accumulation de listeners globaux entre deux rendus (fuite mémoire).
            if (_svgWin.mm) window.removeEventListener('mousemove', _svgWin.mm);
            if (_svgWin.mu) window.removeEventListener('mouseup', _svgWin.mu);
            const ptGraph = ev => { const r = svg.getBoundingClientRect(); return { x: (ev.clientX - r.left - svgG.tx) / svgG.k, y: (ev.clientY - r.top - svgG.ty) / svgG.k }; };
            // Index construit UNE fois par rendu : accès O(1) pendant les déplacements.
            const nodeEls = {}; svg.querySelectorAll('.svgnode').forEach(g => nodeEls[g.getAttribute('data-id')] = g);
            const edgesByNode = {};
            svg.querySelectorAll('.svgedge').forEach(g => {
                const rec = { g, s: g.getAttribute('data-s'), t: g.getAttribute('data-t'), paths: Array.from(g.querySelectorAll('path')), text: g.querySelector('text') };
                (edgesByNode[rec.s] = edgesByNode[rec.s] || []).push(rec);
                if (rec.t !== rec.s) (edgesByNode[rec.t] = edgesByNode[rec.t] || []).push(rec);
            });
            _svgIdx = { nodeEls, edgesByNode };
            let mode = null, dragId = null, last = null, moved = 0, startG = null, zoneDom = null, zoneEl = null, zoneAcc = null;
            let rafId = 0, zoneIds = null, zoneEdges = null;
            const applyNodeXY = id => { const elx = nodeEls[id]; if (!elx) return; const p = svgG.pos[id], sz = svgG.size[id] || [180, 60]; elx.setAttribute('transform', `translate(${p.x - sz[0] / 2},${p.y - sz[1] / 2})`); };
            const flushNode = () => { rafId = 0; if (!dragId) return; applyNodeXY(dragId); svgUpdateEdgesFor(dragId); };
            const flushZone = () => { rafId = 0; if (!zoneIds) return; zoneIds.forEach(applyNodeXY); zoneEdges.forEach(svgUpdateEdgeRec); if (zoneEl) zoneEl.setAttribute('transform', `translate(${zoneAcc.x},${zoneAcc.y})`); };
            svg.style.cursor = 'grab';
            svg.addEventListener('mousedown', ev => {
                const ng = ev.target.closest('.svgnode');
                const zn = ev.target.closest('.svgzone');
                if (ng) { mode = 'node'; dragId = ng.getAttribute('data-id'); startG = ptGraph(ev); moved = 0; ng.style.cursor = 'grabbing'; }
                else if (zn) { mode = 'zone'; zoneDom = zn.getAttribute('data-dom'); zoneEl = zn; zoneAcc = { x: 0, y: 0 }; startG = ptGraph(ev); svgG.userMoved = true; }
                else { mode = 'pan'; last = { x: ev.clientX, y: ev.clientY }; svg.style.cursor = 'grabbing'; svgG.userMoved = true; }
                ev.preventDefault();
            });
            window.addEventListener("mousemove", _svgWin.mm = ev => {
                if (mode === 'pan') { svgG.tx += ev.clientX - last.x; svgG.ty += ev.clientY - last.y; last = { x: ev.clientX, y: ev.clientY }; svgApplyTransform(); }
                else if (mode === 'node') {
                    // Les positions sont mises à jour à chaque événement, le DOM UNE fois par image.
                    const g = ptGraph(ev); const p = svgG.pos[dragId]; if (!p) return;
                    p.x += g.x - startG.x; p.y += g.y - startG.y; startG = g; moved++; svgG.userMoved = true;
                    if (!rafId) rafId = requestAnimationFrame(flushNode);
                }
                else if (mode === 'zone') {
                    // Déplace UNIQUEMENT les tables du domaine saisi ; liste et arêtes touchées
                    // calculées une seule fois au début du déplacement (coût linéaire).
                    const g = ptGraph(ev); const dx = g.x - startG.x, dy = g.y - startG.y; startG = g;
                    if (!zoneIds) {
                        zoneIds = Object.keys(svgG.pos).filter(id => { const t = state.tables[id]; return t && (t.theme || '').trim() === zoneDom; });
                        const set = new Set(); zoneIds.forEach(id => (edgesByNode[id] || []).forEach(r => set.add(r)));
                        zoneEdges = Array.from(set);
                    }
                    zoneIds.forEach(id => { const p = svgG.pos[id]; p.x += dx; p.y += dy; });
                    zoneAcc.x += dx; zoneAcc.y += dy;
                    if (!rafId) rafId = requestAnimationFrame(flushZone);
                }
            });
            window.addEventListener("mouseup", _svgWin.mu = ev => {
                if (mode === 'pan') svg.style.cursor = 'grab';
                if (mode === 'node') { flushNode(); const ng = nodeEls[dragId]; if (ng) ng.style.cursor = 'grab';
                    if (moved < 3) { if (mcdLinkMode) mcdNodeClicked(dragId); else if (mcdPathMode) mcdPathClick(dragId); else svgHighlightNeighbors(dragId); } else persistAppState(); }
                if (mode === 'zone') { flushZone(); persistAppState(); }
                mode = null; dragId = null; zoneDom = null; zoneEl = null; zoneIds = null; zoneEdges = null;
            });
            svg.addEventListener('wheel', ev => {
                ev.preventDefault(); const r = svg.getBoundingClientRect(); const mx = ev.clientX - r.left, my = ev.clientY - r.top;
                const f = ev.deltaY < 0 ? 1.12 : 1 / 1.12; const nk = Math.max(0.15, Math.min(3, svgG.k * f));
                svgG.tx = mx - (mx - svgG.tx) * (nk / svgG.k); svgG.ty = my - (my - svgG.ty) * (nk / svgG.k); svgG.k = nk; svgApplyTransform();
            }, { passive: false });
            svg.addEventListener('click', ev => { if (!ev.target.closest('.svgnode') && !ev.target.closest('.svgedge')) svgClearHighlight(); });
            svg.addEventListener('contextmenu', ev => { const ng = ev.target.closest('.svgnode'); if (ng) { ev.preventDefault(); mcdHideTable(ng.getAttribute('data-id')); } });
            svg.addEventListener('click', ev => { const eg = ev.target.closest('.svgedge'); if (eg) { const id = eg.getAttribute('data-id'); if (id && id.startsWith('rel_')) openEdgeDeleteModal(id); } });
        }
        function svgUpdateEdgeRec(rec) {
            const boxOf = i => { const p = svgG.pos[i], s = svgG.size[i] || [180, 60]; return { cx: p.x, cy: p.y, w: s[0], h: s[1] }; };
            const a = boxOf(rec.s), b = boxOf(rec.t);
            const p1 = svgBorderPoint(a, b.cx, b.cy), p2 = svgBorderPoint(b, a.cx, a.cy);
            rec.paths.forEach(pt => pt.setAttribute('d', `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`));
            if (rec.text) { rec.text.setAttribute('x', (p1.x + p2.x) / 2); rec.text.setAttribute('y', (p1.y + p2.y) / 2 - 3); }
        }
        function svgUpdateEdgesFor(id) { ((_svgIdx.edgesByNode || {})[id] || []).forEach(svgUpdateEdgeRec); }
        // Focus (domaine) + surlignage du voisinage en SVG (via classe .svg-dim).
        function svgSetDim(keepIds) {
            const svg = el('mcdSvg'); if (!svg) return;
            svg.querySelectorAll('.svgnode').forEach(g => g.classList.toggle('svg-dim', keepIds && !keepIds.has(g.getAttribute('data-id'))));
            svg.querySelectorAll('.svgedge').forEach(g => g.classList.toggle('svg-dim', keepIds && !(keepIds.has(g.getAttribute('data-s')) && keepIds.has(g.getAttribute('data-t')))));
        }
        function svgApplyFocus() {
            const th = (state.graphConfig.mcdTheme || '').trim();
            if (th && state.graphConfig.mcdFocus) { const keep = new Set(Object.values(state.tables).filter(t => (t.theme || '').trim() === th).map(t => t.id)); svgSetDim(keep); }
            else svgSetDim(null);
        }
        function svgHighlightNeighbors(id) {
            if (mcdHighlightId === id) { svgClearHighlight(); return; }
            mcdHighlightId = id; const keep = new Set([id]);
            state.relations.forEach(r => { if (r.sourceTable === id) keep.add(r.targetTable); else if (r.targetTable === id) keep.add(r.sourceTable); });
            svgSetDim(keep);
        }
        function svgClearHighlight() { mcdHighlightId = null; svgApplyFocus(); }

        // ---- 🔍 Recherche « aller à une table » : centre la vue et surligne le voisinage ----
        function svgCenterOn(id) {
            const cont = el('networkGraph'); const p = svgG.pos[id]; if (!cont || !p) return;
            const W = cont.clientWidth || 800, H = cont.clientHeight || 500;
            if (svgG.k < 0.5) svgG.k = 0.8;
            svgG.tx = W / 2 - p.x * svgG.k; svgG.ty = H / 2 - p.y * svgG.k;
            svgApplyTransform(); mcdHighlightId = null; svgHighlightNeighbors(id);
        }
        function mcdGotoTable(name) {
            const t = Object.values(state.tables).find(x => x.name === name); if (!t) return;
            if (!mcdVisibleIds().has(t.id)) { state.graphConfig.mcdTheme = ''; state.graphConfig.mcdHidden = []; renderGraph(); }
            svgCenterOn(t.id);
        }
        // ---- 🧭 Chemin entre deux tables : surligne la chaîne de jointures ----
        let mcdPathMode = false, mcdPathA = null;
        function mcdTogglePathMode() {
            mcdPathMode = !mcdPathMode; mcdPathA = null; mcdLinkMode = false;
            renderMcdControls();
            mcdLinkHint(mcdPathMode ? '🧭 Mode chemin — cliquez la <strong>première</strong> table, puis la <strong>seconde</strong> : la chaîne de jointures qui les relie sera surlignée.' : '');
            if (!mcdPathMode) svgClearHighlight();
        }
        function mcdPathClick(id) {
            if (!mcdPathA) { mcdPathA = id; mcdLinkHint(`🧭 1️⃣ <strong>${escapeHTML(state.tables[id].name)}</strong> — cliquez la table d'arrivée.`); return; }
            const a = mcdPathA; mcdPathA = null;
            // BFS sur les liens du modèle
            const adj = {};
            state.relations.forEach(r => { if (!r.sourceCol || !r.targetCol) return; (adj[r.sourceTable] = adj[r.sourceTable] || []).push({ o: r.targetTable, r }); (adj[r.targetTable] = adj[r.targetTable] || []).push({ o: r.sourceTable, r }); });
            const prev = { [a]: null }; const q = [a]; let ok = false;
            while (q.length) { const u = q.shift(); if (u === id) { ok = true; break; } (adj[u] || []).forEach(v => { if (!(v.o in prev)) { prev[v.o] = u; q.push(v.o); } }); }
            if (!ok) { mcdLinkHint(`❌ Aucun chemin de jointures entre <strong>${escapeHTML(state.tables[a].name)}</strong> et <strong>${escapeHTML(state.tables[id].name)}</strong> — ajoutez un lien dans le modèle.`); return; }
            const path = []; let cur = id; while (cur) { path.unshift(cur); cur = prev[cur]; }
            svgSetDim(new Set(path));
            mcdLinkHint(`🧭 Chemin : ${path.map(x => `<strong>${escapeHTML(state.tables[x].name)}</strong>`).join(' → ')} <button onclick="svgClearHighlight(); mcdLinkHint(mcdPathMode ? '🧭 Mode chemin — cliquez deux tables.' : '')" class="ml-2 text-[10px] bg-white border border-indigo-300 rounded px-1.5 py-0.5">effacer</button>`);
        }
        // ---- 🗺 Mini-carte : aperçu global + fenêtre courante, clic pour se déplacer ----
        function svgRenderMinimap() {
            const cont = el('networkGraph'); if (!cont || !el('mcdSvg')) return;
            let mm = cont.querySelector('.mcdMini');
            const ids = Object.keys(svgG.pos); if (!ids.length) { if (mm) mm.remove(); return; }
            let x1 = 1e9, y1 = 1e9, x2 = -1e9, y2 = -1e9;
            ids.forEach(id => { const p = svgG.pos[id], s = svgG.size[id] || [180, 60]; x1 = Math.min(x1, p.x - s[0] / 2); y1 = Math.min(y1, p.y - s[1] / 2); x2 = Math.max(x2, p.x + s[0] / 2); y2 = Math.max(y2, p.y + s[1] / 2); });
            const MW = 168, MH = 104, sc = Math.min(MW / Math.max(1, x2 - x1), MH / Math.max(1, y2 - y1)) * 0.92;
            const ox = (MW - (x2 - x1) * sc) / 2 - x1 * sc, oy = (MH - (y2 - y1) * sc) / 2 - y1 * sc;
            const W = cont.clientWidth || 800, H = cont.clientHeight || 500;
            const vx = (0 - svgG.tx) / svgG.k, vy = (0 - svgG.ty) / svgG.k, vw = W / svgG.k, vh = H / svgG.k;
            const rects = ids.map(id => { const p = svgG.pos[id], s = svgG.size[id] || [180, 60]; const t = state.tables[id]; const pal = t && t.theme ? themePalette((t.theme || '').trim()) : null;
                return `<rect x="${(p.x - s[0] / 2) * sc + ox}" y="${(p.y - s[1] / 2) * sc + oy}" width="${Math.max(2, s[0] * sc)}" height="${Math.max(2, s[1] * sc)}" fill="${pal ? pal.zone : '#94a3b8'}" fill-opacity="0.75" rx="1"/>`; }).join('');
            const view = `<rect x="${vx * sc + ox}" y="${vy * sc + oy}" width="${vw * sc}" height="${vh * sc}" fill="none" stroke="#4f46e5" stroke-width="1.5"/>`;
            if (!mm) { mm = document.createElement('div'); mm.className = 'mcdMini'; mm.style.cssText = 'position:absolute;right:10px;bottom:10px;width:168px;height:104px;background:rgba(255,255,255,.92);border:1px solid #cbd5e1;border-radius:8px;box-shadow:0 4px 10px -4px rgba(15,23,42,.3);cursor:crosshair;z-index:5;overflow:hidden'; cont.style.position = 'relative'; cont.appendChild(mm);
                mm.addEventListener('mousedown', ev => { ev.stopPropagation(); const r = mm.getBoundingClientRect(); const gx = (ev.clientX - r.left - mm.__ox) / mm.__sc, gy = (ev.clientY - r.top - mm.__oy) / mm.__sc; const c2 = el('networkGraph'); const W2 = c2.clientWidth || 800, H2 = c2.clientHeight || 500; svgG.tx = W2 / 2 - gx * svgG.k; svgG.ty = H2 / 2 - gy * svgG.k; svgApplyTransform(); }); }
            mm.__sc = sc; mm.__ox = ox; mm.__oy = oy;
            mm.innerHTML = `<svg width="${MW}" height="${MH}">${rects}${view}</svg>`;
        }


        function getReachableTables(startNodeId) {
            const visited = new Set(); const queue = [startNodeId]; const adj = {};
            Object.keys(state.tables).forEach(t => adj[t] = []);
            state.relations.forEach(r => { if (r.sourceCol && r.targetCol) { adj[r.sourceTable].push(r.targetTable); adj[r.targetTable].push(r.sourceTable); } });
            while(queue.length > 0) { const current = queue.shift(); if (!visited.has(current)) { visited.add(current); if (adj[current]) { adj[current].forEach(neighbor => { if (!visited.has(neighbor)) queue.push(neighbor); }); } } }
            return Array.from(visited);
        }

        function updateBaseTableSelect() {
            const s=el('baseTableSelect'); const currentVal=s.value;
            s.innerHTML = tableOptionsHtml({ placeholder: 'Sélectionnez la table principale...', readyOnly: true });
            if(currentVal && state.tables[currentVal]) s.value=currentVal;
        }

        function handleBaseTableChange() {
            const val = el('baseTableSelect').value;
            if (val && state.tables[val]) advSetBase(val); else renderAdvExtract();
        }






        // Évite les collisions de noms de colonnes en sortie (ex: deux tables différentes sanitizées
        // vers le même préfixe + même nom de colonne, ou deux mappings du comparateur identiques).
        function dedupeHeader(existingHeaders, name) {
            if (!existingHeaders.includes(name)) return name;
            let i = 2;
            while (existingHeaders.includes(`${name}_${i}`)) i++;
            return `${name}_${i}`;
        }







