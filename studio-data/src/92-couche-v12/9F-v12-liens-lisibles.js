        // ======================= V12 : LIENS LISIBLES DANS LES GRAPHES (lineage, carte des flux, modèle) =======================
        // Le moteur SVG partait de chaque case par son centre : tous les liens d'une même case se
        // superposaient sur les premiers centimètres, deux liens vers la même cible se confondaient, et
        // un lien passant sous une case déplacée disparaissait. Ici, sans toucher au moteur (crochets
        // `createSvgGraph.router` et `createSvgGraph.afterDraw`) :
        //  • chaque lien a son propre POINT D'ATTACHE sur la case (répartis sur le côté, dans l'ordre
        //    vertical de l'autre extrémité, pour ne pas se croiser au départ) ;
        //  • tracé ORTHOGONAL à angles arrondis, avec un COULOIR vertical propre à chaque lien entre
        //    deux colonnes : deux liens ne se superposent plus, même quand on déplace les cases ;
        //  • au survol d'un lien ou d'une case, ses liens passent AU-DESSUS des autres cases, en gras,
        //    avec l'étiquette lisible ; pendant un déplacement, les liens de la case suivent en gras.
        // Interrupteur « Liens droits » (palette, mémorisé) pour revenir aux courbes d'origine.
        v12State.linesOrtho = (() => { try { return localStorage.getItem('sd_v12_ortho') !== '0'; } catch (e) { return true; } })();
        function v12LinesOn() { return v12State.linesOrtho !== false; }
        function v12LinesSet(on) { v12State.linesOrtho = !!on; try { localStorage.setItem('sd_v12_ortho', on ? '1' : '0'); } catch (e) {} if (typeof _lineageRedraw === 'function') { try { _lineageRedraw(); } catch (e) {} } if (typeof v11Toast === 'function') v11Toast(on ? 'Liens à angles droits, un couloir par lien.' : 'Liens courbes (tracé d\'origine).', 'info'); }
        const V12_LN = { R: 6, MINSTEP: 7, MAXSTEP: 16, GAP: 24 };
        // Rang d'un lien parmi ceux qui partent (side='out') ou arrivent (side='in') sur un nœud, dans l'ordre
        // vertical de l'autre extrémité : les points d'attache ne se croisent pas au départ.
        function v12LnRank(S, e, side) {
            const nid = side === 'out' ? e.source : e.target;
            const sib = S.edges.filter(x => x.source !== x.target && (side === 'out' ? x.source === nid : x.target === nid) && S.pos[x.source] && S.pos[x.target]);
            const other = x => side === 'out' ? x.target : x.source;
            sib.sort((x, y) => (S.pos[other(x)].y - S.pos[other(y)].y) || (S.pos[other(x)].x - S.pos[other(y)].x) || String(x.id).localeCompare(String(y.id)));
            return { i: Math.max(0, sib.findIndex(x => x.id === e.id)), n: sib.length };
        }
        function v12LnPort(c, half, r) { if (r.n <= 1) return c; const step = Math.max(V12_LN.MINSTEP, Math.min(V12_LN.MAXSTEP, (2 * half - 8) / r.n)); return c + (r.i - (r.n - 1) / 2) * step; }
        // Couloir vertical (ou horizontal) propre au lien : rang parmi les liens qui traversent le même espace.
        function v12LnLane(S, e, a, b, horizontal) {
            const box = id => { const p = S.pos[id], s = S.size[id]; return { cx: p.x, cy: p.y, w: s[0], h: s[1] }; };
            const fwd = b.cx >= a.cx; const from = horizontal ? (fwd ? a.cx + a.w / 2 : a.cx - a.w / 2) : (b.cy >= a.cy ? a.cy + a.h / 2 : a.cy - a.h / 2);
            const same = S.edges.filter(x => { if (x.source === x.target || !S.pos[x.source] || !S.pos[x.target]) return false; const xa = box(x.source), xb = box(x.target); const xf = xb.cx >= xa.cx; if (horizontal) { if (xf !== fwd) return false; const xs = xf ? xa.cx + xa.w / 2 : xa.cx - xa.w / 2; return Math.abs(xs - from) < 40; } const xd = xb.cy >= xa.cy; if (xd !== (b.cy >= a.cy)) return false; const ys = xd ? xa.cy + xa.h / 2 : xa.cy - xa.h / 2; return Math.abs(ys - from) < 30; });
            same.sort((x, y) => { const ax = S.pos[x.target], ay = S.pos[y.target]; return horizontal ? ((ax.y - ay.y) || (S.pos[x.source].y - S.pos[y.source].y)) : ((ax.x - ay.x) || (S.pos[x.source].x - S.pos[y.source].x)); });
            const i = Math.max(0, same.findIndex(x => x.id === e.id)); return { i, n: same.length };
        }
        function v12LnPath(pts) {
            // polyligne à angles arrondis
            const R = V12_LN.R; let d = `M ${pts[0].x} ${pts[0].y}`;
            for (let i = 1; i < pts.length - 1; i++) {
                const p = pts[i - 1], c = pts[i], n = pts[i + 1];
                const d1 = Math.hypot(c.x - p.x, c.y - p.y), d2 = Math.hypot(n.x - c.x, n.y - c.y); const r = Math.min(R, d1 / 2, d2 / 2);
                if (r < 1) { d += ` L ${c.x} ${c.y}`; continue; }
                const u1 = { x: (c.x - p.x) / d1, y: (c.y - p.y) / d1 }, u2 = { x: (n.x - c.x) / d2, y: (n.y - c.y) / d2 };
                d += ` L ${c.x - u1.x * r} ${c.y - u1.y * r} Q ${c.x} ${c.y} ${c.x + u2.x * r} ${c.y + u2.y * r}`;
            }
            const l = pts[pts.length - 1]; return d + ` L ${l.x} ${l.y}`;
        }
        function v12LnRoute(S, e, a, b) {
            if (!v12LinesOn()) return null;
            const ro = v12LnRank(S, e, 'out'), ri = v12LnRank(S, e, 'in');
            const dx = b.cx - a.cx, gapH = Math.abs(dx) - (a.w + b.w) / 2, gapV = Math.abs(b.cy - a.cy) - (a.h + b.h) / 2;
            let pts, mx, my;
            if (gapH >= V12_LN.GAP || (gapH > 4 && gapH >= gapV)) {
                // côte à côte : sortie par le côté, couloir vertical, entrée par le côté opposé
                const fwd = dx > 0; const x0 = fwd ? a.cx + a.w / 2 : a.cx - a.w / 2, x2 = fwd ? b.cx - b.w / 2 : b.cx + b.w / 2;
                const y0 = v12LnPort(a.cy, a.h / 2, ro), y2 = v12LnPort(b.cy, b.h / 2, ri);
                const lane = v12LnLane(S, e, a, b, true); const span = Math.abs(x2 - x0);
                const frac = lane.n <= 1 ? 0.5 : 0.2 + 0.6 * (lane.i + 1) / (lane.n + 1); const x1 = x0 + (fwd ? 1 : -1) * Math.max(8, Math.min(span - 8, span * frac));
                pts = Math.abs(y2 - y0) < 1 ? [{ x: x0, y: y0 }, { x: x2, y: y2 }] : [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y2 }, { x: x2, y: y2 }];
                // étiquette : sur le segment le moins encombré — côté source quand beaucoup de liens convergent vers la cible
                const nearSrc = ri.n > ro.n; mx = nearSrc ? (x0 + x1) / 2 : (x1 + x2) / 2; my = nearSrc ? y0 : y2;
                if (Math.abs(nearSrc ? x1 - x0 : x2 - x1) < 60) { mx = x1; my = (y0 + y2) / 2; }
            } else if (gapV > 4) {
                // l'un au-dessus de l'autre : sortie par le bas / le haut, couloir horizontal
                const down = b.cy > a.cy; const y0 = down ? a.cy + a.h / 2 : a.cy - a.h / 2, y2 = down ? b.cy - b.h / 2 : b.cy + b.h / 2;
                const x0 = v12LnPort(a.cx, a.w / 2, ro), x2 = v12LnPort(b.cx, b.w / 2, ri);
                const lane = v12LnLane(S, e, a, b, false); const span = Math.abs(y2 - y0);
                const frac = lane.n <= 1 ? 0.5 : 0.2 + 0.6 * (lane.i + 1) / (lane.n + 1); const y1 = y0 + (down ? 1 : -1) * Math.max(6, Math.min(span - 6, span * frac));
                pts = Math.abs(x2 - x0) < 1 ? [{ x: x0, y: y0 }, { x: x2, y: y2 }] : [{ x: x0, y: y0 }, { x: x0, y: y1 }, { x: x2, y: y1 }, { x: x2, y: y2 }];
                mx = (x0 + x2) / 2; my = y1;
            } else {
                // cases qui se chevauchent : un crochet qui contourne par le haut, toujours visible
                const y0 = a.cy - a.h / 2, y2 = b.cy - b.h / 2; const top = Math.min(y0, y2) - 24 - ro.i * 6;
                const x0 = v12LnPort(a.cx, a.w / 2, ro), x2 = v12LnPort(b.cx, b.w / 2, ri);
                pts = [{ x: x0, y: y0 }, { x: x0, y: top }, { x: x2, y: top }, { x: x2, y: y2 }];
                mx = (x0 + x2) / 2; my = top;
            }
            return { d: v12LnPath(pts), mx, my };
        }
        createSvgGraph.router = v12LnRoute;
        // ---- mise en avant : le lien survolé (ou les liens d'une case survolée / déplacée) passent au-dessus des cases ----
        function v12LnDecor(S, svg) {
            if (!svg || svg._v12ln) return; svg._v12ln = true;
            const vp = svg.querySelector('.uvp'); if (!vp) return;
            let top = vp.querySelector('.utop'); if (!top) { top = document.createElementNS('http://www.w3.org/2000/svg', 'g'); top.setAttribute('class', 'utop'); vp.appendChild(top); }
            const raised = new Map(); // g -> { parent, next }
            const raise = g => { if (raised.has(g)) return; raised.set(g, { parent: g.parentNode, next: g.nextSibling }); g.classList.add('usvge-on'); top.appendChild(g); };
            const lower = g => { const r = raised.get(g); if (!r) return; raised.delete(g); g.classList.remove('usvge-on'); if (r.next && r.next.parentNode === r.parent) r.parent.insertBefore(g, r.next); else r.parent.appendChild(g); };
            const lowerAll = () => Array.from(raised.keys()).forEach(lower);
            const edgesOf = id => Array.from(svg.querySelectorAll('.usvge')).filter(g => g.getAttribute('data-s') === id || g.getAttribute('data-t') === id);
            let pinned = null; // case en cours de déplacement
            svg.addEventListener('mouseover', ev => {
                const eg = ev.target.closest && ev.target.closest('.usvge'); const ng = ev.target.closest && ev.target.closest('.usvgn');
                if (pinned) return;
                if (eg) { lowerAll(); raise(eg); } else if (ng) { lowerAll(); edgesOf(ng.getAttribute('data-id')).forEach(raise); }
            });
            svg.addEventListener('mouseleave', () => { if (!pinned) lowerAll(); });
            svg.addEventListener('mousedown', ev => { const ng = ev.target.closest && ev.target.closest('.usvgn'); if (!ng) return; pinned = ng.getAttribute('data-id'); lowerAll(); edgesOf(pinned).forEach(raise); svg.classList.add('usvg-drag'); }, true);
            window.addEventListener('mouseup', () => { if (!pinned) return; pinned = null; svg.classList.remove('usvg-drag'); v12LnRefresh(S, svg); }, true);
        }
        // Après un déplacement, les points d'attache et couloirs des AUTRES liens ont pu changer de rang : on retrace tout.
        function v12LnRefresh(S, svg) {
            if (!v12LinesOn() || !svg) return;
            const box = id => { const p = S.pos[id], s = S.size[id]; return p && s ? { cx: p.x, cy: p.y, w: s[0], h: s[1] } : null; };
            svg.querySelectorAll('.usvge').forEach(g => {
                const s = g.getAttribute('data-s'), t = g.getAttribute('data-t'); if (!s || !t || s === t || g.getAttribute('data-loop')) return;
                const e = S.edges.find(x => x.id === g.getAttribute('data-id')); const a = box(s), b = box(t); if (!e || !a || !b) return;
                const ep = v12LnRoute(S, e, a, b); if (!ep) return;
                const path = g.querySelector('path'), text = g.querySelector('text');
                if (path) path.setAttribute('d', ep.d); if (text) { text.setAttribute('x', ep.mx); text.setAttribute('y', ep.my - 3); }
            });
        }
        createSvgGraph.afterDraw = v12LnDecor;
        Object.assign(V11_LEXIQUE, { 'liens lisibles': 'Dans un graphe, chaque lien a son propre point d\'attache sur la case et son propre couloir : deux liens ne se superposent plus. Survolez un lien ou une case pour le mettre en avant, au-dessus des autres cases.' });
        Studio.extend('v11Index', (_v12lnIdx) => function () { const items = _v12lnIdx.apply(this, arguments); try { if (Array.isArray(items)) items.push({ grp: 'Actions', ic: '⌐', label: v12LinesOn() ? 'Graphes : liens courbes (tracé d\'origine)' : 'Graphes : liens à angles droits, un couloir par lien', sub: 'lineage, carte des flux, modèle', key: 'graphe liens droits courbes couloir superposer', go: () => v12LinesSet(!v12LinesOn()) }); } catch (e) {} return items; });
