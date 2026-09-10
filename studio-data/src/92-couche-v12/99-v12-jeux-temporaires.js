        // ======================= V12 : JEUX TEMPORAIRES (résultats et fichiers de la session, sans créer de source) =======================
        // Un « jeu temporaire » est un tableau chargé dans le moteur pour la session : résultat d'une extraction,
        // fichier extérieur déposé, écarts d'une comparaison, anomalies d'un audit. Il est proposé dans tous les
        // sélecteurs de table (groupe « ⏳ Jeux temporaires »), donc utilisable dans Comparer, Qualité, Statistiques,
        // Explorer, Extraire, Tableaux de bord… mais il n'apparaît ni dans Sources, ni dans le modèle, ni dans les
        // sauvegardes, ni dans la gouvernance. Il disparaît à la fermeture, sauf s'il est promu en source.
        //
        // Technique : le jeu est rangé dans state.tables[id] comme propriété NON ÉNUMÉRABLE. Tout le code qui
        // lit state.tables[id] (en-têtes, nom, moteur) fonctionne ; tout ce qui énumère state.tables
        // (liste des sources, modèle, persistance, sauvegarde, catalogue, palette) l'ignore de lui-même.
        v12State.tmpIds = v12State.tmpIds || [];
        const V12_TMP_SELECTS = ['baseTableSelect', 'vizBaseTable', 'expBaseTable', 'expConfigTable', 'browserTableSelect', 'compTableA', 'compTableB', 'qualTable'];
        function v12TmpList() { return v12State.tmpIds.map(id => state.tables[id]).filter(t => t && t.temp); }
        function v12TmpIs(id) { const t = id && state.tables[id]; return !!(t && t.temp); }
        function v12TmpKindLabel(t) { return { extract: 'Extraction', file: 'Fichier extérieur', compare: 'Comparaison', audit: 'Audit' }[t.tmpKind] || 'Jeu'; }
        function v12TmpRegister(t) {
            t.temp = true; t.status = 'ready'; t.config = t.config || {}; t.columnsMeta = t.columnsMeta || {}; t.file = null; t.createdAt = t.createdAt || Date.now();
            Object.defineProperty(state.tables, t.id, { value: t, enumerable: false, configurable: true, writable: true });
            if (!v12State.tmpIds.includes(t.id)) v12State.tmpIds.push(t.id);
            v12TmpRefresh();
            return t;
        }
        function v12TmpUniqueName(name) { const base = (name || 'Jeu').trim() || 'Jeu'; const taken = new Set([...Object.values(state.tables), ...v12TmpList()].map(t => t.name)); let n = base, i = 2; while (taken.has(n)) n = base + ' (' + (i++) + ')'; return n; }
        // ---- création ----
        async function v12TmpFromSql(sql, name, meta) {
            const id = 'tmp_' + generateId(); meta = meta || {};
            const { conn } = await getDB();
            await conn.query(`CREATE OR REPLACE TABLE ${sqlIdent(duckTableName(id))} AS SELECT ROW_NUMBER() OVER () AS __rn, * FROM (${sql}) q`);
            return v12TmpFinish(id, name, meta);
        }
        async function v12TmpFromRows(cols, rows, name, meta) {
            const id = 'tmp_' + generateId(); meta = meta || {};
            const { db, conn } = await getDB();
            const vn = 'jeu_' + id + '.ndjson'; try { if (db.dropFile) await db.dropFile(vn); } catch (e) {}
            const nd = rows.map(rw => { const o = {}; cols.forEach((c, i) => { const v = rw[i]; o[c] = (v === undefined || v === null) ? null : String(v); }); return JSON.stringify(o); }).join('\n');
            await db.registerFileText(vn, nd);
            const colSpec = '{' + cols.map(h => `${sqlLiteral(h)}: 'VARCHAR'`).join(', ') + '}';
            await conn.query(`CREATE OR REPLACE TABLE ${sqlIdent(duckTableName(id))} AS SELECT row_number() OVER () AS __rn, * FROM read_json(${sqlLiteral(vn)}, columns=${colSpec}, format='newline_delimited')`);
            return v12TmpFinish(id, name, meta);
        }
        async function v12TmpFromTable(srcId, name, meta, whereSql) {
            const id = 'tmp_' + generateId(); meta = meta || {};
            const { conn } = await getDB();
            await conn.query(`CREATE OR REPLACE TABLE ${sqlIdent(duckTableName(id))} AS SELECT ROW_NUMBER() OVER () AS __rn, * EXCLUDE (__rn) FROM ${sqlIdent(duckTableName(srcId))}${whereSql ? ' WHERE ' + whereSql : ''}`);
            return v12TmpFinish(id, name, meta);
        }
        async function v12TmpFinish(id, name, meta) {
            const { conn } = await getDB();
            const headers = await duckTableHeaders(id);
            const n = Number(arrowResultToObjects(await conn.query(`SELECT COUNT(*)::BIGINT AS n FROM ${sqlIdent(duckTableName(id))}`))[0].n);
            const t = { id, name: v12TmpUniqueName(name), type: 'extraction', size: n, rows: n, headers, sampleData: await duckSampleRows(id, 5), tmpKind: meta.kind || 'extract', origin: meta.origin || '', originFrom: meta.from || [] };
            v12TmpRegister(t);
            v11Toast(`⏳ Jeu temporaire « ${t.name} » prêt : ${n.toLocaleString('fr-FR')} ligne(s). Utilisable dans Comparer, Qualité, Statistiques, Explorer, Extraire — sans créer de source.`, 'ok', { action: () => v12TmpOpen(), actionLabel: 'Voir les jeux' });
            return t;
        }
        // ---- suppression, promotion, export ----
        async function v12TmpDelete(id, silent) {
            const t = state.tables[id]; if (!t || !t.temp) return;
            if (!silent && !confirm(`Supprimer le jeu temporaire « ${t.name} » ?`)) return;
            try { await duckDropTable(id); } catch (e) {}
            delete state.tables[id]; v12State.tmpIds = v12State.tmpIds.filter(x => x !== id);
            document.querySelectorAll('select').forEach(s => { Array.from(s.options).forEach(o => { if (o.value === id) o.remove(); }); });
            v12TmpRefresh(); if (!silent) v11Toast(`Jeu temporaire « ${t.name} » supprimé.`, 'info');
        }
        async function v12TmpPromote(id) {
            const t = state.tables[id]; if (!t || !t.temp) return;
            const name = (prompt('Nom de la nouvelle source :', t.name) || '').trim(); if (!name) return;
            if (typeof tableByName === 'function' && tableByName(name)) return showError(`Une source « ${name} » existe déjà.`);
            delete state.tables[id]; v12State.tmpIds = v12State.tmpIds.filter(x => x !== id);
            t.temp = false; t.name = name; t.type = 'extraction'; state.tables[id] = t;
            if (t.originFrom && t.originFrom.length) state.governance.lineage[name] = { from: t.originFrom.slice(), date: new Date().toISOString(), note: t.origin || '' };
            const es = el('emptyStateSources'); if (es) es.classList.add('hidden');
            ['renderTables', 'updateBaseTableSelect', 'updateVizBaseTableSelect', 'populateQualTables', 'populateCompareTables', 'populateBrowserTableSelect', 'populateExpTableSelect'].forEach(fn => { try { if (typeof window[fn] === 'function') window[fn](); } catch (e) {} });
            try { await persistTableData(id); persistAppState(); } catch (e) {}
            v12TmpRefresh();
            v11Toast(`Source « ${name} » créée à partir du jeu temporaire (${(t.rows || 0).toLocaleString('fr-FR')} lignes).`, 'ok', { action: () => switchTab(1), actionLabel: 'Voir les sources' });
        }
        async function v12TmpExport(id) {
            const t = state.tables[id]; if (!t) return;
            try {
                const parts = [t.headers.map(advCsvCell).join(';') + '\n'];
                await duckStreamRows(id, 0, row => { parts.push(t.headers.map(h => advCsvCell(row[h])).join(';') + '\n'); });
                const blob = new Blob(['﻿', ...parts], { type: 'text/csv;charset=utf-8;' });
                const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = t.name.replace(/[^\w.-]+/g, '_') + '.csv'; document.body.appendChild(a); a.click(); a.remove();
            } catch (e) { showError('Export impossible : ' + e.message); }
        }
        function v12TmpRename(id, name) { const t = state.tables[id]; if (!t || !t.temp) return; name = (name || '').trim(); if (!name || name === t.name) return; t.name = v12TmpUniqueName(name); v12TmpRefresh(); }
        // ---- utiliser dans un écran ----
        function v12TmpUse(id, where) {
            const set = (sid, fn) => { const s = el(sid); if (!s) return; v12TmpDecorate(); s.value = id; if (s.value === id && fn) fn(); };
            v11ModalClose();
            if (where === 'comp') { switchTab(7); v12TmpDecorate(); const a = el('compTableA'); const prev = (a && a.value) || (state.tables[v12State.tmpCompA] ? v12State.tmpCompA : ''); if (prev && prev !== id) { set('compTableA', () => handleCompTableChange('A')); a.value = prev; handleCompTableChange('A'); set('compTableB', () => handleCompTableChange('B')); } else { v12State.tmpCompA = id; set('compTableA', () => handleCompTableChange('A')); } }
            else if (where === 'audit') { switchTab(8); set('qualTable', () => handleQualTableChange()); }
            else if (where === 'explore') { switchTab(6); set('browserTableSelect', () => handleBrowserTableChange()); }
            else if (where === 'stats') { switchTab(4); set('vizBaseTable', () => handleVizBaseTableChange()); }
            else if (where === 'extract') { switchTab(3); set('baseTableSelect', () => handleBaseTableChange()); }
            else if (where === 'x360') { switchTab(5); set('expBaseTable', () => populateExpColumns()); }
        }
        // ---- sélecteurs : un groupe « Jeux temporaires » ajouté à chaque liste de tables ----
        function v12TmpDecorate() {
            if (v12State.tmpDecorating) return; v12State.tmpDecorating = true;
            try {
                const tmp = v12TmpList();
                document.querySelectorAll('select').forEach(s => {
                    if (s.dataset.v12tmp === 'no' || s.closest('.v12t-modal')) return;
                    const own = Array.from(s.querySelectorAll(':scope > option')).map(o => o.value).filter(Boolean);
                    const isTableSel = V12_TMP_SELECTS.includes(s.id) || (own.length && own.every(v => state.tables[v] && !state.tables[v].temp && Object.prototype.propertyIsEnumerable.call(state.tables, v)));
                    if (!isTableSel) return;
                    let g = s.querySelector('optgroup.v12-tmpgrp');
                    const want = tmp.map(t => t.id + '' + t.name).join('');
                    if (g && g.dataset.sig === want) return;
                    if (!tmp.length) { if (g) g.remove(); return; }
                    const cur = s.value;
                    if (!g) { g = document.createElement('optgroup'); g.className = 'v12-tmpgrp'; g.label = '⏳ Jeux temporaires (session)'; s.appendChild(g); }
                    g.innerHTML = tmp.map(t => `<option value="${t.id}">⏳ ${escapeHTML(t.name)}</option>`).join(''); g.dataset.sig = want;
                    if (cur) s.value = cur;
                });
            } finally { v12State.tmpDecorating = false; }
        }
        try {
            const mo = new MutationObserver(() => { if (v12State.tmpDecorating || !v12State.tmpIds.length) return; clearTimeout(v12State.tmpDecoT); v12State.tmpDecoT = setTimeout(v12TmpDecorate, 80); });
            mo.observe(document.body, { childList: true, subtree: true });
        } catch (e) {}
        // ---- bouton en haut + fenêtre ----
        function v12TmpTopBtn() {
            let b = el('v12TmpBtn');
            if (!b) { const host = el('v11Hist') && el('v11Hist').parentNode; if (!host) return; b = document.createElement('button'); b.id = 'v12TmpBtn'; b.className = 'v11-topbtn v12-tmpbtn'; b.title = 'Jeux temporaires : résultats et fichiers de la session, utilisables partout sans devenir des sources'; b.onclick = () => v12TmpOpen(); host.insertBefore(b, el('v11Hist').nextSibling); }
            const n = v12TmpList().length; b.innerHTML = `<span>⏳</span><span class="lbl">Jeux</span>${n ? `<span class="n">${n}</span>` : ''}`; b.classList.toggle('has', n > 0);
        }
        function v12TmpRefresh() { try { v12TmpTopBtn(); } catch (e) {} try { v12TmpDecorate(); } catch (e) {} if (el('v12TmpList')) v12TmpRenderList(); try { const n = currentTab; if (n && el('step-' + n)) v12EmptyBand(n); } catch (e) {} }
        function v12TmpOpen() {
            const d = v11ModalOpen(`
                <div class="flex items-start justify-between gap-3"><div><h3>⏳ Jeux temporaires</h3><p class="text-xs" style="color:var(--v7-muted);margin:4px 0 0">Résultats et fichiers gardés <b>pour la session</b>, utilisables dans tous les écrans (Comparer, Qualité, Statistiques, Explorer, Extraire…) <b>sans devenir des sources</b>. Ils disparaissent à la fermeture, sauf si vous les promouvez en source.</p></div><button class="v11-btn sm" onclick="v11ModalClose()">✕</button></div>
                <div class="v12t-bar"><button class="v11-btn pri sm" onclick="v12TmpFileOpen()">📄 Ajouter un fichier extérieur</button><span class="v12t-how">Aussi : <b>Extraire</b> → « Garder comme jeu temporaire » · <b>Comparer</b> → garder les écarts · <b>Qualité</b> → garder les anomalies</span></div>
                <div id="v12TmpList"></div>`);
            d.classList.add('v12t-modal'); d.querySelector('.box').classList.add('v12t-box');
            v12TmpRenderList();
        }
        function v12TmpRenderList() {
            const box = el('v12TmpList'); if (!box) return; const tmp = v12TmpList();
            if (!tmp.length) { box.innerHTML = `<div class="v12t-empty">Aucun jeu temporaire pour l'instant.<br><span>Un exemple : filtrez une extraction sur un fichier reçu, gardez le résultat ici, puis auditez-le ou comparez-le au fichier d'origine — sans rien ajouter aux sources.</span></div>`; return; }
            box.innerHTML = tmp.map(t => `<div class="v12t-row" data-id="${t.id}">
                <div class="v12t-main"><input class="v12t-name" value="${escapeHTML(t.name)}" onchange="v12TmpRename('${t.id}', this.value)" title="Renommer"><div class="v12t-sub"><span class="v12t-kind">${v12TmpKindLabel(t)}</span> ${escapeHTML(t.origin || '')}</div><div class="v12t-meta">${(t.rows || 0).toLocaleString('fr-FR')} ligne(s) · ${(t.headers || []).length} colonne(s) · ${new Date(t.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</div></div>
                <div class="v12t-acts"><div class="v12t-use"><span>Utiliser dans</span>${[['comp', 'Comparer'], ['audit', 'Qualité'], ['stats', 'Statistiques'], ['explore', 'Explorer'], ['extract', 'Extraire']].map(([w, l]) => `<button class="v11-btn sm" onclick="v12TmpUse('${t.id}','${w}')">${l}</button>`).join('')}</div>
                <div class="v12t-more"><button class="v11-btn sm" onclick="v12TmpExport('${t.id}')" title="Télécharger en CSV">⬇ CSV</button><button class="v11-btn sm" onclick="v12TmpPromote('${t.id}')" title="En faire une vraie source, conservée et documentée">↑ Promouvoir en source</button><button class="v11-btn sm danger" onclick="v12TmpDelete('${t.id}')" title="Supprimer ce jeu">✕</button></div></div>
            </div>`).join('');
        }
        // ---- fichier extérieur → jeu temporaire ----
        function v12TmpFileOpen(cb) {
            v12State.tmpFileCb = cb || null; v12State.tmpFileRaw = null;
            v11ModalOpen(`
                <div class="flex items-start justify-between gap-3"><div><h3>📄 Fichier extérieur</h3><p class="text-xs" style="color:var(--v7-muted);margin:4px 0 0">Un fichier reçu (Excel, CSV, texte) à utiliser tout de suite — comparer, auditer, explorer — <b>sans l'ajouter aux sources</b>.</p></div><button class="v11-btn sm" onclick="v11ModalClose()">✕</button></div>
                <div class="v12l-in">
                    <label class="v12l-drop" id="v12tDrop"><input type="file" accept=".csv,.txt,.tsv,.xlsx,.xls,.xlsm" style="display:none" onchange="v12TmpFileChosen(this.files[0])"><b>Déposer un fichier ici</b><span>Excel, CSV ou texte — ou cliquer pour choisir</span></label>
                    <div class="v12l-or">ou</div>
                    <div><textarea id="v12tPaste" rows="4" placeholder="Collez un tableau copié depuis Excel" oninput="v12TmpPasteChanged()"></textarea><label class="v12l-opt"><input type="checkbox" id="v12tHeader" checked onchange="v12TmpFilePreview()"> la première ligne contient les en-têtes</label></div>
                </div>
                <div id="v12tBody"></div>`);
            const dz = el('v12tDrop'); if (dz) { dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('over'); }); dz.addEventListener('dragleave', () => dz.classList.remove('over')); dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('over'); const fl = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (fl) v12TmpFileChosen(fl); }); }
        }
        async function v12TmpFileChosen(file) { if (!file) return; try { const aoa = await v12ListParseFile(file); if (!aoa.length) return showError('Le fichier est vide.'); v12State.tmpFileRaw = aoa; v12State.tmpFileName = file.name.replace(/\.[^.]+$/, ''); v12TmpFilePreview(); } catch (e) { showError('Lecture impossible : ' + e.message); } }
        function v12TmpPasteChanged() { const t = el('v12tPaste'); if (!t || !t.value.trim()) return; v12State.tmpFileRaw = v12ListParseText(t.value); v12State.tmpFileName = 'Tableau collé'; v12TmpFilePreview(); }
        function v12TmpFilePreview() {
            const box = el('v12tBody'); const aoa = v12State.tmpFileRaw; if (!box || !aoa) return;
            const hh = el('v12tHeader'); const { cols, rows } = v12ListShape(aoa, !hh || hh.checked); v12State.tmpFileShaped = { cols, rows };
            box.innerHTML = `<div class="v12l-meta"><b>${escapeHTML(v12State.tmpFileName)}</b> · ${rows.length.toLocaleString('fr-FR')} ligne(s) · ${cols.length} colonne(s) <input type="text" class="v12l-name" id="v12tName" value="${escapeHTML(v12State.tmpFileName)}" title="Nom du jeu"></div>
                <div class="overflow-x-auto" style="border:1px solid var(--v11-line);border-radius:10px"><table class="v11-tbl"><thead><tr>${cols.map(c => `<th>${escapeHTML(c)}</th>`).join('')}</tr></thead><tbody>${rows.slice(0, 5).map(r => `<tr>${r.map(v => `<td>${escapeHTML(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
                <div class="v12l-foot"><button class="v11-btn" onclick="v11ModalClose()">Annuler</button><button class="v11-btn pri" onclick="v12TmpFileConfirm()">Garder comme jeu temporaire</button></div>`;
        }
        async function v12TmpFileConfirm() {
            const sh = v12State.tmpFileShaped; if (!sh) return; const name = (el('v12tName') && el('v12tName').value.trim()) || v12State.tmpFileName; const cb = v12State.tmpFileCb;
            v11ModalClose();
            try { const t = await v12TmpFromRows(sh.cols, sh.rows, name, { kind: 'file', origin: 'fichier déposé, non ajouté aux sources' }); if (cb) cb(t.id); }
            catch (e) { showError('Impossible de charger le fichier dans le moteur : ' + e.message); }
        }
        // ---- Extraire : les jeux temporaires comptent comme des tables le temps du rendu (sinon « chargez une source ») ----
        function v12TmpVisible(fn) { const ids = v12State.tmpIds.filter(id => state.tables[id] && state.tables[id].temp); ids.forEach(id => { const t = state.tables[id]; delete state.tables[id]; state.tables[id] = t; }); try { return fn(); } finally { ids.forEach(id => { const t = state.tables[id]; if (!t) return; delete state.tables[id]; Object.defineProperty(state.tables, id, { value: t, enumerable: false, configurable: true, writable: true }); }); } }
        Studio.extend('renderAdvExtract', (_v12tRenderAdv) => function () { const args = arguments; return v12TmpVisible(() => _v12tRenderAdv.apply(this, args)); });
        // ---- Extraire : « Garder comme jeu temporaire » ----
        async function v12TmpFromExtract() {
            const r = advCurrentSql(); if (r.err) return showError(r.err); if (!r.sql) return showError('Requête SQL vide.');
            if (typeof v12ListEnsure === 'function' && !(await v12ListEnsure())) return;
            const s = state.advExtract; const base = state.tables[s.baseId] || {};
            const from = []; new Set([s.baseId, ...s.columns.map(c => c.tableId), ...s.filters.map(f => f.tableId)]).forEach(id => { if (state.tables[id] && !state.tables[id].temp) from.push(state.tables[id].name); });
            const lists = (typeof v12ListFilters === 'function' ? v12ListFilters() : []).map(f => f.list.name);
            const origin = `extraction de ${base.name || '?'} · ${s.columns.length} colonne(s) · ${s.filters.length} filtre(s)${lists.length ? ' · liste ' + lists.join(', ') : ''}`;
            const btn = el('v12TmpExtractBtn'); if (btn) { btn.disabled = true; btn.textContent = 'Préparation…'; }
            try { await v12TmpFromSql(r.sql, 'Extraction ' + (base.name || ''), { kind: 'extract', origin, from }); }
            catch (e) { showError('Jeu temporaire impossible : ' + e.message); }
            finally { if (btn) { btn.disabled = false; btn.innerHTML = '⏳ Garder comme jeu temporaire'; } }
        }
        Studio.extend('v12ExtractLayout', (_v12tLayout) => function () {
            const r = _v12tLayout.apply(this, arguments);
            try { const gen = el('v12x') && el('v12x').querySelector('.v12x-gen'); if (gen && !el('v12TmpExtractBtn')) { const d = document.createElement('div'); d.className = 'v12t-keep'; d.setAttribute('data-ro', 'keep'); d.innerHTML = `<button id="v12TmpExtractBtn" class="v11-btn sm" onclick="v12TmpFromExtract()" title="Garder le résultat pour la session : comparer, auditer, explorer… sans créer de source">⏳ Garder comme jeu temporaire</button><span>pour l'auditer, le comparer ou l'analyser sans créer de source</span>`; gen.appendChild(d); } } catch (e) {}
            return r;
        });
        // ---- Comparer : fichier extérieur d'un côté, écarts gardés comme jeu ----
        function v12TmpCompareAfter() {
            ['A', 'B'].forEach(side => {
                const s = el('compTable' + side); if (!s || s.parentNode.querySelector('.v12t-ext')) return;
                const b = document.createElement('button'); b.className = 'v11-btn sm v12t-ext'; b.setAttribute('data-ro', 'keep'); b.innerHTML = '📄 Fichier extérieur…'; b.title = 'Comparer avec un fichier reçu, sans l\'ajouter aux sources';
                b.onclick = () => v12TmpFileOpen(id => { v12TmpDecorate(); s.value = id; handleCompTableChange(side); });
                s.parentNode.appendChild(b);
            });
        }
        Studio.extend('duckDropTable', (_v12tDrop) => async function (tId) { if (v12State.cmpRunning && /^cmp_/.test(String(tId))) { if (v12State.cmpKeep && v12State.cmpKeep !== tId) { try { await _v12tDrop(v12State.cmpKeep); } catch (e) {} } v12State.cmpKeep = tId; return; } return _v12tDrop.apply(this, arguments); });
        Studio.extend('runComparison', (_v12tRunComp) => async function () {
            v12State.cmpRunning = true; v12State.cmpA = el('compTableA') && el('compTableA').value; v12State.cmpB = el('compTableB') && el('compTableB').value;
            try { return await _v12tRunComp.apply(this, arguments); }
            finally { v12State.cmpRunning = false; setTimeout(v12TmpCompareResult, 50); }
        });
        function v12TmpCompareResult() {
            const sum = el('compSummary'); if (!sum || !v12State.cmpKeep || !sum.textContent.trim()) return;
            let bar = el('v12TmpCmpBar'); if (!bar) { bar = document.createElement('div'); bar.id = 'v12TmpCmpBar'; bar.className = 'v12t-cmpbar'; bar.setAttribute('data-ro', 'keep'); sum.appendChild(bar); }
            bar.innerHTML = `<span>⏳ Garder pour la session, sans créer de source :</span><button class="v11-btn sm" onclick="v12TmpFromCompare(false)">les écarts seulement</button><button class="v11-btn sm" onclick="v12TmpFromCompare(true)">tout le rapport</button>`;
        }
        async function v12TmpFromCompare(all) {
            const id = v12State.cmpKeep; if (!id) return showError('Relancez la comparaison : le rapport n\'est plus en mémoire.');
            const a = state.tables[v12State.cmpA] || {}, b = state.tables[v12State.cmpB] || {};
            const where = all ? '' : `${sqlIdent('STATUT_LIGNE')} NOT IN ('100% Identique', 'Clé présente des deux côtés')`;
            try { await v12TmpFromTable(id, (all ? 'Comparaison ' : 'Écarts ') + (a.name || 'A') + ' vs ' + (b.name || 'B'), { kind: 'compare', origin: `${all ? 'rapport complet' : 'écarts'} de la comparaison ${a.name || 'A'} ↔ ${b.name || 'B'}`, from: [a.name, b.name].filter(n => n && !(state.tables[v12State.cmpA] || {}).temp) }, where); }
            catch (e) { showError('Jeu temporaire impossible : ' + e.message); }
        }
        // ---- Qualité : anomalies gardées comme jeu ----
        Studio.extend('qualInspectButtons', (_v12tInspectBtns) => function (idx) { return _v12tInspectBtns(idx).replace(/<\/span>$/, `<button onclick="v12TmpFromInspect(${idx})" class="text-[10px] bg-white border border-slate-300 px-2 py-0.5 rounded font-bold text-slate-600 hover:bg-slate-50" title="Garder ces lignes pour la session : les comparer, les extraire, les explorer — sans créer de source">⏳ Garder</button></span>`); });
        async function v12TmpFromInspect(idx) {
            const entry = qualInspectRegistry[idx]; if (!entry) return;
            const tName = (state.tables[el('qualTable') && el('qualTable').value] || {}).name || '';
            try { await v12TmpFromSql(`SELECT * EXCLUDE (__rn) FROM (${entry.sql}) q`, 'Anomalies ' + entry.label, { kind: 'audit', origin: `lignes en anomalie « ${entry.label} »${tName ? ' de ' + tName : ''}`, from: tName ? [tName] : [] }); }
            catch (e) { try { await v12TmpFromSql(`SELECT * FROM (${entry.sql}) q`, 'Anomalies ' + entry.label, { kind: 'audit', origin: `lignes en anomalie « ${entry.label} »${tName ? ' de ' + tName : ''}`, from: tName ? [tName] : [] }); } catch (e2) { showError('Jeu temporaire impossible : ' + e2.message); } }
        }
        // ---- écrans « sans données » : un jeu temporaire suffit ----
        Studio.extend('v12EmptyBand', (_v12tEmpty) => function (n) { if (v12TmpList().length) { const sec = el('step-' + n); const b = sec && sec.querySelector('.v12-band.info'); if (b) b.remove(); return; } return _v12tEmpty.apply(this, arguments); });
        Studio.extend('v12After', (_v12tAfter) => function () { const r = _v12tAfter.apply(this, arguments); try { v12TmpTopBtn(); if (currentTab === 7) v12TmpCompareAfter(); if (v12State.tmpIds.length) v12TmpDecorate(); } catch (e) {} return r; });
        window.addEventListener('beforeunload', e => { if (v12TmpList().length) { e.preventDefault(); e.returnValue = ''; } });
        // ---- recherche, aide, accueil ----
        Studio.extend('v11Index', (_v12tIndex) => function () { const out = _v12tIndex.apply(this, arguments); out.push({ grp: 'Actions', ic: '⏳', label: 'Jeux temporaires (résultats et fichiers de la session)', key: 'jeux temporaires session fichier extérieur résultat', go: () => v12TmpOpen() }); v12TmpList().forEach(t => out.push({ grp: 'Actions', ic: '⏳', label: 'Jeu temporaire : ' + t.name, sub: v12TmpKindLabel(t) + ' · ' + (t.rows || 0).toLocaleString('fr-FR') + ' lignes', key: 'jeu temporaire ' + t.name, go: () => v12TmpOpen() })); return out; });
        Object.assign(V11_LEXIQUE, { 'jeu temporaire': 'Résultat ou fichier gardé en mémoire pour la session (extraction, fichier reçu, écarts, anomalies) : utilisable dans tous les écrans sans être une source. Disparaît à la fermeture, sauf promotion en source.' });
        setTimeout(() => { try { v12TmpTopBtn(); } catch (e) {} }, 0);
