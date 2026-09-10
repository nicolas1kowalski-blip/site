        // ======================= E11 (V2) : CONNECTEURS API / JSON / PARQUET / GOOGLE SHEETS =======================
        // Import par URL avec DIFFÉRENTIEL (ajouts / suppressions / modifications) avant mise à jour.
        // Confidentialité : l'URL et l'éventuelle clé d'API restent sur cette machine (IndexedDB local),
        // ne sont jamais incluses dans le bundle de partage, et la requête part directement du navigateur.
        const CN_KINDS = { json: '🌐 API / JSON', csv: '📄 CSV par URL', parquet: '🧊 Parquet par URL', gsheet: '📗 Google Sheets' };
        function cnList() { return state.connectors = state.connectors || []; }
        function cnById(id) { return cnList().find(x => x.id === id); }
        function cnAdd() { cnList().push({ id: 'cn_' + generateId(), name: 'Nouveau connecteur', kind: 'json', url: '', path: '', keyCol: '', mode: 'replace', out: '', hdrName: '', hdrVal: '' }); persistAppState(); renderSourceUpdatePanel(); }
        function cnSet(id, f, v) { const c = cnById(id); if (!c) return; c[f] = v; persistAppState(); if (f === 'kind') renderSourceUpdatePanel(); }
        function cnDel(id) { state.connectors = cnList().filter(x => x.id !== id); persistAppState(); renderSourceUpdatePanel(); }
        function cnSheetUrl(u) {
            const m = String(u).match(/docs\.google\.com\/spreadsheets\/d\/([\w-]+)/); if (!m) return u;
            const gid = (String(u).match(/[#&?]gid=(\d+)/) || [])[1] || '0';
            return `https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv&gid=${gid}`;
        }
        async function cnFetch(c) {
            const url = c.kind === 'gsheet' ? cnSheetUrl(c.url) : c.url;
            const headers = {};
            if (String(c.hdrName || '').trim() && String(c.hdrVal || '').trim()) headers[c.hdrName.trim()] = c.hdrVal;
            let resp;
            try { resp = await fetch(url, { headers }); }
            catch (e) { throw new Error('téléchargement impossible — hors ligne, URL invalide, ou le serveur refuse les requêtes navigateur (CORS).'); }
            if (!resp.ok) throw new Error('HTTP ' + resp.status + (resp.statusText ? ' ' + resp.statusText : '') + ' — vérifiez l\'URL et les droits d\'accès.');
            if (c.kind === 'parquet') return { buf: new Uint8Array(await resp.arrayBuffer()) };
            return { text: await resp.text() };
        }
        function cnJsonAtPath(text, path) {
            let v = JSON.parse(text);
            for (const seg of String(path).split('.').map(x => x.trim()).filter(Boolean)) {
                if (v == null || typeof v !== 'object') break; v = v[seg];
            }
            if (!Array.isArray(v)) throw new Error(`le chemin « ${path} » ne pointe pas vers un tableau JSON.`);
            return JSON.stringify(v);
        }
        async function cnRun(id, btn) {
            const c = cnById(id); if (!c) return;
            if (!String(c.url || '').trim()) return showError('Renseignez l\'URL du connecteur.');
            const outName = String(c.out || '').trim() || ('API_' + String(c.name || 'SOURCE').replace(/[^a-zA-Z0-9]/g, '_').toUpperCase());
            const clash = Object.values(state.tables).find(t => t.name === outName && t.id !== c.targetId);
            if (clash) return showError(`Le nom "${outName}" est déjà utilisé par une autre source.`);
            if (btn) btn.disabled = true;
            bgTaskStart(`Connecteur « ${c.name} » : téléchargement et analyse`);
            const nv = x => `NULLIF(UPPER(TRIM(CAST(${x} AS VARCHAR))), '')`;
            try {
                const { db, conn } = await getDB();
                const payload = await cnFetch(c);
                if (c.kind === 'json' && String(c.path || '').trim()) payload.text = cnJsonAtPath(payload.text, c.path);
                const fname = 'cn_' + c.id + (c.kind === 'parquet' ? '.parquet' : (c.kind === 'json' ? '.json' : '.csv'));
                if (payload.buf) await db.registerFileBuffer(fname, payload.buf); else await db.registerFileText(fname, payload.text);
                const reader = c.kind === 'json' ? `read_json_auto('${fname}')` : (c.kind === 'parquet' ? `read_parquet('${fname}')` : `read_csv_auto('${fname}', header=true, all_varchar=true)`);
                const stage = sqlIdent('cn_stage_' + c.id);
                await conn.query(`CREATE OR REPLACE TABLE ${stage} AS SELECT * FROM ${reader}`);
                const newHeaders = arrowResultToObjects(await conn.query(`SELECT * FROM ${stage} LIMIT 0`)) && (await conn.query(`SELECT * FROM ${stage} LIMIT 0`)).schema.fields.map(f => f.name);
                const old = c.targetId && state.tables[c.targetId] && state.tables[c.targetId].status === 'ready' ? state.tables[c.targetId] : null;
                const oldHeaders = old ? (old.headers || []).slice() : [];
                let diff = null;
                if (old) {
                    const T = sqlIdent(duckTableName(old.id));
                    const common = oldHeaders.filter(h => newHeaders.includes(h));
                    if (!common.length) throw new Error('aucune colonne commune avec la table existante — supprimez le connecteur ou changez le nom de la table produite.');
                    const hash = al => `md5(concat_ws(chr(1), ${common.map(h => `COALESCE(CAST(${al}${sqlIdent(h)} AS VARCHAR), '')`).join(', ')}))`;
                    const key = String(c.keyCol || '').trim() && common.includes(c.keyCol.trim()) ? c.keyCol.trim() : null;
                    if (key) {
                        const K = sqlIdent(key);
                        const q = await conn.query(`SELECT
                            (SELECT COUNT(*) FROM ${stage} s WHERE ${nv('s.' + K)} NOT IN (SELECT ${nv(K)} FROM ${T} WHERE ${nv(K)} IS NOT NULL))::BIGINT AS a,
                            (SELECT COUNT(*) FROM ${T} o WHERE ${nv('o.' + K)} NOT IN (SELECT ${nv(K)} FROM ${stage} WHERE ${nv(K)} IS NOT NULL))::BIGINT AS r,
                            (SELECT COUNT(*) FROM ${stage} s JOIN ${T} o ON ${nv('s.' + K)} = ${nv('o.' + K)} WHERE ${hash('s.')} <> ${hash('o.')})::BIGINT AS m`);
                        const o2 = arrowResultToObjects(q)[0];
                        diff = { added: Number(o2.a), removed: Number(o2.r), changed: Number(o2.m), key };
                    } else {
                        const q = await conn.query(`SELECT
                            (SELECT COUNT(*) FROM (SELECT ${hash('')} AS h FROM ${stage} EXCEPT ALL SELECT ${hash('')} AS h FROM ${T}) x)::BIGINT AS a,
                            (SELECT COUNT(*) FROM (SELECT ${hash('')} AS h FROM ${T} EXCEPT ALL SELECT ${hash('')} AS h FROM ${stage}) x)::BIGINT AS r`);
                        const o2 = arrowResultToObjects(q)[0];
                        diff = { added: Number(o2.a), removed: Number(o2.r), changed: null, key: null };
                    }
                }
                let t;
                if (old && (c.mode || 'replace') === 'append' && diff && diff.key) {
                    // Import incrémental : seules les NOUVELLES clés sont ajoutées, l'existant est conservé.
                    const T = sqlIdent(duckTableName(old.id)); const K = sqlIdent(diff.key);
                    const cols = oldHeaders.filter(h => newHeaders.includes(h));
                    await conn.query(`INSERT INTO ${T} (__rn, ${cols.map(sqlIdent).join(', ')})
                        SELECT (SELECT COALESCE(MAX(__rn), 0) FROM ${T}) + row_number() OVER (), ${cols.map(h => 's.' + sqlIdent(h)).join(', ')}
                        FROM ${stage} s WHERE ${nv('s.' + K)} NOT IN (SELECT ${nv(K)} FROM ${T} WHERE ${nv(K)} IS NOT NULL)`);
                    t = old;
                } else {
                    const tId = c.targetId && state.tables[c.targetId] ? c.targetId : ('tb_' + generateId());
                    if (!state.tables[tId]) { state.tables[tId] = { id: tId, name: outName, file: null, type: 'extraction', size: 0, config: {}, headers: [], columnsMeta: {}, status: 'loading' }; state.pivotMode[tId] = 'none'; }
                    t = state.tables[tId]; t.name = outName; t.status = 'loading';
                    await duckDropTable(tId);
                    await conn.query(`CREATE TABLE ${sqlIdent(duckTableName(tId))} AS SELECT row_number() OVER () AS __rn, * FROM ${stage}`);
                    c.targetId = tId;
                }
                await conn.query(`DROP TABLE IF EXISTS ${stage}`);
                t.headers = await duckTableHeaders(t.id); t.storage = 'table'; t.sampleData = await duckSampleRows(t.id, 6); t.status = 'ready';
                const cRes = await conn.query(`SELECT COUNT(*)::BIGINT AS n FROM ${sqlIdent(duckTableName(t.id))}`);
                c.lastRows = Number(arrowResultToObjects(cRes)[0].n); c.lastAt = Date.now(); c.lastDiff = diff;
                state.governance.lineage[t.name] = { from: [(CN_KINDS[c.kind] || c.kind) + ' — ' + String(c.url).slice(0, 100)] };
                // E9 : colonnes disparues -> alerte listant les objets aval impactés.
                try {
                    oldHeaders.filter(h => !t.headers.includes(h)).forEach(h => { const deps = modelImpact(t.name, h); if (deps.length) showError(`⚠️ La colonne « ${h} » a disparu de « ${t.name} » — ${deps.length} objet(s) dépendant(s) : ${deps.slice(0, 5).map(d2 => d2.type + ' ' + d2.name).join(' · ')}${deps.length > 5 ? '…' : ''}`); });
                } catch (e2) {}
                renderTables(); updateBaseTableSelect(); populateQualTables();
                try { await persistTableData(t.id); } catch (e2) {}
                persistAppState(); renderSourceUpdatePanel();
                bgTaskEnd(`🔌 « ${t.name} » : ${c.lastRows.toLocaleString('fr-FR')} ligne(s)${diff ? ` — différentiel : +${diff.added} ajoutée(s), −${diff.removed} disparue(s)${diff.changed != null ? ', ' + diff.changed + ' modifiée(s)' : ''}${(c.mode || 'replace') === 'append' && diff.key ? ' (mode ajout : seules les nouvelles clés ont été insérées)' : ''}` : ' (premier import)'}.`);
                try { await rcAutoRun(t.name); } catch (e2) {}
                try { await qrAutoRun(t.name); } catch (e2) {}
            } catch (e) { bgTaskEnd(); showError('Connecteur « ' + c.name + ' » : ' + e.message); }
            finally { if (btn) btn.disabled = false; }
        }
        function cnPanelHtml() {
            const rows = cnList().map(c => `<div class="bg-white border border-slate-200 rounded-lg p-2 mb-1.5">
                <div class="flex items-center gap-1.5 flex-wrap text-[11px]">
                    <input type="text" value="${escapeHTML(c.name)}" onchange="cnSet('${c.id}','name',this.value)" class="border border-slate-200 rounded px-1.5 py-1 font-bold w-36">
                    <select onchange="cnSet('${c.id}','kind',this.value)" class="border border-slate-200 rounded px-1 py-1 bg-white">${Object.entries(CN_KINDS).map(([k, l]) => `<option value="${k}" ${c.kind === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
                    <input type="text" value="${escapeHTML(c.url || '')}" onchange="cnSet('${c.id}','url',this.value)" placeholder="${c.kind === 'gsheet' ? 'URL de la feuille Google (partagée en lecture)' : 'https://…'}" class="border border-sky-200 rounded px-1.5 py-1 flex-grow min-w-[220px]">
                    <button onclick="cnRun('${c.id}', this)" class="bg-sky-600 text-white font-bold px-2.5 py-1 rounded">▶ Importer</button>
                    <button onclick="cnDel('${c.id}')" class="text-red-400 hover:text-red-600 font-bold">✕</button>
                </div>
                <div class="flex items-center gap-1.5 flex-wrap text-[10px] mt-1.5 text-slate-500">
                    table produite <input type="text" value="${escapeHTML(c.out || '')}" onchange="cnSet('${c.id}','out',this.value)" placeholder="auto" class="border border-slate-200 rounded px-1.5 py-0.5 w-32">
                    ${c.kind === 'json' ? `chemin JSON <input type="text" value="${escapeHTML(c.path || '')}" onchange="cnSet('${c.id}','path',this.value)" placeholder="ex: data.items" class="border border-slate-200 rounded px-1.5 py-0.5 w-28" title="Si l'API renvoie un objet, chemin (séparé par des points) vers le tableau de lignes.">` : ''}
                    clé d'identification <input type="text" value="${escapeHTML(c.keyCol || '')}" onchange="cnSet('${c.id}','keyCol',this.value)" placeholder="colonne" class="border border-slate-200 rounded px-1.5 py-0.5 w-28" title="Colonne identifiante utilisée pour le différentiel et le mode ajout.">
                    <select onchange="cnSet('${c.id}','mode',this.value)" class="border border-slate-200 rounded px-1 py-0.5 bg-white"><option value="replace" ${(c.mode || 'replace') === 'replace' ? 'selected' : ''}>remplacer (avec différentiel)</option><option value="append" ${c.mode === 'append' ? 'selected' : ''}>ajouter les nouvelles clés uniquement</option></select>
                    en-tête d'authentification <input type="text" value="${escapeHTML(c.hdrName || '')}" onchange="cnSet('${c.id}','hdrName',this.value)" placeholder="ex: Authorization" class="border border-slate-200 rounded px-1.5 py-0.5 w-28">
                    <input type="password" value="${escapeHTML(c.hdrVal || '')}" onchange="cnSet('${c.id}','hdrVal',this.value)" placeholder="valeur (reste locale)" class="border border-slate-200 rounded px-1.5 py-0.5 w-32">
                </div>
                ${c.lastAt ? `<div class="text-[10px] text-slate-400 mt-1">Dernier import : ${new Date(c.lastAt).toLocaleString('fr-FR')} — ${Number(c.lastRows || 0).toLocaleString('fr-FR')} ligne(s)${c.lastDiff ? ` · différentiel : <span class="font-bold text-emerald-600">+${c.lastDiff.added}</span> / <span class="font-bold text-red-500">−${c.lastDiff.removed}</span>${c.lastDiff.changed != null ? ` / <span class="font-bold text-amber-600">✎ ${c.lastDiff.changed}</span>` : ''}${c.lastDiff.key ? ' (clé ' + escapeHTML(c.lastDiff.key) + ')' : ''}` : ''}</div>` : ''}
            </div>`).join('');
            return `<div class="border border-sky-200 rounded-lg p-3 bg-sky-50/30">
                <div class="text-xs font-bold text-sky-700 mb-1">🔌 Connecteurs (API / JSON / CSV / Parquet / Google Sheets)</div>
                <p class="text-[11px] text-slate-500 mb-2">Chargez une source depuis une URL. L'URL et l'éventuelle clé restent <strong>sur cette machine</strong> (jamais dans le bundle de partage). À chaque ré-import, Studio Data calcule le <strong>différentiel</strong> (ajouts / disparitions / modifications) avant de mettre à jour — ou n'insère que les nouvelles clés en mode ajout. Le serveur distant doit autoriser les requêtes navigateur (CORS).</p>
                ${rows}
                <button onclick="cnAdd()" class="text-[11px] bg-sky-600 text-white px-2.5 py-1 rounded font-bold">+ Connecteur</button>
            </div>`;
        }

