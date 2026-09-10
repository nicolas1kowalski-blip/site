        // ---- Analyse d'impact (l'écran Cas d'usage a fusionné dans Applis & processus en v3.7) ----
        function populateImpactCols() { const tn = el('impactTable').value; const t = tableByName(tn); el('impactCol').innerHTML = '<option value="">Toute la table</option>' + (t ? t.headers.map(h => `<option>${escapeHTML(h)}</option>`).join('') : ''); }

        // Analyse d'impact : processus touchés directement, via le lineage (tables dérivées en aval),
        // ou via les relations du modèle de données (tables jointes sur cette colonne/table).
        function computeImpact(tableName, colName) {
            const g = state.governance;
            const PROCS = (g.assets || []).filter(a => a.kind === 'process');
            const ucTouches = (uc, tn, cn) => cn
                ? (uc.columns || []).some(c => c.table === tn && c.col === cn)
                : ((uc.tables || []).includes(tn) || (uc.columns || []).some(c => c.table === tn));
            const direct = PROCS.filter(uc => ucTouches(uc, tableName, colName));
            // Aval du lineage : les tables dérivées construites (directement ou en cascade) depuis cette table.
            const downstream = new Set(); const queue = [tableName];
            while (queue.length) {
                const cur = queue.shift();
                Object.keys(g.lineage).forEach(derived => {
                    if ((g.lineage[derived].from || []).includes(cur) && !downstream.has(derived)) { downstream.add(derived); queue.push(derived); }
                });
            }
            const viaLineage = PROCS.filter(uc => !direct.includes(uc) && Array.from(downstream).some(dn => ucTouches(uc, dn, null)));
            // Tables reliées via le modèle de données (si colonne fournie : uniquement les relations passant par cette colonne).
            const related = new Set();
            state.relations.forEach(r => {
                const sN = state.tables[r.sourceTable] ? state.tables[r.sourceTable].name : null;
                const tN = state.tables[r.targetTable] ? state.tables[r.targetTable].name : null;
                if (!sN || !tN || !r.sourceCol || !r.targetCol) return;
                if (sN === tableName && (!colName || r.sourceCol === colName)) related.add(tN);
                if (tN === tableName && (!colName || r.targetCol === colName)) related.add(sN);
            });
            related.delete(tableName);
            const viaRelations = PROCS.filter(uc => !direct.includes(uc) && !viaLineage.includes(uc) && Array.from(related).some(rn => ucTouches(uc, rn, null)));
            return { direct, viaLineage, viaRelations, downstream: Array.from(downstream), related: Array.from(related) };
        }
        function runImpactAnalysis() {
            const tn = el('impactTable').value; if (!tn) return showError('Sélectionnez une table à analyser.');
            const cn = el('impactCol').value || null;
            const r = computeImpact(tn, cn);
            const order = c => CRITICALITY_OPTS.indexOf(c || 'Faible');
            const block = (title, list, how) => {
                if (!list.length) return '';
                const items = list.slice().sort((a, b) => order(b.criticality) - order(a.criticality)).map(uc =>
                    `<div class="flex items-center gap-2 bg-white border border-slate-200 rounded-lg p-2.5 mb-1.5"><span class="text-[10px] uppercase font-bold px-2 py-0.5 rounded ${CRIT_COLORS[uc.criticality] || CRIT_COLORS['Faible']}">${uc.criticality || 'Faible'}</span><span class="text-sm font-bold text-slate-800">${escapeHTML(uc.name)}</span><span class="text-xs text-slate-400">${escapeHTML(uc.owner || '')}</span><span class="text-[10px] text-slate-400 ml-auto italic">${how}</span></div>`).join('');
                return `<div class="mb-3"><div class="text-xs font-bold text-slate-600 mb-1.5">${title}</div>${items}</div>`;
            };
            const total = r.direct.length + r.viaLineage.length + r.viaRelations.length;
            let html = total === 0
                ? '<p class="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-3">Aucun processus déclaré n\'utilise cette donnée. Reliez des tables/colonnes à vos processus ci-dessous pour fiabiliser l\'analyse.</p>'
                : `<p class="text-sm font-bold text-slate-700 mb-3">${total} processus potentiellement impacté(s) par un problème sur <span class="text-indigo-700">${escapeHTML(tn)}${cn ? '.' + escapeHTML(cn) : ''}</span> :</p>`
                    + block('⚙️ Impact direct (utilise cette donnée)', r.direct, 'direct')
                    + block('🕸️ Via le lineage (extractions alimentées : ' + r.downstream.map(escapeHTML).join(', ') + ')', r.viaLineage, 'lineage')
                    + block('🔗 Via les relations du modèle de données (tables jointes : ' + r.related.map(escapeHTML).join(', ') + ')', r.viaRelations, 'relation');
            // Applications touchées (via sources produites, objets consommés, processus outillés)
            const assets = state.governance.assets || [];
            if (assets.length) {
                const impactedTables = [tn, ...(r.downstream || []), ...(r.related || [])];
                const hits = new Map();
                impactedTables.forEach(n => { const sys = String((state.governance.dictionary[n] || {}).sourceSystem || '').trim().toLowerCase(); if (!sys) return; const a = assets.find(x => x.kind === 'app' && String(x.name).trim().toLowerCase() === sys); if (a && !hits.has(a.id)) hits.set(a.id, 'produit la source ' + n); });
                (state.governance.businessObjects || []).forEach(bo => {
                    if (!(bo.sources || []).some(s2 => impactedTables.includes(s2.table))) return;
                    [...(bo.consumedBy || []), ...(bo.producedBy || [])].forEach(id => { const a = assetById(id); if (a && !hits.has(a.id)) hits.set(a.id, ((bo.consumedBy || []).includes(id) ? 'consomme' : 'produit') + ' l\'objet ' + bo.name); });
                });
                [...(r.direct || []), ...(r.viaLineage || []), ...(r.viaRelations || [])].forEach(pr => (pr.appIds || []).forEach(id => { const a = assetById(id); if (a && !hits.has(a.id)) hits.set(a.id, 'outille le processus ' + pr.name); }));
                if (hits.size) {
                    html += `<div class="mt-3"><div class="text-xs font-bold text-slate-600 mb-1.5">🖥 Applications touchées (${hits.size})</div>
                        ${[...hits].map(([id, why]) => { const a = assetById(id); return `<div class="flex items-center gap-2 bg-white border border-slate-200 rounded-lg p-2.5 mb-1.5"><span class="text-[10px] uppercase font-bold px-2 py-0.5 rounded ${CRIT_COLORS[a.criticality] || CRIT_COLORS['Faible']}">${a.criticality || 'Moyenne'}</span><span class="text-sm font-bold text-slate-800">${escapeHTML(assetLabel(a))}</span><span class="text-xs text-slate-400">${escapeHTML(a.owner || '')}</span><span class="text-[10px] text-slate-400 ml-auto italic">${escapeHTML(why)}</span></div>`; }).join('')}</div>`;
                }
            }
            html += renderModelImpactPanel();
            el('impactResult').innerHTML = html;
        }

        // ---- Vue Lineage (moteur SVG) ----
        function renderLineageGraph() {
            const wrap = el('lineageGraphWrap'); if (!wrap) return;
            if (govState.lineageView === 'attr') {
                try { renderAttrFlow(wrap); } catch (e) { console.error('Vue par attribut', e); wrap.innerHTML = graphUnavailableHtml('Vue par attribut impossible : ' + escapeHTML(e.message)); }
                return;
            }
            try { _renderLineageImpl(wrap); }
            catch (e) { console.error('Lineage render error', e); wrap.innerHTML = graphUnavailableHtml('Le lineage n\'a pas pu être affiché : ' + escapeHTML(e.message)); return; }
            observeGraphResize('lineage');
        }
