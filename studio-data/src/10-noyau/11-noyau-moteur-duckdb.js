        // ==========================================
        //  MOTEUR DE DONNÉES : DUCKDB-WASM
        // ==========================================
        // Chaque table chargée (fichier ou source dérivée d'une extraction) est répliquée dans une
        // vraie table DuckDB (WebAssembly). Les jointures/agrégations volumineuses s'exécutent alors
        // dans ce moteur colonnes au lieu de construire des Map JS contenant des tables entières.
        // Toutes les colonnes sont conservées en VARCHAR pour rester cohérentes avec le comportement
        // historique de l'appli, où toute valeur est manipulée comme du texte.
        let __dbQueue = Promise.resolve();
        function isTransientLockError(e) { return /unique_lock|not locked|Operation not permitted|being used by another|conflict|InvalidInputException.*lock/i.test(String((e && e.message) || e)); }
        async function getDB() {
            const result = await window.__duckdbPromise;
            if (!result || result.error) {
                throw new Error("Moteur de données DuckDB indisponible : " + (result?.error?.message || "échec de chargement (vérifiez la connexion internet)."));
            }
            // DuckDB-Wasm n'est pas réentrant sur une connexion : deux requêtes qui se chevauchent
            // déclenchent « unique_lock::unlock: not locked ». On enchaîne donc toutes les requêtes.
            if (result.conn && !result.conn.__serialized) {
                const raw = result.conn.query.bind(result.conn);
                result.conn.query = (sql) => { const r = __dbQueue.then(() => raw(sql)); __dbQueue = r.then(() => {}, () => {}); return r; };
                result.conn.__serialized = true;
            }
            return result;
        }

        const sqlIdent = name => '"' + String(name).replace(/"/g, '""') + '"';
        const sqlLiteral = val => "'" + String(val).replace(/'/g, "''") + "'";
        const duckTableName = tId => 't_' + tId;
        // Détecte un échec d'écriture du répertoire temporaire (spill disque) — fréquent sur les gros
        // fichiers lus à la demande quand le stockage temporaire du navigateur n'est pas inscriptible.
        function isSpillWriteError(e) { return /do not support writing|temp_directory|temporary directory|temporary file|failed to write|No space left/i.test(String((e && e.message) || e)); }
        // Exécute une requête ; si DuckDB échoue en voulant déborder sur disque, relance la MÊME
        // requête en mémoire pure (spill désactivé), puis restaure le réglage d'origine.
        async function queryResilient(conn, sql) {
            try { return await conn.query(sql); }
            catch (e) {
                if (!isSpillWriteError(e)) throw e;
                try { await conn.query("SET temp_directory=''"); } catch (e2) {}
                try { return await conn.query(sql); }
                finally { if (window.__duckTempDir) { try { await conn.query("SET temp_directory='" + window.__duckTempDir + "'"); } catch (e3) {} } }
            }
        }
        // Exécute une analyse SANS débordement disque. En contexte fichier local (file://) ou sur un
        // navigateur sans OPFS, DuckDB n'a AUCUN répertoire temporaire inscriptible : tout spill échoue
        // (« HTML FileReaders do not support writing »). On relève donc la limite mémoire et on désactive
        // le spill ; combiné à un jeu de travail réduit, l'opération tient en RAM et n'écrit jamais.
        async function runNoSpill(conn, fn) {
            let memSet = false;
            for (const lim of ['4GB', '3GB', '2GB', '1GB']) { try { await conn.query("SET memory_limit='" + lim + "'"); memSet = true; break; } catch (e) {} }
            try { await conn.query("SET temp_directory=''"); } catch (e) {}
            try { return await fn(); }
            finally {
                if (window.__duckTempDir) { try { await conn.query("SET temp_directory='" + window.__duckTempDir + "'"); } catch (e) {} }
                if (memSet) { try { if (window.__duckMemLimit) await conn.query("SET memory_limit='" + window.__duckMemLimit + "'"); else await conn.query("RESET memory_limit"); } catch (e) {} }
            }
        }

        function arrowResultToObjects(res) {
            const fields = res.schema.fields.map(f => f.name).filter(n => n !== '__rn');
            const out = [];
            for (const row of res) {
                const obj = {};
                fields.forEach(f => {
                    let v = row[f];
                    if (typeof v === 'bigint') v = v.toString();
                    obj[f] = (v === undefined) ? null : v;
                });
                out.push(obj);
            }
            return out;
        }

        async function duckDropTable(tId) {
            // Chaque suppression est indépendante : DROP TABLE échoue si l'objet est une VUE (et
            // inversement), il faut donc tenter les deux quoi qu'il arrive.
            try { const { conn } = await getDB(); try { await conn.query(`DROP TABLE IF EXISTS ${sqlIdent(duckTableName(tId))}`); } catch (e) {} try { await conn.query(`DROP VIEW IF EXISTS ${sqlIdent(duckTableName(tId))}`); } catch (e) {} } catch (e) { /* moteur jamais démarré */ }
        }

        async function duckTableHeaders(tId) {
            const { conn } = await getDB();
            const res = await conn.query(`SELECT * FROM ${sqlIdent(duckTableName(tId))} LIMIT 0`);
            return res.schema.fields.map(f => f.name).filter(n => n !== '__rn');
        }

        async function duckSampleRows(tId, n = 6) {
            const { conn } = await getDB();
            const res = await conn.query(`SELECT * EXCLUDE (__rn) FROM ${sqlIdent(duckTableName(tId))} LIMIT ${n}`);
            return arrowResultToObjects(res);
        }

        // Lit un fichier CSV/TXT directement depuis le disque avec DuckDB (le moteur fait sa propre
        // lecture par blocs) : aucun tableau JS contenant toutes les lignes n'est jamais construit ici.
        // Options de lecture CSV construites depuis la config de la source :
        //  - delim / encodage ; - guillemets (config.quote='none' => quote='' : les " au milieu d'un
        //    champ ne cassent plus la lecture) ; - ignore_errors pour sauter les lignes malformées.
        /* ---- Encodage : détecter AVANT de lire, plutôt que tâtonner après l'échec ----
           Le moteur attend de l'UTF-8. Un fichier Windows/ANSI ou UTF-16 le fait échouer, et
           l'ancienne réparation par essais successifs avait deux angles morts mesurés :
             — un fichier UTF-16 lu en latin-1 ne produit AUCUNE erreur : on obtenait une seule
               colonne nommée « ÿþI » et des octets NUL partout, source marquée prête ;
             — la réparation « ignorer les lignes fautives » sur un fichier ANSI conservait
               ZÉRO ligne : une table vide, marquée prête elle aussi.
           On lit donc les premiers octets et on tranche : marque d'ordre, présence d'octets NUL,
           puis validation UTF-8 stricte. À défaut, c'est du Windows-1252. */
        const ENC_SNIFF_BYTES = 65536;
        function sniffEncodingFromBytes(buf) {
            const b = new Uint8Array(buf);
            if (b.length >= 3 && b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF) return { enc: 'UTF-8', why: 'marque d\'ordre UTF-8' };
            if (b.length >= 2 && ((b[0] === 0xFF && b[1] === 0xFE) || (b[0] === 0xFE && b[1] === 0xFF))) return { enc: 'UTF-16', why: 'marque d\'ordre UTF-16' };
            // UTF-16 sans marque : un octet sur deux est nul sur un texte latin.
            let nul = 0; const n = Math.min(b.length, 4096);
            for (let i = 0; i < n; i++) if (b[i] === 0) nul++;
            if (n > 32 && nul / n > 0.2) return { enc: 'UTF-16', why: 'un octet sur deux est nul (UTF-16 sans marque d\'ordre)' };
            // Validation UTF-8 stricte : c'est elle qui distingue l'UTF-8 du Windows-1252.
            try { new TextDecoder('utf-8', { fatal: true }).decode(b); return { enc: 'UTF-8', why: 'octets valides en UTF-8' }; }
            catch (e) { return { enc: 'ISO-8859-1', why: 'octets invalides en UTF-8 — fichier Windows/ANSI' }; }
        }
        async function sniffFileEncoding(file) {
            if (!file || !file.slice) return null;
            try {
                const head = file.slice(0, Math.min(ENC_SNIFF_BYTES, file.size || ENC_SNIFF_BYTES));
                return sniffEncodingFromBytes(await readFileAsArrayBuffer(head));
            } catch (e) { return null; }
        }
        // Une lecture « réussie » peut être totalement fausse. On refuse donc les résultats qui
        // portent la signature d'un mauvais décodage plutôt que de les livrer.
        function ingestLooksWrong(headers, sample) {
            const hs = headers || [];
            if (!hs.length) return 'aucune colonne détectée';
            const txt = hs.join('|') + '|' + (sample || []).slice(0, 5).map(r => Object.values(r || {}).join('|')).join('|');
            if (/\u0000/.test(txt)) return 'octets nuls dans les données (fichier UTF-16 lu comme du texte simple)';
            if (/�/.test(txt)) return 'caractères de remplacement (encodage incorrect)';
            if (hs.length === 1 && /[\uFFFE\uFEFF]|ÿþ|þÿ/.test(hs[0])) return 'une seule colonne portant une marque d\'ordre (encodage incorrect)';
            // Mojibake classique : « Ã© » pour « é », « Ã¨ » pour « è »…
            if (/Ã[©¨ªàŽ¢«»¯]|â€™|â€œ/.test(txt)) return 'accents dégradés (fichier ANSI lu comme de l\'UTF-8)';
            return null;
        }

        function csvReadClauses(config) {
            config = config || {};
            let c = '';
            if (config.delim) c += `, delim=${sqlLiteral(config.delim)}`;
            if (config.enc === 'ISO-8859-1') c += `, encoding='latin-1'`;
            else if (config.enc === 'UTF-16') c += `, encoding='utf-16'`;
            if (config.quote === 'none') c += `, quote=''`;
            if (config.ignoreErrors) c += `, ignore_errors=true`;
            return c;
        }
        // Au-delà de ce seuil, un CSV n'est PAS copié dans le moteur : on crée une VUE qui lit le
        // fichier à la demande ("lecture directe"). La donnée reste dans le Blob du navigateur, hors
        // du tas WASM — c'est ce qui permet des fichiers de plusieurs millions de lignes sans OOM.
        // Seuil de bascule en "lecture directe" (vue). ADAPTATIF selon le moteur :
        //  - base OPFS (débordement disque possible) : on matérialise jusqu'à 400 Mo, c'est rapide et sûr ;
        //  - moteur purement en mémoire : on préfère la vue dès 40 Mo pour ne jamais saturer le tas WASM.
        const CSV_VIEW_THRESHOLD_DISK = 400 * 1024 * 1024;
        const CSV_VIEW_THRESHOLD_MEM = 40 * 1024 * 1024;
        function csvViewThreshold() { return window.__duckdbOpfs ? CSV_VIEW_THRESHOLD_DISK : CSV_VIEW_THRESHOLD_MEM; }
        const CSV_VIEW_THRESHOLD = 80 * 1024 * 1024; // compat (fusion multi-fichiers)
        async function ingestCsvIntoDuckDB(tId) {
            const table = state.tables[tId];
            const { db, conn } = await getDB();
            const tName = duckTableName(tId);
            const virtualName = 'src_' + tId;
            await duckDropTable(tId);
            try { if (db.dropFile) await db.dropFile(virtualName); } catch (e) {}
            await db.registerFileHandle(virtualName, table.file, window.duckdb.DuckDBDataProtocol.BROWSER_FILEREADER, true);
            const readExpr = (withFrn) => withFrn
                ? `SELECT file_row_number + 1 AS __rn, * EXCLUDE (file_row_number) FROM read_csv_auto(${sqlLiteral(virtualName)}, header=true, all_varchar=true, file_row_number=true${csvReadClauses(table.config)})`
                : `SELECT row_number() OVER () AS __rn, * FROM read_csv_auto(${sqlLiteral(virtualName)}, header=true, all_varchar=true${csvReadClauses(table.config)})`;
            const asView = (table.file && table.file.size > csvViewThreshold());
            const create = async (kind, withFrn) => { await duckDropTable(tId); await conn.query(`CREATE ${kind} ${sqlIdent(tName)} AS ${readExpr(withFrn)}`); };
            try {
                if (asView) { await create('VIEW', true); table.storage = 'view'; }
                else { await create('TABLE', true); table.storage = 'table'; }
            } catch (e) {
                // Repli ROBUSTE, quelle que soit l'erreur : on tente d'abord la lecture directe (vue),
                // qui ne matérialise rien — c'est le mode le plus sûr contre l'"Out of Memory". On ne
                // retente JAMAIS une matérialisation d'un gros fichier ici (ce serait un nouvel OOM).
                try {
                    await create('VIEW', true); table.storage = 'view';
                } catch (e2) {
                    // Dernier recours : moteur trop ancien pour file_row_number => table avec row_number().
                    await create('TABLE', false); table.storage = 'table';
                }
            }
            return duckTableHeaders(tId);
        }
        // Source multi-fichiers (même source découpée en plusieurs fichiers) : lecture unifiée.
        async function ingestCsvMultiIntoDuckDB(tId) {
            const table = state.tables[tId];
            const { db, conn } = await getDB();
            const tName = duckTableName(tId);
            await duckDropTable(tId);
            const vnames = [];
            for (let i = 0; i < table.files.length; i++) {
                const vn = 'src_' + tId + '_' + i;
                try { if (db.dropFile) await db.dropFile(vn); } catch (e) {}
                await db.registerFileHandle(vn, table.files[i], window.duckdb.DuckDBDataProtocol.BROWSER_FILEREADER, true);
                vnames.push(vn);
            }
            const list = '[' + vnames.map(v => sqlLiteral(v)).join(', ') + ']';
            // union_by_name : tolère des ordres/sous-ensembles de colonnes différents entre fichiers.
            const totalSize = table.files.reduce((a, f) => a + (f.size || 0), 0);
            const doCreate = async (kind) => {
                await duckDropTable(tId);
                await conn.query(`
                    CREATE ${kind} ${sqlIdent(tName)} AS
                    SELECT row_number() OVER () AS __rn, *
                    FROM read_csv_auto(${list}, header=true, all_varchar=true, union_by_name=true${csvReadClauses(table.config)})
                `);
            };
            try {
                // Les fusions volumineuses sont matérialisées si possible (le row_number d'une vue serait
                // recalculé à chaque requête) ; en cas de manque de mémoire, on tente quand même la vue.
                await doCreate('TABLE'); table.storage = 'table';
            } catch (e) {
                if (/memory|allocation/i.test(String(e.message || e)) || totalSize > CSV_VIEW_THRESHOLD) { await doCreate('VIEW'); table.storage = 'view'; }
                else throw e;
            }
            return duckTableHeaders(tId);
        }

        // Charge un tableau de lignes JS (API, XLSX déjà lu, ou résultat d'extraction) dans DuckDB.
        // Les valeurs sont pré-converties en texte pour que toutes les tables restent uniformément VARCHAR.
        async function ingestRowsIntoDuckDB(tId, rows, headers) {
            const { db, conn } = await getDB();
            const tName = duckTableName(tId);
            const virtualName = 'src_' + tId + '.ndjson';
            await duckDropTable(tId);
            if (rows.length === 0) {
                const cols = headers.length ? headers.map(h => `${sqlIdent(h)} VARCHAR`).join(', ') : '__empty VARCHAR';
                await conn.query(`CREATE TABLE ${sqlIdent(tName)} (__rn BIGINT${headers.length ? ', ' + cols : ''})`);
                return headers.slice();
            }
            // Filet de sécurité : si l'appelant n'a pas su fournir la liste des colonnes, on la
            // déduit des lignes elles-mêmes. Sans cela, chaque ligne se sérialisait en « {} » et
            // DuckDB, ne trouvant aucun objet à décrire, créait UNE colonne nommée « json » —
            // la table paraissait chargée mais était inutilisable.
            let cols = (headers || []).filter(h => h !== undefined && h !== null && String(h) !== '');
            if (!cols.length) {
                const seen = new Set();
                rows.forEach(r => { if (r && typeof r === 'object') Object.keys(r).forEach(k => seen.add(cleanHeader(k))); });
                cols = Array.from(seen);
            }
            if (!cols.length) throw new Error("Aucune colonne détectée dans cette source : le fichier ne contient pas de tableau de lignes exploitable (attendu : une ligne d'en-têtes puis des lignes de données).");
            try { if (db.dropFile) await db.dropFile(virtualName); } catch (e) {}
            const ndjson = rows.map(r => {
                const o = {};
                cols.forEach(h => { const v = r ? r[h] : null; o[h] = (v === undefined || v === null) ? null : String(v); });
                return JSON.stringify(o);
            }).join('\n');
            await db.registerFileText(virtualName, ndjson);
            // On impose le schéma au lieu de le faire deviner : les noms de colonnes sont
            // exactement ceux qu'on a calculés, et tout reste en VARCHAR comme partout ailleurs.
            const colSpec = '{' + cols.map(h => `${sqlLiteral(h)}: 'VARCHAR'`).join(', ') + '}';
            await conn.query(`
                CREATE TABLE ${sqlIdent(tName)} AS
                SELECT row_number() OVER () AS __rn, *
                FROM read_json(${sqlLiteral(virtualName)}, columns=${colSpec}, format='newline_delimited')
            `);
            const got = await duckTableHeaders(tId);
            // Garde-fou : si malgré tout on retombe sur la colonne « json », mieux vaut le dire
            // franchement que de livrer une table que rien ne saura exploiter.
            if (got.length === 1 && got[0] === 'json') throw new Error("Structure de source non reconnue : impossible d'en déduire des colonnes. Vérifiez que le fichier contient bien un tableau de lignes.");
            return got;
        }

        // Retrouve le tableau d'enregistrements dans un JSON : à la racine, sous un chemin
        // explicite (« data.items »), ou à défaut le premier tableau rencontré.
        function jsonRowsFrom(v, path) {
            if (path) { for (const seg of String(path).split('.').map(x => x.trim()).filter(Boolean)) { if (v == null || typeof v !== 'object') break; v = v[seg]; } }
            if (Array.isArray(v)) return v;
            if (v && typeof v === 'object') {
                const direct = Object.values(v).find(x => Array.isArray(x) && x.length && typeof x[0] === 'object');
                if (direct) return direct;
                const any = Object.values(v).find(Array.isArray);
                if (any) return any;
                return [v];   // un objet seul = une ligne
            }
            return [];
        }

        // Un classeur Excel a rarement une seule feuille, et la première est souvent une page de
        // garde ou un sommaire. Prendre SheetNames[0] sans le dire donnait une source vide ou
        // incohérente, sans que rien n'indique que les autres feuilles existaient.
        // On retient donc la feuille la plus fournie, et on garde la liste des autres pour le dire.
        function xlsxPickSheet(wb) {
            const names = (wb && wb.SheetNames) || [];
            if (!names.length) return { name: null, others: [], counts: {} };
            const counts = {};
            names.forEach(n => {
                try {
                    const ref = wb.Sheets[n] && wb.Sheets[n]['!ref'];
                    if (!ref) { counts[n] = 0; return; }
                    const r = XLSX.utils.decode_range(ref);
                    counts[n] = Math.max(0, (r.e.r - r.s.r)) * Math.max(1, (r.e.c - r.s.c + 1));
                } catch (e) { counts[n] = 0; }
            });
            let best = names[0];
            names.forEach(n => { if (counts[n] > counts[best]) best = n; });
            return { name: best, others: names.filter(n => n !== best), counts };
        }
        function xlsxSheetNote(pick, fileName) {
            if (!pick || !pick.others.length) return '';
            return `« ${fileName} » contient ${pick.others.length + 1} feuilles. La feuille « ${pick.name} » a été retenue (la plus fournie).`
                 + ` Non chargée(s) : ${pick.others.join(', ')}. Pour en charger une autre, dupliquez le fichier en ne gardant que la feuille voulue.`;
        }

        // Ingestion unifiée : lit le fichier (csv/txt/xlsx) ou reçoit des lignes déjà en mémoire (api/extraction)
        // et alimente la table DuckDB correspondante. Retourne la liste des colonnes.
        async function ingestFileTable(tId) {
            const table = state.tables[tId];
            // Source fusionnée (plusieurs fichiers = une même source)
            if (Array.isArray(table.files) && table.files.length) {
                const isCsvLike = f => /\.(csv|txt)$/i.test(f.name);
                const isXlsx = f => /\.(xlsx|xls)$/i.test(f.name);
                if (table.files.every(isCsvLike)) return ingestCsvMultiIntoDuckDB(tId);
                if (table.files.every(isXlsx)) {
                    const headersSet = new Set(); const rows = [];
                    for (const f of table.files) {
                        const buffer = await readFileAsArrayBuffer(f);
                        const wb = XLSX.read(new Uint8Array(buffer), { type: 'array' });
                        const pk = xlsxPickSheet(wb);
                        if (!pk.name) throw new Error(`« ${f.name} » ne contient aucune feuille.`);
                        const nt = xlsxSheetNote(pk, f.name); if (nt) table.xlsxNote = ((table.xlsxNote || '') + ' ' + nt).trim();
                        const raw = XLSX.utils.sheet_to_json(wb.Sheets[pk.name], { defval: "" });
                        raw.forEach(rr => { const c = {}; Object.keys(rr).forEach(k => { const ch = cleanHeader(k); headersSet.add(ch); c[ch] = rr[k]; }); rows.push(c); });
                    }
                    if (!rows.length) throw new Error("Fichiers vides");
                    return ingestRowsIntoDuckDB(tId, rows, Array.from(headersSet));
                }
                throw new Error("Fusion impossible : gardez le même format pour tous les fichiers (tous CSV/TXT, ou tous Excel).");
            }
            if (table.type === 'csv' || table.type === 'txt') {
                return ingestCsvIntoDuckDB(tId);
            } else if (table.type === 'xlsx' || table.type === 'xls') {
                const buffer = await readFileAsArrayBuffer(table.file);
                const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' });
                const pick = xlsxPickSheet(workbook);
                if (!pick.name) throw new Error("Ce classeur ne contient aucune feuille.");
                const rawJson = XLSX.utils.sheet_to_json(workbook.Sheets[pick.name], { defval: "" });
                table.xlsxSheet = pick.name; table.xlsxNote = xlsxSheetNote(pick, table.name);
                if (rawJson.length === 0) throw new Error(`La feuille « ${pick.name} » ne contient aucune ligne.`
                    + (pick.others.length ? ` Autres feuilles du classeur : ${pick.others.join(', ')}.` : ''));
                const headersSet = new Set();
                const rows = rawJson.map(r => { const c = {}; Object.keys(r).forEach(k => { const ch = cleanHeader(k); headersSet.add(ch); c[ch] = r[k]; }); return c; });
                return ingestRowsIntoDuckDB(tId, rows, Array.from(headersSet));
            } else if (table.type === 'json') {
                const txt = await readFileAsText(table.file);
                let parsed;
                try { parsed = JSON.parse(txt); } catch (e) { throw new Error("JSON illisible : " + e.message); }
                const rows = jsonRowsFrom(parsed, (table.config && table.config.path) || '');
                if (!rows.length) throw new Error("Aucune ligne trouvée dans ce JSON (attendu : un tableau d'objets, éventuellement imbriqué sous une clé).");
                const headSet = new Set();
                const flat = rows.map(r => {
                    const o = {};
                    if (r && typeof r === 'object' && !Array.isArray(r)) Object.keys(r).forEach(k => {
                        const ch = cleanHeader(k); headSet.add(ch);
                        const v = r[k];
                        o[ch] = (v !== null && typeof v === 'object') ? JSON.stringify(v) : v;
                    });
                    return o;
                });
                return ingestRowsIntoDuckDB(tId, flat, Array.from(headSet));
            }
            throw new Error("Type de fichier non pris en charge pour l'ingestion.");
        }

        // ---- Auto-réparation de lecture CSV ----
        // Les sources en « lecture directe » (vue) ne parcourent le fichier qu'à la demande : une
        // ligne malformée (guillemet non fermé au milieu d'un champ, etc.) n'éclate donc qu'au
        // premier scan complet — optimisation Parquet, audit, extraction. Quand ça arrive, on
        // re-tente automatiquement avec des options plus tolérantes, dans l'ordre le moins
        // destructif : quote='' (les " deviennent du texte brut, AUCUNE perte), puis
        // ignore_errors=true (les lignes malformées sont sautées).
        function isCsvScanError(e) { return /CSV Error|unterminated quote|Value with unterminated|read_csv/i.test(String((e && e.message) || e)); }
        // Erreur typique d'un fichier lu dans le mauvais encodage (octets non décodables en UTF-8).
        function isEncodingError(e) { return /invalid unicode|byte sequence mismatch|not valid utf-?8|invalid utf-?8|codepoint|encoding/i.test(String((e && e.message) || e)); }
        async function autoFixCsvRead(tId, err) {
            const t = state.tables[tId];
            if (!t || (!isCsvScanError(err) && !isEncodingError(err))) return false;
            const isCsvSource = (t.type === 'csv' || t.type === 'txt') || (Array.isArray(t.files) && t.files.length && t.files.every(f => /\.(csv|txt)$/i.test(f.name)));
            if (!isCsvSource) return false;
            t.config = t.config || {};
            const attempts = [];
            // D'abord l'encodage : une erreur unicode vient presque toujours d'un fichier Windows/ANSI.
            if (isEncodingError(err)) {
                // On relit les octets : ils désignent le bon encodage bien mieux qu'un ordre figé.
                // Sans cela, un fichier UTF-16 était « réparé » en latin-1 sans la moindre erreur.
                let first = null;
                try { const sn = await sniffFileEncoding(t.file); if (sn) first = sn.enc; } catch (e0) {}
                const encOrder = first ? [first, 'ISO-8859-1', 'UTF-16', 'UTF-8'] : ['ISO-8859-1', 'UTF-16', 'UTF-8'];
                const seen = new Set();
                encOrder.forEach(en => {
                    if (seen.has(en) || en === t.config.enc) return; seen.add(en);
                    attempts.push({ patch: { enc: en }, label: en === 'ISO-8859-1' ? 'encodage Windows/ANSI (Latin-1)' : (en === 'UTF-16' ? 'encodage UTF-16' : 'encodage UTF-8') });
                });
            }
            if (isCsvScanError(err)) {
            if (t.config.quote !== 'none') attempts.push({ patch: { quote: 'none' }, label: 'guillemets traités comme du texte brut (aucune perte)' });
            if (!t.config.ignoreErrors) attempts.push({ patch: { ignoreErrors: true }, label: 'lignes malformées ignorées' });
            if (t.config.quote !== 'none' && !t.config.ignoreErrors) attempts.push({ patch: { quote: 'none', ignoreErrors: true }, label: 'guillemets bruts + lignes malformées ignorées' });
            }
            const { conn } = await getDB();
            for (const a of attempts) {
                const prev = { ...t.config };
                Object.assign(t.config, a.patch);
                try {
                    const headers = await ingestFileTable(tId);
                    // Validation par un scan COMPLET en flux : c'est lui qui révèle les erreurs de vue.
                    const cnt = Number(arrowResultToObjects(await conn.query(`SELECT COUNT(*)::BIGINT AS n FROM ${sqlIdent(duckTableName(tId))}`))[0].n);
                    let smp = []; try { smp = await duckSampleRows(tId, 6); } catch (e2) {}
                    // Une lecture qui « passe » peut être totalement fausse : un fichier UTF-16 lu en
                    // latin-1 ne lève aucune erreur, et « ignorer les lignes fautives » peut ne rien
                    // conserver du tout. On refuse ces résultats au lieu de les livrer.
                    if (cnt === 0) { t.config = prev; continue; }
                    const wrong = ingestLooksWrong(headers, smp);
                    if (wrong) { t.config = prev; continue; }
                    t.headers = headers; t.sampleData = smp;
                    try { await persistTableData(tId); persistAppState(); } catch (e2) {}
                    renderTables();
                    const perte = a.patch && a.patch.ignoreErrors;
                    showSuccess(`⚙️ Lecture de « ${escapeHTML(t.name)} » réparée automatiquement : ${a.label}.`
                        + (perte ? ` ${cnt.toLocaleString('fr-FR')} ligne(s) conservée(s) — des lignes ont pu être écartées, vérifiez le total.` : ''));
                    return true;
                } catch (e2) { t.config = prev; }
            }
            // Aucun réglage n'a suffi : on restaure la lecture d'origine pour ne pas laisser la table cassée.
            try { await ingestFileTable(tId); } catch (e3) {}
            return false;
        }

        // Lit une table DuckDB par lots et appelle onRow pour chaque ligne — remplace la lecture
        // ligne-à-ligne historique (Papa/XLSX/tableau JS) tout en gardant le même contrat d'appel.
        async function duckStreamRows(tId, limit, onRow, onProgress) {
            const { conn } = await getDB();
            const tName = sqlIdent(duckTableName(tId));
            const countRes = await conn.query(`SELECT COUNT(*)::BIGINT AS n FROM ${tName}`);
            const total = Number(arrowResultToObjects(countRes)[0].n);
            const effectiveTotal = limit > 0 ? Math.min(limit, total) : total;
            if (!effectiveTotal) return;
            const limitSql = limit > 0 ? ` LIMIT ${effectiveTotal}` : '';
            // 1) Curseur natif (conn.send) : UN SEUL passage sur la donnée, par paquets Arrow — pas de
            //    tri, pas de relecture. Vital pour les sources en « lecture directe » (vue sur fichier).
            if (typeof conn.send === 'function') {
                try {
                    const reader = await conn.send(`SELECT * FROM ${tName}${limitSql}`);
                    let read = 0, fields = null;
                    for await (const batch of reader) {
                        if (!fields) fields = batch.schema.fields.map(f => f.name).filter(n => n !== '__rn');
                        for (const row of batch) {
                            const obj = {};
                            fields.forEach(f => { let v = row[f]; if (typeof v === 'bigint') v = v.toString(); obj[f] = (v === undefined) ? null : v; });
                            await onRow(obj);
                            read++;
                        }
                        if (onProgress) onProgress(Math.min(read, effectiveTotal), effectiveTotal || 1);
                        if (read >= effectiveTotal) break;
                    }
                    return;
                } catch (e) { console.warn('Curseur natif indisponible, repli par bornes :', e); }
            }
            // 2) Repli : pagination par borne (__rn > dernier lu) — jamais d'OFFSET (tri quadratique).
            const batchSize = 20000;
            let read = 0, lastRn = null;
            while (read < effectiveTotal) {
                const take = Math.min(batchSize, effectiveTotal - read);
                const where = lastRn === null ? '' : `WHERE __rn > ${lastRn}`;
                const res = await conn.query(`SELECT * FROM ${tName} ${where} ORDER BY __rn LIMIT ${take}`);
                const fields = res.schema.fields.map(f => f.name).filter(n => n !== '__rn');
                let got = 0;
                for (const row of res) {
                    lastRn = Number(row.__rn);
                    const obj = {};
                    fields.forEach(f => { let v = row[f]; if (typeof v === 'bigint') v = v.toString(); obj[f] = (v === undefined) ? null : v; });
                    await onRow(obj);
                    got++;
                }
                if (got === 0) break;
                read += got;
                if (onProgress) onProgress(read, effectiveTotal || 1);
            }
        }

