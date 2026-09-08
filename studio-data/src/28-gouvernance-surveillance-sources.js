        // ======================= SURVEILLANCE DES SOURCES (amont) =======================
        // 4 outils autour d'une source rafraîchie depuis une application amont :
        //  1) Moniteur : fraîcheur/SLA + dérive de schéma et de volumétrie entre instantanés.
        //  2) Contrat de données : schéma attendu + vérification de conformité.
        //  3) Suivi des changements (delta) : ajoutés / supprimés / modifiés vs un instantané figé.
        //  4) Réconciliation amont/aval : volumétrie + orphelins entre deux sources.
        let swState = { tool: 'monitor', deltaSrc: '', deltaKey: '', deltaRes: null, recA: '', recKeyA: '', recB: '', recKeyB: '', recRes: null, contractRes: {} };
        let swDataSnaps = {}; // session : { [table] : { ts, snapId, rows } } (les tables DuckDB ne survivent pas au rechargement)
        function swModel() { const g = state.governance; g.srcWatch = g.srcWatch || {}; return g.srcWatch; }
        function swGet(tn) { const m = swModel(); m[tn] = m[tn] || { snaps: [], contract: null }; return m[tn]; }
        function swReadyTables() { return Object.values(state.tables).filter(t => t.status === 'ready'); }
        function swSimpleType(dt) { const t = String(dt || '').toUpperCase(); if (/INT|DECIMAL|DOUBLE|FLOAT|HUGE|NUMERIC|REAL/.test(t)) return 'nombre'; if (/DATE|TIME/.test(t)) return 'date'; if (/BOOL/.test(t)) return 'booléen'; return 'texte'; }
        async function swRealSchema(tId) {
            const { conn } = await getDB();
            const res = arrowResultToObjects(await conn.query(`SELECT column_name AS n, data_type AS t FROM information_schema.columns WHERE table_name = ${sqlLiteral(duckTableName(tId))}`));
            return res.filter(r => r.n !== '__rn').map(r => ({ name: r.n, type: swSimpleType(r.t) }));
        }
        // Fréquence de mise à jour (texte libre du dictionnaire) → âge maximal toléré, en jours.
        function swFreqDays(freq) { const f = String(freq || '').toLowerCase();
            if (/temps\s?r|réel|reel|continu/.test(f)) return 0.2;
            if (/heure|hour|horaire/.test(f)) return 0.5;
            if (/quotid|jour|daily|journ|nuit/.test(f)) return 1.5;
            if (/hebdo|semain|week/.test(f)) return 8;
            if (/mensuel|mois|month/.test(f)) return 33;
            if (/trimestr|quarter/.test(f)) return 95;
            if (/annuel|an\b|year/.test(f)) return 370;
            return null; }
        function swFreshness(t) {
            const d = state.governance.dictionary[t.name] || {};
            const maxDays = swFreqDays(d.updateFrequency);
            if (!t.lastRefresh) return { status: t.file ? 'unknown' : 'na', maxDays, freq: d.updateFrequency };
            const ageDays = (Date.now() - t.lastRefresh) / 864e5;
            if (maxDays == null) return { status: 'nofreq', ageDays, freq: d.updateFrequency };
            return { status: ageDays > maxDays ? 'late' : 'ok', ageDays, maxDays, freq: d.updateFrequency };
        }
        function swFreshBadge(t) {
            const f = swFreshness(t);
            const age = f.ageDays != null ? (f.ageDays < 1 ? Math.round(f.ageDays * 24) + ' h' : Math.round(f.ageDays) + ' j') : '—';
            if (f.status === 'ok') return `<span class="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">✔ à jour (${age})</span>`;
            if (f.status === 'late') return `<span class="text-[11px] font-bold text-red-700 bg-red-50 border border-red-200 rounded-full px-2 py-0.5" title="Fréquence attendue : ${escapeHTML(f.freq || '')}">⚠ en retard (${age} > ${f.maxDays < 1 ? Math.round(f.maxDays * 24) + ' h' : Math.round(f.maxDays) + ' j'})</span>`;
            if (f.status === 'nofreq') return `<span class="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-full px-2 py-0.5" title="Renseignez « Fréquence de mise à jour » dans le dictionnaire pour surveiller le SLA">↻ ${age} · fréquence non définie</span>`;
            return `<span class="text-[11px] text-slate-400 bg-slate-50 border border-slate-200 rounded-full px-2 py-0.5">fraîcheur inconnue</span>`;
        }
        // -- 1. Moniteur : instantané (volumétrie + schéma) et dérive --
        async function swSnapshot(tn) {
            const t = tableByName(tn); if (!t) return;
            try {
                const { conn } = await getDB();
                const { rows, schema } = await runNoSpill(conn, async () => {
                    const cRes = arrowResultToObjects(await conn.query(`SELECT COUNT(*)::BIGINT AS n FROM ${sqlIdent(duckTableName(t.id))}`));
                    return { rows: Number(cRes[0].n), schema: await swRealSchema(t.id) };
                });
                const e = swGet(tn); e.snaps = e.snaps || [];
                e.snaps.push({ ts: Date.now(), rows, schema });
                if (e.snaps.length > 40) e.snaps = e.snaps.slice(-40);
                persistAppState(); renderGovernance();
                showSuccess(`🛰️ Instantané de « ${tn} » pris : ${rows.toLocaleString('fr-FR')} lignes, ${schema.length} colonnes.`);
            } catch (e) { showError('Instantané impossible : ' + e.message); }
        }
        function swDrift(snaps) {
            if (!snaps || snaps.length < 2) return null;
            const a = snaps[snaps.length - 2], b = snaps[snaps.length - 1];
            const na = new Map(a.schema.map(c => [c.name, c.type])), nb = new Map(b.schema.map(c => [c.name, c.type]));
            const added = b.schema.filter(c => !na.has(c.name)).map(c => c.name);
            const removed = a.schema.filter(c => !nb.has(c.name)).map(c => c.name);
            const retyped = b.schema.filter(c => na.has(c.name) && na.get(c.name) !== c.type).map(c => `${c.name} (${na.get(c.name)}→${c.type})`);
            const rowsDelta = b.rows - a.rows;
            const rowsPct = a.rows ? (rowsDelta / a.rows) * 100 : null;
            return { added, removed, retyped, rowsDelta, rowsPct, from: a.ts, to: b.ts, schemaChanged: added.length || removed.length || retyped.length };
        }
        // -- 2. Contrat de données --
        async function swGenContract(tn) {
            const t = tableByName(tn); if (!t) return;
            try { const schema = await swRealSchema(t.id);
                swGet(tn).contract = { cols: schema.map(c => ({ name: c.name, type: c.type, required: false })), at: Date.now() };
                persistAppState(); renderGovernance();
                showSuccess(`📜 Contrat de « ${tn} » généré depuis la structure actuelle (${schema.length} colonnes).`);
            } catch (e) { showError('Génération du contrat impossible : ' + e.message); }
        }
        function swToggleRequired(tn, col, on) { const c = (swGet(tn).contract || {}); const f = (c.cols || []).find(x => x.name === col); if (f) { f.required = on; persistAppState(); } }
        async function swCheckContract(tn) {
            const t = tableByName(tn); const c = swGet(tn).contract; if (!t || !c) return;
            try {
                const { conn } = await getDB();
                const schema = await swRealSchema(t.id);
                const cur = new Map(schema.map(x => [x.name, x.type]));
                const decl = new Map(c.cols.map(x => [x.name, x]));
                const missing = c.cols.filter(x => !cur.has(x.name)).map(x => x.name);
                const extra = schema.filter(x => !decl.has(x.name)).map(x => x.name);
                const retyped = c.cols.filter(x => cur.has(x.name) && cur.get(x.name) !== x.type).map(x => `${x.name} (attendu ${x.type}, reçu ${cur.get(x.name)})`);
                const emptyReq = [];
                await runNoSpill(conn, async () => {
                for (const col of c.cols.filter(x => x.required && cur.has(x.name))) {
                    const r = arrowResultToObjects(await queryResilient(conn, `SELECT COUNT(*)::BIGINT AS n FROM ${sqlIdent(duckTableName(t.id))} WHERE ${sqlIdent(col.name)} IS NULL OR TRIM(CAST(${sqlIdent(col.name)} AS VARCHAR)) = ''`))[0];
                    const nn = Number(r.n); if (nn > 0) emptyReq.push(`${col.name} (${nn.toLocaleString('fr-FR')} vide(s))`);
                }
                });
                const conform = !missing.length && !retyped.length && !emptyReq.length;
                swState.contractRes[tn] = { conform, missing, extra, retyped, emptyReq, at: Date.now() };
                persistAppState(); renderGovernance();
            } catch (e) { showError('Vérification impossible : ' + e.message); }
        }
        // -- 3. Suivi des changements (delta vs instantané figé des données) --
        async function swFreezeData(tn) {
            const t = tableByName(tn); if (!t) return;
            try { const { conn } = await getDB(); const snapId = 'wsnap_' + generateId();
                const nRows = await runNoSpill(conn, async () => {
                    await conn.query(`CREATE OR REPLACE TABLE ${sqlIdent(duckTableName(snapId))} AS SELECT * EXCLUDE (__rn) FROM ${sqlIdent(duckTableName(t.id))}`);
                    const cRes = arrowResultToObjects(await conn.query(`SELECT COUNT(*)::BIGINT AS n FROM ${sqlIdent(duckTableName(snapId))}`));
                    return Number(cRes[0].n);
                });
                swDataSnaps[tn] = { ts: Date.now(), snapId, rows: nRows };
                swState.deltaRes = null; renderGovernance();
                showSuccess(`📸 Données de « ${tn} » figées (${nRows.toLocaleString('fr-FR')} lignes) — rechargez la source puis comparez.`);
            } catch (e) { showError('Figer les données impossible : ' + e.message); }
        }
        async function swComputeDelta(tn, key) {
            const t = tableByName(tn); const snap = swDataSnaps[tn];
            if (!t) return; if (!snap) return showError('Figez d\'abord un instantané des données.');
            if (!key) return showError('Choisissez une colonne clé.');
            try {
                const { conn } = await getDB();
                const C = sqlIdent(duckTableName(t.id)), S = sqlIdent(duckTableName(snap.snapId));
                const curCols = t.headers || [];
                const snapCols = (await swRealSchema(snap.snapId)).map(x => x.name);
                const common = curCols.filter(h => snapCols.includes(h) && h !== key);
                const K = x => `NULLIF(UPPER(TRIM(CAST(${x}.${sqlIdent(key)} AS VARCHAR))), '')`;
                const hash = x => common.length ? `md5(concat_ws(chr(1), ${common.map(h => `COALESCE(CAST(${x}.${sqlIdent(h)} AS VARCHAR), chr(0))`).join(', ')}))` : `''`;
                const sql = `WITH c AS (SELECT ${K('x')} AS k, ${hash('x')} AS h FROM ${C} x),
 s AS (SELECT ${K('y')} AS k, ${hash('y')} AS h FROM ${S} y)
 SELECT SUM(CASE WHEN s.k IS NULL THEN 1 ELSE 0 END)::BIGINT AS added,
        SUM(CASE WHEN c.k IS NULL THEN 1 ELSE 0 END)::BIGINT AS removed,
        SUM(CASE WHEN c.k IS NOT NULL AND s.k IS NOT NULL AND c.h <> s.h THEN 1 ELSE 0 END)::BIGINT AS changed,
        SUM(CASE WHEN c.k IS NOT NULL AND s.k IS NOT NULL AND c.h = s.h THEN 1 ELSE 0 END)::BIGINT AS same
 FROM c FULL OUTER JOIN s ON c.k = s.k`;
                const r = arrowResultToObjects(await runNoSpill(conn, () => queryResilient(conn, sql)))[0];
                swState.deltaRes = { tn, key, at: Date.now(), snapTs: snap.ts,
                    added: Number(r.added || 0), removed: Number(r.removed || 0), changed: Number(r.changed || 0), same: Number(r.same || 0), commonCols: common.length };
                renderGovernance();
            } catch (e) { showError('Comparaison impossible : ' + e.message); }
        }
        // -- 4. Réconciliation amont/aval --
        async function swReconcile() {
            const tA = tableByName(swState.recA), tB = tableByName(swState.recB);
            const kA = swState.recKeyA, kB = swState.recKeyB;
            if (!tA || !tB || !kA || !kB) return showError('Choisissez deux sources et leur colonne clé.');
            try {
                const { conn } = await getDB();
                const A = sqlIdent(duckTableName(tA.id)), B = sqlIdent(duckTableName(tB.id));
                const KA = `NULLIF(UPPER(TRIM(CAST(${sqlIdent(kA)} AS VARCHAR))), '')`, KB = `NULLIF(UPPER(TRIM(CAST(${sqlIdent(kB)} AS VARCHAR))), '')`;
                const sql = `WITH a AS (SELECT DISTINCT ${KA} AS k FROM ${A} WHERE ${KA} IS NOT NULL),
 b AS (SELECT DISTINCT ${KB} AS k FROM ${B} WHERE ${KB} IS NOT NULL)
 SELECT (SELECT COUNT(*) FROM ${A})::BIGINT AS ta, (SELECT COUNT(*) FROM ${B})::BIGINT AS tb,
        SUM(CASE WHEN b.k IS NULL THEN 1 ELSE 0 END)::BIGINT AS onlyA,
        SUM(CASE WHEN a.k IS NULL THEN 1 ELSE 0 END)::BIGINT AS onlyB,
        SUM(CASE WHEN a.k IS NOT NULL AND b.k IS NOT NULL THEN 1 ELSE 0 END)::BIGINT AS common
 FROM a FULL OUTER JOIN b ON a.k = b.k`;
                const r = arrowResultToObjects(await runNoSpill(conn, () => queryResilient(conn, sql)))[0];
                swState.recRes = { at: Date.now(), a: swState.recA, b: swState.recB,
                    ta: Number(r.ta || 0), tb: Number(r.tb || 0), onlyA: Number(r.onlyA || 0), onlyB: Number(r.onlyB || 0), common: Number(r.common || 0) };
                renderGovernance();
            } catch (e) { showError('Réconciliation impossible : ' + e.message); }
        }
        function swSet(f, v) { swState[f] = v; if (f === 'tool' || f === 'recA' || f === 'recB' || f === 'deltaSrc') renderGovernance(); }

