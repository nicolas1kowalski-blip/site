        // ==========================================
        //  STEP 7: COMPARATEUR
        // ==========================================
        function handleCompTableChange(side) {
            if (!compState.keys.length) compState.keys.push({ id: generateId(), colA: '', colB: '' });
            renderCompKeys();
            renderCompMappings();
        }

        // ---- V6.19 : clé COMPOSITE — autant de couples de colonnes (A ↔ B) que nécessaire ----
        function addCompKey() {
            compState.keys.push({ id: generateId(), colA: '', colB: '' });
            renderCompKeys();
        }
        function removeCompKey(id) {
            compState.keys = compState.keys.filter(k => k.id !== id);
            if (!compState.keys.length) compState.keys.push({ id: generateId(), colA: '', colB: '' });
            renderCompKeys();
        }
        function updateCompKey(id, side, val) {
            const k = compState.keys.find(x => x.id === id);
            if (!k) return;
            if (side === 'A') {
                k.colA = val;
                // Confort : on propose d'emblée la colonne de même nom côté B si elle existe.
                const tB = state.tables[el('compTableB').value];
                if (val && !k.colB && tB) {
                    const header = tB.headers.find(h => normColName(h) === normColName(val));
                    if (header) k.colB = header;
                }
            } else k.colB = val;
            renderCompKeys();
        }
        function compKeyParts() {
            return (compState.keys || []).filter(k => k.colA && k.colB);
        }
        function renderCompKeys() {
            const area = el('compKeysArea');
            if (!area) return;
            const tA = state.tables[el('compTableA').value],
                tB = state.tables[el('compTableB').value];
            const opts = (t, cur, lbl) =>
                `<option value="">${lbl}</option>` +
                (t
                    ? t.headers
                          .map(h => `<option value="${escapeHTML(h)}" ${h === cur ? 'selected' : ''}>${escapeHTML(h)}</option>`)
                          .join('')
                    : '');
            if (!compState.keys.length) compState.keys.push({ id: generateId(), colA: '', colB: '' });
            area.innerHTML = compState.keys
                .map(
                    (k, i) => `
                <div class="flex items-center gap-3 bg-amber-50/40 p-2 border border-amber-200 rounded">
                    <span class="text-[10px] font-black text-amber-700 w-6 text-center">${i + 1}</span>
                    <div class="w-5/12"><select class="w-full border border-slate-300 p-2 text-sm rounded bg-white" onchange="updateCompKey('${k.id}', 'A', this.value)">${opts(tA, k.colA, 'Colonne clé Fichier A...')}</select></div>
                    <div class="w-2/12 flex justify-center text-amber-500 font-bold">↔</div>
                    <div class="w-5/12"><select class="w-full border border-slate-300 p-2 text-sm rounded bg-white" onchange="updateCompKey('${k.id}', 'B', this.value)">${opts(tB, k.colB, 'Colonne clé Fichier B...')}</select></div>
                    <button onclick="removeCompKey('${k.id}')" class="text-red-500 hover:text-red-700 ml-2" title="Retirer cette colonne de la clé">✕</button>
                </div>`
                )
                .join('');
            const parts = compKeyParts();
            area.insertAdjacentHTML(
                'beforeend',
                parts.length > 1
                    ? `<p class="text-[11px] text-amber-700 font-bold">Clé composite sur ${parts.length} colonnes : ${escapeHTML(parts.map(k => k.colA).join(' + '))} ↔ ${escapeHTML(parts.map(k => k.colB).join(' + '))}</p>`
                    : parts.length
                      ? `<p class="text-[11px] text-slate-400">Clé simple : ${escapeHTML(parts[0].colA)} ↔ ${escapeHTML(parts[0].colB)}.</p>`
                      : ''
            );
        }

        function addCompMapping() {
            compState.mappings.push({ id: generateId(), colA: '', colB: '' });
            renderCompMappings();
        }
        function removeCompMapping(id) {
            compState.mappings = compState.mappings.filter(m => m.id !== id);
            renderCompMappings();
        }
        function updateCompMapping(id, side, val) {
            const mapping = compState.mappings.find(x => x.id === id);
            if (mapping) {
                if (side === 'A') mapping.colA = val;
                else mapping.colB = val;
            }
        }

        function renderCompMappings() {
            const area = el('compMappingsArea');
            const tIdA = el('compTableA').value;
            const tIdB = el('compTableB').value;
            let optsA = '<option value="">Colonne Fichier A...</option>';
            if (tIdA && state.tables[tIdA])
                optsA += state.tables[tIdA].headers
                    .map(h => `<option value="${escapeHTML(h)}">${escapeHTML(h)}</option>`)
                    .join('');
            let optsB = '<option value="">Colonne Fichier B...</option>';
            if (tIdB && state.tables[tIdB])
                optsB += state.tables[tIdB].headers
                    .map(h => `<option value="${escapeHTML(h)}">${escapeHTML(h)}</option>`)
                    .join('');

            if (compState.mappings.length === 0) {
                area.innerHTML =
                    '<p class="text-sm text-slate-400 italic">Aucune correspondance. Cliquez sur Ajouter pour commencer le mapping.</p>';
                return;
            }

            let html = '';
            compState.mappings.forEach(m => {
                html += `
                <div class="flex items-center gap-3 bg-slate-50 p-2 border border-slate-200 rounded">
                    <div class="w-5/12"><select class="w-full border border-slate-300 p-2 text-sm rounded focus:ring-indigo-500" onchange="updateCompMapping('${m.id}', 'A', this.value)">${optsA.replace(`value="${m.colA}"`, `value="${m.colA}" selected`)}</select></div>
                    <div class="w-2/12 flex justify-center text-slate-400"><i data-lucide="arrow-right-left" class="w-4 h-4"></i></div>
                    <div class="w-5/12"><select class="w-full border border-slate-300 p-2 text-sm rounded focus:ring-emerald-500" onchange="updateCompMapping('${m.id}', 'B', this.value)">${optsB.replace(`value="${m.colB}"`, `value="${m.colB}" selected`)}</select></div>
                    <button onclick="removeCompMapping('${m.id}')" class="text-red-500 hover:text-red-700 ml-2"><i data-lucide="trash-2" class="w-5 h-5"></i></button>
                </div>`;
            });
            area.innerHTML = html;
            lucide.createIcons();
        }

        // Normalise une colonne pour la comparaison : COALESCE(...,'') pour une valeur (une valeur NULL
        // compte comme "vide" quels que soient les réglages), NULLIF(...,'') pour une clé de jointure
        // (une clé vide ne doit jamais matcher une autre clé vide, exactement comme avant).
        function comparisonNormExpr(alias, col, ignoreSpace, ignoreCase, forKey) {
            let expr = `CAST(${alias ? alias + '.' : ''}${sqlIdent(col)} AS VARCHAR)`;
            if (ignoreSpace) expr = `TRIM(${expr})`;
            if (ignoreCase) expr = `LOWER(${expr})`;
            return forKey ? `NULLIF(${expr}, '')` : `COALESCE(${expr}, '')`;
        }

        async function runComparison() {
            hideError();
            const tIdA = el('compTableA').value,
                tIdB = el('compTableB').value;
            const keyParts = compKeyParts();

            if (!tIdA || !tIdB) return showError('Sélectionnez les deux tables à comparer.');
            if (!keyParts.length) return showError('Choisissez au moins une colonne de clé de chaque côté (A ↔ B).');
            const validMappings = compState.mappings.filter(m => m.colA && m.colB);
            // V6.19 : sans aucune correspondance, on ne compare QUE la présence des clés
            // (celles en moins et celles en plus d'un fichier à l'autre).
            const keyOnly = validMappings.length === 0;

            el('btnRunComp').disabled = true;
            el('compProgressArea').classList.remove('hidden');
            el('compDownloadArea').classList.add('hidden');
            el('compSummary').innerHTML = '';

            const compProgressBarElement = el('compProgressBar'),
                compStatusTextElement = el('compStatusText');
            compProgressBarElement.style.width = '10%';

            const ignoreCase = el('compIgnoreCase').checked,
                ignoreSpace = el('compIgnoreSpace').checked;

            try {
                const { conn } = await getDB();
                compStatusTextElement.innerText = 'Exécution de la jointure SQL...';

                // Clé composite : les parties normalisées sont concaténées avec un séparateur qui ne peut
                // pas figurer dans une donnée (chr(31), séparateur d'unité). Si UNE partie est vide, la
                // clé entière est nulle et la ligne est écartée — comme pour une clé simple.
                const compositeKeySql = side => {
                    const parts = keyParts.map(k =>
                        comparisonNormExpr('', side === 'A' ? k.colA : k.colB, ignoreSpace, ignoreCase, true)
                    );
                    if (parts.length === 1) return parts[0];
                    return `CASE WHEN ${parts.map(pp => `${pp} IS NULL`).join(' OR ')} THEN NULL ELSE ${parts.join(' || chr(31) || ')} END`;
                };
                const keyExprA = compositeKeySql('A'),
                    keyExprB = compositeKeySql('B');

                // Une colonne de sortie par partie de clé : plus lisible qu'une clé concaténée.
                const outSchema = [];
                const selectExprs = [];
                keyParts.forEach(k => {
                    const h = dedupeHeader(outSchema, keyParts.length > 1 ? `CLE_${k.colA}` : 'CLE_IDENTIFICATION');
                    outSchema.push(h);
                    selectExprs.push(
                        `COALESCE(CAST(a.${sqlIdent(k.colA)} AS VARCHAR), CAST(b.${sqlIdent(k.colB)} AS VARCHAR)) AS ${sqlIdent(h)}`
                    );
                });
                outSchema.push('STATUT_LIGNE');

                const diffFlags = validMappings.map((m, i) => `__d${i}`);
                validMappings.forEach((m, i) => {
                    const nA = comparisonNormExpr('a', m.colA, ignoreSpace, ignoreCase, false);
                    const nB = comparisonNormExpr('b', m.colB, ignoreSpace, ignoreCase, false);
                    selectExprs.push(`(${nA} <> ${nB}) AS ${sqlIdent(diffFlags[i])}`);
                });
                selectExprs.push(`
                    CASE
                        WHEN a.__nk IS NULL THEN 'Manquant Fichier A'
                        WHEN b.__nk IS NULL THEN 'Manquant Fichier B'
                        ${
                            keyOnly
                                ? "ELSE 'Clé présente des deux côtés'"
                                : `WHEN (${diffFlags.map(f => `COALESCE(${f}, false)`).join(' OR ')}) THEN 'Valeurs Différentes'
                        ELSE '100% Identique'`
                        }
                    END AS ${sqlIdent('STATUT_LIGNE')}
                `);
                validMappings.forEach((m, i) => {
                    const hA = dedupeHeader(outSchema, `VAL_${m.colA}_(Fich_A)`);
                    outSchema.push(hA);
                    const hB = dedupeHeader(outSchema, `VAL_${m.colB}_(Fich_B)`);
                    outSchema.push(hB);
                    const hD = dedupeHeader(outSchema, `STATUT_DIFFERENCE_${m.colA}`);
                    outSchema.push(hD);
                    selectExprs.push(`a.${sqlIdent(m.colA)} AS ${sqlIdent(hA)}`);
                    selectExprs.push(`b.${sqlIdent(m.colB)} AS ${sqlIdent(hB)}`);
                    selectExprs.push(`
                        CASE
                            WHEN a.__nk IS NULL THEN 'Manquant A'
                            WHEN b.__nk IS NULL THEN 'Manquant B'
                            WHEN ${diffFlags[i]} THEN 'DIFFÉRENT'
                            ELSE 'Identique'
                        END AS ${sqlIdent(hD)}
                    `);
                });

                const resultTId = 'cmp_' + generateId();
                await conn.query(`
                    CREATE TABLE ${sqlIdent(duckTableName(resultTId))} AS
                    SELECT row_number() OVER () AS __rn, * FROM (
                        SELECT ${selectExprs.join(', ')}
                        FROM (SELECT *, ${keyExprA} AS __nk FROM ${sqlIdent(duckTableName(tIdA))} WHERE ${keyExprA} IS NOT NULL) a
                        FULL OUTER JOIN (SELECT *, ${keyExprB} AS __nk FROM ${sqlIdent(duckTableName(tIdB))} WHERE ${keyExprB} IS NOT NULL) b
                            ON a.__nk = b.__nk
                    ) AS sub
                `);
                compProgressBarElement.style.width = '50%';
                compStatusTextElement.innerText = 'Calcul des statistiques...';

                const totalRes = await conn.query(
                    keyOnly
                        ? `SELECT COUNT(*)::BIGINT AS n FROM ${sqlIdent(duckTableName(resultTId))}`
                        : `SELECT COUNT(*)::BIGINT AS n FROM ${sqlIdent(duckTableName(tIdA))}`
                );
                const statsRes = await conn.query(`
                    SELECT
                        SUM(CASE WHEN ${sqlIdent('STATUT_LIGNE')} IN ('100% Identique', 'Clé présente des deux côtés') THEN 1 ELSE 0 END)::BIGINT AS identical,
                        SUM(CASE WHEN ${sqlIdent('STATUT_LIGNE')} = 'Valeurs Différentes' THEN 1 ELSE 0 END)::BIGINT AS diff,
                        SUM(CASE WHEN ${sqlIdent('STATUT_LIGNE')} = 'Manquant Fichier A' THEN 1 ELSE 0 END)::BIGINT AS missinga,
                        SUM(CASE WHEN ${sqlIdent('STATUT_LIGNE')} = 'Manquant Fichier B' THEN 1 ELSE 0 END)::BIGINT AS missingb
                    FROM ${sqlIdent(duckTableName(resultTId))}
                `);

                const total = Number(arrowResultToObjects(totalRes)[0].n);
                const statsRow = arrowResultToObjects(statsRes)[0];
                const identical = Number(statsRow.identical || 0),
                    diff = Number(statsRow.diff || 0);
                const missingA = Number(statsRow.missinga || 0),
                    missingB = Number(statsRow.missingb || 0);

                const headerLine = outSchema.map(escapeCSV).join(';') + '\n';
                const blobParts = [headerLine];
                let chunkBuf = [];
                compProgressBarElement.style.width = '70%';
                compStatusTextElement.innerText = 'Écriture du rapport...';
                await duckStreamRows(
                    resultTId,
                    0,
                    async row => {
                        chunkBuf.push(outSchema.map(h => escapeCSV(row[h])).join(';'));
                        if (chunkBuf.length >= 5000) {
                            blobParts.push(chunkBuf.join('\n') + '\n');
                            chunkBuf = [];
                        }
                    },
                    (cursor, total2) => {
                        compProgressBarElement.style.width = 70 + Math.floor((cursor / total2) * 30) + '%';
                    }
                );
                if (chunkBuf.length > 0) blobParts.push(chunkBuf.join('\n') + '\n');

                await duckDropTable(resultTId);

                compProgressBarElement.style.width = '100%';
                compStatusTextElement.innerText = 'Comparaison Terminée !';
                const keyLbl = keyParts.map(k => k.colA).join(' + ');
                const tile = (bg, lbl, val, sub) =>
                    `<div class="${bg} border p-4 rounded-xl"><div class="text-xs font-bold uppercase mb-1">${lbl}</div><div class="text-2xl font-black">${Number(val).toLocaleString('fr-FR')}</div>${sub ? `<div class="text-[10px] text-slate-500 mt-1">${sub}</div>` : ''}</div>`;
                el('compSummary').innerHTML = keyOnly
                    ? `<div class="text-xs text-slate-500 mb-3">Comparaison des <strong>écarts de clé</strong> sur <strong>${escapeHTML(keyLbl)}</strong> — aucune valeur n'était à contrôler.</div>
                       <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-left">
                       ${tile('bg-indigo-50', 'Clés évaluées', total, 'union des deux fichiers')}
                       ${tile('bg-emerald-50', 'Présentes des deux côtés', identical, '')}
                       ${tile('bg-red-50', 'En plus dans A', missingB, 'absentes du fichier B')}
                       ${tile('bg-amber-50', 'En plus dans B', missingA, 'absentes du fichier A')}</div>`
                    : `<div class="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 text-left">
                       ${tile('bg-indigo-50', 'Total évalué', total, '')}
                       ${tile('bg-emerald-50', '100% Identiques', identical, '')}
                       ${tile('bg-amber-50', 'Avec Différences', diff, '')}
                       ${tile('bg-red-50', 'Lignes Absentes', missingA + missingB, `${missingB} en plus dans A · ${missingA} en plus dans B`)}</div>`;

                const finalBlob = new Blob(['﻿', ...blobParts], { type: 'text/csv;charset=utf-8;' });
                const compDownloadLinkElement = el('compDownloadLink');
                compDownloadLinkElement.href = URL.createObjectURL(finalBlob);
                compDownloadLinkElement.download = `Comparaison_Resultat_${Date.now()}.csv`;
                el('compDownloadArea').classList.remove('hidden');
            } catch (e) {
                showError('Erreur lors de la comparaison: ' + e.message);
            } finally {
                el('btnRunComp').disabled = false;
            }
        }
