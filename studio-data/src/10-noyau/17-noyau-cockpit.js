        // ======================= 🏠 Cockpit =======================
        async function renderCockpit() {
            const cockpitContentElement = el('cockpitContent');
            if (!cockpitContentElement) return;
            const tables = Object.values(state.tables).filter(t => t.status === 'ready');
            const governance = state.governance;
            const doms = themeList();
            const noOwner = (governance.businessObjects || []).filter(b => !b.globalOwner);
            const linked = new Set();
            state.relations.forEach(r => {
                linked.add(r.sourceTable);
                linked.add(r.targetTable);
            });
            const unlinked = tables.filter(t => !linked.has(t.id));
            const noDom = tables.filter(t => !(t.theme || '').trim());
            const oldSrc = tables.filter(t => t.file && t.lastRefresh && Date.now() - t.lastRefresh > 7 * 864e5);
            const lastQ = (governance.qualityHistory || [])[0];
            const kpi = (v, l, cls, tab2) =>
                `<button onclick="switchTab(${tab2})" class="text-left bg-white border border-slate-200 rounded-xl shadow-sm p-4 hover:border-blue-300 transition-colors"><div class="text-2xl font-black ${cls}">${v}</div>
                    <div class="text-[11px] font-bold text-slate-500 uppercase mt-0.5">${l}</div>
                    </button>`;
            const alert = (cond, txt, tab2) =>
                cond
                    ? `<button onclick="switchTab(${tab2})" class="w-full text-left flex items-center gap-2 text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2 hover:bg-amber-100">⚠️ ${txt}</button>`
                    : '';
            const okOr = (arr, okTxt) =>
                arr.length
                    ? ''
                    : `<div class="flex items-center gap-2 text-xs bg-emerald-50 border border-emerald-100 text-emerald-700 rounded-lg px-3 py-2">✔ ${okTxt}</div>`;
            cockpitContentElement.innerHTML = `
                <div class="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3 mb-6">
                    ${kpi(tables.length, 'Sources & tables', 'text-blue-700', 1)}
                    ${kpi('<span id="ckRows">…</span>', 'Lignes chargées', 'text-indigo-700', 1)}
                    ${kpi(doms.length, 'Domaines', 'text-violet-700', 1)}
                    ${kpi(state.relations.length, 'Liens du modèle', 'text-cyan-700', 2)}
                    ${kpi((governance.businessObjects || []).length, 'Objets métier', 'text-emerald-700', 9)}
                    ${kpi((governance.qualityHistory || []).length, 'Audits réalisés', 'text-amber-700', 8)}
                    ${(() => {
                        const sn =
                            typeof qrSnapshots !== 'undefined' && qrSnapshots.length
                                ? qrSnapshots[qrSnapshots.length - 1]
                                : null;
                        const sc = sn && sn.global != null ? sn.global : null;
                        return `<button onclick="switchTab(12)" class="text-left bg-white border border-slate-200 rounded-xl shadow-sm p-4 hover:border-blue-300 transition-colors"><div class="text-2xl font-black" style="color:${sc == null ? 'var(--faint)' : meterColor(sc)}">${sc == null ? '—' : sc + '<span class=\"text-sm\" style=\"color:var(--faint)\">/100</span>'}</div>
                            <div class="text-[11px] font-bold text-slate-500 uppercase mt-0.5">Score qualité <span class="normal-case font-medium text-slate-400">(règles 📏)</span></div>
                            </button>`;
                    })()}
                </div>
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
                    <div class="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
                        <h3 class="text-sm font-black text-slate-700 mb-3">🚨 Points d'attention</h3>
                        <div class="space-y-1.5">
                            ${alert(
                                noOwner.length,
                                `${noOwner.length} objet(s) métier sans propriétaire : ${escapeHTML(
                                    noOwner
                                        .slice(0, 3)
                                        .map(b => b.name)
                                        .join(', ')
                                )}${noOwner.length > 3 ? '…' : ''}`,
                                9
                            )}
                            ${alert(
                                unlinked.length,
                                `${unlinked.length} table(s) non reliée(s) au modèle : ${escapeHTML(
                                    unlinked
                                        .slice(0, 3)
                                        .map(t => t.name)
                                        .join(', ')
                                )}${unlinked.length > 3 ? '…' : ''}`,
                                2
                            )}
                            ${alert(
                                noDom.length,
                                `${noDom.length} table(s) sans domaine : ${escapeHTML(
                                    noDom
                                        .slice(0, 3)
                                        .map(t => t.name)
                                        .join(', ')
                                )}${noDom.length > 3 ? '…' : ''}`,
                                1
                            )}
                            ${alert(oldSrc.length, `${oldSrc.length} source(s) non rafraîchie(s) depuis plus de 7 jours`, 1)}
                            ${okOr([...noOwner, ...unlinked, ...noDom, ...oldSrc], "Aucun point d'attention — gouvernance en ordre.")}
                        </div>
                    </div>
                    <div class="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
                        <h3 class="text-sm font-black text-slate-700 mb-3">✅ Dernier audit qualité</h3>
                        ${
                            lastQ
                                ? `<div class="text-xs text-slate-600">Table <strong>${escapeHTML(lastQ.table || '')}</strong> · ${new Date(lastQ.ts).toLocaleString('fr-FR')}<div class="flex gap-3 mt-2 flex-wrap">
                            <span class="bg-indigo-50 border border-indigo-100 rounded-lg px-2.5 py-1 font-bold text-indigo-700">${(lastQ.rows || 0).toLocaleString('fr-FR')} lignes</span>
                            <span class="bg-emerald-50 border border-emerald-100 rounded-lg px-2.5 py-1 font-bold text-emerald-700">complétude ${lastQ.avgCompleteness || 0} %</span>
                            <span class="bg-red-50 border border-red-100 rounded-lg px-2.5 py-1 font-bold text-red-700">${(lastQ.duplicates || 0).toLocaleString('fr-FR')} doublon(s)</span>
                        </div>
                                </div>`
                                : '<p class="text-xs text-slate-400 italic">Aucun audit encore lancé — onglet Qualité & Audit.</p>'
                        }
                        <div class="flex gap-2 mt-4 flex-wrap">
                            <button onclick="scanPII(this)" class="text-xs bg-violet-600 hover:bg-violet-700 text-white font-bold px-3 py-2 rounded-lg">🛡 Détecter les données personnelles (RGPD)</button>
                            <button onclick="exportGovernanceReport()" class="text-xs bg-slate-700 hover:bg-slate-800 text-white font-bold px-3 py-2 rounded-lg">📄 Dossier de gouvernance (HTML)</button>
                        </div>
                        <div id="ckPii" class="mt-3"></div>
                    </div>
                </div>
                <div class="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
                    <h3 class="text-sm font-black text-slate-700 mb-3">📊 Volumétrie par table</h3>
                    <div id="ckVol" class="text-xs text-slate-400">Comptage en cours…</div>
                </div>`;
            // volumétrie asynchrone (comptages mis en cache sur t.lastRows)
            try {
                const { conn } = await getDB();
                let total = 0;
                const rows = [];
                for (const table of tables) {
                    if (table.lastRows == null) {
                        try {
                            const rows = arrowResultToObjects(
                                await conn.query(`SELECT COUNT(*)::BIGINT AS n FROM ${sqlIdent(duckTableName(table.id))}`)
                            )[0];
                            table.lastRows = Number(rows.n);
                        } catch (e) {
                            table.lastRows = null;
                        }
                    }
                    if (table.lastRows != null) {
                        total += table.lastRows;
                        rows.push([table.name, table.lastRows, table.theme || '']);
                    }
                }
                const ckRowsElement = el('ckRows');
                if (ckRowsElement) ckRowsElement.textContent = total.toLocaleString('fr-FR');
                const ckVolElement = el('ckVol');
                if (ckVolElement)
                    ckVolElement.innerHTML = `<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-1.5">${rows
                        .sort((a, b) => b[1] - a[1])
                        .map(
                            ([n, v, d]) =>
                                `<div class="flex justify-between gap-2 border border-slate-100 rounded px-2.5 py-1.5"><span class="truncate font-medium text-slate-700">${escapeHTML(n)}${d ? ` <span class="text-[9px] text-slate-400">🗂 ${escapeHTML(d)}</span>` : ''}</span><span class="font-black text-slate-600">${v.toLocaleString('fr-FR')}</span></div>`
                        )
                        .join('')}</div>`;
            } catch (e) {
                const ckVolElement = el('ckVol');
                if (ckVolElement) ckVolElement.textContent = 'Volumétrie indisponible : ' + e.message;
            }
        }
