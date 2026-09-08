        // ======================= Mises à jour des sources =======================
        // Trois modes : (1) manuel — re-sélection d'un fichier pour une source existante ;
        // (2) dossier surveillé — l'appli relit les fichiers d'un répertoire et met à jour les sources
        // du même nom (File System Access API, Chrome/Edge) ; (3) automatique — scan périodique.
        state.watchedDirs = [];               // [{ id, name, handle }]
        state.autoRefresh = { on: false, minutes: 5 };
        let _autoRefreshTimer = null;
        function fsDirSupported() { return typeof window.showDirectoryPicker === 'function'; }

        // Ré-ingère un fichier dans une source EXISTANTE (même id/nom : toute la gouvernance survit).
        async function refreshTableFromFile(tId, file, opts) {
            const t = state.tables[tId]; if (!t) return { ok: false };
            const oldHeaders = (t.headers || []).slice(); // E9 : détection des colonnes disparues
            const ext = file.name.split('.').pop().toLowerCase();
            if (!['csv','txt','xlsx','xls'].includes(ext)) throw new Error('Type non pris en charge : ' + file.name);
            if (opts && opts.skipUnchanged && t.srcModified && file.lastModified && file.lastModified <= t.srcModified) return { ok: true, skipped: true };
            t.file = file; t.size = file.size; t.type = ext; t.status = 'loading'; renderTables();
            const headers = await ingestFileTable(tId);
            t.headers = headers; t.sampleData = await duckSampleRows(tId, 6); t.status = 'ready';
            t.lastRefresh = Date.now(); t.srcModified = file.lastModified || Date.now();
            renderTables(); autoDetectRelations(tId); updateBaseTableSelect(); populateQualTables();
            await persistTableData(tId); persistAppState();
            // Les tables conçues qui dépendent de cette source sont reconstruites automatiquement.
            try { await tdAutoRebuildFor(t.name); } catch (e) { console.warn('Reconstruction auto ignorée :', e); }
            // E9 : colonnes disparues -> alerte listant les objets aval qui vont casser.
            try {
                const gone = (oldHeaders || []).filter(h => !t.headers.includes(h));
                gone.forEach(h => { const deps = modelImpact(t.name, h); if (deps.length) showError(`⚠️ La colonne « ${h} » a disparu de « ${t.name} » au rafraîchissement — ${deps.length} objet(s) dépendant(s) risquent de casser : ${deps.slice(0, 5).map(d => d.type + ' ' + d.name).join(' · ')}${deps.length > 5 ? '…' : ''}`); });
            } catch (e) {}
            // E3 : les recettes attachées à cette source sont relancées automatiquement.
            try { await rcAutoRun(t.name); } catch (e) { console.warn('Recettes non relancées :', e); }
            // E1 : les règles de qualité de cette table sont rejouées automatiquement.
            try { await qrAutoRun(t.name); } catch (e) { console.warn('Règles qualité non rejouées :', e); }
            return { ok: true, refreshed: true };
        }
        function manualUpdateSource(tId) {
            const t = state.tables[tId]; if (!t) return;
            const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.csv,.txt,.xlsx,.xls';
            inp.onchange = async (e) => {
                const f = e.target.files[0]; if (!f) return;
                try { await refreshTableFromFile(tId, f); showSuccess(`Source "${t.name}" mise à jour (${f.name}).`); }
                catch (err) { showError('Mise à jour impossible : ' + err.message); }
            };
            inp.click();
        }
        async function saveWatchedDirs() { try { await idbPut('meta', 'watchedDirs', state.watchedDirs.map(d => ({ id: d.id, name: d.name, handle: d.handle }))); } catch (e) {} }
        async function saveUpdatePrefs() { try { await idbPut('meta', 'updatePrefs', { autoRefresh: state.autoRefresh }); } catch (e) {} }
        async function ensureDirPermission(handle, interactive) {
            try {
                if ((await handle.queryPermission({ mode: 'read' })) === 'granted') return true;
                if (!interactive) return false;
                return (await handle.requestPermission({ mode: 'read' })) === 'granted';
            } catch (e) { return false; }
        }
        async function addWatchedDir() {
            if (!fsDirSupported()) return showError('La surveillance de dossier nécessite un navigateur compatible (Chrome ou Edge sur ordinateur).');
            let handle; try { handle = await window.showDirectoryPicker(); } catch (e) { return; }
            if (state.watchedDirs.some(d => d.name === handle.name)) { const ex = state.watchedDirs.find(d => d.name === handle.name); ex.handle = handle; }
            else state.watchedDirs.push({ id: 'wd_' + generateId(), name: handle.name, handle });
            await saveWatchedDirs(); renderSourceUpdatePanel(); scheduleAutoRefresh();
            const id = state.watchedDirs.find(d => d.name === handle.name).id;
            await scanWatchedDir(id, true, true);
        }
        function removeWatchedDir(id) { state.watchedDirs = state.watchedDirs.filter(d => d.id !== id); saveWatchedDirs(); scheduleAutoRefresh(); renderSourceUpdatePanel(); }
        // Scanne un dossier : met à jour les sources du même nom, importe les nouveaux fichiers si demandé.
        // Verrou anti-double-clic : un seul scan à la fois. Les entrées publiques (boutons, minuteur)
        // affichent immédiatement la pastille d'activité et désactivent les boutons du panneau —
        // ré-appuyer pendant un scan ne relance rien.
        let _srcScanBusy = false;
        async function _scanDirImpl(wd, importNew, interactive) {
            if (!(await ensureDirPermission(wd.handle, interactive))) { if (interactive) showError(`Accès au dossier "${wd.name}" refusé.`); return { refreshed: 0, imported: 0, skipped: 0, denied: true }; }
            let refreshed = 0, imported = 0, skipped = 0;
            try {
                for await (const entry of wd.handle.values()) {
                    if (entry.kind !== 'file') continue;
                    const ext = entry.name.split('.').pop().toLowerCase(); if (!['csv','txt','xlsx','xls'].includes(ext)) continue;
                    const existing = Object.keys(state.tables).find(tid => state.tables[tid].name.toLowerCase() === entry.name.toLowerCase());
                    const file = await entry.getFile();
                    // Le nom du dossier surveillé initialise le THÈME de la source (modifiable ensuite).
                    if (existing) { const tt = state.tables[existing]; if (tt && !tt.theme) tt.theme = wd.name; try { const r = await refreshTableFromFile(existing, file, { skipUnchanged: true }); if (r.refreshed) refreshed++; else if (r.skipped) skipped++; } catch (e) {} }
                    else if (importNew) { const nid = await loadNewSourceFromFile(file); if (nid) { imported++; const tt = state.tables[nid]; if (tt && !tt.theme) { tt.theme = wd.name; persistAppState(); renderTables(); } } }
                }
            } catch (e) { if (interactive) showError('Lecture du dossier impossible : ' + e.message); return { refreshed, imported, skipped }; }
            wd.lastScan = Date.now();
            return { refreshed, imported, skipped };
        }
        async function scanWatchedDir(id, importNew, interactive) {
            const wd = state.watchedDirs.find(d => d.id === id); if (!wd) return;
            if (_srcScanBusy) { if (interactive) showSuccess('⏳ Un scan est déjà en cours — patientez, inutile de recliquer.'); return; }
            _srcScanBusy = true; renderSourceUpdatePanel();
            if (interactive) bgTaskStart(`Scan du dossier "${wd.name}" en cours`);
            try {
                const r = await _scanDirImpl(wd, importNew, interactive);
                if (interactive) bgTaskEnd(r && !r.denied ? `📂 Dossier "${wd.name}" : ${r.refreshed} mise(s) à jour, ${r.imported} import(s), ${r.skipped} inchangé(s).` : undefined);
                return r;
            } finally { _srcScanBusy = false; renderSourceUpdatePanel(); bgTaskEnd(); }
        }
        async function scanAllWatchedDirs(importNew, interactive) {
            if (!state.watchedDirs.length) { if (interactive) showError('Aucun dossier surveillé. Ajoutez-en un d\'abord.'); return; }
            if (_srcScanBusy) { if (interactive) showSuccess('⏳ Un scan est déjà en cours — patientez, inutile de recliquer.'); return; }
            _srcScanBusy = true; renderSourceUpdatePanel();
            if (interactive) bgTaskStart(`Rafraîchissement des sources (${state.watchedDirs.length} dossier(s)) en cours`);
            try {
                let R = 0, I = 0, S = 0, any = false;
                for (const d of state.watchedDirs) { const r = await _scanDirImpl(d, importNew, interactive); if (r) { R += r.refreshed || 0; I += r.imported || 0; S += r.skipped || 0; any = true; } }
                if (interactive) bgTaskEnd(any ? `🔄 Rafraîchissement terminé : ${R} mise(s) à jour, ${I} import(s), ${S} inchangé(s).` : undefined);
            } finally { _srcScanBusy = false; renderSourceUpdatePanel(); bgTaskEnd(); }
        }
        function setAutoRefresh(on) { state.autoRefresh.on = on; scheduleAutoRefresh(); saveUpdatePrefs(); renderSourceUpdatePanel(); }
        function setAutoRefreshMinutes(m) { state.autoRefresh.minutes = parseInt(m) || 5; scheduleAutoRefresh(); saveUpdatePrefs(); }
        function scheduleAutoRefresh() {
            if (_autoRefreshTimer) { clearInterval(_autoRefreshTimer); _autoRefreshTimer = null; }
            if (state.autoRefresh.on && state.watchedDirs.length) {
                _autoRefreshTimer = setInterval(() => { scanAllWatchedDirs(false, false).catch(() => {}); }, Math.max(1, state.autoRefresh.minutes) * 60000);
            }
        }
        function toggleSourceUpdatePanel() {
            const body = el('sourceUpdateBody'); const open = body.classList.toggle('hidden') === false;
            const chev = el('srcUpdateChevron'); if (chev) chev.style.transform = open ? 'rotate(180deg)' : '';
            if (open) renderSourceUpdatePanel();
        }
        function renderSourceUpdatePanel() {
            const body = el('sourceUpdateBody');
            const badge = el('srcUpdateBadge');
            if (badge) badge.textContent = state.watchedDirs.length ? `— ${state.watchedDirs.length} dossier(s)${state.autoRefresh.on ? ', auto ' + state.autoRefresh.minutes + ' min' : ''}` : '';
            if (!body || body.classList.contains('hidden')) return;
            const fmt = ts => ts ? new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '—';
            let html = `<div class="grid grid-cols-1 lg:grid-cols-3 gap-4">`;
            // 1. Manuel
            html += `<div class="border border-slate-200 rounded-lg p-3">
                <div class="text-xs font-bold text-slate-700 mb-1">✋ Mise à jour manuelle</div>
                <p class="text-[11px] text-slate-500 mb-2">Chaque source affiche un bouton <strong>🔄</strong> pour recharger un fichier à la place de l'actuel (même nom d'objet conservé). Fonctionne dans tous les navigateurs.</p>
                <button onclick="scanAllWatchedDirs(false, true)" class="text-[11px] px-2.5 py-1 rounded font-bold ${_srcScanBusy ? 'bg-indigo-100 text-indigo-500 border border-indigo-200 pointer-events-none' : 'bg-white border border-slate-300 hover:bg-slate-50'} ${state.watchedDirs.length ? '' : 'opacity-40 pointer-events-none'}">${_srcScanBusy ? '⏳ Scan en cours…' : '🔄 Tout rafraîchir depuis les dossiers'}</button>
            </div>`;
            // 2. Dossiers surveillés
            html += `<div class="border border-indigo-200 rounded-lg p-3 bg-indigo-50/30">
                <div class="text-xs font-bold text-indigo-700 mb-1">📂 Dossiers surveillés</div>`;
            if (!fsDirSupported()) {
                html += `<p class="text-[11px] text-amber-700">Non disponible sur ce navigateur (nécessite Chrome/Edge sur ordinateur). La mise à jour manuelle reste possible.</p>`;
            } else {
                html += `<p class="text-[11px] text-slate-500 mb-2">Liez un répertoire : les fichiers du même nom que vos sources mettent celles-ci à jour automatiquement lors d'un scan.</p>`;
                if (state.watchedDirs.length) html += `<div class="space-y-1 mb-2">${state.watchedDirs.map(d => `<div class="flex items-center gap-1.5 text-[11px] bg-white border border-slate-200 rounded px-2 py-1"><span class="font-bold text-slate-700">📁 ${escapeHTML(d.name)}</span><span class="text-slate-400">scan ${fmt(d.lastScan)}</span><button onclick="scanWatchedDir('${d.id}', true, true)" class="ml-auto px-1.5 py-0.5 rounded font-bold ${_srcScanBusy ? 'bg-indigo-100 text-indigo-400 border border-indigo-200 pointer-events-none' : 'bg-indigo-50 border border-indigo-200 text-indigo-700'}">${_srcScanBusy ? '⏳…' : '🔍 Scanner'}</button><button onclick="removeWatchedDir('${d.id}')" class="text-red-400 hover:text-red-600">✕</button></div>`).join('')}</div>`;
                html += `<button onclick="addWatchedDir()" class="text-[11px] bg-indigo-600 text-white px-2.5 py-1 rounded font-bold">+ Lier un dossier</button>`;
            }
            html += `</div>`;
            // 2 bis. Livraison ZIP
            html += `<div class="border border-emerald-200 rounded-lg p-3 bg-emerald-50/30">
                <div class="text-xs font-bold text-emerald-700 mb-1">📦 Livraison ZIP</div>
                <p class="text-[11px] text-slate-500 mb-2">Déposez un ZIP contenant vos fichiers (organisés en dossiers) : choisissez la destination de chaque dossier ou fichier (mise à jour des sources du même nom, import des nouveaux dans un domaine). Le <strong>mapping est mémorisé</strong> et se ré-applique aux prochains ZIP de même structure.</p>
                <button onclick="el('zipUploader').click()" class="text-[11px] bg-emerald-600 text-white px-2.5 py-1 rounded font-bold">📦 Choisir un ZIP…</button>
                <input type="file" id="zipUploader" accept=".zip" class="hidden" onchange="zipDeliveryLoad(this)">
                <div id="zipMapArea" class="mt-2"></div>
            </div>`;
            // 2 ter. Connecteurs E11
            html += cnPanelHtml();
            // 3. Auto
            html += `<div class="border border-slate-200 rounded-lg p-3">
                <div class="text-xs font-bold text-slate-700 mb-1">⏱️ Mise à jour automatique</div>
                <label class="flex items-center gap-2 text-xs mb-2 ${fsDirSupported() ? '' : 'opacity-40'}"><input type="checkbox" ${state.autoRefresh.on ? 'checked' : ''} onchange="setAutoRefresh(this.checked)" ${fsDirSupported() ? '' : 'disabled'}> Scanner les dossiers toutes les
                    <select onchange="setAutoRefreshMinutes(this.value)" class="border border-slate-300 rounded p-0.5 text-[11px] bg-white">${[2, 5, 15, 30, 60].map(m => `<option value="${m}" ${state.autoRefresh.minutes === m ? 'selected' : ''}>${m}</option>`).join('')}</select> min</label>
                <p class="text-[10px] text-slate-400">Tant que l'onglet reste ouvert. Ne met à jour que les fichiers <strong>modifiés</strong> depuis le dernier chargement.</p>
            </div>`;
            html += `</div>`;
            body.innerHTML = html;
            if (window.lucide) lucide.createIcons({ root: body });
        }
        async function restoreUpdateConfig() {
            try {
                const dirs = await idbGet('meta', 'watchedDirs');
                if (Array.isArray(dirs)) state.watchedDirs = dirs.filter(d => d && d.handle).map(d => ({ id: d.id || ('wd_' + generateId()), name: d.name, handle: d.handle }));
                const prefs = await idbGet('meta', 'updatePrefs');
                if (prefs && prefs.autoRefresh) state.autoRefresh = { on: !!prefs.autoRefresh.on, minutes: prefs.autoRefresh.minutes || 5 };
                scheduleAutoRefresh();
            } catch (e) {}
        }

        async function updateTableConfig(tId, f, v) {
            state.tables[tId].config[f]=v; state.tables[tId].status='loading'; renderTables();
            try {
                const headers = await ingestFileTable(tId);
                const t = state.tables[tId];
                t.headers = headers; t.sampleData = await duckSampleRows(tId, 6); t.status = 'ready';
                renderTables();
                autoDetectRelations(tId);
                persistTableData(tId); persistAppState();
            } catch (err) { state.tables[tId].status='error'; state.tables[tId].errorMsg=err.message; renderTables(); }
        }

        function removeTable(tId) {
            const tName = state.tables[tId] ? state.tables[tId].name : null;
            delete state.tables[tId]; state.relations = state.relations.filter(r=>r.sourceTable!==tId&&r.targetTable!==tId);
            delete state.selectedCols[tId]; delete state.pivotMode[tId]; delete state.filters[tId]; delete state.hierarchyConfig[tId]; delete state.graphConfig[tId];
            duckDropTable(tId).catch(() => {});
            if (tName) idbDel('tabledata', tName).catch(() => {});
            persistAppState();
            if(!Object.keys(state.tables).length) el('emptyStateSources').classList.remove('hidden');
            renderTables(); updateBaseTableSelect(); populateQualTables();
            if(!el('step-2').classList.contains('hidden')){ renderRelationsList(); renderGraph(); }
        }

        // Auto-complétion sur un <select> de tables : champ de filtre inséré au-dessus, options
        // masquées en direct, Entrée = sélectionner la première correspondance.
        function comboifyTableSelect(selId) {
            const sel = el(selId); if (!sel || sel.dataset.combo) return; sel.dataset.combo = '1';
            const inp = document.createElement('input');
            inp.type = 'text'; inp.placeholder = '🔍 taper pour filtrer les tables…';
            inp.className = 'w-full border border-slate-200 rounded px-2 py-1 text-xs mb-1 bg-slate-50 focus:bg-white focus:border-indigo-400';
            inp.addEventListener('input', () => {
                const q = srcNorm(inp.value);
                let first = null;
                Array.from(sel.options).forEach(o => { const m = !o.value || !q || srcNorm(o.textContent).includes(q); o.hidden = !m; if (m && o.value && !first) first = o; });
                if (q && first) { if (sel.value !== first.value) { sel.value = first.value; sel.dispatchEvent(new Event('change')); } }
            });
            inp.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); sel.focus(); } });
            sel.parentNode.insertBefore(inp, sel);
        }
        function srcNorm(x) { return String(x).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
        let _srcSearchT = null;
        function srcSearchChanged(v) { window.srcSearchQ = v; clearTimeout(_srcSearchT); _srcSearchT = setTimeout(renderTables, 120); }
        function renderTables() {
            const grid = el('tablesGrid'); if (!grid) return; let _gridHtml = '';
            const dl = el('themeDatalist'); if (dl) dl.innerHTML = themeList().map(th => `<option value="${escapeHTML(th)}">`).join('');
            // Recherche de source : nom, domaine ou nom de colonne (casse et accents ignorés).
            const _q = srcNorm(window.srcSearchQ || '');
            const _all = Object.values(state.tables);
            const _shown = !_q ? _all : _all.filter(t => srcNorm(t.name).includes(_q) || srcNorm(t.theme || '').includes(_q) || (t.headers || []).some(h => srcNorm(h).includes(_q)));
            const _cnt = el('srcSearchCount'); if (_cnt) _cnt.textContent = _q ? `${_shown.length} / ${_all.length} source(s)` : (_all.length ? `${_all.length} source(s)` : '');
            const _clr = el('srcSearchClear'); if (_clr) _clr.classList.toggle('hidden', !_q);
            if (_q && !_shown.length) _gridHtml = `<div class="col-span-full text-center text-sm text-slate-400 italic py-10 bg-white border border-dashed border-slate-200 rounded-xl">Aucune source ne correspond à « ${escapeHTML(window.srcSearchQ)} ».</div>`;
            if (!_q && !_all.length) _gridHtml = emptyStateHtml('📥', 'Importez un fichier pour commencer',
                'Déposez un CSV, un Excel, un ZIP ou branchez un connecteur : Studio Data profile vos données, construit le modèle et prépare la gouvernance — 100 % local, rien ne quitte votre machine.',
                '⤓ Choisir des fichiers…', "el('fileUploader') && el('fileUploader').click()");
            _shown.forEach(t => {
                let html = `<div class="bg-white rounded-xl border border-slate-200 shadow-sm p-5 relative group">
                    <div class="absolute top-3 right-3 flex items-center gap-1">
                        ${t.type === 'designed' ? `<button onclick="tdRebuild('${t.id}', this)" title="Reconstruire la table depuis ses sources" class="text-blue-600 opacity-0 group-hover:opacity-100 text-base leading-none p-0.5">🔄</button>` : (t.type !== 'api' && t.type !== 'extraction' ? `<button onclick="manualUpdateSource('${t.id}')" title="Mettre à jour : recharger un fichier à la place de celui-ci" class="text-indigo-600 opacity-0 group-hover:opacity-100 text-base leading-none p-0.5">🔄</button>` : '')}
                        ${t.status === 'ready' ? `<button onclick="openBoWizard('${escapeHTML(t.name.replace(/'/g, "\\'"))}')" title="Constituer / rattacher un objet métier depuis cette source" class="text-emerald-600 opacity-0 group-hover:opacity-100 text-base leading-none p-0.5">🏛️</button>` : ''}
                        <button onclick="removeTable('${t.id}')" aria-label="Supprimer la source ${escapeHTML(t.name)}" class="text-red-500 opacity-0 group-hover:opacity-100"><i data-lucide="trash-2" class="w-5 h-5"></i></button>
                    </div>`;
                const typeIcon = t.type === 'api' ? 'database' : (t.type === 'extraction' ? 'combine' : (t.type === 'designed' ? 'layers' : 'file'));
                html += `<div class="flex items-center gap-3 mb-3"><div class="${t.type === 'designed' ? 'bg-blue-100 p-2 rounded text-blue-600' : 'bg-indigo-100 p-2 rounded text-indigo-600'}"><i data-lucide="${typeIcon}" class="w-5 h-5"></i></div><div class="truncate"><h3 class="font-bold text-sm" title="${escapeHTML(t.name)}">${escapeHTML(t.name)}</h3>${t.type==='extraction'?'<span class="text-[9px] uppercase font-bold text-purple-600 bg-purple-50 border border-purple-100 px-1.5 py-0.5 rounded">Source dérivée (Extraction)</span>':(t.type==='designed'?'<span class="text-[9px] uppercase font-bold text-blue-600 bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded">🧱 Table conçue — gérée dans l\'onglet Tables</span>':(t.lastRefresh?`<span class="text-[9px] font-bold text-emerald-600" title="Dernière mise à jour">🔄 maj ${new Date(t.lastRefresh).toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</span>`:''))}</div></div>`;
                if(t.status==='loading') html+=`<div class="text-indigo-600 text-sm">Analyse...</div>`;
                else if(t.status==='error') {
                    const isQuote = /unterminated quote|CSV Error|Invalid Input/i.test(t.errorMsg || '');
                    html+=`<div class="text-red-600 text-xs bg-red-50 border border-red-100 rounded p-2 max-h-24 overflow-auto">${escapeHTML(t.errorMsg||'')}</div>`;
                    if ((t.type==='csv'||t.type==='txt'||Array.isArray(t.files)) && isQuote) html += `<button onclick="repairCsvSource('${t.id}')" class="mt-2 text-xs bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded font-bold w-full">🔧 Réparer : lire sans guillemets + ignorer les lignes fautives</button>`;
                }
                else {
                    const storageBadge = t.storage === 'parquet'
                        ? `<div class="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded px-1.5 py-0.5 mb-1.5 inline-block" title="Source convertie en Parquet compressé : format colonnaire, analyses 5 à 20× plus rapides, lu hors de la mémoire.">🗜️ Optimisée (Parquet)${t.pqSize?` · ${(t.pqSize/1048576).toFixed(1)} Mo`:''}</div><br>`
                        : (t.storage === 'view' ? `<div class="text-[10px] font-bold text-cyan-700 bg-cyan-50 border border-cyan-100 rounded px-1.5 py-0.5 mb-1.5 inline-block" title="Gros fichier : lu à la demande depuis le disque, jamais copié en mémoire — les analyses relisent le fichier (un peu plus lentes mais sans limite de taille mémoire). Cliquez « Optimiser » pour accélérer.">⚡ Lecture directe (gros fichier)</div><br>` : '');
                    const mergedBadge = (Array.isArray(t.files)&&t.files.length?`<div class="text-[10px] font-bold text-purple-600 bg-purple-50 border border-purple-100 rounded px-1.5 py-0.5 mb-1.5 inline-block">🧩 Source fusionnée · ${t.files.length} fichiers</div><br>`:'');
                    // V3 UX : faits lisibles d'un regard — format, volumétrie, complétude du dernier audit.
                    const lq = lastAuditFor(t.name);
                    html += `<div class="flex items-center gap-2 mb-2 text-[11px] text-slate-500 flex-wrap">${fmtBadgeUx(t)}
                        <span><strong class="text-slate-700">${t.lastRows != null ? Number(t.lastRows).toLocaleString('fr-FR') : '—'}</strong> lignes</span><span aria-hidden="true">·</span>
                        <span><strong class="text-slate-700">${(t.headers || []).length}</strong> colonnes</span>
                        ${lq && lq.avgCompleteness != null ? `<span class="flex-grow"></span><span class="meter" style="min-width:110px" title="Complétude moyenne au dernier audit (${new Date(lq.ts).toLocaleDateString('fr-FR')})"><span class="bar"><i style="width:${Math.min(100, lq.avgCompleteness)}%;background:${meterColor(lq.avgCompleteness)}"></i></span><span class="pct" style="color:${meterColor(lq.avgCompleteness)}">${Math.round(lq.avgCompleteness)}%</span></span>` : ''}</div>`;
                    html+=`<div class="max-h-28 overflow-auto text-xs bg-slate-50 p-2 rounded border border-slate-100">${mergedBadge}${storageBadge}${t.headers.map(h=>`<span class="inline-block bg-white border px-1 rounded mr-1 mb-1">${escapeHTML(h)}</span>`).join('')}</div>`;
                    // Domaine (groupe de sources) : initialisé par le dossier surveillé, modifiable librement.
                    html+=`<div class="mt-2 flex items-center gap-2"><label class="text-[10px] uppercase font-bold text-slate-400 whitespace-nowrap">🗂 Domaine</label><input list="themeDatalist" value="${escapeHTML(t.theme||'')}" onchange="updateTableTheme('${t.id}', this.value)" placeholder="ex : Achats, Référentiels…" class="flex-1 min-w-0 text-xs border border-slate-200 rounded p-1.5 ${t.theme?'bg-white font-bold text-slate-700':'bg-slate-50 text-slate-500'}" title="Groupe de sources : zones et couleurs dans le Modèle de données"></div>`;
                    // Bouton « Optimiser » : converti une source fichier (CSV/TXT/fusion) en Parquet compressé.
                    const canOptimize = (t.type==='csv'||t.type==='txt'||(Array.isArray(t.files)&&t.files.length)) && t.storage !== 'parquet';
                    if (canOptimize) html += `<button onclick="optimizeSourceToParquet('${t.id}', this)" class="mt-2 w-full text-[11px] bg-white border border-emerald-300 text-emerald-700 hover:bg-emerald-50 px-3 py-1.5 rounded font-bold flex items-center justify-center gap-1.5" title="Convertir en Parquet compressé : analyses bien plus rapides, stockage réduit (×5 à ×10), idéal pour les gros fichiers.">🗜️ Optimiser${t.storage==='view'?' (recommandé — gros fichier)':''}</button>`;
                }

                if(t.type==='csv' || t.type==='txt' || (Array.isArray(t.files) && t.files.length && t.files.every(f=>/\.(csv|txt)$/i.test(f.name)))) {
                    const _mi = encMojibakeInfo(t);
                    if (_mi) html += `<div class="mt-3 flex items-center gap-2 flex-wrap text-[11px] bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2">
                        <span class="font-bold text-amber-800">⚠️ Caractères illisibles détectés${_mi.ex ? ` (ex : « ${escapeHTML(_mi.ex)} »)` : ''}</span>
                        <span class="text-amber-700">— c'est presque toujours un problème d'encodage, pas une erreur de données.</span>
                        <button onclick="fixSourceEncoding('${t.id}','${_mi.suggest}')" class="bg-amber-600 hover:bg-amber-700 text-white font-bold px-2.5 py-1 rounded">Corriger → ${escapeHTML(_mi.label)}</button>
                        <button onclick="dismissEncHint('${t.id}')" class="text-amber-500 hover:text-amber-700 underline">ignorer</button></div>`;
                    html += `<div class="grid grid-cols-2 gap-2 mt-4 pt-4 border-t border-slate-100">
                        <div><label class="text-[10px] uppercase font-bold text-slate-400 mb-1 block">Séparateur</label><select onchange="updateTableConfig('${t.id}', 'delim', this.value)" class="w-full text-xs bg-slate-50 border border-slate-200 rounded p-1 text-slate-700 focus:border-indigo-500"><option value="" ${t.config.delim===''?'selected':''}>Auto</option><option value=";" ${t.config.delim===';'?'selected':''}>Point-virgule (;)</option><option value="," ${t.config.delim===','?'selected':''}>Virgule (,)</option><option value="|" ${t.config.delim==='|'?'selected':''}>Pipe (|)</option><option value="\t" ${t.config.delim==='\t'?'selected':''}>Tabulation</option></select></div>
                        <div><label class="text-[10px] uppercase font-bold text-slate-400 mb-1 block" title="À changer si les accents s'affichent mal (é → Ã© ou �)">Encodage</label><select onchange="updateTableConfig('${t.id}', 'enc', this.value)" class="w-full text-xs bg-slate-50 border border-slate-200 rounded p-1 text-slate-700 focus:border-indigo-500"><option value="UTF-8" ${(t.config.enc||'UTF-8')==='UTF-8'?'selected':''}>UTF-8 (recommandé)</option><option value="ISO-8859-1" ${t.config.enc==='ISO-8859-1'?'selected':''}>Windows / ANSI (Latin-1)</option><option value="UTF-16" ${t.config.enc==='UTF-16'?'selected':''}>UTF-16</option></select></div>
                        <div><label class="text-[10px] uppercase font-bold text-slate-400 mb-1 block">Guillemets</label><select onchange="updateTableConfig('${t.id}', 'quote', this.value)" class="w-full text-xs bg-slate-50 border border-slate-200 rounded p-1 text-slate-700 focus:border-indigo-500" title="Choisir 'Aucun' si des \\" apparaissent au milieu des champs et cassent la lecture"><option value="" ${(t.config.quote||'')===''?'selected':''}>Auto (")</option><option value="none" ${t.config.quote==='none'?'selected':''}>Aucun</option></select></div>
                        <div class="flex items-end"><label class="flex items-center gap-1.5 text-[11px] text-slate-600 cursor-pointer pb-1"><input type="checkbox" ${t.config.ignoreErrors?'checked':''} onchange="updateTableConfig('${t.id}', 'ignoreErrors', this.checked)"> Ignorer lignes en erreur</label></div>
                    </div>`;
                }
                _gridHtml += html + `</div>`;
            }); 
            grid.innerHTML = _gridHtml;
            lucide.createIcons();
        }

        function addManualRelation() { 
            const tableIds = Object.keys(state.tables);
            if (tableIds.length < 2) return showError("Chargez au moins 2 fichiers pour créer un lien.");
            state.relations.push({id: 'r_'+generateId(), sourceTable: tableIds[0], sourceCol:'', targetTable: tableIds[1] || tableIds[0], targetCol:''}); 
            renderRelationsList(); renderGraph(); persistAppState(); 
        }

        function removeRelation(id) { state.relations = state.relations.filter(r=>r.id!==id); renderRelationsList(); renderGraph(); persistAppState(); }
        function updateRelation(id, f, v) { const r=state.relations.find(x=>x.id===id); if(r){ r[f]=v; renderRelationsList(); renderGraph(); persistAppState(); } }

        // Remplissage différé des listes de la vue « liens » (voir renderRelationsList).
        function fillRelTableSel(sel) {
            if (sel.dataset.filled) return; sel.dataset.filled = '1';
            const cur = sel.value;
            sel.innerHTML = tableOptionsHtml({ readyOnly: true });
            sel.value = cur;
        }
        function fillRelColSel(sel, tId) {
            if (sel.dataset.filled) return; sel.dataset.filled = '1';
            const cur = sel.value; const t = state.tables[tId];
            sel.innerHTML = '<option value="">Choisir colonne...</option>' + (t ? t.headers.map(h => `<option value="${escapeHTML(h)}">${escapeHTML(h)}</option>`).join('') : '');
            sel.value = cur;
        }
        function renderRelationsList() {
            const list = el('relationsList');
            if (!list) return;
            list.innerHTML = '';
            el('emptyStateModel').classList.toggle('hidden', Object.keys(state.tables).length > 0);
            if (!state.relations.length) {
                list.innerHTML = `<div class="p-6 text-center text-slate-400 italic">Aucune liaison définie pour le moment.</div>`;
                return;
            }
            // La liste suit le périmètre choisi (Sources / Tables / Ensemble), comme le graphe.
            const visIds = mcdVisibleIds();
            const scoped = state.relations.filter(r => visIds.has(r.sourceTable) && visIds.has(r.targetTable));
            if (!scoped.length) {
                list.innerHTML = `<div class="p-6 text-center text-slate-400 italic">Aucune liaison dans ce périmètre (${mcdScope() === 'designed' ? 'tables conçues' : 'sources'}) — changez de périmètre au-dessus du graphe pour voir les autres.</div>`;
                return;
            }
            let _rowsHtml = '';
            // Listes déroulantes PARESSEUSES : seule l'option courante est rendue ; la liste
            // complète (potentiellement des centaines de tables/colonnes) n'est construite qu'au
            // premier clic. Divise par ~100 le DOM inséré à l'ouverture de l'onglet.
            scoped.forEach(r => {
                const curOpt = (v, lbl) => v ? `<option value="${escapeHTML(v)}" selected>${escapeHTML(lbl)}</option>` : '<option value="" selected>Choisir...</option>';
                const tblName = id => state.tables[id] ? state.tables[id].name : id;
                const sSelect = `<select class="border p-2 rounded text-sm w-1/2" onfocus="fillRelTableSel(this)" onchange="updateRelation('${r.id}', 'sourceTable', this.value); renderRelationsList()">${curOpt(r.sourceTable, tblName(r.sourceTable))}</select>`;
                const sColSelect = `<select class="border p-2 rounded text-sm w-1/2" onfocus="fillRelColSel(this, '${r.sourceTable}')" onchange="updateRelation('${r.id}', 'sourceCol', this.value)">${curOpt(r.sourceCol, r.sourceCol)}</select>`;
                const tSelect = `<select class="border p-2 rounded text-sm w-1/2" onfocus="fillRelTableSel(this)" onchange="updateRelation('${r.id}', 'targetTable', this.value); renderRelationsList()">${curOpt(r.targetTable, tblName(r.targetTable))}</select>`;
                const tColSelect = `<select class="border p-2 rounded text-sm w-1/2" onfocus="fillRelColSel(this, '${r.targetTable}')" onchange="updateRelation('${r.id}', 'targetCol', this.value)">${curOpt(r.targetCol, r.targetCol)}</select>`;

                // Cardinalité déclarée + nature UML + mesure sur les données réelles
                const m = r.measured;
                const sN = state.tables[r.sourceTable] ? state.tables[r.sourceTable].name : '?';
                const tN2 = state.tables[r.targetTable] ? state.tables[r.targetTable].name : '?';
                const mismatch = r.cardinality && m && m.suggested && r.cardinality !== m.suggested;
                const measuredHtml = m
                    ? `<span class="text-[11px] ${mismatch ? 'text-red-600 font-bold' : 'text-slate-500'}">Mesuré : <strong>${m.suggested}</strong>${mismatch ? ' ⚠️ ≠ déclaré' : ''} — max ${m.tmax} ligne(s) de ${escapeHTML(tN2)} par clé, ${Number(m.sorph).toLocaleString('fr-FR')} ligne(s) de ${escapeHTML(sN)} sans correspondance, ${Number(m.torph).toLocaleString('fr-FR')} orpheline(s) de ${escapeHTML(tN2)}</span>`
                    : '<span class="text-[11px] text-slate-300 italic">cardinalité non mesurée</span>';
                _rowsHtml += `<div class="px-6 py-3 hover:bg-slate-50 border-b border-slate-50">
                    <div class="flex items-center gap-4">
                        <div class="flex gap-2 w-5/12">${sSelect}${sColSelect}</div>
                        <div class="w-2/12 flex justify-center items-center gap-2"><button onclick="deduceRelationRow('${r.id}', this)" class="text-indigo-600 hover:text-indigo-800 p-1.5 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors text-sm leading-none" title="Déduire la table/colonne cible à partir des données (source déjà choisie)">🪄</button><button onclick="removeRelation('${r.id}')" class="text-red-500 hover:text-red-700 p-1.5 bg-red-50 hover:bg-red-100 rounded-lg transition-colors" title="Supprimer ce lien"><i data-lucide="trash-2" class="w-4 h-4"></i></button></div>
                        <div class="flex gap-2 w-5/12">${tSelect}${tColSelect}</div>
                    </div>
                    <div class="flex items-center gap-3 mt-2 flex-wrap pl-1">
                        <label class="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1">Cardinalité
                            <select onchange="updateRelation('${r.id}','cardinality',this.value)" class="border border-slate-200 p-1 rounded text-xs bg-white font-bold">${['', '1-1', '1-N', 'N-1', 'N-N'].map(c => `<option value="${c}" ${(r.cardinality || '') === c ? 'selected' : ''}>${c || '—'}</option>`).join('')}</select>
                        </label>
                        <label class="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1">Nature
                            <select onchange="updateRelation('${r.id}','kind',this.value)" class="border border-slate-200 p-1 rounded text-xs bg-white">${[['', '— association'], ['composition', '◆ composition (fait partie de)'], ['aggregation', '◇ agrégation'], ['reference', '→ référence']].map(([v, l]) => `<option value="${v}" ${(r.kind || '') === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
                        </label>
                        <button onclick="measureRelationCardinality('${r.id}')" id="btn-meas-${r.id}" class="text-[11px] bg-indigo-50 border border-indigo-200 text-indigo-700 px-2.5 py-1 rounded font-bold hover:bg-indigo-100" ${r.sourceCol && r.targetCol ? '' : 'disabled'}>📐 Mesurer sur les données</button>
                        ${measuredHtml}
                    </div>
                </div>`;
            });
            list.innerHTML = _rowsHtml;
            lucide.createIcons();
        }

        // Détecte les tables hiérarchiques : auto-relation (parent dans la même table) ou table de
        // liaison (une table L reliée deux fois à la même table T = arbre externalisé).
        function tableHierarchyInfo() {
            const info = {};
            Object.keys(state.tables).forEach(id => info[id] = { self: null, viaLinks: [], relIds: new Set() });
            state.relations.forEach(r => {
                if (r.sourceCol && r.targetCol && r.sourceTable === r.targetTable && info[r.sourceTable]) { info[r.sourceTable].self = r; info[r.sourceTable].relIds.add(r.id); }
            });
            const pairRels = {};
            state.relations.forEach(r => {
                if (!r.sourceCol || !r.targetCol || r.sourceTable === r.targetTable) return;
                const key = [r.sourceTable, r.targetTable].sort().join('|');
                (pairRels[key] = pairRels[key] || []).push(r);
            });
            Object.entries(pairRels).forEach(([key, rels]) => {
                if (rels.length < 2) return;
                const [x, y] = key.split('|');
                const colsX = new Set(rels.map(r => r.sourceTable === x ? r.sourceCol : r.targetCol));
                const colsY = new Set(rels.map(r => r.sourceTable === y ? r.sourceCol : r.targetCol));
                // Le "sujet" de la hiérarchie est le côté joint deux fois sur la MÊME colonne (sa clé) ;
                // la table de liaison est celle qui porte deux colonnes différentes (enfant/parent).
                let subject = null, link = null;
                if (colsX.size === 1 && colsY.size > 1) { subject = x; link = y; }
                else if (colsY.size === 1 && colsX.size > 1) { subject = y; link = x; }
                if (subject && info[subject]) {
                    info[subject].viaLinks.push({ linkId: link });
                    rels.forEach(r => { info[subject].relIds.add(r.id); if (info[link]) info[link].relIds.add(r.id); });
                }
            });
            return info;
        }
        function isHierTable(info, id) { return !!(info[id] && (info[id].self || info[id].viaLinks.length)); }
        function hierNodeContent(info, id) {
            const h = info[id]; if (!h) return '';
            if (h.self) return `hiérarchie interne (${h.self.sourceCol} ↔ ${h.self.targetCol})`;
            if (h.viaLinks.length) return 'hiérarchie via ' + h.viaLinks.map(v => state.tables[v.linkId] ? state.tables[v.linkId].name : '?').join(', ');
            return '';
        }

        // Export PNG de n'importe quel graphe affiché.
        function exportGraphImage(which) {
            if (which === 'mcd' && mcdIsSvg()) return svgExportImage();
            const map = { mcd: networkInstance, lineage: lineageGraph, model: modelGraph, exp: expNetInstance };
            const g = map[which];
            if (!g) return showError("Affichez d'abord le graphe avant de l'exporter.");
            try { g.downloadFullImage('StudioData_' + which + '_' + Date.now(), 'image/png', { backgroundColor: '#ffffff', padding: [20, 20, 20, 20] }); }
            catch (e) { showError('Export du graphe impossible : ' + e.message); }
        }
        // Export PNG du rendu SVG : on sérialise le SVG à sa taille réelle (bbox) puis on le peint sur un canvas.
        function svgExportImage() {
            try {
                const svg = el('mcdSvg'); if (!svg) return showError("Affichez d'abord le graphe.");
                const ids = Object.keys(svgG.pos); if (!ids.length) return showError('Rien à exporter.');
                let x1 = 1e9, y1 = 1e9, x2 = -1e9, y2 = -1e9;
                ids.forEach(id => { const p = svgG.pos[id], s = svgG.size[id] || [180, 60]; x1 = Math.min(x1, p.x - s[0] / 2); y1 = Math.min(y1, p.y - s[1] / 2); x2 = Math.max(x2, p.x + s[0] / 2); y2 = Math.max(y2, p.y + s[1] / 2); });
                const M = 40, w = Math.ceil(x2 - x1 + 2 * M), h = Math.ceil(y2 - y1 + 2 * M);
                const vp = el('mcdVp').cloneNode(true); vp.setAttribute('transform', `translate(${M - x1},${M - y1})`);
                const out = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs><marker id="svgArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="#94a3b8"/></marker></defs><rect width="${w}" height="${h}" fill="#fff"/>${new XMLSerializer().serializeToString(vp)}</svg>`;
                const img = new Image();
                img.onload = () => { const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(img, 0, 0); const a = document.createElement('a'); a.href = c.toDataURL('image/png'); a.download = 'StudioData_modele_' + Date.now() + '.png'; document.body.appendChild(a); a.click(); a.remove(); };
                img.onerror = () => showError('Export image impossible.');
                img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(out);
            } catch (e) { showError('Export image impossible : ' + e.message); }
        }

        // Symbole UML d'une relation pour les graphes et libellés.
        function relKindSymbol(r) { return r.kind === 'composition' ? '◆' : (r.kind === 'aggregation' ? '◇' : (r.kind === 'reference' ? '→' : '')); }
        function relEdgeLabel(r) {
            const sym = relKindSymbol(r);
            const card = r.cardinality || (r.measured && r.measured.suggested) || '';
            return `${sym ? sym + ' ' : ''}${r.sourceCol} = ${r.targetCol}${card ? ' [' + card + ']' : ''}`;
        }

        // Mesure la cardinalité RÉELLE d'une relation sur les données : multiplicité max de chaque
        // côté et lignes sans correspondance (orphelines) — puis suggère la cardinalité observée.
        async function measureRelation(r) {
            const { conn } = await getDB();
            const keys = (tid, col) => `SELECT NULLIF(UPPER(TRIM(CAST(${sqlIdent(col)} AS VARCHAR))), '') AS k FROM ${sqlIdent(duckTableName(tid))}`;
            const res = await conn.query(`
                WITH sk AS (${keys(r.sourceTable, r.sourceCol)}), tk AS (${keys(r.targetTable, r.targetCol)}),
                sc AS (SELECT k, COUNT(*) AS c FROM sk WHERE k IS NOT NULL GROUP BY 1),
                tc AS (SELECT k, COUNT(*) AS c FROM tk WHERE k IS NOT NULL GROUP BY 1)
                SELECT (SELECT COUNT(*) FROM sk)::BIGINT AS stotal, (SELECT COUNT(*) FROM tk)::BIGINT AS ttotal,
                       (SELECT COALESCE(MAX(c), 0) FROM sc)::BIGINT AS smax, (SELECT COALESCE(MAX(c), 0) FROM tc)::BIGINT AS tmax,
                       (SELECT COALESCE(SUM(sc.c), 0) FROM sc LEFT JOIN tc ON sc.k = tc.k WHERE tc.k IS NULL)::BIGINT AS sorph,
                       (SELECT COALESCE(SUM(tc.c), 0) FROM tc LEFT JOIN sc ON tc.k = sc.k WHERE sc.k IS NULL)::BIGINT AS torph
            `);
            const row = arrowResultToObjects(res)[0];
            const smax = Number(row.smax), tmax = Number(row.tmax);
            return {
                stotal: Number(row.stotal), ttotal: Number(row.ttotal), smax, tmax,
                sorph: Number(row.sorph), torph: Number(row.torph),
                suggested: `${smax <= 1 ? '1' : 'N'}-${tmax <= 1 ? '1' : 'N'}`,
                date: new Date().toISOString(),
            };
        }
        async function measureRelationCardinality(relId) {
            const r = state.relations.find(x => x.id === relId); if (!r || !r.sourceCol || !r.targetCol) return;
            const btn = el('btn-meas-' + relId); if (btn) { btn.disabled = true; btn.textContent = 'Mesure...'; }
            try {
                r.measured = await measureRelation(r);
                if (!r.cardinality) r.cardinality = r.measured.suggested;
                persistAppState(); renderRelationsList(); renderGraph();
            } catch (e) { showError('Mesure impossible : ' + e.message); if (btn) { btn.disabled = false; btn.textContent = '📐 Mesurer sur les données'; } }
        }

        // Le Modèle de données est rendu par le moteur SVG maison (
        // rendu validé — fiable, léger, sans dépendance, et testable automatiquement).
        function renderGraph() {
            const cont = el('networkGraph'); if(!cont || !Object.keys(state.tables).length) return;
            if (networkInstance) { try { networkInstance.destroy(); } catch (e) {} networkInstance = null; }
            try { renderGraphSVG(cont); } catch (e) { console.error('MCD SVG error', e); cont.innerHTML = graphUnavailableHtml('Rendu du modèle impossible : ' + escapeHTML(e.message)); }
            renderMcdControls();
        }
        // Contrôles communs du modèle (périmètre, filtre domaine, boîte à outils).
        function renderMcdControls() {
            const tb = el('mcdToolbar'); if (tb && !tb.innerHTML) tb.innerHTML = graphToolbarHtml('mcd');
            document.querySelectorAll('.mcdScopeWrap').forEach(w => { w.innerHTML = mcdScopeButtonsHtml() + mcdThemeFilterHtml(); });
            document.querySelectorAll('.mcdScopeMsg').forEach(w => {
                const emptyDesigned = mcdScope() === 'designed' && !Object.values(state.tables).some(t => t.type === 'designed');
                w.classList.toggle('hidden', !emptyDesigned);
                w.innerHTML = emptyDesigned ? '🧱 Aucune table conçue pour l\'instant — créez-en une dans l\'onglet <strong>Tables</strong> ; son modèle apparaîtra ici, séparé de celui des sources.' : '';
            });
        }
