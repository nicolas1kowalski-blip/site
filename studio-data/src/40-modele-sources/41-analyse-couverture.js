        // ======================= Analyse de couverture (3 tables) =======================
        // Population (table 1 filtrée) × dimension (attribut 1-1) × présence d'éléments liés
        // (table N filtrée) → histogramme empilé « avec / sans » + tableau + exports.
        const covFilters = { base: [], rel: [] };
        let covChartInst = null;
        function covNeighbors(bId) {
            const ids = new Set();
            state.relations.forEach(r => {
                if (!r.sourceCol || !r.targetCol) return;
                if (r.sourceTable === bId && state.tables[r.targetTable]) ids.add(r.targetTable);
                if (r.targetTable === bId && state.tables[r.sourceTable]) ids.add(r.sourceTable);
            });
            return [...ids].filter(id => state.tables[id].status === 'ready');
        }
        function covPopulate() {
            const bs = el('covBase'); if (!bs) return;
            const ready = Object.values(state.tables).filter(t => t.status === 'ready');
            const cur = bs.value;
            bs.innerHTML = '<option value="">— table de base —</option>' + ready.map(t => `<option value="${t.id}" ${t.id === cur ? 'selected' : ''}>${escapeHTML(t.name)}</option>`).join('');
            covBaseChanged(true);
        }
        function covBaseChanged(keep) {
            if (!keep) { covFilters.base = []; covFilters.rel = []; }
            const bId = el('covBase').value;
            const dt = el('covDimTable'), rs = el('covRel');
            if (!bId) { dt.innerHTML = ''; rs.innerHTML = ''; el('covDimCol').innerHTML = ''; covRenderFilters('base'); covRenderFilters('rel'); return; }
            const nb = covNeighbors(bId);
            const curD = dt.value, curR = rs.value;
            dt.innerHTML = `<option value="${bId}">${escapeHTML(state.tables[bId].name)} (elle-même)</option>` + nb.map(id => `<option value="${id}" ${id === curD ? 'selected' : ''}>${escapeHTML(state.tables[id].name)}</option>`).join('');
            rs.innerHTML = (nb.length ? '' : '<option value="">— aucune table liée dans le modèle —</option>') + nb.map(id => `<option value="${id}" ${id === curR ? 'selected' : ''}>${escapeHTML(state.tables[id].name)}</option>`).join('');
            const d2 = el('covDim2Table');
            if (d2) { const cur2 = d2.value; d2.innerHTML = `<option value="">— aucune —</option><option value="${bId}" ${cur2 === bId ? 'selected' : ''}>${escapeHTML(state.tables[bId].name)}</option>` + nb.map(id => `<option value="${id}" ${id === cur2 ? 'selected' : ''}>${escapeHTML(state.tables[id].name)}</option>`).join(''); covDim2TableChanged(); }
            const d3 = el('covDim3Table');
            if (d3) { const cur3 = d3.value; d3.innerHTML = `<option value="">— aucune —</option><option value="${bId}" ${cur3 === bId ? 'selected' : ''}>${escapeHTML(state.tables[bId].name)}</option>` + nb.map(id => `<option value="${id}" ${id === cur3 ? 'selected' : ''}>${escapeHTML(state.tables[id].name)}</option>`).join(''); covDim3TableChanged(); }
            covDimTableChanged(); covRenderFilters('base'); covRenderFilters('rel');
        }
        function covDimColOptions(tId, cur) {
            if (!tId || !state.tables[tId]) return '';
            const hs = state.tables[tId].headers;
            let html = hs.map(h => `<option value="${escapeHTML(h)}" ${h === cur ? 'selected' : ''}>${escapeHTML(h)}</option>`).join('');
            // Colonnes date : axe/dimension par ANNÉE (regroupement automatique).
            const dts = hs.filter(h => covColIsDate(tId, h));
            if (dts.length) html += dts.map(h => { const v = '__annee__|' + h; return `<option value="${escapeHTML(v)}" ${v === cur ? 'selected' : ''}>📅 Année de ${escapeHTML(h)}</option>`; }).join('');
            return html;
        }
        function covDimTableChanged() {
            const tId = el('covDimTable').value; const dc = el('covDimCol');
            dc.innerHTML = covDimColOptions(tId, dc.value);
        }
        function covDim2TableChanged() {
            const tId = el('covDim2Table') ? el('covDim2Table').value : ''; const dc = el('covDim2Col'); if (!dc) return;
            dc.innerHTML = tId ? covDimColOptions(tId, dc.value) : '<option value="">—</option>';
        }
        function covDim3TableChanged() {
            const tId = el('covDim3Table') ? el('covDim3Table').value : ''; const dc = el('covDim3Col'); if (!dc) return;
            dc.innerHTML = tId ? covDimColOptions(tId, dc.value) : '<option value="">—</option>';
        }
        function covRelChanged() { covFilters.rel = []; covRenderFilters('rel'); }
        function covScopeTable(scope) { return scope === 'base' ? el('covBase').value : el('covRel').value; }
        function covAddFilter(scope) { covFilters[scope].push({ col: '', op: 'eq', val: '', conn: scope === 'rel' ? 'OR' : 'AND' }); covRenderFilters(scope); }
        function covSetFilter(scope, i, f, v) { if (covFilters[scope][i]) { covFilters[scope][i][f] = v; if (f === 'op' || f === 'col') covRenderFilters(scope); } }
        function covDelFilter(scope, i) { covFilters[scope].splice(i, 1); covRenderFilters(scope); }
        // Colonne « date » : au nom (date/début/fin/échéance…) ou aux valeurs détectées en cache.
        function covColIsDate(tId, col) {
            if (/date|debut|début|_fin$|^fin_|echean|échéan|_dt$|^dt_/i.test(String(col))) return true;
            try { const vals = tdValueCache[(tId || '') + '|' + col]; if (vals && vals.length) { const d = vals.slice(0, 8).filter(v => /^\d{4}-\d{2}-\d{2}/.test(v) || /^\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{4}/.test(v)); return d.length >= Math.ceil(Math.min(vals.length, 8) / 2); } } catch (e) {}
            return false;
        }
        function covRenderFilters(scope) {
            const box = el('covFilterRows-' + scope); if (!box) return;
            const tId = covScopeTable(scope); const headers = (tId && state.tables[tId]) ? state.tables[tId].headers : [];
            const rows = covFilters[scope];
            if (!rows.length) { box.innerHTML = '<p class="text-[10px] text-slate-400 italic">Aucun filtre.</p>'; return; }
            box.innerHTML = rows.map((c, i) => {
                const conn = i === 0 ? '<span class="text-[10px] font-bold text-slate-400 w-9 text-center shrink-0">Où</span>'
                    : `<select onchange="covSetFilter('${scope}',${i},'conn',this.value)" class="w-9 shrink-0 border rounded text-[10px] font-bold px-0.5 py-1 bg-white ${c.conn === 'OR' ? 'text-amber-700 border-amber-300' : 'text-indigo-700 border-indigo-300'}"><option value="AND" ${c.conn !== 'OR' ? 'selected' : ''}>ET</option><option value="OR" ${c.conn === 'OR' ? 'selected' : ''}>OU</option></select>`;
                const needVal = !['empty', 'nempty'].includes(c.op);
                return `<div class="flex items-center gap-1">
                    ${conn}
                    <select onchange="covSetFilter('${scope}',${i},'col',this.value)" class="flex-1 min-w-0 border border-slate-300 rounded px-1 py-1 text-[11px] bg-white"><option value="">— col —</option>${headers.map(h => `<option value="${escapeHTML(h)}" ${c.col === h ? 'selected' : ''}>${escapeHTML(h)}</option>`).join('')}</select>
                    <select onchange="covSetFilter('${scope}',${i},'op',this.value)" class="shrink-0 border border-slate-300 rounded px-0.5 py-1 text-[11px] bg-white">${QUAL_FILTER_OPS.map(o => `<option value="${o.v}" ${o.v === c.op ? 'selected' : ''}>${o.t}</option>`).join('')}</select>
                    ${covColIsDate(tId, c.col) && !['contains', 'ncontains', 'starts', 'ends'].includes(c.op)
                        ? `<input type="date" value="${escapeHTML(c.val || '')}" onchange="covSetFilter('${scope}',${i},'val',this.value)" class="w-32 shrink-0 border border-slate-300 rounded px-1 py-0.5 text-[11px] ${needVal ? '' : 'invisible'}" title="Choix par calendrier (colonne de type date).">`
                        : `<input type="text" list="covfval-${scope}-${i}" value="${escapeHTML(c.val || '')}" oninput="covSetFilter('${scope}',${i},'val',this.value)" placeholder="val." class="w-24 shrink-0 border border-slate-300 rounded px-1 py-1 text-[11px] ${needVal ? '' : 'invisible'}" title="Les valeurs présentes dans la table sont proposées ; vous pouvez aussi saisir une autre valeur.">`}
                    <datalist id="covfval-${scope}-${i}"></datalist>
                    <button onclick="covDelFilter('${scope}',${i})" class="shrink-0 text-slate-300 hover:text-red-500 text-xs font-bold">✕</button>
                </div>`;
            }).join('');
            // Valeurs détectées proposées dans chaque champ valeur (comme les autres filtres de l'app).
            if (tId && state.tables[tId]) rows.forEach((c, i) => { if (c.col && !covColIsDate(tId, c.col)) tdFillDatalist(`covfval-${scope}-${i}`, state.tables[tId].name, c.col); });
        }
        function covWhere(scope) {
            const valid = covFilters[scope].filter(c => c.col && c.op && (['empty', 'nempty'].includes(c.op) || String(c.val || '').length));
            let sql = '';
            valid.forEach(c => { const f = qualCondSql(c); if (!f) return; sql = sql ? `(${sql}) ${c.conn === 'OR' ? 'OR' : 'AND'} ${f}` : f; });
            return sql;
        }
        function covRelBetween(x, y) { return state.relations.find(r => r.sourceCol && r.targetCol && ((r.sourceTable === x && r.targetTable === y) || (r.sourceTable === y && r.targetTable === x))); }
        async function runCoverageAnalysis(btn) {
            hideError();
            const bId = el('covBase').value, dT = el('covDimTable').value, dC = el('covDimCol').value, rId = el('covRel').value;
            const d2T = el('covDim2Table') ? el('covDim2Table').value : '', d2C = el('covDim2Col') ? el('covDim2Col').value : '';
            const dim2On = !!(d2T && d2C);
            const d3T = el('covDim3Table') ? el('covDim3Table').value : '', d3C = el('covDim3Col') ? el('covDim3Col').value : '';
            const dim3On = !!(d3T && d3C);
            if (!bId) return showError('Choisissez la table de base (population).');
            if (!dT || !dC) return showError('Choisissez la dimension d\'analyse.');
            if (!rId) return showError('Choisissez la table des éléments liés (elle doit être reliée à la base dans le Modèle de données).');
            const rr = covRelBetween(bId, rId);
            if (!rr) return showError(`Aucun lien du modèle entre "${state.tables[bId].name}" et "${state.tables[rId].name}" — créez-le dans le Modèle de données.`);
            let rd = null;
            if (dT !== bId) { rd = covRelBetween(bId, dT); if (!rd) return showError(`Aucun lien du modèle entre "${state.tables[bId].name}" et "${state.tables[dT].name}".`); }
            let rd2 = null;
            if (dim2On && d2T !== bId && d2T !== dT) { rd2 = covRelBetween(bId, d2T); if (!rd2) return showError(`Aucun lien du modèle entre "${state.tables[bId].name}" et "${state.tables[d2T].name}" (dimension 2).`); }
            let rd3 = null;
            if (dim3On && d3T !== bId && d3T !== dT && !(dim2On && d3T === d2T)) { rd3 = covRelBetween(bId, d3T); if (!rd3) return showError(`Aucun lien du modèle entre "${state.tables[bId].name}" et "${state.tables[d3T].name}" (dimension 3).`); }
            if (btn) btn.disabled = true;
            bgTaskStart('Analyse de couverture en cours');
            try {
                const { conn } = await getDB();
                const norm = e => `NULLIF(UPPER(TRIM(CAST(${e} AS VARCHAR))), '')`;
                const Tb = sqlIdent(duckTableName(bId)), Tr = sqlIdent(duckTableName(rId));
                const bKey = rr.sourceTable === bId ? rr.sourceCol : rr.targetCol;
                const rKey = rr.sourceTable === bId ? rr.targetCol : rr.sourceCol;
                const fb = covWhere('base'), fr = covWhere('rel');
                // Jointure de dimension 1-1 (dédoublonnée) : construite au besoin pour l'axe et la dim 2.
                const dimJoin = (rel, alias) => {
                    const bCol = rel.sourceTable === bId ? rel.sourceCol : rel.targetCol;
                    const dCol = rel.sourceTable === bId ? rel.targetCol : rel.sourceCol;
                    const dTid = rel.sourceTable === bId ? rel.targetTable : rel.sourceTable;
                    const Td = sqlIdent(duckTableName(dTid));
                    // Si la table de dimension EST la table des éléments liés, ses filtres s'appliquent
                    // aussi à la jointure de dimension (sinon la dimension affichait des valeurs
                    // provenant de lignes exclues par les filtres).
                    const fd = (dTid === rId && fr) ? ` WHERE ${fr}` : '';
                    return `LEFT JOIN (SELECT * FROM ${Td}${fd} QUALIFY row_number() OVER (PARTITION BY ${norm(sqlIdent(dCol))} ORDER BY __rn) = 1) ${alias} ON ${norm('b.' + sqlIdent(bCol))} = ${norm(alias + '.' + sqlIdent(dCol))}`;
                };
                const dimExpr = (alias, col) => {
                    if (String(col).startsWith('__annee__|')) {
                        const c2 = String(col).slice(10);
                        const raw2 = `CAST(${alias}.${sqlIdent(c2)} AS VARCHAR)`;
                        // Année robuste : formats date normalisés, PUIS timestamp (avec heure),
                        // PUIS extraction d'une année 19xx/20xx — les dates avec heure donnaient (vide).
                        return `COALESCE(CAST(YEAR(TRY_CAST(${tdNormExpr('date', raw2)} AS DATE)) AS VARCHAR), CAST(YEAR(TRY_CAST(${raw2} AS TIMESTAMP)) AS VARCHAR), NULLIF(regexp_extract(TRIM(${raw2}), '((?:19|20)\\d\\d)', 1), ''), '(vide)')`;
                    }
                    return `COALESCE(NULLIF(TRIM(CAST(${alias}.${sqlIdent(col)} AS VARCHAR)), ''), '(vide)')`;
                };
                const joins = [];
                const dimSel = rd ? (joins.push(dimJoin(rd, 'd')), dimExpr('d', dC)) : dimExpr('b', dC);
                let dim2Sel = null;
                if (dim2On) {
                    if (d2T === bId) dim2Sel = dimExpr('b', d2C);
                    else if (d2T === dT && rd) dim2Sel = dimExpr('d', d2C);
                    else { joins.push(dimJoin(rd2, 'd2')); dim2Sel = dimExpr('d2', d2C); }
                }
                let dim3Sel = null;
                if (dim3On) {
                    if (d3T === bId) dim3Sel = dimExpr('b', d3C);
                    else if (d3T === dT && rd) dim3Sel = dimExpr('d', d3C);
                    else if (dim2On && d3T === d2T && rd2) dim3Sel = dimExpr('d2', d3C);
                    else { joins.push(dimJoin(rd3, 'd3')); dim3Sel = dimExpr('d3', d3C); }
                }
                const dJoin = joins.join('\n');
                const withSql = `WITH b AS (SELECT * FROM ${Tb}${fb ? ' WHERE ' + fb : ''}),
                    e AS (SELECT DISTINCT ${norm(sqlIdent(rKey))} AS k FROM ${Tr} WHERE ${norm(sqlIdent(rKey))} IS NOT NULL${fr ? ' AND (' + fr + ')' : ''})`;
                const hasCond = `${norm('b.' + sqlIdent(bKey))} IN (SELECT k FROM e)`;
                // Comparaison à la TOTALITÉ (sans les filtres de population) : mêmes dimensions,
                // même table, aucun filtre — pour visualiser ce que les filtres écartent.
                const compareTotal = !!(el('covCompareTotal') && el('covCompareTotal').checked);
                let totMap = null;
                if (compareTotal) {
                    const selT = `${dimSel} AS dim${dim2Sel ? `, ${dim2Sel} AS dim2` : ''}${dim3Sel ? `, ${dim3Sel} AS dim3` : ''}`;
                    const grpT = ['1', dim2Sel ? '2' : null, dim3Sel ? (dim2Sel ? '3' : '2') : null].filter(Boolean).join(', ');
                    const resT = await conn.query(`WITH b AS (SELECT * FROM ${Tb})
                        SELECT ${selT}, COUNT(*)::BIGINT AS total FROM b ${dJoin} GROUP BY ${grpT} LIMIT 20000`);
                    totMap = new Map();
                    arrowResultToObjects(resT).forEach(r => totMap.set((dim3Sel ? String(r.dim3) : '') + '' + (dim2Sel ? String(r.dim2) : '') + '' + String(r.dim), Number(r.total)));
                }
                const grpCols = ['1', dim2Sel ? '2' : null, dim3Sel ? (dim2Sel ? '3' : '2') : null].filter(Boolean).join(', ');
                const res = await conn.query(`${withSql}
                    SELECT ${dimSel} AS dim${dim2Sel ? `, ${dim2Sel} AS dim2` : ''}${dim3Sel ? `, ${dim3Sel} AS dim3` : ''}, COUNT(*)::BIGINT AS total, SUM(CASE WHEN ${hasCond} THEN 1 ELSE 0 END)::BIGINT AS avec
                    FROM b ${dJoin} GROUP BY ${grpCols} ORDER BY ${String(dC).startsWith('__annee__|') ? '1 ASC' : 'total DESC'} LIMIT ${dim3Sel ? 2000 : (dim2Sel ? 400 : 40)}`);
                const rows = arrowResultToObjects(res).map(r => ({ dim: String(r.dim), dim2: dim2Sel ? String(r.dim2) : null, dim3: dim3Sel ? String(r.dim3) : null, total: Number(r.total), avec: Number(r.avec), sans: Number(r.total) - Number(r.avec) }));
                if (!rows.length) { bgTaskEnd(); showError('Population vide avec ces filtres.'); return; }
                const gT = rows.reduce((a, r) => a + r.total, 0), gA = rows.reduce((a, r) => a + r.avec, 0);
                el('covResult').classList.remove('hidden');
                el('covSummary').innerHTML = `<div class="flex flex-wrap gap-3 text-sm">
                    <span class="bg-slate-100 rounded-lg px-3 py-1.5 font-bold text-slate-700">Population : ${gT.toLocaleString('fr-FR')}</span>
                    <span class="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5 font-bold text-emerald-700">✔ Avec élément(s) : ${gA.toLocaleString('fr-FR')} (${(gA / gT * 100).toFixed(1)} %)</span>
                    <span class="bg-red-50 border border-red-200 rounded-lg px-3 py-1.5 font-bold text-red-700">✖ Sans : ${(gT - gA).toLocaleString('fr-FR')} (${((gT - gA) / gT * 100).toFixed(1)} %)</span>
                </div>`;
                // Histogramme : empilé simple (1 dim), groupé par dim 2, et FACETTES par dim 3
                // (un graphique par valeur de la dimension 3).
                try {
                    if (covChartInst) { covChartInst.destroy(); covChartInst = null; }
                    (window.covFacetCharts || []).forEach(ch => { try { ch.destroy(); } catch (e2) {} }); window.covFacetCharts = [];
                    const oldFac = el('covFacets'); if (oldFac) oldFac.remove();
                    const chartWrap = el('covChart').parentElement;
                    // Construit {labels, datasets} pour un sous-ensemble de lignes (partagé facettes / global).
                    const buildChartData = (subset, facetVal) => {
                        const totOf = (d2v, d1v) => totMap ? (totMap.get((facetVal || '') + '' + (d2v || '') + '' + d1v) || 0) : 0;
                        if (!dim2Sel) { const labels2 = subset.map(r => r.dim); const ds = [
                            { label: '✔ Avec', data: subset.map(r => r.avec), backgroundColor: '#10b981', stack: 's' },
                            { label: '✖ Sans', data: subset.map(r => r.sans), backgroundColor: '#ef4444', stack: 's' }];
                            // Segment gris AU SOMMET de la barre : ce que les filtres écartent (totalité - filtré).
                            if (totMap) ds.push({ label: '⬜ Écarté par les filtres', data: subset.map(r => Math.max(0, totOf('', r.dim) - r.total)), backgroundColor: '#cbd5e1', stack: 's' });
                            return { labels: labels2, datasets: ds }; }
                        const totBy = (arr, key) => { const m = new Map(); arr.forEach(r => m.set(r[key], (m.get(r[key]) || 0) + r.total)); return m; };
                        const d1Top = [...totBy(subset, 'dim')].sort((a, b2) => String(dC).startsWith('__annee__|') ? (a[0] < b2[0] ? -1 : 1) : b2[1] - a[1]).slice(0, 15).map(x => x[0]);
                        const d2Top = [...totBy(subset, 'dim2')].sort((a, b2) => b2[1] - a[1]).slice(0, 5).map(x => x[0]);
                        const d2Of = r => d2Top.includes(r.dim2) ? r.dim2 : '(autres)';
                        const d2Vals = [...new Set(subset.map(d2Of))];
                        const cell = {};
                        subset.forEach(r => { if (!d1Top.includes(r.dim)) return; const k = r.dim + '' + d2Of(r); cell[k] = cell[k] || { avec: 0, sans: 0, tot: 0 }; cell[k].avec += r.avec; cell[k].sans += r.sans; cell[k].tot += totOf(r.dim2, r.dim); });
                        const datasets = [];
                        d2Vals.forEach((v, i) => {
                            const col = THEME_PALETTE[i % THEME_PALETTE.length].zone;
                            datasets.push({ label: `${v} ✔`, data: d1Top.map(d1 => (cell[d1 + '' + v] || {}).avec || 0), backgroundColor: col, stack: v });
                            datasets.push({ label: `${v} ✖`, data: d1Top.map(d1 => (cell[d1 + '' + v] || {}).sans || 0), backgroundColor: col + '55', stack: v });
                            // Reste écarté par les filtres, empilé au sommet de la barre de CE croisement.
                            if (totMap) datasets.push({ label: `${v} ⬜`, data: d1Top.map(d1 => { const c2 = cell[d1 + '' + v]; return c2 ? Math.max(0, c2.tot - c2.avec - c2.sans) : 0; }), backgroundColor: '#cbd5e1', stack: v });
                        });
                        return { labels: d1Top, datasets };
                    };
                    const mkChart = (canvas, data, title) => new Chart(canvas.getContext('2d'), {
                        type: 'bar', data,
                        options: { responsive: true, maintainAspectRatio: false,
                            scales: { x: { stacked: true, ticks: { autoSkip: false, maxRotation: 60, font: { size: 9 } } }, y: { stacked: true, beginAtZero: true } },
                            plugins: { legend: { position: 'top', labels: { boxWidth: 10, font: { size: 9 } } }, title: title ? { display: true, text: title, font: { size: 12, weight: 'bold' } } : undefined } },
                    });
                    if (!dim3Sel) {
                        el('covChart').style.display = '';
                        covChartInst = mkChart(el('covChart'), buildChartData(rows, ''), null);
                    } else {
                        // FACETTES : top 6 valeurs de la dim 3 (les plus peuplées), le reste en (autres).
                        el('covChart').style.display = 'none';
                        const totBy3 = new Map(); rows.forEach(r => totBy3.set(r.dim3, (totBy3.get(r.dim3) || 0) + r.total));
                        const d3Top = [...totBy3].sort((a, b2) => b2[1] - a[1]).slice(0, 6).map(x => x[0]);
                        const d3Of = r => d3Top.includes(r.dim3) ? r.dim3 : '(autres)';
                        const d3Vals = [...new Set(rows.map(d3Of))];
                        const fac = document.createElement('div');
                        fac.id = 'covFacets';
                        fac.className = 'grid grid-cols-1 md:grid-cols-2 gap-4';
                        chartWrap.appendChild(fac);
                        d3Vals.forEach(v3 => {
                            const subset = rows.filter(r => d3Of(r) === v3);
                            const tot = subset.reduce((a2, r) => a2 + r.total, 0);
                            const card = document.createElement('div');
                            card.className = 'border border-slate-200 rounded-lg p-2 bg-white';
                            card.innerHTML = `<div class="h-[240px] relative"></div>`;
                            const cv = document.createElement('canvas');
                            card.firstChild.appendChild(cv);
                            fac.appendChild(card);
                            window.covFacetCharts.push(mkChart(cv, buildChartData(subset, v3), `${v3} — ${tot.toLocaleString('fr-FR')} entité(s)`));
                        });
                    }
                } catch (eC) { console.warn('Graphique indisponible :', eC); }
                // Tableau + consultation/export des lignes
                qualInspectRegistry = qualInspectRegistry || [];
                const rowsSql = neg => `${withSql} SELECT ${dimSel} AS "Axe d'analyse"${dim2Sel ? `, ${dim2Sel} AS "Dimension 2"` : ''}${dim3Sel ? `, ${dim3Sel} AS "Dimension 3"` : ''}, b.* EXCLUDE (__rn) FROM b ${dJoin} WHERE ${neg ? 'NOT (' + hasCond + ')' : hasCond}`;
                const iA = registerQualInspect('Entités AVEC élément(s) lié(s)', rowsSql(false));
                const iS = registerQualInspect('Entités SANS élément lié', rowsSql(true));
                el('covTable').innerHTML = `<div class="border border-slate-200 rounded-lg overflow-x-auto max-h-[420px] overflow-y-auto"><table class="w-full text-left text-xs">
                    <thead class="bg-slate-50 text-[10px] uppercase font-bold text-slate-500 sticky top-0"><tr><th class="p-2">${escapeHTML(dC)}</th>${dim2Sel ? `<th class="p-2">${escapeHTML(d2C)}</th>` : ''}${dim3Sel ? `<th class="p-2">${escapeHTML(d3C)}</th>` : ''}<th class="p-2 text-right">Population</th>${totMap ? '<th class="p-2 text-right">Totalité (sans filtres)</th>' : ''}<th class="p-2 text-right">✔ Avec</th><th class="p-2 text-right">✖ Sans</th><th class="p-2 text-right">Couverture</th></tr></thead>
                    <tbody class="divide-y divide-slate-100">${rows.map(r => `<tr class="hover:bg-teal-50/40"><td class="p-2 font-bold">${escapeHTML(r.dim)}</td>${dim2Sel ? `<td class="p-2">${escapeHTML(r.dim2)}</td>` : ''}${dim3Sel ? `<td class="p-2">${escapeHTML(r.dim3)}</td>` : ''}<td class="p-2 text-right">${r.total.toLocaleString('fr-FR')}</td>${totMap ? `<td class="p-2 text-right text-slate-500">${(totMap.get((r.dim3 || '') + '' + (r.dim2 || '') + '' + r.dim) || 0).toLocaleString('fr-FR')}</td>` : ''}<td class="p-2 text-right text-emerald-700 font-bold">${r.avec.toLocaleString('fr-FR')}</td><td class="p-2 text-right text-red-600 font-bold">${r.sans.toLocaleString('fr-FR')}</td><td class="p-2 text-right font-black">${(r.avec / r.total * 100).toFixed(1)} %</td></tr>`).join('')}</tbody></table></div>
                    <div class="mt-2 flex flex-wrap gap-2 text-xs items-center"><span class="text-slate-400">Consulter / exporter les lignes :</span>${qualInspectButtons(iA)} <span class="text-emerald-700 font-bold">avec</span> · ${qualInspectButtons(iS)} <span class="text-red-600 font-bold">sans</span></div>
                    ${dim2Sel && rows.length >= 400 ? '<p class="text-[10px] text-slate-400 mt-1">Affichage limité aux 400 premiers croisements (les plus peuplés) — le graphique montre les 15 premières valeurs de l\'axe × 5 de la dimension 2.</p>' : (!dim2Sel && rows.length >= 40 ? '<p class="text-[10px] text-slate-400 mt-1">Affichage limité aux 40 premières valeurs de la dimension (les plus peuplées).</p>' : '')}`;
                bgTaskEnd(`🎯 Analyse terminée : ${(gA / gT * 100).toFixed(1)} % de couverture sur ${gT.toLocaleString('fr-FR')} entités.`);
            } catch (e) { bgTaskEnd(); showError('Analyse impossible : ' + e.message); }
            finally { if (btn) btn.disabled = false; }
        }

