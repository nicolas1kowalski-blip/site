        // ======================= Tables conçues (couche de consolidation) =======================
        // Une table conçue est une RECETTE : sources contributrices + mapping de colonnes (avec
        // renommage métier) + colonnes calculées + clé primaire. Elle est matérialisée dans DuckDB
        // avec une colonne SOURCE_ORIGINE (traçabilité) et s'utilise partout comme une table normale.
        // Avec une clé : les doublons de clé STRICTEMENT identiques sont dédoublonnés (on garde une
        // ligne) ; ceux qui divergent sont CONSERVÉS et mis en évidence dans le rapport d'écarts.
        let tdState = { editing: null, graph: false };

        function tdNewDesign() {
            tdState.editing = { name: '', sources: [], attrs: [], calcs: [], key: [], targetId: null };
            if (currentTab !== 10) switchTab(10);
            else renderTablesDesign();
        }
        function tdEdit(tId) {
            const table = state.tables[tId];
            if (!table || !table.design) return;
            tdState.editing = JSON.parse(JSON.stringify(table.design));
            tdState.editing.targetId = tId;
            tdState.editing.name = table.name;
            renderTablesDesign();
        }
        function tdCancel() {
            tdState.editing = null;
            renderTablesDesign();
        }

        function tdAddSource(name) {
            const design = tdState.editing;
            if (!design || !name) return;
            const table = tableByName(name);
            if (!table || table.status !== 'ready') return;
            const s = { src: name, map: {} };
            if (!design.attrs.length) {
                // Première source : elle définit les attributs (mapping identité, renommables ensuite).
                table.headers.forEach(h => {
                    design.attrs.push(h);
                    s.map[h] = h;
                });
            } else {
                // Sources suivantes : rapprochement automatique par nom normalisé.
                design.attrs.forEach(a => {
                    const header = table.headers.find(h => normColName(h) === normColName(a));
                    if (header) s.map[a] = header;
                });
            }
            design.sources.push(s);
            renderTablesDesign();
        }
        function tdRemoveSource(si) {
            const design = tdState.editing;
            if (!design) return;
            design.sources.splice(si, 1);
            renderTablesDesign();
        }
        function tdAddAttr() {
            const design = tdState.editing;
            if (!design) return;
            let n = design.attrs.length + 1;
            while (design.attrs.includes('Attribut_' + n)) n++;
            design.attrs.push('Attribut_' + n);
            renderTablesDesign();
        }
        function tdRemoveAttr(i) {
            const design = tdState.editing;
            if (!design) return;
            const a = design.attrs.splice(i, 1)[0];
            design.key = design.key.filter(k => k !== a);
            design.sources.forEach(s => delete s.map[a]);
            if (design.formats) delete design.formats[a];
            design.fks = (design.fks || []).filter(f => f.attr !== a);
            renderTablesDesign();
        }
        function tdRenameAttr(i, v) {
            const design = tdState.editing;
            if (!design) return;
            v = String(v || '').trim();
            const old = design.attrs[i];
            if (!v || (v !== old && design.attrs.includes(v))) {
                showError(v ? `L'attribut "${v}" existe déjà.` : "Nom d'attribut vide.");
                renderTablesDesign();
                return;
            }
            design.attrs[i] = v;
            design.sources.forEach(s => {
                if (old in s.map) {
                    s.map[v] = s.map[old];
                    delete s.map[old];
                }
            });
            design.key = design.key.map(k => (k === old ? v : k));
            design.calcs.forEach(cx => {
                cx.formula = String(cx.formula || '')
                    .split('[' + old + ']')
                    .join('[' + v + ']');
            });
            if (design.formats && old in design.formats) {
                design.formats[v] = design.formats[old];
                delete design.formats[old];
            }
            (design.fks || []).forEach(f => {
                if (f.attr === old) f.attr = v;
            });
            (design.joins || []).forEach(j => {
                if (j.attr === old) j.attr = v;
            });
            renderTablesDesign();
        }
        function tdSetMap(si, i, v) {
            const design = tdState.editing;
            if (!design) return;
            const attribute = design.attrs[i];
            if (v) design.sources[si].map[attribute] = v;
            else delete design.sources[si].map[attribute];
            renderTablesDesign();
        }
        function tdToggleKey(i) {
            const design = tdState.editing;
            if (!design) return;
            const attribute = design.attrs[i];
            design.key = design.key.includes(attribute) ? design.key.filter(k => k !== attribute) : [...design.key, attribute];
            renderTablesDesign();
        }
        function tdAddCalc() {
            const design = tdState.editing;
            if (!design) return;
            let n = design.calcs.length + 1;
            while (design.calcs.some(c => c.name === 'Calcul_' + n)) n++;
            design.calcs.push({ name: 'Calcul_' + n, formula: '' });
            renderTablesDesign();
        }
        function tdRemoveCalc(i) {
            const design = tdState.editing;
            if (!design) return;
            design.calcs.splice(i, 1);
            renderTablesDesign();
        }
        function tdSetCalc(i, field, v) {
            const design = tdState.editing;
            if (!design || !design.calcs[i]) return;
            design.calcs[i][field] = field === 'name' ? String(v).trim() : v;
        }
        function tdSetName(v) {
            const design = tdState.editing;
            if (design) design.name = v;
        }
        function tdAddFilter(si) {
            const design = tdState.editing;
            if (!design || !design.sources[si]) return;
            design.sources[si].filters = design.sources[si].filters || [];
            design.sources[si].filters.push({ col: '', op: 'eq', val: '' });
            renderTablesDesign();
        }
        function tdSetFilter(si, fi, field, v) {
            const design = tdState.editing;
            const source = design && design.sources[si];
            if (!source || !source.filters || !source.filters[fi]) return;
            source.filters[fi][field] = v;
            if (field === 'op') renderTablesDesign();
        }
        function tdRemoveFilter(si, fi) {
            const design = tdState.editing;
            const source = design && design.sources[si];
            if (!source || !source.filters) return;
            source.filters.splice(fi, 1);
            renderTablesDesign();
        }
        function tdSetFormat(i, v) {
            const design = tdState.editing;
            if (!design) return;
            const attribute = design.attrs[i];
            design.formats = design.formats || {};
            if (v) design.formats[attribute] = v;
            else delete design.formats[attribute];
            renderTablesDesign();
        }
        // Déplace un attribut vers le haut/bas : l'ordre des attributs EST l'ordre des colonnes de la table.
        function tdMoveAttr(i, dir) {
            const design = tdState.editing;
            if (!design) return;
            const j = i + dir;
            if (j < 0 || j >= design.attrs.length) return;
            [design.attrs[i], design.attrs[j]] = [design.attrs[j], design.attrs[i]];
            renderTablesDesign();
        }
        function tdMoveAttrEdge(i, edge) {
            const design = tdState.editing;
            if (!design || i < 0 || i >= design.attrs.length) return;
            const [m] = design.attrs.splice(i, 1);
            edge === 'top' ? design.attrs.unshift(m) : design.attrs.push(m);
            renderTablesDesign();
        }
        // Objet métier : monter/descendre un attribut d'un cran ou tout en haut / tout en bas.
        function boMoveEl(boId, elmId, where) {
            const bo = state.governance.businessObjects.find(b => b.id === boId);
            if (!bo || !bo.elements) return;
            const a = bo.elements,
                i = a.findIndex(e => e.id === elmId);
            if (i < 0) return;
            const [m] = a.splice(i, 1);
            let j = i;
            if (where === 'top') j = 0;
            else if (where === 'bottom') j = a.length;
            else if (where === 'up') j = Math.max(0, i - 1);
            else if (where === 'down') j = Math.min(a.length, i + 1);
            a.splice(j, 0, m);
            persistAppState();
            renderGovernance();
        }
        // ---- Glisser-déposer générique pour réordonner un tableau (attributs, éléments d'objet…) ----
        let _reorderCtx = null;
        function reorderDragStart(ev, kind, i) {
            _reorderCtx = { kind, i };
            try {
                ev.dataTransfer.effectAllowed = 'move';
                ev.dataTransfer.setData('text/plain', String(i));
            } catch (e) {}
            const tr = ev.currentTarget;
            if (tr) tr.style.opacity = '0.4';
        }
        function reorderDragEnd(ev) {
            const tr = ev.currentTarget;
            if (tr) tr.style.opacity = '';
        }
        function reorderDragOver(ev, kind) {
            if (_reorderCtx && _reorderCtx.kind === kind) {
                ev.preventDefault();
                try {
                    ev.dataTransfer.dropEffect = 'move';
                } catch (e) {}
                const tr = ev.currentTarget;
                if (tr) tr.style.borderTop = '2px solid #3b82f6';
            }
        }
        function reorderDragLeave(ev) {
            const tr = ev.currentTarget;
            if (tr) tr.style.borderTop = '';
        }
        function reorderDrop(ev, kind, j, apply) {
            ev.preventDefault();
            const tr = ev.currentTarget;
            if (tr) tr.style.borderTop = '';
            if (!_reorderCtx || _reorderCtx.kind !== kind) return;
            const from = _reorderCtx.i;
            _reorderCtx = null;
            if (from === j || from == null) return;
            apply(from, j);
        }
        // Réordonne un tableau : retire l'élément `from` et l'insère à la position `to`.
        function arrMove(arr, from, to) {
            const [m] = arr.splice(from, 1);
            arr.splice(to, 0, m);
        }
        function tdAttrDrop(from, to) {
            const design = tdState.editing;
            if (!design) return;
            arrMove(design.attrs, from, to);
            renderTablesDesign();
        }
        function boElReorder(boId, fromId, toId) {
            const bo = state.governance.businessObjects.find(b => b.id === boId);
            if (!bo || !bo.elements) return;
            const fi = bo.elements.findIndex(e => e.id === fromId),
                ti = bo.elements.findIndex(e => e.id === toId);
            if (fi < 0 || ti < 0 || fi === ti) return;
            arrMove(bo.elements, fi, ti);
            persistAppState();
            renderGovernance();
        }

        // ---- Valeurs proposées dans les filtres d'entrée : distinctes détectées dans la source ----
        const tdValueCache = {}; // clé tableId+'|'+col -> [valeurs]
        async function tdFillDatalist(dlId, srcName, col) {
            if (!col) return;
            const table = tableByName(srcName);
            if (!table || table.status !== 'ready' || !table.headers.includes(col)) return;
            const key = table.id + '|' + col;
            const put = vals => {
                const element = el(dlId);
                if (element) element.innerHTML = vals.map(v => `<option value="${escapeHTML(v)}"></option>`).join('');
            };
            if (tdValueCache[key]) {
                put(tdValueCache[key]);
                return;
            }
            try {
                const { conn } = await getDB();
                const raw = `TRIM(CAST(${sqlIdent(col)} AS VARCHAR))`;
                const res = await conn.query(
                    `SELECT ${raw} AS v, COUNT(*)::BIGINT AS n FROM ${sqlIdent(duckTableName(table.id))} WHERE ${sqlIdent(col)} IS NOT NULL AND ${raw} <> '' GROUP BY 1 ORDER BY n DESC LIMIT 300`
                );
                const vals = arrowResultToObjects(res).map(r => String(r.v));
                tdValueCache[key] = vals;
                put(vals);
            } catch (e) {
                console.warn('Valeurs de filtre indisponibles :', e);
            }
        }
        function tdAddFk() {
            const design = tdState.editing;
            if (!design) return;
            design.fks = design.fks || [];
            design.fks.push({ attr: '', table: '', col: '' });
            renderTablesDesign();
        }
        function tdRemoveFk(i) {
            const design = tdState.editing;
            if (!design || !design.fks) return;
            design.fks.splice(i, 1);
            renderTablesDesign();
        }
        function tdSetFk(i, field, v) {
            const design = tdState.editing;
            if (!design || !design.fks || !design.fks[i]) return;
            design.fks[i][field] = v;
            if (field === 'table') design.fks[i].col = '';
            renderTablesDesign();
        }
        // ---- Assistant d'enrichissement pas à pas ----
        function tdWizStart() {
            tdState.wiz = {
                tgt: '',
                col: '',
                as: '',
                mode: 'via',
                attr: '',
                srcKey: '',
                viaSrc: '',
                viaIn: '',
                viaOut: '',
                validMode: '',
                vCol: '',
                vOp: 'eq',
                vVal: '',
                vStart: '',
                vEnd: ''
            };
            renderTablesDesign();
        }
        function tdWizCancel() {
            tdState.wiz = null;
            renderTablesDesign();
        }
        function tdWizSet(f, v) {
            const w = tdState.wiz;
            if (!w) return;
            w[f] = v;
            if (f === 'tgt') {
                w.col = '';
                w.srcKey = '';
            }
            if (f === 'viaSrc' || f === 'mode') {
                w.viaIn = '';
                w.viaOut = '';
                w.vCol = '';
                w.vStart = '';
                w.vEnd = '';
            }
            if (f === 'col' && !String(w.as || '').trim()) w.as = v;
            renderTablesDesign();
        }
        function tdWizAdd() {
            const design = tdState.editing,
                w = tdState.wiz;
            if (!design || !w) return;
            try {
                if (!w.tgt) throw new Error('Choisissez la table où se trouve la donnée à ramener (étape 1).');
                if (!w.col) throw new Error('Choisissez la colonne à ramener (étape 1).');
                if (!String(w.as || '').trim()) throw new Error('Donnez un nom à la nouvelle colonne (étape 1).');
                if (!w.attr) throw new Error("Choisissez la colonne de VOTRE table qui sert d'accroche (étape 2).");
                if (!w.srcKey) throw new Error(`Choisissez la clé de la table « ${w.tgt} » (étape 2).`);
                if (w.mode === 'via' && (!w.viaSrc || !w.viaIn || !w.viaOut))
                    throw new Error("Complétez la table de lien : ses colonnes d'entrée et de sortie (étape 2).");
                if (w.validMode === 'status' && !w.vCol) throw new Error('Choisissez la colonne de statut (étape 3).');
                if (w.validMode === 'period' && !w.vStart)
                    throw new Error('Choisissez la colonne de début de période (étape 3).');
                design.joins = design.joins || [];
                design.joins.push({
                    src: w.tgt,
                    srcKey: w.srcKey,
                    attr: w.attr,
                    col: w.col,
                    as: String(w.as).trim(),
                    viaSrc: w.mode === 'via' ? w.viaSrc : '',
                    viaIn: w.mode === 'via' ? w.viaIn : '',
                    viaOut: w.mode === 'via' ? w.viaOut : '',
                    validMode: w.validMode || '',
                    vCol: w.vCol,
                    vOp: w.vOp || 'eq',
                    vVal: w.vVal,
                    vStart: w.vStart,
                    vEnd: w.vEnd
                });
                tdState.wiz = null;
                renderTablesDesign();
                showSuccess(
                    `Enrichissement ajouté : la colonne « ${String(w.as).trim()} » sera ramenée depuis « ${w.tgt} ». Pour aller un niveau plus loin, relancez l'assistant en vous accrochant à « ${String(w.as).trim()} ».`
                );
            } catch (e) {
                showError(e.message);
            }
        }
        function tdWizHtml(d) {
            const w = tdState.wiz;
            if (!w) return '';
            const tables = Object.values(state.tables).filter(t2 => t2.status === 'ready' && t2.id !== d.targetId);
            const myCols = d.attrs.concat(
                (d.joins || []).map(j2 => String(j2.as || '').trim()).filter(a3 => a3 && !d.attrs.includes(a3))
            );
            const hdrs = nm => {
                const t2 = nm ? tableByName(nm) : null;
                return t2 ? t2.headers : [];
            };
            const sel = (f, cur, opts, ph) =>
                `<select onchange="tdWizSet('${f}',this.value)" class="border border-indigo-300 rounded px-1.5 py-1 text-xs bg-white max-w-[180px]"><option value="">${ph}</option>${opts.map(h => `<option value="${escapeHTML(h)}" ${cur === h ? 'selected' : ''}>${escapeHTML(h)}</option>`).join('')}</select>`;
            const tNames = tables.map(t2 => t2.name);
            let html3 = `<div class="border-2 border-indigo-300 bg-indigo-50/60 rounded-xl p-3 mb-2 space-y-2 text-xs">
                <div class="font-bold text-indigo-800">🧭 Assistant — ramener une donnée d'une autre table</div>
                <div class="flex items-center gap-1.5 flex-wrap"><span class="font-bold text-slate-600 w-14">Étape 1</span><span>La donnée se trouve dans</span>${sel('tgt', w.tgt, tNames, '— table —')}${w.tgt ? `<span>· colonne à ramener</span>${sel('col', w.col, hdrs(w.tgt), '— colonne —')}<span>· nom dans ma table</span><input type="text" value="${escapeHTML(w.as || '')}" onchange="tdWizSet('as',this.value)" class="w-32 border border-indigo-300 rounded px-1.5 py-1 text-xs font-bold">` : ''}</div>`;
            if (w.tgt) {
                html3 += `<div class="flex items-center gap-1.5 flex-wrap"><span class="font-bold text-slate-600 w-14">Étape 2</span><span>J'y accède</span>
                    <label class="flex items-center gap-1"><input type="radio" name="wizMode" ${w.mode === 'direct' ? 'checked' : ''} onchange="tdWizSet('mode','direct')"> directement (clé commune)</label>
                    <label class="flex items-center gap-1"><input type="radio" name="wizMode" ${w.mode === 'via' ? 'checked' : ''} onchange="tdWizSet('mode','via')"> par une table de lien</label></div>`;
                if (w.mode === 'via')
                    html3 += `<div class="flex items-center gap-1.5 flex-wrap pl-16"><span>Table de lien :</span>${sel(
                        'viaSrc',
                        w.viaSrc,
                        tNames.filter(n2 => n2 !== w.tgt),
                        '— table —'
                    )}${w.viaSrc ? `<span>· sa colonne côté MA table</span>${sel('viaIn', w.viaIn, hdrs(w.viaSrc), '— colonne —')}<span>· sa colonne côté « ${escapeHTML(w.tgt)} »</span>${sel('viaOut', w.viaOut, hdrs(w.viaSrc), '— colonne —')}` : ''}</div>`;
                html3 += `<div class="flex items-center gap-1.5 flex-wrap pl-16"><span>Ma colonne d'accroche :</span>${sel('attr', w.attr, myCols, '— colonne de ma table —')}<span>= clé de « ${escapeHTML(w.tgt)} » :</span>${sel('srcKey', w.srcKey, hdrs(w.tgt), '— colonne —')}</div>`;
                if (w.mode !== 'via' || w.viaSrc) {
                    const vTbl = w.mode === 'via' ? w.viaSrc : w.tgt;
                    html3 += `<div class="flex items-center gap-1.5 flex-wrap"><span class="font-bold text-slate-600 w-14">Étape 3</span><span>Lignes ${w.mode === 'via' ? 'de lien' : `de « ${escapeHTML(w.tgt)} »`} à retenir :</span>
                        <select onchange="tdWizSet('validMode',this.value)" class="border border-indigo-300 rounded px-1.5 py-1 text-xs bg-white"><option value="">toutes</option><option value="status" ${w.validMode === 'status' ? 'selected' : ''}>valides par statut</option><option value="period" ${w.validMode === 'period' ? 'selected' : ''}>période active (aujourd'hui)</option></select>`;
                    if (w.validMode === 'status')
                        html3 += `${sel('vCol', w.vCol, hdrs(vTbl), '— colonne statut —')}<select onchange="tdWizSet('vOp',this.value)" class="border border-indigo-300 rounded px-1.5 py-1 text-xs bg-white">${QUAL_FILTER_OPS.map(o => `<option value="${o.v}" ${(w.vOp || 'eq') === o.v ? 'selected' : ''}>${o.t}</option>`).join('')}</select><input type="text" value="${escapeHTML(w.vVal || '')}" onchange="tdWizSet('vVal',this.value)" placeholder="valeur (ex. ACTIF)" class="w-28 border border-indigo-300 rounded px-1.5 py-1 text-xs">`;
                    if (w.validMode === 'period')
                        html3 += `<span>début</span>${sel('vStart', w.vStart, hdrs(vTbl), '— colonne —')}<span>fin</span>${sel('vEnd', w.vEnd, hdrs(vTbl), '— (ouverte) —')}<span class="text-slate-400">(si plusieurs périodes actives : la plus récente)</span>`;
                    html3 += `</div>`;
                }
            }
            html3 += `<div class="flex items-center gap-2 pt-1"><button onclick="tdWizAdd()" class="bg-indigo-600 text-white font-bold px-3 py-1.5 rounded">✔ Ajouter cet enrichissement</button><button onclick="tdWizCancel()" class="text-slate-500 hover:text-slate-700">Annuler</button><span class="text-slate-400">Donnée encore plus loin (2 tables de lien) ? Ajoutez d'abord l'identifiant intermédiaire, puis relancez l'assistant en vous accrochant dessus.</span></div>
            </div>`;
            return html3;
        }

        function tdAddJoin() {
            const design = tdState.editing;
            if (!design) return;
            design.joins = design.joins || [];
            design.joins.push({ src: '', srcKey: '', attr: '', col: '', as: '' });
            renderTablesDesign();
        }
        function tdRemoveJoin(i) {
            const design = tdState.editing;
            if (!design || !design.joins) return;
            design.joins.splice(i, 1);
            renderTablesDesign();
        }
        function tdSetJoin(i, field, v) {
            const design = tdState.editing;
            if (!design || !design.joins || !design.joins[i]) return;
            design.joins[i][field] = v;
            if (field === 'src') {
                design.joins[i].srcKey = '';
                design.joins[i].col = '';
            }
            if (field === 'viaSrc') {
                design.joins[i].viaIn = '';
                design.joins[i].viaOut = '';
                design.joins[i].vCol = '';
                design.joins[i].vStart = '';
                design.joins[i].vEnd = '';
            }
            if (field === 'col' && !String(design.joins[i].as || '').trim()) design.joins[i].as = v;
            renderTablesDesign();
        }

        // [Attribut] -> identifiant SQL (toutes les colonnes de l'union sont VARCHAR).
        function tdFormulaSql(f) {
            return String(f).replace(/\[([^\]\[]+)\]/g, (m, a) => sqlIdent(a.trim()));
        }

        function tdValidJoins(d) {
            return (d.joins || []).filter(j => j.src && j.srcKey && j.attr && j.col && String(j.as || '').trim());
        }
        function tdValidFks(d) {
            return (d.fks || []).filter(f => f.attr && f.table && f.col);
        }

        // ---- Formats déclarés : la source est toujours du texte ; la table normalise vers un
        // format canonique (dates AAAA-MM-JJ, décimaux à point, booléens OUI/NON, codes MAJUSCULES).
        // Une valeur inconvertible est CONSERVÉE telle quelle et comptée « non conforme ».
        const TD_FORMATS = [
            ['', 'Texte'],
            ['int', 'Entier'],
            ['dec', 'Décimal'],
            ['date', 'Date'],
            ['bool', 'Booléen'],
            ['code', 'Code (MAJ)']
        ];
        function tdFormatLabel(f) {
            const e = TD_FORMATS.find(x => x[0] === f);
            return e ? e[1] : 'Texte';
        }
        // Expression de normalisation : renvoie la valeur canonique, ou NULL si inconvertible.
        function tdNormExpr(fmt, e) {
            const t = `TRIM(${e})`;
            switch (fmt) {
                case 'int':
                    return `CAST(TRY_CAST(REPLACE(REPLACE(${t}, ' ', ''), chr(160), '') AS BIGINT) AS VARCHAR)`;
                case 'dec':
                    return `CAST(TRY_CAST(REPLACE(REPLACE(REPLACE(${t}, ' ', ''), chr(160), ''), ',', '.') AS DOUBLE) AS VARCHAR)`;
                case 'date':
                    return `CAST(COALESCE(TRY_CAST(TRY_STRPTIME(${t}, '%d/%m/%Y') AS DATE), TRY_CAST(TRY_STRPTIME(${t}, '%Y-%m-%d') AS DATE), TRY_CAST(TRY_STRPTIME(${t}, '%d-%m-%Y') AS DATE), TRY_CAST(TRY_STRPTIME(${t}, '%d.%m.%Y') AS DATE), TRY_CAST(TRY_STRPTIME(${t}, '%Y/%m/%d') AS DATE)) AS VARCHAR)`;
                case 'bool':
                    return `CASE WHEN UPPER(${t}) IN ('1','O','OUI','Y','YES','TRUE','VRAI') THEN 'OUI' WHEN UPPER(${t}) IN ('0','N','NON','NO','FALSE','FAUX') THEN 'NON' ELSE NULL END`;
                case 'code':
                    return `NULLIF(UPPER(${t}), '')`;
                default:
                    return null;
            }
        }
        function tdBuildSql(d) {
            const branches = d.sources.map(s => {
                const table = tableByName(s.src);
                if (!table || table.status !== 'ready') throw new Error(`La source "${s.src}" n'est pas chargée.`);
                const cols = d.attrs.map(a =>
                    s.map[a] && table.headers.includes(s.map[a])
                        ? `CAST(${sqlIdent(s.map[a])} AS VARCHAR) AS ${sqlIdent(a)}`
                        : `CAST(NULL AS VARCHAR) AS ${sqlIdent(a)}`
                );
                // Filtres à l'entrée : seules les lignes retenues de la source alimentent la table.
                const conds = (s.filters || [])
                    .filter(f => f.col && f.op && (['empty', 'nempty'].includes(f.op) || String(f.val || '').length))
                    .map(f => qualCondSql(f))
                    .filter(Boolean);
                return `SELECT ${sqlLiteral(s.src)} AS ${sqlIdent('SOURCE_ORIGINE')}, ${cols.join(', ')} FROM ${sqlIdent(duckTableName(table.id))}${conds.length ? ' WHERE ' + conds.join(' AND ') : ''}`;
            });
            let sql = branches.join('\nUNION ALL\n');
            // Normalisation des formats déclarés — appliquée AVANT jointures et dédoublonnage, pour
            // que « 01/02/2019 » et « 2019-02-01 » soient une seule et même valeur entre sources.
            const fmts = d.formats || {};
            if (d.attrs.some(a => fmts[a] && tdNormExpr(fmts[a], 'x'))) {
                const cols = [sqlIdent('SOURCE_ORIGINE')].concat(
                    d.attrs.map(a => {
                        const ne = fmts[a] ? tdNormExpr(fmts[a], `CAST(${sqlIdent(a)} AS VARCHAR)`) : null;
                        return ne ? `COALESCE(${ne}, CAST(${sqlIdent(a)} AS VARCHAR)) AS ${sqlIdent(a)}` : sqlIdent(a);
                    })
                );
                sql = `SELECT ${cols.join(', ')} FROM (\n${sql}\n) n0`;
            }
            // Enrichissements : LEFT JOIN vers une autre source via une clé (une ligne par clé côté
            // enrichissement — pas de démultiplication des lignes de la table).
            const joins = tdValidJoins(d).filter(j => !j.viaSrc || (j.viaIn && j.viaOut));
            if (joins.length) {
                const dateE = e => `TRY_CAST(${tdNormExpr('date', e)} AS DATE)`;
                const validSql = (j, al) => {
                    if (j.validMode === 'status' && j.vCol) {
                        const conditionSql = qualCondSql({ col: j.vCol, op: j.vOp || 'eq', val: j.vVal || '' });
                        return conditionSql
                            ? ' AND ' + conditionSql.replaceAll(sqlIdent(j.vCol), al + '.' + sqlIdent(j.vCol))
                            : '';
                    }
                    if (j.validMode === 'period' && j.vStart) {
                        let c2 = ` AND ${dateE(`CAST(${al}.${sqlIdent(j.vStart)} AS VARCHAR)`)} <= CURRENT_DATE`;
                        if (j.vEnd)
                            c2 += ` AND (${al}.${sqlIdent(j.vEnd)} IS NULL OR TRIM(CAST(${al}.${sqlIdent(j.vEnd)} AS VARCHAR)) = '' OR ${dateE(`CAST(${al}.${sqlIdent(j.vEnd)} AS VARCHAR)`)} >= CURRENT_DATE)`;
                        return c2;
                    }
                    return '';
                };
                const groups = new Map();
                joins.forEach((j, ji) => {
                    const k = j.viaSrc || j.validMode ? 'u' + ji : j.src + '|' + j.srcKey + '|' + j.attr;
                    if (!groups.has(k)) groups.set(k, { src: j.src, srcKey: j.srcKey, attr: j.attr, cols: [], rows: [] });
                    groups.get(k).cols.push({ col: j.col, as: j.as.trim() });
                    groups.get(k).rows.push(j);
                });
                let count = 0;
                // Application EN COUCHES successives : chaque enrichissement est joint sur le
                // résultat des précédents, si bien que son attribut d'accroche peut être une
                // colonne ramenée par un enrichissement antérieur (chaînage 3e, 4e niveau, ...).
                const addLayer = (alias, joinSql, cols) => {
                    sql =
                        'SELECT u.*, ' +
                        cols.map(c => alias + '.' + sqlIdent(c.as)).join(', ') +
                        ' FROM (\n' +
                        sql +
                        '\n) u\n' +
                        joinSql;
                };
                for (const g of groups.values()) {
                    const table = tableByName(g.src);
                    if (!table || table.status !== 'ready')
                        throw new Error(`La source d'enrichissement "${g.src}" n'est pas chargée.`);
                    const alias = 'e' + ++count;
                    const j0 = g.rows ? g.rows[0] : null;
                    if (j0 && j0.viaSrc) {
                        // Jointure en 2 SAUTS : table -> table de lien (lignes VALIDES seulement) -> cible.
                        const lt = tableByName(j0.viaSrc);
                        if (!lt || lt.status !== 'ready') throw new Error(`La table de lien "${j0.viaSrc}" n'est pas chargée.`);
                        const nrm = c2 => `NULLIF(UPPER(TRIM(CAST(${c2} AS VARCHAR))), '')`;
                        const ordSql =
                            j0.validMode === 'period' && j0.vStart
                                ? `${dateE(`CAST(lk.${sqlIdent(j0.vStart)} AS VARCHAR)`)} DESC NULLS LAST`
                                : `lk.${sqlIdent(j0.viaIn)}`;
                        addLayer(
                            alias,
                            `LEFT JOIN (SELECT ${nrm('lk.' + sqlIdent(j0.viaIn))} AS __k, ${g.cols.map(c => `CAST(tg.${sqlIdent(c.col)} AS VARCHAR) AS ${sqlIdent(c.as)}`).join(', ')} FROM ${sqlIdent(duckTableName(lt.id))} lk JOIN ${sqlIdent(duckTableName(table.id))} tg ON ${nrm('tg.' + sqlIdent(g.srcKey))} = ${nrm('lk.' + sqlIdent(j0.viaOut))} WHERE ${nrm('lk.' + sqlIdent(j0.viaIn))} IS NOT NULL${validSql(j0, 'lk')} QUALIFY row_number() OVER (PARTITION BY ${nrm('lk.' + sqlIdent(j0.viaIn))} ORDER BY ${ordSql}) = 1) ${alias} ON COALESCE(UPPER(TRIM(CAST(u.${sqlIdent(g.attr)} AS VARCHAR))), chr(3)) = ${alias}.__k`,
                            g.cols
                        );
                        continue;
                    }
                    // Jointure directe : validité optionnelle sur les lignes de la source cible
                    // (statut ou période active ; en période, la plus récente est retenue).
                    const kn = `COALESCE(UPPER(TRIM(CAST(t0.${sqlIdent(g.srcKey)} AS VARCHAR))), chr(2))`;
                    const ordD =
                        j0 && j0.validMode === 'period' && j0.vStart
                            ? `${dateE(`CAST(t0.${sqlIdent(j0.vStart)} AS VARCHAR)`)} DESC NULLS LAST`
                            : '__k';
                    addLayer(
                        alias,
                        `LEFT JOIN (SELECT ${kn} AS __k, ${g.cols.map(c => `CAST(t0.${sqlIdent(c.col)} AS VARCHAR) AS ${sqlIdent(c.as)}`).join(', ')} FROM ${sqlIdent(duckTableName(table.id))} t0 WHERE 1=1${j0 ? validSql(j0, 't0') : ''} QUALIFY row_number() OVER (PARTITION BY ${kn} ORDER BY ${ordD}) = 1) ${alias} ON COALESCE(UPPER(TRIM(CAST(u.${sqlIdent(g.attr)} AS VARCHAR))), chr(3)) = ${alias}.__k`,
                        g.cols
                    );
                }
            }
            const calcs = d.calcs.filter(cx => cx.name && String(cx.formula || '').trim());
            if (calcs.length)
                sql = `SELECT *, ${calcs.map(cx => `(${tdFormulaSql(cx.formula)}) AS ${sqlIdent(cx.name)}`).join(', ')} FROM (\n${sql}\n) c`;
            if ((d.key || []).length) {
                // Dédoublonnage : même clé + contenu STRICTEMENT identique => une seule ligne (la
                // première par ordre de source). Les divergences restent dans la table (rapport d'écarts).
                const allAttrs = d.attrs.concat(
                    joins.map(j => j.as.trim()),
                    calcs.map(c => c.name)
                );
                const rowHash = `md5(concat_ws(chr(1), ${allAttrs.map(a => `COALESCE(CAST(${sqlIdent(a)} AS VARCHAR), chr(0))`).join(', ')}))`;
                const keyExpr = d.key
                    .map(a => `COALESCE(UPPER(TRIM(CAST(${sqlIdent(a)} AS VARCHAR))), '')`)
                    .join(` || chr(1) || `);
                sql = `SELECT * FROM (\n${sql}\n) w QUALIFY row_number() OVER (PARTITION BY ${keyExpr}, ${rowHash} ORDER BY ${sqlIdent('SOURCE_ORIGINE')}) = 1`;
            }
            return sql;
        }

        // Reconstruit toutes les tables conçues qui dépendent d'une source (contributrice ou
        // d'enrichissement) — appelé automatiquement après la mise à jour de la source.
        async function tdAutoRebuildFor(srcName) {
            const deps = Object.values(state.tables).filter(
                x =>
                    x.type === 'designed' &&
                    x.design &&
                    ((x.design.sources || []).some(s => s.src === srcName) ||
                        (x.design.joins || []).some(j => j.src === srcName || j.viaSrc === srcName))
            );
            for (const dt of deps) {
                try {
                    await tdMaterialize(JSON.parse(JSON.stringify(dt.design)));
                    showSuccess(`🧱 Table "${dt.name}" reconstruite (source "${srcName}" mise à jour).`);
                } catch (e) {
                    showError(`Reconstruction de la table "${dt.name}" impossible : ` + e.message);
                }
            }
            if (deps.length && currentTab === 10) renderTablesDesign();
        }

        async function tdMaterialize(d) {
            const { conn } = await getDB();
            const tId = d.targetId && state.tables[d.targetId] ? d.targetId : 'tb_' + generateId();
            if (!state.tables[tId]) {
                state.tables[tId] = {
                    id: tId,
                    name: d.name,
                    file: null,
                    type: 'designed',
                    size: 0,
                    config: {},
                    headers: [],
                    columnsMeta: {},
                    status: 'loading'
                };
                state.pivotMode[tId] = 'none';
            }
            const table = state.tables[tId];
            const oldName = table.name;
            table.name = d.name;
            table.type = 'designed';
            table.status = 'loading';
            const inner = tdBuildSql(d);
            await duckDropTable(tId);
            await conn.query(
                `CREATE TABLE ${sqlIdent(duckTableName(tId))} AS SELECT row_number() OVER () AS __rn, * FROM (\n${inner}\n) f`
            );
            table.headers = await duckTableHeaders(tId);
            table.storage = 'table';
            table.sampleData = await duckSampleRows(tId, 6);
            const cRes = await conn.query(`SELECT COUNT(*)::BIGINT AS n FROM ${sqlIdent(duckTableName(tId))}`);
            d.lastRows = Number(arrowResultToObjects(cRes)[0].n);
            d.lastBuild = new Date().toISOString();
            // Contrôle de conformité des formats : les valeurs restées inconvertibles (gardées
            // brutes) sont comptées par attribut — re-vérifiables à tout moment dans l'audit.
            d.lastConform = {};
            try {
                const fmts = d.formats || {};
                const fa = d.attrs.filter(a => fmts[a] && tdNormExpr(fmts[a], 'x'));
                if (fa.length) {
                    const T2 = sqlIdent(duckTableName(tId));
                    const exprs = fa.map((a, i) => {
                        const raw = `CAST(${sqlIdent(a)} AS VARCHAR)`;
                        return `SUM(CASE WHEN ${sqlIdent(a)} IS NOT NULL AND TRIM(${raw}) <> '' AND ${tdNormExpr(fmts[a], raw)} IS NULL THEN 1 ELSE 0 END)::BIGINT AS f${i}`;
                    });
                    const rows = arrowResultToObjects(await conn.query(`SELECT ${exprs.join(', ')} FROM ${T2}`))[0];
                    fa.forEach((a, i) => {
                        const number = Number(rows['f' + i] || 0);
                        if (number > 0) d.lastConform[a] = number;
                    });
                }
            } catch (eC) {
                console.warn('Contrôle de conformité ignoré :', eC);
            }
            // Clés étrangères déclarées : lien du modèle de données créé automatiquement + comptage des orphelins.
            d.lastFk = [];
            try {
                for (const fk of tdValidFks(d)) {
                    const table = tableByName(fk.table);
                    if (!table || table.status !== 'ready' || !table.headers.includes(fk.col)) {
                        d.lastFk.push({ ...fk, orphans: null });
                        continue;
                    }
                    const exists = state.relations.some(
                        r =>
                            (r.sourceTable === tId &&
                                r.sourceCol === fk.attr &&
                                r.targetTable === table.id &&
                                r.targetCol === fk.col) ||
                            (r.targetTable === tId &&
                                r.targetCol === fk.attr &&
                                r.sourceTable === table.id &&
                                r.sourceCol === fk.col)
                    );
                    if (!exists)
                        state.relations.push({
                            id: 'rel_' + generateId(),
                            sourceTable: tId,
                            sourceCol: fk.attr,
                            targetTable: table.id,
                            targetCol: fk.col,
                            cardinality: '',
                            kind: 'fk'
                        });
                    const nv = c => `NULLIF(UPPER(TRIM(CAST(${sqlIdent(c)} AS VARCHAR))), '')`;
                    const oRes = await conn.query(
                        `SELECT COUNT(*)::BIGINT AS n FROM ${sqlIdent(duckTableName(tId))} WHERE ${nv(fk.attr)} IS NOT NULL AND ${nv(fk.attr)} NOT IN (SELECT ${nv(fk.col)} FROM ${sqlIdent(duckTableName(table.id))} WHERE ${nv(fk.col)} IS NOT NULL)`
                    );
                    d.lastFk.push({ ...fk, orphans: Number(arrowResultToObjects(oRes)[0].n) });
                }
            } catch (eF) {
                console.warn('Contrôle des clés étrangères ignoré :', eF);
            }
            d.targetId = tId;
            table.design = JSON.parse(JSON.stringify(d));
            table.status = 'ready';
            if (oldName && oldName !== table.name) {
                try {
                    await idbDel('tabledata', oldName);
                } catch (e) {}
            }
            renderTables();
            updateBaseTableSelect();
            populateQualTables();
            try {
                await persistTableData(tId);
            } catch (e) {
                console.warn('Persistance de la table conçue impossible :', e);
            }
            persistAppState();
            return tId;
        }

        async function tdSaveDesign(btn) {
            const design = tdState.editing;
            if (!design) return;
            design.name = String(design.name || '').trim();
            try {
                if (!design.name) throw new Error('Donnez un nom à la table.');
                if (!design.sources.length) throw new Error('Ajoutez au moins une source.');
                if (!design.attrs.length) throw new Error('Ajoutez au moins un attribut.');
                const clash = Object.values(state.tables).find(t => t.name === design.name && t.id !== design.targetId);
                if (clash) throw new Error(`Le nom "${design.name}" est déjà utilisé par une autre source/table.`);
                const outNames = [
                    ...design.attrs,
                    ...tdValidJoins(design).map(j => j.as.trim()),
                    ...design.calcs.filter(c => c.name && String(c.formula || '').trim()).map(c => c.name)
                ];
                const reserved = outNames.find(a => a === 'SOURCE_ORIGINE' || a === '__rn');
                if (reserved) throw new Error(`Le nom d'attribut "${reserved}" est réservé.`);
                const dupName = outNames.find((a, i2) => outNames.indexOf(a) !== i2);
                if (dupName)
                    throw new Error(
                        `Nom d'attribut en double : "${dupName}" (attribut, calcul et enrichissement doivent avoir des noms distincts).`
                    );
                if (btn) btn.disabled = true;
                hideError();
                bgTaskStart(`Construction de la table "${design.name}"`);
                const tId = await tdMaterialize(JSON.parse(JSON.stringify(design)));
                tdState.editing = null;
                bgTaskEnd(
                    `🧱 Table "${state.tables[tId].name}" construite : ${Number(state.tables[tId].design.lastRows || 0).toLocaleString('fr-FR')} lignes.`
                );
                renderTablesDesign();
            } catch (e) {
                bgTaskEnd();
                showError('Construction impossible : ' + e.message);
            } finally {
                if (btn) btn.disabled = false;
            }
        }

        async function tdRebuild(tId, btn) {
            const table = state.tables[tId];
            if (!table || !table.design) return;
            try {
                if (btn) btn.disabled = true;
                bgTaskStart(`Reconstruction de la table "${table.name}"`);
                await tdMaterialize(JSON.parse(JSON.stringify(table.design)));
                bgTaskEnd(
                    `🔄 Table "${table.name}" reconstruite : ${Number(state.tables[tId].design.lastRows || 0).toLocaleString('fr-FR')} lignes.`
                );
                renderTablesDesign();
            } catch (e) {
                bgTaskEnd();
                showError('Reconstruction impossible : ' + e.message);
            } finally {
                if (btn) btn.disabled = false;
            }
        }

        // ---- Rapport d'écarts entre sources (même clé, valeurs différentes) ----
        function tdDivAttrs(t, d) {
            return t.headers.filter(h => h !== 'SOURCE_ORIGINE' && !(d.key || []).includes(h));
        }
        // Collecte les écarts ATTRIBUT PAR ATTRIBUT sur la projection légère TMP : chaque requête ne
        // manipule qu'une seule colonne → jeu de travail minimal, jamais de débordement disque, même
        // sans répertoire temporaire inscriptible (file://). Retourne au plus `limit` lignes.
        async function tdCollectDivergences(conn, t, d, TMP, limit) {
            const keyE = d.key.map(a => `COALESCE(UPPER(TRIM(CAST(${sqlIdent(a)} AS VARCHAR))), '')`).join(" || ' | ' || ");
            const keyDisp = d.key.map(a => `COALESCE(CAST(${sqlIdent(a)} AS VARCHAR), '')`).join(" || ' | ' || ");
            const attrs = tdDivAttrs(t, d);
            const rows = [];
            for (const attribute of attrs) {
                if (rows.length >= limit) break;
                const na = `COALESCE(UPPER(TRIM(CAST(${sqlIdent(attribute)} AS VARCHAR))), chr(2))`;
                const sub = `SELECT ${keyE} FROM ${TMP} GROUP BY 1 HAVING COUNT(DISTINCT ${na}) > 1`;
                const sql = `SELECT ${keyDisp} AS cle, ${sqlIdent('SOURCE_ORIGINE')} AS source, COALESCE(CAST(${sqlIdent(attribute)} AS VARCHAR), '') AS valeur
                    FROM ${TMP} WHERE ${keyE} IN (${sub}) ORDER BY cle, source LIMIT ${limit - rows.length}`;
                const res = await conn.query(sql);
                arrowResultToObjects(res).forEach(r =>
                    rows.push({
                        cle: String(r.cle),
                        attribut: attribute,
                        source: String(r.source),
                        valeur: String(r.valeur == null ? '' : r.valeur)
                    })
                );
            }
            rows.sort((x, y) =>
                x.cle < y.cle ? -1 : x.cle > y.cle ? 1 : x.attribut < y.attribut ? -1 : x.attribut > y.attribut ? 1 : 0
            );
            return rows;
        }
        async function tdDivergenceReport(tId) {
            const table = state.tables[tId];
            const d = table && table.design;
            if (!d || !(d.key || []).length) return showError("Définissez d'abord une clé primaire (🔑) sur la table.");
            qualInspectModal();
            const head = el('qualInspectModalHead'),
                body = el('qualInspectModalBody');
            head.innerHTML = `<strong class="text-amber-800">🔍 Écarts entre sources — ${escapeHTML(table.name)}</strong><button onclick="closeQualInspectModal()" class="ml-auto text-amber-600 hover:text-red-600 font-black text-base leading-none px-1">✕</button>`;
            body.innerHTML =
                '<p class="text-xs text-slate-400 p-4">Analyse des écarts (clé : ' + escapeHTML(d.key.join(' + ')) + ')…</p>';
            let __divTmp = null,
                __divConn = null;
            try {
                const { conn } = await getDB();
                __divConn = conn;
                const attrs = tdDivAttrs(table, d);
                // Toute l'analyse s'exécute SANS débordement disque (mémoire relevée + spill coupé) et sur
                // un jeu de travail réduit : projection légère matérialisée, puis collecte attribut par
                // attribut. Plus jamais de « HTML FileReaders do not support writing », aucun clic requis.
                const out = await runNoSpill(conn, async () => {
                    const proj = Array.from(new Set([...d.key, ...attrs, 'SOURCE_ORIGINE'])).filter(h =>
                        (table.headers || []).includes(h)
                    );
                    __divTmp = 'tddiv_' + generateId();
                    const TMP = sqlIdent(duckTableName(__divTmp));
                    await conn.query(
                        `CREATE OR REPLACE TABLE ${TMP} AS SELECT ${proj.map(sqlIdent).join(', ')} FROM ${sqlIdent(duckTableName(tId))}`
                    );
                    const keyE = d.key
                        .map(a => `COALESCE(UPPER(TRIM(CAST(${sqlIdent(a)} AS VARCHAR))), '')`)
                        .join(" || ' | ' || ");
                    const rowHash = `md5(concat_ws(chr(1), ${attrs.map(a => `COALESCE(CAST(${sqlIdent(a)} AS VARCHAR), chr(0))`).join(', ')}))`;
                    const sumRes = await conn.query(
                        `SELECT COUNT(*)::BIGINT AS n FROM (SELECT ${keyE} AS k FROM ${TMP} GROUP BY 1 HAVING COUNT(DISTINCT ${rowHash}) > 1) s`
                    );
                    const nbKeys = Number(arrowResultToObjects(sumRes)[0].n);
                    if (!nbKeys) return { nbKeys: 0, rows: [] };
                    const rows = await tdCollectDivergences(conn, table, d, TMP, 1500);
                    return { nbKeys, rows };
                });
                const nbKeys = out.nbKeys,
                    rows = out.rows;
                if (!nbKeys) {
                    body.innerHTML =
                        '<p class="text-xs text-emerald-700 p-4 font-bold">✔ Aucun écart : toutes les clés partagées entre sources portent des données identiques.</p>';
                    return;
                }
                head.innerHTML = `<strong class="text-amber-800">🔍 Écarts entre sources — ${escapeHTML(table.name)}</strong>
                    <span class="text-amber-700 font-bold">${nbKeys.toLocaleString('fr-FR')} clé(s) divergente(s)</span>
                    <span class="text-slate-400">clé : ${escapeHTML(d.key.join(' + '))}</span>
                    <button onclick="tdExportDivergences('${tId}', this)" class="bg-white border border-amber-300 px-2.5 py-1 rounded font-bold hover:bg-amber-100">⬇ Exporter tout (CSV)</button>
                    <button onclick="closeQualInspectModal()" class="ml-auto text-amber-600 hover:text-red-600 font-black text-base leading-none px-1" title="Fermer (Échap)">✕</button>`;
                // Regroupement clé → attribut → {source: valeur} pour un rendu comparatif.
                const groups = new Map();
                rows.forEach(r => {
                    const k = String(r.cle);
                    if (!groups.has(k)) groups.set(k, new Map());
                    const g = groups.get(k);
                    const text = String(r.attribut);
                    if (!g.has(text)) g.set(text, []);
                    g.get(text).push({ source: String(r.source), valeur: String(r.valeur) });
                });
                let html = '';
                let shown = 0;
                for (const [k, g] of groups) {
                    html += `<div class="border-b border-slate-200 px-4 py-3">
                        <div class="text-xs font-black text-slate-700 mb-1.5">🔑 ${escapeHTML(k)}</div>
                        ${Array.from(g)
                            .map(
                                ([a, vals]) => `<div class="flex flex-wrap items-baseline gap-2 mb-1 pl-4">
                            <span class="text-[11px] font-bold text-amber-700 w-44 truncate" title="${escapeHTML(a)}">${escapeHTML(a)}</span>
                            ${vals.map(v => `<span class="text-[11px] bg-slate-50 border border-slate-200 rounded px-2 py-0.5"><span class="text-slate-400">${escapeHTML(v.source)} :</span> <strong>${v.valeur === '' ? '<em class="text-slate-300">vide</em>' : escapeHTML(v.valeur)}</strong></span>`).join('')}
                        </div>`
                            )
                            .join('')}
                    </div>`;
                    if (++shown >= 300) break;
                }
                if (rows.length >= 1500 || shown >= 300)
                    html += `<p class="text-[11px] text-slate-400 p-3">Affichage tronqué — l'export CSV contient la totalité des écarts.</p>`;
                body.innerHTML = html;
            } catch (e) {
                body.innerHTML = `<p class="text-xs text-red-600 p-4">Analyse impossible : ${escapeHTML(e.message)}</p>`;
            } finally {
                if (__divTmp && __divConn) {
                    try {
                        await __divConn.query(`DROP TABLE IF EXISTS ${sqlIdent(duckTableName(__divTmp))}`);
                    } catch (e) {}
                }
            }
        }
        async function tdExportDivergences(tId, btn) {
            const table = state.tables[tId];
            const d = table && table.design;
            if (!d || !(d.key || []).length) return;
            const old = btn ? btn.textContent : '';
            if (btn) {
                btn.disabled = true;
                btn.textContent = '…';
            }
            let __expTmp = null,
                __expConn = null;
            try {
                const { conn } = await getDB();
                __expConn = conn;
                const cell = v => {
                    if (v === null || v === undefined) return '';
                    const text = String(v);
                    return /[",\n\r;]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
                };
                const parts = ['cle,attribut,source,valeur\n'];
                let total = 0;
                await runNoSpill(conn, async () => {
                    const attrs = tdDivAttrs(table, d);
                    const proj = Array.from(new Set([...d.key, ...attrs, 'SOURCE_ORIGINE'])).filter(h =>
                        (table.headers || []).includes(h)
                    );
                    __expTmp = 'tddiv_' + generateId();
                    const TMP = sqlIdent(duckTableName(__expTmp));
                    await conn.query(
                        `CREATE OR REPLACE TABLE ${TMP} AS SELECT ${proj.map(sqlIdent).join(', ')} FROM ${sqlIdent(duckTableName(tId))}`
                    );
                    const keyE = d.key
                        .map(a => `COALESCE(UPPER(TRIM(CAST(${sqlIdent(a)} AS VARCHAR))), '')`)
                        .join(" || ' | ' || ");
                    const keyDisp = d.key.map(a => `COALESCE(CAST(${sqlIdent(a)} AS VARCHAR), '')`).join(" || ' | ' || ");
                    // Export COMPLET, attribut par attribut (jeu de travail minimal, jamais de spill).
                    for (const attribute of attrs) {
                        const na = `COALESCE(UPPER(TRIM(CAST(${sqlIdent(attribute)} AS VARCHAR))), chr(2))`;
                        const sub = `SELECT ${keyE} FROM ${TMP} GROUP BY 1 HAVING COUNT(DISTINCT ${na}) > 1`;
                        const sql = `SELECT ${keyDisp} AS cle, ${sqlLiteral(attribute)} AS attribut, ${sqlIdent('SOURCE_ORIGINE')} AS source, COALESCE(CAST(${sqlIdent(attribute)} AS VARCHAR), '') AS valeur
                            FROM ${TMP} WHERE ${keyE} IN (${sub}) ORDER BY cle, source`;
                        const res = await conn.query(sql);
                        arrowResultToObjects(res).forEach(r => {
                            parts.push([r.cle, r.attribut, r.source, r.valeur].map(cell).join(',') + '\n');
                            total++;
                        });
                    }
                });
                const blob = new Blob(['﻿', ...parts], { type: 'text/csv;charset=utf-8;' });
                const anchorElement = document.createElement('a');
                anchorElement.href = URL.createObjectURL(blob);
                anchorElement.download = `Ecarts_sources_${table.name.replace(/[^a-zA-Z0-9]+/g, '_')}_${Date.now()}.csv`;
                document.body.appendChild(anchorElement);
                anchorElement.click();
                anchorElement.remove();
                showSuccess(`Rapport d'écarts exporté (${total.toLocaleString('fr-FR')} lignes).`);
            } catch (e) {
                showError('Export impossible : ' + e.message);
            } finally {
                if (__expTmp && __expConn) {
                    try {
                        await __expConn.query(`DROP TABLE IF EXISTS ${sqlIdent(duckTableName(__expTmp))}`);
                    } catch (e) {}
                }
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = old;
                }
            }
        }

        // ---- Volet d'audit « contribution par source » (tables conçues uniquement) ----
        async function renderDesignedSourcePanel(tId) {
            const table = state.tables[tId];
            if (!table || table.type !== 'designed' || !table.design) return;
            const alertsDiv = el('profilingAlerts');
            if (!alertsDiv) return;
            const d = table.design;
            try {
                const { conn } = await getDB();
                const T = sqlIdent(duckTableName(tId));
                const attrs = table.headers.filter(h => h !== 'SOURCE_ORIGINE');
                const filledSum = attrs
                    .map(
                        a =>
                            `SUM(CASE WHEN ${sqlIdent(a)} IS NOT NULL AND TRIM(CAST(${sqlIdent(a)} AS VARCHAR)) <> '' THEN 1 ELSE 0 END)`
                    )
                    .join(' + ');
                const res = await conn.query(
                    `SELECT ${sqlIdent('SOURCE_ORIGINE')} AS s, COUNT(*)::BIGINT AS n, ((${filledSum})::DOUBLE / (COUNT(*) * ${attrs.length}) * 100) AS comp FROM ${T} GROUP BY 1 ORDER BY n DESC`
                );
                const rows = arrowResultToObjects(res);
                const tot = rows.reduce((a, r) => a + Number(r.n), 0) || 1;
                let nbDiv = null;
                if ((d.key || []).length && (d.sources || []).length > 1) {
                    const keyE = d.key
                        .map(a => `COALESCE(UPPER(TRIM(CAST(${sqlIdent(a)} AS VARCHAR))), '')`)
                        .join(" || ' | ' || ");
                    const dAttrs = tdDivAttrs(table, d);
                    if (dAttrs.length) {
                        const rowHash = `md5(concat_ws(chr(1), ${dAttrs.map(a => `COALESCE(CAST(${sqlIdent(a)} AS VARCHAR), chr(0))`).join(', ')}))`;
                        const sRes = await conn.query(
                            `SELECT COUNT(*)::BIGINT AS n FROM (SELECT ${keyE} AS k FROM ${T} GROUP BY 1 HAVING COUNT(DISTINCT ${rowHash}) > 1) z`
                        );
                        nbDiv = Number(arrowResultToObjects(sRes)[0].n);
                    }
                }
                const div = document.createElement('div');
                div.className = 'p-4 rounded-lg border-2 bg-blue-50/60 border-blue-200';
                div.innerHTML = `<div class="font-black text-xs uppercase text-blue-700 mb-2">🧱 Table conçue — contribution et qualité par source</div>
                    <div class="border border-blue-100 rounded-lg overflow-x-auto bg-white"><table class="w-full text-left text-xs">
                    <thead class="bg-blue-50 text-[10px] uppercase font-bold text-blue-600"><tr><th class="p-2">Source</th>
                    <th class="p-2 text-right">Lignes</th>
                    <th class="p-2 text-right">Part</th>
                    <th class="p-2 text-right">Complétude</th>
                    </tr>
                    </thead>
                    <tbody>${rows
                        .map(
                            r => `<tr class="border-t border-slate-100"><td class="p-2 font-bold">${escapeHTML(String(r.s))}</td><td class="p-2 text-right">${Number(r.n).toLocaleString('fr-FR')}</td>
                        <td class="p-2 text-right">${((Number(r.n) / tot) * 100).toFixed(1)} %</td>
                        <td class="p-2 text-right">${Number(r.comp).toFixed(1)} %</td>
                        </tr>`
                        )
                        .join('')}</tbody>
                        </table></div>
                    ${nbDiv != null ? `<div class="mt-2 text-xs ${nbDiv ? 'text-amber-800' : 'text-emerald-700'} font-medium">${nbDiv ? `⚠️ <strong>${nbDiv.toLocaleString('fr-FR')}</strong> clé(s) portant des données différentes selon la source <button onclick="tdDivergenceReport('${tId}')" class="ml-2 text-[11px] bg-white border border-amber-300 rounded px-2 py-0.5 font-bold text-amber-700 hover:bg-amber-100">🔍 Voir le rapport d'écarts</button>` : '✔ Aucun écart entre sources sur la clé primaire'}</div>` : ''}
                    <div id="td-conform-${tId}"></div>
                    <p class="text-[10px] text-slate-400 mt-1.5">Astuce : pour auditer une seule source contributrice, ajoutez le filtre <strong>SOURCE_ORIGINE = nom de la source</strong> avant de relancer l'audit.</p>`;
                alertsDiv.prepend(div);
                // Conformité des formats + orphelins de clés étrangères (comptages LIVE + consultation)
                try {
                    const box = el('td-conform-' + tId);
                    if (box) {
                        const parts = [];
                        const fmts2 = d.formats || {};
                        for (const a of table.headers.filter(h => fmts2[h] && tdNormExpr(fmts2[h], 'x'))) {
                            const raw = `CAST(${sqlIdent(a)} AS VARCHAR)`;
                            const bad = `${sqlIdent(a)} IS NOT NULL AND TRIM(${raw}) <> '' AND ${tdNormExpr(fmts2[a], raw)} IS NULL`;
                            const rows = arrowResultToObjects(
                                await conn.query(`SELECT SUM(CASE WHEN ${bad} THEN 1 ELSE 0 END)::BIGINT AS n FROM ${T}`)
                            )[0];
                            const number = Number(rows.n || 0);
                            if (number > 0) {
                                const idx = registerQualInspect(
                                    `${a} — non conforme au format ${tdFormatLabel(fmts2[a])}`,
                                    `SELECT * EXCLUDE (__rn) FROM ${T} WHERE ${bad}`
                                );
                                parts.push(
                                    `<div class="text-xs text-amber-800 mt-1">🎛 <strong>${escapeHTML(a)}</strong> : ${number.toLocaleString('fr-FR')} valeur(s) non conforme(s) au format <em>${tdFormatLabel(fmts2[a])}</em>${qualInspectButtons(idx)}</div>`
                                );
                            } else {
                                parts.push(
                                    `<div class="text-xs text-emerald-700 mt-1">🎛 <strong>${escapeHTML(a)}</strong> : format <em>${tdFormatLabel(fmts2[a])}</em> ✔ conforme</div>`
                                );
                            }
                        }
                        for (const fk of tdValidFks(d)) {
                            const table = tableByName(fk.table);
                            if (!table || table.status !== 'ready' || !table.headers.includes(fk.col)) continue;
                            const nv = c2 => `NULLIF(UPPER(TRIM(CAST(${sqlIdent(c2)} AS VARCHAR))), '')`;
                            const cond = `${nv(fk.attr)} IS NOT NULL AND ${nv(fk.attr)} NOT IN (SELECT ${nv(fk.col)} FROM ${sqlIdent(duckTableName(table.id))} WHERE ${nv(fk.col)} IS NOT NULL)`;
                            const rows = arrowResultToObjects(
                                await conn.query(`SELECT SUM(CASE WHEN ${cond} THEN 1 ELSE 0 END)::BIGINT AS n FROM ${T}`)
                            )[0];
                            const number = Number(rows.n || 0);
                            if (number > 0) {
                                const idx = registerQualInspect(
                                    `${fk.attr} — orphelins (réf. ${fk.table}.${fk.col})`,
                                    `SELECT * EXCLUDE (__rn) FROM ${T} WHERE ${cond}`
                                );
                                parts.push(
                                    `<div class="text-xs text-amber-800 mt-1">🔐 <strong>${escapeHTML(fk.attr)}</strong> → ${escapeHTML(fk.table)}.${escapeHTML(fk.col)} : ${number.toLocaleString('fr-FR')} orphelin(s)${qualInspectButtons(idx)}</div>`
                                );
                            } else {
                                parts.push(
                                    `<div class="text-xs text-emerald-700 mt-1">🔐 <strong>${escapeHTML(fk.attr)}</strong> → ${escapeHTML(fk.table)}.${escapeHTML(fk.col)} ✔ intégrité respectée</div>`
                                );
                            }
                        }
                        box.innerHTML = parts.join('');
                    }
                } catch (eCF) {
                    console.warn('Contrôles formats/FK ignorés :', eCF);
                }
            } catch (e) {
                console.warn('Volet par source ignoré :', e);
            }
        }

        // ---- Écran 🧱 Tables : liste des tables conçues + éditeur de recette ----
        // ============ V6.18 : VUE GRAPHIQUE DU CONCEPTEUR DE TABLE (option) ============
        // On tire un trait d'une colonne source vers un attribut de la table conçue pour créer
        // l'alimentation. Déposer sur le corps de la table crée l'attribut et le relie dans la foulée.
        // À l'ajout d'une source, l'alimentation automatique par nom de colonne est déjà appliquée
        // (tdAddSource) : les traits apparaissent immédiatement, il n'y a plus qu'à corriger.
        function tdGInjectCss() {
            if (el('tdgStyles')) return;
            const styleElement = document.createElement('style');
            styleElement.id = 'tdgStyles';
            styleElement.textContent = `
            #tdgCanvas{position:relative;background:linear-gradient(0deg,#fbfcfe,#fff);border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;min-height:300px}
            #tdgCanvas .tdg-empty{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:13px;text-align:center;padding:24px}
            .tdg-edges{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
            .tdg-node{position:absolute;width:216px;background:#fff;border:1.5px solid #d4dbe6;border-radius:12px;box-shadow:0 1px 2px rgba(15,23,42,.06),0 6px 16px rgba(15,23,42,.06);z-index:2;overflow:hidden}
            .tdg-node.tdg-tgt{width:250px;border-color:#2563eb;box-shadow:0 0 0 3px rgba(37,99,235,.13),0 6px 16px rgba(15,23,42,.08)}
            .tdg-nh{display:flex;align-items:center;gap:6px;padding:7px 9px;background:#f1f5f9;border-bottom:1px solid #e2e8f0;font-size:12px;font-weight:800;color:#1e293b}
            .tdg-tgt .tdg-nh{background:#eff6ff;color:#1d4ed8}
            .tdg-nm{flex-grow:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
            .tdg-list{max-height:210px;overflow-y:auto;padding:3px 0}
            .tdg-col,.tdg-attr{display:flex;align-items:center;gap:5px;padding:3px 9px;font-size:11px;color:#334155}
            .tdg-col{cursor:crosshair}
            .tdg-col:hover{background:#eef6ff}
            .tdg-col.mapped{color:#1d4ed8;font-weight:700}
            .tdg-attr{background:#fff}
            .tdg-attr.over{background:#dbeafe;outline:1px dashed #2563eb;outline-offset:-2px}
            .tdg-attr .tdg-an{flex-grow:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
            .tdg-key{font-size:9px;color:#b45309}
            .tdg-dot{width:7px;height:7px;border-radius:50%;background:#cbd5e1;flex:0 0 auto}
            .tdg-col.mapped .tdg-dot,.tdg-attr.fed .tdg-dot{background:#2563eb}
            .tdg-foot{display:flex;gap:4px;padding:5px 8px;border-top:1px solid #f1f5f9;background:#fcfdff;flex-wrap:wrap}
            .tdg-btn{font-size:10px;border:1px solid #cbd5e1;background:#fff;border-radius:5px;padding:1px 5px;cursor:pointer;color:#475569;font-weight:700}
            .tdg-btn:hover{border-color:#2563eb;color:#1d4ed8}
            .tdg-hint{position:absolute;left:10px;top:8px;font-size:10.5px;color:#64748b;background:#fff;border:1px solid #e2e8f0;border-radius:999px;padding:2px 9px;z-index:4}`;
            document.head.appendChild(styleElement);
        }
        function tdGToggle(on) {
            tdState.graph = !!on;
            renderTablesDesign();
        }
        // Alimentation automatique : rapproche par nom normalisé les attributs encore non alimentés.
        function tdGAutoFeed(si) {
            const design = tdState.editing;
            const source = design && design.sources[si];
            if (!source) return 0;
            const table = tableByName(source.src);
            if (!table) return 0;
            let count = 0;
            design.attrs.forEach(a => {
                if (source.map[a]) return;
                const header = table.headers.find(h => normColName(h) === normColName(a));
                if (header) {
                    source.map[a] = header;
                    count++;
                }
            });
            renderTablesDesign();
            showSuccess(
                count
                    ? `⚡ ${count} attribut(s) alimenté(s) automatiquement depuis « ${source.src} ».`
                    : `Aucune correspondance de nom supplémentaire trouvée dans « ${source.src} ».`
            );
            return count;
        }
        function tdGMap(si, attr, col) {
            const design = tdState.editing;
            const source = design && design.sources[si];
            if (!source) return;
            if (col) source.map[attr] = col;
            else delete source.map[attr];
            renderTablesDesign();
        }
        // Dépôt sur le corps de la table : on crée l'attribut (nom de la colonne) et on le relie.
        function tdGDropNew(si, col) {
            const design = tdState.editing;
            const source = design && design.sources[si];
            if (!source || !col) return;
            let a = col,
                i = 2;
            while (design.attrs.includes(a)) a = col + '_' + i++;
            design.attrs.push(a);
            source.map[a] = col;
            renderTablesDesign();
        }
        function tdGraphHtml() {
            const design = tdState.editing;
            if (!design) return '';
            return `<div class="mb-3 rounded-xl border ${tdState.graph ? 'border-blue-300 bg-blue-50/30' : 'border-slate-200 bg-slate-50/60'} p-3">
                <label class="flex items-center gap-2 cursor-pointer text-[12px] font-bold text-slate-700">
                    <input type="checkbox" ${tdState.graph ? 'checked' : ''} onchange="tdGToggle(this.checked)" class="w-4 h-4">
                    🔗 Vue graphique — relier les sources à la table en tirant des traits
                    <span class="font-medium text-slate-400 normal-case">(option : le formulaire ci-dessous reste disponible et synchronisé)</span>
                </label>
                ${tdState.graph ? `<div id="tdgCanvas" class="mt-2"></div>` : ''}
            </div>`;
        }
        function tdDrawGraph() {
            const tdgCanvasElement = el('tdgCanvas');
            if (!tdgCanvasElement) return;
            tdGInjectCss();
            const design = tdState.editing;
            if (!design) {
                tdgCanvasElement.innerHTML = '';
                return;
            }
            if (!(design.sources || []).length) {
                tdgCanvasElement.style.height = '300px';
                tdgCanvasElement.innerHTML =
                    '<div class="tdg-empty">Ajoutez une source (menu « Sources contributrices » ci-dessous) :<br>ses colonnes seront reliées automatiquement aux attributs de même nom, et vous pourrez corriger les traits à la souris.</div>';
                return;
            }
            const NW = 216,
                TW = 250,
                GAP = 190,
                ROW = 19;
            const hSrc = s => 30 + Math.min(210, 6 + (tableByName(s.src) || { headers: [] }).headers.length * ROW) + 30;
            const hTgt = 30 + Math.min(210, 6 + (design.attrs.length || 1) * ROW) + 30;
            let y = 36;
            const spos = [];
            design.sources.forEach((s, si) => {
                spos[si] = { x: 14, y, h: hSrc(s) };
                y += hSrc(s) + 18;
            });
            const H = Math.max(300, y + 10, 36 + hTgt + 20);
            const tpos = { x: 14 + NW + GAP, y: Math.max(36, (H - hTgt) / 2), h: hTgt };
            const CW = Math.max(560, tdgCanvasElement.clientWidth || 900, tpos.x + TW + 20);
            tdgCanvasElement.style.height = H + 'px';
            const srcRowY = (si, ci) => spos[si].y + 30 + 3 + ci * ROW + ROW / 2;
            const tgtRowY = ai => tpos.y + 30 + 3 + ai * ROW + ROW / 2;
            let paths = '';
            design.sources.forEach((s, si) => {
                const table = tableByName(s.src);
                if (!table) return;
                design.attrs.forEach((a, ai) => {
                    const col = s.map[a];
                    if (!col) return;
                    const ci = table.headers.indexOf(col);
                    if (ci < 0) return;
                    const y1 = srcRowY(si, ci),
                        y2 = tgtRowY(ai);
                    if (y1 > spos[si].y + spos[si].h || y2 > tpos.y + tpos.h) return; // ligne hors zone visible
                    const x1 = spos[si].x + NW,
                        x2 = tpos.x,
                        mx = (x1 + x2) / 2;
                    paths += `<path d="M ${x1} ${y1} C ${mx} ${y1} ${mx} ${y2} ${x2} ${y2}" fill="none" stroke="#2563eb" stroke-width="1.8" opacity=".8" marker-end="url(#tdgA)"/>`;
                });
            });
            let hh = `<svg class="tdg-edges" viewBox="0 0 ${CW} ${H}" preserveAspectRatio="none"><defs><marker id="tdgA" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#2563eb"/></marker></defs>${paths}</svg>`;
            hh += `<div class="tdg-hint">Tirez une colonne (à gauche) vers un attribut (à droite). Déposez sur le corps de la table pour créer l'attribut.</div>`;
            design.sources.forEach((s, si) => {
                const table = tableByName(s.src);
                const p = spos[si];
                const mapped = new Set(Object.values(s.map || {}));
                const rows = table
                    ? table.headers
                          .map(
                              (h, ci) =>
                                  `<div class="tdg-col${mapped.has(h) ? ' mapped' : ''}" data-si="${si}" data-col="${escapeHTML(h)}" style="height:${ROW}px" title="${escapeHTML(h)}"><span class="tdg-nm">${escapeHTML(h)}</span><span class="tdg-dot"></span></div>`
                          )
                          .join('')
                    : '<div class="tdg-col" style="color:#dc2626">source introuvable</div>';
                hh += `<div class="tdg-node" style="left:${p.x}px;top:${p.y}px">
                    <div class="tdg-nh"><span>📄</span><span class="tdg-nm" title="${escapeHTML(s.src)}">${escapeHTML(s.src)}</span></div>
                    <div class="tdg-list">${rows}</div>
                    <div class="tdg-foot"><button class="tdg-btn" title="Relier automatiquement les attributs de même nom" onclick="tdGAutoFeed(${si})">⚡ auto-alimenter</button>
                    <button class="tdg-btn" title="Détacher cette source" onclick="tdRemoveSource(${si})">✕ retirer</button></div></div>`;
            });
            const fed = a => (design.sources || []).some(s => s.map && s.map[a]);
            hh += `<div class="tdg-node tdg-tgt" id="tdgTarget" style="left:${tpos.x}px;top:${tpos.y}px">
                <div class="tdg-nh"><span>🧱</span><span class="tdg-nm" title="${escapeHTML(design.name || 'Nouvelle table')}">${escapeHTML(design.name || 'Nouvelle table')}</span></div>
                <div class="tdg-list">${
                    design.attrs.length
                        ? design.attrs
                              .map(
                                  (a, ai) =>
                                      `<div class="tdg-attr${fed(a) ? ' fed' : ''}" data-attr="${escapeHTML(a)}" style="height:${ROW}px"><span class="tdg-dot"></span><span class="tdg-an" title="${escapeHTML(a)}">${escapeHTML(a)}</span>${(design.key || []).includes(a) ? '<span class="tdg-key">🔑</span>' : ''}</div>`
                              )
                              .join('')
                        : '<div class="tdg-attr" style="color:#94a3b8">aucun attribut — tirez une colonne ici</div>'
                }</div>
                <div class="tdg-foot"><span style="font-size:9.5px;color:#64748b">${design.attrs.filter(fed).length}/${design.attrs.length} attribut(s) alimenté(s)</span></div>
                    </div>`;
            tdgCanvasElement.innerHTML = hh;
            // --- tirer un trait : colonne source → attribut cible ---
            const svg = tdgCanvasElement.querySelector('.tdg-edges');
            tdgCanvasElement.querySelectorAll('.tdg-col[data-si]').forEach(row => {
                row.addEventListener('pointerdown', ev => {
                    ev.preventDefault();
                    const number = Number(row.dataset.si),
                        col = row.dataset.col;
                    const cr = tdgCanvasElement.getBoundingClientRect(),
                        rr = row.getBoundingClientRect();
                    const x1 = rr.right - cr.left,
                        y1 = rr.top - cr.top + rr.height / 2;
                    const tmp = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                    tmp.setAttribute('stroke', '#f59e0b');
                    tmp.setAttribute('stroke-width', '2');
                    tmp.setAttribute('fill', 'none');
                    tmp.setAttribute('stroke-dasharray', '5 4');
                    if (svg) svg.appendChild(tmp);
                    let hov = null;
                    const mv = e2 => {
                        const x2 = e2.clientX - cr.left,
                            y2 = e2.clientY - cr.top,
                            mx = (x1 + x2) / 2;
                        tmp.setAttribute('d', `M ${x1} ${y1} C ${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`);
                        const under = document.elementFromPoint(e2.clientX, e2.clientY);
                        const at = under && under.closest ? under.closest('.tdg-attr[data-attr]') : null;
                        if (hov && hov !== at) hov.classList.remove('over');
                        hov = at;
                        if (hov) hov.classList.add('over');
                    };
                    const up = e2 => {
                        document.removeEventListener('pointermove', mv);
                        document.removeEventListener('pointerup', up);
                        if (tmp.parentNode) tmp.parentNode.removeChild(tmp);
                        if (hov) hov.classList.remove('over');
                        const under = document.elementFromPoint(e2.clientX, e2.clientY);
                        const at = under && under.closest ? under.closest('.tdg-attr[data-attr]') : null;
                        if (at) return tdGMap(number, at.dataset.attr, col);
                        const tgt = under && under.closest ? under.closest('#tdgTarget') : null;
                        if (tgt) return tdGDropNew(number, col); // dépôt sur la table : on crée l'attribut
                    };
                    document.addEventListener('pointermove', mv);
                    document.addEventListener('pointerup', up);
                });
            });
            // clic sur un attribut alimenté : on coupe l'alimentation (une source à la fois)
            tdgCanvasElement.querySelectorAll('.tdg-attr[data-attr]').forEach(at => {
                at.addEventListener('dblclick', () => {
                    const a = at.dataset.attr;
                    const design = tdState.editing;
                    const si = (design.sources || []).findIndex(s => s.map && s.map[a]);
                    if (si >= 0) tdGMap(si, a, '');
                });
            });
        }
        function renderTablesDesign() {
            const tablesDesignContentElement = el('tablesDesignContent');
            if (!tablesDesignContentElement) return;
            const designed = Object.values(state.tables).filter(t => t.type === 'designed');
            let html = '';
            if (designed.length) {
                html +=
                    `<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-6">` +
                    designed
                        .map(t => {
                            const d = t.design || {};
                            return `<div class="bg-white rounded-xl border border-blue-200 shadow-sm p-5">
                        <div class="flex items-center gap-2 mb-1"><span class="text-lg">🧱</span><h3 class="font-bold text-sm truncate flex-1" title="${escapeHTML(t.name)}">${escapeHTML(t.name)}</h3>
                            <span class="text-[10px] font-bold ${t.status === 'ready' ? 'text-emerald-600' : 'text-red-500'}">${t.status === 'ready' ? '✔ prête' : 'erreur'}</span></div>
                        <div class="text-[11px] text-slate-500 mb-1.5">${(d.attrs || []).length + (d.calcs || []).length} attribut(s)${(d.key || []).length ? ` · 🔑 ${escapeHTML(d.key.join(' + '))}` : ''}${d.lastRows != null ? ` · ${Number(d.lastRows).toLocaleString('fr-FR')} lignes` : ''}${Object.keys(d.formats || {}).length ? ` · 🎛 ${Object.keys(d.formats).length} format(s)` : ''}${(d.fks || []).length ? ` · 🔐 ${(d.fks || []).length} FK` : ''}</div>
                        ${(() => {
                            const nc = Object.values(d.lastConform || {}).reduce((a2, b2) => a2 + b2, 0);
                            const orph = (d.lastFk || []).reduce((a2, f2) => a2 + (f2.orphans > 0 ? f2.orphans : 0), 0);
                            return nc || orph
                                ? `<div class="text-[11px] font-bold text-amber-700 mb-1.5">${nc ? `⚠ ${nc.toLocaleString('fr-FR')} valeur(s) non conforme(s) au format` : ''}${nc && orph ? ' · ' : ''}${orph ? `⚠ ${orph.toLocaleString('fr-FR')} orphelin(s) de clé étrangère` : ''} <span class="font-normal text-slate-400">— détail dans l'audit</span></div>`
                                : '';
                        })()}
                        <div class="mb-3">${(d.sources || []).map(s => `<span class="inline-block text-[10px] bg-blue-50 border border-blue-200 text-blue-700 rounded px-1.5 py-0.5 mr-1 mb-1">${escapeHTML(s.src)}</span>`).join('')}</div>
                        <div class="grid grid-cols-2 gap-2">
                            <button onclick="tdEdit('${t.id}')" class="text-xs bg-white border border-slate-300 rounded px-2 py-1.5 font-bold text-slate-600 hover:bg-slate-50">✏️ Modifier</button>
                            <button onclick="tdRebuild('${t.id}', this)" class="text-xs bg-white border border-blue-300 rounded px-2 py-1.5 font-bold text-blue-700 hover:bg-blue-50" title="Ré-exécute la définition de la table sur l'état actuel des sources">🔄 Reconstruire</button>
                            ${(d.key || []).length && (d.sources || []).length > 1 ? `<button onclick="tdDivergenceReport('${t.id}')" class="text-xs bg-amber-50 border border-amber-300 rounded px-2 py-1.5 font-bold text-amber-700 hover:bg-amber-100 col-span-2">🔍 Rapport d'écarts entre sources</button>` : ''}
                        </div>
                    </div>`;
                        })
                        .join('') +
                    `</div>`;
            } else if (!tdState.editing) {
                html += `<div class="bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl p-10 text-center text-sm text-slate-400">Aucune table conçue pour l'instant — cliquez sur <strong>« ➕ Nouvelle table »</strong>.<br><span class="text-xs">Exemples : consolider 3 fichiers d'emplacements en une table unique · renommer des colonnes techniques en libellés métier · rapprocher deux référentiels et détecter leurs écarts.</span></div>`;
            }
            if (tdState.editing) html += tdEditorHtml();
            tablesDesignContentElement.innerHTML = html;
            if (tdState.editing && tdState.graph) setTimeout(tdDrawGraph, 0);
            // Remplit (en tâche de fond) les listes de valeurs proposées des filtres d'entrée.
            const design = tdState.editing;
            if (design)
                (design.sources || []).forEach((s, si) =>
                    (s.filters || []).forEach((f, fi) => {
                        if (f.col) tdFillDatalist(`tdfval-${si}-${fi}`, s.src, f.col);
                    })
                );
        }

        function tdEditorHtml() {
            const design = tdState.editing;
            const readySrcs = Object.values(state.tables).filter(t => t.status === 'ready' && t.type !== 'designed');
            const addable = readySrcs.filter(t => !design.sources.some(s => s.src === t.name));
            const srcCols = s => {
                const table = tableByName(s.src);
                return table ? table.headers : [];
            };
            const rows = design.attrs
                .map((a, i) => {
                    const isKey = design.key.includes(a);
                    return `<tr class="border-b border-slate-100 hover:bg-blue-50/30" ondragover="reorderDragOver(event,'tdattr')" ondragleave="reorderDragLeave(event)" ondrop="reorderDrop(event,'tdattr',${i},tdAttrDrop)">
                    <td class="p-1 text-center whitespace-nowrap"><span draggable="true" ondragstart="reorderDragStart(event,'tdattr',${i})" ondragend="reorderDragEnd(event)" class="inline-block cursor-grab text-slate-300 hover:text-blue-600 select-none text-sm leading-none" title="Glisser pour réordonner">⠿</span><br><span class="inline-flex leading-none">${[
                        ['top', '⤒', 'Tout en haut', i === 0],
                        ['−1 up', '▲', 'Monter', i === 0],
                        ['+1 down', '▼', 'Descendre', i === design.attrs.length - 1],
                        ['bottom', '⤓', 'Tout en bas', i === design.attrs.length - 1]
                    ]
                        .map(
                            ([act, ic, ti, dis]) =>
                                `<button onclick="${act === '−1 up' ? `tdMoveAttr(${i},-1)` : act === '+1 down' ? `tdMoveAttr(${i},1)` : `tdMoveAttrEdge(${i},'${act}')`}" ${dis ? 'disabled' : ''} class="text-slate-300 hover:text-blue-600 disabled:opacity-20 text-[10px] font-black px-0.5" title="${ti}">${ic}</button>`
                        )
                        .join('')}</span></td>
                    <td class="p-1.5 text-center"><button onclick="tdToggleKey(${i})" title="${isKey ? 'Retirer de la clé primaire' : 'Ajouter à la clé primaire'}" class="text-base ${isKey ? '' : 'opacity-20 grayscale hover:opacity-60'}">🔑</button></td>
                    <td class="p-1.5"><input type="text" value="${escapeHTML(a)}" onchange="tdRenameAttr(${i}, this.value)" class="w-full border border-slate-300 rounded px-2 py-1 text-xs font-bold" title="Nom métier de l'attribut (renommez librement)"></td>
                    <td class="p-1.5"><select onchange="tdSetFormat(${i}, this.value)" title="Format cible : la valeur texte de la source est normalisée (date → AAAA-MM-JJ, décimal → point, booléen → OUI/NON, code → MAJUSCULES) ; l'inconvertible est gardé tel quel et compté non conforme." class="w-full border rounded px-1 py-1 text-xs ${(design.formats || {})[a] ? 'border-violet-300 bg-violet-50 text-violet-800 font-bold' : 'border-slate-200 bg-white text-slate-500'}">${TD_FORMATS.map(([v, l]) => `<option value="${v}" ${(design.formats || {})[a] === v || (!(design.formats || {})[a] && !v) ? 'selected' : ''}>${l}</option>`).join('')}</select></td>
                    ${design.sources
                        .map(
                            (s, si) =>
                                `<td class="p-1.5"><select onchange="tdSetMap(${si}, ${i}, this.value)" class="w-full border rounded px-1 py-1 text-xs ${s.map[a] ? 'border-slate-300 bg-white' : 'border-amber-300 bg-amber-50'}"><option value="">∅ vide</option>${srcCols(
                                    s
                                )
                                    .map(
                                        h =>
                                            `<option value="${escapeHTML(h)}" ${s.map[a] === h ? 'selected' : ''}>${escapeHTML(h)}</option>`
                                    )
                                    .join('')}</select></td>`
                        )
                        .join('')}
                    <td class="p-1.5 text-center"><button onclick="tdRemoveAttr(${i})" class="text-slate-300 hover:text-red-500 font-bold">✕</button></td>
                </tr>`;
                })
                .join('');
            const calcRows = design.calcs
                .map(
                    (cx, i) => `<div class="flex gap-2 items-center mb-1.5">
                <input type="text" value="${escapeHTML(cx.name)}" onchange="tdSetCalc(${i}, 'name', this.value)" placeholder="Nom" class="w-44 border border-slate-300 rounded px-2 py-1.5 text-xs font-bold">
                <input type="text" value="${escapeHTML(cx.formula || '')}" onchange="tdSetCalc(${i}, 'formula', this.value)" placeholder="ex : [Prénom] || ' ' || [Nom]" class="flex-1 border border-slate-300 rounded px-2 py-1.5 text-xs font-mono">
                <button onclick="tdRemoveCalc(${i})" class="text-slate-300 hover:text-red-500 font-bold px-1">✕</button>
            </div>`
                )
                .join('');
            return `<div class="bg-white p-6 rounded-xl border-2 border-blue-300 shadow-md">
                <h3 class="font-black text-blue-800 text-sm mb-4">${design.targetId ? '✏️ Modifier la table' : '➕ Nouvelle table'}</h3>
                ${tdGraphHtml()}
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
                    <div><label class="text-xs font-bold text-slate-500 block mb-1">Nom de la table</label>
                        <input type="text" value="${escapeHTML(design.name)}" onchange="tdSetName(this.value)" placeholder="ex : EMPLACEMENTS_CONSOLIDES" class="w-full border border-slate-300 rounded-lg p-2.5 text-sm font-bold"></div>
                    <div><label class="text-xs font-bold text-slate-500 block mb-1">Ajouter une source contributrice</label>
                        <select onchange="if(this.value) tdAddSource(this.value)" class="w-full border border-slate-300 rounded-lg p-2.5 text-sm bg-white">
                            <option value="">— choisir une source —</option>${addable.map(t => `<option value="${escapeHTML(t.name)}">${escapeHTML(t.name)}</option>`).join('')}
                        </select></div>
                </div>
                ${design.sources.length ? `<div class="mb-4">${design.sources.map((s, si) => `<span class="inline-flex items-center gap-1.5 text-xs bg-blue-50 border border-blue-200 text-blue-800 rounded-lg px-2.5 py-1.5 mr-2 mb-1 font-bold">📥 ${escapeHTML(s.src)}${(s.filters || []).length ? ` <span class="text-[9px] bg-white border border-blue-300 rounded px-1" title="Filtres à l'entrée actifs">▼ ${(s.filters || []).length}</span>` : ''} <button onclick="tdRemoveSource(${si})" class="opacity-50 hover:opacity-100 hover:text-red-600">✕</button></span>`).join('')}</div>` : ''}
                ${
                    design.sources.length
                        ? `<details class="mb-4 border border-slate-200 rounded-lg px-3 py-2" ${design.sources.some(s => (s.filters || []).length) ? 'open' : ''}>
                    <summary class="text-xs font-bold text-slate-600 cursor-pointer">▼ Filtres à l'entrée (${design.sources.reduce((a, s) => a + (s.filters || []).length, 0)}) — ne charger que certaines lignes de chaque source (conditions cumulatives ET)</summary>
                    <div class="mt-2">${design.sources
                        .map(
                            (s, si) => `<div class="mb-2">
                        <div class="flex items-center gap-2"><span class="text-[11px] font-bold text-blue-700">📥 ${escapeHTML(s.src)}</span>
                        <button onclick="tdAddFilter(${si})" class="text-[10px] bg-white border border-slate-300 rounded px-2 py-0.5 font-bold text-slate-500 hover:bg-slate-50">+ condition</button></div>
                        ${(s.filters || [])
                            .map((f, fi) => {
                                const dlId = `tdfval-${si}-${fi}`;
                                return `<div class="flex items-center gap-1.5 mt-1 pl-5">
                            <select onchange="tdSetFilter(${si},${fi},'col',this.value)" class="border border-slate-300 rounded px-1.5 py-1 text-xs bg-white"><option value="">— colonne —</option>${srcCols(
                                s
                            )
                                .map(
                                    h =>
                                        `<option value="${escapeHTML(h)}" ${f.col === h ? 'selected' : ''}>${escapeHTML(h)}</option>`
                                )
                                .join('')}</select>
                            <select onchange="tdSetFilter(${si},${fi},'op',this.value)" class="border border-slate-300 rounded px-1 py-1 text-xs bg-white">${QUAL_FILTER_OPS.map(o => `<option value="${o.v}" ${f.op === o.v ? 'selected' : ''}>${o.t}</option>`).join('')}</select>
                            <input type="text" list="${dlId}" value="${escapeHTML(f.val || '')}" oninput="tdSetFilter(${si},${fi},'val',this.value)" placeholder="valeur (ou choisir)" class="w-36 border border-slate-300 rounded px-1.5 py-1 text-xs ${['empty', 'nempty'].includes(f.op) ? 'invisible' : ''}" title="Les valeurs présentes dans la source sont proposées ; vous pouvez aussi saisir une autre valeur.">
                            <datalist id="${dlId}"></datalist>
                            <button onclick="tdRemoveFilter(${si},${fi})" class="text-slate-300 hover:text-red-500 font-bold">✕</button>
                        </div>`;
                            })
                            .join('')}
                    </div>`
                        )
                        .join('')}</div>
                </details>`
                        : ''
                }
                ${
                    design.attrs.length
                        ? `<div class="border border-slate-200 rounded-lg overflow-x-auto mb-2"><table class="w-full text-left text-xs">
                    <thead class="bg-slate-50 text-[10px] uppercase font-bold text-slate-500"><tr><th class="p-2 w-12" title="Ordre des colonnes">↕</th>
                            <th class="p-2 w-8" title="Clé primaire">🔑</th>
                            <th class="p-2 min-w-[160px]">Attribut (nom métier)</th>
                            <th class="p-2 min-w-[90px]" title="Format cible avec normalisation automatique">Format</th>${design.sources.map(s => `<th class="p-2 min-w-[140px]">📥 ${escapeHTML(s.src)}</th>`).join('')}<th class="p-2 w-8"></th>
                        </tr>
                                </thead>
                    <tbody>${rows}</tbody></table></div>
                <p class="text-[10px] text-slate-400 mb-4">🔑 = clé primaire (doublons de clé identiques dédoublonnés, divergents signalés dans le rapport d'écarts) · <span class="bg-amber-50 border border-amber-200 rounded px-1">fond ambre</span> = non alimenté par cette source (restera vide).</p>`
                        : design.sources.length
                          ? ''
                          : '<p class="text-xs text-slate-400 italic mb-4">Choisissez une première source : ses colonnes deviendront les attributs de la table (renommables).</p>'
                }
                ${
                    design.attrs.length
                        ? `<details class="mb-4 border border-slate-200 rounded-lg px-3 py-2" ${(design.joins || []).length ? 'open' : ''}>
                    <summary class="text-xs font-bold text-slate-600 cursor-pointer">🔗 Enrichissements par jointure (${(design.joins || []).length}) — ramener une colonne d'une autre source via une clé</summary>
                    <div class="mt-2">
                        ${(design.joins || [])
                            .map((j, i) => {
                                const jt = j.src ? tableByName(j.src) : null;
                                const jh = jt ? jt.headers : [];
                                const srcOpts = Object.values(state.tables)
                                    .filter(t2 => t2.status === 'ready' && t2.id !== design.targetId)
                                    .map(
                                        t2 =>
                                            `<option value="${escapeHTML(t2.name)}" ${j.src === t2.name ? 'selected' : ''}>${escapeHTML(t2.name)}</option>`
                                    )
                                    .join('');
                                return `<div class="flex items-center gap-1.5 mb-1.5 flex-wrap">
                                <span class="text-[10px] text-slate-400">depuis</span>
                                <select onchange="tdSetJoin(${i},'src',this.value)" class="border border-slate-300 rounded px-1.5 py-1 text-xs bg-white max-w-[160px]"><option value="">— source —</option>${srcOpts}</select>
                                <span class="text-[10px] text-slate-400">sa clé</span>
                                <select onchange="tdSetJoin(${i},'srcKey',this.value)" class="border border-slate-300 rounded px-1 py-1 text-xs bg-white max-w-[130px]"><option value="">— col —</option>${jh.map(h => `<option value="${escapeHTML(h)}" ${j.srcKey === h ? 'selected' : ''}>${escapeHTML(h)}</option>`).join('')}</select>
                                <span class="text-[10px] text-slate-400">= attribut</span>
                                <select onchange="tdSetJoin(${i},'attr',this.value)" class="border border-slate-300 rounded px-1 py-1 text-xs bg-white max-w-[130px]"><option value="">— attr —</option>${design.attrs
                                    .concat(
                                        (design.joins || [])
                                            .slice(0, i)
                                            .map(pj => String(pj.as || '').trim())
                                            .filter(a3 => a3 && !design.attrs.includes(a3))
                                    )
                                    .map(
                                        a2 =>
                                            `<option value="${escapeHTML(a2)}" ${j.attr === a2 ? 'selected' : ''}>${escapeHTML(a2)}</option>`
                                    )
                                    .join('')}</select>
                                <span class="text-[10px] text-slate-400">ramener</span>
                                <select onchange="tdSetJoin(${i},'col',this.value)" class="border border-slate-300 rounded px-1 py-1 text-xs bg-white max-w-[130px]"><option value="">— col —</option>${jh.map(h => `<option value="${escapeHTML(h)}" ${j.col === h ? 'selected' : ''}>${escapeHTML(h)}</option>`).join('')}</select>
                                <span class="text-[10px] text-slate-400">sous le nom</span>
                                <input type="text" value="${escapeHTML(j.as || '')}" onchange="tdSetJoin(${i},'as',this.value)" placeholder="nom" class="w-32 border border-slate-300 rounded px-1.5 py-1 text-xs font-bold">
                                <button onclick="tdRemoveJoin(${i})" class="text-slate-300 hover:text-red-500 font-bold">✕</button>
                            </div>
                            <div class="flex items-center gap-1.5 mb-1.5 flex-wrap pl-6 text-[10px]">
                                <span class="text-slate-400">↳ via table de lien</span>
                                <select onchange="tdSetJoin(${i},'viaSrc',this.value)" class="border border-slate-300 rounded px-1 py-0.5 text-[11px] bg-white max-w-[150px]"><option value="">— directe —</option>${Object.values(
                                    state.tables
                                )
                                    .filter(t2 => t2.status === 'ready' && t2.id !== design.targetId && t2.name !== j.src)
                                    .map(
                                        t2 =>
                                            `<option value="${escapeHTML(t2.name)}" ${j.viaSrc === t2.name ? 'selected' : ''}>${escapeHTML(t2.name)}</option>`
                                    )
                                    .join('')}</select>
                                ${(() => {
                                    const vt = j.viaSrc ? tableByName(j.viaSrc) : null;
                                    const vh = j.viaSrc ? (vt ? vt.headers : []) : jh;
                                    const sel = (f2, cur, opts, ph) =>
                                        `<select onchange="tdSetJoin(${i},'${f2}',this.value)" class="border border-slate-300 rounded px-1 py-0.5 text-[11px] bg-white max-w-[130px]"><option value="">${ph}</option>${opts.map(h => `<option value="${escapeHTML(h)}" ${cur === h ? 'selected' : ''}>${escapeHTML(h)}</option>`).join('')}</select>`;
                                    let html3 = j.viaSrc
                                        ? `<span class="text-slate-400">entrée (= attribut)</span>${sel('viaIn', j.viaIn, vh, '— col —')}<span class="text-slate-400">sortie (→ clé cible)</span>${sel('viaOut', j.viaOut, vh, '— col —')}`
                                        : '';
                                    if (j.src)
                                        html3 += `<span class="text-slate-400">· validité ${j.viaSrc ? '(lignes de lien)' : 'des lignes de « ' + escapeHTML(j.src) + ' »'}</span><select onchange="tdSetJoin(${i},'validMode',this.value)" class="border border-slate-300 rounded px-1 py-0.5 text-[11px] bg-white"><option value="">toutes les lignes</option><option value="status" ${j.validMode === 'status' ? 'selected' : ''}>par statut</option><option value="period" ${j.validMode === 'period' ? 'selected' : ''}>période active</option></select>`;
                                    if (j.validMode === 'status')
                                        html3 += `${sel('vCol', j.vCol, vh, '— col —')}<select onchange="tdSetJoin(${i},'vOp',this.value)" class="border border-slate-300 rounded px-1 py-0.5 text-[11px] bg-white">${QUAL_FILTER_OPS.map(o => `<option value="${o.v}" ${(j.vOp || 'eq') === o.v ? 'selected' : ''}>${o.t}</option>`).join('')}</select><input type="text" value="${escapeHTML(j.vVal || '')}" onchange="tdSetJoin(${i},'vVal',this.value)" placeholder="valeur" class="w-20 border border-slate-300 rounded px-1 py-0.5 text-[11px]">`;
                                    if (j.validMode === 'period')
                                        html3 += `<span class="text-slate-400">début</span>${sel('vStart', j.vStart, vh, '— col —')}<span class="text-slate-400">fin</span>${sel('vEnd', j.vEnd, vh, '— (ouverte) —')}`;
                                    return html3;
                                })()}
                            </div>`;
                            })
                            .join('')}
                        ${tdWizHtml(design)}<div class="flex items-center gap-2 mt-1"><button onclick="tdWizStart()" class="text-[11px] bg-indigo-600 text-white rounded px-2.5 py-1 font-bold hover:bg-indigo-700">🧭 Assistant pas à pas</button><button onclick="tdAddJoin()" class="text-[11px] bg-white border border-blue-300 rounded px-2.5 py-1 font-bold text-blue-700 hover:bg-blue-50">+ Enrichissement (mode expert)</button></div>
                        <p class="text-[10px] text-slate-400 mt-1.5">Une seule ligne d'enrichissement est retenue par clé (pas de démultiplication). Les colonnes ramenées sont utilisables dans les calculs via [nom]. <strong>Chaînage</strong> : un enrichissement peut s'accrocher à un attribut ramené par un enrichissement précédent (l'ordre des lignes compte) — permet d'aller chercher une donnée au 3e, 4e niveau via plusieurs tables de lien.</p>
                    </div>
                </details>
                <details class="mb-4 border border-slate-200 rounded-lg px-3 py-2" ${(design.fks || []).length ? 'open' : ''}>
                    <summary class="text-xs font-bold text-slate-600 cursor-pointer">🔐 Clés étrangères (${(design.fks || []).length}) — un attribut référence une autre table (lien du modèle de données créé automatiquement + contrôle d'orphelins)</summary>
                    <div class="mt-2">
                        ${(design.fks || [])
                            .map((f, i) => {
                                const rt = f.table ? tableByName(f.table) : null;
                                const rh = rt ? rt.headers : [];
                                const tOpts = Object.values(state.tables)
                                    .filter(t2 => t2.status === 'ready' && t2.id !== design.targetId)
                                    .map(
                                        t2 =>
                                            `<option value="${escapeHTML(t2.name)}" ${f.table === t2.name ? 'selected' : ''}>${escapeHTML(t2.name)}</option>`
                                    )
                                    .join('');
                                return `<div class="flex items-center gap-1.5 mb-1.5 flex-wrap">
                                <select onchange="tdSetFk(${i},'attr',this.value)" class="border border-slate-300 rounded px-1.5 py-1 text-xs bg-white max-w-[150px]"><option value="">— attribut —</option>${design.attrs.map(a2 => `<option value="${escapeHTML(a2)}" ${f.attr === a2 ? 'selected' : ''}>${escapeHTML(a2)}</option>`).join('')}</select>
                                <span class="text-[10px] text-slate-400">référence</span>
                                <select onchange="tdSetFk(${i},'table',this.value)" class="border border-slate-300 rounded px-1.5 py-1 text-xs bg-white max-w-[160px]"><option value="">— table —</option>${tOpts}</select>
                                <span class="text-[10px] text-slate-400">colonne</span>
                                <select onchange="tdSetFk(${i},'col',this.value)" class="border border-slate-300 rounded px-1 py-1 text-xs bg-white max-w-[140px]"><option value="">— col —</option>${rh.map(h => `<option value="${escapeHTML(h)}" ${f.col === h ? 'selected' : ''}>${escapeHTML(h)}</option>`).join('')}</select>
                                <button onclick="tdRemoveFk(${i})" class="text-slate-300 hover:text-red-500 font-bold">✕</button>
                            </div>`;
                            })
                            .join('')}
                        <button onclick="tdAddFk()" class="text-[11px] bg-white border border-blue-300 rounded px-2.5 py-1 font-bold text-blue-700 hover:bg-blue-50 mt-1">+ Clé étrangère</button>
                        <p class="text-[10px] text-slate-400 mt-1.5">À chaque construction : le lien est ajouté au modèle de données s'il n'existe pas, et les valeurs sans correspondance (orphelins) sont comptées — consultables dans l'audit de la table.</p>
                    </div>
                </details>`
                        : ''
                }
                <div class="flex items-center justify-between mb-1"><label class="text-xs font-bold text-slate-500">Attributs calculés <span class="font-normal text-slate-400">(formule SQL, attributs entre [crochets])</span></label>
                    <div class="flex gap-2"><button onclick="tdAddAttr()" class="text-xs bg-white border border-slate-300 rounded px-2.5 py-1 font-bold text-slate-600 hover:bg-slate-50">+ Attribut</button><button onclick="tdAddCalc()" class="text-xs bg-white border border-blue-300 rounded px-2.5 py-1 font-bold text-blue-700 hover:bg-blue-50">+ Calcul</button></div>
                    </div>
                ${calcRows || '<p class="text-[11px] text-slate-400 italic mb-1">Exemples : <code class="bg-slate-50 px-1 rounded">[Pr&eacute;nom] || &#39; &#39; || [Nom]</code> &middot; <code class="bg-slate-50 px-1 rounded">LEFT([Code], 3)</code> &middot; <code class="bg-slate-50 px-1 rounded">CASE WHEN [Type] = &#39;E&#39; THEN &#39;Entrep&ocirc;t&#39; ELSE &#39;Autre&#39; END</code> &middot; <code class="bg-slate-50 px-1 rounded">TRY_CAST([Montant] AS DOUBLE) * 100</code></p>'}
                <div class="flex gap-3 mt-5 pt-4 border-t border-slate-100">
                    <button onclick="tdSaveDesign(this)" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-6 rounded-lg shadow text-sm">💾 ${design.targetId ? 'Reconstruire la table' : 'Créer la table'}</button>
                    <button onclick="tdCancel()" class="bg-white border border-slate-300 text-slate-600 font-bold py-2.5 px-5 rounded-lg text-sm hover:bg-slate-50">Annuler</button>
                </div>
            </div>`;
        }
