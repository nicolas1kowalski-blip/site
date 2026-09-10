        // ======================= E5 (V2) : RAPPROCHEMENT INTER-SOURCES (RECORD LINKAGE) =======================
        const LK_METHODS = { exact: 'Égalité (normalisée)', jw: 'Similarité Jaro-Winkler', lev: 'Similarité Levenshtein' };
        let lkPairs = null; // { id, rows:[{ra, rb, s, da, db, st}] } — st: auto | review | ok | ko
        function lkList() {
            return (state.linkages = state.linkages || []);
        }
        function lkById(id) {
            return lkList().find(x => x.id === id);
        }
        function lkAdd() {
            lkList().push({
                id: 'lk_' + generateId(),
                name: 'Nouveau rapprochement',
                a: '',
                b: '',
                blockA: '',
                blockB: '',
                compares: [],
                thAuto: 0.92,
                thReview: 0.75,
                decisions: {}
            });
            persistAppState();
            renderLinkage();
        }
        function lkSet(id, f, v) {
            const L = lkById(id);
            if (!L) return;
            L[f] = f === 'thAuto' || f === 'thReview' ? parseFloat(v) : v;
            persistAppState();
            if (f === 'a' || f === 'b') renderLinkage();
        }
        function lkDel(id) {
            state.linkages = lkList().filter(x => x.id !== id);
            persistAppState();
            renderLinkage();
        }
        function lkAddCmp(id) {
            const L = lkById(id);
            if (!L) return;
            L.compares.push({ colA: '', colB: '', method: 'jw', weight: 1 });
            persistAppState();
            renderLinkage();
        }
        function lkSetCmp(id, i, f, v) {
            const L = lkById(id);
            if (!L || !L.compares[i]) return;
            L.compares[i][f] = f === 'weight' ? parseFloat(v) || 1 : v;
            persistAppState();
        }
        function lkDelCmp(id, i) {
            const L = lkById(id);
            if (!L) return;
            L.compares.splice(i, 1);
            persistAppState();
            renderLinkage();
        }
        function lkScoreExpr(L) {
            const nv = x => `NULLIF(UPPER(TRIM(CAST(${x} AS VARCHAR))), '')`;
            const parts = L.compares
                .filter(c => c.colA && c.colB)
                .map(c => {
                    const A = nv('a.' + sqlIdent(c.colA)),
                        B = nv('b.' + sqlIdent(c.colB));
                    let sc;
                    if (c.method === 'exact') sc = `CASE WHEN ${A} IS NOT NULL AND ${A} = ${B} THEN 1.0 ELSE 0.0 END`;
                    else if (c.method === 'lev')
                        sc = `CASE WHEN ${A} IS NULL OR ${B} IS NULL THEN 0.0 ELSE 1.0 - levenshtein(${A}, ${B})::DOUBLE / GREATEST(length(${A}), length(${B}), 1) END`;
                    else sc = `CASE WHEN ${A} IS NULL OR ${B} IS NULL THEN 0.0 ELSE jaro_winkler_similarity(${A}, ${B}) END`;
                    return { w: c.weight || 1, sc };
                });
            if (!parts.length) return null;
            const sw = parts.reduce((x, y) => x + y.w, 0);
            return `(${parts.map(p2 => `${p2.w} * (${p2.sc})`).join(' + ')}) / ${sw}`;
        }
        function lkDisplayExpr(al, L, side) {
            const cols = L.compares.filter(c => c.colA && c.colB).map(c => (side === 'a' ? c.colA : c.colB));
            return `concat_ws(' · ', ${cols.map(c => `CAST(${al}.${sqlIdent(c)} AS VARCHAR)`).join(', ')})`;
        }
        async function lkRun(id, btn) {
            const L = lkById(id);
            if (!L) return;
            const tA = tableByName(L.a),
                tB = tableByName(L.b);
            if (!tA || !tB) return showError('Choisissez les deux sources.');
            if (!L.blockA || !L.blockB)
                return showError(
                    'La clé de BLOCAGE est obligatoire (sinon produit cartésien) — choisissez une colonne de chaque côté (ex. code postal, initiale…).'
                );
            const score = lkScoreExpr(L);
            if (!score) return showError('Ajoutez au moins une comparaison de colonnes.');
            if (btn) btn.disabled = true;
            bgTaskStart('Génération des paires candidates');
            try {
                const { conn } = await getDB();
                const nv = x => `NULLIF(UPPER(TRIM(CAST(${x} AS VARCHAR))), '')`;
                const sql = `SELECT * FROM (
                    SELECT a.__rn AS ra, b.__rn AS rb, ${lkDisplayExpr('a', L, 'a')} AS da, ${lkDisplayExpr('b', L, 'b')} AS db, (${score}) AS s
                    FROM ${sqlIdent(duckTableName(tA.id))} a JOIN ${sqlIdent(duckTableName(tB.id))} b
                      ON ${nv('a.' + sqlIdent(L.blockA))} = ${nv('b.' + sqlIdent(L.blockB))}
                ) WHERE s >= ${L.thReview} QUALIFY row_number() OVER (PARTITION BY ra ORDER BY s DESC) <= 3 ORDER BY s DESC LIMIT 5000`;
                const rows = arrowResultToObjects(await conn.query(sql)).map(r => {
                    const key = Number(r.ra) + '|' + Number(r.rb);
                    const dec = (L.decisions || {})[key];
                    return {
                        ra: Number(r.ra),
                        rb: Number(r.rb),
                        da: String(r.da),
                        db: String(r.db),
                        s: Number(r.s),
                        key,
                        st: dec || (Number(r.s) >= L.thAuto ? 'auto' : 'review')
                    };
                });
                lkPairs = { id, rows };
                renderLinkage();
                bgTaskEnd(
                    `🤝 ${rows.length} paire(s) candidate(s) — ${rows.filter(r => r.st === 'auto').length} automatique(s), ${rows.filter(r => r.st === 'review').length} à revoir.`
                );
            } catch (e) {
                bgTaskEnd();
                showError('Rapprochement impossible : ' + e.message);
            } finally {
                if (btn) btn.disabled = false;
            }
        }
        function lkDecide(id, key, dec) {
            const L = lkById(id);
            if (!L) return;
            L.decisions = L.decisions || {};
            L.decisions[key] = dec;
            if (lkPairs && lkPairs.id === id) {
                const row = lkPairs.rows.find(x => x.key === key);
                if (row) row.st = dec;
            }
            persistAppState();
            renderLinkage();
        }
        async function lkGolden(id, btn) {
            const L = lkById(id);
            if (!L || !lkPairs || lkPairs.id !== id) return showError("Générez d'abord les paires.");
            const tA = tableByName(L.a),
                tB = tableByName(L.b);
            const accepted = lkPairs.rows.filter(r => r.st === 'auto' || r.st === 'ok');
            if (btn) btn.disabled = true;
            bgTaskStart('Production du golden record');
            try {
                const { conn } = await getDB();
                // 1 seule correspondance par ligne A (la meilleure acceptée) — traçabilité complète.
                const best = new Map();
                accepted.forEach(r => {
                    const cur = best.get(r.ra);
                    if (!cur || r.s > cur.s) best.set(r.ra, r);
                });
                const pairs = [...best.values()];
                const mkT = async (nm, createSql) => {
                    const clash = Object.values(state.tables).find(t => t.name === nm);
                    const tId = clash ? clash.id : 'tb_' + generateId();
                    if (!clash) {
                        state.tables[tId] = {
                            id: tId,
                            name: nm,
                            file: null,
                            type: 'extraction',
                            size: 0,
                            config: {},
                            headers: [],
                            columnsMeta: {},
                            status: 'loading'
                        };
                        state.pivotMode[tId] = 'none';
                    }
                    await duckDropTable(tId);
                    await conn.query(createSql(sqlIdent(duckTableName(tId))));
                    const table = state.tables[tId];
                    table.headers = await duckTableHeaders(tId);
                    table.storage = 'table';
                    table.sampleData = await duckSampleRows(tId, 6);
                    table.status = 'ready';
                    try {
                        await persistTableData(tId);
                    } catch (e2) {}
                    return tId;
                };
                const pairsVals = pairs.length
                    ? `(VALUES ${pairs.map(r => `(${r.ra}, ${r.rb}, ${r.s.toFixed(4)}, ${sqlLiteral(r.st === 'auto' ? 'auto' : 'validée')})`).join(', ')}) m(ra, rb, score, decision)`
                    : `(VALUES (NULL, NULL, NULL, NULL)) m(ra, rb, score, decision)`;
                const corrName = 'LIENS_' + L.name.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();
                await mkT(
                    corrName,
                    T => `CREATE TABLE ${T} AS SELECT row_number() OVER () AS __rn, m.ra AS LIGNE_A, m.rb AS LIGNE_B, m.score AS SCORE, m.decision AS DECISION, ${lkDisplayExpr('a', L, 'a')} AS APERCU_A, ${lkDisplayExpr('b', L, 'b')} AS APERCU_B
                    FROM ${pairsVals} JOIN ${sqlIdent(duckTableName(tA.id))} a ON a.__rn = m.ra JOIN ${sqlIdent(duckTableName(tB.id))} b ON b.__rn = m.rb`
                );
                // Golden : lignes A enrichies de B (survivance : valeur A si non vide, sinon B) + identifiant pivot.
                const goldName = 'GOLDEN_' + L.name.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();
                const surv = L.compares
                    .filter(c => c.colA && c.colB)
                    .map(
                        c =>
                            `COALESCE(NULLIF(TRIM(CAST(a.${sqlIdent(c.colA)} AS VARCHAR)), ''), TRIM(CAST(b.${sqlIdent(c.colB)} AS VARCHAR))) AS ${sqlIdent(c.colA)}`
                    );
                const others = tA.headers.filter(h => !L.compares.some(c => c.colA === h)).map(h => `a.${sqlIdent(h)}`);
                await mkT(
                    goldName,
                    T => `CREATE TABLE ${T} AS SELECT row_number() OVER () AS __rn, 'G_' || substr(md5(CAST(a.__rn AS VARCHAR)), 1, 10) AS ID_PIVOT,
                    CASE WHEN m.rb IS NULL THEN 'A seul' ELSE 'A+B (' || m.decision || ')' END AS ORIGINE, ${surv.concat(others).join(', ')}
                    FROM ${sqlIdent(duckTableName(tA.id))} a LEFT JOIN ${pairsVals} ON m.ra = a.__rn LEFT JOIN ${sqlIdent(duckTableName(tB.id))} b ON b.__rn = m.rb`
                );
                renderTables();
                updateBaseTableSelect();
                populateQualTables();
                persistAppState();
                renderLinkage();
                bgTaskEnd(
                    `🏆 Golden record « ${goldName} » (${pairs.length} fusion(s)) et correspondances « ${corrName} » produits — visibles dans les Sources.`
                );
            } catch (e) {
                bgTaskEnd();
                showError('Golden record impossible : ' + e.message);
            } finally {
                if (btn) btn.disabled = false;
            }
        }
        function renderLinkage() {
            const lkContentElement = el('lkContent');
            if (!lkContentElement) return;
            const tables = Object.values(state.tables).filter(t => t.status === 'ready');
            let html = `<div class="flex items-center gap-2 mb-4 flex-wrap"><button onclick="lkAdd()" class="bg-rose-600 hover:bg-rose-700 text-white font-bold py-2 px-4 rounded-lg text-sm">+ Rapprochement</button>
                <span class="text-[11px] text-slate-400">Relier deux sources décrivant les mêmes entités <span class="text-slate-300">(record linkage / fuzzy matching)</span></span></div>`;
            if (!lkList().length)
                html += emptyStateHtml(
                    '🤝',
                    'Aucun rapprochement configuré',
                    'Le rapprochement (correspondances approchées, dites « fuzzy ») relie deux sources qui parlent des mêmes entités — clients CRM et clients Facturation par exemple — puis produit un golden record fusionné.',
                    '+ Configurer un rapprochement',
                    'lkAdd()'
                );
            lkList().forEach(L => {
                const tA = tableByName(L.a),
                    tB = tableByName(L.b);
                const hA = tA ? tA.headers : [],
                    hB = tB ? tB.headers : [];
                const sel = (v, opts, cb, ph, w2) =>
                    `<select onchange="${cb}" class="border border-slate-200 rounded px-1 py-1 text-[11px] bg-white ${w2 || 'max-w-[140px]'}"><option value="">${ph}</option>${opts.map(o => `<option value="${escapeHTML(o)}" ${v === o ? 'selected' : ''}>${escapeHTML(o)}</option>`).join('')}</select>`;
                html += `<div class="border border-rose-200 rounded-xl bg-white mb-4 p-4">
                    <div class="flex items-center gap-2 mb-3 flex-wrap">
                        <input type="text" value="${escapeHTML(L.name)}" onchange="lkSet('${L.id}','name',this.value)" class="font-bold text-sm border border-rose-200 p-1.5 rounded w-56">
                        <button onclick="lkRun('${L.id}', this)" class="bg-rose-600 text-white text-xs font-bold px-3 py-1.5 rounded">▶ Générer les paires</button>
                        <button onclick="lkGolden('${L.id}', this)" class="bg-white border border-rose-300 text-rose-700 text-xs font-bold px-3 py-1.5 rounded">🏆 Golden record + correspondances</button>
                        <button onclick="lkDel('${L.id}')" class="text-red-400 hover:text-red-600 font-bold ml-auto">✕</button>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3 text-xs">
                        <div class="border border-slate-100 rounded-lg p-2.5"><div class="font-bold text-slate-600 mb-1">Source A ${sel(
                            L.a,
                            tables.map(t => t.name),
                            `lkSet('${L.id}','a',this.value)`,
                            '— table —'
                        )}</div>
                            clé de blocage ${sel(L.blockA, hA, `lkSet('${L.id}','blockA',this.value)`, '— colonne —')}</div>
                        <div class="border border-slate-100 rounded-lg p-2.5"><div class="font-bold text-slate-600 mb-1">Source B ${sel(
                            L.b,
                            tables.map(t => t.name),
                            `lkSet('${L.id}','b',this.value)`,
                            '— table —'
                        )}</div>
                            clé de blocage ${sel(L.blockB, hB, `lkSet('${L.id}','blockB',this.value)`, '— colonne —')}</div>
                    </div>
                    <div class="mb-2 text-xs"><span class="font-bold text-slate-600">Comparaisons</span> <button onclick="lkAddCmp('${L.id}')" class="text-[10px] bg-white border border-slate-300 rounded px-2 py-0.5 font-bold text-slate-500">+ colonne</button>
                        ${(L.compares || [])
                            .map(
                                (cp, i) => `<div class="flex items-center gap-1.5 mt-1 pl-3">
                            ${sel(cp.colA, hA, `lkSetCmp('${L.id}',${i},'colA',this.value)`, 'col A')} ≈ ${sel(cp.colB, hB, `lkSetCmp('${L.id}',${i},'colB',this.value)`, 'col B')}
                            <select onchange="lkSetCmp('${L.id}',${i},'method',this.value)" class="border border-slate-200 rounded px-1 py-0.5 text-[11px] bg-white">${Object.entries(
                                LK_METHODS
                            )
                                .map(([k, l]) => `<option value="${k}" ${cp.method === k ? 'selected' : ''}>${l}</option>`)
                                .join('')}</select>
                            poids <input type="number" value="${cp.weight || 1}" step="0.5" min="0.5" onchange="lkSetCmp('${L.id}',${i},'weight',this.value)" class="border border-slate-200 rounded px-1 py-0.5 text-[11px] w-14">
                            <button onclick="lkDelCmp('${L.id}',${i})" class="text-slate-300 hover:text-red-500 font-bold">✕</button>
                        </div>`
                            )
                            .join('')}
                    </div>
                    <div class="flex items-center gap-3 text-xs mb-1">Seuils : fusion automatique ≥ <input type="number" value="${L.thAuto}" step="0.01" min="0.5" max="1" onchange="lkSet('${L.id}','thAuto',this.value)" class="border border-slate-200 rounded px-1 py-0.5 w-16"> · à revoir ≥ <input type="number" value="${L.thReview}" step="0.01" min="0.3" max="1" onchange="lkSet('${L.id}','thReview',this.value)" class="border border-slate-200 rounded px-1 py-0.5 w-16"></div>
                    ${
                        lkPairs && lkPairs.id === L.id
                            ? (() => {
                                  const auto = lkPairs.rows.filter(r => r.st === 'auto'),
                                      rev = lkPairs.rows.filter(r => r.st === 'review'),
                                      okd = lkPairs.rows.filter(r => r.st === 'ok'),
                                      kod = lkPairs.rows.filter(r => r.st === 'ko');
                                  return `<div class="mt-3 flex gap-2 flex-wrap text-xs">
                            <span class="bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-full px-2.5 py-1 font-bold">✔ ${auto.length} automatique(s)</span>
                            <span class="bg-amber-50 border border-amber-200 text-amber-700 rounded-full px-2.5 py-1 font-bold">🧐 ${rev.length} à revoir</span>
                            <span class="bg-sky-50 border border-sky-200 text-sky-700 rounded-full px-2.5 py-1 font-bold">👍 ${okd.length} validée(s)</span>
                            <span class="bg-slate-100 border border-slate-200 text-slate-500 rounded-full px-2.5 py-1 font-bold">👎 ${kod.length} rejetée(s)</span>
                        </div>
                        ${
                            rev.length
                                ? `<div class="mt-2 max-h-[320px] overflow-y-auto border border-amber-100 rounded-lg">${rev
                                      .slice(0, 200)
                                      .map(
                                          r => `<div class="flex items-center gap-2 text-[11px] border-b border-amber-50 px-2 py-1.5">
                            <span class="font-black text-amber-600 w-14">${(r.s * 100).toFixed(1)} %</span>
                            <div class="flex-grow min-w-0"><div class="truncate">A · ${escapeHTML(r.da)}</div><div class="truncate text-slate-500">B · ${escapeHTML(r.db)}</div>
                                </div>
                            <button onclick="lkDecide('${L.id}','${r.key}','ok')" class="bg-emerald-600 text-white rounded px-2 py-0.5 font-bold">✔</button>
                            <button onclick="lkDecide('${L.id}','${r.key}','ko')" class="bg-white border border-slate-300 text-slate-500 rounded px-2 py-0.5 font-bold">✕</button>
                        </div>`
                                      )
                                      .join('')}</div>`
                                : ''
                        }`;
                              })()
                            : ''
                    }
                </div>`;
            });
            lkContentElement.innerHTML = html;
        }
