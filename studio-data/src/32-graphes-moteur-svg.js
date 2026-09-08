        // ======================= Moteur SVG universel (unique moteur de graphes) =======================
        // Petit moteur maison exposant l'API dont les écrans ont besoin (data/render/changeData/
        // layout/fitView/findById/getNodes/getEdges/updateItem/addItem/on/zoom/downloadFullImage).
        // Disposition en couches (BFS gauche→droite), déplacement/pan/zoom gérés à la main.
        function createSvgGraph(container) {
            const S = { c: container, nodes: [], edges: [], pos: {}, size: {}, k: 1, tx: 30, ty: 30, h: {}, destroyed: false, _mm: null, _mu: null };
            const nodeSize = m => {
                if (m.type === 'studio-uml-node') return umlNodeSize(m.title || '', m.rows || []);
                const tl = String(m.title || '').length, cl = String(m.content || '').length;
                return [Math.min(260, Math.max(120, Math.max(tl * 7.5, cl * 6) + 20)), m.content ? 46 : 30];
            };
            /* Disposition en couches, revue pour les VRAIS volumes (photos utilisateur : tout
               s'empilait dans un coin et les arêtes se croisaient en éventail) :
                 1. ordre BARYCENTRIQUE dans chaque colonne (4 passes) — un nœud se place en face
                    de la moyenne de ses voisins, ce qui démêle l'essentiel des croisements ;
                 2. une colonne trop haute (> 12 nœuds, typiquement les consommateurs d'un même
                    objet) est REPLIÉE en sous-colonnes côte à côte au lieu d'une pile infinie ;
                 3. chaque colonne est CENTRÉE verticalement — plus d'alignement en haut qui
                    laissait la moitié du canevas vide. */
            const layered = () => {
                const ids = S.nodes.map(n => n.id); const idset = new Set(ids);
                const adj = {}, indeg = {};
                ids.forEach(i => { adj[i] = []; indeg[i] = 0; });
                S.edges.forEach(e => { if (e.source !== e.target && idset.has(e.source) && idset.has(e.target)) { adj[e.source].push(e.target); indeg[e.target]++; } });
                const depth = {}; const q = ids.filter(i => !indeg[i]); (q.length ? q : ids.slice(0, 1)).forEach(i => depth[i] = 0);
                const queue = [...(q.length ? q : ids.slice(0, 1))];
                const maxDepth = ids.length;
                while (queue.length) { const u = queue.shift(); const nd = depth[u] + 1; if (nd >= maxDepth) continue; (adj[u] || []).forEach(v => { if (depth[v] === undefined || depth[v] < nd) { depth[v] = nd; queue.push(v); } }); }
                ids.forEach(i => { if (depth[i] === undefined) depth[i] = 0; });
                const colsMap = {}; ids.forEach(i => (colsMap[depth[i]] = colsMap[depth[i]] || []).push(i));
                const order = Object.keys(colsMap).sort((a, b) => a - b).map(d => colsMap[d]);
                const preds = {}, succs = {};
                S.edges.forEach(e => { if (e.source === e.target) return; (succs[e.source] = succs[e.source] || []).push(e.target); (preds[e.target] = preds[e.target] || []).push(e.source); });
                const idx = {};
                const reindex = () => order.forEach(col => col.forEach((id, i) => idx[id] = i));
                reindex();
                for (let it = 0; it < 4; it++) {
                    const fwd = it % 2 === 0;
                    (fwd ? order : order.slice().reverse()).forEach(col => {
                        col.sort((a, b) => {
                            const na = (fwd ? preds : succs)[a] || [], nb = (fwd ? preds : succs)[b] || [];
                            const ma = na.length ? na.reduce((s2, x) => s2 + (idx[x] || 0), 0) / na.length : idx[a];
                            const mb = nb.length ? nb.reduce((s2, x) => s2 + (idx[x] || 0), 0) / nb.length : idx[b];
                            return ma - mb;
                        });
                    });
                    reindex();
                }
                const GX = 110, GY = 30, MAXROW = 12;
                // 1er passage : hauteur de chaque colonne (repliée), pour centrer ensuite
                const packs = order.map(col => {
                    const nSub = Math.max(1, Math.ceil(col.length / MAXROW));
                    const per = Math.ceil(col.length / nSub);
                    const subs = []; for (let k2 = 0; k2 < nSub; k2++) subs.push(col.slice(k2 * per, (k2 + 1) * per));
                    const hs = subs.map(sub => sub.reduce((h2, i) => h2 + S.size[i][1] + GY, -GY));
                    return { subs, hs, h: Math.max(...hs) };
                });
                const totalH = Math.max(...packs.map(pk => pk.h));
                let x = 0;
                packs.forEach(pk => {
                    let colRight = x;
                    pk.subs.forEach((sub, si) => {
                        const w = Math.max(...sub.map(i => S.size[i][0]));
                        let y = (totalH - pk.hs[si]) / 2;
                        sub.forEach(i => { const sz = S.size[i]; S.pos[i] = { x: x + w / 2, y: y + sz[1] / 2 }; y += sz[1] + GY; });
                        x += w + (si < pk.subs.length - 1 ? 24 : 0);
                        colRight = x + (si < pk.subs.length - 1 ? 0 : w);
                    });
                    x = colRight + GX;
                });
            };
            const esc = escapeHTML;
            // Chemin d'une arête : courbe horizontale quand les nœuds sont côte à côte (c'est la
            // disposition normale), segment sinon. Partagé entre le tracé et le déplacement.
            const edgePath = (a, b) => {
                if (b.cx - a.cx > (a.w + b.w) / 2 + 24) {
                    const p1 = { x: a.cx + a.w / 2, y: a.cy }, p2 = { x: b.cx - b.w / 2, y: b.cy };
                    const dx = Math.max(40, (p2.x - p1.x) * 0.45);
                    return { d: `M ${p1.x} ${p1.y} C ${p1.x + dx} ${p1.y}, ${p2.x - dx} ${p2.y}, ${p2.x} ${p2.y}`, mx: (p1.x + p2.x) / 2, my: (p1.y + p2.y) / 2 };
                }
                if (a.cx - b.cx > (a.w + b.w) / 2 + 24) {
                    const p1 = { x: a.cx - a.w / 2, y: a.cy }, p2 = { x: b.cx + b.w / 2, y: b.cy };
                    const dx = Math.max(40, (p1.x - p2.x) * 0.45);
                    return { d: `M ${p1.x} ${p1.y} C ${p1.x - dx} ${p1.y}, ${p2.x + dx} ${p2.y}, ${p2.x} ${p2.y}`, mx: (p1.x + p2.x) / 2, my: (p1.y + p2.y) / 2 };
                }
                const p1 = svgBorderPoint(a, b.cx, b.cy), p2 = svgBorderPoint(b, a.cx, a.cy);
                return { d: `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`, mx: (p1.x + p2.x) / 2, my: (p1.y + p2.y) / 2 };
            };
            const draw = () => {
                if (S.destroyed) return;
                S.nodes.forEach(n => S.size[n.id] = nodeSize(n));
                const missing = S.nodes.filter(n => !S.pos[n.id]);
                if (missing.length === S.nodes.length) layered();
                else missing.forEach(n => { const ref = S.edges.find(e => (e.target === n.id && S.pos[e.source]) || (e.source === n.id && S.pos[e.target])); const rp = ref ? S.pos[ref.source === n.id ? ref.target : ref.source] : { x: 0, y: 0 }; S.pos[n.id] = { x: rp.x + 260 + Math.random() * 60, y: rp.y + (Math.random() - 0.5) * 160 }; });
                const box = id => { const p = S.pos[id], s = S.size[id]; return { cx: p.x, cy: p.y, w: s[0], h: s[1] }; };
                /* Un éventail de 20 arêtes « consommé par » vers le même nœud empilait 20 fois la
                   même étiquette au même endroit (illisible — cf. photos). Quand ≥ 3 arêtes portent
                   le même libellé vers/depuis le même nœud, une seule étiquette est affichée. */
                const lblCnt = {};
                S.edges.forEach(e => { if (!e.label) return;
                    lblCnt['t:' + e.label + '¦' + e.target] = (lblCnt['t:' + e.label + '¦' + e.target] || 0) + 1;
                    lblCnt['s:' + e.label + '¦' + e.source] = (lblCnt['s:' + e.label + '¦' + e.source] || 0) + 1; });
                const lblDone = new Set();
                const lblFor = e => { if (!e.label) return '';
                    const kt = 't:' + e.label + '¦' + e.target, ks = 's:' + e.label + '¦' + e.source;
                    if (lblCnt[kt] >= 3) { if (lblDone.has(kt)) return ''; lblDone.add(kt); return e.label + ' ×' + lblCnt[kt]; }
                    if (lblCnt[ks] >= 3) { if (lblDone.has(ks)) return ''; lblDone.add(ks); return e.label + ' ×' + lblCnt[ks]; }
                    return e.label; };
                let eSvg = '';
                S.edges.forEach(e => {
                    if (!S.pos[e.source] || !S.pos[e.target]) return;
                    const st = e.style || {}; const col = st.stroke || '#94a3b8'; const dash = st.lineDash ? ` stroke-dasharray="${st.lineDash.join(' ')}"` : ''; const lw = st.lineWidth || 1.4;
                    if (e.source === e.target) { const b = box(e.source); const d = (e.loopCfg && e.loopCfg.dist) || 40;
                        eSvg += `<g class="usvge" data-id="${esc(e.id)}" data-s="${esc(e.source)}" data-t="${esc(e.source)}" data-loop="${d}"><path d="M ${b.cx - 20} ${b.cy - b.h / 2} C ${b.cx - 20} ${b.cy - b.h / 2 - d}, ${b.cx + 20} ${b.cy - b.h / 2 - d}, ${b.cx + 20} ${b.cy - b.h / 2}" fill="none" stroke="${col}" stroke-width="${lw}"${dash} marker-end="url(#uArrow)"/>${e.label ? `<text class="usvg-lbl" x="${b.cx}" y="${b.cy - b.h / 2 - d - 4}" text-anchor="middle" font-size="10">${esc(e.label)}</text>` : ''}</g>`; return; }
                    const a = box(e.source), b = box(e.target);
                    const ep = edgePath(a, b);
                    const shown = lblFor(e);
                    eSvg += `<g class="usvge" data-id="${esc(e.id)}" data-s="${esc(e.source)}" data-t="${esc(e.target)}"><path d="${ep.d}" fill="none" stroke="${col}" stroke-width="${lw}"${dash} opacity=".85" marker-end="url(#uArrow)"/>${shown ? `<text class="usvg-lbl" x="${ep.mx}" y="${ep.my - 3}" text-anchor="middle" font-size="10">${esc(shown)}</text>` : ''}</g>`;
                });
                let nSvg = '';
                S.nodes.forEach(m => {
                    const [w, h] = S.size[m.id]; const p = S.pos[m.id];
                    let inner;
                    if (m.type === 'studio-uml-node') {
                        const headH = 28, rowH = 15;
                        inner = `<rect width="${w}" height="${h}" rx="8" fill="#fff" stroke="${m.stroke || '#6366f1'}" stroke-width="1.2"/><rect width="${w}" height="${headH}" rx="8" fill="${m.headFill || '#eef2ff'}"/><rect y="${headH - 8}" width="${w}" height="8" fill="${m.headFill || '#eef2ff'}"/><text x="10" y="${headH / 2 + 4}" font-size="12" font-weight="700" fill="${m.titleFill || '#312e81'}">${esc(svgTrunc(m.title || '', w))}</text>`;
                        (m.rows || []).forEach((r, i) => inner += `<text x="10" y="${headH + 12 + i * rowH}" font-size="10" fill="#475569">${esc(svgTrunc(r, w))}</text>`);
                    } else {
                        inner = `<rect width="${w}" height="${h}" rx="6" fill="${m.fill || '#eef2ff'}" stroke="${m.stroke || '#6366f1'}" stroke-width="1.2"/><text x="8" y="${m.content ? 17 : h / 2 + 4}" font-size="11" font-weight="700" fill="#1e293b">${esc(svgTrunc(m.title || '', w))}</text>${m.content ? `<text x="8" y="${h - 9}" font-size="9" fill="#64748b">${esc(svgTrunc(m.content, w))}</text>` : ''}`;
                    }
                    nSvg += `<g class="usvgn" data-id="${esc(m.id)}" transform="translate(${p.x - w / 2},${p.y - h / 2})" style="cursor:grab">${inner}</g>`;
                });
                S.c.innerHTML = `<svg class="usvg" width="100%" height="100%" style="display:block"><defs><marker id="uArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="#94a3b8"/></marker></defs><g class="uvp" transform="translate(${S.tx},${S.ty}) scale(${S.k})">${eSvg}${nSvg}</g></svg>`;
                bind();
            };
            const apply = () => { const vp = S.c.querySelector('.uvp'); if (vp) vp.setAttribute('transform', `translate(${S.tx},${S.ty}) scale(${S.k})`);
                const sv = S.c.querySelector('svg.usvg'); if (sv) sv.classList.toggle('usvg-far', S.k < 0.45); };
            const fire = (evt, id) => { (S.h[evt] || []).forEach(f => { try { f({ item: api.findById(id) }); } catch (e) {} }); };
            // Mise à jour incrémentale du nœud déplacé + de ses arêtes (au lieu d'un redraw complet
            // par mouvement de souris — cause des saccades sur les grands graphes).
            const moveNode = id => {
                const p = S.pos[id], sz = S.size[id]; const elx = (S._nEls || {})[id]; if (!p || !sz || !elx) return;
                elx.setAttribute('transform', `translate(${p.x - sz[0] / 2},${p.y - sz[1] / 2})`);
                const box = i => { const pp = S.pos[i], ss = S.size[i]; return { cx: pp.x, cy: pp.y, w: ss[0], h: ss[1] }; };
                ((S._eByN || {})[id] || []).forEach(rec => {
                    if (rec.loop) {
                        const b = box(rec.s); const d = parseFloat(rec.loop) || 40;
                        if (rec.path) rec.path.setAttribute('d', `M ${b.cx - 20} ${b.cy - b.h / 2} C ${b.cx - 20} ${b.cy - b.h / 2 - d}, ${b.cx + 20} ${b.cy - b.h / 2 - d}, ${b.cx + 20} ${b.cy - b.h / 2}`);
                        if (rec.text) { rec.text.setAttribute('x', b.cx); rec.text.setAttribute('y', b.cy - b.h / 2 - d - 4); }
                        return;
                    }
                    if (!S.pos[rec.s] || !S.pos[rec.t]) return;
                    const a = box(rec.s), b = box(rec.t);
                    const ep = edgePath(a, b);
                    if (rec.path) rec.path.setAttribute('d', ep.d);
                    if (rec.text) { rec.text.setAttribute('x', ep.mx); rec.text.setAttribute('y', ep.my - 3); }
                });
            };
            const bind = () => {
                const svg = S.c.querySelector('svg.usvg'); if (!svg) return;
                if (S._mm) window.removeEventListener('mousemove', S._mm);
                if (S._mu) window.removeEventListener('mouseup', S._mu);
                const nEls = {}; svg.querySelectorAll('.usvgn').forEach(g => nEls[g.getAttribute('data-id')] = g);
                const byN = {};
                svg.querySelectorAll('.usvge').forEach(g => {
                    const rec = { g, s: g.getAttribute('data-s'), t: g.getAttribute('data-t'), loop: g.getAttribute('data-loop'), path: g.querySelector('path'), text: g.querySelector('text') };
                    if (!rec.s) return;
                    (byN[rec.s] = byN[rec.s] || []).push(rec);
                    if (rec.t !== rec.s) (byN[rec.t] = byN[rec.t] || []).push(rec);
                });
                S._nEls = nEls; S._eByN = byN;
                const pt = ev => { const r = svg.getBoundingClientRect(); return { x: (ev.clientX - r.left - S.tx) / S.k, y: (ev.clientY - r.top - S.ty) / S.k }; };
                let mode = null, dragId = null, last = null, moved = 0, sg = null, clicks = {};
                svg.addEventListener('mousedown', ev => { const ng = ev.target.closest('.usvgn');
                    if (ng) { mode = 'node'; dragId = ng.getAttribute('data-id'); sg = pt(ev); moved = 0; } else { mode = 'pan'; last = { x: ev.clientX, y: ev.clientY }; }
                    ev.preventDefault(); });
                window.addEventListener('mousemove', S._mm = ev => {
                    if (mode === 'pan') { S.tx += ev.clientX - last.x; S.ty += ev.clientY - last.y; last = { x: ev.clientX, y: ev.clientY }; apply(); }
                    else if (mode === 'node') { const g = pt(ev); const p = S.pos[dragId]; if (!p) return; p.x += g.x - sg.x; p.y += g.y - sg.y; sg = g; moved++; if (!S._raf) S._raf = requestAnimationFrame(() => { S._raf = 0; if (dragId) moveNode(dragId); }); }
                });
                window.addEventListener('mouseup', S._mu = () => {
                    if (mode === 'node' && dragId && moved >= 3) moveNode(dragId);
                    if (mode === 'node' && moved < 3 && dragId) {
                        const now = Date.now();
                        if (clicks[dragId] && now - clicks[dragId] < 350) { fire('node:dblclick', dragId); clicks[dragId] = 0; }
                        else { clicks[dragId] = now; fire('node:click', dragId); }
                    }
                    mode = null; dragId = null;
                });
                svg.addEventListener('wheel', ev => { ev.preventDefault(); const r = svg.getBoundingClientRect(); const mx = ev.clientX - r.left, my = ev.clientY - r.top; const f = ev.deltaY < 0 ? 1.12 : 1 / 1.12; const nk = Math.max(0.1, Math.min(3, S.k * f)); S.tx = mx - (mx - S.tx) * (nk / S.k); S.ty = my - (my - S.ty) * (nk / S.k); S.k = nk; apply(); }, { passive: false });
            };
            const wrap = m => m ? { getID: () => m.id, getModel: () => m, _m: m } : null;
            const api = {
                data(d) { S.nodes = (d && d.nodes || []).slice(); S.edges = (d && d.edges || []).slice(); },
                render: draw,
                changeData(d) { this.data(d); draw(); },
                layout() { S.pos = {}; S.nodes.forEach(n => S.size[n.id] = nodeSize(n)); layered(); draw(); },
                fitView() { const ids = S.nodes.map(n => n.id).filter(i => S.pos[i]); if (!ids.length) return;
                    let x1 = 1e9, y1 = 1e9, x2 = -1e9, y2 = -1e9;
                    ids.forEach(i => { const p = S.pos[i], s = S.size[i]; x1 = Math.min(x1, p.x - s[0] / 2); y1 = Math.min(y1, p.y - s[1] / 2); x2 = Math.max(x2, p.x + s[0] / 2); y2 = Math.max(y2, p.y + s[1] / 2); });
                    const W = S.c.clientWidth || 800, H = S.c.clientHeight || 450, M = 40;
                    S.k = Math.max(0.1, Math.min(1.4, Math.min((W - 2 * M) / Math.max(1, x2 - x1), (H - 2 * M) / Math.max(1, y2 - y1))));
                    S.tx = (W - (x2 - x1) * S.k) / 2 - x1 * S.k; S.ty = (H - (y2 - y1) * S.k) / 2 - y1 * S.k; apply(); },
                zoom(f) { const W = S.c.clientWidth || 800, H = S.c.clientHeight || 450; const nk = Math.max(0.1, Math.min(3, S.k * f)); S.tx = W / 2 - (W / 2 - S.tx) * (nk / S.k); S.ty = H / 2 - (H / 2 - S.ty) * (nk / S.k); S.k = nk; apply(); },
                centerOn(id) { const p2 = S.pos[id]; if (!p2) return; const W = S.c.clientWidth || 800, H = S.c.clientHeight || 450; if (S.k < 0.6) S.k = 0.9; S.tx = W / 2 - p2.x * S.k; S.ty = H / 2 - p2.y * S.k; apply(); },
                dimExcept(keep) {
                    S.c.querySelectorAll('.usvgn').forEach(g => g.style.opacity = (!keep || keep.has(g.getAttribute('data-id'))) ? '' : '0.12');
                    S.c.querySelectorAll('.usvge').forEach(g => { const s2 = g.getAttribute('data-s'), t2 = g.getAttribute('data-t'); g.style.opacity = (!keep || (keep.has(s2) && keep.has(t2))) ? '' : '0.08'; });
                },
                getWidth() { return S.c.clientWidth || 800; }, getHeight() { return S.c.clientHeight || 450; },
                changeSize() { }, get(k2) { return k2 === 'destroyed' ? S.destroyed : undefined; },
                getNodes() { return S.nodes.map(wrap); }, getEdges() { return S.edges.map(wrap); },
                findById(id) { return wrap(S.nodes.find(n => n.id === id) || S.edges.find(e => e.id === id)); },
                addItem(kind, m) { (kind === 'node' ? S.nodes : S.edges).push(m); },
                updateItem(it, patch) { const m = it && it._m ? it._m : (typeof it === 'string' ? (S.nodes.find(n => n.id === it) || S.edges.find(e => e.id === it)) : it && it.getModel ? it.getModel() : null); if (m) Object.assign(m, patch); clearTimeout(S._rt); S._rt = setTimeout(draw, 30); },
                setItemState() { }, refreshPositions: draw,
                on(evt, fn) { (S.h[evt] = S.h[evt] || []).push(fn); },
                destroy() { S.destroyed = true; if (S._mm) window.removeEventListener('mousemove', S._mm); if (S._mu) window.removeEventListener('mouseup', S._mu); S.c.innerHTML = ''; },
                downloadFullImage(name) {
                    try {
                        const ids = S.nodes.map(n => n.id).filter(i => S.pos[i]); if (!ids.length) return;
                        let x1 = 1e9, y1 = 1e9, x2 = -1e9, y2 = -1e9;
                        ids.forEach(i => { const p = S.pos[i], s = S.size[i]; x1 = Math.min(x1, p.x - s[0] / 2); y1 = Math.min(y1, p.y - s[1] / 2); x2 = Math.max(x2, p.x + s[0] / 2); y2 = Math.max(y2, p.y + s[1] / 2); });
                        const M = 40, w = Math.ceil(x2 - x1 + 2 * M), h = Math.ceil(y2 - y1 + 2 * M);
                        const vp = S.c.querySelector('.uvp').cloneNode(true); vp.setAttribute('transform', `translate(${M - x1},${M - y1})`);
                        const out = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><marker id="uArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="#94a3b8"/></marker></defs><rect width="${w}" height="${h}" fill="#fff"/>${new XMLSerializer().serializeToString(vp)}</svg>`;
                        const img = new Image();
                        img.onload = () => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; cv.getContext('2d').drawImage(img, 0, 0); const a = document.createElement('a'); a.href = cv.toDataURL('image/png'); a.download = (name || 'graphe') + '.png'; document.body.appendChild(a); a.click(); a.remove(); };
                        img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(out);
                    } catch (e) { showError('Export impossible : ' + e.message); }
                },
            };
            return api;
        }
