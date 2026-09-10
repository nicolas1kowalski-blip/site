        // ======================= Fusion de fichiers (une source = plusieurs fichiers) =======================
        let _mergePicked = [];
        function openMergeModal() { _mergePicked = []; renderMergeModal(); const m = el('mergeModal'); m.classList.remove('hidden'); m.classList.add('flex'); }
        function closeMergeModal() { const m = el('mergeModal'); m.classList.add('hidden'); m.classList.remove('flex'); }
        function mergePickFiles(e) { for (const f of Array.from(e.target.files)) _mergePicked.push(f); e.target.value = ''; renderMergeModal(); }
        function removeMergePicked(i) { _mergePicked.splice(i, 1); renderMergeModal(); }
        function renderMergeModal() {
            const body = el('mergeModalBody'); if (!body) return;
            const fileSrcs = Object.values(state.tables).filter(t => t.status === 'ready' && (t.file || (Array.isArray(t.files) && t.files.length)));
            body.innerHTML = `
                <p class="text-[11px] text-slate-500 mb-3">Une même source découpée en plusieurs fichiers (ex : export mensuel) ? Combinez-les en <strong>une seule source</strong>. Gardez le même format (tous CSV/TXT, ou tous Excel) et des colonnes compatibles — les colonnes sont alignées par nom.</p>
                <div class="mb-3">
                    <div class="text-[10px] uppercase font-bold text-slate-400 mb-1">1. Fichiers à fusionner</div>
                    <input type="file" id="mergeFileInput" multiple accept=".csv,.txt,.xlsx,.xls" onchange="mergePickFiles(event)" class="hidden">
                    <button onclick="el('mergeFileInput').click()" class="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded font-bold">+ Ajouter des fichiers</button>
                    ${_mergePicked.length ? `<div class="mt-2 space-y-1">${_mergePicked.map((f, i) => `<div class="flex items-center gap-2 text-[11px] bg-slate-50 border border-slate-200 rounded px-2 py-1"><span class="font-mono text-slate-600">${escapeHTML(f.name)}</span><button onclick="removeMergePicked(${i})" class="ml-auto text-red-400 hover:text-red-600">✕</button></div>`).join('')}</div>` : '<p class="text-[11px] text-slate-400 italic mt-1">Aucun fichier choisi.</p>'}
                </div>
                ${fileSrcs.length ? `<div class="mb-3">
                    <div class="text-[10px] uppercase font-bold text-slate-400 mb-1">2. …ou inclure des sources déjà chargées</div>
                    <div class="space-y-1 max-h-32 overflow-auto">${fileSrcs.map(t => `<label class="flex items-center gap-2 text-[11px] cursor-pointer"><input type="checkbox" class="merge-src" value="${t.id}"> <span class="font-bold">${escapeHTML(t.name)}</span> <span class="text-slate-400">${Array.isArray(t.files) ? '(' + t.files.length + ' fichiers)' : ''}</span></label>`).join('')}</div>
                </div>` : ''}
                <div class="mb-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                    <div><label class="text-[10px] uppercase font-bold text-slate-400 block mb-1">Nom de la source fusionnée</label><input type="text" id="mergeName" placeholder="ex : Ventes 2024 (complet)" class="w-full border border-slate-300 p-2 rounded text-sm"></div>
                    <label class="flex items-center gap-2 text-xs cursor-pointer self-end pb-1"><input type="checkbox" id="mergeRemoveOrig" checked> Retirer les sources d'origine après fusion</label>
                </div>`;
        }
        async function createMergedSource() {
            const name = (el('mergeName').value || '').trim();
            if (!name) return showError('Donnez un nom à la source fusionnée.');
            if (Object.values(state.tables).some(t => t.name.toLowerCase() === name.toLowerCase())) return showError(`Une source "${name}" existe déjà.`);
            const chosenIds = Array.from(document.querySelectorAll('#mergeModalBody .merge-src:checked')).map(c => c.value);
            const removeOrig = !!(el('mergeRemoveOrig') && el('mergeRemoveOrig').checked);
            const files = [..._mergePicked];
            chosenIds.forEach(id => { const t = state.tables[id]; if (t) { if (Array.isArray(t.files)) files.push(...t.files); else if (t.file) files.push(t.file); } });
            if (files.length < 2) return showError('Sélectionnez au moins 2 fichiers (choisis et/ou sources existantes).');
            const exts = new Set(files.map(f => f.name.split('.').pop().toLowerCase()));
            const allCsv = [...exts].every(e => ['csv', 'txt'].includes(e));
            const allXlsx = [...exts].every(e => ['xlsx', 'xls'].includes(e));
            if (!allCsv && !allXlsx) return showError('Gardez le même format pour tous les fichiers (tous CSV/TXT, ou tous Excel).');
            const tId = 'tb_' + generateId();
            state.tables[tId] = { id: tId, name, files, parts: files.map(f => f.name), type: allCsv ? 'csv' : 'xlsx', size: files.reduce((a, b) => a + (b.size || 0), 0), config: { delim: '', enc: 'UTF-8' }, headers: [], columnsMeta: {}, status: 'loading' };
            state.pivotMode[tId] = 'none';
            el('emptyStateSources').classList.add('hidden');
            closeMergeModal(); renderTables();
            try {
                const headers = await ingestFileTable(tId);
                const t = state.tables[tId]; t.headers = headers; t.sampleData = await duckSampleRows(tId, 6); t.status = 'ready';
                if (removeOrig && chosenIds.length) chosenIds.forEach(id => { if (state.tables[id]) removeTable(id); });
                renderTables(); autoDetectRelations(tId); updateBaseTableSelect(); populateQualTables();
                await persistTableData(tId); persistAppState();
                showSuccess(`Source fusionnée "${name}" créée à partir de ${files.length} fichier(s).`);
            } catch (err) { state.tables[tId].status = 'error'; state.tables[tId].errorMsg = err.message; renderTables(); }
        }

