        // ==========================================
        //  STEP 6: DATA BROWSER
        // ==========================================
        function handleBrowserTableChange() {
            const tableId = el('browserTableSelect').value;
            browserState.tableId = tableId; browserState.filters = {}; browserState.sortCol = null; browserState.sortDir = 'asc'; browserState.data = [];
            if (tableId) {
                browserState.linkMap = {};
                state.relations.forEach(r => {
                    if (r.sourceTable === tableId) browserState.linkMap[r.sourceCol] = { targetTableId: r.targetTable, targetCol: r.targetCol };
                    if (r.targetTable === tableId) browserState.linkMap[r.targetCol] = { targetTableId: r.sourceTable, targetCol: r.sourceCol };
                }); loadBrowserData();
            } else {
                el('browserDataHead').innerHTML = ''; el('browserDataBody').innerHTML = `<tr><td class="p-8 text-center text-slate-400 italic">Sélectionnez une table.</td></tr>`; el('browserRowCount').innerText = '0 résultat(s)';
            }
        }
        function onBrowserFilterInput(colName, value) {
            browserState.filters[colName] = value; clearTimeout(browserFilterTimeout);
            browserFilterTimeout = setTimeout(() => { loadBrowserData(); }, 600); 
        }
        function toggleBrowserSort(colName) {
            if (browserState.sortCol === colName) { browserState.sortDir = browserState.sortDir === 'asc' ? 'desc' : 'asc'; } 
            else { browserState.sortCol = colName; browserState.sortDir = 'asc'; }
            applyBrowserSortAndRender();
        }
        function applyBrowserSortAndRender() {
            if (browserState.sortCol) {
                browserState.data.sort((a, b) => {
                    let va = a[browserState.sortCol] || '', vb = b[browserState.sortCol] || ''; const strA = String(va).trim(), strB = String(vb).trim();
                    if (strA !== '' && strB !== '' && !isNaN(strA) && !isNaN(strB)) { va = parseFloat(strA); vb = parseFloat(strB); } else { va = strA.toLowerCase(); vb = strB.toLowerCase(); }
                    if (va < vb) return browserState.sortDir === 'asc' ? -1 : 1; if (va > vb) return browserState.sortDir === 'asc' ? 1 : -1; return 0;
                });
            } renderBrowserTableHTML();
        }
        function jumpToRelated(targetTableId, targetCol, value) {
            const strVal = String(value || '').trim(); if (strVal === '') return;
            el('browserTableSelect').value = targetTableId; browserState.tableId = targetTableId; browserState.filters = { [targetCol]: strVal }; browserState.sortCol = null; browserState.sortDir = 'asc'; browserState.data = [];
            browserState.linkMap = {};
            state.relations.forEach(r => {
                if (r.sourceTable === targetTableId) browserState.linkMap[r.sourceCol] = { targetTableId: r.targetTable, targetCol: r.targetCol };
                if (r.targetTable === targetTableId) browserState.linkMap[r.targetCol] = { targetTableId: r.sourceTable, targetCol: r.sourceCol };
            }); loadBrowserData();
        }
        async function loadBrowserData() {
            const tableId = browserState.tableId; if (!tableId) return; const table = state.tables[tableId];
            el('browserLoading').classList.remove('hidden');
            try {
                const results = [];
                await processDataStream(table, 15000, (row) => {
                    let match = true;
                    for (const col in browserState.filters) {
                        const filterVal = String(browserState.filters[col] || '').trim().toLowerCase();
                        if (filterVal !== '') {
                            const cellVal = String(row[col] || '').trim().toLowerCase();
                            if (!cellVal.includes(filterVal)) { match = false; break; }
                        }
                    }
                    if (match) results.push(row);
                });
                browserState.data = results.slice(0, 1000); 
                applyBrowserSortAndRender();
            } catch (err) { showError("Erreur de lecture des données."); } 
            finally { el('browserLoading').classList.add('hidden'); }
        }
        function renderBrowserTableHTML() {
            const tableId = browserState.tableId; if (!tableId || !state.tables[tableId]) return;
            const table = state.tables[tableId]; const thead = el('browserDataHead'); const tbody = el('browserDataBody');
            
            let headHTML = '<tr>';
            table.headers.forEach(h => {
                const filterVal = browserState.filters[h] || '';
                const sortIcon = browserState.sortCol === h ? (browserState.sortDir === 'asc' ? '<i data-lucide="arrow-up" class="w-3 h-3 text-indigo-600"></i>' : '<i data-lucide="arrow-down" class="w-3 h-3 text-indigo-600"></i>') : '<i data-lucide="arrow-up-down" class="w-3 h-3 text-slate-300 opacity-0 group-hover:opacity-100"></i>';
                headHTML += `<th class="p-3 align-top min-w-[150px]"><div class="flex items-center justify-between cursor-pointer group hover:bg-slate-200 p-1 rounded transition-colors mb-1" onclick="toggleBrowserSort('${escapeHTML(h)}')"><span class="font-bold text-slate-700 truncate mr-2" title="${escapeHTML(h)}">${escapeHTML(h)}</span>${sortIcon}</div><input type="text" class="w-full text-xs font-normal border border-slate-300 rounded p-1.5 focus:ring-indigo-500 focus:border-indigo-500" placeholder="Filtrer..." value="${escapeHTML(filterVal)}" oninput="onBrowserFilterInput('${escapeHTML(h.replace(/'/g, "\\'"))}', this.value)"></th>`;
            }); headHTML += '</tr>'; thead.innerHTML = headHTML;

            if (browserState.data.length === 0) { tbody.innerHTML = `<tr><td colspan="${table.headers.length}" class="p-8 text-center text-slate-400 italic">Aucun résultat trouvé pour ces filtres.</td></tr>`; } 
            else {
                let bodyHTML = '';
                browserState.data.forEach(row => {
                    bodyHTML += '<tr class="hover:bg-indigo-50/50 transition-colors group">';
                    table.headers.forEach(h => {
                        const cellVal = row[h]; const displayVal = cellVal !== undefined && cellVal !== null ? String(cellVal) : '';
                        if (browserState.linkMap[h] && displayVal.trim() !== '') {
                            const linkInfo = browserState.linkMap[h]; const safeVal = escapeHTML(displayVal.replace(/'/g, "\\'"));
                            bodyHTML += `<td class="p-3 border-t border-slate-100 max-w-[300px] truncate" title="${escapeHTML(displayVal)}"><button onclick="jumpToRelated('${linkInfo.targetTableId}', '${escapeHTML(linkInfo.targetCol.replace(/'/g, "\\'"))}', '${safeVal}')" class="text-indigo-600 hover:text-indigo-800 hover:underline font-medium inline-flex items-center gap-1 cursor-pointer focus:outline-none">${escapeHTML(displayVal)} <i data-lucide="external-link" class="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity"></i></button></td>`;
                        } else { bodyHTML += `<td class="p-3 border-t border-slate-100 text-slate-600 max-w-[300px] truncate" title="${escapeHTML(displayVal)}">${escapeHTML(displayVal)}</td>`; }
                    }); bodyHTML += '</tr>';
                }); tbody.innerHTML = bodyHTML;
            }
            el('browserRowCount').innerText = `${browserState.data.length} résultat(s)`; lucide.createIcons();
        }

