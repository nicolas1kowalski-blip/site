        // ==========================================
        //  PERSISTANCE LOCALE (IndexedDB)
        // ==========================================
        // Deux magasins : 'meta' (config + référentiel de gouvernance, sauvegardés à chaque modification)
        // et 'tabledata' (fichiers sources en blob, tables API/extraction en Parquet). Au rechargement de
        // la page, restoreSession() ré-ingère tout dans DuckDB : rien n'est perdu en fermant l'onglet.
        const IDB_NAME = 'studio_data_db';
        let idbPromise = null;
        function openIDB() {
            if (idbPromise) return idbPromise;
            idbPromise = new Promise((resolve, reject) => {
                const rq = indexedDB.open(IDB_NAME, 1);
                rq.onupgradeneeded = () => {
                    const db = rq.result;
                    if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
                    if (!db.objectStoreNames.contains('tabledata')) db.createObjectStore('tabledata');
                };
                rq.onsuccess = () => resolve(rq.result);
                rq.onerror = () => reject(rq.error);
            });
            return idbPromise;
        }
        async function idbPut(store, key, val) {
            const db = await openIDB();
            return new Promise((res, rej) => {
                const tx = db.transaction(store, 'readwrite');
                tx.objectStore(store).put(val, key);
                tx.oncomplete = () => res();
                tx.onerror = () => rej(tx.error);
            });
        }
        async function idbGet(store, key) {
            const db = await openIDB();
            return new Promise((res, rej) => {
                const rq = db.transaction(store, 'readonly').objectStore(store).get(key);
                rq.onsuccess = () => res(rq.result);
                rq.onerror = () => rej(rq.error);
            });
        }
        async function idbDel(store, key) {
            const db = await openIDB();
            return new Promise((res, rej) => {
                const tx = db.transaction(store, 'readwrite');
                tx.objectStore(store).delete(key);
                tx.oncomplete = () => res();
                tx.onerror = () => rej(tx.error);
            });
        }
        async function idbKeys(store) {
            const db = await openIDB();
            return new Promise((res, rej) => {
                const rq = db.transaction(store, 'readonly').objectStore(store).getAllKeys();
                rq.onsuccess = () => res(rq.result);
                rq.onerror = () => rej(rq.error);
            });
        }
        async function idbClear(store) {
            const db = await openIDB();
            return new Promise((res, rej) => {
                const tx = db.transaction(store, 'readwrite');
                tx.objectStore(store).clear();
                tx.oncomplete = () => res();
                tx.onerror = () => rej(tx.error);
            });
        }

        function bufToBase64(buf) {
            const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
            let text = '';
            const CH = 0x8000;
            for (let i = 0; i < u8.length; i += CH) text += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
            return btoa(text);
        }
        function base64ToBuf(b64) {
            const bin = atob(b64);
            const u8 = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
            return u8;
        }

        async function exportTableParquet(tId) {
            const { db, conn } = await getDB();
            const f = 'exp_' + tId + '.parquet';
            try {
                if (db.dropFile) await db.dropFile(f);
            } catch (e) {}
            await conn.query(
                `COPY (SELECT * EXCLUDE (__rn) FROM ${sqlIdent(duckTableName(tId))}) TO '${f}' (FORMAT PARQUET, COMPRESSION ZSTD)`
            );
            // copyFileToBuffer renvoie une vue ALIASÉE sur le tas WASM : toute opération DuckDB
            // ultérieure peut la corrompre. On la RECOPIE aussitôt dans le tas JS (.slice()) —
            // sans ça, les octets Parquet deviennent invalides ("TProtocolException: Invalid data").
            const buf = (await db.copyFileToBuffer(f)).slice();
            try {
                if (db.dropFile) await db.dropFile(f);
            } catch (e) {}
            return buf;
        }
        async function ingestParquetIntoDuckDB(tId, buffer) {
            const { db, conn } = await getDB();
            const f = 'imp_' + tId + '.parquet';
            try {
                if (db.dropFile) await db.dropFile(f);
            } catch (e) {}
            await db.registerFileBuffer(f, buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer));
            await duckDropTable(tId);
            await conn.query(
                `CREATE TABLE ${sqlIdent(duckTableName(tId))} AS SELECT row_number() OVER () AS __rn, * FROM read_parquet('${f}')`
            );
            return duckTableHeaders(tId);
        }

        // ======================= Sources optimisées (Parquet) =======================
        // Conversion d'une source CSV volumineuse en Parquet compressé (ZSTD, __rn conservé) : les
        // analyses lisent alors un format colonnaire — 5 à 20× plus rapide qu'un re-parse du texte —
        // servi par un Blob HORS du tas WASM (vue à la demande), donc sans risque d'Out of Memory.
        async function attachParquetView(tId, buffer) {
            const { db, conn } = await getDB();
            const pf = 'pq_' + tId + '.parquet';
            try {
                if (db.dropFile) await db.dropFile(pf);
            } catch (e) {}
            const blobFile = new File([buffer], pf);
            await db.registerFileHandle(pf, blobFile, window.duckdb.DuckDBDataProtocol.BROWSER_FILEREADER, true);
            await duckDropTable(tId);
            await conn.query(`CREATE VIEW ${sqlIdent(duckTableName(tId))} AS SELECT * FROM read_parquet(${sqlLiteral(pf)})`);
            return duckTableHeaders(tId);
        }
        async function optimizeSourceToParquet(tId, btn) {
            const table = state.tables[tId];
            if (!table || table.status !== 'ready') return;
            if (btn) {
                btn.disabled = true;
                btn.textContent = '🗜️ …';
            }
            bgTaskStart(`Optimisation de "${table.name}" (conversion Parquet) en cours`);
            const run = async () => {
                const { db, conn } = await getDB();
                const f = 'opt_' + tId + '.parquet';
                try {
                    if (db.dropFile) await db.dropFile(f);
                } catch (e) {}
                // __rn est CONSERVÉ : ordre, pagination et exports restent identiques.
                await conn.query(
                    `COPY (SELECT * FROM ${sqlIdent(duckTableName(tId))}) TO '${f}' (FORMAT PARQUET, COMPRESSION ZSTD)`
                );
                // .slice() OBLIGATOIRE : copyFileToBuffer alias le tas WASM ; les requêtes qui suivent
                // (attachParquetView) le corromperaient → Parquet illisible ("TProtocolException").
                const buf = (await db.copyFileToBuffer(f)).slice();
                try {
                    if (db.dropFile) await db.dropFile(f);
                } catch (e) {}
                await attachParquetView(tId, buf);
                table.storage = 'parquet';
                table.optimized = true;
                table.pqSize = buf.byteLength;
                renderTables();
                await idbPut('tabledata', table.name, {
                    kind: 'pq',
                    name: table.name,
                    type: table.type,
                    config: table.config,
                    buffer: buf
                });
                persistAppState();
                updatePersistStatus();
                bgTaskEnd(
                    `🗜️ "${table.name}" optimisée : ${(buf.byteLength / 1048576).toFixed(1)} Mo en Parquet — les analyses seront bien plus rapides.`
                );
            };
            try {
                await run();
            } catch (e) {
                // Verrou WASM transitoire (« unique_lock::unlock: not locked ») : on laisse la file de
                // requêtes se vider puis on retente UNE fois.
                if (isTransientLockError(e)) {
                    await new Promise(r => setTimeout(r, 500));
                    try {
                        await run();
                        return;
                    } catch (eL) {
                        e = eL;
                    }
                }
                // Erreur de lecture CSV en plein scan (guillemet non fermé…) : on répare la source
                // (quote='' puis ignore_errors) et on retente l'optimisation UNE fois.
                let fixed = false;
                try {
                    fixed = await autoFixCsvRead(tId, e);
                } catch (e2) {}
                if (fixed) {
                    try {
                        await run();
                    } catch (e3) {
                        bgTaskEnd();
                        showError('Optimisation impossible : ' + e3.message);
                    }
                } else {
                    bgTaskEnd();
                    showError('Optimisation impossible : ' + e.message);
                }
            } finally {
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = '🗜️ Optimiser';
                }
            }
        }

        // Sauvegarde des données d'une table : blob du fichier d'origine si on l'a, sinon Parquet DuckDB.
        async function persistTableData(tId) {
            if (state.noPersist) return; // mode sans persistance : les données ne sont pas copiées dans le stockage local
            const table = state.tables[tId];
            if (!table || table.status !== 'ready') return;
            try {
                if (table.storage === 'parquet') {
                    // Déjà enregistrée en Parquet par optimizeSourceToParquet ; on met juste à jour la config
                    // si besoin sans réécrire le buffer (lecture-modification-écriture légère).
                    const rec = await idbGet('tabledata', table.name);
                    if (rec && rec.kind === 'pq') {
                        rec.config = table.config;
                        await idbPut('tabledata', table.name, rec);
                    }
                } else if (Array.isArray(table.files) && table.files.length) {
                    await idbPut('tabledata', table.name, {
                        kind: 'files',
                        name: table.name,
                        type: table.type,
                        config: table.config,
                        blobs: table.files.slice(),
                        parts: (table.parts || []).slice()
                    });
                } else if (table.file) {
                    await idbPut('tabledata', table.name, {
                        kind: 'file',
                        name: table.name,
                        type: table.type,
                        config: table.config,
                        blob: table.file
                    });
                } else {
                    const buf = await exportTableParquet(tId);
                    await idbPut('tabledata', table.name, {
                        kind: 'parquet',
                        name: table.name,
                        type: table.type,
                        headers: table.headers.slice(),
                        buffer: buf
                    });
                }
                updatePersistStatus();
            } catch (e) {
                console.error('Persistance de table échouée', e);
            }
        }

        function collectPersistedConfig() {
            const nameOf = id => (state.tables[id] ? state.tables[id].name : null);
            const byName = obj => {
                const out = {};
                Object.keys(obj || {}).forEach(id => {
                    const name = nameOf(id);
                    if (name) out[name] = obj[id];
                });
                return out;
            };
            const filters = {};
            Object.keys(state.filters).forEach(id => {
                const name = nameOf(id);
                if (!name) return;
                filters[name] = {};
                Object.keys(state.filters[id]).forEach(c => {
                    const f = state.filters[id][c];
                    filters[name][c] = f.type === 'list' ? { type: 'list', values: Array.from(f.values) } : { ...f };
                });
            });
            const hierarchy = {};
            Object.keys(state.hierarchyConfig).forEach(id => {
                const name = nameOf(id);
                if (!name) return;
                hierarchy[name] = { ...state.hierarchyConfig[id] };
                const lt = nameOf(state.hierarchyConfig[id].linkTable);
                if (lt) hierarchy[name].linkTableName = lt;
            });
            const designs = {};
            Object.values(state.tables).forEach(t => {
                if (t.type === 'designed' && t.design) {
                    const dd = { ...t.design };
                    delete dd.targetId;
                    designs[t.name] = dd;
                }
            });
            const themes = {};
            Object.values(state.tables).forEach(t => {
                if ((t.theme || '').trim()) themes[t.name] = t.theme.trim();
            });
            const mcdPos = {};
            try {
                Object.keys(svgG.pos).forEach(id => {
                    const table = state.tables[id];
                    if (table) mcdPos[table.name] = { x: Math.round(svgG.pos[id].x), y: Math.round(svgG.pos[id].y) };
                });
            } catch (e) {}
            return {
                savedAt: new Date().toISOString(),
                relations: state.relations
                    .filter(r => nameOf(r.sourceTable) && nameOf(r.targetTable))
                    .map(r => ({
                        sourceTable: nameOf(r.sourceTable),
                        sourceCol: r.sourceCol,
                        targetTable: nameOf(r.targetTable),
                        targetCol: r.targetCol,
                        cardinality: r.cardinality || '',
                        kind: r.kind || '',
                        measured: r.measured || null
                    })),
                selections: byName(state.selectedCols),
                pivots: byName(state.pivotMode),
                filters,
                hierarchy,
                graphConfig: byName(state.graphConfig),
                // L'historique qualité est volumineux (jusqu'à 300 audits x 80 colonnes) : il est
                // sauvegardé À PART (clé 'qualityHistory'), uniquement après un audit — pas à
                // chaque frappe dans la gouvernance.
                governance: { ...state.governance, qualityHistory: [] },
                designs,
                themes,
                mcdPos,
                zipMappings: state.zipMappings || {},
                recipes: (state.recipes || []).map(r => {
                    const c2 = { ...r };
                    delete c2.targetId;
                    return c2;
                }),
                dashboards: (state.dashboards || []).map(d2 => ({
                    ...d2,
                    tiles: (d2.tiles || []).map(t2 => {
                        const c2 = { ...t2 };
                        delete c2._rows;
                        delete c2._v;
                        delete c2._st;
                        return c2;
                    })
                })),
                linkages: state.linkages || [],
                qualityMinScore: state.qualityMinScore != null ? state.qualityMinScore : null,
                connectors: (state.connectors || []).map(c => {
                    const c2 = { ...c };
                    delete c2.targetId;
                    return c2;
                }),
                extractPresets: state.extractPresets || []
            };
        }

        function applyPersistedConfig(saved) {
            const idOf = n => Object.keys(state.tables).find(i => state.tables[i].name === n);
            const byId = obj => {
                const out = {};
                Object.keys(obj || {}).forEach(n => {
                    const id = idOf(n);
                    if (id) out[id] = obj[n];
                });
                return out;
            };
            state.relations = (saved.relations || [])
                .map(r => {
                    const s = idOf(r.sourceTable),
                        t = idOf(r.targetTable);
                    return s && t
                        ? {
                              id: 'rel_' + generateId(),
                              sourceTable: s,
                              sourceCol: r.sourceCol,
                              targetTable: t,
                              targetCol: r.targetCol,
                              cardinality: r.cardinality || '',
                              kind: r.kind || '',
                              measured: r.measured || null
                          }
                        : null;
                })
                .filter(Boolean);
            state.selectedCols = byId(saved.selections);
            state.pivotMode = byId(saved.pivots);
            state.graphConfig = byId(saved.graphConfig);
            state.filters = {};
            Object.keys(saved.filters || {}).forEach(n => {
                const id = idOf(n);
                if (!id) return;
                state.filters[id] = {};
                Object.keys(saved.filters[n]).forEach(c => {
                    const f = saved.filters[n][c];
                    state.filters[id][c] = f.type === 'list' ? { type: 'list', values: new Set(f.values || []) } : f;
                });
            });
            state.hierarchyConfig = {};
            Object.keys(saved.hierarchy || {}).forEach(n => {
                const id = idOf(n);
                if (!id) return;
                state.hierarchyConfig[id] = { ...saved.hierarchy[n] };
                if (saved.hierarchy[n].linkTableName)
                    state.hierarchyConfig[id].linkTable = idOf(saved.hierarchy[n].linkTableName) || '';
            });
            if (saved.governance) state.governance = normalizeGovernance(saved.governance);
            // Tables conçues : ré-attache la recette (type + design) aux tables restaurées par nom.
            Object.keys(saved.designs || {}).forEach(n => {
                const id = idOf(n);
                if (!id) return;
                state.tables[id].type = 'designed';
                state.tables[id].design = { ...saved.designs[n], targetId: id };
            });
            // Domaines (groupes de sources) restaurés par nom.
            Object.keys(saved.themes || {}).forEach(n => {
                const id = idOf(n);
                if (id) state.tables[id].theme = saved.themes[n];
            });
            // Positions mémorisées du Modèle de données (arrangement manuel conservé).
            try {
                Object.keys(saved.mcdPos || {}).forEach(n => {
                    const id = idOf(n);
                    if (id) svgG.pos[id] = { x: saved.mcdPos[n].x, y: saved.mcdPos[n].y };
                });
            } catch (e) {}
            if (saved.zipMappings && typeof saved.zipMappings === 'object') state.zipMappings = saved.zipMappings;
            if (Array.isArray(saved.recipes)) state.recipes = saved.recipes;
            if (Array.isArray(saved.dashboards)) state.dashboards = saved.dashboards;
            if (Array.isArray(saved.linkages)) state.linkages = saved.linkages;
            if (saved.qualityMinScore != null) state.qualityMinScore = saved.qualityMinScore;
            if (Array.isArray(saved.connectors)) state.connectors = saved.connectors;
            if (Array.isArray(saved.extractPresets)) state.extractPresets = saved.extractPresets;
        }

        // v3.7 : les « cas d'usage » fusionnent dans les processus (Applis & processus).
        // Migration sans perte : nom, description, propriétaire, criticité, tables, colonnes,
        // objets métier rattachés et applications « via » sont repris sur un processus.
        function migrateUseCasesToAssets(g) {
            if (!Array.isArray(g.useCases) || !g.useCases.length) return g;
            g.assets = g.assets || [];
            g.useCases.forEach(uc => {
                let asset = g.assets.find(x => String(x.name).trim().toLowerCase() === String(uc.name).trim().toLowerCase());
                if (!asset) {
                    asset = {
                        id: 'as_' + generateId(),
                        kind: 'process',
                        name: uc.name,
                        owner: '',
                        criticality: 'Moyenne',
                        description: '',
                        domain: '',
                        appIds: [],
                        tables: [],
                        columns: [],
                        boIds: []
                    };
                    g.assets.push(asset);
                }
                if (uc.owner && !asset.owner) asset.owner = uc.owner;
                if (uc.criticality) asset.criticality = uc.criticality;
                if (uc.description && !asset.description) asset.description = uc.description;
                asset.tables = Array.from(new Set([...(asset.tables || []), ...(uc.tables || [])]));
                asset.columns = [...(asset.columns || [])];
                (uc.columns || []).forEach(c2 => {
                    if (!asset.columns.some(x => x.table === c2.table && x.col === c2.col))
                        asset.columns.push({ table: c2.table, col: c2.col });
                });
                asset.boIds = Array.from(new Set([...(asset.boIds || []), ...(uc.boIds || [])]));
                asset.appIds = Array.from(
                    new Set([
                        ...(asset.appIds || []),
                        ...(uc.assetIds || []).filter(id => {
                            const x = g.assets.find(y => y.id === id);
                            return x && x.kind === 'app';
                        })
                    ])
                );
            });
            g.useCases = [];
            return g;
        }
        function normalizeGovernance(g) {
            return migrateUseCasesToAssets({
                perimeters: Array.isArray(g.perimeters) ? g.perimeters : [],
                dictionary: g.dictionary && typeof g.dictionary === 'object' ? g.dictionary : {},
                glossary: Array.isArray(g.glossary) ? g.glossary : [],
                useCases: Array.isArray(g.useCases) ? g.useCases : [],
                businessObjects: Array.isArray(g.businessObjects) ? g.businessObjects : [],
                rules: Array.isArray(g.rules) ? g.rules : [],
                lineage: g.lineage && typeof g.lineage === 'object' ? g.lineage : {},
                qualityHistory: Array.isArray(g.qualityHistory) ? g.qualityHistory : [],
                assets: Array.isArray(g.assets) ? g.assets : [],
                qualityRules: Array.isArray(g.qualityRules) ? g.qualityRules : [],
                privacy:
                    g.privacy && typeof g.privacy === 'object'
                        ? g.privacy
                        : {
                              levels: {},
                              actions: { personnel: 'pseudo', confidentiel: 'mask', interne: 'none', public: 'none' }
                          },
                srcWatch: g.srcWatch && typeof g.srcWatch === 'object' ? g.srcWatch : {},
                flow:
                    g.flow && typeof g.flow === 'object'
                        ? {
                              nodes: Array.isArray(g.flow.nodes) ? g.flow.nodes : [],
                              edges: Array.isArray(g.flow.edges) ? g.flow.edges : [],
                              threshold: typeof g.flow.threshold === 'number' ? g.flow.threshold : 1.0
                          }
                        : { nodes: [], edges: [], threshold: 1.0 },
                flowLog: Array.isArray(g.flowLog) ? g.flowLog : []
            });
        }

        // --- Sauvegarde automatique SUR FICHIER (dossier local choisi par l'utilisateur) ---
        // Insensible aux purges du navigateur : la configuration (modèle, tables conçues,
        // domaines, gouvernance) est réécrite dans le dossier au fil du travail (>= 5 min d'écart).
        let _fsBackupLast = 0;
        async function fsBackupDirPick() {
            try {
                if (!fsDirSupported()) return showError('La sauvegarde sur dossier nécessite Chrome ou Edge sur ordinateur.');
                const h = await window.showDirectoryPicker({ mode: 'readwrite' });
                await idbPut('meta', 'backupDir', h);
                showSuccess(
                    '💾 Dossier de sauvegarde configuré : « ' +
                        h.name +
                        ' » — la configuration y sera recopiée automatiquement.'
                );
                await fsBackupWrite(true);
                renderGovernance();
            } catch (e) {
                if (e && e.name !== 'AbortError') showError('Choix du dossier impossible : ' + e.message);
            }
        }
        async function fsBackupWrite(force) {
            try {
                if (state.noPersist) return;
                const now = Date.now();
                if (!force && now - _fsBackupLast < 5 * 60 * 1000) return;
                const h = await idbGet('meta', 'backupDir');
                if (!h) return;
                if ((await h.queryPermission({ mode: 'readwrite' })) !== 'granted') return; // bouton « Réautoriser »
                _fsBackupLast = now;
                const cfg = collectPersistedConfig();
                const payload = JSON.stringify({ kind: 'studio-data-config', savedAt: cfg.savedAt, cfg });
                for (const name of [
                    'StudioData_secours.json',
                    'StudioData_secours_' + new Date().toISOString().slice(0, 10) + '.json'
                ]) {
                    const fh = await h.getFileHandle(name, { create: true });
                    const w = await fh.createWritable();
                    await w.write(payload);
                    await w.close();
                }
                const fsBackupStatusElement = el('fsBackupStatus');
                if (fsBackupStatusElement)
                    fsBackupStatusElement.textContent = ' · dernier fichier écrit à ' + new Date().toLocaleTimeString('fr-FR');
            } catch (e) {
                console.warn('Sauvegarde fichier impossible :', e);
            }
        }
        async function fsBackupReauth() {
            try {
                const h = await idbGet('meta', 'backupDir');
                if (h && (await h.requestPermission({ mode: 'readwrite' })) === 'granted') {
                    showSuccess('💾 Dossier de sauvegarde réautorisé.');
                    await fsBackupWrite(true);
                }
            } catch (e) {}
            renderGovernance();
        }
        async function fsBackupDisable() {
            try {
                await idbDel('meta', 'backupDir');
            } catch (e) {}
            showSuccess('Sauvegarde sur fichier désactivée.');
            renderGovernance();
        }
        function importConfigFile(inputEl) {
            const file = inputEl.files && inputEl.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
                try {
                    const j = JSON.parse(reader.result);
                    const cfg = j && j.kind === 'studio-data-config' ? j.cfg : j;
                    if (!cfg || (!cfg.relations && !cfg.governance && !cfg.designs))
                        throw new Error('fichier non reconnu (attendu : StudioData_secours*.json).');
                    applyPersistedConfig(cfg);
                    restoreCompleted = true;
                    persistAppState();
                    renderTables();
                    updateBaseTableSelect();
                    populateQualTables();
                    renderGovernance();
                    showSuccess(
                        '↩ Configuration restaurée depuis le fichier' +
                            (cfg.savedAt ? ' (état du ' + new Date(cfg.savedAt).toLocaleString('fr-FR') + ')' : '') +
                            ' — modèle, tables conçues, domaines et gouvernance.'
                    );
                } catch (e) {
                    showError('Import impossible : ' + e.message);
                }
            };
            reader.readAsText(file);
            inputEl.value = '';
        }
        function persistQualityHistory() {
            if (state.noPersist) return;
            idbPut('meta', 'qualityHistory', state.governance.qualityHistory || []).catch(() => {});
        }
        let persistTimer = null;
        let restoreCompleted = false; // tant que la restauration n'a pas abouti, on n'écrase JAMAIS la sauvegarde existante
        let sessionBackupDone = false;
        let _prevRichness = 0; // richesse de la dernière sauvegarde connue (évite de relire l'état complet à chaque sauvegarde)
        // « Richesse » d'une configuration : garde-fou pour ne jamais remplacer une sauvegarde
        // non vide par une sauvegarde vide (symptôme typique d'une restauration incomplète).
        function cfgRichness(c) {
            if (!c) return 0;
            const g = c.governance || {};
            return (
                (c.relations || []).length +
                Object.keys(c.designs || {}).length +
                Object.keys(c.themes || {}).length +
                (g.businessObjects || []).length +
                Object.keys(g.dictionary || {}).length +
                (g.glossary || []).length +
                (g.useCases || []).length +
                (g.assets || []).length
            );
        }
        function persistAppState() {
            if (state.noPersist) return; // mode sans persistance : rien n'est écrit sur le poste
            if (!restoreCompleted) return; // restauration en cours ou échouée : la sauvegarde existante est protégée
            clearTimeout(persistTimer);
            persistTimer = setTimeout(async () => {
                try {
                    const cfg = collectPersistedConfig();
                    // La sauvegarde précédente n'est lue qu'UNE fois par session (archivage de
                    // secours) ; ensuite seule sa « richesse » est gardée en mémoire — relire tout
                    // l'état à chaque frappe rendait les écrans de gouvernance très lents.
                    if (!sessionBackupDone) {
                        sessionBackupDone = true;
                        try {
                            const prev = await idbGet('meta', 'appState');
                            _prevRichness = cfgRichness(prev);
                            if (prev) {
                                const list = (await idbGet('meta', 'appStateBackups')) || [];
                                list.unshift({ at: new Date().toISOString(), cfg: prev });
                                await idbPut('meta', 'appStateBackups', list.slice(0, 10));
                            }
                        } catch (e2) {}
                    }
                    if (cfgRichness(cfg) === 0 && _prevRichness > 0) {
                        console.warn("Sauvegarde ignorée : configuration vide alors qu'une sauvegarde non vide existe.");
                        return;
                    }
                    await idbPut('meta', 'appState', cfg);
                    updatePersistStatus();
                    _prevRichness = cfgRichness(cfg);
                    fsBackupWrite();
                } catch (e) {
                    console.error('Sauvegarde locale échouée', e);
                }
            }, 600);
        }
        function updatePersistStatus() {
            const heure = new Date().toLocaleTimeString('fr-FR');
            const persistStatusElement = el('persistStatus');
            if (persistStatusElement) persistStatusElement.textContent = 'Sauvegarde locale : ' + heure;
            const top = el('persistStatusTop');
            if (top) top.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Sauvegardé ${heure}`;
        }

        // Tables survivantes de la base disque (OPFS) alors que le stockage navigateur est vide :
        // bandeau de récupération dans ① Sources, réimport comme sources + re-sauvegarde.
        function renderOpfsRecovery() {
            const n = (window.__opfsOrphans || []).length;
            if (!n || el('opfsRecoveryBanner')) return;
            const grid = el('tablesGrid');
            if (!grid) return;
            const div = document.createElement('div');
            div.id = 'opfsRecoveryBanner';
            div.className =
                'col-span-full bg-amber-50 border-2 border-amber-300 rounded-xl p-4 text-sm text-amber-900 flex items-center gap-3 flex-wrap mb-3';
            div.innerHTML = `<strong>🛟 Données récupérables :</strong> ${n} table(s) ont survécu dans la base disque du moteur alors que le stockage du navigateur est vide. <button onclick="recoverOpfsTables(this)" class="bg-amber-600 hover:bg-amber-700 text-white font-bold px-3 py-1.5 rounded">Récupérer maintenant</button> <span class="text-xs">Réimportées comme sources (noms génériques à renommer), puis re-sauvegardées.</span>`;
            grid.parentNode.insertBefore(div, grid);
            const emptyStateSourcesElement = el('emptyStateSources');
            if (emptyStateSourcesElement) emptyStateSourcesElement.classList.add('hidden');
            showSuccess(`🛟 ${n} table(s) récupérable(s) détectée(s) — voir le bandeau dans ① Sources.`);
        }
        async function recoverOpfsTables(btn) {
            if (btn) btn.disabled = true;
            let done = 0;
            for (const dn of window.__opfsOrphans || []) {
                const tId = String(dn).replace(/^t_/, '');
                if (state.tables[tId]) continue;
                try {
                    state.tables[tId] = {
                        id: tId,
                        name: 'RECUPERE_' + (done + 1),
                        file: null,
                        type: 'extraction',
                        size: 0,
                        config: {},
                        headers: [],
                        columnsMeta: {},
                        status: 'loading'
                    };
                    state.pivotMode[tId] = 'none';
                    const table = state.tables[tId];
                    table.headers = await duckTableHeaders(tId);
                    table.sampleData = await duckSampleRows(tId, 6);
                    table.storage = 'table';
                    table.status = 'ready';
                    done++;
                    try {
                        await persistTableData(tId);
                    } catch (e2) {}
                } catch (e) {
                    console.warn('Récupération impossible pour', dn, e);
                    delete state.tables[tId];
                }
            }
            window.__opfsOrphans = [];
            const opfsRecoveryBannerElement = el('opfsRecoveryBanner');
            if (opfsRecoveryBannerElement) opfsRecoveryBannerElement.remove();
            renderTables();
            updateBaseTableSelect();
            populateQualTables();
            persistAppState();
            showSuccess(
                `🛟 ${done} table(s) récupérée(s) depuis la base disque — renommez-les, puis exportez un bundle par sécurité.`
            );
            if (btn) btn.disabled = false;
        }
        async function restoreSession() {
            try {
                const saved = await idbGet('meta', 'appState');
                if (saved && saved.governance) state.governance = normalizeGovernance(saved.governance);
                const keys = await idbKeys('tabledata');
                if (keys && keys.length) {
                    el('emptyStateSources').classList.add('hidden');
                    for (const key of keys) {
                        const rec = await idbGet('tabledata', key);
                        if (!rec) continue;
                        const tId = 'tb_' + generateId();
                        state.tables[tId] = {
                            id: tId,
                            name: rec.name,
                            file: null,
                            type: rec.type || 'extraction',
                            size: 0,
                            config: rec.config || { delim: '', enc: 'UTF-8' },
                            headers: [],
                            columnsMeta: {},
                            status: 'loading'
                        };
                        state.pivotMode[tId] = 'none';
                        renderTables();
                        try {
                            let headers;
                            if (rec.kind === 'files') {
                                state.tables[tId].files = (rec.blobs || []).map(
                                    (bl, i) => new File([bl], (rec.parts && rec.parts[i]) || rec.name + '_' + i)
                                );
                                state.tables[tId].parts = (rec.parts || []).slice();
                                state.tables[tId].size = (rec.blobs || []).reduce((a, b) => a + (b.size || 0), 0);
                                headers = await ingestFileTable(tId);
                            } else if (rec.kind === 'file') {
                                state.tables[tId].file = new File([rec.blob], rec.name);
                                state.tables[tId].size = rec.blob.size || 0;
                                headers = await ingestFileTable(tId);
                            } else if (rec.kind === 'pq') {
                                // Source optimisée : vue Parquet (hors mémoire), on conserve le type d'origine.
                                headers = await attachParquetView(tId, rec.buffer);
                                state.tables[tId].storage = 'parquet';
                                state.tables[tId].optimized = true;
                                state.tables[tId].pqSize = rec.buffer.byteLength || rec.buffer.length || 0;
                            } else {
                                headers = await ingestParquetIntoDuckDB(tId, rec.buffer);
                                state.tables[tId].type = rec.type === 'api' ? 'api' : 'extraction';
                            }
                            const table = state.tables[tId];
                            table.headers = headers;
                            table.sampleData = await duckSampleRows(tId, 6);
                            table.status = 'ready';
                        } catch (e) {
                            state.tables[tId].status = 'error';
                            const text = String(e.message || e);
                            // Cas d'un Parquet corrompu par l'ancien bug de tampon aliasé : message actionnable.
                            state.tables[tId].errorMsg = /TProtocol|Invalid data|parquet|thrift/i.test(text)
                                ? "Source optimisée illisible (fichier Parquet corrompu par une ancienne version) — rechargez la source depuis son fichier d'origine, puis ré-optimisez-la."
                                : 'Restauration échouée : ' + text;
                        }
                        renderTables();
                    }
                }
                if (saved) applyPersistedConfig(saved);
                try {
                    const stored = await idbGet('meta', 'qualityHistory');
                    if (Array.isArray(stored) && stored.length > (state.governance.qualityHistory || []).length)
                        state.governance.qualityHistory = stored;
                } catch (e2) {}
                try {
                    const snaps = await idbGet('meta', 'qrSnapshots');
                    if (Array.isArray(snaps)) qrSnapshots = snaps;
                } catch (e2) {}
                restoreCompleted = true; // la sauvegarde automatique ne démarre qu'une fois la restauration aboutie
                renderTables();
                updateBaseTableSelect();
                populateQualTables();
                if (keys && keys.length)
                    showSuccess(
                        `Session restaurée : ${keys.length} table(s) rechargée(s) depuis le stockage local` +
                            (saved && saved.savedAt
                                ? ` (sauvegarde du ${new Date(saved.savedAt).toLocaleString('fr-FR')})`
                                : '') +
                            '.'
                    );
                updatePersistStatus();
                getDB()
                    .then(() => {
                        if (window.__opfsOrphans && window.__opfsOrphans.length) renderOpfsRecovery();
                    })
                    .catch(() => {});
            } catch (e) {
                console.error('Restauration de session échouée', e);
                showError(
                    'Restauration de session échouée : ' +
                        String((e && e.message) || e) +
                        ' — votre sauvegarde locale est conservée intacte ; la sauvegarde automatique est suspendue pour cette session afin de ne rien écraser. Rechargez la page pour réessayer.'
                );
            }
        }

        document.addEventListener('DOMContentLoaded', () => {
            if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
            renderNav();
            restoreSession();
            restoreUpdateConfig();
            // L'assistant se propose de lui-même sur un outil vide — une seule fois, jamais ensuite.
            setTimeout(() => {
                try {
                    wizMaybeAutoOpen();
                } catch (e) {}
            }, 1200);
        });
