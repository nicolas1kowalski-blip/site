        // ======================= COUCHE SERVEUR : PERSISTANCE ET INGESTION CÔTÉ SERVEUR =======================
        // La version mono-fichier garde tout dans IndexedDB et ré-ingère les fichiers à chaque ouverture. Ici :
        //   • le magasin « meta » (configuration, gouvernance, sauvegardes de secours) devient /api/etat ;
        //   • les tables vivent dans la base DuckDB du serveur : au rechargement, on relit leurs métadonnées
        //     (/api/tables) et on repart sans rien renvoyer — ouverture instantanée, même avec des gigaoctets ;
        //   • l'optimisation Parquet et l'export Parquet se font sur le serveur, sans transiter par le navigateur.
        // Chaque remplacement passe par Studio.extend : le panneau Architecture montre ce que la couche change.
        const SERVEUR_SEUIL_VUE_CSV = 2 * 1024 * 1024 * 1024; // au-delà : vue sur le fichier, sinon table matérialisée

        function serveurValeurSerialisable(valeur) {
            if (typeof FileSystemHandle !== 'undefined' && valeur instanceof FileSystemHandle) return false;
            return true;
        }
        async function serveurDocumentsTables() {
            return (await serveurJson('GET', '/tables')) || [];
        }

        // ---- magasin « meta » → /api/etat ; magasin « tabledata » → /api/tables (métadonnées seulement) ----
        Studio.extend(
            'idbPut',
            () =>
                async function (magasin, cle, valeur) {
                    if (magasin === 'tabledata') return; // les données sont déjà sur le serveur (voir persistTableData)
                    if (!serveurValeurSerialisable(valeur)) return; // ex. poignée de dossier local : sans objet ici
                    await serveurJson('PUT', '/etat/' + encodeURIComponent(cle), { valeur });
                },
            { motif: 'état de l’application conservé sur le serveur' }
        );
        Studio.extend(
            'idbGet',
            () =>
                async function (magasin, cle) {
                    if (magasin === 'tabledata')
                        return (await serveurDocumentsTables()).find(document => document.name === cle);
                    const corps = await serveurJson('GET', '/etat/' + encodeURIComponent(cle));
                    return corps && !corps.absent ? corps.valeur : undefined;
                },
            { motif: 'lecture de l’état depuis le serveur' }
        );
        Studio.extend(
            'idbDel',
            () =>
                async function (magasin, cle) {
                    if (magasin === 'tabledata') {
                        // Suppression par nom (removeTable) : uniquement si la table n'existe plus dans l'état —
                        // un simple renommage (tables conçues) ne doit pas détruire la table du serveur.
                        for (const document of await serveurDocumentsTables()) {
                            if (document.name === cle && !state.tables[document.id]) {
                                await serveurRequete('DELETE', '/tables/' + encodeURIComponent(document.id));
                            }
                        }
                        return;
                    }
                    await serveurRequete('DELETE', '/etat/' + encodeURIComponent(cle));
                },
            { motif: 'suppression d’un document ou d’une table sur le serveur' }
        );
        Studio.extend(
            'idbKeys',
            () =>
                async function (magasin) {
                    if (magasin === 'tabledata') return (await serveurDocumentsTables()).map(document => document.name);
                    return serveurJson('GET', '/etat');
                },
            { motif: 'liste des clés depuis le serveur' }
        );
        Studio.extend(
            'idbClear',
            () =>
                async function (magasin) {
                    await serveurRequete('DELETE', magasin === 'tabledata' ? '/tables' : '/etat');
                },
            { motif: 'remise à zéro de l’espace de travail sur le serveur' }
        );

        // ---- fichiers déjà déposés : lecture depuis le serveur ----
        Studio.extend(
            'readFileAsArrayBuffer',
            base =>
                async function (fichier) {
                    if (!estFichierDistant(fichier)) return base.call(this, fichier);
                    return (await serveurRequete('GET', '/fichiers/' + encodeURIComponent(fichier.__distant))).arrayBuffer();
                },
            { motif: 'fichier distant lu depuis le serveur' }
        );
        Studio.extend(
            'readFileAsText',
            base =>
                async function (fichier) {
                    if (!estFichierDistant(fichier)) return base.call(this, fichier);
                    return (await serveurRequete('GET', '/fichiers/' + encodeURIComponent(fichier.__distant))).text();
                },
            { motif: 'fichier distant lu depuis le serveur' }
        );
        Studio.extend(
            'sniffFileEncoding',
            base =>
                async function (fichier) {
                    if (!estFichierDistant(fichier)) return base.call(this, fichier);
                    try {
                        const reponse = await serveurRequete('GET', '/fichiers/' + encodeURIComponent(fichier.__distant), {
                            entetes: { Range: 'bytes=0-' + (SERVEUR_TAILLE_SNIFF - 1) }
                        });
                        return sniffEncodingFromBytes(await reponse.arrayBuffer());
                    } catch (e) {
                        return null;
                    }
                },
            { motif: 'reniflage d’encodage sur les premiers octets du fichier distant' }
        );

        // ---- ingestion CSV : DuckDB natif n'a pas file_row_number ; le disque du serveur permet de matérialiser ----
        Studio.extend(
            'csvViewThreshold',
            () =>
                function () {
                    return SERVEUR_SEUIL_VUE_CSV;
                },
            { motif: 'tables matérialisées dans la base du serveur jusqu’à 2 Go' }
        );
        Studio.extend(
            'ingestCsvIntoDuckDB',
            () =>
                async function (tId) {
                    const table = state.tables[tId];
                    const { db, conn } = await getDB();
                    const nomTable = duckTableName(tId);
                    const nomVirtuel = 'src_' + tId;
                    if (!table.file)
                        throw new Error('Fichier source absent du serveur : rechargez la source depuis son fichier d’origine.');
                    await duckDropTable(tId);
                    await db.registerFileHandle(
                        nomVirtuel,
                        table.file,
                        window.duckdb.DuckDBDataProtocol.BROWSER_FILEREADER,
                        true
                    );
                    const lecture = `SELECT row_number() OVER () AS __rn, * FROM read_csv_auto(${sqlLiteral(nomVirtuel)}, header=true, all_varchar=true${csvReadClauses(table.config)})`;
                    const enVue = !!(table.file && table.file.size > csvViewThreshold());
                    const creer = async genre => {
                        await duckDropTable(tId);
                        await conn.query(`CREATE ${genre} ${sqlIdent(nomTable)} AS ${lecture}`);
                        table.storage = genre === 'VIEW' ? 'view' : 'table';
                    };
                    try {
                        await creer(enVue ? 'VIEW' : 'TABLE');
                    } catch (erreur) {
                        if (enVue) throw erreur;
                        await creer('VIEW'); // la lecture directe reste possible ; les erreurs de lecture seront réparées au premier scan
                    }
                    return duckTableHeaders(tId);
                },
            { motif: 'ingestion CSV adaptée à DuckDB natif (row_number, matérialisation)' }
        );
        Studio.extend(
            'ingestCsvMultiIntoDuckDB',
            () =>
                async function (tId) {
                    const table = state.tables[tId];
                    const { db, conn } = await getDB();
                    const nomTable = duckTableName(tId);
                    await duckDropTable(tId);
                    const nomsVirtuels = [];
                    for (let index = 0; index < table.files.length; index++) {
                        const nomVirtuel = 'src_' + tId + '_' + index;
                        await db.registerFileHandle(
                            nomVirtuel,
                            table.files[index],
                            window.duckdb.DuckDBDataProtocol.BROWSER_FILEREADER,
                            true
                        );
                        nomsVirtuels.push(nomVirtuel);
                    }
                    const liste = '[' + nomsVirtuels.map(nom => sqlLiteral(nom)).join(', ') + ']';
                    const creer = async genre => {
                        await duckDropTable(tId);
                        await conn.query(`
                            CREATE ${genre} ${sqlIdent(nomTable)} AS
                            SELECT row_number() OVER () AS __rn, *
                            FROM read_csv_auto(${liste}, header=true, all_varchar=true, union_by_name=true${csvReadClauses(table.config)})
                        `);
                        table.storage = genre === 'VIEW' ? 'view' : 'table';
                    };
                    try {
                        await creer('TABLE');
                    } catch (erreur) {
                        await creer('VIEW');
                    }
                    return duckTableHeaders(tId);
                },
            { motif: 'fusion multi-fichiers adaptée à DuckDB natif' }
        );
        Studio.extend(
            'runNoSpill',
            () =>
                async function (conn, fn) {
                    return fn(); // la mémoire et le débordement disque sont gérés par la configuration du serveur
                },
            { motif: 'pas de bridage mémoire côté navigateur' }
        );

        // ---- persistance des tables : métadonnées seulement, les données sont déjà dans la base du serveur ----
        function serveurDescriptionFichier(nomServeur, fichier) {
            return { nom: nomServeur, name: fichier.name, size: fichier.size || 0, lastModified: fichier.lastModified || 0 };
        }
        Studio.extend(
            'persistTableData',
            () =>
                async function (tId) {
                    if (state.noPersist) return;
                    const table = state.tables[tId];
                    if (!table || table.status !== 'ready') return;
                    try {
                        const document = {
                            id: tId,
                            name: table.name,
                            type: table.type,
                            config: table.config || {},
                            storage: table.storage || 'table',
                            size: table.size || 0,
                            headers: (table.headers || []).slice(),
                            srcModified: table.srcModified || null,
                            lastRefresh: table.lastRefresh || null,
                            xlsxSheet: table.xlsxSheet || null,
                            xlsxNote: table.xlsxNote || null,
                            encWhy: table.encWhy || '',
                            optimized: !!table.optimized,
                            pqSize: table.pqSize || null,
                            parts: (table.parts || []).slice()
                        };
                        if (Array.isArray(table.files) && table.files.length) {
                            document.fichiers = table.files.map((fichier, index) =>
                                serveurDescriptionFichier('src_' + tId + '_' + index, fichier)
                            );
                        } else if (table.file) {
                            const nomServeur = 'src_' + tId;
                            // Les classeurs Excel et JSON sont lus dans le navigateur puis chargés en NDJSON : on dépose
                            // aussi l'original, pour qu'une relecture après rechargement reste possible.
                            if (!estFichierDistant(table.file) && !/^(csv|txt)$/.test(table.type)) {
                                const { db } = await getDB();
                                await db.registerFileHandle(
                                    nomServeur,
                                    table.file,
                                    window.duckdb.DuckDBDataProtocol.BROWSER_FILEREADER,
                                    true
                                );
                            }
                            document.fichier = serveurDescriptionFichier(nomServeur, table.file);
                        }
                        await serveurJson('PUT', '/tables/' + encodeURIComponent(tId), document);
                        updatePersistStatus();
                    } catch (erreur) {
                        console.error('Persistance de table (serveur) échouée', erreur);
                    }
                },
            { motif: 'métadonnées de table enregistrées sur le serveur, données déjà dans la base' }
        );

        // ---- restauration : les tables sont reprises telles quelles dans la base du serveur ----
        Studio.extend(
            'restoreSession',
            () =>
                async function () {
                    let documents = [];
                    try {
                        const saved = await idbGet('meta', 'appState');
                        if (saved && saved.governance) state.governance = normalizeGovernance(saved.governance);
                        documents = await serveurDocumentsTables();
                        if (documents.length) el('emptyStateSources').classList.add('hidden');
                        for (const document of documents) {
                            const tId = document.id;
                            state.tables[tId] = {
                                id: tId,
                                name: document.name,
                                file: document.fichier ? fichierDistant(document.fichier) : null,
                                type: document.type || 'extraction',
                                size: document.size || 0,
                                config: document.config || { delim: '', enc: 'UTF-8' },
                                encWhy: document.encWhy || '',
                                headers: [],
                                columnsMeta: {},
                                status: 'loading',
                                storage: document.storage || 'table',
                                optimized: !!document.optimized,
                                pqSize: document.pqSize || 0,
                                srcModified: document.srcModified || null,
                                lastRefresh: document.lastRefresh || null,
                                xlsxSheet: document.xlsxSheet || undefined,
                                xlsxNote: document.xlsxNote || undefined
                            };
                            if (Array.isArray(document.fichiers) && document.fichiers.length) {
                                state.tables[tId].files = document.fichiers.map(fichierDistant);
                                state.tables[tId].parts = (document.parts || []).slice();
                            }
                            state.pivotMode[tId] = 'none';
                            renderTables();
                            const table = state.tables[tId];
                            try {
                                table.headers = await duckTableHeaders(tId);
                                table.sampleData = await duckSampleRows(tId, 6);
                                table.status = 'ready';
                            } catch (erreur) {
                                table.status = 'error';
                                table.errorMsg =
                                    'Table absente de la base du serveur (' +
                                    String(erreur.message || erreur) +
                                    ') — rechargez la source depuis son fichier d’origine.';
                            }
                            renderTables();
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
                        restoreCompleted = true;
                        renderTables();
                        updateBaseTableSelect();
                        populateQualTables();
                        if (documents.length)
                            showSuccess(
                                `Session restaurée depuis le serveur : ${documents.length} table(s) disponible(s) sans rechargement` +
                                    (saved && saved.savedAt
                                        ? ` (sauvegarde du ${new Date(saved.savedAt).toLocaleString('fr-FR')})`
                                        : '') +
                                    '.'
                            );
                        updatePersistStatus();
                    } catch (erreur) {
                        console.error('Restauration de session (serveur) échouée', erreur);
                        showError(
                            'Restauration de session échouée : ' +
                                String((erreur && erreur.message) || erreur) +
                                ' — la sauvegarde serveur est conservée intacte ; la sauvegarde automatique est suspendue pour cette session. Rechargez la page pour réessayer.'
                        );
                    }
                },
            { motif: 'restauration instantanée depuis la base du serveur (aucune ré-ingestion)' }
        );

        // ---- Parquet : produit sur le serveur ----
        Studio.extend(
            'optimizeSourceToParquet',
            () =>
                async function (tId, btn) {
                    const table = state.tables[tId];
                    if (!table || table.status !== 'ready') return;
                    if (btn) {
                        btn.disabled = true;
                        btn.textContent = '🗜️ …';
                    }
                    bgTaskStart(`Optimisation de "${table.name}" (conversion Parquet sur le serveur) en cours`);
                    try {
                        const resultat = await serveurJson('POST', '/tables/' + encodeURIComponent(tId) + '/optimiser');
                        table.storage = 'parquet';
                        table.optimized = true;
                        table.pqSize = resultat.taille;
                        renderTables();
                        await persistTableData(tId);
                        persistAppState();
                        updatePersistStatus();
                        bgTaskEnd(
                            `🗜️ "${table.name}" optimisée sur le serveur : ${(resultat.taille / 1048576).toFixed(1)} Mo en Parquet — les analyses seront bien plus rapides.`
                        );
                    } catch (erreur) {
                        bgTaskEnd();
                        showError('Optimisation impossible : ' + erreur.message);
                    } finally {
                        if (btn) {
                            btn.disabled = false;
                            btn.textContent = '🗜️ Optimiser';
                        }
                    }
                },
            { motif: 'conversion Parquet exécutée sur le serveur' }
        );
        Studio.extend(
            'exportTableParquet',
            () =>
                async function (tId) {
                    const reponse = await serveurRequete('POST', '/tables/' + encodeURIComponent(tId) + '/parquet');
                    return new Uint8Array(await reponse.arrayBuffer());
                },
            { motif: 'export Parquet produit sur le serveur' }
        );

        // ---- ce qui n'a plus de sens sur un serveur : dossier de secours local, OPFS, quota navigateur ----
        Studio.extend(
            'fsBackupDirPick',
            () =>
                async function () {
                    showSuccess(
                        'En version serveur, la configuration est conservée sur le serveur : la sauvegarde sur un dossier local n’est pas nécessaire. Pour partager, exportez un bundle.'
                    );
                },
            { motif: 'sauvegarde sur dossier local sans objet' }
        );
        Studio.extend('wipeOpfsData', () => async function () {}, { motif: 'pas de stockage OPFS côté navigateur' });
        Studio.extend(
            'fillStorageEstimate',
            () =>
                async function () {
                    try {
                        const sante = await serveurJson('GET', '/sante');
                        const storageEstimateElement = el('storageEstimate');
                        if (storageEstimateElement)
                            storageEstimateElement.textContent = `Serveur : ${sante.tables} table(s) dans DuckDB ${sante.duckdb} · ${sante.fichiers} fichier(s), ${(sante.octetsFichiers / 1048576).toFixed(1)} Mo · ${sante.requetesExecutees} requête(s) exécutée(s)`;
                    } catch (e) {}
                },
            { motif: 'volumes lus sur le serveur' }
        );
        Studio.extend(
            'updatePersistStatus',
            () =>
                function () {
                    const heure = new Date().toLocaleTimeString('fr-FR');
                    const persistStatusElement = el('persistStatus');
                    if (persistStatusElement) persistStatusElement.textContent = 'Sauvegarde serveur : ' + heure;
                    const top = el('persistStatusTop');
                    if (top)
                        top.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Sauvegardé sur le serveur ${heure}`;
                },
            { motif: 'libellé « sauvegardé sur le serveur »' }
        );
        Studio.extend(
            'renderGovShare',
            base =>
                function () {
                    return base
                        .apply(this, arguments)
                        .replace(
                            'Tout est sauvegardé automatiquement dans le navigateur',
                            'Tout est sauvegardé automatiquement sur le serveur'
                        )
                        .replace('Stockage local &amp; import', 'Stockage serveur &amp; import')
                        .replace('Stockage local & import', 'Stockage serveur & import');
                },
            { motif: 'libellés du centre de sauvegarde' }
        );
        Studio.extend(
            'renderBkStatusUx',
            base =>
                function () {
                    const resultat = base.apply(this, arguments);
                    const bkStatusUxElement = el('bkStatusUx');
                    if (bkStatusUxElement)
                        bkStatusUxElement.innerHTML = bkStatusUxElement.innerHTML.replace(
                            'Persistance locale active (IndexedDB)',
                            'Persistance sur le serveur active'
                        );
                    return resultat;
                },
            { motif: 'libellé de l’état de persistance' }
        );
