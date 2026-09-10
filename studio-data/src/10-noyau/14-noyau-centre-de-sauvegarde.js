        // ======================= V3 UX : CENTRE DE SAUVEGARDE (sorti du menu Gouvernance) =======================
        // Accessible en permanence depuis l'en-tête — panneau latéral : l'écran courant reste visible.
        function openBackupCenter() {
            el('uxDrawer').classList.add('wide');
            openUxDrawer({ sem: '', title: '💾 Sauvegarde & partage', sub: 'Persistance locale automatique · dossier de secours · bundles d\'échange — tout reste sur cette machine',
                body: `<div id="bkStatusUx" class="dsect"></div>` + renderGovShare(), foot: `
                <button onclick="uxSaveNow(this)" class="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg py-2 text-xs font-bold">💾 Sauvegarder maintenant</button>
                <button onclick="closeBackupCenter()" class="flex-1 bg-white border border-slate-300 rounded-lg py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">Fermer (Échap)</button>` });
            renderBkStatusUx();
            try { fillStorageEstimate(); fillBackupsList(); } catch (e) {}
            try { lucide.createIcons({ root: el('uxDrawerBody') }); } catch (e) {}
        }
        function closeBackupCenter() { el('uxDrawer').classList.remove('wide'); closeUxDrawer(); }
        function renderBkStatusUx() {
            const b = el('bkStatusUx'); if (!b) return;
            const saved = (el('persistStatusTop') || { textContent: '' }).textContent.trim();
            const chip = (okState, txt) => `<span class="qual ${okState}" style="font-size:11px">${txt}</span>`;
            b.innerHTML = `<div class="flex items-center gap-2 flex-wrap">
                ${state.noPersist ? chip('q-bad', '⛔ Persistance locale DÉSACTIVÉE — rien n\'est conservé') : chip('q-ok', '✓ Persistance locale active (IndexedDB)')}
                ${saved ? chip('q-ok', escapeHTML(saved)) : ''}
                <span id="bkDirChip">${chip('q-warn', '📂 Dossier de secours : vérification…')}</span>
            </div>`;
            (async () => { try { const h = await idbGet('meta', 'backupDir'); const c2 = el('bkDirChip');
                if (c2) c2.innerHTML = h ? chip('q-ok', '📂 Dossier de secours configuré : ' + escapeHTML(h.name || '')) : chip('q-warn', '📂 Aucun dossier de secours — configurez-le ci-dessous (survit aux purges du navigateur)');
            } catch (e) { const c2 = el('bkDirChip'); if (c2) c2.innerHTML = ''; } })();
        }
        async function uxSaveNow(btn) {
            if (btn) btn.disabled = true;
            try {
                persistAppState();
                try { await fsBackupWrite(true); } catch (e2) {}
                showSuccess('💾 Configuration sauvegardée (IndexedDB' + ' + dossier de secours si configuré).');
                renderBkStatusUx();
            } finally { if (btn) btn.disabled = false; }
        }
        function renderGovShare() {
            const perims = state.governance.perimeters;
            return `
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div class="border border-slate-200 rounded-xl p-5 bg-slate-50/50">
                        <h3 class="text-sm font-bold text-slate-800 mb-1 flex items-center gap-2"><i data-lucide="share-2" class="w-4 h-4 text-indigo-600"></i> Exporter un bundle de partage</h3>
                        <p class="text-xs text-slate-500 mb-4">Un fichier JSON qu'un collègue importe dans sa propre instance de l'application.</p>
                        <div class="mb-3">
                            <label class="flex items-center gap-2 text-sm mb-1.5 cursor-pointer"><input type="radio" name="bundleScope" value="all" checked class="text-indigo-600"> Tout le contenu</label>
                            <label class="flex items-center gap-2 text-sm cursor-pointer"><input type="radio" name="bundleScope" value="perimeter" class="text-indigo-600" ${perims.length ? '' : 'disabled'}> Un périmètre métier :
                                <select id="bundlePerimeter" class="border border-slate-300 p-1.5 rounded text-xs bg-white">${perims.map(p => `<option value="${p.id}">${escapeHTML(p.name)}</option>`).join('') || '<option>Aucun périmètre défini</option>'}</select>
                            </label>
                        </div>
                        <label class="flex items-start gap-2 text-sm mb-4 cursor-pointer"><input type="checkbox" id="bundleIncludeData" class="mt-0.5 text-indigo-600 rounded"><span>Inclure les <strong>données</strong> des tables (format Parquet compressé)<br><span class="text-xs text-slate-400">Décoché : seul le référentiel de gouvernance est exporté (fichier léger).</span></span></label>
                        <button onclick="exportGovernanceBundle()" id="btnExportBundle" class="bg-indigo-600 text-white text-sm font-bold px-4 py-2.5 rounded-lg w-full flex items-center justify-center gap-2"><i data-lucide="download" class="w-4 h-4"></i> Exporter le bundle</button>
                    </div>
                    <div class="border border-slate-200 rounded-xl p-5 bg-slate-50/50">
                        <h3 class="text-sm font-bold text-slate-800 mb-1 flex items-center gap-2"><i data-lucide="hard-drive" class="w-4 h-4 text-indigo-600"></i> Stockage local & import</h3>
                        <p class="text-xs text-slate-500 mb-1.5">Tout est sauvegardé automatiquement dans le navigateur : fichiers, extractions, relations, gouvernance. Rouvrez la page et tout est restauré.</p>
                        <p id="storageEstimate" class="text-xs font-mono text-slate-400 mb-4">Estimation du stockage...</p>
                        <button onclick="el('govImportFile').click()" class="bg-white border border-indigo-300 text-indigo-700 text-sm font-bold px-4 py-2.5 rounded-lg w-full mb-2 flex items-center justify-center gap-2"><i data-lucide="upload" class="w-4 h-4"></i> Importer un bundle reçu</button>
                        <label class="flex items-start gap-2 text-xs mb-2 cursor-pointer bg-amber-50 border border-amber-200 rounded-lg p-2.5"><input type="checkbox" id="noPersistChk" ${state.noPersist ? 'checked' : ''} onchange="toggleNoPersist(this.checked)" class="mt-0.5 text-amber-600 rounded"><span><strong>🔒 Mode sans persistance</strong> (données sensibles / poste partagé)<br><span class="text-slate-500">Rien n'est enregistré sur le poste ; tout est perdu à la fermeture de l'onglet. L'activer purge aussi ce qui a déjà été écrit.</span></span></label>
                        <button onclick="resetLocalStorage(this)" class="bg-white border border-red-200 text-red-600 text-xs font-bold px-4 py-2 rounded-lg w-full">🧹 Effacer toutes les données locales (2 clics)</button>
                        <p class="text-[10px] text-slate-400 mt-1.5">Efface le stockage navigateur <strong>et</strong> les fichiers disque (OPFS) où le moteur garde les données — utile avant de rendre un poste partagé.</p>
                        <div class="mt-3 pt-3 border-t border-slate-200">
                            <h4 class="text-xs font-bold text-slate-700 mb-1">🛟 Sauvegardes de secours</h4>
                            <p id="storageDiag" class="text-[10px] font-mono text-slate-500 mb-1.5">Diagnostic du stockage…</p>
                            <p class="text-[10px] text-slate-400 mb-1.5">À chaque session, l'état précédent (relations, tables conçues, domaines, gouvernance) est archivé — 10 générations. En cas de perte, restaurez ici.</p>
                            <div id="backupsList" class="space-y-1 text-xs text-slate-500">Chargement…</div>
                        </div>
                        <div class="mt-3 pt-3 border-t border-slate-200">
                            <h4 class="text-xs font-bold text-slate-700 mb-1">💾 Sauvegarde automatique sur fichier (recommandé)</h4>
                            <p class="text-[10px] text-slate-400 mb-1.5">La configuration (modèle, tables conçues, domaines, gouvernance) est recopiée dans un dossier de <strong>votre disque</strong> — hors de portée des purges du navigateur. Fichier courant + fichier daté du jour, réécrits au fil du travail.</p>
                            <div id="fsBackupPanel" class="text-xs text-slate-500 mb-2">Chargement…</div>
                            <button onclick="el('cfgImportFile').click()" class="bg-white border border-indigo-300 text-indigo-700 text-xs font-bold px-3 py-1.5 rounded-lg">↩ Restaurer depuis un fichier de sauvegarde…</button>
                            <input type="file" id="cfgImportFile" accept=".json,application/json" class="hidden" onchange="importConfigFile(this)">
                        </div>
                    </div>
                </div>`;
        }
        async function fillBackupsList() {
            const c = el('backupsList'); if (!c) return;
            try {
                const fp = el('fsBackupPanel');
                if (fp) {
                    if (!fsDirSupported()) fp.innerHTML = '<span class="text-slate-400">Non supporté par ce navigateur — utilisez l\'export de bundle ci-contre.</span>';
                    else {
                        let h = null; try { h = await idbGet('meta', 'backupDir'); } catch (e4) {}
                        if (!h) fp.innerHTML = '<button onclick="fsBackupDirPick()" class="bg-indigo-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg">📁 Choisir un dossier de sauvegarde</button>';
                        else {
                            let perm = 'prompt'; try { perm = await h.queryPermission({ mode: 'readwrite' }); } catch (e5) {}
                            fp.innerHTML = `Dossier : <strong>${escapeHTML(h.name)}</strong> — ${perm === 'granted' ? '<span class="text-emerald-600 font-bold">actif ✅</span>' : '<button onclick="fsBackupReauth()" class="bg-amber-500 text-white text-xs font-bold px-2 py-1 rounded">🔓 Réautoriser l\'accès</button>'} <button onclick="fsBackupDisable()" class="text-slate-400 hover:text-red-500 ml-2">✕ désactiver</button><span id="fsBackupStatus"></span>`;
                        }
                    }
                }
                const dg = el('storageDiag');
                if (dg) {
                    try {
                        const ks = await idbKeys('tabledata');
                        const st2 = await idbGet('meta', 'appState');
                        const bk = (await idbGet('meta', 'appStateBackups')) || [];
                        dg.textContent = `Sur ce poste : ${(ks || []).length} source(s) stockée(s) · configuration ${st2 ? 'du ' + new Date(st2.savedAt || 0).toLocaleString('fr-FR') + ' (' + cfgRichness(st2) + ' élément(s))' : 'ABSENTE'} · ${bk.length} sauvegarde(s) de secours`;
                    } catch (e3) { dg.textContent = 'Diagnostic du stockage impossible : ' + String(e3.message || e3); }
                }
                const list = (await idbGet('meta', 'appStateBackups')) || [];
                if (!list.length) { c.textContent = 'Aucune sauvegarde de secours pour le moment.'; return; }
                c.innerHTML = list.map((b, i) => `<div class="flex items-center gap-2 bg-white border border-slate-200 rounded px-2 py-1"><span class="font-mono">${escapeHTML(new Date(b.at).toLocaleString('fr-FR'))}</span><span class="text-slate-400">${cfgRichness(b.cfg)} élément(s) de configuration</span><button onclick="restoreBackup(${i}, this)" class="ml-auto px-2 py-0.5 rounded font-bold bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100">Restaurer</button></div>`).join('');
            } catch (e) { c.textContent = 'Lecture des sauvegardes impossible : ' + String(e.message || e); }
        }
        async function restoreBackup(i, btn) {
            try {
                const list = (await idbGet('meta', 'appStateBackups')) || [];
                const b = list[i]; if (!b) return;
                if (btn && !btn.dataset.armed) { btn.dataset.armed = '1'; btn.textContent = 'Confirmer ?'; setTimeout(() => { if (btn.isConnected) { delete btn.dataset.armed; btn.textContent = 'Restaurer'; } }, 4000); return; }
                applyPersistedConfig(b.cfg);
                restoreCompleted = true; sessionBackupDone = true;
                await idbPut('meta', 'appState', b.cfg);
                renderTables(); updateBaseTableSelect(); populateQualTables(); renderGovernance();
                showSuccess('🛟 Sauvegarde du ' + new Date(b.at).toLocaleString('fr-FR') + ' restaurée (modèle, tables conçues, domaines, gouvernance).');
            } catch (e) { showError('Restauration de la sauvegarde impossible : ' + String(e.message || e)); }
        }
        async function fillStorageEstimate() {
            try {
                if (navigator.storage && navigator.storage.estimate) {
                    const e = await navigator.storage.estimate();
                    const mb = v => (v / 1024 / 1024).toFixed(1) + ' Mo';
                    const s = el('storageEstimate'); if (s) s.textContent = `Utilisé : ${mb(e.usage || 0)} / Quota : ${mb(e.quota || 0)}`;
                }
            } catch (e) {}
        }
        // Purge COMPLÈTE : IndexedDB (config + données) ET les fichiers OPFS où DuckDB stocke la base
        // et les débordements — sans quoi des données resteraient en clair sur le disque après un "reset".
        async function wipeOpfsData() {
            try {
                if (!(navigator.storage && navigator.storage.getDirectory)) return;
                const root = await navigator.storage.getDirectory();
                for (const name of ['studio_data.db', 'studio_data.db.wal', 'studio_tmp']) {
                    try { await root.removeEntry(name, { recursive: true }); } catch (e) {}
                }
            } catch (e) { console.warn('Purge OPFS partielle :', e); }
        }
        async function resetLocalStorage(btn) {
            if (!govState.resetArmed) { govState.resetArmed = true; btn.textContent = '⚠️ Cliquez à nouveau pour TOUT effacer (données incluses)'; setTimeout(() => { govState.resetArmed = false; if (btn.isConnected) btn.textContent = '🧹 Effacer toutes les données locales (2 clics)'; }, 4000); return; }
            govState.resetArmed = false;
            if (btn) btn.disabled = true;
            try {
                await idbClear('meta'); await idbClear('tabledata');
                await wipeOpfsData();
                showSuccess('✅ Toutes les données locales ont été effacées (stockage + disque). Rechargez la page pour repartir de zéro.');
            } catch (e) { showError('Effacement incomplet : ' + e.message); }
            finally { if (btn) btn.disabled = false; }
        }
        // Mode sans persistance : bascule à chaud. En l'activant, on purge ce qui a déjà été écrit,
        // pour ne rien laisser sur le poste (idéal données sensibles / poste partagé).
        async function toggleNoPersist(on) {
            if (on) {
                const okGo = confirm("⚠️ ATTENTION : activer le mode sans persistance EFFACE DÉFINITIVEMENT tout ce qui est enregistré sur ce poste (sources, tables conçues, modèle, gouvernance ET sauvegardes de secours).\n\nContinuer ?");
                if (!okGo) { const c = el('noPersistChk'); if (c) c.checked = false; return; }
            }
            state.noPersist = !!on;
            if (on) { try { await idbClear('meta'); await idbClear('tabledata'); await wipeOpfsData(); } catch (e) {} showSuccess('🔒 Mode sans persistance activé : rien n\'est enregistré sur le poste ; tout disparaît à la fermeture de l\'onglet.'); }
            else { showSuccess('💾 Persistance réactivée : le travail sera de nouveau sauvegardé localement.'); persistAppState(); }
            renderGovernance();
        }

        function filterGovernanceToScope(scopeTables) {
            const g = state.governance; const inScope = n => scopeTables.includes(n);
            return {
                perimeters: g.perimeters.map(p => ({ ...p, tables: (p.tables || []).filter(inScope) })).filter(p => p.tables.length || scopeTables.length === readyTableNames().length),
                dictionary: Object.fromEntries(Object.entries(g.dictionary).filter(([n]) => inScope(n))),
                glossary: g.glossary,
                useCases: g.useCases.filter(uc => (uc.tables || []).some(inScope) || (uc.columns || []).some(c => inScope(c.table)) || scopeTables.length === readyTableNames().length),
                businessObjects: g.businessObjects.filter(bo => (bo.elements || []).some(e2 => (e2.mappings || []).some(m => inScope(m.table))) || scopeTables.length === readyTableNames().length),
                lineage: Object.fromEntries(Object.entries(g.lineage).filter(([n]) => inScope(n))),
                qualityHistory: g.qualityHistory.filter(e => inScope(e.table)),
                assets: g.assets || [],
                rules: (g.rules || []).filter(r => inScope(r.parentTable) || inScope(r.childTable) || scopeTables.length === readyTableNames().length),
            };
        }

        async function exportGovernanceBundle() {
            hideError();
            const scopeMode = document.querySelector('input[name="bundleScope"]:checked').value;
            let scopeTables = readyTableNames();
            let scopeLabel = 'complet';
            if (scopeMode === 'perimeter') {
                const p = state.governance.perimeters.find(x => x.id === el('bundlePerimeter').value);
                if (!p) return showError('Sélectionnez un périmètre.');
                scopeTables = (p.tables || []).filter(n => readyTableNames().includes(n));
                scopeLabel = p.name;
                if (!scopeTables.length) return showError('Ce périmètre ne contient aucune table chargée.');
            }
            const includeData = el('bundleIncludeData').checked;
            const btn = el('btnExportBundle'); btn.disabled = true;
            try {
                const cfg = collectPersistedConfig();
                const bundle = {
                    format: 'studio-data-gouv-bundle', version: 1, exportedAt: new Date().toISOString(), scope: scopeLabel,
                    governance: filterGovernanceToScope(scopeTables),
                    config: { relations: cfg.relations.filter(r => scopeTables.includes(r.sourceTable) && scopeTables.includes(r.targetTable)) },
                    tables: [],
                };
                for (const name of scopeTables) {
                    const t = tableByName(name); if (!t) continue;
                    const entry = { name: t.name, type: t.type, headers: t.headers.slice() };
                    if (includeData) entry.parquetBase64 = bufToBase64(await exportTableParquet(t.id));
                    bundle.tables.push(entry);
                }
                const blob = new Blob([JSON.stringify(bundle)], { type: 'application/json' });
                const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
                a.download = `StudioData_Bundle_${scopeLabel.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.json`;
                document.body.appendChild(a); a.click(); a.remove();
                showSuccess(`Bundle "${scopeLabel}" exporté (${bundle.tables.length} table(s)${includeData ? ' avec données' : ', métadonnées seules'}).`);
            } catch (e) { showError('Export du bundle échoué : ' + e.message); }
            finally { btn.disabled = false; }
        }

        async function importGovernanceBundle(e) {
            const file = e.target.files[0]; if (!file) return;
            try {
                const bundle = JSON.parse(await readFileAsText(file));
                if (bundle.format !== 'studio-data-gouv-bundle') throw new Error('Ce fichier n\'est pas un bundle Studio Data.');
                let importedTables = 0;
                for (const rec of bundle.tables || []) {
                    if (tableByName(rec.name)) continue;
                    if (!rec.parquetBase64) continue;
                    const tId = 'tb_' + generateId();
                    state.tables[tId] = { id: tId, name: rec.name, file: null, type: rec.type === 'api' ? 'api' : 'extraction', size: 0, config: {}, headers: [], columnsMeta: {}, status: 'loading' };
                    renderTables();
                    const headers = await ingestParquetIntoDuckDB(tId, base64ToBuf(rec.parquetBase64));
                    const t = state.tables[tId];
                    t.headers = headers; t.sampleData = await duckSampleRows(tId, 6); t.status = 'ready';
                    await persistTableData(tId);
                    importedTables++;
                }
                const g = state.governance, ig = normalizeGovernance(bundle.governance || {});
                ig.perimeters.forEach(ip => { const ex = g.perimeters.find(p => p.name === ip.name); if (ex) { ex.tables = Array.from(new Set([...(ex.tables || []), ...(ip.tables || [])])); if (ip.description) ex.description = ip.description; } else g.perimeters.push(ip); });
                Object.keys(ig.dictionary).forEach(n => { g.dictionary[n] = ig.dictionary[n]; });
                ig.glossary.forEach(it => { const ex = g.glossary.find(x => x.term === it.term); if (ex) { if (it.definition) ex.definition = it.definition; ex.links = [...(ex.links || []), ...(it.links || []).filter(l => !(ex.links || []).some(e2 => e2.table === l.table && e2.col === l.col))]; } else g.glossary.push(it); });
                ig.useCases.forEach(it => { const ex = g.useCases.find(x => x.name === it.name); if (ex) Object.assign(ex, it, { id: ex.id }); else g.useCases.push(it); });
                const asMap = {};
                (ig.assets || []).forEach(it => {
                    let ex = (g.assets || []).find(x => String(x.name).trim().toLowerCase() === String(it.name).trim().toLowerCase());
                    if (ex) { if (it.owner && !ex.owner) ex.owner = it.owner; if (it.domain && !ex.domain) ex.domain = it.domain; if (it.criticality) ex.criticality = it.criticality; if (it.description && !ex.description) ex.description = it.description;
                        ex.tables = Array.from(new Set([...(ex.tables || []), ...(it.tables || [])]));
                        ex.columns = [...(ex.columns || [])]; (it.columns || []).forEach(c2 => { if (!ex.columns.some(x => x.table === c2.table && x.col === c2.col)) ex.columns.push(c2); });
                    } else { ex = { ...it, id: 'as_' + generateId() }; g.assets.push(ex); }
                    asMap[it.id] = ex.id;
                });
                (g.assets || []).forEach(a => { if (a.appIds) a.appIds = a.appIds.map(id => asMap[id] || id); });
                migrateUseCasesToAssets(g);
                ig.businessObjects.forEach(it => { const ex = g.businessObjects.find(x => x.name === it.name); if (ex) Object.assign(ex, it, { id: ex.id }); else g.businessObjects.push(it); });
                Object.keys(ig.lineage).forEach(n => { g.lineage[n] = ig.lineage[n]; });
                (ig.rules || []).forEach(ir => { const sig = r2 => [r2.parentTable, r2.parentCol, r2.childTable, r2.childCol, JSON.stringify(r2.cond || null), r2.expect, r2.n].join('|'); if (!(g.rules || []).some(r2 => r2.id === ir.id || sig(r2) === sig(ir))) g.rules.push(ir); });
                const knownTs = new Set(g.qualityHistory.map(h => h.ts));
                ig.qualityHistory.forEach(h => { if (!knownTs.has(h.ts)) g.qualityHistory.push(h); });
                g.qualityHistory.sort((a, b) => b.ts - a.ts); if (g.qualityHistory.length > 300) g.qualityHistory.length = 300;
                persistQualityHistory();
                const idOf = n => Object.keys(state.tables).find(i => state.tables[i].name === n);
                ((bundle.config || {}).relations || []).forEach(r => {
                    const s = idOf(r.sourceTable), t = idOf(r.targetTable);
                    if (s && t) addPredefinedRelation(s, r.sourceCol, t, r.targetCol);
                });
                persistAppState();
                renderTables(); updateBaseTableSelect(); populateQualTables(); renderGovernance();
                if (Object.keys(state.tables).length) el('emptyStateSources').classList.add('hidden');
                showSuccess(`Bundle importé : ${importedTables} table(s) avec données, référentiel de gouvernance fusionné.`);
            } catch (err) { showError('Import du bundle échoué : ' + err.message); }
            e.target.value = '';
        }

        function readFileAsArrayBuffer(file) {
            return new Promise((resolve, reject) => {
                const r = new FileReader();
                r.onload = e => resolve(e.target.result);
                r.onerror = err => reject(err);
                r.readAsArrayBuffer(file);
            });
        }

        // Toute table chargée (fichier ou source dérivée) est ingérée une fois dans DuckDB au moment
        // de son ajout (voir ingestFileTable/ingestRowsIntoDuckDB) ; la lecture se fait donc toujours
        // par lots depuis DuckDB, quel que soit le type d'origine (csv/txt/xlsx/api/extraction).
        async function processDataStream(table, limit, onRow, onProgress) {
            await duckStreamRows(table.id, limit, onRow, onProgress);
        }


        function readFileAsText(file) {
            return new Promise((resolve, reject) => {
                const r = new FileReader(); r.onload = e => resolve(e.target.result); r.onerror = err => reject(err); r.readAsText(file);
            });
        }

