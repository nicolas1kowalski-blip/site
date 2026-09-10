        // ======================= V3 UX : préservation du scroll et du focus =======================
        (function () {
            const KEEP = ['renderGovernance', 'renderTables', 'renderTablesDesign', 'renderQualityRules', 'renderRecipes', 'renderSrcWatch', 'renderLineageFlow',
                'renderDashboards', 'renderLinkage', 'renderRelationsList', 'renderSourceUpdatePanel', 'renderNlAssistant',
                'renderAdvExtract'];
            // Identité stable d'un panneau dépliable entre deux rendus : son id, sinon le texte de son
            // résumé DÉBARRASSÉ des compteurs (« (11 nœud(s), 10 lien(s)) » change à chaque suppression).
            const DET_SEL = 'main details, .drawer-ux details';
            const detKey = d => { if (d.id) return '#' + d.id; const s = d.querySelector('summary'); return s ? s.textContent.replace(/\d+/g, '').replace(/\s+/g, ' ').trim() : ''; };
            const wrap = fn => function (...a) {
                const win = { x: window.scrollX, y: window.scrollY };
                // Panneaux OUVERTS avant le rendu : on ne réouvre que ceux-là (jamais on ne referme,
                // pour ne pas contrarier un panneau que l'écran ouvre volontairement, ex. mode édition).
                const dets = []; let dord = 0;
                document.querySelectorAll(DET_SEL).forEach(d => { const o2 = dord++; if (d.open) dets.push({ key: detKey(d), ord: o2 }); });
                const scrolled = []; let ord = 0;
                document.querySelectorAll('main *, .drawer-ux *').forEach(e2 => {
                    const sc = (e2.scrollHeight > e2.clientHeight + 2) || (e2.scrollWidth > e2.clientWidth + 2);
                    if (!sc) return; const o2 = ord++;
                    if (e2.scrollTop || e2.scrollLeft) scrolled.push({ id: e2.id || null, ord: o2, t: e2.scrollTop, l: e2.scrollLeft });
                });
                const ae = document.activeElement;
                const focusId = ae && ae.id && (ae.tagName === 'INPUT' || ae.tagName === 'SELECT' || ae.tagName === 'TEXTAREA') ? ae.id : null;
                const selStart = ae && typeof ae.selectionStart === 'number' ? ae.selectionStart : null;
                const out = fn.apply(this, a);
                const restore = () => {
                    // 1. Panneaux dépliés : on les rouvre AVANT de replacer le scroll (la hauteur de la
                    //    page en dépend — c'est la fermeture d'un panneau qui faisait « remonter » l'écran).
                    if (dets.length) {
                        const now = []; document.querySelectorAll(DET_SEL).forEach(d => now.push(d));
                        const taken = new Set();
                        dets.forEach(s2 => {
                            let e2 = s2.key ? now.find((d, i) => !taken.has(i) && detKey(d) === s2.key) : null;
                            if (!e2 && now[s2.ord] && !taken.has(s2.ord)) e2 = now[s2.ord];
                            if (!e2) return; taken.add(now.indexOf(e2));
                            if (!e2.open) e2.open = true;
                        });
                    }
                    window.scrollTo(win.x, win.y);
                    if (scrolled.length) {
                        // ré-indexe les zones défilables dans le même ordre : les zones sans id
                        // (matrices, listes) retrouvent leur position par leur rang.
                        const cand = []; document.querySelectorAll('main *, .drawer-ux *').forEach(e2 => {
                            if ((e2.scrollHeight > e2.clientHeight + 2) || (e2.scrollWidth > e2.clientWidth + 2)) cand.push(e2); });
                        scrolled.forEach(s2 => { const e2 = (s2.id && el(s2.id)) || cand[s2.ord]; if (e2) { e2.scrollTop = s2.t; e2.scrollLeft = s2.l; } });
                    }
                    if (focusId) { const e2 = el(focusId); if (e2 && document.activeElement !== e2 && e2.focus) { try { e2.focus({ preventScroll: true }); if (selStart != null && e2.setSelectionRange) e2.setSelectionRange(selStart, selStart); } catch (er) {} } }
                };
                // Deux frames : la seconde rattrape les contenus qui changent la hauteur après coup
                // (graphe SVG du lineage, tableaux larges) sans jamais contrarier un défilement utilisateur.
                restore(); requestAnimationFrame(() => { restore(); requestAnimationFrame(restore); });
                return out;
            };
            Studio.extendAll(KEEP.filter(nm => typeof window[nm] === 'function' && !window[nm].__keepScroll), base => { const w = wrap(base); w.__keepScroll = true; return w; }, { motif: 'conserver le défilement et le focus pendant un rendu' });
        })();
