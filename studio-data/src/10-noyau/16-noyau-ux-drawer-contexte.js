        // ======================= V3 UX : helpers visuels, barre de contexte, drawer =======================
        const meterColor = pct => pct >= 95 ? 'var(--ok)' : (pct >= 80 ? 'var(--warn)' : 'var(--bad)');
        // Affichage d'un taux SANS arrondi trompeur : 15 valeurs sur 234 279 lignes ne doit
        // jamais s'afficher « 0.0% » (qui se lit « aucune valeur ») mais « < 0,1 % ».
        function fmtPctUx(pct) {
            if (pct > 0 && pct < 0.05) return '< 0,1 %';
            if (pct < 100 && pct > 99.95) return '> 99,9 %';
            return (Math.round(pct * 10) / 10).toLocaleString('fr-FR') + ' %';
        }
        function cellMeter(pct) {
            const p2 = Math.max(0, Math.min(100, pct)); const c = meterColor(p2);
            return `<div class="meter"><div class="bar"><i style="width:${Math.max(p2 > 0 ? 1 : 0, Math.round(p2))}%;background:${c}"></i></div><span class="pct" style="color:${c};width:52px">${fmtPctUx(p2)}</span></div>`;
        }
        function cellQuality(st2, label) {
            const dot = { ok: 'var(--ok)', warn: 'var(--warn)', bad: 'var(--bad)' }[st2] || 'var(--faint)';
            const cls = { ok: 'q-ok', warn: 'q-warn', bad: 'q-bad' }[st2] || 'q-ok';
            return `<span class="qual ${cls}"><span class="dot" style="background:${dot}"></span>${escapeHTML(label)}</span>`;
        }
        function cellDist(buckets) {
            if (!buckets || !buckets.length) return '<span class="text-slate-200 text-[10px]">—</span>';
            const max = Math.max(1, ...buckets);
            return `<div class="dist" aria-hidden="true">${buckets.map(h => `<span style="height:${Math.max(8, h / max * 100)}%"></span>`).join('')}</div>`;
        }
        function uxTypeOf(sem) {
            const t2 = String(sem || '').toLowerCase();
            if (t2.includes('num')) return ['t-num', '123', 'Nombre'];
            if (t2.includes('date')) return ['t-date', 'CAL', 'Date'];
            if (t2.includes('mail')) return ['t-mail', '@', 'E-mail'];
            if (t2.includes('phone') || t2.includes('tél') || t2.includes('tel')) return ['t-tel', 'TEL', 'Téléphone'];
            if (t2.includes('ident') || t2.includes('clé') || t2.includes('key') || t2.includes('code')) return ['t-key', 'KEY', 'Clé'];
            return ['t-txt', 'ABC', 'Texte'];
        }
        function typeIconUx(sem) { const [cls, lab] = uxTypeOf(sem); return `<span class="typ ${cls}" aria-hidden="true">${lab}</span>`; }
        // Définition métier d'une colonne : glossaire (lien table.col) puis objets métier (mapping).
        function colDefFor(tableName, col) {
            const g = state.governance;
            const gl = (g.glossary || []).find(t2 => (t2.links || []).some(l => l.table === tableName && l.col === col));
            if (gl && gl.definition) return { def: gl.definition, src: 'Glossaire : ' + gl.term };
            for (const bo of (g.businessObjects || [])) {
                for (const e2 of (bo.elements || [])) {
                    if ((e2.mappings || []).some(m => m.table === tableName && m.col === col))
                        return { def: e2.definition || ('Attribut « ' + e2.name + ' » de l\'objet métier « ' + bo.name + ' ».'), src: 'Objet métier : ' + bo.name };
                }
            }
            return null;
        }
        // État vide pédagogique : jamais un écran blanc — une consigne + une action.
        function emptyStateHtml(em, title, text, ctaLabel, ctaOnclick) {
            return `<div class="empty-ux"><div class="em" aria-hidden="true">${em}</div><div class="ti">${escapeHTML(title)}</div><div class="tx">${escapeHTML(text)}</div>${ctaLabel ? `<button onclick="${ctaOnclick}" class="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2.5 rounded-lg">${escapeHTML(ctaLabel)}</button>` : ''}</div>`;
        }
        function fmtBadgeUx(t) {
            const k = t.type === 'designed' ? ['built', 'CONÇUE'] : (t.type === 'extraction' ? ['extr', 'EXTR.'] : (t.type === 'api' ? ['api', 'API'] : (t.type === 'xlsx' || /xls/i.test(t.type || '') ? ['xlsx', 'XLSX'] : (t.type === 'json' ? ['json', 'JSON'] : (t.type === 'txt' ? ['txt', 'TXT'] : ['csv', 'CSV'])))));
            return `<span class="fmt-ux fmt-${k[0]}">${k[1]}</span>`;
        }
        // Dernière complétude moyenne connue pour une table (issue de l'historique d'audits).
        function lastAuditFor(tableName) {
            return (state.governance.qualityHistory || []).find(h => h.table === tableName) || null;
        }
        // ---- Barre de contexte persistante ----
        const _ctxRowsCache = {};
        function renderContextBar() {
            const bar = el('ctxBar'); if (!bar) return;
            let t = null;
            const CTX_SEL = { 3: 'baseTableSelect', 4: 'vizBaseTable', 5: 'expBaseTable', 6: 'browserTableSelect', 7: 'compTableA', 8: 'qualTable' };
            const selId = CTX_SEL[currentTab];
            const sel2 = selId ? el(selId) : null;
            if (sel2 && sel2.value) t = state.tables[sel2.value] || tableByName(sel2.value);
            if (!t && currentTab === 8 && currentProfilingTableId && state.tables[currentProfilingTableId]) t = state.tables[currentProfilingTableId];
            const ready = Object.values(state.tables).filter(x => x.status === 'ready');
            el('ctxSource').textContent = t ? t.name : (ready.length ? ready.length + ' source(s) chargée(s)' : 'aucune source');
            el('ctxCols').textContent = t ? String((t.headers || []).length) : '—';
            el('ctxDomain').textContent = t && String(t.theme || '').trim() ? t.theme.trim() : '—';
            if (t && t.status === 'ready') {
                const cached = _ctxRowsCache[t.id];
                el('ctxRows').textContent = typeof cached === 'number' ? cached.toLocaleString('fr-FR') : '…';
                if (cached === undefined) {
                    _ctxRowsCache[t.id] = null;
                    (async () => { try { const { conn } = await getDB(); const r = arrowResultToObjects(await conn.query(`SELECT COUNT(*)::BIGINT AS n FROM ${sqlIdent(duckTableName(t.id))}`)); _ctxRowsCache[t.id] = Number(r[0].n); renderContextBar(); } catch (e) { delete _ctxRowsCache[t.id]; el('ctxRows').textContent = '—'; } })();
                }
            } else el('ctxRows').textContent = '—';
            const ph = phaseOfTab(currentTab);
            el('ctxCrumb').innerHTML = NAV_PHASES.map((p2, i) => (p2.id === ph.id ? `<b>${escapeHTML(p2.badge + ' ' + p2.label)}</b>` : `<span>${escapeHTML(p2.badge + ' ' + p2.label)}</span>`)).join(' <span aria-hidden="true">›</span> ');
        }
        document.addEventListener('change', e => { const id = e.target && e.target.id; if (['qualTable', 'baseTableSelect', 'vizBaseTable', 'expBaseTable', 'browserTableSelect', 'compTableA'].includes(id)) renderContextBar(); });
        // ---- Drawer global (détail sans perdre le contexte) ----
        function openUxDrawer(o, row) {
            document.querySelectorAll('tr.sel').forEach(r => r.classList.remove('sel'));
            if (row) row.classList.add('sel');
            const [cls, lab] = uxTypeOf(o.sem || '');
            el('uxDrawerTyp').className = 'typ ' + cls; el('uxDrawerTyp').textContent = lab;
            el('uxDrawerTitle').textContent = o.title || '';
            el('uxDrawerSub').textContent = o.sub || '';
            el('uxDrawerBody').innerHTML = o.body || '';
            el('uxDrawerFoot').innerHTML = o.foot || '';
            el('uxDrawer').classList.add('on'); el('uxScrim').classList.add('on');
        }
        function closeUxDrawer() {
            el('uxDrawer').classList.remove('on', 'wide'); el('uxScrim').classList.remove('on');
            document.querySelectorAll('tr.sel').forEach(r => r.classList.remove('sel'));
        }
        document.addEventListener('keydown', e => { if (e.key === 'Escape') closeUxDrawer(); });
        function uxSetDensity(compact) {
            const t2 = el('uxProfilTable'); if (!t2) return;
            t2.classList.toggle('dense', !!compact);
            el('uxDensComfy').classList.toggle('on', !compact);
            el('uxDensCompact').classList.toggle('on', !!compact);
        }
        // État de qualité synthétique d'une colonne profilée (un seul code couleur partout).
        function uxColQuality(c) {
            const pct = c.completeness;
            const hyg = (c.placeholders || 0) + (c.multiSpace || 0) + (c.caseDupGroups || 0) + (c.outliers || 0);
            if (pct > 0 && pct < 0.05) return ['bad', 'quasi vide (' + Number(c.distinctCount || 0).toLocaleString('fr-FR') + ' valeur(s))'];
            if (pct < 80) return ['bad', fmtPctUx(100 - pct) + ' vides'];
            if (c.patterns && c.patterns[0] && c.patterns[0].pct < 60 && String(c.semanticType || '').toLowerCase().indexOf('num') < 0) return ['warn', 'Formats mixtes'];
            if (hyg > 0) return ['warn', hyg.toLocaleString('fr-FR') + ' à nettoyer'];
            if (pct < 95) return ['warn', (100 - pct).toFixed(0) + ' % vides'];
            return ['ok', 'Conforme'];
        }
        // Fiche de colonne dans le drawer (remplace la navigation vers un écran séparé).
        function openColumnDrawer(cName, row) {
            if (!currentProfilingStats || !currentProfilingStats.columns[cName]) return;
            const c = currentProfilingStats.columns[cName];
            const t = state.tables[currentProfilingTableId]; const tName = t ? t.name : (currentProfilingStats.tableName || '');
            const [qs, ql] = uxColQuality(c);
            const lvl = (typeof pvLevelOf === 'function' && tName) ? pvLevelOf(tName, cName) : '';
            const lvlLab = (PV_LEVELS[lvl] || ['', '—']).join(' ');
            const d = colDefFor(tName, cName);
            const dict = tName ? (state.governance.dictionary[tName] || {}) : {};
            const anoms = [];
            if (c.completeness < 100) anoms.push(`<div class="anom-ux warn"><div class="ic">◑</div><div><div class="t">${(100 - c.completeness).toFixed(1)} % de valeurs manquantes</div><div class="d">${Number(c.nullCount || 0).toLocaleString('fr-FR')} ligne(s) vide(s)</div></div></div>`);
            if (c.placeholders > 0) anoms.push(`<div class="anom-ux warn"><div class="ic">⚠️</div><div><div class="t">${Number(c.placeholders).toLocaleString('fr-FR')} valeur(s) « bouche-trou »</div><div class="d">N/A, -, ?, INCONNU…</div></div></div>`);
            if (c.caseDupGroups > 0) anoms.push(`<div class="anom-ux warn"><div class="ic">Aa</div><div><div class="t">${Number(c.caseDupGroups).toLocaleString('fr-FR')} doublon(s) de casse</div><div class="d">PARIS / Paris comptés comme différents</div></div></div>`);
            if (c.multiSpace > 0) anoms.push(`<div class="anom-ux warn"><div class="ic">␣</div><div><div class="t">${Number(c.multiSpace).toLocaleString('fr-FR')} valeur(s) avec espaces parasites</div><div class="d">Espaces multiples ou en bord de valeur</div></div></div>`);
            if (c.outliers > 0) anoms.push(`<div class="anom-ux bad"><div class="ic">✕</div><div><div class="t">${Number(c.outliers).toLocaleString('fr-FR')} valeur(s) aberrante(s)</div><div class="d">À plus de 3 écarts-types de la moyenne</div></div></div>`);
            const maxF = (c.frequentValues && c.frequentValues[0]) ? c.frequentValues[0].count : 1;
            const tops = (c.frequentValues || []).slice(0, 5).map(v => { const vv = String(v.val !== undefined ? v.val : v.value); return `<div class="row"><div class="lbl" title="${escapeHTML(vv)}">${escapeHTML(vv)}</div><div class="track"><i style="width:${Math.max(4, Math.round(100 * v.count / maxF))}%"></i></div><div class="n">${Number(v.count).toLocaleString('fr-FR')}</div></div>`; }).join('');
            const rules = (typeof qrRules === 'function' ? qrRules() : []).filter(r => r.table === tName && (r.col === cName || String((r.p || {}).cols || '').split(';').map(x => x.trim()).includes(cName)));
            const rulesHtml = rules.length ? rules.map(r => { const okR = r.last ? (r.last.fails === 0 ? 'ok' : 'ko') : 'wa'; const ic = okR === 'ok' ? '✓' : (okR === 'ko' ? '✕' : '—');
                return `<div class="rule-ux"><span class="st ${okR}">${ic}</span> ${escapeHTML(r.name)} <span class="ml-auto text-slate-400">${r.last ? (r.last.fails === 0 ? 'conforme' : r.last.fails.toLocaleString('fr-FR') + ' échec(s)') : 'jamais exécutée'}</span></div>`; }).join('')
                : '<p class="text-[11px] text-slate-400 italic">Aucune règle déclarée sur cette colonne — ajoutez-en dans « 📏 Règles & score ».</p>';
            const body = `
                <div class="dsect"><div class="kv-ux">
                    <div class="cell"><div class="k">Complétude</div><div class="v" style="color:${meterColor(c.completeness)}">${fmtPctUx(c.completeness)}</div></div>
                    <div class="cell"><div class="k">Valeurs distinctes</div><div class="v">${Number(c.distinctCount || 0).toLocaleString('fr-FR')}${c.hasMoreDistinct ? '+' : ''}</div></div>
                    <div class="cell"><div class="k">État qualité</div><div class="v" style="font-size:12.5px">${cellQuality(qs, ql)}</div></div>
                    <div class="cell"><div class="k">Sensibilité</div><div class="v" style="font-size:12.5px;color:${lvl === 'personnel' ? 'var(--bad)' : 'var(--muted)'}">${escapeHTML(lvl ? lvlLab : '—')}</div></div>
                </div></div>
                <div class="dsect"><h4>Définition métier</h4>
                    ${d ? `<div class="text-[12px] bg-slate-50 border border-slate-200 rounded-lg p-3">${escapeHTML(d.def)}<div class="text-[10px] text-slate-400 mt-1.5">${escapeHTML(d.src)}</div></div>`
                        : `<div class="text-[11px] text-slate-400 italic">Pas encore de définition — reliez cette colonne à un terme de glossaire ou un objet métier (phase ④ Gouvernance).</div>`}
                    ${dict.owner ? `<div class="text-[10.5px] text-slate-500 mt-1.5">Propriétaire de la table : <strong>${escapeHTML(dict.owner)}</strong>${dict.sourceSystem ? ' · système source : ' + escapeHTML(dict.sourceSystem) : ''}</div>` : ''}
                </div>
                <div class="dsect"><h4>Anomalies détectées</h4>${anoms.length ? anoms.join('') : '<div class="text-[12px] flex items-center gap-2" style="color:var(--ok)"><span class="st" style="width:19px;height:19px;border-radius:50%;background:var(--ok);color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:11px">✓</span> Aucune anomalie sur cette colonne.</div>'}</div>
                ${tops ? `<div class="dsect"><h4>Valeurs les plus fréquentes</h4><div class="topvals">${tops}</div></div>` : ''}
                <div class="dsect"><h4>Règles de qualité appliquées</h4>${rulesHtml}</div>`;
            const foot = `
                <button onclick="closeUxDrawer(); govState.dictTable = ${JSON.stringify('%TN%')}.tn || null; openGovTab('dictionary')" data-tn="1" class="hidden"></button>
                <button onclick="uxGoDictionary()" class="flex-1 bg-white border border-slate-300 rounded-lg py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">📖 Voir dans le dictionnaire</button>
                <button onclick="uxGoClean()" class="flex-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-2 text-xs font-bold">🧹 Nettoyer (préparation)</button>`;
            _uxDrawerCtx = { tName, cName };
            openUxDrawer({ sem: c.semanticType, title: cName, sub: `${uxTypeOf(c.semanticType)[2]} · table « ${tName} »${dict.owner ? ' · propriétaire : ' + dict.owner : ''}`, body, foot }, row);
        }
        let _uxDrawerCtx = null;
        function uxGoDictionary() { if (_uxDrawerCtx) { govState.dictTable = _uxDrawerCtx.tName; closeUxDrawer(); openGovTab('dictionary'); } }
        function uxGoClean() { closeUxDrawer(); switchTab(13); }

        function switchTab(num) {
            for (let i = 1; i <= 16; i++) { const s = el(`step-${i}`); if (s) s.classList.add('hidden'); }
            const stepEl = el(`step-${num}`); if (stepEl) stepEl.classList.remove('hidden');
            currentTab = num;
            renderNav();
            try { v7ApplyTheme(); } catch (e3) {}
            try { v7WatchIcons(); } catch (e4) {}
            try { renderContextBar(); } catch (e2) {}
            if(num===16) renderTimeSeries();
            if(num===10) renderTablesDesign();
            if(num===11) renderCockpit();
            if(num===12) renderQualityRules();
            if(num===13) renderRecipes();
            if(num===14) renderDashboards();
            if(num===15) renderLinkage();
            if(num===2){ renderRelationsList(); renderBizRules(); renderGraph(); requestAnimationFrame(() => reflowGraph('mcd')); }
            if(num===3) { updateBaseTableSelect(); advSyncBase(); advMigrateClassic(); renderAdvExtract(); comboifyTableSelect('baseTableSelect'); }
            if(num===4) { updateVizBaseTableSelect(); covPopulate(); ['covBase', 'covDimTable', 'covRel'].forEach(comboifyTableSelect); }
            if(num===5) { populateExpTableSelect(); ['expBaseTable', 'expConfigTable'].forEach(comboifyTableSelect); }
            if(num===6) { populateBrowserTableSelect(); comboifyTableSelect('browserTableSelect'); }
            if(num===7) { populateCompareTables(); ['compTableA', 'compTableB'].forEach(comboifyTableSelect); }
            if(num===7) { renderCompKeys(); renderCompMappings(); }
            if(num===8) { populateQualTables(); comboifyTableSelect('qualTable'); }
            if(num===9) renderGovernance();
        }

