        // ==========================================
        //  CLÉ FONCTIONNELLE & DOUBLONS APPROCHÉS
        // ==========================================
        // La clé fonctionnelle d'une table est COMPOSITE : chaque composant est une colonne de la
        // table auditée OU d'une table directement liée (relation du modèle de données), avec une condition facultative
        // sur cette table — ex : clé de "emplacement" = acces.adresse, uniquement là où acces.type='GENERAL'.
        // Elle est stockée dans le dictionnaire de gouvernance (donc persistée et partageable en bundle).
        let lastDupResults = null;
        let dupUi = { mode: 'self', forTable: null, editProfile: null };

        // PROFILS de clé fonctionnelle : la clé peut dépendre du TYPE de l'objet (ex : pour un
        // emplacement de type SITE la clé est le libellé ; pour un BATIMENT c'est libellé + parent).
        // Chaque profil = un périmètre optionnel (colonne de type = valeur) + une composition de clé.
        function getKeyProfiles(tableName) {
            const d = ensureDictEntry(tableName);
            if (!Array.isArray(d.keyProfiles)) {
                d.keyProfiles = [];
                if (Array.isArray(d.functionalKey) && d.functionalKey.length) {
                    d.keyProfiles.push({ id: 'kp_' + generateId(), scope: [], parts: d.functionalKey });
                }
                delete d.functionalKey;
            }
            // Migration : ancien périmètre simple (typeCol/typeVal) -> liste de conditions composite.
            d.keyProfiles.forEach(pr => {
                if (!Array.isArray(pr.scope)) {
                    pr.scope = (pr.typeCol && pr.typeVal) ? [{ col: pr.typeCol, op: '=', val: pr.typeVal }] : [];
                    delete pr.typeCol; delete pr.typeVal;
                }
            });
            return d.keyProfiles;
        }
        // Hiérarchie : l'objet est-il lié à lui-même dans le modèle de données (ex : DK_CODE_PARENT -> DK_CODE) ?
        function selfRelationFor(tId) {
            return state.relations.find(r => r.sourceCol && r.targetCol && r.sourceTable === tId && r.targetTable === tId) || null;
        }
        function guessParentPointer(rel) {
            const isPtr = c => /PARENT|PERE|MERE|SUP/i.test(c);
            if (isPtr(rel.sourceCol) && !isPtr(rel.targetCol)) return { childPtr: rel.sourceCol, parentKey: rel.targetCol };
            return { childPtr: rel.targetCol, parentKey: rel.sourceCol };
        }

        function dupAllowedTables(tId) {
            const ids = new Set([tId]);
            state.relations.forEach(r => {
                if (!r.sourceCol || !r.targetCol) return;
                if (r.sourceTable === tId) ids.add(r.targetTable);
                if (r.targetTable === tId) ids.add(r.sourceTable);
            });
            return Object.values(state.tables).filter(t => t.status === 'ready' && ids.has(t.id));
        }

        function fkPartLabel(p, auditedName) {
            if (p.hier) return `<strong>${escapeHTML(p.col)}</strong> <span class="text-slate-400">— 🌳 du <strong class="text-slate-600">parent hiérarchique</strong> <span class="text-slate-300">(${escapeHTML(p.viaChild)} → ${escapeHTML(p.viaParent)})</span></span>`;
            if (p.table === auditedName) return `<strong>${escapeHTML(p.col)}</strong> <span class="text-slate-400">— colonne de la table auditée</span>`;
            return `<strong>${escapeHTML(p.col)}</strong> <span class="text-slate-400">— depuis <strong class="text-slate-600">${escapeHTML(p.table)}</strong>${p.whereCol ? `, uniquement si <strong class="text-slate-600">${escapeHTML(p.whereCol)} = "${escapeHTML(p.whereVal)}"</strong>` : ''}</span>`;
        }
        const SCOPE_OPS = { '=': '=', '!=': '≠', 'contains': 'contient', 'empty': 'est vide', 'notempty': "n'est pas vide" };
        function profileScopeLabel(pr) {
            const sc = pr.scope || [];
            if (!sc.length) return 'tous les types';
            return sc.map(c => `${c.col} ${SCOPE_OPS[c.op] || c.op}${c.op === 'empty' || c.op === 'notempty' ? '' : ` "${c.val}"`}`).join(' ET ');
        }
        // Traduit une condition de périmètre en SQL.
        function scopeCondSql(c) {
            const raw = `CAST(${sqlIdent(c.col)} AS VARCHAR)`;
            const norm = `UPPER(TRIM(${raw}))`;
            if (c.op === 'empty') return `(${sqlIdent(c.col)} IS NULL OR TRIM(${raw}) = '')`;
            if (c.op === 'notempty') return `(${sqlIdent(c.col)} IS NOT NULL AND TRIM(${raw}) <> '')`;
            if (c.op === 'contains') return `LOWER(COALESCE(${raw}, '')) LIKE '%' || ${sqlLiteral(String(c.val).toLowerCase())} || '%'`;
            if (c.op === '!=') return `COALESCE(${norm}, '') <> ${sqlLiteral(String(c.val).toUpperCase())}`;
            return `${norm} = ${sqlLiteral(String(c.val).toUpperCase())}`;
        }

        function renderDupSection() {
            const cont = el('qual-sub-dups'); if (!cont) return;
            const tId = currentProfilingTableId;
            const target = state.tables[tId];
            if (!target) { cont.innerHTML = '<p class="text-sm text-slate-400 italic py-8 text-center">Lancez d\'abord un audit sur une table.</p>'; return; }
            const tn = target.name;
            if (dupUi.forTable !== tn) dupUi = { mode: 'self', forTable: tn, editProfile: null };
            const profiles = getKeyProfiles(tn);
            const selfRel = selfRelationFor(tId);
            const hasRunnable = profiles.some(p => (p.parts || []).length);

            // Liste des profils : un par type d'objet (ou un profil général)
            const profileCards = profiles.map(pr => {
                const editing = dupUi.editProfile === pr.id;
                return `<div class="border ${editing ? 'border-indigo-400 ring-1 ring-indigo-200' : 'border-slate-200'} rounded-lg bg-white p-3 mb-2">
                    <div class="flex items-center gap-2 flex-wrap">
                        <span class="text-[10px] uppercase font-black px-2 py-1 rounded ${(pr.scope || []).length ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'}">${(pr.scope || []).length ? '🏷️ ' + escapeHTML(profileScopeLabel(pr)) : 'Tous les types'}</span>
                        <span class="text-xs text-slate-500">${(pr.parts || []).length} composant(s)</span>
                        <div class="ml-auto flex gap-1.5">
                            <button onclick="dupUi.editProfile='${pr.id}'; renderDupSection()" class="text-xs ${editing ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-300 text-slate-600'} px-2.5 py-1 rounded font-bold">${editing ? 'En cours d\'édition' : '✏️ Éditer'}</button>
                            <button onclick="removeKeyProfile('${pr.id}')" class="text-xs text-red-400 hover:text-red-600 px-1">🗑</button>
                        </div>
                    </div>
                    ${(pr.parts || []).length ? `<div class="mt-2 space-y-1">${pr.parts.map((p, i) => `<div class="flex items-center gap-2 text-xs bg-slate-50 border border-slate-100 rounded p-1.5"><span class="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-black flex items-center justify-center flex-shrink-0">${i + 1}</span><span>${fkPartLabel(p, tn)}</span>${editing ? `<select onchange="updateFkPartMatch('${pr.id}',${i},this.value)" title="Tolérance d'appariement de ce composant" class="ml-auto border border-slate-200 p-0.5 rounded text-[10px] bg-white">${[['fuzzy', '🌫 flou autorisé'], ['norm', '≈ casse/accents tolérés'], ['exact', '🎯 strict (exact)']].map(([v, l]) => `<option value="${v}" ${(p.match || 'fuzzy') === v ? 'selected' : ''}>${l}</option>`).join('')}</select><button onclick="removeFkPart('${pr.id}',${i})" class="text-slate-300 hover:text-red-500">✕</button>` : `${(p.match || 'fuzzy') !== 'fuzzy' ? `<span class="ml-auto text-[9px] uppercase font-bold text-slate-400">${(p.match === 'exact') ? '🎯 strict' : '≈ normalisé'}</span>` : ''}`}</div>`).join('')}</div>` : '<p class="text-xs text-slate-300 italic mt-1.5">Aucun composant — éditez ce profil pour composer sa clé.</p>'}
                </div>`;
            }).join('');

            // Éditeur du profil sélectionné
            let editorHtml = '';
            const editPr = profiles.find(p => p.id === dupUi.editProfile);
            if (editPr) {
                const linked = dupAllowedTables(tId).filter(t2 => t2.id !== tId);
                const modes = [
                    ['self', 'Colonne de cette table', true],
                    ['linked', `Colonne d'un fichier lié${linked.length ? '' : ' (aucune relation du modèle de données)'}`, linked.length > 0],
                    ['hier', `🌳 Colonne du parent hiérarchique${selfRel ? '' : ' (pas d\'auto-relation du modèle de données)'}`, !!selfRel],
                ];
                let builderBody = '';
                if (dupUi.mode === 'self') {
                    builderBody = `<div class="flex flex-wrap items-end gap-2">
                        <div><label class="text-[10px] uppercase font-bold text-slate-400 block mb-1">Quelle colonne fait partie de la clé ?</label>
                        <select id="fk-col-self" class="border border-slate-300 p-2 rounded text-sm bg-white">${target.headers.map(h => `<option>${escapeHTML(h)}</option>`).join('')}</select></div>
                        <button onclick="addFkPart()" class="bg-indigo-600 text-white text-sm font-bold px-4 py-2 rounded-lg">Ajouter à la clé</button>
                    </div>`;
                } else if (dupUi.mode === 'linked') {
                    builderBody = `<div class="space-y-2.5">
                        <div class="flex flex-wrap items-end gap-2">
                            <div><label class="text-[10px] uppercase font-bold text-slate-400 block mb-1">Dans quel fichier lié ?</label>
                            <select id="fk-tbl" onchange="fkTableChanged()" class="border border-slate-300 p-2 rounded text-sm bg-white">${linked.map(t2 => `<option value="${t2.id}">${escapeHTML(t2.name)}</option>`).join('')}</select></div>
                            <div><label class="text-[10px] uppercase font-bold text-slate-400 block mb-1">Quelle colonne ?</label>
                            <select id="fk-col" class="border border-slate-300 p-2 rounded text-sm bg-white">${linked[0] ? linked[0].headers.map(h => `<option>${escapeHTML(h)}</option>`).join('') : ''}</select></div>
                        </div>
                        <label class="flex items-center gap-2 text-xs text-slate-600 cursor-pointer"><input type="checkbox" id="fk-usecond" onchange="el('fk-cond-zone').classList.toggle('hidden', !this.checked)" class="text-indigo-600 rounded"> Ne prendre que certaines lignes de ce fichier <span class="text-slate-400">(ex : uniquement l'accès de type GENERAL)</span></label>
                        <div id="fk-cond-zone" class="hidden flex flex-wrap items-end gap-2 pl-5">
                            <div><label class="text-[10px] uppercase font-bold text-slate-400 block mb-1">Colonne du filtre</label>
                            <select id="fk-condcol" onchange="fkCondColChanged()" class="border border-slate-300 p-2 rounded text-sm bg-white">${linked[0] ? linked[0].headers.map(h => `<option>${escapeHTML(h)}</option>`).join('') : ''}</select></div>
                            <div><label class="text-[10px] uppercase font-bold text-slate-400 block mb-1">Doit valoir</label>
                            <input type="text" id="fk-condval" list="fk-condval-list" class="border border-slate-300 p-2 rounded text-sm w-44" placeholder="choisir ou saisir..."><datalist id="fk-condval-list"></datalist></div>
                        </div>
                        <button onclick="addFkPart()" class="bg-indigo-600 text-white text-sm font-bold px-4 py-2 rounded-lg">Ajouter à la clé</button>
                        <p class="text-[10px] text-slate-400">La jointure utilise la relation définie dans le modèle de données (étape 2).</p>
                    </div>`;
                } else if (dupUi.mode === 'hier' && selfRel) {
                    const guess = guessParentPointer(selfRel);
                    builderBody = `<div class="space-y-2.5">
                        <p class="text-xs text-slate-500">🌳 Hiérarchie détectée : <strong>${escapeHTML(guess.childPtr)}</strong> pointe vers <strong>${escapeHTML(guess.parentKey)}</strong> du parent. Utile quand un nom n'est unique que <em>sous le même parent</em> (ex : "Bâtiment A" existe sur chaque site).</p>
                        <div class="flex flex-wrap items-end gap-2">
                            <div><label class="text-[10px] uppercase font-bold text-slate-400 block mb-1">Colonne du PARENT à inclure dans la clé</label>
                            <select id="fk-col-hier" class="border border-slate-300 p-2 rounded text-sm bg-white">${target.headers.map(h => `<option ${h === guess.parentKey ? 'selected' : ''}>${escapeHTML(h)}</option>`).join('')}</select></div>
                            <div><label class="text-[10px] uppercase font-bold text-slate-400 block mb-1">Colonne pointant vers le parent</label>
                            <select id="fk-childptr" class="border border-slate-300 p-2 rounded text-sm bg-white">${[selfRel.sourceCol, selfRel.targetCol].map(c => `<option ${c === guess.childPtr ? 'selected' : ''}>${escapeHTML(c)}</option>`).join('')}</select></div>
                            <button onclick="addFkPart()" class="bg-indigo-600 text-white text-sm font-bold px-4 py-2 rounded-lg">Ajouter à la clé</button>
                        </div>
                    </div>`;
                }
                editorHtml = `<div class="bg-white border-2 border-indigo-300 rounded-xl p-4 mt-3">
                    <div class="text-xs font-bold text-indigo-900 mb-2">✏️ Édition du profil</div>
                    <div class="mb-3 pb-3 border-b border-slate-100">
                        <div class="text-[10px] uppercase font-bold text-slate-400 mb-1.5">Périmètre du profil <span class="normal-case font-medium text-slate-300">— composite : toutes les conditions doivent être vraies · aucune condition = toutes les lignes</span></div>
                        <div class="flex flex-wrap items-center gap-1.5 mb-2">
                            ${(editPr.scope || []).map((c, ci) => `<span class="text-xs bg-indigo-50 border border-indigo-200 text-indigo-800 rounded-full px-2.5 py-1 flex items-center gap-1.5"><strong>${escapeHTML(c.col)}</strong> ${SCOPE_OPS[c.op] || c.op}${c.op === 'empty' || c.op === 'notempty' ? '' : ` <strong>"${escapeHTML(c.val)}"</strong>`} <button onclick="removeScopeCond('${editPr.id}',${ci})" class="text-indigo-400 hover:text-red-500">✕</button></span>`).join('') || '<span class="text-xs text-slate-400 italic">Toutes les lignes de la table.</span>'}
                        </div>
                        <div class="flex flex-wrap items-end gap-2 bg-slate-50 border border-slate-100 rounded-lg p-2">
                            <div><label class="text-[9px] uppercase font-bold text-slate-400 block">Colonne</label>
                            <select id="fk-scope-col" onchange="fkScopeColChanged()" class="border border-slate-300 p-1.5 rounded text-xs bg-white">${target.headers.map(h => `<option>${escapeHTML(h)}</option>`).join('')}</select></div>
                            <div><label class="text-[9px] uppercase font-bold text-slate-400 block">Opérateur</label>
                            <select id="fk-scope-op" onchange="el('fk-scope-val').classList.toggle('hidden', this.value === 'empty' || this.value === 'notempty')" class="border border-slate-300 p-1.5 rounded text-xs bg-white">${Object.entries(SCOPE_OPS).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></div>
                            <div><label class="text-[9px] uppercase font-bold text-slate-400 block">Valeur</label>
                            <input type="text" id="fk-scope-val" list="fk-scope-list" onfocus="fkScopeColChanged()" class="border border-slate-300 p-1.5 rounded text-xs w-36" placeholder="choisir ou saisir..."><datalist id="fk-scope-list"></datalist></div>
                            <button onclick="addScopeCond('${editPr.id}')" class="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded font-bold">+ Condition</button>
                        </div>
                    </div>
                    <div class="flex gap-4 mb-3 flex-wrap">
                        ${modes.map(([m, lbl, enabled]) => `<label class="flex items-center gap-1.5 text-xs font-bold cursor-pointer ${dupUi.mode === m ? 'text-indigo-700' : 'text-slate-500'} ${enabled ? '' : 'opacity-40'}"><input type="radio" name="fk-mode" ${dupUi.mode === m ? 'checked' : ''} ${enabled ? '' : 'disabled'} onchange="dupUi.mode='${m}'; renderDupSection()" class="text-indigo-600"> ${lbl}</label>`).join('')}
                    </div>
                    ${builderBody}
                    <div id="fk-preview" class="mt-3"></div>
                </div>`;
            }

            cont.innerHTML = `
                <div class="bg-indigo-50/50 border border-indigo-200 rounded-xl p-5 mb-4">
                    <div class="flex items-center gap-2 flex-wrap mb-1">
                        <h3 class="text-sm font-bold text-indigo-900">🔑 Clés fonctionnelles de "${escapeHTML(tn)}"</h3>
                        ${selfRel ? `<span class="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-700">🌳 hiérarchie détectée (${escapeHTML(selfRel.sourceCol)} ↔ ${escapeHTML(selfRel.targetCol)})</span>` : ''}
                    </div>
                    <p class="text-xs text-slate-500 mb-3">La clé peut différer selon le <strong>type d'objet</strong> : créez un profil par type (ex : un pour les SITES, un pour les BATIMENTS avec le parent dans la clé). Chaque profil est analysé sur son périmètre.</p>
                    ${profileCards || ''}
                    <button onclick="addKeyProfile()" class="text-xs bg-white border border-indigo-300 text-indigo-700 px-3 py-1.5 rounded-lg font-bold hover:bg-indigo-50">+ Ajouter un profil de clé (par type)</button>
                    ${editorHtml}
                </div>
                <div class="flex items-center gap-3 mb-4 flex-wrap">
                    <button onclick="analyzeDuplicates()" id="btnDupRun" class="bg-indigo-600 text-white text-sm font-bold px-5 py-2.5 rounded-lg disabled:opacity-40" ${hasRunnable ? '' : 'disabled'}>🔎 Rechercher les doublons (${profiles.filter(p => (p.parts || []).length).length} profil(s))</button>
                    <label class="text-xs text-slate-500 flex items-center gap-1.5">Tolérance des doublons flous :
                        <select id="fk-thr" class="border border-slate-300 p-1.5 rounded text-xs bg-white"><option value="0.85">large (0.85)</option><option value="0.90" selected>normale (0.90)</option><option value="0.95">stricte (0.95)</option></select>
                    </label>
                    <span id="btnDupExport" class="hidden flex gap-2">
                        <button onclick="exportDupCsv(this)" class="text-xs bg-white border border-slate-300 px-3 py-1.5 rounded-lg font-bold text-slate-600 hover:bg-slate-50">⬇ Toutes les clés en double (CSV)</button>
                        <button onclick="exportDupRowsCsv(this)" class="text-xs bg-white border border-slate-300 px-3 py-1.5 rounded-lg font-bold text-slate-600 hover:bg-slate-50">⬇ Toutes les lignes en double (CSV)</button>
                        <button onclick="exportDupRowsXlsx(this)" class="text-xs bg-emerald-50 border border-emerald-300 px-3 py-1.5 rounded-lg font-bold text-emerald-700 hover:bg-emerald-100">📗 Lignes en double (Excel, 3 onglets)</button>
                    </span>
                </div>
                <div id="dupResults"></div>`;
            lucide.createIcons({ root: cont });
            if (editPr) { refreshKeyPreview(); fkScopeColChanged(); }
        }

        function addKeyProfile() {
            const target = state.tables[currentProfilingTableId]; if (!target) return;
            const pr = { id: 'kp_' + generateId(), scope: [], parts: [] };
            getKeyProfiles(target.name).push(pr);
            dupUi.editProfile = pr.id;
            persistAppState(); renderDupSection();
        }
        function removeKeyProfile(id) {
            const target = state.tables[currentProfilingTableId]; if (!target) return;
            const d = ensureDictEntry(target.name);
            d.keyProfiles = (d.keyProfiles || []).filter(p => p.id !== id);
            if (dupUi.editProfile === id) dupUi.editProfile = null;
            persistAppState(); renderDupSection();
        }
        function addScopeCond(profileId) {
            const target = state.tables[currentProfilingTableId]; if (!target) return;
            const pr = getKeyProfiles(target.name).find(p => p.id === profileId); if (!pr) return;
            const col = el('fk-scope-col').value, op = el('fk-scope-op').value, val = el('fk-scope-val').value.trim();
            if (op !== 'empty' && op !== 'notempty' && !val) return showError('Indiquez la valeur de la condition (ex : SITE).');
            pr.scope = pr.scope || [];
            const cond = { col, op, val: (op === 'empty' || op === 'notempty') ? '' : val };
            if (pr.scope.some(c => c.col === cond.col && c.op === cond.op && c.val === cond.val)) return showError('Cette condition est déjà dans le périmètre.');
            pr.scope.push(cond);
            persistAppState(); renderDupSection();
        }
        function removeScopeCond(profileId, idx) {
            const target = state.tables[currentProfilingTableId]; if (!target) return;
            const pr = getKeyProfiles(target.name).find(p => p.id === profileId); if (!pr) return;
            pr.scope.splice(idx, 1);
            persistAppState(); renderDupSection();
        }
        // Valeurs réelles de la colonne choisie, proposées pour la condition de périmètre.
        async function fkScopeColChanged() {
            const target = state.tables[currentProfilingTableId]; const list = el('fk-scope-list');
            const colSel = el('fk-scope-col');
            if (!target || !list || !colSel) return;
            const col = colSel.value; if (!col) return;
            list.innerHTML = '';
            try {
                const { conn } = await getDB();
                const raw = `TRIM(CAST(${sqlIdent(col)} AS VARCHAR))`;
                const res = await conn.query(`SELECT ${raw} AS v, COUNT(*)::BIGINT AS c FROM ${sqlIdent(duckTableName(target.id))} WHERE ${sqlIdent(col)} IS NOT NULL AND ${raw} <> '' GROUP BY 1 ORDER BY c DESC LIMIT 20`);
                list.innerHTML = arrowResultToObjects(res).map(r => `<option value="${escapeHTML(r.v)}">`).join('');
            } catch (e) {}
        }
        function fkTableChanged() {
            const t = state.tables[el('fk-tbl').value]; if (!t) return;
            el('fk-col').innerHTML = t.headers.map(h => `<option>${escapeHTML(h)}</option>`).join('');
            el('fk-condcol').innerHTML = t.headers.map(h => `<option>${escapeHTML(h)}</option>`).join('');
            el('fk-condval-list').innerHTML = ''; el('fk-condval').value = '';
        }
        async function fkCondColChanged() {
            const t = state.tables[el('fk-tbl').value]; const col = el('fk-condcol').value;
            const list = el('fk-condval-list'); if (!t || !col || !list) return;
            list.innerHTML = '';
            try {
                const { conn } = await getDB();
                const raw = `TRIM(CAST(${sqlIdent(col)} AS VARCHAR))`;
                const res = await conn.query(`SELECT ${raw} AS v, COUNT(*)::BIGINT AS c FROM ${sqlIdent(duckTableName(t.id))} WHERE ${sqlIdent(col)} IS NOT NULL AND ${raw} <> '' GROUP BY 1 ORDER BY c DESC LIMIT 20`);
                list.innerHTML = arrowResultToObjects(res).map(r => `<option value="${escapeHTML(r.v)}">`).join('');
            } catch (e) {}
        }
        function addFkPart() {
            const target = state.tables[currentProfilingTableId]; if (!target) return;
            const pr = getKeyProfiles(target.name).find(p => p.id === dupUi.editProfile);
            if (!pr) return showError('Sélectionnez un profil à éditer (bouton ✏️).');
            let part;
            if (dupUi.mode === 'self') {
                part = { table: target.name, col: el('fk-col-self').value };
            } else if (dupUi.mode === 'hier') {
                const selfRel = selfRelationFor(target.id); if (!selfRel) return;
                const childPtr = el('fk-childptr').value;
                const parentKey = childPtr === selfRel.sourceCol ? selfRel.targetCol : selfRel.sourceCol;
                part = { hier: true, col: el('fk-col-hier').value, viaChild: childPtr, viaParent: parentKey };
            } else {
                const t = state.tables[el('fk-tbl').value]; if (!t) return;
                part = { table: t.name, col: el('fk-col').value };
                if (el('fk-usecond').checked) {
                    const condCol = el('fk-condcol').value, condVal = el('fk-condval').value.trim();
                    if (!condVal) return showError('Indiquez la valeur du filtre (ex : GENERAL), ou décochez la condition.');
                    part.whereCol = condCol; part.whereVal = condVal;
                }
            }
            if (pr.parts.some(p => JSON.stringify({ ...p }) === JSON.stringify({ ...part }))) return showError('Ce composant est déjà dans la clé de ce profil.');
            pr.parts.push(part);
            persistAppState(); renderDupSection();
        }
        function updateFkPartMatch(profileId, idx, v) {
            const target = state.tables[currentProfilingTableId]; if (!target) return;
            const pr = getKeyProfiles(target.name).find(p => p.id === profileId); if (!pr || !pr.parts[idx]) return;
            pr.parts[idx].match = v;
            persistAppState(); renderDupSection();
        }
        function removeFkPart(profileId, idx) {
            const target = state.tables[currentProfilingTableId]; if (!target) return;
            const pr = getKeyProfiles(target.name).find(p => p.id === profileId); if (!pr) return;
            pr.parts.splice(idx, 1);
            persistAppState(); renderDupSection();
        }

        async function refreshKeyPreview() {
            const box = el('fk-preview'); if (!box) return;
            const tId = currentProfilingTableId; const target = state.tables[tId];
            const pr = target ? getKeyProfiles(target.name).find(p => p.id === dupUi.editProfile) : null;
            if (!pr || !pr.parts.length) { box.innerHTML = ''; return; }
            try {
                const { conn } = await getDB();
                const srcSql = buildDupSrcSql(tId, pr.parts, 'LIMIT 500', 'keys', pr);
                const res = await conn.query(`WITH src AS (${srcSql}) SELECT ke FROM src WHERE TRIM(REPLACE(ke, chr(31), '')) <> '' LIMIT 3`);
                const rows = arrowResultToObjects(res);
                if (!rows.length) { box.innerHTML = '<p class="text-[10px] text-amber-600">Aucune ligne sur ce périmètre — vérifiez la valeur du type.</p>'; return; }
                box.innerHTML = `<div class="text-[10px] uppercase font-bold text-slate-400 mb-1">Aperçu de la clé sur vos données (${escapeHTML(profileScopeLabel(pr))})</div>` +
                    rows.map(r => `<div class="mb-1">${renderKeySegments(r.ke, pr.parts)}</div>`).join('');
            } catch (e) { box.innerHTML = ''; }
        }

        function renderKeySegments(ke, parts) {
            const segs = String(ke).split(String.fromCharCode(31));
            return segs.map((s, i) => {
                const p = parts[i];
                const lbl = p ? (p.hier ? '🌳 ' + p.col : p.col) : 'clé';
                return `<span class="inline-flex items-baseline gap-1 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5 mr-1 text-xs"><span class="text-[9px] uppercase font-bold text-slate-400">${escapeHTML(lbl)}</span><span class="font-bold text-slate-700">${s === '' ? '<span class="text-red-400 italic font-normal">vide</span>' : escapeHTML(s)}</span></span>`;
            }).join('');
        }

        // SELECT donnant ke/kn (et les lignes en mode 'rows') pour un profil : périmètre de type
        // appliqué à la base, composants étrangers joints via le modèle de données, composant parent joint via
        // l'auto-relation hiérarchique.
        function buildDupSrcSql(tId, parts, sampleSql, mode, profile) {
            const target = state.tables[tId];
            const normJoin = (alias, col) => `NULLIF(UPPER(TRIM(CAST(${alias}.${sqlIdent(col)} AS VARCHAR))), '')`;
            const joins = [];
            const exprs = [];
            const extraSelects = [];
            parts.forEach((p, i) => {
                if (p.hier) {
                    const alias = 'h' + i;
                    joins.push(`LEFT JOIN ${sqlIdent(duckTableName(tId))} ${alias} ON ${normJoin(alias, p.viaParent)} = ${normJoin('b', p.viaChild)}`);
                    exprs.push(`${alias}.${sqlIdent(p.col)}`);
                    extraSelects.push(`${alias}.${sqlIdent(p.col)} AS ${sqlIdent(p.col + ' · parent')}`);
                    return;
                }
                if (p.table === target.name) { exprs.push(`b.${sqlIdent(p.col)}`); return; }
                const ft = tableByName(p.table);
                if (!ft) throw new Error(`Table "${p.table}" non chargée.`);
                const rel = state.relations.find(r => r.sourceCol && r.targetCol && ((r.sourceTable === tId && r.targetTable === ft.id) || (r.targetTable === tId && r.sourceTable === ft.id)));
                if (!rel) throw new Error(`Aucune relation du modèle de données entre "${target.name}" et "${p.table}" (étape 2) : impossible de joindre ce composant de clé.`);
                const onBase = rel.sourceTable === tId ? rel.sourceCol : rel.targetCol;
                const onForeign = rel.sourceTable === tId ? rel.targetCol : rel.sourceCol;
                const alias = 'f' + i;
                const cond = p.whereCol ? `AND UPPER(TRIM(CAST(x.${sqlIdent(p.whereCol)} AS VARCHAR))) = ${sqlLiteral(String(p.whereVal).toUpperCase())}` : '';
                joins.push(`LEFT JOIN (
                    SELECT * FROM ${sqlIdent(duckTableName(ft.id))} x
                    WHERE 1=1 ${cond}
                    QUALIFY ROW_NUMBER() OVER (PARTITION BY ${normJoin('x', onForeign)} ORDER BY x.__rn) = 1
                ) ${alias} ON ${normJoin(alias, onForeign)} = ${normJoin('b', onBase)}`);
                exprs.push(`${alias}.${sqlIdent(p.col)}`);
                extraSelects.push(`${alias}.${sqlIdent(p.col)} AS ${sqlIdent(p.col + ' · ' + p.table)}`);
            });
            const scopeConds = (profile && Array.isArray(profile.scope)) ? profile.scope.filter(c => c.col) : [];
            const scopeCond = scopeConds.length ? 'WHERE ' + scopeConds.map(scopeCondSql).join(' AND ') : '';
            // Mode d'appariement par composant : 'exact' (strict, aucune tolérance), 'norm'
            // (casse/accents/ponctuation tolérés, jamais de flou), 'fuzzy' (flou autorisé — défaut).
            const matchOf = p => p.match || 'fuzzy';
            const exactExpr = e => `COALESCE(TRIM(CAST(${e} AS VARCHAR)), '')`;
            const normExprK = e => `regexp_replace(strip_accents(UPPER(COALESCE(TRIM(CAST(${e} AS VARCHAR)), ''))), '[^A-Z0-9]', '', 'g')`;
            const keCols = exprs.map(exactExpr);
            const knCols = exprs.map((e, i) => matchOf(parts[i]) === 'exact' ? exactExpr(e) : normExprK(e));
            const kbCols = exprs.filter((e, i) => matchOf(parts[i]) !== 'fuzzy').map((e) => normExprK(e));
            const kfCols = exprs.filter((e, i) => matchOf(parts[i]) === 'fuzzy').map((e) => normExprK(e));
            const kbExpr = kbCols.length ? `concat_ws(chr(31), ${kbCols.join(', ')})` : `''`;
            const kfExpr = kfCols.length ? `concat_ws(chr(31), ${kfCols.join(', ')})` : `''`;
            const selectCols = mode === 'rows'
                ? `b.*${extraSelects.length ? ', ' + extraSelects.join(', ') : ''}, `
                : '';
            return `SELECT ${selectCols}concat_ws(chr(31), ${keCols.join(', ')}) AS ke, concat_ws(chr(31), ${knCols.join(', ')}) AS kn, ${kbExpr} AS kb, ${kfExpr} AS kf
                FROM (SELECT * FROM ${sqlIdent(duckTableName(tId))} ${scopeCond} ORDER BY __rn ${sampleSql}) b
                ${joins.join('\n')}`;
        }

        async function analyzeDuplicates() {
            const tId = currentProfilingTableId; const target = state.tables[tId];
            const out = el('dupResults'); const btn = el('btnDupRun');
            if (!target || !out) return;
            const profiles = getKeyProfiles(target.name).filter(p => (p.parts || []).length);
            if (!profiles.length) return showError('Composez au moins un profil de clé.');
            btn.disabled = true;
            const sampleOption = el('qualSampleSize').value;
            const sampleSql = sampleOption === 'all' ? '' : `LIMIT ${parseInt(sampleOption)}`;
            const thr = parseFloat(el('fk-thr').value);
            const results = [];
            try {
                const { conn } = await getDB();
                for (let pi = 0; pi < profiles.length; pi++) {
                    const pr = profiles[pi];
                    out.innerHTML = `<p class="text-xs text-indigo-700">Analyse du profil ${pi + 1}/${profiles.length} (${escapeHTML(profileScopeLabel(pr))})...</p>`;
                    const srcSql = buildDupSrcSql(tId, pr.parts, sampleSql, 'keys', pr);
                    const notEmpty = `TRIM(REPLACE(ke, chr(31), '')) <> ''`;

                    const totRes = await conn.query(`WITH src AS (${srcSql}) SELECT COUNT(*)::BIGINT AS n FROM src`);
                    const totalRows = Number(arrowResultToObjects(totRes)[0].n);

                    const exactRes = await conn.query(`WITH src AS (${srcSql})
                        SELECT COUNT(*)::BIGINT AS grps, COALESCE(SUM(c), 0)::BIGINT AS rws FROM (
                            SELECT ke, COUNT(*) AS c FROM src WHERE ${notEmpty} GROUP BY 1 HAVING COUNT(*) > 1
                        ) d`);
                    const ex = arrowResultToObjects(exactRes)[0];
                    const exactTopRes = await conn.query(`WITH src AS (${srcSql})
                        SELECT ke, COUNT(*)::BIGINT AS c FROM src WHERE ${notEmpty} GROUP BY 1 HAVING COUNT(*) > 1 ORDER BY c DESC LIMIT 10`);
                    const exactTop = arrowResultToObjects(exactTopRes).map(r => ({ ke: r.ke, c: Number(r.c) }));

                    const nearRes = await conn.query(`WITH src AS (${srcSql})
                        SELECT kn, COUNT(*)::BIGINT AS c, list(DISTINCT ke) AS exs FROM src
                        WHERE ${notEmpty}
                        GROUP BY 1 HAVING COUNT(*) > 1 AND COUNT(DISTINCT ke) > 1
                        ORDER BY c DESC LIMIT 10`);
                    const nearTop = arrowResultToObjects(nearRes).map(r => ({ kn: r.kn, c: Number(r.c), exs: (Array.isArray(r.exs) ? r.exs : (r.exs && r.exs.toArray ? r.exs.toArray() : [])).slice(0, 4) }));
                    const nearCountRes = await conn.query(`WITH src AS (${srcSql})
                        SELECT COUNT(*)::BIGINT AS n FROM (SELECT kn FROM src WHERE ${notEmpty} GROUP BY 1 HAVING COUNT(*) > 1 AND COUNT(DISTINCT ke) > 1) d`);
                    const nearGroups = Number(arrowResultToObjects(nearCountRes)[0].n);

                    // Flou : uniquement sur les composants marqués "flou autorisé" ; les composants
                    // stricts/normalisés doivent être IDENTIQUES (blocage sur kb) pour qu'une paire remonte.
                    const hasFuzzy = pr.parts.some(p => (p.match || 'fuzzy') === 'fuzzy');
                    let fuzzy = [];
                    if (hasFuzzy) {
                        const fuzzyRes = await conn.query(`WITH src AS (${srcSql}),
                            d AS (SELECT kb, kf, MIN(ke) AS ex, COUNT(*)::BIGINT AS n FROM src WHERE ${notEmpty} AND LENGTH(kf) >= 3 GROUP BY 1, 2)
                            SELECT a.ex AS e1, b.ex AS e2, a.n AS n1, b.n AS n2, jaro_winkler_similarity(a.kf, b.kf) AS s
                            FROM d a JOIN d b ON a.kb = b.kb AND left(a.kf, 4) = left(b.kf, 4) AND a.kf < b.kf
                            WHERE jaro_winkler_similarity(a.kf, b.kf) >= ${thr}
                            ORDER BY s DESC LIMIT 100`);
                        fuzzy = arrowResultToObjects(fuzzyRes).map(r => ({ e1: r.e1, e2: r.e2, n1: Number(r.n1), n2: Number(r.n2), s: Number(r.s) }));
                    }

                    results.push({ profile: { id: pr.id, scope: JSON.parse(JSON.stringify(pr.scope || [])), parts: JSON.parse(JSON.stringify(pr.parts)) }, totalRows, exact: { groups: Number(ex.grps), rows: Number(ex.rws), top: exactTop }, near: { groups: nearGroups, top: nearTop }, fuzzy });
                }
                lastDupResults = { tId, table: target.name, sampleSql, threshold: thr, profiles: results };
                renderDupResults();
            } catch (e) { out.innerHTML = `<p class="text-xs text-red-600">Analyse impossible : ${escapeHTML(e.message)}</p>`; }
            finally { btn.disabled = false; }
        }

        function renderDupResults() {
            const out = el('dupResults'); const R = lastDupResults; if (!out || !R) return;
            let anyIssue = false;
            let html = '';
            R.profiles.forEach((res, pi) => {
                const parts = res.profile.parts;
                const seg = k => renderKeySegments(k, parts);
                const scopeLbl = profileScopeLabel(res.profile);
                const totalIssues = res.exact.groups + res.near.groups + res.fuzzy.length;
                if (totalIssues > 0) anyIssue = true;
                html += `<div class="border-2 ${totalIssues ? 'border-indigo-200' : 'border-emerald-200'} rounded-xl p-4 mb-4 bg-white">
                    <div class="flex items-center gap-2 flex-wrap mb-3">
                        <span class="text-[10px] uppercase font-black px-2 py-1 rounded ${(res.profile.scope || []).length ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'}">🏷️ ${escapeHTML(scopeLbl)}</span>
                        <span class="text-sm text-slate-600"><strong>${res.totalRows.toLocaleString('fr-FR')} lignes</strong> sur ce périmètre</span>
                        ${totalIssues === 0 ? '<span class="text-xs font-bold text-emerald-600 ml-auto">🎉 aucun doublon</span>' : ''}
                    </div>`;
                if (totalIssues > 0) {
                    html += `<div class="grid grid-cols-3 gap-3 mb-3">
                        <div class="p-2.5 border rounded-xl ${res.exact.groups ? 'bg-red-50 border-red-200' : 'bg-slate-50'}"><div class="text-xl font-black ${res.exact.groups ? 'text-red-600' : 'text-emerald-600'}">${res.exact.groups.toLocaleString('fr-FR')}</div><div class="text-[10px] font-bold text-slate-600">groupes stricts (${res.exact.rows.toLocaleString('fr-FR')} lignes)</div></div>
                        <div class="p-2.5 border rounded-xl ${res.near.groups ? 'bg-amber-50 border-amber-200' : 'bg-slate-50'}"><div class="text-xl font-black ${res.near.groups ? 'text-amber-600' : 'text-emerald-600'}">${res.near.groups.toLocaleString('fr-FR')}</div><div class="text-[10px] font-bold text-slate-600">quasi identiques (casse/accents)</div></div>
                        <div class="p-2.5 border rounded-xl ${res.fuzzy.length ? 'bg-purple-50 border-purple-200' : 'bg-slate-50'}"><div class="text-xl font-black ${res.fuzzy.length ? 'text-purple-600' : 'text-emerald-600'}">${res.fuzzy.length.toLocaleString('fr-FR')}</div><div class="text-[10px] font-bold text-slate-600">paires suspectes (≥ ${R.threshold})</div></div>
                    </div>`;
                    const card = (kind, i, badge, badgeCls, body) => `<div class="border border-slate-200 rounded-xl bg-white mb-2 overflow-hidden">
                        <div class="p-3 flex items-center gap-3 flex-wrap">
                            <span class="text-[10px] uppercase font-black px-2 py-1 rounded ${badgeCls} flex-shrink-0">${badge}</span>
                            <div class="min-w-0 flex-1">${body}</div>
                            <button onclick="toggleDupRows(${pi}, '${kind}', ${i})" id="btn-dup-${pi}-${kind}-${i}" class="text-xs bg-indigo-50 border border-indigo-200 text-indigo-700 px-3 py-1.5 rounded-lg font-bold hover:bg-indigo-100 flex-shrink-0">👁 Voir les lignes</button>
                        </div>
                        <div id="dup-rows-${pi}-${kind}-${i}" class="hidden border-t border-slate-100 bg-slate-50/50 p-3"></div>
                    </div>`;
                    if (res.exact.top.length) {
                        html += `<h4 class="text-xs font-bold text-slate-700 mt-3 mb-1.5">🔴 Doublons stricts <span class="font-normal text-slate-400">— top 10 affiché${res.exact.groups > 10 ? ` sur ${res.exact.groups.toLocaleString('fr-FR')} groupes : utilisez l'export CSV pour tout corriger` : ''}</span></h4>`;
                        html += res.exact.top.map((r, i) => card('exact', i, `× ${r.c}`, 'bg-red-100 text-red-700', seg(r.ke))).join('');
                    }
                    if (res.near.top.length) {
                        html += `<h4 class="text-xs font-bold text-slate-700 mt-3 mb-1.5">🟠 Quasi identiques <span class="font-normal text-slate-400">— mêmes en ignorant casse/accents/ponctuation</span></h4>`;
                        html += res.near.top.map((r, i) => card('near', i, `× ${r.c}`, 'bg-amber-100 text-amber-800', r.exs.map(seg).join('<div class="text-[10px] text-slate-300 my-0.5">≈ variante :</div>'))).join('');
                    }
                    if (res.fuzzy.length) {
                        html += `<h4 class="text-xs font-bold text-slate-700 mt-3 mb-1.5">🟣 Paires suspectes <span class="font-normal text-slate-400">— à arbitrer (top ${Math.min(res.fuzzy.length, 20)})</span></h4>`;
                        html += res.fuzzy.slice(0, 20).map((r, i) => card('fuzzy', i, `${(r.s * 100).toFixed(1)}%`, 'bg-purple-100 text-purple-700', `${seg(r.e1)}<div class="text-[10px] text-slate-300 my-0.5">ressemble à :</div>${seg(r.e2)}`)).join('');
                    }
                }
                html += '</div>';
            });
            out.innerHTML = html;
            el('btnDupExport').classList.toggle('hidden', !anyIssue);
        }

        async function toggleDupRows(pi, kind, i) {
            const box = el(`dup-rows-${pi}-${kind}-${i}`); const btn = el(`btn-dup-${pi}-${kind}-${i}`);
            if (!box || !lastDupResults) return;
            if (box.dataset.loaded) { box.classList.toggle('hidden'); btn.textContent = box.classList.contains('hidden') ? '👁 Voir les lignes' : 'Masquer'; return; }
            box.classList.remove('hidden'); box.innerHTML = '<p class="text-xs text-indigo-600">Chargement des lignes...</p>'; btn.textContent = 'Masquer';
            const R = lastDupResults; const res = R.profiles[pi];
            try {
                const { conn } = await getDB();
                const rowsSql = buildDupSrcSql(R.tId, res.profile.parts, R.sampleSql, 'rows', res.profile);
                const fetch2 = async (field, value) => {
                    const q = await conn.query(`WITH src AS (${rowsSql}) SELECT * FROM src WHERE ${field} = ${sqlLiteral(value)} LIMIT 30`);
                    return arrowResultToObjects(q);
                };
                let html = '';
                if (kind === 'exact') html = renderDupRowsTable(await fetch2('ke', res.exact.top[i].ke), res.profile.parts);
                else if (kind === 'near') html = renderDupRowsTable(await fetch2('kn', res.near.top[i].kn), res.profile.parts);
                else {
                    const p = res.fuzzy[i];
                    html = `<div class="text-[10px] uppercase font-bold text-slate-400 mb-1">Lignes A</div>${renderDupRowsTable(await fetch2('ke', p.e1), res.profile.parts)}
                        <div class="text-[10px] uppercase font-bold text-slate-400 mb-1 mt-3">Lignes B</div>${renderDupRowsTable(await fetch2('ke', p.e2), res.profile.parts)}`;
                }
                box.innerHTML = html; box.dataset.loaded = '1';
            } catch (e) { box.innerHTML = `<p class="text-xs text-red-600">Chargement impossible : ${escapeHTML(e.message)}</p>`; }
        }

        function renderDupRowsTable(rows, parts) {
            if (!rows.length) return '<p class="text-xs text-slate-400 italic">Aucune ligne (échantillon différent ?).</p>';
            const R = lastDupResults;
            const keyCols = new Set();
            parts.forEach(p => keyCols.add(p.hier ? p.col + ' · parent' : (p.table === R.table ? p.col : p.col + ' · ' + p.table)));
            const allCols = Object.keys(rows[0]).filter(c => c !== 'ke' && c !== 'kn' && c !== 'kb' && c !== 'kf');
            const ordered = [...allCols.filter(c => keyCols.has(c)), ...allCols.filter(c => !keyCols.has(c))];
            const head = ordered.map(c => `<th class="p-2 whitespace-nowrap ${keyCols.has(c) ? 'bg-indigo-100 text-indigo-800' : ''}">${keyCols.has(c) ? '🔑 ' : ''}${escapeHTML(c)}</th>`).join('');
            const body = rows.map(r => `<tr class="hover:bg-white">${ordered.map(c => `<td class="p-2 whitespace-nowrap max-w-[220px] truncate ${keyCols.has(c) ? 'bg-indigo-50/60 font-bold text-indigo-900' : 'text-slate-600'}" title="${escapeHTML(r[c] === null || r[c] === undefined ? '' : String(r[c]))}">${escapeHTML(r[c] === null || r[c] === undefined || r[c] === '' ? '—' : String(r[c]))}</td>`).join('')}</tr>`).join('');
            return `<div class="overflow-x-auto border border-slate-200 rounded-lg bg-white"><table class="w-full text-left text-xs"><thead class="bg-slate-50 text-[9px] uppercase font-bold text-slate-500"><tr>${head}</tr></thead><tbody class="divide-y divide-slate-100">${body}</tbody></table></div>`;
        }

        function downloadTextFile(name, text, mime) {
            const blob = new Blob(["﻿", text], { type: (mime || 'text/csv') + ';charset=utf-8;' });
            const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
            document.body.appendChild(a); a.click(); a.remove();
        }

        // Export COMPLET des clés en double (tous les groupes, pas seulement le top 10 affiché).
        async function exportDupCsv(btn) {
            if (!lastDupResults) return;
            if (btn) { btn.disabled = true; btn.textContent = 'Export...'; }
            const SEP = String.fromCharCode(31);
            const clean = k => String(k).split(SEP).join(' | ');
            const rows = [['PROFIL', 'TYPE', 'CLE_A', 'CLE_B', 'SIMILARITE', 'NB_LIGNES'].map(escapeCSV).join(';')];
            try {
                const { conn } = await getDB();
                const notEmpty = `TRIM(REPLACE(ke, chr(31), '')) <> ''`;
                for (const res of lastDupResults.profiles) {
                    const scope = profileScopeLabel(res.profile);
                    const srcSql = buildDupSrcSql(lastDupResults.tId, res.profile.parts, lastDupResults.sampleSql, 'keys', res.profile);
                    const exAll = arrowResultToObjects(await conn.query(`WITH src AS (${srcSql}) SELECT ke, COUNT(*)::BIGINT AS c FROM src WHERE ${notEmpty} GROUP BY 1 HAVING COUNT(*) > 1 ORDER BY c DESC`));
                    exAll.forEach(r => rows.push([scope, 'EXACT', clean(r.ke), '', '', Number(r.c)].map(escapeCSV).join(';')));
                    const nearAll = arrowResultToObjects(await conn.query(`WITH src AS (${srcSql}) SELECT kn, COUNT(*)::BIGINT AS c, list(DISTINCT ke) AS exs FROM src WHERE ${notEmpty} GROUP BY 1 HAVING COUNT(*) > 1 AND COUNT(DISTINCT ke) > 1 ORDER BY c DESC`));
                    nearAll.forEach(r => { const exs = (Array.isArray(r.exs) ? r.exs : (r.exs && r.exs.toArray ? r.exs.toArray() : [])); rows.push([scope, 'NORMALISE', exs.map(clean).join(' || '), '', '', Number(r.c)].map(escapeCSV).join(';')); });
                    const hasFuzzy = res.profile.parts.some(p => (p.match || 'fuzzy') === 'fuzzy');
                    if (hasFuzzy) {
                        const fzAll = arrowResultToObjects(await conn.query(`WITH src AS (${srcSql}),
                            d AS (SELECT kb, kf, MIN(ke) AS ex, COUNT(*)::BIGINT AS n FROM src WHERE ${notEmpty} AND LENGTH(kf) >= 3 GROUP BY 1, 2)
                            SELECT a.ex AS e1, b.ex AS e2, a.n AS n1, b.n AS n2, jaro_winkler_similarity(a.kf, b.kf) AS s
                            FROM d a JOIN d b ON a.kb = b.kb AND left(a.kf, 4) = left(b.kf, 4) AND a.kf < b.kf
                            WHERE jaro_winkler_similarity(a.kf, b.kf) >= ${lastDupResults.threshold}
                            ORDER BY s DESC LIMIT 5000`));
                        fzAll.forEach(r => rows.push([scope, 'FLOU', clean(r.e1), clean(r.e2), Number(r.s).toFixed(3), Number(r.n1) + Number(r.n2)].map(escapeCSV).join(';')));
                    }
                }
                downloadTextFile(`Doublons_cles_${lastDupResults.table.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.csv`, rows.join('\n'));
                showSuccess(`Export complet : ${rows.length - 1} ligne(s) de doublons.`);
            } catch (e) { showError('Export impossible : ' + e.message); }
            finally { if (btn) { btn.disabled = false; btn.textContent = '⬇ Toutes les clés en double (CSV)'; } }
        }

        // Collecte des LIGNES en double pour les TROIS rapprochements : EXACT (clé strictement
        // identique), NORMALISE (identique une fois casse/accents/ponctuation tolérés) et FLOU
        // (lignes des deux côtés de chaque paire suspecte >= seuil). Partagée par les exports CSV et Excel.
        async function collectDupRowsByType() {
            const { conn } = await getDB();
            const SEP = String.fromCharCode(31);
            const notEmpty = `TRIM(REPLACE(ke, chr(31), '')) <> ''`;
            const R2 = { cols: null, types: { EXACT: [], NORMALISE: [], FLOU: [] } };
            for (const res of lastDupResults.profiles) {
                const scope = profileScopeLabel(res.profile);
                const rowsSql = buildDupSrcSql(lastDupResults.tId, res.profile.parts, lastDupResults.sampleSql, 'rows', res.profile);
                const pushRows = (rowsArr, type, groupOf) => {
                    rowsArr.forEach(r => {
                        if (!R2.cols) R2.cols = Object.keys(r).filter(c => c !== 'ke' && c !== 'kn' && c !== 'kb' && c !== 'kf' && c !== '__pid' && c !== '__sim');
                        R2.types[type].push([scope, groupOf(r), String(r.ke).split(SEP).join(' | '), ...R2.cols.map(c => r[c])]);
                    });
                };
                pushRows(arrowResultToObjects(await conn.query(`WITH src AS (${rowsSql})
                    SELECT * FROM src WHERE ${notEmpty} AND ke IN (SELECT ke FROM src WHERE ${notEmpty} GROUP BY 1 HAVING COUNT(*) > 1)
                    ORDER BY ke LIMIT 50000`)), 'EXACT', r => String(r.ke).split(SEP).join(' | '));
                pushRows(arrowResultToObjects(await conn.query(`WITH src AS (${rowsSql})
                    SELECT * FROM src WHERE ${notEmpty} AND kn IN (SELECT kn FROM src WHERE ${notEmpty} GROUP BY 1 HAVING COUNT(*) > 1 AND COUNT(DISTINCT ke) > 1)
                    ORDER BY kn, ke LIMIT 50000`)), 'NORMALISE', r => String(r.kn).split(SEP).join(' | '));
                const hasFuzzy = res.profile.parts.some(p2 => (p2.match || 'fuzzy') === 'fuzzy');
                if (hasFuzzy) {
                    pushRows(arrowResultToObjects(await conn.query(`WITH src AS (${rowsSql}),
                        d AS (SELECT kb, kf, COUNT(*)::BIGINT AS n FROM src WHERE ${notEmpty} AND LENGTH(kf) >= 3 GROUP BY 1, 2),
                        pr AS (SELECT a.kb AS kb, a.kf AS kf1, b.kf AS kf2, jaro_winkler_similarity(a.kf, b.kf) AS s
                               FROM d a JOIN d b ON a.kb = b.kb AND left(a.kf, 4) = left(b.kf, 4) AND a.kf < b.kf
                               WHERE jaro_winkler_similarity(a.kf, b.kf) >= ${lastDupResults.threshold}
                               ORDER BY s DESC LIMIT 2000),
                        pn AS (SELECT row_number() OVER (ORDER BY s DESC) AS __pid, * FROM pr)
                        SELECT pn.__pid, pn.s AS __sim, src.* FROM pn JOIN src ON src.kb = pn.kb AND (src.kf = pn.kf1 OR src.kf = pn.kf2)
                        ORDER BY pn.__pid LIMIT 50000`)), 'FLOU', r => `paire ${Number(r.__pid)} (similarité ${(Number(r.__sim) * 100).toFixed(1)} %)`);
                }
            }
            return R2;
        }

        async function exportDupRowsCsv(btn) {
            if (!lastDupResults) return;
            if (btn) { btn.disabled = true; btn.textContent = 'Export...'; }
            try {
                const R2 = await collectDupRowsByType();
                const total = R2.types.EXACT.length + R2.types.NORMALISE.length + R2.types.FLOU.length;
                if (!total) { showSuccess('Aucune ligne en double à exporter.'); }
                else {
                    const out = [['PROFIL', 'TYPE', 'GROUPE', 'CLE_FONCTIONNELLE', ...(R2.cols || [])].map(escapeCSV).join(';')];
                    for (const type of ['EXACT', 'NORMALISE', 'FLOU']) R2.types[type].forEach(row => out.push([row[0], type, ...row.slice(1)].map(escapeCSV).join(';')));
                    downloadTextFile(`Doublons_lignes_${lastDupResults.table.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.csv`, out.join('\n'));
                    showSuccess(`Export : ${total} ligne(s) — ${R2.types.EXACT.length} stricte(s), ${R2.types.NORMALISE.length} normalisée(s), ${R2.types.FLOU.length} floue(s).`);
                }
            } catch (e) { showError('Export impossible : ' + e.message); }
            finally { if (btn) { btn.disabled = false; btn.textContent = '⬇ Toutes les lignes en double (CSV)'; } }
        }

        // Export Excel : un ONGLET par rapprochement (+ synthèse) — plus lisible pour arbitrer.
        async function exportDupRowsXlsx(btn) {
            if (!lastDupResults) return;
            if (typeof XLSX === 'undefined') return showError('Export Excel indisponible (bibliothèque non chargée) — utilisez l\'export CSV.');
            if (btn) { btn.disabled = true; btn.textContent = 'Export...'; }
            try {
                const R2 = await collectDupRowsByType();
                const total = R2.types.EXACT.length + R2.types.NORMALISE.length + R2.types.FLOU.length;
                if (!total) { showSuccess('Aucune ligne en double à exporter.'); return; }
                const wb = XLSX.utils.book_new();
                const synth = [['Table', lastDupResults.table], ['Exporté le', new Date().toLocaleString('fr-FR')], ['Seuil de similarité (flou)', lastDupResults.threshold], [],
                    ['Onglet', 'Rapprochement', 'Lignes'],
                    ['Stricts', 'Clé strictement identique', R2.types.EXACT.length],
                    ['Casse-accents tolérés', 'Identique une fois casse, accents, espaces et ponctuation tolérés', R2.types.NORMALISE.length],
                    ['Paires floues', 'Paires suspectes au-dessus du seuil (les 2 lignes de chaque paire)', R2.types.FLOU.length]];
                XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(synth), 'Synthèse');
                const header = ['PROFIL', 'GROUPE', 'CLE_FONCTIONNELLE', ...(R2.cols || [])];
                const sheets = [['EXACT', 'Stricts'], ['NORMALISE', 'Casse-accents tolérés'], ['FLOU', 'Paires floues']];
                for (const [type, name] of sheets) {
                    const aoa = R2.types[type].length ? [header, ...R2.types[type]] : [['Aucune ligne pour ce rapprochement.']];
                    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name);
                }
                XLSX.writeFile(wb, `Doublons_${lastDupResults.table.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.xlsx`);
                showSuccess(`📗 Excel exporté : ${R2.types.EXACT.length} stricte(s), ${R2.types.NORMALISE.length} normalisée(s), ${R2.types.FLOU.length} floue(s) — un onglet par rapprochement.`);
            } catch (e) { showError('Export Excel impossible : ' + e.message); }
            finally { if (btn) { btn.disabled = false; btn.textContent = '📗 Lignes en double (Excel, 3 onglets)'; } }
        }

        // ---- Export des résultats d'audit (pour retravailler la donnée à l'extérieur) ----
        function exportAuditCsv() {
            const s = currentProfilingStats; if (!s) return showError("Lancez d'abord un audit.");
            const head = ['colonne', 'type_semantique', 'completude_pct', 'vides', 'valeurs_distinctes', 'format_dominant', 'format_dominant_pct', 'nb_formats', 'min', 'max', 'moyenne', 'ecart_type', 'long_min', 'long_max', 'long_moyenne', 'p05', 'q1', 'mediane', 'q3', 'p95', 'date_min', 'date_max', 'dates_futur', 'dates_avant_1900', 'dates_invraisemblables', 'ratio_cardinalite_pct', 'cle_candidate', 'colonne_constante', 'recopie_de', 'espaces_debut_fin', 'espaces_multiples', 'bouche_trous', 'variantes_casse', 'aberrantes_3sigma', 'aberrantes_iqr', 'extremes_mad', 'aberrantes_dans_groupe', 'mad', 'liste_de_valeurs', 'hors_referentiel', 'top_valeurs'];
            const rows = [head.map(escapeCSV).join(';')];
            Object.values(s.columns).forEach(c => {
                rows.push([c.name, c.semanticType, c.completeness.toFixed(2), c.nullCount, c.distinctCount,
                    c.patterns && c.patterns[0] ? c.patterns[0].pattern : '', c.patterns && c.patterns[0] ? c.patterns[0].pct.toFixed(1) : '', c.patternDistinct || '',
                    c.min !== null && c.min !== undefined ? c.min : '', c.max !== null && c.max !== undefined ? c.max : '',
                    c.mean ? c.mean.toFixed(4) : '', c.stdDev ? c.stdDev.toFixed(4) : '',
                    c.minLen, c.maxLen, c.avgLen ? c.avgLen.toFixed(1) : '',
                    c.p05 != null ? c.p05 : '', c.p25 != null ? c.p25 : '', c.median != null ? c.median : '', c.p75 != null ? c.p75 : '', c.p95 != null ? c.p95 : '',
                    c.dateMin || '', c.dateMax || '', c.datesFuture || 0, c.datesAncient || 0, c.datesFar || 0,
                    c.cardinalityRatio != null ? (100 * c.cardinalityRatio).toFixed(2) : '', c.isCandidateKey ? 'oui' : '', c.isConstant ? 'oui' : '', c.duplicateOf || '',
                    c.spaceIssues || 0, c.multiSpace || 0, c.placeholders || 0, c.caseDupGroups || 0, c.outliers || 0, c.outliersIqr || 0, c.outliersMad || 0, c.outliersCtx || 0, c.mad != null ? c.mad : '', c.valueListName || '', c.outsideList != null ? c.outsideList : '',
                    (c.frequentValues || []).slice(0, 5).map(f => `${f.val} (${f.count})`).join(' | ')].map(escapeCSV).join(';'));
            });
            downloadTextFile(`Audit_${s.tableName.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.csv`, rows.join('\n'));
        }
        function exportAuditJson() {
            const s = currentProfilingStats; if (!s) return showError("Lancez d'abord un audit.");
            const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), ...s }, null, 2)], { type: 'application/json' });
            const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `Audit_${s.tableName.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.json`;
            document.body.appendChild(a); a.click(); a.remove();
        }

        function renderProfilingReport(stats) {
            currentProfilingStats = stats;
            const kpis = el('profilingGlobalKpis');
            const density = stats.totalCells > 0 ? (stats.filledCells / stats.totalCells) * 100 : 0;
            
            kpis.innerHTML = `
                <div class="bg-indigo-50 border border-indigo-100 p-4 rounded-xl shadow-sm"><div class="text-[10px] uppercase font-bold text-indigo-500">Lignes total</div><div class="text-xl font-black mt-1">${stats.totalRows.toLocaleString('fr-FR')}</div></div>
                <div class="bg-emerald-50 border border-emerald-100 p-4 rounded-xl shadow-sm"><div class="text-[10px] uppercase font-bold text-emerald-500">Densité de données</div><div class="text-xl font-black mt-1">${density.toFixed(1)} %</div></div>
                <div class="bg-amber-50 border border-amber-100 p-4 rounded-xl shadow-sm"><div class="text-[10px] uppercase font-bold text-amber-500">Lignes Doublons (strictes)</div><div class="text-xl font-black mt-1">${stats.duplicatesApprox ? '≈ ' : ''}${stats.duplicateRows.toLocaleString('fr-FR')}</div><div class="text-[10px] text-slate-400 mt-0.5">${((stats.duplicateRows / stats.totalRows) * 100).toFixed(1)} %${stats.duplicatesApprox ? ' · estimation (mémoire limitée)' : ''}</div>${(stats.funcDupCols || []).length ? `<div class="text-[11px] mt-2 pt-2 border-t border-amber-200/60"><span class="font-bold text-amber-700">${stats.funcDuplicatesApprox ? '≈ ' : ''}${stats.funcDuplicateRows.toLocaleString('fr-FR')}</span> <span class="text-slate-500">hors clés techniques</span><div class="text-[9px] text-slate-400 mt-0.5 leading-tight" title="Colonnes quasi 100 % uniques, ignorées pour ce comptage : ${escapeHTML(stats.funcDupCols.join(', '))}">sans ${escapeHTML(stats.funcDupCols.slice(0, 3).join(', '))}${stats.funcDupCols.length > 3 ? ` +${stats.funcDupCols.length - 3}` : ''}</div></div>` : ''}</div>
                <div class="bg-red-50 border border-red-100 p-4 rounded-xl shadow-sm"><div class="text-[10px] uppercase font-bold text-red-500">Lignes Vides</div><div class="text-xl font-black mt-1">${stats.emptyRows.toLocaleString('fr-FR')}</div></div>
            `;

            const alertsList = [];
            const alertsDiv = el('profilingAlerts');
            
            for (const cName in stats.columns) {
                const col = stats.columns[cName];
                if (col.completeness < 90) alertsList.push(`<div class="flex items-center gap-2 text-xs bg-red-50 border border-red-100 text-red-700 px-3 py-2 rounded-lg"><i data-lucide="alert-circle" class="w-4 h-4 flex-shrink-0"></i><span>La colonne <strong>${escapeHTML(cName)}</strong> a une complétude faible de ${col.completeness.toFixed(1)}% (${col.nullCount} vides).</span></div>`);
                if (col.semanticType === 'Email' && col.numEmail < (stats.totalRows - col.nullCount)) {
                    const failCount = (stats.totalRows - col.nullCount) - col.numEmail;
                    alertsList.push(`<div class="flex items-center gap-2 text-xs bg-amber-50 border border-amber-100 text-amber-800 px-3 py-2 rounded-lg"><i data-lucide="alert-triangle" class="w-4 h-4 flex-shrink-0"></i><span>La colonne <strong>${escapeHTML(cName)}</strong> contient ${failCount} ligne(s) ne respectant pas le format Email.</span></div>`);
                }
                if (col.semanticType === 'Téléphone' && col.numPhone < (stats.totalRows - col.nullCount)) {
                    const failCount = (stats.totalRows - col.nullCount) - col.numPhone;
                    alertsList.push(`<div class="flex items-center gap-2 text-xs bg-amber-50 border border-amber-100 text-amber-800 px-3 py-2 rounded-lg"><i data-lucide="alert-triangle" class="w-4 h-4 flex-shrink-0"></i><span>La colonne <strong>${escapeHTML(cName)}</strong> contient ${failCount} ligne(s) déviantes du format Téléphone.</span></div>`);
                }
                // Alerte pattern : un format domine nettement (>= 80%) mais des valeurs s'en écartent.
                if (col.patterns && col.patterns.length > 1 && col.patterns[0].pct >= 80) {
                    const deviants = (stats.totalRows - col.nullCount) - col.patterns[0].count;
                    if (deviants > 0) alertsList.push(`<div class="flex items-center gap-2 text-xs bg-purple-50 border border-purple-100 text-purple-800 px-3 py-2 rounded-lg"><i data-lucide="regex" class="w-4 h-4 flex-shrink-0"></i><span>La colonne <strong>${escapeHTML(cName)}</strong> suit majoritairement le format <code class="bg-white border border-purple-200 px-1 rounded font-mono">${escapeHTML(col.patterns[0].pattern)}</code> (${col.patterns[0].pct.toFixed(1)}%) mais <strong>${deviants.toLocaleString('fr-FR')} valeur(s)</strong> s'en écartent (${col.patternDistinct} formats distincts).</span></div>`);
                }
                // Alertes hygiène de saisie
                const hyg = [];
                if (col.spaceIssues > 0) hyg.push(`${col.spaceIssues.toLocaleString('fr-FR')} valeur(s) avec espaces en début/fin`);
                if (col.multiSpace > 0) hyg.push(`${col.multiSpace.toLocaleString('fr-FR')} avec espaces multiples`);
                if (col.placeholders > 0) hyg.push(`${col.placeholders.toLocaleString('fr-FR')} valeur(s) "bouche-trou" (N/A, -, ?, INCONNU...)`);
                if (col.caseDupGroups > 0) hyg.push(`${col.caseDupGroups.toLocaleString('fr-FR')} valeur(s) ne différant que par la casse (PARIS/Paris)`);
                if (col.outliers > 0) hyg.push(`${col.outliers.toLocaleString('fr-FR')} valeur(s) numériques aberrantes (> 3 écarts-types)`);
                if (hyg.length) alertsList.push(`<div class="flex items-center gap-2 text-xs bg-sky-50 border border-sky-100 text-sky-800 px-3 py-2 rounded-lg"><i data-lucide="eraser" class="w-4 h-4 flex-shrink-0"></i><span>Hygiène de <strong>${escapeHTML(cName)}</strong> : ${hyg.join(' · ')}.</span></div>`);
            }

            if (alertsList.length === 0) { alertsDiv.innerHTML = `<p class="text-xs text-green-700 italic">Aucune alerte sémantique détectée sur cet échantillon.</p>`; } 
            else { alertsDiv.innerHTML = `<div class="grid grid-cols-1 md:grid-cols-2 gap-2">${alertsList.join('')}</div>`; }
            // V9.5.1 : section repliée par défaut — le compteur dit ce qu'elle contient sans l'ouvrir.
            const ac = el('qualAlertsCount'); if (ac) { ac.textContent = alertsList.length ? alertsList.length + ' alerte(s)' : 'aucune'; ac.className = 'text-[11px] font-bold rounded-full px-2 py-0.5 normal-case ' + (alertsList.length ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'); }

            const tbody = el('profilingColumnsTableBody');
            const tName2 = state.tables[currentProfilingTableId] ? state.tables[currentProfilingTableId].name : (stats.tableName || '');
            let _tbodyHtml = '';
            let _nAlert = 0, _hygTotal = 0;
            for (const cName in stats.columns) {
                const c = stats.columns[cName]; const pct = c.completeness;
                const [qs, ql] = uxColQuality(c); if (qs !== 'ok') _nAlert++;
                _hygTotal += (c.placeholders || 0) + (c.multiSpace || 0) + (c.caseDupGroups || 0) + (c.outliers || 0);
                const d = colDefFor(tName2, cName);
                const nameHtml = d
                    ? `<span class="tt">${escapeHTML(cName)}<span class="tip"><b>${escapeHTML(cName)}</b><br>${escapeHTML(d.def)}<br><i style="color:#94a3b8">${escapeHTML(d.src)}</i></span></span>`
                    : escapeHTML(cName);
                const buckets = (c.frequentValues || []).slice(0, 10).map(v => Number(v.count) || 0);
                const fv0 = c.frequentValues && c.frequentValues[0]; const sample = fv0 ? String(fv0.val !== undefined ? fv0.val : fv0.value) : '';
                _tbodyHtml += `
                    <tr data-col="${escapeHTML(cName)}" tabindex="0" aria-label="Détail de la colonne ${escapeHTML(cName)}">
                        <td class="p-3 font-semibold text-slate-800"><span class="flex items-center gap-2">${typeIconUx(c.semanticType)}<span>${nameHtml}</span></span></td>
                        <td class="p-3 text-[11px] text-slate-500">${escapeHTML(uxTypeOf(c.semanticType)[2])}<div class="text-[9.5px] text-slate-300 font-mono">${escapeHTML(c.physicalType || '')}</div></td>
                        <td class="p-3">${cellMeter(pct)}</td>
                        <td class="p-3 text-xs text-slate-600 font-medium text-right">${c.distinctCount.toLocaleString('fr-FR')}${c.hasMoreDistinct ? '+' : ''}</td>
                        <td class="p-3">${cellDist(buckets)}</td>
                        <td class="p-3">${cellQuality(qs, ql)}</td>
                        <td class="p-3 text-[11px] text-slate-500 font-mono max-w-[140px] overflow-hidden text-ellipsis" title="${escapeHTML(sample)}">${escapeHTML(sample.length > 18 ? sample.slice(0, 18) + '…' : sample)}</td>
                        <td class="p-3 text-slate-300" aria-hidden="true">›</td>
                    </tr>
                `;
            }
            tbody.innerHTML = _tbodyHtml;
            tbody.querySelectorAll('tr').forEach(tr => {
                const open2 = () => openColumnDrawer(tr.dataset.col, tr);
                tr.addEventListener('click', open2);
                tr.addEventListener('keydown', e2 => { if (e2.key === 'Enter') open2(); });
            });
            const nCols2 = Object.keys(stats.columns).length;
            const tf = el('uxProfilTfoot');
            if (tf) tf.textContent = `${nCols2} colonne(s) · ${Number(stats.totalRows || 0).toLocaleString('fr-FR')} ligne(s) auditée(s) · ${_nAlert} colonne(s) en alerte · audit du ${new Date().toLocaleString('fr-FR')}`;
            // Tuiles d'indicateurs (vue d'ensemble d'abord)
            const tiles = el('qualTilesUx');
            if (tiles) {
                const rulesT = (typeof qrRules === 'function' ? qrRules() : []).filter(r => r.table === tName2 && r.last);
                const score = (typeof qrScore === 'function' && rulesT.length) ? qrScore(rulesT) : null;
                const avgC = nCols2 ? Object.values(stats.columns).reduce((a2, c2) => a2 + c2.completeness, 0) / nCols2 : 0;
                const okCols = Object.values(stats.columns).filter(c2 => c2.completeness >= 95).length;
                tiles.classList.remove('hidden');
                tiles.innerHTML = `
                    <div class="tile-ux"><div class="lab">🎯 Score qualité (règles)</div><div class="big" style="color:${score == null ? 'var(--faint)' : meterColor(score)}">${score == null ? '—' : score}<span class="text-sm" style="color:var(--faint)">${score == null ? '' : '/100'}</span></div><div class="sub">${score == null ? 'Déclarez des règles dans 📏 Règles & score' : rulesT.length + ' règle(s) évaluée(s)'}</div></div>
                    <div class="tile-ux"><div class="lab">✓ Complétude moyenne</div><div class="big" style="color:${meterColor(avgC)}">${avgC.toFixed(0)}<span class="text-sm" style="color:var(--faint)">%</span></div><div class="sub">${okCols} colonne(s) ≥ 95 %</div></div>
                    <div class="tile-ux"><div class="lab">⚠️ Colonnes en alerte</div><div class="big" style="color:${_nAlert ? 'var(--bad)' : 'var(--ok)'}">${_nAlert}</div><div class="sub">sur ${nCols2} colonne(s) profilée(s)</div></div>
                    <div class="tile-ux"><div class="lab">🧹 Valeurs à nettoyer</div><div class="big" style="color:${_hygTotal ? 'var(--warn)' : 'var(--ok)'}">${_hygTotal.toLocaleString('fr-FR')}</div><div class="sub">bouche-trous, casse, espaces, aberrantes</div></div>`;
            }
            try { renderContextBar(); } catch (e2) {}

            const listSelector = el('qualColsList');
            let _selHtml = '';
            for (const cName in stats.columns) {
                const c = stats.columns[cName];
                _selHtml += `
                    <button onclick="showColumnProfilingDetail('${escapeHTML(cName.replace(/'/g, "\\'"))}')" id="btn-col-select-${cName}" class="w-full text-left p-2.5 rounded-lg text-xs font-bold text-slate-700 hover:bg-indigo-50 border border-transparent transition-colors flex justify-between items-center">
                        <span class="truncate pr-2">${escapeHTML(cName)}</span><span class="text-[9px] px-1.5 py-0.5 rounded bg-indigo-50 border border-indigo-100 text-indigo-700 uppercase">${c.semanticType}</span>
                    </button>
                `;
            }
            listSelector.innerHTML = _selHtml;

            const firstCol = Object.keys(stats.columns)[0]; if (firstCol) showColumnProfilingDetail(firstCol);
            lucide.createIcons();
        }

        // Replie / déplie d'un coup toutes les sections du tableau de bord de profiling.
        function toggleQualSections(btn) {
            const dets = document.querySelectorAll('#qual-sub-profiling details');
            const anyOpen = [...dets].some(d => d.open);
            dets.forEach(d => d.open = !anyOpen);
            if (btn) btn.textContent = anyOpen ? '⊞ Tout déplier' : '⊟ Tout replier';
        }
        function showColumnProfilingDetail(cName) {
            if (!currentProfilingStats || !currentProfilingStats.columns[cName]) return;
            const c = currentProfilingStats.columns[cName];

            document.querySelectorAll("[id^='btn-col-select-']").forEach(btn => {
                btn.className = "w-full text-left p-2.5 rounded-lg text-xs font-bold text-slate-700 hover:bg-indigo-50 border border-transparent transition-colors flex justify-between items-center";
            });
            const activeBtn = el(`btn-col-select-${cName}`);
            if (activeBtn) activeBtn.className = "w-full text-left p-2.5 rounded-lg text-xs font-bold bg-indigo-50 border-indigo-200 text-indigo-800 transition-colors flex justify-between items-center shadow-sm";

            const panel = el('profilingColumnDetailPanel');
            let typeIcon = "type";
            if (c.semanticType === 'Numérique') typeIcon = "calculator";
            if (c.semanticType === 'Date/Heure') typeIcon = "calendar";
            if (c.semanticType === 'Email') typeIcon = "mail";
            if (c.semanticType === 'Téléphone') typeIcon = "phone";

            const fillRate = c.completeness;
            
            let statsGridHtml = "";
            if (c.semanticType === 'Numérique') {
                statsGridHtml = `
                    <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
                        <div class="p-3 border rounded-xl bg-slate-50"><span class="text-[10px] text-slate-500 uppercase block font-bold">Moyenne</span><span class="text-sm font-black text-slate-800">${c.mean.toLocaleString('fr-FR', {maximumFractionDigits: 2})}</span></div>
                        <div class="p-3 border rounded-xl bg-slate-50"><span class="text-[10px] text-slate-500 uppercase block font-bold">Écart-Type estimé</span><span class="text-sm font-black text-slate-800">${c.stdDev.toLocaleString('fr-FR', {maximumFractionDigits: 2})}</span></div>
                        <div class="p-3 border rounded-xl bg-slate-50"><span class="text-[10px] text-slate-500 uppercase block font-bold">Minimum</span><span class="text-sm font-black text-slate-800">${c.min !== null ? c.min.toLocaleString('fr-FR') : '-'}</span></div>
                        <div class="p-3 border rounded-xl bg-slate-50"><span class="text-[10px] text-slate-500 uppercase block font-bold">Maximum</span><span class="text-sm font-black text-slate-800">${c.max !== null ? c.max.toLocaleString('fr-FR') : '-'}</span></div>
                        <div class="p-3 border rounded-xl bg-slate-50 col-span-2 md:col-span-1"><span class="text-[10px] text-slate-500 uppercase block font-bold">Somme</span><span class="text-sm font-black text-slate-800">${c.sum.toLocaleString('fr-FR', {maximumFractionDigits: 0})}</span></div>
                    </div>
                    ${c.median != null ? `<div class="mt-3">
                        <div class="text-[10px] text-slate-400 uppercase font-bold mb-1.5">Distribution — la médiane et les quartiles décrivent mieux qu'une moyenne une série déséquilibrée</div>
                        <div class="grid grid-cols-5 gap-2">${[['P05', c.p05], ['Q1 (25 %)', c.p25], ['Médiane', c.median], ['Q3 (75 %)', c.p75], ['P95', c.p95]].map(([l, v]) =>
                            `<div class="p-2 border rounded-lg ${l === 'Médiane' ? 'bg-indigo-50 border-indigo-200' : 'bg-white'}"><span class="text-[9px] text-slate-500 uppercase block font-bold">${l}</span><span class="text-[12px] font-black ${l === 'Médiane' ? 'text-indigo-700' : 'text-slate-700'}">${v == null ? '—' : Number(v).toLocaleString('fr-FR', { maximumFractionDigits: 2 })}</span></div>`).join('')}</div>
                        ${(() => { const iqr = (c.p75 != null && c.p25 != null) ? c.p75 - c.p25 : null;
                            // On mesure l'écart moyenne/médiane à l'aune de l'écart INTERQUARTILE : l'écart-type
                            // est lui-même gonflé par les valeurs extrêmes, il masquerait l'asymétrie qu'on cherche.
                            const scale = (iqr && iqr > 0) ? iqr * 0.5 : ((c.stdDev || 0) * 0.5);
                            return scale > 0 && Math.abs(c.median - c.mean) > scale; })() ? `<div class="text-[10px] text-amber-700 mt-1.5">⚠ Moyenne (${c.mean.toLocaleString('fr-FR', { maximumFractionDigits: 2 })}) et médiane (${c.median.toLocaleString('fr-FR', { maximumFractionDigits: 2 })}) s'écartent nettement : distribution asymétrique, la moyenne est tirée par les extrêmes.</div>` : ''}
                    </div>` : ''}
                `;
            } else {
                statsGridHtml = `
                    <div class="grid grid-cols-3 gap-3">
                        <div class="p-3 border rounded-xl bg-slate-50"><span class="text-[10px] text-slate-500 uppercase block font-bold">Long. Min</span><span class="text-sm font-black text-slate-800">${c.minLen} car.</span></div>
                        <div class="p-3 border rounded-xl bg-slate-50"><span class="text-[10px] text-slate-500 uppercase block font-bold">Long. Max</span><span class="text-sm font-black text-slate-800">${c.maxLen} car.</span></div>
                        <div class="p-3 border rounded-xl bg-slate-50"><span class="text-[10px] text-slate-500 uppercase block font-bold">Long. Moyenne</span><span class="text-sm font-black text-slate-800">${c.avgLen.toFixed(1)} car.</span></div>
                    </div>
                    ${c.semanticType === 'Date/Heure' && (c.dateMin || c.dateMax) ? `<div class="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3">
                        <div class="p-2 border rounded-lg bg-white"><span class="text-[9px] text-slate-500 uppercase block font-bold">Première date</span><span class="text-[12px] font-black text-slate-700">${escapeHTML(c.dateMin || '—')}</span></div>
                        <div class="p-2 border rounded-lg bg-white"><span class="text-[9px] text-slate-500 uppercase block font-bold">Dernière date</span><span class="text-[12px] font-black text-slate-700">${escapeHTML(c.dateMax || '—')}</span></div>
                        <div class="p-2 border rounded-lg bg-white" title="Une date future est souvent normale (échéance, fin de contrat, date planifiée) : ce nombre est indicatif, il n'est pas signalé comme anomalie."><span class="text-[9px] text-slate-500 uppercase block font-bold">Dans le futur</span><span class="text-[12px] font-black text-slate-500">${Number(c.datesFuture || 0).toLocaleString('fr-FR')}</span>${c.datesFar ? `<span class="block text-[9px] font-bold text-amber-700">dont ${Number(c.datesFar).toLocaleString('fr-FR')} invraisemblable(s)</span>` : ''}</div>
                        <div class="p-2 border rounded-lg ${c.datesAncient ? 'bg-amber-50 border-amber-200' : 'bg-white'}"><span class="text-[9px] text-slate-500 uppercase block font-bold">Avant 1900</span><span class="text-[12px] font-black ${c.datesAncient ? 'text-amber-700' : 'text-slate-400'}">${Number(c.datesAncient || 0).toLocaleString('fr-FR')}</span></div>
                    </div>` : ''}
                `;
            }

            let frequenciesHtml = `<div class="text-slate-400 italic text-xs py-4">Aucune donnée de fréquence disponible.</div>`;
            if (c.frequentValues.length > 0) {
                const maxFreqVal = c.frequentValues[0].count;
                frequenciesHtml = `<div class="space-y-3">`;
                c.frequentValues.forEach(f => {
                    const relativeWidth = (f.count / maxFreqVal) * 100;
                    frequenciesHtml += `
                        <div>
                            <div class="flex justify-between text-xs mb-1"><span class="font-bold text-slate-700 truncate max-w-[250px]" title="${escapeHTML(f.val)}">${escapeHTML(f.val === "" ? "(Vide)" : f.val)}</span><span class="text-slate-500 font-mono font-bold">${f.count.toLocaleString('fr-FR')} fois (${f.percentage.toFixed(1)}%)</span></div>
                            <div class="w-full bg-slate-100 h-2 rounded-full overflow-hidden"><div class="bg-indigo-600 h-2 rounded-full" style="width: ${relativeWidth}%"></div></div>
                        </div>
                    `;
                });
                frequenciesHtml += `</div>`;
            }

            // Formats (patterns) détectés : masques triés par fréquence, le premier étant le format
            // dominant. La barre est colorée en violet pour le dominant, ambre pour les déviants.
            let patternsHtml = '';
            if (c.patterns && c.patterns.length) {
                const maxPat = c.patterns[0].count;
                const extra = c.patternDistinct > c.patterns.length ? ` <span class="normal-case font-medium text-slate-400">(${c.patternDistinct} formats distincts au total)</span>` : '';
                patternsHtml = `<div class="mb-6"><h5 class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Formats détectés${extra}</h5>
                    <p class="text-[10px] text-slate-400 mb-3">A = lettre · 9 = chiffre · ponctuation et espaces conservés</p>
                    <div class="space-y-2">` + c.patterns.map((p, i) => `
                        <div>
                            <div class="flex justify-between text-xs mb-1"><code class="font-mono font-bold ${i === 0 ? 'text-purple-700' : 'text-amber-700'}">${escapeHTML(p.pattern) || '(vide)'}</code><span class="text-slate-500 font-mono">${p.count.toLocaleString('fr-FR')} (${p.pct.toFixed(1)}%)</span></div>
                            <div class="w-full bg-slate-100 h-2 rounded-full overflow-hidden"><div class="${i === 0 ? 'bg-purple-600' : 'bg-amber-400'} h-2 rounded-full" style="width: ${(p.count / maxPat) * 100}%"></div></div>
                        </div>`).join('') + `</div></div>`;
            }

            // Anomalies de CET attribut, avec 👁 Voir / ⬇ CSV — mêmes prédicats que l'inspecteur global.
            let colAnomaliesHtml = ''; const kindIdx = {};
            try {
                const entries = qualAnomalyEntries(currentProfilingStats, currentProfilingTableId).filter(e => e.col === cName);
                colAnomaliesHtml = `<div class="mb-6"><h5 class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">🔍 Anomalies de cet attribut — voir & extraire</h5>` +
                    (entries.length
                        ? `<div class="border border-amber-200 rounded-xl overflow-hidden"><table class="w-full text-left text-xs"><tbody class="divide-y divide-amber-100">` +
                          entries.map(e => { const esql = currentProfilingWhere ? `SELECT * FROM (${e.sql}) __flt WHERE ${currentProfilingWhere}` : e.sql; const idx = registerQualInspect(`${e.col} — ${e.kind}`, esql); kindIdx[e.kind] = idx;
                              return `<tr class="hover:bg-amber-50/40"><td class="p-2.5">${escapeHTML(e.kind)}</td><td class="p-2.5 text-right font-black text-amber-700 whitespace-nowrap">${e.n.toLocaleString('fr-FR')}</td><td class="p-2.5 whitespace-nowrap">${qualInspectButtons(idx)}</td></tr>`; }).join('') +
                          `</tbody></table></div><p class="text-[10px] text-slate-400 mt-1.5">👁 Voir = échantillon paginé · ⬇ CSV = totalité des lignes en anomalie (table complète).</p>`
                        : '<p class="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg p-2.5">✔ Aucune anomalie détectée sur cet attribut.</p>') + `</div>`;
            } catch (e) { colAnomaliesHtml = ''; }
            // Tuile d'hygiène cliquable → ouvre directement les lignes concernées.
            const idxOfPrefix = pre => { const k = Object.keys(kindIdx).find(x => x.startsWith(pre)); return k !== undefined ? kindIdx[k] : null; };
            panel.innerHTML = `
                <div class="flex items-center gap-3 border-b pb-4 mb-5"><div class="p-3 bg-indigo-100 rounded-lg text-indigo-700"><i data-lucide="${typeIcon}"></i></div><div><h4 class="text-lg font-black text-slate-800">${escapeHTML(c.name)}</h4><span class="text-xs text-indigo-700 font-bold bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100 uppercase">${c.semanticType}</span></div></div>
                <div class="grid grid-cols-2 gap-4 mb-6">
                    <div class="border rounded-xl p-3 bg-slate-50/50"><span class="text-xs text-slate-500 block uppercase font-bold mb-1">Taux de remplissage</span><div class="flex items-center gap-2"><span class="text-xl font-black" style="color:${meterColor(fillRate)}">${fmtPctUx(fillRate)}</span><span class="text-xs text-slate-400">${(currentProfilingStats && currentProfilingStats.totalRows ? Math.max(0, currentProfilingStats.totalRows - c.nullCount).toLocaleString('fr-FR') + ' renseignée(s) · ' : '')}${Number(c.nullCount).toLocaleString('fr-FR')} vide(s)</span></div></div>
                    <div class="border rounded-xl p-3 bg-slate-50/50"><span class="text-xs text-slate-500 block uppercase font-bold mb-1">Cardinalité</span><div class="flex items-center gap-2"><span class="text-xl font-black text-slate-800">${c.distinctCount.toLocaleString('fr-FR')}${c.hasMoreDistinct ? '+' : ''}</span><span class="text-xs text-slate-400">valeur(s) distincte(s)</span></div></div>
                </div>
                ${(() => { const tn2 = (state.tables[currentProfilingTableId] || {}).name; if (!tn2) return '';
                    const bound = vlBindingFor(tn2, c.name);
                    const box = bound ? ((c.outsideList || 0) > 0 ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-emerald-50 border-emerald-200 text-emerald-800') : 'bg-slate-50 border-slate-200 text-slate-600';
                    return `<div class="mb-4 text-[11px] ${box} border rounded-lg px-3 py-2 flex items-center gap-2 flex-wrap">
                        <span>🎚️ <strong>Liste de valeurs</strong></span>
                        ${vlSelectHtml(tn2, c.name, bound ? bound.id : '')}
                        <span>${bound
                            ? ((c.outsideList || 0) > 0
                                ? `<strong>${Number(c.outsideList).toLocaleString('fr-FR')}</strong> valeur(s) hors référentiel. Les alertes de rareté et de valeurs aberrantes sont désactivées sur cet attribut — un code peu fréquent y est normal.`
                                : 'toutes les valeurs appartiennent au référentiel. Les alertes de rareté sont désactivées sur cet attribut.')
                            : 'Si cet attribut ne prend que des valeurs d\'une liste figée, rattachez-le : l\'audit contrôlera l\'appartenance au référentiel au lieu de signaler les codes rares.'}</span>
                    </div>`; })()}
                ${c.vlError ? `<div class="mb-4 text-[11px] bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-red-700">🎚️ Liste de valeurs non exploitable : ${escapeHTML(c.vlError)}.</div>` : ''}
                ${c.dateDemoted ? `<div class="mb-4 text-[11px] bg-sky-50 border border-sky-200 rounded-lg px-3 py-2 text-sky-800">📐 Cette colonne <strong>ressemble</strong> à des dates mais n'en contient pas : seules ${Number(c.dateParsedPct || 0).toFixed(0)} % des valeurs s'analysent réellement comme une date. Elle est traitée comme du texte, et aucune alerte de date n'est produite.</div>` : ''}
                ${(() => { const tags = [];
                    if (c.isCandidateKey) tags.push(['bg-emerald-50 border-emerald-200 text-emerald-800', '🔑 Clé candidate', 'Toujours renseignée et sans doublon : cette colonne peut identifier une ligne à elle seule.']);
                    if (c.isConstant) tags.push(['bg-amber-50 border-amber-200 text-amber-800', '▪ Colonne constante', 'Une seule valeur sur toute la table : elle n\'apporte aucune information.']);
                    if (c.duplicateOf) tags.push(['bg-amber-50 border-amber-200 text-amber-800', '⧉ Recopie de « ' + escapeHTML(c.duplicateOf) + ' »', 'Valeurs strictement identiques à celles de cette autre colonne, ligne à ligne.']);
                    if (!c.isConstant && !c.isCandidateKey && c.cardinalityRatio != null && c.cardinalityRatio > 0 && c.cardinalityRatio < 0.02 && c.distinctCount > 1) tags.push(['bg-sky-50 border-sky-200 text-sky-800', '≡ Peu de valeurs (' + c.distinctCount.toLocaleString('fr-FR') + ')', 'Faible cardinalité : bonne candidate pour une liste de valeurs autorisées.']);
                    return tags.length ? `<div class="flex flex-wrap gap-2 mb-5">${tags.map(([cl, l, ti]) => `<span title="${ti}" class="text-[11px] font-bold px-2.5 py-1 rounded-lg border ${cl}">${l}</span>`).join('')}</div>` : ''; })()}
                <div class="mb-6"><h5 class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Statistiques descriptives</h5>${statsGridHtml}</div>
                ${(currentProfilingStats && currentProfilingStats.groupCol && c.semanticType === 'Numérique') ? `<div class="mb-4 text-[11px] bg-violet-50 border border-violet-200 rounded-lg px-3 py-2 text-violet-800">🧭 Analyse <strong>contextuelle</strong> activée : les valeurs sont comparées à l'intérieur de chaque <strong>${escapeHTML(currentProfilingStats.groupCol)}</strong>${c.ctxGroups ? ` (${Number(c.ctxGroups).toLocaleString('fr-FR')} groupe(s) d'au moins 5 lignes)` : ''}.${c.madSigma ? ` Score robuste disponible : une valeur est signalée au-delà de 3,5 écarts médians.` : ''}</div>` : ''}
                <div class="mb-6"><h5 class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Hygiène de saisie</h5>
                    <div class="grid grid-cols-2 md:grid-cols-5 gap-2">
                        ${[['Espaces déb./fin', c.spaceIssues, 'Espaces début/fin'], ['Espaces multiples', c.multiSpace, 'Espaces multiples'], ['Bouche-trous', c.placeholders, 'Valeurs bouche-trous'], ['Variantes de casse', c.caseDupGroups, 'Casse incohérente'], ['Aberrantes (3σ)', c.outliers, 'Valeurs aberrantes'], ['Aberrantes (écart interq.)', c.outliersIqr, 'Valeurs atypiques'], ['Extrêmes (score MAD)', c.outliersMad, 'Valeurs extrêmes'], ['Aberrantes dans leur groupe', c.outliersCtx, 'Valeurs aberrantes dans leur groupe']].map(([lbl, v, pre]) => { const ix = (v || 0) > 0 ? idxOfPrefix(pre) : null; const clickable = ix !== null;
                            return `<${clickable ? 'button' : 'div'} ${clickable ? `onclick="qualViewInspect(${ix}, this, 0)" title="Voir les lignes concernées"` : ''} class="p-2.5 border rounded-xl text-left ${(v || 0) > 0 ? 'bg-sky-50 border-sky-200' + (clickable ? ' hover:bg-sky-100 hover:border-sky-400 cursor-pointer' : '') : 'bg-slate-50'}"><span class="text-[9px] text-slate-500 uppercase block font-bold">${lbl}${clickable ? ' 👁' : ''}</span><span class="text-sm font-black ${(v || 0) > 0 ? 'text-sky-700' : 'text-slate-400'}">${(v || 0).toLocaleString('fr-FR')}</span></${clickable ? 'button' : 'div'}>`; }).join('')}
                    </div>
                </div>
                ${colAnomaliesHtml}
                ${patternsHtml}
                ${currentProfilingTableId ? `<div class="mb-6 border border-teal-200 bg-teal-50/40 rounded-xl p-4">
                    <h5 class="text-xs font-bold text-teal-800 uppercase tracking-wider mb-1">Patterns fonctionnels</h5>
                    <p class="text-[10px] text-slate-500 mb-2">Détecte les mots récurrents dans la colonne, la présence du nom de l'objet (table ou objet métier), et croise avec les colonnes de la table et de ses tables liées (modèle de données, 2 niveaux) — ex : "le libellé commence par une valeur de sites.ville".</p>
                    <button onclick="analyzeFunctionalPatterns('${escapeHTML(cName.replace(/'/g, "\\'"))}')" id="btnFuncPat" class="text-xs bg-teal-600 text-white px-3 py-1.5 rounded-lg font-bold hover:bg-teal-700">🔎 Détecter les patterns fonctionnels</button>
                    <div id="funcPatternsResult" class="mt-3"></div>
                </div>` : ''}
                <div><h5 class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Top 10 des valeurs fréquentes</h5>${frequenciesHtml}</div>
            `;
            lucide.createIcons({ root: panel });
        }

        // Périmètre d'analyse fonctionnelle : la table auditée, les tables qui lui sont DIRECTEMENT
        // liées dans le modèle de données, et le parent de ce lien (2 niveaux) — jamais toutes les tables chargées.
        function relatedTableIdsForAnalysis(tId) {
            const adj = {};
            state.relations.forEach(r => {
                if (!r.sourceCol || !r.targetCol) return;
                (adj[r.sourceTable] = adj[r.sourceTable] || new Set()).add(r.targetTable);
                (adj[r.targetTable] = adj[r.targetTable] || new Set()).add(r.sourceTable);
            });
            const seen = new Set([tId]);
            let frontier = [tId];
            for (let hop = 0; hop < 2; hop++) {
                const next = [];
                frontier.forEach(id => (adj[id] || new Set()).forEach(n => { if (!seen.has(n)) { seen.add(n); next.push(n); } }));
                frontier = next;
            }
            return seen;
        }

        // Détection de patterns FONCTIONNELS sur une colonne (typiquement un libellé) :
        //  1. mots récurrents dans la colonne elle-même (+ mot répété deux fois dans un même libellé),
        //  2. présence du nom de l'objet (table auditée ou objet métier du référentiel de gouvernance),
        //  3. croisement avec les colonnes de la table et des tables liées (modèle de données, 2 niveaux) pour
        //     détecter les compositions du type "VILLE - libellé".
        async function analyzeFunctionalPatterns(colName) {
            const tId = currentProfilingTableId;
            const target = state.tables[tId];
            const out = el('funcPatternsResult'); const btn = el('btnFuncPat');
            if (!target || !out) return;
            btn.disabled = true;
            const sampleOption = el('qualSampleSize').value;
            const sampleSql = sampleOption === 'all' ? '' : `ORDER BY __rn LIMIT ${parseInt(sampleOption)}`;
            const rawL = `CAST(${sqlIdent(colName)} AS VARCHAR)`;
            const labSql = `SELECT __rn, UPPER(TRIM(${rawL})) AS lv FROM ${sqlIdent(duckTableName(tId))} WHERE ${sqlIdent(colName)} IS NOT NULL AND TRIM(${rawL}) <> '' ${sampleSql}`;
            const regexEscape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

            try {
                const { conn } = await getDB();
                out.innerHTML = '<p class="text-xs text-teal-700">Analyse des mots récurrents...</p>';

                const totalRes = await conn.query(`WITH lab AS (${labSql}) SELECT COUNT(*)::BIGINT AS n FROM lab`);
                const totalLab = Number(arrowResultToObjects(totalRes)[0].n);
                if (totalLab === 0) { out.innerHTML = '<p class="text-xs text-slate-500 italic">Colonne vide sur l\'échantillon analysé.</p>'; btn.disabled = false; return; }

                // 1. Mots récurrents à travers les libellés de la table
                const tokRes = await conn.query(`
                    WITH lab AS (${labSql}),
                    tok AS (SELECT __rn, UNNEST(string_split_regex(lv, '[^A-Z0-9À-Þ]+')) AS tk FROM lab)
                    SELECT tk, COUNT(DISTINCT __rn)::BIGINT AS c
                    FROM tok WHERE LENGTH(tk) >= 2 AND regexp_matches(tk, '[A-ZÀ-Þ]')
                    GROUP BY 1 ORDER BY c DESC LIMIT 10`);
                const freqTokens = arrowResultToObjects(tokRes).map(r => ({ word: r.tk, count: Number(r.c), pct: (Number(r.c) / totalLab) * 100 })).filter(t => t.pct >= 10).slice(0, 8);

                // Mot répété plusieurs fois DANS un même libellé (souvent un doublon de saisie)
                const repRes = await conn.query(`
                    WITH lab AS (${labSql}),
                    tok AS (SELECT __rn, UNNEST(string_split_regex(lv, '[^A-Z0-9À-Þ]+')) AS tk FROM lab)
                    SELECT COUNT(DISTINCT __rn)::BIGINT AS n FROM (
                        SELECT __rn FROM tok WHERE LENGTH(tk) >= 2 AND regexp_matches(tk, '[A-ZÀ-Þ]') GROUP BY __rn, tk HAVING COUNT(*) >= 2
                    ) d`);
                const intraRep = Number(arrowResultToObjects(repRes)[0].n);

                // 2. Nom de l'objet retrouvé dans le libellé (table auditée + objets métier de la gouvernance)
                const objectWords = [];
                const addWords = (label, origin) => String(label || '').toUpperCase().split(/[^A-Z0-9À-Þ]+/).forEach(w => { if (w.length >= 3 && !objectWords.some(o => o.word === w)) objectWords.push({ word: w, origin }); });
                addWords(cleanFileName(target.name), `table "${target.name}"`);
                state.governance.businessObjects.forEach(bo => addWords(bo.name, `objet métier "${bo.name}"`));
                if (objectWords.length > 24) objectWords.length = 24;
                const objNameHits = [];
                if (objectWords.length) {
                    const exprs = objectWords.map((o, i) => `SUM(CASE WHEN regexp_matches(lv, '(^|[^A-Z0-9À-Þ])${regexEscape(o.word)}([^A-Z0-9À-Þ]|$)') THEN 1 ELSE 0 END)::BIGINT AS w${i}`);
                    const objRes = await conn.query(`WITH lab AS (${labSql}) SELECT ${exprs.join(', ')} FROM lab`);
                    const row = arrowResultToObjects(objRes)[0];
                    objectWords.forEach((o, i) => { const n = Number(row['w' + i]); if (n / totalLab >= 0.05) objNameHits.push({ ...o, count: n, pct: (n / totalLab) * 100 }); });
                    objNameHits.sort((a, b) => b.pct - a.pct);
                }

                // 3. Croisement, restreint à la table auditée et à ses tables liées (2 niveaux MCD)
                const allowed = relatedTableIdsForAnalysis(tId);
                const scopeTables = Object.values(state.tables).filter(t => t.status === 'ready' && allowed.has(t.id));
                const candidates = [];
                scopeTables.forEach(t => t.headers.forEach(h => { if (!(t.id === tId && h === colName)) candidates.push({ tId: t.id, tName: t.name, col: h }); }));
                if (candidates.length > 120) candidates.length = 120;

                const results = [];
                for (let i = 0; i < candidates.length; i++) {
                    const cand = candidates[i];
                    out.innerHTML = `<p class="text-xs text-teal-700">Croisement ${i + 1} / ${candidates.length} — ${escapeHTML(cand.tName)}.${escapeHTML(cand.col)}...</p>`;
                    const rawR = `CAST(${sqlIdent(cand.col)} AS VARCHAR)`;
                    try {
                        const res = await conn.query(`
                            WITH lab AS (${labSql}),
                            vals AS (
                                SELECT DISTINCT UPPER(TRIM(${rawR})) AS v
                                FROM ${sqlIdent(duckTableName(cand.tId))}
                                WHERE ${sqlIdent(cand.col)} IS NOT NULL AND LENGTH(TRIM(${rawR})) >= 2
                                  AND regexp_matches(UPPER(TRIM(${rawR})), '[A-ZÀ-Þ]')
                            ),
                            tok AS (SELECT __rn, UNNEST(string_split_regex(lv, '[^A-Z0-9À-Þ]+')) AS tk FROM lab),
                            contains_m AS (SELECT DISTINCT t.__rn FROM tok t JOIN vals ON t.tk = vals.v WHERE LENGTH(t.tk) >= 2),
                            starts_tok AS (SELECT DISTINCT l.__rn FROM lab l JOIN vals ON regexp_extract(l.lv, '^[A-Z0-9À-Þ]+') = vals.v),
                            starts_seg AS (SELECT DISTINCT l.__rn FROM lab l JOIN vals ON TRIM(regexp_extract(l.lv, '^[^-–/|,;:()]+')) = vals.v)
                            SELECT (SELECT COUNT(*) FROM vals)::BIGINT AS nvals,
                                   (SELECT COUNT(*) FROM contains_m)::BIGINT AS c_n,
                                   (SELECT COUNT(*) FROM (SELECT __rn FROM starts_tok UNION SELECT __rn FROM starts_seg) u)::BIGINT AS s_n
                        `);
                        const r = arrowResultToObjects(res)[0];
                        const nvals = Number(r.nvals), cN = Number(r.c_n), sN = Number(r.s_n);
                        if (nvals < 2 || nvals > 100000) continue;
                        const cPct = (cN / totalLab) * 100, sPct = (sN / totalLab) * 100;
                        if (cPct >= 20) results.push({ ...cand, cPct, sPct });
                    } catch (e) { /* colonne candidate inutilisable (type exotique) : on l'ignore */ }
                }
                results.sort((a, b) => (b.sPct - a.sPct) || (b.cPct - a.cPct));
                const top = results.slice(0, 8);

                // ---- Rendu des trois sections ----
                let html = '';
                if (freqTokens.length) {
                    const maxTok = freqTokens[0].count;
                    html += `<div class="mb-4"><div class="text-[10px] uppercase font-bold text-teal-800 mb-1.5">🔁 Mots récurrents dans les libellés de la table</div>` +
                        freqTokens.map(t2 => `<div class="mb-1.5">
                            <div class="flex justify-between text-xs mb-0.5"><span class="font-mono font-bold text-slate-700">${escapeHTML(t2.word)}</span><span class="text-slate-500 font-mono">${t2.count.toLocaleString('fr-FR')} libellé(s) (${t2.pct.toFixed(1)}%)</span></div>
                            <div class="w-full bg-white border border-teal-100 h-1.5 rounded-full overflow-hidden"><div class="bg-slate-400 h-1.5 rounded-full" style="width: ${(t2.count / maxTok) * 100}%"></div></div>
                        </div>`).join('') + '</div>';
                }
                if (intraRep > 0) {
                    html += `<div class="mb-4 text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-2.5">⚠️ <strong>${intraRep.toLocaleString('fr-FR')} libellé(s)</strong> contiennent un même mot répété plusieurs fois dans la même valeur (doublon de saisie probable, ex: "PARIS PARIS Centre").</div>`;
                }
                if (objNameHits.length) {
                    html += `<div class="mb-4"><div class="text-[10px] uppercase font-bold text-teal-800 mb-1.5">🏷️ Nom d'objet retrouvé dans les libellés</div>` +
                        objNameHits.map(o => `<div class="text-xs mb-1">Le mot <code class="bg-white border border-teal-200 px-1 rounded font-mono font-bold">${escapeHTML(o.word)}</code> <span class="text-slate-400">(${escapeHTML(o.origin)})</span> apparaît dans <strong>${o.pct.toFixed(1)}%</strong> des libellés (${o.count.toLocaleString('fr-FR')}).</div>`).join('') + '</div>';
                }
                html += `<div><div class="text-[10px] uppercase font-bold text-teal-800 mb-1.5">🔗 Croisement avec la table et ses tables liées (${scopeTables.length} table(s) : ${scopeTables.map(t2 => escapeHTML(t2.name)).join(', ')})</div>`;
                if (scopeTables.length === 1 && state.relations.length === 0) html += `<p class="text-[10px] text-slate-400 mb-2">Aucune relation du modèle de données définie (étape 2) : le croisement est limité aux colonnes de la table auditée.</p>`;
                if (!top.length) {
                    html += `<p class="text-xs text-slate-500 italic">Aucune composition détectée sur ce périmètre (seuil : 20% des lignes).</p></div>`;
                } else {
                    html += top.map(r2 => {
                        const isStart = r2.sPct >= 50;
                        const label = isStart
                            ? `Commence par une valeur de <strong>${escapeHTML(r2.tName)}.${escapeHTML(r2.col)}</strong>`
                            : `Contient une valeur de <strong>${escapeHTML(r2.tName)}.${escapeHTML(r2.col)}</strong>`;
                        const pct = isStart ? r2.sPct : r2.cPct;
                        return `<div class="mb-2">
                            <div class="flex justify-between text-xs mb-1"><span>${isStart ? '🏁' : '🧩'} ${label}</span><span class="font-mono font-bold text-teal-700">${pct.toFixed(1)}%${isStart && r2.cPct > r2.sPct ? ` <span class="text-slate-400 font-normal">(contient : ${r2.cPct.toFixed(0)}%)</span>` : ''}</span></div>
                            <div class="w-full bg-white border border-teal-100 h-2 rounded-full overflow-hidden"><div class="${isStart ? 'bg-teal-600' : 'bg-teal-400'} h-2 rounded-full" style="width: ${Math.min(100, pct)}%"></div></div>
                        </div>`;
                    }).join('') + `<p class="text-[10px] text-slate-400 mt-2">Correspondance par mot entier (insensible à la casse). Les valeurs multi-mots sont détectées en début de libellé (avant un séparateur), pas en milieu de texte.</p></div>`;
                }
                out.innerHTML = html;
            } catch (e) { out.innerHTML = `<p class="text-xs text-red-600">Analyse impossible : ${escapeHTML(e.message)}</p>`; }
            finally { btn.disabled = false; }
        }

        async function runQualityAudit(retried) {
            const tId = el('qualTable').value, col = el('qualCol').value, sampleOption = el('qualSampleSize').value;
            const sampleLimit = sampleOption === 'all' ? 'all' : parseInt(sampleOption);
            // Filtre : soit celui du carré fichier, soit celui reporté depuis l'audit d'un objet métier.
            const whereSql = qualAuditWhereOverride != null ? qualAuditWhereOverride : buildQualWhere('file');
            qualAuditWhereOverride = null;

            if (!tId) return showError("Veuillez sélectionner une table à auditer.");
            hideError();
            currentProfilingTableId = tId;
            currentProfilingWhere = whereSql;
            currentProfilingGroupCol = (el('qualGroupCol') && el('qualGroupCol').value !== col) ? (el('qualGroupCol') || {}).value || '' : '';

            el('qualResultArea').classList.remove('hidden'); el('qualLoading').classList.remove('hidden'); el('qualDashboard').classList.add('hidden'); el('btnRunQual').disabled = true;
            bgTaskStart(`Audit de "${state.tables[tId] ? state.tables[tId].name : ''}" en cours`);

            const qualLoadingText = el('qualLoadingText'), qualProgressBar = el('qualProgressBar');
            qualProgressBar.style.width = '10%'; qualLoadingText.innerText = "Calcul du Data Profiling déterministe local...";

            try {
                const stats = await performDeterministicProfiling(tId, sampleLimit, col, whereSql);
                qualInspectRegistry = []; // nouveau cycle d'audit : purge le registre des consultations
                renderProfilingReport(stats);
                renderQualAnomalyInspector(stats, tId);
                recordQualityHistory(stats, col);
                // Table conçue : volet contribution/qualité par source + écarts inter-sources.
                try { await renderDesignedSourcePanel(tId); } catch (ePanel) { console.warn(ePanel); }

                // Règles métier déclarées dans le modèle de données qui touchent la table auditée
                try {
                    const tName = state.tables[tId]?.name;
                    const rules = (state.governance.rules || []).filter(r => r.parentTable === tName || r.childTable === tName);
                    if (rules.length) {
                        qualLoadingText.innerText = "Vérification des règles métier du modèle de données...";
                        const alertsDiv = el('profilingAlerts');
                        for (const rule of rules) {
                            try {
                                const res = await auditBusinessRule(rule);
                                const div = document.createElement('div');
                                div.className = res.viol > 0
                                    ? 'p-3 rounded-lg border bg-red-50 border-red-200 text-red-800'
                                    : 'p-3 rounded-lg border bg-emerald-50 border-emerald-200 text-emerald-800';
                                let inspectBtns = '';
                                if (res.viol > 0) { const vs = bizRuleViolRowsSql(rule); if (vs) inspectBtns = qualInspectButtons(registerQualInspect(`Règle : ${bizRuleLabel(rule)}`, vs)); }
                                div.innerHTML = `<div class="font-bold text-xs uppercase mb-0.5">Règle métier (modèle de données)</div>` +
                                    `<div class="text-sm">${escapeHTML(bizRuleLabel(rule))}</div>` +
                                    `<div class="text-xs mt-1">${res.viol > 0 ? `⚠️ ${res.viol.toLocaleString('fr-FR')} parent(s) sur ${res.total.toLocaleString('fr-FR')} ne respectent pas la règle` + (res.examples?.length ? ` — ex : ${res.examples.map(x => escapeHTML(String(x))).join(', ')}` : '') : `✔ Règle respectée sur ${res.total.toLocaleString('fr-FR')} parent(s)`}${inspectBtns}</div>`;
                                if (alertsDiv) alertsDiv.prepend(div);
                            } catch (e2) { console.warn('Règle métier non vérifiable', rule, e2); }
                        }
                    }
                } catch (e1) { console.warn('Audit des règles métier ignoré :', e1); }

                el('qualLoading').classList.add('hidden');
                el('qualDashboard').classList.remove('hidden');
                switchQualSubTab('profiling');
                bgTaskEnd("✅ Audit terminé — résultats dans l'onglet Qualité.");
            } catch (e) {
                bgTaskEnd();
                // Erreur de lecture CSV pendant le scan (guillemet non fermé, ligne malformée…) :
                // on répare la source automatiquement puis on relance l'audit UNE fois.
                if (!retried && isCsvScanError(e)) {
                    let fixed = false;
                    try { fixed = await autoFixCsvRead(tId, e); } catch (e2) {}
                    if (fixed) { qualAuditWhereOverride = whereSql; return runQualityAudit(true); }
                }
                showError("Erreur lors du profilage : " + e.message); el('qualResultArea').classList.add('hidden');
            } finally { el('btnRunQual').disabled = false; }
        }

    
