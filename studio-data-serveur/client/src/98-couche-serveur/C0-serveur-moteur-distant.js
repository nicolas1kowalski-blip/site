        // ======================= COUCHE SERVEUR : MOTEUR DE DONNÉES DISTANT =======================
        // Dans l'application mono-fichier, getDB() renvoie { db, conn } de DuckDB-Wasm : conn.query(sql) rend une
        // table Arrow, db.registerFile* met un fichier à disposition du moteur. Ici, le même contrat est servi
        // par l'API HTTP du serveur (serveur/routes) : le SQL s'exécute dans DuckDB natif, les fichiers sont
        // déposés une seule fois sur le serveur. Aucun autre module n'a besoin de savoir où tourne le moteur.
        const SERVEUR_API_RACINE = '/api';
        const SERVEUR_TAILLE_SNIFF = 65536;

        // Requête HTTP vers l'API : toute réponse non 2xx devient une Error portant le message du serveur,
        // pour que les détections d'erreurs de l'application (CSV, encodage…) continuent de fonctionner.
        async function serveurRequete(methode, chemin, options) {
            options = options || {};
            const entetes = Object.assign({}, options.entetes || {});
            let corps = options.corps === null ? undefined : options.corps;
            if (
                corps !== undefined &&
                options.json !== false &&
                !(corps instanceof Blob) &&
                !(corps instanceof ArrayBuffer) &&
                !ArrayBuffer.isView(corps) &&
                typeof corps !== 'string'
            ) {
                entetes['content-type'] = 'application/json';
                corps = JSON.stringify(corps);
            } else if (corps !== undefined && !entetes['content-type']) {
                entetes['content-type'] = 'application/octet-stream';
            }
            let reponse;
            try {
                reponse = await fetch(SERVEUR_API_RACINE + chemin, { method: methode, headers: entetes, body: corps });
            } catch (erreurReseau) {
                serveurSignalerEtat(false);
                throw new Error('Serveur injoignable : ' + (erreurReseau.message || erreurReseau));
            }
            serveurSignalerEtat(true);
            if (!reponse.ok) {
                let message = '';
                try {
                    message = (await reponse.json()).erreur || '';
                } catch (e) {}
                throw new Error(message || 'Erreur HTTP ' + reponse.status + ' sur ' + chemin);
            }
            return reponse;
        }
        async function serveurJson(methode, chemin, corps) {
            const reponse = await serveurRequete(methode, chemin, corps === undefined ? {} : { corps });
            if (reponse.status === 204) return undefined;
            return reponse.json();
        }

        // Résultat SQL au format attendu par l'application : schema.fields, itération ligne à ligne,
        // toArray(). Les lignes sont des objets simples (nom de colonne → valeur), comme après
        // arrowResultToObjects() ; les BIGINT arrivent déjà en chaînes, comme dans la version Wasm.
        class ResultatSqlDistant {
            constructor(colonnes, lignes) {
                this.schema = { fields: (colonnes || []).map(colonne => ({ name: colonne.nom, type: colonne.type })) };
                this.lignesBrutes = lignes || [];
                this.numRows = this.lignesBrutes.length;
            }
            objetDeLigne(ligne) {
                const objet = {};
                this.schema.fields.forEach((champ, index) => {
                    objet[champ.name] = ligne[index] === undefined ? null : ligne[index];
                });
                Object.defineProperty(objet, 'toJSON', { value: () => Object.assign({}, objet), enumerable: false });
                return objet;
            }
            *[Symbol.iterator]() {
                for (const ligne of this.lignesBrutes) yield this.objetDeLigne(ligne);
            }
            toArray() {
                return Array.from(this);
            }
        }

        // Lecture en flux (conn.send) : la réponse NDJSON est découpée ligne par ligne ; chaque paquet devient
        // un ResultatSqlDistant, ce que duckStreamRows() consomme comme un lot Arrow.
        async function* serveurFluxSql(sql) {
            const reponse = await serveurRequete('POST', '/sql/flux', { corps: { sql } });
            const lecteur = reponse.body.getReader();
            const decodeur = new TextDecoder();
            let reste = '';
            let colonnes = [];
            for (;;) {
                const { value, done } = await lecteur.read();
                if (done) break;
                reste += decodeur.decode(value, { stream: true });
                let fin;
                while ((fin = reste.indexOf('\n')) >= 0) {
                    const ligne = reste.slice(0, fin);
                    reste = reste.slice(fin + 1);
                    if (!ligne.trim()) continue;
                    const paquet = JSON.parse(ligne);
                    if (paquet.colonnes) colonnes = paquet.colonnes;
                    if (paquet.lignes && paquet.lignes.length) yield new ResultatSqlDistant(colonnes, paquet.lignes);
                }
            }
            if (reste.trim()) {
                const paquet = JSON.parse(reste);
                if (paquet.lignes && paquet.lignes.length)
                    yield new ResultatSqlDistant(paquet.colonnes || colonnes, paquet.lignes);
            }
        }

        function creerConnexionDistante() {
            return {
                query: async sql => {
                    const resultat = await serveurJson('POST', '/sql', { sql });
                    return new ResultatSqlDistant(resultat.colonnes, resultat.lignes);
                },
                send: async sql => serveurFluxSql(sql),
                close: async () => {}
            };
        }

        // Fichiers : un objet « fichier distant » ({ name, size, __distant: nom sur le serveur }) désigne un fichier
        // déjà déposé — après un rechargement de page, rien n'est renvoyé au serveur.
        function estFichierDistant(fichier) {
            return !!(fichier && typeof fichier === 'object' && fichier.__distant);
        }
        function fichierDistant(description) {
            return {
                name: description.name,
                size: description.size || 0,
                lastModified: description.lastModified || 0,
                __distant: description.nom
            };
        }
        const SERVEUR_FICHIERS_PERSISTANTS = /^(src_|pq_)/;
        function creerBaseDistante() {
            return {
                registerFileHandle: async (nom, fichier) => {
                    if (estFichierDistant(fichier) && fichier.__distant === nom) return;
                    await serveurRequete('PUT', '/fichiers/' + encodeURIComponent(nom), { corps: fichier, json: false });
                },
                registerFileText: async (nom, texte) => {
                    await serveurRequete('PUT', '/fichiers/' + encodeURIComponent(nom), { corps: String(texte), json: false });
                },
                registerFileBuffer: async (nom, octets) => {
                    await serveurRequete('PUT', '/fichiers/' + encodeURIComponent(nom), { corps: octets, json: false });
                },
                copyFileToBuffer: async nom =>
                    new Uint8Array(await (await serveurRequete('GET', '/fichiers/' + encodeURIComponent(nom))).arrayBuffer()),
                // Les fichiers sources et Parquet des tables sont conservés (les vues DuckDB les lisent) ;
                // seuls les fichiers d'échange (export, import, connecteurs, NDJSON) sont effacés.
                dropFile: async nom => {
                    if (SERVEUR_FICHIERS_PERSISTANTS.test(nom)) return;
                    try {
                        await serveurRequete('DELETE', '/fichiers/' + encodeURIComponent(nom));
                    } catch (e) {}
                }
            };
        }

        // État de la connexion, affiché dans l'en-tête (pastille) — voir C2-serveur-version.js.
        let serveurEnLigne = null;
        function serveurSignalerEtat(enLigne) {
            if (serveurEnLigne === enLigne) return;
            serveurEnLigne = enLigne;
            try {
                serveurRafraichirPastille();
            } catch (e) {}
        }

        // Amorçage : remplace le chargement de DuckDB-Wasm de l'en-tête d'origine. getDB() attend
        // window.__duckdbPromise et n'a pas changé.
        if (!window.duckdb) window.duckdb = { DuckDBDataProtocol: { BROWSER_FILEREADER: 2 } };
        window.__duckdbOpfs = true; // seuils « base adossée au disque » : le serveur a un vrai disque
        window.__duckdbPromise = (async () => {
            const sante = await serveurJson('GET', '/sante');
            window.__serveurSante = sante;
            return { db: creerBaseDistante(), conn: creerConnexionDistante(), serveur: sante };
        })().catch(erreur => {
            console.error('Serveur Studio Data injoignable', erreur);
            return { error: erreur };
        });
