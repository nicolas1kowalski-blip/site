        // ======================= 📄 Dossier de gouvernance exportable =======================
        function exportGovernanceReport() {
            const governance = state.governance,
                e2 = escapeHTML;
            const tables = Object.values(state.tables).filter(t => t.status === 'ready');
            const sec = (t, b) =>
                `<h2 style="font:700 16px system-ui;color:#312e81;border-bottom:2px solid #e0e7ff;padding-bottom:4px;margin:28px 0 10px">${t}</h2>${b}`;
            const tbl = (heads, rows) =>
                `<table style="width:100%;border-collapse:collapse;font:12px system-ui"><tr>${heads.map(h => `<th style="text-align:left;background:#f1f5f9;padding:6px;border:1px solid #e2e8f0">${h}</th>`).join('')}</tr>${rows.map(r => `<tr>${r.map(cx => `<td style="padding:5px 6px;border:1px solid #e2e8f0">${cx}</td>`).join('')}</tr>`).join('')}</table>`;
            let out = `<div style="max-width:900px;margin:0 auto;padding:30px;font-family:system-ui">
                <h1 style="font:900 26px system-ui;color:#1e1b4b">🏛️ Dossier de gouvernance des données</h1>
                <p style="font:12px system-ui;color:#64748b">Généré par Studio Data le ${new Date().toLocaleString('fr-FR')}</p>`;
            out += sec(
                '1. Sources & tables',
                tbl(
                    ['Nom', 'Type', 'Domaine', 'Lignes', 'Colonnes'],
                    tables.map(t => [
                        e2(t.name),
                        t.type === 'designed' ? '🧱 table conçue' : e2(t.type),
                        e2(t.theme || '—'),
                        t.lastRows != null ? t.lastRows.toLocaleString('fr-FR') : '—',
                        t.headers.length
                    ])
                )
            );
            out += sec(
                '2. Liens du modèle de données',
                state.relations.length
                    ? tbl(
                          ['De', 'Vers', 'Cardinalité'],
                          state.relations
                              .filter(r => state.tables[r.sourceTable] && state.tables[r.targetTable])
                              .map(r => [
                                  `${e2(state.tables[r.sourceTable].name)}.${e2(r.sourceCol)}`,
                                  `${e2(state.tables[r.targetTable].name)}.${e2(r.targetCol)}`,
                                  e2(r.cardinality || '—')
                              ])
                      )
                    : '<p style="font:12px system-ui;color:#94a3b8">Aucun lien défini.</p>'
            );
            out += sec(
                '3. Objets métier',
                (governance.businessObjects || []).length
                    ? tbl(
                          ['Objet', 'Propriétaire', 'Sources (rôles)', 'Attributs', 'Hiérarchies'],
                          governance.businessObjects.map(bo => [
                              e2(bo.name),
                              bo.globalOwner ? e2(bo.globalOwner) : '⚠️ à nommer',
                              e2((bo.sources || []).map(s => `${s.table} (${s.role})`).join(', ') || '—'),
                              (bo.elements || []).length,
                              getBoHierarchies(bo).length
                          ])
                      )
                    : '<p style="font:12px system-ui;color:#94a3b8">Aucun objet métier.</p>'
            );
            const sens = [];
            Object.entries(governance.dictionary || {}).forEach(([tn, d]) =>
                Object.entries(d.columns || {}).forEach(([cn, cc]) => {
                    if (cc.sensitivity && cc.sensitivity !== 'Public' && cc.sensitivity !== 'Interne')
                        sens.push([e2(tn), e2(cn), e2(cc.sensitivity)]);
                })
            );
            out += sec(
                '4. Colonnes sensibles (dictionnaire)',
                sens.length
                    ? tbl(['Table', 'Colonne', 'Sensibilité'], sens)
                    : '<p style="font:12px system-ui;color:#94a3b8">Aucune colonne marquée sensible — lancez le scan RGPD.</p>'
            );
            out += sec(
                '5. Historique des audits qualité',
                (governance.qualityHistory || []).length
                    ? tbl(
                          ['Date', 'Table', 'Lignes', 'Complétude moy.', 'Doublons'],
                          governance.qualityHistory
                              .slice(0, 20)
                              .map(h => [
                                  new Date(h.ts).toLocaleString('fr-FR'),
                                  e2(h.table || ''),
                                  (h.rows || 0).toLocaleString('fr-FR'),
                                  (h.avgCompleteness || 0) + ' %',
                                  (h.duplicates || 0).toLocaleString('fr-FR')
                              ])
                      )
                    : '<p style="font:12px system-ui;color:#94a3b8">Aucun audit réalisé.</p>'
            );
            out += '</div>';
            const blob = new Blob(
                [
                    `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>Dossier de gouvernance — Studio Data</title></head><body style="background:#fff">${out}</body></html>`
                ],
                { type: 'text/html;charset=utf-8' }
            );
            const anchorElement = document.createElement('a');
            anchorElement.href = URL.createObjectURL(blob);
            anchorElement.download = `Dossier_gouvernance_${new Date().toISOString().slice(0, 10)}.html`;
            document.body.appendChild(anchorElement);
            anchorElement.click();
            anchorElement.remove();
            showSuccess('📄 Dossier de gouvernance exporté (HTML autoportant, imprimable en PDF).');
        }

        function exportConfiguration() {
            const config = {
                version: '18.0',
                relations: state.relations.map(r => ({
                    sourceTable: state.tables[r.sourceTable]?.name,
                    sourceCol: r.sourceCol,
                    targetTable: state.tables[r.targetTable]?.name,
                    targetCol: r.targetCol
                })),
                selections: {},
                pivots: {},
                filters: {},
                hierarchyConfig: {},
                graphConfig: state.graphConfig,
                baseTable: null,
                apiSources: []
            };
            Object.keys(state.tables).forEach(tId => {
                const tName = state.tables[tId].name;
                if (state.tables[tId].type === 'api')
                    config.apiSources.push({
                        name: tName,
                        url: state.tables[tId].config.url,
                        path: state.tables[tId].config.path
                    });
                config.selections[tName] = state.selectedCols[tId] || [];
                config.pivots[tName] = state.pivotMode[tId] || 'none';
                if (state.filters[tId]) {
                    config.filters[tName] = {};
                    Object.keys(state.filters[tId]).forEach(c => {
                        const f = state.filters[tId][c];
                        config.filters[tName][c] =
                            f.type === 'list' ? { type: 'list', values: Array.from(f.values) } : { ...f };
                    });
                }
                if (state.hierarchyConfig[tId]) {
                    config.hierarchyConfig[tName] = { ...state.hierarchyConfig[tId] };
                    if (state.hierarchyConfig[tId].linkTable && state.tables[state.hierarchyConfig[tId].linkTable])
                        config.hierarchyConfig[tName].linkTableName = state.tables[state.hierarchyConfig[tId].linkTable].name;
                }
            });
            const baseTableSelectElement = el('baseTableSelect');
            if (baseTableSelectElement && baseTableSelectElement.value && state.tables[baseTableSelectElement.value])
                config.baseTable = state.tables[baseTableSelectElement.value].name;
            const anchorElement = document.createElement('a');
            anchorElement.href = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(config, null, 2));
            anchorElement.download = `Config_${Date.now()}.json`;
            document.body.appendChild(anchorElement);
            anchorElement.click();
            anchorElement.remove();
        }

        async function importConfiguration(e) {
            const file = e.target.files[0];
            if (!file) return;
            try {
                const text = await readFileAsText(file);
                const conf = JSON.parse(text);
                if (conf.apiSources) {
                    for (const api of conf.apiSources) {
                        el('apiTableName').value = api.name;
                        el('apiUrl').value = api.url;
                        el('apiDataPath').value = api.path || '';
                        await connectApi();
                    }
                }
                const getId = n => Object.keys(state.tables).find(i => state.tables[i].name === n);
                state.relations = [];
                conf.relations?.forEach(r => {
                    const s = getId(r.sourceTable),
                        t = getId(r.targetTable);
                    if (s && t)
                        state.relations.push({
                            id: 'rel_' + generateId(),
                            sourceTable: s,
                            sourceCol: r.sourceCol,
                            targetTable: t,
                            targetCol: r.targetCol
                        });
                });
                conf.selections &&
                    Object.keys(conf.selections).forEach(n => {
                        const id = getId(n);
                        if (id) state.selectedCols[id] = conf.selections[n];
                    });
                conf.pivots &&
                    Object.keys(conf.pivots).forEach(n => {
                        const id = getId(n);
                        if (id) state.pivotMode[id] = conf.pivots[n];
                    });
                state.filters = {};
                conf.filters &&
                    Object.keys(conf.filters).forEach(n => {
                        const id = getId(n);
                        if (id) {
                            state.filters[id] = {};
                            Object.keys(conf.filters[n]).forEach(c => {
                                const f = conf.filters[n][c];
                                state.filters[id][c] =
                                    f.type === 'list' || Array.isArray(f)
                                        ? { type: 'list', values: new Set(f.values || f) }
                                        : f;
                            });
                        }
                    });
                state.hierarchyConfig = {};
                conf.hierarchyConfig &&
                    Object.keys(conf.hierarchyConfig).forEach(n => {
                        const id = getId(n);
                        if (id) {
                            state.hierarchyConfig[id] = { ...conf.hierarchyConfig[n] };
                            if (conf.hierarchyConfig[n].linkTableName)
                                state.hierarchyConfig[id].linkTable = getId(conf.hierarchyConfig[n].linkTableName) || '';
                        }
                    });
                if (conf.graphConfig) state.graphConfig = conf.graphConfig;
                if (!el('step-2').classList.contains('hidden')) {
                    renderRelationsList();
                    renderGraph();
                }
                if (conf.baseTable) {
                    const bid = getId(conf.baseTable);
                    if (bid) {
                        el('baseTableSelect').value = bid;
                        el('vizBaseTable').value = bid;
                        state.advExtract = {
                            from: 'table',
                            objectId: '',
                            baseId: bid,
                            columns: [],
                            filters: [],
                            dedup: { on: false, keys: [], keep: 'first' },
                            group: { on: false, aggs: [] },
                            customSql: false
                        };
                        advMigrateClassic(true);
                        handleBaseTableChange();
                        handleVizBaseTableChange();
                    }
                }
                showSuccess('Configuration chargée avec succès.');
            } catch (err) {
                showError('Fichier invalide.');
            }
            e.target.value = '';
        }

        const PREDEFINED_RELATIONS = [
            { sourceName: 'cvsemplacement', sourceCol: 'DK_CODE_CVS', targetName: 'convention', targetCol: 'DK_CODE_CVS' },
            { sourceName: 'cvsservices', sourceCol: 'DK_CODE_CVS', targetName: 'convention', targetCol: 'DK_CODE_CVS' },
            { sourceName: 'emplacement', sourceCol: 'DK_CODE', targetName: 'acces', targetCol: 'DK_CODE_EMPLACEMENT' },
            {
                sourceName: 'emplacement',
                sourceCol: 'DK_CODE',
                targetName: 'classification_env',
                targetCol: 'DK_CODE_EMPLACEMENT'
            },
            { sourceName: 'emplacement', sourceCol: 'DK_CODE', targetName: 'cvsemplacement', targetCol: 'DK_CODE_EMPLACEMENT' },
            {
                sourceName: 'historique_criticite',
                sourceCol: 'DK_CODE_EMPLACEMENT',
                targetName: 'emplacement',
                targetCol: 'DK_CODE'
            },
            { sourceName: 'imputationsite', sourceCol: 'DK_CODE_EMPLACEMENT', targetName: 'emplacement', targetCol: 'DK_CODE' },
            { sourceName: 'installation', sourceCol: 'DK_CODE_EMPLACEMENT', targetName: 'emplacement', targetCol: 'DK_CODE' },
            {
                sourceName: 'installation',
                sourceCol: 'DK_CODE',
                targetName: 'imputationinstallation',
                targetCol: 'DK_CODE_INSTALLATION'
            },
            { sourceName: 'see', sourceCol: 'DK_CODE', targetName: 'emplacement', targetCol: 'DK_CODE_SEE' },
            { sourceName: 'emplacement', sourceCol: 'DK_CODE', targetName: 'emplacement', targetCol: 'DK_CODE_PARENT' }
        ];

        function autoDetectRelations(newId) {
            const newTable = state.tables[newId];
            if (!newTable || newTable.status !== 'ready') return;
            let count = 0;
            const newName = cleanFileName(newTable.name);
            PREDEFINED_RELATIONS.forEach(p => {
                if (p.sourceName === newName) {
                    Object.values(state.tables).forEach(targetTable => {
                        if (cleanFileName(targetTable.name) === p.targetName && targetTable.status === 'ready') {
                            if (addPredefinedRelation(newId, p.sourceCol, targetTable.id, p.targetCol)) count++;
                        }
                    });
                }
                if (p.targetName === newName) {
                    Object.values(state.tables).forEach(sourceTable => {
                        if (cleanFileName(sourceTable.name) === p.sourceName && sourceTable.status === 'ready') {
                            if (addPredefinedRelation(sourceTable.id, p.sourceCol, newId, p.targetCol)) count++;
                        }
                    });
                }
            });
            if (count > 0) showSuccess(`${count} lien(s) auto détecté(s)`);
        }

        function addPredefinedRelation(sId, sCol, tId, tCol) {
            const e = state.relations.some(
                r =>
                    (r.sourceTable === sId && r.targetTable === tId && r.sourceCol === sCol && r.targetCol === tCol) ||
                    (r.sourceTable === tId && r.targetTable === sId && r.sourceCol === tCol && r.targetCol === sCol)
            );
            if (!e) {
                state.relations.push({
                    id: 'r_' + generateId(),
                    sourceTable: sId,
                    sourceCol: sCol,
                    targetTable: tId,
                    targetCol: tCol
                });
                return true;
            }
            return false;
        }

        // Réparation express d'un import CSV cassé (guillemet parasite) : sans guillemets + ignore les lignes fautives.
        async function repairCsvSource(tId) {
            const table = state.tables[tId];
            if (!table) return;
            table.config = table.config || {};
            table.config.quote = 'none';
            table.config.ignoreErrors = true;
            table.status = 'loading';
            renderTables();
            try {
                const headers = await ingestFileTable(tId);
                table.headers = headers;
                table.sampleData = await duckSampleRows(tId, 6);
                table.status = 'ready';
                renderTables();
                autoDetectRelations(tId);
                updateBaseTableSelect();
                populateQualTables();
                await persistTableData(tId);
                persistAppState();
                showSuccess(`Source "${table.name}" réparée (lecture sans guillemets).`);
            } catch (err) {
                table.status = 'error';
                table.errorMsg = err.message;
                renderTables();
            }
        }
