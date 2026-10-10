        // ======================= EXTRACTION : EXPORT EXCEL ET CONTRÔLE DES CLÉS =======================
        //
        // Un fichier CSV ne dit rien de lui-même. On le reçoit, on l'ouvre, et il faut se souvenir d'où
        // il vient, de ce qui avait été filtré, et de ce qu'on attendait. Trois jours plus tard, personne
        // ne sait plus si les 3 235 lignes sont les bonnes.
        //
        // L'export Excel règle cela en deux onglets :
        //   — « Extraction » : les données, telles que le CSV les aurait rendues ;
        //   — « Synthèse »   : d'où elles viennent, ce qui a été paramétré, et ce qui a été CONTRÔLÉ.
        //
        // Le contrôle, c'est l'autre moitié. On déclare une CLÉ sur l'extraction, et l'écran répond :
        // combien de lignes, combien de clés différentes, combien de lignes sans clé, et — quand une
        // liste de valeurs a servi de filtre — combien des valeurs demandées se retrouvent vraiment
        // dans le fichier, et lesquelles manquent.

        // Au-delà, Excel ne sait plus ouvrir le fichier : mieux vaut le dire avant de produire 40 Mo.
        const EXCEL_LIGNES_MAX = 1000000;
        // Dans la synthèse, on nomme quelques clés manquantes plutôt que de dire « il en manque 812 ».
        const CLES_MANQUANTES_MONTREES = 20;

        /** Les colonnes retenues comme clé de contrôle, dans l'ordre de sortie. */
        function advColonnesDeLaCle(spec) {
            const choisies = (spec && spec.cleDeSortie) || [];
            return (spec.columns || []).filter(c => choisies.includes(c.id));
        }
        function advBasculerLaCleDeSortie(identifiant) {
            const spec = state.advExtract;
            const choisies = (spec.cleDeSortie = spec.cleDeSortie || []);
            const rang = choisies.indexOf(identifiant);
            if (rang >= 0) choisies.splice(rang, 1);
            else choisies.push(identifiant);
            renderAdvExtract();
        }

        /** Le nom d'une colonne tel qu'il apparaît dans le fichier produit. */
        function advNomEnSortie(colonne) {
            return colonne.alias || colonne.col || '';
        }

        /**
         * Le contrôle des clés, mesuré sur le résultat déjà matérialisé.
         *
         * On ne refait pas l'extraction : on interroge la table qui vient d'être produite. Les nombres
         * décrivent donc exactement le fichier que l'on tient.
         */
        async function advControlerLesCles(identifiantDeLaTable, spec) {
            const { conn } = await getDB();
            const nom = sqlIdent(duckTableName(identifiantDeLaTable));
            const colonnes = advColonnesDeLaCle(spec);
            const lignes = Number(arrowResultToObjects(await conn.query(`SELECT COUNT(*)::BIGINT AS n FROM ${nom}`))[0].n);
            if (!colonnes.length) return { lignes, cleDeclaree: false };

            const morceaux = colonnes.map(c => `COALESCE(${sqlCleDeLien(sqlIdent(advNomEnSortie(c)))}, '')`);
            const cle = morceaux.length > 1 ? `concat_ws('§', ${morceaux.join(', ')})` : morceaux[0];
            const vide = colonnes.map(c => `${sqlCleDeLien(sqlIdent(advNomEnSortie(c)))} IS NULL`).join(' AND ');
            const mesure = arrowResultToObjects(
                await conn.query(`SELECT COUNT(DISTINCT ${cle})::BIGINT AS distinctes,
            COUNT(*) FILTER (WHERE ${vide})::BIGINT AS sansCle FROM ${nom}`)
            )[0];
            const distinctes = Number(mesure.distinctes);
            const sansCle = Number(mesure.sansCle);
            return {
                lignes,
                cleDeclaree: true,
                nomDeLaCle: colonnes.map(advNomEnSortie).join(' + '),
                distinctes,
                sansCle,
                // Deux lignes pour une même clé : ce n'est pas une anomalie en soi, mais il faut le savoir.
                enDouble: Math.max(0, lignes - sansCle - distinctes),
                attendues: await advControlerLesClesAttendues(nom, spec, cle)
            };
        }

        /**
         * Quand une liste de valeurs a servi de filtre, elle dit ce qu'on ATTENDAIT. On vérifie donc
         * que chaque valeur demandée se retrouve bien dans le fichier — c'est la question que l'on se
         * pose vraiment en recevant une extraction faite sur une liste.
         */
        async function advControlerLesClesAttendues(nomDeLaTable, spec, expressionDeLaCle) {
            if (typeof v12ListFilters !== 'function') return null;
            const listes = v12ListFilters(spec).filter(f => f.list && (f.list.mode || 'in') !== 'out');
            if (listes.length !== 1) return null;
            const filtre = listes[0];
            const cles = filtre.list.keys || [];
            if (cles.length !== 1) return null;
            // On compare les VALEURS, pas les colonnes : la liste filtre souvent la table de
            // relation (REL.AFF_ID) alors que le fichier sort l'identifiant de la table de départ
            // (dk_code_aff). Ce sont les mêmes valeurs — c'est par leur égalité que les tables se
            // rejoignent. Il faut en revanche une clé d'UNE SEULE colonne : une clé composée de
            // plusieurs colonnes n'aurait rien à comparer à une liste d'une seule valeur.
            const colonnesDeLaCle = advColonnesDeLaCle(spec);
            if (colonnesDeLaCle.length !== 1) return { impossible: true, nomDeLaListe: filtre.list.name };
            const colonneDeSortie = colonnesDeLaCle[0];
            const { conn } = await getDB();
            const table = v12ListTable(filtre);
            const valeur = sqlCleDeLien('l.' + sqlIdent(cles[0].lc));
            const presentes = `SELECT DISTINCT ${expressionDeLaCle} AS k FROM ${nomDeLaTable}`;
            const resultat = arrowResultToObjects(
                await conn.query(`WITH attendues AS (SELECT DISTINCT ${valeur} AS k FROM ${table} l WHERE ${valeur} IS NOT NULL),
            trouvees AS (${presentes})
            SELECT (SELECT COUNT(*) FROM attendues)::BIGINT AS demandees,
                   (SELECT COUNT(*) FROM attendues a WHERE EXISTS (SELECT 1 FROM trouvees t WHERE t.k = a.k))::BIGINT AS retrouvees`)
            )[0];
            const demandees = Number(resultat.demandees);
            const retrouvees = Number(resultat.retrouvees);
            let exemples = [];
            if (retrouvees < demandees) {
                exemples = arrowResultToObjects(
                    await conn.query(`WITH attendues AS (SELECT DISTINCT ${valeur} AS k FROM ${table} l WHERE ${valeur} IS NOT NULL),
                trouvees AS (${presentes})
                SELECT a.k AS k FROM attendues a WHERE NOT EXISTS (SELECT 1 FROM trouvees t WHERE t.k = a.k)
                ORDER BY 1 LIMIT ${CLES_MANQUANTES_MONTREES}`)
                ).map(l => String(l.k));
            }
            return {
                nomDeLaListe: filtre.list.name,
                compare: `${cles[0].lc} (fichier de liste) ↔ ${advNomEnSortie(colonneDeSortie)} (en sortie)`,
                demandees,
                retrouvees,
                manquantes: demandees - retrouvees,
                exemples
            };
        }

        /** Le paramétrage de l'extraction, mis à plat pour l'onglet de synthèse. */
        function advSyntheseDuParametrage(spec) {
            const nom = identifiant => (state.tables[identifiant] || {}).name || identifiant;
            const lignes = [];
            lignes.push(['Table de départ', nom(spec.baseId)]);
            const source = state.tables[spec.baseId];
            if (source && source.lastRows != null) lignes.push(['Lignes de la table de départ', Number(source.lastRows)]);
            lignes.push(['Jointures', spec.joinType === 'inner' ? 'Intersection' : 'Conserver tout']);
            if (spec.limit500) lignes.push(['Aperçu rapide', 'oui — limité à 500 lignes']);
            if (spec.dedup && spec.dedup.on)
                lignes.push(['Dédoublonnage', `oui — conserver la ${spec.dedup.keep === 'last' ? 'dernière' : '1re'} ligne`]);
            if (spec.group && spec.group.on)
                lignes.push(['Regroupement', `oui — ${(spec.group.aggs || []).length} agrégat(s)`]);
            return lignes;
        }

        /** Les colonnes en sortie, une ligne chacune, avec d'où elles viennent. */
        function advSyntheseDesColonnes(spec) {
            const lignes = [['Nom en sortie', 'Provient de', 'Transformation', 'Plusieurs valeurs', 'Clé de contrôle']];
            (spec.columns || []).forEach(c => {
                const reglage =
                    c.kind || c.tableId === spec.baseId ? '' : ADV_PLUSIEURS_VALEURS[advPlusieursValeurs(c, spec.baseId)] || '';
                lignes.push([
                    advNomEnSortie(c),
                    advColLabel(c),
                    ADV_TRANSFORMS[c.transform] || '',
                    reglage,
                    (spec.cleDeSortie || []).includes(c.id) ? 'oui' : ''
                ]);
            });
            return lignes;
        }

        /** Les liens empruntés : c'est par eux que les tables se rejoignent, il faut pouvoir les relire. */
        function advSyntheseDesLiens(spec) {
            const nom = identifiant => (state.tables[identifiant] || {}).name || identifiant;
            const tables = new Set();
            (spec.columns || []).forEach(c => {
                if (c.tableId && c.tableId !== spec.baseId) tables.add(c.tableId);
            });
            (spec.filters || []).forEach(f => {
                if (f.tableId && f.tableId !== spec.baseId) tables.add(f.tableId);
            });
            const lignes = [['Table liée', 'Chemin depuis la table de départ']];
            tables.forEach(identifiant => {
                const chemin = advCheminDuLien(spec.baseId, identifiant, '');
                lignes.push([
                    nom(identifiant),
                    chemin
                        ? chemin
                              .map(pas => {
                                  const colonnes = advColonnesDUnPas(pas);
                                  return `${nom(pas.de)}.${colonnes.colonneDepart} = ${nom(pas.vers)}.${colonnes.colonneArrivee}`;
                              })
                              .join('  puis  ')
                        : 'aucun chemin trouvé dans le modèle de données'
                ]);
            });
            return lignes.length > 1 ? lignes : null;
        }

        /** Les filtres, avec leur portée : c'est elle qui explique le nombre de lignes. */
        function advSyntheseDesFiltres(spec) {
            if (!(spec.filters || []).length) return null;
            const nom = identifiant => (state.tables[identifiant] || {}).name || identifiant;
            const lignes = [['Filtre', 'Portée']];
            spec.filters.forEach(f => {
                const libelle =
                    f.op === 'list' && f.list
                        ? `${nom(f.tableId)}.${f.col} dans la liste « ${f.list.name} » (${(f.list.rows || []).length} valeur(s))`
                        : `${nom(f.tableId)}.${f.col} ${ADV_OPS[f.op] || f.op}${f.op === 'empty' || f.op === 'notempty' ? '' : ` « ${f.val} »`}`;
                lignes.push([libelle, ADV_PORTEES_DE_FILTRE[advPorteeDuFiltre(f, spec.baseId)] || '']);
            });
            return lignes;
        }

        /** L'onglet de synthèse, assemblé. */
        function advFeuilleDeSynthese(spec, controle, combienDeLignes) {
            const bloc = [];
            const titre = texte => {
                bloc.push([]);
                bloc.push([texte]);
            };
            bloc.push(['SYNTHÈSE DE L’EXTRACTION']);
            bloc.push(['Produite le', new Date().toLocaleString('fr-FR')]);
            bloc.push(['Lignes dans le fichier', combienDeLignes]);

            titre('Paramétrage');
            advSyntheseDuParametrage(spec).forEach(l => bloc.push(l));

            titre('Colonnes en sortie');
            advSyntheseDesColonnes(spec).forEach(l => bloc.push(l));

            const liens = advSyntheseDesLiens(spec);
            if (liens) {
                titre('Liens empruntés');
                liens.forEach(l => bloc.push(l));
            }
            const filtres = advSyntheseDesFiltres(spec);
            if (filtres) {
                titre('Filtres');
                filtres.forEach(l => bloc.push(l));
            }

            titre('Contrôle des clés');
            if (!controle || !controle.cleDeclaree) {
                bloc.push(['Aucune clé de contrôle déclarée.']);
                bloc.push(['Cochez 🔑 sur une ou plusieurs colonnes pour obtenir le nombre de clés différentes.']);
            } else {
                bloc.push(['Clé de contrôle', controle.nomDeLaCle]);
                bloc.push(['Lignes', controle.lignes]);
                bloc.push(['Clés différentes', controle.distinctes]);
                bloc.push(['Lignes sans clé', controle.sansCle]);
                bloc.push(['Lignes en double sur la clé', controle.enDouble]);
                const a = controle.attendues;
                if (a && a.impossible) {
                    bloc.push([]);
                    bloc.push([
                        `Liste « ${a.nomDeLaListe} » : contrôle impossible — déclarez la clé de contrôle sur UNE SEULE colonne de sortie pour comparer la liste au fichier.`
                    ]);
                } else if (a) {
                    bloc.push([]);
                    bloc.push([`Liste « ${a.nomDeLaListe} »`]);
                    bloc.push(['Comparaison', a.compare]);
                    bloc.push(['Valeurs demandées', a.demandees]);
                    bloc.push(['Valeurs retrouvées dans le fichier', a.retrouvees]);
                    bloc.push(['Valeurs ABSENTES du fichier', a.manquantes]);
                    if (a.exemples.length) {
                        bloc.push(['Exemples de valeurs absentes', a.exemples.join(', ')]);
                    }
                }
            }
            return bloc;
        }

        /**
         * Produit le classeur Excel : les données dans un onglet, la synthèse dans l'autre.
         *
         * On s'appuie sur la table déjà matérialisée par la génération, plutôt que de rejouer la
         * requête : les deux onglets décrivent alors rigoureusement le même résultat.
         */
        async function advGenererExcel() {
            const requete = advCurrentSql();
            if (requete.err) return showError(requete.err);
            if (!requete.sql) return showError('Requête SQL vide.');
            const bouton = el('adv-excel');
            if (bouton) {
                bouton.disabled = true;
                bouton.textContent = 'Génération…';
            }
            const identifiant = 'xl_' + generateId();
            const spec = state.advExtract;
            try {
                const { conn } = await getDB();
                await conn.query(
                    `CREATE OR REPLACE TABLE ${sqlIdent(duckTableName(identifiant))} AS SELECT ROW_NUMBER() OVER () AS __rn, * FROM (${requete.sql}) q`
                );
                const entetes = await advColumnsOf(`SELECT * FROM ${sqlIdent(duckTableName(identifiant))}`);
                const controle = await advControlerLesCles(identifiant, spec);
                if (controle.lignes > EXCEL_LIGNES_MAX) {
                    showError(
                        `${controle.lignes.toLocaleString('fr-FR')} lignes : Excel n’en ouvre que ${EXCEL_LIGNES_MAX.toLocaleString('fr-FR')}. ` +
                            'Produisez le CSV, ou réduisez l’extraction.'
                    );
                    return;
                }
                const donnees = [entetes];
                await duckStreamRows(identifiant, 0, ligne => donnees.push(entetes.map(h => ligne[h])));
                const classeur = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(classeur, XLSX.utils.aoa_to_sheet(donnees), 'Extraction');
                XLSX.utils.book_append_sheet(
                    classeur,
                    XLSX.utils.aoa_to_sheet(advFeuilleDeSynthese(spec, controle, controle.lignes)),
                    'Synthèse'
                );
                XLSX.writeFile(classeur, `Extraction_${Date.now()}.xlsx`);
                const manquantes = controle.attendues && !controle.attendues.impossible ? controle.attendues.manquantes : 0;
                showSuccess(
                    `📗 Excel produit : ${controle.lignes.toLocaleString('fr-FR')} ligne(s), deux onglets.` +
                        (controle.cleDeclaree
                            ? ` ${Number(controle.distinctes).toLocaleString('fr-FR')} clé(s) différente(s).`
                            : '') +
                        (manquantes
                            ? ` ⚠️ ${manquantes.toLocaleString('fr-FR')} valeur(s) de la liste ne sont PAS dans le fichier.`
                            : '')
                );
            } catch (e) {
                showError('Export Excel impossible : ' + e.message);
            } finally {
                try {
                    await duckDropTable(identifiant);
                } catch (e2) {}
                if (bouton) {
                    bouton.disabled = false;
                    bouton.textContent = '📗 Générer l’Excel';
                }
            }
        }
