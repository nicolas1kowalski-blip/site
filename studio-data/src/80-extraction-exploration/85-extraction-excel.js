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
        // Au-delà, la mémoire d'un paramétrage pèserait plus que l'application : on ne compare alors
        // que les NOMBRES, et on le dit, au lieu de garder une liste que l'on ne saurait plus porter.
        const CLES_MEMORISEES_MAX = 20000;
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
        /** L'expression SQL de la clé de contrôle, à partir des colonnes cochées. */
        function advExpressionDeLaCle(colonnes) {
            const morceaux = colonnes.map(c => `COALESCE(${sqlCleDeLien(sqlIdent(advNomEnSortie(c)))}, '')`);
            return morceaux.length > 1 ? `concat_ws('§', ${morceaux.join(', ')})` : morceaux[0];
        }
        async function advControlerLesCles(identifiantDeLaTable, spec) {
            const { conn } = await getDB();
            const nom = sqlIdent(duckTableName(identifiantDeLaTable));
            const colonnes = advColonnesDeLaCle(spec);
            const lignes = Number(arrowResultToObjects(await conn.query(`SELECT COUNT(*)::BIGINT AS n FROM ${nom}`))[0].n);
            if (!colonnes.length) return { lignes, cleDeclaree: false };

            const cle = advExpressionDeLaCle(colonnes);
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
            let toutesLesManquantes = [];
            if (retrouvees < demandees) {
                // La liste COMPLÈTE : c'est elle qui sert, un onglet du classeur la porte. La
                // synthèse, elle, n'en nomme que quelques-unes pour rester lisible.
                toutesLesManquantes = arrowResultToObjects(
                    await conn.query(`WITH attendues AS (SELECT DISTINCT ${valeur} AS k FROM ${table} l WHERE ${valeur} IS NOT NULL),
                trouvees AS (${presentes})
                SELECT a.k AS k FROM attendues a WHERE NOT EXISTS (SELECT 1 FROM trouvees t WHERE t.k = a.k)
                ORDER BY 1`)
                ).map(l => String(l.k));
            }
            const exemples = toutesLesManquantes.slice(0, CLES_MANQUANTES_MONTREES);
            return {
                nomDeLaListe: filtre.list.name,
                compare: `${cles[0].lc} (fichier de liste) ↔ ${advNomEnSortie(colonneDeSortie)} (en sortie)`,
                demandees,
                retrouvees,
                manquantes: demandees - retrouvees,
                exemples,
                toutesLesManquantes
            };
        }

        // ---- La mémoire d'un paramétrage : comparer une extraction à la précédente -------
        //
        // La même extraction, rejouée la semaine suivante, doit pouvoir répondre : combien de
        // lignes en plus, combien de clés apparues, et surtout lesquelles ont DISPARU. Sans cela,
        // on compare deux fichiers à la main, et l'on ne voit que ce qu'on cherchait déjà.
        //
        // On ne garde que ce qu'un paramétrage peut raisonnablement porter : les nombres toujours,
        // et les clés tant qu'elles tiennent. Au-delà, on compare les nombres et on le dit.
        function advMemoireDesExtractions() {
            return (state.controlesDExtraction = state.controlesDExtraction || {});
        }
        /** Le paramétrage auquel rattacher la mémoire : celui qui a été chargé ou enregistré. */
        function advParametrageCourant() {
            const identifiant = state.advExtract && state.advExtract._paramId;
            if (!identifiant) return null;
            return (typeof epList === 'function' ? epList() : []).find(x => x.id === identifiant) || null;
        }
        /** Les clés présentes dans le résultat, pour les comparer à la prochaine exécution. */
        async function advClesDuResultat(nomDeLaTable, expressionDeLaCle) {
            const { conn } = await getDB();
            const lignes = arrowResultToObjects(
                await conn.query(`SELECT DISTINCT ${expressionDeLaCle} AS k FROM ${nomDeLaTable}
                    WHERE ${expressionDeLaCle} IS NOT NULL ORDER BY 1 LIMIT ${CLES_MEMORISEES_MAX + 1}`)
            ).map(l => String(l.k));
            return lignes.length > CLES_MEMORISEES_MAX
                ? { cles: null, tropNombreuses: true }
                : { cles: lignes, tropNombreuses: false };
        }
        /** Ce que l'on retient d'une exécution, pour la comparer à la suivante. */
        function advRetenirLExecution(controle, clesDuResultat) {
            const parametrage = advParametrageCourant();
            if (!parametrage) return;
            advMemoireDesExtractions()[parametrage.id] = {
                date: Date.now(),
                lignes: controle.lignes,
                distinctes: controle.cleDeclaree ? controle.distinctes : null,
                nomDeLaCle: controle.cleDeclaree ? controle.nomDeLaCle : null,
                cles: (clesDuResultat && clesDuResultat.cles) || null,
                tropNombreuses: !!(clesDuResultat && clesDuResultat.tropNombreuses)
            };
            try {
                persistAppState();
            } catch (e) {}
        }
        /**
         * La comparaison avec la fois précédente. Rien à comparer n'est pas un échec : c'est
         * simplement la première exécution de ce paramétrage, et on le dit.
         */
        function advComparerALaFoisPrecedente(controle, clesDuResultat) {
            const parametrage = advParametrageCourant();
            if (!parametrage) return { sansParametrage: true };
            const avant = advMemoireDesExtractions()[parametrage.id];
            if (!avant) return { premiereFois: true, nomDuParametrage: parametrage.name };
            const resultat = {
                nomDuParametrage: parametrage.name,
                datePrecedente: new Date(avant.date).toLocaleString('fr-FR'),
                lignesAvant: avant.lignes,
                lignesApres: controle.lignes,
                distinctesAvant: avant.distinctes,
                distinctesApres: controle.cleDeclaree ? controle.distinctes : null
            };
            const maintenant = (clesDuResultat && clesDuResultat.cles) || null;
            if (!avant.cles || !maintenant) {
                resultat.valeursIncomparables = true;
                resultat.pourquoi =
                    avant.tropNombreuses || (clesDuResultat && clesDuResultat.tropNombreuses)
                        ? `plus de ${CLES_MEMORISEES_MAX.toLocaleString('fr-FR')} clés : seuls les nombres sont comparés`
                        : 'aucune clé de contrôle n’était déclarée lors de l’une des deux exécutions';
                return resultat;
            }
            const anciennes = new Set(avant.cles);
            const nouvelles = new Set(maintenant);
            resultat.apparues = maintenant.filter(k => !anciennes.has(k));
            resultat.disparues = avant.cles.filter(k => !nouvelles.has(k));
            return resultat;
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

        /** L'onglet « Valeurs absentes » : la liste complète, pas cinq exemples. */
        function advFeuilleDesValeursAbsentes(controle) {
            const a = controle && controle.attendues;
            if (!a || a.impossible || !a.manquantes) return null;
            const bloc = [
                [`Valeurs demandées par la liste « ${a.nomDeLaListe} » et ABSENTES du fichier`],
                ['Comparaison', a.compare],
                ['Demandées', a.demandees],
                ['Retrouvées', a.retrouvees],
                ['Absentes', a.manquantes],
                [],
                ['Valeur absente']
            ];
            (a.toutesLesManquantes || []).forEach(v => bloc.push([v]));
            return bloc;
        }
        /** L'onglet « Comparaison » : ce qui a changé depuis la fois précédente. */
        function advFeuilleDeComparaison(comparaison) {
            if (!comparaison || comparaison.sansParametrage) return null;
            const bloc = [['COMPARAISON AVEC L’EXÉCUTION PRÉCÉDENTE']];
            if (comparaison.premiereFois) {
                bloc.push([`Paramétrage « ${comparaison.nomDuParametrage} »`]);
                bloc.push(['Première exécution enregistrée : rien à comparer pour l’instant.']);
                bloc.push(['La prochaine fois, cet onglet dira ce qui a changé.']);
                return bloc;
            }
            bloc.push(['Paramétrage', comparaison.nomDuParametrage]);
            bloc.push(['Exécution précédente', comparaison.datePrecedente]);
            bloc.push([]);
            bloc.push(['', 'Avant', 'Après', 'Écart']);
            const ecart = (a, b) => (a == null || b == null ? '' : b - a);
            bloc.push([
                'Lignes',
                comparaison.lignesAvant,
                comparaison.lignesApres,
                ecart(comparaison.lignesAvant, comparaison.lignesApres)
            ]);
            bloc.push([
                'Clés différentes',
                comparaison.distinctesAvant == null ? '—' : comparaison.distinctesAvant,
                comparaison.distinctesApres == null ? '—' : comparaison.distinctesApres,
                ecart(comparaison.distinctesAvant, comparaison.distinctesApres)
            ]);
            bloc.push([]);
            if (comparaison.valeursIncomparables) {
                bloc.push(['Clés apparues / disparues : non comparées — ' + comparaison.pourquoi]);
                return bloc;
            }
            bloc.push(['Clés APPARUES depuis la fois précédente', comparaison.apparues.length]);
            bloc.push(['Clés DISPARUES depuis la fois précédente', comparaison.disparues.length]);
            const colonne = (titre, valeurs) => {
                bloc.push([]);
                bloc.push([titre]);
                valeurs.forEach(v => bloc.push([v]));
            };
            if (comparaison.apparues.length) colonne('Apparues', comparaison.apparues);
            if (comparaison.disparues.length) colonne('Disparues', comparaison.disparues);
            return bloc;
        }
        /**
         * Le contrôle des clés AVANT de produire quoi que ce soit.
         *
         * Apprendre qu'il manque dix valeurs une fois le fichier envoyé ne sert à rien. On le
         * demande donc depuis le panneau Résultat, on mesure sur une table temporaire, et on
         * l'efface : rien n'est produit, rien n'est retenu.
         */
        async function advControlerLesClesMaintenant() {
            const boite = el('adv-controle-cles');
            const requete = advCurrentSql();
            if (requete.err) return showError(requete.err);
            if (boite) boite.innerHTML = '<p class="text-xs text-slate-400">Mesure des clés…</p>';
            const identifiant = 'ck_' + generateId();
            try {
                const { conn } = await getDB();
                await conn.query(
                    `CREATE OR REPLACE TABLE ${sqlIdent(duckTableName(identifiant))} AS SELECT * FROM (${requete.sql}) q`
                );
                const controle = await advControlerLesCles(identifiant, state.advExtract);
                if (boite) boite.innerHTML = advControleDesClesHtml(controle);
            } catch (e) {
                if (boite)
                    boite.innerHTML = `<p class="text-xs text-red-600">Contrôle impossible : ${escapeHTML(e.message)}</p>`;
            } finally {
                try {
                    await duckDropTable(identifiant);
                } catch (e2) {}
            }
        }
        /** Le verdict du contrôle, tel qu'il s'affiche sous les actions. */
        function advControleDesClesHtml(controle) {
            const nombre = n => Number(n).toLocaleString('fr-FR');
            if (!controle.cleDeclaree)
                return `<div class="v13-jointures"><p class="v13-jv">${nombre(controle.lignes)} ligne(s).</p>
                    <p class="v13-jd">Cochez 🔑 sur une colonne pour connaître le nombre de clés différentes — et, si un filtre « sur un fichier » est posé, les valeurs demandées qui manquent.</p>
                    </div>`;
            const a = controle.attendues;
            const alerte = !!(a && !a.impossible && a.manquantes);
            const lignes = [
                `<p class="v13-jv">${alerte ? '⚠️' : '✅'} ${nombre(controle.lignes)} ligne(s), ${nombre(controle.distinctes)} clé(s) différente(s) sur « ${escapeHTML(controle.nomDeLaCle)} ».</p>`,
                `<p class="v13-jd">${nombre(controle.sansCle)} ligne(s) sans clé · ${nombre(controle.enDouble)} ligne(s) en double sur la clé.</p>`
            ];
            if (a && a.impossible)
                lignes.push(
                    `<p class="v13-jd">Liste « ${escapeHTML(a.nomDeLaListe)} » : déclarez la clé sur UNE SEULE colonne pour comparer la liste au fichier.</p>`
                );
            else if (a)
                lignes.push(
                    `<p class="v13-jd ${a.manquantes ? 'fautive' : ''}">Liste « ${escapeHTML(a.nomDeLaListe)} » : ${nombre(a.demandees)} valeur(s) demandée(s), ${nombre(a.retrouvees)} retrouvée(s), <b>${nombre(a.manquantes)} absente(s)</b>${a.exemples.length ? ' — ' + escapeHTML(a.exemples.slice(0, 8).join(', ')) : ''}.</p>`
                );
            return `<div class="v13-jointures ${alerte ? 'multiplie' : ''}">${lignes.join('')}</div>`;
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
                // Les clés du résultat servent deux fois : à comparer avec la fois précédente,
                // et à être retenues pour la prochaine.
                const colonnesDeLaCle = advColonnesDeLaCle(spec);
                const clesDuResultat = colonnesDeLaCle.length
                    ? await advClesDuResultat(sqlIdent(duckTableName(identifiant)), advExpressionDeLaCle(colonnesDeLaCle))
                    : null;
                const comparaison = advComparerALaFoisPrecedente(controle, clesDuResultat);

                const classeur = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(classeur, XLSX.utils.aoa_to_sheet(donnees), 'Extraction');
                XLSX.utils.book_append_sheet(
                    classeur,
                    XLSX.utils.aoa_to_sheet(advFeuilleDeSynthese(spec, controle, controle.lignes)),
                    'Synthèse'
                );
                const absentes = advFeuilleDesValeursAbsentes(controle);
                if (absentes) XLSX.utils.book_append_sheet(classeur, XLSX.utils.aoa_to_sheet(absentes), 'Valeurs absentes');
                const feuilleComparaison = advFeuilleDeComparaison(comparaison);
                if (feuilleComparaison)
                    XLSX.utils.book_append_sheet(classeur, XLSX.utils.aoa_to_sheet(feuilleComparaison), 'Comparaison');
                XLSX.writeFile(classeur, `Extraction_${Date.now()}.xlsx`);
                advRetenirLExecution(controle, clesDuResultat);
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
