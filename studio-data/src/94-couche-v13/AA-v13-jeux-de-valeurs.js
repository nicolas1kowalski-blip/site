        // ======================= V13 : JEUX DE VALEURS — LE CODE DEVIENT SON LIBELLÉ =======================
        //
        // Un fichier de gestion porte des codes : 01, 02, 03, « CTR_VIE », « TYP_A ». Le lecteur du
        // fichier extrait, lui, veut lire « Contrat d'assurance vie ». La correspondance est dans un
        // autre fichier, le JEU DE VALEURS — code, libellé, parfois le domaine auquel il appartient.
        //
        // Jusqu'ici il fallait, pour chaque code : déclarer un lien dans le modèle de données, puis
        // ajouter la colonne du libellé dans l'extraction. Avec vingt codes et plusieurs fichiers de
        // jeux de valeurs, cela fait vingt liens à déclarer pour une traduction mot à mot : c'est
        // fastidieux, et cela encombre le modèle de liens qui ne décrivent rien du métier.
        //
        // Ici, AUCUN LIEN n'est déclaré. Un jeu de valeurs se déclare UNE FOIS — quelle colonne porte
        // le code, laquelle porte le libellé — et l'application sait les repérer toute seule. Ensuite,
        // sur n'importe quelle colonne de l'extraction, « + libellé » cherche dans quel jeu de valeurs
        // ses valeurs se retrouvent, le dit, et ajoute la colonne du libellé. La traduction se fait par
        // une recherche sur la valeur, comme un dictionnaire : rien n'est joint, donc rien ne peut
        // multiplier les lignes.

        /** Au-delà, un fichier n'est pas un jeu de valeurs mais un fichier de données. */
        const V13_JV_LIGNES_MAX = 50000;
        /** Le repérage automatique, lui, se limite aux petits fichiers : il doit se tromper rarement. */
        const V13_JV_LIGNES_REPEREES_MAX = 20000;
        /** Un libellé est un texte ; un code est court. C'est ce qui les distingue à la lecture. */
        const V13_JV_LONGUEUR_DU_CODE = 40;
        /** En dessous, les valeurs d'une colonne ne sont manifestement pas celles de ce jeu de valeurs. */
        const V13_JV_TAUX_MINIMAL = 0.3;

        /** La déclaration d'un jeu de valeurs, nettoyée de ce qui n'existe plus dans le fichier. */
        function v13JeuDeValeurs(table) {
            const declaration = table && table.jeuDeValeurs;
            if (!declaration || !declaration.code || !declaration.libelle) return null;
            const entetes = table.headers || [];
            if (!entetes.includes(declaration.code) || !entetes.includes(declaration.libelle)) return null;
            return {
                code: declaration.code,
                libelle: declaration.libelle,
                domaine: declaration.domaine && entetes.includes(declaration.domaine) ? declaration.domaine : ''
            };
        }
        /** Toutes les sources déclarées comme jeux de valeurs, jeux temporaires compris. */
        function v13SourcesDesJeuxDeValeurs() {
            const sources = Object.values(state.tables).filter(t => t && t.status === 'ready');
            const temporaires = typeof v12TmpList === 'function' ? v12TmpList() : [];
            const vues = new Set();
            return [...sources, ...temporaires].filter(t => {
                if (!t || vues.has(t.id) || !v13JeuDeValeurs(t)) return false;
                vues.add(t.id);
                return true;
            });
        }
        /** Déclare — ou corrige — le jeu de valeurs porté par une source. */
        function v13DeclarerLeJeuDeValeurs(tableId, code, libelle, domaine) {
            const table = state.tables[tableId];
            if (!table) return null;
            table.jeuDeValeurs = { code, libelle, domaine: domaine || '' };
            if (!table.temp) {
                try {
                    persistAppState();
                } catch (e) {}
            }
            return v13JeuDeValeurs(table);
        }
        function v13RetirerLeJeuDeValeurs(tableId) {
            const table = state.tables[tableId];
            if (!table) return;
            delete table.jeuDeValeurs;
            if (!table.temp) {
                try {
                    persistAppState();
                } catch (e) {}
            }
            renderAdvExtract();
        }

        /**
         * Repère tout seul les fichiers qui SONT des jeux de valeurs.
         *
         * Un jeu de valeurs se reconnaît à sa forme : peu de lignes, peu de colonnes, une colonne
         * dont chaque valeur est unique et courte — le code —, et une colonne de texte plus long —
         * le libellé. Quand le code n'est unique qu'à l'intérieur d'un domaine (un seul fichier pour
         * tous les jeux de valeurs de l'entreprise), la colonne qui répète peu de valeurs est
         * proposée comme domaine.
         *
         * Une seule requête par fichier candidat, et seulement sur les petits fichiers.
         */
        async function v13RepererLesJeuxDeValeurs() {
            const candidates = [...Object.values(state.tables), ...(typeof v12TmpList === 'function' ? v12TmpList() : [])];
            const vues = new Set();
            const propositions = [];
            const { conn } = await getDB();
            for (const table of candidates) {
                if (!table || vues.has(table.id) || table.status !== 'ready') continue;
                vues.add(table.id);
                if (v13JeuDeValeurs(table)) continue;
                const entetes = (table.headers || []).filter(h => h !== '__rn');
                if (entetes.length < 2 || entetes.length > 8) continue;
                if (table.lastRows != null && Number(table.lastRows) > V13_JV_LIGNES_REPEREES_MAX) continue;
                try {
                    const proposition = await v13ExaminerUnFichier(conn, table, entetes);
                    if (proposition) propositions.push(proposition);
                } catch (e) {}
            }
            return propositions;
        }
        /**
         * Ce fichier a-t-il la forme d'un jeu de valeurs ?
         *
         * Le signal qui tranche n'est pas le nombre de lignes, c'est le LIBELLÉ : un libellé est du
         * texte écrit pour être lu — il porte des minuscules ou des espaces (« Assurance
         * automobile », « En cours »). Un code n'en porte pas (« VIE », « 01 », « AFF1203 »). Sans
         * ce signal, n'importe quel fichier de gestion à trois colonnes passait pour une
         * nomenclature : mesuré, un fichier d'affaires se proposait lui-même, « code NUM_AFFAIRE →
         * libellé CODE_PRODUIT ».
         */
        async function v13ExaminerUnFichier(conn, table, entetes) {
            const mesures = entetes.map(
                (h, rang) =>
                    `COUNT(DISTINCT ${sqlIdent(h)})::BIGINT AS d${rang}, ` +
                    `MAX(LENGTH(CAST(${sqlIdent(h)} AS VARCHAR)))::BIGINT AS l${rang}, ` +
                    `SUM(CASE WHEN CAST(${sqlIdent(h)} AS VARCHAR) LIKE '% %' ` +
                    `OR regexp_matches(CAST(${sqlIdent(h)} AS VARCHAR), '[a-zà-ÿ]') THEN 1 ELSE 0 END)::BIGINT AS h${rang}`
            );
            const res = arrowResultToObjects(
                await conn.query(
                    `SELECT COUNT(*)::BIGINT AS lignes, ${mesures.join(', ')} FROM ${sqlIdent(duckTableName(table.id))}`
                )
            )[0];
            const lignes = Number(res.lignes);
            if (!lignes || lignes > V13_JV_LIGNES_REPEREES_MAX) return null;
            const colonnes = entetes.map((h, rang) => ({
                nom: h,
                valeurs: Number(res['d' + rang]),
                longueur: Number(res['l' + rang] || 0),
                humaines: Number(res['h' + rang] || 0)
            }));
            // Le libellé : du texte écrit pour être lu, sur au moins la moitié des lignes.
            const libelle = colonnes
                .filter(c => c.humaines >= lignes / 2 && c.longueur >= 4)
                .sort((a, b) => b.longueur - a.longueur)[0];
            if (!libelle) return null;
            // Le code : court, et unique — soit en lui-même, soit à l'intérieur d'un domaine.
            const codes = colonnes
                .filter(c => c.nom !== libelle.nom && c.longueur <= V13_JV_LONGUEUR_DU_CODE && c.valeurs > 1)
                .sort((a, b) => v13AllureDuCode(b.nom) - v13AllureDuCode(a.nom) || a.longueur - b.longueur);
            const codeUnique = codes.find(c => c.valeurs === lignes);
            if (codeUnique)
                return {
                    tableId: table.id,
                    nom: table.name,
                    lignes,
                    code: codeUnique.nom,
                    libelle: libelle.nom,
                    domaine: ''
                };
            // Un seul fichier pour tous les jeux de valeurs de la maison : le code ne se répète
            // qu'une fois PAR DOMAINE. On cherche le couple qui rend chaque ligne unique — puis on
            // décide LEQUEL des deux est le code, car le moteur ne voit que deux colonnes qui se
            // répètent. Mesuré sur un fichier (DOMAINE, CODE, LIBELLE) : le premier couple venu
            // prenait DOMAINE pour le code et CODE pour le domaine, et plus rien ne se traduisait.
            const couples = [];
            for (const code of codes) {
                for (const domaine of colonnes) {
                    if (domaine.nom === code.nom || domaine.nom === libelle.nom) continue;
                    if (domaine.valeurs < 2 || domaine.valeurs >= lignes) continue;
                    const couple = Number(
                        arrowResultToObjects(
                            await conn.query(
                                `SELECT COUNT(DISTINCT (${sqlIdent(domaine.nom)}, ${sqlIdent(code.nom)}))::BIGINT AS n
                                 FROM ${sqlIdent(duckTableName(table.id))}`
                            )
                        )[0].n
                    );
                    if (couple === lignes) couples.push({ code, domaine, score: v13ScoreDuCouple(code, domaine) });
                }
            }
            if (!couples.length) return null;
            couples.sort((a, b) => b.score - a.score);
            return {
                tableId: table.id,
                nom: table.name,
                lignes,
                code: couples[0].code.nom,
                libelle: libelle.nom,
                domaine: couples[0].domaine.nom
            };
        }
        /** Les mots qui désignent un code, et ceux qui désignent un domaine. */
        const V13_NOM_DU_CODE = /(^|_)(CODE|CD|CLE|KEY|ID|NUM|REF|VALEUR)($|_)/;
        const V13_NOM_DU_DOMAINE = /(DOMAINE|TYPE|FAMILLE|CATEGORIE|CATEG|GROUPE|NOMENCLATURE|JEU|RUBRIQUE|LISTE)/;
        /** À quel point ce nom de colonne annonce un code plutôt qu'un domaine. */
        function v13AllureDuCode(nom) {
            const normalise = normColName(nom);
            return (V13_NOM_DU_CODE.test('_' + normalise + '_') ? 1 : 0) - (V13_NOM_DU_DOMAINE.test(normalise) ? 1 : 0);
        }
        /**
         * Lequel des deux est le code, lequel est le domaine ?
         *
         * La donnée d'abord : un domaine porte MOINS de valeurs différentes qu'il n'y a de codes
         * (douze domaines, trois cents codes). À égalité — et c'est fréquent sur un petit fichier —
         * les noms tranchent : « CODE » est un code, « DOMAINE » est un domaine.
         */
        function v13ScoreDuCouple(code, domaine) {
            const parLesValeurs = domaine.valeurs < code.valeurs ? 2 : domaine.valeurs > code.valeurs ? -2 : 0;
            return parLesValeurs + v13AllureDuCode(code.nom) - v13AllureDuCode(domaine.nom);
        }

        /**
         * Dans quel jeu de valeurs les valeurs de cette colonne se retrouvent-elles ?
         *
         * On mesure, on ne devine pas : la part des valeurs de la colonne qui existent comme code
         * dans chaque jeu de valeurs déclaré. Le mieux placé gagne, et le taux est affiché — « 1 »
         * et « 2 » se retrouvent dans n'importe quelle nomenclature, c'est au lecteur de trancher
         * quand deux jeux se valent.
         */
        async function v13ChercherLeJeuDeValeurs(tableId, colonne) {
            const jeux = v13SourcesDesJeuxDeValeurs();
            if (!jeux.length || !state.tables[tableId]) return [];
            const { conn } = await getDB();
            const trouves = [];
            for (const jeu of jeux) {
                const declaration = v13JeuDeValeurs(jeu);
                try {
                    const res = arrowResultToObjects(
                        await conn.query(`
                            WITH valeurs AS (
                                SELECT DISTINCT ${sqlCleDeLien('x.' + sqlIdent(colonne))} AS k
                                FROM ${sqlIdent(duckTableName(tableId))} x
                            ), codes AS (
                                SELECT DISTINCT ${sqlCleDeLien('j.' + sqlIdent(declaration.code))} AS k
                                FROM ${sqlIdent(duckTableName(jeu.id))} j
                            )
                            SELECT (SELECT COUNT(*) FROM valeurs WHERE k IS NOT NULL)::BIGINT AS valeurs,
                                   (SELECT COUNT(*) FROM valeurs v WHERE v.k IS NOT NULL
                                        AND EXISTS (SELECT 1 FROM codes c WHERE c.k = v.k))::BIGINT AS reconnues`)
                    )[0];
                    const valeurs = Number(res.valeurs);
                    let reconnues = Number(res.reconnues);
                    if (!valeurs || !reconnues) continue;
                    // Un seul fichier pour tous les jeux de valeurs de la maison : le code « 01 »
                    // ne veut pas dire la même chose selon le domaine. On cherche donc DANS QUEL
                    // domaine ces valeurs se retrouvent le mieux, et c'est celui-là que la colonne
                    // interrogera — sinon le libellé ramené serait celui d'un autre jeu.
                    let domaine = '';
                    let autresDomaines = [];
                    if (declaration.domaine) {
                        const parDomaine = arrowResultToObjects(
                            await conn.query(`
                                WITH valeurs AS (
                                    SELECT DISTINCT ${sqlCleDeLien('x.' + sqlIdent(colonne))} AS k
                                    FROM ${sqlIdent(duckTableName(tableId))} x
                                )
                                SELECT j.${sqlIdent(declaration.domaine)} AS domaine,
                                       COUNT(DISTINCT v.k)::BIGINT AS reconnues
                                FROM ${sqlIdent(duckTableName(jeu.id))} j
                                JOIN valeurs v ON ${sqlCleDeLien('j.' + sqlIdent(declaration.code))} = v.k
                                GROUP BY 1 ORDER BY 2 DESC, 1 ASC`)
                        );
                        if (!parDomaine.length) continue;
                        // À égalité, le premier dans l'ordre alphabétique : deux exécutions doivent
                        // donner le même fichier, toujours.
                        domaine = parDomaine[0].domaine == null ? '' : String(parDomaine[0].domaine);
                        reconnues = Number(parDomaine[0].reconnues);
                        const exAequo = parDomaine.filter(d => Number(d.reconnues) === reconnues);
                        if (exAequo.length > 1) autresDomaines = exAequo.slice(1).map(d => String(d.domaine));
                    }
                    const taux = reconnues / valeurs;
                    if (taux < V13_JV_TAUX_MINIMAL) continue;
                    trouves.push({
                        jeuId: jeu.id,
                        nom: jeu.name,
                        declaration,
                        valeurs,
                        reconnues,
                        taux,
                        domaine,
                        autresDomaines
                    });
                } catch (e) {}
            }
            trouves.sort((a, b) => b.taux - a.taux);
            return trouves;
        }

        // ---- Le SQL : la traduction se fait DANS la lecture de la colonne ----
        //
        // Première version : la colonne de libellé était une colonne à part (kind « jv »), dont
        // l'expression enveloppait celle du code. Sur une colonne venant d'une table liée, cela
        // donnait une sous-requête corrélée DANS une autre sous-requête corrélée, avec un
        // « ORDER BY … LIMIT 1 » au milieu : le moteur n'avait plus qu'à parcourir la grosse table
        // une fois de plus, en gardant tout en mémoire. Mesuré chez l'utilisateur : l'extraction
        // passait, et tombait en « Out of Memory » dès qu'on ajoutait UN libellé.
        //
        // Désormais la colonne de libellé est une colonne ORDINAIRE de la même table que le code —
        // même chemin, même mode, même lecture groupée. Seule sa VALEUR change : au lieu de la case
        // brute, on y met la recherche du libellé. La traduction voyage donc avec la lecture déjà
        // faite, sans une seule requête de plus.
        /** Cette colonne est-elle le libellé d'un code ? */
        function v13EstUnLibelle(colonne) {
            return !!(colonne && colonne.jvId && !colonne.kind);
        }
        /** La recherche du libellé, autour de la case qui porte le code. */
        function v13RechercheDuLibelle(colonne, caseDuCode) {
            const jeu = state.tables[colonne.jvId];
            const declaration = v13JeuDeValeurs(jeu);
            if (!declaration) return 'NULL';
            const conditionDuDomaine =
                declaration.domaine && colonne.domaine
                    ? ` AND ${sqlCleDeLien('j.' + sqlIdent(declaration.domaine))} = ${sqlCleDeLien(sqlLiteral(colonne.domaine))}`
                    : '';
            return (
                `(SELECT NULLIF(TRIM(CAST(j.${sqlIdent(declaration.libelle)} AS VARCHAR)), '')` +
                ` FROM ${sqlIdent(duckTableName(colonne.jvId))} j` +
                ` WHERE ${sqlCleDeLien('j.' + sqlIdent(declaration.code))} = ${sqlCleDeLien(caseDuCode)}${conditionDuDomaine}` +
                ` LIMIT 1)`
            );
        }
        Studio.extend(
            'advExpressionDeLaValeur',
            base =>
                function (colonne, caseBrute) {
                    if (!v13EstUnLibelle(colonne)) return base.apply(this, arguments);
                    // La transformation demandée porte sur le LIBELLÉ, pas sur le code : c'est le
                    // libellé que l'on met en majuscules, pas la clé qui sert à le retrouver.
                    return advTransformee(v13RechercheDuLibelle(colonne, caseBrute), colonne.transform);
                },
            { motif: 'le libellé d’un jeu de valeurs remplace la valeur du code, dans la même lecture' }
        );
        Studio.extend(
            'advColLabel',
            base =>
                function (c) {
                    if (!v13EstUnLibelle(c)) return base.apply(this, arguments);
                    const jeu = state.tables[c.jvId] || {};
                    const table = state.tables[c.tableId] || {};
                    return `🏷️ Libellé de ${table.name || '?'}.${c.col} — jeu de valeurs « ${jeu.name || '?'} »`;
                },
            { motif: 'une colonne de libellé se lit comme ce qu’elle est' }
        );

        // ---- L'écran ----
        v13State.jeuxDeValeurs = { propositions: null, enRecherche: false, message: '' };

        /** Cette colonne peut-elle recevoir son libellé ? Un code vient d'une colonne, pas d'un calcul. */
        function v13ColonneTraduisible(colonne) {
            return !!colonne && !colonne.kind && !colonne.jvId && !!colonne.col;
        }
        /** La colonne de libellé déjà posée pour ce code, s'il y en a une. */
        function v13LibelleDeLaColonne(colonne) {
            return (state.advExtract.columns || []).find(
                autre =>
                    v13EstUnLibelle(autre) &&
                    autre.tableId === colonne.tableId &&
                    autre.col === colonne.col &&
                    (autre.via || '') === (colonne.via || '')
            );
        }
        /**
         * Le choix du jeu de valeurs, sur la ligne de la colonne.
         *
         * C'était une 🏷️ grise dans la colonne des actions, entre le crayon et la croix : personne
         * ne pouvait deviner qu'elle rattachait un jeu de valeurs à cette donnée de sortie. C'est
         * maintenant un sélecteur nommé, sous la transformation — là où se règle déjà tout ce qui
         * concerne la VALEUR de la colonne.
         */
        function v13ChoixDuJeuDeValeursHtml(colonne, baseId) {
            if (!v13ColonneTraduisible(colonne)) return '';
            const jeux = v13SourcesDesJeuxDeValeurs();
            if (!jeux.length) return '';
            const pose = v13LibelleDeLaColonne(colonne);
            const choisi = pose ? pose.jvId : '';
            const option = (valeur, libelle) =>
                `<option value="${escapeHTML(valeur)}" ${valeur === choisi ? 'selected' : ''}>${escapeHTML(libelle)}</option>`;
            return (
                `<select onchange="v13ChangerLeJeuDeValeursDeLaColonne('${colonne.id}', this.value)" title="Ajouter à côté de ce code la colonne de son libellé, prise dans un jeu de valeurs. La correspondance se fait sur la valeur du code : aucun lien n’est déclaré, et le nombre de lignes ne change pas." class="mt-1 block w-full border p-1 rounded text-[10px] ${choisi ? 'border-amber-400 bg-amber-50 text-amber-900 font-bold' : 'border-slate-200 bg-white text-slate-500'}">` +
                option('', '🏷️ sans libellé') +
                jeux.map(jeu => option(jeu.id, '🏷️ ' + jeu.name)).join('') +
                '</select>'
            );
        }

        Studio.extend(
            'advReglagesDeColonneHtml',
            base =>
                function (colonne, baseId) {
                    return base.apply(this, arguments) + v13ChoixDuJeuDeValeursHtml(colonne, baseId);
                },
            { motif: 'le jeu de valeurs d’une colonne se choisit sur la ligne de cette colonne' }
        );
        /** L'outil « Jeux de valeurs » de la barre d'Extraire, posé par la couche des liens. */
        function v13PoserLOutilDesJeuxDeValeurs() {
            v13PoserUnOutil(
                'jeuxdevaleurs',
                '🏷️ Jeux de valeurs',
                'Déclarer les fichiers qui disent ce que veut dire un code. Ensuite, chaque colonne en sortie peut afficher son libellé — sans aucun lien.',
                v13SourcesDesJeuxDeValeurs().length,
                v13BlocDesJeuxDeValeursHtml()
            );
        }

        /**
         * Ajoute le libellé d'une colonne : on cherche le jeu de valeurs qui reconnaît ses valeurs,
         * et l'on pose la colonne juste après celle du code.
         */
        async function v13ChangerLeJeuDeValeursDeLaColonne(identifiant, jeuId) {
            const spec = state.advExtract;
            const colonne = (spec.columns || []).find(c => c.id === identifiant);
            if (!colonne) return;
            const posee = v13LibelleDeLaColonne(colonne);
            // « Pas de libellé » : la colonne du libellé s'en va, et le fichier retrouve sa forme.
            if (!jeuId) {
                if (posee) spec.columns = spec.columns.filter(c => c.id !== posee.id);
                renderAdvExtract();
                return;
            }
            const jeu = state.tables[jeuId];
            const declaration = v13JeuDeValeurs(jeu);
            if (!declaration) return showError('Ce fichier n’est plus déclaré comme jeu de valeurs.');
            // Le jeu est choisi par vous ; il reste à savoir ce qu'il reconnaît — et, si le fichier
            // porte plusieurs jeux, dans quel domaine ces codes se trouvent.
            let mesure = null;
            try {
                const trouves = await v13ChercherLeJeuDeValeurs(colonne.tableId, colonne.col);
                mesure = trouves.find(t => t.jeuId === jeuId) || null;
            } catch (e) {
                mesure = null;
            }
            const nouvelle = {
                id: posee ? posee.id : 'jv_' + generateId(),
                tableId: colonne.tableId,
                col: colonne.col,
                via: colonne.via || '',
                jvId: jeuId,
                domaine: (mesure && mesure.domaine) || '',
                alias: (posee && posee.alias) || advNomEnSortie(colonne) + '_LIBELLE',
                transform: (posee && posee.transform) || 'none'
            };
            if (posee) spec.columns[spec.columns.findIndex(c => c.id === posee.id)] = nouvelle;
            else spec.columns.splice(spec.columns.findIndex(c => c.id === identifiant) + 1, 0, nouvelle);
            renderAdvExtract();
            if (!mesure)
                return showError(
                    `« ${jeu.name} » ne reconnaît aucune valeur de « ${advNomEnSortie(colonne)} » : la colonne du libellé restera vide. Vérifiez le jeu de valeurs choisi.`
                );
            const pourcent = Math.round(mesure.taux * 100);
            const message =
                `🏷️ Libellé pris dans « ${mesure.nom} »${mesure.domaine ? `, domaine « ${mesure.domaine} »` : ''} : ` +
                `${mesure.reconnues} valeur(s) sur ${mesure.valeurs} reconnues (${pourcent} %).` +
                ((mesure.autresDomaines || []).length
                    ? ` ⚠️ Ces codes existent aussi dans le(s) domaine(s) ${mesure.autresDomaines.join(', ')} de ce fichier : vérifiez que « ${mesure.domaine} » est le bon.`
                    : '');
            if (pourcent < 100) showError(message + ' Les valeurs non reconnues sortiront sans libellé.');
            else showSuccess(message);
        }

        async function v13RepererLesJeuxDeValeursMaintenant() {
            v13State.jeuxDeValeurs.enRecherche = true;
            v13State.jeuxDeValeurs.message = '';
            renderAdvExtract();
            try {
                const propositions = await v13RepererLesJeuxDeValeurs();
                v13State.jeuxDeValeurs.propositions = propositions;
                v13State.jeuxDeValeurs.message = propositions.length
                    ? `${propositions.length} fichier(s) ressemblent à un jeu de valeurs.`
                    : 'Aucun fichier ne ressemble à un jeu de valeurs (peu de lignes, un code unique et court, un libellé). Déclarez-le à la main ci-dessous.';
            } catch (e) {
                v13State.jeuxDeValeurs.message = 'Repérage impossible : ' + ((e && e.message) || e);
            } finally {
                v13State.jeuxDeValeurs.enRecherche = false;
                renderAdvExtract();
            }
        }
        function v13AccepterLeJeuDeValeurs(tableId, code, libelle, domaine) {
            v13DeclarerLeJeuDeValeurs(tableId, code, libelle, domaine);
            v13State.jeuxDeValeurs.propositions = (v13State.jeuxDeValeurs.propositions || []).filter(
                p => p.tableId !== tableId
            );
            v13State.jeuxDeValeurs.message = `🏷️ « ${(state.tables[tableId] || {}).name} » est un jeu de valeurs. Le bouton 🏷️ de chaque colonne peut maintenant y chercher les libellés.`;
            renderAdvExtract();
        }
        function v13DeclarerALaMain() {
            const tableId = (el('v13-jv-table') || {}).value;
            const code = (el('v13-jv-code') || {}).value;
            const libelle = (el('v13-jv-libelle') || {}).value;
            const domaine = (el('v13-jv-domaine') || {}).value;
            if (!tableId || !code || !libelle)
                return showError('Choisissez le fichier, la colonne du code et celle du libellé.');
            if (code === libelle) return showError('Le code et le libellé ne peuvent pas être la même colonne.');
            v13AccepterLeJeuDeValeurs(tableId, code, libelle, domaine);
        }
        function v13ChangerLaTableDuJeuDeValeurs(tableId) {
            v13State.jeuxDeValeurs.tableChoisie = tableId;
            v13State.jeuxDeValeurs.ouvert = true;
            renderAdvExtract();
        }
        /** Le bloc « Jeux de valeurs », sous les sources reliées. */
        function v13BlocDesJeuxDeValeursHtml() {
            const etat = v13State.jeuxDeValeurs;
            const declares = v13SourcesDesJeuxDeValeurs();
            let html = `<div class="mt-3 pt-3 border-t border-slate-200">
                <div class="text-[11px] text-slate-600 mb-2"><b>🏷️ Jeux de valeurs</b> — les fichiers qui disent ce que veut dire un code.
                Déclarés une fois, le bouton 🏷️ de chaque colonne y cherche le libellé. <b>Aucun lien à déclarer.</b></div>`;
            if (declares.length)
                html += `<div class="mb-2">${declares
                    .map(table => {
                        const declaration = v13JeuDeValeurs(table);
                        return `<span class="inline-flex items-center gap-1 text-[10px] bg-amber-50 border border-amber-200 text-amber-900 rounded-full px-2 py-0.5 mr-1 mb-1">
                            🏷️ ${escapeHTML(table.name)} : ${escapeHTML(declaration.code)} → ${escapeHTML(declaration.libelle)}${declaration.domaine ? ' (par ' + escapeHTML(declaration.domaine) + ')' : ''}
                            <button onclick="v13RetirerLeJeuDeValeurs('${table.id}')" title="Ce fichier n’est pas un jeu de valeurs" class="text-amber-500 hover:text-red-600 font-bold">✕</button></span>`;
                    })
                    .join('')}</div>`;
            // La déclaration À LA MAIN d'abord : vous savez quel fichier est une nomenclature et
            // quelles colonnes portent le code et le libellé. Le repérage automatique n'est là que
            // pour celui qui découvre des fichiers qu'il n'a pas produits.
            html += v13JeuDeValeursALaMainHtml();
            html += `<div class="flex items-center gap-2 flex-wrap mt-2">
                <span class="text-[10px] text-slate-400">Vous ne savez pas lesquels le sont ?</span>
                <button onclick="v13RepererLesJeuxDeValeursMaintenant()" ${etat.enRecherche ? 'disabled' : ''}
                    class="text-[11px] font-bold rounded-lg px-2.5 py-1 border border-slate-300 bg-white text-slate-600 hover:border-amber-400 hover:text-amber-800 ${etat.enRecherche ? 'opacity-50' : ''}">
                    ${etat.enRecherche ? '⏳ Repérage…' : '🏷️ Repérer les jeux de valeurs'}</button>
            </div>`;
            if (etat.message) html += `<p class="text-[11px] text-slate-600 mt-2">${escapeHTML(etat.message)}</p>`;
            if (etat.propositions && etat.propositions.length)
                html += `<div class="mt-2 grid gap-1.5">${etat.propositions
                    .map(
                        p => `<div class="flex items-center justify-between gap-2 border border-amber-200 bg-amber-50/40 rounded-lg px-2.5 py-1.5">
                        <div class="text-[11px] text-slate-700"><b>${escapeHTML(p.nom)}</b> — ${v13Nombre(p.lignes)} ligne(s) :
                            code <b>${escapeHTML(p.code)}</b> → libellé <b>${escapeHTML(p.libelle)}</b>${p.domaine ? `, par domaine <b>${escapeHTML(p.domaine)}</b>` : ''}</div>
                        <button onclick="v13AccepterLeJeuDeValeurs('${p.tableId}', '${escapeHTML(p.code)}', '${escapeHTML(p.libelle)}', '${escapeHTML(p.domaine)}')"
                            class="shrink-0 text-[10px] font-bold rounded-full px-2.5 py-1 bg-amber-600 text-white hover:bg-amber-700">C’est un jeu de valeurs</button>
                    </div>`
                    )
                    .join('')}</div>`;
            return html + '</div>';
        }
        /** La déclaration à la main, pour les fichiers que le repérage ne reconnaît pas. */
        function v13JeuDeValeursALaMainHtml() {
            const tables = [
                ...Object.values(state.tables).filter(t => t && t.status === 'ready'),
                ...(typeof v12TmpList === 'function' ? v12TmpList() : [])
            ];
            if (!tables.length) return '';
            const choisie = v13State.jeuxDeValeurs.tableChoisie && state.tables[v13State.jeuxDeValeurs.tableChoisie];
            const tableId = choisie ? choisie.id : tables[0].id;
            const entetes = ((state.tables[tableId] || {}).headers || []).filter(h => h !== '__rn');
            const option = (valeur, libelle, selectionnee) =>
                `<option value="${escapeHTML(valeur)}" ${selectionnee ? 'selected' : ''}>${escapeHTML(libelle)}</option>`;
            return `<div class="flex items-end gap-2 flex-wrap bg-white border border-slate-200 rounded-lg p-2">
                    <label class="text-[10px] text-slate-500">Fichier
                        <select id="v13-jv-table" onchange="v13ChangerLaTableDuJeuDeValeurs(this.value)" class="block border border-slate-300 p-1.5 rounded text-xs bg-white">
                            ${tables.map(t => option(t.id, t.name + (t.temp ? ' (jeu temporaire)' : ''), t.id === tableId)).join('')}</select></label>
                    <label class="text-[10px] text-slate-500">Colonne du code
                        <select id="v13-jv-code" class="block border border-slate-300 p-1.5 rounded text-xs bg-white">
                            ${entetes.map(h => option(h, h, false)).join('')}</select></label>
                    <label class="text-[10px] text-slate-500">Colonne du libellé
                        <select id="v13-jv-libelle" class="block border border-slate-300 p-1.5 rounded text-xs bg-white">
                            ${entetes.map((h, rang) => option(h, h, rang === 1)).join('')}</select></label>
                    <label class="text-[10px] text-slate-500">Domaine (si un seul fichier porte plusieurs jeux)
                        <select id="v13-jv-domaine" class="block border border-slate-300 p-1.5 rounded text-xs bg-white">
                            ${option('', '— aucun —', true)}${entetes.map(h => option(h, h, false)).join('')}</select></label>
                    <button onclick="v13DeclarerALaMain()" class="text-xs font-bold rounded-lg px-3 py-1.5 bg-amber-600 text-white hover:bg-amber-700">🏷️ Déclarer</button>
                </div>`;
        }
