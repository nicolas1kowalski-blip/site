        // ======================= Déduction automatique des liens (modèle de données) =======================
        // Deux signaux : (1) proximité des NOMS de colonnes (clés étrangères probables), utilisée pour
        // pré-sélectionner les paires candidates, puis (2) RECOUVREMENT RÉEL des valeurs mesuré en SQL
        // (part des valeurs communes) — c'est la donnée qui tranche. Les propositions sont classées par
        // confiance et présentées avec cases à cocher (plusieurs choix possibles par paire de tables).
        function normColName(s) {
            return String(s)
                .toUpperCase()
                .normalize('NFD')
                .replace(/[̀-ͯ]/g, '')
                .replace(/[^A-Z0-9]/g, '');
        }
        function relCandidatePairs() {
            const tables = Object.values(state.tables).filter(t => t.status === 'ready');
            const KEYRE = /(ID|CODE|CLE|KEY|NUM|REF|FK|PK)/;
            const out = [];
            for (let i = 0; i < tables.length; i++) {
                for (let j = i + 1; j < tables.length; j++) {
                    const A = tables[i],
                        B = tables[j];
                    const at = normColName(cleanFileName(A.name)),
                        bt = normColName(cleanFileName(B.name));
                    const cand = [];
                    A.headers.forEach(a => {
                        const na = normColName(a);
                        B.headers.forEach(b => {
                            const nb = normColName(b);
                            let score = 0,
                                reason = '';
                            if (na === nb) {
                                score = 0.9;
                                reason = 'noms identiques';
                            } else if (na.length >= 3 && nb.length >= 3 && (na.includes(nb) || nb.includes(na))) {
                                score = 0.62;
                                reason = 'noms proches';
                            } else if (
                                KEYRE.test(na) &&
                                bt.length >= 3 &&
                                (na.includes(bt) || bt.includes(na.replace(KEYRE, '')))
                            ) {
                                score = 0.55;
                                reason = `ressemble à une clé vers ${B.name}`;
                            } else if (
                                KEYRE.test(nb) &&
                                at.length >= 3 &&
                                (nb.includes(at) || at.includes(nb.replace(KEYRE, '')))
                            ) {
                                score = 0.55;
                                reason = `ressemble à une clé vers ${A.name}`;
                            }
                            if (score > 0) cand.push({ A, B, a, b, score, reason });
                        });
                    });
                    cand.sort((x, y) => y.score - x.score);
                    cand.slice(0, 6).forEach(c => out.push(c));
                }
            }
            return out.slice(0, 90);
        }
        let relInferResults = [];
        async function inferRelations(onProgress) {
            const { conn } = await getDB();
            const cands = relCandidatePairs();
            const proposals = [];
            const nrm = (al, col) => `NULLIF(UPPER(TRIM(CAST(${al}.${sqlIdent(col)} AS VARCHAR))), '')`;
            let done = 0;
            for (const c of cands) {
                done++;
                if (onProgress) onProgress(done, cands.length);
                if (
                    state.relations.some(
                        r =>
                            (r.sourceTable === c.A.id &&
                                r.targetTable === c.B.id &&
                                r.sourceCol === c.a &&
                                r.targetCol === c.b) ||
                            (r.sourceTable === c.B.id && r.targetTable === c.A.id && r.sourceCol === c.b && r.targetCol === c.a)
                    )
                )
                    continue;
                try {
                    const res = await conn.query(`
                        WITH a AS (SELECT DISTINCT ${nrm('x', c.a)} k FROM ${sqlIdent(duckTableName(c.A.id))} x),
                             b AS (SELECT DISTINCT ${nrm('y', c.b)} k FROM ${sqlIdent(duckTableName(c.B.id))} y)
                        SELECT (SELECT COUNT(*) FROM a WHERE k IS NOT NULL)::BIGINT an,
                               (SELECT COUNT(*) FROM b WHERE k IS NOT NULL)::BIGINT bn,
                               (SELECT COUNT(*) FROM a JOIN b USING(k) WHERE a.k IS NOT NULL)::BIGINT inter`);
                    const row = arrowResultToObjects(res)[0];
                    const number = Number(row.an),
                        bn = Number(row.bn),
                        inter = Number(row.inter);
                    if (inter < 1 || !number || !bn) continue;
                    const contain = inter / Math.min(number, bn);
                    if (contain < 0.3) continue;
                    // Confiance : le recouvrement des données prime, le nom conforte.
                    const conf = Math.min(1, contain * 0.85 + c.score * 0.15);
                    proposals.push({
                        Aid: c.A.id,
                        Bid: c.B.id,
                        An: c.A.name,
                        Bn: c.B.name,
                        a: c.a,
                        b: c.b,
                        an: number,
                        bn,
                        inter,
                        contain,
                        reason: c.reason,
                        conf
                    });
                } catch (e) {}
            }
            proposals.sort((x, y) => y.conf - x.conf);
            return proposals;
        }
        function relInferModal() {
            let relInferModalElement = el('relInferModal');
            if (!relInferModalElement) {
                relInferModalElement = document.createElement('div');
                relInferModalElement.id = 'relInferModal';
                relInferModalElement.className = 'fixed inset-0 z-50 hidden items-center justify-center bg-slate-900/60 p-4';
                relInferModalElement.innerHTML = `<div class="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
                    <div class="bg-indigo-50 border-b border-indigo-200 px-4 py-3 flex items-center gap-2"><span class="text-sm font-black text-indigo-800">🪄 Liens déduits des données</span><button onclick="closeRelInfer()" class="ml-auto text-indigo-600 hover:text-red-600 font-black text-base leading-none px-1">✕</button></div>
                    <div id="relInferBody" class="overflow-auto flex-grow p-4"></div>
                    <div id="relInferFoot" class="border-t border-slate-200 px-4 py-2.5 flex items-center gap-2 flex-wrap"></div>
                </div>`;
                relInferModalElement.addEventListener('click', e => {
                    if (e.target === relInferModalElement) closeRelInfer();
                });
                document.addEventListener('keydown', e => {
                    if (e.key === 'Escape') closeRelInfer();
                });
                document.body.appendChild(relInferModalElement);
            }
            relInferModalElement.classList.remove('hidden');
            relInferModalElement.classList.add('flex');
            return relInferModalElement;
        }
        function closeRelInfer() {
            const relInferModalElement = el('relInferModal');
            if (relInferModalElement) {
                relInferModalElement.classList.add('hidden');
                relInferModalElement.classList.remove('flex');
            }
        }
        async function openRelInfer() {
            if (Object.values(state.tables).filter(t => t.status === 'ready').length < 2)
                return showError('Chargez au moins 2 sources pour déduire des liens.');
            relInferModal();
            el('relInferBody').innerHTML =
                '<p class="text-sm text-slate-500">Analyse du contenu des données en cours… <span id="relInferProg" class="font-bold"></span></p>';
            el('relInferFoot').innerHTML = '';
            try {
                relInferResults = await inferRelations((d, tot) => {
                    const relInferProgElement = el('relInferProg');
                    if (relInferProgElement) relInferProgElement.textContent = `(${d}/${tot})`;
                });
                renderRelInferResults();
            } catch (e) {
                el('relInferBody').innerHTML =
                    `<p class="text-sm text-red-600">Déduction impossible : ${escapeHTML(e.message)}</p>`;
            }
        }
        function renderRelInferResults() {
            const body = el('relInferBody'),
                foot = el('relInferFoot');
            if (!relInferResults.length) {
                body.innerHTML =
                    '<p class="text-sm text-emerald-700">Aucun nouveau lien probant détecté (les liens évidents sont peut-être déjà créés).</p>';
                foot.innerHTML =
                    '<button onclick="closeRelInfer()" class="ml-auto text-sm bg-slate-100 border border-slate-300 px-4 py-1.5 rounded-lg font-bold">Fermer</button>';
                return;
            }
            body.innerHTML =
                `<p class="text-[11px] text-slate-400 mb-2">Cochez les liens à créer. La confiance combine la ressemblance des noms et surtout le <strong>recouvrement réel des valeurs</strong>. Plusieurs propositions peuvent concerner la même paire de tables — choisissez la bonne.</p>` +
                relInferResults
                    .map((p, i) => {
                        const pct = Math.round(p.conf * 100);
                        const col = pct >= 80 ? 'text-emerald-600' : pct >= 55 ? 'text-amber-600' : 'text-slate-500';
                        const pre = p.conf >= 0.6;
                        return `<label class="flex items-start gap-2 p-2 border rounded-lg mb-1.5 cursor-pointer hover:bg-slate-50 ${pre ? 'border-emerald-200 bg-emerald-50/30' : 'border-slate-200'}">
                        <input type="checkbox" data-i="${i}" ${pre ? 'checked' : ''} class="mt-1 relinfer-chk">
                        <div class="flex-grow">
                            <div class="text-sm font-bold text-slate-700"><span class="font-mono">${escapeHTML(p.An)}.${escapeHTML(p.a)}</span> <span class="text-slate-400">↔</span> <span class="font-mono">${escapeHTML(p.Bn)}.${escapeHTML(p.b)}</span></div>
                            <div class="text-[11px] text-slate-500">${escapeHTML(p.reason)} · ${p.inter.toLocaleString('fr-FR')} valeurs communes (${Math.round(p.contain * 100)}% de recouvrement)</div>
                        </div>
                        <div class="text-lg font-black ${col}">${pct}%</div>
                    </label>`;
                    })
                    .join('');
            foot.innerHTML = `<span class="text-[11px] text-slate-400">${relInferResults.length} proposition(s)</span>
                <button onclick="closeRelInfer()" class="ml-auto text-sm bg-slate-100 border border-slate-300 px-4 py-1.5 rounded-lg font-bold">Annuler</button>
                <button onclick="addSelectedInferred()" class="text-sm bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-1.5 rounded-lg font-bold">＋ Créer les liens cochés</button>`;
        }
        function addSelectedInferred() {
            let count = 0;
            document.querySelectorAll('#relInferBody .relinfer-chk').forEach(chk => {
                if (!chk.checked) return;
                const p = relInferResults[parseInt(chk.dataset.i)];
                if (!p) return;
                if (addPredefinedRelation(p.Aid, p.a, p.Bid, p.b)) count++;
            });
            closeRelInfer();
            if (count) {
                renderRelationsList();
                renderGraph();
                persistAppState();
                showSuccess(`${count} lien(s) créé(s) depuis les données.`);
            } else showError('Aucun lien coché à créer.');
        }
        // Déduction ciblée sur UNE ligne de relation : à partir de la table+colonne source déjà choisies,
        // trouve la meilleure (table, colonne) cible par recouvrement des valeurs.
        async function deduceRelationRow(relId, btn) {
            const relation = state.relations.find(x => x.id === relId);
            if (!relation || !relation.sourceTable || !relation.sourceCol)
                return showError("Choisissez d'abord la table et la colonne source.");
            const src = state.tables[relation.sourceTable];
            if (!src) return;
            if (btn) {
                btn.disabled = true;
                btn.textContent = '…';
            }
            try {
                const { conn } = await getDB();
                const nrm = (al, col) => `NULLIF(UPPER(TRIM(CAST(${al}.${sqlIdent(col)} AS VARCHAR))), '')`;
                const targets = Object.values(state.tables).filter(t => t.status === 'ready' && t.id !== relation.sourceTable);
                const best = [];
                for (const T of targets) {
                    // pré-filtre par nom pour limiter le coût
                    const na = normColName(relation.sourceCol);
                    const cols = T.headers
                        .filter(h => {
                            const nb = normColName(h);
                            return (
                                nb === na ||
                                (na.length >= 3 && (na.includes(nb) || nb.includes(na))) ||
                                /(ID|CODE|CLE|KEY|NUM|REF)/.test(nb) ||
                                /(ID|CODE|CLE|KEY|NUM|REF)/.test(na)
                            );
                        })
                        .slice(0, 8);
                    for (const h of cols) {
                        try {
                            const res = await conn.query(`
                                WITH a AS (SELECT DISTINCT ${nrm('x', relation.sourceCol)} k FROM ${sqlIdent(duckTableName(relation.sourceTable))} x),
                                     b AS (SELECT DISTINCT ${nrm('y', h)} k FROM ${sqlIdent(duckTableName(T.id))} y)
                                SELECT (SELECT COUNT(*) FROM a WHERE k IS NOT NULL)::BIGINT an, (SELECT COUNT(*) FROM b WHERE k IS NOT NULL)::BIGINT bn,
                                       (SELECT COUNT(*) FROM a JOIN b USING(k) WHERE a.k IS NOT NULL)::BIGINT inter`);
                            const row = arrowResultToObjects(res)[0];
                            const number = Number(row.an),
                                bn = Number(row.bn),
                                inter = Number(row.inter);
                            if (inter >= 1 && number && bn)
                                best.push({ tId: T.id, tName: T.name, col: h, contain: inter / Math.min(number, bn), inter });
                        } catch (e) {}
                    }
                }
                best.sort((x, y) => y.contain - x.contain);
                if (!best.length) {
                    showError('Aucune correspondance trouvée dans les données pour cette colonne.');
                    return;
                }
                const top = best[0];
                relation.targetTable = top.tId;
                relation.targetCol = top.col;
                renderRelationsList();
                renderGraph();
                persistAppState();
                const alts = best.slice(1, 4).filter(x => x.contain > 0.3);
                showSuccess(
                    `Lien déduit : → ${top.tName}.${top.col} (${Math.round(top.contain * 100)}% de recouvrement)${alts.length ? ` · autres pistes : ${alts.map(x => x.tName + '.' + x.col).join(', ')}` : ''}`
                );
            } catch (e) {
                showError('Déduction impossible : ' + e.message);
            } finally {
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = '🪄';
                }
            }
        }

        function toggleDbModal() {
            el('dbModal').classList.toggle('hidden');
        }

        async function connectApi() {
            const name = el('apiTableName').value || 'API_' + Date.now(),
                url = el('apiUrl').value,
                path = el('apiDataPath').value;
            if (!url) return showError('URL requise.');
            el('apiLoading').classList.remove('hidden');
            try {
                const res = await fetch(url);
                if (!res.ok) throw new Error('HTTP ' + res.status);
                let json = await res.json();
                if (path)
                    path.split('.').forEach(k => {
                        if (json[k] !== undefined) json = json[k];
                    });
                if (!Array.isArray(json)) {
                    const arrs = Object.values(json).filter(Array.isArray);
                    if (arrs.length) json = arrs[0];
                    else throw new Error('Format invalide.');
                }
                // Les lignes doivent être indexées par le MÊME nom que les en-têtes : en gardant les
                // clés brutes alors que les en-têtes étaient nettoyés (BOM, espaces de bord), toutes
                // les valeurs ressortaient vides. On nettoie donc dès la construction des lignes.
                const flat = json.map(r => {
                    const nr = {};
                    if (r && typeof r === 'object')
                        Object.keys(r).forEach(k => {
                            const value = r[k];
                            nr[cleanHeader(k)] = value && typeof value === 'object' ? JSON.stringify(value) : value;
                        });
                    return nr;
                });
                const head = new Set();
                flat.forEach(r => Object.keys(r).forEach(k => head.add(k)));
                const headers = Array.from(head);
                if (!headers.length)
                    throw new Error(
                        "La réponse ne contient pas d'objets exploitables (attendu : un tableau d'enregistrements avec des champs nommés)."
                    );
                const tId = 'tb_' + generateId();
                state.tables[tId] = {
                    id: tId,
                    name: name,
                    file: null,
                    type: 'api',
                    size: flat.length,
                    config: { url, path },
                    headers: [],
                    columnsMeta: {},
                    status: 'loading'
                };
                el('emptyStateSources').classList.add('hidden');
                renderTables();
                await ingestRowsIntoDuckDB(tId, flat, headers);
                const table = state.tables[tId];
                table.headers = headers;
                table.sampleData = await duckSampleRows(tId, 5);
                table.status = 'ready';
                toggleDbModal();
                el('apiLoading').classList.add('hidden');
                renderTables();
                autoDetectRelations(tId);
                updateBaseTableSelect();
                populateQualTables();
                persistTableData(tId);
                persistAppState();
            } catch (e) {
                el('apiLoading').classList.add('hidden');
                showError('Connexion API échouée : ' + e.message);
            }
        }

        async function handleFilesAdded(e) {
            hideError();
            const files = e.target.files;
            if (!files.length) return;
            el('emptyStateSources').classList.add('hidden');
            for (const f of Array.from(files)) {
                await loadNewSourceFromFile(f);
            }
            e.target.value = '';
        }
        // Charge un fichier comme NOUVELLE source (factorisé, réutilisé par l'import de dossier surveillé).
        async function loadNewSourceFromFile(f) {
            const ext = f.name.split('.').pop().toLowerCase();
            if (!SRC_EXTS.includes(ext)) {
                // Auparavant : return null, sans un mot. Le fichier disparaissait et l'utilisateur
                // n'avait aucun moyen de comprendre pourquoi rien ne se passait.
                showError(
                    `« ${f.name} » n'a pas été chargé : format .${ext} non pris en charge. Formats acceptés : ${SRC_EXTS.map(x => '.' + x).join(', ')}. Un ZIP de ces fichiers fonctionne aussi.`
                );
                return null;
            }
            el('emptyStateSources').classList.add('hidden');
            const tId = 'tb_' + generateId();
            // On tranche l'encodage sur les octets AVANT de lire : le moteur attend de l'UTF-8, et
            // tâtonner après coup laissait passer des lectures fausses sans erreur.
            let sniff = null;
            if (ext === 'csv' || ext === 'txt') {
                try {
                    sniff = await sniffFileEncoding(f);
                } catch (e) {}
            }
            state.tables[tId] = {
                id: tId,
                name: f.name,
                file: f,
                type: ext,
                size: f.size,
                config: { delim: '', enc: (sniff && sniff.enc) || 'UTF-8' },
                encWhy: sniff ? sniff.why : '',
                headers: [],
                columnsMeta: {},
                status: 'loading',
                srcModified: f.lastModified || Date.now()
            };
            state.pivotMode[tId] = 'none';
            renderTables();
            try {
                const headers = await ingestFileTable(tId);
                const table = state.tables[tId];
                table.headers = headers;
                table.sampleData = await duckSampleRows(tId, 6);
                table.status = 'ready';
                renderTables();
                // Ce qui a été décidé à la place de l'utilisateur doit lui être dit.
                if (table.xlsxNote) showError(table.xlsxNote);
                else if (table.config && table.config.enc && table.config.enc !== 'UTF-8')
                    showSuccess(
                        `« ${escapeHTML(table.name)} » : encodage ${table.config.enc === 'ISO-8859-1' ? 'Windows/ANSI' : table.config.enc} détecté et appliqué${table.encWhy ? ' (' + table.encWhy + ')' : ''}.`
                    );
                autoDetectRelations(tId);
                updateBaseTableSelect();
                populateQualTables();
                await persistTableData(tId);
                persistAppState();
                return tId;
            } catch (err) {
                // Avant de marquer la source en échec : tente une réparation auto (encodage Windows/ANSI,
                // puis guillemets/lignes malformées). Un « faux problème de données » est très souvent
                // un simple souci d'encodage — on le corrige tout seul.
                let fixed = false;
                try {
                    fixed = await autoFixCsvRead(tId, err);
                } catch (e2) {}
                if (fixed) {
                    const table = state.tables[tId];
                    try {
                        table.sampleData = await duckSampleRows(tId, 6);
                    } catch (e3) {}
                    table.status = 'ready';
                    renderTables();
                    autoDetectRelations(tId);
                    updateBaseTableSelect();
                    populateQualTables();
                    try {
                        await persistTableData(tId);
                        persistAppState();
                    } catch (e3) {}
                    return tId;
                }
                state.tables[tId].status = 'error';
                state.tables[tId].errorMsg = err.message;
                renderTables();
                return null;
            }
        }
        // Détecte les caractères illisibles (mojibake) d'une source déjà chargée : signe d'un mauvais
        // encodage. Renvoie l'encodage à essayer, ou null. 100 % local, sur l'échantillon en mémoire.
        function encMojibakeInfo(t) {
            if (!t || t.status !== 'ready' || t._encHide) return null;
            const isCsv =
                t.type === 'csv' ||
                t.type === 'txt' ||
                (Array.isArray(t.files) && t.files.length && t.files.every(f => /\.(csv|txt)$/i.test(f.name)));
            if (!isCsv) return null;
            const enc = (t.config && t.config.enc) || 'UTF-8';
            let txt = (t.headers || []).join(' ');
            (t.sampleData || []).slice(0, 6).forEach(r => {
                if (r)
                    Object.values(r).forEach(v => {
                        if (v != null) txt += ' ' + v;
                    });
            });
            if (!txt.trim()) return null;
            // Fichier Windows/ANSI lu en UTF-8 → caractère de remplacement « � ».
            if (enc !== 'ISO-8859-1' && /\ufffd/.test(txt)) {
                const ex = (txt.match(/\S{0,10}\ufffd\S{0,8}/) || [''])[0].trim();
                return { suggest: 'ISO-8859-1', label: 'Windows / ANSI', ex };
            }
            // Fichier UTF-8 lu en Latin-1 → « Ã©, Ã¨, Ã§, Â°, â€™ »… (l'utilisateur a sur-corrigé).
            if (enc === 'ISO-8859-1' && /Ã[\u0080-\u00bf©¨§´®°ªº«»¯]|Â[\u0080-\u00bf°±·]|â€/.test(txt)) {
                const ex = (txt.match(/\S{0,4}Ã.\S{0,6}/) || txt.match(/\S{0,4}Â.\S{0,6}/) || [''])[0].trim();
                return { suggest: 'UTF-8', label: 'UTF-8', ex };
            }
            return null;
        }
        function fixSourceEncoding(tId, enc) {
            updateTableConfig(tId, 'enc', enc);
        }
        function dismissEncHint(tId) {
            if (state.tables[tId]) {
                state.tables[tId]._encHide = true;
                renderTables();
            }
        }
