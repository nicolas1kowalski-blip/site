        // ======================= E9 (V2) : ANALYSE D'IMPACT SUR LE MODÈLE =======================
        // Depuis une table (et éventuellement une colonne) : tous les objets AVAL qui en dépendent.
        function modelImpact(tn, col) {
            const out = [];
            const usesCol = (v) => !col || String(v || '') === col;
            const txtHasCol = (txt) => !col || new RegExp('\\[' + col.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\]').test(String(txt || ''));
            // Tables conçues (sources contributrices, mappings, jointures, formules)
            Object.values(state.tables).forEach(t => {
                if (t.type !== 'designed' || !t.design) return;
                const d = t.design;
                const hits = [];
                (d.sources || []).forEach(sr => { if (sr.src === tn) { if (!col || Object.values(sr.map || {}).includes(col) || (sr.filters || []).some(f => f.col === col)) hits.push('source'); } });
                (d.joins || []).forEach(j => { if ((j.src === tn && usesCol(j.srcKey)) || (j.viaSrc === tn && (!col || j.viaIn === col || j.viaOut === col || j.vCol === col || j.vStart === col || j.vEnd === col))) hits.push('enrichissement'); });
                (d.fks || []).forEach(fk => { if (fk.table === tn && usesCol(fk.col)) hits.push('clé étrangère'); });
                if (hits.length) out.push({ type: '🧱 Table conçue', name: t.name, how: [...new Set(hits)].join(', ') });
            });
            // Recettes
            (state.recipes || []).forEach(r => {
                if (r.src !== tn) return;
                if (!col) { out.push({ type: '🧹 Préparation', name: r.name + ' → ' + r.out, how: 'source de la préparation' }); return; }
                const st = (r.steps || []).find(st2 => { const P = st2.p || {}; return P.col === col || String(P.keys || '').split(';').map(x => x.trim()).includes(col) || String(P.cols || '').split(';').map(x => x.trim()).includes(col) || txtHasCol(P.formula); });
                if (st) out.push({ type: '🧹 Préparation', name: r.name + ' → ' + r.out, how: 'étape ' + (RC_STEPS[st.type] || st.type) });
            });
            // Règles de qualité
            (state.governance.qualityRules || []).forEach(r => {
                if (r.table === tn && (usesCol(r.col) || (!col ? false : (String((r.p || {}).cols || '').split(';').map(x => x.trim()).includes(col) || String((r.p || {}).thenCol || '') === col || txtHasCol((r.p || {}).formula))))) out.push({ type: '📏 Règle qualité', name: r.name, how: QR_TYPES[r.type] || r.type });
                if ((r.p || {}).refTable === tn && usesCol((r.p || {}).refCol)) out.push({ type: '📏 Règle qualité', name: r.name, how: 'table de référence (FK)' });
            });
            // Tableaux de bord
            (state.dashboards || []).forEach(d => (d.tiles || []).forEach(t => {
                if (t.table === tn && (!col || t.dim === col || t.aggCol === col)) out.push({ type: '📋 Tableau de bord', name: d.name + ' · ' + t.title, how: t.dim === col ? 'axe' : (t.aggCol === col ? 'agrégat' : 'table de la tuile') });
            }));
            // Relations du modèle
            state.relations.forEach(rl => {
                const sN = state.tables[rl.sourceTable] ? state.tables[rl.sourceTable].name : null;
                const tN = state.tables[rl.targetTable] ? state.tables[rl.targetTable].name : null;
                if ((sN === tn && usesCol(rl.sourceCol)) || (tN === tn && usesCol(rl.targetCol))) out.push({ type: '🔗 Lien du modèle', name: `${sN} → ${tN}`, how: `${rl.sourceCol} = ${rl.targetCol}` });
            });
            // Objets métier (mappings, sources, facettes)
            (state.governance.businessObjects || []).forEach(bo => {
                const hits = [];
                (bo.sources || []).forEach(sr => { if (sr.table === tn && (!col || (sr.filters || []).some(f => f.col === col))) hits.push('source ' + (sr.role || '')); });
                (bo.elements || []).forEach(e2 => (e2.mappings || []).forEach(m => { if (m.table === tn && usesCol(m.col)) hits.push('attribut ' + e2.name); }));
                getBoFacets(bo).forEach(st => { if (st.table === tn && (!col || (st.elements || []).some(fe => fe.col === col) || (st.scope || []).some(sc => sc.col === col))) hits.push('facette ' + st.name); });
                if (hits.length) out.push({ type: '🏛️ Objet métier', name: bo.name, how: [...new Set(hits)].slice(0, 3).join(', ') });
            });
            // Lineage déclaré (tables alimentées)
            Object.entries(state.governance.lineage || {}).forEach(([derived, v]) => { if ((v.from || []).includes(tn) && !col) out.push({ type: '🕸️ Alimente', name: derived, how: 'lineage' }); });
            // Processus (tables et colonnes critiques déclarées)
            (state.governance.assets || []).forEach(a2 => { const hitCol = (a2.columns || []).some(c2 => c2.table === tn && usesCol(c2.col));
                if (hitCol || (!col && (a2.tables || []).includes(tn))) out.push({ type: a2.kind === 'process' ? '⚙️ Processus' : '🖥 Application', name: a2.name, how: hitCol ? 'colonne critique' : 'table utilisée' }); });
            return out;
        }
        function renderModelImpactPanel() {
            const tn = el('impactTable') ? el('impactTable').value : ''; if (!tn) return '';
            const cn = el('impactCol') ? (el('impactCol').value || null) : null;
            const deps = modelImpact(tn, cn);
            return `<div class="mt-3"><div class="text-xs font-bold text-slate-600 mb-1.5">🧩 Objets techniques dépendants (${deps.length}) — « que casse-t-on en aval ? »</div>
                ${deps.length ? deps.map(d => `<div class="flex items-center gap-2 bg-white border border-slate-200 rounded-lg p-2 mb-1 text-xs"><span class="font-bold text-slate-500 w-36">${d.type}</span><strong>${escapeHTML(d.name)}</strong><span class="text-slate-400 ml-auto italic">${escapeHTML(d.how)}</span></div>`).join('')
                : '<p class="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-2.5">Aucun objet technique ne dépend de ' + escapeHTML(tn) + (cn ? '.' + escapeHTML(cn) : '') + ' — modification sans risque connu.</p>'}</div>`;
        }

