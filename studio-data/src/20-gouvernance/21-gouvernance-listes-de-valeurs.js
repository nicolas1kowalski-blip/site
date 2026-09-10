        // ============ V6.27 : LISTES DE VALEURS (référentiels de codes) ============
        // Une liste de valeurs dit ce qu'un attribut a le droit de contenir. Deux façons de la définir :
        //   • en clair   : on saisit « code ; libellé ; statut » ligne à ligne ;
        //   • par source : une table déjà chargée sert de référentiel. Elle peut porter PLUSIEURS listes,
        //     auquel cas une colonne « nom de la liste » les distingue.
        // Conséquence directe sur l'audit : une colonne rattachée à une liste n'est plus jugée sur la
        // RARETÉ de ses valeurs (un code 1 ou 2 rare reste parfaitement normal), mais sur leur
        // APPARTENANCE au référentiel — ce qui est la seule question qui vaille.
        function vlList() {
            const governance = state.governance;
            governance.valueLists = governance.valueLists || [];
            return governance.valueLists;
        }
        // Sélecteur de rattachement, identique dans le dictionnaire (par table ET par objet métier),
        // dans la fiche d'audit d'une colonne et dans l'écran des listes.
        function vlSelectHtml(tableName, col, cur) {
            const T = escapeHTML(String(tableName).replace(/'/g, "\\'")),
                C = escapeHTML(String(col).replace(/'/g, "\\'"));
            if (!vlList().length)
                return `<a data-ro="keep" onclick="openGovTab('vlists')" class="text-[10px] text-indigo-600 font-bold cursor-pointer underline">créer une liste →</a>`;
            return `<select onchange="vlBind('${T}','${C}', this.value)" title="Rattacher cet attribut à une liste de valeurs : l'audit contrôlera l'appartenance au référentiel au lieu de signaler les valeurs rares." class="border p-1.5 rounded text-xs bg-white max-w-[160px] ${cur ? 'border-indigo-400 bg-indigo-50/60 font-bold text-indigo-800' : 'border-slate-200'}"><option value="">— aucune —</option>${vlList()
                .map(L => `<option value="${L.id}" ${cur === L.id ? 'selected' : ''}>${escapeHTML(L.name)}</option>`)
                .join('')}</select>`;
        }
        function vlBindPickTable(id) {
            const table = tableByName(el('vlb-t-' + id).value);
            const element = el('vlb-c-' + id);
            if (element)
                element.innerHTML =
                    '<option value="">— colonne —</option>' +
                    (table
                        ? table.headers.map(h => `<option value="${escapeHTML(h)}">${escapeHTML(h)}</option>`).join('')
                        : '');
        }
        function vlBindFromPicker(id) {
            const element = el('vlb-t-' + id).value,
                col = el('vlb-c-' + id).value;
            if (!element || !col) return showError('Choisissez une table et une colonne à rattacher.');
            vlBind(element, col, id);
            showSuccess(`🎚️ ${element}.${col} est rattaché à la liste « ${(vlById(id) || {}).name} ».`);
        }
        function vlBind(tableName, col, listId) {
            updateDictColField(tableName, col, 'valueListId', listId || '');
            if (typeof renderGovernance === 'function') renderGovernance();
            if (
                currentProfilingStats &&
                currentProfilingTableId &&
                (state.tables[currentProfilingTableId] || {}).name === tableName
            ) {
                const c = currentProfilingStats.columns[col];
                if (c) {
                    const L = listId ? vlById(listId) : null;
                    c.valueListName = L ? L.name : null;
                    if (!L) {
                        c.outsideList = null;
                        c.vlError = null;
                    }
                }
                if (el('profilingColumnDetailPanel')) showColumnProfilingDetail(col);
                if (typeof renderQualAnomalyInspector === 'function')
                    renderQualAnomalyInspector(currentProfilingStats, currentProfilingTableId);
            }
        }
        function vlById(id) {
            return vlList().find(v => v.id === id) || null;
        }
        function vlAdd() {
            vlList().push({
                id: 'vl_' + generateId(),
                name: 'Nouvelle liste',
                description: '',
                kind: 'inline',
                values: [],
                srcTable: '',
                colCode: '',
                colLabel: '',
                colStatus: '',
                colList: '',
                listValue: '',
                activeStatus: ''
            });
            persistAppState();
            renderGovernance();
        }
        function vlSet(id, f, v) {
            const L = vlById(id);
            if (!L) return;
            L[f] = v;
            if (f === 'srcTable') {
                L.colCode = '';
                L.colLabel = '';
                L.colStatus = '';
                L.colList = '';
                L.listValue = '';
            }
            persistAppState();
            renderGovernance();
        }
        function vlDel(id) {
            const L = vlById(id);
            if (!L) return;
            const used = vlUsage(id);
            if (
                !confirm(
                    `Supprimer la liste « ${L.name} » ?` +
                        (used.length ? `\n\n${used.length} attribut(s) y sont rattachés — ils ne seront plus contrôlés.` : '')
                )
            )
                return;
            state.governance.valueLists = vlList().filter(v => v.id !== id);
            used.forEach(u => {
                const dictionaryEntry = (state.governance.dictionary || {})[u.table];
                if (dictionaryEntry && dictionaryEntry.columns[u.col]) delete dictionaryEntry.columns[u.col].valueListId;
            });
            persistAppState();
            renderGovernance();
        }
        // Saisie en clair : une ligne = code ; libellé ; statut (les deux derniers sont facultatifs).
        function vlParseInline(txt) {
            return String(txt || '')
                .split('\n')
                .map(l => l.trim())
                .filter(Boolean)
                .map(l => {
                    const p = l.split(';').map(x => x.trim());
                    return { code: p[0] || '', label: p[1] || '', status: p[2] || '' };
                })
                .filter(v => v.code);
        }
        function vlSetInline(id, txt) {
            const L = vlById(id);
            if (!L) return;
            L.values = vlParseInline(txt);
            persistAppState();
            renderGovernance();
        }
        function vlInlineText(L) {
            return (L.values || []).map(v => [v.code, v.label, v.status].filter((x, i) => i === 0 || x).join(' ; ')).join('\n');
        }
        // Attributs rattachés à une liste (dictionnaire).
        function vlUsage(id) {
            const out = [];
            Object.entries(state.governance.dictionary || {}).forEach(([tn, d]) => {
                Object.entries(d.columns || {}).forEach(([col, c]) => {
                    if (c && c.valueListId === id) out.push({ table: tn, col });
                });
            });
            return out;
        }
        function vlBindingFor(tableName, col) {
            const dictionaryEntry = (state.governance.dictionary || {})[tableName];
            const c = dictionaryEntry && dictionaryEntry.columns && dictionaryEntry.columns[col];
            return c && c.valueListId ? vlById(c.valueListId) : null;
        }
        // Requête SQL rendant les codes autorisés — utilisable dans un NOT IN.
        // Les codes sont normalisés (majuscules, sans espaces de bord) des DEUX côtés de la comparaison.
        const vlNk = x => `NULLIF(UPPER(TRIM(CAST(${x} AS VARCHAR))), '')`;
        function vlCodesSql(L) {
            if (!L) return null;
            if (L.kind === 'table') {
                const table = tableByName(L.srcTable);
                if (!table || table.status !== 'ready' || !L.colCode) return null;
                const where = [];
                if (L.colList && L.listValue)
                    where.push(`${vlNk(sqlIdent(L.colList))} = ${sqlLiteral(String(L.listValue).trim().toUpperCase())}`);
                if (L.colStatus && L.activeStatus)
                    where.push(`${vlNk(sqlIdent(L.colStatus))} = ${sqlLiteral(String(L.activeStatus).trim().toUpperCase())}`);
                return `SELECT ${vlNk(sqlIdent(L.colCode))} AS c FROM ${sqlIdent(duckTableName(table.id))} WHERE ${vlNk(sqlIdent(L.colCode))} IS NOT NULL${where.length ? ' AND ' + where.join(' AND ') : ''}`;
            }
            const vals = (L.values || []).filter(
                v =>
                    !L.activeStatus ||
                    !v.status ||
                    String(v.status).trim().toUpperCase() === String(L.activeStatus).trim().toUpperCase()
            );
            if (!vals.length) return null;
            return `SELECT * FROM (VALUES ${vals.map(v => `(${sqlLiteral(String(v.code).trim().toUpperCase())})`).join(', ')}) AS t(c)`;
        }
        // Condition SQL « cette valeur n'appartient pas au référentiel » (vide = non contrôlé).
        function vlOutsideCond(L, colExpr) {
            const codes = vlCodesSql(L);
            if (!codes) return null;
            return `(${vlNk(colExpr)} IS NOT NULL AND ${vlNk(colExpr)} NOT IN (${codes}))`;
        }
        function vlCount(L) {
            if (!L) return null;
            if (L.kind === 'inline') return (L.values || []).length;
            return null; // liste par source : le décompte se fait à l'exécution
        }
        function vlLabel(L) {
            return L
                ? `${L.name}${L.kind === 'table' ? ` (source ${L.srcTable || '?'})` : ` (${(L.values || []).length} code(s))`}`
                : '';
        }
        // Aperçu à la demande d'une liste par source : combien de codes, et lesquels.
        async function vlPreview(id, btn) {
            const L = vlById(id);
            const box = el('vl-prev-' + id);
            if (!L || !box) return;
            const codes = vlCodesSql(L);
            if (!codes) {
                box.innerHTML = '<span class="text-[11px] text-red-600">Complétez la source et la colonne du code.</span>';
                return;
            }
            if (btn) btn.disabled = true;
            try {
                const { conn } = await getDB();
                const rows = arrowResultToObjects(
                    await conn.query(`SELECT c FROM (${codes}) q GROUP BY 1 ORDER BY 1 LIMIT 50`)
                );
                const n = arrowResultToObjects(await conn.query(`SELECT COUNT(DISTINCT c)::BIGINT AS n FROM (${codes}) q`))[0];
                box.innerHTML = `<span class="text-[11px] text-slate-600"><strong>${Number(n.n).toLocaleString('fr-FR')}</strong> code(s) : ${rows.map(r => `<span class="inline-block bg-white border border-slate-200 rounded px-1.5 py-0.5 mr-1 mb-1 font-mono text-[10px]">${escapeHTML(String(r.c))}</span>`).join('')}${Number(n.n) > 50 ? ' …' : ''}</span>`;
            } catch (e) {
                box.innerHTML = `<span class="text-[11px] text-red-600">${escapeHTML(e.message)}</span>`;
            } finally {
                if (btn) btn.disabled = false;
            }
        }
        function renderValueLists() {
            const lists = vlList();
            const readyTables = Object.values(state.tables).filter(t => t.status === 'ready');
            let html = `<div class="flex items-center justify-between mb-2">
                <div><h3 class="text-base font-black text-slate-800">🎚️ Listes de valeurs</h3>
                <p class="text-xs text-slate-500 mt-0.5">Déclarez ce qu'un attribut a le droit de contenir. Un attribut rattaché à une liste n'est plus jugé sur la <strong>rareté</strong> de ses valeurs — un code peu fréquent reste normal — mais sur leur <strong>appartenance</strong> au référentiel.</p>
                </div>
                <button onclick="vlAdd()" class="text-xs bg-indigo-600 text-white px-3 py-2 rounded-lg font-bold whitespace-nowrap">+ Liste</button>
            </div>`;
            if (!lists.length)
                return (
                    html +
                    emptyStateHtml(
                        '🎚️',
                        'Aucune liste de valeurs',
                        'Saisissez vos codes en clair, ou désignez une table déjà chargée qui sert de référentiel (nom de liste, code, libellé, statut).',
                        '+ Créer une liste',
                        'vlAdd()'
                    )
                );
            html += lists
                .map(L => {
                    const used = vlUsage(L.id);
                    const table = tableByName(L.srcTable);
                    const hs = table ? table.headers : [];
                    const colSel = (f, ph) =>
                        `<select onchange="vlSet('${L.id}','${f}',this.value)" class="border border-slate-300 rounded p-1.5 text-[11px] bg-white"><option value="">${ph}</option>${hs.map(h => `<option value="${escapeHTML(h)}" ${L[f] === h ? 'selected' : ''}>${escapeHTML(h)}</option>`).join('')}</select>`;
                    return `<div class="border border-slate-200 rounded-xl p-4 mb-3 bg-white">
                    <div class="flex items-center gap-2 flex-wrap mb-2">
                        <input type="text" value="${escapeHTML(L.name)}" onchange="vlSet('${L.id}','name',this.value)" class="font-black text-sm border border-slate-200 rounded px-2 py-1 w-56">
                        <select onchange="vlSet('${L.id}','kind',this.value)" class="border border-slate-300 rounded p-1.5 text-[11px] bg-white">
                            <option value="inline" ${L.kind === 'inline' ? 'selected' : ''}>Codes saisis en clair</option>
                            <option value="table" ${L.kind === 'table' ? 'selected' : ''}>Depuis une table de référence</option>
                        </select>
                        <input type="text" value="${escapeHTML(L.description || '')}" onchange="vlSet('${L.id}','description',this.value)" placeholder="à quoi sert cette liste…" class="border border-slate-200 rounded px-2 py-1 text-[11px] flex-grow min-w-[160px]">
                        <span class="text-[10px] font-bold px-2 py-1 rounded ${used.length ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-500'}" title="${used.map(u => u.table + '.' + u.col).join(', ') || 'Rattachez-la à un attribut depuis le Dictionnaire'}">${used.length} attribut(s) rattaché(s)</span>
                        <button onclick="vlDel('${L.id}')" class="text-slate-300 hover:text-red-600 font-bold">✕</button>
                    </div>
                    ${
                        L.kind === 'inline'
                            ? `
                        <label class="text-[10px] uppercase font-bold text-slate-400 block mb-1">Codes — une ligne par valeur : <span class="font-mono normal-case">code ; libellé ; statut</span> (libellé et statut facultatifs)</label>
                        <textarea onchange="vlSetInline('${L.id}', this.value)" rows="4" placeholder="1 ; Actif&#10;2 ; Suspendu&#10;3 ; Résilié ; OBSOLETE" class="w-full border border-slate-300 rounded p-2 text-[11px] font-mono">${escapeHTML(vlInlineText(L))}</textarea>`
                            : `
                        <div class="flex items-end gap-2 flex-wrap">
                            <div><label class="text-[9px] uppercase font-bold text-slate-400 block">Table de référence</label>
                            <select onchange="vlSet('${L.id}','srcTable',this.value)" class="border border-slate-300 rounded p-1.5 text-[11px] bg-white"><option value="">— table —</option>${readyTables.map(t2 => `<option value="${escapeHTML(t2.name)}" ${L.srcTable === t2.name ? 'selected' : ''}>${escapeHTML(t2.name)}</option>`).join('')}</select></div>
                            <div><label class="text-[9px] uppercase font-bold text-slate-400 block">Code</label>${colSel('colCode', '— code —')}</div>
                            <div><label class="text-[9px] uppercase font-bold text-slate-400 block">Libellé</label>${colSel('colLabel', '— facultatif —')}</div>
                            <div><label class="text-[9px] uppercase font-bold text-slate-400 block">Statut</label>${colSel('colStatus', '— facultatif —')}</div>
                            <div><label class="text-[9px] uppercase font-bold text-slate-400 block" title="Si la table porte PLUSIEURS listes, la colonne qui les distingue.">Nom de liste</label>${colSel('colList', '— une seule liste —')}</div>
                            ${L.colList ? `<div><label class="text-[9px] uppercase font-bold text-slate-400 block">Valeur du nom</label><input type="text" value="${escapeHTML(L.listValue || '')}" onchange="vlSet('${L.id}','listValue',this.value)" placeholder="ex: STATUT_CONTRAT" class="border border-slate-300 rounded p-1.5 text-[11px] w-40"></div>` : ''}
                        </div>`
                    }
                    <div class="flex items-end gap-2 flex-wrap mt-2">
                        <div><label class="text-[9px] uppercase font-bold text-slate-400 block" title="Ne retenir que les codes portant ce statut. Laisser vide pour accepter tous les codes de la liste.">Statut « actif »</label>
                        <input type="text" value="${escapeHTML(L.activeStatus || '')}" onchange="vlSet('${L.id}','activeStatus',this.value)" placeholder="ex: ACTIF (facultatif)" class="border border-slate-300 rounded p-1.5 text-[11px] w-40"></div>
                        <button data-ro="keep" onclick="vlPreview('${L.id}', this)" class="text-[11px] bg-white border border-slate-300 px-2.5 py-1.5 rounded font-bold text-slate-600">👁 Aperçu des codes</button>
                        <div id="vl-prev-${L.id}" class="flex-grow"></div>
                    </div>
                    <div class="mt-2 flex items-end gap-2 flex-wrap border-t border-slate-100 pt-2">
                        <div><label class="text-[9px] uppercase font-bold text-slate-400 block">Rattacher un attribut</label>
                        <select id="vlb-t-${L.id}" onchange="vlBindPickTable('${L.id}')" class="border border-slate-300 rounded p-1.5 text-[11px] bg-white"><option value="">— table —</option>${readyTables.map(t2 => `<option value="${escapeHTML(t2.name)}">${escapeHTML(t2.name)}</option>`).join('')}</select></div>
                        <div><label class="text-[9px] uppercase font-bold text-slate-400 block">Colonne</label>
                        <select id="vlb-c-${L.id}" class="border border-slate-300 rounded p-1.5 text-[11px] bg-white"><option value="">— colonne —</option></select></div>
                        <button onclick="vlBindFromPicker('${L.id}')" class="text-[11px] bg-indigo-600 text-white px-3 py-1.5 rounded font-bold">🎚️ Rattacher</button>
                        <span class="text-[10px] text-slate-400">se fait aussi depuis <b>📚 Dictionnaire</b> (colonne « Liste de valeurs ») ou depuis la fiche d'une colonne dans <b>Qualité &amp; Audit</b>.</span>
                    </div>
                    ${used.length ? `<div class="mt-2 text-[10px] text-slate-500">Rattachée à : ${used.map(u => `<span class="font-mono bg-slate-100 rounded px-1.5 py-0.5 mr-1">${escapeHTML(u.table)}.${escapeHTML(u.col)} <button onclick="vlBind('${escapeHTML(u.table)}','${escapeHTML(String(u.col).replace(/'/g, "\\'"))}','')" class="text-slate-400 hover:text-red-600 font-bold" title="Détacher">✕</button></span>`).join('')}</div>` : '<div class="mt-2 text-[10px] text-slate-400 italic">Pas encore rattachée à un attribut.</div>'}
                </div>`;
                })
                .join('');
            return html;
        }
        function updateDictColField(tn, col, f, v) {
            const dictionaryEntry = ensureDictEntry(tn);
            if (!dictionaryEntry.columns[col]) dictionaryEntry.columns[col] = {};
            dictionaryEntry.columns[col][f] = v;
            if (f === 'examples') dictionaryEntry.columns[col].examplesAuto = false;
            persistAppState();
        }

        // Remplit automatiquement les exemples de valeurs de chaque attribut en interrogeant la source
        // réelle dans DuckDB (quelques valeurs distinctes non vides par colonne).
        async function sampleTableExamples(tn) {
            const table = tableByName(tn);
            if (!table || table.status !== 'ready') return showError('Table introuvable ou non chargée.');
            const btn = el('btnSampleExamples');
            if (btn) {
                btn.disabled = true;
                btn.textContent = 'Analyse de la source...';
            }
            try {
                const { conn } = await getDB();
                const dictionaryEntry = ensureDictEntry(tn);
                for (const h of table.headers) {
                    const raw = `TRIM(CAST(${sqlIdent(h)} AS VARCHAR))`;
                    const res = await conn.query(
                        `SELECT DISTINCT ${raw} AS v FROM ${sqlIdent(duckTableName(table.id))} WHERE ${sqlIdent(h)} IS NOT NULL AND ${raw} <> '' LIMIT 4`
                    );
                    const vals = arrowResultToObjects(res).map(r => String(r.v).slice(0, 40));
                    if (!dictionaryEntry.columns[h]) dictionaryEntry.columns[h] = {};
                    dictionaryEntry.columns[h].examples = vals.join(' ; ');
                    dictionaryEntry.columns[h].examplesAuto = true;
                }
                persistAppState();
                renderGovernance();
                showSuccess(`Exemples échantillonnés depuis la source pour "${tn}".`);
            } catch (e) {
                showError('Échantillonnage impossible : ' + e.message);
                if (btn) {
                    btn.disabled = false;
                }
                renderGovernance();
            }
        }
