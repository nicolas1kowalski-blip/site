        // ======================= E3 (V2) : RECETTES DE TRANSFORMATION REPRODUCTIBLES =======================
        const RC_STEPS = { filter: '▼ Filtrer', clean: '🧼 Nettoyer', normalize: '📐 Normaliser (format)', std: '☎️ Standardiser (tél/email)', enrich: '🌍 Enrichir (référentiel)', calc: '🧮 Colonne calculée', dedup: '♊ Dédoublonner', rename: '✏️ Renommer', drop: '🗑 Supprimer colonnes' };
        // E8 : référentiels EMBARQUÉS (fonctionnement hors ligne).
        const RC_REFS = {
            pays: { label: 'Pays (ISO 3166)', key: 'CODE', cols: ['CODE', 'PAYS', 'DEVISE'], rows: [
                ['FR','France','EUR'],['DE','Allemagne','EUR'],['IT','Italie','EUR'],['ES','Espagne','EUR'],['PT','Portugal','EUR'],['BE','Belgique','EUR'],['NL','Pays-Bas','EUR'],['LU','Luxembourg','EUR'],['CH','Suisse','CHF'],['GB','Royaume-Uni','GBP'],['IE','Irlande','EUR'],['AT','Autriche','EUR'],['PL','Pologne','PLN'],['CZ','Tchéquie','CZK'],['SE','Suède','SEK'],['NO','Norvège','NOK'],['DK','Danemark','DKK'],['FI','Finlande','EUR'],['GR','Grèce','EUR'],['RO','Roumanie','RON'],['HU','Hongrie','HUF'],['US','États-Unis','USD'],['CA','Canada','CAD'],['MX','Mexique','MXN'],['BR','Brésil','BRL'],['AR','Argentine','ARS'],['CN','Chine','CNY'],['JP','Japon','JPY'],['KR','Corée du Sud','KRW'],['IN','Inde','INR'],['AU','Australie','AUD'],['NZ','Nouvelle-Zélande','NZD'],['MA','Maroc','MAD'],['DZ','Algérie','DZD'],['TN','Tunisie','TND'],['SN','Sénégal','XOF'],['CI','Côte d\'Ivoire','XOF'],['CM','Cameroun','XAF'],['TR','Turquie','TRY'],['SA','Arabie saoudite','SAR'],['AE','Émirats arabes unis','AED'],['ZA','Afrique du Sud','ZAR'],['RU','Russie','RUB'],['UA','Ukraine','UAH'],['SG','Singapour','SGD'],['HK','Hong Kong','HKD'],['TH','Thaïlande','THB'],['VN','Viêt Nam','VND'],['ID','Indonésie','IDR'],['MY','Malaisie','MYR']] },
            devises: { label: 'Devises (ISO 4217)', key: 'CODE', cols: ['CODE', 'DEVISE', 'SYMBOLE'], rows: [
                ['EUR','Euro','€'],['USD','Dollar américain','$'],['GBP','Livre sterling','£'],['CHF','Franc suisse','CHF'],['JPY','Yen','¥'],['CNY','Yuan','¥'],['CAD','Dollar canadien','$'],['AUD','Dollar australien','$'],['SEK','Couronne suédoise','kr'],['NOK','Couronne norvégienne','kr'],['DKK','Couronne danoise','kr'],['PLN','Zloty','zł'],['CZK','Couronne tchèque','Kč'],['HUF','Forint','Ft'],['RON','Leu','lei'],['TRY','Livre turque','₺'],['MAD','Dirham marocain','DH'],['XOF','Franc CFA (UEMOA)','CFA'],['XAF','Franc CFA (CEMAC)','CFA'],['INR','Roupie indienne','₹'],['BRL','Réal','R$'],['MXN','Peso mexicain','$'],['SGD','Dollar de Singapour','$'],['HKD','Dollar de Hong Kong','$'],['ZAR','Rand','R'],['AED','Dirham (EAU)','د.إ'],['SAR','Riyal saoudien','﷼'],['KRW','Won','₩'],['THB','Baht','฿'],['RUB','Rouble','₽']] },
            deptfr: { label: 'Départements français', key: 'CODE', cols: ['CODE', 'DEPARTEMENT', 'REGION'], rows: [
                ['01','Ain','Auvergne-Rhône-Alpes'],['02','Aisne','Hauts-de-France'],['03','Allier','Auvergne-Rhône-Alpes'],['04','Alpes-de-Haute-Provence','PACA'],['05','Hautes-Alpes','PACA'],['06','Alpes-Maritimes','PACA'],['07','Ardèche','Auvergne-Rhône-Alpes'],['08','Ardennes','Grand Est'],['09','Ariège','Occitanie'],['10','Aube','Grand Est'],['11','Aude','Occitanie'],['12','Aveyron','Occitanie'],['13','Bouches-du-Rhône','PACA'],['14','Calvados','Normandie'],['15','Cantal','Auvergne-Rhône-Alpes'],['16','Charente','Nouvelle-Aquitaine'],['17','Charente-Maritime','Nouvelle-Aquitaine'],['18','Cher','Centre-Val de Loire'],['19','Corrèze','Nouvelle-Aquitaine'],['2A','Corse-du-Sud','Corse'],['2B','Haute-Corse','Corse'],['21','Côte-d\'Or','Bourgogne-Franche-Comté'],['22','Côtes-d\'Armor','Bretagne'],['23','Creuse','Nouvelle-Aquitaine'],['24','Dordogne','Nouvelle-Aquitaine'],['25','Doubs','Bourgogne-Franche-Comté'],['26','Drôme','Auvergne-Rhône-Alpes'],['27','Eure','Normandie'],['28','Eure-et-Loir','Centre-Val de Loire'],['29','Finistère','Bretagne'],['30','Gard','Occitanie'],['31','Haute-Garonne','Occitanie'],['32','Gers','Occitanie'],['33','Gironde','Nouvelle-Aquitaine'],['34','Hérault','Occitanie'],['35','Ille-et-Vilaine','Bretagne'],['36','Indre','Centre-Val de Loire'],['37','Indre-et-Loire','Centre-Val de Loire'],['38','Isère','Auvergne-Rhône-Alpes'],['39','Jura','Bourgogne-Franche-Comté'],['40','Landes','Nouvelle-Aquitaine'],['41','Loir-et-Cher','Centre-Val de Loire'],['42','Loire','Auvergne-Rhône-Alpes'],['43','Haute-Loire','Auvergne-Rhône-Alpes'],['44','Loire-Atlantique','Pays de la Loire'],['45','Loiret','Centre-Val de Loire'],['46','Lot','Occitanie'],['47','Lot-et-Garonne','Nouvelle-Aquitaine'],['48','Lozère','Occitanie'],['49','Maine-et-Loire','Pays de la Loire'],['50','Manche','Normandie'],['51','Marne','Grand Est'],['52','Haute-Marne','Grand Est'],['53','Mayenne','Pays de la Loire'],['54','Meurthe-et-Moselle','Grand Est'],['55','Meuse','Grand Est'],['56','Morbihan','Bretagne'],['57','Moselle','Grand Est'],['58','Nièvre','Bourgogne-Franche-Comté'],['59','Nord','Hauts-de-France'],['60','Oise','Hauts-de-France'],['61','Orne','Normandie'],['62','Pas-de-Calais','Hauts-de-France'],['63','Puy-de-Dôme','Auvergne-Rhône-Alpes'],['64','Pyrénées-Atlantiques','Nouvelle-Aquitaine'],['65','Hautes-Pyrénées','Occitanie'],['66','Pyrénées-Orientales','Occitanie'],['67','Bas-Rhin','Grand Est'],['68','Haut-Rhin','Grand Est'],['69','Rhône','Auvergne-Rhône-Alpes'],['70','Haute-Saône','Bourgogne-Franche-Comté'],['71','Saône-et-Loire','Bourgogne-Franche-Comté'],['72','Sarthe','Pays de la Loire'],['73','Savoie','Auvergne-Rhône-Alpes'],['74','Haute-Savoie','Auvergne-Rhône-Alpes'],['75','Paris','Île-de-France'],['76','Seine-Maritime','Normandie'],['77','Seine-et-Marne','Île-de-France'],['78','Yvelines','Île-de-France'],['79','Deux-Sèvres','Nouvelle-Aquitaine'],['80','Somme','Hauts-de-France'],['81','Tarn','Occitanie'],['82','Tarn-et-Garonne','Occitanie'],['83','Var','PACA'],['84','Vaucluse','PACA'],['85','Vendée','Pays de la Loire'],['86','Vienne','Nouvelle-Aquitaine'],['87','Haute-Vienne','Nouvelle-Aquitaine'],['88','Vosges','Grand Est'],['89','Yonne','Bourgogne-Franche-Comté'],['90','Territoire de Belfort','Bourgogne-Franche-Comté'],['91','Essonne','Île-de-France'],['92','Hauts-de-Seine','Île-de-France'],['93','Seine-Saint-Denis','Île-de-France'],['94','Val-de-Marne','Île-de-France'],['95','Val-d\'Oise','Île-de-France']] },
        };
        function rcRefValuesSql(refKey) {
            const R2 = RC_REFS[refKey]; if (!R2) return null;
            return `(VALUES ${R2.rows.map(r => `(${r.map(v => sqlLiteral(v)).join(', ')})`).join(', ')}) ref(${R2.cols.map(sqlIdent).join(', ')})`;
        }
        const RC_CLEAN = { trim: 'espaces début/fin', upper: 'MAJUSCULES', lower: 'minuscules', noaccents: 'sans accents', squeeze: 'espaces multiples → un seul' };
        let rcState = { openId: null, preview: null };
        function rcList() { return state.recipes = state.recipes || []; }
        function rcAdd() { const r = { id: 'rc_' + generateId(), name: 'Nouvelle préparation', src: '', out: '', steps: [] }; rcList().push(r); rcState.openId = r.id; persistAppState(); renderRecipes(); }
        function rcById(id) { return rcList().find(x => x.id === id); }
        function rcSet(id, f, v) { const r = rcById(id); if (!r) return; r[f] = v; if (f === 'src' && !r.out) r.out = 'PROPRE_' + String(v).replace(/\.[^.]+$/, ''); persistAppState(); if (f === 'src') renderRecipes(); }
        function rcDel(id) { state.recipes = rcList().filter(x => x.id !== id); persistAppState(); renderRecipes(); }
        function rcAddStep(id, type) { const r = rcById(id); if (!r) return; r.steps.push({ id: 'st_' + generateId(), type, enabled: true, p: {} }); persistAppState(); renderRecipes(); }
        function rcSetStep(id, sid, f, v) { const r = rcById(id); const st = r && r.steps.find(x => x.id === sid); if (!st) return; if (f.startsWith('p.')) st.p[f.slice(2)] = v; else st[f] = v; persistAppState(); if (f === 'enabled' || f === 'type') renderRecipes(); }
        function rcDelStep(id, sid) { const r = rcById(id); if (!r) return; r.steps = r.steps.filter(x => x.id !== sid); persistAppState(); renderRecipes(); }
        function rcMoveStep(id, sid, dir) { const r = rcById(id); if (!r) return; const i = r.steps.findIndex(x => x.id === sid); const j = i + dir; if (i < 0 || j < 0 || j >= r.steps.length) return; const [st] = r.steps.splice(i, 1); r.steps.splice(j, 0, st); persistAppState(); renderRecipes(); }
        // SQL d'une recette, jusqu'à l'étape uptoIdx incluse (déterministe : même entrée -> même sortie).
        function rcBuildSql(r, uptoIdx) {
            const t = tableByName(r.src); if (!t || t.status !== 'ready') throw new Error(`La source "${r.src}" n'est pas chargée.`);
            let sql = `SELECT * EXCLUDE (__rn) FROM ${sqlIdent(duckTableName(t.id))}`;
            const steps = r.steps.filter(st => st.enabled);
            const upto = uptoIdx == null ? steps.length : Math.min(uptoIdx + 1, steps.length);
            for (let i = 0; i < upto; i++) {
                const st = steps[i]; const P = st.p || {}; const c = P.col ? sqlIdent(P.col) : null; const raw = c ? `CAST(${c} AS VARCHAR)` : null;
                switch (st.type) {
                    case 'filter': { const f = P.col && P.op ? qualCondSql({ col: P.col, op: P.op, val: P.val || '' }) : ''; if (f) sql = `SELECT * FROM (\n${sql}\n) q WHERE ${f}`; break; }
                    case 'clean': { if (!c) break; const A = P.action || 'trim';
                        const ex = A === 'trim' ? `TRIM(${raw})` : A === 'upper' ? `UPPER(${raw})` : A === 'lower' ? `LOWER(${raw})` : A === 'noaccents' ? `strip_accents(${raw})` : `regexp_replace(TRIM(${raw}), ' +', ' ', 'g')`;
                        sql = `SELECT * REPLACE (${ex} AS ${c}) FROM (\n${sql}\n) q`; break; }
                    case 'normalize': { if (!c || !P.fmt) break; const ne = tdNormExpr(P.fmt, raw); if (!ne) break;
                        sql = `SELECT * REPLACE (COALESCE(${ne}, ${raw}) AS ${c}) FROM (\n${sql}\n) q`; break; }
                    case 'calc': { if (!P.name || !String(P.formula || '').trim()) break;
                        sql = `SELECT *, (${tdFormulaSql(P.formula)}) AS ${sqlIdent(P.name)} FROM (\n${sql}\n) q`; break; }
                    case 'dedup': { const keys = String(P.keys || '').split(';').map(x => x.trim()).filter(Boolean); if (!keys.length) break;
                        const k = keys.map(k2 => `COALESCE(UPPER(TRIM(CAST(${sqlIdent(k2)} AS VARCHAR))), '')`).join(` || chr(1) || `);
                        sql = `SELECT * FROM (\n${sql}\n) q QUALIFY row_number() OVER (PARTITION BY ${k} ORDER BY md5(CAST(q AS VARCHAR))) = 1`; break; }
                    case 'std': { if (!c) break;
                        if ((P.what || 'phone') === 'phone') {
                            // Téléphone FR -> format international +33 : chiffres seuls, 0XXXXXXXXX -> +33XXXXXXXXX.
                            const digits = `regexp_replace(${raw}, '[^0-9]', '', 'g')`;
                            sql = `SELECT * REPLACE (CASE WHEN ${c} IS NULL OR TRIM(${raw}) = '' THEN ${raw} WHEN length(${digits}) = 10 AND substr(${digits}, 1, 1) = '0' THEN '+33' || substr(${digits}, 2) WHEN length(${digits}) = 11 AND substr(${digits}, 1, 2) = '33' THEN '+' || ${digits} WHEN length(${digits}) = 13 AND substr(${digits}, 1, 4) = '0033' THEN '+33' || substr(${digits}, 5) WHEN substr(TRIM(${raw}), 1, 1) = '+' THEN '+' || ${digits} ELSE ${raw} END AS ${c}) FROM (\n${sql}\n) q`;
                        } else {
                            sql = `SELECT * REPLACE (LOWER(TRIM(${raw})) AS ${c}) FROM (\n${sql}\n) q`;
                        }
                        break; }
                    case 'enrich': { const R2 = RC_REFS[P.ref]; if (!c || !R2) break;
                        const vals = rcRefValuesSql(P.ref);
                        const nv = x => `NULLIF(UPPER(TRIM(CAST(${x} AS VARCHAR))), '')`;
                        const added = R2.cols.filter(c2 => c2 !== R2.key);
                        sql = `SELECT q.*, ${added.map(c2 => `ref.${sqlIdent(c2)} AS ${sqlIdent((P.prefix || '') + c2)}`).join(', ')} FROM (\n${sql}\n) q LEFT JOIN ${vals} ON ${nv('q.' + c)} = ${nv('ref.' + sqlIdent(R2.key))}`;
                        break; }
                    case 'rename': { if (!c || !String(P.to || '').trim()) break; sql = `SELECT * RENAME (${c} AS ${sqlIdent(P.to.trim())}) FROM (\n${sql}\n) q`; break; }
                    case 'drop': { const cols = String(P.cols || '').split(';').map(x => x.trim()).filter(Boolean); if (!cols.length) break;
                        sql = `SELECT * EXCLUDE (${cols.map(sqlIdent).join(', ')}) FROM (\n${sql}\n) q`; break; }
                }
            }
            return sql;
        }
        async function rcRun(id, btn) {
            const r = rcById(id); if (!r) return;
            if (!r.src) return showError('Choisissez la source à préparer.');
            if (!String(r.out || '').trim()) return showError('Donnez un nom à la table produite.');
            const clash = Object.values(state.tables).find(t => t.name === r.out && t.id !== r.targetId);
            if (clash) return showError(`Le nom "${r.out}" est déjà utilisé par une autre source/table.`);
            if (btn) btn.disabled = true;
            bgTaskStart(`Préparation « ${r.name} » en cours`);
            try {
                const { conn } = await getDB();
                const inner = rcBuildSql(r, null);
                const tId = r.targetId && state.tables[r.targetId] ? r.targetId : ('tb_' + generateId());
                if (!state.tables[tId]) { state.tables[tId] = { id: tId, name: r.out, file: null, type: 'extraction', size: 0, config: {}, headers: [], columnsMeta: {}, status: 'loading' }; state.pivotMode[tId] = 'none'; }
                const t = state.tables[tId]; t.name = r.out; t.status = 'loading';
                await duckDropTable(tId);
                await conn.query(`CREATE TABLE ${sqlIdent(duckTableName(tId))} AS SELECT row_number() OVER () AS __rn, * FROM (\n${inner}\n) f`);
                t.headers = await duckTableHeaders(tId); t.storage = 'table'; t.sampleData = await duckSampleRows(tId, 6); t.status = 'ready';
                const cRes = await conn.query(`SELECT COUNT(*)::BIGINT AS n FROM ${sqlIdent(duckTableName(tId))}`);
                r.lastRows = Number(arrowResultToObjects(cRes)[0].n); r.lastAt = Date.now(); r.targetId = tId;
                // E8 : taux d'appariement de chaque étape d'enrichissement (rapport de correspondance).
                for (const st of r.steps.filter(s2 => s2.enabled && s2.type === 'enrich' && (s2.p || {}).ref && (s2.p || {}).col)) {
                    try { const R2 = RC_REFS[st.p.ref]; const added = R2.cols.filter(c2 => c2 !== R2.key)[0];
                        const mRes = await conn.query(`SELECT COUNT(*)::BIGINT AS n, SUM(CASE WHEN ${sqlIdent((st.p.prefix || '') + added)} IS NOT NULL THEN 1 ELSE 0 END)::BIGINT AS m FROM ${sqlIdent(duckTableName(tId))} WHERE ${sqlIdent(st.p.col)} IS NOT NULL AND TRIM(CAST(${sqlIdent(st.p.col)} AS VARCHAR)) <> ''`);
                        const o2 = arrowResultToObjects(mRes)[0];
                        st.lastMatch = Number(o2.n) ? Math.round(100 * Number(o2.m) / Number(o2.n)) : 100;
                    } catch (e2) { st.lastMatch = null; }
                }
                // Journalisation lineage : la table produite est alimentée par la source.
                state.governance.lineage[r.out] = { from: [r.src] };
                renderTables(); updateBaseTableSelect(); populateQualTables();
                try { await persistTableData(tId); } catch (e2) {}
                persistAppState(); renderRecipes();
                bgTaskEnd(`🧹 Préparation « ${r.name} » : table propre « ${r.out} » produite (${r.lastRows.toLocaleString('fr-FR')} lignes).`);
                try { await qrAutoRun(r.out); } catch (e2) {}
            } catch (e) { bgTaskEnd(); showError('Préparation impossible : ' + e.message); }
            finally { if (btn) btn.disabled = false; }
        }
        async function rcAutoRun(srcName) { for (const r of rcList().filter(x => x.src === srcName && x.steps.length)) { try { await rcRun(r.id, null); } catch (e) { console.warn('Préparation auto :', e); } } }
        async function rcPreview(id, uptoIdx) {
            const r = rcById(id); if (!r) return;
            try {
                const { conn } = await getDB();
                const res = await conn.query(`SELECT * FROM (\n${rcBuildSql(r, uptoIdx)}\n) p LIMIT 8`);
                const rows = arrowResultToObjects(res);
                const box = el('rcPreview-' + id); if (!box) return;
                if (!rows.length) { box.innerHTML = '<p class="text-[11px] text-slate-400 italic p-2">Aucune ligne après cette étape.</p>'; return; }
                const cols = Object.keys(rows[0]);
                box.innerHTML = `<div class="text-[10px] font-bold text-teal-700 mb-1">Aperçu après l'étape ${uptoIdx == null ? 'finale' : uptoIdx + 1} (8 premières lignes)</div>
                    <div class="border border-slate-200 rounded overflow-x-auto"><table class="w-full text-left text-[10px]"><thead class="bg-slate-50 font-bold"><tr>${cols.map(c2 => `<th class="p-1 whitespace-nowrap">${escapeHTML(c2)}</th>`).join('')}</tr></thead>
                    <tbody>${rows.map(rw => `<tr class="border-t border-slate-100">${cols.map(c2 => `<td class="p-1 whitespace-nowrap max-w-[160px] truncate">${escapeHTML(rw[c2] == null ? '' : String(rw[c2]))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
            } catch (e) { const box = el('rcPreview-' + id); if (box) box.innerHTML = `<p class="text-[11px] text-red-600 p-2">Aperçu impossible : ${escapeHTML(e.message)}</p>`; }
        }
        function rcExport() {
            const blob = new Blob([JSON.stringify({ kind: 'studio-data-recipes', recipes: rcList().map(r => { const c2 = { ...r }; delete c2.targetId; return c2; }) }, null, 2)], { type: 'application/json' });
            const a2 = document.createElement('a'); a2.href = URL.createObjectURL(blob); a2.download = `Preparations_${Date.now()}.json`; document.body.appendChild(a2); a2.click(); a2.remove();
        }
        function rcImport(inputEl) {
            const f = inputEl.files && inputEl.files[0]; if (!f) return;
            const rd = new FileReader();
            rd.onload = () => { try {
                const j = JSON.parse(rd.result); const list = j && j.kind === 'studio-data-recipes' ? j.recipes : (Array.isArray(j) ? j : null);
                if (!list) throw new Error('fichier non reconnu.');
                let n = 0; list.forEach(r => { if (r && r.id && r.steps) { r.id = 'rc_' + generateId(); delete r.targetId; rcList().push(r); n++; } });
                persistAppState(); renderRecipes(); showSuccess(`🧹 ${n} préparation(s) importée(s).`);
            } catch (e) { showError('Import impossible : ' + e.message); } };
            rd.readAsText(f); inputEl.value = '';
        }
        function rcStepParamsHtml(r, st) {
            const t = tableByName(r.src); const hs = t ? t.headers : [];
            const P = st.p || {};
            const colSel = (f, cur) => `<select onchange="rcSetStep('${r.id}','${st.id}','${f}',this.value)" class="border border-slate-200 rounded px-1 py-0.5 text-[11px] bg-white max-w-[130px]"><option value="">— colonne —</option>${hs.map(h => `<option value="${escapeHTML(h)}" ${cur === h ? 'selected' : ''}>${escapeHTML(h)}</option>`).join('')}</select>`;
            const inp = (f, cur, ph, w) => `<input type="text" value="${escapeHTML(cur == null ? '' : String(cur))}" onchange="rcSetStep('${r.id}','${st.id}','p.${f}',this.value)" placeholder="${ph}" class="border border-slate-200 rounded px-1.5 py-0.5 text-[11px] ${w || 'w-32'}">`;
            switch (st.type) {
                case 'filter': return colSel('p.col', P.col) + ` <select onchange="rcSetStep('${r.id}','${st.id}','p.op',this.value)" class="border border-slate-200 rounded px-1 py-0.5 text-[11px] bg-white">${QUAL_FILTER_OPS.map(o => `<option value="${o.v}" ${P.op === o.v ? 'selected' : ''}>${o.t}</option>`).join('')}</select> ` + inp('val', P.val, 'valeur');
                case 'clean': return colSel('p.col', P.col) + ` <select onchange="rcSetStep('${r.id}','${st.id}','p.action',this.value)" class="border border-slate-200 rounded px-1 py-0.5 text-[11px] bg-white">${Object.entries(RC_CLEAN).map(([k, l]) => `<option value="${k}" ${(P.action || 'trim') === k ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
                case 'normalize': return colSel('p.col', P.col) + ` <select onchange="rcSetStep('${r.id}','${st.id}','p.fmt',this.value)" class="border border-slate-200 rounded px-1 py-0.5 text-[11px] bg-white"><option value="">— format —</option><option value="date" ${P.fmt === 'date' ? 'selected' : ''}>date → AAAA-MM-JJ</option><option value="dec" ${P.fmt === 'dec' ? 'selected' : ''}>décimal (1 234,5 → 1234.5)</option><option value="int" ${P.fmt === 'int' ? 'selected' : ''}>entier</option><option value="code" ${P.fmt === 'code' ? 'selected' : ''}>code (MAJ, sans espaces)</option><option value="bool" ${P.fmt === 'bool' ? 'selected' : ''}>booléen</option></select>`;
                case 'calc': return inp('name', P.name, 'nom de la colonne', 'w-36') + ' = ' + inp('formula', P.formula, 'ex : [PRIX] * [QTE]', 'w-64');
                case 'dedup': return 'clé : ' + inp('keys', P.keys, 'colonnes séparées par ;', 'w-56');
                case 'std': return colSel('p.col', P.col) + ` <select onchange="rcSetStep('${r.id}','${st.id}','p.what',this.value)" class="border border-slate-200 rounded px-1 py-0.5 text-[11px] bg-white"><option value="phone" ${(P.what || 'phone') === 'phone' ? 'selected' : ''}>téléphone → +33…</option><option value="email" ${P.what === 'email' ? 'selected' : ''}>email → minuscules</option></select>`;
                case 'enrich': return colSel('p.col', P.col) + ` <select onchange="rcSetStep('${r.id}','${st.id}','p.ref',this.value)" class="border border-slate-200 rounded px-1 py-0.5 text-[11px] bg-white"><option value="">— référentiel —</option>${Object.entries(RC_REFS).map(([k, R2]) => `<option value="${k}" ${P.ref === k ? 'selected' : ''}>${R2.label}</option>`).join('')}</select> préfixe ` + inp('prefix', P.prefix, 'REF_', 'w-16') + (st.lastMatch != null ? ` <span class="text-[10px] font-bold ${st.lastMatch >= 90 ? 'text-emerald-600' : 'text-amber-600'}">${st.lastMatch} % appariés</span>` : '');
                case 'rename': return colSel('p.col', P.col) + ' → ' + inp('to', P.to, 'nouveau nom', 'w-36');
                case 'drop': return inp('cols', P.cols, 'colonnes à supprimer, séparées par ;', 'w-72');
                default: return '';
            }
        }
        function renderRecipes() {
            const c = el('rcContent'); if (!c) return;
            const tables = Object.values(state.tables).filter(t => t.status === 'ready' && t.type !== 'designed');
            let html = `<details class="bg-teal-50/50 border border-teal-200 rounded-xl mb-4" ${rcList().length ? '' : 'open'}>
                <summary class="px-4 py-2.5 cursor-pointer text-[12.5px] font-bold text-teal-800 list-none">💡 À quoi sert la préparation de données ? <span class="font-normal text-teal-600 text-[10.5px]">— cliquer pour ouvrir / fermer</span></summary>
                <div class="px-4 pb-4 text-[12px] text-slate-600 space-y-2">
                    <p><strong>Le problème.</strong> Vos fichiers arrivent souvent « sales » : doublons, majuscules/minuscules mélangées, espaces parasites, lignes de test… Et à chaque nouvelle version du fichier, il faut refaire le même nettoyage à la main.</p>
                    <p><strong>La solution.</strong> Décrivez le nettoyage <strong>une seule fois</strong>, comme une liste d'étapes ordonnées. Studio Data fabrique une <strong>nouvelle table propre</strong> — votre source d'origine n'est jamais modifiée — et <strong>rejoue automatiquement ces étapes</strong> chaque fois que la source est mise à jour.</p>
                    <div class="bg-white border border-teal-100 rounded-lg p-2.5 text-[11.5px] flex items-center gap-2 flex-wrap">
                        <span class="font-bold">Exemple :</span> <span class="inline-flex items-center bg-teal-50 border border-teal-200 text-teal-800 rounded-full px-2 py-0.5 font-semibold whitespace-nowrap">📥 CLIENTS.csv</span> <span class="text-slate-300">→</span> <span class="inline-flex items-center bg-teal-50 border border-teal-200 text-teal-800 rounded-full px-2 py-0.5 font-semibold whitespace-nowrap">① Filtrer les lignes de test</span> <span class="text-slate-300">→</span> <span class="inline-flex items-center bg-teal-50 border border-teal-200 text-teal-800 rounded-full px-2 py-0.5 font-semibold whitespace-nowrap">② E-mails en minuscules</span> <span class="text-slate-300">→</span> <span class="inline-flex items-center bg-teal-50 border border-teal-200 text-teal-800 rounded-full px-2 py-0.5 font-semibold whitespace-nowrap">③ Dédoublonner sur ID</span> <span class="text-slate-300">→</span> <span class="inline-flex items-center bg-teal-50 border border-teal-200 text-teal-800 rounded-full px-2 py-0.5 font-semibold whitespace-nowrap">🧹 PROPRE_CLIENTS</span>
                    </div>
                    <ul class="space-y-1">
                        <li>• La table propre s'utilise <strong>partout</strong> (extraction, statistiques, objets métier, règles qualité…) comme n'importe quelle source.</li>
                        <li>• <strong>Même entrée → même sortie</strong> : le résultat est reproductible, et le lien source → table propre est tracé dans le lineage.</li>
                        <li>• Le bouton 👁 montre l'effet de chaque étape <strong>avant</strong> d'exécuter quoi que ce soit.</li>
                    </ul>
                </div>
            </details>
            <div class="flex items-center gap-2 mb-4 flex-wrap">
                <button onclick="rcAdd()" class="bg-teal-600 hover:bg-teal-700 text-white font-bold py-2 px-4 rounded-lg text-sm">+ Préparation</button>
                <span class="flex-grow"></span>
                <button onclick="rcExport()" class="text-xs bg-white border border-slate-300 px-3 py-1.5 rounded-lg font-bold text-slate-600">⬇ Exporter (JSON)</button>
                <button onclick="el('rcImportFile').click()" class="text-xs bg-white border border-slate-300 px-3 py-1.5 rounded-lg font-bold text-slate-600">⬆ Importer</button>
                <input type="file" id="rcImportFile" accept=".json" class="hidden" onchange="rcImport(this)">
            </div>`;
            if (!rcList().length) html += emptyStateHtml('🧹', 'Aucune préparation pour le moment',
                'Une préparation enchaîne des étapes de nettoyage (filtrer, standardiser, dédoublonner, enrichir…) et produit une table propre, refaite automatiquement à chaque mise à jour de la source.',
                '+ Créer ma première préparation', 'rcAdd()');
            rcList().forEach(r => {
                const open = rcState.openId === r.id;
                html += `<details class="border border-teal-200 rounded-xl bg-white mb-3 group" ${open ? 'open' : ''}>
                    <summary class="bg-teal-50/60 px-4 py-2.5 cursor-pointer flex items-center gap-2 flex-wrap list-none" onclick="rcState.openId='${r.id}'">
                        <span class="text-teal-400 group-open:rotate-90 transition-transform">▶</span>
                        <input type="text" value="${escapeHTML(r.name)}" onclick="event.stopPropagation()" onchange="rcSet('${r.id}','name',this.value)" class="font-bold text-sm border border-teal-200 p-1 rounded bg-white w-56">
                        <span class="text-[11px] text-slate-500">📥 ${escapeHTML(r.src || '?')} → 🧹 <strong>${escapeHTML(r.out || '?')}</strong> · ${r.steps.length} étape(s)</span>
                        ${r.lastAt ? `<span class="text-[10px] text-emerald-600 font-bold">✔ ${new Date(r.lastAt).toLocaleString('fr-FR')} · ${(r.lastRows || 0).toLocaleString('fr-FR')} lignes</span>` : ''}
                        <span class="ml-auto"></span>
                        <button onclick="event.preventDefault(); rcRun('${r.id}', this)" class="bg-teal-600 text-white text-xs font-bold px-3 py-1 rounded">▶ Exécuter</button>
                        <button onclick="event.preventDefault(); rcDel('${r.id}')" class="text-red-400 hover:text-red-600 font-bold px-1">✕</button>
                    </summary>
                    <div class="p-4">
                        <div class="flex items-center gap-2 mb-3 flex-wrap text-xs">
                            <span class="font-bold text-slate-500">Source</span>
                            <select onchange="rcSet('${r.id}','src',this.value)" class="border border-slate-300 rounded p-1.5 bg-white"><option value="">— source —</option>${tables.map(t => `<option value="${escapeHTML(t.name)}" ${r.src === t.name ? 'selected' : ''}>${escapeHTML(t.name)}</option>`).join('')}</select>
                            <span class="font-bold text-slate-500">Table produite</span>
                            <input type="text" value="${escapeHTML(r.out || '')}" onchange="rcSet('${r.id}','out',this.value)" class="border border-slate-300 rounded p-1.5 w-52 font-bold">
                        </div>
                        ${r.steps.map((st, i) => `<div class="flex items-center gap-1.5 mb-1.5 flex-wrap ${st.enabled ? '' : 'opacity-40'}">
                            <span class="w-5 h-5 rounded-full bg-teal-600 text-white text-[10px] font-black flex items-center justify-center">${i + 1}</span>
                            <input type="checkbox" ${st.enabled ? 'checked' : ''} onchange="rcSetStep('${r.id}','${st.id}','enabled',this.checked)" title="Étape active" class="w-3.5 h-3.5 rounded text-teal-600">
                            <select onchange="rcSetStep('${r.id}','${st.id}','type',this.value)" class="border border-slate-200 rounded px-1 py-0.5 text-[11px] bg-white font-bold">${Object.entries(RC_STEPS).map(([k, l]) => `<option value="${k}" ${st.type === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
                            ${rcStepParamsHtml(r, st)}
                            <span class="ml-auto"></span>
                            <button onclick="rcPreview('${r.id}',${i})" class="text-[10px] bg-white border border-teal-200 text-teal-700 px-1.5 py-0.5 rounded font-bold" title="Aperçu après cette étape">👁</button>
                            <button onclick="rcMoveStep('${r.id}','${st.id}',-1)" class="text-slate-300 hover:text-teal-600 font-black text-[10px]">▲</button>
                            <button onclick="rcMoveStep('${r.id}','${st.id}',1)" class="text-slate-300 hover:text-teal-600 font-black text-[10px]">▼</button>
                            <button onclick="rcDelStep('${r.id}','${st.id}')" class="text-slate-300 hover:text-red-500 font-bold">✕</button>
                        </div>`).join('')}
                        <div class="flex items-center gap-1.5 flex-wrap mt-2">
                            <span class="text-[10px] uppercase font-bold text-slate-400">+ étape :</span>
                            ${Object.entries(RC_STEPS).map(([k, l]) => `<button onclick="rcAddStep('${r.id}','${k}')" class="text-[11px] bg-white border border-slate-300 rounded px-2 py-0.5 font-bold text-slate-600 hover:bg-teal-50">${l}</button>`).join('')}
                        </div>
                        <div id="rcPreview-${r.id}" class="mt-3"></div>
                        <p class="text-[10px] text-slate-400 mt-2">La préparation est rejouée automatiquement quand « ${escapeHTML(r.src || 'la source')} » est mise à jour · la table propre apparaît dans les Sources et le lineage · même entrée → même sortie.</p>
                    </div>
                </details>`;
            });
            c.innerHTML = html;
        }

        // ---- v3.8 : auto-complétion sur les listes déroulantes longues ----
        // Sur toute liste d'au moins 8 choix : tapez des lettres (accents ignorés, recherche
        // « commence par » puis « contient ») — la sélection saute sur la correspondance, un badge
        // montre la saisie. Entrée/Tab/clic ailleurs valide, Échap annule, Retour arrière corrige.
        const COMBO_MIN_OPTS = 8;
        let _cbSel = null, _cbQ = '', _cbOrig = null, _cbBadge = null;
        const cbNorm = s2 => String(s2).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        function cbShowBadge(sel) {
            if (!_cbBadge) { _cbBadge = document.createElement('div'); _cbBadge.id = 'comboBadge'; _cbBadge.setAttribute('role', 'status'); document.body.appendChild(_cbBadge); }
            const rct = sel.getBoundingClientRect();
            _cbBadge.style.cssText = 'position:fixed;left:' + Math.round(rct.left) + 'px;top:' + Math.round(Math.max(2, rct.top - 27)) + 'px;z-index:10000;background:#0f172a;color:#fff;font:bold 11px system-ui;padding:3px 9px;border-radius:6px;box-shadow:0 2px 8px rgba(0,0,0,.25);pointer-events:none;max-width:340px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
            return _cbBadge;
        }
        function cbReset(commit) {
            const sel = _cbSel, orig = _cbOrig;
            if (_cbBadge) { _cbBadge.remove(); _cbBadge = null; }
            _cbSel = null; _cbQ = ''; _cbOrig = null;
            if (commit && sel && orig !== null && sel.value !== orig) sel.dispatchEvent(new Event('change', { bubbles: true }));
        }
        function cbApply(sel) {
            const q = cbNorm(_cbQ);
            const opts = Array.from(sel.options).filter(o => o.value !== '' && !o.disabled);
            const hit = opts.find(o => cbNorm(o.textContent).startsWith(q)) || opts.find(o => cbNorm(o.textContent).includes(q));
            cbShowBadge(sel).textContent = '🔍 ' + _cbQ + (hit ? ' → ' + hit.textContent.trim() : ' — aucune correspondance');
            if (hit) sel.value = hit.value;
        }
        document.addEventListener('keydown', e => {
            const sel = document.activeElement;
            if (!sel || sel.tagName !== 'SELECT' || (sel.options || []).length < COMBO_MIN_OPTS) return;
            if (e.key === 'Enter' || e.key === 'Tab') { if (_cbSel === sel) cbReset(true); return; }
            if (e.key === 'Escape') { if (_cbSel === sel) { if (_cbOrig !== null) sel.value = _cbOrig; cbReset(false); e.stopPropagation(); } return; }
            if (e.key === 'Backspace') { if (_cbSel === sel && _cbQ) { e.preventDefault(); _cbQ = _cbQ.slice(0, -1); if (_cbQ) cbApply(sel); else cbShowBadge(sel).textContent = '🔍 tapez pour chercher…'; } return; }
            if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;
            e.preventDefault();
            if (_cbSel !== sel) { _cbSel = sel; _cbQ = ''; _cbOrig = sel.value; }
            _cbQ += e.key;
            cbApply(sel);
        }, true);
        document.addEventListener('focusout', e => { if (e.target === _cbSel) cbReset(true); }, true);

