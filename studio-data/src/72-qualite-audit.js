        // ==========================================
        //  STEP 8: QUALITÉ ET AUDIT PAR LOTS
        // ==========================================
        function populateQualTables() {
            el('qualTable').innerHTML = tableOptionsHtml({ placeholder: 'Sélectionner une table...', readyOnly: true });
            const boSel = el('qualBoSelect');
            if (boSel) {
                const bos = (state.governance.businessObjects || []);
                boSel.innerHTML = bos.length ? bos.map(b => `<option value="${b.id}">${escapeHTML(b.name)}</option>`).join('') : '<option value="">— aucun objet métier défini —</option>';
            }
            renderQualFilters('file'); renderQualFilters('bo');
        }

        // ---- Profiling d'un OBJET MÉTIER : profiling de la table maître + TOUTES les règles de l'objet ----
        // Vérifie la cardinalité 1–1 d'une facette : chaque ligne de la table maître doit avoir exactement
        // une ligne de la table de la facette qui respecte son filtre fonctionnel.
        async function auditFacetCardinality(bo, st) {
            const master = boMasterTable(bo); const child = tableByName(st.table);
            if (!master || !child) throw new Error('Tables non chargées.');
            const rel = state.relations.find(r => r.sourceCol && r.targetCol && ((r.sourceTable === master.id && r.targetTable === child.id) || (r.targetTable === master.id && r.sourceTable === child.id)));
            if (!rel) throw new Error(`Aucun lien du modèle de données direct entre ${master.name} et ${st.table}.`);
            const pCol = rel.sourceTable === master.id ? rel.sourceCol : rel.targetCol;
            const cCol = rel.sourceTable === master.id ? rel.targetCol : rel.sourceCol;
            const condSql = (st.scope || []).length ? ' AND ' + (st.scope || []).map(c => scopeCondSql(c).replaceAll(sqlIdent(c.col), 'x.' + sqlIdent(c.col))).join(' AND ') : '';
            // Applicabilité : la facette ne concerne que les lignes maîtres d'une catégorie/type/nature donnée.
            const appliesSql = (st.applies || []).length ? ' AND ' + (st.applies || []).map(c => scopeCondSql(c).replaceAll(sqlIdent(c.col), 'p.' + sqlIdent(c.col))).join(' AND ') : '';
            const { conn } = await getDB();
            const norm = (a, c) => `NULLIF(UPPER(TRIM(CAST(${a}.${sqlIdent(c)} AS VARCHAR))), '')`;
            const wMaster = boSourceWhere(bo, master.name), wChild = boSourceWhere(bo, st.table);
            const res = await conn.query(`
                WITH par AS (SELECT DISTINCT ${norm('p', pCol)} AS k, MIN(TRIM(CAST(p.${sqlIdent(pCol)} AS VARCHAR))) AS disp FROM ${sqlIdent(duckTableName(master.id))} p WHERE ${norm('p', pCol)} IS NOT NULL ${appliesSql}${wMaster ? ' AND (' + wMaster + ')' : ''} GROUP BY 1),
                cnt AS (SELECT ${norm('x', cCol)} AS k, COUNT(*)::BIGINT AS c FROM ${sqlIdent(duckTableName(child.id))} x WHERE ${norm('x', cCol)} IS NOT NULL ${condSql}${wChild ? ' AND (' + wChild + ')' : ''} GROUP BY 1)
                SELECT (SELECT COUNT(*) FROM par)::BIGINT AS total,
                       SUM(CASE WHEN COALESCE(cnt.c, 0) = 0 THEN 1 ELSE 0 END)::BIGINT AS missing,
                       SUM(CASE WHEN COALESCE(cnt.c, 0) > 1 THEN 1 ELSE 0 END)::BIGINT AS multi,
                       list(CASE WHEN COALESCE(cnt.c, 0) <> 1 THEN par.disp END) FILTER (WHERE COALESCE(cnt.c, 0) <> 1) AS exs
                FROM par LEFT JOIN cnt ON par.k = cnt.k
            `);
            const r = arrowResultToObjects(res)[0];
            const exs = (Array.isArray(r.exs) ? r.exs : (r.exs && r.exs.toArray ? r.exs.toArray() : [])).filter(Boolean).slice(0, 5);
            return { total: Number(r.total), missing: Number(r.missing || 0), multi: Number(r.multi || 0), examples: exs };
        }
        async function profileBusinessObject() {
            hideError();
            const boId = el('qualBoSelect').value;
            const bo = (state.governance.businessObjects || []).find(b => b.id === boId);
            if (!bo) return showError('Sélectionnez un objet métier (onglet Gouvernance pour en créer).');
            const master = boMasterTable(bo);
            if (!master) return showError(`L'objet "${bo.name}" n'a pas de table maître chargée.`);
            const btn = el('btnQualBo'); btn.disabled = true;
            try {
                // 1. Profiling standard de la table maître (le dashboard complet) + règles touchant la table maître
                // On reporte le volume choisi ici sur le sélecteur du fichier, pour que runQualityAudit l'applique.
                el('qualTable').value = master.id; handleQualTableChange();
                const boSample = el('qualBoSampleSize'); if (boSample) el('qualSampleSize').value = boSample.value;
                // Filtres DÉCLARÉS sur la source maître de l'objet + filtres saisis dans l'écran Qualité.
                const declaredW = boSourceWhere(bo, master.name);
                const adhocW = buildQualWhere('bo');
                qualAuditWhereOverride = [declaredW, adhocW].filter(Boolean).map(x => `(${x})`).join(' AND ');
                await runQualityAudit();
                const alerts = el('profilingAlerts'); if (!alerts) return;
                // 2. En-tête + conteneurs, PUIS audit global (check-list, règles du périmètre, hiérarchies)
                const hiers = getBoHierarchies(bo);
                const head = document.createElement('div');
                head.className = 'p-3 rounded-lg border-2 bg-emerald-50 border-emerald-300';
                head.innerHTML = `<div class="font-black text-sm text-emerald-800">🏛️ Audit de l'objet métier "${escapeHTML(bo.name)}"</div><div class="text-[11px] text-slate-500 mt-0.5">Table maître profilée : <strong>${escapeHTML(master.name)}</strong> — gouvernance, règles métier, hiérarchies et facettes 1–1 vérifiées ci-dessous.</div><div id="bo-global-audit-${bo.id}"></div>`;
                alerts.prepend(head);
                // L'audit global rend lui-même ses conteneurs (hiérarchies + règles + facettes 1–1).
                bgTaskStart(`Audit de l'objet "${bo.name}" en cours`);
                await auditBusinessObject(bo.id);
                bgTaskEnd(`✅ Objet "${bo.name}" profilé avec toutes ses règles — résultats dans l'onglet Qualité.`);
            } catch (e) { showError('Profiling de l\'objet impossible : ' + e.message); }
            finally { btn.disabled = false; bgTaskEnd(); }
        }

        function handleQualTableChange() {
            const tId = el('qualTable').value;
            const colSelect = el('qualCol');
            if (tId && state.tables[tId]) {
                colSelect.innerHTML = '<option value="">Toutes les colonnes (Audit global)</option>' + state.tables[tId].headers.map(h => `<option value="${escapeHTML(h)}">${escapeHTML(h)}</option>`).join('');
            } else {
                colSelect.innerHTML = '<option value="">Toutes les colonnes (Audit global)</option>';
            }
            // V6.23 : colonne de regroupement pour les aberrantes CONTEXTUELLES. On ne propose que des
            // colonnes exploitables comme contexte : ni la colonne auditée, ni une quasi-clé.
            const gSel = el('qualGroupCol');
            if (gSel) {
                const t = tId && state.tables[tId];
                gSel.innerHTML = '<option value="">— toute la table —</option>' + (t ? t.headers.map(h => `<option value="${escapeHTML(h)}">${escapeHTML(h)}</option>`).join('') : '');
            }
            renderQualFilters('file');
        }

        // ======================= Filtres d'audit (fichier + objet métier) =======================
        // Chaque filtre est une liste de conditions {col, op, val, conn}. Les conditions sont
        // combinées de gauche à droite (associativité gauche) avec ET / OU, ce qui donne un
        // regroupement prévisible : « A ET B OU C » ⇒ « (A ET B) OU C ».
        const QUAL_FILTER_OPS = [
            { v: 'eq', t: '= égal à' }, { v: 'neq', t: '≠ différent de' },
            { v: 'contains', t: 'contient' }, { v: 'ncontains', t: 'ne contient pas' },
            { v: 'starts', t: 'commence par' }, { v: 'ends', t: 'finit par' },
            { v: 'empty', t: 'est vide' }, { v: 'nempty', t: "n'est pas vide" },
            { v: 'gt', t: '> supérieur à' }, { v: 'gte', t: '≥ supérieur ou égal' },
            { v: 'lt', t: '< inférieur à' }, { v: 'lte', t: '≤ inférieur ou égal' },
        ];
        const qualFilters = { file: [], bo: [] };

        function qualFilterTableId(scope) {
            if (scope === 'file') return el('qualTable') ? el('qualTable').value : null;
            const bo = (state.governance.businessObjects || []).find(b => b.id === (el('qualBoSelect') ? el('qualBoSelect').value : ''));
            const m = bo && boMasterTable(bo);
            return m ? m.id : null;
        }
        function qualFilterHeaders(scope) {
            const tId = qualFilterTableId(scope);
            return (tId && state.tables[tId]) ? state.tables[tId].headers : [];
        }
        function addQualFilterRow(scope) {
            qualFilters[scope].push({ col: '', op: 'eq', val: '', conn: 'AND' });
            renderQualFilters(scope);
        }
        function removeQualFilterRow(scope, i) { qualFilters[scope].splice(i, 1); renderQualFilters(scope); }
        function updateQualFilter(scope, i, field, value) {
            if (!qualFilters[scope][i]) return;
            qualFilters[scope][i][field] = value;
            if (field === 'op') renderQualFilters(scope); // (dé)masque le champ valeur
        }
        function renderQualFilters(scope) {
            const box = el('qualFilterRows-' + scope); if (!box) return;
            const rows = qualFilters[scope];
            const headers = qualFilterHeaders(scope);
            if (!rows.length) { box.innerHTML = `<p class="text-[11px] text-slate-400 italic">Aucun filtre — toutes les lignes sont auditées.</p>`; return; }
            box.innerHTML = rows.map((c, i) => {
                const pool = (c.col && !headers.includes(c.col)) ? [c.col, ...headers] : headers;
                const colOpts = pool.map(h => `<option value="${escapeHTML(h)}" ${h === c.col ? 'selected' : ''}>${escapeHTML(h)}</option>`).join('');
                const opOpts = QUAL_FILTER_OPS.map(o => `<option value="${o.v}" ${o.v === c.op ? 'selected' : ''}>${o.t}</option>`).join('');
                const needVal = !['empty', 'nempty'].includes(c.op);
                const conn = i === 0
                    ? `<span class="text-[11px] font-bold text-slate-400 w-12 text-center shrink-0">Où</span>`
                    : `<select onchange="updateQualFilter('${scope}',${i},'conn',this.value)" class="w-12 shrink-0 border rounded text-[11px] font-bold px-1 py-1 bg-white cursor-pointer ${c.conn === 'OR' ? 'text-amber-700 border-amber-300' : 'text-indigo-700 border-indigo-300'}"><option value="AND" ${c.conn !== 'OR' ? 'selected' : ''}>ET</option><option value="OR" ${c.conn === 'OR' ? 'selected' : ''}>OU</option></select>`;
                return `<div class="flex items-center gap-1.5">
                    ${conn}
                    <select onchange="updateQualFilter('${scope}',${i},'col',this.value)" class="flex-1 min-w-0 border border-slate-300 rounded px-1.5 py-1 text-xs bg-white"><option value="">— colonne —</option>${colOpts}</select>
                    <select onchange="updateQualFilter('${scope}',${i},'op',this.value)" class="shrink-0 border border-slate-300 rounded px-1 py-1 text-xs bg-white">${opOpts}</select>
                    <input type="text" value="${escapeHTML(c.val || '')}" oninput="updateQualFilter('${scope}',${i},'val',this.value)" placeholder="valeur" class="w-24 shrink-0 border border-slate-300 rounded px-1.5 py-1 text-xs ${needVal ? '' : 'invisible'}">
                    <button type="button" onclick="removeQualFilterRow('${scope}',${i})" class="shrink-0 text-slate-400 hover:text-red-600 px-1" title="Retirer">✕</button>
                </div>`;
            }).join('');
        }
        // Traduit une condition en SQL (toutes les colonnes sont VARCHAR dans DuckDB).
        function qualCondSql(c) {
            if (!c.col || !c.op) return '';
            const id = sqlIdent(c.col);
            const raw = `CAST(${id} AS VARCHAR)`;
            const lit = v => sqlLiteral(v == null ? '' : v);
            switch (c.op) {
                case 'eq': return `${raw} = ${lit(c.val)}`;
                case 'neq': return `${raw} IS DISTINCT FROM ${lit(c.val)}`;
                case 'contains': return `${raw} ILIKE ${lit('%' + c.val + '%')}`;
                case 'ncontains': return `(${raw} NOT ILIKE ${lit('%' + c.val + '%')} OR ${id} IS NULL)`;
                case 'starts': return `${raw} ILIKE ${lit(c.val + '%')}`;
                case 'ends': return `${raw} ILIKE ${lit('%' + c.val)}`;
                case 'empty': return `(${id} IS NULL OR TRIM(${raw}) = '')`;
                case 'nempty': return `(${id} IS NOT NULL AND TRIM(${raw}) <> '')`;
                case 'gt': case 'gte': case 'lt': case 'lte': {
                    const sym = { gt: '>', gte: '>=', lt: '<', lte: '<=' }[c.op];
                    // Valeur au format date (calendrier ou saisie) : comparaison en DATE avec
                    // normalisation tolérante des deux côtés (01/02/2025 ≡ 2025-02-01) — la
                    // comparaison numérique donnait NULL sur les dates, donc toujours faux.
                    if (/^\d{4}-\d{2}-\d{2}$/.test(c.val) || /^\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{4}$/.test(c.val)) {
                        return `COALESCE(TRY_CAST(${tdNormExpr('date', raw)} AS DATE), CAST(TRY_CAST(${raw} AS TIMESTAMP) AS DATE)) ${sym} TRY_CAST(${tdNormExpr('date', lit(c.val))} AS DATE)`;
                    }
                    return `TRY_CAST(REPLACE(${raw}, ',', '.') AS DOUBLE) ${sym} TRY_CAST(REPLACE(${lit(c.val)}, ',', '.') AS DOUBLE)`;
                }
            }
            return '';
        }
        // Construit le corps du WHERE (sans le mot-clé) pour un scope, ou '' si aucun filtre valide.
        function buildQualWhere(scope) {
            const valid = qualFilters[scope].filter(c => c.col && c.op && (['empty', 'nempty'].includes(c.op) || String(c.val || '').length));
            let sql = '';
            valid.forEach(c => {
                const frag = qualCondSql(c); if (!frag) return;
                if (!sql) sql = frag;
                else sql = `(${sql}) ${c.conn === 'OR' ? 'OR' : 'AND'} ${frag}`;
            });
            return sql;
        }


        // Motifs de détection sémantique (mêmes règles qu'avant, traduites en regex SQL/RE2).
        // ======================= Inspecteur d'anomalies =======================
        // Registre des anomalies détectées par l'audit : chaque entrée porte une requête SQL qui
        // renvoie les LIGNES en défaut. Actions partagées : voir un échantillon paginé à l'écran,
        // ou exporter la totalité en CSV pour correction. Alimenté par le profiling (hygiène,
        // formats, aberrants...), les règles métier du modèle de données et les facettes 1–1.
        let qualInspectRegistry = [];
        function registerQualInspect(label, sql, explain) { qualInspectRegistry.push({ label, sql, explain }); return qualInspectRegistry.length - 1; }
        function qualInspectButtons(idx) {
            return `<span class="inline-flex gap-1 ml-2"><button onclick="qualViewInspect(${idx}, this, 0)" class="text-[10px] bg-white border border-slate-300 px-2 py-0.5 rounded font-bold text-slate-600 hover:bg-slate-50">👁 Voir</button><button onclick="qualExportInspect(${idx}, this)" class="text-[10px] bg-white border border-slate-300 px-2 py-0.5 rounded font-bold text-slate-600 hover:bg-slate-50">⬇ CSV</button></span>`;
        }
        // V3 UX : l'inspecteur d'anomalies s'ouvre dans le PANNEAU LATÉRAL (drawer), pas en modale —
        // la liste des anomalies reste visible derrière, on enchaîne les consultations sans se perdre.
        function qualInspectModal() {
            el('uxDrawer').classList.add('wide');
            openUxDrawer({ sem: '', title: 'Lignes en anomalie', sub: 'Consultation sans quitter l\'écran — Échap pour fermer',
                body: `<div id="qualInspectModalHead" class="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-center gap-2 flex-wrap text-xs mb-3"></div><div id="qualInspectModalBody" class="overflow-auto border border-slate-100 rounded-lg"></div>`, foot: '' });
        }
        function closeQualInspectModal() { el('uxDrawer').classList.remove('wide'); closeUxDrawer(); }
        async function qualViewInspect(idx, btn, offset) {
            const entry = qualInspectRegistry[idx]; if (!entry) return;
            qualInspectModal();
            const head = el('qualInspectModalHead'), body = el('qualInspectModalBody');
            head.innerHTML = `<strong class="text-amber-800">${escapeHTML(entry.label)}</strong><button onclick="closeQualInspectModal()" class="ml-auto text-amber-600 hover:text-red-600 font-black text-base leading-none px-1">✕</button>`
                + (entry.explain ? `<div class="w-full mt-1 pt-1 border-t border-amber-200">${entry.explain}</div>` : '');
            body.innerHTML = '<p class="text-xs text-slate-400 p-4">Chargement des lignes en anomalie…</p>';
            try {
                const { conn } = await getDB();
                if (entry.total === undefined) {
                    const cRes = await conn.query(`SELECT COUNT(*)::BIGINT AS n FROM (${entry.sql}) q`);
                    entry.total = Number(arrowResultToObjects(cRes)[0].n);
                }
                const page = 50;
                const res = await conn.query(`SELECT * FROM (${entry.sql}) q LIMIT ${page} OFFSET ${offset}`);
                const rows = arrowResultToObjects(res);
                head.innerHTML = `<strong class="text-amber-800">${escapeHTML(entry.label)}</strong>
                    <span class="text-amber-700">${entry.total.toLocaleString('fr-FR')} ligne(s)${rows.length ? ` — affichage ${(offset + 1).toLocaleString('fr-FR')} à ${Math.min(offset + page, entry.total).toLocaleString('fr-FR')}` : ''}</span>
                    ${offset > 0 ? `<button onclick="qualViewInspect(${idx}, null, ${Math.max(0, offset - page)})" class="bg-white border border-amber-300 px-2.5 py-1 rounded font-bold hover:bg-amber-100">← Précédent</button>` : ''}
                    ${offset + page < entry.total ? `<button onclick="qualViewInspect(${idx}, null, ${offset + page})" class="bg-white border border-amber-300 px-2.5 py-1 rounded font-bold hover:bg-amber-100">Suivant →</button>` : ''}
                    <button onclick="qualExportInspect(${idx}, this)" class="bg-white border border-amber-300 px-2.5 py-1 rounded font-bold hover:bg-amber-100">⬇ Exporter tout (CSV)</button>
                    <button onclick="closeQualInspectModal()" class="ml-auto text-amber-600 hover:text-red-600 font-black text-base leading-none px-1" title="Fermer (Échap)">✕</button>`
                    + (entry.explain ? `<div class="w-full mt-1.5 pt-1.5 border-t border-amber-200">${entry.explain}</div>` : '');
                if (!rows.length && offset === 0) { body.innerHTML = '<p class="text-xs text-emerald-700 p-4">Aucune ligne en anomalie (peut différer de l\'audit si celui-ci portait sur un échantillon).</p>'; return; }
                const cols = rows.length ? Object.keys(rows[0]) : [];
                body.innerHTML = `<table class="w-full text-left text-[11px]"><thead class="bg-slate-100 text-slate-600 font-bold sticky top-0 z-10"><tr>${cols.map(c => `<th class="p-2 whitespace-nowrap">${escapeHTML(c)}</th>`).join('')}</tr></thead><tbody class="divide-y divide-slate-100">${rows.map(rw => `<tr class="hover:bg-amber-50/50">${cols.map(c => `<td class="p-2 whitespace-nowrap">${escapeHTML(rw[c] == null ? '' : String(rw[c]))}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
            } catch (e) { body.innerHTML = `<p class="text-xs text-red-600 p-4">Consultation impossible : ${escapeHTML(e.message)}</p>`; }
        }
        async function qualExportInspect(idx, btn) {
            const entry = qualInspectRegistry[idx]; if (!entry) return;
            const old = btn.textContent; btn.disabled = true; btn.textContent = '…';
            try {
                const { conn } = await getDB();
                const head = await conn.query(`SELECT * FROM (${entry.sql}) q LIMIT 0`);
                const cols = head.schema.fields.map(f => f.name).filter(n => n !== '__rn');
                const cell = v => { if (v === null || v === undefined) return ''; const s = String(v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
                const parts = ['anomalie,' + cols.map(cell).join(',') + '\n'];
                const batch = 20000; let off = 0; const lbl = cell(entry.label);
                while (true) {
                    const res = await conn.query(`SELECT * FROM (${entry.sql}) q LIMIT ${batch} OFFSET ${off}`);
                    const rows = arrowResultToObjects(res);
                    rows.forEach(rw => parts.push(lbl + ',' + cols.map(c => cell(rw[c])).join(',') + '\n'));
                    if (rows.length < batch) break; off += batch;
                }
                const blob = new Blob(['﻿', ...parts], { type: 'text/csv;charset=utf-8;' });
                const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
                a.download = `Anomalies_${entry.label.replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 40)}_${Date.now()}.csv`;
                document.body.appendChild(a); a.click(); a.remove();
                showSuccess(`Export des lignes en anomalie généré (${(parts.length - 1).toLocaleString('fr-FR')} lignes).`);
            } catch (e) { showError('Export impossible : ' + e.message); }
            finally { btn.disabled = false; btn.textContent = old; }
        }
        // Prédicats SQL des anomalies du profiling — appliqués à la TABLE COMPLÈTE.
        function qualAnomalyEntries(stats, tId) {
            const t = state.tables[tId]; if (!t) return [];
            const re = profilingRegex(); const T = sqlIdent(duckTableName(tId));
            const sel = w => `SELECT * EXCLUDE (__rn) FROM ${T} WHERE ${w}`;
            const entries = [];
            const rawOf = h => `CAST(${sqlIdent(h)} AS VARCHAR)`;
            const trimOf = h => `TRIM(${rawOf(h)})`;
            const notBlank = h => `(${sqlIdent(h)} IS NOT NULL AND ${trimOf(h)} <> '')`;
            if (stats.duplicateRows > 0) {
                const dupExpr = `md5(concat_ws(chr(1), ${t.headers.map(h => `COALESCE(${rawOf(h)}, chr(0))`).join(', ')}))`;
                entries.push({ col: '(toute la ligne)', kind: 'Lignes strictement identiques' + (stats.duplicatesApprox ? ' (≈ estimation — la consultation donne le vrai décompte)' : ''), n: stats.duplicateRows, sql: `SELECT * EXCLUDE (__rn) FROM ${T} WHERE ${dupExpr} IN (SELECT ${dupExpr.replace(/\bsrc\b/g, '')} FROM ${T} GROUP BY 1 HAVING COUNT(*) > 1)` });
            }
            // Doublons FONCTIONNELS (hors clés techniques) : les copies sont TRIÉES côte à côte,
            // et les clés ignorées restent affichées pour identifier chaque ligne.
            if (stats.funcDuplicateRows > 0 && (stats.funcDupCols || []).length) {
                const funcHeaders = t.headers.filter(h => !stats.funcDupCols.includes(h));
                if (funcHeaders.length) {
                    const dupExpr2 = `md5(concat_ws(chr(1), ${funcHeaders.map(h => `COALESCE(${rawOf(h)}, chr(0))`).join(', ')}))`;
                    entries.push({
                        col: '(hors clés techniques)',
                        kind: `Lignes identiques hors clés (${stats.funcDupCols.slice(0, 3).join(', ')}${stats.funcDupCols.length > 3 ? '…' : ''} ignorées)` + (stats.funcDuplicatesApprox ? ' (≈ estimation)' : ''),
                        n: stats.funcDuplicateRows,
                        sql: `SELECT * EXCLUDE (__rn) FROM ${T} WHERE ${dupExpr2} IN (SELECT ${dupExpr2} FROM ${T} GROUP BY 1 HAVING COUNT(*) > 1) ORDER BY ${dupExpr2}`
                    });
                }
            }
            if (stats.emptyRows > 0) entries.push({ col: '(toute la ligne)', kind: 'Lignes entièrement vides', n: stats.emptyRows, sql: sel(t.headers.map(h => `(${sqlIdent(h)} IS NULL OR ${trimOf(h)} = '')`).join(' AND ')) });
            Object.values(stats.columns).forEach(c => {
                const h = c.name; if (!t.headers.includes(h)) return;
                const vlBound = vlBindingFor(t.name, h);   // V6.27 : liste de valeurs rattachée à cet attribut
                if (c.spaceIssues > 0) entries.push({ col: h, kind: 'Espaces début/fin', n: c.spaceIssues, sql: sel(`${sqlIdent(h)} IS NOT NULL AND ${rawOf(h)} <> '' AND ${rawOf(h)} <> ${trimOf(h)}`) });
                if (c.multiSpace > 0) entries.push({ col: h, kind: 'Espaces multiples', n: c.multiSpace, sql: sel(`${notBlank(h)} AND regexp_matches(${trimOf(h)}, '  +')`) });
                if (c.placeholders > 0) entries.push({ col: h, kind: 'Valeurs bouche-trous (N/A, -, ?...)', n: c.placeholders, sql: sel(`${notBlank(h)} AND UPPER(${trimOf(h)}) IN ('N/A','NA','NULL','-','--','?','X','XX','INCONNU','NC','TBD','NONE','AUCUN','VIDE','#N/A','SANS','A DEFINIR','À DÉFINIR')`) });
                if (c.caseDupGroups > 0) entries.push({ col: h, kind: 'Casse incohérente (même valeur, casses différentes)', n: c.caseDupGroups, sql: sel(`${notBlank(h)} AND UPPER(${trimOf(h)}) IN (SELECT UPPER(${trimOf(h)}) FROM ${T} WHERE ${notBlank(h)} GROUP BY 1 HAVING COUNT(DISTINCT ${trimOf(h)}) > 1)`) });
                if (c.outliers > 0 && c.stdDev > 0 && !vlBound) {
                    const numE = `TRY_CAST(REPLACE(${trimOf(h)}, ',', '.') AS DOUBLE)`;
                    entries.push({ col: h, kind: `Valeurs aberrantes (hors moyenne ± 3σ)`, n: c.outliers, sql: sel(`${numE} IS NOT NULL AND (${numE} < ${c.mean - 3 * c.stdDev} OR ${numE} > ${c.mean + 3 * c.stdDev})`) });
                }
                // V6.21 : atypiques au sens de Tukey (hors [Q1 − 1,5 IQR ; Q3 + 1,5 IQR]) — pertinent
                // même sur une distribution asymétrique, là où la règle des 3σ ne détecte rien.
                if (c.outliersIqr > 0 && c.iqrLow != null && c.iqrHigh != null && !vlBound) {
                    const numE = `TRY_CAST(REPLACE(${trimOf(h)}, ',', '.') AS DOUBLE)`;
                    entries.push({ col: h, kind: `Valeurs atypiques (hors écart interquartile)`, n: c.outliersIqr, sql: sel(`${numE} IS NOT NULL AND (${numE} < ${c.iqrLow} OR ${numE} > ${c.iqrHigh})`) });
                }
                if (c.outliersMad > 0 && c.madSigma > 0 && !vlBound) {
                    const numE = `TRY_CAST(REPLACE(${trimOf(h)}, ',', '.') AS DOUBLE)`;
                    const score = `ROUND(ABS(${numE} - ${c.median}) / ${c.madSigma}, 2)`;
                    // On expose le SCORE et on trie du plus grave au moins grave : la liste devient
                    // une file de traitement, pas un tas d'anomalies indifférenciées.
                    entries.push({ col: h, kind: 'Valeurs extrêmes (score robuste MAD > 3,5)', n: c.outliersMad,
                        sql: `SELECT ${score} AS ${sqlIdent('SCORE_ECART')}, * EXCLUDE (__rn) FROM ${T} WHERE ${numE} IS NOT NULL AND ABS(${numE} - ${c.median}) / ${c.madSigma} > 3.5 ORDER BY 1 DESC` });
                }
                if (c.outliersCtx > 0 && stats.groupCol && !vlBound) {
                    const G = sqlIdent(stats.groupCol);
                    const numE2 = `TRY_CAST(REPLACE(TRIM(CAST(s2.${sqlIdent(h)} AS VARCHAR)), ',', '.') AS DOUBLE)`;
                    entries.push({ col: h, kind: `Valeurs aberrantes dans leur groupe (${stats.groupCol})`, n: c.outliersCtx,
                        sql: `WITH b AS (SELECT ${G} AS g, approx_quantile(TRY_CAST(REPLACE(TRIM(CAST(${sqlIdent(h)} AS VARCHAR)), ',', '.') AS DOUBLE), 0.25) AS q1,
                                               approx_quantile(TRY_CAST(REPLACE(TRIM(CAST(${sqlIdent(h)} AS VARCHAR)), ',', '.') AS DOUBLE), 0.75) AS q3
                                        FROM ${T} GROUP BY 1 HAVING COUNT(TRY_CAST(REPLACE(TRIM(CAST(${sqlIdent(h)} AS VARCHAR)), ',', '.') AS DOUBLE)) >= 5)
                              SELECT s2.* EXCLUDE (__rn) FROM ${T} s2 JOIN b ON s2.${G} IS NOT DISTINCT FROM b.g
                              WHERE b.q3 > b.q1 AND ${numE2} IS NOT NULL
                                AND (${numE2} < b.q1 - 1.5 * (b.q3 - b.q1) OR ${numE2} > b.q3 + 1.5 * (b.q3 - b.q1))
                              ORDER BY s2.${G}` });
                }
                // V6.25 : une date future n'est PAS une anomalie — une échéance, une fin de contrat ou
                // une date planifiée sont normalement dans le futur. On ne signale que l'invraisemblable :
                // au-delà d'un siècle. Le simple décompte des dates futures reste affiché dans la fiche.
                if (c.datesFar > 0) {
                    const dE = `COALESCE(TRY_CAST(${tdNormExpr('date', `CAST(${sqlIdent(h)} AS VARCHAR)`)} AS DATE), CAST(TRY_CAST(CAST(${sqlIdent(h)} AS VARCHAR) AS TIMESTAMP) AS DATE))`;
                    entries.push({ col: h, kind: 'Dates invraisemblables (plus d\'un siècle dans le futur)', n: c.datesFar, sql: sel(`${dE} > CURRENT_DATE + INTERVAL 100 YEAR`) });
                }
                if (c.datesAncient > 0) {
                    const dE = `COALESCE(TRY_CAST(${tdNormExpr('date', `CAST(${sqlIdent(h)} AS VARCHAR)`)} AS DATE), CAST(TRY_CAST(CAST(${sqlIdent(h)} AS VARCHAR) AS TIMESTAMP) AS DATE))`;
                    entries.push({ col: h, kind: 'Dates antérieures à 1900', n: c.datesAncient, sql: sel(`${dE} < DATE '1900-01-01'`) });
                }
                const validCount = stats.totalRows - c.nullCount;
                const typRe = { 'Numérique': re.num, 'Email': re.email, 'Téléphone': re.phone }[c.semanticType];
                const typN = { 'Numérique': c.numNum, 'Email': c.numEmail, 'Téléphone': c.numPhone }[c.semanticType];
                if (typRe && validCount > typN) entries.push({ col: h, kind: `Ne respecte pas le type ${c.semanticType}`, n: validCount - typN, sql: sel(`${notBlank(h)} AND NOT regexp_matches(${trimOf(h)}, '${typRe}')`) });
                if (c.semanticType === 'Date/Heure' && validCount > c.numDate) entries.push({ col: h, kind: 'Ne respecte pas le type Date', n: validCount - c.numDate, sql: sel(`${notBlank(h)} AND NOT (regexp_matches(${trimOf(h)}, '${re.date1}') OR regexp_matches(${trimOf(h)}, '${re.date2}'))`) });
                // V6.27 : colonne rattachée à une LISTE DE VALEURS. La question n'est plus « cette valeur
                // est-elle rare ? » (un code 1 ou 2 peu fréquent est parfaitement normal) mais « appartient-
                // elle au référentiel ? ». On remplace donc les alertes statistiques par ce seul contrôle.
                if (vlBound) {
                    const cond = vlOutsideCond(vlBound, sqlIdent(h));
                    if (cond && (c.outsideList || 0) > 0) entries.push({ col: h, kind: `Valeur hors référentiel « ${vlBound.name} »`, n: c.outsideList, sql: sel(`${notBlank(h)} AND ${cond}`) });
                    return; // aucune alerte de rareté, de forme ni de valeur aberrante sur cette colonne
                }
                // V6.25 : sur une colonne à faible cardinalité (drapeau TRUE/FALSE, liste de statuts…),
                // la « forme » n'a aucun sens : une valeur simplement RARE apparaissait comme un écart
                // de format. L'analyse de motif est réservée aux colonnes à valeurs libres.
                const enumLike = (c.distinctExact != null ? c.distinctExact : c.distinctCount) <= 15;
                if (!enumLike && (c.patterns || []).length > 1 && c.patterns[0].pct >= 60) {
                    const maskE = `left(regexp_replace(regexp_replace(${trimOf(h)}, '[A-Za-zÀ-ÖØ-öø-ÿ]', 'A', 'g'), '[0-9]', '9', 'g'), 24)`;
                    const devN = c.patterns.slice(1).reduce((s2, p) => s2 + p.count, 0);
                    entries.push({ col: h, kind: `Format hors motif dominant "${c.patterns[0].pattern}"`, n: devN, sql: sel(`${notBlank(h)} AND ${maskE} <> ${sqlLiteral(c.patterns[0].pattern)}`) });
                }
            });
            return entries;
        }
        function renderQualAnomalyInspector(stats, tId) {
            const box = el('qualAnomalyList'); if (!box) return;
            const entries = qualAnomalyEntries(stats, tId);
            const ic = el('qualInspCount'); if (ic) { ic.textContent = entries.length ? entries.length + ' anomalie(s)' : 'aucune'; ic.className = 'text-[11px] font-bold rounded-full px-2 py-0.5 normal-case ' + (entries.length ? 'bg-amber-200 text-amber-900' : 'bg-emerald-100 text-emerald-800'); }
            if (!entries.length) { box.innerHTML = '<p class="text-xs text-emerald-700">✔ Aucune anomalie d\'hygiène ou de format détectée.</p>'; return; }
            box.innerHTML = `<div class="border border-slate-200 rounded-lg overflow-x-auto"><table class="w-full text-left text-xs"><thead class="bg-slate-50 text-[10px] uppercase font-bold text-slate-500"><tr><th class="p-2">Colonne</th><th class="p-2">Anomalie</th><th class="p-2 text-right">Lignes (échantillon audité)</th><th class="p-2">Actions</th></tr></thead><tbody class="divide-y divide-slate-100">` +
                entries.map(e => { const esql = currentProfilingWhere ? `SELECT * FROM (${e.sql}) __flt WHERE ${currentProfilingWhere}` : e.sql; const idx = registerQualInspect(`${e.col} — ${e.kind}`, esql); return `<tr class="hover:bg-amber-50/40"><td class="p-2 font-bold">${escapeHTML(e.col)}</td><td class="p-2">${escapeHTML(e.kind)}</td><td class="p-2 text-right font-black text-amber-700">${e.n == null ? '—' : e.n.toLocaleString('fr-FR')}</td><td class="p-2"><div>${qualInspectButtons(idx)}</div></td></tr>`; }).join('') +
                `</tbody></table></div><p class="text-[10px] text-slate-400 mt-1.5">👁 Voir = échantillon paginé à l'écran (50 lignes) · ⬇ CSV = extraction de la <strong>totalité</strong> des lignes en anomalie (recherche sur la table complète, le comptage peut donc dépasser celui de l'échantillon audité).</p>`;
        }

        // Lignes PARENTS violant une règle métier du modèle de données (pour consultation/export).
        function bizRuleViolRowsSql(rule) {
            const pT = tableByName(rule.parentTable), cT = tableByName(rule.childTable);
            if (!pT || !cT) return null;
            const norm = (a, c) => `NULLIF(UPPER(TRIM(CAST(${a}.${sqlIdent(c)} AS VARCHAR))), '')`;
            const condSql = rule.cond && rule.cond.col ? ' AND ' + scopeCondSql(rule.cond).replaceAll(sqlIdent(rule.cond.col), 'x.' + sqlIdent(rule.cond.col)) : '';
            const opSql = rule.expect === '<=' ? '<=' : (rule.expect === '>=' ? '>=' : '=');
            return `WITH cnt AS (SELECT ${norm('x', rule.childCol)} AS k, COUNT(*)::BIGINT AS c FROM ${sqlIdent(duckTableName(cT.id))} x WHERE ${norm('x', rule.childCol)} IS NOT NULL ${condSql} GROUP BY 1)
                SELECT p.* EXCLUDE (__rn) FROM ${sqlIdent(duckTableName(pT.id))} p LEFT JOIN cnt ON ${norm('p', rule.parentCol)} = cnt.k
                WHERE ${norm('p', rule.parentCol)} IS NOT NULL AND NOT (COALESCE(cnt.c, 0) ${opSql} ${parseInt(rule.n) || 1})`;
        }
        // Lignes de la table maître violant la cardinalité 1–1 d'une facette (0 ou plusieurs occurrences).
        function facetViolRowsSql(bo, st) {
            const master = boMasterTable(bo); const child = tableByName(st.table);
            if (!master || !child) return null;
            const rel = state.relations.find(r => r.sourceCol && r.targetCol && ((r.sourceTable === master.id && r.targetTable === child.id) || (r.targetTable === master.id && r.sourceTable === child.id)));
            if (!rel) return null;
            const pCol = rel.sourceTable === master.id ? rel.sourceCol : rel.targetCol;
            const cCol = rel.sourceTable === master.id ? rel.targetCol : rel.sourceCol;
            const norm = (a, c) => `NULLIF(UPPER(TRIM(CAST(${a}.${sqlIdent(c)} AS VARCHAR))), '')`;
            const condSql = (st.scope || []).length ? ' AND ' + (st.scope || []).map(c => scopeCondSql(c).replaceAll(sqlIdent(c.col), 'x.' + sqlIdent(c.col))).join(' AND ') : '';
            const appliesSql = (st.applies || []).length ? ' AND ' + (st.applies || []).map(c => scopeCondSql(c).replaceAll(sqlIdent(c.col), 'p.' + sqlIdent(c.col))).join(' AND ') : '';
            return `WITH cnt AS (SELECT ${norm('x', cCol)} AS k, COUNT(*)::BIGINT AS c FROM ${sqlIdent(duckTableName(child.id))} x WHERE ${norm('x', cCol)} IS NOT NULL ${condSql} GROUP BY 1)
                SELECT CASE WHEN COALESCE(cnt.c, 0) = 0 THEN 'aucune' ELSE 'plusieurs (' || COALESCE(cnt.c, 0) || ')' END AS defaut, p.* EXCLUDE (__rn)
                FROM ${sqlIdent(duckTableName(master.id))} p LEFT JOIN cnt ON ${norm('p', pCol)} = cnt.k
                WHERE ${norm('p', pCol)} IS NOT NULL ${appliesSql} AND COALESCE(cnt.c, 0) <> 1`;
        }

        function profilingRegex() {
            return {
                num: '^\\s*-?[0-9]+([.,][0-9]+)?\\s*$',
                date1: '^\\s*[0-9]{1,2}[/-][0-9]{1,2}[/-][0-9]{2,4}',
                date2: '^\\s*[0-9]{4}[/-][0-9]{1,2}[/-][0-9]{1,2}',
                email: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$',
                phone: '^\\+?[0-9\\s.\\-()]{8,20}$'
            };
        }

        // Profilage calculé entièrement en SQL (agrégats DuckDB) au lieu d'une boucle JS ligne à ligne :
        // une seule passe sur la table donne complétude/cardinalité/stats numériques pour toutes les
        // colonnes ciblées, ce qui reste rapide même sur plusieurs millions de lignes.
        async function performDeterministicProfiling(tId, sampleLimit, col, whereSql = '') {
            const table = state.tables[tId];
            if (!table) throw new Error("Table non trouvée.");
            const { conn } = await getDB();
            const tName = sqlIdent(duckTableName(tId));
            const targetHeaders = col ? [col] : table.headers;
            const re = profilingRegex();

            const whereClause = whereSql ? ` WHERE ${whereSql}` : '';
            const sourceExpr = sampleLimit === 'all'
                ? `(SELECT * FROM ${tName}${whereClause})`
                : `(SELECT * FROM ${tName}${whereClause} ORDER BY __rn LIMIT ${parseInt(sampleLimit)})`;

            // Statistiques globales : toujours calculées sur TOUTES les colonnes de la table (comme avant),
            // que l'audit porte sur une seule colonne ou non.
            const allColsBlankExpr = table.headers.map(h => `(${sqlIdent(h)} IS NULL OR TRIM(CAST(${sqlIdent(h)} AS VARCHAR)) = '')`).join(' AND ');
            const dupExpr = `md5(concat_ws(chr(1), ${table.headers.map(h => `COALESCE(CAST(${sqlIdent(h)} AS VARCHAR), chr(0))`).join(', ')}))`;

            const globalRes = await conn.query(`
                SELECT
                    COUNT(*)::BIGINT AS total_rows,
                    SUM(CASE WHEN ${allColsBlankExpr} THEN 1 ELSE 0 END)::BIGINT AS empty_rows
                FROM ${sourceExpr} AS src
            `);
            const g = arrowResultToObjects(globalRes)[0];
            const totalRows = Number(g.total_rows);
            if (totalRows === 0) throw new Error("La table est vide.");

            // Doublons stricts : comptage EXACT (COUNT DISTINCT). L'ancien approx_count_distinct
            // (HyperLogLog) dérive de 10-20 % sur >1M de lignes → il annonçait des centaines de
            // milliers de doublons FANTÔMES que « Voir/CSV » (exact) ne retrouvait pas. On ne
            // retombe sur l'approximation qu'en cas de manque de mémoire, en le signalant (≈).
            let duplicateRows = 0, duplicatesApprox = false;
            try {
                const dRes = await conn.query(`SELECT (COUNT(*) - COUNT(DISTINCT ${dupExpr}))::BIGINT AS d FROM ${sourceExpr} AS src`);
                duplicateRows = Math.max(0, Number(arrowResultToObjects(dRes)[0].d));
            } catch (eDup) {
                const dRes = await conn.query(`SELECT (COUNT(*) - approx_count_distinct(${dupExpr}))::BIGINT AS d FROM ${sourceExpr} AS src`);
                duplicateRows = Math.max(0, Number(arrowResultToObjects(dRes)[0].d));
                duplicatesApprox = true;
            }
            g.duplicate_rows = duplicateRows;

            // ---- Doublons FONCTIONNELS : mêmes lignes une fois les clés techniques retirées ----
            // Une clé primaire/technique (ID, GUID, n° auto...) rend chaque ligne unique par
            // construction et masque les vrais doublons métier. On détecte les colonnes quasi
            // 100 % uniques — présélection par estimation (tolérante à la dérive HLL), puis
            // CONFIRMATION EXACTE — et on recompte les doublons sans elles.
            let funcDupCols = [], funcDuplicateRows = 0, funcDuplicatesApprox = false;
            try {
                const KB = 16; const cand = [];
                for (let s = 0; s < table.headers.length; s += KB) {
                    const sl = table.headers.slice(s, s + KB);
                    const exprs = sl.map((h, k) => {
                        const raw = `CAST(${sqlIdent(h)} AS VARCHAR)`;
                        return `approx_count_distinct(NULLIF(TRIM(${raw}), ''))::BIGINT AS d${k}, COUNT(NULLIF(TRIM(${raw}), ''))::BIGINT AS n${k}`;
                    });
                    const r = arrowResultToObjects(await conn.query(`SELECT ${exprs.join(', ')} FROM ${sourceExpr} AS src`))[0];
                    sl.forEach((h, k) => {
                        const n = Number(r['n' + k]), d = Number(r['d' + k]);
                        if (n >= totalRows * 0.8 && n > 0 && d / n >= 0.7) cand.push(h);
                    });
                }
                for (const h of cand) {
                    const raw = `NULLIF(TRIM(CAST(${sqlIdent(h)} AS VARCHAR)), '')`;
                    const r = arrowResultToObjects(await conn.query(`SELECT COUNT(${raw})::BIGINT AS n, COUNT(DISTINCT ${raw})::BIGINT AS d FROM ${sourceExpr} AS src`))[0];
                    if (Number(r.n) > 0 && Number(r.d) / Number(r.n) >= 0.995) funcDupCols.push(h);
                }
                const funcHeaders = table.headers.filter(h => !funcDupCols.includes(h));
                if (funcDupCols.length && funcHeaders.length) {
                    const dupExpr2 = `md5(concat_ws(chr(1), ${funcHeaders.map(h => `COALESCE(CAST(${sqlIdent(h)} AS VARCHAR), chr(0))`).join(', ')}))`;
                    try {
                        const r = arrowResultToObjects(await conn.query(`SELECT (COUNT(*) - COUNT(DISTINCT ${dupExpr2}))::BIGINT AS d FROM ${sourceExpr} AS src`))[0];
                        funcDuplicateRows = Math.max(0, Number(r.d));
                    } catch (e2) {
                        const r = arrowResultToObjects(await conn.query(`SELECT (COUNT(*) - approx_count_distinct(${dupExpr2}))::BIGINT AS d FROM ${sourceExpr} AS src`))[0];
                        funcDuplicateRows = Math.max(0, Number(r.d)); funcDuplicatesApprox = true;
                    }
                }
            } catch (eK) { console.warn('Détection des clés techniques ignorée :', eK); }

            // Statistiques par colonne, calculées par LOTS de colonnes (au lieu d'une seule requête
            // géante) : réduit fortement le pic mémoire quand la table est large et volumineuse.
            const colRow = {};
            const BATCH = 8;
            for (let start = 0; start < targetHeaders.length; start += BATCH) {
                const slice = targetHeaders.slice(start, start + BATCH);
                const colExprs = [], proj = [];
                slice.forEach((h, k) => {
                    const i = start + k;
                    // V6.24 : le texte brut et le texte nettoyé sont calculés UNE fois par ligne dans
                    // une sous-requête, puis réutilisés par la douzaine d'agrégats de la colonne —
                    // auparavant chaque agrégat refaisait son propre CAST + TRIM.
                    proj.push(`CAST(${sqlIdent(h)} AS VARCHAR) AS r${i}, TRIM(CAST(${sqlIdent(h)} AS VARCHAR)) AS t${i}`);
                    const raw = `r${i}`;
                    const trimmed = `t${i}`;
                    const notBlank = `(${trimmed} IS NOT NULL AND ${trimmed} <> '')`;
                    const isNum = `regexp_matches(${trimmed}, '${re.num}')`;
                    // V6.21 : profil des DATES — bornes réelles et valeurs hors du possible.
                    const dateExpr = `COALESCE(TRY_CAST(${tdNormExpr('date', raw)} AS DATE), CAST(TRY_CAST(${raw} AS TIMESTAMP) AS DATE))`;
                    // V6.24 : cette passe reste LÉGÈRE et porte sur toutes les colonnes — elle sert
                    // à détecter le type et à mesurer remplissage, cardinalité, longueurs et hygiène.
                    // Les mesures propres aux nombres et aux dates sont reportées à des passes ciblées :
                    // les évaluer ici revenait à tenter 5 analyses de date PAR COLONNE ET PAR LIGNE,
                    // y compris sur des colonnes de texte pur.
                    colExprs.push(`
                        SUM(CASE WHEN NOT (${notBlank}) THEN 1 ELSE 0 END)::BIGINT AS c${i}_null,
                        SUM(CASE WHEN ${notBlank} AND ${isNum} THEN 1 ELSE 0 END)::BIGINT AS c${i}_num,
                        SUM(CASE WHEN ${notBlank} AND (regexp_matches(${trimmed}, '${re.date1}') OR regexp_matches(${trimmed}, '${re.date2}')) THEN 1 ELSE 0 END)::BIGINT AS c${i}_date,
                        SUM(CASE WHEN ${notBlank} AND regexp_matches(${trimmed}, '${re.email}') THEN 1 ELSE 0 END)::BIGINT AS c${i}_email,
                        SUM(CASE WHEN ${notBlank} AND regexp_matches(${trimmed}, '${re.phone}') THEN 1 ELSE 0 END)::BIGINT AS c${i}_phone,
                        approx_count_distinct(CASE WHEN ${notBlank} THEN ${trimmed} END)::BIGINT AS c${i}_distinct,
                        MIN(CASE WHEN ${notBlank} THEN LENGTH(${trimmed}) END)::BIGINT AS c${i}_minlen,
                        MAX(CASE WHEN ${notBlank} THEN LENGTH(${trimmed}) END)::BIGINT AS c${i}_maxlen,
                        AVG(CASE WHEN ${notBlank} THEN LENGTH(${trimmed}) END) AS c${i}_avglen,
                        SUM(CASE WHEN ${raw} IS NOT NULL AND ${raw} <> '' AND ${raw} <> ${trimmed} THEN 1 ELSE 0 END)::BIGINT AS c${i}_sp,
                        SUM(CASE WHEN ${notBlank} AND regexp_matches(${trimmed}, '  +') THEN 1 ELSE 0 END)::BIGINT AS c${i}_msp,
                        SUM(CASE WHEN ${notBlank} AND UPPER(${trimmed}) IN ('N/A','NA','NULL','-','--','?','X','XX','INCONNU','NC','TBD','NONE','AUCUN','VIDE','#N/A','SANS','A DEFINIR','À DÉFINIR') THEN 1 ELSE 0 END)::BIGINT AS c${i}_ph,
                        approx_count_distinct(CASE WHEN ${notBlank} THEN UPPER(${trimmed}) END)::BIGINT AS c${i}_ucnt
                    `);
                });
                const res = await conn.query(`SELECT ${colExprs.join(', ')} FROM (SELECT ${proj.join(', ')} FROM ${sourceExpr} AS src) q`);
                Object.assign(colRow, arrowResultToObjects(res)[0]);
            }
            // V9.1.1 — Variantes de casse : le compteur était la différence de DEUX estimations
            // approchées (approx_count_distinct de la valeur et de sa majuscule). Sur une colonne
            // à forte cardinalité, le bruit des deux estimations fabriquait des variantes fantômes
            // (« 26 » à l'audit, « aucune ligne » à la consultation, qui est exacte). Le test sur un
            // vrai DuckDB a montré que le bruit peut aller dans les deux sens (jusqu'à -34 000 sur
            // 200 000 identifiants) : on ne peut donc même pas s'en servir pour présélectionner.
            // On recompte EXACTEMENT sur toutes les colonnes, par lots : le chiffre affiché est
            // désormais celui que retrouve le détail.
            try {
                const cands = targetHeaders.map((h, i) => i);
                for (let start = 0; start < cands.length; start += BATCH) {
                    const slice = cands.slice(start, start + BATCH);
                    const ex = slice.map(i => { const t2 = `TRIM(CAST(${sqlIdent(targetHeaders[i])} AS VARCHAR))`; const nb = `(${t2} IS NOT NULL AND ${t2} <> '')`;
                        return `(COUNT(DISTINCT CASE WHEN ${nb} THEN ${t2} END) - COUNT(DISTINCT CASE WHEN ${nb} THEN UPPER(${t2}) END))::BIGINT AS x${i}`; });
                    const r = arrowResultToObjects(await conn.query(`SELECT ${ex.join(', ')} FROM ${sourceExpr} AS src`))[0];
                    slice.forEach(i => { colRow[`c${i}_casex`] = Math.max(0, Number(r[`x${i}`] || 0)); });
                }
            } catch (eC) { console.warn('Recompte exact des variantes de casse ignoré :', eC); }

            const stats = { tableName: table.name, totalRows, emptyRows: Number(g.empty_rows), duplicateRows: Number(g.duplicate_rows), duplicatesApprox, funcDupCols, funcDuplicateRows, funcDuplicatesApprox, totalCells: totalRows * targetHeaders.length, filledCells: 0, completnessRate: 0, columns: {} };

            targetHeaders.forEach((h, i) => {
                const nullCount = Number(colRow[`c${i}_null`]);
                const validCount = totalRows - nullCount;
                stats.filledCells += validCount;
                const numNum = Number(colRow[`c${i}_num`]), numDate = Number(colRow[`c${i}_date`]), numEmail = Number(colRow[`c${i}_email`]), numPhone = Number(colRow[`c${i}_phone`]);

                let colType = 'Texte';
                if (validCount > 0) {
                    if (numNum / validCount >= 0.8) colType = 'Numérique';
                    else if (numDate / validCount >= 0.8) colType = 'Date/Heure';
                    else if (numEmail / validCount >= 0.8) colType = 'Email';
                    else if (numPhone / validCount >= 0.8) colType = 'Téléphone';
                }

                const mean = 0, stdDev = 0, minVal = null, maxVal = null; // remplis par les passes ciblées

                stats.columns[h] = {
                    name: h, nullCount, numNum, numDate, numEmail, numPhone,
                    semanticType: colType, physicalType: colType === 'Numérique' ? 'float' : 'string',
                    completeness: validCount > 0 ? (validCount / totalRows) * 100 : 0,
                    distinctCount: Number(colRow[`c${i}_distinct`]), hasMoreDistinct: false,
                    minLen: colRow[`c${i}_minlen`] !== null ? Number(colRow[`c${i}_minlen`]) : 0,
                    maxLen: colRow[`c${i}_maxlen`] !== null ? Number(colRow[`c${i}_maxlen`]) : 0,
                    avgLen: colRow[`c${i}_avglen`] !== null ? Number(colRow[`c${i}_avglen`]) : 0,
                    mean, stdDev, min: minVal, max: maxVal, sum: mean * numNum,
                    spaceIssues: Number(colRow[`c${i}_sp`] || 0), multiSpace: Number(colRow[`c${i}_msp`] || 0),
                    placeholders: Number(colRow[`c${i}_ph`] || 0),
                    caseDupGroups: colRow[`c${i}_casex`] !== undefined ? colRow[`c${i}_casex`] : 0,
                    outliers: 0, outliersIqr: 0,
                    // V6.21 : distribution (quantiles approchés), profil de date, forme de la colonne
                    p05: null, p25: null, median: null, p75: null, p95: null,
                    dateMin: null, dateMax: null, datesFuture: 0, datesAncient: 0,
                    cardinalityRatio: validCount > 0 ? Number(colRow[`c${i}_distinct`]) / validCount : 0,
                    isConstant: validCount > 0 && Number(colRow[`c${i}_distinct`]) === 1,
                    isCandidateKey: validCount > 0 && validCount === totalRows && Number(colRow[`c${i}_distinct`]) === validCount,
                    duplicateOf: null,
                    frequentValues: []
                };
            });

            // V6.24 : PASSE NUMÉRIQUE, uniquement sur les colonnes reconnues numériques. La conversion
            // est faite UNE fois par ligne dans une sous-requête, puis les 9 agrégats la réutilisent —
            // au lieu de la refaire à chaque agrégat.
            const numOnly = targetHeaders.filter(h => stats.columns[h].semanticType === 'Numérique');
            for (let start = 0; start < numOnly.length; start += 12) {
                const slice = numOnly.slice(start, start + 12);
                const proj = slice.map((h, k) => `TRY_CAST(REPLACE(TRIM(CAST(${sqlIdent(h)} AS VARCHAR)), ',', '.') AS DOUBLE) AS v${start + k}`);
                const agg = slice.map((h, k) => { const j = start + k;
                    return `AVG(v${j}) AS n${j}_mean, STDDEV_POP(v${j}) AS n${j}_sd, MIN(v${j}) AS n${j}_min, MAX(v${j}) AS n${j}_max,
                            approx_quantile(v${j}, 0.05) AS n${j}_p05, approx_quantile(v${j}, 0.25) AS n${j}_p25,
                            approx_quantile(v${j}, 0.5) AS n${j}_p50, approx_quantile(v${j}, 0.75) AS n${j}_p75,
                            approx_quantile(v${j}, 0.95) AS n${j}_p95`; });
                const row = arrowResultToObjects(await conn.query(`SELECT ${agg.join(', ')} FROM (SELECT ${proj.join(', ')} FROM ${sourceExpr} AS src) q`))[0];
                slice.forEach((h, k) => { const j = start + k; const c = stats.columns[h];
                    const nz = x => row[x] != null ? Number(row[x]) : null;
                    c.mean = nz(`n${j}_mean`) || 0; c.stdDev = nz(`n${j}_sd`) || 0;
                    c.min = nz(`n${j}_min`); c.max = nz(`n${j}_max`); c.sum = c.mean * c.numNum;
                    c.p05 = nz(`n${j}_p05`); c.p25 = nz(`n${j}_p25`); c.median = nz(`n${j}_p50`);
                    c.p75 = nz(`n${j}_p75`); c.p95 = nz(`n${j}_p95`);
                });
            }
            // V6.24 : PASSE DATES, uniquement sur les colonnes reconnues dates. L'analyse de date est
            // coûteuse (plusieurs formats essayés) : elle n'est faite qu'UNE fois par ligne et par
            // colonne, dans une sous-requête, au lieu de quatre fois comme auparavant.
            const dateOnly = targetHeaders.filter(h => stats.columns[h].semanticType === 'Date/Heure');
            for (let start = 0; start < dateOnly.length; start += 12) {
                const slice = dateOnly.slice(start, start + 12);
                const proj = slice.map((h, k) => { const raw2 = `CAST(${sqlIdent(h)} AS VARCHAR)`;
                    return `COALESCE(TRY_CAST(${tdNormExpr('date', raw2)} AS DATE), CAST(TRY_CAST(${raw2} AS TIMESTAMP) AS DATE)) AS d${start + k}`; });
                const agg = slice.map((h, k) => { const j = start + k;
                    return `MIN(d${j}) AS x${j}_min, MAX(d${j}) AS x${j}_max,
                            COUNT(d${j})::BIGINT AS x${j}_ok,
                            SUM(CASE WHEN d${j} > CURRENT_DATE THEN 1 ELSE 0 END)::BIGINT AS x${j}_fut,
                            SUM(CASE WHEN d${j} < DATE '1900-01-01' THEN 1 ELSE 0 END)::BIGINT AS x${j}_old,
                            SUM(CASE WHEN d${j} > CURRENT_DATE + INTERVAL 100 YEAR THEN 1 ELSE 0 END)::BIGINT AS x${j}_far`; });
                const row = arrowResultToObjects(await conn.query(`SELECT ${agg.join(', ')} FROM (SELECT ${proj.join(', ')} FROM ${sourceExpr} AS src) q`))[0];
                slice.forEach((h, k) => { const j = start + k; const c = stats.columns[h];
                    const validCount2 = totalRows - c.nullCount;
                    const parsed = Number(row[`x${j}_ok`] || 0);
                    // V6.25 : le type « date » n'est plus décidé par une simple ressemblance de forme.
                    // Une référence du genre 1234-56-78 ressemble à une date sans en être une : on exige
                    // que les valeurs s'ANALYSENT réellement comme des dates. Sinon la colonne redevient
                    // du texte, et aucune alerte de date n'est produite à son sujet.
                    if (validCount2 > 0 && parsed / validCount2 < 0.8) {
                        c.semanticType = 'Texte'; c.physicalType = 'string';
                        c.dateMin = null; c.dateMax = null; c.datesFuture = 0; c.datesAncient = 0; c.datesFar = 0;
                        c.dateDemoted = true; c.dateParsedPct = validCount2 ? (100 * parsed / validCount2) : 0;
                        return;
                    }
                    c.dateMin = row[`x${j}_min`] != null ? String(row[`x${j}_min`]).slice(0, 10) : null;
                    c.dateMax = row[`x${j}_max`] != null ? String(row[`x${j}_max`]).slice(0, 10) : null;
                    c.datesFuture = Number(row[`x${j}_fut`] || 0); c.datesAncient = Number(row[`x${j}_old`] || 0);
                    c.datesFar = Number(row[`x${j}_far`] || 0);
                });
            }

            stats.completnessRate = stats.totalCells > 0 ? (stats.filledCells / stats.totalCells) * 100 : 0;

            // Valeurs aberrantes (règle des 3 écarts-types) sur les colonnes numériques : une seule
            // requête supplémentaire, avec les bornes calculées à partir de la première passe.
            const numCols = targetHeaders.filter(h => { const c = stats.columns[h]; return c.semanticType === 'Numérique' && c.stdDev > 0; });
            if (numCols.length) {
                const outExprs = numCols.map((h, i) => {
                    const c = stats.columns[h];
                    const lo = c.mean - 3 * c.stdDev, hi = c.mean + 3 * c.stdDev;
                    const numE = `TRY_CAST(REPLACE(TRIM(CAST(${sqlIdent(h)} AS VARCHAR)), ',', '.') AS DOUBLE)`;
                    return `SUM(CASE WHEN ${numE} IS NOT NULL AND (${numE} < ${lo} OR ${numE} > ${hi}) THEN 1 ELSE 0 END)::BIGINT AS o${i}`;
                });
                const outRes = await conn.query(`SELECT ${outExprs.join(', ')} FROM ${sourceExpr} AS src`);
                const outRow = arrowResultToObjects(outRes)[0];
                numCols.forEach((h, i) => { stats.columns[h].outliers = Number(outRow['o' + i] || 0); });
            }
            // V6.21 : valeurs aberrantes ROBUSTES (Tukey, 1,5 × écart interquartile). La règle des 3
            // écarts-types suppose une distribution symétrique : sur des montants ou des durées, très
            // asymétriques, elle rate presque tout. L'IQR ne fait aucune hypothèse de forme.
            const iqrCols = targetHeaders.filter(h => { const c = stats.columns[h];
                return c.semanticType === 'Numérique' && c.p25 != null && c.p75 != null && c.p75 > c.p25; });
            if (iqrCols.length) {
                const iqrExprs = iqrCols.map((h, i) => {
                    const c = stats.columns[h]; const iqr = c.p75 - c.p25;
                    const lo = c.p25 - 1.5 * iqr, hi = c.p75 + 1.5 * iqr;
                    const numE = `TRY_CAST(REPLACE(TRIM(CAST(${sqlIdent(h)} AS VARCHAR)), ',', '.') AS DOUBLE)`;
                    stats.columns[h].iqrLow = lo; stats.columns[h].iqrHigh = hi;
                    return `SUM(CASE WHEN ${numE} IS NOT NULL AND (${numE} < ${lo} OR ${numE} > ${hi}) THEN 1 ELSE 0 END)::BIGINT AS q${i}`;
                });
                const iqrRes = arrowResultToObjects(await conn.query(`SELECT ${iqrExprs.join(', ')} FROM ${sourceExpr} AS src`))[0];
                iqrCols.forEach((h, i) => { stats.columns[h].outliersIqr = Number(iqrRes['q' + i] || 0); });
            }
            // V6.21 : le nombre de valeurs distinctes de la passe rapide est APPROCHÉ (HyperLogLog) :
            // sur 20 valeurs réellement uniques il peut annoncer 17. Un verdict « clé candidate » ou
            // « colonne constante » ne peut donc pas s'appuyer dessus. On recompte EXACTEMENT, mais
            // seulement pour les colonnes plausibles — celles qui approchent l'unicité ou la constante.
            const exactCand = targetHeaders.filter(h => { const c = stats.columns[h];
                const vc = totalRows - c.nullCount; return vc > 0 && (c.distinctCount <= 2 || c.distinctCount >= vc * 0.8); });
            if (exactCand.length) {
                for (let start = 0; start < exactCand.length; start += 8) {
                    const slice = exactCand.slice(start, start + 8);
                    const ex = slice.map((h, k) => `COUNT(DISTINCT NULLIF(TRIM(CAST(${sqlIdent(h)} AS VARCHAR)), ''))::BIGINT AS e${start + k}`);
                    const row = arrowResultToObjects(await conn.query(`SELECT ${ex.join(', ')} FROM ${sourceExpr} AS src`))[0];
                    slice.forEach((h, k) => {
                        const c = stats.columns[h]; const vc = totalRows - c.nullCount;
                        const d = Number(row['e' + (start + k)] || 0);
                        c.distinctExact = d;
                        c.cardinalityRatio = vc > 0 ? d / vc : 0;
                        c.isConstant = vc > 0 && d === 1;
                        c.isCandidateKey = vc > 0 && vc === totalRows && d === vc;
                    });
                }
            }
            // V6.23 : ÉCART ABSOLU MÉDIAN (MAD). L'écart-type se laisse gonfler par les valeurs qu'il
            // devrait dénoncer ; la médiane des écarts à la médiane, non. On en tire un SCORE PAR LIGNE
            // (|x − médiane| / (1,4826 × MAD)) qui permet de trier les anomalies de la plus grave à la
            // moins grave, là où l'écart interquartile ne rend qu'un verdict binaire.
            const madCols = targetHeaders.filter(h => { const c = stats.columns[h]; return c.semanticType === 'Numérique' && c.median != null; });
            if (madCols.length) {
                for (let start = 0; start < madCols.length; start += 8) {
                    const slice = madCols.slice(start, start + 8);
                    const ex = slice.map((h, k) => { const c = stats.columns[h];
                        const numE = `TRY_CAST(REPLACE(TRIM(CAST(${sqlIdent(h)} AS VARCHAR)), ',', '.') AS DOUBLE)`;
                        return `approx_quantile(ABS(${numE} - ${c.median}), 0.5) AS m${start + k}`; });
                    const row = arrowResultToObjects(await conn.query(`SELECT ${ex.join(', ')} FROM ${sourceExpr} AS src`))[0];
                    slice.forEach((h, k) => { const c = stats.columns[h];
                        const mad = row['m' + (start + k)] != null ? Number(row['m' + (start + k)]) : 0;
                        c.mad = mad; c.madSigma = mad > 0 ? 1.4826 * mad : 0; });
                }
                // Comptage des lignes au-delà du seuil usuel (score robuste > 3,5)
                const scored = madCols.filter(h => stats.columns[h].madSigma > 0);
                if (scored.length) {
                    const ex = scored.map((h, i) => { const c = stats.columns[h];
                        const numE = `TRY_CAST(REPLACE(TRIM(CAST(${sqlIdent(h)} AS VARCHAR)), ',', '.') AS DOUBLE)`;
                        return `SUM(CASE WHEN ${numE} IS NOT NULL AND ABS(${numE} - ${c.median}) / ${c.madSigma} > 3.5 THEN 1 ELSE 0 END)::BIGINT AS s${i}`; });
                    const row = arrowResultToObjects(await conn.query(`SELECT ${ex.join(', ')} FROM ${sourceExpr} AS src`))[0];
                    scored.forEach((h, i) => { stats.columns[h].outliersMad = Number(row['s' + i] || 0); });
                }
            }
            // V6.23 : ABERRANTES CONTEXTUELLES. Les bornes ne sont plus calculées sur toute la colonne
            // mais À L'INTÉRIEUR de chaque groupe : une valeur normale dans l'absolu peut être aberrante
            // dans son contexte (et inversement, un écart global peut être parfaitement normal ici).
            // Les groupes de moins de 5 lignes sont ignorés : leurs quartiles ne veulent rien dire.
            const grpCol = currentProfilingGroupCol && targetHeaders.includes(currentProfilingGroupCol) ? currentProfilingGroupCol : '';
            stats.groupCol = grpCol || null;
            if (grpCol) {
                const G = sqlIdent(grpCol);
                const ctxCols = targetHeaders.filter(h => h !== grpCol && stats.columns[h].semanticType === 'Numérique');
                for (const h of ctxCols) {
                    const numE = `TRY_CAST(REPLACE(TRIM(CAST(${sqlIdent(h)} AS VARCHAR)), ',', '.') AS DOUBLE)`;
                    try {
                        const res = arrowResultToObjects(await conn.query(`
                            WITH b AS (SELECT ${G} AS g, COUNT(${numE})::BIGINT AS n,
                                              approx_quantile(${numE}, 0.25) AS q1, approx_quantile(${numE}, 0.75) AS q3
                                       FROM ${sourceExpr} AS src GROUP BY 1 HAVING COUNT(${numE}) >= 5)
                            SELECT COUNT(*)::BIGINT AS grp,
                                   (SELECT COUNT(*)::BIGINT FROM ${sourceExpr} AS s2 JOIN b ON s2.${G} IS NOT DISTINCT FROM b.g
                                     WHERE TRY_CAST(REPLACE(TRIM(CAST(s2.${sqlIdent(h)} AS VARCHAR)), ',', '.') AS DOUBLE) IS NOT NULL
                                       AND (TRY_CAST(REPLACE(TRIM(CAST(s2.${sqlIdent(h)} AS VARCHAR)), ',', '.') AS DOUBLE) < b.q1 - 1.5 * (b.q3 - b.q1)
                                         OR TRY_CAST(REPLACE(TRIM(CAST(s2.${sqlIdent(h)} AS VARCHAR)), ',', '.') AS DOUBLE) > b.q3 + 1.5 * (b.q3 - b.q1))
                                       AND b.q3 > b.q1) AS bad
                            FROM b`))[0];
                        stats.columns[h].ctxGroups = Number(res.grp || 0);
                        stats.columns[h].outliersCtx = Number(res.bad || 0);
                    } catch (e) { stats.columns[h].ctxError = String(e.message || e); }
                }
            }
            // V6.27 : appartenance aux LISTES DE VALEURS déclarées. Une requête par colonne rattachée
            // seulement — il y en a peu, et c'est le contrôle qui remplace toutes les alertes de rareté.
            for (const h of targetHeaders) {
                const L = vlBindingFor(table.name, h); if (!L) continue;
                const cond = vlOutsideCond(L, sqlIdent(h)); if (!cond) { stats.columns[h].vlError = 'Liste incomplète'; continue; }
                try {
                    const r2 = arrowResultToObjects(await conn.query(`SELECT SUM(CASE WHEN ${cond} THEN 1 ELSE 0 END)::BIGINT AS n FROM ${sourceExpr} AS src`))[0];
                    stats.columns[h].outsideList = Number(r2.n || 0);
                    stats.columns[h].valueListName = L.name;
                } catch (e) { stats.columns[h].vlError = String(e.message || e); }
            }
            // V6.21 : COLONNES REDONDANTES — deux colonnes qui portent exactement la même information.
            // On ne compare que des paires plausibles (même type, même cardinalité, même remplissage),
            // et on plafonne le nombre de paires pour rester rapide sur les tables très larges.
            const dupCand = targetHeaders.filter(h => { const c = stats.columns[h]; return !c.isConstant && c.distinctCount > 1; });
            const pairs = [];
            for (let i = 0; i < dupCand.length && pairs.length < 80; i++) {
                for (let j = i + 1; j < dupCand.length && pairs.length < 80; j++) {
                    const A = stats.columns[dupCand[i]], B = stats.columns[dupCand[j]];
                    if (A.distinctCount === B.distinctCount && A.nullCount === B.nullCount && A.semanticType === B.semanticType) pairs.push([dupCand[i], dupCand[j]]);
                }
            }
            if (pairs.length) {
                const nk = h => `NULLIF(UPPER(TRIM(CAST(${sqlIdent(h)} AS VARCHAR))), '')`;
                const pExprs = pairs.map(([x, y], i) => `SUM(CASE WHEN ${nk(x)} IS DISTINCT FROM ${nk(y)} THEN 1 ELSE 0 END)::BIGINT AS p${i}`);
                const pRes = arrowResultToObjects(await conn.query(`SELECT ${pExprs.join(', ')} FROM ${sourceExpr} AS src`))[0];
                pairs.forEach(([x, y], i) => { if (Number(pRes['p' + i] || 0) === 0) {
                    // la seconde est signalée comme recopie de la première (on garde la 1re comme référence)
                    if (!stats.columns[y].duplicateOf) stats.columns[y].duplicateOf = x;
                } });
            }

            // Top 10 des valeurs fréquentes : une requête GROUP BY par colonne (ne peut pas être combiné
            // avec les agrégats ci-dessus, chaque colonne a son propre regroupement).
            // GARDE-FOU MÉMOIRE : ces GROUP BY par valeur explosent sur les colonnes à très forte
            // cardinalité (des millions de valeurs distinctes en table de hachage). Au-delà de 500 000
            // lignes, ils sont calculés sur les 500 000 premières — les indicateurs restent représentatifs.
            const FREQ_CAP = 500000;
            const groupByExpr = (sampleLimit === 'all' && totalRows > FREQ_CAP) ? `(SELECT * FROM ${tName}${whereClause} LIMIT ${FREQ_CAP})` : sourceExpr;
            stats.freqCapped = groupByExpr !== sourceExpr ? FREQ_CAP : 0;
            for (const h of targetHeaders) {
                const raw = `CAST(${sqlIdent(h)} AS VARCHAR)`;
                const freqRes = await conn.query(`
                    SELECT TRIM(${raw}) AS v, COUNT(*)::BIGINT AS c
                    FROM ${groupByExpr} AS src
                    WHERE ${sqlIdent(h)} IS NOT NULL AND TRIM(${raw}) <> ''
                    GROUP BY 1 ORDER BY c DESC LIMIT 10
                `);
                const rows = arrowResultToObjects(freqRes);
                stats.columns[h].frequentValues = rows.map(r => ({ val: r.v, count: Number(r.c), percentage: (Number(r.c) / totalRows) * 100 }));
            }

            // Détection de formats (pattern profiling) : chaque valeur est convertie en masque
            // (lettre -> A, chiffre -> 9, ponctuation/espaces conservés) puis les masques sont comptés
            // en SQL. Le masque dominant révèle le format attendu de l'attribut ; les masques
            // minoritaires localisent les valeurs déviantes. Ex : "PAR-01" -> "AAA-99".
            for (const h of targetHeaders) {
                const raw = `CAST(${sqlIdent(h)} AS VARCHAR)`;
                const maskExpr = `left(regexp_replace(regexp_replace(TRIM(${raw}), '[A-Za-zÀ-ÖØ-öø-ÿ]', 'A', 'g'), '[0-9]', '9', 'g'), 24)`;
                const patRes = await conn.query(`
                    SELECT p, c, COUNT(*) OVER ()::BIGINT AS ndist FROM (
                        SELECT ${maskExpr} AS p, COUNT(*)::BIGINT AS c
                        FROM ${groupByExpr} AS src
                        WHERE ${sqlIdent(h)} IS NOT NULL AND TRIM(${raw}) <> ''
                        GROUP BY 1
                    ) sub ORDER BY c DESC LIMIT 6
                `);
                const rows = arrowResultToObjects(patRes);
                const c = stats.columns[h];
                const validCount = totalRows - c.nullCount;
                c.patternDistinct = rows.length ? Number(rows[0].ndist) : 0;
                c.patterns = rows.map(r => ({ pattern: r.p, count: Number(r.c), pct: validCount > 0 ? (Number(r.c) / validCount) * 100 : 0 }));
            }

            return stats;
        }


        function switchQualSubTab(tab) {
            el('qual-sub-profiling').classList.toggle('hidden', tab !== 'profiling');
            el('qual-sub-columns').classList.toggle('hidden', tab !== 'columns');
            el('qual-sub-dups').classList.toggle('hidden', tab !== 'dups');
            const on = 'py-2.5 px-4 font-bold border-b-2 border-indigo-600 text-indigo-600 text-sm whitespace-nowrap';
            const off = 'py-2.5 px-4 font-medium border-b-2 border-transparent text-slate-500 hover:text-indigo-600 text-sm whitespace-nowrap';
            el('btn-qual-prof').className = tab === 'profiling' ? on : off;
            el('btn-qual-cols').className = tab === 'columns' ? on : off;
            el('btn-qual-dups').className = tab === 'dups' ? on : off;
            if (tab === 'dups') renderDupSection();
        }

