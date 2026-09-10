        // ======================= E6 (V2) : CLASSIFICATION DE SENSIBILITÉ & ANONYMISATION =======================
        const PV_LEVELS = { public: ['🟢', 'Public'], interne: ['🔵', 'Interne'], confidentiel: ['🟠', 'Confidentiel'], personnel: ['🔴', 'Données personnelles'] };
        const PV_ACTIONS = { none: 'aucune (en clair)', mask: 'masquage (1er caractère + •••)', pseudo: 'pseudonymisation (jeton stable salé)', generalize: 'généralisation (tranches / année)', drop: 'suppression de la colonne' };
        function pvCfg() { const g = state.governance; g.privacy = g.privacy || { levels: {}, actions: { personnel: 'pseudo', confidentiel: 'mask', interne: 'none', public: 'none' } }; g.privacy.levels = g.privacy.levels || {}; g.privacy.actions = g.privacy.actions || { personnel: 'pseudo', confidentiel: 'mask', interne: 'none', public: 'none' }; return g.privacy; }
        // Niveau proposé automatiquement : classification déjà saisie > sensibilité du dictionnaire > détection PII par nom.
        function pvSuggestLevel(tn, col) {
            const dictCol = ((state.governance.dictionary[tn] || {}).columns || {})[col] || {};
            if (dictCol.sensitivity === 'Personnel (RGPD)') return 'personnel';
            if (dictCol.sensitivity === 'Sensible') return 'confidentiel';
            if (dictCol.sensitivity === 'Public') return 'public';
            try { if ((typeof PII_HEADER_RX !== 'undefined' && PII_HEADER_RX.test(col)) || /naiss|birthd/i.test(col)) return 'personnel'; } catch (e) {}
            return 'interne';
        }
        function pvLevelOf(tn, col) { const lv = (pvCfg().levels[tn] || {})[col]; return lv || pvSuggestLevel(tn, col); }
        function pvSetLevel(tn, col, v) { const P = pvCfg(); (P.levels[tn] = P.levels[tn] || {})[col] = v; persistAppState(); renderGovernance(); }
        function pvSetAction(level, v) { pvCfg().actions[level] = v; persistAppState(); renderGovernance(); }
        // Expression SQL anonymisée d'une colonne (sel de session : jeton stable AU SEIN d'un export).
        function pvAnonExpr(tn, col, action, salt) {
            const c = sqlIdent(col); const raw = `CAST(${c} AS VARCHAR)`;
            switch (action) {
                case 'mask': return `CASE WHEN ${c} IS NULL OR TRIM(${raw}) = '' THEN NULL ELSE substr(TRIM(${raw}), 1, 1) || '•••' END AS ${c}`;
                case 'pseudo': return `CASE WHEN ${c} IS NULL OR TRIM(${raw}) = '' THEN NULL ELSE 'P_' || substr(md5(${sqlLiteral(salt)} || UPPER(TRIM(${raw}))), 1, 12) END AS ${c}`;
                case 'generalize': {
                    if (covColIsDate(null, col)) { const d = `COALESCE(TRY_CAST(${tdNormExpr('date', raw)} AS DATE), CAST(TRY_CAST(${raw} AS TIMESTAMP) AS DATE))`; return `CAST(YEAR(${d}) AS VARCHAR) AS ${c}`; }
                    const num = `TRY_CAST(REPLACE(${raw}, ',', '.') AS DOUBLE)`;
                    return `CASE WHEN ${num} IS NULL THEN NULL ELSE CAST(CAST(floor(${num} / 10) * 10 AS BIGINT) AS VARCHAR) || '–' || CAST(CAST(floor(${num} / 10) * 10 + 10 AS BIGINT) AS VARCHAR) END AS ${c}`;
                }
                default: return null;
            }
        }
        function pvPlan(tn) {
            const t = tableByName(tn); if (!t) return [];
            const acts = pvCfg().actions;
            return t.headers.map(col => { const level = pvLevelOf(tn, col); const action = acts[level] || 'none'; return { col, level, action }; });
        }
        async function pvExport(btn) {
            const tn = el('pvTable') ? el('pvTable').value : ''; const t = tableByName(tn);
            if (!t) return showError('Choisissez une table.');
            const plan = pvPlan(tn);
            const salt = Array.from(crypto.getRandomValues(new Uint8Array(16))).map(x => x.toString(16).padStart(2, '0')).join('');
            const sel = plan.filter(p2 => p2.action !== 'drop').map(p2 => pvAnonExpr(tn, p2.col, p2.action, salt) || sqlIdent(p2.col));
            if (!sel.length) return showError('Toutes les colonnes sont supprimées — rien à exporter.');
            if (btn) btn.disabled = true;
            bgTaskStart('Export anonymisé en cours');
            const tmp = 'pvx_' + generateId();
            try {
                const { conn } = await getDB();
                await conn.query(`CREATE TABLE ${sqlIdent(duckTableName(tmp))} AS SELECT row_number() OVER () AS __rn, ${sel.join(', ')} FROM ${sqlIdent(duckTableName(t.id))}`);
                const headers = await duckTableHeaders(tmp);
                const parts = [headers.map(escapeCSV).join(';') + '\n']; let buf = [];
                await duckStreamRows(tmp, 0, async (row) => { buf.push(headers.map(h => escapeCSV(row[h])).join(';')); if (buf.length >= 5000) { parts.push(buf.join('\n') + '\n'); buf = []; } });
                if (buf.length) parts.push(buf.join('\n') + '\n');
                const blob = new Blob(['\ufeff', ...parts], { type: 'text/csv;charset=utf-8;' });
                const a2 = document.createElement('a'); a2.href = URL.createObjectURL(blob); a2.download = `${tn.replace(/[^a-zA-Z0-9]/g, '_')}_ANONYMISE_${Date.now()}.csv`; document.body.appendChild(a2); a2.click(); a2.remove();
                // Rapport de transformation
                const rep2 = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>Rapport d'anonymisation</title></head><body style="font-family:system-ui;padding:24px">
                    <h1 style="font-size:18px">🔐 Rapport d'anonymisation — ${escapeHTML(tn)}</h1>
                    <p style="font-size:12px;color:#64748b">Généré le ${new Date().toLocaleString('fr-FR')} · pseudonymisation stable au sein de cet export (sel de session, non conservé) · traitement 100 % local.</p>
                    <table style="border-collapse:collapse;font-size:12px">${'<tr><th style="text-align:left;padding:6px;border-bottom:2px solid #334155">Colonne</th><th style="text-align:left;padding:6px;border-bottom:2px solid #334155">Classification</th><th style="text-align:left;padding:6px;border-bottom:2px solid #334155">Règle appliquée</th></tr>'}
                    ${plan.map(p2 => `<tr><td style="padding:5px;border-bottom:1px solid #e2e8f0"><code>${escapeHTML(p2.col)}</code></td><td style="padding:5px;border-bottom:1px solid #e2e8f0">${PV_LEVELS[p2.level][0]} ${PV_LEVELS[p2.level][1]}</td><td style="padding:5px;border-bottom:1px solid #e2e8f0">${PV_ACTIONS[p2.action]}</td></tr>`).join('')}</table></body></html>`;
                const b2 = new Blob([rep2], { type: 'text/html' });
                const a3 = document.createElement('a'); a3.href = URL.createObjectURL(b2); a3.download = `${tn.replace(/[^a-zA-Z0-9]/g, '_')}_RAPPORT_ANONYMISATION_${Date.now()}.html`; document.body.appendChild(a3); a3.click(); a3.remove();
                bgTaskEnd(`🔐 Export anonymisé de « ${tn} » téléchargé, accompagné de son rapport.`);
            } catch (e) { bgTaskEnd(); showError('Export anonymisé impossible : ' + e.message); }
            finally { try { await duckDropTable(tmp); } catch (e2) {} if (btn) btn.disabled = false; }
        }
        function renderGovPrivacy() {
            const tables = Object.values(state.tables).filter(t => t.status === 'ready');
            if (!tables.length) return '<p class="text-sm text-slate-400 italic py-8 text-center">Chargez des sources pour classifier leurs colonnes.</p>';
            if (!govState.pvTable || !tableByName(govState.pvTable)) govState.pvTable = tables[0].name;
            const tn = govState.pvTable; const acts = pvCfg().actions;
            const plan = pvPlan(tn);
            const nPerso = plan.filter(p2 => p2.level === 'personnel').length;
            return `<p class="text-sm text-slate-500 mb-4">Classez chaque colonne (pré-rempli depuis la détection RGPD et le dictionnaire), choisissez l'action par niveau, puis exportez un <strong>jeu anonymisé partageable</strong> avec son rapport. La pseudonymisation est <strong>stable au sein d'un export</strong> (même valeur → même jeton) grâce à un sel de session jamais conservé.</p>
            <div class="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
                ${Object.entries(PV_LEVELS).map(([k, [ic, lbl]]) => `<div class="border border-slate-200 rounded-lg p-2.5 bg-slate-50/50"><div class="text-xs font-bold mb-1">${ic} ${lbl}</div>
                    <select onchange="pvSetAction('${k}',this.value)" class="w-full border border-slate-300 rounded p-1.5 text-[11px] bg-white">${Object.entries(PV_ACTIONS).map(([a2, l2]) => `<option value="${a2}" ${acts[k] === a2 ? 'selected' : ''}>${l2}</option>`).join('')}</select></div>`).join('')}
            </div>
            <div class="flex items-center gap-3 mb-3 flex-wrap">
                <select id="pvTable" data-ro="keep" onchange="govState.pvTable=this.value; renderGovernance()" class="border border-slate-300 p-2 rounded-lg bg-white font-bold text-sm">${tables.map(t => `<option ${t.name === tn ? 'selected' : ''}>${escapeHTML(t.name)}</option>`).join('')}</select>
                ${nPerso ? `<span class="text-xs bg-red-50 border border-red-200 text-red-700 rounded-full px-2.5 py-1 font-bold">🔴 ${nPerso} colonne(s) personnelle(s)</span>` : ''}
                <span class="flex-grow"></span>
                <button data-ro="keep" onclick="pvExport(this)" class="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold px-4 py-2 rounded-lg">🔐 Exporter le jeu anonymisé + rapport</button>
            </div>
            <div class="border border-slate-200 rounded-lg overflow-x-auto"><table class="w-full text-left text-xs">
                <thead class="bg-slate-50 text-[10px] uppercase font-bold text-slate-500"><tr><th class="p-2">Colonne</th><th class="p-2 w-56">Classification</th><th class="p-2">Règle qui s'appliquera à l'export</th></tr></thead>
                <tbody class="divide-y divide-slate-100">${plan.map(p2 => `<tr class="hover:bg-slate-50 ${p2.level === 'personnel' ? 'bg-red-50/30' : ''}">
                    <td class="p-2 font-bold font-mono">${escapeHTML(p2.col)}</td>
                    <td class="p-2"><select onchange="pvSetLevel('${escapeHTML(tn)}','${escapeHTML(p2.col.replace(/'/g, "\\'"))}',this.value)" class="border border-slate-200 rounded p-1 bg-white">${Object.entries(PV_LEVELS).map(([k, [ic, lbl]]) => `<option value="${k}" ${p2.level === k ? 'selected' : ''}>${ic} ${lbl}</option>`).join('')}</select></td>
                    <td class="p-2 ${p2.action === 'none' ? 'text-slate-400' : 'font-bold text-slate-700'}">${PV_ACTIONS[p2.action]}</td>
                </tr>`).join('')}</tbody></table></div>`;
        }

