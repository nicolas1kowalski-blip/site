        // ======================= V12 : EXTRAIRE — FILTRER SUR UNE LISTE FOURNIE (FICHIER) =======================
        // « Donne-moi telles données pour cette liste » : on dépose un fichier (Excel, CSV, texte) ou on colle
        // une liste, on indique à quelle(s) colonne(s) des tables elle correspond, et l'extraction ne garde
        // (ou exclut) que les lignes présentes dans la liste. La liste vit en mémoire pour cette extraction :
        // elle n'est pas une source, n'apparaît ni dans Sources ni dans le modèle. Le moteur d'extraction
        // (80-extraction-avancee.js) n'est pas modifié : on se greffe sur advPlanJoins (besoins de jointure),
        // advCondSql (condition SQL du filtre « list ») et buildAdvSql (ordre du fichier + colonnes jointes).
        //
        // Forme d'un filtre liste dans state.advExtract.filters :
        //   { id, op:'list', tableId, col, via:'', val:'', list: { name, cols:[...], rows:[[...]], keys:[{lc, tableId, col, via}], mode:'in'|'out', match:'ci'|'exact'|'norm', attach:false } }
        ADV_OPS.list = 'dans le fichier';
        const V12_LIST_MATCH = { ci: 'majuscules / minuscules et espaces ignorés', exact: 'valeur exacte', norm: 'normalisé : accents, ponctuation, espaces et zéros de tête ignorés' };
        function v12ListFilters(spec) { return ((spec || state.advExtract).filters || []).filter(f => f && f.op === 'list' && f.list); }
        function v12ListTable(f) { return sqlIdent('liste_' + String(f.list.name || 'entree').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 28).toLowerCase() + '_' + String(f.id).slice(-4)); }
        function v12ListNorm(x, match) {
            const raw = `CAST(${x} AS VARCHAR)`;
            if (match === 'exact') return `TRIM(${raw})`;
            if (match === 'norm') return `regexp_replace(regexp_replace(strip_accents(UPPER(${raw})), '[^A-Z0-9]', '', 'g'), '^0+(?=.)', '')`;
            return `UPPER(TRIM(${raw}))`;
        }
        // ---- greffes sur le moteur ----
        Studio.extend('advPlanJoins', (_v12lPlan) => function (baseId, needs) {
            needs = Array.isArray(needs) ? needs.slice() : [];
            v12ListFilters().forEach(f => f.list.keys.forEach(k => needs.push({ tableId: k.tableId, via: k.via || '' })));
            const r = _v12lPlan(baseId, needs); v12State.listMap = r && r.map; return r;
        });
        Studio.extend('advCondSql', (_v12lCond) => function (alias, c) {
            if (c && c.op === 'list' && c.list) {
                const map = v12State.listMap || {}; const L = v12ListTable(c);
                const on = c.list.keys.map(k => `${v12ListNorm((map[advRouteKey(k.tableId, k.via || '')] ? advAlias(map, k) : alias) + '.' + sqlIdent(k.col), c.list.match)} = ${v12ListNorm('l.' + sqlIdent(k.lc), c.list.match)}`).join(' AND ');
                return `${c.list.mode === 'out' ? 'NOT ' : ''}EXISTS (SELECT 1 FROM ${L} l WHERE ${on})`;
            }
            return _v12lCond(alias, c);
        });
        Studio.extend('buildAdvSql', (_v12lBuild) => function (spec) {
            const r = _v12lBuild(spec); if (!r || r.err || !r.sql) return r;
            const lf = v12ListFilters(spec).filter(f => f.list.attach && f.list.mode !== 'out'); if (!lf.length) return r;
            let sql = r.sql; const outCols = (r.outCols || []).slice();
            for (const f of lf) {
                const L = v12ListTable(f); const keys = f.list.keys;
                const aliases = keys.map(k => { const c = (spec.columns || []).find(x => !x.kind && x.tableId === k.tableId && x.col === k.col && (x.via || '') === (k.via || '')); return c ? (c.alias || c.col) : null; });
                if (aliases.some(a => !a)) return { err: `Liste « ${f.list.name} » : pour conserver l'ordre du fichier et joindre ses colonnes, les colonnes clés (${keys.map(k => ((state.tables[k.tableId] || {}).name || '?') + '.' + k.col).join(', ')}) doivent figurer dans les colonnes en sortie.` };
                const extra = f.list.cols.filter(cn => !keys.some(k => k.lc === cn));
                const used = new Set(outCols.map(o => o.alias));
                const extraSel = extra.map(cn => { let al = cn; while (used.has(al)) al = 'liste_' + al; used.add(al); outCols.push({ alias: al }); return `l.${sqlIdent(cn)} AS ${sqlIdent(al)}`; });
                const on = keys.map((k, i) => `${v12ListNorm('q.' + sqlIdent(aliases[i]), f.list.match)} = ${v12ListNorm('l.' + sqlIdent(k.lc), f.list.match)}`).join(' AND ');
                const dedupL = `(SELECT * FROM ${L} QUALIFY ROW_NUMBER() OVER (PARTITION BY ${keys.map(k => v12ListNorm(sqlIdent(k.lc), f.list.match)).join(', ')} ORDER BY __ln) = 1)`;
                sql = `SELECT q.*${extraSel.length ? ', ' + extraSel.join(', ') : ''}\nFROM (\n${sql}\n) q\nLEFT JOIN ${dedupL} l ON ${on}\nORDER BY l.__ln`;
            }
            return { sql, outCols };
        });
        // ---- la liste est chargée dans le moteur juste avant les actions qui interrogent ----
        async function v12ListEnsure() {
            const lf = v12ListFilters(); if (!lf.length) return true;
            v12State.listReady = v12State.listReady || {};
            try {
                const { db, conn } = await getDB();
                for (const f of lf) {
                    const sig = f.id + ':' + f.list.rows.length + ':' + f.list.cols.join('|'); if (v12State.listReady[f.id] === sig) continue;
                    const vn = 'liste_' + f.id + '.ndjson'; try { if (db.dropFile) await db.dropFile(vn); } catch (e) {}
                    const nd = f.list.rows.map(rw => { const o = {}; f.list.cols.forEach((c, i) => { const v = rw[i]; o[c] = (v === undefined || v === null) ? null : String(v); }); return JSON.stringify(o); }).join('\n');
                    await db.registerFileText(vn, nd);
                    const colSpec = '{' + f.list.cols.map(h => `${sqlLiteral(h)}: 'VARCHAR'`).join(', ') + '}';
                    await conn.query(`CREATE OR REPLACE TABLE ${v12ListTable(f)} AS SELECT row_number() OVER () AS __ln, * FROM read_json(${sqlLiteral(vn)}, columns=${colSpec}, format='newline_delimited')`);
                    v12State.listReady[f.id] = sig;
                }
                return true;
            } catch (e) { showError('Liste d\'entrée : chargement impossible dans le moteur — ' + e.message); return false; }
        }
        ['advCount', 'advPreview', 'advQuality', 'advGenerate'].forEach(nm => Studio.extend(nm, (o) => async function () { if (!(await v12ListEnsure())) return; return o.apply(this, arguments); }, { motif: 'charger les listes d\'entrée dans le moteur avant la requête' }));
        Studio.extend('advRemoveFilter', (_v12lRemove) => function (id) { const f = (state.advExtract.filters || []).find(x => x.id === id); if (f && f.op === 'list') { (async () => { try { const { conn } = await getDB(); await conn.query(`DROP TABLE IF EXISTS ${v12ListTable(f)}`); } catch (e) {} })(); if (v12State.listReady) delete v12State.listReady[id]; } return _v12lRemove(id); });
        // ---- lecture du fichier / du texte collé ----
        function v12ListParseText(txt) {
            txt = String(txt || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n'); const lines = txt.split('\n').filter(l => l.trim() !== ''); if (!lines.length) return [];
            const probe = lines.slice(0, 20); const cands = [';', '\t', ',', '|'];
            const score = d => probe.map(l => l.split(d).length - 1); const best = cands.map(d => { const s = score(d); const min = Math.min(...s), max = Math.max(...s); return { d, min, max }; }).filter(x => x.min > 0).sort((a, b) => (b.min - a.min) || (a.max - a.min) - (b.max - b.min))[0];
            const d = best ? best.d : null;
            return lines.map(l => {
                if (!d) return [l.trim()];
                const out = []; let cur = '', q = false;
                for (let i = 0; i < l.length; i++) { const ch = l[i]; if (q) { if (ch === '"') { if (l[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; } else if (ch === '"') q = true; else if (ch === d) { out.push(cur); cur = ''; } else cur += ch; }
                out.push(cur); return out.map(x => x.trim());
            });
        }
        async function v12ListParseFile(file) {
            const name = file.name || 'liste'; const ext = name.split('.').pop().toLowerCase();
            if (ext === 'xlsx' || ext === 'xls' || ext === 'xlsm') {
                if (typeof XLSX === 'undefined') throw new Error('Lecture Excel indisponible (bibliothèque non chargée) : enregistrez le fichier en CSV.');
                const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array' });
                const sh = wb.Sheets[wb.SheetNames[0]]; const aoa = XLSX.utils.sheet_to_json(sh, { header: 1, raw: false, defval: '' });
                return aoa.filter(r => r.some(v => String(v).trim() !== '')).map(r => r.map(v => String(v).trim()));
            }
            return v12ListParseText(await file.text());
        }
        function v12ListShape(aoa, hasHeader) {
            const w = Math.max(...aoa.map(r => r.length), 1);
            let cols, rows;
            if (hasHeader && aoa.length) { cols = aoa[0].map((h, i) => (String(h).trim() || ('colonne ' + (i + 1)))); rows = aoa.slice(1); } else { cols = Array.from({ length: w }, (_, i) => 'colonne ' + (i + 1)); rows = aoa; }
            const seen = {}; cols = cols.map(c => { let n = c; while (seen[n]) n = c + '_' + (++seen[c] + 1); seen[n] = 1; seen[c] = seen[c] || 1; return n; });
            rows = rows.map(r => cols.map((_, i) => (r[i] === undefined ? '' : String(r[i])))).filter(r => r.some(v => v !== ''));
            return { cols, rows };
        }
        function v12ListKey(s) { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
        // ---- fenêtre « Filtrer sur un fichier » ----
        function v12ListTargets() {
            const s = state.advExtract; const base = state.tables[s.baseId]; if (!base) return [];
            const reach = (typeof getReachableTables === 'function' ? getReachableTables(s.baseId) : []).map(id => state.tables[id]).filter(t => t && t.status === 'ready' && t.id !== base.id);
            return [base, ...reach];
        }
        function v12ListOpen(editId) {
            const s = state.advExtract; if (!s.baseId || !state.tables[s.baseId]) return showError('Choisissez d\'abord une table de départ.');
            const f = editId ? (s.filters || []).find(x => x.id === editId) : null;
            v12State.listDraft = f ? JSON.parse(JSON.stringify(f.list)) : null; v12State.listEdit = editId || null;
            v11ModalOpen(`
                <div class="flex items-start justify-between gap-3"><div><h3>📄 Filtrer sur un fichier</h3><p class="text-xs" style="color:var(--v7-muted);margin:4px 0 0">Vous avez une liste (clients, contrats, références…) : déposez-la, dites à quelles colonnes elle correspond, l'extraction ne garde que ces lignes. La liste n'est pas ajoutée aux sources.</p></div><button class="v11-btn sm" onclick="v11ModalClose()">✕</button></div>
                <div class="v12l-in">
                    <label class="v12l-drop" id="v12lDrop"><input type="file" id="v12lFile" accept=".csv,.txt,.tsv,.xlsx,.xls,.xlsm" style="display:none" onchange="v12ListFileChosen(this.files[0])"><b>Déposer un fichier ici</b><span>Excel, CSV ou texte — ou cliquer pour choisir</span></label>
                    <div class="v12l-or">ou</div>
                    <div><textarea id="v12lPaste" rows="4" placeholder="Collez la liste : une valeur par ligne, ou un tableau copié depuis Excel" oninput="v12ListPasteChanged()"></textarea><label class="v12l-opt"><input type="checkbox" id="v12lHeader" checked onchange="v12ListReshape()"> la première ligne contient les en-têtes</label></div>
                </div>
                <div id="v12lBody"></div>`);
            const dz = el('v12lDrop'); if (dz) { dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('over'); }); dz.addEventListener('dragleave', () => dz.classList.remove('over')); dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('over'); const fl = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (fl) v12ListFileChosen(fl); }); }
            if (f) v12ListRenderBody();
        }
        async function v12ListFileChosen(file) {
            if (!file) return;
            try { const aoa = await v12ListParseFile(file); if (!aoa.length) return showError('Le fichier est vide.'); v12State.listRaw = aoa; v12State.listName = file.name.replace(/\.[^.]+$/, ''); v12ListReshape(); }
            catch (e) { showError('Lecture impossible : ' + e.message); }
        }
        function v12ListPasteChanged() { const t = el('v12lPaste'); if (!t || !t.value.trim()) return; v12State.listRaw = v12ListParseText(t.value); v12State.listName = 'Liste collée'; const aoa = v12State.listRaw; const hh = el('v12lHeader'); if (hh && aoa.length && aoa[0].length === 1 && aoa.length > 1 && /^\d+$/.test(aoa[0][0])) hh.checked = false; v12ListReshape(); }
        function v12ListReshape() {
            const aoa = v12State.listRaw; if (!aoa) return;
            const hh = el('v12lHeader'); const { cols, rows } = v12ListShape(aoa, !hh || hh.checked);
            const prev = v12State.listDraft || {};
            const targets = v12ListTargets();
            const keys = cols.map(c => {
                const old = (prev.keys || []).find(k => k.lc === c); if (old) return old;
                const nk = v12ListKey(c); if (!nk) return null;
                for (const t of targets) { const h = (t.headers || []).find(x => v12ListKey(x) === nk); if (h) return { lc: c, tableId: t.id, col: h, via: '' }; }
                return null;
            }).filter(Boolean);
            v12State.listDraft = { name: prev.name || v12State.listName || 'Liste', cols, rows, keys, mode: prev.mode || 'in', match: prev.match || 'ci', attach: !!prev.attach };
            v12ListRenderBody();
        }
        function v12ListSetKey(lc, v) {
            const d = v12State.listDraft; if (!d) return; d.keys = d.keys.filter(k => k.lc !== lc);
            if (v) { const [tableId, col] = v.split('|'); d.keys.push({ lc, tableId, col, via: '' }); }
            v12ListRenderBody();
        }
        function v12ListSetOpt(k, v) { const d = v12State.listDraft; if (d) { d[k] = v; v12ListRenderBody(); } }
        function v12ListRenderBody() {
            const box = el('v12lBody'); const d = v12State.listDraft; if (!box || !d) return;
            const targets = v12ListTargets();
            const opt = (lc) => { const cur = d.keys.find(k => k.lc === lc); return `<select class="v12l-sel" onchange="v12ListSetKey(${JSON.stringify(lc).replace(/"/g, '&quot;')}, this.value)"><option value="">— ignorer (colonne conservée si jointe) —</option>${targets.map(t => `<optgroup label="${escapeHTML(t.name)}">${(t.headers || []).map(h => `<option value="${escapeHTML(t.id + '|' + h)}" ${cur && cur.tableId === t.id && cur.col === h ? 'selected' : ''}>${escapeHTML(t.name)}.${escapeHTML(h)}</option>`).join('')}</optgroup>`).join('')}</select>`; };
            const prev = d.rows.slice(0, 5);
            const nk = d.keys.length; const hint = nk ? `<span class="ok">${nk} colonne(s) clé — les lignes doivent correspondre sur ${nk > 1 ? 'toutes' : 'cette colonne'}</span>` : `<span class="warn">Choisissez au moins une colonne de correspondance</span>`;
            box.innerHTML = `
                <div class="v12l-meta"><b>${escapeHTML(d.name)}</b> · ${d.rows.length.toLocaleString('fr-FR')} ligne(s) · ${d.cols.length} colonne(s) &nbsp; <input type="text" class="v12l-name" value="${escapeHTML(d.name)}" onchange="v12State.listDraft.name=this.value.trim()||'Liste'" title="Nom affiché dans le filtre"></div>
                <div class="v12l-map"><div class="v12l-maph">Colonne du fichier</div><div class="v12l-maph">Correspond à</div><div class="v12l-maph">Aperçu</div>
                ${d.cols.map((c, i) => `<div class="v12l-lc">${escapeHTML(c)}</div><div>${opt(c)}</div><div class="v12l-prev">${prev.map(r => escapeHTML(r[i])).filter(Boolean).slice(0, 3).join(' · ') || '<i>vide</i>'}</div>`).join('')}</div>
                <div class="v12l-hint">${hint}</div>
                <div class="v12l-opts">
                    <div><div class="v12l-lbl">Correspondance</div>${Object.entries(V12_LIST_MATCH).map(([k, l]) => `<label class="v12l-opt"><input type="radio" name="v12lMatch" ${d.match === k ? 'checked' : ''} onchange="v12ListSetOpt('match','${k}')"> ${l}</label>`).join('')}</div>
                    <div><div class="v12l-lbl">Résultat</div><label class="v12l-opt"><input type="radio" name="v12lMode" ${d.mode !== 'out' ? 'checked' : ''} onchange="v12ListSetOpt('mode','in')"> garder les lignes présentes dans le fichier</label><label class="v12l-opt"><input type="radio" name="v12lMode" ${d.mode === 'out' ? 'checked' : ''} onchange="v12ListSetOpt('mode','out')"> exclure les lignes présentes dans le fichier</label>
                    <label class="v12l-opt" ${d.mode === 'out' ? 'style="opacity:.45"' : ''}><input type="checkbox" ${d.attach ? 'checked' : ''} ${d.mode === 'out' ? 'disabled' : ''} onchange="v12ListSetOpt('attach',this.checked)"> conserver l'ordre du fichier et ajouter ses autres colonnes au résultat</label></div>
                </div>
                <div class="v12l-foot"><button class="v11-btn" onclick="v11ModalClose()">Annuler</button><button class="v11-btn pri" ${nk ? '' : 'disabled'} onclick="v12ListConfirm()">${v12State.listEdit ? 'Mettre à jour le filtre' : 'Filtrer sur cette liste'}</button></div>`;
        }
        function v12ListConfirm() {
            const d = v12State.listDraft; if (!d || !d.keys.length) return;
            const s = state.advExtract; const k0 = d.keys[0];
            const list = { name: d.name, cols: d.cols, rows: d.rows, keys: d.keys, mode: d.mode, match: d.match, attach: !!d.attach };
            let f = v12State.listEdit ? (s.filters || []).find(x => x.id === v12State.listEdit) : null;
            if (f) { f.list = list; f.tableId = k0.tableId; f.col = k0.col; if (v12State.listReady) delete v12State.listReady[f.id]; }
            else { f = { id: 'af_' + generateId(), tableId: k0.tableId, col: k0.col, op: 'list', val: '', via: '', list }; s.filters.push(f); }
            if (list.attach && list.mode !== 'out') {
                d.keys.forEach(k => { if (!s.columns.some(c => !c.kind && c.tableId === k.tableId && c.col === k.col)) { let alias = k.col; while (s.columns.some(c => c.alias === alias)) alias += '_2'; s.columns.push({ id: 'ac_' + generateId(), tableId: k.tableId, col: k.col, via: '', alias, transform: 'none' }); } });
            }
            v11ModalClose(); renderAdvExtract();
            showSuccess(`📄 Filtre sur « ${list.name} » : ${list.rows.length.toLocaleString('fr-FR')} ligne(s), ${list.keys.length} colonne(s) de correspondance.`);
        }
        // ---- « Vérifier » : quelles valeurs du fichier n'existent pas dans la table ----
        async function v12ListCheck(id) {
            const f = (state.advExtract.filters || []).find(x => x.id === id && x.op === 'list'); if (!f) return;
            const out = el('v12x') && el('v12x').querySelector('.v12x-out'); if (!out) return;
            let box = el('v12ListReport'); if (!box) { box = document.createElement('div'); box.id = 'v12ListReport'; box.className = 'v12l-report'; out.insertBefore(box, out.firstChild); }
            box.innerHTML = '<p class="text-xs" style="color:var(--v7-muted)">Vérification de la liste…</p>';
            if (!(await v12ListEnsure())) { box.innerHTML = ''; return; }
            try {
                const { conn } = await getDB(); const L = v12ListTable(f);
                const byT = {}; f.list.keys.forEach(k => { (byT[k.tableId] = byT[k.tableId] || []).push(k); });
                const parts = [];
                for (const [tid, ks] of Object.entries(byT)) {
                    const T = sqlIdent(duckTableName(tid)); const on = ks.map(k => `${v12ListNorm('t.' + sqlIdent(k.col), f.list.match)} = ${v12ListNorm('l.' + sqlIdent(k.lc), f.list.match)}`).join(' AND ');
                    const res = await conn.query(`SELECT COUNT(*)::BIGINT AS n, COUNT(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM ${T} t WHERE ${on}))::BIGINT AS miss FROM ${L} l`);
                    const r = arrowResultToObjects(res)[0]; const n = Number(r.n), miss = Number(r.miss);
                    const ex = miss ? arrowResultToObjects(await conn.query(`SELECT ${ks.map(k => 'l.' + sqlIdent(k.lc)).join(', ')} FROM ${L} l WHERE NOT EXISTS (SELECT 1 FROM ${T} t WHERE ${on}) ORDER BY l.__ln LIMIT 50`)) : [];
                    parts.push({ table: (state.tables[tid] || {}).name || '?', n, miss, ks, ex });
                }
                box.innerHTML = parts.map(p => `<div class="v12l-rep"><b>📄 ${escapeHTML(f.list.name)}</b> ↔ <b>${escapeHTML(p.table)}</b> (${p.ks.map(k => escapeHTML(k.col) + ' ← ' + escapeHTML(k.lc)).join(', ')}) : ${p.n.toLocaleString('fr-FR')} ligne(s) dans le fichier, <span class="${p.miss ? 'warn' : 'ok'}">${p.miss ? p.miss.toLocaleString('fr-FR') + ' sans correspondance' : 'toutes trouvées'}</span>${p.miss ? `<div class="v12l-miss">${p.ex.map(r => escapeHTML(p.ks.map(k => r[k.lc]).join(' / '))).join(' · ')}${p.miss > 50 ? ' …' : ''}</div>` : ''}</div>`).join('') + `<button class="v11-btn sm" onclick="el('v12ListReport').remove()">Fermer</button>`;
            } catch (e) { box.innerHTML = `<p class="text-xs text-red-600">Vérification impossible : ${escapeHTML(e.message)}</p>`; }
        }
        // ---- affichage dans le plan de travail : bouton dans l'en-tête Filtres, pastilles détaillées ----
        function v12ListChipHtml(f) {
            const l = f.list; const keys = l.keys.map(k => `<b>${escapeHTML((state.tables[k.tableId] || {}).name || '?')}.${escapeHTML(k.col)}</b> ← ${escapeHTML(k.lc)}`).join(', ');
            return `<span class="v12l-ic">📄</span><span class="v12l-title">${escapeHTML(l.name)}</span><span class="v12l-n">${l.rows.length.toLocaleString('fr-FR')} ligne(s)</span><span class="v12l-keys">${l.mode === 'out' ? '<em>exclure</em> ' : ''}${keys}${l.attach ? ' · <em>ordre du fichier + colonnes jointes</em>' : ''}</span><span class="v12l-acts" data-ro="keep"><button onclick="v12ListOpen('${f.id}')" title="Modifier la liste ou les correspondances">Modifier</button><button onclick="v12ListCheck('${f.id}')" title="Quelles valeurs du fichier ne sont pas dans la table ?">Vérifier</button><button onclick="advRemoveFilter('${f.id}')" title="Retirer ce filtre">✕</button></span>`;
        }
        function v12ListAfterLayout() {
            const root = el('v12x'); if (!root) return;
            const h = root.querySelector('.v12x-sec[data-sec="filt"] .v12x-h');
            if (h && !h.querySelector('.v12l-btn')) { const sp = document.createElement('span'); sp.className = 'sp'; h.appendChild(sp); const b = document.createElement('button'); b.className = 'v11-btn sm v12l-btn'; b.innerHTML = '📄 Filtrer sur un fichier'; b.title = 'Ne garder que les lignes d\'une liste fournie (Excel, CSV, texte collé)'; b.onclick = () => v12ListOpen(); h.appendChild(b); }
            v12ListFilters().forEach(f => {
                const btn = root.querySelector(`button[onclick="advRemoveFilter('${f.id}')"]`); const chip = btn && btn.closest('span');
                if (chip && !chip.classList.contains('v12l-chip')) { chip.className = 'v12l-chip'; chip.innerHTML = v12ListChipHtml(f); }
            });
            const body = root.querySelector('.v12x-sec[data-sec="filt"] .v12x-body');
            if (body && !(state.advExtract.filters || []).length && !body.querySelector('.v12l-tip')) { const t = document.createElement('div'); t.className = 'v12l-tip'; t.innerHTML = 'Vous avez déjà la liste des éléments à extraire (fichier Excel, CSV…) ? <a onclick="v12ListOpen()">Filtrer sur un fichier</a> évite de saisir les valeurs une à une.'; body.insertBefore(t, body.firstChild); }
            // synthèse
            const sum = root.querySelector('.v12x-sum');
            if (sum && !sum.querySelector('.v12l-sumchip')) v12ListFilters().forEach(f => { const c = document.createElement('span'); c.className = 'v12x-chip v12l-sumchip'; c.innerHTML = `📄 ${escapeHTML(f.list.name)} <b>${f.list.rows.length.toLocaleString('fr-FR')}</b>`; c.title = 'Filtre sur une liste fournie'; sum.appendChild(c); });
        }
        Studio.extend('v12ExtractLayout', (_v12lLayout) => function () { const r = _v12lLayout.apply(this, arguments); try { v12ListAfterLayout(); } catch (e) { console.warn('v12 liste', e); } return r; });
        Object.assign(V11_LEXIQUE, { 'liste d\'entrée': 'Fichier ou texte collé (identifiants, références…) fourni à l\'extraction pour ne garder que ces lignes, sans le charger comme source.' });
