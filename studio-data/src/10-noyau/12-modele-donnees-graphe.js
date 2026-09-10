        // ==========================================
        //  RENDU DES GRAPHES : moteur SVG maison
        // ==========================================
        // Un seul type de nœud personnalisé, réutilisé par le graphe MCD (étape 2) et l'Explorateur 360°
        // (étape 5) : un titre en gras, et éventuellement une ligne de contenu en dessous.
        // Taille (largeur, hauteur) d'une carte UML — MÊME formule que le dessin, pour que le layout
        // connaisse la hauteur réelle (surtout en vue schéma) et n'empile jamais les cartes.
        function umlNodeSize(title, rows) {
            rows = rows || [];
            title = title || '';
            const maxLen = Math.max(String(title).length + 2, 12, ...rows.map(r => String(r).length));
            const w = Math.min(280, Math.max(150, maxLen * 6.4 + 28));
            const headH = 28,
                rowH = 15;
            const h = headH + (rows.length ? rows.length * rowH + 12 : 10);
            return [w, h];
        }

        // Fabrique de graphe unifiée : layouts déterministes qui se figent (plus de simulation
        // continue qui « se rebat » quand on déplace une boîte), déplacement fluide via delegate
        // (on ne redessine pas le nœud riche à chaque frame) et animations coupées pour la réactivité.
        // Déplacement FLUIDE : le nœud suit directement le curseur (pas de fantôme) et surtout
        // updateEdge=false → les liens ne sont PAS recalculés à chaque frame (cause n°1 des
        // saccades) ; ils se replacent au lâcher. drag-combo : déplacer un domaine déplace toutes
        // ses tables d'un bloc.
        // Fige la position d'un nœud après déplacement pour qu'aucun layout ne le repousse.
        let _mcdLastDrag = 0;
        function pinNodeOnDrag(graph) {
            if (!graph) return;
            graph.on('node:dragend', e => {
                _mcdLastDrag = Date.now();
                const item = e.item;
                if (!item) return;
                const m = item.getModel();
                try {
                    graph.updateItem(item, { fx: m.x, fy: m.y });
                } catch (e2) {} // gForce respecte fx/fy
            });
            // Après déplacement d'un domaine (combo), on rafraîchit les liens (updateEdge=false pendant
            // le drag) et on fige la nouvelle position de chaque table qu'il contient.
            graph.on('combo:dragend', e => {
                const combo = e.item;
                if (!combo) return;
                (graph.getComboChildren ? graph.getComboChildren(combo).nodes || [] : []).forEach(n => {
                    const m = n.getModel();
                    graph.updateItem(n, { fx: m.x, fy: m.y });
                });
                graph.refreshPositions();
            });
        }
        // Disposition « couloirs par domaine », calculée en JS : chaque domaine occupe son propre
        // bloc (grille de tables), les blocs sont disposés en grille avec de larges marges → AUCUN
        // chevauchement possible. Renvoie true si des positions ont été posées.
        function computeDomainPositions(nodes) {
            if (!nodes.length) return false;
            const groups = {};
            nodes.forEach(n => {
                const table = state.tables[n.id];
                const dom = ((table && table.theme) || '').trim() || '(sans domaine)';
                (groups[dom] = groups[dom] || []).push(n);
            });
            const domains = Object.keys(groups).sort();
            const GAP_X = 70,
                GAP_Y = 80,
                DOMAIN_GAP = 160;
            const blocks = domains.map(dom => {
                const group = groups[dom];
                const cols = Math.max(1, Math.ceil(Math.sqrt(group.length)));
                const rows = Math.ceil(group.length / cols);
                const maxW = Math.max(160, ...group.map(n => (n.size ? n.size[0] : 180)));
                const maxH = Math.max(60, ...group.map(n => (n.size ? n.size[1] : 80)));
                return {
                    dom,
                    ns: group,
                    cols,
                    rows,
                    maxW,
                    maxH,
                    w: cols * maxW + (cols - 1) * GAP_X,
                    h: rows * maxH + (rows - 1) * GAP_Y
                };
            });
            const perRow = Math.max(1, Math.round(Math.sqrt(blocks.length)));
            let curX = 0,
                curY = 0,
                rowMaxH = 0;
            blocks.forEach((blk, i) => {
                if (i > 0 && i % perRow === 0) {
                    curX = 0;
                    curY += rowMaxH + DOMAIN_GAP;
                    rowMaxH = 0;
                }
                blk.ns.forEach((n, k) => {
                    const r = Math.floor(k / blk.cols),
                        c = k % blk.cols;
                    n.x = curX + c * (blk.maxW + GAP_X) + blk.maxW / 2;
                    n.y = curY + r * (blk.maxH + GAP_Y) + blk.maxH / 2;
                });
                curX += blk.w + DOMAIN_GAP;
                rowMaxH = Math.max(rowMaxH, blk.h);
            });
            return true;
        }
        // Boîte à outils commune des graphes (zoom / recentrage) — les instances par nom.
        function graphInstanceOf(which) {
            return { mcd: networkInstance, lineage: lineageGraph, model: modelGraph, exp: expNetInstance }[which];
        }
        function graphZoom(which, f) {
            if (which === 'mcd' && mcdIsSvg()) {
                const svg = el('mcdSvg');
                if (!svg) return;
                const rect = svg.getBoundingClientRect(),
                    mx = rect.width / 2,
                    my = rect.height / 2,
                    maximum = Math.max(0.15, Math.min(3, svgG.k * f));
                svgG.tx = mx - (mx - svgG.tx) * (maximum / svgG.k);
                svgG.ty = my - (my - svgG.ty) * (maximum / svgG.k);
                svgG.k = maximum;
                svgApplyTransform();
                return;
            }
            const g = graphInstanceOf(which);
            if (g) g.zoom(f, { x: g.getWidth() / 2, y: g.getHeight() / 2 });
        }
        function graphFit(which) {
            if (which === 'mcd' && mcdIsSvg()) {
                svgFitAll();
                return;
            }
            const g = graphInstanceOf(which);
            if (g) g.fitView(20);
        }
        function graphToolbarHtml(which) {
            return `<span class="inline-flex gap-1" data-ro="keep">
                <button onclick="graphZoom('${which}', 1.25)" class="text-[11px] bg-white border border-slate-300 w-6 h-6 rounded font-black text-slate-600 hover:bg-slate-100" title="Zoom avant">+</button>
                <button onclick="graphZoom('${which}', 0.8)" class="text-[11px] bg-white border border-slate-300 w-6 h-6 rounded font-black text-slate-600 hover:bg-slate-100" title="Zoom arrière">−</button>
                <button onclick="graphFit('${which}')" class="text-[11px] bg-white border border-slate-300 px-2 h-6 rounded font-bold text-slate-600 hover:bg-slate-100" title="Recentrer">⤢</button>
            </span>`;
        }
        // Vue du modèle : 'links' = cartes compactes (7 colonnes max) · 'schema' = schéma complet
        // (toutes les colonnes, formats 🎛 et clés) — façon schéma de base de données.
        function setMcdView(v) {
            state.graphConfig.mcdView = v;
            if (networkInstance) {
                networkInstance.destroy();
                networkInstance = null;
            }
            renderGraph();
            persistAppState();
        }
        // Périmètre du modèle : 'sources' = fichiers/API/extractions · 'designed' = tables conçues
        // (+ les tables qu'elles référencent directement) · 'all' = ensemble. Deux modèles séparés,
        // mêmes fonctions (tracer/supprimer des liens, vues, domaines, plein écran).
        function mcdScope() {
            return state.graphConfig.mcdScope || 'sources';
        }
        function setMcdScope(v) {
            state.graphConfig.mcdScope = v;
            if (networkInstance) {
                networkInstance.destroy();
                networkInstance = null;
            }
            renderGraph();
            try {
                renderRelationsList();
            } catch (e) {}
            persistAppState();
        }
        // Tables visibles dans le périmètre courant du modèle.
        function mcdVisibleIds() {
            const sc = mcdScope();
            const all = Object.values(state.tables);
            let ids;
            if (sc === 'all') ids = new Set(all.map(t => t.id));
            else if (sc === 'designed') {
                ids = new Set(all.filter(t => t.type === 'designed').map(t => t.id));
                // + les tables directement référencées par un lien touchant une table conçue
                state.relations.forEach(r => {
                    if (ids.has(r.sourceTable) && state.tables[r.targetTable]) ids.add(r.targetTable);
                    else if (ids.has(r.targetTable) && state.tables[r.sourceTable]) ids.add(r.sourceTable);
                });
            } else ids = new Set(all.filter(t => t.type !== 'designed').map(t => t.id));
            // ② Tables masquées manuellement : toujours retirées.
            const hidden = new Set(state.graphConfig.mcdHidden || []);
            if (hidden.size) ids = new Set([...ids].filter(id => !hidden.has(id)));
            // Filtre par domaine : n'afficher qu'un seul domaine — SAUF en mode Focus (on garde tout
            // et on estompe les autres après le rendu).
            const th = (state.graphConfig.mcdTheme || '').trim();
            if (th && !state.graphConfig.mcdFocus)
                ids = new Set([...ids].filter(id => (state.tables[id].theme || '').trim() === th));
            return ids;
        }
        function setMcdTheme(v) {
            state.graphConfig.mcdTheme = v || '';
            if (networkInstance) {
                networkInstance.destroy();
                networkInstance = null;
            }
            renderGraph();
            try {
                renderRelationsList();
            } catch (e) {}
            persistAppState();
        }
        function mcdThemeFilterHtml() {
            const themes = themeList();
            const cur = (state.graphConfig.mcdTheme || '').trim();
            const hidden = state.graphConfig.mcdHidden || [];
            let html = '';
            if (themes.length) {
                html += `<select onchange="setMcdTheme(this.value)" title="N'afficher qu'un seul domaine pour simplifier la lecture" class="text-[11px] border border-slate-300 rounded px-1.5 py-1 bg-white font-bold ${cur ? 'text-indigo-700 border-indigo-300' : 'text-slate-600'}">
                    <option value="">🎨 Tous les domaines</option>
                    ${themes.map(t => `<option value="${escapeHTML(t)}" ${t === cur ? 'selected' : ''}>🗂 ${escapeHTML(t)}</option>`).join('')}
                </select>`;
                // ① Focus : estomper les autres domaines au lieu de les masquer.
                if (cur)
                    html += `<button onclick="mcdToggleFocus()" class="text-[11px] px-2 py-1 rounded font-bold border ${state.graphConfig.mcdFocus ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-300'}" title="Focus : garder les autres domaines en gris translucide au lieu de les masquer">🔆 Focus</button>`;
            }
            // ④ Ranger proprement (relance la disposition).
            html += `<button onclick="mcdRelayout()" class="text-[11px] px-2 py-1 rounded font-bold bg-white text-slate-600 border border-slate-300 hover:bg-slate-50" title="Réaligner automatiquement toutes les tables">🧹 Ranger</button>`;
            // 🔍 Aller à une table + 🧭 chemin entre deux tables
            const names = Object.values(state.tables)
                .filter(t => t.status === 'ready')
                .map(t => t.name)
                .sort();
            html += `<input list="mcdGotoList" placeholder="🔍 aller à une table…" onchange="mcdGotoTable(this.value); this.value=''" class="text-[11px] border border-slate-300 rounded px-2 py-1 w-36 bg-white"><datalist id="mcdGotoList">${names.map(n => `<option value="${escapeHTML(n)}">`).join('')}</datalist>`;
            html += `<button onclick="mcdTogglePathMode()" class="text-[11px] px-2 py-1 rounded font-bold border ${mcdPathMode ? 'bg-cyan-600 text-white border-cyan-600' : 'bg-white text-cyan-700 border-cyan-300'}" title="Surligner la chaîne de jointures entre deux tables">🧭 Chemin</button>`;
            // ② Tables masquées : bouton pour tout réafficher.
            if (hidden.length)
                html += `<button onclick="mcdUnhideAll()" class="text-[11px] px-2 py-1 rounded font-bold bg-amber-50 text-amber-700 border border-amber-300" title="Réafficher les tables masquées">👁 Réafficher (${hidden.length})</button>`;
            return html;
        }
        function mcdToggleFocus() {
            state.graphConfig.mcdFocus = !state.graphConfig.mcdFocus;
            if (networkInstance) {
                networkInstance.destroy();
                networkInstance = null;
            }
            renderGraph();
            persistAppState();
        }
        // ④ Ranger : recalcule proprement la disposition (positions figées effacées).
        function mcdRelayout() {
            if (typeof svgG !== 'undefined') {
                svgG.pos = {};
                svgG.needFit = true;
            }
            if (networkInstance) {
                try {
                    networkInstance.destroy();
                } catch (e) {}
                networkInstance = null;
            }
            renderGraph();
            persistAppState();
        }
        function mcdIsSvg() {
            return true;
        } // le Modèle de données est rendu par le moteur SVG maison
        // ② Masquer / réafficher des tables du graphe.
        function mcdHideTable(id) {
            const h = (state.graphConfig.mcdHidden = state.graphConfig.mcdHidden || []);
            if (!h.includes(id)) h.push(id);
            if (networkInstance) {
                networkInstance.destroy();
                networkInstance = null;
            }
            renderGraph();
            try {
                renderRelationsList();
            } catch (e) {}
            persistAppState();
        }
        function mcdUnhideAll() {
            state.graphConfig.mcdHidden = [];
            if (networkInstance) {
                networkInstance.destroy();
                networkInstance = null;
            }
            renderGraph();
            try {
                renderRelationsList();
            } catch (e) {}
            persistAppState();
        }
        // ⑤ Surligne une table et ses voisines directes ; le reste est estompé.
        let mcdHighlightId = null;
        function mcdScopeButtonsHtml() {
            const sc = mcdScope();
            const btn = (v, lbl, title) =>
                `<button onclick="setMcdScope('${v}')" data-scope="${v}" title="${title}" class="mcdScopeBtn text-[11px] px-2.5 py-1 font-bold ${sc === v ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}">${lbl}</button>`;
            return `<span class="inline-flex rounded-lg overflow-hidden border border-slate-300 divide-x divide-slate-300">${btn('sources', '📥 Sources', 'Modèle des fichiers sources uniquement')}${btn('designed', '🧱 Tables', "Modèle des tables conçues (et des tables qu'elles référencent)")}${btn('all', '🌐 Ensemble', 'Tout le modèle, sources et tables mélangées')}</span>`;
        }

        // ======================= Domaines de sources (groupes) =======================
        // Un domaine regroupe des sources (initialisé par le nom du dossier surveillé, modifiable).
        // Dans le graphe : zones (combos) + couleurs par domaine.
        const THEME_PALETTE = [
            { head: '#e0e7ff', title: '#312e81', stroke: '#6366f1', zone: '#6366f1' },
            { head: '#d1fae5', title: '#065f46', stroke: '#059669', zone: '#059669' },
            { head: '#fef3c7', title: '#92400e', stroke: '#d97706', zone: '#d97706' },
            { head: '#fce7f3', title: '#9d174d', stroke: '#db2777', zone: '#db2777' },
            { head: '#cffafe', title: '#155e75', stroke: '#0891b2', zone: '#0891b2' },
            { head: '#ede9fe', title: '#5b21b6', stroke: '#7c3aed', zone: '#7c3aed' },
            { head: '#ecfccb', title: '#3f6212', stroke: '#65a30d', zone: '#65a30d' },
            { head: '#ffedd5', title: '#9a3412', stroke: '#ea580c', zone: '#ea580c' }
        ];
        function themeList() {
            return [
                ...new Set(
                    Object.values(state.tables)
                        .map(t => (t.theme || '').trim())
                        .filter(Boolean)
                )
            ].sort();
        }
        function themePalette(theme) {
            const i = themeList().indexOf(theme);
            return i >= 0 ? THEME_PALETTE[i % THEME_PALETTE.length] : null;
        }
        function updateTableTheme(tId, v) {
            const table = state.tables[tId];
            if (!table) return;
            table.theme = String(v || '').trim();
            persistAppState();
            renderTables();
            if (networkInstance) {
                networkInstance.destroy();
                networkInstance = null;
            }
            if (
                !el('step-2').classList.contains('hidden') ||
                (el('mcdFullOverlay') && !el('mcdFullOverlay').classList.contains('hidden'))
            )
                renderGraph();
        }

        // ======================= Suppression graphique d'un lien =======================
        function openEdgeDeleteModal(relId) {
            const relation = state.relations.find(x => x.id === relId);
            if (!relation) return;
            const A = state.tables[relation.sourceTable],
                B = state.tables[relation.targetTable];
            if (!A || !B) return;
            let mcdEdgeModalElement = el('mcdEdgeModal');
            if (!mcdEdgeModalElement) {
                mcdEdgeModalElement = document.createElement('div');
                mcdEdgeModalElement.id = 'mcdEdgeModal';
                mcdEdgeModalElement.className = 'fixed inset-0 z-[60] hidden items-center justify-center bg-slate-900/60 p-4';
                mcdEdgeModalElement.addEventListener('click', e => {
                    if (e.target === mcdEdgeModalElement) {
                        mcdEdgeModalElement.classList.add('hidden');
                        mcdEdgeModalElement.classList.remove('flex');
                    }
                });
                document.body.appendChild(mcdEdgeModalElement);
            }
            mcdEdgeModalElement.innerHTML = `<div class="bg-white rounded-xl shadow-2xl w-full max-w-md p-6" onclick="event.stopPropagation()">
                <h3 class="font-black text-slate-800 text-sm mb-1">🔗 Lien sélectionné</h3>
                <p class="text-sm text-slate-600 mb-4"><strong>${escapeHTML(A.name)}</strong>.<span class="font-mono">${escapeHTML(relation.sourceCol)}</span> → <strong>${escapeHTML(B.name)}</strong>.<span class="font-mono">${escapeHTML(relation.targetCol)}</span>${relation.cardinality ? ` <span class="text-slate-400">(${escapeHTML(relation.cardinality)})</span>` : ''}</p>
                <div class="flex gap-2 justify-end">
                    <button onclick="el('mcdEdgeModal').classList.add('hidden'); el('mcdEdgeModal').classList.remove('flex')" class="text-sm bg-white border border-slate-300 text-slate-600 font-bold px-4 py-2 rounded-lg hover:bg-slate-50">Annuler</button>
                    <button onclick="deleteRelationById('${relId}')" class="text-sm bg-red-600 hover:bg-red-700 text-white font-bold px-5 py-2 rounded-lg shadow">🗑 Supprimer le lien</button>
                </div>
            </div>`;
            mcdEdgeModalElement.classList.remove('hidden');
            mcdEdgeModalElement.classList.add('flex');
        }
        function deleteRelationById(relId) {
            state.relations = state.relations.filter(r => r.id !== relId);
            const mcdEdgeModalElement = el('mcdEdgeModal');
            if (mcdEdgeModalElement) {
                mcdEdgeModalElement.classList.add('hidden');
                mcdEdgeModalElement.classList.remove('flex');
            }
            persistAppState();
            try {
                renderRelationsList();
            } catch (e) {}
            renderGraph();
            showSuccess('🗑 Lien supprimé.');
        }

        // ======================= Création graphique des liens =======================
        // Mode « Tracer un lien » : clic sur une 1re table, clic sur une 2e → fenêtre qui demande
        // les attributs (pré-remplis par rapprochement de noms). Le mode reste actif pour enchaîner.
        let mcdLinkMode = false,
            mcdLinkSrc = null,
            mcdDragSrc = null;
        const mcdJustDropped = 0; // jamais réarmé : conservé pour le garde-fou du clic résiduel
        function mcdLinkHint(html) {
            document.querySelectorAll('.mcdLinkHint').forEach(h => {
                h.classList.toggle('hidden', !html);
                h.innerHTML = html || '';
            });
        }
        function mcdToggleLinkMode() {
            mcdLinkMode = !mcdLinkMode;
            mcdLinkSrc = null;
            mcdDragSrc = null;
            document.querySelectorAll('.mcdLinkBtn').forEach(b => {
                b.classList.toggle('bg-indigo-600', mcdLinkMode);
                b.classList.toggle('text-white', mcdLinkMode);
                b.classList.toggle('bg-white', !mcdLinkMode);
                b.classList.toggle('text-indigo-700', !mcdLinkMode);
            });
            mcdLinkHint(
                mcdLinkMode
                    ? "🖱 Mode lien actif — cliquez une <strong>première</strong> table puis une <strong>seconde</strong> : la fenêtre des attributs s'ouvre. Recliquez le bouton pour quitter."
                    : ''
            );
        }
        function mcdNodeClicked(tId) {
            if (!mcdLinkMode || !state.tables[tId]) return;
            if (Date.now() - mcdJustDropped < 400) return; // clic résiduel après un glisser-déposer
            if (!mcdLinkSrc) {
                mcdLinkSrc = tId;
                mcdLinkHint(
                    `1️⃣ <strong>${escapeHTML(state.tables[tId].name)}</strong> sélectionnée — cliquez maintenant la <strong>seconde</strong> table (la même table = lien hiérarchique parent/enfant).`
                );
                return;
            }
            const a = mcdLinkSrc;
            mcdLinkSrc = null;
            openLinkModal(a, tId);
        }
        // --- Glisser-déposer : un trait pointillé suit la souris depuis la table de départ. ---
        function openLinkModal(aId, bId) {
            const A = state.tables[aId],
                B = state.tables[bId];
            if (!A || !B) return;
            let mcdLinkModalElement = el('mcdLinkModal');
            if (!mcdLinkModalElement) {
                mcdLinkModalElement = document.createElement('div');
                mcdLinkModalElement.id = 'mcdLinkModal';
                mcdLinkModalElement.className = 'fixed inset-0 z-[60] hidden items-center justify-center bg-slate-900/60 p-4';
                mcdLinkModalElement.addEventListener('click', e => {
                    if (e.target === mcdLinkModalElement) closeLinkModal();
                });
                document.body.appendChild(mcdLinkModalElement);
            }
            // Pré-sélection : meilleure paire de colonnes au nom identique (normalisé).
            let preA = '',
                preB = '';
            outer: for (const header of A.headers)
                for (const hb of B.headers) {
                    if (normColName(header) === normColName(hb) && normColName(header)) {
                        preA = header;
                        preB = hb;
                        break outer;
                    }
                }
            mcdLinkModalElement.innerHTML = `<div class="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6" onclick="event.stopPropagation()">
                <h3 class="font-black text-slate-800 text-sm mb-1">🔗 Nouveau lien</h3>
                <p class="text-xs text-slate-500 mb-4"><strong>${escapeHTML(A.name)}</strong> → <strong>${escapeHTML(B.name)}</strong>${aId === bId ? ' <span class="text-emerald-700 font-bold">(auto-relation : hiérarchie parent/enfant)</span>' : ''}</p>
                <div class="grid grid-cols-2 gap-3 mb-4">
                    <div><label class="text-[10px] uppercase font-bold text-slate-400 block mb-1">${escapeHTML(A.name)} — attribut</label>
                        <select id="mcdLinkColA" class="w-full border border-slate-300 rounded-lg p-2 text-sm bg-white">${A.headers.map(h => `<option ${h === preA ? 'selected' : ''}>${escapeHTML(h)}</option>`).join('')}</select></div>
                    <div><label class="text-[10px] uppercase font-bold text-slate-400 block mb-1">${escapeHTML(B.name)} — attribut</label>
                        <select id="mcdLinkColB" class="w-full border border-slate-300 rounded-lg p-2 text-sm bg-white">${B.headers.map(h => `<option ${h === preB ? 'selected' : ''}>${escapeHTML(h)}</option>`).join('')}</select></div>
                </div>
                ${preA ? `<p class="text-[11px] text-emerald-700 mb-3">✨ Colonnes pré-sélectionnées par rapprochement de noms — vérifiez avant de créer.</p>` : ''}
                <div class="flex gap-2 justify-end">
                    <button onclick="closeLinkModal()" class="text-sm bg-white border border-slate-300 text-slate-600 font-bold px-4 py-2 rounded-lg hover:bg-slate-50">Annuler</button>
                    <button onclick="confirmLinkModal('${aId}','${bId}')" class="text-sm bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-5 py-2 rounded-lg shadow">Créer le lien</button>
                </div>
            </div>`;
            mcdLinkModalElement.classList.remove('hidden');
            mcdLinkModalElement.classList.add('flex');
        }
        function closeLinkModal() {
            const mcdLinkModalElement = el('mcdLinkModal');
            if (mcdLinkModalElement) {
                mcdLinkModalElement.classList.add('hidden');
                mcdLinkModalElement.classList.remove('flex');
            }
            if (mcdLinkMode)
                mcdLinkHint(
                    '🖱 Mode lien actif — cliquez la <strong>première</strong> table du prochain lien (ou recliquez le bouton pour quitter).'
                );
        }
        function confirmLinkModal(aId, bId) {
            const colA = el('mcdLinkColA').value,
                colB = el('mcdLinkColB').value;
            if (!colA || !colB) return;
            const dup = state.relations.some(
                r =>
                    (r.sourceTable === aId && r.sourceCol === colA && r.targetTable === bId && r.targetCol === colB) ||
                    (r.sourceTable === bId && r.sourceCol === colB && r.targetTable === aId && r.targetCol === colA)
            );
            if (dup) {
                closeLinkModal();
                return showError('Ce lien existe déjà.');
            }
            state.relations.push({
                id: 'rel_' + generateId(),
                sourceTable: aId,
                sourceCol: colA,
                targetTable: bId,
                targetCol: colB,
                cardinality: '',
                kind: ''
            });
            persistAppState();
            closeLinkModal();
            try {
                renderRelationsList();
            } catch (e) {}
            renderGraph();
            showSuccess(`🔗 Lien créé : ${state.tables[aId].name}.${colA} → ${state.tables[bId].name}.${colB}`);
        }

        // ======================= Plein écran du modèle =======================
        // Le conteneur du graphe est DÉPLACÉ dans une surcouche plein écran (même instance de graphe,
        // redimensionnée par le ResizeObserver), puis remis à sa place à la fermeture.
        function toggleMcdFullscreen() {
            const networkGraphElement = el('networkGraph');
            if (!networkGraphElement) return;
            let mcdFullOverlayElement = el('mcdFullOverlay');
            if (!mcdFullOverlayElement) {
                mcdFullOverlayElement = document.createElement('div');
                mcdFullOverlayElement.id = 'mcdFullOverlay';
                mcdFullOverlayElement.className = 'fixed inset-0 z-50 hidden flex-col bg-white';
                mcdFullOverlayElement.innerHTML = `<div class="flex items-center gap-2 px-4 py-2.5 border-b border-slate-200 bg-slate-50 flex-wrap">
                        <span class="font-black text-sm text-slate-700 mr-2">🗺 Modèle de données — plein écran</span>
                        <span class="mcdScopeWrap"></span>
                        <button onclick="mcdToggleLinkMode()" class="mcdLinkBtn text-[11px] bg-white border border-indigo-300 px-2.5 py-1 rounded font-bold text-indigo-700 hover:bg-indigo-50">🖱 Tracer un lien</button>
                        <select id="mcdViewSelectFull" onchange="setMcdView(this.value)" class="text-[11px] border border-slate-300 rounded px-1.5 py-1 bg-white font-bold text-slate-600"><option value="links">🗂 Vue compacte</option><option value="schema">🗺 Schéma complet</option></select>
                        <button onclick="exportGraphImage('mcd')" class="text-[11px] bg-white border border-slate-300 px-2.5 py-1 rounded font-bold text-slate-600 hover:bg-slate-100">📷 Image</button>
                        <button onclick="openRelInfer()" class="text-[11px] bg-white border border-slate-300 px-2.5 py-1 rounded font-bold text-slate-600 hover:bg-slate-100">🪄 Déduire les liens</button>
                        <button onclick="toggleMcdFullscreen()" class="ml-auto text-sm font-black text-slate-500 hover:text-red-600 px-2" title="Fermer (Échap)">✕ Fermer</button>
                    </div>
                    <div class="mcdLinkHint hidden text-xs font-bold text-indigo-800 bg-indigo-50 border-b border-indigo-200 px-4 py-2"></div>
                    <div class="mcdScopeMsg hidden text-xs text-slate-500 bg-blue-50/60 border-b border-blue-100 px-4 py-2"></div>
                    <div id="mcdFullBody" class="flex-1 relative overflow-hidden"></div>`;
                document.body.appendChild(mcdFullOverlayElement);
                document.addEventListener('keydown', e => {
                    if (e.key === 'Escape' && mcdFullOverlayElement && !mcdFullOverlayElement.classList.contains('hidden'))
                        toggleMcdFullscreen();
                });
            }
            if (mcdFullOverlayElement.classList.contains('hidden')) {
                window._mcdGraphHome = networkGraphElement.parentElement;
                const mcdViewSelectFullElement = el('mcdViewSelectFull');
                if (mcdViewSelectFullElement)
                    mcdViewSelectFullElement.value = state.graphConfig.mcdView === 'schema' ? 'schema' : 'links';
                mcdFullOverlayElement.classList.remove('hidden');
                mcdFullOverlayElement.classList.add('flex');
                el('mcdFullBody').appendChild(networkGraphElement);
                networkGraphElement.style.height = '100%';
                requestAnimationFrame(() => reflowGraph('mcd'));
            } else {
                mcdFullOverlayElement.classList.add('hidden');
                mcdFullOverlayElement.classList.remove('flex');
                if (window._mcdGraphHome) window._mcdGraphHome.appendChild(networkGraphElement);
                networkGraphElement.style.height = '';
                requestAnimationFrame(() => reflowGraph('mcd'));
            }
        }
        // --- Robustesse des graphes : dimensionnement fiable + repli visible ---
        // Bug classique d'un graphe dans une appli à onglets : un rendu dans un conteneur masqué
        // (0×0) s'affiche minuscule ou décalé. On recale la taille sur le conteneur réel dès qu'il
        // devient visible, et on suit les redimensionnements via ResizeObserver.
        const GRAPH_CONTAINER = {
            mcd: 'networkGraph',
            model: 'modelGraphWrap',
            lineage: 'lineageGraphWrap',
            exp: 'expGraphContainer'
        };
        const _graphObs = {};
        const _graphReflowT = {};
        function reflowGraph(which) {
            if (which === 'mcd') {
                try {
                    svgFitAll();
                } catch (e) {}
                return;
            } // le MCD est en SVG : re-cadrage
            const g = graphInstanceOf(which);
            const cont = el(GRAPH_CONTAINER[which]);
            if (!g || !cont) return;
            try {
                if (g.get && g.get('destroyed')) return;
            } catch (e) {
                return;
            }
            const w = cont.clientWidth,
                h = cont.clientHeight;
            if (w > 4 && h > 4) {
                try {
                    g.changeSize(w, h);
                    g.fitView(20);
                } catch (e) {}
            }
        }
        function observeGraphResize(which) {
            if (typeof ResizeObserver === 'undefined') return;
            const cont = el(GRAPH_CONTAINER[which]);
            if (!cont) return;
            if (_graphObs[which]) {
                try {
                    _graphObs[which].disconnect();
                } catch (e) {}
            }
            const ro = new ResizeObserver(() => {
                clearTimeout(_graphReflowT[which]);
                _graphReflowT[which] = setTimeout(() => reflowGraph(which), 120);
            });
            ro.observe(cont);
            _graphObs[which] = ro;
        }
        function graphUnavailableHtml(msg) {
            return `<div class="w-full h-full flex items-center justify-center text-center p-6"><div><div class="text-3xl mb-2 opacity-40">🕸️</div><p class="text-sm text-slate-500 font-medium">${msg}</p>
                </div>
                </div>`;
        }

        // Indicateur de tâche d'arrière-plan : pastille flottante pendant qu'un audit tourne — vous
        // pouvez naviguer dans les autres onglets, le moteur travaille dans son worker.
        function bgTaskStart(label) {
            let pill = el('bgTaskPill');
            if (!pill) {
                pill = document.createElement('div');
                pill.id = 'bgTaskPill';
                pill.className =
                    'fixed bottom-4 left-4 z-40 bg-indigo-600 text-white text-xs font-bold px-3 py-2 rounded-full shadow-lg flex items-center gap-2';
                document.body.appendChild(pill);
            }
            pill.innerHTML = `<span class="inline-block w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin"></span> ${escapeHTML(label)} <span class="font-normal opacity-75">— vous pouvez continuer à travailler</span>`;
            pill.classList.remove('hidden');
        }
        function bgTaskEnd(doneMsg) {
            const pill = el('bgTaskPill');
            if (pill) pill.classList.add('hidden');
            if (doneMsg) showSuccess(doneMsg);
        }

        function showError(msg) {
            el('globalErrorText').textContent = msg;
            el('globalError').classList.remove('hidden');
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
        function hideError() {
            el('globalError').classList.add('hidden');
        }
        function showSuccess(msg) {
            const toastContainerElement = el('toastContainer');
            if (!toastContainerElement) return;
            const divElement = document.createElement('div');
            divElement.className =
                'bg-emerald-100 border border-emerald-300 text-emerald-800 px-4 py-3 rounded shadow flex items-center gap-3 transition-opacity duration-500';
            divElement.innerHTML = `<i data-lucide="check-circle" class="w-5 h-5 text-emerald-600"></i><span class="text-sm font-medium"></span>`;
            divElement.querySelector('span').textContent = msg; // data éventuellement piégée (nom de colonne…) : jamais interprétée en HTML
            toastContainerElement.appendChild(divElement);
            lucide.createIcons({ root: divElement });
            setTimeout(() => {
                divElement.classList.add('opacity-0');
                setTimeout(() => divElement.remove(), 500);
            }, 4000);
        }

        document.addEventListener('DOMContentLoaded', () => {
            lucide.createIcons();
        });
