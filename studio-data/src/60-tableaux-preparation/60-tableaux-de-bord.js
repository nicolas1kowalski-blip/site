        // ======================= E4 (V2) : TABLEAUX DE BORD COMPOSABLES & SAUVEGARDABLES =======================
        const DB_KINDS = { bar: '📊 Barres', line: '📈 Courbe', pie: '🥧 Camembert', table: '▦ Tableau', kpi: '#️⃣ Indicateur' };
        const DB_AGGS = { count: 'Nombre de lignes', countd: 'Valeurs distinctes de…', sum: 'Somme de…', avg: 'Moyenne de…', min: 'Min de…', max: 'Max de…' };
        let dbState = { openId: null, alerts: null };
        window._dbCharts = window._dbCharts || {};
        function dbList() { return state.dashboards = state.dashboards || []; }
        function dbById(id) { return dbList().find(x => x.id === id); }
        function dbAdd() { const d = { id: 'db_' + generateId(), name: 'Nouveau tableau de bord', filters: [], tiles: [] }; dbList().push(d); dbState.openId = d.id; persistAppState(); renderDashboards(); }
        function dbOpen(id) { dbState.openId = id; renderDashboards(); }
        function dbClose() { dbState.openId = null; renderDashboards(); }
        function dbDup(id) { const d = dbById(id); if (!d) return; const c2 = JSON.parse(JSON.stringify(d)); c2.id = 'db_' + generateId(); c2.name = d.name + ' (copie)'; c2.tiles.forEach(t => t.id = 'tl_' + generateId()); dbList().push(c2); persistAppState(); renderDashboards(); }
        function dbDel(id) { state.dashboards = dbList().filter(x => x.id !== id); if (dbState.openId === id) dbState.openId = null; persistAppState(); renderDashboards(); }
        function dbSet(id, f, v) { const d = dbById(id); if (!d) return; d[f] = v; persistAppState(); }
        function dbAddTile(id) { const d = dbById(id); if (!d) return; d.tiles.push({ id: 'tl_' + generateId(), title: 'Nouvelle tuile', table: '', kind: 'bar', dim: '', agg: 'count', aggCol: '', topN: 12 }); persistAppState(); renderDashboards(); }
        function dbSetTile(id, tid, f, v) { const d = dbById(id); const t = d && d.tiles.find(x => x.id === tid); if (!t) return; t[f] = v; persistAppState(); if (f === 'table' || f === 'kind') renderDashboards(); else dbRunTile(id, tid); }
        function dbDelTile(id, tid) { const d = dbById(id); if (!d) return; d.tiles = d.tiles.filter(x => x.id !== tid); persistAppState(); renderDashboards(); }
        function dbAddFilter(id) { const d = dbById(id); if (!d) return; d.filters.push({ col: '', op: 'eq', val: '', conn: 'AND' }); persistAppState(); renderDashboards(); }
        function dbSetFilter(id, i, f, v) { const d = dbById(id); if (!d || !d.filters[i]) return; d.filters[i][f] = v; persistAppState(); if (f === 'op') renderDashboards(); }
        function dbDelFilter(id, i) { const d = dbById(id); if (!d) return; d.filters.splice(i, 1); persistAppState(); renderDashboards(); }
        // Filtres GLOBAUX : appliqués à chaque tuile dont la table possède la colonne.
        function dbWhereFor(d, tableName) {
            const t = tableByName(tableName); if (!t) return '';
            let sql = '';
            (d.filters || []).forEach(c => {
                if (!c.col || !t.headers.includes(c.col)) return;
                if (!(['empty', 'nempty'].includes(c.op) || String(c.val || '').length)) return;
                const f = qualCondSql(c); if (!f) return;
                sql = sql ? `(${sql}) ${c.conn === 'OR' ? 'OR' : 'AND'} ${f}` : f;
            });
            return sql;
        }
        function dbTileSql(d, t) {
            const tb = tableByName(t.table); if (!tb || tb.status !== 'ready') return null;
            const T = sqlIdent(duckTableName(tb.id));
            const w = dbWhereFor(d, t.table); const W = w ? ` WHERE ${w}` : '';
            const num = c => `TRY_CAST(REPLACE(CAST(${sqlIdent(c)} AS VARCHAR), ',', '.') AS DOUBLE)`;
            const agg = t.agg === 'count' ? 'COUNT(*)' : t.agg === 'countd' ? `COUNT(DISTINCT ${t.aggCol ? sqlIdent(t.aggCol) : '1'})` : `${(t.agg || 'sum').toUpperCase()}(${t.aggCol ? num(t.aggCol) : 'NULL'})`;
            if (t.kind === 'kpi') return `SELECT ${agg} AS v FROM ${T}${W}`;
            if (!t.dim) return null;
            const dexpr = `COALESCE(NULLIF(TRIM(CAST(${sqlIdent(t.dim)} AS VARCHAR)), ''), '(vide)')`;
            return `SELECT ${dexpr} AS d, ${agg} AS v FROM ${T}${W} GROUP BY 1 ORDER BY 2 DESC LIMIT ${parseInt(t.topN) || 12}`;
        }
        async function dbRunTile(id, tid) {
            const d = dbById(id); const t = d && d.tiles.find(x => x.id === tid); if (!t) return;
            const body = el('dbTileBody-' + tid); if (!body) return;
            const sql = dbTileSql(d, t);
            if (!sql) { body.innerHTML = '<p class="text-[11px] text-slate-300 italic p-3">Configurez la tuile (table' + (t.kind !== 'kpi' ? ', axe' : '') + (t.agg !== 'count' ? ', colonne agrégée' : '') + ').</p>'; return; }
            try {
                const { conn } = await getDB();
                const rows = arrowResultToObjects(await conn.query(sql));
                t._rows = rows;
                if (t.kind === 'kpi') {
                    const v = rows[0] ? Number(rows[0].v) : 0; t._v = v;
                    const st2 = dbKpiStatus(t, v); t._st = st2;
                    const cls = st2 === 'crit' ? 'text-red-600' : (st2 === 'warn' ? 'text-amber-500' : 'text-sky-700');
                    const cmp = (t.thDir || 'max') === 'min' ? '≤' : '≥';
                    const badge = st2 ? `<div class="text-center text-[10px] font-bold pb-3 ${st2 === 'crit' ? 'text-red-600' : (st2 === 'warn' ? 'text-amber-600' : 'text-emerald-600')}">${st2 === 'crit' ? '⛔ Seuil critique atteint (' + cmp + ' ' + t.thCrit + ')' : (st2 === 'warn' ? '⚠️ Seuil d\'alerte atteint (' + cmp + ' ' + t.thWarn + ')' : '✅ Dans les seuils')}</div>` : '';
                    body.innerHTML = `<div class="text-4xl font-black ${cls} text-center pt-6 ${st2 ? 'pb-1' : 'pb-6'}">${(Math.round(v * 100) / 100).toLocaleString('fr-FR')}</div>${badge}`;
                    return;
                }
                if (t.kind === 'table') {
                    body.innerHTML = `<div class="overflow-auto max-h-[240px]"><table class="w-full text-left text-[11px]"><thead class="bg-slate-50 font-bold sticky top-0"><tr><th class="p-1.5">${escapeHTML(t.dim)}</th><th class="p-1.5 text-right">${DB_AGGS[t.agg] || t.agg}${t.aggCol ? ' ' + escapeHTML(t.aggCol) : ''}</th></tr></thead>
                        <tbody>${rows.map(r => `<tr class="border-t border-slate-100"><td class="p-1.5">${escapeHTML(String(r.d))}</td><td class="p-1.5 text-right font-bold">${Number(r.v).toLocaleString('fr-FR')}</td></tr>`).join('')}</tbody></table></div>`;
                    return;
                }
                body.innerHTML = `<div class="h-[220px] relative"><canvas id="dbCv-${tid}"></canvas></div>`;
                if (window._dbCharts[tid]) { try { window._dbCharts[tid].destroy(); } catch (e2) {} }
                if (typeof Chart === 'undefined') { body.innerHTML = '<p class="text-[11px] text-slate-400 p-3">Graphique indisponible (bibliothèque non chargée).</p>'; return; }
                const colors = rows.map((_, i) => THEME_PALETTE[i % THEME_PALETTE.length].zone);
                window._dbCharts[tid] = new Chart(el('dbCv-' + tid).getContext('2d'), {
                    type: t.kind === 'pie' ? 'doughnut' : t.kind,
                    data: { labels: rows.map(r => String(r.d)), datasets: [{ label: DB_AGGS[t.agg] || '', data: rows.map(r => Number(r.v)), backgroundColor: t.kind === 'line' ? '#0284c755' : colors, borderColor: t.kind === 'line' ? '#0284c7' : colors, fill: t.kind === 'line' }] },
                    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: t.kind === 'pie', position: 'right', labels: { boxWidth: 10, font: { size: 9 } } } }, scales: t.kind === 'pie' ? {} : { y: { beginAtZero: true } } },
                });
            } catch (e) { body.innerHTML = `<p class="text-[11px] text-red-600 p-3">Erreur : ${escapeHTML(e.message)}</p>`; }
        }
        async function dbRunAll(id) { const d = dbById(id); if (!d) return; for (const t of d.tiles) await dbRunTile(id, t.id); }
        function dbExportHtml(id) {
            const d = dbById(id); if (!d) return;
            const parts = d.tiles.map(t => {
                let inner = '';
                if (t.kind === 'kpi') inner = `<div style="font-size:42px;font-weight:900;color:#0369a1;text-align:center;padding:24px">${((t._rows || [])[0] ? Number(t._rows[0].v) : 0).toLocaleString('fr-FR')}</div>`;
                else if (t.kind === 'table' || !el('dbCv-' + t.id)) inner = `<table style="width:100%;border-collapse:collapse;font:11px system-ui">${(t._rows || []).map(r => `<tr><td style="border-top:1px solid #eee;padding:4px">${escapeHTML(String(r.d))}</td><td style="border-top:1px solid #eee;padding:4px;text-align:right;font-weight:700">${Number(r.v).toLocaleString('fr-FR')}</td></tr>`).join('')}</table>`;
                else { try { inner = `<img src="${el('dbCv-' + t.id).toDataURL('image/png')}" style="max-width:100%">`; } catch (e) { inner = '(graphique)'; } }
                return `<div style="border:1px solid #e2e8f0;border-radius:12px;padding:14px;background:#fff"><div style="font:700 13px system-ui;color:#334155;margin-bottom:8px">${escapeHTML(t.title)}</div>${inner}</div>`;
            }).join('');
            const filt = (d.filters || []).filter(f => f.col).map(f => `${f.col} ${f.op} ${f.val || ''}`).join(' · ');
            const html2 = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>${escapeHTML(d.name)}</title></head><body style="font-family:system-ui;background:#f8fafc;padding:24px;margin:0">
                <h1 style="font-size:20px;color:#0f172a">📋 ${escapeHTML(d.name)}</h1>
                <p style="font-size:11px;color:#64748b">Exporté le ${new Date().toLocaleString('fr-FR')}${filt ? ' · Filtres : ' + escapeHTML(filt) : ''} — généré localement par Studio Data (aucune donnée transmise).</p>
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:14px">${parts}</div></body></html>`;
            const blob = new Blob([html2], { type: 'text/html' });
            const a2 = document.createElement('a'); a2.href = URL.createObjectURL(blob); a2.download = `${d.name.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.html`; document.body.appendChild(a2); a2.click(); a2.remove();
        }
        function renderDashboards() {
            const c = el('dbContent'); if (!c) return;
            const tables = Object.values(state.tables).filter(t => t.status === 'ready');
            const d = dbState.openId ? dbById(dbState.openId) : null;
            if (!d) {
                c.innerHTML = `<div class="flex items-center gap-2 mb-4 flex-wrap"><button onclick="dbAdd()" class="bg-sky-600 hover:bg-sky-700 text-white font-bold py-2 px-4 rounded-lg text-sm">+ Tableau de bord</button>
                    <button onclick="dbCheckAlerts(this)" class="bg-white border border-amber-300 text-amber-700 text-xs font-bold px-3 py-2 rounded-lg hover:bg-amber-50">🔔 Vérifier les alertes</button>
                    <button onclick="dbExportReport(this)" class="bg-white border border-slate-300 text-slate-600 text-xs font-bold px-3 py-2 rounded-lg hover:bg-slate-50">📄 Rapport global (HTML)</button>
                    <span class="text-[11px] text-slate-400 ml-2" title="Une alerte critique est levée si le dernier score qualité global (E2) descend sous ce seuil.">Score qualité minimal</span>
                    <input type="number" min="0" max="100" value="${state.qualityMinScore != null ? state.qualityMinScore : ''}" onchange="state.qualityMinScore = this.value; persistAppState();" placeholder="ex: 90" class="border border-slate-200 rounded px-2 py-1 text-xs w-16 bg-white"></div>
                    ${dbAlertsHtml()}
                    ${dbList().length ? `<div class="grid grid-cols-1 md:grid-cols-3 gap-3">${dbList().map(d2 => `<div class="border border-slate-200 rounded-xl p-4 bg-slate-50/50 hover:border-sky-300 cursor-pointer" onclick="dbOpen('${d2.id}')">
                        <div class="font-bold text-sm text-slate-800">📋 ${escapeHTML(d2.name)}</div>
                        <div class="text-[11px] text-slate-400 mt-1">${d2.tiles.length} tuile(s) · ${(d2.filters || []).filter(f => f.col).length} filtre(s) global(aux)</div>
                        <div class="flex gap-2 mt-2"><button onclick="event.stopPropagation(); dbDup('${d2.id}')" class="text-[10px] bg-white border border-slate-300 px-2 py-0.5 rounded font-bold text-slate-500">⧉ Dupliquer</button><button onclick="event.stopPropagation(); dbDel('${d2.id}')" class="text-[10px] text-red-400 hover:text-red-600 font-bold">✕ Supprimer</button></div>
                    </div>`).join('')}</div>` : emptyStateHtml('📋', 'Aucun tableau de bord', 'Composez des tuiles (indicateurs, barres, camemberts) sur vos tables, ajoutez des seuils d\'alerte, puis exportez un livrable HTML autonome à partager.', '+ Créer un tableau de bord', 'dbAdd()')}`;
                return;
            }
            const allCols = [...new Set(tables.flatMap(t => t.headers))];
            const html = `<div class="flex items-center gap-2 mb-3 flex-wrap">
                <button onclick="dbClose()" class="text-xs bg-white border border-slate-300 px-2.5 py-1.5 rounded-lg font-bold text-slate-600">← Tableaux</button>
                <input type="text" value="${escapeHTML(d.name)}" onchange="dbSet('${d.id}','name',this.value)" class="font-bold text-base border border-slate-300 p-1.5 rounded-lg w-72">
                <button onclick="dbAddTile('${d.id}')" class="bg-sky-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg">+ Tuile</button>
                <button onclick="dbRunAll('${d.id}')" class="bg-white border border-sky-300 text-sky-700 text-xs font-bold px-3 py-1.5 rounded-lg">🔄 Tout actualiser</button>
                <span class="flex-grow"></span>
                <button onclick="dbExportHtml('${d.id}')" class="text-xs bg-white border border-slate-300 px-3 py-1.5 rounded-lg font-bold text-slate-600">⬇ Export HTML autonome</button>
            </div>
            <div class="border border-slate-200 rounded-lg p-2.5 bg-slate-50/50 mb-4">
                <div class="flex items-center justify-between mb-1"><span class="text-[10px] uppercase font-bold text-slate-400">Filtres globaux (appliqués à chaque tuile dont la table possède la colonne)</span><button onclick="dbAddFilter('${d.id}')" class="text-[10px] bg-white border border-slate-300 rounded px-2 py-0.5 font-bold text-slate-500">+ Filtre</button></div>
                ${(d.filters || []).map((f, i) => `<div class="flex items-center gap-1.5 mb-1">
                    ${i === 0 ? '<span class="text-[10px] font-bold text-slate-400 w-8 text-center">Où</span>' : `<select onchange="dbSetFilter('${d.id}',${i},'conn',this.value)" class="w-10 border rounded text-[10px] font-bold px-0.5 py-0.5 bg-white"><option value="AND" ${f.conn !== 'OR' ? 'selected' : ''}>ET</option><option value="OR" ${f.conn === 'OR' ? 'selected' : ''}>OU</option></select>`}
                    <input type="text" list="dbCols-${d.id}" value="${escapeHTML(f.col || '')}" onchange="dbSetFilter('${d.id}',${i},'col',this.value)" placeholder="colonne" class="border border-slate-300 rounded px-1.5 py-1 text-[11px] w-40 bg-white">
                    <select onchange="dbSetFilter('${d.id}',${i},'op',this.value)" class="border border-slate-300 rounded px-1 py-1 text-[11px] bg-white">${QUAL_FILTER_OPS.map(o => `<option value="${o.v}" ${f.op === o.v ? 'selected' : ''}>${o.t}</option>`).join('')}</select>
                    <input type="text" value="${escapeHTML(f.val || '')}" onchange="dbSetFilter('${d.id}',${i},'val',this.value)" placeholder="valeur" class="border border-slate-300 rounded px-1.5 py-1 text-[11px] w-32 ${['empty', 'nempty'].includes(f.op) ? 'invisible' : ''}">
                    <button onclick="dbDelFilter('${d.id}',${i})" class="text-slate-300 hover:text-red-500 font-bold">✕</button>
                </div>`).join('') || '<p class="text-[10px] text-slate-300 italic">Aucun filtre global.</p>'}
                <datalist id="dbCols-${d.id}">${allCols.map(h => `<option value="${escapeHTML(h)}">`).join('')}</datalist>
                ${(d.filters || []).some(f => f.col) ? `<button onclick="dbRunAll('${d.id}')" class="text-[10px] bg-sky-600 text-white rounded px-2 py-0.5 font-bold mt-1">Appliquer</button>` : ''}
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">${d.tiles.map(t => { const tb = tableByName(t.table); const hs = tb ? tb.headers : [];
                const colSel = (f, cur, ph) => `<select onchange="dbSetTile('${d.id}','${t.id}','${f}',this.value)" class="border border-slate-200 rounded px-1 py-0.5 text-[10px] bg-white max-w-[110px]"><option value="">${ph}</option>${hs.map(h => `<option value="${escapeHTML(h)}" ${cur === h ? 'selected' : ''}>${escapeHTML(h)}</option>`).join('')}</select>`;
                return `<div class="border border-slate-200 rounded-xl bg-white">
                <div class="flex items-center gap-1.5 px-3 py-2 border-b border-slate-100 flex-wrap">
                    <input type="text" value="${escapeHTML(t.title)}" onchange="dbSetTile('${d.id}','${t.id}','title',this.value)" class="font-bold text-xs border border-slate-200 p-1 rounded flex-grow min-w-[120px]">
                    <button onclick="dbDelTile('${d.id}','${t.id}')" class="text-slate-300 hover:text-red-500 font-bold">✕</button>
                </div>
                <div class="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50/60 flex-wrap text-[10px]">
                    <select onchange="dbSetTile('${d.id}','${t.id}','table',this.value)" class="border border-slate-200 rounded px-1 py-0.5 bg-white max-w-[120px] font-bold"><option value="">— table —</option>${tables.map(t2 => `<option value="${escapeHTML(t2.name)}" ${t.table === t2.name ? 'selected' : ''}>${escapeHTML(t2.name)}</option>`).join('')}</select>
                    <select onchange="dbSetTile('${d.id}','${t.id}','kind',this.value)" class="border border-slate-200 rounded px-1 py-0.5 bg-white">${Object.entries(DB_KINDS).map(([k, l]) => `<option value="${k}" ${t.kind === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
                    ${t.kind !== 'kpi' ? `<span class="text-slate-400">axe</span>${colSel('dim', t.dim, '— axe —')}` : ''}
                    <select onchange="dbSetTile('${d.id}','${t.id}','agg',this.value)" class="border border-slate-200 rounded px-1 py-0.5 bg-white">${Object.entries(DB_AGGS).map(([k, l]) => `<option value="${k}" ${t.agg === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
                    ${t.agg !== 'count' ? colSel('aggCol', t.aggCol, '— col —') : ''}
                    ${t.kind !== 'kpi' ? `<span class="text-slate-400">top</span><input type="number" value="${t.topN || 12}" onchange="dbSetTile('${d.id}','${t.id}','topN',this.value)" class="border border-slate-200 rounded px-1 py-0.5 w-12">` : ''}
                    ${t.kind === 'kpi' ? `<select onchange="dbSetTile('${d.id}','${t.id}','thDir',this.value)" class="border border-slate-200 rounded px-1 py-0.5 bg-white" title="Sens de l'alerte"><option value="max" ${(t.thDir || 'max') === 'max' ? 'selected' : ''}>alerte si ≥</option><option value="min" ${t.thDir === 'min' ? 'selected' : ''}>alerte si ≤</option></select>
                    <input type="number" value="${t.thWarn != null ? t.thWarn : ''}" onchange="dbSetTile('${d.id}','${t.id}','thWarn',this.value)" placeholder="⚠ seuil" title="Seuil d'alerte" class="border border-amber-200 rounded px-1 py-0.5 w-16">
                    <input type="number" value="${t.thCrit != null ? t.thCrit : ''}" onchange="dbSetTile('${d.id}','${t.id}','thCrit',this.value)" placeholder="⛔ critique" title="Seuil critique" class="border border-red-200 rounded px-1 py-0.5 w-16">` : ''}
                </div>
                <div id="dbTileBody-${t.id}" class="p-2"></div>
            </div>`; }).join('')}</div>
            ${d.tiles.length ? '' : '<p class="text-sm text-slate-400 italic py-6 text-center">Ajoutez des tuiles avec « + Tuile ».</p>'}`;
            c.innerHTML = html;
            dbRunAll(d.id);
        }

